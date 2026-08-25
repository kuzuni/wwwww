// `Scene3D` 가 안 선 동안 들어온 조형 갱신이 터지지 않는지 (slug: mount-summon-scene-null).
//
// 배경: 호출부(`mounts.js`·`pets.js`·`ascension.js`)는 `typeof Scene3D !== 'undefined'` 로만 막는데
// `Scene3D` 는 객체 리터럴이라 로드 즉시 존재한다 — 정작 `scene` 은 `init()` 전까지 null 이다.
// 그 틈에 소환·장착이 들어오면 `refreshMount → this.scene.add(g)` 가 터졌다(헤드리스 10회 중 3회).
//
// 두 방향을 다 본다 — **음성 대조가 없으면 '그냥 항상 건너뛰는' 가드도 통과해 버린다**:
//   ① scene=null 이면 세 갱신기가 던지지 않고 조용히 빠진다.
//   ② scene 을 되돌리면 탈것·펫이 **실제로 다시 선다**(가드가 정상 경로를 막지 않았다).
// 사용: node probe-scene-null-guard.js   (종료코드 0=통과)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => {
        const out = { thrown: [], after: {}, guardExists: typeof Scene3D.sceneReady === 'function' };
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse';
        S.pets = Object.keys(PET_ICONS).slice(0, 3).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
        S.activePets = [0, 1, 2];

        // ── ① init 전 상태를 흉내낸다: scene 을 떼고 갱신기를 부른다 ──
        const keep = Scene3D.scene;
        Scene3D.scene = null;
        for (const m of ['refreshMount', 'refreshPets', 'refreshMountFollowers']) {
            try { Scene3D[m](); } catch (e) { out.thrown.push(m + ': ' + e.message); }
        }
        out.duringNull = { mountGroup: !!Scene3D.mountGroup, pets: (Scene3D.petGroups || []).length };

        // ── ② scene 을 되돌리면 조형이 실제로 다시 서야 한다(음성 대조) ──
        Scene3D.scene = keep;
        Scene3D.refreshMount();
        Scene3D.refreshPets();
        out.after.mountGroup = !!Scene3D.mountGroup;
        out.after.mountInScene = !!(Scene3D.mountGroup && Scene3D.mountGroup.parent === Scene3D.scene);
        out.after.pets = (Scene3D.petGroups || []).length;
        out.after.petsInScene = (Scene3D.petGroups || []).filter(g => g.parent === Scene3D.scene).length;
        return out;
    });

    console.log('가드 존재(sceneReady) :', r.guardExists);
    console.log('① scene=null 중 던진 예외 :', r.thrown.length ? r.thrown : '없음');
    console.log('   그때 만들어진 조형     :', JSON.stringify(r.duringNull), '(전부 비어 있어야 정상)');
    console.log('② scene 복구 후           :', JSON.stringify(r.after));
    console.log('콘솔/페이지 에러 :', errors.length ? errors : '0건');

    const passNull = r.guardExists && r.thrown.length === 0 && !r.duringNull.mountGroup && r.duringNull.pets === 0;
    const passBack = r.after.mountGroup && r.after.mountInScene && r.after.pets === 3 && r.after.petsInScene === 3;
    console.log('--- 판정 ---');
    console.log('  ① 안 선 동안 안 터짐 :', passNull ? 'PASS' : 'FAIL');
    console.log('  ② 복구 후 정상 동작  :', passBack ? 'PASS' : 'FAIL (가드가 정상 경로까지 막았다)');
    await browser.close();
    const ok = passNull && passBack && errors.length === 0;
    console.log('  최종 :', ok ? 'PASS' : 'FAIL');
    process.exit(ok ? 0 : 1);
})();
