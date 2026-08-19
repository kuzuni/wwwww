// probe-enemy-ao-split.js — AO 링을 **한 개씩** 껐다 켜서 종별 '후프 유출'의 범인 링을 가르고,
// 그 자리에서 반경 배율을 훑어 **유출 0 을 만드는 최대 배율**까지 뽑는다.
//
// 왜: 게이트(`probe-enemy-ao.js`)는 종 단위 합계만 준다. 링이 2~3개인 종에서 어느 링이 새는지
// 모른 채 반경을 건드리면, 안 새던 링을 파묻거나(darkPx 0 = 무비용 무효과) 새던 링을 그대로 둔다.
// 실제로 소스 주석에 '0.208 은 4px 삐져나왔다', '0.158 은 후프로 4px' 처럼 **한 번에 하나씩**
// 손으로 좁힌 흔적이 남아 있다 — 그 반복을 한 번에 끝내려고 만든 도구다.
//
// 측정은 게이트와 **같은 규약**을 쓴다(한 페이지·한 정지 프레임·한 evaluate 안에서 렌더+읽기,
// 실루엣 마스크 2px 팽창). 그래야 여기서 고른 값이 게이트에서 그대로 재현된다.
// 사용: node probe-enemy-ao-split.js [kind...]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7];
const MIN_DARK_PX = 60;

async function renderAndGrab(page, rect, setup) {
    return await page.evaluate(({ r, setup }) => {
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
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
        const rings = await page.evaluate((kind) => {
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
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m.g.position.y = 0; m.g.userData.landed = true;
            m.g.position.x = e.x + Scene3D.worldX;
            if (kind === 'wolf') m.g.rotation.y = -1.15;
            m.g.updateMatrixWorld(true);
            for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
                if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
                o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
            }
            const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
            if (hpG) hpG.visible = false;
            if (m.hpG) m.hpG.visible = false;
            const box = new THREE.Box3().setFromObject(m.g);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z);
            const dist = r * 1.75 + 0.4;
            Scene3D.camLock = { pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95), look: c.clone() };
            window.__aoRings = [];
            m.g.traverse(o => { if (o.userData && o.userData.aoRing) window.__aoRings.push(o); });
            // 원래 스케일을 기억해 둔다(배율 훑기에서 되돌려야 한다)
            window.__aoBase = window.__aoRings.map(o => o.scale.clone());
            return window.__aoRings.map((o, i) => {
                const p = o.geometry.parameters || {};
                const w = o.getWorldPosition(new THREE.Vector3());
                return { i, r: +(p.radius || 0).toFixed(4), tube: +(p.tube || 0).toFixed(4),
                    local: [o.position.x, o.position.y, o.position.z].map(v => +v.toFixed(3)),
                    scale: [o.scale.x, o.scale.y, o.scale.z].map(v => +v.toFixed(3)),
                    world: [w.x, w.y, w.z].map(v => +v.toFixed(3)),
                    parent: o.parent && o.parent.type === 'Group' ? 'group' : (o.parent ? o.parent.type : '-') };
            });
        }, kind);
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
        await page.evaluate(() => { Scene3D.__frozenUpdate = Scene3D.update; Scene3D.update = () => {}; });

        const L = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        const off = await renderAndGrab(page, rect, 'window.__aoRings.forEach(o => o.visible = false); Scene3D.enemyMap.get(999).g.visible = true;');
        const bg = await renderAndGrab(page, rect, 'Scene3D.enemyMap.get(999).g.visible = false;');
        await page.evaluate(() => { Scene3D.enemyMap.get(999).g.visible = true; });
        const W = off.w, H = off.h;
        const inSil = new Uint8Array(W * H);
        for (let px = 0; px < W * H; px++) if (Math.abs(L(off.data, px * 4) - L(bg.data, px * 4)) >= 2) inSil[px] = 1;
        const dil = new Uint8Array(W * H), R = 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!inSil[y * W + x]) continue;
            for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                const ny = y + dy, nx = x + dx;
                if (ny >= 0 && ny < H && nx >= 0 && nx < W) dil[ny * W + nx] = 1;
            }
        }
        const measure = (on) => {
            let darkPx = 0, maxDrop = 0, leak = 0;
            for (let px = 0; px < W * H; px++) {
                const i = px * 4;
                const drop = L(off.data, i) - L(on.data, i);
                if (drop > 6) { darkPx++; if (drop > maxDrop) maxDrop = drop; if (!dil[px]) leak++; }
            }
            return { darkPx, maxDrop: +maxDrop.toFixed(1), leak };
        };

        console.log(`\n===== ${kind} — AO 링 ${rings.length}개 =====`);
        for (const rg of rings) {
            const head = `  링#${rg.i} r=${rg.r} tube=${rg.tube} local=${JSON.stringify(rg.local)} scale=${JSON.stringify(rg.scale)}`;
            const line = [];
            for (const k of SCALES) {
                const on = await renderAndGrab(page, rect,
                    `window.__aoRings.forEach((o, j) => { o.visible = (j === ${rg.i}); o.scale.set(window.__aoBase[j].x * ${k}, window.__aoBase[j].y * ${k}, window.__aoBase[j].z); });`);
                const m = measure(on);
                line.push(`${k.toFixed(2)}→[어두움 ${String(m.darkPx).padStart(5)} · 하락 ${String(m.maxDrop).padStart(5)} · 유출 ${String(m.leak).padStart(4)}]${m.leak === 0 && m.darkPx >= MIN_DARK_PX ? '✔' : ' '}`);
            }
            console.log(head);
            for (const s of line) console.log(`      ${s}`);
            await page.evaluate((i) => { window.__aoRings[i].scale.copy(window.__aoBase[i]); }, rg.i);
        }
        await page.evaluate(() => { window.__aoRings.forEach(o => o.visible = true); });
        if (errors.length) console.log('  콘솔 에러: ' + errors.slice(0, 3).join(' | '));
        await page.close();
    }
    await browser.close();
    console.log('\n(✔ = 그 배율에서 유출 0 이면서 기여가 하한(60px) 이상 — 그중 **가장 큰** 배율을 고를 것)');
})();
