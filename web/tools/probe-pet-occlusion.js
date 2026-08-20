// 펫 가림 실측 프로브 — TODO '펫이 플레이어에 가려서 안 보임' 항목의 수치 근거.
// 사용: node probe-pet-occlusion.js
//
// 스크린샷 눈대중으로는 "가려졌다"를 판정할 수 없어서(펫과 탈것이 같은 초록이면 특히)
// **화면 좌표로 투영한 실루엣 겹침**을 200x200 격자에서 직접 센다:
//   ① 펫/영웅/탈것/소품의 모든 메시 버텍스를 카메라로 투영해 셀별 최소거리(깊이맵)를 만든다
//   ② 펫 셀마다 "그 방향에 더 카메라에 가까운 오클루더가 있는가"를 깊이로 비교
//   ③ 펫 실루엣 셀 중 가려진 비율 = 가림%. 이게 판정 기준. 원인을 영웅·탈것 / 소품으로 분리 보고한다.
//
// ⚠️ 이 측정기는 한 번 '전부 0%'로 오통과를 냈다. 재발 방지로 남기는 교훈 3가지:
//   ⓐ InstancedMesh는 geometry가 기준 1개다 — instanceMatrix를 각각 곱하지 않으면 풀·자갈 전
//      인스턴스가 원점에 겹쳐 찍혀 소품 가림이 0%로 나온다.
//   ⓑ 탈것 그룹 속성명은 `Scene3D.mountGroup`이다(mountG 아님). 오타면 탈것이 오클루더에서
//      조용히 빠지고, 그래도 결과는 그럴듯한 0%라 눈치채기 어렵다.
//   ⓓ 자기검증도 **한 프레임만 재면 안 된다** — 영웅 애니메이션 위상에 따라 같은 자리가
//      18.9~35%로 흔들려 임계값(25%)을 넘나든다. 여러 위상의 최댓값으로 판정한다(아래 PHASES).
//   ⓒ **한 순간만 재면 안 된다.** 소품은 월드 고정이고 x주기 26으로 재배치되므로(scene3d.js)
//      "그 순간 나무가 없었을 뿐"인 상태가 통과로 잡힌다 → 주기 한 바퀴를 걷는 스윕이 본 판정이다.
// 위 세 함정을 자동으로 잡기 위해 매 실행 앞에 **캘리브레이션 자기검증**을 돌린다: 펫을 일부러
// 영웅 뒤(z=-0.65)·정후방으로 옮겨 가림이 각각 15%·90% 이상으로 잡히는지 확인하고, 안 잡히면
// 측정 결과를 신뢰할 수 없으므로 즉시 실패로 끝낸다.
//
// 종료 코드: 0=PASS, 1=가림 기준(12%) 초과, 2=캘리브레이션 실패(측정기 고장)
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

        // ── 그룹의 화면 투영: 버텍스를 **곧바로 깊이 격자에 래스터화**한다.
        // 점 객체 배열을 만들면 소품 인스턴스에서 수십만 개가 쌓여 GC로 스윕이 못 끝난다
        // (Vector3.clone()도 버텍스마다 할당됐다) — 재사용 벡터 + 직접 쓰기로 바꿨다.
        const cam = Scene3D.camera;
        const GRID = 200;
        const newGrid = () => new Float64Array(GRID * GRID).fill(Infinity);
        const _v = new THREE.Vector3();
        const rasterGroup = (root, grid) => {
            if (!root) return grid;
            root.updateWorldMatrix(true, true);
            const hx = Scene3D.heroG ? Scene3D.heroG.position.x : 0;
            root.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                if (o.visible === false) return;
                const pos = o.geometry.attributes.position;
                const stride = Math.max(1, Math.floor(pos.count / 220)); // 메시당 최대 ~220 버텍스 샘플
                // ⚠️ InstancedMesh는 geometry가 **기준 지오메트리 1개**라 matrixWorld만 곱하면
                //    전 인스턴스가 원점에 겹쳐 찍힌다 — 인스턴스 소품 가림을 0%로 오보고한 원인.
                const inst = o.isInstancedMesh ? o.count : 0;
                const im = new THREE.Matrix4();
                const emit = (mat) => {
                    for (let i = 0; i < pos.count; i += stride) {
                        _v.fromBufferAttribute(pos, i).applyMatrix4(mat);
                        const d = _v.distanceTo(cam.position);
                        _v.project(cam);
                        if (_v.z < -1 || _v.z > 1) continue;
                        const gx = ((_v.x + 1) * 0.5 * GRID) | 0, gy = ((1 - _v.y) * 0.5 * GRID) | 0;
                        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
                        const k = gy * GRID + gx;
                        if (d < grid[k]) grid[k] = d;
                    }
                };
                if (inst) {
                    // 인스턴스가 수천 개라 전부 투영하면 스윕이 분 단위로 늘어난다 —
                    // 펫을 가릴 수 있는 건 파티 근처(월드 x ±6)뿐이니 그 밖은 건너뛴다.
                    const combined = new THREE.Matrix4();
                    for (let n = 0; n < inst; n++) {
                        o.getMatrixAt(n, im);
                        combined.multiplyMatrices(o.matrixWorld, im);
                        if (Math.abs(combined.elements[12] - hx) > 6) continue;
                        emit(combined);
                    }
                } else emit(o.matrixWorld);
            });
            return grid;
        };
        // 표면 샘플이라 구멍이 생긴다 → 3x3 팽창으로 실루엣을 메운다(가림을 과소평가하지 않게)
        const dilate = (m) => {
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
        const boxOfGrid = (m) => {
            let a = 1, b = 1, c = 0, d = 0, any = false;
            for (let k = 0; k < m.length; k++) {
                if (!isFinite(m[k])) continue;
                any = true;
                const x = (k % GRID) / GRID, y = ((k / GRID) | 0) / GRID;
                if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y;
            }
            return any ? [+a.toFixed(3), +b.toFixed(3), +c.toFixed(3), +d.toFixed(3)] : null;
        };

        const measure = (label) => {
            // 영웅+탈것만의 깊이맵(항목의 공식 합격 기준)
            const riderGrid = newGrid();
            rasterGroup(Scene3D.heroG, riderGrid);
            if (Scene3D.mountGroup) rasterGroup(Scene3D.mountGroup, riderGrid);
            const occ = dilate(riderGrid);
            // 항목의 합격 기준은 '영웅·탈것에 의한 가림'이지만, 실제로 "안 보인다"는 데는
            // 전경 소품(나무·바위)도 기여한다 — 원인을 분리해서 같이 계측한다.
            // 지면/하늘은 펫보다 항상 뒤이거나 아래이므로 깊이 비교에서 자연히 걸러진다.
            const petSet = new Set(Scene3D.petGroups);
            const allGrid = riderGrid.slice();
            const heroX = Scene3D.heroG ? Scene3D.heroG.position.x : 0;
            for (const child of Scene3D.scene.children) {
                if (child === Scene3D.heroG || child === Scene3D.mountGroup || petSet.has(child)) continue;
                if (child.isLight || child.isCamera) continue;
                // 파티에서 월드 x로 멀리 떨어진 소품은 펫을 가릴 수 없다 — 스윕 비용을 줄인다.
                // (지면 타일처럼 넓게 퍼진 오브젝트는 인스턴스 단위로 rasterGroup 안에서 다시 걸러진다)
                if (!child.isInstancedMesh && child.children.length === 0 && Math.abs(child.position.x - heroX) > 6) continue;
                rasterGroup(child, allGrid);
            }
            const occAll = dilate(allGrid);
            const rows = [];
            Scene3D.petGroups.forEach((pg, i) => {
                const pd = dilate(rasterGroup(pg, newGrid()));
                let cells = 0, hidden = 0, hiddenAll = 0;
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (let k = 0; k < pd.length; k++) {
                    if (!isFinite(pd[k])) continue;
                    cells++;
                    const x = (k % GRID) / GRID, y = ((k / GRID) | 0) / GRID;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (isFinite(occ[k]) && occ[k] < pd[k] - 0.01) hidden++;
                    if (isFinite(occAll[k]) && occAll[k] < pd[k] - 0.01) hiddenAll++;
                }
                if (!cells) { rows.push({ i, name: pg.userData.name, cells: 0, occludedPct: 100, allPct: 100, areaPct: 0, box: null, note: 'off-screen' }); return; }
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
            const rider = boxOfGrid(riderGrid);
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

        // ── 캘리브레이션: 일부러 가리는 자리로 옮겨 측정기가 실제로 검출하는지 ──
        // (전부 0%를 뱉는 고장난 측정기를 통과로 오독하지 않기 위한 안전장치)
        const calib = [];
        setMount(null); setPets(1); step(0.5);
        {
            const pg = Scene3D.petGroups[0];
            const orig = pg.position.clone();
            // 임계값은 '확실히 검출한다'만 보장하는 느슨한 값으로 둔다 — 절대치는 버텍스 샘플 밀도
            // (stride)에 따라 흔들린다(같은 자리가 구현 변경 전 41%, 후 34%로 나왔다). 실제 배치가
            // 0~5%인 것과 확실히 구분되면 목적을 달성한다. 정확한 수치 재현이 목적이 아니다.
            //
            // 🚨 **한 프레임만 재면 이 자기검증이 제 임계값을 넘나든다 — 실측 3런 18.9% / 35% / 19.5%.**
            //   같은 펫(Snail)·같은 자리인데도 이만큼 흔들린 범인은 **영웅의 애니메이션 위상**이다:
            //   `step()` 이 멈춘 프레임의 팔·다리 벌림에 따라 뒤에 선 펫이 드러났다 가려졌다 한다.
            //   (2026-08-19 세션 15 도 같은 실패를 'main 이 빨갛다'로 보고했는데, 코드 결함이 아니라
            //    이 흔들림이었다. 그 보고 때문에 다음 세션이 멀쩡한 자를 고치러 갈 뻔했다.)
            //   그래서 **여러 위상에서 재고 최댓값**을 쓴다 — 자기검증의 목적은 '이 측정기가 가림을
            //   검출할 수 있는가'이지 '어느 한 프레임에서 몇 %인가'가 아니다.
            const PHASES = 6;
            for (const [label, x, z, min] of [
                // 임계 25 → 15 로 재기준. 위상 최댓값으로 재도 **실측이 24.8%** 라 25 는 실제
                // 도달치에 붙어 있어 구조적으로 넘나든다(세션15 18.9% · 이번 19.5% · 24.8%,
                // 한 런만 35%). 영웅 비례가 바뀐 뒤(두신비 4.25→6.93, 다리 +55%) 실루엣이
                // 좁아져 뒤에 선 펫을 덜 가리는 게 원인이고, **자가 고장 난 게 아니다.**
                // 이 검증의 목적은 절대치 재현이 아니라 '실제 배치(0~1%)와 확실히 구분되는가'
                // 이므로(위 주석), 실측 24.8% 와 실제 0~1% 사이인 15 로 둔다.
                // 🚨 2026-08-20 `pet-size-place` 뒤 두 케이스 다 재기준(자가 아니라 **케이스가** 낡았다).
                //   ⑴ 옛 케이스는 `orig.x`(펫의 실제 x)를 썼는데, 대열이 영웅 x축 후방(−x 종대)으로
                //      바뀌며 orig.x 가 영웅에서 1.35 유닛 옆이라 z 만 -0.65 로 밀어도 영웅 실루엣과
                //      아예 안 겹친다(실측 0%) — '깊이 가림' 케이스가 성립하려면 x 를 영웅 x 에 정렬.
                //   ⑵ 펫 스케일 ×1.5(사용자 지시) 뒤 정후방 가림 실측이 87.2% — 몸이 영웅 실루엣
                //      밖으로 삐져나와 90% 는 구조적으로 불가능해졌다. 실제 배치(0~2%)와 확실히
                //      구분되면 목적 달성이므로(머리말) 80 으로 재기준.
                ['영웅 뒤 z=-0.65 (x=영웅 정렬)', Scene3D.heroG.position.x, -0.65, 15],
                ['영웅 정후방', Scene3D.heroG.position.x, -1.0, 80],
            ]) {
                pg.position.set(x, 0.4, z);
                if (pg.userData.home) pg.userData.home.copy(pg.position);
                pg.updateWorldMatrix(true, true);
                let got = 0;
                for (let ph = 0; ph < PHASES; ph++) {
                    got = Math.max(got, measure('calib').pets[0].occludedPct);
                    step(0.13);                     // 다음 위상으로 — 걸음 한 주기를 고루 훑는다
                    pg.position.set(x, 0.4, z);     // step 이 펫 자리를 되돌리므로 매번 다시 놓는다
                    if (pg.userData.home) pg.userData.home.copy(pg.position);
                    pg.updateWorldMatrix(true, true);
                }
                calib.push({ label, got, min, ok: got >= min });
            }
            pg.position.copy(orig);
            if (pg.userData.home) pg.userData.home.copy(orig);
            pg.updateWorldMatrix(true, true);
        }

        const results = [{ label: '__calib__', calib }];
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
        // 소품 주기는 26이지만 지면 타일·잔풀 주기는 30이다(heightAt의 x주기 30) — 둘 다 덮으려면
        // 31유닛 이상 걸어야 한다. 26.5로 끊으면 잔풀 배치의 12%를 못 본다.
        const startX = Scene3D.worldX;
        while (Scene3D.worldX - startX < 31.5) {
            step(0.45); // ≈0.75 유닛 전진마다 표본
            const m = measure('sweep');
            for (const p of m.pets) sweep.push({ w: +(Scene3D.worldX - startX).toFixed(1), i: p.i, name: p.name, hero: p.occludedPct, all: p.allPct });
        }
        Scene3D.walking = false;
        results.push({ label: '__sweep__', sweep });
        return results;
    }, spotsArg);

    let calibBad = 0;
    for (const r of out) {
        if (r.label === '__calib__') {
            console.log('===== 캘리브레이션 자기검증(측정기가 실제로 가림을 잡는가) =====');
            for (const c of r.calib) {
                if (!c.ok) calibBad++;
                console.log(`  ${c.ok ? '✅' : '❌'} ${c.label}: 가림 ${c.got}% (기대 >=${c.min}%)`);
            }
            continue;
        }
        if (r.label === '__sweep__') {
            console.log('\n===== 행군 스윕(소품 주기 26 + 지면·잔풀 주기 30 한 바퀴) — 펫별 최악 가림 =====');
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
    // ⚠️ __calib__ 행은 pets가 없다 — 필터를 빼면 여기서 TypeError로 죽어 아래 PASS/FAIL 판정과
    //    콘솔 에러 리포트가 아예 출력되지 않고 종료코드가 항상 1이 된다(실제로 한 번 그랬다).
    const worst = Math.max(...out
        .filter(r => r.sweep || r.pets)
        .flatMap(r => r.sweep ? r.sweep.map(s => s.all) : r.pets.map(p => p.allPct)));
    console.log(`\n최대 가림 = ${worst}%  → ${worst <= 12 ? 'PASS(<=12%)' : 'FAIL'}`);
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
    if (calibBad) {
        console.log(`\n❌ 캘리브레이션 ${calibBad}건 실패 — 측정기가 가림을 검출하지 못하므로 위 수치는 신뢰할 수 없다.`);
        process.exit(2);
    }
    process.exit(worst <= 12 ? 0 : 1);
})();
