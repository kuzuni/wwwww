// hp-juicy 6차 지적 ⓑ('사망 후 빈 바가 시체를 안 따라간다' — B #1) 실측.
// 항목 규칙상 6차 지적은 **미검증**이라 착수 전에 재는 게 먼저다(㉠ 처럼 오지적인 것이 섞여 있다).
//
// 지적의 실체: 5차 교정 ⓓ 는 빈 바의 **수명**만 잡았고(0.19s 드레인 + 0.12s 팝아웃) **앵커**는 안 잡았다.
// 코드를 읽으면 그럴 만하다 — 바 위치는 `update()` 의 `for (const e of Combat.enemies)` 안에서만
// 갱신되는데 처치와 동시에 `e.alive=false` 라 그 루프가 시체를 건너뛴다("update 루프는 !e.alive를
// 건너뛰므로 이 애니메이션이 트랜스폼을 단독 소유한다" — killEnemy 주석). 그동안 시체는
// x +0.22유닛 이동 + y → 0 낙하 + z −1.45rad 회전을 한다. 즉 바는 **죽은 자리에 못 박힌다.**
//
// 재는 것: 처치 순간부터 바가 사라질 때까지 매 프레임
//   ⒜ 바(hpG) 의 화면 좌표  ⒝ 시체(m.g) 의 화면 좌표  ⒞ 둘 사이 거리(px)  ⒟ 바가 아직 보이는가
// 판정: 바가 보이는 동안의 **최대 이탈 거리**가 THRESH_PX 를 넘으면 지적이 맞다.
//
// ⚠️ `enemyMap.delete(id)` 가 애니메이션 끝에 돌므로 `m` 참조를 **처치 전에** 쥔다.
// ⚠️ 좌표는 캔버스 로컬 CSS px 로 통일한다(뷰포트 오프셋을 섞지 않는다 — TODO 상단 함정).
//
// 사용: node tools/probe-deadbar-anchor.js [enemyKind]
// exit 0 = 판정 성공 · 1 = 실행 실패
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';
const THRESH_PX = 20;   // 이보다 벌어지면 '바가 시체를 안 따라간다'가 화면에서 읽힌다

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
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        step(0.5);

        const cv = Scene3D.renderer.domElement, rect = cv.getBoundingClientRect();
        const proj = (v) => {   // 캔버스 로컬 CSS px
            const p = v.clone().project(Scene3D.camera);
            return [(p.x * 0.5 + 0.5) * rect.width, (0.5 - p.y * 0.5) * rect.height];
        };
        const worldOf = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };

        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        const m = Scene3D.enemyMap.get(e.id);   // ⚠️ 처치 전에 쥔다 (애니메이션 끝에 enemyMap 에서 지워진다)
        const id = e.id;

        const barVisible = () => {
            if (!m.hpG || !m.hpG.parent) return false;
            if (!m.hpG.visible) return false;
            let vis = false;
            m.hpG.traverse(o => { if (o.isMesh && o.visible && (!o.material || o.material.opacity === undefined || o.material.opacity > 0.02)) vis = true; });
            return vis;
        };
        const snap = (t) => {
            const alive = !!m.hpG && !!m.hpG.parent;
            const bar = alive ? proj(worldOf(m.hpG)) : null;
            const corpse = m.g.parent ? proj(worldOf(m.g)) : null;
            return {
                t,
                bar: bar ? bar.map(v => +v.toFixed(1)) : null,
                corpse: corpse ? corpse.map(v => +v.toFixed(1)) : null,
                gap: (bar && corpse) ? +Math.hypot(bar[0] - corpse[0], bar[1] - corpse[1]).toFixed(1) : null,
                vis: alive ? barVisible() : false,
                cw: +m.g.position.x.toFixed(3), cy: +m.g.position.y.toFixed(3),
                bw: m.hpG && m.hpG.parent ? +m.hpG.position.x.toFixed(3) : null,
            };
        };

        const rows = [snap(-16)];
        // 진짜 처치 경로 — 논리(onKill/restack)까지 그대로 태운다
        Combat.damageEnemy(e, Big.of(e.hp).mul(10), false, null);
        for (let t = 0; t <= 420; t += 16) { rows.push(snap(t)); step(0.016); }
        return { rows, kind: m.kind, gone: !Scene3D.enemyMap.get(id) };
    });

    const pad = (v, n) => String(v).padStart(n);
    console.log('\n== 사망 후 빈 HP바가 시체를 따라가는가 (%s) ==', out.kind);
    console.log('   시각     바 화면좌표        시체 화면좌표      거리px   바 보임   시체world.x  바world.x');
    let worst = 0, worstT = null;
    for (const r of out.rows) {
        console.log('  %sms  %s  %s  %s  %s  %s  %s',
            pad(r.t < 0 ? '처치전' : '+' + r.t, 6),
            pad(r.bar ? `(${r.bar[0]}, ${r.bar[1]})` : '—', 17),
            pad(r.corpse ? `(${r.corpse[0]}, ${r.corpse[1]})` : '—', 17),
            pad(r.gap === null ? '—' : r.gap, 7), pad(r.vis ? '보임' : '·', 7),
            pad(r.cw, 11), pad(r.bw === null ? '—' : r.bw, 10));
        if (r.vis && r.gap !== null && r.t >= 0 && r.gap > worst) { worst = r.gap; worstT = r.t; }
    }
    const base = out.rows[0].gap || 0;
    console.log('\n  처치 전 기준 거리 = %spx (바는 원래 머리 위라 0 이 아니다 — 이 값 위로 얼마나 더 벌어지는지가 결함이다)', base.toFixed(1));
    console.log('  바가 보이는 동안 최대 거리 = %spx (+%dms) → 기준 대비 **%s%spx 이탈**', worst.toFixed(1), worstT, worst - base >= 0 ? '+' : '', (worst - base).toFixed(1));
    const fail = (worst - base) > THRESH_PX;
    console.log('  판정: %s (한계 %dpx)', fail ? '❌ 지적이 맞다 — 바가 시체를 안 따라간다' : '✅ 따라간다', THRESH_PX);
    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
