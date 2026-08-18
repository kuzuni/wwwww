// 공통 수령 연출(reward-claim-fx) 검증 — "수령받을 때마다 이펙트가 있어야 함" (사용자 지시 2026-08-18)
//  ⑴ 퀘스트 수령: 아이콘(.rw-fly)이 버튼 자리에서 터져 나오고 '+획득량'(.rw-amt)이 뜬다
//  ⑵ 아이콘은 해당 재화의 상단 바 pill(코인/젬) 또는 상단 바로 **실제로 이동**해 끝난다
//     (스냅샷이 아니라 시작/끝 좌표 실측 — 안 움직이면 '빨려 들어간다'가 아니다)
//  ⑶ 도착 시 pill이 박동(.rw-pulse)한다
//  ⑷ 진행 패스처럼 재화가 여러 개면 .rw-amt 가 재화 수만큼 뜬다
//  ⑸ 던전 소탕도 같은 연출을 탄다 (팝업 없는 수령 경로)
//  ⑹ 연출 레이어(z-70)가 팝업 위에 있고, 콘솔 에러 0건
// 사용: node probe-reward-fx.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 9; S.bestStage = 9;
    });

    // ---- ⑴⑵⑶ 퀘스트 수령: 연출 타임라인을 페이지 안에서 25ms 간격 샘플링 ----
    const q = await page.evaluate(async () => {
        Quests.ensure();
        S.quests[0].prog = S.quests[0].need;         // 첫 퀘스트를 수령 가능으로
        const rw = S.quests[0].rw;
        UI.openQuests();
        await new Promise(r => setTimeout(r, 120));
        const btn = document.querySelector('.qst-row.done .btn.primary') || document.querySelector('.qst-row .btn');
        const bb = btn.getBoundingClientRect();
        const pill = document.querySelector(rw.cur === 'gems' ? '.currency-pills .pill.gem' : '.currency-pills .pill.coin');
        const target = (rw.cur === 'coins' || rw.cur === 'gems') && pill ? pill : UI.els.topbar;
        const tb = target.getBoundingClientRect();
        const tl = [];
        const rec = setInterval(() => {
            const fly = [...document.querySelectorAll('.rw-fly')];
            tl.push({
                t: Math.round(performance.now()),
                n: fly.length,
                // 좌표는 안쪽 아이콘에서 잰다 — 바깥(.rw-fly)은 X만, 안쪽이 Y를 맡는 축 분리 구조라
                // 바깥 rect로는 세로 이동이 안 보인다
                pos: fly.map(el => { const r = (el.firstElementChild || el).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }),
                amts: [...document.querySelectorAll('.rw-amt')].map(el => el.textContent.trim()),
                glow: !!document.querySelector('.rw-glow'),
                pulse: !!document.querySelector('.rw-pulse'),
            });
        }, 25);
        btn.click();
        await new Promise(r => setTimeout(r, 1300));
        clearInterval(rec);
        return {
            rw, tl,
            src: { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 },
            dst: { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 },
            layerZ: getComputedStyle(document.getElementById('reward-burst') || document.body).zIndex,
        };
    });
    const withFly = q.tl.filter(r => r.n > 0);
    ok(withFly.length >= 4, `⑴ 수령 아이콘(.rw-fly)이 관측되지 않았다 (프레임 ${withFly.length}개)`);
    ok(q.tl.some(r => r.glow), '⑴ 시작점 글로우(.rw-glow)가 없다');
    const amtSeen = q.tl.flatMap(r => r.amts).find(t => t.includes('+'));
    ok(!!amtSeen, '⑴ +획득량 라벨(.rw-amt)이 없다');
    if (withFly.length >= 2) {
        // 첫 관측 프레임의 아이콘은 수령 버튼 근처, 마지막 관측 프레임의 아이콘은 도착점 근처여야 한다
        const first = withFly[0].pos[0], lastFrame = withFly[withFly.length - 1];
        const last = lastFrame.pos[0];
        const d = (p, c) => Math.hypot(p.x - c.x, p.y - c.y);
        ok(d(first, q.src) < 110, `⑵ 아이콘이 수령 버튼 자리에서 시작하지 않았다 (거리 ${d(first, q.src).toFixed(0)}px)`);
        ok(d(last, q.dst) < 80, `⑵ 아이콘이 상단 바/pill로 이동해 끝나지 않았다 (도착 거리 ${d(last, q.dst).toFixed(0)}px)`);
        ok(d(first, q.dst) > d(last, q.dst) + 40, `⑵ 아이콘이 도착점 쪽으로 이동하지 않았다 (${d(first, q.dst).toFixed(0)} → ${d(last, q.dst).toFixed(0)}px)`);
    }
    ok(q.tl.some(r => r.pulse), '⑶ 도착 pill/상단 바 박동(.rw-pulse)이 없다');
    ok(q.layerZ === '70', `⑹ 연출 레이어 z-index가 70이 아니다 (${q.layerZ})`);
    console.log(`⑴⑵⑶ 퀘스트 수령(${q.rw.cur} +${q.rw.amt}) — 아이콘 ${Math.max(...q.tl.map(r => r.n))}개, ` +
        `라벨 "${amtSeen}", 시작→도착 이동·pill 박동 확인`);

    // ---- ⑷ 진행 패스: 재화 2종이면 .rw-amt 2개 ----
    const p = await page.evaluate(async () => {
        UI.closeQuests && UI.closeQuests();
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        Pass.ensure && Pass.ensure();
        S.passClaimed = {};
        const m = Pass.MILESTONES[0];                 // {coins, hammers} 2종
        UI.openPass();
        await new Promise(r => setTimeout(r, 120));
        const cell = document.querySelector('.pass-cell.claimable');
        if (!cell) return { err: 'claimable 패스 칸이 없다' };
        let maxAmts = 0;
        const rec = setInterval(() => { maxAmts = Math.max(maxAmts, document.querySelectorAll('.rw-amt').length); }, 25);
        cell.click();
        await new Promise(r => setTimeout(r, 1400));
        clearInterval(rec);
        return { curs: Object.keys(m.free).length, maxAmts };
    });
    if (p.err) ok(false, '⑷ ' + p.err);
    else ok(p.maxAmts === p.curs, `⑷ 패스 재화 ${p.curs}종인데 +획득량 라벨이 ${p.maxAmts}개다`);
    console.log(`⑷ 진행 패스 수령 — 재화 ${p.curs}종 = 라벨 ${p.maxAmts}개`);

    // ---- ⑸ 던전 소탕도 같은 연출 ----
    const sw = await page.evaluate(async () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        Dungeons.ensure();
        const id = Object.keys(S.dungeons.best)[0] || 'gold';
        S.dungeons.best[id] = 3; S.dungeons.keys[id] = 1;
        let seen = 0;
        const rec = setInterval(() => { seen = Math.max(seen, document.querySelectorAll('.rw-fly').length); }, 25);
        Dungeons.sweep(id);
        await new Promise(r => setTimeout(r, 1200));
        clearInterval(rec);
        return { seen };
    });
    ok(sw.seen > 0, '⑸ 던전 소탕에서 수령 연출이 안 떴다');
    console.log(`⑸ 던전 소탕 — 아이콘 ${sw.seen}개 관측`);

    ok(errs.length === 0, `⑹ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
