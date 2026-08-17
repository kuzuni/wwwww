// HP 타격감(쥬시니스) 채점용 연속 프레임 캡처 — 항목 '① HP 깎이는 연출 최대한 쥬시하게'
// 정지 스크린샷으로는 2단 바/히트스톱/아크가 안 읽히므로 **연속 프레임**을 뽑아 스트립으로 합성한다.
// 계측 원칙: 게임 코드는 손대지 않고, 캡처 세션에서만 ⓐ 연출 dt ⓑ CSS 애니메이션 ⓒ setTimeout 을
//            같은 배율(SLOW)로 함께 늦춘다 — 세 시계가 어긋나면 잔상바만 늦고 숫자는 먼저 사라진다.
// 사용: node shot-hpjuice.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.join(__dirname, 'hpjuice');
fs.mkdirSync(OUT, { recursive: true });

// 스크린샷 1장에 실시간 ≈0.9초가 드는 환경(swiftshader)이라 배율 하나로는 두 시간대를 다 못 잡는다:
//   MACRO — 2단 HP바(홀드 0.22 + 추격 0.2 ≈ 0.42초)를 한 스트립에 담는 배율
//   MICRO — 흰 플래시(0.1초)·스쿼시 펀치·히트스톱(0.055초) 같은 '한 박자' 연출을 프레임으로 쪼개는 배율
const MACRO = 6, MICRO = 24;
const VIEW = { width: 412, height: 915 };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: VIEW });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.filter(e => e.alive).length >= 1, null, { timeout: 20000 });
    await page.waitForTimeout(3000); // 적이 접근해 교전 거리에 들어오는 프레임까지

    // CSS 애니메이션(데미지 숫자 아크·비네트 페이드)도 같은 배율로 — CDP가 rAF와 별개인 애니메이션 시계를 쥔다
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / MACRO });

    await page.evaluate((SLOW) => {
        window.__slow = SLOW;
        // ⓐ 연출 dt만 늦춘다 (Combat 틱은 setInterval이라 전투 진행 속도는 그대로 — 히트스톱 검증과 같은 전제)
        // MICRO 패스는 실시간 rAF에 의존하지 않는다 — 스크린샷 1장에 0.85초가 걸리는 환경에서
        // 배율만 키우면 rAF가 굶어 연출시계가 프레임당 0.002초밖에 안 흘러 같은 그림이 16장 나온다.
        // 그래서 수동 스텝(__step)으로 dt를 정확히 먹인다. update()는 끝에서 renderFrame()까지 하므로
        // 스텝 한 번이 곧 한 프레임이다.
        const up = Scene3D.update.bind(Scene3D);
        window.__manual = false;
        Scene3D.update = dt => { if (!window.__manual) up(dt / window.__slow); };
        window.__step = dt => up(dt);
        // ⓑ 플래시 해제(80ms)·데미지 숫자 제거(900ms) 같은 setTimeout도 같이 늦춰야 프레임에 남는다
        const st = window.setTimeout;
        window.setTimeout = (fn, ms, ...a) => st(fn, (ms || 0) * window.__slow, ...a);
        window.__st = st;         // 캡처 스크립트가 '늘어나지 않은' 원본 타이머를 쓸 때

        // ⓒ 잔상바 홀드/추격도 같은 배율 (dt가 이미 늦으므로 값 자체는 그대로 두고 배율만 검증용으로 확인)
        // 전투 로직 정지 — 연출만 흐르게 한다. 이걸 안 하면 캡처 중 적이 죽고 새로 스폰돼
        // 프레임마다 다른 적을 재는 사고가 난다(1차 시도에서 실제로 발생).
        window.__freeze = () => { if (!Combat.__origTick) Combat.__origTick = Combat.tick; Combat.tick = () => { }; };
        window.__target = null;   // 잴 적을 하나로 고정
        window.__hp = () => {
            const e = window.__target ? Combat.enemies.find(x => x.id === window.__target) : Combat.enemies.find(x => x.alive);
            const m = e && Scene3D.enemyMap.get(e.id);
            return {
                clock: +Scene3D._clock.toFixed(3),
                barY: (() => { // 머리 위 바의 화면 y — 크롭이 바를 자르지 않는지 확인용
                    if (!m || !m.hpBg) return null;
                    m.hpBg.updateWorldMatrix(true, false);
                    const wp = new THREE.Vector3().setFromMatrixPosition(m.hpBg.matrixWorld);
                    return +Scene3D.project(wp).y.toFixed(0);
                })(),
                fg: m && m.hpFg ? +m.hpFg.scale.x.toFixed(3) : null,
                ghost: m && m.hpGhost ? +m.hpGhost.scale.x.toFixed(3) : null,
                heroFg: Scene3D._heroBar && Scene3D._heroBar.hpFg ? +Scene3D._heroBar.hpFg.scale.x.toFixed(3) : null,
                heroGhost: Scene3D._heroBar && Scene3D._heroBar.hpGhost ? +Scene3D._heroBar.hpGhost.scale.x.toFixed(3) : null,
                vig: (() => { const v = document.getElementById('dmg-flash'); return v ? v.style.getPropertyValue('--vig').trim() : null; })(),
                vigOn: (() => { const v = document.getElementById('dmg-flash'); return v ? v.classList.contains('on') : null; })(),
                hitStop: +(Scene3D._hitStop || 0).toFixed(3)
            };
        };
    }, MACRO);

    // 배율 전환 — rAF(연출 dt)·CSS 애니메이션·setTimeout 세 시계를 항상 같이 돌린다
    const setSlow = async (n) => {
        await page.evaluate(n => { window.__slow = n; }, n);
        await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / n });
    };

    // 적 머리 위 바는 기본 카메라에서 폭 32px뿐이라 2단 바 판독이 불가능하다(실측).
    // camLock(검증용 고정 훅)으로 당겨 ≈78px까지 키운다 — 더 당기면(z=2.6, 102px) 적이 프레임을 벗어난다.
    const lockNear = async () => page.evaluate(() => {
        const e = Combat.enemies.find(x => x.id === window.__target) || Combat.enemies.find(x => x.alive);
        const m = e && Scene3D.enemyMap.get(e.id);
        const cx = m ? m.g.position.x : 0;
        Scene3D.camLock = {
            pos: new THREE.Vector3(cx - 0.7, 1.8, 3.5),
            look: new THREE.Vector3(cx, 1.1, 0)
        };
    });

    // onFrame(i): 프레임 사이에 Node가 직접 타격을 넣는다 — 페이지 타이머로 연타를 만들면
    // 스크린샷 지연과 어긋나 첫 프레임 전에 다 끝나버린다(2차 시도에서 실제로 발생).
    const shoot = async (tag, n, gap, crop, onFrame) => {
        const log = [];
        const t0 = Date.now();
        for (let i = 0; i < n; i++) {
            if (onFrame) await onFrame(i);
            const opt = { path: `${OUT}/${tag}-${String(i).padStart(2, '0')}.png` };
            if (crop) opt.clip = crop;
            await page.screenshot(opt);
            const row = await page.evaluate(() => window.__hp());
            row.ms = Date.now() - t0;   // 실측 경과(실시간) — 연출시계(clock)와 비교해 히트스톱/슬로우 확인
            log.push(row);
            if (gap) await page.waitForTimeout(gap);
        }
        fs.writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(log, null, 1));
        return log;
    };

    // 머리 위 바 실측 화면 y = 148~216, 데미지 숫자는 그보다 더 위로 솟는다 → 위쪽 여유를 충분히 둔다
    // (y=150에서 자르면 바가 크롭 경계에 걸려 잘린다 — 1차 스트립에서 실제로 잘렸다)
    const CROP_ENEMY = { x: 0, y: 105, width: 412, height: 340 };

    // ── A. 크리티컬 피격: 흰 플래시 → 스쿼시 펀치 → 히트스톱 → 잔상바 추격 → 크리 숫자 아크
    const pick = await page.evaluate(() => {
        window.__freeze();
        // 타깃 선정 주의: 프리즈 직전 사망 연출에 들어간 적을 잡으면 killEnemy가 이미
        // hpBg.parent.visible=false 로 바를 숨겨버려 스트립에 바가 아예 안 나온다(1차 스트립에서 실제로 발생).
        // 그래서 ⓐ 살아있고 ⓑ 바 그룹이 살아있고 ⓒ 체력이 거의 만피인 적만 고른다.
        const cand = Combat.enemies.filter(e => {
            const m = Scene3D.enemyMap.get(e.id);
            if (!e.alive || !m || !m.hpBg || !m.hpBg.parent) return false;
            return m.hpBg.parent.visible && Big.of(e.hp).ratioTo(e.maxHp) > 0.9;
        });
        const e = cand[0] || Combat.enemies.find(x => x.alive);
        window.__target = e.id;
        const m = Scene3D.enemyMap.get(e.id);
        if (m && m.hpBg && m.hpBg.parent) m.hpBg.parent.visible = true;
        window.__hit = (ratioLeft, loss, crit) => {
            const t = Combat.enemies.find(x => x.id === window.__target);
            t.hp = Big.of(t.maxHp).mul(ratioLeft);
            Scene3D.hitEnemy(t.id, Big.of(t.maxHp).mul(loss), !!crit, 'normal');
        };
        return { kind: e.kind || e.type || '?', hpRatio: +Big.of(e.hp).ratioTo(e.maxHp).toFixed(2), cand: cand.length };
    });
    console.log('target: ' + JSON.stringify(pick));
    await lockNear();
    await page.waitForTimeout(400);
    // A0. 크리티컬 '한 박자' — 흰 플래시(0.1s)/스쿼시 펀치(0.22s)/히트스톱(0.055s)을 수동 스텝으로 쪼갠다.
    // 스텝 0.012초 × 16 = 연출 0.19초 구간. 히트스톱이 dt를 0.12배로 누르므로 실제 진행은 더 느리다(그게 연출).
    await setSlow(MICRO);
    await page.evaluate(() => { window.__manual = true; });
    const A0 = await shoot('A0-impact', 16, 0, CROP_ENEMY, i => page.evaluate(first => {
        if (first) window.__hit(0.62, 0.38, true);
        window.__step(0.012);
    }, i === 0));
    await page.evaluate(() => { window.__manual = false; });

    // A. 같은 타격을 2단 바 시간대로 다시 (MACRO) — 프레임 0이 곧 타격 프레임
    await setSlow(MACRO);
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__hit(1, 0.0001, false)); // 바 원복
    await page.waitForTimeout(2500);
    const A = await shoot('A-crit', 20, 105, CROP_ENEMY,
        i => i === 0 ? page.evaluate(() => window.__hit(0.62, 0.38, true)) : null);

    // ── B. 일반 연타 3회: 잔상 구간이 중첩돼도 큐가 안 깨지는지 + 위계(흰/노랑 vs 주황)
    await page.waitForTimeout(2500); // 앞 연출이 완전히 가라앉은 뒤
    await page.evaluate(() => { window.__hit(0.55, 0.0001, false); });
    const HITS = { 0: [0.45, 0.1], 4: [0.35, 0.1], 8: [0.25, 0.1] }; // 프레임 간격 ≈ 연출 0.04초
    const B = await shoot('B-combo', 18, 105, CROP_ENEMY,
        i => HITS[i] ? page.evaluate(h => window.__hit(h[0], h[1], false), HITS[i]) : null);

    // ── C. 처치 버스트: 스파크 2색 + 충격 링 + 사망 모션 진입
    await page.waitForTimeout(2500);
    await setSlow(MICRO);
    await page.evaluate(() => { window.__manual = true; });
    const C = await shoot('C-kill', 18, 0, CROP_ENEMY, i => page.evaluate(first => {
        if (first) {
            const e = Combat.enemies.find(x => x.id === window.__target);
            e.hp = Big.of(0);
            Scene3D.killEnemy(e.id, false);
            e.alive = false;
        }
        window.__step(0.022); // 처치 연출은 1.05초짜리 — 스파크 확산·링·쓰러짐 진입까지 보려면 스텝을 크게
    }, i === 0));
    await page.evaluate(() => { window.__manual = false; });

    // ── D. 영웅 피격: 2단 바 + 붉은 비네트 (비네트는 화면 가장자리라 풀 뷰포트로)
    await page.evaluate(() => { Scene3D.camLock = null; });
    await setSlow(MACRO);
    await page.waitForTimeout(900);
    const D = await shoot('D-hero', 18, 105, null, i => i === 0 ? page.evaluate(() => {
        Combat.hero.hp = Big.of(Combat.hero.maxHp).mul(0.42);
        Scene3D.heroHit(Big.of(Combat.hero.maxHp).mul(0.33));
    }) : null);

    const summary = {
        A0_impact: { ms: A0.map(f => f.ms), clock: A0.map(f => f.clock), fg: A0.map(f => f.fg), ghost: A0.map(f => f.ghost), hitStop: A0.map(f => f.hitStop) },
        A_crit: { ms: A.map(f => f.ms), clock: A.map(f => f.clock), fg: A.map(f => f.fg), ghost: A.map(f => f.ghost), hitStop: A.map(f => f.hitStop) },
        B_combo: { ms: B.map(f => f.ms), clock: B.map(f => f.clock), fg: B.map(f => f.fg), ghost: B.map(f => f.ghost) },
        D_hero: { ms: D.map(f => f.ms), clock: D.map(f => f.clock), fg: D.map(f => f.heroFg), ghost: D.map(f => f.heroGhost), vig: D.map(f => f.vig), vigOn: D.map(f => f.vigOn) },
        errors
    };
    fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
    console.log(JSON.stringify(summary, null, 1));
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
})();
