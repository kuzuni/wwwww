// 보스 경고 × 팝업 겹침 검증 (QA 9차 버그): 팝업이 열려 있으면 #boss-warning이 카드 위에 그려지면 안 된다.
//  ① 팝업 3종(던전 목록·오프라인 보상·진행 패스)을 열고 UI.bossWarning() 실행
//  ② 카드 사각형 안 96점(8×12 격자)의 **실제 최상위 페인트 요소**가 #boss-warning 계열이면 FAIL
//     — #boss-warning은 pointer-events:none이라 elementFromPoint가 그냥은 잡지 못한다.
//       측정 중에만 pointer-events:auto를 강제해 페인트 순서를 그대로 읽는다.
//  ③ 배너·문구의 기하학적 겹침 넓이는 참고 수치로만 찍는다(아래로 깔린 뒤에도 좌표는 겹친다)
//  ④ 팝업이 없을 때는 경고가 그대로 최상위(z-index 35)여야 한다 — 회귀 방지
// 사용: node probe-bosswarn-modal.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CASES = [
    ['던전 목록', () => UI.openDungeons()],
    ['오프라인 보상', () => UI.showOffline({ secs: 10800, coins: 10800, hammers: 180 })],
    ['진행 패스', () => UI.openPass()],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [], rows = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        // 측정용: pointer-events:none 때문에 elementFromPoint가 경고 레이어를 통과해 버린다 — 히트 테스트 동안만 켠다
        const st = document.createElement('style');
        st.id = 'probe-hit'; st.textContent = '#boss-warning, #boss-warning * { pointer-events: auto !important; }';
        document.head.appendChild(st);
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};  // 캡처·측정 속도 (인계 메모)
        Combat.tick = function () {};
        S.coins = 1e9; S.hammers = 1e6; S.dungeonKeys = { hammer: 9, ghost: 9, invasion: 9, zombie: 9 };
    });

    for (const [name] of CASES) {
        const idx = CASES.findIndex(c => c[0] === name);
        const r = await page.evaluate((i) => {
            const OPEN = [() => UI.openDungeons(),
                          () => UI.showOffline({ secs: 10800, coins: 10800, hammers: 180 }),
                          () => UI.openPass()];
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            OPEN[i]();
            UI.bossWarning(2);
            const card = document.querySelector('.modal:not(.hidden) .modal-card');
            if (!card) return { err: '카드를 찾지 못함' };
            const c = card.getBoundingClientRect();
            // 카드 안 96점(8×12)의 최상위 페인트 요소
            const hits = [];
            for (let iy = 0; iy < 12; iy++) for (let ix = 0; ix < 8; ix++) {
                const x = c.left + c.width * (0.02 + 0.96 * ix / 7), y = c.top + c.height * (0.01 + 0.98 * iy / 11);
                const el = document.elementFromPoint(x, y);
                hits.push(el && el.closest('#boss-warning') ? '#boss-warning' : 'other');
            }
            // 겹침 넓이 (배너 / 보스 출현 문구)
            const area = sel => {
                const e = document.querySelector('#boss-warning ' + sel);
                if (!e) return -1;
                const b = e.getBoundingClientRect();
                const w = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
                const h = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
                return Math.round(w) * Math.round(h);
            };
            const bw = getComputedStyle(document.getElementById('boss-warning'));
            const dim = getComputedStyle(document.querySelector('#boss-warning .bw-dim'));
            return {
                card: `${Math.round(c.left)},${Math.round(c.top)} ${Math.round(c.width)}×${Math.round(c.height)}`,
                z: bw.zIndex, dimDisplay: dim.display,
                overBoss: hits.filter(h => h === '#boss-warning').length,
                banner: area('.bw-banner'), sub: area('.bw-sub'),
            };
        }, idx);
        ok(!r.err, `${name}: ${r.err || ''}`);
        if (r.err) continue;
        rows.push(`${name.padEnd(8)} card=${r.card} z=${r.z} dim=${r.dimDisplay} 카드덮임=${r.overBoss}/96 (참고 좌표겹침 배너=${r.banner}px² 문구=${r.sub}px²)`);
        ok(r.overBoss === 0, `${name}: 카드 안 표본 ${r.overBoss}/96이 아직 #boss-warning에 덮여 있다`);
        ok(r.z === '19', `${name}: 팝업 중 z-index가 ${r.z} (19 기대)`);
        ok(r.dimDisplay === 'none', `${name}: 경고 딤이 모달 딤과 겹쳐 켜져 있다 (${r.dimDisplay})`);
    }

    // ④ 팝업 없을 때는 원래대로 최상위
    const solo = await page.evaluate(() => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.bossWarning(2);
        const bw = getComputedStyle(document.getElementById('boss-warning'));
        const dim = getComputedStyle(document.querySelector('#boss-warning .bw-dim'));
        const mid = document.elementFromPoint(215, 200);
        return { z: bw.zIndex, dim: dim.display, top: mid && !!mid.closest('#boss-warning') };
    });
    rows.push(`팝업없음   z=${solo.z} dim=${solo.dim} 화면중앙최상위=${solo.top}`);
    await page.evaluate(() => { const st = document.getElementById('probe-hit'); if (st) st.remove(); });
    ok(solo.z === '35', `팝업 없을 때 z-index가 ${solo.z} (35 기대)`);
    ok(solo.dim === 'block', `팝업 없을 때 경고 딤이 꺼졌다 (${solo.dim})`);
    ok(solo.top, '팝업 없을 때 경고가 화면 최상위가 아니다');

    console.log(rows.join('\n'));
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fails.length ? '❌ FAIL\n - ' + fails.join('\n - ') : '✅ PASS — 팝업 중 보스 경고 겹침 0');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
