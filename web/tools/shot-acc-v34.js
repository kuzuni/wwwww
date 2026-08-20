// 장신구 신규 변형 3·4 컨택트 시트 (equip-build-acc) — 사용: node shot-acc-v34.js → acc-v34.png
// 열 = [장갑v3, 장갑v4, 목걸이v3, 목걸이v4, 반지v3, 반지v4, 신발v3, 신발v4, 벨트v3, 벨트v4] · 행 = 10시대
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.itemThumb');

    const url = await page.evaluate(() => {
        const S = 128;
        Scene3D.itemThumb({ slot: 'belt', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cols = [];
        for (const slot of ['gloves', 'necklace', 'ring', 'shoes', 'belt']) for (const v of [3, 4]) cols.push([slot, v]);
        const cv = document.createElement('canvas');
        cv.width = S * cols.length; cv.height = S * AGES.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        AGES.forEach((age, r) => {
            cols.forEach(([slot, ni], c) => {
                const u = Scene3D.itemThumb({ slot, age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx: ni });
                if (!u) return;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => {
                        ctx.drawImage(im, c * S, r * S, S, S);
                        ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif';
                        ctx.fillText(accNames(age, slot)[ni] || '', c * S + 3, r * S + S - 5);
                        res();
                    };
                    im.onerror = () => res();
                    im.src = u;
                }));
            });
            jobs.push(Promise.resolve().then(() => { ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(AGE_KR[age], 3, r * S + 14); }));
        });
        return Promise.all(jobs).then(() => cv.toDataURL());
    });
    fs.writeFileSync(path.join(__dirname, 'acc-v34.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('acc-v34.png 저장 · 콘솔 에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
