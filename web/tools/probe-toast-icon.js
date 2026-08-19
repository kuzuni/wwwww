// 토스트 선두 이모지 → 코드 생성 아이콘 치환 검증.
// ⑴ 표에 있는 이모지는 아이콘 노드로 바뀌고 뒤 문구가 그대로 남는가
// ⑵ 표에 없는 이모지는 글자 그대로 남는가(무해한 폴백)
// ⑶ 닉네임·장비명이 텍스트로만 들어가는가(innerHTML 주입이 안 생기는가)
// 사용: PW_PATH=... node probe-toast-icon.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
    //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
    //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
    //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
    await waitBootDone(page);
    await page.waitForTimeout(900);

    const r = await page.evaluate(() => {
        const out = { mapped: [], unmapped: [], inject: null, missing: [] };
        const shoot = (msg) => {
            UI.els.toasts.innerHTML = '';
            UI.toast(msg);
            const t = UI.els.toasts.lastElementChild;
            return { html: t.innerHTML, text: t.textContent, ico: t.querySelector('.ico') };
        };
        for (const [emo, name] of Object.entries(UI.TOAST_ICON)) {
            const g = shoot(`${emo} 테스트 문구 +123`);
            out.mapped.push(`${emo}→${name} ico=${!!g.ico} 남은문구="${g.text}"`);
            // 아이콘이 실제 그림을 갖는지(=draw 에 있는지) 확인 — img() 의 조용한 실패 차단
            if (!IconGen.draw[name]) out.missing.push(name);
        }
        for (const emo of ['🌀', '🛸', '⚛', '🔥', '🥋']) {   // 표에 없는 것들(폴백 확인용)
            const g = shoot(`${emo} 미매핑 문구`);
            out.unmapped.push(`${emo} ico=${!!g.ico} text="${g.text}"`);
        }
        // 주입 방지: 태그가 든 문구를 넣어도 텍스트로만 남아야 한다
        const g = shoot('🪙 <img src=x onerror=alert(1)> 획득');
        out.inject = { html: g.html, hasImgTag: /<img /i.test(g.html) };
        // ⑷ 문구 **중간**의 이모지도 바뀌는가 — 선두만 바꾸면 한 줄에 아이콘과 이모지가 섞인다
        const mid = shoot('🏆 1-1 첫 클리어! 🪙+60');
        out.mid = { icons: mid.html.split('<i ').length - 1, text: mid.text };
        // ⑸ 이형 선택자(U+FE0F) — 실제 문구는 `⚔️`·`⬆️`·`⚙️` 처럼 FE0F 가 붙어 온다.
        //    표 키는 맨 글자라, 안 건너뛰면 보이지 않는 문자가 문구에 남는다.
        out.vs = ['\u2694\uFE0F 이미 던전에 진행 중입니다', '\u2B06\uFE0F 3회 업그레이드 완료',
                  '\u2699\uFE0F 태엽이 부족합니다'].map(m => {
            const g = shoot(m);
            return { ico: !!g.ico, hasVS: /\uFE0F/.test(g.text), text: g.text };
        });
        return out;
    });

    console.log('=== ⑴ 표에 있는 이모지 (아이콘으로 치환) ===');
    r.mapped.forEach(x => console.log('  ' + x));
    console.log('=== ⑵ 표에 없는 이모지 (글자 그대로 폴백) ===');
    r.unmapped.forEach(x => console.log('  ' + x));
    console.log('=== ⑸ 이형 선택자(U+FE0F) ===');
    r.vs.forEach(v => console.log(`  ico=${v.ico} FE0F잔여=${v.hasVS} text="${v.text}"`));
    console.log('=== ⑷ 문구 중간 이모지 ===');
    console.log(`  '🏆 1-1 첫 클리어! 🪙+60' → 아이콘 ${r.mid.icons}개(2 여야 한다) · 남은 텍스트 "${r.mid.text}"`);
    console.log('=== ⑶ 주입 방지 ===');
    console.log('  <img> 태그가 살아남았는가:', r.inject.hasImgTag, '(false 여야 한다)');
    console.log('  html =', r.inject.html);
    const bad = [];
    if (r.missing.length) bad.push('draw 에 없는 아이콘: ' + r.missing.join(','));
    if (r.mapped.some(x => x.includes('ico=false'))) bad.push('치환 실패한 이모지가 있다');
    if (r.unmapped.some(x => x.includes('ico=true'))) bad.push('미매핑인데 아이콘이 붙었다');
    if (r.inject.hasImgTag) bad.push('문구가 HTML 로 해석됐다');
    if (r.mid.icons !== 2) bad.push('문구 중간 이모지가 안 바뀐다(아이콘 ' + r.mid.icons + '개)');
    if (/[\u{1F300}-\u{1FAFF}]/u.test(r.mid.text)) bad.push('바뀐 뒤에도 텍스트에 이모지가 남아 있다');
    if (r.vs.some(v => !v.ico)) bad.push('FE0F 붙은 이모지가 아이콘으로 안 바뀐다');
    if (r.vs.some(v => v.hasVS)) bad.push('치환 후에도 U+FE0F 가 문구에 남아 있다');
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 전건 통과 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
