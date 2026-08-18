// 세 이벤트(일반 타격 · 크리 · 처치)의 **접촉 프레임 한 장**이 서로 갈리는가
// 사용: node tools/probe-hit-hierarchy.js   (종료코드 0 = 통과)
//
// 배경: 6차 채점 잔여 중 "크리와 처치의 첫 100ms 가 미분화" — 아직 실측되지 않은 지적이라
// **먼저 재고** 수치가 말하는 대로 처리한다(이 항목은 미검증 지적을 그대로 좇다가 없는 결함을
// 고치려 든 적이 여러 번 있다).
//
// 재는 방법은 `probe-hitflash-ab.js` 와 같다 — 렌더러에서 gl.readPixels 직독, 자 점검 선행,
// update() 를 안 돌려 **피크(접촉) 프레임을 강제**한다. 소프트 렌더는 한 프레임에 dt 0.1초가
// 지나 연출이 통째로 끝나므로 스크린샷으로는 이 프레임을 못 잡는다.
//
// 지표는 채점자가 한 장에서 읽는 것과 같은 두 축이다:
//   lum  = 영역 평균 휘도(얼마나 번쩍였나)
//   warm = 평균 R-B (무슨 색으로 번쩍였나 — 청백/주황/금색의 위계)
// 판정: 세 이벤트가 **쌍마다** 둘 중 한 축에서 최소 격차 이상 갈릴 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// ⚠️ 자 점검 하한이 probe-hitflash-ab(0.08)보다 낮은 이유: 여기서는 넉백으로 밀리는 몸을 담으려고
// 사각형을 좌우로 넓히므로 **적이 차지하는 지분이 그만큼 희석된다**(같은 적, 같은 프레임에서
// Δ0.17 → Δ0.064). 하한은 '이 영역에 적이 실제로 들어 있다'를 확인하는 선이지 연출 세기가 아니다.
const SELFTEST_MIN = 0.045;
const LUM_GAP = 0.020;   // 휘도로 갈리려면 이만큼
const WARM_GAP = 0.020;   // 색으로 갈리려면 이만큼

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ SELFTEST_MIN }) => {
        const out = { lines: [], ok: true, rows: [] };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        Combat.tick = () => {};
        Scene3D.update = () => {};
        if (!Combat.enemies.length) return { lines: ['FAIL 적이 없어 측정 불가'], ok: false, rows: [] };
        const e = Combat.enemies[0];
        const m = Scene3D.enemyMap.get(e.id);
        if (!m) return { lines: ['FAIL enemyMap 에 3D 개체가 없다'], ok: false, rows: [] };

        // 적을 화면 안 고정 위치로 (행군 중이면 사각형이 화면 밖으로 나가 전 항목이 Δ0 이 된다)
        m.g.position.set(Scene3D.heroG.position.x + 1.7, m.g.position.y, 0);
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);

        // 화면 사각형 — 넉백으로 몸이 옆으로 밀리므로 좌우로 넉넉히 넓힌다(이벤트마다 밀림 폭이 다르다)
        const box = new THREE.Box3().setFromObject(m.g);
        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const pts = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
            pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        const padX = (x1 - x0) * 0.35, padY = (y1 - y0) * 0.15;
        x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
        const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0) * dpr));
        const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0) * dpr));
        const ry = Math.max(0, ch - ryTop - rh);
        if (rw < 4 || rh < 4) return { lines: [`FAIL 사각형이 너무 작다 ${rw}×${rh}`], ok: false, rows: [] };

        const gl = Scene3D.renderer.getContext();
        const buf = new Uint8Array(rw * rh * 4);
        const read = () => {
            Scene3D.renderFrame();
            gl.readPixels(rx, ry, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            let sr = 0, sg = 0, sb = 0;
            for (let i = 0; i < rw * rh; i++) { sr += buf[i * 4]; sg += buf[i * 4 + 1]; sb += buf[i * 4 + 2]; }
            const n = rw * rh * 255;
            return { lum: (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / n, warm: (sr - sb) / n };
        };

        // 자 점검
        const a = read(); m.g.visible = false; const b = read(); m.g.visible = true;
        say(Math.abs(a.lum - b.lum) >= SELFTEST_MIN,
            `자 점검: 적 숨김/표시 Δ${Math.abs(a.lum - b.lum).toFixed(4)} — 사각형 ${rw}×${rh}@(${rx},${ry})`);
        if (Math.abs(a.lum - b.lum) < SELFTEST_MIN) return out;

        const base = read();
        // 연출 상태를 원래대로 — flashMesh/rimFlash 가 남긴 것을 전부 되돌린다
        const reset = () => {
            m.flashSeq = (m.flashSeq || 0) + 1;
            const t = Scene3D.flashTargets(m);
            for (const mt of t.lit) { const e0 = mt.userData._em0; if (e0) { mt.emissive.setHex(e0.hex); mt.emissiveIntensity = e0.i; } }
            for (const mt of t.out) if (mt.userData._ol0 !== undefined) mt.color.setHex(mt.userData._ol0);
            if (m.rimShell) { m.rimSeq = (m.rimSeq || 0) + 1; m.rimShell.visible = false; }
            Scene3D.anims = [];
        };
        // 게임이 실제로 부르는 조합 그대로 (hitEnemy / killEnemy 의 flashMesh·rimFlash 인자)
        const events = [
            { k: '일반', flash: [0.2, 0.1, 0xcfe8ff, 0.38], rim: [0.1, 0x9fe3ff, 1.12] },
            { k: '크리', flash: [0.28, 0.14, 0xff7a1a, 0.78], rim: [0.13, 0xff8a3d, 1.2] },
            { k: '처치', flash: [0.4, 0.09, 0xfff6e0, 1.0], rim: [0.16, 0xffd28a, 1.3] },
        ];
        for (const ev of events) {
            reset();
            Scene3D.flashMesh(m, ev.flash[0], ev.flash[1], ev.flash[2], ev.flash[3]);
            Scene3D.rimFlash(m, ev.rim[0], ev.rim[1], ev.rim[2]);
            const s = read();
            out.rows.push({ k: ev.k, lum: s.lum - base.lum, warm: s.warm });
        }
        reset();
        out.lines.push(`  기준 휘도 ${base.lum.toFixed(4)} · 온기 ${base.warm.toFixed(4)}`);
        for (const s of out.rows) out.lines.push(`  · ${s.k}: 휘도 Δ${s.lum.toFixed(4)} · 온기 ${s.warm.toFixed(4)}`);
        return out;
    }, { SELFTEST_MIN });

    const lines = r.lines.slice();
    if (r.rows && r.rows.length === 3) {
        for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
            const A = r.rows[i], B = r.rows[j];
            const dl = Math.abs(A.lum - B.lum), dw = Math.abs(A.warm - B.warm);
            const ok = dl >= LUM_GAP || dw >= WARM_GAP;
            if (!ok) r.ok = false;
            lines.push(`${ok ? 'PASS ' : 'FAIL '}${A.k} ↔ ${B.k}: 휘도차 ${dl.toFixed(4)} · 온기차 ${dw.toFixed(4)} `
                + `(둘 중 하나가 ${LUM_GAP}/${WARM_GAP} 이상이어야 한다)`);
        }
    }
    lines.push((errors.length === 0 ? 'PASS ' : 'FAIL ') + `콘솔 에러 ${errors.length}건`);
    console.log(lines.join('\n'));
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    const ok = r.ok && !errors.length;
    console.log(ok ? '\n전체 통과' : '\n실패');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
