// 떠 있는 부품 실측 — **펫·적·탈것 표 전체**를 한 자로 본다.
//
// 왜 또 만드나: `probe-mount-detached` 는 **탈것만** 보고, 게다가 오랫동안 **탈것 메시의 최상위
// 자식만** 훑어서 피벗(머리·날개) **안쪽에서** 떠 있는 조각을 구조적으로 못 봤다. 그 사각지대에
// 염소 뿔·낙타 귀·알파카 귀가 **머리 뒤 허공에 떠 있는 채로** 살아남았다(2026-08-25 육안 확인).
// 펫(`PET_MODELS`)·적(`ENEMY_MODELS`)은 **같은 빌더(`Mobs.build`)와 같은 저작 문법**을 쓰므로
// 같은 결함이 있을 수밖에 없는데, 지금까지 아무도 안 쟀다.
//
// 재는 법: 표를 그대로 `Mobs.build` 로 세우고, `userData.pid` 가 찍힌 **파츠 단위**로 월드 bbox 를
// 잡아 "가장 가까운 다른 파츠까지의 빈틈"을 낸다. 빈틈 ≤ ε(= 칸/4) 이면 붙은 것이다.
//   ⚠️ **맞닿음(빈틈 0)을 결함으로 세면 안 된다** — 다리는 어깨에서 아래로 달려 몸통 밑면에 정확히
//      접하고, `Voxel.build` 큐브 지터가 1e-3 남짓 틈을 얹는다. 그래서 ε 를 칸에 비례해 둔다.
//   ⚠️ 씬을 안 태우고 **표만** 태운다 — 스케일·부양·마구는 이 결함과 무관하고, 씬을 태우면
//      종당 수 초가 붙어 전 표(70종+)를 한 판에 못 돈다.
//
// 사용: node probe-mob-detached.js [pets|enemies|mounts ...]   (기본: 셋 다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

const FAMS = process.argv.slice(2).length ? process.argv.slice(2) : ['pets', 'enemies', 'mounts'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Mobs !== "undefined" && typeof PET_MODELS !== "undefined" && typeof ENEMY_MODELS !== "undefined"');

    const out = await page.evaluate((fams) => {
        const TABLES = { pets: PET_MODELS, enemies: ENEMY_MODELS, mounts: MOUNT_MODELS };
        const gapOf = (a, b) => {
            const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
            const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
            const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
            return Math.hypot(dx, dy, dz);
        };
        const rows = [];
        let selftest = null;
        for (const fam of fams) {
            const table = TABLES[fam];
            if (!table) { rows.push({ fam, name: '(그런 표가 없다)', bad: true, loose: [] }); continue; }
            for (const name of Object.keys(table)) {
                const model = table[name];
                if (!model || !model.parts) continue;
                const cell = model.cell || 0.03;
                const EPS = cell * 0.25;
                if (!selftest) {
                    // 판정 규칙 자체를 합성 상자로 역검증한다 — ε 를 넣고 "이제 아무것도 안 걸린다"를
                    // 통과로 읽으면 자가 죽은 것이다. 1.5칸은 반드시 잡히고 0.1칸은 반드시 안 잡혀야 한다.
                    const mk = (g) => {
                        const A = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(cell * 4, cell * 4, cell * 4));
                        const B = new THREE.Box3(new THREE.Vector3(0, cell * 4 + g, 0), new THREE.Vector3(cell * 4, cell * 8 + g, cell * 4));
                        return gapOf(A, B) > EPS;
                    };
                    selftest = { far: mk(cell * 1.5), near0: mk(cell * 0.1) };
                    selftest.ok = selftest.far === true && selftest.near0 === false;
                }
                let built;
                try { built = Mobs.build(model, { cell }); } catch (e) { rows.push({ fam, name, err: String(e), loose: [] }); continue; }
                built.group.updateMatrixWorld(true);
                // ⚠️ **떠 있는 게 정답인 파츠는 빼야 한다** — `joint.spin` 은 몸 둘레를 도는 위성
                //    (일렉트리의 스파크 구슬)이라 붙어 있으면 오히려 틀린다. 탈것 등자를 뺀 것과 같은 이유다.
                //    (pid 규칙은 `Mobs.build` 와 같아야 한다 — id → tag → 'part'+인덱스)
                const spin = new Set();
                model.parts.forEach((p, k) => { if (p && p.joint && p.joint.spin) spin.add(p.id || p.tag || ('part' + k)); });
                const parts = [];
                built.group.traverse(o => {
                    if (!o.isMesh || !o.userData.pid || spin.has(o.userData.pid)) return;
                    const b = new THREE.Box3().setFromObject(o);
                    if (!isFinite(b.min.x) || b.isEmpty()) return;
                    parts.push({ b, pid: o.userData.pid + (o.userData.pparent ? '<' + o.userData.pparent : '') });
                });
                const loose = [];
                for (const p of parts) {
                    let best = Infinity, bestPid = '?', touch = false;
                    for (const q of parts) {
                        if (q === p) continue;
                        const d = gapOf(p.b, q.b);
                        if (d <= EPS) { touch = true; break; }
                        if (d < best) { best = d; bestPid = q.pid; }
                    }
                    if (!touch && parts.length > 1)
                        loose.push({ pid: p.pid, gapCell: +(best / cell).toFixed(2), near: bestPid });
                }
                rows.push({ fam, name, n: parts.length, loose });
            }
        }
        return { rows, selftest };
    }, FAMS);

    await browser.close();
    let bad = 0, seen = 0;
    let fam = null;
    for (const r of out.rows) {
        if (r.fam !== fam) { fam = r.fam; console.log('\n── ' + fam + ' ──'); }
        seen++;
        if (r.err) { bad++; console.log('  ' + r.name.padEnd(20) + ' ✗ 빌드 실패 ' + r.err); continue; }
        if (!r.loose.length) continue;                    // 통과한 종은 안 찍는다 — 70종이 넘어 화면이 다 밀린다
        bad += r.loose.length;
        console.log('  ' + r.name.padEnd(20) + ' 파츠 ' + String(r.n).padStart(3) + ' → ✗ 따로 노는 조각 ' + r.loose.length);
        for (const l of r.loose)
            console.log('       ' + l.pid + ' — 가장 가까운 파츠(' + l.near + ')까지 빈틈 ' + l.gapCell + '칸');
    }
    const st = out.selftest;
    const blind = !st || !st.ok;
    console.log('\n🧪 역검증: 1.5칸 띈 합성 쌍을 잡았나=' + (st && st.far) + ' · 0.1칸 띈 쌍을 안 잡았나=' + (st && st.near0 === false)
        + (blind ? '  🚨 자가 눈이 멀었다' : '  ✓'));
    if (errors.length) console.log('\n콘솔 에러 ' + errors.length + '건:\n  ' + errors.slice(0, 5).join('\n  '));
    const ok = bad === 0 && !errors.length && !blind;
    console.log('\n' + (ok ? 'PASS' : 'FAIL') + ` — 종 ${seen}개 중 따로 노는 조각 ${bad}건 · 콘솔 에러 ${errors.length}건`);
    process.exit(ok ? 0 : 1);
})();
