// 근접 앵글에서 허벅지를 **무엇이 가리는가** — 탈것 몸통인가, 영웅 자신의 스커트인가.
// 사용: node probe-ride-thigh.js [탈것이름]      (기본 Brown Horse)
// 왜 필요한가: 비평가 2인이 "근접 3/4에서 허벅지가 사라진다"고 했는데 `probe-ride-clear`는 자기
//   카메라에서 가림 0%를 냈다. 둘 다 맞을 수 있다(카메라가 다르다) — 그래서 **shot-ride-pets 의
//   near 앵글과 같은 카메라**를 세우고, 카메라→허벅지 레이가 처음 만나는 물체의 소속을 찍는다.
//   가리는 게 스커트면 처방은 고관절 각이 아니라 스커트(라이딩용 분할·밑단 축소)다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Brown Horse';
// --sweep = 라이딩 스커트 옆 틈(중심각·반폭) 조합을 한 브라우저 세션에서 훑는다.
// ⚠️ 각을 눈대중으로 올리면 앞판이 필요 이상으로 얇아진다(실루엣이 무너진다) — **근쪽 가림 0을
//    내는 조합 중 틈이 가장 좁은 것**을 실측으로 고르라고 만든 모드다.
const SWEEP = process.argv.includes('--sweep');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const combos = SWEEP ? [] : [null];
    if (SWEEP) for (const c of [1.00, 1.10, 1.20, 1.30, 1.40]) for (const h of [0.40, 0.52, 0.64, 0.76]) combos.push([c, h]);

    const all = await page.evaluate(({ name, combos }) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;

    const measureOnce = () => {
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const rig = Scene3D.heroRig, hero = Scene3D.heroG;
        hero.updateWorldMatrix(true, true);
        // shot-ride-pets 의 near 앵글과 같은 카메라: __camera(0, 3.4, 1.7, 0.95)
        const hx = hero.position.x, hy = hero.position.y;
        const cam = new THREE.Vector3(hx, hy + 1.7, 3.4);
        const seat = new Set((rig.seatParts || []).map(m => m.uuid));
        // 뼈 uuid → 뼈 이름. 'hero(다른 파츠)' 로 뭉뚱그리면 **정작 뭘 고쳐야 하는지 안 나온다** —
        // 첫 실행에서 근쪽 다리 5점이 통째로 이 라벨에 묶여 범인을 못 찍었다. 가장 가까운 조상 뼈
        // 이름 + 지오메트리 타입까지 붙여 '어느 파츠가' 가리는지 바로 읽히게 한다.
        const boneName = new Map();
        for (const [k, b] of Object.entries(rig.bones || {})) if (b && b.uuid) boneName.set(b.uuid, k);
        const boneOf = (obj) => {
            for (let o = obj; o; o = o.parent) if (boneName.has(o.uuid)) return boneName.get(o.uuid);
            return '';
        };
        const detail = (obj) => {
            const geo = obj.geometry && obj.geometry.type ? obj.geometry.type.replace('Geometry', '') : '?';
            return `${boneOf(obj) || '?'}/${geo}`;
        };
        // 소속 판정: 영웅 리그 밑이면 hero, 그중 스커트 파츠면 skirt, 탈것 밑이면 mount.
        // ⚠️ **자기 다리에 의한 자기가림을 반드시 따로 뺀다** — 검사점은 뼈 축(=메시 속)이라 대퇴 장갑·
        //    무릎 폴린이 항상 앞에 있다. 이걸 결함에 섞으면 지표가 절대 0이 안 돼 판정이 무의미해진다
        //    (앞 세션이 '14/14 가림'이라고 읽은 수치의 5점이 이것 + 유령 히트였다).
        const owner = (obj, side) => {
            const b = boneOf(obj);
            if (b === 'hip' + side || b === 'knee' + side) return 'self(자기 다리)';
            for (let o = obj; o; o = o.parent) {
                if (seat.has(o.uuid)) return 'skirt(영웅 스커트)';
                if (o === Scene3D.mountGroup) return 'mount(탈것)';
                if (o === hero) return 'hero(영웅 다른 파츠) ' + detail(obj);
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
                // ⚠️ three r128 의 Raycaster 는 **조상의 visible 을 보지 않는다** — 자식만 켜져 있으면
                //    부모 그룹이 꺼져 있어도 히트가 잡힌다. `h.object.visible` 만 걸렀더니 렌더되지도
                //    않는 **레거시 블롭 영웅의 방패**(armL 하위, armL.visible=false)가 근쪽 다리 5점을
                //    통째로 가리는 것으로 잡혀 '영웅 다른 파츠 5'라는 유령 수치를 냈다. 조상까지 훑는다.
                const shown = o => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
                // 자기 다리 히트는 **가림이 아니라 그 다리 표면이 보이는 것**이다 — 빼고 나서 남는
                // 첫 히트가 진짜 범인이다.
                const hits = ray.intersectObjects([hero, Scene3D.mountGroup], true)
                    .filter(h => h.distance < dist - 0.02 && shown(h.object))
                    .map(h => ({ h, by: owner(h.object, side) }))
                    .filter(x => x.by !== 'self(자기 다리)');
                rows.push({ lbl, near: side === 'L', blocked: hits.length > 0, by: hits.length ? hits[0].by : '-', gap: hits.length ? +(dist - hits[0].h.distance).toFixed(3) : 0 });
            }
        }
        return rows;
    };

        return combos.map(c => {
            if (c) Scene3D.RIDE_SKIRT = { gapCenter: c[0], gapHalf: c[1] };
            return { c, rows: measureOnce() };
        });
    }, { name: NAME, combos });

    if (SWEEP) {
        console.log(`[${NAME}] 라이딩 스커트 옆 틈 스윕 — 중심각 c / 반폭 h (rad), 근쪽 스커트 가림이 판정값\n`);
        console.log('   c     h    판정구간가림 그중스커트  먼쪽가림   앞판폭(°)');
        const ok = [];
        for (const { c, rows } of all) {
            // 판정 구간은 본 판정과 같다 — 고관절 바로 아래(thighL1)는 태싯이 덮는 게 정상이라 뺀다.
            const leg = rows.filter(r => r.near && r.lbl !== 'thighL1');
            const nb = leg.filter(r => r.blocked).length;
            const ns = leg.filter(r => r.by.startsWith('skirt')).length;
            const fb = rows.filter(r => !r.near && r.blocked).length;
            const front = (2 * (c[0] - c[1]) * 180 / Math.PI).toFixed(0);
            console.log(`  ${c[0].toFixed(2)}  ${c[1].toFixed(2)}     ${nb}/7       ${ns}        ${fb}/7      ${front}`);
            if (nb === 0) ok.push({ c, front: +front });
        }
        // 앞판이 넓을수록 실루엣이 덜 무너진다 — 통과 조합 중 **앞판이 가장 넓은 것**을 고른다
        ok.sort((a, b) => b.front - a.front);
        console.log(ok.length
            ? `\n→ 판정구간 가림 0 인 조합 ${ok.length}개. 그중 앞판이 가장 넓은 것 = c ${ok[0].c[0]} / h ${ok[0].c[1]} (앞판 ${ok[0].front}°)`
            : '\n→ 통과 조합 없음 — 틈만으로는 부족하다(밑단 축소·고관절 굴곡 병행 필요)');
        console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
        await browser.close();
        return;
    }
    const out = all[0].rows;

    console.log(`[${NAME}] near 앵글(카메라 = shot-ride-pets 의 ride-*-near)에서 다리 각 점을 가리는 물체\n`);
    const tally = {};
    for (const r of out) {
        if (r.blocked) tally[r.by] = (tally[r.by] || 0) + 1;
        console.log(`  ${r.lbl.padEnd(9)} ${r.blocked ? '가림 ← ' + r.by + ` (앞으로 ${r.gap})` : '보임'}`);
    }
    const total = out.length, blocked = out.filter(r => r.blocked).length;
    console.log(`\n가려진 점 ${blocked}/${total}` + (blocked ? ' — 범인별: ' + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' / ') : ''));
    // ⚠️ 읽는 법 — **판정에 쓰는 값은 근쪽(L) 다리의 스커트 가림**이다.
    //    ⑴ 자기 다리 자기가림은 위에서 이미 뺐다(빼지 않으면 지표가 절대 0이 안 된다).
    //    ⑵ **먼 쪽(R) 다리는 실제 승마 사진에서도 몸통·안장에 가린다 — 0을 목표로 잡으면 안 된다**
    //       (앞 세션이 그렇게 읽고 헛물을 켰다). 근쪽 다리가 보이면 '올라타 있다'로 읽힌다.
    //    ⑶ **`thighL1`(고관절 바로 아래 0.064)은 판정에서 뺀다.** 태싯(골반 장갑)이 고관절을 덮는 것은
    //       갑주로서 정상이고, 스커트를 6장으로 가른 뒤로는 어떤 틈 각도 조합으로도 이 한 점이 안 열린다
    //       (`--sweep` 20조합 전부 1점 잔존 — 태싯 상단은 반경 0.19로 모여 있어 틈이 닿지 않는 자리다).
    //       이 점까지 0을 요구하면 지표가 영원히 FAIL 이라 판정으로서 쓸모가 없다.
    const nearRows = out.filter(r => r.near);
    const nearSkirt = nearRows.filter(r => r.by.startsWith('skirt')).length;
    const nearBlocked = nearRows.filter(r => r.blocked).length;
    const legRows = nearRows.filter(r => r.lbl !== 'thighL1');     // 고관절 점 제외 = 실제 다리 구간
    const legSkirt = legRows.filter(r => r.by.startsWith('skirt')).length;
    const legBlocked = legRows.filter(r => r.blocked).length;
    console.log(`   → 근쪽(L) 다리 가림 ${nearBlocked}/7 (그중 스커트 ${nearSkirt}) · 먼쪽(R) 가림 ${blocked - nearBlocked}/7 (참고값, 0 목표 아님)`);
    console.log(`   → **판정 구간(고관절 점 제외, 대퇴 중하단~발 6점): 가림 ${legBlocked}/6 · 그중 스커트 ${legSkirt}**`);
    console.log(`   → 판정: ${legBlocked === 0 ? 'PASS' : 'FAIL'}`
        + (legSkirt ? ` — 스커트가 ${legSkirt}점 덮는다(틈 각도 재조정)` : '')
        + (legBlocked - legSkirt ? ` — 탈것 몸통이 ${legBlocked - legSkirt}점 덮는다(배럴이 다리보다 넓다 → RIDE_WIDTH_RATIO)` : ''));
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
