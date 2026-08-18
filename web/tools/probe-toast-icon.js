// 토스트 선두 이모지 → 코드 생성 아이콘 치환 검증.
// ⑴ 표에 있는 이모지는 아이콘 노드로 바뀌고 뒤 문구가 그대로 남는가
// ⑵ 표에 없는 이모지는 글자 그대로 남는가(무해한 폴백)
// ⑶ 닉네임·장비명이 텍스트로만 들어가는가(innerHTML 주입이 안 생기는가)
// 사용: PW_PATH=... node probe-toast-icon.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
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
        return out;
    });

    console.log('=== ⑴ 표에 있는 이모지 (아이콘으로 치환) ===');
    r.mapped.forEach(x => console.log('  ' + x));
    console.log('=== ⑵ 표에 없는 이모지 (글자 그대로 폴백) ===');
    r.unmapped.forEach(x => console.log('  ' + x));
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
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 전건 통과 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
