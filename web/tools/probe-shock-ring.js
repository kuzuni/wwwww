// 지면 충격링 크기·앵커·수명 실측 (hp-juicy 지적 ⓔ / A #4).
//
// 지적: "이전 스윙 링이 지름 195px(골렘 폭 2.5배)까지 커져 지면 얼룩으로 읽힌다.
//        최대 반경 40~50%로, 앵커를 적 발밑으로, 수명 ~150ms로."
//
// 재는 법 — `slam` 모션(망치·곤봉류)이 부르는 `expandRing` 을 단발로 태우고 프레임마다
//   ⒜ 링 메시(TorusGeometry)의 화면 지름 — 정점 투영, AABB 금지
//   ⒝ 같은 프레임의 적 실루엣 폭 — 비교 기준(지적이 '골렘 폭 2.5배'라고 썼다)
//   ⒞ 링 중심 vs 적 발밑(적 x·z, y=0)의 화면 거리 — 앵커가 발밑인가
//   ⒟ 재질 opacity — 눈에 보이는 수명
// 을 읽는다. 측정 격리는 `probe-weapon-contact.js` 와 같다(한 evaluate 안에서 백로그를 비우고
// 좌표를 스냅한 뒤 단발로 태운다 — 헤드리스는 rAF 가 안 돌아 연출이 수백 개 밀려 있다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MAX_RATIO = 1.2;   // 링 지름 ≤ 적 폭의 1.2배 (지적 권고 '최대 반경 40~50%' = 지금의 절반 이하)
const MAX_LIFE = 200;    // 눈에 보이는 수명 상한 ms (권고 ~150ms + 프레임 여유)
const MAX_ANCHOR = 30;   // 링 중심이 적 발밑에서 벗어나도 되는 화면 px
// `--z <값>` 으로 적을 깊이 레인에 세워 앵커를 시험한다. 대열 뒷자리 적은 z 가 0 이 아니어서,
// 링을 영웅 돌진 좌표(z 고정 0)에 떨어뜨리면 발밑에서 비껴간다 — 그 조건을 재현하는 스위치다.
const ZLANE = (() => { const i = process.argv.indexOf('--z'); return i > 0 ? parseFloat(process.argv[i + 1]) : 0; })();

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });

    const out = await page.evaluate((ZLANE) => {
        const D = Scene3D, ST = window.S, V = new THREE.Vector3();
        const projAll = (obj) => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
            obj.updateWorldMatrix(true, true);
            obj.traverse(o => {
                const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                if (!pos || o.visible === false) return;
                const stride = Math.max(1, Math.floor(pos.count / 240));
                for (let i = 0; i < pos.count; i += stride) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const p = D.project(V);
                    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
                    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
                    n++;
                }
            });
            return n ? [x0, y0, x1, y1] : null;
        };
        // ⚠️ '씬 최상위 토러스'로 링을 찾으면 안 된다 — `swoosh` 도 최상위에 토러스(부분 아크)를 얹어서,
        //    합집합 폭이 스윙 호와 섞여 링이 **줄었다 늘었다** 하는 유령 곡선이 나온다(첫 판에서 밟았다:
        //    +100ms 76.9px → +133ms 54.9px 로 링이 오그라드는 것처럼 찍혔다). 아래에서 `expandRing`
        //    호출 전후의 씬 자식 차분으로 **이번 링이 실제로 추가한 메시만** 손에 쥔다.

        const e = Combat.enemies.find(x => x.alive);
        const m = D.enemyMap.get(e.id);
        // 망치를 들려 slam 모션을 확실히 태운다(club 이 기본이라 이미 slam 이지만 명시)
        ST.equipment.weapon = { name: WEAPON_TYPES.hammer.kr, slot: 'weapon', age: 'medieval', ageIdx: 1, rarity: 'common', level: 1, wtype: 'hammer' };
        D.refreshHeroEquip();
        D.anims.length = 0; D._hitStop = 0; D._attacking = false; D._trailOn = false;
        // 이미 떠 있는 링이 있으면 걷어낸다(밀린 연출에서 나온 것)
        for (const o of [...D.scene.children]) if (o.isMesh && o.geometry && o.geometry.type === 'TorusGeometry') D.scene.remove(o);
        e.x = Combat.stopXOf(e);
        e.z = ZLANE;
        m.g.position.set(e.x + D.worldX, m.g.position.y, ZLANE);
        D.heroG.position.set(Combat.HERO_X + D.worldX, D.rideY || 0, 0);
        D.heroG.rotation.set(0, 0.55, 0);

        // ⚠️ **인자를 손으로 옮겨 적지 말 것.** 첫 판은 `expandRing(pos, color, 1.2)` 를 프로브에 그대로
        //    베껴 뒀는데, 코드에서 maxR 을 줄인 뒤에도 프로브는 옛 1.2 로 재서 "고쳤는데 더 커졌다"는
        //    유령 결과를 냈다. 자가 코드보다 낡으면 그 자로 잰 판정은 전부 무효다.
        //    slam 의 링은 `heroAttack` 안에서 `setTimeout(210ms)` 로 예약되므로, 동기 블록 동안만
        //    setTimeout 을 즉시 실행으로 바꿔 **진짜 코드 경로가 진짜 인자로** 링을 띄우게 한다.
        // ⚠️ 기준 폭을 **한 프레임**에서 뽑으면 안 된다. `?enemy=golem` 으로 종을 고정해도 대기 모션의
        //    위상과 히트 스쿼시 때문에 같은 골렘의 화면 폭이 실행마다 48.8~60.5px 로 흔들려, 배율이
        //    링과 무관하게 ±20% 움직인다(게이트가 실행마다 뒤집힌다). 구간 전체를 재서 **중앙값**을 쓴다.
        const realST = window.setTimeout, realRing = D.expandRing.bind(D);
        let ringArgs = null, ringPos = null;
        let ringMeshes = [];
        window.setTimeout = (fn, ms) => { if (ms <= 400) { try { fn(); } catch (_) {} } return 0; };
        D.expandRing = (pos, color, maxR) => {
            const before = new Set(D.scene.children);
            ringArgs = { maxR }; ringPos = pos.clone();
            const r = realRing(pos, color, maxR);
            ringMeshes = D.scene.children.filter(o => !before.has(o));
            return r;
        };
        D.heroAttack(e.id);
        window.setTimeout = realST; D.expandRing = realRing;

        const foot = D.project(new THREE.Vector3(m.g.position.x, 0, m.g.position.z));
        const frames = [];
        for (let i = 0; i < 30; i++) {
            const t = Math.round(i * 1000 / 60);
            const rings = ringMeshes.filter(o => o.parent);
            const eb = projAll(m.g);
            const ew = eb ? +(eb[2] - eb[0]).toFixed(1) : null;
            if (rings.length) {
                const rb = rings.map(projAll).filter(Boolean);
                const x0 = Math.min(...rb.map(b => b[0])), x1 = Math.max(...rb.map(b => b[2]));
                const y0 = Math.min(...rb.map(b => b[1])), y1 = Math.max(...rb.map(b => b[3]));
                frames.push({ t, w: +(x1 - x0).toFixed(1), ew, op: +Math.max(...rings.map(r => r.material.opacity)).toFixed(3),
                              anchor: +Math.hypot((x0 + x1) / 2 - foot.x, (y0 + y1) / 2 - foot.y).toFixed(1) });
            } else frames.push({ t, w: 0, ew, op: 0, anchor: null });
            D.update(1 / 60);
        }
        return { frames, enemyKind: new URLSearchParams(location.search).get('enemy') || ('id' + e.id), foot: { x: +foot.x.toFixed(1), y: +foot.y.toFixed(1) },
                 maxR: ringArgs && ringArgs.maxR, spawned: !!ringArgs,
                 ringWorldX: ringPos ? +ringPos.x.toFixed(2) : null, enemyWorldX: +m.g.position.x.toFixed(2) };
    }, ZLANE);

    console.log('== 지면 충격링 실측 (지적 ⓔ / A #4)%s ==', ZLANE ? ` — 적을 깊이 레인 z=${ZLANE} 에 세움` : '');
    const ews = out.frames.map(f => f.ew).filter(v => v).sort((a, b) => a - b);
    const enemyW = ews.length ? ews[Math.floor(ews.length / 2)] : null;   // 중앙값
    console.log('  적(%s) 실루엣 폭 중앙값 %spx (구간 %s~%spx) · 적 발밑 화면 (%s,%s) · 링 월드 x %s vs 적 월드 x %s · 코드가 준 maxR=%s',
        out.enemyKind, enemyW, ews[0], ews[ews.length - 1], out.foot.x, out.foot.y, out.ringWorldX, out.enemyWorldX, out.maxR);
    if (!out.spawned) { console.log('\n  ⚠️ 측정 불가 — heroAttack 이 링을 안 띄웠다(모션이 slam 이 아닐 수 있다).'); await browser.close(); process.exit(2); }
    for (const f of out.frames.filter((_, i) => i % 2 === 0)) {
        console.log(`  +${String(f.t).padStart(3)}ms  지름 ${String(f.w).padStart(6)}px (적 폭 중앙값의 ${(f.w / enemyW).toFixed(2)}배) · opacity ${f.op} · 발밑에서 ${f.anchor === null ? '-' : f.anchor + 'px'}`);
    }
    const vis = out.frames.filter(f => f.op > 0.05);
    const peak = out.frames.reduce((a, b) => b.w > a.w ? b : a, out.frames[0]);
    const peakRatio = peak.w / enemyW;
    const life = vis.length ? vis[vis.length - 1].t + 17 : 0;
    const anchor = peak.anchor;
    console.log('\n  최대 지름 %spx = 적 폭 중앙값(%spx)의 %s배 (상한 %s배)', peak.w, enemyW, peakRatio.toFixed(2), MAX_RATIO);
    console.log('  보이는 수명 %sms (상한 %sms) · 피크 프레임 앵커 오차 %spx (상한 %spx)', life, MAX_LIFE, anchor, MAX_ANCHOR);
    const okSize = peakRatio <= MAX_RATIO, okLife = life <= MAX_LIFE, okAnchor = anchor !== null && anchor <= MAX_ANCHOR;
    console.log('  크기 %s · 수명 %s · 앵커 %s', okSize ? '✓' : '✗', okLife ? '✓' : '✗', okAnchor ? '✓' : '✗');
    const pass = okSize && okLife && okAnchor;
    console.log(`\n  판정: ${pass ? 'PASS — 충격링이 적 발밑에서 짧게 터진다' : 'FAIL — 링이 과대하거나 오래 남거나 발밑이 아니다(지적 ⓔ가 맞다)'}`);
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(pass && !errors.length ? 0 : 1);
})();
