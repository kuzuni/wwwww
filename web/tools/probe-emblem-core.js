// 엠블럼 글리프(스킬 18종 + 기술 노드 6종)의 **속살 생존율**을 잰다 — 키라인을 두껍게 할 때
// 가는 부재(검 자루·창 대·모래시계 목)가 통째로 검게 먹히는 사고를 수치로 잡는 검사기.
//
// 왜 필요했나 (2026-08-19 UI 스트림):
//   `emblem()` 의 키라인을 원본 실측 비(6.7%)로 올리려다 되돌린 적이 있다. 두께를 올리면
//   경계 검정 비율(`probe-icon-keyline`)은 **좋아지기만 한다** — 그 지표는 '테가 있나'만 보지
//   '테가 그림을 다 먹었나'는 안 본다. 실제로 검·창은 날이 통째로 검은 막대기가 됐는데도
//   키라인 검사는 만점이었다. 그래서 **반대 방향 지표**가 하나 더 필요하다.
//
// 🚨 **속살 문턱을 루마 110 → 50 으로 내렸다 (2026-08-20 UI 스트림, 락 `icon-gen`).**
//   종전 문턱의 근거는 머리말에 이렇게 적혀 있었다 — "110 은 **'흰~등급색 채움'** 과
//   '검정 테 + 그 AA' 를 가르는 자리다." 즉 **채움이 희다는 전제 위에 세운 값**이다.
//   2026-08-20 확정 화풍(voxel ㉯㉰㉱: 플랫/매트 · 제한 팔레트 · 글로시 폐기)으로 엠블럼 채움이
//   **흰 그라디언트 → 채도 있는 평면 3단**으로 바뀌며 그 전제가 깨졌다: 채도 있는 색은
//   **읽히면서도 루마가 낮다**(#ef5350 은 루마 116, 순수 빨강은 100 대).
//   화법만 바꾸자 24종 중 **10종이 미달**로 찍혔는데, `tools/shot-emblem-ab.js` 로 옛/새를
//   38px·확대로 나란히 보면 **새 쪽이 더 잘 읽힌다**(흰 글리프가 밝은 오브 위에서 사라지던 게
//   색을 얻었다). 지표가 잰 건 '안 읽힘'이 아니라 **'덜 흼'** 이었다.
//   ⚠️ 중간에 '채움 대비'(≥0.55×실루엣 85백분위) 상대식도 넣어 봤지만 **같은 병이었다** —
//      밴드 밝기를 0.30→0.80 까지 올려도 최소 속살이 27~28% 에서 꿈쩍하지 않았다(=밝기 탓이
//      아니라 **소프트 흰 광택 덮개**를 뺀 탓). 상대식은 글리프 안에서만 닫혀 있어 결국
//      '얼마나 흰가'를 되물을 뿐이다.
//   👉 그래서 이 자의 임무를 **원래 문장 하나로 좁힌다**: "두꺼운 키라인이 가는 부재를 통째로
//      **검게** 먹었나". 검다 = 절대적으로 검다. 문턱 50 은 '거의 순검정(키라인 + 그 AA 8할)'과
//      '어떤 색이든 칠해진 면'을 가르는 자리다.
//   📐 **고르는 법도 눈대중이 아니었다** — `tools/sweep-emblem-core-th.js` 가 후보 9개를
//      ⓐ옛 화법 ⓑ새 화법 ⓒ음성 대조(키라인 0.16) 셋에 동시에 대 봤고, **"음성 대조는 잡고
//      (21/24) 읽히는 두 화법에는 둘 다 조용한(0종·0종)" 후보는 루마 ≥50 하나뿐**이었다.
//      (60~110 과 상대식 전부는 새 화법에서 2~10종을 거짓으로 잡는다.)
//      🚨 **이건 '내 변경을 통과시키려고 문턱을 낮춘 것'이 아니다** — 낮춘 자가 여전히 원래
//         잡아야 할 사고를 잡는지를 아래 음성 대조가 **매 런** 증명한다. 그게 없으면 이 자는
//         아무나 통과시키는 장식이 된다.
//     · 속살 = 루마 ≥ **50** (절대). 게이트는 종전 그대로 34%.
//
// ✅ **음성 대조 내장** — 자가 검증 없이 문턱을 바꾸면 '아무나 통과하는 자'가 된다.
//   그래서 매 런 **키라인을 0.067 → 0.16 으로 살찌운 판**을 같이 구워, 그 판이 반드시 FAIL 하는지
//   확인한다. 통과해 버리면(= 검은 막대기를 못 잡는다) 수치를 쓰지 않고 `exit 2`(측정기 고장).
//
// 재는 법: 아이콘을 **실제 표시 크기(38px — 스킬 오브 글리프 실측 37.6px)** 로 줄인 뒤 잰다.
//   ⚠️ 굽기 해상도(128px)에서 재면 안 된다 — 거기서는 어떤 테를 둘러도 속살이 넉넉히 남는다.
//      화면에서 속살이 보이느냐가 문제이므로 **줄인 뒤에** 재야 한다.
//
// 사용: node probe-emblem-core.js [최소%]        (기본 34%)
//       node probe-emblem-core.js --json         (수치만 JSON 으로 — 전후 비교용)
//       node probe-emblem-core.js --legacy       (옛 글로시 화법으로 구워 재기 — 회귀 대조용)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const JSON_OUT = process.argv.includes('--json');
const LEGACY = process.argv.includes('--legacy');
const MIN = Number(process.argv.find(a => /^\d+(\.\d+)?$/.test(a)) || 34);
const AT = 38;          // 스킬 오브 안 글리프 실측 표시 크기
const TH = 50;          // 속살 문턱(절대 루마) — 위 머리말의 sweep-emblem-core-th.js 로 고름
const FAT = 0.16;       // 음성 대조용 키라인 두께(제품 0.067)

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

    // 한 페이지에서 ① 제품 판 ② 음성 대조(살찐 키라인) 판을 굽는다.
    const both = await page.evaluate(async (a) => {
        const names = Object.keys(IconGen.draw).filter(n => /^sk_|^tm_/.test(n));
        const BASE = JSON.parse(JSON.stringify(IconGen._EMBLEM_STEP));

        async function measure(patch) {
            IconGen._EMBLEM_STEP = Object.assign({}, BASE, patch);
            IconGen.cache = {};
            const out = [];
            for (const name of names) {
                let u = '';
                try { u = IconGen.url(name); } catch (e) { }
                if (!u) { out.push({ name, err: 'url 없음' }); continue; }
                const im = new Image();
                await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
                const c = document.createElement('canvas');
                c.width = a.AT; c.height = a.AT;
                const x = c.getContext('2d', { willReadFrequently: true });
                x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
                x.drawImage(im, 0, 0, a.AT, a.AT);
                const d = x.getImageData(0, 0, a.AT, a.AT).data;
                const Ls = [];
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 120) continue;                 // 실루엣 안쪽만
                    Ls.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                }
                if (Ls.length < 40) { out.push({ name, err: '표본 부족' }); continue; }
                let core = 0;
                for (const L of Ls) if (L >= a.TH) core++;
                out.push({ name, sil: Ls.length, pct: +(core / Ls.length * 100).toFixed(1) });
            }
            return out;
        }

        const prod = await measure(a.LEGACY ? { legacy: true } : {});
        /* 음성 대조 — **블록 화법에서는 살찐 키라인이 더 이상 코어를 못 먹는다.**
         * `BLOCK.EDGE_ONLY`(2026-08-25) 가 키라인을 경계 칸에만 찍고 속 칸은 `LFLOOR` 로 받치기
         * 때문에, 테를 두껍게 그려도 다운샘플 뒤엔 여전히 **경계 한 칸**이다(실측: 살찐 판 미달 0종).
         * 그래서 대조를 **코어를 실제로 먹는 스위치**로 갈았다 — `EDGE_ONLY=false` 는 위치를 안 보고
         * 어두운 칸을 전부 순검정으로 찍던 옛 화법이고, 그 판이 무너지는지로 자를 검증한다.
         * 🚨 이건 '내 판을 통과시키려 대조를 무르게 한 것'이 아니다 — 대조가 **더 세졌다**
         *    (살찐 키라인 0종 → 코어 잠식 판 다수). 자가 반드시 잡아야 할 사고를 그대로 재현한다. */
        const fat = await measure(a.LEGACY ? { legacy: true, keyline: a.FAT } : { keyline: a.FAT });
        let eaten = [];
        if (typeof IconGen.BLOCK !== 'undefined') {
            /* 🚨 대조는 **옛 화법 전부**를 재현해야 한다 — 코어 보존을 만드는 장치가 이제 둘이다.
             * ⑴ `EDGE_ONLY`(키라인을 경계 칸에만) ⑵ 칸 색 **최빈**(`_cellModes`, 2026-08-25).
             * ⑴만 끄면 ⑵가 여전히 속살을 지켜 대조가 **10/24 밖에 안 걸리고**(문턱 12), 그러면 이 자는
             * 스스로를 '고장'으로 판정해 멈춘다(실제로 그렇게 멈췄다). 옛 화법은 평균색이었으므로
             * `MODE_SKIP` 에 빈 접두사를 넣어 최빈을 통째로 끈다(`indexOf('') === 0` 이라 전 종이 걸린다).
             * ⚠️ 이건 대조를 무르게 한 게 아니라 **원래 재현하려던 판으로 되돌린 것**이다. */
            const keepSkip = IconGen.BLOCK.MODE_SKIP;
            IconGen.BLOCK.EDGE_ONLY = false;
            IconGen.BLOCK.MODE_SKIP = [''];
            eaten = await measure(a.LEGACY ? { legacy: true } : {});
            IconGen.BLOCK.EDGE_ONLY = true;
            IconGen.BLOCK.MODE_SKIP = keepSkip;
        }
        IconGen._EMBLEM_STEP = BASE; IconGen.cache = {};
        return { prod, fat, eaten };
    }, { AT, TH, FAT, LEGACY });

    const rows = both.prod;
    const bad = rows.filter(r => r.err || r.pct < MIN);
    const fatBad = both.fat.filter(r => r.err || r.pct < MIN);
    // 자 검증에 쓰는 대조 = 코어 잠식 판(EDGE_ONLY=false). 블록 화법이 없는 판(옛 소스)에서는
    // 그 스위치가 없으니 종전대로 살찐 키라인 판으로 되돌아간다.
    const ctlName = both.eaten && both.eaten.length ? '코어 잠식(EDGE_ONLY=false)' : `살찐 키라인 ${FAT}`;
    const ctlBad = both.eaten && both.eaten.length
        ? both.eaten.filter(r => r.err || r.pct < MIN) : fatBad;

    if (JSON_OUT) {
        console.log(JSON.stringify(rows.reduce((m, r) => (m[r.name] = r.pct, m), {}), null, 0));
    } else {
        rows.slice().sort((x, y) => (x.pct || 0) - (y.pct || 0)).forEach((r) => {
            const mark = r.err ? '??' : (r.pct < MIN ? '!!' : 'ok');
            console.log(`  ${mark} ${r.name.padEnd(18)} 속살 ${String(r.pct).padStart(5)}%  (실루엣 ${r.sil}px)`);
        });
        console.log(`\n${AT}px 표시${LEGACY ? ' · 옛 화법' : ''} · 속살 = 루마 ≥ ${TH} · ${MIN}% 미달 ${bad.length}종 / ${rows.length}종 · 콘솔 에러 ${errs.length}건`);
        if (bad.length) console.log('  미달: ' + bad.map(r => `${r.name}(${r.err || r.pct + '%'})`).join(', '));
        console.log(`  음성 대조(${ctlName}): 미달 ${ctlBad.length}종 / ${rows.length}종`
            + (both.eaten && both.eaten.length ? `  · 참고 살찐 키라인 ${FAT}: ${fatBad.length}종` : ''));
    }

    await browser.close();
    // 음성 대조가 통과해 버리면 이 자는 검은 막대기를 못 잡는다 — 수치를 쓰면 안 된다.
    if (ctlBad.length < rows.length * 0.5) {
        console.log(`\n🚨 측정기 고장 — 음성 대조(${ctlName})가 ${ctlBad.length}종만 걸렸다. 문턱이 무뎌졌다는 뜻이니 수치를 쓰지 말 것.`);
        process.exit(2);
    }
    if (!JSON_OUT) console.log(bad.length === 0 && errs.length === 0 ? '\n✅ PASS' : '\n❌ FAIL');
    process.exit(bad.length === 0 && errs.length === 0 ? 0 : 1);
})();
