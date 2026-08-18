// 던전 실패 직후 스테이지 라벨·3D 테마가 본대로 돌아오는가 — 실게임(브라우저) 실측.
// 사용: node tools/probe-dungeon-fail-label.js
//
// 왜 이 프로브가 따로 필요한가: probe-defeat-retreat.js 는 Scene3D.update / Combat.tick 을
// 통째로 스텁해서 "로직만" 본다. 이 항목의 결함은 로직이 아니라 **시간**이었다 —
// Dungeons.run 이 null 이 된 뒤에도 라벨/배경이 4초간 옛 던전을 가리키는 것. 그래서 여기서는
// 실제 게임 루프를 그대로 돌리고 벽시계로 표본을 뜬다.
//
// 판정: run=null 이 된 **첫 표본**에서 라벨이 본대(N-M)를 가리키고, 3D 테마(클리어 컬러=하늘색)도
//       본대 챕터 테마와 같아야 한다. 라벨만 먼저 돌아오면 "본대 라벨 + 던전 배경"이 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(1200);

    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };

    const RUNS = 3;
    for (let i = 0; i < RUNS; i++) {
        // ① 본대 1-5, 던전 해금 상태를 만들고 유령 마을 8단계 입장
        await p.evaluate(() => {
            // ⚠️ 전투 판정을 먼저 막고 입장한다. 안 막으면 아래 300ms 정착 대기 동안 던전이 **클리어**돼
            //    (waves 는 1~3 랜덤이라 1웨이브가 뽑히면 보스 단판이고, 최고 기록 9-10 세팅의 영웅은
            //    유령 마을 8단계를 그 안에 정리한다) Dungeons.run 이 null 이 된 채로 ② 단계에 들어가
            //    `Dungeons.def(Dungeons.run.id)` 에서 통째로 터진다. 이 항목이 재는 건 '실패 후 복귀'라
            //    판정 자체가 필요 없다 — 사망은 아래에서 Combat.onDefeat() 로 직접 태운다.
            //    (같은 함정을 tools/shot-dungeon-fail.js 가 먼저 밟았다: damageHero 만 막으면 안 되고
            //     damageEnemy 도 같이 막아야 한다.)
            Combat.damageEnemy = () => {};
            Combat.damageHero = () => {};
            S.chapter = 1; S.stage = 5; S.bestChapter = 9; S.bestStage = 10;
            Dungeons.ensure();
            S.dungeons.keys.ghost = 2;
            Dungeons.run = null;
            Combat.downUntil = 0; Combat.riseUntil = 0;
            Combat.setupStage();
            Dungeons.enter('ghost', 8);
        });
        await p.waitForTimeout(300);

        const before = await p.evaluate(() => ({
            label: UI.els.stageLabel.textContent,
            sky: '#' + Scene3D.renderer.getClearColor(new THREE.Color()).getHexString(),
        }));

        // 본대 챕터 테마의 하늘색(기대값) — 던전 밖에서 setChapterTheme(1)이 찍는 색
        // CHAPTER_THEMES 는 scene3d.js 모듈 지역 상수라 밖에서 못 읽는다 —
        // 본대 테마를 한 번 실제로 적용해 하늘색을 받아 적고 던전 테마로 되돌린다(표본 뜨기 전이라 무해).
        const campSky = await p.evaluate(() => {
            Scene3D.setChapterTheme(S.chapter);
            const camp = '#' + Scene3D.renderer.getClearColor(new THREE.Color()).getHexString();
            Scene3D.setTheme(Dungeons.def(Dungeons.run.id).theme);
            return camp;
        });

        // ② 강제 패배 — 실제 게임 루프가 돌아가는 채로
        await p.evaluate(() => {
            window.__samples = [];
            Combat.onDefeat();
            const t0 = performance.now();
            const tick = () => {
                window.__samples.push({
                    t: Math.round(performance.now() - t0),
                    run: Dungeons.run ? Dungeons.run.id : null,
                    label: UI.els.stageLabel.textContent,
                    sky: '#' + Scene3D.renderer.getClearColor(new THREE.Color()).getHexString(),
                    mobs3d: Scene3D.enemyMap.size,
                    mobs: Combat.enemies.length,
                    phase: Combat.phase,
                });
                if (performance.now() - t0 < 7400) setTimeout(tick, 200);
            };
            tick();
        });
        await p.waitForTimeout(7800);

        const s = await p.evaluate(() => window.__samples);
        const first = s[0];                                  // run 이 null 이 된 첫 표본
        const campLabelRe = /^(쉬움|보통|어려움|매우 어려움)\s+\d+-\d+/;
        const backAt = s.find(x => campLabelRe.test(x.label));
        const skyAt = s.find(x => x.sky === campSky);

        ok(first.run === null, `[${i + 1}] 실패 직후 Dungeons.run=null (입장 시 "${before.label}")`);
        ok(campLabelRe.test(first.label),
            `[${i + 1}] 첫 표본(${first.t}ms) 라벨이 본대: "${first.label}" — 라벨 복귀 ${backAt ? backAt.t : '없음'}ms`);
        ok(first.sky === campSky,
            `[${i + 1}] 첫 표본(${first.t}ms) 배경이 본대 하늘 ${campSky}: ${first.sky} — 테마 복귀 ${skyAt ? skyAt.t : '없음'}ms`);
        // 라벨과 테마가 서로 어긋난 구간이 없어야 한다(한쪽만 먼저 돌아오면 "본대 라벨 + 던전 배경")
        const mismatch = s.filter(x => campLabelRe.test(x.label) !== (x.sky === campSky));
        ok(mismatch.length === 0,
            `[${i + 1}] 라벨·배경 불일치 구간 ${mismatch.length}표본` +
            (mismatch.length ? ` (${mismatch[0].t}~${mismatch[mismatch.length - 1].t}ms: "${mismatch[0].label}" / ${mismatch[0].sky})` : ''));

        // 나를 죽인 던전 몹이 본대 배경에 남아 서 있으면 안 된다 — 배경과 같은 프레임에 사라져야 한다
        ok(first.mobs3d === 0 && first.mobs === 0,
            `[${i + 1}] 첫 표본(${first.t}ms) 던전 몹 정리: 3D ${first.mobs3d}체 / 논리 ${first.mobs}체`);
        // 몹·지연큐를 비운 탓에 다음 판이 안 열리는 교착이 생기면 안 된다(사망 연출 4초 뒤 정상 재개)
        const resumed = s.find(x => x.phase === 'fight' && x.mobs > 0);
        ok(!!resumed, `[${i + 1}] 본대 전투 재개: ${resumed ? `${resumed.t}ms에 ${resumed.mobs}체` : '7.4초 내 재개 안 됨'}`);

        // 본대 스테이지는 던전 실패로 후퇴하지 않는다
        const st = await p.evaluate(() => `${S.chapter}-${S.stage}`);
        ok(st === '1-5', `[${i + 1}] 본대 스테이지 불변: ${st}`);
    }

    out.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = out.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
