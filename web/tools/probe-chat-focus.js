// 채팅 입력 중 봇 메시지 도착 시 포커스·캐럿 유실 검증 (TODO QA 13차).
//
// 버그 재현 원리 — main.js 1초 틱이 Chat.tick()==true 일 때 UI.renderChatFull() 을 부르고,
// 그게 chatModal.innerHTML 을 통째로 갈아끼우면 타이핑 중이던 <input> 이 **다른 노드로 교체**된다.
// 그러면 document.activeElement 가 body 로 빠지고, 그 뒤 타이핑이 어디에도 안 들어간다.
//
// 이 프로브는 봇 틱을 기다리지 않고 Chat.tick() 을 강제로 참으로 만들어(마지막 메시지 시각을 과거로
// 밀어) 같은 경로를 즉시 밟는다 — 15~40초 대기 없이 결정적으로 재현된다.
//
// 사용: node probe-chat-focus.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const snap = () => ({
    active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName.toLowerCase()) : '(none)',
    value: (document.getElementById('chat-input') || {}).value,
    selStart: (document.getElementById('chat-input') || {}).selectionStart,
    selEnd: (document.getElementById('chat-input') || {}).selectionEnd,
    msgCount: S.chat.messages.length,
});

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Chat !== "undefined"');
    await page.waitForTimeout(1500);

    const fails = [];
    const ok = (cond, label, detail) => {
        console.log(`${cond ? '  OK  ' : '  FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
        if (!cond) fails.push(label);
    };

    // ① 전체화면 채팅 열기 + 입력창에 포커스 주고 문장 입력
    await page.evaluate(() => { Chat.ensure(); UI.openChat(); });
    await page.waitForTimeout(800); // 모달 열기 애니(0.3s, scale 변화)가 끝나야 click 의 안정성 검사가 통과한다
    await page.click('#chat-input');
    await page.keyboard.type('길게 쓴 메시지입니다');
    // 커서를 문자열 중간(5번째)으로 옮겨 둔다 — 캐럿까지 보존되는지 보려고.
    await page.evaluate(() => document.getElementById('chat-input').setSelectionRange(5, 5));
    const before = await page.evaluate(snap);
    console.log('  봇 틱 직전:', JSON.stringify(before));
    ok(before.active === 'chat-input', '입력 준비 — 포커스가 chat-input');

    // ② 봇 메시지 도착을 강제한다: Chat.tick() 은 `now - S.chat.lastBotAt > _nextGap` 에서 참이 되므로
    //    lastBotAt 을 2분 전으로 밀면 다음 1초 틱에서 곧바로 봇 메시지가 생성된다(15~40초 대기 불필요).
    await page.evaluate(() => { S.chat.lastBotAt = U.now() - 120000; });
    await page.waitForTimeout(2500); // 1초 틱 2회분

    const after = await page.evaluate(snap);
    console.log('  봇 틱 직후:', JSON.stringify(after));
    ok(after.msgCount > before.msgCount, '봇 메시지가 실제로 도착함(재현 조건 성립)', `${before.msgCount} → ${after.msgCount}`);
    ok(after.active === 'chat-input', '포커스 유지 — activeElement 가 여전히 chat-input', `active=${after.active}`);
    ok(after.value === before.value, '입력 텍스트 보존', `"${after.value}"`);
    ok(after.selStart === 5 && after.selEnd === 5, '캐럿 위치 보존(5)', `selStart=${after.selStart} selEnd=${after.selEnd}`);

    // ③ 이어서 타이핑한 글자가 커서 자리에 실제로 들어가는가
    await page.keyboard.type('XYZ');
    const typed = await page.evaluate(snap);
    console.log('  이어 타이핑 후:', JSON.stringify(typed));
    ok(typed.value === '길게 쓴 XYZ메시지입니다', '이어 친 글자가 커서 자리에 삽입됨(캐럿 5 = "메" 앞)', `"${typed.value}"`);

    // ④ Enter 전송이 입력창에서 발생해 실제로 내 메시지가 들어가는가
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const sent = await page.evaluate(() => {
        const last = S.chat.messages[S.chat.messages.length - 1];
        return { mine: !!last.mine, text: last.text, active: document.activeElement ? (document.activeElement.id || 'body') : '(none)', value: document.getElementById('chat-input').value };
    });
    console.log('  Enter 후:', JSON.stringify(sent));
    ok(sent.mine === true, 'Enter 로 내 메시지가 전송됨', `last.mine=${sent.mine} text="${sent.text}"`);
    ok(sent.value === '', '전송 후 입력창 비워짐');
    ok(sent.active === 'chat-input', '전송 후에도 포커스 유지(연속 입력 가능)', `active=${sent.active}`);

    // ⑤ 스크롤 하단 고정이 깨지지 않았는지(기존 보존 동작 회귀 확인)
    //    '바닥인가'는 scrollHeight 산식이 아니라 **브라우저가 실제로 허용하는 최대 scrollTop** 과 비교한다
    //    (이 리스트는 first-child margin-top:auto + 카드 스케일 애니 때문에 산식이 신뢰할 수 없다).
    await page.waitForTimeout(600); // 지연 재고정(400ms)까지 끝난 뒤 재기
    const scroll = await page.evaluate(() => {
        const l = document.getElementById('chat-list');
        const cur = Math.round(l.scrollTop);
        l.scrollTop = 99999; const max = Math.round(l.scrollTop); l.scrollTop = cur;
        return { atBottom: cur >= max - 2, cur, max };
    });
    ok(scroll.atBottom, '메시지 리스트가 최신 메시지에 붙어 있음', JSON.stringify(scroll));

    // ⑥ 위로 올려 옛 메시지를 읽는 중이면 새 메시지가 와도 끌어내리지 않는가(따라가기 반대편 동작)
    await page.evaluate(() => { document.getElementById('chat-list').scrollTop = 0; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { S.chat.lastBotAt = U.now() - 120000; });
    await page.waitForTimeout(2500);
    const kept = await page.evaluate(() => Math.round(document.getElementById('chat-list').scrollTop));
    ok(kept < 60, '위로 올려 읽는 중에는 새 메시지가 와도 끌어내리지 않음', `scrollTop=${kept}`);

    if (errs.length) console.log('  콘솔 에러:', errs.slice(0, 5));
    ok(errs.length === 0, '콘솔 에러 없음', `${errs.length}건`);

    console.log(fails.length ? `\n실패 ${fails.length}건: ${fails.join(' / ')}` : '\n전부 통과');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
