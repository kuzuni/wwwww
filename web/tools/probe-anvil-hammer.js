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

const VP = { width: 390, height: 844 };
const DUR = 720;
// afswing 키프레임의 타격/윈드업 지점(%)
const FRAMES = [
    { name: 'hit1', pct: 24, kind: 'hit' },
    { name: 'wind2', pct: 41, kind: 'up' },
    { name: 'hit2', pct: 57, kind: 'hit' },
    { name: 'wind3', pct: 74, kind: 'up' },
    { name: 'hit3', pct: 90, kind: 'hit' },
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
    const measureAt = async (pct) => page.evaluate((pct) => {
        const DUR = 720;
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
        // (2026-08-18 크로스핀 재조형 2차: 자루 노브 x 48.4→58, 핀 끝 y -31→-30.6, 평행 몸통 58%)
        const face = map(inner, 0, 0.9);          // 타격면 중심
        // 타격면 **양 끝**과 상판 윗면 능선(23,4)-(90,3) — 면이 상판과 나란한지 재려면 중심만으로는
        // 부족하다(중심이 붙어 있어도 기울면 한쪽 모서리로 찍는다).
        const faceLp = map(inner, -9.4, 0.9), faceRp = map(inner, 9.4, 0.9);
        const topA = (() => { const p = anv.createSVGPoint(); p.x = 23; p.y = 4; return p.matrixTransform(anv.getScreenCTM()); })();
        const topB = (() => { const p = anv.createSVGPoint(); p.x = 90; p.y = 3; return p.matrixTransform(anv.getScreenCTM()); })();
        const butt = map(inner, 53, -12.8);       // 손잡이 끝(그립 노브)
        const peen = map(inner, 0, -30.6);        // 머리 반대편(크로스 핀) 끝
        const hitPt = (() => {                    // 모루 상판 접점 (viewBox 55,14)
            const p = anv.createSVGPoint(); p.x = 55; p.y = 14;
            return p.matrixTransform(anv.getScreenCTM());
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
    }, pct);

    const say = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };
    let sizeReported = false;

    for (const f of FRAMES) {
        const m = await measureAt(f.pct);
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
            // 불티는 클래스로 타격을 구분하지 않으므로 지연(--t)으로 묶는다
            const t = [0.15, 0.39, 0.63][h];
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
        const DUR = 720;
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
    say(life.life <= 900, `⑥ 총 템포 ${life.life}ms ≤ 900ms (항목 스펙 0.6~0.9초)`);

    // ⑫ 🚨 **이펙트가 실제 접점에서 터지는가.** 망치만 상판 침하를 따라가게 고쳤더니 빛·불티는
    //    cy=14 에 남아 3타에서 진짜 접점보다 8.5px 위 허공에서 터졌다(비평가 B 2차 1순위).
    //    '망치가 접점에 붙었다'(①)만으로는 못 잡는 결함이라 이펙트 원점을 따로 잰다.
    for (const [h, pct] of [[0, 24], [1, 57], [2, 90]]) {
        const m = await page.evaluate(({ pct, h }) => {
            const DUR = 720;
            UI.cancelAnvilStrike(); UI._anvilBusy = false;
            document.getElementById('equip-sheet').getBoundingClientRect();
            UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            document.getElementById('equip-sheet').getBoundingClientRect();
            document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
            const anv = document.querySelector('.anvil-btn .anvil-svg');
            const hp = (() => { const p = anv.createSVGPoint(); p.x = 55; p.y = 14; return p.matrixTransform(anv.getScreenCTM()); })();
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
            const DUR = 720;
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
    const restPx = await pxAt(45);          // 타격 사이 정지 구간
    const hitPx = await pxAt(90);           // 3타 접촉
    say(hitPx - restPx >= 20,
        `⑪ 네이티브 92px 접촉 프레임의 근백색 픽셀 +${hitPx - restPx}개 (정지 ${restPx} → 접촉 ${hitPx}, 기준 +20 — 확대에서만 화려하면 소용없다)`);

    say(errs.length === 0, `⑤ 콘솔/페이지 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
