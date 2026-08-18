// 사망 암전·피격 빨강이 팝업을 침범하지 않는지 실측 — 사용: node probe-death-overlay-zorder.js
// 사용자 재지적 2026-08-19 (`death-overlay-zorder`): "죽었습니다 검은 화면이랑 처맞아서 빨간 화면
// 되는 게 여전히 다른 팝업보다 위 레이어여서 다른 팝업들을 침범. 해결."
//
// 왜 z 숫자만 보면 안 되는가: z-index 서열은 **같은 스태킹 컨텍스트 안에서만** 의미가 있다.
// `#dmg-flash`(z 12)와 사망 커버(z 15)는 `#game-area > #fx-layer` 안에 있는데, 그 둘이 스태킹
// 컨텍스트를 만들지 않기 때문에 `#app` 안에서 팝업(.modal 20+)과 직접 겨룬다. 이 전제가 깨지면
// (누가 `#game-area` 에 transform/opacity/isolation 을 넣으면) 숫자가 그대로여도 서열이 뒤집힌다.
// 그래서 ① 전제 자체를 검사하고 ② 숫자를 비교하고 ③ **픽셀로 확인**한다.
//
// 판정: ① `#game-area`·`#fx-layer` 가 스태킹 컨텍스트를 안 만든다(z auto · transform/filter/
//          opacity/isolation/will-change 없음) — z 비교의 전제
//       ② 팝업이 떠 있을 때 사망 커버·피격 비네트의 z 가 그 팝업 z 보다 **낮다**
//       ③ ⚠️ 조건부 강등(`:has()`)에 기대지 않는다 — 팝업이 **없을 때도** 두 연출의 z 가
//          팝업 최소 z(.modal = 20) 미만이다. (`:has()` 미지원 엔진·비-.modal 팝업 대비)
//       ④ 픽셀: 팝업을 띄운 채 사망 암전을 **정점(불투명)** 에 세워도 팝업 카드 영역의
//          스크린샷이 커버 없는 상태와 **바이트 단위로 동일**하다 (= 한 픽셀도 안 덮는다)
//       ⑤ 콘솔 에러 0건 — 단, 카드 박스 안에 '비치는 여백'이 섞인 팝업은 ④를 건너뛴다(아래 참조)
//
// ⚠️ 픽셀 비교 함정 (2026-08-19 실측으로 밟았다): **팝업 자신이 움직이면** 두 캡처가 당연히
//    달라져 '연출이 덮었다'로 오진한다 — 소환 결과창(빛가루·광선·아이들 애니), 대장간 정보,
//    퀘스트 게이지가 실제로 그랬다(z 는 15/12 로 멀쩡한데 픽셀만 변함). 그래서 캡처 전에
//    `document.getAnimations()` 를 전부 pause 로 얼리고, **얼린 상태에서 같은 캡처를 두 번 떠
//    서로 같은지(STABLE) 먼저 확인**한 뒤에야 비교값으로 쓴다. 안 얼리면 이 판정은 무의미하다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999; S.coins = 9e9;`;
// 3D 루프를 멈춰야 swiftshader 에서 스크린샷이 0.2초에 끝난다. 픽셀 비교에도 유리하다 —
// 렌더가 돌면 두 캡처 사이에 씬이 움직여 '커버 때문에 달라진 것'과 구분이 안 된다.
const FREEZE_3D = `Scene3D.update = function () {}; Scene3D.renderFrame = function () {};`;

// 팝업 한 벌 — id 와 여는 법. 서로 다른 z 대역(20 / 22 / 40 / 60)을 골고루 덮는다.
const POPUPS = [
    ['mount-modal', `UI.openMounts()`],
    ['forge-info-modal', `UI.openForgeInfo()`],
    ['quest-modal', `UI.openQuests()`],
    ['shop-modal', `UI.openShop()`],
    ['dungeon-modal', `UI.openDungeons()`],
    ['chat-modal', `UI.openChat()`],
    ['summon-result-modal', `S.summonMult = {skill:5}; UI.switchSummonSub('skills'); UI.onSummon(false)`],
];

// 사망 커버를 '완전 불투명' 정점에 세운다(애니메이션을 그 시각으로 시크 후 정지).
const PIN_DEATH = `(() => {
    Scene3D.deathFade('프로브');
    const cover = Scene3D.fxLayer.lastElementChild;
    const T = Scene3D.DEATH_FADE, at = T.delay + T.fadeIn + T.hold * 0.5;
    const seek = el => { for (const a of el.getAnimations()) { a.currentTime = at; a.pause(); } };
    seek(cover); for (const c of cover.children) seek(c);
    return getComputedStyle(cover).zIndex;
})()`;
// 피격 비네트도 정점에 세운다
const PIN_FLASH = `(() => {
    UI.flashDamage(1);
    const f = document.getElementById('dmg-flash');
    for (const a of f.getAnimations()) { a.currentTime = 60; a.pause(); }
    return getComputedStyle(f).zIndex;
})()`;
// 걸려 있는 **모든 타이머**를 끊는다. 애니메이션만 얼려서는 안 멈추는 팝업이 있다 — 내용을
// setInterval/setTimeout 으로 다시 그리는 쪽(망치 수·업그레이드 타이머·퀘스트 게이지·상점
// 카운트다운·챗봇·전투 틱). 이 뒤에 만들어지는 타이머는 영향을 안 받으므로, **팝업을 연 직후
// 한 번** 부르고 그 다음에 연출을 세운다. 페이지 전체가 정지하므로 팝업마다 새 페이지를 쓴다.
const KILL_TIMERS = `(() => {
    const top = setTimeout(() => {}, 0);
    for (let i = 1; i <= top; i++) { clearTimeout(i); clearInterval(i); }
    return top;
})()`;
// **비침(see-through) 판별** — 팝업 카드의 바운딩 박스 안에는 카드가 안 칠하는 자리가 섞여 있다
// (딤만 깔린 여백, 카드 밖으로 삐져나온 닫기 버튼 둘레 등). 그런 자리는 뒤가 어두워지면 같이
// 어두워지는 게 **정상**이지 '덮인' 게 아니다. 그래서 연출과 무관하게 **씬만 검게** 만들어 보고,
// 그것만으로 클립 안 픽셀이 바뀌면 그 팝업은 픽셀 판정 대상에서 뺀다(z 비교로만 본다).
// ⚠️ 이 판별이 없으면 z 가 멀쩡한 팝업을 '덮고 있다'로 오진한다 — 2026-08-19 forge-info-modal 이
//    딱 그랬다(카드 본문은 픽셀 단위로 같고, 카드 아래 딤 구간만 같이 어두워졌다).
const DARKEN_SCENE = `(() => {
    document.getElementById('game3d').style.visibility = 'hidden';
    document.getElementById('game-area').style.background = '#05070c';
})()`;
const UNDARKEN_SCENE = `(() => {
    document.getElementById('game3d').style.visibility = '';
    document.getElementById('game-area').style.background = '';
})()`;
// 팝업 자신의 애니메이션을 전부 정지 — 픽셀 비교의 전제(위 ⚠️)
const FREEZE_ANIM = `(() => {
    let n = 0;
    for (const a of document.getAnimations()) { try { a.pause(); n++; } catch (e) {} }
    return n;
})()`;
const CLEAR_FX = `(() => {
    document.querySelectorAll('#fx-layer > *').forEach(e => e.remove());
    const f = document.getElementById('dmg-flash');
    f.classList.remove('on'); f.style.opacity = '';
    for (const a of f.getAnimations()) a.cancel();
})()`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    // ⚠️ 팝업마다 **새 페이지**다 — 아래 KILL_TIMERS 가 페이지 전체를 정지시키므로 한 페이지를
    //    돌려 쓰면 두 번째 팝업부터 제대로 안 열린다.
    const newPage = async (tag) => {
        const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
        page.on('pageerror', e => errors.push(`${tag} ${e}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} ${m.text()}`); });
        await page.goto(INDEX);
        for (let w = 0; ; w++) {
            const ready = await page.evaluate('typeof UI !== "undefined" && !!UI.els').catch(() => false);
            if (ready) break;
            if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
            await new Promise(r => setTimeout(r, 500));
        }
        await page.evaluate(SEED);
        await page.evaluate(FREEZE_3D);
        await page.waitForTimeout(200);
        return page;
    };
    const page = await newPage('base');

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };

    // ---------- ① z 비교의 전제: 중간 컨테이너가 스태킹 컨텍스트를 안 만든다 ----------
    const ctx = await page.evaluate(`(() => {
        const check = id => {
            const s = getComputedStyle(document.getElementById(id));
            return { id, z: s.zIndex, transform: s.transform, filter: s.filter, opacity: s.opacity,
                     isolation: s.isolation, willChange: s.willChange, mixBlend: s.mixBlendMode };
        };
        return ['game-area', 'fx-layer'].map(check);
    })()`);
    for (const c of ctx) {
        const clean = c.z === 'auto' && c.transform === 'none' && c.filter === 'none'
            && c.opacity === '1' && c.isolation === 'auto' && c.mixBlend === 'normal'
            && (c.willChange === 'auto' || c.willChange === '');
        ok(clean, `#${c.id} 가 스태킹 컨텍스트를 만든다 — 연출 z 가 팝업과 겨루지 못한다: ${JSON.stringify(c)}`);
    }

    // ---------- ③ 팝업이 없을 때도 두 연출이 팝업 대역(20) 아래 ----------
    const bare = { cover: await page.evaluate(PIN_DEATH), flash: await page.evaluate(PIN_FLASH) };
    ok(+bare.cover < 20, `팝업이 없을 때 사망 커버 z=${bare.cover} — 20(.modal) 이상이면 조건부 강등에 의존하는 것`);
    ok(+bare.flash < 20, `팝업이 없을 때 피격 비네트 z=${bare.flash} — 20(.modal) 이상이면 조건부 강등에 의존하는 것`);
    await page.evaluate(CLEAR_FX);
    await page.close();

    // ---------- ②④ 팝업별 ----------
    const rows = [], skipped = [];
    for (const [id, open] of POPUPS) {
        const page = await newPage(id);
        await page.evaluate(open).catch(e => errors.push(`${id} open: ${e}`));
        await page.waitForTimeout(id === 'summon-result-modal' ? 2600 : 400);
        const info = await page.evaluate(`(() => {
            const m = document.getElementById(${JSON.stringify(id)});
            if (!m || m.classList.contains('hidden')) return null;
            const card = m.querySelector('.modal-card, .sr-wrap') || m;
            const r = card.getBoundingClientRect();
            return { z: getComputedStyle(m).zIndex,
                     clip: { x: Math.round(r.x + 4), y: Math.round(r.y + 4),
                             width: Math.max(8, Math.round(r.width - 8)), height: Math.max(8, Math.round(r.height - 8)) } };
        })()`);
        if (!ok(info, `${id} 이 안 열렸다 — 이 팝업은 검사 못 함`)) { await page.close(); continue; }

        // 팝업 자신의 움직임을 얼리고(타이머·애니메이션 둘 다), 얼렸는지 두 번 캡처로 확인한다(위 ⚠️ 함정)
        await page.evaluate(KILL_TIMERS);
        await page.evaluate(FREEZE_ANIM);
        const before = await page.screenshot({ clip: info.clip });
        const before2 = await page.screenshot({ clip: info.clip });
        const stable = before.equals(before2);
        // 씬만 어둡게 해서 '비치는 자리'가 있는지 본다 — 있으면 픽셀 판정 불가
        await page.evaluate(DARKEN_SCENE);
        const darkened = await page.screenshot({ clip: info.clip });
        await page.evaluate(UNDARKEN_SCENE);
        const seeThrough = !darkened.equals(before);
        // ⚠️ 애니메이션을 얼려도 안 멈추는 팝업이 있다 — 내용을 **JS 타이머로 다시 그리는** 쪽
        //    (대장간 정보의 망치 수·업그레이드 타이머, 퀘스트 게이지, 상점 카운트다운). 이건
        //    연출과 무관하므로 **FAIL 이 아니라 '픽셀 판정 불가'로 건너뛴다** — 이 팝업들의
        //    보호는 위 z 비교(②)가 계속 맡는다. 건너뛴 사실은 아래 표에 그대로 찍는다(묵음 금지).
        // 사망 암전 + 피격 비네트를 둘 다 정점에 세운다
        const coverZ = await page.evaluate(PIN_DEATH);
        const flashZ = await page.evaluate(PIN_FLASH);
        const after = await page.screenshot({ clip: info.clip });
        // 되돌림 확인: 연출을 걷어내면 원래 그림으로 **정확히** 돌아와야 한다. 안 돌아오면 그 변화는
        // 연출이 아니라 팝업 자신의 표류(rAF 로 다시 그리는 게이지·타이머 — KILL_TIMERS 로도 못 잡는다)다.
        // 이 구분이 없으면 z 는 멀쩡한데 '덮고 있다'로 오진한다(2026-08-19 forge-info-modal 에서 실제로 났다).
        await page.evaluate(CLEAR_FX);
        const restored = await page.screenshot({ clip: info.clip });
        const drift = !restored.equals(before);
        await page.close();

        ok(+coverZ < +info.z, `[${id}] 사망 커버 z=${coverZ} 가 팝업 z=${info.z} 이상 — 팝업을 덮는다`);
        ok(+flashZ < +info.z, `[${id}] 피격 비네트 z=${flashZ} 가 팝업 z=${info.z} 이상 — 팝업을 덮는다`);
        const same = before.equals(after);
        const judgeable = stable && !drift && !seeThrough;
        if (!judgeable) skipped.push(id + (seeThrough ? '(카드 박스에 비치는 여백 포함)' : drift ? '(rAF 표류)' : '(자체애니)'));
        if (judgeable) ok(same, `[${id}] 연출을 정점에 세우자 팝업 카드 픽셀이 바뀌었다 — 실제로 덮고 있다`);
        rows.push({ id, z: info.z, coverZ, flashZ, px: !judgeable ? '판정불가' : (same ? '동일' : '변함') });
    }

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    const judged = rows.filter(r => r.px !== '판정불가(자체애니)');
    ok(judged.length >= 5, `픽셀로 판정된 팝업이 ${judged.length}개뿐 — 최소 5개(서로 다른 z 대역)는 필요`);
    ok(new Set(judged.map(r => r.z)).size >= 2, `픽셀 판정이 한 z 대역에만 몰렸다 — ${judged.map(r => r.z).join(',')}`);

    console.log(`팝업 없을 때: 사망커버 z=${bare.cover} · 피격 z=${bare.flash} (둘 다 20 미만이어야 조건부 강등에 안 기댄다)`);
    for (const r of rows) console.log(`${r.id.padEnd(22)} 팝업 z=${String(r.z).padStart(3)} · 사망커버 ${r.coverZ} · 피격 ${r.flashZ} · 카드 픽셀 ${r.px}`);
    if (fail.length) { console.log('\nFAIL ' + fail.length + '건:'); fail.forEach(f => console.log(' ✗ ' + f)); }
    if (skipped.length) console.log(`픽셀 판정 건너뜀(괄호=사유): ${skipped.join(', ')} — 이 팝업들은 z 비교로만 검증됨`);
    if (fail.length) { /* 위에서 이미 출력 */ }
    else console.log('\nPASS — 사망 암전·피격 비네트가 모든 팝업 아래, 판정 가능한 카드 픽셀 무침범');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
