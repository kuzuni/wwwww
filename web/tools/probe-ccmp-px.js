// 제작 비교 팝업(shot-043224 / craft-compare) 요소 실측 — **원본 PNG 와 클론 캡처를 같은 픽셀
// 코드로** 재서 %W/%H 로 대조한다(전 UI 비율 전수 검증 패스, `ui-ratio-audit`).
//
// 원본 구조(2026-08-18 픽셀 스캔으로 확정 — 눈대중과 달랐다):
//   · 현재 장비(위)는 **키라인 박스가 없다** — 흰 카드 위에 타일+글자가 바로 앉는다(y400~560
//     어두운 가로줄 0행).
//   · 회색 패널은 **#bebebe(190,190,190)** 이고 x90~414 · y548~767 — 새 장비만이 아니라
//     **[판매]/[장착] 버튼 두 개까지 품고** 카드 하단 8px 앞까지 내려간다. 클론(#ececec ·
//     버튼이 패널 밖 흰 바탕)과 구조가 달랐던 자리다.
//   · 앱 폭 = 이미지 폭(502) — 탭바 어두운 행이 x1~501 전폭(러너가 매 실행 재검사한다).
//
// 오프너는 shot-screens.js 의 craft-compare 경로를 재현하되, 카드 내용을 **원본과 같은 꼴로
// 고정**한다(gear-detail 프로브와 같은 이유·같은 처방 — `Forge.rollItem()` 의 랜덤 이름이 두 줄로
// 감기면 카드 높이가 줄 단위로 튀어 판정이 런마다 뒤집힌다). 원본(043224)은 위 카드 이름 1줄 ·
// 주스탯 1줄 · 서브 2줄, 아래 카드 이름 1줄 · 주스탯 1줄 · 서브 2줄 · '새로운!' 태그 · 별 1 이다.
//
// 사용: PW_PATH=<playwright> node tools/probe-ccmp-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-043224.png');
const TOL = 2;   // ±2%p (사용자 확정 통과 기준)

// 두 이미지에 똑같이 적용하는 측정기 — 진짜 함수로 두고 함수째 넘긴다(문자열이면 인자가 안 붙는다).
const MEASURE = (async (srcs) => {
    const out = [];
    for (const src of srcs) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        // 자기검증 ①: 앱 폭 = 이미지 폭 (탭바 어두운 행이 전폭인가) — 아니면 %W 자가 통째로 틀어진다.
        {
            const y = H - 30;
            let f = -1, l = -1;
            for (let x = 0; x < W; x++) { const p = at(x, y); if (Math.max(...p) <= 70) { if (f < 0) f = x; l = x; } }
            if (f > 3 || l < W - 4) { out.push({ err: `앱 폭≠이미지 폭 (탭바 x${f}~${l} / W${W})` }); continue; }
        }
        // 흰 카드 = 최대 4-연결 흰 성분(행 단위 판정은 이 카드 계열에서 두 번 틀렸다 — geardetail 프로브 주석 참조).
        // 🚨 문턱 238→215 (2026-08-19): ui-quality-up 팝업 카드 스킨의 하단 그늘(rgba(0,0,0,.08~.14))이
        //    카드 아래쪽 흰 여백을 255→219까지 눌러, 238 문턱에서는 카드 성분이 y~662에서 끊기고
        //    (실제 bottom ~775) yBtn 밴드가 새 장비 타일을 물어 '버튼을 못 잡음(red 46·blue 2310)'이
        //    났다. 215면 그늘 밑까지 이어지고, 클론 패널(#ececec 236)이 흰 성분에 합쳐져도 패널은
        //    카드 안쪽이라 카드 bbox는 안 변한다(패널 자체는 별도 gray 술어로 다시 잡는다).
        const white = (x, y) => { const p = at(x, y); return p[0] >= 215 && p[1] >= 215 && p[2] >= 215 && (Math.max(...p) - Math.min(...p)) <= 10; };
        const lab = new Int32Array(W * H).fill(-1);
        let bestId = -1, bestN = 0; const comp = [];
        for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
            const i0 = y0 * W + x0;
            if (lab[i0] !== -1 || !white(x0, y0)) continue;
            const id = comp.length, st = [i0];
            lab[i0] = id;
            let n = 0, minY = H, maxY = -1;
            while (st.length) {
                const i = st.pop(); n++;
                const x = i % W, y = (i - x) / W;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (x > 0 && lab[i - 1] === -1 && white(x - 1, y)) { lab[i - 1] = id; st.push(i - 1); }
                if (x < W - 1 && lab[i + 1] === -1 && white(x + 1, y)) { lab[i + 1] = id; st.push(i + 1); }
                if (y > 0 && lab[i - W] === -1 && white(x, y - 1)) { lab[i - W] = id; st.push(i - W); }
                if (y < H - 1 && lab[i + W] === -1 && white(x, y + 1)) { lab[i + W] = id; st.push(i + W); }
            }
            comp.push({ id, n, minY, maxY });
            if (n > bestN) { bestN = n; bestId = id; }
        }
        if (bestId < 0) { out.push({ err: '카드를 못 찾음' }); continue; }
        const cc = comp[bestId];
        // 좌/우는 행별 첫/마지막의 **최빈값** — '장착됨' 리본이 카드 왼쪽으로 돌출한 행을 걸러낸다.
        const firsts = [], lasts = [];
        for (let y = cc.minY; y <= cc.maxY; y++) {
            let first = -1, last = -1;
            for (let x = 0; x < W; x++) if (lab[y * W + x] === bestId) { if (first < 0) first = x; last = x + 1; }
            if (first >= 0) { firsts.push(first); lasts.push(last); }
        }
        const mode = (arr) => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
        const card = { left: mode(firsts), right: mode(lasts), top: cc.minY, bottom: cc.maxY + 1 };
        // 회색 패널 = 카드 안 최대 무채색(밝기 175~210) 성분. 원본도 클론도 지금은 #bebebe(190)다
        // (클론이 원본 팔레트로 이행 — DOM 실측 rgb(190,190,190)·인셋 7.2px/쪽 = 원본 7px 일치).
        // 🚨 상한 236→210 (2026-08-19): 팝업 카드 스킨의 하단 그늘이 카드 흰 여백을 219~236 무채색으로
        //    만들어, 236 상한이면 그 여백이 패널 성분에 합쳐져 '패널 폭 +2.39%p' 가짜 초과가 난다.
        const gray = (p) => { const mx = Math.max(...p), mn = Math.min(...p); return mx - mn <= 8 && mn >= 175 && mx <= 210; };
        const inCard = (x, y) => x > card.left && x < card.right - 1 && y > card.top && y < card.bottom - 1;
        const grow = (pred, x1b, x2b, y1b, y2b) => {
            const seen = new Int32Array(W * H).fill(-1);
            let best = null, cid = 0;
            for (let y0 = y1b; y0 < y2b; y0++) for (let x0 = x1b; x0 < x2b; x0++) {
                const i0 = y0 * W + x0;
                if (seen[i0] !== -1 || !pred(at(x0, y0))) continue;
                const id = cid++, st = [i0];
                seen[i0] = id;
                let n = 0, x1 = W, x2 = -1, y1 = H, y2 = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (!inCard(nx, ny) || ny < y1b || ny >= y2b) continue;
                        const ni = ny * W + nx;
                        if (seen[ni] === -1 && pred(at(nx, ny))) { seen[ni] = id; st.push(ni); }
                    }
                }
                if (!best || n > best.n) best = { n, x1, x2: x2 + 1, y1, y2: y2 + 1 };
            }
            return best;
        };
        const panel = grow(gray, card.left, card.right, card.top, card.bottom);
        // 버튼: 카드 하부 40%에서 빨강([판매])·파랑([장착]) 최대 성분 — 위쪽 제한은 새 장비 타일이
        // 시대색(파랑일 수 있음)이라 버튼과 헷갈리는 것을 막는다.
        const yBtn = Math.round(card.top + (card.bottom - card.top) * 0.6);
        // 🚨 2026-08-19 술어 완화 — ui-quality-up 버튼 광택 밴드(상단 흰 그라디언트 + 하단 그늘)가
        //    클론 버튼의 절대값을 흔들어(위쪽 r 상승·아래쪽 b 하강) 절대 임계식이 red 21px·blue 72px
        //    로 죽었다(2000 미달). 채널 '차이' 기반으로 바꿔 원본(민채움)과 클론(광택) 둘 다 문다.
        //    red 는 흰 오버레이가 r−g 차이를 가장 빨리 죽인다(0.6 흰 위 (246,175,172): r−g 71) — 문턱 50.
        const red = grow(p => p[0] > 170 && p[0] - p[1] > 50 && p[0] - p[2] > 50, card.left, card.right, yBtn, card.bottom);
        const blue = grow(p => p[2] > 150 && p[2] - p[0] > 60 && p[2] - p[1] > 40, card.left, card.right, yBtn, card.bottom);
        // 자기검증 ②: 패널이 카드 폭 절반도 안 되거나 버튼이 없으면 측정기 고장이다 — 수치를 내지 않는다.
        const cw = card.right - card.left;
        if (!panel || panel.x2 - panel.x1 < cw * 0.5) { out.push({ err: `회색 패널을 못 잡음 (${panel ? `w${panel.x2 - panel.x1}` : 'none'})` }); continue; }
        if (!red || red.n < 2000 || !blue || blue.n < 2000) { out.push({ err: `버튼을 못 잡음 (red ${red ? red.n : 0} · blue ${blue ? blue.n : 0} · card x${card.left}~${card.right} y${card.top}~${card.bottom} · yBtn ${yBtn}${blue ? ` · blue@x${blue.x1}~${blue.x2} y${blue.y1}~${blue.y2}` : ''})` }); continue; }
        out.push({ W, H, card, panel, red, blue });
    }
    return out;
});

const dataUrl = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    // 캡처를 오염시키는 연출 무력화 — shot-screens.js 와 같은 목록(+ _realShowCraftModal 보존)
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        try { UI.switchTab && UI.switchTab(null); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    // 카드 내용 고정(원본 043224 꼴): 위 = 장착 무기(이름 1줄·주스탯 1줄·서브 2줄·별 1),
    // 아래 = 새 장비(이름 1줄·주스탯 1줄·서브 2줄·'새로운!'·별 1). 이름은 gear-detail 프로브와 같은 값.
    await page.evaluate(() => {
        const w = S.equipment.weapon;
        w.age = 'underworld'; w.ageIdx = AGES.indexOf('underworld');
        w.name = '파충의 펠트'; w.level = 106; w.main = 'hp'; w.stars = 1;
        w.subs = [{ key: 'double', label: '더블 찬스', value: 7.48 }, { key: 'critDmg', label: '치명타 피해', value: 71.4 }];
        const it = Forge.rollItem();
        it.slot = 'weapon';
        it.age = 'quantum'; it.ageIdx = AGES.indexOf('quantum');
        it.name = '확률 반지'; it.level = 111; it.main = 'hp'; it.stars = 1;
        it.subs = [{ key: 'critDmg', label: '치명타 피해', value: 40.5 }, { key: 'dmg', label: '피해', value: 3.38 }];
        UI._realShowCraftModal(it);
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);

    if (ref.err || clone.err) { console.log('측정 실패(측정기 고장 — 수치 없음):', ref.err || '', clone.err || ''); await browser.close(); process.exit(2); }

    const pct = (m, v, unit) => +(v / (unit === 'W' ? m.W : m.H) * 100).toFixed(2);
    const ROWS = [
        ['카드 좌', 'W', m => m.card.left],
        ['카드 폭', 'W', m => m.card.right - m.card.left],
        ['카드 상단', 'H', m => m.card.top],
        ['카드 하단', 'H', m => m.card.bottom],
        ['카드 높이', 'H', m => m.card.bottom - m.card.top],
        ['패널 좌', 'W', m => m.panel.x1],
        ['패널 폭', 'W', m => m.panel.x2 - m.panel.x1],
        ['패널 상단', 'H', m => m.panel.y1],
        ['패널 하단', 'H', m => m.panel.y2],
        ['패널 높이', 'H', m => m.panel.y2 - m.panel.y1],
        ['판매 좌', 'W', m => m.red.x1],
        ['판매 폭', 'W', m => m.red.x2 - m.red.x1],
        ['판매 상단', 'H', m => m.red.y1],
        ['판매 높이', 'H', m => m.red.y2 - m.red.y1],
        ['장착 좌', 'W', m => m.blue.x1],
        ['장착 폭', 'W', m => m.blue.x2 - m.blue.x1],
        ['버튼 틈', 'W', m => m.blue.x1 - m.red.x2],
    ];
    console.log(`\n제작 비교(shot-043224) — 원본 ${ref.W}×${ref.H} vs 클론 ${clone.W}×${clone.H} · 같은 픽셀 코드`);
    console.log(`(원본 패널 회색 #bebebe · 클론은 현행 팔레트 그대로 잰다 — 색은 판정 대상 아님, 기하만)\n`);
    console.log('요소'.padEnd(14) + '단위'.padStart(4) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = [];
    for (const [label, unit, get] of ROWS) {
        const a = pct(ref, get(ref), unit), b = pct(clone, get(clone), unit);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(12) + `%${unit}`.padStart(4) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(`(원본 카드 x${ref.card.left}~${ref.card.right} y${ref.card.top}~${ref.card.bottom} 패널 x${ref.panel.x1}~${ref.panel.x2} y${ref.panel.y1}~${ref.panel.y2} · 클론 카드 x${clone.card.left}~${clone.card.right} y${clone.card.top}~${clone.card.bottom} 패널 x${clone.panel.x1}~${clone.panel.x2} y${clone.panel.y1}~${clone.panel.y2})`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
