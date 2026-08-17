// 영웅 사망/기상 연출 회귀 검증 — 사용: node test-herodeath.js  (종료코드 0=전체 통과)
// 핵심 회귀: Death 클립을 걸어도 **다음 프레임 update의 Idle 자동 전환이 덮어써서** 영웅이 그냥 서 있던 버그.
// once 클립은 play()에서 R.state를 ''로 두므로 루프 중복 방지 가드에 안 걸리고 매 프레임 다시 깔린다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await p.waitForTimeout(1200);

    const out = await p.evaluate(() => {
        const res = [];
        const ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {}; Scene3D.update = () => {}; Scene3D.renderFrame = () => {};
        // 사망 구간은 벽시계(U.now)로 재므로, 틱만 돌리면 시간이 흐르지 않아 기상이 영원히 안 온다.
        // 스텝과 같은 양만큼 가상 시계도 함께 밀어 준다 — 실제 플레이에서 흐르는 시간을 그대로 흉내낸다.
        const realNow = U.now;
        let vt = Date.now();
        U.now = () => vt;
        const step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { vt += 1000 / 120; realTick(1 / 120); realUpdate(1 / 120); }
        };
        const rig = Scene3D.heroRig;
        const pose = () => ({
            rootRx: +rig.root.rotation.x.toFixed(3), rootRz: +rig.root.rotation.z.toFixed(3),
            rootPy: +rig.root.position.y.toFixed(3), clip: rig._clip && rig._clip.dur,
        });

        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.phase = 'fight';
        const upright = pose();
        Scene3D.heroG.updateWorldMatrix(true, true);
        const sb = new THREE.Box3().setFromObject(rig.group);
        const standH = +(sb.max.y - sb.min.y).toFixed(3);   // 기립 높이 — 누운 뒤 납작해졌는지 비교 기준
        Combat.hero.hp = Big.of(1);
        Combat.damageHero(Big.of(999999));      // → onDefeat → heroDown

        ok(Scene3D.heroDead === true, '사망 플래그 설정됨');
        ok(Combat.phase === 'stageDelay', `사망 후 스테이지 딜레이 (phase=${Combat.phase})`);

        // 사망 클립 재생 — 한 프레임 뒤에도 Idle이 덮어쓰지 않아야 한다(이 회귀가 이 항목의 본체)
        step(1 / 60);
        const oneFrame = rig._clip;
        step(1.45); // 클립 길이만큼
        const fallen = pose();
        ok(oneFrame === rig._clip || Scene3D.heroDead, '사망 클립이 다음 프레임에 교체되지 않음');
        // ⚠️ '어느 축으로 넘어졌는가'로 판정하면 연출을 옆으로 바꾸는 순간 거짓 실패가 난다 —
        //    축과 무관한 사실만 본다: **몸의 상하축이 수평에 가까운가**(=누웠는가).
        const bodyUp = (() => {
            const a = rig.bones.spine.getWorldPosition(new THREE.Vector3());
            const b2 = rig.bones.neck.getWorldPosition(new THREE.Vector3());
            return +b2.sub(a).normalize().y.toFixed(3);   // 1=완전 기립, 0=완전 수평
        })();
        ok(bodyUp < 0.4, `쓰러진 포즈 — 몸이 눕는다 (몸통 상하축의 수직성분 ${bodyUp}, 기립≈1)`);
        // ⚠️ 예전 판정은 'root.py가 내려갔는가'였는데 그건 **틀린 기준**이었다 — root 피벗이 발바닥이라
        //    다 눕고 나면 root는 오히려 올라간다. 그 기준을 맞추려고 몸을 지하 0.78까지 처박은 게
        //    "공중에 뜬 채 젖혀져 보인다"는 사용자 재지적의 원인이었다. 진짜 조건은 **접지**다:
        //    리그의 최저 정점이 지면(y=0)에 닿아 있고, 서 있을 때보다 납작해야(누웠어야) 한다.
        const lie = (() => {
            if (rig.capeMesh) rig.capeMesh.geometry.boundingBox = null;   // 망토는 정점이 매 프레임 바뀐다 — 캐시 무효화 필수
            Scene3D.heroG.updateWorldMatrix(true, true);
            const b = new THREE.Box3().setFromObject(rig.group);
            return {
                min: +(b.min.y - Scene3D.heroG.position.y).toFixed(3), h: +(b.max.y - b.min.y).toFixed(3),
                span: +Math.max(b.max.x - b.min.x, b.max.z - b.min.z).toFixed(3),
            };
        })();
        ok(Math.abs(lie.min) < 0.06, `쓰러진 몸이 지면에 닿는다 (최저 정점 y=${lie.min}, 허용 ±0.06)`);
        ok(lie.h < standH * 0.68, `쓰러진 포즈 — 납작해졌다 (높이 ${lie.h} < 기립 ${standH} 의 68%)`);
        ok(lie.span > 1.2, `쓰러진 몸이 바닥에 길게 뻗는다 (수평 최대폭 ${lie.span})`);

        // 포즈 유지: 클립이 끝난 뒤에도 누운 채로 있어야 한다
        const wx0 = Scene3D.worldX;
        Scene3D.walking = true;             // 행군 신호가 와도 시체가 미끄러져 가면 안 된다
        step(0.8);
        const held = pose();
        ok(Math.abs(held.rootRz - fallen.rootRz) < 0.02 && Math.abs(held.rootPy - fallen.rootPy) < 0.02,
            `클립 종료 후에도 누운 포즈 유지 (rz ${fallen.rootRz}→${held.rootRz})`);
        ok(Math.abs(Scene3D.worldX - wx0) < 1e-6, `사망 중 행군 정지 (Δ월드=${(Scene3D.worldX - wx0).toFixed(4)})`);
        // onDefeat이 재도전용으로 hp를 즉시 만피로 되돌리므로, 안 숨기면 시체 위에 가득 찬 초록 바가 뜬다
        ok(Scene3D.heroHpG.visible === false, '사망 중 머리 위 HP바 숨김');

        // 기상: 예약된 pending(2.4초)이 돌면서 Revive → 다시 기립
        step(1.2);
        ok(Scene3D.heroDead === false, '기상 시 사망 플래그 해제');
        ok(Scene3D.heroHpG.visible === true, '기상 시 HP바 복귀');
        const mid = pose();
        ok(mid.rootRz < fallen.rootRz, `기상 전환 중 몸이 세워진다 (rz ${fallen.rootRz}→${mid.rootRz})`);
        step(1.2);
        const back = pose();
        ok(Math.abs(back.rootRx - upright.rootRx) < 0.12 && Math.abs(back.rootRz - upright.rootRz) < 0.12
            && Math.abs(back.rootPy - upright.rootPy) < 0.06,
            `기상 완료 — 기립 포즈 복귀 (rx=${back.rootRx}/rz=${back.rootRz}/py=${back.rootPy}, 기준 ${upright.rootRx}/${upright.rootRz}/${upright.rootPy})`);
        // 시체용으로 늘렸던 접지 그림자가 기상 후 발밑 원형으로 돌아왔는가 (안 돌아오면 산 영웅이 시체 그림자를 끌고 다닌다)
        ok(Math.abs(Scene3D.heroBlob.scale.x - 0.82) < 0.03 && Math.abs(Scene3D.heroBlob.position.x) < 0.03,
            `기상 후 접지 그림자 복구 (scale.x=${Scene3D.heroBlob.scale.x.toFixed(2)}, x=${Scene3D.heroBlob.position.x.toFixed(2)})`);
        // 행군 게이트만 격리해서 확인 — step()은 Combat.tick도 돌리는데, 이 시점엔 이미 다음 웨이브가
        // 시작돼 walking이 정상적으로 false가 된다(적이 살아 있으면 행군 안 함). 그건 사망과 무관하다.
        Scene3D.heroDead = false; Scene3D._heroReviveT = 0; Scene3D._attacking = false;
        Scene3D.walking = true;
        const wx1 = Scene3D.worldX;
        for (let i = 0; i < 60; i++) realUpdate(1 / 120);
        ok(Scene3D.worldX > wx1, `기상 후 행군 재개 (Δ월드=${(Scene3D.worldX - wx1).toFixed(3)})`);

        // 사망 상태로 스테이지가 시작되지 않는다 (던전 입장 등으로 기상 예약이 지워진 경우 대비)
        Scene3D.heroDead = true;
        Combat.setupStage();
        ok(Scene3D.heroDead === false, 'setupStage가 사망 상태를 방어적으로 해제');
        return res;
    });

    out.forEach(l => console.log(l));
    console.log(errors.length ? 'FAIL 콘솔 에러: ' + errors.join(' | ') : 'PASS 콘솔 에러 0건');
    await b.close();
    process.exit(out.some(l => l.startsWith('FAIL')) || errors.length ? 1 : 0);
})();
