// 펫 가림 실측 프로브 — TODO '펫이 플레이어에 가려서 안 보임' 항목의 수치 근거.
// 사용: node probe-pet-occlusion.js [--spots "x,z;x,z;x,z"]
//
// 스크린샷 눈대중으로는 "가려졌다"를 판정할 수 없어서(펫과 탈것이 같은 초록이면 특히)
// **화면 좌표로 투영한 실루엣 픽셀 겹침**을 직접 센다:
//   ① 펫/영웅/탈것 각 그룹의 모든 메시 버텍스를 카메라로 투영해 화면 폴리곤(볼록 껍질 대신 바운딩 격자)을 만든다
//   ② 펫 격자 셀 중심마다 "그 방향으로 영웅·탈것이 더 카메라에 가까이 있는가"를 깊이로 비교해 가림 여부 판정
//   ③ 펫 실루엣 셀 중 가려진 비율 = occluded%. 이 값이 판정 기준.
// 격자 해상도는 펫 바운딩박스를 24x24로 쪼갠다(펫이 작아도 안정적).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const spotsArg = (() => {
    const i = process.argv.indexOf('--spots');
    if (i < 0) return null;
    return process.argv[i + 1].split(';').map(s => s.split(',').map(Number));
})();

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((spotsOverride) => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (total) => { const n = Math.max(1, Math.round(total * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        if (spotsOverride) Scene3D.__spotsOverride = spotsOverride;

        const setPets = (n) => {
            const names = Object.keys(PET_ICONS).slice(0, 3);
            S.pets = names.map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
            S.activePets = [];
            for (let i = 0; i < n; i++) S.activePets.push(i);
            Scene3D.refreshPets();
        };
        const setMount = (nm) => {
            S.mounts = {}; if (nm) S.mounts[nm] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = nm || null; Scene3D.refreshMount();
        };
        Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk';

        // ── 그룹의 화면 투영 샘플: 모든 메시의 버텍스를 화면 좌표+카메라거리로 ──
        const cam = Scene3D.camera;
        const projGroup = (root) => {
            const pts = [];
            if (!root) return pts;
            root.updateWorldMatrix(true, true);
            root.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                if (o.visible === false) return;
                const pos = o.geometry.attributes.position;
                const stride = Math.max(1, Math.floor(pos.count / 300)); // 메시당 최대 ~300 버텍스 샘플
                const v = new THREE.Vector3();
                for (let i = 0; i < pos.count; i += stride) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const d = v.distanceTo(cam.position);
                    const p = v.clone().project(cam);
                    if (p.z < -1 || p.z > 1) continue;
                    pts.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2, d });
                }
            });
            return pts;
        };
        // 점군 → 화면 격자 깊이맵(셀당 최소 거리 = 가장 앞면)
        const GRID = 200;
        const depthMap = (pts) => {
            const m = new Float64Array(GRID * GRID).fill(Infinity);
            for (const p of pts) {
                const gx = Math.floor(p.x * GRID), gy = Math.floor(p.y * GRID);
                if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
                const k = gy * GRID + gx;
                if (p.d < m[k]) m[k] = p.d;
            }
            // 점군은 표면 샘플이라 구멍이 생긴다 → 3x3 팽창으로 실루엣을 메운다(가림을 과소평가하지 않게)
            const o = m.slice();
            for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
                let best = m[y * GRID + x];
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
                    const v = m[ny * GRID + nx];
                    if (v < best) best = v;
                }
                o[y * GRID + x] = best;
            }
            return o;
        };

        const measure = (label) => {
            const heroPts = projGroup(Scene3D.heroG);
            const mountPts = Scene3D.mountG ? projGroup(Scene3D.mountG) : [];
            const occ = depthMap(heroPts.concat(mountPts));
            const rows = [];
            Scene3D.petGroups.forEach((pg, i) => {
                const pts = projGroup(pg);
                if (!pts.length) { rows.push({ i, name: pg.userData.name, cells: 0, occluded: 100, note: 'off-screen' }); return; }
                const pd = depthMap(pts);
                let cells = 0, hidden = 0;
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (let k = 0; k < pd.length; k++) {
                    if (!isFinite(pd[k])) continue;
                    cells++;
                    const x = (k % GRID) / GRID, y = Math.floor(k / GRID) / GRID;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (isFinite(occ[k]) && occ[k] < pd[k] - 0.01) hidden++;
                }
                rows.push({
                    i, name: pg.userData.name,
                    cells, occludedPct: +(hidden / cells * 100).toFixed(1),
                    // 화면 점유 비율(펫이 너무 작아 안 보이는 것도 문제라 같이 본다)
                    areaPct: +(cells / (GRID * GRID) * 100).toFixed(2),
                    box: [+minX.toFixed(3), +minY.toFixed(3), +maxX.toFixed(3), +maxY.toFixed(3)],
                });
            });
            return { label, pets: rows, spots: Scene3D.petGroups.map(p => [+(p.userData.spotX).toFixed(2), +p.position.z.toFixed(2)]) };
        };

        const results = [];
        setMount(null); setPets(1); step(0.9); results.push(measure('pets-1'));
        setPets(3); step(0.9); results.push(measure('pets-3'));
        setMount('Brown Horse'); step(0.9); results.push(measure('pets-3+quad'));
        setMount('Mini Dragon'); step(0.9); results.push(measure('pets-3+fly'));
        setMount('Bike'); step(0.9); results.push(measure('pets-3+wheeled'));
        setMount('Hover Board'); step(0.9); results.push(measure('pets-3+flat'));
        setMount('Brown Horse'); Scene3D.walking = true; step(0.62); results.push(measure('pets-3+quad walk'));
        Scene3D.walking = false;
        return results;
    }, spotsArg);

    console.log('spots =', JSON.stringify(out[0].spots.map(s => s[0])), '(z는 케이스별 표기)');
    for (const r of out) {
        console.log(`\n[${r.label}]  spots(x,z)=${JSON.stringify(r.spots)}`);
        for (const p of r.pets) {
            const flag = p.occludedPct > 25 ? '❌' : p.occludedPct > 12 ? '⚠️ ' : '✅';
            console.log(`  ${flag} pet${p.i} ${String(p.name).padEnd(10)} 가림 ${String(p.occludedPct).padStart(5)}%  화면점유 ${String(p.areaPct).padStart(5)}%  box=${JSON.stringify(p.box)}`);
        }
    }
    const worst = Math.max(...out.flatMap(r => r.pets.map(p => p.occludedPct)));
    console.log(`\n최대 가림 = ${worst}%  → ${worst <= 12 ? 'PASS(<=12%)' : 'FAIL'}`);
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
})();
