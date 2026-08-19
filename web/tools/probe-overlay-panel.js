// overlay-covers-panel 검증: 사망 암전(deathFade)·보스 경고(#boss-warning)가 탭 패널을 덮으면 안 된다.
//  구조 수정: #game-area 에 isolation:isolate — 씬 내부 z(12~16)가 #app 형제(.panel 8)와 직접 겨루지 못하게.
//  ① 소환 패널(기술트리 서브탭)을 열고 deathFade + bossWarning 을 강제 → 패널 사각형 안 96점의
//     최상위 페인트 요소가 씬 연출(#fx-layer 자식·#boss-warning 계열)이면 FAIL
//     — 두 연출 다 pointer-events:none 이라 측정 중에만 auto 를 강제해 페인트 순서를 그대로 읽는다.
//  ② 회귀: 패널을 닫으면 같은 연출이 씬 HUD(#skill-bar)를 여전히 덮어야 한다(내부 서열 12<15<16 보존).
//  ③ 회귀: 팝업(.modal) 위 서열은 probe-bosswarn-modal.js 가 별도로 지킨다 — 여기선 던전 팝업 하나만 재확인.
// 사용: node probe-overlay-panel.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const st = document.createElement('style');
        st.id = 'probe-hit';
        st.textContent = '#fx-layer, #fx-layer *, #boss-warning, #boss-warning * { pointer-events: auto !important; }';
        document.head.appendChild(st);
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
    });

    // 패널 사각형(또는 임의 rect) 안 96점의 최상위 페인트 요소 분류
    const hitScan = sel => page.evaluate(s => {
        const box = document.querySelector(s);
        if (!box) return { err: s + ' 없음' };
        const c = box.getBoundingClientRect();
        let fx = 0, bw = 0, other = 0, sample = '';
        for (let iy = 0; iy < 12; iy++) for (let ix = 0; ix < 8; ix++) {
            const x = c.left + c.width * (0.02 + 0.96 * ix / 7), y = c.top + c.height * (0.02 + 0.96 * iy / 11);
            const el = document.elementFromPoint(x, y);
            if (!el) { other++; continue; }
            if (el.closest('#boss-warning')) { bw++; if (!sample) sample = 'boss-warning'; }
            else if (el.closest('#fx-layer')) { fx++; if (!sample) sample = 'fx-layer(' + (el.textContent || '').slice(0, 10) + ')'; }
            else other++;
        }
        return { fx, bw, other, sample };
    }, sel);

    // ① 기술트리 패널 열람 중 사망 암전 + 보스 경고
    await page.evaluate(() => {
        UI.switchTab('summon');
        UI.switchSummonSub('tech');
        Scene3D.deathFade('회복 후 다시 도전합니다');
        UI.bossWarning(2.5);
    });
    await page.waitForTimeout(1800); // 암전 delay 900 + fadeIn 700 지나 완전 불투명 구간
    const onPanel = await hitScan('#panel-summon');
    ok(!onPanel.err, '패널 스캔: ' + onPanel.err);
    if (!onPanel.err) {
        ok(onPanel.fx === 0, `사망 암전이 패널을 덮음 — 96점 중 ${onPanel.fx}점 (${onPanel.sample})`);
        ok(onPanel.bw === 0, `보스 경고가 패널을 덮음 — 96점 중 ${onPanel.bw}점 (${onPanel.sample})`);
    }
    console.log(`① 패널 위 히트: fx-layer ${onPanel.fx} · boss-warning ${onPanel.bw} · 패널/기타 ${onPanel.other}`);

    // ② 패널을 닫으면 같은 연출이 씬 HUD(#skill-bar)를 여전히 덮는다 — 내부 서열 회귀 방지
    await page.evaluate(() => {
        UI.switchTab(null);
        Scene3D.deathFade('회복 후 다시 도전합니다');
        UI.bossWarning(2.5);
    });
    await page.waitForTimeout(1800);
    const onHud = await hitScan('#skill-bar');
    ok(!onHud.err, 'HUD 스캔: ' + onHud.err);
    if (!onHud.err) ok(onHud.fx + onHud.bw > 48, `패널이 없을 때 연출이 씬 HUD 를 안 덮음(내부 서열 붕괴?) — 96점 중 ${onHud.fx + onHud.bw}점`);
    console.log(`② 패널 없음 · HUD 위 히트: 연출 ${onHud.fx + onHud.bw} / 96`);

    // ③ 팝업 카드 위 서열(간이) — 던전 팝업 카드 위에 보스 경고가 안 뜬다
    await page.evaluate(() => {
        S.dungeonKeys = { hammer: 9, ghost: 9, invasion: 9, zombie: 9 };
        UI.openDungeons();
        UI.bossWarning(2.5);
    });
    await page.waitForTimeout(300);
    const onCard = await hitScan('.modal:not(.hidden) .modal-card');
    ok(!onCard.err, '카드 스캔: ' + onCard.err);
    if (!onCard.err) ok(onCard.bw === 0 && onCard.fx === 0, `팝업 카드 위로 연출 침범 — bw ${onCard.bw} · fx ${onCard.fx}`);
    console.log(`③ 팝업 카드 위 히트: 연출 ${onCard.bw + onCard.fx} / 96`);

    for (const f of fails) console.log('FAIL —', f);
    for (const e of errs.slice(0, 5)) console.log('콘솔 에러 —', e);
    console.log(fails.length || errs.length ? `실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건` : 'PASS — 연출이 패널 아래·씬 HUD 위·팝업 아래 (isolation:isolate)');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
