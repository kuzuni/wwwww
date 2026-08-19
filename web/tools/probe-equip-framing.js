// 장비 썸네일 프레이밍 실측 — 사용: node probe-equip-framing.js
// 배경: 장비 썸네일은 부위별 고정 배율(투구1.5·갑옷1.3·장신구1.4) + 고정 카메라를 썼다.
// 형상이 제각각이라 납작한 '수호의 후광'은 프레임 위쪽 실선 한 줄로, 길쭉한 '사신의 모자'는
// 고깔 끝이 잘려 나갔고, 장갑은 타일 한가운데 좁쌀만 하게 떠 있었다.
// (탈것/펫 썸네일이 같은 함정을 먼저 밟고 정점 투영 자동 프레이밍으로 고쳤다 — 지금은 공용 헬퍼.)
//
// 판정 기준 (TODO '아이콘 크기 확대' ⑤: 프레임의 85~95%를 채울 것):
//   ① 크롭 0 — 알파가 있는 픽셀이 프레임 가장자리 행/열에 닿으면 잘린 것이다
//   ② 채움비 — max(폭,높이)/프레임 이 [0.82, 0.99] 안 (자동 프레이밍 pad 1.06 → 이론상 0.943)
//   ③ 중심 이탈 — 실루엣 중심이 프레임 중심에서 ±4% 이내
// 306칸 전부를 페이지 안에서 재고, 실패 칸만 이름과 수치를 찍는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const FILL_MIN = 0.82, FILL_MAX = 0.99, OFF_MAX = 0.04;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');   // ⚠️ waitForFunction 은 이 컨테이너에서 안 돈다(wait-ready.js 헤더 참조)

    const res = await page.evaluate(async ({ FILL_MIN, FILL_MAX, OFF_MAX }) => {
        const S = 128;
        Scene3D.itemThumb({ slot: 'armor', age: AGES[0], ageIdx: 0, rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const slots = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'];
        const cells = [];
        for (const age of AGES) {
            for (const slot of slots) {
                const names = (slot === 'helmet' || slot === 'armor')
                    ? ((ITEM_NAMES[age] || {})[slot] || []) : accNames(age, slot);
                names.forEach((name, nameIdx) => cells.push({ age, ageIdx: AGES.indexOf(age), slot, nameIdx, name }));
            }
        }
        // 알파 실루엣을 재려면 dataURL 을 다시 디코드해야 한다 — 캔버스 한 장을 돌려 쓴다.
        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const out = [];
        for (const c of cells) {
            const url = Scene3D.itemThumb({ slot: c.slot, age: c.age, ageIdx: c.ageIdx, rarity: 'common', nameIdx: c.nameIdx });
            if (!url) { out.push(Object.assign({ fail: 'render' }, c)); continue; }
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            ctx.clearRect(0, 0, S, S);
            ctx.drawImage(img, 0, 0, S, S);
            const d = ctx.getImageData(0, 0, S, S).data;
            let xMin = S, xMax = -1, yMin = S, yMax = -1, ink = 0;
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    if (d[(y * S + x) * 4 + 3] > 24) {          // 알파 임계값 — 안티에일리어싱 가장자리 제외
                        ink++;
                        if (x < xMin) xMin = x; if (x > xMax) xMax = x;
                        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
                    }
                }
            }
            if (xMax < 0) { out.push(Object.assign({ fail: 'empty' }, c)); continue; }
            const w = (xMax - xMin + 1) / S, h = (yMax - yMin + 1) / S;
            // 크롭: 실루엣이 프레임 가장자리 행/열에 닿았는가 (1px 여유도 없이)
            const crop = (xMin === 0) || (yMin === 0) || (xMax === S - 1) || (yMax === S - 1);
            const cx = (xMin + xMax + 1) / 2 / S - 0.5, cy = (yMin + yMax + 1) / 2 / S - 0.5;
            const fill = Math.max(w, h);
            const bad = [];
            if (crop) bad.push('크롭');
            if (fill < FILL_MIN) bad.push('작음');
            if (fill > FILL_MAX) bad.push('넘침');
            if (Math.abs(cx) > OFF_MAX || Math.abs(cy) > OFF_MAX) bad.push('치우침');
            out.push(Object.assign({ w, h, fill, cx, cy, ink: ink / (S * S), bad }, c));
        }
        return out;
    }, { FILL_MIN, FILL_MAX, OFF_MAX });

    const rendered = res.filter(r => !r.fail);
    const failed = res.filter(r => r.fail);
    const bad = rendered.filter(r => r.bad.length);
    const pct = v => (v * 100).toFixed(1) + '%';
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);

    console.log(`총 칸 ${res.length}  렌더실패 ${failed.length}`);
    console.log(`채움비 평균 ${pct(avg(rendered.map(r => r.fill)))}  최소 ${pct(Math.min(...rendered.map(r => r.fill)))}  최대 ${pct(Math.max(...rendered.map(r => r.fill)))}`);
    console.log(`잉크(알파 픽셀 비율) 평균 ${pct(avg(rendered.map(r => r.ink)))}`);
    console.log(`기준 위반 칸 ${bad.length} / ${rendered.length}  (크롭 ${bad.filter(r => r.bad.includes('크롭')).length} · 작음 ${bad.filter(r => r.bad.includes('작음')).length} · 넘침 ${bad.filter(r => r.bad.includes('넘침')).length} · 치우침 ${bad.filter(r => r.bad.includes('치우침')).length})`);
    for (const r of bad.slice(0, 40)) {
        console.log(`  [${r.bad.join(',')}] ${r.age}/${r.slot}#${r.nameIdx} ${r.name}  채움 ${pct(r.fill)} (${pct(r.w)}×${pct(r.h)})  중심오차 ${pct(r.cx)},${pct(r.cy)}`);
    }
    if (bad.length > 40) console.log(`  … 외 ${bad.length - 40}칸`);
    for (const r of failed) console.log(`  [${r.fail}] ${r.age}/${r.slot}#${r.nameIdx} ${r.name}`);
    console.log('콘솔 에러:', errors.length, errors.slice(0, 5));

    await browser.close();
    process.exit(bad.length === 0 && failed.length === 0 && errors.length === 0 ? 0 : 1);
})();
