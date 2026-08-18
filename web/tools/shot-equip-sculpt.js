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
        // 3번째 행 = **96px 다운샘플 판독성 행**. 비평가가 "다운샘플하면 갑옷 5칸이 같은 흰
        // 항아리로 수렴한다"고 지적한 것을 눈으로 확인·반려하기 위한 줄이다(원본 96px 을
        // 타일 가운데에 1:1로 놓고, 옆에 실루엣만 검게 칠한 판을 나란히 둔다).
        cv.width = S * COLS; cv.height = S * (AGE_ROWS.length + 1);
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
                    im.onload = () => {
                        ctx.drawImage(im, c * S, r * S, S, S);
                        if (r === AGE_ROWS.length - 1) {   // 마지막 시대 행으로 판독성 행을 만든다
                            const y = AGE_ROWS.length * S;
                            ctx.drawImage(im, c * S + 12, y + 40, 96, 96);          // 실제 표시 크기
                            const t = document.createElement('canvas'); t.width = t.height = 96;
                            const tc = t.getContext('2d', { willReadFrequently: true });
                            tc.drawImage(im, 0, 0, 96, 96);
                            const d2 = tc.getImageData(0, 0, 96, 96);
                            for (let i = 0; i < d2.data.length; i += 4) {           // 실루엣만 남긴다
                                const a = d2.data[i + 3];
                                d2.data[i] = d2.data[i + 1] = d2.data[i + 2] = a > 24 ? 20 : 0;
                                d2.data[i + 3] = a > 24 ? 255 : 0;
                            }
                            tc.putImageData(d2, 0, 0);
                            ctx.fillStyle = '#8a97a8'; ctx.fillRect(c * S + 120, y + 40, 96, 96);
                            ctx.drawImage(t, c * S + 120, y + 40, 96, 96);
                        }
                        res();
                    };
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
            ctx.fillStyle = '#ffd54f';
            cells.forEach((cell, c) => ctx.fillText(`96px ${cell.label}`, c * S + 6, AGE_ROWS.length * S + 24));
            return { url: cv.toDataURL(), errs };
        });
    }, ONLY);

    fs.writeFileSync(path.resolve(__dirname, OUT), Buffer.from(res.url.split(',')[1], 'base64'));
    if (res.errs.length) console.log('모델 빌드 실패:', res.errs.join(' | '));
    console.log(OUT + ' 저장 · 콘솔 에러', errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
