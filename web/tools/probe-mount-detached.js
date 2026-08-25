// 떠 있는 부품 실측 (`mount-species-recognizable` 채점 결함 ⓓ).
//
// 1차 채점에서 비평가 2인이 공통으로 "부품이 몸에서 떨어져 공중에 떠 있다"고 읽은 자리를
// 눈대중이 아니라 수치로 잡는다. 앞선 세션들이 미니 드래곤·거대 벌·태엽 생쥐를 이 방식으로
// 닫았고, 남은 것이 **자전거 핸들바 · 별고래 가슴지느러미** 둘이다.
//
// 재는 법: 탈것 메시의 최상위 자식을 전부 훑어 **자기 바운딩박스가 다른 어떤 파츠의
// 바운딩박스와도 안 겹치는 것**을 찾는다. 겹치는 파츠가 하나도 없으면 그 부품은 화면에서
// '따로 노는 조각'이다 — 사람이 '떠 있다'고 읽는 것의 기계적 정의다.
// 겹치지 않는 파츠에 대해서는 **가장 가까운 파츠까지의 빈틈(gap)** 을 같이 낸다.
//
// ⚠️ 바운딩박스는 회전한 얇은 판을 실제보다 크게 잡는다(축정렬이라). 그래서 이 판정기는
//    '틈 > 0' 을 결함으로 보되, **틈이 0 인데 눈으로 떠 보이는 경우는 못 잡는다** —
//    반대로 거짓 통과는 나지만 거짓 실패는 잘 안 난다. 캡처와 같이 볼 것.
//
// 사용: node probe-mount-detached.js [종...]     (기본: 결함이 보고된 종 + 비행/바퀴 전종)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

// 인자가 없으면 **로스터 전종**을 본다 — 1판에서 '결함이 보고된 종'만 목록에 박아 뒀는데,
// 그러면 새로 추가된 종이 영영 이 검사를 안 받는다(로스터가 25→29 로 는 항목이 바로 옆에 있다).
// 종 목록은 `MOUNT_KR` 에서 페이지가 직접 읽는다.
const ARG = process.argv.slice(2);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.makeMountMesh && typeof MOUNT_KR !== "undefined"');

    const out = await page.evaluate((argNames) => {
        const names = argNames.length ? argNames : Object.keys(MOUNT_KR);
        const rows = [];
        for (const name of names) {
            const mesh = Scene3D.makeMountMesh(name, 'epic');
            mesh.updateMatrixWorld(true);
            // 최상위 자식마다 (그 자식의 하위 전체를 포함한) 월드 바운딩박스
            // ⚠️ **등자는 빼야 한다 — 매달려 있는 게 정답인 부품이다.** 안 빼면 비행·바퀴형 전종이
            //    같은 bbox(±0.185~0.215, y 0.006~0.30, z 0.036~0.144)로 '따로 논다'고 찍혀
            //    판정기가 거짓 실패만 뱉는다(1판에서 15건 중 8건이 이것이었다). 끈은 라이더 발까지
            //    `alignStirrups` 가 매 프레임 늘이므로, 정지 메시에서 떠 있는 건 정상이다.
            const skip = new Set(mesh.userData.stirrups || []);
            // 칸 크기 — 판정 여유(ε)를 **칸에 비례**해 잡는다. 종마다 cell 이 2배 넘게 차이 나서
            // (`cell = form.saddle / seat`) 절대값 ε 를 쓰면 큰 종은 헐거워지고 작은 종은 뻑뻑해진다.
            const cell = mesh.userData.cell || 0.03;
            // 🚨 **접해 있는 것을 '떠 있다'고 세면 안 된다.** 이 판정기 머리말은 *"'틈 > 0' 을 결함으로
            //    본다"* 라고 적어 놓고, 구현은 bbox 가 **겹치지 않으면** 실패로 셌다. 사족 다리는
            //    어깨에서 아래로 달려 몸통 밑면에 **정확히 맞닿아** 겹침이 0 이고, 거기에 `Voxel.build`
            //    의 큐브 지터가 1e-3 남짓 틈을 만든다 → 전 사족의 다리·꼬리가 무더기로 빨간불이었다
            //    (실측 24건, 보고된 빈틈은 전부 0). 한 칸의 1/4 이내면 붙은 것으로 본다 —
            //    복셀 조형에서 **진짜** 뜬 조각의 틈은 최소 한 칸이라 이 여유로 놓치지 않는다
            //    (아래 `--selftest` 가 1.5칸 띄운 파츠를 실제로 잡는지 매 실행 확인한다).
            const EPS = cell * 0.25;
            // 🚨 **최상위 자식만 보면 안 된다.** 머리·날개처럼 피벗 밑에 달린 파츠(뿔·귀·볏·부리)는
            //    피벗 서브트리 하나로 뭉뚱그려져 **그 안에서 떠 있어도 안 보인다**. 실제로 그렇게
            //    숨어 있던 결함 둘을 2026-08-25 에 눈으로 찾았다 — **염소 뿔이 머리 뒤 허공에 2칸 떠
            //    날아다녔고**(시트에서 명백했다), **낙타 귀도 머리 뒤에 떠 있었다.** 둘 다 이 자가
            //    전종 초록불을 주는 동안 그대로 있었다.
            //    → `Mobs.build` 가 찍는 `userData.pid` 를 손잡이로, **표의 파츠 단위**로 훑는다.
            //    ⚠️ 피벗 Group 과 그 안의 메시가 같은 pid 를 갖는다 — 메시 쪽만 센다(중복 방지).
            const inSkip = (o) => { for (let p = o; p; p = p.parent) if (skip.has(p)) return true; return false; };
            const parts = [];
            mesh.traverse(o => {
                if (!o.isMesh || !o.userData.pid || inSkip(o)) return;
                const b = new THREE.Box3().setFromObject(o);
                if (!isFinite(b.min.x) || b.isEmpty()) return;
                parts.push({ i: parts.length, b, size: b.getSize(new THREE.Vector3()).length(),
                             kind: o.userData.pid + (o.userData.pparent ? '<' + o.userData.pparent : '') });
            });
            // pid 가 없는 종(빌더를 안 타는 특수 메시)은 옛 방식으로 되돌아간다 — 못 재는 것보다 낫다.
            if (!parts.length) mesh.children.forEach((ch, i) => {
                if (skip.has(ch)) return;
                const b = new THREE.Box3().setFromObject(ch);
                if (!isFinite(b.min.x) || b.isEmpty()) return;
                const kinds = [];
                ch.traverse(o => { if (o.geometry) kinds.push(o.geometry.type.replace('Geometry', '')); });
                parts.push({ i, b, size: b.getSize(new THREE.Vector3()).length(),
                             kind: '#' + i + ' ' + kinds.slice(0, 3).join('+') + (kinds.length > 3 ? '…' + kinds.length : '') });
            });
            const loose = [];
            for (const p of parts) {
                let touches = 0, best = Infinity, bestI = -1;
                for (const q of parts) {
                    if (q === p) continue;
                    // 축별 빈틈의 유클리드 합 — 두 박스가 안 겹칠 때의 최단거리(겹치면 0)
                    const dx = Math.max(0, Math.max(p.b.min.x - q.b.max.x, q.b.min.x - p.b.max.x));
                    const dy = Math.max(0, Math.max(p.b.min.y - q.b.max.y, q.b.min.y - p.b.max.y));
                    const dz = Math.max(0, Math.max(p.b.min.z - q.b.max.z, q.b.min.z - p.b.max.z));
                    const d = Math.hypot(dx, dy, dz);
                    if (d <= EPS) { touches++; continue; }     // 붙었다(겹침 0 인 '맞닿음'도 여기서 통과)
                    if (d < best) { best = d; bestI = q.i; }
                }
                if (!touches) loose.push({
                    i: p.i, kind: p.kind, gap: +best.toFixed(4), gapCell: +(best / cell).toFixed(2), near: bestI, size: +p.size.toFixed(3),
                    at: [p.b.min.x, p.b.min.y, p.b.min.z].map(v => +v.toFixed(3)),
                    to: [p.b.max.x, p.b.max.y, p.b.max.z].map(v => +v.toFixed(3)),
                });
            }
            // 🧪 역검증 — ε 를 넣어 놓고 "이제 아무것도 안 걸린다"를 통과로 읽으면 자가 죽은 것이다.
            //    ⚠️ 첫 판은 '가장 작은 파츠를 1.5칸 들어올려' 확인하려 했는데 **11종에서 빈틈 0** 이
            //    나왔다 — 제일 작은 파츠는 대개 안장끈처럼 **몸통 속에 박혀** 있어 1.5칸 들어도 여전히
            //    몸통과 겹친다. 그래서 모델을 흔드는 대신 **판정 규칙 자체를 합성 상자로** 검사한다:
            //    같은 자·같은 ε 로, 1.5칸 띄운 쌍은 반드시 잡히고 0.1칸 띈 쌍은 반드시 안 잡혀야 한다.
            //    (이 자를 느슨하게 만드는 변경은 반드시 이 반대 방향 증거를 같이 들고 와야 한다.)
            const gapOf = (a, b) => {
                const dx = Math.max(0, Math.max(a.min.x - b.max.x, b.min.x - a.max.x));
                const dy = Math.max(0, Math.max(a.min.y - b.max.y, b.min.y - a.max.y));
                const dz = Math.max(0, Math.max(a.min.z - b.max.z, b.min.z - a.max.z));
                return Math.hypot(dx, dy, dz);
            };
            const synth = (g) => {
                const A = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(cell * 4, cell * 4, cell * 4));
                const B = new THREE.Box3(new THREE.Vector3(0, cell * 4 + g, 0), new THREE.Vector3(cell * 4, cell * 8 + g, cell * 4));
                return gapOf(A, B) > EPS;      // true = '떠 있다'고 센다
            };
            const selftest = { far: synth(cell * 1.5), near0: synth(cell * 0.1) };
            selftest.ok = selftest.far === true && selftest.near0 === false;
            rows.push({ name, n: parts.length, loose, selftest });
            Scene3D.disposeTree(mesh);
        }
        return rows;
    }, ARG);

    await browser.close();
    let bad = 0, blind = [];
    for (const r of out) {
        // 역검증이 깨진 종은 **수치가 뭐가 나오든 못 믿는다** — 결함 건수와 따로 센다.
        if (r.selftest && !r.selftest.ok) blind.push(r.name + '(1.5칸 띈 합성 쌍을 잡았나=' + r.selftest.far
            + ' · 0.1칸 쌍을 안 잡았나=' + (r.selftest.near0 === false) + ')');
        if (!r.loose.length) { console.log('  ' + r.name.padEnd(18) + ' 파츠 ' + String(r.n).padStart(3) + ' → ✓ 따로 노는 조각 0'); continue; }
        bad += r.loose.length;
        console.log('  ' + r.name.padEnd(18) + ' 파츠 ' + String(r.n).padStart(3) + ' → ✗ 따로 노는 조각 ' + r.loose.length);
        for (const l of r.loose)
            console.log('       자식 #' + l.i + ' [' + l.kind + '] 크기 ' + l.size + ' · 가장 가까운 파츠(#' + l.near + ')까지 빈틈 '
                + l.gap + ' (' + l.gapCell + '칸) · bbox ' + JSON.stringify(l.at) + '~' + JSON.stringify(l.to));
    }
    if (blind.length) console.log('\n🚨 역검증 실패 ' + blind.length + '건 — 자가 눈이 먼 상태다:\n  ' + blind.join('\n  '));
    else console.log('\n🧪 역검증: 전 종의 칸 크기에서 1.5칸 띈 쌍은 잡고 0.1칸 띈 쌍은 안 잡는다(ε 가 결함을 삼키지 않는다).');
    if (errors.length) console.log('\n콘솔 에러 ' + errors.length + '건:\n  ' + errors.slice(0, 5).join('\n  '));
    const ok = bad === 0 && !errors.length && !blind.length;
    console.log('\n' + (ok ? 'PASS' : 'FAIL') + ' — 따로 노는 조각 ' + bad + '건 · 역검증 실패 ' + blind.length + '건 · 콘솔 에러 ' + errors.length + '건');
    process.exit(ok ? 0 : 1);
})();
