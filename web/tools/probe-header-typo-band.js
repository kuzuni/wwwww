// probe-header-typo-band.js — **헤더 글자만** 원본 ↔ 클론으로 대조한다(화풍 ⓕ-㉴).
//
// 왜 이 도구가 따로 있나 — 같은 세션이 먼저 만든 `probe-header-typo-ref.js`(전면 census)는
//   **헤더를 분리하지 못했다**. 큰 글자 구간(28px+)에서 원본 0.164 ↔ 클론 0.111 이 나와 '클론
//   헤더가 얇다'로 읽혔지만, 화면별로 찍어 보니 그 구간의 원본 표본이 **빨강 [◁] 뒤로가기 버튼**
//   같은 아이콘이었다(shot-042251 y86.2%H). 활자 필터(채움비·획/높이·바탕 밝기)를 아무리 조여도
//   '큰 글자'와 '아이콘'은 화소만으로 안 갈린다. → **좌표를 클론 DOM 에서 받아 온다**
//   (`aaa-skin` ⓙ 메모의 처방 그대로: "원본 y%H → 클론 같은 y 를 elementFromPoint 로 역추적").
//
// 무엇을 하는가:
//   ⑴ 화면마다 `shot-screens.js` 와 **같은 오프너**로 앱을 열고, 떠 있는 최상위 팝업 카드 안에서
//      **글꼴 크기가 가장 큰 글자 요소** = 헤더를 DOM 으로 집는다(선택자 목록에 안 기댄다).
//   ⑵ 그 요소의 rect(뷰포트 499×892 = 캡처 화소와 1:1)로 **띠**를 만들고, 클론 스크린샷의 그 띠에서
//      획 굵기를 잰다.
//   ⑶ **같은 %H 띠**를 원본 shot 에 옮겨 같은 자로 잰다(가로는 가운데 70%만 — 닫기[X]·아이콘 제거).
//   ⑷ 화면별로 (글자높이 · 획 · 획/높이)를 나란히 인쇄한다.
//
// ⚠️ 함정 대비:
//   ⓐ **띠 매핑이 틀리면 수치가 아니라 거짓말이 나온다** — 원본에서 잰 글자 높이가 클론과 25%
//      넘게 다르면 그 화면은 수치를 인쇄하지 않고 `띠어긋남` 으로 표시한다(probe-tabbar 규약).
//   ⓑ 원본 488~499px / 클론 499px 로 폭이 다르다 — 띠는 %H·%W 로 옮긴다.
//   ⓒ 이모지 제목(🔨 등)은 활자가 아니다 — 한글·영숫자 2자 이상인 요소만 헤더로 본다.
//   ⓓ 게임 페이지 안에서는 `new Function` 이 막힌다 — 화소 계측은 **빈 페이지**에서 돈다.
//
// 사용: node tools/probe-header-typo-band.js            (전 화면 대조표)
//       node tools/probe-header-typo-band.js <화면이름> …(일부만)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_DIR = path.resolve(__dirname, '../ref/screens');
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('-'));

// shot-screens.js 의 SCREENS 를 **그대로** 재사용한다(오프너가 갈라지면 같은 화면을 대조하는 게
// 아니게 된다 — 이 저장소가 여러 번 밟은 함정). 그 파일은 IIFE 라 require 하면 캡처가 돌기 때문에
// 배열 리터럴만 떼어 평가한다.
function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    if (i < 0 || j < 0) throw new Error('shot-screens.js 의 SCREENS 배열을 못 찾음');
    const lit = src.slice(i + 'const SCREENS = '.length, j + 2);
    return new Function('PETS_STATE_SRC', 'return ' + lit)(PETS_STATE_SRC);
}

// ── 페이지 안: 최상위 팝업의 '가장 큰 글자' 요소를 헤더로 집는다 ─────────────────
const PICK = () => {
    const vis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 6) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
    };
    const cards = [...document.querySelectorAll('.modal:not(.hidden) .modal-card, .modal:not(.hidden) .sheet, .modal:not(.hidden) .sheet-card')].filter(vis);
    const root = cards.length ? cards[cards.length - 1] : (document.getElementById('app') || document.body);
    let best = null;
    for (const el of root.querySelectorAll('*')) {
        if (!vis(el)) continue;
        const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        // ⓒ 이모지·기호만 있는 건 활자가 아니다 — 한글/영숫자 2자 이상
        if ((txt.match(/[0-9A-Za-z가-힣]/g) || []).length < 2) continue;
        const s = getComputedStyle(el);
        const fs2 = parseFloat(s.fontSize);
        if (best && fs2 <= best.fs) continue;
        const r = el.getBoundingClientRect();
        best = {
            fs: fs2, txt: txt.slice(0, 18),
            x: r.x, y: r.y, w: r.width, h: r.height,
            weight: s.fontWeight, ls: s.letterSpacing,
            stroke: s.webkitTextStrokeWidth || '0px',
            shadow: (s.textShadow || 'none').slice(0, 60),
        };
    }
    return best ? { ok: true, ...best, scoped: cards.length > 0 } : { ok: false };
};

// ── 빈 페이지: 띠 안의 글자 획을 잰다(전면 census 와 같은 정의) ──────────────────
const BAND = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const x0 = Math.max(0, Math.round(W * a.x0)), x1 = Math.min(W, Math.round(W * a.x1));
    const y0 = Math.max(0, Math.round(H * a.y0)), y1 = Math.min(H, Math.round(H * a.y1));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < 8 || bh < 6) return { n: 0 };
    const d = g.getImageData(x0, y0, bw, bh).data;
    const L = (x, y) => { if (x < 0 || y < 0 || x >= bw || y >= bh) return -1; const k = (y * bw + x) * 4; return Math.max(d[k], d[k+1], d[k+2]); };

    const INK = 90;
    const ink = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (L(x, y) <= INK) ink[y * bw + x] = 1;
    const hr = new Uint16Array(bw * bh), vr = new Uint16Array(bw * bh);
    for (let y = 0; y < bh; y++) { let x = 0; while (x < bw) { if (!ink[y*bw+x]) { x++; continue; } let e = x; while (e < bw && ink[y*bw+e]) e++; for (let s = x; s < e; s++) hr[y*bw+s] = e - x; x = e; } }
    for (let x = 0; x < bw; x++) { let y = 0; while (y < bh) { if (!ink[y*bw+x]) { y++; continue; } let e = y; while (e < bh && ink[e*bw+x]) e++; for (let s = y; s < e; s++) vr[s*bw+x] = e - y; y = e; } }

    const seen = new Uint8Array(bw * bh), stack = new Int32Array(bw * bh);
    const gl = [];
    for (let y0b = 0; y0b < bh; y0b++) for (let x0b = 0; x0b < bw; x0b++) {
        const p0 = y0b * bw + x0b;
        if (!ink[p0] || seen[p0]) continue;
        let sp = 0; stack[sp++] = p0; seen[p0] = 1;
        let mnx = x0b, mxx = x0b, mny = y0b, mxy = y0b, n = 0; const px = [];
        while (sp > 0) {
            const p = stack[--sp], x = p % bw, y = (p / bw) | 0;
            n++; px.push(p);
            if (x < mnx) mnx = x; if (x > mxx) mxx = x;
            if (y < mny) mny = y; if (y > mxy) mxy = y;
            if (n > 20000) break;
            if (x > 0      && ink[p-1]  && !seen[p-1])  { seen[p-1] = 1;  stack[sp++] = p-1; }
            if (x < bw - 1 && ink[p+1]  && !seen[p+1])  { seen[p+1] = 1;  stack[sp++] = p+1; }
            if (y > 0      && ink[p-bw] && !seen[p-bw]) { seen[p-bw] = 1; stack[sp++] = p-bw; }
            if (y < bh - 1 && ink[p+bw] && !seen[p+bw]) { seen[p+bw] = 1; stack[sp++] = p+bw; }
        }
        const w = mxx - mnx + 1, h = mxy - mny + 1;
        if (h < 5 || w < 2) continue;
        if (mny === 0 || mxy === bh - 1) continue;              // 띠에 잘린 성분은 높이가 거짓이다
        const fill = n / (w * h);
        if (fill < 0.15 || fill > 0.85) continue;
        const sw = [];
        for (const p of px) { const A = hr[p], B = vr[p]; sw.push(A < B ? A : B); }
        sw.sort((A, B) => A - B);
        const st = sw[sw.length >> 1];
        if (st / h < 0.06 || st / h > 0.40) continue;
        gl.push({ h, stroke: st });
    }
    if (!gl.length) return { n: 0 };
    const hs = gl.map(p => p.h).sort((A, B) => A - B);
    const ss = gl.map(p => p.stroke).sort((A, B) => A - B);
    const gh = hs[hs.length >> 1], st = ss[ss.length >> 1];
    return { n: gl.length, gh, stroke: st, ratio: +(st / gh).toFixed(3) };
})`;

(async () => {
    const SCREENS = loadScreens();
    const targets = (ONLY.length ? SCREENS.filter(s => ONLY.includes(s[0])) : SCREENS).filter(s => s[1]);
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const meas = await browser.newPage();
    await meas.goto('about:blank');
    const measure = (buf, band) => meas.evaluate(({ src, a }) => (new Function('return ' + src))()(a),
        { src: BAND, a: { dataUrl: 'data:image/png;base64,' + buf.toString('base64'), ...band } });

    // 🚨 시드·부팅 절차는 shot-screens.js 와 **같아야** 한다 — 상태가 다르면 같은 화면을 대조하는
    //    게 아니게 된다(제목 문구부터 달라진다). 시드 본문은 shot-screens-seed.js 가 공유한다.
    const READY = 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene';
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'S && S.forgeLevel === 29 && ' + READY, { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { };
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        try { UI.clearPendingCraft(); UI.renderEquipSheet(); } catch (e) { }
        UI.coinBurst = () => { };
        UI.bossWarning = () => { };
    });

    const rows = [];
    for (const [name, ref, src] of targets) {
        try {
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                try { UI.switchTab && UI.switchTab(null); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
            });
            await page.waitForTimeout(120);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(650);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(150);
            const hd = await page.evaluate(PICK);
            if (!hd.ok) { rows.push({ name, skip: '헤더 요소 없음' }); continue; }

            const shot = await page.screenshot({ timeout: 180000 });
            const VW = 499, VH = 892;
            // 띠 = 헤더 rect 상하 여유 20%(안티에일리어싱·디센더) · 가로는 가운데 70%
            const pad = Math.max(2, hd.h * 0.2);
            const band = {
                y0: (hd.y - pad) / VH, y1: (hd.y + hd.h + pad) / VH,
                x0: 0.15, x1: 0.85,
            };
            const cl = await measure(shot, band);
            const refFile = path.join(REF_DIR, 'shot-' + ref + '.png');
            const rf = fs.existsSync(refFile) ? await measure(fs.readFileSync(refFile), band) : { n: 0 };
            rows.push({ name, ref, hd, cl, rf });
        } catch (e) {
            rows.push({ name, skip: e.message.slice(0, 60) });
        }
    }
    await browser.close();

    console.log('화면              제목            글꼴/두께      ── 원본 ──      ── 클론 ──     Δ획/높이');
    const deltas = [];
    for (const r of rows) {
        if (r.skip) { console.log(`${r.name.padEnd(17)} — ${r.skip}`); continue; }
        const { hd, cl, rf } = r;
        const style = `${hd.fs.toFixed(0)}px/${hd.weight}${hd.stroke !== '0px' ? '+s' + hd.stroke : ''}`;
        if (!cl.n || !rf.n) { console.log(`${r.name.padEnd(17)} ${hd.txt.padEnd(15)} ${style.padEnd(14)} 표본없음(원본 ${rf.n} · 클론 ${cl.n})`); continue; }
        // ⓐ 띠 매핑 자가진단 — 두 쪽 글자 높이가 25% 넘게 다르면 같은 글자를 안 보고 있다
        const off = Math.abs(rf.gh - cl.gh) / Math.max(rf.gh, cl.gh);
        const bad = off > 0.25;
        const d = cl.ratio - rf.ratio;
        console.log(`${r.name.padEnd(17)} ${hd.txt.padEnd(15)} ${style.padEnd(14)} ${String(rf.gh + 'px 획' + rf.stroke + ' ' + rf.ratio).padEnd(15)} ${String(cl.gh + 'px 획' + cl.stroke + ' ' + cl.ratio).padEnd(14)} ${bad ? '띠어긋남(' + (off * 100).toFixed(0) + '%)' : (d >= 0 ? '+' : '') + d.toFixed(3)}`);
        if (!bad) deltas.push(d);
    }
    if (deltas.length) {
        deltas.sort((a, b) => a - b);
        const m = deltas[deltas.length >> 1];
        const thin = deltas.filter(v => v <= -0.012).length, thick = deltas.filter(v => v >= 0.012).length;
        console.log(`\n쓸 수 있는 화면 ${deltas.length}개 — 획/높이 Δ 중앙값 ${(m >= 0 ? '+' : '') + m.toFixed(3)} · 클론이 얇은 화면 ${thin}개 / 두꺼운 화면 ${thick}개`);
        console.log(deltas.length < 6 ? '⚠️ 표본 6개 미만 — 결론 내지 말 것' : (Math.abs(m) < 0.012 ? '→ 헤더 획 굵기는 원본과 같다(축 기각).' : '→ 헤더 획 굵기에 실격차가 있다.'));
    } else {
        console.log('\n🚨 쓸 수 있는 화면 0개 — 측정기 고장(띠 매핑부터 고칠 것).');
        process.exit(2);
    }
})();
