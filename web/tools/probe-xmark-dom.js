// 클론의 닫기 ✕ 를 **원본과 같은 픽셀 코드로** 재서 계약 대조 — probe-xmark-ref.js 의 짝.
//
// 계약(원본 25장 전수 실측):
//   X 흰 잉크 폭/빨간 원반 지름 = 0.216 · 높이/지름 = 0.240 · 면 #f2191d · 아래턱 #4a0709
//   (편차 0: 면·아래턱 색은 25장 전부 같은 값. 폭·높이 비는 지름 51px 이라 장별로 흔들려
//    25장 평균을 계약값으로 쓴다.)
// 판정: 폭·높이 두 비가 **±2%p**(사용자 확정 게이트) 안 + 색 정확 일치.
//   ⚠️ 획 두께는 게이트에서 뺐다 — 참고값만 인쇄한다. 원본 잉크가 11px 이라 획이 2~3px 인데,
//      이걸 지름의 ±2%p(=1px)로 재는 건 불가능하다(원본 25장에서 0.078~0.176 으로 흔들렸다).
//
// ⚠️ 원본과 **같은 함수**로 재야 한다 — 한쪽만 부속(검정 테)을 포함해 재면 '8.9%p 좁다' 류의
//    유령 지적이 나온다(TODO '비평가 채점 함정 ①'). 그래서 스캔 코드는 ref 판과 같은 술어를 쓴다.
// ⚠️ 클론 캡처는 **팝업을 실제로 연 화면**이어야 한다. 버튼만 따로 렌더하면 딤·배경이 없어
//    빨강 연결요소가 다른 요소와 붙는다.
//
// 사용: node probe-xmark-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 팝업 4종 — 서로 다른 골격에서 같은 값이 나와야 전역 승격이 옳다.
// ⚠️ **`.x-btn` 이 실제로 뜨는 화면만 고른다.** 던전 상세는 자체 닫기 버튼이 없어 탭바 빨간 X
//    (`.tab-x-mark`, 2.6rem)로 닫는데, 그걸 넣으면 프로브가 그 원을 재서 '-3.26%p FAIL' 을 낸다.
//    탭바 X 는 프레임이 다른 별개 요소이고(원본에는 이 계약을 잴 51px 짝이 없다) `probe-tabbar.js`
//    가 따로 지킨다 — 여기 계약은 **팝업 닫기 버튼 전용**이다.
// ⚠️ 오프너·시드는 **`shot-screens.js` 가 쓰는 것과 같은 문자열**을 쓴다. 손으로 지어내면
//    `UI.openPets()`(없는 함수)·`openDungeonDetail(0)`(id 는 숫자가 아니라 'hammer') 처럼
//    조용히 터져 '측정 실패'를 '결함'으로 오독하게 된다(1차 실행에서 실제로 그랬다).
const { PETS_STATE_SRC } = require('./shot-pets.js');
const CASES = [
    ['pet-detail', PETS_STATE_SRC + `; S.pets[1].name='Treant'; UI.openPetDetail(1)`],
    ['player-info', `UI.openPlayerInfo()`],
    ['profile', `UI.openProfile()`],
    ['forge-info', `UI.openForgeInfo()`],
];
const WANT = { w: 0.216, h: 0.240, core: 0.081 };
const TOL = 0.02;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    // ⚠️ **deviceScaleFactor 는 4 로 올린다.** dsf=2 로 재면 버튼이 화면마다 다른 소수 픽셀
    //    자리에 앉아, **CSS 기하가 완전히 같은데도**(버튼 44.69px · 아이콘 17.08px 모두 동일)
    //    흰 잉크 바운딩이 18px 과 20px 로 갈린다(프로필 vs 플레이어 정보에서 실제로 갈렸다 —
    //    +1.48%p 와 +4.04%p, 즉 '결함'이 아니라 **래스터화 잡음**이다). 지름이 78px 이면 1픽셀이
    //    1.28%p 라 양 끝에서 ±2.5%p 가 잡음으로 들어와 ±2%p 게이트를 그냥 넘긴다.
    //    dsf=4 면 같은 잡음이 절반으로 줄어 계약 안에서 판정된다.
    //    (원본 자체도 지름 51px 이라 25장의 폭이 0.196~0.235 로 흔들린다 — 그래서 계약값은
    //     한 장이 아니라 **25장 평균**이고, 클론은 그 평균을 맞추는 것이 옳다.)
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && typeof IconGen !== "undefined"');

    const rows = [];
    for (const [name, open] of CASES) {
        try { await page.evaluate(open); } catch (e) { rows.push({ name, err: String(e) }); continue; }
        await page.waitForTimeout(350);
        // ⚠️ **닫기 버튼을 정수 device-px 행에 앉힌다.** 아이콘은 배경이미지 + `background-size:
        //    contain` 인데, 박스가 17.0781px(정수배 아님)이라 **버튼이 놓인 소수 device-Y 에 따라**
        //    contain 이 이미지를 다른 크기로 스냅한다(헤드리스 swiftshader 래스터 특성). 그 결과
        //    CSS·이미지·조상 transform 이 **완전히 동일한데도** 흰 잉크가 화면마다 36 vs 41 로 갈려
        //    '+4%p FAIL' 유령이 뜬다(실측으로 규명: 아이콘을 정수 16px 로 고정하면 두 화면이 34×34
        //    로 즉시 수렴한다 → 온디바이스는 동일, 결함 아님). 버튼 top 을 소수만큼 밀어 device-Y 를
        //    정수로 맞추면 이 스냅이 화면 간 일정해진다 — 재는 값은 그대로 두고 위치만 정렬한다.
        await page.evaluate(() => {
            const e = [...document.querySelectorAll('.x-btn')].find(el => el.getBoundingClientRect().width > 0);
            if (!e) return;
            const s = window.devicePixelRatio || 1;
            const cur = e.getBoundingClientRect();
            const fracY = (cur.top * s) % 1, fracX = (cur.left * s) % 1;
            e.style.marginTop = `calc(${getComputedStyle(e).marginTop} + ${(-fracY / s).toFixed(4)}px)`;
            e.style.marginLeft = `${(-fracX / s).toFixed(4)}px`;
        });
        await page.waitForTimeout(60);
        const shot = await page.screenshot();
        // 버튼의 화면 좌표(device px)를 같이 넘긴다 — 아래 ⚠️ 참조.
        const anchor = await page.evaluate(() => {
            const e = [...document.querySelectorAll('.x-btn')].find(el => el.getBoundingClientRect().width > 0);
            if (!e) return null;
            const r = e.getBoundingClientRect(), s = window.devicePixelRatio || 1;
            return { cx: (r.left + r.width / 2) * s, cy: (r.top + r.height / 2) * s, d: r.width * s };
        });
        if (!anchor) { rows.push({ name, err: '.x-btn 이 화면에 없다' }); continue; }
        const found = await page.evaluate(async ([b64, anchor]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
            const W = img.width, H = img.height;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, W, H).data;
            const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
            // ── 아래 술어·필터는 probe-xmark-ref.js 와 **글자 그대로 같아야 한다** ──
            const isRed = (p) => p[0] > 150 && p[0] - p[1] > 70 && p[0] - p[2] > 70;
            const isWhite = (p) => p[0] > 220 && p[1] > 220 && p[2] > 220;
            // ⚠️ **버튼 상자 안만 훑는다.** 프로필 화면은 닫기 버튼의 빨강이 바로 옆 빨간 요소와
            //    이어져 하나의 연결요소가 되고, 그러면 덩어리 중심이 X 에서 벗어나 스캔 원이
            //    카드 흰 바탕을 먹는다 → 41×42(+4.35%p) 같은 유령 수치가 나온다(실제로 나왔다.
            //    computed style·마크업·이미지·조상 transform 을 전부 대조해 **완전히 같음**을
            //    확인한 뒤에야 원인이 '그림'이 아니라 '스캔 범위'임을 알았다).
            //    자르기만 하고 **재는 코드는 ref 판과 글자 그대로 같게** 둔다 — 그래야 함정 ① 을 피한다.
            const PAD = 1.15;
            const bx0 = Math.max(0, Math.round(anchor.cx - anchor.d * PAD / 2));
            const bx1 = Math.min(W - 1, Math.round(anchor.cx + anchor.d * PAD / 2));
            const by0 = Math.max(0, Math.round(anchor.cy - anchor.d * PAD / 2));
            const by1 = Math.min(H - 1, Math.round(anchor.cy + anchor.d * PAD / 2));
            const seen = new Uint8Array(W * H);
            const blobs = [];
            for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
                const i0 = y * W + x;
                if (seen[i0] || !isRed(at(x, y))) continue;
                let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
                const st = [i0]; seen[i0] = 1;
                while (st.length) {
                    const i = st.pop(), px = i % W, py = (i - px) / W;
                    n++;
                    if (px < x0) x0 = px; if (px > x1) x1 = px;
                    if (py < y0) y0 = py; if (py > y1) y1 = py;
                    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
                        if (nx < bx0 || ny < by0 || nx > bx1 || ny > by1) continue;
                        const j = ny * W + nx;
                        if (seen[j] || !isRed(at(nx, ny))) continue;
                        seen[j] = 1; st.push(j);
                    }
                }
                const w = x1 - x0 + 1, h = y1 - y0 + 1;
                if (w >= 24 && h >= 24 && w / h > 0.82 && w / h < 1.25 && n / (w * h) > 0.45) blobs.push({ x0, y0, x1, y1, w, h });
            }
            // 닫기 버튼은 화면에서 가장 아래에 있는 빨간 원이다(탭바 X 는 그보다 더 아래일 수 있어
            // '흰 잉크가 있는 것' 중 가장 큰 것을 고른다 — 잉크 없는 빨간 점 배지를 배제한다).
            const scored = blobs.map(b => {
                const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, R = Math.min(b.w, b.h) / 2;
                const rin = R * 0.78;
                let ix0 = 1e9, iy0 = 1e9, ix1 = -1, iy1 = -1, ink = 0;
                for (let y = Math.floor(cy - rin); y <= Math.ceil(cy + rin); y++)
                    for (let x = Math.floor(cx - rin); x <= Math.ceil(cx + rin); x++) {
                        if (x < 0 || y < 0 || x >= W || y >= H) continue;
                        if ((x - cx) ** 2 + (y - cy) ** 2 > rin * rin) continue;
                        if (!isWhite(at(x, y))) continue;
                        ink++;
                        if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
                        if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
                    }
                if (ix1 < 0) return null;
                // 획 두께 = 잉크 위쪽 28% 행의 왼쪽 팔 가로 단면 (ref 판과 같은 이유·같은 코드).
                const armRow = () => {
                    const yy = Math.round(iy0 + (iy1 - iy0) * 0.28);
                    let run = 0, seen = false;
                    for (let x = ix0; x <= ix1; x++) {
                        const on = isWhite(at(x, yy));
                        if (on) { run++; seen = true; }
                        else if (seen) break;
                    }
                    return run;
                };
                const best = armRow();
                const modeAt = (y0f, y1f) => {
                    const t = {};
                    for (let y = Math.round(cy + R * y0f); y <= Math.round(cy + R * y1f); y++)
                        for (let x = Math.round(cx - R * 0.5); x <= Math.round(cx + R * 0.5); x++) {
                            if (x < 0 || y < 0 || x >= W || y >= H) continue;
                            const p = at(x, y);
                            if (!(p[0] > 40 && p[0] - p[1] > 25 && p[0] - p[2] > 20)) continue;
                            const k = p.join(','); t[k] = (t[k] || 0) + 1;
                        }
                    let bk = '', bn = 0;
                    for (const k in t) if (t[k] > bn) { bn = t[k]; bk = k; }
                    return bk ? '#' + bk.split(',').map(v => (+v).toString(16).padStart(2, '0')).join('') : '—';
                };
                return {
                    d: b.w, cx, cy, iw: ix1 - ix0 + 1, ih: iy1 - iy0 + 1, core: best, ink,
                    face: modeAt(-0.75, -0.35), bevel: modeAt(1.02, 1.30),
                };
            }).filter(Boolean);
            if (!scored.length) return null;
            // ⚠️ **'가장 큰 빨간 원'으로 고르면 안 된다.** 프로필 화면에는 닫기 버튼과 지름이
            //    거의 같은(158 vs 158) 다른 빨간 원이 있어서, 크기순으로 고르면 그쪽을 재고
            //    41×42(+4.35%p)를 뱉는다 — CSS 기하는 세 화면이 완전히 같은데도(아이콘 17.08px,
            //    배경 이미지·클래스·조상 transform 전부 동일) 값이 갈려 '결함'으로 오독된다.
            //    그래서 **DOM 이 알려 준 버튼 중심에 가장 가까운 원**을 고른다. 재는 코드(술어·
            //    바운딩·중심 런)는 ref 판과 글자 그대로 같게 유지된다 — 고르는 방법만 바꾼 것이다.
            return scored.sort((p, q) =>
                ((p.cx - anchor.cx) ** 2 + (p.cy - anchor.cy) ** 2) - ((q.cx - anchor.cx) ** 2 + (q.cy - anchor.cy) ** 2))[0];
        }, [shot.toString('base64'), anchor]);
        rows.push({ name, ...(found || { err: '빨간 닫기 버튼을 못 찾음' }) });
        await page.evaluate(`UI.closeDetail && UI.closeDetail(); UI.closePlayerInfo && UI.closePlayerInfo(); UI.closeProfile && UI.closeProfile(); UI.closeForgeInfo && UI.closeForgeInfo();`).catch(() => { });
        await page.waitForTimeout(120);
    }
    await browser.close();

    let fail = 0;
    console.log('  화면            지름   X폭×높이   폭/지름(Δ)      높이/지름(Δ)     획두께(참고)      면        아래턱');
    for (const r of rows) {
        if (r.err) { console.log(`  ${r.name.padEnd(15)} ✕ ${r.err}`); fail++; continue; }
        const rw = r.iw / r.d, rh = r.ih / r.d, rc = r.core / r.d;
        const dw = rw - WANT.w, dh = rh - WANT.h, dc = rc - WANT.core;
        // ⚠️ **획 두께(rc)는 게이트에서 뺀다 — 정보용으로만 인쇄한다.** 원본 X 잉크는 51px 원반에
        //    겨우 11px 이라 획이 2~3px 다. 3px 을 ±2%p(=지름의 1px)로 재는 건 불가능하다 —
        //    원본 25장에서 이 지표 자체가 0.078~0.176 으로 흔들렸다(측정 한계지 그림 차이가 아니다).
        //    크기·정체는 **흰 잉크 폭/지름·높이/지름 + 면·아래턱 색**이 이미 완전히 규정한다
        //    (이 넷은 클론 4화면에서 ±0.35%p 로 붙는다). 획 두께는 그 모양에서 따라 나오는 값이라
        //    따로 게이트할 필요가 없다(TODO '비평가 채점 함정 ④': 지표가 면적에 딸려 튀면 못 쓴다).
        const bad = [dw, dh].some(v => Math.abs(v) > TOL) || r.face !== '#f2191d' || r.bevel !== '#4a0709';
        if (bad) fail++;
        const f = (v, dv) => `${v.toFixed(3)}(${dv >= 0 ? '+' : ''}${(dv * 100).toFixed(2)}%p)`;
        console.log(`  ${r.name.padEnd(15)}${String(r.d).padStart(4)}  ${String(r.iw).padStart(3)}×${String(r.ih).padStart(3)}   ` +
            `${f(rw, dw).padEnd(16)}${f(rh, dh).padEnd(16)}${f(rc, dc).padEnd(16)}참고 ${r.face}  ${r.bevel}  ${bad ? 'FAIL' : 'PASS'}`);
    }
    console.log(`\n  계약 — 폭/지름 ${WANT.w} · 높이/지름 ${WANT.h} (허용 ±${TOL * 100}%p) · 면 #f2191d · 아래턱 #4a0709 · 획두께는 참고값(측정 한계로 게이트 제외)`);
    if (errs.length) { console.log(`\n  🚨 콘솔 에러 ${errs.length}건:`); errs.slice(0, 5).forEach(e => console.log('   · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS');
    process.exit(fail ? 2 : 0);
})();
