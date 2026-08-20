// 소환 결과 팝업 — **깊이 평면이 몇 겹인가** 실측. 사용: node tools/probe-sr-depth.js
//
// 왜: 10차 비평가 잔여 ② [2인 일치] "전경(피사체 앞) 평면이 0겹"(A ⓹ / B 축3).
// A 실측 근거는 두 가지였다: ⑴ 부유 파티클이 전 화면에 6~8개뿐 ⑵ 구체 **앞을** 가로지르는
// 요소가 NEW 배지·이름판뿐. 배경 빛가루(.sr-motes, z 1)를 아무리 늘려도 ⑵는 안 메워진다 —
// 깊이는 피사체 뒤가 아니라 **앞**에 무언가가 지날 때 생긴다.
//
// 그래서 이 프로브는 '파티클이 많은가'가 아니라 **'피사체 앞을 실제로 지나는가'**를 잰다:
//   G1 근평면(.sr-near)이 존재하고 스펙 범위 안인가 — 개수 10~14 · 크기 6~14px · 흐림 6~10px
//      · 알파 .25~.5 · 주기 3.5~6s (비평가 처방 그대로. 눈대중으로 흘리면 다음 회차에 또 지적된다)
//   G2 중간 평면(.sr-dust) 40~60개
//   G3 **교차 실측** — 실제 재생 중 근평면 광점이 구체(.sr-orbwrap) 상자와 겹치는 순간이 있고,
//      그 순간 근평면의 스택 순서가 그리드보다 위인가. 이게 이 지적의 본체다.
//   G4 화면에 동시에 보이는 부유 입자 수(A 가 6~8개라 한 값)의 개선
//
// ⚠️ 캡처 없이 DOM/기하만 본다(swiftshader 스크린샷은 장당 초 단위). 픽셀 쪽은 shot 캡처가 맡는다.
// ⚠️ 이 파일의 SAMPLER 는 템플릿 리터럴이다 — 주석에도 백틱을 쓰지 말 것(리터럴이 거기서 끊긴다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};
    // 🚨 부팅 오버레이(#boot-loading)를 지운다 — 소등이 CSS transition 이라 시크의
    // getAnimations() 일괄 pause 에 걸리면 t0 프레임이 통째로 로딩 화면이 된다(실제로
    // tl-*/t0000 두 세트가 그렇게 구워졌고, 11차 B 9번 't0000 이 완전히 같은 프레임'
    // 지적의 정체가 이것이다). 경쟁이라 회차마다 걸리기도 안 걸리기도 한다.
    const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`;
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

const CASES = [
    ['skill-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 14],
    ['skill-x75',   `S.summonCount = 5000; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 3],
];

const SPEC = `(() => {
    const m = UI.els.summonResultModal;
    const near = [...m.querySelectorAll('.sr-near > i')];
    const dust = [...m.querySelectorAll('.sr-dust > i')];
    const px = v => parseFloat(v) || 0;
    const blurOf = el => { const f = getComputedStyle(el).filter; const g = /blur\\(([\\d.]+)px\\)/.exec(f); return g ? +g[1] : 0; };
    const durOf = el => { const a = el.getAnimations()[0]; return a ? a.effect.getTiming().duration / 1000 : 0; };
    // ⚠️ 레이어가 아예 없는 빌드(= 수정 전)에서도 **크래시가 아니라 FAIL** 로 떨어져야 한다 —
    //    자가 예외로 죽으면 '못 떨어지는 자'인지 '통과한 것'인지 구분이 안 된다.
    const zOf = sel => { const el = m.querySelector(sel); return el ? +getComputedStyle(el).zIndex || 0 : -1; };
    return {
        nearN: near.length, dustN: dust.length,
        nearSize: near.map(e => px(getComputedStyle(e).width)),
        nearBlur: near.map(blurOf),
        nearAlpha: near.map(e => px(getComputedStyle(e).getPropertyValue('--a'))),
        nearDur: near.map(durOf),
        zNear: zOf('.sr-near'), zDust: zOf('.sr-dust'),
        zGrid: zOf('.sr-body > .sr-grid'), zFoot: zOf('.sr-foot'),
    };
})()`;

// 재생 중 한 프레임 표본 — 보이는 입자 수와 '근평면 × 구체' 교차 건수
const CROSS = `(() => {
    const m = UI.els.summonResultModal;
    const vis = el => { const s = getComputedStyle(el); return +s.opacity > 0.05 && s.visibility !== 'hidden'; };
    const R = el => el.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const orbs = [...m.querySelectorAll('.sr-body > .sr-grid > .sr-cell')]
        .filter(c => c.classList.contains('on') && +getComputedStyle(c).opacity > 0.06)
        .map(c => R(c.querySelector('.sr-orbwrap')));
    const near = [...m.querySelectorAll('.sr-near > i')].filter(vis);
    const dust = [...m.querySelectorAll('.sr-dust > i')].filter(vis);
    const motes = [...m.querySelectorAll('.sr-motes > i')].filter(vis);
    let cross = 0;
    for (const n of near) { const r = R(n); if (orbs.some(o => hit(r, o))) cross++; }
    return { near: near.length, dust: dust.length, motes: motes.length, cross, orbs: orbs.length };
})()`;

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
    const errors = [];
    const inRange = (arr, lo, hi) => arr.length > 0 && Math.min(...arr) >= lo && Math.max(...arr) <= hi;
    const span = arr => arr.length ? `${Math.min(...arr)}~${Math.max(...arr)}` : 'n/a';

    for (const [tag, src, seed] of CASES) {
        const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        p.on('pageerror', e => errors.push(`${tag}: ${e}`));
        p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
        await p.goto(INDEX, { waitUntil: 'load' });
        await p.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.summonResultModal, null, { timeout: 20000 });
        await p.evaluate(SEED);
        await p.evaluate(FREEZE_3D);
        await p.evaluate(`(() => { ${RNG(seed)}; ${src} })()`);
        await p.waitForTimeout(300);

        const s = await p.evaluate(SPEC);
        ok(s.nearN >= 10 && s.nearN <= 14, `[${tag}] 근평면 광점 ${s.nearN}개 (처방 10~14)`);
        ok(s.dustN >= 40 && s.dustN <= 60, `[${tag}] 중간 평면 먼지 ${s.dustN}개 (처방 40~60)`);
        ok(inRange(s.nearSize, 6, 14), `[${tag}] 근평면 크기 ${span(s.nearSize)}px (처방 6~14)`);
        ok(inRange(s.nearBlur, 6, 10), `[${tag}] 근평면 흐림 ${span(s.nearBlur)}px (처방 6~10)`);
        ok(inRange(s.nearAlpha, .25, .5), `[${tag}] 근평면 알파 ${span(s.nearAlpha)} (처방 .25~.5)`);
        ok(inRange(s.nearDur, 3.5, 6), `[${tag}] 근평면 주기 ${span(s.nearDur)}s (처방 3.5~6)`);
        // 사다리: 먼지 < 그리드 < 근평면 < 타이틀·버튼.
        // 근평면이 45 위로 올라가면 흐린 광점이 글자 위를 지나 라벨 가독성을 무너뜨린다.
        ok(s.zDust < s.zGrid && s.zGrid < s.zNear && s.zNear < s.zFoot,
            `[${tag}] z 사다리 먼지 ${s.zDust} < 그리드 ${s.zGrid} < 근평면 ${s.zNear} < 글자 ${s.zFoot}`);

        // ⚠️ 표본 창은 **가장 느린 광점의 한 주기(6s)보다 길어야 한다.** 처음에 3.6초로 떴더니
        //    같은 코드가 24.5%~26%로 흔들려(위상에 따라 어떤 광점이 창 안에 들어오는지가 달라진다)
        //    25% 게이트에서 한 번은 PASS, 한 번은 FAIL 이 났다 — 자가 흔들린 것이지 연출이 아니다.
        //    (앞 세션이 probe-sr-timeline 을 3000ms 에서 끊어 '아이들이 정지'로 오판한 것과 같은 함정.)
        const frames = await p.evaluate(`new Promise(res => {
            const s = []; const t0 = performance.now();
            const step = () => { s.push(${CROSS}); if (performance.now() - t0 < 6400) requestAnimationFrame(step); else res(s); };
            requestAnimationFrame(step);
        })`);
        const crossMax = Math.max(...frames.map(f => f.cross));
        const crossFrames = frames.filter(f => f.cross > 0).length;
        const floatMax = Math.max(...frames.map(f => f.near + f.dust + f.motes));
        ok(crossMax > 0 && crossFrames >= frames.length * 0.25,
            `[${tag}] 근평면이 구체 앞을 지난 프레임 ${crossFrames}/${frames.length} (동시 최대 ${crossMax}개)`);
        // A 가 '전 화면 6~8개'라 한 자리 — 세 평면을 합쳐 동시에 보이는 부유 입자 수
        ok(floatMax >= 20, `[${tag}] 동시 부유 입자 최대 ${floatMax}개 (A 실측 기준선 6~8)`);
        await p.close();
    }

    out.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = out.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
