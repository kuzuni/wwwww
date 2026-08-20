// 바이옴 프롭 재질색이 **진입 경로와 무관한가**를 재는 게이트 (slug: biome-stone-color-leak) — 사용: node probe-biome-mat-path.js
//
// 왜 이 자가 필요한가: 같은 바이옴이 **직전에 어느 바이옴이었냐**에 따라 다른 색으로 섰다.
//   실측(고치기 전): `lava`→`desert` 사막 바위 **#5f6e76**(= 용암 fallback 0x90a4ae × map 보정),
//   `snow`→`desert` **#85919d**(= 설원 0xc9d8e6 × 보정). 사막 자기 색 0xb97f5e 는 **한 번도 안 나왔다.**
//   뿌리: `setTheme` 이 `buildProps` 를 맨 앞에서 부르고 재질 색은 **한참 뒤에** 칠하는데, 복셀 프롭은
//   `vxMat` 클론에 **빌드 시점 색을 구워** 쓴다 → 원본만 바뀌고 그려지는 클론은 직전 바이옴 색 그대로.
//
// 🚨 **왜 지금까지 아무도 못 봤나 — 컨택트 시트로는 안 보이는 결함이다.** `shot-biomes.js` 는 늘
//    forest→desert→rock→snow→magic→lava **같은 순서**로 굽는다. 순서가 고정이면 누수도 고정이라
//    매번 똑같은 (틀린) 색이 나오고, 전/후 비교에서도 양쪽이 같이 틀려 차이가 0 이다.
//    **경로를 바꿔 가며 재는 이 자만이 그걸 본다.**
//
// 무엇을 재는가:
//   ① **경로 무관성** — 대상 바이옴 T 를 여러 선행 바이옴 P 에서 진입해, **재질의 색 자체**가
//      P 와 무관하게 같은가. 하나라도 갈리면 FAIL(어느 재질이 어떤 색으로 갈렸는지 찍는다).
//      ⚠️ 🚨 **메시를 세어서 재지 말 것(첫 판이 그렇게 만들었다가 통째로 거짓 양성을 냈다).**
//         프롭 메시의 색 히스토그램을 비교했더니 `#5d4037 21↔19` 처럼 **색이 아니라 개수**가 갈렸다 —
//         `buildProps` 가 소비하는 난수 횟수가 경로마다 달라 **배치가 달라지기 때문**이다(시드를 고정해도
//         소비 순서가 달라지면 결과가 달라진다). 여기서 묻는 것은 '재질이 무슨 색인가'지 '그 색 프롭이
//         몇 개 놓였나'가 아니다. 그래서 **재질 단위로** 스냅샷을 뜬다 — 배치 난수가 아예 안 섞인다.
//   ② **음성 대조** — `Scene3D.syncVxMats` 를 no-op 으로 바꿔 같은 검사를 한 번 더 돌린다.
//      여기서 **반드시 FAIL 이 나와야** 이 자가 변별력이 있는 것이다(안 나오면 검사가 비어 있다는 뜻).
//      ⚠️ 이 저장소가 여러 번 밟은 함정이다 — 음성 대조에서 안 떨어지는 판정기는 통과해도 아무 뜻이 없다.
//
// ⚠️ 색은 `material.color` 로 읽는다(렌더 픽셀이 아니라). 조명·안개·톤매핑이 섞이면 같은 재질도
//    프레임마다 달라져 판정이 흔들린다 — 여기서 묻는 것은 **재질 상태**이지 화면 명도가 아니다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 원본 6종. 신설 바이옴은 `sp` 테이블이 자기 색을 갖고 있어 같은 경로를 타므로 대표만 넣는다.
const T = {
    forest: { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    desert: { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    rock: { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    snow: { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    magic: { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    lava: { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
};
const NAMES = Object.keys(T);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // 프롭 배치가 `Math.random` 이라 고정하지 않으면 히스토그램의 **개수**가 매번 달라져 비교가 안 된다.
    await page.addInitScript(() => {
        let sd = 20260820 >>> 0;
        Math.random = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && !!Scene3D.trees, null, { timeout: 60000 });

    const run = async (breakIt) => page.evaluate(([THEMES, NAMES, breakIt]) => {
        if (breakIt) Scene3D.syncVxMats = () => {};
        // 재질 스냅샷 — `Scene3D` 에 이름으로 달린 재질 전부 + `vxMat` 이 만든 **클론**(실제로 그려지는 쪽).
        // 클론은 원본 이름으로 키를 달아 둔다(`vx:stoneMat` 식). 이름이 없으면 비교표를 못 읽는다.
        const snap = () => {
            const nameOf = {}, out = {};
            for (const k of Object.keys(Scene3D)) {
                const v = Scene3D[k];
                if (v && v.isMaterial) nameOf[v.uuid] = k;
            }
            for (const k of Object.keys(Scene3D)) {
                const v = Scene3D[k];
                if (!v || !v.isMaterial) continue;
                if (v.color) out[k] = '#' + v.color.getHexString();
                if (v.emissive) out[k + '.emis'] = '#' + v.emissive.getHexString();
            }
            if (Scene3D._vxMats) {
                Scene3D._vxMats.forEach((m, base) => {
                    out['vx:' + (nameOf[base.uuid] || base.uuid)] = '#' + m.color.getHexString();
                });
            }
            return out;
        };
        // 🚨 **워밍업 — 지연 생성 재질을 먼저 다 태운다.** `crystalContactMat`·`crystalHaloMat`·`lavaGlowMat`
        //    과 `vxMat` 클론들은 **그 재질이 처음 필요해질 때** 만들어진다. 워밍업 없이 재면 첫 경로의
        //    스냅샷에는 키가 아예 없고 나중 경로에는 있어서 `없음↔#f4faff` 같은 **거짓 어긋남**이 난다
        //    (첫 판이 그렇게 나왔다 — 색 누수가 아니라 '아직 안 태어났다'였다).
        for (const w of NAMES) Scene3D.setTheme(THEMES[w]);
        const out = {};
        for (const t of NAMES) {
            out[t] = {};
            for (const p of NAMES) {
                if (p === t) continue;
                Scene3D.setTheme(THEMES[p]);
                Scene3D.setTheme(THEMES[t]);
                out[t][p] = snap();
            }
        }
        return out;
    }, [T, NAMES, breakIt]);

    const judge = (res) => {
        const bad = [];
        for (const t of NAMES) {
            const paths = Object.keys(res[t]);
            const ref = JSON.stringify(res[t][paths[0]]);
            for (const p of paths.slice(1)) {
                if (JSON.stringify(res[t][p]) !== ref) {
                    // 어느 색이 갈렸는지 찍는다 — "다르다"만 알려 주면 고칠 수가 없다
                    const a = res[t][paths[0]], b = res[t][p];
                    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
                    const diff = keys.filter(k => a[k] !== b[k])
                        .map(k => `${k} ${a[k] || '없음'}↔${b[k] || '없음'}`).join(' · ');
                    bad.push(`${t}: ${paths[0]} 경유 ↔ ${p} 경유 — ${diff}`);
                }
            }
        }
        return bad;
    };

    const real = judge(await run(false));
    console.log(`① 경로 무관성 — 대상 ${NAMES.length}종 × 선행 ${NAMES.length - 1}종 (재질 단위 스냅샷)`);
    if (real.length) real.forEach(l => console.log('   ✗ ' + l));
    else console.log('   전부 일치 — 같은 바이옴은 어느 경로로 들어와도 같은 색이다');

    // 음성 대조: 동기화를 끊으면 반드시 갈려야 한다
    const neg = judge(await run(true));
    console.log(`② 음성 대조(syncVxMats 무력화) — 어긋남 ${neg.length}건 ${neg.length ? '(정상: 이 자가 변별력이 있다)' : '(‼ 검사가 비어 있다)'}`);
    if (neg.length) console.log('   예: ' + neg[0]);

    console.log('콘솔 에러: ' + errs.length + (errs.length ? '\n  ' + errs.slice(0, 4).join('\n  ') : ''));
    const fail = real.length > 0 || neg.length === 0 || errs.length > 0;
    console.log(fail ? '판정: FAIL' : '판정: PASS — 바이옴 재질색이 진입 경로와 무관하다 (음성 대조도 통과)');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
