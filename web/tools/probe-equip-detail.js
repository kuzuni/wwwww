// 장비 썸네일의 '이차 디테일 + 색 변주' 실측 — 사용: node tools/probe-equip-detail.js  (종료코드 0 = 통과)
// 배경: 비평가 ⓒ⑶ "스티치·리벳 열·매듭·천 주름 같은 이차 디테일과 색 변주(같은 가죽 안 명도 3단)가
// 부족하다". 표면이 한 통 페인트면 조형이 아무리 좋아도 96px 에서 '플라스틱 덩어리'로 읽힌다.
//
// ── 두 요구를 **서로 다른 방식으로** 잰다. 한 지표로 뭉치면 둘 다 못 본다 ──
// ① 이차 디테일 = 픽셀 지표 `hf`: 피사체 안쪽 픽셀의 3×3 라플라시안 |∇²L| 평균 ÷ 평균 휘도.
//    바늘땀·리벳 테·패널 심처럼 **화소 단위로 갈리는** 무늬가 있어야 오른다.
//    ⚠️ 정규화(÷평균휘도)가 핵심 — 안 하면 그냥 밝은 칸이 이겨 "밝기 = 디테일"이 된다.
//    ⚠️ 실루엣 **경계는 제외**한다(3×3 이웃이 전부 불투명한 화소만) — 배경과의 단차가 무늬보다
//       두 자릿수 크다. 안 빼면 지표가 통째로 '테두리 길이'가 된다.
// ② 색 변주 = **재질을 직접** 본다: 같은 모델의 파트들이 tierizeParts 로 명도 3단(-1/0/+1)을
//    받았는지 빌드 전후 색을 비교한다.
//    🚨 여기 함정이 있어 기록한다 — 처음엔 이것도 픽셀로 재려고 8×8 블록 평균 휘도의 표준편차(lf)를
//       썼는데, 셰이더 얼룩(vary 0.045→0.17)·패치 크기(vfreq 7→20)·파트 단위 3단을 **차례로 넣는
//       동안 lf 가 ±1% 안에서 꿈쩍도 안 했다**(0.1229→0.1187→…). 저주파 블록 평균은 조명·형상
//       그라디언트가 지배해서 알베도 몇 %는 묻힌다. 픽셀 프록시가 안 되는 요구는 원본을 직접 재야 한다.
//       lf 는 참고 출력으로만 남긴다(게이트 아님).
//
// 게이트: 칸마다 hf 하한(= 이 커밋 실측값의 88%)과 명도 3단 존재. 하한은 회귀 방지선이지 목표선이
// 아니다 — 무늬가 통째로 안 먹으면(three 가 주입 없는 프로그램을 재사용하는 customProgramCacheKey
// 사고가 이 파일 이웃에서 실제로 있었다) 여기서 절반 아래로 떨어진다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 계열/스타일별 hf 하한. 괄호 안은 (수정 전 → 수정 후) 실측 — 하한은 전부 **수정 전 값보다 위**라,
// 무늬가 빠지면 이 게이트가 실제로 잡는다(가드가 통과하고 마는 하한은 가드가 아니다).
const HF_GATE = {
    'primal/plate': 0.144,   // 0.1326 → 0.1640
    'primal/soft': 0.500,   // 0.1646 → 0.5680
    'forged/plate': 0.322,   // 0.2345 → 0.3657
    'forged/soft': 0.137,   // 0.0593 → 0.1554
    'brass/plate': 0.274,   // 0.2167 → 0.3119
    'brass/soft': 0.133,   // 0.0897 → 0.1515
    'polymer/plate': 0.189,   // 0.1463 → 0.2149
    'polymer/soft': 0.200,   // 0.1686 → 0.2280  ※ 현대에는 robe 스타일 갑옷이 없어 이 칸만 vest 로 떨어진다(soft:* 프로파일이 아니라 polymer)
    'alloy/plate': 0.433,   // 0.4269 → 0.4925
    'alloy/soft': 0.098,   // 0.0821 → 0.1114
};
const TIER_STEP = 0.055;    // Scene3D.tierizeParts 기본 단차

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async (TIER_STEP) => {
        const S = 128;
        Scene3D.itemThumb({ slot: 'armor', age: AGES[0], ageIdx: 0, rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const cx = cv.getContext('2d', { willReadFrequently: true });

        // 계열은 시대에서 나온다 — 표를 직접 읽어 계열마다 대표 시대를 하나씩 고른다.
        // ⚠️ 하드코딩 금지: 이 항목에서 스타일 표를 하드코딩했다가 게임에 없는 중복을 만들어 낸 적이 있다.
        const ageOfKind = {};
        for (const age of AGES) { const k = Scene3D.ageGearKind(age); if (!ageOfKind[k]) ageOfKind[k] = age; }

        const measure = (url) => new Promise(res => {
            const im = new Image();
            im.onload = () => {
                cx.clearRect(0, 0, S, S); cx.drawImage(im, 0, 0, S, S);
                const d = cx.getImageData(0, 0, S, S).data;
                const L = new Float64Array(S * S), A = new Float64Array(S * S);
                for (let i = 0; i < S * S; i++) {
                    A[i] = d[i * 4 + 3] / 255;
                    L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
                }
                let hfSum = 0, hfN = 0, lSum = 0, lN = 0;
                for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
                    const i = y * S + x;
                    if (A[i] < 0.99) continue;
                    lSum += L[i]; lN++;
                    let inner = true;
                    for (let dy = -1; dy <= 1 && inner; dy++) for (let dx = -1; dx <= 1; dx++)
                        if (A[i + dy * S + dx] < 0.99) { inner = false; break; }
                    if (!inner) continue;
                    const lap = 8 * L[i] - L[i - 1] - L[i + 1] - L[i - S] - L[i + S]
                        - L[i - S - 1] - L[i - S + 1] - L[i + S - 1] - L[i + S + 1];
                    hfSum += Math.abs(lap); hfN++;
                }
                const meanL = lN ? lSum / lN : 0;
                const B = 8, bm = [];
                for (let by = 0; by < S; by += B) for (let bx = 0; bx < S; bx += B) {
                    let s = 0, n = 0;
                    for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
                        const i = y * S + x; if (A[i] > 0.99) { s += L[i]; n++; }
                    }
                    if (n > B * B * 0.5) bm.push(s / n);
                }
                let lf = 0;
                if (bm.length > 2) {
                    const mu = bm.reduce((a, b) => a + b, 0) / bm.length;
                    lf = Math.sqrt(bm.reduce((a, b) => a + (b - mu) * (b - mu), 0) / bm.length) / (mu || 1);
                }
                res({ hf: (hfN && meanL) ? (hfSum / hfN) / meanL : 0, lf, px: lN });
            };
            im.onerror = () => res(null);
            im.src = url;
        });

        // ② 명도 3단 — 같은 모델을 두 번 세워 tierizeParts 전후 파트 색을 1:1로 비교한다.
        const tierCheck = (build) => {
            const lum = g => { const a = []; g.traverse(o => { if (o.isMesh && o.material && o.material.color) a.push(o.material.color.getHSL({ h: 0, s: 0, l: 0 }).l); }); return a; };
            const before = lum(build());
            const g2 = build(); Scene3D.tierizeParts(g2);
            const after = lum(g2);
            if (before.length !== after.length || !before.length) return { ok: false, why: '파트 수 불일치' };
            const tiers = { '-1': 0, '0': 0, '1': 0 };
            for (let i = 0; i < before.length; i++) {
                const dl = after[i] - before[i];
                // offsetHSL 은 l 을 [0,1] 로 자르므로 아주 밝은/어두운 색은 단차가 덜 먹는다 — 부호만 본다.
                const t = Math.abs(dl) < TIER_STEP * 0.25 ? '0' : (dl > 0 ? '1' : '-1');
                tiers[t]++;
            }
            return { ok: tiers['-1'] > 0 && tiers['0'] > 0 && tiers['1'] > 0, tiers, parts: before.length };
        };

        const out = [];
        for (const kind of Object.keys(ageOfKind)) {
            const age = ageOfKind[kind];
            const ageIdx = AGES.indexOf(age);
            for (const [tag, style] of [['plate', 'plate'], ['soft', 'robe']]) {
                const names = ((ITEM_NAMES[age] || {}).armor) || [];
                let idx = 0;
                for (let i = 0; i < names.length; i++) if (itemStyleOf({ slot: 'armor', age, nameIdx: i }) === style) { idx = i; break; }
                const url = Scene3D.itemThumb({ slot: 'armor', age, ageIdx, rarity: 'common', nameIdx: idx });
                if (!url) { out.push({ key: kind + '/' + tag, fail: '렌더 실패' }); continue; }
                const m = await measure(url);
                if (!m) { out.push({ key: kind + '/' + tag, fail: '이미지 로드 실패' }); continue; }
                const tc = tierCheck(() => Scene3D.makeArmorPreview(age, 'common', itemStyleOf({ slot: 'armor', age, nameIdx: idx }), (ITEM_NAMES[age].armor || [])[idx]));
                // ⚠️ 실제로 잡힌 스타일을 같이 찍는다 — 그 시대에 robe 스타일 갑옷이 없으면 soft 행이
                //    조용히 plate 로 떨어져(현대 '케블라'가 그렇다) 없는 계열을 재고 있다고 오독하게 된다.
                out.push({ key: kind + '/' + tag, age, name: names[idx], style: itemStyleOf({ slot: 'armor', age, nameIdx: idx }), hf: m.hf, lf: m.lf, px: m.px, tier: tc });
            }
        }
        return out;
    }, TIER_STEP);

    const lines = [];
    let bad = 0;
    for (const r of res) {
        if (r.fail) { lines.push(`FAIL ${r.key} — ${r.fail}`); bad++; continue; }
        const gate = HF_GATE[r.key];
        const okHf = gate === undefined || r.hf >= gate;
        const okT = r.tier && r.tier.ok;
        if (!okHf || !okT) bad++;
        lines.push(`${okHf && okT ? 'PASS' : 'FAIL'} ${r.key} (${r.age} ${r.name}/${r.style}) `
            + `hf=${r.hf.toFixed(4)}${okHf ? '' : ` < 하한 ${gate}`} `
            + `명도단 ${okT ? '3종' : 'FAIL ' + JSON.stringify(r.tier)}`
            + `(파트 ${r.tier ? r.tier.parts : '?'}) · 참고 lf=${r.lf.toFixed(4)} 피사체 ${r.px}px`);
    }
    lines.push((errors.length === 0 ? 'PASS' : 'FAIL') + ` 콘솔 에러 ${errors.length}건`);
    console.log(lines.join('\n'));
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    const fail = bad + (errors.length ? 1 : 0);
    console.log(fail === 0 ? '\n전체 통과' : `\n실패 ${fail}건`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})();
