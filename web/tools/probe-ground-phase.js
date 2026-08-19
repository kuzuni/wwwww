// probe-ground-phase.js — 지면 무늬가 '벽지 격자'냐 '자연스러운 흩뿌림'이냐를 **위상 결맞음**으로 가른다.
//
// ── 왜 또 만들었나 (선행 실패 2건을 반드시 읽을 것) ───────────────────────────────
//   `probe-ground-tiling`(1D 자기상관) → 대각 무늬를 원리적으로 못 봄. 사막 격자에 0.37 '반복 아님'.
//   `probe-ground-fft`(2D 진폭 스펙트럼 + 봉우리 **높이**) → **눈과 반대 순위**를 냄:
//        forest 11.58 · lava 15.39 · snow 10.11 > **desert 6.14** · rock 5.07
//        (육안 정답은 desert 만 격자 — `fftcrop-*.png`. 비평가 2인이 각각 #1 로 지목했다.)
//   둘 다 같은 이유로 틀렸다 — **|F|² 는 위상을 버린다.** 풀 포기 흩뿌림도 '지배 주파수'는 갖는다
//   (포기 굵기·간격의 특성 스케일). 격자와 다른 점은 주파수의 **존재**가 아니라 그 주파수가
//   **화면을 가로질러 같은 위상으로 이어진다**는 것이다. 진폭만 보는 자는 이 차이에 눈이 없다.
//
// ── 재는 것: 밀어 겹치기(shift registration)와 그 **지속성** ──────────────────────
//   무늬를 (dx,dy) 만큼 밀어 자기 자신과 겹친 뒤 피어슨 상관 ρ 를 낸다. ρ 가 **주변보다 도로 솟는**
//   자리 p 가 '무늬가 스스로를 되풀이하는 벡터'다. 여기서 멈추면 안 된다 — 흩뿌림도 우연히 한 번은
//   맞는다. **벽지의 정의는 p 에서 한 번 맞는 게 아니라 2p·3p 에서도 계속 맞는다는 것**이다:
//     · 벽지 격자   = 위상이 타일 끝까지 유지 → ρ(p) ≈ ρ(2p) ≈ ρ(3p), 높게 평평
//     · 자연 흩뿌림 = 한 주기 지나면 위상이 풀림 → ρ(2p),ρ(3p) 가 급락
//   판정값 `coh` = **min(ρ(2p), ρ(3p))** (둘 다 살아 있어야 벽지). ρ(p) 는 참고로 병기.
//
// ── 무엇을 재는가: **텍스처 자체**(렌더가 아니라) ────────────────────────────────
//   `Scene3D.makeGroundTexture(biome)` 가 만든 512² 캔버스를 그대로 잰다. 결함도, 고칠 곳도 거기다.
//   🚨 렌더 화면을 재는 길도 만들어 봤고(`RENDER=1` 로 남겨 뒀다) **게이트로는 못 쓴다**:
//     원근 보정까지 넣어도 desert 0.123 vs lava 0.054 로 **여유가 2배뿐**이다. 원인은 판정력이
//     아니라 희석이다 — 보정 패치의 먼 1/3 이 원본 화소 밀도 부족으로 뭉개지고, 바위·길 데칼이
//     분산을 나눠 갖는다. 같은 자를 텍스처에 대면 **desert 0.184 vs 나머지 전부 0.000** 이다.
//     그래서 게이트는 텍스처로 잠그고, '화면에도 실제로 나타나는지'는 `shot-biomes.js` 캡처로 본다.
//
// 🚨 **위상 맞춤을 '탐색'으로 하지 말 것 — 첫 판이 정확히 그래서 무너졌다.**
//   처음엔 블록별 푸리에 위상의 PLV 를 쓰고 부분화소 (δu,δv) 를 훑어 최댓값을 취했다. 블록이 8개뿐인데
//   훑는 자유도가 324개라 **백색잡음이 coh 0.69** 를 받았다(양성 대조 grating 0.79 와 구분 불가).
//   지금은 맞출 파라미터가 없다 — ρ 를 **그냥 계산**하고, 판정은 최댓값이 아니라 배수 lag 의 지속성이다.
//
// 🚨 **최댓값을 그냥 고르지도 말 것.** lag 하한만 두고 argmax 를 취했더니 6바이옴 전부 하한값 자체를
//   골랐다(전부 p=4px). 그건 되풀이가 아니라 **자기 어깨**(몇 화소 민 그림이 원본과 닮은 것)이고,
//   어깨는 lag 이 커질수록 단조 감소하므로 2·3배가 '그럭저럭 높은' 값을 받아 rock·snow 가 desert
//   위로 갔다. 되풀이의 정의는 '높다'가 아니라 **주변보다 도로 솟는다** — 그래서 lag 평면의
//   **국소 최댓값**만 후보로 본다. 단조 감소하는 어깨에는 국소 최댓값이 없다.
//
// 🚨 **로컬 평균 차감(고역통과) + 윈저화를 먼저.** 차감이 없으면 큰 명도 얼룩이 모든 lag 에서 상관을
//   만들고, 윈저화가 없으면 소수의 극단 화소(바위·균열)가 분산을 독점해 무늬 몫이 지워진다.
//   차감 창은 **무늬 주기보다 훨씬 크게** — 선행 자가 R=6 으로 잡으려던 주기 ~12px 셰브런을 지웠다.
//
// ── 대조군 (`SYNTH=` 로 **같은 파이프라인**에 합성 이미지를 태운다) ────────────────
//   SYNTH=grating  대각 격자                              → coh ≈ 1  (양성)
//   SYNTH=noise    백색잡음                                → coh ≈ 0  (음성)
//   SYNTH=scatter  **같은 모양 반점을 무작위 위치에 뿌림**  → coh ≈ 0  (음성, **핵심**)
//     scatter 는 진폭 스펙트럼에 뚜렷한 봉우리가 서지만 위상은 제각각이다. 선행 자 둘이 정확히
//     여기서 격자와 구분을 못 했으므로, **이 대조를 통과하는 것이 이 도구의 존재 이유**다.
//
// 사용: node probe-ground-phase.js [biome...]        # 게이트. coh ≥ 참고선이면 종료코드 1
//       SYNTH=grating|noise|scatter node probe-ground-phase.js
//       DUMP=1 이면 잰 그림을 `texdump-<이름>.png` 로 떨군다(수치가 눈과 어긋나면 여기부터).
//       RENDER=1 이면 원근 보정한 실제 화면을 잰다(참고용 — 위 🚨 대로 게이트 아님).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

// 테마 정의는 `shot-biomes.js`·`probe-ground-fft.js` 와 **같은 값**(조명이 달라지면 렌더 수치가 안 맞는다).
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

const RENDER = !!process.env.RENDER;
const SYNTH = process.env.SYNTH || '';
const HP_R = 21;          // 고역통과 반경(무늬 주기보다 훨씬 크게)
const RLAG = 5;           // 자기 어깨 제외 반경
const DMAX = 200;         // 훑을 최대 lag. 타일 반주기(256) 아래로 둬 타일 자체 주기를 안 집는다.
//   150 이면 사막의 3p(=192)가 범위 밖이라 지속성을 2p 하나로만 판단하게 된다 — 3배까지 보려고 200.
const WALL = 0.10;        // 참고선. 이론값이 아니라 실측으로 잡았다:
//   수정 전 텍스처 desert 0.183(되풀이 벡터 128px 수평) / 나머지 5바이옴 전부 0.010 이하 — 18배 차.
//   합성 대조 grating 0.827 · noise 0.000 · scatter 0.000. 양쪽 여유가 커서 0.10 에서 잘랐다.
const RW = 320, RH = 192, BANDFRAC = +(process.env.BANDFRAC || 0.38);   // RENDER=1 전용

// ── 페이지 안: 잴 그림 한 장을 휘도 배열로 만들어 돌려준다 ───────────────────────
const INPAGE = `(theme, opt) => {
    const { render, RW, RH, BANDFRAC, synth } = opt;
    let N, M, g;
    if (render) {
        // ── 원근 보정(rectify) ──────────────────────────────────────────────────
        // 지면은 기울어 있어 같은 무늬라도 화면에서는 깊이에 따라 주기가 변한다. 그 상태로 상수
        // (dx,dy) 만큼 밀어 겹치면 **결맞은 격자조차 정합이 안 된다**(실측: 눈에 뚜렷한 사막
        // 셰브런이 coh 0.000 을 받았다). 카메라로 화면↔지면(y=0) 사상을 풀어 월드 등간격으로 뜬다.
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        const cv = document.querySelector('canvas'), W = cv.width, H = cv.height;
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const cx = off.getContext('2d'); cx.drawImage(cv, 0, 0, W, H);
        const src = cx.getImageData(0, 0, W, H).data;
        const lum = (x, y) => {                 // 이중선형(비정수 좌표를 밟으므로 최근접은 무늬를 깬다)
            x = Math.max(0, Math.min(W - 1.001, x)); y = Math.max(0, Math.min(H - 1.001, y));
            const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
            let v = 0;
            for (const q of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]) {
                const p = ((yi + q[1]) * W + (xi + q[0])) * 4;
                v += q[2] * (0.299 * src[p] + 0.587 * src[p+1] + 0.114 * src[p+2]);
            }
            return v;
        };
        const cam = Scene3D.camera; cam.updateMatrixWorld();
        const un = (nx, ny) => {
            const a = new THREE.Vector3(nx, ny, -1).unproject(cam);
            const b = new THREE.Vector3(nx, ny, 1).unproject(cam);
            const d = b.clone().sub(a);
            if (Math.abs(d.y) < 1e-6) return null;
            const t = -a.y / d.y;
            return t > 0 ? [a.x + d.x * t, a.z + d.z * t] : null;
        };
        const V = new THREE.Vector3();
        const proj = (x, z) => { V.set(x, 0, z).project(cam); return [(V.x * 0.5 + 0.5) * W, (-V.y * 0.5 + 0.5) * H]; };
        const zNear = un(0, -1)[1], zFar = un(0, -1 + 2 * BANDFRAC)[1];
        let xw = 0.05;
        for (let t = 0.05; t < 12; t += 0.05) {
            if (![zNear, zFar].every(z => proj(t, z)[0] < W - 2 && proj(-t, z)[0] > 2)) break;
            xw = t;
        }
        N = RW; M = RH; g = new Float64Array(N * M);
        for (let j = 0; j < M; j++) {
            const z = zNear + (zFar - zNear) * (j / (M - 1));
            for (let i = 0; i < N; i++) {
                const p = proj(-xw + 2 * xw * (i / (N - 1)), z);
                g[j * N + i] = lum(p[0], p[1]);
            }
        }
    } else {
        // ── 텍스처 자체 ─────────────────────────────────────────────────────────
        const tex = Scene3D.makeGroundTexture(theme.biome);
        const cv = tex.image; N = M = cv.width;
        const d = cv.getContext('2d').getImageData(0, 0, N, M).data;
        g = new Float64Array(N * M);
        for (let k = 0; k < N * M; k++) g[k] = 0.299 * d[k*4] + 0.587 * d[k*4+1] + 0.114 * d[k*4+2];
        if (tex.dispose) tex.dispose();
    }
    if (synth) {
        // 🚨 **난수기를 곱셈 LCG 로 쓰지 말 것 — 음성 대조가 이것 때문에 거짓으로 무너졌다.**
        // 흔히 쓰는 s = (s * 1103515245 + 12345) & 0x7fffffff 은 JS 배정도에서 s·1103515245 가
        // 2^53 을 넘겨 하위 비트가 잘린다. 그래서 '백색잡음'이 격자 구조를 갖고, 실측으로
        // **ρ(60,-41) = 0.79** 가 나왔다(진짜 백색잡음이면 ±0.015). 자가 멀쩡한데 대조가 벽지로
        // 나오는 바람에 자를 의심하며 한참 헤맸다. 정수 연산만 쓰는 xorshift32 로 바꿨다.
        let s = 0x9e3779b9 >>> 0;
        const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        if (synth === 'scatter') {
            // 같은 모양의 반점을 **무작위 위치**에 뿌린다 — 진폭 스펙트럼엔 특성 주기가 서지만
            // 위상은 제각각이다. 격자와 이걸 가르는 게 이 도구의 목적.
            g.fill(128);
            const R = 3;
            for (let n = 0; n < N * M / 220; n++) {
                const px = rnd() * N, py = rnd() * M;
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                    const x = Math.round(px + dx), y = Math.round(py + dy);
                    if (x < 0 || x >= N || y < 0 || y >= M) continue;
                    const r = Math.hypot(dx, dy); if (r > R) continue;
                    g[y * N + x] += 70 * Math.cos(r / R * Math.PI / 2);
                }
            }
        } else for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
            g[j * N + i] = synth === 'grating'
                ? 128 + 60 * Math.cos((i + j) * Math.PI * 2 / 11.3)
                : 128 + 60 * (rnd() - 0.5) * 2;
        }
    }
    let dump = null;
    if (window.__dump) {
        const dc = document.createElement('canvas'); dc.width = N; dc.height = M;
        const dx = dc.getContext('2d'), im = dx.createImageData(N, M);
        for (let k = 0; k < N * M; k++) {
            const v = Math.max(0, Math.min(255, g[k]));
            im.data[k*4] = im.data[k*4+1] = im.data[k*4+2] = v; im.data[k*4+3] = 255;
        }
        dx.putImageData(im, 0, 0);
        dump = dc.toDataURL('image/png').split(',')[1];
    }
    return { g: Array.from(g), N, M, dump };
}`;

// ── 라딕스2 복소 FFT (제자리, 1차원) ────────────────────────────────────────────
function fft1(re, im, off, stride, n, inv) {
    for (let i = 1, j = 0; i < n; i++) {
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
        const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
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
function fft2(re, im, N, M, inv) {
    for (let j = 0; j < M; j++) fft1(re, im, j * N, 1, N, inv);
    for (let i = 0; i < N; i++) fft1(re, im, i, N, M, inv);
}

// ── 겹침 기반 피어슨 상관(렌더 패치용 — 타일이 아니라 순환 이동이 성립하지 않는다) ──
function nccDirect(a, N, M, dx, dy) {
    const xs = Math.max(0, -dx), xe = Math.min(N, N - dx), ys = 0, ye = M - Math.abs(dy);
    const n = (xe - xs) * (ye - ys);
    if (n < 4000) return null;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = ys; y < ye; y++) {
        const r0 = y * N, r1 = (y + dy) * N;
        for (let x = xs; x < xe; x++) {
            const p = a[r0 + x], q = a[r1 + x + dx];
            sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q;
        }
    }
    const ma = sa / n, mb = sb / n, va = saa / n - ma * ma, vb = sbb / n - mb * mb;
    if (va <= 1e-9 || vb <= 1e-9) return null;
    return (sab / n - ma * mb) / Math.sqrt(va * vb);
}

// 순환 맵에서 dmax 를 넘는 배수 lag 도 읽는다 — 타일이 실제로 이어 붙으므로 모듈로가 정답이다.
function mapAtWrapped(map, W, dmax, dx, dy, N, M) {
    let x = ((dx % N) + N) % N, y = ((dy % M) + M) % M;
    if (x > N / 2) x -= N;
    if (y > M / 2) y -= M;
    if (Math.abs(x) > dmax || Math.abs(y) > dmax) return NaN;
    // 🚨 배수 lag 이 타일 주기를 넘어 **0 근처로 되감기면** 그건 되풀이의 증거가 아니라 자기 어깨다.
    //   실측: 사막 p=171 의 3배 513 이 타일 512 를 넘어 lag 1 로 감겨 ρ=0.70 을 받았다(자기 자신과의
    //   상관). 그대로 두면 '3배에서도 잠긴다'는 거짓 근거가 된다 — 잴 수 없는 것으로 처리한다.
    if (Math.hypot(x, y) < RLAG) return NaN;
    return map[(y + dmax) * W + (x + dmax)];
}

function analyze(g, N, M, circular) {
    // ⑴ 로컬 평균 차감. 상자 창을 성글게(step 3) 훑어도 평균은 사실상 같고 훨씬 빠르다.
    const hp = new Float64Array(N * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        let s = 0, n = 0;
        for (let dj = -HP_R; dj <= HP_R; dj += 3) for (let di = -HP_R; di <= HP_R; di += 3) {
            const y = j + dj, x = i + di;
            if (y < 0 || y >= M || x < 0 || x >= N) continue;
            s += g[y * N + x]; n++;
        }
        hp[j * N + i] = g[j * N + i] - s / n;
    }
    // ⑵ 윈저화 — 바위·균열 같은 **소수의 극단 화소가 분산을 독점**해 지면 무늬 몫을 지운다.
    {
        let s = 0, ss = 0;
        for (let k = 0; k < hp.length; k++) { s += hp[k]; ss += hp[k] * hp[k]; }
        const m = s / hp.length, sd = Math.sqrt(Math.max(1e-9, ss / hp.length - m * m));
        const lo = m - 2 * sd, hi = m + 2 * sd;
        for (let k = 0; k < hp.length; k++) hp[k] = hp[k] < lo ? lo : hp[k] > hi ? hi : hp[k];
    }
    // ⑶ lag 평면 ρ(dx,dy).
    //   · 텍스처는 **실제로 이어 붙는 타일**(tile9 로 랩어라운드해 그린다)이라 순환 이동이 물리적으로
    //     옳고, 위너-힌친으로 전 lag 을 한 번에 얻는다(직접 계산은 4.5만 lag × 26만 화소라 못 쓴다).
    //   · 렌더 패치는 타일이 아니므로 겹침 기반으로 직접 잰다(패치가 작아 감당된다).
    const dmax = Math.min(DMAX, (Math.min(N, M) >> 1) - 2);
    const W = 2 * dmax + 1;
    const map = new Float64Array(W * W).fill(NaN);
    const at = (dx, dy) => (Math.abs(dx) > dmax || Math.abs(dy) > dmax ? NaN : map[(dy + dmax) * W + (dx + dmax)]);
    if (circular) {
        let s = 0;
        for (let k = 0; k < hp.length; k++) s += hp[k];
        const m = s / hp.length;
        const re = new Float64Array(N * M), im = new Float64Array(N * M);
        for (let k = 0; k < hp.length; k++) re[k] = hp[k] - m;
        fft2(re, im, N, M, false);
        for (let k = 0; k < N * M; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
        fft2(re, im, N, M, true);
        const zero = re[0] || 1e-9;                 // 지연 0 = 분산 × 표본수 → 정규화 상수
        for (let dy = -dmax; dy <= dmax; dy++) for (let dx = -dmax; dx <= dmax; dx++)
            map[(dy + dmax) * W + (dx + dmax)] = re[((dy + M) % M) * N + ((dx + N) % N)] / zero;
    } else {
        for (let dy = 0; dy <= dmax; dy++) for (let dx = -dmax; dx <= dmax; dx++) {
            if (dy === 0 && dx < 0) continue;
            const r = dy === 0 && dx === 0 ? 1 : nccDirect(hp, N, M, dx, dy);
            if (r === null) continue;
            map[(dy + dmax) * W + (dx + dmax)] = r;
            map[(-dy + dmax) * W + (-dx + dmax)] = r;
        }
    }
    if (process.env.DEBUG) {
        let mx = -9, mxd = null, cnt = 0;
        for (let dy = -dmax; dy <= dmax; dy++) for (let dx = -dmax; dx <= dmax; dx++) {
            const v = at(dx, dy);
            if (Number.isNaN(v)) { cnt++; continue; }
            if (Math.hypot(dx, dy) >= RLAG && v > mx) { mx = v; mxd = [dx, dy]; }
        }
        console.log(`  DEBUG map: dmax=${dmax} NaN=${cnt} maxRho=${mx.toFixed(4)} at ${mxd}`);
    }
    // ⑷ 후보 = ρ 의 **국소 최댓값**(단조 감소하는 자기 어깨에는 국소 최댓값이 없다).
    // ⑸ 후보들 중 **지속성이 가장 높은 것**을 고른다 — ρ(p) 가 제일 큰 것이 아니다.
    //   🚨 실측으로 갈린 지점이다: 수정 전 사막 텍스처에서 p=33px 은 ρ=0.23 으로 제일 높지만 배수에서
    //      곧 풀리고(coh 0.05), p=128px 은 ρ=0.19 로 낮아도 256·384 까지 그대로 간다(coh 0.18).
    //      화면을 벽지로 만드는 건 후자다. 묻는 것이 '가장 닮은 이동'이 아니라 '**끝까지 잠기는 이동이
    //      있는가**'이므로, 점수는 ρ(p) 가 아니라 min(ρ(2p),ρ(3p)) 로 매긴다.
    //   후보가 수백 개라 최댓값 선택 편향이 걱정될 수 있으나, ρ 는 26만 화소로 재 표준편차가 ~0.002 라
    //   수백 개 중 최댓값이래야 ~0.006 이다(참고선 0.10 과 한 자릿수 차이).
    const mul = (p, k) => (circular
        ? mapAtWrapped(map, W, dmax, p.dx * k, p.dy * k, N, M)
        : nccDirect(hp, N, M, p.dx * k, p.dy * k));
    let best = null;
    for (let dy = 0; dy <= dmax; dy++) for (let dx = -dmax; dx <= dmax; dx++) {
        if (dy === 0 && dx <= 0) continue;
        if (Math.hypot(dx, dy) < RLAG) continue;
        const r = at(dx, dy);
        if (!(r > 0.05)) continue;
        let peak = true;
        for (let j = -1; j <= 1 && peak; j++) for (let i = -1; i <= 1; i++) {
            if (!i && !j) continue;
            const v = at(dx + i, dy + j);
            if (!Number.isNaN(v) && v >= r) { peak = false; break; }
        }
        if (!peak) continue;
        const cand = { r, dx, dy };
        const r2 = mul(cand, 2), r3 = mul(cand, 3);
        const got = [r2, r3].filter(v => v !== null && !Number.isNaN(v));
        cand.coh = Math.max(0, got.length ? Math.min(...got) : 0);
        cand.r2 = r2 === null ? NaN : r2; cand.r3 = r3 === null ? NaN : r3;
        if (!best || cand.coh > best.coh) best = cand;
    }
    if (!best) return { coh: 0, r1: 0, r2: NaN, r3: NaN, period: 0, deg: 0 };
    let deg = Math.abs(Math.atan2(best.dy, best.dx) * 180 / Math.PI); if (deg > 90) deg = 180 - deg;
    return { coh: best.coh, r1: best.r, r2: best.r2, r3: best.r3,
             period: Math.hypot(best.dx, best.dy), deg };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [], out = [];
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    page.on('pageerror', e => errors.push(String(e)));
    // 프롭 배치가 전부 Math.random 이라 시드를 고정하지 않으면 전/후 대조가 성립하지 않는다.
    await page.addInitScript(() => {
        let s = 0x51f3a7d;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    if (RENDER) await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        if (Scene3D.heroG) Scene3D.heroG.visible = false;
        Scene3D.clearEnemies && Scene3D.clearEnemies();
    });
    if (process.env.DUMP) await page.evaluate(() => { window.__dump = true; });
    for (const t of (SYNTH ? [BIOMES[0]] : BIOMES)) {
        if (RENDER) {
            await page.evaluate((t) => { Scene3D.setTheme(t); Scene3D.walking = false; Scene3D.worldX = 0; }, t);
            await page.waitForTimeout(700);
        }
        const r = await page.evaluate(([s, th, o]) => (new Function('return ' + s))()(th, o),
            [INPAGE, t, { render: RENDER, RW, RH, BANDFRAC, synth: SYNTH }]);
        if (r.dump) {
            const name = `${RENDER ? 'phasecrop' : 'texdump'}-${SYNTH || t.biome}.png`;
            fs.writeFileSync(path.resolve(__dirname, name), Buffer.from(r.dump, 'base64'));
            console.log(`표본 저장: ${name} (${r.N}x${r.M})`);
        }
        if (process.env.DEBUG) {
            const a = Float64Array.from(r.g);
            let mn = Infinity, mx = -Infinity, sm = 0;
            for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; sm += v; }
            console.log(`DEBUG ${t.biome}: N=${r.N} M=${r.M} len=${a.length} min=${mn.toFixed(1)} max=${mx.toFixed(1)} mean=${(sm/a.length).toFixed(2)}`);
        }
        out.push(Object.assign({ biome: SYNTH ? 'SYNTH:' + SYNTH : t.biome },
            analyze(Float64Array.from(r.g), r.N, r.M, !RENDER)));
    }
    await page.close();
    await browser.close();

    console.log(`\n===== 지면 무늬 위상 결맞음 — 밀어 겹치기 지속성 (${RENDER ? '원근보정 렌더 · 참고용' : '텍스처 512²'}) =====`);
    console.log('바이옴        결맞음 coh    p(1배)  2배    3배    되풀이 벡터(px)  방향     판정');
    let bad = 0;
    for (const r of out) {
        const w = r.coh >= WALL;
        if (w) bad++;
        const f = v => (Number.isNaN(v) ? '  —  ' : v.toFixed(2).padStart(5));
        console.log(`${r.biome.padEnd(13)} ${r.coh.toFixed(3).padStart(9)}   ${f(r.r1)} ${f(r.r2)} ${f(r.r3)} `
            + `${r.period.toFixed(1).padStart(13)} ${(r.deg.toFixed(0) + 'd').padStart(7)}   ${w ? '🚨 벽지(위상까지 이어짐)' : '자연스러운 흩뿌림'}`);
    }
    console.log(`\n콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`참고선 coh ${WALL} 이상: ${bad}/${out.length}`);
    if (SYNTH === 'grating') console.log('대조(양성): coh 이 1 근처여야 자가 결맞음을 본다는 뜻.');
    if (SYNTH === 'noise') console.log('대조(음성): coh ≈ 0 이어야 유령을 안 만든다는 뜻.');
    if (SYNTH === 'scatter') console.log('대조(핵심): 진폭 봉우리는 있지만 위상은 제각각 — coh ≈ 0 이어야 선행 자의 실패를 안 되풀이한다.');
    // 대조군·렌더 참고 실행은 판정하지 않는다. 게이트는 텍스처 본 실행뿐.
    process.exit(!SYNTH && !RENDER && (bad || errors.length) ? 1 : 0);
})();
