// 등록된 모든 아이콘의 **키라인 유무**를 한 번에 잰다 — 화풍에서 떨어져 나온 아이콘 색출용.
//
// 왜: 이 게임의 원본 아이콘 화법은 예외 없이 '순검정 키라인 + 평면 채움'인데, IconGen 은 시기별로
// 여러 세션이 늘려 온 탓에 **테 없는 그라디언트 아이콘**이 섞여 있다. 한 줄에 놓고 보면 바로
// 티가 나지만(재화 8종이 그렇게 잡혔다), 아이콘이 200종을 넘어 눈으로 다 볼 수가 없다.
//
// 재는 법: 아이콘을 **실제 표시 크기 급(28px)** 으로 줄인 뒤, 알파 실루엣의 **경계 픽셀**만 모아
// 그중 '거의 검정'(<70)인 비율을 낸다. 이 값이 낮으면 테가 없다는 뜻이다.
//   ⚠️ **원본 굽기 해상도(128px)에서 재면 안 된다** — 거기서는 1px 짜리 테도 또렷해서 전부
//      통과한다. 화면에서 테가 살아 있는지가 문제이므로 **줄인 뒤에** 재야 한다.
//   ⚠️ 경계 픽셀은 '알파가 있고 이웃 4방향 중 알파 0 이 있는' 픽셀이다. 알파만으로 잡아야
//      배경색 가정이 안 들어간다(아이콘은 투명 배경으로 굽힌다).
// 사용: node probe-icon-keyline.js [임계값]   (기본 45%)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MIN = Number(process.argv[2] || 45);
const AT = 28;   // 재는 크기 — 재화 pill(24px)·탭바(53px) 사이의 대표값

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
        const out = [];
        for (const name of Object.keys(IconGen.draw)) {
            let u = '';
            try { u = IconGen.url(name); } catch (e) { }
            if (!u) { out.push({ name, err: 'url 없음' }); continue; }
            const im = new Image();
            await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
            const ar = (IconGen.ASPECT && IconGen.ASPECT[name]) || 1;
            const w = Math.max(4, Math.round(at * ar)), h = at;
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const x = c.getContext('2d');
            x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
            x.drawImage(im, 0, 0, w, h);
            const d = x.getImageData(0, 0, w, h).data;
            const A = (px, py) => (px < 0 || py < 0 || px >= w || py >= h) ? 0 : d[(py * w + px) * 4 + 3];
            let edge = 0, dark = 0;
            for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
                const i = (py * w + px) * 4;
                if (d[i + 3] < 120) continue;                       // 실루엣 안쪽만
                // 🚨 '바깥' 판정을 안쪽 문턱(120)보다 **낮게** 잡으면(처음엔 40 이었다) 글로우가 있는
                //    아이콘에서 경계가 통째로 사라진다 — 스킬 글리프 18종·기술 노드 6종은
                //    `emblem()` 이 `shadowBlur` 로 알파 50~100 짜리 후광을 깔아서, 실루엣 이웃이
                //    전부 '알파 40 이상 = 안쪽'이 돼 **경계 0~8px** 로 잡혔다(측정 불가로 떨어졌다).
                //    안팎을 **같은 문턱**으로 갈라야 후광이 바깥으로 빠지고 테를 잴 수 있다.
                if (A(px - 1, py) >= 120 && A(px + 1, py) >= 120 && A(px, py - 1) >= 120 && A(px, py + 1) >= 120) continue;
                edge++;
                if (d[i] < 70 && d[i + 1] < 70 && d[i + 2] < 70) dark++;
            }
            out.push({ name, edge, pct: edge ? +((dark / edge) * 100).toFixed(1) : 0 });
        }
        return out;
    }, AT);
    await browser.close();

    // `dg_*` 는 아이콘이 아니라 **던전 배너의 배경 일러스트**(하늘·성벽·묘비 — ASPECT 3.45)다.
    // 풍경에 검정 테를 두르면 오히려 원본과 멀어지므로 화풍 검사에서 뺀다.
    const SCENERY = n => n.indexOf('dg_') === 0;
    // 🥚 알(egg·eggCracked)은 **일부러 검정 테가 없다** — 사용자 지시 2026-08-19 `outline-halve-egg-none`
    //    "펫 알 부분은 검정 아웃라인 빼기". 이 검사는 '테가 있나'를 보는데 알은 테가 없는 게 사양이라
    //    술어를 뒤집어 예외로 둔다(그 전엔 `OUTLINE.egg` 로 테를 둘러 통과시켜, 알 테를 빼라는 지시와
    //    정면 충돌했다 — slug `egg-outline-baked-in`). 알의 밝은 배경 실루엣은 몸통 자체의 그늘 림
    //    키라인(`_shadeFloor` 색, 순검정 아님)이 지킨다.
    const SKIN_NO_OUTLINE = n => n === 'egg' || n === 'eggCracked';
    const bad = rows.filter(r => !r.err && !SCENERY(r.name) && !SKIN_NO_OUTLINE(r.name) && r.edge >= 20 && r.pct < MIN).sort((a, b) => a.pct - b.pct);
    const broken = rows.filter(r => !SCENERY(r.name) && (r.err || r.edge < 20));
    console.log(`아이콘 ${rows.filter(r => !SCENERY(r.name)).length}종(배너 일러스트 dg_* 제외) · 표시 ${AT}px 로 줄인 뒤 실루엣 경계의 '거의 검정' 비율 (임계 ${MIN}%)\n`);
    console.log(`키라인 없음/약함 ${bad.length}종:`);
    bad.forEach(r => console.log(`  ${r.name.padEnd(24)} ${String(r.pct).padStart(5)}%  (경계 ${r.edge}px)`));
    if (broken.length) {
        console.log(`\n⚠️ 못 잰 것 ${broken.length}종(그림이 없거나 경계가 20px 미만 — 확인 필요):`);
        broken.forEach(r => console.log(`  ${r.name.padEnd(24)} ${r.err || '경계 ' + r.edge + 'px'}`));
    }
    const okN = rows.filter(r => !SCENERY(r.name)).length - bad.length - broken.length;
    console.log(`\n통과 ${okN}종 / 미달 ${bad.length}종 / 못 잼 ${broken.length}종 · 콘솔 에러 ${errs.length}건`);
    process.exit(0);
})();
