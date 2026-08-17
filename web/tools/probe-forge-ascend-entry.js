// 대장간 Lv.35 승천 진입 경로 실측 — 사용: node probe-forge-ascend-entry.js
// QA 11차 버그: Lv.35에 도달하면 장비 시트의 대장간 버튼이 `disabled`로 바뀌는데
// `⭐ 승천` 버튼은 **그 버튼으로만 열리는 대장간 정보 팝업 안에** 있어서, 팝업을 한 번 닫으면
// 장비 라인 승천에 다시 들어갈 방법이 없다(프레스티지 한 갈래가 통째로 잠긴다).
//
// 판정: ① Lv.35로 새로 로드한 직후(팝업 안 열린 상태) 대장간 버튼이 **눌린다**
//       ② 그 버튼을 눌러 열린 팝업 안에 `openAscension('forge')` 진입 버튼이 있다
//       ③ 승천 확인 팝업의 `⭐ 승천` 버튼이 활성이고, 눌러서 실제로 승천이 성립한다
//          (lineAscend.forge +1 · forgeLevel 1로 리셋)
//       ④ 방 탭 → 🌟 승천 개요의 **조건 충족 행을 탭해도** 같은 확인 팝업이 열린다(네 라인 공통)
//       ⑤ 승천 뒤에는 대장간 버튼이 평소의 `레벨 N`으로 돌아온다
//       ⑥ 콘솔 에러 0건
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && document.querySelector('.anvil-btn'), null, { timeout: 25000 });

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };

    // ---- Lv.35 상태를 만들고 **모든 팝업을 닫은 뒤** 다시 그린다(= 새로 로드한 것과 같은 상태) ----
    const st1 = await page.evaluate(() => {
        S.forgeLevel = Ascension.FORGE_LEVEL; S.forgeUpgradeEndsAt = null;
        Ascension.ensure();
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.renderEquipSheet();
        const btn = [...document.querySelectorAll('#equip-sheet button')].find(b => /대장간|승천/.test(b.textContent));
        // DOM 전체에서 승천 진입점을 센다 — QA가 쓴 것과 같은 스캔
        const scan = (sel) => document.querySelectorAll(`[onclick*="${sel}"]`).length;
        return {
            ready: Ascension.ready('forge'),
            btnText: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null,
            btnDisabled: btn ? btn.classList.contains('disabled') || !btn.getAttribute('onclick') : true,
            openForgeInfo: scan('openForgeInfo'), ascendForge: scan("openAscension('forge')"), onAscendLine: scan('onAscendLine'),
        };
    });
    ok(st1.ready, `Lv.35인데 Ascension.ready('forge')가 false`);
    ok(!st1.btnDisabled, `팝업을 닫은 Lv.35 상태에서 대장간 버튼이 죽어 있다 — "${st1.btnText}"`);
    ok(st1.openForgeInfo > 0, `대장간 정보 팝업 진입점이 DOM에 0건 — 승천으로 가는 길이 없다`);

    // ---- ② 버튼을 실제로 눌러 팝업을 열고 승천 진입 버튼을 찾는다 ----
    await page.evaluate(() => {
        const btn = [...document.querySelectorAll('#equip-sheet button')].find(b => /대장간|승천/.test(b.textContent));
        btn.click();
    });
    const st2 = await page.evaluate(() => ({
        modalOpen: !document.getElementById('forge-info-modal').classList.contains('hidden'),
        ascendBtn: document.querySelectorAll('#forge-info-modal [onclick*="openAscension"]').length,
    }));
    ok(st2.modalOpen, '대장간 버튼을 눌렀는데 대장간 정보 팝업이 안 열렸다');
    ok(st2.ascendBtn > 0, '대장간 정보 팝업 안에 ⭐ 승천 진입 버튼이 없다');

    // ---- ④ 승천 개요의 조건 충족 행 탭 ----
    const st3 = await page.evaluate(() => {
        UI.closeForgeInfo();
        UI.openAscension();                       // 방 탭 → 🌟 승천 (개요)
        const rows = [...document.querySelectorAll('.asc-row')];
        const ready = rows.filter(r => r.classList.contains('ready'));
        const tappable = ready.filter(r => r.getAttribute('onclick'));
        const before = ready.length;
        if (tappable[0]) tappable[0].click();      // 조건 충족 행을 탭한다
        return { rows: rows.length, ready: before, tappable: tappable.length, focus: document.querySelectorAll('.asc-focus').length };
    });
    ok(st3.ready > 0, `Lv.35인데 승천 개요에 조건 충족 행이 없다 (${st3.rows}행)`);
    ok(st3.tappable === st3.ready, `조건 충족 행 ${st3.ready}개 중 ${st3.tappable}개만 탭 가능하다`);
    ok(st3.focus > 0, '조건 충족 행을 탭했는데 라인 확인 팝업이 안 열렸다');

    // ---- ③⑤ 실제로 승천이 성립하는지 ----
    const st4 = await page.evaluate(() => {
        const before = { cnt: Ascension.count('forge'), lv: S.forgeLevel };
        const btn = [...document.querySelectorAll('[onclick*="onAscendLine"]')][0];
        const disabled = btn ? btn.classList.contains('disabled') : true;
        if (btn) btn.click();
        // 확인 단계가 한 겹 더 있으면 그것도 누른다
        const confirm = [...document.querySelectorAll('[onclick*="onAscendLine"], [onclick*="confirmAscend"]')].filter(b => !b.classList.contains('disabled'));
        if (Ascension.count('forge') === before.cnt && confirm[0]) confirm[0].click();
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.renderEquipSheet();
        const fb = [...document.querySelectorAll('#equip-sheet button')].find(b => /대장간|승천/.test(b.textContent));
        return { disabled, before, after: { cnt: Ascension.count('forge'), lv: S.forgeLevel },
                 btnText: fb ? fb.textContent.replace(/\s+/g, ' ').trim() : null, btnLive: !!(fb && fb.getAttribute('onclick')) };
    });
    ok(!st4.disabled, '승천 확인 팝업의 ⭐ 승천 버튼이 비활성이다');
    ok(st4.after.cnt === st4.before.cnt + 1, `승천이 성립하지 않았다 — lineAscend.forge ${st4.before.cnt} → ${st4.after.cnt}`);
    ok(st4.after.lv === 1, `승천 후 대장간 레벨이 1로 안 돌아갔다 (${st4.after.lv})`);
    ok(st4.btnLive, `승천 뒤 대장간 버튼이 죽어 있다 — "${st4.btnText}"`);

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    console.log(`Lv.35 대장간 버튼: "${st1.btnText}" · 눌림 ${!st1.btnDisabled}`);
    console.log(`DOM 진입점 — openForgeInfo ${st1.openForgeInfo} · openAscension('forge') ${st1.ascendForge} · onAscendLine ${st1.onAscendLine}`);
    console.log(`팝업 안 승천 버튼 ${st2.ascendBtn}개 · 개요 행 ${st3.rows} (충족 ${st3.ready} · 탭 가능 ${st3.tappable}) · 확인 팝업 ${st3.focus}`);
    console.log(`승천 실행: ⭐${st4.before.cnt}→${st4.after.cnt} · Lv.${st4.before.lv}→${st4.after.lv} · 이후 버튼 "${st4.btnText}"`);
    console.log('');
    if (fail.length) { console.log('FAIL\n - ' + fail.join('\n - ')); await browser.close(); process.exit(1); }
    console.log('PASS — Lv.35에서 승천 진입 경로가 살아 있고 실제로 승천이 성립한다');
    await browser.close();
})();
