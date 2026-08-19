// 용암 균열이 **암반에 실재하는 골**인지, 그리고 **굵기 위계**가 있는지 실측 — `map-quality-up` 잔여 결함 ㉯.
// 비평가 A2 #3·A3 #4·B3 #4 가 3라운드 연속으로 "위계 없는 네온 낙서" 라고 지적한 그 항목.
//
// 무엇을 재는가 (전부 **페이지가 실제로 구운 캔버스**의 화소에서 재고, 코드 상수를 베끼지 않는다 — TODO 함정 ④):
//  ⑴ **정합(registration)** — 종전 결함의 몸통. 발광 크랙(emissiveMap)과 지면 알베도·노멀맵이
//     각각 따로 난수를 뽑아 그려서, **빛나는 선이 지나가는 자리에 대응하는 골이 없었다.**
//     그래서 표면에 얹힌 발광 선 = '네온 낙서'로 읽혔다.
//     측정: 균열 중심선 위 표본마다 ⓐ emissive 가 주변보다 밝은가 ⓑ 알베도가 주변보다 어두운가
//     ⓒ 노멀맵 어깨에 기울기가 서는가(골이 파였는가). ⓐ∧ⓑ 와 ⓒ 는 **기준을 나눠** 판정한다
//     (아래 REG_MIN·NRM_MIN 주석 참고 — ⓒ 만 경쟁 신호가 있어 노이즈가 크다).
//     ⚠️ 세 캔버스는 크기가 다르다(알베도·노멀 512, 발광 256). uv(0~1)로 환산해 견줄 것 —
//        픽셀 좌표로 재면 절반이 어긋난 채 '정합 실패'라는 유령 결과가 난다.
//  ⑵ **굵기·밝기 위계** — 주 혈관(depth 0)과 지류(depth 1)의 반치폭·코어 밝기 비.
//     균등하면(비 ≈ 1) 위계가 없는 것이다. 실핏줄(depth 2)은 참고 출력만 한다(아래 주석 참고).
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-lava-crack.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 판정은 둘로 나눈다 — 세 항을 하나로 묶으면 가장 노이즈가 큰 항이 전체를 좌우한다.
//  · REG_MIN: **발광↑ ∧ 알베도↓** — 결함 ㉯ 가 말하는 바로 그것(빛나는 선 자리에 암반의 골이 있는가).
//    두 캔버스 모두 이 균열만 그리므로 경쟁 신호가 없다. 그래서 기준을 높게 잡는다.
//  · NRM_MIN: **노멀맵 골** — 같은 높이맵에 판(plate) 단차와 미세 거칠기(±34)가 함께 들어 있어
//    균열의 기울기 신호가 그것들과 경쟁한다. 균열이 판 경계를 가로지르는 표본은 판 단차가 이긴다.
//    그건 결함이 아니라 정상적인 표면 디테일이므로 기준을 따로, 낮게 둔다.
const REG_MIN = 0.95;
// 🚨 위계 판정은 **주 혈관(depth 0) vs 지류(depth 1)** 로 한다. 실핏줄(depth 2)은 게이트에 넣지 않고
//    참고로만 찍는다 — 재는 쪽의 한계이지 그리는 쪽의 결함이 아니다:
//    실핏줄은 길이가 0.075~0.1 uv 인데 부모의 열기 블리드 반경이 0.03 uv 라, **자기 길이의 상당 부분이
//    부모 halo 안에 있다.** 분기점 근처를 버리면(SKIP) 표본이 0 개가 되고, 안 버리면 부모 값을 재게 된다.
//    어떤 추정기를 써도 안정되지 않아 같은 코드가 0.00~48.16 으로 튀었다(실측, 여러 판).
//    굵기·밝기 배수는 CRACK_W·CRACK_A 로 **구성상 보장**되고, 그게 실제로 렌더된다는 건
//    표본이 충분한 d0 vs d1 에서 확인된다(밝기 비 1.76~2.03 으로 안정).
const WIDTH_MIN = 1.4;   // 주 혈관 반치폭 ÷ 지류 반치폭 하한 (굵기 위계)
const BRIGHT_MIN = 1.5;  // 주 혈관 코어 밝기 ÷ 지류 코어 밝기 하한 (밝기 위계)
const NRM_MIN = 0.80;    // 노멀맵에 골이 잡히는 표본 비율 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene)) break;
        await page.waitForTimeout(200);
    }

    const r = await page.evaluate(() => {
        Scene3D.setChapterTheme(9);          // 용암 바이옴
        const gt = Scene3D.groundTexFor('lava');
        if (!Scene3D.crackTex) Scene3D.crackTex = Scene3D.makeCrackTexture();
        const grab = (img) => {
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            cv.getContext('2d').drawImage(img, 0, 0);
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            // uv(0~1) → 화소. 랩어라운드로 읽어 경계 표본이 잘리지 않게 한다.
            return { w: cv.width, h: cv.height, at: (u, v, ch) => {
                const x = ((Math.round(u * cv.width) % cv.width) + cv.width) % cv.width;
                const y = ((Math.round(v * cv.height) % cv.height) + cv.height) % cv.height;
                return d[(y * cv.width + x) * 4 + (ch || 0)];
            } };
        };
        const EM = grab(Scene3D.crackTex.image);
        const AL = grab(gt.map.image);
        const NR = grab(gt.normal.image);
        const net = Scene3D.crackNetwork();

        // 중심선 표본 — 세그먼트 각 구간을 잘게 나눠 uv 를 뽑는다
        // 🚨 **가지의 시작부는 정의상 부모 안에 있다** — 지류·실핏줄은 부모 위의 한 점에서 갈라져
        //    나오므로, 분기점 근처 표본은 자기 폭이 아니라 **부모의 코어·블리드를 재게 된다.**
        //    (이걸 안 빼면 실핏줄 밝기가 부모 값으로 잡혀 같은 코드가 1.36~3.15 로 튄다 — 실제로 겪었다.)
        //    분기점에서 SKIP uv 안쪽 표본은 버린다. 주 혈관(depth 0)은 부모가 없으므로 전부 쓴다.
        const SKIP = 0.055;
        const samples = { 0: [], 1: [], 2: [] };
        for (const sg of net) {
            const [ox0, oy0] = sg.pts[0];
            for (let p = 1; p < sg.pts.length; p++) {
                for (let t = 0; t < 1; t += 0.2) {
                    const u = sg.pts[p - 1][0] + (sg.pts[p][0] - sg.pts[p - 1][0]) * t;
                    const v = sg.pts[p - 1][1] + (sg.pts[p][1] - sg.pts[p - 1][1]) * t;
                    if (sg.depth > 0 && Math.hypot(u - ox0, v - oy0) < SKIP) continue;
                    // 진행 방향의 법선 — 골을 가로질러 프로파일을 뜬다
                    const dx = sg.pts[p][0] - sg.pts[p - 1][0], dy = sg.pts[p][1] - sg.pts[p - 1][1];
                    const L = Math.hypot(dx, dy) || 1;
                    samples[sg.depth].push({ u, v, nx: -dy / L, ny: dx / L });
                }
            }
        }

        // ⑴ 정합: 중심선 vs 법선 방향으로 충분히 떨어진 '주변'(0.045 uv ≈ 골 바깥)
        const OFF = 0.045;
        let reg = 0, tot = 0, emOK = 0, alOK = 0, nrOK = 0;
        for (const d of [0, 1, 2]) for (const s of samples[d]) {
            const side = (f) => (f(s.u + s.nx * OFF, s.v + s.ny * OFF) + f(s.u - s.nx * OFF, s.v - s.ny * OFF)) / 2;
            const emC = EM.at(s.u, s.v, 0), emS = side((a, b) => EM.at(a, b, 0));
            const alC = AL.at(s.u, s.v, 0), alS = side((a, b) => AL.at(a, b, 0));
            // 🚨 노멀맵은 **중심선에서 재면 안 된다.** 노멀맵은 높이의 미분이라 골 바닥은 평평해서
            //    기울기가 0 에 가깝다 — 골이 제대로 파여 있어도 중심 표본은 '중립'으로 나온다
            //    (첫 판에서 이걸로 74.5% 라는 유령 실패를 봤다). 골의 신호는 **어깨**에 있다.
            //    그래서 어깨(±0.010 uv ≈ 2.5px)와 바깥(±0.045)의 법선 이탈량을 견준다.
            const nrDev = (o) => (Math.abs(NR.at(s.u + s.nx * o, s.v + s.ny * o, 0) - 128)
                + Math.abs(NR.at(s.u + s.nx * o, s.v + s.ny * o, 1) - 128)
                + Math.abs(NR.at(s.u - s.nx * o, s.v - s.ny * o, 0) - 128)
                + Math.abs(NR.at(s.u - s.nx * o, s.v - s.ny * o, 1) - 128)) / 2;
            //    ⚠️ 어깨 위치는 **깊이마다 다르다** — 골 폭이 CRACK_W 배수로 줄기 때문이다.
            //       한 값(0.010)으로 세 깊이를 다 재면 실핏줄은 자기 골 **바깥**을 어깨라고 재게 된다.
            //       배수는 코드에서 **읽어 온다**(손으로 베끼면 코드가 바뀐 뒤 옛 값으로 잰다 — 함정 ④).
            const c = nrDev(0.010 * Scene3D.CRACK_W[d]) > nrDev(OFF);
            const a = emC > emS + 12, b = alC < alS - 8;
            if (a) emOK++; if (b) alOK++; if (c) nrOK++;
            if (a && b) reg++;
            tot++;
        }

        // ⑵ 위계: 깊이별 발광 폭(중심에서 임계 아래로 떨어질 때까지)과 코어 밝기
        const lum = (u, v) => EM.at(u, v, 0) * 0.5 + EM.at(u, v, 1) * 0.35 + EM.at(u, v, 2) * 0.15;
        // 🚨 폭은 **백열 코어**로 잰다. 열기 블리드(임계 12)로 재면 실핏줄은 자기 부모(지류·주 혈관)
        //    바로 옆에 붙어 있어서 **부모의 블리드가 자기 폭으로 잡힌다** — 첫 판에서 실핏줄 폭이
        //    자기 스트로크(7px)의 3배인 22px 로 나온 게 그것이다. 코어는 좁아 이웃 오염이 적다.
        // 🚨 그리고 **중심에서 끊기지 않고 이어지는 구간**만 세야 한다. 스윕 전체에서 임계를 넘는
        //    가장 먼 점을 쓰면, 실핏줄 옆을 지나는 부모의 코어까지 자기 폭에 들어온다
        //    (첫 판에서 실핏줄 코어 폭이 주 혈관보다 넓게 나온 게 그것이다 — 비 0.83).
        //    나아가 **양쪽 반폭 중 좁은 쪽**을 쓴다: 실핏줄은 부모를 마주 본 쪽만 오염되므로
        //    깨끗한 쪽이 자기 폭을 말해 준다. 주 혈관은 좌우가 대칭이라 min 이 곧 실제 반폭이다.
        // 🚨 폭은 **절대 임계가 아니라 반치폭(FWHM)** 으로 잰다. 고정 임계(예: 100)를 쓰면
        //    실핏줄은 애초에 그 밝기에 도달하지 못해 폭이 0 으로 나오고(위계가 제대로 생겼다는 뜻인데도)
        //    비가 0 이나 무한대로 튄다 — 실제로 세 번 중 두 번 그렇게 깨졌다.
        //    표본마다 **자기 중심 밝기의 절반**을 임계로 삼으면 밝기와 무관하게 '그 균열의 굵기'가 나온다.
        const halfRun = (s, sign, thr) => {
            let h = 0;
            for (let k = 1; k <= 40; k++) {
                const o = k * 0.002;
                if (lum(s.u + s.nx * o * sign, s.v + s.ny * o * sign) < thr) break;
                h = o;
            }
            return h;
        };
        const prof = (d) => {
            let wSum = 0, bSum = 0, gSum = 0, n = 0;
            for (const s of samples[d]) {
                const c = lum(s.u, s.v);
                if (c < 20) continue;               // 코어를 못 맞춘 표본은 제외
                const half = c * 0.5;   // 반치폭 임계 — 표본마다 자기 밝기 기준
                wSum += 2 * Math.min(halfRun(s, 1, half), halfRun(s, -1, half));
                gSum += 2 * Math.min(halfRun(s, 1, 12), halfRun(s, -1, 12));
                bSum += c; n++;
            }
            return n ? { w: wSum / n, g: gSum / n, b: bSum / n, n } : { w: 0, g: 0, b: 0, n: 0 };
        };
        return {
            tot, reg, emOK, alOK, nrOK,
            counts: { d0: samples[0].length, d1: samples[1].length, d2: samples[2].length },
            segs: net.length,
            p0: prof(0), p1: prof(1), p2: prof(2),
        };
    });
    await browser.close();

    const regR = r.tot ? r.reg / r.tot : 0;
    const nrmR = r.tot ? r.nrOK / r.tot : 0;
    const wR = r.p1.w > 0 ? r.p0.w / r.p1.w : 0;
    const bR = r.p1.b > 0 ? r.p0.b / r.p1.b : 0;
    const okReg = regR >= REG_MIN, okNrm = nrmR >= NRM_MIN, okW = wR >= WIDTH_MIN, okB = bR >= BRIGHT_MIN;

    console.log('세그먼트 ' + r.segs + '개 · 중심선 표본 ' + r.tot +
        ' (주혈관 ' + r.counts.d0 + ' · 지류 ' + r.counts.d1 + ' · 실핏줄 ' + r.counts.d2 + ')');
    console.log('정합 — 발광↑ ' + (r.emOK / r.tot * 100).toFixed(1) + '% · 알베도↓ ' + (r.alOK / r.tot * 100).toFixed(1) +
        '%  →  둘 다 성립 ' + (regR * 100).toFixed(1) + '% ' + (okReg ? 'ok' : '✗') + ' (기준 ' + (REG_MIN * 100) + '%)');
    console.log('     노멀맵 골(판 단차·거칠기와 경쟁) ' + (nrmR * 100).toFixed(1) + '% ' +
        (okNrm ? 'ok' : '✗') + ' (기준 ' + (NRM_MIN * 100) + '%)');
    console.log('위계 — 반치폭(uv) 주혈관 ' + r.p0.w.toFixed(4) + ' / 지류 ' + r.p1.w.toFixed(4) +
        ' / 실핏줄 ' + r.p2.w.toFixed(4) + '(참고)  →  주/지 ' + wR.toFixed(2) + ' ' + (okW ? 'ok' : '✗') + ' (기준 ' + WIDTH_MIN + ')');
    console.log('     (참고) 블리드 폭 주혈관 ' + r.p0.g.toFixed(4) + ' / 지류 ' + r.p1.g.toFixed(4) +
        ' / 실핏줄 ' + r.p2.g.toFixed(4) + ' — 이웃 블리드가 겹쳐 판정엔 안 쓴다');
    console.log('위계 — 코어 밝기 주혈관 ' + r.p0.b.toFixed(1) + ' / 지류 ' + r.p1.b.toFixed(1) +
        ' / 실핏줄 ' + r.p2.b.toFixed(1) + '(참고, n=' + r.p2.n + ')  →  주/지 ' + bR.toFixed(2) + ' ' + (okB ? 'ok' : '✗') + ' (기준 ' + BRIGHT_MIN + ')');
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(okReg && okNrm && okW && okB
        ? 'PASS — 균열이 암반의 골과 같은 자리에 있고 굵기 위계가 있다'
        : 'FAIL — ' + [!okReg && '정합', !okNrm && '노멀 골', !okW && '폭 위계', !okB && '밝기 위계'].filter(Boolean).join('·') + ' 미달');
})();
