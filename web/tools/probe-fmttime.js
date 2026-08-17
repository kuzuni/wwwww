// 시간 표기 규칙 회귀 — 원본 스크린샷에서 읽은 실제 표기와 `U.fmtTime` 출력을 대조한다.
// 사용: PW_PATH=<playwright> node probe-fmttime.js
//
// 원본 근거(전부 눈으로 확인한 값):
//   shot-042831 업그레이드 진행바 `4일 2시` · 같은 화면 배경 맵 `1일 4시`·`1일 16시`
//   shot-042110 오프라인 보상 `수집 시간: 2시 10분`
//   shot-042546 기술 트리 연구중 `13시 30분` · shot-042356 펫 부화 `8시 27분`
// → 앞 단위 라벨은 '시간'이 아니라 **'시'**다.
// ⚠️ 분·초 구간은 원본 30장 어디에도 안 나온다 — 지어내지 말 것. 아래 검사도 '기존 표기 유지'만 본다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const D = 86400, H = 3600, M = 60;
const CASES = [
    [4 * D + 2 * H, '4일 2시', '원본 shot-042831 업그레이드 진행바'],
    [1 * D + 4 * H, '1일 4시', '원본 shot-042831 배경 맵'],
    [1 * D + 16 * H, '1일 16시', '원본 shot-042831 배경 맵'],
    [2 * H + 10 * M, '2시 10분', '원본 shot-042110 오프라인 보상'],
    [13 * H + 30 * M, '13시 30분', '원본 shot-042546 기술 트리'],
    [8 * H + 27 * M, '8시 27분', '원본 shot-042356 펫 부화'],
    [23 * H + 59 * M, '23시 59분', '시 구간 경계'],
    [1 * D, '1일 0시', '분 단위가 0이어도 두 토막을 유지한다(원본 `1일 4시` 꼴)'],
    [10 * M + 30, '10분 30초', '⚠️ 원본 미확인 — 기존 표기 유지 회귀만 본다'],
    [45, '45초', '⚠️ 원본 미확인 — 기존 표기 유지 회귀만 본다'],
    [0, '0초', '0'],
    [-5, '0초', '음수는 0으로 눌린다'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof U !== "undefined"', { label: '스크립트 로드' });

    let fail = 0;
    for (const [sec, want, why] of CASES) {
        const got = await page.evaluate(v => U.fmtTime(v), sec);
        const ok = got === want;
        if (!ok) fail++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} fmtTime(${String(sec).padStart(7)}) → ${String(got).padEnd(10)} (기대 ${want.padEnd(10)}) ${why}`);
    }

    // '시간' 이 화면에 남아 있지 않은지 — 시간 라벨을 쓰는 대표 화면 3곳을 실제로 열어 확인한다.
    await page.evaluate(() => {
        S.forgeLevel = 29; S.forgeUpgradeEndsAt = U.now() + 98 * 3600e3;
        UI.toast = () => { }; UI.showCraftModal = () => { };
        UI.openForgeInfo();
    });
    await page.waitForTimeout(350);
    const txt = await page.evaluate(() => document.getElementById('forge-info-modal').innerText);
    const hasHour = /\d+\s*시간/.test(txt);
    const hasDay = /\d+일\s*\d+시(?!간)/.test(txt);
    if (hasHour || !hasDay) fail++;
    console.log(`${!hasHour && hasDay ? 'OK  ' : 'FAIL'} 확률 정보 팝업 진행바 실제 렌더 — '일 N시' ${hasDay ? '있음' : '없음'} · '시간' ${hasHour ? '남아 있음' : '없음'}`);

    await browser.close();
    console.log(fail ? `실패 ${fail}건` : '실패 0건');
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    process.exit(fail ? 1 : 0);
})();
