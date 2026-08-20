// 동공 블룸 세척 게이트 — 흰자 순백의 블룸이 자기 안의 동공을 회색으로 씻는가 (slug: eye-bloom-wash)
//
// 왜 이 자가 필요한가:
//   흰자는 `toneMapped:false` 순백이라 브라이트패스 임계(sRGB 0.9)를 **정의상 항상** 넘긴다.
//   그 자체는 의도된 것이지만(`probe-eye-contrast` 가 지키는 ΔL 이 거기서 나온다), 번진 빛이
//   **자기 안에 있는 동공을 덮어** 잉크 검정을 중간 회색으로 씻었다. 실측 +39.1(L 66.5 → 105.6).
//   ⚠️ **흰자를 어둡게 눌러 막는 길은 막혀 있다** — 피부가 ACES 압축 뒤에도 214 까지 올라와서,
//   흰자를 임계(229.5) 아래로 내리면 `probe-eye-contrast` ΔL(게이트 30)이 통째로 무너진다.
//   그래서 처치는 **밝기가 아니라 소속**이다: `ProChar.noBloom()` 이 알파 0 태그를 쓰고
//   `Scene3D.initPost` 브라이트패스가 그 화소를 뺀다. 이 자는 그 태그가 살아 있는지를 지킨다.
//
// 재는 법 — 같은 화소 집합을 두 번 읽는다(키 컬러 마스킹, 눈대중 좌표 없음):
//   ⓐ 동공만 마젠타로 칠한 렌더 = 동공 마스크(경계 AA 가 흰자를 먹으므로 **4이웃 침식**)
//   ⓑ 평상 렌더(블룸 ON) · ⓒ `postOn=false` 렌더(블룸 OFF)
//   세척량 = 같은 마스크에서 ⓑ 평균 L − ⓒ 평균 L. 블룸이 동공에 안 닿으면 0 이다.
//   🚨 마스크는 **동공 메시만** 칠한다 — 잉크 재질은 입술과 공유될 수 있어 칠하기 전에 복제한다.
//
// 자기검증(음성 대조): 흰자 재질의 `onBeforeCompile` 을 걷어내 태그를 없애고 다시 잰다.
//   그때 세척량이 크게 살아나야 이 자가 결함을 실제로 볼 수 있다는 증거다(안 살아나면 종료코드 2).
//
// 사용: node probe-eye-bloom-wash.js
// 게이트: 세척량 ≤ 6 (블룸이 동공에 실질적으로 안 닿는다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const GATE_WASH = 6;

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


    // 눈 구성 찾기: pieEye = 흰자. 같은 부모(눈 그룹)의 형제 중 어두운 것이 동공.
    const found = await page.evaluate(() => {
        window.__pie = []; window.__pup = [];
        Scene3D.heroG.traverse(o => { if (o.userData && o.userData.pieEye && o.material) window.__pie.push(o); });
        for (const s of window.__pie) {
            const par = s.parent; if (!par) continue;
            for (const ch of par.children) {
                if (ch === s || !ch.material || !ch.material.color) continue;
                const c = ch.material.color;
                if (0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 0.35) window.__pup.push(ch);
            }
        }
        // 잉크 재질은 입술 등과 공유될 수 있다 — 이 메시만 칠하려면 복제가 먼저다.
        window.__pup.forEach(o => { o.material = o.material.clone(); o.userData._c0 = o.material.color.getHex(); o.userData._t0 = o.material.toneMapped; });
        return { pie: window.__pie.length, pup: window.__pup.length };
    });
    if (!found.pie) { console.log('❌ 흰자 메시(userData.pieEye)를 못 찾았다 — 자가 대상을 놓쳤다'); await browser.close(); process.exit(2); }
    if (!found.pup) { console.log('❌ 동공 메시를 못 찾았다 — 자가 대상을 놓쳤다'); await browser.close(); process.exit(2); }

    const paintPup = (hex) => page.evaluate((hex) => {
        window.__pup.forEach(o => { o.material.color.setHex(hex); o.material.toneMapped = false; o.material.needsUpdate = true; });
    }, hex);
    const restorePup = () => page.evaluate(() => {
        window.__pup.forEach(o => { o.material.color.setHex(o.userData._c0); o.material.toneMapped = o.userData._t0; o.material.needsUpdate = true; });
    });
    const setPost = (v) => page.evaluate((v) => { Scene3D.postOn = v; }, v);

    const analyse = (m, on, off) => page.evaluate(async ({ m, on, off }) => {
        const load = async (b64) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            return { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
        };
        const M = await load(m), ON = await load(on), OFF = await load(off);
        if (M.w !== ON.w || M.w !== OFF.w || M.h !== ON.h || M.h !== OFF.h) return { err: 'clip 크기 불일치' };
        const W = M.w, H = M.h;
        const L = (X, i) => 0.299 * X.d[i] + 0.587 * X.d[i + 1] + 0.114 * X.d[i + 2];
        const raw = [];
        for (let p = 0; p < W * H; p++) {
            const i = p * 4;
            if (M.d[i] > 150 && M.d[i + 2] > 150 && M.d[i + 1] < 110) raw.push(p);
        }
        if (raw.length < 40) return { err: `동공 마스크가 ${raw.length}px 뿐 — 프레이밍이 얼굴을 못 잡았거나 동공이 가려졌다` };
        // 침식 — 동공 경계의 AA 는 흰자를 섞어 들이므로 4이웃이 전부 마스크인 화소만 남긴다.
        const inM = new Uint8Array(W * H); raw.forEach(p => inM[p] = 1);
        const core = raw.filter(p => {
            const x = p % W, y = (p / W) | 0;
            return x > 0 && y > 0 && x < W - 1 && y < H - 1 && inM[p - 1] && inM[p + 1] && inM[p - W] && inM[p + W];
        });
        if (core.length < 20) return { err: `침식 뒤 표본이 ${core.length}px — 동공이 너무 작게 잡혔다` };
        let a = 0, b = 0;
        for (const p of core) { const i = p * 4; a += L(ON, i); b += L(OFF, i); }
        return { px: core.length, on: a / core.length, off: b / core.length };
    }, { m, on, off });

    const sweep = async () => {
        await paintPup(0xff00ff); await page.waitForTimeout(150);
        const m = await snap();
        await restorePup(); await page.waitForTimeout(150);
        const on = await snap();
        await setPost(false); await page.waitForTimeout(150);
        const off = await snap();
        await setPost(true); await page.waitForTimeout(150);
        return analyse(m, on, off);
    };

    // ── 본 측정 ──
    const r = await sweep();
    if (r.err) { console.log('❌ ' + r.err); await browser.close(); process.exit(2); }
    const wash = r.on - r.off;

    // ── 음성 대조: 알파 태그를 걷어내면 세척이 살아나야 한다 ──
    await page.evaluate(() => {
        window.__pie.forEach(o => {
            o.userData._obc = o.material.onBeforeCompile;
            o.material.onBeforeCompile = () => {};
            o.material.customProgramCacheKey = () => 'noBloom-DISABLED';
            o.material.needsUpdate = true;
        });
    });
    await page.waitForTimeout(200);
    const nr = await sweep();
    await page.evaluate(() => {
        window.__pie.forEach(o => {
            o.material.onBeforeCompile = o.userData._obc || (() => {});
            o.material.customProgramCacheKey = () => 'prochar-noBloom';
            o.material.needsUpdate = true;
        });
    });
    const negWash = nr.err ? null : nr.on - nr.off;

    console.log(`동공 표본 ${r.px}px (4이웃 침식)`);
    console.log(`   동공 L  블룸ON ${r.on.toFixed(1)} · 블룸OFF ${r.off.toFixed(1)}  →  세척량 +${wash.toFixed(1)}  (게이트 ≤ ${GATE_WASH})`);
    console.log(`   [음성 대조] 알파 태그를 걷으면 세척량 ${negWash === null ? '측정 실패' : '+' + negWash.toFixed(1)}`);
    if (errors.length) console.log(`   콘솔 오류 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    if (negWash === null || negWash < 15) {
        console.log('❌ 자기검증 실패 — 태그를 걷었는데도 세척이 안 살아난다. 이 자는 결함을 못 보고 있으므로');
        console.log('   위 수치를 근거로 쓰면 안 된다(태그 경로가 바뀌었거나 브라이트패스가 알파를 안 본다).');
        await browser.close(); process.exit(2);
    }
    const ok = wash <= GATE_WASH && errors.length === 0;
    console.log(ok ? '✅ PASS — 블룸이 동공에 닿지 않는다(잉크가 잉크로 남는다)'
        : `❌ FAIL — 흰자 블룸이 동공을 +${wash.toFixed(1)} 만큼 씻고 있다. 동공이 회색으로 읽힌다.`);
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
