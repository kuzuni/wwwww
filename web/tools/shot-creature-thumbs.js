// 탈것·펫 썸네일 컨택트 시트 + 장비 썸네일 회귀 확인 — 사용: node shot-creature-thumbs.js
// creatureThumb의 프레이밍을 바꿀 때마다 돌린다. 장비 썸네일은 **같은 카메라를 공유**하므로
// 탈것·펫 프레이밍을 손대면 장비 쪽이 통째로 어긋날 수 있어 함께 찍는다(회귀 감시).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const sheet = async (page, title, spec) => page.evaluate(async ({ title, spec }) => {
    const CELL = 96, COLS = 6, PAD = 18;
    const rows = Math.ceil(spec.length / COLS);
    const c = document.createElement('canvas');
    c.width = COLS * CELL; c.height = rows * (CELL + PAD) + 20;
    const x = c.getContext('2d');
    x.fillStyle = '#2b2f36'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#ffd54f'; x.font = 'bold 13px sans-serif'; x.textAlign = 'left';
    x.fillText(title, 6, 14);
    for (let i = 0; i < spec.length; i++) {
        const s = spec[i];
        const url = s.kind === 'pet' ? Scene3D.petThumb(s.name)
                  : s.kind === 'mount' ? Scene3D.mountThumb(s.name, s.rarity)
                  : Scene3D.itemThumb(s.item);
        const col = i % COLS, row = (i / COLS) | 0;
        const px = col * CELL, py = row * (CELL + PAD) + 20;
        x.strokeStyle = '#4b525c'; x.strokeRect(px + .5, py + .5, CELL - 1, CELL - 1);
        if (url) await new Promise(res => { const im = new Image(); im.onload = () => { x.drawImage(im, px, py, CELL, CELL); res(); }; im.onerror = res; im.src = url; });
        x.fillStyle = '#e8eaed'; x.font = '10px sans-serif'; x.textAlign = 'center';
        x.fillText(s.label.slice(0, 16), px + CELL / 2, py + CELL + 12);
    }
    return c.toDataURL().split(',')[1];
}, { title, spec });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.petThumb && Scene3D.itemThumb, null, { timeout: 30000 });

    const specs = await page.evaluate(() => {
        const pets = Object.keys(PET_COLORS || {}).slice(0, 24).map(n => ({ kind: 'pet', name: n, label: n }));
        const RA = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
        Mounts.ensure();
        const mn = Object.keys(MOUNT_ICONS);
        mn.forEach((n, i) => { S.mounts[n] = { rarity: RA[i % RA.length], level: 3, dupes: 0, subs: Mounts.rollSubs() }; });
        const mounts = mn.map((n, i) => ({ kind: 'mount', name: n, rarity: RA[i % RA.length], label: n }));
        // 장비: 무기 6종 + 투구/갑옷/장신구 — 탈것 카메라를 공유하므로 회귀 감시 대상
        const items = [];
        ['sword', 'axe', 'bow', 'staff', 'dagger', 'hammer'].forEach((w, i) =>
            items.push({ kind: 'item', label: w, item: { slot: 'weapon', wtype: w, age: AGES[3], ageIdx: 3, rarity: 'rare', nameIdx: w } }));
        ['helmet', 'armor', 'ring', 'necklace', 'shoes', 'belt'].forEach(sl =>
            items.push({ kind: 'item', label: sl, item: { slot: sl, wtype: null, age: AGES[3], ageIdx: 3, rarity: 'rare', nameIdx: 0 } }));
        return { pets, mounts, items };
    });

    for (const [name, title, spec] of [['creature-pets.png', '펫 썸네일', specs.pets],
                                       ['creature-mounts.png', '탈것 썸네일', specs.mounts],
                                       ['creature-items.png', '장비 썸네일 (카메라 공유 — 회귀 감시)', specs.items]]) {
        fs.writeFileSync(path.resolve(__dirname, name), Buffer.from(await sheet(page, title, spec), 'base64'));
        console.log('wrote tools/' + name);
    }
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.slice(0, 4).join(' | ') : '콘솔 에러 0건');
    await browser.close();
})();
