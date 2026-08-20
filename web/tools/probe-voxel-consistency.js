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
//   ② **최장축 칸 수** = 그 덩어리가 큐브 **몇 개로** 깎였나. 사용자 지적의 나머지 절반이
//      *"큐브가 너무 작고 촘촘해서 복셀 안 같음"* 인데 **축정렬 비율은 칸이 아무리 잘아도 100%** 라
//      그 축을 전혀 못 잡는다(= ① 이 100% 여도 '복셀로 안 보인다'가 성립한다. 펫이 정확히 그 경우다).
//      격자 피치를 지오메트리에서 역산해서(좌표 이웃 간격의 **중앙값**) 바운딩박스를 나눈다.
//      🚨 **축정렬 99% 이상일 때만 인쇄한다.** 격자가 없는 곡면 조형은 이 값이 격자 피치가 아니라
//      **곡면 분할 간격**이라 영웅 2860칸·게 1089칸 같은 **허수**가 나오고, 그걸 그대로 두면
//      "칸이 잘다"로 오독된다 — 격자가 없는 것이지 칸이 잔 게 아니다. 그래서 n/a 로 비운다.
//      📏 **참고 대역**: 이미 합격한 **프롭이 11~22칸**. 펫은 **26~35칸**으로 그 2~3배다.
//
// 무엇을 **안** 재는가 (한계를 먼저 못 박는다 — 이 숫자를 과신하지 말 것):
//   ⓑ **스킬 이펙트**는 안 잰다 — 발동 순간에만 존재하는 파티클/스프라이트라 빌더를 정지 상태로
//      부를 수가 없다. `skill-fx` 계열은 연속 프레임 캡처로 따로 봐야 한다.
//   ⓒ **화면에서의 크기**는 안 본다 — 칸 수는 로컬 기준이라 그룹 스케일이 안 들어간다. 같은 20칸도
//      멀리 놓이면 잘아 보인다. '화면에서 큐브가 몇 픽셀인가'는 캡처로 따로 볼 것.
//
// 판정: 기본은 **감사(리포트)** 라 항상 exit 0 이다. 카테고리가 실제로 전환된 뒤 그 슬러그가
//   `VOXCON_MIN=<비율>` 로 게이트를 걸 수 있다(예: `VOXCON_MIN=99 node probe-voxel-consistency.js`
//   → 축정렬 99% 미만인 항목이 하나라도 있으면 exit 1). 🚨 **전환이 끝나기 전에 `regress.sh` 에
//   등재하지 말 것** — 지금은 대부분이 빨간 게 정상이고, 등재하면 회귀 목록이 통째로 빨개져
//   **진짜 회귀를 가린다**(이 저장소가 이미 겪은 사고다).
//   🎯 **굵기 게이트 `VOXCON_MAXCELLS=<칸>` (2026-08-20 사용자 지시 — "촘촘하면 FAIL나게").**
//   반복 지적("네모가 아니다")의 진짜 원인이 **축정렬 여부만 검사하고 큐브 크기를 안 재는 것**이었다 —
//   큐브를 잘게 썰어 촘촘하게 쌓으면 축정렬 100% 인데도 실루엣이 매끈해 voxel 로 안 읽힌다.
//   이 게이트는 **최장축 칸 수가 상한을 넘으면(=너무 잘면) FAIL** 낸다. 격자가 성립한(축정렬 99%↑)
//   항목에만 적용한다 — 격자 없는 곡면은 칸 수 자체가 허수라 이 축이 아니라 MIN 축이 잡는다.
//   📏 상한 고르기: 이미 합격한 프롭이 11~22칸이니 **22** 부터가 기준 대역이다. 사용자 목표
//   "파츠 한 변에 큐브 최대 6~10개"는 파츠 기준이라 엔티티 전체(최장축)로는 대략 2~3파츠 × 8칸 ≈ 22.
// 사용: node probe-voxel-consistency.js  [카테고리]
//       VOXCON_MIN=99 VOXCON_MAXCELLS=22 node probe-voxel-consistency.js 펫   (양축 게이트)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const ONLY = process.argv[2] || '';
const MIN = process.env.VOXCON_MIN ? parseFloat(process.env.VOXCON_MIN) : null;
const MAXCELLS = process.env.VOXCON_MAXCELLS ? parseFloat(process.env.VOXCON_MAXCELLS) : null;

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
        // **칸 굵기 축** — 사용자 지적의 나머지 절반("큐브가 너무 작고 촘촘해서 복셀 안 같음").
        //   격자 피치를 지오메트리에서 **역산**한다: 축마다 서로 다른 좌표값을 모아 정렬하고
        //   **이웃 간 간격의 중앙값**을 피치로 본다. 그 피치로 바운딩박스를 나누면 **"이 덩어리가
        //   큐브 몇 개짜리인가"** 가 나온다 — 이게 '촘촘함'의 직접 지표다.
        //   ⚠️ **최소 간격이 아니라 중앙값**을 쓴다. `Voxel.build` 는 칸마다 ±5% 크기 지터를 주고
        //      (`jitter`), 베벨·서브칸 장식이 아주 작은 간격을 만든다 — 최소값을 쓰면 그 잡음이
        //      피치가 돼 칸 수가 몇 배로 부풀어 오른다. 중앙값은 그 꼬리에 안 끌린다.
        //   ⚠️ 로컬 기준이라 그룹 스케일(예: `headG.scale` 1.3)은 안 들어간다 — 우리가 묻는 건
        //      "칸 몇 개로 깎았나"지 "화면에서 몇 픽셀인가"가 아니다.
        //   ⚠️ **메시별로 잰 뒤 최대를 취한다(2026-08-20 수리).** 종전엔 전 메시 좌표를 한 집합에
        //      병합해 피치를 구했는데, 클러스터 조형(예: 버섯 본체 + 0.3~0.55배 곁 개체)은 메시마다
        //      격자 피치가 달라 **작은 피치 × 전체 bbox = 허수**가 났다(버섯이 56칸으로 인쇄 — 실제
        //      각 개체는 ~14칸). 파츠(메시)마다 자기 피치·자기 스팬으로 재면 이 함정이 없고,
        //      사용자 지시("**파츠당** 복셀 개수 상한")와도 정합이다. 단일 격자 조형(펫·단일 프롭)은
        //      메시가 하나라 값이 종전과 같다 — 기록된 참고 대역(프롭 11~22 · 펫 26~35)은 유효하다.
        const cellsAcross = (root) => {
            let best = null;
            root.traverse(o => {
                if (!o.isMesh || !o.geometry) return;
                for (let p = o; p; p = p.parent) if (p.visible === false) return;
                const pos = o.geometry.attributes && o.geometry.attributes.position;
                if (!pos) return;
                const vals = [new Set(), new Set(), new Set()];
                const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i < pos.count; i++) {
                    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
                    for (let a = 0; a < 3; a++) {
                        vals[a].add(Math.round(v[a] * 1e4) / 1e4);
                        if (v[a] < lo[a]) lo[a] = v[a];
                        if (v[a] > hi[a]) hi[a] = v[a];
                    }
                }
                for (let a = 0; a < 3; a++) {
                    const s = [...vals[a]].sort((x, y) => x - y);
                    if (s.length < 3) continue;
                    const gaps = [];
                    for (let i = 1; i < s.length; i++) { const g = s[i] - s[i - 1]; if (g > 1e-5) gaps.push(g); }
                    if (!gaps.length) continue;
                    gaps.sort((x, y) => x - y);
                    const pitch = gaps[Math.floor(gaps.length / 2)];
                    const span = hi[a] - lo[a];
                    if (pitch > 1e-5 && span > 0) {
                        const n = span / pitch;
                        if (!best || n > best.cells) best = { cells: n, pitch };   // 가장 잘게 깎인 파츠의 최장축
                    }
                }
            });
            return best;
        };
        const out = [];
        const add = (cat, name, root) => {
            if (!root) { out.push({ cat, name, pct: null, meshes: 0 }); return; }
            const r = ratio(root), ca = cellsAcross(root);
            // 🚨 **칸 수는 축정렬이 성립할 때만 의미가 있다.** 곡면 조형은 좌표가 사실상 연속이라
            //    '이웃 간격의 중앙값'이 격자 피치가 아니라 **곡면 분할 간격**이 된다 — 그대로 인쇄하면
            //    영웅 2860칸·게 1089칸 같은 **허수**가 나와 "칸이 잘다"로 오독된다. 격자가 없는 것이지
            //    칸이 잔 게 아니다. 그래서 축정렬 99% 미만이면 칸 수를 **아예 안 준다**.
            out.push({ cat, name, pct: r.pct, meshes: r.meshes, cells: (ca && r.pct >= 99) ? ca.cells : null });
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

        // 적 7종 — 엔티티 분할 ②(TODO 2444)인데 이 감사에 카테고리가 빠져 있어 숫자가 없었다(2026-08-20 추가).
        //   kind 는 (id + 챕터×2) % 7 로 정해지므로 id 0..6 을 돌리면 순서만 다를 뿐 7종 전수가 된다.
        //   ⚠️ monsterMesh 는 HP 바(Plane 2장)까지 g 에 달아 주지만 평면도 축정렬 법선이라 비율을 안 흐린다.
        if (want('적')) {
            for (let i = 0; i < 7; i++) {
                const rec = Scene3D.monsterMesh({ id: i });
                add('적', rec.kind, rec.g);
            }
        }

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

    const fmt = r => r.pct === null ? '  (빌더 없음)'
        : `${r.pct.toFixed(1).padStart(6)}%  · 최장축 ${r.cells === null ? '  n/a' : r.cells.toFixed(0).padStart(4) + '칸'}  (메시 ${r.meshes})`;
    const cats = [...new Set(rows.map(r => r.cat))];
    console.log('축정렬 법선 비율 — 100% = 완전한 큐브 적층 · 낮을수록 곡면 프리미티브가 남아 있다\n');
    let worst = [], tooFine = [];
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
        // 굵기 축 — 격자가 성립한 항목이 상한보다 잘게 깎였으면 '촘촘=매끈'이라 FAIL 후보.
        tooFine = tooFine.concat(rs.filter(r => MAXCELLS !== null && r.cells !== null && r.cells > MAXCELLS));
    }
    console.log('\n※ 최장축 칸 수 = 그 덩어리가 큐브 몇 개로 깎였나(촘촘함 지표). **축정렬 99% 이상일 때만** 준다 —');
    console.log('   격자가 없는 조형은 이 값이 격자 피치가 아니라 곡면 분할 간격이라 허수가 된다(n/a 로 비운다).');
    console.log('   📏 참고 대역: 이미 합격한 **프롭이 11~22칸**. 펫은 26~35칸으로 그 2~3배라 "너무 잘다"는 지적과 맞는다.');
    console.log('※ 스킬 이펙트는 정지 상태로 못 부른다 — 연속 프레임 캡처로 따로 볼 것(머리말 ⓑ).');
    if (MIN !== null) {
        console.log(`\n게이트 VOXCON_MIN=${MIN}% → ${worst.length ? 'FAIL ' + worst.length + '종 미달' : 'PASS'}`);
    }
    if (MAXCELLS !== null) {
        console.log(`게이트 VOXCON_MAXCELLS=${MAXCELLS}칸(굵기) → ${tooFine.length ? 'FAIL ' + tooFine.length + '종이 너무 잘다(촘촘=매끈)' : 'PASS'}`);
        for (const r of tooFine) console.log(`   ⬆ ${r.cat} ${r.name}: 최장축 ${r.cells.toFixed(0)}칸 > ${MAXCELLS} — 격자 해상도를 낮춰 큐브를 굵힐 것`);
    }
    if (MIN === null && MAXCELLS === null) {
        console.log('\n(감사 모드 — 게이트는 VOXCON_MIN=<비율> · VOXCON_MAXCELLS=<칸> 을 주고 돌린다)');
    }
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit((MIN !== null && worst.length) || (MAXCELLS !== null && tooFine.length) ? 1 : 0);
})();
