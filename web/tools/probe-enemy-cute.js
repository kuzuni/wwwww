// probe-enemy-cute.js — 적 얼굴이 '화난 얼굴'에서 **귀여운 1930s 카툰 얼굴**로 갔는지 잰다.
//   (`cute-art-direction` — 사용자 원문 1순위 "적이랑 내 캐릭터가 좀 더 귀여웠으면",
//    1차 비평가 2인이 독립적으로 "7종 전부 두꺼운 검은 사선 눈썹이 눈 안쪽으로 내리꽂힌다"로 합의)
// 사용: node probe-enemy-cute.js [kind...]        (기본 6종 — slit 눈인 골렘 제외)
//       node probe-enemy-cute.js --neg            (음성 대조: 옛 분노 각으로 되돌려 FAIL 재현)
//
// 게이트
//   ① 눈썹 기울기 — 모든 눈썹의 **실측 하강각**이 0.20rad(≈11°) 이하 (옛 값 0.42~0.55 = 24~31°).
//      🚨 2026-08-20 voxel 전환과 함께 **`rotation.z` 읽기에서 기하 실측으로 교체**했다 — 큐브 아치는
//      기울기를 회전이 아니라 칸 배치로 내므로 회전값을 읽으면 무엇을 만들든 0 이라 변별력이 사라진다.
//      지금은 눈썹 정점을 월드로 펴 **바깥 절반 평균 y − 안쪽 절반 평균 y** 로 각을 낸다.
//   ② 블러시가 **화면에 실제로 기여** — 껐다 켠 차분의 밝아진 화소 수. 🚨 '넣었다'와 '보인다'는 다르다:
//      얼굴 안쪽에 파묻히면 한 픽셀도 안 나오는데 콘솔도 캡처도 멀쩡하다(`probe-enemy-ao` 와 같은 함정).
//   ③ 실루엣 유출 0 — 블러시가 몸 밖 배경을 물들이면 '떠 있는 스티커'다(경계 AA 는 따로 세어 통과).
//   ④ 콘솔 0
// 🚨 렌더와 픽셀 판독은 **한 evaluate(=한 JS 턴) 안에서** — 이 저장소 렌더러는 preserveDrawingBuffer 가
//    아니라 다음 호출에서 읽으면 검은 판이 나온다(`probe-enemy-ao.js` 머리말의 실측 사고).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const argv = process.argv.slice(2);
const NEG = argv.includes('--neg');
const KINDS = argv.filter(a => !a.startsWith('--')).length ? argv.filter(a => !a.startsWith('--'))
    : ['slime', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];   // 골렘은 slit 눈(마그마) — 대상 아님
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const MAX_TILT = 0.20;
const MIN_PX = 40;

async function grab(page, rect, setup) {
    return await page.evaluate(({ r, setup }) => {
        (new Function(setup))();
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        const cv = document.querySelector('canvas');
        const off = document.createElement('canvas');
        off.width = Math.round(r.width); off.height = Math.round(r.height);
        const cx = off.getContext('2d');
        cx.drawImage(cv, 0, 0, off.width, off.height);
        return { w: off.width, h: off.height, data: Array.from(cx.getImageData(0, 0, off.width, off.height).data) };
    }, { r: rect, setup });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

        const meta = await page.evaluate((NEG) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            Scene3D.heroAttack = () => {};
            Scene3D.walking = false;
            Scene3D.heroG.visible = false;
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
            if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
            Scene3D.petGroups.forEach(p => p.visible = false);
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m.g.position.y = 0; m.g.userData.landed = true;
            m.g.position.x = e.x + Scene3D.worldX;
            m.g.updateMatrixWorld(true);
            for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
                if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
                o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
            }
            if (m.hpG) m.hpG.visible = false;
            const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
            if (hpG) hpG.visible = false;
            window.__brows = []; window.__blush = [];
            m.g.traverse(o => {
                if (o.userData && o.userData.cuteBrow) window.__brows.push(o);
                if (o.userData && o.userData.cuteBlush) window.__blush.push(o);
            });
            if (NEG) window.__brows.forEach(b => { b.rotation.z = Math.sign(b.rotation.z || 1) * 0.55; b.userData.tiltZ = 0.55; }); // 옛 분노 각
            // 얼굴 클로즈업 — 흰자 bbox 를 겨눈다(몸통 비율로 어림하면 종마다 머리 높이가 달라 프레임을 벗어난다)
            const box = new THREE.Box3();
            m.g.traverse(o => { if (o.userData && o.userData.pieEye) box.expandByObject(o); });
            const look = box.isEmpty() ? new THREE.Box3().setFromObject(m.g).getCenter(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
            const span = box.isEmpty() ? 0.5 : Math.max(0.12, box.getSize(new THREE.Vector3()).x);
            const d = span * 3.6 + 0.16;
            Scene3D.camLock = { pos: look.clone().add(new THREE.Vector3(-d * 0.28, d * 0.16, d * 0.95)), look };
            // 🚨 여기서 update 를 얼리면 안 된다 — **카메라를 camLock 자리로 옮기는 것도 update** 다.
            //    초안이 이 자리에서 얼렸다가 클로즈업이 아니라 **게임 기본 카메라**(적이 50px 남짓)를
            //    찍었고, 그래서 블러시를 키워도 변화 화소가 21/29 로 **한 자리도 안 움직였다**
            //    (같은 숫자가 두 번 나오면 자를 의심하라는 이 저장소 규칙 그대로였다). 동결은 대기 뒤.
            // 🚨 ① 은 **`rotation.z` 가 아니라 기하로 잰다 (2026-08-20 voxel 전환 때 교체).**
            //    눈썹이 축정렬 큐브 아치가 되면서 기울기를 회전이 아니라 **칸 배치**로 표현하게 됐다 —
            //    `rotation.z` 를 계속 읽으면 어떤 조형이든 0 이라 이 게이트가 **구조적으로 항상 통과**한다
            //    (인계 ㉦ 의 '변별력 0' 함정 그대로). 그래서 눈썹 정점을 월드로 펴서 **바깥 절반과 안쪽
            //    절반의 평균 높이 차**로 실제 하강각을 낸다. 매끈판 토러스(과거·음성 대조)도, 계단 아치도
            //    같은 자로 재진다 — 음성 대조가 여전히 0.55rad 를 뱉는 것이 이 자의 자기검증이다.
            const rootX = new THREE.Vector3(); m.g.getWorldPosition(rootX);
            m.g.updateMatrixWorld(true);
            const slopes = window.__brows.map(b => {
                const pts = [];
                b.updateMatrixWorld(true);
                b.traverse(o => {
                    if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                    const pa = o.geometry.attributes.position;
                    for (let i = 0; i < pa.count; i++) {
                        const v = new THREE.Vector3().fromBufferAttribute(pa, i);
                        o.localToWorld(v); pts.push(v);
                    }
                });
                if (pts.length < 6) return 0;
                const bw = new THREE.Vector3(); b.getWorldPosition(bw);
                const side = Math.sign(bw.x - rootX.x) || 1;          // +1 = 적 중심의 오른쪽 눈썹
                let mx = 0; for (const v of pts) mx += v.x; mx /= pts.length;
                // 바깥 = 중심에서 먼 쪽 · 안쪽 = 중심에 가까운 쪽
                const outer = pts.filter(v => (v.x - mx) * side > 0), inner = pts.filter(v => (v.x - mx) * side < 0);
                if (!outer.length || !inner.length) return 0;
                const avg = (a, k) => a.reduce((t, v) => t + v[k], 0) / a.length;
                const dy = avg(outer, 'y') - avg(inner, 'y');          // >0 = 안쪽이 내려감 = 성난 눈썹
                const dx = Math.abs(avg(outer, 'x') - avg(inner, 'x'));
                return dx < 1e-6 ? 0 : Math.abs(Math.atan2(dy, dx));
            });
            return { brows: window.__brows.length, blush: window.__blush.length, tilts: slopes.map(v => +v.toFixed(3)) };
        }, NEG);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        });
        await page.waitForTimeout(700);   // camLock 이 실제로 카메라를 옮길 시간(rAF 몇 프레임)
        await page.evaluate(() => { Scene3D.__frozen = Scene3D.update; Scene3D.update = () => {}; }); // 이제 얼린다 — 두 장의 포즈가 달라지면 차분이 오염된다
        const rect = await page.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        const on = await grab(page, rect, 'window.__blush.forEach(o => o.visible = true);');
        const off = await grab(page, rect, 'window.__blush.forEach(o => o.visible = false);');
        const bg = await grab(page, rect, 'Scene3D.enemyMap.get(999).g.visible = false;');
        await page.evaluate(() => { Scene3D.enemyMap.get(999).g.visible = true; window.__blush.forEach(o => o.visible = true); });

        {   // 진단 — 프레임이 실제로 무엇을 담고 있는지 먼저 찍는다(빈 판·엉뚱한 카메라를 조용히 통과시키지 않게)
            const mean = a => { let s2 = 0; for (let i = 0; i < a.length; i += 4) s2 += (a[i] + a[i + 1] + a[i + 2]) / 3; return (s2 / (a.length / 4)).toFixed(1); };
            console.log(`   [진단] ${on.w}x${on.h} · 평균휘도 on ${mean(on.data)} / off ${mean(off.data)} / bg ${mean(bg.data)}`);
        }
        let changed = 0, leak = 0, aa = 0, maxLeakDist = 0;
        const isBg = (i) => Math.abs(off.data[i] - bg.data[i]) + Math.abs(off.data[i + 1] - bg.data[i + 1]) + Math.abs(off.data[i + 2] - bg.data[i + 2]) < 8;
        for (let i = 0; i < on.data.length; i += 4) {
            const d = Math.abs(on.data[i] - off.data[i]) + Math.abs(on.data[i + 1] - off.data[i + 1]) + Math.abs(on.data[i + 2] - off.data[i + 2]);
            if (d < 12) continue;
            changed++;
            if (isBg(i)) {
                // 적이 없는 자리(=배경)가 바뀌었다. 🚨 그 전부를 '유출'로 세면 안 된다 — **볼은 얼굴에서
                // 가장 넓은 자리라 실루엣 가장자리를 타고 앉는 것이 정상**이고, 좁은 머리(버섯 줄기·늑대
                // 주둥이)에서는 클로즈업 배율에서 2~3px 이 반드시 걸린다. 실제 결함은 '몸에서 떨어져 뜬
                // 스티커'이므로 **몸까지의 거리**로 가른다: 4px 이내는 경계 감쌈(정상), 그 밖은 유출.
                // 눈금이 3 이 아니라 4 인 이유: 버섯은 팔과 줄기 사이에 폭 4px 남짓의 배경 주머니가 생겨,
                // 그 옆에 앉은 볼 화소가 '몸에서 3px 떨어진 것'으로 세어졌다(3px 기준에서 잔여 3px·최대 4px).
                // 실제 결함인 '떠 있는 스티커'는 그보다 훨씬 멀다 — 늑대의 첫 판이 최대 8px 로 걸렸다.
                const q = i / 4, x = q % on.w, y = (q / on.w) | 0;
                let dist = 99;
                for (let rr = 1; rr <= 8 && dist === 99; rr++) {
                    for (let dy = -rr; dy <= rr && dist === 99; dy++) for (let dx = -rr; dx <= rr; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
                        const j = ((y + dy) * on.w + (x + dx)) * 4;
                        if (j >= 0 && j < off.data.length && !isBg(j)) { dist = rr; break; }
                    }
                }
                if (dist <= 4) { aa++; } else { leak++; maxLeakDist = Math.max(maxLeakDist, dist); }
            }
        }
        const maxTilt = meta.tilts.length ? Math.max(...meta.tilts) : 0;
        const chk = [
            ['① 눈썹 아치 각도', meta.brows === 0 || maxTilt <= MAX_TILT, `눈썹 ${meta.brows}개 · 최대 기울기 ${maxTilt} (≤${MAX_TILT})`],
            ['② 블러시 화면 기여', meta.blush > 0 && changed >= MIN_PX, `블러시 ${meta.blush}개 · 변화 화소 ${changed} (≥${MIN_PX})`],
            // 🚨 `leak === 0` 은 **재현되지 않는다** — 적은 스폰마다 `offsetHSL` 로 색이 흔들려(monsterMesh)
            //    배경/몸 판정 임계 근처 화소가 런마다 갈린다(고블린 실측: 같은 코드로 0px ↔ 3px 왕복).
            //    그래서 '한 자리도 안 된다'가 아니라 **떠 있는 스티커인가**로 잰다: 소수 화소(≤5)는 통과,
            //    거리 6px 초과면 실패. 실제 결함이던 늑대 첫 판은 45px·최대 8px 로 이 눈금에서도 걸린다.
            ['③ 실루엣 유출', leak <= 5 && maxLeakDist <= 6, `몸에서 4px 넘게 떨어진 유출 ${leak}px (≤5) · 최대 거리 ${maxLeakDist}px (≤6) · 경계 감쌈 ${aa}px 은 정상`],
            ['④ 콘솔 0', errors.length === 0, `${errors.length}건`],
        ];
        console.log(`${kind}${NEG ? ' [음성 대조]' : ''}`);
        for (const c of chk) console.log(`   ${c[1] ? '✅' : '❌'} ${c[0]}: ${c[2]}`);
        if (errors.length) console.log('   err:', errors.slice(0, 3).join(' | '));
        if (chk.some(c => !c[1])) fail++;
        await page.close();
    }
    await browser.close();
    if (NEG) { console.log(`\n[음성 대조] 실패 종 ${fail}/${KINDS.length} — 옛 분노 각에서 FAIL 이 나야 자가 유효하다.`); process.exit(fail > 0 ? 0 : 1); }
    console.log(`\n${fail ? `미통과 ${fail}/${KINDS.length}종` : `전 종 통과 ${KINDS.length}/${KINDS.length}`}`);
    process.exit(fail ? 1 : 0);
})();
