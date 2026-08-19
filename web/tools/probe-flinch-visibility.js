// 일반 타격의 **플린치가 접촉 프레임에 실제로 보이는가** (hp-juicy 7차 잔여 ㉮)
// 사용: node tools/probe-flinch-visibility.js   (종료코드 0 = 통과)
//
// 배경: 7차 비평가가 "일반 타격은 a0→a1 포즈가 같아 보인다"고 지적했다. 항목 메모는 이걸
// **먼저 실측하라**고 남겼다 — 스쿼시는 코드에 분명히 있고(`punchAmp`), 캡처 아티팩트일
// 가능성이 있어서다. 이 도구는 그 둘을 갈라 본다:
//   ⓐ 지오메트리에 압축이 **있는가**      → 몸통만(림 셸 끈 채) 투영 폭
//   ⓑ 화면 실루엣이 **바뀌는가**          → 렌더된 픽셀 마스크 폭
// 둘이 갈리면 "연출은 있는데 안 보인다"이고, 그때 범인은 같은 프레임에 켜지는 다른 층이다.
//
// 🚨 이 도구가 세운 가설(그리고 실측이 지지한 것): `hitEnemy` 는 같은 프레임에
// `flashMesh`(몸 압축)와 `rimFlash(scale 1.15)`(몸 바깥으로 부푸는 BackSide 셸)를 **같이** 켠다.
// 몸이 x 로 7.6% 눌리는 동안 그 몸을 감싼 셸이 15% 커지므로, **눈이 읽는 바깥 실루엣은
// 오히려 넓어진다.** 스쿼시를 아무리 키워도 셸이 그만큼 덮으면 포즈는 안 변한 것으로 읽힌다.
//
// 하네스 규약(이 저장소가 여러 번 밟은 함정 회피 — TODO 함정 ③④, 항목 메모 ⓔ㉠~㉢):
// ① **자 점검 먼저** — '적을 숨겼다 켜면 그 영역이 변하는가'. 통과 못 하면 어떤 판정도 하지 않는다.
//    (적이 화면 밖이면 모든 지표가 0 으로 나와 멀쩡한 코드를 반려한다 — 실제로 겪은 사고다.)
// ② 픽셀은 `gl.readPixels` 로 드로잉 버퍼 직독. 스크린샷 경로는 캔버스 y 오프셋이 끼어 어긋난다.
// ③ 프레임은 **직접** 돌린다. 렌더 루프 dt 가 `Math.min(0.1,…)` 라 소프트 렌더에서는 한 프레임에
//    0.1초가 지나 연출이 통째로 끝난다. 접촉 프레임(+16ms)은 `update(1/60)` **한 번**으로 만든다.
// ④ 인자를 손으로 베끼지 않는다 — 실제 `Scene3D.hitEnemy` 를 실제 경로로 부르고, 코드가 정한
//    `punchAmp` 를 출력에 찍는다(옛 값으로 재서 '고쳤는데 안 변한다'가 나오는 함정 ④⑴).
// ⑤ 대상은 **표식/참조로** 쥔다 — 타입으로 찾으면 같은 프레임의 플레어·파편이 섞인다(함정 ④⑵).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const COVER_MIN = 0.20;   // 자 점검: 측정 사각형에서 적이 덮은 픽셀 비율 하한(적이 화면 안에 있는가)
const SQUASH_MIN = 0.045; // ⓐ 지오메트리 압축 하한 — 몸통 투영 폭이 최소 4.5% 줄 것
const SIL_MIN = 0.10;     // ⓓ 실루엣 XOR 하한 — 플린치를 껐다 켰을 때 실루엣의 10% 이상이 갈릴 것
const POSE_MIN = 0.12;       // ⓓ 관절 최대 변화 하한(rad, ≈6.9°) — 이 아래면 '같은 조각상'으로 읽힌다
const POSE_JOINTS_MIN = 4;   // ⓔ 함께 반응해야 하는 관절 수 — 한 축만 움직이면 '기울었다'로만 읽힌다
const LEAK_MAX = 0.05;       // ⓖ 수명 뒤 허용 잔여(rad) — 가산 층은 안 되돌리면 그 적이 뒤틀린 채 굳는다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    // 결정론적 월드 — 소품·풀 배치와 적 색 지터가 Math.random 에 걸려 런마다 값이 흔들린다
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?enemy=goblin', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ COVER_MIN, SQUASH_MIN, SIL_MIN, POSE_MIN, POSE_JOINTS_MIN, LEAK_MAX }) => {
        const out = { lines: [], ok: true, nums: {} };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        const note = m => out.lines.push('  · ' + m);

        // ── 무대 고정: 전투·렌더 루프를 세우고 깨끗한 적 하나를 화면 안에 놓는다 ──
        Combat.tick = () => {};
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {}; // 동결 후 잔여 setTimeout 발 공격 차단
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 1e9, maxHp: 1e9 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        if (!m) return { lines: ['FAIL enemyMap 에 3D 개체가 없다'], ok: false };
        // 스폰 연출을 즉시 완료하고 잔여 파티클을 걷는다(밀린 연출이 좌표를 서로 덮어쓴다 — 함정 ③)
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        // 화면 안 고정 위치로. 스폰 x 는 화면 밖(오른쪽 끝)이라 두면 모든 지표가 0 이 된다.
        m.g.position.set(Scene3D.heroG.position.x + 1.7, 0, 0);
        m.g.userData.landed = true;
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
        if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();

        // ── 측정 사각형: 적 주변을 넉넉히(넉백·셸이 삐져나가도 담기게) ──
        const bodyBox = () => new THREE.Box3().setFromObject(m.g);
        const rectOf = (box, padX, padY) => {
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
            const rx = Math.max(0, Math.round(x0 * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0) * dpr));
            const ryTop = Math.max(0, Math.round(y0 * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0) * dpr));
            return { x: rx, y: Math.max(0, ch - (ryTop + rh)), w: Math.max(1, rw), h: Math.max(1, rh) }; // readPixels 는 아래가 원점
        };
        const rect = rectOf(bodyBox(), 0.35, 0.25);

        const readRect = () => {
            const buf = new Uint8Array(rect.w * rect.h * 4);
            gl.readPixels(rect.x, rect.y, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            return buf;
        };
        const shot = () => { Scene3D.renderFrame(); return readRect(); };

        // 마스크 = '적을 숨기면 달라지는 픽셀'. 색거리 임계 — 휘도만 쓰면 초록 고블린×초원에서 뭉갠다.
        const maskOf = (withEnemy, without) => {
            const mask = new Uint8Array(rect.w * rect.h);
            let n = 0;
            for (let i = 0; i < rect.w * rect.h; i++) {
                const dr = withEnemy[i * 4] - without[i * 4], dg = withEnemy[i * 4 + 1] - without[i * 4 + 1], db = withEnemy[i * 4 + 2] - without[i * 4 + 2];
                if (Math.sqrt(dr * dr + dg * dg + db * db) > 24) { mask[i] = 1; n++; }
            }
            return { mask, n };
        };
        // 실루엣 폭 = 행별 '가장 긴 연속 구간'의 상위 중앙값. bbox 폭은 파편 한 점에 통째로 끌려간다.
        const silWidth = mask => {
            const runs = [];
            for (let y = 0; y < rect.h; y++) {
                let best = 0, cur = 0;
                for (let x = 0; x < rect.w; x++) {
                    if (mask[y * rect.w + x]) { cur++; if (cur > best) best = cur; } else cur = 0;
                }
                if (best > 0) runs.push(best);
            }
            if (!runs.length) return 0;
            runs.sort((a, b) => b - a);
            const top = runs.slice(0, Math.max(1, Math.round(runs.length * 0.35))); // 몸통 구간
            return top.reduce((s, v) => s + v, 0) / top.length;
        };
        const measure = () => {
            const on = shot();
            const vis = m.g.visible; m.g.visible = false;
            const blobVis = m.blob ? m.blob.visible : null; if (m.blob) m.blob.visible = false;
            const off = shot();
            m.g.visible = vis; if (m.blob) m.blob.visible = blobVis;
            const { mask, n } = maskOf(on, off);
            return { cover: n / (rect.w * rect.h), silW: silWidth(mask), mask, n };
        };
        // 몸통만 투영 폭 — 지오메트리에 압축이 있는지.
        // 🚨 `Box3.setFromObject(m.g)` 를 그대로 쓰면 안 된다(이 도구도 처음에 밟았다 — 함정 ④⑵):
        // `hitEnemy` 는 연출 메시를 **적 그룹 안에** 새로 달기 때문에, 대기 프레임엔 없던 자식이
        // 접촉 프레임 bbox 를 통째로 끌어간다(실측: 6.4% y 스케일인데 투영 높이가 +24% 로 나왔다).
        // 그래서 **대기 프레임에 존재하던 몸 메시 목록을 미리 고정**해 두고, 그 메시들만으로 잰다.
        const bodyMeshes = [];
        m.g.traverse(o => { if (o.isMesh && !(m.rimShells || []).includes(o)) bodyMeshes.push(o); });
        const bodyW = () => {
            m.g.updateWorldMatrix(true, true);
            const b = new THREE.Box3();
            const tmp = new THREE.Box3();
            for (const o of bodyMeshes) {
                if (!o.geometry) continue;
                if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
                b.union(tmp);
            }
            const pts = [];
            for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            return { w: x1 - x0, h: y1 - y0 };
        };

        // ── ① 자 점검 ──
        const base = measure();
        out.nums.coverBase = +base.cover.toFixed(4);
        say(base.cover >= COVER_MIN, `자 점검: 적을 숨기면 영역이 변한다 (커버리지 ${(base.cover * 100).toFixed(1)}% >= ${(COVER_MIN * 100).toFixed(0)}%)`);
        if (!out.ok) return out;
        const b0 = bodyW();
        note(`대기 프레임: 몸통 투영 ${b0.w.toFixed(1)}x${b0.h.toFixed(1)}px · 실루엣 폭 ${base.silW.toFixed(1)}px`);

        // ── ② 접촉 프레임(+16ms) — 실제 hitEnemy 를 실제 경로로(인자를 손으로 베끼지 않는다) ──
        Scene3D.hitEnemy(999, 30, false, 'slash', false);
        out.nums.punchAmp = +(m.punchAmp || 0).toFixed(4);
        out.nums.flinchAmp = +(m.flinchAmp || 0).toFixed(4);
        realUpdate(1 / 60);
        const hit = measure();
        const b1 = bodyW();
        note(`접촉 프레임(+16ms): 몸통 투영 ${b1.w.toFixed(1)}x${b1.h.toFixed(1)}px · 실루엣 폭 ${hit.silW.toFixed(1)}px`);
        note(`코드가 정한 punchAmp=${out.nums.punchAmp} · flinchAmp=${out.nums.flinchAmp} · g.scale=(${m.g.scale.x.toFixed(3)}, ${m.g.scale.y.toFixed(3)}, ${m.g.scale.z.toFixed(3)})`);

        // ── ③ 스쿼시(균일 스케일)의 몫 — 같은 프레임에서 스케일만 껐다 켜서 순수 기여분을 잰다 ──
        // 🚨 대기 프레임과 그냥 빼면 안 된다: 같은 프레임에 넉백·팔다리 기저 애니메이션이 함께 돌아
        //    투영 bbox 를 흔든다(실측: 6.4% y 스케일인데 대기 대비 투영 높이가 +19% 로 나왔다).
        const punched = m.g.scale.clone();
        m.g.scale.setScalar(m.baseScale || 1);
        const bOff = bodyW();
        m.g.scale.copy(punched);
        const dBody = (bOff.w - b1.w) / bOff.w;
        out.nums.bodySquashAB = +dBody.toFixed(4);
        note(`스쿼시만 토글: 몸통 폭 ${bOff.w.toFixed(1)}px -> ${b1.w.toFixed(1)}px`);
        say(dBody >= SQUASH_MIN, `ⓐ 지오메트리 압축(스쿼시): 몸통 투영 폭 ${(dBody * 100).toFixed(2)}% 감소 (>= ${(SQUASH_MIN * 100).toFixed(1)}%)`);

        // ── ④ 플린치 포즈의 몫 — 이 항목의 본체 ──
        // 🚨 포즈 변화를 '대기 프레임과의 각도 차'로 재면 안 된다(이 도구도 처음에 그렇게 재서
        //    61.8도라는 유령 값을 봤다). 스폰 직후 첫 update 는 기저 걷기/대기 포즈를 처음 대입하므로,
        //    그 한 번의 점프가 통째로 섞인다. 대신 **가산 층이 스스로 기록한 오프셋**을 읽는다 —
        //    driveFlinch 가 남긴 `_flinchOff` 가 곧 '이번 프레임에 플린치가 더한 각도' 그 자체다.
        const offs = (m._flinchOff || []).map(d => ({ o: d.o, ax: d.ax, v: d.v }));
        let maxD = 0, maxLabel = '-';
        for (const d of offs) if (Math.abs(d.v) > maxD) { maxD = Math.abs(d.v); maxLabel = d.ax; }
        out.nums.poseMaxRad = +maxD.toFixed(4);
        out.nums.poseJoints = offs.length;
        note(`플린치 가산: 관절 ${offs.length}개 · 최대 ${maxD.toFixed(3)}rad(${(maxD * 180 / Math.PI).toFixed(1)}도, 축 ${maxLabel})`);
        say(maxD >= POSE_MIN, `ⓑ 관절 포즈 변화: 최대 ${(maxD * 180 / Math.PI).toFixed(1)}도 (>= ${(POSE_MIN * 180 / Math.PI).toFixed(1)}도)`);
        say(offs.length >= POSE_JOINTS_MIN, `ⓒ 여러 관절이 함께 반응: ${offs.length}개 (>= ${POSE_JOINTS_MIN}개) — 한 축만 움직이면 '기울었다'로만 읽힌다`);

        // 화면에서의 값: 같은 프레임에서 **플린치만** 껐다 켜 실루엣이 실제로 달라지는지 본다.
        // (가산 층이라 정확히 되돌릴 수 있다 — 스쿼시·플래시·넉백은 그대로 둔 채 포즈만 뺀다.)
        for (const d of offs) d.o.rotation[d.ax] -= d.v;
        const noFlinch = measure();
        for (const d of offs) d.o.rotation[d.ax] += d.v;
        // 🚨 지표를 '실루엣 폭'으로 두면 안 된다(이 도구가 처음에 그렇게 재서 1.3% 라는 낙제점을 냈다).
        //    폭은 **몸통 가로**를 재는 자라, 팔이 앞뒤로 날아가는 변화에는 거의 반응하지 않는다.
        //    포즈가 바뀌었는지는 **실루엣이 겹치지 않는 면적**(XOR)으로 물어야 한다 — 눈이 두 장을
        //    번갈아 볼 때 '달라졌다'고 읽는 그 픽셀들이다.
        let xor = 0;
        for (let i = 0; i < rect.w * rect.h; i++) if (hit.mask[i] !== noFlinch.mask[i]) xor++;
        const dXor = xor / Math.max(1, noFlinch.n);
        out.nums.silXor = +dXor.toFixed(4);
        note(`플린치만 토글: 실루엣 XOR ${xor}px / 실루엣 ${noFlinch.n}px · 폭 ${noFlinch.silW.toFixed(1)} -> ${hit.silW.toFixed(1)}px`);
        say(dXor >= SIL_MIN, `ⓓ 화면 실루엣이 포즈 때문에 달라진다: XOR ${(dXor * 100).toFixed(2)}% (>= ${(SIL_MIN * 100).toFixed(1)}%)`);

        // ── ⑤ 여운: 스쿼시가 끝난 뒤에도 포즈가 남아 되돌아오는가(움찔 -> 회복의 두 박자) ──
        for (let i = 0; i < 12; i++) realUpdate(1 / 60); // +216ms
        let maxD2 = 0;
        for (const d of (m._flinchOff || [])) maxD2 = Math.max(maxD2, Math.abs(d.v));
        out.nums.poseAt216ms = +maxD2.toFixed(4);
        note(`+216ms: 플린치 잔여 최대 ${maxD2.toFixed(3)}rad · punchT=${(m.punchT || 0).toFixed(3)} · flinchT=${(m.flinchT || 0).toFixed(3)}`);
        say(maxD2 > 0.005 && maxD2 < maxD, `ⓔ 여운이 남고 되돌아온다 (${maxD.toFixed(3)} -> ${maxD2.toFixed(3)}rad)`);
        say((m.punchT || 0) <= 0 || m.flinchDur > m.punchDur, `ⓕ 플린치가 스쿼시보다 오래 남는다 (flinchDur ${m.flinchDur}s > punchDur ${m.punchDur}s)`);

        // ── ⑥ 원상복구: 수명 뒤 가산분이 새지 않는가 ──
        // 가산 층은 되돌리기를 빠뜨리면 그 적이 남은 판 내내 뒤틀린 채로 굳는다(이 저장소가 플래시에서
        // 이미 겪은 사고와 같은 종류). 되돌리기가 **정확**하므로 잔여는 0 이어야 한다.
        for (let i = 0; i < 40; i++) realUpdate(1 / 60); // +880ms — 수명(0.26s) 한참 뒤
        out.nums.flinchTEnd = +(m.flinchT || 0).toFixed(4);
        say(!m._flinchOff && (m.flinchT || 0) === 0, `ⓖ 수명 뒤 가산분 해제됨 (flinchT=${out.nums.flinchTEnd}, 잔여 오프셋 ${m._flinchOff ? m._flinchOff.length : 0}개)`);

        // ── ⑦ 사망 경로 누수: 플린치 도중 죽으면 시체에 포즈가 박히는가 ──
        // update 루프는 `!e.alive` 로 죽은 개체를 건너뛰므로 마지막 오프셋을 아무도 안 빼 준다.
        // killEnemy 가 직접 되돌려야 시체가 팔을 젖힌 채 굳지 않는다.
        Scene3D.hitEnemy(999, 30, false, 'slash', false);
        realUpdate(1 / 60);
        const hadOff = !!(m._flinchOff && m._flinchOff.length);
        const armBefore = offs.length ? offs[0].o.rotation[offs[0].ax] : 0;
        Scene3D.killEnemy(999, false);
        const armAfter = offs.length ? offs[0].o.rotation[offs[0].ax] : 0;
        out.nums.deathLeak = +Math.abs(armAfter - armBefore).toFixed(4);
        say(hadOff && !m._flinchOff, `ⓗ 사망 시 가산분 해제됨 (죽기 전 오프셋 있었나=${hadOff}, 죽은 뒤 잔여=${m._flinchOff ? m._flinchOff.length : 0}개)`);

        Scene3D.update = realUpdate;
        return out;
    }, { COVER_MIN, SQUASH_MIN, SIL_MIN, POSE_MIN, POSE_JOINTS_MIN, LEAK_MAX });

    for (const l of r.lines) console.log(l);
    if (r.nums) console.log('nums=' + JSON.stringify(r.nums));
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(r.ok && !errors.length ? 0 : 1);
})();
