// 피격 몸 플래시가 **화면에** 남는가 + 적이 배경에서 **뜯기는가** — 렌더러 직독 A/B 하네스
// 사용: node tools/probe-hitflash-ab.js   (종료코드 0 = 통과)
//
// 배경(3D 인계 메모 ⓐⓑ): 일반 타격의 몸 플래시가 프레임에 안 남는다는 지적이 6차 채점에 있었고,
// 앞 세션이 처방을 시도했다가 **효과를 실측으로 못 세워 되돌렸다** — "재질 값은 확실히 움직이는데
// 화면이 안 움직인다". 그 판의 A/B 하네스가 고장난 채였고, 그걸로 '후보 3건 기각'이라는 틀린
// 결론까지 냈다. 그래서 이 하네스는 **자기 자신을 먼저 의심하는 순서**로 짰다.
//
// 2026-08-18 개정(`silhouette-after-outline`): 검은 인버티드 헐이 사용자 지시로 삭제되자
// ① 옛 자 점검(영역 평균 **휘도** Δ ≥ 0.08)이 멀쩡한 코드에서 무조건 실패하게 됐다 — 그 임계는
//    아웃라인이 있던 시절 값(Δ0.190)에 맞춰진 것이고, 지금 잰 Δ0.02~0.06 은 좌표계가 틀려서가
//    아니라 **적과 초원의 휘도가 실제로 겹쳐서**다(그게 바로 이 항목의 결함이다). 판정기가
//    '측정 불능'과 '분리 붕괴'를 같은 축으로 재니 결함이 게이트를 막았다.
// ② 그래서 두 검사를 **축부터 갈랐다**:
//    · 자 점검 = **마스크 커버리지**(적을 숨겼다 켜서 픽셀 단위로 달라진 비율). 좌표계·타이밍이
//      틀리면 사각형이 배경만 담아 커버리지가 0 대로 떨어진다 — 휘도가 겹쳐도 안 속는다.
//    · 분리도 = 마스크 화소의 **색거리 평균**(RGB 유클리드, 0~1). 휘도가 같아도 색상이 갈리면
//      점수가 나온다. **이 값이 곧 TODO 항목의 진척도다.**
//      실측(430×860, 고정 시드, 3지점 평균): 커버리지 **0.51** / 분리도 **0.177**. 게이트는
//      런 편차(±수%p)를 남기고 0.40 / 0.16 — 상시 분리는 처방 전후 이 지표가 거의 안 움직였고
//      (도로 배경에선 컨투어가 중립, 초원 배경 지점에서만 sepR +9~13%), **회귀 방지선**으로 건다.
//      아웃라인이 벌던 몫의 회복은 아래 ④ 플래시 조합 게이트가 잰다(그쪽이 3.5배 움직였다).
// ③ 적은 **?enemy=goblin 고정 + 깨끗한 개체를 새로 스폰**한다 — 종이 런마다 달라 같은 코드가
//    Δ0.02(고블린)와 Δ0.064(다른 종)를 오갔고, 부팅 후 1.5초의 라이브 전투 탓에 enemies[0] 이
//    **죽는 중인 개체**일 때가 있어(커버리지 30%↔8% 요동) 걷어내고 다시 만든다.
//    고블린(초록×초원)이 최악 케이스라 게이트는 그 종으로 건다.
// ④ 플래시 A/B 는 **게임이 실제로 겹쳐 쏘는 조합 그대로** 잰다 — hitEnemy 는 flashMesh 와
//    rimFlash 를 같은 프레임에 부른다. 아웃라인이 사라진 지금 flashMesh 단독은 몸 재질만 태워
//    Δ0.02~0.07 이 천장이고(옛 도구 주석 실측), 면적을 쥐는 쪽은 **BackSide 림 셸**이다.
//    flashMesh 만 재던 옛 게이트는 이제 화면에 없는 조합을 지키는 셈이라 조합 측정으로 바꿨다.
// ⑤ 픽셀은 `gl.readPixels` 로 **렌더러의 드로잉 버퍼에서 직접** 읽는다. 스크린샷 경로는
//    `project()`(캔버스 로컬)와 `screenshot clip`(뷰포트) 사이에 캔버스 y 오프셋이 끼어 어긋난다.
// ⑥ 플래시는 **피크 프레임을 강제로** 잡는다. flashMesh 는 addAnim 으로 감쇠하는데, 렌더 루프의
//    dt 는 `Math.min(0.1, …)` 라 소프트 렌더(프레임이 초 단위)에서는 **한 프레임에 0.1초가 지나
//    플래시가 통째로 끝난다**. update() 를 돌리지 않고 연출 직후에 renderFrame() 만 부른다.
// ⚠️ 초기 로드 대기를 45초로 잡는다 — 이 저장소는 병렬 세션이 여러 개 돌아 머신이 붐빌 때가 많고,
// 소프트 렌더(swiftshader) 부팅이 20초를 넘겨 **멀쩡한 코드가 TimeoutError 로 반려**되는 일이 잦다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const COVER_MIN = 0.40;  // 자 점검: 적 사각형에서 실제로 적이 덮은 픽셀 비율 하한 — 실측 0.51, 좌표계가 틀리면 0.0x
const SEP_MIN = 0.16;    // 분리도(마스크 색거리 평균) 하한 — 실측 0.177, 회귀 방지선
const WARM_MIN = 0.02;   // 크리(주황)와 일반(청백)의 R-B 격차 하한
const FLASH_MIN = 0.06;  // 일반 타격(flashMesh+rimFlash 조합)의 영역 휘도 상승 하한 — 6% 미만은 "안 보인다"

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    // 결정론적 월드 — 소품·풀 배치와 적 색 지터가 Math.random 에 걸려 있어 런마다 값이 흔들린다
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?enemy=goblin', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ COVER_MIN, SEP_MIN }) => {
        const out = { lines: [], ok: true };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };

        // 전투/렌더 루프를 세운다 — 이 하네스는 프레임을 **직접** 돌린다.
        Combat.tick = () => {};
        const realUpdate = Scene3D.update;
        Scene3D.update = () => {};

        // ⚠️ 라이브 구간의 적(enemies[0])을 그대로 재면 안 된다 — 부팅 후 1.5초 동안 영웅이 실제로
        // 싸워서, 표본 시점의 그 적은 **죽는 중이거나 이미 제거된 개체**일 수 있다(실측: 같은 코드가
        // 커버리지 30.2% ↔ 8.2% 를 오갔다). 전부 걷어내고 깨끗한 한 마리를 새로 스폰해 잰다.
        Scene3D.heroAttack = () => {}; // 동결 후 잔여 setTimeout발 공격 차단
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        if (!m) return { lines: ['FAIL enemyMap 에 3D 개체가 없다'], ok: false };
        if (m.kind !== 'goblin') return { lines: [`FAIL ?enemy=goblin 강제가 안 걸렸다 (kind=${m.kind})`], ok: false };
        // 스폰 연출(걸어 들어오기 등)을 즉시 완료하고 잔여 파티클을 걷는다
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;

        // 적을 화면 안 고정 위치로 옮긴다 — 스폰 x(3.1+)는 화면 밖(오른쪽 끝)이고,
        // 그러면 사각형이 배경만 담아 **모든 A/B 가 Δ0.0000 으로 나온다**(실제로 첫 판에서 겪었다).
        m.g.position.set(Scene3D.heroG.position.x + 1.7, 0, 0);
        m.g.userData.landed = true;
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
        // ⚠️ 접지 블롭은 scene 직속이라 적을 옮기면 **발밑을 안 따라온다**(추적은 죽여 둔 update 소관).
        // 같이 옮겨야 분리도가 블롭 몫(접지 어둠)을 포함해서 잰다 — 안 옮기면 블롭이 사각형 밖이다.
        if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();
        // 적의 화면 사각형 — project() 는 캔버스 로컬 좌표(=드로잉 버퍼와 같은 원점)를 준다.
        const rectAt = () => {
            const box = new THREE.Box3().setFromObject(m.g);
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            // CSS 픽셀 → 드로잉 버퍼 픽셀. readPixels 는 **아래가 원점**이라 y 를 뒤집는다.
            const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0) * dpr));
            const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0) * dpr));
            const ry = Math.max(0, ch - ryTop - rh);
            return { rx, ry, rw, rh };
        };
        const readFrame = (R) => {
            Scene3D.renderFrame();
            const buf = new Uint8Array(R.rw * R.rh * 4);
            gl.readPixels(R.rx, R.ry, R.rw, R.rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            return buf;
        };
        const meanOf = (buf, R) => {
            let sr = 0, sg = 0, sb = 0;
            for (let i = 0; i < R.rw * R.rh; i++) { sr += buf[i * 4]; sg += buf[i * 4 + 1]; sb += buf[i * 4 + 2]; }
            const n = R.rw * R.rh * 255;
            return { r: sr / n, g: sg / n, b: sb / n, lum: (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / n };
        };

        // ── ① 자 점검(커버리지) + 분리도 — 적을 숨겼다 켠 두 프레임을 픽셀 단위로 차분한다 ──
        // 한 지점의 배경 운(어두운 덤불 앞이냐 밝은 초원 한복판이냐)이 값을 ±10% 흔든다 —
        // 배경 패치가 다른 3지점으로 옮겨 재고 평균한다(스윕 도구와 같은 규약).
        const moveTo = (dx) => {
            m.g.position.set(Scene3D.heroG.position.x + dx, 0, 0);
            if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
            if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);
        };
        const sepAt = (dx) => {
            moveTo(dx);
            const R = rectAt();
            if (R.rw < 4 || R.rh < 4) return null;
            const fgF = readFrame(R);
            m.g.visible = false;
            if (m.blob) m.blob.visible = false;   // 접지 블롭은 몸의 일부로 센다 — 같이 숨겨 배경 프레임을 얻는다
            const bgF = readFrame(R);
            m.g.visible = true;
            if (m.blob) m.blob.visible = true;
            let maskN = 0, sepSum = 0;
            for (let p = 0; p < R.rw * R.rh; p++) {
                const i = p * 4;
                const dr = fgF[i] - bgF[i], dg = fgF[i + 1] - bgF[i + 1], db = fgF[i + 2] - bgF[i + 2];
                if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 14) {
                    maskN++;
                    sepSum += Math.sqrt((dr * dr + dg * dg + db * db) / 3) / 255;
                }
            }
            return {
                cover: maskN / (R.rw * R.rh), sep: maskN ? sepSum / maskN : 0,
                lumDelta: Math.abs(meanOf(fgF, R).lum - meanOf(bgF, R).lum), R,
            };
        };
        const XS = [1.25, 1.7, 2.2];
        const sepRows = XS.map(sepAt);
        if (sepRows.some(s => !s)) return { lines: ['FAIL 적 화면 사각형이 너무 작다'], ok: false };
        const cover = sepRows.reduce((a, s) => a + s.cover, 0) / XS.length;
        const sep = sepRows.reduce((a, s) => a + s.sep, 0) / XS.length;
        const lumDelta = sepRows.reduce((a, s) => a + s.lumDelta, 0) / XS.length; // 옛 지표 — 추이 비교용으로만 찍는다
        say(cover >= COVER_MIN,
            `자 점검(커버리지): 적 숨김/표시로 달라진 픽셀 3지점 평균 ${(cover * 100).toFixed(1)}% ≥ ${COVER_MIN * 100}% `
            + `— 사각형 ${sepRows.map(s => `${s.R.rw}×${s.R.rh}@(${s.R.rx},${s.R.ry})`).join(' · ')}`);
        if (cover < COVER_MIN) {
            out.lines.push('  ↑ 좌표계·렌더 타이밍이 틀렸다는 뜻이다. **여기서 멈춘다** — 이 상태의 A/B 판정은 전부 무의미하다.');
            return out;
        }
        say(sep >= SEP_MIN,
            `분리도(고블린×초원 최악 케이스): 마스크 색거리 평균 ${sep.toFixed(4)} ≥ ${SEP_MIN} `
            + `(참고 — 옛 영역 휘도Δ ${lumDelta.toFixed(4)}, 아웃라인 시절 0.190 / 삭제 직후 0.020)`);

        // ── 플래시 측정 준비: 기준 지점으로 복귀 ──
        moveTo(1.7);
        const R = rectAt();

        // ── ② 플래시 피크 측정 — update() 를 안 돌려 감쇠가 진행되지 않게 한다 ──
        // ⚠️ **게임이 실제로 부르는 조합·인자 그대로** 넣는다(hitEnemy / killEnemy 와 1:1).
        //    아웃라인이 사라진 지금 flashMesh 단독은 몸 재질만 태워 면적을 못 쥔다 — 화면에 남는
        //    몫의 대부분은 rimFlash(BackSide 셸)가 번다. 따로 재면 게임에 없는 그림을 지키는 셈이다.
        const base = meanOf(readFrame(R), R);
        const restore = () => {
            m.flashSeq = (m.flashSeq || 0) + 1;   // addAnim 콜백 무력화
            m.rimSeq = (m.rimSeq || 0) + 1;
            const t = Scene3D.flashTargets(m);
            for (const mat of t.lit) {
                const e0 = mat.userData && mat.userData._em0;
                if (mat.emissive && e0) { mat.emissive.setHex(e0.hex); mat.emissiveIntensity = e0.i; }
            }
            for (const mat of t.out) if (mat.userData && mat.userData._ol0 !== undefined) mat.color.setHex(mat.userData._ol0);
            for (const sh of (m.rimShells || (m.rimShell ? [m.rimShell] : []))) { sh.visible = false; sh.material.opacity = 0; }
        };
        const sample = (label, fire) => {
            fire();
            const lit = meanOf(readFrame(R), R);
            restore();
            return { label, delta: lit.lum - base.lum, lit: lit.lum, warm: lit.r - lit.b };
        };
        const rows = [
            sample('일반(flash 0.2 청백 olK0.38 + rim 청백 1.15)', () => {
                Scene3D.flashMesh(m, 0.2, 0.1, 0xcfe8ff, 0.38); Scene3D.rimFlash(m, 0.1, 0x9fe3ff, 1.15);
            }),
            sample('크리(flash 0.28 주황 olK0.78 + rim 주황 1.26)', () => {
                Scene3D.flashMesh(m, 0.28, 0.14, 0xff7a1a, 0.78); Scene3D.rimFlash(m, 0.13, 0xff8a3d, 1.26);
            }),
            sample('처치(flash 0.3 금백 olK1.0 + rim 금백 1.45)', () => {
                Scene3D.flashMesh(m, 0.3, 0.09, 0xfff6e0, 1.0); Scene3D.rimFlash(m, 0.16, 0xfff2d0, 1.45);
            }),
            sample('참고 상한(flash 1.2 흰 + rim 흰 1.3)', () => {
                Scene3D.flashMesh(m, 1.2, 0.1, 0xffffff, 1.0); Scene3D.rimFlash(m, 0.16, 0xffffff, 1.3);
            })];
        for (const s of rows) out.lines.push(`  · ${s.label}: 영역 평균휘도 ${base.lum.toFixed(4)} → ${s.lit.toFixed(4)} (Δ${s.delta.toFixed(4)}) · 온기(R-B) ${s.warm.toFixed(4)}`);
        out.rows = rows;

        // ── ③ 복구 확인 — 연출이 끝나면 emissive·림 셸이 원래대로 돌아오는가 ──
        // 여기가 새는 게 제일 무섭다: 셸이 켜진 채 굳으면 그 적은 남은 판 내내 하얗게 뜬다.
        // 실제 게임처럼 update() 를 돌려 감쇠를 끝까지 태운다(dt 0.1 × 6 = 0.6s > dur 최대 0.16s).
        Scene3D.update = realUpdate;
        Scene3D.flashMesh(m, 0.28, 0.14, 0xff9a4d, 0.78);
        Scene3D.rimFlash(m, 0.13, 0xff8a3d, 1.26);
        for (let i = 0; i < 6; i++) Scene3D.update(0.1);
        const t = Scene3D.flashTargets(m);
        let leakEm = 0, leakSh = 0;
        for (const mat of t.lit) { const e0 = mat.userData._em0; if (e0 && (mat.emissive.getHex() !== e0.hex || Math.abs(mat.emissiveIntensity - e0.i) > 1e-6)) leakEm++; }
        for (const sh of (m.rimShells || (m.rimShell ? [m.rimShell] : []))) if (sh.visible) leakSh++;
        Scene3D.update = () => {};
        say(leakEm === 0 && leakSh === 0,
            `복구 확인: 연출 종료 후 몸 재질 ${t.lit.length}종 중 ${leakEm}종 · 림 셸 ${leakSh}개가 원상복구 실패`);
        return out;
    }, { COVER_MIN, SEP_MIN });

    const lines = r.lines.slice();
    if (r.rows) {
        const normal = r.rows[0], crit = r.rows[1];
        lines.push((normal.delta >= FLASH_MIN ? 'PASS ' : 'FAIL ')
            + `일반 타격 조합 플래시 Δ${normal.delta.toFixed(4)} ≥ ${FLASH_MIN}`);
        // 크리 판정은 **휘도비가 아니라 온기 차**로 본다. 밝기로 크리를 더 밀면 '흰 덩어리'(비평가
        // 1위 결함)로 되돌아간다 — 접촉 프레임 한 장에서 크리를 가르는 건 **색**(청백 ↔ 주황)이다.
        const warmGap = crit.warm - normal.warm;
        lines.push((warmGap >= WARM_MIN ? 'PASS ' : 'FAIL ')
            + `크리 접촉 프레임이 일반보다 따뜻하다 (R-B) ${normal.warm.toFixed(4)} → ${crit.warm.toFixed(4)} (차 ${warmGap.toFixed(4)} ≥ ${WARM_MIN})`);
        if (normal.delta < FLASH_MIN || warmGap < WARM_MIN) r.ok = false;
    }
    lines.push((errors.length === 0 ? 'PASS ' : 'FAIL ') + `콘솔 에러 ${errors.length}건`);
    console.log(lines.join('\n'));
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    const ok = r.ok && !errors.length;
    console.log(ok ? '\n전체 통과' : '\n실패');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
