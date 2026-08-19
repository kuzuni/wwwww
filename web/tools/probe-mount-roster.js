// mount-animal-machine-dynamic ① 판정 — 탈것 로스터가 **동물·기계**로만 채워졌는지, 새로 들어온
// 종이 진짜 3D 몸을 갖고 실제로 움직이는지, 구세이브의 폐기 종이 안 잃고 옮겨지는지 본다.
// 사용자 원문: "탈것도 왠만하면 다 동물, 기계 같은 거로 해서 움직임 자체가 좀 동적인 거로 해줘."
//
// ⚠️ 헤드리스에서는 rAF 가 사실상 안 돈다(TODO 함정 ③) — 프레임은 `Scene3D.update(1/60)` 를 손으로 흘려 만든다.
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것 (probe-death-fade 와 같은 규약).
//
// 사용: node probe-mount-roster.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 폐기 대상 — '탈것'이라 부를 수 없는 정적 사물(식물·뗏목). 로스터에 하나라도 남으면 지시 위반이다.
const BANNED = ['Brown Leaf', 'Lily Leaf', 'Lily Pad', 'Oak Leaf', 'Log Raft'];
const NEW5 = ['Pony', 'Donkey', 'Alpaca', 'Clockwork Mouse', 'Clockwork Beetle'];
const MACHINES = ['Clockwork Mouse', 'Clockwork Beetle', 'Bike', 'One-Wheel Droid', 'Mech Spider', 'Hover Board', 'Hover Disk'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && typeof Mounts !== 'undefined' && !!S)) break;
        await page.waitForTimeout(200);
    }

    // ── ⓐ 로스터: 표 4곳(등급 풀 · 한글명 · 아이콘 · 계열)이 서로 어긋나지 않는가 ──────────
    const roster = await page.evaluate(({ BANNED, NEW5 }) => {
        const all = Object.values(mountNames).flat();
        return {
            all,
            count: all.length,
            banned: all.filter(n => BANNED.includes(n)),
            newIn: NEW5.filter(n => all.includes(n)),
            noKr: all.filter(n => !MOUNT_KR[n]),
            noIcon: all.filter(n => !MOUNT_ICONS[n]),
            // 계열 표에 없는 종은 quad 로 떨어지는 게 **정상 설계**다 — 표에 있는 이름이 로스터에 없는
            // 경우(유령 항목)만 결함이다. 지운 종의 항목이 남아 있으면 여기서 걸린다.
            ghostForms: Object.keys(Scene3D.MOUNT_FORM_OF).filter(n => !all.includes(n)),
            formOf: Object.fromEntries(all.map(n => [n, Scene3D.MOUNT_FORM_OF[n] || 'quad'])),
        };
    }, { BANNED, NEW5 });

    // ── ⓑ 새 5종이 진짜 몸을 갖는가 — 기본 quad 골격만 나오면 '이름만 바뀐 초록 짐승'이다 ──
    const bodies = await page.evaluate(({ NEW5 }) => {
        const fp = (o) => { const a = []; o.traverse(m => { if (m.geometry) a.push(m.geometry.type + JSON.stringify(m.geometry.parameters || {}) + m.position.toArray().map(v => v.toFixed(3))); }); return a.sort().join('|'); };
        const meshes = {}, out = {};
        // 로스터에 없는 이름을 넣으면 식별 파츠가 하나도 안 붙은 **맨 quad 골격**이 나온다 — 그게 기준선.
        const bare = fp(Scene3D.makeMountMesh('__nobody__', 'common'));
        let bareCount = 0; Scene3D.makeMountMesh('__nobody__', 'common').traverse(o => { if (o.geometry) bareCount++; });
        for (const n of NEW5) {
            const g = Scene3D.makeMountMesh(n, 'common');
            let cnt = 0; g.traverse(o => { if (o.geometry) cnt++; });
            meshes[n] = fp(g);
            out[n] = { parts: cnt, distinctFromBare: fp(g) !== bare, spinners: (g.userData.spinners || []).length, hasHead: !!g.userData.head, legs: (g.userData.legs || []).length };
        }
        // 서로도 달라야 한다(같은 그림 5개면 로스터를 늘린 의미가 없다)
        const uniq = new Set(Object.values(meshes)).size;
        return { out, uniq, bareCount };
    }, { NEW5 });

    // ── ⓒ 태엽 감개가 실제로 감기는가 (기계 정체성 = 움직임) ────────────────────────
    const spin = await page.evaluate(() => {
        S.mounts = [{ name: 'Clockwork Mouse', rarity: 'epic', level: 1, xp: 0, stars: 0, subs: [] }];
        S.activeMounts = [0];
        Scene3D.refreshMount();
        Scene3D.walking = true;
        const mg = Scene3D.mountGroup;
        if (!mg || !mg.userData.spinners || !mg.userData.spinners.length) return { err: '감개가 없다' };
        const key = mg.userData.spinners[0];
        const at = [key.rotation.z];
        for (let i = 0; i < 60; i++) { Scene3D.update(1 / 60); at.push(key.rotation.z); }
        // ⚠️ '매 프레임 반드시 줄어든다'로 재면 안 된다 — 히트스톱 구간에서는 `Scene3D.update` 가
        //    dt 를 0 으로 눌러 값이 그대로 멈춘다(실측: 첫 3프레임이 정확히 0 이었다). 그건 정상이다.
        //    진짜 결함은 **되감기는 것**(사인을 잘못 쓴 경우)이므로 '증가한 프레임이 0'으로 판정한다.
        let mono = true;
        for (let i = 1; i < at.length; i++) if (at[i] > at[i - 1]) mono = false;
        return { total: Math.abs(at[at.length - 1] - at[0]), mono, legs: (mg.userData.legs || []).length };
    });

    // ── ⓓ 호버 기계의 뱅킹 — 피치만 있으면 '앞뒤로 까딱이는 판'이다 ─────────────────
    const bank = await page.evaluate(() => {
        S.mounts = [{ name: 'Hover Board', rarity: 'mythic', level: 1, xp: 0, stars: 0, subs: [] }];
        S.activeMounts = [0];
        Scene3D.refreshMount();
        Scene3D.walking = true;
        const mg = Scene3D.mountGroup;
        const roll = [], pitch = [];
        for (let i = 0; i < 240; i++) { Scene3D.update(1 / 60); roll.push(mg.rotation.z); pitch.push(mg.rotation.x); }
        const amp = a => Math.max(...a) - Math.min(...a);
        return { roll: amp(roll), pitch: amp(pitch), heroRollTouched: Scene3D.heroG ? Scene3D.heroG.rotation.z : null };
    });

    // ── ⓔ 구세이브 이관 — 폐기 종을 갖고 있던 세이브가 개체·성과를 안 잃는가 ──────────
    const migrated = await page.evaluate(({ BANNED }) => {
        S.mounts = BANNED.map((n, i) => ({ name: n, rarity: 'epic', level: 30 + i, xp: 123 + i, stars: 2, subs: [] }));
        S.activeMounts = [0];
        const before = S.mounts.length;
        Mounts.ensure();
        return {
            before, after: S.mounts.length,
            names: S.mounts.map(m => m.name),
            levels: S.mounts.map(m => m.level),
            stars: S.mounts.map(m => m.stars),
            leftovers: S.mounts.filter(m => BANNED.includes(m.name)).length,
            ridden: Mounts.ridden(),
            allKnown: S.mounts.every(m => !!MOUNT_KR[m.name]),
        };
    }, { BANNED });
    // 이관된 이름으로 3D 가 실제로 서는가(이름만 바꾸고 메시가 없으면 그때 터진다)
    const migratedRides = await page.evaluate(() => {
        Scene3D.refreshMount();
        const mg = Scene3D.mountGroup;
        let parts = 0; if (mg) mg.traverse(o => { if (o.geometry) parts++; });
        return { built: !!mg, parts };
    });

    const ok = (n, c, d) => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === undefined ? '' : ` — ${d}`}`);
    console.log('mount-animal-machine-dynamic ① 판정 (로스터 = 동물·기계 · 새 종의 몸과 움직임)');
    ok('ⓐ 정적 사물(잎·연잎·뗏목)이 로스터에서 0건', roster.banned.length === 0, roster.banned.join(','));
    ok('ⓐ 새 5종이 전부 로스터에 있다', roster.newIn.length === 5, roster.newIn.join(','));
    // ⚠️ 25 → 29: `mount-roster-add5`(사용자 지시 2026-08-19)로 익룡·두발 로봇·덤프트럭·청소로봇을
    //    넣었다. 이 줄은 **'로스터가 임의로 줄지 않았나'** 를 보는 하한 겸 고정값이고, 종을 더하는
    //    항목이 들어오면 그 항목이 같이 올린다(그 항목 전용 게이트는 probe-mount-roster-add5.js).
    ok('ⓐ 로스터 종 수 29 유지', roster.count === 29, roster.count);
    ok('ⓐ 모든 종에 한글명이 있다', roster.noKr.length === 0, roster.noKr.join(','));
    ok('ⓐ 모든 종에 아이콘이 있다', roster.noIcon.length === 0, roster.noIcon.join(','));
    ok('ⓐ 계열 표에 유령 항목(로스터에 없는 이름)이 없다', roster.ghostForms.length === 0, roster.ghostForms.join(','));
    ok('ⓐ 새 5종은 전부 quad 계열(검증된 안장·굴레 골격 재사용)',
        NEW5.every(n => roster.formOf[n] === 'quad'), NEW5.map(n => `${n}:${roster.formOf[n]}`).join(' '));
    for (const n of NEW5) {
        const b = bodies.out[n];
        ok(`ⓑ ${n}: 맨 골격과 다른 고유 파츠 + 다리 4개 + 머리 피벗`,
            b.distinctFromBare && b.legs === 4 && b.hasHead, `parts ${b.parts}(맨 ${bodies.bareCount}) legs ${b.legs} head ${b.hasHead}`);
    }
    ok('ⓑ 새 5종의 그림이 서로 다르다', bodies.uniq === 5, `서로 다른 메시 ${bodies.uniq}종`);
    ok('ⓑ 태엽 기계 2종만 감개를 갖는다',
        bodies.out['Clockwork Mouse'].spinners === 1 && bodies.out['Clockwork Beetle'].spinners === 1
        && bodies.out['Pony'].spinners === 0 && bodies.out['Donkey'].spinners === 0 && bodies.out['Alpaca'].spinners === 0,
        NEW5.map(n => `${n}:${bodies.out[n].spinners}`).join(' '));
    ok('ⓒ 감개가 한 방향으로 계속 감긴다', !spin.err && spin.total > 1 && spin.mono, spin.err || `${spin.total.toFixed(2)}rad ${spin.mono ? '단조' : '왕복(사인 오사용)'}`);
    ok('ⓒ 기계 종도 다리 트롯을 그대로 쓴다', spin.legs === 4, spin.legs);
    ok('ⓓ 호버 기계가 좌우로 뱅킹한다', bank.roll > 0.1, `roll ${bank.roll.toFixed(3)}rad`);
    ok('ⓓ 피치도 살아 있다(뱅킹이 피치를 대체한 게 아니다)', bank.pitch > 0.02, `pitch ${bank.pitch.toFixed(3)}rad`);
    ok('ⓓ 뱅킹을 영웅에게 전가하지 않는다(회피·피격 반동 보존)', bank.heroRollTouched === 0, bank.heroRollTouched);
    ok('ⓔ 폐기 종 보유분이 사라지지 않는다', migrated.after === migrated.before, `${migrated.before} → ${migrated.after}`);
    ok('ⓔ 폐기 이름이 하나도 안 남는다', migrated.leftovers === 0, migrated.names.join(','));
    ok('ⓔ 이관된 이름이 전부 아는 종이다', migrated.allKnown, migrated.names.join(','));
    ok('ⓔ 레벨·승천 성과가 보존된다', migrated.levels.join(',') === '30,31,32,33,34' && migrated.stars.every(v => v === 2),
        `lv ${migrated.levels.join(',')} / stars ${migrated.stars.join(',')}`);
    ok('ⓔ 장착도 그대로 유지된다', !!migrated.ridden, migrated.ridden);
    ok('ⓔ 이관된 탈것이 3D 로 실제로 선다', migratedRides.built && migratedRides.parts > 10, `parts ${migratedRides.parts}`);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
