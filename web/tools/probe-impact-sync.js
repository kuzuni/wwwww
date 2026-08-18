// 근접 5모션 × "무기가 적에 닿는 구간" vs "데미지가 적용되는 시각" 동기 실측 (hp-juicy 지적 ⓑ 파생).
//
// 왜 재나 — `probe-weapon-contact.js` 로 지적 ⓑ('임팩트 프레임에 무기가 적에 안 닿는다')를
// 기각하다가 **인접한 진짜 결함**이 나왔다: 곤봉(slam)은 무기가 적에 닿는 구간이 **+100~150ms**
// 인데 `WEAPON_TYPES.club.impact = 0.20` 이라 **데미지 숫자·히트 플래시·파편이 +200ms**, 즉
// 클럽이 이미 적에서 떨어져 올라가는 중에 터진다. 타격감은 '닿는 순간에 터지는가'가 전부라
// 이 어긋남은 ⓑ 가 지적하려던 감각의 실체다.
//
// 재는 법은 `probe-weapon-contact.js` 와 같다(무기 정점 투영 · 적 실루엣 정점 투영 · 백로그 정리
// 후 단발 스윙 · Combat.update 미호출). 다른 점은 **근접 5모션을 대표 무기 하나씩 돌아가며** 재고,
// 모션별 접촉 구간 중심과 그 모션을 쓰는 전 무기의 `impact` 를 대조표로 뽑는다는 것.
// 판정: 모션의 접촉 구간 안에 `impact` 가 들어오면 OK, 벗어나면 어긋난 ms 를 인쇄하고 exit 1.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REPS = [['slash', 'sword'], ['chop', 'axe'], ['thrust', 'spear'], ['double', 'dagger'], ['slam', 'mace']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate((REPS) => {
        const D = Scene3D, ST = window.S;
        const V = new THREE.Vector3();
        const projAll = (obj) => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
            obj.updateWorldMatrix(true, true);
            obj.traverse(o => {
                const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                if (!pos || o.visible === false) return;
                const stride = Math.max(1, Math.floor(pos.count / 240));
                for (let i = 0; i < pos.count; i += stride) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const p = D.project(V);
                    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
                    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
                    n++;
                }
            });
            return n ? [x0, y0, x1, y1] : null;
        };
        const weaponTip = () => {
            const w = D.weaponG;
            w.updateWorldMatrix(true, true);
            const grip = w.getWorldPosition(new THREE.Vector3());
            let best = null, bestD = -1;
            w.traverse(o => {
                const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                if (!pos || o.visible === false) return;
                const stride = Math.max(1, Math.floor(pos.count / 240));
                for (let i = 0; i < pos.count; i += stride) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const d = V.distanceTo(grip);
                    if (d > bestD) { bestD = d; best = V.clone(); }
                }
            });
            return best && D.project(best);
        };
        const distToBox = (p, b) => {
            const dx = Math.max(b[0] - p.x, 0, p.x - b[2]);
            const dy = Math.max(b[1] - p.y, 0, p.y - b[3]);
            if (dx === 0 && dy === 0) return -Math.min(p.x - b[0], b[2] - p.x, p.y - b[1], b[3] - p.y);
            return Math.hypot(dx, dy);
        };

        const e = Combat.enemies.find(x => x.alive);
        const m = D.enemyMap.get(e.id);
        e.x = Combat.stopXOf(e);
        m.g.position.set(e.x + D.worldX, m.g.position.y, e.z || 0);

        const rows = [];
        for (const [motion, wtype] of REPS) {
            ST.equipment.weapon = { name: WEAPON_TYPES[wtype].kr, slot: 'weapon', age: 'medieval', ageIdx: 1, rarity: 'common', level: 1, wtype };
            D.refreshHeroEquip();
            D.anims.length = 0; D._hitStop = 0; D._attacking = false; D._trailOn = false;
            D.heroG.position.set(Combat.HERO_X + D.worldX, D.rideY || 0, 0);
            D.heroG.rotation.set(0, 0.55, 0);
            D.heroPlay(['Idle']);
            for (let i = 0; i < 20; i++) D.update(1 / 60);   // 대기 자세 안정화
            D.anims.length = 0;
            D.heroG.position.set(Combat.HERO_X + D.worldX, D.rideY || 0, 0);
            D.heroAttack(e.id);
            const touch = [];
            let nearest = { t: null, d: Infinity };
            for (let i = 0; i < 48; i++) {
                const t = Math.round(i * 1000 / 60);
                const tip = weaponTip(), ebox = projAll(m.g);
                if (tip && ebox) {
                    const d = distToBox(tip, ebox);
                    if (d <= 0) touch.push(t);
                    if (d < nearest.d) nearest = { t, d: +d.toFixed(1) };
                }
                D.update(1 / 60);
            }
            rows.push({ motion, wtype, touch, nearest, clipLive: !!(D.heroRig && D.heroRig._clip) });
        }
        const impacts = {};
        for (const k in WEAPON_TYPES) if (WEAPON_TYPES[k].kind === 'melee') {
            (impacts[WEAPON_TYPES[k].motion] = impacts[WEAPON_TYPES[k].motion] || []).push([k, Math.round(WEAPON_TYPES[k].impact * 1000)]);
        }
        return { rows, impacts };
    }, REPS);

    console.log('== 접촉 구간 vs 데미지 적용 시각 (근접 5모션) ==');
    let bad = 0, blocked = 0;
    for (const r of out.rows) {
        const list = out.impacts[r.motion] || [];
        const ms = list.map(x => x[1]);
        if (!r.clipLive) { console.log('  %s(%s): 클립 안 물림 — 측정 불가', r.motion, r.wtype); blocked++; continue; }
        const tag = r.motion.padEnd(7) + '(' + r.wtype.padEnd(6) + ')';
        if (!r.touch.length) {
            console.log(`  ${tag} 접촉 프레임 없음 · 최근접 +${r.nearest.t}ms ${r.nearest.d}px  ← 이 모션은 무기가 적에 안 닿는다`);
            bad++; continue;
        }
        // 한 프레임(17ms)은 이 측정의 분해능이다 — 그보다 촘촘한 차이는 어긋남으로 치지 않는다.
        const TOL = 17;
        const lo = r.touch[0] - TOL, hi = r.touch[r.touch.length - 1] + TOL;
        const off = ms.map(v => (v < lo ? v - lo : v > hi ? v - hi : 0));
        const worst = off.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
        console.log(`  ${tag} 접촉 +${r.touch[0]}~+${r.touch[r.touch.length - 1]}ms(가장 깊이 파고든 프레임 +${r.nearest.t}ms ${r.nearest.d}px) · impact ${ms.join('/')} → 창 밖 최대 ${worst}ms ` +
            (worst === 0 ? '✓' : '✗ (' + list.filter((_, i) => off[i] !== 0).map(x => x[0]).join(',') + ')'));
        if (worst !== 0) bad++;
    }
    console.log('\n  판정: %s', blocked ? `측정 불가 ${blocked}모션` :
        bad ? `FAIL — ${bad}개 모션에서 데미지 적용 시각이 접촉 구간 밖이다(타격 순간과 이펙트가 어긋난다)`
            : 'PASS — 전 모션에서 데미지 적용 시각이 무기 접촉 구간 안이다');
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(blocked ? 2 : (bad || errors.length) ? 1 : 0);
})();
