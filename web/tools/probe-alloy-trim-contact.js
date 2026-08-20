// 합금(alloy) 시대 트림의 **표면 접지** 실측 — 사용: node probe-alloy-trim-contact.js
// 배경 (TODO 🐛 slug: alloy-trim-bar-float): `Scene3D.addAgeTrim` 의 alloy 분기는 정면 세로
// 발광 스트립을 `size.y*0.3` 높이의 **박스 한 덩어리**로 세우고 z 를 링 반경 하나로 고정했다.
// 투구는 구형이라 높이가 오를수록 실반경이 급히 줄어드는데 막대는 안 줄어드니, 막대 위쪽이
// 셸을 떠나 **정수리 앞 허공에 뜬 분홍 막대**가 된다. 눈으로만 잡히던 것을 수치로 문다.
//
// 재는 법: 트림 스트립(BoxGeometry, userData.ageTrim 표식)을 긴 축으로 잘게 샘플하고, 각
// 샘플 높이에서 **바깥에서 축을 향해 레이캐스트**해 본체(트림이 아닌 메시)의 표면 z 를 찾는다.
//   틈 = (스트립 안쪽 면 − 표면) · 바깥방향   → 양수면 그만큼 떠 있다.
// ⚠️ 트림끼리는 서로 가리므로 레이 대상에서 **ageTrim 표식이 붙은 메시는 제외**한다
//    (링이 스트립 앞을 스치면 '표면이 여기 있다'고 거짓말한다).
// ⚠️ 표면이 아예 없는 높이(셸보다 위)는 틈이 무한대다 — `표면없음` 샘플로 따로 센다.
//    이게 이 버그의 본체다: 막대가 조형 밖으로 자라 있는 것.
//
// 게이트: 모든 칸에서 `표면없음 = 0` 이고 `최대 틈 ≤ GAP_MAX`.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const GAP_MAX = 0.012;   // 12mm — 스트립 두께(12mm)의 1배. 이보다 뜨면 눈에 띄는 부유다.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.addAgeTrim');

    const res = await page.evaluate(({ GAP_MAX }) => {
        const rows = [];
        const ages = AGES.filter(a => Scene3D.ageGearKind(a) === 'alloy');
        const ray = new THREE.Raycaster();
        ray.far = 100;

        const measure = (model) => {
            model.updateMatrixWorld(true);
            const bb = new THREE.Box3().setFromObject(model);
            const ctr = bb.getCenter(new THREE.Vector3());
            const body = [], strips = [];
            model.traverse(o => {
                if (!o.isMesh) return;
                if (o.userData.ageTrim) {
                    // 세로 스트립만 본다 — 링(토러스)·구슬은 이 항목 소관이 아니다.
                    if (o.geometry && o.geometry.type === 'BoxGeometry') strips.push(o);
                } else body.push(o);
            });
            if (!strips.length) return null;
            let worst = 0, none = 0, samples = 0;
            for (const s of strips) {
                s.geometry.computeBoundingBox();
                const gb = s.geometry.boundingBox;
                const half = (gb.max.z - gb.min.z) * 0.5;      // 스트립 두께의 절반(로컬 z)
                const N = 9;
                for (let i = 0; i < N; i++) {
                    const t = gb.min.y + (gb.max.y - gb.min.y) * (i / (N - 1));
                    const p = s.localToWorld(new THREE.Vector3(0, t, 0));
                    const dir = (p.z - ctr.z) >= 0 ? 1 : -1;   // 스트립이 붙은 쪽(정면/후면)
                    samples++;
                    ray.set(new THREE.Vector3(p.x, p.y, ctr.z + dir * 50), new THREE.Vector3(0, 0, -dir));
                    const hit = ray.intersectObjects(body, true)[0];
                    if (!hit) { none++; continue; }
                    // 스트립 안쪽 면이 표면보다 얼마나 바깥에 있나
                    const gap = (p.z - dir * half - hit.point.z) * dir;
                    if (gap > worst) worst = gap;
                }
            }
            return { worst, none, samples };
        };

        for (const age of ages) {
            const ageIdx = AGES.indexOf(age);
            for (const slot of ['helmet', 'armor']) {
                const names = ((ITEM_NAMES[age] || {})[slot]) || [];
                const n = Math.max(1, names.length);
                for (let i = 0; i < n; i++) {
                    const item = { slot, age, ageIdx, rarity: 'rare', nameIdx: i };
                    const style = itemStyleOf(item), nm = itemNameOf(item);
                    let m;
                    try {
                        m = slot === 'helmet'
                            ? Scene3D.makeHelmet(age, 'rare', style, nm)
                            : Scene3D.makeArmorPreview(age, 'rare', style, nm);
                    } catch (e) { rows.push({ label: `${age}/${slot}#${i}`, err: String(e) }); continue; }
                    const r = measure(m);
                    if (r) rows.push({ label: `${age}/${slot}#${i} ${nm}`, style, ...r });
                }
            }
        }
        return { rows, GAP_MAX };
    }, { GAP_MAX });

    const rows = res.rows;
    const bad = rows.filter(r => r.err || r.none > 0 || r.worst > GAP_MAX);
    console.log(`스트립을 가진 칸 ${rows.length}  (게이트: 표면없음 0 · 최대 틈 ≤ ${GAP_MAX})`);
    if (rows.length) {
        const worst = rows.reduce((a, b) => (b.worst || 0) > (a.worst || 0) ? b : a);
        const noneTot = rows.reduce((s, r) => s + (r.none || 0), 0);
        const sampTot = rows.reduce((s, r) => s + (r.samples || 0), 0);
        console.log(`최대 틈 ${(worst.worst || 0).toFixed(4)} (${worst.label})  ·  표면없음 샘플 ${noneTot}/${sampTot}`);
    }
    for (const r of bad) {
        if (r.err) { console.log(`  [예외] ${r.label} ${r.err}`); continue; }
        console.log(`  [부유] ${r.label} (${r.style})  최대 틈 ${r.worst.toFixed(4)}  표면없음 ${r.none}/${r.samples}`);
    }
    console.log(bad.length ? `❌ ${bad.length} / ${rows.length} 칸 부유` : `✅ 전 칸 접지`);
    console.log('콘솔 에러:', errors.length, errors.slice(0, 3));
    await browser.close();
    process.exit(bad.length || errors.length ? 1 : 0);
})();
