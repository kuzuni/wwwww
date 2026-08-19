// probe-ground-fft.js — 근경 지면의 무늬를 2D 주파수·자기상관으로 잰다. **아직 게이트가 아니다.**
//
// 🚨🚨 **이 도구로 통과/불통과를 판정하지 말 것 (2026-08-19 실측 결론).** 아래 ⑴~⑶ 을 다 고친 뒤에도
//    수치 순위가 **눈과 반대로** 나온다. 확보한 육안 정답(`DUMP=1` 로 뜬 표본, 저장돼 있다):
//      · `fftcrop-desert.png` = **또렷한 셰브런 격자**(비평가 2인이 #1 로 지목한 그 무늬)
//      · `fftcrop-rock.png`   = 매끈한 바닥에 자갈 몇 개 (비평가 2인이 '가장 정직하다'고 지목)
//      · `fftcrop-forest.png` = 풀 포기 흩뿌림 · `fftcrop-lava.png` = 불규칙 주황 반점 (둘 다 격자 아님)
//    그런데 대역 제한까지 넣은 최종 수치는 forest 11.58 · lava 15.39 > **desert 6.14** 다.
//    즉 이 지표는 **'벽지 격자'와 '자연스러운 반복 흩뿌림'을 못 가른다** — 둘 다 주기성이 있고,
//    차이는 격자가 **위상까지 전역으로 맞아 있다**는 점인데 진폭 스펙트럼·자기상관 봉우리 높이는
//    그 위상 결맞음을 안 본다. 다음 세션은 여기서부터: **위상 결맞음**(봉우리의 날카로움/고조파 구조,
//    또는 패치를 격자 주기만큼 밀어 겹쳤을 때의 정합)을 재는 쪽으로 지표를 바꿔야 한다.
//    ⚠️ 그 전에 지면 텍스처를 손대지 말 것 — 지금 수치를 좇으면 **격자가 아닌 바이옴을 고치게 된다.**
//
// 아래는 여기까지 오며 **실제로 밟은 함정 3개**다. 다음 지표에도 그대로 적용된다.
//
// 왜 새로 만들었나: 기존 `probe-ground-tiling` 은 **행/열 방향 1D 자기상관 + 고역통과**라
// 사막 근경의 **대각 셰브런/다이아몬드 격자를 원리적으로 못 본다**(재채점에서 비평가 2인이 각각
// #1 로 지목했는데 프로브는 0.37 '반복 아님'을 냈다 — 프로브가 틀렸다). 대각 주기는 1D 자기상관의
// 축에 투영되면 흩어진다. 그래서 **방향을 가정하지 않는** 2D DFT 로 간다.
//
// 자(尺): 근경 밴드를 잘라 → 휘도 → 큰 밝기 기울기 제거(로컬 평균 차감) → **한 창(Hann)** →
// 64×64 2D DFT → DC 주변 저주파 원반 제외 → `peakRatio = 최대 진폭 / 중앙값 진폭`.
//   · 규칙 격자(벽지)면 특정 주파수에 봉우리가 서서 peakRatio 가 크다.
//   · 자연스러운 무늬면 에너지가 퍼져 peakRatio 가 작다.
// 봉우리의 방향(deg)도 같이 낸다 — 대각(45°±20)이면 셰브런/다이아몬드다.
//
// ⚠️ **창(window)을 반드시 걸 것.** 안 걸면 잘라낸 사각형의 모서리 불연속이 DFT 의 가로·세로 축에
//    강한 십자를 만든다. 그걸 '격자'로 읽으면 어느 화면이든 벽지로 판정된다(자가 만드는 유령).
// 🚨 **표본을 줄이지 말 것 — 이 자가 처음에 그래서 틀렸다.** 근경 밴드(284px)를 64 격자로 눌러
//    담았더니 4.4배 다운샘플이 되어 **모래 리플처럼 잔주기인 무늬가 통째로 앨리어싱돼 사라졌다.**
//    그 결과 비평가 2인이 #1 로 지목한 사막이 6바이옴 중 **두 번째로 낮은** 5.44 를 받았다(= 자가
//    현상을 뒤집어 읽었다). 지금은 화면 하단에서 **네이티브 해상도 128×128** 을 그대로 떠서 FFT 한다.
//
// ⑷ **수치가 눈과 어긋나면 `DUMP=1` 로 표본부터 볼 것.** 창이 엉뚱한 데를 물었는지, 무늬가 정말
//    거기 있는지가 한 장으로 끝난다 — 이번에 사막 격자의 존재를 확인한 것도 이 덤프였다.
//
// 음성 대조(자 자체는 정상 동작한다 — 합성 이미지를 **같은 파이프라인**에 태운다):
//   SYNTH=grating → 대각 격자. 실측 peakRatio 114만 · 45° · 주기 5.7px(이론 5.66) · 자기상관 0.987
//   SYNTH=noise   → 백색잡음. 실측 peakRatio 3.53 · 자기상관 0.039
//   ⚠️ **이 둘이 갈린다고 해서 실사 판정이 되는 게 아니다** — 위 🚨 참고. 합성 극단은 가르지만
//      실제 렌더의 '격자 vs 흩뿌림'은 못 가른다. 대조 통과를 판정 근거로 쓰지 말 것.
// 사용: node probe-ground-fft.js [biome...]      SYNTH=grating|noise node probe-ground-fft.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
// 테마는 `shot-biomes.js` 와 **같은 정의**를 쓴다 — 다른 값을 쓰면 조명이 달라져 수치가 안 맞는다.
const THEMES = [
    { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
];
const ONLY = process.argv.slice(2);
const BIOMES = ONLY.length ? THEMES.filter(t => ONLY.includes(t.biome)) : THEMES;
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const N = 128;            // FFT 격자 = **네이티브 화소** 크기. 줄이면 안 된다(아래 🚨).
// 🚨 **잴 대역을 무늬 대역으로 좁힐 것.** 전 대역에서 최댓값을 뽑으면 봉우리가 매번 저주파
//    (조명 얼룩·큰 반점, 주기 32~40px)에 잡혀 바이옴이 다 비슷해진다 — 눈에 보이는 격자와 무관한
//    값이다. 화면에서 '표면 무늬'로 읽히는 대역은 대략 주기 5~21px 이다.
const LOWCUT = 6;         // |f| < 6 = 주기 21px 초과 → 얼룩·기울기, 제외
const HIGHCUT = 26;       // |f| > 26 = 주기 5px 미만 → 화소 잡음, 제외
const SYNTH = process.env.SYNTH || '';
const WALLPAPER = 6.0;    // 참고선일 뿐 — 판정 근거가 아니다(파일 상단 🚨)

// 근경 밴드를 잘라 N×N 휘도 격자로 만든다(페이지 안에서 끝내 전송량을 줄인다).
const INPAGE = `(theme, N, synth) => {
    Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
    const cv = document.querySelector('canvas'), W = cv.width, H = cv.height;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const cx = off.getContext('2d'); cx.drawImage(cv, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;
    // 근경 = 화면 **맨 아래**(가장 가까운 지면)에서 네이티브 N×N 을 그대로 떠 온다.
    // 리샘플하지 않는다 — 화소를 줄이면 잔주기 무늬가 앨리어싱으로 사라진다(파일 상단 🚨).
    const x0 = Math.max(0, Math.floor((W - N) / 2)), y0 = Math.max(0, H - N - 2);
    const g = new Float64Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const p = ((y0 + j) * W + (x0 + i)) * 4;
        g[j * N + i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }
    if (synth) { // 음성 대조 — 같은 파이프라인에 합성 이미지를 태운다
        let seed = 12345;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            g[j * N + i] = synth === 'grating'
                ? 128 + 60 * Math.cos((i + j) * Math.PI * 2 * 16 / N)  // 대각(45°) 격자
                : 128 + 60 * (rnd() - 0.5) * 2;                        // 백색잡음
        }
    }
    // DUMP=1 이면 **내가 실제로 무엇을 재고 있는지** 잘라낸 조각을 그대로 돌려준다.
    // 수치가 눈과 어긋날 때 제일 먼저 볼 것 — 표본 창이 엉뚱한 데(길·프롭)를 물고 있을 수 있다.
    let dump = null;
    if (window.__dump) {
        const dc = document.createElement('canvas'); dc.width = N; dc.height = N;
        dc.getContext('2d').drawImage(off, x0, y0, N, N, 0, 0, N, N);
        dump = dc.toDataURL('image/png').split(',')[1];
    }
    return { g: Array.from(g), dump, W, H, x0, y0 };
}`;

// 라딕스2 복소 FFT (제자리). N 은 2의 거듭제곱이어야 한다.
function fft1(re, im, off, stride, n) {
    for (let i = 1, j = 0; i < n; i++) {          // 비트반전 순열
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const a = off + i * stride, b = off + j * stride;
            let t = re[a]; re[a] = re[b]; re[b] = t;
            t = im[a]; im[a] = im[b]; im[b] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = off + (i + k) * stride, b = off + (i + k + len / 2) * stride;
                const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                re[b] = re[a] - xr; im[b] = im[a] - xi;
                re[a] += xr; im[a] += xi;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
}
function fft2(re, im) {
    for (let j = 0; j < N; j++) fft1(re, im, j * N, 1, N);   // 행
    for (let i = 0; i < N; i++) fft1(re, im, i, N, N);       // 열
}

function analyze(g) {
    // ⑴ 로컬 평균 차감 — 조명/원근이 만드는 큰 기울기를 뺀다(저주파를 지우는 게 목적).
    // 🚨 **창을 무늬 주기보다 훨씬 크게 잡을 것.** 처음엔 R=6(13×13 상자)이었는데, 잡으려던 사막
    //    셰브런의 주기가 마침 ~12px 이라 **재려는 신호를 고역통과로 지워 버렸다.** 그래서 눈에는
    //    또렷한 격자가 보이는 사막이 rock 보다 낮은 점수를 받았다(desert 19.83 vs rock 19.43).
    //    R=24(49×49)면 조명 기울기만 빠지고 무늬는 남는다.
    const blur = new Float64Array(N * N), R = 24;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let s = 0, n = 0;
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
            const y = j + dj, x = i + di;
            if (y < 0 || y >= N || x < 0 || x >= N) continue;
            s += g[y * N + x]; n++;
        }
        blur[j * N + i] = s / n;
    }
    // ⑵ Hann 창 — 없으면 잘린 모서리가 DFT 축에 유령 십자를 만든다
    const win = new Float64Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const wi = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
        const wj = 0.5 * (1 - Math.cos(2 * Math.PI * j / (N - 1)));
        win[j * N + i] = (g[j * N + i] - blur[j * N + i]) * wi * wj;
    }
    // ⑶ 2D FFT 진폭 — N=128 이면 소박한 DFT 는 2.7억 회라 못 쓴다. 행-열 라딕스2 로 간다.
    const re = Float64Array.from(win), im = new Float64Array(N * N);
    fft2(re, im);
    const half = N / 2;
    const mags = [];
    let best = { m: -1, u: 0, v: 0 };
    for (let v = -half; v < half; v++) for (let u = -half; u < half; u++) {
        const r = Math.hypot(u, v);
        if (r < LOWCUT || r > HIGHCUT) continue;
        const iu = (u + N) % N, iv = (v + N) % N, k = iv * N + iu;
        const m = Math.hypot(re[k], im[k]);
        mags.push(m);
        if (m > best.m) best = { m, u, v };
    }
    // ⑷ 2D 자기상관 — 위너-힌친(|F|² 의 변환)으로 공짜로 얻는다.
    // 🚨 peakRatio 만으로는 부족하다. 자연스러운 무늬도 지배 주파수는 하나씩 갖는다(실측: 비평가가
    //    '6종 중 가장 정직하다'고 지목한 rock 19.43 vs '교과서적 벽지'라 지목한 desert 19.83 —
    //    **두 값이 구분이 안 된다**). 비평가가 보는 건 '주파수가 있다'가 아니라 **같은 무늬가 N화소
    //    옆에 그대로 또 나온다** 이고, 그건 자기상관의 **비영 지연 봉우리**가 재는 값이다.
    const pr = new Float64Array(N * N), pi = new Float64Array(N * N);
    for (let k = 0; k < N * N; k++) { pr[k] = re[k] * re[k] + im[k] * im[k]; pi[k] = 0; }
    fft2(pr, pi);                       // 실수·우함수라 역변환 대신 정변환으로 충분(지연 부호만 뒤집힌다)
    const zero = pr[0] || 1e-9;
    let acf = 0, alag = 0;
    for (let v = -half; v < half; v++) for (let u = -half; u < half; u++) {
        const r = Math.hypot(u, v);
        if (r < 5 || r > 24) continue;    // 지연 5px 미만은 자기 어깨, 24px 초과는 얼룩 대역
        const k = ((v + N) % N) * N + ((u + N) % N);
        if (pr[k] / zero > acf) { acf = pr[k] / zero; alag = r; }
    }
    mags.sort((a, b) => a - b);
    const med = mags[Math.floor(mags.length / 2)] || 1e-9;
    // 방향: 봉우리 벡터의 각(0=가로 줄무늬 축, 90=세로). 대각이면 45 근처.
    let deg = Math.abs(Math.atan2(best.v, best.u) * 180 / Math.PI);
    if (deg > 90) deg = 180 - deg;
    return { peakRatio: best.m / med, deg, period: N / Math.hypot(best.u, best.v), u: best.u, v: best.v, acf, alag };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const rows = [];
    // 한 페이지에서 테마만 갈아 끼운다(shot-biomes 와 같은 방식). 프롭 배치가 전부 Math.random 이라
    // **시드를 고정하지 않으면** 전/후 대조가 성립하지 않는다 — 같은 이유로 여기서도 고정한다.
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        let s = 0x51f3a7d;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        if (Scene3D.heroG) Scene3D.heroG.visible = false;
        Scene3D.clearEnemies && Scene3D.clearEnemies();
    });
    if (process.env.DUMP) await page.evaluate(() => { window.__dump = true; });
    for (const t of BIOMES) {
        await page.evaluate((t) => { Scene3D.setTheme(t); Scene3D.walking = false; Scene3D.worldX = 0; }, t);
        await page.waitForTimeout(700);
        const r = await page.evaluate(([s, th, n, sy]) => (new Function('return ' + s))()(th, n, sy), [INPAGE, t, N, SYNTH]);
        if (r.dump) { require('fs').writeFileSync(path.resolve(__dirname, `fftcrop-${t.biome}.png`), Buffer.from(r.dump, 'base64')); console.log(`표본 저장: fftcrop-${t.biome}.png  (창 ${N}x${N} @ ${r.x0},${r.y0} / 캔버스 ${r.W}x${r.H})`); }
        rows.push(Object.assign({ biome: t.biome }, analyze(r.g)));
    }
    await page.close();
    console.log(`\n===== 근경 지면 2D 주파수 실측${SYNTH ? ' — 음성 대조 SYNTH=' + SYNTH : ''} =====`);
    console.log('바이옴     peakRatio   방향   주기(px)   자기상관(비영지연)  지연(px)   판정');
    let wall = 0;
    for (const r of rows) {
        const bad = r.peakRatio >= WALLPAPER;
        if (bad) wall++;
        console.log(`${r.biome.padEnd(10)} ${r.peakRatio.toFixed(2).padStart(9)} ${(r.deg.toFixed(0) + 'd').padStart(6)} `
            + `${r.period.toFixed(1).padStart(9)} ${r.acf.toFixed(3).padStart(18)} ${r.alag.toFixed(0).padStart(9)}   `
            + `${bad ? '주기 강함' : '주기 약함'}`);
    }
    console.log(`\n콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`참고선(peakRatio ${WALLPAPER}) 위 ${wall}/${rows.length} 바이옴 — ⚠️ 판정 아님.`);
    console.log('  이 지표는 격자와 자연 흩뿌림을 못 가른다(파일 상단 🚨). 육안 정답은 DUMP=1 표본으로.');
    if (SYNTH === 'grating') console.log('대조: 큰 peakRatio + 45° 면 변환 자체는 정상. (실사 판정력과는 별개)');
    if (SYNTH === 'noise') console.log('대조: 작은 peakRatio 면 유령을 안 만든다는 뜻. (실사 판정력과는 별개)');
    await browser.close();
    process.exit(0);   // 측정 도구다. 게이트가 아니므로 종료코드로 판정하지 않는다.
})();
