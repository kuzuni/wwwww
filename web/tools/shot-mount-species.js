// 탈것 종 판독 시트 (`mount-species-recognizable`).
// 판정 질문이 "이름 안 보고 그림만 봐도 무슨 동물/기계인지 맞힐 수 있는가" 라서,
// 인게임 480px 스샷(탈것이 화면의 12% 남짓)으로는 **판정 자체가 불가능**하다.
// `mountThumb` 과 같은 렌더러·같은 조명에 태우되 240px 로 크게, 그리고
// **게임 앵글(요각 0.55) + 옆모습(요각 1.57)** 두 장을 나란히 찍는다 —
// 종 실루엣은 옆모습에서 갈리고(게 등딱지·당나귀 귀), 게임에서 실제로 보이는 건 3/4 각이다.
//
// ⚠️ `creatureThumb` 을 그냥 부르면 요각이 0.55 로 박혀 있고 캐시 키에 요각이 없다.
//    그래서 같은 내부(_creatureR/_creatureCam/thumbFrameToFit)를 직접 태운다 —
//    조명·인코딩·프레이밍이 전부 본편과 같은 경로여야 색·크기 판정이 유효하다.
//
// 사용: node shot-mount-species.js [종...]   → tools/mount-species.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
// `--blind` 를 주면 **이름을 지우고 번호만** 찍는다 — 이 항목의 채점 질문이 "이름 안 보고
// 그림만 보고 맞히는가" 라서, 이름이 붙은 시트를 비평가에게 주면 채점 자체가 성립하지 않는다
// ('게라고 하니 게로 보인다'). 정답표는 이 스크립트가 stdout 에 번호↔이름으로 따로 찍는다.
// 출력 파일도 갈라 둔다(`mount-species-blind.png`) — 이름 있는 시트를 실수로 넘기지 않게.
const RAW = process.argv.slice(2);
const BLIND = RAW.includes('--blind');
const ARG = RAW.filter(a => a !== '--blind');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1160, height: 1500 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof MOUNT_KR !== "undefined"');

    const { n, key } = await page.evaluate(([argNames, blind]) => {
        const names = argNames.length ? argNames : Object.keys(MOUNT_KR);
        Scene3D.mountThumb('Pony', 'common');          // 렌더러 1회 초기화(조명 동기화 포함)
        // 셀 크기는 종 수에 따라 — 8종 넘게 늘어놓으면 한 장에 다 들어가지만 개별 판독이 안 되고,
        // 2~4종만 보는 수정 루프에서는 크게 봐야 조형이 보인다.
        const CELL = names.length <= 2 ? 520 : names.length <= 4 ? 380 : 240;
        Scene3D._creatureR.setSize(CELL, CELL);
        const shot = (name, ry) => {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
            const g = new THREE.Group();
            g.rotation.y = ry;
            g.add(Scene3D.makeMountMesh(name, 'epic'));
            sc.add(g);
            // 게임 썸네일(creatureThumb)과 동일하게 `hideInThumb`(비행 탈것 등자 등)를 끈다 — 이 시트가
            //    플레이어가 실제로 보는 썸네일의 충실한 대리여야 채점이 유효하다(라이더 없는 썸네일에서
            //    등자가 허공에 뜬 흰 큐브로 읽히던 것을 게임과 같은 경로로 숨긴다).
            g.traverse(o => { if (o.userData && o.userData.hideInThumb) o.visible = false; });
            // 게임 썸네일(creatureThumb)과 동일하게 `showInThumb`(비행 막날개 두께 겹)를 켠다 — 실물은
            //    invisible(인게임·ride-clear 에서 빠짐)이라 채점 시트가 게임 슬롯 썸네일의 충실한 대리가 되려면 여기서 켜야 한다.
            g.traverse(o => { if (o.userData && o.userData.showInThumb) o.visible = true; });
            Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            Scene3D._creatureR.render(sc, Scene3D._creatureCam);
            // 게임 슬롯 썸네일(creatureThumb, 탈것)과 동일한 candy 채도 후처리(mount-thumb-sat-post)를 태운다 —
            //    이 시트가 실제 제품 썸네일의 충실한 대리여야 채점이 유효하다(hideInThumb/showInThumb 규약과 동형).
            return Scene3D.candyLiftURL(Scene3D._creatureR.domElement);
        };
        const cells = names.map((nm, idx) => {
            const a = shot(nm, 0.55), b = shot(nm, Math.PI / 2);
            // ⚠️ 이름은 **그림 아래**에 작게 — 판정자가 이름을 먼저 읽으면 '게라고 하니 게로 보인다'가 된다.
            const w = names.length <= 2 ? CELL : Math.round(CELL * 0.51);
            return `<div style="width:${w * 2 + 6}px;margin:3px;background:#20242b;border-radius:10px;padding:4px">
                <div style="display:flex"><img src="${a}" style="width:${w}px;height:${w}px"><img src="${b}" style="width:${w}px;height:${w}px"></div>
                <div style="font:${blind ? '13px' : '11px'} sans-serif;color:#9fb0c0;text-align:center">${blind ? '#' + (idx + 1) : (MOUNT_KR[nm] || nm) + ' / ' + nm}</div></div>`;
        }).join('');
        // ⚠️ body 를 갈아엎기 전에 게임 타이머를 먼저 끊는다 — 사라진 노드를 UI 주기 갱신이 잡아
        //    가짜 콘솔 에러를 뱉으면 진짜 회귀가 덮인다(shot-era-gear-zoom 과 같은 함정).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#11141a;padding:6px;width:${names.length <= 2 ? 1090 : names.length <= 4 ? 1150 : 1046}px;display:flex;flex-wrap:wrap">${cells}</div>`;
        return { n: names.length, key: names };
    }, [ARG, BLIND]);

    const OUTPNG = BLIND ? 'mount-species-blind.png' : 'mount-species.png';
    await page.locator('#sheet').screenshot({ path: path.join(__dirname, OUTPNG) });
    await browser.close();
    console.log(`→ tools/${OUTPNG} · ${n}종 · 콘솔 에러 ${errors.length}건`);
    // 정답표 — 채점자에게는 **주지 말 것**. 채점 결과를 대조할 때만 쓴다.
    // ⚠️ 브라우저를 닫은 **뒤에** page.evaluate 로 뽑으려다 한 번 터졌다 — 시트를 만드는
    //    그 evaluate 안에서 이름 배열을 같이 돌려받는다.
    if (BLIND) console.log('정답표(채점자에게 주지 말 것): ' + key.map((nm, i) => `#${i + 1}=${nm}`).join(' · '));
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 240)));
})();
