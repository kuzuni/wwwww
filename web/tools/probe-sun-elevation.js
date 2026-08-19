// map-quality-up — POLISH.md 진행로그 ⑶ '태양 고도가 코드 두 곳에서 서로를 부정한다' 를 끝내기 위한 실측 스윕.
//
// 배경(POLISH.md 2026-08-19(2) ⑶): `scene3d.js` 생성자는 `sun.position.set(4, 9.5, 3.5)`(고도 ~61°)에
//   "45도의 긴 그림자가 본체 이탈 '검은 얼룩'으로 읽힘(비평가 7.3 4번)" 이라고 적어 두었는데,
//   `setTheme` 이 낮 챕터마다 `sun.position.set(7, 5.2, 3.2)`(고도 34°)로 **덮어쓴다**
//   — "측면 45도 저고도, 요철 스컬핑 최대로". 뒤 라운드가 앞 라운드의 수정을 되돌려 놓았고,
//   이번 라운드 비평가는 되살아난 그 결함('캐스터 없는 아메바 얼룩')을 다시 지적했다.
//
// 두 주장 다 근거가 있으므로 **한쪽을 고르지 말고 두 지표를 같이 재서** 절충점을 찾는다:
//   ⒜ 그림자 이탈 — 그림자 화소 중 **소품 실루엣 밖**에 있는 비율, 그리고 **가장 큰 연결 덩어리** 크기.
//      고도가 낮을수록 그림자가 길어져 본체에서 떨어져 나가고 서로 뭉쳐 한 덩어리가 된다.
//   ⒝ 요철 스컬핑 — 소품 화소의 **휘도 표준편차**(면마다 밝기가 갈릴수록 형태가 읽힌다).
//      고도가 높을수록 정수리만 밝고 옆면이 평평해져 이 값이 떨어진다(저고도 쪽 주장의 근거).
//
// ⚠️ 그림자 마스크는 `shadowMap.enabled` 토글 차분으로 잡는다(probe-ground-seam 과 같은 방식) —
//    재질 needsUpdate 를 같이 돌려야 실제로 꺼진다.
// ⚠️ 헤드리스는 rAF 가 안 도니 `Scene3D.update` 를 손으로 흘린다(TODO 상단 함정 ③).
// ⚠️ 소품 배치가 `U.rand` 라 **같은 페이지 안에서** 고도만 바꿔 재야 한다. 챕터를 다시 지으면 배치가
//    달라져 비교가 성립하지 않는다(POLISH.md ⑵ 의 같은 경고).
//
// 사용: node tools/probe-sun-elevation.js [chapter]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const CH = +(process.argv[2] || 3);
const ELEVS = [34, 42, 48, 54, 61];   // 34 = 옛 setTheme 값, 48 = 채택값(SUN_DAY), 61 = 옛 생성자 값
const SHIP_LO = 44, SHIP_HI = 52;     // 배포 고도가 들어 있어야 하는 대역
const SD_TOL = 0.05;                  // 소품 휘도 SD 허용 손실(5%)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });

    const out = await page.evaluate(({ CH, ELEVS }) => {
        Combat.tick = () => { };
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        Scene3D.walking = false;
        Scene3D.anims.length = 0;
        S.chapter = CH;
        Scene3D.setChapterTheme(CH);
        for (let i = 0; i < 60; i++) realUpdate(1 / 120);

        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const grab = () => {
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            return d;
        };
        const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const diffMask = (a, b, th) => {
            const m = new Uint8Array(w * h);
            for (let p = 0; p < w * h; p++) {
                const i = p * 4;
                if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > th) m[p] = 1;
            }
            return m;
        };
        const setShadows = (on) => {
            R.shadowMap.enabled = on;
            Scene3D.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => mt.needsUpdate = true); });
        };
        // 소품 실루엣 — `Scene3D.trees` 만 훑으면 큰 소품만 본다(POLISH.md ⑴ 의 사각지대).
        // 지면·하늘·영웅·적을 뺀 나머지 = 소품으로 잡기 위해, 소품 그룹을 통째로 껐다 켠 차분을 쓴다.
        const propRoots = [];
        Scene3D.scene.children.forEach(c => {
            if (c === Scene3D.heroG || c === Scene3D.ground || !c.visible) return;
            if (c.isLight || c.isCamera) return;
            propRoots.push(c);
        });
        // 가장 큰 연결 덩어리 — 2px 다운샘플 격자에서 flood fill (전해상도는 헤드리스에서 너무 느리다)
        const biggestBlob = (mask) => {
            const W2 = w >> 1, H2 = h >> 1;
            const g = new Uint8Array(W2 * H2);
            for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) g[y * W2 + x] = mask[(y * 2) * w + x * 2];
            const seen = new Uint8Array(W2 * H2);
            let best = 0, stack = new Int32Array(W2 * H2);
            for (let s = 0; s < W2 * H2; s++) {
                if (!g[s] || seen[s]) continue;
                let sp = 0, n = 0; stack[sp++] = s; seen[s] = 1;
                while (sp) {
                    const q = stack[--sp]; n++;
                    const qx = q % W2, qy = (q / W2) | 0;
                    if (qx > 0 && g[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[sp++] = q - 1; }
                    if (qx < W2 - 1 && g[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[sp++] = q + 1; }
                    if (qy > 0 && g[q - W2] && !seen[q - W2]) { seen[q - W2] = 1; stack[sp++] = q - W2; }
                    if (qy < H2 - 1 && g[q + W2] && !seen[q + W2]) { seen[q + W2] = 1; stack[sp++] = q + W2; }
                }
                if (n > best) best = n;
            }
            return best * 4;   // 다운샘플 격자 1칸 = 원해상도 4화소
        };
        // 마스크 팽창 — '본체 바로 밑 접지 그림자'는 이탈이 아니다. 소품 실루엣을 r 화소 부풀려 면제한다.
        const dilate = (mask, r) => {
            const o = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (!mask[y * w + x]) continue;
                for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                    const ny = y + dy, nx = x + dx;
                    if (ny >= 0 && ny < h && nx >= 0 && nx < w) o[ny * w + nx] = 1;
                }
            }
            return o;
        };

        const rows = [];
        const L = Math.hypot(7, 3.2);
        for (const el of ELEVS) {
            const y = L * Math.tan(el * Math.PI / 180);
            Scene3D.sun.position.set(7 + Scene3D.worldX, y, 3.2);
            Scene3D.sun.userData.baseX = 7;
            Scene3D.sun.target.position.x = Scene3D.worldX;
            Scene3D.sun.target.updateMatrixWorld();
            Scene3D.sun.shadow.needsUpdate = true;

            setShadows(true); const withS = grab();
            setShadows(false); const noS = grab();
            setShadows(true);
            const shadow = diffMask(withS, noS, 10);

            // 소품 실루엣
            const vis = propRoots.map(o => o.visible);
            propRoots.forEach(o => o.visible = false); const noProps = grab();
            propRoots.forEach((o, i) => o.visible = vis[i]); const withProps = grab();
            const props = diffMask(withProps, noProps, 14);
            const propsD = dilate(props, 6);

            let shN = 0, orphan = 0;
            for (let p = 0; p < w * h; p++) if (shadow[p]) { shN++; if (!propsD[p]) orphan++; }
            let pN = 0, sum = 0, sum2 = 0;
            for (let p = 0; p < w * h; p++) if (props[p]) { const l = lum(withProps, p * 4); pN++; sum += l; sum2 += l * l; }
            const mean = pN ? sum / pN : 0;
            const sd = pN ? Math.sqrt(Math.max(0, sum2 / pN - mean * mean)) : 0;

            // 영웅도 같이 잰다 — 고도를 올리면 '정수리만 밝고 옆면이 평평'해지는 손해가 캐릭터에 먼저 온다.
            const hv = Scene3D.heroG.visible;
            Scene3D.heroG.visible = false; const noHero = grab();
            Scene3D.heroG.visible = hv; const withHero = grab();
            const hero = diffMask(withHero, noHero, 14);
            let hN = 0, hs = 0, hs2 = 0, hDark = 0;
            for (let p = 0; p < w * h; p++) if (hero[p]) { const l = lum(withHero, p * 4); hN++; hs += l; hs2 += l * l; if (l <= 0.18) hDark++; }
            const hMean = hN ? hs / hN : 0;
            const hSd = hN ? Math.sqrt(Math.max(0, hs2 / hN - hMean * hMean)) : 0;

            rows.push({
                el, y: +y.toFixed(2),
                shadowPct: +(shN / (w * h) * 100).toFixed(2),
                orphanPct: shN ? +(orphan / shN * 100).toFixed(1) : 0,
                blobPx: biggestBlob(shadow),
                propSd: +sd.toFixed(4),
                propMean: +mean.toFixed(4),
                propPx: pN,
                heroSd: +hSd.toFixed(4), heroMean: +hMean.toFixed(4), heroDarkPct: hN ? +(hDark / hN * 100).toFixed(2) : 0,
            });
        }
        // 배포 값 확인 — setTheme 이 실제로 SUN_DAY 를 쓰는가(리터럴이 다시 갈라지면 여기서 잡힌다).
        Scene3D.setChapterTheme(CH);
        const sd3 = Scene3D.SUN_DAY || null;
        const live = Scene3D.sun.position.clone();
        live.x -= Scene3D.worldX;                       // 무한맵 스크롤 보정(update 가 baseX + worldX 로 민다)
        const shipEl = +(Math.atan2(live.y, Math.hypot(live.x, live.z)) * 180 / Math.PI).toFixed(1);
        const usesConst = !!sd3 && Math.abs(live.x - sd3[0]) < 1e-6 && Math.abs(live.y - sd3[1]) < 1e-6 && Math.abs(live.z - sd3[2]) < 1e-6;
        return { rows, w, h, propRoots: propRoots.length, sunDay: sd3, shipEl, usesConst };
    }, { CH, ELEVS });

    console.log(`\n  챕터 ${CH} · 버퍼 ${out.w}×${out.h} · 소품 루트 ${out.propRoots}개`);
    console.log('  고도°   sun.y   그림자면적%   이탈%   최대덩어리px   소품SD   소품L   영웅SD   영웅L   영웅다크%');
    for (const r of out.rows) {
        console.log(`  ${String(r.el).padStart(4)}   ${String(r.y).padStart(6)}   ${String(r.shadowPct).padStart(10)}   ${String(r.orphanPct).padStart(6)}   ${String(r.blobPx).padStart(11)}   ${String(r.propSd).padStart(6)}   ${String(r.propMean).padStart(6)}   ${String(r.heroSd).padStart(6)}   ${String(r.heroMean).padStart(6)}   ${String(r.heroDarkPct).padStart(8)}`);
    }
    const base = out.rows[0];
    console.log(`\n  기준선 = 현재 setTheme 값(고도 34°): 이탈 ${base.orphanPct}% · 최대덩어리 ${base.blobPx}px · 휘도SD ${base.propSd}`);
    console.log('  읽는 법: 이탈%·최대덩어리는 낮을수록 좋고(아메바 얼룩), 휘도SD 는 높을수록 좋다(요철 스컬핑).');
    // ── 판정 (판정문 없는 도구는 사각지대다) ──
    const nearest = out.rows.reduce((a, b) => Math.abs(b.el - out.shipEl) < Math.abs(a.el - out.shipEl) ? b : a);
    console.log(`\n  배포 SUN_DAY = ${JSON.stringify(out.sunDay)} → 고도 ${out.shipEl}° · setTheme 이 상수를 쓰는가: ${out.usesConst ? 'YES' : 'NO'}`);
    console.log(`  그 고도의 스윕 행(${nearest.el}°): 이탈 ${nearest.orphanPct}% · 최대덩어리 ${nearest.blobPx}px · 소품SD ${nearest.propSd} · 영웅다크 ${nearest.heroDarkPct}%`);
    const checks = [
        ['① 낮 태양이 SUN_DAY 상수 한 곳에서 온다(리터럴 재분화 없음)', out.usesConst],
        [`② 배포 고도 ${SHIP_LO}~${SHIP_HI}°`, out.shipEl >= SHIP_LO && out.shipEl <= SHIP_HI],
        ['③ 34° 대비 그림자 이탈 감소', nearest.orphanPct <= base.orphanPct],
        ['④ 34° 대비 그림자 총면적 감소', nearest.shadowPct < base.shadowPct],
        [`⑤ 34° 대비 소품 요철(휘도SD) 손실 ${SD_TOL * 100}% 이내`, nearest.propSd >= base.propSd * (1 - SD_TOL)],
        ['⑥ 콘솔 에러 0', errs.length === 0],
    ];
    let fail = 0;
    console.log('');
    for (const [n, ok] of checks) { console.log(`  ${ok ? '✅' : '❌'} ${n}`); if (!ok) fail++; }
    console.log(fail ? `\n  판정: ❌ ${fail}건 미통과` : '\n  판정: ✅ 전부 통과');
    if (errs.length) console.log(' ', errs.slice(0, 4));
    await browser.close();
})();
