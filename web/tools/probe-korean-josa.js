// 한국어 조사가 앞말 받침에 맞는가 — 승천 팝업 4계열 전수 (slug `ascend-modal-particle`).
//
// 왜 이 자가 필요한가: 조사를 문자열에 박아 두면 **넷 중 하나만 우연히 맞는다.** 승천 팝업이
// `${LINE_KR[line]}가` 로 박아 `장비가`(받침 없음)만 맞고 `스킬가`·`펫가`·`탈것가` 가 됐다.
// 한 계열만 열어 보는 눈검사로는 **맞는 그 하나를 볼 확률이 1/4** 이고, 스크린샷 비교는 글자
// 하나 차이를 안 잡는다. 그래서 **4계열을 전부 렌더해 조사만 뽑아 본다**.
//
// 🚨 **음성 대조 내장** — `U.josa` 를 '항상 가' 로 갈아 끼워 하드코딩 시절을 그 자리에서 재현하고,
// 그 판이 반드시 틀리는지 확인한다(안 틀리면 이 자는 아무 빌드나 통과시킨다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

// 기대값 = 머리 명사의 받침. 장비(없음)→가 · 스킬(ㄹ)·펫(ㅅ)·탈것(ㅅ)→이
const WANT = { forge: '가', skill: '이', pet: '이', mount: '이' };
const log = (s) => console.log(s);

async function render(page, { breakFix }) {
    if (breakFix) await page.evaluate(() => { U.josa = () => '가'; });
    return page.evaluate(() => {
        const out = {};
        for (const line of ['forge', 'skill', 'pet', 'mount']) {
            S.summonCount = 5000;
            UI.openAscension(line);
            const el = document.querySelector('.asc-focus') || document.getElementById('ascension-modal');
            const txt = (el ? el.textContent : '').replace(/\s+/g, ' ');
            // 팝업의 두 문장에서 조사만 뽑는다 — ⓐ '…) X 전부 사라집니다' ⓑ '…되는 … X ⭐N로 나옵니다'
            const a = txt.match(/보유 중인 기존 .*?\)\s*([이가])\s*전부 사라집니다/);
            const b = txt.match(/이후 새로 (?:제작되는 장비|소환되는 \S+?)\s*([이가])\s/);
            out[line] = { wipe: a && a[1], next: b && b[1], txt: txt.slice(0, 0) };
        }
        return out;
    });
}

function verdict(got) {
    const bad = [];
    for (const line of Object.keys(WANT)) {
        const g = got[line] || {};
        if (g.wipe !== WANT[line]) bad.push(`${line} 소멸문 '${g.wipe}'(기대 '${WANT[line]}')`);
        if (g.next !== WANT[line]) bad.push(`${line} 이후문 '${g.next}'(기대 '${WANT[line]}')`);
    }
    return bad;
}

(async () => {
    const browser = await chromium.launch();
    const errs = [];
    const open = async () => {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        page.on('pageerror', (e) => errs.push(String(e)));
        await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Ascension !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
        await page.waitForTimeout(300);
        return page;
    };

    const p1 = await open();
    const prod = await render(p1, { breakFix: false });
    await p1.close();
    log('① 제품 판 — 승천 팝업 4계열');
    for (const l of Object.keys(WANT)) log(`   ${l.padEnd(6)} 소멸문 '${prod[l].wipe}' · 이후문 '${prod[l].next}' (기대 '${WANT[l]}')`);
    const bad = verdict(prod);

    const p2 = await open();
    const neg = await render(p2, { breakFix: true });
    await p2.close();
    const negBad = verdict(neg);
    log('② 음성 대조 — 조사를 항상 `가` 로 박던 판 재현');
    log(`   틀린 자리 ${negBad.length}개` + (negBad.length ? ' — ' + negBad.slice(0, 3).join(' / ') : ''));

    await browser.close();
    log('');
    log(`콘솔 에러 ${errs.length}건` + (errs.length ? ' — ' + errs.slice(0, 3).join(' / ') : ''));
    if (prod.forge.wipe == null || prod.skill.wipe == null) {
        log('\n🚨 측정기 고장 — 팝업 문장을 못 읽었다(정규식이 문구 변경을 못 따라갔을 수 있다). 수치를 쓰지 말 것.');
        process.exit(2);
    }
    if (negBad.length < 6) {
        log(`\n🚨 측정기 고장 — 음성 대조가 ${negBad.length}자리만 틀렸다(기대 6자리: 받침 있는 3계열 × 2문장).`);
        process.exit(2);
    }
    log(`  음성 대조는 정상으로 깨졌다(${negBad.length}자리 오조사) → 이 자는 조사를 본다 ✔`);
    if (bad.length || errs.length) {
        log(`\n❌ FAIL — 조사 ${bad.length}자리가 앞말 받침과 안 맞는다: ${bad.join(' / ')}`);
        process.exit(1);
    }
    log('\n✅ PASS — 4계열 8자리 조사가 전부 앞말 받침과 맞는다');
})();
