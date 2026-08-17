// 이름별 장비 컨택트 시트 — 사용: node shot-equip-names.js [시대...] (결과: equip-names-<시대>.png)
// '모든 장비의 목록'의 한 섹션을 그대로 펼쳐, 같은 부위의 이름 변형들이 눈으로 갈리는지 본다
// (사용자 지시 "장비 디자인 중복 제거 — 시대·이름별 전부 다르게"의 ⑤ 검증).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TARGETS = process.argv.slice(2).length ? process.argv.slice(2) : ['primitive', 'medieval', 'underworld'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    for (const age of TARGETS) {
        const url = await page.evaluate((age) => {
            const S = 176, PAD = 26;
            Scene3D.itemThumb({ slot: 'armor', age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
            Scene3D._thumbR.setSize(S, S);
            Scene3D._thumbCache = {};
            const slots = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'];
            const rows = slots.map(slot => ({
                slot,
                names: (slot === 'helmet' || slot === 'armor')
                    ? ((ITEM_NAMES[age] || {})[slot] || []) : accNames(age, slot),
            }));
            const cols = Math.max(...rows.map(r => r.names.length));
            const cv = document.createElement('canvas');
            cv.width = S * cols; cv.height = (S + PAD) * rows.length;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, cv.width, cv.height);
            const jobs = [];
            rows.forEach((r, ri) => {
                r.names.forEach((name, ci) => {
                    const u = Scene3D.itemThumb({
                        slot: r.slot, age, ageIdx: AGES.indexOf(age), rarity: 'common',
                        nameIdx: ci, wtype: null,
                    });
                    const x = ci * S, y = ri * (S + PAD);
                    jobs.push(new Promise(res => {
                        const im = new Image();
                        im.onload = () => {
                            ctx.drawImage(im, x, y, S, S);
                            ctx.fillStyle = '#cfd8e3';
                            ctx.font = '15px sans-serif';
                            ctx.fillText(`${SLOT_KR[r.slot]} · ${name} [${substanceOf(name) || '시대재질'}]`, x + 6, y + S + 17);
                            res();
                        };
                        im.onerror = res;
                        im.src = u;
                    }));
                });
            });
            return Promise.all(jobs).then(() => {
                Scene3D._thumbR.setSize(96, 96);
                Scene3D._thumbCache = {};
                return cv.toDataURL();
            });
        }, age);
        const out = path.resolve(__dirname, `equip-names-${age}.png`);
        fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
        console.log('저장:', out);
    }
    console.log('콘솔 에러:', errors.length, errors.slice(0, 5));
    await browser.close();
})();
