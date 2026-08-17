// 30화면 일괄 밴드 대조 — '전 UI 비율 전수 검증 패스'(TODO ②)의 분류 도구.
// probe-bands.js와 같은 방법으로 원본·클론의 가로 밴드 경계를 잡되, 30쌍을 브라우저 하나로
// 돌면서 "원본의 뚜렷한 경계마다 클론에서 가장 가까운 경계까지 몇 %p 떨어져 있나"를 잰다.
// 어긋난 화면을 먼저 추려내는 용도지 합격 판정 도구가 아니다 — 판정은 화면별 요소 실측 + 비평가 채점.
//
// 주의: 상단바·탭바처럼 두 쪽 모두 뚜렷한 경계는 잘 맞물리지만, 3D 뷰포트 안쪽처럼 원본(플랫 2D)에는
// 없고 클론에만 있는 경계는 '가장 가까운 것'에 엉뚱하게 붙을 수 있다. 그래서 원본 기준 상위 경계만 쓴다.
//
// 사용: node probe-bands-all.js [임계값=60] [상위N=8]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens');
const CLONE = path.join(__dirname, 'ref-cmp/clone');

const PAIRS = [
    ['main', '042120'], ['offline', '042110'], ['league', '042149'], ['league-rewards', '042208'],
    ['league-challenge', '042228'], ['dungeons', '042251'], ['dungeon-detail', '042304'],
    ['skills', '042340'], ['pets', '042356'], ['pets-2', '042445'], ['tech-overview', '042407'],
    ['skill-detail', '042426'], ['pet-detail', '042449'], ['pet-upgrade', '042503'],
    ['summon-rates', '042521'], ['tech-branch', '042546'], ['tech-node', '042605'],
    ['shop', '042632'], ['pass', '042705'], ['profile', '042724'], ['settings', '042744'],
    ['forge-info', '042831'], ['forge-list', '042905'], ['forge-detail', '042931'],
    /* 042950=필터 ON / 043117=필터 OFF — shot-screens.js·compose-ref.js 는 2026-08-17 에 짝을 바로잡았는데
       이 표만 뒤집힌 채 남아 있었다(자동 제련 두 화면의 밴드 점수가 서로 바뀐 채 순위표에 올라갔다). */
    ['autoforge', '043117'], ['autoforge-filter', '042950'], ['craft-compare', '043224'],
    ['gear-detail', '043244'], ['player-info', '043313'], ['chat', '043500'],
];

const boundaries = (page, file, thr) => page.evaluate(async ({ dataUrl, thr }) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const rows = [];
    for (let y = 0; y < c.height; y++) {
        let r = 0, g = 0, b = 0;
        for (let px = 0; px < c.width; px++) { const i = (y * c.width + px) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        rows.push([r / c.width, g / c.width, b / c.width]);
    }
    const marks = [];
    for (let y = 1; y < rows.length; y++) {
        const [a, b2, c2] = rows[y - 1], [e, f, g2] = rows[y];
        const delta = Math.abs(a - e) + Math.abs(b2 - f) + Math.abs(c2 - g2);
        if (delta > thr) marks.push({ y, delta });
    }
    const merged = [];
    for (const m of marks) {
        const last = merged[merged.length - 1];
        if (last && m.y - last.y <= 8) { if (m.delta > last.delta) { last.y = m.y; last.delta = m.delta; } }
        else merged.push({ ...m });
    }
    return merged.map(m => ({ pct: m.y / c.height * 100, delta: m.delta }));
}, { dataUrl: 'data:image/png;base64,' + require('fs').readFileSync(file).toString('base64'), thr });

(async () => {
    const thr = Number(process.argv[2] || 60), topN = Number(process.argv[3] || 8);
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const out = [];
    for (const [name, ref] of PAIRS) {
        const a = path.join(REF, 'shot-' + ref + '.png'), b = path.join(CLONE, name + '.png');
        if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log('skip ' + name); continue; }
        const [ra, rb] = [await boundaries(page, a, thr), await boundaries(page, b, thr)];
        // 원본에서 Δ가 큰 상위 N개 경계만 기준으로 삼는다 (약한 경계는 잡음).
        const strong = [...ra].sort((p, q) => q.delta - p.delta).slice(0, topN);
        const diffs = strong.map(s => {
            let best = Infinity, at = null;
            for (const t of rb) { const d = Math.abs(t.pct - s.pct); if (d < best) { best = d; at = t.pct; } }
            return { ref: s.pct, clone: at, gap: best };
        }).sort((p, q) => q.gap - p.gap);
        const max = diffs[0]?.gap ?? Infinity;
        const mean = diffs.reduce((s, d) => s + d.gap, 0) / (diffs.length || 1);
        out.push({ name, max, mean, worst: diffs.slice(0, 3), nRef: ra.length, nClone: rb.length });
    }
    await browser.close();

    out.sort((p, q) => q.max - p.max);
    console.log('화면              최대Δ%p  평균Δ%p  가장 어긋난 경계(원본%→클론%)');
    for (const r of out) {
        const w = r.worst.map(d => `${d.ref.toFixed(1)}→${d.clone == null ? '없음' : d.clone.toFixed(1)}(${d.gap.toFixed(1)})`).join('  ');
        console.log(`${r.name.padEnd(17)} ${r.max.toFixed(2).padStart(6)}  ${r.mean.toFixed(2).padStart(6)}   ${w}`);
    }
    const bad = out.filter(r => r.max > 2);
    console.log(`\n최대Δ > 2%p 화면: ${bad.length}/${out.length} — ${bad.map(b => b.name).join(', ') || '없음'}`);
})();
