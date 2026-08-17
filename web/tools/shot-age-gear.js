// 시대 × 부위 장비 컨택트 시트 — 사용: node shot-age-gear.js (결과: age-gear.png)
// 시대 재질 언어(원시=돌·뼈·가죽 / 중세=단조 철·리벳 / 근세=황동·가죽 / 현대=폴리머·벤트 / 미래=합금·발광)가
// 눈으로 갈리는지 확인하는 용도. 썸네일 렌더러를 192px로 키워 리벳·발광 라인이 판독되게 찍는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const url = await page.evaluate(() => {
        const S = 192;
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cols = [
            ['helmet', 0], ['armor', 0], ['armor', 3], ['gloves', 1], ['necklace', 0], ['weapon', 0],
        ];
        const cv = document.createElement('canvas');
        cv.width = S * cols.length; cv.height = S * AGES.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        AGES.forEach((age, r) => {
            cols.forEach(([slot, nameIdx], c) => {
                const item = { slot, age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx };
                if (slot === 'weapon') item.wtype = weaponsOfAge(age)[0];
                const u = Scene3D.itemThumb(item);
                if (!u) return;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => { ctx.drawImage(im, c * S, r * S, S, S); res(); };
                    im.onerror = () => res();
                    im.src = u;
                }));
            });
            ctx.fillStyle = '#ffffff'; ctx.font = '13px sans-serif';
            ctx.fillText(`${AGE_KR[age]} / ${Scene3D.ageGearKind(age)}`, 4, r * S + 15);
        });
        return Promise.all(jobs).then(() => cv.toDataURL());
    });

    fs.writeFileSync(path.resolve(__dirname, 'age-gear.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('age-gear.png 저장 · 콘솔 에러', errors.length);
    await browser.close();
})();
