// 장비 디자인 중복 실측 — 사용: node probe-equip-dedupe.js
// '모든 장비의 목록'(renderForgeListView)이 내는 셀 전부를 그대로 재현해 썸네일을 굽고,
// ① 같은 시대 섹션 안에서 그림이 똑같은 칸이 몇 쌍인지 ② 전 시대 통틀어 몇 쌍인지 센다.
// 판정: 시대 안 중복 0쌍이면 사용자 지적("같은 슬롯 장비 5개가 전부 똑같은 아이콘")이 해소된 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const data = await page.evaluate(() => {
        const rows = [];
        for (const age of AGES) {
            const ageIdx = AGES.indexOf(age);
            for (const wtype of weaponsOfAge(age)) {
                rows.push({ age, slot: 'weapon', wtype, nameIdx: wtype, label: (WEAPON_TYPES[wtype] || {}).kr || wtype });
            }
            for (const slot of ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt']) {
                const names = (slot === 'helmet' || slot === 'armor')
                    ? ((ITEM_NAMES[age] && ITEM_NAMES[age][slot]) || [])
                    : accNames(age, slot);
                names.forEach((name, i) => rows.push({ age, slot, wtype: null, nameIdx: i, label: name }));
            }
            void ageIdx;
        }
        // 목록 화면과 완전히 같은 인자로 굽는다
        for (const r of rows) {
            r.url = Scene3D.itemThumb({
                slot: r.slot, age: r.age, ageIdx: AGES.indexOf(r.age), rarity: 'common',
                wtype: r.wtype, nameIdx: r.nameIdx,
            });
        }
        return rows;
    });

    // 픽셀이 한 톨이라도 다르면 '고유'로 세는 건 너무 무른 판정이다(재질 노이즈만으로도 통과).
    // 눈으로 구분되는지를 보려면 실루엣(알파)과 색을 16×16으로 줄인 서명으로 재야 한다.
    const sigs = await page.evaluate(async (urls) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 16;
        const cx = cv.getContext('2d');
        const out = [];
        for (const u of urls) {
            if (!u) { out.push(null); continue; }
            const img = new Image();
            await new Promise(res => { img.onload = res; img.onerror = res; img.src = u; });
            cx.clearRect(0, 0, 16, 16);
            cx.drawImage(img, 0, 0, 16, 16);
            const d = cx.getImageData(0, 0, 16, 16).data;
            const al = [], rgb = [];
            for (let i = 0; i < 256; i++) {
                al.push(d[i * 4 + 3] / 255);
                rgb.push(d[i * 4] / 255, d[i * 4 + 1] / 255, d[i * 4 + 2] / 255);
            }
            out.push({ al, rgb });
        }
        return out;
    }, data.map(r => r.url));
    data.forEach((r, i) => { r.sig = sigs[i]; });

    // 실루엣 차이 = 알파 IoU 여집합, 색 차이 = 겹친 영역 평균 RGB 거리
    const dist = (a, b) => {
        let inter = 0, uni = 0, cs = 0, cn = 0;
        for (let i = 0; i < 256; i++) {
            const x = a.al[i] > 0.5, y = b.al[i] > 0.5;
            if (x && y) inter++;
            if (x || y) uni++;
            if (x && y) {
                cs += Math.abs(a.rgb[i * 3] - b.rgb[i * 3]) + Math.abs(a.rgb[i * 3 + 1] - b.rgb[i * 3 + 1]) + Math.abs(a.rgb[i * 3 + 2] - b.rgb[i * 3 + 2]);
                cn++;
            }
        }
        const shape = uni ? 1 - inter / uni : 0;          // 0 = 실루엣 동일
        const color = cn ? cs / cn / 3 : 0;               // 0 = 색 동일
        return { shape, color, score: shape + color };
    };

    const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; };
    const byAge = {};
    let nullCount = 0;
    for (const r of data) {
        if (!r.url) { nullCount++; continue; }
        r.h = hash(r.url);
        (byAge[r.age] = byAge[r.age] || []).push(r);
    }
    let dupPairsInAge = 0, dupCells = 0;
    for (const age of Object.keys(byAge)) {
        const m = {};
        for (const r of byAge[age]) (m[r.h] = m[r.h] || []).push(r);
        const groups = Object.values(m).filter(g => g.length > 1);
        for (const g of groups) { dupPairsInAge += g.length * (g.length - 1) / 2; dupCells += g.length; }
        const cells = byAge[age].length;
        console.log(`${age.padEnd(13)} 칸 ${String(cells).padStart(3)}  고유 ${String(Object.keys(m).length).padStart(3)}  중복묶음 ${groups.length}`);
        for (const g of groups) console.log(`    ⚠ 동일: ${g.map(r => `${r.slot}/${r.label}`).join(' = ')}`);
    }
    const all = {};
    for (const r of data) if (r.url) (all[r.h] = all[r.h] || []).push(r);
    console.log(`\n총 칸 ${data.length}  렌더실패 ${nullCount}  전체고유 ${Object.keys(all).length}`);
    console.log(`시대 내 중복쌍 ${dupPairsInAge} (해당 칸 ${dupCells})`);

    // --- 눈에 보이는 중복: 시대 안에서 서명이 거의 같은 쌍 ---
    const NEAR = 0.10;   // shape+color 합이 이 밑이면 '사실상 같은 그림'
    let near = [];
    for (const age of Object.keys(byAge)) {
        const g = byAge[age].filter(r => r.sig);
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
            const d = dist(g[i].sig, g[j].sig);
            if (d.score < NEAR) near.push({ age, a: g[i], b: g[j], d });
        }
    }
    near.sort((x, y) => x.d.score - y.d.score);
    console.log(`\n[지각 중복] 시대 안에서 서명 차이 < ${NEAR} 인 쌍: ${near.length}`);
    for (const n of near.slice(0, 40)) {
        console.log(`  ${n.age.padEnd(12)} ${n.a.slot}/${n.a.label}  ≈  ${n.b.slot}/${n.b.label}   (실루엣 ${n.d.shape.toFixed(3)} 색 ${n.d.color.toFixed(3)})`);
    }
    if (near.length > 40) console.log(`  ... 외 ${near.length - 40}쌍`);
    console.log('콘솔 에러:', errors.length, errors.slice(0, 5));
    await browser.close();
})();
