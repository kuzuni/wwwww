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
            const parts = [];
            mesh.children.forEach((ch, i) => {
                if (skip.has(ch)) return;
                const b = new THREE.Box3().setFromObject(ch);
                if (!isFinite(b.min.x) || b.isEmpty()) return;
                // 어떤 파츠인지 이름표를 같이 남긴다 — bbox 좌표만 주면 다음 세션이 코드에서 그걸
                // 되찾는 데만 한나절이 든다(1판에서 실제로 그랬다). 지오메트리 종류 + 정점 수면
                // `sp/bx/cy/cn/tube` 중 무엇으로 그린 것인지 대체로 특정된다.
                const kinds = [];
                ch.traverse(o => { if (o.geometry) kinds.push(o.geometry.type.replace('Geometry', '')); });
                parts.push({ i, b, size: b.getSize(new THREE.Vector3()).length(),
                             kind: kinds.slice(0, 3).join('+') + (kinds.length > 3 ? '…' + kinds.length : '') });
            });
            const loose = [];
            for (const p of parts) {
                let touches = 0, best = Infinity, bestI = -1;
                for (const q of parts) {
                    if (q === p) continue;
                    if (p.b.intersectsBox(q.b)) { touches++; continue; }
                    // 축별 빈틈의 유클리드 합 — 두 박스가 안 겹칠 때의 최단거리
                    const dx = Math.max(0, Math.max(p.b.min.x - q.b.max.x, q.b.min.x - p.b.max.x));
                    const dy = Math.max(0, Math.max(p.b.min.y - q.b.max.y, q.b.min.y - p.b.max.y));
                    const dz = Math.max(0, Math.max(p.b.min.z - q.b.max.z, q.b.min.z - p.b.max.z));
                    const d = Math.hypot(dx, dy, dz);
                    if (d < best) { best = d; bestI = q.i; }
                }
                if (!touches) loose.push({
                    i: p.i, kind: p.kind, gap: +best.toFixed(4), near: bestI, size: +p.size.toFixed(3),
                    at: [p.b.min.x, p.b.min.y, p.b.min.z].map(v => +v.toFixed(3)),
                    to: [p.b.max.x, p.b.max.y, p.b.max.z].map(v => +v.toFixed(3)),
                });
            }
            rows.push({ name, n: parts.length, loose });
            Scene3D.disposeTree(mesh);
        }
        return rows;
    }, ARG);

    await browser.close();
    let bad = 0;
    for (const r of out) {
        if (!r.loose.length) { console.log('  ' + r.name.padEnd(18) + ' 파츠 ' + String(r.n).padStart(3) + ' → ✓ 따로 노는 조각 0'); continue; }
        bad += r.loose.length;
        console.log('  ' + r.name.padEnd(18) + ' 파츠 ' + String(r.n).padStart(3) + ' → ✗ 따로 노는 조각 ' + r.loose.length);
        for (const l of r.loose)
            console.log('       자식 #' + l.i + ' [' + l.kind + '] 크기 ' + l.size + ' · 가장 가까운 파츠(#' + l.near + ')까지 빈틈 '
                + l.gap + ' · bbox ' + JSON.stringify(l.at) + '~' + JSON.stringify(l.to));
    }
    if (errors.length) console.log('\n콘솔 에러 ' + errors.length + '건:\n  ' + errors.slice(0, 5).join('\n  '));
    console.log('\n' + (bad === 0 && !errors.length ? 'PASS' : 'FAIL') + ' — 따로 노는 조각 ' + bad + '건 · 콘솔 에러 ' + errors.length + '건');
    process.exit(bad === 0 && !errors.length ? 0 : 1);
})();
