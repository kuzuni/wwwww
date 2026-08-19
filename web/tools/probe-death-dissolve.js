// hp-juicy — 비평가 6.0 잔여 지적 ③ '사망 디졸브'(접지 후 0.3~0.5초 노이즈 알파 클립) 실측.
//
// 무엇이 문제였나: 종전 소멸은 전 재질 `opacity = 1 - f` **균일 페이드**였다. 균일 페이드는
// '사라진다'가 아니라 '투명해진다'로 읽힌다 — 실루엣이 끝까지 통째로 남은 채 옅어지므로
// 마지막 0.3초가 '유령이 됐다'가 되고, 시체 너머 초원이 비쳐 색이 뭉개진다.
// 처방은 노이즈 임계값 기반 **알파 클립**(discard): 시체가 가장자리부터 부스러지며 없어지고
// 버려지는 경계에 잔불이 남는다.
//
// 그래서 이 프로브의 핵심 지표는 **커버리지(시체가 실제로 덮는 화소 수)** 다.
//   · 균일 페이드: 반투명이어도 배경과 다르므로 커버리지는 끝까지 거의 100% 유지되다 툭 사라진다.
//   · 알파 클립: 화소가 진짜로 버려지므로 커버리지가 시간에 따라 **점진적으로 깎인다**.
// 중반(디졸브 절반 시점) 커버리지가 초기 대비 어디쯤인지가 둘을 가른다.
//
// ⚠️ 함정 ③(TODO 상단): 헤드리스에서 rAF 는 사실상 안 돈다 → `Scene3D.update` 를 손으로 흘린다.
// ⚠️ 자 점검 먼저: '시체를 껐다 켰을 때 그 영역이 변하는가'를 통과 못 하면 어떤 판정도 하지 않는다
//    (hp-juicy 하네스 규칙 ㉠ — 적이 화면 밖에 있으면 모든 항목이 Δ0 으로 나온다).
// ⚠️ 이 프로브군은 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node tools/probe-death-dissolve.js [enemyKind]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';

const DUR_LO = 0.28, DUR_HI = 0.55;   // 처방 '0.3~0.5초' + 샘플 간격 여유
const MID_LO = 0.20, MID_HI = 0.80;   // 중반 커버리지가 이 대역이면 '부스러진다'(균일 페이드는 >0.9)
const EMBER_MIN = 0.05;               // 중반 프레임에서 잔불(따뜻한) 화소 비율 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    const out = await page.evaluate(() => {
        // ⚠️ 표적을 **가장 먼저** 쥔다 — Combat.tick 을 끊기 전 한 틱에 죽어 배열에서 빠질 수 있다.
        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        if (!e) return { fatal: 'NO_ENEMY' };
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const STEP = 1 / 120;
        const step = (sec) => { const n = Math.max(1, Math.round(sec / STEP)); for (let i = 0; i < n; i++) realUpdate(STEP); return n * STEP; };
        // 밀린 백로그를 비운다(함정 ③) — 안 그러면 수십 개 연출이 같은 좌표를 덮어써 톱니로 튄다.
        Scene3D.anims.length = 0;
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        step(0.4);

        const r = Scene3D.renderer;
        const db = new THREE.Vector2(); r.getDrawingBufferSize(db);
        const W = Math.floor(db.x), H = Math.floor(db.y);
        const cap = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
        cap.texture.encoding = THREE.sRGBEncoding;
        const grab = () => {
            Scene3D.renderFrame();
            if (Scene3D.postOn && Scene3D._fsQuad) {
                Scene3D._fsQuad.material = Scene3D._compMat;
                r.setRenderTarget(cap); r.render(Scene3D._fsScene, Scene3D._fsCam); r.setRenderTarget(null);
            } else {
                r.setRenderTarget(cap); r.render(Scene3D.scene, Scene3D.camera); r.setRenderTarget(null);
            }
            const b = new Uint8Array(W * H * 4); r.readRenderTargetPixels(cap, 0, 0, W, H, b); return b;
        };

        const m = Scene3D.enemyMap.get(e.id);
        if (!m) return { fatal: 'NO_MESH' };
        // 적을 화면 한가운데 고정 위치로 옮긴다 — 행군 중 화면 밖에 있으면 모든 표본이 Δ0 이다(규칙 ㉠).
        e.x = Scene3D.heroX !== undefined ? Scene3D.heroX + 1.9 : 1.9;
        m.g.position.set(Scene3D.heroG.position.x + 1.9, 0, 0);
        m.g.updateWorldMatrix(true, true);
        step(0.05);

        const cv = r.domElement, rect = cv.getBoundingClientRect();
        const sx = W / rect.width, sy = H / rect.height;
        // 시체가 눕고 밀리는 범위까지 넉넉히 감싸는 고정 박스(매 프레임 bbox 를 다시 잡으면
        // 커버리지가 '박스가 줄어서' 줄어든 것과 구분이 안 된다 — 반드시 고정).
        const box = (() => {
            const b = new THREE.Box3().setFromObject(m.g);
            b.expandByVector(new THREE.Vector3(0.9, 0.5, 0.9));
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const xi of [b.min.x, b.max.x]) for (const yi of [b.min.y, b.max.y]) for (const zi of [b.min.z, b.max.z]) {
                const p = new THREE.Vector3(xi, yi, zi).project(Scene3D.camera);
                const px = ((p.x * 0.5 + 0.5) * rect.width) * sx, py = H - ((0.5 - p.y * 0.5) * rect.height) * sy;
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
            return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))];
        })();

        // 커버리지 = 시체를 껐다 켠 차분 화소 수. 파티클·링·그을음은 두 프레임 모두에 있으므로 상쇄된다.
        const coverage = () => {
            m.g.visible = false; const off = grab();
            m.g.visible = true; const on = grab();
            let px = 0, warm = 0;
            for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
                const i = (y * W + x) * 4;
                const d = Math.abs(off[i] - on[i]) + Math.abs(off[i + 1] - on[i + 1]) + Math.abs(off[i + 2] - on[i + 2]);
                if (d > 12) {
                    px++;
                    // 잔불 판정 — 시체 화소 중 '주황(R 우세)'인 것
                    if ((on[i] - on[i + 2]) / 255 > 0.16 && on[i] > 110) warm++;
                }
            }
            return { px, warm };
        };

        // 자 점검: 살아 있는 적이 그 박스에서 실제로 보이는가
        const alive = coverage();
        if (alive.px < 300) return { fatal: 'SELFCHECK', alive, box, W, H };

        // 살아 있는 동안은 디졸브 훅이 화면을 안 바꾼다(uDis=0) — 유니폼 실측으로 확인
        let uAlive = -1;
        m.g.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.dissolveU && uAlive < 0) uAlive = o.material.userData.dissolveU.value; });

        // 림 라이트 훅이 살아남았는가 — 디졸브 훅이 onBeforeCompile 을 덮어쓰면 컨투어가 통째로 사라진다.
        let rimKept = 0, rimTotal = 0;
        m.g.traverse(o => {
            if (!o.isMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
                if (!mt.userData.__rim) return;
                rimTotal++;
                const p = mt.program || (r.properties.get(mt) || {}).currentProgram;
                const u = p && p.getUniforms && p.getUniforms();
                if (u && u.map && u.map.uRimStr) rimKept++;
            });
        });

        // 처치 — 실제 코드 경로로
        Scene3D.killEnemy(e.id, false);
        e.alive = false;
        // uDis 를 같이 읽는다 — 커버리지만 보면 **쓰러지며 실루엣이 줄어드는 구간**(0~0.3초)과
        // 디졸브 구간을 못 가른다. 실제로 골렘은 눕는 동안 커버리지가 1.00 → 0.25 로 떨어진다.
        let anyMat = null;
        m.g.traverse(o => { if (!anyMat && o.isMesh && o.material && !Array.isArray(o.material) && o.material.userData.dissolveU) anyMat = o.material; });
        const series = [];
        let t = 0;
        for (let i = 0; i < 160; i++) {          // ≈1.3초까지
            const c = coverage();
            series.push({ t: +t.toFixed(3), px: c.px, warm: c.warm, u: anyMat ? +anyMat.userData.dissolveU.value.toFixed(3) : -1 });
            if (t > 0.5 && c.px === 0) break;    // 다 사라지면 종료
            t += step(0.01);
        }
        return { alive, uAlive, rimKept, rimTotal, series, box, W, H, kind: new URLSearchParams(location.search).get('enemy') };
    });

    if (out.fatal) {
        console.log('❌ 자 점검 실패 —', JSON.stringify(out));
        await browser.close(); return;
    }

    // 🚨 디졸브 구간만 잘라 본다. 처치 직후 0~0.3초는 **쓰러지는 동안 실루엣이 줄어드는** 구간이라
    //    거기까지 섞으면 소멸이 실제보다 훨씬 길고 완만해 보인다(골렘 실측: 눕는 동안 1.00 → 0.25).
    //    기준선은 uDis 가 0 을 벗어나기 **직전** 프레임의 커버리지다.
    const all = out.series;
    const i0 = Math.max(0, all.findIndex(s => s.u > 0) - 1);
    const S = all.slice(i0);
    const t0 = S.length ? S[0].t : 0;
    const peak = S.length ? S[0].px : 0;
    const at = (frac) => {   // 커버리지가 peak*frac 아래로 처음 떨어지는 시각(디졸브 시작 기준)
        const s = S.find(s => s.px <= peak * frac);
        return s ? +(s.t - t0).toFixed(3) : null;
    };
    const t95 = at(0.95), t50 = at(0.5), t05 = at(0.05), t00 = at(0.0001);
    const dur = (t95 !== null && t05 !== null) ? +(t05 - t95).toFixed(3) : null;
    // 중반 = 소멸 구간의 시간 중점에서 잰 커버리지 비율
    const midT = (t95 !== null && t05 !== null) ? (t95 + t05) / 2 : null;
    const midS = midT === null ? null : S.reduce((a, b) => Math.abs(b.t - t0 - midT) < Math.abs(a.t - t0 - midT) ? b : a);
    const midFrac = midS ? +(midS.px / peak).toFixed(3) : null;
    const emberFrac = midS && midS.px ? +(midS.warm / midS.px).toFixed(3) : 0;
    const emberPeak = Math.max(...S.filter(s => s.px > 0).map(s => s.warm / s.px));

    console.log(`\n  적 종류=${out.kind} · 버퍼 ${out.W}×${out.H} · 측정박스 [${out.box}]`);
    console.log(`  디졸브 시작 t=${t0.toFixed(3)}s (그 직전 커버리지 ${peak}px = 기준선) · 그 앞 ${i0}표본은 쓰러짐 구간`);
    console.log('   t(s)   Δt(s)    커버리지px   비율    잔불px    uDis');
    for (const s of S) if (Math.round((s.t - t0) * 1000) % 40 < 9 || s.px === 0) {
        console.log(`  ${String(s.t.toFixed(2)).padStart(5)}  ${String((s.t - t0).toFixed(2)).padStart(5)}   ${String(s.px).padStart(9)}   ${(s.px / peak).toFixed(3)}   ${String(s.warm).padStart(6)}   ${s.u}`);
    }
    console.log(`\n  (디졸브 시작 기준) 커버리지 95%↓ = ${t95}s · 50%↓ = ${t50}s · 5%↓ = ${t05}s · 0 = ${t00}s`);
    console.log(`  → 디졸브 지속 = ${dur}s (처방 ${DUR_LO}~${DUR_HI}s)`);
    console.log(`  → 중반(${midT === null ? '-' : midT.toFixed(3)}s) 커버리지 = ${midFrac} (알파 클립 대역 ${MID_LO}~${MID_HI}; 균일 페이드면 >0.9)`);
    console.log(`  → 중반 잔불 비율 = ${emberFrac} (최대 ${emberPeak.toFixed(3)}, 하한 ${EMBER_MIN})`);
    console.log(`  → 살아 있는 적 uDis = ${out.uAlive} (0 이어야 화면 불변) · 림 훅 보존 ${out.rimKept}/${out.rimTotal}`);

    const checks = [
        ['① 디졸브 훅이 심겨 있고 살아 있는 동안 uDis=0', out.uAlive === 0],
        ['② 림 라이트 훅 보존(디졸브가 onBeforeCompile 을 안 덮어씀)', out.rimTotal > 0 && out.rimKept === out.rimTotal],
        ['③ 시체가 완전히 사라진다(커버리지 0)', t00 !== null],
        [`④ 디졸브 지속 ${DUR_LO}~${DUR_HI}s`, dur !== null && dur >= DUR_LO && dur <= DUR_HI],
        [`⑤ 부스러지며 사라진다(중반 커버리지 ${MID_LO}~${MID_HI})`, midFrac !== null && midFrac >= MID_LO && midFrac <= MID_HI],
        [`⑥ 경계 잔불이 보인다(중반 따뜻한 화소 ≥ ${EMBER_MIN})`, emberFrac >= EMBER_MIN],
        ['⑦ 콘솔/페이지 에러 0', errors.length === 0],
    ];
    let fail = 0;
    console.log('');
    for (const [n, ok] of checks) { console.log(`  ${ok ? '✅' : '❌'} ${n}`); if (!ok) fail++; }
    console.log(fail ? `\n  판정: ❌ ${fail}건 미통과` : '\n  판정: ✅ 전부 통과');
    if (errors.length) console.log('  에러:', errors.slice(0, 5));
    await browser.close();
})();
