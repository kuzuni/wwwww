// X75 대량 소환의 뽑기 확률이 "뽑기마다" 제대로 적용되는지 검증 (slug: summon-x75-rate-verify)
//
// 사용자 지적: "X75 소환할 때 레벨업이 될 수밖에 없는데, 뽑기 확률 뽑기마다 제대로 되는 거 맞나?"
// 즉 배치 소환 75연차에서 소환 레벨이 도중에 오르는데, 75장 전부가 **배치 시작 시점의 확률표 하나로
// 고정 추첨**되고 있으면 버그다. 여기서 그걸 두 가지 방법으로 확정한다.
//
//   [구조 검사] U.weightedPick 을 감싸 배치 도중 실제로 넘어온 확률표를 draw 단위로 기록하고,
//              i번째 draw 의 확률표가 "그 시점 카운터로 계산한 레벨의 확률표"와 일치하는지 전수 대조.
//              (기대 확률표는 게임 코드의 rates() 를 그대로 호출해 만든다 — 재구현하지 않는다)
//   [분포 검사] 같은 시작 카운터에서 X75 배치를 여러 번 돌려 등급 빈도를 모으고,
//              ⑴ draw별 모형(정상: 75개 draw 의 확률표 평균) ⑵ 고정 모형(버그: 시작 레벨 확률표)
//              두 가설의 z-score 를 비교. 정상 구현이면 ⑴은 통과하고 ⑵는 크게 기각돼야 한다.
//              (⑵가 기각되지 않으면 검사 자체에 힘이 없다는 뜻이라 그것도 FAIL 로 잡는다)
//
// 스킬·펫·탈것 3개 소환 라인 전부 같은 기준으로 본다.
// 사용: node tools/probe-summon-x75-rates.js [배치수]   (기본 400배치 = 라인당 30,000 draw, exit 0=PASS 2=FAIL)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const BATCHES = parseInt(process.argv[2], 10) || 400;
const N = 75;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Mounts !== "undefined"', { label: '스크립트 로드' });

    const report = await page.evaluate(({ BATCHES, N }) => {
        const RAR = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];
        const isRateTable = o => { const k = Object.keys(o); return k.length && k.every(x => RAR.includes(x)); };

        // ── 추첨과 무관한 부수효과 제거(속도) — RNG 경로는 건드리지 않는다 ──
        const origSave = window.saveGame, origSfx = SFX.gacha, origPick = U.weightedPick;
        const origRecalc = Combat.recalcHero, origRefresh = (typeof Scene3D !== 'undefined' && Scene3D.refreshMount);
        window.saveGame = () => { }; SFX.gacha = () => { }; Combat.recalcHero = () => { };
        if (typeof Scene3D !== 'undefined') Scene3D.refreshMount = () => { };
        // 기술트리 '추가 소환' 보너스는 draw 수를 흔들어 대조를 흐린다 — 0 으로 고정(기본 세이브도 0)
        const origEgg = TechTree.extraEggChance, origMount = TechTree.extraMountChance;
        TechTree.extraEggChance = () => 0; TechTree.extraMountChance = () => 0;

        let rec = null;                       // 구조 검사용 draw 기록
        U.weightedPick = function (obj) { if (rec && isRateTable(obj)) rec.push({ ...obj }); return origPick.call(U, obj); };

        // 소환 라인 3종 — reset: 배치 시작 상태 만들기 / expectedAt: i번째 draw 가 써야 할 확률표
        const LINES = [
            {
                key: 'skill', label: '스킬 소환', c0: 100,
                reset() { S.summonCount = this.c0; S.tickets = 1e9; S.gems = 1e9; S.skills = {}; S.equippedSkills = []; },
                run() { return Skills.summon(false, N).results.map(r => r.def.rarity); },
                expectedAt(i) { const k = S.summonCount; S.summonCount = this.c0 + i + 1; const r = Skills.rates(); S.summonCount = k; return r; },
                levelAt(i) { const k = S.summonCount; S.summonCount = this.c0 + i + 1; const l = Skills.summonLevel(); S.summonCount = k; return l; },
            },
            {
                key: 'pet', label: '펫(알) 소환', c0: 100,
                reset() { S.petSummonCount = this.c0; S.eggCurrency = 1e9; S.eggs = []; },
                run() { return Pets.summon(N).results.filter(r => !r.extra).map(r => r.rarity); },
                expectedAt(i) { const k = S.petSummonCount; S.petSummonCount = this.c0 + i + 1; const r = Pets.rates(); S.petSummonCount = k; return r; },
                levelAt(i) { const k = S.petSummonCount; S.petSummonCount = this.c0 + i + 1; const l = Pets.summonLevel(); S.petSummonCount = k; return l; },
            },
            {
                key: 'mount', label: '탈것 소환', c0: 0,
                reset() { S.mountOpens = this.c0; S.winders = 1e9; S.mounts = {}; S.activeMount = null; },
                run() { return Mounts.summon(N).results.map(r => r.rarity); },
                expectedAt(i) { const k = S.mountOpens; S.mountOpens = this.c0 + i + 1; const r = Mounts.rates(); S.mountOpens = k; return r; },
                levelAt(i) { const k = S.mountOpens; S.mountOpens = this.c0 + i + 1; const l = Mounts.level(); S.mountOpens = k; return l; },
            },
        ];

        const norm = o => { const t = RAR.reduce((s, k) => s + (o[k] || 0), 0); const out = {}; RAR.forEach(k => out[k] = (o[k] || 0) / t); return out; };
        const out = [];

        for (const L of LINES) {
            const res = { label: L.label, c0: L.c0, fails: [] };

            // ── 기대 확률표(게임 코드 rates() 직접 호출) + 레벨 궤적 ──
            L.reset();
            const expTables = [], levels = [];
            for (let i = 0; i < N; i++) { expTables.push(norm(L.expectedAt(i))); levels.push(L.levelAt(i)); }
            res.levelSpan = `Lv ${levels[0]} → ${levels[N - 1]} (배치 중 ${new Set(levels).size}개 레벨)`;
            if (new Set(levels).size < 2) res.fails.push('배치 도중 소환 레벨이 전혀 오르지 않는 시작점이라 검사가 무의미하다 — c0 를 조정할 것');

            // ── [구조 검사] 배치 1회를 기록해 draw별 확률표 전수 대조 ──
            L.reset(); rec = [];
            L.run();
            const seen = rec; rec = null;
            res.drawsRecorded = seen.length;
            if (seen.length !== N) res.fails.push(`draw 기록 ${seen.length}건 (기대 ${N}건)`);
            let mismatch = 0, firstBad = null;
            for (let i = 0; i < Math.min(seen.length, N); i++) {
                const got = norm(seen[i]), want = expTables[i];
                const d = RAR.reduce((m, k) => Math.max(m, Math.abs(got[k] - want[k])), 0);
                if (d > 1e-9) { mismatch++; if (firstBad === null) firstBad = { i, got, want }; }
            }
            res.structMismatch = mismatch;
            if (mismatch) res.fails.push(`draw별 확률표 불일치 ${mismatch}/${N}건 (첫 불일치 draw #${firstBad.i + 1})`);
            // 확률표가 배치 도중 실제로 "바뀌었는지"도 확인 — 전부 같으면 고정 추첨이다
            const distinct = new Set(seen.map(o => JSON.stringify(norm(o)))).size;
            res.distinctTables = distinct;
            if (distinct < 2) res.fails.push(`배치 75장이 확률표 1개로만 추첨됨 — 고정 추첨(버그)`);

            // ── [분포 검사] 같은 시작점에서 배치 반복 ──
            const obs = {}; RAR.forEach(k => obs[k] = 0);
            let total = 0;
            for (let b = 0; b < BATCHES; b++) {
                L.reset();
                for (const r of L.run()) { obs[r]++; total++; }
            }
            res.total = total;
            const pDraw = {}, pFix = normFix(expTables[0]);
            RAR.forEach(k => pDraw[k] = expTables.reduce((s, t) => s + t[k], 0) / N);
            function normFix(t) { const o = {}; RAR.forEach(k => o[k] = t[k]); return o; }
            const z = (p) => {
                let max = 0, worst = null;
                for (const k of RAR) {
                    const e = total * p[k];
                    if (e < 5 && obs[k] < 5) continue;                       // 기대·관측 모두 희박한 등급은 z 가 무의미
                    const sd = Math.sqrt(total * p[k] * (1 - p[k]));
                    // p 가 0 또는 1 인 등급(sd=0)에서 관측이 어긋나면 그 가설은 확률 0 의 사건 — 무한대로 본다
                    const zz = sd === 0 ? (obs[k] === Math.round(e) ? 0 : Infinity) : Math.abs(obs[k] - e) / sd;
                    if (zz > max) { max = zz; worst = { k, obs: obs[k], exp: +e.toFixed(1), z: Number.isFinite(zz) ? +zz.toFixed(2) : '∞' }; }
                }
                return { max: Number.isFinite(max) ? +max.toFixed(2) : '∞(확률 0인 등급이 실제로 나옴)', raw: max, worst };
            };
            res.obs = RAR.filter(k => obs[k]).map(k => `${k} ${obs[k]} (${(obs[k] / total * 100).toFixed(3)}%)`).join(' | ');
            res.zDraw = z(pDraw); res.zFix = z(pFix);
            res.pDraw = RAR.filter(k => pDraw[k] > 0).map(k => `${k} ${(pDraw[k] * 100).toFixed(3)}%`).join(' | ');
            res.pFix = RAR.filter(k => pFix[k] > 0).map(k => `${k} ${(pFix[k] * 100).toFixed(3)}%`).join(' | ');
            if (res.zDraw.raw > 4) res.fails.push(`draw별 모형과 관측이 어긋남 (max|z|=${res.zDraw.max} @ ${res.zDraw.worst.k})`);
            if (res.zFix.raw < 6) res.fails.push(`고정 모형이 기각되지 않음 (max|z|=${res.zFix.max}) — 두 가설이 구분 안 되는 시작점이라 검사에 힘이 없다`);
            out.push(res);
        }

        // 원복
        U.weightedPick = origPick; window.saveGame = origSave; SFX.gacha = origSfx; Combat.recalcHero = origRecalc;
        if (typeof Scene3D !== 'undefined' && origRefresh) Scene3D.refreshMount = origRefresh;
        TechTree.extraEggChance = origEgg; TechTree.extraMountChance = origMount;
        return out;
    }, { BATCHES, N });

    let fail = 0;
    console.log(`X75 소환 확률 검증 — 라인당 ${BATCHES}배치 × ${N}연차\n`);
    for (const r of report) {
        console.log(`■ ${r.label}  (시작 카운터 ${r.c0}, ${r.levelSpan})`);
        console.log(`  [구조] draw 기록 ${r.drawsRecorded}/${N} · 확률표 불일치 ${r.structMismatch}건 · 배치 중 등장한 서로 다른 확률표 ${r.distinctTables}개`);
        console.log(`  [분포] 관측 ${r.total} draw: ${r.obs}`);
        console.log(`         draw별 기대: ${r.pDraw}`);
        console.log(`         → max|z| ${r.zDraw.max}` + (r.zDraw.worst ? ` (${r.zDraw.worst.k} 관측 ${r.zDraw.worst.obs} vs 기대 ${r.zDraw.worst.exp})` : ''));
        console.log(`         고정(버그) 기대: ${r.pFix}`);
        console.log(`         → max|z| ${r.zFix.max}` + (r.zFix.worst ? ` (${r.zFix.worst.k} 관측 ${r.zFix.worst.obs} vs 기대 ${r.zFix.worst.exp})` : ''));
        if (r.fails.length) { fail += r.fails.length; r.fails.forEach(f => console.log(`  ✗ ${f}`)); }
        else console.log('  ✓ PASS — draw 단위로 확률표가 갱신되고 관측 분포도 draw별 모형과 일치');
        console.log('');
    }
    console.log('콘솔 에러:', errs.length ? errs : '없음');
    await browser.close();
    if (fail || errs.length) { console.log('\n결과: FAIL'); process.exit(2); }
    console.log('결과: PASS — 스킬·펫·탈것 3개 라인 모두 X75 배치에서 뽑기마다 확률이 갱신된다');
})();
