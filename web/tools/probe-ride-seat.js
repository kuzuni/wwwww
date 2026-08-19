// 근접 앵글에서 **스커트 밑단과 안장 사이 구간이 화면에서 무엇으로 읽히는가**.
// 사용: node probe-ride-seat.js [탈것이름]      (기본 Brown Horse)
//
// 왜 필요한가: 이 자리의 살구색 덩어리를 비평가가 세 번(2026-08-17 2인, 08-18 2인) 독립적으로
//   "갑옷 밑 맨살 프리미티브 노출 / 즉시 QA 리젝"으로 읽었다. 실제 소속은 **안장 부속**인데,
//   ⑴ 소스만 보면 "안장이니 괜찮다"고 넘기게 되고 ⑵ 크롭 색만 보면 "맨살이다"라고 잘못 고치게 된다.
//   둘 다 틀린다. 판정해야 하는 것은 **화면에 렌더된 색이 같은 프레임의 살색과 구분되는가** 하나뿐이다.
//   (램버트 + ACES 라 재질 0x4e342e 같은 진갈색도 정면광 구간에서 rgb(168,139,118)까지 밝아진다.)
//
// 판정(양방향 가드):
//   ① 안장 칸이 **영웅 얼굴색과 색거리 60 이상** — 가까우면 맨살로 읽힌다.
//   ② 안장 칸 **평균 휘도 40 이상** — 살색을 피하려고 무작정 내리면 그림자 구멍이 된다.
// ⚠️ 페이지의 자체 rAF 루프가 계속 돌아 프레임마다 조명·포즈가 달라진다. 한 프레임만 재면 같은
//    코드가 PASS/FAIL 을 오간다(실측으로 확인). **여러 프레임을 재서 최악값**으로 판정한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Brown Horse';
const FRAMES = 6;
const DXS = [-0.18, -0.09, 0, 0.09, 0.18];
const DYS = [-0.02, -0.07, -0.12];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    // 셋업: 탈것을 태우고 shot-ride-pets 의 near 앵글과 같은 카메라를 세운다(camLock 훅).
    await page.evaluate((name) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const hero = Scene3D.heroG;
        Scene3D.camLock = {
            pos: new THREE.Vector3(hero.position.x, hero.position.y + 1.7, 3.4),
            look: new THREE.Vector3(hero.position.x, hero.position.y + 0.95, 0),
        };
        for (let i = 0; i < 3; i++) Scene3D.update(1 / 60);
    }, NAME);

    // 한 프레임 측정: 소속(레이캐스트) + 화면 픽셀 좌표를 뽑고, 스크린샷을 떠서 색을 읽는다.
    const measure = async () => {
        const geo = await page.evaluate(() => {
            const rig = Scene3D.heroRig, hero = Scene3D.heroG, mg = Scene3D.mountGroup;
            hero.updateWorldMatrix(true, true); mg.updateWorldMatrix(true, true);
            const cam = new THREE.Vector3(hero.position.x, hero.position.y + 1.7, 3.4);
            const pelvis = rig.bones.pelvis;
            pelvis.updateWorldMatrix(true, true);
            const pw = pelvis.getWorldPosition(new THREE.Vector3());
            const hemY = pw.y - Scene3D.heroSeatDropY();          // 스커트 밑단 = 안장 윗면
            // ⚠️ three r128 의 Raycaster 는 조상의 visible 을 안 본다 — 렌더 안 되는 레거시 메시가
            //    잡힌다(probe-ride-thigh 에서 실제로 유령 히트를 냈다). 조상까지 훑는다.
            const shown = o => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
            const seat = new Set((rig.seatParts || []).map(m => m.uuid));
            const ray = new THREE.Raycaster();
            const camObj = Scene3D.camera;
            camObj.updateMatrixWorld(true);
            const rect = Scene3D.renderer.domElement.getBoundingClientRect();
            const toPx = (v) => {
                const p = v.clone().project(camObj);
                return [Math.round(rect.left + (p.x * 0.5 + 0.5) * rect.width),
                        Math.round(rect.top + (-p.y * 0.5 + 0.5) * rect.height)];
            };
            const rows = [];
            for (const dy of [-0.02, -0.07, -0.12]) for (const dx of [-0.18, -0.09, 0, 0.09, 0.18]) {
                const target = new THREE.Vector3(pw.x + dx, hemY + dy, pw.z + 0.06);
                ray.set(cam, target.clone().sub(cam).normalize());
                const hit = ray.intersectObjects([hero, mg], true).filter(h => shown(h.object))[0];
                let who = '(빈 배경)', col = '-';
                // ⚠️ 표적점은 표면 **뒤쪽**에 있다 — 그걸 그대로 투영하면 픽셀이 실루엣 가장자리로 밀려
                //    5×5 평균에 배경이 섞인다(바깥 칸이 rgb(151,146,118) 처럼 회백으로 뜨던 원인).
                //    실제로 보이는 표면인 **레이 히트점**을 투영해야 그 재질의 색이 잡힌다.
                const pxAt = hit ? hit.point : target;
                if (hit) {
                    who = 'other';
                    for (let o = hit.object; o; o = o.parent) {
                        if (seat.has(o.uuid)) { who = 'skirt'; break; }
                        if (o === mg) { who = 'mount'; break; }
                        if (o === hero) { who = 'hero'; break; }
                    }
                    const m = hit.object.material;
                    col = m && m.color ? m.color.getHexString() : '-';
                }
                rows.push({ dx, dy, who, col, px: toPx(pxAt) });
            }
            // 살색 기준점 — 머리 중심에서 z 를 더한 자리를 그냥 투영했더니 **지오메트리 안쪽이나 가려진
            // 자리**가 잡혀 프레임 절반이 암부 rgb(8,14,14) 로 나왔다(비행형에서 6프레임 중 5프레임 무효).
            // 카메라에서 머리로 레이를 쏘아 **실제로 화면에 보이는 첫 표면**을 기준으로 삼는다.
            const headBone = rig.bones.head || rig.headMount;
            let facePx = null;
            if (headBone) {
                const hp = headBone.getWorldPosition(new THREE.Vector3());
                ray.set(cam, hp.clone().sub(cam).normalize());
                const fh = ray.intersectObjects([hero], true).filter(h => shown(h.object))[0];
                facePx = toPx(fh ? fh.point : hp);
            }
            return { rows, facePx };
        });

        const shot = await page.screenshot();
        const p2 = await browser.newPage();
        await p2.setContent('<canvas id=c></canvas>');
        const sampled = await p2.evaluate(async ([src, px, facePx]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const c = document.getElementById('c');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const data = g.getImageData(0, 0, c.width, c.height).data;
            // 한 점만 찍으면 스펙큘러 하이라이트 한 픽셀에 판정이 끌려간다 — 5×5 평균으로 읽는다.
            const at = (p) => {
                if (!p) return null;
                let r = 0, gg = 0, b = 0, n = 0;
                for (let y = p[1] - 2; y <= p[1] + 2; y++) for (let x = p[0] - 2; x <= p[0] + 2; x++) {
                    if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
                    const i = (y * c.width + x) * 4;
                    r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++;
                }
                return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null;
            };
            return { cells: px.map(at), face: at(facePx) };
        }, ['data:image/png;base64,' + shot.toString('base64'), geo.rows.map(r => r.px), geo.facePx]);
        await p2.close();
        return { rows: geo.rows, cells: sampled.cells, face: sampled.face };
    };

    const dist = (a, b) => (a && b) ? Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])) : 999;
    const lum = c => c ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : 0;

    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
        frames.push(await measure());
        await page.evaluate(() => { for (let i = 0; i < 24; i++) Scene3D.update(1 / 60); });
    }

    console.log(`[${NAME}] 스커트 밑단(=안장 윗면) 아래 구간 — 소속(레이캐스트) + 화면색, ${FRAMES}프레임 최악값 판정\n`);
    const f0 = frames[0];
    console.log('   Δy      x=-0.18   x=-0.09    x=0      x=+0.09   x=+0.18');
    for (const dy of DYS) {
        const cells = f0.rows.filter(r => r.dy === dy).map(r => `${r.who}:${r.col}`.padEnd(10));
        console.log(`  ${String(dy).padStart(5)}   ${cells.join('')}`);
    }

    // 프레임별 최악값 — 안장 칸이 살색에 가장 가까웠던 순간과, 가장 어두웠던 순간.
    let worstD = 999, worstAt = '', worstLum = 999, skipped = 0;
    for (const fr of frames) {
        const seatIdx = fr.rows.map((r, i) => r.who === 'mount' ? i : -1).filter(i => i >= 0);
        // ⚠️ **기준(얼굴)이 무효인 프레임은 살색 판정에서 뺀다.** 비행형에서 얼굴 표본이 rgb(8,14,14)로
        //    잡힌 프레임이 나왔는데(머리가 순간 프레임 밖/암부), 그러면 새까만 안장과의 색거리가 18이
        //    나와 **멀쩡한 안장이 "맨살"로 FAIL** 한다. 살색 기준은 최소한 살색만큼은 밝아야 한다.
        // ⚠️ 색거리는 **프레임 밝기에 비례해 줄어든다** — 어두운 프레임에서는 서로 다른 재질끼리도
        //    거리가 작게 나온다(비행형 어두운 프레임: 안장 rgb(89,83,57) vs 얼굴 rgb(101,103,87) = 38).
        //    그대로 재면 '어두워서 FAIL' 이 되므로 **기준(얼굴) 휘도로 정규화**해 밝은 프레임과 같은
        //    잣대로 만든다(155 = 정상 조명에서 실측된 얼굴 휘도).
        const fl = lum(fr.face);
        const norm = 155 / Math.max(60, fl);
        if (fl < 60) { skipped++; }
        else for (const i of seatIdx) {
            const d = Math.round(dist(fr.cells[i], fr.face) * norm);
            if (d < worstD) { worstD = d; worstAt = `Δy${fr.rows[i].dy} x${fr.rows[i].dx} 화면 rgb(${(fr.cells[i] || []).join(',')}) vs 얼굴 rgb(${(fr.face || []).join(',')})`; }
        }
        if (seatIdx.length) {
            const ml = Math.round(seatIdx.reduce((a, i) => a + lum(fr.cells[i]), 0) / seatIdx.length);
            // ⚠️ 휘도는 **가장 밝았던 프레임**으로 본다. 최저값으로 잡으면 영웅 몸이 안장에 그림자를
            //    드리운 순간이 걸려 멀쩡한 안장도 FAIL 이 된다(실측: 같은 코드에서 33 ↔ 67).
            //    '어둠에 묻혔다'가 결함인 것은 **어느 순간에도 안 밝아질 때**다.
            worstLum = worstLum === 999 ? ml : Math.max(worstLum, ml);
        }
    }
    const valid = FRAMES - skipped;
    console.log(`\n안장 칸 ↔ 영웅 얼굴색 **최소 색거리 ${worstD}** (하한 60) — 유효 프레임 ${valid}/${FRAMES}${skipped ? ` (얼굴 기준이 암부로 잡힌 ${skipped}프레임 제외)` : ''}`);
    console.log(`   최악 지점: ${worstAt}`);
    console.log(`안장 칸 **최고 평균 휘도 ${worstLum}** (하한 40 — 이보다 어두우면 그림자 구멍으로 읽힌다)`);
    const bad = (valid === 0 ? 1 : 0) + (worstD < 60 ? 1 : 0) + (worstLum < 40 ? 1 : 0);
    console.log(`\n판정: ${bad ? 'FAIL' : 'PASS'}`
        + (valid === 0 ? ' — 유효 프레임 0(얼굴 기준을 못 잡았다, 판정 불가)' : '')
        + (worstD < 60 ? ' — 안장이 맨살로 읽힌다' : '')
        + (worstLum < 40 ? ' — 안장이 어둠에 묻혔다' : ''));
    console.log('※ 소속이 mount 여도 화면색이 살색이면 결함이다. 반대로 소속만 보고 "안장이니 괜찮다"고 넘기지도 말 것.');
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
