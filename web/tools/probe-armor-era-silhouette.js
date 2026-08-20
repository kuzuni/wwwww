// 같은 갑옷 **스타일**이 시대를 넘어 갈리는가 — 크로스-시대 실루엣 게이트.
// 사용: node probe-armor-era-silhouette.js   (LIST=1 이면 전 쌍을 다 찍는다)
//
// 왜 `probe-equip-silhouette.js` 로는 안 되는가 — 그 게이트는 **한 시대 안에서** 스타일끼리만
// 잰다(`(부위, 시대)` 그룹). 그런데 `equip-era-theming` 의 사용자 지적("전부 중세 같은 디자인임",
// "등급 달라져도 다 비슷비슷")과 비평가 R2 교집합 ㉠ 이 가리키는 결함은 정확히 그 **직교 축**이다:
// 같은 스타일이 여러 시대에 배정돼 **색만 바뀐 같은 메시**로 나온다. 시대 안 게이트는 이걸
// 구조적으로 못 본다 — 시대마다 스타일이 5종이라 시대 안에서는 늘 갈려 보인다.
// 실제로 비평가 B 가 실루엣을 이진화해 `tactical` 4칸(성간 코트·가상 슈트·입자 조끼·재의 조끼)에서
// IoU 0.94~0.97 을 재 왔고, 그건 이 저장소의 어떤 자동 게이트에도 걸리지 않았다.
//
// 지표는 위 게이트와 **같은 두 축**을 쓴다(같은 임계값이라 숫자를 나란히 읽을 수 있다):
//   shapeIoU : 96px 알파 마스크 교집합/합집합 (1.0 = 같은 덩어리)
//   profD    : 96행 각각의 실루엣 폭을 정규화해 뺀 평균 절대차 (0 = 같은 윤곽)
// 통과 = IoU ≤ 0.90 **이거나** 윤곽차 ≥ 0.055.
//
// ⚠️ **GATED 밖은 재기만 하고 반려하지 않는다.** 이 항목은 조형을 시대별로 하나씩 갈라 나가는
//    중이라, 아직 손대지 않은 공용 조형(`cape` 10시대 · `robe` 7~9 · `suit`·`plate`, 그리고 `vest`
//    안에서도 아직 **장식만** 갈린 6칸)까지 지금 빨갛게 물리면 `regress.sh` 가 HEAD 에서 통째로
//    빨개진다. **한 칸을 갈랐으면 그때 GATED 에 추가할 것** — 안 그러면 갈라 놓고도 회귀를 못 막는다.
//    아래 두 표('게이트 밖 vest' · '미게이트 스타일')가 다음에 칠 순서다(안 갈린 순).
// 🚨 **'장식이 갈렸다'와 '외곽선이 갈렸다'는 다르다 — 이 게이트가 재는 건 뒤엣것뿐이다.**
//    `vest` 6칸(hunter·mail·waistcoat·sealed·radiant·tactical)은 앞선 세션들이 가슴 부속·어깨 처리를
//    시대별로 갈라 뒀는데, 96px 실루엣으로 재면 여전히 IoU 0.92~0.98 로 붙는다(2026-08-20 실측).
//    전부 **몸통 반경 안쪽**에서만 갈렸기 때문이다 — 비평가 A 가 "96px 에서 구분되는 건 hunter
//    한 칸뿐, 10칸이 실질 3덩어리"라고 적은 게 이 수치다. 이번에 새로 판 4칸이 통과하는 이유는
//    자락·케이지·링·파편이 **몸통 밖으로 나가** 바깥 윤곽을 스스로 지기 때문이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const IOU_MAX = 0.90;
const PROF_MIN = 0.055;
// 외곽선까지 갈라 둔 칸 — `style` → 그 스타일에서 완료된 `age` 목록.
// 쌍의 **한쪽이라도** 여기 들어 있으면 반려 대상이다(완료한 칸이 어떤 칸과도 안 붙어야 하므로).
// 스타일 전체를 마쳤으면 `'*'` 한 줄로 적는다.
const GATED = {
    vest: ['interstellar', 'multiverse', 'quantum', 'underworld'],   // starcoat · wire · orbit · ashen
    cape: ['*'],                                                     // 10시대 전부 시대 조형으로 갈랐다
    robe: ['*'],                                                     // 9시대 전부 자락 윤곽으로 갈랐다
    suit: ['*'],                                                     // 8시대 전부 어깨 위 표식으로 갈랐다
};
const LIST = !!process.env.LIST;
const isGated = (style, age) => {
    const l = GATED[style];
    return !!l && (l[0] === '*' || l.includes(age));
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async () => {
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(256, 256);
        Scene3D._thumbCache = {};

        // ⚠️ 손으로 베낀 목록을 두지 말 것 — 표에서 직접 뽑는다(`probe-equip-silhouette` 와 같은 이유).
        //    이름(`itemNameOf`)도 같이 넘긴다: `ageGearMats` 가 이름으로 물질을 갈아끼우므로
        //    빈 이름으로 재면 실제 화면에 안 나오는 조합을 재게 된다.
        const jobs = [];
        const out = [];
        const buildErrs = [];
        const N = 96;
        const t = document.createElement('canvas'); t.width = t.height = N;
        const tc = t.getContext('2d', { willReadFrequently: true });

        const shoot = (make) => {
            const model = make();
            const sc = Scene3D._thumbScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
            const g = new THREE.Group();
            g.add(model); sc.add(g);
            const d = Scene3D.ITEM_THUMB_DIR;
            Scene3D.thumbFrameToFit(Scene3D._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
            Scene3D._thumbR.render(sc, Scene3D._thumbCam);
            return Scene3D._thumbR.domElement.toDataURL();
        };

        for (const age of AGES) {
            const styles = ARMOR_STYLES[age] || [];
            for (let i = 0; i < styles.length; i++) {
                const st = styles[i];
                const nm = (typeof itemNameOf === 'function') ? itemNameOf({ slot: 'armor', age, nameIdx: i }) : '';
                let url = null;
                try { url = shoot(() => Scene3D.makeArmorPreview(age, 'rare', st, nm)); }
                catch (e) { buildErrs.push(st + '@' + age + ': ' + e.message); }
                if (!url) continue;
                jobs.push(new Promise(resolve => {
                    const im = new Image();
                    im.onload = () => {
                        tc.clearRect(0, 0, N, N);
                        tc.drawImage(im, 0, 0, N, N);
                        const d = tc.getImageData(0, 0, N, N).data;
                        const mask = new Uint8Array(N * N);
                        for (let k = 0; k < N * N; k++) if (d[k * 4 + 3] > 24) mask[k] = 1;
                        const rowW = new Float32Array(N);
                        for (let y = 0; y < N; y++) {
                            let lo = -1, hi = -1;
                            for (let x = 0; x < N; x++) if (mask[y * N + x]) { if (lo < 0) lo = x; hi = x; }
                            rowW[y] = lo < 0 ? 0 : (hi - lo + 1) / N;
                        }
                        out.push({ style: st, age, name: nm, mask: Array.from(mask), rowW: Array.from(rowW) });
                        resolve();
                    };
                    im.onerror = () => resolve();
                    im.src = url;
                }));
            }
        }
        await Promise.all(jobs);
        return { out, buildErrs, ages: AGES.slice() };
    });

    const cells = res.out;
    if (!cells.length) { console.log('FAIL — 굽힌 칸이 0'); await browser.close(); process.exit(1); }

    const iou = (a, b) => {
        let inter = 0, uni = 0;
        for (let i = 0; i < a.mask.length; i++) { const x = a.mask[i], y = b.mask[i]; if (x && y) inter++; if (x || y) uni++; }
        return uni ? inter / uni : 1;
    };
    const profD = (a, b) => {
        let s = 0;
        for (let i = 0; i < a.rowW.length; i++) s += Math.abs(a.rowW[i] - b.rowW[i]);
        return s / a.rowW.length;
    };

    // 스타일별로 묶는다 — 이 게이트의 축은 '같은 스타일이 시대를 넘어 갈리는가'다.
    const byStyle = {};
    for (const c of cells) (byStyle[c.style] = byStyle[c.style] || []).push(c);

    const rows = [];
    const gatedFails = [];
    for (const st of Object.keys(byStyle).sort()) {
        const g = byStyle[st];
        const row = { st, n: g.length, pairs: 0, bad: 0, gBad: 0, worstIou: 0, worstProf: 0, worstPair: '(시대 1곳뿐)', gated: !!GATED[st], free: [] };
        let wi = -1, wp = 0;
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
            row.pairs++;
            const s = iou(g[i], g[j]), p = profD(g[i], g[j]);
            const pass = s <= IOU_MAX || p >= PROF_MIN;
            const gated = isGated(st, g[i].age) || isGated(st, g[j].age);
            const tag = `${g[i].age}/${g[i].name} vs ${g[j].age}/${g[j].name}`;
            if (!pass) {
                row.bad++;
                if (gated) { row.gBad++; gatedFails.push({ st, tag, s, p }); }
                else row.free.push({ tag, s, p });
            }
            // '가장 안 갈린 쌍' = IoU 높고 윤곽차 작은 쪽
            if (s - p * 4 > wi - wp * 4) { wi = s; wp = p; row.worstPair = tag + (gated ? ' [게이트]' : ''); }
            if (LIST) console.log(`    ${pass ? 'ok  ' : 'FAIL'}${gated ? '*' : ' '} ${st.padEnd(9)} ${tag.padEnd(52)} IoU ${s.toFixed(3)} 윤곽차 ${p.toFixed(4)}`);
        }
        row.worstIou = wi < 0 ? 0 : wi; row.worstProf = wp;
        row.free.sort((x, y) => (y.s - y.p * 4) - (x.s - x.p * 4));
        rows.push(row);
    }

    const gDesc = Object.keys(GATED).map(k => k + '[' + GATED[k].join(',') + ']').join(' ');
    console.log(`칸 ${cells.length} · 스타일 ${rows.length} · 게이트 대상 ${gDesc}`);
    console.log(`게이트: 같은 스타일의 시대 쌍마다 IoU ≤ ${IOU_MAX} 이거나 윤곽차 ≥ ${PROF_MIN} (쌍의 한쪽이라도 게이트 칸이면 반려 대상)`);
    console.log('— 스타일별 —');
    for (const r of rows.slice().sort((a, b) => (b.worstIou - b.worstProf * 4) - (a.worstIou - a.worstProf * 4)))
        console.log(`  ${r.gBad ? 'FAIL' : 'ok  '} ${r.st.padEnd(9)} 시대 ${String(r.n).padStart(2)} · 쌍 ${String(r.pairs).padStart(2)} · 미분화 ${String(r.bad).padStart(2)}(게이트 ${r.gBad}) · 최악 IoU ${r.worstIou.toFixed(3)} 윤곽차 ${r.worstProf.toFixed(4)}  ${r.worstPair}`);
    if (gatedFails.length) {
        console.log('— 반려된 쌍 —');
        for (const b of gatedFails) console.log(`      · ${b.st} ${b.tag} IoU ${b.s.toFixed(3)} 윤곽차 ${b.p.toFixed(4)}`);
    }
    console.log('— 게이트 밖에서 아직 안 갈린 쌍(다음 착수 지점, 안 갈린 순 12) —');
    const freeAll = [];
    for (const r of rows) for (const f of r.free) freeAll.push({ st: r.st, ...f });
    freeAll.sort((x, y) => (y.s - y.p * 4) - (x.s - x.p * 4));
    for (const f of freeAll.slice(0, 12)) console.log(`       ${f.st.padEnd(9)} ${f.tag.padEnd(52)} IoU ${f.s.toFixed(3)} 윤곽차 ${f.p.toFixed(4)}`);
    console.log(`       … 게이트 밖 미분화 총 ${freeAll.length}쌍`);

    if (res.buildErrs.length) console.log('모델 빌드 실패:', res.buildErrs.join(' | '));
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    const failed = gatedFails.length;
    console.log(failed ? `\n반려 — 게이트 대상 미분화 ${failed}쌍` : `\nPASS — 게이트 대상 미분화 0쌍`);
    await browser.close();
    process.exit(failed || res.buildErrs.length || errors.length ? 1 : 0);
})();
