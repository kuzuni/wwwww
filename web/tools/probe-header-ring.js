// probe-header-ring.js — 헤더 활자가 **'흰 채움 + 검정 링'인가**를 원본 ↔ 클론으로 census 한다.
// 짝: css/style.css 의 '화풍 ⓕ-㉴ 헤더 블록 타이포' 블록.
//
// 왜 이 자가 필요했나 — 같은 축을 재려고 앞서 만든 자 둘이 **둘 다 헤더를 못 짚었다**:
//   ⑴ `probe-header-typo-ref.js`(전면 census, 획 굵기) — 큰 글자 구간에서 원본 0.164 ↔ 클론 0.111 이
//      나왔지만 화면별로 찍어 보니 원본 표본이 **빨강 [◁] 뒤로가기 버튼**이었다(shot-042251 y86.2%H).
//   ⑵ `probe-header-typo-band.js`(클론 DOM 으로 띠를 받아 옴) — 띠 자체는 맞았는데 '가장 큰 글자'
//      휴리스틱이 HUD 타이머·배경 글자를 집어 30화면 중 7화면만 살아남았다.
//   두 자가 공통으로 놓친 이유가 결국 답이었다: **원본 헤더는 어두운 글자가 아니다.** 흰 획에
//   검정 링을 두른 활자라, '밝은 바탕 위 어두운 글자'를 찾는 자에는 링만 잡히고 획은 안 잡힌다.
//
// 무엇을 재는가 — 가로 단면의 **'검정런 → 흰 속살 → 검정런'** 패턴 수.
//   민무늬(솔리드) 글자는 검정런만 나오고 속살이 없다. 외곽선 활자는 검정런마다 속살이 낀다.
//   지표 = **속살비 = 흰속살 수 ÷ 검정런 수**. 원본 실측 0.32(레벨69) · 0.38(플래티넘 리본).
//
// ⚠️ 함정 대비:
//   ⓐ **띠를 클론 DOM 에서 받는다** — 제목 선택자를 명시로 준다(휴리스틱 금지, ⑵ 의 교훈).
//   ⓑ 원본 488~499px / 클론 499px 로 폭이 다르다 — 띠는 %W·%H 로 옮긴다.
//   ⓒ 원본에서 잰 글자 높이가 클론과 30% 넘게 다르면 같은 글자를 안 보고 있다 → `띠어긋남`.
//   ⓓ 게임 페이지 안에서는 `new Function` 이 막힌다 — 화소 계측은 **빈 페이지**에서 돈다.
//
// 사용: node tools/probe-header-ring.js            (전 화면 대조표)
//       node tools/probe-header-ring.js <화면이름> …
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_DIR = path.resolve(__dirname, '../ref/screens');
const ONLY = process.argv.slice(2).filter(a => !a.startsWith('-'));

// ⓐ 이 블록이 손댄 제목들 + 앞 패스가 이미 흰+외곽선으로 만들어 둔 제목들(대조군)
const TITLES = '.sheet-title, .tb-title, .sellwarn-title, .offline-title, .profile-title, .af-title, .fi-title, .asc-focus-title, .rates-head h3, .league-title, .dgd-title, .dgclear-title';

function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    const lit = src.slice(i + 'const SCREENS = '.length, j + 2);
    return new Function('PETS_STATE_SRC', 'return ' + lit)(PETS_STATE_SRC);
}

const PICK = (sel) => {
    const vis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 8) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
    };
    // 🚨 **지금 맨 위에 떠 있는 면 안에서만 고른다.** 1차 판은 document 전체에서 첫 매치를 집었는데,
    //    앞 화면에서 연 시트가 뒤에 그대로 남아 있어 25화면 중 18화면에 같은 제목(`스킬, 펫 & 기술`)이
    //    찍혔다 — 띠가 엉뚱한 데로 가니 원본 쪽이 죄다 '표본없음'으로 나왔다.
    const surfaces = [...document.querySelectorAll('.modal:not(.hidden) .modal-card, .modal:not(.hidden) .sheet, .modal-card.sheet')].filter(vis);
    let els = [];
    for (let i = surfaces.length - 1; i >= 0 && !els.length; i--) els = [...surfaces[i].querySelectorAll(sel)].filter(vis);
    if (!els.length) els = [...document.querySelectorAll(sel)].filter(vis);
    if (!els.length) return { ok: false };
    // 같은 면에 제목 후보가 여럿이면 **글꼴이 가장 큰 것**이 그 화면의 제목이다
    els.sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize));
    const el = els[0], r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return {
        ok: true, cls: String(el.className).slice(0, 22),
        txt: (el.textContent || '').trim().slice(0, 14),
        x: r.x, y: r.y, w: r.width, h: r.height,
        fs: parseFloat(s.fontSize), stroke: s.webkitTextStrokeWidth || '0px', color: s.color,
    };
};

// 빈 페이지: 띠 안 가로 단면의 '검정런 → 흰속살 → 검정런' census
const RING = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const x0 = Math.max(0, Math.round(W * a.x0)), x1 = Math.min(W, Math.round(W * a.x1));
    const y0 = Math.max(0, Math.round(H * a.y0)), y1 = Math.min(H, Math.round(H * a.y1));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < 10 || bh < 6) return { n: 0 };
    const d = g.getImageData(x0, y0, bw, bh).data;
    const L = (x, y) => { const k = (y * bw + x) * 4; return Math.max(d[k], d[k+1], d[k+2]); };
    const BLACK = 70, LIGHT = 170;

    let top = -1, bot = -1;
    for (let y = 0; y < bh; y++) {
        let n = 0; for (let x = 0; x < bw; x++) if (L(x, y) <= BLACK) n++;
        if (n >= 3) { if (top < 0) top = y; bot = y; }
    }
    if (top < 0 || bot - top < 4) return { n: 0 };

    const blk = [], core = [];
    for (let y = top + 1; y <= bot - 1; y++) {
        let x = 0;
        while (x < bw) {
            if (L(x, y) > BLACK) { x++; continue; }
            let e = x; while (e < bw && L(e, y) <= BLACK) e++;
            if (x > 0 && e < bw) {
                blk.push(e - x);
                // 검정런 바로 뒤가 밝은 구간이고, 그 뒤가 다시 검정이면 '속살'이다
                let w2 = e; while (w2 < bw && L(w2, y) >= LIGHT) w2++;
                if (w2 > e && w2 < bw && L(w2, y) <= BLACK) core.push(w2 - e);
            }
            x = e;
        }
    }
    const med = (v) => v.length ? v.slice().sort((p, q) => p - q)[v.length >> 1] : 0;
    return { n: blk.length, gh: bot - top + 1, blk: med(blk), core: med(core), coreN: core.length,
             rate: +(core.length / (blk.length || 1)).toFixed(3) };
})`;

(async () => {
    const SCREENS = loadScreens();
    const targets = (ONLY.length ? SCREENS.filter(s => ONLY.includes(s[0])) : SCREENS).filter(s => s[1]);
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const meas = await browser.newPage();
    await meas.goto('about:blank');
    const measure = (buf, band) => meas.evaluate(({ src, a }) => (new Function('return ' + src))()(a),
        { src: RING, a: { dataUrl: 'data:image/png;base64,' + buf.toString('base64'), ...band } });

    const READY = 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene';
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'S && S.forgeLevel === 29 && ' + READY, { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { };
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
            await page.waitForTimeout(100);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(620);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(130);
            const hd = await page.evaluate(PICK, TITLES);
            if (!hd.ok) continue;
            const shot = await page.screenshot({ timeout: 180000 });
            const pad = Math.max(2, hd.h * 0.12);
            const band = { y0: (hd.y - pad) / 892, y1: (hd.y + hd.h + pad) / 892, x0: 0.12, x1: 0.88 };
            const cl = await measure(shot, band);
            const rfFile = path.join(REF_DIR, 'shot-' + ref + '.png');
            const rf = fs.existsSync(rfFile) ? await measure(fs.readFileSync(rfFile), band) : { n: 0 };
            rows.push({ name, hd, cl, rf });
        } catch (e) { /* 화면 하나가 안 열려도 census 는 계속 */ }
    }
    await browser.close();

    console.log('화면              제목          클래스        스트로크   ── 원본 속살비 ──  ── 클론 속살비 ──');
    const pairs = [];
    for (const { name, hd, cl, rf } of rows) {
        if (!cl.n) { console.log(`${name.padEnd(17)} ${hd.txt.padEnd(13)} ${hd.cls.padEnd(13)} ${hd.stroke.padEnd(9)} 클론 표본없음`); continue; }
        const clS = `${cl.rate} (속살 ${cl.coreN}/${cl.n} · 링 ${cl.blk}px · 속살 ${cl.core}px)`;
        if (!rf.n) { console.log(`${name.padEnd(17)} ${hd.txt.padEnd(13)} ${hd.cls.padEnd(13)} ${hd.stroke.padEnd(9)} 원본 표본없음     ${clS}`); continue; }
        // ⓒ 띠 매핑 자가진단
        const off = Math.abs(rf.gh - cl.gh) / Math.max(rf.gh, cl.gh);
        const rfS = off > 0.30 ? `띠어긋남(${(off * 100).toFixed(0)}%)`.padEnd(18) : `${rf.rate} (속살 ${rf.coreN}/${rf.n} · 링 ${rf.blk}px)`.padEnd(18);
        console.log(`${name.padEnd(17)} ${hd.txt.padEnd(13)} ${hd.cls.padEnd(13)} ${hd.stroke.padEnd(9)} ${rfS} ${clS}`);
        if (off <= 0.30) pairs.push({ name, r: rf.rate, c: cl.rate });
    }
    const solid = rows.filter(r => r.cl.n && r.cl.rate < 0.15).length;
    console.log(`\n클론 헤더 ${rows.filter(r => r.cl.n).length}개 중 **민무늬(속살비 <0.15)** ${solid}개`);
    if (pairs.length) {
        const dr = pairs.map(p => p.c - p.r).sort((a, b) => a - b);
        console.log(`띠가 맞는 짝 ${pairs.length}개 — 속살비 Δ 중앙값 ${(dr[dr.length >> 1] >= 0 ? '+' : '') + dr[dr.length >> 1].toFixed(3)} (음수 = 클론이 아직 민무늬)`);
    }
})();
