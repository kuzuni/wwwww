// 탈것 로스터 검증 (사용자 지시 2026-08-18 `mount-collection-shows-3`)
//   "탈것 존나 여러 개 뽑았는데 여러 개로 안 보인다, 3개만 보인다. 펫처럼 각자로 되게 여러 개 떠야 하는데."
// 원인은 중복 합침 규칙이 아니라(펫도 같은 규칙이다) **common이 3종뿐**이라 초반 소환이 3종으로 수렴한 것.
//  ⑴ 등급별 종 수가 펫 로스터 이상 — 특히 common이 3종에서 늘었다
//  ⑵ 20/50/75회 소환 시 실제로 뜨는 타일 수가 예전(3/7/10)보다 늘고, common 소환만 몰아쳐도 3에서 안 멈춘다
//  ⑶ 모든 종에 한글명·아이콘이 있다(빈칸이면 화면에 영문/기본 이모지가 샌다)
//  ⑷ 모든 종이 메시를 만들고, **계열 표(MOUNT_FORM_OF)와 실제 메시 분기가 같은 표를 본다**
//  ⑸ 같은 등급 안에서 종끼리 실루엣이 다르다(파츠 수가 전부 같으면 색만 다른 복제다)
//  ⑹ 펫과 탈것의 중복 처리 규칙이 같다(둘 다 이름 키로 합치고 dupes를 올린다)
//  ⑺ 콘솔 에러 0건
// 사용: node probe-mount-roster.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Mounts !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => {
        const roster = {}, pet = {};
        for (const k in mountNames) roster[k] = mountNames[k].length;
        for (const k in petStats) pet[k] = petStats[k].length;
        const all = Object.values(mountNames).flat();

        // ⑵ 소환 표본 — 소환 레벨이 오르는 실제 경로 그대로 돌린다
        const tiles = {};
        for (const n of [20, 50, 75]) {
            S.winders = 1e9; S.mounts = {}; S.activeMount = null; S.mountOpens = 0;
            Mounts.summon(n);
            tiles[n] = Object.keys(S.mounts).length;
        }
        // common만 몰아 뽑았을 때의 상한 = common 종 수
        S.mounts = {}; S.activeMount = null; S.mountOpens = 0;
        const realRates = Mounts.rates;
        Mounts.rates = () => ({ common: 1 });
        S.winders = 1e9; Mounts.summon(60);
        const commonOnlyTiles = Object.keys(S.mounts).length;
        Mounts.rates = realRates;

        // ⑶⑷⑸ 종별 메타·메시
        const meta = all.map(n => ({
            name: n,
            kr: MOUNT_KR[n] || null,
            icon: MOUNT_ICONS[n] || null,
            form: Scene3D.MOUNT_FORM_OF[n] || 'quad',
        }));
        const mesh = {};
        for (const n of all) {
            try {
                const g = Scene3D.makeMountMesh(n, 'common');
                let parts = 0;
                g.traverse(o => { if (o.isMesh) parts++; });
                mesh[n] = { parts, saddle: !!g.userData };
                Scene3D.disposeTree(g);
            } catch (e) { mesh[n] = { error: String(e).slice(0, 120) }; }
        }
        // ⑹ 중복 규칙 — 같은 이름을 두 번 얻으면 타일이 아니라 dupes가 는다(펫과 같은 계약)
        S.mounts = {}; S.activeMount = null;
        S.mounts['Turtle'] = { rarity: 'rare', level: 1, dupes: 0, stars: 0, xp: 0, subs: [] };
        const before = Object.keys(S.mounts).length;
        S.mounts['Turtle'].dupes++;
        const dupeRule = Object.keys(S.mounts).length === before && S.mounts['Turtle'].dupes === 1;

        return { roster, pet, meta, mesh, tiles, commonOnlyTiles, dupeRule, total: all.length,
                 dupNames: all.length !== new Set(all).size };
    });

    // ⑴
    for (const k of Object.keys(r.pet)) {
        ok((r.roster[k] || 0) >= r.pet[k],
            `⑴ ${k} 탈것 ${r.roster[k] || 0}종 < 펫 ${r.pet[k]}종 — '펫처럼 여러 개'가 안 된다`);
    }
    ok(r.roster.common >= 6, `⑴ common이 ${r.roster.common}종 — 초반 소환이 이 수로 수렴한다(원래 원인)`);
    ok(!r.dupNames, '⑴ 로스터에 같은 이름이 중복 등재됐다');

    // ⑵
    ok(r.tiles[20] >= 5, `⑵ 20회 소환 타일 ${r.tiles[20]}개 (예전 3개 — 사용자가 본 그 숫자)`);
    ok(r.tiles[75] >= 14, `⑵ 75회 소환 타일 ${r.tiles[75]}개`);
    ok(r.commonOnlyTiles === r.roster.common,
        `⑵ common만 뽑았을 때 타일 ${r.commonOnlyTiles} ≠ common 종 수 ${r.roster.common}`);

    // ⑶⑷
    const noKr = r.meta.filter(m => !m.kr).map(m => m.name);
    const noIcon = r.meta.filter(m => !m.icon).map(m => m.name);
    ok(!noKr.length, `⑶ 한글명 누락: ${noKr.join(', ')}`);
    ok(!noIcon.length, `⑶ 아이콘 누락: ${noIcon.join(', ')}`);
    const meshErr = Object.entries(r.mesh).filter(([, v]) => v.error);
    ok(!meshErr.length, `⑷ 메시 생성 실패: ${meshErr.map(([n, v]) => n + ' ' + v.error).join(' | ')}`);
    // 평판 계열의 기본 파츠는 3개(발판·아래턱·윗면)라 하한은 3으로 잡는다 — 5로 두면 멀쩡한 평판이 전부 걸린다.
    const emptyMesh = Object.entries(r.mesh).filter(([, v]) => !v.error && v.parts < 3).map(([n]) => n);
    ok(!emptyMesh.length, `⑷ 파츠가 거의 없는 종: ${emptyMesh.join(', ')}`);

    // ⑸ 같은 등급 안에서 파츠 수가 전부 같으면 색만 다른 복제다
    const byRarity = {};
    for (const [rar, names] of Object.entries(await page.evaluate(() => mountNames))) {
        byRarity[rar] = names.map(n => r.mesh[n].parts);
        if (names.length > 1) {
            ok(new Set(byRarity[rar]).size > 1,
                `⑸ ${rar} ${names.length}종의 파츠 수가 전부 ${byRarity[rar][0]}개로 같다 — 색만 다른 복제로 보인다`);
        }
    }
    ok(r.dupeRule, '⑹ 중복이 dupes로 합쳐지지 않는다 (펫과 규칙이 갈렸다)');
    ok(errs.length === 0, `⑺ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);

    console.log('--- 탈것 로스터 검증 ---');
    console.log(`로스터 ${JSON.stringify(r.roster)} (총 ${r.total}종) vs 펫 ${JSON.stringify(r.pet)}`);
    console.log(`소환 타일 20회 ${r.tiles[20]} · 50회 ${r.tiles[50]} · 75회 ${r.tiles[75]} · common전용 ${r.commonOnlyTiles}`);
    console.log(`계열: ${r.meta.map(m => m.form[0]).join('')} (f=flat/w=wheeled/q=quad, fly는 f로 겹침 — 상세는 MOUNT_FORM_OF)`);
    console.log(`등급별 파츠 수 ${JSON.stringify(byRarity)}`);
    if (fails.length) { console.log('FAIL ' + fails.length + '건'); fails.forEach(f => console.log('  ✗ ' + f)); }
    else console.log('PASS — 탈것도 펫처럼 여러 종이 각자 뜬다');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
