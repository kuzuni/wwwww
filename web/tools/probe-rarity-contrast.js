// 흰 '페이퍼' 카드 위 등급색/시대색 텍스트의 명암비 검증 (QA 11차, 판매 경고는 시대축으로 갱신 2026-08-18).
// 증상: 펫·알·탈것 상세 팝업과 판매 경고 팝업의 `[전설] 이름` 줄이 흰 카드 위에서
//       6등급 전부 WCAG AA(4.5:1) 미달 — 전설 1.24:1로 거의 백지 위 백지였다.
// 판정: 실제로 렌더된 텍스트 색과 **뒤에 깔린 실제 배경색**으로 명암비를 계산해 4.5:1 이상.
//       (13.77px/900은 WCAG '큰 텍스트'(굵은 18.66px) 미만이라 기준이 4.5:1이다)
// 예외 — 펫 상세(.petd-wrap 안쪽)·펫 업그레이드(.petup-panel)의 이름 줄 (petd-contrast-probe-stale, 2026-08-18):
//       원본(042449·042503) 실측이 등급 **원색** + 검정 키라인 2px라 fill 대비로 재면 상시 FAIL이 난다.
//       이 행들은 대신 ① 원색 유지(inkRarity로 어두워지지 않음) ② 키라인 **두께 비율**이 규정 밴드 안
//       ③ 키라인 색 자체가 배경과 4.5:1 이상 ④ paint-order 에 stroke(키라인이 fill 뒤로) 를 검사한다
//       — 누가 inkRarity 를 되살리거나 키라인을 빼면 여기서 빨갛게 걸린다.
// 🚨 ② 는 '고정 2px 이상'이 아니라 **비율 밴드**다 (petname-keyline-blob-small, 2026-08-25).
//       고정 2px 이던 시절엔 좁은 화면에서 글자만 rem 으로 줄고 획은 그대로라 획/글자 비가 커져
//       `[일반]` 이 검은 덩어리가 됐다(360×640 비 0.174 · 320×568 비 0.196). 그래서 CSS 를
//       `max(1.2px, .125em)`(펫 상세) · `max(1.2px, .113em)`(업그레이드)로 바꿨고 — 두 값이 다른 건
//       같은 원본 2px 을 각자의 글자 크기(.95rem=15.98px / 1.05rem=17.66px)로 나눈 결과다 —
//       이 프로브는 **좁은 밴드(320×568)를 한 번 더 돌아** 비율이 밴드를 벗어나는지 본다.
//       한 밴드만 재면 못 잡는다: 고정 2px 은 430×932 에서 비 0.145 라 상한을 통과한다.
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

    // 밴드 하나를 훑는다. narrow=true 면 **키라인 행만** 잰다 — 좁은 밴드에서 보려는 건 두께 비율뿐이고,
    // fill 대비(알·탈것·판매 경고)는 색만 보므로 밴드가 바뀌어도 값이 같다(두 번 찍으면 로그만 두 배).
    const sweep = narrow => page.evaluate((narrow) => {
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
        const hexRgb = h => { const x = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
        // rawHex 를 주면 '키라인 행'이다: fill 대비 대신 원색 유지 + 키라인 2px + 키라인 대비를 검사한다
        const measure = (label, sel, rawHex) => {
            const el = document.querySelector(sel);
            if (!el) { out.push({ label, err: '요소 없음 ' + sel }); return; }
            const cs = getComputedStyle(el);
            const row = {
                label, color: cs.color, fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
                ratio: ratio(parse(cs.color), bgOf(el)), text: el.textContent.trim().slice(0, 20),
            };
            if (rawHex) {
                row.keyline = true;
                row.colorOk = parse(cs.color).join(',') === hexRgb(rawHex).join(',');
                row.strokeW = parseFloat(cs.webkitTextStrokeWidth) || 0;
                row.strokeRatio = ratio(parse(cs.webkitTextStrokeColor), bgOf(el));
                row.paintOrder = cs.paintOrder || '';
            }
            out.push(row);
        };
        const RS = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'].filter(r => RARITY_CSS[r]);
        for (const r of RS) {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            // 2마리 — 업그레이드 팝업은 '합칠 펫'이 있어야 열린다
            S.pets = [{ name: Object.keys(PET_ICONS)[0], rarity: r, level: 3, xp: 0 },
                      { name: Object.keys(PET_ICONS)[1] || Object.keys(PET_ICONS)[0], rarity: r, level: 1, xp: 0 }];
            S.activePets = [];
            UI.openPetDetail(0);
            // 펫 상세만 .petd-wrap 스코프 = 원색 + 키라인 (알·탈것 상세는 종전 inkRarity 게이트 그대로)
            measure(`펫 상세 ${RARITY_KR[r]}`, '.petd-wrap .petd-name', RARITY_CSS[r]);

            // 펫 업그레이드 팝업도 **같은 화법**(원색 + 키라인)이라 같은 게이트에 편입한다
            // (petname-keyline-blob-small, 2026-08-25 — 예전엔 펫 상세 5행만 재서 이쪽이 사각지대였다).
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            UI.openPetUpgrade(0);
            measure(`펫 업글 ${RARITY_KR[r]}`, '.petup-panel .idet-name', RARITY_CSS[r]);

            if (narrow) continue;   // 좁은 밴드는 키라인 두께만 본다
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            S.eggs = [{ rarity: r, hatchAt: 0 }];
            UI.openEggDetail(0);
            measure(`알 상세 ${RARITY_KR[r]}`, '.petd-name');

            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const mn = Object.keys(MOUNT_ICONS)[0];
            S.mounts = { [mn]: { level: 1, xp: 0, rarity: r } };
            UI.openMountDetail(mn);
            measure(`탈것 상세 ${RARITY_KR[r]}`, '.petd-name');

        }
        // 판매 경고 창은 rarity 를 더 이상 쓰지 않는다 — 칩이 **시대색** 필이라 10시대를 따로 돈다
        // (`sell-warn-by-age`, 2026-08-18 사용자 확정). 위 rarity 루프와 축이 다르니 섞지 말 것.
        // 특히 원시적(#e0e0e0)은 흰 종이 카드와 거의 같은 색이라, 필을 그대로 쓰면 백지 위 백지가 된다
        // — chipFill 이 필을 어둡게 밀어 4.5:1을 맞추는지가 이 줄의 요지다.
        for (const age of narrow ? [] : AGES) {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const sold = Object.assign(Forge.rollItem(), { age, name: '테스트 장비' });
            const kept = Object.assign(Forge.rollItem(), { age: AGES[0], slot: sold.slot });
            UI.showSellConfirm({ sold, kept });
            // bgOf 가 칩 자신의 배경을 먼저 집으므로 chipFill 이 보장하는 그 대비가 그대로 측정된다
            measure(`판매 경고 ${AGE_KR[age]}`, '.swc-age');
        }
        return out;
    }, narrow);

    // 키라인 두께 비율 밴드. 하한은 업글 줄의 .113 을, 상한은 이 저장소가 이미 못 박은 글리프 복잡도
    // 상한(css 3612행: 13.5px 글자에 2px = 0.148)을 쓴다. 절대 하한 1px 은 키라인이 사라지는 걸 막는다.
    const SW_LO = 0.108, SW_HI = 0.15, SW_MIN_PX = 1;
    const judge = (rows, band) => {
        for (const r of rows) {
            if (r.err) { console.log(`SKIP ${band} ${r.label}: ${r.err}`); continue; }
            if (r.keyline) {
                const sr = r.strokeW / r.fs;
                const why = [];
                if (!r.colorOk) why.push(`원색 아님(${r.color})`);
                if (r.strokeW < SW_MIN_PX) why.push(`키라인 ${r.strokeW.toFixed(2)}px < ${SW_MIN_PX}px`);
                if (sr < SW_LO) why.push(`획/글자 비 ${sr.toFixed(3)} < ${SW_LO}`);
                if (sr > SW_HI) why.push(`획/글자 비 ${sr.toFixed(3)} > ${SW_HI} (좁은 화면에서 속공간이 메워진다)`);
                if (r.strokeRatio < 4.5) why.push(`키라인 대비 ${r.strokeRatio.toFixed(2)}:1 < 4.5`);
                if (!/stroke/.test(r.paintOrder)) why.push(`paint-order에 stroke 없음(${r.paintOrder})`);
                if (why.length) fails.push(`${band} ${r.label}: ${why.join(' · ')}`);
                console.log(`${why.length ? 'FAIL' : 'PASS'} ${band} ${r.label.padEnd(14)} 원색+키라인 ${r.strokeW.toFixed(2)}px/${r.fs.toFixed(2)}px = 비 ${sr.toFixed(3)} · 키라인 대비 ${r.strokeRatio.toFixed(2)}:1  ${r.color}`);
                continue;
            }
            const pass = r.ratio >= 4.5;
            if (!pass) fails.push(`${band} ${r.label}: ${r.ratio.toFixed(2)}:1 (${r.color}, ${r.fs}px/${r.fw})`);
            console.log(`${pass ? 'PASS' : 'FAIL'} ${band} ${r.label.padEnd(14)} ${r.ratio.toFixed(2)}:1  ${r.color}  ${r.fs}px/${r.fw}`);
        }
    };

    judge(await sweep(false), '430');
    // 좁은 밴드 재측정 — 고정 px 키라인은 여기서만 걸린다(430 에서는 비 0.145 라 상한을 통과한다).
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    judge(await sweep(true), '320');

    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 잉크 행 AA 4.5:1 이상 · 펫 상세/업글 원색+키라인 비율 유지(430·320 두 밴드)');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
