// `sell-warn-samerank` 재현 조사 (2026-08-18) — 합성 케이스가 아니라 **실게임 제작 루프**로 돈다.
// 목적 둘:
//  ⓐ 로직 버그 재현 — 비교 팝업이 보여준 '장착됨' 카드와 경고가 실제로 비교한 장비가 어긋나는가
//     (팝업이 뜬 뒤 장비가 바뀌면 사용자는 화면에 없는 장비와 비교당한 셈이 된다)
//  ⓑ 인지 차이 계측 — 경고가 뜬 순간 **화면에 등급이 보이는가**. 비교 카드는 `[시대] 이름`과 스탯만
//     쓰고 카드 색은 시대색이라, 등급이 어디에도 없으면 사용자 눈엔 '같은 등급인데 경고'가 된다.
// 사용: node probe-sell-warning-repro.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const ROUNDS = 60;

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
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.hammers = 1e6; S.forgeLevel = 60; S.autoForgeOn = false;
        UI.playAnvilStrike = function (done) { done(); };   // 연출 대기 없이 결과 팝업까지
    });

    const rows = [];
    for (let i = 0; i < ROUNDS; i++) {
        const r = await page.evaluate(() => {
            UI.closeDetail();
            UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
            const it = Forge.craft(1)[0];
            if (!it) return null;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            // 사용자가 보는 것: 비교 팝업의 두 카드 텍스트 + 카드 테두리색
            const cards = [...document.querySelectorAll('#craft-modal .cmp-card-wrap')].map(w => {
                const c = w.querySelector('.cmp-card');
                const nm = w.querySelector('.cmp-name');
                return {
                    text: (w.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
                    border: c ? getComputedStyle(c).borderTopColor : '',
                    nameColor: nm ? getComputedStyle(nm).color : '',
                };
            });
            const shownKept = S.equipment[it.slot];          // 팝업이 '장착됨'으로 그린 것
            const warn = UI.sellWarning('sell');              // 경고 판정이 비교한 것
            // 경고 팝업을 실제로 띄워서 **사용자가 그 창에서 등급을 견줄 수 있는지** 본다
            let warnPopup = null;
            if (warn) {
                UI.resolveCraft('sell');
                const m = document.getElementById('detail-modal');
                const chips = [...m.querySelectorAll('.swc-rank')].map(c => ({
                    text: c.textContent.trim(), fill: getComputedStyle(c).backgroundColor,
                }));
                warnPopup = { text: m.innerText.replace(/\s+/g, ' ').trim(), chips };
                UI.onSellCancel();
            }
            return {
                slot: it.slot,
                sold: { rarity: it.rarity, age: it.age },
                shownKept: shownKept ? { rarity: shownKept.rarity, age: shownKept.age } : null,
                warnKept: warn ? { rarity: warn.kept.rarity, age: warn.kept.age } : null,
                sameObject: !!warn && warn.kept === shownKept,
                warned: !!warn,
                cards, warnPopup,
            };
        });
        if (!r) break;
        rows.push(r);
        // 다음 라운드를 위해 장비를 다양하게: 절반은 장착해서 장착품 등급을 계속 바꾼다
        await page.evaluate((eq) => {
            const it = UI.clearPendingCraft();
            UI.els.craftModal.classList.add('hidden');
            if (it && eq) Forge.equip(it);
        }, i % 2 === 0);
    }

    const warned = rows.filter(r => r.warned);
    console.log(`제작 ${rows.length}회 · 경고 ${warned.length}회`);

    // ⓐ 화면에 그려진 '장착됨'과 경고가 비교한 장비가 같은 개체여야 한다
    const mismatch = warned.filter(r => !r.sameObject);
    ok(mismatch.length === 0, `팝업이 보여준 장착품과 경고 비교 대상이 다른 케이스 ${mismatch.length}건`);

    // ⓑ 경고는 항상 strictly 높은 등급일 때만
    const RAR = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];
    const badRank = warned.filter(r => RAR.indexOf(r.sold.rarity) <= RAR.indexOf(r.warnKept.rarity));
    ok(badRank.length === 0, `같은/낮은 등급인데 경고가 뜬 케이스 ${badRank.length}건`);

    // ⓒ 인지 계측 (이번 수정의 본체) — 경고 창은 **파는 것과 남는 것의 등급을 나란히** 보여줘야 한다.
    // 비교 팝업 카드에는 등급이 전혀 안 나오므로(이름색·테두리색이 양쪽 다 잉크색) 여기가 유일한 자리다.
    const RAR_KR = { common: '일반', rare: '희귀한', epic: '서사시', legendary: '전설', ultimate: '궁극의', mythic: '신화' };
    let noCue = 0, badChip = 0;
    for (const r of warned) {
        const p = r.warnPopup;
        if (!p) { noCue++; continue; }
        const chips = p.chips.map(c => c.text);
        // 두 등급명이 각각 칩으로 떠 있어야 하고, 필 색이 서로 달라야 '견줄 수 있다'
        const hasBoth = chips.includes(RAR_KR[r.sold.rarity]) && chips.includes(RAR_KR[r.warnKept.rarity]);
        if (!hasBoth) noCue++;
        if (p.chips.length !== 2 || p.chips[0].fill === p.chips[1].fill) badChip++;
        if (!/파는 것/.test(p.text) || !/남는 것/.test(p.text)) noCue++;
    }
    console.log(`  경고 케이스 중 등급 대조가 안 보이는 것: ${noCue}/${warned.length} · 칩 색이 안 갈리는 것: ${badChip}/${warned.length}`);
    ok(noCue === 0, `경고 창에 '파는 것/남는 것' 등급 대조가 없는 케이스 ${noCue}/${warned.length}건 — 사용자에겐 '같은 등급인데 경고'로 보인다`);
    ok(badChip === 0, `등급 칩이 2개가 아니거나 색이 같은 케이스 ${badChip}/${warned.length}건`);

    // ⓓ 비교 팝업 카드 자체에는 여전히 등급 단서가 없다 — 이 사실을 기록으로 남겨 둔다(원본 준수)
    const cardCue = warned.filter(r => r.cards.length === 2 && r.cards[0].nameColor !== r.cards[1].nameColor).length;
    console.log(`  (참고) 비교 카드 이름색이 서로 다른 경고 케이스: ${cardCue}/${warned.length} — 원본(shot-043224)은 이름색이 시대색이라 등급 단서가 아니다`);

    const sample = warned[0];
    if (sample) {
        console.log(`  예시 — 파는 것 ${sample.sold.rarity}(${sample.sold.age}) vs 남을 것 ${sample.warnKept.rarity}(${sample.warnKept.age})`);
        sample.cards.forEach(c => console.log(`    카드: "${c.text}" 이름색=${c.nameColor}`));
        if (sample.warnPopup) {
            console.log(`    경고창: "${sample.warnPopup.text.replace(/\n/g, ' ')}"`);
            sample.warnPopup.chips.forEach(c => console.log(`      칩 "${c.text}" 필=${c.fill}`));
        }
    }

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
