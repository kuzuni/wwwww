// 전 화면 콘솔 에러 스모크 — shot-screens.js와 같은 화면 목록을 열되 **스크린샷을 찍지 않는다.**
// 3D 렌더 루프를 멈추고 DOM만 돌리므로 31화면이 수십 초에 끝난다(shot-screens는 장당 15~30초).
// 캡처 결과물이 필요할 때는 shot-screens.js를, 회귀(에러 0건) 확인만 필요할 때는 이 도구를 쓴다.
// 사용: node probe-screens-errors.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// shot-screens.js의 SCREENS에서 오프너만 추출해 그대로 쓴다 — 목록이 갈라지지 않게 소스를 파싱한다.
// 🚨 오프너는 백틱 리터럴만이 아니라 **다른 모듈에서 가져온 상수**(예: `PETS_STATE_SRC`)일 수도 있다.
//    백틱만 받던 종전 정규식은 그런 줄을 조용히 빼먹었다 — 실제로 pets·pets-2 두 화면이
//    목록에서 사라져 31/31 이 29/29 가 됐고, **에러 검사가 안 되는 화면이 생긴 줄 아무도 몰랐다.**
//    그래서 ⑴ 식별자 오프너도 받고 ⑵ `require` 로 실제 값을 꺼내 쓰고 ⑶ 못 풀면 죽는다.
const fs = require('fs');
const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = [...SRC.matchAll(/^\s*\['([\w-]+)',\s*(?:'[\d]+'|null),\s*(`[^`]*`|[A-Z_][\w]*)\],/gm)].map(m => {
    const raw = m[2];
    if (raw[0] === '`') return [m[1], raw.slice(1, -1)];
    // 식별자 → shot-screens.js 가 그 이름을 가져오는 모듈에서 값을 꺼낸다
    const req = SRC.match(new RegExp(`const\\s*\\{[^}]*\\b${raw}\\b[^}]*\\}\\s*=\\s*require\\('([^']+)'\\)`));
    const val = req && require(req[1])[raw];
    if (typeof val !== 'string') throw new Error(`오프너 상수 ${raw} 를 못 풀었다 — 화면이 조용히 빠진다`);
    return [m[1], val];
});

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    let where = 'boot';
    page.on('pageerror', e => errs.push(`[${where}] ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/favicon\.ico/.test(m.text())) return; // 실제 파일 부재 — 게임 동작과 무관(QA 7차 판정)
        errs.push(`[${where}] ${m.text()}`);
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });
    // shot-screens.js와 같은 제작 팝업 차단 + 별칭 설치. 이 별칭이 없으면 craft-compare 오프너가
    // `UI._realShowCraftModal is not a function`으로 죽어 **매 실행마다 가짜 에러 1건**이 뜬다
    // (오프너 목록만 shot-screens.js에서 가져오고 그쪽 셋업은 안 가져와서 생긴 누락).
    await page.evaluate(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
    });

    // shot-screens.js의 SEED를 그대로 실행한다 (빈 화면·잠금으로 레이아웃이 안 뜨는 걸 방지) —
    // 시드가 갈라지면 '그 화면에서만 나는 에러'를 놓치므로 소스를 복사하지 않고 잘라 쓴다.
    const seedAt = SRC.indexOf('const SEED = () => {');
    const seedSrc = SRC.slice(seedAt + 'const SEED = '.length, SRC.indexOf('\n};', seedAt) + 2); // '() => { … }' (끝 세미콜론 제외)
    const seeded = await page.evaluate(s => {
        try { eval('(' + s + ')()'); return { ok: true }; } catch (e) { return { ok: false, err: e.message }; }
    }, seedSrc);
    if (!seeded.ok) errs.push(`[seed] ${seeded.err}`);

    let opened = 0;
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
        if (!r.ok) errs.push(`[${name}] 오프너 실패: ${r.err}`);
        else opened++;
        await page.waitForTimeout(120);
    }
    console.log(`화면 ${opened}/${SCREENS.length} 열림 · 콘솔 에러 ${errs.length}건`);
    errs.slice(0, 20).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(errs.length || opened !== SCREENS.length ? 1 : 0);
})();
