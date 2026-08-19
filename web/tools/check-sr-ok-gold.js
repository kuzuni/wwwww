// 소환 결과 팝업 [확인] 버튼이 **금색 스킨을 유지한다** 회귀 검사 — `sr-ok-gold-skin-lost`
// (2026-08-19 QA 플레이 세션 등재)
//
// 배경: `.sr-ok` 는 `background:` 단축으로 금색을 주는데, 뒤쪽 AAA 버튼 스킨 4블록의
//       `background-image`(선택자 0-4-0)가 그걸 덮어 **금색만 사라지고 금색 전용 짙은 갈색
//       글자(#2a1c04)만 남았다** — 실측 명암비 2.09:1 로 사실상 안 읽혔다.
//
// 검증 항목:
//  ① `background-image` 가 **`.sr-ok` 의 금색 그라디언트**다 (강철/파란 유리막이 아니다)
//  ② 잉크/바탕 평균 명암비 ≥ 3:1 (큰 글자 최소선. 등재 메모의 실측 2.09:1 이 이 선을 못 넘겼다)
//  ③ 버튼 면이 **금색 계열**이다 — 눈대중 방지로 색상각(hue)과 채도까지 잰다
//  ④ 콘솔/페이지 에러 0
//
// ⚠️ **버튼이 다 커진 뒤에 잰다** (등재 메모의 경고): `.sr-ok` 는 `srpop` 애니메이션으로 최종
//    크기가 되므로, 그 전에 재면 rect 가 0×0 이거나 0.3배라 판정이 통째로 무효다. 여기서는
//    **rect 가 두 프레임 연속 같은 값**일 때까지 기다린 뒤 캡처한다.
//
// 사용: node check-sr-ok-gold.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const srgb = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
const lum = ([r, g, b]) => .2126 * srgb(r) + .7152 * srgb(g) + .0722 * srgb(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
// RGB → HSL 의 색상각/채도만 (금색 판정용)
const hs = ([r, g, b]) => {
    const R = r / 255, G = g / 255, B = b / 255;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn, l = (mx + mn) / 2;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return { h, s, l };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail ? ' (' + detail + ')' : ''));
    };

    // 소환 결과 팝업을 연출 끝난 상태(.done)로 세운다 — [확인] 버튼은 그때만 표시된다.
    const opened = await page.evaluate(async () => {
        // 소환 재화는 종류별로 다른 필드다(state.js:77) — 스킬 `tickets` · 펫 `eggCurrency` ·
        // 탈것 `winders`. 하나만 채우면 버튼이 `.disabled` 라 클릭이 아무 일도 안 한다.
        S.gems = 999999; S.tickets = 99999; S.eggCurrency = 99999; S.winders = 99999;
        UI.onTabClick('summon');
        UI.switchSummonSub('skills');
        await new Promise(r => setTimeout(r, 300));
        // 실제 소환 경로를 태운다 — 버튼 마크업을 손으로 짜면 진짜 규칙이 안 걸린다(함정 ④).
        const btns = [...document.querySelectorAll('#panel-summon button')].filter(b => /소환/.test(b.textContent));
        if (!btns.length) return { err: '소환 버튼 없음' };
        btns[0].click();
        const m = document.getElementById('summon-result-modal');
        for (let i = 0; i < 60 && (!m || m.classList.contains('hidden')); i++) await new Promise(r => setTimeout(r, 100));
        if (!m || m.classList.contains('hidden')) return { err: '결과 팝업이 안 떴다' };
        // ⚠️ 리빌 틱(`tickSummonResult`)은 `requestAnimationFrame` 으로 돈다 — 헤드리스
        //    swiftshader 에서는 사실상 안 흘러(TODO '함정 ③' 과 같은 뿌리) `.done` 이 영영 안 붙는다.
        //    그래서 **종료 지점만** 코드로 직접 태운다. 검사 대상인 [확인] 버튼 자체는 진짜 렌더
        //    경로(ui.js:455 `<button class="btn sr-ok">`)가 만든 그 노드라, 적용되는 CSS 규칙은
        //    실기와 같다(함정 ④ '자가 코드보다 낡으면 무효' 를 피하려고 마크업을 손으로 안 짰다).
        if (!m.classList.contains('done')) UI.finishSummonResult();
        await new Promise(r => setTimeout(r, 200));
        const ok = !m.classList.contains('hidden') && m.classList.contains('done');
        return { err: ok ? null : '결과 팝업이 .done 까지 안 갔다' };
    });
    check('준비 — 소환 결과 팝업(.done)', !opened.err, opened.err || '');
    if (opened.err) { await browser.close(); process.exit(1); }

    // ⚠️ srpop 이 끝날 때까지 — rect 가 두 프레임 연속 같아질 때까지 기다린다
    const settle = await page.evaluate(async () => {
        const el = document.querySelector('.sr-ok');
        if (!el) return { err: '.sr-ok 없음' };
        let prev = null, stable = 0;
        for (let i = 0; i < 300; i++) {
            const r = el.getBoundingClientRect();
            const key = [r.x, r.y, r.width, r.height].map(v => v.toFixed(2)).join(',');
            stable = (key === prev) ? stable + 1 : 0;
            prev = key;
            if (stable >= 2 && r.width > 8 && r.height > 8) {
                const cs = getComputedStyle(el);
                return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, bgImg: cs.backgroundImage, bgCol: cs.backgroundColor, color: cs.color, frames: i };
            }
            // ⚠️ 여기서 `requestAnimationFrame` 을 쓰면 안 된다 — 헤드리스 swiftshader 에서는 rAF 가
            //    거의 안 흘러 300회 대기가 수 분이 된다(실제로 이 판정기가 그렇게 매달렸다).
            //    `srpop` 은 .32s 짜리 CSS 애니메이션이라 타이머로 재도 굳는 시점은 같다.
            await new Promise(r2 => setTimeout(r2, 32));
        }
        return { err: 'rect 가 안 굳었다(srpop 미종료)' };
    });
    check('준비 — 버튼 rect 가 굳었다', !settle.err, settle.err || `${settle.rect.w.toFixed(1)}×${settle.rect.h.toFixed(1)} @${settle.frames}프레임`);
    if (settle.err) { await browser.close(); process.exit(1); }

    // ── ① background-image 가 .sr-ok 의 금색 그라디언트인가 ──
    console.log('① 적용된 background-image');
    const goldish = /rgb\(\s*255,\s*232,\s*154\s*\)|#ffe89a/i.test(settle.bgImg) && /rgb\(\s*232,\s*160,\s*21\s*\)|#e8a015/i.test(settle.bgImg);
    check('금색 그라디언트가 살아 있다', goldish, settle.bgImg.slice(0, 110));
    check('강철/파란 유리막이 안 덮었다', !/228,\s*244,\s*255|190,\s*226,\s*255/.test(settle.bgImg), settle.bgImg.slice(0, 90));

    // ── 버튼만 크롭해 잉크/바탕 평균색 실측 ──
    const buf = await page.screenshot({ clip: { x: settle.rect.x, y: settle.rect.y, width: settle.rect.w, height: settle.rect.h } });
    const px = await page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getContext ? null : null;
        const data = g.getImageData(0, 0, c.width, c.height).data;
        // 테두리/턱을 빼고 안쪽 76% 만 본다 — 바깥 테는 버튼면도 잉크도 아니다
        const x0 = Math.floor(c.width * .12), x1 = Math.ceil(c.width * .88);
        const y0 = Math.floor(c.height * .12), y1 = Math.ceil(c.height * .88);
        const lums = [], pxs = [];
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * c.width + x) * 4;
            const rgb = [data[i], data[i + 1], data[i + 2]];
            pxs.push(rgb);
            lums.push(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
        }
        // 잉크/바탕 가르기는 **퍼센타일로 하면 안 된다** — 이 버튼의 면은 위아래로 흐르는
        // 그라디언트라, '어두운 20%' 를 잉크로 잡으면 글자가 아니라 **그라디언트 아래쪽 띠**를
        // 집는다(실측: 그렇게 재면 rgb(210,152,29) vs rgb(255,212,93) = 1.80:1 이 나와, 금색이
        // 멀쩡히 복원됐는데도 불통과로 보였다). 글자 획은 면적이 5~8% 뿐이라 어떤 고정 퍼센타일도
        // 못 맞춘다. TODO '함정 ③ 지표가 면적에 딸려 움직이는지 볼 것' 과 같은 종류의 함정이다.
        // → **Otsu 이진화**로 두 무리를 데이터가 정하게 한다(문턱을 손으로 안 정한다).
        const hist = new Array(256).fill(0);
        for (const v of lums) hist[Math.min(255, Math.round(v))]++;
        const total = lums.length;
        let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, best = -1, thr = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t]; if (!wB) continue;
            const wF = total - wB; if (!wF) break;
            sumB += t * hist[t];
            const between = wB * wF * Math.pow(sumB / wB - (sum - sumB) / wF, 2);
            if (between > best) { best = between; thr = t; }
        }
        const inkI = [], faceI = [];
        lums.forEach((v, i) => (v <= thr ? inkI : faceI).push(i));
        const avg = list => [0, 1, 2].map(k => Math.round(list.reduce((s, i) => s + pxs[i][k], 0) / list.length));
        return { ink: avg(inkI), face: avg(faceI), thr, inkPct: +(inkI.length / total * 100).toFixed(1), n: total };
    }, buf.toString('base64'));

    // ── ② 명암비 ──
    console.log('② 잉크/바탕 명암비');
    const cr = contrast(px.ink, px.face);
    // ⚠️ 명암비만으로는 이 버그를 못 잡는다 — **수정 전(강철 스킨)에도 4.78:1 이 나온다.** 그때
    //    Otsu 는 글자가 아니라 **버튼면 위쪽 광택 vs 아래쪽 그늘**을 갈랐고(잉크 면적 52.1%),
    //    회색끼리도 명암비는 얼마든지 나온다. 그래서 '어두운 무리가 정말 글자인가' 를 면적으로
    //    먼저 못 박는다: 단색 면 위의 '확인' 두 글자는 안쪽 크롭의 1~25% 다(수정 후 실측 3.1%).
    //    이 가드가 없으면 ② 는 깨진 상태를 통과시키는 헛게이트다.
    check('어두운 무리가 글자다(면적 1~25%)', px.inkPct >= 1 && px.inkPct <= 25,
        `잉크 면적 ${px.inkPct}% — 25% 를 넘으면 면이 단색이 아니라 글자를 못 가른 것이다`);
    check('명암비 ≥ 3:1', cr >= 3, `${cr.toFixed(2)}:1 — 잉크 rgb(${px.ink}) vs 면 rgb(${px.face}) · Otsu 문턱 ${px.thr} · 잉크 면적 ${px.inkPct}% · ${px.n}px`);

    // ── ③ 면이 금색 계열인가 (눈대중 방지) ──
    console.log('③ 버튼 면이 금색 계열');
    const f = hs(px.face);
    check('색상각이 금/노랑 대역(30~60°)', f.h >= 30 && f.h <= 60, `h=${f.h.toFixed(1)}°`);
    check('채도가 충분(≥.45)', f.s >= .45, `s=${f.s.toFixed(2)} (회색 스킨이면 0 에 가깝다)`);

    // ── ④ 에러 ──
    console.log('④ 콘솔/페이지 에러');
    check('에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

    await browser.close();
    console.log(fails.length ? `\n❌ FAIL ${fails.length}건\n - ` + fails.join('\n - ') : '\n✅ ALL PASS');
    process.exit(fails.length ? 1 : 0);
})();
