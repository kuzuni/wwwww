// 펫 화면 '알' 조형을 **원본과 나란히 실측**한다 — 실루엣 폭 프로파일 + 내부 잉크.
//
// 왜: 재화 아이콘 시트(어두운 배경, 128px)에서 알은 훌륭해 보인다. 그런데 알이 실제로 앉는 자리는
// 펫 그리드(흰 배경, ≈44px)이고, 거기서 원본(shot-042356)과 클론(pets.png)을 8배로 확대해 나란히
// 놓으면 **다른 물건**이다:
//   · 원본 = 몬스터 알 — 좌우로 뻗은 **뿔(로브) 두 개** + 바닥 1/4 을 채운 **검정 밑동** + 굵은
//     검정 키라인 + 몸통을 가로지르는 **검정 갈매기 무늬 3개** + 딱딱한 경계의 하이라이트.
//   · 클론 = 매끈한 **타원 하나** — 로브 없음, 밑동 없음, 무늬는 거의 안 보이는 옅은 반점.
// 즉 '이모지 파생(near-tracing)' 축의 미결 건이다. 눈으로 갈리는 주장이라 화소로 남긴다.
//
// 판정축 3개 — 전부 **한 이미지 안에서 닫혀** 있어 크기·색과 무관하다:
//   ⑴ 로브 돌출도 = max(w(y)) / w(허리)  — 알 실루엣의 가로폭 프로파일에서, 최대폭이 몸통 허리폭
//      보다 얼마나 튀어나왔나. 매끈한 타원이면 최대폭이 곧 허리폭이라 ≈1.00. 원본처럼 옆으로 뿔이
//      뻗으면 1 보다 확실히 크다.
//   ⑵ 밑동 암도 = (아래 22% 대역 중앙값 휘도) / (몸통 중앙 대역 중앙값 휘도). 원본은 바닥이 거의
//      검정이라 작게, 클론은 아래까지 같은 빨강이라 1 근처로 나온다.
//   ⑶ 내부 잉크율 = 실루엣 안에서 |L - 최빈 L| >= 60 인 화소 비율(무늬·키라인·밑동이 여기 잡힌다).
//
// 🚨 배경 분리: 두 화면 다 알 뒤가 **흰색**이다. 그래서 실루엣 = '흰색이 아닌 화소'로 잡는다.
//    ⚠️ 알 아래 '알' 글자가 붙어 있으므로 **탐색 상자 아래를 알 바닥에서 끊는다**(안 그러면 글자가
//    실루엣에 붙어 폭 프로파일이 망가진다). 상자는 아래 CASES 에 손으로 박고, 자기검증으로 확인한다.
//
// 사용: node probe-egg-form.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
/* 🚨 **이 자는 브라우저를 안 띄운다 — 커밋된 클론 캡처 PNG 를 원본과 맞대기만 한다.**
   그래서 게임 코드를 고치고 캡처를 다시 굽지 않으면 **옛 화면을 재면서 아무 말도 안 한다.**
   그 사고가 실제로 났다(`probe-skill-orb-ink` — `clone-fresh.js` 머리말에 전말이 있다).
   ⚠️ 지금은 **경고 전용**이다: 소스 목록이 `web/js`·`web/css` 로 넓어서 무관한 작업에도 자주
      걸리기 때문에 끊지는 않는다. 이 화면을 그리는 파일만으로 목록을 **좁힌 뒤** 네 번째 인자를
      빼면 하드 게이트(exit 2)가 된다. */
// (신선도 가드는 뺐다 — 아래 `bakePets` 로 **이 자가 직접 굽기** 때문에 낡은 캡처가 존재하지 않는다.)


/* [파일, 라벨, 알 하나를 **찾아 볼 창**(x,y,w,h) — 위아래는 손으로 자른다('알' 글자와 패널
   구분선을 빼야 한다), **좌우는 창 안에서 자동으로 맞춘다**]
   🚨 **좌우를 손으로 박아 두면 안 된다 — 2026-08-20 에 실제로 조용히 틀린 값을 냈다.**
   종전엔 클론 상자가 `[306, 60, 46, 48]` 로 폭 46px 이었는데, 알에 **좌우 뿔이 생기면서 실루엣이
   50~54px 로 넓어져** 상자 좌우로 삐져나갔다. 그러면 이 자는 **잘린 실루엣**을 재면서 아무 말도
   안 한다(잘린 최대폭과 잘린 허리폭의 비라 그럴싸한 숫자가 나온다).
   🚨 **게다가 캡처를 굽는 스크립트마다 화면 크기가 다르다**: `shot-pets.js` 는 **490×892**,
   `shot-screens.js` 는 **499×892** 로 굽는다(앱 배율이 달라 알의 위치·크기가 통째로 달라진다 —
   실측: 알 가로 범위가 298~347 ↔ 301~354). 즉 **어느 절대좌표를 박아도 다른 baker 가 구우면
   어긋난다.** 그래서 좌우는 창 안에서 잉크의 min/max 로 잡고, **창 벽에 닿으면 exit 2(측정기 고장)**
   로 끊는다 — 잘린 채로 숫자를 내느니 못 쟀다고 말하는 편이 낫다. */
/* 🚨 **클론 쪽은 커밋된 PNG 를 읽지 않고 이 자가 직접 굽는다 (2026-08-20 UI 스트림, 락 `icon-gen`).**
   종전엔 `tools/ref-cmp/clone/pets.png` 를 읽었는데, 그 파일은 **누가 어떤 스크립트로 구웠느냐에
   따라 화면 크기가 다르다**(`shot-pets.js` 490×892 ↔ `shot-screens.js` 499×892). 실제로 다른
   세션이 31화면을 `shot-screens.js` 로 다시 구운 순간 이 자의 창이 어긋나 **없던 FAIL** 이 났다.
   `shot-pets.js` 가 `PETS_STATE_SRC` 를 **일부러 export** 해 둔 이유가 이것이다("probe 쪽에서도
   같은 것을 써야 해서 내보낸다"). 직접 구우면 ⓐ 낡은 캡처를 재는 사고 ⓑ baker 마다 다른 기하
   — 두 부류가 한꺼번에 사라진다. 대신 이 자는 앱을 띄우므로 30초쯤 걸린다. */
const CASES = [
    { file: path.resolve(__dirname, '../ref/screens/shot-042356.png'), label: '원본 shot-042356', box: [292, 62, 62, 48] },
    { bake: true, label: '클론(직접 구움 490×882)', box: [290, 58, 82, 56] },
];

// 클론 펫 화면을 `shot-pets.js` 와 **똑같은 뷰포트·시드·상태**로 구워 버퍼로 돌려준다.
async function bakePets(browser) {
    const SC = require('./shot-screens-seed.js');
    const SP = require('./shot-pets.js');
    const page = await browser.newPage({ viewport: { width: 490, height: 882 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(SP.PETS_STATE_SRC);
    await page.waitForTimeout(700);
    const buf = await page.screenshot({ timeout: 120000 });
    await page.close();
    return { buf, errs };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const out = [];
    let bad = 0;
    let bakeErrs = [];

    for (const c of CASES) {
        let dataUrl;
        if (c.bake) {
            const r = await bakePets(browser);
            bakeErrs = r.errs;
            dataUrl = 'data:image/png;base64,' + r.buf.toString('base64');
        } else {
            if (!fs.existsSync(c.file)) { console.error('없음:', c.file); process.exit(2); }
            dataUrl = 'data:image/png;base64,' + fs.readFileSync(c.file).toString('base64');
        }
        const r = await page.evaluate(async (a) => {
            const img = new Image();
            await new Promise(res => { img.onload = res; img.src = a.dataUrl; });
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const D = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
            const [bx, by, bw, bh] = a.box;
            const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]; };
            // 실루엣 = 흰 배경이 아닌 화소(휘도 < 232). 행마다 좌우 끝을 찾아 폭을 잰다.
            const rows = [];
            const ink = [];
            let touchL = 0, touchR = 0;
            for (let y = by; y < by + bh; y++) {
                let x0 = -1, x1 = -1;
                for (let x = bx; x < bx + bw; x++) if (L(x, y) < 232) { if (x0 < 0) x0 = x; x1 = x; }
                rows.push(x0 < 0 ? 0 : x1 - x0 + 1);
                if (x0 === bx) touchL++;                       // 창 왼벽에 닿았다 = 잘렸거나 옆 타일이 들어왔다
                if (x1 === bx + bw - 1) touchR++;
                if (x0 >= 0) for (let x = x0; x <= x1; x++) ink.push(L(x, y));
            }
            return { rows, ink, h: bh, touchL, touchR };
        }, { dataUrl, box: c.box });

        const rows = r.rows;
        /* 🚨 창 벽에 닿으면 **수치를 인쇄하지 않고 끊는다.** 닿는 경우는 둘 중 하나인데 둘 다
           측정이 무효다: ⓐ 알이 창보다 넓어 **잘렸다**(그러면 최대폭·허리폭이 둘 다 잘린 값이라
           비율이 그럴싸하게 나온다 — 2026-08-20 에 실제로 당했다) ⓑ **옆 타일이나 패널 구분선이
           창 안에 들어왔다**(그러면 폭이 창 전체로 튄다). 어느 쪽이든 창을 다시 잡아야 한다. */
        if (r.touchL || r.touchR) {
            console.log(`\n■ ${c.label}\n  🚨 자기검증 실패 — 실루엣이 창 좌우 벽에 닿는다(왼 ${r.touchL}행 · 오른 ${r.touchR}행).`);
            console.log(`     알이 창보다 넓어 잘렸거나, 옆 타일·구분선이 창에 들어왔다. CASES 의 창(x,y,w,h)을 다시 잡을 것.`);
            console.log(`     ⚠️ 캡처를 굽는 스크립트마다 화면 크기가 다르다(shot-pets 490×892 · shot-screens 499×892) — 어느 쪽으로 구운 PNG 인지부터 볼 것.`);
            bad++; continue;
        }
        const filled = rows.filter(v => v > 0).length;
        if (filled < r.h * 0.55 || Math.max(...rows) < 12) {
            console.log(`\n■ ${c.label}\n  🚨 자기검증 실패 — 실루엣이 상자를 못 채웠다(채운 행 ${filled}/${r.h}, 최대폭 ${Math.max(...rows)}). 상자 좌표를 다시 잡을 것.`);
            bad++; continue;
        }
        const wMax = Math.max(...rows);
        const yMax = rows.indexOf(wMax);
        /* '허리' = 실루엣이 있는 구간의 세로 중앙 ±10% 대역의 평균 폭.
           🚨 **여기서 '실루엣이 있는 구간'을 `w > 0` 으로 잡으면 이 축이 창 크기에 통째로 끌려간다
              (2026-08-20 UI 스트림, 음성 대조로 확인).** 알 위아래로 **접지 그림자와 소프트 에지**가
              몇 줄씩 깔리는데, 창을 조금만 넓게 잡으면 그 줄들이 구간에 들어와 **세로 중앙이 아래로
              밀리고** 허리를 알의 가장 넓은 자리가 아닌 곳에서 재게 된다. 실측: 같은 알을 창만
              바꿔 재니 **1.010 ↔ 1.133** 이 나왔다(뿔이 없는 판인데도). 그 상태로는 뿔이 있든 없든
              구별이 안 된다 — 음성 대조(뿔을 지우고 재기)가 그걸 잡아냈다.
           👉 그래서 구간은 **최대폭의 25% 이상인 줄**로 잡는다(양쪽에 같은 규칙). 흐린 그림자
              꼬리는 빠지고 알의 몸통만 남아 창을 넓혀도 값이 안 흔들린다. */
        const SOLID = wMax * 0.25;
        const first = rows.findIndex(v => v >= SOLID), last = rows.length - 1 - [...rows].reverse().findIndex(v => v >= SOLID);
        const midY = Math.round((first + last) / 2), band = Math.max(1, Math.round((last - first) * 0.10));
        const waist = rows.slice(midY - band, midY + band + 1).filter(v => v >= SOLID);
        const wWaist = waist.reduce((s, v) => s + v, 0) / waist.length;
        const lobe = wMax / wWaist;
        // 후보 축 진단 — 실루엣 세로 구간의 t 지점 폭 / 최대폭. 뿔은 '몸통이 좁은 높이'에 폭을 만든다.
        const at = (t) => { const y = Math.round(first + (last - first) * t); return rows[y] / wMax; };
        const shoulder = { t20: at(0.20), t30: at(0.30), t40: at(0.40), t50: at(0.50) };
        const span = rows.slice(first, last + 1);
        const flat = span.reduce((a, b) => a + b, 0) / span.length / wMax;   // 평탄도 = 평균폭/최대폭
        const upper = Math.max(...span.slice(0, Math.max(1, Math.round(span.length * 0.40)))) / wMax;  // 상부 폭비

        const med = (v) => { const s = [...v].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
        // 밑동 암도: 아래 22% 대역 vs 몸통 중앙 대역
        const bandRows = (t0, t1) => {
            const a0 = first + Math.round((last - first) * t0), a1 = first + Math.round((last - first) * t1);
            const v = [];
            let idx = 0;
            for (let y = 0; y < rows.length; y++) { const yy = y; if (yy >= a0 && yy <= a1 && rows[y] > 0) v.push(y); }
            return v;
        };
        // ink 배열은 행 순서대로 쌓였으므로 행별 오프셋을 다시 만든다
        const offs = []; let acc = 0;
        for (const w of rows) { offs.push(acc); acc += w; }
        const sliceOf = (yIdxList) => yIdxList.flatMap(y => r.ink.slice(offs[y], offs[y] + rows[y]));
        const botL = med(sliceOf(bandRows(0.78, 1.00)));
        const midL = med(sliceOf(bandRows(0.30, 0.62)));
        const baseDark = botL / midL;

        const bins = new Array(26).fill(0);
        for (const v of r.ink) bins[Math.min(25, Math.floor(v / 10))]++;
        let bi = 0; for (let i = 1; i < bins.length; i++) if (bins[i] > bins[bi]) bi = i;
        const Lm = bi * 10 + 5;
        const inkPct = r.ink.filter(v => Math.abs(v - Lm) >= 60).length / r.ink.length * 100;

        console.log(`\n■ ${c.label}`);
        console.log(`  실루엣 ${first}~${last} 행 · 최대폭 ${wMax}px(행 ${yMax}) · 허리폭 ${wWaist.toFixed(1)}px`);
        console.log(`  ⑴ 로브 돌출도 ${lobe.toFixed(3)}   (매끈한 타원 ≈ 1.00)`);
        console.log(`     어깨 폭비(최대폭 대비) t20 ${shoulder.t20.toFixed(3)} · t30 ${shoulder.t30.toFixed(3)} · t40 ${shoulder.t40.toFixed(3)} · t50 ${shoulder.t50.toFixed(3)} · 평탄도 ${flat.toFixed(3)} · 상부폭비 ${upper.toFixed(3)}`);
        console.log(`  ⑵ 밑동 암도   ${baseDark.toFixed(3)}   (아래 휘도 ${botL.toFixed(0)} / 몸통 ${midL.toFixed(0)} — 작을수록 밑동이 검다)`);
        console.log(`  ⑶ 내부 잉크율 ${inkPct.toFixed(1)}%  (바탕 최빈 휘도 ${Lm})`);
        out.push({ label: c.label, lobe, baseDark, inkPct, shoulder, flat, upper });
    }

    await browser.close();
    if (bad) { console.log('\n측정기 고장 — 수치를 쓰지 말 것.'); process.exit(2); }
    const [ref, clone] = out;
    console.log('\n===== 대조 =====');
    console.log(`⑴ 로브 돌출도   원본 ${ref.lobe.toFixed(3)}  vs  클론 ${clone.lobe.toFixed(3)}`);
    console.log(`⑵ 밑동 암도     원본 ${ref.baseDark.toFixed(3)}  vs  클론 ${clone.baseDark.toFixed(3)}`);
    console.log(`⑶ 내부 잉크율   원본 ${ref.inkPct.toFixed(1)}%  vs  클론 ${clone.inkPct.toFixed(1)}%`);
    console.log(`   (참고) 평탄도(평균폭/최대폭)  원본 ${ref.shoulder ? '' : ''}${ref.flat.toFixed(3)}  vs  클론 ${clone.flat.toFixed(3)}`);
    /* 🚨🚨 **이 자는 더 이상 게이트가 아니다 — 세 축 모두 판정에 못 쓴다 (2026-08-20 UI 스트림, 음성 대조로 확정).**
       ⑵⑶ 이 못 쓰는 축인 건 처음부터 알고 있었다(아래 ⓐⓑ). 이번에 **남은 하나 ⑴ 도 못 쓴다**는 게
       드러났다.
        ⓐ ⑵ 밑동 암도(원본 0.263)는 원본 알의 **굵은 검정 키라인 + 검정 밑동**이 만든 값인데, 사용자
           지시 `outline-halve-egg-none`("펫 알 부분은 검정 아웃라인 빼기")로 우리는 그 검정을
           **일부러 뺐다.** 쫓아가면 `probe-slot-outline` 의 '알 타일엔 테가 없어야 한다'가 뒤집힌다.
        ⓑ ⑶ 내부 잉크율을 더 올리려면 갈매기 무늬를 넣어야 하는데, 그 무늬는 화폐용 `eggCracked` 를
           진짜 알과 갈라 주는 **유일한 표식**이다(사용자 지시 2026-08-18).
        ⓒ 🚨 **⑴ 로브 돌출도 = 최대폭 / 세로중앙 대역폭 은 '뿔이 있나'가 아니라 '창을 어떻게 잡았나'를
           잰다.** 음성 대조(뿔을 그리는 `spur()` 만 끄고 같은 창으로 재기)로 확정했다:
             · 창 A: 뿔 없음 **1.010** ↔ 뿔 있음 1.052
             · 창 B(알이 안 잘리게 넓힌 창): 뿔 없음 **1.161** ↔ 뿔 있음 1.217
           **창을 바꾼 폭(0.15)이 뿔의 유무가 만드는 폭(0.05~0.06)보다 3배 크다.** 알처럼 위아래가
           비대칭인 실루엣은 접지 그림자 몇 줄만 들어와도 '세로 중앙'이 가장 넓은 자리에서 벗어나
           비가 저절로 1 을 넘는다. 그래서 **뿔 없는 알도 게이트를 통과한다** — 판정으로 무의미하다.
        ⓓ 대안 축도 전부 실패했다(같은 세 판으로 실측): **어깨 폭비**(t20/t30/t40/t50) · **상부 폭비**
           (상부 40% 최대폭/최대폭 = 세 판 모두 1.000) · **평탄도**(원본 0.876 ↔ 클론 0.703/0.710 —
           이건 갈리지만 그 격차의 정체가 ⓐ 의 **검정 밑동**이라 결국 사용자 지시로 갈린 축이다).
       👉 **결론: 원본 알과 우리 알의 남은 실루엣 차이는 대부분 '사용자가 빼라고 한 검정 테·밑동'이
          만든 것이고, 그걸 뺀 형태 차이(뿔)는 이 자의 어느 축으로도 안정적으로 안 잡힌다.**
          그래서 판정을 떼고 **측정 덤프**로 남긴다(`regress.sh` 에서도 뺐다). 다시 게이트로 올리려면
          **먼저 음성 대조부터** 할 것 — `spur()` 를 끄고 재서 값이 확실히 떨어지는 축이어야 한다.
       ✅ 참고: 뿔 자체는 2026-08-20 에 **원본 크롭과 눈으로 대조해** 넣었다(자가 아니라 그림이 근거다). */
    console.log(`\n미판정 — 이 자는 게이트가 아니라 **측정 덤프**다(세 축 전부 사용자 지시로 갈렸거나 창에 끌려간다 — 위 주석).`);
    process.exit(0);
})();
