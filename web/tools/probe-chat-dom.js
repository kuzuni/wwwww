// 채팅 화면 클론 DOM 실측 — 원본(shot-043500) 목표치와 나란히 %W로 찍는다.
//
// ⚠️ 이 화면은 원본이 499×804(하단 크롭)이고 클론 앱은 499×892라 **%H가 비교 불가**다.
// 가로폭은 양쪽 499로 같으므로 위치·크기를 전부 **앱 가로폭 대비 %(=%W)**로 환산해 비교한다
// (세로 치수도 %W로 환산하면 화면비와 무관하게 원본 픽셀과 그대로 맞출 수 있다).
//
// 사용: PW_PATH=... node probe-chat-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 실측 목표치(499px 폭 기준 px → %W)
const T = {
    '아바타 좌 인셋': 12.63, '아바타 폭': 8.82, '아바타 높이': 8.82,
    '아바타→말풍선 간격': 0.80,
    '말풍선 좌': 22.24, '말풍선 폭': 64.93, '말풍선 우끝': 87.17,
    '말풍선 높이(1줄)': 5.51, '행 피치': 12.02,
    '입력바 높이': 17.43,
    '입력칸 좌': 11.82, '입력칸 폭': 85.37, '입력칸 높이': 8.62,
    '뒤로버튼 좌': 2.00, '뒤로버튼 폭': 7.21, '뒤로버튼 높이': 5.81,
};

(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { UI.openChat(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.opening').forEach(e => e.classList.remove('opening')));

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width;
        const pw = v => +(v / W * 100).toFixed(2);
        const rows = [...document.querySelectorAll('#chat-modal .chat-row')];
        const r0 = rows[0], r1 = rows[1];
        const q = (el, s) => el.querySelector(s).getBoundingClientRect();
        const av = q(r0, '.chat-avatar'), bw = q(r0, '.chat-bubble-wrap'), bu = q(r0, '.chat-bubble');
        const bar = document.querySelector('#chat-modal .chat-input-bar').getBoundingClientRect();
        const inp = document.querySelector('#chat-modal .chat-input-bar input').getBoundingClientRect();
        const bk = document.querySelector('#chat-modal .chat-input-bar .btn').getBoundingClientRect();
        const cs = getComputedStyle(document.querySelector('#chat-modal .chat-card'));
        return {
            appW: W, appH: app.height, rows: rows.length,
            bg: cs.backgroundColor,
            v: {
                '아바타 좌 인셋': pw(av.left - app.left), '아바타 폭': pw(av.width), '아바타 높이': pw(av.height),
                '아바타→말풍선 간격': pw(bw.left - av.right),
                '말풍선 좌': pw(bu.left - app.left), '말풍선 폭': pw(bu.width), '말풍선 우끝': pw(bu.right - app.left),
                // 행 피치·말풍선 높이는 **전 행 평균**으로 낸다 — 한 행만 재면 한글 행(말풍선이 더 높다)이
                // 걸렸는지에 따라 런마다 ±4px 튄다(비평가 B도 같은 흔들림을 지적).
                '말풍선 높이(1줄)': pw(rows.map(r => r.querySelector('.chat-bubble'))
                    .filter(b => b && b.getBoundingClientRect().height < 46)
                    .reduce((s, b, _, a) => s + b.getBoundingClientRect().height / a.length, 0)),
                '행 피치': rows.length > 1
                    ? pw((rows[rows.length - 1].getBoundingClientRect().top - r0.getBoundingClientRect().top) / (rows.length - 1))
                    : null,
                '입력바 높이': pw(bar.height),
                '입력칸 좌': pw(inp.left - app.left), '입력칸 폭': pw(inp.width), '입력칸 높이': pw(inp.height),
                '뒤로버튼 좌': pw(bk.left - app.left), '뒤로버튼 폭': pw(bk.width), '뒤로버튼 높이': pw(bk.height),
            },
        };
    });

    console.log(`앱 ${m.appW}×${m.appH} · 행 ${m.rows}개 · .chat-card 배경 ${m.bg}`);
    console.log('요소'.padEnd(22) + '원본%W'.padStart(8) + '클론%W'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0;
    for (const k of Object.keys(T)) {
        const c = m.v[k]; if (c == null) continue;
        const d = +(c - T[k]).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        console.log(k.padEnd(22) + String(T[k]).padStart(8) + String(c).padStart(9) + String(d > 0 ? '+' + d : d).padStart(9) + '  ' + (Math.abs(d) <= 2 ? 'OK' : '불통과'));
    }
    console.log(`최대 Δ ${worst}%p · 콘솔 에러 ${errs.length}건`);
    if (errs.length) console.log(errs.slice(0, 5).join('\n'));
    await browser.close();
})();
