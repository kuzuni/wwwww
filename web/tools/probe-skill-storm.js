// 먹구름 낙뢰 판정기 (skill-fx-exaggerated, 사용자 지시 2026-08-19)
//   "적들 머리 위에 구름 뭉게뭉게 생겼다가 번개로 바바박 한다던가 그런 거."
//   방향 보정: "매번 다단 히트일 필요는 없음 … 연출이 좀 구체적이었으면 좋겠다는 거임."
//
// 이 항목의 판정 기준은 '화려한가'(=채점)가 아니라 **장면이 시간축에 실제로 펼쳐지는가**다.
// 그래서 재는 것은 넷 —
//   ⑴ 예고: 번개가 치기 **전에** 구름 덩이가 적 머리 위에 존재하고, 부풀어 오른다(불투명도 상승)
//   ⑵ 연발: 낙뢰가 **여러 발** 시간차로 떨어지고, 등급이 높을수록 발수가 많다(단조 사다리)
//   ⑶ 자리: 번개가 구름에서 시작해 적 근처에 꽂힌다(허공에서 끊기지 않는다)
//   ⑷ 뒷정리: 연출이 끝나면 구름·조명이 씬에서 사라진다(구름만 남는 일이 없어야 한다)
//
// ⚠️ 계측 함정(앞 세션들이 실제로 밟은 것 — `probe-skill-fx-power` 메모와 같은 뿌리):
//   · **즉시실행 setTimeout 패치는 뒷정리 타이머까지 즉시 돌린다.** 이 연출은 스스로를 지우므로
//     패치 상태에서 라이브 씬을 세면 항상 0이 나온다("구름이 안 뜬다"는 유령 결과).
//     그래서 여기서는 **패치하지 않고 실시간으로 재되**, 3D 렌더 루프를 멈춰 setTimeout 이 제때
//     깨어나게 한다(swiftshader 가 메인 스레드를 잡으면 4초를 기다려도 안 깨어난다).
//   · 대상은 **타입이 아니라 씬 자식 차분**으로 쥔다 — 다른 연출(불티·링)이 같은 타입으로 섞인다.
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
        if (await p.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.heroG)) break;
        await p.waitForTimeout(250);
    }
    await p.waitForTimeout(1200);

    // 렌더 루프를 멈춘다(위 함정 ②) — 애니는 우리가 수동으로 흘린다
    await p.evaluate(() => {
        Scene3D.renderFrame = () => {};
        Combat.tick = () => {};
        Scene3D.walking = false;
        window.__mark = () => {
            // 구름 덩이 = stormCloudGather 가 만든 그룹 안의 IcosahedronGeometry 메시
            // ⚠️ **타입으로 세지 말 것.** `IcosahedronGeometry` 로 구름을 세면 적 몸통의 저폴리
            //    파츠가 같이 잡힌다(임프 실측 18개) — 연출이 다 끝난 뒤에도 18개가 남은 것처럼
            //    보이고, 불투명도 최댓값도 적 재질(1.0)이 덮어 '안 부푼다'로 읽힌다.
            //    실제로 이 프로브가 그 함정에 걸렸다. 연출이 심은 표식(userData)만 센다.
            let puffs = 0, puffOp = 0, bolts = 0, lights = 0;
            Scene3D.scene.traverse(o => {
                if (o.isPointLight && o.userData && o.userData.stormLight) lights++;
                if (o.userData && o.userData.stormPuff) { puffs++; puffOp = Math.max(puffOp, o.material.opacity); }
                if (o.isMesh && o.geometry && o.geometry.type === 'TubeGeometry') bolts++;
            });
            return { puffs, puffOp: +puffOp.toFixed(3), bolts, lights };
        };
    });

    // ---- 등급별 실측 ----
    const rows = [];
    for (const rarity of ['common', 'epic', 'mythic']) {
        const r = await p.evaluate(async (rar) => {
            Scene3D.clearEnemies();
            const e = { id: 7000 + Math.round(Scene3D.STORM_CLOUD_Y * 100) + rar.length, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
            Combat.enemies = [e]; Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(e.id);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            const def = SKILL_DEFS.find(s => s.fx === 'bolt' && s.rarity === rar) || { rarity: rar, fx: 'bolt', color: '#fff176' };
            const tier = Scene3D.skillTier(def);
            const t0 = performance.now();
            const frames = [];
            // 번개 발수는 개별 볼트가 0.32s 살아 있어 동시 카운트로는 못 센다 —
            // lightningBolt 호출을 훅으로 세어 **발수와 좌표**를 직접 잡는다(씬 스캔의 한계 회피).
            const strikes = [];
            const orig = Scene3D.lightningBolt.bind(Scene3D);
            Scene3D.lightningBolt = (from, to, col, ti) => { strikes.push({ t: performance.now() - t0, from: from.clone(), to: to.clone() }); return orig(from, to, col, ti); };
            Scene3D.skillEffect('bolt', def.color, [e.id], def);
            // 실시간으로 흘리며 표본 채취 (렌더 루프는 멈춰 있고 setTimeout 은 정상 동작)
            const enemyPos = m.g.position.clone();
            await new Promise(res => {
                const iv = setInterval(() => {
                    Scene3D.update(1 / 60);
                    frames.push(Object.assign({ t: performance.now() - t0 }, window.__mark()));
                    if (performance.now() - t0 > 1900) { clearInterval(iv); res(); }
                }, 16);
            });
            Scene3D.lightningBolt = orig;
            return { rar, tier, frames, strikes: strikes.map(s => ({ t: s.t, fy: s.from.y, tx: s.to.x, ty: s.to.y, tz: s.to.z })),
                enemy: { x: enemyPos.x, y: enemyPos.y, z: enemyPos.z }, cloudY: Scene3D.STORM_CLOUD_Y, wantBolts: Scene3D.stormBolts(tier) };
        }, rarity);
        rows.push(r);
        await p.waitForTimeout(250);
    }

    for (const r of rows) {
        console.log(`\n── ${r.rar} (tier ${r.tier}) ──`);
        const first = r.strikes.length ? r.strikes[0].t : Infinity;
        const beforeFirst = r.frames.filter(f => f.t < first);
        const maxPuffBefore = Math.max(0, ...beforeFirst.map(f => f.puffs));
        const maxOpBefore = Math.max(0, ...beforeFirst.map(f => f.puffOp));
        const opRose = beforeFirst.length > 2 && beforeFirst[beforeFirst.length - 1].puffOp > beforeFirst[1].puffOp;
        console.log(`   첫 낙뢰 ${first.toFixed(0)}ms · 그 전 구름 덩이 최대 ${maxPuffBefore}개(불투명 ${maxOpBefore}) · 낙뢰 ${r.strikes.length}발`);
        console.log(`   낙뢰 시각: ${r.strikes.map(s => s.t.toFixed(0)).join(', ')}ms`);

        // ⑴ 예고 — 번개보다 구름이 먼저다
        ok(maxPuffBefore >= 5, `[${r.rar}] 낙뢰 전에 구름 덩이가 있다 (${maxPuffBefore}개 ≥5)`);
        ok(opRose, `[${r.rar}] 구름이 부풀어 오른다 (불투명도 상승: ${beforeFirst.length > 2 ? beforeFirst[1].puffOp + '→' + beforeFirst[beforeFirst.length - 1].puffOp : 'n/a'})`);
        ok(first > 40, `[${r.rar}] 첫 낙뢰가 즉발이 아니다 (${first.toFixed(0)}ms > 40ms)`);

        // ⑵ 연발 — 여러 발이 시간차로
        ok(r.strikes.length === r.wantBolts, `[${r.rar}] 낙뢰 ${r.strikes.length}발 (코드값 ${r.wantBolts}발)`);
        if (r.strikes.length >= 2) {
            const gaps = r.strikes.slice(1).map((s, i) => s.t - r.strikes[i].t);
            const spread = r.strikes[r.strikes.length - 1].t - r.strikes[0].t;
            ok(Math.min(...gaps) > 25, `[${r.rar}] 발과 발이 겹치지 않는다 (최소 간격 ${Math.min(...gaps).toFixed(0)}ms >25)`);
            ok(spread > 100, `[${r.rar}] 시간축에 퍼진다 (첫~끝 ${spread.toFixed(0)}ms >100 — '따' 하고 끝나지 않는다)`);
        }

        // ⑶ 자리 — 구름에서 나와 적 근처로
        const badFrom = r.strikes.filter(s => Math.abs(s.fy - r.cloudY) > 0.9);
        ok(badFrom.length === 0, `[${r.rar}] 모든 낙뢰가 구름 높이에서 시작 (이탈 ${badFrom.length}/${r.strikes.length})`);
        const far = r.strikes.filter(s => Math.hypot(s.tx - r.enemy.x, s.tz - r.enemy.z) > 1.6);
        ok(far.length === 0, `[${r.rar}] 착탄이 적 주변 1.6유닛 안 (이탈 ${far.length}/${r.strikes.length})`);

        // ⑷ 뒷정리
        const last = r.frames[r.frames.length - 1];
        ok(last.puffs === 0, `[${r.rar}] 연출 뒤 구름이 사라진다 (남은 덩이 ${last.puffs}개)`);
        ok(last.lights === 0, `[${r.rar}] 연출 뒤 조명이 사라진다 (남은 ${last.lights}개)`);
    }

    // ⑵-b 등급 사다리 — 높을수록 발수가 많다(단조 비감소, 양 끝은 실제로 늘어야 한다)
    const counts = rows.map(r => r.strikes.length);
    ok(counts.every((c, i) => i === 0 || c >= counts[i - 1]) && counts[counts.length - 1] > counts[0],
        `등급 사다리 — 발수 ${counts.join(' → ')} (단조 증가)`);

    ok(errors.length === 0, `콘솔·페이지 에러 0건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    await b.close();
    console.log(`\n${fails.length ? `실패 ${fails.length}건` : '전부 통과'}`);
    if (fails.length) { fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
})();
