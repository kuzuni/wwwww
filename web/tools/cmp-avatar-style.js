// 아바타 **화풍** 대조판 — 원본 스크린샷에서 오려낸 실제 아바타 타일과 클론 24종을 한 장에 놓는다.
// 항목의 통과 기준 ⑸ 가 '원본 도트 초상과 나란히 놓고 같은 게임의 아바타인가' 라서, 비평가에게
// 줄 그림이 필요하다. 눈대중 방지: 원본 쪽은 좌표로 오려낸 **진짜 픽셀**이지 재현이 아니다.
//
// 사용: node tools/cmp-avatar-style.js [out.png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'ref-cmp/cmp/avatar-style.png');

// 원본에서 오려낼 아바타 타일 [shotId, x, y, 한 변]
const REF_TILES = [
    ['043500', 63, 58, 45],    // 새싹 무 크리처 (채팅)
    ['043500', 63, 150, 45],   // 붉은 사무라이 오니
    ['043500', 63, 270, 45],   // 수염 사내
    ['043500', 63, 328, 45],   // 왕관 쓴 금발
    ['043500', 63, 393, 45],   // 초록 머리띠 소년
    ['043500', 63, 523, 45],   // 기본 실루엣
    ['043224', 17, 11, 45],    // 티라노 (상단바)
    ['042228', 86, 305, 47],   // 고글 사내 (리그 도전)
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof IconGen !== 'undefined' && typeof AVATAR_POOL !== 'undefined', null, { timeout: 150000 });

    const clone = await page.evaluate(() => AVATAR_POOL.map(e => IconGen.url(IconGen.avatarKey(e))));

    // 원본 타일을 캔버스로 오려 dataURL 로 뽑는다.
    const refs = [];
    for (const [id, x, y, w] of REF_TILES) {
        const src = 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, `../ref/screens/shot-${id}.png`)).toString('base64');
        refs.push(await page.evaluate(async ([src, x, y, w]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const c = document.createElement('canvas');
            c.width = c.height = w;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, x, y, w, w, 0, 0, w, w);
            return c.toDataURL('image/png');
        }, [src, x, y, w]));
    }

    /* 그림뿐 아니라 **채움 비율**도 같이 낸다 — '원본이 타일을 더 꽉 채운다' 같은 인상은
       눈대중으로는 매번 다르게 나온다. 타일 안쪽(키라인 제외)에서 흰 배경이 아닌 칸의 비율을
       양쪽 같은 기준으로 세어 수치로 비교한다. */
    const coverage = await page.evaluate(async ([refs, clone]) => {
        const measure = async (src, inset) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            const m = Math.round(Math.min(c.width, c.height) * inset);
            let hues = 0;
            let on = 0, all = 0, ink = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
            // 유채 평균 채도 + 살빛 세로 높이 — 라운드2 비평가 지적 ②③ 을 칸별로 겨냥하기 위한 값이다
            // (평균만 보면 어느 칸을 고쳐야 하는지 알 수 없어 지난 라운드가 눈대중으로 손댔다).
            let satSum = 0, satN = 0, skinMinY = 1e9, skinMaxY = -1;
            const hueSet = new Set();
            for (let y = m; y < c.height - m; y++) for (let x = m; x < c.width - m; x++) {
                const i = (y * c.width + x) * 4;
                all++;
                // 투명(클론) 또는 흰 배경(원본 타일 면)이 아니면 '그림'으로 센다.
                const bg = d[i + 3] < 24 || (d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232);
                if (!bg) {
                    on++;
                    // 키라인 밀도 — 그림 화소 중 '거의 검정'의 비율. 원본 화풍이 검정을 얼마나 쓰는지의 지표.
                    if (d[i] < 48 && d[i + 1] < 48 && d[i + 2] < 48) ink++;
                    hueSet.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5));   // 색 수(32단계 양자화)
                    // HSV 채도. 무채(회/검/흰)는 화풍 판정에서 빼야 '유채 평균'이 뜻을 갖는다.
                    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
                    const sat = mx ? (mx - mn) / mx : 0;
                    if (sat > 0.12) { satSum += sat; satN++; }
                    // 살빛 — 원본 팔레트의 살(#ffa983 계열)과 그 그늘이 드는 대역. 붉은 기가 도는
                    // 중간~밝은 색만 잡는다(머리카락·옷의 붉은 면과 겹치지 않게 폭을 좁게 잡았다).
                    const isSkin = d[i] > 150 && d[i] > d[i + 1] + 24 && d[i + 1] > d[i + 2]
                        && d[i + 1] > 90 && d[i + 2] > 40 && sat < 0.62;
                    if (isSkin) { if (y < skinMinY) skinMinY = y; if (y > skinMaxY) skinMaxY = y; }
                    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
            hues = hueSet.size;
            const side = c.height - 2 * m;
            return { fill: on / all * 100, w: (maxX - minX + 1) / (c.width - 2 * m) * 100, h: (maxY - minY + 1) / side * 100,
                ink: ink / Math.max(1, on) * 100, hues,
                sat: satN ? satSum / satN : 0,
                skinH: skinMaxY < 0 ? 0 : (skinMaxY - skinMinY + 1) / side * 100 };
        };
        // 원본은 오려낸 타일이라 키라인 2px(≈4.5%)을 안쪽으로 물려야 그림만 남는다. 클론은 그림만 담긴 캔버스라 0.
        const A = [], B = [];
        for (const u of refs) A.push(await measure(u, 0.09));
        for (const u of clone) B.push(await measure(u, 0));
        return { A, B };
    }, [refs, clone]);
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const stat = (arr, k) => `${avg(arr.map(v => v[k])).toFixed(1)}%`;
    console.log(`채움 비율(타일 안쪽 대비 그림 화소) — 원본 ${stat(coverage.A, 'fill')} / 클론 ${stat(coverage.B, 'fill')}`);
    console.log(`실루엣 폭          — 원본 ${stat(coverage.A, 'w')} / 클론 ${stat(coverage.B, 'w')}`);
    console.log(`실루엣 높이         — 원본 ${stat(coverage.A, 'h')} / 클론 ${stat(coverage.B, 'h')}`);
    // 평균만 보면 어느 칸이 좁은지 모른다 — 하위 6칸을 이름과 함께 찍어 고칠 자리를 지목한다.
    const pool = await page.evaluate(() => AVATAR_POOL);
    const worst = coverage.B.map((v, i) => ({ e: pool[i], ...v })).sort((a, b) => a.w - b.w).slice(0, 6);
    console.log('  폭이 가장 좁은 칸: ' + worst.map(v => `${v.e} ${v.w.toFixed(0)}%`).join(' · '));
    const shortest = coverage.B.map((v, i) => ({ e: pool[i], ...v })).sort((a, b) => a.h - b.h).slice(0, 6);
    console.log(`키라인 밀도(그림 화소 중 거의-검정) — 원본 ${stat(coverage.A, 'ink')} / 클론 ${stat(coverage.B, 'ink')}`);
    console.log(`색 수(32단계 양자화, 칸당 평균)   — 원본 ${avg(coverage.A.map(v => v.hues)).toFixed(1)} / 클론 ${avg(coverage.B.map(v => v.hues)).toFixed(1)}`);
    console.log('  높이가 가장 낮은 칸: ' + shortest.map(v => `${v.e} ${v.h.toFixed(0)}%`).join(' · '));

    // ── 라운드2 잔여 지적 ②③ 을 칸별로 겨냥하기 위한 표 (2026-08-18 3라운드에 추가) ──
    // 평균만 찍으면 '어느 칸을 고칠지'가 안 나와 지난 라운드가 눈대중으로 손댔다. 하한을 벗어난
    // 칸을 이름으로 지목한다. 기준은 원본 8칸을 같은 코드로 잰 값이다(하드코딩한 목표치가 아니다).
    const refSat = avg(coverage.A.map(v => v.sat)), refSkin = avg(coverage.A.map(v => v.skinH));
    const refSkinArr = coverage.A.map(v => v.skinH).filter(v => v > 0);
    console.log(`유채 평균 채도                    — 원본 ${refSat.toFixed(2)} / 클론 ${avg(coverage.B.map(v => v.sat)).toFixed(2)}`);
    const lowSat = coverage.B.map((v, i) => ({ e: pool[i], ...v })).filter(v => v.sat < refSat - 0.08)
        .sort((a, b) => a.sat - b.sat);
    console.log('  채도 하한 이탈: ' + (lowSat.length ? lowSat.map(v => `${v.e} ${v.sat.toFixed(2)}`).join(' · ') : '없음'));
    console.log(`살빛 세로 높이(타일 대비)          — 원본 ${refSkin.toFixed(1)}% (살 있는 칸만 ${refSkinArr.length ? Math.min(...refSkinArr).toFixed(0) + '~' + Math.max(...refSkinArr).toFixed(0) : '—'}%) / 클론 ${avg(coverage.B.map(v => v.skinH)).toFixed(1)}%`);
    const skinCells = coverage.B.map((v, i) => ({ e: pool[i], ...v })).filter(v => v.skinH > 0).sort((a, b) => a.skinH - b.skinH);
    console.log('  살빛이 가장 낮은 칸: ' + skinCells.slice(0, 6).map(v => `${v.e} ${v.skinH.toFixed(0)}%`).join(' · '));

    const S = 96;
    const cell = u => `<img src="${u}" style="width:${S}px;height:${S}px;image-rendering:pixelated;display:block;background:#fff">`;
    // 클론은 프레임(흰 면·검정 키라인)이 CSS 쪽에 있으므로 대조판에서도 같은 프레임을 씌워야 공정하다.
    const frame = u => `<div style="width:${S}px;height:${S}px;background:#fff;border:4px solid #000;border-radius:14px;box-sizing:border-box;overflow:hidden">`
        + `<img src="${u}" style="width:100%;height:100%;image-rendering:pixelated;display:block"></div>`;

    const html = `<div style="background:#eef1f5;padding:18px;font-family:sans-serif;width:864px">
      <div style="font:800 16px sans-serif;margin:0 0 8px">A · 원본 게임의 아바타 (스크린샷에서 그대로 오려낸 픽셀)</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${refs.map(cell).join('')}</div>
      <div style="font:800 16px sans-serif;margin:20px 0 8px">B · 클론이 코드로 그린 아바타 24종</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${clone.map(frame).join('')}</div>
    </div>`;
    await page.setContent(`<body style="margin:0">${html}</body>`);
    await page.waitForTimeout(250);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.screenshot({ path: OUT, fullPage: true });
    console.log('wrote', OUT);
    await browser.close();
})();
