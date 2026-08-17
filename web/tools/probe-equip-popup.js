// "장착하면 팝업이 꺼진다 / 투명해졌다 다시 뜬다" 재현·검증 도구.
//
// 두 경로를 본다:
//   ① 장비 상세·보관함(openGearDetail)에서 보관 장비 [장착](onEquipStored)
//      → 팝업이 닫히면 안 되고, 열림 애니메이션(cardpop)이 다시 돌아도 안 된다.
//   ② 제작 비교 팝업에서 [장착](resolveCraft('equip'))
//      → 닫히는 것 자체는 정상. 닫히기 전에 cardpop이 다시 도는 깜빡임만 잡는다.
//
// 판정을 '프레임 샘플링'으로 하면 안 된다: 헤드리스에서는 페이지가 쉬는 동안 타이머·CSS
// 애니메이션이 스로틀링돼 900ms에 두어 번밖에 안 잡히고, 직전 열림 애니메이션의 잔상이
// 클릭 탓으로 잘못 찍힌다(실측으로 확인). 대신 **이벤트**로 본다:
//   - animationstart 를 캡처해 클릭 이후 cardpop 이 새로 시작됐는지 (= 깜빡임)
//   - MutationObserver 로 모달 class 변화를 받아 hidden 이 붙었는지 (= 꺼짐)
// 둘 다 샘플링 간격과 무관하게 정확하다.
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBooted(page);
    await page.waitForTimeout(600);

    // 무기 보관함을 채우고 상세 팝업을 연다. 제작은 부위가 무작위라 만든 것을 무기로 고정해 넣는다.
    const setup = await page.evaluate(() => {
        Combat.tick = function () {};
        S.hammers = 300;
        for (let i = 0; i < 40 && Forge.inventoryOf('weapon').length < 5; i++) {
            const it = Forge.craft(1)[0];
            if (!it) break;
            it.slot = 'weapon';
            Forge.store(it);
        }
        if (!S.equipment.weapon) Forge.equip(Forge.inventoryOf('weapon').pop());
        UI.openGearDetail('weapon');
        return { stored: Forge.inventoryOf('weapon').length };
    });
    // 최초 열림 애니메이션(.opening 0.3초)이 완전히 끝난 뒤에 관찰을 시작한다
    await page.waitForTimeout(900);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    const watch = async (modalId, act, ms) => page.evaluate(async ({ modalId, act, ms }) => {
        const el = document.getElementById(modalId);
        const ev = { anims: [], classes: [], hiddenSeen: false };
        const onAnim = (e) => {
            if (e.target.classList && e.target.classList.contains('modal-card')) ev.anims.push(e.animationName);
        };
        el.addEventListener('animationstart', onAnim, true);
        const mo = new MutationObserver(() => {
            ev.classes.push(el.className);
            if (el.classList.contains('hidden')) ev.hiddenSeen = true;
        });
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });

        const t0 = performance.now();
        (new Function('return ' + act))()();
        ev.syncMs = +(performance.now() - t0).toFixed(1);
        await new Promise(r => setTimeout(r, ms));
        // 관찰이 끝난 시점의 최종 상태
        const card = el.querySelector('.modal-card');
        const cs = card && getComputedStyle(card);
        ev.endHidden = el.classList.contains('hidden');
        ev.endOpacity = cs ? +parseFloat(cs.opacity).toFixed(3) : null;
        ev.endAnim = cs ? cs.animationName : null;
        el.removeEventListener('animationstart', onAnim, true);
        mo.disconnect();
        return ev;
    }, { modalId, act, ms });

    console.log(`준비: 무기 보관함 ${setup.stored}개`);

    // ① 보관함에서 [장착]
    const a = await watch('gear-detail-modal', "() => UI.onEquipStored('weapon', 0)", 800);
    const ok1 = !a.endHidden && !a.hiddenSeen && !a.anims.includes('cardpop') && a.endOpacity === 1;
    console.log(`\n① 보관함 [장착] — ${ok1 ? 'OK' : 'FAIL'}`);
    console.log(`   클릭 동기 처리 ${a.syncMs}ms / 재생된 카드 애니메이션 [${a.anims.join(', ') || '없음'}]`);
    console.log(`   도중 hidden 붙음=${a.hiddenSeen} / 끝에 닫힘=${a.endHidden} / 최종 opacity=${a.endOpacity}`);
    console.log(`   class 변화: ${a.classes.length ? a.classes.join(' → ') : '없음'}`);

    // ② 제작 비교 팝업에서 [장착]
    await page.evaluate(() => { UI.closeGearDetail(); S.hammers = 300; });
    await page.waitForTimeout(300);
    const opened = await page.evaluate(async () => {
        for (let i = 0; i < 12; i++) {
            UI.onCraft();
            await new Promise(r => setTimeout(r, 950));  // 모루 타격 연출(0.72초) 뒤에 팝업이 뜬다
            if (!document.getElementById('craft-modal').classList.contains('hidden')) return true;
        }
        return false;
    });
    await page.waitForTimeout(500);
    let ok2 = false, b = null;
    if (!opened) console.log('\n② 제작 비교 팝업이 뜨지 않아 측정 불가');
    else {
        b = await watch('craft-modal', "() => UI.resolveCraft('equip')", 600);
        // 닫히는 건 정상 — cardpop 재생만 깜빡임으로 본다
        ok2 = !b.anims.includes('cardpop');
        console.log(`\n② 제작 비교 [장착] — ${ok2 ? 'OK' : 'FAIL'} (닫히는 것 자체는 정상)`);
        console.log(`   재생된 카드 애니메이션 [${b.anims.join(', ') || '없음'}] / 끝에 닫힘=${b.endHidden}`);
    }

    // ③ 탈것 상세에서 [장착] — 같은 '팝업이 열린 채로 아래 시트를 다시 그리는' 구조라 함께 본다
    //    (onEquipMount가 openMounts()로 시트를 통째 다시 그린 뒤 openMountDetail()로 상세를 다시 그린다)
    await page.evaluate(() => {
        UI.closeOpened && UI.closeOpened();
        S.mounts = { Horse: { rarity: 'common', level: 1, count: 1, subs: [] } };
        S.activeMount = null;
        UI.openMounts();
        UI.openMountDetail('Horse');
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const c = await watch('detail-modal', "() => { UI.onEquipMount('Horse'); UI.openMountDetail('Horse'); }", 800);
    const ok3 = !c.endHidden && !c.hiddenSeen && !c.anims.includes('cardpop') && c.endOpacity === 1;
    console.log(`\n③ 탈것 상세 [장착] — ${ok3 ? 'OK' : 'FAIL'}`);
    console.log(`   재생된 카드 애니메이션 [${c.anims.join(', ') || '없음'}] / 도중 hidden=${c.hiddenSeen} / 끝에 닫힘=${c.endHidden} / opacity=${c.endOpacity}`);

    // ④ 보관함 목록을 스크롤한 상태에서 재장착 — 목록이 맨 위로 튀면 사용자에겐 '팝업이 사라졌다'로 읽힌다.
    //    installScrollKeeper()는 render* 만 감싸므로, 재렌더를 openGearDetail(=open*)로 하면 매번 튄다.
    const scroll = await page.evaluate(() => {
        UI.closeOpened && UI.closeOpened();
        S.inventory.weapon = [];
        for (let i = 0; i < 10; i++) { const it = Forge.rollItem(); it.slot = 'weapon'; Forge.store(it); }
        if (!S.equipment.weapon) { const it = Forge.rollItem(); it.slot = 'weapon'; Forge.equip(it); }
        UI.openGearDetail('weapon');
        const list = document.querySelector('#gear-detail-modal .inv-list');
        const scrollable = list.scrollHeight > list.clientHeight;
        list.scrollTop = 60;
        const set = list.scrollTop;
        document.querySelectorAll('#gear-detail-modal .inv-row .btn.equip')[4].click();
        const after = document.querySelector('#gear-detail-modal .inv-list');
        return { scrollable, set, after: after ? after.scrollTop : null };
    });
    const ok4 = scroll.scrollable && scroll.after === scroll.set;
    console.log(`\n④ 보관함 스크롤 보존 — ${ok4 ? 'OK' : 'FAIL'}`);
    console.log(`   목록 스크롤 가능=${scroll.scrollable} / 재장착 전 ${scroll.set} → 후 ${scroll.after}`);

    const fail = (ok1 ? 0 : 1) + (ok2 ? 0 : 1) + (ok3 ? 0 : 1) + (ok4 ? 0 : 1);
    console.log(`\n실패 ${fail}건 / 콘솔 에러 ${errs.length}건`);
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
