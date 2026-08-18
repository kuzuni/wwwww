// 아바타 **프레임**(타일) 실측 — 도트 초상 자체가 아니라 그것이 앉는 흰 타일의 크기·색을 잰다.
//
// 왜: 초상을 아무리 원본처럼 그려도 타일이 어두운 원이면(상단바가 실제로 그랬다) 화면에서는
// 전혀 다른 물건으로 보인다. 원본 실측값(아래 EXPECT)과 앱 폭 대비 %로 비교해 ±2%p 를 넘는
// 프레임을 집어낸다. 원본 근거는 각 항목의 shot / 좌표를 주석에 적어 두었다.
//
// 사용: node tools/probe-avatar-frames.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const APP_W = 499;

// [셀렉터, 이름, 원본 폭%W, 원본 면색, 여는 코드]
const EXPECT = [
    ['.profile-card .avatar', '상단바', 8.62, '#ffffff', ''],                        // shot-043224 x18..60 y12..54 = 43px
    ['.league-avatar', '리그 행', 8.84, '#ffffff', 'UI.openLeague()'],               // shot-042149 x127..171 · y331..374 = 44px
    ['.league-challenge-avatar', '리그 도전', 9.26, '#ffffff', 'UI.openLeague(); UI.openLeagueChallenge()'],
    ['.profile-avatar-big', '프로필 큰칸', 13.20, '#ffffff', 'UI.openProfile()'],    // shot-042724 x97..163 · y211..274 = 65px
    ['.chat-avatar', '채팅', 8.82, '#ffffff', 'UI.openChat()'],                      // shot-043500 x63..107 = 44px
    ['.pinfo-id .avatar', '플레이어정보', 8.87, '#ffffff', 'UI.openPlayerInfo && UI.openPlayerInfo()'],  // shot-043313 x91..134 = 44px
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: APP_W, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els, null, { timeout: 150000 });

    const bad = [], rows = [];
    for (const [sel, name, wantW, wantBg, open] of EXPECT) {
        /* ⚠️ `getBoundingClientRect` 로 재면 안 된다 — `.modal` 열림 연출이 `scale(.7)` 에서 시작하는데
           rect 는 **변환 후** 크기라 실제 폭의 70% 가 나온다(첫 실행에서 채팅 44px 을 30.8px 로 읽어
           멀쩡한 자리 4곳에 '±2%p 초과'를 냈다. 값이 하나같이 정확히 0.7배인 게 단서였다).
           `offsetWidth` 는 변환 이전의 레이아웃 크기라 연출 타이밍과 무관하게 항상 맞는다. */
        await page.evaluate(([open]) => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
            if (open) { try { new Function(open)(); } catch (e) { } }
        }, [open]);
        await page.waitForTimeout(250);
        const r = await page.evaluate(([sel]) => {
            const el = document.querySelector(sel);
            if (!el) return { err: '요소 없음' };
            const cs = getComputedStyle(el);
            const ico = el.querySelector('.ico.av-ico');
            return {
                w: el.offsetWidth, h: el.offsetHeight, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, bw: cs.borderTopWidth,
                hasIco: !!ico, icoFill: ico ? +(ico.offsetWidth / el.offsetWidth * 100).toFixed(1) : 0,
                rend: ico ? getComputedStyle(ico).imageRendering : '',
                emojiText: el.textContent.trim(),
            };
        }, [sel]);
        if (r.err) { bad.push(`${name}: ${r.err}`); continue; }
        const gotW = r.w / APP_W * 100, d = gotW - wantW;
        const hex = (function (s) {
            const m = s.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : s;
        })(r.bg);
        rows.push(`  ${name.padEnd(7)} ${gotW.toFixed(2)}%W (원본 ${wantW}%, Δ${d >= 0 ? '+' : ''}${d.toFixed(2)}%p) · 면 ${hex} · 비율 ${(r.w / r.h).toFixed(2)} · 초상 ${r.hasIco ? r.icoFill + '%' : '없음'} · rendering:${r.rend}`);
        if (Math.abs(d) > 2) bad.push(`${name} 폭 ${gotW.toFixed(2)}%W — 원본 ${wantW}% 대비 ${d.toFixed(2)}%p (±2%p 초과)`);
        if (Math.abs(r.w - r.h) > 1.5) bad.push(`${name} 타일이 정사각이 아니다 (${r.w.toFixed(1)}×${r.h.toFixed(1)})`);
        if (hex !== wantBg) bad.push(`${name} 면색 ${hex} — 원본 ${wantBg}`);
        if (!r.hasIco) bad.push(`${name} 에 도트 초상(.av-ico)이 없다 — 이모지 글자가 남았을 수 있다`);
        if (r.hasIco && r.rend !== 'pixelated') bad.push(`${name} image-rendering:${r.rend} — pixelated 가 아니면 도트가 뭉개진다`);
        if (r.emojiText) bad.push(`${name} 에 이모지 텍스트가 남아 있다: ${r.emojiText}`);
    }

    console.log('아바타 프레임 실측 (앱 폭 ' + APP_W + 'px 기준)');
    rows.forEach(l => console.log(l));
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(bad.length ? '\nFAIL — ' + bad.join('\n       · ') : '\nPASS — 6자리 전부 원본 프레임과 ±2%p 이내 · 흰 면 · 도트 초상 · pixelated · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
