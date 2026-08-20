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
const { assertFresh } = require('./clone-fresh.js');
/* 🚨 **이 자는 브라우저를 안 띄운다 — 커밋된 클론 캡처 PNG 를 원본과 맞대기만 한다.**
   그래서 게임 코드를 고치고 캡처를 다시 굽지 않으면 **옛 화면을 재면서 아무 말도 안 한다.**
   그 사고가 실제로 났다(`probe-skill-orb-ink` — `clone-fresh.js` 머리말에 전말이 있다).
   ⚠️ 지금은 **경고 전용**이다: 소스 목록이 `web/js`·`web/css` 로 넓어서 무관한 작업에도 자주
      걸리기 때문에 끊지는 않는다. 이 화면을 그리는 파일만으로 목록을 **좁힌 뒤** 네 번째 인자를
      빼면 하드 게이트(exit 2)가 된다. */
assertFresh('tools/ref-cmp/clone/pets.png', ['web/js', 'web/css'], 'node tools/shot-pets.js  # 또는 shot-screens.js', { warnOnly: true });


// [파일, 라벨, 알 하나를 감싸는 상자(x,y,w,h) — '알' 글자는 뺀다]
const CASES = [
    { file: path.resolve(__dirname, '../ref/screens/shot-042356.png'), label: '원본 shot-042356', box: [299, 62, 46, 48] },
    { file: path.resolve(__dirname, 'ref-cmp/clone/pets.png'), label: '클론 pets.png', box: [306, 60, 46, 48] },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const out = [];
    let bad = 0;

    for (const c of CASES) {
        if (!fs.existsSync(c.file)) { console.error('없음:', c.file); process.exit(2); }
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(c.file).toString('base64');
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
            for (let y = by; y < by + bh; y++) {
                let x0 = -1, x1 = -1;
                for (let x = bx; x < bx + bw; x++) if (L(x, y) < 232) { if (x0 < 0) x0 = x; x1 = x; }
                rows.push(x0 < 0 ? 0 : x1 - x0 + 1);
                if (x0 >= 0) for (let x = x0; x <= x1; x++) ink.push(L(x, y));
            }
            return { rows, ink, h: bh };
        }, { dataUrl, box: c.box });

        const rows = r.rows;
        const filled = rows.filter(v => v > 0).length;
        if (filled < r.h * 0.55 || Math.max(...rows) < 12) {
            console.log(`\n■ ${c.label}\n  🚨 자기검증 실패 — 실루엣이 상자를 못 채웠다(채운 행 ${filled}/${r.h}, 최대폭 ${Math.max(...rows)}). 상자 좌표를 다시 잡을 것.`);
            bad++; continue;
        }
        const wMax = Math.max(...rows);
        const yMax = rows.indexOf(wMax);
        // '허리' = 실루엣이 있는 구간의 세로 중앙 ±10% 대역의 평균 폭
        const first = rows.findIndex(v => v > 0), last = rows.length - 1 - [...rows].reverse().findIndex(v => v > 0);
        const midY = Math.round((first + last) / 2), band = Math.max(1, Math.round((last - first) * 0.10));
        const waist = rows.slice(midY - band, midY + band + 1).filter(v => v > 0);
        const wWaist = waist.reduce((s, v) => s + v, 0) / waist.length;
        const lobe = wMax / wWaist;

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
        console.log(`  ⑵ 밑동 암도   ${baseDark.toFixed(3)}   (아래 휘도 ${botL.toFixed(0)} / 몸통 ${midL.toFixed(0)} — 작을수록 밑동이 검다)`);
        console.log(`  ⑶ 내부 잉크율 ${inkPct.toFixed(1)}%  (바탕 최빈 휘도 ${Lm})`);
        out.push({ label: c.label, lobe, baseDark, inkPct });
    }

    await browser.close();
    if (bad) { console.log('\n측정기 고장 — 수치를 쓰지 말 것.'); process.exit(2); }
    const [ref, clone] = out;
    console.log('\n===== 대조 =====');
    console.log(`⑴ 로브 돌출도   원본 ${ref.lobe.toFixed(3)}  vs  클론 ${clone.lobe.toFixed(3)}`);
    console.log(`⑵ 밑동 암도     원본 ${ref.baseDark.toFixed(3)}  vs  클론 ${clone.baseDark.toFixed(3)}`);
    console.log(`⑶ 내부 잉크율   원본 ${ref.inkPct.toFixed(1)}%  vs  클론 ${clone.inkPct.toFixed(1)}%`);
    // 🚨 **셋 중 판정하는 축은 ⑴ 하나뿐이다.** ⑵⑶ 을 게이트로 걸면 사용자 지시를 되돌리게 된다:
    //   · ⑵ 밑동 암도(원본 0.263) 는 원본 알의 **굵은 검정 키라인 + 검정 밑동**이 만든 값이다.
    //     그런데 사용자 지시 `outline-halve-egg-none`("펫 알 부분은 검정 아웃라인 빼기")로 우리는
    //     그 검정을 **일부러 뺐다**. 즉 이 축의 차이는 결함이 아니라 **지시대로 갈라진 것**이다.
    //     쫓아가면 `probe-slot-outline` 의 '알 타일엔 테가 없어야 한다' 판정이 즉시 뒤집힌다.
    //   · ⑶ 내부 잉크율은 이미 원본과 3.9%p 차라 사실상 붙어 있다. 여기서 더 올리려면 갈매기 무늬를
    //     넣어야 하는데, 그 무늬는 화폐용 `eggCracked` 를 진짜 알과 갈라 주는 **유일한 표식**이다
    //     (사용자 지시 2026-08-18). 넣으면 두 알이 같아진다.
    // 그래서 남는 축은 ⑴ 실루엣뿐이다 — 원본 알은 좌우로 **뿔(로브)** 이 뻗은 몬스터 알이고 우리
    // 알은 매끈한 타원이다. 이건 검정 아웃라인과 무관한 **형태** 차이다.
    const ok = clone.lobe >= ref.lobe - 0.03;
    console.log(`\n판정축 ⑴ 로브 돌출도만 채점한다 (⑵⑶ 은 사용자 지시로 일부러 갈라진 축 — 위 주석 참조)`);
    console.log(ok
        ? `PASS — 클론 ${clone.lobe.toFixed(3)} ≥ 원본 ${ref.lobe.toFixed(3)} - 0.03`
        : `FAIL — 클론 알 실루엣이 매끈한 타원이다(${clone.lobe.toFixed(3)}). 원본은 좌우 뿔이 있어 ${ref.lobe.toFixed(3)}.`);
    process.exit(ok ? 0 : 1);
})();
