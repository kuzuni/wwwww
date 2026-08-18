// 플레이어 정보 팝업 '장착 로드아웃' 한 줄의 오브 크기 검증 (QA 11차).
// 증상: 스킬 오브 3칸이 6×6px로 찌부러져 그림이 안 보이고 `Lv.3` 글자만 남아,
//       한 줄이 "Lv Lv Lv.3 🐌 🦔 🪷"처럼 보였다. 펫·탈것 오브만 정상 크기였다.
// 원인: .sk-orb가 width:100%(부모 .sk-cell 기준)인데 로드아웃 줄에서는 .sk-cell이
//       폭이 정해지지 않은 flex 아이템이라 폭이 내용물에서 나온다 — 스킬은 안이 <img>라 순환.
// 판정: ① 스킬 오브 지름이 펫/탈것 오브와 ±10% 이내 ② 렌더 지름 18px 이상(버그 시 6px)
//       ③ 줄이 한 줄에 들어간다(같은 y) ④ 콘솔 에러 0건
// ※ 이 도구는 **원본과의 비율**을 보지 않는다 — 같은 줄 안에서의 상대 크기와 렌더 절대 지름만 본다.
//   원본 대비 비율은 `probe-pinfo-px.js`(자 = 흰 카드 폭) 담당이다. 둘을 같은 수치로 비교하지 말 것.
// 사용: node probe-pinfo-loadout.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    for (const [w, h] of [[430, 932], [360, 800], [499, 892]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${w}x${h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        // 🩺 2026-08-18: **애니메이션을 껐다.** 예전엔 카드 열림 애니(`cardpop` scale .7) 한복판에서 재고
        //    "0.7배로 축소돼 나오니 뷰포트 대비 %로는 판정하지 않는다"고 주석으로 감수하고 있었는데,
        //    그러면 **지름 하한 18px 이 실제로는 25.7px 을 요구하는 셈**이 된다. 실제로 오브를 원본
        //    비율(앱 폭의 6.24%)로 맞추자 360x800 에서 22.5px → 재는 값 15.7px 이라 거짓 FAIL 이 났다.
        //    이 저장소의 다른 프로브는 전부 애니를 무효화하고 재는 게 규약이다 — 여기도 맞춘다.
        //    하한 18px 은 그대로 둔다(버그 상태는 6px 이라 여전히 넉넉히 걸린다).
        await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

        const r = await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            // 스킬 3개 장착 + 펫 출전 + 탈것 장착 = 로드아웃 줄이 꽉 찬 상태
            S.equippedSkills = Object.keys(Skills.DEFS || Skills.defs || {}).slice(0, 3);
            if (!S.equippedSkills.length) S.equippedSkills = (S.skills ? Object.keys(S.skills) : []).slice(0, 3);
            S.pets = [{ name: 'slime', rarity: 'common', level: 3, xp: 0 }];
            S.activePets = [0];
            S.mounts = { horse: { level: 2, xp: 0 } }; S.activeMount = 'horse';
            UI.openPlayerInfo();
            const row = document.querySelector('.pinfo-loadout-row');
            if (!row) return { err: '로드아웃 줄이 없다' };
            const cells = [...row.querySelectorAll('.sk-cell')].map((c, i) => {
                const orb = c.querySelector('.sk-orb');
                const b = (orb || c).getBoundingClientRect();
                return { i, w: b.width, h: b.height, y: b.top, kind: c.getAttribute('onclick').split('(')[0] };
            });
            return { cells, appH: document.documentElement.clientHeight, skillCount: S.equippedSkills.length };
        });

        if (r.err) { fails.push(`${w}x${h}: ${r.err}`); console.log(`FAIL ${w}x${h}: ${r.err}`); await page.close(); continue; }
        const skills = r.cells.filter(c => /SkillDetail/.test(c.kind));
        const others = r.cells.filter(c => !/SkillDetail/.test(c.kind));
        const avg = a => a.reduce((s, c) => s + c.w, 0) / (a.length || 1);
        const sAvg = avg(skills), oAvg = avg(others);
        const diffPct = oAvg ? 100 * Math.abs(sAvg - oAvg) / oAvg : 0;
        const minPx = Math.min(...r.cells.map(c => c.w));
        const sameRow = new Set(r.cells.map(c => Math.round(c.y))).size === 1;

        ok(skills.length >= 1, `${w}x${h}: 스킬 오브가 렌더되지 않았다`);
        ok(diffPct <= 10, `${w}x${h}: 스킬 오브 ${sAvg.toFixed(1)}px vs 펫·탈것 ${oAvg.toFixed(1)}px — ${diffPct.toFixed(0)}% 차이`);
        ok(minPx >= 18, `${w}x${h}: 가장 작은 오브 지름이 ${minPx.toFixed(1)}px뿐 (18px 이상이어야 한다 — 버그 상태는 6px)`);
        ok(sameRow, `${w}x${h}: 로드아웃이 한 줄에 안 들어간다`);
        console.log(`${diffPct <= 10 && minPx >= 18 && sameRow ? 'PASS' : 'FAIL'} ${w}x${h} — 스킬 ${sAvg.toFixed(1)}px · 펫/탈것 ${oAvg.toFixed(1)}px (차이 ${diffPct.toFixed(0)}%) · 최소 지름 ${minPx.toFixed(1)}px · 한 줄 ${sameRow}`);
        await page.close();
    }
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 로드아웃 오브 3종이 같은 지름으로 한 줄에 놓인다');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
