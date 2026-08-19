// 활 아이콘 판독 육안 대조 — 4배 확대, 실게임 셀 배경 (equip-era-theming ⓒ)
// 🚨 이 캡처를 반드시 볼 것. `probe-bow-silhouette` 의 조형 게이트(곡률변주·리커브)는 통과해도
//    확대해 보면 여전히 알파벳 D 로 읽히는 상태가 실제로 있었다 — 판독은 눈으로만 확인된다.
// 사용: node shot-bow-read.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const WS = ['bow', 'echoBow', 'wraithBow', 'seraphBow', 'crossbow'];   // 석궁은 대조군(활 계열과 갈려 읽혀야 한다)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const png = await page.evaluate(async (WS) => {
        const mk = (w) => {
            const age = AGES.find(a => weaponsOfAge(a).indexOf(w) >= 0) || 'medieval';
            return { name: WEAPON_TYPES[w].kr, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'legendary', level: 10, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: 0 };
        };
        const Z = 4, cell = 96 * Z;
        const cv = document.createElement('canvas');
        cv.width = cell * WS.length; cv.height = cell + 24;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.fillStyle = '#101114'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.font = '14px sans-serif'; cx.fillStyle = '#cfd4da';
        for (let i = 0; i < WS.length; i++) {
            cx.fillText(WS[i], i * cell + 8, 17);
            Scene3D._thumbCache = {};
            const u = Scene3D.itemThumb(mk(WS[i]));
            await new Promise(r => {
                const im = new Image();
                im.onload = () => {
                    cx.fillStyle = '#26282e'; cx.fillRect(i * cell, 24, cell, cell);   // 실게임 `.equip-cell` 어두운 배경
                    cx.drawImage(im, i * cell, 24, cell, cell); r();
                };
                im.onerror = () => r();
                im.src = u;
            });
        }
        Scene3D._thumbCache = {};
        return cv.toDataURL('image/png');
    }, WS);

    require('fs').writeFileSync(path.resolve(__dirname, 'bow-read.png'), Buffer.from(png.split(',')[1], 'base64'));
    console.log('→ tools/bow-read.png');
    console.log('콘솔 에러: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    await browser.close();
})();
