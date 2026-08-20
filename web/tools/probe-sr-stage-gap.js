// 소환 결과 팝업 — **세로로 정보가 없는 밴드가 얼마나 남는가** 실측.
// 사용: node tools/probe-sr-stage-gap.js
//
// 왜: 10차 비평가 A ⓸ [높음] "x75 저등급 판이 화면의 57%를 빈 그라데이션으로 남긴다"
// (`skill-x75-3400` 콘텐츠가 y=385~495뿐, y=155~380·y=500~740 이 std 11~30 = 정보 0).
//
// 🚨 **재현 조건이 핵심이다** — 그냥 x75를 굴리면 만렙 소환(`summonCount=5000`)이라 등급이
//    흩어져 18셀이 되고 `mid` 판이 된다. A 가 잡은 화면은 **저등급 판**(`summonCount=0`)이라
//    고유 항목이 6개로 묶여 `sr-grid`(mid 아님)가 되고, 예전 임계(`entries.length <= 5`)에
//    딱 걸려 **무대(.sr-floor)도 천개(.sr-canopy)도 없이** 맨 그리드만 뜬다.
//    이 조건을 안 맞추면 이 지적은 프로브에서 **조용히 안 잡힌다**.
//
// 판정: 플레이영역을 30px 행으로 잘라 각 행의 표준편차를 재고, '정보 없는 행'(std < 0.02)이
//       차지하는 비율을 본다. A 가 말한 57%가 이 값이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

const CASES = [
    // [태그, summonCount(등급 분포), 배수, 시드] — 저등급 x75가 이 지적의 화면이다
    ['x75-저등급', 0, 75, 3],
    ['x25-저등급', 0, 25, 37],
    ['x75-만렙',   5000, 75, 3],   // mid 판 — 무대가 없는 것이 사양인 쪽(회귀 감시용)
];

const ROW = 30;
// A 가 쓴 자를 그대로 쓴다 — A 는 "std 11~30(정보 0)"이라 적었다. 0~255 스케일의 30이
// 정규화하면 0.118 이므로 그 값을 '정보 없음'의 상한으로 삼는다. 내가 임의로 0.02 를
// 골랐더니 **수정 전 빌드까지 전부 통과**해 지적을 재현조차 못 했다(자를 먼저 맞출 것).
const EMPTY_SD = 30 / 255;

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
    const errors = [];

    for (const [tag, cnt, mult, seed] of CASES) {
        const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        p.on('pageerror', e => errors.push(`${tag}: ${e}`));
        p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
        await p.goto(INDEX, { waitUntil: 'load' });
        // ⚠️ waitForFunction 금지 — rAF 폴링도 setInterval 폴링도 swiftshader 헤드리스에서는
        //    3D 렌더 한 프레임(15~30초)에 밀려 안 돈다(TODO '함정 ③'과 같은 뿌리). 게임이
        //    멀쩡히 떠 있어도 20초 타임아웃으로 죽는다. Node 쪽에서 evaluate 로 폴링하면
        //    프레임 사이로 끼어들어 바로 잡힌다.
        for (let w = 0; ; w++) {
            const ready = await p.evaluate(`typeof UI !== 'undefined' && !!(UI.els && UI.els.summonResultModal)`).catch(() => false);
            if (ready) break;
            if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
            await new Promise(r => setTimeout(r, 500));
        }
        await p.evaluate(`S.tickets=999999;S.gems=999999;S.eggCurrency=999999;S.winders=999999;S.bestChapter=20;S.bestStage=9;saveGame();`);
        await p.evaluate(`Scene3D.update = function () {}; const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`);
        await p.evaluate(`(() => { ${RNG(seed)}; S.summonCount = ${cnt}; S.summonMult = {skill:${mult}};
            UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false); })()`);
        // 연출이 끝난 정지 화면에서 잰다 — A 가 본 것도 `-3400` 즉 종료 후 프레임이다
        await p.evaluate(`(() => { UI.skipSummonResult ? UI.skipSummonResult() : null; })()`).catch(() => {});
        await p.waitForTimeout(3600);
        await p.evaluate(`{ const c = document.querySelector('#scene canvas') || document.querySelector('canvas'); if (c) c.style.visibility = 'hidden'; }`);

        // 픽셀 자와 별개로 **구조 자**도 같이 잰다 — 무대·천개는 어두운 선화라 A 의 std 문턱
        // (30/255)을 못 넘지만, 화면에서 차지하는 세로 길이는 분명히 늘어난다. 두 자를 함께
        // 보고해야 '무엇이 좋아졌고 무엇이 아직 안 됐는지'가 갈린다.
        const info = await p.evaluate(`(() => {
            const m = UI.els.summonResultModal;
            const R = s => { const e = m.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom }; };
            const parts = ['.sr-canopy', '.sr-grid', '.sr-floor', '.sr-reflect'].map(R).filter(Boolean);
            const body = R('.sr-body');
            const top = Math.min(...parts.map(x => x.t)), bot = Math.max(...parts.map(x => x.b));
            return { cells: UI._srCells.length,
                grid: m.querySelector('.sr-grid').className,
                floor: !!m.querySelector('.sr-floor'), canopy: !!m.querySelector('.sr-canopy'),
                fill: (bot - top) / (body.b - body.t),
                done: m.classList.contains('done') };
        })()`);
        const buf = await p.screenshot({ clip: { x: 0, y: 91, width: 412, height: 732 } });

        const res = await p.evaluate(([b64, row, thr]) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
                const rows = [];
                for (let y = 0; y + row <= cv.height; y += row) {
                    const d = g.getImageData(0, y, cv.width, row).data;
                    let s = 0, s2 = 0, n = 0;
                    for (let i = 0; i < d.length; i += 4) {
                        const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
                        s += v; s2 += v * v; n++;
                    }
                    const mean = s / n;
                    rows.push({ y, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)) });
                }
                const empty = rows.filter(r => r.sd < thr);
                resolve({ total: rows.length, empty: empty.length, ratio: empty.length / rows.length,
                          worst: empty.map(r => r.y).slice(0, 40) });
            };
            img.src = 'data:image/png;base64,' + b64;
        }), [buf.toString('base64'), ROW, EMPTY_SD]);

        console.log(`  ${tag.padEnd(11)} 셀 ${String(info.cells).padStart(2)} · "${info.grid}"`
            + ` · 무대 ${info.floor ? 'O' : 'X'} · 천개 ${info.canopy ? 'O' : 'X'}`
            + ` · 정보 없는 행 ${res.empty}/${res.total} = ${(res.ratio * 100).toFixed(1)}%`);
        // ⓐ 구조 자 — 무대(천개·그리드·바닥·반사)가 팝업 본문 세로의 몇 %를 쓰는가.
        //    6~10셀 판은 예전에 그리드 하나뿐이라 19%였다(무대·천개가 임계 5에 걸려 안 붙었다).
        ok(info.fill >= 0.38, `[${tag}] 무대 세로 점유 ${(info.fill * 100).toFixed(0)}% (기준 ≥38%, 임계 확장 전 6셀 판 19%)`);
        // ⓑ 픽셀 자(A 의 자) — 2026-08-18 ⑤ 해결로 통과 상태가 됐다(66.7% → 25%).
        //    통과를 만든 조합(하나라도 죽으면 여기가 다시 붉어진다): 6~10셀 srCols 다열화(3~5열)
        //    + 무대 판 별가루(.sr-stars, done 에서만) + 천개 광 스필(.sr-canopy b) + 소환진
        //    링/글로우 강화 + 바닥 반사 강화(blur 4px·op .88) + done 광선 마스크 88% 연장.
        //    ⚠️ 얇은 선화(링·아치)나 은은한 분위기 레이어는 이 자를 원리적으로 못 움직인다
        //    (A/B 실측: 행 std +5~13뿐) — 조정할 땐 콘텐츠급 밝기 요소를 만질 것.
        ok(res.ratio <= 0.30, `[${tag}] (⑤ 미해결) 정보 없는 행 ${(res.ratio * 100).toFixed(1)}% (A 실측 57% · 목표 ≤30%)`);
        await p.close();
    }

    out.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = out.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
