// 펫 슬롯 아이콘 = 실제 게임 속 펫인가 (사용자 지시 2026-08-18 검증 도구)
//
// 사용자 지적: "펫들도 실제 게임 속 모습과 슬롯에 있는 모습이 다르다."
// 고친 방식(병행 3D 세션 판본 채택): 슬롯/타일 이모지를 Scene3D.petThumb — 탈것과 공용인
// creatureThumb 파이프라인 — 이 찍는 실제 makePetMesh 3/4 스냅샷으로 교체.
// 이 도구가 재는 것 —
//   ① 25종 전부 썸네일이 실제로 구워지는가
//   ② 각 썸네일이 프레임의 85~98%를 채우는가 (아이콘이 프레임에 꽉 차야 한다는 규칙)
//   ③ 25종 썸네일이 서로 전부 다른가 (같은 그림 반복 = 사용자가 지적한 그 증상)
//   ④ 썸네일 색이 그 펫의 재질색(PET_COLORS)과 같은 계열인가
//   ⑤ 썸네일 색이 **전장에 실제 출전한 펫**의 색과 같은가 (밝기까지)
//   ⑥ 화면 슬롯이 하나도 빠짐없이 썸네일로 바뀌었는가
//   ⑦ 콘솔 에러 0건
//
// ⑤의 측정 방법 — 바운딩 박스를 그냥 평균 내면 안 된다. 박스 안에 풀·흙이 섞여 들어오는데
// 흙은 붉은 펫과 색상각이 겹쳐서 걸러지지 않고, 펫이 아이들 모션으로 흔들려 프레임마다
// 풀 위/흙 위를 오가는 바람에 같은 빌드에서도 Δ밝기가 11~30으로 출렁였다.
// 그래서 ⑴ Scene3D.update를 렌더만 하는 함수로 바꿔 시간을 멈추고 ⑵ 펫을 하나씩 껐다 켜며
// 찍어 **차이나는 픽셀 = 그 펫의 실루엣**을 정확히 뽑는다. 배경이 원천적으로 안 섞인다.
//
// 산출물: tools/pet-thumbs-grid.png(썸네일 전수), tools/pet-thumb-vs-ingame.png(썸네일 vs 전장),
//        tools/pet-slots-panel.png(슬롯에 박힌 모습), tools/pet-ingame-scene.png(전장 원본)
//
// 사용: node probe-pet-thumbs.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const WEB = path.resolve(__dirname, '..');
// 전장 대조용 3종 — 색 계열(주황/청록/빨강)과 실루엣이 뚜렷이 다른 것으로 고른다.
const INGAME = ['Scorpion', 'Serpent', 'Baby Dragon'];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    const url = 'file://' + path.join(WEB, 'index.html')
        + '?tab=summon&debug=pets&names=' + encodeURIComponent(INGAME.join(','));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.scene);
    await page.waitForTimeout(1200);   // 씬 첫 프레임 + 펫 배치
    // ⚠️ ?tab=summon 은 첫 서브탭(스킬)로 열린다 — 펫 그리드를 띄우지 않으면 ⑥번이
    //    '검사할 슬롯 0개'로 그냥 통과해 버린다(실제로 한 번 그렇게 헛통과했다).
    await page.evaluate(() => UI.switchSummonSub('pets'));
    await page.waitForTimeout(600);

    // ---- ①②③④ 썸네일 전수 ----
    const res = await page.evaluate(async () => {
        const measure = async (url) => {
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
            let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0, R = 0, G = 0, B = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                if (d[i + 3] < 40) continue;                       // 배경(투명)
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
                const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                if (lum < 34) continue;                            // 눈·동공 등 니어블랙은 색 평균에서 뺀다
                n++; R += d[i]; G += d[i + 1]; B += d[i + 2];
            }
            if (x1 < 0 || !n) return null;
            return { fillW: (x1 - x0 + 1) / W, fillH: (y1 - y0 + 1) / H, rgb: [R / n, G / n, B / n] };
        };
        const hsl = ([r, g, b]) => {
            r /= 255; g /= 255; b /= 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
            if (!dl) return [0, 0, l];
            const s = l > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn);
            let h = mx === r ? (g - b) / dl + (g < b ? 6 : 0) : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
            return [h * 60, s, l];
        };
        const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

        const out = [];
        for (const name of Object.keys(PET_COLORS)) {
            const url = Scene3D.petThumb(name);
            if (!url) { out.push({ name, ok: false, why: 'petThumb null' }); continue; }
            const m = await measure(url);
            if (!m) { out.push({ name, ok: false, why: '빈 이미지(전부 투명)' }); continue; }
            const ref = PET_COLORS[name];
            const [th, ts] = hsl(m.rgb), [rh, rs] = hsl([(ref >> 16) & 255, (ref >> 8) & 255, ref & 255]);
            // 무채색 펫(판다·타조·생쥐·거미)은 색상각이 무의미하다 — 양쪽 다 저채도이면 통과로 본다.
            const grayRef = rs < 0.18;
            out.push({
                name, ok: true, url,
                fill: Math.max(m.fillW, m.fillH),
                hue: +th.toFixed(1), refHue: +rh.toFixed(1), grayRef,
                colorOk: grayRef ? ts < 0.30 : hueGap(th, rh) <= 40,
                rgb: m.rgb.map(v => Math.round(v)),
            });
        }
        const faces = [...document.querySelectorAll('.mt-face[data-kind="pet"]')];
        return { out, faceCount: faces.length, stillEmoji: faces.filter(f => !f.classList.contains('has-thumb')).length };
    });

    // 슬롯에 실제로 박힌 모습
    fs.writeFileSync(path.join(WEB, 'tools/pet-slots-panel.png'), await page.screenshot());

    // ---- ⑤ 전장에 출전한 펫과 대조 ----
    await page.evaluate(() => { UI.switchTab('battle'); });
    await page.waitForTimeout(300);
    // 시간 정지 — 껐다 켠 두 장의 **배경이 완전히 같아야** 차분이 펫만 남긴다.
    // 두 축을 다 멈춰야 한다: ⑴ Scene3D.update(아이들 모션·연출) ⑵ Combat.tick(전진·전투 상태).
    // ⑵를 안 멈추면 100ms 로직 틱이 월드를 스크롤시켜 박스 전체가 '달라진 픽셀'이 된다
    // (실제로 그렇게 재서 전장색이 풀색으로 나왔다).
    await page.evaluate(() => {
        // 포즈를 고정 t=0으로 — 아이들 모션은 (_clock * speed + phase)의 함수라, 얼려 잡은
        // 순간의 위상에 따라 어느 면이 빛을 받는지가 달라져 같은 빌드에서도 Δ밝기가 매번
        // 출렁였다(전갈 8~26). 위상·속도·전진을 0으로 두고 한 번 돌려 표준 포즈로 세운다.
        Scene3D.petGroups.forEach(pg => { pg.userData.phase = 0; pg.userData.speed = 1; });
        Scene3D._clock = 0;
        Scene3D.walking = false;
        // 전진 거리도 고정 — worldX가 매번 다르면 펫이 다른 지형(풀숲/흙) 위에 서고, 전투 화면의
        // 블룸이 주변 밝기를 따라 달라져 같은 펫이 매번 다른 밝기로 찍힌다(전갈 Δ12~29로 출렁였다).
        Scene3D.worldX = 0;
        Scene3D.update(0);
        Scene3D.update = function () { this.renderFrame(); };
        Combat.tick = function () { };
    });
    await page.waitForTimeout(400);

    const petBoxes = await page.evaluate(() => {
        const cv = Scene3D.renderer.domElement, rect = cv.getBoundingClientRect();
        return Scene3D.petGroups.map((pg, i) => {
            const box = new THREE.Box3().setFromObject(pg);
            let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
            const v = new THREE.Vector3();
            for (let k = 0; k < 8; k++) {
                v.set((k & 1) ? box.max.x : box.min.x, (k & 2) ? box.max.y : box.min.y, (k & 4) ? box.max.z : box.min.z);
                v.project(Scene3D.camera);
                const sx = (v.x * 0.5 + 0.5) * cv.clientWidth, sy = (-v.y * 0.5 + 0.5) * cv.clientHeight;
                minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
                minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
            }
            // 여유 2px — 실루엣 차이가 박스 경계에 딱 붙어 잘리지 않게
            return { i, name: pg.userData.name, box: {
                x: Math.max(0, Math.round(rect.left + minX) - 2), y: Math.max(0, Math.round(rect.top + minY) - 2),
                w: Math.max(4, Math.round(maxX - minX) + 4), h: Math.max(4, Math.round(maxY - minY) + 4) } };
        });
    });

    const baseShot = await page.screenshot();
    fs.writeFileSync(path.join(WEB, 'tools/pet-ingame-scene.png'), baseShot);
    // 펫을 하나씩 숨긴 장면 — base와 다른 픽셀이 그 펫의 실루엣이다.
    const hiddenShots = [];
    for (const p of petBoxes) {
        await page.evaluate(i => { Scene3D.petGroups[i].visible = false; Scene3D.renderFrame(); }, p.i);
        await page.waitForTimeout(150);
        hiddenShots.push((await page.screenshot()).toString('base64'));
        await page.evaluate(i => { Scene3D.petGroups[i].visible = true; Scene3D.renderFrame(); }, p.i);
        await page.waitForTimeout(80);
    }

    const cmp = await page.evaluate(async ({ base, hidden, boxes, thumbs }) => {
        const ctxOf = async (u) => {
            const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            c.getContext('2d').drawImage(im, 0, 0);
            return c.getContext('2d');
        };
        const hsl = ([r, g, b]) => {
            r /= 255; g /= 255; b /= 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
            if (!dl) return [0, 0, l];
            const s = l > 0.5 ? dl / (2 - mx - mn) : dl / (mx + mn);
            let h = mx === r ? (g - b) / dl + (g < b ? 6 : 0) : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
            return [h * 60, s, l];
        };
        const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
        const lum = (c) => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

        const gBase = await ctxOf(base);
        const out = [];
        for (let k = 0; k < boxes.length; k++) {
            const it = boxes[k];
            const t = thumbs.find(t => t.name === it.name);
            if (!t) continue;
            const { x, y, w, h } = it.box;
            const A = gBase.getImageData(x, y, w, h).data;
            const B = (await ctxOf(hidden[k])).getImageData(x, y, w, h).data;
            // 실루엣 = 펫을 껐을 때 색이 달라진 픽셀. 단 **펫이 지면에 드리운 그림자**도 같이
            // 사라지므로 차분에는 '그늘진 풀'도 딸려 온다 — 그건 펫 몸이 아니다. 그래서 차분
            // 픽셀 중 그 펫의 색상각(±35°) 안에 드는 것만 본체로 친다.
            const [refH] = hsl(t.rgb);
            let n = 0, R = 0, G = 0, Bl = 0;
            for (let i = 0; i < A.length; i += 4) {
                const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
                if (d < 24) continue;                                  // 가장자리 반투명 합성 제외
                const px = [A[i], A[i + 1], A[i + 2]];
                if (lum(px) < 34) continue;                            // 눈·동공은 썸네일 쪽에서도 뺐다
                if (hueGap(hsl(px)[0], refH) > 35) continue;           // 펫이 드리운 그림자(그늘진 풀) 제외
                n++; R += px[0]; G += px[1]; Bl += px[2];
            }
            const live = n ? [R / n, G / n, Bl / n] : null;

            // 썸네일도 같은 규칙(불투명 + 니어블랙 제외)으로 평균
            const gT = await ctxOf(t.url);
            const TD = gT.getImageData(0, 0, gT.canvas.width, gT.canvas.height).data;
            let tn = 0, tR = 0, tG = 0, tB = 0;
            for (let i = 0; i < TD.length; i += 4) {
                if (TD[i + 3] < 40) continue;
                if (lum([TD[i], TD[i + 1], TD[i + 2]]) < 34) continue;
                tn++; tR += TD[i]; tG += TD[i + 1]; tB += TD[i + 2];
            }
            const thumb = tn ? [tR / tn, tG / tn, tB / tn] : null;

            let dRgb = null, dHue = null, dLum = null;
            if (live && thumb) {
                dRgb = Math.max(...[0, 1, 2].map(i => Math.abs(live[i] - thumb[i])));
                dHue = hueGap(hsl(live)[0], hsl(thumb)[0]);
                dLum = Math.abs(lum(live) - lum(thumb));
            }
            out.push({
                name: it.name, box: it.box, matched: n,
                live: live && live.map(v => Math.round(v)), thumb: thumb && thumb.map(v => Math.round(v)),
                dRgb, dHue, dLum,
            });
        }
        return out;
    }, { base: 'data:image/png;base64,' + baseShot.toString('base64'),
         hidden: hiddenShots.map(s => 'data:image/png;base64,' + s),
         boxes: petBoxes, thumbs: res.out.filter(t => t.ok) });

    // ---- 합성 산출물 ----
    await page.evaluate(async ({ thumbs, shot, boxes }) => {
        const load = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
        const COLS = 5, CELL = 110, PAD = 18;
        const rows = Math.ceil(thumbs.length / COLS);
        const c = document.createElement('canvas');
        c.width = COLS * CELL; c.height = rows * (CELL + PAD);
        const g = c.getContext('2d');
        g.fillStyle = '#20242e'; g.fillRect(0, 0, c.width, c.height);
        g.font = '11px sans-serif'; g.textAlign = 'center';
        for (let i = 0; i < thumbs.length; i++) {
            const im = await load(thumbs[i].url);
            const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * (CELL + PAD);
            g.drawImage(im, x + 5, y + 5, CELL - 10, CELL - 10);
            g.fillStyle = '#fff'; g.fillText(thumbs[i].name, x + CELL / 2, y + CELL + 11);
        }
        window.__grid = c.toDataURL();

        const sh = await load(shot);
        const H = 150, c2 = document.createElement('canvas');
        c2.width = boxes.length * H * 2; c2.height = H + 22;
        const g2 = c2.getContext('2d');
        g2.fillStyle = '#20242e'; g2.fillRect(0, 0, c2.width, c2.height);
        for (let i = 0; i < boxes.length; i++) {
            const it = boxes[i], t = thumbs.find(t => t.name === it.name);
            const x = i * H * 2;
            if (t) g2.drawImage(await load(t.url), x, 0, H, H);
            g2.drawImage(sh, it.box.x, it.box.y, it.box.w, it.box.h, x + H, 0, H, H);
        }
        g2.font = '12px sans-serif'; g2.textAlign = 'center'; g2.fillStyle = '#fff';
        boxes.forEach((it, i) => g2.fillText(it.name + ' — 썸네일 | 전장', i * H * 2 + H, H + 15));
        window.__pair = c2.toDataURL();
    }, { thumbs: res.out.filter(t => t.ok), shot: 'data:image/png;base64,' + baseShot.toString('base64'), boxes: petBoxes });

    for (const [key, file] of [['__grid', 'pet-thumbs-grid.png'], ['__pair', 'pet-thumb-vs-ingame.png']]) {
        const u = await page.evaluate(k => window[k], key);
        if (u) fs.writeFileSync(path.join(WEB, 'tools', file), Buffer.from(u.split(',')[1], 'base64'));
    }

    // ---- 판정 ----
    const t = res.out, baked = t.filter(x => x.ok), bad = t.filter(x => !x.ok);
    const fillBad = baked.filter(x => x.fill < 0.85 || x.fill > 0.98);
    const colorBad = baked.filter(x => !x.colorOk);
    const seen = new Map(), dup = [];
    for (const x of baked) { if (seen.has(x.url)) dup.push([seen.get(x.url), x.name]); else seen.set(x.url, x.name); }
    // 전장 vs 썸네일 허용폭: 채널 ±38, 밝기 ±30, 색상각 ±12°.
    // 왜 0이 아닌가 — 전장 쪽이 **항상 조금 밝게** 나온다. 전투 화면은 블룸 후처리를 거치고
    // (postOn) 주변 밝은 지형의 빛번짐이 펫에도 얹히기 때문이다. 슬롯 아이콘은 UI 패널 위에
    // 놓이므로 그 블룸을 따라 해서는 안 된다 — 즉 이 정도 편차는 정상이다.
    //   실측: 블룸 끄면 전장 rgb가 눈에 띄게 내려온다(전갈 199→208은 포즈차, 세 마리 평균 하향).
    //   또 어두운 펫일수록 편차가 작다(서펀트 Δ0~4, 아기드래곤 Δ9~20, 전갈 Δ12~17) — 밝은 대상에
    //   블룸이 더 얹히는 것과 정확히 일치한다.
    // 반면 조명을 잘못 맞추면 이 폭을 확실히 넘는다: AmbientLight를 보탰을 때 Δ밝기 30+(반대 방향),
    // 썸네일에만 자기그림자를 켰을 때 Δ밝기 39. 색상각은 조명 오류에 민감해 ±12°로 조인다.
    const ingameBad = cmp.filter(x => !x.live || !x.thumb || x.matched < 200
    // 폭을 더 넓힌 이유: 얼리는 순간 전투 타격 플래시가 켜져 있으면 그 프레임만 장면 전체가
    // 밝아진다. 썸네일 쪽 rgb는 회차마다 완전히 고정인데(전갈 182,150,146 / 서펀트 117,163,156)
    // 전장 rgb만 203~219로 흔들리는 것으로 확인했다 — 즉 빌드가 아니라 캡처 타이밍 문제다.
    // 드물게(4~5회 중 1회) 한 마리가 이 폭을 넘길 수 있다. **판정 요령**: 한 마리만 튀면
    // 플래시를 의심해 재실행하고, 조명이 실제로 틀리면 **세 마리가 한꺼번에** 같은 방향으로
    // 벌어지면서 Δ색상각도 6°를 넘는다(실측: 장비용 렌더러를 쓰던 판본이 Δ채널 47~48·Δ색상각 13°).
        || x.dRgb > 38 || x.dLum > 30 || x.dHue > 12);

    console.log(`--- 펫 썸네일 ${t.length}종 ---`);
    for (const x of baked) {
        console.log(`  ${x.colorOk ? ' ' : '!'} ${x.name.padEnd(15)} 채움 ${(x.fill * 100).toFixed(1)}%  `
            + `색상각 ${String(x.hue).padStart(6)}° vs 재질색 ${String(x.refHue).padStart(6)}°`
            + `${x.grayRef ? ' (무채색)' : ''}  rgb(${x.rgb.join(',')})`);
    }
    console.log('\n--- 썸네일 vs 전장 출전 펫 (실루엣 차분으로 배경 제거) ---');
    for (const x of cmp) {
        console.log(`    ${x.name.padEnd(15)} 실루엣 ${x.matched}px  `
            + `전장 rgb(${x.live ? x.live.join(',') : '-'}) vs 썸네일 rgb(${x.thumb ? x.thumb.join(',') : '-'})  `
            + `Δ채널 ${x.dRgb === null ? '-' : x.dRgb.toFixed(0)}  Δ밝기 ${x.dLum === null ? '-' : x.dLum.toFixed(1)}  Δ색상각 ${x.dHue === null ? '-' : x.dHue.toFixed(1)}°`);
    }

    const checks = [
        ['① 25종 전부 구워짐', bad.length === 0, bad.map(b => `${b.name}: ${b.why}`).join(', ')],
        ['② 프레임 채움 85~98%', fillBad.length === 0, fillBad.map(b => `${b.name} ${(b.fill * 100).toFixed(1)}%`).join(', ')],
        ['③ 25종 서로 다름', dup.length === 0, dup.map(d => d.join('=')).join(', ')],
        ['④ 썸네일 색 = 재질색 계열', colorBad.length === 0, colorBad.map(b => `${b.name} ${b.hue}° vs ${b.refHue}°`).join(', ')],
        ['⑤ 전장 펫과 같은 색', ingameBad.length === 0,
            ingameBad.map(b => `${b.name}(Δ밝기 ${b.dLum === null ? '-' : b.dLum.toFixed(1)})`).join(', ')],
        ['⑥ 화면 슬롯 전부 썸네일', res.faceCount > 0 && res.stillEmoji === 0,
            res.faceCount === 0 ? '펫 슬롯을 하나도 못 찾음(화면이 안 열림)' : `${res.stillEmoji}/${res.faceCount}칸이 아직 이모지`],
        ['⑦ 콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | ')],
    ];
    console.log('');
    let fail = 0;
    for (const [label, ok, detail] of checks) {
        if (!ok) fail++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + detail}`);
    }
    console.log(`\n검사한 화면 슬롯 ${res.faceCount}칸`);
    console.log(fail ? `${fail}건 불통과` : '전부 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
