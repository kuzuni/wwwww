// 박스 캐릭터 시대 투구(equip-build-helmet) 팔레트 통일 검증 시트 — 사용: node shot-mc-helm.js
//  mc-helm-thumbs.png : 투구 썸네일 10시대 × 5종 (makeHelmet → mcHelmMats 시대 팔레트 경로)
//  목적: 투구가 갑옷·장신구와 같은 MC_CLOTH 시대 팔레트로 읽히는지 + 얼굴 디캘(눈) 무가림 + 콘솔 0 육안.
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
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.itemThumb && typeof Combat !== "undefined"');

    const url = await page.evaluate(() => {
        const S = 160;
        Scene3D.itemThumb({ slot: 'helmet', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cv = document.createElement('canvas');
        cv.width = S * 5; cv.height = S * AGES.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        AGES.forEach((age, r) => {
            for (let ni = 0; ni < 5; ni++) {
                const u = Scene3D.itemThumb({ slot: 'helmet', age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx: ni });
                if (!u) continue;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => {
                        ctx.drawImage(im, ni * S, r * S, S, S);
                        ctx.fillStyle = '#ffffff'; ctx.font = '11px sans-serif';
                        ctx.fillText((ITEM_NAMES[age].helmet[ni]) || '', ni * S + 4, r * S + S - 6);
                        res();
                    };
                    im.onerror = () => res();
                    im.src = u;
                }));
            }
            jobs.push(Promise.resolve().then(() => { ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(AGE_KR[age], 4, r * S + 16); }));
        });
        return Promise.all(jobs).then(() => cv.toDataURL());
    });
    fs.writeFileSync(path.join(__dirname, 'mc-helm-thumbs.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('mc-helm-thumbs.png 저장 · 콘솔에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
