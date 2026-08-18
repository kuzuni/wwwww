// probe-wolf-saddle.js — 늑대 등 다크 새들이 **실제로 씬에 붙어 화면 맨 위에 보이는지** 잰다.
// 사용: node probe-wolf-saddle.js [--dead]
//   --dead 는 새들을 숨겨 **고치기 전 상태(죽은 코드)** 를 재현한다 — 이 프로브가 진짜로 그 버그를
//   잡는지 확인하는 용도다(FAIL 이 나와야 정상).
//
// 왜 필요한가: 이 새들은 2026-08-18 까지 `mk()` 로 만들어져 위치·스케일까지 받고도 **`g.add()` 가 없어
// 화면에 한 번도 안 나왔다**(slug: wolf-backstripe-dead). 콘솔 에러도 없고 캡처도 '늑대처럼' 보여서
// 육안으로는 없는 걸 알 수 없었다 — 털 재질 구를 **세다가** 겨우 들켰다. 그래서 개수만 세지 않고
// ⓐ 씬에 붙었는가 ⓑ 등마루 위에서 내리쏜 레이의 **첫 히트가 새들인가**(=파묻히지 않았는가)
// ⓒ 켜고 끌 때 화소가 실제로 어두워지는가 ⓓ 좌우 실루엣을 넓히지 않는가 — 네 가지를 다 본다.
//
// ⓑ 가 핵심이다: 새들은 몸 안에 파묻혀도 '씬에는 있다'. 반대로 너무 키우면 몸 밖으로 나가 허공에 뜬다.
// 죽어 있던 원래 값(구 r0.16 · 0.78/0.5/2.45 한 덩어리)이 정확히 그 두 실패를 동시에 갖고 있었다 —
// 흉곽 위는 1~3cm 파묻히고 엉덩이 뒤로는 몸 반폭을 0.067 넘겨 튀어나온다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const DEAD = process.argv.includes('--dead');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEG_EXPECT = 3;      // 등마루 3분절
const RAY_Z0 = -0.30, RAY_Z1 = 0.22, RAY_STEP = 0.02;  // 새들이 덮기로 한 등마루 구간(그룹 로컬 z)
// ⚠️ 앞끝을 0.22 에서 끊는다 — z 0.24 부터는 **목(neckW, z 0.3 에 −0.7 로 누운 원기둥)이 등마루 위로 올라온다.**
//    거기서 첫 히트가 목인 건 정상(새들은 목덜미 **밑**으로 들어가는 게 맞다) — 0.26 까지 재면 그 한 점만 걸린다(실측).
const MIN_DARK_PX = 120;   // 이보다 적으면 사실상 화면에 없는 것
const MIN_DROP = 10;       // 최대 휘도 하락폭 하한

// 🚨 렌더와 읽기는 반드시 한 evaluate 안에서 (probe-enemy-ao 6번째 줄과 같은 함정 —
//    이 저장소 렌더러는 preserveDrawingBuffer 가 아니라 다음 호출에서 읽으면 검은 판이 나온다).
async function renderAndGrab(page, rect, setup) {
    return await page.evaluate(({ r, setup }) => {
        // eslint-disable-next-line no-new-func
        (new Function(setup))();
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        const cv = document.querySelector('canvas');
        const off = document.createElement('canvas');
        off.width = Math.round(r.width); off.height = Math.round(r.height);
        const cx = off.getContext('2d');
        cx.drawImage(cv, 0, 0, off.width, off.height);
        return { w: off.width, h: off.height, data: Array.from(cx.getImageData(0, 0, off.width, off.height).data) };
    }, { r: rect, setup });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=wolf', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const setup = await page.evaluate((dead) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.heroG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
        Scene3D.petGroups.forEach(p => p.visible = false);
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.heroAttack = () => {};
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        // ⚠️ 연출 백로그를 먼저 배수한다 — 안 그러면 밀린 애니메이션이 좌표를 서로 덮어써 톱니로 튄다
        //    (TODO.md 함정 ③). 그 뒤 논리 좌표로 스냅.
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.y = 0; m.g.userData.landed = true;
        m.g.position.x = e.x + Scene3D.worldX;
        m.g.rotation.y = -1.15;
        m.g.updateMatrixWorld(true);
        for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
            if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
            o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
        }
        const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
        if (hpG) hpG.visible = false;
        if (m.hpG) m.hpG.visible = false;

        window.__saddle = [];
        m.g.traverse(o => { if (o.name === 'wolfSaddle') window.__saddle.push(o); });
        if (dead) window.__saddle.forEach(o => o.visible = false);   // 고치기 전 상태 재현
        m.g.updateMatrixWorld(true);
        window.__wolf = m.g;

        const box = new THREE.Box3().setFromObject(m.g);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * 1.75 + 0.4;
        Scene3D.camLock = {
            pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95),
            look: c.clone(),
        };
        return { n: window.__saddle.length };
    }, DEAD);

    // ⓑ 등마루 레이캐스트 — 그룹 **로컬** z 를 따라 위에서 아래로 쏴 첫 히트를 본다.
    //    로컬로 잡아야 늑대가 어떤 각도로 서 있든 같은 자리를 잰다(월드 좌표로 하면 rotation.y 에 딸려 어긋난다).
    const ray = await page.evaluate(({ z0, z1, step }) => {
        const g = window.__wolf;
        g.updateMatrixWorld(true);
        const rc = new THREE.Raycaster();
        rc.far = 100;
        const out = [];
        for (let z = z0; z <= z1 + 1e-9; z += step) {
            const o = new THREE.Vector3(0, 1.6, z).applyMatrix4(g.matrixWorld);
            const d = new THREE.Vector3(0, -1, 0).transformDirection(g.matrixWorld).normalize();
            rc.set(o, d);
            const hits = rc.intersectObject(g, true).filter(h => h.object.visible && h.object.material && !h.object.material.transparent);
            const first = hits[0];
            let localY = null;
            if (first) {
                const p = first.point.clone();
                g.worldToLocal(p);
                localY = p.y;
            }
            out.push({ z: +z.toFixed(3), hit: first ? (first.object.name || first.object.geometry.type) : null, y: localY });
        }
        return out;
    }, { z0: RAY_Z0, z1: RAY_Z1, step: RAY_STEP });

    // ⓓ 새들의 로컬 x·z 범위가 몸통(흉곽/연결통/골반) 범위 밖으로 안 나가는지 — 허공에 뜬 덩어리 검사.
    //    몸통은 '새들·다리·꼬리·머리를 뺀, 새들 높이대(y 0.30~0.70)에 걸치는 g 직속 메시'로 잡는다.
    const extent = await page.evaluate(() => {
        const g = window.__wolf;
        const acc = (objs) => {
            let xMax = 0, zMin = Infinity, zMax = -Infinity, yMax = -Infinity;
            for (const o of objs) {
                const p = o.geometry.attributes.position;
                const v = new THREE.Vector3();
                for (let i = 0; i < p.count; i++) {
                    v.fromBufferAttribute(p, i).applyMatrix4(o.matrix);   // g 로컬 좌표 (모두 g 직속)
                    xMax = Math.max(xMax, Math.abs(v.x));
                    zMin = Math.min(zMin, v.z); zMax = Math.max(zMax, v.z);
                    yMax = Math.max(yMax, v.y);
                }
            }
            return { xMax, zMin, zMax, yMax };
        };
        const saddle = g.children.filter(o => o.name === 'wolfSaddle');
        // 몸통 후보: g 직속 메시 중 새들이 아니고, 그룹(다리·꼬리·머리)도 아니고, 중심 높이가 몸통대인 것
        const trunk = g.children.filter(o => o.isMesh && o.name !== 'wolfSaddle'
            && o.position.y > 0.30 && o.position.y < 0.60 && Math.abs(o.position.x) < 0.02);
        return { saddle: saddle.length ? acc(saddle) : null, trunk: acc(trunk), nTrunk: trunk.length };
    });

    await page.waitForTimeout(700);
    await page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });
    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    // 애니메이션을 멈춰야 두 장의 포즈가 같다(차분 오염 방지).
    await page.evaluate(() => { Scene3D.__frozenUpdate = Scene3D.update; Scene3D.update = () => {}; });

    const hide = DEAD ? '' : 'window.__saddle.forEach(o => o.visible = false);';
    const show = DEAD ? '' : 'window.__saddle.forEach(o => o.visible = true);';
    const on = await renderAndGrab(page, rect, show + ' window.__wolf.visible = true;');
    const off = await renderAndGrab(page, rect, hide + ' window.__wolf.visible = true;');
    const bg = await renderAndGrab(page, rect, 'window.__wolf.visible = false;');
    await page.evaluate(() => { window.__wolf.visible = true; });

    const L = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const W = on.w, H = on.h;
    let darkPx = 0, maxDrop = 0;
    // 실루엣 폭: '배경과 다른 화소'의 좌우 최대 폭. 새들이 옆으로 새면 이 값이 커진다.
    const silBox = (img) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(L(img.data, i) - L(bg.data, i)) >= 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
        }
        return { w: x1 - x0 + 1, x0, x1, top: y0 };
    };
    for (let px = 0; px < W * H; px++) {
        const drop = L(off.data, px * 4) - L(on.data, px * 4);
        if (drop >= 6) { darkPx++; if (drop > maxDrop) maxDrop = drop; }
    }
    const sOff = silBox(off), sOn = silBox(on);

    // ---- 판정 ----
    const buried = ray.filter(r => r.hit !== 'wolfSaddle');
    const fails = [];
    if (!DEAD && setup.n !== SEG_EXPECT) fails.push(`새들 세그먼트 ${setup.n}개 (기대 ${SEG_EXPECT}개) — g.add() 누락 회귀 의심`);
    if (buried.length) fails.push(`등마루 ${buried.length}/${ray.length} 지점에서 첫 히트가 새들이 아니다 (파묻힘) — 예: z=${buried.slice(0, 4).map(b => b.z + '→' + b.hit).join(', ')}`);
    if (darkPx < MIN_DARK_PX) fails.push(`새들을 켜도 어두워진 화소가 ${darkPx}개 (하한 ${MIN_DARK_PX}) — 화면 기여 없음`);
    if (maxDrop < MIN_DROP) fails.push(`최대 휘도 하락 ${maxDrop.toFixed(1)} (하한 ${MIN_DROP})`);
    if (extent.saddle) {
        if (extent.saddle.xMax > extent.trunk.xMax) fails.push(`새들 반폭 ${extent.saddle.xMax.toFixed(3)} > 몸통 반폭 ${extent.trunk.xMax.toFixed(3)} — 옆 실루엣 유출`);
        if (extent.saddle.zMin < extent.trunk.zMin) fails.push(`새들 뒤끝 z ${extent.saddle.zMin.toFixed(3)} < 몸통 뒤끝 ${extent.trunk.zMin.toFixed(3)} — 엉덩이 뒤로 튀어나옴`);
        if (extent.saddle.zMax > extent.trunk.zMax) fails.push(`새들 앞끝 z ${extent.saddle.zMax.toFixed(3)} > 몸통 앞끝 ${extent.trunk.zMax.toFixed(3)} — 가슴 앞으로 튀어나옴`);
    }
    if (sOn.w > sOff.w) fails.push(`실루엣 가로폭 ${sOff.w}px → ${sOn.w}px — 새들이 좌우로 삐져나왔다`);
    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors[0]}`);

    console.log(`모드           ${DEAD ? '--dead (고치기 전 재현)' : '정상'}`);
    console.log(`새들 세그먼트  ${setup.n}개${DEAD ? ' (숨김)' : ''}`);
    console.log(`등마루 레이    ${ray.length - buried.length}/${ray.length} 지점 첫 히트 = 새들`);
    console.log(`화면 기여      어두워진 화소 ${darkPx} · 최대 하락 ${maxDrop.toFixed(1)}`);
    if (extent.saddle) console.log(`로컬 범위      새들 |x|≤${extent.saddle.xMax.toFixed(3)} z[${extent.saddle.zMin.toFixed(3)},${extent.saddle.zMax.toFixed(3)}] · 몸통(${extent.nTrunk}개) |x|≤${extent.trunk.xMax.toFixed(3)} z[${extent.trunk.zMin.toFixed(3)},${extent.trunk.zMax.toFixed(3)}]`);
    console.log(`실루엣         가로 ${sOff.w}px → ${sOn.w}px · 윗선 y ${sOff.top} → ${sOn.top}px`);
    await browser.close();

    if (fails.length) { console.log('\nFAIL'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
    console.log('\nPASS — 새들이 씬에 붙어 등마루 전 구간에서 맨 위로 보이고, 실루엣은 그대로');
})();
