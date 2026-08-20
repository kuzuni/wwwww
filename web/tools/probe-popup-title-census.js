// probe-popup-title-census.js — 팝업마다 '제목'이 **어떤 요소**인지 전수로 적는다.
// 짝: css/style.css 의 '화풍 ⓕ-㉴ 헤더 블록 타이포' 블록(선택자 목록의 근거).
//
// 왜: ㉴ 를 손대려고 제목 규칙을 `.sheet-title` 류 **클래스 이름으로** 모았더니, 정작 소환 확률
//     팝업의 `레벨 69` 는 클래스가 없는 **맨 `<h3>`**(`.rates-head h3`)이라 빠졌다. 클래스 census 는
//     '클래스가 붙은 제목'만 센다 — 안 붙은 제목은 세지 못한다는 게 이 저장소의 반복된 함정이다.
//     그래서 **화면을 열어 DOM 에서** 제목 후보(h1~h4 + *-title 류)를 전수로 적는다.
//
// ⚠️ 열려 있는 팝업 안만 본다 — 앞 화면에서 연 시트가 뒤에 남아 있으면 그 제목이 먼저 잡힌다
//    (probe-header-ring 1차 판이 이걸로 25화면 중 18화면에 `스킬, 펫 & 기술` 을 찍었다).
//
// 사용: node tools/probe-popup-title-census.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    return new Function('PETS_STATE_SRC', 'return ' + src.slice(i + 'const SCREENS = '.length, j + 2))(PETS_STATE_SRC);
}

const SWEEP = () => {
    const open = [...document.querySelectorAll('.modal:not(.hidden)')];
    const roots = open.length ? open : [];
    const out = [];
    for (const root of roots) {
        for (const el of root.querySelectorAll('h1,h2,h3,h4,[class*="-title"],[class*="-head"]')) {
            const r = el.getBoundingClientRect();
            if (r.width < 12 || r.height < 8) continue;
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < .05) continue;
            const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
            if ((own.match(/[0-9A-Za-z가-힣]/g) || []).length < 1) continue;   // 컨테이너(자기 글자 없음) 제외
            out.push({ tag: el.tagName, cls: String(el.className).slice(0, 26), txt: own.slice(0, 14),
                       fs: +parseFloat(s.fontSize).toFixed(1), y: +r.y.toFixed(0),
                       color: s.color, stroke: s.webkitTextStrokeWidth });
        }
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
            await page.waitForTimeout(620);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(120);
            const els = await page.evaluate(SWEEP);
            if (!els.length) { console.log(`${name.padEnd(17)} (열린 팝업 없음)`); continue; }
            els.sort((a, b) => b.fs - a.fs);
            const top = els[0];
            console.log(`${name.padEnd(17)} 최대글꼴 ${String(top.fs + 'px').padEnd(7)} <${top.tag.toLowerCase()} class="${top.cls}"> "${top.txt}"  색 ${top.color} 획 ${top.stroke}`);
            for (const e of els) {
                const key = `${e.tag.toLowerCase()}.${e.cls || '(무클래스)'}`;
                if (!tally.has(key)) tally.set(key, { n: 0, fs: e.fs, ex: e.txt, color: e.color, stroke: e.stroke });
                tally.get(key).n++;
            }
        } catch (e) { console.log(`${name.padEnd(17)} SKIP ${e.message.slice(0, 50)}`); }
    }
    await browser.close();
    console.log('\n===== 제목 후보 전수(글꼴 큰 순) =====');
    for (const [k, v] of [...tally.entries()].sort((a, b) => b[1].fs - a[1].fs)) {
        console.log(`  ${String(v.fs + 'px').padEnd(8)} ${k.padEnd(38)} ×${String(v.n).padEnd(3)} "${v.ex}"  색 ${v.color} 획 ${v.stroke}`);
    }
})();
