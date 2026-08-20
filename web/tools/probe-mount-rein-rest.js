// 안 탄 탈것의 고삐가 재갈 고리에 붙어 있는가 — **정지(기본) 자세** 실측.
//
// 왜 이 자가 따로 필요한가 (2026-08-20 `mount-species-recognizable` 6단이 실제로 여기서 깨졌다):
//   `probe-ride-rein` 은 **탑승 중**을 잰다. 그런데 탑승 중엔 `alignReins()` 가 매 프레임 앵커에서
//   끈을 다시 깔아 주므로, **앵커가 옮겨져도 그 자는 항상 통과한다.** 반대로 안 탄 탈것은
//   `bridleRig` 이 빌드 시점에 한 번 깔아 둔 기본 자세를 그대로 쓴다 — 그래서 빌드 뒤에 앵커를
//   움직이는 코드가 생기면(6단의 `st.anchor.y += neckUp`) 끈만 옛 자리에 남는다.
//   실제 결과: 5차 블라인드 채점에서 비평가가 **10칸**에서 *"두 갈색 막대가 아무 데도 안 닿은 채
//   떠 있다"* 고 적었다. 썸네일·판독 시트·인벤토리는 전부 이 안 탄 자세로 그려진다.
//
// 재는 것: 각 고삐 줄의 **시작점**(첫 분절의 위쪽 끝)과 그 줄의 앵커(= 재갈 고리 자리) 사이 거리.
//   기본 자세는 앵커에서 시작해 아래로 처지게 깔리므로, 이 거리는 0 에 가까워야 한다.
//
// ⚠️ 끝점(손 쪽)은 보지 않는다 — 안 탄 탈것의 고삐 끝은 **허공에 늘어져 있는 게 정상**이다
//    (탈 때 `alignReins` 가 손까지 끌어온다). 여기서 결함인 것은 **뿌리가 떨어진 것**뿐이다.
//
// 사용: node probe-mount-rein-rest.js [종...]     (기본: 고삐가 달린 전종)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

const ARG = process.argv.slice(2);
const TOL = 0.02;   // 앵커-뿌리 허용 거리(탈것 로컬). 분절 두께(0.022)보다 작게 잡는다.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.makeMountMesh && typeof MOUNT_KR !== "undefined"');

    const out = await page.evaluate(([argNames, tol]) => {
        const names = argNames.length ? argNames : Object.keys(MOUNT_KR);
        const rows = [];
        for (const name of names) {
            const mesh = Scene3D.makeMountMesh(name, 'epic');
            mesh.updateMatrixWorld(true);
            const rein = mesh.userData.rein;
            if (!rein || !rein.straps.length) { rows.push({ name, skip: 'no-rein' }); continue; }
            let worst = 0, detail = null;
            for (const st of rein.straps) {
                const seg = st.segs[0];
                if (!seg) continue;
                // 분절은 높이 1 짜리 단위 박스(로컬 y −0.5..+0.5)를 `scale.y = 길이` 로 늘이고,
                // 중심을 a↔b 의 **중점**에 두고 로컬 +y 를 (b−a) 방향으로 돌린 것이다(`_reinSeg`).
                // 🚨 그래서 뿌리(a)는 로컬 **−0.5** 쪽이다. +0.5 를 쓰면 반대쪽 끝(b)이 나와서
                //    "앵커에서 0.1 떨어져 있다"는 **가짜 FAIL 이 전 종에 뜬다** — 실제로 1판에서
                //    그렇게 찍혔고(22종 전부 FAIL, 거리가 neckUp 과 무관하게 다 비슷했다) 그 무상관이
                //    자가 틀렸다는 신호였다. 판정기가 전수 FAIL 을 내면 코드보다 자를 먼저 의심할 것.
                seg.updateMatrixWorld(true);
                const top = new THREE.Vector3(0, -0.5, 0).applyMatrix4(seg.matrix);
                const d = top.distanceTo(st.anchor);
                if (d > worst) { worst = d; detail = [+top.x.toFixed(3), +top.y.toFixed(3), +top.z.toFixed(3)]; }
            }
            rows.push({ name, gap: worst, at: detail, anchorY: +rein.straps[0].anchor.y.toFixed(3) });
        }
        return rows;
    }, [ARG, TOL]);

    let fail = 0;
    for (const r of out.filter(x => !x.skip).sort((a, b) => b.gap - a.gap)) {
        const ok = r.gap <= TOL;
        if (!ok) fail++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.name.padEnd(18)} 뿌리-앵커 거리 ${r.gap.toFixed(4)}` +
                    `${ok ? '' : `  ← 끈이 고리에서 떨어져 있다 (뿌리 ${r.at.join(',')} · 앵커 y ${r.anchorY})`}`);
    }
    for (const r of out.filter(x => x.skip)) console.log(`--   ${r.name.padEnd(18)} (${r.skip})`);
    if (errors.length) console.log('\n콘솔 에러:\n' + errors.slice(0, 8).join('\n'));
    console.log(fail === 0 && errors.length === 0
        ? `\nPASS — 안 탄 자세에서 모든 고삐가 고리에 붙어 있다 (허용 ${TOL})`
        : `\nFAIL (${fail}종 뿌리 떨어짐 · 에러 ${errors.length})`);
    await browser.close();
    process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})();
