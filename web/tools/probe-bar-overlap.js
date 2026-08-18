// 근접 교전에서 **적 HP바가 영웅 머리/영웅 바를 덮는가** — 사용: node tools/probe-bar-overlap.js
// (종료코드 0 = 통과)
//
// 배경: 6차 채점 잔여 중 "적 바가 영웅 머리 위에 겹친다". 미검증 지적이라 **먼저 재고** 수치가
// 말하는 대로 처리한다. 겹침은 소유자 오독(누구 체력인지)으로 직결돼 타격감 이전에 가독성 문제다.
//
// 재는 법: 실제 교전 거리를 만들고(적을 영웅 앞 사거리에 세운다), 영웅 바·적 바·영웅 머리의
// **화면 사각형**을 project() 로 뽑아 겹침 면적을 잰다. 픽셀을 읽지 않는 이유는 바가 반투명이라
// 색으로는 소유자를 못 가르기 때문 — 여기서 필요한 건 '어느 사각형이 어디를 덮나'다.
//
// 판정:
//   ① 적 바 ↔ 영웅 바: 겹침 0 (같은 높이에 나란히 뜨면 두 소유자의 체력이 한 덩어리로 읽힌다)
//   ② 적 바 ↔ 영웅 머리: 겹침이 영웅 머리 면적의 20% 미만
// ⚠️ 초기 로드 대기를 45초로 잡는다 — 이 저장소는 병렬 세션이 여러 개 돌아 머신이 붐빌 때가 많고,
// 소프트 렌더(swiftshader) 부팅이 20초를 넘겨 **멀쩡한 코드가 TimeoutError 로 반려**되는 일이 잦다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const HEAD_OVERLAP_MAX = 0.20;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(() => {
        const out = { rows: [], lines: [] };
        Combat.tick = () => {};
        Scene3D.update = () => {};
        const rect = (obj) => {
            const box = new THREE.Box3().setFromObject(obj);
            if (!isFinite(box.min.x)) return null;
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, area: (x1 - x0) * (y1 - y0) };
        };
        const inter = (a, b) => {
            if (!a || !b) return 0;
            const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            return (w > 0 && h > 0) ? w * h : 0;
        };
        // 영웅 머리 — 리그의 head 본이 있으면 그 주변, 없으면 영웅 상단 1/4 을 머리로 본다
        const heroBox = new THREE.Box3().setFromObject(Scene3D.heroG);
        const headBox = heroBox.clone();
        headBox.min.y = heroBox.max.y - (heroBox.max.y - heroBox.min.y) * 0.25;
        const headObj = new THREE.Object3D(); // rect() 재사용용 더미 대신 직접 계산
        const rectOfBox = (box) => {
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
                pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
            let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
            return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, area: (x1 - x0) * (y1 - y0) };
        };
        const headR = rectOfBox(headBox);
        const heroBarR = Scene3D.heroHpG ? rect(Scene3D.heroHpG) : null;

        // 교전 거리 — **대열 맨 앞자리(Combat.MELEE_X)** 가 실제로 적이 멈추는 곳이다.
        // ⚠️ '사거리'(atkRange 1.3)를 쓰면 안 된다 — 그건 때리기 시작하는 거리지 정지 위치가 아니고,
        //    실제 정지 지점보다 멀어서 **겹침을 과소평가**한다(영웅 -1.35 ↔ 앞자리 -0.5 = 0.85유닛).
        //    상수를 하드코딩하지 말고 Combat 에서 읽는다(대열 파라미터가 바뀌면 같이 따라가게).
        const reach = Combat.MELEE_X - Combat.HERO_X;
        // 보스도 같이 본다 — 덩치가 크고 바가 더 높이 뜬다(barY 에 isBoss 분기가 있다).
        const targets = Combat.enemies.slice(0, 3).map(e => ({ e, boss: false }));
        const bossE = Combat.enemies.find(x => x.isBoss);
        if (bossE) targets.push({ e: bossE, boss: true });
        for (const { e, boss } of targets) {
            const m = Scene3D.enemyMap.get(e.id);
            if (!m || !m.hpG) continue;
            // 영웅 바로 앞(사거리)에 세운다 — 전열 적이 실제로 서는 자리
            m.g.position.x = Scene3D.heroG.position.x + reach;
            m.hpG.position.set(m.g.position.x, m.g.position.y, m.g.position.z);
            m.g.updateWorldMatrix(true, true); m.hpG.updateWorldMatrix(true, true);
            const barR = rect(m.hpG);
            out.rows.push({
                kind: m.kind + (boss ? '(보스)' : ''),
                headOverlap: headR.area > 0 ? inter(barR, headR) / headR.area : 0,
                barOverlap: heroBarR ? inter(barR, heroBarR) : 0,
                bar: barR ? `${Math.round(barR.x0)},${Math.round(barR.y0)} ${Math.round(barR.w)}×${Math.round(barR.h)}` : '없음',
            });
        }
        out.head = `${Math.round(headR.x0)},${Math.round(headR.y0)} ${Math.round(headR.w)}×${Math.round(headR.h)}`;
        out.heroBar = heroBarR ? `${Math.round(heroBarR.x0)},${Math.round(heroBarR.y0)} ${Math.round(heroBarR.w)}×${Math.round(heroBarR.h)}` : '없음';
        out.reach = reach;
        return out;
    });

    const lines = [`  영웅 머리 사각형 ${r.head} · 영웅 바 ${r.heroBar} · 교전 사거리 ${r.reach}`];
    let bad = 0;
    for (const row of r.rows) {
        const okHead = row.headOverlap < HEAD_OVERLAP_MAX;
        const okBar = row.barOverlap === 0;
        if (!okHead || !okBar) bad++;
        lines.push(`${okHead && okBar ? 'PASS' : 'FAIL'} ${row.kind}: 적 바 ${row.bar} · 영웅 머리 덮음 `
            + `${(row.headOverlap * 100).toFixed(1)}% (< ${HEAD_OVERLAP_MAX * 100}%) · 영웅 바 겹침 ${Math.round(row.barOverlap)}px²`);
    }
    if (!r.rows.length) { lines.push('FAIL 측정할 적이 없다'); bad++; }
    lines.push((errors.length === 0 ? 'PASS' : 'FAIL') + ` 콘솔 에러 ${errors.length}건`);
    console.log(lines.join('\n'));
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    const ok = bad === 0 && !errors.length;
    console.log(ok ? '\n전체 통과' : `\n실패 ${bad + (errors.length ? 1 : 0)}건`);
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
