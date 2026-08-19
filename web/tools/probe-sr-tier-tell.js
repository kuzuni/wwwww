// 소환 결과 팝업의 **등급 예고** 실측 — 9차 비평가 B ⑴ [치명] "공개 전 등급 예고가 0" 회귀 감시.
// 사용: node probe-sr-tier-tell.js
//
// 지적 원문의 근거: `skill-x5-620`(전원 일반)과 `tl-x5-hi/t0600`(신화 포함)이 **사실상 같은 화면**이라,
// 원신 긴장의 원천인 '색으로 미리 알려주기'가 통째로 없다. 그래서 이 프로브는 **그 두 프레임을
// 같은 방법으로 다시 찍어 차이를 수치로 낸다.**
//
// 두 층에서 잰다:
//  ⒜ 렌더 입력 — `--pre-k`와 그것을 먹는 4레이어(빛 모임 중간 밴드·수렴 빛줄기·배경 방사선·충격파)의
//     computed 값. 여기서 안 갈리면 픽셀은 볼 필요도 없다.
//  ⒝ 실제 픽셀 — 빌드업 프레임(공개 전)의 플레이영역 평균색. 일반 판 대비 **채널 델타의 방향이
//     그 등급색 방향과 같고**(내적 > 0) 크기가 기준을 넘어야 통과. 방향을 같이 보는 이유:
//     그냥 밝기만 올려도 델타 크기는 커지므로, 크기만 재면 '예고'가 아니라 '밝아짐'을 통과시킨다.
//
// ⚠️ 시크 함정(앞 세션들이 두 번 밟은 것) — ㉠ **시각을 역순으로 감지 말 것**(되감으면 재생성된
//    애니메이션이 getAnimations()에 없어 직전 프레임에 멈춘 채 찍힌다). 여기서는 판마다 팝업을
//    새로 열고 **오름차순 한 방향으로만** 시크한다. ㉡ 축적 구간 애니메이션의 원점은 0이 아니라
//    d[n-2]다 — 이 프로브가 보는 시각(430·620ms)은 축적 구간 전이라 해당 없지만, 시각을 늘릴 때는
//    shot-summon-result.js 의 SEEK 를 그대로 가져올 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;

// 최고 등급을 지정해 x5 판을 만든다 — 소환 확률에 맡기면 신화 판이 안 나와 측정이 못 돈다.
// `UI.openSummonResult('skill', rolls)` 직접 호출은 probe-sr-band.js 가 쓰는 것과 같은 경로.
const MAKE = (top) => `(() => {
    const lows = SKILL_DEFS.filter(d => d.rarity === 'common');
    const top4 = SKILL_DEFS.filter(d => d.rarity === '${top}');
    if (!lows.length || !top4.length) return 'pool-empty';
    // 4개는 일반, 마지막 1개만 목표 등급 — 그리드 구성은 판마다 같고 **최고 등급만** 다르다
    const rolls = [lows[0], lows[1 % lows.length], lows[2 % lows.length], lows[0], top4[0]]
        .map(d => ({ def: d, isNew: false }));
    UI.openSummonResult('skill', rolls);
    return 'ok';
})()`;

// 시각: 첫째 = 순수 빌드업(셀 0개, 정점 UI.SR_CHARGE_MS 직전), 둘째 = 첫 셀만 뜬 프레임
// (비평가 B가 두 판을 비교한 옛 430/620ms 를 summon-anim-halve 타임라인(정점 480→240ms)에
//  맞춰 같은 비율로 환산 — 215 < 240 = 공개 전, 310 은 첫 셀(240)과 둘째 셀(365) 사이)
const TIMES = [215, 310];
const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays;
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.closest) continue;
        const cell = el.closest('.sr-cell');
        const base = cell ? (d[cells.indexOf(cell)] || 0) : 0;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
    return cells.filter(c => c.classList.contains('on')).length;
})`;

// ⚠️ **자(尺) 주의 — 방향 판정은 두 번 고쳤다. 다음 세션이 되돌리지 말 것.**
// ㉠ 처음엔 기준 벡터를 `등급색 − 중립빌드업색(#96beff)`으로 잡았는데, 예고가 걸린 층마다
//    출발색이 다르다(빛 모임은 #96beff, 배경은 #24306a/#101740). 한 층의 출발색을 전 층에
//    들이대니 멀쩡한 자색 델타가 코사인 0.11로 '어긋남'으로 나왔다 — 구현이 아니라 자가 틀렸다.
//    ⇒ 기준을 **`등급색 − 그 프레임의 일반 판 색`**으로 바꿨다. "화면이 그 등급색 쪽으로
//      움직였나"라는, 층 구성과 무관한 질문이 된다.
// ㉡ 그런데 그것만으로는 **그냥 밝아진 것도 통과한다** — 밝기 델타 (1,1,1)은 위 기준 벡터와
//    코사인 0.88이나 된다(실측 계산). 그래서 양쪽 벡터에서 **무채(휘도) 성분을 빼고**
//    남은 색 성분만으로 방향을 본다. 밝기만 올리면 색 성분이 0이 되어 반드시 떨어진다.
const MIN_DELTA = 3.0;    // 일반 판 대비 평균 채널 델타(0~255). 3.0 = 약 1.2%
const MIN_CHROMA = 1.5;   // 그중 **색** 성분(무채 제거 후)의 채널당 크기 — 밝기만 오른 것을 걸러낸다
const MIN_COS = 0.6;      // 색 성분 방향이 등급색 방향과 이루는 코사인
// 무채(휘도) 성분을 제거해 색 성분만 남긴다
const chroma = (v) => { const m = (v[0] + v[1] + v[2]) / 3; return v.map(c => c - m); };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (v) => Math.hypot(...v);

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push('console ' + e.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Scene3D !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SEED);
    await page.evaluate(() => { Scene3D.update = function () { }; });   // 3D 루프 정지 — 캡처가 빠르다
    await page.waitForTimeout(500);

    const rarityCss = await page.evaluate(() => RARITY_CSS);
    const cases = ['common', 'epic', 'mythic'];
    const runs = {};
    const fails = [];

    for (const top of cases) {
        const made = await page.evaluate(MAKE(top));
        if (made !== 'ok') { fails.push(`${top}: 스킬 풀이 비어 판을 못 만들었다 (${made})`); continue; }
        await page.waitForTimeout(150);

        // ⒜ 렌더 입력
        const inputs = await page.evaluate(() => {
            const m = document.getElementById('summon-result-modal');
            const cs = el => el ? getComputedStyle(el) : null;
            const st = cs(m.querySelector('.sr-streaks i'));
            return {
                k: +(m.style.getPropertyValue('--pre-k') || 0),
                sc: +(m.style.getPropertyValue('--pre-sc') || 1),
                chargeBg: cs(m.querySelector('.sr-charge')).backgroundImage,
                streakW: +parseFloat(st.width).toFixed(3),
                streakBg: st.backgroundImage,
                raysOpacity: +parseFloat(cs(m.querySelector('.sr-rays')).opacity).toFixed(4),
                shockBorder: cs(m.querySelector('.sr-shock')).borderTopColor,
                haloBg: cs(m.querySelector('.sr-halo')).backgroundImage,
            };
        });

        // ⒝ 픽셀 — 시각을 오름차순으로만 감는다
        const frames = {};
        for (const T of TIMES) {
            const onCells = await page.evaluate(`(${SEEK})(${T})`);
            const b64 = (await page.screenshot({ timeout: 90000 })).toString('base64');
            const px = await page.evaluate(async ({ b64 }) => {
                const im = new Image();
                await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
                const c = document.createElement('canvas');
                c.width = im.width; c.height = im.height;
                const g = c.getContext('2d'); g.drawImage(im, 0, 0);
                // 플레이영역 = 팝업 전체(모달이 풀스크린) 중 상·하단 여백을 뺀 가운데 74%
                const y0 = Math.round(im.height * .13), y1 = Math.round(im.height * .87);
                const d = g.getImageData(0, y0, im.width, y1 - y0).data;
                let r = 0, gg = 0, b = 0, n = 0, hot = 0;
                for (let i = 0; i < d.length; i += 4) {
                    r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
                    if ((d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) > 200) hot++;
                }
                return { r: r / n, g: gg / n, b: b / n, hot: +(hot / n).toFixed(5) };
            }, { b64 });
            frames[T] = { ...px, onCells };
        }
        runs[top] = { inputs, frames };
        await page.evaluate(() => UI.closeSummonResult());
        await page.waitForTimeout(140);
    }
    await browser.close();

    const base = runs.common;
    if (!base) { console.log('일반 판 기준선을 못 만들었다 — 중단'); process.exit(1); }

    console.log('― 렌더 입력 (--pre-k → 4레이어) ―');
    for (const top of cases) {
        const r = runs[top]; if (!r) continue;
        const i = r.inputs;
        console.log(`  ${top.padEnd(7)} k=${i.k.toFixed(3)} sc=${i.sc.toFixed(3)} 빛줄기폭=${i.streakW}px `
            + `방사선불투명=${i.raysOpacity} 충격파선=${i.shockBorder}`);
    }
    // 입력 층 판정: 등급이 올라가면 k·굵기·불투명도가 **단조 증가**하고, 색 문자열이 서로 달라야 한다
    const ks = cases.filter(c => runs[c]).map(c => runs[c].inputs.k);
    for (let i = 1; i < ks.length; i++) if (!(ks[i] > ks[i - 1])) fails.push(`--pre-k 가 등급에 따라 안 오른다: ${ks.join(' → ')}`);
    for (const key of ['chargeBg', 'streakBg', 'shockBorder', 'haloBg']) {
        if (runs.mythic && runs.mythic.inputs[key] === base.inputs[key]) {
            fails.push(`빌드업 레이어 ${key} 가 일반 판과 **같은 값** — 그 층에는 예고가 안 걸렸다`);
        }
    }
    if (runs.mythic && !(runs.mythic.inputs.streakW > base.inputs.streakW)) fails.push('빛줄기 굵기가 등급에 반응하지 않는다');
    if (runs.mythic && !(runs.mythic.inputs.raysOpacity > base.inputs.raysOpacity)) fails.push('배경 방사선 불투명도가 등급에 반응하지 않는다');

    console.log('\n― 픽셀: 일반 판 대비 델타(플레이영역 평균, 0~255) ―');
    for (const top of cases) {
        const r = runs[top]; if (!r || top === 'common') continue;
        for (const T of TIMES) {
            const f = r.frames[T], b = base.frames[T];
            const dv = [f.r - b.r, f.g - b.g, f.b - b.b];
            // 기준 벡터 = 등급색 − **그 시각의 일반 판 색**(위 자 주의 ㉠)
            const want = [0, 1, 2].map(i => parseInt(rarityCss[top].slice(1 + i * 2, 3 + i * 2), 16) - [b.r, b.g, b.b][i]);
            const dc = chroma(dv), wc = chroma(want);          // 무채 성분 제거(㉡)
            const mag = norm(dv) / Math.sqrt(3);
            const cmag = norm(dc) / Math.sqrt(3);
            const cos = (norm(dc) && norm(wc)) ? dot(dc, wc) / (norm(dc) * norm(wc)) : 0;
            console.log(`  ${top.padEnd(7)} t${T}: ΔRGB ${dv.map(v => v.toFixed(2).padStart(6)).join(' ')} `
                + `· 크기 ${mag.toFixed(2)} · 색성분 ${cmag.toFixed(2)} · 등급색 방향 코사인 ${cos.toFixed(3)} `
                + `· 셀 ${f.onCells}개 · 고휘도 ${(f.hot * 100).toFixed(2)}%`);
            if (top === 'mythic') {
                if (mag < MIN_DELTA) fails.push(`t${T} 신화 판이 일반 판과 사실상 같은 화면 — 채널 델타 ${mag.toFixed(2)} < 기준 ${MIN_DELTA}`);
                if (cmag < MIN_CHROMA) fails.push(`t${T} 신화 판이 **색이 아니라 밝기만** 달라졌다 — 색 성분 ${cmag.toFixed(2)} < 기준 ${MIN_CHROMA}`);
                if (cos < MIN_COS) fails.push(`t${T} 신화 판의 색 성분이 신화색 방향과 어긋난다 — 코사인 ${cos.toFixed(3)} < 기준 ${MIN_COS}`);
            }
        }
    }
    // 빌드업 프레임(TIMES[0])에는 셀이 하나도 떠 있으면 안 된다 — '공개 전'을 재고 있다는 전제
    for (const top of cases) {
        const r = runs[top]; if (!r) continue;
        if (r.frames[TIMES[0]] && r.frames[TIMES[0]].onCells !== 0) {
            fails.push(`${top} t${TIMES[0]} 에 셀이 ${r.frames[TIMES[0]].onCells}개 떠 있다 — 공개 전 프레임이 아니라 측정 전제가 깨졌다`);
        }
    }

    console.log('');
    if (errors.length) { console.log(`콘솔/페이지 에러 ${errors.length}건:`); errors.slice(0, 6).forEach(e => console.log('   ' + e)); }
    if (fails.length) {
        console.log(`FAIL ${fails.length}건`);
        fails.forEach(f => console.log('  ✗ ' + f));
        process.exit(1);
    }
    if (errors.length) process.exit(1);
    console.log('PASS — 공개 전 빌드업이 최고 등급에 반응한다(입력 4레이어 + 픽셀 방향·크기)');
})();
