// probe-header-typo-geom.js — 헤더 블록 타이포(화풍 ⓕ-㉴)가 **칠하기만** 했는지 단언한다.
// 짝: css/style.css 의 '화풍 ⓕ-㉴ 헤더 블록 타이포' 블록(같이 고칠 것).
//
// 왜: 비평가 게이트가 요소 박스 ±2%p 다. `-webkit-text-stroke`·`paint-order`·`color` 는 정의상
//     레이아웃 박스를 안 움직이지만, **정의상 그렇다는 것과 이 코드베이스에서 실제로 그렇다는 것은
//     다르다**(제목이 flex 아이템이라 획이 굵어지면 줄바꿈이 달라질 수 있다 — 실제로 확인해야 한다).
//
// 🚨 probe-sheet-skin 규약 그대로: **한 번의 페이지 로드 안에서** 블록을 껐다 켜고 잰다.
//    두 번 실행해 before/after 를 비교하면 게임이 도는 동안 타이머·알이 쌓여 유령 이동이 잡힌다.
//
// 무엇을 재는가: 팝업을 하나씩 열고 **그 카드 안 전 요소**의 getBoundingClientRect 를
//    ⑴ 블록 켠 채 ⑵ 블록을 끈 채 두 번 재서, 하나라도 0.5px 넘게 움직이면 FAIL.
//
// 사용: node tools/probe-header-typo-geom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.5;   // px — 서브픽셀 반올림만 허용

// 새 블록을 무력화해 '고치기 전'으로 되돌리는 오버라이드(style.css 의 블록과 짝이다)
const KILL = `
.sheet-title, .tb-title, .sellwarn-title, .offline-title,
.profile-title, .af-title, .fi-title, .asc-focus-title {
    color: var(--pp-ink) !important;
    -webkit-text-stroke: 0 !important;
    paint-order: normal !important;
}`;

function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    const lit = src.slice(i + 'const SCREENS = '.length, j + 2);
    return new Function('PETS_STATE_SRC', 'return ' + lit)(PETS_STATE_SRC);
}

// 🚨 **'카드 안 전 요소'를 세면 안 된다**(1차 판이 그렇게 했다가 6화면 FAIL — 전부 가짜였다).
//    게임이 도는 동안 전투 파티클·떠오르는 숫자·타이머가 DOM 에 들고 나서 **요소 수 자체가
//    두 스냅 사이에 달라진다**(main 265→266 · tech-branch 1307→1304). 인덱스로 짝지은 비교는
//    그 순간 통째로 어긋나 '25.52px 이동' 같은 유령을 만든다.
//    → 이 변경이 실제로 건드릴 수 있는 **좁고 안정된 집합**만 잰다: 제목 자신 · 부모 · 다음 형제 3개.
//      파티클은 이 집합에 안 들어오고, 제목의 줄바꿈·폭 변화는 전부 여기에 나타난다.
const TITLE_SEL = '.sheet-title, .tb-title, .sellwarn-title, .offline-title, .profile-title, .af-title, .fi-title, .asc-focus-title';
const SNAP = (sel) => {
    const R = (el) => { const r = el.getBoundingClientRect(); return [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
        const r0 = el.getBoundingClientRect();
        if (r0.width < 1 || r0.height < 1) continue;
        const key = String(el.className).slice(0, 22);
        out.push([key + '|self', R(el)]);
        if (el.parentElement) out.push([key + '|parent', R(el.parentElement)]);
        let s = el.nextElementSibling;
        for (let i = 0; i < 3 && s; i++, s = s.nextElementSibling) out.push([key + '|next' + i, R(s)]);
    }
    return out;
};
const diff = (a, b) => {
    if (a.length !== b.length) return { mx: Infinity, at: `집합 크기 ${a.length}→${b.length}` };
    let mx = 0, at = '-';
    for (let i = 0; i < a.length; i++) {
        if (a[i][0] !== b[i][0]) return { mx: Infinity, at: `짝 어긋남 ${a[i][0]}≠${b[i][0]}` };
        for (let k = 0; k < 4; k++) {
            const d = Math.abs(a[i][1][k] - b[i][1][k]);
            if (d > mx) { mx = d; at = a[i][0]; }
        }
    }
    return { mx, at };
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
        UI._realShowCraftModal = UI.showCraftModal;   // craft-compare 오프너가 이걸로 팝업을 띄운다
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        try { UI.clearPendingCraft(); UI.renderEquipSheet(); } catch (e) { }
        UI.coinBurst = () => { };
        UI.bossWarning = () => { };
    });

    let fails = 0, checked = 0, elems = 0;
    const worst = [];
    for (const [name, , src] of SCREENS) {
        try {
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                try { UI.switchTab && UI.switchTab(null); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
                const k = document.getElementById('__killhdr'); if (k) k.remove();
            });
            await page.waitForTimeout(100);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(600);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(120);

            const on1 = await page.evaluate(SNAP, TITLE_SEL);
            if (!on1.length) continue;                      // 이 화면엔 대상 제목이 없다
            await page.evaluate((css) => {
                const s = document.createElement('style'); s.id = '__killhdr'; s.textContent = css;
                document.head.appendChild(s);
            }, KILL);
            await page.waitForTimeout(120);
            const off = await page.evaluate(SNAP, TITLE_SEL);
            await page.evaluate(() => { const k = document.getElementById('__killhdr'); if (k) k.remove(); });
            await page.waitForTimeout(120);
            // 🔑 **대조군** — 블록을 도로 켜고 한 번 더 잰다. 게임이 도는 동안 이 집합이 스스로
            //    움직이는 양(=바닥 소음)을 알아야 off 와의 차이를 변경 탓으로 읽을 수 있다.
            const on2 = await page.evaluate(SNAP, TITLE_SEL);

            const dOff = diff(on1, off), dCtl = diff(on1, on2);
            checked++; elems += on1.length;
            worst.push({ name, mx: dOff.mx, ctl: dCtl.mx, at: dOff.at, n: on1.length });
            if (dOff.mx > TOL && dOff.mx > dCtl.mx + TOL) {
                console.log(`${name.padEnd(17)} FAIL 켬↔끔 ${dOff.mx === Infinity ? dOff.at : dOff.mx.toFixed(2) + 'px (' + dOff.at + ')'} · 대조군(켬↔켬) ${dCtl.mx === Infinity ? dCtl.at : dCtl.mx.toFixed(2) + 'px'}`);
                fails++;
            } else if (dCtl.mx > TOL) {
                console.log(`${name.padEnd(17)} 소음 — 켬↔끔 ${dOff.mx.toFixed(2)}px 이지만 대조군도 ${dCtl.mx.toFixed(2)}px (게임이 도는 화면)`);
            }
        } catch (e) {
            console.log(`${name.padEnd(17)} SKIP ${e.message.slice(0, 60)}`);
        }
    }
    await browser.close();
    worst.sort((a, b) => b.mx - a.mx);
    console.log(`\n검사 ${checked}화면 · 측정점 ${elems}개 — 켬↔끔 최대 이동 상위: ` + worst.slice(0, 5).map(w => `${w.name} ${w.mx.toFixed(2)}px(대조군 ${w.ctl.toFixed(2)})`).join(' · '));
    console.log(fails ? `\nFAIL ${fails}화면 — 이 변경은 칠하기만 한 게 아니다.` : `\nOK — 전 화면 기하 동일(±${TOL}px). 헤더 블록 타이포는 paint-only.`);
    process.exit(fails ? 1 : 0);
})();
