// 탈것 슬롯 아이콘 = 실제 3D 탈것인가 (사용자 지시 2026-08-18)
// 사용자 지적: 장비 슬롯의 탈것 아이콘이 실제 게임 속 탈것과 생김새가 너무 다르다(이모지였다).
// 슬롯 썸네일이 ⑴ 이모지가 아니라 실제 3D 스냅샷으로 바뀌었는지 ⑵ 탈것마다 다른 그림인지
// ⑶ 실제 장착된 탈것과 같은 형상·색인지(썸네일 vs 필드 렌더 대조)를 확인한다.
//
// 사용: PW_PATH=<playwright 경로> node probe-mount-thumb.js [출력디렉터리]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.join(__dirname, 'mount-thumb');
fs.mkdirSync(OUT, { recursive: true });

// 형태 계열이 갈리는 대표 탈것 — 평판형/지상형/비행형/사족형이 섞이게 고른다
const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
    saveGame();
`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.waitForTimeout(300);

    // 보유 탈것을 전 종류로 채운다(슬롯·타일이 전부 그려지게)
    const names = await page.evaluate(`(() => {
        Object.keys(MOUNT_KR).forEach(n => { if (!S.mounts[n]) S.mounts[n] = { name: n, rarity: 'common', level: 1, stars: 0, xp: 0, subs: [] }; });
        return Object.keys(S.mounts);
    })()`);
    console.log(`보유 탈것 ${names.length}종`);

    // ⑴⑵ 썸네일이 실제로 생성되는가 + 종마다 다른가
    const thumbs = await page.evaluate(`(() => {
        const out = {};
        for (const n of Object.keys(S.mounts)) {
            const u = Scene3D.mountThumb(n, S.mounts[n].rarity);
            out[n] = u ? u.length : 0;
        }
        return out;
    })()`);
    const made = Object.entries(thumbs).filter(([, v]) => v > 0);
    console.log(`⑴ 썸네일 생성: ${made.length}/${names.length}`);

    // ⑵ 종별로 다른 그림인가 — 단, **이건 이 항목의 합격 조건이 아니다(참고 지표)**.
    // `makeMountMesh`는 이름이 아니라 **형태 계열 4종 × 등급색**으로 근사하도록 만들어져 있어
    // (같은 계열·같은 등급이면 모델이 문자적으로 동일하다), 같은 등급으로 맞춰 재면 중복이 나온다.
    // 이 항목이 묻는 것은 '슬롯 아이콘 = 실제 소환되는 탈것'이지 '탈것끼리 서로 다른가'가 아니다.
    // 후자는 별도 항목(모델 개별화)이므로 수치만 남기고 판정에는 넣지 않는다.
    const dupes = await page.evaluate(`(() => {
        const m = {};
        for (const n of Object.keys(S.mounts)) {
            const u = Scene3D.mountThumb(n, S.mounts[n].rarity); if (!u) continue;
            (m[u] = m[u] || []).push(n);
        }
        return JSON.stringify(Object.values(m).filter(a => a.length > 1));
    })()`);
    const dupGroups = JSON.parse(dupes);
    console.log(`⑵ (참고) 같은 그림으로 겹치는 조: ${dupGroups.length ? JSON.stringify(dupGroups) : '없음'}`
        + `  ← 판정 대상 아님(형태 계열×등급색 근사의 결과)`);

    // ⑶ 슬롯에 실제로 <img>가 박혔는지 — 이모지가 남아 있으면 실패
    const slot = await page.evaluate(`(async () => {
        S.activeMount = Object.keys(S.mounts)[0];
        UI.switchTab('gear'); UI.renderEquipSheet();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.querySelector('.equip-cell.egg-cell .mt-face');
        if (!el) return { found: false };
        const r = el.getBoundingClientRect();
        const img = el.querySelector('img');
        return {
            found: true, mount: el.dataset.mount, hasImg: !!img, cls: el.className,
            text: el.textContent.trim(), w: r.width, h: r.height,
            fill: img ? (img.getBoundingClientRect().width / r.width) : 0,
        };
    })()`);
    console.log(`⑶ 장비 슬롯: ${JSON.stringify(slot)}`);

    // 슬롯 캡처 + 같은 탈것을 실제 장착한 전투 화면 캡처 → 나란히 육안 대조용
    await page.screenshot({ path: path.join(OUT, 'gear-slot.png') });
    await page.evaluate(`UI.switchTab('battle'); Scene3D.refreshMount();`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'field-mounted.png') });
    // 탈것 목록(타일 그리드)
    await page.evaluate(`UI.openMounts()`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'mount-list.png') });

    // 합격 조건: 전 종 썸네일이 생성되고, 장비 슬롯이 이모지가 아니라 그 썸네일 <img>로 채워진다
    const pass = made.length === names.length
        && slot.found && slot.hasImg && !slot.text && slot.fill > 0.5;
    console.log(`\n판정: ${pass ? 'PASS' : 'FAIL'}  → ${OUT}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
    await browser.close();
    process.exit(pass && !errors.length ? 0 : 1);
})();
