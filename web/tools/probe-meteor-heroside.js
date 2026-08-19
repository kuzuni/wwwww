// 운석이 **주인공 쪽(왼쪽) 하늘에서** 떨어지는가 (skill-fx-origin-hero-side 검증 도구)
//
// 사용자 지적: "메테오 떨어지는 거 보니까 주인공 방향에서 안 떨어지고 역방향으로 떨어지던데 그런 거 ㄴㄴ.
//              주인공이 쓴 스킬처럼 보여야 함. 적어도 방향이 주인공 쪽에서 시작해야 할 듯."
// 전장 축: 주인공 = 왼쪽(낮은 x), 적 = 오른쪽(높은 x). 종전 meteorStorm 은 낙하 시작 x 가
// `spot.x + 1.6`(적 뒤편 하늘)이라 적 쪽에서 주인공 쪽으로 날아오는 그림이었다.
//
// 판정: ① 모든 운석의 낙하 시작 x < 자기 착탄점 x (여유 1.0 이상 왼쪽)
//       ② 낙하 이동 방향이 +x(주인공→적 방향)
//       ③ 콘솔 에러 0건
//
// ⚠️ 계측 함정(TODO ③④ 그대로): rAF 가 안 도는 헤드리스라 setTimeout 을 즉시 실행으로 바꿔
//    진짜 코드가 진짜 인자로 돌게 하고, 시작/착탄 좌표는 **씬 add 훅**으로 생성 순간에 잡는다.
//    조준 링(meteorTell)과 돌(meteorRock)은 발마다 링→돌 순서로 붙으므로 순서로 짝을 만든다.
//
// 사용: node probe-meteor-heroside.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.scene && !!Scene3D.heroG').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }

    const res = await page.evaluate(() => {
        Scene3D.anims.length = 0;
        const pairs = [];            // { ring: spot.x, rock: start.x } — 발 순서대로
        let pendingRing = null;
        const realAdd = Scene3D.scene.add.bind(Scene3D.scene);
        Scene3D.scene.add = (...objs) => {
            for (const o of objs) {
                if (o.userData && o.userData.meteorTell) pendingRing = o.position.x;
                if (o.userData && o.userData.meteorRock) { pairs.push({ ring: pendingRing, rock: o.position.x, rockObj: o }); pendingRing = null; }
            }
            return realAdd(...objs);
        };
        const realST = window.setTimeout;
        window.setTimeout = function (fn) { try { fn(); } catch (e) {} return 0; };
        try {
            // 실전 경로: 살아 있는 적이 있으면 그 위로, 없으면 폴백(주인공 자리) — 어느 쪽이든 방향 판정은 같다
            const ids = [...Scene3D.enemyMap.keys()];
            Scene3D.skillEffect('meteor', 0xff7043, ids, { rarity: 'legendary' });
        } finally {
            window.setTimeout = realST;
        }
        // ② 이동 방향: 두어 프레임 흘려 돌이 +x 로 움직이는지 본다
        const x0 = pairs.map(p => p.rockObj.position.x);
        for (let i = 0; i < 6; i++) Scene3D.update(1 / 60);
        const dx = pairs.map((p, i) => p.rockObj.position.x - x0[i]);
        for (let i = 0; i < 240; i++) Scene3D.update(1 / 60);   // 잔여 연출 배수
        return {
            heroX: Scene3D.heroG.position.x,
            n: pairs.length,
            rows: pairs.map((p, i) => ({ ring: +p.ring.toFixed(2), rock: +p.rock.toFixed(2), dx: +dx[i].toFixed(3) })),
        };
    });

    let fail = 0;
    const bad = (m) => { fail++; console.log('  FAIL ' + m); };
    console.log(`운석 ${res.n}발 (주인공 x=${res.heroX.toFixed(2)})`);
    if (!res.n) bad('운석이 한 발도 안 생성됨');
    for (const r of res.rows) {
        console.log(`  착탄 x ${String(r.ring).padStart(6)} ← 시작 x ${String(r.rock).padStart(6)}  이동 dx ${r.dx}`);
        if (!(r.rock <= r.ring - 1.0)) bad(`시작 x ${r.rock} 가 착탄 x ${r.ring} 보다 1.0 이상 왼쪽(주인공 쪽)이 아님`);
        if (!(r.dx > 0)) bad(`낙하 이동이 +x(주인공→적)가 아님 (dx ${r.dx})`);
    }
    console.log('콘솔 에러: ' + errors.length);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
    if (errors.length) fail += errors.length;
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: 전건 PASS');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
