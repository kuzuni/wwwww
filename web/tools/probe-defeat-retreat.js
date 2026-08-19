// 사망 시 1스테이지 후퇴 — 실게임(브라우저) 검증. 사용: node tools/probe-defeat-retreat.js
// 실제 index.html을 띄워 S/UI/Dungeons가 다 살아 있는 상태에서 onDefeat를 태우고
// 스테이지 라벨·최고 기록·던전 예외·스테이지 재시작까지 확인한다(종료코드 0=전체 통과).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(1200);

    const r = await p.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        // 렌더/전투 틱 정지 — 스크린샷 없이 로직만 본다(3D 루프가 돌면 프레임당 15~30초).
        Scene3D.update = () => {};
        Combat.tick = () => {};
        const label = () => UI.els.stageLabel.textContent;

        // ① 4-10 사망 → 4-9, 라벨도 즉시 따라온다
        S.chapter = 4; S.stage = 10; S.bestChapter = 4; S.bestStage = 10;
        Combat.onDefeat();
        ok(S.chapter === 4 && S.stage === 9, `4-10 사망 → ${S.chapter}-${S.stage} (기대 4-9)`);
        ok(/4-9/.test(label()), `라벨 즉시 갱신: "${label()}"`);
        ok(S.bestChapter === 4 && S.bestStage === 10, `최고 기록 불변: ${S.bestChapter}-${S.bestStage}`);

        // ② 후퇴한 스테이지로 실제 재시작되는가 (setupStage가 깎인 S.stage를 읽는지)
        Combat.downUntil = 0; Combat.riseUntil = 0;
        Combat.setupStage();
        ok(/4-9/.test(label()) && S.stage === 9, `재시작이 후퇴한 스테이지: ${S.chapter}-${S.stage} / "${label()}"`);

        // ③ 3-1 사망 → 3-1 유지 (챕터 절대 안 깎임)
        S.chapter = 3; S.stage = 1;
        Combat.onDefeat();
        ok(S.chapter === 3 && S.stage === 1, `3-1 사망 → ${S.chapter}-${S.stage} (기대 3-1, 2-10 아님)`);

        // ④ 1-1 사망 → 1-1 유지
        S.chapter = 1; S.stage = 1;
        Combat.onDefeat();
        ok(S.chapter === 1 && S.stage === 1, `1-1 사망 → ${S.chapter}-${S.stage}`);

        // ⑤ 던전 중 사망은 후퇴 없음
        S.chapter = 5; S.stage = 6;
        const realFail = Dungeons.onFail;
        let failed = 0; Dungeons.onFail = () => { failed++; };
        Dungeons.run = { id: Dungeons.list ? Dungeons.list[0].id : 'hammer', stage: 2, kills: 0 };
        Combat.onDefeat();
        Dungeons.run = null; Dungeons.onFail = realFail;
        ok(S.chapter === 5 && S.stage === 6, `던전 사망: 본대 스테이지 불변 ${S.chapter}-${S.stage}`);
        ok(failed === 1, `던전 사망: Dungeons.onFail 위임 ${failed}회`);

        // ⑥ 세이브에 후퇴가 반영되는가 (새로고침해도 4-9)
        S.chapter = 4; S.stage = 10;
        Combat.onDefeat();
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /save|forge|state/i.test(k)) || '')); } catch (e) {}
        ok(!saved || (saved.stage === 9 && saved.chapter === 4), `세이브 반영: ${saved ? saved.chapter + '-' + saved.stage : '키 못 찾음(스킵)'}`);
        return out;
    });

    r.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = r.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
