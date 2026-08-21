// 근접 공격 스윙의 **프레임 단위 타이밍** 실측 — "스윙이 부자연스럽다"(사용자 2026-08-21) 진단·회귀용.
//
// 왜 이 자가 필요했나 — 스윙 결함은 정지 스크린샷으로 안 보인다. 실제로 이 프로브가 잡아낸 것들:
//   ⓐ **와인드업이 어깨 클램프에 잘려 5프레임(83ms) 완전 정지** 뒤 한 프레임에 1.185rad(68°) 순간이동.
//      (박스 리그 `_simple` 클램프 하한이 −0.85 였고 클립 와인드업 키는 −2.35~−2.95 였다.)
//   ⓑ **하체 진폭 0.000** — 근접 클립에 hip/knee 트랙이 없어 상체만 휘두르고 발이 마네킹.
//   ⓒ **돌진이 완전 선형 삼각파** — Δx 가 22프레임 내내 ±0.067 로 고정(가속도 0, 예비도 여운도 없음).
//   ⓓ **클립이 돌진보다 83ms 먼저 끝나** 얼어붙은 포즈가 미끄러져 복귀.
//   ⓔ **종료 프레임에 무기 파지각이 1.682rad(96°) 스냅**.
//
// ⚠️ 헤드리스에서는 rAF 가 사실상 안 돈다(실측 500ms 에 1프레임). `Scene3D.update(dt)` 를 **직접**
//    1/60 씩 밀어야 벽시계 타임라인이 잡힌다(`heroRig._t` 만 찍는 방식은 돌진·무기각을 못 본다).
// 사용: node probe-swing-timing.js [무기타입(기본 sword)]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const WT = process.argv[2] || 'sword';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig, null, { timeout: 120000 });

    const out = await page.evaluate((wt) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        S.equipment.weapon = { wtype: wt, id: wt, age: 1, ageIdx: 1, rarity: 'common', lv: 1 };
        Scene3D.refreshHeroEquip();
        const R = Scene3D.heroRig, dt = 1 / 60;
        Scene3D.anims.length = 0; Scene3D._attacking = false;
        Scene3D.heroPlay(['Idle']);
        for (let i = 0; i < 20; i++) Scene3D.update(dt);   // 대기 자세 안정화
        Scene3D.anims.length = 0; Scene3D._attacking = false;
        const grip = (Scene3D._gripRot || [0, 0, 0]).map(v => +v.toFixed(3));
        Scene3D.heroAttack(-1);
        const q = new THREE.Quaternion(), prev = new THREE.Quaternion();
        const rows = []; let first = true;
        for (let i = 0; i < 60; i++) {
            Scene3D.update(dt);
            Scene3D.heroG.updateMatrixWorld(true);
            Scene3D.weaponG.getWorldQuaternion(q);
            const dq = first ? 0 : 2 * Math.acos(Math.min(1, Math.abs(q.dot(prev))));
            first = false; prev.copy(q);
            rows.push({
                ms: Math.round(i * 1000 / 60), atk: !!Scene3D._attacking,
                shR: +R.bones.shoulderR.rotation.x.toFixed(4),
                hipL: +R.bones.hipL.rotation.x.toFixed(3), kneeR: +R.bones.kneeR.rotation.x.toFixed(3),
                hx: +Scene3D.heroG.position.x.toFixed(4), dq: +dq.toFixed(4),
            });
            if (!Scene3D._attacking && i > 3) break;
        }
        return { grip, rows, wtypeId: Scene3D.wtypeId };
    }, WT);

    const live = out.rows.filter(r => r.atk);
    let prev = null, freeze = 0, maxSh = 0, maxHx = 0, maxDq = 0;
    console.log(`무기 ${WT}(${out.wtypeId}) · 파지각 [${out.grip}] · 스윙 ${live.length}프레임 (${Math.round(live.length / 60 * 1000)}ms)`);
    for (const r of out.rows) {
        const dsh = prev ? r.shR - prev.shR : 0, dhx = prev ? r.hx - prev.hx : 0;
        if (prev && r.atk) {
            if (Math.abs(dsh) < 0.002) freeze++;
            maxSh = Math.max(maxSh, Math.abs(dsh)); maxHx = Math.max(maxHx, Math.abs(dhx)); maxDq = Math.max(maxDq, r.dq);
        }
        console.log(`${String(r.ms).padStart(4)}ms atk${r.atk ? 1 : 0} 어깨${r.shR.toFixed(3).padStart(7)} Δ${(dsh >= 0 ? '+' : '') + dsh.toFixed(3)}`
            + ` 고관절${r.hipL.toFixed(2).padStart(6)} 무릎${r.kneeR.toFixed(2).padStart(6)}`
            + ` x${r.hx.toFixed(3).padStart(7)} Δ${(dhx >= 0 ? '+' : '') + dhx.toFixed(3)} 무기각속 ${r.dq.toFixed(3)}`);
        prev = r;
    }
    const hip = live.map(r => r.hipL), knee = live.map(r => r.kneeR);
    console.log('── 요약 ───────────────────────────────');
    console.log(`  어깨 정지 프레임(|Δ|<0.002): ${freeze}   ← 0 이어야 한다(와인드업 평지 = 클램프 잘림)`);
    console.log(`  하체 진폭: 고관절 ${(Math.max(...hip) - Math.min(...hip)).toFixed(3)} · 무릎 ${(Math.max(...knee) - Math.min(...knee)).toFixed(3)}   ← 0.000 이면 마네킹`);
    console.log(`  최대 어깨 Δ ${maxSh.toFixed(3)}rad/f · 최대 돌진 Δ ${maxHx.toFixed(3)}/f · 최대 무기 각속 ${maxDq.toFixed(3)}rad/f`);
    console.log(`  클립·돌진 동시 종료 여부: 마지막 공격 프레임 ${live.length ? live[live.length - 1].ms : '-'}ms`);
    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
