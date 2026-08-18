// 썸네일 캔버스에 '아이콘 마감'(비네트·레어리티 프레임·접지그림자)을 그려 넣으면 무슨 일이
// 벌어지는지 실측 — 사용: node probe-thumb-plate-cost.js
// TODO 'equip-design-dedupe' ⓒ⑶ 전용. 비평가 3차 지적에는 "접지 그림자·소프트 AO·비네트·
// 레어리티 프레임 부재"가 함께 들어 있었다. 앞 세션들은 접지그림자만 "부양 장비라 형태 애매"로
// 보류했는데, **진짜 이유는 그게 아니다.** 이 셋은 전부 96×96 캔버스 **전면**을 덮는 요소라,
// 썸네일의 알파를 판정 근거로 쓰는 시스템과 충돌한다. 가설은 둘이었고 **실측 결과 하나만 맞았다**:
//   ⓐ (가설 — 실측으로 **기각**) `UI.measureThumb`(js/ui.js)가 알파 bbox 로 잉크 비율을 재서
//      THUMB_INK(0.83)에 맞춰 확대하므로, 전면 요소가 있으면 bbox = 캔버스 전체가 돼 배율이
//      1로 주저앉고 아이콘이 도로 작아진다 — 고 봤다. **틀렸다.** 자동 프레이밍(`thumbFrameToFit`
//      pad 1.06)이 이미 잉크를 0.85~0.92 로 채우고 있어 `k = INK/fill < 1` → `Math.max(1, …)` 에
//      걸려 **지금도 전 칸이 배율 1.000** 이다. 마감을 얹어도 1.000 그대로다(아래 표, 줄어드는 칸 0/8).
//      ⚠️ 앞 메모의 "배율이 장비마다 1.0~3.2로 달라서" 는 자동 프레이밍이 들어오기 전 이야기다 —
//         메모의 수치는 재기 전엔 믿지 말 것(TODO 함정 ④).
//   ⓑ (가설 — 실측으로 **확인**) `probe-equip-silhouette` / `probe-equip-dedupe` 는 알파 실루엣의
//      IoU 로 '변형이 갈리는지'를 판정한다. 모든 칸이 같은 전면 요소를 공유하면 실루엣이 서로
//      **완전히 같아진다**: 평균 IoU 0.416 → **1.000**(미분화 기준 0.90 을 전 쌍이 넘긴다).
//      두 게이트가 통째로 무의미해지고, 96px 판독성 회귀를 앞으로 영영 못 잡는다.
// 그래서 이 셋의 올바른 자리는 썸네일 캔버스가 아니라 **셀 크롬(CSS)** 이다. 수치로 남긴다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async () => {
        const N = 96;
        // 실제 목록에 나가는 칸들 — 부위별로 골고루
        const ITEMS = [
            { slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 },
            { slot: 'armor', age: 'primitive', ageIdx: 0, rarity: 'common', nameIdx: 2 },
            { slot: 'helmet', age: 'medieval', ageIdx: 1, rarity: 'epic', nameIdx: 1 },
            { slot: 'weapon', wtype: 'sword', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 },
            { slot: 'belt', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 },
            { slot: 'ring', age: 'space', ageIdx: 5, rarity: 'legend', nameIdx: 1 },
            { slot: 'boots', age: 'primitive', ageIdx: 0, rarity: 'common', nameIdx: 0 },
            { slot: 'gloves', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 2 },
        ];
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        // UI.measureThumb 과 **같은 계산**(js/ui.js) — 손으로 베끼지 않고 상수도 UI 에서 읽는다
        const INK = UI.THUMB_INK;
        const measure = (img, plate) => {
            cx.clearRect(0, 0, N, N);
            if (plate) {   // '아이콘 마감' 모사: 전면 비네트 + 레어리티 프레임 + 접지그림자
                const rg = cx.createRadialGradient(N / 2, N / 2, N * 0.2, N / 2, N / 2, N * 0.72);
                rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0.28)');
                cx.fillStyle = rg; cx.fillRect(0, 0, N, N);
                cx.strokeStyle = 'rgba(255,213,79,0.9)'; cx.lineWidth = 3;
                cx.strokeRect(2, 2, N - 4, N - 4);
                cx.fillStyle = 'rgba(0,0,0,0.35)';
                cx.beginPath(); cx.ellipse(N / 2, N * 0.86, N * 0.3, N * 0.06, 0, 0, Math.PI * 2); cx.fill();
            }
            cx.drawImage(img, 0, 0, N, N);
            const d = cx.getImageData(0, 0, N, N).data;
            let x0 = N, x1 = -1, y0 = N, y1 = -1, ink = 0;
            const sil = new Uint8Array(N * N);
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                if (d[(y * N + x) * 4 + 3] > 24) {
                    sil[y * N + x] = 1; ink++;
                    if (x < x0) x0 = x; if (x > x1) x1 = x;
                    if (y < y0) y0 = y; if (y > y1) y1 = y;
                }
            }
            const fill = x1 < 0 ? 0 : Math.max((x1 - x0 + 1) / N, (y1 - y0 + 1) / N);
            const k = Math.min(3.2, Math.max(1, INK / Math.max(0.05, fill)));
            return { k: +k.toFixed(3), fill: +fill.toFixed(3), sil, inkFrac: ink / (N * N) };
        };
        const jobs = ITEMS.map(item => new Promise(resolve => {
            const url = Scene3D.itemThumb(item);
            if (!url) { resolve(null); return; }
            const im = new Image();
            im.onload = () => resolve({ name: item.slot + '/' + item.age, plain: measure(im, false), plate: measure(im, true) });
            im.onerror = () => resolve(null);
            im.src = url;
        }));
        const rows = (await Promise.all(jobs)).filter(Boolean);
        // 실루엣 IoU — 마감을 얹으면 서로 다른 장비끼리도 실루엣이 같아지는지
        const iou = (a, b) => {
            let inter = 0, uni = 0;
            for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x && y) inter++; if (x || y) uni++; }
            return uni ? inter / uni : 0;
        };
        let plainIoU = 0, plateIoU = 0, pairs = 0;
        for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
            plainIoU += iou(rows[i].plain.sil, rows[j].plain.sil);
            plateIoU += iou(rows[i].plate.sil, rows[j].plate.sil);
            pairs++;
        }
        return {
            INK,
            rows: rows.map(r => ({ name: r.name, kPlain: r.plain.k, fillPlain: r.plain.fill, kPlate: r.plate.k, fillPlate: r.plate.fill })),
            plainIoU: pairs ? plainIoU / pairs : 0, plateIoU: pairs ? plateIoU / pairs : 0, pairs,
        };
    });
    await browser.close();

    console.log('THUMB_INK = ' + res.INK + '  (UI.measureThumb 가 목표로 삼는 잉크 비율)');
    console.log('\n칸                 지금 배율k  잉크비  마감 얹으면 k  잉크비');
    let lost = 0;
    for (const r of res.rows) {
        if (r.kPlate < r.kPlain - 0.001) lost++;
        console.log(`${r.name.padEnd(18)} ${r.kPlain.toFixed(3).padStart(9)} ${r.fillPlain.toFixed(3).padStart(7)} ${r.kPlate.toFixed(3).padStart(13)} ${r.fillPlate.toFixed(3).padStart(7)}`);
    }
    console.log(`\n① 셀 확대 배율이 줄어드는 칸: ${lost} / ${res.rows.length}`
        + (lost ? '' : '  ← 가설 기각. 자동 프레이밍이 이미 잉크를 0.85~0.92 로 채워 k 가 전 칸 1.000 이다'));
    console.log(`② 실루엣 평균 IoU(${res.pairs}쌍): 지금 ${res.plainIoU.toFixed(3)} → 마감 얹으면 ${res.plateIoU.toFixed(3)}`);
    console.log(`   (probe-equip-silhouette 의 미분화 판정 기준은 IoU ≤ 0.90 — 마감을 얹으면 전 쌍이 기준을 넘긴다)`);
    console.log('콘솔 에러 ' + errors.length);
    console.log('\n결론: 접지그림자·비네트·레어리티 프레임은 썸네일 캔버스가 아니라 **셀 크롬(CSS)** 에 둘 것.');
})();
