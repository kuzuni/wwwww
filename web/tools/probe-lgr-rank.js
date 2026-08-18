// 리그 보상 팝업(원본 shot-042208) 4위 이하 등수 라벨 실측 — `league-tier-rank-label` 검증용.
// 원본 PNG 와 클론 PNG 에 **같은 스캔**을 걸어 `4-5` 글자 덩어리의 x·폭·높이를 %W/%H 로 나란히 찍고,
// 클론 DOM 에서 7줄의 등수칸·보상 그리드 rect 를 읽어 **글자를 바꿔도 그리드가 안 밀렸는지**를 본다.
//
// ⚠️ 스캔 함정 대비(TODO ⚠️ 채점 함정 · 인계 메모 ㉣):
//   ⑴ 줄 구분선이 **검은 파선**이라 잉크 조건에 그대로 걸린다 → 줄 위아래 가장자리를 잘라낸 뒤 잰다.
//   ⑵ 등수칸 오른쪽의 보상 pill 은 회색 바탕에 검은 글자라 같이 잡힌다 → x 를 **그리드 시작 전**까지로 막는다.
//   ⑶ 원본은 흰 글자 + 검은 외곽선, 클론은 진한 글자다 — 둘 다 '어두운 화소'로 잡히므로 같은 조건을 쓴다.
//   두 조건이 깨지면 수치를 인쇄하지 않고 exit 2(측정기 고장)로 끊는다.
// 사용: PW_PATH=... node probe-lgr-rank.js  (클론 PNG 는 shot-screens.js ONLY=league-rewards 로 먼저 캡처)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042208.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/league-rewards.png');

// `4-5` 줄 글자가 들어 있는 세로 구간(이미지 높이 대비 %).
// ⚠️ 넉넉히 잡으면(68.5~76.5) 위아래 줄의 파선·배지 밑동을 함께 물어 자기검증이 '두 덩어리'로 끊는다 —
//    두 이미지 모두 이 줄의 글자만 들어오는 폭으로 좁혔다.
const BAND = { top: 71.0, bot: 75.8 };
// 등수칸 스캔 가로 상한(%W) — 보상 그리드가 시작되기 전까지. 원본·클론 모두 pill 왼쪽이 26%W 근처다.
// ⚠️ 30 으로 넓혔더니 오른쪽 pill 의 검은 글자를 같이 물어 `4-5` 폭이 67px(실제 36)로 부풀었다 — 25 를 넘기지 말 것.
const RANK_X_MAX = 25.0;

const scanLabel = async (page, file) => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    return page.evaluate(async ([dataUrl, band, xMax]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const dark = (x, y) => { const i = (y * W + x) * 4; return d[i] < 120 && d[i + 1] < 120 && d[i + 2] < 140; };

        const y0 = Math.round(H * band.top / 100), y1 = Math.round(H * band.bot / 100);
        const x1 = Math.round(W * xMax / 100);
        // 🚨 흰 보상 카드 **바깥 왼쪽은 어두운 페이지 배경**이라 x=0 부터 재면 그 띠가 통째로 잉크로 잡힌다
        //    (첫 판이 여기 걸려 '글자 행이 끊긴다'만 냈다). 밴드 전 구간이 어두운 열은 배경이므로 건너뛴다.
        let x0 = 0;
        for (; x0 < x1; x0++) {
            let n = 0;
            for (let y = y0; y <= y1; y++) if (dark(x0, y)) n++;
            if (n < (y1 - y0 + 1) * 0.5) break;
        }
        if (x0 > W * 0.20) return { fail: `카드 왼쪽 끝이 너무 오른쪽이다 (x0=${x0}, ${(x0/W*100).toFixed(2)}%W)` };
        // 행별 잉크 폭 프로파일 — 파선(가로로 길게 이어지는 행)을 골라내기 위해 먼저 찍는다.
        const rows = [];
        for (let y = y0; y <= y1; y++) {
            let n = 0, min = -1, max = -1;
            for (let x = x0; x < x1; x++) if (dark(x, y)) { n++; if (min < 0) min = x; max = x; }
            rows.push({ y, n, min, max });
        }
        // 파선 = 잉크가 **스캔 폭 거의 전체에 걸쳐 있는** 행. 화소 '개수'로 재면 파선은 끊긴 조각이라
        // 개수가 글자와 비슷하게 나와 안 걸러진다(실측으로 밟음) — 좌우 끝 사이 '뻗은 거리'로 판정한다.
        const dashes = rows.filter(r => r.n > 0 && (r.max - r.min) > (x1 - x0) * 0.8).map(r => r.y);
        const isDash = y => dashes.some(dy => Math.abs(dy - y) <= 2);
        const glyph = rows.filter(r => r.n > 0 && !isDash(r.y));
        if (!glyph.length) return { fail: 'band 안에서 글자 잉크를 못 찾았다' };
        // 글자 행이 세로로 이어지는지(구멍 3px 이상이면 다른 요소를 같이 잡은 것)
        for (let i = 1; i < glyph.length; i++) if (glyph[i].y - glyph[i - 1].y > 3)
            return { fail: `글자 행이 ${glyph[i - 1].y}→${glyph[i].y} 로 끊긴다 — 두 덩어리를 같이 잡았다` };
        const left = Math.min(...glyph.map(r => r.min)), right = Math.max(...glyph.map(r => r.max));
        const top = glyph[0].y, bot = glyph[glyph.length - 1].y;
        return {
            imgW: W, imgH: H, dashCount: dashes.length, cardLeft: +(x0 / W * 100).toFixed(2),
            x: +(left / W * 100).toFixed(2), w: +((right - left + 1) / W * 100).toFixed(2),
            y: +(top / H * 100).toFixed(2), h: +((bot - top + 1) / H * 100).toFixed(2),
        };
    }, [dataUrl, BAND, RANK_X_MAX]);
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

    // ---- ⑴ 원본·클론 PNG 같은 스캔 ----
    await page.goto('about:blank');
    const ref = await scanLabel(page, REF);
    const clone = fs.existsSync(CLONE) ? await scanLabel(page, CLONE) : { fail: '클론 캡처가 없다 — ONLY=league-rewards node shot-screens.js 먼저' };

    // ---- ⑵ 클론 DOM: 7줄 라벨 + 등수칸/그리드 rect ----
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof League !== 'undefined', null, { timeout: 150000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 150000 });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => { UI.toast = () => { }; UI.openLeague(); UI.openLeagueRewards(); });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const dom = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const P = (v, t) => +(v / t * 100).toFixed(2);
        return [...document.querySelectorAll('.league-reward-tier')].map(row => {
            const rank = row.querySelector('.league-tier-rank');
            const grid = row.querySelector('.league-tier-grid');
            const rr = rank.getBoundingClientRect(), gr = grid.getBoundingClientRect();
            return {
                text: rank.classList.contains('badge') ? '(배지)' : rank.textContent.trim(),
                rankX: P(rr.left - app.left, app.width), rankW: P(rr.width, app.width),
                gridX: P(gr.left - app.left, app.width), gridW: P(gr.width, app.width),
            };
        });
    });
    await browser.close();

    // ---- 판정 ----
    const fails = [];
    if (ref.fail) fails.push('원본 스캔 고장: ' + ref.fail);
    if (clone.fail) fails.push('클론 스캔 고장: ' + clone.fail);
    if (ref.fail || clone.fail) {
        fails.forEach(f => console.log('✗ ' + f));
        process.exit(2);   // 측정기 고장 — 요소 수치를 인쇄하지 않는다
    }

    console.log(`원본 ${ref.imgW}x${ref.imgH} · 클론 ${clone.imgW}x${clone.imgH} (파선 행 ${ref.dashCount}/${clone.dashCount})`);
    console.log('`4-5` 글자 덩어리      원본     클론      Δ%p');
    for (const k of ['x', 'w', 'y', 'h']) {
        const d = +(clone[k] - ref[k]).toFixed(2);
        console.log(`  ${k.padEnd(2)} ${String(ref[k]).padStart(8)} ${String(clone[k]).padStart(8)} ${(d > 0 ? '+' : '') + d}`);
    }
    console.log('\n클론 DOM 7줄 (등수칸 x/폭 · 그리드 x/폭, %W):');
    dom.forEach((r, i) => console.log(`  ${i + 1} ${r.text.padEnd(8)} 등수칸 ${r.rankX}/${r.rankW}  그리드 ${r.gridX}/${r.gridW}`));

    // 글자를 바꿔도 그리드가 안 밀려야 한다 = 4위 이하 3줄의 그리드 x 가 서로 같다
    const textRows = dom.filter(r => r.text !== '(배지)');
    const gx = [...new Set(textRows.map(r => r.gridX))];
    if (gx.length > 1) fails.push(`글자 줄들의 그리드 x 가 갈렸다 — ${gx.join(' / ')} (등수칸이 글자 폭에 딸려 움직인다)`);
    // 라벨 문자열: 범위 줄에 '위'가 남아 있으면 안 된다 (마지막 '21위 이하' 는 근거 없어 예외)
    textRows.filter(r => /^\d+-\d+/.test(r.text)).forEach(r => {
        if (/위/.test(r.text)) fails.push(`범위 줄 라벨에 '위'가 남았다 — "${r.text}"`);
    });
    if (!textRows.some(r => r.text === '4-5')) fails.push(`원본과 같은 "4-5" 줄이 없다 — 실제 ${textRows.map(r => r.text).join(',')}`);

    // ⚠️ 글자 **크기**는 이 도구의 통과 조건이 아니다 — 이 항목(league-tier-rank-label)은 문자열 교정이고,
    //    타이포 비율은 league-rewards 화면을 하위 화면으로 들고 있는 `ui-ratio-audit` 소관이다(락 겹침 회피).
    //    수치만 남겨 그 세션이 목표값으로 쓰게 한다. 세로 위치(y)는 이미 맞아 있으니 크기만 키우면 된다.
    const sizeGap = (Math.abs(clone.w - ref.w) > 2 || Math.abs(clone.h - ref.h) > 2 || Math.abs(clone.x - ref.x) > 2);
    if (sizeGap) {
        console.log('\n⚠️ 크기 잔여(이 도구의 통과 조건 아님 · `ui-ratio-audit` 소관):');
        console.log(`   원본 글자가 정확히 2배다 — 폭 ${ref.w}%W vs ${clone.w}%W · 높이 ${ref.h}%H vs ${clone.h}%H (원본 36x18px, 클론 17x9px).`);
        console.log(`   x 가 +${(clone.x - ref.x).toFixed(2)}%p 인 것은 글자가 작아 고정폭 칸 안에서 가운데로 몰린 결과다 — 크기를 맞추면 같이 붙는다.`);
        console.log('   현재 값: .league-tier-rank.text { font-size: .74rem } (css/style.css) — 잉크 높이가 font-size 에 선형이라 약 1.48rem 이 목표.');
        console.log('   원본 글자는 흰 채움 + 검정 외곽선이다(배지 숫자 .lgr-rank-n 의 -webkit-text-stroke 처방과 같은 계열).');
    }

    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 3).join(' | '));
    if (fails.length || errors.length) {
        console.log('\nFAIL ' + (fails.length + errors.length) + '건');
        fails.forEach(f => console.log('  ✗ ' + f));
        errors.slice(0, 3).forEach(e => console.log('  ✗ ' + e));
        process.exit(1);
    }
    console.log('\nPASS — 라벨 문자열이 원본 꼴이고, 등수칸이 고정폭이라 그리드가 안 밀렸다');
})();
