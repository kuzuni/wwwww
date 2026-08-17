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
        const g = document.querySelector('.anvil-fx .af-hammer');
        document.querySelectorAll('.anvil-fx *').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
        const inner = g.querySelector('g');            // translate(55,14) rotate(-20) 배치 그룹
        const svg = document.querySelector('.anvil-fx');
        const anv = document.querySelector('.anvil-btn .anvil-svg');
        const map = (el, x, y) => {
            const p = el.ownerSVGElement.createSVGPoint(); p.x = x; p.y = y;
            return p.matrixTransform(el.getScreenCTM());
        };
        const face = map(inner, 0, 0.9);          // 타격면 중심
        const butt = map(inner, 32.4, -13.4);     // 손잡이 끝(그립 butt)
        const peen = map(inner, 0, -26.5);        // 머리 반대편(크로스 핀) 끝
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
            hammerW: hb.width, hammerH: hb.height, anvilW: ab.width, anvilH: ab.height,
        };
    }, pct);

    const say = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };
    let sizeReported = false;

    for (const f of FRAMES) {
        const m = await measureAt(f.pct);
        const d = Math.hypot(m.face.x - m.hit.x, m.face.y - m.hit.y);
        const tol = m.anvilW * 0.07;   // 모루 폭의 7% 이내면 '접촉'으로 본다
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
        } else {
            const lift = m.hit.y - m.face.y;
            say(lift >= m.anvilH * 0.12, `④ ${f.name}: 들어올림 ${lift.toFixed(1)}px (기준 ≥ 모루높이의 12% = ${(m.anvilH * 0.12).toFixed(1)}px)`);
            say(m.face.y > m.butt.y, `④ ${f.name}: 들어올린 자세에서도 머리가 손잡이보다 아래 — ${m.face.y.toFixed(1)} > ${m.butt.y.toFixed(1)}`);
        }
        const btn = await page.$('.anvil-btn');
        await btn.screenshot({ path: path.join(OUT, `anvilhammer-${f.name}.png`) }).catch(() => {});
    }

    say(errs.length === 0, `⑤ 콘솔/페이지 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
    console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
