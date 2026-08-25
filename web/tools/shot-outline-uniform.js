// 검정 아웃라인 균일도 **육안 검수 시트** (slug: uniform-outline-postfx).
//
// 🚨 **2026-08-25 3D 스트림 전면 개편 — 종전 시트는 두 축을 통째로 못 재고 있었다.**
//   ⓐ **기기 간 일치 축이 사실상 미검증이었다.** 종전 `capture()` 는 데스크톱 행과 모바일 행을
//      **같은 `deviceScaleFactor: 2`** 로 찍었다. UA 분기는 블룸·비네트만 바꾸고, 선 두께를 정하는
//      `texel`(= 드로잉버퍼 해상도)은 **양쪽이 완전히 동일**하다. 즉 두 행은 두께에 관한 한
//      **같은 그림 두 장**이었다. → 이제 **dsf 1 / 2 / 3 행**을 찍는다.
//   ⓑ **증거 공백**: 채점 축이 "스킬소환체"와 "무기"를 명시하는데 시트에 **크롭이 한 장도 없었다**
//      (무기는 영웅 몸 크롭에 얹혀서만 보였다). → 두 크롭을 새로 넣는다.
//   ⓒ 전경 샷은 캐릭터가 화면의 5% 미만이라 육안 판독 기여가 0 이었다 → **대상별 확대만** 남긴다.
//
// 📏 **크롭은 CSS px 기준으로 자른다** — 이게 이 시트의 핵심이다. 버퍼 px 로 자르면 dsf 가 큰 행일수록
//    좁은 영역이 잡혀 "선이 얇아 보이는" 착시가 생긴다. 같은 CSS 영역을 같은 출력 크기로 늘리면
//    **눈이 보는 굵기 그대로** 비교된다.
//
// 🔍 **실측으로 확인해 둔 것**: `scene3d.js` 가 `setPixelRatio(Math.min(2, devicePixelRatio))` 로
//    **DPR 을 2 에서 자른다**. 그래서 이 축은 연속이 아니라 **이분법**이었다 —
//    DPR 1 → 버퍼=CSS → 선 2 CSS px / **DPR 2 이상 → 버퍼=2×CSS → 선 1 CSS px**.
//    (TODO 에 적혀 있던 "DPR 3 에선 0.67px" 은 이 클램프를 안 본 계산이라 틀렸다. dsf 3 행이 그 증거다.)
// ✅ **그 2배 격차는 닫혔다**(2026-08-25 3D 스트림, `_compMat` 의 `dilate` 유니폼). 팽창을 버퍼가
//    CSS 대비 1.5× 이상 촘촘할 때만 걸어, DPR 1 은 1 버퍼px · DPR 2 이상은 2 버퍼px →
//    **전 대역 1.00 CSS px**. 이 시트의 네 행 캡션이 그 증거다(넷 다 `= 1.00 CSS px`).
//
// 사용: node shot-outline-uniform.js [출력경로]   기본 tools/outline-uniform.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const { SEED_INIT } = require('./lib-seed');   // 씬 전체 재현성 — page.goto 보다 먼저 주입해야 한다
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'outline-uniform.png');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const CSS_W = 480, CSS_H = 854;
const CROP_CSS = 46;     // 크롭 한 변(CSS px) — 대상 하나가 꽉 차는 크기
const CELL = 368;        // 시트에서 크롭 한 칸의 출력 크기(px). CROP_CSS 대비 8× 확대.

const capture = async (browser, { dsf, ua, title }) => {
    const page = await browser.newPage(Object.assign(
        { viewport: { width: CSS_W, height: CSS_H }, deviceScaleFactor: dsf },
        ua ? { userAgent: ua } : {}));
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(SEED_INIT);
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(({ CROP_CSS, CSS_W }) => {
        window.__reseed && window.__reseed();   // 난수 스트림 되감기 — lib-seed.js 참조
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse'; Scene3D.refreshMount();
        S.pets = Object.keys(PET_ICONS).slice(0, 3).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
        S.activePets = [0, 1, 2]; Scene3D.refreshPets();
        Scene3D.clearEnemies();
        const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        const em = Scene3D.enemyMap.get(951);
        em.g.position.set(e.x + Scene3D.worldX, 0, 0); em.g.userData.landed = true;
        // 🖊️ **스킬 소환체를 정박대에 세워 둔다** — 시전 연출은 setTimeout 으로 흘러가 캡처 시점이
        //    안 맞으므로, 같은 조형을 `fxActor` 로 **정적으로** 세워 크롭한다(채점 축 ①이 요구하는 대상).
        const hp0 = Scene3D.heroG.position;
        const summon = Scene3D.fxActor && Scene3D.fxActor('medic', {
            scale: 1.0, pos: new THREE.Vector3(hp0.x + Scene3D.SUPPORT_STAGE_X, 0, hp0.z - 0.3),
        });
        // 위상 고정 — lib-seed.js 참조(시드만으로는 부족하다)
        {
            const pin = (g) => { if (g && g.userData) g.userData.phase = 0; };
            pin(Scene3D.mountGroup);
            (Scene3D.petGroups || []).forEach(pin);
            if (Scene3D.enemyMap) Scene3D.enemyMap.forEach(v => pin(v && v.g));
        }
        Scene3D._clock = 0; Scene3D.worldX = 0;
        if (Scene3D.heroRig) Scene3D.heroRig._t = 0;
        step(0.9);
        Scene3D.renderFrame();

        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const bs = W / CSS_W;                       // 버퍼 px / CSS px (= min(2, dsf))
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H).data; };

        // ── 선 두께 실측(버퍼 px) — 세 항을 **전부** 꺼야 차분이 성립한다(판정기 3종 공유 함정) ──
        const u = Scene3D._compMat.uniforms;
        const saved = { edgeK: u.edgeK.value, normalK: u.normalK.value, creaseK: u.creaseK.value };
        const on = grab();
        u.edgeK.value = 1e9; u.normalK.value = 9.0; u.creaseK.value = 1e9;
        const off = grab();
        u.edgeK.value = saved.edgeK; u.normalK.value = saved.normalK; u.creaseK.value = saved.creaseK;
        const mask = new Uint8Array(W * H); let n = 0;
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
            if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { mask[i] = 1; n++; }
        }
        const runDir = (dx, dy) => {
            const r = new Uint16Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x; if (!mask[i]) continue;
                const px = x - dx, py = y - dy;
                if (px >= 0 && px < W && py >= 0 && py < H && mask[py * W + px]) continue;
                let cx = x, cy = y; const cells = [];
                while (cx >= 0 && cx < W && cy >= 0 && cy < H && mask[cy * W + cx]) { cells.push(cy * W + cx); cx += dx; cy += dy; }
                for (const c of cells) r[c] = cells.length;
            }
            return r;
        };
        const d0 = runDir(1, 0), d1 = runDir(0, 1), d2 = runDir(1, 1), d3 = runDir(1, -1);
        const hist = {};
        for (let i = 0; i < W * H; i++) if (mask[i]) {
            const v = [d0[i], d1[i], d2[i], d3[i]].sort((a, b) => a - b);
            hist[v[1]] = (hist[v[1]] || 0) + 1;
        }
        // 🚨 **중앙값만 찍으면 결함이 전부 숨는다** (비평가 2026-08-25: "중앙값은 네 행 모두 2 버퍼px
        //    이라 위의 모든 결함을 통과시킨다"). 결함은 상위 25% 에 있다 → **p90·최대**를 같이 찍고,
        //    **크롭별로도** 낸다(한 크롭 안에서 1px 과 9px 이 공존하는 것이 이 항목의 실제 결함이다).
        const thick = new Uint16Array(W * H);
        for (let i = 0; i < W * H; i++) if (mask[i]) {
            const v = [d0[i], d1[i], d2[i], d3[i]].sort((a, b) => a - b);
            thick[i] = v[1];
        }
        const statOf = (pick) => {
            const h = {}; let m = 0;
            for (let i = 0; i < W * H; i++) if (mask[i] && pick(i)) { h[thick[i]] = (h[thick[i]] || 0) + 1; m++; }
            if (!m) return null;
            const kk = Object.keys(h).map(Number).sort((a, b) => a - b);
            const q = (f) => { let c = 0; for (const k of kk) { c += h[k]; if (c >= m * f) return k; } return kk[kk.length - 1]; };
            return { n: m, med: q(0.5), p90: q(0.9), max: kk[kk.length - 1] };
        };
        const all = statOf(() => true) || { med: 0, p90: 0, max: 0, n: 0 };
        const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
        const med = all.med;
        // 🚨 **'2px 비중'이 아니라 '중앙값 비중'이어야 한다.** 목표 두께는 버퍼 px 로 고정된 값이 아니라
        //    **1 CSS px** 이고, 그건 DPR 1 에서 1 버퍼px · DPR 2 에서 2 버퍼px 이다. 2 를 하드코딩하면
        //    DPR 1 행이 정상인데도 '29.7%' 같은 낮은 수를 찍어 **거짓 결함처럼 읽힌다**.
        const shareMed = ((hist[med] || 0) / Math.max(1, n) * 100).toFixed(1);

        // 🚨 **반드시 다시 렌더한 뒤에 캡처한다.** 위 `off` 측정이 남긴 마지막 프레임은 **항이 꺼진**
        //    그림이라, 그대로 `drawImage` 하면 **아웃라인이 하나도 없는 시트**가 나온다(첫 판에서
        //    실제로 그렇게 나와 '선이 없다'고 오판할 뻔했다 — 판정기는 4923px 을 세고 있었는데도).
        Scene3D.renderFrame();
        ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
        const proj = (v3) => { const v = v3.clone().project(Scene3D.camera); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; };
        const hp = Scene3D.heroG.position;
        const petG = (Scene3D.petGroups || [])[0];
        const wG = Scene3D.weaponG;
        const spots = [
            ['영웅 머리', proj(new THREE.Vector3(hp.x, hp.y + 1.45, hp.z))],
            ['영웅 몸', proj(new THREE.Vector3(hp.x + 0.1, hp.y + 0.75, hp.z))],
            ['무기', wG ? proj(wG.getWorldPosition(new THREE.Vector3())) : null],
            ['탈것', proj(Scene3D.mountGroup.getWorldPosition(new THREE.Vector3()).setY(0.55))],
            ['펫', petG ? proj(petG.getWorldPosition(new THREE.Vector3()).setY(0.35)) : null],
            ['적', proj(em.g.getWorldPosition(new THREE.Vector3()).setY(0.6))],
            ['스킬 소환체', summon ? proj(summon.g.getWorldPosition(new THREE.Vector3()).setY(0.75)) : null],
        ].filter(s => s[1]);
        const CS = Math.round(CROP_CSS * bs);
        for (const sp of spots) {
            const sx = Math.max(0, Math.min(W - CS, Math.round(sp[1].x - CS / 2)));
            const sy = Math.max(0, Math.min(H - CS, Math.round(sp[1].y - CS / 2)));
            sp[2] = statOf(i => { const x = i % W, y = (i / W) | 0; return x >= sx && x < sx + CS && y >= sy && y < sy + CS; });
        }
        return {
            full: cv.toDataURL('image/png'), spots, w: W, h: H, bs,
            crop: CS,                 // 버퍼 px 로 환산한 크롭 한 변
            med, p90: all.p90, max: all.max, shareMed, nEdge: n,
            postOn: !!Scene3D.postOn, postEdge: !!Scene3D.postEdge,
        };
    }, { CROP_CSS, CSS_W });
    await page.close();
    return { r, errors, title };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    // 🚨 **DPR 3 행은 뺐다 — DPR 2 행과 바이트 단위로 동일하다**(비평가 2026-08-25 실측: 7개 크롭
    //    전체에서 차이 나는 채널 0개). `setPixelRatio(Math.min(2, dpr))` 클램프 때문인데, 그러면
    //    그 행은 **증거가 아니라 장식**이고 시트가 이 축의 표본을 4개처럼 보이게 부풀린다.
    //    대신 **DPR 1.5** 를 넣는다 — 클램프에 안 걸리는 진짜 세 번째 버퍼배율이고, `dilate` 스위치가
    //    '버퍼 ≥1.5× CSS' 에서 켜지므로 **이 대역이 1.33 CSS px 로 남는지**를 보는 자리이기도 하다.
    const PLAN = [
        { dsf: 1, ua: null, title: 'DPR 1 · 데스크톱 UA' },
        { dsf: 1.5, ua: null, title: 'DPR 1.5 · 데스크톱 UA' },
        { dsf: 2, ua: null, title: 'DPR 2 · 데스크톱 UA (DPR 3 도 클램프돼 이 행과 바이트 동일)' },
        { dsf: 2, ua: MOBILE_UA, title: 'DPR 2 · 모바일 UA (블룸 off · 비네트 0)' },
    ];
    const caps = [];
    for (const p of PLAN) caps.push(await capture(browser, p));

    const cssOf = (v, bs) => (v / bs).toFixed(2);
    const rows = caps.map(c => ({
        title: `${c.title} — 버퍼 ${c.r.w}×${c.r.h}(CSS 대비 ${c.r.bs}×) · 두께 CSS px: 중앙 ${cssOf(c.r.med, c.r.bs)} · p90 ${cssOf(c.r.p90, c.r.bs)} · 최대 ${cssOf(c.r.max, c.r.bs)} · 중앙값 비중 ${c.r.shareMed}%`,
        full: c.r.full, spots: c.r.spots, crop: c.r.crop, bs: c.r.bs, medBuf: c.r.med,
    }));

    // ── 게이트 ─────────────────────────────────────────────────────────────────────
    // ⓐ **기기 간**: 행마다 CSS 두께 중앙값이 같아야 한다. 종전엔 `2.00 vs 1.00` 을 제 헤더에
    //    인쇄해 놓고도 초록불이었다(비평가 지적) — 이제 종료코드로 낸다.
    // ⓑ **침식**: 기준은 **절대 CSS px 이 아니라 그 행의 중앙값 대비 배수**로 잡는다. 목표 폭 자체가
    //    대역마다 버퍼 px 로는 다른 값(DPR1 1버퍼px · DPR2 2버퍼px)이라, 절대값으로 걸면 대역이
    //    바뀔 때마다 문턱이 같이 흔들린다. 비평가의 지적도 '최대/중앙 = 6배'라는 **비율**이었다.
    //    3배 = 파츠가 선에 먹혀 덩어리가 됐다고 볼 수 있는 선.
    const CSS_MED_TOL = 0.01, MAX_RATIO = 3.0;
    const meds = caps.map(c => +cssOf(c.r.med, c.r.bs));
    const medOk = Math.max(...meds) - Math.min(...meds) <= CSS_MED_TOL;
    const fat = [];
    caps.forEach((c, i) => c.r.spots.forEach(sp => {
        if (sp[2] && sp[2].max > c.r.med * MAX_RATIO + 1e-6) fat.push(`${PLAN[i].title.split(' (')[0]}/${sp[0]}=${cssOf(sp[2].max, c.r.bs)}(중앙의 ${(sp[2].max / c.r.med).toFixed(1)}배)`);
    }));
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const url = await page.evaluate(async ({ rows, CELL }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const HEAD = 34, GAP = 8;
        const imgs = []; for (const r of rows) imgs.push(await load(r.full));
        const nCols = Math.max(...rows.map(r => r.spots.length));
        const c = document.createElement('canvas');
        c.width = GAP + nCols * (CELL + GAP);
        c.height = rows.length * (CELL + HEAD + GAP + 22) + GAP;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;                    // 최근접 확대 — 1px 이 1px 로 보여야 한다
        x.fillStyle = '#101216'; x.fillRect(0, 0, c.width, c.height);
        let oy = GAP;
        rows.forEach((row, i) => {
            x.font = 'bold 22px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(row.title, GAP, oy + 24);
            row.spots.forEach((s, k) => {
                const CS = row.crop;
                const sx = Math.max(0, Math.min(imgs[i].width - CS, Math.round(s[1].x - CS / 2)));
                const sy = Math.max(0, Math.min(imgs[i].height - CS, Math.round(s[1].y - CS / 2)));
                const dx = GAP + k * (CELL + GAP), dy = oy + HEAD + 20;
                x.drawImage(imgs[i], sx, sy, CS, CS, dx, dy, CELL, CELL);
                x.strokeStyle = '#ffe08a'; x.lineWidth = 2; x.strokeRect(dx, dy, CELL, CELL);
                const st = s[2], mx = st ? (st.max / row.bs) : 0;
                x.font = 'bold 16px sans-serif';
                x.fillStyle = (st && st.max > row.medBuf * 3.0) ? '#ff6b6b' : '#7fff9f';   // 중앙값의 3배 초과 = 침식 의심
                x.fillText(st ? `${s[0]}  중앙 ${(st.med / row.bs).toFixed(2)} · 최대 ${mx.toFixed(2)} CSS px` : s[0], dx + 4, dy - 5);
            });
            oy += CELL + HEAD + GAP + 22;
        });
        return c.toDataURL('image/png');
    }, { rows, CELL });
    fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
    console.log('시트 저장: ' + OUT);
    for (const r of rows) console.log('  ' + r.title);
    console.log('\n--- 판정 ---');
    console.log('  기기 간 CSS 두께 :', medOk ? `PASS (전 행 ${meds[0].toFixed(2)} CSS px)` : `FAIL (행별 중앙 ${meds.map(m => m.toFixed(2)).join(' / ')} CSS px)`);
    console.log('  크롭 최대 두께   :', fat.length ? `FAIL (중앙값의 ${MAX_RATIO}배 초과) ` + fat.join(' · ') : `PASS (전 크롭 ≤ 중앙값의 ${MAX_RATIO}배)`);
    const errs = caps.flatMap(c => c.errors);
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '콘솔 에러 0건');
    console.log('  최종 :', medOk && !fat.length && !errs.length ? 'PASS' : 'FAIL');
    await browser.close();
    process.exit(medOk && !fat.length && !errs.length ? 0 : 1);
})();
