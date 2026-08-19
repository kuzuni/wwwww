// 스쿼시&스트레치 실측 — `cute-art-direction` 1930s 모션 언어 게이트.
//   ⚠️ `probe-hero-proportion` 은 **한 프레임**만 재므로 대기 사이클의 **정점**을 못 본다(그 프로브가
//      PASS 라고 해서 크기 불변 계약이 지켜진 게 아니다). 여기서 사이클 전체를 손으로 흘려
//      ⓐ 실제로 눌리고 늘어나는가(진폭이 0 이 아닌가) ⓑ 그 정점이 크기 불변 대역을 안 깨는가
//      ⓒ 발이 지면을 뚫거나 뜨지 않는가를 함께 본다.
//   ⚠️ 헤드리스에서는 rAF 가 사실상 안 도므로 `heroRig.update` 를 직접 스텝한다(TODO 함정 ③).
// 사용: node probe-hero-squash.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// ③ 은 **절대 높이가 아니라 사이클 안 변동폭**으로 잰다. `probe-hero-proportion` 의 1.785 는 그 프로브가
// 머리 박스를 별도로(투구 포함, skip 없이) 잡아 headTop−footBot 을 쓰는 값이라 여기 AABB 와 자가 다르고,
// 억지로 맞추면 자만 복잡해진다. 이 게이트가 지키려는 것은 '캐릭터가 눈에 띄게 자라지 않는가'이므로
// **한 사이클 안 최대/최소 차이**를 같은 ±3% 대역으로 재는 쪽이 곧바로 그 뜻이다.
const H_TOL = 0.03;
const GROUND_Y = -0.053, G_TOL = 0.035; // 접지: 대기 중 발이 이 대역을 벗어나면 안 된다
const MIN_AMP = 0.015;                  // 스쿼시 진폭 하한 — 이 아래면 '과장'이 아니다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        const R = Scene3D.heroRig;
        R.play('Idle');
        const skip = new Set();
        for (const k of ['weaponG', 'shield', 'cape', 'capeG']) if (R[k]) skip.add(R[k]);
        if (Scene3D.weaponG) skip.add(Scene3D.weaponG);
        if (Scene3D.heroHpG) skip.add(Scene3D.heroHpG);
        const out = { h: [], foot: [], spineSy: [], headSy: [], headBase: R.base.head.sy, spineBase: R.base.spine.sy };
        const dur = R._clip.dur, N = 60;
        for (let i = 0; i <= N; i++) {
            R._t = dur * i / N;                     // 사이클을 균등 표본으로 훑는다
            R.update(0);                            // dt=0 — _t 를 그대로 두고 포즈만 먹인다
            Scene3D.heroG.updateMatrixWorld(true);
            // ⚠️ `probe-hero-proportion` 과 **같은 자로** 재야 그 게이트와 비교가 성립한다 —
            //    무기·방패·망토·HP바를 빼고 월드 AABB 로 잰다(손에 든 검이 머리 위로 솟아 20% 부푼다).
            const box = new THREE.Box3();
            R.root.traverse(o => {
                if (!o.geometry || o.visible === false) return;
                for (let p = o; p; p = p.parent) if (skip.has(p)) return;
                box.expandByObject(o);
            });
            out.h.push(box.max.y - box.min.y);
            out.foot.push(box.min.y);
            out.spineSy.push(R.bones.spine.scale.y);
            out.headSy.push(R.bones.head.scale.y);
        }
        return out;
    });

    const mm = (a) => ({ min: Math.min(...a), max: Math.max(...a) });
    const h = mm(r.h), foot = mm(r.foot), ss = mm(r.spineSy), hs = mm(r.headSy);
    // 배율은 **베이스 대비**로 읽는다 — 머리는 빌드 때 1.30 이 걸려 있어 절대값으로 1 과 비교하면 늘 참이다.
    const spineAmp = (ss.max - ss.min) / r.spineBase, headAmp = (hs.max - hs.min) / r.headBase;
    const headSquashes = hs.min < r.headBase - 1e-4;
    const hMean = r.h.reduce((a, b) => a + b, 0) / r.h.length;
    const hSwing = (h.max - h.min) / hMean;
    const hOk = hSwing <= H_TOL;
    const fOk = foot.max <= GROUND_Y + G_TOL && foot.min >= GROUND_Y - G_TOL;
    const aOk = spineAmp >= MIN_AMP;

    console.log(`척추 세로배율   ${ss.min.toFixed(4)} ~ ${ss.max.toFixed(4)}  (진폭 ${(spineAmp * 100).toFixed(2)}%, 하한 ≥${MIN_AMP * 100}%)`);
    console.log(`머리 세로배율   ${hs.min.toFixed(4)} ~ ${hs.max.toFixed(4)}  (진폭 ${(headAmp * 100).toFixed(2)}% — 척추와 반대로 눌려야 한다)`);
    console.log(`전신 높이       ${h.min.toFixed(4)} ~ ${h.max.toFixed(4)}  (평균 ${hMean.toFixed(4)} · 사이클 변동폭 ${(hSwing * 100).toFixed(2)}%, 상한 ≤${H_TOL * 100}%)`);
    console.log(`발바닥 y        ${foot.min.toFixed(4)} ~ ${foot.max.toFixed(4)}  (기준 ${GROUND_Y} ±${G_TOL})`);
    console.log(`${aOk ? 'PASS' : 'FAIL'}  ① 스쿼시가 실제로 걸린다`);
    console.log(`${headSquashes ? 'PASS' : 'FAIL'}  ② 머리가 반대로 눌린다(카툰 대비) — 베이스 ${r.headBase.toFixed(3)}`);
    console.log(`${hOk ? 'PASS' : 'FAIL'}  ③ 사이클 변동폭이 크기 불변 대역 안 (캐릭터가 눈에 띄게 자라지 않는다)`);
    console.log(`${fOk ? 'PASS' : 'FAIL'}  ④ 발이 지면을 뚫거나 뜨지 않는다`);
    console.log(errors.length ? `FAIL  콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}` : 'PASS  콘솔 에러 0건');
    const fail = [aOk, headSquashes, hOk, fOk, !errors.length].filter(v => !v).length;
    console.log(`\n판정: ${fail ? 'FAIL' : 'PASS'} (${5 - fail}/5)`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
