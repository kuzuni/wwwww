// 공허의 창 '공간 균열' 판정기 — skill-unique-signature
//
// 이 연출의 주장은 하나다: **18종 중 유일하게 화면을 어둡게 만든다**(음화/negative space).
// 그래서 판정도 '보라색이 예쁘냐'가 아니라 **화면에 없던 근흑 픽셀이 실제로 생기는가**로 한다.
// 그리고 그 자를 분리 대상인 `beam`(화살 세례, 관통 사격)에도 그대로 대서 **A/B 로** 가른다 —
// 자가 유효한지 스스로 증명하지 못하는 프로브는 함정 ④(TODO 상단)에서 몇 번이나 유령 결과를 냈다.
//
// 게이트
//  A. fx 키가 실제로 갈렸다 — voidLance.fx='voidrift' ≠ pierceShot.fx='beam', 전용 함수가 불린다
//  B. 음화 시그니처 — 개열 정점에서 **밝던 자리가 근흑이 된 픽셀의 최대 연결 덩어리**가 DARK_MIN 이상
//     A/B: 같은 자를 `beam` 에 대면 그 덩어리가 voidrift 의 AB_RATIO 미만이어야 한다(자가 유효)
//  C. 관통 운동 — 창이 균열에서 나와 **적을 지나 영웅 쪽으로** 간다(끝점이 적보다 영웅에 가깝다).
//     ⚠️ '매 프레임 줄어든다'로 묻지 않는다 — 히트스톱 구간에서 dt=0 이라 표본이 정체한다
//     (TODO 인계 ㉤⑴). '되감기지 않는가'로 묻는다.
//  D. 정리 — 연출이 끝나면 voidriftFx 그룹 0, 씬 자식·지오메트리가 기준선으로 복귀, 라이트 반납
//  E. 콘솔 에러 0
//
// 사용: node probe-voidrift.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 🚨 임계는 **화면 실측**으로 잡았다 — 소스 헥스로 잡으면 안 된다.
// 근흑 0x070509 는 sRGB 출력 인코딩을 타고 화면에서 **luma ≈ 46** 으로 올라온다(0x07=7 이 아니다).
// 실측 히스토그램: 균열 자리의 현재 luma 가 25~49 대역에 2920px 몰려 있고, 최대 연결 덩어리는
// 임계 40 에서 804px → 임계 100 에서 984px 로 **평탄**하다(= 경계가 뚜렷한 한 덩어리).
// 임계를 28 로 잡으면 81px 밖에 안 잡혀 멀쩡한 연출이 FAIL 난다(첫 실측에서 그랬다).
const DARK_LUMA = 40;        // 이 아래면 '구멍'. 화면 실측 기준(소스 헥스 아님)
const BRIGHT_LUMA = 120;     // 기준선에서 이 위였던 자리만 본다 — 원래 어두운 나무·그림자 제외
// 적 위치·테마·worldX 를 전부 고정한 뒤 실측 535 / 802 / 1422px (3연). 잔여 편차는 적 구성·소품
// 배치에서 오므로 하한은 최소 관측치보다 넉넉히 아래로. A/B 쪽(beam 3~17%)이 진짜 판별기다.
const DARK_MIN = 400;
const AB_RATIO = 0.25;       // beam 이 만드는 덩어리는 voidrift 의 이 비율 미만이어야 한다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Scene3D !== 'undefined' && Scene3D.renderer && Scene3D.heroG, null, { timeout: 180000 });
    await page.waitForTimeout(800);

    const fail = [];
    const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail.push(msg); };

    // 3D 캔버스 영역만 본다 — UI 픽셀이 섞이면 '어두운 버튼'이 근흑으로 잡힌다.
    const rect = await page.evaluate(() => {
        const c = Scene3D.canvas || document.getElementById('game3d');
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });

    // 스크린샷 → 데이터 URL 로 되돌려 2D 캔버스에서 디코드(WebGL 은 preserveDrawingBuffer 가 아니라 직접 못 읽는다)
    const grab = async () => {
        const buf = await page.screenshot({ clip: rect });
        return page.evaluate(async (url) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = url; });
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const cx = cv.getContext('2d');
            cx.drawImage(img, 0, 0);
            const d = cx.getImageData(0, 0, cv.width, cv.height).data;
            const luma = new Uint8Array(cv.width * cv.height);
            for (let i = 0, p = 0; i < d.length; i += 4, p++) luma[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
            window.__luma = window.__luma || {};
            return Array.from(luma);
        }, 'data:image/png;base64,' + buf.toString('base64'));
    };
    // '화면에 구멍이 뚫렸다'의 조작적 정의 = **밝던(≥90) 자리가 근흑(<28)이 된 픽셀의 최대 연결 덩어리**.
    // 🚨 단순 픽셀 카운트로 재면 안 된다 — 첫 실측에서 `beam` 이 voidrift 의 25% 를 냈다. 원인은
    //    `skillImpactWeight` 의 화면 셰이크로, 카메라가 흔들리면 밝은 하늘 픽셀 자리에 어두운
    //    나무가 들어와 '어두워진 픽셀'로 잡힌다. 그건 흩어진 가장자리 선이고 균열은 **한 덩어리**다.
    //    연결 성분으로 재면 이 둘이 갈린다(함정 ④⑵ 와 같은 뿌리 — 지표가 다른 것에 딸려 움직였다).
    const darkBlob = (base, now, w) => {
        const h = base.length / w;
        const mask = new Uint8Array(base.length);
        for (let i = 0; i < base.length; i++) mask[i] = (base[i] >= BRIGHT_LUMA && now[i] < DARK_LUMA) ? 1 : 0;
        let best = 0;
        const stack = new Int32Array(base.length);
        for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            let sp = 0, n = 0;
            stack[sp++] = i; mask[i] = 0;
            while (sp) {
                const p = stack[--sp]; n++;
                const x = p % w, y = (p / w) | 0;
                if (x > 0 && mask[p - 1]) { mask[p - 1] = 0; stack[sp++] = p - 1; }
                if (x < w - 1 && mask[p + 1]) { mask[p + 1] = 0; stack[sp++] = p + 1; }
                if (y > 0 && mask[p - w]) { mask[p - w] = 0; stack[sp++] = p - w; }
                if (y < h - 1 && mask[p + w]) { mask[p + w] = 0; stack[sp++] = p + w; }
            }
            if (n > best) best = n;
        }
        return best;
    };

    // ---- A. fx 키 분리 ----
    console.log('A. fx 키 분리');
    // SKILL_DEFS 는 **배열**이다(맵이 아니다) — `SKILL_DEFS.voidLance` 로 읽으면 전부 null 이 나온다.
    const keys = await page.evaluate(() => ({
        voidLance: (SKILL_DEFS.find(d => d.id === 'voidLance') || {}).fx || null,
        pierceShot: (SKILL_DEFS.find(d => d.id === 'pierceShot') || {}).fx || null,
        hasFn: typeof Scene3D.voidLanceRift === 'function',
        impactMs: Scene3D.VOIDRIFT_IMPACT_MS,
    }));
    ok(keys.voidLance === 'voidrift', `공허의 창 fx = voidrift (실제 ${keys.voidLance})`);
    ok(keys.pierceShot === 'beam', `관통 사격 fx = beam (실제 ${keys.pierceShot})`);
    ok(keys.voidLance !== keys.pierceShot, '두 스킬이 fx 를 더는 공유하지 않는다');
    ok(keys.hasFn, 'Scene3D.voidLanceRift 존재');
    ok(keys.impactMs === 540, `VOIDRIFT_IMPACT_MS = 540 (실제 ${keys.impactMs}) — 개열300+돌출140+관통100 과 동기`);

    // 연출을 결정적으로 태우는 장치: 전투 정지 + setTimeout 즉시화 + update 수동 스텝(함정 ③④)
    const arm = () => page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.anims.length = 0;
        // 🚨 **균열이 서는 자리를 고정한다.** 적 위치는 런마다 달라지고, 균열이 밝은 하늘 앞에
        //    서느냐 어두운 숲 앞에 서느냐로 근흑 대비가 통째로 뒤집힌다(실측: 같은 코드가
        //    171px ↔ 800px). 조건을 재는 게 아니라 고정하는 게 프로브의 일이다.
        //    Combat.tick 을 끊었으므로 논리 x 를 박아 두면 메시도 그 자리에 머문다.
        const e0 = Combat.enemies.filter(x => x.alive)[0];
        if (e0) {
            e0.x = 1.1;
            const m = Scene3D.enemyMap.get(e0.id);
            if (m) m.g.position.set(e0.x + Scene3D.worldX, 0, 0);
        }
        // 🚨 배경도 고정해야 한다. 적을 박아도 **월드가 계속 스크롤하고**(update 의 worldX += 1.7*dt)
        //    챕터 테마가 바뀌어, 균열 뒤에 하늘이 오느냐 숲이 오느냐가 런마다 달라진다
        //    (적만 고정했을 때 실측 300 ↔ 1600px). 테마를 1챕터로 고정하고 worldX 를 얼린다.
        if (typeof CHAPTER_THEMES !== 'undefined') Scene3D.setTheme(CHAPTER_THEMES[0]);
        window.__worldX = Scene3D.worldX;
        if (!window.__step) {
            const raw = Scene3D.update.bind(Scene3D);
            window.__step = (dt) => { raw(dt); Scene3D.worldX = window.__worldX; };
            Scene3D.update = () => {};
        }
        if (!window.__origTimeout) {
            window.__origTimeout = window.setTimeout;
            window.setTimeout = (fn, ms, ...a) => { try { typeof fn === 'function' && fn(...a); } catch (e) { console.error('immediate-timeout', e); } return 0; };
        }
        Scene3D.renderFrame();
    });
    const step = (n) => page.evaluate((k) => { for (let f = 0; f < k; f++) window.__step(1 / 60); Scene3D.renderFrame(); }, n);
    // 연출이 적을 밀어냈을 수 있으니(피격 반동) 발동 전마다 자리를 다시 박는다
    const pin = () => page.evaluate(() => {
        const e0 = Combat.enemies.filter(x => x.alive)[0];
        if (e0) { e0.x = 1.1; const m = Scene3D.enemyMap.get(e0.id); if (m) m.g.position.set(e0.x + Scene3D.worldX, 0, 0); }
        Scene3D.renderFrame();
    });
    const baseline = () => page.evaluate(() => {
        let geo = 0, groups = 0;
        Scene3D.scene.traverse(o => { if (o.isMesh && o.geometry) geo++; if (o.userData && o.userData.voidriftFx) groups++; });
        return { children: Scene3D.scene.children.length, geo, groups, anims: Scene3D.anims.length };
    });

    await arm();
    await step(2);
    const before = await baseline();
    const baseLuma = await grab();

    // ---- B. 음화 시그니처 ----
    console.log('B. 음화 시그니처 (개열 정점에 근흑이 생기는가)');
    await page.evaluate(() => {
        const ids = Combat.enemies.filter(e => e.alive).map(e => e.id);
        Scene3D.skillEffect('voidrift', 0x9575cd, ids, SKILL_DEFS.find(d => d.id === 'voidLance'));
    });
    await step(18);                                   // 개열 0.30s 정점 (setTimeout 즉시화라 페이로드가 0 프레임에 시작)
    const openLuma = await grab();
    const voidDark = darkBlob(baseLuma, openLuma, rect.width);
    console.log(`     voidrift 근흑 최대 덩어리 = ${voidDark}px`);
    ok(voidDark >= DARK_MIN, `개열 정점에 근흑 덩어리 ${DARK_MIN}px 이상 생김 (실측 ${voidDark})`);

    // 나머지 연출 소화 후 기준선 복귀 확인용으로 끝까지 흘린다
    await step(80);
    const afterVoid = await baseline();

    // A/B — 같은 자를 beam(화살 세례)에 댄다. 자가 유효하면 여기서는 근흑이 거의 안 생겨야 한다.
    await pin();
    const baseLuma2 = await grab();
    await page.evaluate(() => {
        const ids = Combat.enemies.filter(e => e.alive).map(e => e.id);
        Scene3D.skillEffect('beam', 0x81d4fa, ids, SKILL_DEFS.find(d => d.id === 'pierceShot'));
    });
    await step(18);
    const beamDark = darkBlob(baseLuma2, await grab(), rect.width);
    console.log(`     beam 근흑 최대 덩어리 = ${beamDark}px (voidrift 대비 ${(beamDark / Math.max(1, voidDark) * 100).toFixed(1)}%)`);
    ok(beamDark < voidDark * AB_RATIO, `A/B: beam 의 근흑 덩어리가 voidrift 의 ${AB_RATIO * 100}% 미만 (실측 ${(beamDark / Math.max(1, voidDark) * 100).toFixed(1)}%)`);
    await step(80);

    // ---- C. 관통 운동 ----
    console.log('C. 관통 운동 (균열 → 적 관통 → 영웅 쪽)');
    // 🚨 자를 한 번 갈아엎었다 — 처음엔 '영웅까지의 거리'로 쟀는데 3회 중 1회 되감김이 잡혔다.
    //    코드 결함이 아니라 **지표가 주장과 다른 것**이었다: 창의 종점은 영웅이 아니라
    //    `적 + offDir*(-1.05)` 이라, 직선 비행 중에도 영웅과의 거리는 최근접을 지나 다시 늘어난다
    //    (적 배치에 따라 그 최근접이 관통 구간 안에 들어오면 FAIL). 주장은 '영웅에 가까워진다'가
    //    아니라 **'균열에서 나와 적을 지나 앞으로 간다'** 이므로, 비행축 투영으로 직접 잰다.
    await pin();
    const motion = await page.evaluate(() => {
        Scene3D.anims.length = 0;
        const ids = Combat.enemies.filter(e => e.alive).map(e => e.id);
        const enemy = Scene3D.enemyMap.get(ids[0]);
        const enemyPos = enemy ? enemy.g.position.clone() : null;
        Scene3D.skillEffect('voidrift', 0x9575cd, ids, SKILL_DEFS.find(d => d.id === 'voidLance'));
        const findLance = () => {
            let g = null;
            Scene3D.scene.traverse(o => { if (o.userData && o.userData.voidriftFx) g = o; });
            if (!g) return null;
            return g.children.find(c => c.isGroup && c.children.length === 5) || null;
        };
        // 비행축 = 창의 로컬 +y 를 월드로 (lance.quaternion 은 한 번만 세팅되므로 상수)
        let axis = null, origin = null;
        const samples = [];
        for (let f = 0; f < 60; f++) {
            window.__step(1 / 60);
            const l = findLance();
            if (!l || !l.visible) continue;
            if (!axis) {
                axis = new THREE.Vector3(0, 1, 0).applyQuaternion(l.quaternion).normalize();
                origin = l.position.clone();
            }
            samples.push({ f, p: l.position.clone().sub(origin).dot(axis) });
        }
        return {
            samples,
            enemyProg: (enemyPos && axis && origin) ? enemyPos.clone().sub(origin).dot(axis) : null,
        };
    });
    const s = motion.samples;
    ok(s.length >= 8, `창 표본 ${s.length}개 (≥8)`);
    if (s.length >= 2) {
        const maxP = Math.max(...s.map(v => v.p));
        const iMax = s.findIndex(v => v.p === maxP);
        console.log(`     비행축 진행: 최대 ${maxP.toFixed(2)} (적 투영 ${motion.enemyProg.toFixed(2)})`);
        ok(maxP > motion.enemyProg, `창이 적을 지나간다 (진행 ${maxP.toFixed(2)} > 적 ${motion.enemyProg.toFixed(2)})`);
        ok(maxP > 1.5, `균열에서 나와 실제로 이동한다 (진행폭 ${maxP.toFixed(2)} > 1.5)`);
        // '되감기지 않는가' — 관통 구간에 후퇴 프레임이 없어야 한다.
        // ⚠️ '매 프레임 커진다'로 묻지 않는다 — 히트스톱에서 dt=0 이라 표본이 정체한다(인계 ㉤⑴).
        // 🚨 창의 기준을 `iMax` 로 잡으면 안 된다(2차 실측에서 3/3 FAIL) — 착탄 뒤 **박힌 창이
        //    미세 진동**하므로(의도된 연출, 진폭 ±0.05) 최대 진행은 진동 구간의 임의 봉우리에
        //    떨어지고 그 앞 6프레임은 진동이다. 관통이 '끝난' 첫 프레임 = 진동 진폭(0.12)보다
        //    가깝게 최대에 도달한 최초 프레임으로 잡고, 그 앞 6프레임만 본다.
        //    돌출 단계의 되당김(예비동작)도 **의도된 후퇴**라 이 창 밖이다.
        const iPierce = s.findIndex(v => v.p >= maxP - 0.12);
        let rewind = 0;
        for (let i = Math.max(1, iPierce - 5); i <= iPierce; i++) if (s[i].p < s[i - 1].p - 1e-6) rewind++;
        ok(rewind === 0, `관통 구간에 되감김 프레임 없음 (실측 ${rewind})`);
        // 여운의 되빨림은 반대로 **반드시 있어야** 한다 — 창이 균열로 되돌아가는 게 이 연출의 마무리다.
        const backs = s.slice(iPierce).filter((v, i, a) => i > 0 && v.p < a[i - 1].p - 1e-6).length;
        ok(backs >= 3, `여운에 되빨림(후퇴) 프레임 ${backs}개 (≥3)`);
    }
    await step(80);

    // ---- D. 정리 ----
    console.log('D. 정리 (연출 종료 후 기준선 복귀)');
    const after = await baseline();
    console.log(`     씬 자식 ${before.children}→${after.children} · 메시지오 ${before.geo}→${after.geo} · voidriftFx ${after.groups} · anims ${after.anims}`);
    ok(after.groups === 0, `voidriftFx 그룹 0개 (실측 ${after.groups})`);
    ok(after.children <= before.children, `씬 자식 누수 없음 (${before.children}→${after.children})`);
    ok(after.geo <= before.geo, `메시 지오메트리 누수 없음 (${before.geo}→${after.geo})`);
    ok(afterVoid.groups === 0, `1차 발동분도 전량 회수됨 (실측 ${afterVoid.groups})`);
    const lights = await page.evaluate(() => {
        let busy = 0, tagged = 0, total = 0;
        Scene3D.scene.traverse(o => { if (o.isPointLight) { total++; if (o.userData.busy) busy++; if (o.userData.voidriftLight) tagged++; } });
        return { busy, tagged, total };
    });
    ok(lights.tagged === 0, `voidriftLight 태그 잔류 0 (실측 ${lights.tagged})`);
    ok(lights.total === 7, `포인트라이트 상수 7 유지 (실측 ${lights.total})`);

    // ---- E. 콘솔 ----
    console.log('E. 콘솔');
    ok(errs.length === 0, `콘솔 에러 0 (실측 ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''})`);

    console.log(fail.length ? `\nFAIL ${fail.length}건\n - ` + fail.join('\n - ') : '\nPASS — 전 게이트 통과');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
