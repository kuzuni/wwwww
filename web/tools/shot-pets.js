// 펫 화면(shot-042356) 단일 캡처 — '전 UI 비율 전수 검증 패스'용.
//
// 🚨 기본 시드(shot-screens.js)로 찍으면 **보유 수가 달라 세로 레이아웃이 통째로 어긋난다**:
//    원본은 펫 3 + 알 7 = 타일 10개(2행)인데 기본 시드는 펫 8 + 알 12 = 20개(4행)라
//    그리드가 2행 더 쌓이고 그 아래 '장착됨' 행·소환 바·부화장이 전부 밀린다.
//    비율 대조 전에 **상태부터 원본과 같게** 맞춘다(인계 메모 함정 ㉢ 계열).
// 원본 상태: 펫 3종 전부 장착됨(Lv.61/6/3, ⭐) · 알 7 · 부화 슬롯 3칸 전부 가동(8시 27분) · 슬롯+1 구매 가능.
//
// 사용: node tools/shot-pets.js [출력파일]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/pets.png');
const { stampFresh } = require('./clone-fresh.js');

// 원본과 같은 보유 상태로 맞추는 소스 — probe 쪽에서도 같은 것을 써야 해서 내보낸다.
const PETS_STATE_SRC = `(() => {
    // 🚨 자동 제련(시드가 autoForgeOn=true)이 캡처 대기 중에 돌아 **비교 팝업이 화면을 덮는다**
    //    — shot-screens.js 가 이미 겪은 함정이다(펫 캡처가 통째로 장비 비교 팝업으로 덮인 실제 사례).
    //    ⚠️ 함수만 덮어써도 부족하다 — 시드 로드~여기까지의 60초 사이에 **이미 열린** 팝업은 그대로
    //    남아 캡처를 덮는다(실제로 2회 덮였다). 자동 제련을 끄고 열려 있는 모달도 전부 닫는다.
    S.autoForgeOn = false;
    UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
    UI.coinBurst = () => {}; UI.toast = () => {};
    try { UI.clearPendingCraft(); } catch (e) {}
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    const tz = document.getElementById('toasts'); if (tz) tz.innerHTML = '';
    const names = (typeof Pets !== 'undefined' && Pets.LIST) ? Pets.LIST.map(d => d.name || d) : [];
    const nm = (i) => names.length ? names[i % names.length] : ('펫' + i);
    // 원본 타일 3장은 살구빛 몸통에 붉은 계열 — ultimate 로 맞춘다. 알 7개도 같은 등급.
    // (등급색은 2026-08-18 rarity-css-exact 로 원본 실측값 #ff1c1c 로 교체됐다 — 예전 #ff3b30 아님.
    //  타일 면은 여기에 CSS color-mix 로 흰색 40% 가 섞여 원본 실측 #ff7777 이 된다.)
    // ⚠️ dupes 는 0 이어야 한다 — 같은 등급 dupes 합이 3 이상이면 그리드 아래에 우리 쪽 기능인
    //    '궁극의 3 → 신화 알' 합치기 버튼 행이 생겨(원본에는 없다) 그 아래가 전부 밀린다.
    S.pets = [61, 6, 3].map((lv, i) => ({ name: nm(i), rarity: 'ultimate', level: lv, dupes: 0, stars: 1, subs: (typeof Pets.rollSubs === 'function' ? Pets.rollSubs() : []) }));
    S.activePets = [0, 1, 2];
    S.eggs = Array.from({ length: 7 }, () => ({ rarity: 'ultimate' }));
    S.hatching = Array.from({ length: 3 }, () => ({ rarity: 'ultimate', endsAt: U.now() + (8 * 60 + 27) * 60e3 }));
    S.hatchSlotBonus = 0;
    S.petSummonCount = 340;      // 원본 'Lv. 69'
    S.eggCurrency = 28; S.gems = 62;
    UI.switchTab('summon'); UI.switchSummonSub('pets');
})()`;
module.exports.PETS_STATE_SRC = PETS_STATE_SRC;

if (require.main === module) (async () => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 490, height: 882 }, deviceScaleFactor: 1 });   // 원본 실측 490×882
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const info = await page.evaluate(PETS_STATE_SRC);
    await page.waitForTimeout(700);
    await page.screenshot({ path: OUT, timeout: 120000 });
    stampFresh(OUT);   // 재굽기 스탬프 — 캡처가 바이트 동일해도 '다시 구웠다'가 커밋에 남는다   // swiftshader 에서 30s 기본값이 종종 터진다
    await browser.close();
    console.log(`저장: ${OUT} · 에러 ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
})();
