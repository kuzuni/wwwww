// 플레이어 정보 팝업 shot-043313 의 **장비 그리드 / 오브 줄** 비율 대조 —
// '전 UI 비율 전수 검증 패스'(ui-ratio-audit)의 밴드 미실측 화면.
// 원본 PNG 와 클론 캡처를 **같은 픽셀 코드로** 잰다.
//
// 📌 **짝 도구와 역할이 다르다 — 겹치지 말 것.**
//   · `probe-pinfo-loadout.js`(QA 11차) = 오브 3종(스킬·펫·탈것)이 **서로 같은 지름**이고 찌부러지지
//     않았는지. 뷰포트 3종을 돌며 **렌더 절대 지름**을 본다(원본과는 무관한 검사다).
//   · 이 도구 = 그 줄이 **원본과 같은 비율**인지. 자는 흰 카드 폭(CW), 가로세로 공통.
//   ⚠️ 그쪽은 카드가 열림 애니(scale .7) 중일 때를 전제로 절대 px 을 보므로, 이 도구의 수치와
//     직접 비교하면 안 된다(33.5px vs 48px 처럼 0.7배 차이로 보인다).
//
// 📏 자 = 흰 카드 폭 — 원본 이미지 폭과 클론 앱 폭이 다를 수 있어서다(인계 메모 함정 ㉠).
//
// 🚨 측정 함정:
//   ⑴ 흰 카드 좌우는 **전 행의 최대 흰 구간**으로 잡는다(첫 행은 라운드 모서리라 좁게 잡힌다).
//   ⑵ 오브/타일을 **색으로** 잡으면 안 된다 — 원본 오브는 빨강, 클론은 회색이다. 두 그림 공통인
//      '흰 카드 위의 비흰색 덩어리'로 잡는다.
//   ⑶ **밴드 안에서 어느 행을 재느냐**가 제일 까다롭다 — 원본 오브는 안쪽 밝은 면 때문에 한 칸이
//      두 조각으로 갈리는 행이 있고, 오브 줄 가운데는 'Lv.N' 라벨 줄이다. 자세한 실패 이력은
//      아래 colsOf 주석에 적어 뒀다(네 가지 방법을 차례로 버렸다).
//   ⑷ **머리줄(아바타+이름+우측 3줄)이 장비 그리드로 오인된다** — 밴드 높이로 가른다(타일 줄은 두껍다).
// 자기검증: 두 그림 모두 카드가 잡히고, 장비 그리드가 **폭이 고른 5열**이며, 오브 줄이 그보다 작은
//           칸 5개 이상인지 본다. 어긋나면 수치를 인쇄하지 않고 **밴드 진단과 함께** exit 2.
//
// 사용: node tools/probe-pinfo-px.js
// 종료코드 0=PASS(±2%p 초과 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-043313.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/player-info.png');
const TOL = 2.0;

const MEASURE = async ([src]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const white = p => p[0] > 238 && p[1] > 238 && p[2] > 238;
    const bad = m => ({ err: m });

    // ── 흰 카드 (함정 ⑴) ────────────────────────────────────────────────────
    let cl = 0, cr = 0, ct = -1, cb = -1, bestAll = 0;
    for (let y = 0; y < H; y++) {
        let run = 0, best = 0, bs = 0, s = 0;
        for (let x = 0; x < W; x++) {
            if (white(at(x, y))) { if (run === 0) s = x; run++; if (run > best) { best = run; bs = s; } }
            else run = 0;
        }
        if (best > W * 0.55) { if (ct < 0) ct = y; cb = y; if (best > bestAll) { bestAll = best; cl = bs; cr = bs + best - 1; } }
    }
    if (ct < 0) return bad('흰 카드를 못 찾음');
    const CW = cr - cl + 1;
    const pc = v => +((v / CW) * 100).toFixed(2);

    // ── 카드 안 비흰색 밴드 (함정 ⑵) ────────────────────────────────────────
    const bands = [];
    { let cur = null;
      for (let y = ct; y <= cb; y++) {
          let n = 0;
          for (let x = cl; x <= cr; x++) if (!white(at(x, y))) n++;
          if (n > CW * 0.10) { if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; }
          else if (cur) { if (cur.y1 - cur.y0 >= 12) bands.push(cur); cur = null; }
      }
      if (cur && cur.y1 - cur.y0 >= 12) bands.push(cur); }

    // 밴드 안에서 **어느 행을 재느냐**가 이 화면의 핵심 함정이다. 실패한 방법 셋:
    //   ⓐ '열이 가장 많이 잡히는 행' → 타일이 잘게 쪼개진 행을 골라 장비 칸 폭이 52px 대신 38px 로 나온다.
    //   ⓑ '밴드의 가운데 행' → 오브 줄의 가운데는 **'Lv.N' 글자 줄**이라 5px 짜리 파편만 잡힌다
    //      (오브 지름이 31px 인데 16px 로 읽혔다).
    //   ⓒ '작은 틈은 메우기' → **상대 임계값으로는 절대 못 가른다.** 원본 오브가 갈리는 틈은 4px/31px
    //      = 12.9% 인데, 장비 타일 사이의 진짜 틈은 5px/52px = 9.6% 로 **오히려 더 좁다**. 메우면
    //      타일 다섯 개가 하나로 합쳐진다(실측).
    // → **파편은 폭으로 버린다**: 한 행 안에서 가장 넓은 칸의 60% 에 못 미치는 런은 조각으로 보고 버린다.
    //   그렇게 정리한 뒤 **중앙값 칸 폭이 가장 큰 행**을 쓰고, 같으면 **칸 폭이 고른 행**을 택한다
    //   (원본 장비 밴드는 중앙값 52 인 행이 여럿인데, 타일 모서리에 걸린 행은 56/51 로 들쭉날쭉하다).
    const runsAt = (y) => {
        const runs = [];
        let r = -1;
        for (let x = cl; x <= cr + 1; x++) {
            const on = x <= cr && !white(at(x, y));
            if (on && r < 0) r = x;
            if (!on && r >= 0) { if (x - r >= 3) runs.push([r, x - 1]); r = -1; }
        }
        if (!runs.length) return runs;
        const max = Math.max(...runs.map(v => v[1] - v[0] + 1));
        return runs.filter(v => (v[1] - v[0] + 1) >= max * 0.6);
    };
    const colsOf = (b, minW) => {
        // 밴드의 **위쪽 60%** 만 본다 — 아래쪽에는 'Lv.N' 라벨이 깔려 있어, 칸 하나가 라벨 때문에
        //    넓게 잡히면 60% 폭 필터가 나머지를 죄다 조각으로 버린다(클론 오브 줄이 7칸인데 4칸으로 잡혔다).
        const yEnd = b.y0 + Math.max(4, Math.round((b.y1 - b.y0) * 0.6));
        let best = [], bestMed = -1, bestSpread = 1e9, bestY = -1;
        for (let y = b.y0; y <= yEnd; y++) {
            const runs = runsAt(y);
            if (runs.length < 3) continue;
            const ws = runs.map(v => v[1] - v[0] + 1).sort((p, q) => p - q);
            const med = ws[Math.floor(ws.length / 2)];
            const spread = ws[ws.length - 1] - ws[0];
            // 동점 처리 순서가 중요하다: 중앙값 → **칸 수** → 폭 균일도.
            // 칸 수를 안 보면, 같은 중앙값·같은 균일도인 **더 위쪽 행**(원 위쪽이라 일부 칸만 걸린)이
            // 먼저 이겨 버린다 — 클론 오브 줄이 7칸인데 y480 의 4칸으로 잡혔다(실측).
            const better = med > bestMed
                || (med === bestMed && runs.length > best.length)
                || (med === bestMed && runs.length === best.length && spread < bestSpread);
            if (better) { bestMed = med; bestSpread = spread; best = runs; bestY = y; }
        }
        // ⚠️ '좌 인셋'은 **필터 전** 잉크의 왼쪽 끝으로 잰다 — 원본 첫 오브는 안쪽 밝은 면 때문에
        //    13+15 로 갈려 60% 폭 필터에 둘 다 버려진다. 그러면 '두 번째 오브'가 첫 칸이 되어
        //    좌 인셋이 10.19 대신 21.18%CW 로 나온다(실측). 왼쪽 끝만은 원본 그대로 쓴다.
        colsOf.lastY = bestY; colsOf.lastMed = bestMed;
        colsOf.lastLeft = -1;
        if (bestY >= 0) for (let x = cl; x <= cr; x++) if (!white(at(x, bestY))) { colsOf.lastLeft = x; break; }
        return best.filter(v => v[1] - v[0] + 1 >= minW);
    };
    // 장비 그리드 = 5열이 잡히는 첫 밴드. (2행은 넓은 탈것 칸 때문에 가운데 행에서 4열로 잡혀 안 걸린다.)
    // 5열이면 다 장비 그리드인 건 아니다 — 머리줄(아바타+이름+우측 3줄)도 5조각으로 잡힐 수 있다.
    // 장비 칸은 **서로 폭이 거의 같다**는 것으로 가른다(글자 조각은 폭이 들쭉날쭉하다).
    const evenCols = (cols) => {
        const ws = cols.map(v => v[1] - v[0] + 1);
        return Math.max(...ws) - Math.min(...ws) < CW * 0.03;
    };
    // 🚨 밴드 높이 조건이 없으면 **머리줄(아바타+이름+우측 3줄)이 장비 그리드로 잡힌다** — 실제로
    //    클론에서 그렇게 잡혀 그 아래 진짜 그리드·오브 줄을 통째로 못 찾았다. 타일 줄은 두껍고
    //    (장비 14.6%CW · 오브 9.1%CW) 머리줄은 얇다(3.9%CW).
    const tall = (b) => (b.y1 - b.y0 + 1) >= CW * 0.08;
    let gear = null, gearCols = null;
    for (const b of bands) {
        if (!tall(b)) continue;
        const cols = colsOf(b, Math.round(CW * 0.06));
        if (cols.length === 5 && evenCols(cols)) { gear = b; gearCols = cols; break; }
    }
    if (!gear) return bad(`장비 그리드(폭이 고른 5열 밴드)를 못 찾음 — 밴드 ${bands.map(b => b.y0 + '..' + b.y1).join(' ')}`);
    const gearW = gearCols[0][1] - gearCols[0][0] + 1;
    let orb = null, orbCols = null;
    for (const b of bands) {
        if (b.y0 <= gear.y1 || !tall(b)) continue;
        const cols = colsOf(b, Math.round(CW * 0.03));
        if (cols.length >= 5 && evenCols(cols) && (cols[0][1] - cols[0][0] + 1) < gearW * 0.85) { orb = b; orbCols = cols; break; }
    }
    if (!orb) return bad(`오브 줄을 못 찾음 — gear ${gear.y0}..${gear.y1} w${gearW} · 밴드별 ${bands.map(b => { const cc = colsOf(b, Math.round(CW * 0.03)); return `${b.y0}..${b.y1}[행y${colsOf.lastY} 칸${cc.length}개 폭${cc.length ? cc[0][1] - cc[0][0] + 1 : '-'} 두꺼움${tall(b)} 고름${cc.length ? evenCols(cc) : '-'}]`; }).join(' ')}`);

    colsOf(orb, Math.round(CW * 0.03));            // lastLeft 를 오브 줄 기준으로 다시 채운다
    const orbLeft = colsOf.lastLeft;
    const orbW = orbCols[0][1] - orbCols[0][0] + 1;
    if (orbW < CW * 0.03) return bad(`오브 지름이 비정상적으로 작음 (${orbW}px)`);

    return {
        size: [W, H], card: { l: cl, t: ct, r: cr, b: cb, w: CW },
        gearBand: `${gear.y0}..${gear.y1}`, orbBand: `${orb.y0}..${orb.y1}`,
        orbN: orbCols.length,
        m: {
            '장비 칸 폭': pc(gearW),
            '장비 열 피치': pc(gearCols[1][0] - gearCols[0][0]),
            '장비 좌 인셋': pc(gearCols[0][0] - cl),
            '오브 지름': pc(orbW),
            '오브 열 피치': pc(orbCols[1][0] - orbCols[0][0]),
            '오브 좌 인셋': pc(orbLeft - cl),
            '오브 줄 상단': pc(orb.y0 - ct),
        },
    };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const read = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const ref = await page.evaluate(MEASURE, [read(REF)]);
    const clone = await page.evaluate(MEASURE, [read(CLONE)]);
    await browser.close();

    for (const [k, o] of [['REF', ref], ['CLONE', clone]]) {
        if (o.err) { console.log(`측정기 고장 (${k}): ${o.err}`); process.exit(2); }
        console.log(`${k.padEnd(5)} ${o.size.join('x')} · 카드폭 ${o.card.w} · 장비밴드 ${o.gearBand} · 오브밴드 ${o.orbBand}(${o.orbN}칸)`);
    }
    console.log('\n단위 = 흰 카드 폭 대비 % (가로세로 공통)');
    console.log('요소                 원본     클론      Δ%p   판정(게이트 ±2%p)');
    let fail = 0;
    for (const k of Object.keys(ref.m)) {
        const a = ref.m[k], b = clone.m[k], d = +(b - a).toFixed(2), ok = Math.abs(d) <= TOL;
        if (!ok) fail++;
        console.log(`${k.padEnd(20)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(8)} ${(d > 0 ? '+' : '') + d.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    // 게이트 밖이지만 매번 인쇄한다 — 통과에 묻혀 사라지면 '전부 같다'로 읽힌다.
    console.log(`\n※ 비율 게이트 밖 차이: 오브 칸 수 원본 ${ref.orbN} vs 클론 ${clone.orbN} (장착 스킬·출전 펫 수 = 시드 상태 소관).`);
    console.log(fail === 0 ? '\nPASS — 초과 0건' : `\nFAIL — 초과 ${fail}건`);
    process.exit(fail === 0 ? 0 : 1);
})();
