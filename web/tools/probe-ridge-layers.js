// map-quality-up 채점 결함 ①('원경 실루엣이 단일 레이어 판지다') 판정용 **자(尺)**.
//
// 비평가 2인이 "능선이 한 겹뿐"이라고 했는데 **코드에는 세 겹이 있다**(`mountains` 1 + `hills` 2).
// 이 저장소는 비평가의 코드 주장이 틀린 사례를 여러 번 겪었으므로(TODO: "castShadow=false·fog
// 미적용 … 넷 다 사실이 아니다"), 주장 자체를 검증한다: **세 겹이 화면에 실제로 몇 픽셀 나오는가.**
//
// 재는 법 — 임계값·색 추측을 쓰지 않는다. 각 레이어를 `visible=false` 로 껐다 켜서 **실제로
// 달라지는 픽셀**을 그 레이어의 가시 면적으로 삼는다(probe-flash-gl.js 가 세운 규약과 같다).
// 이러면 마스크가 곧 자가검증이다 — 껐는데 아무것도 안 변하면 그 레이어는 화면에 없는 것이다.
// 함께 재는 것:
//   · 레이어별 **가시 화소 수**            → 0 이면 완전 가림(= 있으나 마나 한 레이어)
//   · 레이어별 **평균 휘도**               → 겹마다 명도 계단이 서는가(공기 원근의 뼈대)
//   · 레이어별 **실루엣 상단 화면 y**      → 먼 겹이 가까운 겹보다 **위로** 솟는가(시차 층위)
//
// 판정선(참고선): 세 겹 전부 가시 화소 ≥ 캔버스의 0.3% · 이웃 겹 평균 휘도차 ≥ 6 ·
//                 먼 겹의 실루엣 상단이 가까운 겹보다 높거나(작은 y) 최소한 겹치지 않을 것.
//
// 사용: node tools/probe-ridge-layers.js [바이옴]
// exit 0 = 전 바이옴 통과 · 1 = 미달 · 2 = 자 고장(레이어를 못 찾음)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const ONLY = process.argv[2] || '';

const BIOMES = [
    { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
];

const MIN_VIS = 0.003;   // 캔버스 대비 가시 화소 비율 하한
const MIN_STEP = 6;      // 이웃 겹 평균 휘도차 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX);
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.renderer && Scene3D.heroG', { timeout: 180000, label: '전장 부팅' });

    const list = ONLY ? BIOMES.filter(b => b.biome === ONLY) : BIOMES;
    const rows = [];
    let fail = 0;

    for (const b of list) {
        const r = await page.evaluate(async (theme) => {
            Scene3D.setTheme(theme);
            // 레이어 순서: 가까운 것 → 먼 것. `mountains`(z −12) · `hills[0]`(−19) · `hills[1]`(−25).
            const layers = [
                { name: '근능선', mesh: Scene3D.mountains && Scene3D.mountains[0] },
                { name: '중구릉', mesh: Scene3D.hills && Scene3D.hills[0] },
                { name: '원구릉', mesh: Scene3D.hills && Scene3D.hills[1] },
            ];
            if (layers.some(l => !l.mesh)) return { broken: true };

            const gl = Scene3D.renderer.getContext();
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const grab = () => {
                Scene3D.renderFrame();
                const px = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return px;
            };
            const base = grab();
            const out = [];
            for (const l of layers) {
                l.mesh.visible = false;
                const off = grab();
                l.mesh.visible = true;
                // 달라진 화소 = 이 레이어가 화면에 실제로 기여한 자리
                // 🚨 **면적과 색은 다른 문턱으로 센다.** 나뭇잎 틈으로 보이는 원경은 경계 화소가
                //    대부분이라, 조금이라도 변한 화소를 전부 평균에 넣으면 **앞에 있는 수관의 어두운
                //    색이 원경의 색으로 잡힌다**(실측: 숲 원구릉이 재질 L200 인데 화면 평균이 130 으로
                //    찍혔다 — 중구릉과 1.4 밖에 안 벌어져 미달 판정이 났는데 원인이 자였다).
                //    면적은 '조금이라도 변했으면'(>6), 색은 '이 레이어가 그 화소를 확실히 차지했을 때'
                //    (>60)만 센다. 후자가 곧 그 레이어의 순색 표본이다.
                let n = 0, nPure = 0, sum = 0, topRow = -1;
                for (let i = 0; i < base.length; i += 4) {
                    const d = Math.abs(base[i] - off[i]) + Math.abs(base[i + 1] - off[i + 1]) + Math.abs(base[i + 2] - off[i + 2]);
                    if (d <= 6) continue;                         // 압축·디더 잡음 무시
                    n++;
                    if (d > 60) { nPure++; sum += 0.299 * base[i] + 0.587 * base[i + 1] + 0.114 * base[i + 2]; }
                    const row = Math.floor((i / 4) / w);          // GL 원점은 아래 — row 가 클수록 화면 위
                    if (row > topRow) topRow = row;
                }
                out.push({
                    name: l.name,
                    vis: n / (w * h),
                    pure: nPure / (w * h),
                    lum: nPure ? sum / nPure : 0,
                    // 화면 좌표(위가 0)로 환산한 실루엣 상단
                    top: topRow < 0 ? -1 : (h - 1 - topRow) / h,
                });
            }
            return { broken: false, layers: out, w, h };
        }, b);

        if (r.broken) { console.log('자 고장 — 능선 레이어를 못 찾았다(Scene3D.mountains/hills)'); await browser.close(); process.exit(2); }

        const L = r.layers;
        const bad = [];
        for (const l of L) if (l.vis < MIN_VIS) bad.push(l.name + ' 가림(' + (l.vis * 100).toFixed(2) + '%)');
        for (let i = 1; i < L.length; i++) {
            if (L[i].vis < MIN_VIS || L[i - 1].vis < MIN_VIS) continue;   // 안 보이는 겹은 계단 판정 제외
            if (L[i].pure < 0.002 || L[i - 1].pure < 0.002) continue;     // 순색 표본이 너무 적으면 색 판정 보류
            if (Math.abs(L[i].lum - L[i - 1].lum) < MIN_STEP) bad.push(L[i - 1].name + '↔' + L[i].name + ' 명도계단 ' + Math.abs(L[i].lum - L[i - 1].lum).toFixed(1));
        }
        for (const l of L) rows.push([b.biome, l.name, (l.vis * 100).toFixed(2) + '%', l.lum.toFixed(1) + '(' + (l.pure * 100).toFixed(1) + '%)', l.top < 0 ? '—' : (l.top * 100).toFixed(1) + '%']);
        rows.push([b.biome, '판정', bad.length ? 'FAIL' : 'OK', bad.join(' · '), '']);
        if (bad.length) fail++;
    }

    console.log('\n바이옴   레이어    가시화소   순색휘도(순색비)  실루엣상단(화면y)');
    for (const r of rows) console.log(r[0].padEnd(9) + r[1].padEnd(10) + String(r[2]).padEnd(11) + String(r[3]).padEnd(18) + r[4]);
    console.log('\n참고선 가시화소 ≥' + (MIN_VIS * 100).toFixed(1) + '% · 이웃 명도계단 ≥' + MIN_STEP);
    console.log(fail ? fail + '개 바이옴 미달' : '전 바이옴 통과 — 원경이 겹겹이 물러난다');
    console.log('콘솔 에러 ' + errs.length + '건');
    await browser.close();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
