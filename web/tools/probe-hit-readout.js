// 비평가 5차 지적 ①②(치명·높음) 교차검증 — **비평가 수치를 그대로 믿지 말라**는 TODO 규칙에 따라
// 코드가 실제로 만드는 값을 같은 좌표계에서 다시 잰다.
//   ① "처치 프레임(+16ms)에 적 HP바가 아직 48% 차 있다" → 처치 후 시각별 앞바/잔상바 채움 비율
//   ② "임팩트 프레임에 데미지 숫자가 적 HP바를 덮는다"   → 숫자 rect 와 바 rect 의 **겹침 면적**
//
// ⚠️ 좌표계: 바는 3D 메시라 카메라로 투영해 **뷰포트 픽셀**로 바꾸고, 숫자는 getBoundingClientRect(뷰포트)를
//    쓴다. el.style.top(캔버스 로컬)과 절대 섞지 말 것 — 앞 세션이 이 함정으로 없는 결함을 만들었다.
// ⚠️ 시간축: 실프레임이 아니라 1/120 서브스텝 수동 구동이라 헤드리스 프레임률과 무관하게 결정적이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    // ⚠️ 위 대기 1.2초 동안에도 전투는 계속 돈다 — 그 사이 적이 죽어 `enemies.find(alive)` 가
    //    undefined 가 되는 플레이크를 실제로 밟았다. 측정 직전에 **살아 있는 적이 생길 때까지**
    //    다시 기다린다(전투를 먼저 얼리면 새 웨이브가 안 나와 영영 못 기다린다).
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 20000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.walking = false;                       // 행군 중이면 월드가 밀려 좌표가 흔들린다
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) real(1 / 120); };

        const cv = Scene3D.renderer.domElement;
        const rect = cv.getBoundingClientRect();
        // 3D 오브젝트의 화면 바운딩 박스(뷰포트 px) — 월드 AABB 8꼭짓점을 투영한다.
        const screenBox = (obj) => {
            obj.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(obj);
            if (box.isEmpty()) return null;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const xi of [box.min.x, box.max.x]) for (const yi of [box.min.y, box.max.y]) for (const zi of [box.min.z, box.max.z]) {
                const v = new THREE.Vector3(xi, yi, zi).project(Scene3D.camera);
                const px = rect.left + (v.x * 0.5 + 0.5) * rect.width;
                const py = rect.top + (0.5 - v.y * 0.5) * rect.height;
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
            return [x0, y0, x1, y1].map(v => +v.toFixed(1));
        };
        const overlap = (a, b) => {
            if (!a || !b) return null;
            const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
            const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
            if (w <= 0 || h <= 0) return { px: 0, ratio: 0 };
            const area = w * h, numArea = (b[2] - b[0]) * (b[3] - b[1]);
            return { px: +area.toFixed(0), ratio: +(area / numArea).toFixed(3), w: +w.toFixed(1), h: +h.toFixed(1) };
        };
        const newestNum = () => {
            const els = [...Scene3D.fxLayer.querySelectorAll('.float-dmg')];
            if (!els.length) return null;
            const el = els[els.length - 1];
            const r = el.getBoundingClientRect();
            return { text: el.textContent, rect: [r.left, r.top, r.right, r.bottom].map(v => +v.toFixed(1)) };
        };

        const e = Combat.enemies.find(x => x.alive);
        const m = Scene3D.enemyMap.get(e.id);
        const res = { hit: [], kill: [], barBaseline: null };

        // ── ② 일반 타격 임팩트 프레임: 숫자 vs 바 겹침 ──
        res.barBaseline = screenBox(m.hpBg);
        Combat.damageEnemy(e, Big.of(140), false, null);
        step(0.016);
        {
            const bar = screenBox(m.hpBg), num = newestNum();
            res.hit.push({ t: 16, bar, num: num && num.rect, text: num && num.text, overlap: overlap(bar, num && num.rect) });
        }
        step(0.05);
        {
            const bar = screenBox(m.hpBg), num = newestNum();
            res.hit.push({ t: 66, bar, num: num && num.rect, text: num && num.text, overlap: overlap(bar, num && num.rect) });
        }

        // ── ① 처치: 시각별 앞바/잔상바 채움 ──
        // ⚠️ 위 140 타격으로 적이 이미 빈사면 기준값이 무너져 비율이 의미를 잃는다(실측으로 밟았다:
        //    v0=0.001 이라 잔상바 비율이 922 로 찍혔다). **체력을 만땅으로 되돌린 뒤** 처치한다.
        e.hp = e.maxHp ? (e.maxHp.clone ? e.maxHp.clone() : e.maxHp) : e.hp;
        step(0.05);   // driveHpBar 가 앞바를 만땅으로 되돌릴 한 프레임
        if (m.hpFg) { m.hpFg.scale.x = 1; m.hpFg.position.x = 0; }
        if (m.hpGhost) { m.hpGhost.scale.x = 1; m.hpGhost.position.x = 0; m.ghostV = 1; }
        const v0 = m.hpFg ? m.hpFg.scale.x : null;
        Combat.damageEnemy(e, Big.of(1e9), true, null);
        const snap = (t) => {
            const num = newestNum();
            res.kill.push({
                t,
                // **절대값**으로 준다 — scale.x 1.0 = 트랙이 꽉 참, 0 = 비었다. 비평가의 '48% 차 있다'와 직접 비교된다.
                front: m.hpFg ? +m.hpFg.scale.x.toFixed(3) : null,
                ghost: m.hpGhost ? +m.hpGhost.scale.x.toFixed(3) : null,
                ghostVisible: m.hpGhost ? m.hpGhost.visible : null,
                // ⚠️ `m.hpBg.visible` 은 **끝까지 true 다** — 팝아웃은 부모 그룹의 visible 과
                //    재질 opacity 로 끄기 때문이다. 이걸로 '바가 사라졌나'를 판정하면 영원히 '보임'이라
                //    비평가 ⓓ('사망 후 빈 바가 허공에 남는다')를 프로브가 절대 못 잡는다.
                barVisible: m.hpBg && m.hpBg.parent
                    ? (m.hpBg.parent.visible && m.hpBg.material.opacity > 0.02) : null,
                barOpacity: m.hpBg ? +m.hpBg.material.opacity.toFixed(3) : null,
                numText: num && num.text,
            });
        };
        step(0.016); snap(16);
        step(0.08); snap(96);
        step(0.084); snap(180);
        step(0.08); snap(260);
        step(0.086); snap(346);
        res.v0 = +v0.toFixed(3);
        return res;
    });

    console.log('\n── ② 임팩트 프레임: 데미지 숫자 vs 적 HP바 (뷰포트 px) ──');
    for (const h of out.hit) {
        console.log('  +%dms  바=%s  숫자("%s")=%s', h.t, JSON.stringify(h.bar), h.text, JSON.stringify(h.num));
        console.log('         겹침: %s', h.overlap ? JSON.stringify(h.overlap) : '(측정 불가)');
    }
    console.log('  판정: overlap.ratio 가 0 이면 지적 ②는 오지적, 0 보다 크면 실재한다 (ratio = 숫자 면적 중 바에 먹힌 비율).');

    console.log('\n── ① 처치 후 HP바 채움 (처치 직전 폭 = 1.000) ──');
    console.log('  처치 직전 앞바 scale.x = %s', out.v0);
    for (const k of out.kill) {
        console.log('  +%sms  앞바=%s  잔상바=%s(visible %s)  바보임=%s(opacity %s)  숫자="%s"',
            k.t, String(k.front).padStart(5), String(k.ghost).padStart(5), k.ghostVisible,
            k.barVisible, k.barOpacity, k.numText);
    }
    console.log('  판정: 비평가는 +16ms 에 "약 48% 차 있다"고 했다 — 앞바 값이 그 근처면 지적이 맞다.');
    {
        // 비평가 5차 ⓓ: "사망 후 빈 HP바가 허공에 남는다"(A #7 · B #8) — b3(+346ms)에 빈 바가 있는데
        // 시체는 이미 130px 오른쪽·아래다. 바가 비는 시각(잔상까지 0)과 사라지는 시각의 **간격**이 결함이다.
        const emptied = out.kill.find(k => k.front <= 0.01 && k.ghost <= 0.01);
        const gone = out.kill.find(k => !k.barVisible);
        const late = out.kill.find(k => k.t >= 346 && k.barVisible);
        console.log('  ⓓ 빈 트랙이 된 시각 %s / 바가 사라진 시각 %s',
            emptied ? '+' + emptied.t + 'ms' : '(구간 내 없음)', gone ? '+' + gone.t + 'ms' : '(구간 내 없음)');
        console.log('  ⓓ 판정: +346ms 에 빈 바가 %s → %s', late ? '남아 있다' : '없다', late ? 'FAIL' : 'PASS');
    }

    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
