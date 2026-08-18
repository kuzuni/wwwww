// 🚨 **이 도구의 판정은 현재 구현에 대한 증거가 아니다 (2026-08-18 3D 스트림).**
//    ① 재질 검사(`재질이 실제로 움직였는가`)는 **되돌려진 처방**(`mat.color` 를 주황으로 미는 방식,
//       `userData._col0`)을 찾는다. 지금 `flashMesh` 는 그 방식을 안 쓴다 — 몸은 emissive,
//       그리고 **외곽선 셸의 색**을 올린다. 그래서 여기선 영원히 '틴트 적용 0개 ✗' 로 나온다.
//    ② 화면 델타는 스크린샷 경로라 소프트 렌더에서 플래시 구간을 비껴간다: 렌더 루프의 dt 는
//       `Math.min(0.1, …)` 인데 플래시 dur 이 0.1~0.14 라, 프레임이 초 단위인 swiftshader 에서는
//       **한 프레임 만에 감쇠가 끝난다.** 실게임(60fps)에서는 6~8프레임에 걸쳐 보이는 연출이다.
//    → 지금의 실측 근거는 `tools/probe-hitflash-ab.js` 다. 렌더러에서 gl.readPixels 로 직독하고,
//      **적을 숨겼다 켜서 그 영역이 실제로 변하는지 자 점검을 먼저 통과**한 뒤에만 판정하며,
//      update() 를 안 돌려 피크 프레임을 강제한다. 거기 실측으로 일반 타격 화면 델타는
//      0.0043 → 0.14~0.19 로 올랐다(적을 통째로 숨겼을 때의 델타와 같은 자릿수).
//    이 파일은 과거 회차의 기록으로 남긴다 — 여기 FAIL 이 뜬다고 구현을 되돌리지 말 것.
// 일반 타격의 '맞았다' 신호가 프레임에 실제로 얼마나 남는지 — 6차 채점 지적 교차검증
// (채점자 A #7 · B #2 가 독립적으로 같은 말을 했다: "흰 적에 흰 플래시는 델타가 0에 가깝다").
//
// ⚠️ 채점자 2인 일치가 참을 보장하지 않는다 — 5차의 A #1(스파크가 공격자에 붙어 있다)은 2인 일치
//    지적이었고 실측으로 기각됐다. 그래서 이번에도 **채점자가 본 그 프레임 그대로**를 재서 판정한다.
//
// 재는 것: `tools/shots-6cha/` 의 a0(타격 전) 과 a1(+16ms) 을 같은 좌표로 겹쳐,
//   ⒜ 적 실루엣 영역의 평균 휘도가 얼마나 움직였나(=플래시가 만든 밝기 델타)
//   ⒝ 프레임 전체에서 유의미하게 바뀐 픽셀이 몇 %인가(=타격 신호의 화면 점유)
//   ⒞ 그 변화가 '밝아짐'인가 '어두워짐'인가
// 판정: 적 영역 평균 휘도 델타가 0.04(=8/255) 미만이면 지적이 맞다 — 흰 적 위의 흰 플래시는
//       눈에 밝기 변화로 안 들어온다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const DIR = process.argv[2] || path.resolve(__dirname, 'shots-6cha');
const MIN_DELTA = 0.04;

(async () => {
    const read = (f) => fs.readFileSync(path.join(DIR, f)).toString('base64');
    const pairs = [
        ['일반 타격', 'hitfx-a0-before.png', 'hitfx-a1-hit+16ms.png'],
        ['크리(대조군)', 'hitfx-a0-before.png', 'hitfx-a4-crit+16ms.png'],
    ];
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');

    const out = await page.evaluate(async (jobs) => {
        const decode = (b64) => new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const x = c.getContext('2d'); x.drawImage(img, 0, 0);
                res({ d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height });
            };
            img.src = 'data:image/png;base64,' + b64;
        });
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lum = (d, i) => 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
        const res = [];
        for (const [label, aB64, bB64] of jobs) {
            const A = await decode(aB64), B = await decode(bB64);
            // 적 실루엣 = **타격 전 프레임**에서 잡는다(타격 후엔 플래시로 경계가 흐려진다).
            // 이 세트는 골렘이 화면 오른쪽 절반의 밝은 덩어리다 — 배경(하늘·잔디)보다 밝고
            // 채도가 낮은 픽셀을 실루엣으로 본다. 임계값 하나로 못 가르는 부분은 아래 전체 델타가 받는다.
            // 🚨 **고정 마스크로 재면 안 된다.** 타격 프레임에서는 적이 넉백으로 움직이므로, 타격 전
            //    프레임에서 뜬 적 픽셀 자리에 타격 후에는 **잔디(어두움)** 가 들어온다. 그 자리를 그대로
            //    재면 '적이 어두워졌다'가 찍히는데 그건 플래시가 아니라 **변위**다(첫 판에서 델타 -0.0776
            //    이 나왔고, 화면 변화가 32% 였다 — 플래시 혼자 만들 수 있는 값이 아니다).
            //    그래서 **각 프레임에서 그 프레임의 적 실루엣을 따로 떠서** 몸 자체의 밝기를 비교한다.
            // ⚠️ 이 자의 한계 하나를 적어 둔다: 마스크가 `l > 0.45` 라 **몸이 어두워질수록 그 픽셀이
            //    마스크에서 빠져나간다** — 즉 휘도 델타는 항상 실제보다 작게 찍힌다(하한이다).
            //    그래서 채도 평균을 같이 낸다. 틴트로 누르는 처방은 명도보다 채도에서 훨씬 크게 움직인다.
            const maskMean = (img) => {
                let sum = 0, n = 0, satSum = 0, satN = 0;
                for (let i = 0; i < img.d.length; i += 4) {
                    const px = (i / 4) % img.w;
                    const l = lum(img.d, i);
                    const sat = Math.max(img.d[i], img.d[i + 1], img.d[i + 2]) - Math.min(img.d[i], img.d[i + 1], img.d[i + 2]);
                    if (px > img.w * 0.45 && l > 0.45) {
                        if (sat < 40) { sum += l; n++; }
                        satSum += sat; satN++;
                    }
                }
                return { mean: n ? sum / n : 0, n, sat: satN ? satSum / satN : 0 };
            };
            const mA = maskMean(A), mB = maskMean(B);
            let changed = 0, up = 0, tot = 0;
            for (let i = 0; i < A.d.length; i += 4) {
                tot++;
                const d = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
                if (d > 30) { changed++; if (lum(B.d, i) > lum(A.d, i)) up++; }
            }
            res.push({ label, enemyPx: mA.n, enemyPxB: mB.n, meanA: mA.mean, meanB: mB.mean, satA: mA.sat, satB: mB.sat,
                       changedPct: 100 * changed / tot, upPct: changed ? 100 * up / changed : 0 });
        }
        return res;
    }, pairs.map(([l, a, b]) => [l, read(a), read(b)]));

    console.log('== 타격 프레임의 밝기 델타 실측 (6차 지적 A #7 · B #2 교차검증) ==');
    console.log('  자료: %s 의 a0(타격 전) 대비', DIR);
    for (const r of out) {
        console.log('  %s — 적 실루엣 %d→%d px · 몸 평균 휘도 %s → %s (델타 %s) · 화면 변화 %s%% (그중 밝아진 쪽 %s%%)',
            r.label.padEnd(12), r.enemyPx, r.enemyPxB, r.meanA.toFixed(4), r.meanB.toFixed(4),
            (r.meanB - r.meanA >= 0 ? '+' : '') + (r.meanB - r.meanA).toFixed(4),
            r.changedPct.toFixed(2), r.upPct.toFixed(0));
        console.log('%s   채도 평균 %s → %s (델타 %s)', ' '.repeat(2), r.satA.toFixed(1), r.satB.toFixed(1), (r.satB - r.satA >= 0 ? '+' : '') + (r.satB - r.satA).toFixed(1));
    }
    // ── 2부: 프레임 판독의 순환을 피해 **재질 자체**를 읽는다 ──
    // 위 1부는 마스크가 `l > 0.45` 라, 처방(어두운 틴트)이 먹을수록 그 픽셀이 마스크에서 빠져나간다.
    // 즉 **처방이 강할수록 지표가 안 움직이는** 순환 구조라 1부만으로는 교정 효과를 판정할 수 없다.
    // 그래서 피격 프레임에서 적 재질의 색을 직접 읽어 기준색 대비 얼마나 눌렀는지를 잰다.
    const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
    const p2 = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await p2.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await p2.waitForFunction(() => typeof Combat !== 'undefined' && Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await p2.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    const mat = await p2.evaluate(() => {
        const e = Combat.enemies.find(x => x.alive);
        if (!e) return { err: '살아 있는 적 없음' };
        Scene3D.update = () => {};
        const m = Scene3D.enemyMap.get(e.id);
        const L = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        const S = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
        // ⚠️ 기준색을 **live color 로 읽으면 안 된다** — 이 적은 방금 실전투에서 맞았을 수 있고, 그러면
        //    '피격 전'이 이미 틴트가 먹은 색이라 전/후가 똑같이 찍힌다(실제로 0.471→0.471 이 나왔다).
        //    `flashMesh` 가 최초 1회 저장해 두는 기준색(`_col0`)이 있으면 그걸 기준으로 삼는다.
        const baseOf = (x) => x.userData._col0 !== undefined ? new THREE.Color(x.userData._col0) : x.color;
        const before = m.flashMats.filter(x => x.color).map(x => ({ l: L(baseOf(x)), s: S(baseOf(x)) }));
        for (const a of Scene3D.anims) { try { a.onDone && a.onDone(); } catch (_) {} }   // 진행 중 플래시 정리
        Scene3D.anims = [];
        Scene3D.hitEnemy(e.id, Big.of(100), false, null, false);
        const after = m.flashMats.filter(x => x.color).map(x => ({ l: L(x.color), s: S(x.color) }));
        const darkened = m.flashMats.filter(x => x.userData._col0 !== undefined).length;
        const avg = (a, k) => a.reduce((s, v) => s + v[k], 0) / a.length;
        return { n: before.length, darkened,
                 lBefore: avg(before, 'l'), lAfter: avg(after, 'l'),
                 sBefore: avg(before, 's'), sAfter: avg(after, 's') };
    });
    if (mat.err) console.log('\n  재질 판독 불가 — ' + mat.err);
    else console.log('\n  재질 직접 판독(피격 프레임) — 재질 %d개 중 밝은 몸 판정 %d개 · 알베도 휘도 %s → %s (%s) · 채도 %s → %s (%s)',
        mat.n, mat.darkened, mat.lBefore.toFixed(3), mat.lAfter.toFixed(3),
        (mat.lAfter - mat.lBefore >= 0 ? '+' : '') + (mat.lAfter - mat.lBefore).toFixed(3),
        mat.sBefore.toFixed(3), mat.sAfter.toFixed(3),
        (mat.sAfter - mat.sBefore >= 0 ? '+' : '') + (mat.sAfter - mat.sBefore).toFixed(3));

    const hit = out[0], crit = out[1];
    const delta = Math.abs(hit.meanB - hit.meanA);
    console.log('\n  일반 타격의 적 밝기 델타 %s (기준 %s 이상 필요) · 크리 대조군 %s',
        delta.toFixed(4), MIN_DELTA, Math.abs(crit.meanB - crit.meanA).toFixed(4));
    // 처방의 요구는 '어두워질 것'이 아니라 **'한 축이 크게 움직일 것'**이다 — 틴트는 흰 몸에는 명도로,
    // 어두운 몸에는 채도로 작동한다. 골렘은 알베도 휘도(0.437)가 틴트(#ff5a1e, 0.44)와 거의 같아
    // **명도는 그대로고 채도가 +0.635 로 뛴다** — 그게 실패가 아니라 이 몸에서의 정상 동작이다.
    // ⚠️ 이 줄은 **아직 처방이 안 들어간 상태**를 기록한다. 2026-08-18 세션이 틴트 처방을 넣어 봤다가
    //    되돌렸다(아래 판정 주석 참조) — 재질은 확실히 움직였는데(채도 +0.635) **렌더 프레임이 안 움직여서**다.
    const matOk = !mat.err && mat.darkened > 0 && ((mat.lBefore - mat.lAfter) > 0.08 || (mat.sAfter - mat.sBefore) > 0.15);
    console.log('  재질이 실제로 움직였는가: %s (틴트 적용 %s개 · 휘도 델타 %s · 채도 델타 +%s)', matOk ? '✓' : '✗',
        mat.darkened, mat.err ? '?' : (mat.lAfter - mat.lBefore).toFixed(3), mat.err ? '?' : (mat.sAfter - mat.sBefore).toFixed(3));
    const pass = delta >= MIN_DELTA && matOk;
    console.log(`\n  판정: ${pass ? 'PASS — 일반 타격도 적 밝기가 눈에 띄게 움직인다' :
        'FAIL — 일반 타격에서 적 밝기가 사실상 안 움직인다(6차 지적 A #7 · B #2 가 맞다)'}`);
    console.log('\n  ⚠️ **다음 세션에 남기는 미해결 숙제** — 처방을 한 번 시도했다가 되돌렸다.');
    console.log('     `flashMesh` 의 가산 백색을 **재질 색을 주황 틴트(#ff5a1e)로 미는 방식**으로 바꿔 봤더니');
    console.log('     재질은 확실히 움직였는데(채도 0.036→0.671, 전 재질 5/5 적용) **렌더 프레임의 적 밝기·채도는');
    console.log('     거의 그대로였다**(일반 타격 화면 델타 0.0252→0.0221 로 오히려 소폭 하락). 즉 병목은');
    console.log('     `mat.color` 가 아니라 그 뒤 어딘가다 — 후보: ⑴ 림 셸/아웃라인이 몸통 색을 덮는다');
    console.log('     ⑵ 조명·블룸이 알베도 변화를 씻어낸다(알베도 0.437 이 화면 0.72 로 렌더된다) ⑶ 촬영');
    console.log('     하네스의 a1 프레임이 플래시 구간을 비껴간다. **먼저 이 셋 중 무엇인지부터 가릴 것** —');
    console.log('     안 가리고 색만 더 밀면 재질 수치만 오르고 화면은 그대로인 일이 반복된다.');
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
