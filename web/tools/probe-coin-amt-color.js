// 판매 금액 텍스트(`.coin-amt`) 색 실측 — **이너=노랑 · 아웃라인=검정** (사용자 지시 2026-08-20,
// slug `coin-amt-yellow-black`).
//
// 왜 필요한가: 종전 `.coin-amt` 는 `text-shadow: 0 1px 0 var(--olc), …` 를 걸어 뒀는데 `--olc` 가
//   `.equip-cell` 스코프에서만 정의된 변수라 **선언 전체가 무효**였다 — 즉 외곽선이 코드에는 있고
//   화면에는 없었다. 이런 결함은 CSS 를 읽는 것만으로는 '있다'로 보이므로 **화소로** 재야 한다.
//
// 재는 것: 글자 화소를 밝기로 갈라 ① 이너(밝은 쪽)가 노랑인가(R≈G ≫ B) ② 그 둘레에 검정 화소가
//   실제로 있는가(어두운 화소 비율) ③ 이너와 아웃라인의 명도 대비.
// ⚠️ 배경을 단색으로 깔고 그 위에 텍스트만 남긴다 — 초원 위에서 재면 배경 색이 그대로 섞인다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 3 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { timeout: 180000 });

    // 실제 클래스를 그대로 쓰되, 애니메이션·배경만 못박아 색만 남긴다.
    const box = await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = '__coinprobe';
        host.style.cssText = 'position:fixed; left:0; top:0; width:480px; height:200px; background:#3a4d2a; z-index:99999;';
        const t = document.createElement('span');
        t.className = 'coin-amt';
        t.textContent = '+8.88K';
        t.style.cssText = 'left:240px; top:100px; animation:none; opacity:1; transform:translate(-50%,-50%);';
        host.appendChild(t);
        document.body.appendChild(host);
        const r = t.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const pad = 6;
    const shot = await page.screenshot({
        clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 },
    });
    // ⚠️ 이 환경엔 pngjs 가 없다 — 스크린샷을 base64 로 페이지에 넣고 **캔버스로 디코드**해 읽는다
    //    (`probe-face-helmet-clear.js` 가 남긴 같은 함정 기록).
    const data = await page.evaluate(async (b64) => {
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        return Array.from(g.getImageData(0, 0, im.width, im.height).data);
    }, shot.toString('base64'));
    let inner = 0, outline = 0, bg = 0, innerR = 0, innerG = 0, innerB = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // 배경(#3a4d2a = 58,77,42)에서 충분히 벗어난 화소만 글자로 본다
        const dBg = Math.abs(r - 58) + Math.abs(g - 77) + Math.abs(b - 42);
        if (dBg < 40) { bg++; continue; }
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum >= 120) { inner++; innerR += r; innerG += g; innerB += b; }
        else if (lum <= 60) outline++;
    }
    const n = Math.max(1, inner);
    const avg = { r: Math.round(innerR / n), g: Math.round(innerG / n), b: Math.round(innerB / n) };
    // 노랑 = R·G 가 높고 서로 가깝고 B 가 낮다
    const yellow = avg.r >= 200 && avg.g >= 150 && Math.abs(avg.r - avg.g) <= 90 && (Math.min(avg.r, avg.g) - avg.b) >= 70;
    const ringFrac = outline / Math.max(1, inner + outline);
    console.log(`글자 상자 ${box.w.toFixed(1)}x${box.h.toFixed(1)}px · 이너 ${inner}px / 아웃라인 ${outline}px / 배경 ${bg}px`);
    console.log(`① 이너 평균색 rgb(${avg.r},${avg.g},${avg.b})`, yellow ? '✅ 노랑' : '❌ 노랑이 아니다');
    console.log(`② 아웃라인 비율 ${(ringFrac * 100).toFixed(1)}% (글자 화소 중 어두운 것, 하한 12%)`,
        ringFrac >= 0.12 ? '✅ 검정 외곽선이 실재한다' : '❌ 외곽선이 안 그려진다');
    const ok = yellow && ringFrac >= 0.12 && !errs.length;
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    console.log(ok ? '\n판정: PASS' : '\n판정: FAIL');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
