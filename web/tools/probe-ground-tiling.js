// 지면이 '반복되는 벽지'로 읽히는지 실측 — `map-quality-up` 잔여 결함 ㉰
// ("사막 물결 데칼 스케일: 근경~원경 동일 스케일 반복이 '벽지'로 읽힘").
//
// 무엇을 재는가: **실제로 렌더된 화면**(gl.readPixels)의 지면 영역에서 자기상관(autocorrelation) 봉우리.
//   · 지면만 남기고(영웅·적·소품·UI 숨김) 화면을 근경/중경/원경 3띠로 나눈다.
//   · 각 띠에서 가로 방향 자기상관을 내어, 0 이 아닌 시차(lag)에서의 **최대 봉우리**를 본다.
//     무늬가 규칙적으로 반복되면 특정 시차에서 상관이 크게 튄다 = '벽지'.
//     자연스러운 지면은 시차가 커질수록 상관이 완만히 떨어지기만 한다.
//   · 세로 방향도 같이 본다 — 사막 물결은 가로로 눕는 밴드라 세로 반복으로 나타난다.
// ⚠️ 봉우리는 **행/열 평균을 뺀 뒤 분산으로 정규화**해서 낸다(밝기 그라디언트가 상관으로 안 새게).
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-ground-tiling.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CHAPTERS = [2, 1, 4, 9];   // 사막(지적 대상)·초원·설원·용암
const PEAK_MAX = 0.42;           // 자기상관 봉우리 상한 — 이 위는 반복이 눈에 띈다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.ground)) break;
        await page.waitForTimeout(200);
    }

    const rows = [];
    for (const ch of CHAPTERS) {
        const r = await page.evaluate((chapter) => {
            Scene3D.setChapterTheme(chapter);
            const R = Scene3D.renderer, gl = R.getContext();
            const w = R.domElement.width, h = R.domElement.height;
            // 지면만 남긴다 — 영웅·적·소품·능선이 섞이면 자기상관이 그것들을 잡는다
            const hidden = [];
            Scene3D.scene.traverse(o => {
                if (o === Scene3D.scene || o === Scene3D.ground) return;
                let p = o.parent, underGround = false;
                while (p) { if (p === Scene3D.ground) { underGround = true; break; } p = p.parent; }
                if (underGround) return;                       // 스캐터는 지면의 일부로 본다
                if (o.isMesh && o.visible) { o.visible = false; hidden.push(o); }
            });
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            for (const o of hidden) o.visible = true;

            // gl.readPixels 는 아래(y=0)가 화면 바닥이다. 지평선 아래만 쓴다.
            const cam = Scene3D.camera;
            const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
            const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
            hp.project(cam);
            const yHorPx = Math.min(h - 1, Math.round((hp.y + 1) / 2 * h));   // readPixels 좌표계
            const lumAt = (x, y) => {
                const i = (y * w + x) * 4;
                return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
            };
            // 🚨 자기상관 전에 **고역통과**(이동평균 차감)를 반드시 건다.
            //    안 걸면 원경의 완만한 밝기 그라디언트(안개로 멀수록 밝아지는 것)가 어느 시차에서나
            //    높은 상관을 내서, 무늬가 없어도 '벽지'라는 유령 결과가 나온다.
            //    반복 무늬는 고주파 성분이므로 저주파를 빼고 나야 진짜 주기성만 남는다.
            const highPass = (vals, win) => {
                const n = vals.length, out = new Array(n);
                for (let i = 0; i < n; i++) {
                    let s = 0, c = 0;
                    for (let k = -win; k <= win; k++) {
                        const j = i + k;
                        if (j >= 0 && j < n) { s += vals[j]; c++; }
                    }
                    out[i] = vals[i] - s / c;
                }
                return out;
            };
            // 1-D 자기상관 봉우리 (평균 제거 + 분산 정규화)
            const acPeak = (raw, minLag) => {
                const vals = highPass(raw, 16);
                const n = vals.length;
                if (n < minLag * 3) return 0;
                let m = 0; for (const v of vals) m += v; m /= n;
                let v0 = 0; for (const v of vals) v0 += (v - m) * (v - m);
                if (v0 < 1e-9) return 0;
                let peak = 0;
                for (let lag = minLag; lag < n / 2; lag++) {
                    let s = 0;
                    for (let i = 0; i + lag < n; i++) s += (vals[i] - m) * (vals[i + lag] - m);
                    // 겹치는 표본 수로 보정한 정규화 상관
                    const c = s / (v0 * (n - lag) / n);
                    if (c > peak) peak = c;
                }
                return peak;
            };
            // 지평선 아래를 3띠로 (0 = 근경 = readPixels y 작은 쪽)
            const bands = [];
            for (let b = 0; b < 3; b++) {
                const y0 = Math.round(yHorPx * b / 3), y1 = Math.round(yHorPx * (b + 1) / 3);
                // 가로 자기상관: 각 행마다 내어 평균
                let hSum = 0, hN = 0;
                for (let y = y0 + 2; y < y1 - 2; y += 4) {
                    const row = [];
                    for (let x = 0; x < w; x++) row.push(lumAt(x, y));
                    hSum += acPeak(row, 12); hN++;
                }
                // 세로 자기상관: 각 열마다 (띠 안에서만)
                let vSum = 0, vN = 0;
                for (let x = 8; x < w - 8; x += 12) {
                    const col = [];
                    for (let y = y0; y < y1; y++) col.push(lumAt(x, y));
                    vSum += acPeak(col, 8); vN++;
                }
                bands.push({ h: hN ? hSum / hN : 0, v: vN ? vSum / vN : 0, px: y1 - y0 });
            }
            return { bands, yHorPx, w, h };
        }, ch);
        rows.push({ ch, ...r });
    }
    await browser.close();

    let fail = 0;
    console.log('ch | 근경 가로/세로 | 중경 가로/세로 | 원경 가로/세로 | 최대');
    for (const r of rows) {
        const all = r.bands.flatMap(b => [b.h, b.v]);
        const mx = Math.max(...all);
        const ok = mx <= PEAK_MAX;
        if (!ok) fail++;
        console.log(String(r.ch).padStart(2) + ' | ' +
            r.bands.map(b => b.h.toFixed(2) + '/' + b.v.toFixed(2)).join('   |  ') +
            '  | ' + mx.toFixed(2) + (ok ? ' ok' : ' ✗'));
    }
    console.log('기준: 자기상관 봉우리 ≤ ' + PEAK_MAX + ' (이 위는 규칙적 반복 = 벽지)');
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(fail === 0 ? 'PASS — 반복 무늬가 눈에 띄지 않는다' : 'FAIL — ' + fail + '/' + rows.length + ' 챕터 초과');
})();
