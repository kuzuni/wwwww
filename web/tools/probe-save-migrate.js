// 손상·구세이브 부팅 복구 실측 — 사용: node probe-save-migrate.js
// QA 10차 버그: localStorage에 필드가 빠진 세이브가 있으면 `UI.init()`이 TypeError로 끊겨
// boot()의 나머지(3D·전투·틱·자동저장)가 통째로 안 돌고 화면이 얇은 띠로 붕괴, 새로고침해도 영구히 같음.
//
// 판정(케이스마다): ① 콘솔/페이지 에러 0건 ② 3D 렌더러가 살아 있다 ③ 전투가 시작됐다(적 스폰)
//                  ④ 장비 시트가 그려졌다 ⑤ #app에 레이아웃 크기가 잡혔다(fitLayout 도달)
//                  ⑥ 코어 필드가 기본값으로 메꿔졌다 ⑦ 정상 세이브는 값이 보존된다(마이그레이션이 안 덮는다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KEY = 'forgeclone_save_v1';

const CASES = [
    { name: 'QA 재현: 필드 대부분 누락', raw: '{"version":1,"chapter":2,"stage":3,"coins":100,"hammers":5}',
      expect: { chapter: 2, stage: 3, coins: 100, hammers: 5 } },
    { name: 'equippedSkills가 null', raw: '{"version":1,"coins":7,"equippedSkills":null}', expect: { coins: 7 } },
    { name: '중첩 레코드가 부분만 있음', raw: '{"version":1,"summonMult":{"skill":5},"autoForge":{},"equipment":{"weapon":null}}',
      expect: {} },
    { name: '타입이 틀림(배열이어야 할 곳에 객체)', raw: '{"version":1,"pets":{},"eggs":3,"activePets":"x"}', expect: {} },
    { name: '세이브가 객체가 아님(배열)', raw: '[1,2,3]', expect: {} },
    { name: '깨진 JSON', raw: '{"version":1,', expect: {} },
    { name: 'version 없음(구세이브)', raw: '{"coins":999}', expect: {} },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
    const rows = [];

    for (const c of CASES) {
        const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
        // 페이지 스크립트보다 먼저 세이브를 심는다 — 부팅이 이 값을 읽어야 재현이 성립한다
        await page.addInitScript(({ KEY, raw }) => { try { localStorage.setItem(KEY, raw); } catch (e) {} }, { KEY, raw: c.raw });
        await page.goto(INDEX, { waitUntil: 'load' });
        // 부팅이 끝나길 기다린다 — 죽은 빌드에서는 여기서 타임아웃이 난다(그것도 결과다)
        let booted = true;
        try {
            await page.waitForFunction(() => typeof S !== 'undefined' && S && typeof UI !== 'undefined' && document.querySelector('#equip-sheet'), null, { timeout: 25000 });
            await page.waitForFunction(() => typeof Combat !== 'undefined' && Combat.enemies && Combat.enemies.length > 0, null, { timeout: 25000 });
        } catch (e) { booted = false; }

        const st = await page.evaluate(() => ({
            renderer: !!(typeof Scene3D !== 'undefined' && Scene3D.renderer),
            enemies: (typeof Combat !== 'undefined' && Combat.enemies) ? Combat.enemies.length : -1,
            phase: (typeof Combat !== 'undefined') ? Combat.phase : '?',
            sheetLen: (document.querySelector('#equip-sheet')?.innerHTML || '').length,
            appW: document.getElementById('app')?.getBoundingClientRect().width || 0,
            appH: document.getElementById('app')?.getBoundingClientRect().height || 0,
            core: {
                equippedSkills: Array.isArray(S.equippedSkills) ? S.equippedSkills.length : null,
                pets: Array.isArray(S.pets) ? 'array' : typeof S.pets,
                eggs: Array.isArray(S.eggs) ? 'array' : typeof S.eggs,
                activePets: Array.isArray(S.activePets) ? 'array' : typeof S.activePets,
                summonMultPet: S.summonMult?.pet, autoForgeBatch: S.autoForge?.hammersPerBatch,
                equipSlots: S.equipment ? Object.keys(S.equipment).length : -1,
                chapter: S.chapter, stage: S.stage, coins: S.coins, hammers: S.hammers,
            },
        }));

        const tag = `[${c.name}]`;
        ok(booted, `${tag} 부팅이 끝나지 않았다(전투 시작 안 됨)`);
        ok(errors.length === 0, `${tag} 콘솔 에러 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);
        ok(st.renderer, `${tag} 3D 렌더러가 없다 — boot()이 중단됐다`);
        ok(st.enemies > 0, `${tag} 적이 스폰되지 않았다 (${st.enemies}마리 / phase=${st.phase})`);
        ok(st.sheetLen > 0, `${tag} 장비 시트가 비었다`);
        ok(st.appW > 100 && st.appH > 300, `${tag} #app 레이아웃이 안 잡혔다 (${st.appW}×${st.appH})`);
        ok(st.core.equippedSkills > 0, `${tag} equippedSkills가 안 메꿔졌다 (${st.core.equippedSkills})`);
        ok(st.core.pets === 'array' && st.core.eggs === 'array' && st.core.activePets === 'array',
            `${tag} 배열 필드 타입이 안 고쳐졌다 (pets=${st.core.pets} eggs=${st.core.eggs} activePets=${st.core.activePets})`);
        ok(st.core.summonMultPet >= 1, `${tag} summonMult.pet이 안 메꿔졌다 (${st.core.summonMultPet})`);
        ok(st.core.autoForgeBatch >= 1, `${tag} autoForge.hammersPerBatch가 안 메꿔졌다 (${st.core.autoForgeBatch})`);
        ok(st.core.equipSlots === 8, `${tag} 장비 슬롯이 8칸이 아니다 (${st.core.equipSlots})`);
        rows.push(`${booted ? 'OK ' : '×  '} ${c.name.padEnd(28)} 적 ${String(st.enemies).padStart(2)}마리 · 시트 ${String(st.sheetLen).padStart(5)}자 · app ${Math.round(st.appW)}×${Math.round(st.appH)} · 에러 ${errors.length}`);
        await page.close();
    }

    // ---- ⑥⑦ 값 보존은 **부팅한 화면에서 재면 안 된다** ----
    // 게임이 살아 돌아가는 화면에서 S.coins/S.stage를 읽으면 처치·스테이지 클리어로 값이 계속 움직여
    // "마이그레이션이 덮었다"와 "게임이 진행됐다"가 구별되지 않는다(첫 판본에서 실제로 오검출).
    // 그래서 이미 부팅된 페이지 하나에서 `loadGame()`만 **동기로 다시 불러** 그 자리에서 읽는다.
    {
        const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof S !== 'undefined' && S && typeof Combat !== 'undefined' && Combat.enemies.length > 0, null, { timeout: 25000 });

        const keep = await page.evaluate(({ KEY, CASES }) => {
            const out = [];
            for (const c of CASES) {
                localStorage.setItem(KEY, c.raw);
                loadGame();                              // ← 여기서 마이그레이션이 돈다. 바로 읽는다.
                out.push({ name: c.name, expect: c.expect, got: { chapter: S.chapter, stage: S.stage, coins: S.coins, hammers: S.hammers } });
            }
            // 정상(전 필드) 세이브가 그대로 살아 돌아오는지 — 마이그레이션이 값을 덮지 않는 것의 대조군
            const full = defaultState();
            full.coins = 123456; full.chapter = 4; full.stage = 7; full.summonMult.pet = 25;
            full.autoForge.hammersPerBatch = 22; full.eggs = []; full.nickname = '검증용';
            full.activeMount = null; full.equipment.weapon = null; full.techResearch = null;
            localStorage.setItem(KEY, JSON.stringify(full));
            loadGame();
            const round = { coins: S.coins, chapter: S.chapter, stage: S.stage, pet: S.summonMult.pet, batch: S.autoForge.hammersPerBatch, eggs: S.eggs.length, nick: S.nickname, mount: S.activeMount, weapon: S.equipment.weapon, tech: S.techResearch };
            return { out, round };
        }, { KEY, CASES: CASES.map(c => ({ name: c.name, raw: c.raw, expect: c.expect })) });

        for (const r of keep.out) for (const [k, v] of Object.entries(r.expect)) {
            ok(r.got[k] === v, `[${r.name}] 살아 있어야 할 값이 덮였다 — ${k}=${r.got[k]} (기대 ${v})`);
        }
        const R = keep.round;
        ok(R.coins === 123456 && R.chapter === 4 && R.stage === 7 && R.pet === 25 && R.batch === 22 && R.eggs === 0 && R.nick === '검증용',
            `[정상 세이브 보존] 값이 덮였다 — ${JSON.stringify(R)}`);
        ok(R.mount === null && R.weapon === null && R.tech === null,
            `[정상 세이브 보존] 기본값이 null인 필드(미장착·연구없음)가 덮였다 — ${JSON.stringify({ mount: R.mount, weapon: R.weapon, tech: R.tech })}`);
        ok(errors.length === 0, `[값 보존] 콘솔 에러 ${errors.length}건`);
        rows.push(`OK  loadGame() 동기 재호출 값 보존    coins ${R.coins} · ${R.chapter}-${R.stage} · 배수 ${R.pet} · 알 ${R.eggs} · 닉 ${R.nick}`);
        await page.close();
    }

    for (const r of rows) console.log(r);
    console.log('');
    if (fail.length) { console.log('FAIL\n - ' + fail.join('\n - ')); await browser.close(); process.exit(1); }
    console.log('PASS — 손상 세이브 7종 전부 정상 부팅 + 정상 세이브 값 보존');
    await browser.close();
})();
