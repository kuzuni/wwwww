// 펫 25종 눈 가림 판정기 (`pet-species-recognizable`).
//
// 왜 필요한가: 펫 `eyes()` 를 파이컷 흰자로 올렸지만, **눈이 실제로 보이는지는 호출부 좌표가 정한다.**
// 이 파일의 구조적 함정이 정확히 거기 있다 — 얼굴 부속 z 를 감으로 적으면 두상 구체 **안에** 파묻힌다
// (실측 전례: 호랑이 줄무늬 3장이 통째로 몸 속, 판다 눈 반점이 두상 앞면에 미달, 검치호 송곳니가 두상 속).
// 눈은 파묻혀도 **에러가 안 나고 캡처에서만 조용히 사라져서**, 25종을 눈으로 훑지 않으면 못 잡는다.
//
// 🚨 **색 임계로 재지 말 것 (1판 폐기 — 실측으로 무효 확인).** '밝고 저채도 = 흰자' 로 세면 종 색 25가지가
//    그대로 섞여 들어온다: 흰 몸(일렉트리 흰자 72%·유령 호랑이 28%)은 **몸통이 흰자로 잡히고**, 어두운
//    몸(거미·케르베로스)은 흰자가 음영에 눌려 0% 로 나온다. 지표가 눈이 아니라 **몸 면적**에 딸려 움직였다.
//    → 대신 **가림 자체를 직접 잰다**: 카메라에서 동공으로 광선을 쏴 첫 교차가 그 눈이면 보이는 것이다.
//       `eyes()` 가 흰자에 붙인 `userData.pieEye` 태그가 대상을 집는 손잡이다(영웅·적과 같은 규약).
//
// 게임 앵글(요각 0.55)에서는 먼 쪽 눈이 두상에 가려지는 게 정상이라, **한 쪽이라도 보이면 통과**로 본다.
//
// 사용: node probe-pet-eyes.js   → PASS/FAIL + 종별 보이는 눈 개수
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.petThumb && typeof PET_KR !== "undefined"');

    const rows = await page.evaluate(() => {
        const names = Object.keys(PET_KR);
        Scene3D.petThumb('Cat', 0);
        Scene3D._creatureR.setSize(260, 260);
        const out = [];
        for (const nm of names) {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
            const g = new THREE.Group();
            g.rotation.y = 0.55;                       // 게임에서 실제로 보이는 3/4 각
            g.add(Scene3D.makePetMesh(nm));
            sc.add(g);
            const cam = Scene3D._creatureCam;
            Scene3D.thumbFrameToFit(cam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            g.updateMatrixWorld(true);
            // 눈 그룹 수집 — 흰자(pieEye)의 조부모가 `eyes()` 가 만든 눈 그룹이다
            const eyeGroups = [];
            g.traverse(o => { if (o.userData && o.userData.pieEye && o.parent && o.parent.parent) eyeGroups.push(o.parent.parent); });
            const rc = new THREE.Raycaster();
            let vis = 0;
            for (const eg of eyeGroups) {
                const target = new THREE.Vector3();
                eg.getWorldPosition(target);
                const dir = target.clone().sub(cam.position).normalize();
                rc.set(cam.position, dir);
                const hits = rc.intersectObject(g, true).filter(h => h.object.visible);
                if (!hits.length) continue;
                // 첫 교차가 이 눈 그룹에 속하면(흰자/동공/하이라이트) 그 눈은 화면에 나온다
                let n = hits[0].object, own = false;
                while (n) { if (n === eg) { own = true; break; } n = n.parent; }
                if (own) vis++;
            }
            out.push({ name: nm, eyes: eyeGroups.length, vis });
        }
        return out;
    });

    // 눈을 애초에 안 만드는 종(달팽이는 자루 끝의 검은 구슬이 눈이다)은 이 계약의 대상이 아니다
    const withEyes = rows.filter(r => r.eyes > 0);
    const bad = withEyes.filter(r => r.vis === 0);
    console.log(`--- 펫 눈 가림 ${rows.length}종 (게임 앵글 0.55 · 한 쪽이라도 보이면 통과) ---`);
    for (const r of rows) {
        const ok = r.eyes === 0 || r.vis > 0;
        console.log(`  ${ok ? ' ' : '!'} ${r.name.padEnd(15)} 눈 ${r.eyes}개 중 ${r.vis}개 보임` + (r.eyes === 0 ? '  (eyes() 미사용 — 대상 아님)' : ''));
    }
    console.log('');
    console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  ① eyes() 를 쓰는 ${withEyes.length}종 전부 눈이 안 가린다`
        + (bad.length ? ` — ${bad.map(b => b.name).join(', ')}` : ''));
    console.log(`${errors.length === 0 ? 'PASS' : 'FAIL'}  ② 콘솔 에러 0건` + (errors.length ? ` — ${errors[0].slice(0, 160)}` : ''));
    await browser.close();
    process.exit(bad.length === 0 && errors.length === 0 ? 0 : 1);
})();
