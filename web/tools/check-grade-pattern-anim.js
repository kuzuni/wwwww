// 등급(시대) 무늬 애니메이션 회귀 검사 — `grade-pattern-animation` (사용자 지시 2026-08-19)
//
// 무엇을 지키나: 항성간 이상 다섯 시대(interstellar/multiverse/quantum/underworld/divine)의
// 무늬가 **실제로 움직이는지**를 눈이 아니라 픽셀로 확인한다. CSS 애니메이션은 선택자 하나만
// 어긋나도 조용히 멈추고, 정지 캡처 한 장으로는 그걸 절대 못 잡는다.
//
// 방법: 같은 요소를 시간차 두 번 캡처해 **다른 픽셀 비율**을 잰다.
//   · 움직이는 무늬  → 다른 픽셀이 뚜렷하게 나온다(임계 1.5% 이상)
//   · 무늬 없는 시대 → 0 에 가깝다(원시적~우주는 원본이 민무늬라 안 움직이는 게 정답)
// 두 곳 모두 본다: ① 확률 정보 팝업의 시대 막대 ② 장착 슬롯(.equip-cell).
//
// 사용: PW_PATH=... node check-grade-pattern-anim.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const PATTERNED = ['interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];
const FLAT = ['primitive', 'medieval', 'earlyModern', 'modern', 'space'];
const MIN_MOVE = 1.5;   // 무늬 있는 시대가 넘어야 하는 변화 픽셀 비율(%)
const MAX_FLAT = 0.3;   // 민무늬 시대가 넘으면 안 되는 값(%)

// 두 PNG 버퍼의 다른 픽셀 비율(%). 순수 JS PNG 디코더 없이 비교하려고 캔버스로 픽셀을 읽는다.
async function diffPct(page, aB64, bB64) {
    return page.evaluate(async ([a, b]) => {
        const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
        if (!w || !h) return -1;
        const px = img => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0);
            return c.getContext('2d').getImageData(0, 0, w, h).data;
        };
        const da = px(ia), db = px(ib);
        let n = 0;
        for (let i = 0; i < da.length; i += 4) {
            if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 12) n++;
        }
        return +(n / (w * h) * 100).toFixed(2);
    }, [aB64, bB64]);
}

// ⚠️ 한 쌍만 재면 **주기를 그대로 밟아** 0% 가 나온다 — 실제로 다중 우주(3.5s 주기)가 그랬다.
// 캡처 자체가 1초 안팎 걸려 두 캡처 간격이 우연히 애니메이션 한 주기와 맞아떨어지면 같은 그림이 잡힌다.
// 간격이 다른 캡처를 여러 장 찍어 **쌍마다 비교한 최대값**을 쓴다(주기와 겹치는 쌍이 있어도 나머지가 잡는다).
async function moveOf(page, sel, gaps = [180, 420, 900]) {
    const el = page.locator(sel).first();
    if (!await el.count()) return { err: 'no element ' + sel };
    const shots = ['data:image/png;base64,' + (await el.screenshot({ animations: 'allow' })).toString('base64')];
    for (const g of gaps) {
        await page.waitForTimeout(g);
        shots.push('data:image/png;base64,' + (await el.screenshot({ animations: 'allow' })).toString('base64'));
    }
    let max = 0;
    for (let i = 1; i < shots.length; i++) max = Math.max(max, await diffPct(page, shots[0], shots[i]));
    return { pct: +max.toFixed(2) };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];

    // ── ① 확률 정보 팝업: 10시대 막대가 한 화면에 다 뜬다 ──
    await page.evaluate(() => UI.openForgeInfo());
    await page.waitForTimeout(600);
    for (const age of [...PATTERNED, ...FLAT]) {
        const r = await moveOf(page, `.fi-age-bar[data-age="${age}"]`);
        const patterned = PATTERNED.includes(age);
        const ok = r.err ? false : (patterned ? r.pct >= MIN_MOVE : r.pct <= MAX_FLAT);
        console.log(`  팝업 ${age.padEnd(13)} 변화 ${String(r.err || r.pct + '%').padStart(8)}  ${ok ? 'OK' : 'FAIL'}`);
        if (!ok) fails.push(`fi-age-bar[${age}] ${r.err || r.pct + '%'}`);
    }
    await page.screenshot({ path: path.resolve(__dirname, 'grade-pat-anim-popup.png') });
    await page.evaluate(() => UI.closeForgeInfo());
    await page.waitForTimeout(300);

    // ── ② 장착 슬롯: 무늬 있는 시대 장비를 실제로 끼워 본다 ──
    for (const age of PATTERNED) {
        await page.evaluate(a => {
            S.equipment.weapon = { name: 'test', slot: 'weapon', age: a, level: 1, stars: 0, power: 1, nameIdx: 0, wtype: 'sword' };
            UI.renderEquipSheet();
        }, age);
        await page.waitForTimeout(500);
        const r = await moveOf(page, `.equip-cell[data-age="${age}"]`);
        const ok = !r.err && r.pct >= MIN_MOVE;
        console.log(`  슬롯 ${age.padEnd(13)} 변화 ${String(r.err || r.pct + '%').padStart(8)}  ${ok ? 'OK' : 'FAIL'}`);
        if (!ok) fails.push(`equip-cell[${age}] ${r.err || r.pct + '%'}`);
    }
    await page.screenshot({ path: path.resolve(__dirname, 'grade-pat-anim-slot.png') });

    if (errors.length) { console.log('콘솔 에러:'); errors.slice(0, 8).forEach(e => console.log('   ' + e)); }
    console.log(fails.length ? '\nFAIL — ' + fails.join(' / ') : '\nPASS — 다섯 시대 무늬가 팝업·슬롯 양쪽에서 움직인다');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
