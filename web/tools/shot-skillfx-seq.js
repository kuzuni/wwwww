// 스킬 3박자 연속 프레임 — 시전(1박) → 발동(2박) → 적중(3박) 을 결정론적으로 찍는다 (slug: skill-fx)
// 사용: node shot-skillfx-seq.js [스킬id|fx]   기본 fireball. (스킬id 를 주면 그 스킬의 fx+등급으로 찍는다)
// 산출: tools/skillfx-<이름>-seq.png (컨택트 시트) + 콘솔에 프레임별 '화면이 실제로 바뀌었는가' 실측
//
// 등급 위계 비교용: 같은 fx 를 쓰는 커먼/최상위 짝을 나란히 찍어 수치를 비교한다.
//   powerStrike(커먼 slash) vs execution(레전더리 slash) · fireball(레어 explode) vs supernova(얼티밋 explode)
//   · lightning(에픽 bolt) vs godspear(미식 bolt) · meteor(에픽) vs apocalypse(미식)
//
// ⚠️ 왜 자고 찍으면 안 되는가: 소프트웨어 GL 이라 rAF 가 420ms 에 1~3프레임밖에 안 돈다 —
//    실시간으로 찍으면 130ms 짜리 시전 박자가 통째로 0~1컷으로 뭉개져 '연출이 없다'는 오판이 나온다.
//    그래서 rAF 루프를 끊고 `Scene3D.update(dt)` 를 고정 dt 로 직접 몰아 절대 시각으로 찍는다.
// ⚠️ `skillEffect` 는 2박을 setTimeout 으로 미루므로 그대로 부르면 결정론이 깨진다.
//    캡처에서는 1박(`skillCastBeat`)과 2박(`skillPayload`)을 **CAST_MS 에 해당하는 프레임에서 직접** 부른다
//    — 실제 게임과 같은 간격이고, 벽시계에 의존하지 않는다.
// 🚨 **가상 시계 심(2026-08-19)**: 위 '결정론'은 `Scene3D.update` 에만 걸려 있었다. 연출 층 상당수는
//    `setTimeout` 으로 예약되는데 그건 **벽시계**로 터지고, 한 프레임 촬영에 실제로 ~800ms 가 걸린다
//    — 그래서 560ms 짜리 예약(초신성 폭발·처형 절단·신의 창 착탄)이 **가상 30ms 컷에서** 이미 터져
//    시트의 '언제'가 통째로 앞으로 쏠렸다. 1차 비평가 2인이 그 시트를 보고 "임팩트 층이 없다"고
//    적은 게 이 때문이다. 이제 `VClock` 이 setTimeout 을 가상 시각 큐로 가로채 프레임마다 pump 한다.
// 🚨 **피격 반응(2026-08-19)**: 이 촬영기는 `Combat.tick` 을 끊어 두므로 **피해가 한 번도 안 들어갔다**
//    — 적은 어떤 스킬에서도 플린치·히트플래시·넉백을 안 했고, 셰이크도 안 울렸다. 실게임은
//    `Combat.tryCast` 가 단일 0.20초 / 광역 0.25초 뒤에 `damageEnemy`+`shake` 를 건다(combat.js).
//    같은 시각에 `hitEnemy`/`shake` 를 직접 태워 3박(적중)이 화면에 실재하게 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const ARG = process.argv[2] || 'fireball';
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 🚨 촬영 창(2026-08-19): 예전 22컷(0~630ms)은 **늦게 때리는 스킬의 임팩트를 통째로 잘라먹었다** —
//    초신성 560ms · 신의 창 500ms · 공허의 창 540ms · 아포칼립스 820ms 가 전부 창 끝이나 창 밖이라,
//    시트가 '최대 밝기로 끝나는 정지 화면'으로 보였다(1차 채점 2인이 '소멸 단계 부재'로 감점).
//    가장 늦은 임팩트(820ms) + 잔광 350ms 까지 담도록 40컷(0~1170ms)으로 늘렸다.
const STEP_MS = 30, N = 40;      // 0~1170ms — 미식 시전 220ms + 최장 임팩트 820ms + 잔광까지
const COLS = 6;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(VCLOCK_SRC);

    await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.walking = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.heroAttack = () => { };
        Scene3D.clearEnemies();
        // maxHp 는 연출 강도(sev = 이번 피해/최대HP)의 분모다 — 100 으로 두고 스킬 피해를 넣으면
        // sev 가 1.0 으로 포화해 잡몹 한 방이 보스 처치급으로 찍힌다. 보통 교전(≈15%)으로 맞춘다.
        const e = { id: 999, x: Combat.MELEE_X + 0.9, alive: true, hp: 1e9, maxHp: 1e9 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        m.g.position.x = e.x + Scene3D.worldX; m.g.position.y = 0; m.g.userData.landed = true;
        // 진행 중 연출을 전부 끝내 캡처가 깨끗한 상태에서 시작하게 한다
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        // rAF 루프 차단 — 이제부터 시간은 우리가 준다
        Scene3D.__realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
    });
    await page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });
    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });

    // 🚨 렌더와 읽기는 같은 evaluate(한 JS 턴) 안에서 — 이 저장소 렌더러는 preserveDrawingBuffer 가
    //    아니라, 렌더 뒤 다음 호출에서 drawImage 하면 그 사이 드로잉 버퍼가 비워져 검은 판이 읽힌다.
    const frames = [];
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
        const png = await page.evaluate(({ i, STEP_MS, ARG, r }) => {
            const dt = STEP_MS / 1000;
            if (i === 0) {
                // 인자가 스킬 id 면 그 def 로, fx 이름이면 그 fx 를 쓰는 첫 스킬로 (등급까지 같이 잡힌다)
                const def = SKILL_DEFS.find(d => d.id === ARG) || SKILL_DEFS.find(d => d.fx === ARG);
                Scene3D.__def = def; Scene3D.__fx = def.fx;
                Scene3D.__tier = Scene3D.skillTier(def);
                Scene3D.__castCol = new THREE.Color(def.color);
                Scene3D.__wait = Scene3D.castMsFor(def.fx, Scene3D.__tier);
                Scene3D.__beat = Scene3D.castBeatMs(Scene3D.__tier);   // 박자 길이 ≠ 2박 지연(메테오는 지연 0)
                // 실게임 `Combat.tryCast` 의 피해 시각: 단일 0.20초 · 광역 0.25초 (combat.js)
                Scene3D.__hitMs = (def.type === 'aoe' ? 250 : 200);
                VClock.install();                                     // 이 시점부터 setTimeout 은 가상 시각
                Scene3D.skillCastBeat(Scene3D.__castCol, def.fx, Scene3D.__tier);   // 1박
                // 🚨 실게임 `skillEffect` 는 번개류의 먹구름 예고를 **1박과 같은 시각**에 세운다
                //    (scene3d.js '예고 오브젝트' 주석). 여기서 그걸 빼먹으면 볼트가 칠 때에야 구름이
                //    폴백으로 생겨 '150ms 공백 + 210ms 구름 팝인'이 찍힌다 — 3차 채점 2인이 실제로
                //    그렇게 감점했고, 코드가 아니라 이 촬영기의 구멍이었다(함정 ④의 재판).
                Scene3D.__stormScene = def.fx === 'bolt' ? Scene3D.stormCloudGather([999], Scene3D.__castCol, Scene3D.__tier) : null;
                Scene3D.__fired = false; Scene3D.__hit = false;
            } else {
                const t = i * STEP_MS;
                VClock.pump(t);                                        // 가상 시각까지 도달한 예약 층
                // castMsFor 를 넘긴 첫 프레임에서 2·3박 — 실게임의 setTimeout 과 같은 간격
                if (!Scene3D.__fired && t >= Scene3D.__wait) {
                    Scene3D.__fired = true;
                    Scene3D.skillPayload(Scene3D.__fx, Scene3D.__castCol, [999], Scene3D.__tier, Scene3D.__stormScene);   // 2·3박
                    VClock.pump(t);                                    // 페이로드가 0ms 로 건 층까지 이 컷에
                }
                // 3박(적중) — 실게임과 같은 시각에 피해 반응·셰이크. 이게 없으면 적이 어떤 스킬에도
                // 반응하지 않아 '임팩트 층이 통째로 없다'는 오판이 나온다(1차 채점 2인 일치 지적).
                if (!Scene3D.__hit && t >= Scene3D.__hitMs) {
                    Scene3D.__hit = true;
                    const isAoe = (Scene3D.__def || {}).type === 'aoe';
                    Scene3D.shake(isAoe ? 0.35 : 0.22);
                    // 최대HP의 15% — '보통 교전 한 방'. 크리는 단일기만(실게임 tryCast 와 같다).
                    Scene3D.hitEnemy(999, 1e9 * 0.15, !isAoe, 'skill', false);
                    VClock.pump(t);
                }
                Scene3D.__realUpdate(dt);
            }
            Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
            const cv = document.querySelector('canvas');
            const off = document.createElement('canvas');
            off.width = r.width; off.height = r.height;
            off.getContext('2d').drawImage(cv, 0, 0, r.width, r.height);
            return off.toDataURL('image/png');
        }, { i, STEP_MS, ARG, r: rect });
        frames.push(png);
    }

    await page.evaluate(() => VClock.restore());   // 남은 정리 타이머를 실제 시계로 넘긴다

    // 프레임별 변화량 — '연출이 실제로 움직였는가'를 수치로 남긴다(정지 화면 나열 방지)
    const diffs = await page.evaluate(async (frames) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const imgs = []; for (const f of frames) imgs.push(await load(f));
        const c = document.createElement('canvas'); c.width = imgs[0].width; c.height = imgs[0].height;
        const x = c.getContext('2d');
        const grab = (im) => { x.clearRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
        const base = grab(imgs[0]);
        const out = [];
        for (let i = 0; i < imgs.length; i++) {
            const d = grab(imgs[i]);
            let ch = 0, lift = 0;
            for (let p = 0; p < d.length; p += 4) {
                const dl = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) - (0.299 * base[p] + 0.587 * base[p + 1] + 0.114 * base[p + 2]);
                if (Math.abs(dl) > 6) ch++;
                if (dl > lift) lift = dl;
            }
            out.push({ ch, lift: Math.round(lift) });
        }
        return out;
    }, frames);

    // 컨택트 시트
    const sheet = await page.evaluate(async ({ frames, COLS, STEP_MS }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const imgs = []; for (const f of frames) imgs.push(await load(f));
        const w = imgs[0].width, h = imgs[0].height, rows = Math.ceil(imgs.length / COLS);
        const c = document.createElement('canvas'); c.width = w * COLS; c.height = h * rows;
        const x = c.getContext('2d');
        x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
        imgs.forEach((im, i) => {
            const cx = (i % COLS) * w, cy = Math.floor(i / COLS) * h;
            x.drawImage(im, cx, cy);
            x.font = 'bold 22px monospace'; x.fillStyle = '#000'; x.fillText(`${i * STEP_MS}ms`, cx + 9, cy + 27);
            x.fillStyle = '#7fff9f'; x.fillText(`${i * STEP_MS}ms`, cx + 8, cy + 26);
        });
        return c.toDataURL('image/png');
    }, { frames, COLS, STEP_MS });

    // 🚨 **컨택트 시트만으로 '조형'을 채점하게 두지 말 것 — 두 비평가가 같은 오진을 했다 (2026-08-20 3D 스트림).**
    //    시트는 480×854 컷 40장을 6열로 붙여 **2880×5696** 이라, 채점자에게 전달될 때 가로 1500px 안팎으로
    //    줄어든다(≈0.5배). 그러면 한 변 10~15px 짜리 불티 큐브가 **5px 남짓**이 돼 모서리가 사라지고
    //    둥근 점으로 보인다. 실제로 비평가 2인이 독립적으로 "큐브가 단 한 개도 없다 · 전부 소프트 라운드
    //    글로우 블롭"을 **1순위 결함**으로 꼽았는데, `spawnSparks` 는 그때 이미 큐브였다 — 같은 프레임을
    //    원본 해상도로 3배 크롭해 보면 큐브 모서리가 또렷하다(A/B 캡처로 확인). 한 명은 "9배 확대해
    //    재확인했다"고까지 적었지만, **줄어든 이미지를 확대한 것**이라 사라진 화소는 돌아오지 않는다.
    //    → 조형(큐브인가·모서리가 있는가)을 묻는 채점에는 `DUMP_DIR` 로 뽑은 **원본 해상도 개별 프레임**을
    //      같이 줄 것. 시트는 타이밍·박자·지속 시간을 보는 용도다.
    if (process.env.DUMP_DIR) {
        const dir = path.resolve(process.env.DUMP_DIR);
        fs.mkdirSync(dir, { recursive: true });
        frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `${ARG}-${String(i * STEP_MS).padStart(4, '0')}ms.png`),
            Buffer.from(f.split(',')[1], 'base64')));
        console.log(`  개별 프레임 ${frames.length}장(원본 해상도) → ${dir}`);
    }
    const meta = await page.evaluate(() => ({ fx: Scene3D.__fx, tier: Scene3D.__tier, wait: Scene3D.__wait, beat: Scene3D.__beat, name: (Scene3D.__def || {}).name }));
    const out = path.join(__dirname, `skillfx-${ARG}-seq.png`);
    fs.writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`${path.basename(out)}  ${meta.name}/${meta.fx} 등급단계 ${meta.tier} 시전박자 ${meta.beat}ms/2박지연 ${meta.wait}ms  (${N}컷 × ${STEP_MS}ms, 벽시계 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    // 시전 구간 = 0 < t < CAST_MS 인 컷만. `ceil(130/30)+1` 로 자르면 150ms(=발동 직후) 컷이 딸려 들어와
    // 2박의 폭발을 1박 실적으로 세게 된다(첫 실행에서 그렇게 나왔다).
    // 시전 박자가 화면에 있었는지는 **박자 길이**로 잘라야 한다 — 2박 지연(meta.wait)으로 자르면
    // 메테오는 0ms 라 구간이 비어 Math.max 가 -Infinity 가 되고 멀쩡한 연출이 FAIL 로 뜬다(실제로 그랬다).
    const cast = diffs.filter((d, i) => i > 0 && i * STEP_MS < meta.beat);
    const castMax = Math.max(...cast.map(d => d.ch));
    console.log(`  프레임별 변화 화소 / 최대 휘도 상승: ` + diffs.map((d, i) => `${i * STEP_MS}:${d.ch}/${d.lift}`).join('  '));
    const peak = Math.max(...diffs.map(d => d.ch));
    console.log(`  시전 구간(0~${meta.beat}ms) 최대 변화 화소 = ${castMax} · 전 구간 최대 = ${peak}  → ${castMax > 500 ? 'OK (1박이 화면에 존재한다)' : 'FAIL (시전 박자가 화면에 안 나온다)'}`);
    console.log(errors.length ? `  CONSOLE ERRORS: ${errors.join(' | ')}` : '  (no console errors)');
    await browser.close();
    process.exit(castMax > 500 && !errors.length ? 0 : 1);
})();
