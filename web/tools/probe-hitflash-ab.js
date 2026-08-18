// 피격 몸 플래시가 **화면에** 남는가 — 렌더러에서 직접 픽셀을 읽는 A/B 하네스
// 사용: node tools/probe-hitflash-ab.js   (종료코드 0 = 통과)
//
// 배경(3D 인계 메모 ⓐⓑ): 일반 타격의 몸 플래시가 프레임에 안 남는다는 지적이 6차 채점에 있었고,
// 앞 세션이 처방을 시도했다가 **효과를 실측으로 못 세워 되돌렸다** — "재질 값은 확실히 움직이는데
// 화면이 안 움직인다". 그 판의 A/B 하네스가 고장난 채였고, 그걸로 '후보 3건 기각'이라는 틀린
// 결론까지 냈다. 그래서 이 하네스는 **자기 자신을 먼저 의심하는 순서**로 짰다.
//
// ① 자 점검(SELFTEST) — 적을 숨겼다 켜면 그 영역의 픽셀이 실제로 변하는가.
//    변하지 않으면 좌표계·렌더 타이밍이 틀린 것이므로 **어떤 A/B 판정도 하지 않고 즉시 실패**한다.
//    (앞 세션이 이걸 안 걸어서 "안 변한다"를 "효과가 없다"로 읽었다.)
// ② 픽셀은 `gl.readPixels` 로 **렌더러의 드로잉 버퍼에서 직접** 읽는다. 스크린샷 경로는
//    `project()`(캔버스 로컬)와 `screenshot clip`(뷰포트) 사이에 캔버스 y 오프셋이 끼어 어긋난다.
// ③ 플래시는 **피크 프레임을 강제로** 잡는다. flashMesh 는 addAnim 으로 감쇠하는데, 렌더 루프의
//    dt 는 `Math.min(0.1, …)` 라 소프트 렌더(프레임이 초 단위)에서는 **한 프레임에 0.1초가 지나
//    플래시가 통째로 끝난다**. update() 를 돌리지 않고 flashMesh 직후에 renderFrame() 만 부른다.
// ⚠️ 초기 로드 대기를 45초로 잡는다 — 이 저장소는 병렬 세션이 여러 개 돌아 머신이 붐빌 때가 많고,
// 소프트 렌더(swiftshader) 부팅이 20초를 넘겨 **멀쩡한 코드가 TimeoutError 로 반려**되는 일이 잦다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SELFTEST_MIN = 0.08;  // 적을 숨겼다 켰을 때 영역 평균 휘도가 최소 이만큼은 변해야 한다
const WARM_MIN = 0.02;   // 크리(주황)와 일반(청백)의 R-B 격차 하한
const FLASH_MIN = 0.06;  // 일반 타격 플래시의 몸 휘도 상승 하한(0~1 스케일) — 6% 미만은 "안 보인다"

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ SELFTEST_MIN }) => {
        const out = { lines: [], ok: true };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };

        // 전투/렌더 루프를 세운다 — 이 하네스는 프레임을 **직접** 돌린다.
        Combat.tick = () => {};
        const realUpdate = Scene3D.update;
        Scene3D.update = () => {};

        // 적이 한 마리는 있어야 한다. 없으면 스테이지를 세워 만든다.
        if (!Combat.enemies.length) { Combat.setupStage(); Combat.nextWave && Combat.spawnWave && Combat.spawnWave(); }
        if (!Combat.enemies.length) {
            // 전투 틱을 잠깐 살려 웨이브가 실제로 나오게 한다
            Scene3D.update = realUpdate;
            return { lines: ['FAIL 적이 없어 측정 불가(스테이지 준비 실패)'], ok: false };
        }
        const e = Combat.enemies[0];
        const m = Scene3D.enemyMap.get(e.id);
        if (!m) return { lines: ['FAIL enemyMap 에 3D 개체가 없다'], ok: false };

        // 적을 화면 안 고정 위치로 옮긴다 — 행군 중이라 표본 시점에 따라 화면 밖(오른쪽 끝)에 있고,
        // 그러면 사각형이 배경만 담아 **모든 A/B 가 Δ0.0000 으로 나온다**(실제로 첫 판에서 겪었다).
        // 자 점검이 그걸 잡아 주지만, 애초에 안 일어나게 자리를 고정한다.
        m.g.position.set(Scene3D.heroG.position.x + 1.7, m.g.position.y, 0);
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);

        // 적의 화면 사각형 — project() 는 캔버스 로컬 좌표(=드로잉 버퍼와 같은 원점)를 준다.
        const box = new THREE.Box3().setFromObject(m.g);
        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const pts = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
            pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        // CSS 픽셀 → 드로잉 버퍼 픽셀. readPixels 는 **아래가 원점**이라 y 를 뒤집는다.
        const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0) * dpr));
        const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0) * dpr));
        const ry = Math.max(0, ch - ryTop - rh);
        if (rw < 4 || rh < 4) return { lines: [`FAIL 적 화면 사각형이 너무 작다 ${rw}×${rh}`], ok: false };

        const gl = Scene3D.renderer.getContext();
        const buf = new Uint8Array(rw * rh * 4);
        const readMean = () => {
            Scene3D.renderFrame();
            gl.readPixels(rx, ry, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            let sr = 0, sg = 0, sb = 0;
            for (let i = 0; i < rw * rh; i++) { sr += buf[i * 4]; sg += buf[i * 4 + 1]; sb += buf[i * 4 + 2]; }
            const n = rw * rh * 255;
            return { r: sr / n, g: sg / n, b: sb / n, lum: (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / n };
        };
        const readMeanLum = () => readMean().lum;

        // ── ① 자 점검: 적을 숨겼다 켜면 이 영역이 변해야 한다 ──
        const withEnemy = readMeanLum();
        m.g.visible = false;
        const without = readMeanLum();
        m.g.visible = true;
        const selfDelta = Math.abs(withEnemy - without);
        say(selfDelta >= SELFTEST_MIN,
            `자 점검: 적 숨김/표시로 영역 평균휘도 ${withEnemy.toFixed(4)} ↔ ${without.toFixed(4)} (Δ${selfDelta.toFixed(4)}) `
            + `— 사각형 ${rw}×${rh}@(${rx},${ry})`);
        if (selfDelta < SELFTEST_MIN) {
            out.lines.push('  ↑ 좌표계·렌더 타이밍이 틀렸다는 뜻이다. **여기서 멈춘다** — 이 상태의 A/B 판정은 전부 무의미하다.');
            return out;
        }

        // ── ② 플래시 피크 측정 — update() 를 안 돌려 감쇠가 진행되지 않게 한다 ──
        const base = readMeanLum();
        const sample = (peak, dur, color, olK, label) => {
            Scene3D.flashMesh(m, peak, dur, color, olK);
            const lit = readMean();
            // 원상복구 — ⚠️ **emissive 만 되돌리면 안 된다.** 외곽선 색을 안 되돌리면 밝아진 테두리가
            // 다음 표본의 기준선으로 새어 들어가 뒤 표본일수록 값이 부풀려진다(첫 판에서 실제로 그랬다).
            m.flashSeq = (m.flashSeq || 0) + 1;
            const t = Scene3D.flashTargets(m);
            for (const mat of t.lit) {
                const e0 = mat.userData && mat.userData._em0;
                if (mat.emissive && e0) { mat.emissive.setHex(e0.hex); mat.emissiveIntensity = e0.i; }
            }
            for (const mat of t.out) if (mat.userData && mat.userData._ol0 !== undefined) mat.color.setHex(mat.userData._ol0);
            return { label, peak, delta: lit.lum - base, lit: lit.lum, warm: lit.r - lit.b };
        };
        // ⚠️ **게임이 실제로 부르는 인자 그대로** 넣는다(hitEnemy 의 flashMesh 호출과 1:1).
        //    외곽선 세기(olK)를 안 넘기면 유도 기본값(0.35+peak×2.2=0.79)이 걸려 **게임보다 두 배 센
        //    연출을 재게 된다** — 게이트가 실제와 다른 것을 지키는 셈이라 무의미하다.
        const rows = [sample(0.2, 0.1, 0xcfe8ff, 0.38, '일반(현행 0.2·청백·olK0.38)'),
        sample(0.28, 0.14, 0xff7a1a, 0.78, '크리(현행 0.28·주황·olK0.78)'),
        sample(0.4, 0.09, 0xfff6e0, 1.0, '처치(현행 0.4·금백·olK1.0)'),
        sample(1.2, 0.1, 0xffffff, 1.0, '참고 상한')];
        for (const s of rows) out.lines.push(`  · ${s.label}: 영역 평균휘도 ${base.toFixed(4)} → ${s.lit.toFixed(4)} (Δ${s.delta.toFixed(4)}) · 온기(R-B) ${s.warm.toFixed(4)}`);
        out.rows = rows;
        out.base = base;

        // ── ③ 복구 확인 — 연출이 끝나면 외곽선·emissive 가 원래대로 돌아오는가 ──
        // 여기가 새는 게 제일 무섭다: 외곽선이 밝은 채로 굳으면 그 적은 남은 판 내내 하얗게 뜬다.
        // 실제 게임처럼 update() 를 돌려 감쇠를 끝까지 태운다(dt 0.1 × 4 = 0.4s > dur 0.1s).
        Scene3D.update = realUpdate;
        Scene3D.flashMesh(m, 0.28, 0.14, 0xff9a4d);
        for (let i = 0; i < 6; i++) Scene3D.update(0.1);
        const t = Scene3D.flashTargets(m);
        let leakOut = 0, leakEm = 0;
        for (const mat of t.out) if (mat.userData._ol0 !== undefined && mat.color.getHex() !== mat.userData._ol0) leakOut++;
        for (const mat of t.lit) { const e0 = mat.userData._em0; if (e0 && (mat.emissive.getHex() !== e0.hex || Math.abs(mat.emissiveIntensity - e0.i) > 1e-6)) leakEm++; }
        Scene3D.update = () => {};
        say(leakOut === 0 && leakEm === 0,
            `복구 확인: 연출 종료 후 외곽선 ${t.out.length}종 중 ${leakOut}종 · 몸 재질 ${t.lit.length}종 중 ${leakEm}종이 원상복구 실패`);
        return out;
    }, { SELFTEST_MIN });

    const lines = r.lines.slice();
    if (r.rows) {
        const normal = r.rows[0], crit = r.rows[1];
        lines.push((normal.delta >= FLASH_MIN ? 'PASS ' : 'FAIL ')
            + `일반 타격 몸 플래시 Δ${normal.delta.toFixed(4)} ≥ ${FLASH_MIN}`);
        // 크리 판정은 **휘도비가 아니라 온기 차**로 본다. 외곽선 점등은 금방 포화해 크리를 밝기로
        // 더 밀면 '흰 덩어리'(비평가 1위 결함)로 되돌아간다 — 접촉 프레임 한 장에서 크리를 가르는 건
        // 밝기가 아니라 **색**(청백 ↔ 주황)이다. 림 셸 두께·플레어 크기·파편 수는 별도 연출이 맡는다.
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
