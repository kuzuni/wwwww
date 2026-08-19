// 무기 자루 과장 육안 대조 — 같은 런에서 off/on 을 나란히 굽는다 (equip-era-theming ⓑ)
// ⚠️ 커밋된 age-weapons.png 를 'before' 로 쓰지 말 것 — 그 파일은 앞 세션들의 재질 개편보다
//    낡아서(holy 계열 신설 전) 자루와 무관한 차이가 섞인다. A/B 는 반드시 **한 런 안에서**.
// 실게임 셀 배경(어두운 시대색 해칭) 위에 올린다 — 흰 바닥에서 채점하면 잣대부터 틀린다(⑬ 기록).
// 사용: node shot-weapon-shaft.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const WS = ['spear', 'staff', 'scythe', 'club', 'mace', 'hammer', 'axe', 'thrown'];
const Z = 3;   // 96px → 288px 확대 (자루 굵기를 눈으로 세기 위한 배율)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const png = await page.evaluate(async (o) => {
        const mk = (w) => {
            const age = AGES.find(a => weaponsOfAge(a).indexOf(w) >= 0) || 'medieval';
            return { name: (WEAPON_TYPES[w] || {}).kr || w, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'legendary', level: 10, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: 0 };
        };
        const bake = async () => {
            const urls = [];
            for (const w of o.WS) { Scene3D._thumbCache = {}; urls.push(Scene3D.itemThumb(mk(w))); }
            return urls;
        };
        const real = Scene3D.weaponThumbBulk.bind(Scene3D);
        const on = await bake();
        Scene3D.weaponThumbBulk = function () { return null; };
        const off = await bake();
        Scene3D.weaponThumbBulk = real;
        Scene3D._thumbCache = {};

        const cell = 96 * o.Z, padL = 70, head = 26;
        const cv = document.createElement('canvas');
        cv.width = padL + cell * o.WS.length;
        cv.height = head + cell * 2 + 20;
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.fillStyle = '#101114'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.font = '13px sans-serif'; cx.fillStyle = '#cfd4da';
        o.WS.forEach((w, i) => cx.fillText(w, padL + i * cell + 6, 17));
        cx.fillText('OFF', 6, head + cell / 2);
        cx.fillText('ON', 6, head + cell + cell / 2);
        const draw = (url, x, y) => new Promise(r => {
            const img = new Image();
            img.onload = () => {
                // 실게임 `.equip-cell` 배경(어두운 해칭) 근사 — 밝은 바닥에서 재면 자루가 실제보다 잘 보인다
                cx.fillStyle = '#26282e'; cx.fillRect(x, y, cell, cell);
                cx.strokeStyle = '#000'; cx.lineWidth = 2; cx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
                cx.drawImage(img, x, y, cell, cell);
                r();
            };
            img.onerror = () => r();
            img.src = url;
        });
        for (let i = 0; i < o.WS.length; i++) {
            if (off[i]) await draw(off[i], padL + i * cell, head);
            if (on[i]) await draw(on[i], padL + i * cell, head + cell);
        }
        return cv.toDataURL('image/png');
    }, { WS, Z });

    require('fs').writeFileSync(path.resolve(__dirname, 'weapon-shaft-ab.png'), Buffer.from(png.split(',')[1], 'base64'));
    console.log('→ tools/weapon-shaft-ab.png  (위=과장 없음 / 아래=출하)');
    console.log('콘솔 에러: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    await browser.close();
})();
