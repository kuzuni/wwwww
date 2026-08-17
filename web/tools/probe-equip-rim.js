// 림 라이트 추가 후 **밝은 물질의 클리핑 회귀 여부**만 빠르게 본다(전수 probe-equip-clip 은 8분).
// 가장 탈 위험이 큰 계열(silver·holo·fabric·bone·gold)에서 몇 칸만 렌더해 clip>5% 재발이 없는지 확인 +
// 육안 확인용 몽타주 PNG 저장. 사용: node probe-equip-rim.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const CLIP_MAX = 0.05;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async () => {
        const S = 128;
        Scene3D.itemThumb({ slot: 'armor', age: AGES[0], ageIdx: 0, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        // 밝은 물질을 가진 칸만 골라 담는다
        const want = ['silver', 'holo', 'fabric', 'bone', 'gold', 'alloy', 'plate'];
        const slots = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'];
        const picked = [];
        for (const age of AGES) {
            for (const slot of slots) {
                const names = (slot === 'helmet' || slot === 'armor')
                    ? ((ITEM_NAMES[age] || {})[slot] || []) : accNames(age, slot);
                names.forEach((name, nameIdx) => {
                    const sub = (typeof substanceOf === 'function' ? substanceOf(name) : null);
                    if (want.includes(sub)) picked.push({ age, ageIdx: AGES.indexOf(age), slot, nameIdx, name, sub });
                });
            }
        }
        // 물질당 최대 3칸으로 제한(속도)
        const perSub = {}; const cells = [];
        for (const c of picked) { perSub[c.sub] = (perSub[c.sub] || 0); if (perSub[c.sub] < 3) { cells.push(c); perSub[c.sub]++; } }

        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const cols = 8, rows = Math.ceil(cells.length / cols);
        const mont = document.createElement('canvas'); mont.width = cols * S; mont.height = rows * S;
        const mctx = mont.getContext('2d');
        const out = [];
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i];
            const url = Scene3D.itemThumb({ slot: c.slot, age: c.age, ageIdx: c.ageIdx, rarity: 'common', nameIdx: c.nameIdx });
            if (!url) { out.push(Object.assign({ fail: 'render' }, c)); continue; }
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            mctx.drawImage(img, (i % cols) * S, Math.floor(i / cols) * S, S, S);
            ctx.clearRect(0, 0, S, S); ctx.drawImage(img, 0, 0, S, S);
            const d = ctx.getImageData(0, 0, S, S).data;
            let ink = 0, clip = 0;
            for (let j = 0; j < d.length; j += 4) {
                if (d[j + 3] <= 24) continue; ink++;
                if (d[j] >= 250 && d[j + 1] >= 250 && d[j + 2] >= 250) clip++;
            }
            out.push(Object.assign({ ink, clip: clip / (ink || 1) }, c));
        }
        return { out, montage: mont.toDataURL() };
    });

    const ok = res.out.filter(r => !r.fail);
    const bad = ok.filter(r => r.clip > CLIP_MAX).sort((a, b) => b.clip - a.clip);
    const bySub = {};
    for (const r of ok) (bySub[r.sub] = bySub[r.sub] || []).push(r.clip);
    console.log('물질별 최대 클리핑:');
    Object.keys(bySub).sort().forEach(s => {
        const mx = Math.max(...bySub[s]);
        console.log(`  ${s.padEnd(8)} ${bySub[s].length}칸  최대 ${(mx * 100).toFixed(1)}%`);
    });
    console.log(`\n5% 초과 칸 ${bad.length} / ${ok.length}`);
    for (const r of bad.slice(0, 10)) console.log(`  ${r.age}/${r.slot}#${r.nameIdx} ${r.name} [${r.sub}] ${(r.clip * 100).toFixed(1)}%`);
    fs.writeFileSync(path.resolve(__dirname, '../ref/tmp-equip-rim.png'), Buffer.from(res.montage.split(',')[1], 'base64'));
    console.log('\n몽타주 저장: web/ref/tmp-equip-rim.png');
    console.log('콘솔 에러:', errors.length, errors.slice(0, 3));
    await browser.close();
    process.exit(bad.length === 0 && errors.length === 0 ? 0 : 1);
})();
