// 스킬 연출의 층이 '예약한 시각에 실제로 발화하는가'를 재는 자 (slug: skill-fx)
// 사용: node probe-skillfx-timeline.js [스킬id|fx ...]     (기본: 대표 6종)
//       node probe-skillfx-timeline.js --selftest          (음성 대조 — 반드시 FAIL 이 나야 한다)
//
// 왜 필요한가 — `shot-skillfx-seq.js` 는 rAF 를 끊고 `Scene3D.update(dt)` 를 고정 dt 로 몰아
// **가상 시각**으로 찍는데, 연출 층 상당수는 `setTimeout`(= **벽시계**)으로 예약돼 있다.
// 한 프레임 촬영에 실제로 ~800ms 가 걸리므로 560ms 짜리 예약이 **가상 30ms 프레임에서**
// 이미 터진다 — 컨택트 시트의 '언제'가 통째로 앞으로 쏠린다. 그 시트로 3박자를 채점하면
// 코드가 아니라 촬영기를 채점하는 셈이다(저장소 함정 ④ '자가 코드보다 낡으면 판정 무효').
//
// 판정: 예약 지연이 한 프레임(30ms)을 넘는 층은 **가상 시각으로도 그만큼 뒤에** 발화해야 한다.
//       한 건이라도 먼저 터지면 exit 1.
// 음성 대조: `--selftest` 는 심을 끄고 프레임마다 벽시계를 200ms 씩 태운다(촬영기의 느린 프레임을
//       재현). 그때는 반드시 불통과가 나와야 이 자가 눈금이 살아 있는 것이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const SELFTEST = process.argv.includes('--selftest');
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('-'));
const SKILLS = ARGS.length ? ARGS : ['supernova', 'execution', 'godspear', 'lightning', 'fireball', 'meteor'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STEP_MS = 30, N = 31;          // 0~900ms
const SLOW_FRAME_MS = 200;           // --selftest 에서 한 프레임이 잡아먹는 벽시계(촬영기 재현)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(VCLOCK_SRC);

    let bad = 0, totalGraded = 0;
    for (const id of SKILLS) {
        const res = await page.evaluate(async ({ ARG, STEP_MS, N, SELFTEST, SLOW_FRAME_MS }) => {
            Combat.tick = () => { };
            Scene3D.walking = false;
            Scene3D.heroAttack = () => { };
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.9, alive: true, hp: 1e9, maxHp: 1e9 };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            m.g.position.x = e.x + Scene3D.worldX; m.g.position.y = 0; m.g.userData.landed = true;
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
            Scene3D.anims = [];
            const realUpdate = Scene3D.update.bind(Scene3D);

            const def = SKILL_DEFS.find(d => d.id === ARG) || SKILL_DEFS.find(d => d.fx === ARG);
            if (!def) return { err: 'no such skill/fx: ' + ARG };
            const tier = Scene3D.skillTier(def);
            const col = new THREE.Color(def.color);
            const wait = Scene3D.castMsFor(def.fx, tier);

            // 음성 대조: 심 없이, 프레임마다 벽시계를 태워 촬영기의 느린 프레임을 재현한다.
            const log = [];
            let vnow = 0;
            if (SELFTEST) {
                const realST = window.setTimeout.bind(window);
                window.setTimeout = function (fn, ms) {
                    const d = Number(ms) || 0;
                    return realST(() => { log.push({ delay: d, firedAt: vnow }); try { fn(); } catch (err) { } }, d);
                };
                var restoreST = () => { window.setTimeout = realST; };
            } else {
                VClock.install();
            }

            Scene3D.skillCastBeat(col, def.fx, tier);
            let fired = false;
            for (let i = 1; i < N; i++) {
                vnow = i * STEP_MS;
                if (!SELFTEST) VClock.pump(vnow);
                if (!fired && vnow >= wait) {
                    fired = true;
                    Scene3D.skillPayload(def.fx, col, [999], tier);
                    if (!SELFTEST) VClock.pump(vnow);
                }
                realUpdate(STEP_MS / 1000);
                if (SELFTEST) await new Promise(r => setTimeout(r, SLOW_FRAME_MS));   // 벽시계를 태운다
            }
            const out = { name: def.name, fx: def.fx, tier, wait, log: SELFTEST ? log : VClock.log.slice(), pending: SELFTEST ? 0 : VClock.pending() };
            if (SELFTEST) restoreST(); else VClock.restore();
            return out;
        }, { ARG: id, STEP_MS, N, SELFTEST, SLOW_FRAME_MS });

        if (res.err) { console.log('ERR ' + res.err); await browser.close(); process.exit(2); }
        // 예약 지연이 한 스텝 이하인 것은 스텝 해상도 안이라 판정 대상이 아니다
        const graded = res.log.filter(l => l.delay > STEP_MS);
        // 예약 시각(at)을 아는 심 경로는 정확히 (at+delay) 와 비교하고,
        // 모르는 음성 대조 경로는 0 시점 예약으로 보아 delay 자체를 하한으로 쓴다.
        let skBad = 0;
        for (const l of graded) {
            const due = (l.at || 0) + l.delay;
            if (l.firedAt < due - STEP_MS) skBad++;
        }
        totalGraded += graded.length; bad += skBad;
        const worst = graded.reduce((w, l) => {
            const d = l.firedAt - ((l.at || 0) + l.delay);
            return d < w ? d : w;
        }, 0);
        console.log(`${skBad ? '❌' : '✅'} ${res.name}/${res.fx} 단계${res.tier} · 판정대상 예약 ${graded.length}건 · 어긋남 ${skBad}건 · 최악 ${worst}ms${res.pending ? ` · 미발화 ${res.pending}건(잔광/정리)` : ''}`);
        for (const l of graded.filter(l => l.firedAt < (l.at || 0) + l.delay - STEP_MS).slice(0, 6))
            console.log(`     예약 ${l.delay}ms(가상 ${l.at || 0}ms 에 걸림) → 가상 ${l.firedAt}ms 에 발화  (${l.firedAt - ((l.at || 0) + l.delay)}ms 이르다)`);
    }

    await browser.close();
    if (errors.length) { console.log('콘솔 에러 ' + errors.length + '건: ' + errors[0]); process.exit(2); }
    if (!totalGraded) { console.log('판정 대상 예약이 0건 — 자가 아무것도 못 재고 있다(고장 의심).'); process.exit(2); }
    if (bad) { console.log(`\n불통과: ${bad}/${totalGraded} 건이 예약 시각보다 먼저 터졌다 — 촬영기의 가상 시각과 코드의 벽시계가 어긋난다.`); process.exit(1); }
    console.log(`\n통과: 판정 대상 ${totalGraded}건이 전부 예약 시각 이후에 발화했다.`);
})();
