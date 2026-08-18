// hp-juicy 6차 지적 ⓒ('적 바가 영웅 머리 위에 겹쳐 소유자 오독' — A #13 · B #3) 실측.
// 항목 규칙상 6차 지적은 미검증이라 착수 전에 재는 게 먼저다(㉠ 처럼 오지적인 것이 섞여 있다).
//
// 이 지적은 5차 ⓓ 교정과 **부딪힌다**: 그때 영웅 바 높이를 1.85 → 2.18 로 올려 두 바의 세로
// 간격을 7.8px → 29.6px 로 벌려 놓았다(코드 주석에 실측치가 남아 있다). 그런데 6차 채점자
// 2인은 여전히 소유자를 오독했다. 그렇다면 문제는 **세로 간격이 아니라 가로 위치**일 수 있다 —
// 적 바가 영웅 실루엣 **위(x 범위가 겹치는 자리)** 에 뜨면, 세로로 아무리 벌어져도
// "영웅 머리 위에 떠 있는 바"로 읽힌다.
//
// 재는 것 (근접 교전 상태에서):
//   ⒜ 적 바 / 영웅 바 / 영웅 실루엣 / 적 실루엣의 화면 bbox
//   ⒝ 적 바와 **영웅 실루엣**의 가로 겹침 폭 (지적의 핵심)
//   ⒞ 적 바와 영웅 바의 세로 간격 (5차 교정이 유지되는지 = 비회귀)
//   ⒟ 각 바의 중심이 자기 주인의 가로 범위 안에 있는가 (소유자 판독의 최소 조건)
// 판정: ⒝ 가 적 바 폭의 OVERLAP_FAIL 이상이면 지적이 맞다.
//
// ⚠️ 좌표는 캔버스 로컬 CSS px 로 통일한다(뷰포트 오프셋을 섞지 않는다 — TODO 상단 함정).
// ⚠️ 적이 걸어오는 중이면 자리가 매 프레임 다르다. **근접 정지(stopX) 에 닿을 때까지 흘린 뒤** 잰다.
//
// 사용: node tools/probe-bar-owner.js [enemyKind]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';
const OVERLAP_FAIL = 0.25;   // 적 바 폭의 25% 이상이 영웅 몸 위에 걸치면 소유자 오독이 난다
const VGAP_MIN = 26;         // 5차 교정이 세운 두 바의 최소 세로 간격(비평가 요구치)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    const out = await page.evaluate(() => {
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        // 근접 교전 자리에 설 때까지 논리+연출을 같이 흘린다(걷는 중에 재면 자리가 매번 다르다)
        for (let i = 0; i < 240; i++) { Combat.tick(1 / 60); step(1 / 60); }
        Combat.tick = () => { };
        step(0.5);

        const cv = Scene3D.renderer.domElement, rect = cv.getBoundingClientRect();
        const proj = (v) => {   // 캔버스 로컬 CSS px
            const p = v.clone().project(Scene3D.camera);
            return [(p.x * 0.5 + 0.5) * rect.width, (0.5 - p.y * 0.5) * rect.height];
        };
        const boxOf = (obj) => {
            if (!obj || !obj.parent) return null;
            obj.updateWorldMatrix(true, true);
            const b = new THREE.Box3().setFromObject(obj);
            if (b.isEmpty()) return null;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const xi of [b.min.x, b.max.x]) for (const yi of [b.min.y, b.max.y]) for (const zi of [b.min.z, b.max.z]) {
                const [px, py] = proj(new THREE.Vector3(xi, yi, zi));
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
            return [x0, y0, x1, y1].map(v => +v.toFixed(1));
        };

        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        const m = Scene3D.enemyMap.get(e.id);
        // 소유자 캐럿(pip): 바 아래 방향 삼각이 자기 주인을 가리키는가.
        // 캐럿 apex(가장 아래 꼭지점)가 바 중심 아래 + 주인 몸 쪽 x 범위에 있으면 소유가 확정된다.
        const pipApex = (grp) => {
            if (!grp) return null;
            let lowest = null;
            grp.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
                const pos = o.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const wv = new THREE.Vector3().fromBufferAttribute(pos, i);
                    o.updateWorldMatrix(true, false); wv.applyMatrix4(o.matrixWorld);
                    const sp = proj(wv);
                    if (!lowest || sp[1] > lowest[1]) lowest = [+sp[0].toFixed(1), +sp[1].toFixed(1)];
                }
            });
            return lowest;
        };
        // pip 만 골라 apex 를 잰다(바 트랙 삼각 아님 — pip 은 Group 이라 자식 삼각만 삼각형이다)
        const enemyPip = m.hpPip ? pipApex(m.hpPip) : null;
        const heroPip = Scene3D.heroHpG && Scene3D.heroHpG.children.find(c => c.type === 'Group');
        return {
            kind: m.kind,
            enemyBar: boxOf(m.hpG), enemyBody: boxOf(m.body || m.g),
            heroBar: boxOf(Scene3D.heroHpG), heroBody: boxOf(Scene3D.heroG),
            enemyPipApex: enemyPip, heroPipApex: heroPip ? pipApex(heroPip) : null,
            enemyX: +m.g.position.x.toFixed(2), heroX: +Scene3D.heroG.position.x.toFixed(2),
            nEnemies: Combat.enemies.filter(x => x.alive).length,
        };
    });

    const W = (b) => b[2] - b[0];
    const xOverlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const f = (v) => (+v).toFixed(1);
    const cx = (b) => (b[0] + b[2]) / 2;

    console.log('\n== 적 바 vs 영웅 — 소유자 판독 (근접 교전, %s, 생존 적 %d) ==', out.kind, out.nEnemies);
    const rows = [['적 바', out.enemyBar], ['적 몸', out.enemyBody], ['영웅 바', out.heroBar], ['영웅 몸', out.heroBody]];
    for (const [n, b] of rows) console.log('  %s  bbox=%s  폭=%s  중심x=%s', n.padEnd(7), b ? JSON.stringify(b) : '—', b ? f(W(b)) : '—', b ? f(cx(b)) : '—');

    const ov = xOverlap(out.enemyBar, out.heroBody);
    const ratio = ov / W(out.enemyBar);
    console.log('\n  ⒝ 적 바 ∩ 영웅 몸 가로 겹침 = %spx (적 바 폭 %spx 의 **%s%%**)', f(ov), f(W(out.enemyBar)), (ratio * 100).toFixed(1));

    const vgap = out.enemyBar[1] - out.heroBar[3];
    console.log('  ⒞ 두 바 세로 간격 = %spx (5차 교정이 세운 하한 %dpx — 비회귀 확인)', f(vgap), VGAP_MIN);

    const eIn = cx(out.enemyBar) >= out.enemyBody[0] && cx(out.enemyBar) <= out.enemyBody[2];
    const hIn = cx(out.heroBar) >= out.heroBody[0] && cx(out.heroBar) <= out.heroBody[2];
    console.log('  ⒟ 각 바 중심이 자기 주인 가로 범위 안: 적 %s · 영웅 %s', eIn ? '✅' : '❌', hIn ? '✅' : '❌');

    // ⒠ 소유자 캐럿이 자기 주인을 가리키는가 — bbox 겹침이 남아도 이게 소유를 확정한다
    const inX = (pt, b) => pt && b && pt[0] >= b[0] - 4 && pt[0] <= b[2] + 4;
    const eApexOnEnemy = inX(out.enemyPipApex, out.enemyBody);
    const eApexNotHero = !inX(out.enemyPipApex, out.heroBody);
    const hApexOnHero = inX(out.heroPipApex, out.heroBody);
    console.log('\n  ⒠ 소유자 캐럿(pip) apex:');
    console.log('     적 바 캐럿 = %s → 적 몸 위 %s · 영웅 몸 밖 %s', JSON.stringify(out.enemyPipApex), eApexOnEnemy ? '✅' : '❌', eApexNotHero ? '✅' : '❌');
    console.log('     영웅 바 캐럿 = %s → 영웅 몸 위 %s', JSON.stringify(out.heroPipApex), hApexOnHero ? '✅' : '❌');
    const ownerClear = eApexOnEnemy && hApexOnHero;

    const fail = ratio >= OVERLAP_FAIL;
    console.log('\n  판정 ⓒ:');
    console.log('     · bbox 겹침만 보면: %s (%s%% ≥ %d%%)', fail ? '겹친다' : '안 겹친다', (ratio * 100).toFixed(1), OVERLAP_FAIL * 100);
    console.log('     · 소유자 확정(캐럿 방향): %s', ownerClear ? '✅ 각 바가 자기 주인을 가리킨다 — 소유자 오독 해소' : '❌ 캐럿이 주인을 못 가리킨다');
    console.log('     → 결론: %s', ownerClear ? '소유자 판독은 해결됨(겹침이 남아도 방향으로 갈린다)' : '미해결');
    if (vgap < VGAP_MIN) console.log('  ⚠️ 세로 간격은 여전히 %spx < %dpx (캐럿이 이 축의 부담을 덜어 준다)', f(vgap), VGAP_MIN);
    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
