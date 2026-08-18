// 적 실루엣 분리 스윕 — `silhouette-after-outline` 처방(적 전용 다크 컨투어 + 접지 블롭)의
// 파라미터를 실측으로 고른다. 고블린(초록×초원 최악 케이스)을 고정 스폰해 적 사각형에서
//   cover  = 적 숨김/표시로 달라진 픽셀 비율(분리가 안 되면 여기부터 무너진다)
//   sepM   = 달라진 픽셀의 색거리 평균
//   sepR   = 사각형 전체 색거리 평균(면적×세기 종합 — 이걸 1지표로 본다)
// 을 잰다. 다크 컨투어 uniforms 는 라이브로 흔들 수 있어(값 객체 공유) 한 부팅에서 전 조합을 돈다.
// 사용: node tools/probe-enemy-sep-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?enemy=goblin', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.update = () => {};
        // 라이브 구간의 적은 죽는 중일 수 있다(probe-hitflash-ab 주석 참고) — 걷어내고 새로 스폰
        Scene3D.heroAttack = () => {};
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        let m = Scene3D.enemyMap.get(999);
        if (!m) return { err: 'enemyMap 에 3D 개체가 없다' };
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        m.g.userData.landed = true;

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();
        // 한 지점의 배경 운(어두운 덤불 앞이냐 밝은 초원 한복판이냐)이 파라미터 효과를 삼킨다 —
        // 배경 패치가 다른 3지점으로 옮겨 재고 평균한다.
        const XS = [1.25, 1.7, 2.2];
        const measureAt = (dx) => {
            m.g.position.set(Scene3D.heroG.position.x + dx, m.g.position.y, 0);
            if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
            // ⚠️ 접지 블롭은 scene 직속이라 적을 옮기면 발밑을 안 따라온다(추적은 죽여 둔 update 소관)
            if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);
            const box = new THREE.Box3().setFromObject(m.g);
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0) * dpr));
            const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0) * dpr));
            const ry = Math.max(0, ch - ryTop - rh);
            const readFrame = () => {
                Scene3D.renderFrame();
                const buf = new Uint8Array(rw * rh * 4);
                gl.readPixels(rx, ry, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                return buf;
            };
            const fg = readFrame();
            m.g.visible = false; if (m.blob) m.blob.visible = false;
            const bg = readFrame();
            m.g.visible = true; if (m.blob) m.blob.visible = true;
            let maskN = 0, sum = 0;
            for (let p = 0; p < rw * rh; p++) {
                const i = p * 4;
                const dr = fg[i] - bg[i], dg = fg[i + 1] - bg[i + 1], db = fg[i + 2] - bg[i + 2];
                const d = Math.sqrt((dr * dr + dg * dg + db * db) / 3) / 255;
                if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 14) { maskN++; sum += d; }
            }
            return { cover: maskN / (rw * rh), sepR: sum / (rw * rh), sepM: maskN ? sum / maskN : 0 };
        };
        const measure = () => {
            let c = 0, s = 0, sm = 0;
            for (const dx of XS) { const r = measureAt(dx); c += r.cover; s += r.sepR; sm += r.sepM; }
            return { cover: +(c / XS.length).toFixed(4), sepR: +(s / XS.length).toFixed(4), sepM: +(sm / XS.length).toFixed(4) };
        };
        const setRim = (str, pow) => {
            for (const u of Scene3D._rimUniforms) { u.uRimDarkStr.value = str; u.uRimDarkPow.value = pow; }
        };
        const rows = [];
        const push = (tag) => rows.push(Object.assign({ tag }, measure()));
        // 영점: 컨투어 완전 OFF / 현행 영웅값 / 후보들 — 레버별 실기여를 가른다
        for (const [str, pow] of [[0, 1.35], [0.88, 1.35], [0.98, 1.0], [0.98, 0.85], [0.98, 0.7], [1.0, 0.6]]) {
            setRim(str, pow);
            push(`contour ${str}/${pow} blob ${Scene3D.blobShadowFoeMat.opacity}`);
        }
        // 블롭 기여도 — 컨투어는 현행 ENEMY_RIM 로 두고 블롭만 흔든다 (0 = 블롭 없음)
        setRim(Scene3D.ENEMY_RIM.darkStrength, Scene3D.ENEMY_RIM.darkPower);
        for (const op of [0, 0.17, 0.26, 0.34]) {
            Scene3D.blobShadowFoeMat.opacity = op;
            push(`contour 현행 blob ${op}`);
        }
        Scene3D.blobShadowFoeMat.opacity = 0.26;
        // 알베도 명도 분리(비평가 5.5 채점 2번 '명도가 안 갈라진 게 근본 원인') — KIND_COLOR 를
        // 흔들어 **다시 스폰**해 잰다(색은 빌드 시점에 굽힌다). 마지막 변형이 남지 않게 원값 복원.
        const kc0 = Scene3D.KIND_COLOR.goblin;
        for (const hex of [kc0, 0x0e4a1c, 0x0a3a14, 0x114f33]) {
            Scene3D.KIND_COLOR.goblin = hex;
            Scene3D.clearEnemies();
            Scene3D.spawnEnemy(e);
            const m2 = Scene3D.enemyMap.get(e.id);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m2.g.userData.landed = true;
            m = m2;
            push(`albedo #${hex.toString(16)} (컨투어·블롭 현행)`);
        }
        Scene3D.KIND_COLOR.goblin = kc0;
        return { rows };
    });
    if (r.err) { console.log('FAIL ' + r.err); process.exit(1); }
    for (const w of r.rows) console.log(`${w.tag} → cover ${w.cover} sepR ${w.sepR} sepM ${w.sepM}`);
    if (errors.length) console.log('CONSOLE ERRORS: ' + errors.slice(0, 5).join(' | '));
    await browser.close();
})();
