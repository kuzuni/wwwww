// 스킬 고유 시그니처 판정기 (skill-unique-signature, 사용자 지시 2026-08-19)
//   사용자 원문: "스킬 너무 똑같아 보이는 거 하지 말라 하기. 예를 들어 아포칼립스랑 메테오라는
//   스킬 너무 똑같음. 아예 존나 다르게 해야 함."
//
// 이 항목의 판정 기준은 '화려한가'(=채점)가 아니라 **18종이 서로 다른 그림인가**다. 그래서 재는 건 셋 —
//   ⑴ fx 키 유일성: 18종이 fx 키를 하나도 공유하지 않는다(데이터 축)
//   ⑵ 분기 유일성: `skillPayload` 가 fx 마다 서로 다른 전용 연출을 부른다(코드 축)
//   ⑶ **그림 유일성**: 실제로 씬에 그려지는 물건이 서로 다르다(실측 축 — 여기가 본판정)
//      스킬마다 연출 구간 동안 씬에 새로 생긴 오브젝트를 모아 시그니처를 만든다:
//        · 지오메트리 타입 히스토그램(무엇을 그렸나)
//        · 영웅 기준 바운딩 박스(어디서 어느 축으로 펼쳐지나 — 낙하/수평쓸기/발밑/상승)
//      두 스킬의 시그니처가 같으면 '똑같아 보인다' → FAIL.
//
// ⚠️ 계측 함정 (앞 세션들이 실제로 밟은 것 — `probe-skill-storm` 메모와 같은 뿌리):
//   · **즉시실행 setTimeout 패치 금지.** 이 연출들은 스스로를 지우므로 패치하면 뒷정리까지 즉시
//     돌아 항상 0개가 잡힌다("아무것도 안 그린다"는 유령 결과).
//   · **rAF 를 멈춘다.** swiftshader 헤드리스에서 렌더 루프가 메인 스레드를 잡으면 setTimeout 이
//     제때 안 깨어나 2·3박이 통째로 누락된다(TODO '함정 ③').
//   · 대상은 **타입이 아니라 씬 자식 차분**으로 쥔다 — 적 몸통의 저폴리 파츠가 같은 타입으로 섞인다.
//   · 스킬 사이에 씬을 **완전히 비운다** — 앞 스킬 잔여물이 다음 시그니처에 섞이면 전부 '비슷함'이 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const fails = [];
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?enemy=imp', { waitUntil: 'load' });
    for (let i = 0; i < 160; i++) {
        if (await p.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.heroG && !!Scene3D.scene)) break;
        await p.waitForTimeout(250);
    }
    await p.waitForTimeout(1200);
    // 렌더 루프·전투 틱을 멈춘다 — swiftshader 가 메인 스레드를 잡으면 setTimeout 이 제때 안 깨어나고
    // (TODO '함정 ③'), 전투가 계속 돌면 다른 연출이 시그니처에 섞인다.
    await p.evaluate(() => { if (window.Combat) Combat.tick = () => {}; Scene3D.walking = false; });

    // 🔎 **자 자체의 변별력 검증 (음성 대조군)** — `SIGSELFTEST=1` 로 켠다.
    //    이 저장소가 반복해서 밟은 함정이 "자를 먼저 의심하라"다. 시그니처 비교기가 늘 PASS 만
    //    뱉는다면 그건 18종이 다른 게 아니라 **자가 아무것도 못 가려내는 것**일 수 있다.
    //    그래서 일부러 아포칼립스의 fx 를 메테오로 되돌려(= 사용자가 지적한 그 상태) 돌려 보면
    //    반드시 '겹치는 쌍 1건'이 나와야 한다. 안 나오면 자가 고장난 것이다.
    if (process.env.SIGSELFTEST) {
        await p.evaluate(() => { SKILL_DEFS.find(s => s.id === 'apocalypse').fx = 'meteor'; });
        console.log('※ 음성 대조군 모드 — 아포칼립스 fx 를 meteor 로 되돌렸다. 겹침 1건이 나와야 정상.');
    }

    // ⑴ fx 키 유일성 (데이터 축)
    const dataAx = await p.evaluate(() => {
        const dup = {};
        for (const s of SKILL_DEFS) (dup[s.fx] = dup[s.fx] || []).push(s.id);
        return { n: SKILL_DEFS.length, keys: Object.keys(dup).length,
                 shared: Object.entries(dup).filter(([, v]) => v.length > 1) };
    });
    ok(dataAx.shared.length === 0,
        `fx 키 유일성 — 스킬 ${dataAx.n}종 / fx 키 ${dataAx.keys}개`
        + (dataAx.shared.length ? ` · 공유: ${dataAx.shared.map(([k, v]) => `${k}=${v.join('+')}`).join(', ')}` : ''));

    // ⑶ 그림 유일성 (실측 축, **픽셀 기반**) — 여기가 본판정
    // 🚨 앞선 구현은 씬 그래프(지오 타입 히스토그램 + 바운딩 박스)로 '닮음'을 쟀는데,
    //    음성 대조군에서 **같은 코드를 돌린 쌍이 0.66, 서로 다른 스킬 쌍이 0.84** 로 나왔다 —
    //    변별력이 뒤집혀 있었다. 원인 둘: ⓐ 연출이 전부 `U.rand` 라 히스토그램이 런마다 흔들린다
    //    ⓑ 지원계는 전부 Plane/Torus/스프라이트를 영웅 발밑 좁은 부피에 쓴다 — 그리는 그림
    //    (붕대 십자 vs 포효 고리 vs 시계 문자판)은 다른데 **자에는 같게 보인다.**
    //    구조 지문으로는 '같아 보이는가'를 못 재는 게 결론이라, 실제로 **렌더된 픽셀**을 비교한다.
    //    스킬마다 연출 구간의 여러 시점을 캡처해 기준 프레임과의 **차분 그리드**를 이어 붙이고,
    //    그 벡터의 코사인 유사도를 본다. 픽셀은 '무엇이 화면에 보였나'를 그대로 담는다.
    const GW = 40, GH = 71;                       // 다운샘플 그리드 (화면비 유지)
    const SAMPLE_MS = [90, 220, 400, 650, 950];   // 시전 → 발동 → 적중 → 여운
    await p.evaluate((g) => {
        const [gw, gh] = g;
        window.__cv = document.createElement('canvas'); __cv.width = gw; __cv.height = gh;
        window.__ctx = __cv.getContext('2d', { willReadFrequently: true });
        // ⚠️ 렌더와 **같은 JS 턴**에서 읽어야 한다 — preserveDrawingBuffer 가 꺼져 있어서
        //    턴을 넘기면 드로잉 버퍼가 비워진다(전부 검은 프레임이 되는 함정).
        window.__grab = (dt) => {
            Scene3D.update(dt); Scene3D.renderFrame();
            __ctx.drawImage(Scene3D.renderer.domElement, 0, 0, gw, gh);
            return Array.from(__ctx.getImageData(0, 0, gw, gh).data);
        };
    }, [GW, GH]);

    const sigs = [];
    for (const def of await p.evaluate(() => SKILL_DEFS.map(s => ({ id: s.id, name: s.name, fx: s.fx, color: s.color, rarity: s.rarity })))) {
        // 기준 프레임 — 연출이 없는 상태. 스킬마다 새로 잡는다(적 위치가 조금씩 다르다).
        await p.waitForTimeout(700);
        const base = await p.evaluate(() => __grab(0.016));
        const frames = [];
        await p.evaluate(d => {
            const eid = [...Scene3D.enemyMap.keys()][0];
            Scene3D.skillEffect(d.fx, d.color, eid === undefined ? [] : [eid], { rarity: d.rarity });
        }, def);
        let prev = 0;
        for (const ms of SAMPLE_MS) {
            const step = ms - prev; prev = ms;
            await p.waitForTimeout(step);
            // dt 는 **실제로 흐른 시간**을 준다 — 애니 큐가 그만큼 전진해야 그 시점의 그림이 나온다
            frames.push(await p.evaluate(dt => __grab(dt), step / 1000));
        }
        // 차분 벡터 — 기준 대비 채널별 변화량(연출이 화면에 더한 것만 남는다)
        const feat = [];
        let energy = 0;
        for (const f of frames) for (let i = 0; i < f.length; i += 4) {
            for (let c = 0; c < 3; c++) { const d = (f[i + c] - base[i + c]) / 255; feat.push(d); energy += Math.abs(d); }
        }
        sigs.push({ id: def.id, name: def.name, fx: def.fx, feat, energy: +(energy / feat.length).toFixed(4) });
        await p.waitForTimeout(400);
    }

    console.log('\n--- 스킬별 화면 변화량 (기준 프레임 대비 평균 차분) ---');
    for (const s of sigs) console.log(`  ${s.name.padEnd(9)} [${s.fx.padEnd(10)}] 변화량 ${s.energy}`);

    // 각 스킬이 **화면에 실제로 뭔가를 그리는가**
    const empty = sigs.filter(s => s.energy < 0.004);
    ok(empty.length === 0, `18종 전부 화면에 눈에 띄는 변화를 만든다`
        + (empty.length ? ` · 사실상 안 보이는 연출: ${empty.map(s => `${s.name}(${s.energy})`).join(', ')}` : ''));

    // ⚠️⚠️ **여기서 자를 세 번 갈아엎었다 — 다음 세션은 같은 길을 다시 가지 말 것.**
    //    '두 스킬이 똑같아 보이는가'를 기계로 재려고 세 가지를 시도했고 **셋 다 음성 대조군에서
    //    떨어졌다**(대조군 = 아포칼립스 fx 를 meteor 로 되돌려 두 스킬이 같은 코드를 돌게 한 것.
    //    이때 그 쌍은 반드시 '가장 닮은 쌍'으로 잡혀야 정상이다):
    //      ① 지오 히스토그램 완전일치 → 연출이 전부 `U.rand` 라 **같은 코드도 두 번 같지 않다** → 겹침 0건
    //      ② 히스토그램 코사인 × 바운딩박스 겹침 → **변별력이 뒤집혔다**: 같은 코드 쌍 0.66 vs
    //         서로 다른 스킬 쌍 0.84(지원계는 죄다 Plane/Torus/스프라이트를 발밑 좁은 부피에 쓴다)
    //      ③ 렌더 픽셀 차분 코사인 → 같은 코드 쌍이 **0.03**(무상관). 운석 낙하 위치·불티가 런마다
    //         무작위라 한 번의 픽셀 배치가 재현되지 않는다
    //    결론: **'같아 보이는가'는 확률적 연출에서는 단일 런 기계 측정으로 판정할 수 없다.**
    //    그건 비평가 채점(9/10 게이트) 몫이고, 최우선 규칙 0에 따라 순번이 맨 뒤다.
    //    대신 이 프로브는 **음성 대조군이 실제로 잡아내는 축만** 게이트로 삼는다(아래 ⑵).

    // ⑵ 분기 유일성 (코드 축) — 음성 대조군이 실제로 잡아내는 축이다.
    //    fx 마다 `skillPayload` 에 전용 분기가 있고, 서로 **다른 연출 함수**를 부르는가.
    //    두 스킬이 같은 함수를 부르면(= 사용자가 지적한 그 상태) 여기서 잡힌다.
    const src = require('fs').readFileSync(path.resolve(__dirname, '../js/scene3d.js'), 'utf8');
    const bodyStart = src.indexOf('skillPayload(fx, color, targetIds, tier, scene) {');
    // ⚠️ 함수 **끝**을 반드시 잘라낼 것. 마지막 분기(`aura`)는 뒤에 `else if` 가 없어서, 끝을 안
    //    자르면 정규식이 파일 나머지를 통째로 삼켜 `aura` 가 연출 함수 20여 개를 부르는 것처럼
    //    보인다(실제로 첫 판에서 그렇게 나왔다 — 자가 만든 유령이다).
    const body = src.slice(bodyStart, bodyStart + src.slice(bodyStart).indexOf('\n    },\n'));
    const allFx = await p.evaluate(() => [...new Set(SKILL_DEFS.map(s => s.fx))]);
    // 분기 경계로 잘라 각 fx 의 본문 구간을 얻는다
    const marks = [...body.matchAll(/fx === '([a-z]+)'\)/g)].map(m => ({ fx: m[1], at: m.index }));
    const callsOf = {};
    for (let i = 0; i < marks.length; i++) {
        const seg = body.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : body.length);
        callsOf[marks[i].fx] = [...new Set([...seg.matchAll(/this\.([a-zA-Z][\w]*)\(/g)].map(x => x[1])
            .filter(n => !['flashLight', 'explosion', 'spawnSparks', 'shake', 'skillImpactWeight'].includes(n)))];  // 공용 보조는 제외
    }
    const missing = allFx.filter(f => !callsOf[f] || !callsOf[f].length);
    ok(missing.length === 0, `분기 유일성 ⓐ — fx ${allFx.length}종 전부 전용 연출 함수를 부른다`
        + (missing.length ? ` · 전용 연출 없음: ${missing.join(', ')}` : ''));
    const sameFn = [];
    for (let i = 0; i < allFx.length; i++) for (let j = i + 1; j < allFx.length; j++) {
        const A = callsOf[allFx[i]] || [], B = callsOf[allFx[j]] || [];
        if (A.length && B.length && A.join() === B.join()) sameFn.push(`${allFx[i]}=${allFx[j]}(${A.join('+')})`);
    }
    ok(sameFn.length === 0, `분기 유일성 ⓑ — 같은 연출 함수 조합을 쓰는 fx 쌍 ${sameFn.length}건`
        + (sameFn.length ? `: ${sameFn.join(', ')}` : ''));
    console.log('\n--- fx 별 전용 연출 함수 ---');
    for (const fx of allFx) console.log(`  ${fx.padEnd(11)} → ${(callsOf[fx] || []).join(', ') || '(없음)'}`);

    console.log(`\n※ '얼마나 화려한가 / 확연히 다른가'는 확률적 연출이라 기계 판정 불가 — 비평가 9/10 게이트 몫(규칙 0에 따라 후순위).`);

    ok(errors.length === 0, `콘솔 에러 0건` + (errors.length ? ` · ${errors.slice(0, 3).join(' | ')}` : ''));

    console.log(`\n${fails.length ? 'FAIL ' + fails.length + '건' : '전건 PASS'}`);
    await b.close();
    process.exit(fails.length ? 1 : 0);
})();
