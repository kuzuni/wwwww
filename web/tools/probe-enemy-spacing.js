// 적 겹침 실측 프로브 — TODO '한 웨이브의 적 2~3마리가 전부 같은 지점에 멈춰 서로 관통하고
// HP바까지 포개진다' 항목의 수치 근거이자 회귀 게이트.
//
// 사용: node probe-enemy-spacing.js [--json]
//
// 왜 스크린샷이 아니라 투영 측정인가: "겹쳤다"는 3D 씬에서 눈대중으로 판정할 수 없다.
// 같은 색 계열 몬스터 둘이 붙어 서면 사람 눈에도 한 덩어리로 보이고, 이 스케줄 환경의
// swiftshader는 스크린샷 한 장에 15~30초가 걸려 회차 반복이 불가능하다. 그래서 렌더 없이
// **버텍스를 카메라로 투영해 화면 좌표 격자에 래스터화**하고 개체별 실루엣을 직접 센다.
// (probe-pet-occlusion.js와 같은 방식 — 그쪽에서 검증된 함정 회피도 그대로 가져왔다.)
//
// 재는 것 3가지:
//   ① hiddenPct — 적 i의 실루엣 셀 중 "더 카메라에 가까운 다른 적"에 가려진 비율.
//      이게 개체 판독성의 본 지표다. 몸이 서로 파묻히면 바로 튄다.
//   ② 바 판독 — 머리 위 HP바를 화면 좌표 사각형으로 투영해 모든 쌍을 본다. 한 쌍이 읽히려면
//      **가로로 떨어져 있거나(≥4px) 세로로 확실히 다른 줄에 있어야(≥22px ≈ 바 높이 3배)** 한다.
//      "세로로 겹치는 쌍만" 보던 초판은 바 y가 7px 어긋난 것도 통과시켰는데, 그건 원 지적이
//      말한 "바 2~3개가 10~20px 간격으로 포개진" 바로 그 상태다 — 기준을 그래서 두 갈래로 뒀다.
//   ③ onScreen — 적 실루엣 중심이 뷰포트 안에 있는가. 겹침을 x로 벌려 푸는 수정은
//      **적을 화면 밖으로 밀어내는 방식으로 부정 통과할 수 있다** — 그걸 막는 가드다.
//
// ⚠️ 측정 함정(선행 세션이 실제로 밟음): 렌더 프레임률이 낮으면 논리 x와 메시 x가 어긋나
//    HP바가 몸에서 떨어져 보인다. 여기서는 Scene3D.update를 **직접 고정 스텝으로 구동**하고
//    (rAF에 맡기지 않는다) 측정 직전에 한 번 더 수렴시켜 그 아티팩트를 배제한다.
//
// 종료 코드: 0=PASS, 1=기준 미달, 2=캘리브레이션 실패(측정기 고장)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 판정 기준
const MAX_HIDDEN = 12;   // % — 한 마리가 다른 적에 가려도 되는 실루엣 비율 상한
const BAR_H_GAP = 4;     // px — HP바 쌍이 가로로 갈렸다고 인정하는 최소 간격
const BAR_V_GAP = 22;    // px — 가로로 겹칠 때, 다른 줄로 읽히려면 필요한 세로 간격 (바 높이 ≈7px의 3배)
const JSON_OUT = process.argv.includes('--json');

// 뷰포트는 앱 실측 기준 2종 + 좁은 기기 1종. `--vp 499x892` 로 하나만 돌려 튜닝을 빨리 돌린다
// (swiftshader에서 페이지 부팅이 뷰포트당 1분 남짓이라 전 뷰포트 왕복은 튜닝 루프에 너무 느리다).
const ALL_VIEWPORTS = [{ width: 499, height: 892 }, { width: 430, height: 860 }, { width: 360, height: 640 }];
const vpArg = (() => { const i = process.argv.indexOf('--vp'); return i < 0 ? null : process.argv[i + 1]; })();
const VIEWPORTS = vpArg
    ? vpArg.split(',').map(s => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; })
    : ALL_VIEWPORTS;
// 종 조합 순환 중 볼 것 (기본 7종 전부). `--seq 0,3` 로 좁힌다.
const seqArg = (() => { const i = process.argv.indexOf('--seq'); return i < 0 ? null : process.argv[i + 1].split(',').map(Number); })();
const SEQS = seqArg || [0, 1, 2, 3, 4, 5, 6];
// 파라미터 스윕: `--params "0.62/0.2/0,0.95,-0.9; 0.8/0.24/0,1.1,-1.05"` — 세트마다 전 조합을 재고 비교표를 낸다
const paramsArg = (() => {
    const i = process.argv.indexOf('--params');
    if (i < 0) return null;
    return process.argv[i + 1].split(';').map(s => {
        const [pack, gap, lanes] = s.trim().split('/');
        return { pack: Number(pack), gap: Number(gap), lanes: lanes.split(',').map(Number) };
    });
})();

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const report = [];
    let failed = 0, calibFailed = 0;

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(
            () => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined',
            null, { timeout: 30000 });
        await page.waitForTimeout(1200);

        const out = await page.evaluate(({ BAR_H_GAP, BAR_V_GAP, SEQS, PARAMS }) => {
            // ── 시뮬레이션을 손에 쥔다: rAF·엔진 틱을 끊고 고정 스텝으로만 굴린다.
            const realUpdate = Scene3D.update.bind(Scene3D);
            Scene3D.update = () => { };
            const realTick = Combat.tick.bind(Combat);
            Combat.tick = () => { };
            Combat.damageHero = () => { };          // 영웅이 죽어 웨이브가 리셋되면 측정이 무의미
            Scene3D.shake = () => { };              // 카메라 흔들림이 투영에 섞이지 않게

            // 파일에 박힌 기본 파라미터 — 스윕이 끝나면 여기로 되돌린다
            const DEF = { pack: Combat.MELEE_PACK, gap: Combat.MELEE_GAP, lanes: Combat.MELEE_LANE_Z.slice() };

            const cam = Scene3D.camera;
            const W = window.innerWidth, H = window.innerHeight;

            // 논리 dt와 렌더 dt를 같은 시간축으로 함께 전진시킨다(둘이 어긋나면 바가 몸에서 뜬다).
            const step = (sec) => {
                const n = Math.max(1, Math.round(sec / (1 / 60)));
                for (let i = 0; i < n; i++) { realTick(1 / 60); realUpdate(1 / 60); }
            };
            const settle = () => { for (let i = 0; i < 90; i++) realUpdate(1 / 60); }; // 위치 lerp 수렴

            // ── 화면 좌표 투영
            const _v = new THREE.Vector3();
            const project = (v) => {
                _v.copy(v).project(cam);
                return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, z: _v.z };
            };

            // ── 그룹 실루엣을 격자에 래스터화 (셀별 최소 깊이)
            const GRID_W = 160, GRID_H = 280;
            const rasterGroup = (root) => {
                const grid = new Float64Array(GRID_W * GRID_H).fill(Infinity);
                if (!root) return grid;
                root.updateWorldMatrix(true, true);
                const v = new THREE.Vector3();
                root.traverse(o => {
                    if (!o.isMesh || o.visible === false) return;
                    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                    if (!pos) return;
                    const stride = Math.max(1, Math.floor(pos.count / 260));
                    for (let i = 0; i < pos.count; i += stride) {
                        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam);
                        if (v.z < -1 || v.z > 1) continue;
                        const gx = Math.floor((v.x * 0.5 + 0.5) * GRID_W);
                        const gy = Math.floor((-v.y * 0.5 + 0.5) * GRID_H);
                        if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
                        const k = gy * GRID_W + gx;
                        if (v.z < grid[k]) grid[k] = v.z;
                    }
                });
                return grid;
            };

            // ── 한 프레임 상태를 측정
            const measure = () => {
                const alive = Combat.enemies.filter(e => e.alive);
                const per = alive.map(e => {
                    const m = Scene3D.enemyMap.get(e.id);
                    return { e, m, grid: rasterGroup(m && m.g) };
                }).filter(r => r.m);

                const res = [];
                for (let i = 0; i < per.length; i++) {
                    const a = per[i];
                    let cells = 0, hidden = 0;
                    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
                    for (let k = 0; k < a.grid.length; k++) {
                        const d = a.grid[k];
                        if (d === Infinity) continue;
                        cells++;
                        const gx = k % GRID_W, gy = (k / GRID_W) | 0;
                        if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
                        if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
                        for (let j = 0; j < per.length; j++) {
                            if (j === i) continue;
                            // 같은 방향에 더 가까운(작은 z) 다른 적이 있으면 가려진 셀
                            if (per[j].grid[k] < d - 1e-6) { hidden++; break; }
                        }
                    }
                    // HP바 화면 사각형 (scene 직속 hpG의 배경판 폭 0.86 × 높이 0.135, 그룹 스케일 반영)
                    let bar = null;
                    if (a.m.hpG && a.m.hpBg) {
                        const s = a.m.hpG.scale.x || 1;
                        const c = a.m.hpG.position, by = a.m.hpBg.position.y;
                        const L = project(new THREE.Vector3(c.x - 0.43 * s, c.y + by * s, c.z));
                        const R = project(new THREE.Vector3(c.x + 0.43 * s, c.y + by * s, c.z));
                        bar = {
                            x0: Math.min(L.x, R.x), x1: Math.max(L.x, R.x),
                            y: (L.y + R.y) / 2, h: Math.abs(R.x - L.x) * (0.135 / 0.86),
                        };
                    }
                    const cx = cells ? ((minX + maxX) / 2) / GRID_W * window.innerWidth : -1;
                    res.push({
                        id: a.e.id, kind: a.m.kind, x: +a.e.x.toFixed(3),
                        z: +(a.m.g.position.z).toFixed(3),
                        cells,
                        hiddenPct: cells ? +(hidden / cells * 100).toFixed(1) : 0,
                        bboxPx: cells ? {
                            x0: +(minX / GRID_W * W).toFixed(1), x1: +((maxX + 1) / GRID_W * W).toFixed(1),
                            y0: +(minY / GRID_H * H).toFixed(1), y1: +((maxY + 1) / GRID_H * H).toFixed(1),
                        } : null,
                        centerPx: +cx.toFixed(1),
                        onScreen: cells > 0 && cx >= 0 && cx <= W,
                        bar,
                    });
                }

                // HP바 쌍 판독: 모든 쌍이 가로로 떨어졌거나(hGap) 세로로 다른 줄이어야(vGap) 한다
                const barPairs = [];
                let worstPair = null;
                for (let i = 0; i < res.length; i++) {
                    for (let j = i + 1; j < res.length; j++) {
                        const A = res[i].bar, B = res[j].bar;
                        if (!A || !B) continue;
                        const hGap = Math.max(A.x0, B.x0) <= Math.min(A.x1, B.x1)
                            ? -(Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0))   // 겹침량(음수)
                            : Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1);
                        const vGap = Math.abs(A.y - B.y);
                        // 판독 여유: 두 갈래 중 나은 쪽을 정규화(1.0 = 딱 기준선)해서 비교한다
                        const score = Math.max(hGap / BAR_H_GAP, vGap / BAR_V_GAP);
                        const p = { a: res[i].id, b: res[j].id, hGapPx: +hGap.toFixed(1), vGapPx: +vGap.toFixed(1), ok: score >= 1 };
                        barPairs.push(p);
                        if (!worstPair || score < worstPair.score) worstPair = { ...p, score: +score.toFixed(2) };
                    }
                }
                return { per: res, barPairs, worstPair, barsOk: barPairs.every(p => p.ok) };
            };

            // ── 웨이브를 결정적으로 세운다: 3마리, 죽지 않게 HP를 크게, 도착까지 전진
            // seq를 고정해 종 조합까지 재현 가능하게 한다(kind = kinds[(id + chapter*2) % 7]).
            const setupWave = (seq) => {
                Scene3D.clearEnemies();
                Combat.enemies = [];
                Combat.phase = 'fight';
                Combat.wave = 3;                 // 3마리 스폰 (보스 아님)
                if (seq !== undefined) Combat._enemySeq = seq;
                Combat.spawnWave();
                for (const e of Combat.enemies) { e.hp = Big.of(1e30); e.maxHp = Big.of(1e30); }
                step(9);                          // 전부 걸어와 정지선에 도달하기 충분한 시간
                settle();
                return measure();
            };

            // 종 조합은 id에 따라 도는 고정 순환이라, 한 조합만 재면 "그 조합만 통과"가 된다.
            // 7종 순환을 한 바퀴 돌려 **가장 나쁜 조합**을 판정 대상으로 삼는다.
            const runSeqs = () => {
                const cs = [];
                for (const s of SEQS) {
                    const r = setupWave(s);
                    const worst = Math.max(...r.per.map(p => p.hiddenPct));
                    cs.push({ seq: s, kinds: r.per.map(p => p.kind).join('+'), worstHidden: worst, barsOk: r.barsOk, worstPair: r.worstPair, off: r.per.filter(p => !p.onScreen).length, per: r.per });
                }
                cs.sort((a, b) => b.worstHidden - a.worstHidden);
                return cs;
            };

            // 파라미터 스윕(옵션): 세트를 갈아 끼우며 같은 조합들을 재고 표로 비교한다.
            // 실제 게이트는 파일에 박힌 기본값으로 도는 아래 combos 쪽이다.
            const sweep = [];
            if (PARAMS && PARAMS.length) {
                for (const p of PARAMS) {
                    Combat.MELEE_PACK = p.pack; Combat.MELEE_GAP = p.gap; Combat.MELEE_LANE_Z = p.lanes;
                    const cs = runSeqs();
                    sweep.push({
                        params: p, worstHidden: cs[0].worstHidden,
                        medHidden: +(cs.map(c => c.worstHidden).sort((a, b) => a - b)[Math.floor(cs.length / 2)]).toFixed(1),
                        off: cs.reduce((n, c) => n + c.off, 0), barsOk: cs.every(c => c.barsOk),
                    });
                }
                Combat.MELEE_PACK = DEF.pack; Combat.MELEE_GAP = DEF.gap; Combat.MELEE_LANE_Z = DEF.lanes;
            }

            const combos = runSeqs();

            // ── 캘리브레이션: 측정기가 "진짜 겹침"을 겹침으로 잡는지 자기검증한다.
            // 마지막 조합의 적들을 같은 한 점으로 강제로 밀어넣고 hiddenPct가 크게 튀는지 본다.
            // 여기서 안 튀면 위 PASS는 측정기 고장에 의한 오통과이므로 신뢰할 수 없다.
            const calib = (() => {
                const alive = Combat.enemies.filter(e => e.alive);
                if (alive.length < 2) return { ok: false, why: '적이 2마리 미만' };
                for (const e of alive) {
                    const m = Scene3D.enemyMap.get(e.id);
                    if (!m) continue;
                    m.g.position.x = Combat.HERO_X + Scene3D.worldX + 0.85;
                    m.g.position.z = 0;
                    if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
                }
                const c = measure();
                const worst = Math.max(...c.per.map(p => p.hiddenPct));
                return { ok: worst >= 25, worstHiddenPct: worst, barsOk: c.barsOk };
            })();

            return { combos, sweep, calib, W, H, params: { pack: Combat.MELEE_PACK, gap: Combat.MELEE_GAP, lanes: Combat.MELEE_LANE_Z } };
        }, { BAR_H_GAP, BAR_V_GAP, SEQS, PARAMS: paramsArg });

        const { combos, sweep, calib, W, H, params } = out;
        const worstHidden = combos[0].worstHidden;
        const offScreen = combos.reduce((n, c) => n + c.off, 0);
        const barsOk = combos.every(c => c.barsOk);
        const ok = calib.ok && worstHidden <= MAX_HIDDEN && offScreen === 0 && barsOk && errors.length === 0;
        if (!calib.ok) calibFailed++;
        if (!ok) failed++;

        report.push({ vp: `${vp.width}x${vp.height}`, ok, worstHidden, offScreen, barsOk, calib, params, errors, combos });

        if (!JSON_OUT) {
            console.log(`\n=== ${vp.width}x${vp.height} (앱 ${W}x${H}) — ${ok ? 'PASS' : 'FAIL'} ===`);
            console.log(`  파라미터: PACK=${params.pack} GAP=${params.gap} LANES=[${params.lanes}]`);
            for (const sw of (sweep || [])) console.log(`  [스윕] PACK=${sw.params.pack} GAP=${sw.params.gap} LANES=[${sw.params.lanes}] → 최악가림=${sw.worstHidden}% 중앙=${sw.medHidden}% 화면밖=${sw.off} 바=${sw.barsOk ? 'ok' : 'NG'}`);
            console.log(`  캘리브레이션(전원 한 점 강제): ${calib.ok ? 'OK' : '실패'} worstHidden=${calib.worstHiddenPct}% 바판독=${calib.barsOk ? 'ok' : 'NG'}`);
            for (const c of combos) {
                const wp = c.worstPair;
                console.log(`  [seq ${c.seq}] ${c.kinds.padEnd(24)} 최악가림=${String(c.worstHidden).padStart(5)}% 화면밖=${c.off} ` +
                    `바=${c.barsOk ? 'ok ' : 'NG '}(최악쌍 h=${wp ? wp.hGapPx : '-'}px v=${wp ? wp.vGapPx : '-'}px)`);
            }
            const w = combos[0];
            console.log(`  최악 조합 상세 (${w.kinds}):`);
            for (const p of w.per) {
                console.log(`    #${p.id} ${p.kind.padEnd(9)} x=${String(p.x).padStart(6)} z=${String(p.z).padStart(6)} ` +
                    `가림=${String(p.hiddenPct).padStart(5)}%  중심=${String(p.centerPx).padStart(6)}px ${p.onScreen ? '' : '⚠️화면밖'} ` +
                    `bar=[${p.bar ? p.bar.x0.toFixed(0) + '~' + p.bar.x1.toFixed(0) + ' y' + p.bar.y.toFixed(0) : '-'}]`);
            }
            console.log(`  판정: 최악 가림 ${worstHidden}% (기준 ≤${MAX_HIDDEN}%) / 바 판독 ${barsOk ? 'PASS' : 'FAIL'} / 화면밖 ${offScreen}마리 / 콘솔에러 ${errors.length}건`);
            if (errors.length) errors.slice(0, 4).forEach(e => console.log('   ! ' + e));
        }
        await page.close();
    }

    await browser.close();
    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    else console.log(`\n총평: ${VIEWPORTS.length - failed}/${VIEWPORTS.length} 뷰포트 PASS`);
    process.exit(calibFailed ? 2 : (failed ? 1 : 0));
})();
