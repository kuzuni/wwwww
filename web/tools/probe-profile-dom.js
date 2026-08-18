// 프로필 팝업(shot-042724) 내부 요소 DOM 실측 — 전 UI 비율 전수 검증 패스.
// 원본 PNG 실측치(probe-segments.js, x 60~72%W, 496×893)를 목표로 두고 클론 rect를 %H/%W로 찍는다.
//   원본: 카드상단 15.57 · 이름필드 25.53~27.43(h1.90) · 성별필드 30.68~32.70(h2.02)
//         랭킹버튼 45.02~49.94(h4.92) · [프로필][설정]줄 74.02
// 팝업 열림 애니메이션(scale .7→1)이 rect를 오염시키므로 .opening을 떼고 400ms 기다린 뒤 잰다.
//
// 🚨 **2026-08-18 UI 세션에서 '측정 덤프' → '판정기'로 승격했다.** 그전까지 이 도구는 Δ만 찍고
//    exit 0 으로 끝나서, `exit 0` 을 통과로 읽으면 속는 6개 화면 중 하나였다(인계 메모 ㉡).
//    목표치(TARGET)는 이미 파일 안에 있었으므로 판정문만 붙였다 — 기준은 저장소 공통 ±2%p.
// 🚨 **`document.fonts.ready` 대기도 같이 넣었다.** 폰트 로드 전 프레임의 rect 는 런마다 달라
//    (인계 메모 ㉠: 같은 페이지에서 45.6→39.5px) 그 값으로 낸 '통과'는 무효다.
// 사용: node probe-profile-dom.js
//       node probe-profile-dom.js --selftest   ← 카드를 일부러 3%H 내려 **FAIL 이 실제로 나는지** 확인
//         (통과만 찍어 보고 '판정기가 돈다'고 믿지 말라는 저장소 규약. `probe-wolf-saddle --dead` 와 같은 장치다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const SELFTEST = process.argv.includes('--selftest');

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
    const errors = [];
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; UI.openProfile(); });
    await page.evaluate(() => document.fonts.ready);   // ⚠️ 폰트 전 프레임 실측 금지(인계 메모 ㉠)
    if (SELFTEST) await page.addStyleTag({ content: '#profile-modal .profile-sheet { position: relative; top: 3vh; }' });
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
    const TOL = 2.0;          // 저장소 공통 통과 기준: 요소 ±2%p
    const fails = [];
    let worst = 0, judged = 0;
    for (const [k, v] of Object.entries(m)) {
        if (v === null || typeof v === 'number') { console.log(`${k.padEnd(18)} ${v}`); continue; }
        const t = TARGET[k];
        // 목표치가 없는 요소는 **판정하지 않고 그대로 찍는다** — 없는 기준을 지어내면 그게 가짜 FAIL 의 출처다.
        if (!t) { console.log(`${k.padEnd(18)} top=${v.top} h=${v.h} left=${v.left} w=${v.w}   (원본 목표치 없음 · 미판정)`); continue; }
        const dTop = +(v.top - t[0]).toFixed(2);
        const dH = t[1] == null ? null : +(v.h - t[1]).toFixed(2);
        judged++;
        for (const [what, d] of [['top', dTop], ['h', dH]]) {
            if (d == null) continue;
            worst = Math.max(worst, Math.abs(d));
            if (Math.abs(d) > TOL) fails.push(`${k} ${what} Δ${d}%p (원본 ${what === 'top' ? t[0] : t[1]} vs 클론 ${what === 'top' ? v.top : v.h})`);
        }
        const mark = (Math.abs(dTop) > TOL || (dH != null && Math.abs(dH) > TOL)) ? '✗' : '✓';
        console.log(`${k.padEnd(18)} top=${v.top} h=${v.h} left=${v.left} w=${v.w} Δtop=${dTop}%p${dH == null ? '' : ` Δh=${dH}%p`}  ${mark}`);
    }
    await browser.close();

    console.log(`\n판정 대상 ${judged}요소 · 최대 편차 ${worst.toFixed(2)}%p (기준 ±${TOL.toFixed(2)}%p) · 콘솔 에러 ${errors.length}건`);
    if (fails.length || errors.length) {
        console.log(`\nFAIL ${fails.length + errors.length}건`);
        fails.forEach(f => console.log('  ✗ ' + f));
        errors.slice(0, 3).forEach(e => console.log('  ✗ 콘솔: ' + e));
        process.exit(1);
    }
    console.log('\nPASS — 목표치가 있는 요소 전부 ±2%p 이내');
})();
