// 스킬 액터 시퀀스 시트 — 12종 × 3프레임(등장 → 타격 → 퇴장)을 결정론적으로 찍는다.
//   (slug: skill-fx-minecraft-actors, 2026-08-21)
// 사용: node shot-skillfx-actors.js [출력경로]   기본 tools/skillfx-actors.png
//
// 무엇을 보는 시트인가 — "무슨 색이 번쩍였나"가 아니라 **무엇이 나와서 무엇을 했나**를 본다.
// 한 행이 스킬 하나(등장·타격·퇴장 3컷)이고, 행 머리에 **무엇이 등장하는지** 한 줄로 적는다.
//
// 🚨 1차 시트가 판독 불가로 반려된 이유 3가지와 그 처방(2026-08-21, 코디네이터 지적):
//   ⓐ **프레임이 멀어 소환물이 몇 픽셀이었다.** 게임 카메라는 지면 밴드를 8.5유닛 밖에서 잡는다.
//      → 촬영 동안 **카메라를 액터에 맞춰 당긴다**(스킬마다 거리·주시 높이가 다르다: 하늘에서
//      떨어지는 골렘과 발밑에서 솟는 와이번은 같은 앵글로 둘 다 담기지 않는다).
//      ⚠️ 게임 리그는 매 프레임 `CAM_POS` 로 카메라를 되돌리므로, **`update` 뒤·`render` 앞**에
//         덮어써야 한다. 앞에서 세우면 그 프레임에 통째로 무시된다.
//   ⓑ **하얗게 날아갔다.** ACES 노출 1.08 + 흰 불티 + 밝은 하늘이 겹쳐 셀이 백색이 됐다.
//      → 촬영 동안만 `toneMappingExposure` 를 낮춘다(연출 코드는 손대지 않는다).
//   ⓒ **빈 칸이 있었다.** 목표 시각을 `times.indexOf(t)` 로 정확히 맞춰 골랐는데 135ms 같은
//      값은 프레임 격자(20ms)에 없어 **한 컷도 안 찍혔다.** → 목표 시각을 격자에 스냅한다.
//
// ⚠️ 결정론 — 소프트웨어 GL 이라 실시간 촬영은 420ms 에 1~3프레임밖에 안 돈다. rAF 를 끊고
//    `Scene3D.update(dt)` 를 고정 dt 로 몰고, `setTimeout` 은 `VClock` 으로 가상 시각에 묶는다.
// ⚠️ 피해 반응(플린치·히트플래시)은 `Combat.tick` 을 끊어 두면 한 번도 안 들어온다. 실게임과
//    같은 시각(단일 0.20초 / 광역 0.25초)에 `hitEnemy`+`shake` 를 직접 태운다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const OUT = process.argv[2] || path.resolve(__dirname, 'skillfx-actors.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// fx → { 결정적 타격 시각(ms) · 등장물 한 줄 · 촬영 카메라(거리 d · 주시 높이 ly) }
//   타격 시각은 무게 층 동기 상수(`*_IMPACT_MS`)와 안무에서 온 값이다.
const SPEC = {
    slash: { imp: 300, who: '검사 로봇 2기 — 좌우에서 교차 참격', d: 4.7, ly: 1.0 },
    ring: { imp: 320, who: '표창 10개 — 영웅을 감아 돌다 적에게', d: 4.5, ly: 1.1 },
    beam: { imp: 300, who: '궁수 자동인형 3기 — 땅에서 솟아 연사', d: 4.8, ly: 1.1 },
    explode: { imp: 430, who: '임프 — 불덩이 블록 투척', d: 4.0, ly: 1.2 },
    meteor: { imp: 560, who: '바위 골렘 — 하늘에서 낙하 내려찍기', d: 5.4, ly: 1.7 },
    bolt: { imp: 400, who: '번개새 — 선회하다 급강하 낙뢰', d: 5.4, ly: 1.9 },
    breath: { imp: 470, who: '와이번 — 땅을 뚫고 솟아 물기', d: 6.2, ly: 1.6 },
    dragonfire: { imp: 820, who: '화룡 — 날아와 브레스', d: 7.2, ly: 2.0, fxOff: -1.3 },
    guillotine: { imp: 430, who: '처형인 — 거대 도끼 내려찍기', d: 5.2, ly: 1.6 },
    nova: { imp: 560, who: '성좌 로봇 — 강림 후 자폭', d: 5.2, ly: 1.5 },
    voidrift: { imp: 540, who: '공허 기사 — 균열에서 솟아 관통', d: 4.6, ly: 1.2 },
    wardshield: { imp: 420, who: '방패 골렘 — 영웅 앞에 방패를 세움', d: 4.6, ly: 1.2 },
};
const ORDER = ['slash', 'ring', 'beam', 'explode', 'meteor', 'bolt', 'breath', 'dragonfire',
    'guillotine', 'nova', 'voidrift', 'wardshield'];
const STEP = 20;                      // 가상 프레임 간격
const CW = 430, CH = 380;             // 시트 셀 크기
const EXPOSURE = 0.80;                // 촬영 전용 노출(연출 코드는 안 건드린다)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(VCLOCK_SRC);
    await page.evaluate((exp) => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview',
            '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        Combat.tick = () => { };
        Scene3D.walking = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.heroAttack = () => { };
        Scene3D.renderer.toneMappingExposure = exp;              // ⓑ 촬영 노출
        if (typeof SKILLFX_MODELS !== 'undefined') for (const id of Object.keys(SKILLFX_MODELS)) Scene3D.fxActorProto(id);
    }, EXPOSURE);
    await page.waitForTimeout(2500);
    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });

    const shots = [];
    for (const fx of ORDER) {
        const S = SPEC[fx];
        // ⓒ 목표 시각을 프레임 격자에 스냅 — 안 하면 그 컷이 통째로 안 찍힌다(1차 시트의 빈 칸).
        const snap = (ms) => Math.round(ms / STEP) * STEP;
        const times = [snap(S.imp * 0.42), snap(S.imp), snap(S.imp + 340)];
        await page.evaluate(() => {
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) { } }
            Scene3D.anims = [];
            Scene3D.clearEnemies();
            Combat.enemies = [];
            for (let i = 0; i < 2; i++) {
                const e = { id: 900 + i, x: Combat.MELEE_X + 0.85 + i * 1.2, alive: true, hp: 1e9, maxHp: 1e9 };
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
            const png = await page.evaluate(({ i, STEP, fx, times, cam }) => {
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
                // ⓐ 촬영 카메라 — 게임 리그가 매 프레임 되돌린 뒤 **여기서** 덮어쓴다.
                //    영웅과 적 사이를 주시점으로 잡아 '누가 누구를 때렸는지'가 한 컷에 들어오게.
                const hx = Scene3D.heroG.position.x;
                const ex = (Scene3D.enemyMap.get(900) || { g: { position: { x: hx + 2 } } }).g.position.x;
                const fxx = (hx + ex) / 2 + 0.25 + (cam.fxOff || 0);
                Scene3D.camera.position.set(fxx + 0.15, cam.ly + cam.d * 0.40, cam.d);
                Scene3D.camera.lookAt(fxx, cam.ly, 0);
                Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
                if (times.indexOf(t) < 0) return null;                 // 목표 컷만 읽어 온다(느린 경로)
                const cv = document.querySelector('canvas');
                const off = document.createElement('canvas');
                off.width = cv.width; off.height = cv.height;
                off.getContext('2d').drawImage(cv, 0, 0);
                return off.toDataURL('image/png');
            }, { i, STEP, fx, times, cam: { d: S.d, ly: S.ly, fxOff: S.fxOff } });
            if (png) frames.push(png);
        }
        await page.evaluate(() => VClock.restore());
        const name = await page.evaluate(() => (Scene3D.__def || {}).name);
        shots.push({ fx, name, who: S.who, frames, times });
        console.log(`  ${name}(${fx}) — ${frames.length}컷 @ ${times.join('/')}ms`);
    }
    void rect;

    // 컨택트 시트 — 한 행이 스킬 하나. 행 머리에 이름 + **무엇이 등장하는지** 한 줄.
    const sheet = await page.evaluate(async ({ shots, CW, CH }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const HEAD = 40;
        const c = document.createElement('canvas');
        c.width = CW * 3; c.height = (CH + HEAD) * shots.length;
        const x = c.getContext('2d');
        x.fillStyle = '#0e0f12'; x.fillRect(0, 0, c.width, c.height);
        const CAP = ['① 등장', '② 타격', '③ 퇴장'];
        for (let s = 0; s < shots.length; s++) {
            const row = s * (CH + HEAD), sh = shots[s];
            x.fillStyle = '#191c21'; x.fillRect(0, row, c.width - 2, HEAD - 3);
            x.font = 'bold 23px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(`${sh.name}`, 14, row + 28);
            x.font = '20px sans-serif'; x.fillStyle = '#cfe8ff';
            x.fillText(`— ${sh.who}`, 24 + x.measureText(sh.name).width + 40, row + 28);
            for (let f = 0; f < sh.frames.length; f++) {
                const im = await load(sh.frames[f]);
                // 세로 밴드만 — 게임 캔버스는 세로로 긴 모바일 비율이라 그대로 넣으면 셀 안에서
                // 액터가 다시 작아진다. 촬영 카메라가 액션을 중앙에 두므로 중앙 56% 만 쓴다.
                const sy = Math.round(im.height * 0.15), sHt = Math.round(im.height * 0.60);
                x.drawImage(im, 0, sy, im.width, sHt, f * CW, row + HEAD, CW, CH);
                x.font = 'bold 18px monospace';
                const lab = `${CAP[f] || ''}  ${sh.times[f]}ms`;
                x.fillStyle = '#000'; x.fillText(lab, f * CW + 11, row + HEAD + 25);
                x.fillStyle = '#7fff9f'; x.fillText(lab, f * CW + 10, row + HEAD + 24);
                x.strokeStyle = '#2a2e35'; x.strokeRect(f * CW, row + HEAD, CW, CH);
            }
        }
        return c.toDataURL('image/png');
    }, { shots, CW, CH });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`${OUT}  (${shots.length}종 × 3컷)  콘솔 에러 ${errors.length}건`);
    errors.slice(0, 8).forEach(e => console.log('  ' + e));
    await browser.close();
})();
