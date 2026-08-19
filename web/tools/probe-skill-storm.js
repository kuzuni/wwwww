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

    // ================= 운석 세례 (meteor) =================
    // 같은 4축으로 잰다. 여기서 '예고'는 **조준 링이 착탄보다 먼저 지면에 뜨는가**다.
    console.log('\n════ 운석 세례 ════');
    const mrows = [];
    for (const rarity of ['epic', 'mythic']) {
        const r = await p.evaluate(async (rar) => {
            Scene3D.clearEnemies();
            const e = { id: 7700 + rar.length, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
            Combat.enemies = [e]; Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(e.id);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            const def = SKILL_DEFS.find(s => s.fx === 'meteor' && s.rarity === rar) || { rarity: rar, fx: 'meteor', color: '#ff7043' };
            const tier = Scene3D.skillTier(def);
            const t0 = performance.now();
            const frames = [], impacts = [];
            // 착탄은 explosion 호출로 잡는다 — 씬 스캔으로는 폭발 파티클과 구분이 안 된다
            const origEx = Scene3D.explosion.bind(Scene3D);
            Scene3D.explosion = (pos, col) => { impacts.push({ t: performance.now() - t0, x: pos.x, z: pos.z }); return origEx(pos, col); };
            Scene3D.skillEffect('meteor', def.color, [e.id], def);
            const enemyPos = m.g.position.clone();
            await new Promise(res => {
                const iv = setInterval(() => {
                    Scene3D.update(1 / 60);
                    let tells = 0, rocks = 0, scorch = 0;
                    Scene3D.scene.traverse(o => {
                        if (!o.userData) return;
                        if (o.userData.meteorTell) tells++;
                        if (o.userData.meteorRock) rocks++;
                        if (o.userData.meteorScorch) scorch++;
                    });
                    frames.push({ t: performance.now() - t0, tells, rocks, scorch });
                    if (performance.now() - t0 > 3400) { clearInterval(iv); res(); }
                }, 16);
            });
            Scene3D.explosion = origEx;
            return { rar, tier, frames, impacts, enemy: { x: enemyPos.x, z: enemyPos.z }, want: Scene3D.meteorCount(tier),
                tellMs: Scene3D.METEOR_TELL_MS };
        }, rarity);
        mrows.push(r);
        await p.waitForTimeout(300);
    }

    for (const r of mrows) {
        console.log(`\n── meteor ${r.rar} (tier ${r.tier}) ──`);
        const firstImpact = r.impacts.length ? r.impacts[0].t : Infinity;
        const firstTell = (r.frames.find(f => f.tells > 0) || {}).t;
        const maxRocks = Math.max(0, ...r.frames.map(f => f.rocks));
        console.log(`   조준 링 ${firstTell === undefined ? '없음' : firstTell.toFixed(0) + 'ms'} · 첫 착탄 ${firstImpact.toFixed(0)}ms · 착탄 ${r.impacts.length}회 · 동시 최대 운석 ${maxRocks}개`);
        console.log(`   착탄 시각: ${r.impacts.map(i => i.t.toFixed(0)).join(', ')}ms`);

        ok(firstTell !== undefined && firstTell < firstImpact - 100,
            `[meteor ${r.rar}] 조준 링이 착탄보다 먼저 뜬다 (링 ${firstTell === undefined ? 'n/a' : firstTell.toFixed(0)}ms < 착탄 ${firstImpact.toFixed(0)}ms - 100)`);
        ok(r.impacts.length === r.want, `[meteor ${r.rar}] 운석 ${r.impacts.length}발 (코드값 ${r.want}발)`);
        if (r.impacts.length >= 2) {
            const spread = r.impacts[r.impacts.length - 1].t - r.impacts[0].t;
            ok(spread > 300, `[meteor ${r.rar}] 시간축에 퍼진다 (첫~끝 ${spread.toFixed(0)}ms >300 — 우수수 쏟아진다)`);
            const gaps = r.impacts.slice(1).map((s, i) => s.t - r.impacts[i].t);
            ok(Math.min(...gaps) > 25, `[meteor ${r.rar}] 착탄이 겹치지 않는다 (최소 간격 ${Math.min(...gaps).toFixed(0)}ms)`);
        }
        ok(maxRocks >= 2, `[meteor ${r.rar}] 하늘에 운석이 동시에 여러 개 (최대 ${maxRocks}개 ≥2)`);
        const far = r.impacts.filter(i => Math.hypot(i.x - r.enemy.x, i.z - r.enemy.z) > 2.2);
        ok(far.length === 0, `[meteor ${r.rar}] 착탄이 적 주변 2.2유닛 안 (이탈 ${far.length}/${r.impacts.length})`);
        // 첫 발·마지막 발은 적 바로 위 (조준됐다 / 마무리)
        const centered = [r.impacts[0], r.impacts[r.impacts.length - 1]]
            .filter(i => i && Math.hypot(i.x - r.enemy.x, i.z - r.enemy.z) < 0.55).length;
        ok(centered === 2, `[meteor ${r.rar}] 첫 발·마지막 발은 적 바로 위 (${centered}/2)`);
        const last = r.frames[r.frames.length - 1];
        ok(last.tells === 0 && last.rocks === 0 && last.scorch === 0,
            `[meteor ${r.rar}] 연출 뒤 잔존 0 (링 ${last.tells} · 운석 ${last.rocks} · 그을음 ${last.scorch})`);
        ok(Math.max(...r.frames.map(f => f.scorch)) > 0, `[meteor ${r.rar}] 착탄 자리에 그을음이 남는다`);
    }
    const mcounts = mrows.map(r => r.impacts.length);
    ok(mcounts[mcounts.length - 1] > mcounts[0], `운석 등급 사다리 — ${mcounts.join(' → ')}발`);

    // ================= 참격 세례 (slash) =================
    // 여기서 '연출이 존재하는가'는 곧 **화면에 그려지는 물건이 있는가**다 — 예전 slash 는
    // 불티와 조명뿐이라 메시가 0개였다. 그래서 첫 단언이 '참격 메시가 실재한다'이다.
    console.log('\n════ 참격 세례 ════');
    const srows = [];
    for (const rarity of ['common', 'legendary']) {
        const r = await p.evaluate(async (rar) => {
            Scene3D.clearEnemies();
            const e = { id: 7800 + rar.length, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
            Combat.enemies = [e]; Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(e.id);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            const def = SKILL_DEFS.find(s => s.fx === 'slash' && s.rarity === rar) || { rarity: rar, fx: 'slash', color: '#cfd8dc' };
            const tier = Scene3D.skillTier(def);
            const t0 = performance.now();
            const frames = [], born = [];
            // 참격은 0.17초만 살아 동시 카운트로는 총 횟수를 못 센다 — 씬 추가를 훅으로 잡는다
            const origAdd = Scene3D.scene.add.bind(Scene3D.scene);
            Scene3D.scene.add = (o) => { if (o && o.children && o.children.some(c => c.userData && c.userData.slashArc)) born.push({ t: performance.now() - t0 }); return origAdd(o); };
            Scene3D.skillEffect('slash', def.color, [e.id], def);
            const ep = m.g.position.clone();
            await new Promise(res => {
                const iv = setInterval(() => {
                    Scene3D.update(1 / 60);
                    let arcs = 0, maxD = 0;
                    Scene3D.scene.traverse(o => {
                        if (o.userData && o.userData.slashArc) {
                            arcs++;
                            const wp = new THREE.Vector3(); o.getWorldPosition(wp);
                            maxD = Math.max(maxD, Math.hypot(wp.x - ep.x, wp.z - ep.z));
                        }
                    });
                    frames.push({ t: performance.now() - t0, arcs, maxD: +maxD.toFixed(2) });
                    if (performance.now() - t0 > 1600) { clearInterval(iv); res(); }
                }, 16);
            });
            Scene3D.scene.add = origAdd;
            return { rar, tier, frames, born, want: 2 + Math.min(3, tier) };
        }, rarity);
        srows.push(r);
        await p.waitForTimeout(250);
    }
    for (const r of srows) {
        console.log(`\n── slash ${r.rar} (tier ${r.tier}) ──`);
        const maxArcs = Math.max(0, ...r.frames.map(f => f.arcs));
        const spread = r.born.length >= 2 ? r.born[r.born.length - 1].t - r.born[0].t : 0;
        console.log(`   참격 ${r.born.length}회 · 동시 최대 ${maxArcs}개 · 첫~끝 ${spread.toFixed(0)}ms · 시각 ${r.born.map(b => b.t.toFixed(0)).join(', ')}ms`);
        ok(maxArcs > 0, `[slash ${r.rar}] 참격 메시가 실제로 화면에 있다 (동시 최대 ${maxArcs}개 >0 — 예전엔 메시가 0개였다)`);
        ok(r.born.length === r.want, `[slash ${r.rar}] 참격 ${r.born.length}회 (코드값 ${r.want}회)`);
        if (r.born.length >= 2) ok(spread > 60, `[slash ${r.rar}] 엇갈려 지나간다 (첫~끝 ${spread.toFixed(0)}ms >60)`);
        const near = Math.max(0, ...r.frames.filter(f => f.arcs > 0).map(f => f.maxD));
        ok(near < 2.0, `[slash ${r.rar}] 참격이 적을 벤다 (적 중심에서 최대 ${near.toFixed(2)}유닛 <2.0)`);
        ok(r.frames[r.frames.length - 1].arcs === 0, `[slash ${r.rar}] 연출 뒤 잔존 0 (${r.frames[r.frames.length - 1].arcs}개)`);
    }
    ok(srows[1].born.length > srows[0].born.length, `참격 등급 사다리 — ${srows.map(r => r.born.length).join(' → ')}회`);

    // ================= 화살 세례 (beam) =================
    console.log('\n════ 화살 세례 ════');
    const arows = [];
    for (const rarity of ['rare', 'ultimate']) {
        const r = await p.evaluate(async (rar) => {
            Scene3D.clearEnemies();
            const e = { id: 7900 + rar.length, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
            Combat.enemies = [e]; Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(e.id);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            const def = SKILL_DEFS.find(s => s.fx === 'beam' && s.rarity === rar) || { rarity: rar, fx: 'beam', color: '#81d4fa' };
            const tier = Scene3D.skillTier(def);
            const t0 = performance.now();
            const shots = [];
            const orig = Scene3D.projectileBolt.bind(Scene3D);
            Scene3D.projectileBolt = (from, to, col, ti) => { shots.push({ t: performance.now() - t0, fx: from.x, tx: to.x, tz: to.z, ti }); return orig(from, to, col, ti); };
            Scene3D.skillEffect('beam', def.color, [e.id], def);
            const ep = m.g.position.clone();
            await new Promise(res => {
                const iv = setInterval(() => { Scene3D.update(1 / 60); if (performance.now() - t0 > 1500) { clearInterval(iv); res(); } }, 16);
            });
            Scene3D.projectileBolt = orig;
            return { rar, tier, shots, enemy: { x: ep.x, z: ep.z }, hero: Scene3D.heroG.position.x, want: 3 + Math.min(4, tier),
                gap: Scene3D.arrowGapMs(tier) };
        }, rarity);
        arows.push(r);
        await p.waitForTimeout(250);
    }
    for (const r of arows) {
        console.log(`\n── beam ${r.rar} (tier ${r.tier}) ──`);
        const spread = r.shots.length >= 2 ? r.shots[r.shots.length - 1].t - r.shots[0].t : 0;
        console.log(`   화살 ${r.shots.length}발 · 첫~끝 ${spread.toFixed(0)}ms · 시각 ${r.shots.map(x => x.t.toFixed(0)).join(', ')}ms`);
        ok(r.shots.length === r.want, `[beam ${r.rar}] 화살 ${r.shots.length}발 (코드값 ${r.want}발 — 예전엔 1발)`);
        if (r.shots.length >= 2) {
            const gaps = r.shots.slice(1).map((x, i) => x.t - r.shots[i].t);
            // ⚠️ 판정선은 **코드가 준 간격**에서 만든다. 130ms 같은 손으로 적은 상수를 쓰면 ⓐ 코드를
            //    고친 뒤에도 옛 값으로 재고(함정 ④) ⓑ 실시간 setTimeout 은 렌더 부하에 따라 흔들려
            //    같은 코드가 64ms↔140ms 로 오간다(실제로 이 단언이 그렇게 한 번 깜빡였다).
            //    스케줄러 지터를 넉넉히 물리되, '한 발씩 쏘는' 수준(코드값의 3배 이상)은 잡는다.
            const lim = r.gap * 3 + 60;
            ok(Math.max(...gaps) < lim, `[beam ${r.rar}] '다다다닥' 간격 (최대 ${Math.max(...gaps).toFixed(0)}ms < ${lim}ms = 코드값 ${r.gap}ms 기준선)`);
            ok(spread > 120, `[beam ${r.rar}] 시간축에 퍼진다 (첫~끝 ${spread.toFixed(0)}ms >120)`);
        }
        ok(r.shots.every(x => Math.abs(x.fx - r.hero) < 1.2), `[beam ${r.rar}] 전부 영웅에게서 나간다`);
        const far = r.shots.filter(x => Math.hypot(x.tx - r.enemy.x, x.tz - r.enemy.z) > 1.0);
        ok(far.length === 0, `[beam ${r.rar}] 착탄이 적 주변 1.0유닛 안 (이탈 ${far.length}/${r.shots.length})`);
        ok(r.shots[r.shots.length - 1].ti > r.shots[0].ti, `[beam ${r.rar}] 마지막 한 발이 굵다 (tier ${r.shots[0].ti} → ${r.shots[r.shots.length - 1].ti})`);
    }
    ok(arows[1].shots.length > arows[0].shots.length, `화살 등급 사다리 — ${arows.map(r => r.shots.length).join(' → ')}발`);

    // ================= 지중 습격 · 거대 아가리 (breath) =================
    // 여기서 '장면'의 증거는 넷: 발밑 예고가 아가리보다 먼저 뜨는가 · 아가리가 **땅속에서 위로**
    // 솟는가(y 가 음수에서 양수로) · 턱이 벌어졌다 **닫히는가**(각이 커졌다 작아진다) · 가라앉아 사라지는가.
    console.log('\n════ 지중 습격 · 거대 아가리 ════');
    const brow = await p.evaluate(async () => {
        Scene3D.clearEnemies();
        const e = { id: 7950, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
        Scene3D.anims = [];
        const m = Scene3D.enemyMap.get(e.id);
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        const def = SKILL_DEFS.find(s => s.fx === 'breath') || { rarity: 'legendary', fx: 'breath', color: '#ba68c8' };
        const tier = Scene3D.skillTier(def);
        const t0 = performance.now();
        const frames = [];
        Scene3D.skillEffect('breath', def.color, [e.id], def);
        const ep = m.g.position.clone();
        await new Promise(res => {
            const iv = setInterval(() => {
                Scene3D.update(1 / 60);
                let tell = 0, head = 0, y = null, jaw = null, dx = null;
                Scene3D.scene.traverse(o => {
                    if (!o.userData) return;
                    if (o.userData.mawTell) tell++;
                    if (o.userData.mawHead) {
                        head++; y = +o.position.y.toFixed(3);
                        dx = +Math.hypot(o.position.x - ep.x, o.position.z - ep.z).toFixed(2);
                        if (o.userData.jaw) jaw = +(o.userData.jaw.upper.rotation.z).toFixed(3);
                    }
                });
                frames.push({ t: performance.now() - t0, tell, head, y, jaw, dx });
                if (performance.now() - t0 > 2200) { clearInterval(iv); res(); }
            }, 16);
        });
        return { tier, frames, tellMs: Scene3D.MAW_TELL_MS };
    });
    {
        const f = brow.frames;
        const firstTell = (f.find(x => x.tell > 0) || {}).t;
        const firstHead = (f.find(x => x.head > 0) || {}).t;
        const ys = f.filter(x => x.y !== null).map(x => x.y);
        const jaws = f.filter(x => x.jaw !== null).map(x => x.jaw);
        const last = f[f.length - 1];
        console.log(`   발밑 예고 ${firstTell === undefined ? '없음' : firstTell.toFixed(0) + 'ms'} · 아가리 등장 ${firstHead === undefined ? '없음' : firstHead.toFixed(0) + 'ms'}`);
        console.log(`   아가리 y ${ys.length ? Math.min(...ys).toFixed(2) + ' → ' + Math.max(...ys).toFixed(2) + ' → ' + ys[ys.length - 1].toFixed(2) : 'n/a'}`);
        console.log(`   위턱 각 ${jaws.length ? Math.max(...jaws).toFixed(2) + ' ~ ' + Math.min(...jaws).toFixed(2) : 'n/a'}`);
        ok(firstTell !== undefined, `[breath] 발밑 예고(흙더미)가 뜬다`);
        ok(firstHead !== undefined && firstTell < firstHead, `[breath] 예고가 아가리보다 먼저다 (${firstTell === undefined ? 'n/a' : firstTell.toFixed(0)}ms < ${firstHead === undefined ? 'n/a' : firstHead.toFixed(0)}ms)`);
        ok(ys.length > 0 && Math.min(...ys) < 0, `[breath] 땅속에서 시작한다 (최저 y ${ys.length ? Math.min(...ys).toFixed(2) : 'n/a'} < 0)`);
        ok(ys.length > 0 && Math.max(...ys) > 0.3, `[breath] 지면 위로 솟는다 (최고 y ${ys.length ? Math.max(...ys).toFixed(2) : 'n/a'} > 0.3)`);
        // 턱: 벌어졌다(각의 절댓값 증가) 닫힌다(다시 감소)
        const openMax = jaws.length ? Math.min(...jaws) : 0;      // 더 젖혀질수록 값이 작아진다(-π/2 - open)
        const closedEnd = jaws.length ? Math.max(...jaws) : 0;
        ok(jaws.length > 3 && openMax < -1.9 && closedEnd > openMax + 0.3,
            `[breath] 턱이 벌어졌다 덥석 닫힌다 (${openMax.toFixed(2)} → ${closedEnd.toFixed(2)})`);
        const near = Math.max(0, ...f.filter(x => x.dx !== null).map(x => x.dx));
        ok(near < 1.5, `[breath] 적 자리에서 솟는다 (최대 거리 ${near.toFixed(2)} <1.5)`);
        ok(last.head === 0 && last.tell === 0, `[breath] 연출 뒤 잔존 0 (아가리 ${last.head} · 흙더미 ${last.tell})`);
    }

    // ================= 지원계 분화 (heal / aura) =================
    // 여기서 판정할 것은 '화려한가'가 아니라 **둘이 서로 다른 그림인가**다.
    // 핵심 축은 방향이다 — 회복은 위에서 내려오고(강림 원반의 y 가 **감소**), 버프는 아래에서
    // 올라온다(빛기둥 높이가 **증가**). 그리고 둘이 만드는 메시가 서로 달라야 한다.
    console.log('\n════ 지원계 분화 (heal / aura) ════');
    const sup = await p.evaluate(async () => {
        const run = async (fx) => {
            Scene3D.clearEnemies();
            const def = SKILL_DEFS.find(s => s.fx === fx) || { rarity: 'epic', fx, color: '#a5d6a7' };
            const tier = Scene3D.skillTier(def);
            const t0 = performance.now();
            const frames = [];
            Scene3D.skillEffect(fx, def.color, [], def);
            await new Promise(res => {
                const iv = setInterval(() => {
                    Scene3D.update(1 / 60);
                    let heal = 0, aura = 0, discY = null, pillarH = 0;
                    Scene3D.scene.traverse(o => {
                        if (!o.userData) return;
                        if (o.userData.healFx) { heal++; const d = o.children[0]; if (d) discY = +d.position.y.toFixed(3); }
                        if (o.userData.auraFx) {
                            aura++;
                            for (const c of o.children) if (c.userData && c.userData.h) pillarH = Math.max(pillarH, +c.scale.y.toFixed(3));
                        }
                    });
                    frames.push({ t: performance.now() - t0, heal, aura, discY, pillarH });
                    if (performance.now() - t0 > 1500) { clearInterval(iv); res(); }
                }, 16);
            });
            return { fx, tier, frames };
        };
        const h = await run('heal');
        const a = await run('aura');
        return { h, a };
    });
    {
        const hf = sup.h.frames, af = sup.a.frames;
        const discs = hf.filter(x => x.discY !== null).map(x => x.discY);
        const pills = af.map(x => x.pillarH).filter(x => x > 0);
        console.log(`   heal: 그룹 최대 ${Math.max(...hf.map(x => x.heal))} · 강림 원반 y ${discs.length ? discs[0].toFixed(2) + ' → ' + Math.min(...discs).toFixed(2) : 'n/a'}`);
        console.log(`   aura: 그룹 최대 ${Math.max(...af.map(x => x.aura))} · 빛기둥 높이 ${pills.length ? Math.min(...pills).toFixed(2) + ' → ' + Math.max(...pills).toFixed(2) : 'n/a'}`);
        ok(Math.max(...hf.map(x => x.heal)) > 0, `[heal] 전용 연출이 실재한다`);
        ok(Math.max(...af.map(x => x.aura)) > 0, `[aura] 전용 연출이 실재한다`);
        // 서로 다른 그림 — heal 은 aura 오브젝트를 만들지 않고, 그 반대도 마찬가지
        ok(Math.max(...hf.map(x => x.aura)) === 0 && Math.max(...af.map(x => x.heal)) === 0,
            `heal 과 aura 가 서로 다른 오브젝트를 만든다 (6종이 한 그림이던 것을 갈랐다)`);
        ok(discs.length > 2 && discs[0] - Math.min(...discs) > 0.5,
            `[heal] 위에서 **내려온다** (원반 y ${discs.length ? discs[0].toFixed(2) : 'n/a'} → ${discs.length ? Math.min(...discs).toFixed(2) : 'n/a'})`);
        ok(pills.length > 2 && Math.max(...pills) - Math.min(...pills) > 0.4,
            `[aura] 아래에서 **올라온다** (빛기둥 ${pills.length ? Math.min(...pills).toFixed(2) : 'n/a'} → ${pills.length ? Math.max(...pills).toFixed(2) : 'n/a'})`);
        ok(hf[hf.length - 1].heal === 0, `[heal] 연출 뒤 잔존 0`);
        ok(af[af.length - 1].aura === 0, `[aura] 연출 뒤 잔존 0`);
    }

    // ================= 회오리 (ring) =================
    // '회오리인가'의 증거는 하나다 — **돌고 있는가**. 층별 회전각이 실제로 변하는지, 그리고
    // 층마다 속도가 달라 회전이 눈에 걸리는지(같은 속도면 축대칭이라 정지한 것처럼 보인다).
    console.log('\n════ 회오리 ════');
    const vres = await p.evaluate(async () => {
        Scene3D.clearEnemies();
        const e = { id: 7990, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
        Scene3D.anims = [];
        Scene3D.enemyMap.get(e.id).g.position.set(e.x + Scene3D.worldX, 0, 0);
        const def = SKILL_DEFS.find(s => s.fx === 'ring') || { rarity: 'common', fx: 'ring', color: '#b0bec5' };
        const t0 = performance.now();
        const frames = [];
        Scene3D.skillEffect('ring', def.color, [e.id], def);
        await new Promise(res => {
            const iv = setInterval(() => {
                Scene3D.update(1 / 60);
                let vortex = 0, rots = [], sx = null;
                Scene3D.scene.traverse(o => {
                    if (o.userData && o.userData.vortexFx) {
                        vortex++; sx = +o.scale.x.toFixed(3);
                        for (const lg of o.children) if (lg.userData && lg.userData.w !== undefined) rots.push(+lg.rotation.y.toFixed(3));
                    }
                });
                frames.push({ t: performance.now() - t0, vortex, rots, sx });
                if (performance.now() - t0 > 1600) { clearInterval(iv); res(); }
            }, 16);
        });
        return { frames, tier: Scene3D.skillTier(def) };
    });
    {
        const f = vres.frames.filter(x => x.vortex > 0);
        const first = f[0], mid = f[Math.floor(f.length / 2)];
        console.log(`   회오리 프레임 ${f.length}개 · 배율 ${first ? first.sx : 'n/a'} → ${Math.max(...f.map(x => x.sx || 0)).toFixed(3)}`);
        console.log(`   층별 회전각 첫 ${first ? JSON.stringify(first.rots) : 'n/a'} → 중간 ${mid ? JSON.stringify(mid.rots) : 'n/a'}`);
        ok(f.length > 5, `[ring] 회오리가 실재한다 (${f.length}프레임 — 예전엔 도는 물건이 0개)`);
        // 돈다: 층 회전각이 실제로 변한다
        const spun = first && mid && first.rots.some((r, i) => Math.abs(mid.rots[i] - r) > 0.3);
        ok(spun, `[ring] 실제로 돈다 (층 회전각이 변한다)`);
        // 층마다 다르게 돈다: 중간 프레임에서 층별 각이 서로 다르다
        const distinct = mid && new Set(mid.rots.map(r => r.toFixed(2))).size === mid.rots.length;
        ok(distinct, `[ring] 층마다 각속도가 다르다 (${mid ? mid.rots.join(' / ') : 'n/a'} — 같으면 축대칭이라 정지해 보인다)`);
        ok(Math.max(...f.map(x => x.sx || 0)) > (first ? first.sx : 0) + 0.4, `[ring] 바깥으로 퍼진다 (배율 증가)`);
        ok(vres.frames[vres.frames.length - 1].vortex === 0, `[ring] 연출 뒤 잔존 0`);
    }

    // ================= 화염 폭풍 (explode) =================
    // '화염구'의 최소 조건은 **날아가는 불덩이가 있는가**다(예전엔 적 발밑에서 그냥 터졌다).
    // 그리고 터진 뒤 불이 **바깥으로 퍼지는가** — 불기둥이 여러 파로 나뉘어 솟아야 한다.
    console.log('\n════ 화염 폭풍 ════');
    const fres = await p.evaluate(async () => {
        Scene3D.clearEnemies();
        const e = { id: 7995, x: Combat.MELEE_X, alive: true, hp: Big.of(1e9), maxHp: Big.of(1e9) };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} }
        Scene3D.anims = [];
        const m = Scene3D.enemyMap.get(e.id);
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        const def = SKILL_DEFS.find(s => s.fx === 'explode' && s.rarity === 'ultimate') || SKILL_DEFS.find(s => s.fx === 'explode');
        const t0 = performance.now();
        const frames = [], pillars = [];
        const origFP = Scene3D.firePillar.bind(Scene3D);
        Scene3D.firePillar = (pos, col, ti) => { pillars.push({ t: performance.now() - t0, r: +Math.hypot(pos.x - m.g.position.x, pos.z - m.g.position.z).toFixed(2) }); return origFP(pos, col, ti); };
        Scene3D.skillEffect('explode', def.color, [e.id], def);
        await new Promise(res => {
            const iv = setInterval(() => {
                Scene3D.update(1 / 60);
                let ball = 0, bx = null;
                Scene3D.scene.traverse(o => { if (o.userData && o.userData.fireBall) { ball++; bx = +o.position.x.toFixed(2); } });
                frames.push({ t: performance.now() - t0, ball, bx });
                if (performance.now() - t0 > 2200) { clearInterval(iv); res(); }
            }, 16);
        });
        Scene3D.firePillar = origFP;
        return { frames, pillars, hero: +Scene3D.heroG.position.x.toFixed(2), enemy: +m.g.position.x.toFixed(2) };
    });
    {
        const bf = fres.frames.filter(x => x.ball > 0);
        const xs = bf.map(x => x.bx);
        console.log(`   불덩이 ${bf.length}프레임 · x ${xs.length ? xs[0] + ' → ' + xs[xs.length - 1] : 'n/a'} (영웅 ${fres.hero} → 적 ${fres.enemy})`);
        console.log(`   불기둥 ${fres.pillars.length}개 · 반경 ${fres.pillars.length ? Math.min(...fres.pillars.map(x => x.r)).toFixed(2) + ' ~ ' + Math.max(...fres.pillars.map(x => x.r)).toFixed(2) : 'n/a'}`);
        ok(bf.length > 3, `[explode] 날아가는 불덩이가 있다 (${bf.length}프레임 — 예전엔 발밑에서 그냥 터졌다)`);
        ok(xs.length > 1 && Math.abs(xs[xs.length - 1] - fres.enemy) < Math.abs(xs[0] - fres.enemy),
            `[explode] 불덩이가 영웅에게서 적으로 간다`);
        ok(fres.pillars.length >= 6, `[explode] 불기둥이 여러 개 솟는다 (${fres.pillars.length}개)`);
        const rs = fres.pillars.map(x => x.r);
        ok(rs.length > 0 && Math.max(...rs) - Math.min(...rs) > 0.6,
            `[explode] 불이 **바깥으로** 퍼진다 (기둥 반경 ${Math.min(...rs).toFixed(2)} → ${Math.max(...rs).toFixed(2)})`);
        // 파(wave)로 나뉜다 — 기둥 생성 시각이 뭉치지 않고 여러 덩이로
        const ts = fres.pillars.map(x => Math.round(x.t / 50));
        ok(new Set(ts).size >= 3, `[explode] 여러 파로 나뉘어 솟는다 (시각 군집 ${new Set(ts).size}개 ≥3)`);
        ok(fres.frames[fres.frames.length - 1].ball === 0, `[explode] 연출 뒤 불덩이 잔존 0`);
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
