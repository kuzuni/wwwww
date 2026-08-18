// 폰 브라우저 '강제 다크모드' 옵트아웃 판정 — slug: force-light-color-scheme.
//
// 사용자 지적: "폰이 다크모드인데 UI 색 안 바뀌게 하라 했더니 바뀜. 컴퓨터로 볼 땐 정상, 폰으로 볼 때
// UI가 까매서 싫음." 폰 쪽 반전 주체는 셋이다 — ① 크롬 안드로이드 Auto Dark Theme,
// ② 안드로이드 WebView 의 FORCE_DARK(카카오·네이버 인앱 브라우저), ③ 삼성 인터넷 웹 다크모드.
// ①은 데스크톱 크로미움에서 **같은 구현**을 `--enable-features=WebContentsForceDark` 로 켤 수 있어
// 폰 없이 재현·고정할 수 있다. ②③은 "사이트에 다크 테마가 있으면 반전 대신 그걸 쓴다"는 휴리스틱이라
// prefers-color-scheme 블록 존재 여부가 방어선이다 — 그건 CSS 존재로 판정한다.
//
// 왜 게임 화면 픽셀 비교가 아니라 '기전' 판정인가:
//   게임 자체 스킨이 이미 어두워서(#0d1117 계열) 크롬의 "이미 다크한 페이지는 건드리지 않는다"
//   휴리스틱에 걸린다. 실제로 옵트아웃을 런타임에 지워도 게임 캡처 밝기는 67.7→69.6 으로 사실상
//   안 변한다(실측) — 즉 게임 픽셀은 옵트아웃이 살았는지 죽었는지를 못 가른다.
//   그래서 **게임의 진짜 <meta> 와 진짜 css/style.css 를 그대로 물린 밝은 시험판**을 만들어,
//   그 판이 강제 다크에서 안 뒤집히는지를 본다. 밝은 판이라 반전이 걸리면 즉시 갈린다.
//
// 사용: node tools/probe-force-dark.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const WEB = path.resolve(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const STYLE_CSS = fs.readFileSync(path.join(WEB, 'css/style.css'), 'utf8');

// 게임 index.html 에 실제로 박힌 color-scheme 메타를 그대로 떼어 쓴다(문서와 시험판이 어긋나지 않게).
const META = (INDEX_HTML.match(/<meta\s+name=["']color-scheme["'][^>]*>/i) || [''])[0];

// 밝은 판 — 원본 UI 의 흰 팝업 카드·금색 pill 을 대신한다. 반전이 걸리면 여기가 까매진다.
const CARD = `<div id="card" style="width:200px;height:120px;background:#ffffff;color:#111111">카드</div>
<div id="pill" style="width:200px;height:60px;background:#ffd54f;color:#111111">코인</div>`;

const TMP = path.join(__dirname, '.force-dark-probe.html');

function writePage({ meta, css }) {
    fs.writeFileSync(TMP, `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">${meta}
<style>${css}\nbody{display:block;background:#ffffff}</style></head><body>${CARD}</body></html>`);
    return 'file://' + TMP;
}

async function sample(url, forceDark) {
    const args = ['--use-gl=angle', '--enable-unsafe-swiftshader'];
    // 안드로이드 Auto Dark Theme 본체. cielab_based = 크롬이 실제로 쓰는 기본 반전 방식.
    if (forceDark) args.push('--enable-features=WebContentsForceDark:inverting_method/cielab_based');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 400 }, colorScheme: forceDark ? 'dark' : 'light' });
        await page.goto(url);
        await page.waitForTimeout(150);
        const buf = await page.screenshot({ timeout: 120000 });
        return await page.evaluate(async (dataUrl) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = dataUrl; });
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            const at = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
            return { card: at(100, 60), pill: at(100, 150) };
        }, 'data:image/png;base64,' + buf.toString('base64'));
    } finally {
        await browser.close();
    }
}

const same = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (p) => p.join(',');

(async () => {
    let fail = 0;
    const say = (ok, name, msg) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(26)} ${msg}`); };

    // ① 대조군 — 옵트아웃이 하나도 없는 판은 반드시 뒤집혀야 한다. 안 뒤집히면 이 환경에서 강제 다크
    //    자체가 안 켜진 것이라(플래그 변경 등) 아래 판정이 전부 무의미해진다. 먼저 환경부터 검증한다.
    const bare = writePage({ meta: '', css: '' });
    const bareLight = await sample(bare, false), bareDark = await sample(bare, true);
    const envOk = !same(bareLight.card, bareDark.card);
    say(envOk, '환경(대조군 반전)', `옵트아웃 없는 판: ${fmt(bareLight.card)} → ${fmt(bareDark.card)}`);
    if (!envOk) {
        console.log('\n강제 다크가 이 크로미움에서 안 켜진다 — 판정 불가. 플래그/브라우저 확인 후 재실행.');
        fs.unlinkSync(TMP); process.exit(1);
    }

    // ② 메타만 — 게임 index.html 의 메타가 그 자체로 옵트아웃인가.
    //    (`content="light"` 는 옵트아웃이 아니다. `only` 가 있어야 한다.)
    const metaOnly = writePage({ meta: META, css: '' });
    const mL = await sample(metaOnly, false), mD = await sample(metaOnly, true);
    say(same(mL.card, mD.card), 'index.html 메타 단독', `${META || '(메타 없음)'} → ${fmt(mL.card)}/${fmt(mD.card)}`);

    // ③ CSS만 — style.css 의 :root color-scheme 이 그 자체로 옵트아웃인가.
    const cssOnly = writePage({ meta: '', css: STYLE_CSS });
    const cL = await sample(cssOnly, false), cD = await sample(cssOnly, true);
    say(same(cL.card, cD.card) && same(cL.pill, cD.pill), 'style.css 단독',
        `카드 ${fmt(cL.card)}/${fmt(cD.card)} · pill ${fmt(cL.pill)}/${fmt(cD.pill)}`);

    // ④ 실제 조합 — 게임이 배포되는 그대로(메타+CSS).
    const both = writePage({ meta: META, css: STYLE_CSS });
    const bL = await sample(both, false), bD = await sample(both, true);
    say(same(bL.card, bD.card) && same(bL.pill, bD.pill), '실제 조합(메타+CSS)',
        `카드 ${fmt(bL.card)}/${fmt(bD.card)} · pill ${fmt(bL.pill)}/${fmt(bD.pill)}`);

    // ⑤ 휴리스틱 반전기(삼성 인터넷·WebView FORCE_DARK) 방어선 — "다크 테마를 가진 사이트"로 보이게
    //    하는 prefers-color-scheme: dark 블록이 살아 있는가. 픽셀로는 못 재고(그 브라우저가 없다) 존재로 판정.
    const hasDarkBlock = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/.test(STYLE_CSS);
    say(hasDarkBlock, 'prefers-dark 블록 존재', hasDarkBlock ? 'style.css 에 있음' : 'style.css 에 없음 — 휴리스틱 반전기가 색을 뒤집는다');

    // ⑥ 고대비(forced-colors) 모드에서 시스템 팔레트로 갈아끼우는 것 차단.
    const hasForcedColors = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)/.test(STYLE_CSS);
    say(hasForcedColors, 'forced-colors 처방 존재', hasForcedColors ? 'style.css 에 있음' : 'style.css 에 없음');

    fs.unlinkSync(TMP);
    console.log(fail ? `\n${fail}건 FAIL — 폰 강제 다크모드가 UI 색을 뒤집을 수 있다.`
        : '\n전건 PASS — 강제 다크모드가 페이지 색을 못 건드린다.');
    process.exit(fail ? 1 : 0);
})();
