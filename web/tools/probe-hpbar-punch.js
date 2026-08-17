// HP바 세로 펀치 실측 — 3차 지적 ① 잔여분 '바 고유 리액션 scaleY 1.0→1.18→1.0(120ms)'.
// 사용: node probe-hpbar-punch.js
// 확인: ① 임팩트 **프레임**에서 최대(뒤늦게 커지면 위계가 시간을 거스른다)
//       ② 120ms 안에 1.0 복귀 ③ **채움 폭(scale.x)은 불변** — 폭이 곧 남은 체력이라 늘리면 수치가 거짓말
//       ④ 영웅 바에도 같이 걸리는지
// ⚠️ 기준값은 라이브 hpG.scale.y가 아니라 driveHpBar가 저장한 barBase를 쓴다(라이브 값은 펀치 도중일 수 있다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle','--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
        Scene3D.update = function () { };   // 라이브 루프 정지 — 안 멈추면 측정 중에도 펀치가 흐른다
        Combat.tick = function () { };
        const id = Combat.enemies.filter(e => e.alive).map(e => e.id).find(i => Scene3D.enemyMap.has(i));
        const m = Scene3D.enemyMap.get(id);
        // 기준은 라이브 scale.y가 아니라 **driveHpBar가 저장해 둔 barBase** (라이브 값은 펀치 도중일 수 있다)
        const base = m.barBase !== undefined ? m.barBase : m.hpG.scale.y;
        const rows = [];
        const snap = t => rows.push({ t, scaleY: +(m.hpG.scale.y / base).toFixed(4), fgX: +m.hpFg.scale.x.toFixed(4) });
        snap(0);
        Scene3D.hitHpBar(m, 0.3);
        Scene3D.driveHpBar(m, 0.6, 0);      // 임팩트 프레임
        snap(0);
        let acc = 0;
        for (let i = 0; i < 12; i++) { Scene3D.driveHpBar(m, 0.6, 1 / 60); acc += 1000 / 60; snap(Math.round(acc)); }
        // 영웅 바에도 걸리는지
        Scene3D.hitHpBar(Scene3D.heroBar, 0.3);
        Scene3D.driveHpBar(Scene3D.heroBar, 0.6, 0);
        const heroPunch = +(Scene3D.heroHpG.scale.y).toFixed(4);
        return { base: +base.toFixed(3), baseScale: +(m.baseScale||1).toFixed(3), gScale: +m.g.scale.x.toFixed(3), rows, heroPunch };
    });
    console.log('적 바 barBase =', r.base, '/ m.baseScale =', r.baseScale, '/ g.scale.x =', r.gScale);
    r.rows.forEach(x => console.log('  t=' + String(x.t).padStart(4) + 'ms  scaleY×' + x.scaleY + '  채움폭 ' + x.fgX));
    const peak = Math.max(...r.rows.map(x => x.scaleY));
    const end = r.rows[r.rows.length - 1].scaleY;
    // 첫 행은 **피격 전** 상태(그때의 남은 체력)라 비교에서 뺀다 — 넣으면 늘 '변함'으로 나온다
    const widths = new Set(r.rows.slice(1).map(x => x.fgX));
    console.log('\n최대 scaleY 배율:', peak, peak > 1.15 && peak < 1.2 ? 'OK (≈1.18)' : 'NG');
    console.log('200ms 후 복귀:', end, Math.abs(end - 1) < 0.001 ? 'OK (1.0)' : 'NG');
    console.log('채움 폭 불변:', widths.size === 1 ? 'OK (' + [...widths][0] + ' 고정)' : 'NG 변함 ' + [...widths]);
    console.log('영웅 바 펀치 scale.y:', r.heroPunch, r.heroPunch > 1.15 ? 'OK' : 'NG');
    console.log('콘솔 에러:', errs.length);
    await b.close();
})();
