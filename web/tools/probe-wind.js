// 바람·미세 애니메이션 실측 — 사용: node probe-wind.js
// TODO '맵 프롭 퀄리티 업'(slug: map-props) 의 "바람에 흔들리는 풀·나뭇잎, 반짝이는 크리스탈 같은
// 미세 애니메이션으로 살아있는 맵으로" 검증. 적용 전 맵은 **완전히 정지**해 있었다(구름·불씨만 움직임).
//
// ═══ 이 검증기가 픽셀이 아니라 상태를 재는 이유 (다음 세션이 되돌리지 말 것) ═══
// 처음엔 "연속 프레임 사이 화면 변화량"으로 짰다. 그 지표는 **세 번 연속으로 없는 결함을 만들어 냈다**:
//   ⑴ **카메라가 가만히 있어도 매 프레임 0.034 움직인다** → 배경 전체가 시차로 흘러, 바람 대상이
//      0개인 사막이 0.664 로 나왔다(소품을 하나씩 끄며 이분해 찾았다).
//   ⑵ **테마 전환 직후 수십 프레임의 과도 구간**(페이드·하늘 페인트·그림자맵 워밍업)이 있다 →
//      워밍업 전 forest 가 적용 전 6.228 / 적용 후 6.218 로 나와 **바람이 아예 없는 것처럼** 보였다.
//   ⑶ **한 페이지에서 바이옴을 이어 재면 앞 바이옴이 뒤를 오염시킨다** → forest 다음의 desert 가
//      0.187~0.233(단독 측정은 0.025).
// 셋을 다 잡고도 같은 코드로 magic 이 0.191 / 0.092 로 흔들렸다(소프트웨어 GL + 위상 표집 편차).
// **진폭을 픽셀로 재는 건 이 환경에서 회귀 게이트로 쓸 수 없다.** 그래서 실제 구동 상태를 잰다 —
// 클럭을 고정 dt 로 직접 돌리고 ⑴ 소품 회전각의 peak-to-peak ⑵ 풀 셰이더 시간 유니폼의 전진
// ⑶ 크리스탈 발광의 peak-to-peak 를 본다. 결정론적이고 요구사항과 1:1 로 대응한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const THEMES = {
    forest: { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    desert: { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    rock: { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    snow: { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2 },
    magic: { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061 },
    lava: { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
};
// 기대: 식물이 있는 바이옴은 흔들리고, 광물뿐인 바이옴은 **정확히 0** 이어야 한다.
//   desert = 선인장(다육 기둥은 뻣뻣해 제외) + 바위 → 흔들릴 것이 없다.
//   rock   = 바위뿐 + 골드 야생화 악센트(셰이더 바람만) → 소품 회전 0, 풀 재질 1.
//   snow   = 눈 덮인 침엽수 → 흔들린다. lava = 죽은 나무 → 흔들린다.
const EXPECT = {
    // 🌾 forest 의 `grass` 를 true → **false** 로 (background-grass-road-cleanup, 사용자 지시
    //    2026-08-21 "배경에 잔디 다없애기."). 이 칸이 재던 '풀 바람 재질'은 forest 주 스캐터가
    //    풀 포기일 때만 존재했다 — 지시로 그 풀을 걷어냈으므로 재질이 0 인 게 **정상**이다.
    //    (나무·꽃 흔들림은 `sway` 칸이 따로 지키므로 바람 자체가 죽은 건 아니다. rock 은 골드
    //     야생화 악센트가 여전히 흔들려 grass:true 를 유지한다.)
    forest: { sway: true, grass: false, crystal: false },
    desert: { sway: false, grass: false, crystal: false },
    rock: { sway: false, grass: true, crystal: false },
    snow: { sway: true, grass: false, crystal: false },
    magic: { sway: true, grass: false, crystal: true },
    lava: { sway: true, grass: false, crystal: false },
};
const SWAY_MIN = 0.004;   // rad peak-to-peak — 이보다 작으면 화면에서 안 읽힌다
const GLOW_MIN = 0.10;    // emissiveIntensity peak-to-peak

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const res = {};
    for (const key of Object.keys(THEMES)) {
        // ⚠️ 바이옴마다 페이지를 새로 연다 — 위 ⑶ 참고.
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        page.on('pageerror', e => errors.push(key + ': ' + String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(key + ': ' + m.text()); });
        await page.addInitScript(() => {
            let s = 0x51f3a7d;
            Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        });
        await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare', { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(1500);
        res[key] = await page.evaluate((theme) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            ProChar.update = () => {};
            Scene3D.setTheme(theme);
            Scene3D.walking = false; Scene3D.worldX = 0;
            const R = Scene3D.renderer;
            // 셰이더 유니폼은 **컴파일 시점**에 생긴다 — 한 번 렌더해야 `_windMats` 가 채워진다.
            R.render(Scene3D.scene, Scene3D.camera);
            const props = Scene3D.windProps || [];
            // 클럭을 고정 dt 로 직접 돌려 위상을 결정론적으로 만든다(rAF 를 안 기다린다).
            // 1.6Hz 성분의 한 주기(0.625s)를 넉넉히 덮게 32프레임 × 0.05s = 1.6s.
            const DT = 0.05, N = 32;
            Scene3D._clock = 0;
            const lo = props.map(() => Infinity), hi = props.map(() => -Infinity);
            let gLo = Infinity, gHi = -Infinity;      // 크리스탈 발광
            const uni0 = (Scene3D._windMats || []).map(u => u.value);
            for (let f = 0; f < N; f++) {
                Scene3D.update(DT);
                R.render(Scene3D.scene, Scene3D.camera);
                props.forEach((c, i) => {
                    const v = c.rotation.z;
                    if (v < lo[i]) lo[i] = v;
                    if (v > hi[i]) hi[i] = v;
                });
                if (Scene3D.crystalMat) {
                    const e = Scene3D.crystalMat.emissiveIntensity;
                    if (e < gLo) gLo = e;
                    if (e > gHi) gHi = e;
                }
            }
            const amps = props.map((_, i) => hi[i] - lo[i]);
            const uni = Scene3D._windMats || [];
            return {
                props: props.length,
                swayMin: amps.length ? Math.min.apply(null, amps) : 0,
                swayMax: amps.length ? Math.max.apply(null, amps) : 0,
                // 전부 같은 위상이면 '지면이 한 덩어리로 미끄러진다' — 위상이 갈렸는지 본다
                distinctPhase: new Set(props.map(c => Math.round(c.userData.windPhase * 100))).size,
                windMats: uni.length,
                uniAdvanced: uni.length ? uni.every((u, i) => u.value > (uni0[i] || 0)) : null,
                glowPP: isFinite(gHi - gLo) ? gHi - gLo : 0,
            };
        }, THEMES[key]);
        await page.close();
    }

    const fails = [];
    console.log('바이옴   소품  흔들림(rad p-p)     위상종수  풀재질  유니폼전진  크리스탈발광 p-p');
    for (const k of Object.keys(res)) {
        const r = res[k], e = EXPECT[k];
        console.log(`${k.padEnd(8)} ${String(r.props).padStart(3)}  ${r.swayMin.toFixed(4)}~${r.swayMax.toFixed(4)}      ${String(r.distinctPhase).padStart(3)}      ${String(r.windMats).padStart(2)}      ${r.uniAdvanced === null ? '— ' : (r.uniAdvanced ? 'ok' : 'FAIL')}         ${r.glowPP.toFixed(3)}`);
        if (e.sway) {
            if (!r.props) fails.push(`${k}: 흔들릴 소품이 0개 — 식물 바이옴인데 바람 대상이 없다`);
            else if (r.swayMin < SWAY_MIN) fails.push(`${k}: 최소 흔들림 ${r.swayMin.toFixed(4)} < ${SWAY_MIN} rad — 화면에서 안 읽힌다`);
            else if (r.distinctPhase < Math.min(4, r.props)) fails.push(`${k}: 위상 종수 ${r.distinctPhase} — 전부 같은 박자로 흔들리면 한 덩어리로 읽힌다`);
        } else if (r.props) {
            fails.push(`${k}: 광물 바이옴인데 흔들리는 소품이 ${r.props}개 — 돌이 흔들리면 '떠 있는 돌'이다`);
        }
        if (e.grass) {
            if (!r.windMats) fails.push(`${k}: 풀 바람 재질이 0개`);
            else if (!r.uniAdvanced) fails.push(`${k}: 풀 셰이더 시간 유니폼이 안 는다 — update() 가 안 밀고 있다`);
        } else if (r.windMats) {
            fails.push(`${k}: 식물이 없는데 바람 재질이 ${r.windMats}개`);
        }
        if (e.crystal) {
            if (r.glowPP < GLOW_MIN) fails.push(`${k}: 크리스탈 발광 진폭 ${r.glowPP.toFixed(3)} < ${GLOW_MIN} — 반짝이지 않는다`);
        } else if (r.glowPP > 0.001) {
            fails.push(`${k}: 크리스탈이 없는 바이옴인데 발광이 맥동한다 ${r.glowPP.toFixed(3)}`);
        }
    }
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? '\n반려 —\n  ' + fails.join('\n  ') : '\nPASS — 식물은 제각각 흔들리고 · 풀 셰이더는 돌고 · 광물은 정지 · 크리스탈만 맥동');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
