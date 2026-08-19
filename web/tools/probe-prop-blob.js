// 접지 블롭 섀도우가 '캐스터 없는 얼룩'인지 실측 — `map-quality-up` 잔여 결함 ㉠′.
// 3라운드 비평가 2인이 각각 최우선으로 꼽은 것: "ch3 좌상단에 **드리울 물체가 화면에 없는** 거대한
// 새까만 아메바 얼룩", "ch9 지면에 회색 로젠지 얼룩 3~4개".
//
// 무엇을 재는가: 소품마다 **블롭의 월드 반경 ÷ 그 소품 자신의 XZ 실루엣 반경**.
//   · 1 을 크게 넘으면 그림자가 제 물체보다 넓다 = 화면에서 '위에 아무것도 없는 얼룩'으로 읽힌다.
//   · 너무 작아도 안 된다(접지 단서가 사라져 '떠 있는 스티커'). 그래서 하한도 같이 본다.
// ⚠️ 값을 손으로 베끼지 말 것 — 블롭 크기도 소품 크기도 **씬에서 실제로 만들어진 것**을 재고,
//    소품의 로컬 스케일·지터가 이미 곱해진 **월드 박스**로 견준다(TODO 함정 ④).
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-prop-blob.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CHAPTERS = [1, 2, 3, 5, 7, 9];   // 초원·사막·바위산·밤숲·마법·용암 — 프롭 세트가 다른 바이옴
const HI = 1.65;   // 블롭 반경 / 소품 반경 상한 — 이 위는 '캐스터 없는 얼룩'
const LO = 0.35;   // 하한 — 이 아래는 접지 단서 소실

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.trees)) break;
        await page.waitForTimeout(200);
    }

    const rows = [];
    for (const ch of CHAPTERS) {
        const r = await page.evaluate((chapter) => {
            Scene3D.setChapterTheme(chapter);
            const out = [];
            // ⚠️ `Scene3D.trees` 만 훑으면 **큰 소품만** 본다 — 풀·덤불·바위 같은 작은 소품은 `grounded()`
            //    가 만든 별도 그룹이라 거기 없다. 큰 것만 고치고 작은 것에 옛 얼룩이 남는 사고를 못 잡으므로
            //    씬 전체에서 블롭을 찾아 **그 블롭을 품은 그룹**을 소품으로 본다.
            const groups = new Set(Scene3D.trees);
            Scene3D.scene.traverse(o => {
                if (o.isMesh && o.material === Scene3D.blobShadowMat && o.parent) groups.add(o.parent);
            });
            for (const t of groups) {
                // 블롭만 골라낸다 — 공유 지오메트리 평면에 블롭 계열 재질이 붙은 것
                // 직속 자식 블롭만 — 중첩 그룹에서 손자 블롭까지 집으면 한 소품을 두 번 세게 된다
                const blobs = t.children.filter(o => o.isMesh && o.material === Scene3D.blobShadowMat);
                if (!blobs.length) continue;
                for (const b of blobs) {
                    b.updateWorldMatrix(true, false);
                    // 블롭은 1×1 평면이라 월드 반경 = 스케일 × 0.5 (부모 스케일까지 곱해진 월드 스케일로)
                    const ws = new THREE.Vector3();
                    b.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
                    const blobR = Math.max(ws.x, ws.y, ws.z) * 0.5;
                    // 소품 실루엣 반경 — 블롭 자신은 빼고 잰다(블롭을 포함하면 블롭이 제 크기를 정당화한다)
                    const box = new THREE.Box3();
                    let any = false;
                    t.traverse(o => {
                        if (!o.isMesh || o.material === Scene3D.blobShadowMat) return;
                        o.updateWorldMatrix(true, false);
                        const bb = new THREE.Box3().setFromObject(o);
                        if (bb.isEmpty()) return;
                        box.union(bb); any = true;
                    });
                    if (!any) continue;
                    const size = new THREE.Vector3(); box.getSize(size);
                    const propR = Math.max(size.x, size.z) / 2;
                    out.push({ blobR: +blobR.toFixed(3), propR: +propR.toFixed(3), ratio: +(blobR / Math.max(1e-6, propR)).toFixed(3) });
                }
            }
            return out;
        }, ch);
        const ratios = r.map(v => v.ratio).sort((a, b) => a - b);
        const worst = r.slice().sort((a, b) => b.ratio - a.ratio)[0];
        rows.push({
            ch, n: r.length,
            med: ratios.length ? ratios[Math.floor(ratios.length / 2)] : null,
            max: ratios.length ? ratios[ratios.length - 1] : null,
            min: ratios.length ? ratios[0] : null,
            over: r.filter(v => v.ratio > HI).length,
            under: r.filter(v => v.ratio < LO).length,
            worst,
        });
    }

    console.log('접지 블롭 vs 소품 실루엣 (블롭 반경 ÷ 소품 반경)');
    for (const r of rows) {
        console.log(`  ch${String(r.ch).padStart(2)}  n=${String(r.n).padStart(3)}  중앙 ${String(r.med).padStart(6)}  최소 ${String(r.min).padStart(6)}  최대 ${String(r.max).padStart(6)}`
            + `  상한(${HI}) 초과 ${r.over}건 · 하한(${LO}) 미만 ${r.under}건`
            + (r.worst ? `  ← 최악: 블롭 ${r.worst.blobR} vs 소품 ${r.worst.propR}` : ''));
    }
    const over = rows.reduce((a, r) => a + r.over, 0);
    const under = rows.reduce((a, r) => a + r.under, 0);
    const n = rows.reduce((a, r) => a + r.n, 0);
    const ok = (name, cond, d) => console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${d === undefined ? '' : ` — ${d}`}`);
    ok(`블롭이 소품보다 크게 번지지 않는다 (비 ≤ ${HI})`, over === 0, `${over}/${n}건 초과`);
    ok(`접지 단서가 사라지지 않는다 (비 ≥ ${LO})`, under === 0, `${under}/${n}건 미만`);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
