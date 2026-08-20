// probe-label-keyline-census.js — 클론의 **보이는 글자 요소 전수**를 훑어
// '검정 키라인이 있나 없나'를 선택자별로 적는다(화풍 ⓕ-㉴ 의 작업 목록).
//
// 왜 원본을 안 재고 클론만 재나 — ⓛ 이 여기서 막혔다. 라벨은 높이가 15~20px 뿐인데
//   원본과 클론 레이아웃이 요소마다 ±2%p(≈18px)까지 다르다. 그래서 **임의 요소의 띠를
//   원본에 옮기면 다른 것을 잰다**(실측: `무료/프리미엄` 띠에서 클론 '흰 속살 174px' =
//   아래 흰 트랙을 통째로 먹었다). 원본이 이 활자를 **전 화면에 걸쳐** 쓴다는 건 이미
//   두 근거로 확정돼 있다 — `probe-ring-sweep` 의 30화면 전부 음수(Δ 중앙값 -0.120), 그리고
//   `pass` 원본 크롭(제목·안내문·배지·탭 라벨·알약이 모두 흰+검정링). 남은 물음은
//   **"클론에서 어디가 아직 안 됐나"** 뿐이고, 그건 클론 DOM 만으로 정확히 답할 수 있다.
//
// 무엇을 세는가 — 자기 글자를 가진 요소마다 `-webkit-text-stroke-width` 와 `text-shadow` 를 읽어
//   ⑴ 키라인 있음(스트로크 >0 또는 그림자에 blur 0 링) ⑵ 없음 으로 가른다.
//   선택자(태그.클래스)별로 묶어 **없음이 많은 순**으로 인쇄한다 = 그대로 작업 목록이다.
//
// ⚠️ 함정 대비:
//   ⓐ **컨테이너를 글자 요소로 세지 말 것** — 자식 텍스트 노드가 있는 것만 센다(자손 글자는 그
//      자손이 따로 잡힌다). 안 그러면 카드 하나가 안쪽 글자 수만큼 중복으로 잡힌다.
//   ⓑ **안 보이는 것/뒤에 깔린 면은 빼야 한다** — 지금 맨 위에 떠 있는 면 안만 본다
//      (probe-header-ring 1차 판이 뒤 시트 제목을 18화면에 찍은 그 함정).
//   ⓒ 이모지·기호만 있는 요소는 활자가 아니다 — 한글/영숫자 1자 이상만.
//
// 사용: node tools/probe-label-keyline-census.js         (선택자별 집계)
//       node tools/probe-label-keyline-census.js screens (화면별로도 인쇄)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const BY_SCREEN = process.argv.includes('screens');

function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    return new Function('PETS_STATE_SRC', 'return ' + src.slice(i + 'const SCREENS = '.length, j + 2))(PETS_STATE_SRC);
}

const SWEEP = () => {
    const vis = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 7) return false;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
    };
    // ⓑ 맨 위에 떠 있는 면 하나만
    const surfaces = [...document.querySelectorAll('.modal:not(.hidden) .modal-card, .modal:not(.hidden) .sheet, .modal-card.sheet')].filter(vis);
    const root = surfaces.length ? surfaces[surfaces.length - 1] : (document.getElementById('app') || document.body);

    const out = [];
    for (const el of root.querySelectorAll('*')) {
        if (!vis(el)) continue;
        // ⓐ 자기 텍스트 노드가 있는 것만(컨테이너 제외)
        const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if ((own.match(/[0-9A-Za-z가-힣]/g) || []).length < 1) continue;   // ⓒ
        const s = getComputedStyle(el);
        const sw = parseFloat(s.webkitTextStrokeWidth) || 0;
        const sh = s.textShadow || 'none';
        // blur 0 인 그림자가 두 방향 이상이면 '링'으로 친다(이 저장소의 8방향 text-shadow 관용구)
        const hardRing = sh !== 'none' && (sh.match(/0px 0px|0px -|-?\d+px 0px/g) || []).length >= 2;
        const key = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        out.push({ key, has: sw > 0 || hardRing, fs: +parseFloat(s.fontSize).toFixed(1), txt: own.slice(0, 10) });
    }
    return out;
};

(async () => {
    const SCREENS = loadScreens();
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
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

    const tally = new Map();
    for (const [name, , src] of SCREENS) {
        try {
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                try { UI.switchTab && UI.switchTab(null); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
            });
            await page.waitForTimeout(100);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(600);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(120);
            const els = await page.evaluate(SWEEP);
            const miss = els.filter(e => !e.has).length;
            if (BY_SCREEN) console.log(`${name.padEnd(17)} 글자요소 ${String(els.length).padStart(3)}개 · 키라인 없음 ${String(miss).padStart(3)}개 (${(miss / (els.length || 1) * 100).toFixed(0)}%)`);
            for (const e of els) {
                if (!tally.has(e.key)) tally.set(e.key, { has: 0, no: 0, fs: e.fs, ex: e.txt, screens: new Set() });
                const t = tally.get(e.key);
                t[e.has ? 'has' : 'no']++;
                t.screens.add(name);
                if (e.fs > t.fs) { t.fs = e.fs; t.ex = e.txt; }
            }
        } catch (e) { console.log(`${name.padEnd(17)} SKIP ${e.message.slice(0, 50)}`); }
    }
    await browser.close();

    const rows = [...tally.entries()].filter(([, v]) => v.no > 0).sort((a, b) => b[1].no - a[1].no);
    const totalNo = [...tally.values()].reduce((s, v) => s + v.no, 0);
    const totalHas = [...tally.values()].reduce((s, v) => s + v.has, 0);
    console.log(`\n===== 키라인 **없는** 글자 요소 — 선택자별(많은 순) =====`);
    console.log(`  (전체 글자 요소 ${totalNo + totalHas}개 중 키라인 없음 ${totalNo}개 = ${(totalNo / (totalNo + totalHas) * 100).toFixed(0)}%)`);
    for (const [k, v] of rows.slice(0, 30)) {
        console.log(`  ${String(v.no).padStart(4)}개  ${k.padEnd(40)} 최대 ${String(v.fs + 'px').padEnd(7)} ${String(v.screens.size + '화면').padEnd(6)} "${v.ex}"${v.has ? `  (같은 선택자 중 ${v.has}개는 이미 있음)` : ''}`);
    }
})();
