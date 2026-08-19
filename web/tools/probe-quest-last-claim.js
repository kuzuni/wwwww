// 퀘스트 시트 맨 아래 [수령] 이 탭바에 깔려 눌리지 않던 버그 검증 (slug `quest-last-claim-under-tabbar`).
// 재현(항목 기록 그대로): 전 퀘스트 완료 → 목록 맨 아래로 스크롤 → 마지막 행 [수령] 을 탭.
// 게이트(3뷰포트):
//   ① 마지막 [수령] 버튼 중심의 elementFromPoint 가 **그 버튼**이어야 한다(탭바가 아니라)
//   ② 그 좌표를 실제로 클릭하면 해당 퀘스트 진행도가 0으로 리셋(=수령됨), 열린 모달은 그대로 퀘스트
//   ③ 상단 [일괄수령] 경로도 여전히 정상(회귀 방지)
//   ④ 콘솔 에러 0
// 사용: node tools/probe-quest-last-claim.js
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VIEWS = [[390, 844], [360, 640], [430, 932]];

async function booted(page) {
    // els.panels 까지 확인한다 — UI·S 만 보고 switchTab 을 부르면 패널 초기화 전이라 터진다(테스트 타이밍).
    for (let i = 0; i < 200; i++) { if (await page.evaluate(() => typeof UI !== 'undefined' && !!S && !!(UI.els && UI.els.panels) && typeof Quests !== 'undefined').catch(() => 0)) { await page.waitForTimeout(150); return; } await page.waitForTimeout(100); }
    throw new Error('부팅 대기 초과');
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const fails = [];
    for (const [w, h] of VIEWS) {
        const errs = [];
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
        //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
        //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
        //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
        await waitBootDone(page);
        await booted(page);
        // 전 퀘스트 완료 상태로
        await page.evaluate(() => { Quests.ensure(); S.quests.forEach(q => q.prog = q.need); UI.switchTab(null); UI.openQuests(); });
        await page.waitForTimeout(300);
        // 맨 아래로 스크롤 (시트 자신이 스크롤 컨테이너)
        const info = await page.evaluate(() => {
            const sheet = document.querySelector('#quest-modal .modal-card.sheet') || document.querySelector('.modal-card.sheet');
            sheet.scrollTop = sheet.scrollHeight;
            return { scrollTop: Math.round(sheet.scrollTop), scrollMax: Math.round(sheet.scrollHeight - sheet.clientHeight) };
        });
        await page.waitForTimeout(200);
        const res = await page.evaluate(() => {
            const btns = [...document.querySelectorAll('#quest-modal .qst-row .btn, .modal-card.sheet .qst-row .btn')];
            const last = btns[btns.length - 1];
            const r = last.getBoundingClientRect();
            const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
            const hit = document.elementFromPoint(cx, cy);
            const tabbar = document.querySelector('#tabbar');
            const tb = tabbar.getBoundingClientRect();
            return {
                cx, cy, rectTop: Math.round(r.top), rectBottom: Math.round(r.bottom), tabbarTop: Math.round(tb.top),
                hitIsButton: hit === last || last.contains(hit),
                hitTag: hit ? (hit.className || hit.tagName) : null,
                lastIdx: btns.length - 1,
            };
        });
        // 실제 클릭 후 상태 확인
        const before = await page.evaluate(() => ({ ready: Quests.readyCount(), lastId: S.quests[S.quests.length - 1].id, lastProg: S.quests[S.quests.length - 1].prog }));
        await page.mouse.click(res.cx, res.cy);
        await page.waitForTimeout(250);
        const after = await page.evaluate((lastId) => {
            const q = S.quests.find(x => x.id === lastId);
            return { ready: Quests.readyCount(), lastProg: q ? q.prog : -1, openModals: [...document.querySelectorAll('.modal:not(.hidden)')].map(m => m.id) };
        }, before.lastId);
        // 수령되면 그 퀵스트가 prog 0으로 리셋되고 readyCount 가 줄어든다
        const claimed = after.ready < before.ready && after.lastProg < before.lastProg;
        const shopOpened = after.openModals.includes('shop-modal');
        const tag = `${w}×${h}`;
        console.log(`[${tag}] scroll ${info.scrollTop}/${info.scrollMax} · 마지막수령 y=${res.rectTop}~${res.rectBottom} vs 탭바 ${res.tabbarTop} · elementFromPoint=${res.hitIsButton ? '버튼✓' : res.hitTag} · 클릭후 ready ${before.ready}→${after.ready}·lastProg ${before.lastProg}→${after.lastProg} · 모달[${after.openModals.join(',')}]`);
        if (!res.hitIsButton) fails.push(`${tag}: 마지막 [수령] 위 elementFromPoint 가 버튼이 아님(${res.hitTag}) — 탭바에 깔림`);
        if (!claimed) fails.push(`${tag}: 마지막 [수령] 클릭했는데 수령 안 됨(ready ${before.ready}→${after.ready})`);
        if (shopOpened) fails.push(`${tag}: 마지막 [수령] 오탭으로 상점이 열림`);
        if (errs.length) fails.push(`${tag}: 콘솔 에러 ${errs.length}건 ${errs.slice(0, 2)}`);

        // ③ 일괄수령 회귀 — 다시 완료 상태로 만들고 상단 버튼으로 수령
        await page.evaluate(() => { Quests.ensure(); S.quests.forEach(q => q.prog = q.need); UI.openQuests(); });
        await page.waitForTimeout(150);
        const allOk = await page.evaluate(() => {
            const b = document.querySelector('.qst-allbar .btn');
            if (!b) return { ok: false, why: '일괄수령 버튼 없음' };
            const readyBefore = S.quests.filter(q => q.prog >= q.need).length;
            b.click();
            const readyAfter = S.quests.filter(q => q.prog >= q.need).length;
            return { ok: readyAfter < readyBefore, readyBefore, readyAfter };
        });
        if (!allOk.ok) fails.push(`${tag}: 일괄수령 회귀 — ${allOk.why || `${allOk.readyBefore}→${allOk.readyAfter}`}`);
        await page.close();
    }
    await browser.close();
    if (fails.length) { console.log('\n❌ FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\n✅ PASS — 3뷰포트 전부 마지막 [수령] 정상 클릭·수령, 오탭 상점 없음, 일괄수령 회귀 없음');
})();
