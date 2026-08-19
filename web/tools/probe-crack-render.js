// 용암 균열이 **렌더된 화면에서** 골로 읽히는지 실측 — `map-quality-up` 잔여, 비평가 2인 #2.
//
// 🚨 `probe-lava-crack.js` 는 **텍스처 캔버스**에 골이 있는지만 봤고 그건 PASS 였다. 그런데 비평가
//    2인이 렌더 결과를 보고 '골·그림자 없이 표면에 얹힌 네온 선'이라 했다. 갭은 **텍스처엔 골이
//    있으나 화면에서 안 읽힌다**는 것 — 이 프로브는 그 갭을 직접 잰다(gl.readPixels, 텍스처 아님).
//
// 무엇을 재는가: 렌더된 용암 지면에서 **발광 균열 픽셀**(밝은 주황)을 찾고, 그 균열 축에 **수직으로
//   바로 옆(어깨)** 픽셀이 주변 암반보다 **어두운가**(= 골의 그림자 립)를 본다.
//   · 골이 제대로 읽히면: 밝은 코어 → 그 양옆에 암반보다 어두운 립 → 주변 암반. '립 < 암반'.
//   · 표면에 얹힌 네온이면: 밝은 코어 → 바로 암반(립 없음). '립 ≈ 암반'.
//   판정: 균열 옆 어깨 밝기가 주변 암반 중앙값보다 CONTRAST 이상 낮은 균열의 비율.
// ⚠️ 화면 좌표에서 균열의 국소 방향을 소벨로 구해 그 수직으로 어깨를 잰다(축을 모르면 코어를 옆으로 오인).
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-crack-render.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const LIP_FRAC_MIN = 0.55;   // 균열 표본 중 '어깨가 암반보다 어둡다'가 성립하는 비율 하한
const CONTRAST = 0.06;       // 어깨가 암반 중앙값보다 이만큼(0~1 휘도) 낮아야 '골'로 친다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.ground)) break;
        await page.waitForTimeout(200);
    }

    const r = await page.evaluate((cfg) => {
        // 🚨 균열 네트워크는 페이지 로드마다 새 난수라, **한 번만 재면 표본이 세그먼트 ~14개에
        //    몰려 립% 가 37~72% 로 튄다**(scatter 프로브와 같은 문제). 캐시를 비우고 REBUILDS 번
        //    다시 구워 표본을 합쳐 평균 낸다 — 튜닝이 노이즈를 쫓지 않게.
        const REBUILDS = 6;
        let TOT = 0, LIP = 0, coreSum = 0, rockSum = 0, nRock = 0;
        for (let rep = 0; rep < REBUILDS; rep++) {
        Scene3D._crackNet = null;            // 균열 네트워크 재생성 강제
        Scene3D._gtex = {};                  // 지면 텍스처 캐시 비움(알베도 골 재생성)
        Scene3D.crackTex = null;             // 발광 크랙 재생성
        Scene3D.setChapterTheme(9);          // 용암 — 텍스처 다시 굽고 terrainMat 에 재적용
        if (Scene3D.terrainMat) {
            const gt = Scene3D.groundTexFor('lava');
            Scene3D.terrainMat.map = gt.map;
            Scene3D.terrainMat.normalMap = gt.normal;
            Scene3D.terrainMat.emissiveMap = Scene3D.crackTex = Scene3D.makeCrackTexture();
            Scene3D.terrainMat.needsUpdate = true;
        }
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        // 지면 표면만 — 영웅·적·소품·능선 숨김(스캐터는 남겨도 무방하나 골 판정엔 지면만)
        const hidden = [];
        Scene3D.scene.traverse(o => {
            if (o === Scene3D.scene || o === Scene3D.ground) return;
            let p = o.parent, under = false;
            while (p) { if (p === Scene3D.ground) { under = true; break; } p = p.parent; }
            if (under) return;
            if (o.isMesh && o.visible) { o.visible = false; hidden.push(o); }
        });
        R.render(Scene3D.scene, Scene3D.camera);
        const d = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
        for (const o of hidden) o.visible = true;

        // readPixels: y=0 이 화면 바닥. 지평선 아래 지면만.
        const cam = Scene3D.camera;
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
        const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
        hp.project(cam);
        const yHor = Math.min(h - 1, Math.round((hp.y + 1) / 2 * h));
        const lum = (x, y) => {
            if (x < 0 || x >= w || y < 0 || y >= h) return -1;
            const i = (y * w + x) * 4;
            return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
        };
        // 균열 '주황도' — 발광 코어는 R 높고 B 낮다
        const orange = (x, y) => {
            const i = (y * w + x) * 4;
            return (d[i] - d[i + 2]) / 255;   // R−B
        };
        // 암반 중앙값(주황 아닌 지면 픽셀)
        const rock = [];
        for (let y = 4; y < yHor; y += 3) for (let x = 4; x < w - 4; x += 3) {
            if (orange(x, y) < 0.12) rock.push(lum(x, y));
        }
        rock.sort((a, b) => a - b);
        const rockMed = rock.length ? rock[rock.length >> 1] : 0.2;

        // 균열 코어 픽셀 = 주황도 상위. 각 코어에서 국소 방향(소벨) → 수직으로 어깨(±3px) 검사.
        let tot = 0, lipOK = 0;
        const cores = [];
        for (let y = 6; y < yHor - 6; y += 2) for (let x = 6; x < w - 6; x += 2) {
            if (orange(x, y) > 0.35 && lum(x, y) > rockMed) cores.push([x, y]);
        }
        for (const [x, y] of cores) {
            // 균열 축(밝기 등고선 방향) — 소벨 그라디언트의 수직
            const gx = lum(x + 1, y) - lum(x - 1, y);
            const gy = lum(x, y + 1) - lum(x, y - 1);
            const gl2 = Math.hypot(gx, gy);
            if (gl2 < 1e-4) continue;
            // 어깨 = 그라디언트 방향(코어에서 밖으로) 양쪽으로 코어 폭 너머
            const nx = gx / gl2, ny = gy / gl2;
            // 코어에서 밖으로 나가며 주황이 빠지는 첫 지점을 어깨로
            let shoulder = -1;
            for (let s = 2; s <= 7; s++) {
                const a = orange(Math.round(x + nx * s), Math.round(y + ny * s));
                const b = orange(Math.round(x - nx * s), Math.round(y - ny * s));
                if (Math.max(a, b) < 0.12) { shoulder = s; break; }
            }
            if (shoulder < 0) continue;
            const la = lum(Math.round(x + nx * shoulder), Math.round(y + ny * shoulder));
            const lb = lum(Math.round(x - nx * shoulder), Math.round(y - ny * shoulder));
            const lip = Math.min(la >= 0 ? la : 1, lb >= 0 ? lb : 1);
            tot++;
            if (lip < rockMed - cfg.CONTRAST) lipOK++;
        }
        TOT += tot; LIP += lipOK; coreSum += cores.length; rockSum += rockMed; nRock++;
        }  // rep 루프 끝
        return { tot: TOT, lipOK: LIP, rockMed: rockSum / nRock, cores: coreSum, rebuilds: REBUILDS };
    }, { CONTRAST });
    await browser.close();

    const frac = r.tot ? r.lipOK / r.tot : 0;
    const ok = frac >= LIP_FRAC_MIN && r.tot >= 20;
    console.log('용암 균열 코어 픽셀 ' + r.cores + ' · 어깨 판정 표본 ' + r.tot + ' · 암반 중앙 휘도 ' + r.rockMed.toFixed(3));
    console.log('균열 옆 골 립(암반보다 ' + CONTRAST + ' 이상 어두움) 비율 ' + (frac * 100).toFixed(1) + '% ' +
        (ok ? 'ok' : '✗') + ' (기준 ' + (LIP_FRAC_MIN * 100) + '%)');
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(ok ? 'PASS — 균열이 렌더에서 골로 읽힌다(옆에 그림자 립)' : 'FAIL — 균열이 표면에 얹힌 발광 선으로 읽힌다(골 립 부재)');
})();
