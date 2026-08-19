// 탑승 중 공격 반동·버팀 실측(㉱⑵) — 공격(once) 클립 중 하체가 idle 그대로 굳어 있지 않은가.
// rideBrace()가 클립 위상 10~80% 구간에서 spine/hip/knee 에 가산 버팀을 넣고, 클립이 끝나면
// 정확히 0으로 복귀하는지를 계열별로 잰다.
// 판정(계열별): ① hipz 편차 ≥ 0.015 — **버팀의 순수 서명**(공격 클립은 hip.rz 를 전혀 안 건드려
//                 수정 전 실측이 4계열 전부 정확히 0이었다. spine/knee 는 클립 자체 모션이 섞여
//                 수정 전에도 0.36/0.08 이 나온다 — 그걸 게이트로 걸면 옛 코드도 통과한다, 실측으로 확인)
//              ② 앉는 계열(quad/wheeled/fly)은 무릎 편차 ≥ 0.15(수정 전 0.08 — 클립 몫 위로 확실히)
//              ③ 공격이 끝난 뒤 세 채널 모두 대기값으로 복귀(|Δ| ≤ 0.02) ④ 콘솔/페이지 에러 0
// ⚠️ 이 프로브군은 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
// 사용: node probe-ride-brace.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOUNTS = [['quad', 'Brown Horse'], ['wheeled', 'Bike'], ['flat', 'Hover Board'], ['fly', 'Mini Dragon']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 180000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((list) => {
        Combat.tick = () => { };
        const res = [];
        const read = () => {
            const B = Scene3D.heroRig.bones;
            return { spine: B.spine.rotation.x, kneeL: B.kneeL.rotation.x, kneeR: B.kneeR.rotation.x, hipLz: B.hipL.rotation.z };
        };
        // 대기 판독은 Idle 위상을 t=0 으로 스냅하고 잰다 — 안 그러면 대기 호흡(spine ±0.026)의
        // 위상 차가 '버팀 잔량'으로 찍힌다(probe-collar 가 박아 둔 함정 그대로).
        const readIdle = () => {
            const R = Scene3D.heroRig;
            R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._idleT = 0;
            ProChar.update(R, 0);
            return read();
        };
        for (const [form, name] of list) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
            const idle = readIdle();
            // 공격을 실제 전투 경로로 태운다(heroPlay 만으로는 _attacking 이 안 서서 Idle 로 되돌아간다 —
            // probe-ride-hands 가 밟은 함정, probe-ride-rein 과 같은 셋업).
            Scene3D.clearEnemies();
            const e = { id: 952, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(952);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            m.g.userData.landed = true;
            Combat.phase = 'fight';
            Scene3D.heroAttack(952);
            // 클립 중간 구간(once 인 프레임들)에서 최대 편차를 잡는다
            let peakSpine = 0, peakKnee = 0, peakHip = 0, sawOnce = false;
            for (let i = 0; i < 40; i++) {
                Scene3D.update(1 / 60);
                const rig = Scene3D.heroRig;
                if (rig._once && rig._clip && !rig._clip.groundPose) {
                    sawOnce = true;
                    const cur = read();
                    peakSpine = Math.max(peakSpine, cur.spine - idle.spine);
                    peakKnee = Math.max(peakKnee, Math.abs(cur.kneeL - idle.kneeL), Math.abs(cur.kneeR - idle.kneeR));
                    peakHip = Math.max(peakHip, Math.abs(cur.hipLz - idle.hipLz));
                }
            }
            // 클립 종료 후 복귀 — once 가 풀릴 때까지 돌리고 잰다
            for (let i = 0; i < 120 && (Scene3D.heroRig._once || Scene3D._attacking); i++) Scene3D.update(1 / 60);
            for (let i = 0; i < 10; i++) Scene3D.update(1 / 60);
            const after = readIdle();
            Scene3D.clearEnemies(); Combat.enemies = [];
            res.push({
                form, name, sawOnce,
                peakSpine: +peakSpine.toFixed(3), peakKnee: +peakKnee.toFixed(3), peakHip: +peakHip.toFixed(3),
                dSpine: +(after.spine - idle.spine).toFixed(3),
                dKnee: +Math.max(Math.abs(after.kneeL - idle.kneeL), Math.abs(after.kneeR - idle.kneeR)).toFixed(3),
                dHip: +(after.hipLz - idle.hipLz).toFixed(3),
            });
        }
        return res;
    }, MOUNTS);

    let fail = 0;
    console.log('탑승 공격 버팀 실측 — 계열 | once 관측 | 피크(spine/knee/hipz) | 종료 후 잔량(spine/knee/hipz)\n');
    for (const r of out) {
        const ok = r.sawOnce && r.peakHip >= 0.015 && (r.form === 'flat' || r.peakKnee >= 0.15)
            && Math.abs(r.dSpine) <= 0.02 && r.dKnee <= 0.02 && Math.abs(r.dHip) <= 0.02;
        if (!ok) fail++;
        console.log(`  ${ok ? '✅' : '❌'} ${r.form.padEnd(7)} ${r.name.padEnd(12)} once=${r.sawOnce} 피크 ${r.peakSpine}/${r.peakKnee}/${r.peakHip} 잔량 ${r.dSpine}/${r.dKnee}/${r.dHip}`);
    }
    if (errs.length) { fail++; console.log('페이지 에러:', errs.slice(0, 3)); }
    console.log(fail ? '미통과 있음' : '전부 통과');
    await browser.close();
})();
