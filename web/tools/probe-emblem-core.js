// 엠블럼 글리프(스킬 18종 + 기술 노드 6종)의 **속살 생존율**을 잰다 — 키라인을 두껍게 할 때
// 가는 부재(검 자루·창 대·모래시계 목)가 통째로 검게 먹히는 사고를 수치로 잡는 검사기.
//
// 왜 필요했나 (2026-08-19 UI 스트림):
//   `emblem()` 의 키라인을 원본 실측 비(6.7%)로 올리려다 되돌린 적이 있다. 두께를 올리면
//   경계 검정 비율(`probe-icon-keyline`)은 **좋아지기만 한다** — 그 지표는 '테가 있나'만 보지
//   '테가 그림을 다 먹었나'는 안 본다. 실제로 검·창은 날이 통째로 검은 막대기가 됐는데도
//   키라인 검사는 만점이었다. 그래서 **반대 방향 지표**가 하나 더 필요하다.
//
// 재는 법: 아이콘을 **실제 표시 크기(38px — 스킬 오브 글리프 실측 37.6px)** 로 줄인 뒤
//   실루엣(알파 ≥ 120) 중 **밝은 속살**(루마 ≥ 110) 픽셀의 비율을 낸다.
//   ⚠️ 굽기 해상도(128px)에서 재면 안 된다 — 거기서는 어떤 테를 둘러도 속살이 넉넉히 남는다.
//      화면에서 속살이 보이느냐가 문제이므로 **줄인 뒤에** 재야 한다.
//   ⚠️ 루마 문턱을 낮추면(예: 60) 테의 안티에일리어싱 회색이 속살로 잡혀 지표가 무뎌진다.
//      110 은 '흰~등급색 채움'과 '검정 테 + 그 AA'를 가르는 자리다.
//
// 사용: node probe-emblem-core.js [최소%]        (기본 34%)
//       node probe-emblem-core.js --json         (수치만 JSON 으로 — 전후 비교용)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const JSON_OUT = process.argv.includes('--json');
const MIN = Number(process.argv.find(a => /^\d+(\.\d+)?$/.test(a)) || 34);
const AT = 38;   // 스킬 오브 안 글리프 실측 표시 크기

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof IconGen !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });

    const rows = await page.evaluate(async (at) => {
        const names = Object.keys(IconGen.draw).filter(n => /^sk_|^tm_/.test(n));
        const out = [];
        for (const name of names) {
            let u = '';
            try { u = IconGen.url(name); } catch (e) { }
            if (!u) { out.push({ name, err: 'url 없음' }); continue; }
            const im = new Image();
            await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
            const c = document.createElement('canvas');
            c.width = at; c.height = at;
            const x = c.getContext('2d');
            x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
            x.drawImage(im, 0, 0, at, at);
            const d = x.getImageData(0, 0, at, at).data;
            let sil = 0, core = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 120) continue;                     // 실루엣 안쪽만
                sil++;
                const luma = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                if (luma >= 110) core++;                          // 밝은 속살
            }
            out.push({ name, sil, core, pct: sil ? +(core / sil * 100).toFixed(1) : 0 });
        }
        return out;
    }, AT);

    const bad = rows.filter(r => r.err || r.pct < MIN);
    if (JSON_OUT) {
        console.log(JSON.stringify(rows.reduce((m, r) => (m[r.name] = r.pct, m), {}), null, 0));
    } else {
        rows.sort((a, b) => (a.pct || 0) - (b.pct || 0));
        for (const r of rows) {
            const mark = r.err ? '??' : (r.pct < MIN ? '!!' : 'ok');
            console.log(`  ${mark} ${r.name.padEnd(18)} 속살 ${String(r.pct).padStart(5)}%  (실루엣 ${r.sil}px)`);
        }
        console.log(`\n${AT}px 표시 기준 속살 ${MIN}% 미달 ${bad.length}종 / ${rows.length}종 · 콘솔 에러 ${errs.length}건`);
        if (bad.length) console.log('  미달: ' + bad.map(r => `${r.name}(${r.err || r.pct + '%'})`).join(', '));
        console.log(bad.length === 0 && errs.length === 0 ? '\n✅ PASS' : '\n❌ FAIL');
    }
    await browser.close();
    process.exit(bad.length === 0 && errs.length === 0 ? 0 : 1);
})();
