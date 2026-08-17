// 흰 '페이퍼' 카드 위 등급색 이름의 명암비 검증 (QA 11차).
// 증상: 펫·알·탈것 상세 팝업과 판매 경고 팝업의 `[전설] 이름` 줄이 흰 카드 위에서
//       6등급 전부 WCAG AA(4.5:1) 미달 — 전설 1.24:1로 거의 백지 위 백지였다.
// 판정: 실제로 렌더된 텍스트 색과 **뒤에 깔린 실제 배경색**으로 명암비를 계산해 4.5:1 이상.
//       (13.77px/900은 WCAG '큰 텍스트'(굵은 18.66px) 미만이라 기준이 4.5:1이다)
// 사용: node probe-rarity-contrast.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
    });

    const rows = await page.evaluate(() => {
        const lum = rgb => rgb.map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        // 요소 뒤의 '실제로 칠해진' 배경 — 투명한 조상은 건너뛴다
        const bgOf = el => {
            for (let n = el; n; n = n.parentElement) {
                const c = getComputedStyle(n).backgroundColor;
                if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c);
            }
            return [255, 255, 255];
        };
        const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
        const out = [];
        const measure = (label, sel) => {
            const el = document.querySelector(sel);
            if (!el) { out.push({ label, err: '요소 없음 ' + sel }); return; }
            const cs = getComputedStyle(el);
            out.push({
                label, color: cs.color, fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
                ratio: ratio(parse(cs.color), bgOf(el)), text: el.textContent.trim().slice(0, 20),
            });
        };
        const RS = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'].filter(r => RARITY_CSS[r]);
        for (const r of RS) {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            S.pets = [{ name: Object.keys(PET_ICONS)[0], rarity: r, level: 3, xp: 0 }];
            S.activePets = [];
            UI.openPetDetail(0);
            measure(`펫 상세 ${RARITY_KR[r]}`, '.petd-name');

            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            S.eggs = [{ rarity: r, hatchAt: 0 }];
            UI.openEggDetail(0);
            measure(`알 상세 ${RARITY_KR[r]}`, '.petd-name');

            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const mn = Object.keys(MOUNT_ICONS)[0];
            S.mounts = { [mn]: { level: 1, xp: 0, rarity: r } };
            UI.openMountDetail(mn);
            measure(`탈것 상세 ${RARITY_KR[r]}`, '.petd-name');

            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const sold = Object.assign(Forge.rollItem(), { rarity: r, name: '테스트 장비' });
            const kept = Object.assign(Forge.rollItem(), { rarity: 'common', slot: sold.slot });
            UI.showSellConfirm({ sold, kept });
            // 2026-08-18: 경고 창이 '파는 것 / 남는 것' 등급 칩 대조로 바뀌었다(`sell-warn-samerank`).
            // 흰 글자를 흰 카드에 얹던 `.sellwarn-item`은 없어졌고, 이제 등급색 **필** 위의 전경색을 잰다
            // (bgOf가 칩 자신의 배경을 먼저 집으므로 chipFill이 보장하는 그 대비가 그대로 측정된다).
            measure(`판매 경고 ${RARITY_KR[r]}`, '.swc-rank');
        }
        return out;
    });

    for (const r of rows) {
        if (r.err) { console.log(`SKIP ${r.label}: ${r.err}`); continue; }
        const pass = r.ratio >= 4.5;
        if (!pass) fails.push(`${r.label}: ${r.ratio.toFixed(2)}:1 (${r.color}, ${r.fs}px/${r.fw})`);
        console.log(`${pass ? 'PASS' : 'FAIL'} ${r.label.padEnd(18)} ${r.ratio.toFixed(2)}:1  ${r.color}  ${r.fs}px/${r.fw}`);
    }
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 흰 카드 위 등급색 이름 전부 AA 4.5:1 이상');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
