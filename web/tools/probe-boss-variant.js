// probe-boss-variant.js — 보스가 '같은 인형을 키운 것'인지 자(尺)로 잰다.
//
// 왜: `Scene3D.monsterMesh` 의 보스 처리는 오랫동안 `g.scale.setScalar(1.9)` + 금색 원뿔 왕관
// 하나가 전부였다. 화면에서는 "덩치만 커진 같은 몬스터"로 읽히는데, 눈대중으로 고치면 뭘 얼마나
// 바꿨는지 남지 않는다. 그래서 **배율을 지운 실루엣**을 비교한다.
//
// 자(尺): 종마다 일반/보스를 각자의 bbox 로 프레이밍해 렌더 → 배경 차분으로 실루엣 마스크 →
// 마스크 bbox 로 잘라 96×96 으로 리샘플 → IoU. 배율이 유일한 차이면 IoU≈1 이다.
//   · IoU ≥ 0.90 = '크기만 키운 장난감' (FAIL)
//   · IoU ≤ 0.80 = 실루엣이 실제로 갈렸다 (PASS)
// 왕관/장식은 따로 센다: goldPx = 금색(emissive 금) 화소 수, top = 정규화 실루엣 상단 18% 밴드
// 화소 수(관·뿔이 자리를 차지하면 늘어난다).
//
// 🚨 **자가 한 번 고장났던 자리 — 반드시 지킬 것.** 종은 `?enemy=` 쿼리로만 정해진다
// (`monsterMesh` 가 `location.search` 를 읽는다). 처음엔 kind 를 evaluate 인자로만 넘겼는데,
// 그러면 **7종이 전부 같은 종으로 렌더돼** 모든 수치가 같아지고 IoU 가 그럴듯하게 나온다.
// 잡아낸 건 음성 대조였다(골렘 vs 고블린 IoU 가 1.000 으로 나왔다 — 서로 다른 종인데).
// 그래서 종마다 **페이지를 새로 연다.** 음성 대조를 지우지 말 것.
//
// 음성 대조(공짜 PASS 차단, 반드시 같이 볼 것):
//   · self  = 같은 메시를 두 번 재서 IoU≈1.00 이 나오는가 (자가 안정적인가)
//   · cross = 서로 다른 두 종의 IoU 가 확연히 낮은가 (자가 '차이'를 실제로 잡는가)
// 사용: node probe-boss-variant.js [kind...]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const N = 96;                 // 리샘플 격자
const FAIL_IOU = 0.90;
const PASS_IOU = 0.80;

// 씬 준비 + 렌더 + 마스크 추출까지 **전부 페이지 안에서** 끝낸다.
// ⑴ 함정 ③ — 헤드리스는 rAF 가 안 돌아 백로그가 밀린다. 한 evaluate 안에서 소진하고 스냅한다.
// ⑵ 480×854 RGBA 를 배열로 넘기면 호출당 164만 개다(느리다). 정규화된 96×96 마스크만 돌려준다.
const INPAGE = `(kind, isBoss, N) => {
    Combat.tick = () => {};
    Scene3D.walking = false;
    Scene3D.heroG.visible = false;
    Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
    if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
    if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
    Scene3D.petGroups.forEach(p => p.visible = false);
    Scene3D.clearEnemies();
    const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100, isBoss: !!isBoss };
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
    // 배율을 지운 프레이밍 — 각자의 bbox 반경으로 거리를 잡아 화면 점유를 맞춘다.
    const box = new THREE.Box3().setFromObject(m.g);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    const dist = r * 2.1 + 0.4;
    Scene3D.camLock = { pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95), look: c.clone() };
    Scene3D.camera.position.copy(Scene3D.camLock.pos);
    Scene3D.camera.lookAt(Scene3D.camLock.look);

    const cv = document.querySelector('canvas');
    const W = cv.width, H = cv.height;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const cx = off.getContext('2d');
    const shoot = () => {
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        cx.clearRect(0, 0, W, H);
        cx.drawImage(cv, 0, 0, W, H);
        return cx.getImageData(0, 0, W, H).data;
    };
    m.g.visible = true;  const fg = shoot();
    m.g.visible = false; const bg = shoot();
    m.g.visible = true;

    const L = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const sil = new Uint8Array(W * H);
    let goldPx = 0;
    for (let p = 0; p < W * H; p++) {
        const i = p * 4;
        if (Math.abs(L(fg, i) - L(bg, i)) >= 3 || Math.abs(fg[i] - bg[i]) >= 4 || Math.abs(fg[i + 2] - bg[i + 2]) >= 4) sil[p] = 1;
        if (!sil[p]) continue;
        // 금 장신구 — R 높고 B 가 확실히 낮은 화소만 (초원 노랑풀에 안 걸리게 문턱 높게)
        const R = fg[i], G = fg[i + 1], B = fg[i + 2];
        if (R > 150 && G > 110 && B < G - 45 && R - B > 70) goldPx++;
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sil[y * W + x]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const norm = [];
    for (let j = 0; j < N; j++) for (let i2 = 0; i2 < N; i2++) {
        const sx = x0 + Math.floor((i2 + 0.5) * bw / N), sy = y0 + Math.floor((j + 0.5) * bh / N);
        norm.push(sil[sy * W + sx]);
    }
    let top = 0;
    for (let j = 0; j < Math.floor(N * 0.18); j++) for (let i2 = 0; i2 < N; i2++) if (norm[j * N + i2]) top++;
    return { norm, goldPx, top, h: +size.y.toFixed(3), bw, bh };
}`;

function iou(a, b) {
    let inter = 0, uni = 0;
    for (let p = 0; p < a.length; p++) { const x = a[p], y = b[p]; if (x && y) inter++; if (x || y) uni++; }
    return uni ? inter / uni : 0;
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    // ⚠️ 종은 URL 로만 정해진다 — 종마다 페이지를 새로 연다(파일 상단 🚨 참고).
    async function openKind(kind) {
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
        return page;
    }
    const shot = (page, kind, isBoss) =>
        page.evaluate(([s, k, b, n]) => (new Function('return ' + s))()(k, b, n), [INPAGE, kind, isBoss, N]);

    const rows = [], normals = {};
    for (const kind of KINDS) {
        const page = await openKind(kind);
        const a = await shot(page, kind, false);
        const s2 = await shot(page, kind, false);       // 음성 대조 ①
        const c = await shot(page, kind, true);
        await page.close();
        if (!a || !c) { console.log(`${kind}: 실루엣 없음 — 측정 실패`); continue; }
        normals[kind] = a.norm;
        rows.push({ kind, shapeIoU: iou(a.norm, c.norm), selfIoU: s2 ? iou(a.norm, s2.norm) : NaN,
            goldN: a.goldPx, goldB: c.goldPx, hN: a.h, hB: c.h, topN: a.top, topB: c.top });
    }

    console.log('\n===== 보스 변형 실측 (배율 제거 후 실루엣 IoU) =====');
    console.log('종        높이 일반→보스    IoU(모양) IoU(자가)  금화소 일반/보스  상단밴드 일반/보스  판정');
    let fail = 0;
    for (const r of rows) {
        const verdict = r.shapeIoU >= FAIL_IOU ? '✗ 크기만 키움' : (r.shapeIoU <= PASS_IOU ? '✔ 갈림' : '△ 부분');
        if (r.shapeIoU >= FAIL_IOU) fail++;
        console.log(`${r.kind.padEnd(9)} ${String(r.hN).padStart(5)}→${String(r.hB).padEnd(6)} `
            + `${r.shapeIoU.toFixed(3).padStart(9)} ${r.selfIoU.toFixed(3).padStart(8)} `
            + `${String(r.goldN).padStart(8)}/${String(r.goldB).padEnd(6)} `
            + `${String(r.topN).padStart(9)}/${String(r.topB).padEnd(7)} ${verdict}`);
    }

    // 음성 대조 ②: 서로 다른 종끼리 IoU — 자가 '차이'를 잡는지 확인. 이게 보스 IoU 만큼 높으면 자가 고장난 것이다.
    const pairs = [['golem', 'goblin'], ['golem', 'bat'], ['slime', 'wolf']].filter(([p, q]) => normals[p] && normals[q]);
    if (pairs.length) {
        console.log('\n[음성 대조] 종간 IoU — ' + pairs.map(([p, q]) => `${p} vs ${q} = ${iou(normals[p], normals[q]).toFixed(3)}`).join(' · '));
        console.log('  → 이 값이 위 보스 IoU 와 비슷하게 높으면 종 강제(?enemy=)가 안 먹은 것이다.');
    }
    console.log(`\n콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`FAIL(크기만 키움) ${fail}/${rows.length} 종`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
