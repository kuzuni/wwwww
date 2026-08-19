// 같은 아이콘이 화면마다 다른 그림으로 보이는가 — **화면 간 정합** 실측.
//
// 왜: icon-gen 채점 메모의 남은 공통 지적 중 하나가 "망치 조형이 퀘스트와 본편에서 다르다"였고,
//     '실물 대조 필요'로 미결인 채 남아 있었다. 눈으로 우기지 말고 픽셀로 끝내려고 만든다.
//
// 판정:
//  ① **한 이름 = 한 그림**: 같은 아이콘 이름이 쓰인 모든 자리가 **같은 background-image** 를 쓴다.
//     (IconGen 은 이름당 CSS 클래스 하나를 만들어 dataURL 을 담는다 — 여기가 갈리면 그림이 갈린다.)
//  ② **찌그러짐 없음**: `.ico` 규약은 `background-size: contain` 이라 상자가 정사각이 아니어도
//     그림의 가로세로비는 보존돼야 한다. `cover`/`100% 100%` 로 덮어쓴 자리가 있으면 **모양이 실제로
//     달라진다** — 이게 '화면마다 조형이 다르다'가 사실이 되는 유일한 경로다.
//  ③ **읽을 수 있는 크기**: 표시 변이 6px 미만이면 조형 판단 자체가 무의미하다(뭉갠다).
//
// ⚠️ 크기가 화면마다 다른 것 자체는 결함이 아니다(상단바 재화 칩과 퀘스트 보상 알약은 원래 크기가
//    다르다). 결함은 **그림이 갈리는 것**과 **비율이 찌그러지는 것** 둘뿐이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitUiReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 화면을 여는 법 — 여러 화면에 같은 아이콘이 걸리도록 고른다.
const SCREENS = [
    ['본편 상단바', () => { UI.renderTopBar(); UI.renderEquipSheet(); }],
    ['퀘스트 시트', () => UI.openQuests()],
    ['대장간',      () => { UI.closeQuests(); UI.openForgeInfo(); }],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitUiReady(page);

    // 재화를 채워 두지 않으면 칩·알약이 0 으로 죽거나 아예 안 그려지는 자리가 있다.
    await page.evaluate(() => { S.coins = 1e7; S.hammers = 5000; S.tickets = 300; S.potions = 300; S.winders = 5000; S.gems = 900; });

    // 화면을 차례로 열며 그 시점에 살아 있는(보이는) 아이콘을 전부 걷는다.
    const seen = {};   // name → [{screen, url, w, h, bgSize}]
    for (const [label, open] of SCREENS) {
        try { await page.evaluate(open); } catch (e) { errors.push(`${label} 열기 실패: ${e.message}`); continue; }
        await page.waitForTimeout(500);
        const found = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('i.ico')) {
                const cls = [...el.classList].find(c => c.startsWith('ico-'));
                if (!cls) continue;
                const r = el.getBoundingClientRect();
                if (r.width < 0.5 || r.height < 0.5) continue;          // 안 보이는 자리는 세지 않는다
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none') continue;
                out.push({ name: cls.slice(4), url: cs.backgroundImage, w: +r.width.toFixed(2), h: +r.height.toFixed(2), bg: cs.backgroundSize });
            }
            return out;
        });
        for (const f of found) (seen[f.name] = seen[f.name] || []).push(Object.assign({ screen: label }, f));
    }

    // ── 리포트 ──
    let fail = 0;
    const names = Object.keys(seen).sort();
    const multi = names.filter(n => new Set(seen[n].map(s => s.screen)).size > 1);
    console.log(`걷은 아이콘 ${names.length}종 / 그중 두 화면 이상에 나온 것 ${multi.length}종\n`);

    console.log('=== ① 한 이름 = 한 그림 (화면 간 정합) ===');
    for (const n of multi) {
        const urls = new Set(seen[n].map(s => s.url));
        const ok = urls.size === 1;
        if (!ok) fail++;
        const scr = [...new Set(seen[n].map(s => s.screen))].join('·');
        console.log(`  ${ok ? '✓' : '✗'} ${n.padEnd(16)} ${scr}${ok ? '' : ` — 그림 ${urls.size}종으로 갈림!`}`);
    }
    if (!multi.length) console.log('  (두 화면 이상에 걸린 아이콘이 없다 — SCREENS 를 늘릴 것)');

    console.log('=== ② 비율 보존 (contain 규약을 덮어쓴 자리가 없는가) ===');
    const bad = [];
    for (const n of names) for (const s of seen[n]) {
        const b = String(s.bg);
        if (b !== 'contain' && !/^auto/.test(b)) bad.push(`${n}@${s.screen} background-size:${b}`);
    }
    if (bad.length) { fail++; bad.slice(0, 8).forEach(b => console.log('  ✗ ' + b)); }
    else console.log('  ✓ 전 자리 contain — 상자가 정사각이 아니어도 그림은 안 찌그러진다');

    console.log('=== ③ 표시 크기(조형이 읽히는 하한 6px) ===');
    const tiny = [];
    for (const n of names) for (const s of seen[n]) if (Math.min(s.w, s.h) < 6) tiny.push(`${n}@${s.screen} ${s.w}×${s.h}px`);
    if (tiny.length) { fail++; tiny.slice(0, 8).forEach(t => console.log('  ✗ ' + t)); }
    else console.log('  ✓ 전 자리 6px 이상');

    // 참고 덤프 — 크기 차이는 결함이 아니지만, '다르게 보인다'는 인상의 출처라 같이 찍는다.
    console.log('=== (참고) 두 화면 이상에 나온 아이콘의 화면별 표시 크기 ===');
    for (const n of multi) {
        const by = {};
        for (const s of seen[n]) (by[s.screen] = by[s.screen] || []).push(`${s.w}×${s.h}`);
        console.log(`  · ${n.padEnd(16)} ` + Object.entries(by).map(([k, v]) => `${k} ${[...new Set(v)].join(',')}`).join('  |  '));
    }

    console.log(`=== ④ 콘솔 에러 ${errors.length}건 ===`);
    errors.slice(0, 6).forEach(e => console.log('  ! ' + e.slice(0, 160)));
    if (errors.length) fail++;

    console.log(fail ? `\nFAIL — ${fail}개 항목 불통과` : '\nPASS — 전 항목 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
