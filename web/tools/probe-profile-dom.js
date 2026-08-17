// 프로필 팝업(shot-042724) 내부 요소 DOM 실측 — 전 UI 비율 전수 검증 패스.
// 원본 PNG 실측치(probe-segments.js, x 60~72%W, 496×893)를 목표로 두고 클론 rect를 %H/%W로 찍는다.
//   원본: 카드상단 15.57 · 이름필드 25.53~27.43(h1.90) · 성별필드 30.68~32.70(h2.02)
//         랭킹버튼 45.02~49.94(h4.92) · [프로필][설정]줄 74.02
// 팝업 열림 애니메이션(scale .7→1)이 rect를 오염시키므로 .opening을 떼고 400ms 기다린 뒤 잰다.
// 사용: node probe-profile-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const TARGET = {   // 원본 %H (496×893 스크린샷 기준)
    '카드 상단': [15.57, null], '이름 필드 상단': [25.53, 1.90], '성별 필드 상단': [30.68, 2.02],
    '랭킹 버튼 상단': [45.02, 4.92], '[프로필][설정]줄 상단': [74.02, null],
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; UI.openProfile(); });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
        document.querySelectorAll('.opening').forEach(e => e.classList.remove('opening'));
        const H = window.innerHeight, W = window.innerWidth;
        const pick = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
            return { top: +(r.top / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2),
                     left: +(r.left / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2) }; };
        const rows = [...document.querySelectorAll('#profile-modal .profile-field')];
        return {
            '카드 상단': pick('#profile-modal .profile-sheet'),
            '아바타 박스': pick('#profile-modal .profile-avatar-big'),
            '이름 필드 상단': rows[0] ? (r => ({ top: +(r.top / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2),
                left: +(r.left / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2) }))(rows[0].getBoundingClientRect()) : null,
            '성별 필드 상단': rows[1] ? (r => ({ top: +(r.top / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2),
                left: +(r.left / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2) }))(rows[1].getBoundingClientRect()) : null,
            '랭킹 라벨': pick('#profile-modal .profile-rank-label'),
            '랭킹 버튼 상단': pick('#profile-modal .profile-rank-row .btn'),
            '[프로필][설정]줄 상단': pick('#profile-modal .profile-tabs'),
            '카드 하단': (r => +((r.bottom) / H * 100).toFixed(2))(document.querySelector('#profile-modal .profile-sheet').getBoundingClientRect()),
        };
    });
    for (const [k, v] of Object.entries(m)) {
        if (v === null || typeof v === 'number') { console.log(`${k.padEnd(18)} ${v}`); continue; }
        const t = TARGET[k];
        const dTop = t ? ` Δtop=${(v.top - t[0]).toFixed(2)}%p` : '';
        const dH = t && t[1] ? ` Δh=${(v.h - t[1]).toFixed(2)}%p` : '';
        console.log(`${k.padEnd(18)} top=${v.top} h=${v.h} left=${v.left} w=${v.w}${dTop}${dH}`);
    }
    await browser.close();
})();
