// 사망 접지 실측 — "죽으면 공중에 뜬 채로 있다"(사용자 재지적)를 눈대중이 아니라 좌표로 확인한다.
// 사용: node probe-death-ground.js
// 재는 것: 사망 클립 진행(t=0→1)마다 ① 리그 전체 바운딩박스 최저 world Y(=지면 y와의 간격)
//          ② 골반/머리/양 부츠의 world Y ③ 몸통 기울기. 지면은 heroG.position.y 평면(발바닥 기준면).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.walking = false;
        const rig = Scene3D.heroRig;
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const rows = [];
        // 지면 기준면 = 영웅 그룹의 y (마칭 중에도 발바닥이 놓이는 평면)
        const groundY = Scene3D.heroG.position.y;

        const sample = (label, t) => {
            // ⚠️ R._t는 **초 단위**(update가 _t/dur로 정규화한다) — 정규화 t를 그대로 넣으면 안 된다
            rig._clip = ProChar.CLIPS.Death; rig._once = true; rig._t = t * ProChar.CLIPS.Death.dur; rig._onDone = null;
            ProChar.update(rig, 0);           // dt=0 → _t 유지한 채 포즈만 다시 계산
            // ⚠️ 망토는 매 프레임 정점을 바꾸는데 three는 geometry.boundingBox를 캐시한다 —
            //    비우지 않으면 Box3.setFromObject가 **옛 모양**을 재서 접지 수치가 통째로 거짓이 된다.
            if (rig.capeMesh) rig.capeMesh.geometry.boundingBox = null;
            Scene3D.heroG.updateWorldMatrix(true, true);
            const bb = new THREE.Box3().setFromObject(rig.group);
            const wp = (b, v) => b.localToWorld(v.clone());
            const pelvis = wp(rig.bones.pelvis, V(0, 0, 0));
            const head = wp(rig.bones.neck, V(0, 0.28, 0));
            const footL = wp(rig.bones.kneeL, V(0, -0.315, 0.045));
            const footR = wp(rig.bones.kneeR, V(0, -0.315, 0.045));
            rows.push({
                label, t: +t.toFixed(2),
                minY: +(bb.min.y - groundY).toFixed(3),   // 0이면 지면 접촉, +면 떠 있음
                maxY: +(bb.max.y - groundY).toFixed(3),
                pelvisY: +(pelvis.y - groundY).toFixed(3),
                headY: +(head.y - groundY).toFixed(3),
                footLY: +(footL.y - groundY).toFixed(3),
                footRY: +(footR.y - groundY).toFixed(3),
                depthZ: +(bb.max.z - bb.min.z).toFixed(3),
                heightY: +(bb.max.y - bb.min.y).toFixed(3),
                // 손은 world x로 재면 영웅 yaw 때문에 실행마다 값이 달라진다 — root 로컬로 잰다
                handLx: +rig.root.worldToLocal(wp(rig.bones.elbowL, V(0, -0.26, 0))).x.toFixed(3),
                handRx: +rig.root.worldToLocal(wp(rig.bones.elbowR, V(0, -0.26, 0))).x.toFixed(3),
                capeMinY: rig.capeMesh ? +(new THREE.Box3().setFromObject(rig.capeMesh).min.y - groundY).toFixed(3) : null,
                pelvisMinY: +(new THREE.Box3().setFromObject(rig.bones.pelvis).min.y - groundY).toFixed(3),
            });
        };
        // 기준: 서 있는 Idle 포즈
        rig._clip = ProChar.CLIPS.Idle; rig._once = false; rig._t = 0;
        ProChar.update(rig, 0);
        Scene3D.heroG.updateWorldMatrix(true, true);
        const sb = new THREE.Box3().setFromObject(rig.group);
        const standing = {
            minY: +(sb.min.y - groundY).toFixed(3),
            maxY: +(sb.max.y - groundY).toFixed(3),
            heightY: +(sb.max.y - sb.min.y).toFixed(3),
        };
        for (const t of [0, 0.15, 0.3, 0.38, 0.5, 0.6, 0.68, 0.72, 0.76, 0.8, 0.84, 0.88, 0.94, 1]) sample('death', t);
        // 최종 프레임에서 '가장 깊이 박힌 메시' 상위 목록 — 접지 보정값을 무엇이 지배하는지 특정한다
        rig._clip = ProChar.CLIPS.Death; rig._once = true; rig._t = ProChar.CLIPS.Death.dur;
        ProChar.update(rig, 0);
        if (rig.capeMesh) rig.capeMesh.geometry.boundingBox = null;
        Scene3D.heroG.updateWorldMatrix(true, true);
        const deep = [];
        const boneOf = (o) => { for (const k in rig.bones) if (rig.bones[k] === o) return k; return null; };
        rig.group.traverse(o => {
            if (!o.isMesh) return;
            const b = new THREE.Box3().setFromObject(o);
            let p = o, chain = [];
            while (p && chain.length < 4) { const n = boneOf(p); if (n) chain.push(n); p = p.parent; }
            deep.push({ y: +(b.min.y - groundY).toFixed(3), geo: o.geometry.type, bone: chain[0] || '?', cape: o === rig.capeMesh });
        });
        deep.sort((a, b) => a.y - b.y);
        const high = deep.slice().sort((a, b) => b.y - a.y).slice(0, 4).map(o => ({ ...o, y: null, top: null }));
        const tops = deep.slice().sort((a, b) => b.y - a.y).slice(0, 4);
        // Revive 시작 포즈가 Death 끝 포즈와 이어지는가
        rig._clip = ProChar.CLIPS.Revive; rig._once = true; rig._t = 0;
        ProChar.update(rig, 0); rig._t = 0;
        if (rig.capeMesh) rig.capeMesh.geometry.boundingBox = null;
        Scene3D.heroG.updateWorldMatrix(true, true);
        const rb = new THREE.Box3().setFromObject(rig.group);
        const reviveStart = {
            minY: +(rb.min.y - groundY).toFixed(3),
            maxY: +(rb.max.y - groundY).toFixed(3),
        };
        return { groundY: +groundY.toFixed(3), standing, rows, reviveStart, deep: deep.slice(0, 6), tops };
    });

    console.log('groundY(heroG.y):', out.groundY);
    console.log('서 있을 때:', JSON.stringify(out.standing));
    console.table(out.rows);
    console.log('Revive 시작 포즈:', JSON.stringify(out.reviveStart),
        '| Death 끝과의 minY 차:', (out.reviveStart.minY - out.rows[out.rows.length - 1].minY).toFixed(3));
    console.log('최종 프레임 최심부 메시:'); console.table(out.deep);
    console.log('최종 프레임 최상단 메시(누웠는데 솟은 것 찾기):'); console.table(out.tops);
    console.log('errors:', errors.length, errors.slice(0, 3));
    await browser.close();
})();
