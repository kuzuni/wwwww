// 스킬 아이콘 18종이 **실사용 크기에서 서로 갈리는가**를 쌍마다 재서 가장 헷갈리는 짝을 뽑는다.
//
// 왜 이 자를 만들었나: 3차 재채점에서 비평가 2인이 **독립으로 같은 짝**을 찍었다 —
// "`slash`(연속 참격) ↔ `ring`(회오리 베기) 가 14~20px 에서 같은 흰 얼룩"(A#11 · B#5).
// 그런데 이 항목은 '비평가가 눈으로 짚은 것이 실측에서 기각된' 이력이 길다(젬·코인 평면성,
// 밝은 프레임 대비, 장착 오브 딤 — 전부 근거를 대고 기각됐다). **눈으로 갈리는 주장은 화소로
// 갈라야** 한다. 게다가 쌍은 18C2 = 153 개인데 사람은 눈에 띈 몇 쌍만 본다 — 진짜 최악의 짝이
// 비평가가 짚은 짝이라는 보장이 없다. 전수로 재는 게 맞다.
//
// 판정축 — **실루엣 IoU**:
//   ① 각 아이콘을 실제 파이프라인(`IconGen.url` — 슈퍼샘플링·아웃라인까지 거친 것)으로 굽고
//      **실표시 크기 38px** 프레임에 그린다. 축소 뒤의 화소가 곧 사용자가 보는 것이다.
//   ② 알파 > 0.45 를 잉크로 본다(글로우·그림자의 옅은 알파는 실루엣이 아니다).
//   ③ 두 마스크의 교집합/합집합 = IoU. **프레임을 정규화하지 않는다** — 크기·위치 차이도
//      사용자에겐 구별 단서이므로, 그걸 지우면 실제보다 비관적인 수치가 나온다.
//
// 🚨 이 자가 재는 것은 '실루엣이 겹치나'이지 '의미가 헷갈리나'가 아니다. IoU 가 낮아도 둘 다
//    '흰 얼룩 몇 개'면 사람은 헷갈릴 수 있다. 그래서 판정은 **상대 순위**로 읽을 것 —
//    "이 짝이 18종 중 최악인가"는 답하지만 "절대적으로 나쁜가"는 답하지 않는다.
//
// 사용: node probe-skill-icon-distinct.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const PX = 38;          // 스킬 오브 글리프 실측 표시 크기
/* 🚨 **작은 쪽도 같이 잰다 — 비평가가 헷갈린다고 한 크기는 38px 이 아니라 14~20px 이다
      (2026-08-20 UI 스트림, 락 `icon-gen`).**
   이 자는 처음부터 38px 하나만 봤는데, 이 지적의 원문은 "**14~20px 에서** 같은 흰 얼룩"이었다.
   실측하면 두 크기의 순위가 실제로 갈린다 — 20px 에서만 상위로 올라오는 쌍이 있다
   (연속 참격↔응급 처치 · 낙뢰↔신의 창). 축소가 한 칸 더 들어가면 가는 부재가 먼저 뭉개져
   **'가늘어서 갈리던' 조형이 먼저 무너지기** 때문이다. 한쪽만 보면 그 무리를 통째로 놓친다. */
const PX2 = 20;         // 재화 pill·작은 버튼 속 스킬 아이콘 실측 크기(비평가 지적의 크기)
const TOP = 12;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 200; i++) {
        if (await page.evaluate(() => typeof IconGen !== 'undefined' && typeof SKILL_DEFS !== 'undefined').catch(() => false)) break;
        await page.waitForTimeout(100);
    }

    const measure = async (a) => {
        const ids = SKILL_DEFS.map(d => d.id);
        const masks = {}, areas = {};
        for (const id of ids) {
            const u = IconGen.url('sk_' + id);
            if (!u) return { fatal: `sk_${id} 아이콘이 비어 있다` };
            const img = new Image();
            await new Promise(r => { img.onload = r; img.onerror = r; img.src = u; });
            const cv = document.createElement('canvas');
            cv.width = cv.height = a.PX;
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(img, 0, 0, a.PX, a.PX);
            const D = g.getImageData(0, 0, a.PX, a.PX).data;
            const m = new Uint8Array(a.PX * a.PX);
            let n = 0;
            for (let i = 0; i < m.length; i++) { if (D[i * 4 + 3] > 115) { m[i] = 1; n++; } }
            masks[id] = Array.from(m); areas[id] = n;
        }
        const pairs = [];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
            const A = masks[ids[i]], B = masks[ids[j]];
            let inter = 0, uni = 0;
            for (let k = 0; k < A.length; k++) { const p = A[k], q = B[k]; if (p & q) inter++; if (p | q) uni++; }
            pairs.push({ a: ids[i], b: ids[j], iou: uni ? inter / uni : 0 });
        }
        pairs.sort((p, q) => q.iou - p.iou);
        return { pairs, areas, ids, total: pairs.length };
    };
    const res = await page.evaluate(measure, { PX });
    const res2 = await page.evaluate(measure, { PX: PX2 });

    await browser.close();
    if (res.fatal) { console.error('🚨', res.fatal); process.exit(2); }
    if (res2.fatal) { console.error('🚨', res2.fatal); process.exit(2); }

    const name = {};
    // 이름은 순전히 사람이 읽으라고 붙인다(판정에 안 쓴다).
    const KO = { powerStrike: '연속 참격', whirlwind: '회오리 베기', firstAid: '응급 처치', fireball: '화염구', pierceShot: '화살 세례', warCry: '전투의 함성', meteor: '메테오', lightning: '낙뢰', blessing: '축복', dragonBreath: '용의 아가리', execution: '처형', sanctuary: '성역', supernova: '초신성', voidLance: '공허의 창', timeWarp: '시간 왜곡', apocalypse: '종말의 화룡', godspear: '신의 창', divineShield: '신성한 가호' };
    for (const id of res.ids) name[id] = KO[id] || id;

    console.log(`실표시 ${PX}px · 쌍 ${res.total}개 전수 · 잉크 = 알파 > 0.45\n`);
    console.log(`상위 ${TOP}쌍 (실루엣 IoU 높은 순 = 겹치는 순):`);
    res.pairs.slice(0, TOP).forEach((p, i) => {
        console.log(`  ${String(i + 1).padStart(2)}. IoU ${p.iou.toFixed(3)}  ${name[p.a]}(${p.a}) ↔ ${name[p.b]}(${p.b})`);
    });

    const target = res.pairs.find(p => (p.a === 'powerStrike' && p.b === 'whirlwind') || (p.a === 'whirlwind' && p.b === 'powerStrike'));
    const rank = res.pairs.indexOf(target) + 1;
    console.log(`\n■ 비평가 2인이 지목한 짝 — 연속 참격(slashx) ↔ 회오리 베기(whirl)`);
    console.log(`   IoU ${target.iou.toFixed(3)} · 153쌍 중 **${rank}위**`);
    const median = res.pairs[Math.floor(res.pairs.length / 2)].iou;
    console.log(`   (전체 중앙값 ${median.toFixed(3)} · 최고 ${res.pairs[0].iou.toFixed(3)})`);

    /* 🚨 **분포 3줄 — 조형을 고친 전후는 반드시 이걸로 볼 것 (2026-08-20 UI 스트림, 락 `icon-gen`).**
       상위 12쌍만 보면 **한 쌍을 떼고 다른 쌍을 만드는 맞바꿈**이 개선으로 보인다. 실제로 이 세션이
       두 번 밟았다: ⓐ 성역을 줄였더니 최악값이 0.673 → **0.682 로 올랐고**(작은 쪽이 큰 쪽에 통째로
       들어가면 IoU 는 되레 오른다) ⓑ 모래시계 판을 넓혀 신의 창과의 .630 을 .53 대로 떨어뜨렸더니
       **넓은 위/아래 띠**가 돼서 용의 아가리와 새로 .662 가 났다. 둘 다 상위 12쌍 목록에서는
       '한 줄이 사라지고 한 줄이 생긴' 것처럼만 보인다.
       📌 그래서 판단 기준은 **최악값 + `≥0.60` 개수 + `≥0.55` 개수 세 개를 함께**. 셋이 같이
          내려가야 진짜로 갈린 것이다(이 세션 실측: 0.673/10/25 → 0.640/3/21). */
    const dist = (r) => ({ worst: r.pairs[0].iou, n60: r.pairs.filter(p => p.iou >= .60).length, n55: r.pairs.filter(p => p.iou >= .55).length });
    const hubsOf = (r) => {
        const hub = {};
        r.pairs.filter(p => p.iou >= .55).forEach(p => { hub[p.a] = (hub[p.a] || 0) + 1; hub[p.b] = (hub[p.b] || 0) + 1; });
        return Object.entries(hub).sort((a, b) => b[1] - a[1]).slice(0, 5);
    };
    for (const [px, r] of [[PX, res], [PX2, res2]]) {
        const d = dist(r), h = hubsOf(r);
        console.log(`   분포 ${String(px).padStart(2)}px: 최악 ${d.worst.toFixed(3)} · IoU ≥0.60 인 쌍 ${d.n60}개 · ≥0.55 ${d.n55}개 (낮을수록 갈린다)`);
        if (h.length) console.log(`     허브: ${h.map(([k, v]) => `${name[k]} ${v}`).join(' · ')}`);
    }
    // 20px 에서만 상위로 올라오는 쌍 — 축소 한 칸에 먼저 무너지는 조형이 여기 잡힌다.
    const rank38 = new Map(res.pairs.map((p, i) => [p.a + '|' + p.b, i]));
    const only20 = res2.pairs.slice(0, TOP).filter(p => (rank38.get(p.a + '|' + p.b) ?? 999) >= TOP);
    if (only20.length) {
        console.log(`\n■ ${PX2}px 에서만 상위 ${TOP} 에 드는 쌍(38px 순위 밖) — 축소에 먼저 무너지는 조형:`);
        only20.forEach(p => console.log(`   IoU ${p.iou.toFixed(3)}  ${name[p.a]} ↔ ${name[p.b]}  (38px 에선 ${(rank38.get(p.a + '|' + p.b) ?? 0) + 1}위)`));
    }

    console.log(`\n잉크 면적(${PX}px 프레임 ${PX * PX}화소 중):`);
    res.ids.forEach(id => process.stdout.write(`  ${name[id]} ${res.areas[id]}`));
    console.log(`\n\n콘솔 에러 ${errs.length}건`, errs.slice(0, 3));

    // 판정: 지목된 짝이 상위 3위 안에 들면 '비평가 지적이 실측으로 확인됨'.
    const ok = rank > 3;
    console.log(ok
        ? `\n지목된 짝은 최악권이 아니다(${rank}위) — 이 지적만 좇지 말고 위 상위 쌍을 먼저 볼 것.`
        : `\n지목된 짝이 실측에서도 최악권(${rank}위)이다 — 비평가 지적 확인됨.`);
    process.exit(errs.length ? 1 : 0);
})();
