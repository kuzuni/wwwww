// mobile-combat-scene-blank 검증 자 — **WebGL 컨텍스트를 진짜로 죽였다 살려** 전장이 돌아오는지 잰다.
//
// 사용자 신고: "핸드폰 크롬에서 원래 제대로 열렸는데, 어느 순간 다시 접속하니 전투씬이 안 보임"
// (상단 전투 영역만 통째 검정, 하단 UI 는 정상). 이 저장소에는 컨텍스트 로스/복구 리스너가
// **한 줄도 없었다**(grep 0건) — 모바일 크롬은 백그라운드 왕복·GPU 메모리 압박에서 컨텍스트를
// 버리는데, preventDefault 를 안 부르면 브라우저는 복구 이벤트조차 안 쏘므로 영영 검정이 된다.
//
// 재는 것 넷 — 전부 **캔버스 픽셀**로 판정한다(상태 플래그를 믿지 않는다):
//   ⑴ 기준       : 정상 부팅 프레임이 검지 않다(=자가 검증. 여기서 실패하면 나머지 판정은 무의미)
//   ⑵ 로스 직후  : `WEBGL_lose_context.loseContext()` 로 죽인 뒤 리스너가 로스를 인지하는가
//   ⑶ 복구       : `restoreContext()` 후 **다시 그려지는가** (이 항목이 사용자 증상 그 자체다)
//   ⑷ 강제 재생성: 복구 이벤트가 끝내 안 오는 기기 대비 — `hardRecover()` 로 캔버스를 갈아 끼운 뒤
//                  전장이 돌아오고 **진행 상태(worldX·적 수)가 보존되는가**
//
// ⚠️ 캔버스를 `toDataURL` 로 읽지 않는다 — 메인 렌더러는 `preserveDrawingBuffer:false` 라 합성기가
//    물고 있던 낡은 프레임이 돌아올 수 있다. `renderFrame()` 직후 `gl.readPixels` 로 **드로잉버퍼를
//    직접** 읽는다(probe-flash-gl.js 가 같은 함정을 적어 둔 자리다).
//
// 사용: node tools/probe-ctx-loss.js
// exit 0 = 4항목 전부 통과 · 1 = 실패(어느 항목인지 표에 찍힌다) · 2 = 자 고장(기준 프레임이 검정)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 판정 하한 — 전장은 하늘·지면·영웅이 있어 평균 휘도가 넉넉히 높다. 검정 화면은 0 에 붙는다.
const LIT = 12;        // 이 평균 휘도를 넘으면 "그려졌다"
const NONBLACK = 0.05; // 비검정 픽셀 비율 하한

(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await page.goto(INDEX);
    // ⚠️ waitForFunction 은 swiftshader 로 메인 스레드가 포화된 부팅 구간에서 폴링을 못 돌린다
    //    (wait-ready.js 주석 ②) — 노드 쪽에서 폴링하는 waitReady 를 쓴다.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.renderer && Scene3D.heroG', { timeout: 180000, label: '전장 부팅' });

    // 드로잉버퍼를 직접 읽어 (평균휘도, 비검정비율) 을 낸다. 항상 renderFrame() 을 한 번 돌린 직후에.
    const sample = () => page.evaluate(() => {
        Scene3D.renderFrame();
        const gl = Scene3D.renderer.getContext();
        if (!gl || gl.isContextLost()) return { lost: true, lum: 0, nz: 0 };
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, nz = 0;
        for (let i = 0; i < px.length; i += 4) {
            const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            sum += l; if (l > 8) nz++;
        }
        const n = px.length / 4;
        return { lost: false, lum: sum / n, nz: nz / n, w, h };
    });

    const rows = [];
    let fail = 0;

    // ⑴ 기준 — 자가 검증. 정상 프레임이 검으면 이 자는 전장을 안 보고 있는 것이다.
    const base = await sample();
    rows.push(['⑴ 기준 프레임', base.lum.toFixed(1), (base.nz * 100).toFixed(1) + '%', base.lum > LIT && base.nz > NONBLACK ? 'OK' : 'FAIL']);
    if (!(base.lum > LIT && base.nz > NONBLACK)) {
        console.log('자 고장 — 정상 부팅 프레임이 검정이다(lum=' + base.lum.toFixed(1) + '). 판정하지 않는다.');
        await browser.close(); process.exit(2);
    }

    // 진행 상태 보존을 볼 기준값 — 강제 재생성이 게임을 되감지(=리로드로 때우지) 않는지 확인한다.
    // ⚠️ 적 수로 재면 안 된다: 프로브가 도는 동안에도 전투는 계속 돌아 스폰·처치로 수가 바뀐다
    //    (실측 2→4). 페이지가 새로 뜨면 사라지는 **마커**를 심어 리로드 자체를 본다.
    await page.evaluate(() => { window.__noReload = 'kept'; });
    const before = await page.evaluate(() => ({ worldX: Scene3D.worldX, enemies: Scene3D.enemyMap.size }));

    // ⑵ 로스 — 확장으로 진짜 컨텍스트 로스를 일으킨다(이벤트는 비동기로 온다).
    await page.evaluate(() => {
        const gl = Scene3D.renderer.getContext();
        window.__ext = gl.getExtension('WEBGL_lose_context');
        window.__ext.loseContext();
    });
    await waitReady(page, 'Scene3D.ctxLost === true', { timeout: 20000, label: '로스 인지' }).catch(() => { });
    const lostSeen = await page.evaluate(() => Scene3D.ctxLost === true);
    rows.push(['⑵ 로스 인지', lostSeen ? 'ctxLost=true' : 'ctxLost=false', '-', lostSeen ? 'OK' : 'FAIL']);
    if (!lostSeen) fail++;

    // 로스 중에 update 를 돌려도 예외가 새지 않아야 한다(rAF 루프가 죽으면 복구해도 안 그려진다).
    const errsBefore = logs.filter(l => l.startsWith('PAGEERROR')).length;
    await page.evaluate(() => { for (let i = 0; i < 5; i++) Scene3D.update(1 / 60); });
    const errsAfterLost = logs.filter(l => l.startsWith('PAGEERROR')).length;
    rows.push(['⑵b 로스 중 update', (errsAfterLost - errsBefore) + '건 예외', '-', errsAfterLost === errsBefore ? 'OK' : 'FAIL']);
    if (errsAfterLost !== errsBefore) fail++;

    // ⑶ 복구 — 브라우저가 컨텍스트를 돌려준 뒤 전장이 실제로 다시 그려지는가.
    await page.evaluate(() => window.__ext.restoreContext());
    await waitReady(page, 'Scene3D.ctxLost === false', { timeout: 30000, label: '복구 이벤트' }).catch(() => { });
    await page.evaluate(() => { for (let i = 0; i < 3; i++) Scene3D.update(1 / 60); });
    const rest = await sample();
    const restOK = !rest.lost && rest.lum > LIT && rest.nz > NONBLACK;
    rows.push(['⑶ 복구 후 렌더', rest.lum.toFixed(1), (rest.nz * 100).toFixed(1) + '%', restOK ? 'OK' : 'FAIL']);
    if (!restOK) fail++;

    // ⑷ 강제 재생성 — 복구 이벤트가 안 오는 기기용 마지막 그물.
    const hard = await page.evaluate(() => {
        const gl = Scene3D.renderer.getContext();
        gl.getExtension('WEBGL_lose_context').loseContext();
        Scene3D.ctxLost = true;
        const ok = Scene3D.hardRecover();
        for (let i = 0; i < 3; i++) Scene3D.update(1 / 60);
        return { ok, worldX: Scene3D.worldX, enemies: Scene3D.enemyMap.size, attached: !!document.getElementById('game3d'), marker: window.__noReload || '(사라짐)' };
    });
    const hardPx = await sample();
    const hardOK = hard.ok && hard.attached && !hardPx.lost && hardPx.lum > LIT && hardPx.nz > NONBLACK;
    rows.push(['⑷ 강제 재생성', hardPx.lum.toFixed(1), (hardPx.nz * 100).toFixed(1) + '%', hardOK ? 'OK' : 'FAIL']);
    if (!hardOK) fail++;

    // 진행 보존 — 되감기(리로드)로 때웠으면 마커가 사라지고 worldX 도 0 으로 돌아간다.
    const kept = hard.marker === 'kept' && Math.abs(hard.worldX - before.worldX) < 1e-6 && hard.enemies > 0;
    rows.push(['⑷b 진행 보존', '마커 ' + hard.marker, 'worldX ' + before.worldX.toFixed(3) + '→' + hard.worldX.toFixed(3), kept ? 'OK' : 'FAIL']);
    if (!kept) fail++;

    // ⑸ 컨텍스트를 **아예 못 만드는 기기** — WebGLRenderer 생성이 던지게 만들고 부팅을 통째로 돌린다.
    //    예전 코드는 이 예외가 boot() 를 끊어 Combat.start()·논리 틱·자동저장까지 등록되지 않았다
    //    (= UI 만 살아 있고 전장은 검정 + 게임이 멈춘 화면). 전장은 못 그려도 **게임은 굴러야** 한다.
    const page2 = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const logs2 = [];
    page2.on('console', m => logs2.push(m.text()));
    page2.on('pageerror', e => logs2.push('PAGEERROR ' + e.message));
    await page2.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            THREE.WebGLRenderer = function () { throw new Error('forced: no WebGL'); };
        }, true);
    });
    // 🚨 앞으로 끌어오지 않으면 이 탭은 `document.hidden` 이라 **논리 틱이 스스로 쉰다**(main.js 의
    //    백그라운드 스로틀 방지 코드) — 코드가 멀쩡해도 '틱 멈춤'으로 오독된다(실측으로 밟았다).
    await page2.bringToFront();
    await page2.goto(INDEX);
    // ⚠️ `glFailed` 는 init 초반에 켜진다 — 그때 재면 부팅이 아직 진행 중이라 로딩창도 적도 없다.
    //    **부팅이 끝난 것**(로딩 오버레이가 걷히고 전투가 차려진 것)을 기다려야 판정이 성립한다.
    await waitReady(page2, 'typeof Scene3D !== "undefined" && Scene3D.glFailed === true && typeof Combat !== "undefined" && Combat.enemies.length > 0', { timeout: 180000, label: 'GL 실패 부팅' }).catch(() => { });
    await page2.waitForTimeout(1500);   // 로딩 오버레이 페이드아웃(bl-done) 마무리
    const nogl = await page2.evaluate(() => ({
        glFailed: !!Scene3D.glFailed,
        heroG: !!Scene3D.heroG,                       // 씬 그래프는 끝까지 지어졌는가
        enemies: (typeof Combat !== 'undefined' && Combat.enemies) ? Combat.enemies.length : -1,
        fallback: !!document.querySelector('.gl-fallback'),
        // 로딩 오버레이가 안 걷혔으면 부팅이 중간에 끊긴 것이다(`bl-done` 이 걷는 클래스).
        loadingGone: (() => { const el = document.getElementById('boot-loading'); return !el || el.classList.contains('bl-done'); })(),
    }));
    // 논리 틱이 등록됐는가 — 1.2초 뒤 전투가 실제로 진행돼 있어야 한다(예전엔 여기서 통째로 멈췄다).
    const hp0 = await page2.evaluate(() => (Combat.enemies[0] ? Combat.enemies[0].hp : 0) + '');
    await page2.waitForTimeout(1200);
    const ticked = await page2.evaluate((h0) => {
        const e = Combat.enemies[0];
        return !!e && String(e.hp) !== h0;            // 데미지가 들어갔다 = 틱이 돈다
    }, hp0);
    const noglOK = nogl.glFailed && nogl.heroG && nogl.enemies > 0 && nogl.fallback && nogl.loadingGone && ticked;
    rows.push(['⑸ GL 없는 기기', '적 ' + nogl.enemies + '체·안내 ' + (nogl.fallback ? '있음' : '없음'), '틱 ' + (ticked ? '돈다' : '멈춤') + '·로딩 ' + (nogl.loadingGone ? '걷힘' : '남음'), noglOK ? 'OK' : 'FAIL']);
    if (!noglOK) fail++;

    // ⑹ update 가 던져도 rAF 루프가 살아남는가 — 한 번 던지면 그 프레임에서 화면이 영구히 멈추던 자리.
    const loopAlive = await page.evaluate(async () => {
        const orig = Scene3D.update;
        let calls = 0;
        Scene3D.update = function () { calls++; if (calls <= 3) throw new Error('forced update throw'); return orig.apply(this, arguments); };
        await new Promise(r => setTimeout(r, 700));
        const survived = calls > 5;                   // 던진 뒤에도 계속 불렸다 = 루프가 살아 있다
        Scene3D.update = orig;
        return { calls, survived };
    });
    rows.push(['⑹ 루프 생존', loopAlive.calls + '회 호출', '-', loopAlive.survived ? 'OK' : 'FAIL']);
    if (!loopAlive.survived) fail++;

    console.log('\n항목                  값1          값2          판정');
    for (const r of rows) console.log(r[0].padEnd(20) + String(r[1]).padEnd(13) + String(r[2]).padEnd(13) + r[3]);
    const pageErrs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (pageErrs.length) console.log('\n페이지 예외 ' + pageErrs.length + '건:\n  ' + pageErrs.slice(0, 5).join('\n  '));
    const pageErrs2 = logs2.filter(l => l.startsWith('PAGEERROR'));
    if (pageErrs2.length) console.log('\nGL 없는 기기 페이지 예외 ' + pageErrs2.length + '건:\n  ' + pageErrs2.slice(0, 5).join('\n  '));
    console.log('\n' + (fail ? fail + '개 항목 실패' : '전 항목 통과'));
    await browser.close();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
