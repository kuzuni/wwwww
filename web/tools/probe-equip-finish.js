// 장비 아이콘 마감 4종 자동 게이트 — 사용: node probe-equip-finish.js
// TODO `equip-design-dedupe` ㉯⑶ "접지 그림자·소프트 AO·비네트·레어리티 프레임 부재" 전용.
// `shot-equip-finish.js` 는 **눈으로 보는** 판이라 회귀를 못 막는다. 이건 그 판정을 수치로 굳힌 것.
//
// 🚨 **자를 만들며 두 번 틀렸다 — 그 교훈이 이 설계다.**
//  ⓐ 처음엔 '마감 전(pad 1.06) vs 마감 후(pad 1.10)'를 그냥 비교했는데, **여백이 달라 피사체 크기가
//     바뀌므로 픽셀이 정렬되지 않는다.** 게다가 프레임 반경 기준으로 중앙/가장자리 띠를 잡으니
//     마감 후에는 가장자리 띠에 피사체 픽셀이 **하나도 없어** 0으로 나눠 비네트비가 9.1 로 찍혔다
//     (= 아무 의미 없는 숫자). → 층을 **하나씩만 끄고** 같은 프레이밍끼리 비교한다.
//  ⓑ AO 를 3×3 고역통과로 재면 **안 잡힌다**(0.985 로 오히려 내려갔다). AO 는 두 번 뭉갠 저주파
//     그늘이라 1픽셀 스케일에는 흔적이 거의 없다. → AO 는 **AO 만 끈 판과의 차분**으로 직접 잰다.
// 변형 4종(전부 pad 1.10, 픽셀 정렬됨):
//   N = AO 0 · 비네트 0 (합성만: 그림자·리프트·프레임)   V = 비네트만   F = 전부 켬
//   B = 마감 자체를 끈 옛 그림(pad 1.06) — 전체 감광폭 확인용
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const SHADOW_MIN_CELLS = 0.95;   // 이 비율 이상의 칸에 접지 그림자가 있어야 한다
const SHADOW_WIDTH_CV = 0.10;    // 그림자 폭의 변동계수가 이보다 작으면 '고정 스티커'로 보고 반려
const AO_MEAN_MIN = 0.030;       // AO 평균 감광폭(F vs V) — 이 밑이면 걸려 있으나 마나
const AO_STD_MIN = 0.025;        // AO 감광의 **공간 편차** — 평평하게 깎으면 이게 안 오른다(=그냥 감광)
const VIG_GAIN_MIN = 1.02;       // 중앙/가장자리 휘도비 V/N
const LUM_DROP_MAX = 0.20;       // 옛 그림 대비 평균 휘도가 이보다 깎이면 과다 감광

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async () => {
        const S = 128;
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        const AO0 = Scene3D.THUMB_AO_STRENGTH, VIG0 = Scene3D.THUMB_VIGNETTE;
        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const read = async (url) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
            cx.clearRect(0, 0, S, S); cx.drawImage(img, 0, 0, S, S);
            return cx.getImageData(0, 0, S, S).data;
        };
        // 부위·시대를 고루 — 조형이 납작한 것(벨트·반지)과 두꺼운 것(갑옷)이 섞여야 판정이 산다
        const cells = [];
        for (const age of ['primitive', 'medieval', 'underworld', 'space', 'divine'])
            for (const slot of ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'])
                cells.push({ age, slot, nameIdx: (cells.length % 3) });

        const shoot = async (c, rarity, mode) => {
            Scene3D.THUMB_FINISH_OFF = (mode === 'B');
            Scene3D.THUMB_FIT_PAD = (mode === 'B') ? 1.06 : 1.10;
            Scene3D.THUMB_AO_STRENGTH = (mode === 'F') ? AO0 : 0;
            Scene3D.THUMB_VIGNETTE = (mode === 'F' || mode === 'V') ? VIG0 : 0;
            Scene3D._thumbCache = {};
            const u = Scene3D.itemThumb({ slot: c.slot, age: c.age, ageIdx: AGES.indexOf(c.age), rarity, nameIdx: c.nameIdx });
            return u ? await read(u) : null;
        };
        const lum = (d, i) => 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
        const meanLum = (d) => {
            let n = 0, s = 0;
            for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] >= 200) { n++; s += lum(d, i); }
            return s / (n || 1);
        };
        // 두 판(같은 프레이밍)의 픽셀별 감광비 — 평균과 공간 편차
        const shadeDiff = (dark, light) => {
            const v = [];
            for (let i = 0; i < S * S; i++) {
                if (dark[i * 4 + 3] < 200 || light[i * 4 + 3] < 200) continue;
                const L = lum(light, i);
                if (L < 6) continue;
                v.push(1 - lum(dark, i) / L);
            }
            if (!v.length) return { mean: 0, std: 0, n: 0 };
            const m = v.reduce((a, b) => a + b, 0) / v.length;
            return { mean: m, std: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length), n: v.length };
        };
        // 중앙/가장자리 휘도비 — 띠는 **피사체 바운딩박스** 기준(프레임 기준이면 빈 띠가 생긴다)
        const vigRatio = (d) => {
            let x0 = S, x1 = -1, y0 = S, y1 = -1;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                if (d[(y * S + x) * 4 + 3] < 200) continue;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
            if (x1 < 0) return 0;
            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hx = (x1 - x0) / 2 || 1, hy = (y1 - y0) / 2 || 1;
            let cS = 0, cN = 0, eS = 0, eN = 0;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const i = y * S + x;
                if (d[i * 4 + 3] < 200) continue;
                const rr = Math.hypot((x - mx) / hx, (y - my) / hy);
                if (rr < 0.40) { cS += lum(d, i); cN++; } else if (rr > 0.80) { eS += lum(d, i); eN++; }
            }
            if (!cN || !eN) return 0;
            return (cS / cN) / (eS / eN);
        };
        // 접지 그림자 = 피사체(a>=200) **아래쪽 밖**에 있는 반투명 어둠
        const shadow = (d) => {
            let solidMaxY = -1;
            for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] >= 200) { const y = (i / S) | 0; if (y > solidMaxY) solidMaxY = y; }
            let cnt = 0, x0 = S, x1 = -1;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const i = y * S + x, a = d[i * 4 + 3];
                if (a < 12 || a >= 200) continue;
                if (lum(d, i) > 90) continue;            // 어두운 것만 — 반투명 유리·발광은 그림자가 아니다
                if (y < solidMaxY - S * 0.06) continue;  // 물건 몸통 한가운데의 반투명은 세지 않는다
                cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x;
            }
            return { px: cnt, w: x1 >= x0 ? (x1 - x0) / S : 0 };
        };
        // 귀퉁이 프레임 색 — 네 귀퉁이 14% 정사각에서 가장 채도 높은 픽셀
        const corner = (d) => {
            let best = null, bs = -1;
            const K = Math.round(S * 0.14);
            for (const [ox, oy] of [[0, 0], [S - K, 0], [0, S - K], [S - K, S - K]])
                for (let y = oy; y < oy + K; y++) for (let x = ox; x < ox + K; x++) {
                    const i = y * S + x;
                    if (d[i * 4 + 3] < 120) continue;
                    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
                    const sat = Math.max(r, g, b) - Math.min(r, g, b);
                    if (sat > bs) { bs = sat; best = [r, g, b]; }
                }
            return { sat: bs, rgb: best };
        };

        const out = { cells: [], rar: {} };
        for (const c of cells) {
            const B = await shoot(c, 'common', 'B');
            const N = await shoot(c, 'common', 'N');
            const V = await shoot(c, 'common', 'V');
            const F = await shoot(c, 'common', 'F');
            if (!B || !N || !V || !F) { out.cells.push({ ...c, fail: 'render' }); continue; }
            out.cells.push({
                ...c,
                ao: shadeDiff(F, V),                       // AO 만의 차분
                vigN: vigRatio(N), vigV: vigRatio(V),      // 비네트만의 효과
                lumB: meanLum(B), lumF: meanLum(F),
                sh: shadow(F), shBefore: shadow(B), cor: corner(F),
            });
        }
        for (const rarity of RARITIES) {
            const a = await shoot({ age: 'medieval', slot: 'armor', nameIdx: 0 }, rarity, 'F');
            out.rar[rarity] = a ? corner(a) : null;
        }
        Scene3D.THUMB_FINISH_OFF = false;
        Scene3D.THUMB_FIT_PAD = 1.10;
        Scene3D.THUMB_AO_STRENGTH = AO0; Scene3D.THUMB_VIGNETTE = VIG0;
        Scene3D._thumbCache = {};
        return out;
    });

    const ok = res.cells.filter(c => !c.fail);
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const fails = [];

    // ① 접지 그림자
    const withSh = ok.filter(c => c.sh.px > 20);
    const shRatio = withSh.length / (ok.length || 1);
    const ws = withSh.map(c => c.sh.w);
    const mw = avg(ws);
    const cvW = ws.length ? Math.sqrt(avg(ws.map(v => (v - mw) ** 2))) / (mw || 1) : 0;
    console.log(`① 접지 그림자: ${withSh.length}/${ok.length} 칸 (마감 전 ${ok.filter(c => c.shBefore.px > 20).length}칸) · 폭 평균 ${(mw * 100).toFixed(1)}% · 폭 변동계수 ${cvW.toFixed(3)}`);
    if (shRatio < SHADOW_MIN_CELLS) fails.push(`접지 그림자 ${(shRatio * 100).toFixed(0)}% < ${SHADOW_MIN_CELLS * 100}%`);
    if (cvW < SHADOW_WIDTH_CV) fails.push(`그림자 폭 변동계수 ${cvW.toFixed(3)} < ${SHADOW_WIDTH_CV} (고정 스티커)`);

    // ② 소프트 AO (F vs V)
    const aoM = avg(ok.map(c => c.ao.mean)), aoS = avg(ok.map(c => c.ao.std));
    console.log(`② 소프트 AO: 평균 감광 ${(aoM * 100).toFixed(1)}% (기준 ≥${(AO_MEAN_MIN * 100).toFixed(1)}%) · 공간 편차 ${aoS.toFixed(3)} (기준 ≥${AO_STD_MIN})`);
    if (aoM < AO_MEAN_MIN) fails.push(`AO 평균 감광 ${(aoM * 100).toFixed(1)}% < ${(AO_MEAN_MIN * 100).toFixed(1)}%`);
    if (aoS < AO_STD_MIN) fails.push(`AO 공간 편차 ${aoS.toFixed(3)} < ${AO_STD_MIN} (평평한 감광)`);

    // ③ 비네트 (V vs N)
    const vg = avg(ok.filter(c => c.vigN > 0).map(c => c.vigV / c.vigN));
    const lr = avg(ok.map(c => c.lumF / (c.lumB || 1)));
    console.log(`③ 비네트: 중앙/가장자리 휘도비 V/N ${vg.toFixed(3)} (기준 ≥${VIG_GAIN_MIN})`);
    console.log(`   전체 평균 휘도 F/옛그림 ${lr.toFixed(3)} (기준 ≥${(1 - LUM_DROP_MAX).toFixed(2)})`);
    if (vg < VIG_GAIN_MIN) fails.push(`비네트 이득 ${vg.toFixed(3)} < ${VIG_GAIN_MIN}`);
    if (lr < 1 - LUM_DROP_MAX) fails.push(`평균 휘도 ${lr.toFixed(3)} 과다 감광`);

    // ④ 레어리티 프레임
    console.log('④ 레어리티 프레임 (귀퉁이 최고채도 화소):');
    const seen = [];
    for (const [r, c] of Object.entries(res.rar)) {
        console.log(`   ${r.padEnd(10)} 채도 ${c ? c.sat : '-'} rgb ${c && c.rgb ? c.rgb.join(',') : '-'}`);
        if (r === 'common') {
            if (c && c.sat > 40) fails.push(`common 에 프레임이 생겼다 (채도 ${c.sat}) — 지각 중복 게이트가 무너진다`);
        } else if (!c || c.sat < 60) {
            fails.push(`${r} 프레임 없음/약함 (채도 ${c ? c.sat : '-'})`);
        } else {
            for (const [pr, pc] of seen) {
                const d = Math.abs(pc[0] - c.rgb[0]) + Math.abs(pc[1] - c.rgb[1]) + Math.abs(pc[2] - c.rgb[2]);
                if (d < 60) fails.push(`${r} 와 ${pr} 프레임 색이 안 갈린다 (Δ${d})`);
            }
            seen.push([r, c.rgb]);
        }
    }
    const badCommon = ok.filter(c => c.cor.sat > 40);
    // ⚠️ 개수만 찍으면 어느 칸인지 몰라 손을 못 댄다 — 2026-08-19 3D 세션이 이 문구 하나를 들고
    //    35칸을 따로 재현해 가며 범인을 찾았다. 칸 이름·채도·색을 같이 남긴다.
    if (badCommon.length) fails.push(`common 칸 ${badCommon.length}개 귀퉁이에 채색 프레임: `
        + badCommon.map(c => `${c.age}/${c.slot}#${c.nameIdx}(채도 ${c.cor.sat} rgb ${c.cor.rgb && c.cor.rgb.join(',')})`).join(' · '));

    console.log(`\n콘솔 에러: ${errors.length}`, errors.slice(0, 5));
    if (errors.length) fails.push('콘솔 에러 ' + errors.length);
    console.log(fails.length ? '\nFAIL:\n - ' + fails.join('\n - ') : '\nPASS — 마감 4종 전부 확인');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
