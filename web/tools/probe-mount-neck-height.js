// 머리가 등선 위로 올라왔는가 — 목 높이 실측 (`mount-species-recognizable` 실루엣 분화 6단).
//
// 왜 이 자를 새로 놨나: 4차 블라인드 채점에서 비평가 2인이 **나란히 1순위로** 짚은 것이
// "종 정보 대부분이 머리에 있는데 그 머리가 3/4 앵글에서 지면으로 처박히고 안장 실루엣 뒤로
// 숨는다" 였다. 그런데 그때까지 **머리 높이를 재는 자가 하나도 없었다** — `probe-ride-clear`
// 는 반대로 '머리가 다리를 가리는가'(= 너무 크거나 앞에 있는가)만 보고, `probe-mount-silhouette`
// 는 옆모습 IoU 라 위아래로 옮긴 걸 '다르다'로만 읽지 '보이는가'는 모른다. 즉 **채점이 짚은
// 축을 아무도 안 재고 있었다.** 그래서 그 축을 여기서 못 박는다.
//
// 재는 것 (탈것 로컬 좌표, 리프트 전 기준):
//   headTopY   = `part:'head'` 파츠(머리·뿔·귀·주둥이) 전체의 윗끝
//   headMidY   = 그 파츠들의 bbox 중심 y
//   backY      = 배럴 윗면(BODY_TOP 0.445) — 안장이 얹히는 등마루. 종 불문 고정값이라 기준이 된다.
//   exposed    = headTopY − backY  (등선 위로 삐져나온 높이)
//
// 판정: **머리 윗끝이 등선보다 위에 있어야 한다**(exposed > 0). 그래야 3/4 앵글에서 안장·몸통
// 실루엣 위로 얼굴이 올라온다. 단 **네발짐승 전부에 같은 값을 요구하지 않는다** — 돼지·코뿔소는
// 머리를 등선 아래로 처박는 게 그 종의 서명이라, 그런 종은 `LOW` 목록에 넣고 대신 **'등선 아래로
// 얼마나 처박혔나'가 다른 종과 겹치지 않는지**만 본다(그게 판독 축이 되도록).
//
// ⚠️ 이 자는 **높이만** 본다. 머리가 위로 가서 먼 다리를 가리는지는 `probe-ride-clear` 몫이고,
//    둘은 반대 방향으로 당기는 자다 — **항상 같이 돌릴 것.** 한쪽만 보고 값을 키우면 다른 쪽이
//    조용히 깨진다.
//
// 사용: node probe-mount-neck-height.js [종...]     (기본: 네발 로스터 전종)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

const ARG = process.argv.slice(2);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.makeMountMesh && typeof MOUNT_KR !== "undefined"');

    const out = await page.evaluate((argNames) => {
        const names = argNames.length ? argNames : Object.keys(MOUNT_KR);
        const BACK_Y = 0.445;          // BODY_TOP — 배럴 윗면(안장이 얹히는 등마루)
        const rows = [];
        for (const name of names) {
            const mesh = Scene3D.makeMountMesh(name, 'epic');
            mesh.updateMatrixWorld(true);
            // 머리 그룹은 `neckRig` 가 만든 `userData.head` 다. 그게 없는 계열(비행·바퀴 등)은
            // 이 자의 대상이 아니다 — 네발짐승의 '등선 vs 얼굴'을 재는 자이기 때문이다.
            const neck = mesh.userData.head;
            if (!neck) { rows.push({ name, skip: 'no-neck-rig' }); continue; }
            const b = new THREE.Box3();
            let n = 0;
            // ✅ 고삐는 걸러 낼 필요가 없다 — `part:'head'`·`bridle` 표식이 **일부러** 안 붙어 있어
            //    (scene3d.js 의 그 자리 주석 참조) `neckRig` 가 애초에 이 그룹으로 안 걷어 온다.
            //    끈은 라이더 손까지 늘어나므로, 섞였다면 전 종이 손 높이로 같은 값을 냈을 것이다.
            neck.traverse(o => { if (o.geometry) { b.expandByObject(o); n++; } });
            if (!n || b.isEmpty()) { rows.push({ name, skip: 'no-head-parts' }); continue; }
            rows.push({
                name,
                headTopY: b.max.y, headMidY: (b.max.y + b.min.y) / 2,
                headZ: (b.max.z + b.min.z) / 2,
                exposed: b.max.y - BACK_Y, midOver: (b.max.y + b.min.y) / 2 - BACK_Y,
            });
        }
        return { rows, BACK_Y };
    }, ARG);

    // 머리를 **일부러** 등선 아래로 두는 종 — 그게 그 종의 서명이다(돼지·코뿔소는 목이 없는 동물).
    // 이 목록은 '통과 면제'가 아니라 **다른 판정**이다: 아래 `spread` 로 서로 겹치지 않는지 본다.
    const LOW = new Set(['Pig', 'Armored Rhino', 'Panther', 'Crab', 'Turtle', 'Clockwork Beetle', 'Mech Spider']);

    const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
    let fail = 0;
    const done = out.rows.filter(r => !r.skip);
    done.sort((a, b) => b.exposed - a.exposed);
    console.log(`등마루(BODY_TOP) y = ${out.BACK_Y}   — exposed = 머리 윗끝 − 등마루\n`);
    for (const r of done) {
        const low = LOW.has(r.name);
        const ok = low ? true : r.exposed > 0;
        if (!ok) fail++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.name.padEnd(18)} 윗끝 ${r.headTopY.toFixed(3)}  중심 ${r.headMidY.toFixed(3)}  ` +
                    `exposed ${fmt(r.exposed)}  중심-등선 ${fmt(r.midOver)}${low ? '   (LOW: 등선 아래가 정답인 종)' : ''}`);
    }
    for (const r of out.rows.filter(r => r.skip)) console.log(`--   ${r.name.padEnd(18)} (${r.skip})`);

    // 판독 축으로 쓰이려면 종끼리 **값이 겹치지 않아야** 한다. 이웃한 두 종의 exposed 차가
    // 0.010 미만이면 그 쌍은 이 축에서 안 갈린다(= 목 높이가 종 정보를 못 나른다).
    const tight = [];
    for (let i = 1; i < done.length; i++) {
        const d = done[i - 1].exposed - done[i].exposed;
        if (d < 0.010) tight.push(`${done[i - 1].name}↔${done[i].name} (Δ${d.toFixed(3)})`);
    }
    console.log(`\n등선 위로 나온 종: ${done.filter(r => r.exposed > 0).length}/${done.length}` +
                `   목 높이가 안 갈리는 쌍(Δ<0.010): ${tight.length}${tight.length ? ' — ' + tight.join(', ') : ''}`);
    if (errors.length) console.log('\n콘솔 에러:\n' + errors.slice(0, 8).join('\n'));
    console.log(fail === 0 && errors.length === 0 ? '\nPASS' : `\nFAIL (${fail}종 등선 아래 · 에러 ${errors.length})`);
    await browser.close();
    process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})();
