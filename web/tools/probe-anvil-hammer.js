// 모루 망치질 검증 — 사용자 지시 2026-08-18 `anvil-hammer-fx`
//   "망치 이미지 더 커야 하고, 지금 손잡이로 망치질하고 있음. 망치 머리로 내리쳐야 함."
//
// 무엇을 재나:
//  ① **머리로 친다**: 타격 프레임에서 망치 '타격면 중심'이 모루 상판 접점과 붙어 있고(거리 임계 이내),
//     손잡이 끝(그립 butt)보다 **아래**에 있다. 손잡이로 치면 이 부호가 뒤집힌다.
//  ② **머리가 손잡이보다 낮다 + 상판 안에 든다**: 타격면이 상판 사각형(윗면 폴리곤) 안쪽 x 범위에 있다.
//  ③ **더 커졌다**: 망치 전체 화면 폭이 모루 폭 대비 일정 비율 이상(이모지 때 ≈0.30 → 기준 0.42).
//  ④ 들어올린 프레임에서는 머리가 상판보다 확실히 위(떠 있음)로 간다 — 안 그러면 '내리치는' 느낌이 없다.
//  ⑤ 콘솔 에러 0.
//
// 프레임 샘플링은 rAF에 기대지 않고 Web Animations API로 currentTime을 직접 물려 고정한다
// (이 스케줄 환경은 swiftshader라 rAF 간격 중앙값이 250ms — 24%/57%/90% 프레임을 못 잡는다).
//
// 사용: node probe-anvil-hammer.js [출력디렉터리]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || '.';
// 🚨 **타격 퍼센트를 어디에도 두 번 적지 않는다.** 예전엔 ⑫ ⑪ ⑮ 가 각자 `[24, 52.5, 90]` 을
//    손으로 들고 있었다 — 3초 확대(anvil-anim-3s-juicy) 때 FRAMES 만 고치고 이것들을 안 고쳐서
//    세 검사가 **엉뚱한 프레임을 재고 전부 FAIL** 을 냈다(TODO '함정 ④' 그대로). 한 곳에서 뽑는다.
const hitPcts = () => FRAMES.filter(f => f.kind === 'hit').map(f => f.pct);

const VP = { width: 390, height: 844 };
// ⚠️ 총 길이는 **페이지에서 읽는다**(부팅 뒤 대입) — 1500ms 축소(anvil-anim-3s-juicy 재오픈) 때
//    여기 3000 이 남아 있으면 프로브 전체가 낡은 클럭으로 재고 판정이 통째로 무효가 된다(함정 ④).
let DUR = 1500;
// afswing 키프레임의 타격/윈드업 지점(%). 타격 %는 `UI.ANVIL_HITS` 에서 되풀어 쓰고(부팅 뒤 갱신),
// 윈드업 정점만 키프레임 상수다.
const FRAMES = [
    { name: 'wind1', pct: 10.0, kind: 'up' },    // 🚨 1타 예비동작 — 여기가 비어 있어 위계가 2단이었다
    { name: 'hit1', pct: 20.0, kind: 'hit' },
    { name: 'wind2', pct: 33.333, kind: 'up' },
    { name: 'hit2', pct: 43.333, kind: 'hit' },  // 등간격(메트로놈)을 깨려고 간격을 1.29배로 벌렸다
    { name: 'wind3', pct: 60.0, kind: 'up' },
    { name: 'hit3', pct: 73.333, kind: 'hit' },
];

async function waitBooted(page, timeout = 25000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    let fail = 0;
    const page = await browser.newPage({ viewport: VP });
    page.on('pageerror', e => errs.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(INDEX);
    await waitBooted(page);

    // 장비 시트를 열고 해머를 넉넉히 준 뒤 모루를 친다
    await page.evaluate(() => {
        S.hammers = 50;
        UI.openTab && UI.openTab('room');
        UI.renderEquipSheet && UI.renderEquipSheet();
    });
    await page.waitForTimeout(300);
    // 생성원(UI)에서 클럭을 되풀어 온다 — 상수를 손으로 베껴 두면 코드가 바뀐 뒤 유령 판정이 나온다
    {
        const clk = await page.evaluate(() => ({ dur: UI.ANVIL_FX_MS, hits: UI.ANVIL_HITS }));
        DUR = clk.dur;
        clk.hits.forEach((t, h) => { const f = FRAMES.find(x => x.name === 'hit' + (h + 1)); if (f) f.pct = t / clk.dur * 100; });
        console.log(`(클럭 ${DUR}ms · 타격 ${clk.hits.join('/')}ms = ${clk.hits.map(t => (t / clk.dur * 100).toFixed(3)).join('/')}%)`);
    }
    const hasBtn = await page.evaluate(() => !!document.querySelector('.anvil-btn .anvil-svg'));
    if (!hasBtn) { console.log('FAIL 모루 버튼(.anvil-btn .anvil-svg)을 찾지 못함'); await browser.close(); process.exit(1); }

    await page.evaluate(() => { UI.playAnvilStrike(() => {}); });
    await page.waitForTimeout(60);
    // 연출 종료 타이머(720ms)가 오버레이를 걷어가면 측정할 대상이 사라진다 — 타이머만 끊고 노드는 남긴다
    await page.evaluate(() => { (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = []; });

    // 애니메이션을 정지시켜 원하는 프레임을 정확히 물린다
    const ready = await page.evaluate(() => {
        const g = document.querySelector('.anvil-fx .af-hammer');
        if (!g) return false;
        document.querySelectorAll('.anvil-fx *').forEach(n => n.getAnimations().forEach(a => a.pause()));
        return g.getAnimations().length > 0;
    });
    if (!ready) { console.log('FAIL .af-hammer 스윙 애니메이션이 잡히지 않음'); await browser.close(); process.exit(1); }

    // 로컬(망치 프레임) 점 → 화면 좌표. 모루 상판 접점도 모루 SVG의 CTM으로 같이 뽑는다.
    const measureAt = async (pct) => page.evaluate(({ pct, hitPctsIn }) => {
        const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
        // ⚠️ 두 가지를 같이 고쳐야 접점이 제대로 측정된다.
        //  ⑴ `.anvil-fx *` 만 멈추면 **모루(.anvil-svg)의 anvilbump 이 빠진다** — 접점 검사가
        //     '타격 프레임의 망치 vs 아무 위상의 모루'를 재게 되어 이격이 있어도 1px 대로 나온다.
        //  ⑵ 더 고약한 것: `anvilbump` 은 fill 이 없는 .72s 애니메이션이라 **측정 시점엔 이미 끝나
        //     getAnimations() 에서 사라진다.** 그러면 currentTime 을 아무리 넣어도 모루는 정지
        //     상태 그대로고, 측정값이 '연출을 언제 시작했는지'에 따라 달라진다(같은 코드에서
        //     0.4px 과 4.5px 이 둘 다 나왔다 — 프로브가 흔들리고 있었다).
        //     그래서 매 측정마다 연출을 **다시 걸어** 모든 애니메이션을 살아 있는 상태로 만든다.
        //  ⑶ ⚠️ 그냥 cancel→play 로는 **재시작되지 않는다**. `.striking` 을 뗐다가 같은 태스크에서
        //     다시 붙이면 스타일 재계산이 사이에 없어 브라우저는 클래스가 바뀐 적이 없는 것으로
        //     보고 anvilbump 을 끝난 상태 그대로 둔다(고전적인 CSS 애니메이션 재시작 함정).
        //     그래서 제거와 재부착 사이에 리플로우를 강제로 한 번 끼운다.
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        document.getElementById('equip-sheet').getBoundingClientRect();   // ← 이 한 줄이 재시작을 만든다
        UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
        document.getElementById('equip-sheet').getBoundingClientRect();   // 스타일 해석 강제 → 애니메이션 생성
        const g = document.querySelector('.anvil-fx .af-hammer');
        document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
        const inner = g.querySelector('g');            // translate(55,14) rotate(-20) 배치 그룹
        const svg = document.querySelector('.anvil-fx');
        const anv = document.querySelector('.anvil-btn .anvil-svg');
        const map = (el, x, y) => {
            const p = el.ownerSVGElement.createSVGPoint(); p.x = x; p.y = y;
            return p.matrixTransform(el.getScreenCTM());
        };
        // 랜드마크는 HAMMER_SVG 의 로컬 좌표를 그대로 가리킨다 — 조형을 바꾸면 여기도 같이 옮길 것.
        // (2026-08-18 크로스핀 재조형 3차: 핀 끝 y -31.6 → -36.2 — 핀:몸통 2.6:1 → 1.7:1)
        const face = map(inner, 0, 0.9);          // 타격면 중심
        // 타격면 **양 끝**과 상판 윗면 능선(23,4)-(90,3) — 면이 상판과 나란한지 재려면 중심만으로는
        // 부족하다(중심이 붙어 있어도 기울면 한쪽 모서리로 찍는다).
        const faceLp = map(inner, -11.6, 0.9), faceRp = map(inner, 11.6, 0.9);
        const topA = (() => { const p = anv.createSVGPoint(); p.x = 23; p.y = 4; return p.matrixTransform(anv.getScreenCTM()); })();
        const topB = (() => { const p = anv.createSVGPoint(); p.x = 90; p.y = 3; return p.matrixTransform(anv.getScreenCTM()); })();
        const butt = map(inner, 53, -12.8);       // 손잡이 끝(그립 노브)
        const peen = map(inner, 0, -36.2);        // 머리 반대편(크로스 핀) 끝
        // 🚨 접점은 상판이 아니라 **빌릿 윗면**이다(대장장이는 맨 모루면을 치지 않는다).
        //    좌표를 손으로 베껴 두면 안 된다 — 빌릿은 타격마다 눌리므로(anvilbillet) 윗면이
        //    프레임마다 다른 곳에 있다. `.anv-billet` 의 CTM 으로 매핑하면 **모루 침하 +
        //    빌릿 압축이 둘 다 들어간 실제 위치**가 나온다(TODO '함정 ④ 프로브가 자가 코드보다
        //    낡으면 판정 전부가 무효' — 상수를 베끼면 정확히 그 함정이다).
        //    ⚠️ x 도 상수가 아니다 — 타격마다 때리는 자리가 걸어간다(`UI.ANVIL_HIT_DX`, 비평가 ⓞ).
        //    여기서도 **생성원에서 읽는다**(함정 ④). 이 pct 가 몇 번째 타격인지는 hitPcts 로 되푼다.
        const bil = anv.querySelector('.anv-billet');
        const hIdx = hitPctsIn.indexOf(pct);
        const hitDx = hIdx >= 0 ? UI.ANVIL_HIT_DX[hIdx] : 0;
        // 🚨 **x 와 y 를 다른 CTM 에서 뽑는다 — 같은 걸로 뽑으면 틀린다.**
        //    y 는 빌릿 CTM(압축으로 윗면이 내려간 실제 높이). x 는 **모루 CTM** 이다.
        //    빌릿은 타격마다 가로로 퍼지는데(anvilbillet scaleX 1.40, 축은 중심 x=55) 그 스케일을
        //    접점 x 에 먹이면 중심에서 dx 만큼 떨어진 점이 dx×1.40 으로 밀려난다 — 그런데 **망치는
        //    빌릿의 퍼짐을 따라가지 않는다**(afswing 이 55+dx 에 놓는다). 실제로 dx 를 ±5.4 로
        //    벌리자마자 ⑫ hit3 이 1.66px 로 틀어져 이 오차가 드러났다(dx=0 이던 시절엔 두 CTM 의
        //    x 가 같아서 영영 안 보였다). 소성 변형은 소재가 퍼지는 것이지 **때리는 자리가 밀려나는
        //    것이 아니다.**
        const hitPt = (() => {                    // 접점: x = 모루 기준 55+dx, y = 빌릿 윗면(눌림 포함)
            const p = anv.createSVGPoint(); p.x = UI.ANVIL_HIT_X + hitDx; p.y = 11;
            const onAnvil = p.matrixTransform(anv.getScreenCTM());
            const onBillet = p.matrixTransform((bil || anv).getScreenCTM());
            return { x: onAnvil.x, y: onBillet.y };
        })();
        const topFaceL = (() => { const p = anv.createSVGPoint(); p.x = 12; p.y = 26; return p.matrixTransform(anv.getScreenCTM()); })();
        const topFaceR = (() => { const p = anv.createSVGPoint(); p.x = 95; p.y = 25; return p.matrixTransform(anv.getScreenCTM()); })();
        const hb = g.getBoundingClientRect();
        const ab = anv.getBoundingClientRect();
        return {
            face: { x: face.x, y: face.y }, butt: { x: butt.x, y: butt.y }, peen: { x: peen.x, y: peen.y },
            hit: { x: hitPt.x, y: hitPt.y }, faceL: topFaceL.x, faceR: topFaceR.x,
            faceLp: { x: faceLp.x, y: faceLp.y }, faceRp: { x: faceRp.x, y: faceRp.y },
            topA: { x: topA.x, y: topA.y }, topB: { x: topB.x, y: topB.y },
            hammerW: hb.width, hammerH: hb.height, anvilW: ab.width, anvilH: ab.height,
        };
    }, { pct, hitPctsIn: hitPcts() });

    const say = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };
    let sizeReported = false;

    const hitFaceX = [];
    for (const f of FRAMES) {
        const m = await measureAt(f.pct);
        // ⚠️ **모루 기준 상대 x 로 모은다**(절대 화면 x 가 아니라). 타격 프레임에는 sheetshake 가
        //    시트를 통째로 흔들고 anvilbump 이 모루를 눌러 좌우로 민다 — 절대 좌표로 재면 그
        //    흔들림이 '걸어간 거리'로 둔갑해 ㉑ 이 실제 dx 와 무관하게 통과/실패할 수 있다.
        if (f.kind === 'hit') hitFaceX.push(m.face.x - m.faceL);
        const d = Math.hypot(m.face.x - m.hit.x, m.face.y - m.hit.y);
        // ⚠️ 7%(6.4px) 는 너무 헐거웠다 — 모루가 눌려 내려가는 동안 망치가 제자리에 남아 **4.7px
        //    벌어진 채로도 통과**했다(비평가 두 명이 같은 이격을 1순위로 지목했다). 망치가 표면을
        //    따라 내려가게 고친 지금 실측이 0.1~0.9px 이므로 2.5% 로 조인다.
        const tol = m.anvilW * 0.025;
        if (!sizeReported) {
            sizeReported = true;
            const ratio = m.hammerW / m.anvilW;
            say(ratio >= 0.42, `③ 망치 크기: 폭 ${m.hammerW.toFixed(1)}px / 모루 ${m.anvilW.toFixed(1)}px = ${ratio.toFixed(2)} (기준 ≥0.42, 이모지 때 ≈0.30)`);
        }
        if (f.kind === 'hit') {
            say(d <= tol, `① ${f.name}: 타격면이 상판 접점에 붙음 — 거리 ${d.toFixed(1)}px (허용 ${tol.toFixed(1)}px)`);
            say(m.face.y > m.butt.y, `① ${f.name}: 머리가 손잡이 끝보다 아래 — face.y ${m.face.y.toFixed(1)} > butt.y ${m.butt.y.toFixed(1)}`);
            say(m.face.y > m.peen.y, `① ${f.name}: 타격면이 크로스 핀보다 아래(뒤집힘 아님) — ${m.face.y.toFixed(1)} > ${m.peen.y.toFixed(1)}`);
            say(m.face.x > m.faceL && m.face.x < m.faceR, `② ${f.name}: 타격면 x가 상판 폭 안 — ${m.face.x.toFixed(1)} ∈ (${m.faceL.toFixed(1)}, ${m.faceR.toFixed(1)})`);
            // ⑩ 타격면이 상판과 **나란한가**. 중심 거리만 재면 면이 기울어 한쪽 모서리로 찍고 있어도
            //    통과한다. 상판 윗면 능선의 기울기와 타격면 기울기의 차이를 각도로 낸다.
            //    (모루 상판은 이 2.5D 투영에서 거의 수평이다 — 능선 (23,4)→(90,3) = -0.85°)
            const degOf = (p, q) => Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
            const skew = degOf(m.faceLp, m.faceRp) - degOf(m.topA, m.topB);
            const lift = Math.abs(Math.hypot(m.faceRp.x - m.faceLp.x, m.faceRp.y - m.faceLp.y) * Math.sin(skew * Math.PI / 180));
            say(Math.abs(skew) <= 4, `⑩ ${f.name}: 타격면이 상판과 나란함 — 기울기차 ${skew.toFixed(1)}° (허용 ±4°, 면 양끝 높이차 ${lift.toFixed(1)}px)`);
        } else {
            const lift = m.hit.y - m.face.y;
            say(lift >= m.anvilH * 0.12, `④ ${f.name}: 들어올림 ${lift.toFixed(1)}px (기준 ≥ 모루높이의 12% = ${(m.anvilH * 0.12).toFixed(1)}px)`);
            say(m.face.y > m.butt.y, `④ ${f.name}: 들어올린 자세에서도 머리가 손잡이보다 아래 — ${m.face.y.toFixed(1)} > ${m.butt.y.toFixed(1)}`);
        }
        const btn = await page.$('.anvil-btn');
        await btn.screenshot({ path: path.join(OUT, `anvilhammer-${f.name}.png`) }).catch(() => {});
    }

    // ㉑ 🚨 **타격점이 세 번 다 같으면 안 된다** (비평가 4차 ⓞ: "타격점이 세 번 다 정확히 x=55 —
    //    대장장이는 소재를 옮긴다"). 같은 자리를 세 번 찍으면 리듬·세기를 아무리 벌려도 세 프레임이
    //    복사본으로 보인다. **굽 쪽 → 뿔 쪽으로 단조롭게 걸어가는지**를 못 박는다(왔다 갔다 하면
    //    '작업이 진행됐다'가 아니라 '흔들린다'로 읽힌다).
    //    ⚠️ 임계는 화면 폭 기준이다 — 모루 폭의 3% 미만이면 92px 에서 1픽셀 남짓이라 안 읽힌다.
    {
        const anvilW = (await measureAt(hitPcts()[0])).anvilW;
        const gap = anvilW * 0.03;
        const d1 = hitFaceX[1] - hitFaceX[0], d2 = hitFaceX[2] - hitFaceX[1];
        say(d1 >= gap && d2 >= gap,
            `㉑ 타격점이 굽→뿔로 걸어간다 — 상판 왼끝 기준 x ${hitFaceX.map(v => v.toFixed(1)).join(' → ')} (간격 ${d1.toFixed(1)}px, ${d2.toFixed(1)}px ≥ ${gap.toFixed(1)}px)`);
    }

    // ⑦ 이펙트 CSS 규칙이 **실제로 먹고 있는가**. 이게 없으면 style.css가 어디선가 깨져도
    //    (실제로 키프레임 교체 중 잉여 `}` 하나로 이후 규칙이 통째로 죽은 적이 있다) 기하 검사는
    //    전부 통과한다 — 망치 규칙은 깨진 지점보다 앞에 있기 때문이다. 링이 SVG 기본값
    //    (fill=black·stroke=none)으로 떨어지는 순간을 수치로 잡는다.
    const css = await page.evaluate(() => {
        const g = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { fill: c.fill, stroke: c.stroke, sw: c.strokeWidth }; };
        return { ring: g('.anvil-fx .af-ring'), flash: g('.anvil-fx .af-flash'), spark: g('.anvil-fx .af-spark') };
    });
    say(!!css.ring && css.ring.fill === 'none' && css.ring.stroke !== 'none',
        `⑦ 링 규칙 적용됨 — fill=${css.ring && css.ring.fill} stroke=${css.ring && css.ring.stroke} (기본값 fill:black/stroke:none이면 CSS가 깨진 것)`);
    say(!!css.flash && css.flash.fill !== 'rgb(0, 0, 0)', `⑦ 플래시 규칙 적용됨 — fill=${css.flash && css.flash.fill}`);
    // ⚠️ fill 이 url(#...) 이면 '검지 않다'만으로는 부족하다 — **가리키는 그라디언트가 없어도**
    //    이 검사는 통과하고 화면에서는 도형이 통째로 사라진다(paint server 미해결 = 안 그려짐).
    //    id 오타·defs 누락을 잡으려면 참조가 실제로 걸리는지까지 봐야 한다.
    const refs = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.anvil-fx *').forEach(n => {
            const f = getComputedStyle(n).fill || '';
            const m = f.match(/^url\(["']?#([^"')]+)/);
            if (m) out.push([m[1], !!(n.ownerSVGElement || document).querySelector(`#${CSS.escape(m[1])}`)]);
        });
        return out;
    });
    const dangling = refs.filter(r => !r[1]).map(r => '#' + r[0]);
    say(dangling.length === 0, `⑦ url() 채움 ${refs.length}건 전부 실제 paint server 로 해결됨${dangling.length ? ' — 끊긴 참조: ' + dangling.join(', ') : ''}`);

    // ⑧ 3타 위계는 **눈으로만 보면 회귀해도 안 잡힌다**('왜인지 밋밋'으로만 보인다). 링·플래시·
    //    섬광의 배율과 불티 개수가 타격마다 **엄격히 증가**하는지를 수치로 못 박는다.
    //    1·2타가 같으면 위계가 '약·약·강'의 2단이 되어 크레셴도로 읽히지 않는다.
    const tiers = await page.evaluate(() => {
        const num = (sel, prop, dflt) => {
            const e = document.querySelector(sel); if (!e) return null;
            const v = getComputedStyle(e).getPropertyValue(prop).trim();
            return v ? parseFloat(v) : dflt;
        };
        const sparks = [0, 1, 2].map(h => {
            // 불티는 클래스로 타격을 구분하지 않으므로 지연(--t)으로 묶는다.
            // ⚠️ 예전엔 이 지연을 [0.15, 0.39, 0.63] 으로 **손으로 베껴** 뒀다. 2타를 410 → 378ms 로
            //    당기자 --t 가 .370 이 되어 창(±0.02)을 벗어났고, 불티가 그대로인데도 '2타 0개'라는
            //    유령 실패가 났다 — TODO '함정 ④(프로브가 자가 코드보다 낡으면 판정이 무효)' 그대로다.
            //    이제 생성원(UI.ANVIL_HITS)에서 같은 식으로 되풀어 쓴다.
            const t = UI.ANVIL_HITS[h] / 1000 - 0.008;
            return [...document.querySelectorAll('.anvil-fx .af-spark')]
                .filter(n => Math.abs(parseFloat(n.style.getPropertyValue('--t')) - t) < 0.02).length;
        });
        return {
            ring: [0, 1, 2].map(h => num(`.anvil-fx .af-ring.h${h}`, '--afr', 2.4)),
            flash: [0, 1, 2].map(h => num(`.anvil-fx .af-flash.f${h}`, '--affs', 1)),
            star: [0, 1, 2].map(h => num(`.anvil-fx .af-star.s${h}`, '--afss', 1)),
            sparks,
        };
    });
    for (const [name, v] of Object.entries(tiers)) {
        const rising = v.every((x, i) => i === 0 || (x !== null && x > v[i - 1]));
        say(rising, `⑧ 3타 위계 ${name}: ${v.join(' < ')} — 타격마다 엄격히 증가`);
    }

    // ⑨ 🚨 불티가 실제로 **여러 방향으로** 날아가는가. 예전엔 회전을 `transform=` 프레젠테이션
    //    속성으로 줬는데 같은 요소의 CSS 애니메이션이 transform 을 덮어 **연출 시작과 동시에
    //    회전이 증발**했다 — 전부 수평 막대로 정렬돼 '재봉선'이 됐는데도 기하 검사는 전부
    //    통과했다(회전은 어느 검사 대상도 아니었다). 실제 렌더 행렬의 각도 분포를 본다.
    const spin = await page.evaluate(() => {
        const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
        document.querySelectorAll('.anvil-fx *').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = 700; }));
        const angs = [...document.querySelectorAll('.anvil-fx .af-spark')].map(n => {
            const m = new DOMMatrix(getComputedStyle(n).transform);
            return Math.atan2(m.b, m.a) * 180 / Math.PI;
        });
        return angs;
    });
    const uniq = new Set(spin.map(a => Math.round(a / 6)));
    say(spin.length > 0 && uniq.size >= 5,
        `⑨ 불티 진행 각도 ${uniq.size}종 (표본 ${spin.length}개, 6° 구간 기준 ≥5 — 전부 같은 각이면 회전이 덮인 것)`);
    say(!!css.spark && css.spark.fill !== 'rgb(0, 0, 0)', `⑦ 불티 규칙 적용됨 — fill=${css.spark && css.spark.fill}`);

    // ⑥ 오버레이 수명 ≥ 가장 늦게 끝나는 자식 애니메이션. 예전엔 둘 다 720ms라 **3타(가장 강해야 할
    //    타격)의 링·불티가 수명 20% 지점에서 잘려** 화면상 가장 약해 보였다 — 눈으로는 "왜인지 밋밋"
    //    으로만 보여 회귀해도 아무도 못 잡는다. 그래서 수치로 못 박는다.
    const life = await page.evaluate(() => {
        let end = 0;
        document.querySelectorAll('.anvil-fx *').forEach(n => n.getAnimations().forEach(a => {
            const t = a.effect.getTiming();
            end = Math.max(end, (Number(t.delay) || 0) + (Number(t.duration) || 0));
        }));
        return { lastEndMs: end, life: UI.ANVIL_FX_MS };
    });
    say(life.life >= life.lastEndMs,
        `⑥ 오버레이 수명 ${life.life}ms ≥ 마지막 자식 애니메이션 종료 ${life.lastEndMs}ms`);
    // 🚨 스펙이 두 번 뒤집혔다 — 900ms → 3초("1초 만에 끝나는데 3초는 걸리게") → **1.5초**
    //    ("전체 길이가 1.5초여야 함. 한 번 내려칠 때마다 1.5초 느낌인 것처럼 존나 김", 2026-08-19).
    //    3타 **전체**가 1.5초 안이어야 한다 — 타격 하나당이 아니다.
    say(life.life >= 1400 && life.life <= 1600, `⑥ 총 템포 ${life.life}ms = 1.5초 근방 (사용자 지시 2026-08-19)`);

    // ⑫ 🚨 **이펙트가 실제 접점에서 터지는가.** 망치만 상판 침하를 따라가게 고쳤더니 빛·불티는
    //    cy=14 에 남아 3타에서 진짜 접점보다 8.5px 위 허공에서 터졌다(비평가 B 2차 1순위).
    //    '망치가 접점에 붙었다'(①)만으로는 못 잡는 결함이라 이펙트 원점을 따로 잰다.
    for (const [h, pct] of hitPcts().map((p, i) => [i, p])) {
        const m = await page.evaluate(({ pct, h }) => {
            const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            document.getElementById('equip-sheet').getBoundingClientRect();
            UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            document.getElementById('equip-sheet').getBoundingClientRect();
            document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
            const anv = document.querySelector('.anvil-btn .anvil-svg');
            // ⑫ 도 ① 과 같은 기준점을 써야 한다 — 빌릿 윗면(눌림 포함)을 CTM 으로 직접 잡는다.
            const bil = anv.querySelector('.anv-billet');
            // ⚠️ ① 과 같은 규약 — 접점 x 는 타격마다 걸어가고(UI.ANVIL_HIT_DX, 생성원에서 읽는다),
            //    x 는 모루 CTM · y 는 빌릿 CTM 에서 뽑는다(① 의 긴 주석 참고).
            const hp = (() => {
                const p = anv.createSVGPoint(); p.x = UI.ANVIL_HIT_X + UI.ANVIL_HIT_DX[h]; p.y = 11;
                return { x: p.matrixTransform(anv.getScreenCTM()).x, y: p.matrixTransform((bil || anv).getScreenCTM()).y };
            })();
            const out = {};
            for (const [key, sel] of [['ring', `.af-ring.h${h}`], ['core', `.af-core.c${h}`], ['flash', `.af-flash.f${h}`]]) {
                const e = document.querySelector('.anvil-fx ' + sel);
                if (!e) continue;
                const p = e.ownerSVGElement.createSVGPoint();
                p.x = parseFloat(e.getAttribute('cx')); p.y = parseFloat(e.getAttribute('cy'));
                const q = p.matrixTransform(e.ownerSVGElement.getScreenCTM());
                out[key] = Math.hypot(q.x - hp.x, q.y - hp.y);
            }
            return out;
        }, { pct, h });
        const worst = Math.max(...Object.values(m));
        say(worst <= 1.5, `⑫ hit${h + 1}: 이펙트 원점이 실제 접점 위 — 최대 어긋남 ${worst.toFixed(2)}px (${Object.entries(m).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ')}, 허용 1.5px)`);
    }

    // ⑪ 🚨 **네이티브 92px 에서 '때렸다'가 실제로 밝은 픽셀로 존재하는가.** 확대 캡처에서 아무리
    //    화려해도 네이티브에서 밝은 픽셀이 없으면 플레이어는 타격을 못 본다 — 1차 채점에서
    //    "근백색 픽셀 1개, 이펙트로 볼 수 있는 픽셀 26개(창백한 살구색)"로 지목당한 항목이다.
    //    정지 프레임과 접촉 프레임을 같은 크롭으로 찍어 **차이**로 센다(배경 크림색 242,239,230 은
    //    임계 아래라 안 잡히지만, 차이로 재면 배경 가정 자체가 필요 없다).
    const pxAt = async (pct) => {
        await page.evaluate((pct) => {
            const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            document.getElementById('equip-sheet').getBoundingClientRect();
            UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            document.getElementById('equip-sheet').getBoundingClientRect();
            document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
        }, pct);
        const box = await page.locator('.anvil-btn').boundingBox();
        const clip = { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 20), width: box.width + 12, height: box.height + 24 };
        const buf = await page.screenshot({ clip });
        return page.evaluate(async (src) => {
            const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const x = c.getContext('2d'); x.drawImage(img, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data;
            let white = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i] >= 246 && d[i + 1] >= 243 && d[i + 2] >= 234) white++;
            return white;
        }, 'data:image/png;base64,' + buf.toString('base64'));
    };
    // ⑬ **꼬리가 정지 화면이 아닌가.** 3타 뒤 720~900ms 는 망치가 이미 퇴장해 예전엔 픽셀이
    //    통째로 안 변했다(연출의 20%가 정지 화면). 모루 잔진동으로 채웠는데, 이건 눈으로 보면
    //    '왜인지 밋밋'으로만 보여 회귀해도 못 잡는다 — 연속 프레임 간 변화 픽셀 수로 못 박는다.
    const tailShot = async (ms) => {
        await page.evaluate((ms) => {
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            document.getElementById('equip-sheet').getBoundingClientRect();
            UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            document.getElementById('equip-sheet').getBoundingClientRect();
            document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }));
        }, ms);
        const b = await page.locator('.anvil-btn').boundingBox();
        const buf = await page.screenshot({ clip: { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 } });
        return 'data:image/png;base64,' + buf.toString('base64');
    };
    // ⚠️ 창을 **총 길이에서 되풀어** 잡는다 — 760/840ms 상수를 두면 클럭이 바뀔 때마다 엉뚱한
    //    구간(3초판에서는 1·2타 사이의 조용한 자리)을 재고 '꼬리가 죽었다'는 유령 판정이 나온다.
    const tail0 = Math.round(DUR * 0.845), tail1 = Math.round(DUR * 0.935);
    const tailA = await tailShot(tail0), tailB = await tailShot(tail1);
    const tailDiff = await page.evaluate(async ([a, b]) => {
        const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const px = async (src) => { const im = await load(src); const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
            return x.getImageData(0, 0, c.width, c.height).data; };
        const A = await px(a), B = await px(b); let d = 0;
        for (let i = 0; i < A.length; i += 4)
            if (Math.abs(A[i] - B[i]) > 6 || Math.abs(A[i + 1] - B[i + 1]) > 6 || Math.abs(A[i + 2] - B[i + 2]) > 6) d++;
        return d;
    }, [tailA, tailB]);
    say(tailDiff >= 300, `⑬ 꼬리 구간(${tail0}→${tail1}ms) 변화 픽셀 ${tailDiff}개 (기준 ≥300 — 0이면 연출 끝자락이 정지 화면이다)`);

    // 🚨 예전에는 **3타만** 재서 '정지 → 접촉 +20' 이면 통과였다. 그 사이 1·2타는 근백색이
    //    0개·4개였는데도 검사는 초록이었다("1·2타 임팩트에 근백색이 10px·20px 뿐" — 비평가 A).
    //    92px 아이콘에서 '쾅'을 파는 건 근백색 면적이므로 **세 타격을 각각** 재고, 위계까지 본다.
    //    ⚠️ '평균 휘도가 정지보다 높은가'로 재면 안 된다 — 접촉 프레임은 회색 망치 머리가
    //    주황 상판을 가장 많이 덮는 프레임이라 구조적으로 어두울 수밖에 없고, 그걸 상쇄하려면
    //    화면이 하얗게 날아갈 만큼 블룸을 키워야 한다. 사람이 보는 건 평균이 아니라 **번쩍임**이다.
    // 타격 사이 기준 프레임 — 1·2타 정확히 가운데(망치는 화면에 있고 타격만 없다)
    const restPct = (hitPcts()[0] + hitPcts()[1]) / 2;
    const restPx = await pxAt(restPct);
    const hitPxs = [];
    for (const p of hitPcts()) hitPxs.push(await pxAt(p));
    hitPxs.forEach((v, h) => {
        say(v - restPx >= 5,
            `⑪ hit${h + 1}: 네이티브 92px 근백색 픽셀 +${v - restPx}개 (타격 사이 ${restPx} → 접촉 ${v}, 기준 +5 — 확대에서만 화려하면 소용없다)`);
    });
    say(hitPxs[0] < hitPxs[1] && hitPxs[1] < hitPxs[2],
        `⑪ 근백색 위계: ${hitPxs.join(' < ')} — 타격마다 엄격히 증가`);

    // ⑭ 🚨 **눌리는 건 빌릿이지 모루가 아니다.** 빌릿을 넣기 전에는 망치의 하중을 강철 모루가
    //    대신 먹어 상판이 세로로 11% 눌렸다 — 비평가 B 가 두 채점에서 모두 상위로 꼽은 '고무 모루'다.
    //    이건 눈으로 보면 '왜인지 물렁하다'로만 보여 회귀해도 못 잡으므로, **두 압축률의 비**로
    //    못 박는다. 빌릿(달군 쇠)이 모루(강철)보다 훨씬 많이 눌려야 한다.
    // ⑮ 같은 측정에서 3타 위계도 본다 — 압축이 타격마다 엄격히 깊어져야 '크레셴도'가 성립한다.
    const squash = await page.evaluate((HITP) => {
        const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
        const at = (pct) => {
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            document.getElementById('equip-sheet').getBoundingClientRect();
            UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            document.getElementById('equip-sheet').getBoundingClientRect();
            document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
            const anv = document.querySelector('.anvil-btn .anvil-svg');
            const bil = anv.querySelector('.anv-billet');
            // 빌릿 높이 = 윗면(55,11) ~ 밑면(55,19.7) 의 화면 거리. CTM 으로 재야 모루 침하와
            // 빌릿 압축이 둘 다 들어간 **실제** 높이가 나온다(상수를 베끼면 자가 코드보다 낡는다).
            const map = (el, x, y) => { const p = anv.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(el.getScreenCTM()); };
            const bt = map(bil, 55, 11), bb = map(bil, 55, 21.5);
            // 모루 전체 높이 = 상판 윗면 능선(55,4) ~ 받침 바닥(55,83)
            const at_ = map(anv, 55, 4), ab_ = map(anv, 55, 83);
            return { bil: Math.hypot(bb.x - bt.x, bb.y - bt.y), anv: Math.hypot(ab_.x - at_.x, ab_.y - at_.y) };
        };
        const rest = at(5);
        return HITP.map(p => {
            const m = at(p);
            // 🚨 **절대 px 로 잰다. 비율이 아니다.** 예전 이 검사는 압축을 %로 재서
            //    '빌릿 32% vs 모루 11%' 로 통과했지만, 실제 화면에서는 같은 프레임에 모루가
            //    5.6px 내려가고 빌릿은 1.4px 만 줄었다 — 눈은 비율이 아니라 **더 많이 움직인 쪽**을
            //    무른 물체로 읽으므로, 하중은 여전히 모루로 갔다(비평가 2인이 독립적으로 1순위).
            //    검사가 통과하는데 결함이 남아 있으면 그건 검사가 틀린 것이다.
            return { bil: rest.bil - m.bil, anv: rest.anv - m.anv };
        });
    }, hitPcts());
    squash.forEach((m, h) => {
        say(m.bil > m.anv * 1.4,
            `⑭ hit${h + 1}: 빌릿이 모루보다 **많이 움직인다** — 빌릿 ${m.bil.toFixed(2)}px vs 모루 ${m.anv.toFixed(2)}px (기준 1.4배, 절대 px)`);
    });
    say(squash[0].bil < squash[1].bil && squash[1].bil < squash[2].bil,
        `⑮ 빌릿 압축 위계: ${squash.map(m => m.bil.toFixed(2) + 'px').join(' < ')} — 타격마다 엄격히 깊어짐`);

    // ⑯ 🚨 **네이티브 92px 에서 빌릿이 실제로 보이는가.** 확대에서 아무리 그럴듯해도 92px 에서
    //    상판과 같은 주황이면 '상판에 찍힌 얼룩'이라 소재로 안 읽힌다(첫 시안이 정확히 그랬다).
    //    빌릿을 지운 프레임과 차분해 기여 픽셀을 센다 — 색 임계값을 안 쓰므로 배경 가정이 없다.
    const billetShot = async (hide) => {
        await page.evaluate((hide) => {
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            const b = document.querySelector('.anvil-btn .anv-billet');
            if (b) b.style.display = hide ? 'none' : '';
        }, hide);
        const bb = await page.locator('.anvil-btn').boundingBox();
        const buf = await page.screenshot({ clip: { x: bb.x, y: bb.y, width: bb.width, height: bb.height } });
        return 'data:image/png;base64,' + buf.toString('base64');
    };
    const withB = await billetShot(false), noB = await billetShot(true);
    await page.evaluate(() => { const b = document.querySelector('.anvil-btn .anv-billet'); if (b) b.style.display = ''; });
    const billetPx = await page.evaluate(async ([a, b]) => {
        const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const px = async (src) => { const im = await load(src); const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
            return x.getImageData(0, 0, c.width, c.height).data; };
        const A = await px(a), B = await px(b); let n = 0, strong = 0;
        for (let i = 0; i < A.length; i += 4) {
            const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
            if (d > 12) n++;
            if (d > 90) strong++;   // '있는 듯 마는 듯'이 아니라 형태로 읽히는 몫
        }
        return { n, strong };
    }, [withB, noB]);
    say(billetPx.n >= 120 && billetPx.strong >= 45,
        `⑯ 네이티브 92px 정지 프레임의 빌릿 기여 픽셀 ${billetPx.n}개(그중 뚜렷 ${billetPx.strong}개) — 기준 ≥120 / ≥45`);

    // ⑰ 🚨 **박자가 등간격이면 메트로놈이다.** 예전 172.8/410.4/648ms 는 간격이 237.6/237.6ms 로
    //    완벽히 같아 비평가 두 명이 독립적으로 "크레셴도가 안 들린다"고 꼽았다. 키프레임 텍스트를
    //    읽어 판정하면 안 된다 — 퍼센트를 옮겨 놓고 JS 의 ANVIL_HITS 를 안 옮기면(또는 그 반대)
    //    소리와 그림이 갈라지는데 텍스트 검사로는 둘 다 '고쳤다'로 보인다. 그래서 **망치 타격면의
    //    화면 y 를 5ms 간격으로 훑어 실제로 가장 깊이 내려간 시각 3개**를 찾는다(자가 코드보다
    //    낡을 수 없는 측정이다 — TODO '함정 ④').
    const beat = await page.evaluate(() => {
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        document.getElementById('equip-sheet').getBoundingClientRect();
        UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
        document.getElementById('equip-sheet').getBoundingClientRect();
        const anims = [...document.querySelectorAll('#equip-sheet, #equip-sheet *')]
            .flatMap(n => n.getAnimations());
        anims.forEach(a => a.pause());
        const g = document.querySelector('.anvil-fx .af-hammer');
        const inner = g.querySelector('g');
        const ys = [];
        const DUR = UI.ANVIL_FX_MS;   // 페이지 컨텍스트라 Node 쪽 DUR 이 안 보인다 — 생성원에서 읽는다
        for (let t = 0; t <= DUR; t += 5) {
            anims.forEach(a => { a.currentTime = Math.min(t, a.effect.getComputedTiming().endTime || t); });
            const p = inner.ownerSVGElement.createSVGPoint(); p.x = 0; p.y = 0.9;
            ys.push({ t, y: p.matrixTransform(inner.getScreenCTM()).y });
        }
        // 🚨 **꼬리의 평탄 구간을 타격으로 세면 안 된다.** 3초판에서는 afexit 이 2690ms 에 끝나고
        //    afswing 이 3000ms 까지 같은 자세를 붙잡으므로, 그 310ms 평탄 구간이 `y[i] >= 양옆`
        //    조건을 만족해 **4번째 타격**으로 잡혔다(망치는 화면 밖 높이 −74 유닛에 있는데도).
        //    타격은 '가장 깊이 내려간' 프레임이므로, 전체 깊이 범위의 위쪽 35% 안에 드는 극대만 센다.
        const yMin = Math.min(...ys.map(v => v.y)), yMax = Math.max(...ys.map(v => v.y));
        const deepEnough = yMax - (yMax - yMin) * 0.35;
        // 국소 최대(= 가장 깊이 내려간 프레임). 드웰 구간은 평평하므로 구간의 중앙을 잡는다.
        const peaks = [];
        for (let i = 1; i < ys.length - 1; i++) {
            if (ys[i].y >= ys[i - 1].y && ys[i].y >= ys[i + 1].y && ys[i].y >= deepEnough) {
                const last = peaks[peaks.length - 1];
                if (last && ys[i].t - last.end <= 60) { last.end = ys[i].t; last.y = Math.max(last.y, ys[i].y); }
                else peaks.push({ start: ys[i].t, end: ys[i].t, y: ys[i].y });
            }
        }
        return peaks.map(p => ({ t: p.start, y: p.y }));
    });
    const hits = await page.evaluate(() => UI.ANVIL_HITS);
    say(beat.length === 3, `⑰ 실측 타격 프레임 ${beat.length}개 (기대 3개) — ${beat.map(b => Math.round(b.t) + 'ms').join(' / ')}`);
    if (beat.length === 3) {
        const drift = beat.map((b, i) => Math.abs(b.t - hits[i]));
        say(Math.max(...drift) <= 25,
            `⑰ 소리(ANVIL_HITS ${hits.join('/')}ms)와 그림(${beat.map(b => Math.round(b.t)).join('/')}ms)이 같은 시각 — 최대 어긋남 ${Math.max(...drift)}ms (허용 25ms)`);
        const g1 = beat[1].t - beat[0].t, g2 = beat[2].t - beat[1].t;
        const ratio = Math.max(g1, g2) / Math.min(g1, g2);
        say(ratio >= 1.2,
            `⑰ 박자가 등간격이 아님 — 간격 ${g1}/${g2}ms = ${ratio.toFixed(2)}배 (기준 ≥1.2 — 1.0 이면 메트로놈)`);
    }

    // ⑱ 🚨 **머리에 잘록한 '목'이 있는가.** 위로 갈수록 단조 감소하는 테이퍼면 92px 에서 망치가
    //    아니라 **총알·체스 폰**으로 읽힌다(비평가 A 가 꼽은 조형 결함). 목에서 한 번 조였다가
    //    핀에서 다시 벌어져야 눈이 '머리 + 크로스핀'의 두 덩어리로 분절한다.
    //    path 의 `d` 문자열을 파싱하지 않는다 — 조형을 곡선으로 다시 그리면 정점이 사라져 검사만
    //    깨진다. `isPointInFill` 로 **실제 채움 영역**의 반폭을 y 마다 이분 탐색해 잰다.
    const neck = await page.evaluate(() => {
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
        const svg = document.querySelector('.anvil-fx');
        // 머리 = af-hammer 안에서 hmr-steel 로 채운 path
        const head = [...svg.querySelectorAll('.af-hammer path')]
            .find(p => (p.getAttribute('fill') || '').includes('hmr-steel'));
        if (!head) return null;
        const halfW = (y) => {              // 로컬 좌표계 기준 반폭(오른쪽)
            let lo = 0, hi = 20;
            const pt = svg.createSVGPoint();
            const inside = (x) => { pt.x = x; pt.y = y; return head.isPointInFill(pt); };
            if (!inside(0)) return 0;
            for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inside(mid)) lo = mid; else hi = mid; }
            return lo;
        };
        const prof = [];
        for (let y = -35.5; y <= 0; y += 0.5) prof.push({ y, w: halfW(y) });
        return prof;
    });
    if (!neck) { say(false, '⑱ 망치 머리 path(hmr-steel)를 찾지 못함'); }
    else {
        const face = Math.max(...neck.filter(p => p.y >= -3).map(p => p.w));       // 타격면
        const body = neck.filter(p => p.y >= -21 && p.y <= -8);                     // 몸통·아이
        const neckSeg = neck.filter(p => p.y >= -25 && p.y <= -21.5);               // 목
        const peen = neck.filter(p => p.y >= -34.5 && p.y <= -25.5);                // 크로스핀
        const bodyMin = Math.min(...body.map(p => p.w));
        const neckMin = Math.min(...neckSeg.map(p => p.w));
        const peenMax = Math.max(...peen.map(p => p.w));
        say(neckMin < bodyMin * 0.8,
            `⑱ 목이 몸통보다 잘록함 — 목 ${neckMin.toFixed(1)} < 몸통 최소 ${bodyMin.toFixed(1)} ×0.8 (단조 감소 테이퍼면 총알로 읽힌다)`);
        say(peenMax > neckMin * 1.4,
            `⑱ 목 위에서 핀이 다시 벌어짐 — 핀 ${peenMax.toFixed(1)} > 목 ${neckMin.toFixed(1)} ×1.4 (두 덩어리로 분절되는 유일한 단서)`);
        say(face > peenMax,
            `⑱ 타격면이 핀보다 넓음(뒤집힘 아님) — 타격면 ${face.toFixed(1)} > 핀 ${peenMax.toFixed(1)}`);
        // 🚨 **핀이 짧으면 체스 폰이다.** 폭만 봐서는 "목은 있는데 그 위가 뭉툭한 혹"인 조형을
        //    못 거른다 — 두 비평가가 독립적으로 실루엣을 '체스 폰 / 종'으로 읽은 상태가 정확히
        //    그랬다(핀 9유닛 vs 몸통 23.5 = 2.6:1). 목 위/아래 **길이 비**를 따로 못 박는다.
        const inked = neck.filter(p => p.w > 0.3).map(p => p.y);
        const tipY = Math.min(...inked), faceY = Math.max(...inked);
        const neckY = -23.5;
        const peenLen = neckY - tipY, bodyLen = faceY - neckY;
        say(bodyLen / peenLen <= 2.0,
            `⑱ 핀이 몸통 대비 충분히 길다 — 몸통 ${bodyLen.toFixed(1)} : 핀 ${peenLen.toFixed(1)} = ${(bodyLen / peenLen).toFixed(2)}:1 (기준 ≤2.0)`);
    }

    // ⑲ 🚨 **연출이 끝난 자리에 처음과 다른 물건이 남는가.** 비평가 B 의 총평이 이것이었다 —
    //    "3타가 끝난 자리에 처음과 다른 물건이 놓여 있어야 한다". 실측으로는 빌릿 심 휘도가
    //    194.0(0ms) → 194.4(860ms) 로 **세 번 두들긴 쇠가 처음과 똑같이 뜨거웠고**, 모양도
    //    균등 스케일 하나뿐이라 "막대가 조금 눌렸다"에서 멈췄다. 형태와 온도 **둘 다** 본다.
    // ⚠️ `anvilbillet` 은 `forwards` 라, 앞 검사가 남긴 채움 상태가 정지 프레임 측정에 그대로
    //    묻어 온다(실제로 '정지' 폭이 27.4px = 이미 1.36배 퍼진 값으로 찍혔다). 클래스를 떼는
    //    것만으로는 부족해 **애니메이션을 명시적으로 cancel** 하고 스타일을 flush 한 뒤 잰다.
    const before = await page.evaluate(() => {
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        const btn = document.querySelector('.anvil-btn');
        btn.classList.remove('striking');
        btn.querySelectorAll('*').forEach(n => n.getAnimations().forEach(a => a.cancel()));
        btn.getBoundingClientRect();
        const b = document.querySelector('.anvil-btn .anv-billet').getBoundingClientRect();
        return { w: b.width, h: b.height, x: b.x, y: b.y };
    });
    await page.waitForTimeout(60);
    const shotRect = async (r) => {
        const buf = await page.screenshot({ clip: { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.max(2, Math.ceil(r.w)), height: Math.max(2, Math.ceil(r.h)) } });
        return page.evaluate(async (src) => {
            const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
            const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const q = g.getImageData(0, 0, c.width, c.height).data;
            let sum = 0, n = 0;
            for (let i = 0; i < q.length; i += 4) { sum += Math.max(q[i], q[i + 1], q[i + 2]); n++; }
            return sum / n;
        }, 'data:image/png;base64,' + buf.toString('base64'));
    };
    const lumBefore = await shotRect(before);
    const after = await page.evaluate(() => {
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        document.getElementById('equip-sheet').getBoundingClientRect();
        UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
        document.getElementById('equip-sheet').getBoundingClientRect();
        document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
            n.getAnimations().forEach(a => { a.pause(); a.currentTime = UI.ANVIL_FX_MS - 40; }));
        const b = document.querySelector('.anvil-btn .anv-billet').getBoundingClientRect();
        return { w: b.width, h: b.height, x: b.x, y: b.y };
    });
    const lumAfter = await shotRect(after);
    say(after.w > before.w * 1.15,
        `⑲ 소재가 퍼졌다 — 폭 ${before.w.toFixed(1)}px → ${after.w.toFixed(1)}px (기준 ×1.15, 단조는 폭으로 흐른다)`);
    say(after.h < before.h * 0.8,
        `⑲ 소재가 납작해졌다 — 높이 ${before.h.toFixed(1)}px → ${after.h.toFixed(1)}px (기준 ×0.8)`);
    say(lumAfter < lumBefore - 6,
        `⑲ 소재가 식었다 — 빌릿 평균 휘도 ${lumBefore.toFixed(1)} → ${lumAfter.toFixed(1)} (기준 −6 이상; 같으면 '아무 일도 없었다'로 읽힌다)`);
    await page.evaluate(() => { UI.cancelAnvilStrike(); UI._anvilBusy = false; });

    // ⑳ 🚨 **1타 예비동작이 실제로 보이는가.** ④ 는 '들어올림 ≥ 모루 높이의 12%' 만 보므로,
    //    망치가 **투명한 채로** 높이 올라가 있어도 통과한다 — 실제로 예전 1타가 그랬다(0% opacity 0,
    //    9%에 이미 -18유닛까지 내려온 자리에서 알파를 켰다). 위계도 같이 본다: 예비동작이 1타에만
    //    없으면 크레셴도가 '없음 → 중 → 대'의 2단으로 읽힌다(비평가 A·B 공통).
    // 🚨 **여기에도 퍼센트를 손으로 적어 두면 안 된다(함정 ④ 재발).** 이 자리에는 `[8, 39.04, 71.38]`
    //    이 박혀 있었다 — 900ms 시절 값이라 3초판에서도 **엉뚱한 프레임**을 재고 있었고, 1.5초로
    //    조이자 정점이 아니라 되튐 구간을 집어 '위계가 거꾸로'라는 유령 FAIL 을 냈다.
    //    윈드업 정점은 위 FRAMES 의 `kind: 'up'` 한 곳에서만 온다.
    const winds = await page.evaluate((upPcts) => {
        const DUR = UI.ANVIL_FX_MS;   // ⚠️ 손으로 베끼지 말 것(함정 ④) — 생성원에서 읽는다
        UI.cancelAnvilStrike(); UI._anvilBusy = false;
        document.getElementById('equip-sheet').getBoundingClientRect();
        UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
        document.getElementById('equip-sheet').getBoundingClientRect();
        const anims = [...document.querySelectorAll('#equip-sheet, #equip-sheet *')].flatMap(n => n.getAnimations());
        anims.forEach(a => a.pause());
        const g = document.querySelector('.anvil-fx .af-hammer');
        const inner = g.querySelector('g');
        const anv = document.querySelector('.anvil-btn .anvil-svg');
        const bil = anv.querySelector('.anv-billet');
        const at = (pct) => {
            anims.forEach(a => { const t = DUR * pct / 100; a.currentTime = Math.min(t, a.effect.getComputedTiming().endTime || t); });
            const p = inner.ownerSVGElement.createSVGPoint(); p.x = 0; p.y = 0.9;
            const face = p.matrixTransform(inner.getScreenCTM());
            const q = anv.createSVGPoint(); q.x = 55; q.y = 11;
            const top = q.matrixTransform((bil || anv).getScreenCTM());
            return { lift: top.y - face.y, op: +getComputedStyle(g).opacity };
        };
        return upPcts.map(at);   // 각 타격의 윈드업 정점(FRAMES 에서 파생)
    }, FRAMES.filter(f => f.kind === 'up').map(f => f.pct));
    winds.forEach((w, h) => {
        say(w.op >= 0.95,
            `⑳ 윈드업${h + 1} 정점에서 망치가 **보인다** — opacity ${w.op.toFixed(2)} (기준 ≥0.95; 투명하면 올라가도 예비동작이 아니다)`);
    });
    say(winds[0].lift > 6 && winds[0].lift < winds[1].lift && winds[1].lift < winds[2].lift,
        `⑳ 예비동작 위계: ${winds.map(w => w.lift.toFixed(1) + 'px').join(' < ')} — 1타에도 실재하고 타격마다 커짐`);

    say(errs.length === 0, `⑤ 콘솔/페이지 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
