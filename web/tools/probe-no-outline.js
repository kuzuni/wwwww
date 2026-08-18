// 3D 검정 아웃라인이 **정말 하나도 안 생기는가** — 사용: node probe-no-outline.js
//
// 왜 필요한가(사용자 지시 `remove-3d-black-outline`): "캐릭터들이랑 장비 검정색 아웃라인한 거 없애라."
//   인버티드 헐 셸은 파츠마다 **자식 메시**로 붙던 것이라, 호출부 하나만 지워도 다른 경로(투구·무기
//   재장착, 적 스폰)에서 되살아날 수 있다. 소스 grep 으로는 못 잡으니 **실제 씬을 훑어서** 센다.
//
// 재는 것: ⑴ `userData.isOutline` 이 붙은 오브젝트 수(영웅·적 전부) — 0 이어야 한다.
//          ⑵ `side: THREE.BackSide` 인 불투명 메시 수 — 표식 없이 되살아난 셸까지 잡는 그물.
//          ⑶ 장비를 갈아입고(투구·무기) 적을 스폰한 **뒤에도** 0 인가 — 재생성 경로가 진짜 위험한 자리다.
//          ⑷ 콘솔 에러 0.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(() => {
        const count = (root) => {
            let marked = 0, back = 0;
            root.traverse(o => {
                if (!o.isMesh) return;
                if (o.userData && o.userData.isOutline) marked++;
                const m = Array.isArray(o.material) ? o.material[0] : o.material;
                if (m && m.side === THREE.BackSide && !m.transparent) back++;
            });
            return { marked, back };
        };
        const res = { stages: [] };
        const snap = (label) => {
            const hero = count(Scene3D.heroG);
            let en = { marked: 0, back: 0 };
            for (const [, m] of Scene3D.enemyMap) { const c = count(m.g); en.marked += c.marked; en.back += c.back; }
            res.stages.push({ label, hero, enemy: en });
        };
        snap('초기');
        // 장비 재장착 — 투구·무기는 갈아입을 때 통째로 다시 만들어진다(옛 아웃라인 재부착 지점)
        Scene3D.refreshHeroEquip(true);      // 투구·무기 그룹을 통째로 다시 만든다
        Scene3D.applyWeaponGrip && Scene3D.applyWeaponGrip();
        for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);
        snap('장비 갱신 후');
        // 적 스폰 — 예전엔 여기서도 셸을 붙였다
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        const e = { id: 971, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);
        snap('적 스폰 후');
        return res;
    });

    console.log('3D 검정 아웃라인 잔존 검사 — 전부 0 이어야 한다\n');
    let bad = 0;
    for (const s of out.stages) {
        const n = s.hero.marked + s.hero.back + s.enemy.marked + s.enemy.back;
        if (n) bad++;
        console.log(`  ${s.label.padEnd(12)} 영웅 isOutline ${s.hero.marked} / BackSide ${s.hero.back}` +
            `   적 isOutline ${s.enemy.marked} / BackSide ${s.enemy.back}   ${n ? '⚠️ 아웃라인이 남아 있다' : 'OK'}`);
    }
    console.log(bad === 0 ? '\n전부 통과 — 아웃라인 셸이 하나도 안 생긴다' : `\n불합격 ${bad}단계`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(bad === 0 && !errors.length ? 0 : 1);
})();
