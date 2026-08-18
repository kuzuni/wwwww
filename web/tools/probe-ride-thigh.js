// 근접 앵글에서 허벅지를 **무엇이 가리는가** — 탈것 몸통인가, 영웅 자신의 스커트인가.
// 사용: node probe-ride-thigh.js [탈것이름]      (기본 Brown Horse)
// 왜 필요한가: 비평가 2인이 "근접 3/4에서 허벅지가 사라진다"고 했는데 `probe-ride-clear`는 자기
//   카메라에서 가림 0%를 냈다. 둘 다 맞을 수 있다(카메라가 다르다) — 그래서 **shot-ride-pets 의
//   near 앵글과 같은 카메라**를 세우고, 카메라→허벅지 레이가 처음 만나는 물체의 소속을 찍는다.
//   가리는 게 스커트면 처방은 고관절 각이 아니라 스커트(라이딩용 분할·밑단 축소)다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Brown Horse';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((name) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const rig = Scene3D.heroRig, hero = Scene3D.heroG;
        hero.updateWorldMatrix(true, true);
        // shot-ride-pets 의 near 앵글과 같은 카메라: __camera(0, 3.4, 1.7, 0.95)
        const hx = hero.position.x, hy = hero.position.y;
        const cam = new THREE.Vector3(hx, hy + 1.7, 3.4);
        const seat = new Set((rig.seatParts || []).map(m => m.uuid));
        // 소속 판정: 영웅 리그 밑이면 hero, 그중 스커트 파츠면 skirt, 탈것 밑이면 mount
        const owner = (obj) => {
            for (let o = obj; o; o = o.parent) {
                if (seat.has(o.uuid)) return 'skirt(영웅 스커트)';
                if (o === Scene3D.mountGroup) return 'mount(탈것)';
                if (o === hero) return 'hero(영웅 다른 파츠)';
            }
            return 'other';
        };
        const ray = new THREE.Raycaster();
        const rows = [];
        for (const side of ['L', 'R']) {
            const hip = rig.bones['hip' + side], knee = rig.bones['knee' + side];
            // 대퇴를 5등분한 점 + 무릎 + 발
            const pts = [];
            for (let i = 1; i <= 5; i++) pts.push(['thigh' + side + i, hip, new THREE.Vector3(0, -0.32 * i / 5, 0)]);
            pts.push(['knee' + side, knee, new THREE.Vector3(0, 0, 0)]);
            pts.push(['foot' + side, knee, new THREE.Vector3(0, -0.315, 0.045)]);
            for (const [lbl, bone, off] of pts) {
                const wp = bone.localToWorld(off.clone());
                const dir = wp.clone().sub(cam);
                const dist = dir.length();
                ray.set(cam, dir.normalize());
                // ⚠️ 씬 전체를 쏘면 스프라이트류에서 three r128 내부가 터진다(matrixWorld null) —
                //    어차피 관심은 '영웅이 가리나 탈것이 가리나'뿐이므로 두 그룹만 대상으로 한다.
                const hits = ray.intersectObjects([hero, Scene3D.mountGroup], true)
                    .filter(h => h.distance < dist - 0.02 && h.object.visible);
                rows.push({ lbl, blocked: hits.length > 0, by: hits.length ? owner(hits[0].object) : '-', gap: hits.length ? +(dist - hits[0].distance).toFixed(3) : 0 });
            }
        }
        return rows;
    }, NAME);

    console.log(`[${NAME}] near 앵글(카메라 = shot-ride-pets 의 ride-*-near)에서 다리 각 점을 가리는 물체\n`);
    const tally = {};
    for (const r of out) {
        if (r.blocked) tally[r.by] = (tally[r.by] || 0) + 1;
        console.log(`  ${r.lbl.padEnd(9)} ${r.blocked ? '가림 ← ' + r.by + ` (앞으로 ${r.gap})` : '보임'}`);
    }
    const total = out.length, blocked = out.filter(r => r.blocked).length;
    console.log(`\n가려진 점 ${blocked}/${total}` + (blocked ? ' — 범인별: ' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' / ') : ''));
    // ⚠️ 읽는 법: 검사점은 **뼈 축 위**라 다리 자신의 메시 안에 들어 있다 — 그래서 'hero(영웅 다른 파츠)'에는
    //    자기 다리에 의한 자기가림이 섞인다(가림 거리가 0.3 이상이면 대개 그것). 판정에 쓸 값은
    //    **skirt 대 mount 의 비**다: skirt 가 크면 처방은 고관절 각이 아니라 스커트(라이딩용 분할·밑단 축소)다.
    console.log(`   → 스커트 ${tally['skirt(영웅 스커트)'] || 0} : 탈것 ${tally['mount(탈것)'] || 0}`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
