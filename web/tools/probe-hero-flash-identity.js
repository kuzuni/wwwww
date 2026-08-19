// 영웅 피격 플래시가 **재질 정체성을 지우지 않는가** (hp-juicy 8차 2인 일치 지적 ㉤)
// 사용: node tools/probe-hero-flash-identity.js   (종료코드 0 = 통과)
//
// 배경: 8차 비평가 A#6 · B#⑦ 이 독립적으로 "영웅의 검은 갑옷이 통째로 은백색으로 날아간다"고 했고
// 육안으로도 `hitfx-c1`·`c2` 에서 확인된다. `heroHit` 이 `flashMesh(_, 0.25, 0.12, 0xffd9d9)` 를
// 부르는데 olK 를 안 줘서 유도식(0.35 + peak*2.2)이 **0.90** 으로 붙는다 — 림이 거의 순백까지 타고,
// 몸 emissive 도 균일 백색 0.25 라 어두운 갑주가 함께 들린다. 그 결과 ⑴ 재질 정체성이 사라지고
// ⑵ **적에게 쓰는 것과 같은 흰 플래시**라 '내가 맞았다' 신호가 되지 못한다.
//
// 판정 축(적 쪽에서 이미 쓴 언어 그대로):
//   lift = 영웅 실루엣 평균 휘도 상승   — 정체성이 살아 있으면 작아야 한다
//   warm = 영웅 실루엣 평균 R-B 상승    — '붉게 맞았다'가 읽히려면 커야 한다
// 즉 **밝기로 때우지 말고 색으로 말할 것**. 이 저장소가 적 플래시에서 이미 도달한 결론이고
// (`flashMesh` 주석: 화이트아웃 금지, 위계는 색으로), 영웅만 그 규칙 밖에 있었다.
//
// 🚨 하네스 규약: 자 점검 먼저(영웅을 숨기면 그 영역이 변하는가) · `gl.readPixels` 직독 ·
//    `update()` 를 돌리지 않고 **플래시 직후 renderFrame 만** 불러 피크 프레임을 강제한다
//    (소프트 렌더는 한 프레임에 0.1초가 지나 dur 0.12 짜리 플래시가 통째로 끝난다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 실측 기반(before → after 는 항목 메모에 남긴다)
const LIFT_MAX = 0.10;   // 실루엣 평균 휘도 상승 상한 — 이 위면 '통째로 밝아졌다'
const WARM_MIN = 8;      // 실루엣 평균 R-B 상승 하한 — 이 아래면 '붉게'가 아니라 그냥 밝아진 것

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
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ LIFT_MAX, WARM_MIN }) => {
        const out = { lines: [], ok: true, nums: {} };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        const note = m => out.lines.push('  · ' + m);

        Combat.tick = () => {};
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.clearEnemies();
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        real(1 / 60);

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const pts = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
            pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        const pad = 12;
        const rx = Math.max(0, Math.round((x0 - pad) * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0 + pad * 2) * dpr));
        const ryTop = Math.max(0, Math.round((y0 - pad) * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0 + pad * 2) * dpr));
        const rect = { x: rx, y: Math.max(0, ch - (ryTop + rh)), w: Math.max(1, rw), h: Math.max(1, rh) };
        const read = () => { Scene3D.renderFrame(); const b = new Uint8Array(rect.w * rect.h * 4); gl.readPixels(rect.x, rect.y, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };

        // 영웅 실루엣 마스크 — '영웅을 숨기면 달라지는 화소'
        const onA = read();
        const vis = Scene3D.heroG.visible; Scene3D.heroG.visible = false;
        const offA = read();
        Scene3D.heroG.visible = vis;
        const mask = new Uint8Array(rect.w * rect.h);
        let n = 0;
        for (let i = 0; i < rect.w * rect.h; i++) {
            const dr = onA[i * 4] - offA[i * 4], dg = onA[i * 4 + 1] - offA[i * 4 + 1], db = onA[i * 4 + 2] - offA[i * 4 + 2];
            if (Math.sqrt(dr * dr + dg * dg + db * db) > 24) { mask[i] = 1; n++; }
        }
        out.nums.cover = +(n / (rect.w * rect.h)).toFixed(4);
        say(n / (rect.w * rect.h) >= 0.08, `자 점검: 영웅을 숨기면 영역이 변한다 (커버리지 ${(n / (rect.w * rect.h) * 100).toFixed(1)}% >= 8%)`);
        if (!out.ok) { Scene3D.update = real; return out; }

        const statOf = buf => {
            let lum = 0, warm = 0, c = 0;
            for (let i = 0; i < rect.w * rect.h; i++) {
                if (!mask[i]) continue;
                c++;
                lum += (0.299 * buf[i * 4] + 0.587 * buf[i * 4 + 1] + 0.114 * buf[i * 4 + 2]) / 255;
                warm += buf[i * 4] - buf[i * 4 + 2];
            }
            return { lum: lum / c, warm: warm / c };
        };
        const base = statOf(onA);

        // 플래시 피크 강제 — update 를 돌리지 않고 heroHit 직후 renderFrame 만
        Scene3D.heroHit(0.3, 300);
        const peak = statOf(read());
        const lift = peak.lum - base.lum, dWarm = peak.warm - base.warm;
        out.nums.baseLum = +base.lum.toFixed(4);
        out.nums.peakLum = +peak.lum.toFixed(4);
        out.nums.lift = +lift.toFixed(4);
        out.nums.warmRise = +dWarm.toFixed(1);
        note(`대기 휘도 ${base.lum.toFixed(4)} · R-B ${base.warm.toFixed(1)} → 플래시 피크 휘도 ${peak.lum.toFixed(4)} · R-B ${peak.warm.toFixed(1)}`);
        say(lift <= LIFT_MAX, `ⓐ 재질 정체성 유지: 실루엣 휘도 상승 ${lift.toFixed(4)} (<= ${LIFT_MAX}) — 이 위면 갑옷이 통째로 밝아진 것`);
        say(dWarm >= WARM_MIN, `ⓑ 붉게 읽힌다: 실루엣 R-B 상승 ${dWarm.toFixed(1)} (>= ${WARM_MIN}) — 밝기가 아니라 색으로 말할 것`);

        // 복구 — 연출 뒤 재질이 원래대로 돌아오는가(밝은 채로 굳으면 판 내내 하얗다)
        for (let i = 0; i < 60; i++) real(1 / 60);
        const after = statOf(read());
        out.nums.afterLift = +(after.lum - base.lum).toFixed(4);
        say(Math.abs(after.lum - base.lum) < 0.02, `ⓒ 수명 뒤 원상복구 (휘도 편차 ${(after.lum - base.lum).toFixed(4)})`);

        Scene3D.update = real;
        return out;
    }, { LIFT_MAX, WARM_MIN });

    for (const l of r.lines) console.log(l);
    if (r.nums) console.log('nums=' + JSON.stringify(r.nums));
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(r.ok && !errors.length ? 0 : 1);
})();
