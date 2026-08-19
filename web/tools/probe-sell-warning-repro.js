// `sell-warn-samerank` 재현 조사 (2026-08-18) — 합성 케이스가 아니라 **실게임 제작 루프**로 돈다.
// 목적 둘:
//  ⓐ 로직 버그 재현 — 비교 팝업이 보여준 '장착됨' 카드와 경고가 실제로 비교한 장비가 어긋나는가
//     (팝업이 뜬 뒤 장비가 바뀌면 사용자는 화면에 없는 장비와 비교당한 셈이 된다)
//  ⓑ 인지 차이 계측 — 경고가 뜬 순간 **화면에 비교 축(시대)이 보이는가**. 비교 카드는 `[시대] 이름`과
//     스탯만 쓰고 두 카드 이름색이 같아, 견줄 단서가 없으면 사용자 눈엔 '같은 등급인데 경고'가 된다.
// ⚠️ 2026-08-18 갱신 — 판정 축이 rarity → **시대(AGES)** 로 바뀌었다(사용자 확정). 이 파일의 기대값도
//    전부 시대 기준이다. rarity 로 되돌리지 말 것.
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        // ⚠️ forgeLevel 은 forgeProbabilities 표에 있는 값이어야 한다(1~35). 범위를 넘기면
        // `ageProbsAt`가 조용히 레벨 1(= 원시적 100%)로 떨어져 **시대가 한 종류만 나온다** —
        // 예전 60은 그 함정에 걸려 있었고, rarity 기준일 땐 티가 안 났지만 시대 기준에선
        // 경고가 한 건도 안 뜨는 무의미한 런이 된다. 30은 다중 우주 60·양자 36·지하 세계 4로
        // 갈려서 '한 시대 뒤진 장비를 끼고 최신 시대를 뽑는' 실제 상황이 자연히 생긴다.
        S.hammers = 1e6; S.forgeLevel = 30; S.autoForgeOn = false;
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
                const chips = [...m.querySelectorAll('.swc-age')].map(c => ({
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

    // ⓑ 경고는 항상 strictly 최신 **시대**일 때만 (2026-08-18 사용자 확정: 장비 비교 축은 AGE 하나)
    const AGE_LIST = ['primitive', 'medieval', 'earlyModern', 'modern', 'space',
                      'interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];
    const badRank = warned.filter(r => AGE_LIST.indexOf(r.sold.age) <= AGE_LIST.indexOf(r.warnKept.age));
    ok(badRank.length === 0, `같은/이전 시대인데 경고가 뜬 케이스 ${badRank.length}건`);
    // rarity 는 이제 판정에 관여하면 안 된다 — 경고 중 '파는 rarity 가 더 낮은' 케이스가 실제로
    // 섞여 있어야 시대 기준으로 갈아탄 게 맞다(전부 rarity 순이면 우연히 옛 규칙과 같은 것이다)
    const RAR = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];
    const lowerRarityWarn = warned.filter(r => RAR.indexOf(r.sold.rarity) < RAR.indexOf(r.warnKept.rarity)).length;
    console.log(`  경고 중 '파는 rarity 가 더 낮은' 케이스: ${lowerRarityWarn}/${warned.length} (0이어도 실패는 아님 — 시대만 보므로)`);

    // ⓒ 인지 계측 (이번 수정의 본체) — 경고 창은 **파는 것과 남는 것의 시대를 나란히** 보여줘야 한다.
    // 비교 팝업 카드에는 견줄 단서가 없으므로(이름색·테두리색이 양쪽 다 잉크색) 여기가 유일한 자리다.
    const AGE_KR_MAP = {
        primitive: '원시적', medieval: '중세의', earlyModern: '근대 초기', modern: '현대의', space: '우주',
        interstellar: '항성간', multiverse: '다중 우주', quantum: '양자', underworld: '지하 세계', divine: '천상'
    };
    let noCue = 0, badChip = 0;
    for (const r of warned) {
        const p = r.warnPopup;
        if (!p) { noCue++; continue; }
        const chips = p.chips.map(c => c.text);
        // 두 시대명이 각각 칩으로 떠 있어야 하고, 필 색이 서로 달라야 '견줄 수 있다'
        const hasBoth = chips.includes(AGE_KR_MAP[r.sold.age]) && chips.includes(AGE_KR_MAP[r.warnKept.age]);
        if (!hasBoth) noCue++;
        if (p.chips.length !== 2 || p.chips[0].fill === p.chips[1].fill) badChip++;
        if (!/파는 것/.test(p.text) || !/남는 것/.test(p.text)) noCue++;
    }
    console.log(`  경고 케이스 중 시대 대조가 안 보이는 것: ${noCue}/${warned.length} · 칩 색이 안 갈리는 것: ${badChip}/${warned.length}`);
    ok(noCue === 0, `경고 창에 '파는 것/남는 것' 시대 대조가 없는 케이스 ${noCue}/${warned.length}건 — 사용자에겐 '같은 등급인데 경고'로 보인다`);
    ok(badChip === 0, `시대 칩이 2개가 아니거나 색이 같은 케이스 ${badChip}/${warned.length}건`);

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
