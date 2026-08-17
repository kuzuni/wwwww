// 제작 비교 팝업 이름줄 색 = 시대색 검증 (QA 2026-08-18 cmp-name-agecolor).
// 원본 shot-043224 실측: 위 카드 #682828(underworld 0x6e2f30), 아래 #3818f8(quantum 0x341cff)
// → 이름줄은 --pp-ink 고정이 아니라 **시대색**이어야 한다.
// 다만 원시(#e0e0e0)·현대(#f8ff1c)처럼 밝은 시대색은 흰 카드 위에서 사라지므로 UI.inkRarity로
// 색상(hue)은 두고 4.5:1까지만 낮춘다 — 이미 어두운 시대색은 그대로 통과해야 원본과 같아진다.
// ⚠️ 이 화면은 원본 대조 ±2%p 게이트가 걸려 있다 → 색만 바뀌고 **바운딩 박스는 1px도 안 움직여야** 한다.
// 사용: node probe-cmp-name-color.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const fails = [], rows = [], errs = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.hammers = 1e6; S.coins = 1e12;
    });

    const data = await page.evaluate(() => {
        const ages = Object.keys(AGE_COLORS);
        const mk = (age) => {
            const it = Forge.craft(1)[0];
            it.age = age; it.name = '검증품'; it.level = 10;
            return it;
        };
        const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
        const out = [];
        for (const age of ages) {
            const it = mk(age);
            S.equipment[it.slot] = mk(age);
            UI._autoSeq = null;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            const el = document.querySelector('.cmp-card-wrap.new .cmp-name');
            const box0 = el.getBoundingClientRect();
            const col = getComputedStyle(el).color;
            // 옛 규칙(--pp-ink 고정)으로 되돌렸을 때와 기하가 같은지 — 색만 바뀌었음을 실측으로 증명
            el.style.color = getComputedStyle(document.documentElement).getPropertyValue('--pp-ink');
            const box1 = el.getBoundingClientRect();
            el.style.color = '';
            out.push({
                age, hex: '#' + AGE_COLORS[age].toString(16).padStart(6, '0'),
                col: rgb(col), ink: UI.inkRarity('#' + AGE_COLORS[age].toString(16).padStart(6, '0')),
                contrast: UI.contrastOnWhite(UI.inkRarity('#' + AGE_COLORS[age].toString(16).padStart(6, '0'))),
                box: [box0.x, box0.y, box0.width, box0.height],
                boxInk: [box1.x, box1.y, box1.width, box1.height],
            });
            UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        }
        return out;
    });

    const hex2rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const hue = ([r, g, b]) => {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (!d) return -1;
        const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    for (const d of data) {
        const want = hex2rgb(d.ink);
        const dist = Math.max(...d.col.map((v, i) => Math.abs(v - want[i])));
        const hSrc = hue(hex2rgb(d.hex)), hOut = hue(d.col);
        const hDiff = (hSrc < 0 || hOut < 0) ? 0 : Math.min(Math.abs(hSrc - hOut), 360 - Math.abs(hSrc - hOut));
        const moved = d.box.some((v, i) => Math.abs(v - d.boxInk[i]) > 0.01);
        rows.push(`${d.age.padEnd(12)} 시대색 ${d.hex} → 렌더 rgb(${d.col.join(',')}) 대비 ${d.contrast.toFixed(2)}:1 색상차 ${hDiff.toFixed(1)}° 박스이동 ${moved}`);
        ok(dist <= 1, `${d.age}: 렌더색이 inkRarity(시대색)와 다르다 (want ${d.ink} / got rgb(${d.col.join(',')}))`);
        ok(d.contrast >= 4.5, `${d.age}: 흰 배경 대비 ${d.contrast.toFixed(2)}:1 — 4.5 미만이라 안 읽힌다`);
        ok(hDiff <= 6, `${d.age}: 색상(hue)이 ${hDiff.toFixed(1)}° 틀어졌다 — 시대색으로 안 읽힌다`);
        ok(!moved, `${d.age}: 색만 바꿨는데 이름줄 바운딩 박스가 움직였다 (${d.box} vs ${d.boxInk}) — ±2%p 게이트 위반`);
    }
    // 원본에서 직접 디코드된 두 시대는 시대색이 이미 충분히 어두워 **깎이지 않고 그대로** 나와야 한다
    for (const [age, hex] of [['underworld', '#6e2f30'], ['quantum', '#341cff']]) {
        const d = data.find(x => x.age === age);
        const want = hex2rgb(hex);
        ok(d.col.every((v, i) => Math.abs(v - want[i]) <= 1),
            `${age}: 원본 대조색 ${hex}가 그대로 안 나온다 (rgb(${d.col.join(',')})) — inkRarity가 불필요하게 깎았다`);
    }

    console.log(rows.join('\n'));
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fails.length ? '❌ FAIL\n - ' + fails.join('\n - ') : '✅ PASS — 이름줄 시대색 + 대비 4.5:1 + 기하 불변');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
