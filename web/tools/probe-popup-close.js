// 팝업마다 **화면에 보이는 닫는 길**이 있는지. (slug: geardetail-no-close)
//
// 장비 상세 팝업만 ✕ 가 없어서 닫는 방법이 화면에 하나도 안 보였다 — 다른 팝업을 전부 ✕ 로
// 닫아 온 사용자에게는 갇힌 것처럼 읽힌다(배경 탭은 먹었지만 그건 화면에 안 보이는 길이고,
// ESC 는 이 게임 어디서도 안 먹는다 — 전역 keydown 핸들러 자체가 없다).
//
// 한 곳을 고치는 것으로 끝내지 않고 **모든 팝업에 같은 계약을 건다**: 열려 있는 모달마다
// 화면에 닫는 길이 하나는 있어야 한다. 다만 그 길이 세 가지라 셋 다 인정한다.
//   ⑴ 모달 안의 `.x-btn`(대부분의 팝업)
//   ⑵ **탭바의 ✕** — `UI.MODAL_TAB` 에 실린 팝업(상점·던전·퀘스트·리그·패스·펫업그레이드)은
//      열리는 동안 해당 탭 버튼이 `.tab-x` 로 바뀌어 ✕ 를 그린다. 닫는 길이 모달 **밖**에 있다.
//   ⑶ 모달 자신의 버튼이 실제로 팝업을 닫는 경우(제작 비교 팝업의 [판매]/[장착] — 둘 중 하나를
//      고르면 닫히는 강제 선택형이다).
// ⚠️ ⑶ 은 **이름으로 짐작하지 말고 눌러서 확인한다.** 처음엔 `onclick` 에 close/back 이 들어가는지
//    정규식으로 봤는데, 상점(닫는 길이 탭바에 있음)과 제작 비교(`resolveCraft`)가 **둘 다 거짓 양성**
//    으로 잡혔다. 이름 짐작은 멀쩡한 팝업을 버그로 만든다.
// 화면 목록·오프너는 `shot-screens.js` 에서 그대로 가져온다(목록이 갈라지면 검사 못 하는 팝업이 생긴다).
//
// 사용: node probe-popup-close.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = [...SRC.matchAll(/^\s*\['([\w-]+)',\s*(?:'[\d]+'|null),\s*(`[^`]*`|[A-Z_][\w]*)\],/gm)].map(m => {
    const raw = m[2];
    if (raw[0] === '`') return [m[1], raw.slice(1, -1)];
    const req = SRC.match(new RegExp(`const\\s*\\{[^}]*\\b${raw}\\b[^}]*\\}\\s*=\\s*require\\('([^']+)'\\)`));
    const val = req && require(req[1])[raw];
    if (typeof val !== 'string') throw new Error(`오프너 상수 ${raw} 를 못 풀었다 — 화면이 조용히 빠진다`);
    return [m[1], val];
});

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => m.type() === 'error' && !/favicon\.ico/.test(m.text()) && errs.push(m.text()));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 150000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });
    await page.evaluate(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
    });
    const seedAt = SRC.indexOf('const SEED = () => {');
    const seedSrc = SRC.slice(seedAt + 'const SEED = '.length, SRC.indexOf('\n};', seedAt) + 2);
    await page.evaluate(s => { try { eval('(' + s + ')()'); } catch (e) {} }, seedSrc);

    const rows = [];
    for (const [name, opener] of SCREENS) {
        const r = await page.evaluate((src) => {
            try {
                UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                UI.closeDetail && UI.closeDetail();
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                eval(src);
            } catch (e) { return { err: e.message }; }
            const open = [...document.querySelectorAll('.modal')].filter(m => !m.classList.contains('hidden'));
            if (!open.length) return { modal: null };           // 팝업이 아닌 화면 — 검사 대상 아님
            // 여러 개가 겹쳐 있으면 **맨 위(마지막)** 것이 지금 사용자가 보는 팝업이다.
            const m = open[open.length - 1];
            const tabX = !!document.querySelector('#tabbar button.tab-x');
            return {
                modal: m.id,
                hasX: !!m.querySelector('.x-btn'),
                tabX,
                buttons: m.querySelectorAll('button').length,
                interactive: m.querySelectorAll('button, [onclick]').length,
            };
        }, opener);
        await page.waitForTimeout(200);
        if (r.err) { errs.push(`[${name}] ${r.err}`); continue; }
        if (!r.modal) continue;
        // 🚨 **탭바 ✕ 는 팝업을 연 그 evaluate 안에서 읽으면 안 된다** (2026-08-20 UI 스트림 실측).
        //    `refreshTabX` 는 `watchTabX` 의 MutationObserver 가 굴리는데, 옵저버는 **비동기**라
        //    같은 tick 안에서는 아직 클래스가 안 붙어 있다. 그래서 z20 짜리 멀쩡한 팝업
        //    (shop·dungeons·league)이 실행 순서에 따라 '탭바 ✕ 없음'으로 들쭉날쭉 찍혔다.
        //    한 박자 쉬고 다시 읽는다 — 사용자가 보는 것도 이쪽이다.
        r.tabX = await page.evaluate(() => !!document.querySelector('#tabbar button.tab-x'));

        // ⑶ — ⑴⑵ 로 안 잡힌 팝업만, 버튼을 실제로 **눌러서** 닫히는지 본다(최대 6개).
        r.clickCloses = null;
        if (!r.hasX && !r.tabX) {
            for (let i = 0; i < Math.min(r.buttons, 6); i++) {
                const hid = await page.evaluate(({ src, i }) => {
                    try {
                        UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                        eval(src);
                    } catch (e) { return null; }
                    const open = [...document.querySelectorAll('.modal')].filter(m => !m.classList.contains('hidden'));
                    if (!open.length) return null;
                    const m = open[open.length - 1];
                    const b = m.querySelectorAll('button')[i];
                    if (!b) return null;
                    b.click();
                    if (!m.classList.contains('hidden')) return null;
                    // 🚨 **글자 없는 아이콘 버튼을 빈 문자열로 돌려주면 안 된다** (2026-08-20 UI 스트림 실측).
                    //    종전엔 `(b.textContent||'').trim().slice(0,12)` 를 그대로 돌려줘서, 닫기가 **실제로
                    //    성공했는데도** 빈 문자열이 falsy 라 호출부 `if (hid)` 가 실패로 읽었다. 채팅 팝업의
                    //    닫기(`.btn.danger.round`, `onclick="UI.closeChat()"`)가 정확히 그 모양이라
                    //    **닫는 길이 멀쩡한데 '없다'고 FAIL** 이 났다.
                    return (b.textContent || '').trim().slice(0, 12) || b.className || '(아이콘 버튼)';
                }, { src: opener, i });
                if (hid) { r.clickCloses = `${hid}`; break; }
            }
        }
        rows.push([name, r]);
    }

    const bad = [];
    for (const [name, r] of rows) {
        const how = r.hasX ? '모달 ✕' : r.tabX ? '탭바 ✕' : r.clickCloses ? `버튼 [${r.clickCloses}]` : null;
        console.log(`  ${how ? 'OK ' : 'X  '} ${name.padEnd(18)} #${(r.modal || '?').padEnd(22)} 닫는 길: ${how || '없음'}  (조작요소 ${r.interactive})`);
        if (!how) bad.push(`${name}(#${r.modal}) 에 닫는 길이 없다 — 모달 ✕ 없음 · 탭바 ✕ 없음 · 버튼 ${r.buttons}개 중 닫는 것 없음`);
    }
    console.log(`\n  검사한 팝업 ${rows.length}개`);
    if (!rows.length) bad.push('팝업을 하나도 못 열었다(오프너 목록이 갈라졌다)');
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));

    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : `\nPASS — 팝업 ${rows.length}개 전부 화면에 닫는 길이 있다 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
