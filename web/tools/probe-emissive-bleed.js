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
// ── 안정성 (regress.sh 등재 전에 확인한 것) ────────────────────────────────────
//   시드 고정 **전** 같은 코드 4회: 정합비 3.29 / 1.91 / 1.57 / 1.81 (폭 1.72) — 게이트로 못 쓴다.
//   시드 고정 **후** 3회: 2.27 / 2.33 / 2.57 (폭 0.30). 기준선 1.3 대비 최소값이 75% 여유다.
//   ⚠️ 완전 결정론은 아니다(잔여 흔들림은 swiftshader 의 가산 데칼 래스터화). 튜닝은 폭 0.3 을
//   넘는 변화에만 근거로 쓸 것.
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
const GATE_MAX = 12;       // 최대 휘도 증가분 하한
const GATE_ALIGN = 1.3;    // '광원 발밑 발광 밝기 ÷ 같은 z 임의 지면' 하한 — 빛이 균열 위에 있는가

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
            // 🚨 **시드를 고정하지 않으면 게이트로 못 쓴다.** 균열 자리(`crackWorldSpots`)는 주 혈관
            //   경로 위 점을 난수로 고르고 대조군 오프셋도 난수라, 같은 코드로 4회 돌렸더니 정합비가
            //   **3.29 / 1.91 / 1.57 / 1.81** 로 흔들렸다(개선폭만큼 큰 흔들림). `setChapterTheme` 앞에서
            //   고정 시드를 심어 배치·대조군을 재현 가능하게 만든다(`probe-midground-depth` 와 같은 규약).
            let rs = 0x9e3779b9 >>> 0;
            Math.random = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
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

            // ── 정합: 빛 웅덩이가 **균열 위**에 있는가 (map-quality-up 2026-08-20) ──────────
            // 악센트를 끈 화면(off)에는 발광 재질만 남는다. 그 화면에서 **광원 발밑 화소**가
            // **같은 z 대역의 임의 지면 화소**보다 밝아야 빛이 균열 위에 있는 것이다.
            // 🚨 광원 자체(y=0.5)가 아니라 **발밑 지면점**을 투영한다 — 균열은 지면에 있다.
            const groundLum = (wx, wy, wz) => {
                const v = new THREE.Vector3(wx, wy, wz).project(cam);
                if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return null;
                const px = Math.round((v.x + 1) / 2 * w), py = Math.round((v.y + 1) / 2 * h);
                if (px < 0 || py < 0 || px >= w || py >= h) return null;
                const i = (py * w + px) * 4;
                return lum(off, i);
            };
            let hit = [], ctrl = [];
            const spots = Scene3D.crackGlowSpots;
            if (spots && spots.length) {
                // 🚨 **한 자리에서만 재면 표본이 2개뿐이다** — 균열 자리는 지면 한 주기(x 12타일)에
                //   흩어져 있는데 한 화면에 들어오는 건 두어 개뿐이라, 그 둘이 어쩌다 밝으면 통과가
                //   나온다. 카메라를 주기만큼 패닝하며 각 자리를 화면에 들여 재고 전부 합산한다.
                const baseX = cam.position.x;
                const PAN = 9, PERIOD = 30;
                for (let s2 = 0; s2 < PAN; s2++) {
                    cam.position.x = baseX - PERIOD / 2 + PERIOD * s2 / PAN;
                    cam.lookAt(cam.position.x, 0.9, 0);
                    cam.updateMatrixWorld(true);
                    const frame = (Scene3D.renderFrame(), (() => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; })());
                    const at = (wx, wy, wz) => {
                        const v = new THREE.Vector3(wx, wy, wz).project(cam);
                        if (v.z > 1 || v.x < -0.95 || v.x > 0.95 || v.y < -0.95 || v.y > 0.95) return null;
                        const px = Math.round((v.x + 1) / 2 * w), py = Math.round((v.y + 1) / 2 * h);
                        if (px < 0 || py < 0 || px >= w || py >= h) return null;
                        return lum(frame, (py * w + px) * 4);
                    };
                    const gx = Scene3D.ground.position.x;
                    for (const s of spots) {
                        const v = at(s[0] + gx, Scene3D.heightAt(s[0], s[1]) + 0.05, s[1]);
                        if (v !== null) hit.push(v);
                        // 대조군: 같은 z, x 만 임의로 옮긴 지면점(균열과 무관한 자리)
                        for (let k = 0; k < 3; k++) {
                            const rx = s[0] + (Math.random() * 2 - 1) * 6;
                            const c = at(rx + gx, Scene3D.heightAt(rx, s[1]) + 0.05, s[1]);
                            if (c !== null) ctrl.push(c);
                        }
                    }
                }
                cam.position.x = baseX; cam.lookAt(baseX, 0.9, 0); cam.updateMatrixWorld(true);
            }
            const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

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
                align: { n: hit.length, hit: avg(hit), ctrl: avg(ctrl) },
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
        if (r.align && r.align.n) {
            const ratio = r.align.ctrl > 0 ? r.align.hit / r.align.ctrl : 0;
            console.log(`         균열 정합: 광원 발밑 ${r.align.hit.toFixed(1)} vs 대조군 ${r.align.ctrl.toFixed(1)} = ${ratio.toFixed(2)}배 (표본 ${r.align.n})`);
            if (ratio < GATE_ALIGN) bad.push(`${r.name} 균열 정합 ${ratio.toFixed(2)}배 — 빛이 균열 위에 없다`);
        }
        if (r.pix < GATE_PIX || r.max < GATE_MAX) bad.push(`${r.name} 영향화소 ${r.pix.toFixed(2)}% · 최대Δ ${r.max.toFixed(0)}`);
    }
    console.log(`\n참고선 영향화소 ≥${GATE_PIX}% · 최대Δ ≥${GATE_MAX}`);
    for (const b of bad) console.log('  ✗ ' + b);
    console.log(bad.length ? '❌ 발광체가 주변을 못 밝힌다' : '✅ 발광체가 주변 지면·소품을 실제로 물들인다');
    console.log(`콘솔 에러 ${errs.length}건`);
    process.exit(bad.length || errs.length ? 1 : 0);
})();
