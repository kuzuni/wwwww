// summon-back-glyph-spill 검증 — 좌하단 빨간 ◀ 뒤로 버튼의 흰 삼각형이 빨간 면 밖으로 새는가.
//
// 사양(이 게임의 기존 규약): `.league-back-btn` 이 2026-08-17 수정으로 세운 것 —
//   `font-size: 0` 으로 '◀' **문자**를 죽이고 흰 삼각형을 CSS(::before)로 직접 그린다.
//   (플랫폼 이모지 폰트가 ◀ 를 컬러 글리프로 그려 원본의 단색 흰 삼각형과 달라지기 때문.)
// 문제 2종(부화장 `.hatch-back` · 소환 바 `.summon-bar .back-btn`)만 이 규약 밖에 남아,
// 상자를 원본 비례로 납작하게 줄인 뒤에도 글리프 라인박스가 그대로라 아래로 흘러넘쳤다.
//
// 두 축으로 잰다 — 둘 다 통과해야 PASS:
//   ⓐ **구조**: 넘침(scrollH-clientH, scrollW-clientW) === 0 그리고 fontSize === 0.
//      ⚠️ fontSize 만 보면 '문자가 안 보인다'만 알 뿐 삼각형이 그려졌는지는 모른다 → ⓑ 를 같이 본다.
//   ⓑ **픽셀(자기교정 3단 촬영)**: 같은 clip 을 세 번 찍어 마스크를 **화면에서 만들어** 쓴다.
//        S0 = 버튼 `visibility:hidden`  → 배경만
//        S1 = 버튼 보임 + 글리프/::before 죽임 → S0 과 다른 픽셀 = **버튼 실루엣(빨간 면+검정 테)**
//        S2 = 평소                      → S1 과 달라진 흰 픽셀 = **삼각형(또는 ◀ 글리프)**
//      삼각형 픽셀이 실루엣 **밖**에 하나라도 있으면 삐져나온 것(FAIL), 안쪽이 0 이면 삼각형이
//      사라진 것(FAIL). 🚨 **버튼 rect 를 넓힌 '바깥 링에 흰 픽셀이 있나'로 재면 안 된다** —
//      시트 바탕이 흰색이라 대조군(던전·퀘스트)까지 전부 FAIL 로 나온다(이 프로브 초판이 그랬다).
//
// 사용: node probe-back-btn-glyph.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }];

// 대상 = 이번 버그 3종 + 규약대로 이미 고쳐진 대조군 3종(대조군은 자[尺]가 맞는지 보는 역할).
// ⚠️ 선택자는 반드시 **그 화면의 루트까지** 적을 것. `.sheet-back-btn` 처럼 여러 모달이 공유하는
// 클래스를 문서 전체에서 찾으면, 닫힌 모달 안의 같은 버튼이 `width>0` 으로 먼저 잡혀
// '삼각형 0개'라는 유령 FAIL 이 난다(이 프로브 2판이 퀘스트·상점·탈것에서 그랬다).
const TARGETS = [
    { label: '펫 부화장 ◀', nav: 'UI.switchTab("summon"); UI.switchSummonSub("pets");', sel: '#panel-summon .hatch-back' },
    { label: '스킬 소환 바 ◀', nav: 'UI.switchTab("summon"); UI.switchSummonSub("skills");', sel: '#panel-summon .summon-bar .back-btn' },
    { label: '탈것 소환 바 ◀', nav: 'UI.openMounts();', sel: '#mount-modal .summon-bar .back-btn' },
    { label: '던전 ◀(대조군)', nav: 'UI.openDungeons();', sel: '#dungeon-modal .sheet-back-btn' },
    { label: '퀘스트 ◀(대조군)', nav: 'UI.openQuests();', sel: '#quest-modal .sheet-back-btn' },
    { label: '상점 ◀(대조군)', nav: 'UI.openShop();', sel: '#shop-modal .sheet-back-btn' },
];

const HIDE_ID = 'probe-bbg-style';

// 세 장의 PNG 를 페이지 안에서 디코드해 마스크 비교한다(캔버스만 쓰고 외부 의존 없음).
async function diffShots(page, s0, s1, s2) {
    return page.evaluate(async ({ a, b, c }) => {
        const load = async (b64) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            return { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
        };
        const A = await load(a), B = await load(b), C = await load(c);
        if (A.w !== B.w || B.w !== C.w || A.h !== B.h || B.h !== C.h) return { err: 'clip 크기 불일치' };
        const diff = (X, Y, i) => Math.abs(X.d[i] - Y.d[i]) + Math.abs(X.d[i + 1] - Y.d[i + 1]) + Math.abs(X.d[i + 2] - Y.d[i + 2]);
        let silhouette = 0, glyphIn = 0, glyphOut = 0;
        for (let p = 0; p < A.w * A.h; p++) {
            const i = p * 4;
            const inBtn = diff(A, B, i) > 24;                 // 배경과 달라진 자리 = 버튼 실루엣
            if (inBtn) silhouette++;
            const isWhite = C.d[i] > 190 && C.d[i + 1] > 190 && C.d[i + 2] > 190;
            const changed = diff(B, C, i) > 24;               // 글리프를 켰을 때 달라진 자리
            if (changed && isWhite) { if (inBtn) glyphIn++; else glyphOut++; }
        }
        return { silhouette, glyphIn, glyphOut };
    }, { a: s0, b: s1, c: s2 });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const fails = [], rows = [];

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
        const errors = [];
        page.on('console', m => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });
        await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

        for (const t of TARGETS) {
            // 🚨 화면 전환 뒤 **반드시 한 박자 쉰다** — 전환 직후 바로 재면 아직 안 그려진 버튼이
            // `elementFromPoint` 에 안 잡혀 '보이는 것 없음' 유령 FAIL 이 난다(첫 뷰포트 첫 대상만
            // 골라서 실패하는 모양이라 코드 문제로 오해하기 쉽다 — 이 프로브 3판이 그랬다).
            await page.evaluate((nav) => {
                try { if (typeof UI.closeModal === 'function') UI.closeModal(); } catch (e) { }
                new Function(nav)();
            }, t.nav);
            await page.waitForTimeout(500);
            const m = await page.evaluate(({ nav, sel }) => {
                const el = [...document.querySelectorAll(sel)].find(e => {
                    const r = e.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0) return false;
                    // 실제로 '그려지고 있는' 버튼만 — 닫힌 모달 안의 유령을 배제한다.
                    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                    return !!hit && (hit === e || e.contains(hit));
                });
                if (!el) return { err: 'not found(보이는 것 없음): ' + sel };
                document.querySelectorAll('[data-probe-bbg]').forEach(n => n.removeAttribute('data-probe-bbg'));
                el.setAttribute('data-probe-bbg', '1');
                const cs = getComputedStyle(el), r = el.getBoundingClientRect();
                return {
                    x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                    fontSize: +(parseFloat(cs.fontSize) || 0).toFixed(2), radius: cs.borderRadius,
                    ovH: el.scrollHeight - el.clientHeight, ovW: el.scrollWidth - el.clientWidth,
                    box: `${el.clientWidth}×${el.clientHeight}`, content: `${el.scrollWidth}×${el.scrollHeight}`,
                };
            }, { nav: t.nav, sel: t.sel });
            if (m.err) { fails.push(`${vp.width}×${vp.height} ${t.label}: ${m.err}`); continue; }

            const PAD = 4;
            const clip = { x: Math.max(0, m.x - PAD), y: Math.max(0, m.y - PAD), width: m.w + PAD * 2, height: m.h + PAD * 2 };
            const setStyle = (css) => page.evaluate(({ css, id }) => {
                let s = document.getElementById(id);
                if (!s) { s = document.createElement('style'); s.id = id; document.head.appendChild(s); }
                s.textContent = css;
            }, { css, id: HIDE_ID });

            await setStyle('[data-probe-bbg]{visibility:hidden!important}');
            const s0 = (await page.screenshot({ clip })).toString('base64');
            await setStyle('[data-probe-bbg]{color:transparent!important;text-shadow:none!important}[data-probe-bbg]::before{display:none!important}[data-probe-bbg]::after{display:none!important}');
            const s1 = (await page.screenshot({ clip })).toString('base64');
            await setStyle('');
            const s2 = (await page.screenshot({ clip })).toString('base64');

            const px = await diffShots(page, s0, s1, s2);
            if (px.err) { fails.push(`${vp.width}×${vp.height} ${t.label}: ${px.err}`); continue; }

            const bad = [];
            if (m.ovH !== 0 || m.ovW !== 0) bad.push(`넘침 ${m.ovW}×${m.ovH}px(내용 ${m.content} vs 상자 ${m.box})`);
            if (m.fontSize !== 0) bad.push(`fontSize ${m.fontSize}px(문자 글리프 살아 있음)`);
            if (px.glyphOut > 0) bad.push(`삼각형 흰 픽셀 ${px.glyphOut}개가 버튼 실루엣 **밖**에 있다`);
            if (px.glyphIn === 0) bad.push('버튼 안에 삼각형 흰 픽셀이 0개(삼각형이 아예 없다)');

            rows.push([`${vp.width}×${vp.height}`, t.label.padEnd(14), `상자 ${m.w}×${m.h}`, `fs=${m.fontSize}`,
            `넘침 ${m.ovW}/${m.ovH}`, `삼각 안 ${px.glyphIn} 밖 ${px.glyphOut}`, bad.length ? 'FAIL' : 'PASS'].join(' | '));
            if (bad.length) fails.push(`${vp.width}×${vp.height} ${t.label}: ${bad.join(' · ')}`);
        }

        if (errors.length) fails.push(`${vp.width}×${vp.height} 콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
        await page.close();
    }
    await browser.close();

    console.log(rows.join('\n'));
    if (fails.length) { console.log('\nFAIL ' + fails.length + '건'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
    console.log('\nPASS — 전 뷰포트·전 버튼에서 삼각형이 빨간 면 안에 있다');
})();
