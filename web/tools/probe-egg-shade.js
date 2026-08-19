// 알 아이콘의 **그늘 반쪽이 정보를 갖고 있는가** — 명도 크러시 판정기 (slug: ui-quality-up 16차)
//
// 왜 필요했나: R8 비평가 2인이 각각 "터미네이터가 없다 / 그늘 쪽 반사광이 없다 / 열 개가 같은
// 도장"으로 알을 지적했는데, 코드에는 4스톱 램프도 초승달 바운스도 접지 그림자도 **이미 있었다**
// (15차가 넣었다). 확대 캡처로 보니 현상은 맞고 원인이 달랐다:
//   · 몸통 그라디언트의 바깥 스톱이 `_shade(base, -0.72)`,
//   · 실루엣 키라인의 색도 `_shade(base, -0.72)` — **같은 값**이다.
//   · 그 위에 `OUTLINE.egg = 0.062` 짜리 순검정 띠가 사후에 둘린다.
// 즉 형태를 만드는 그늘과 실루엣을 긋는 선이 같은 색이라, 그늘 반쪽이 통째로 **테두리로 흡수**된다.
// (POLISH.md 3D 스트림이 잎에서 남긴 '순흑은 다크 엔드가 아니라 정보의 소실' 과 같은 얼굴이다.)
//
// 판정: 알 몸통(테두리 띠를 가로·세로로 침식해 뺀 안쪽)에서
//   ⓐ 크러시 비율 = 명도 ≤ CRUSH(24) 인 몸통 화소 비율 ≤ 1.5%
//   ⓑ 몸통 명도 폭(최대-최소) ≥ 90 — 구(球)의 단서는 명도 폭이다
//   ⓒ 그늘 쪽(우하 사분면) 중앙값 명도 ≥ 34 — 그늘이 '검게 칠한 면'이 아니라 '어두운 면'일 것
// 6등급 색 전부에 대해 잰다(빨강 알만 보고 고치면 파랑·보라에서 다시 깨진다).
//
// 🚨 **1.5% 라는 문턱은 눈대중이 아니라 색깔 사이의 실측 간격**이다. 침식을 바로잡은 뒤 기준선은
//    흰·파랑·초록·노랑이 0.0~0.1% 인데 **빨강 5.4% · 보라 5.5%** 로 50~100배 벌어져 있었다.
//    까닭은 `_shade` 가 **채널별 곱셈**이라, 명도의 72%를 지고 있는 G 채널이 작은 색(빨강 G=28,
//    보라 G=28)만 같은 amt 에서 명도가 무너지기 때문이다 — 즉 크러시는 알의 결함이 아니라
//    **색상 의존 결함**이고, 그래서 6색 전수로 재야 보인다.
//
// 사용: PW_PATH=<playwright> node probe-egg-shade.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CRUSH = 24, MAX_CRUSH = 0.015, MIN_SPAN = 90, MIN_SHADE_MED = 34, MIN_TERM = 60;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof IconGen !== 'undefined' && typeof RARITY_CSS !== 'undefined',
        null, { timeout: 150000 });
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });

    const rows = await page.evaluate(async ({ CRUSH }) => {
        const out = [];
        // 아이콘 원본 해상도(_sizeOf)로 디코드한다 — 타일 표시 크기로 줄이면 리샘플이 명도를
        // 섞어 크러시가 실제보다 옅게 잡힌다(판정기가 제 결함을 못 보는 자리).
        const S = IconGen._sizeOf('egg');
        const trim = Math.round(S * (IconGen._outlineOf('egg') + 0.016) + 1);   // 검정 띠 + 키라인 절반
        for (const [name, tint] of Object.entries(RARITY_CSS)) {
            const url = IconGen.url('egg', { tint });
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = url; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const lum = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            // 1패스 — 행별 불투명 런(알은 볼록해 행마다 런이 하나다)과 실루엣 bbox
            const run = [];
            let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1;
            for (let y = 0; y < c.height; y++) {
                let x0 = -1, x1 = -1;
                for (let x = 0; x < c.width; x++) {
                    if (d[(y * c.width + x) * 4 + 3] > 250) { if (x0 < 0) x0 = x; x1 = x; }
                }
                run[y] = [x0, x1];
                if (x0 < 0) continue;
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
            }
            // 2패스 — 몸통 = 가로로도 **세로로도** 테두리 띠만큼 침식한 안쪽.
            // 🚨 가로만 깎으면 정수리·바닥 행은 검정 띠가 그대로 남아(그 행에서 띠는 **세로로** 두껍다)
            //    어떤 색 알이든 3% 안팎의 가짜 크러시가 깔린다 — 판정기가 제 눈을 가리는 자리였다.
            const body = [], shade = [];
            for (let y = minY + trim; y <= maxY - trim; y++) {
                const [x0, x1] = run[y];
                if (x0 < 0 || x1 - x0 < trim * 2 + 4) continue;
                for (let x = x0 + trim; x <= x1 - trim; x++) body.push({ x, y, L: lum((y * c.width + x) * 4) });
            }
            // 광원이 좌상단이므로 그늘은 우하 사분면, 빛 받는 쪽은 좌상 사분면
            const cxm = (minX + maxX) / 2, cym = (minY + maxY) / 2;
            const lit = [];
            for (const p of body) {
                if (p.x > cxm && p.y > cym) shade.push(p.L);
                if (p.x < cxm && p.y < cym) lit.push(p.L);
            }
            const Ls = body.map(p => p.L);
            const med = a => { const s = a.slice().sort((u, v) => u - v); return s.length ? s[s.length >> 1] : 0; };
            out.push({
                name, tint, n: body.length,
                crush: body.length ? body.filter(p => p.L <= CRUSH).length / body.length : 1,
                min: Math.min(...Ls), max: Math.max(...Ls),
                shadeMed: med(shade), litMed: med(lit),
            });
        }
        return out;
    }, { CRUSH });

    const bad = [];
    console.log(`판정 기준 — 크러시(L≤${CRUSH}) ≤ ${MAX_CRUSH * 100}% · 몸통 명도폭 ≥ ${MIN_SPAN}` +
        ` · 그늘(우하) 중앙값 ≥ ${MIN_SHADE_MED} · 터미네이터(좌상−우하 중앙값) ≥ ${MIN_TERM}\n`);
    console.log('등급        색        몸통화소   크러시    명도 min→max (폭)   빛/그늘 중앙값   터미네이터  판정');
    for (const r of rows) {
        const span = r.max - r.min, term = r.litMed - r.shadeMed;
        const ok = r.crush <= MAX_CRUSH && span >= MIN_SPAN && r.shadeMed >= MIN_SHADE_MED && term >= MIN_TERM;
        console.log(`${r.name.padEnd(11)} ${r.tint.padEnd(9)} ${String(r.n).padStart(6)}  ` +
            `${(r.crush * 100).toFixed(1).padStart(6)}%  ` +
            `${r.min.toFixed(0).padStart(4)}→${r.max.toFixed(0).padStart(4)} (${span.toFixed(0).padStart(3)})   ` +
            `${r.litMed.toFixed(0).padStart(6)}/${r.shadeMed.toFixed(0).padStart(5)}   ` +
            `${term.toFixed(0).padStart(9)}  ${ok ? 'ok' : 'X'}`);
        if (r.crush > MAX_CRUSH) bad.push(`${r.name} 크러시 ${(r.crush * 100).toFixed(1)}%`);
        if (span < MIN_SPAN) bad.push(`${r.name} 명도폭 ${span.toFixed(0)}`);
        if (r.shadeMed < MIN_SHADE_MED) bad.push(`${r.name} 그늘중앙값 ${r.shadeMed.toFixed(0)}`);
        if (term < MIN_TERM) bad.push(`${r.name} 터미네이터 ${term.toFixed(0)}`);
    }
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 6등급 전부 그늘이 정보로 남아 있다');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
