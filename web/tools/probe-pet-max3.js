// 펫 **출전은 3마리까지** 인가 — 사용: node probe-pet-max3.js
//
// 사용자 지시(`pet-equip-max3`): "펫도 (제한 없다는 건) **인벤토리** 얘기고, **3개까지만 장착**."
//   그래서 이 probe 는 두 가지를 **같이** 잰다 — 출전이 3에서 막히는가, **보유는 안 막히는가**.
//   (한쪽만 재면 상한을 넣다가 보유 무제한을 같이 부숴도 아무도 모른다. 탈것 쪽 `probe-mount-single`
//    과 같은 원칙이다.)
//
// 재는 것:
//   ① 4번째 출전 시도가 막힌다(`toggleActive` false, 목록 3 유지) + `canActivate` 가 미리 알려 준다.
//   ② 해제는 상한과 무관하게 되고, 한 칸 비면 새 펫이 들어간다.
//   ③ 보유(S.pets)는 그대로 — 상한은 출전에만 걸린다.
//   ④ **3D 장면에 서는 펫도 3마리** (렌더가 상한을 따라온다).
//   ⑤ UI 경로(`UI.onTogglePet`)에서도 4번째가 안 들어가고 안내 토스트가 뜬다.
//   ⑥ 부화 자동 출전이 상한을 넘기지 않는다(AUTO_ACTIVE 가 상한보다 커도).
//   ⑦ 콘솔 에러 0.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Pets !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1000);

    const r = await page.evaluate(() => {
        Combat.tick = () => { };
        const out = { cap: Pets.MAX_ACTIVE };
        S.pets = Array.from({ length: 8 }, (_, i) => ({ name: 'Dog', rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }));
        S.activePets = [];
        // ① 상한
        out.eq = [0, 1, 2, 3].map(i => Pets.toggleActive(i));
        out.afterFour = S.activePets.slice();
        out.canActivateFourth = Pets.canActivate(3);
        out.canActivateExisting = Pets.canActivate(0);
        // ② 해제 → 한 칸
        Pets.toggleActive(0);
        out.afterRelease = S.activePets.slice();
        out.reEquip = Pets.toggleActive(3);
        out.afterReEquip = S.activePets.slice();
        // ③ 보유
        out.owned = S.pets.length;
        // ④ 3D
        Scene3D.refreshPets();
        for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);
        out.petGroups = (Scene3D.petGroups || []).length;
        // ⑤ UI 경로 — 토스트를 가로채 문구까지 확인
        const toasts = [];
        const realToast = UI.toast.bind(UI);
        UI.toast = (m) => { toasts.push(String(m)); };
        UI.onTogglePet(4);                        // 이미 3마리 출전 중 → 막혀야 한다
        UI.toast = realToast;
        out.afterUiTry = S.activePets.slice();
        out.toast = toasts.join(' | ');
        // ⑥ 자동 출전이 상한을 넘기지 않는가 — AUTO_ACTIVE 를 일부러 크게 올려 본다
        const autoWas = Pets.AUTO_ACTIVE;
        Pets.AUTO_ACTIVE = 99;
        S.activePets = [0, 1, 2];
        S.pets.push({ name: 'Dog', rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] });
        if (S.activePets.length < Math.min(Pets.AUTO_ACTIVE, Pets.MAX_ACTIVE)) S.activePets.push(S.pets.length - 1);
        out.afterAuto = S.activePets.slice();
        Pets.AUTO_ACTIVE = autoWas;
        return out;
    });

    const checks = [
        ['① 4번째 출전이 막힌다', JSON.stringify(r.eq) === '[true,true,true,false]' && r.afterFour.length === r.cap, `${JSON.stringify(r.eq)} → [${r.afterFour}]`],
        ['① canActivate 가 미리 알려 준다', r.canActivateFourth === false && r.canActivateExisting === true, `4번째 ${r.canActivateFourth} / 출전중 ${r.canActivateExisting}`],
        ['② 해제는 되고 빈 칸에 새 펫이 들어간다', r.afterRelease.length === r.cap - 1 && r.reEquip === true && r.afterReEquip.length === r.cap, `[${r.afterRelease}] → [${r.afterReEquip}]`],
        ['③ 보유는 상한과 무관', r.owned === 8, `${r.owned}마리 보유`],
        ['④ 장면에 서는 펫도 3마리', r.petGroups === r.cap, `${r.petGroups}그룹`],
        ['⑤ UI 경로도 막고 안내한다', r.afterUiTry.length === r.cap && /3마리까지/.test(r.toast), `[${r.afterUiTry}] "${r.toast}"`],
        ['⑥ 부화 자동 출전이 상한을 안 넘는다', r.afterAuto.length === r.cap, `[${r.afterAuto}]`],
    ];
    console.log(`펫 출전 상한(${r.cap}마리) 실측\n`);
    let bad = 0;
    for (const [label, ok, detail] of checks) {
        if (!ok) bad++;
        console.log(`  ${ok ? 'OK  ' : '⚠️  '}${label.padEnd(32)} ${detail}`);
    }
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}건`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(bad === 0 && !errors.length ? 0 : 1);
})();
