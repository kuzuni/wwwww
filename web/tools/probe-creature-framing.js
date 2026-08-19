// 탈것·펫 썸네일 **프레이밍 실측** — 사용: node probe-creature-framing.js
// probe-mount-thumb.js(같은 항목의 형상·색 대조)와 역할이 다르다: 이쪽은 '실루엣이 프레임을
// 얼마나 채우는가'를 종별로 재서, creatureThumb의 카메라 거리 역산이 헐거워지는 걸 잡는다.
// 근사식(최대변·외접구·스피어 합집합)은 형태에 따라 33~95%로 널을 뛰므로 이 수치를 회귀 감시한다.
// 사용자 지적(2026-08-18): 슬롯에 박힌 탈것 아이콘이 실제 3D 탈것과 생김새가 너무 다르다(이모지였다).
// 판정: ① 슬롯/타일/오브/칩이 전부 3D 스냅샷으로 교체되는가(이모지 잔존 0)
//       ② 15종이 서로 다른 그림인가(같은 아이콘 반복 금지)
//       ③ 썸네일이 빈 이미지(투명·단색)가 아닌가 — 프레이밍이 어긋나면 모델이 프레임 밖으로 나가 빈 칸이 된다
//       ④ 썸네일 형상 = 인게임 탑승 탈것 형상인가 (같은 모델·같은 요각을 쓰는지 픽셀 색 분포로 대조)
//       ⑤ 콘솔 에러 0건
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// ⚠️ 2026-08-19 로스터 교체(mount-animal-machine-dynamic ①)로 나뭇잎·연잎 3종이 폐기되고
//    조랑말·당나귀·알파카·태엽 생쥐·태엽 딱정벌레가 들어왔다 — 신규 5종을 여기 넣어 두지 않으면
//    새 종의 썸네일 프레이밍을 아무도 안 재게 된다(판정문 없는 도구는 통과가 아니라 사각지대다).
const MOUNTS = ['Pony', 'Donkey', 'Alpaca', 'Clockwork Mouse', 'Clockwork Beetle',
                'Turtle', 'Crab', 'Brown Horse', 'Dino',
                'Pig', 'Goat', 'Bike', 'Giant Bee', 'Mini Dragon', 'One-Wheel Droid', 'Hover Board', 'Hover Disk'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.mountThumb, null, { timeout: 30000 });

    // 전 15종을 보유 + 하나 장착시켜 슬롯/타일/오브/칩을 전부 켠다
    await page.evaluate((names) => {
        Mounts.ensure();
        const RA = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
        names.forEach((n, i) => { S.mounts[n] = { rarity: RA[i % RA.length], level: 3 + i, dupes: 0, subs: Mounts.rollSubs() }; });
        S.activeMount = 'Brown Horse';
        if (Scene3D.refreshMount) Scene3D.refreshMount();
    }, MOUNTS);

    // ── ③④ 썸네일 자체 품질: 알파 채널로 실제 그려진 픽셀 비율을 재고, 색 히스토그램을 뽑는다
    const shots = await page.evaluate(async (names) => {
        const px = (url) => new Promise(res => {
            const im = new Image();
            im.onload = () => {
                const c = document.createElement('canvas');
                c.width = im.width; c.height = im.height;
                const x = c.getContext('2d');
                x.drawImage(im, 0, 0);
                const d = x.getImageData(0, 0, c.width, c.height).data;
                let filled = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
                const hist = new Array(24).fill(0);   // 색상(hue) 24구간 — 형상+색 지문
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 24) continue;
                    filled++;
                    const p = (i / 4), xx = p % c.width, yy = (p / c.width) | 0;
                    if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
                    if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
                    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
                    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn;
                    let h = 0;
                    if (df > 0.02) {
                        h = mx === r ? ((g - b) / df + 6) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4;
                        h *= 60;
                    }
                    hist[Math.min(23, Math.floor(h / 15))]++;
                }
                res({ w: c.width, h: c.height, filled, total: (d.length / 4),
                      box: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, hist });
            };
            im.onerror = () => res(null);
            im.src = url;
        });
        const out = {};
        for (const n of names) {
            const url = Scene3D.mountThumb(n, S.mounts[n].rarity);
            out[n] = url ? Object.assign({ len: url.length }, await px(url)) : null;
        }
        return out;
    }, MOUNTS);

    // ── ①② 실제 DOM: 각 화면을 열고 .mt-face가 img로 교체되는지 + src가 서로 다른지
    const domCheck = async (label, open, sel) => {
        await page.evaluate(open);
        await page.waitForTimeout(1400);   // 하이드레이트 청크가 도는 시간(소프트웨어 GL)
        return await page.evaluate((s) => {
            const faces = [...document.querySelectorAll(s)];
            const srcs = faces.map(f => { const im = f.querySelector('img'); return im ? im.src.slice(-40) : null; });
            return {
                n: faces.length,
                withImg: srcs.filter(Boolean).length,
                emojiLeft: faces.filter(f => !f.querySelector('img') && f.textContent.trim()).length,
                uniq: new Set(srcs.filter(Boolean)).size,
            };
        }, sel);
    };

    const res = {};
    res.equipSlot   = await domCheck('장비시트 탈것칸', () => UI.renderEquipSheet(), '#equip-sheet .mt-face');
    res.mountScreen = await domCheck('탈것 화면 타일', () => UI.openMounts(), '#mount-modal .mt-face');
    res.mountDetail = await domCheck('탈것 상세',      () => UI.openMountDetail('Mini Dragon'), '#detail-modal .mt-face');
    res.upgrade     = await domCheck('업그레이드 재료', () => { UI.closeDetail(); UI.openMountUpgrade('Turtle'); }, '#mount-upgrade-modal .mt-face');
    res.playerInfo  = await domCheck('플레이어 정보',   () => { UI.closeMountUpgrade(); UI.openPlayerInfo(); }, '#player-info-modal .mt-face');

    // ── ④ 인게임 탑승 탈것과 같은 모델을 쓰는지: 썸네일과 씬의 탈것 지오메트리 지문 대조
    const sameModel = await page.evaluate(() => {
        // 씬에 실제로 올라간 탈것 메시의 (자식 수, 지오메트리 타입 목록) 지문
        const fp = (obj) => { const a = []; obj.traverse(o => { if (o.geometry) a.push(o.geometry.type + ':' + Math.round((o.geometry.parameters ? (o.geometry.parameters.radius || o.geometry.parameters.width || 0) : 0) * 1000)); }); return a.sort().join('|'); };
        const live = Scene3D.mountGroup ? fp(Scene3D.mountGroup) : null;
        const thumbMesh = Scene3D.makeMountMesh(S.activeMount, S.mounts[S.activeMount].rarity);
        return { liveLen: live ? live.length : 0, match: live ? live.indexOf(fp(thumbMesh).slice(0, 200)) >= 0 || fp(thumbMesh) === live : null };
    });

    // ── 리포트 ──
    let fail = 0;
    console.log('=== ③ 썸네일 자체 (채워진 픽셀 비율 / 프레임 점유 박스) ===');
    for (const n of MOUNTS) {
        const s = shots[n];
        if (!s) { console.log(`  ✗ ${n.padEnd(16)} 썸네일 생성 실패(null)`); fail++; continue; }
        const fillPct = s.filled / s.total * 100;
        const bw = s.box ? s.box.w / s.w * 100 : 0, bh = s.box ? s.box.h / s.h * 100 : 0;
        // 판정: 실체가 있고(≥4%), 프레임을 적당히 채우며(가로·세로 중 큰 쪽 ≥55%), 잘리지 않았다(≤100%)
        const ok = fillPct >= 4 && Math.max(bw, bh) >= 55;
        if (!ok) fail++;
        console.log(`  ${ok ? '✓' : '✗'} ${n.padEnd(16)} fill ${fillPct.toFixed(1).padStart(5)}%  box ${bw.toFixed(0).padStart(3)}×${bh.toFixed(0).padStart(3)}%`);
    }

    console.log('=== ② 서로 다른 탈것은 서로 다른 그림인가 ===');
    // ⚠️ "전부 달라야 한다"로 재면 안 된다 — 같은 계열에서 **인게임 메시 자체가 같고 등급색만 다른**
    //    종이 있을 수 있다(예전 나뭇잎 3종이 그랬다). 그 경우 썸네일이 같은 게 오히려 정답(썸네일=실물).
    //    그래서 실제 메시 지문으로 종을 묶고, **다른 메시끼리** 그림이 갈리는지만 판정한다.
    const meshGroups = await page.evaluate((names) => {
        const fp = (o) => { const a = []; o.traverse(m => { if (m.geometry) a.push(m.geometry.type + ':' + JSON.stringify(m.geometry.parameters || {}) + ':' + m.position.toArray().map(v => v.toFixed(3)).join(',')); }); return a.sort().join('|'); };
        const g = {};
        for (const n of names) { const k = fp(Scene3D.makeMountMesh(n, 'common')); (g[k] = g[k] || []).push(n); }
        return Object.values(g);
    }, MOUNTS);
    const sigOf = (n) => shots[n].hist.map(v => Math.round(v / 40)).join(',') + '#' + Math.round(shots[n].filled / 60);
    const seen = {}, dup = [];
    for (const grp of meshGroups) {
        const rep = grp.find(n => shots[n]);
        if (!rep) continue;
        const k = sigOf(rep);
        if (seen[k]) dup.push(`${seen[k]} ≡ ${rep}`); else seen[k] = rep;
        if (grp.length > 1) console.log(`  · 인게임 메시 공유 그룹(썸네일도 같아야 정상): ${grp.join(' / ')}`);
    }
    console.log(dup.length ? `  ✗ 다른 메시인데 그림이 겹침 ${dup.length}건: ${dup.join(', ')}` : `  ✓ 서로 다른 메시 ${meshGroups.length}종이 전부 다른 그림`);
    if (dup.length) fail++;

    console.log('=== ① 각 화면 DOM 교체 (mt-face → img) ===');
    for (const [k, v] of Object.entries(res)) {
        const ok = v.n > 0 && v.withImg === v.n && v.emojiLeft === 0;
        if (!ok) fail++;
        console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(12)} 칸 ${v.n} · 썸네일 ${v.withImg} · 이모지잔존 ${v.emojiLeft} · 고유 ${v.uniq}`);
    }

    console.log('=== ④ 썸네일 모델 = 인게임 탑승 탈것 모델 ===');
    console.log(`  ${sameModel.match ? '✓' : '✗'} 지오메트리 지문 일치 (씬 파츠 ${sameModel.liveLen})`);
    if (!sameModel.match) fail++;

    console.log(`=== ⑤ 콘솔 에러 ${errors.length}건 ===`);
    errors.slice(0, 6).forEach(e => console.log('  ! ' + e.slice(0, 160)));
    if (errors.length) fail++;

    console.log(fail ? `\nFAIL — ${fail}개 항목 불통과` : '\nPASS — 전 항목 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
