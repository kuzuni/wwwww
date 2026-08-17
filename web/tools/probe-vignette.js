// 영웅 피격 비네트 실측 — "붉은 기가 화면 아래 절반에 없다"(3차 지적 🔴)를 좌표·픽셀로 확인한다.
// 사용: node probe-vignette.js
// 재는 것: ① #dmg-flash의 부모·z-index·바운딩 박스가 화면 전체인가
//          ② 비네트 on/off 두 장을 행 단위로 diff 해서 **붉은 기가 실제로 증가한 y 구간**이 어디까지인가
//            (예전엔 y 58~432에서 뚝 끊겼다 — 그 아래 장비 시트·탭바에는 비네트가 없었다)
// ⚠️ 3D 루프가 도는 동안은 swiftshader 스크린샷이 15~30초 걸린다 → Scene3D.update를 먼저 멈춘다(0.15초).
//    루프를 멈춰도 비네트는 DOM 오버레이라 그대로 보인다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const W = 480, H = 854;

// PNG를 캔버스로 디코드해 행별 평균 R/G/B를 뽑는다 (페이지 안에서 처리 — 외부 이미지 라이브러리 금지)
async function rowProfile(page, buf) {
    return page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data;
        const rows = [];
        for (let y = 0; y < img.height; y++) {
            let r = 0, g = 0, bl = 0;
            for (let px = 0; px < img.width; px++) {
                const i = (y * img.width + px) * 4;
                r += d[i]; g += d[i + 1]; bl += d[i + 2];
            }
            rows.push([r / img.width, g / img.width, bl / img.width]);
        }
        return rows;
    }, buf.toString('base64'));
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 렌더 루프 정지 — 두 장을 같은 배경에서 찍어야 diff가 비네트만 잡는다
    await page.evaluate(() => { Scene3D.update = function () { }; Combat.tick = function () { }; });
    await page.waitForTimeout(300);

    const geo = await page.evaluate(() => {
        const el = document.getElementById('dmg-flash');
        const r = el.getBoundingClientRect();
        return {
            parent: el.parentElement.id,
            z: getComputedStyle(el).zIndex,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            screen: [innerWidth, innerHeight],
        };
    });

    const off = await page.screenshot();
    // 실제 경로(UI.flashDamage)를 태우되, 키프레임이 흐르지 않게 애니메이션을 고정 시점에 정지시킨다.
    // (인라인 opacity는 CSS 애니메이션에 진다 — 예전 촬영기가 여기서 틀렸다. animation-play-state로 멈춘다.)
    await page.evaluate(() => {
        UI.flashDamage(0.5);
        const el = document.getElementById('dmg-flash');
        el.style.setProperty('animation-play-state', 'paused', 'important');
        el.style.setProperty('animation-delay', '-0.15s', 'important'); // 키프레임 38% 구간(최대 불투명)에 정지
    });
    await page.waitForTimeout(200);
    const on = await page.screenshot();

    const A = await rowProfile(page, off), B = await rowProfile(page, on);
    // 붉은 기 = R 증가분에서 G·B 증가분을 뺀 값(전체가 밝아지는 것과 구분)
    const redness = A.map((a, y) => (B[y][0] - a[0]) - ((B[y][1] - a[1]) + (B[y][2] - a[2])) / 2);
    const TH = 1.5; // 행 평균 1.5 RGB 이상 붉어지면 '비네트 있음'
    let first = -1, last = -1;
    redness.forEach((v, y) => { if (v > TH) { if (first < 0) first = y; last = y; } });
    // 화면을 8등분해 밴드별 붉은 기 — 아래쪽 밴드가 0이면 예전 결함이 남은 것
    const bands = [];
    for (let i = 0; i < 8; i++) {
        const s = Math.floor(H * i / 8), e = Math.floor(H * (i + 1) / 8);
        bands.push(+(redness.slice(s, e).reduce((p, v) => p + v, 0) / (e - s)).toFixed(2));
    }

    console.log('=== #dmg-flash 기하 ===');
    console.log('부모:', geo.parent, '/ z-index:', geo.z, '/ rect:', geo.rect.join(','), '/ 화면:', geo.screen.join('x'));
    // #app이 화면보다 1px 낮게 잡히는 반올림이 있어 ±2px 허용
    const full = Math.abs(geo.rect[1]) <= 2 && Math.abs(geo.rect[1] + geo.rect[3] - geo.screen[1]) <= 2;
    console.log('풀스크린 여부:', full ? 'OK (화면 전체)' : 'NG (일부만 덮음)');
    console.log('\n=== 붉은 기 증가 구간 (행 평균, 임계 ' + TH + ') ===');
    console.log('첫 행 y=' + first + ' / 마지막 행 y=' + last + '  (화면 높이 ' + H + ')');
    console.log('8밴드 붉은 기:', bands.join(' | '));
    console.log('아래 절반(밴드 4~7) 최솟값:', Math.min(...bands.slice(4)).toFixed(2),
        Math.min(...bands.slice(4)) > TH ? '→ OK (아래 절반도 붉어짐)' : '→ NG (아래 절반 비네트 없음)');
    // 회귀: 모달이 떠 있으면 비네트가 모달(20) 밑으로 내려가야 한다(보스 경고와 같은 규칙)
    const stack = await page.evaluate(() => {
        const el = document.getElementById('dmg-flash');
        const m = document.getElementById('craft-modal');
        m.classList.remove('hidden');
        const withModal = getComputedStyle(el).zIndex;
        m.classList.add('hidden');
        return { withModal, bossWarn: getComputedStyle(document.getElementById('boss-warning')).zIndex };
    });
    console.log('\n=== 스택 회귀 ===');
    console.log('모달 열림 시 비네트 z:', stack.withModal, (+stack.withModal < 20 ? '→ OK (모달 아래)' : '→ NG (모달 위)'));
    console.log('보스 경고 z:', stack.bossWarn, (+stack.bossWarn > 34 ? '→ OK (비네트 위)' : '→ NG'));
    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 3).join(' | '));
    await browser.close();
})();
