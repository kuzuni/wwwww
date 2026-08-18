// 소환 결과 팝업 — **같은 최고 등급이 한 화면에서 두 크기로 나오는 문제** 실측
// 사용: node probe-sr-peer.js   (종료코드 0 = 통과)
//
// 10차 잔여 ⑥ (A ⓻ [중간]) 원문: "`tl-x75/t3060` 의 히어로 '신의 창' 159px vs 3행 5번째
// '신성한 가호' 60px — 같은 신화인데 최고 등급 시각 무게가 같은 프레임에서 2.6배 차이."
// 원인은 구조다: `heroIdx = entries.length - 1` 이라 **최고 등급이 여러 셀이어도 마지막 하나만**
// `.heroic` 을 받고, 나머지 동급 셀은 아래 등급과 똑같은 평범한 셀로 그려진다.
//
// ── 자(尺)를 두 개 쓴다. 하나로는 못 잰다 ──
//  ① `heroPeer` = 주역 구체 폭 ÷ 동급(peer) 구체 폭. 지적이 잰 그 값(2.6)이다.
//     ⚠️ **1.0 을 목표로 삼으면 안 된다.** 주역이 단독 행에서 '따로 선 주인공'으로 읽히는 건
//        앞 회차들이 [치명] 지적을 받고 만들어 낸 것이라(9차 A ⑴), 동급을 주역만큼 키우면
//        그 성과가 무너진다. 요구는 '같아져라'가 아니라 **'동급이 평범한 드랍으로 안 보여라'** 다.
//  ② `peerStep` = 동급 구체 폭 ÷ **바로 아래 등급** 구체 폭. 이쪽이 진짜 판정이다 —
//     동급 셀이 아래 등급과 구분되는지. 수정 전에는 `--sz` 계단(1.26 vs 1.16)만 남아 1.09 다.
//  ③ 크기만으로는 '한 등급 큰 구슬'일 뿐이라, 동급이 **광채 층**을 갖는지도 본다
//     (`--glow`·`--ray`·`--ringmax` computed). 크기·광채 둘 다 갈려야 '최고 등급'으로 읽힌다.
//
// ⚠️ 시크 함정(앞 세션들이 밟은 것) — 시각을 **역순으로 감지 말 것**(되감으면 재생성된
//    애니메이션이 getAnimations() 에 없어 직전 프레임에 멈춘 채 찍힌다). 여기서는 판마다
//    팝업을 새로 열고 안정 상태(`done`) 하나만 본다 — 크기 비교는 등장 중이 아니라 **안정
//    상태에서** 해야 한다(등장 중에는 팝 스케일이 섞여 무엇을 재는지 알 수 없다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;

// 최고 등급(신화)이 **여러 셀**로 나오는 판을 만든다 — 이 지적은 동급이 둘 이상일 때만 생긴다.
// 서로 다른 신화 def 를 써야 셀이 합쳐지지 않는다(같은 def 는 groupSummonEntries 가 ×N 한 칸으로 묶는다).
// 판 크기 2종: x75 대량(dense/mid 경로)과 소량(herorow 경로) — 지적은 x75 에서 나왔지만
// 같은 구조 결함이 소량 판에도 있는지 함께 본다.
// ⚠️ **셀 수는 rolls 길이가 아니라 '서로 다른 def 수'로 정해진다** — 11개 이상(`SR_MERGE_FROM`)이면
//    `groupSummonEntries` 가 같은 def 를 한 칸(×N)으로 묶기 때문이다. 처음엔 저등급 3종만 반복해
//    72개를 굴렸다가 6셀짜리 `herorow` 판이 나와, 정작 지적이 나온 **mid/dense 판을 못 재고 있었다.**
//    큰 판을 원하면 **서로 다른 def 를 그만큼** 넣어야 한다(스킬 풀은 등급당 3종 = 최대 18셀).
const MAKE = (wide) => `(() => {
    const by = r => SKILL_DEFS.filter(d => d.rarity === r);
    const myth = by('mythic'), ult = by('ultimate');
    if (myth.length < 2 || !ult.length) return 'pool-empty';
    // 최고 등급(신화)은 **서로 다른 def 2개** — 이 지적은 동급이 둘 이상일 때만 생긴다.
    // 바로 아래 등급(궁극의) 1개는 '동급이 아래와 갈리는가'의 자다.
    const head = [ult[0], myth[0], myth[1]];
    const rest = ${wide}
        ? SKILL_DEFS.filter(d => head.indexOf(d) < 0)                    // 전 등급 = 15셀 + head 3 = 18셀(dense/mid)
        : by('common').slice(0, 2).concat(by('rare').slice(0, 1));       // 3셀 + head 3 = 6셀(herorow)
    const rolls = rest.concat(head);
    UI.openSummonResult('skill', rolls.map(d => ({ def: d, isNew: false })));
    UI.onSummonResultTap();   // 연출 스킵 — 크기 비교는 등장 중이 아니라 안정 상태에서 한다
    return 'ok';
})()`;

// ⚠️ **재기 전에 애니메이션을 끝까지 밀어야 한다.** `srrecede`(주역 착지 때 비주역 셀을 눌렀다
//    되돌리는 포커스 풀)가 도는 중에 재면 동급 구체가 실제보다 작게 잡혀, 같은 코드에서 동급/아래
//    비가 1.02 와 1.23 을 오갔다(자가 계측의 비결정성이지 코드 결함이 아니다).
//    무한 반복(`srpulse` 등)은 finish() 가 예외를 던지므로 건너뛴다 — 그쪽은 크기를 안 건드린다.
const READ = `(() => {
    for (const a of document.getAnimations()) { try { a.finish(); } catch (e) { /* 무한 반복 */ } }
    // 🚨 '.sr-cell' 을 통째로 긁으면 안 된다 — 바닥 반사가 그리드를 통째로 복제한다.
    //    buildSummonReflection()(8차에 하단 빈 밴드를 채우려고 넣은 의도된 요소)이 '.sr-grid' 를
    //    cloneNode(true) 해 '.sr-reflect' 안에 넣는데, 그 복제본은 '.heroic' 만 떼고 '.peer' 와
    //    data-tier 는 그대로 갖는다. 그래서 6셀 판이 12셀로, 최고 등급 2개가 4개로 잡혔다
    //    (표식 없는 tier 5 셀 = 반사본의 옛 주역). 코드 결함이 아니라 자가 계측 오류였다 —
    //    이 항목에서 같은 종류의 오측정이 네 번째다. 게임 코드가 쓰는 것과 같은 자식 선택자로 좁힌다.
    const cells = [...document.querySelectorAll('#summon-result-modal .sr-body > .sr-grid > .sr-cell')];
    const grid = document.querySelector('#summon-result-modal .sr-body > .sr-grid');
    return {
        gridCls: grid ? grid.className : '',
        heroIdx: UI._srHeroIdx,
        cells: cells.map((c, i) => {
            const w = c.querySelector('.sr-orbwrap');
            const r = w ? w.getBoundingClientRect() : null;
            const cs = getComputedStyle(c);
            return {
                i, tier: +c.dataset.tier,
                heroic: c.classList.contains('heroic'),
                peer: c.classList.contains('peer'),
                w: r ? +r.width.toFixed(2) : 0,
                glow: parseFloat(cs.getPropertyValue('--glow')) || 0,
                ray: parseFloat(cs.getPropertyValue('--ray')) || 0,
                ringmax: parseFloat(cs.getPropertyValue('--ringmax')) || 0,
                // 렌더 폭은 셀 폭에 딸려 가고, 셀 폭은 **이름 길이**에 딸려 간다(플렉스 콘텐츠 폭) —
                // 그래서 폭 하나로는 '등급 계단'을 못 잰다. 래퍼에 실제로 걸린 스케일을 같이 읽어
                // 레이아웃과 무관한 축을 하나 만든다.
                // 정규식으로 matrix 를 파싱하면 템플릿 리터럴 안에서 역슬래시가 한 겹 먹혀 깨진다 —
                // DOMMatrix 로 읽는다(a = x축 스케일).
                scale: w ? +(new DOMMatrix(getComputedStyle(w).transform).a).toFixed(4) : 0,
            };
        }),
    };
})()`;

// 게이트 — 2026-08-18 실측 기준선. 수정 전: heroPeer 2.63 / peerStep 1.09 / peer 광채 계단 없음.
const HERO_PEER_MAX = 2.10;   // 주역이 동급보다 이만큼까지만 크다(주역의 '주인공' 지위는 남긴다)
// 렌더 폭 게이트는 **느슨하게** 둔다 — 셀 폭이 이름 길이에 딸려 가서 판마다 ±8% 흔들린다
// (herorow 실측: 같은 행 안 셀 기본폭 47.5 vs 54.4px). 계단이 실제로 걸렸는지는 아래 스케일 축이 본다.
const PEER_STEP_MIN = 1.05;   // 동급이 바로 아래 등급보다 렌더 폭으로도 최소 이만큼 크다
const PEER_SCALE_MIN = 1.20;  // 동급/아래등급 래퍼 스케일비(레이아웃 무관 — 설계 의도 그대로)
const PEER_RING_MIN = 1.30;   // 동급 셀이 가져야 할 광채 반경(--ringmax) 하한. 아래 등급은 0 이어야 한다

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.openSummonResult, null, { timeout: 20000 });
    await page.evaluate(SEED);

    const fails = [], rows = [];
    for (const wide of [true, false]) {
        const n = wide ? 'wide' : 'small';
        // ⚠️ **판마다 페이지를 새로 연다.** `closeSummonResult()` 뒤에 바로 다시 열었더니 앞 판의
        //    그리드가 DOM 에 남아 같은 셀렉터에 걸렸다(두 번째 판에서 셀이 6개가 아니라 12개로
        //    잡혔다 — 최고 등급 셀 2개가 4개가 되고 표식 수가 안 맞은 원인이 이것이다).
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && UI.openSummonResult, null, { timeout: 20000 });
        await page.evaluate(SEED);
        const made = await page.evaluate(MAKE(wide));
        if (made !== 'ok') { fails.push(`판 ${n} 생성 실패: ${made}`); continue; }
        // 스킵해도 `.done` 은 finishSummonResult 안에서 걸리고 주역 팝이 520ms 남는다 —
        // **애니메이션이 끝난 뒤** 재야 한다(등장 중에 재면 팝 스케일이 섞여 주역이 더 작게 나온다:
        // 첫 판에서 주역 54.4px < 동급 83.5px 라는 말이 안 되는 값이 그래서 나왔다).
        await page.waitForFunction(() => {
            const m = document.querySelector('#summon-result-modal');
            return m && m.classList.contains('done');
        }, null, { timeout: 15000 });
        await page.waitForTimeout(1500);          // 주역 팝(.52s) + 포커스 풀(.68s) 종료까지
        const r = await page.evaluate(READ);
        if (process.env.SR_DEBUG) console.log(n, JSON.stringify(r.cells.map(c => [c.tier, c.heroic ? 'H' : c.peer ? 'P' : '.', c.w, c.scale])));
        const top = Math.max(...r.cells.map(c => c.tier));
        const tops = r.cells.filter(c => c.tier === top);
        const below = r.cells.filter(c => c.tier === top - 1);
        const hero = tops.find(c => c.heroic);
        const peers = tops.filter(c => !c.heroic);
        if (!hero || !peers.length || !below.length) {
            fails.push(`판 n=${n}: 필요한 셀이 안 만들어졌다(최고 ${tops.length}개·주역 ${hero ? 1 : 0}·아래등급 ${below.length}개)`);
            continue;
        }
        const peerW = Math.min(...peers.map(c => c.w));
        // ⚠️ **아래 등급 대표값은 최댓값이 아니라 중앙값이다.** 셀 폭이 이름 길이에 딸려 가서
        //    herorow 판에서는 같은 행 안에서도 셀 기본폭이 47.5~54.4px 로 갈린다 — 최댓값을 쓰면
        //    '가장 이름이 긴 아래 등급 셀'과 '가장 이름이 짧은 동급 셀'을 비교하게 된다.
        const bw = below.map(c => c.w).sort((a, b) => a - b);
        const belowW = bw[bw.length >> 1];
        const heroPeer = hero.w / Math.max(0.01, peerW);
        const peerStep = peerW / Math.max(0.01, belowW);
        // 레이아웃과 무관한 축 — 설계 의도(등급 계단 × 동급 배수)가 실제로 걸렸는지.
        const peerScale = Math.min(...peers.map(c => c.scale)) / Math.max(0.01, Math.max(...below.map(c => c.scale)));
        // ⚠️ 광채는 **비율로 못 잰다** — `--ringmax` 는 `.sr-cell.heroic` 에만 선언돼 있어
        //    아래 등급 셀은 값 자체가 없다(computed 0). 0 으로 나누는 자를 만들지 말고
        //    **구조**로 본다: 동급은 링을 가져야 하고(>0), 아래 등급은 없어야 한다(==0).
        const peerRing = Math.min(...peers.map(c => c.ringmax));
        const belowRing = Math.max(...below.map(c => c.ringmax));
        rows.push({ n, grid: r.gridCls, heroW: hero.w, peerW, belowW, heroPeer, peerStep, peerScale, peerRing, peers: peers.length, marked: peers.filter(c => c.peer).length });
        if (heroPeer > HERO_PEER_MAX) fails.push(`${n} 주역/동급 크기비 ${heroPeer.toFixed(2)} > ${HERO_PEER_MAX} (같은 등급이 두 크기로 읽힌다)`);
        if (peerStep < PEER_STEP_MIN) fails.push(`${n} 동급/아래등급 렌더폭비 ${peerStep.toFixed(2)} < ${PEER_STEP_MIN} (동급이 평범한 드랍으로 읽힌다)`);
        if (peerScale < PEER_SCALE_MIN) fails.push(`${n} 동급/아래등급 스케일비 ${peerScale.toFixed(3)} < ${PEER_SCALE_MIN} (--peersz 가 안 걸렸다)`);
        if (peerRing < PEER_RING_MIN) fails.push(`${n} 동급 광채반경 ${peerRing.toFixed(2)} < ${PEER_RING_MIN} (크기만 커진 '한 등급 큰 구슬')`);
        if (belowRing > 0) fails.push(`${n} 아래 등급 셀에도 광채반경 ${belowRing.toFixed(2)} — 최고 등급 표식이 아니게 된다`);
        if (peers.length !== peers.filter(c => c.peer).length) fails.push(`${n} 동급 ${peers.length}개 중 .peer 표식 ${peers.filter(c => c.peer).length}개 — 표식이 안 붙었다`);
    }
    await browser.close();

    console.log('판     그리드                       주역폭  동급폭  아래폭  주역/동급  동급/아래  스케일비  광채  동급수(표식)');
    for (const r of rows) {
        console.log(`${String(r.n).padEnd(5)} ${r.grid.padEnd(28)} ${r.heroW.toFixed(1).padStart(6)} ${r.peerW.toFixed(1).padStart(7)} ${r.belowW.toFixed(1).padStart(7)} ${r.heroPeer.toFixed(2).padStart(9)} ${r.peerStep.toFixed(2).padStart(10)} ${r.peerScale.toFixed(3).padStart(9)} ${r.peerRing.toFixed(2).padStart(5)}  ${r.peers}(${r.marked})`);
    }
    console.log(`\n게이트: 주역/동급 ≤ ${HERO_PEER_MAX} · 동급/아래 렌더폭 ≥ ${PEER_STEP_MIN} · 스케일비 ≥ ${PEER_SCALE_MIN} · 광채반경 ≥ ${PEER_RING_MIN}`);
    console.log('콘솔 에러 ' + errors.length);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
    if (errors.length) fails.push('콘솔 에러 ' + errors.length);
    console.log(fails.length ? '\nFAIL — ' + fails.length + '건\n  ' + fails.join('\n  ') : '\nPASS — ' + rows.length + '판');
    process.exit(fails.length ? 1 : 0);
})();
