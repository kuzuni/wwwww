// HP바 간격이 덩치와 무관하게 일정한지 실측 — 일반 적 7종 + 보스. 사용: node tools/probe-bar-gap.js
// 종료코드 0 = 일반 적 간격 편차 0.01 미만 + 콘솔 에러 없음
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 430, height: 860 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
        Scene3D.update = () => {}; Combat.tick = () => {};
        const out = [];
        const kinds = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
        let id = 700;
        for (const k of kinds.concat(['golem'])) {
            const boss = k === 'golem' && out.length === kinds.length;
            const e = { id: id++, x: -0.5, alive: true, hp: Big.of(100), maxHp: Big.of(100), kind: k, isBoss: boss };
            const m = Scene3D.monsterMesh(e);
            const head = m.topY * m.baseScale;          // 머리 실높이
            const bar = m.barY * m.baseScale;           // 바 월드 높이
            out.push({ kind: k + (boss ? '(보스)' : ''), scale: +m.baseScale.toFixed(2), head: +head.toFixed(3), bar: +bar.toFixed(3), gap: +(bar - head).toFixed(3) });
        }
        return out;
    });
    const gaps = r.map(x => x.gap);
    r.forEach(x => console.log(`  ${x.kind.padEnd(14)} 배율 ${String(x.scale).padEnd(5)} 머리 ${x.head}  바 ${x.bar}  간격 ${x.gap}`));
    const norm = r.filter(x => !/보스/.test(x.kind)).map(x => x.gap);
    const spread = Math.max(...norm) - Math.min(...norm);
    console.log(`\n  일반 적 간격 편차 ${spread.toFixed(4)} (0에 가까울수록 종과 무관하게 일정)`);
    console.log(errs.length ? '  콘솔 에러: ' + errs[0] : '  콘솔 에러 0건');
    await b.close();
    process.exit(spread < 0.01 && !errs.length ? 0 : 1);
})();
