// 원본이 '어디에' 검정 링을 두르는가 — 규칙을 실측으로 확정한다 (aaa-skin ㉴ 경계 정하기)
//
// 왜: ㉴(헤더 블록 타이포)의 census 는 클론에 링 없는 글자 요소가 730개라는 것까지 셌지만,
//     "그 730개 중 어디까지가 링 대상인가"의 **경계**를 못 정해 CSS 를 한 줄도 못 썼다.
//     종전 가설 둘은 이 도구가 반증한다:
//       ⓐ "강조 층(제목·수치·탭 라벨)만 링, 잔 본문은 민무늬" → 10px 짜리 알약 `어려움 3-1` 도 링이다.
//       ⓑ "어두운 판 위 라벨은 링, 밝은 판 위 잔 글씨는 민무늬" → 둘 다 밝은 판인데
//          회색 카드의 `220` 은 링이고 회색 행의 `일반` 은 민무늬다. 판의 밝기로는 안 갈린다.
//     실제로 가르는 것은 **글자 속(fill) 색** 하나다.
//
// ── 어떻게 재나 ────────────────────────────────────────────────────────
// 색이 아니라 **배치**를 본다. 스캔라인에서 검정 구간(L≤10)을 찾고 그 **양옆**을 유의미 색층에
// 스냅해 비교한다. 양옆이 서로 다른 색이면 그 검정은 두 색 사이에 낀 층 = 외곽선이다.
//   · 흰+링 글자 → 판 | 검정 | 흰속   (양옆이 다르다 → 링)
//   · 검정칠 글자 → 판 | 검정 | 판     (양옆이 같다  → 민무늬)
// 낀비율 ≥ 0.15 면 링. 크롭에 옆 판이 조금 섞여도 '판|검정|판' 구간이 늘 뿐이라 안 흔들린다.
//
// 🚨 **색층 히스토그램으로 가르려던 앞선 두 판은 전부 틀렸다. 다시 만들지 말 것.**
//   ⑴ 배경이 밝으면(회색 카드 140·주황 배지 164) 검정 링(4)이 흰 글자속(252)보다 배경에서 멀어
//      **링을 글자속으로 집는다** → 링을 민무늬로 오판.
//   ⑵ 크롭에 옆 판이 조금만 섞이면(회색 행 크롭에 흰 종이) 없는 글자속이 생겨 **거짓 링**.
//   ⑶ 흰 종이 위 흰+링 글자와 민무늬 검정 글자는 색층이 둘 다 {252,4} 라 **원리적으로 같다**.
//
// 판정에서 빼는 구역(등급) — 못 재는 것을 수치로 우기지 않는다:
//   · B급 = 판 자체가 링과 같은 검정(배경 <12, HUD 알약). 양옆을 물을 수가 없다.
//   · S급 = 표본 부족(검정 구간 20개 미만). 비율을 믿을 수 없다.
//   · C급 = 흰 종이 위(배경 ≥230)인데 낀비율이 낮은 구역. 글자속이 배경과 같은 흰색이면 양옆이
//           '흰|검정|흰' 이라 낀비율로는 못 가른다 → 여기서만 **획 두께**로 가른다
//           (외곽선은 얇고 검정칠은 두껍다. 실측 경계 4.2px).
//   ⚠️ C급은 `8.87k`(링) 와 `소환 확률`(민무늬) 을 **둘 다** 넣어야 한다. 한쪽만 A 로 남기면
//      답을 보고 등급을 고르는 것이다.
//
// 사용: node probe-ref-ring-rule.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const REF = path.resolve(__dirname, '../ref/screens');

// [원본id, 이름, x, y, w, h, 눈으로 본 분류('ring'|'plain')]
const REGIONS = [
    ['042705', '패스 안내문(어두운 판·흰 글자)',   78, 222, 230, 24, 'ring'],
    ['042705', '₩13,900 배지(주황 판·흰 글자)',   290, 225,  70, 26, 'ring'],
    ['042705', '탭 무료(파란 판·흰 글자)',         95, 286, 115, 24, 'ring'],
    ['042705', '탭 프리미엄(주황 판·흰 글자)',    270, 289, 110, 20, 'ring'],
    ['042705', '알약 어려움 3-1(10px 잔 라벨)',   195, 325,  95, 22, 'ring'],
    ['042705', '보상 220(회색 카드·흰 글자)',     100, 366,  62, 22, 'ring'],
    ['042705', '보상 220(남색 카드·흰 글자)',     275, 366,  58, 22, 'ring'],
    ['042521', '제목 레벨 69(흰 종이·흰 글자)',   200, 224,  95, 30, 'ring'],
    ['042521', '부제 소환 확률(흰 종이·검정)',    210, 252,  76, 16, 'plain'],
    ['042521', '확률행 일반(회색 행·검정)',        96, 306,  21, 17, 'plain'],   // ⭐ 아이콘은 뺀다(테가 거짓 링을 낸다)
    ['042521', '확률행 15.00%(회색 행·검정)',     352, 305,  58, 20, 'plain'],
    ['042521', '확률행 희귀한(파란 행·검정)',      95, 342,  62, 20, 'plain'],
    ['042521', '안내문 달걀을…(흰 종이·검정)',    120, 537, 255, 18, 'plain'],
    ['042521', '게이지 20/23(파란 판·흰 글자)',   215, 594,  62, 20, 'ring'],
    ['042110', '제목 오프라인 보상(어두운 판)',   188, 227, 124, 26, 'ring'],
    ['042110', '1.13/초(어두운 판·초록 글자)',    175, 342,  58, 22, 'ring'],
    ['042110', '8.87k(흰 종이·흰 글자)',          180, 487,  78, 26, 'ring'],
    ['042110', '수집 버튼(파란 판·흰 글자)',      225, 568,  52, 28, 'ring'],
    ['042110', 'HUD 782k(어두운 알약·흰 글자)',   338,  24,  52, 20, 'ring'],
];

let bad = 0;
const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();

    const shots = {};
    for (const [id] of REGIONS) {
        if (shots[id]) continue;
        const f = path.join(REF, `shot-${id}.png`);
        if (!fs.existsSync(f)) { console.error(`원본 없음: ${f}`); process.exit(2); }
        shots[id] = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    }

    const measure = (dataUrl, x, y, w, h) => page.evaluate(async (a) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = a.dataUrl; });
        const c = document.createElement('canvas');
        c.width = a.w; c.height = a.h;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
        const d = g.getImageData(0, 0, a.w, a.h).data;
        const n = a.w * a.h;
        const hist = new Array(32).fill(0), sr = new Array(32).fill(0), sg = new Array(32).fill(0), sb = new Array(32).fill(0);
        const L2 = new Float32Array(n);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            L2[p] = L;
            const b = Math.min(31, L >> 3);
            hist[b]++; sr[b] += d[i]; sg[b] += d[i + 1]; sb[b] += d[i + 2];
        }
        // 유의미한 색층 = 구역의 3% 이상을 차지하는 버킷(안티에일리어싱 꼬리를 뺀다)
        const tones = [];
        for (let i = 0; i < 32; i++) {
            if (hist[i] < n * 0.03) continue;
            const r = sr[i] / hist[i], gg = sg[i] / hist[i], bb = sb[i] / hist[i];
            const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
            tones.push({ L: i * 8 + 4, mass: +(hist[i] / n * 100).toFixed(1), sat: mx ? (mx - mn) / mx : 0 });
        }
        const bg = tones.reduce((m, t) => (t.mass > m.mass ? t : m), tones[0]);
        // 🚨 글자속을 '배경에서 가장 먼 층'으로 고르면 **안 된다** — 배경이 밝으면(회색 카드 140,
        //    주황 배지 164) 검정 링(4)이 흰 글자속(252)보다 배경에서 멀어 **링을 글자속으로 집는다**.
        //    이 게임의 칠은 순백·순검정·채도 높은 브랜드색 셋뿐이므로, 글자속은 **배경이 아닌 층 중
        //    밝거나(≥200) 채도가 높은(≥.35) 층**으로 고른다. 그런 층이 없으면 글자는 검정칠이다.
        const lit = tones.filter(t => t !== bg && t.L > 20 && (t.L >= 200 || t.sat >= 0.35));
        const darkest = tones.reduce((m, t) => (t.L < m.L ? t : m), tones[0]);
        const fill = lit.length ? lit.reduce((m, t) => (t.mass > m.mass ? t : m), lit[0]) : darkest;
        // ── 링 판정: **검정 층이 서로 다른 두 색을 가르고 있는가** ─────────────
        // 🚨 색층 히스토그램만으로는 못 가른다(3가지 실패를 실제로 밟았다):
        //    ⑴ 배경이 밝으면 검정 링이 흰 글자속보다 배경에서 멀어 **링을 글자속으로 집는다**
        //    ⑵ 크롭에 옆 판이 조금만 섞여도(회색 행 크롭에 흰 종이) 없는 글자속이 생겨 **거짓 링**
        //    ⑶ 흰 종이 위 흰 글자와 민무늬 검정 글자는 색층이 {252,4} 로 **원리적으로 같다**
        // 그래서 색이 아니라 **배치**를 본다. 스캔라인에서 검정 구간(L≤10)의 양옆을 보고,
        // 양옆이 **서로 다른 색**이면 그 검정은 두 색 사이에 낀 층 = 외곽선이다.
        //   · 흰+링 글자 → 판 | 검정 | 흰속  (양옆이 다르다)
        //   · 검정칠 글자 → 판 | 검정 | 판    (양옆이 같다)
        // 크롭에 옆 판이 섞여도 '판|검정|판' 구간이 늘 뿐이라 **판정이 흔들리지 않는다**(⑵ 해결).
        // ⚠️ 양옆을 **날 픽셀로 비교하면 안 된다** — 검정 획 옆의 안티에일리어싱이 한쪽만 2px 이면
        //    그 회색차만으로 '다른 색'이 돼 민무늬 검정 글자가 낀비율 0.5 로 튄다(실측으로 밟았다).
        //    그래서 양옆을 **유의미 색층에 스냅**하고, 스냅이 안 되는(=아직 AA 인) 자리는 그 구간을
        //    분모에서도 뺀다. 색층 하나에 붙지 못한 픽셀로는 아무것도 주장하지 않는다.
        const snap = (x, y) => {
            const i = (y * a.w + x) * 4;
            const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            let best = null, bd = 21;
            for (const t of tones) { const dd = Math.abs(t.L - L); if (dd < bd) { bd = dd; best = t; } }
            return best;
        };
        let runs = 0, sep = 0, runPx = 0, skipped = 0;
        for (let y = 0; y < a.h; y++) {
            let x = 0;
            while (x < a.w) {
                if (L2[y * a.w + x] > 10) { x++; continue; }
                const s0 = x;
                while (x < a.w && L2[y * a.w + x] <= 10) x++;
                runPx += x - s0;
                const lx = s0 - 2, rx = x + 1;                // AA 1px 을 건너뛴다
                if (lx < 0 || rx >= a.w) { skipped++; continue; }   // 구역 밖 → 판정 보류
                // 🚨 **양옆이 또 검정이면 그 구간으로는 아무것도 못 묻는다.** 11px 한글은 획이
                //    1~2px 이고 획 사이도 1~2px 이라, 옆 획을 짚으면 `검정|흰|검정` 이 되어
                //    민무늬 검정 글자가 낀비율 0.5 로 튄다(실측으로 밟은 거짓양성의 정체).
                if (L2[y * a.w + lx] <= 10 || L2[y * a.w + rx] <= 10) { skipped++; continue; }
                const lt = snap(lx, y), rt = snap(rx, y);
                if (!lt || !rt) { skipped++; continue; }            // 아직 AA → 판정 보류
                runs++;
                if (Math.abs(lt.L - rt.L) > 40) sep++;
            }
        }
        const sepRatio = runs ? +(sep / runs).toFixed(3) : 0;
        return { bg: bg.L, bgMass: bg.mass, fill: fill.L, fillMass: fill.mass, fillSat: +fill.sat.toFixed(2),
                 dark: darkest.L, tones: tones.length, runs, sep, sepRatio,
                 blackRun: runs ? +(runPx / runs).toFixed(2) : 0, skipped };
    }, { dataUrl, x: +x, y: +y, w: +w, h: +h });

    const rows = [];
    for (const [id, name, x, y, w, h, want] of REGIONS) {
        const m = await measure(shots[id], x, y, w, h);
        // 등급 — 이제 색층이 아니라 배치로 재므로 A급이 훨씬 넓다.
        //  · B급으로 빼는 것은 **판 자체가 링과 같은 검정인 구역**(배경 휘도 <12) 하나뿐이다.
        //    HUD 알약(4) 같은 자리는 판·링이 같은 색이라 '양옆이 다른가'를 물을 수 없다.
        //  · C급 = 글자속이 배경과 같은 색인 구역(흰 종이 위 흰 글자) — 양옆이 원리적으로 같다.
        //    여기는 **획 두께**로 가른다(외곽선은 얇고 검정칠은 두껍다).
        let grade = 'A';
        let ring = m.sepRatio >= 0.15;
        if (m.bg < 12) grade = 'B';                       // 판이 링과 같은 검정 — 양옆을 물을 수 없다
        else if (m.runs < 20) grade = 'S';                // 표본 부족 — 20구간 미만으로는 비율을 못 믿는다
        else if (m.bg >= 230 && m.sepRatio < 0.25) {
            // C급 — 흰 종이 위. 글자속이 배경과 같은 흰색이면 양옆이 원리적으로 '흰|검정|흰' 이라
            //       낀비율로는 못 가른다. 여기서만 **획 두께**로 가른다(외곽선은 얇고 검정칠은 두껍다).
            grade = 'C';
            ring = m.blackRun < 4.2;
        }
        rows.push({ id, name, want, grade, ring, ...m });
    }

    console.log('구역별 실측 — 링 = 검정 구간의 양옆이 서로 다른 색인 비율(낀비율) ≥ 0.15\n');
    console.log('  급  판정   want   배경  글자속  낀검정/전체  낀비율 검정획  구역');
    for (const r of rows) {
        const verdict = (r.grade === 'A' || r.grade === 'C') ? ((r.ring ? 'ring' : 'plain') === r.want ? ' OK ' : 'FAIL') : ' -- ';
        console.log(`  ${r.grade}  ${verdict}  ${r.want.padEnd(5)} ${String(r.bg).padStart(5)} ${String(r.fill).padStart(6)} ${String(r.sep).padStart(6)}/${String(r.runs).padEnd(5)} ${String(r.sepRatio).padStart(6)} ${String(r.blackRun).padStart(6)}  ${r.name}`);
    }

    const A = rows.filter(r => r.grade === 'A' || r.grade === 'C');
    console.log(`\n── A·C급 ${A.length}구역 판정 (B/S 급 ${rows.length - A.length}개는 제외: 판이 링과 같은 검정 / 표본 부족) ──`);
    for (const r of A) chk((r.ring ? 'ring' : 'plain') === r.want, `${r.name} — 눈 ${r.want} / 실측 ${r.ring ? 'ring' : 'plain'}`);

    console.log('\n── 무엇이 갈랐나 ──');
    // ⚠️ 표의 '글자속' 열은 **주장의 근거로 쓰지 말 것**. 크롭에 옆 판이 조금만 섞여도(회색 행
    //    옆의 흰 종이) 그 색을 글자속으로 집는다 — `확률행 15.00%` 가 252 로 찍히는 게 그 예다.
    //    믿을 수 있는 것은 배치로 잰 **낀비율/획두께**뿐이고, 글자속 색은 8배 확대로 눈이 분류한
    //    것(구역 이름의 '흰 글자'/'초록 글자'/'검정')을 쓴다.
    const darkInk = (r) => /검정\)/.test(r.name);
    const brightR = A.filter(r => !darkInk(r)), darkR = A.filter(darkInk);
    chk(brightR.length >= 8 && brightR.every(r => r.ring),
        `밝은 칠(흰·초록) 글자 ${brightR.length}구역 — 전부 링`);
    chk(darkR.length >= 3 && darkR.every(r => !r.ring),
        `검정 칠 글자 ${darkR.length}구역 — 전부 민무늬`);
    // 가설 ⓑ 반증: 밝은 판 위에 링·민무늬가 둘 다 있다
    const light = A.filter(r => r.bg >= 128);
    chk(light.some(r => r.ring) && light.some(r => !r.ring),
        `밝은 판(배경 ≥128) 위에 링·민무늬가 둘 다 있다 → 판 밝기로는 안 갈린다`
        + ` — 링: ${light.filter(r => r.ring).map(r => r.name.split('(')[0]).join('/')}`
        + ` · 민무늬: ${light.filter(r => !r.ring).map(r => r.name.split('(')[0]).join('/')}`);
    // 가설 ⓐ 반증: 10px 급 잔 라벨도 링이다
    const pill = A.find(r => /알약/.test(r.name));
    chk(!!pill && pill.ring, `10px 급 잔 라벨(알약 어려움 3-1)도 링이다 → '강조 층만'이 아니다`);

    console.log('\n── 판정에서 뺀 구역 ──');
    for (const r of rows.filter(x => x.grade === 'B' || x.grade === 'S')) {
        const why = r.grade === 'B' ? '판이 링과 같은 검정' : `표본 부족(검정 구간 ${r.runs}개)`;
        console.log(`  ${r.grade}급 ${r.name} — ${why} · 배경 ${r.bg} / 낀검정 ${r.sep}/${r.runs}`);
    }
    console.log('  · 이 셋은 **못 재는 것이지 반례가 아니다** — 8배 확대 크롭에서는 셋 다 규칙대로 보인다');
    console.log('    (흰 글자 둘은 링, 검정 글자 하나는 민무늬). 수치로 우기지 않으려고 판정에서 뺐다.');

    // ── C급: 흰 종이 위 2색 구역 — 색층이 같으므로 **획 두께**로 가른다 ──
    console.log('\n── C급(흰 종이 위 2색) — 색층이 같아 획 두께로 가른다 ──');
    const C = rows.filter(x => x.grade === 'C');
    for (const r of C) console.log(`  ${r.name} — 검정획 평균 ${r.blackRun}px (want ${r.want})`);
    const cRing = C.filter(r => r.want === 'ring'), cPlain = C.filter(r => r.want === 'plain');
    if (cRing.length && cPlain.length) {
        const maxRing = Math.max(...cRing.map(r => r.blackRun)), minPlain = Math.min(...cPlain.map(r => r.blackRun));
        chk(maxRing < minPlain,
            `외곽선 쪽 검정획(최대 ${maxRing}px)이 검정칠 쪽(최소 ${minPlain}px)보다 얇다`
            + ' → 흰 종이 위에서도 흰+링과 민무늬 검정이 갈린다');
    }
    console.log('  · 흰 종이 위 흰 글자는 **외곽선이 없으면 아예 안 보인다** — 획 두께가 이걸 수치로 확인해 준다.');

    await browser.close();
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과 — 규칙: **글자속이 밝으면 검정 링, 어두우면 민무늬.** 판의 밝기·요소의 위계가 아니다.');
    process.exit(bad ? 1 : 0);
})();
