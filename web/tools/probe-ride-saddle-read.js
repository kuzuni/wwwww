// 자전거 안장 판독 실측 — "자전거 안장이 '없다'로 읽힌다"(mount-ride 4차 비평 잔여 ㉱⑶ 판독)를
// 고쳤는지 판정한다. 지오메트리는 원래부터 실재했으므로(코드에 sp(0.10, …) 존재) 존재 검사는
// 무의미하고, probe-collar 와 같은 **껐다 켠 두 프레임 차분**으로 화면 기여 픽셀을 센다.
//
// 판정: ① 근접 앵글 기여 ≥ 250px(안장이 오브젝트로 읽히는 크기) ② 인게임 카메라 기여 ≥ 60px
//       ③ 기여 픽셀 평균색이 살색 대역 밖(빨강 우세 R-B ≥ 15, 또는 밝은 금속 lum ≥ 110)
//       ④ 콘솔/페이지 에러 0
// ⚠️ 두 그랩 사이에 update 를 돌리면 안 된다 — 포즈·부유 위상이 달라져 차분이 전신으로 번진다.
//    같은 evaluate 안에서 visible 토글 + 재렌더만 한다(probe-collar 규약).
// ⚠️ 이 프로브군은 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
// 사용: node probe-ride-saddle-read.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 180000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const run = async (near) => page.evaluate((near) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) { } }
        Scene3D.anims = [];
        S.mounts = { 'Bike': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Bike';
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const hero = Scene3D.heroG;
        Scene3D.camLock = near ? {
            pos: new THREE.Vector3(hero.position.x, hero.position.y + 1.7, 3.4),
            look: new THREE.Vector3(hero.position.x, hero.position.y + 0.95, 0),
        } : null;
        for (let i = 0; i < 3; i++) Scene3D.update(1 / 60);

        const inner = Scene3D.mountGroup.children[0];
        const parts = (inner.userData.saddleParts || Scene3D.mountGroup.userData.saddleParts || []);
        if (!parts.length) return { error: 'saddleParts 태그 없음 — 판정 불가' };
        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const on = grab();
        for (const p of parts) p.visible = false;
        const off = grab();
        for (const p of parts) p.visible = true;
        // ⚠️ 평균색으로 판정하면 안 된다 — 차분에는 실루엣 아웃라인/AA 가장자리가 양방향으로 섞여
        //    (실측: 다크뉴트럴 725px, 풀색 샘플까지) 평균이 항상 어두운 회색으로 끌린다. 기여 픽셀을
        //    색 버킷으로 갈라 **빨강 우세(가죽) + 밝은 금속(레일) 픽셀 수**를 신호로 센다.
        let n = 0, red = 0, bright = 0;
        for (let i = 0; i < on.length; i += 4) {
            if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) {
                n++;
                const r = on[i], g2 = on[i + 1], b2 = on[i + 2];
                if (r - Math.max(g2, b2) >= 18) red++;
                else if (0.299 * r + 0.587 * g2 + 0.114 * b2 >= 110) bright++;
            }
        }
        return { contrib: n, red, bright };
    }, near);

    const nearR = await run(true);
    const gameR = await run(false);
    if (nearR.error || gameR.error) { console.log('판정 불가:', nearR.error || gameR.error); await browser.close(); return; }
    const checks = [
        [`① 근접 기여 ${nearR.contrib}px ≥ 250`, nearR.contrib >= 250],
        [`② 인게임 기여 ${gameR.contrib}px ≥ 60`, gameR.contrib >= 60],
        [`③ 근접 신호색(빨강 ${nearR.red} + 밝음 ${nearR.bright})px ≥ 200 — 살색 대역 아님·어둠에 안 묻힘`, nearR.red + nearR.bright >= 200],
        [`④ 콘솔/페이지 에러 0`, errs.length === 0],
    ];
    let fail = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) fail++; }
    console.log(fail ? '미통과 있음' : '전부 통과', JSON.stringify({ nearR, gameR, errs: errs.slice(0, 3) }));
    await browser.close();
})();
