// 재료 없음 안내문이 5열 그리드 첫 칸에 갇히지 않는지 검증 (QA 11차).
// 증상: `.mat-grid`가 repeat(5, 1fr)인데 안내문 <span>이 그리드 자식이라 **첫 칸(51~53px)** 에
//       들어가 세로 3~4줄로 쪼개진 채 왼쪽에 붙고, 카드 나머지 90%가 백지로 남았다.
// 판정: 안내문 폭이 그리드 폭의 90% 이상 + 줄 수 1줄(높이 ≤ 1.8줄) + 가로 중앙(±3%).
// 대상: 탈것 업그레이드 팝업 / 펫 업그레이드 팝업.
// 사용: node probe-mat-empty.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    for (const [w, h] of [[430, 932], [360, 800], [499, 892]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${w}x${h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
        });

        const cases = [
            ['탈것 업그레이드', () => {
                S.mounts = { horse: { level: 1, xp: 0 } };   // 딱 1마리 = 재료로 쓸 다른 탈것 없음
                S.activeMount = 'horse';
                UI.openMountUpgrade('horse');
            }],
            ['펫 업그레이드', () => {
                S.pets = [{ idx: 0, rarity: 'common', level: 1, xp: 0 }];
                S.activePets = [0]; S.eggs = [];            // 펫 1마리(장착 중)·알 0개 = 재료 없음
                UI.openPetUpgrade(0);
            }],
        ];
        for (const [name, fn] of cases) {
            const r = await page.evaluate(src => {
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                try { new Function('return (' + src + ')')()(); } catch (e) { return { err: e.message }; }
                // .muted로 잡는다 — 수정 전(클래스 없던 시절)에도 같은 기준으로 재도록
                const el = document.querySelector('.mat-grid > .muted');
                if (!el) return { err: '안내문이 없다 — 재료 없음 상태가 안 만들어지지 않았다' };
                const g = el.parentElement.getBoundingClientRect(), b = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
                const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
                // 줄 수는 Range로 텍스트 실제 렌더 박스를 재서 센다 (인라인 요소는 rect 높이가
                // 패딩을 포함해도 줄 수를 반영하지 않는 경우가 있어 rect 계산이 어긋난다)
                const rng = document.createRange();
                rng.selectNodeContents(el);
                const rects = [...rng.getClientRects()];
                const textH = rects.length ? Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)) : b.height - pad;
                return {
                    wPct: 100 * b.width / g.width,
                    lines: textH / lh,
                    lineRects: rects.length,
                    centerOff: 100 * ((b.left + b.width / 2) - (g.left + g.width / 2)) / g.width,
                };
            }, fn.toString());
            if (r.err) { fails.push(`${w}x${h} ${name}: ${r.err}`); console.log(`FAIL ${w}x${h} ${name}: ${r.err}`); continue; }
            const pass = r.wPct >= 90 && r.lines <= 1.8 && Math.abs(r.centerOff) <= 3;
            ok(pass, `${w}x${h} ${name}: 폭 ${r.wPct.toFixed(0)}% · ${r.lines.toFixed(1)}줄(rect ${r.lineRects}) · 중앙편차 ${r.centerOff.toFixed(1)}%`);
            console.log(`${pass ? 'PASS' : 'FAIL'} ${w}x${h} ${name} — 안내문 폭 ${r.wPct.toFixed(0)}%(그리드 대비) · ${r.lines.toFixed(1)}줄(rect ${r.lineRects}) · 중앙편차 ${r.centerOff.toFixed(1)}%`);
        }
        await page.close();
    }
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 안내문이 카드 폭을 한 줄로 채운다');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
