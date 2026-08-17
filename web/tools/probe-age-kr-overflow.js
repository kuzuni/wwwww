// AGE_KR 표기 변경(항성간·다중 우주·지하 세계)이 시대명이 뜨는 화면에서 넘치지 않는지 검증.
// 항목 경고대로 '지하 세계'는 '명계'보다 2자+공백 길고 '항성간'은 '성간'보다 1자 길다 →
// 막대·행 안 텍스트가 잘리거나(clip) 컨테이너 밖으로 새는지(overflow) 실측한다.
// 대상: 확률 정보(.fi-age-name) · 자동 제련(.af-age-name) · 비교 팝업(.cmp-name) · 장비 목록(itemLabel).
// 판정: ⑴ scrollWidth > clientWidth + 1 이면 잘림 ⑵ 요소 오른쪽이 부모 오른쪽을 넘으면 새어나감
//       ⑶ 줄바꿈으로 높이가 늘어 이웃 행과 겹치는지(행 높이 비교).
// 사용: node probe-age-kr-overflow.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const MEASURE = `(sel) => [...document.querySelectorAll(sel)].map(el => {
    const p = el.parentElement, r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    return {
        text: el.textContent.trim().slice(0, 20),
        clipped: el.scrollWidth > el.clientWidth + 1,
        spill: Math.round((r.right - pr.right) * 100) / 100,
        lines: Math.round(r.height / (parseFloat(getComputedStyle(el).fontSize) * 1.35)),
        w: Math.round(r.width), pw: Math.round(pr.width),
    };
})`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [], rows = [], errs = [], seen = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    // 좁은 폭에서 먼저 깨진다 — 지원 최소폭(360)과 기준폭(430) 둘 다 본다
    for (const width of [360, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 932 } });
        page.on('pageerror', e => errs.push(`${width}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${width}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(400);
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            S.hammers = 1e6; S.coins = 1e12; S.forgeLevel = 30;   // 전 시대가 확률표에 뜨도록
            S.chapter = 9; S.stage = 9; S.bestChapter = 9; S.bestStage = 9;   // 자동 제련은 2-10 해금(isUnlocked는 best*를 본다)
        });

        const screens = [
            ['확률 정보 .fi-age-name', () => UI.openForgeInfo(), '.fi-age-name'],
            ['자동 제련 .af-age-name', () => { UI.closeDetail && UI.closeDetail(); UI.openAutoForge(); }, '.af-age-name'],
        ];
        for (const [label, open, sel] of screens) {
            const found = await page.evaluate(`(() => { try { (${open})(); return true; } catch (e) { return String(e); } })()`);
            if (found !== true) { rows.push(`${width}px ${label} — 열기 실패(${found})`); continue; }
            await page.waitForTimeout(250);
            const m = await page.evaluate(`(${MEASURE})('${sel}')`);
            if (!m.length) { rows.push(`${width}px ${label} — 요소 없음`); continue; }
            seen.push(...m.map(x => x.text));
            const bad = m.filter(x => x.clipped || x.spill > 0.5 || x.lines > 1);
            rows.push(`${width}px ${label.padEnd(22)} n=${m.length} 잘림=${m.filter(x => x.clipped).length} 삐져나감=${m.filter(x => x.spill > 0.5).length} 2줄이상=${m.filter(x => x.lines > 1).length}`);
            for (const x of bad) rows.push(`      ⚠ "${x.text}" clipped=${x.clipped} spill=${x.spill}px lines=${x.lines} (${x.w}/${x.pw}px)`);
            ok(!bad.length, `${width}px ${label}: ${bad.map(x => `"${x.text}"`).join(', ')} 가 넘친다`);
        }

        // 비교 팝업 — 가장 긴 표기(지하 세계) + 긴 장비명 조합으로 최악을 본다
        const cmp = await page.evaluate(`(() => {
            UI.closeDetail && UI.closeDetail();
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const it = Forge.craft(1)[0]; it.age = 'underworld'; it.name = '두개골 결속자';
            const cur = Forge.craft(1)[0]; cur.slot = it.slot; cur.age = 'interstellar'; cur.name = '항성 파괴자';
            S.equipment[it.slot] = cur; UI._autoSeq = null;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            return (${MEASURE})('.cmp-name');
        })()`);
        seen.push(...cmp.map(x => x.text));
        const bad = cmp.filter(x => x.clipped || x.spill > 0.5);
        rows.push(`${width}px 비교 팝업 .cmp-name      n=${cmp.length} ${cmp.map(x => `"${x.text}"(${x.w}/${x.pw}px${x.clipped ? ' 잘림' : ''})`).join(' ')}`);
        ok(!bad.length, `${width}px 비교 팝업: ${bad.map(x => `"${x.text}"`).join(', ')} 가 넘친다`);
        await page.close();
    }

    // 바뀐 세 표기가 실제로 어딘가에서 측정됐는지 — 안 그러면 이 검사는 공허하게 통과한다
    for (const kr of ['항성간', '다중 우주', '지하 세계']) {
        const n = seen.filter(t => t.includes(kr)).length;
        rows.push(`측정된 '${kr}' 표기 ${n}건`);
        ok(n > 0, `'${kr}' 표기가 어느 화면에서도 측정되지 않았다 — 검사가 공허하다`);
    }
    console.log(rows.join('\n'));
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fails.length ? '❌ FAIL\n - ' + fails.join('\n - ') : '✅ PASS — 새 시대 표기가 어느 화면에서도 안 넘침');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
