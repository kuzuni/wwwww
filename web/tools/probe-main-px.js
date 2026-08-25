// 메인 화면(shot-042120) 요소 실측 — '전 UI 비율 전수 검증 패스'(ui-ratio-audit)의 마지막
// 밴드 미실측 화면. **원본 PNG 와 클론 라이브 캡처를 같은 픽셀 코드로** 재서 ±2%p 판정한다.
//
// 📏 자 = 이미지 폭/높이 그대로(가로 %W · 세로 %H). 원본 499×892 = 캡처 뷰포트 499×892 로
//    앱 폭 = 이미지 폭이다(이 컷은 우측 기기 띠가 없다 — 필드가 x498 까지 찍혀 있음을 실측).
//
// 🚨 원본은 상단바가 **불투명 띠가 아니다** — 프로필 판·재화 pill 이 초록 필드 위에 떠 있다
//    (row0 평균색 (11,183,99) = 필드 초록. 클론은 (8,11,15) = 근흑 띠). 띠의 유무/색은 스킨
//    소관(aaa-skin)이라 여기서 판정하지 않고, **pill·아이콘·프로필의 기하만** 잰다.
//
// 🚨 클론 캡처는 #game3d 캔버스를 숨기고 찍는다 — 3D 눈밭/이펙트의 밝은 픽셀이 제목·점줄·
//    스킬바 창의 흰 잉크 술어에 걸려 가짜 측정이 나온다(저장된 clone/main.png 로 실측:
//    제목 union 이 눈 덩어리와 붙어 center x 가 +4%p 로 찍혔다). HUD 는 전부 DOM 이라
//    캔버스를 꺼도 기하가 안 변한다. 원본은 필드가 배경이지만 아래 술어들은 색 대비로 잡아
//    양쪽에서 같은 요소를 문다(각 술어 옆 주석 참조).
//
// 🚨 판정하지 않는 것:
//  · 모루 bbox — 모루 이미지 정합은 anvil-ref(3D 크로스컷) 소관. 수치만 참고로 찍는다.
//  · 웨이브 점 줄 — 원본은 파란 원+흰 바(현재 웨이브), 클론은 점 N개로 **개수가 스테이지
//    상태에 딸린 내용**이라 미판정(수치만 출력).
//  · 이정표(waypoint)·필드 위 오브젝트 — 3D/전투 상태 소관.
//  · 상단바 띠·pill 배경색, 탭바 아이콘 구성(디버그 탭 등) — 스킨/콘텐츠 소관.
//
// 사용: node tools/probe-main-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');
const { waitReady } = require('./wait-ready.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const TOL = 2.0;

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
        const comps = (pred, x1, y1, x2, y2, minN) => {
            const lab = new Int32Array(W * H).fill(-1);
            const list = [];
            for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
                const i0 = yy * W + xx;
                if (lab[i0] !== -1 || !pred(xx, yy)) continue;
                const id = list.length, st = [i0]; lab[i0] = id;
                let n = 0, a = W, b2 = -1, t = H, bo = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < a) a = x; if (x > b2) b2 = x; if (y < t) t = y; if (y > bo) bo = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < x1 || nx > x2 || ny < y1 || ny > y2) continue;
                        const ni = ny * W + nx;
                        if (lab[ni] === -1 && pred(nx, ny)) { lab[ni] = id; st.push(ni); }
                    }
                }
                if (n >= minN) list.push({ n, x1: a, x2: b2, y1: t, y2: bo });
            }
            return list.sort((a, b) => b.n - a.n);
        };
        const union = list => list.length ? {
            x1: Math.min(...list.map(t => t.x1)), x2: Math.max(...list.map(t => t.x2)),
            y1: Math.min(...list.map(t => t.y1)), y2: Math.max(...list.map(t => t.y2)),
        } : null;
        const res = { W, H };
        const topY2 = Math.round(H * 0.08);

        // 코인 아이콘(금색 왕관) — 필드 초록/근흑 띠 어느 쪽과도 안 겹치는 강한 금색만
        const gold = (x, y) => { const p = at(x, y); return p[0] > 190 && p[1] > 130 && p[2] < 110 && p[0] - p[2] > 100; };
        const goldC = comps(gold, Math.round(W * 0.4), 0, W - 1, topY2, 40);
        res.coinIco = goldC[0] || null;
        // 젬 아이콘(적색) — 클론 아이콘은 흰 하이라이트로 성분이 쪼개지므로 union 으로 잡는다
        const redP = (x, y) => { const p = at(x, y); return p[0] > 150 && p[1] < 120 && p[0] - p[1] > 60; };
        res.gemIco = union(comps(redP, Math.round(W * 0.72), 0, W - 1, topY2, 20));
        // 프로필(아바타 박스+이름 판) — 좌상단 창의 밝은 잉크 union (원본 흰 테두리/공룡,
        // 클론 흰 박스/이름 글자. 필드 초록은 min(rgb)<160 이라 안 걸린다)
        const brightP = (x, y) => { const p = at(x, y); return Math.min(...p) >= 160; };
        res.profile = union(comps(brightP, 0, 0, Math.round(W * 0.25), Math.round(H * 0.09), 80));

        // 스테이지 제목 '어려움 N-M' — 중앙 창의 흰 글자(외곽선 검정). 제목 잉크의 y1 과
        // 중심 x 만 판정한다(원본은 아래 흰 웨이브 바가 union 에 섞여 높이는 못 쓴다).
        const whiteish = (x, y) => { const p = at(x, y); return Math.min(...p) >= 200; };
        const titleC = comps(whiteish, Math.round(W * 0.30), Math.round(H * 0.055), Math.round(W * 0.70), Math.round(H * 0.14), 25);
        // 글자 성분만: union 전에 y1 기준 첫 줄(±½H창)만 남긴다 — 원본 웨이브 바(제목보다 아래)와 분리
        if (titleC.length) {
            const minY = Math.min(...titleC.map(t => t.y1));
            res.title = union(titleC.filter(t => t.y1 - minY < H * 0.03));
            // 웨이브 점 줄(미판정 — 참고 출력)
            res.pips = union(titleC.filter(t => t.y1 - minY >= H * 0.03));
        }

        // 스킬 바(우중단): 어두운 잉크 union — 원본 검정 원 3개+초록 버튼 어두운 링,
        // 클론 원형 버튼 테두리+링. 필드/3D 배경 위에서만 성립하는 술어라 클론은 **캔버스를
        // 켠 캡처**에서 잰다(캔버스를 숨기면 배경 전체가 근흑이라 union 이 창 전체가 된다 — 밟았다).
        // 좌우(x)는 창 경계에 물려 못 쓰고(두 쪽 다 x1=창 좌단으로 나온 실측) 세로만 판정한다.
        const darkC = (x, y) => { const p = at(x, y); return Math.max(...p) < 95; };
        res.skillbar = union(comps(darkC, Math.round(W * 0.6), Math.round(H * 0.46), W - 1, Math.round(H * 0.575), 300));

        // 장비 시트 상단: 행 평균 밝기 205 초과 5행 연속 (시트 회백 231 이 필드/캔버스와 갈린다)
        const rowAvg = y => { let s = 0; for (let x = 0; x < W; x++) { const p = at(x, y); s += (p[0] + p[1] + p[2]) / 3; } return s / W; };
        let sheetTop = null;
        for (let y = Math.round(H * 0.5); y < H * 0.7; y++) {
            let ok = true;
            for (let k = 0; k < 5; k++) if (rowAvg(y + k) <= 205) { ok = false; break; }
            if (ok) { sheetTop = y; break; }
        }
        res.sheetTop = sheetTop;
        if (sheetTop == null) { out.push({ err: '시트 상단 없음' }); continue; }

        // 장비 타일 격자: 시트 위 진한 잉크 성분(타일 채움/테두리 — 시트 231 과 갈리는 max<190
        // 또는 채도>50. 흰 글자·별은 타일 안 구멍이라 bbox 를 안 깬다). 최빈 크기 ±6px 만 격자로.
        const tileInk = (x, y) => { const p = at(x, y); return Math.max(...p) < 190 || (Math.max(...p) - Math.min(...p)) > 50; };
        const raw = comps(tileInk, 5, sheetTop + 2, W - 6, sheetTop + Math.round(H * 0.20), 700);
        const mode = arr => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
        const wm = mode(raw.map(t => t.x2 + 1 - t.x1)), hm = mode(raw.map(t => t.y2 + 1 - t.y1));
        // 🚨 허용 ±8px — 원본 장착 타일은 좌상단 모서리 배지가 bbox 를 폭+4~5·높이+7px 부풀린다.
        //    ±6 으로 조이면 배지 달린 타일이 다 빠져 1행이 3개가 되고 '1타일 좌'가 3열에서 잡혀
        //    −30%p 가짜 결함이 나온다(밟았다). 배지 오버행이 t0 에 주는 편향은 ≤0.8%p.
        const tiles = raw.filter(t => Math.abs(t.x2 + 1 - t.x1 - wm) <= 8 && Math.abs(t.y2 + 1 - t.y1 - hm) <= 8)
            .sort((a, b) => (a.y1 - b.y1) || (a.x1 - b.x1));
        res.tileW = wm; res.tileH = hm; res.tileN = tiles.length;
        if (tiles.length) {
            const firstY = tiles[0].y1;
            // 행 묶음도 ±12px — 배지 오버행이 y1 을 7px 올려 ±6 이면 같은 행이 둘로 갈린다(행 피치 77).
            const row1 = tiles.filter(t => Math.abs(t.y1 - firstY) <= 12).sort((a, b) => a.x1 - b.x1);
            res.t0 = { x: row1[0].x1, y: row1[0].y1 };
            res.row1N = row1.length;
            res.colPitch = row1.length >= 2 ? mode(row1.slice(1).map((t, i) => t.x1 - row1[i].x1)) : null;
        }
        // 특수 칸(넓은 파란 카드, 2행 오른쪽) — 파란 채움 최대 성분
        const blue = (x, y) => { const p = at(x, y); return p[2] > 150 && p[2] - p[0] > 60 && p[2] - p[1] > 30; };
        const wideC = comps(blue, 0, sheetTop, W - 1, sheetTop + Math.round(H * 0.20), 1500);
        res.wideCard = wideC[0] || null;

        // [대장간 레벨 N]·[자동] 버튼 — 시트 아래쪽의 파란 성분 2개(왼쪽=대장간, 오른쪽=자동)
        const btnC = comps(blue, Math.round(W * 0.5), sheetTop + Math.round(H * 0.19), W - 1, Math.round(H * 0.88), 600)
            .sort((a, b) => a.x1 - b.x1);
        res.forgeBtn = btnC[0] || null;
        res.autoBtn = btnC[1] || null;

        // 정보(ⓘ) 버튼 — 좌하단 창의 작은 잉크 성분(타일 격자보다 아래). 큰 성분(타일 잔재)은
        // 최빈 타일 크기의 절반보다 작은 것만 후보로.
        const inkP = (x, y) => { const p = at(x, y); return Math.max(...p) < 210; };
        const infoC = comps(inkP, 2, sheetTop + Math.round(H * 0.13), Math.round(W * 0.22), Math.round(H * 0.88), 60)
            .filter(t => (t.x2 + 1 - t.x1) < wm * 0.6 && (t.y2 + 1 - t.y1) < hm * 0.6);
        res.infoBtn = infoC[0] || null;

        // 모루(미판정 참고) — 중앙 창의 어두운 최대 성분
        const anvilC = comps((x, y) => { const p = at(x, y); return Math.max(...p) < 110; },
            Math.round(W * 0.25), sheetTop + Math.round(H * 0.14), Math.round(W * 0.72), Math.round(H * 0.88), 2000);
        res.anvil = anvilC[0] || null;

        // 채팅 띠 상단: 중앙 창(x 0.35~0.65W) 행 평균이 [100,190] 인 15행 이상 연속 run 의 시작.
        // 모루/버튼 아래(y ≥ 0.845H)부터 찾는다 — 모루의 어두운 행이 위에서 걸리는 것을 밟았다.
        const rowAvgC = y => { const a = Math.round(W * 0.35), b = Math.round(W * 0.65); let s = 0; for (let x = a; x < b; x++) { const p = at(x, y); s += (p[0] + p[1] + p[2]) / 3; } return s / (b - a); };
        let chatTop = null;
        for (let y = Math.round(H * 0.845); y < Math.round(H * 0.92); y++) {
            const v = rowAvgC(y);
            if (v >= 100 && v <= 190) {
                let ok = true;
                for (let k = 1; k < 15; k++) { const vv = rowAvgC(y + k); if (vv < 100 || vv > 190) { ok = false; break; } }
                if (ok) { chatTop = y; break; }
            }
        }
        res.chatTop = chatTop;

        // 탭바 상단: 아래에서 위로 '어두운(<70) 픽셀 60%W' 행의 연속 시작(맨 아래 1~2 행은
        // 경계 렌더링으로 안 어두울 수 있어 0.97H 부터 훑는다)
        let yTab = null;
        for (let y = Math.round(H * 0.97); y > H * 0.85; y--) {
            let n = 0;
            for (let x = 0; x < W; x++) { const p = at(x, y); if (Math.max(...p) < 70) n++; }
            if (n < W * 0.6) { yTab = y + 1; break; }
        }
        res.tabbarTop = yTab;
        out.push(res);
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
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    // 🚨 S.forgeLevel 만 기다리면 안 된다 — S 는 스크립트 파싱 시점에 복원되지만 UI.els 는
    //    UI.init(DOMContentLoaded) 이 채운다. 그 사이에 아래 renderEquipSheet 를 부르면
    //    els.equipSheet 가 undefined 로 죽는다(느린 컨테이너에서 3회 중 2회 재현).
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet', { label: '시드 상태 로드' });
    // 캡처 오염원 무력화 — shot-screens.js 전체 목록
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };
        // 전리품 피드(#loot-feed) — 스킬 바 dark-ink 창(x>0.6W, y0.46~0.575H) 바로 위에 떠서
        // 어두운 코인 토스트가 union 을 위로 늘린다(실측: 스킬 바 DOM 상단은 원본과 동일한
        // 48.99%H 인데 피드가 y419 에 떠 '스킬 바 상단 −3.03%p' 가짜 FAIL). 전투 상태 소관 오염원.
        UI.floatLoot = () => { };
        if (UI.els && UI.els.lootFeed) UI.els.lootFeed.innerHTML = '';
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        try { UI.switchTab && UI.switchTab(null); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    await page.waitForTimeout(400);
    // ① 스킬 바 전용 캡처 — 캔버스를 숨기고 **밝은 베일**을 HUD 뒤에 깐다.
    // 🚨 종전에는 '어두운 잉크 술어가 3D 배경 위에서만 성립한다'며 캔버스를 켠 채 찍었지만,
    //    그 전제(밝은 초원 필드)가 깨졌다 — 챕터 테마가 어두운 바이옴(4챕터 흐린 침엽수림)이면
    //    창 오른쪽 절반이 통째로 '어두운 잉크'가 돼 union 이 측정 창 상단(0.46H)까지 번지고
    //    '스킬 바 상단 −3.03%p' 가짜 FAIL 이 난다(실측: n=9354 단일 성분이 x299~498·y410~498 을
    //    덮었다. 스킬 바 DOM 상단은 원본과 동일한 48.99%H). 헤드리스에서 rAF 가 안 돌아 캔버스가
    //    검정으로 남을 때도 같은 증상이다. 테마·렌더 상태에 안 딸리게, 캔버스 자리를 밝은
    //    단색으로 채워 창 안의 어두운 잉크 = 스킬 바뿐이게 만든다(원본 PNG 쪽은 밝은 필드라
    //    같은 술어가 원래 성립한다).
    //    구현: 캔버스를 숨기면 그 뒤는 `#app` 근흑(rgb 22,27,34)이 그대로 보인다(별도 베일을
    //    body 에 깔아도 #app 이 트리상 뒤라 그 위에 칠해진다 — 밟았다). #app 배경 자체를 잠시
    //    밝은 초록으로 바꿔 찍고 되돌린다. HUD 는 전부 #app 안쪽 위층이라 기하가 안 변한다.
    const shotVis = await (async () => {
        await page.evaluate(() => {
            const g = document.getElementById('game3d'); if (g) g.style.visibility = 'hidden';
            const app = document.getElementById('app');
            if (app) { app.dataset.probeBg = app.style.background || ''; app.style.background = '#2fae5f'; }
        });
        const s = await page.screenshot({ timeout: 180000 });
        await page.evaluate(() => {
            const app = document.getElementById('app');
            if (app) { app.style.background = app.dataset.probeBg || ''; delete app.dataset.probeBg; }
            const g = document.getElementById('game3d'); if (g) g.style.visibility = '';
        });
        return s;
    })();
    // ② 픽셀 실측 본 캡처(머리말 🚨): 3D 캔버스·이펙트·오프라인 배지를 숨긴다 — 전부 측정
    //    대상 밖이고, 캔버스의 밝은 픽셀(눈밭)이 흰 잉크 술어를 오염시킨다. HUD 기하는 안 변한다.
    await page.evaluate(() => {
        for (const id of ['game3d', 'fx-layer', 'loot-feed', 'skill-cutin', 'skill-flash', 'offline-btn'])
            { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
    });
    await page.waitForTimeout(150);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone, cloneVis] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64'),
         'data:image/png;base64,' + shotVis.toString('base64')]);
    if (ref.err || clone.err) {
        console.log('측정 실패:', ref.err || '', clone.err || '');
        await browser.close();
        process.exit(2);
    }
    clone.skillbar = cloneVis && !cloneVis.err ? cloneVis.skillbar : null;   // 머리말: 스킬 바만 캔버스 켠 쪽
    /* 🚨 **탭바 상단은 클론만 DOM 으로 잰다 — 어둠 술어는 이 화면에서 원리적으로 좌우 대칭이 안 된다**
       (2026-08-25 UI 스트림 실측. 되돌리기 전에 아래 수치를 전부 읽을 것 — 나는 두 번 헛짚었다).
       술어(`measure` 안)는 '아래에서 위로 훑어 어두운(<70) 화소가 60%W 미만인 첫 행'을 탭바 상단으로
       잡는다. 이건 **탭바 위가 밝다**는 전제 위에 서 있다.
       · **원본 shot-042120 에서는 그 전제가 참이다** — 탭바 위가 초록 필드라 89.x%H 까지 어두운 화소가
         **0%** 였다가 90.25%H 에서 **100%** 로 딱 끊긴다. 그래서 원본 쪽 값 90.25%H 는 정확하다.
       · **클론에서는 거짓이다** — 그 자리를 **불투명한 어두운 장비 시트**가 덮는다(`UI.renderEquipSheet()`,
         1타일 상단 56.95%H 부터 아래로). 실측: 85.99%H 부터 쭉 **89~96% 가 어둡다**. 그래서 훑어
         올라가도 '밝은 행' 경계가 아예 없고, 대신 **탭바 자기 라벨 띠**의 어두운 비율이 **59.3~59.7%** 로
         60% 문턱을 아슬아슬하게 밑도는 자리(94.51~95.18%H)에 걸려 멈춘다 → **95.29%H**, `+5.04%p` FAIL.
       🚨 **제품은 멀쩡하다.** 같은 판에서 `#tabbar` 의 DOM rect 는 상단 **90.30%H · 높이 9.43%H** 이고
       (`--tabbar-h: 5rem` = 9.48%H 설계값), 원본 90.25%H 와 **0.05%p** 로 맞는다. 이건 **판정기 결함**이다.
       ❌ **막다른 길 둘(다시 파지 말 것)**: ⑴ *"①번 밝은 베일(`#app`→#2fae5f) 캡처에서 가져오면 된다"* —
          **안 된다.** 베일은 `#app` 배경만 칠하는데 그 위를 장비 시트가 **불투명하게** 덮어 탭바 위
          행들이 베일 캡처에서도 똑같이 89~96% 어둡다(실측 대조: 두 캡처의 해당 행이 **동일**).
          `skillbar` 가 베일로 풀린 건 거기가 캔버스 자리라 베일이 실제로 보이기 때문이고, 여기는 아니다.
       ⑵ *"문턱(60%)이나 어둠 기준(<70)을 낮추면 된다"* — 라벨 띠 59.3% 와 시트 89% 사이 어디를 잡아도
          **원본에는 없는 경계를 클론에서 새로 만드는 것**이라, 좌우가 다른 것을 재게 된다.
       👉 그래서 **클론만 DOM 으로 잰다.** 이 자의 '같은 픽셀 코드로 잰다' 규약은 *좌우가 다른 특징을
          재는 것*을 막으려는 것인데, 여기서는 DOM rect 와 원본의 밝음→어둠 경계가 **같은 물리적 모서리**
          임이 수치로 교차확인됐다(0.05%p). 규약의 목적은 지켜지고 문자만 바뀐다.
       ⚠️ 원본 쪽은 **그대로 픽셀로** 잰다(PNG 에는 DOM 이 없다). 즉 이 한 줄만 비대칭이고, 그 사유가
          위에 수치로 적혀 있다. 다른 술어에 이 패턴을 함부로 복사하지 말 것. */
    clone.tabbarTop = await page.evaluate(() => {
        const t = document.getElementById('tabbar');
        return t ? t.getBoundingClientRect().top : null;
    });
    console.log(`\n메인 화면(shot-042120) — 원본 ${ref.W}×${ref.H} vs 클론 ${clone.W}×${clone.H} · 같은 픽셀 코드 · 허용 ±${TOL}%p`);
    const pW = (m, v) => +(v / m.W * 100).toFixed(2);
    const pH = (m, v) => +(v / m.H * 100).toFixed(2);
    const cx = b => (b.x1 + b.x2) / 2, cy = b => (b.y1 + b.y2) / 2;
    const bw = b => b.x2 + 1 - b.x1, bh = b => b.y2 + 1 - b.y1;
    // [라벨, 축('W'|'H'), 값 추출(measure 결과 → px | null)]
    const ROWS = [
        ['코인 아이콘 중심 x', 'W', m => m.coinIco && cx(m.coinIco)],
        ['코인 아이콘 중심 y', 'H', m => m.coinIco && cy(m.coinIco)],
        ['젬 아이콘 중심 x', 'W', m => m.gemIco && cx(m.gemIco)],
        ['젬 아이콘 중심 y', 'H', m => m.gemIco && cy(m.gemIco)],
        ['프로필 좌', 'W', m => m.profile && m.profile.x1],
        ['프로필 상단', 'H', m => m.profile && m.profile.y1],
        ['프로필 하단', 'H', m => m.profile && m.profile.y2],
        // 🚨 **`profile` 은 배지 '바' 전체가 아니라 좌상단 밝은 잉크 union(아바타 판)이다**
        //    — 창이 `W*0.25 × H*0.09` 로 잘려 있어 그보다 넓은 바는 애초에 다 못 담는다.
        //    실측: 여기서 나오는 폭은 8.02%W(≈40px)인데 **원본 배지 바는 32.26%W(x14~174, 161px)** 다.
        //    2026-08-20 R6 에서 비평가 A 가 '바가 Δ−7.07%p 좁다'고 지적했을 때, 이 줄들이 통과한다고
        //    '바는 이미 재고 있다'로 읽으면 안 된다 — **바의 폭·우단은 아직 아무도 안 잰다**(TODO 메모 참조).
        //    아래 두 줄은 그 아바타 판의 우단·폭이고, 그것대로 값어치가 있어 남긴다(Δ+0.20/−0.20%p).
        ['프로필 우', 'W', m => m.profile && m.profile.x2],
        ['프로필 폭', 'W', m => m.profile && bw(m.profile)],
        ['제목 중심 x', 'W', m => m.title && cx(m.title)],
        ['제목 상단 y', 'H', m => m.title && m.title.y1],
        ['스킬 바 상단', 'H', m => m.skillbar && m.skillbar.y1],
        ['스킬 바 하단', 'H', m => m.skillbar && m.skillbar.y2],
        ['시트 상단', 'H', m => m.sheetTop],
        ['1타일 좌', 'W', m => m.t0 && m.t0.x],
        ['1타일 상단', 'H', m => m.t0 && m.t0.y],
        ['타일 폭', 'W', m => m.tileW],
        ['타일 높이', 'H', m => m.tileH],
        ['열 피치', 'W', m => m.colPitch],
        ['특수 칸 좌', 'W', m => m.wideCard && m.wideCard.x1],
        ['특수 칸 상단', 'H', m => m.wideCard && m.wideCard.y1],
        ['특수 칸 폭', 'W', m => m.wideCard && bw(m.wideCard)],
        ['특수 칸 높이', 'H', m => m.wideCard && bh(m.wideCard)],
        ['대장간 버튼 좌', 'W', m => m.forgeBtn && m.forgeBtn.x1],
        ['대장간 버튼 상단', 'H', m => m.forgeBtn && m.forgeBtn.y1],
        ['대장간 버튼 폭', 'W', m => m.forgeBtn && bw(m.forgeBtn)],
        ['대장간 버튼 높이', 'H', m => m.forgeBtn && bh(m.forgeBtn)],
        ['자동 버튼 좌', 'W', m => m.autoBtn && m.autoBtn.x1],
        ['자동 버튼 폭', 'W', m => m.autoBtn && bw(m.autoBtn)],
        ['자동 버튼 우단', 'W', m => m.autoBtn && m.autoBtn.x2],
        ['정보 버튼 중심 x', 'W', m => m.infoBtn && cx(m.infoBtn)],
        ['정보 버튼 중심 y', 'H', m => m.infoBtn && cy(m.infoBtn)],
        ['정보 버튼 지름', 'W', m => m.infoBtn && bw(m.infoBtn)],
        ['채팅 띠 상단', 'H', m => m.chatTop],
        ['탭바 상단', 'H', m => m.tabbarTop],
    ];
    console.log('요소'.padEnd(16) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = []; let skipped = 0;
    for (const [label, axis, get] of ROWS) {
        const ra = get(ref), rb = get(clone);
        if (ra == null || rb == null) { console.log(label.padEnd(16) + `  — 미검출(원본 ${ra != null} / 클론 ${rb != null}) 미판정`); skipped++; continue; }
        const f = axis === 'W' ? pW : pH;
        const a = f(ref, ra), b = f(clone, rb);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(16) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    const fmtB = b => b ? `x${b.x1}~${b.x2} y${b.y1}~${b.y2}` : '미검출';
    console.log(`\n[미판정 참고] 모루 원본 ${fmtB(ref.anvil)} / 클론 ${fmtB(clone.anvil)} (anvil-ref 소관)`);
    console.log(`[미판정 참고] 웨이브 점줄 원본 ${fmtB(ref.pips)} / 클론 ${fmtB(clone.pips)} (개수=상태 소관)`);
    console.log(`[미판정 참고] 타일 수 원본 ${ref.tileN}(1행 ${ref.row1N}) / 클론 ${clone.tileN}(1행 ${clone.row1N})`);
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}${skipped ? ` · 미판정 ${skipped}건` : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
