// 데미지 숫자의 **화면 이동 거리** 실측 — 비평가 4차 ⓑ("상승 거리 190~250px가 과해 상단 HUD까지
// 올라간다, 권고 46px/620ms")를 눈대중이 아니라 픽셀로 확인/반증한다.
// 사용: node probe-dmgnum-travel.js
//
// 재는 것: ① 스폰 y(슬롯 회피 포함) ② 애니메이션이 실제로 옮기는 거리(--rise 트랙의 정점)
//          ③ 둘을 합친 **화면 최고점**이 3D 캔버스 위(=상단 HUD)로 넘어가는가
// ⚠️ 두 성분을 반드시 갈라 봐야 한다 — `--rise`(아크 높이)와 `ty` 슬롯 회피(연타 시 위 칸으로 밀기)는
//    원인도 처방도 다르다. 합쳐서 재면 "아크가 과하다"로 오진해 멀쩡한 아크를 깎게 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(async () => {
        Combat.tick = () => { };
        const e = Combat.enemies.find(x => x.alive);
        const canvasTop = Scene3D.container.getBoundingClientRect().top;
        const rows = [];
        // 연타 5발 — 슬롯 회피가 실제로 걸리는 조건(비평가가 본 화면)
        const hits = [
            { dmg: e.maxHp.mul(0.02), crit: false, label: '소액' },
            { dmg: e.maxHp.mul(0.02), crit: false, label: '소액 연타2' },
            { dmg: e.maxHp.mul(0.10), crit: false, label: '중간 연타3' },
            { dmg: e.maxHp.mul(0.30), crit: true, label: '크리 연타4' },
            { dmg: e.maxHp.mul(0.30), crit: false, label: '큰피해 연타5' },
        ];
        for (const h of hits) {
            const before = Scene3D.fxLayer.children.length;
            Scene3D.hitEnemy(e.id, h.dmg, h.crit, 'melee');
            Scene3D.update(1 / 120);
            const el = Scene3D.fxLayer.children[Scene3D.fxLayer.children.length - 1];
            if (!el || Scene3D.fxLayer.children.length === before) { rows.push({ label: h.label, miss: true }); continue; }
            // ⚠️ `el.style.top`(캔버스 로컬)과 `getBoundingClientRect()`(뷰포트)를 **섞어서 재면 안 된다** —
            //    첫 판에서 그렇게 재고 "HUD 침범 2건"이라는 없는 결함을 만들 뻔했다. 전부 뷰포트로 통일한다.
            const slotTop = parseFloat(el.style.top);          // 슬롯 회피가 정한 캔버스 로컬 y (성분 ①)
            const rise = parseFloat(getComputedStyle(el).getPropertyValue('--rise')) || 0;
            const anim = el.getAnimations()[0];
            let spawn = el.getBoundingClientRect().top, peak = spawn;
            if (anim) {
                const dur = anim.effect.getTiming().duration;
                anim.currentTime = 0;
                spawn = el.getBoundingClientRect().top;
                for (let f = 0; f <= 1.0001; f += 0.05) {
                    anim.currentTime = dur * f;
                    peak = Math.min(peak, el.getBoundingClientRect().top);
                }
                anim.currentTime = 0;
            }
            rows.push({
                label: h.label, slotTop: +slotTop.toFixed(1), rise: +rise.toFixed(1),
                spawnTop: +spawn.toFixed(1), peakTop: +peak.toFixed(1),
                travel: +(spawn - peak).toFixed(1), overHud: peak < canvasTop,
            });
        }
        return { rows, canvasTop: +canvasTop.toFixed(1) };
    });

    console.log(`3D 캔버스 상단 y = ${out.canvasTop}px (이 위로 올라가면 상단 HUD 영역)`);
    console.log('  타격            슬롯 y   --rise   스폰(뷰포트)  최고점   실이동   HUD 침범');
    let bad = 0;
    for (const r of out.rows) {
        if (r.miss) { console.log(`  ${r.label.padEnd(14)} (숫자 미생성)`); continue; }
        if (r.overHud) bad++;
        console.log(`  ${r.label.padEnd(14)} ${String(r.slotTop).padStart(6)} ${String(r.rise).padStart(8)} `
                    + `${String(r.spawnTop).padStart(11)} ${String(r.peakTop).padStart(8)} ${String(r.travel).padStart(8)}   ${r.overHud ? '✗ 침범' : 'OK'}`);
    }
    const tr = out.rows.filter(r => !r.miss).map(r => r.travel);
    if (tr.length) console.log(`  → 실이동 ${Math.min(...tr).toFixed(1)}~${Math.max(...tr).toFixed(1)}px (비평가 권고 46px 기준)`);
    console.log(bad ? `\n✗ HUD 침범 ${bad}건` : '\n전부 캔버스 안');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no page/console errors)');
    await browser.close();
})();
