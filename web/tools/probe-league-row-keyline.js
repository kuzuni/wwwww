// 리그 랭킹 행의 닉네임·순위·전투력에 **검정 키라인**이 실제로 걸리는가
// (slug: league-row-ink-keyline, 2026-08-19 QA 19차 등재).
//
// 무엇이 문제였나: 키라인 규칙의 선택자가 `.league-row .lgr-name`/`.lgr-rank` 였는데 랭킹 행의
//   실제 클래스는 `.league-name`/`.league-rank` 다(`lgr-` 는 **리그 보상 팝업**의 접두사).
//   같은 규칙의 `.league-score` 는 정상으로 잡혀 **규칙이 살아 있는 것처럼 보였고**, 검정 봇 행에서는
//   배경이 어두워 우연히 멀쩡해 보여서 **파란 '내 행'에서만** 금색 전투력이 뭉갰다(2.44:1).
//
// 재는 것:
//  ① 선택자가 실제 노드를 잡는가 — `.league-row .league-name` > 0 이고 `.lgr-name` 은 문서 전체에서 0
//  ② 세 글자(닉네임·순위·전투력)에 **획**이 실제로 걸렸는가 — computed `-webkit-text-stroke-width` > 0
//  ③ 화소 — 파란 '내 행'의 전투력 글자 상자 안 **어두운 화소 비율**(원본 shot-042149 실측 20.6%)
//  ④ 회귀 — `.league-score` 의 드롭섀도가 그대로 살아 있는가(같은 규칙을 건드렸다)
//
// ⚠️ **클립 캡처를 쓰지 않는다** — 리그 화면은 1초 틱으로 다시 그려서, rect 를 읽은 뒤 클립으로 찍으면
//    그 사이 재렌더에 밀려 엉뚱한 자리를 찍는다(등재 메모가 남긴 계측 함정). 전체 프레임을 한 장 찍고
//    **같은 시점에 읽어 둔 rect** 로 캔버스에서 잘라 낸다.
// ⚠️ 대비(명암비)로 판정하지 않는다 — **원본도 잉크/배경 대비는 2.19:1 로 낮다.** 원본이 읽히는 이유는
//    색이 아니라 키라인이라, 여기서 대비를 기준으로 삼으면 '금색을 밝게 바꾸기'라는 틀린 처방을 부른다.
//
// 사용: node probe-league-row-keyline.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const SCALE = 3;
// % — **원본 실측 20.6% 를 그대로 하한으로 쓴다**(= 원본만큼은 어두워야 한다).
// 더 낮게 잡으면 이빨이 없다: 선택자 오타만 고치고 획을 안 넣은 상태(부드러운 드롭섀도만)가
// 13.4% 라, 12% 하한으로는 그 절반짜리 수정도 통과해 버린다(실측으로 확인하고 올렸다).
const DARK_MIN = 20;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: SCALE });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBootDone(page, { timeout: 180000 });
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; UI.openLeague(); });
    await page.waitForTimeout(900);

    // ①② DOM 카운트 + 획
    const dom = await page.evaluate(() => {
        const sw = (el) => el ? parseFloat(getComputedStyle(el).webkitTextStrokeWidth) || 0 : -1;
        const me = document.querySelector('.league-row.me');
        return {
            names: document.querySelectorAll('.league-row .league-name').length,
            ranks: document.querySelectorAll('.league-row .league-rank').length,
            legacy: document.querySelectorAll('.lgr-name, .lgr-rank').length,
            strokeName: sw(me && me.querySelector('.league-name')),
            strokeRank: sw(me && me.querySelector('.league-rank')),
            strokeCp: sw(me && me.querySelector('.league-name small')),
            scoreShadow: (() => { const e = me && me.querySelector('.league-score'); return e ? getComputedStyle(e).textShadow : ''; })(),
        };
    });
    ok(dom.names > 0 && dom.ranks > 0, `① 랭킹 행 이름/순위 노드를 못 잡는다 (name ${dom.names} · rank ${dom.ranks})`);
    ok(dom.legacy === 0, `① 문서에 없는 옛 클래스(.lgr-name/.lgr-rank)가 생겼다 — ${dom.legacy}개`);
    ok(dom.strokeName > 0, `② 닉네임에 획이 없다 (-webkit-text-stroke-width ${dom.strokeName})`);
    ok(dom.strokeRank > 0, `② 순위에 획이 없다 (${dom.strokeRank})`);
    ok(dom.strokeCp > 0, `② 전투력(small)에 획이 없다 (${dom.strokeCp}) — 부모 규칙만으로는 안 걸린다`);
    ok(/rgba?\(/.test(dom.scoreShadow) && dom.scoreShadow !== 'none',
        `④ .league-score 의 드롭섀도가 사라졌다 ("${dom.scoreShadow}")`);

    // ③ 화소 — 전체 프레임 한 장 + 같은 시점 rect
    const box = await page.evaluate(() => {
        const me = document.querySelector('.league-row.me');
        const cp = me && me.querySelector('.league-name small');
        if (!cp) return null;
        // ⚠️ **글자 상자만 잰다** — `small` 안에는 전투력 아이콘(어두운 쌍검)이 같이 들어 있어서
        //    요소 rect 를 그대로 쓰면 **획이 하나도 없어도 어두운 화소 18.8%** 가 나온다(실측).
        //    그 상태로는 이 검사에 이빨이 없으므로 Range 로 텍스트 노드의 잉크만 집는다.
        const tn = [...cp.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).pop();
        if (!tn) return null;
        const rg = document.createRange(); rg.selectNodeContents(tn);
        const r = rg.getBoundingClientRect();
        const rowBg = getComputedStyle(me).backgroundColor;
        return { x: r.x, y: r.y, w: r.width, h: r.height, rowBg };
    });
    ok(!!box, '③ 파란 내 행의 전투력 글자를 못 찾았다');
    if (box) {
        const shot = await page.screenshot();   // 전체 프레임(클립 금지 — 위 ⚠️)
        const px = await page.evaluate(async ([b64, box, scale]) => {
            const im = new Image();
            await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const x = Math.round(box.x * scale), y = Math.round(box.y * scale);
            const w = Math.round(box.w * scale), h = Math.round(box.h * scale);
            const d = g.getImageData(x, y, w, h).data;
            let dark = 0, total = 0;
            for (let i = 0; i < d.length; i += 4) {
                const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                total++;
                if (lum < 60) dark++;          // 순검정 키라인만 센다(파란 바탕 lum ≈ 80, 금색 ≈ 160)
            }
            return { darkPct: +(dark / total * 100).toFixed(1), w, h };
        }, [shot.toString('base64'), box, SCALE]);
        ok(px.darkPct >= DARK_MIN,
            `③ 전투력 글자 상자의 어두운 화소가 ${px.darkPct}% 다 (원본 20.6%, 하한 ${DARK_MIN}%) — 키라인이 없다`);
        console.log(`③ 내 행 전투력 상자 ${px.w}x${px.h}px · 어두운 화소 ${px.darkPct}% (원본 20.6% · 하한 ${DARK_MIN}%)`);
    }
    console.log(`①② 노드 name ${dom.names} · rank ${dom.ranks} · 옛클래스 ${dom.legacy} · 획 name ${dom.strokeName} / rank ${dom.strokeRank} / cp ${dom.strokeCp}`);

    ok(!errs.length, `콘솔/페이지 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    await browser.close();
    if (fails.length) { console.log('\nFAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\nPASS — 리그 랭킹 행 키라인');
})();
