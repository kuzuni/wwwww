// 🧊 큐브 시험판 **파츠 맞물림 판정기** (`mount-species-recognizable`, 3D 스트림 2026-08-20).
//
// 왜 이게 따로 필요한가: 재채점에서 비평가가 짚은 결함 두 개가 **캡처로는 잘 안 보이고 코드로는
// 안 드러나는** 종류였다 —
//   ⓐ **z-fighting**: "다리 윗칸과 등딱지 밑층이 **같은 칸을 두 파츠가 채운다**." 화면에서는
//      각도가 맞을 때만 점선 얼룩으로 보여서, 캡처 한 장으로는 있는지 없는지 못 정한다.
//   ⓑ **떠 있는 부품**: 파츠가 다른 어떤 파츠와도 안 닿으면 사람은 '부서진 모델'로 읽는다.
// 둘 다 **칸 단위로 세면 끝나는 문제**다(복셀의 이점이 이것이다) — 그래서 눈이 아니라 수를 쓴다.
//
// 재는 법: `makeMountVoxelPilot` 이 만든 **최상위 파츠(피벗)** 마다 월드 bbox 를 내고
//   ⑴ **겹침** — 두 파츠의 bbox 가 실제 부피로 겹치면 z-fighting 후보다. 칸 크기(VS)의
//      절반보다 얇은 겹침은 부동소수 오차로 보고 버린다.
//   ⑵ **접촉** — 어떤 파츠와도 bbox 가 안 겹치고 **면으로 닿지도 않으면**(간격 > 칸 크기의 반)
//      따로 노는 조각이다.
// ⚠️ **bbox 는 조형이 아니라 상자다.** 오목한 파츠(등자 고리·뱃대끈 링)는 bbox 가 실제보다
//    크게 잡혀 **겹침을 과보고**한다 — 그래서 아래 EXEMPT 에 적힌 파츠 쌍은 제외한다.
//    (같은 이유로 `probe-mount-detached` 도 등자를 제외한다. 그 판정기의 판단을 그대로 따른다.)
// ⚠️ 이 시험판은 **게임 경로에 안 물려 있다** — 라이브 조형은 `probe-ride-clear` 등 기존 셋이 잰다.
//
// 사용: node probe-voxel-pilot-fit.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

// 고리·끈처럼 속이 빈 부품은 bbox 가 실제보다 크다 — 이 이름이 낀 쌍의 겹침은 세지 않는다.
const HOLLOW = ['stirrup', 'girth', 'rein'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.makeMountVoxelPilot && typeof Voxel !== "undefined"');

    const out = await page.evaluate((HOLLOW) => {
        const VS = 0.04;                     // 시험판 칸 크기(규약 ⑴)
        const g = Scene3D.makeMountVoxelPilot('Turtle', 'epic');
        // 파츠 이름 — userData 로 되짚어 사람이 읽을 수 있게 붙인다(피벗 자체엔 이름이 없다).
        const nameOf = new Map();
        (g.userData.legs || []).forEach((p, i) => nameOf.set(p, 'leg' + i));
        (g.userData.stirrups || []).forEach((p, i) => nameOf.set(p, 'stirrup' + i));
        (g.userData.reins || []).forEach((p, i) => nameOf.set(p, 'rein' + i));
        if (g.userData.head) nameOf.set(g.userData.head, 'head');
        if (g.userData.tail) nameOf.set(g.userData.tail, 'tail');

        const parts = [];
        g.children.forEach((c, i) => {
            const b = new THREE.Box3().setFromObject(c);
            if (!isFinite(b.min.x)) return;
            parts.push({ name: nameOf.get(c) || ('part' + i), b: b });
        });
        // 이름이 안 붙은 몸통·안장·뱃대끈을 순서로 식별한다(빌더가 넣는 순서 그대로다).
        const unnamed = parts.filter(p => /^part/.test(p.name));
        ['shell', 'seat', 'girth'].forEach((n, i) => { if (unnamed[i]) unnamed[i].name = n; });

        const EPS = VS * 0.5;
        const overlaps = [], detached = [];
        for (let i = 0; i < parts.length; i++) {
            let touches = 0;
            for (let j = 0; j < parts.length; j++) {
                if (i === j) continue;
                const a = parts[i].b, c = parts[j].b;
                // 축별 겹침 길이(음수면 떨어진 거리)
                const ox = Math.min(a.max.x, c.max.x) - Math.max(a.min.x, c.min.x);
                const oy = Math.min(a.max.y, c.max.y) - Math.max(a.min.y, c.min.y);
                const oz = Math.min(a.max.z, c.max.z) - Math.max(a.min.z, c.min.z);
                const gap = Math.min(ox, oy, oz);
                if (gap > EPS) {
                    const hollow = HOLLOW.some(h => parts[i].name.indexOf(h) === 0 || parts[j].name.indexOf(h) === 0);
                    if (j > i && !hollow) overlaps.push({
                        a: parts[i].name, b: parts[j].name,
                        d: [ox, oy, oz].map(v => +(v / VS).toFixed(2)),   // 칸 단위 겹침
                    });
                    touches++;
                } else if (gap > -EPS) touches++;      // 면으로 닿는다
            }
            if (!touches) detached.push(parts[i].name);
        }
        // 🧊 **치비 비례 실측** — 채점이 세 판 연속 막혀 있는 축이 이것인데(3·4점), 지금까지
        //    "머리가 작다/크다"가 전부 눈대중이었다. 수로 남긴다: 세션마다 같은 자를 대야
        //    '키웠다'가 진짜 키운 건지 알 수 있다. ⚠️ **여기에 게이트를 걸지 말 것** — 이 파일이
        //    실루엣 IoU 에서 이미 겪었다(지표는 PASS 인데 사람 점수는 제자리). 수는 참고값이다.
        const px = (n) => parts.find(p => p.name === n);
        const dim = (b) => ({ w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z });
        const hd = px('head'), sh = px('shell');
        const chibi = (hd && sh) ? {
            headW: +(dim(hd.b).w / VS).toFixed(1), bodyW: +(dim(sh.b).w / VS).toFixed(1),
            ratio: +(dim(hd.b).w / dim(sh.b).w).toFixed(2),
            // 머리가 등딱지보다 얼마나 솟았나(칸) — '큰 머리'를 폭이 아니라 높이로 만드는 축이다.
            headAbove: +((hd.b.max.y - sh.b.max.y) / VS).toFixed(1),
            legH: px('leg0') ? +(dim(px('leg0').b).h / VS).toFixed(1) : null,
            totalH: +(Math.max(...parts.map(p => p.b.max.y)) / VS).toFixed(1),
        } : null;
        return { n: parts.length, names: parts.map(p => p.name), overlaps: overlaps, detached: detached, chibi: chibi };
    }, HOLLOW);

    await browser.close();
    const bad = out.overlaps.length + out.detached.length;
    console.log(`시험판 파츠 ${out.n}개 — ${out.names.join(' ')}`);
    console.log(`  겹침(z-fighting 후보) ${out.overlaps.length}건 · 따로 노는 조각 ${out.detached.length}건 · 콘솔 에러 ${errors.length}건`);
    if (out.chibi) console.log(`  치비 비례(참고값·게이트 아님): 머리폭 ${out.chibi.headW}칸 / 몸폭 ${out.chibi.bodyW}칸`
        + ` = ${out.chibi.ratio} · 머리가 등딱지 위로 ${out.chibi.headAbove}칸 · 다리 ${out.chibi.legH}칸 / 전체 ${out.chibi.totalH}칸`);
    out.overlaps.forEach(o => console.log(`  ! 겹침 ${o.a} ↔ ${o.b} — 칸 단위 ${o.d.join(' × ')}`));
    out.detached.forEach(d => console.log(`  ! 따로 논다: ${d}`));
    errors.slice(0, 4).forEach(e => console.log('  ! ' + String(e).slice(0, 200)));
    console.log(bad === 0 && !errors.length ? '  → PASS' : '  → FAIL');
    process.exit(bad === 0 && !errors.length ? 0 : 1);
})();
