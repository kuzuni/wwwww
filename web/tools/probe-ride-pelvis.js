// 탑승 기준점 실측 — `Scene3D.heroPelvisLocalY()` 의 가드가 지금 비례에서 맞는지 본다.
//
// 왜: 안장 높이는 전부 이 한 값에서 파생된다(`refreshMount` 의 `seatLocal = pelvisLocal − heroSeatDropY()`).
//     그런데 이 함수에는 "이 리그의 골반은 0.77 부근이 정상"이라는 **성인 비례 시절의 가드**
//     (`y > 0.6 && y < 1.0`)가 박혀 있어서, 범위를 벗어나면 조용히 기본값 0.774 로 떨어진다.
//     `hero-chibi`(다리 ×0.60)와 '머리 더 크게'(BODY_SCALE 0.98 → 0.889)로 골반이 크게 내려왔으므로,
//     가드가 실측치를 밖으로 밀어내고 있으면 **안장 높이가 통째로 빗나간 채 아무 에러도 안 난다.**
//
// 재는 것: ⑴ 비탑승 골반 로컬 y ⑵ 형태 계열별 탑승 중 골반 로컬 y(가장 큰 값이 가드 상한을 넘는지)
//          ⑶ `heroPelvisLocalY()` 가 실제로 반환하는 값 — 실측치와 다르면 가드에 걸린 것이다.
//          ⑷ `heroSeatDropY()`(골반 → 스커트 밑단 낙차) — 여기에도 `min > −0.05 || min < −0.4` 가드가
//             있어서 같은 방식으로 조용히 폴백(0.149)으로 떨어질 수 있다. 참고값으로 같이 찍는다.
// 사용: node probe-ride-pelvis.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroRig && typeof ProChar !== "undefined"', { timeout: 60000, label: '3D 부팅' });

    const out = await page.evaluate(() => {
        const raw = () => {
            const rig = Scene3D.heroRig;
            Scene3D.heroG.updateWorldMatrix(false, true);
            return Scene3D.heroG.worldToLocal(rig.bones.pelvis.getWorldPosition(new THREE.Vector3())).y;
        };
        const rows = [{ name: '(비탑승)', raw: raw(), api: Scene3D.heroPelvisLocalY(), drop: Scene3D.heroSeatDropY() }];
        // 형태 계열별 — 로스터에서 계열이 다른 탈것을 하나씩 골라 태워 본다.
        const forms = {};
        for (const mn in Scene3D.MOUNT_FORM_OF) {
            const key = Scene3D.MOUNT_FORM_OF[mn];
            if (!forms[key]) forms[key] = mn;
        }
        if (!forms.quad) forms.quad = 'Horse';   // 표에 없는 이름은 전부 quad 폴백이라 대표를 하나 세운다
        for (const key of Object.keys(forms).sort()) {
            const name = forms[key];
            try {
                S.mount = { name, rarity: 'rare' };
                Scene3D.refreshMount();
                Scene3D.update(0.016);
                rows.push({ name: key + ' / ' + name, raw: raw(), api: Scene3D.heroPelvisLocalY(), drop: Scene3D.heroSeatDropY() });
            } catch (e) { rows.push({ name: key + ' / ' + name, err: String(e) }); }
        }
        return { rows, fallback: Scene3D._pelvisLast || 0.4375, guard: [0.25, 0.95] };
    });

    console.log('--- 탑승 기준점(골반 로컬 y) 실측 ---');
    console.log('가드 대역 ' + out.guard[0] + ' ~ ' + out.guard[1] + ' · 벗어나면 폴백 ' + out.fallback);
    console.log('상태                        실측 raw    heroPelvisLocalY()   스커트낙차   판정');
    let bad = 0;
    for (const r of out.rows) {
        if (r.err) { console.log('  ' + r.name.padEnd(24) + '  ERROR ' + r.err); bad++; continue; }
        const clipped = Math.abs(r.api - r.raw) > 1e-3;
        if (clipped) bad++;
        console.log('  ' + r.name.padEnd(24) + '  ' + r.raw.toFixed(4).padStart(8) + '        ' + r.api.toFixed(4).padStart(8)
            + '        ' + Number(r.drop).toFixed(4).padStart(7)
            + '   ' + (clipped ? '❌ 가드에 걸려 폴백으로 떨어짐' : '✅ 실측치가 그대로 나온다'));
    }
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(bad ? ('미통과 ' + bad + '건 — 가드 대역을 지금 비례에 맞게 다시 쓸 것') : '전부 통과');
    await browser.close();
})();
