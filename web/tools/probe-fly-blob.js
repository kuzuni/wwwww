// 비행 적(박쥐) 접지 블롭이 고도에 **반그림자처럼** 반응하는지 실측 — `map-quality-up` 잔여 결함 ㉲
// ("비행 적 블롭이 아직 순흑 크게 읽히는 컷 있음 — blobShadowFlyMat 농도 재확인").
//
// 종전 코드는 고도가 오를수록 블롭을 **줄이기만** 했다(scale × (1 − y·0.35)). 실제 그림자는 반대다 —
// 캐스터가 지면에서 멀어지면 반그림자가 **넓게 퍼지면서 옅어진다.** 줄이기만 하면 높이 뜬 박쥐 아래에
// '작고 진한 검은 점'이 남아 위에 아무것도 없는 스티커로 읽힌다. 그게 지적의 실체다.
//
// 무엇을 재는가: `?enemy=bat` 으로 박쥐를 띄우고 **실제 `Scene3D.update()` 를 돌리며** 매 프레임
//   (박쥐 y, 블롭 scale, 블롭 opacity)를 같이 샘플링해 상관을 본다.
//   ⚠️ 값을 손으로 넣지 않는다 — 코드가 실제로 그리는 값을 그 코드를 돌려서 읽는다(TODO 함정 ④).
//   ⚠️ 헤드리스에서 `Scene3D.update` 는 rAF 라 저절로 안 돈다(TODO 함정 ③). 그래서 **직접 호출**한다.
//   판정: ⑴ 고도↑ → scale↑ (양의 상관) ⑵ 고도↑ → opacity↓ (음의 상관)
//         ⑶ 최고 고도의 불투명도가 접지값보다 확실히 낮을 것(= 높이 뜨면 옅어진다)
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-fly-blob.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CORR_MIN = 0.90;   // |상관계수| 하한 — 고도와 단조롭게 엮여 있어야 한다
const FADE_MIN = 1.25;   // 접지 불투명도 ÷ 최고고도 불투명도 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?enemy=bat', { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && Scene3D.enemyMap && Scene3D.enemyMap.size > 0)) break;
        await page.waitForTimeout(200);
    }

    const r = await page.evaluate(() => {
        let bat = null;
        for (const m of Scene3D.enemyMap.values()) if (m.kind === 'bat') { bat = m; break; }
        if (!bat) return { err: 'NO_BAT' };
        if (!bat.blob) return { err: 'NO_BLOB' };
        const shared = bat.blob.userData.sharedMaterial;
        const fly = bat.blob.userData.fly;
        const ys = [], sc = [], op = [];
        for (let i = 0; i < 260; i++) {
            Scene3D.update(0.016);
            if (!bat.blob) break;
            ys.push(Math.max(0, bat.g.position.y));
            sc.push(bat.blob.scale.x);
            op.push(bat.blob.material.opacity);
        }
        const corr = (a, b) => {
            const n = a.length;
            let ma = 0, mb = 0;
            for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
            ma /= n; mb /= n;
            let sab = 0, sa = 0, sb = 0;
            for (let i = 0; i < n; i++) {
                const da = a[i] - ma, db = b[i] - mb;
                sab += da * db; sa += da * da; sb += db * db;
            }
            return (sa < 1e-12 || sb < 1e-12) ? 0 : sab / Math.sqrt(sa * sb);
        };
        // 최저/최고 고도 프레임의 불투명도
        let lo = 0, hi = 0;
        for (let i = 1; i < ys.length; i++) { if (ys[i] < ys[lo]) lo = i; if (ys[i] > ys[hi]) hi = i; }
        return {
            n: ys.length, shared, fly,
            yMin: ys[lo], yMax: ys[hi],
            opAtLo: op[lo], opAtHi: op[hi],
            scAtLo: sc[lo], scAtHi: sc[hi],
            cScale: corr(ys, sc), cOpac: corr(ys, op),
        };
    });

    // 개체 재질 누수 점검 — 박쥐를 걷어낸 뒤 재질이 dispose 됐는지
    const leak = await page.evaluate(() => {
        let bat = null;
        for (const m of Scene3D.enemyMap.values()) if (m.kind === 'bat') { bat = m; break; }
        if (!bat || !bat.blob) return 'NO_BAT';
        const mat = bat.blob.material;
        Scene3D.dropBlob(bat);
        // three 의 dispose 는 플래그를 안 남기므로, scene 에서 빠졌는지와 참조가 끊겼는지로 본다
        return (bat.blob === null && !Scene3D.scene.children.some(o => o.material === mat)) ? 'OK' : 'LEAK';
    });
    await browser.close();

    if (r.err) { console.log('FAIL — ' + r.err); return; }
    const fade = r.opAtHi > 0 ? r.opAtLo / r.opAtHi : 0;
    const okS = r.cScale >= CORR_MIN, okO = r.cOpac <= -CORR_MIN, okF = fade >= FADE_MIN;
    console.log('표본 ' + r.n + '프레임 · 개체재질 ' + (r.shared === false ? 'ok(복제)' : '✗(공유)') +
        ' · fly 플래그 ' + (r.fly ? 'ok' : '✗'));
    console.log('고도 ' + r.yMin.toFixed(3) + ' ~ ' + r.yMax.toFixed(3));
    console.log('스케일 ' + r.scAtLo.toFixed(3) + ' → ' + r.scAtHi.toFixed(3) +
        '  (고도 상관 ' + r.cScale.toFixed(3) + ' ' + (okS ? 'ok' : '✗') + ', 기준 ≥ ' + CORR_MIN + ')');
    console.log('불투명 ' + r.opAtLo.toFixed(3) + ' → ' + r.opAtHi.toFixed(3) +
        '  (고도 상관 ' + r.cOpac.toFixed(3) + ' ' + (okO ? 'ok' : '✗') + ', 기준 ≤ -' + CORR_MIN + ')');
    console.log('감쇠 비 ' + fade.toFixed(2) + ' ' + (okF ? 'ok' : '✗') + ' (기준 ≥ ' + FADE_MIN + ')');
    console.log('재질 해제: ' + leak);
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(okS && okO && okF && leak === 'OK' && r.shared === false
        ? 'PASS — 고도가 오르면 블롭이 넓게 퍼지며 옅어진다 (반그림자)'
        : 'FAIL — ' + [!okS && '스케일 상관', !okO && '불투명 상관', !okF && '감쇠 폭',
            leak !== 'OK' && '재질 해제', r.shared !== false && '개체 재질'].filter(Boolean).join('·') + ' 미달');
})();
