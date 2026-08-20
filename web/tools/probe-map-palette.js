// 챕터별 맵 팔레트 응집도 실측 — `map-palette-unify` 의 자.
// 사용자 지적: "맵 색감이 제각각이라 한 세계로 안 읽힌다. 통일성 있는 색감으로."
// '통일성'을 눈이 아니라 숫자로 재기 위해, 챕터마다 캔버스 화소를 HSL 로 풀어 세 축을 잰다:
//   ⑴ offPal%  — 유채색 화소 중, 그 챕터의 주 색상 군집 3개(±40°)에 **어디에도 안 속하는** 채도가중
//                비율. 높을수록 "팔레트 밖 잡색"이 화면에 많다(항목 ⓐ 3~5색 하모니 위반).
//   ⑵ satIQR  — 유채색 화소 채도의 IQR(p75−p25). 높을수록 한 화면에 쨍한 원색과 탁한 색이
//                섞여 있다(항목 ⓑ 톤 불일치).
//   ⑶ hueSprd — 채도가중 색상 원형표준편차(°). 군집 무관한 전체 산포 — 참고 지표.
// 측정 규약:
//   · 영웅·적·펫·탈것은 숨긴다 — 맵(지형·프롭·하늘·안개·잔디)의 팔레트만 잰다.
//   · 시드 고정(shot-biomes 와 같은 LCG) — 프롭 배치가 챕터 간 대조를 흔들지 않게.
//   · 유채색 술어: s>0.15 && 0.06<l<0.96 (무채 지면·순흑/순백은 팔레트 판정에서 제외 —
//     소금사막·화산재처럼 의도적 무채 맵은 colorful% 자체가 낮게 나오는 것이 정상이다).
//   · 군집: 10° 히스토그램(채도가중)에서 최대 빈을 중심으로 ±20° 흡수, 3회 반복(= 주 색상 최대 3개).
//     offPal 은 세 중심 어디서도 ±40° 밖인 무게 비율.
// 사용: node probe-map-palette.js [ch]     — 감사 모드, 항상 exit 0. ch 지정 시 그 챕터만.
//       PAL_MAX_OFF=12 node probe-map-palette.js — 게이트 모드: offPal% 초과 챕터가 있으면 exit 1.
//       PAL_SHOT=1 — 챕터별 캔버스 스크린샷을 tools/map-pal-chNN.png 로 저장(눈 검수용).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const ONLY = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
const MAX_OFF = process.env.PAL_MAX_OFF ? parseFloat(process.env.PAL_MAX_OFF) : 0;
const SHOT = !!process.env.PAL_SHOT;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x51f3a7d;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const chList = [];
    const nCh = await page.evaluate(() => CHAPTER_THEMES.length);
    for (let i = 1; i <= nCh; i++) if (!ONLY || ONLY === i) chList.push(i);

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        ProChar.update = () => {};
        // 맵만 잰다 — 캐릭터 층은 전부 숨김
        if (Scene3D.heroG) Scene3D.heroG.visible = false;
        if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
        if (Scene3D.petG) Scene3D.petG.visible = false;
        for (const e of Scene3D.enemyMap.values()) if (e.g) e.g.visible = false;
        Scene3D.walking = false; Scene3D.worldX = 0;
    });

    const rows = [];
    for (const ch of chList) {
        const r = await page.evaluate((ch) => {
            Scene3D.setTheme(CHAPTER_THEMES[(ch - 1) % CHAPTER_THEMES.length]);
            // 챕터를 바꿔도 캐릭터 층은 계속 숨김(buildProps 가 다시 세우는 건 프롭뿐)
            if (Scene3D.heroG) Scene3D.heroG.visible = false;
            for (const e of Scene3D.enemyMap.values()) if (e.g) e.g.visible = false;
            const R = Scene3D.renderer, gl = R.getContext();
            const w = R.domElement.width, h = R.domElement.height;
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            const BINS = 36;
            const hist = new Float64Array(BINS);
            const sats = [];
            let wSum = 0, colorful = 0, total = w * h;
            // 원형 통계용
            let cx = 0, cy = 0;
            for (let p = 0; p < total; p++) {
                const i = p * 4, r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
                const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0);
                const l = (mx + mn) / 2;
                if (l <= 0.06 || l >= 0.96) continue;
                const c = mx - mn;
                const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
                if (s <= 0.15) continue;
                let hue;
                if (mx === r0) hue = ((g0 - b0) / c + 6) % 6;
                else if (mx === g0) hue = (b0 - r0) / c + 2;
                else hue = (r0 - g0) / c + 4;
                hue *= 60; // 0..360
                colorful++;
                sats.push(s);
                hist[Math.floor(hue / 10) % BINS] += s;
                wSum += s;
                const rad = hue * Math.PI / 180;
                cx += s * Math.cos(rad); cy += s * Math.sin(rad);
            }
            if (!wSum) return { ch, colorfulPct: 0, offPal: 0, satIQR: 0, hueSprd: 0, tops: [] };
            // 군집 3개: 최대 빈 중심 ±2빈(±20°) 흡수
            const hcopy = Array.from(hist);
            const centers = [];
            for (let k = 0; k < 3; k++) {
                let bi = 0;
                for (let b = 1; b < BINS; b++) if (hcopy[b] > hcopy[bi]) bi = b;
                if (hcopy[bi] <= 0) break;
                let cw = 0;
                for (let o = -2; o <= 2; o++) { const b = (bi + o + BINS) % BINS; cw += hcopy[b]; hcopy[b] = 0; }
                centers.push({ deg: bi * 10 + 5, w: cw });
            }
            // offPal: 세 중심 어디서도 ±40° 밖
            let offW = 0;
            for (let b = 0; b < BINS; b++) {
                if (!hist[b]) continue;
                const deg = b * 10 + 5;
                let near = false;
                for (const c of centers) {
                    let dd = Math.abs(deg - c.deg); if (dd > 180) dd = 360 - dd;
                    if (dd <= 40) { near = true; break; }
                }
                if (!near) offW += hist[b];
            }
            sats.sort((a, b) => a - b);
            const q = f => sats[Math.min(sats.length - 1, Math.floor(sats.length * f))];
            const Rbar = Math.sqrt(cx * cx + cy * cy) / wSum;
            const circStd = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(1e-9, Rbar)))) * 180 / Math.PI;
            return {
                ch,
                colorfulPct: +(colorful / total * 100).toFixed(1),
                offPal: +(offW / wSum * 100).toFixed(2),
                satIQR: +(q(0.75) - q(0.25)).toFixed(3),
                satP90: +q(0.90).toFixed(2),
                hueSprd: +circStd.toFixed(0),
                tops: centers.map(c => ({ deg: c.deg, pct: +(c.w / wSum * 100).toFixed(0) })),
            };
        }, ch);
        r.biome = await page.evaluate((ch) => CHAPTER_THEMES[(ch - 1) % CHAPTER_THEMES.length].biome, ch);
        rows.push(r);
        if (SHOT) {
            await page.waitForTimeout(120);
            await page.locator('#game3d').screenshot({ path: path.join(__dirname, `map-pal-ch${String(ch).padStart(2, '0')}.png`) });
        }
    }

    console.log('ch  biome     color%  offPal%  satIQR satP90 hueSprd  top hues (deg:share%)');
    let worst = null;
    for (const r of rows) {
        const t = (r.tops || []).map(c => `${c.deg}:${c.pct}`).join(' ');
        console.log(`${String(r.ch).padStart(2)}  ${String(r.biome).padEnd(9)} ${String(r.colorfulPct).padStart(5)}   ${String(r.offPal).padStart(6)}  ${String(r.satIQR).padStart(6)} ${String(r.satP90).padStart(5)}   ${String(r.hueSprd).padStart(4)}   ${t}`);
        if (!worst || r.offPal > worst.offPal) worst = r;
    }
    if (worst) console.log(`\nworst offPal: ch${worst.ch} (${worst.biome}) ${worst.offPal}%`);
    if (errs.length) { console.log('CONSOLE ERRORS:'); for (const e of errs) console.log('  ' + e); }

    await browser.close();
    if (MAX_OFF) {
        const bad = rows.filter(r => r.offPal > MAX_OFF);
        if (bad.length || errs.length) {
            console.log(`\n✗ FAIL — offPal>${MAX_OFF}%: ${bad.map(r => 'ch' + r.ch).join(',') || '없음'}${errs.length ? ' + 콘솔 에러' : ''}`);
            process.exit(1);
        }
        console.log(`\n✓ PASS — 전 챕터 offPal ≤ ${MAX_OFF}%`);
    }
    process.exit(0);
})();
