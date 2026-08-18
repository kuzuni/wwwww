// 전투 연출이 **전투 씬 밖으로 안 나가고, 팝업 위로 안 뜨는지** 실측 (`combat-fx-below-popups`,
// 사용자 지시 2026-08-18: "피격당해서 화면 빨개지는 거 / 몇 스테이지로 돌아간다는 알림 /
// 보스 연출 … 다른 팝업들 위로 뜨면 안 됨 + 빨간 플래시는 전투씬 화면에서만").
//
// DOM 위치나 z-index 만 읽으면 거짓 통과가 난다(부모가 스택 문맥을 만드는지, overflow 가
// 실제로 자르는지가 값에 안 드러난다). 그래서 **화면 픽셀**로 판정한다:
//   ㉡·㉢ 범위 — 연출을 켜기 전/후를 캡처해 **전투 씬 밖(장비 시트·탭바 띠)의 화소가 한 바이트도
//        안 바뀌는지** 본다. 씬 안은 반대로 **바뀌어야** 한다(연출이 죽으면 그것도 회귀다).
//   ㉠ 서열 — 팝업을 띄운 채 팝업 카드 한가운데 좌표에서 elementFromPoint 로 **카드가 여전히
//        맨 위인지** 본다(연출 레이어가 잡히면 실패). 토스트도 같은 방법으로 두 레인을 갈라 본다.
// 사용: node probe-combat-fx-scope.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

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
    // '켜기 전/후' 두 캡처가 연출 말고도 달라지면 그 변화를 연출 탓으로 오인한다 — 움직이는 걸
    // 전부 멈춰 세운다. 🚨 3D·전투만 멈추면 부족하다: **1초 틱(UI.tickSecond)의 웨이포인트 타이머
    // 글자와 Chat.tick 의 채팅 미리보기가 씬 밖에서 바뀌어** 보스 경고가 장비 시트를 47화소
    // 침범한 것처럼 찍혔다(실제로 한 번 오탐이 났다). 씬 밖은 0 을 요구하는 판정이라 치명적이다.
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        UI.tickSecond = function () {};
        if (typeof Chat !== 'undefined') Chat.tick = function () { return false; };
        S.autoForgeOn = false;
    });
    await page.waitForTimeout(300);

    // ---- 부모가 정말 전투 씬인가 (범위의 전제) ----
    const parents = await page.evaluate(() => {
        const inScene = id => {
            const el = document.getElementById(id);
            return { found: !!el, inGameArea: !!(el && el.closest('#game-area')) };
        };
        return { dmg: inScene('dmg-flash'), boss: inScene('boss-warning'), lane: inScene('toasts-combat') };
    });
    ok(parents.dmg.found && parents.dmg.inGameArea, '#dmg-flash 가 #game-area 안에 없다');
    ok(parents.boss.found && parents.boss.inGameArea, '#boss-warning 이 #game-area 안에 없다');
    ok(parents.lane.found, '#toasts-combat 레인이 없다');

    const shot = async () => (await page.screenshot()).toString('base64');
    // 두 캡처를 비교해 '전투 씬 안'과 '씬 밖'에서 각각 바뀐 화소 수를 센다
    const diff = async (a, b) => page.evaluate(async ([x, y]) => {
        const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src; });
        const [ia, ib] = await Promise.all([load(x), load(y)]);
        const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(ia, 0, 0); const A = cx.getImageData(0, 0, cv.width, cv.height).data;
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(ib, 0, 0); const B = cx.getImageData(0, 0, cv.width, cv.height).data;
        const ga = document.getElementById('game-area').getBoundingClientRect();
        const dpr = cv.width / window.innerWidth;
        const bottom = Math.round(ga.bottom * dpr);
        let inside = 0, outside = 0, maxOut = 0;
        for (let py = 0; py < cv.height; py++) {
            for (let px = 0; px < cv.width; px += 2) {
                const i = (py * cv.width + px) * 4;
                const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
                if (d <= 2) continue;                     // 캡처 노이즈 여유
                if (py < bottom) inside++;
                else { outside++; if (d > maxOut) maxOut = d; }
            }
        }
        return { inside, outside, maxOut, bottom };
    }, [a, b]);

    // ---- 노이즈 바닥 — 아무것도 안 켜고 같은 간격으로 두 번 찍어 '가만히 뒀을 때의 변화'를 잰다 ----
    // 🚨 이걸 안 재고 '씬 밖 == 0' 을 요구하면 오탐이 난다. 로드 직후에는 채팅 미리보기 첫 메시지·
    // 웨이포인트 라벨 같은 게 늦게 자리를 잡아 씬 밖이 수십 화소 바뀐다(실제로 47화소 오탐이 났고,
    // 격리해서 4회 재보면 0 이었다). 그래서 ⑴ 충분히 재우고 ⑵ 판정을 **바닥 대비**로 한다.
    await page.waitForTimeout(1200);                     // 늦게 자리 잡는 것들이 끝나도록
    const ctl0 = await shot();
    await page.waitForTimeout(300);
    const ctlD = await diff(ctl0, await shot());
    ok(ctlD.outside <= 2000, `가만히 뒀는데도 전투 씬 밖이 ${ctlD.outside}화소 바뀐다 — 정지가 크게 새서 판정 불가`);
    console.log(`  노이즈 바닥  씬 안 ${ctlD.inside} · 씬 밖 ${ctlD.outside}`);

    // ---- ㉡ 피격 비네트가 전투 씬 밖을 안 건드리는가 ----
    const before = await shot();
    await page.evaluate(() => UI.flashDamage(0.9));
    await page.waitForTimeout(40);                       // 키프레임 정점(3~10%)
    const dmgOn = await shot();
    const dmgD = await diff(before, dmgOn);
    // 씬 안에는 노이즈가 있다(웨이포인트 펄스 등 CSS 애니메이션) — 그 바닥의 1.5배를 넘어야
    // '연출이 실제로 보였다'로 친다. 안 그러면 연출을 통째로 지워도 노이즈만으로 통과한다.
    const liveFloor = Math.max(500, Math.round(ctlD.inside * 1.5));
    ok(dmgD.inside > liveFloor, `피격 비네트가 전투 씬 안에서도 안 보인다 (바뀐 화소 ${dmgD.inside} ≤ 노이즈 바닥 ${liveFloor}) — 연출이 죽었다`);
    // 진짜 침범이면 씬 안과 같은 자릿수(수만)로 샌다 — 바닥 대비로 봐도 놓치지 않는다
    ok(dmgD.outside <= ctlD.outside, `피격 비네트가 전투 씬 **밖**을 ${dmgD.outside}화소 물들였다 (노이즈 바닥 ${ctlD.outside}, 최대 차 ${dmgD.maxOut}) — 장비 시트·탭바 침범`);
    console.log(`  피격 비네트  씬 안 ${dmgD.inside} 화소 변화 · 씬 밖 ${dmgD.outside} (씬 하단 y=${dmgD.bottom})`);

    await page.waitForTimeout(700);                      // 비네트가 완전히 꺼질 때까지

    // ---- ㉢ 보스 경고가 전투 씬 밖을 안 덮는가 ----
    const before2 = await shot();
    await page.evaluate(() => UI.bossWarning(2));
    await page.waitForTimeout(260);
    const bossOn = await shot();
    const bossD = await diff(before2, bossOn);
    ok(bossD.inside > liveFloor, `보스 경고가 전투 씬 안에서도 안 보인다 (바뀐 화소 ${bossD.inside} ≤ 노이즈 바닥 ${liveFloor}) — 연출이 죽었다`);
    ok(bossD.outside <= ctlD.outside, `보스 경고가 전투 씬 **밖**을 ${bossD.outside}화소 덮었다 (노이즈 바닥 ${ctlD.outside}, 최대 차 ${bossD.maxOut}) — 장비 시트·탭바 침범`);
    console.log(`  보스 경고    씬 안 ${bossD.inside} 화소 변화 · 씬 밖 ${bossD.outside}`);
    await page.evaluate(() => { document.getElementById('boss-warning').classList.add('hidden'); });
    await page.waitForTimeout(200);

    // ---- ㉠ 팝업이 떠 있으면 연출은 전부 그 아래 ----
    const order = await page.evaluate(async () => {
        UI.openProfile();
        await new Promise(r => setTimeout(r, 250));
        UI.flashDamage(0.9); UI.bossWarning(2);
        UI.toast('일반 토스트', undefined);
        UI.toast('💀 한 스테이지 후퇴!', 'combat');
        await new Promise(r => setTimeout(r, 120));
        const card = document.querySelector('.modal:not(.hidden) .modal-card');
        const cr = card.getBoundingClientRect();
        const top = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        const zOf = id => getComputedStyle(document.getElementById(id)).zIndex;
        return {
            topIsCard: !!(top && top.closest('.modal-card')),
            topWas: top ? (top.id || top.className) : null,
            dmgZ: zOf('dmg-flash'), bossZ: zOf('boss-warning'),
            laneZ: zOf('toasts-combat'), normalZ: zOf('toasts'),
        };
    });
    ok(order.topIsCard, `팝업 카드 위에 연출이 얹혔다 — 맨 위 요소가 "${order.topWas}"`);
    ok(Number(order.dmgZ) < 20, `팝업이 떠 있는데 #dmg-flash z=${order.dmgZ} (모달 20 아래여야)`);
    ok(Number(order.bossZ) < 20, `팝업이 떠 있는데 #boss-warning z=${order.bossZ} (모달 20 아래여야)`);
    ok(Number(order.laneZ) < 20, `팝업이 떠 있는데 전투 토스트 레인 z=${order.laneZ} (모달 20 아래여야)`);
    ok(Number(order.normalZ) > 20, `일반 토스트 레인이 z=${order.normalZ} 로 같이 내려갔다 — 팝업에서 누른 버튼의 응답까지 가려진다`);
    console.log(`  팝업 위 서열  카드가 맨 위=${order.topIsCard} · dmg ${order.dmgZ} · boss ${order.bossZ} · 전투레인 ${order.laneZ} · 일반레인 ${order.normalZ}`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
