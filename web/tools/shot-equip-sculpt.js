// 갑옷·장갑·신발·벨트 조형 컨택트 시트 — 사용: node shot-equip-sculpt.js [출력파일]
// TODO 'equip-design-dedupe' ㉯⑴(프리미티브 상자 → 곡률/파울드론/밑창/손가락 조형) 전용 검수 도구.
// 22칸(갑옷 6스타일 + 장갑 3 + 신발 3 + 벨트 3 = 15종을 시대 2종으로) 을 256px 로 크게 굽는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'equip-sculpt.png';
// 3840px 한 장은 읽기 어려워 부위별로 잘라 찍는다: node shot-equip-sculpt.js out.png armor|gloves|shoes|belt
const ONLY = process.argv[3] || '';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate((ONLY) => {
        const S = 256;
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        // 열: 갑옷 6스타일(스타일을 직접 지정하려 nameIdx 대신 style 강제) + 장갑3 + 신발3 + 벨트3
        const cells = [];
        const ARMOR = ['plate', 'hide', 'robe', 'cape', 'vest', 'suit'];
        if (!ONLY || ONLY === 'armor') for (const st of ARMOR) cells.push({ label: '갑옷/' + st, slot: 'armor', style: st });
        for (const sl of ['gloves', 'shoes', 'belt']) {
            if (ONLY && ONLY !== sl) continue;
            const kr = { gloves: '장갑', shoes: '신발', belt: '벨트' }[sl];
            for (let v = 0; v < 3; v++) cells.push({ label: kr + '/v' + v, slot: sl, variant: v });
        }
        const AGE_ROWS = ['primitive', 'medieval'];
        const COLS = cells.length;
        const cv = document.createElement('canvas');
        cv.width = S * COLS; cv.height = S * AGE_ROWS.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#20262f'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        const errs = [];
        AGE_ROWS.forEach((age, r) => {
            const ageIdx = AGES.indexOf(age);
            cells.forEach((cell, c) => {
                // itemThumb 캐시 키를 우회하려고 모델을 직접 굽지 않고, 스타일/변형을 넣은 임시 item 을 쓴다
                // itemThumb 은 (시대,이름idx) 캐시 키라 스타일/변형을 직접 못 고른다 —
                // 같은 씬·카메라·프레이밍을 그대로 재현해 모델만 갈아 끼운다.
                let dataUrl = null;
                try {
                    const model = cell.slot === 'armor'
                        ? Scene3D.makeArmorPreview(age, 'rare', cell.style, '')
                        : Scene3D.makeAccessoryPreview(cell.slot, cell.variant, age, 'rare', '');
                    const sc = Scene3D._thumbScene;
                    Scene3D.clearGroup(sc);
                    sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
                    const g = new THREE.Group();
                    g.add(model); sc.add(g);
                    const d = Scene3D.ITEM_THUMB_DIR;
                    Scene3D.thumbFrameToFit(Scene3D._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
                    Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                    dataUrl = Scene3D._thumbR.domElement.toDataURL();
                } catch (e) { errs.push(cell.label + ': ' + e.message); }
                if (!dataUrl) return;
                void ageIdx;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => { ctx.drawImage(im, c * S, r * S, S, S); res(); };
                    im.onerror = () => res();
                    im.src = dataUrl;
                }));
            });
        });
        return Promise.all(jobs).then(() => {
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif';
            AGE_ROWS.forEach((age, r) => cells.forEach((cell, c) => {
                ctx.fillText(`${age.slice(0, 4)} ${cell.label}`, c * S + 6, r * S + 18);
            }));
            return { url: cv.toDataURL(), errs };
        });
    }, ONLY);

    fs.writeFileSync(path.resolve(__dirname, OUT), Buffer.from(res.url.split(',')[1], 'base64'));
    if (res.errs.length) console.log('모델 빌드 실패:', res.errs.join(' | '));
    console.log(OUT + ' 저장 · 콘솔 에러', errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
