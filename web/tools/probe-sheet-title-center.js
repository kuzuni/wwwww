// 소환 시트 헤더 제목("스킬 15/18")이 **앱 가로 중앙**에 앉는가 — 원본 대조 판정기.
// 사용: PW_PATH=<playwright> node probe-sheet-title-center.js [원본.png] [클론.png]
//
// 🚨 **왜 이 자가 없었나(이 건의 교훈)** — `probe-skills-dom.js` 는 이 화면의 14요소를 ±2%p 로 재고
//    전부 통과인데, 그 표에 **헤더 제목이 아예 없다.** 그래서 제목이 화면 중앙에서 8.5%p 나 밀려
//    있어도 어떤 게이트도 빨개지지 않았다(`probe-equipped-label` 이 '바'만 보고 깃발을 안 봤던 것,
//    `probe-topbar-badge` 가 없어서 타일-알약 겹침을 통째로 못 봤던 것과 **같은 계열의 사각지대**다).
//    지적한 쪽은 비평가였고, 표는 끝까지 초록이었다.
//
// 🔬 **원인**: `.sheet-head { display:flex }` + `.sheet-head .sheet-title { flex:1 }` 이라
//    제목은 **재화 pill 을 뺀 나머지 공간의 중앙**에 앉는다. pill 이 왼쪽에 있으니 제목은
//    그 폭의 절반만큼 오른쪽으로 밀린다. 원본은 pill 이 있든 없든 제목이 **화면 중앙**이다.
//
// ⚠️ **측정 규약** — 원본은 PNG 픽셀, 클론도 **PNG 픽셀**(같은 코드)로 잰다. 제목은 흰 바탕 위
//    검은 글자라 잉크 술어가 잘 통하고, 양쪽 다 '그려진 글자의 바깥 모서리'를 재므로
//    '잉크 대 박스' 편향이 상쇄된다(이 저장소가 `probe-topbar-badge` 에서 쓴 것과 같은 규약).
// ⚠️ **기준계**: 클론 캡처(499x892)는 앱 상자(499x887.1)보다 크고 위아래에 **레터박스 검은 띠**가
//    2.4px 씩 붙는다. 가로는 앱 = 이미지 폭이라 %W 는 그대로 쓴다. **세로는 판정하지 않는다.**
//    (비평가가 이 띠를 '클론 전용 검은 띠'로 지적한 적이 있는데 그건 캡처 프레이밍이지 UI 가 아니다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REF = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042340.png');
const CLONE = process.argv[3] || path.resolve(__dirname, 'ref-cmp/clone/skills.png');
const GATE = 2.0;   // ±2%p — 이 저장소의 레이아웃 게이트

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const url = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

    // 헤더 띠에서 어두운 잉크 덩어리를 뽑는다. 맨 위 잉크 띠 = [재화 pill, 제목] 두 덩어리다.
    const scan = (file) => page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const dark = (x, y) => { const i = (y * W + x) * 4; return (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) < 110; };

        // 상단 14%H 안에서 '어두운 화소가 3개 넘는 행'이 이어지는 띠를 찾는다.
        const top = Math.round(H * 0.14);
        const rowN = [];
        for (let y = 0; y < top; y++) { let n = 0; for (let x = 0; x < W; x++) if (dark(x, y)) n++; rowN.push(n); }
        const bands = []; let s = -1;
        for (let y = 0; y < rowN.length; y++) {
            const on = rowN[y] > 3;
            if (on && s < 0) s = y;
            if (!on && s >= 0) { if (y - s >= 4) bands.push([s, y - 1]); s = -1; }
        }
        if (s >= 0 && rowN.length - s >= 4) bands.push([s, rowN.length - 1]);
        // 레터박스(전폭이 통째로 어두운 띠)는 버린다 — 캡처 프레이밍이지 UI 가 아니다.
        const real = bands.filter(([y0, y1]) => {
            for (let y = y0; y <= y1; y++) if (rowN[y] > W * 0.9) return false;
            return true;
        });
        if (!real.length) return { W, H, err: '헤더 잉크 띠를 못 찾았다' };
        const [y0, y1] = real[0];

        // 그 띠 안의 열 덩어리(가로 간격 12px 이상이면 분리)
        const cols = [];
        for (let x = 0; x < W; x++) { let n = 0; for (let y = y0; y <= y1; y++) if (dark(x, y)) n++; if (n) cols.push(x); }
        const groups = []; let a = cols[0], prev = cols[0];
        for (const x of cols.slice(1)) { if (x - prev > 12) { groups.push([a, prev]); a = x; } prev = x; }
        if (cols.length) groups.push([a, prev]);
        return { W, H, y0, y1, groups };
    }, url(file));

    const R = await scan(REF), C = await scan(CLONE);
    console.log(`원본 ${R.W}x${R.H} · 클론 ${C.W}x${C.H}`);
    for (const [label, m] of [['원본', R], ['클론', C]]) {
        if (m.err) { console.error(`측정기 고장 — ${label}: ${m.err}`); await browser.close(); process.exit(2); }
        console.log(`  ${label} 헤더 띠 y${m.y0}~${m.y1} · 덩어리 ${m.groups.length}개 ` +
            m.groups.map(([x0, x1]) => `[x${x0}~${x1} 중심 ${((x0 + x1) / 2 / m.W * 100).toFixed(2)}%W]`).join(' '));
    }

    // 🔬 자기검증 — 양쪽 다 [pill, 제목] 2덩어리여야 이 자를 쓸 수 있다.
    //    (제목이 pill 과 붙어 한 덩어리로 잡히거나, 배지가 하나 더 끼면 수치를 인쇄하면 안 된다.)
    for (const [label, m] of [['원본', R], ['클론', C]]) {
        if (m.groups.length !== 2) {
            console.error(`측정기 고장 — ${label} 헤더 덩어리가 2개가 아니라 ${m.groups.length}개다(= pill 과 제목이 붙었거나 요소가 더 있다). 수치를 믿지 말 것.`);
            await browser.close(); process.exit(2);
        }
    }

    const ctr = m => { const [x0, x1] = m.groups[1]; return (x0 + x1) / 2 / m.W * 100; };
    const pill = m => { const [x0, x1] = m.groups[0]; return { l: x0 / m.W * 100, w: (x1 - x0 + 1) / m.W * 100 }; };
    const rc = ctr(R), cc = ctr(C), d = cc - rc;
    const rp = pill(R), cp = pill(C);

    console.log('\n===== 대조 (단위 = 각 판 자기 이미지 폭 %) =====');
    console.log(`제목 잉크 가로중심   원본 ${rc.toFixed(2)}%W  vs  클론 ${cc.toFixed(2)}%W   (Δ ${d >= 0 ? '+' : ''}${d.toFixed(2)}%p · 게이트 ±${GATE})  ${Math.abs(d) <= GATE ? 'OK' : '✗'}`);
    console.log(`  · 앱 중앙(50%)에서 원본 ${(rc - 50).toFixed(2)}%p · 클론 ${(cc - 50).toFixed(2)}%p 떨어져 있다`);
    console.log(`재화 pill 좌단(참고)  원본 ${rp.l.toFixed(2)}%W  vs  클론 ${cp.l.toFixed(2)}%W   (Δ ${(cp.l - rp.l >= 0 ? '+' : '')}${(cp.l - rp.l).toFixed(2)}%p)`);
    console.log(`재화 pill 폭(참고)    원본 ${rp.w.toFixed(2)}%W  vs  클론 ${cp.w.toFixed(2)}%W   (Δ ${(cp.w - rp.w >= 0 ? '+' : '')}${(cp.w - rp.w).toFixed(2)}%p)`);
    console.log('  ⚠️ pill 좌단·폭은 **판정하지 않는다** — 재화 pill 의 스킨·기하는 `aaa-skin` 소관이라 여기서 빨간 줄을 세우면 못 닫는다.');

    const ok = Math.abs(d) <= GATE;
    console.log('\n' + (ok ? 'PASS' : `FAIL — 제목 가로중심이 원본 대비 ${d.toFixed(2)}%p 어긋났다`));
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
