// 딤(어둡게 덮는 레이어) 강도 역산 — 팝업이 뒤 화면을 얼마나 어둡게 덮는지를 **눈대중이 아니라
// 원본 두 장의 같은 요소 색 비교**로 구한다(league-rewards 교정에서 신설).
//
// 왜 필요한가: 원본 스크린샷에는 알파값이 안 적혀 있다. 그런데 같은 화면을 '딤 없이' 찍은 컷과
// '딤이 걸린' 컷이 둘 다 있으면, 같은 요소의 색이 얼마나 어두워졌는지로 α 를 바로 뽑을 수 있다.
// 순검정 위 곱이면  B = A * (1 - α)  →  α = 1 - B/A.
// 밝은 소스(회색 밴드·빨간 버튼)와 어두운 소스(시트 배경)가 **같은 α 로 떨어지면** 순검정 딤이고,
// 갈리면 검정이 아닌 색(또는 blur 등 다른 효과)이 섞인 것이다.
//
// 사용: PW_PATH=... node probe-dim.js <딤없는.png> <딤걸린.png>
//   예: node probe-dim.js ../ref/screens/shot-042149.png ../ref/screens/shot-042208.png
//       → α 추정 중앙값 0.903 (league-rewards 실측: 시트 14,17,27→1,2,3 · 밴드 175→17 · ◀ 255,16,23→25,2,2)
//
// ⚠️ 두 원본의 픽셀 크기가 다를 수 있다(042149 는 498×896, 042208 은 502×890) — 그래서 좌표를
//    비율(%)로 잡고, **평평한 큰 면**에서만 샘플한다. 글자·아이콘 경계에서 재면 AA 때문에 튄다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

const [plain, dimmed] = process.argv.slice(2);
if (!plain || !dimmed) { console.error('사용: node probe-dim.js <딤없는.png> <딤걸린.png>'); process.exit(2); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body style="margin:0">');
    const out = await page.evaluate(async ([a, b]) => {
        const load = async src => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            return { W: c.width, H: c.height, D: g.getImageData(0, 0, c.width, c.height).data };
        };
        const A = await load(a), B = await load(b);
        const at = (I, x, y) => { const i = (y * I.W + x) * 4; return [I.D[i], I.D[i + 1], I.D[i + 2]]; };
        const L = [`딤없음 ${A.W}×${A.H} · 딤 ${B.W}×${B.H}`];
        // 평평한 면만 쓴다: 3×3 이웃이 모두 같은 색인 지점만 샘플
        const flat = (I, x, y) => {
            const p = at(I, x, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const q = at(I, x + dx, y + dy);
                if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) > 6) return null;
            }
            return p;
        };
        const est = [];
        for (let yf = 0.02; yf < 0.98; yf += 0.01) for (let xf = 0.04; xf < 0.97; xf += 0.03) {
            const pa = flat(A, Math.round(A.W * xf), Math.round(A.H * yf));
            const pb = flat(B, Math.round(B.W * xf), Math.round(B.H * yf));
            if (!pa || !pb) continue;
            for (let k = 0; k < 3; k++) if (pa[k] >= 24 && pb[k] <= pa[k]) est.push({ a: pa[k], b: pb[k], v: 1 - pb[k] / pa[k] });
        }
        if (!est.length) return L.concat('샘플 없음 — 두 이미지에 공통된 평평한 면이 없다').join('\n');
        // 🚨 중앙값 하나로 뽑으면 안 된다 — 두 컷은 **같은 %좌표라도 내용이 다른 영역**이 있다:
        //    팝업 카드가 덮은 자리, 딤이 안 걸리는 크롬(탭바) 등. 그런 표본은 α 0 이나 1 로 몰린다.
        //    그래서 0.02 폭 히스토그램으로 **덩어리(클러스터)** 를 뽑고, 가장 큰 덩어리를 딤으로 본다.
        const bin = new Map();
        for (const e of est) { const k = Math.round(e.v / 0.02); bin.set(k, (bin.get(k) || 0) + 1); }
        const cl = [...bin.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
            .map(([k, n]) => ({ a: k * 0.02, n }));
        L.push(`샘플 ${est.length}개 · α 덩어리(큰 것부터):`);
        for (const c of cl) L.push(`  α ≈ ${c.a.toFixed(2)}  n=${c.n} (${(c.n / est.length * 100).toFixed(1)}%)`);
        const main = cl[0];
        const near = est.filter(e => Math.abs(e.v - main.a) < 0.03);
        const avg = near.reduce((s, e) => s + e.v, 0) / near.length;
        L.push(`→ 딤 추정 **α = ${avg.toFixed(3)}** (가장 큰 덩어리 ${near.length}표본 평균)`);
        // 그 덩어리 안에서 밝기대별로 갈리는지 본다 — 갈리면 순검정이 아니다
        for (const [lo, hi, nm] of [[24, 80, '어두운 면'], [80, 180, '중간 면'], [180, 256, '밝은 면']]) {
            const s = near.filter(e => e.a >= lo && e.a < hi).map(e => e.v).sort((u, v) => u - v);
            if (s.length) L.push(`   ${nm}(원본 ${lo}~${hi - 1}): n=${s.length} 중앙값 ${s[Math.floor(s.length / 2)].toFixed(3)}`);
        }
        L.push(`   세 밴드가 서로 붙으면 순검정 딤 · 갈리면 검정 아닌 색이 섞인 것.`);
        L.push(`⚠️ α 0 근처 덩어리는 '딤이 안 걸린 영역'(탭바 등)이거나 '팝업이 덮은 자리'다 — 결함이 아니다.`);
        L.push(`⚠️ 최종 확정은 이 분포가 아니라 **아는 요소 몇 개**(시트 배경·회색 밴드·빨간 버튼)의 색을`);
        L.push(`   직접 대조해 교차검증할 것. league-rewards 는 그렇게 0.903/0.902/0.902 로 확인했다.`);
        return L.join('\n');
    }, [b64(path.resolve(plain)), b64(path.resolve(dimmed))]);
    console.log(out);
    await browser.close();
})();
