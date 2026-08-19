// 적 사망 디졸브가 **원래 반투명이던 재질을 불투명으로 튀기지 않는지** + **시체가 진짜로 사라지는지** 실측
// 사용: node probe-enemy-dissolve.js [kind...]
//
// 무엇이 문제였나: killEnemy 는 시체를 녹이려고 매 프레임 `mat.opacity = 1 - f` 를 **모든 재질에** 걸었다.
// 그런데 슬라임 젤리(0.82)·박쥐 막날개(0.76)처럼 원래 반투명인 재질까지 f=0 에서 opacity 1 로 덮어써서,
// 쓰러지기 직전 한 프레임에 **불투명으로 팍 튀었다**. 접촉 AO 링(0.78)을 얹으면 그게 '검은 고리가 켜지는'
// 것으로 보인다. 이제는 재질별 원래 불투명도(userData.dissolveBase)에 곱한다.
//
// 🚨 2026-08-19 판정기 교정 (slug: enemy-dissolve-opacity-stuck) — **이 프로브가 7종 전건 FAIL 을 뱉던 건
//    코드 결함이 아니라 판정기가 낡아서였다.** 옛 종료 판정은 `모든 재질의 opacity 가 0 으로 수렴하는가`
//    였는데, 그 사이 소멸 방식이 **균일 페이드 → 노이즈 알파 클립(`setDissolve`, 프래그먼트 `discard`)**
//    으로 갈아엎였다(hp-juicy ③). 알파 클립은 화소를 버려서 지우므로 **재질 opacity 는 원래 값(대개 1)에
//    그대로 머무는 게 정상**이다 — 즉 옛 판정은 '고쳐야 할 결함'이 아니라 '측정 대상이 사라진 눈금'이었다.
//    교차 실측: `probe-death-dissolve.js golem` 은 같은 코드에서 커버리지 1.00 → 0.00(0.483초)으로
//    **③ 시체가 완전히 사라진다** 를 통과한다. TODO 상단 인계 ㉢('도구가 코드보다 빨리 썩는다') 그대로였다.
//    → 종료 판정을 지금 코드가 실제로 쓰는 두 경로에 맞춘다:
//      ⓐ 훅이 걸린 재질(`userData.dissolveU`) → f=1 에서 유니폼이 **종단값 0.95**(setDissolve 의 꼬리 매핑)에
//         닿았는가. 유니폼만 보는 건 약한 증거이므로 반드시 ⓒ 와 함께 본다.
//      ⓑ 훅이 **안** 걸린 재질(스폰 경로를 안 탄 것) → setDissolve 의 폴백은 여전히 opacity 라
//         옛 판정 그대로 `opacity ≤ 0.02` 를 요구한다. 이 부분만 옛 눈금이 아직 유효하다.
//      ⓒ **렌더 커버리지**(진짜 판정) — f=1 에서 시체를 껐다 켠 차분 화소가 0 이어야 한다.
//         유니폼이 0.95 라도 로컬 좌표가 큰 파츠는 노이즈 최댓값이 임계를 넘어 살아남을 수 있으므로,
//         '화면에서 없어졌다'는 화면으로만 확정한다.
//    ⚠️ 커버리지에는 **자 점검이 필수**다 — 적이 화면 밖이면 f=0 에서도 차분이 0 이라 ⓒ 가 공짜로 통과한다
//       (hp-juicy 하네스 규칙 ㉠). 그래서 디졸브 시작 전 커버리지가 300px 미만이면 그 종은 그 자체로 FAIL.
//
// 재는 것: 종별로 ① 사망 직후(f≈0) 각 재질의 opacity 가 **원래 값 이하**인가(초과 = 튐)
//          ② 디졸브 끝에서 시체가 화면에서 사라지는가(위 ⓐⓑⓒ) ③ 콘솔 에러
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];

const DSV_END = 0.95;      // setDissolve 가 f=1 에서 찍는 종단 임계값 (scene3d.js DSV_HI/DSV_TAIL 매핑의 끝)
const RULER_MIN = 300;     // 자 점검 하한: 디졸브 직전 시체가 이만큼은 화면을 덮어야 커버리지 판정이 의미 있다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

        const r = await page.evaluate(async (DSV_END) => {
            Combat.tick = () => { };
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            if (!m) return { err: 'spawnEnemy 가 메시를 안 만들었다' };
            // 커버리지를 재려면 시체가 화면 안 고정 위치에 있어야 한다(규칙 ㉠) — killEnemy 가
            // `ox = m.g.position.x` 를 캡처하므로 **처치 전에** 옮긴다.
            e.x = Scene3D.heroG.position.x + 1.9;
            m.g.position.set(e.x, m.g.position.y, 0);
            m.g.updateWorldMatrix(true, true);

            // 사망 전 스냅샷: 재질별 원래 불투명도 (transparent 인 것만 의미가 있다)
            const before = [];
            m.g.traverse(o => {
                if (!o.isMesh || !o.material) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => before.push({ mt, base: mt.transparent ? mt.opacity : 1 }));
            });
            const semi = before.filter(b => b.base < 0.999).length;
            const hooked = before.filter(b => b.mt.userData.dissolveU).length;

            // ── 커버리지 자(尺) — probe-death-dissolve.js 와 같은 방식: 시체를 껐다 켠 차분 화소.
            //    파티클·그을음·HP바는 두 프레임 모두에 있으므로 상쇄된다.
            const rend = Scene3D.renderer;
            const db = new THREE.Vector2(); rend.getDrawingBufferSize(db);
            const W = Math.floor(db.x), H = Math.floor(db.y);
            const cap = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
            cap.texture.encoding = THREE.sRGBEncoding;
            const grab = () => {
                Scene3D.renderFrame();
                if (Scene3D.postOn && Scene3D._fsQuad) {
                    Scene3D._fsQuad.material = Scene3D._compMat;
                    rend.setRenderTarget(cap); rend.render(Scene3D._fsScene, Scene3D._fsCam); rend.setRenderTarget(null);
                } else {
                    rend.setRenderTarget(cap); rend.render(Scene3D.scene, Scene3D.camera); rend.setRenderTarget(null);
                }
                const b = new Uint8Array(W * H * 4); rend.readRenderTargetPixels(cap, 0, 0, W, H, b); return b;
            };
            const rect = rend.domElement.getBoundingClientRect();
            const sx = W / rect.width, sy = H / rect.height;
            // 시체는 눕고(-1.45rad) +0.22유닛 밀리므로 살아 있을 때 bbox 를 넉넉히 부풀려 **고정** 박스로 쓴다.
            // 박스가 커도 차분은 시체 화소만 잡으므로 '0 이어야 한다' 판정은 크게 잡을수록 안전하다.
            const box = (() => {
                const b = new THREE.Box3().setFromObject(m.g);
                b.expandByVector(new THREE.Vector3(1.4, 0.9, 1.2));
                let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
                for (const xi of [b.min.x, b.max.x]) for (const yi of [b.min.y, b.max.y]) for (const zi of [b.min.z, b.max.z]) {
                    const p = new THREE.Vector3(xi, yi, zi).project(Scene3D.camera);
                    const px = ((p.x * 0.5 + 0.5) * rect.width) * sx, py = H - ((0.5 - p.y * 0.5) * rect.height) * sy;
                    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
                }
                return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))];
            })();
            const coverage = () => {
                m.g.visible = false; const off = grab();
                m.g.visible = true; const on = grab();
                let px = 0;
                for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
                    const i = (y * W + x) * 4;
                    if (Math.abs(off[i] - on[i]) + Math.abs(off[i + 1] - on[i + 1]) + Math.abs(off[i + 2] - on[i + 2]) > 12) px++;
                }
                return px;
            };

            e.alive = false;
            Scene3D.anims = [];              // 기존 연출을 비우고 사망 클립만 남긴다
            Scene3D.killEnemy(999, false);
            // ⚠️ 실시간 rAF 로 재면 안 된다 — 소프트웨어 GL 이라 420ms 에 1~3프레임밖에 안 돌아
            //    디졸브 구간에 진입도 못 하고 '초과 0'이 공짜로 나온다(초판이 이 함정에 걸렸다).
            //    addAnim 이 남긴 클립 함수를 k 로 직접 몰아 결정론적으로 훑는다(shot-enemies 가 쓰는 방식).
            // ⚠️ killEnemy 는 클립을 **여러 개** 남긴다(HP바 드레인이 먼저, 몸통 사망 클립이 나중).
            //    첫 번째만 몰면 바만 움직이고 디졸브는 손도 안 대 '초과 0'이 공짜로 나온다.
            const clips = Scene3D.anims.filter(a => a.fn);
            if (!clips.length) return { err: 'killEnemy 가 애니메이션 클립을 남기지 않았다' };
            const uOf = () => {              // 훅이 걸린 재질들의 유니폼 최솟값(하나라도 안 오르면 잡힌다)
                let u = Infinity;
                for (const b of before) if (b.mt.userData.dissolveU) u = Math.min(u, b.mt.userData.dissolveU.value);
                return u === Infinity ? -1 : u;
            };
            let worst = 0, worstBase = 1, sampled = 0, ruler = 0, rulerK = -1;
            for (let i = 0; i <= 100; i++) {
                clips.forEach(c => { try { c.fn(i / 100); } catch (err) { } });
                sampled++;
                // 자 점검용 기준선 = 유니폼이 0 을 벗어나기 **직전** 프레임의 커버리지
                // (그 앞은 쓰러지는 구간이라 시체가 아직 온전하다).
                if (rulerK < 0 && uOf() > 0) { rulerK = i; }
                else if (rulerK < 0 && i % 10 === 0) ruler = coverage();
                for (const b of before) {
                    const over = b.mt.opacity - b.base;
                    if (over > worst) { worst = over; worstBase = b.base; }
                }
            }
            clips.forEach(c => { try { c.fn(1); } catch (err) { } });
            // ⓐ 훅 재질: 종단 유니폼 / ⓑ 비훅 재질: 폴백 opacity / ⓒ 화면 커버리지
            const endU = uOf();
            const endOp = before.filter(b => !b.mt.userData.dissolveU)
                .reduce((a, b) => Math.max(a, b.mt.opacity), 0);
            const endPx = coverage();
            return {
                total: before.length, semi, hooked, clips: clips.length, sampled,
                worst: +worst.toFixed(3), worstBase: +worstBase.toFixed(2),
                endU: +endU.toFixed(3), endOp: +endOp.toFixed(3), endPx, ruler, box, W, H,
            };
        }, DSV_END);

        if (r.err) { console.log(`FAIL ${kind.padEnd(9)} ${r.err}`); fail++; await page.close(); continue; }
        // 튐 허용치 0.02 — k 격자가 101칸이라 f 가 정확히 0 인 순간을 못 짚을 수 있어 미세 오차만 봐준다
        // 표본이 101 미만이면 클립을 못 몬 것이므로 그 자체가 실패다(공짜 PASS 방지)
        const cond = [
            ['표본', r.sampled === 101],
            ['튐', r.worst <= 0.02],
            ['자', r.ruler >= RULER_MIN],                                   // 자 점검 — 이게 깨지면 아래 커버리지는 무의미
            ['훅종단', r.endU < 0 || r.endU >= DSV_END - 0.001],            // ⓐ (훅 재질이 하나도 없으면 면제)
            ['폴백', r.endOp <= 0.02],                                      // ⓑ
            ['커버리지', r.endPx === 0],                                    // ⓒ 진짜 판정
            ['에러', errors.length === 0],
        ];
        const bad = cond.filter(c => !c[1]).map(c => c[0]);
        const ok = !bad.length;
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${kind.padEnd(9)} 재질 ${r.total}개(반투명 ${r.semi} · 디졸브훅 ${r.hooked})` +
            ` · 초반 원래값 초과 최대 +${r.worst}${r.worst > 0.02 ? `(원래 ${r.worstBase})` : ''}` +
            ` · 종료 uDis ${r.endU}/${DSV_END} · 비훅 opacity ${r.endOp} · 종료 커버리지 ${r.endPx}px(자 ${r.ruler}px)` +
            ` · 클립 ${r.clips}개 × 표본 ${r.sampled}컷` +
            (bad.length ? ` · 위반: ${bad.join(',')}` : '') +
            (errors.length ? ' · CONSOLE ERRORS: ' + errors.join(' | ') : ''));
        await page.close();
    }
    await browser.close();
    console.log(fail ? `\n${fail}종 FAIL` : '\n전 종 PASS');
    process.exit(fail ? 1 : 0);
})();
