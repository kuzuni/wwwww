// 활 실루엣 'D' 오독 판정기 (equip-era-theming ⓒ — 3차 채점 C·D 공통 지적)
//   지적: 반원 호 + 지름을 가로지르는 직선 시위 = 알파벳 D 로 읽힌다.
//   실제 활이 D 로 안 읽히는 이유 두 가지를 그대로 게이트로 만든다:
//     ① **리커브** — 바깥 림이 시위 선을 넘어 뒤로 젖혀졌다가 돌아온다(반원의 현은 절대 못 넘는다).
//     ② **곡률 변주** — 라이저 부근은 뻣뻣해 거의 곧고 바깥 림이 휜다.
//        완전 반원은 d2/d1 = 3.5 로 고정(x=R√(1-(y/R)²) 의 해석해)이므로 6 을 문턱으로 쓴다.
//
// ⚠️ 픽셀이 아니라 **지오메트리(모델 로컬 xy)** 로 잰다 — 썸네일은 3/4 각이라 원호가 타원으로
//    찍혀 '원인가'를 물을 수 없고, 96px 에서는 곡률 차가 1px 아래로 뭉개진다.
//
// 🚨 **①② 는 필요조건이지 충분조건이 아니다(실측).** 두 게이트를 통과시킨 리커브 조형만으로
//    4배 확대 캡처를 다시 보니 **여전히 D 로 읽혔다** — 오히려 라이저 부근 직선 구간이 D 의
//    세로획을 또렷하게 만들었다. 활은 평면 물체인데 썸네일 카메라가 그 평면을 정면으로 보므로,
//    어떤 곡선을 그려도 '닫힌 납작한 윤곽 + 세로 직선(시위)' = 글자가 된다. 판독을 실제로 바꾼 건
//    **썸네일 자세**(메긴 화살 + 3/4 회전)였다. 그래서 ③ 으로 그 자세도 못박는다.
//    → 지표가 움직였다고 판독이 바뀐 걸로 치지 말 것. 반드시 확대 캡처를 같이 볼 것.
// 사용: node probe-bow-silhouette.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const BOWS = [['bow', 1], ['echoBow', 6], ['wraithBow', 8], ['seraphBow', 9]];
const CURVE_GATE = 6.0, REFLEX_GATE = 0.015;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const res = await page.evaluate((BOWS) => {
        const out = [];
        for (const [w, ageIdx] of BOWS) {
            const m = Scene3D.makeWeapon(w, ageIdx, 'legendary');
            m.updateMatrixWorld(true);
            // 시위 = 세로로 길고 단면이 가장 가는 상자. 좌표를 손으로 베끼지 않고 **모델에서 찾는다**
            // (베껴 두면 코드에서 시위 x 를 옮긴 뒤에도 옛 값으로 재는 유령 결과가 난다).
            let str = null;
            for (const ch of m.children) {
                const p = ch.geometry && ch.geometry.parameters;
                if (!p || ch.geometry.type !== 'BoxGeometry') continue;
                if (p.height > 0.5 && p.width < 0.03 && p.depth < 0.03) str = ch;
            }
            // 림 정점을 모아 y 밴드별 바깥(x 최대)·안쪽(x 최소) 프로파일을 뽑는다.
            // ⚠️ **Torus 도 받는다** — 안 그러면 옛 반원 활에서 '림 0 정점' 으로 죽어, 게이트가
            //    실제로 반원을 떨어뜨리는지 확인할 수 없다(A/B 가 구조 검출 실패로 뭉개진다).
            // ⚠️ 정점에 `ch.matrix` 를 반드시 곱한다 — 옛 호는 rotation.z = -π/2 로 눕혀 놓았다.
            // ⚠️ 튜브가 있으면 **튜브만** 쓴다 — 후기 시대 활에는 장식 토러스(후광 링 등)가 붙어 있어
            //    같이 잡으면 프로파일이 오염된다(실측: seraphBow 곡률변주 8.72 → 2.89 로 헛돎).
            const want = m.children.some(ch => ch.geometry && ch.geometry.type === 'TubeGeometry') ? 'TubeGeometry' : 'TorusGeometry';
            const V = [], vv = new THREE.Vector3();
            for (const ch of m.children) {
                if (!ch.isMesh || !ch.geometry) continue;
                const t = ch.geometry.type;
                if (t !== want) continue;
                const pos = ch.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    vv.fromBufferAttribute(pos, i).applyMatrix4(ch.matrix);
                    V.push([vv.x, vv.y]);
                }
            }
            if (!V.length || !str) { out.push({ w, err: '림/시위를 못 찾음(림 ' + V.length + ' 정점)' }); continue; }
            const xs = str.position.x;
            const Y = Math.max(...V.map(v => Math.abs(v[1])));
            const N = 40, band = Array.from({ length: N }, () => ({ hi: -1e9, lo: 1e9 }));
            for (const [x, y] of V) {
                const i = Math.min(N - 1, Math.floor(Math.abs(y) / Y * N));
                if (x > band[i].hi) band[i].hi = x;
                if (x < band[i].lo) band[i].lo = x;
            }
            // ⚠️ 빈 밴드를 그대로 쓰면 -1e9 가 섞여 지표가 통째로 헛돈다(실측: d2 = -1e9).
            //    림이 실제로 존재하는 구간 [i0,i1] 안에서만 샘플링한다.
            const live = band.map((b, i) => (b.hi > -1e8 ? i : -1)).filter(i => i >= 0);
            if (live.length < 8) { out.push({ w, err: '림 프로파일 밴드 부족(' + live.length + ')' }); continue; }
            const i0 = live[0], i1 = live[live.length - 1];
            const at = (f) => {
                let i = Math.round(i0 + (i1 - i0) * f);
                while (i < N && band[i].hi < -1e8) i++;
                return band[Math.min(i, i1)].hi;
            };
            const d1 = at(0) - at(0.35), d2 = at(0.35) - at(0.70);
            // ① 리커브: 바깥 절반(|y| > 0.6Y)에서 림이 시위 선보다 뒤로 넘어갔는가
            let reflex = 0;
            for (let i = Math.floor(N * 0.6); i < N; i++) if (band[i].lo < 1e8) reflex = Math.max(reflex, xs - band[i].lo);
            // ③ 썸네일 자세 — 실제로 판독을 바꾼 층. 메긴 화살 + 정면을 벗어난 y 회전.
            const pm = Scene3D.makeWeapon(w, ageIdx, 'legendary');
            const pose = Scene3D.weaponThumbBowPose(pm, w);
            out.push({ w, xs: +xs.toFixed(3), Y: +Y.toFixed(3), d1: +d1.toFixed(4), d2: +d2.toFixed(4),
                ratio: d1 > 1e-5 ? +(d2 / d1).toFixed(2) : -1, reflex: +reflex.toFixed(4),
                arrow: pose ? pose.arrow : 0, yaw: +Math.abs(pm.rotation.y).toFixed(2) });
        }
        return out;
    }, BOWS);

    const fail = [];
    console.log('활 실루엣 — 곡률변주 d2/d1 (완전 반원 = 3.50) · 리커브 = 시위 선 뒤로 넘어간 깊이 · 자세 = 화살 파츠/요각');
    console.log('wtype        d1      d2      d2/d1   리커브   화살 요각  판정');
    for (const r of res) {
        if (r.err) { fail.push(r.w + ': ' + r.err); console.log(r.w.padEnd(13) + r.err); continue; }
        const bad = [];
        if (!(r.ratio >= CURVE_GATE)) bad.push('곡률변주 ' + r.ratio + ' < ' + CURVE_GATE + '(반원에 가깝다)');
        if (!(r.reflex >= REFLEX_GATE)) bad.push('리커브 ' + r.reflex + ' < ' + REFLEX_GATE);
        if (!(r.arrow >= 4)) bad.push('썸네일 화살 파츠 ' + r.arrow + ' < 4');
        if (!(r.yaw >= 0.3)) bad.push('썸네일 요각 ' + r.yaw + ' < 0.3(정면이라 납작하게 읽힌다)');
        if (bad.length) fail.push(r.w + ': ' + bad.join(' · '));
        console.log(r.w.padEnd(13) + String(r.d1).padEnd(8) + String(r.d2).padEnd(8)
            + String(r.ratio).padEnd(8) + String(r.reflex).padEnd(9) + String(r.arrow).padEnd(5) + String(r.yaw).padEnd(6)
            + (bad.length ? '❌ ' + bad.join(' · ') : '✅'));
    }
    console.log('\n콘솔 에러: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    console.log(fail.length ? '❌ FAIL ' + fail.length + '건' : '✅ PASS — 활 전종 리커브·곡률 변주 확보');
    await browser.close();
    process.exit(fail.length || errors.length ? 1 : 0);
})();
