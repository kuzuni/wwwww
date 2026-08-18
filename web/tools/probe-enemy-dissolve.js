// 적 사망 디졸브가 **원래 반투명이던 재질을 불투명으로 튀기지 않는지** 실측 — enemy-quality ⓐ 부수 수정
// 사용: node probe-enemy-dissolve.js [kind...]
//
// 무엇이 문제였나: killEnemy 는 시체를 녹이려고 매 프레임 `mat.opacity = 1 - f` 를 **모든 재질에** 걸었다.
// 그런데 슬라임 젤리(0.82)·박쥐 막날개(0.76)처럼 원래 반투명인 재질까지 f=0 에서 opacity 1 로 덮어써서,
// 쓰러지기 직전 한 프레임에 **불투명으로 팍 튀었다**. 접촉 AO 링(0.78)을 얹으면 그게 '검은 고리가 켜지는'
// 것으로 보인다. 이제는 재질별 원래 불투명도(userData.dissolveBase)에 곱한다.
//
// 재는 것: 종별로 ① 사망 직후(f≈0) 각 재질의 opacity 가 **원래 값 이하**인가(초과 = 튐)
//          ② 디졸브 끝에서 0 으로 수렴하는가 ③ 콘솔 에러
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

        const r = await page.evaluate(async () => {
            Combat.tick = () => { };
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            // 사망 전 스냅샷: 재질별 원래 불투명도 (transparent 인 것만 의미가 있다)
            const before = [];
            m.g.traverse(o => {
                if (!o.isMesh || !o.material) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => before.push({ mt, base: mt.transparent ? mt.opacity : 1 }));
            });
            const semi = before.filter(b => b.base < 0.999).length;
            e.alive = false;
            Scene3D.anims = [];              // 기존 연출을 비우고 사망 클립만 남긴다
            Scene3D.killEnemy(999, false);
            // ⚠️ 실시간 rAF 로 재면 안 된다 — 소프트웨어 GL 이라 420ms 에 1~3프레임밖에 안 돌아
            //    디졸브 구간에 진입도 못 하고 '초과 0'이 공짜로 나온다(초판이 이 함정에 걸렸다).
            //    addAnim 이 남긴 클립 함수를 k 로 직접 몰아 결정론적으로 훑는다(shot-enemies 가 쓰는 방식).
            // ⚠️ killEnemy 는 클립을 **여러 개** 남긴다(HP바 드레인이 먼저, 몸통 사망 클립이 나중).
            //    첫 번째만 몰면 바만 움직이고 디졸브는 손도 안 대 '초과 0 / 종료 opacity 1'이 공짜로 나온다.
            const clips = Scene3D.anims.filter(a => a.fn);
            if (!clips.length) return { err: 'killEnemy 가 애니메이션 클립을 남기지 않았다' };
            let worst = 0, worstBase = 1, sampled = 0;
            for (let i = 0; i <= 100; i++) {
                clips.forEach(c => { try { c.fn(i / 100); } catch (err) { } });
                sampled++;
                for (const b of before) {
                    const over = b.mt.opacity - b.base;
                    if (over > worst) { worst = over; worstBase = b.base; }
                }
            }
            clips.forEach(c => { try { c.fn(1); } catch (err) { } });
            const maxEnd = before.reduce((a, b) => Math.max(a, b.mt.opacity), 0);
            return { total: before.length, semi, clips: clips.length, worst: +worst.toFixed(3), worstBase: +worstBase.toFixed(2), sampled, maxEnd: +maxEnd.toFixed(3) };
        });

        // 튐 허용치 0.02 — k 격자가 101칸이라 f 가 정확히 0 인 순간을 못 짚을 수 있어 미세 오차만 봐준다
        // 표본이 101 미만이면 클립을 못 몬 것이므로 그 자체가 실패다(공짜 PASS 방지)
        const ok = !r.err && r.sampled === 101 && r.worst <= 0.02 && r.maxEnd <= 0.02 && !errors.length;
        if (!ok) fail++;
        if (r.err) { console.log(`FAIL ${kind.padEnd(9)} ${r.err}`); await page.close(); continue; }
        console.log(`${ok ? 'PASS' : 'FAIL'} ${kind.padEnd(9)} 재질 ${r.total}개(반투명 ${r.semi}개)` +
            ` · 디졸브 초반 원래값 초과 최대 +${r.worst}${r.worst > 0.02 ? `(원래 ${r.worstBase})` : ''}` +
            ` · 종료 시 최대 opacity ${r.maxEnd} · 클립 ${r.clips}개 × 표본 ${r.sampled}컷` +
            (errors.length ? ' · CONSOLE ERRORS: ' + errors.join(' | ') : ''));
        await page.close();
    }
    await browser.close();
    console.log(fail ? `\n${fail}종 FAIL` : '\n전 종 PASS');
    process.exit(fail ? 1 : 0);
})();
