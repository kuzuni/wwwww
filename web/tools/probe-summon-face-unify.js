// 소환 결과창 그림 = 슬롯 그림 실측 — 사용: node probe-summon-face-unify.js
// 사용자 지시 2026-08-19 (`summon-result-image-unify`): "스킬·펫·탈것에 소환 결과창 이미지랑
// 실제 이미지가 다른 문제. 통일되게. 슬롯 모양도 통일."
//
// 무엇을 재는가: **같은 렌더 소스인지를 픽셀 소스로 대조한다.** 결과창 셀 안 그림의 실제
// 이미지 소스(`.ico` 는 computed background-image 의 data URI, 3D 썸네일은 <img>.src)를 뽑고,
// 같은 항목이 실제 슬롯/타일에 그려질 때의 소스와 **문자열이 같은지** 본다. 눈대중이 아니라
// 바이트 동일성이라, 한쪽만 이모지로 돌아가거나 다른 아이콘 키를 쓰면 즉시 잡힌다.
//
// 판정: ① 결과창 셀 그림이 하나도 남김없이 '이미지 노드'다 (이모지 글리프 0개)
//       ② 스킬: 결과창 그림 = `IconGen.skill(id)` 이 슬롯에 그리는 것과 같은 data URI
//       ③ 알  : 결과창 그림 = 펫 화면 알 타일과 같은 등급색 tint data URI
//       ④ 탈것: 결과창 그림 = 탑승 슬롯과 같은 3D 썸네일 data URI (이모지 폴백으로 남지 않는다)
//       ⑤ 세 종류의 '그림/구체' 비율이 서로 ±12% 안 (슬롯 모양 통일 — 한 종류만 크거나 작지 않다)
//       ⑥ 콘솔 에러 0건
//
// ⚠️ 크기는 **절대 px 로 재면 안 된다** (2026-08-19 실측으로 한 번 밟았다). 두 가지가 동시에 흔든다:
//    ⑴ 등장 연출 도중이면 `srpop` 스케일 한복판이라 같은 셀도 10px→26px 로 튄다 →
//       측정 전에 `.on` 을 전부 걸고 애니메이션이 끝날 때까지 기다린다.
//    ⑵ 등급 위계(`--sz`, 주역/동급 셀)가 구체 자체를 키운다 → 비율(그림 폭 / 구체 폭)로 재면
//       위계는 나누어 없어지고 '구체 대비 그림이 같은 비중인가'만 남는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
`;
// 3D 렌더 루프를 멈춰 swiftshader 가 메인 스레드를 잡아먹지 않게 한다(썸네일 굽기는 별도 경로라 산다)
const FREEZE_3D = `Scene3D.update = function () {};`;

// 등장 연출을 끝까지 밀어 놓는다 — 전 셀 `.on` + 진행 중인 애니메이션 종료. 이걸 안 하면
// `srpop` 스케일 한복판을 재게 된다(위 ⑴).
const SETTLE = `(async () => {
    const m = UI.els.summonResultModal;
    m.querySelectorAll('.sr-body > .sr-grid > .sr-cell').forEach(el => el.classList.add('on'));
    for (const a of document.getAnimations()) { try { a.finish(); } catch (e) {} }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
})()`;

// 결과창 셀에서 '그림의 실제 소스'를 뽑는다 — 이미지가 아니면 텍스트(=이모지)를 그대로 돌려준다
const READ_CELLS = `(() => {
    const m = UI.els.summonResultModal;
    const cells = [...m.querySelectorAll('.sr-body > .sr-grid > .sr-cell')];
    return cells.map(c => {
        const ico = c.querySelector('.sr-ico');
        const node = ico && ico.firstElementChild;
        const r = node ? node.getBoundingClientRect() : null;
        const orb = c.querySelector('.sr-orb');
        const orbR = orb ? orb.getBoundingClientRect() : null;
        let src = '';
        if (node && node.tagName === 'IMG') src = node.src;
        else if (node && node.querySelector('img')) src = node.querySelector('img').src;
        else if (node) src = getComputedStyle(node).backgroundImage;
        return {
            name: (c.querySelector('.sr-name') || {}).textContent || '',
            isImage: !!src && src !== 'none',
            text: node ? '' : (ico ? ico.textContent.trim() : ''),
            src, w: r ? +r.width.toFixed(1) : 0, h: r ? +r.height.toFixed(1) : 0,
            orbW: orbR ? +orbR.width.toFixed(1) : 0,
            ratio: (r && orbR && orbR.width) ? +(r.width / orbR.width).toFixed(4) : 0,
        };
    });
})()`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    // waitForFunction 은 3D 렌더 한 프레임에 밀려 안 도는 컨테이너가 있다 — Node 쪽 폴링으로 대기
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof UI !== "undefined" && !!UI.els').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }
    await page.evaluate(SEED);
    await page.evaluate(FREEZE_3D);
    await page.waitForTimeout(200);

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
    const boxes = [];

    // ---------- ② 스킬 ----------
    await page.evaluate(`S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`);
    await page.waitForTimeout(600);
    await page.evaluate(SETTLE);
    const skillCells = await page.evaluate(READ_CELLS);
    // 같은 스킬이 슬롯 스타일로 그려질 때의 소스 — 결과창과 무관한 경로로 새로 그려서 대조한다
    const skillSlot = await page.evaluate(`(() => {
        const ids = [...UI._srEntries].map(e => e.key.replace(/^sk:/, ''));
        const box = document.createElement('div');
        box.innerHTML = ids.map(id => '<span class="sk-icon">' + IconGen.skill(id) + '</span>').join('');
        document.body.appendChild(box);
        const out = [...box.querySelectorAll('.ico')].map(e => getComputedStyle(e).backgroundImage);
        box.remove();
        return out;
    })()`);
    ok(skillCells.length > 0, '스킬 결과창 셀이 0개');
    ok(skillCells.every(c => c.isImage), `스킬 셀에 이모지가 남아 있다: ${JSON.stringify(skillCells.filter(c => !c.isImage).map(c => c.text))}`);
    ok(skillCells.every((c, i) => c.src === skillSlot[i]),
        `스킬 결과창 그림이 슬롯 그림과 다르다 (${skillCells.filter((c, i) => c.src !== skillSlot[i]).length}/${skillCells.length}개 불일치)`);
    boxes.push(...skillCells.map(c => ({ kind: 'skill', w: c.w, h: c.h, orbW: c.orbW, ratio: c.ratio })));
    await page.evaluate(`UI.closeSummonResult()`);

    // ---------- ③ 알(펫) ----------
    await page.evaluate(`S.summonMult = {pet:5}; UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.onSummonPetEgg();`);
    await page.waitForTimeout(600);
    await page.evaluate(SETTLE);
    const eggCells = await page.evaluate(READ_CELLS);
    const eggSlot = await page.evaluate(`(() => {
        const rs = [...UI._srEntries].map(e => e.rarity);
        const box = document.createElement('div');
        // 펫 화면 알 타일과 같은 호출(ui.js: .pet-tile.egg .tile-face)
        box.innerHTML = rs.map(r => '<span class="tile-face">' + IconGen.img('egg', null, { tint: RARITY_CSS[r] }) + '</span>').join('');
        document.body.appendChild(box);
        const out = [...box.querySelectorAll('.ico')].map(e => getComputedStyle(e).backgroundImage);
        box.remove();
        return out;
    })()`);
    ok(eggCells.length > 0, '알 결과창 셀이 0개');
    ok(eggCells.every(c => c.isImage), `알 셀에 이모지가 남아 있다: ${JSON.stringify(eggCells.filter(c => !c.isImage).map(c => c.text))}`);
    ok(eggCells.every((c, i) => c.src === eggSlot[i]),
        `알 결과창 그림이 펫 화면 알 타일과 다르다 (${eggCells.filter((c, i) => c.src !== eggSlot[i]).length}/${eggCells.length}개 불일치)`);
    boxes.push(...eggCells.map(c => ({ kind: 'egg', w: c.w, h: c.h, orbW: c.orbW, ratio: c.ratio })));
    await page.evaluate(`UI.closeSummonResult()`);

    // ---------- ④ 탈것 ----------
    await page.evaluate(`S.summonMult = {mount:5}; UI.openMounts(); UI.onSummonMount();`);
    await page.waitForTimeout(900);
    await page.evaluate(SETTLE);
    const mountCells = await page.evaluate(READ_CELLS);
    const mountSlot = await page.evaluate(`(() => {
        const names = [...UI._srEntries].map(e => e.key.replace(/^mt:/, ''));
        return names.map(n => {
            const m = S.mounts[n];
            const url = Scene3D.mountThumb(n, (m && m.rarity) || 'common');
            return url || '';
        });
    })()`);
    ok(mountCells.length > 0, '탈것 결과창 셀이 0개');
    ok(mountCells.every(c => c.isImage), `탈것 셀에 이모지가 남아 있다: ${JSON.stringify(mountCells.filter(c => !c.isImage).map(c => c.text))}`);
    ok(mountCells.every((c, i) => c.src === mountSlot[i]),
        `탈것 결과창 그림이 탑승 슬롯 3D 썸네일과 다르다 (${mountCells.filter((c, i) => c.src !== mountSlot[i]).length}/${mountCells.length}개 불일치)`);
    boxes.push(...mountCells.map(c => ({ kind: 'mount', w: c.w, h: c.h, orbW: c.orbW, ratio: c.ratio })));
    await page.evaluate(`UI.closeSummonResult()`);

    // ---------- ⑤ 세 종류의 그림 상자 크기가 같은가(슬롯 모양 통일) ----------
    const rs = boxes.map(b => b.ratio).filter(v => v > 0);
    const mn = Math.min(...rs), mx = Math.max(...rs);
    ok(rs.length === boxes.length, '비율을 못 잰 셀이 있다(구체 또는 그림 노드 누락)');
    ok(mx <= mn * 1.12, `종류별 '그림/구체' 비율이 벌어진다 — ${mn} ~ ${mx} (${JSON.stringify(
        ['skill', 'egg', 'mount'].map(k => k + ':' + [...new Set(boxes.filter(b => b.kind === k).map(b => b.ratio))].join('/')))})`);

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    for (const k of ['skill', 'egg', 'mount']) {
        const g = boxes.filter(b => b.kind === k);
        console.log(`${k.padEnd(6)} 셀 ${g.length}개 · 그림 ${[...new Set(g.map(b => b.w + '×' + b.h))].join(', ')}`
            + ` · 구체 ${[...new Set(g.map(b => b.orbW))].join(',')} · 그림/구체 ${[...new Set(g.map(b => b.ratio))].join(',')}`);
    }
    console.log('스킬 소스 예:', (skillCells[0] || {}).src.slice(0, 46) + '…');
    console.log('알   소스 예:', (eggCells[0] || {}).src.slice(0, 46) + '…');
    console.log('탈것 소스 예:', (mountCells[0] || {}).src.slice(0, 46) + '…');
    if (fail.length) { console.log('\nFAIL ' + fail.length + '건:'); fail.forEach(f => console.log(' ✗ ' + f)); }
    else console.log('\nPASS — 결과창 그림이 세 종류 모두 슬롯과 같은 소스, 크기도 통일');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
