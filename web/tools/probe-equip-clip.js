// 장비 썸네일 노출(하이라이트 클리핑) 실측 — 사용: node probe-equip-clip.js
// 배경: 장비 썸네일 렌더러(_thumbR)만 **톤매핑도 sRGB 인코딩도 없이** AmbientLight 0.85 +
// DirectionalLight 0.8 을 쓴다(생물 썸네일 렌더러는 sRGB + ACESFilmic 을 쓴다).
// 그래서 밝은 물질(bone·fabric·silver·gold)이 순백으로 타 버려 형태 정보가 통째로 사라진다
// — 비평가 1차 채점의 D3 지적("원시 시트 피사체의 33.6%가 순백 클리핑, '뼈'의 상아색·결이
// 하나도 안 보인다")이 이것이다.
//
// 재는 것: 알파가 있는 피사체 픽셀 중
//   ① clip  = R,G,B 세 채널이 전부 250 이상 (형태 정보가 소실된 순백)
//   ② hot   = 채널 하나라도 250 이상 (스펙큘러가 타기 시작한 지점)
// 물질(substance)별로 묶어 어느 계열이 타는지까지 찍는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CLIP_MAX = 0.05;   // 피사체 픽셀의 5% 초과가 순백이면 불합격

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
        const slots = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'];
        const cells = [];
        for (const age of AGES) {
            for (const slot of slots) {
                const names = (slot === 'helmet' || slot === 'armor')
                    ? ((ITEM_NAMES[age] || {})[slot] || []) : accNames(age, slot);
                names.forEach((name, nameIdx) => cells.push({ age, ageIdx: AGES.indexOf(age), slot, nameIdx, name }));
            }
        }
        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const out = [];
        for (const c of cells) {
            const url = Scene3D.itemThumb({ slot: c.slot, age: c.age, ageIdx: c.ageIdx, rarity: 'common', nameIdx: c.nameIdx });
            if (!url) { out.push(Object.assign({ fail: 'render' }, c)); continue; }
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            ctx.clearRect(0, 0, S, S);
            ctx.drawImage(img, 0, 0, S, S);
            const d = ctx.getImageData(0, 0, S, S).data;
            let ink = 0, clip = 0, hot = 0, lum = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] <= 24) continue;
                ink++;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                if (r >= 250 && g >= 250 && b >= 250) clip++;
                if (r >= 250 || g >= 250 || b >= 250) hot++;
                lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }
            out.push(Object.assign({
                ink, clip: clip / (ink || 1), hot: hot / (ink || 1), lum: lum / (ink || 1),
                sub: (typeof substanceOf === 'function' ? substanceOf(c.name) : null) || '시대재질',
            }, c));
        }
        return out;
    });

    const ok = res.filter(r => !r.fail);
    const pct = v => (v * 100).toFixed(1) + '%';
    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const wAvg = (a, k) => a.reduce((s, r) => s + r[k] * r.ink, 0) / (a.reduce((s, r) => s + r.ink, 0) || 1);

    console.log(`총 칸 ${res.length}  렌더실패 ${res.length - ok.length}`);
    console.log(`전체 피사체 픽셀 중 순백 클리핑 ${pct(wAvg(ok, 'clip'))}  (채널 1개 이상 포화 ${pct(wAvg(ok, 'hot'))})`);
    console.log(`평균 휘도 ${avg(ok.map(r => r.lum)).toFixed(1)} / 255`);

    const bySub = {};
    for (const r of ok) (bySub[r.sub] = bySub[r.sub] || []).push(r);
    console.log('\n물질별 순백 클리핑 (칸수 · 클리핑 · 평균휘도):');
    Object.keys(bySub).sort((a, b) => wAvg(bySub[b], 'clip') - wAvg(bySub[a], 'clip')).forEach(s => {
        const a = bySub[s];
        console.log(`  ${s.padEnd(10)} ${String(a.length).padStart(3)}칸  클리핑 ${pct(wAvg(a, 'clip')).padStart(6)}  휘도 ${avg(a.map(r => r.lum)).toFixed(1)}`);
    });

    const bad = ok.filter(r => r.clip > CLIP_MAX).sort((a, b) => b.clip - a.clip);
    console.log(`\n클리핑 ${pct(CLIP_MAX)} 초과 칸 ${bad.length} / ${ok.length}`);
    for (const r of bad.slice(0, 25)) console.log(`  ${r.age}/${r.slot}#${r.nameIdx} ${r.name} [${r.sub}]  클리핑 ${pct(r.clip)}  휘도 ${r.lum.toFixed(0)}`);
    if (bad.length > 25) console.log(`  … 외 ${bad.length - 25}칸`);
    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 5));

    await browser.close();
    process.exit(bad.length === 0 && errors.length === 0 ? 0 : 1);
})();
