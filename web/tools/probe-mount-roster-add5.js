// `mount-roster-add5` 판정 — 사용자 지시(2026-08-19) "공룡, 익룡도 탈것으로 넣어줘. 두 발 달린
// 로봇이랑. 덤프트럭도 놔줘 탈것으로. 청소로봇도." 가 실제로 게임 안에 들어왔는지 수치로 본다.
//
// 다섯 중 **공룡은 이미 있었다** — rare 의 `Dino`(한글명 '공룡')가 그것이고 목 골판·이빨 난 아래턱까지
// 전용 조형이 붙어 있다. 같은 이름을 하나 더 넣으면 목록에서 구분이 안 되므로 추가하지 않았고,
// 그래서 이 프로브는 **기존 Dino 가 사라지지 않았는지**도 같이 못박는다(그게 '공룡 요구'의 충족분이다).
//
// 이 프로브가 보는 것 (기존 probe-mount-roster.js 가 안 보는 것만):
//   ⓐ 표 4곳 정합 + 4종의 계열 배정이 의도대로인가(익룡 fly · 두발 로봇 biped · 트럭·청소로봇 wheeled)
//   ⓑ 종마다 **정체성 파츠**가 실재하는가 — 이름만 바뀐 기존 골격이면 로스터를 늘린 의미가 없다
//   ⓒ 넷이 서로도, 같은 계열의 기존 종과도 **다른 그림**인가 (익룡↔드래곤 / 트럭↔자전거가 이 검사의 표적)
//   ⓓ 실제로 타면 지면을 뚫거나 뜨지 않는가 (이족형은 **발 두 개로** 접지해야 한다)
//   ⓔ 실제로 움직이는가 — 이족 교대보행 / 막날개 펄럭임 / 바퀴·브러시 누적 회전
//   ⓕ 신설 biped 계열의 배선이 빠진 데 없는가(포즈·안장 정합·조종 컬럼)
//
// ⚠️ 헤드리스에서는 rAF 가 사실상 안 돈다(TODO 함정 ③) — 프레임은 `Scene3D.update(1/60)` 를 손으로 흘린다.
// ⚠️ 판정은 exit 코드가 아니라 출력의 PASS/FAIL 줄로 읽을 것(이 저장소 프로브 공통 규약).
//
// 사용: node probe-mount-roster-add5.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const NEW4 = ['Pterosaur', 'Bipedal Mech', 'Dump Truck', 'Cleaning Robot'];
const WANT_FORM = { 'Pterosaur': 'fly', 'Bipedal Mech': 'biped', 'Dump Truck': 'wheeled', 'Cleaning Robot': 'wheeled' };
const WANT_KR = { 'Pterosaur': '익룡', 'Bipedal Mech': '두발 로봇', 'Dump Truck': '덤프트럭', 'Cleaning Robot': '청소로봇' };
const TOL = 0.05;   // 접지 허용 오차(월드). probe-ride-ground 와 같은 값 — 영웅 키의 3%.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Mounts !== "undefined" && !!S',
        { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1200);

    // ── ⓐ 표 정합 ──────────────────────────────────────────────────────────────────
    const roster = await page.evaluate(({ NEW4 }) => {
        const all = Object.values(mountNames).flat();
        const krs = all.map(n => MOUNT_KR[n]);
        const icons = all.map(n => MOUNT_ICONS[n]);
        const dupOf = (a) => a.filter((v, i) => a.indexOf(v) !== i);
        return {
            count: all.length,
            missing: NEW4.filter(n => !all.includes(n)),
            hasDino: all.includes('Dino') && MOUNT_KR['Dino'] === '공룡',
            noKr: all.filter(n => !MOUNT_KR[n]),
            noIcon: all.filter(n => !MOUNT_ICONS[n]),
            dupKr: dupOf(krs), dupIcon: dupOf(icons),
            ghostForms: Object.keys(Scene3D.MOUNT_FORM_OF).filter(n => !all.includes(n)),
            formOf: Object.fromEntries(NEW4.map(n => [n, Scene3D.MOUNT_FORM_OF[n] || 'quad'])),
            kr: Object.fromEntries(NEW4.map(n => [n, MOUNT_KR[n]])),
            rarityOf: Object.fromEntries(NEW4.map(n => [n, Object.keys(mountNames).find(r => mountNames[r].includes(n))])),
        };
    }, { NEW4 });

    // ── ⓑⓒ 조형: 정체성 파츠 + 서로·기존 종과 다른 그림 ─────────────────────────────
    const bodies = await page.evaluate(({ NEW4 }) => {
        // 지문 = 지오메트리 종류·파라미터·위치. 이름만 바꾼 같은 골격이면 지문이 같다.
        const fp = (o) => { const a = []; o.traverse(m => { if (m.geometry) a.push(m.geometry.type + JSON.stringify(m.geometry.parameters || {}) + m.position.toArray().map(v => v.toFixed(3))); }); return a.sort().join('|'); };
        // '아랫몸' 상자 = y 0.25 아래에 있는 파츠만 모은 bbox.
        // ⚠️ 전체 bbox 로 '낮고 넓은가'를 재면 **안장 포스트와 손잡이 바(y 0.6)** 까지 높이에 들어가
        //    룸바가 통째로 '높은 물체'로 찍힌다(첫 판이 그래서 폭 0.63 / 높이 0.64 로 오판정했다).
        //    판정 대상은 로봇 **본체(원반)** 이므로 그 대역만 잘라 잰다.
        const lowBodyBox = (g) => {
            g.updateMatrixWorld(true);
            const box = new THREE.Box3();
            const v = new THREE.Vector3();
            g.traverse(m => { if (m.geometry && m.getWorldPosition(v).y < 0.25) box.expandByObject(m); });
            if (box.isEmpty()) return { wide: 0, high: 0 };
            return { wide: +(box.max.x - box.min.x).toFixed(3), high: +(box.max.y - box.min.y).toFixed(3) };
        };
        const info = (n) => {
            const g = Scene3D.makeMountMesh(n, 'epic');
            let parts = 0; g.traverse(o => { if (o.geometry) parts++; });
            const box = new THREE.Box3().setFromObject(g);
            return {
                fp: fp(g), parts,
                legs: (g.userData.legs || []).length, wings: (g.userData.wings || []).length,
                wheels: (g.userData.wheels || []).length, spinners: (g.userData.spinners || []).length,
                glow: (g.userData.glow || []).length, bar: !!g.userData.bar, head: !!g.userData.head,
                tail: !!g.userData.tail, rein: !!g.userData.rein,
                low: box.min.y, wide: box.max.x - box.min.x, high: box.max.y - box.min.y, long: box.max.z - box.min.z,
                lowBody: lowBodyBox(g),
            };
        };
        const out = {};
        for (const n of NEW4.concat(['Mini Dragon', 'Bike', 'One-Wheel Droid', 'Mech Spider', 'Dino'])) out[n] = info(n);
        const bare = fp(Scene3D.makeMountMesh('__nobody__', 'epic'));
        for (const n in out) out[n].distinctFromBare = out[n].fp !== bare;
        return out;
    }, { NEW4 });

    // ── ⓓⓔⓕ 실제 탑승: 접지·정합·움직임 ─────────────────────────────────────────────
    const rides = {};
    for (const name of NEW4) {
        rides[name] = await page.evaluate(({ name }) => {
            Combat.tick = () => { };
            Scene3D.clearEnemies(); Combat.enemies = [];
            const rarity = Object.keys(mountNames).find(r => mountNames[r].includes(name));
            S.mounts = [{ name, rarity, level: 1, xp: 0, stars: 0, subs: [] }];
            S.activeMounts = [0];
            Scene3D.refreshMount();
            Scene3D.walking = false;
            const mg = Scene3D.mountGroup;
            if (!mg) return { err: '탈것 그룹이 안 만들어졌다' };
            // 부유 위상을 고정한다 — 난수 위상이면 접지 수치가 실행마다 튄다(probe-ride-clear 교훈).
            mg.userData.bobPhase = 0;
            Scene3D.update(1 / 60);
            mg.updateWorldMatrix(true, true); Scene3D.heroG.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(mg);
            const form = Scene3D.mountFormOf(name);
            // 골반-안장 정합. ⚠️ **탈것 로컬로 재야 한다** — 탈것도 영웅도 yaw 0.55 로 돌아가 있어
            //    월드로 재면 비스듬한 축의 값이 나온다(probe-ride-fit 이 첫 판에서 밟은 함정).
            // ⚠️ 골반 뼈 이름은 `heroRig.bones.pelvis` 다(`heroRig.hips` 는 없다 — 첫 판에서 이걸
            //    잘못 짚어 네 종 전부 'n/a' 로 찍혔고, 코드가 아니라 **자가 틀린 것**이었다).
            const inner = mg.children[0];                      // 배율이 걸린 메시 그룹
            const rig0 = Scene3D.heroRig;
            const pelvisW = rig0 && rig0.bones && rig0.bones.pelvis
                ? rig0.bones.pelvis.localToWorld(new THREE.Vector3(0, 0, 0)) : null;
            const seatWorld = form.saddle;                     // 로컬 기준선(아래 pelvisLocal 과 같은 축)
            const pelvis = pelvisW ? +inner.worldToLocal(pelvisW.clone()).y.toFixed(3) : null;
            // 움직임: 다리·날개·바퀴·브러시가 실제로 값이 바뀌는가(그룹 userData 승격 누락이 여기서 걸린다)
            Scene3D.walking = true;
            const rec = { legs: [], wings: [], wheels: [], spinners: [] };
            const snap = () => {
                if (mg.userData.legs) rec.legs.push(mg.userData.legs.map(l => l.rotation.x));
                if (mg.userData.wings) rec.wings.push(mg.userData.wings.map(w => w.rotation.z));
                if (mg.userData.wheels) rec.wheels.push(mg.userData.wheels.map(w => w.rotation.x));
                if (mg.userData.spinners) rec.spinners.push(mg.userData.spinners.map(s => s.rotation.z));
            };
            snap();
            for (let i = 0; i < 90; i++) { Scene3D.update(1 / 60); snap(); }
            const amp = (series, k) => {
                if (!series.length) return 0;
                const vals = series.map(r => r[k]);
                return Math.max(...vals) - Math.min(...vals);
            };
            const monoDown = (series, k) => {   // 누적 회전은 되감기면 안 된다(사인 오사용 검사)
                if (!series.length) return false;
                for (let i = 1; i < series.length; i++) if (series[i][k] > series[i - 1][k] + 1e-9) return false;
                return Math.abs(series[series.length - 1][k] - series[0][k]) > 1;
            };
            // 이족 교대보행 = 두 다리 위상이 **반 사이클 어긋난다**(같은 부호면 깡충 뛴다)
            let legAntiphase = null;
            if (rec.legs.length && rec.legs[0].length === 2) {
                let opp = 0;
                for (const r of rec.legs) if (r[0] * r[1] < 0) opp++;
                legAntiphase = opp / rec.legs.length;
            }
            return {
                lowY: box.min.y, hover: form.hover, saddle: form.saddle,
                seatWorld, pelvis, fitGap: pelvis === null ? null : pelvis - seatWorld,
                hasPose: !!(form.pose && form.pose.hipL && form.pose.kneeL),
                barReach: !!form.barReach, barLive: !!mg.userData.bar,
                legAmp: rec.legs.length ? Math.max(amp(rec.legs, 0), amp(rec.legs, 1)) : 0,
                legAntiphase,
                wingAmp: rec.wings.length ? amp(rec.wings, 0) : 0,
                wingRibAmp: rec.wings.length && rec.wings[0].length > 2 ? amp(rec.wings, 2) : 0,
                wheelMono: rec.wheels.length ? monoDown(rec.wheels, 0) : null,
                spinMono: rec.spinners.length ? monoDown(rec.spinners, 0) : null,
            };
        }, { name });
    }

    const ok = (n, c, d) => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === undefined ? '' : ` — ${d}`}`);
    console.log('mount-roster-add5 판정 (익룡 · 두발 로봇 · 덤프트럭 · 청소로봇 · 공룡은 기존 Dino)');
    ok('ⓐ 4종이 전부 등급 풀에 있다', roster.missing.length === 0, roster.missing.join(',') || Object.entries(roster.rarityOf).map(([k, v]) => `${k}:${v}`).join(' '));
    ok('ⓐ 공룡(Dino) 요구는 기존 종으로 충족돼 있다', roster.hasDino);
    ok('ⓐ 로스터 종 수 29', roster.count === 29, roster.count);
    ok('ⓐ 모든 종에 한글명·아이콘이 있다', roster.noKr.length === 0 && roster.noIcon.length === 0,
        `kr없음 ${roster.noKr.join(',')} / icon없음 ${roster.noIcon.join(',')}`);
    ok('ⓐ 한글명·아이콘이 서로 겹치지 않는다(목록에서 구분 가능)',
        roster.dupKr.length === 0 && roster.dupIcon.length === 0,
        `kr중복 ${roster.dupKr.join(',')} / icon중복 ${roster.dupIcon.join(',')}`);
    ok('ⓐ 계열 표에 유령 항목이 없다', roster.ghostForms.length === 0, roster.ghostForms.join(','));
    ok('ⓐ 계열 배정이 의도대로다', NEW4.every(n => roster.formOf[n] === WANT_FORM[n]),
        NEW4.map(n => `${n}:${roster.formOf[n]}`).join(' '));
    ok('ⓐ 한글명이 지시 문구와 같다', NEW4.every(n => roster.kr[n] === WANT_KR[n]),
        NEW4.map(n => `${n}:${roster.kr[n]}`).join(' '));

    for (const n of NEW4) ok(`ⓑ ${n}: 맨 골격이 아닌 고유 조형`, bodies[n].distinctFromBare, `파츠 ${bodies[n].parts}`);
    // 종별 정체성 파츠 — 이 조건이 곧 "그 종으로 읽히는 이유"다(각 조형 주석의 ⑴⑵⑶ 과 같은 목록).
    ok('ⓑ 익룡: 막날개(막 2 + 손가락뼈 6) + 뻣뻣한 꼬리, 고삐는 씌운다',
        bodies['Pterosaur'].wings === 8 && bodies['Pterosaur'].tail && bodies['Pterosaur'].rein,
        `wings ${bodies['Pterosaur'].wings} tail ${bodies['Pterosaur'].tail} rein ${bodies['Pterosaur'].rein}`);
    ok('ⓑ 두발 로봇: 다리 **2개** + 센서 헤드 + 조종 컬럼 + 발광 3점, 고삐 없음',
        bodies['Bipedal Mech'].legs === 2 && bodies['Bipedal Mech'].head && bodies['Bipedal Mech'].bar
        && bodies['Bipedal Mech'].glow >= 3 && !bodies['Bipedal Mech'].rein,
        `legs ${bodies['Bipedal Mech'].legs} head ${bodies['Bipedal Mech'].head} bar ${bodies['Bipedal Mech'].bar} glow ${bodies['Bipedal Mech'].glow}`);
    ok('ⓑ 덤프트럭: 바퀴 4개 + 조종 손잡이 + 헤드라이트 2',
        bodies['Dump Truck'].wheels === 4 && bodies['Dump Truck'].bar && bodies['Dump Truck'].glow === 2,
        `wheels ${bodies['Dump Truck'].wheels} bar ${bodies['Dump Truck'].bar} glow ${bodies['Dump Truck'].glow}`);
    ok('ⓑ 청소로봇: 구동 바퀴 2 + 사이드 브러시 2 + 손잡이',
        bodies['Cleaning Robot'].wheels === 2 && bodies['Cleaning Robot'].spinners === 2 && bodies['Cleaning Robot'].bar,
        `wheels ${bodies['Cleaning Robot'].wheels} brush ${bodies['Cleaning Robot'].spinners} bar ${bodies['Cleaning Robot'].bar}`);
    // 청소로봇 **본체(원반)** 는 낮고 넓어야 한다 — 높으면 룸바가 아니고, 좁으면 그냥 통이다.
    // (안장 포스트·손잡이는 판정에서 뺀다 — `lowBodyBox` 주석 참조.)
    // ⚠️ 기준을 **절대 숫자로 짐작하지 말 것.** 첫 판에 '폭 > 높이×2.5' 로 박았다가 멀쩡한 원반이
    //    2.12 로 걸렸다 — 라이다 돔·LED 까지 본체에 들어가는 게 정상인데 그걸 안 세고 문턱을 정한 것이다.
    //    같은 계열의 **원반이 아닌 종**(자전거·외바퀴)과 비교하는 상대 기준으로 바꿨다: 룸바로 읽히려면
    //    '그 둘보다 확실히 납작해야' 하고, 그건 절대치와 달리 모델을 손봐도 뜻이 안 변한다.
    {
        const ratio = (b) => b.lowBody.high ? b.lowBody.wide / b.lowBody.high : 0;
        const rb = ratio(bodies['Cleaning Robot']), bike = ratio(bodies['Bike']), droid = ratio(bodies['One-Wheel Droid']);
        ok('ⓑ 청소로봇 본체가 낮고 넓다(같은 계열 자전거·외바퀴보다 1.4배 이상 납작)',
            rb >= 2.0 && rb > Math.max(bike, droid) * 1.4,
            `청소로봇 ${rb.toFixed(2)} vs 자전거 ${bike.toFixed(2)} · 외바퀴 ${droid.toFixed(2)} ` +
            `(본체 ${bodies['Cleaning Robot'].lowBody.wide}×${bodies['Cleaning Robot'].lowBody.high})`);
    }
    const fps = NEW4.map(n => bodies[n].fp);
    ok('ⓒ 4종이 서로 다른 그림이다', new Set(fps).size === 4, `서로 다른 메시 ${new Set(fps).size}종`);
    ok('ⓒ 익룡이 미니 드래곤과 다른 그림이다', bodies['Pterosaur'].fp !== bodies['Mini Dragon'].fp);
    ok('ⓒ 덤프트럭·청소로봇이 자전거·외바퀴와 다른 그림이다',
        bodies['Dump Truck'].fp !== bodies['Bike'].fp && bodies['Cleaning Robot'].fp !== bodies['One-Wheel Droid'].fp);
    ok('ⓒ 두발 로봇이 기계 거미와 다른 그림이다', bodies['Bipedal Mech'].fp !== bodies['Mech Spider'].fp);

    for (const n of NEW4) {
        const r = rides[n];
        if (r.err) { ok(`ⓓ ${n}: 탑승`, false, r.err); continue; }
        const grounded = r.hover > 0 ? r.lowY > 0 : Math.abs(r.lowY) <= TOL;
        ok(`ⓓ ${n}: 지면을 뚫거나 뜨지 않는다`, grounded,
            `최하단 y ${r.lowY.toFixed(3)} (hover ${r.hover})`);
        ok(`ⓓ ${n}: 골반이 안장에 얹힌다`, r.fitGap !== null && Math.abs(r.fitGap) <= 0.12,
            `골반−안장 ${r.fitGap === null ? 'n/a' : r.fitGap.toFixed(3)}`);
    }
    ok('ⓔ 두발 로봇이 두 다리로 **교대** 보행한다(같이 나가면 깡충 뛴다)',
        rides['Bipedal Mech'].legAmp > 0.3 && rides['Bipedal Mech'].legAntiphase > 0.8,
        `진폭 ${rides['Bipedal Mech'].legAmp.toFixed(2)}rad · 역위상 프레임 ${(rides['Bipedal Mech'].legAntiphase * 100).toFixed(0)}%`);
    ok('ⓔ 익룡 막날개가 펄럭이고 **손가락뼈도 같이** 움직인다',
        rides['Pterosaur'].wingAmp > 0.5 && rides['Pterosaur'].wingRibAmp > 0.5,
        `막 ${rides['Pterosaur'].wingAmp.toFixed(2)} / 뼈대 ${rides['Pterosaur'].wingRibAmp.toFixed(2)}`);
    ok('ⓔ 덤프트럭 바퀴가 한 방향으로만 굴러간다', rides['Dump Truck'].wheelMono === true);
    ok('ⓔ 청소로봇 바퀴·브러시가 한 방향으로만 돈다',
        rides['Cleaning Robot'].wheelMono === true && rides['Cleaning Robot'].spinMono === true,
        `바퀴 ${rides['Cleaning Robot'].wheelMono} 브러시 ${rides['Cleaning Robot'].spinMono}`);
    ok('ⓕ 신설 biped 계열에 탑승 포즈·조종 컬럼 배선이 다 있다',
        rides['Bipedal Mech'].hasPose && rides['Bipedal Mech'].barReach && rides['Bipedal Mech'].barLive,
        `pose ${rides['Bipedal Mech'].hasPose} barReach ${rides['Bipedal Mech'].barReach} bar ${rides['Bipedal Mech'].barLive}`);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
