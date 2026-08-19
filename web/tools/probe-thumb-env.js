// 장비 썸네일 렌더러의 환경맵·금속 반응 실측 (equip-era-theming 2차 채점 교차검증).
// 비평가 2인이 "metalness=0/환경맵 없음 — 강철이 도자기"라고 지적했는데 코드는 metalness 0.86~0.95 +
// PMREM 환경맵이다. 어느 쪽이 사실인지: ① _thumbScene.environment 가 실제로 서 있는지
// ② 금속(중세 plate)과 무광(원시 fabric)의 하이라이트 대비가 실제로 갈리는지 픽셀로 잰다.
// 사용: node probe-thumb-env.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');
    const r = await page.evaluate(() => {
        // 썸네일 하나 구워 렌더러를 세운다
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        const envOK = !!(Scene3D._thumbScene && Scene3D._thumbScene.environment);
        // 재질 파라미터 실측 — 중세 body
        const mats = Scene3D.ageGearMatsBase('medieval');
        const m = mats.body;
        // 금속 vs 무광 칸의 휘도 분포: 상위1% - 하위1% 폭과 상위 0.5% 평균(스페큘러 핀포인트)
        const stats = (item) => {
            Scene3D._thumbCache = {};
            const url = Scene3D.itemThumb(item);
            const img = new Image(); img.src = url;
            const c = document.createElement('canvas'); c.width = c.height = 96;
            const ctx = c.getContext('2d');
            ctx.drawImage(Scene3D._thumbR.domElement, 0, 0, 96, 96);
            const d = ctx.getImageData(0, 0, 96, 96).data;
            const lum = [];
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) continue; // 투명 배경 제외
                lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            }
            lum.sort((a, b) => a - b);
            const q = p => lum[Math.min(lum.length - 1, Math.floor(lum.length * p))] || 0;
            return { n: lum.length, p01: q(0.01), p50: q(0.5), p99: q(0.99), p995: q(0.995) };
        };
        const plate = stats({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 }); // 철판 갑옷(plate)
        const hide = stats({ slot: 'armor', age: 'primitive', ageIdx: 0, rarity: 'common', nameIdx: 0 }); // 가죽옷
        const divinePlate = stats({ slot: 'armor', age: 'divine', ageIdx: 9, rarity: 'common', nameIdx: 1 }); // 팔라딘 아머
        const halo = stats({ slot: 'helmet', age: 'divine', ageIdx: 9, rarity: 'common', nameIdx: 0 });   // 수호의 후광
        return {
            envOK,
            matSample: { metalness: m.metalness, roughness: m.roughness, envMapIntensity: m.envMapIntensity },
            plate, hide, divinePlate, halo,
        };
    });
    console.log(JSON.stringify(r, null, 1));
    console.log('콘솔 에러', errors.length, errors.slice(0, 3));
    await browser.close();
})();
