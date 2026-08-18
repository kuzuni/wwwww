// 던전 진행 중 상단 스테이지 라벨의 얼굴이 생이모지가 아니라 코드 생성 아이콘인지. (slug: icon-gen)
//
// `UI.updateStageLabel()` 은 `textContent` 자리라 `IconGen.img()` 가 준 `<i>` 를 문자열로 넣으면
// **태그가 글자로 찍힌다**(토스트·스킬 컷인이 이미 겪은 함정). 그래서 아이콘만 노드로 만들고
// 나머지는 텍스트 노드로 붙인다 — 그 처리가 살아 있는지 4종 전부 태워 본다.
//
// ⚠️ 곁다리 계약 하나가 같이 걸려 있다: **플레이어 정보 팝업의 폴백 미리보기**(WebGL 캡처가
//    실패했을 때 쓰는 경로)가 이 라벨을 `textContent` 로 가져간다. 아이콘이 노드가 되면 그쪽에서
//    조용히 사라지므로 `dataset.text` 에 글자판을 남겨 두고 그쪽이 그걸 읽게 했다. 여기서 같이 잰다.
//
// 사용: node probe-stage-label-icon.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const EMO = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => m.type() === 'error' && !/favicon\.ico/.test(m.text()) && errs.push(m.text()));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 150000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });

    const r = await page.evaluate(() => {
        const rows = [];
        for (const d of Dungeons.DEFS) {   // 목록은 DEFS 다(LIST 는 없다 — Dungeons 는 def(id) 접근자만 따로 노출한다)
            Dungeons.run = { id: d.id, stage: 3, wave: 1 };
            UI.updateStageLabel();
            const el = UI.els.stageLabel;
            const ico = el.querySelector('.ico');
            rows.push({
                id: d.id,
                hasIco: !!ico,
                bg: ico ? getComputedStyle(ico).backgroundImage.startsWith('url("data:') : false,
                w: ico ? +ico.getBoundingClientRect().width.toFixed(1) : 0,
                tagAsText: /[<>]/.test(el.textContent),
                emojiLeft: /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u.test(el.textContent),
                text: el.textContent,
                dataText: el.dataset.text || '',
                kr: d.kr,
            });
        }
        Dungeons.run = null;
        UI.updateStageLabel();
        const el = UI.els.stageLabel;
        return { rows, normal: { text: el.textContent, dataText: el.dataset.text || '' } };
    });

    const bad = [];
    for (const x of r.rows) {
        const ok = x.hasIco && x.bg && !x.tagAsText && !x.emojiLeft && x.w >= 6
            && x.text.includes(x.kr) && x.dataText.includes(x.kr);
        console.log(`  ${ok ? 'OK ' : 'X  '} ${x.id.padEnd(10)} 아이콘=${x.hasIco} 그림=${x.bg} ${x.w}px  태그가글자=${x.tagAsText} 이모지잔여=${x.emojiLeft}  글자판="${x.dataText}"`);
        if (!x.hasIco) bad.push(`${x.id} 아이콘 노드가 없다`);
        else if (!x.bg) bad.push(`${x.id} 아이콘에 그림이 안 붙었다(img() 조용한 실패)`);
        if (x.tagAsText) bad.push(`${x.id} 태그가 글자로 찍혔다: ${x.text}`);
        if (x.emojiLeft) bad.push(`${x.id} 생이모지가 라벨에 남아 있다: ${x.text}`);
        if (x.w < 6) bad.push(`${x.id} 아이콘이 ${x.w}px 로 찌그러졌다`);
        if (!x.text.includes(x.kr)) bad.push(`${x.id} 던전 이름이 라벨에서 빠졌다`);
        // 폴백 미리보기 계약 — 글자판에는 이름이 남아 있어야 한다(아이콘은 이모지로 남는다)
        if (!x.dataText.includes(x.kr)) bad.push(`${x.id} dataset.text 글자판이 비었다 — 플레이어 정보 폴백이 빈 칸이 된다`);
    }
    console.log(`  일반 스테이지: "${r.normal.text}" (글자판 "${r.normal.dataText}")`);
    if (!r.normal.text || EMO.test(r.normal.text)) bad.push(`일반 스테이지 라벨이 이상하다: ${r.normal.text}`);
    if (r.normal.dataText !== r.normal.text) bad.push('일반 스테이지에서 글자판이 라벨과 다르다');
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 2).join(' | '));

    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : `\nPASS — 던전 ${r.rows.length}종 전부 코드 생성 아이콘 · 태그 노출 0 · 이모지 잔여 0 · 글자판 유지 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
