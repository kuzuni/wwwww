// voxel 전환 검수 컨택트 시트 — 사용: node shot-equip-voxel.js [출력파일] [슬롯…]
//   기본 슬롯 = necklace,ring (전환 1차분). 전환이 진행되면 인자로 슬롯을 늘려 가며 본다.
//
// 왜 `shot-equip-sculpt.js` 를 안 쓰나: 그건 갑옷·장갑·신발·벨트 **조형(㉯⑴)** 전용이라
//   장신구(목걸이·반지)가 아예 칸에 없고, 시대도 2줄뿐이다. voxel 전환은 **시대 재질이
//   맵을 잃는 것**이 핵심 변화라 시대를 전부 나란히 놓고 봐야 한다.
//
// 시트 구성: 행 = 시대 6종 · 열 = 변형 3종 × 슬롯. 맨 아래 판독성 행에 96px 실제 표시
//   크기와 실루엣을 같이 둔다(썸네일은 96px 로 쓰인다 — 큰 그림만 보면 속는다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'equip-voxel.png';
const SLOTS = (process.argv[3] || 'necklace,ring').split(',').filter(Boolean);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate((SLOTS) => {
        const S = 224;
        // 등급을 셋으로 굴린다 — 90칸이 전부 같은 하늘색 액센트로 보이던 건 시트가 rarity 를
        //   'rare' 하나로 고정했기 때문이다(게임에서는 아이템마다 등급이 다르다).
        const RAR = ['rare', 'legendary', 'mythic'];
        Scene3D.itemThumb({ slot: 'ring', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const KR = { necklace: '목걸이', ring: '반지', gloves: '장갑', shoes: '신발', belt: '벨트' };
        const cells = [];
        for (const sl of SLOTS) for (let v = 0; v < 3; v++) cells.push({ label: (KR[sl] || sl) + '/v' + v, slot: sl, variant: v });
        const AGE_ROWS = AGES.slice(0, 6);
        const cv = document.createElement('canvas');
        cv.width = S * cells.length; cv.height = S * (AGE_ROWS.length + 1);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#20262f'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [], errs = [];
        AGE_ROWS.forEach((age, r) => {
            cells.forEach((cell, c) => {
                let dataUrl = null, rawUrl = null;
                try {
                    // 🚨 **`itemThumb` 을 그대로 부른다 — 씬을 직접 굽지 말 것.** 첫 판은
                    //    `shot-equip-sculpt.js` 를 베껴 `makeAccessoryPreview` + `_thumbR.render` 로
                    //    직접 구웠는데, 그러면 `thumbFinish` 의 **마감 4겹(접지 그림자·소프트 AO·
                    //    비네트·레어리티 프레임)이 통째로 빠진다.** 그 판으로 비평가를 돌렸더니
                    //    "접지 그림자 없음 · 비네트 없음 · 이미시브 없음"이 마감 점수의 근거로
                    //    돌아왔다 — 게임에는 다 있는 것이라, **자가 아니라 검수판이 틀린 것**이었다.
                    //    `itemThumb` 은 (슬롯,시대,이름idx) 캐시 키를 쓰고 변형 = nameIdx % 3 이므로
                    //    변형도 그대로 고를 수 있다.
                    Scene3D._thumbCache = {};
                    dataUrl = Scene3D.itemThumb({
                        slot: cell.slot, age, ageIdx: AGES.indexOf(age),
                        rarity: RAR[cell.variant % RAR.length],   // 등급 프레임·보석 색이 갈리는 것도 보여야 한다
                        nameIdx: cell.variant,
                    });
                    // 🚨 실루엣 판은 **마감을 끈 판**으로 뜬다. 마감은 비네트로 타일 전체를
                    //    불투명하게 칠하므로, 마감본의 알파를 실루엣으로 쓰면 아이템이 아니라
                    //    **타일 사각형**이 찍힌다(마감을 켜자마자 이 칸이 통째로 까맣게 나왔다).
                    //    타일 = 플레이어가 보는 것, 실루엣 = 조형만 — 둘의 출처가 달라야 한다.
                    Scene3D.THUMB_FINISH_OFF = true;
                    Scene3D._thumbCache = {};
                    rawUrl = Scene3D.itemThumb({
                        slot: cell.slot, age, ageIdx: AGES.indexOf(age),
                        rarity: RAR[cell.variant % RAR.length], nameIdx: cell.variant,
                    });
                    Scene3D.THUMB_FINISH_OFF = false;
                } catch (e) { errs.push(cell.label + '/' + age + ': ' + e.message); }
                if (!dataUrl) return;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => {
                        ctx.drawImage(im, c * S, r * S, S, S);
                        if (r === AGE_ROWS.length - 1) {
                            const y = AGE_ROWS.length * S;
                            ctx.drawImage(im, c * S + 10, y + 40, 96, 96);
                            ctx.fillStyle = '#8a97a8'; ctx.fillRect(c * S + 112, y + 40, 96, 96);
                            if (rawUrl) {
                                const sm = new Image();
                                sm.onload = () => {
                                    const t = document.createElement('canvas'); t.width = t.height = 96;
                                    const tc = t.getContext('2d', { willReadFrequently: true });
                                    tc.drawImage(sm, 0, 0, 96, 96);
                                    const d2 = tc.getImageData(0, 0, 96, 96);
                                    for (let i = 0; i < d2.data.length; i += 4) {
                                        const a = d2.data[i + 3];
                                        d2.data[i] = d2.data[i + 1] = d2.data[i + 2] = a > 24 ? 20 : 0;
                                        d2.data[i + 3] = a > 24 ? 255 : 0;
                                    }
                                    tc.putImageData(d2, 0, 0);
                                    ctx.drawImage(t, c * S + 112, y + 40, 96, 96);
                                    res();
                                };
                                sm.onerror = () => res();
                                sm.src = rawUrl;
                                return;
                            }
                        }
                        res();
                    };
                    im.onerror = () => res();
                    im.src = dataUrl;
                }));
            });
        });
        return Promise.all(jobs).then(() => {
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px sans-serif';
            AGE_ROWS.forEach((age, r) => cells.forEach((cell, c) => {
                ctx.fillText(`${age.slice(0, 6)} ${cell.label}`, c * S + 6, r * S + 17);
            }));
            ctx.fillStyle = '#ffd54f';
            cells.forEach((cell, c) => ctx.fillText(`96px / 실루엣 ${cell.label}`, c * S + 6, AGE_ROWS.length * S + 26));
            return { url: cv.toDataURL(), errs };
        });
    }, SLOTS);

    fs.writeFileSync(path.resolve(__dirname, OUT), Buffer.from(res.url.split(',')[1], 'base64'));
    if (res.errs.length) console.log('모델 빌드 실패:', res.errs.join(' | '));
    console.log(OUT + ' 저장 · 콘솔 에러', errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
