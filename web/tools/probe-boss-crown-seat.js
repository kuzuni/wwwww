// probe-boss-crown-seat.js — 보스 왕관이 **머리에 앉아 있는가**를 잰다 (뜬 관 / 파묻힌 관).
//
// 왜 이 자를 만들었나: 처음엔 '보스가 같은 인형을 키운 것인가'를 실루엣 IoU 로 재려 했는데
// (`probe-boss-variant.js`), 7종 전부 IoU 0.44~0.80 으로 **통과**가 나왔다. 코드를 보면
// 보스 처리는 `scale 1.9` + 원뿔 하나가 전부인데 통과가 나올 리가 없다 — 자를 의심해 높이를 봤더니
// 슬라임 0.77 → 1.862 (×2.42) 였다. **1.9배가 아니다.** 즉 IoU 를 떨어뜨린 건 '보스다움'이 아니라
// **몸에서 떨어져 허공에 뜬 왕관이 bbox 를 늘린 것**이었다. 자가 결함을 '개선'으로 읽고 있었다.
//
// 그래서 재는 것을 바꿨다. 왕관 좌표는 종 무관 `crown.position.y = topY` 한 줄인데,
// `topY` 는 종마다 의미가 흔들린다(슬라임은 몸 꼭대기 0.65 인데 topY 0.85). 결과는 두 방향의 고장:
//   · 뜬 관   — 왕관 밑면이 몸 꼭대기보다 위 → 머리 위 허공에 떠 있다
//   · 묻힌 관 — 왕관이 갓·머리 안에 잠겨 화면 기여 0px (무비용 무효과)
//
// 자(尺) — 세 축을 같이 본다. 한 축만 보면 반대쪽으로 고쳐 버린다:
//   ⑴ vGap = (왕관 밑면 y) − (레갈리아 제외 몸통 꼭대기 y), 몸 키로 정규화. 세로 착좌.
//   ⑵ rGap = **접촉 거리**. 왕관 밑동 링의 정점마다 6방향(±x·±y·±z)으로 광선을 쏴
//            **가장 가까운 몸 표면까지의 거리**를 재고, 그 중앙값을 몸 키로 나눈다(0 = 닿아 있다).
//            🚨 vGap 만 보면 못 잡는다 — 슬라임처럼 꼭대기가 **뾰족한** 종은 원뿔 밑동 링이
//            허공에 떠 있어도 bbox 는 겹쳐서 vGap 이 −0.065 로 '착좌'라고 나온다(실측).
//            이 자를 만들 때 실제로 그 함정을 먼저 밟았다. 그리고 방향을 '몸 중심축 → 정점'
//            으로 고정했다가 두 번째 함정도 밟았다 — 늑대·박쥐는 머리가 축 위에 없어서
//            멀쩡한 관도 '표면 없음'이 됐다. 자에 형상 가정을 넣지 말 것.
//   ⑶ visPx = 레갈리아를 껐다 켰을 때 바뀌는 화소 수 = 실제 화면 기여. 0 이면 무비용 무효과.
// 통과 = vGap·rGap 이 접촉 구간이고 visPx ≥ MIN_VIS.
// ⚠️ rGap 측정 동안만 몸 재질을 DoubleSide 로 바꾼다(끝나면 복원) — 축에서 쏜 광선은 뒷면을
//    때리는데 FrontSide 면 three 가 교차를 버려 '표면 없음' 으로 읽힌다.
//
// 음성 대조(공짜 PASS 차단 — 없는 PASS 는 이 저장소에서 믿지 않는다):
//   NEG=lift 로 레갈리아를 몸 키의 25% 만큼 띄우면 FAIL(뜸) 이 나와야 한다.
//   NEG=sink 로 같은 만큼 내리면 visPx 가 급감해 FAIL(묻힘) 이 나와야 한다.
//   NEG=grow 로 관만 2.5배 키우면 rGap 이 커져 FAIL(반경 뜸) 이 나와야 한다.
// 사용: node probe-boss-crown-seat.js [kind...]     NEG=lift|sink|grow node probe-boss-crown-seat.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NEG = process.env.NEG || '';
const GAP_HI = 0.02;    // 세로: 이보다 위면 '떴다' (몸 키 대비)
const GAP_LO = -0.55;   // 세로: 이보다 아래면 '묻혔다'
const RGAP_HI = 0.05;   // 접촉: 밑동 링에서 가장 가까운 몸 표면까지가 몸 키의 이 비율을 넘으면 '떴다'
const MIN_VIS = 120;    // 화면 기여 최소 화소

const INPAGE = `(kind, neg) => {
    Combat.tick = () => {};
    Scene3D.walking = false;
    Scene3D.heroG.visible = false;
    Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
    if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
    if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
    Scene3D.petGroups.forEach(p => p.visible = false);
    Scene3D.clearEnemies();
    const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100, isBoss: true };
    Combat.enemies = [e];
    Scene3D.heroAttack = () => {};
    Scene3D.spawnEnemy(e);
    const m = Scene3D.enemyMap.get(999);
    for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
    Scene3D.anims = [];
    m.g.position.y = 0; m.g.userData.landed = true;
    m.g.position.x = e.x + Scene3D.worldX;
    if (kind === 'wolf') m.g.rotation.y = -1.15;
    m.g.updateMatrixWorld(true);
    for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
        if (Math.abs(o.position.x - m.g.position.x) < 7) o.visible = false;
        o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
    }
    if (m.hpG) m.hpG.visible = false;
    const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
    if (hpG) hpG.visible = false;

    // 레갈리아 식별 — 새 코드는 userData.bossRegalia 로 표시한다. 옛 코드(원뿔 하나)는
    // 표시가 없으므로 '그룹 직속 금색(0xffd54f) 원뿔' 로 잡는다(before/after 를 같은 자로 재려고).
    const reg = [];
    m.g.traverse(o => {
        if (!o.isMesh) return;
        if (o.userData.bossRegalia) { reg.push(o); return; }
        if (o.parent === m.g && o.geometry && o.geometry.type === 'ConeGeometry'
            && o.material && o.material.color && o.material.color.getHex() === 0xffd54f) reg.push(o);
    });
    if (!reg.length) return { err: '레갈리아 메시를 못 찾았다' };
    // 'crown' 만 착좌를 매긴다 — 등가시·견갑뿔은 원래 몸 아래쪽에 붙으므로 gap 대상이 아니다.
    // 옛 코드(태그 없는 원뿔 하나)는 그게 곧 관이라 reg 전체와 같다.
    const crown = reg.filter(o => o.userData.bossRegalia ? o.userData.bossRegalia === 'crown' : true);
    if (!crown.length) return { err: '관 파츠가 없다' };
    if (neg) { // 음성 대조 — 자가 진짜로 반응하는지 본다
        const bodyBox0 = new THREE.Box3();
        m.g.traverse(o => { if (o.isMesh && reg.indexOf(o) < 0) bodyBox0.expandByObject(o); });
        const H0 = bodyBox0.max.y - bodyBox0.min.y;
        // 2.5배. 1.6배는 **음성 대조로서 힘이 모자랐다** — 밑동 링이 밀려나는 거리가 0.6×headR
        // ≈ 몸 키의 6% 라 게이트 허용치(5%)와 겨우 1.2배 차이여서 종 절반이 그대로 통과했다.
        // 대조는 게이트 허용치를 **여유 있게** 넘겨야 '자가 반응한다'를 말할 수 있다.
        if (neg === 'grow') { for (const o of crown) { o.scale.multiplyScalar(2.5); o.position.x *= 2.5; o.position.z *= 2.5; } }
        else { const d = H0 * 0.25 * (neg === 'sink' ? -1 : 1); for (const o of reg) o.position.y += d / (m.g.scale.y || 1); }
        m.g.updateMatrixWorld(true);
    }

    const bodyBox = new THREE.Box3(), regBox = new THREE.Box3();
    const bodyMeshes = [];
    m.g.traverse(o => {
        if (!o.isMesh) return;
        if (reg.indexOf(o) >= 0) { regBox.expandByObject(o); return; }
        bodyBox.expandByObject(o);
        if (!o.userData.aoRing && !o.userData.isOutline) bodyMeshes.push(o);
    });
    const bodyH = bodyBox.max.y - bodyBox.min.y;

    // ── 가로(반경) 착좌 — 관 밑동 링이 몸 표면에 닿아 있는가 ──
    // 축에서 쏜 광선은 몸 안쪽 면을 때린다. FrontSide 면 three 가 버리므로 잠깐 DoubleSide 로 둔다.
    const sideBak = [];
    for (const o of bodyMeshes) for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (mt && sideBak.every(s => s.m !== mt)) { sideBak.push({ m: mt, s: mt.side }); mt.side = THREE.DoubleSide; }
    }
    const crownBox = new THREE.Box3();
    for (const o of crown) crownBox.expandByObject(o);
    // ⚠️ vGap 은 **관** 상자로 잰다. 레갈리아 전체(등가시·견갑뿔 포함)로 재면 등가시가 몸 중턱에
    //    붙는 게 정상인데도 '관이 묻혔다'로 읽힌다 — 이 자를 만들다 실제로 그렇게 오독했다.
    const gap = (crownBox.min.y - bodyBox.max.y) / bodyH;
    const rimTop = crownBox.min.y + (crownBox.max.y - crownBox.min.y) * 0.15;   // 관 자기 높이의 아래 15% = 밑동 링
    // ⚠️ 방향을 미리 정해 두면 안 된다. 처음엔 '몸 중심축 → 정점' 방향으로 쟀는데, 늑대·박쥐는
    //    머리가 축 위에 없어서 멀쩡히 머리에 얹힌 관도 '표면 없음'으로 나왔다 — 자가 몸을 원기둥이라
    //    가정한 것이다. 지금은 정점에서 **6방향(±x·±y·±z)** 으로 쏴 **가장 가까운 표면까지의 거리**를
    //    쓴다. 형상 가정이 없고, 몸 안에 물린 정점도 짧은 거리로 잡혀 '접촉' 으로 읽힌다.
    const rc = new THREE.Raycaster();
    const wp = new THREE.Vector3();
    const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(d => new THREE.Vector3(d[0], d[1], d[2]));
    const gaps = [];
    for (const o of crown) {
        const pa = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
        if (!pa) continue;
        for (let i = 0; i < pa.count; i++) {
            wp.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
            if (wp.y > rimTop) continue;
            let best = Infinity;
            for (const d of DIRS) {
                rc.set(wp, d);
                rc.far = bodyH;                       // 몸 키보다 멀면 접촉이 아니다
                const hit = rc.intersectObjects(bodyMeshes, false);
                if (hit.length && hit[0].distance < best) best = hit[0].distance;
            }
            gaps.push(best === Infinity ? 1 : best / bodyH);
        }
    }
    for (const s of sideBak) s.m.side = s.s;
    gaps.sort((a, b) => a - b);
    const rGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;   // 중앙값 — 한두 점이 튀어도 안 흔들린다

    // 프레이밍 — 몸+레갈리아 전체가 들어오게
    const all = bodyBox.clone().union(regBox);
    const c = all.getCenter(new THREE.Vector3()), size = all.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z), dist = r * 2.0 + 0.4;
    Scene3D.camLock = { pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95), look: c.clone() };
    Scene3D.camera.position.copy(Scene3D.camLock.pos);
    Scene3D.camera.lookAt(Scene3D.camLock.look);

    const cv = document.querySelector('canvas'), W = cv.width, H = cv.height;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const cx = off.getContext('2d');
    const shoot = () => { Scene3D.renderer.render(Scene3D.scene, Scene3D.camera); cx.clearRect(0,0,W,H); cx.drawImage(cv,0,0,W,H); return cx.getImageData(0,0,W,H).data; };
    const on = shoot();
    for (const o of reg) o.visible = false;
    const offd = shoot();
    for (const o of reg) o.visible = true;
    let visPx = 0;
    for (let p = 0; p < W * H; p++) { const i = p * 4;
        if (Math.abs(on[i]-offd[i]) + Math.abs(on[i+1]-offd[i+1]) + Math.abs(on[i+2]-offd[i+2]) >= 12) visPx++; }
    return { parts: reg.length, crownParts: crown.length, gap: +gap.toFixed(3), rGap: +rGap.toFixed(3), rimN: gaps.length, visPx,
        bodyTop: +bodyBox.max.y.toFixed(3), regBot: +crownBox.min.y.toFixed(3), regTop: +regBox.max.y.toFixed(3),
        bodyH: +bodyH.toFixed(3), topY: +(m.topY || 0).toFixed(3), barY: +(m.barY || 0).toFixed(3) };
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const rows = [];
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        page.on('pageerror', e => errors.push(kind + ': ' + e));
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
            Scene3D.__frozenUpdate = Scene3D.update; Scene3D.update = () => {};
        });
        const r = await page.evaluate(([s, k, n]) => (new Function('return ' + s))()(k, n), [INPAGE, kind, NEG]);
        await page.close();
        rows.push(Object.assign({ kind }, r));
    }

    console.log(`\n===== 보스 왕관 착좌 실측${NEG ? ' — 음성 대조 NEG=' + NEG : ''} =====`);
    console.log('종        파츠/관  몸꼭대기  관밑면   vGap(세로)  rGap(가로,밑동링)  기여px   판정');
    let fail = 0;
    for (const r of rows) {
        if (r.err) { console.log(`${r.kind.padEnd(9)} ${r.err}`); fail++; continue; }
        const vBad = r.gap > GAP_HI ? '세로 뜸' : r.gap < GAP_LO ? '세로 묻힘' : '';
        const rBad = r.rGap > RGAP_HI ? '관이 몸에서 떨어짐' : '';
        const dim = r.visPx < MIN_VIS ? '화면기여 미달' : '';
        const why = [vBad, rBad, dim].filter(Boolean).join('·');
        if (why) fail++;
        console.log(`${r.kind.padEnd(9)} ${String(r.parts).padStart(4)}/${String(r.crownParts).padEnd(3)} `
            + `${String(r.bodyTop).padStart(8)} ${String(r.regBot).padStart(7)} ${String(r.gap).padStart(10)} `
            + `${String(r.rGap).padStart(12)}(n=${String(r.rimN).padEnd(3)}) ${String(r.visPx).padStart(7)}   ${why ? '✗ ' + why : '✔ 착좌'}`);
    }
    console.log(`\n콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`FAIL ${fail}/${rows.length} 종  (vGap ${GAP_LO}~${GAP_HI} · rGap ≤ ${RGAP_HI} · 화면기여 ≥ ${MIN_VIS}px)`);
    if (NEG) console.log(`음성 대조라 FAIL 이 나와야 정상이다 — FAIL 0 이면 자가 고장난 것이다.`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
