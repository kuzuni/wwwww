// 스킬 연출의 '세기'를 등급별로 실측 — 사용: node probe-skill-fx-power.js
// 사용자 지시 2026-08-19 (`skill-fx-exaggerated`): "스킬 부분은 연출이 좀 대체로 약한 게 좀 문제임.
// 연출이 더 과장되고 화려해야 함."
//
// 무엇이 문제였나(이 프로브가 지키는 것): `skillImpactWeight` 에 `if (tier < 2) return` 하한이 있어
// **커먼·레어 스킬은 충격 연출을 아예 못 받았다.** 초반 플레이어가 실제로 보는 스킬 대부분이 그
// 대역이라 "연출이 대체로 약하다"의 절반이 이 한 줄이었다. 하한을 없애고 진폭을 키운 뒤,
// **하한이 다시 생기면 즉시 실패**하도록 여기서 못 박는다.
//
// 판정: ① 커먼(tier 0)에도 충격 연출이 실재한다 — 씬 객체 증가 > 0 · 셰이크 > 0 · 화면 플래시 1개
//       ② 등급 사다리가 단조 증가한다(커먼 < … < 미식) — 위계가 죽지 않았는지
//       ③ 미식이 커먼보다 뚜렷이 세다(셰이크 ≥ 2배, 씬 객체 ≥ 1.5배)
//       ④ 화면 플래시가 **z-index 13**이다 — 연출 대역(피격 12 < 스킬 13 < 씬컷 14 < 사망 15 <
//          보스 16 < 팝업 20+)을 지켜 팝업을 침범하지 않는다(`death-overlay-zorder` 규칙)
//       ⑤ 뒷정리: 연출이 끝나면 플래시 노드가 0개, 씬 그레이드(#game3d filter)가 기본값으로 복귀
//       ⑥ 콘솔 에러 0건
//
// ⚠️ 계측 함정 (TODO '비평가 채점 함정' ③④ 그대로):
//   ⑴ 헤드리스에서는 rAF 가 사실상 안 돈다 → `Scene3D.update` 를 손으로 흘린다. 기다리지 말 것.
//   ⑵ 연출은 setTimeout 으로 흩어져 있다 → 측정 구간에서만 setTimeout 을 **즉시 실행**으로 바꿔
//      진짜 코드 경로가 진짜 인자로 돌게 한다(인자를 프로브에 손으로 베끼면 코드가 바뀐 뒤에도
//      옛 값으로 재는 유령 결과가 나온다).
//   ⑶ 대상을 타입으로 찾지 말 것 → **호출 전후 씬 자식 차분**으로 이번 연출의 객체만 센다.
//   ⑷ 🚨 **즉시실행 패치는 뒷정리 타이머까지 즉시 돌린다** — 2026-08-19 실측으로 밟았다.
//      화면 플래시는 `setTimeout(remove)` 로 스스로를 지우므로, 패치 구간에서 살아 있는 DOM 을
//      읽으면 **항상 0개**로 나온다("플래시가 안 뜬다"는 유령 결과). 그래서 존재 판정은 라이브
//      DOM 이 아니라 **`fxLayer.appendChild` 훅**으로 '생성된 순간'을 잡고, 수명·그레이드 복귀는
//      패치를 걸지 않은 **2단계**에서 실시간으로 잰다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const RARITY_BY_TIER = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.scene && !!Scene3D.heroG').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }

    const rows = await page.evaluate(({ RARITY_BY_TIER }) => {
        const out = [];
        const layer = Scene3D.fxLayer;
        const cv = document.getElementById('game3d');
        for (let tier = 0; tier < 6; tier++) {
            // 앞 연출의 잔여를 완전히 비우고 시작한다(밀린 애니가 서로를 덮어쓰면 수치가 톱니로 튄다)
            Scene3D.anims.length = 0;
            Scene3D.shakeMag = 0;
            while (layer.firstChild) layer.firstChild.remove();
            cv.style.filter = '';

            const before = Scene3D.scene.children.length;
            const fov0 = Scene3D.camera.fov;
            // ⑵ 측정 구간에서만 setTimeout 즉시 실행 — 진짜 경로가 진짜 인자로 돈다
            // ⑷ 플래시는 생성 즉시 지워질 수 있으므로 **생성 순간**을 훅으로 잡는다
            const born = [];
            const realAppend = layer.appendChild.bind(layer);
            layer.appendChild = (node) => { const r = realAppend(node); try { born.push(node.style.zIndex); } catch (e) {} return r; };
            const realST = window.setTimeout;
            let shakeMax = 0;
            const realShake = Scene3D.shake;
            Scene3D.shake = function (a) { shakeMax = Math.max(shakeMax, a); return realShake.call(this, a); };
            let fovMin = fov0;
            const realFov = Scene3D.fovPunch;
            Scene3D.fovPunch = function (amt, dur) { fovMin = Math.min(fovMin, fov0 * (1 - amt)); return realFov.call(this, amt, dur); };
            window.setTimeout = function (fn) { try { fn(); } catch (e) {} return 0; };
            try {
                Scene3D.skillEffect('explode', 0x64b5f6, [], { rarity: RARITY_BY_TIER[tier] });
            } finally {
                window.setTimeout = realST;
                Scene3D.shake = realShake;
                Scene3D.fovPunch = realFov;
                delete layer.appendChild;
            }
            const added = Scene3D.scene.children.length - before;     // ⑶ 차분

            // 뒷정리 확인 — 프레임을 넉넉히 흘려 애니가 끝나게 한다
            for (let i = 0; i < 120; i++) Scene3D.update(1 / 60);

            out.push({
                tier, rarity: RARITY_BY_TIER[tier], added, shake: +shakeMax.toFixed(4),
                fovDrop: +(fov0 - fovMin).toFixed(4),
                flashes: born.length, flashZ: born.length ? born[0] : null,
            });
        }
        // 그레이드 복귀는 타이머가 되돌린다 — 즉시실행 패치 밖이므로 실시간으로 기다려야 한다
        return out;
    }, { RARITY_BY_TIER });

    // ── 2단계: 패치 없이 **실시간**으로 수명·그레이드 복귀를 잰다 ──────────────────────────
    // 1단계의 즉시실행 패치는 뒷정리 타이머까지 즉시 돌려 버려 이 둘을 잴 수 없다(⑷).
    const live = await page.evaluate(`(() => {
        const layer = Scene3D.fxLayer, cv = document.getElementById('game3d');
        Scene3D.anims.length = 0;
        while (layer.firstChild) layer.firstChild.remove();
        cv.style.filter = '';
        // 3D 렌더 루프를 먼저 멈춘다 — swiftshader 가 메인 스레드를 잡고 있으면 setTimeout
        //    뒷정리가 **몇 초가 지나도 안 깨어난다**(2026-08-19 실측: 4초를 기다려도 플래시 노드와
        //    그레이드가 그대로 남아 '뒷정리 버그'로 오진했다. 렌더를 멈추자 즉시 정상 복귀).
        //    수명·복귀를 실시간으로 재는 프로브는 반드시 이걸 먼저 할 것.
        Scene3D.update = function () {}; Scene3D.renderFrame = function () {};
        Scene3D.skillScreenFlash(new THREE.Color(0x64b5f6), 5);   // 진짜 경로·진짜 인자
        const f = [...layer.children].filter(e => e.style.zIndex === '13');
        return { atOnce: f.length, z: f.length ? getComputedStyle(f[0]).zIndex : null, grade: cv.style.filter };
    })()`);
    // ⚠️ **넉넉히 기다릴 것.** 이 컨테이너는 소프트웨어 GL 이 메인 스레드를 잡아 50ms 타이머가
    //    100~900ms 뒤에 깨어난다(TODO 계측 주의). 1.2초로 재다가 '뒷정리가 안 된다'는 유령
    //    실패를 한 번 봤다 — 연출 수명(≤260ms)의 10배 이상을 준다.
    await page.waitForTimeout(4000);
    const after = await page.evaluate(`(() => {
        const layer = Scene3D.fxLayer, cv = document.getElementById('game3d');
        return { left: [...layer.children].filter(e => e.style.zIndex === '13').length, grade: cv.style.filter };
    })()`);
    const gradeBack = !after.grade;

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
    const c = rows[0], m = rows[5];

    // ① 커먼에도 연출이 실재한다 (옛 `if (tier < 2) return` 회귀 방지)
    ok(c.added > 0, `커먼(tier 0)에 충격 연출 객체가 0개 — 등급 하한이 되살아났다`);
    ok(c.shake > 0, `커먼(tier 0)에 화면 흔들림이 없다 (${c.shake})`);
    ok(c.flashes === 1, `커먼(tier 0)에 화면 플래시가 ${c.flashes}개`);
    ok(live.atOnce === 1 && live.z === '13', `실시간 호출에서 플래시가 안 뜨거나 z 가 13이 아니다 — ${JSON.stringify(live)}`);
    ok(!!live.grade, `실시간 호출에서 씬 그레이드가 안 걸렸다 (${live.grade || '없음'})`);
    ok(after.left === 0, `수명이 지나도 플래시 노드가 ${after.left}개 남는다`);
    ok(c.fovDrop > 0, `커먼(tier 0)에 카메라 펀치가 없다`);

    // ② 등급 사다리 단조 (같은 값 허용 — 채널마다 계단 폭이 달라 완전 순증까지 요구하면 과적합)
    for (let i = 1; i < rows.length; i++) {
        ok(rows[i].shake >= rows[i - 1].shake - 1e-6,
            `셰이크가 등급을 안 탄다: ${rows[i - 1].rarity} ${rows[i - 1].shake} → ${rows[i].rarity} ${rows[i].shake}`);
        ok(rows[i].added >= rows[i - 1].added,
            `연출 객체 수가 등급을 안 탄다: ${rows[i - 1].rarity} ${rows[i - 1].added} → ${rows[i].rarity} ${rows[i].added}`);
    }

    // ③ 최상·최하 격차 — 위계가 살아 있는가
    ok(m.shake >= c.shake * 2, `미식이 커먼보다 충분히 세지 않다 (셰이크 ${c.shake} → ${m.shake}, 2배 필요)`);
    ok(m.added >= c.added * 1.5, `미식 연출 밀도가 커먼의 1.5배 미만 (${c.added} → ${m.added})`);

    // ④ 연출 대역 z 13 — 팝업(20+)을 침범하지 않는다
    for (const r of rows) ok(r.flashZ === '13', `[${r.rarity}] 화면 플래시 z=${r.flashZ} — 13이어야 한다(연출 대역)`);

    // ⑤ 뒷정리
    ok(gradeBack, `#game3d 씬 그레이드가 기본값으로 안 돌아왔다 — 필터가 눌린 채 남는다 (${after.grade})`);

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    for (const r of rows) {
        console.log(`${r.rarity.padEnd(10)} 씬객체 +${String(r.added).padStart(3)} · 셰이크 ${String(r.shake).padStart(6)}`
            + ` · fov -${r.fovDrop} · 플래시 ${r.flashes}(z${r.flashZ})`);
    }
    console.log(`실시간: 플래시 ${live.atOnce}개(z${live.z}) · 그레이드 "${live.grade}" → 4초 뒤 잔존 ${after.left}개 · 그레이드 "${after.grade}" (복귀 ${gradeBack ? 'OK' : '실패'})`);
    if (fail.length) { console.log('\nFAIL ' + fail.length + '건:'); fail.forEach(f => console.log(' ✗ ' + f)); }
    else console.log('\nPASS — 커먼부터 연출이 실재하고 등급 사다리가 단조, 플래시는 연출 대역(z13), 뒷정리 깨끗');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
