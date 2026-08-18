// 던전 실패 → 본대 복귀가 '쓰러진 그 프레임'에 화면까지 반영되는가 (slug: dungeon-fail-stale-label)
// 사용: node tools/probe-dungeon-fail-return.js   (종료코드 0 = 전체 통과)
// 실게임(index.html)을 띄워 실제로 던전에 입장한 뒤 hp를 0으로 만들어 Combat.onDefeat을 태운다.
// 확인: Dungeons.run === null 이 된 첫 프레임에 ① 스테이지 라벨 ② 3D 씬 테마 ③ 웨이브 pip 개수가
// 전부 본대 값이어야 한다(예전엔 셋 다 setupStage 시점 ≈ 4초 뒤에야 따라왔다).
// ⚠️ 초기 로드 대기를 45초로 잡는다 — 이 저장소는 병렬 세션이 여러 개 돌아 머신이 붐빌 때가 많고,
// 소프트 렌더(swiftshader) 부팅이 20초를 넘겨 **멀쩡한 코드가 TimeoutError 로 반려**되는 일이 잦다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await p.waitForTimeout(1200);

    const r = await p.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        // 전투 틱만 멈춘다 — Scene3D.update는 살려 둬야 sceneCut 오버레이가 실제로 화면에 올라간다.
        Combat.tick = () => {};
        const label = () => UI.els.stageLabel.textContent;
        const pips = () => UI.els.wavePips.children.length;
        const sky = () => '#' + Scene3D.renderer.getClearColor(new THREE.Color()).getHexString();

        // 본대를 1-5에 두고(설계상 던전 실패는 본대 스테이지를 안 깎는다) 던전 해금 상태를 만든다
        S.chapter = 1; S.stage = 5; S.bestChapter = 9; S.bestStage = 10;
        Dungeons.ensure();
        S.dungeons.keys.ghost = 2;
        Combat.setupStage();
        const campSky = sky(), campLabel = label(), campPips = pips();

        // ① 던전 입장 — 화면이 실제로 던전으로 갈아탔는지 먼저 확인(대조군이 없으면 뒤 판정이 무의미)
        const entered = Dungeons.enter('ghost', 8);
        ok(entered && Dungeons.run, '유령 마을 8단계 입장');
        const dunSky = sky();
        ok(/유령 마을/.test(label()), `입장 후 라벨: "${label()}"`);
        ok(dunSky !== campSky, `입장 후 하늘색이 던전 테마로: ${campSky} → ${dunSky}`);
        ok(pips() >= 1 && pips() <= 3, `입장 후 pip 개수 = 던전 웨이브 수(1~3): ${pips()}`);
        const keysBefore = S.dungeons.keys.ghost;

        // ② 강제 패배 — onDefeat이 도는 그 자리에서 즉시 잰다(연출 대기 없음)
        Combat.hero.hp = Combat.hero.maxHp.mul ? Combat.hero.maxHp.mul(0) : 0;
        Combat.onDefeat();
        ok(Dungeons.run === null, 'Dungeons.run === null (실패 처리됨)');
        ok(label() === campLabel, `실패 직후 라벨이 본대로: "${label()}" (기대 "${campLabel}")`);
        ok(sky() === campSky, `실패 직후 씬 테마가 본대로: ${sky()} (기대 ${campSky})`);
        ok(pips() === campPips, `실패 직후 pip 개수가 본대(5): ${pips()} (기대 ${campPips})`);
        ok(S.chapter === 1 && S.stage === 5, `본대 스테이지 불변: ${S.chapter}-${S.stage} (기대 1-5)`);
        ok(S.dungeons.keys.ghost === keysBefore, `열쇠 불변: ${S.dungeons.keys.ghost} (기대 ${keysBefore})`);

        // ③ 컷 커버가 실제로 올라갔는가 — fx-layer 안 전면 검은 판 (연출은 있되 상태를 붙잡지 않아야 한다)
        const covers = [...document.querySelectorAll('#fx-layer > div')].filter(el => {
            const s = getComputedStyle(el);
            return s.position === 'absolute' && el.offsetWidth >= 300 && parseFloat(s.opacity) > 0.05;
        });
        ok(covers.length === 1, `컷 커버 1장이 올라와 있다 (실측 ${covers.length}장)`);

        // 여기서부터 렌더 루프를 세운다 — swiftshader 소프트 렌더는 한 프레임이 초 단위라
        // 메인 스레드가 계속 잠겨 있으면 커버 제거 setTimeout/onfinish가 벽시계 기준으로 안 온다
        // (커버가 남은 게 아니라 콜백이 밀린 것을 '잔류'로 오독하게 된다 — 하네스 결함).
        Scene3D.update = () => {};
        return { out, dunSky, campSky };
    });

    // ④ 커버가 스스로 걷히는가 — 검은 판이 화면에 남으면 그게 더 큰 사고
    await p.waitForTimeout(1500);
    const leftover = await p.evaluate(() => [...document.querySelectorAll('#fx-layer > div')]
        .filter(el => el.offsetWidth >= 300 && parseFloat(getComputedStyle(el).opacity) > 0.05).length);
    r.out.push((leftover === 0 ? 'PASS ' : 'FAIL ') + `1.5초 뒤 커버 잔류 0장 (실측 ${leftover}장)`);
    r.out.push((errors.length === 0 ? 'PASS ' : 'FAIL ') + `콘솔 에러 0건 (실측 ${errors.length}건)`);

    console.log(r.out.join('\n'));
    if (errors.length) console.log(errors.join('\n'));
    await b.close();
    process.exit(r.out.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
