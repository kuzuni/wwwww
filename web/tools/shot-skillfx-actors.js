// 스킬 액터 시퀀스 시트 — 18종 × 3프레임(등장 → 타격 → 여운)을 결정론적으로 찍는다.
//   (slug: skill-fx-minecraft-actors, 2026-08-21)
// 사용: node shot-skillfx-actors.js [출력경로]   기본 tools/skillfx-actors.png
//
// 무엇을 보는 시트인가 — "무슨 색이 번쩍였나"가 아니라 **무엇이 나와서 무엇을 했나**를 본다.
// 한 행에 스킬 두 개, 스킬마다 세 컷(등장·타격·여운)이 가로로 붙는다.
//
// ⚠️ 결정론 — 소프트웨어 GL 이라 실시간 촬영은 420ms 에 1~3프레임밖에 안 돈다. rAF 를 끊고
//    `Scene3D.update(dt)` 를 고정 dt 로 몰고, `setTimeout` 은 `VClock` 으로 가상 시각에 묶는다
//    (`shot-skillfx-seq.js` 머리말의 함정 ③④와 같은 이유 — 그 도구의 규약을 그대로 물려받았다).
// ⚠️ 피해 반응(플린치·히트플래시)은 `Combat.tick` 을 끊어 두면 한 번도 안 들어온다. 실게임과
//    같은 시각(단일 0.20초 / 광역 0.25초)에 `hitEnemy`+`shake` 를 직접 태운다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const OUT = process.argv[2] || path.resolve(__dirname, 'skillfx-actors.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 스킬별 '결정적 타격' 시각(ms, 페이로드 기준). 무게 층 동기 상수(`*_IMPACT_MS`)와 안무에서 온 값이다.
const IMPACT = {
    slash: 300, ring: 520, firstaid: 380, explode: 430, beam: 300, warcry: 380,
    meteor: 560, bolt: 400, heal: 420, breath: 470, guillotine: 430, aura: 360,
    nova: 560, voidrift: 540, timewarp: 520, dragonfire: 820, spear: 500, wardshield: 420,
};
const ORDER = ['slash', 'ring', 'beam', 'explode', 'meteor', 'bolt', 'breath', 'dragonfire',
    'guillotine', 'voidrift', 'spear', 'nova', 'heal', 'firstaid', 'aura', 'wardshield', 'warcry', 'timewarp'];
const STEP = 20;                      // 가상 프레임 간격
const CW = 300, CH = 360;             // 시트 셀 크기
const SKILLS_PER_ROW = 2;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(VCLOCK_SRC);
    await page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview',
            '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        Combat.tick = () => { };
        Scene3D.walking = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.heroAttack = () => { };
        // 액터 프로토타입을 미리 구워 둔다 — 첫 시전 프레임에 굽기 비용이 섞이지 않게.
        if (typeof SKILLFX_MODELS !== 'undefined') for (const id of Object.keys(SKILLFX_MODELS)) Scene3D.fxActorProto(id);
    });
    await page.waitForTimeout(2500);
    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });

    const shots = [];      // { fx, name, frames:[dataURL×3], crop }
    for (const fx of ORDER) {
        const imp = IMPACT[fx];
        const times = [Math.round(imp * 0.45), imp, imp + 300];
        // 씬 초기화 + 적 2체(광역이 '여럿을 쓸었다'로 읽히게)
        await page.evaluate(() => {
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) { } }
            Scene3D.anims = [];
            Scene3D.clearEnemies();
            Combat.enemies = [];
            for (let i = 0; i < 2; i++) {
                const e = { id: 900 + i, x: Combat.MELEE_X + 0.85 + i * 1.15, alive: true, hp: 1e9, maxHp: 1e9 };
                Combat.enemies.push(e);
                Scene3D.spawnEnemy(e);
                const m = Scene3D.enemyMap.get(e.id);
                m.g.position.x = e.x + Scene3D.worldX; m.g.position.y = 0; m.g.userData.landed = true;
            }
        });
        await page.waitForTimeout(400);
        const frames = [];
        const n = Math.ceil((times[2] + 40) / STEP);
        for (let i = 0; i <= n; i++) {
            const png = await page.evaluate(({ i, STEP, fx, times, r }) => {
                const t = i * STEP;
                if (i === 0) {
                    const def = SKILL_DEFS.find(d => d.fx === fx);
                    Scene3D.__def = def;
                    Scene3D.__col = new THREE.Color(def.color);
                    Scene3D.__tier = Scene3D.skillTier(def);
                    Scene3D.__wait = Scene3D.castMsFor(fx, Scene3D.__tier);
                    Scene3D.__hitMs = (def.type === 'aoe' ? 250 : 200);
                    VClock.install();
                    Scene3D.skillCastBeat(Scene3D.__col, fx, Scene3D.__tier);              // 1박
                    Scene3D.__scene = fx === 'bolt' ? Scene3D.stormCloudGather([900, 901], Scene3D.__col, Scene3D.__tier) : null;
                    Scene3D.__fired = false; Scene3D.__hit = false;
                    Scene3D.__realUpdate = Scene3D.__realUpdate || Scene3D.update.bind(Scene3D);
                    Scene3D.update = () => { };
                } else {
                    VClock.pump(t);
                    if (!Scene3D.__fired && t >= Scene3D.__wait) {
                        Scene3D.__fired = true;
                        Scene3D.skillPayload(fx, Scene3D.__col, [900, 901], Scene3D.__tier, Scene3D.__scene);   // 2·3박
                        VClock.pump(t);
                    }
                    if (!Scene3D.__hit && t >= Scene3D.__hitMs) {
                        Scene3D.__hit = true;
                        const aoe = (Scene3D.__def || {}).type === 'aoe';
                        Scene3D.shake(aoe ? 0.3 : 0.2);
                        Scene3D.hitEnemy(900, 1e9 * 0.12, !aoe, 'skill', false);
                        if (aoe) Scene3D.hitEnemy(901, 1e9 * 0.12, false, 'skill', false);
                        VClock.pump(t);
                    }
                    Scene3D.__realUpdate(STEP / 1000);
                }
                Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
                if (times.indexOf(t) < 0) return null;                 // 목표 컷만 읽어 온다(느린 경로)
                const cv = document.querySelector('canvas');
                const off = document.createElement('canvas');
                off.width = r.width; off.height = r.height;
                off.getContext('2d').drawImage(cv, 0, 0, r.width, r.height);
                return off.toDataURL('image/png');
            }, { i, STEP, fx, times, r: rect });
            if (png) frames.push(png);
        }
        await page.evaluate(() => VClock.restore());
        const name = await page.evaluate(() => (Scene3D.__def || {}).name);
        shots.push({ fx, name, frames, times });
        console.log(`  ${name}(${fx}) — ${frames.length}컷 @ ${times.join('/')}ms`);
    }

    // 컨택트 시트 — 한 행에 스킬 2개(각 3컷). 세로는 영웅 화면 위치 기준 밴드만 잘라 쓴다.
    const sheet = await page.evaluate(async ({ shots, CW, CH, SPR }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const rows = Math.ceil(shots.length / SPR);
        const HEAD = 34;
        const c = document.createElement('canvas');
        c.width = CW * 3 * SPR; c.height = (CH + HEAD) * rows;
        const x = c.getContext('2d');
        x.fillStyle = '#0e0f12'; x.fillRect(0, 0, c.width, c.height);
        for (let s = 0; s < shots.length; s++) {
            const col = (s % SPR) * CW * 3, row = Math.floor(s / SPR) * (CH + HEAD);
            const sh = shots[s];
            x.fillStyle = '#1a1d22'; x.fillRect(col, row, CW * 3 - 4, HEAD - 4);
            x.font = 'bold 21px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(`${sh.name}  ·  ${sh.fx}`, col + 12, row + 24);
            for (let f = 0; f < sh.frames.length; f++) {
                const im = await load(sh.frames[f]);
                // 세로 밴드 — 캔버스 상단 하늘·하단 UI 여백을 잘라 액터가 크게 보이게.
                const sy = Math.round(im.height * 0.30), sHt = Math.round(im.height * 0.52);
                x.drawImage(im, 0, sy, im.width, sHt, col + f * CW, row + HEAD, CW, CH);
                x.font = 'bold 17px monospace';
                x.fillStyle = '#000'; x.fillText(`${sh.times[f]}ms`, col + f * CW + 9, row + HEAD + 23);
                x.fillStyle = '#7fff9f'; x.fillText(`${sh.times[f]}ms`, col + f * CW + 8, row + HEAD + 22);
                x.strokeStyle = '#2a2e35'; x.strokeRect(col + f * CW, row + HEAD, CW, CH);
            }
        }
        return c.toDataURL('image/png');
    }, { shots, CW, CH, SPR: SKILLS_PER_ROW });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`${OUT}  (${shots.length}종 × 3컷)  콘솔 에러 ${errors.length}건`);
    errors.slice(0, 8).forEach(e => console.log('  ' + e));
    await browser.close();
})();
