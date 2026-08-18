// 빈 장비 칸 실루엣 검증 — 새 세이브로 처음 켠 화면이 바로 이 상태라 눈에 띄는 자리다.
// ⑴ 8칸 전부 코드 생성 아이콘(이모지 잔여 0) ⑵ 아이콘이 칸의 85~95% 를 채운다(항목 ⑤)
// ⑶ 아이콘에 실제 dataURL 배경이 있다(img() 의 조용한 실패 차단) ⑷ 콘솔 에러 0
// ⑸ **도넛 아이콘의 구멍이 실제로 뚫려 있다** (2026-08-18 추가)
//
// 🚨 ⑸ 를 왜 넣었나: ⑵ 의 '채움 %' 는 **아이콘 요소의 CSS 상자 크기 ÷ 칸 크기**라 8칸이 전부
//    똑같이 88% 로 나온다 — **그림 내용을 전혀 안 본다.** 그래서 `slot_ring` 이 구멍 없는 금 원판
//    으로 그려지는 동안에도 이 프로브는 계속 PASS 였다(원인: `plate` 헬퍼가 블록 두 곳에 복사돼
//    있었고 evenodd 수정이 한쪽에만 들어갔다). 상자를 재는 자는 그림이 틀린 걸 못 잡는다.
// 사용: PW_PATH=... node probe-empty-slots.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(1100);
    // 장비를 전부 비워 빈 칸 상태를 만든다(새 세이브와 같은 화면)
    await page.evaluate(() => { S.equipment = {}; UI.renderEquipSheet(); });
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => {
        const EMO = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u;
        return [...document.querySelectorAll('.equip-cell.empty .cell-img.dim')].map(cell => {
            const i = cell.querySelector('.ico');
            const cb = cell.getBoundingClientRect();
            return {
                cls: i ? i.className.replace('ico ', '') : null,
                fill: i ? +(i.getBoundingClientRect().width / cb.width * 100).toFixed(1) : 0,
                bg: i ? getComputedStyle(i).backgroundImage.startsWith('url("data:') : false,
                emoji: EMO.test(cell.textContent),
            };
        });
    });

    // ⑸ 도넛 구멍 — 아이콘 dataURL 을 디코드해 '구멍 자리'와 '띠 자리'의 픽셀을 비교한다.
    //    구멍이 안 뚫리면 둘이 같은 금색이 된다(원판). 뚫려 있으면 투명하거나 뒤 물체 색이다.
    const donut = await page.evaluate(async () => {
        // [아이콘, 구멍 중심(x,y), 띠 위 한 점(x,y)] — 좌표는 draw 함수의 설계값(0~1)
        const SPEC = [
            // ⚠️ '띠 위 한 점'은 반드시 **본체 그라디언트가 칠해진 자리**여야 한다. 반지에서 위쪽
            //    (0.50, 0.338)을 찍었더니 그건 밴드가 아니라 **파란 보석**이라, 구멍이 금색으로
            //    메워져 있어도 '색이 다르다'가 되어 버그를 통과시켰다. 밴드 옆구리를 찍는다.
            ['slot_ring', [0.50, 0.605], [0.50 + 0.267, 0.605]],   // 밴드 안쪽 구멍 / 밴드 옆구리
            // 벨트도 같은 이유로 **같은 y(=같은 그라디언트 행)** 의 버클 띠를 찍는다. 위/아래를 찍으면
            //    세로 그라디언트라 색이 저절로 달라져, 구멍이 메워져 있어도 차가 벌어진다(실측 93).
            ['slot_belt', [0.50, 0.512], [0.375, 0.512]],          // 버클 가운데 / 같은 높이의 버클 띠
        ];
        const out = [];
        for (const [name, hole, band] of SPEC) {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = IconGen.url(name); });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
            const d = cx.getImageData(0, 0, c.width, c.height).data;
            const at = ([u, v]) => {
                const i = (Math.round(v * c.height) * c.width + Math.round(u * c.width)) * 4;
                return [d[i], d[i + 1], d[i + 2], d[i + 3]];
            };
            const h = at(hole), b = at(band);
            // 같은 색이면 구멍이 본체 그라디언트로 메워진 것 — 채널 최대차로 본다.
            const diff = Math.max(...[0, 1, 2].map(i => Math.abs(h[i] - b[i])));
            out.push({ name, hole: h, band: b, diff, holeAlpha: h[3] });
        }
        return out;
    });
    donut.forEach(x => console.log(`  ${x.name.padEnd(20)} 구멍 rgba(${x.hole}) / 띠 rgba(${x.band}) → 차 ${x.diff}`));

    const bad = [];
    donut.forEach(x => {
        // 뚫렸다 = 구멍이 완전 투명이거나(뒤에 아무것도 없다) 띠와 확연히 다른 색이다(뒤 물체가 비친다)
        if (!(x.holeAlpha === 0 || x.diff >= 40)) {
            bad.push(`${x.name} 구멍이 안 뚫렸다 — 구멍(${x.hole}) 이 띠(${x.band}) 와 사실상 같은 색(차 ${x.diff})`);
        }
    });
    r.forEach(x => console.log(`  ${(x.cls || 'EMOJI!').padEnd(20)} 채움 ${x.fill}%  그림=${x.bg}  이모지잔여=${x.emoji}`));
    if (r.length !== 8) bad.push(`빈 칸이 8개가 아니다 (${r.length})`);
    if (r.some(x => !x.cls)) bad.push('아이콘이 없는 칸이 있다');
    if (r.some(x => x.emoji)) bad.push('이모지가 남아 있는 칸이 있다');
    if (r.some(x => !x.bg)) bad.push('그림이 안 붙은 아이콘이 있다');
    if (r.some(x => x.fill < 85 || x.fill > 95)) bad.push('채움 비율이 85~95% 밖인 칸이 있다: ' + r.map(x => x.fill).join(','));
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 8칸 전부 코드 생성 아이콘 · 채움 88% · 도넛 구멍 뚫림 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
