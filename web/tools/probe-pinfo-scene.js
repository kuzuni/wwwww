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

    // ── ⑹ 잔디 맵인가: 캔버스 화소로 확인(초록 지면 + 하늘색 하늘) ──
    await page.evaluate(() => { for (let i = 0; i < 12; i++) Scene3D.previewTick(1 / 60); });
    const shot = await page.locator('#pinfo-scene').screenshot();
    fs.writeFileSync(path.join(OUT, 'pinfo-scene.png'), shot);
    const hue = await page.evaluate(async (src) => {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let green = 0, red = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            if (g > r + 12 && g > b + 12) green++;      // 초록 우세(잔디·잎)
            if (r > g + 30 && r > b + 30) red++;        // 붉은 우세(용암)
            n++;
        }
        return { greenPct: +(green / n * 100).toFixed(2), redPct: +(red / n * 100).toFixed(2), n };
    }, 'data:image/png;base64,' + shot.toString('base64'));
    say(hue.greenPct >= 12, `⑹ 잔디 맵이다 — 초록 우세 화소 ${hue.greenPct}% (기준 ≥12%)`);
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

    say(errors.length === 0, `⑼ 콘솔 에러 ${errors.length}건${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
    process.exit(fails ? 1 : 0);
})();
