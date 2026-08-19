/* 던전 배너 4행 — 원본(shot-042251) 대비 **명도 구조** 게이트 (dungeon-row-quality).
 *
 * 왜 이게 필요한가: 이 항목은 비평가 채점을 8라운드 돌고도 60~80 대에서 안 올라갔는데,
 * 라운드마다 나온 지적("중경 군중이 자갈밭/달걀 더미", "전경이 바위 무더기", "하늘이 탁하다")이
 * 전부 **같은 뿌리 하나**를 서로 다른 말로 가리키고 있었다 — 행의 명도 구조가 원본과 다르다.
 * 모양(투구 종류·창·배너 장수)을 아무리 손봐도 값이 틀리면 같은 지적이 다시 나온다.
 * 눈대중·비평가 서술 대신 **원본과 클론의 같은 자리 휘도를 직접 재서** 그 차이를 수치로 세운다.
 *
 * 재는 법: 카드 안쪽(테두리 3px 제외)을 400x116 으로 정규화하고, **우측 28%(UI 열: 열쇠·[열기])는
 * 잘라낸다** — 그쪽은 배경 아트가 아니라 버튼이라 같이 재면 원본과 클론의 버튼 위치 차이가
 * 배경 점수로 새 들어온다. 세로 12밴드의 평균 휘도(Rec.709)와 암부 비율(L<62)을 원본과 나란히 찍는다.
 *
 * 게이트: 밴드별 |Δ휘도| ≤ 22 (0~255 척도). 그림이 원본과 다른 그림인 이상 완전 일치는 불가능하고,
 * 22 는 '같은 시간대·같은 층 구조로 읽히는가'의 대역이다(원본 행 내부 밴드 간 편차가 보통 30~60).
 *
 * 사용: node tools/probe-dungeon-value.js        (캡처부터 새로 함)
 *       node tools/probe-dungeon-value.js --keep (tools/dungeon-rows.png 재사용 — 빠른 반복용)
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-042251.png');
const SHOT = path.resolve(__dirname, 'dungeon-rows.png');

/* 카드 rect [x,y,w,h] — 두 이미지에서 카드 밴드를 밝은 배경 대비로 스캔해 얻은 값이다.
   원본 496x893 / 클론 780x1688(390x844 @dpr2). 레이아웃이 바뀌면 여기도 다시 재야 한다. */
const REF_ROWS = [[56, 126, 385, 112], [56, 248, 385, 111], [56, 369, 385, 112], [56, 491, 385, 111]];
const CL_ROWS = [[88, 328, 604, 181], [88, 518, 604, 183], [88, 710, 604, 183], [88, 902, 604, 176]];
const NAMES = ['① 망치 도둑', '② 유령 마을', '③ 침략', '④ 좀비 러시'];
const TOL = 22;

const MEASURE = ([src, rects]) => new Promise(async resolve => {
    const im = new Image(); await new Promise(k => { im.onload = k; im.src = src; });
    const out = [];
    for (const r of rects) {
        const NW = 400, NH = 116, XLIM = Math.round(NW * 0.72);
        const c = document.getElementById('c'); c.width = NW; c.height = NH;
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.clearRect(0, 0, NW, NH);
        x.drawImage(im, r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6, 0, 0, NW, NH);
        const d = x.getImageData(0, 0, NW, NH).data;
        const prof = [], darkp = [];
        for (let b = 0; b < 12; b++) {
            let sum = 0, n = 0, dark = 0;
            for (let y = Math.floor(b * NH / 12); y < Math.floor((b + 1) * NH / 12); y++)
                for (let px = 0; px < XLIM; px++) {
                    const i = (y * NW + px) * 4, L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                    sum += L; n++; if (L < 62) dark++;
                }
            prof.push(+(sum / n).toFixed(1)); darkp.push(+(100 * dark / n).toFixed(1));
        }
        out.push({ prof, darkp });
    }
    resolve(out);
});

(async () => {
    const keep = process.argv.includes('--keep');
    const browser = await chromium.launch();
    if (!keep || !fs.existsSync(SHOT)) {
        /* 캡처 레시피는 shot-dungeon-rows.js 와 같다 — Scene3D.update 를 비워 rAF 를 세우고
           애니메이션을 끈다. 안 하면 page.screenshot 이 합성 대기로 타임아웃한다. */
        const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        await p.goto(INDEX, { waitUntil: 'load' });
        await p.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
        await p.evaluate(SC.SEED_SRC);
        await p.reload({ waitUntil: 'load' });
        await p.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
        await p.evaluate(() => {
            if (window.Scene3D) Scene3D.update = function () { };
            UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
            UI.showCraftModal = () => { }; UI.resolvePendingCraft = () => { }; UI.autoSeqStep = () => { };
            UI.coinBurst = () => { };
        });
        await p.waitForTimeout(700);
        await p.evaluate(() => {
            try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
        });
        await p.evaluate(() => UI.openDungeons());
        await p.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
        await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
        await p.waitForTimeout(500);
        await p.screenshot({ path: SHOT, timeout: 180000 });
        await p.close();
    }
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const d64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const A = await page.evaluate(MEASURE, [d64(REF), REF_ROWS]);
    const B = await page.evaluate(MEASURE, [d64(SHOT), CL_ROWS]);
    await browser.close();

    let fails = 0;
    for (let i = 0; i < 4; i++) {
        const dl = A[i].prof.map((v, k) => +(B[i].prof[k] - v).toFixed(1));
        const worst = dl.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
        const bad = dl.filter(v => Math.abs(v) > TOL).length;
        fails += bad;
        console.log(`=== ${NAMES[i]}  초과밴드 ${bad}/12 · 최대 Δ ${worst > 0 ? '+' : ''}${worst}`);
        console.log('  원본 휘도 ', A[i].prof.map(v => String(v).padStart(6)).join(''));
        console.log('  클론 휘도 ', B[i].prof.map(v => String(v).padStart(6)).join(''));
        console.log('  Δ(클론-원) ', dl.map(v => (v > 0 ? '+' + v : String(v)).padStart(6)).join(''));
        console.log('  원본 암부% ', A[i].darkp.map(v => String(v).padStart(6)).join(''));
        console.log('  클론 암부% ', B[i].darkp.map(v => String(v).padStart(6)).join(''));
    }
    console.log(`\n${fails === 0 ? 'PASS' : 'FAIL'} — 허용 |Δ|≤${TOL}, 초과 밴드 총 ${fails}/48`);
    process.exit(fails === 0 ? 0 : 1);
})();
