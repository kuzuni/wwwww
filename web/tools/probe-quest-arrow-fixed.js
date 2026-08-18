// 퀘스트 시트 ◀(빨강 뒤로) 버튼이 목록과 같이 스크롤되는지 실측 (`quest-arrow-fixed`).
//
// 사용자 지시 2026-08-19: "퀘스트 부분에 빨간 왼쪽 화살표 버튼은 같이 스크롤되면 안 됨."
//
// 왜 스크롤되나: `.modal-card.sheet` 가 `overflow-y:auto` + `position:relative` 라서,
// 그 안의 `position:absolute` 인 `.sheet-back-btn` 은 **스크롤 컨테이너의 콘텐츠 좌표계**에
// 앵커된다 — 즉 목록을 내리면 버튼도 같이 위로 올라가 버린다. 시트 전체 공통 결함이라
// 퀘스트뿐 아니라 던전·상점 시트도 같은 자리다(목록이 길어야 드러난다).
//
// 판정: 시트를 끝까지 스크롤했을 때 ◀ 의 뷰포트 y 가 **변하지 않아야** 한다(허용 1px).
//       덤으로 탭바에 가려지지 않는지(elementFromPoint 가 버튼을 잡는지)도 같이 본다.
//
// 사용: PW_PATH=... node probe-quest-arrow-fixed.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 시트 계열(◀ = `.sheet-back-btn`)과 패널 계열(◀ = `.summon-bar .back-btn`)을 같이 본다 —
// "퀘스트만" 고치고 옆 화면에 같은 결함을 남겨 두지 않기 위한 전수 확인이다.
const SHEETS = [
    { name: '퀘스트', open: () => UI.openQuests(), sel: '#quest-modal' },
    { name: '던전', open: () => UI.openDungeons(), sel: '#dungeon-modal' },
    { name: '상점', open: () => UI.openShop(), sel: '#shop-modal' },
    { name: '탈것', open: () => UI.openMounts(), sel: '#mount-modal' },
    { name: '스킬', open: () => { UI.switchTab('summon'); UI.switchSummonSub('skill'); }, sel: '#panel-skills' },
    { name: '펫', open: () => { UI.switchTab('summon'); UI.switchSummonSub('pet'); }, sel: '#panel-pets' },
    { name: '기술트리', open: () => UI.openTechTree(), sel: '#panel-tech' },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    let fail = 0;
    for (const s of SHEETS) {
        const r = await page.evaluate(async ({ src, sel }) => {
            // 시트를 연다. 던전처럼 없는 화면이면 건너뛴다.
            try { (0, eval)('(' + src + ')')(); } catch (e) { return { skip: String(e) }; }
            await new Promise(r => requestAnimationFrame(r));
            document.querySelectorAll('.opening').forEach(e => e.classList.remove('opening'));
            const modal = document.querySelector(sel);
            if (!modal || modal.classList.contains('hidden')) return { skip: 'not open' };
            const btn = modal.querySelector('.sheet-back-btn, .summon-bar .back-btn');
            if (!btn) return { skip: 'no back-btn' };
            // ◀ 를 실제로 담고 있는 **스크롤 컨테이너**를 찾는다 — 시트는 카드 자신이,
            // 패널은 안쪽 `.grid-scroll` 등이 스크롤한다. 스크롤 여지가 있는 조상 중 가장 가까운 것.
            let card = null;
            for (let n = btn.parentElement; n && n !== document.body; n = n.parentElement) {
                const ov = getComputedStyle(n).overflowY;
                if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight - n.clientHeight > 4) { card = n; break; }
            }
            if (!card) return { before: { x: 0, y: 0 }, after: { x: 0, y: 0 }, scrollable: 0, hitOk: true, noScroller: true };
            const box = () => { const b = btn.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1) }; };
            const before = box();
            const max = card.scrollHeight - card.clientHeight;
            card.scrollTop = max;
            await new Promise(r => requestAnimationFrame(r));
            const after = box();
            // 실제로 눌리는지 — 버튼 중앙에서 hit-test
            const b = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return { before, after, scrollable: max, hitOk: !!(hit && (hit === btn || btn.contains(hit))), hitTag: hit ? (hit.className || hit.tagName) : null };
        }, { src: s.open.toString(), sel: s.sel });

        if (r.skip) { console.log(`${s.name}: (건너뜀 — ${r.skip})`); continue; }
        if (r.noScroller) { console.log(`${s.name}: ◀ 를 감싼 스크롤 컨테이너 없음 → 구조적으로 안전`); continue; }
        const dy = Math.abs(r.after.y - r.before.y);
        const ok = r.scrollable > 4 ? dy <= 1 : null;   // 스크롤이 없으면 판정 불가
        console.log(`${s.name}: 스크롤가능 ${r.scrollable}px · ◀ y ${r.before.y} → ${r.after.y} (Δ${dy.toFixed(1)}px) · 클릭가능 ${r.hitOk ? 'OK' : 'X(' + r.hitTag + ')'} → ${ok === null ? 'N/A(스크롤 없음)' : ok ? 'PASS' : 'FAIL'}`);
        if (ok === false) fail++;
        await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    }

    console.log(errs.length ? `콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}` : '콘솔 에러 없음');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
