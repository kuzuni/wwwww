// 🚨 최우선 3항목(2026-08-22 사용자 지시) 구현 실측 검증 — slug: top3-verify
//
// 왜 이 판정기가 있나: 세 항목(`uniform-outline-postfx` · `pets-three-fully-visible` ·
// `creature-yaw-unify`)은 코드에 **이미 들어가 있는데 TODO 체크박스가 비어 있었다**.
// 커밋(fac03de · 77c0aae · 2932532)만 보고 체크하면 '커밋 메시지를 믿는 것'이지 검증이 아니다.
// 그래서 세 가지를 한 번의 인게임 런에서 **수치로** 확인한다.
//
// 재는 것:
//   ⓐ **크리처 yaw 통일** — 씬에 실제로 선 펫·탈것·탈것무리 그룹의 `rotation.y` 를 전부 읽어
//      `Scene3D.CREATURE_YAW` 와 같은지(±부호 허용) 본다. 상수만 grep 하면 '선언은 했는데
//      대입을 빠뜨린 자리'를 못 잡는다 — 살아 있는 오브젝트에서 읽는 이유다.
//   ⓑ **펫 3마리 온전히 보임** — mythic 대형 3종(Cerberus/Griffin/Baby Dragon)을 출전시키고
//      각 펫의 화면 실루엣을 **단독 렌더 대비 가시율**로 잰다. 다른 펫·영웅·탈것을 잠깐 숨긴
//      단독 컷의 픽셀 수 = 100%, 전원 렌더 컷에서 그 펫 색만 남긴 픽셀 수 = 실제 보이는 양.
//      ⚠️ 색으로 개체를 가르면 재질이 겹쳐 못 가른다 → **개체마다 고유 단색 Basic 재질**로 갈아
//      끼워 ID 를 색에 실어 렌더한다(실루엣 판정 probe-mount-silhouette 와 같은 화법).
//      화면 밖 잘림도 같이 본다(NDC bbox 가 [-1,1] 안인지).
//   ⓒ **아웃라인 후처리 활성** — `postOn` + `_rtScene.depthTexture` 가 실제로 붙어 있고
//      컴포짓 유니폼 `tDepth` 가 그 텍스처를 가리키는지 확인한다(선언만 있고 배선이 끊긴 사고 방지).
//
// ⚠️ 헤드리스 함정(TODO 함정 ③): `Scene3D.update` 는 rAF 라 헤드리스에서 사실상 안 돈다.
//    좌표를 재기 전에 `Scene3D.anims.length = 0` 로 백로그를 비우고 `refreshPets()` 로 논리
//    좌표에 스냅한 뒤 단발로 렌더한다. 안 그러면 밀린 연출이 좌표를 서로 덮어써 톱니로 튄다.
//
// 사용: NODE_PATH=$(npm root -g) node tools/probe-top3-verify.js [--png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');

const WANT_PNG = process.argv.includes('--png');
const PETS = ['Cerberus', 'Griffin', 'Baby Dragon'];
const GATE_VISIBLE = 0.55;   // 각 펫이 단독 대비 최소 이만큼은 보여야 '온전히 보인다'

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.scene && typeof S !== "undefined" && typeof Mounts !== "undefined"');

    const res = await page.evaluate(([petNames, gate]) => {
        const out = { yaw: {}, pets: {}, post: {}, notes: [] };

        // ── 준비: mythic 대형 펫 3 + mythic 탈것 탑승 ──────────────────────────
        S.pets = petNames.map(n => ({ name: n, rarity: 'mythic', level: 1, dupes: 0, stars: 0 }));
        S.activePets = [0, 1, 2];
        const mountName = (typeof MOUNT_KR !== 'undefined' && Object.keys(MOUNT_KR)[0]) || null;
        if (mountName) {
            S.mounts = [{ name: mountName, rarity: 'mythic', level: 1, xp: 0, stars: 0, subs: [] }];
            S.activeMounts = [0];
            if (Mounts.setRidden) { try { Mounts.setRidden(0); } catch (e) { out.notes.push('setRidden 실패: ' + e.message); } }
        }
        Scene3D.refreshPets();
        Scene3D.refreshMount();
        Scene3D.anims.length = 0;              // 헤드리스 백로그 제거(함정 ③)

        // ── ⓐ yaw 통일 ─────────────────────────────────────────────────────────
        const YAW = Scene3D.CREATURE_YAW;
        const near = (v) => Math.abs(Math.abs(v) - Math.abs(YAW)) < 1e-6;
        const rows = [];
        Scene3D.petGroups.forEach((g, i) => rows.push({ kind: 'pet', id: petNames[i] || i, yaw: g.rotation.y }));
        if (Scene3D.mountGroup) rows.push({ kind: 'mount', id: mountName || 'ridden', yaw: Scene3D.mountGroup.rotation.y });
        (Scene3D.mountFollowers || []).forEach((g, i) => rows.push({ kind: 'follower', id: i, yaw: g.rotation.y }));
        out.yaw = { CREATURE_YAW: YAW, rows, bad: rows.filter(r => !near(r.yaw)) };

        // ── ⓒ 후처리 아웃라인 배선 ────────────────────────────────────────────
        // 🚨 `tDepth.value` 는 **renderFrame() 안에서** 매 프레임 대입된다. 헤드리스는 rAF 가
        //    사실상 안 돌아(함정 ③) 한 번도 대입되지 않은 상태라 그냥 읽으면 항상 null 이다 —
        //    '배선 끊김' 으로 오진하기 딱 좋다. 재기 전에 한 프레임을 손으로 태운다.
        Scene3D.renderFrame();
        const rt = Scene3D._rtScene;
        out.post = {
            postOn: !!Scene3D.postOn,
            hasRT: !!rt,
            hasDepthTexture: !!(rt && rt.depthTexture),
            depthType: rt && rt.depthTexture ? rt.depthTexture.type : null,
            compWired: !!(Scene3D._compMat && Scene3D._compMat.uniforms && Scene3D._compMat.uniforms.tDepth
                && rt && Scene3D._compMat.uniforms.tDepth.value === rt.depthTexture),
            edgeUniforms: Scene3D._compMat && Scene3D._compMat.uniforms
                ? Object.keys(Scene3D._compMat.uniforms).filter(k => /edge|outline|depth/i.test(k)) : [],
        };

        // ── ⓑ 펫 가시율 — 개체 ID 를 색에 실어 단발 렌더 ─────────────────────
        // 렌더러/씬을 본편 그대로 쓰되, 재질만 잠시 갈아 끼우고 끝나면 되돌린다.
        const ID_COLORS = [0xff0000, 0x00ff00, 0x0000ff];
        const saved = [];
        const paint = (root, hex) => root.traverse(o => {
            if (o.isMesh || o.isLine || o.isPoints) {
                saved.push([o, o.material, o.visible]);
                o.material = new THREE.MeshBasicMaterial({ color: hex });
            }
        });
        const hideAll = (root) => root.traverse(o => { saved.push([o, o.material, o.visible]); });
        const restore = () => { for (const [o, m, v] of saved) { o.material = m; o.visible = v; } saved.length = 0; };

        const r = Scene3D.renderer;
        const cam = Scene3D.camera;
        const W = r.domElement.width, H = r.domElement.height;
        // 배경을 흰색으로 — ID 색만 남기려면 배경이 세 색과 겹치면 안 된다.
        const bg0 = Scene3D.scene.background;
        Scene3D.scene.background = new THREE.Color(0xffffff);
        const fog0 = Scene3D.scene.fog; Scene3D.scene.fog = null;   // 안개가 ID 색을 흐리면 픽셀 분류가 샌다

        const grabRaw = () => {
            const prevTarget = r.getRenderTarget();
            r.setRenderTarget(null);
            r.render(Scene3D.scene, cam);            // 후처리를 건너뛴 원본 — ID 색이 블룸에 안 섞이게
            const url = r.domElement.toDataURL();
            r.setRenderTarget(prevTarget);
            return url;
        };

        // 전원 컷: 세 펫에 각각 ID 색
        Scene3D.petGroups.forEach((g, i) => paint(g, ID_COLORS[i]));
        const shotAll = grabRaw();
        restore();

        // 단독 컷: 한 마리만 남기고 나머지(펫·영웅·탈것·따라다니는 무리)를 숨긴다
        const others = [];
        if (Scene3D.heroG) others.push(Scene3D.heroG);
        if (Scene3D.mountGroup) others.push(Scene3D.mountGroup);
        (Scene3D.mountFollowers || []).forEach(g => others.push(g));
        const shotSolo = Scene3D.petGroups.map((g, i) => {
            const hidden = [];
            for (const o of others) { hidden.push([o, o.visible]); o.visible = false; }
            Scene3D.petGroups.forEach((p, j) => { if (j !== i) { hidden.push([p, p.visible]); p.visible = false; } });
            paint(g, ID_COLORS[i]);
            const url = grabRaw();
            restore();
            for (const [o, v] of hidden) o.visible = v;
            return url;
        });

        // NDC bbox — 화면 밖 잘림 확인
        const ndc = Scene3D.petGroups.map(g => {
            const box = new THREE.Box3().setFromObject(g);
            let minx = 9, maxx = -9, miny = 9, maxy = -9;
            for (let i = 0; i < 8; i++) {
                const v = new THREE.Vector3(
                    i & 1 ? box.max.x : box.min.x,
                    i & 2 ? box.max.y : box.min.y,
                    i & 4 ? box.max.z : box.min.z).project(cam);
                minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
                miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
            }
            return { minx, maxx, miny, maxy };
        });

        Scene3D.scene.background = bg0;
        Scene3D.scene.fog = fog0;
        Scene3D.refreshPets();   // ID 재질 흔적 없이 원상복구

        // ── ⓒ-2 아웃라인 **두께** 실측용 컷 ────────────────────────────────────
        // 항목의 요구는 '배선됨'이 아니라 **"어떤 건 두껍고 어떤 건 얇다 → 다 일정해야 함"** 이다.
        // 그래서 본편 그대로(재질 원복 후) 후처리를 태운 컷을 한 장 받아, 노드 쪽에서 검정 런
        // 길이 분포를 낸다. 후처리 엣지는 정의상 화면 1px 이므로 **런 길이가 개체에 무관하게 같아야**
        // 한다 — 종전 인버티드 헐은 파츠 월드스케일에 따라 굵기가 갈렸다(그게 이 항목의 결함).
        // 🚨 **검정 픽셀 ≠ 아웃라인이다.** 첫 런에서 이걸 안 갈라 놓고 재다가 '두께 p90 6px' 이라는
        //    거짓 실패를 냈다 — 실제로는 검은 털·어두운 판금·그림자가 같이 잡힌 것이었다. 그래서
        //    **엣지만 켠 컷과 끈 컷의 차분**으로 아웃라인 화소를 분리한다(`edgeMaxZ=0` 이면
        //    `step(z0, edgeMaxZ)` 가 전 화소에서 0 → 엣지가 통째로 꺼진다. 다른 후처리는 그대로다).
        const uEdgeMaxZ = Scene3D._compMat.uniforms.edgeMaxZ;
        const maxZ0 = uEdgeMaxZ.value;
        Scene3D.renderFrame();
        const shotEdgeOn = r.domElement.toDataURL();
        uEdgeMaxZ.value = 0.0;
        Scene3D.renderFrame();
        const shotEdgeOff = r.domElement.toDataURL();
        uEdgeMaxZ.value = maxZ0;

        out.pets = { names: petNames, shotAll, shotSolo, ndc, W, H, gate };
        out.shotEdgeOn = shotEdgeOn;
        out.shotEdgeOff = shotEdgeOff;
        return out;
    }, [PETS, GATE_VISIBLE]);

    // ── 데이터URL → ID 색 픽셀 카운트 (브라우저 캔버스로 디코드) ───────────────
    const count = await page.evaluate(async ([urls]) => {
        const IDS = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const tally = async (u) => {
            const im = await load(u);
            const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
            const x = c.getContext('2d'); x.drawImage(im, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            const n = [0, 0, 0];
            for (let i = 0; i < d.length; i += 4) {
                const c = [d[i], d[i + 1], d[i + 2]];
                // 🚨 **절대색 임계로 분류하지 말 것** — 렌더러가 ACES 톤매핑 + sRGB 인코딩을 걸어
                //    순색 (0,255,0) 이 화면에서는 ~(100,231,84) 로 나온다. 종전 `|R-0|<90` 판정은
                //    그 100 을 못 받아 **초록 개체를 통째로 0px 로 셌다**(첫 런에서 Griffin 실종).
                //    → 채널 **우세**로 분류한다: 최대 채널이 나머지보다 MARGIN 이상 크면 그 색이다.
                //    흰 배경(세 채널이 다 높고 우세가 없다)은 자동으로 어디에도 안 걸린다.
                const mx = Math.max(c[0], c[1], c[2]);
                const k = c.indexOf(mx);
                const rest = [0, 1, 2].filter(j => j !== k).map(j => c[j]);
                if (mx - Math.max(rest[0], rest[1]) >= 40) n[k]++;
            }
            return n;
        };
        const all = await tally(urls.all);
        const solo = [];
        for (let i = 0; i < urls.solo.length; i++) solo.push((await tally(urls.solo[i]))[i]);
        return { all, solo };
    }, [{ all: res.pets.shotAll, solo: res.pets.shotSolo }]);

    // ── 아웃라인 두께 분포 — 검정 런 길이 히스토그램 ─────────────────────────
    // 캐릭터 대역(화면 상하 30~85%)만 본다: 하늘·UI 여백에는 엣지가 없고, 최하단은 지면 근경이라
    // 깊이 그라디언트가 달라 판정을 흐린다. 가로 스캔라인마다 '검정에 가까운 연속 구간' 길이를 모은다.
    const thick = await page.evaluate(async ([onUrl, offUrl]) => {
        const load = (u) => new Promise(res => { const x = new Image(); x.onload = () => res(x); x.src = u; });
        const px = async (u) => {
            const im = await load(u);
            const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
        };
        const A = await px(onUrl), B = await px(offUrl);
        // 아웃라인 화소 = 엣지를 켰을 때 **검게 덮인** 화소. mix(c, 0, edge) 라 켠 쪽이 확실히 더 어둡다.
        const isEdge = (i) => (B.d[i] - A.d[i]) + (B.d[i + 1] - A.d[i + 1]) + (B.d[i + 2] - A.d[i + 2]) > 60;
        const W = A.W, H = A.H;
        const E = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) if (isEdge(p * 4)) E[p] = 1;

        // 🚨 **가로 스캔 런 길이는 '선 두께'가 아니다.** 첫 시도가 여기서 틀렸다 — 거의 수평인
        //    실루엣 경계는 두께가 2px 이어도 가로로 39px 이어져, 그 39 를 '두꺼운 선'으로 셌다
        //    (진단 `diag-edge-bands.js`: 최대 런 상위가 전부 캐릭터 대역의 수평 경계였다).
        //    → 두께는 **선 방향과 무관해야** 하므로, 화소마다 가로·세로·양 대각선 4방향 런 길이를
        //    재고 그 **최솟값**을 그 화소의 두께로 본다(수평선이면 세로 런=2 → 2px 로 바르게 나온다).
        const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
        const runThrough = (x, y, dx, dy) => {
            let n = 1;
            for (let k = 1; ; k++) { const X = x + dx * k, Y = y + dy * k; if (X < 0 || Y < 0 || X >= W || Y >= H || !E[Y * W + X]) break; n++; }
            for (let k = 1; ; k++) { const X = x - dx * k, Y = y - dy * k; if (X < 0 || Y < 0 || X >= W || Y >= H || !E[Y * W + X]) break; n++; }
            return n;
        };
        const runs = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!E[y * W + x]) continue;
            let t = 1e9;
            for (const [dx, dy] of DIRS) t = Math.min(t, runThrough(x, y, dx, dy));
            runs.push(t);
        }
        runs.sort((a, b) => a - b);
        const hist = {};
        for (const r of runs) hist[r] = (hist[r] || 0) + 1;
        const q = (p) => runs.length ? runs[Math.min(runs.length - 1, (runs.length * p) | 0)] : 0;
        return { n: runs.length, hist, p50: q(0.5), p90: q(0.9), p99: q(0.99), max: runs[runs.length - 1] || 0, W: A.W, H: A.H };
    }, [res.shotEdgeOn, res.shotEdgeOff]);

    if (WANT_PNG) {
        fs.writeFileSync(path.resolve(__dirname, 'top3-pets-id.png'), Buffer.from(res.pets.shotAll.split(',')[1], 'base64'));
        fs.writeFileSync(path.resolve(__dirname, 'top3-edge-on.png'), Buffer.from(res.shotEdgeOn.split(',')[1], 'base64'));
        fs.writeFileSync(path.resolve(__dirname, 'top3-edge-off.png'), Buffer.from(res.shotEdgeOff.split(',')[1], 'base64'));
    }

    // ── 보고 ───────────────────────────────────────────────────────────────────
    let fail = 0;
    console.log('── ⓐ 크리처 yaw 통일 (CREATURE_YAW=' + res.yaw.CREATURE_YAW + ') ──');
    for (const r of res.yaw.rows) console.log('  ' + r.kind.padEnd(9) + String(r.id).padEnd(14) + 'yaw=' + r.yaw.toFixed(4));
    if (res.yaw.bad.length) { fail++; console.log('  ✗ 어긋난 그룹 ' + res.yaw.bad.length + '개: ' + JSON.stringify(res.yaw.bad)); }
    else console.log('  ✓ 전부 ±CREATURE_YAW');

    console.log('── ⓑ 펫 3마리 가시율 (단독 대비, 게이트 ' + (GATE_VISIBLE * 100) + '%) ──');
    res.pets.names.forEach((nm, i) => {
        const solo = count.solo[i], vis = count.all[i];
        const ratio = solo ? vis / solo : 0;
        const b = res.pets.ndc[i];
        const clipped = b.minx < -1 || b.maxx > 1 || b.miny < -1 || b.maxy > 1;
        const ok = ratio >= GATE_VISIBLE && !clipped && solo > 200;
        if (!ok) fail++;
        console.log('  ' + (ok ? '✓' : '✗') + ' ' + nm.padEnd(13)
            + '단독 ' + String(solo).padStart(6) + 'px  화면 ' + String(vis).padStart(6) + 'px  가시율 ' + (ratio * 100).toFixed(1) + '%'
            + '  NDC x[' + b.minx.toFixed(2) + ',' + b.maxx.toFixed(2) + '] y[' + b.miny.toFixed(2) + ',' + b.maxy.toFixed(2) + ']'
            + (clipped ? '  ← 화면 밖 잘림' : ''));
    });

    console.log('── ⓒ 후처리 아웃라인 배선 ──');
    const p = res.post;
    console.log('  postOn=' + p.postOn + ' RT=' + p.hasRT + ' depthTexture=' + p.hasDepthTexture
        + ' type=' + p.depthType + ' 컴포짓배선=' + p.compWired);
    console.log('  깊이/엣지 유니폼: ' + (p.edgeUniforms.join(', ') || '(없음)'));
    if (!(p.postOn && p.hasDepthTexture && p.compWired)) { fail++; console.log('  ✗ 후처리 아웃라인 배선이 끊겨 있다'); }
    else console.log('  ✓ 깊이 텍스처가 컴포짓까지 배선됨');

    console.log('── ⓒ-2 아웃라인 두께 분포 (엣지 on/off 차분, 4방향 최소 런, 캔버스 ' + thick.W + '×' + thick.H + ') ──');
    const topBins = Object.entries(thick.hist).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => k + 'px×' + v + '(' + (v / thick.n * 100).toFixed(1) + '%)');
    console.log('  엣지 화소 ' + thick.n + '개  두께 중앙값 ' + thick.p50 + 'px  p90 ' + thick.p90 + 'px  p99 ' + thick.p99 + 'px  최대 ' + thick.max + 'px');
    console.log('  빈도 상위: ' + topBins.join('  '));
    // 게이트: 균일선이면 p90 이 중앙값 +1px 을 넘지 않는다(1px 선 + 안티에일리어싱 1px 여유).
    const uniform = thick.n > 300 && thick.p90 <= thick.p50 + 1 && thick.p99 <= thick.p50 + 2;
    if (!uniform) { fail++; console.log('  ✗ 두께가 갈린다 (p90 이 중앙값+1px 초과 — 인버티드 헐 잔재 의심)'); }
    else console.log('  ✓ 두께 균일 (p90 ≤ 중앙값+1px)');

    if (res.notes.length) console.log('메모: ' + res.notes.join(' / '));
    if (errors.length) { console.log('페이지 오류 ' + errors.length + '건: ' + errors.slice(0, 5).join(' | ')); fail++; }
    console.log(fail ? '\nFAIL — 항목 ' + fail + '건' : '\nPASS — 3항목 전부 실측 확인');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
