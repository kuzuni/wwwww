// 스킬 오브 안 **모티프가 오브 면과 갈리는가**(잉크 대비)를 원본과 클론에서 같은 자로 잰다.
//
// 왜: 스킬 아이콘 18종을 어두운 시트에 구워 보면 전부 훌륭하다 — 그래서 여러 세션이 "스킬 오브는
// 통과"로 넘겨 왔다. 그런데 실제로 아이콘이 앉는 자리는 어두운 시트가 아니라 **등급색 오브**다.
// `common` 등급색은 `#e0e0e0`(거의 흰색)인데 저등급 스킬 글리프(연속 참격·회오리 베기·응급 처치
// 등)는 **흰~연회색 채움**이라, 흰 글리프가 흰 오브 위에 앉아 **검은 윤곽선만 남는다**. 원본
// (shot-042340)의 오브는 색이 뭐든 모티프가 **진한 채움 + 굵은 윤곽**이라 멀리서도 형태가 읽힌다.
//
// 판정축 — **잉크율**: 오브 면 안에서 '오브 바탕 휘도(최빈값)와 |Δ| ≥ 40 만큼 벌어진 화소'의 비율.
//   ⓐ 최빈 휘도 Lm = 표본의 휘도 히스토그램 봉우리 = 사실상 오브 바탕색.
//   ⓑ 잉크율 = |{ |L - Lm| >= 40 }| / |표본|.
//   이 값은 **한 이미지 안에서 닫혀 있다**(오브 색·이미지 크기·시드와 무관) — 원본과 클론을
//   맞댈 수 있는 이유가 이것이다. 앞 세션들이 절대 휘도를 맞대다 헛수치를 낸 자리다.
//
// 🚨 표본 마스크 — 원본·클론에 **똑같이** 적용한다:
//   · r < 0.85R  : 오브 검정 테두리를 뺀다(테두리는 어느 쪽이든 잉크율을 부풀린다).
//   · dy < -0.25R: 오브 **위쪽만**. 아래쪽엔 Lv 라벨(검정 배지+흰 글자)과 '장착됨' 검정 타원이
//                  앉아 있어, 넣으면 모티프와 무관하게 잉크율이 치솟는다.
//
// ⚠️ 장착 오브는 검정 오버레이가 RGB 에 상수배(≈0.42)를 걸어 **절대 Δ 가 같이 줄어든다** — 즉
//    잉크율이 구조적으로 낮게 나온다. 그래서 장착/미장착을 **섞어서 평균 내면 안 된다**. 아래는
//    미장착 오브만으로 판정하고, 장착 오브는 참고로만 따로 찍는다.
//
// 사용: node probe-skill-orb-ink.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { assertFresh } = require('./clone-fresh.js');

/* 🚨 **이 자는 브라우저를 안 띄운다 — 커밋된 PNG 두 장을 맞대기만 한다.**
   그래서 게임 코드를 고치고 `shot-skills.js` 를 다시 안 돌리면 **옛 화면을 재면서 아무 말도
   안 한다.** 세 세션이 그걸 모르고 헛수치를 읽었다(2026-08-20 UI 스트림이 음성 대조로 발견 —
   `.30 → .24` 가 '무변'으로 보였는데 캡처를 다시 굽고 재니 ⓑ 45.6% → 50.0% 였다).
   사고 전말과 이 가드의 판정 방식은 `clone-fresh.js` 머리말에 있다. */
assertFresh('tools/ref-cmp/clone/skills.png',
    ['web/js/icongen.js', 'web/js/skills.js', 'web/js/ui.js', 'web/css'],
    'node tools/shot-skills.js   # → tools/ref-cmp/clone/skills.png 를 다시 굽는다');

// 오브 격자 기하 — crop-zoom 확대 크롭에서 집고, 아래 자기검증(표본 화소 수·바탕 휘도)으로 확인한다.
const CASES = [
    {
        file: path.resolve(__dirname, '../ref/screens/shot-042340.png'),
        label: '원본 shot-042340',
        R: 22, x0: 90, dx: 77.2, y0: 114, dy: 88, cols: 5, rows: 3,
        equipped: ['2,2', '2,3', '2,4'],           // 3행 3~5열(0-based row,col)
    },
    {
        file: path.resolve(__dirname, 'ref-cmp/clone/skills.png'),
        label: '클론 skills.png',
        R: 25, x0: 94, dx: 77.6, y0: 111, dy: 89, cols: 5, rows: 3,
        equipped: ['0,0', '0,1', '0,2'],           // 1행 1~3열
    },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const out = [];
    let bad = 0;

    for (const c of CASES) {
        if (!fs.existsSync(c.file)) { console.error('없음:', c.file); process.exit(2); }
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(c.file).toString('base64');
        const cells = [];
        for (let r = 0; r < c.rows; r++) for (let k = 0; k < c.cols; k++) {
            cells.push({ key: `${r},${k}`, cx: c.x0 + c.dx * k, cy: c.y0 + c.dy * r });
        }
        const res = await page.evaluate(async (a) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = a.dataUrl; });
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const D = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
            return a.cells.map((c2) => {
                const R = a.R, Ls = [], RGB = [];
                for (let dy = -R; dy <= R; dy++) {
                    for (let dx = -R; dx <= R; dx++) {
                        if (Math.hypot(dx, dy) > 0.85 * R) continue;
                        if (dy > -0.25 * R) continue;
                        const x = Math.round(c2.cx + dx), y = Math.round(c2.cy + dy);
                        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
                        const i = (y * W + x) * 4;
                        Ls.push(0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]);
                        RGB.push([D[i], D[i + 1], D[i + 2]]);
                    }
                }
                if (Ls.length < 40) return { key: c2.key, n: Ls.length, broken: true };
                // 최빈 휘도(폭 10 빈)
                const bins = new Array(26).fill(0);
                for (const L of Ls) bins[Math.min(25, Math.floor(L / 10))]++;
                let bi = 0; for (let i = 1; i < bins.length; i++) if (bins[i] > bins[bi]) bi = i;
                let s = 0, n = 0;
                for (const L of Ls) if (Math.floor(L / 10) === bi) { s += L; n++; }
                const Lm = n ? s / n : bi * 10 + 5;
                const inkIdx = [];
                for (let i = 0; i < Ls.length; i++) if (Math.abs(Ls[i] - Lm) >= 40) inkIdx.push(i);
                const ink = inkIdx.length / Ls.length * 100;
                // 잉크 화소의 평균 채도 — '모티프가 색을 가졌나 흰가'를 재는 값(아래 판정에는 안 쓴다).
                // 순검정 키라인(채도 0)은 원본·클론 **양쪽에** 있으므로 상수 편향으로 대체로 상쇄된다.
                let sat = 0, satC = 0, nC = 0, nK = 0;
                for (const i of inkIdx) {
                    const [r, g2, b] = RGB[i], mx = Math.max(r, g2, b), mn = Math.min(r, g2, b);
                    const sv = mx ? (mx - mn) / mx : 0;
                    sat += sv;
                    // 키라인 몫과 채움 몫을 가른다 — 아래 ⓐⓑ 참조.
                    if (Ls[i] < 60) nK++; else { satC += sv; nC++; }
                }
                sat = inkIdx.length ? sat / inkIdx.length * 100 : 0;
                const kBlack = inkIdx.length ? nK / inkIdx.length * 100 : 0;
                const satCol = nC ? satC / nC * 100 : 0;
                return { key: c2.key, n: Ls.length, Lm, ink, sat, kBlack, satCol };
            });
        }, { dataUrl, R: c.R, cells });

        const eqSet = new Set(c.equipped);
        const un = res.filter(o => !o.broken && !eqSet.has(o.key));
        const eq = res.filter(o => !o.broken && eqSet.has(o.key));
        const avg = (v, f) => v.length ? v.reduce((s, x) => s + f(x), 0) / v.length : 0;

        console.log(`\n■ ${c.label}`);
        for (const o of res) {
            if (o.broken) { console.log(`   ${o.key}  표본 ${o.n} — 🚨 표본 부족`); bad++; continue; }
            console.log(`   ${o.key}${eqSet.has(o.key) ? ' (장착)' : '       '}  바탕 휘도 ${o.Lm.toFixed(0).padStart(3)}  잉크율 ${o.ink.toFixed(1).padStart(5)}%  표본 ${o.n}`);
        }
        const unInk = avg(un, o => o.ink), eqInk = avg(eq, o => o.ink);
        const unSat = avg(un, o => o.sat), unK = avg(un, o => o.kBlack), unSatCol = avg(un, o => o.satCol);
        const weak = un.filter(o => o.ink < 20);
        console.log(`  ▶ 미장착 ${un.length}개 평균 잉크율 ${unInk.toFixed(1)}%  ·  (참고) 장착 ${eq.length}개 ${eqInk.toFixed(1)}%`);
        console.log(`  ▶ 잉크율 20% 미만 미장착 오브: ${weak.length}개${weak.length ? ' — ' + weak.map(o => `${o.key}(${o.ink.toFixed(1)}%)`).join(', ') : ''}`);
        console.log(`  ▶ (참고) 미장착 오브 잉크 화소 평균 채도 ${unSat.toFixed(1)}% — '모티프가 색을 가졌나 흰가'`);
        console.log(`  ▶ (참고) 잉크 화소 중 '거의 검정'(L<60) ${unK.toFixed(1)}%  ·  그걸 뺀 채움 화소 평균 채도 ${unSatCol.toFixed(1)}%`);
        out.push({ label: c.label, unInk, eqInk, unSat, unK, unSatCol, weak: weak.length, un });
    }

    await browser.close();
    const [ref, clone] = out;
    console.log('\n===== 대조 =====');
    console.log(`미장착 평균 잉크율   원본 ${ref.unInk.toFixed(1)}%  vs  클론 ${clone.unInk.toFixed(1)}%   (차 ${(clone.unInk - ref.unInk).toFixed(1)}%p)`);
    console.log(`잉크율 20% 미만 개수  원본 ${ref.weak}/${ref.un.length}  vs  클론 ${clone.weak}/${clone.un.length}`);
    console.log(`잉크 채도(참고·판정 제외)  원본 ${ref.unSat.toFixed(1)}%  vs  클론 ${clone.unSat.toFixed(1)}%   (차 ${(clone.unSat - ref.unSat).toFixed(1)}%p)`);
    console.log(`  ⓐ 그중 '거의 검정'(키라인) 몫   원본 ${ref.unK.toFixed(1)}%  vs  클론 ${clone.unK.toFixed(1)}%   (차 ${(clone.unK - ref.unK).toFixed(1)}%p)`);
    console.log(`  ⓑ 검정을 뺀 **채움** 화소 채도   원본 ${ref.unSatCol.toFixed(1)}%  vs  클론 ${clone.unSatCol.toFixed(1)}%   (차 ${(clone.unSatCol - ref.unSatCol).toFixed(1)}%p)`);
    console.log(`   ↑ 🚨 **ⓐ 없이 위 한 줄만 읽으면 오독한다** (2026-08-20 UI 스트림이 실제로 당했다).`);
    console.log(`     스킬 색 18종을 블록 팔레트로 옮겨 **팔레트 채도를 46.9% → 69.2%** 로 올렸는데도`);
    console.log(`     위 '잉크 채도'는 32.9% → 33.0% 로 **꿈쩍하지 않았다.** 이유가 ⓐ 다 —`);
    console.log(`     우리 키라인은 원본 실측 비 .067 이라 잉크 화소의 큰 몫이 **채도 0 인 순검정**이고,`);
    console.log(`     그 몫이 평균을 붙들고 있다. 즉 이 지표는 '채움이 얼마나 색을 가졌나'가 아니라`);
    console.log(`     **'키라인이 얼마나 두꺼운가'** 를 같이 재고 있다. 채움만 보려면 ⓑ 를 볼 것.`);
    console.log(`     ⚠️ ⓐ 를 줄이려고 키라인을 얇게 만들지 말 것 — 두께 .067 은 원본 실측 비이고`);
    console.log(`        '순검정 키라인 + 평면 채움'은 이 게임 아이콘 화법의 핵심이다(probe-icon-keyline).`);
    console.log(`   🚨 **위 '32.9 → 33.0 으로 꿈쩍하지 않았다'의 근거는 의심할 것 (2026-08-20 정정).**`);
    console.log(`      그 A/B 를 뜰 때 이 자에는 신선도 가드가 없었고 클론 캡처를 다시 구운 기록도 없다.`);
    console.log(`      캡처가 낡으면 **화면이 뭐가 바뀌든 수치가 안 움직인다** — 바로 그 서명이다`);
    console.log(`      (같은 자로 '.30 → .24 는 ⓑ 무변' 이라는 틀린 결론이 실제로 한 번 나갔다).`);
    console.log(`      ⓐ 가 평균을 붙든다는 설명 자체는 맞지만, **팔레트 교체가 정말 안 들었는지는 다시 재야 한다.**`);
    if (bad) { console.log('\n측정기 고장 — 수치를 쓰지 말 것.'); process.exit(2); }
    const ok = clone.unInk >= ref.unInk - 8 && clone.weak <= ref.weak;
    console.log(ok ? '\nPASS' : '\nFAIL — 클론 오브의 모티프가 원본만큼 오브 면과 갈리지 않는다.');
    process.exit(ok ? 0 : 1);
})();
