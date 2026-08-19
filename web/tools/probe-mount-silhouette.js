// 탈것 실루엣 분화 판정 (`mount-species-recognizable`).
//
// 이 판정기가 왜 필요했나 — 1차 채점(2026-08-20, 비평가 2인 2/10·4/10)의 결론이
// **"공용 몸통 템플릿을 폐기하라 — 검은 실루엣만 채워 96px 로 뽑았을 때 25장이 서로 다른
// 윤곽이어야 통과다"** 였다. 그 문장은 그대로 측정식이다. 그런데 그때까지의 도구는
// `shot-mount-species.js`(사람이 보는 컬러 시트)뿐이라, '실루엣이 갈렸는가'를 **수치로**
// 되먹임할 수단이 없었다 — 조형을 고쳐도 나아졌는지 눈대중밖에 없었다는 뜻이다.
//
// 재는 것:
//   ⓐ 종별 실루엣을 96px 이진 마스크로 뽑는다(재질을 전부 검정 Basic 으로 갈아 조명·색을
//      지운다 — 색이 남으면 '초록끼리 비슷하다'가 실루엣 점수에 섞인다).
//   ⓑ 모든 종 쌍의 **IoU**(교집합/합집합)를 낸다. 두 마스크를 각자 바운딩박스로 정규화한
//      뒤 겹치므로, 크기가 아니라 **윤곽 모양**만 본다.
//   ⓒ 종별 형태 지표(가로세로비 · 채움률 · 다리 대역 점유율)를 같이 찍는다 — IoU 가 높게
//      나온 쌍이 '어디가 같아서' 같은지 보려면 이 표가 필요하다.
//
// ⚠️ **IoU 는 정규화 후 값이다** — 그래서 '몸집만 키운' 변경은 이 지표를 못 움직인다.
//    그게 의도다: 1차 채점이 지적한 게 정확히 '크기만 다르고 윤곽이 같다'였다.
//
// 게이트(이 판정기의 합격선): 같은 계열(사족) 안에서
//   · 최악 쌍 IoU < 0.90   — 이보다 높으면 두 종이 사실상 같은 그림이다
//   · IoU ≥ 0.85 인 쌍의 수 = 0
// 두 값은 절대 기준이 아니라 **회귀 감시선**이다(착수 시점 기록을 아래 BASELINE 에 남긴다).
//
// 사용: node probe-mount-silhouette.js [종...]      → 표 + 최악 쌍 목록
//       node probe-mount-silhouette.js --png        → tools/mount-silhouette.png 도 같이 저장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');

const RAW = process.argv.slice(2);
const WANT_PNG = RAW.includes('--png');
const ARG = RAW.filter(a => !a.startsWith('--'));
const N = 96;                 // 채점자가 말한 그 크기
const GATE_WORST = 0.90;
const GATE_NEAR = 0.85;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof MOUNT_KR !== "undefined"');

    const out = await page.evaluate(([argNames, size]) => {
        const names = argNames.length ? argNames : Object.keys(MOUNT_KR);
        Scene3D.mountThumb('Pony', 'common');      // 렌더러 1회 초기화
        Scene3D._creatureR.setSize(size, size);

        // 재질을 전부 검정 Basic 으로 — 조명·등급색·AO 를 통째로 지운다.
        // ⚠️ `traverse` 로 갈아치우되 **원본 재질은 건드리지 않는다**(공유 재질이라 갈면 본편이 검게 된다).
        const BLACK = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const blacken = (root) => root.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) o.material = BLACK; });

        const shot = (name, ry) => {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            const bg = sc.background; sc.background = new THREE.Color(0xffffff);
            const g = new THREE.Group();
            g.rotation.y = ry;
            const mesh = Scene3D.makeMountMesh(name, 'epic');
            g.add(mesh);
            sc.add(g);
            // 프레이밍은 컬러 시트와 **같은 경로**로 — 여기서 갈리면 두 도구의 그림이 서로 다른 물건이 된다.
            Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            blacken(g);
            Scene3D._creatureR.render(sc, Scene3D._creatureCam);
            const url = Scene3D._creatureR.domElement.toDataURL();
            sc.background = bg;
            return url;
        };
        // 옆모습(π/2)에서 종 윤곽이 갈린다 — 게임 앵글(0.55)은 3/4 라 앞뒤가 겹쳐 윤곽이 뭉갠다.
        return { names, urls: names.map(nm => shot(nm, Math.PI / 2)) };
    }, [ARG, N]);

    // ── 데이터URL → 이진 마스크 (브라우저 캔버스로 디코드) ─────────────────────────
    const masks = await page.evaluate(async ([urls, size]) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const res = [];
        for (const u of urls) {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = u; });
            cx.clearRect(0, 0, size, size);
            cx.drawImage(img, 0, 0, size, size);
            const d = cx.getImageData(0, 0, size, size).data;
            const m = [];
            for (let i = 0; i < size * size; i++) {
                // 흰 배경(255) 대비 — 검은 실루엣만 1. 안티에일리어싱 경계는 절반 임계로 자른다.
                const lum = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
                m.push(lum < 128 ? 1 : 0);
            }
            res.push(m);
        }
        return res;
    }, [out.urls, N]);

    if (WANT_PNG) {
        const sheet = await page.evaluate(([urls, names, size]) => {
            const cells = urls.map((u, i) => `<div style="margin:2px;text-align:center">
                <img src="${u}" style="width:${size}px;height:${size}px;image-rendering:pixelated;border:1px solid #ccc">
                <div style="font:10px sans-serif;color:#333">#${i + 1} ${names[i]}</div></div>`).join('');
            return `<div style="display:flex;flex-wrap:wrap;background:#fff;width:880px">${cells}</div>`;
        }, [out.urls, out.names, N]);
        await page.setContent(sheet);
        await page.locator('div').first().screenshot({ path: path.resolve(__dirname, 'mount-silhouette.png') });
        console.log('시트 저장: tools/mount-silhouette.png');
    }
    await browser.close();

    // ── 마스크 정규화: 각자 바운딩박스를 같은 격자로 리샘플 ────────────────────────
    // 크기·위치가 아니라 **윤곽 모양**만 비교하기 위해서다.
    const G = 64;
    const norm = masks.map(m => {
        let x0 = N, y0 = N, x1 = -1, y1 = -1;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) return { g: new Array(G * G).fill(0), w: 0, h: 0, area: 0 };
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const g = new Array(G * G).fill(0);
        let area = 0;
        for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
            const sx = x0 + Math.floor(i * w / G), sy = y0 + Math.floor(j * h / G);
            const v = m[sy * N + sx]; g[j * G + i] = v; area += v;
        }
        return { g, w, h, area, rawArea: m.reduce((a, b) => a + b, 0) };
    });

    const iou = (a, b) => {
        let inter = 0, uni = 0;
        for (let i = 0; i < G * G; i++) { const p = a.g[i], q = b.g[i]; if (p && q) inter++; if (p || q) uni++; }
        return uni ? inter / uni : 1;
    };

    // ── 종별 형태 지표 ────────────────────────────────────────────────────────────
    console.log('\n종별 실루엣 지표 (옆모습 ' + N + 'px, 바운딩박스 기준)');
    console.log('  종                      가로:세로   채움률   다리대역(하단35%) 점유');
    const legFill = (nm, i) => {
        const a = norm[i];
        let c = 0, tot = 0;
        for (let j = Math.floor(G * 0.65); j < G; j++) for (let x = 0; x < G; x++) { tot++; c += a.g[j * G + x]; }
        return tot ? c / tot : 0;
    };
    out.names.forEach((nm, i) => {
        const a = norm[i];
        console.log('  ' + nm.padEnd(22) + ' ' + (a.w / a.h).toFixed(2).padStart(8)
            + ' ' + (a.area / (G * G)).toFixed(3).padStart(8)
            + ' ' + legFill(nm, i).toFixed(3).padStart(14));
    });

    // ── 쌍별 IoU ──────────────────────────────────────────────────────────────────
    const pairs = [];
    for (let i = 0; i < out.names.length; i++) for (let j = i + 1; j < out.names.length; j++)
        pairs.push({ a: out.names[i], b: out.names[j], v: iou(norm[i], norm[j]) });
    pairs.sort((p, q) => q.v - p.v);
    const worst = pairs[0], near = pairs.filter(p => p.v >= GATE_NEAR);

    console.log('\n가장 닮은 쌍 15 (IoU · 1.0 = 같은 윤곽)');
    pairs.slice(0, 15).forEach(p => console.log('  ' + p.v.toFixed(3) + '  ' + p.a + '  ↔  ' + p.b));
    const mean = pairs.reduce((s, p) => s + p.v, 0) / pairs.length;
    console.log('\n쌍 ' + pairs.length + '개 · 평균 IoU ' + mean.toFixed(3) + ' · 최악 ' + worst.v.toFixed(3)
        + ' · ≥' + GATE_NEAR + ' 쌍 ' + near.length + '개');

    if (errors.length) console.log('\n콘솔 에러 ' + errors.length + '건:\n  ' + errors.slice(0, 5).join('\n  '));

    const pass = worst.v < GATE_WORST && near.length === 0 && errors.length === 0;
    console.log('\n' + (pass ? 'PASS' : 'FAIL') + ' — 게이트: 최악 IoU < ' + GATE_WORST + ' · ≥' + GATE_NEAR + ' 쌍 0개 · 콘솔 에러 0');
    process.exit(pass ? 0 : 1);
})();
