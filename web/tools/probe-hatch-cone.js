// 부화기 빛기둥(콘)의 **세로 범위** 판정기 — 원본 PNG 와 클론 캡처를 같은 술어·같은 임계로 잰다.
//
// 왜 새로 만드나: `probe-pets2-dom` 은 콘의 **폭·중심·피치**만 재고 **세로 길이는 안 봤다**.
// 2026-08-19 R4 채점에서 비평가 A 가 '콘이 세로로 +3.75%p 길다'고 짚었고 B 는 정합으로 봤다 —
// 이 판정기는 그 축을 못 박아 둔다.
//
// 🚨 **임계 하나로 부호가 뒤집힌다 — 이 판정기의 존재 이유다.** 행 안의 warm 화소를 `n>=3` 처럼
//    느슨하게 세면 **부화 타이머 흰 글자의 안티에일리어싱**(그리고 콘의 흐린 꼬리)이 같이 잡혀
//    클론 콘이 y603~704(11.43%H)로 **원본보다 +3.49%p 길게** 나온다. 실제로 A 의 수치가 그 값이다.
//    행 폭의 25%(최소 8px) 이상을 요구하면 클론은 y603~658(6.28%H)로, **원본 7.94/7.99%H 보다
//    오히려 −1.66%p 짧다**(게이트 안). 콘 자체가 아니라 **글자를 같이 센 것**이었다.
//    → 느슨한 임계로 잰 '콘이 길다'는 지적은 이 수치로 기각한다.
// 🚨 전구 글로우(`ui-quality-up` 이 넣은 box-shadow)는 **원인이 아니다** — 글로우를 `none` 으로
//    두고 다시 찍어도 콘 범위가 한 픽셀도 안 변했다(실측). 두 항목의 충돌로 오해하지 말 것.
//
// 재는 것: 콘 3개의 **세로 범위 상단·하단·높이**(%H). 폭·중심·피치는 `probe-pets2-dom` 소관이다.
//
// ⚠️ 클론 캡처(`tools/ref-cmp/clone/pets.png`)를 읽는다 — `node tools/shot-screens.js` 로 먼저 갱신할 것.
// 🚨 자기검증: 두 그림 다 콘이 **정확히 3개** 잡히고 세 콘의 세로 범위가 서로 같아야 한다.
//    아니면 수치를 인쇄하지 않고 exit 2(측정기 고장)로 끊는다.
//
// 사용: node tools/probe-hatch-cone.js            (원본 042356)
//       REF=042445 node tools/probe-hatch-cone.js (다른 컷으로 교차검증)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_ID = process.env.REF || '042356';
const REF_PNG = path.resolve(__dirname, `../ref/screens/shot-${REF_ID}.png`);
const CLONE_PNG = path.resolve(__dirname, 'ref-cmp/clone/pets.png');
const TOL = 2.0;

const SCAN = function (src) {
    return new Promise(async (resolve) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        // `probe-pets2-dom` 과 **같은** warm 술어를 쓴다(자를 갈라놓지 않으려고).
        const warm = p => p[0] > 105 && p[1] > 105 && p[1] - p[2] > 45;

        const y0 = Math.floor(H * 0.58), y1 = Math.floor(H * 0.88);
        const colN = new Array(W).fill(0);
        for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (warm(at(x, y))) colN[x]++;
        const cols = []; let cs = -1;
        for (let x = 0; x <= W; x++) {
            const on = x < W && colN[x] > 0;
            if (on && cs < 0) cs = x;
            if (!on && cs >= 0) { if (x - cs >= 10) cols.push([cs, x - 1]); cs = -1; }
        }
        const cones = cols.map(([a, b]) => {
            const need = Math.max(8, (b - a + 1) * 0.25);   // ← 이 임계가 부호를 가른다(머리말 참조)
            let t = 1e9, bt = -1;
            for (let y = y0; y <= y1; y++) {
                let n = 0;
                for (let x = a; x <= b; x++) if (warm(at(x, y))) n++;
                if (n >= need) { if (y < t) t = y; if (y > bt) bt = y; }
            }
            return bt < 0 ? null : { x1: a, x2: b, top: t, bot: bt };
        }).filter(Boolean);
        resolve({ W, H, cones });
    });
};

(async () => {
    for (const f of [REF_PNG, CLONE_PNG]) if (!fs.existsSync(f)) { console.log(`그림이 없다: ${f}`); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const d64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const ref = await page.evaluate(SCAN, d64(REF_PNG));
    const clone = await page.evaluate(SCAN, d64(CLONE_PNG));
    await browser.close();

    const broken = [];
    for (const [tag, s] of [['원본', ref], ['클론', clone]]) {
        if (s.cones.length !== 3) { broken.push(`${tag} 콘이 ${s.cones.length}개다(3개라야 한다)`); continue; }
        const tops = new Set(s.cones.map(c => c.top)), bots = new Set(s.cones.map(c => c.bot));
        if (tops.size !== 1 || bots.size !== 1) broken.push(`${tag} 콘 3개의 세로 범위가 서로 다르다(${[...tops]} / ${[...bots]})`);
    }
    if (broken.length) {
        console.log(`측정기 고장(BROKEN) — 수치를 인쇄하지 않는다:\n  · ${broken.join('\n  · ')}`);
        process.exit(2);
    }

    const one = s => { const c = s.cones[0]; return { top: c.top / s.H * 100, bot: c.bot / s.H * 100, h: (c.bot - c.top + 1) / s.H * 100 }; };
    const R = one(ref), C = one(clone);
    console.log(`원본 ${REF_ID} ${ref.W}x${ref.H} · 콘 y${ref.cones[0].top}~${ref.cones[0].bot}`);
    console.log(`클론 pets ${clone.W}x${clone.H} · 콘 y${clone.cones[0].top}~${clone.cones[0].bot}`);
    let over = 0, max = 0;
    for (const [name, a, b] of [['콘 상단', R.top, C.top], ['콘 하단', R.bot, C.bot], ['콘 높이', R.h, C.h]]) {
        const dd = b - a;
        if (Math.abs(dd) > Math.abs(max)) max = dd;
        const bad = Math.abs(dd) > TOL;
        if (bad) over++;
        console.log(`  ${bad ? '✗' : '·'} ${name.padEnd(8)} 원본 ${a.toFixed(2)}  클론 ${b.toFixed(2)}  Δ${dd >= 0 ? '+' : ''}${dd.toFixed(2)}%p${bad ? '  ← ±2%p 초과' : ''}`);
    }
    console.log(`\n판정: ${over === 0 ? '통과' : '불통과'} — 초과 ${over}건 · 최대 편차 ${max >= 0 ? '+' : ''}${max.toFixed(2)}%p`);
    process.exit(over === 0 ? 0 : 1);
})();
