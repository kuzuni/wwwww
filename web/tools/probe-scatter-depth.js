// 지면 스캐터의 **화면 밀도 위계**와 **군집성**을 실측 — `map-quality-up` 잔여 결함 ㉮.
// 3라운드 비평가 2인이 공통 1~2위로 지목: "지면이 단색 카펫 + 균일 난수 산포. 근경>중경>원경
// 밀도 역전 + 군집(clump) 스캐터가 필요".
//
// 무엇을 재는가 (둘 다 **씬에 실제로 만들어진 인스턴스 행렬**에서 재고, 코드 상수를 베끼지 않는다 — TODO 함정 ④):
//  ⑴ **화면 밀도 위계**: 인스턴스를 실제 `Scene3D.camera` 로 투영해 **지평선~화면바닥**을 3띠로 나눠 센다.
//     띠는 화면상 같은 높이·같은 폭이라 개수가 곧 화면 밀도다.
//     ⚠️ 띠 경계를 화면 전체(ndc −1..+1)로 잡으면 안 된다 — 위쪽은 하늘이라 늘 0 이고 비가 무의미해진다.
//     그래서 지평선 ndc.y 를 **카메라에서 수평 광선을 실제로 투영해** 구한다(코드 상수 베끼기 금지).
//     균일 월드 난수는 화면 밀도가 거리²에 비례해 **원경이 훨씬 빽빽**해진다(= 자갈밭 인상).
//     원신급 구도는 그 반대다 — 근경이 크고 촘촘하고 원경은 물러나 비어야 깊이가 산다.
//     판정: 근경띠 ÷ 원경띠 = `near/far`. 1 미만이면 **역전**(종전 결함).
//  ⑵ **군집성(Clark–Evans R)**: 월드 XZ 최근접이웃 평균거리 ÷ 같은 밀도 푸아송의 기대거리.
//     R≈1 = 기계적 난수 산포, R<1 = 뭉쳐 있음(자연스러운 덤불), R>1 = 격자처럼 고름.
//     ⚠️ **주 스캐터 한 층만** 잰다 — z 밴드가 다른 세 층을 섞으면 층 사이 간격이 가짜 군집으로 잡힌다.
//     판정: CE_LO < R < CE_HI 여야 '난수 뿌리기'를 벗어나되 몇 덩어리로만 뭉치지 않은 것으로 본다.
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-scatter-depth.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CHAPTERS = [1, 2, 3, 5, 7, 9];   // 초원·사막·바위산·밤숲·마법·용암
const NEAR_MID_MIN = 1.20;  // 근경띠/중경띠 하한 — 근경이 중경보다 확실히 촘촘해야 한다
                            // (실측 종전값 0.44~1.00 = 역전. '하단 40% 빈 지면'의 정체다)
const MID_FAR_MIN = 1.00;   // 중경띠/원경띠 하한 — 위계가 단조 감소여야 한다.
                            // ⚠️ 원경띠가 0 이면 비가 무한대라 '통과'로 읽힌다 — 그건 위계가 아니라
                            //    **원경에 스캐터가 아예 없는 것**(종전 전 챕터 0개)이므로 따로 막는다.
const FAR_MIN = 180;        // 원경띠 최소 개수(3빌드 × 13자리 패닝 합산) — 이 아래는 맨 지면 카펫
const CE_HI = 0.88;         // Clark–Evans R 상한 — 이 아래여야 뭉침이 눈에 띈다
const CE_LO = 0.45;         // 하한 — 이 아래는 몇 덩어리로만 뭉쳐 사이가 텅 빈다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.scatter)) break;
        await page.waitForTimeout(200);
    }

    const rows = [];
    for (const ch of CHAPTERS) {
        const r = await page.evaluate((chapter) => {
            // 🚨 스캐터 배치는 매 빌드마다 새로 뽑는 난수라 **한 번만 재면 표본 노이즈가 판정을 뒤집는다**
            //    (실측: 같은 코드에서 원경띠가 39~85 로, 근/중 이 0.83~1.48 로 흔들렸다).
            //    그래서 챕터마다 씬을 REBUILDS 번 다시 지어 합산·평균한다 — 튜닝이 노이즈를 쫓지 않게.
            const REBUILDS = 3;
            const band = [0, 0, 0];      // 0=근경(화면 아래) … 2=원경(지평선 쪽)
            let total = 0, vis = 0, Rsum = 0, Rn = 0, nnSum = 0, expSum = 0;
            for (let rep = 0; rep < REBUILDS; rep++) {
                const one = (() => {
            Scene3D.setChapterTheme(chapter);
            const cam = Scene3D.camera;
            Scene3D.scene.updateMatrixWorld(true);
            cam.updateMatrixWorld(true);
            cam.updateProjectionMatrix();

            // 지평선 ndc.y — 카메라 시선의 수평 성분만 남긴 방향의 아주 먼 점을 투영
            const dir = new THREE.Vector3();
            cam.getWorldDirection(dir);
            const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
            hp.project(cam);
            const yHor = Math.min(1, hp.y);

            const m = new THREE.Matrix4(), v = new THREE.Vector3();
            const band = [0, 0, 0];      // 0=근경(화면 아래) … 2=원경(지평선 쪽)
            let total = 0, vis = 0;
            const main = [];             // 주 스캐터 층의 월드 XZ (군집 측정용, 이 빌드 몫)
            // 인스턴스 월드 좌표를 한 번만 뽑아 둔다
            const pos = [];
            for (const key of ['scatter', 'scatter3', 'scatter2']) {
                const im = Scene3D[key];
                if (!im) continue;
                for (let i = 0; i < im.count; i++) {
                    im.getMatrixAt(i, m);
                    m.premultiply(im.matrixWorld);
                    v.setFromMatrixPosition(m);
                    if (key === 'scatter') main.push([v.x, v.z]);
                    pos.push([v.x, v.y, v.z]);
                    total++;
                }
            }
            // 🚨 카메라 한 자리에서만 세면 표본이 30~100개라 군집 배치에서는 **덩어리가 시야에
            //    들었는지 운**이 값을 지배한다(같은 코드가 챕터마다 0.16~2.07 로 튀었다).
            //    카메라는 `worldX` 로 x 를 훑고 지면은 주기 30 으로 순환하므로, **한 주기 전체를
            //    13자리로 패닝하며 합산**해야 실제로 플레이어가 보는 평균 밀도가 된다.
            const PANS = 13, PERIOD = 30;
            const baseX = 0.15;
            for (let s = 0; s < PANS; s++) {
                const dx = -PERIOD / 2 + PERIOD * s / PANS;
                cam.position.x = baseX + dx;
                cam.lookAt(baseX + dx, 0.9, 0);
                cam.updateMatrixWorld(true);
                for (const p of pos) {
                    v.set(p[0], p[1], p[2]).project(cam);
                    if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > yHor || v.z > 1) continue;
                    vis++;
                    // 화면바닥(ndc.y −1) ~ 지평선(yHor) 을 3등분. t=0 이 바닥(근경), t=1 이 지평선(원경).
                    const t = (v.y + 1) / (yHor + 1);
                    band[Math.max(0, Math.min(2, Math.floor(t * 3)))] += 1;
                }
            }
            cam.position.x = baseX; cam.lookAt(baseX, 0.9, 0); cam.updateMatrixWorld(true);

            // Clark–Evans (주 스캐터 층만)
            let R = null, nn = null, exp = null;
            if (main.length > 30) {
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (const p of main) {
                    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
                    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
                }
                const area = Math.max(1e-6, (maxX - minX) * (maxZ - minZ));
                let sum = 0;
                for (let i = 0; i < main.length; i++) {
                    let best = Infinity;
                    for (let j = 0; j < main.length; j++) {
                        if (i === j) continue;
                        const dx = main[i][0] - main[j][0], dz = main[i][1] - main[j][1];
                        const d2 = dx * dx + dz * dz;
                        if (d2 < best) best = d2;
                    }
                    sum += Math.sqrt(best);
                }
                nn = sum / main.length;
                exp = 0.5 / Math.sqrt(main.length / area);
                R = nn / exp;
            }
                    return { total, vis, band, R, nn, exp, yHor };
                })();
                total = one.total; vis += one.vis;
                for (let b = 0; b < 3; b++) band[b] += one.band[b];
                if (one.R !== null) { Rsum += one.R; nnSum += one.nn; expSum += one.exp; Rn++; }
            }
            return {
                total, vis, band,
                R: Rn ? Rsum / Rn : null, nn: Rn ? nnSum / Rn : null, exp: Rn ? expSum / Rn : null,
                rebuilds: REBUILDS,
            };
        }, ch);
        rows.push({ ch, ...r });
    }
    await browser.close();

    let fail = 0;
    const rat = (a, b) => b > 0 ? a / b : (a > 0 ? Infinity : 0);
    console.log('ch |  총   보임 | 근경 중경 원경 | 근/중  중/원 |  CE R  (nn/기대)');
    for (const r of rows) {
        const nm = rat(r.band[0], r.band[1]), mf = rat(r.band[1], r.band[2]);
        const okH = nm >= NEAR_MID_MIN && mf >= MID_FAR_MIN && r.band[2] >= FAR_MIN;
        const okCE = r.R !== null && r.R < CE_HI && r.R > CE_LO;
        if (!okH || !okCE) fail++;
        const f = v => (isFinite(v) ? v.toFixed(2) : ' inf').padStart(5);
        console.log(
            String(r.ch).padStart(2) + ' | ' + String(r.total).padStart(4) + ' ' + String(r.vis).padStart(4) + ' | ' +
            r.band.map(b => String(b).padStart(4)).join(' ') + ' | ' +
            f(nm) + ' ' + f(mf) + (okH ? ' ok ' : ' ✗  ') + '| ' +
            (r.R === null ? '  n/a ' : r.R.toFixed(3)) + (okCE ? ' ok' : ' ✗ ') +
            (r.nn === null ? '' : '  (' + r.nn.toFixed(3) + '/' + r.exp.toFixed(3) + ')')
        );
    }
    console.log('기준: 근/중 ≥ ' + NEAR_MID_MIN + ' · 중/원 ≥ ' + MID_FAR_MIN + ' · 원경띠 ≥ ' + FAR_MIN +
        '개 (단조 감소 위계) · ' + CE_LO + ' < CE R < ' + CE_HI + ' (군집)');
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(fail === 0 ? 'PASS — 전 챕터 밀도 위계·군집 통과' : 'FAIL — ' + fail + '/' + rows.length + ' 챕터 미달');
})();
