// 정의되지 않은 CSS 변수를 참조해 **선언이 통째로 죽은 자리**를 찾는다.
//
// 🚨 왜 필요한가 — 이 저장소가 같은 함정을 두 번 밟았다.
//   ⑴ `eggcell-slotname-noshadow`(2026-08-19) ⑵ `.chat-name`·`.bw-track span`·`.bw-sub`(2026-08-20).
//   셋 다 `var(--olc)` 를 썼는데 그 변수는 **`.equip-cell .cell-lv/.cell-star` 에만** 정의돼 있다.
//   CSS 의 `var()` 는 **계산값 시점**에 풀리므로, 변수가 없으면 그 값만 빠지는 게 아니라
//   **선언 전체가 무효**가 된다 — `text-shadow: 0 0 .45rem #ff1744, …, 0 2px 0 var(--olc)` 는
//   빨간 글로우까지 같이 죽어 `none` 이 됐다(보스 경고 배너에 글로우가 아예 없었다).
//   **아무도 안 짖는다**: 파서는 유효한 문법으로 받아들이고, 콘솔 에러도 `node --check` 도 안 난다.
//   눈으로도 안 잡힌다 — '원래 그런 디자인'으로 읽힌다.
//
// 판정: 스타일시트의 모든 규칙을 훑어 `var(--이름)` 을 **폴백 없이** 쓰는 선언을 모으고,
//   그 규칙에 실제로 매치되는 요소마다 `--이름` 이 계산값에 있는지 본다. 비어 있으면 죽은 선언이다.
//   ⚠️ `var(--x, 기본값)` 처럼 폴백이 있으면 선언이 안 죽으므로 대상이 아니다.
//   ⚠️ 요소가 없는 규칙은 판정하지 않는다(그 화면을 안 열었을 뿐일 수 있다) — 그래서 화면을 쓸어 본다.
//
// 사용: node probe-css-var-undefined.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitUiReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 화면 목록은 `shot-screens.js` 에서 그대로 가져온다 — 화면을 열어야만 존재하는 요소가 많다
// (`.chat-name` 은 채팅을 열어야 생긴다). 배열 소스를 평가하고 줄 수와 대조해 조용히 안 빠지게 한다.
const { PETS_STATE_SRC } = require('./shot-pets.js');
const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = (() => {
    const at = SRC.indexOf('const SCREENS = [');
    const arr = SRC.slice(at + 'const SCREENS = '.length, SRC.indexOf('\n];', at) + 3);
    void PETS_STATE_SRC;
    const rows = eval(arr);                                // eslint-disable-line no-eval
    const lines = (arr.match(/^\s*\['/gm) || []).length;
    if (rows.length !== lines) throw new Error(`화면이 조용히 빠졌다 — 줄 ${lines}개 vs 항목 ${rows.length}개`);
    return rows.map(r => [r[0], r[2]]);
})();
const SEED_SRC = (() => {
    const at = SRC.indexOf('const SEED = () => {');
    return SRC.slice(at + 'const SEED = '.length, SRC.indexOf('\n};', at) + 2);
})();

// 🚨 `document.styleSheets` 를 그대로 읽으면 **아무것도 못 읽는다.** 이 게임은 `file://` 로 도는데
//    거기서 `<link>` 로 불러온 시트는 교차출처 취급이라 `cssRules` 접근이 SecurityError 로 막힌다 —
//    `try/catch { continue }` 로 감싸면 **검사한 규칙 0개로 조용히 PASS** 한다(이 프로브를 짜면서
//    실제로 한 번 그렇게 통과했다. 이 저장소 함정 ⑤ 와 같은 계열이라 아래 `checked===0` 을 FAIL 로 둔다).
//    그래서 style.css 원문을 노드에서 읽어 **비활성 `<style>`** 로 심고 그쪽 규칙을 읽는다
//    (`sheet.disabled = true` — 규칙은 읽히지만 렌더에는 영향을 안 준다).
const CSS_TEXT = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

// 페이지 안에서 도는 스캐너 — 지금 DOM 에 있는 요소만 판정한다.
const SCAN = `(() => {
    const dead = [];
    const seenRules = [];
    const el = document.getElementById('__varscan');
    for (const sheet of [el && el.sheet].filter(Boolean)) {
        let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
        const walk = (list) => {
            for (const rule of list) {
                // 🚨 \`if (rule.cssRules) { walk(...); continue; }\` 로 쓰지 말 것 — 요즘 크롬은 **평범한
                //    CSSStyleRule 에도 (중첩 규칙용) 빈 cssRules 를 달아 준다.** 그래서 그렇게 쓰면
                //    모든 스타일 규칙이 '컨테이너'로 오인돼 통째로 건너뛰어지고 **검사 0건으로 통과**한다.
                //    비어 있지 않을 때만 내려가고, 자기 자신의 선언도 반드시 함께 본다.
                if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);   // @media 등 안쪽까지
                if (!rule.style || !rule.selectorText) continue;
                for (let i = 0; i < rule.style.length; i++) {
                    const prop = rule.style[i];
                    const val = rule.style.getPropertyValue(prop);
                    if (!val.includes('var(')) continue;
                    // 폴백 없는 var(--이름) 만 — var(--이름, 기본값) 은 선언이 안 죽는다
                    const names = [...val.matchAll(/var\\(\\s*(--[\\w-]+)\\s*\\)/g)].map(m => m[1]);
                    if (!names.length) continue;
                    let els; try { els = document.querySelectorAll(rule.selectorText); } catch (e) { continue; }
                    if (!els.length) continue;
                    seenRules.push(rule.selectorText + '{' + prop + '}');
                    for (const el of els) {
                        const cs = getComputedStyle(el);
                        const missing = names.filter(n => cs.getPropertyValue(n).trim() === '');
                        if (!missing.length) continue;
                        dead.push({ sel: rule.selectorText.slice(0, 90), prop, missing: missing.join(','),
                                    computed: (cs.getPropertyValue(prop) || '').slice(0, 24) });
                        break;   // 같은 규칙은 한 번만 신고한다
                    }
                }
            }
        };
        walk(rules);
    }
    return { dead, checked: seenRules.length };
})()`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => m.type() === 'error' && !/favicon\.ico/.test(m.text()) && errs.push(m.text()));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitUiReady(page, { timeout: 150000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        UI.toast = () => {};
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
    });
    await page.evaluate(s => { try { eval('(' + s + ')()'); } catch (e) {} }, SEED_SRC);
    // 규칙을 읽기 위한 비활성 사본 — 렌더에는 영향을 주지 않는다(위 🚨 참조).
    await page.evaluate(css => {
        const st = document.createElement('style');
        st.id = '__varscan'; st.textContent = css;
        document.head.appendChild(st);
        st.sheet.disabled = true;
    }, CSS_TEXT);

    // 죽은 선언을 규칙+속성 단위로 모은다(여러 화면에서 같은 규칙이 잡히면 한 번만 센다).
    const found = new Map();
    let checked = 0, screens = 0;
    for (const [name, opener] of [['(부팅 화면)', 'void 0'], ...SCREENS]) {
        const err = await page.evaluate((src) => {
            try {
                UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                UI.switchTab(null);
                eval(src);
            } catch (e) { return e.message; }
            return null;
        }, opener);
        if (err) { console.log(`  SKIP ${name} — ${err.slice(0, 50)}`); continue; }
        await page.waitForTimeout(120);
        const r = await page.evaluate(SCAN);
        screens++;
        checked = Math.max(checked, r.checked);
        for (const d of r.dead) {
            const k = d.sel + ' { ' + d.prop + ' }';
            if (!found.has(k)) found.set(k, { ...d, first: name });
        }
    }
    await browser.close();

    for (const [k, d] of found) {
        console.log(`  ✗ ${k}`);
        console.log(`      미정의 변수 ${d.missing} → 계산값 "${d.computed}" (처음 잡힌 화면: ${d.first})`);
    }
    const bad = [];
    if (found.size) bad.push(`${found.size}개 선언이 미정의 변수 때문에 통째로 죽어 있다`);
    if (!screens) bad.push('화면을 하나도 못 열었다(오프너 목록이 갈라졌다)');
    // 검사한 규칙이 0개면 '깨끗한 것'이 아니라 **스캐너가 아무것도 못 읽은 것**이다(위 🚨).
    if (!checked) bad.push('var() 를 폴백 없이 쓰는 선언을 하나도 못 읽었다 — 스캐너가 빈 채로 돌았다(style.css 를 못 심었거나 규칙을 못 읽는다)');
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 2).join(' | '));
    console.log(bad.length
        ? '\nFAIL — ' + bad.join(' · ')
        : `\nPASS — 화면 ${screens}개 · var() 를 폴백 없이 쓰는 선언 ${checked}개 전부 변수가 살아 있다`);
    process.exit(bad.length ? 1 : 0);
})();
