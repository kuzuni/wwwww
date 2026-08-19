// 밀폐 여압 투구(`sealed`) 검수 컨택트 시트 — 사용: node shot-helm-sealed.js [출력파일]
// TODO 'equip-era-theming' ⑦ 전용. 확인해야 하는 것은 둘이다:
//   ⑴ `sealed` 가 **밀폐 장비로 읽히는가** — 목 개스킷 칼라·걸쇠·넓은 전면창·턱 레귤레이터가
//      각도를 바꿔도 남아 있는가(정면에서만 서는 조형은 3/4 썸네일에서 사라진다).
//   ⑵ **이웃과 갈리는가** — 같은 시대에 함께 배정된 `tech`(메카)·`bubble`(유리 돔), 그리고
//      이 항목이 몰아낸 `visor`(중세 풀헬름)와 나란히 놓고 본다. 수치 게이트는
//      `probe-equip-silhouette`(96px 실루엣)가 이미 걸려 있고, 이건 **눈으로 보는** 쪽이다.
// 행 = 카메라 각도 3종(정면·3/4·측면), 열 = 스타일×시대.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'helm-sealed.png';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(() => {
        const S = 256;
        Scene3D.itemThumb({ slot: 'helmet', age: 'modern', ageIdx: 3, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cells = [
            { label: 'sealed/modern', style: 'sealed', age: 'modern' },
            { label: 'sealed/space', style: 'sealed', age: 'space' },
            { label: 'sealed/quantum', style: 'sealed', age: 'quantum' },
            { label: 'sealed/divine*', style: 'sealed', age: 'divine' },   // 미배정 시대 — 재질 계승만 확인
            { label: 'tech/space', style: 'tech', age: 'space' },
            { label: 'bubble/space', style: 'bubble', age: 'space' },
            { label: 'visor/medieval', style: 'visor', age: 'medieval' },
        ];
        // 정면 / 3-4(썸네일 기본) / 측면. 3/4 는 실제 아이콘이 쓰는 방향이라 가운데에 둔다.
        const d0 = Scene3D.ITEM_THUMB_DIR;
        const VIEWS = [
            { label: '정면', v: [0, 0.12, 1] },
            { label: '3/4(실제)', v: [d0.x, d0.y, d0.z] },
            { label: '측면', v: [1, 0.12, 0.05] },
        ];
        const cv = document.createElement('canvas');
        cv.width = S * cells.length; cv.height = S * VIEWS.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#20262f'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        const errs = [];
        VIEWS.forEach((view, r) => {
            cells.forEach((cell, c) => {
                let dataUrl = null;
                try {
                    const model = Scene3D.makeHelmet(cell.age, 'rare', cell.style, '');
                    const sc = Scene3D._thumbScene;
                    Scene3D.clearGroup(sc);
                    sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
                    const g = new THREE.Group();
                    g.add(model); sc.add(g);
                    Scene3D.thumbFrameToFit(Scene3D._thumbCam, g,
                        new THREE.Vector3(view.v[0], view.v[1], view.v[2]).normalize(), 1.06);
                    Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                    dataUrl = Scene3D._thumbR.domElement.toDataURL();
                } catch (e) { errs.push(cell.label + '@' + view.label + ': ' + e.message); }
                if (!dataUrl) return;
                jobs.push(new Promise(res2 => {
                    const im = new Image();
                    im.onload = () => { ctx.drawImage(im, c * S, r * S, S, S); res2(); };
                    im.onerror = () => res2();
                    im.src = dataUrl;
                }));
            });
        });
        return Promise.all(jobs).then(() => {
            ctx.font = 'bold 15px sans-serif';
            VIEWS.forEach((view, r) => cells.forEach((cell, c) => {
                ctx.fillStyle = cell.style === 'sealed' ? '#ffd54f' : '#ffffff';
                ctx.fillText(`${view.label} ${cell.label}`, c * S + 6, r * S + 18);
            }));
            return { url: cv.toDataURL(), errs };
        });
    });

    fs.writeFileSync(path.resolve(__dirname, OUT), Buffer.from(res.url.split(',')[1], 'base64'));
    if (res.errs.length) console.log('모델 빌드 실패:', res.errs.join(' | '));
    console.log(OUT + ' 저장 · 콘솔 에러', errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
