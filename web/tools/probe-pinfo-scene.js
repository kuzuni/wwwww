// 플레이어 정보 팝업 미니 전투씬 검증 (player-info-scene-thumb)
// 사용자 지시 3가지를 **각각** 실측한다:
//   ① 현재 챕터와 무관하게 잔디 맵인가  ② 플레이어가 가운데 고정 + 이동 모션인가  ③ 맵이 흘러가는가
// ⚠️ 헤드리스에서는 연출 시간이 안 흐르므로(TODO '함정 ③'), 프레임을 **직접 흘려**(previewTick) 재고
//    캡처는 그 사이에 찍는다. rAF 에 의존하면 swiftshader 에서 사실상 정지 화면이 나온다.
// 사용: node probe-pinfo-scene.js [출력디렉터리]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || '.';

let fails = 0;
const say = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    // 🚨 **용암 챕터에서 연다** — '현재 맵과 상관없이 잔디'가 이 항목의 요구 ① 이라, 잔디 챕터에서
    //    열어 보면 통과해도 아무것도 증명하지 못한다. 가장 다른 맵(9 용암)으로 옮겨 놓고 연다.
    await page.evaluate(() => {
        Combat.tick = () => {};
        S.chapter = 9; S.stage = 1;
        Scene3D.setChapterTheme(9);
    });
    await page.waitForTimeout(400);
    const battleBiome = await page.evaluate(() => Scene3D._biome);

    await page.evaluate(() => UI.openPlayerInfo());
    await page.waitForTimeout(500);

    const st = await page.evaluate(() => {
        const host = document.getElementById('pinfo-scene');
        const cv = host && host.querySelector('canvas');
        return {
            host: !!host, canvas: !!cv,
            w: cv ? cv.clientWidth : 0, h: cv ? cv.clientHeight : 0,
            running: !!Scene3D._pvRun,
            heroInBattle: !!(Scene3D.heroRig && Scene3D.heroRig.group.parent === Scene3D.heroG),
            battleBiome: Scene3D._biome,
            clip: Scene3D._pvRig && Scene3D._pvRig.state,
        };
    });
    say(st.host && st.canvas, `⑴ 미니 씬 캔버스가 붙었다 (${st.w}×${st.h})`);
    say(st.w > 40 && st.h > 40, `⑴ 캔버스 크기가 0 이 아니다 — ${st.w}×${st.h}`);
    say(st.running, '⑴ 렌더 루프가 돌고 있다');
    // 🚨 본편 침범 검사 — 미니 씬을 만들면서 전장의 테마나 영웅을 가져가지 않았는지
    say(st.battleBiome === battleBiome && battleBiome === 'lava',
        `⑵ 전장 바이옴이 그대로다 — ${battleBiome} → ${st.battleBiome} (미니 씬이 setTheme 을 건드리면 여기가 forest 로 바뀐다)`);
    say(st.heroInBattle, '⑵ 전장 영웅이 그대로 heroG 아래 있다 (미니 씬이 heroG 를 가져가면 전장에서 사라진다)');
    say(st.clip === 'Walking', `⑶ 프리뷰 영웅이 이동 모션 클립 재생 중 — state=${st.clip}`);

    // ── 프레임을 직접 흘려 '움직임'을 실측한다 ──
    const move = await page.evaluate(() => {
        const S3 = Scene3D;
        S3.previewStop();                       // rAF 를 끊고 수동으로 흘린다(결정적 측정)
        const snap = () => ({
            tex: +S3._pvGroundTex[0].offset.x.toFixed(4),
            props: S3._pvProps.map(p => +p.position.x.toFixed(3)),
            ridge: S3._pvRidges.map(m => +m.position.x.toFixed(3)),
            hero: [+S3._pvRig.group.position.x.toFixed(3), +S3._pvRig.group.position.z.toFixed(3)],
            knee: +S3._pvRig.bones.kneeL.rotation.x.toFixed(4),
        });
        const a = snap();
        for (let i = 0; i < 30; i++) S3.previewTick(1 / 60);   // 0.5초
        const b = snap();
        for (let i = 0; i < 30; i++) S3.previewTick(1 / 60);
        const c = snap();
        return { a, b, c };
    });
    const dTex = move.b.tex - move.a.tex;
    say(dTex > 0.02, `⑷ 지면 텍스처가 흐른다 — offset.x ${move.a.tex} → ${move.b.tex} (Δ${dTex.toFixed(4)})`);
    const dProp = move.a.props[0] - move.b.props[0];
    say(dProp > 0.5, `⑷ 소품이 옆으로 흘러간다 — x ${move.a.props[0]} → ${move.b.props[0]} (Δ${dProp.toFixed(3)})`);
    const dRidge = move.a.ridge[0] - move.b.ridge[0];
    say(dRidge > 0 && dRidge < dProp, `⑷ 원경 능선은 시차만큼 더 느리다 — 능선 Δ${dRidge.toFixed(3)} < 소품 Δ${dProp.toFixed(3)}`);
    say(move.a.hero[0] === move.b.hero[0] && move.b.hero[0] === move.c.hero[0],
        `⑸ 플레이어는 가운데 고정 — x ${move.a.hero[0]} 불변 (맵만 흘러야 한다)`);
    say(move.a.knee !== move.b.knee || move.b.knee !== move.c.knee,
        `⑸ 다리 관절이 실제로 움직인다 — kneeL.rx ${move.a.knee} → ${move.b.knee} → ${move.c.knee}`);

    // ── ⑹ 초원 맵인가: 캔버스 화소로 확인(흙 지면 + 하늘색 하늘) ──
    // 🌾 **기준을 '초록 우세 ≥12%' → '난색(흙) 우세 ≥12%' 로 바꿨다** (background-grass-road-cleanup,
    //    사용자 지시 2026-08-21 "배경에 잔디 다없애기."). 이 자가 재던 초록은 **잔디 지면**이었고
    //    그 잔디를 지시로 걷어냈으므로 옛 기준은 지시와 정면으로 어긋난다(느슨하게 푼 게 아니라
    //    같은 강도로 대상을 옮긴 것이다). 잎·능선은 여전히 초록이라 초록이 0 이 되지는 않는다.
    await page.evaluate(() => { for (let i = 0; i < 12; i++) Scene3D.previewTick(1 / 60); });
    const shot = await page.locator('#pinfo-scene').screenshot();
    fs.writeFileSync(path.join(OUT, 'pinfo-scene.png'), shot);
    const hue = await page.evaluate(async (src) => {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let green = 0, soil = 0, red = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (g > r + 12 && g > b + 12) green++;      // 초록 우세(잎·원경 능선)
            if (r >= g + 4 && g > b + 14 && r > b + 24) soil++;  // 난색 흙 우세(지면·도로) — 붉은 우세와 겹치지 않게 r-g 는 작게
            if (r > g + 30 && r > b + 30) red++;        // 붉은 우세(용암)
            n++;
        }
        return { greenPct: +(green / n * 100).toFixed(2), soilPct: +(soil / n * 100).toFixed(2), redPct: +(red / n * 100).toFixed(2), n };
    }, 'data:image/png;base64,' + shot.toString('base64'));
    say(hue.soilPct >= 12, `⑹ 초원(흙 지면) 맵이다 — 난색 흙 우세 화소 ${hue.soilPct}% (기준 ≥12%, 잔디 제거 후 기준)`);
    say(hue.redPct <= 3, `⑹ 용암 맵이 아니다 — 붉은 우세 화소 ${hue.redPct}% (기준 ≤3%, 현재 챕터는 9 용암)`);

    // ── ⑺ 팝업을 닫으면 루프가 끊기는가(안 끊으면 안 보이는 씬이 계속 GPU 를 먹는다) ──
    await page.evaluate(() => { Scene3D.previewStart(document.getElementById('pinfo-scene')); UI.closePlayerInfo(); });
    await page.waitForTimeout(120);
    say(await page.evaluate(() => !Scene3D._pvRun), '⑺ 팝업을 닫으면 렌더 루프가 멈춘다');

    // ── ⑻ 두 번 열어도 WebGL 컨텍스트가 하나뿐인가(열 때마다 만들면 전장이 죽는다) ──
    const ctx = await page.evaluate(() => {
        const first = Scene3D._pvR;
        UI.openPlayerInfo();
        return { same: Scene3D._pvR === first, canvases: document.querySelectorAll('canvas').length };
    });
    await page.waitForTimeout(200);
    say(ctx.same, '⑻ 다시 열어도 렌더러를 재사용한다(WebGL 컨텍스트 누수 없음)');
    say(ctx.canvases <= 3, `⑻ 문서 전체 캔버스 ${ctx.canvases}개 (전장 + 미니 씬 + 여유 1)`);

    // ⑽ **프리뷰 잎 색이 본편과 같은가 (slug: pinfo-preview-leaf-black).**
    //    이 자는 17개 게이트를 전부 통과하면서도 **잎 색을 안 봤고**, 그 사각지대에서 미니 씬의 잎이
    //    순흑(`#000000`)으로 찍히고 있었다 — 본편 `setTheme` 은 잎에 바닥값(`V.leafFloor`)을 먹이는데
    //    프리뷰용 `previewGrade()` 만 같은 오프셋 표를 복사해 두고 생짜로 적용했기 때문이다.
    //    ⚠️ **픽셀로 재지 말 것** — WebGL 캔버스를 `drawImage`/`toDataURL` 로 되읽으면
    //       `preserveDrawingBuffer:false` 라 본편·프리뷰 **둘 다 '검정 100%'** 가 돌아온다(헛수치).
    //       재질/색 객체를 직접 읽는다.
    //    ⚠️ 🚨 **본편 값을 '지금 재질에 들어 있는 색'으로 읽어서 비교하면 안 된다.** 이 프로브는
    //       9챕터(용암)에서 도는데 프리뷰는 **1챕터 고정**이라, 그냥 비교하면 초록↔갈색을 견주는 꼴이라
    //       늘 어긋난다(첫 판이 `ΔL 0.0206` 으로 헛FAIL 을 냈다). **같은 테마를 본편 경로에 태워** 읽고
    //       원래 테마로 되돌린다 — 이래야 '두 경로가 같은 색을 내는가'라는 원래 질문이 된다.
    const leafChk = await page.evaluate(() => {
        const L = c => c.getHSL({ h: 0, s: 0, l: 0 }).l;
        const T0 = CHAPTER_THEMES[0];
        const g = Scene3D.previewGrade(T0);
        const ch = (typeof S !== 'undefined' && S.chapter) || 1;   // 되돌릴 챕터
        Scene3D.setTheme(T0);                           // 본편 경로로 같은 테마를 태운다
        const live = Scene3D.foliageMats.map(m => ({ hex: '#' + m.color.getHexString(), l: L(m.color) }));
        const bushLive = { hex: '#' + Scene3D.bushMat.color.getHexString(), l: L(Scene3D.bushMat.color) };
        Scene3D.setChapterTheme(ch);                    // 원상복구 — 뒤에 다른 검사가 붙어도 안 흔들리게
        return {
            floor: Scene3D.VALUE.leafFloor * 0.55,
            pv: g.foliage.map(c => ({ hex: '#' + c.getHexString(), l: L(c) })),
            live,
            bush: { pv: '#' + g.bush.getHexString(), live: bushLive.hex, d: Math.abs(L(g.bush) - bushLive.l) },
        };
    });
    const dark = leafChk.pv.filter(c => c.l < leafChk.floor - 1e-6);
    say(dark.length === 0, `⑽ 프리뷰 잎 3색이 전부 바닥값(${leafChk.floor.toFixed(4)}) 위 — ${leafChk.pv.map(c => c.hex + ' L' + c.l.toFixed(4)).join(' ')}`);
    const dl = leafChk.pv.map((c, i) => Math.abs(c.l - leafChk.live[i].l));
    say(Math.max.apply(null, dl) <= 0.02, `⑽ 프리뷰↔본편 잎 ΔL ${dl.map(d => d.toFixed(4)).join(' ')} (≤0.02) · 본편 ${leafChk.live.map(c => c.hex).join(' ')}`);
    say(leafChk.bush.d <= 0.02, `⑽ 덤불도 같은 바닥값 — 프리뷰 ${leafChk.bush.pv} ↔ 본편 ${leafChk.bush.live} ΔL ${leafChk.bush.d.toFixed(4)}`);

    // ⑾ **프리뷰 영웅이 검은 실루엣이 아닌가 (slug: pinfo-preview-hero-black).**
    //    ⑽ 과 같은 '두 벌' 병의 재발 — 환경맵(PMREM)이 본편(scene)·썸네일(_thumbScene)에만 있고
    //    _pvScene 에 없어서, MeshStandardMaterial 인 영웅만 IBL 의존분이 빠져 근흑으로 찍혔다.
    //    ㉠ 씬 객체 직독: _pvScene.environment non-null (원인 축).
    //    ㉡ 화소 실측: 영웅이 서는 중앙 상자에서 밝은 화소(크림색 머리·피부톤)가 실제로 보이는가 (증상 축).
    //       ⚠️ toDataURL 되읽기 금지(⑽ 경고) — 위에서 이미 뜬 page.screenshot() 산 shot 을 재사용한다.
    //       A/B 실측(2026-08-20): bake 를 빼면 2.89%(상자에 걸친 웜톤 바위·지면이 바닥을 만든다),
    //       넣으면 12.56% — 기준은 그 사이 6%(양쪽 여유 ≈2배). 순수 0% 를 기대하지 말 것.
    const heroChk = await page.evaluate(async (src) => {
        const env = !!(Scene3D._pvScene && Scene3D._pvScene.environment);
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        // 영웅 상자: 카메라가 (0.05,0.92) 를 보고 영웅이 화면 중앙에 서므로 가로 중앙 22%, 세로 30~78%
        const x0 = Math.round(c.width * 0.39), x1 = Math.round(c.width * 0.61);
        const y0 = Math.round(c.height * 0.30), y1 = Math.round(c.height * 0.78);
        const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let bright = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            const g = d[i + 1], warm = d[i] > g - 8 && g > d[i + 2] - 8; // 웜톤(머리·피부·가죽) — 초록 배경 배제
            if (l > 0.45 && warm) bright++;
            n++;
        }
        return { env, brightPct: +(bright / n * 100).toFixed(2), n };
    }, 'data:image/png;base64,' + shot.toString('base64'));
    say(heroChk.env, '⑾ _pvScene.environment(PMREM)가 있다 — 없으면 영웅(MeshStandard)만 IBL 없이 근흑');
    say(heroChk.brightPct >= 6, `⑾ 영웅 상자에 밝은 웜톤 화소 ${heroChk.brightPct}% (기준 ≥6% — 실루엣이면 ~2.9%, 정상 ~12.6%)`);

    say(errors.length === 0, `⑼ 콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
    process.exit(fails ? 1 : 0);
})();
