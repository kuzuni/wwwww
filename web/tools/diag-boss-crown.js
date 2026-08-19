// diag-boss-crown.js — bossRegalia 가 '무엇을 보고' 관 자리를 골랐는지 그대로 찍는다.
// 게이트(probe-boss-crown-seat)가 FAIL 을 낼 때 코드를 추측으로 만지지 않으려고 만든 진단용.
// 프로파일(높이별 굵기) · 고른 자리 · 머리 중심 · 관 반경 · 그 높이에 실제로 있는 파츠를 출력한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2) : ['imp', 'bat', 'wolf'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const INPAGE = `(kind) => {
    Combat.tick = () => {};
    Scene3D.clearEnemies();
    const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100, isBoss: true };
    Combat.enemies = [e];
    Scene3D.heroAttack = () => {};
    Scene3D.spawnEnemy(e);
    const m = Scene3D.enemyMap.get(999);
    for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
    Scene3D.anims = [];
    m.g.position.set(0, 0, 0); m.g.scale.setScalar(1); m.g.rotation.set(0, 0, 0);
    m.g.updateMatrixWorld(true);

    // 빌더와 **같은 방식으로** 몸 정점만 모은다(레갈리아 제외)
    const V = [], v = new THREE.Vector3(), parts = [];
    m.g.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        if (o.userData.bossRegalia || o.userData.aoRing || o.userData.isOutline) return;
        const b = new THREE.Box3().setFromObject(o);
        parts.push({ t: o.geometry.type, y: [+b.min.y.toFixed(3), +b.max.y.toFixed(3)],
            x: [+b.min.x.toFixed(3), +b.max.x.toFixed(3)], z: [+b.min.z.toFixed(3), +b.max.z.toFixed(3)] });
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); V.push(v.x, v.y, v.z); }
    });
    let bodyTop = -Infinity, bodyBot = Infinity;
    for (let i = 1; i < V.length; i += 3) { if (V[i] > bodyTop) bodyTop = V[i]; if (V[i] < bodyBot) bodyBot = V[i]; }
    const bodyH = Math.max(bodyTop - bodyBot, 0.2);
    const SECT = 12;
    const sectors = (y, band, c) => {
        const cx = c ? c.x : 0, cz = c ? c.z : 0, s = new Array(SECT).fill(0);
        for (let i = 0; i < V.length; i += 3) {
            if (Math.abs(V[i + 1] - y) > band) continue;
            const dx = V[i] - cx, dz = V[i + 2] - cz, d = Math.hypot(dx, dz);
            let k = Math.floor((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2) * SECT);
            if (k >= SECT) k = SECT - 1; else if (k < 0) k = 0;
            if (d > s[k]) s[k] = d;
        }
        return s;
    };
    const pct = (s, q) => { const nz = s.filter(x => x > 0).sort((a, b) => a - b); return nz.length ? nz[Math.floor(nz.length * q)] : 0; };
    const centroidAt = (y, band) => {
        let sx = 0, sz = 0, n = 0;
        for (let i = 0; i < V.length; i += 3) { if (Math.abs(V[i + 1] - y) > band) continue; sx += V[i]; sz += V[i + 2]; n++; }
        return n ? { x: +(sx / n).toFixed(3), z: +(sz / n).toFixed(3), n } : { x: 0, z: 0, n: 0 };
    };
    const SLICES = 14, yLo = bodyTop - bodyH * 0.45, dY = (bodyTop - yLo) / SLICES;
    const prof = [];
    for (let i = 0; i < SLICES; i++) {
        const y = bodyTop - (i + 0.5) * dY;
        const s = sectors(y, dY * 0.75);
        prof.push({ y: +y.toFixed(3), r30: +pct(s, 0.3).toFixed(3), r50: +pct(s, 0.5).toFixed(3),
            rMaxS: +Math.max.apply(null, s).toFixed(3), full: s.filter(x => x > 0).length });
    }
    let rMax = 0; for (const p of prof) if (p.r30 > rMax) rMax = p.r30;
    const seat = prof.find(p => p.r30 >= rMax * 0.5) || prof[prof.length - 1];
    const ctr = centroidAt(seat.y, dY * 0.75);
    const s2 = sectors(seat.y, dY * 0.75, ctr);
    return { bodyTop: +bodyTop.toFixed(3), bodyBot: +bodyBot.toFixed(3), bodyH: +bodyH.toFixed(3),
        dY: +dY.toFixed(3), prof, rMax: +rMax.toFixed(3), seat, ctr,
        headR30: +pct(s2, 0.3).toFixed(3), headR50: +pct(s2, 0.5).toFixed(3),
        sectorsAtSeat: s2.map(x => +x.toFixed(3)),
        partsAtSeat: parts.filter(p => p.y[0] <= seat.y && p.y[1] >= seat.y) };
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(500);
        const r = await page.evaluate(([s, k]) => (new Function('return ' + s))()(k), [INPAGE, kind]);
        await page.close();
        console.log(`\n########## ${kind} — 몸 ${r.bodyBot}~${r.bodyTop} (키 ${r.bodyH}) · 슬라이스 두께 ${r.dY}`);
        console.log('  프로파일(위→아래):');
        for (const p of r.prof) console.log(`    y=${String(p.y).padStart(6)}  r30=${String(p.r30).padStart(6)}  r50=${String(p.r50).padStart(6)}  섹터최대=${String(p.rMaxS).padStart(6)}  찬섹터=${p.full}/12`);
        console.log(`  rMax(r30 중 최대)=${r.rMax} → 고른 자리 y=${r.seat.y} (r30=${r.seat.r30})`);
        console.log(`  머리 중심 xz=(${r.ctr.x}, ${r.ctr.z}) 정점 ${r.ctr.n}개 · 중심기준 headR30=${r.headR30} headR50=${r.headR50}`);
        console.log(`  중심기준 섹터별 반경: ${JSON.stringify(r.sectorsAtSeat)}`);
        console.log(`  그 높이에 걸친 파츠 ${r.partsAtSeat.length}개:`);
        for (const p of r.partsAtSeat.slice(0, 12)) console.log(`    ${p.t.padEnd(18)} y${JSON.stringify(p.y)} x${JSON.stringify(p.x)} z${JSON.stringify(p.z)}`);
    }
    await browser.close();
})();
