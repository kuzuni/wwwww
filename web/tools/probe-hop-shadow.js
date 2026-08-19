// 홉(점프) 중 발밑 그림자가 고도를 제대로 말하는가 — **화면 픽셀**로 잰다.
//
// 왜: `cute-art-direction` 2차 채점에서 비평가 2인이 독립적으로 "적이 뜰수록 그림자가
//   커지고 밝아진다(고도 단서가 역방향)"를 올렸다(B 실측: 버섯 접지 2693px·휘도 43.0 →
//   정점 2921px·49.0 = 면적 +8.5%, 밝기 +14%). 그런데 코드는 반대로 되어 있다 —
//   `Scene3D.update` 의 지상 적 블롭은 `baseS * max(0.55, 1 - y*0.35)` 로 **줄인다.**
//   버섯 정점 y=0.16 이면 축소는 고작 5.6% 라, 비평가가 본 +8.5% 를 블롭만으로는 설명할 수 없다.
//   **가설: 그들이 잰 '그림자'는 블롭이 아니라 섀도우맵 실그림자(지상 적은 castShadow 켜짐)이거나
//   둘의 합이다.** 어느 쪽인지 갈라야 고칠 자리가 정해진다 — 그래서 둘을 분리해 잰다.
//
// 재는 법: 위상 정렬(접지·정점)로 포즈를 고정하고, 같은 프레임을 세 번 찍는다.
//   ⓐ 평상(블롭+실그림자)  ⓑ 블롭만 숨김(=실그림자)  ⓒ 실그림자만 끔(=블롭)
//   지면 띠에서 '어두운 픽셀'의 면적과 평균 휘도를 각각 낸다. 블롭/실그림자의 기여가 갈린다.
//
// 판정: 접지 → 정점으로 갈 때 **면적이 늘거나 휘도가 밝아지면 FAIL**(고도 단서 역방향).
//   블롭·실그림자 각각에 대해 따로 찍어, 어느 쪽이 범인인지 보고서에 남긴다.
//
// 사용: node probe-hop-shadow.js [종=mushroom]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'mushroom';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && typeof Combat !== 'undefined' && Scene3D.scene, null, { timeout: 60000 });

    // 적 한 마리만 세우고 시계를 직접 찍는다 — `shot-enemy-seq.js` 와 같은 규약.
    const ready = await page.evaluate((kind) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        // 스폰·위상 핀은 `shot-enemy-seq.js` 규약을 그대로 따른다(그 파일 머리말 참조).
        const e = { id: 999, x: Combat.MELEE_X + 1.4, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        if (!m) return { err: '적 메시를 못 만들었다' };
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true; m._scaleLocked = false; m.punchT = 0;
        m.g.position.x = e.x + Scene3D.worldX;
        m.g.updateMatrixWorld(true);
        // 주변 소품 그림자가 지면 띠에 섞이면 못 가른다 — 가까운 것은 숨기고 그림자도 끈다.
        for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
            if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
            o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
        }
        if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
        Scene3D.petGroups.forEach(p => p.visible = false);
        window.__m = m;
        // 위상 핀 — `_clock` 만 찍으면 스크린샷 직전에 rAF 가 밀어 다른 위상이 저장된다.
        const ORIG = Scene3D.update.bind(Scene3D);
        window.__pinClk = null;
        Scene3D.update = (dt) => { if (window.__pinClk != null) { Scene3D._clock = window.__pinClk; ORIG(0); } else ORIG(dt); };
        window.__poseAt = (t) => { window.__pinClk = t; Scene3D._clock = t; Scene3D.update(0); };
        // hopU = (clk·rate + id)/π 이므로 원하는 hopU 를 만드는 clk 을 역산한다(접지 u≈0, 정점 u=gc+(1-gc)·0.47).
        // 🚨 보행 파라미터는 `m.gait` 가 아니라 `Scene3D.gaitOf(kind)` 로 얻는다 —
        //    `m.gait` 는 없어서 rate 가 undefined 가 되고, 그러면 아래 clk 계산이 통째로 NaN 이 된다
        //    (첫 판에서 실제로 그렇게 돌아 **면적 0 · y NaN 인데 PASS** 가 나왔다).
        const G = Scene3D.gaitOf(m.anim && m.anim.kind, false) || {};
        if (!G.rate) return { err: 'gaitOf 가 rate 를 못 줬다 — 위상 역산이 불가능하다' };
        const gc = Math.min(0.34, Math.max(0.05, 0.11 * (G.bobPow || 1)));
        const period = 2 * Math.PI / G.rate;
        const clkOf = (u) => { let c = (u * Math.PI - e.id) / G.rate; while (c < 0) c += period * 8; return c; };
        window.__clkGround = clkOf(0.005);
        window.__clkPeak = clkOf(gc + (1 - gc) * 0.47);
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        if (Scene3D.heroG) Scene3D.heroG.visible = false;           // 영웅 그림자가 지면 띠에 섞이면 못 가른다
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        if (m.hpG) m.hpG.visible = false;
        return { ok: true, bob: (m.gait && m.gait.bob) || null };
    }, KIND);
    if (ready.err) { console.log('❌ ' + ready.err); await browser.close(); process.exit(2); }

    const poseAt = (which) => page.evaluate((which) => {
        const m = window.__m;
        window.__poseAt(which === 'peak' ? window.__clkPeak : window.__clkGround);
        return { y: +m.g.position.y.toFixed(4), blobS: m.blob ? +m.blob.scale.x.toFixed(4) : null };
    }, which);

    const clip = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    const snap = async () => (await page.screenshot({ clip })).toString('base64');

    const setMode = (mode) => page.evaluate((mode) => {
        const m = window.__m;
        if (m.blob) m.blob.visible = (mode !== 'noblob');
        m.g.traverse(o => { if (o.isMesh) o.castShadow = (mode !== 'noreal'); });
    }, mode);

    // 지면 띠에서 어두운 픽셀을 센다. 기준 밝기는 '적도 그림자도 없는' 빈 지면에서 잡는다.
    const darkStats = (page, base, shot, bodyShot) => page.evaluate(async ({ a, b, m: mk }) => {
        const load = async (b64) => {
            const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            return { d: g.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
        };
        const A = await load(a), B = await load(b), M = await load(mk);
        const W = A.w, H = A.h;
        const L = (X, i) => 0.299 * X.d[i] + 0.587 * X.d[i + 1] + 0.114 * X.d[i + 2];
        // 🚨 **몸통을 반드시 빼야 한다.** 'ΔL 이 조금 어두워진 픽셀'만으로는 몸통이 걸러지지 않는다:
        //    접지에서는 몸이 어두운 지면 앞이라 ΔL 이 90 을 넘어 배제되지만, 정점에서는 몸이 **밝은
        //    배경 앞**으로 올라가 ΔL 이 6~90 창에 들어와 **몸통 전체가 '그림자'로 집계된다**
        //    (그렇게 돌린 판이 면적 +1904% 라는 헛수치를 냈다). 그래서 몸을 키 컬러로 칠한 렌더(M)로
        //    마스크를 떠서 2px 팽창시켜 제외한다.
        const body = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) {
            const i = p * 4;
            if (M.d[i] > 150 && M.d[i + 2] > 150 && M.d[i + 1] < 110) body[p] = 1;
        }
        let bodyPx = 0;
        const bodyD = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!body[y * W + x]) continue;
            bodyPx++;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const yy = y + dy, xx = x + dx;
                if (yy >= 0 && xx >= 0 && yy < H && xx < W) bodyD[yy * W + xx] = 1;
            }
        }
        let n = 0, sum = 0;
        for (let p = 0; p < W * H; p++) {
            if (bodyD[p]) continue;
            const i = p * 4;
            const d = L(A, i) - L(B, i);
            if (d > 6 && d < 90) { n++; sum += L(B, i); }
        }
        return { px: n, lum: n ? sum / n : 0, bodyPx };
    }, { a: base, b: shot, m: bodyShot });

    // 빈 지면 기준 프레임 — **위상마다 따로 찍는다.**
    //   🚨 처음엔 접지에서 한 장만 찍어 두 위상에 함께 썼는데, 지면 무늬가 `_clock` 을 따라 흐르므로
    //      정점 프레임은 **화면 전체가 조금씩 달라져** 그 차이가 통째로 '그림자'로 집계됐다
    //      (접지 73px vs 정점 2239px — 몸통 마스크 495px 보다 그림자가 4배 크다는 헛수치가 이것이다).
    //      같은 `_clock` 에서 '적 있음/없음'만 다른 두 장을 비교해야 차이가 그림자만 남는다.
    const baseAt = async (which) => {
        await page.evaluate((which) => {
            window.__poseAt(which === 'peak' ? window.__clkPeak : window.__clkGround);
            window.__m.g.visible = false; if (window.__m.blob) window.__m.blob.visible = false;
            window.__poseAt(which === 'peak' ? window.__clkPeak : window.__clkGround);
        }, which);
        await page.waitForTimeout(160);
        const b = await snap();
        await page.evaluate(() => { window.__m.g.visible = true; if (window.__m.blob) window.__m.blob.visible = true; });
        return b;
    };
    const baseShots = { ground: await baseAt('ground'), peak: await baseAt('peak') };

    const PHASES = [['접지', 'ground'], ['정점', 'peak']];
    const MODES = [['블롭+실그림자', 'all'], ['실그림자만', 'noblob'], ['블롭만', 'noreal']];
    const out = {};
    for (const [mname, mode] of MODES) {
        out[mname] = {};
        for (const [pname, u] of PHASES) {
            await setMode(mode);
            const st = await poseAt(u);
            await page.waitForTimeout(140);
            const s = await snap();
            // 같은 포즈에서 몸만 키 컬러로 칠한 한 장 — 위 마스크용(그림자는 그대로 둔다).
            // 🚨 **재질의 color 만 마젠타로 바꾸면 마스크가 안 나온다.** 몸통은 대부분 Standard 라
            //    조명이 곱해져 그늘진 면이 (120,30,130) 처럼 어두워지고, 그러면 키 판정(R>150·B>150)에서
            //    떨어져 **몸의 일부만 마스크가 된다**(그렇게 돈 판의 몸통 마스크가 527px 뿐이었다).
            //    조명을 안 타는 MeshBasicMaterial 로 **통째로 교체**해야 실루엣 전체가 균일하게 찍힌다.
            await page.evaluate(() => {
                const m = window.__m;
                window.__swap = [];
                if (!window.__keyMat) window.__keyMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false });
                m.g.traverse(o => {
                    if (!o.isMesh || !o.material) return;
                    window.__swap.push([o, o.material]);
                    o.material = window.__keyMat;
                });
            });
            await page.waitForTimeout(120);
            const bodyShot = await snap();
            await page.evaluate(() => { window.__swap.forEach(([o, mt]) => { o.material = mt; }); });
            const r = await darkStats(page, baseShots[u], s, bodyShot);
            out[mname][pname] = { ...r, ...st };
        }
    }

    console.log(`${KIND} — 홉 중 발밑 그림자 (접지 → 정점)`);
    let fails = [];
    // 🚨 **아무것도 못 잰 판은 PASS 가 아니라 오류다.** 첫 판이 정확히 이 상태로 초록을 냈다
    //    (그림자 픽셀 0 · y NaN). 표본이 비면 판정 자체가 성립하지 않으므로 종료코드 2 로 떨군다.
    const groundPx = out['블롭+실그림자']['접지'].px;
    const anyNaN = Object.values(out).some(m => Object.values(m).some(v => !Number.isFinite(v.y)));
    // 몸통 마스크가 실루엣을 다 못 덮으면 남은 몸이 '그림자'로 집계돼 수치가 통째로 헛것이 된다.
    // 버섯 전신은 화면에서 수천 px 이므로, 1500px 미만이면 마스크가 깨진 것으로 보고 판정을 포기한다.
    // 하한은 '실루엣이 아예 안 잡힌 경우'만 걸러낸다 — 이 적은 화면에서 작아 정상값이 700px 안팎이다
    // (처음에 1500 으로 잡았다가 멀쩡한 마스크를 불능 처리했다).
    const minBody = Math.min(...Object.values(out).flatMap(m => Object.values(m).map(v => v.bodyPx || 0)));
    if (minBody < 250) {
        console.log(`❌ 측정 불능 — 몸통 마스크가 최소 ${minBody}px 뿐이다(실루엣을 다 못 덮었다).`);
        console.log('   마스크가 새면 남은 몸통이 그림자로 집계돼 면적이 수십 배로 부풀 뿐이므로, 이 판은 근거로 쓸 수 없다.');
        await browser.close(); process.exit(2);
    }
    if (!groundPx || anyNaN) {
        console.log(`❌ 측정 불능 — 접지 그림자 픽셀 ${groundPx}개 · y 유한하지 않음 ${anyNaN}`);
        console.log('   적이 화면 밖이거나 위상 역산이 NaN 이다. 이 판은 근거로 쓸 수 없다.');
        await browser.close(); process.exit(2);
    }
    for (const [mname] of MODES) {
        const g = out[mname]['접지'], t = out[mname]['정점'];
        const dA = g.px ? (t.px - g.px) / g.px * 100 : 0;
        const dL = t.lum - g.lum;
        console.log(`  ${mname.padEnd(12)} 면적 ${g.px} → ${t.px} (${dA >= 0 ? '+' : ''}${dA.toFixed(1)}%) · 휘도 ${g.lum.toFixed(1)} → ${t.lum.toFixed(1)} (${dL >= 0 ? '+' : ''}${dL.toFixed(1)}) · y ${g.y}→${t.y} · 블롭배율 ${g.blobS}→${t.blobS} · 몸통마스크 ${g.bodyPx}→${t.bodyPx}px`);
        if (dA > 2) fails.push(`${mname}: 정점에서 면적이 ${dA.toFixed(1)}% 늘었다(고도 단서 역방향)`);
        if (dL > 2) fails.push(`${mname}: 정점에서 휘도가 ${dL.toFixed(1)} 밝아졌다`);
    }
    if (errors.length) console.log(`  콘솔 오류 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);

    // ── 판정 ──
    // 🚨 **이 자는 현재 상태로 '결함 있음'을 주장할 수 없다 — 방법론에 교란이 하나 남아 있다.**
    //   화면에서 '몸통 밖의 어두운 픽셀'을 세는 방식은 **그림자가 커진 것**과 **그림자가 몸에
    //   덜 가려진 것**을 구분하지 못한다. 접지에서는 그림자가 몸 실루엣 **아래에 통째로 숨고**,
    //   정점에서는 몸이 떠오르며 같은 그림자가 드러난다 — 실측이 그걸 그대로 보여준다:
    //   `블롭만` 모드가 접지에서 **0px**(전부 몸 뒤) → 정점 53px 이다. 그림자가 무에서 생겨난 게
    //   아니라 가림이 풀린 것이다. 따라서 위 '면적 +112%' 는 결함의 증거가 아니다.
    //
    //   ✅ 다만 **블롭은 무혐의로 확정됐다** — 씬 그래프에서 직접 읽은 배율이 0.72 → 0.6797 로
    //      코드(`baseS * max(0.55, 1 - y*0.35)`, 정점 y=0.16 → −5.6%)와 정확히 일치한다.
    //      비평가 2인이 올린 "뜰수록 블롭이 커진다"는 **블롭에 대해서는 틀렸다.**
    //
    //   남은 질문(섀도우맵 실그림자가 고도를 제대로 말하는가)은 다른 방법이 필요하다 —
    //   가림과 무관하게 재려면 몸을 지운 채 그림자만 남길 수 있어야 하는데, 몸을 숨기면 그 몸의
    //   그림자도 같이 사라진다. 위에서 내려보는 별도 카메라로 지면만 렌더하는 길이 후보다.
    console.log('');
    console.log('❌ 판정 불가 — 이 자는 아직 결함을 주장할 수 없다(가림/크기 교란, 위 주석 참조).');
    console.log(`   확정된 것: 블롭 배율 ${out['블롭+실그림자']['접지'].blobS} → ${out['블롭+실그림자']['정점'].blobS} (코드대로 축소 — 블롭 무혐의).`);
    console.log('   미해결: 섀도우맵 실그림자의 고도 반응. 다른 측정 방법이 필요하다.');
    await browser.close();
    process.exit(2);
})();
