// 탈것 **장착은 1마리** 인가 — 사용: node probe-mount-single.js
//
// 사용자 지시(`mount-single-equip`): "탈것은 한 개만 장착 가능해야 하는데 여러 개 장착 가능하더라."
//   + 확인 "개수 제한 없다는 건 **인벤토리(보유)** 얘기고, **장착은 1개**."
//   그래서 이 probe 는 두 가지를 **같이** 잰다 — 장착이 1로 묶이는가, 그리고 **보유는 안 묶이는가**.
//   (한쪽만 재면 '장착 제한'을 고치다 '보유 무제한'을 같이 부숴도 아무도 모른다.)
//
// 재는 것:
//   ① 여러 마리를 연달아 장착해도 `S.activeMounts.length === 1` 이고 마지막 것이 남는다.
//   ② 장착 중인 것을 다시 누르면 해제된다(0마리).
//   ③ **보유는 무제한** — 25종을 다 넣어도 `S.mounts` 는 25개 그대로.
//   ④ **기존 세이브 구제**: 여러 마리가 이미 장착된 상태로 `ensure()` 를 타면 1마리로 줄어든다.
//   ⑤ 보너스 합산이 장착 1마리 몫만 잡힌다(무제한 합산으로 부풀지 않는다).
//   ⑥ 3D 가 따라오는 여분 탈것을 안 만든다(`Scene3D.mountFollowers` 0) + 콘솔 에러 0.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Mounts !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1000);

    const r = await page.evaluate(() => {
        Combat.tick = () => { };
        const names = Object.keys(MOUNT_KR || {}).slice(0, 6);
        S.mounts = {};
        for (const n of names) S.mounts[n] = { rarity: 'rare', level: 1, dupes: 0, stars: 0, xp: 0, subs: [] };
        S.activeMounts = [];
        const out = { names: names.length };
        // ① 연달아 장착
        for (const n of names) Mounts.equip(n);
        out.afterEquipAll = S.activeMounts.slice();
        // ② 장착 중인 것 재클릭 = 해제
        Mounts.equip(S.activeMounts[0]);
        out.afterToggleOff = S.activeMounts.slice();
        // ③ 보유는 무제한
        out.owned = Object.keys(S.mounts).length;
        // ④ 기존 세이브 구제 — 여러 마리가 장착된 상태를 직접 만들고 ensure()
        S.activeMounts = names.slice();
        Mounts.ensure();
        out.afterEnsure = S.activeMounts.slice();
        // ⑤ 보너스는 1마리 몫
        // ⚠️ 여기서 `equip` 을 부르면 안 된다 — ④ 직후엔 names[0] 이 **이미 장착 중**이라 토글이 걸려
        //    오히려 0마리가 된다(첫 판에서 '1마리 합산 0' 이 나왔다). '이걸 타라'는 뜻은 `setRidden` 이다.
        Mounts.setRidden(names[0]);
        const one = Mounts.activeBonus();
        S.activeMounts = names.slice(0, 3);         // 강제로 3마리 상태를 만들어 합산 비교
        const three = Mounts.activeBonus();
        out.bonusOne = one.atk.toString();
        out.bonusForcedThree = three.atk.toString();
        // ⑥ 3D — 정상 경로(equip)로 되돌리고 렌더 확인
        Mounts.equip(names[1]);
        Scene3D.refreshMount();
        for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);
        out.active = S.activeMounts.slice();
        out.followers = (Scene3D.mountFollowers || []).length;
        out.ridden = Mounts.ridden();
        return out;
    });

    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const checks = [
        ['① 연달아 장착해도 1마리(마지막 것)', r.afterEquipAll.length === 1, `[${r.afterEquipAll}]`],
        ['② 재클릭하면 해제', r.afterToggleOff.length === 0, `[${r.afterToggleOff}]`],
        ['③ 보유는 무제한(장착 제한과 무관)', r.owned === r.names, `${r.owned}/${r.names}종`],
        ['④ 여러 마리 장착 세이브를 ensure()가 1마리로', r.afterEnsure.length === 1, `[${r.afterEnsure}]`],
        ['⑤ 합산이 1마리 몫', r.bonusOne !== '0' && r.bonusOne !== r.bonusForcedThree, `1마리 ${r.bonusOne} vs 강제3마리 ${r.bonusForcedThree}`],
        ['⑥ 뒤따르는 여분 탈것 없음', r.followers === 0 && r.active.length === 1, `followers ${r.followers}, 장착 [${r.active}] 탑승 ${r.ridden}`],
    ];
    console.log('탈것 단일 장착 실측\n');
    let bad = 0;
    for (const [label, ok, detail] of checks) {
        if (!ok) bad++;
        console.log(`  ${ok ? 'OK  ' : '⚠️  '}${label.padEnd(34)} ${detail}`);
    }
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}건`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(bad === 0 && !errors.length ? 0 : 1);
})();
