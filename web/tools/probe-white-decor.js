// 흰 등급색 장식 '플랫' 판정기 (equip-era-theming ⓓ — 3차 채점 C·D 지적)
//   지적: fin 볏 · 사무라이 쿠와가타 · plume 이 **순백 평판**이라 형태 정보가 0.
//   원인: 무채·고휘도 등급색(일반 0xd6d6d6) + 이미시브 0.45 를 램버트에 걸면 **어느 면이나 같은
//   밝기**로 타 명부·암부 폭이 사라진다.
//
// 판정 = **차분 규약**(probe-collar·probe-ride-saddle-read 와 같은 방식): 장식(`userData.rarityDecor`)을
//   껐다 켜서 **그 부위가 기여한 화소만** 골라 낸다. 전체 실루엣으로 재면 돔·트림이 섞여 지표가 안 움직인다.
//   ① 휘도 폭 p90−p10 ≥ 34 — 평판이면 0 에 붙는다.
//   ② 최대 휘도 ≤ 250 — 순백 포화(형태 소실)가 아니어야 한다.
//   ③ 기여 화소 ≥ 60 — 부위가 실제로 보여야 잰 값이 뜻이 있다.
//
// ⚠️ **차분 평균색으로 판정하지 말 것** — 아웃라인·AA 가장자리가 양방향으로 섞여 평균이 늘 어두운
//    회색으로 끌린다(ride-saddle-read 가 남긴 함정). 여기서는 휘도 **분포 폭**을 쓴다.
// 사용: node probe-white-decor.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const CASES = [['fin', 'medieval'], ['crown', 'medieval'], ['plume', 'medieval'], ['plume', 'primitive'], ['fin', 'modern']];
const SPREAD_GATE = 34, MAX_GATE = 250, PIX_GATE = 60;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const res = await page.evaluate((CASES) => {
        const out = [];
        const cv = document.createElement('canvas');
        cv.width = cv.height = 96;
        const cx = cv.getContext('2d');
        const shot = (url) => new Promise(r => {
            const img = new Image();
            img.onload = () => { cx.clearRect(0, 0, 96, 96); cx.drawImage(img, 0, 0, 96, 96); r(cx.getImageData(0, 0, 96, 96).data); };
            img.onerror = () => r(null);
            img.src = url;
        });
        return (async () => {
            for (const [style, age] of CASES) {
                Scene3D.itemThumbInit();
                const sc = Scene3D._thumbScene;
                Scene3D.clearGroup(sc);
                sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
                const model = Scene3D.makeHelmet(age, 'common', style, '');
                Scene3D.tierizeParts(model);
                const gg = new THREE.Group();
                gg.add(model);
                sc.add(gg);
                const d = Scene3D.ITEM_THUMB_DIR;
                // 프레이밍은 **한 번만** 잡고 두 컷에 같이 쓴다 — 껐을 때 다시 잡으면 카메라가 움직여
                // 차분이 통째로 어긋난다(그러면 실루엣 전체가 '기여 화소'로 잡힌다).
                Scene3D.thumbFrameToFit(Scene3D._thumbCam, gg, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
                Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                const on = await shot(Scene3D._thumbR.domElement.toDataURL());
                const hide = (pred) => {
                    const h = [];
                    model.traverse(o => { if (pred(o)) { h.push(o); o.visible = false; } });
                    return h;
                };
                const show = (h) => { for (const o of h) o.visible = true; };
                // ⓐ 흰 파츠만 껐을 때의 차분 = **흰 면 자체**(엄격 지표, 진단용)
                let h1 = hide(o => o.userData.rarityDecor);
                Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                const noWhite = await shot(Scene3D._thumbR.domElement.toDataURL());
                show(h1);
                // ⓑ 장식 부위를 통째로 껐을 때의 차분 = **눈이 '그 부위'로 보는 영역**(흰 면 + 그 안의
                //    어두운 심·밴드·깃대). 처방이 요구한 '내부 음영'은 이 영역의 명암 폭이다.
                let h2 = hide(o => o.userData.rarityDecor || o.userData.decorAccent);
                Scene3D._thumbR.render(sc, Scene3D._thumbCam);
                const noDecor = await shot(Scene3D._thumbR.domElement.toDataURL());
                show(h2);
                if (!on || !noWhite || !noDecor) { out.push({ style, age, err: '렌더 실패' }); continue; }
                const collect = (ref) => {
                    const lum = [];
                    for (let i = 0; i < 96 * 96; i++) {
                        const j = i * 4;
                        const dA = Math.abs(on[j + 3] - ref[j + 3]);
                        const dC = Math.abs(on[j] - ref[j]) + Math.abs(on[j + 1] - ref[j + 1]) + Math.abs(on[j + 2] - ref[j + 2]);
                        if (dA < 24 && dC < 24) continue;           // 이 부위가 안 바꾼 화소
                        if (on[j + 3] < 40) continue;
                        lum.push(0.299 * on[j] + 0.587 * on[j + 1] + 0.114 * on[j + 2]);
                    }
                    lum.sort((a, b) => a - b);
                    const q = f => (lum.length ? lum[Math.min(lum.length - 1, Math.floor(f * lum.length))] : 0);
                    return { n: lum.length, p10: Math.round(q(0.10)), p90: Math.round(q(0.90)),
                        spread: Math.round(q(0.90) - q(0.10)), max: Math.round(lum.length ? lum[lum.length - 1] : 0) };
                };
                const strict = collect(noWhite), area = collect(noDecor);
                out.push({ style, age, n: area.n, spread: area.spread, max: strict.max,
                    wSpread: strict.spread, wN: strict.n, tagged: h2.length });
            }
            return out;
        })();
    }, CASES);

    const fail = [];
    console.log('흰 등급색 장식(일반 등급) — 차분으로 고른 기여 화소의 휘도 분포');
    console.log('style/age        화소   부위폭  흰면폭  최대  태그  판정   (부위폭 = 흰 면 + 그 안의 어두운 심까지, 흰면폭 = 흰 면만)');
    for (const r of res) {
        if (r.err) { fail.push(r.style + '/' + r.age + ': ' + r.err); console.log((r.style + '/' + r.age).padEnd(17) + r.err); continue; }
        const bad = [];
        if (!(r.n >= PIX_GATE)) bad.push('기여 화소 ' + r.n + ' < ' + PIX_GATE);
        else {
            if (!(r.spread >= SPREAD_GATE)) bad.push('휘도 폭 ' + r.spread + ' < ' + SPREAD_GATE + '(평판)');
            if (!(r.max <= MAX_GATE)) bad.push('최대 휘도 ' + r.max + ' > ' + MAX_GATE + '(순백 포화)');
        }
        if (bad.length) fail.push(r.style + '/' + r.age + ': ' + bad.join(' · '));
        console.log((r.style + '/' + r.age).padEnd(17) + String(r.n).padEnd(7) + String(r.spread).padEnd(8) + String(r.wSpread).padEnd(8)
            + String(r.max).padEnd(6) + String(r.tagged).padEnd(6) + (bad.length ? '❌ ' + bad.join(' · ') : '✅'));
    }
    console.log('\n콘솔 에러: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    console.log(fail.length ? '❌ FAIL ' + fail.length + '건' : '✅ PASS — 흰 장식 전 사례 명암 폭 확보·순백 포화 없음');
    await browser.close();
    process.exit(fail.length || errors.length ? 1 : 0);
})();
