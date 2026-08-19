// 펫 관절 리그가 실제로 움직이는가 (사용자 지시 2026-08-19 `pet-articulated-joints` 검증 도구)
//
// 사용자 지적: "펫들도 관절 다 움직이게 해주고."
// 고친 방식: 파츠를 관절 피벗(Group) 아래에 달고 `makePetMesh` 가 `userData.joints` 로 넘긴다.
//            `Scene3D.update` 의 제너릭 드라이버가 종별 위상·주파수로 그 피벗을 돌린다.
//            같이 고친 결함: `refreshPets` 가 `mesh.userData` 를 래퍼 그룹으로 안 올려서
//            기존 파츠 애니(wings/tail/claws/sting/heads/tails)가 **한 프레임도 안 돌던** 것.
//
// 이 도구가 재는 것 —
//   ① 25종 전부 관절이 2개 이상 심겼는가 (통짜 펫이 하나도 안 남았는가)
//   ② 관절이 **월드 좌표에서 실제로 움직이는가** — 몸통 전체의 바운스를 뺀 '상대 변위'로 잰다
//      (그룹을 통째로 흔드는 것과 관절이 도는 것을 구분해야 한다. 안 그러면 예전 통짜 펫도 통과한다)
//   ③ 이동 중(walking)에 진폭이 대기보다 커지는가 (gain 이 실제로 걸리는가)
//   ④ 발끝이 모델 바닥(y≈0) 아래로 뚫고 내려가지 않는가 (다리를 새로 단 종의 접지)
//   ⑤ 파츠 핸들(joints/wings/tail/...)이 래퍼 그룹까지 올라오는가
//   ⑥ 콘솔 에러 0건
//
// ⚠️ 함정 ③(TODO 상단): 헤드리스 swiftshader 에서는 rAF 가 사실상 안 돈다. 그래서 시간은
//    `Scene3D.update(1/60)` 를 **손으로** 흘려서 만든다. 백로그가 좌표를 덮어쓰지 않게
//    한 번의 evaluate 안에서 재고, 측정 전에 `Scene3D.anims.length = 0` 으로 큐를 비운다.
//
// 사용: node probe-pet-joints.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const WEB = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await page.goto('file://' + path.join(WEB, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene);
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
        const names = Object.keys(PET_COLORS);
        const out = { build: [], move: [], handles: null };

        // ---- ① 관절 수 + ④ 발끝 접지 ----
        for (const name of names) {
            const m = Scene3D.makePetMesh(name);
            m.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(m);
            out.build.push({ name, joints: (m.userData.joints || []).length, minY: box.min.y, maxY: box.max.y });
        }

        // ---- ②③⑤ 전장에 실제로 세워 놓고 움직이는지 ----
        // 25종을 한 번에 출전시켜 전수로 잰다(활성 펫 상한은 배치용이라 여기서는 직접 채운다).
        S.pets = names.map(n => ({ name: n, rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }));
        S.activePets = names.map((_, i) => i);
        Scene3D.refreshPets();
        Scene3D.anims.length = 0;                 // 함정 ③: 밀린 연출이 좌표를 덮어쓰지 않게

        const pg0 = Scene3D.petGroups[0];
        out.handles = {
            groups: Scene3D.petGroups.length,
            withJoints: Scene3D.petGroups.filter(p => (p.userData.joints || []).length).length,
            sampleKeys: Object.keys(pg0.userData).sort(),
        };

        // 관절 하위 메시의 월드 좌표를 모아 '몸통 기준 상대 위치'로 바꾼다.
        // (그룹 전체 바운스를 빼야 '관절이 돈 것'만 남는다 — 통짜 펫이 헛통과하는 걸 막는 핵심)
        const sample = (pg) => {
            const pts = [];
            const org = new THREE.Vector3();
            pg.getWorldPosition(org);
            for (const j of (pg.userData.joints || [])) {
                const w = new THREE.Vector3();
                j.o.updateMatrixWorld(true);
                // 피벗 자체는 제자리라 회전이 안 드러난다 — 피벗의 로컬 -Y 끝점을 본다
                w.set(0, -0.1, 0).applyMatrix4(j.o.matrixWorld);
                pts.push(w.sub(org));
            }
            return pts;
        };
        const spread = (walking) => {
            Scene3D.walking = walking;
            const per = names.map(() => ({ mn: [], mx: [] }));
            for (let f = 0; f < 90; f++) {
                Scene3D.update(1 / 60);
                Scene3D.petGroups.forEach((pg, i) => {
                    const pts = sample(pg);
                    pts.forEach((p, k) => {
                        const a = per[i].mn[k], b = per[i].mx[k];
                        per[i].mn[k] = a ? a.min(p) : p.clone();
                        per[i].mx[k] = b ? b.max(p) : p.clone();
                    });
                });
            }
            // 관절별 이동폭을 그대로 돌려준다(종별 최대만 보면 등속 회전 관절 하나가 다 가린다)
            return per.map(r => r.mn.map((mn, k) => mn.distanceTo(r.mx[k])));
        };
        const idle = spread(false);
        const walk = spread(true);

        // ---- ⑦ 화면 px 가시성 (재오픈 2026-08-19: 월드 이동폭만 보면 '눈에 정지'를 놓친다) ----
        // 월드 지표는 25종 PASS 였는데 사용자는 "관절 안 움직이는 거 아직 있음" — 실측하니
        // Snail ≤1px·Treant ≤1.4px·Scorpion 다리 ≤1.4px 등 화면에서는 정지였다(눕힌 다리의
        // x 회전이 깊이축으로 사라지는 함정 포함). 그래서 **실게임 카메라로 투영한 px** 을 게이트로 잰다.
        // 3마리씩 실전 배치로 세워 카메라 거리·스케일을 실제와 맞춘다(25마리 동시는 바깥 호로 밀린다).
        const canvas = Scene3D.renderer.domElement;
        const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
        const toPx = (v) => { const p = v.clone().project(Scene3D.camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H }; };
        out.px = [];
        for (let base = 0; base < names.length; base += 3) {
            const batch = names.slice(base, base + 3);
            S.pets = batch.map(n => ({ name: n, rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }));
            S.activePets = batch.map((_, i) => i);
            Scene3D.refreshPets();
            Scene3D.anims.length = 0;
            Scene3D.walking = false;
            const per = Scene3D.petGroups.map(pg => (pg.userData.joints || []).map(() => ({ mnx: 1e9, mny: 1e9, mxx: -1e9, mxy: -1e9 })));
            for (let f = 0; f < 150; f++) {           // 대기 2.5초 — 느린 종도 한 사이클을 채운다
                Scene3D.update(1 / 60);
                Scene3D.petGroups.forEach((pg, i) => {
                    const org = new THREE.Vector3();
                    pg.getWorldPosition(org);
                    const opx = toPx(org);            // 몸통 원점 px — 그룹 바운스를 화면에서도 뺀다
                    (pg.userData.joints || []).forEach((j, k) => {
                        j.o.updateMatrixWorld(true);
                        const p = toPx(new THREE.Vector3(0, -0.1, 0).applyMatrix4(j.o.matrixWorld));
                        const r = per[i][k];
                        r.mnx = Math.min(r.mnx, p.x - opx.x); r.mxx = Math.max(r.mxx, p.x - opx.x);
                        r.mny = Math.min(r.mny, p.y - opx.y); r.mxy = Math.max(r.mxy, p.y - opx.y);
                    });
                });
            }
            Scene3D.petGroups.forEach((pg, i) => {
                const spans = per[i].map(r => Math.hypot(r.mxx - r.mnx, r.mxy - r.mny));
                out.px.push({
                    name: pg.userData.name,
                    max: +Math.max(...spans).toFixed(1),
                    frozenRatio: +(spans.filter(s => s < 1.5).length / spans.length).toFixed(2),
                });
            });
        }
        // idle = 그 종에서 가장 크게 움직인 관절, growth = **관절별로 재서** 가장 많이 늘어난 폭.
        // ⚠️ growth 를 '종별 최대끼리 빼기'로 재면 안 된다 — Electry 의 등속 회전 코일처럼
        //    gain 을 안 받는 관절이 최대를 차지하면 다리·날개가 커져도 차이가 0으로 보인다.
        out.move = names.map((n, i) => ({
            name: n,
            idle: Math.max(...idle[i]),
            walk: Math.max(...walk[i]),
            growth: Math.max(...idle[i].map((v, k) => walk[i][k] - v)),
        }));
        return out;
    });

    let fail = 0;
    const bad = (m) => { fail++; console.log('  FAIL ' + m); };

    console.log('① 관절 수 / ④ 발끝 접지');
    for (const b of res.build) {
        if (b.joints < 2) bad(`${b.name}: 관절 ${b.joints}개 (통짜)`);
        if (b.minY < -0.035) bad(`${b.name}: 발끝이 바닥 아래 ${b.minY.toFixed(3)}`);
    }
    console.log(`  종 ${res.build.length}개 · 관절 최소 ${Math.min(...res.build.map(b => b.joints))}개 · `
        + `최대 ${Math.max(...res.build.map(b => b.joints))}개 · 최저점 ${Math.min(...res.build.map(b => b.minY)).toFixed(3)}`);

    console.log('⑤ 파츠 핸들 전파');
    console.log('  ' + JSON.stringify(res.handles));
    if (res.handles.withJoints !== res.handles.groups) bad(`래퍼 그룹 ${res.handles.groups}개 중 관절이 올라온 건 ${res.handles.withJoints}개뿐`);

    console.log('②③ 관절 이동폭 (몸통 상대, 90프레임)');
    for (const m of res.move) {
        const tag = m.idle < 0.008 ? ' ← 정지' : m.growth < 0.004 ? ' ← 이동 가산 없음' : '';
        console.log(`  ${m.name.padEnd(15)} idle ${m.idle.toFixed(4)}  walk ${m.walk.toFixed(4)}  Δ최대 ${m.growth.toFixed(4)}${tag}`);
        if (m.idle < 0.008) bad(`${m.name}: 대기 중 관절이 사실상 안 움직임 (${m.idle.toFixed(4)})`);
        if (m.growth < 0.004) bad(`${m.name}: 이동 중 진폭이 커지는 관절이 없음 (Δ최대 ${m.growth.toFixed(4)})`);
    }

    console.log('⑦ 화면 px 가시성 (실게임 카메라, 대기 2.5초, 몸통 상대)');
    for (const m of res.px) {
        const tag = m.max < 3 ? ' ← 눈에 정지' : m.frozenRatio > 0.6 ? ' ← 관절 다수 정지' : '';
        console.log(`  ${m.name.padEnd(15)} max ${String(m.max).padStart(5)}px  <1.5px 비율 ${Math.round(m.frozenRatio * 100)}%${tag}`);
        if (m.max < 3) bad(`${m.name}: 대기 중 화면 이동폭 최대 ${m.max}px — 육안 정지 (하한 3px)`);
        if (m.frozenRatio > 0.6) bad(`${m.name}: 관절 ${Math.round(m.frozenRatio * 100)}% 가 화면 1.5px 미만`);
    }

    console.log('⑥ 콘솔 에러: ' + errors.length);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
    if (errors.length) fail += errors.length;

    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: 전건 PASS');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
