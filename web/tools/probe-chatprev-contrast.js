// chatprev-msg-invisible 검증 — 채팅 미리보기 띠를 clip 캡처해 **줄 밴드별 대비를 픽셀로** 잰다.
//
// 🚨 `getComputedStyle(...).backgroundColor` 로는 이 버그가 안 잡힌다: 다크 글래스 스킨이
// `background-image` 만 덮어써서 계산값은 여전히 밝은-스킨의 `rgb(138,138,138)` 로 나오고,
// 그걸로 대비를 재면 3.9:1 처럼 보인다. 실제로 눈에 보이는 건 그 위에 깔린 불투명 다크층이라
// **반드시 캡처된 픽셀**로 재야 한다(이 항목을 오래 놓친 이유).
//
// 판정: 메시지 줄 밴드의 최대 대비 ≥ 4.5:1 이고 대비 3:1 이상 잉크 픽셀이 0%가 아닐 것.
//       회귀로 닉네임 줄이 10:1 대(≥7:1)를 유지할 것.
//
// 사용: node probe-chatprev-contrast.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let bad = 0;
    for (const vp of [{ width: 430, height: 932 }, { width: 360, height: 640 }]) {
        const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
        const errs = [];
        page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
        page.on('pageerror', e => errs.push(String(e)));
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForTimeout(2800);

        // 두 줄 위치를 DOM 에서 받아 캡처 clip 안의 상대 밴드로 환산한다.
        const geo = await page.evaluate(() => {
            const bar = document.getElementById('chat-preview').getBoundingClientRect();
            const g = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top - bar.top, h: r.height, left: r.left - bar.left, w: r.width }; };
            return { bar: { x: bar.x, y: bar.y, width: bar.width, height: bar.height }, name: g('.chat-preview-name'), msg: g('.chat-preview-msg') };
        });
        const shot = (await page.screenshot({ clip: geo.bar })).toString('base64');

        // 캡처를 캔버스로 되읽어 밴드별 최빈색(=배경) 대비 최대 편차색(=잉크)을 찾는다.
        const res = await page.evaluate(async ({ shot, geo, S }) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + shot; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            cv.getContext('2d').drawImage(img, 0, 0);
            const srgb = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
            const lum = p => .2126 * srgb(p[0]) + .7152 * srgb(p[1]) + .0722 * srgb(p[2]);
            const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
            const band = box => {
                // 글자 상자 안쪽만 본다(줄 사이 여백·아이콘·배지를 피한다).
                const y0 = Math.round((box.top + box.h * .15) * S), y1 = Math.round((box.top + box.h * .85) * S);
                const x0 = Math.round(box.left * S), x1 = Math.round((box.left + box.w) * S);
                const d = cv.getContext('2d').getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
                const hist = new Map(), px = [];
                for (let i = 0; i < d.length; i += 4) {
                    const p = [d[i], d[i + 1], d[i + 2]];
                    px.push(p);
                    const k = p.join(','); hist.set(k, (hist.get(k) || 0) + 1);
                }
                const bg = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
                let ink = bg, max = 1, inkPx = 0;
                for (const p of px) { const c = contrast(p, bg); if (c > max) { max = c; ink = p; } if (c >= 3) inkPx++; }
                return { bg, ink, max, pct: px.length ? inkPx / px.length * 100 : 0 };
            };
            return { name: band(geo.name), msg: band(geo.msg) };
        }, { shot, geo, S: 2 });

        const show = (label, r) => console.log(`  ${label}: 배경 rgb(${r.bg}) · 잉크 rgb(${r.ink}) · 최대대비 ${r.max.toFixed(2)}:1 · 대비3+ 잉크픽셀 ${r.pct.toFixed(2)}%`);
        console.log(`\n[${vp.width}×${vp.height}]`);
        show('닉네임 줄', res.name);
        show('메시지 줄', res.msg);
        const ok = res.msg.max >= 4.5 && res.msg.pct > 0 && res.name.max >= 7;
        if (!ok) bad++;
        console.log(`  → ${ok ? 'PASS' : 'FAIL'} (메시지 ≥4.5:1 & 잉크>0% , 닉네임 ≥7:1 회귀) · 콘솔에러 ${errs.length}건`);
        if (errs.length) console.log('  errs:', errs.slice(0, 3));
        await page.close();
    }
    await browser.close();
    console.log(bad ? `\n총평: FAIL (${bad} 뷰포트)` : '\n총평: PASS (전 뷰포트)');
    process.exit(bad ? 1 : 0);
})();
