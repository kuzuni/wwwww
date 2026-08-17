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
                // ⚠️ InstancedMesh는 geometry가 **기준 지오메트리 1개**라 matrixWorld만 곱하면
                //    전 인스턴스가 원점에 겹쳐 찍힌다 — 풀·자갈 같은 인스턴스 소품 가림을 0%로
                //    오보고하는 원인이었다. instanceMatrix를 반드시 각각 곱한다.
                const inst = o.isInstancedMesh ? o.count : 0;
                const im = new THREE.Matrix4();
                const emit = (mat) => {
                    for (let i = 0; i < pos.count; i += stride) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
                        const d = v.distanceTo(cam.position);
                        const p = v.clone().project(cam);
                        if (p.z < -1 || p.z > 1) continue;
                        pts.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2, d });
                    }
                };
                if (inst) {
                    const combined = new THREE.Matrix4();
                    for (let n = 0; n < inst; n++) {
                        o.getMatrixAt(n, im);
                        combined.multiplyMatrices(o.matrixWorld, im);
                        emit(combined);
                    }
                } else emit(o.matrixWorld);
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
            const mountPts = Scene3D.mountGroup ? projGroup(Scene3D.mountGroup) : [];
            const occ = depthMap(heroPts.concat(mountPts));
            // 항목의 합격 기준은 '영웅·탈것에 의한 가림'이지만, 실제로 "안 보인다"는 데는
            // 전경 소품(나무·바위)도 기여한다 — 원인을 분리해서 같이 계측한다.
            // 지면/하늘은 펫보다 항상 뒤이거나 아래이므로 깊이 비교에서 자연히 걸러진다.
            const petSet = new Set(Scene3D.petGroups);
            const propPts = [];
            for (const child of Scene3D.scene.children) {
                if (child === Scene3D.heroG || child === Scene3D.mountGroup || petSet.has(child)) continue;
                if (child.isLight || child.isCamera) continue;
                propPts.push(...projGroup(child));
            }
            const occAll = depthMap(heroPts.concat(mountPts, propPts));
            const rows = [];
            Scene3D.petGroups.forEach((pg, i) => {
                const pts = projGroup(pg);
                if (!pts.length) { rows.push({ i, name: pg.userData.name, cells: 0, occludedPct: 100, allPct: 100, note: 'off-screen' }); return; }
                const pd = depthMap(pts);
                let cells = 0, hidden = 0, hiddenAll = 0;
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (let k = 0; k < pd.length; k++) {
                    if (!isFinite(pd[k])) continue;
                    cells++;
                    const x = (k % GRID) / GRID, y = Math.floor(k / GRID) / GRID;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (isFinite(occ[k]) && occ[k] < pd[k] - 0.01) hidden++;
                    if (isFinite(occAll[k]) && occAll[k] < pd[k] - 0.01) hiddenAll++;
                }
                rows.push({
                    i, name: pg.userData.name,
                    cells, occludedPct: +(hidden / cells * 100).toFixed(1),
                    allPct: +(hiddenAll / cells * 100).toFixed(1),
                    // 화면 점유 비율(펫이 너무 작아 안 보이는 것도 문제라 같이 본다)
                    areaPct: +(cells / (GRID * GRID) * 100).toFixed(2),
                    box: [+minX.toFixed(3), +minY.toFixed(3), +maxX.toFixed(3), +maxY.toFixed(3)],
                });
            });
            // 영웅·탈것의 화면 박스 — 펫이 '가려지지는 않았지만 실루엣이 맞닿아 융합'하는 경우를
            // 잡으려면 겹침%만으로는 부족하다(비평가 지적: 초록 거북 ↔ 초록 탈것 명암비 1.14:1).
            const boxOf = (pts) => {
                if (!pts.length) return null;
                let a = 1, b = 1, c = 0, d = 0;
                for (const p of pts) { if (p.x < a) a = p.x; if (p.x > c) c = p.x; if (p.y < b) b = p.y; if (p.y > d) d = p.y; }
                return [+a.toFixed(3), +b.toFixed(3), +c.toFixed(3), +d.toFixed(3)];
            };
            const rider = boxOf(heroPts.concat(mountPts));
            // 펫 박스와 영웅·탈것 박스가 화면에서 겹치는 면적 비율(펫 박스 기준)
            for (const r of rows) {
                if (!rider || !r.box) { r.touch = 0; continue; }
                const ox = Math.max(0, Math.min(r.box[2], rider[2]) - Math.max(r.box[0], rider[0]));
                const oy = Math.max(0, Math.min(r.box[3], rider[3]) - Math.max(r.box[1], rider[1]));
                const area = (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]);
                r.touch = area > 0 ? +(ox * oy / area * 100).toFixed(1) : 0;
            }
            return { label, pets: rows, rider, spots: Scene3D.petGroups.map(p => [+(p.userData.spotX).toFixed(2), +p.position.z.toFixed(2)]) };
        };

        const results = [];
        setMount(null); setPets(1); step(0.9); results.push(measure('pets-1'));
        setPets(3); step(0.9); results.push(measure('pets-3'));
        setMount('Brown Horse'); step(0.9); results.push(measure('pets-3+quad'));
        setMount('Mini Dragon'); step(0.9); results.push(measure('pets-3+fly'));
        setMount('Bike'); step(0.9); results.push(measure('pets-3+wheeled'));
        setMount('Hover Board'); step(0.9); results.push(measure('pets-3+flat'));
        setMount('Brown Horse'); Scene3D.walking = true; step(0.62); results.push(measure('pets-3+quad walk'));

        // ── 행군 스윕: 소품은 월드 고정이고 x주기 26으로 재배치되므로(scene3d.js:5311),
        //    한 순간만 재면 "그 순간 나무가 없었을 뿐"인 상태를 통과로 오판한다.
        //    주기 한 바퀴(26 유닛)를 걸으면서 최악 가림을 찾는다. worldX += 1.7*dt → 26유닛 ≈ 15.3초.
        const sweep = [];
        setMount(null); setPets(3); Scene3D.walking = true;
        const startX = Scene3D.worldX;
        while (Scene3D.worldX - startX < 26.5) {
            step(0.3); // ≈0.5 유닛 전진마다 표본
            const m = measure('sweep');
            for (const p of m.pets) sweep.push({ w: +(Scene3D.worldX - startX).toFixed(1), i: p.i, name: p.name, hero: p.occludedPct, all: p.allPct });
        }
        Scene3D.walking = false;
        results.push({ label: '__sweep__', sweep });
        return results;
    }, spotsArg);

    for (const r of out) {
        if (r.label === '__sweep__') {
            console.log('\n===== 행군 스윕(소품 주기 26유닛 한 바퀴) — 펫별 최악 가림 =====');
            const byPet = new Map();
            for (const s of r.sweep) {
                const cur = byPet.get(s.i);
                if (!cur || s.all > cur.all) byPet.set(s.i, s);
            }
            for (const [i, s] of [...byPet.entries()].sort((a, b) => a[0] - b[0])) {
                const propOnly = +(s.all - s.hero).toFixed(1);
                const flag = s.all > 25 ? '❌' : s.all > 12 ? '⚠️ ' : '✅';
                console.log(`  ${flag} pet${i} ${String(s.name).padEnd(10)} 최악 총가림 ${String(s.all).padStart(5)}% (영웅·탈것 ${s.hero}% / 소품 ${propOnly}%)  @worldX +${s.w}`);
            }
            const bad = r.sweep.filter(s => s.all > 12).length;
            console.log(`  표본 ${r.sweep.length}개 중 가림>12% 표본 ${bad}개 (${(bad / r.sweep.length * 100).toFixed(1)}%)`);
            continue;
        }
        console.log(`\n[${r.label}]  spots(x,z)=${JSON.stringify(r.spots)}  영웅·탈것 화면박스=${JSON.stringify(r.rider)}`);
        for (const p of r.pets) {
            const flag = p.occludedPct > 25 ? '❌' : p.occludedPct > 12 ? '⚠️ ' : '✅';
            const propOnly = +(p.allPct - p.occludedPct).toFixed(1);
            const pflag = propOnly > 25 ? '❌' : propOnly > 12 ? '⚠️ ' : '  ';
            const tflag = p.touch > 60 ? '❌' : p.touch > 30 ? '⚠️ ' : '  ';
            console.log(`  ${flag} pet${p.i} ${String(p.name).padEnd(10)} 영웅·탈것가림 ${String(p.occludedPct).padStart(5)}%  ${pflag}소품가림 ${String(propOnly).padStart(5)}%  ${tflag}실루엣접촉 ${String(p.touch).padStart(5)}%  box=${JSON.stringify(p.box)}`);
        }
    }
    const worst = Math.max(...out.flatMap(r => r.label === '__sweep__' ? r.sweep.map(s => s.all) : r.pets.map(p => p.allPct)));
    console.log(`\n최대 가림 = ${worst}%  → ${worst <= 12 ? 'PASS(<=12%)' : 'FAIL'}`);
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
})();
