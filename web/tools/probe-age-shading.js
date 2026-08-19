// 시대별 셰이딩 파이프라인 실측 — 사용: node probe-age-shading.js
// TODO 'equip-design-dedupe' ⓒ⑴ 전용. 비평가 2차 지적:
//   "두 시대가 지오메트리 100% 동일에 흰색↔하늘색 색 스와프뿐. 중세는 metalness + 에지 웨어
//    (모서리 밝게) + 크레비스 다크닝(AO 근사)을, 원시는 뼈=아이보리·가죽=탄 갈색·돌=회청색으로
//    파트별 색 분리를."
// 지적이 셋(① 색 스와프 ② 셰이딩 깊이 없음 ③ 파트 색 미분리)이라 지표도 셋이다.
//
//  ① 재질 분리(matSep) — ⚠️ 첫 판에서 이 지표를 **hue 차 상한**으로 짰다가 전 쌍이 반려됐다.
//     틀린 설계였다. 시대끼리 색이 다른 건 당연하고(황동은 금빛, 합금은 검다) 오히려 요구사항 ②다.
//     비평가가 친 건 "**색만** 다르다"이지 "색이 다르다"가 아니다. 게다가 이 팔레트는 대부분
//     무채색에 가까워 hue 자체가 수치적으로 불안정하다(회색의 hue 는 노이즈다).
//     → 색이 아닌 축, 즉 **휘도 분포**로 잰다. 시대 쌍마다 휘도SD·깊이·평균휘도 중
//     **최소 하나가 확실히 갈려야** 통과(각 축의 기준치로 정규화해 최댓값 ≥ 1.0).
//  ② 셰이딩 깊이 — ⚠️ 처음엔 **하위10% 대비 상위10% 휘도비(depth)** 로만 쟀는데, 이 지표는
//     **파트 알베도에 오염된다.** 비평가 요구대로 원시 가죽을 '탄 갈색'으로 밝히자(0x33220f →
//     0x5a3a1c) 하위 10%가 통째로 올라가 primal/hide 의 depth 가 1.83 → 1.74 로 **떨어졌다** —
//     셰이딩은 좋아졌는데 지표만 나빠진 것이다. 그래서 **정규화 대비(cv = 휘도SD / 평균휘도)** 를
//     본 게이트로 쓴다(밝기 전역 이동에 불변). depth 는 참고로만 출력한다.
//     게이트는 계열·스타일별 **회귀 기준선**이다 — 2026-08-18 개선 후 실측에서 여유를 뺀 값.
//  ③ 파트 색 분리(parts) — 한 칸 안에서 8×8×8 색 큐브로 양자화해 1% 이상 차지하는 색 군집 수.
//     원시는 돌·가죽·뼈 3계열이 보여야 하므로 3 이상.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// 회귀 기준선 — [ⓒ⑴ 적용 전 cv, 하한]. 하한 = 적용 후 실측 − 0.008.
// 열 명세: cv = 휘도SD/평균휘도. 10칸 **전부** 적용 전보다 올랐다(depth 로는 primal/hide 만 내려가
// 보였는데, 그건 위 ② 의 알베도 오염이다).
const BASE = {
    'primal/plate': [0.145, 0.196], 'primal/hide': [0.145, 0.148],
    'forged/plate': [0.240, 0.334], 'forged/hide': [0.133, 0.149],
    'brass/plate': [0.171, 0.278], 'brass/hide': [0.140, 0.154],
    'polymer/plate': [0.115, 0.163], 'polymer/hide': [0.136, 0.176],
    'alloy/plate': [0.390, 0.488], 'alloy/hide': [0.178, 0.258],
};
const PARTS_MIN = 3;      // 원시 파트 색 군집 최소
// 재질 분리 축별 기준치 — 셋 중 하나만 넘겨도 '색 스와프가 아니다'로 본다
const SEP_SD = 2.0, SEP_DEPTH = 0.35, SEP_MEAN = 12.0;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, "typeof Scene3D !== 'undefined' && Scene3D.itemThumb");   // ⚠️ waitForFunction 은 이 컨테이너에서 안 돈다(wait-ready.js 헤더)

    const res = await page.evaluate(async () => {
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(192, 192);
        Scene3D._thumbCache = {};
        // 계열 5종을 대표 시대 하나씩으로 — ageGearKind 의 구획과 같다
        const AGE_OF = { primal: 'primitive', forged: 'medieval', brass: 'earlyModern', polymer: 'modern', alloy: 'space' };
        // 스타일은 plate 고정 — 조형이 같아야 '셰이딩만의 차이'가 잡힌다(지적 자체가 "지오메트리 동일"이다)
        const STYLES = ['plate', 'hide'];
        const out = [], buildErrs = [];
        const N = 192;
        const t = document.createElement('canvas'); t.width = t.height = N;
        const tc = t.getContext('2d', { willReadFrequently: true });
        const jobs = [];

        for (const kind of Object.keys(AGE_OF)) {
            const age = AGE_OF[kind];
            for (const style of STYLES) {
                let url = null;
                try {
                    const model = Scene3D.makeArmorPreview(age, 'rare', style, '');
                    const sc = Scene3D._thumbScene;
                    Scene3D.clearGroup(sc);
                    sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
                    const g = new THREE.Group();
                    g.add(model); sc.add(g);
                    const d = Scene3D.ITEM_THUMB_DIR;
                    Scene3D.thumbFrameToFit(Scene3D._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
                    Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                    url = Scene3D._thumbR.domElement.toDataURL();
                } catch (e) { buildErrs.push(kind + '/' + style + ': ' + e.message); }
                if (!url) continue;
                jobs.push(new Promise(resolve => {
                    const im = new Image();
                    im.onload = () => {
                        tc.clearRect(0, 0, N, N);
                        tc.drawImage(im, 0, 0, N, N);
                        const d = tc.getImageData(0, 0, N, N).data;
                        const lum = [], bins = {};
                        let rs = 0, gs = 0, bs = 0, n = 0;
                        for (let i = 0; i < N * N; i++) {
                            if (d[i * 4 + 3] < 200) continue;   // 피사체 내부만 — 반투명 가장자리는 배경과 섞여 지표를 흐린다
                            const r = d[i * 4], g2 = d[i * 4 + 1], b = d[i * 4 + 2];
                            lum.push(0.2126 * r + 0.7152 * g2 + 0.0722 * b);
                            rs += r; gs += g2; bs += b; n++;
                            const k = (r >> 5) * 64 + (g2 >> 5) * 8 + (b >> 5);
                            bins[k] = (bins[k] || 0) + 1;
                        }
                        if (!n) { resolve(); return; }
                        lum.sort((x, y) => x - y);
                        const q = f => lum[Math.min(lum.length - 1, Math.max(0, Math.floor(lum.length * f)))];
                        const lo = Math.max(1, (lum.slice(0, Math.ceil(lum.length * 0.1)).reduce((a, v) => a + v, 0) / Math.ceil(lum.length * 0.1)));
                        const hiArr = lum.slice(Math.floor(lum.length * 0.9));
                        const hi = hiArr.reduce((a, v) => a + v, 0) / hiArr.length;
                        const mean = lum.reduce((a, v) => a + v, 0) / lum.length;
                        const sd = Math.sqrt(lum.reduce((a, v) => a + (v - mean) * (v - mean), 0) / lum.length);
                        const parts = Object.values(bins).filter(v => v / n >= 0.01).length;
                        out.push({
                            kind, style, px: n, depth: hi / lo, sd, mean,
                            cv: sd / Math.max(1, mean),
                            med: q(0.5), parts,
                            rgb: [rs / n / 255, gs / n / 255, bs / n / 255],
                        });
                        resolve();
                    };
                    im.onerror = () => resolve();
                    im.src = url;
                }));
            }
        }
        await Promise.all(jobs);
        return { out, buildErrs };
    });

    const cells = res.out;
    if (!cells.length) { console.log('FAIL — 굽힌 칸이 0'); process.exit(1); }

    console.log('계열      스타일   cv(대비)  적용전   하한    판정   깊이   휘도SD  평균휘도  파트색군집');
    const fails = [];
    for (const c of cells) {
        const b = BASE[c.kind + '/' + c.style] || [0, 0];
        const ok = c.cv >= b[1];
        if (!ok) fails.push(`${c.kind}/${c.style} 대비 ${c.cv.toFixed(3)} < 기준선 ${b[1]}`);
        console.log(`${c.kind.padEnd(9)} ${c.style.padEnd(6)} ${c.cv.toFixed(3).padStart(8)} ${b[0].toFixed(3).padStart(8)} ${b[1].toFixed(3).padStart(7)}   ${ok ? 'ok  ' : 'FAIL'}  ${c.depth.toFixed(2).padStart(5)}  ${c.sd.toFixed(1).padStart(5)}  ${c.mean.toFixed(1).padStart(6)}    ${c.parts}`);
    }
    // ③ 원시 파트 색 분리
    for (const c of cells.filter(x => x.kind === 'primal')) {
        if (c.parts < PARTS_MIN) fails.push(`primal/${c.style} 파트 색군집 ${c.parts} < ${PARTS_MIN}`);
    }
    // ① 시대 쌍이 '색만 다른' 관계가 아닌지 — 휘도 축에서 갈리는지로 본다
    console.log('\n— 시대 쌍(같은 스타일) · 재질 분리 —');
    for (const style of [...new Set(cells.map(c => c.style))]) {
        const g = cells.filter(c => c.style === style);
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
            const dSD = Math.abs(g[i].sd - g[j].sd), dDep = Math.abs(g[i].depth - g[j].depth), dMean = Math.abs(g[i].mean - g[j].mean);
            const sep = Math.max(dSD / SEP_SD, dDep / SEP_DEPTH, dMean / SEP_MEAN);
            const bad = sep < 1.0;
            if (bad) fails.push(`${g[i].kind}↔${g[j].kind}/${style} 재질분리 ${sep.toFixed(2)} < 1.00 (색 스와프)`);
            if (bad || sep < 1.6) console.log(`  ${bad ? 'FAIL' : 'ok  '} ${g[i].kind}↔${g[j].kind} (${style}) 분리 ${sep.toFixed(2)} · ΔSD ${dSD.toFixed(1)} Δ깊이 ${dDep.toFixed(2)} Δ휘도 ${dMean.toFixed(1)}`);
        }
    }
    if (res.buildErrs.length) console.log('모델 빌드 실패:', res.buildErrs.join(' | '));
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? '\n반려 —\n  ' + fails.join('\n  ') : `\nPASS — 대비 ≥ 회귀 기준선 · 원시 파트색 ≥ ${PARTS_MIN} · 시대 쌍 재질분리 ≥ 1.00`);
    await browser.close();
    process.exit(fails.length || res.buildErrs.length || errors.length ? 1 : 0);
})();
