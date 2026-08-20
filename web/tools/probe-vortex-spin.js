// 회오리가 **프레임률과 무관하게** 돌고, 깃이 강타 초승달과 **다른 물건**인가 (slug: skill-fx ㉤)
//
// 비평가 2차 2인 일치 지적 ㉤: "**회오리**: 각속도가 0 에 가까워 '회전'이 안 읽히고, 판때기가
// powerStrike 초승달과 **같은 셰이프**다."
//
// 원인 둘, 둘 다 실측으로 확정했다 (2026-08-20 3D 스트림):
//   ⑴ **회전이 프레임 수에 묶여 있었다.** `Scene3D.addAnim(dur, fn)` 은 콜백에 **진행도 `k` 만**
//      넘긴다(`a.fn(k)`) — `dt` 가 없다. 그런데 `whirlwindVortex` 는 층 각도를
//      `lg.rotation.y += w * 0.14` 로 **매 프레임 누적**했다. 즉 각속도의 단위가 rad/초가 아니라
//      **rad/프레임**이라, 30fps 기기에서는 60fps 의 **정확히 절반만** 돈다. 모바일이 대상이고
//      (항목 본문 ③) 채점용 촬영기도 고정 dt 로 몰아 찍으므로, 비평가가 본 화면은 실제로
//      **각속도가 반토막 난 회오리**였다. '각속도가 0 에 가깝다'는 이 경로다.
//   ⑵ **깃이 정말 같은 셰이프였다.** 초승달 `RingGeometry(R*0.74, R, 26, 1, -0.62, 1.24)` ↔
//      회오리 깃 `RingGeometry(r*0.62, r, 16, 1, a, 1.05)` — 같은 지오메트리 타입에 안팎 비율도
//      호 길이도 사실상 같다. 색만 다른 부분 링 두 개였다.
//
// 판정:
//   ① **프레임률 무관**: 같은 가상 시간(0.6초)을 60fps 로 몬 판과 30fps 로 몬 판의 층 총회전량이
//      5% 이내로 같아야 한다. (교정 전에는 정확히 2배 차이가 난다 — 음성 대조 축)
//   ② **회전이 눈에 걸린다**: 연출이 도는 동안 가장 빠른 층이 **한 바퀴(2π) 이상** 돈다.
//   ③ **초승달과 다른 물건**: 깃 지오메트리가 `RingGeometry` 가 아니다(강타 초승달이 그것이다).
//   ④ 콘솔 에러 0건.
//
// 사용: node probe-vortex-spin.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SPAN_S = 0.6;      // 관측 가상 시간(초)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.scene && !!Scene3D.heroG').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }

    const res = await page.evaluate(({ SPAN_S }) => {
        // 한 판 돌리고 층 총회전량을 재는 루틴. fps 만 바꿔 두 번 부른다.
        function run(fps) {
            Scene3D.anims.length = 0;
            // 이전 판의 잔여 그룹을 치운다 — 안 치우면 두 판의 층이 섞여 잡힌다
            for (const o of Scene3D.scene.children.slice()) {
                if (o.userData && o.userData.vortexFx) Scene3D.scene.remove(o);
            }
            let G = null, geoTypes = [];
            const realAdd = Scene3D.scene.add.bind(Scene3D.scene);
            Scene3D.scene.add = function (...objs) {
                for (const o of objs) if (o.userData && o.userData.vortexFx && !G) G = o;
                return realAdd(...objs);
            };
            const realST = window.setTimeout;
            window.setTimeout = function (fn) { try { fn(); } catch (e) { } return 0; };
            try {
                Scene3D.whirlwindVortex([...Scene3D.enemyMap.keys()], new THREE.Color(0xb0bec5), 0);
            } finally {
                window.setTimeout = realST;
                Scene3D.scene.add = realAdd;
            }
            if (!G) return null;
            const layers = G.children.filter(c => c.userData && c.userData.w !== undefined);
            const a0 = layers.map(l => l.rotation.y);
            const dt = 1 / fps, n = Math.round(SPAN_S * fps);
            for (let i = 0; i < n; i++) Scene3D.update(dt);
            const turn = layers.map((l, i) => Math.abs(l.rotation.y - a0[i]));
            // 깃 지오메트리 타입 — 첫 층의 첫 깃으로 대표한다
            for (const l of layers) for (const v of l.children) {
                if (v.geometry && v.geometry.type) geoTypes.push(v.geometry.type);
            }
            Scene3D.anims.length = 0;
            for (const o of Scene3D.scene.children.slice()) {
                if (o.userData && o.userData.vortexFx) Scene3D.scene.remove(o);
            }
            return { turn, frames: n, geoTypes: [...new Set(geoTypes)] };
        }
        return { a: run(60), b: run(30) };
    }, { SPAN_S });

    if (!res.a || !res.b) { console.error('회오리 그룹을 못 잡았다(vortexFx 태그 확인)'); await browser.close(); process.exit(3); }

    const A = res.a.turn, B = res.b.turn;
    const drift = A.map((v, i) => (v === 0 && B[i] === 0) ? 0 : Math.abs(v - B[i]) / Math.max(v, B[i], 1e-9));
    const worst = Math.max(...drift);
    const fastest = Math.max(...A);
    const geo = res.a.geoTypes;

    const checks = [
        ['① 60fps 판과 30fps 판의 총회전량이 5% 이내로 같다', worst <= 0.05,
            `층별 60fps ${A.map(v => v.toFixed(2)).join('/')} rad · 30fps ${B.map(v => v.toFixed(2)).join('/')} rad · 최악 편차 ${(worst * 100).toFixed(1)}%`],
        ['② 가장 빠른 층이 0.6초에 한 바퀴(2π) 이상 돈다', fastest >= Math.PI * 2,
            `최대 ${fastest.toFixed(2)} rad = ${(fastest / (Math.PI * 2)).toFixed(2)} 바퀴`],
        ['③ 깃이 강타 초승달(RingGeometry)과 다른 지오메트리다', !geo.includes('RingGeometry'),
            `깃 지오메트리 = ${geo.join(', ') || '(없음)'}`],
        ['④ 콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | ') || '없음'],
    ];
    console.log(`회오리 회전 판정 (가상 ${SPAN_S}초 · 60fps ${res.a.frames}프레임 vs 30fps ${res.b.frames}프레임)`);
    let pass = true;
    for (const [name, ok, detail] of checks) {
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
        if (!ok) pass = false;
    }
    await browser.close();
    console.log(pass ? '\nPASS' : '\nFAIL');
    process.exit(pass ? 0 : 1);
})();
