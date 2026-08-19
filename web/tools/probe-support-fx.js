// 지원계 6종 개별 시그니처 판정기 — skill-unique-signature
//
// 지원계(회복 3 + 버프 3)는 여태 `heal` / `aura` **둘**로만 갈려 3종씩 한 그림이었다.
// 이 프로브가 묻는 것은 "예쁜가"가 아니라 **여섯이 실제로 서로 다른 그림인가**다.
//
// 게이트
//  A. fx 키가 6종 전부 다르다 + 전용 함수가 존재한다
//  B. 🚨 **combat.js 가 그 키를 실제로 넘긴다** — 여기가 이 항목의 진짜 몸통이었다.
//     `tryCast` 이 리터럴 'heal'/'aura' 를 넘기고 있어서 지원계의 fx 필드는 죽은 값이었다
//     (성역은 fx:'aura' 인데 type:'heal' 이라 화면에 빛기둥이 떴다). 스파이로 실제 인자를 잡는다.
//  C. 시전 1박이 6종 모두 **지원계 문법**으로 돈다 — 모트가 낮은 데서 가슴으로 올라온다
//     (skillCastBeat 의 support 분기). 공격계 A/B 로 자의 유효성을 같이 본다.
//  D. 여섯이 서로 다른 그림이다 — 각 연출이 만드는 씬 델타(메시 수·최대 반경·높이 대역)를
//     지문으로 삼아 **모든 쌍이 구분되는지** 본다. 같은 함수를 부르면 지문이 같아진다.
//  E. 정리 — 6종 전부 연출 종료 후 씬 자식·지오메트리가 기준선 복귀, 라이트 반납·상수 7
//  F. 콘솔 에러 0
//
// ⏱️ **한 번 도는 데 ~7분 걸린다**(swiftshader 페이지 부팅이 대부분). 멈춘 게 아니니
//    타임아웃을 200초 같은 걸로 걸어 죽이지 말 것 — 그러면 '간헐 FAIL' 로 오해하게 된다.
// 사용: node probe-support-fx.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 지원계 6종 — [스킬 id, 기대 fx 키, 기대 전용 함수]
const SUPPORT = [
    ['firstAid', 'firstaid', 'firstAidWrap'],
    ['blessing', 'heal', 'healPillar'],
    ['divineShield', 'wardshield', 'wardShieldDome'],
    ['warCry', 'warcry', 'warCryShout'],
    ['sanctuary', 'aura', 'auraCircle'],
    ['timeWarp', 'timewarp', 'timeWarpDial'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Scene3D !== 'undefined' && Scene3D.renderer && Scene3D.heroG, null, { timeout: 180000 });
    await page.waitForTimeout(700);

    const fail = [];
    const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail.push(msg); };

    // ---- A. fx 키 분리 ----
    console.log('A. fx 키 6종 분리');
    const keys = await page.evaluate((SUP) => SUP.map(([id, fx, fn]) => {
        const d = SKILL_DEFS.find(x => x.id === id);
        return { id, want: fx, got: d ? d.fx : null, fn, hasFn: typeof Scene3D[fn] === 'function' };
    }), SUPPORT);
    for (const k of keys) {
        ok(k.got === k.want, `${k.id} fx = ${k.want} (실제 ${k.got})`);
        ok(k.hasFn, `Scene3D.${k.fn} 존재`);
    }
    const uniq = new Set(keys.map(k => k.got));
    ok(uniq.size === 6, `지원계 6종의 fx 가 전부 다르다 (고유 ${uniq.size}/6)`);

    // ---- B. combat.js 가 그 키를 실제로 넘기는가 ----
    console.log('B. combat.js 가 fx 키를 실제로 넘기는가 (이 항목의 진짜 몸통)');
    const passed = await page.evaluate((SUP) => {
        const seen = {};
        const orig = Scene3D.skillEffect;
        Scene3D.skillEffect = (fx, ...rest) => { seen[window.__castId] = fx; };  // 스파이 — 연출은 안 태운다
        const origCutin = UI.skillCutin; UI.skillCutin = () => {};
        for (const [id] of SUP) {
            window.__castId = id;
            Combat.cooldowns[id] = 0;
            try { Combat.tryCast(id, true); } catch (e) { seen[id] = 'THREW:' + e.message; }
        }
        Scene3D.skillEffect = orig; UI.skillCutin = origCutin;
        return seen;
    }, SUPPORT);
    for (const k of keys) {
        ok(passed[k.id] === k.want, `tryCast('${k.id}') → skillEffect('${passed[k.id]}') (기대 '${k.want}')`);
    }

    // ---- C. 시전 1박이 지원계 문법으로 도는가 ----
    // 🚨 자를 한 번 고쳤다 — 처음엔 '시전 링이 위로 감긴다'로 물었는데 **링은 y 가 안 움직인다**
    //    (scale·rotation·opacity 만 탄다). `support` 분기가 실제로 가르는 건 **모트의 출발 높이**다:
    //    지원계는 낮은 데서(0.0~0.5) 가슴으로 **올라오고**, 공격계는 높은 데서(0.5~1.8) 내려온다.
    //    코드를 안 보고 지은 가정으로 물으면 멀쩡한 코드가 FAIL 난다(TODO 함정 ④와 같은 뿌리).
    console.log('C. 시전 1박 support 분기 (모트 출발 높이)');
    const beats = await page.evaluate((SUP) => {
        const out = {};
        const measure = (fx) => {
            const before = Scene3D.scene.children.length;
            Scene3D.skillCastBeat(new THREE.Color(0xffffff), fx, 3);
            // ⚠️ 그룹 생성 여부는 **여기서** 재야 한다 — 아래 40스텝을 흘린 뒤에 재면 그 사이
            //    연출이 끝나 그룹이 배수돼서 '안 세웠다'로 나온다(첫 실측에서 6종 전부 FAIL).
            const hadGroup = Scene3D.scene.children.length > before;
            const g = Scene3D.scene.children[Scene3D.scene.children.length - 1];
            const hero = Scene3D.heroG.position;
            const ys = [];
            if (g && g.children) for (const c of g.children) {
                if (c.userData && c.userData.from) ys.push(c.userData.from.y - hero.y);
            }
            for (let f = 0; f < 40; f++) Scene3D.update(1 / 60);   // 이 박자를 끝까지 배수
            return { hadGroup, n: ys.length,
                     meanY: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null };
        };
        for (const [id, fx] of SUP) out[id] = measure(fx);
        out.__attack = measure('slash');       // A/B — 공격계는 반대여야 자가 유효하다
        return out;
    }, SUPPORT);
    for (const [id] of SUPPORT) {
        const b = beats[id];
        ok(b && b.hadGroup, `${id} 시전 1박이 그룹을 세운다`);
        ok(b && b.n > 0, `${id} 시전 모트 ${b ? b.n : 0}개`);
        ok(b && b.meanY !== null && b.meanY < 0.55,
            `${id} 모트가 **낮은 데서** 올라온다 (평균 y ${b && b.meanY !== null ? b.meanY.toFixed(2) : 'n/a'} < 0.55 = 지원계 문법)`);
    }
    console.log(`     A/B 공격계(slash) 모트 평균 y = ${beats.__attack.meanY !== null ? beats.__attack.meanY.toFixed(2) : 'n/a'}`);
    ok(beats.__attack.meanY > 0.55, `A/B: 공격계는 **높은 데서** 내려온다 (평균 y ${beats.__attack.meanY !== null ? beats.__attack.meanY.toFixed(2) : 'n/a'} > 0.55) — 자가 유효함`);

    // ---- D/E. 여섯이 서로 다른 그림인가 + 정리 ----
    console.log('D. 여섯 연출의 지문이 서로 다른가');
    const prints = await page.evaluate((SUP) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        // ⚠️ 페이로드(2·3박)는 setTimeout 뒤에 온다 — 헤드리스에서 수동 스텝만 밀면 **영영 안 온다**.
        //    즉시 실행으로 바꿔 같은 동기 블록에서 태운다(TODO 함정 ④⑴). 이걸 빼면 6종 전부
        //    '연출 그룹이 안 생겼다'로 나온다(첫 실측이 그랬다).
        window.setTimeout = (fn, ms, ...a) => { try { typeof fn === 'function' && fn(...a); } catch (e) { console.error('immediate-timeout', e); } return 0; };
        Scene3D.anims.length = 0;
        for (let f = 0; f < 90; f++) Scene3D.update(1 / 60);      // 잔여 연출 배수
        const base = { ch: Scene3D.scene.children.length, geo: 0, busy: 0 };
        Scene3D.scene.traverse(o => { if (o.isMesh) base.geo++; if (o.isPointLight && o.userData.busy) base.busy++; });
        const out = [];
        for (const [id, fx] of SUP) {
            const def = SKILL_DEFS.find(x => x.id === id);
            Scene3D.skillEffect(fx, def.color, [], def);
            for (let f = 0; f < 8; f++) Scene3D.update(1 / 60);   // 연출이 자리를 잡는 지점
            // 이번 연출이 만든 그룹만 골라 지문을 뽑는다(씬 최상위 차분)
            const g = Scene3D.scene.children.slice(base.ch).find(o => o.userData && Object.keys(o.userData).some(k => /Fx$/.test(k)));
            let meshes = 0, maxR = 0, minY = 99, maxY = -99;
            const hero = Scene3D.heroG.position;
            if (g) {
                g.updateWorldMatrix(true, true);
                g.traverse(o => {
                    if (!o.isMesh) return;
                    meshes++;
                    const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
                    maxR = Math.max(maxR, Math.hypot(p.x - hero.x, p.z - hero.z));
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
            }
            out.push({ id, fx, found: !!g, meshes, maxR: +maxR.toFixed(2), minY: +minY.toFixed(2), maxY: +maxY.toFixed(2) });
            for (let f = 0; f < 120; f++) Scene3D.update(1 / 60);  // 끝까지 배수
        }
        let geo = 0; Scene3D.scene.traverse(o => { if (o.isMesh) geo++; });
        let busy = 0, total = 0;
        Scene3D.scene.traverse(o => { if (o.isPointLight) { total++; if (o.userData.busy) busy++; } });
        return { out, base, after: { ch: Scene3D.scene.children.length, geo }, lights: { busy, total } };
    }, SUPPORT);

    for (const p of prints.out) {
        console.log(`     ${p.id.padEnd(13)} fx=${p.fx.padEnd(11)} 메시${String(p.meshes).padStart(3)} 반경${String(p.maxR).padStart(5)} y[${p.minY}..${p.maxY}]`);
        ok(p.found, `${p.id} 연출 그룹이 실제로 생성됨`);
    }
    // 모든 쌍이 지문으로 구분되는가 — 같은 함수를 부르면 여기서 걸린다
    let dup = [];
    for (let i = 0; i < prints.out.length; i++) {
        for (let j = i + 1; j < prints.out.length; j++) {
            const a = prints.out[i], b = prints.out[j];
            if (a.meshes === b.meshes && Math.abs(a.maxR - b.maxR) < 0.05 && Math.abs(a.maxY - b.maxY) < 0.05) dup.push(`${a.id}↔${b.id}`);
        }
    }
    ok(dup.length === 0, `15개 쌍이 전부 다른 지문 (동일 지문: ${dup.length ? dup.join(', ') : '없음'})`);

    console.log('E. 정리');
    console.log(`     씬 자식 ${prints.base.ch}→${prints.after.ch} · 메시 ${prints.base.geo}→${prints.after.geo}`);
    ok(prints.after.ch <= prints.base.ch, `씬 자식 누수 없음 (${prints.base.ch}→${prints.after.ch})`);
    ok(prints.after.geo <= prints.base.geo, `메시 누수 없음 (${prints.base.geo}→${prints.after.geo})`);
    // 기준선 대비로 본다 — 이 프로브가 켜기 전부터 씬의 다른 연출이 하나 쥐고 있을 수 있다.
    ok(prints.lights.busy <= prints.base.busy, `fx 라이트 누수 없음 (busy ${prints.base.busy}→${prints.lights.busy})`);
    ok(prints.lights.total === 7, `포인트라이트 상수 7 (실측 ${prints.lights.total})`);

    console.log('F. 콘솔');
    ok(errs.length === 0, `콘솔 에러 0 (실측 ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''})`);

    console.log(fail.length ? `\nFAIL ${fail.length}건\n - ` + fail.join('\n - ') : '\nPASS — 전 게이트 통과');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
