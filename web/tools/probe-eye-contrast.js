// 눈 판독 게이트 — **영웅의 흰 눈이 두상 피부보다 밝은가**를 화면 픽셀로 잰다.
//
// 왜 이 자가 필요한가 (렌더 버그 — 화풍과 무관):
//   `prochar.js` 의 흰자는 `MeshBasicMaterial({ color: 0xffffff })` 이고 바로 옆 주석이
//   "순백 — 피부보다 밝아야 눈이 형태로 읽힌다" 라고 **설계 의도를 못 박아** 두었다.
//   그런데 화면에서는 그 관계가 무너져 있었다: 흰자는 톤매핑을 타는 재질이라 ACES 가 상단을
//   압축해 255 → **234** 로 눌리는 반면, 조명을 받는 피부(Standard)는 1.0 을 넘겨 들어와
//   압축 뒤에도 **225** 까지 올라온다 → ΔL 9.1 로 눈이 두상에 묻혔다.
//   즉 **재질 색만 보면 통과인데 화면에서는 실패**하는 자리라, 코드가 아니라 픽셀로 재야 한다.
//
// ⚠️ 화풍 확정은 2026-08-20 부로 **voxel + 치비**다(TODO 머리말 화풍 블록). 이 자는 눈의 *모양*을
//   보지 않고 **흰 면과 피부의 명도 차**만 보므로 눈을 큐브로 다시 짜도 그대로 유효하다 —
//   오히려 "면당 플랫 색"이 화풍 요구가 된 만큼, 눌린 흰색은 그때 더 치명적이다.
//   (이 파일 초판은 폐기된 '1930s 파이컷' 사양으로 쓰였다. 판정 내용은 같고 문구만 갈아 끼웠다.)
//
// 재는 법 — **같은 픽셀 집합을 두 번 읽는다**(키 컬러 마스킹, 눈대중 좌표 없음):
//   ⓐ 평상 렌더 1장(A)                      — 흰자 색을 여기서 읽는다
//   ⓑ 흰자만 마젠타(톤매핑 무관)로 1장(B)   — 마젠타 픽셀 = 흰자 마스크
//   ⓒ 눈 그룹을 통째로 숨기고 1장(C)        — **같은 마스크 자리**에 드러나는 것 = 그 뒤의 두상 피부
//   흰자 L = A 의 마스크 평균 · 피부 L = C 의 **같은 마스크** 평균.
//   동공·글린트는 흰자 판 위에 얹힌 별개 메시라 B 에서 마젠타가 아니므로 마스크에서 자동 제외된다
//   (그래서 "흰자만" 의 평균이 나온다 — 이걸 안 빼면 검은 동공이 흰자 평균을 끌어내린다).
//
// 🚨 **처음엔 '마스크를 4px 팽창시킨 고리'를 피부 표본으로 썼다가 버렸다 — 자가 자기 자신을 쟀다.**
//   고리는 흰자 경계의 안티앨리어싱을 먹기 때문에, 흰자를 밝게 고치면 '피부' 평균도 같이 올라가
//   개선분이 분모에서 상쇄된다(실측: 흰자 216.6→242.3 인데 고리는 206.5→226.8 로 따라 올라와
//   ΔL 이 10.0→15.5 밖에 안 움직였다). 안쪽 2px 을 가드로 버려도 이동이 **62.1** 이나 남았다 —
//   고리라는 표본 자체가 흰자와 분리되지 않는다. 위 ⓒ 방식은 표본이 마스크로 고정돼 있고 피부 값이
//   흰자 색과 **구조적으로 무관**하므로 이 오염이 원천적으로 없다.
//
// 자기검증 2단(이 저장소에서 자가 조용히 무력화된 사고가 반복됐다 — `claim.sh` 주석 참조):
//   ⑴ 음성 대조 — 흰자를 **검정으로 칠하고** 전 경로를 다시 돈다. ΔL 이 크게 음수로 뒤집혀야 한다.
//   ⑵ 독립성 검증 — 그때 **피부 L 은 움직이면 안 된다**(표본이 흰자와 무관하다는 증거).
//      움직이면 위 수치를 근거로 쓰면 안 되므로 종료코드 2 로 떨어뜨린다.
//
// 사용: node probe-eye-contrast.js
// 게이트: 흰자 L − 피부 L ≥ 30  (흰 눈이 두상에서 형태로 떨어져 나오는 최소 대비)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const GATE_DL = 30;

// ITU-R BT.601 휘도 — 이 저장소의 다른 명암 자(`probe-rarity-contrast` 등)와 같은 식을 쓴다.
async function measure(page, shots) {
    return page.evaluate(async ({ a, b, c }) => {
        const load = async (b64) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            return { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
        };
        const A = await load(a), B = await load(b), C = await load(c);
        if (A.w !== B.w || A.h !== B.h || A.w !== C.w || A.h !== C.h) return { err: 'clip 크기 불일치' };
        const W = A.w, H = A.h;
        const L = (X, i) => 0.299 * X.d[i] + 0.587 * X.d[i + 1] + 0.114 * X.d[i + 2];

        // 마젠타 마스크 — 키 컬러는 톤매핑을 끄고 칠하므로 거의 그대로 나온다. 여유를 넉넉히 둔다.
        const mask = new Uint8Array(W * H);
        let n = 0;
        for (let p = 0; p < W * H; p++) {
            const i = p * 4;
            if (B.d[i] > 150 && B.d[i + 2] > 150 && B.d[i + 1] < 110) { mask[p] = 1; n++; }
        }
        if (n < 40) return { err: `흰자 마스크가 ${n}px 뿐 — 프레이밍이 얼굴을 못 잡았거나 흰자가 가려졌다` };

        // 같은 마스크를 A(흰자 보임)와 C(눈 숨김)에서 각각 읽는다 — 표본이 고정이라 오염될 자리가 없다.
        let sS = 0, sK = 0;
        for (let p = 0; p < W * H; p++) {
            if (!mask[p]) continue;
            const i = p * 4;
            sS += L(A, i);
            sK += L(C, i);
        }
        return { scleraPx: n, sclera: sS / n, skin: sK / n };
    }, { a: shots[0], b: shots[1], c: shots[2] });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    // 얼굴 프레이밍 — `shot-face.js` 의 규약을 그대로 따른다(투구·무기·방패를 벗기고 머리로 fit).
    await page.evaluate(() => {
        if (Scene3D.setHeroGear) Scene3D.setHeroGear({});
        if (Scene3D.setHeroWeapon) Scene3D.setHeroWeapon(null);
        if (Scene3D.helmetG) Scene3D.helmetG.visible = false;
        if (Scene3D.weaponG) Scene3D.weaponG.visible = false;
        const R = Scene3D.heroRig;
        if (R && R.shield) R.shield.visible = false;
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const an of Scene3D.anims) { try { an.fn && an.fn(1); an.onDone && an.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D.heroG.updateMatrixWorld(true);
        const head = (R && R.bones && R.bones.head) || Scene3D.heroG;
        const box = new THREE.Box3().setFromObject(head);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 1.5 + 0.12;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        Scene3D.camLock = {
            pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.08, 0)),
            look: c.clone(),
        };
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';

        // 🚨 **포즈를 핀으로 고정한다 — 안 하면 이 자는 자기 잡음에 진다.**
        //   이 측정은 흰자 자리(마스크)를 렌더 3장에 걸쳐 같은 픽셀로 쓰는데, rAF 가 대기 클립을
        //   밀면 두상이 프레임마다 미세하게 움직여 **같은 마스크가 다른 피부 자리를 가리킨다.**
        //   실측: 핀을 안 걸었을 때 '눈을 숨긴 렌더'끼리도 피부 평균이 **4.3** 어긋났다 —
        //   흰자 색과 무관해야 할 값이 움직인 것이라 독립성 검증이 그걸 잡아냈다.
        //   고정 방식은 `shot-idle-seq.js`·`shot-walk-seq.js` 와 같다(heroPlay 잠금 + 매 프레임 위상 복원).
        Scene3D.heroPlay = () => {};
        const RIG = Scene3D.heroRig;
        RIG.play('Idle');
        const ORIG = Scene3D.update.bind(Scene3D);
        Scene3D.update = (dt) => {
            RIG._t = RIG._clip.dur * 0.25;   // 위상은 아무 데나 좋다 — '항상 같기만' 하면 된다
            ORIG(0);
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        };
    });
    await page.waitForTimeout(700);

    const clip = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    const snap = async () => (await page.screenshot({ clip })).toString('base64');

    // 흰자 재질을 찾아 원상복구용으로 갈무리한다. `userData.pieEye` 는 투구 가림 판정기가 쓰는 것과 같은 태그다.
    const found = await page.evaluate(() => {
        window.__pie = [];
        Scene3D.heroG.traverse(o => { if (o.userData && o.userData.pieEye && o.material) window.__pie.push(o); });
        window.__pie.forEach(o => { o.userData._c0 = o.material.color.getHex(); o.userData._t0 = o.material.toneMapped; });
        return window.__pie.length;
    });
    if (!found) { console.log('❌ 흰자 메시(userData.pieEye)를 하나도 못 찾았다 — 자가 대상을 놓쳤다'); await browser.close(); process.exit(2); }

    const paint = (hex, tm) => page.evaluate(([hex, tm]) => {
        window.__pie.forEach(o => { o.material.color.setHex(hex); o.material.toneMapped = tm; o.material.needsUpdate = true; });
    }, [hex, tm]);
    const restore = () => page.evaluate(() => {
        window.__pie.forEach(o => { o.material.color.setHex(o.userData._c0); o.material.toneMapped = o.userData._t0; o.material.needsUpdate = true; });
    });
    // 눈 그룹(흰자·동공·글린트의 부모)을 통째로 숨긴다 — 흰자만 숨기면 동공·글린트가 마스크 자리를
    // 그대로 덮고 있어 '뒤의 피부'가 아니라 동공을 재게 된다.
    const setEyeVis = (v) => page.evaluate((v) => { window.__pie.forEach(o => { (o.parent || o).visible = v; }); }, v);

    const triple = async () => {
        const a = await snap();
        await paint(0xff00ff, false); await page.waitForTimeout(120);
        const b = await snap();
        await restore();
        await setEyeVis(false); await page.waitForTimeout(120);
        const c = await snap();
        await setEyeVis(true); await page.waitForTimeout(120);
        return [a, b, c];
    };

    // ── 본 측정 ──
    const r = await measure(page, await triple());
    if (r.err) { console.log('❌ ' + r.err); await browser.close(); process.exit(2); }
    const dL = r.sclera - r.skin;

    // ── 자기검증(음성 대조): 흰자를 검정으로 칠하면 ΔL 이 크게 음수여야 한다 ──
    await paint(0x000000, false); await page.waitForTimeout(120);
    const nr = await measure(page, await triple());
    await restore(); await page.waitForTimeout(120);
    const negDL = nr.err ? null : nr.sclera - nr.skin;

    console.log(`흰자 ${r.scleraPx}px 평균 L ${r.sclera.toFixed(1)} · 같은 자리의 두상 피부 평균 L ${r.skin.toFixed(1)}`);
    console.log(`   ΔL = ${dL >= 0 ? '+' : ''}${dL.toFixed(1)}  (게이트 ≥ +${GATE_DL})`);
    console.log(`   [음성 대조] 흰자를 검정으로 칠했을 때 ΔL = ${negDL === null ? '측정 실패' : (negDL >= 0 ? '+' : '') + negDL.toFixed(1)}`);
    if (errors.length) console.log(`   콘솔 오류 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    if (negDL === null || negDL > -60) {
        console.log('❌ 자기검증 실패 — 흰자를 검정으로 칠했는데 ΔL 이 충분히 떨어지지 않았다.');
        console.log('   이 자는 흰자 밝기를 따라가지 못하고 있으므로 위 수치를 근거로 쓰면 안 된다.');
        await browser.close(); process.exit(2);
    }
    // 독립성 검증 — 피부 표본은 '눈을 숨긴 렌더'에서 나오므로 흰자 색과 무관해야 한다.
    // 두 회차의 피부 값이 어긋나면 표본이 흰자에 오염된 것이고, 그러면 개선분이 분모에도
    // 더해져 ΔL 이 눌린다(고리 표본을 버린 이유가 정확히 이것이다 — 파일 상단 주석 참조).
    const skinDrift = Math.abs(nr.skin - r.skin);
    console.log(`   [독립성 검증] 흰자만 바꿨을 때 피부 L 이동 ${skinDrift.toFixed(1)} (≤1 이어야 표본이 흰자와 무관한 것)`);
    if (skinDrift > 1) {
        console.log('❌ 독립성 검증 실패 — 흰자를 바꿨는데 피부 평균이 따라 움직인다(표본이 흰자를 먹고 있다).');
        await browser.close(); process.exit(2);
    }
    const ok = dL >= GATE_DL && errors.length === 0;
    console.log(ok ? '✅ PASS — 흰 눈이 피부보다 밝아 형태로 읽힌다'
        : `❌ FAIL — 흰자가 피부보다 ${dL < 0 ? '어둡다' : '충분히 밝지 않다'}(ΔL ${dL.toFixed(1)}). 눈 도형은 있는데 화면에서 두상에 묻힌다.`);
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
