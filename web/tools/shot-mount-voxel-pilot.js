// 🧊 탈것 큐브 조형 **시험판** 대조 시트 (`mount-species-recognizable` ⓒ).
//
// 왜 이 도구가 따로 있는가: 1·2차 채점의 결론이 "탈것이 전부 구·원통이라 확정 화풍(Voxel+치비)이
// 아니다 — 둥근 프리미티브로 가는 한 9/10 은 구조적으로 불가능하다" 였다. 그런데 29종을 통째로
// 갈아엎는 건 되돌리기 어려운 큰 판이라, 인계가 정한 순서는 **한 종만 큐브로 지어 먼저 물어보기**다.
// 이 시트가 그 질문지다 — 같은 종(거북)을 **현행 조형 / 큐브 시험판** 두 줄로 나란히 찍는다.
//
// ⚠️ 두 줄은 **같은 렌더러·같은 조명·같은 자동 프레이밍**에 태운다(`shot-mount-species` 와 같은
//    내부 경로). 조명이나 프레이밍이 다르면 "큐브가 나은가"가 아니라 "이쪽 조명이 나은가"를
//    묻는 시트가 되어 판정이 통째로 무효다.
// ⚠️ 시험판은 `Scene3D.makeMountVoxelPilot` 이고 **게임 경로에 안 물려 있다** — 이 도구만 부른다.
//
// 사용: node shot-mount-voxel-pilot.js   → tools/mount-voxel-pilot.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    // 🚨 **뷰포트를 시트보다 크게 잡을 것 — 여기서 콘솔 에러 1건이 났다.** 두 줄 시트 높이가
    //    ~1000px 인데 뷰포트를 900 으로 뒀더니 `locator.screenshot` 이 뷰포트를 늘리고, 그
    //    리사이즈를 **게임의 resize 리스너**가 받아 이미 지워진 노드의 `.style` 을 읽어 터졌다.
    //    (렌더도 DOM 교체도 각각으로는 0건이라 한참 헤맸다 — 범인은 스크린샷이었다.)
    //    타이머·rAF 를 끊어도 안 막힌다: 리스너는 그대로 살아 있다. **높이로 막는 게 맞다.**
    const page = await browser.newPage({ viewport: { width: 1160, height: 1240 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof Voxel !== "undefined"');

    const info = await page.evaluate(() => {
        Scene3D.mountThumb('Pony', 'common');          // 렌더러 1회 초기화(조명 동기화 포함)
        const CELL = 460;
        Scene3D._creatureR.setSize(CELL, CELL);
        const shot = (mk, ry) => {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
            const g = new THREE.Group();
            g.rotation.y = ry;
            g.add(mk());
            sc.add(g);
            Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            Scene3D._creatureR.render(sc, Scene3D._creatureCam);
            return Scene3D._creatureR.domElement.toDataURL();
        };
        // 파츠 수 — '큐브라서 무거워지는가'는 방향 판정의 실제 쟁점이라 같이 잰다.
        const cur = Scene3D.makeMountMesh('Turtle', 'epic');
        const pil = Scene3D.makeMountVoxelPilot('Turtle', 'epic');
        let curMesh = 0, pilMesh = 0, curTri = 0, pilTri = 0;
        const tally = (o, add) => o.traverse(m => {
            if (!m.geometry) return;
            const idx = m.geometry.index;
            const n = idx ? idx.count / 3 : (m.geometry.attributes.position.count / 3);
            add(n);
        });
        tally(cur, n => { curMesh++; curTri += n; });
        tally(pil, n => { pilMesh++; pilTri += n; });

        const row = (label, mk) => {
            const a = shot(mk, 0.55), b = shot(mk, Math.PI / 2);
            return `<div style="margin:4px;background:#20242b;border-radius:10px;padding:6px">
                <div style="display:flex"><img src="${a}" style="width:${CELL}px;height:${CELL}px"><img src="${b}" style="width:${CELL}px;height:${CELL}px"></div>
                <div style="font:14px sans-serif;color:#9fb0c0;text-align:center;padding-top:2px">${label}</div></div>`;
        };
        const cells = row('A', () => Scene3D.makeMountMesh('Turtle', 'epic'))
            + row('B', () => Scene3D.makeMountVoxelPilot('Turtle', 'epic'));
        // 🚨 **DOM 교체를 같은 evaluate 안에서 하지 말 것 — 여기서 콘솔 에러 1건이 났다.**
        //    실측으로 범인을 좁혔다: A·B 렌더 자체도, DOM 교체 자체도 각각으로는 **0건**이다
        //    (`errprobe` 3판). 이 evaluate 가 렌더 두 판을 **한 번도 안 쉬고** 도는 동안 게임
        //    타이머·rAF 가 밀려 쌓이고, 교체 **직후** 그것들이 사라진 노드를 잡아 터진다.
        //    → 루프를 먼저 끊고 **한 프레임 쉰 뒤**(호출부의 waitForTimeout) 다른 evaluate 에서
        //      교체한다. 타이머만 끊는 걸로는 부족했다(rAF 는 안 끊긴다).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
        window.requestAnimationFrame = () => 0;
        return { cells, curMesh, pilMesh, curTri: Math.round(curTri), pilTri: Math.round(pilTri), CELL };
    });
    await page.waitForTimeout(400);      // 밀린 rAF·타이머가 다 빠져나간 뒤에 DOM 을 갈아엎는다
    await page.evaluate(({ cells, CELL }) => {
        document.body.innerHTML = `<div id="sheet" style="background:#11141a;padding:6px;width:${CELL * 2 + 26}px">${cells}</div>`;
    }, info);

    await page.locator('#sheet').screenshot({ path: path.join(__dirname, 'mount-voxel-pilot.png') });
    await browser.close();
    // ⚠️ 라벨은 **A/B 뿐**이다 — "현행/큐브"라고 적어 주면 채점자가 조형이 아니라 방향에 대한
    //    자기 의견을 답하게 된다(이름 가린 판이 필요했던 것과 같은 이유). 어느 쪽이 큐브인지는
    //    이 stdout 에만 남긴다.
    console.log('→ tools/mount-voxel-pilot.png · 거북 2판(A/B) · 콘솔 에러 ' + errors.length + '건');
    console.log(`  정답표(채점자에게 주지 말 것): A = 현행(구·원통) · B = 큐브 시험판`);
    console.log(`  파츠/삼각형: 현행 ${info.curMesh}메시 ${info.curTri}삼각형 · 시험판 ${info.pilMesh}메시 ${info.pilTri}삼각형`);
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 240)));
})();
