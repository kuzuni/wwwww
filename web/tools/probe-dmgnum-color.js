// 데미지 숫자 **세 티어의 색이 실제로 갈리는가 · 처치 숫자가 탁하지 않은가** (hp-juicy 7차 잔여 ㉰)
// 사용: node tools/probe-dmgnum-color.js   (종료코드 0 = 통과)
//
// 배경: 7차 비평가 B #7 이 "처치 숫자 '10k' 색이 탁하다"고 했다.
// 🚨 **실측 결과 '탁하다'는 기각됐다.** 비평가가 본 바로 그 프레임(+16ms)에서 처치 숫자는 세 티어 중
//    **가장 밝고 가장 깨끗하다**: 획의 '어둡고 채도 낮은' 화소 0.9% · 코어 휘도 255(상한).
//    정작 탁한 것은 **일반 숫자**였다(획 muddy 16.4% · 채도 0.074 · 헤일로가 차가운 검정 R-B −18).
//    착수 전 세운 가설(1px 짙은 갈색 외곽선이 획을 잡아먹는다)도 같이 기각됐다 — 그 외곽선은
//    이 크기에서 획의 1%도 안 된다.
// 다만 그쪽 처방('골드+글로우')의 절반은 근거가 있었다: 획 평균 R-B 가 **29.4** 로 크리(160)에 견주면
// 사실상 무채색이라 '금'이 아니라 '흰 글자'로 읽힌다. 그래서 탁함은 안 건드리고 **색상만** 금 쪽으로
// 밀었다(코어 #fff → #fff3c4, 안쪽 글로우 금색): warm 29.4 → 55.4 · muddy 0.9% → 0.3% · core 255 → 241.
//
// 🚨 이 도구도 자를 두 번 갈았다(둘 다 '통과'라는 틀린 답을 먼저 냈다):
//   ⑴ 처음엔 글리프 전체 평균으로 재서 muddy 1.5% 가 나왔다 — 넓고 따뜻한 **글로우 헤일로**가
//      평균을 끌어 획의 탁함을 씻는다. 배경 차분 세기로 **획(d>=150)과 헤일로(40~150)를 가른다.**
//   ⑵ 처음엔 팝이 끝난 안정 프레임(+60ms)을 쟀다 — 비평가가 보는 프레임은 **+16ms** 다.
//
// 지표는 채점자가 한 장에서 읽는 것과 같은 축으로 잡는다:
//   warm    = 글리프 화소 평균 R-B   (금/주황인가, 무채색인가)
//   sat     = 글리프 화소 평균 채도  (색이 살아 있나, 탁한가)
//   muddy   = **어둡고 채도 낮은** 화소 비율 (= '탁함'의 정체. 짙은 갈색 외곽선이 여기 잡힌다)
//   core    = 상위 밝기 화소 평균 휘도 (티어 위계의 밝기 축)
//
// 🚨 함정 회피(이 저장소가 반복해서 밟은 것들):
// ① **면적에 딸려 움직이는 지표를 쓰지 않는다**(TODO 함정 ④⑶). `core` 를 '상위 N%' 로 잡으면
//    글로우를 넓힐수록 어두운 화소가 불어나 같은 퍼센타일이 더 어두운 자리로 밀린다.
//    그래서 **고정 개수(상위 120화소)** 평균으로 잰다 — 글리프가 커져도 자가 안 움직인다.
// ② **클래스를 손으로 베끼지 않는다**(함정 ④⑴). `Combat.damageEnemy` 를 태워 게임이 스스로
//    고른 cls(`dmg-crit`/`dmg-kill`/기본)로 만들어진 요소를 잰다.
// ③ **CSS 애니메이션을 정지·시크**해서 잰다. 안 그러면 스크린샷 대기 사이에 연출이 끝나 빈 화면을
//    찍는다(인계 메모 ㉤⑵ 와 같은 사고).
// ④ 배경 차분으로 글리프만 쥔다 — 밝은 초원 위 흰 글자는 임계값만으로 안 갈린다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 기준값은 전부 **실측 기반**이다(before → after, +16ms 프레임 · 획 기준):
//   처치  warm 29.4 → 55.4 · muddy 0.9% → 0.3% · core 255 → 241.2
//   크리  warm 157.9 · core 141.9 (안 건드렸다)   일반  warm 7.4 · muddy 15.2% (안 건드렸다)
const MUDDY_MAX = 0.05;   // 처치 획의 어둡고 탁한 화소 비율 상한 — 실측 0.3%, 회귀 방지선
const WARM_MIN = 45;      // 처치 획 평균 R-B 하한 — 실측 55.4. 이 아래로 내려가면 다시 '흰 글자'다
const CORE_MIN = 232;     // 처치 코어 휘도 하한 — 위계상 가장 밝아야 한다(크리 141.9 대비)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    // 무대 동결 — 렌더/전투 루프를 세우고 적 하나를 근접 위치에 고정한다.
    await page.evaluate(() => {
        Combat.tick = () => {};
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {};
        window.__step = t => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        Scene3D.clearEnemies();
        const e = { id: 901, x: Combat.MELEE_X, alive: true, hp: Big.of(100000), maxHp: Big.of(100000), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(901);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        m.g.userData.landed = true;
        Combat.phase = 'fight';
        Scene3D.fxLayer.innerHTML = '';
        window.__step(0.016);
    });

    // 한 티어를 띄우고 → 애니메이션을 정지·시크 → 그 요소의 화면 사각형을 돌려준다.
    const spawnTier = async (amount, crit, kill) => await page.evaluate(([a, c, k]) => {
        Scene3D.fxLayer.innerHTML = '';
        const e = Combat.enemies[0];
        if (k) { e.hp = Big.of(1); } else { e.hp = Big.of(100000); e.alive = true; }
        Combat.damageEnemy(e, Big.of(a), c, null);           // 게임 경로 — cls 는 게임이 고른다
        window.__step(0.016);
        const el = Scene3D.fxLayer.lastElementChild;
        if (!el) return null;
        for (const an of el.getAnimations()) { an.pause(); an.currentTime = 16; } // 비평가가 본 접촉 프레임(+16ms)
        const r = el.getBoundingClientRect();
        const pad = 14; // 글로우까지 담기게
        return { cls: el.className, text: el.textContent, x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), w: r.width + pad * 2, h: r.height + pad * 2 };
    }, [amount, crit, kill]);

    // 🚨 화소 판독은 **페이지 안 캔버스**에서 한다 — 이 환경엔 Node 용 PNG 디코더가 없다
    //    (이 저장소의 다른 판독기들이 쓰는 '캔버스 디코드' 방식과 같다).
    const decodeStats = async (pngA, pngB) => await page.evaluate(async ([a, b]) => {
        const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const cv = document.createElement('canvas');
        cv.width = ia.width; cv.height = ia.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(ia, 0, 0);
        const A = cx.getImageData(0, 0, cv.width, cv.height).data;
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(ib, 0, 0);
        const B = cx.getImageData(0, 0, cv.width, cv.height).data;
        // 🚨 '글리프 전체'로 평균 내면 안 된다 — 이 도구가 처음에 그렇게 재서 muddy 1.5% 라는
        //    통과 판정을 냈다. 넓은 **글로우 헤일로**(따뜻하고 화소 수가 많다)가 평균을 통째로 끌어
        //    글자 획의 탁함을 씻어 버린다. 비평가가 '탁하다'고 본 것은 헤일로가 아니라 **획**이다.
        //    그래서 배경 차분 세기로 두 층을 가른다: 획(d>=150) / 헤일로(40<=d<150).
        const acc = () => ({ warm: 0, sat: 0, muddy: 0, n: 0, lums: [] });
        const ink = acc(), halo = acc();
        for (let i = 0; i < cv.width * cv.height; i++) {
            const r = A[i * 4], g = A[i * 4 + 1], bl = A[i * 4 + 2];
            const d = Math.abs(r - B[i * 4]) + Math.abs(g - B[i * 4 + 1]) + Math.abs(bl - B[i * 4 + 2]);
            if (d < 40) continue;
            const t = d >= 150 ? ink : halo;
            t.n++;
            const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
            const sv = mx ? (mx - mn) / mx : 0;
            const l = 0.299 * r + 0.587 * g + 0.114 * bl;
            t.warm += r - bl; t.sat += sv;
            if (l < 90 && sv < 0.45) t.muddy++;                    // 어둡고 채도 낮음 = '탁함'
            t.lums.push(l);
        }
        if (!ink.n) return null;
        const fin = t => {
            t.lums.sort((x, y) => y - x);
            const top = t.lums.slice(0, Math.min(120, t.lums.length)); // 고정 개수 — 면적에 안 딸린다
            return { n: t.n, warm: t.warm / t.n, sat: t.sat / t.n, muddy: t.muddy / t.n, core: top.reduce((s, v) => s + v, 0) / top.length };
        };
        const r1 = fin(ink);
        r1.halo = halo.n ? fin(halo) : null;
        return r1;
    }, [pngA, pngB]);

    const statsOf = async (box) => {
        const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) };
        const withN = await page.screenshot({ clip });
        await page.evaluate(() => { const el = Scene3D.fxLayer.lastElementChild; if (el) el.style.visibility = 'hidden'; });
        const without = await page.screenshot({ clip });
        await page.evaluate(() => { const el = Scene3D.fxLayer.lastElementChild; if (el) el.style.visibility = ''; });
        return decodeStats('data:image/png;base64,' + withN.toString('base64'), 'data:image/png;base64,' + without.toString('base64'));
    };

    const out = [];
    let ok = true;
    const say = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
    const res = {};
    for (const [name, amt, crit, kill] of [['일반', 140, false, false], ['크리', 320, true, false], ['처치', 99999, true, true]]) {
        const box = await spawnTier(amt, crit, kill);
        if (!box) { say(false, `${name}: 숫자 요소가 안 생겼다`); continue; }
        const st = await statsOf(box);
        if (!st) { say(false, `${name}: 글리프 화소를 못 잡았다(배경 차분 0)`); continue; }
        res[name] = st;
        out.push(`  · ${name} [${box.cls}] "${box.text}" — 획 ${st.n}px warm ${st.warm.toFixed(1)} sat ${st.sat.toFixed(3)} muddy ${(st.muddy * 100).toFixed(1)}% core ${st.core.toFixed(1)}` + (st.halo ? ` | 헤일로 ${st.halo.n}px warm ${st.halo.warm.toFixed(1)} muddy ${(st.halo.muddy * 100).toFixed(1)}%` : ''));
    }
    const K = res['처치'], C = res['크리'], N = res['일반'];
    if (K && C && N) {
        say(K.muddy <= MUDDY_MAX, `ⓐ 처치 숫자가 탁하지 않다: 어둡고 채도 낮은 화소 ${(K.muddy * 100).toFixed(1)}% (<= ${(MUDDY_MAX * 100).toFixed(0)}%)`);
        say(K.warm >= WARM_MIN, `ⓑ 처치 숫자가 금색으로 읽힌다: 평균 R-B ${K.warm.toFixed(1)} (>= ${WARM_MIN})`);
        say(K.core >= CORE_MIN, `ⓒ 처치 코어가 충분히 밝다: ${K.core.toFixed(1)} (>= ${CORE_MIN})`);
        say(K.core >= C.core, `ⓓ 위계(밝기): 처치 ${K.core.toFixed(1)} >= 크리 ${C.core.toFixed(1)}`);
        say(C.warm > N.warm, `ⓔ 위계(온기): 크리 ${C.warm.toFixed(1)} > 일반 ${N.warm.toFixed(1)}`);
        say(K.warm > N.warm, `ⓕ 위계(온기): 처치 ${K.warm.toFixed(1)} > 일반 ${N.warm.toFixed(1)}`);
    }
    for (const l of out) console.log(l);
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 4).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(ok && !errors.length ? 0 : 1);
})();
