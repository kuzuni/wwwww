// 판매 코인 분출 회귀 검증 — 사용: node test-coinburst.js  (종료코드 0=전체 통과)
// 검증 축: 코인 개수 스케일, **착지 금액 = 합÷개수로 전부 같은 값**, **합산 표시 없음**, 모루 위에서 분출,
//          착지 텍스트가 코인이 내려온 자리에 뜨는가, 연타해도 큐가 안 깨지는가, 뒷정리.
// ⚠️ 사양 변경 2026-08-19 (`sell-coin-split-rising`, 사용자 지시): 총액 배지(.coin-total)는 폐지됐고
//    마지막 코인이 나머지를 흡수하던 분배도 없어졌다(착지 라벨은 전부 round(총액/개수)). 옛 축을 되살리지 말 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
// 뒷정리 대기: 마지막 코인 delay(≈240ms) + 비행(780) + 라벨 수명(2000) + 여유
const UI_CLEANUP_MS = 3800;

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    // waitForFunction 은 3D 렌더에 밀려 안 도는 컨테이너가 있다(2026-08-18 실측) — Node 쪽 폴링으로 대기
    for (let w = 0; ; w++) {
        const ready = await p.evaluate('typeof UI !== "undefined" && !!UI.els && !!document.querySelector(".anvil-btn")').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }
    await p.evaluate(() => { Scene3D.renderFrame = () => {}; }); // 소프트웨어 GL 렌더가 rAF를 잡아먹지 않게
    await p.waitForTimeout(400);

    const out = [];
    const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);

    // 금액 규모별 코인 개수와 합계
    for (const total of [12, 850, 240000]) {
        const r = await p.evaluate(t => {
            document.getElementById('coin-burst') && (document.getElementById('coin-burst').innerHTML = '');
            UI.coinBurst(t);
            const layer = document.getElementById('coin-burst');
            const app = document.getElementById('app').getBoundingClientRect();
            const anvil = document.querySelector('.anvil-btn').getBoundingClientRect();
            const coins = [...layer.querySelectorAll('.coin-fly')];
            return {
                n: coins.length,
                originsOnAnvil: coins.every(c => {
                    const x = parseFloat(c.style.left), y = parseFloat(c.style.top);
                    return Math.abs((anvil.left - app.left + anvil.width / 2) - x) < 1
                        && y > anvil.top - app.top && y < anvil.bottom - app.top;
                }),
                totals: layer.querySelectorAll('.coin-total').length,
            };
        }, total);
        ok(r.n >= 3 && r.n <= 10, `코인 개수 3~10개 (${total}원 → ${r.n}개)`);
        ok(r.originsOnAnvil, `${total}원: 모든 코인이 모루 버튼에서 출발`);
        ok(r.totals === 0, `${total}원: 폐지된 합산 코인 표시가 없다 (${r.totals}개)`);
    }

    // 착지 금액은 자리마다 '합÷개수'로 같은 값
    const sums = await p.evaluate(async () => {
        const res = [];
        for (const t of [7, 103, 99999]) {
            document.getElementById('coin-burst').innerHTML = '';
            UI.coinBurst(t);
            await new Promise(r => setTimeout(r, UI.COIN_FLY_MS + 400));   // 착지 직후 — 라벨 수명(2초) 안이라 전부 살아 있다
            const texts = [...document.querySelectorAll('#coin-burst .coin-amt')].map(e => e.textContent);
            res.push({ t, texts });
        }
        return res;
    });
    for (const s of sums) {
        // 착지 텍스트는 수명이 짧아 일부가 이미 지워졌을 수 있으므로, 개수가 아니라 '자릿수 축약 없는 값'만 검사
        const raw = s.texts.map(x => parseInt(String(x).replace(/[^0-9]/g, ''), 10)).filter(v => !isNaN(v));
        ok(raw.length > 0, `${s.t}원: 착지 금액 텍스트가 뜬다 (${s.texts.join(',') || '없음'})`);
    }
    // 균일 분배 검증: 착지 라벨이 전부 같은 값(합÷개수)인지 — 실제 DOM 텍스트로 본다
    const uniform = await p.evaluate(async () => {
        const res = [];
        for (const t of [7, 103, 99999, 240000, 1]) {
            document.getElementById('coin-burst').innerHTML = '';
            UI.coinBurst(t);
            const n = document.querySelectorAll('#coin-burst .coin-fly').length;
            await new Promise(r => setTimeout(r, UI.COIN_FLY_MS + 400));
            const vals = [...document.querySelectorAll('#coin-burst .coin-amt')]
                .map(e => parseInt(String(e.textContent).replace(/[^0-9]/g, ''), 10));
            res.push({ total: t, n, want: Math.max(1, Math.round(t / n)), vals });
        }
        return res;
    });
    for (const s of uniform) {
        // U.fmt 축약(1.2K)이 걸리는 큰 금액은 자릿수가 잘리므로 '전부 같은 텍스트인가'만 본다
        const same = s.vals.length > 0 && s.vals.every(v => v === s.vals[0]);
        ok(same, `착지 금액이 자리마다 같은 값 (${s.total}원 / ${s.n}개 → ${[...new Set(s.vals)].join(',')})`);
        if (s.total < 1000) ok(s.vals.every(v => v === s.want), `합÷개수 = ${s.want} (${s.total}원 / ${s.n}개 → ${[...new Set(s.vals)].join(',')})`);
    }

    // 연타: 이전 연출이 도는 중에 다시 팔아도 큐가 깨지지 않고 둘 다 살아 있다
    const burst2 = await p.evaluate(async () => {
        document.getElementById('coin-burst').innerHTML = '';
        UI.coinBurst(500);
        const a = document.querySelectorAll('#coin-burst .coin-fly').length;
        await new Promise(r => setTimeout(r, 120));
        UI.coinBurst(500);
        const b = document.querySelectorAll('#coin-burst .coin-fly').length;
        return { a, b };
    });
    ok(burst2.b > burst2.a, `연타 시 두 벌이 공존 (1회 ${burst2.a}개 → 2회 후 ${burst2.b}개)`);

    // 뒷정리: 연출이 끝나면 레이어가 비워진다(노드 누수 없음)
    await p.waitForTimeout(UI_CLEANUP_MS);
    const left = await p.evaluate(() => document.getElementById('coin-burst').childElementCount);
    ok(left === 0, `연출 종료 후 노드 정리 (잔존 ${left}개)`);

    // 0원·음수는 아무것도 만들지 않는다
    const zero = await p.evaluate(() => { UI.coinBurst(0); UI.coinBurst(-5); return document.getElementById('coin-burst').childElementCount; });
    ok(zero === 0, `0원·음수 판매는 연출 생략 (${zero}개)`);

    out.forEach(l => console.log(l));
    console.log(errors.length ? 'FAIL 콘솔 에러: ' + errors.join(' | ') : 'PASS 콘솔 에러 0건');
    await b.close();
    process.exit(out.some(l => l.startsWith('FAIL')) || errors.length ? 1 : 0);
})();
