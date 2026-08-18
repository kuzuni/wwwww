// QA 17차 — UI 스트림 전용 전 화면 결함 스윕 (ui.js·css·index.html 도메인)
//
// 목적: 개별 화면 비율 항목(`ui-ratio-audit`)이 아니라, **전 화면에 공통으로 깔린 UI 결함**을 한 번에 훑는다.
// shot-screens.js 의 SCREENS·SEED 를 그대로 재사용하므로 화면 목록이 갈라지지 않는다.
//
// 재는 것 (전부 '되고 안 되고가 명확한' 비채점 결함):
//   ⓐ 가로 넘침   — 보이는 요소의 rect 가 `#app` 좌우 밖으로 나간다(레터박스 밖 = 잘림)
//   ⓑ 글자 잘림   — overflow 가 hidden/clip 인 요소에서 scrollWidth > clientWidth (라벨이 잘려 읽을 수 없다)
//   ⓒ 세로 넘침   — rect 가 `#app` 위/아래 밖으로 나간다(스크롤 컨테이너 안은 제외)
//   ⓓ 못 누르는 버튼 — [onclick]/button 의 중심점 hit-test 가 자기 자신도 자손도 아닌 다른 요소를 준다
//   ⓔ 0 크기 버튼 — 보이는데(visibility/display 살아 있음) rect 가 0 인 인터랙티브 요소
//
// ⚠️ 이 저장소의 Playwright 는 문자열 화살표 함수를 식으로 평가해 undefined 를 준다 —
//    반드시 `page.evaluate('(' + FN + ')()')` 로 즉시호출할 것.
//
// 사용: node probe-qa-uisweep.js [뷰포트W] [뷰포트H]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const VW = Number(process.argv[2] || 499);
const VH = Number(process.argv[3] || 892);

const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = [...SRC.matchAll(/^\s*\['([\w-]+)',\s*(?:'[\d]+'|null),\s*`([^`]*)`\],/gm)].map(m => [m[1], m[2]]);

// 한 화면에서 위 ⓐ~ⓔ 를 재는 페이지 내 스캐너. 문자열로 넘겨 즉시호출한다.
const SCAN = `() => {
    const app = document.getElementById('app');
    const A = app.getBoundingClientRect();
    const out = { hOver: [], clip: [], vOver: [], dead: [], zero: [] };
    const label = el => {
        const id = el.id ? '#' + el.id : '';
        const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
        const t = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 18);
        return el.tagName.toLowerCase() + id + cls + (t ? ' "' + t + '"' : '');
    };
    // 스크롤 컨테이너 안쪽은 '넘침'이 정상이다 — 조상 중 스크롤 가능한 게 있으면 넘침 판정에서 뺀다
    const inScroller = el => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/auto|scroll/.test(s.overflowY + s.overflowX)) return true;
        }
        return false;
    };
    // 열려 있는 최상단 오버레이(.modal) — 있으면 그 안쪽 요소만 '못 누름' 판정 대상이다.
    // 모달이 배경 버튼을 덮는 건 정상이라, 이 필터가 없으면 화면당 40여 건이 전부 오검출로 나온다.
    const openModals = [...app.querySelectorAll('.modal')].filter(m => {
        const s = getComputedStyle(m);
        return s.display !== 'none' && s.visibility !== 'hidden' && m.getBoundingClientRect().width > 0;
    });
    const topLayer = openModals.length ? openModals[openModals.length - 1] : null;

    const all = app.querySelectorAll('*');
    for (const el of all) {
        if (el.id === 'panel-debug' || el.closest('#panel-debug')) continue; // 디버그 패널 — 화면 밖 상주가 정상
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        const interactive = el.hasAttribute('onclick') || el.tagName === 'BUTTON' || /\\bbtn\\b/.test(el.className || '');
        if (r.width === 0 || r.height === 0) {
            if (interactive && el.offsetParent !== null) out.zero.push(label(el));
            continue;
        }
        // 앱 상자와 겹치는(=부분적으로 보이는) 요소만 '넘침'이다. 완전히 밖에 있는 건
        // 닫힌 시트/패널이 대기 위치에 있는 것이라 정상 — 이걸 안 거르면 화면당 6~7건이 전부 오검출이다.
        const overlaps = r.right > A.left + 1 && r.left < A.right - 1 && r.bottom > A.top + 1 && r.top < A.bottom - 1;
        if (!inScroller(el) && overlaps) {
            const left = A.left - r.left, right = r.right - A.right;
            if (left > 1 || right > 1) out.hOver.push(label(el) + ' [L+' + left.toFixed(1) + ' R+' + right.toFixed(1) + ']');
            const top = A.top - r.top, bot = r.bottom - A.bottom;
            if (top > 1 || bot > 1) out.vOver.push(label(el) + ' [T+' + top.toFixed(1) + ' B+' + bot.toFixed(1) + ']');
        }
        // ⓑ 글자 잘림 — overflow 가 잘리는데 내용이 더 넓다. 텍스트를 직접 가진 요소만 본다.
        const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (ownText && /hidden|clip/.test(s.overflowX) && el.scrollWidth - el.clientWidth > 1) {
            out.clip.push(label(el) + ' [scrollW ' + el.scrollWidth + ' > clientW ' + el.clientWidth + ']');
        }
        // ⓓ 못 누르는 버튼 — 중심 hit-test
        if (interactive && s.pointerEvents !== 'none' && (!topLayer || topLayer.contains(el))) {
            const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
            if (cx >= A.left && cx <= A.right && cy >= A.top && cy <= A.bottom) {
                const hit = document.elementFromPoint(cx, cy);
                if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
                    out.dead.push(label(el) + ' ← ' + label(hit) + ' 가 가림');
                }
            }
        }
    }
    return out;
}`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    let where = 'boot';
    page.on('pageerror', e => errs.push(`[${where}] ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/favicon\.ico/.test(m.text())) return;
        errs.push(`[${where}] ${m.text()}`);
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.evaluate(`(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; })()`);
    await page.evaluate(`(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
    })()`);

    const seedAt = SRC.indexOf('const SEED = () => {');
    const seedSrc = SRC.slice(seedAt + 'const SEED = '.length, SRC.indexOf('\n};', seedAt) + 2);
    const seeded = await page.evaluate(s => {
        try { eval('(' + s + ')()'); return { ok: true }; } catch (e) { return { ok: false, err: e.message }; }
    }, seedSrc);
    if (!seeded.ok) errs.push(`[seed] ${seeded.err}`);

    const report = [];
    for (const [name, opener] of SCREENS) {
        where = name;
        const r = await page.evaluate((src) => {
            try {
                UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                UI.closeDetail && UI.closeDetail();
                eval(src);
                return { ok: true };
            } catch (e) { return { ok: false, err: e.message }; }
        }, opener);
        if (!r.ok) { errs.push(`[${name}] opener: ${r.err}`); continue; }
        await page.waitForTimeout(420); // 등장 트랜지션이 끝난 뒤 재야 rect 가 축소돼 나오지 않는다(인계 메모 ㉣⑴)
        const scan = await page.evaluate('(' + SCAN + ')()');
        const n = scan.hOver.length + scan.clip.length + scan.vOver.length + scan.dead.length + scan.zero.length;
        if (n) report.push([name, scan]);
    }
    await browser.close();

    console.log(`\n=== QA UI 스윕 ${VW}x${VH} — 화면 ${SCREENS.length}개 ===`);
    const tally = { hOver: 0, clip: 0, vOver: 0, dead: 0, zero: 0 };
    for (const [name, s] of report) {
        console.log(`\n■ ${name}`);
        for (const k of Object.keys(tally)) {
            tally[k] += s[k].length;
            for (const line of s[k].slice(0, 8)) console.log(`   ${k}: ${line}`);
            if (s[k].length > 8) console.log(`   ${k}: … 외 ${s[k].length - 8}건`);
        }
    }
    console.log(`\n합계 — 가로넘침 ${tally.hOver} · 글자잘림 ${tally.clip} · 세로넘침 ${tally.vOver} · 못누름 ${tally.dead} · 0크기 ${tally.zero}`);
    console.log(`콘솔/스크립트 에러 ${errs.length}건${errs.length ? '\n  ' + errs.slice(0, 12).join('\n  ') : ''}`);
})();
