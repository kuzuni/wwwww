// '모든 장비의 목록'이 이름 변형별로 서로 다른 그림을 쓰는지 실측 — 사용: node probe-forge-list-thumbs.js
// 예전엔 부위별 고정 이모지를 이름 개수만큼 반복 출력해, 같은 섹션 안 5개가 전부 똑같이 생겼다.
// 판정: 셀이 3D 썸네일로 교체되는가 + 같은 (시대,부위) 안에서 썸네일이 서로 다른가 + 목록 열기가 얼지 않는가.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    // 목록 열기 — 여는 데 걸린 시간도 잰다(즉시 200장을 렌더하면 여기서 몇 초씩 얼어붙는다)
    const openMs = await page.evaluate(() => {
        const t0 = performance.now();
        UI.openForgeInfo();
        if (UI._forgeView !== 'list') { UI._forgeView = 'list'; UI.renderForgeListView(); }
        return Math.round(performance.now() - t0);
    });

    await page.waitForTimeout(3000);  // 청크 하이드레이트가 몇 묶음 돌 시간 (소프트웨어 GL은 장당 수십 ms)

    // 모든 셀을 강제로 하이드레이트(스크롤 없이 전수 판정)
    const data = await page.evaluate(() => {
        const faces = [...document.querySelectorAll('#forge-info-modal .fl-face[data-slot], .fl-face[data-slot]')];
        const paint = (el) => {
            const url = Scene3D.itemThumb({
                slot: el.dataset.slot, age: el.dataset.age, ageIdx: Number(el.dataset.ageidx),
                rarity: 'common', wtype: el.dataset.wtype || null,
                nameIdx: el.dataset.slot === 'weapon' ? el.dataset.nameidx : Number(el.dataset.nameidx),
            });
            return url;
        };
        const rows = [];
        for (const el of faces) {
            const url = paint(el);
            rows.push({ age: el.dataset.age, slot: el.dataset.slot, nameIdx: el.dataset.nameidx, len: url ? url.length : 0, hash: url ? url.slice(-64) : null });
        }
        // 실제 화면 교체도 한 번 확인 (스크롤 상단 셀들)
        const shown = faces.slice(0, 40).filter(f => f.querySelector('img')).length;
        return { rows, totalFaces: faces.length, shownImgs: shown };
    });

    let fail = 0;
    const t = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? ' — ' + extra : '')); if (!c) fail++; };

    const rows = data.rows;
    const made = rows.filter(r => r.hash);
    // (시대,부위) 그룹별 중복 검사
    const groups = {};
    for (const r of made) (groups[r.age + ':' + r.slot] = groups[r.age + ':' + r.slot] || []).push(r);
    const multi = Object.entries(groups).filter(([, v]) => v.length > 1);
    const dupGroups = multi.filter(([, v]) => new Set(v.map(x => x.hash)).size < v.length);

    console.log(`목록 열기 ${openMs}ms · 셀 ${data.totalFaces}개 · 썸네일 생성 ${made.length}개 · 화면 교체 확인 ${data.shownImgs}개(상단 40칸)`);
    console.log(`(시대,부위) 그룹 ${multi.length}개 중 그룹 내 중복 ${dupGroups.length}개`);
    if (dupGroups.length) {
        for (const [k, v] of dupGroups.slice(0, 6)) {
            const uniq = new Set(v.map(x => x.hash)).size;
            console.log(`   · ${k}: ${v.length}개 중 고유 ${uniq}개`);
        }
    }

    console.log('\n판정');
    t('목록 셀이 3D 썸네일을 얻는다 (이모지 반복 아님)', made.length > 100, `${made.length}개 생성`);
    t('화면에 실제 <img>로 교체된다', data.shownImgs > 0, `${data.shownImgs}개`);
    t('목록 열기가 얼지 않는다 (지연 하이드레이트)', openMs < 1500, `${openMs}ms`);
    t('같은 (시대,부위) 안에서 그림이 서로 다르다', dupGroups.length === 0,
        dupGroups.length ? `중복 그룹 ${dupGroups.length}개` : `${multi.length}개 그룹 전부 고유`);
    t('콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
