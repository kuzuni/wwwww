// equip-swap-throwout 판정기 (사용자 지시 2026-08-19)
//   "장비 교체될 때 예전 꺼는 회전하면서 바닥으로 나가떨어지는 느낌으로.
//    새로 교체된 거는 딸깍 하고 그 자리에 들어가게."
// 세 박자를 각각 **다른 축의 수치**로 잰다 — 눈으로 '움직이더라'가 아니라 무엇이 얼마나 움직였는지.
//   ⑴ 던짐 : 가로 이동거리 · 세로 궤적이 '솟았다 내려간다'인지(단조 낙하면 그냥 떨어뜨린 것) · 회전 총각
//   ⑵ 빈칸 : 옛 것이 나간 뒤 새 것이 앉기 전까지 칸 내용물이 안 보이는 구간이 있는지
//   ⑶ 딸깍 : 복제 타일이 1보다 큰 배율로 **오버슈트**했다가 1로 수렴하는지 · 원본 칸과 겹쳐 그린
//            프레임이 없는지(둘 다 보이면 잔상으로 읽힌다)
// 그리고 뒷정리 — 연출이 끝나면 레이어가 비고, 칸에 `eqsw-hollow` 가 남지 않아야 한다.
//
// ⚠️ 함정 대비(TODO '비평가 채점 함정' ③④):
//   · `Scene3D.update` 는 rAF 라 헤드리스에서 안 돌고 `Combat.tick` 만 계속 돈다 → 둘 다 끊는다.
//   · 인자를 손으로 베끼지 않는다. 궤적 상수는 전부 **코드가 준 값**(UI.EQSW_*)을 읽어 판정선을 만든다.
//   · 대상은 타입이 아니라 `#equip-swap-fx` 안의 클래스로 집는다(다른 연출이 섞이지 않게).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const SHOT = process.argv.includes('--shot');
// 좁은 화면일수록 팝업 카드 옆 '빈 띠'가 얇아진다 — 착지 자리 계산이 제일 먼저 무너지는 축이라
// 뷰포트를 인자로 받는다. 예: `node tools/probe-equip-swap.js 360x640`
const vpArg = process.argv.find(a => /^\d+x\d+$/.test(a));
const VP = vpArg
    ? { width: +vpArg.split('x')[0], height: +vpArg.split('x')[1] }
    : { width: 430, height: 932 };
// 슬롯은 제작 난수로 정해진다 — 어느 칸이 걸리든 통과해야 하므로 몇 번 돌려 볼 것(가운데 칸이 제일 빡세다)
const SLOT_ARG = (process.argv.find(a => /^--slot=/.test(a)) || '').split('=')[1] || null;

const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: VP });
    console.log(`뷰포트 ${VP.width}x${VP.height}${SLOT_ARG ? ` · 슬롯 고정 ${SLOT_ARG}` : ''}`);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // waitForFunction 은 이 컨테이너에서 20초 타임아웃으로 죽는다 — Node 쪽 폴링으로 기다린다
    for (let i = 0; i < 160; i++) {
        if (await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!document.querySelector('#equip-sheet .equip-grid'))) break;
        await page.waitForTimeout(250);
    }
    await page.waitForTimeout(400);

    // ---- 결정적 스왑 상황 세팅: 같은 부위의 옛/새 장비를 세우고 비교 팝업을 띄운다 ----
    const setup = await page.evaluate((wantSlot) => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.coins = 1e12; S.hammers = 1e6; S.forgeLevel = 20;
        UI._autoSeq = null;
        let it = Forge.craft(1)[0];
        if (wantSlot) for (let i = 0; i < 400 && it.slot !== wantSlot; i++) it = Forge.craft(1)[0];
        let old = Forge.craft(1)[0];
        for (let i = 0; i < 400 && old.slot !== it.slot; i++) old = Forge.craft(1)[0];
        S.equipment[it.slot] = old;
        UI.renderEquipSheet();
        UI.setPendingCraft(it); UI.showCraftModal(it);
        return { slot: it.slot, sameSlot: old.slot === it.slot };
    }, SLOT_ARG);
    // ⚠️ 팝업 카드 크기는 **팝 애니(`.modal.opening .modal-card`, .25s)가 끝난 뒤** 재야 한다.
    //    여는 즉시 재면 확대 도중의 작은 값이 잡힌다 — 실측으로 430폭 카드가 207px 로 나왔는데
    //    실제는 296px 이었다(그 값으로 '카드 옆 빈 띠'를 계산하면 있지도 않은 자리를 있다고 믿는다).
    await page.waitForTimeout(600);
    Object.assign(setup, await page.evaluate((slot) => {
        const app = document.getElementById('app').getBoundingClientRect();
        const cell = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${slot}"]`);
        const sheet = document.getElementById('equip-sheet').getBoundingClientRect();
        const cb = cell.getBoundingClientRect();
        const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left - app.left, r: b.right - app.left, t: b.top - app.top, b: b.bottom - app.top }; };
        return {
            cellW: cb.width, cellH: cb.height,
            cx: cb.left - app.left + cb.width / 2, cy: cb.top - app.top + cb.height / 2,
            floorY: sheet.bottom - app.top, appW: app.width,
            card: R(document.querySelector('.modal:not(.hidden) .modal-card')),
            // 버튼줄 = 팝업에서 반드시 눌러야 하는 자리. 여기가 가려지면 화면이 고장 나 보인다.
            btns: [...document.querySelectorAll('#craft-modal .row .btn')].map(R),
            // 판정선은 코드가 소유한 상수에서 만든다(손으로 베끼면 코드를 고친 뒤에도 옛 값으로 잰다)
            FLY: UI.EQSW_FLY_MS, LAND_K: UI.EQSW_LAND_K, SNAP: UI.EQSW_SNAP_MS, DELAY: UI.EQSW_SNAP_DELAY,
            SHRINK: UI.EQSW_SHRINK,
        };
    }, setup.slot));
    ok(setup.sameSlot, `같은 부위 옛/새 장비 세팅 (slot=${setup.slot})`);
    console.log(`      셀 ${setup.cellW.toFixed(1)}x${setup.cellH.toFixed(1)} @(${setup.cx.toFixed(1)},${setup.cy.toFixed(1)}) · 바닥 y=${setup.floorY.toFixed(1)}`);
    console.log(`      코드 상수: 비행 ${setup.FLY}ms · 착지 ${(setup.FLY * setup.LAND_K).toFixed(0)}ms · 딸깍 ${setup.DELAY}~${setup.DELAY + setup.SNAP}ms · 축소 ${setup.SHRINK}`);
    console.log(`      팝업 카드 x ${setup.card.l.toFixed(1)}~${setup.card.r.toFixed(1)} (폭 ${(setup.card.r - setup.card.l).toFixed(1)}) · 좌우 여백 ${setup.card.l.toFixed(1)} / ${(setup.appW - setup.card.r).toFixed(1)}`);

    // ---- 연출을 태우고 연속 프레임으로 표본 채취 ----
    const total = setup.FLY + 300;
    const step = 12;
    await page.evaluate(() => UI.resolveCraft('equip'));
    const frames = [];
    const t0 = Date.now();
    while (Date.now() - t0 < total) {
        frames.push(await page.evaluate((slot) => {
            const app = document.getElementById('app').getBoundingClientRect();
            const layer = document.getElementById('equip-swap-fx');
            const box = layer && layer.querySelector('.eqsw-fly-box');
            const rot = layer && layer.querySelector('.eqsw-fly-r');
            const snap = layer && layer.querySelector('.eqsw-snap-box');
            const dust = layer && layer.querySelector('.eqsw-dust');
            const cell = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${slot}"]`);
            const cimg = cell && cell.querySelector('.cell-img');
            const rc = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left - app.left + b.width / 2, y: b.top - app.top + b.height / 2, w: b.width, h: b.height }; };
            // 회전각은 합성 행렬에서 뽑는다(요소가 회전만 맡으므로 atan2 로 바로 나온다)
            let deg = null;
            if (rot) {
                const m = new DOMMatrixReadOnly(getComputedStyle(rot).transform);
                deg = Math.atan2(m.b, m.a) * 180 / Math.PI;
            }
            return {
                t: performance.now(),
                fly: rc(box), deg,
                flyOpacity: box ? +getComputedStyle(box.parentElement.parentElement).opacity : null,
                snap: rc(snap),
                snapVisible: !!snap,
                dust: !!dust,
                hollow: !!(cell && cell.classList.contains('eqsw-hollow')),
                cellInkVisible: !!(cimg && getComputedStyle(cimg).visibility === 'visible'),
                layerKids: layer ? layer.children.length : 0,
            };
        }, setup.slot));
        await page.waitForTimeout(step);
    }
    // 뒷정리까지 지켜본다
    await page.waitForTimeout(400);
    const after = await page.evaluate((slot) => {
        const layer = document.getElementById('equip-swap-fx');
        const cell = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${slot}"]`);
        const cimg = cell && cell.querySelector('.cell-img');
        return {
            layerKids: layer ? layer.children.length : 0,
            hollow: !!(cell && cell.classList.contains('eqsw-hollow')),
            inkVisible: !!(cimg && getComputedStyle(cimg).visibility === 'visible'),
        };
    }, setup.slot);

    const flyF = frames.filter(f => f.fly);
    const t00 = frames[0].t;
    const rel = (f) => f.t - t00;

    // ---- ⑴ 던짐 ----
    ok(flyF.length >= 8, `옛 장비 타일이 떠 있는 프레임 ${flyF.length}개 (≥8)`);
    if (flyF.length >= 8) {
        const xs = flyF.map(f => f.fly.x), ys = flyF.map(f => f.fly.y);
        const dxTot = xs[xs.length - 1] - xs[0];
        ok(Math.abs(dxTot) >= setup.cellW * 0.7,
            `가로로 밀려난 거리 ${dxTot.toFixed(1)}px (≥ 셀폭의 0.7배 = ${(setup.cellW * 0.7).toFixed(1)}px)`);
        const outward = (setup.cx < setup.appW / 2) ? dxTot < 0 : dxTot > 0;
        ok(outward, `그리드 바깥쪽으로 날아갔다 (셀 x=${setup.cx.toFixed(0)} / 화면중앙 ${(setup.appW / 2).toFixed(0)} → dx=${dxTot.toFixed(1)})`);
        const landX = xs[xs.length - 1];
        // 착지 뒤 정지 구간 = 이 연출에서 그림이 **한참 남아 있는** 유일한 구간(378ms). 여기서
        // 팝업 버튼줄을 덮으면 화면이 고장 나 보인다 — 처음 구현이 [판매] 버튼 위에 얹혀 있었다.
        // 날아가는 도중 카드 위를 지나는 건 상관없다(움직이는 물건이라 궤적으로 읽힌다).
        const restF = flyF.filter(f => rel(f) >= setup.FLY * setup.LAND_K + 40);
        // 화면 밖(아래)으로 떨어뜨리는 좁은-화면 경로에서는 정지 프레임 자체가 없다 —
        // 그때는 '가릴 게 없다'가 맞는 답이라 통과다.
        const offscreen = restF.length === 0 || restF.every(f => f.fly.y - f.fly.h / 2 > setup.floorY);
        // 화면 밖 낙하는 '비켜설 자리가 아예 없을 때'만 쓰는 폴백이다. 참고 뷰포트 셋(430/390/360)은
        // 전부 카드 옆에 눕을 자리가 있으므로 여기서 폴백이 걸리면 자리 계산이 무너졌다는 뜻이다 —
        // 실제로 카드 폭을 잘못 재던 동안 **세 뷰포트가 전부 조용히 폴백으로 돌고 있었다**(착지도
        // 먼지도 착지음도 없는 채로 프로브는 통과했다). 그 침묵을 다시는 허용하지 않는다.
        ok(!offscreen, `바닥에 눕는다 — 화면 밖 낙하 폴백이 아니다`);
        const hitBtn = restF.filter(f => setup.btns.some(b =>
            f.fly.x + f.fly.w / 2 > b.l && f.fly.x - f.fly.w / 2 < b.r &&
            f.fly.y + f.fly.h / 2 > b.t && f.fly.y - f.fly.h / 2 < b.b));
        ok(setup.btns.length >= 2 && hitBtn.length === 0,
            `착지 뒤 팝업 버튼(${setup.btns.length}개)을 안 가린다 (겹친 프레임 ${hitBtn.length}/${restF.length}${offscreen ? ' · 화면 밖 낙하 경로' : ''})`);
        if (setup.card && !offscreen) {
            ok(landX > 0 && landX < setup.appW, `착지점이 화면 안 (x=${landX.toFixed(1)} ∈ 0~${setup.appW})`);
            const onCard = restF.filter(f => f.fly.x + f.fly.w / 2 > setup.card.l && f.fly.x - f.fly.w / 2 < setup.card.r);
            ok(onCard.length === 0,
                `착지점이 팝업 카드 옆 빈 띠 (카드 x ${setup.card.l.toFixed(0)}~${setup.card.r.toFixed(0)} / 착지 x=${landX.toFixed(1)} · 겹친 프레임 ${onCard.length}/${restF.length})`);
        } else if (offscreen) {
            console.log(`      (카드 좌우에 비켜설 자리가 없어 화면 밖으로 떨어뜨리는 경로 — 정지 프레임 0)`);
        }

        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        ok(yMin < ys[0] - 4, `먼저 솟았다 (최고점 y=${yMin.toFixed(1)} < 출발 ${ys[0].toFixed(1)} - 4)`);
        ok(yMax > ys[0] + setup.cellH, `그 뒤 바닥으로 떨어졌다 (최저점 y=${yMax.toFixed(1)} > 출발+셀높이 ${(ys[0] + setup.cellH).toFixed(1)})`);
        if (offscreen) {
            // 화면 밖 낙하 경로: 시트 바닥을 **지나쳐** 아래로 사라지는 게 맞는 답이다
            ok(yMax > setup.floorY, `화면 밖까지 떨어진다 (최저 y=${yMax.toFixed(1)} > 시트 바닥 ${setup.floorY.toFixed(1)})`);
        } else {
            ok(yMax <= setup.floorY + 2, `시트 바닥을 넘어가지 않는다 (최저 y=${yMax.toFixed(1)} ≤ 바닥 ${setup.floorY.toFixed(1)})`);
            ok(yMax >= setup.floorY - setup.cellH, `바닥까지 닿는다 (최저 y=${yMax.toFixed(1)} ≥ ${(setup.floorY - setup.cellH).toFixed(1)})`);
        }
        // 바운스 = 처음 바닥에 **닿은 뒤** 다시 올라간 프레임이 있다.
        // ⚠️ 기준점을 y 값으로 찾으면 안 된다(이 프로브가 두 번 밟은 함정) —
        //    ⓐ `indexOf(yMax)`: 정지점 y 와 착지점 y 가 같아서 **정지 뒤**를 기준으로 잡고 늘 0px.
        //    ⓑ `y >= yMax - 3`: 표본 간격 때문에 낙하 마지막 프레임이 바닥보다 5px 얕게 찍히면
        //       그 조건은 **첫 바운스가 끝난 뒤**에야 참이 돼 큰 튐을 통째로 놓치고 작은 튐만 잰다.
        //    그래서 값이 아니라 **모양**으로 찾는다: 최고점(apex) 이후 y 가 계속 커지다 처음
        //    꺾이는 자리가 최초 착지다. 표본이 어디에 떨어지든 같은 지점을 가리킨다.
        let iTouch = ys.indexOf(yMin);
        while (iTouch + 1 < ys.length && ys[iTouch + 1] >= ys[iTouch]) iTouch++;
        const rebound = yMax - Math.min(...ys.slice(iTouch));
        // 화면 밖으로 떨어뜨리는 경로는 바운스가 화면 밖에서 일어나 안 보인다 — 잴 대상이 아니다
        if (!offscreen) ok(rebound >= 5, `착지 뒤 되튄다 (최초 착지 ${iTouch}번 프레임 이후 ${rebound.toFixed(1)}px 되튐 ≥5)`);
        // 감쇠 = 두 번 튀되 두 번째가 더 작다.
        // ⚠️ 극값(local min)을 세면 안 된다 — 봉우리 꼭대기의 서브픽셀 흔들림(…615.0 614.5 613.8…)이
        //    한 번의 튐을 둘로 쪼개 `10.4 → 11.6 → 3.8` 처럼 '뒤가 더 크다'는 유령 실패를 낸다.
        //    대신 **바닥에서 떠 있던 연속 구간**(runs)으로 묶는다 — 흔들려도 한 구간은 한 번의 튐이다.
        const tail = ys.slice(iTouch);
        const runs = [];
        let air = null;
        for (const y of tail) {
            const d = yMax - y;
            if (d > 1.5) air = (air === null) ? d : Math.max(air, d);
            else if (air !== null) { runs.push(air); air = null; }
        }
        if (air !== null) runs.push(air);
        if (!offscreen) ok(runs.length >= 2 && runs[0] > runs[1],
            `감쇠 바운스 2회 (튐 높이 ${runs.map(p => p.toFixed(1)).join(' → ')}px — 뒤가 더 작아야 한다)`);

        // 회전 — 프레임 간 각도차를 누적한다(atan2 는 ±180 에서 감기므로 언랩)
        const degs = flyF.map(f => f.deg).filter(d => d !== null);
        let spin = 0;
        for (let i = 1; i < degs.length; i++) {
            let d = degs[i] - degs[i - 1];
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            spin += d;
        }
        ok(Math.abs(spin) >= 330, `회전 총각 ${spin.toFixed(0)}° (≥330° — 한 바퀴 가까이 돈다)`);
        ok((spin < 0) === (dxTot < 0), `회전 방향이 날아가는 방향과 같다 (spin=${spin.toFixed(0)}° / dx=${dxTot.toFixed(1)})`);

        // 착지 순간까지 불투명해야 한다(coinFlyY 가 밟았던 '날아가는 내내 서서히 투명' 함정)
        const landT = setup.FLY * setup.LAND_K;
        const atLand = flyF.filter(f => rel(f) >= landT - 60 && rel(f) <= landT + 60).map(f => f.flyOpacity);
        ok(atLand.length > 0 && Math.min(...atLand) > 0.9,
            `착지 순간 불투명 (opacity 최소 ${atLand.length ? Math.min(...atLand).toFixed(2) : 'n/a'} > 0.9)`);
    }
    // 먼지는 '바닥에 닿았다'의 단서 — 화면 밖으로 떨어뜨리는 경로에는 닿는 바닥이 없어 안 뜬다
    const wentOff = flyF.length >= 8 && flyF.filter(f => rel(f) >= setup.FLY * setup.LAND_K + 40)
        .every(f => f.fly.y - f.fly.h / 2 > setup.floorY);
    if (!wentOff) ok(frames.some(f => f.dust), `착지 먼지가 떴다`);
    else ok(!frames.some(f => f.dust), `화면 밖 낙하 경로에는 먼지가 안 뜬다`);
    const dustT = frames.filter(f => f.dust).map(rel);
    if (dustT.length) {
        const landT = setup.FLY * setup.LAND_K;
        ok(dustT[0] >= landT - 90 && dustT[0] <= landT + 120,
            `먼지 시점 ${dustT[0].toFixed(0)}ms 가 착지 시각 ${landT.toFixed(0)}ms 근처`);
    }

    // ---- ⑵ 빈 소켓 ----
    const hollowF = frames.filter(f => f.hollow);
    ok(hollowF.length >= 2, `칸이 빈 소켓이던 프레임 ${hollowF.length}개 (≥2)`);
    const blindF = frames.filter(f => !f.cellInkVisible && !f.snapVisible);
    ok(blindF.length >= 1, `새 장비가 아직 안 보이는 '빈 칸' 구간 ${blindF.length}프레임 (딸깍 전)`);
    ok(!frames.some(f => f.cellInkVisible && f.snapVisible),
        `원본 칸과 딸깍 복제본이 동시에 보이는 프레임 없음 (겹쳐 그림 0)`);

    // ---- ⑶ 딸깍 ----
    const snapF = frames.filter(f => f.snap);
    ok(snapF.length >= 3, `딸깍 복제 타일 프레임 ${snapF.length}개 (≥3)`);
    if (snapF.length >= 3) {
        const t1 = rel(snapF[0]);
        ok(t1 >= setup.DELAY - 80 && t1 <= setup.DELAY + 140,
            `딸깍 시작 ${t1.toFixed(0)}ms 가 코드값 ${setup.DELAY}ms 근처 (옛 것이 나간 뒤)`);
        const scales = snapF.map(f => f.snap.w / setup.cellW);
        ok(Math.min(...scales) < 0.85, `위에서 작게 떨어져 들어온다 (최소 배율 ${Math.min(...scales).toFixed(3)} < 0.85)`);
        ok(Math.max(...scales) > 1.06, `홈에 걸리며 오버슈트한다 (최대 배율 ${Math.max(...scales).toFixed(3)} > 1.06)`);
        const last = scales[scales.length - 1];
        ok(Math.abs(last - 1) < 0.09, `마지막엔 제자리 크기로 수렴 (${last.toFixed(3)} ≈ 1)`);
        // 위에서 내려앉는다 = 첫 프레임의 중심이 칸 중심보다 위
        ok(snapF[0].snap.y < setup.cy - 2, `위에서 내려앉는다 (시작 y=${snapF[0].snap.y.toFixed(1)} < 칸 중심 ${setup.cy.toFixed(1)})`);
        const endY = snapF[snapF.length - 1].snap.y;
        ok(Math.abs(endY - setup.cy) < 4, `제 칸 자리에 앉는다 (끝 y=${endY.toFixed(1)} ≈ ${setup.cy.toFixed(1)})`);
    }

    // ---- 뒷정리 ----
    ok(after.layerKids === 0, `연출 뒤 레이어가 비었다 (남은 노드 ${after.layerKids}개)`);
    ok(!after.hollow, `연출 뒤 칸에 eqsw-hollow 가 안 남는다`);
    ok(after.inkVisible, `연출 뒤 새 장비 그림이 보인다`);

    // ---- 판매 경로에는 안 붙는다(교체가 아니다) ----
    const sellSide = await page.evaluate(() => {
        const it = Forge.craft(1)[0];
        UI._autoSeq = null;
        UI.setPendingCraft(it); UI.showCraftModal(it);
        UI.doResolveCraft('sell');
        const layer = document.getElementById('equip-swap-fx');
        return layer ? layer.querySelectorAll('.eqsw-fly, .eqsw-snap').length : 0;
    });
    ok(sellSide === 0, `판매 경로에는 교체 연출이 안 붙는다 (노드 ${sellSide}개)`);

    // ---- 빈 부위 첫 장착도 교체가 아니다 ----
    await page.waitForTimeout(300);
    const emptySide = await page.evaluate(() => {
        const slots = (typeof SLOTS !== 'undefined') ? SLOTS : [];
        let it = Forge.craft(1)[0];
        for (const s of slots) delete S.equipment[s];
        UI.renderEquipSheet();
        UI._autoSeq = null;
        UI.setPendingCraft(it); UI.showCraftModal(it);
        UI.doResolveCraft('equip');
        const layer = document.getElementById('equip-swap-fx');
        return layer ? layer.querySelectorAll('.eqsw-fly, .eqsw-snap').length : 0;
    });
    ok(emptySide === 0, `빈 부위 첫 장착에는 연출이 안 붙는다 (노드 ${emptySide}개)`);

    // ---- 팝업이 닫힌 경로(자동 제련 시퀀스)는 피할 카드가 없다 ----
    // `doResolveCraft` 는 auto 일 때 팝업을 먼저 닫고 연출을 태운다 — 그때는 장비 시트가 통째로
    // 보이므로 착지 자리를 비틀 이유가 없다. 여기서 block 이 남아 있으면 닫힌 팝업을 피하느라
    // 멀쩡한 자리를 버리게 된다.
    const closedBlock = await page.evaluate(() => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const slot = (typeof SLOTS !== 'undefined') ? SLOTS[0] : 'weapon';
        if (!S.equipment[slot]) { let g = Forge.craft(1)[0]; for (let i = 0; i < 400 && g.slot !== slot; i++) g = Forge.craft(1)[0]; S.equipment[slot] = g; UI.renderEquipSheet(); }
        const fx = UI.grabEquipSwapFx(slot);
        return fx ? (fx.block === null ? 'null' : JSON.stringify(fx.block)) : 'nofx';
    });
    ok(closedBlock === 'null', `팝업이 닫혀 있으면 착지 제약이 없다 (block=${closedBlock})`);

    // ---- 연속 프레임 시트(육안 확인용) ----
    if (SHOT) {
        await page.evaluate(() => {
            const slots = (typeof SLOTS !== 'undefined') ? SLOTS : [];
            const it = Forge.craft(1)[0];
            let old = Forge.craft(1)[0];
            for (let i = 0; i < 80 && old.slot !== it.slot; i++) old = Forge.craft(1)[0];
            for (const s of slots) if (!S.equipment[s]) S.equipment[s] = Forge.craft(1)[0];
            S.equipment[it.slot] = old;
            UI.renderEquipSheet();
            UI._autoSeq = null;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            window.__fireSwap = () => UI.resolveCraft('equip');
        });
        await page.waitForTimeout(400);
        // ⚠️ 목표 시각을 정해 놓고 `waitForTimeout` 으로 맞추면 안 된다 — 헤드리스 스크린샷 한 장이
        //    60~150ms 씩 먹어서 이름표의 시각과 실제 찍힌 시각이 갈수록 벌어진다(그럼 '언제 뭐가
        //    보였나'를 그 시트로 못 따진다). 최대한 빨리 연달아 찍고 **실제 경과 시각을 파일명에** 적는다.
        const shotT0 = Date.now();
        await page.evaluate(() => window.__fireSwap());
        const shots = [];
        for (let i = 0; i < 11; i++) {
            const at = Date.now() - shotT0;
            await page.screenshot({ path: `${__dirname}/equip-swap-${String(at).padStart(4, '0')}ms.png` });
            shots.push(at);
            if (Date.now() - shotT0 > setup.FLY + 120) break;
        }
        console.log(`저장: tools/equip-swap-*ms.png (실제 시각 ${shots.join(', ')}ms)`);
    }

    ok(errors.length === 0, `콘솔·페이지 에러 0건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    await browser.close();

    console.log(`\n${fails.length ? `실패 ${fails.length}건` : '전부 통과'}`);
    if (fails.length) { fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
})();
