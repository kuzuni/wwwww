// 머리 크기 스윕 — `hero-chibi` 🔁 "머리가 좀 더 컸으면 좋겠음"(사용자 추가 2026-08-19) 착수용.
//   headG.scale 을 여러 값으로 갈아 끼우며 두신비·턱끝·전신높이를 한 페이지 안에서 잰다.
//   ⚠️ 리그를 다시 빌드하지 않는다 — headG 는 순수 그룹이라 scale/position 만 바꾸고
//      updateWorldMatrix 로 다시 재면 된다(빌드 반복은 소프트웨어 GL 에서 몇 분씩 든다).
//
// 두 가지를 같이 본다.
//   ⑴ **두신비** = (headTop-footBot)/headH — `BODY_SCALE` 과 무관(순수 비)이라 여기서 확정할 수 있다.
//   ⑵ **턱끝 로컬 y** — 커진 머리의 턱이 고젯 칼라를 뚫는지. 칼라는 spine 소속이라 머리와 같이
//      안 움직인다. 그래서 머리를 키우면 `headG.position.y` 를 함께 올려 **턱끝을 제자리에** 둬야
//      한다(안 그러면 칼라가 턱을 삼킨다 — 6차 비평가 ㉦ 이력).
// 전신 높이는 `BODY_SCALE` 역배율이 되돌리므로 여기선 '보정 전 값'만 찍고, 필요한 배율을 계산해 준다.
//
// 사용: node probe-head-sweep.js [k1,k2,...]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const KS = (process.argv[2] || '1.00,1.15,1.20,1.25,1.30,1.35,1.40').split(',').map(Number);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.addInitScript(() => {
        let sd = 0x2f6e2b1;
        Math.random = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return ((sd >>> 0) % 1e6) / 1e6; };
    });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const rows = await page.evaluate((ks) => {
        // 포즈 스냅 — probe-hero-proportion 과 동일 규약(안 하면 런마다 다리 각도가 달라진다).
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};

        const V = THREE.Vector3;
        const boxOf = (obj, skip) => {
            const b = new THREE.Box3();
            obj.updateWorldMatrix(true, true);
            obj.traverse(o => {
                if (!o.geometry || o.visible === false) return;
                for (let p = o; p; p = p.parent) { if (skip && skip.has(p)) return; }
                b.expandByObject(o);
            });
            return b;
        };
        const skip = new Set();
        for (const k of ['weaponG', 'shield', 'cape', 'capeG']) if (R[k]) skip.add(R[k]);
        if (Scene3D.weaponG) skip.add(Scene3D.weaponG);
        if (Scene3D.heroHpG) skip.add(Scene3D.heroHpG);
        if (R.handR) for (const c of R.handR.children) if (c.type === 'Group' && c !== R.handR) skip.add(c);
        if (R.handL) for (const c of R.handL.children) if (c.type === 'Group' && c !== R.handL) skip.add(c);

        const head = R.bones.head;
        const baseY = head.position.y, baseK = head.scale.x;
        const hips = [R.bones.hipL, R.bones.hipR].filter(Boolean);

        // 칼라(고젯) 상단 — spine 소속이라 머리와 같이 안 움직인다. 턱과의 여유를 이 선으로 잰다.
        // 이름으로 못 찾으므로 '머리를 통째로 숨긴 뒤 몸통 상단'을 칼라 상단으로 본다.
        head.visible = false;
        const collarTop = boxOf(R.root, skip).max.y;
        head.visible = true;

        const measure = () => {
            R.group.updateWorldMatrix(true, true);
            const hb = boxOf(head, null);
            const legBox = new THREE.Box3();
            for (const h of hips) legBox.union(boxOf(h, skip));
            const headTop = hb.max.y, headBot = hb.min.y, footBot = legBox.min.y;
            return { headTop, headBot, footBot, total: headTop - footBot, headH: headTop - headBot };
        };

        const out = [];
        for (const k of ks) {
            // 턱끝을 제자리에 두는 보정: 턱 로컬 오프셋 b 는 배율에 비례하므로 pY += b*(baseK-k).
            // b 는 첫 측정에서 실측한다(리그 좌표계를 가정하지 않는다).
            head.scale.setScalar(baseK); head.position.y = baseY;
            const m0 = measure();
            const headOriginY = head.getWorldPosition(new V()).y;
            const bWorld = m0.headBot - headOriginY;      // 배율 baseK 에서의 턱 오프셋(월드)
            const dy = (bWorld / baseK) * (baseK - k);    // 턱 고정에 필요한 월드 보정
            const rigScale = new V(); R.group.getWorldScale(rigScale);
            head.scale.setScalar(k);
            head.position.y = baseY + dy / (rigScale.y || 1);
            const m = measure();
            out.push({
                k, heads: m.total / m.headH, chin: m.headBot, headTop: m.headTop,
                total: m.total, headH: m.headH, posY: head.position.y,
                chinGap: m.headBot - collarTop,
            });
        }
        head.scale.setScalar(baseK); head.position.y = baseY;
        return { rows: out, collarTop, base: { baseY, baseK } };
    }, KS);

    const f = (n, d) => Number(n).toFixed(d === undefined ? 3 : d);
    console.log('--- 머리 크기 스윕 (턱끝 고정 보정 포함) ---');
    console.log('칼라(머리 제외 몸통) 상단 y = ' + f(rows.collarTop) + '   기준 scale ' + rows.base.baseK + ' · position.y ' + rows.base.baseY);
    console.log('scale  두신비  머리높이  전신(보정전)  턱끝y   턱-칼라여유  headG.position.y  필요 BODY_SCALE');
    for (const r of rows.rows) {
        const need = 0.98 * 1.771 / r.total;   // 전신 1.771 을 유지하는 역배율(현재 0.98 기준)
        console.log('  ' + f(r.k, 2) + '   ' + f(r.heads, 2) + '    ' + f(r.headH) + '     ' + f(r.total)
            + '       ' + f(r.chin) + '    ' + f(r.chinGap) + '        ' + f(r.posY, 4) + '        ' + f(need, 4));
    }
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    await browser.close();
})();
