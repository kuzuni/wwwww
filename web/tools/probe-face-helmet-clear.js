// 파이컷 눈이 투구에 가리지 않는지 — `cute-art-direction` 얼굴 개편 회귀 게이트.
//   눈 판을 위로 올렸기(중심 y 0.072→0.095, 윗변 0.127→0.163 두상로컬) 때문에, 종전엔 이마에만 닿던
//   투구 테가 이제 눈을 덮을 수 있다.
//
// 🚨 **bbox 로는 못 잰다(1차에 그렇게 짰다가 버렸다).** ⑴ 얼굴 그룹 bbox 는 **눈썹**이 최상단이라
//    수치가 눈이 아니라 눈썹을 따라간다 — 투구가 이마·눈썹을 덮는 건 원래 정상이다. ⑵ 투구 bbox 의
//    최저점은 **볼가드**가 잡아서, 눈 앞을 하나도 안 가리는 투구가 FAIL 로 나온다. ⑶ 스타일에 따라
//    빌더가 빈 그룹을 주면 bbox 가 Infinity 라 **가림이 0 인 것처럼 PASS** 로 뭉개진다.
// → 그래서 **화면 가림률을 직접 잰다**: 흰자 재질만 키 컬러(순마젠타)로 바꿔 놓고 ⓐ 투구를 숨긴 프레임과
//    ⓑ 투구를 씌운 프레임에서 키 픽셀 수를 세어, 남은 비율이 게이트를 넘는지 본다.
//    (얼굴을 통째로 숨기는 풀커버 visor·mask·tech 는 규약상 판정 대상이 아니다 — prochar.js 참조.)
// 사용: node probe-face-helmet-clear.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 스타일별 잔존률 하한. **일률 게이트가 아니라 A/B 로 실측한 기준선에서 뽑은 값**이다 —
// 챙이 낮은 투구는 개편 전에도 눈 윗변을 덮고 있었으므로(그건 이 항목이 만든 결함이 아니다),
// 일률 80% 로 재면 멀쩡한 개편이 남의 결함으로 FAIL 난다. 괄호 안이 개편 전(구형 눈) 실측값.
const FLOOR = {
    hair:   0.44,   // 기준선 50.7% → 개편 후 56.3% (앞머리가 이마를 덮는 스타일. 오히려 좋아졌다)
    cone:   0.85,   // 기준선 96.9%. 1차 시안(눈 y=0.095·sy=1.22)에서 77.3% 로 무너졌던 대역 — 여기가 진짜 게이트다
    plume:  0.66,   // 기준선 78.2% → 개편 후 70.8%. 눈이 22% 넓어진 값이고 동공·파이 조각은 안 가린다(캡처 확인)
    crown:  0.95,   // 기준선 99.6%
    tophat: 0.90,   // 기준선 97.6%
    halo:   0.95,   // 기준선 99.5%
};
// 🚨 판정에서 빼는 두 스타일 — 둘 다 **이 항목과 무관**하고, 넣으면 자가 무효한 FAIL 이 상시로 뜬다.
//   · bubble = **판정기의 한계**. 투명 유리 돔 너머로 키 컬러가 물들어 임계값을 벗어난다(0.0%로 읽힌다).
//     캡처(`face-helm-bubble.png`)로 확인하면 눈은 하나도 안 가린다. 색 판정으로는 못 재는 케이스다.
//   · fin  = **선행 결함**. 돔이 눈높이까지 내려와 눈이 통째로 사라진다(기준선 2.7% → 개편 후 1.8%,
//     즉 개편 전부터 그랬다). 몸통이 `makeHelmet` 이라 썸네일과 공용 = `equip-era-theming` 소관이라
//     TODO 의 QA 버그로만 등재했다(slug: helmet-fin-covers-eyes).
const SKIP = { bubble: '투명 돔이 키 컬러를 물들여 색으로는 못 잰다(캡처로 가림 없음 확인)', fin: '선행 결함 — 기준선에서도 2.7%(slug: helmet-fin-covers-eyes)' };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    // 씬을 정지시키고 머리 정면으로 카메라를 못 박는다 (TODO 함정 ③ — 밀린 연출 백로그를 먼저 배수)
    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        if (Scene3D.weaponG) Scene3D.weaponG.visible = false;
        Scene3D.heroG.updateMatrixWorld(true);
        const head = Scene3D.heroRig.bones.head;
        const box = new THREE.Box3().setFromObject(head);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(...box.getSize(new THREE.Vector3()).toArray());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(r * 1.4 + 0.12)), look: c.clone() };
        // 흰자를 키 컬러로 — 배경·피부·금속 어디에도 없는 순마젠타
        window.__eyeMats = [];
        Scene3D.heroRig.faceMesh.traverse(o => {
            // 신형은 `userData.pieEye` 태그로, **구형(A/B 기준선)은 흰자 재질 시그니처**로 집는다 —
            // 기준선 코드에는 태그가 없으므로 이게 없으면 A/B 자체가 불가능하다.
            const legacy = o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
                && o.material && o.material.isMeshBasicMaterial && o.material.color.getHex() === 0xf7f4ee;
            if (((o.userData && o.userData.pieEye) || legacy) && o.material) {
                window.__eyeMats.push([o.material, o.material.color.getHex()]);
                o.material.color.setHex(0xff00ff);
            }
        });
        return window.__eyeMats.length;
    });
    await page.waitForTimeout(500);

    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    // ⚠️ 이 환경엔 pngjs 가 없다 — 스크린샷을 base64 로 페이지에 넣고 **캔버스로 디코드**해 읽는다
    //    (다른 폴리싱 프로브들이 쓰는 것과 같은 경로).
    const keyPixels = async () => {
        const b64 = (await page.screenshot({ clip: rect, timeout: 60000 })).toString('base64');
        return page.evaluate(async (b64) => {
            const im = new Image();
            await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, im.width, im.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i] > 170 && d[i + 2] > 170 && d[i + 1] < 90) n++;   // 마젠타 키 (조명이 얹혀도 R·B 만 높다)
            }
            return n;
        }, b64);
    };

    // 기준 = 투구 없음
    await page.evaluate(() => { Scene3D.helmetG.visible = false; });
    await page.waitForTimeout(200);
    const base = await keyPixels();

    // 얼굴이 보이는 투구 스타일 전부 (gamedata.js HELMET_STYLES 에서 풀커버 visor·mask·tech 를 뺀 것).
    // ⚠️ 'plate'·'hide' 등은 **갑옷** 스타일이라 makeHelmet 이 빈 그룹을 준다 — 넣지 말 것.
    const STYLES = ['hair', 'cone', 'plume', 'fin', 'crown', 'tophat', 'bubble', 'halo'];
    let fail = 0, pass = 0;
    console.log(`기준(투구 없음) 흰자 키 픽셀 = ${base}`);
    if (base < 200) { console.log('FAIL  기준 흰자가 너무 적다 — 카메라/키컬러 설정이 깨졌다'); fail++; }

    for (const style of STYLES) {
        const built = await page.evaluate((style) => {
            const slot = Scene3D.helmetG;
            while (slot.children.length) slot.remove(slot.children[0]);
            let m = null;
            try { m = Scene3D.makeHelmet(0, 'common', style, style); } catch (e) { return { err: String(e) }; }
            if (!m) return { empty: true };
            slot.add(m); slot.visible = true;
            Scene3D.heroG.updateMatrixWorld(true);
            let meshes = 0; m.traverse(o => { if (o.isMesh) meshes++; });
            return { meshes };
        }, style);
        if (built.err) { console.log(`FAIL  ${style} — 투구 빌드 예외: ${built.err}`); fail++; continue; }
        if (built.empty || !built.meshes) { console.log(`FAIL  ${style} — 투구 모델이 비어 있다(메시 0)`); fail++; continue; }
        await page.waitForTimeout(150);
        const n = await keyPixels();
        const keep = base ? n / base : 0;
        if (SKIP[style]) { console.log(`skip  ${style} — 잔존 ${(keep * 100).toFixed(1)}% · ${SKIP[style]}`); continue; }
        const floor = FLOOR[style];
        if (floor === undefined) { console.log(`FAIL  ${style} — FLOOR 표에 없는 스타일(표를 갱신할 것)`); fail++; continue; }
        const ok = keep >= floor;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${style} — 흰자 잔존 ${(keep * 100).toFixed(1)}% (${n}/${base}, 메시 ${built.meshes}개, 하한 ≥${(floor * 100).toFixed(0)}%)`);
        ok ? pass++ : fail++;
    }

    console.log(errors.length ? `FAIL  콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}` : 'PASS  콘솔 에러 0건');
    if (errors.length) fail++; else pass++;
    console.log(`\n합계: ${pass} PASS / ${fail} FAIL`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
