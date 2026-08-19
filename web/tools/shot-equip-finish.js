// 장비 아이콘 '마감' 전/후 대조 시트 — 사용: node shot-equip-finish.js
// TODO `equip-design-dedupe` ㉯⑶(접지 그림자·소프트 AO·비네트·레어리티 프레임) 검수용.
// 결과 2장:
//   equip-finish-before.png / equip-finish-after.png  — 같은 칸을 마감 끄고/켜고 굽는다
// 행 = 부위, 열 = 시대 3종 + 등급 4종(프레임이 등급별로 갈리는지 보려면 등급 축이 필요하다).
// ⚠️ 마감을 끄는 스위치(`THUMB_FINISH_OFF`)와 여백(`THUMB_FIT_PAD`)을 **둘 다** 되돌려야
//    '전' 이 진짜 예전 그림이 된다 — 마감은 여백을 넓혀 그림자 자리를 내기 때문이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CELLS = [
    // [라벨, slot, age, nameIdx, rarity]
    ['원시 투구 common', 'helmet', 'primitive', 0, 'common'],
    ['원시 갑옷 rare', 'armor', 'primitive', 1, 'rare'],
    ['중세 갑옷 epic', 'armor', 'medieval', 0, 'epic'],
    ['중세 투구 legendary', 'helmet', 'medieval', 2, 'legendary'],
    ['중세 장갑 common', 'gloves', 'medieval', 1, 'common'],
    ['지옥 갑옷 ultimate', 'armor', 'underworld', 2, 'ultimate'],
    ['지옥 목걸이 mythic', 'necklace', 'underworld', 0, 'mythic'],
    ['우주 갑옷 epic', 'armor', 'space', 1, 'epic'],
    ['우주 신발 rare', 'shoes', 'space', 0, 'rare'],
    ['우주 반지 legendary', 'ring', 'space', 2, 'legendary'],
    ['우주 벨트 common', 'belt', 'space', 1, 'common'],
    ['신성 갑옷 mythic', 'armor', 'divine', 0, 'mythic'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    for (const mode of ['before', 'after']) {
        const url = await page.evaluate(async ({ cells, mode }) => {
            const S = 192, PAD = 24, COLS = 4;
            Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
            Scene3D._thumbR.setSize(S, S);
            Scene3D._thumbCache = {};
            Scene3D.THUMB_FINISH_OFF = (mode === 'before');
            Scene3D.THUMB_FIT_PAD = (mode === "before") ? 1.06 : 1.10;
            const rows = Math.ceil(cells.length / COLS);
            const cv = document.createElement('canvas');
            cv.width = S * COLS; cv.height = (S + PAD) * rows;
            const ctx = cv.getContext('2d');
            // 🚨 바탕은 **실제 목록 셀의 회색**이어야 한다 — 예전 판은 짙은 남색을 깔았는데,
            //    접지 그림자가 검정이라 어두운 바탕에서는 있으나 없으나 똑같이 보인다(판정 불능).
            //    실제 `.equip-cell` 면은 `color-mix(--rc 58%, #17181a)` = common 기준 중간 회색이다.
            ctx.fillStyle = '#8f9296'; ctx.fillRect(0, 0, cv.width, cv.height);
            for (let i = 0; i < cells.length; i++) {
                const [label, slot, age, nameIdx, rarity] = cells[i];
                const u = Scene3D.itemThumb({ slot, age, ageIdx: AGES.indexOf(age), rarity, nameIdx });
                const cx = (i % COLS) * S, cy = Math.floor(i / COLS) * (S + PAD);
                if (u) {
                    const img = new Image();
                    await new Promise(r => { img.onload = r; img.onerror = r; img.src = u; });
                    ctx.drawImage(img, cx, cy, S, S);
                }
                ctx.fillStyle = '#12161c';
                ctx.font = '15px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, cx + S / 2, cy + S + 17);
            }
            Scene3D.THUMB_FINISH_OFF = false;
            Scene3D.THUMB_FIT_PAD = 1.10;
            Scene3D._thumbCache = {};
            return cv.toDataURL();
        }, { cells: CELLS, mode });
        const out = path.resolve(__dirname, 'equip-finish-' + mode + '.png');
        fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
        console.log('저장: ' + out);
    }
    console.log('콘솔 에러:', errors.length, errors.slice(0, 5));
    await browser.close();
})();
