// probe-emissive-bleed.js — '발광체가 주변을 안 밝힌다'는 지적을 **A/B 토글로** 검증한다.
//   (`map-quality-up` 2026-08-19(16) 채점 잔여 3건 중 하나. 비평가 2인 공통: "용암 균열·마법
//    크리스탈이 스스로만 빛나고 주변 지면·소품에 빛이 안 번진다".)
//
// ── 왜 A/B 토글인가 ────────────────────────────────────────────────────────────
//   이 저장소는 비평가의 **원인 귀속**이 틀린 사례를 여러 번 겪었다(TODO: "구름 0개·fog 미적용·
//   castShadow=false … 넷 다 사실이 아니다"). 실제로 코드에는 악센트 포인트라이트 풀(3기,
//   distance 9)이 이미 있고 발광 소품의 자식으로 붙는다. 그러니 물어야 할 것은 "라이트가 있나"가
//   아니라 **"그 라이트가 화면을 실제로 바꾸나"** 다. 그래서 재는 법은 하나뿐이다 —
//   **끄고 켜서 화소가 얼마나 달라지는지 본다.** 마스크가 곧 자가검증이다(껐는데 아무것도 안
//   변하면 그 라이트는 화면에 없는 것이다 — `probe-ridge-layers`·`probe-flash-gl` 과 같은 규약).
//
// ── 재는 것 (바이옴별) ─────────────────────────────────────────────────────────
//   · 영향화소%  = 악센트를 껐을 때 달라지는 화소 비율. 0 에 가까우면 지적이 사실이다.
//   · 최대Δ      = 가장 크게 밝아진 화소의 휘도 증가분. '번짐'의 세기.
//   · 평균Δ      = 영향화소들의 평균 증가분.
//   · 도달반경px = 변화한 화소가 광원 화면 위치에서 얼마나 멀리까지 퍼지는지(90 백분위).
//
// 🚨 **발광 재질 자체(emissive/emissiveMap)는 이 자의 대상이 아니다.** 그건 '스스로 빛남'이고
//    지적은 '주변을 밝힘'이다. 둘을 섞으면 크랙이 밝게 찍히는 것만 보고 통과를 준다.
//    그래서 토글하는 건 **오직 `Scene3D.accents` 의 intensity** 다.
//
// 사용: node probe-emissive-bleed.js       # 게이트. 발광 바이옴이 기준 미달이면 종료코드 1
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 발광이 설계상 있는 바이옴만 대상 — 나머지는 악센트가 꺼져 있는 게 정상이라 재지 않는다.
const TARGETS = [{ ch: 9, name: 'lava' }, { ch: 7, name: 'magic' }];
const VW = 480, VH = 854;
const DTH = 3;              // 휘도 증가 문턱(8bit). 이 아래는 디더/압축 잡음으로 본다.
const GATE_PIX = 1.0;       // 영향화소 % 하한
const GATE_MAX = 12;        // 최대 휘도 증가분 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && Scene3D.scatter, null, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const rows = [];
    for (const t of TARGETS) {
        const r = await page.evaluate(([chapter, DTH]) => {
            Scene3D.setChapterTheme(chapter);
            const gl = Scene3D.renderer.getContext();
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const grab = () => { Scene3D.renderFrame(); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
            const lum = (p, i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];

            // 광원의 화면 위치(도달 반경 계산용) — 켜져 있는 것만.
            const cam = Scene3D.camera;
            Scene3D.scene.updateMatrixWorld(true); cam.updateMatrixWorld(true);
            const pts = [];
            for (const pl of Scene3D.accents) {
                if (!(pl.intensity > 0)) continue;
                const v = new THREE.Vector3().setFromMatrixPosition(pl.matrixWorld).project(cam);
                pts.push([(v.x + 1) / 2 * w, (v.y + 1) / 2 * h]);
            }

            const on = grab();
            const saved = Scene3D.accents.map(pl => pl.intensity);
            Scene3D.accents.forEach(pl => { pl.intensity = 0; });
            const off = grab();
            Scene3D.accents.forEach((pl, i) => { pl.intensity = saved[i]; });

            let n = 0, sum = 0, max = 0;
            const dists = [];
            // 반경대별 평균 Δ — '광원에 묶인 웅덩이'인지 '화면 전체 워시'인지 가른다.
            // 워시면 근/원 비가 1 에 붙는다(빛이 어디서 오는지 화면이 말해 주지 않는다).
            const BANDS = [40, 90, 160, 260, 1e9];
            const bs = BANDS.map(() => ({ n: 0, sum: 0 }));
            for (let i = 0, p = 0; i < on.length; i += 4, p++) {
                const d = lum(on, i) - lum(off, i);       // 켜서 **밝아진** 양만 센다
                if (d < DTH) continue;
                n++; sum += d; if (d > max) max = d;
                if (pts.length) {
                    const x = p % w, y = Math.floor(p / w);
                    let best = Infinity;
                    for (const q of pts) { const dd = Math.hypot(x - q[0], y - q[1]); if (dd < best) best = dd; }
                    dists.push(best);
                    for (let b = 0; b < BANDS.length; b++) if (best <= BANDS[b]) { bs[b].n++; bs[b].sum += d; break; }
                }
            }
            dists.sort((a, b) => a - b);
            return {
                litLights: pts.length, total: w * h,
                pix: 100 * n / (w * h), mean: n ? sum / n : 0, max,
                reach: dists.length ? dists[Math.floor(dists.length * 0.9)] : 0,
                intensity: saved.join('/'),
                bands: bs.map(b => ({ n: b.n, mean: b.n ? b.sum / b.n : 0 })),
                bandEdges: BANDS,
            };
        }, [t.ch, DTH]);
        rows.push({ name: t.name, ...r });
    }
    await page.close(); await browser.close();

    console.log('\n===== 발광체 라이트 블리드 — 악센트 라이트 A/B 토글 =====');
    console.log(`문턱 Δ휘도 ≥ ${DTH} · 발광 재질 자체는 토글하지 않는다(주변을 밝히는가만 본다)\n`);
    console.log('바이옴   켜진광원  세기        영향화소%   평균Δ   최대Δ   도달반경px(90%)');
    const bad = [];
    for (const r of rows) {
        console.log(`${r.name.padEnd(8)} ${String(r.litLights).padStart(6)}  ${r.intensity.padEnd(10)} ${r.pix.toFixed(2).padStart(9)} ${r.mean.toFixed(1).padStart(7)} ${r.max.toFixed(0).padStart(7)} ${r.reach.toFixed(0).padStart(15)}`);
        const lab = r.bandEdges.map((e, i) => (i ? r.bandEdges[i - 1] : 0) + '~' + (e > 1e8 ? '∞' : e));
        console.log('         반경대 평균Δ: ' + r.bands.map((b, i) => `${lab[i]}px ${b.mean.toFixed(1)}(n=${b.n})`).join('  '));
        const near = r.bands[0].mean, far = r.bands[3].mean;
        console.log(`         근/원 대비: ${far > 0 ? (near / far).toFixed(2) : '—'}  ← 1 에 가까우면 광원에 안 묶인 화면 전체 워시`);
        if (r.pix < GATE_PIX || r.max < GATE_MAX) bad.push(`${r.name} 영향화소 ${r.pix.toFixed(2)}% · 최대Δ ${r.max.toFixed(0)}`);
    }
    console.log(`\n참고선 영향화소 ≥${GATE_PIX}% · 최대Δ ≥${GATE_MAX}`);
    for (const b of bad) console.log('  ✗ ' + b);
    console.log(bad.length ? '❌ 발광체가 주변을 못 밝힌다' : '✅ 발광체가 주변 지면·소품을 실제로 물들인다');
    console.log(`콘솔 에러 ${errs.length}건`);
    process.exit(bad.length || errs.length ? 1 : 0);
})();
