// skill-fx ㉯('Combat.tryCast 의 shake 가 시전 시각에 울린다 — 2박(타격)으로 옮겨야 한다') 실측/검증.
// 시전(cast)과 피해(impact)는 이 게임에서 시각이 다르다: skillEffect 는 CAST_MS(130~220ms) 뒤에
// 폭발을 깔고, Combat 은 pending 으로 0.2~0.25초에 피해를 넣는다. 셰이크가 cast 프레임에 울리면
// 카메라 흔들림이 타격보다 한참 앞서 '버튼→흔들림'으로 분리돼 읽힌다.
//
// 재는 것: 스킬을 발동한 뒤 매 프레임 `Scene3D.shakeMag`(카메라 셰이크 세기)를 훑어 **셰이크가
//   최고조에 달하는 시각**을 찾는다. 그 시각이 피해 시각(0.2~0.25초) 근처면 통과, cast(≈0)면 실패.
// ⚠️ shakeMag 는 매 프레임 감쇠하므로, '셰이크가 생긴(0→양수) 첫 시각'을 본다(피크는 감쇠 탓에
//    항상 생성 직후다). cast 셰이크가 남아 있으면 t=0 근처에서 먼저 솟는다.
//
// 사용: node tools/probe-skill-shake-timing.js [skillId]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SKILL = process.argv[2] || '';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined' && typeof Skills !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    const out = await page.evaluate((skillId) => {
        // 연출 시간은 Scene3D.update 로 손으로 흘리되, **Combat.pending 도 같은 dt 로 함께 돌려야**
        // 피해·셰이크 pending 이 발화한다. Combat.tick 은 걷기·자동공격까지 돌려 방해되므로,
        // pending 만 직접 태우는 얇은 러너를 만든다.
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        Combat.tick = () => { };
        Scene3D.anims.length = 0;

        // pending 을 dt 로 진행시키는 미니 러너(Combat.update 의 pending 처리와 같은 규칙)
        const stepPending = (dt) => {
            for (let i = Combat.pending.length - 1; i >= 0; i--) {
                const p = Combat.pending[i];
                p.t -= dt;
                if (p.t <= 0) { try { p.fn(); } catch (e) { } Combat.pending.splice(i, 1); }
            }
        };
        const step = (sec) => {
            // ⚠️ pending 시계는 **정확히 sec 만큼** 흘려야 한다. 예전엔 substep 을 round(sec*120)=1 로
            //    잡고 stepPending(1/120) 을 1번만 불러, 12ms 요청에 pending 은 8.3ms 만 흘러 aoe 셰이크
            //    (250ms)가 캡처 창(360ms) 밖으로 밀렸다(가짜 미달). pending 은 한 번에 sec, 렌더 update 만
            //    substep 으로 나눈다.
            const n = Math.max(1, Math.round(sec * 120));
            for (let i = 0; i < n; i++) realUpdate(sec / n);
            stepPending(sec);
        };

        // 발동할 스킬: 인자 없으면 대표 aoe(회오리)·single(강타) 둘 다 잰다. SKILL_DEFS 에서 직접 고른다.
        const defs = (typeof SKILL_DEFS !== 'undefined') ? SKILL_DEFS : [];
        const firstOf = (type) => { const d = defs.find(x => x.type === type); return d ? d.id : null; };
        const jobs = skillId ? [skillId] : [firstOf('single'), firstOf('aoe')].filter(Boolean);

        const runOne = (id) => {
            const d = Skills.def(id);
            Combat.pending.length = 0;
            Scene3D.shakeMag = 0;
            Combat.cooldowns[id] = 0;
            if (typeof S !== 'undefined' && S.skills) S.skills[id] = S.skills[id] || { lv: 1 };  // 장착 안 됐으면 강제 장착(발동 조건)
            // aoe 는 `e.x < 3.2` 근접 적만 대상이라, 걷기(Combat.tick)를 끈 정적 프로브에선 적이
            // 스폰 거리(x≈4+)에 서 있어 대상이 0 이 된다. 살아 있는 적을 사거리 안으로 당겨 둔다.
            Combat.enemies.filter(e => e.alive).forEach(e => { if (e.x >= 3.2) e.x = 2.0; });
            const ok = Combat.tryCast(id, true);
            const castShake = Scene3D.shakeMag;   // cast 직후 세기(예전 코드면 여기서 이미 큼)
            const rows = [];
            let firstRiseT = null, prev = Scene3D.shakeMag, peak = Scene3D.shakeMag, peakT = 0;
            for (let t = 0; t <= 360; t += 12) {
                const s = Scene3D.shakeMag;
                if (firstRiseT === null && s > prev + 0.03 && t > 0) firstRiseT = t;
                if (s > peak) { peak = s; peakT = t; }
                rows.push({ t, s: +s.toFixed(3) });
                prev = s;
                step(0.012);
            }
            return { id, name: d.name, type: d.type, ok, castShake: +castShake.toFixed(3), firstRiseT, peak: +peak.toFixed(3), peakT, rows };
        };
        return { results: jobs.map(runOne) };
    }, SKILL);

    const pad = (v, n) => String(v).padStart(n);
    for (const r of out.results) {
        console.log('\n== 스킬 셰이크 타이밍: %s (%s, type=%s, 발동 ok=%s) ==', r.name, r.id, r.type, r.ok);
        console.log('  cast 직후 셰이크 세기 = %s  (예전 코드면 여기서 이미 0.22~0.35 — 시전에 울린 것)', r.castShake);
        console.log('  셰이크가 처음 솟은 시각 = %sms · 최고조 시각 = %sms (세기 %s)', r.firstRiseT === null ? '—' : r.firstRiseT, r.peakT, r.peak);
        // 요약 스파크라인
        const line = r.rows.filter((_, i) => i % 2 === 0).map(x => '▁▂▃▄▅▆▇█'[Math.min(7, Math.round(x.s / (r.peak || 1) * 7))]).join('');
        console.log('  0ms %s 360ms', line);
        const castClean = r.castShake < 0.05;
        const impactTimed = r.peakT >= 150 && r.peakT <= 300;
        console.log('  판정: cast 프레임 셰이크 없음 %s · 최고조가 타격 구간(150~300ms) %s → %s',
            castClean ? '✅' : '❌(' + r.castShake + ')', impactTimed ? '✅' : '❌(' + r.peakT + 'ms)',
            (castClean && impactTimed) ? '통과 — 셰이크가 2박(타격)으로 옮겨졌다' : '미달');
    }
    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
