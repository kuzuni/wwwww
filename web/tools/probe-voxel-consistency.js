// **조형이 정말로 voxel 로 읽히는지**를 카테고리별로 전수로 재는 감사기 (`voxel-consistency-audit`).
//
// 왜 이 자가 필요한가 (🔴 최우선 항목 `voxel 느낌이 안 산다` 의 마지막 줄이 시킨 것):
//   사용자가 **세 번** 같은 지적을 했다 — "장비가 여전히 네모 느낌이 아니다", "복셀 너무 작고
//   촘촘해서 복셀 안 같음", "스킬이랑 장비가 아직 voxel 아닌 거 같더라". 그런데 그 항목 본문이
//   *"착수 세션이 실게임에서 먼저 현 상태(큐브인가 곡면인가)를 확인할 것"* 이라고만 적어 둬서,
//   **세션마다 눈으로 다시 확인하고 매번 다른 결론을 내고 있었다.** 그래서 슬러그별로 흩어진
//   재작업(`equip-voxelize`·`mount-species-recognizable`·`pet-species-recognizable`·`skill-fx`)이
//   **어디까지 됐는지 아무도 숫자로 모른다.** 이 자는 그 숫자를 준다.
//
// 무엇을 재는가 — `probe-prop-voxel` 의 술어를 **그대로** 쓴다(같은 자를 카테고리만 넓힌 것):
//   **축정렬 법선 비율** = 삼각형 법선이 ±x/±y/±z 인 면의 비율. 이게 voxel 판정의 기계적 정의다.
//   🚨 **"매끈해 보이나"로 재지 않는 이유**가 `probe-prop-voxel` 머리말에 이미 적혀 있다 — 장비가
//   화풍 정합 2/10 을 받은 건 '매끈해서'가 아니라 **면이 축정렬이 아니어서**였다. 비스듬한 삼각형이
//   하나라도 보이면 그 순간 voxel 로 안 읽힌다. 눈 판정은 비평가 채점에서 매번 뒤집혔다.
//   ⚠️ 법선은 **월드 기준이 아니라 로컬 기준**으로 잰다 — 조형을 기울여 배치한 것(발가락 토스프링,
//      뱅킹한 탈것)까지 '곡면'으로 세면 조형이 아니라 **배치**를 재게 된다. 우리가 묻는 건
//      "이 덩어리가 큐브 적층인가"지 "지금 똑바로 놓였나"가 아니다.
//
// 무엇을 **안** 재는가 (한계를 먼저 못 박는다 — 이 숫자를 과신하지 말 것):
//   ⓐ **칸 크기**는 안 본다. 사용자 지적의 절반은 *"큐브가 너무 작고 촘촘해서"* 인데, 축정렬 비율은
//      칸이 아무리 잘아도 100% 가 나온다. 즉 **이 자가 100% 라도 '복셀로 안 보인다'가 성립한다.**
//      칸 크기 축은 별도 자가 필요하다(아래 📌).
//   ⓑ **스킬 이펙트**는 안 잰다 — 발동 순간에만 존재하는 파티클/스프라이트라 빌더를 정지 상태로
//      부를 수가 없다. `skill-fx` 계열은 연속 프레임 캡처로 따로 봐야 한다.
//
// 판정: 기본은 **감사(리포트)** 라 항상 exit 0 이다. 카테고리가 실제로 전환된 뒤 그 슬러그가
//   `VOXCON_MIN=<비율>` 로 게이트를 걸 수 있다(예: `VOXCON_MIN=99 node probe-voxel-consistency.js`
//   → 축정렬 99% 미만인 항목이 하나라도 있으면 exit 1). 🚨 **전환이 끝나기 전에 `regress.sh` 에
//   등재하지 말 것** — 지금은 대부분이 빨간 게 정상이고, 등재하면 회귀 목록이 통째로 빨개져
//   **진짜 회귀를 가린다**(이 저장소가 이미 겪은 사고다).
// 사용: node probe-voxel-consistency.js  [카테고리]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const ONLY = process.argv[2] || '';
const MIN = process.env.VOXCON_MIN ? parseFloat(process.env.VOXCON_MIN) : null;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1200);

    const rows = await page.evaluate((only) => {
        // 한 오브젝트의 축정렬 법선 비율 — **로컬 기준**(위 ⚠️). 면적 가중이라 큰 곡면이 제대로 무겁다.
        const ratio = (root) => {
            let axis = 0, total = 0, meshes = 0;
            root.traverse(o => {
                if (!o.isMesh || !o.geometry) return;
                for (let p = o; p; p = p.parent) if (p.visible === false) return;
                const g = o.geometry, pos = g.attributes && g.attributes.position;
                if (!pos) return;
                meshes++;
                const idx = g.index ? g.index.array : null;
                const n = idx ? idx.length : pos.count;
                const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
                const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nr = new THREE.Vector3();
                for (let i = 0; i + 2 < n; i += 3) {
                    const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
                    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
                    // 면적 가중: 외적 길이가 곧 2×면적이라 따로 정규화하기 전에 크기를 챙긴다.
                    ab.subVectors(b, a); ac.subVectors(c, a); nr.crossVectors(ab, ac);
                    const area = nr.length();
                    if (area < 1e-12) continue;               // 퇴화 삼각형은 방향이 없다
                    nr.divideScalar(area);
                    const ax = Math.abs(nr.x), ay = Math.abs(nr.y), az = Math.abs(nr.z);
                    const mx = Math.max(ax, ay, az), sum = ax + ay + az;
                    // 축정렬이면 한 축만 1이고 나머지는 0 → (합 − 최대) 가 0 에 가깝다.
                    if (sum - mx < 1e-3) axis += area;
                    total += area;
                }
            });
            return { pct: total ? axis / total * 100 : 100, meshes };
        };
        const out = [];
        const add = (cat, name, root) => {
            if (!root) { out.push({ cat, name, pct: null, meshes: 0 }); return; }
            const r = ratio(root);
            out.push({ cat, name, pct: r.pct, meshes: r.meshes });
        };
        const want = c => !only || c === only;

        // 🔬 **양성 대조군 — 프롭.** 이 카테고리는 이미 전환이 끝났고 `probe-prop-voxel`(별도 게이트)이
        //    '전부 축정렬 큐브 조형'으로 PASS 시키고 있다. 그러니 **여기서도 100% 가 나와야** 이 자의
        //    술어가 이미 합의된 자와 같은 것을 재고 있다는 뜻이다. 100% 가 아니면 **아래 숫자들을
        //    믿지 말고 이 자부터 의심할 것.**
        if (want('프롭')) {
            for (const [fn, args] of [['makePine', [1]], ['makeRoundTree', [1]], ['makeDeadTree', [1]],
                                      ['makeCactus', [1]], ['makeBoulder', [1]], ['makeMushroom', [1]]])
                if (Scene3D[fn]) add('프롭(대조군)', fn, Scene3D[fn].apply(Scene3D, args));
        }

        if (want('영웅')) add('영웅', '영웅 리그(현재 장착 상태)', Scene3D.heroG);

        if (want('탈것')) {
            for (const nm of Object.keys(Scene3D.MOUNT_FORM_OF || {}))
                add('탈것', nm, Scene3D.makeMountMesh(nm, 'epic'));
            // MOUNT_FORM_OF 에 없는 종은 전부 quad 기본값이라 로스터에서 몇 종만 더 집는다.
            for (const nm of ['Brown Horse', 'Pony', 'Turtle', 'Crab'])
                if (!(Scene3D.MOUNT_FORM_OF || {})[nm]) add('탈것', nm, Scene3D.makeMountMesh(nm, 'epic'));
        }
        if (want('펫')) {
            const pets = Object.keys(typeof PET_KR !== 'undefined' ? PET_KR : {});
            for (const nm of pets) add('펫', nm, Scene3D.makePetMesh(nm));
        }
        if (want('장비')) {
            // 무기 — 시대(등급) 성장 배율이 조형을 안 바꾸므로 중간 시대 하나로 전수.
            const W = (typeof WEAPON_TYPES !== 'undefined' && WEAPON_TYPES) ? WEAPON_TYPES : null;
            const ids = W ? (Array.isArray(W) ? W.map(w => w.id || w) : Object.keys(W)) : [];
            for (const id of ids) add('장비', '무기 ' + id, Scene3D.makeWeapon(id, 3, 'epic'));
            for (const st of ['plate', 'visor', 'mask', 'tech', 'cone', 'plume'])
                add('장비', '투구 ' + st, Scene3D.makeHelmet(3, 'epic', st, st));
            for (const st of ['plate', 'scale', 'robe'])
                add('장비', '갑옷 ' + st, Scene3D.makeArmorPreview(3, 'epic', st, st));
        }
        return out;
    }, ONLY);

    const fmt = r => r.pct === null ? '  (빌더 없음)' : `${r.pct.toFixed(1).padStart(6)}%  (메시 ${r.meshes})`;
    const cats = [...new Set(rows.map(r => r.cat))];
    console.log('축정렬 법선 비율 — 100% = 완전한 큐브 적층 · 낮을수록 곡면 프리미티브가 남아 있다\n');
    let worst = [];
    for (const c of cats) {
        const rs = rows.filter(r => r.cat === c && r.pct !== null);
        if (!rs.length) { console.log(`■ ${c}: 측정 대상 없음`); continue; }
        const avg = rs.reduce((a, r) => a + r.pct, 0) / rs.length;
        const full = rs.filter(r => r.pct >= 99.9).length;
        console.log(`■ ${c}  평균 ${avg.toFixed(1)}%  ·  완전 축정렬 ${full}/${rs.length}종`);
        for (const r of rs.slice().sort((a, b) => a.pct - b.pct).slice(0, 6))
            console.log(`     ${r.pct >= 99.9 ? '✅' : '🔶'} ${r.name.padEnd(26)} ${fmt(r)}`);
        if (rs.length > 6) console.log(`     … 그 외 ${rs.length - 6}종`);
        worst = worst.concat(rs.filter(r => MIN !== null && r.pct < MIN));
    }
    console.log('\n※ 이 자는 **칸 크기를 안 본다** — 100% 여도 칸이 잘면 "복셀로 안 보인다"가 그대로 성립한다(머리말 ⓐ).');
    console.log('※ 스킬 이펙트는 정지 상태로 못 부른다 — 연속 프레임 캡처로 따로 볼 것(머리말 ⓑ).');
    if (MIN !== null) {
        console.log(`\n게이트 VOXCON_MIN=${MIN}% → ${worst.length ? 'FAIL ' + worst.length + '종 미달' : 'PASS'}`);
    } else {
        console.log('\n(감사 모드 — 게이트를 걸려면 VOXCON_MIN=<비율> 을 주고 돌린다)');
    }
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(MIN !== null && worst.length ? 1 : 0);
})();
