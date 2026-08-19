// 보류 더미(모루 자리) 실측 — 사용자 지시 2026-08-20 `autoforge-cards-at-once` 재오픈 스펙:
//   · 보류가 **여러 개**면 카드 한 장이 아니라 **겹쳐 쌓인 덱**(에지가 여러 겹 보이는 세로 줄무늬)
//   · 보류가 **1개**면 단일 카드   · **0개**면 빈 슬롯(모루)
//   · 개수가 읽혀야 한다(뱃지)
//
// 왜 화소로 재는가 — 클래스(`deck-5`)가 붙었는지만 보면 **CSS 가 한 줄도 안 그려도 PASS** 가 난다.
//   더미는 `::before` 의 box-shadow 로만 존재해서 DOM 에 흔적이 하나도 없다. 그래서 카드 오른쪽 띠를
//   가로로 훑어 **색이 바뀌는 경계가 몇 개인가**를 센다(겹 하나 = 밝은 단면 + 어두운 틈 = 경계 2개).
//
// ⚠️ 상자 불변이 이 항목의 진짜 함정이다 — 모루 행의 폭·높이는 원본 비율 검증 대상이라,
//   더미를 그리느라 버튼이 1px 이라도 커지면 그 게이트들이 깨진다. 그래서 다섯 상태 전부에서
//   버튼 rect 가 **모루 상태와 같은지** 같이 잰다.
// ⚠️ 이 컨테이너엔 pngjs 가 없다 — 스크린샷을 base64 로 페이지에 넣고 캔버스로 디코드한다.
//
// 사용: node probe-hold-deck.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SCALE = 3;

// 개수 → 기대 두께. ui.js `heldDeckDepth` 와 같은 표(자가 계산이 아니라 **바깥에서** 다시 적는다 —
// 구현이 표를 바꾸면 여기서 걸려야 한다).
const EXPECT = [
    { n: 1, depth: 0, tag: '보류' },
    { n: 2, depth: 2, tag: '보류 2' },
    { n: 4, depth: 3, tag: '보류 4' },
    { n: 8, depth: 4, tag: '보류 8' },
    { n: 22, depth: 5, tag: '보류 22' },
];

const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
// 더미 두께는 rem 이라 뷰포트가 좁아지면 같이 줄어든다 — 좁은 화면에서 줄이 뭉개지지 않는지 같이 본다.
const VIEWPORTS = [{ width: 430, height: 932 }, { width: 360, height: 640 }];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    for (const vp of VIEWPORTS) {
    console.log(`== ${vp.width}x${vp.height} ==`);
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: SCALE });
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { timeout: 180000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        UI.showCraftModal = function () {};      // 팝업이 뜨면 모루 자리가 원상복귀한다 — 슬롯만 본다
        S.hammers = 1e6; S.forgeLevel = 30;
    });

    // ⑴ 0개 = 빈 슬롯(모루). 이후 상태의 rect 기준선도 여기서 잡는다.
    const base = await page.evaluate(() => {
        UI._pendingItem = null; S.pendingCraft = null; S.autoMatchQueue = [];
        UI.renderEquipSheet();
        const e = document.querySelector('.anvil-btn'); const r = e.getBoundingClientRect();
        return { held: !!document.querySelector('.anvil-btn.held-slot'), x: r.x, y: r.y, w: r.width, h: r.height };
    });
    ok(!base.held, `[${vp.width}] 보류 0개인데 모루 자리에 카드가 있다`);

    const decode = async (shot) => page.evaluate(async (b64) => {
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        const y = Math.round(im.height * 0.5);
        const d = c.getContext('2d').getImageData(0, y, im.width, 1).data;
        const out = [];
        for (let x = 0; x < im.width; x++) out.push([d[x * 4], d[x * 4 + 1], d[x * 4 + 2]]);
        return out;
    }, shot.toString('base64'));

    for (const exp of EXPECT) {
        // 시드: 대기품 1 + 큐 n-1 = 보류 n개 (heldCount 가 세는 그대로)
        const st = await page.evaluate((n) => {
            const a = Forge.rollItem(); a.slot = 'weapon';
            UI._pendingItem = a; S.pendingCraft = a;
            S.autoMatchQueue = [];
            for (let i = 1; i < n; i++) { const c = Forge.rollItem(); c.slot = 'weapon'; S.autoMatchQueue.push(c); }
            UI.els.craftModal.classList.add('hidden');
            UI.renderEquipSheet();
            const e = document.querySelector('.anvil-btn.held-slot');
            if (!e) return { missing: true };
            const r = e.getBoundingClientRect();
            return {
                cls: e.className,
                count: UI.heldCount(),
                tag: (e.querySelector('.held-tag') || {}).textContent,
                x: r.x, y: r.y, w: r.width, h: r.height,
            };
        }, exp.n);
        await page.waitForTimeout(200);
        if (st.missing) { ok(false, `[${vp.width}] 보류 ${exp.n}개인데 모루 자리 카드가 없다`); continue; }

        ok(st.count === exp.n, `[${vp.width}] 보류 ${exp.n}개 시드인데 heldCount=${st.count}`);
        ok(st.tag === exp.tag, `[${vp.width}] 보류 ${exp.n}개 뱃지가 "${st.tag}" (기대 "${exp.tag}") — 개수가 안 읽힌다`);
        const hasDeck = /\bdeck\b/.test(st.cls);
        ok(hasDeck === exp.depth > 0,
            `[${vp.width}] 보류 ${exp.n}개 더미 클래스 오류 — class="${st.cls}" (기대 ${exp.depth ? 'deck-' + exp.depth : '더미 없음'})`);
        if (exp.depth) ok(new RegExp(`\\bdeck-${exp.depth}\\b`).test(st.cls),
            `[${vp.width}] 보류 ${exp.n}개 두께가 틀렸다 — class="${st.cls}" (기대 deck-${exp.depth})`);

        // 상자 불변 — 더미가 모루 행 크기를 흔들면 원본 비율 게이트가 깨진다
        ok(near(st.x, base.x) && near(st.y, base.y) && near(st.w, base.w) && near(st.h, base.h),
            `[${vp.width}] 보류 ${exp.n}개에서 모루 칸 상자가 움직였다 ${JSON.stringify({ x: st.x, y: st.y, w: st.w, h: st.h })} vs 모루 ${JSON.stringify(base)}`);

        // 화소 — 카드 오른쪽 띠를 가로로 훑어 **색이 바뀌는 경계**를 센다.
        // 겹 하나가 `밝은 단면 → 어두운 틈` 두 경계를 만드므로 경계 수 = 2 × 두께다(단일 카드는 0 —
        // 앞면이 한 색으로 균일하다). ⚠️ 계산색(getComputedStyle)과 색을 맞대지 않는다: 카드 위에 덧입혀지는
        // 층이 있어 화소가 선언색과 그대로 같지 않다(실측 — 색으로 맞추니 멀쩡한 줄이 전부 0으로 샜다).
        // 경계만 세면 그 층과 무관하게 '줄무늬가 실제로 그려졌는가'만 잰다.
        const shot = await page.screenshot({ clip: { x: st.x, y: st.y, width: st.w, height: st.h } });
        const row = await decode(shot);
        const from = Math.round(row.length * 0.62);    // 오른쪽만 본다(가운데엔 아이템 그림·이름이 있다)
        const lum = row.slice(from).map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
        const lo = Math.min(...lum), hi = Math.max(...lum);
        // 밝은 띠 = 카드 한 장의 단면. 명암차가 없으면(단일 카드) 띠도 0이다.
        let bands = 0;
        if (hi - lo >= 20) {
            const thr = (lo + hi) / 2;
            let run = 0;
            for (const v of lum) {
                if (v > thr) { run++; if (run === 2) bands++; }   // 2화소 미만은 안티에일리어싱
                else run = 0;
            }
        }
        ok(bands === exp.depth,
            `[${vp.width}] 보류 ${exp.n}개 — 카드 오른쪽에 밝은 세로 띠가 ${bands}줄 (기대 ${exp.depth}줄, 명암차 ${(hi - lo).toFixed(1)}). 더미가 화면에 안 그려졌다`);
        console.log(`  보류 ${String(exp.n).padStart(2)}개 · class=${st.cls.replace('anvil-btn held-slot', '').trim() || '(단일 카드)'} · 뱃지="${st.tag}" · 세로 띠 ${bands}줄 · 명암차 ${(hi - lo).toFixed(1)}`);
    }

    await page.close();
    }
    ok(!errs.length, `콘솔/페이지 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    await browser.close();
    if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('PASS — 보류 더미 전 항목 통과');
})();
