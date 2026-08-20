// 소환 결과 팝업의 **라벨·배지·z 사다리** 실측 — 9차 비평가 지적 ⑴(z 관통)·B ⑵(등급 칩 크기 불일치) 회귀 감시.
// 사용: node probe-sr-labels.js
//
// 왜 이 프로브가 필요한가:
//  ⒜ B ⑵ "등급 칩 크기가 셀마다 다르다"는 **눈으로는 잘 안 보이는 결함**이었다(중복 칩이 붙은
//     셀만 74%로 줄어든 것). 눈대중으로 고치면 다음 세션이 같은 자리를 다시 판다 — 칩의 실제
//     font-size·상자 높이를 셀마다 재서 **하나라도 다르면 FAIL**로 못 박는다.
//  ⒝ 지적 ⑴ "소환진·충격파가 이름표 위를 관통한다"의 원인은 층별 z가 그때그때 붙은 것이었다.
//     스택 순서를 **수치로** 재서(같은 스택 컨텍스트의 z 사다리) 사다리가 깨지면 FAIL.
//  ⒞ 적립 환산 칩을 구체 좌하단 배지로 내렸으므로, 우하단 ×N 배지와 **겹치지 않는지**를
//     상자 교차로 재야 한다(좁은 mid 셀에서 실제로 위험한 지점).
//
// ⚠️ 렌더 없이 DOM/기하만 재는 프로브다(스크린샷 없음) — swiftshader에서 15~30초씩 걸리는
//    캡처를 피해 회차를 빠르게 돌릴 수 있다. 픽셀 쪽 검증은 probe-sr-tier-tell.js 가 맡는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;

// 문서화된 z 사다리 — css/style.css '소환 결과 팝업의 고정 z 사다리' 주석과 같은 표.
// 값이 아니라 **순서**를 검사한다(값을 옮겨도 순서만 맞으면 통과).
const LADDER = [
    ['.sr-rays', 0], ['.sr-halo', 0],
    ['.sr-motes', 1], ['.sr-idle', 1],
    ['.sr-floor', 10],
    ['.sr-canopy', 20],
    ['.sr-flash', 25],
    ['.sr-tierbreaks', 27],
    ['.sr-shock', 30],
    ['.sr-dust', 35],
    ['.sr-grid', 40],
    ['.sr-near', 42],
    ['.sr-head', 45], ['.sr-foot', 45],
    ['.sr-charge', 60], ['.sr-streaks', 60],
];

// 라벨이 살아 있는 판 — x1(one) / x5(기본) / x75(mid, 셀 11개↑에서 묶임 = 중복 배지가 붙는 판)
// ⚠️ `warm`: **첫 소환은 전부 신규**라 적립 배지(`extra`)가 하나도 안 붙는다 — 그대로 재면
//    'mid 셀에서 두 배지가 겹치는가'라는 이 프로브의 핵심 케이스가 **조용히 0건**으로 빠진다
//    (앞 세션이 적 겹침 계측기에서 똑같이 당한 '말없이 새는 커버리지'다). 버리는 소환을 한 번
//    돌려 로스터를 채운 뒤 측정한다. 아래 판정에서 `mid + 적립 배지` 조합을 실제로 셌는지 검사한다.
const CASES = [
    ['skill-x1', `S.summonMult = {skill:1}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`],
    ['skill-x5', `S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`],
    ['skill-x75', `S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`],
    ['mount-x75', `S.summonMult = {mount:75}; UI.switchTab('summon'); UI.switchSummonSub('mounts'); UI.onSummonMount();`, true],
    ['pet-x75', `S.summonMult = {pet:75}; UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.onSummonPetEgg();`, true],
];

const VIEWPORTS = [[412, 892], [360, 640]];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [];
    const errors = [];

    for (const [W, H] of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: W, height: H } });
        page.on('pageerror', e => errors.push(`${W}x${H} ${e}`));
        page.on('console', e => { if (e.type() === 'error') errors.push(`${W}x${H} console ${e.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined', null, { timeout: 20000 });
        await page.evaluate(SEED);
        await page.evaluate(() => { Scene3D.update = function () { }; });  // 3D 루프 정지 — 기하 측정에 불필요
        await page.waitForTimeout(400);

        let midDupSeen = 0;
        for (const [name, src, warm] of CASES) {
            if (warm) {   // 버리는 소환 1회 — 로스터를 채워 '중복 → 적립 배지' 경로를 실제로 태운다
                await page.evaluate(src);
                await page.evaluate(() => { UI.onSummonResultTap(); UI.closeSummonResult(); });
                await page.waitForTimeout(160);
            }
            await page.evaluate(src);
            // 연출을 끝까지 돌리지 않고 즉시 전 셀 표시 상태로 만든다(라벨 기하는 .done에서 잰다)
            await page.evaluate(() => UI.onSummonResultTap());
            await page.waitForTimeout(260);

            const r = await page.evaluate((ladder) => {
                const m = document.getElementById('summon-result-modal');
                const box = el => { const b = el.getBoundingClientRect(); return { x: +b.left.toFixed(2), y: +b.top.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
                const grid = m.querySelector('.sr-body > .sr-grid');
                const cells = [...m.querySelectorAll('.sr-body > .sr-grid > .sr-cell')];

                // ⒝ z 사다리 — 존재하는 층만 골라 순서를 본다
                const zs = ladder.map(([sel, want]) => {
                    const el = m.querySelector(sel);
                    if (!el) return null;
                    const z = getComputedStyle(el).zIndex;
                    return { sel, want, z: z === 'auto' ? null : parseInt(z, 10) };
                }).filter(Boolean);

                // ⒜ 등급 칩 — 셀마다 font-size / 상자 높이를 잰다
                const chips = cells.map((c, i) => {
                    const rk = c.querySelector('.sr-sub .sr-rk');
                    if (!rk) return { i, missing: true };
                    const cs = getComputedStyle(rk);
                    // ⚠️ 주역(.heroic) 셀은 **의도적으로** 칩이 크다(단독 행 전용 크기) — 균일성 검사에서
                    //    갈라 놓지 않으면 멀쩡한 설계가 FAIL로 나온다(이번에 실제로 밟았다).
                    // ⚠️ 폭 기준도 셀 상자가 아니라 **구체 래퍼**다 — 주역 셀은 orbwrap이 셀보다 넓어
                    //    (mid 기준 6.2rem vs 3.9rem) 셀 상자로 재면 정상 배치가 '이탈'로 잡힌다.
                    const frame = c.querySelector('.sr-orbwrap') || c;
                    return {
                        i, fs: +parseFloat(cs.fontSize).toFixed(3), box: box(rk),
                        hasDup: !!c.querySelector('.sr-dup'),
                        heroic: c.classList.contains('heroic'),
                        overflow: +(box(rk).w - Math.max(box(c).w, box(frame).w)).toFixed(2),
                    };
                });

                // ⒞ 좌하단 적립 배지 vs 우하단 ×N 배지 — 상자 교차와 구체 밖 이탈
                const badges = cells.map((c, i) => {
                    const dup = c.querySelector('.sr-dup'), qty = c.querySelector('.sr-qty');
                    const ow = c.querySelector('.sr-orbwrap');
                    if (!dup && !qty) return null;
                    const db = dup && box(dup), qb = qty && box(qty), ob = ow && box(ow);
                    let inter = 0;
                    if (db && qb) {
                        const ix = Math.min(db.x + db.w, qb.x + qb.w) - Math.max(db.x, qb.x);
                        const iy = Math.min(db.y + db.h, qb.y + qb.h) - Math.max(db.y, qb.y);
                        inter = (ix > 0 && iy > 0) ? +(ix * iy).toFixed(1) : 0;
                    }
                    // 배지가 **구체 래퍼**를 벗어나면 시각 프레임 밖으로 삐져나온다.
                    // (셀 상자를 기준으로 쓰면 안 된다 — 주역 셀은 orbwrap이 셀보다 넓어서
                    //  정상 배치가 전부 '이탈'로 잡힌다. 실제로 이 프로브의 첫 판이 그렇게 틀렸다.)
                    const fb = ob || box(c);
                    const out = [db, qb].filter(Boolean).some(b => b.x < fb.x - .5 || b.x + b.w > fb.x + fb.w + .5);
                    return { i, inter, out, heroic: c.classList.contains('heroic'), dupW: db && db.w, orbW: ob && ob.w };
                }).filter(Boolean);

                // ⒟ 10차 잔여 ⑨ — ×N 배지가 **이름칩과 세로로 붙거나 칩 오른쪽 선을 넘는가**.
                //    B 실측: 배지 y=450~464 vs 칩 y=465~484 로 여유 **1px**, 배지 우측이 칩 우측선을 **7px 초과**.
                //    배지는 구체에 속한 표식이라 칩 위로 겹치거나 칩 밖으로 나가면 '떠 있는 라벨'이 된다.
                const qtyGap = cells.map((c, i) => {
                    const qty = c.querySelector('.sr-qty'), nm = c.querySelector('.sr-name');
                    if (!qty || !nm) return null;
                    const qb = box(qty), nb = box(nm);
                    return {
                        i,
                        gap: +(nb.y - (qb.y + qb.h)).toFixed(1),          // 배지 아래 ↔ 칩 위 (음수=겹침)
                        over: +((qb.x + qb.w) - (nb.x + nb.w)).toFixed(1), // 배지 우측이 칩 우측선을 넘은 양
                    };
                }).filter(Boolean);

                // ⒠ 10차 잔여 ⑨ — 그리드 좌우 여백 대칭. B: 좌 17px vs 우 6px(비대칭 11px).
                // ⚠️ **transform 이 실린 상자로 재면 안 된다.** `.sr-cell` 은 등급별 `--sz`(최대 1.26)로
                //    스케일되므로 `getBoundingClientRect` 로 재면 '등급이 높은 셀이 있는 쪽'이 항상 넓게
                //    나온다 — 그건 레이아웃 비대칭이 아니라 **의도된 등급 크기 사다리**다(첫 판에서 그걸
                //    비대칭으로 잡아 멀쩡한 여백을 고칠 뻔했다). 레이아웃만 보려면 offsetLeft/Width 다.
                const margins = cells.length ? (() => {
                    const l = Math.min(...cells.map(c => c.offsetLeft));
                    const r = Math.max(...cells.map(c => c.offsetLeft + c.offsetWidth));
                    return { left: +l.toFixed(1), right: +(grid.clientWidth - r).toFixed(1) };
                })() : null;

                // 폐기된 마크업이 남아 있지 않은지
                const stale = {
                    ex: m.querySelectorAll('.sr-ex').length,
                    two: m.querySelectorAll('.sr-sub.two').length,
                };

                // x1 좁은 이름판 — 배경이 투명하지 않고, 셀 폭을 다 쓰지 않는다
                let onePlate = null;
                if (grid.classList.contains('one')) {
                    const nm = cells[0] && cells[0].querySelector('.sr-name');
                    if (nm) {
                        const cs = getComputedStyle(nm);
                        onePlate = {
                            bg: cs.backgroundColor,
                            ratio: +(box(nm).w / box(cells[0]).w).toFixed(3),
                        };
                    }
                }
                return { cells: cells.length, size: grid.className, zs, chips, badges, stale, onePlate, qtyGap, margins };
            }, LADDER);

            const tag = `${W}x${H} ${name}`;
            // ⒜ 등급 칩 크기 균일성
            const miss = r.chips.filter(c => c.missing).length;
            if (miss) fails.push(`${tag}: 등급 칩이 없는 셀 ${miss}개`);
            // 균일성은 주역/일반을 갈라서 본다 — 각 그룹 안에서는 크기가 하나여야 한다
            const groups = [['일반', r.chips.filter(c => !c.missing && !c.heroic)],
                            ['주역', r.chips.filter(c => !c.missing && c.heroic)]];
            const sizes = [];
            for (const [gname, list] of groups) {
                if (!list.length) continue;
                const gs = [...new Set(list.map(c => c.fs))];
                sizes.push(`${gname} ${gs.join('/')}`);
                if (gs.length > 1) {
                    const withDup = [...new Set(list.filter(c => c.hasDup).map(c => c.fs))];
                    const noDup = [...new Set(list.filter(c => !c.hasDup).map(c => c.fs))];
                    fails.push(`${tag}: ${gname} 셀의 등급 칩 font-size가 셀마다 다르다 — ${gs.join(' / ')}px `
                        + `(적립 배지 있는 셀 ${withDup.join(',') || '없음'} vs 없는 셀 ${noDup.join(',') || '없음'})`);
                }
            }
            const over = r.chips.filter(c => !c.missing && c.overflow > 1);
            if (over.length) fails.push(`${tag}: 등급 칩이 셀 폭을 넘는 셀 ${over.length}개 (최대 +${Math.max(...over.map(c => c.overflow))}px)`);

            // ⒝ z 사다리 순서
            for (let i = 1; i < r.zs.length; i++) {
                const a = r.zs[i - 1], b = r.zs[i];
                if (a.z === null || b.z === null) { fails.push(`${tag}: ${a.z === null ? a.sel : b.sel} 의 z-index가 auto — 사다리에서 빠졌다`); continue; }
                if (a.want < b.want && !(a.z < b.z)) fails.push(`${tag}: z 사다리 역전 — ${a.sel}(${a.z}) 이 ${b.sel}(${b.z}) 보다 위/같음`);
                if (a.want === b.want && a.z !== b.z) fails.push(`${tag}: z 사다리 동층 불일치 — ${a.sel}(${a.z}) vs ${b.sel}(${b.z})`);
            }

            // ⒞ 배지 겹침·이탈
            const hit = r.badges.filter(b => b.inter > 0);
            if (hit.length) fails.push(`${tag}: 적립 배지와 ×N 배지가 겹치는 셀 ${hit.length}개 (최대 교차 ${Math.max(...hit.map(b => b.inter))}px²)`);
            // ⒟ ×N 배지 ↔ 이름칩 — 세로 여유 3px 미만이거나 칩 우측선을 넘으면 불합격
            const tight = r.qtyGap.filter(q => q.gap < 3);
            if (tight.length) fails.push(`${tag}: ×N 배지가 이름칩에 붙었다 — 셀 ${tight.length}개 (최소 여유 ${Math.min(...tight.map(q => q.gap))}px, 기준 3px)`);
            const overs = r.qtyGap.filter(q => q.over > 0.5);
            if (overs.length) fails.push(`${tag}: ×N 배지가 이름칩 우측선을 넘었다 — 셀 ${overs.length}개 (최대 ${Math.max(...overs.map(q => q.over))}px)`);
            // ⒠ 그리드 좌우 여백 대칭 — 4px 넘게 어긋나면 판이 한쪽으로 쏠려 보인다
            if (r.margins && Math.abs(r.margins.left - r.margins.right) > 4)
                fails.push(`${tag}: 좌우 여백 비대칭 ${Math.abs(+(r.margins.left - r.margins.right).toFixed(1))}px (좌 ${r.margins.left} / 우 ${r.margins.right})`);
            const outs = r.badges.filter(b => b.out);
            if (outs.length) fails.push(`${tag}: 배지가 셀 상자를 벗어난 셀 ${outs.length}개`);

            if (r.stale.ex) fails.push(`${tag}: 폐기된 .sr-ex 가 ${r.stale.ex}개 남아 있다`);
            if (r.stale.two) fails.push(`${tag}: 폐기된 .sr-sub.two 가 ${r.stale.two}개 남아 있다`);

            if (r.onePlate) {
                const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(r.onePlate.bg);
                if (transparent) fails.push(`${tag}: x1 이름판 배경이 투명하다(소환진 스트로크가 글자 사이로 비친다)`);
                if (r.onePlate.ratio > .92) fails.push(`${tag}: x1 이름판이 셀 폭의 ${(r.onePlate.ratio * 100).toFixed(1)}% — 풀폭 판(입력창처럼 보임)으로 되돌아갔다`);
            }

            const dupN = r.chips.filter(c => c.hasDup).length;
            if (/\bmid\b|\bdense\b/.test(r.size) && dupN) midDupSeen++;
            console.log(`  ${tag}: 셀 ${r.cells} · 칩 ${sizes.join(' | ')}px · 적립 배지 ${dupN}개`
                + (r.onePlate ? ` · x1 이름판 폭비 ${(r.onePlate.ratio * 100).toFixed(1)}%` : '')
                + ` · z ${r.zs.map(z => z.z).join('<')}`);

            await page.evaluate(() => UI.closeSummonResult());
            await page.waitForTimeout(120);
        }
        // 커버리지 게이트 — 묶인 그리드(mid/dense)에서 적립 배지가 붙은 판을 한 번도 못 봤다면
        // 두 배지 겹침 검사가 통째로 헛돈 것이다. 조용히 PASS 내지 말고 실패로 올린다.
        if (!midDupSeen) fails.push(`${W}x${H}: 커버리지 미달 — 묶인 그리드(mid/dense)에서 적립 배지가 붙은 판이 0건 (두 배지 겹침 검사가 실행되지 않았다)`);
        await page.close();
    }
    await browser.close();

    console.log('');
    if (errors.length) { console.log(`콘솔/페이지 에러 ${errors.length}건:`); errors.slice(0, 8).forEach(e => console.log('   ' + e)); }
    if (fails.length) {
        console.log(`FAIL ${fails.length}건`);
        fails.forEach(f => console.log('  ✗ ' + f));
        process.exit(1);
    }
    if (errors.length) process.exit(1);
    console.log(`PASS — 등급 칩 크기 균일 · z 사다리 정순 · 배지 비겹침 · x1 좁은 이름판 (뷰포트 ${VIEWPORTS.length}종 × 판 ${CASES.length}종)`);
})();
