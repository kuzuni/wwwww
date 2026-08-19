// 크리 접촉 프레임에 **적 발밑이 실제로 어두워지는가 · 그렇다면 무엇 때문인가** (hp-juicy 7차 잔여 ㉱)
// 사용: node tools/probe-crit-foot-ellipse.js   (종료코드 0 = '유령 지적'으로 판정된 경우)
//
// 배경: 7차 비평가 A #5 가 "크리 프레임 발밑에 검은 타원"이라고 했다. 항목 메모는 원인을
// **'넉백 더스트 데칼의 무조명 검정'으로 추정**하고 "실체 확인부터"라고 남겨 뒀다.
// 🚨 그 추정은 코드를 보면 이미 틀렸다 — 먼지(`expandRing`)는 **처치 경로(`killEnemy`)의 접지 순간**에만
//    돌고, 크리 타격 경로(`hitEnemy`)에는 지면 데칼이 아예 없다. 그래서 이 도구는 추정을 좇지 않고
//    ⑴ 어두워지긴 하는가 ⑵ 어두워진다면 무엇을 껐을 때 사라지는가 를 순서대로 묻는다.
//
// 하네스 규약(이 저장소가 반복해서 밟은 함정):
// ① **자 점검 먼저** — 잰 사각형이 정말 '적 발밑 지면'인가(적을 숨기면 그 위쪽이 변해야 한다).
// ② `gl.readPixels` 직독 · `update()` 를 돌리지 않고 접촉 프레임을 강제.
// ③ 귀속은 **A/B 토글**로 한다. '그럴듯한 범인'을 지목하고 끝내지 않는다 — 이 저장소는 같은 자리에서
//    섀도 프러스텀 가설을 실측으로 기각한 전력이 있다(지면 이음매 건).
// ④ **블롭·그림자는 다른 세션(`map-quality-up`)의 live 클레임 영역이다.** 이 도구는 **재기만** 하고
//    그쪽 코드는 건드리지 않는다(다른 슬러그로 같은 파일을 고치는 중복 함정 — TODO 규칙 7).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const DARK_MIN = 0.02;   // 크리 프레임 발밑이 '어두워졌다'고 볼 최소 평균 휘도 하락(0~1). 이 아래면 지적은 유령이다

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
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ DARK_MIN }) => {
        const out = { lines: [], ok: true, nums: {} };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        const note = m => out.lines.push('  · ' + m);

        Combat.tick = () => {};
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 1e9, maxHp: 1e9 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        if (!m) return { lines: ['FAIL enemyMap 에 3D 개체가 없다'], ok: false };
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        m.g.position.set(Scene3D.heroG.position.x + 1.7, 0, 0);
        m.g.userData.landed = true;
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
        if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();
        // 발밑 지면 사각형 — 적 발 높이(y=0) 주변의 지면만. 몸통이 안 들어오게 y 를 0 아래로만 잡는다.
        const px = m.g.position.x, pz = m.g.position.z;
        const c0 = Scene3D.project(new THREE.Vector3(px - 0.55, 0.0, pz));
        const c1 = Scene3D.project(new THREE.Vector3(px + 0.55, -0.02, pz + 0.55));
        const x0 = Math.min(c0.x, c1.x), x1 = Math.max(c0.x, c1.x);
        const y0 = Math.min(c0.y, c1.y), y1 = Math.max(c0.y, c1.y) + 16; // 아래로 조금 더
        const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.max(8, Math.round((x1 - x0) * dpr)));
        const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.max(8, Math.round((y1 - y0) * dpr)));
        const rect = { x: rx, y: Math.max(0, ch - (ryTop + rh)), w: rw, h: rh };
        const lumOf = () => {
            Scene3D.renderFrame();
            const b = new Uint8Array(rect.w * rect.h * 4);
            gl.readPixels(rect.x, rect.y, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, b);
            let s = 0;
            for (let i = 0; i < rect.w * rect.h; i++) s += (0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2]) / 255;
            return s / (rect.w * rect.h);
        };

        // ① 자 점검 — 이 사각형이 '적 발밑'인가. 적을 숨기면 값이 변해야 한다(발·블롭이 걸쳐 있으므로).
        const base = lumOf();
        const vis = m.g.visible; m.g.visible = false;
        const noEnemy = lumOf();
        m.g.visible = vis;
        out.nums.selfCheck = +Math.abs(noEnemy - base).toFixed(4);
        say(Math.abs(noEnemy - base) > 0.005, `자 점검: 사각형이 적 발밑을 담고 있다 (적 숨김 시 휘도 ${base.toFixed(4)} → ${noEnemy.toFixed(4)})`);
        if (!out.ok) { Scene3D.update = realUpdate; return out; }
        note(`측정 사각형 ${rect.w}×${rect.h}px · 대기 평균 휘도 ${base.toFixed(4)}`);

        // ② 크리 접촉 프레임 — 실제 경로로
        Scene3D.hitEnemy(999, 3e8, true, 'slash', false);
        realUpdate(1 / 60);
        const critLum = lumOf();
        const drop = base - critLum;
        out.nums.baseLum = +base.toFixed(4);
        out.nums.critLum = +critLum.toFixed(4);
        out.nums.drop = +drop.toFixed(4);
        note(`크리 접촉 프레임 평균 휘도 ${critLum.toFixed(4)} → 대기 대비 ${drop >= 0 ? '하락' : '상승'} ${Math.abs(drop).toFixed(4)}`);

        if (drop < DARK_MIN) {
            say(true, `ⓐ '발밑 검은 타원'은 관측되지 않는다 — 휘도 변화 ${(drop * 100).toFixed(2)}%p (어두워졌다고 볼 하한 ${(DARK_MIN * 100).toFixed(0)}%p 미만)`);
            note('→ 지적 ㉱ 는 이 자·이 조건에서는 재현되지 않는다. 고치려 들기 전에 조건을 먼저 좁힐 것.');
        } else {
            say(false, `ⓐ 발밑이 실제로 어두워진다 — 휘도 ${(drop * 100).toFixed(2)}%p 하락. 아래 귀속 결과를 볼 것`);
            // ③ 귀속 — 하나씩 꺼 보고 어두움이 사라지는지
            const tries = [];
            if (m.blob) {
                const v = m.blob.visible; m.blob.visible = false;
                tries.push(['접지 블롭', lumOf()]); m.blob.visible = v;
            }
            const rings = [];
            Scene3D.scene.traverse(o => { if (o.userData && (o.userData.impactRing || o.userData.impactSpike)) rings.push(o); });
            if (rings.length) {
                for (const o of rings) o.visible = false;
                tries.push([`접점 링/스파이크 ${rings.length}개`, lumOf()]);
                for (const o of rings) o.visible = true;
            }
            const sm = Scene3D.renderer.shadowMap.enabled;
            Scene3D.renderer.shadowMap.enabled = false;
            Scene3D.scene.traverse(o => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mt of ms) mt.needsUpdate = true; } });
            tries.push(['그림자맵', lumOf()]);
            Scene3D.renderer.shadowMap.enabled = sm;
            Scene3D.scene.traverse(o => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mt of ms) mt.needsUpdate = true; } });
            for (const [name, lum] of tries) note(`  귀속: ${name} 를 끄면 ${lum.toFixed(4)} (대기 ${base.toFixed(4)} 에 ${Math.abs(lum - base) < Math.abs(critLum - base) ? '가까워짐 ← 범인 후보' : '안 가까워짐'})`);
        }

        Scene3D.update = realUpdate;
        return out;
    }, { DARK_MIN });

    for (const l of r.lines) console.log(l);
    if (r.nums) console.log('nums=' + JSON.stringify(r.nums));
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(r.ok && !errors.length ? 0 : 1);
})();
