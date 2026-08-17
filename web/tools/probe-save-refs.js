// 실게임 검증 — 손상 세이브를 심고 부팅이 살아남는지 본다 (QA 10차 항목).
// **분담**: 필드 누락·null·타입 불일치·비객체 세이브는 `probe-save-migrate.js`가 이미 본다.
// 이쪽은 그 도구가 다루지 않는 나머지 갈래만 맡는다 — QA가 실측한 사망 5종 중 **음수값·초대형(비유한)값**,
// 그리고 형태 검사로는 안 잡히는 **참조 깨짐**(없는 스킬 id·허공 펫 인덱스·객체 아닌 장비 슬롯).
// localStorage는 file://에서 막히므로 로컬 HTTP 서버가 필요하다:
//   python3 -m http.server 8899 -d web  &  node tools/probe-save-repair.js
// 확인 항목은 QA 리포트가 '죽었다'고 실측한 지표 그대로다:
//   Scene3D.renderer 존재 · Combat.enemies 생성 · #equip-sheet 내용 · #stage-label ·
//   #app 크기(얇은 띠 붕괴) · 게임 내 초기화 버튼([onclick*="resetGame"]) 도달 가능 여부
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8899/';
const SAVE_KEY = 'forgeclone_save_v1';

const CASES = [
    ['① 음수값', '{"version":1,"coins":-500,"hammers":-1,"stage":-3,"chapter":0,"forgeLevel":-9}'],
    ['② 초대형·비유한값(1e400 → Infinity)', '{"version":1,"coins":1e308,"gems":1e400,"tickets":null}'],
    ['③ 참조 깨짐(없는 스킬 id·허공 펫 인덱스)', '{"version":1,"equippedSkills":["ghostSkill",42],"pets":[],"activePets":[0,1,2]}'],
    ['④ 장비 슬롯에 객체 아닌 값', '{"version":1,"equipment":{"weapon":"sword","helmet":[]}}'],
    ['⑤ 정상 세이브(비회귀 대조군)', null], // 새 게임으로 한 번 돌린 뒤의 실제 세이브를 쓴다
];

let pass = 0, fail = 0;
const check = (n, c, d) => {
    if (c) { pass++; console.log(`    PASS  ${n}`); }
    else { fail++; console.log(`    FAIL  ${n}${d !== undefined ? ` — ${JSON.stringify(d)}` : ''}`); }
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    // 계측 안정화 2가지 (둘 다 실측으로 잡은 함정이다):
    // ⑴ 100ms 로직 틱이 `document.hidden`이면 건너뛴다 — 부팅(Combat.start의 적 스폰·Scene3D.init)은
    //    그대로 돌면서 전투 진행만 멈춰, 심어 둔 세이브 값이 킬 보상으로 변하지 않는다.
    // ⑵ 세이브를 심고 reload하면 **떠나는 페이지의 beforeunload → saveGame()**이 방금 심은 값을
    //    현재 상태로 덮어썼다(처음 돌렸을 때 ④ 케이스가 직전 케이스 값으로 나온 원인).
    //    심은 직후 setItem을 막아 두면 새 페이지에서는 원래대로 복구된다.
    await page.addInitScript(() => {
        Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon\.ico/.test(m.text())) errs.push(m.text()); });

    // 대조군용 정상 세이브 확보 (새 게임 1회 부팅 결과)
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S, null, { timeout: 60000 });
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });
    await page.evaluate(() => { S.coins = 4242; S.chapter = 3; saveGame(); });
    const healthy = await page.evaluate(k => localStorage.getItem(k), SAVE_KEY);

    for (const [label, raw] of CASES) {
        console.log(`\n■ ${label}`);
        errs.length = 0;
        await page.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem = () => {}; }, [SAVE_KEY, raw === null ? healthy : raw]);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(1500);

        const m = await page.evaluate(() => ({
            renderer: !!(typeof Scene3D !== 'undefined' && Scene3D.renderer),
            enemies: (typeof Combat !== 'undefined' && Combat.enemies) ? Combat.enemies.length : -1,
            // hp는 bignum 객체({m,e})라 그대로 비교하면 안 된다 — 살아 있는지만 안으로 판정해 넘긴다
            heroAlive: (() => {
                const h = typeof Combat !== 'undefined' && Combat.hero && Combat.hero.hp;
                return !!h && (typeof h === 'number' ? h > 0 : h.m > 0);
            })(),
            sheetLen: (document.getElementById('equip-sheet') || {}).innerHTML?.length || 0,
            stageLabel: (document.getElementById('stage-label') || {}).textContent?.trim() || '',
            appW: parseFloat(document.getElementById('app').style.width) || 0,
            appH: parseFloat(document.getElementById('app').style.height) || 0,
            resetBtns: document.querySelectorAll('[onclick*="resetGame"]').length,
            skillBtns: document.querySelectorAll('#skill-bar .skill-btn').length,
            coins: S.coins, chapter: S.chapter, stage: S.stage, gems: S.gems,
            equipped: S.equippedSkills.length, active: S.activePets.length,
            weaponNull: S.equipment.weapon === null, helmetNull: S.equipment.helmet === null,
            savedKeys: Object.keys(JSON.parse(localStorage.getItem('forgeclone_save_v1') || '{}')).length,
        }));
        // 게임 내 초기화 버튼은 방(메뉴) 탭 안에 있다 — 렌더가 살아 있어야 도달한다
        await page.evaluate(() => { try { UI.switchTab('menu'); } catch (e) { /* 렌더가 죽었으면 0건으로 잡힌다 */ } });
        await page.waitForTimeout(300);
        const resetInMenu = await page.evaluate(() => document.querySelectorAll('[onclick*="resetGame"]').length);

        check('3D 렌더러 생성', m.renderer, m.renderer);
        check('전투 시작(적 스폰 + 영웅 HP 산출)', m.enemies > 0 && m.heroAlive, { enemies: m.enemies, heroAlive: m.heroAlive });
        check('장비 시트 렌더', m.sheetLen > 0, m.sheetLen);
        check('스테이지 라벨 표시', m.stageLabel.length > 0, m.stageLabel);
        check('레이아웃 정상(얇은 띠 붕괴 아님)', m.appW > 100 && m.appH > 400, { w: m.appW, h: m.appH });
        check('스킬바 3슬롯 렌더', m.skillBtns >= 3, m.skillBtns);
        check('게임 내 초기화 도달 가능', resetInMenu > 0, resetInMenu);
        check('세이브에 누락 필드가 채워져 기록됨', m.savedKeys >= 30, m.savedKeys);
        check('콘솔/페이지 에러 0건', errs.length === 0, errs.slice(0, 3));
        if (raw === null) check('대조군: 정상 세이브 값 보존', m.coins === 4242 && m.chapter === 3, { coins: m.coins, chapter: m.chapter });
        if (label.startsWith('①')) check('①: 음수 보정(coins 0 / stage 1 / chapter 1)', m.coins === 0 && m.stage === 1 && m.chapter === 1, { coins: m.coins, stage: m.stage, chapter: m.chapter });
        if (label.startsWith('②')) check('②: 유한 초대형은 보존, Infinity만 기본값', m.coins === 1e308 && Number.isFinite(m.gems), { coins: m.coins, gems: m.gems });
        if (label.startsWith('③')) check('③: 없는 스킬 id 제거 + 허공 펫 인덱스 비움', m.equipped === 0 && m.active === 0, { equipped: m.equipped, active: m.active });
        if (label.startsWith('④')) check('④: 객체 아닌 슬롯 → null', m.weaponNull && m.helmetNull, { weapon: m.weaponNull, helmet: m.helmetNull });
    }

    // 두 번 연속 새로고침해도 살아 있는지 (QA: "새로고침해도 영구히 같은 상태")
    console.log('\n■ 새로고침 반복(QA: 새로고침해도 영구히 같은 상태였다)');
    await page.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem = () => {}; }, [SAVE_KEY, '{"version":1,"chapter":2,"stage":3,"coins":100,"hammers":5}']);
    for (let i = 1; i <= 2; i++) {
        errs.length = 0;
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(1500);
        const r = await page.evaluate(() => ({ enemies: Combat.enemies.length, renderer: !!Scene3D.renderer, coins: S.coins }));
        check(`${i}회차 새로고침 정상(값도 그대로)`, r.enemies > 0 && r.renderer && r.coins === 100 && errs.length === 0, { ...r, errs: errs.slice(0, 2) });
    }

    await browser.close();
    console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
})();
