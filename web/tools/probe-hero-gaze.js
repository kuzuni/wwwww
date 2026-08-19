// hero-gaze-forward-attack(사용자 지시 2026-08-19) — "주인공 공격하는데 시선 자꾸 뒤에 보던데".
// 원인: 공격 클립의 spine.ry 비틀림이 neck(spine 하위)·머리를 통째로 끌고 가서, 와인드업/팔로스루마다
// 얼굴이 적 반대편(뒤)을 봤다. 수정 = spine.ry 를 쓰는 클립에 neck.ry 카운터(−0.85배, 같은 키 시각).
// 이 프로브는 공격 클립 9종을 **수동 스텝**(함정 ③: 헤드리스 rAF 정지 — 기다리지 말고 ProChar.update 직접)
// 하며 매 프레임 다음을 잰다:
//   spineOff = spine.rotation.y − base  (몸통 비틀림)
//   headYaw  = spineOff + neckOff       (머리의 월드 요우 편차 — heroG 기준. root.ry 트랙은 공격 클립에 없다)
// 게이트: ① 비틀림이 실제로 있는 클립(max|spineOff| > 0.2)에서 max|headYaw| ≤ max|spineOff|×0.22 + 0.03
//         ② 전 클립 공통 max|headYaw| < 0.25rad (수정 전 slash 는 0.65·throw 0.5 — '뒤를 본다'의 실체)
//         ③ 콘솔/페이지 에러 0
// 사용: node probe-hero-gaze.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CLIPS = ['slash', 'chop', 'thrust', 'slam', 'double', 'bow', 'gun', 'cast', 'throw'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const rows = await page.evaluate((clips) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.anims.length = 0;
        const R = Scene3D.heroRig;
        const out = [];
        for (const name of clips) {
            const clip = ProChar.CLIPS[name];
            ProChar.play(R, [name], true, 1);
            let maxSpine = 0, maxHead = 0, atSpine = 0, atHead = 0;
            const steps = Math.ceil(clip.dur * 120); // 120fps 스텝 — 키프레임 극점을 놓치지 않게
            for (let i = 0; i <= steps; i++) {
                ProChar.update(R, clip.dur / steps);
                const spineOff = R.bones.spine.rotation.y - R.base.spine.ry;
                const neckOff = R.bones.neck.rotation.y - R.base.neck.ry;
                const headYaw = spineOff + neckOff;
                if (Math.abs(spineOff) > Math.abs(maxSpine)) { maxSpine = spineOff; atSpine = i / steps; }
                if (Math.abs(headYaw) > Math.abs(maxHead)) { maxHead = headYaw; atHead = i / steps; }
            }
            out.push({ name, maxSpine, maxHead, atSpine, atHead });
        }
        return out;
    }, CLIPS);

    console.log('== 공격 중 머리 월드 요우(시선) 실측 — spine 비틀림 vs 머리 잔여 요우 ==\n');
    console.log('  클립     max|spine.ry|   max|머리요우|   비율    판정');
    const fails = [];
    for (const r of rows) {
        const ms = Math.abs(r.maxSpine), mh = Math.abs(r.maxHead);
        const ratio = ms > 1e-6 ? mh / ms : 0;
        let ok = true;
        if (ms > 0.2 && mh > ms * 0.22 + 0.03) { ok = false; fails.push(`${r.name}: 비틀림 ${ms.toFixed(2)} 인데 머리 요우 ${mh.toFixed(2)} — 카운터 부재/부족`); }
        if (mh >= 0.25) { ok = false; fails.push(`${r.name}: 머리 요우 ${mh.toFixed(2)} ≥ 0.25rad — 시선이 옆/뒤로 돈다`); }
        console.log(`  ${r.name.padEnd(7)} ${ms.toFixed(3).padStart(10)} ${mh.toFixed(3).padStart(12)} ${(ratio * 100).toFixed(0).padStart(6)}%   ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log('');
    if (errors.length) { console.log(`콘솔/페이지 에러 ${errors.length}건:`); errors.slice(0, 5).forEach(e => console.log('  ' + e)); }
    else console.log('콘솔/페이지 에러 0건');
    if (fails.length) { console.log('판정: FAIL'); fails.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
    else console.log(`판정: PASS (${rows.length}클립)`);
    await browser.close();
})();
