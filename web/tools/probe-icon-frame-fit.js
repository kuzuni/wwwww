// 아이콘이 **자기 프레임 안에 제대로 앉아 있는가** 실측 — `icon-gen` 재채점 지적 ② '작은 프레임 정합'.
//
// 지적 원문(TODO icon-gen 1차 재채점, 2026-08-17): "`<small>`·`.summon-cost` 안 아이콘이 라인박스
// 대비 **129~143%** 로 버튼 패딩을 침범(상점 pill·부화 버튼은 조정 완료). **프레임 높이의 ≤78% 캡** +
// 원형/세로형 광학 크기 보정."
//
// ⚠️ 이 도구는 **재기만 한다**(판정은 하되 화면을 안 고친다). 지적이 아직 사실인지부터 확인하는
//    용도다 — 이 저장소에서 '낡은 지적을 좇아 멀쩡한 값을 건드려 원본에서 멀어진' 사고가 반복됐다
//    (TODO '비평가 채점 함정' 머리말).
//
// 재는 법: 화면마다 `.ico`(IconGen 이 붙이는 공용 클래스)를 전부 걷어, **그 아이콘을 담은 인라인
//   맥락의 라인박스 높이**와 아이콘 상자 높이를 나란히 잰다. 라인박스는 부모의 `getClientRects()`
//   중 아이콘 중심을 품는 줄을 쓴다 — 부모 전체 높이를 쓰면 여러 줄짜리 버튼에서 분모가 부풀어
//   침범이 통째로 숨는다(그게 이 지적이 오래 안 닫힌 이유일 수 있다).
//
// 사용: node probe-icon-frame-fit.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CAP = 78;    // 지적이 제시한 캡(라인박스 높이 대비 %)

// 화면별 진입 — 이름 / 여는 코드
const SCREENS = [
    { key: 'main', open: () => { UI.switchTab(null); } },
    { key: 'skills', open: () => { UI.onTabClick('summon'); UI.switchSummonSub('skills'); } },
    { key: 'pets', open: () => { UI.onTabClick('summon'); UI.switchSummonSub('pets'); } },
    { key: 'mounts', open: () => { UI.switchTab(null); UI.openMounts(); } },   // ⚠️ 탈것은 서브탭이 아니라 모달이다(채점 메모의 함정)
    { key: 'shop', open: () => { UI.onTabClick('shop'); } },
    { key: 'quests', open: () => { UI.onTabClick('quest'); } },
    { key: 'dungeon', open: () => { UI.onTabClick('dungeon'); } },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 120)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 120)); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBootDone(page, { timeout: 180000 });
    await page.evaluate(() => {
        // 재화를 채워 잠긴 화면·비활성 버튼이 아니라 실제 렌더를 잰다
        S.gems = 999999; S.coins = 1e9; S.hammers = 99999; S.tickets = 9999;
        S.eggCurrency = 9999; S.winders = 9999; S.potions = 9999;
    });

    const rows = [];
    for (const sc of SCREENS) {
        try {
            await page.evaluate(`(${sc.open.toString()})()`);
        } catch (e) { rows.push({ screen: sc.key, err: String(e).slice(0, 80) }); continue; }
        await page.waitForTimeout(500);
        const got = await page.evaluate((cap) => {
            const out = [];
            for (const el of document.querySelectorAll('.ico')) {
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2) continue;               // 안 보이는 것은 뺀다
                const p = el.parentElement;
                if (!p) continue;
                // 아이콘 중심을 품는 **그 줄**의 높이 (부모 전체 높이가 아니다)
                const cy = r.top + r.height / 2;
                let line = null;
                for (const q of p.getClientRects()) { if (cy >= q.top - 1 && cy <= q.bottom + 1) { line = q; break; } }
                if (!line) line = p.getBoundingClientRect();
                if (line.height < 2) continue;
                // 🔑 **두 맥락을 갈라야 한다** — 안 가르면 이 지적을 못 닫는다.
                //   ⓐ 글자와 **같은 줄에 섞인** 아이콘(`<small>`·`.summon-cost`·보상 pill) — 지적의 대상.
                //      줄 높이를 넘으면 버튼 패딩을 밀어낸다. 캡 78%.
                //   ⓑ **아이콘만 든 사각 프레임**(장비 셀·스킬 오브 등) — 여기는 오히려 지시 ⑤ 가
                //      "프레임의 85~95% 로 꽉 채우라"고 요구한 자리다. 같은 캡을 씌우면 **지시와 정반대로**
                //      멀쩡한 아이콘을 줄이게 된다(실측: 88% 짜리 장비 셀 아이콘 200여 개가 통째로 걸렸다).
                //   판별 = 그 줄에 아이콘 말고 **눈에 보이는 글자**가 같이 있는가.
                let hasText = false;
                for (const n of p.childNodes) {
                    if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
                    if (n.nodeType === 1 && n !== el && n.textContent.trim()) {
                        const q = n.getBoundingClientRect();
                        if (q.height > 1 && cy >= q.top - 1 && cy <= q.bottom + 1) { hasText = true; break; }
                    }
                }
                // 🔑 **진짜 판정축은 '줄 높이'가 아니라 '프레임 밖으로 삐져나오는가'다.**
                //   글자 옆 아이콘이 글자의 라인박스보다 큰 것은 **정상 조판**이다(원본도 그렇다).
                //   지적문이 말한 결함은 "버튼 **패딩을 침범**" — 즉 pill/버튼의 테두리 상자를 넘어
                //   잘리거나 이웃을 미는 것이다. 그래서 **눈에 보이는 테를 가진 가장 가까운 조상**
                //   (배경이나 테두리를 그리는 요소)을 프레임으로 잡고, 아이콘이 그 안에 앉는지 잰다.
                //   ⚠️ 줄 높이 비율만 보고 고치면 멀쩡한 아이콘 수십 개를 줄이게 된다(이 저장소가
                //      반복해 밟은 '낡은 지적 좇기' 함정).
                let frame = null, fr = null;
                for (let a = p; a && a !== document.body; a = a.parentElement) {
                    const cs = getComputedStyle(a);
                    const painted = (cs.backgroundImage && cs.backgroundImage !== 'none')
                        || (cs.backgroundColor && !/rgba?\([^)]*,\s*0\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'transparent')
                        || (parseFloat(cs.borderTopWidth) > 0);
                    if (!painted) continue;
                    const q = a.getBoundingClientRect();
                    if (q.height < 2 || q.width < 2) continue;
                    frame = a; fr = q; break;
                }
                const over = fr ? Math.max(fr.top - r.top, r.bottom - fr.bottom, fr.left - r.left, r.right - fr.right) : null;
                const cls = [...el.classList].filter(c => c !== 'ico').join('.') || '(ico)';
                out.push({
                    cls,
                    inline: hasText,
                    tag: p.tagName.toLowerCase(),
                    pcls: (p.className || '').toString().slice(0, 34),
                    txt: (p.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18),
                    ih: +r.height.toFixed(2),
                    lh: +line.height.toFixed(2),
                    pct: +(r.height / line.height * 100).toFixed(1),
                    // 프레임 밖으로 나간 양(px). 음수 = 여유가 있다(정상), 양수 = 삐져나온다(결함).
                    fcls: frame ? (frame.className || frame.tagName).toString().slice(0, 30) : null,
                    fh: fr ? +fr.height.toFixed(2) : null,
                    spill: over === null ? null : +over.toFixed(2),
                });
            }
            return out;
        }, CAP);
        for (const g of got) rows.push(Object.assign({ screen: sc.key }, g));
    }

    await browser.close();

    const live = rows.filter(r => !r.err);
    const errRows = rows.filter(r => r.err);
    const inline = live.filter(r => r.inline);        // 글자와 같은 줄 — 지적의 대상
    const framed = live.filter(r => !r.inline);       // 아이콘만 든 프레임 — 지시 ⑤ 소관(여기서 판정 안 한다)
    // **판정 = 프레임을 삐져나오는가**(spill > 0.5px). 줄 높이 비율은 참고 수치로만 찍는다.
    const SPILL_TOL = 0.5;
    const spilling = inline.filter(r => r.spill !== null && r.spill > SPILL_TOL).sort((a, b) => b.spill - a.spill);
    const over = inline.filter(r => r.pct > CAP).sort((a, b) => b.pct - a.pct);

    console.log(`잰 아이콘 ${live.length}개 / ${SCREENS.length}화면`);
    console.log(`  · 글자와 같은 줄 ${inline.length}개 ← **프레임 이탈**로 판정(${SPILL_TOL}px 허용)`);
    console.log(`  · 아이콘 전용 프레임 ${framed.length}개 ← 지시 ⑤(85~95% 꽉 채우기) 소관이라 여기선 참고만`);
    for (const e of errRows) console.log(`  ⚠️ ${e.screen} 진입 실패 — ${e.err}`);

    // 중복 자리(같은 화면·같은 클래스·같은 부모)는 한 줄로 접는다
    const fold = (list) => {
        const seen = new Set(), out = [];
        for (const r of list) {
            const k = `${r.screen}|${r.cls}|${r.pcls}`;
            if (seen.has(k)) continue; seen.add(k); out.push(r);
        }
        return out;
    };
    if (spilling.length) {
        const f = fold(spilling);
        console.log(`\n🚨 프레임을 삐져나온 아이콘 ${spilling.length}개 (중복 접어 ${f.length}자리, 많이 나간 것부터):`);
        for (const r of f) {
            console.log(`  +${String(r.spill).padStart(5)}px  ${r.screen.padEnd(8)} ${r.cls.padEnd(22)} 프레임 <${r.fcls}> ${r.fh}px  아이콘 ${r.ih}px  "${r.txt}"`);
        }
    }
    if (over.length) {
        const f = fold(over);
        const spillSet = new Set(spilling.map(r => `${r.screen}|${r.cls}|${r.pcls}`));
        const benign = f.filter(r => !spillSet.has(`${r.screen}|${r.cls}|${r.pcls}`));
        console.log(`\n(참고) 글자 라인박스보다 큰 아이콘 ${over.length}개 — 그중 ${benign.length}자리는 **프레임 안에 앉아 있다**.`);
        console.log(`      글자 옆 아이콘이 글자 줄보다 큰 것은 정상 조판이다 — 이 수치만 보고 줄이지 말 것.`);
        for (const r of benign.slice(0, 10)) {
            console.log(`  ${String(r.pct).padStart(6)}%  ${r.screen.padEnd(8)} ${r.cls.padEnd(22)} 프레임 <${r.fcls}> 여유 ${(-r.spill).toFixed(2)}px  "${r.txt}"`);
        }
    }
    if (framed.length) {
        const hi = fold(framed.slice().sort((a, b) => b.pct - a.pct)).slice(0, 6);
        console.log(`\n(참고) 아이콘 전용 프레임 상위 — 85~95% 가 목표라 높은 게 정상이다:`);
        for (const r of hi) console.log(`  ${String(r.pct).padStart(6)}%  ${r.screen.padEnd(8)} ${r.cls}`);
    }
    const worstPct = inline.length ? Math.max(...inline.map(r => r.pct)) : 0;
    const worstSpill = spilling.length ? spilling[0].spill : 0;
    console.log(`\n프레임 이탈 ${spilling.length}개(최악 +${worstSpill}px) · 라인박스 초과 ${over.length}개(최대 ${worstPct.toFixed(1)}%) · 콘솔 에러 ${errors.length}건`);
    for (const e of errors.slice(0, 5)) console.log('  ' + e);

    const bad = spilling.length > 0 || errors.length > 0 || errRows.length > 0;
    console.log(bad ? `\n❌ FAIL — 아이콘이 자기 프레임 밖으로 나간다` : `\n✅ PASS — 글자 줄 아이콘이 전부 자기 프레임 안에 앉는다`);
    process.exit(bad ? 1 : 0);
})();
