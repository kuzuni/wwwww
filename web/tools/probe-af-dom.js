// 자동 제련 화면 요소 실측 — 원본(shot-042950 = 필터 ON / shot-043117 = 필터 OFF)의 목표치와 %W·%H 로 나란히 대조.
// 원본 PNG 는 503x885 라 클론 뷰포트(499x892)와 기준이 다르다 — 양쪽 다 자기 화면 크기 대비 %로 환산해 비교한다.
// 사용: node probe-af-dom.js [on|off]   (기본 on = 필터 켠 상태)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const FILTER_ON = (process.argv[2] || 'on') !== 'off';

// 원본 실측 목표치(%) — probe-box.js / 행 스캔으로 뽑은 값
const TARGET = {
    'card': { x: 11.53, w: 74.55, y: 7.23, h: 84.52 },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate((on) => {
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
        S.autoForge.filterOn = on; S.autoForge.hammersPerBatch = 22;
        UI.openAutoForge();
    }, FILTER_ON);
    await page.waitForTimeout(350);
    // ⚠️ 열림 애니메이션(cardpop)은 scale(.7) 에서 시작한다. getBoundingClientRect 는 transform 을
    // 포함하므로 애니메이션이 끝나기 전에 재면 카드가 통째로 70% 로 찍힌다(실제로 한 번 속았다).
    // .opening 을 벗기고 애니메이션을 무효화한 뒤 잰다 — 여기서 볼 것은 레이아웃이지 연출이 아니다.
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
    });
    await page.waitForTimeout(120);
    const rows = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const pick = (sel, label) => {
            const el = document.querySelector(sel); if (!el) return null;
            const r = el.getBoundingClientRect();
            return { label, x: +(r.left / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2), y: +(r.top / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2) };
        };
        const bars = [...document.querySelectorAll('.af-age-bar')].map(el => el.getBoundingClientRect());
        const out = [pick('.af-card', 'card'), pick('.af-title', 'title'), pick('.af-label', 'label-유지')];
        if (bars.length) {
            out.push({ label: 'age-bar1', x: +(bars[0].left / W * 100).toFixed(2), w: +(bars[0].width / W * 100).toFixed(2), y: +(bars[0].top / H * 100).toFixed(2), h: +(bars[0].height / H * 100).toFixed(2) });
            out.push({ label: 'age-bar-pitch', x: 0, w: 0, y: 0, h: bars.length > 1 ? +((bars[1].top - bars[0].top) / H * 100).toFixed(2) : 0 });
            out.push({ label: 'age-bar-count', x: 0, w: 0, y: 0, h: bars.length });
        }
        out.push(pick('.af-toggle', 'filter-toggle'), pick('.af-sub-row', 'sub-row1'),
            pick('.af-bottom', 'bottom'), pick('.af-spinner', 'spinner'), pick('.af-start', 'start-btn'),
            pick('.x-btn', 'x-btn'));
        return out.filter(Boolean);
    });
    console.log(`필터 ${FILTER_ON ? 'ON (원본 shot-042950)' : 'OFF (원본 shot-043117)'} — 클론 499x892 기준 %`);
    console.log('요소'.padEnd(16) + 'x%W'.padStart(8) + 'w%W'.padStart(8) + 'y%H'.padStart(8) + 'h%H'.padStart(8) + '   원본대비Δ');
    for (const r of rows) {
        const t = TARGET[r.label];
        const d = t ? `Δx ${(r.x - t.x).toFixed(2)}  Δw ${(r.w - t.w).toFixed(2)}  Δy ${(r.y - t.y).toFixed(2)}  Δh ${(r.h - t.h).toFixed(2)}` : '';
        console.log(r.label.padEnd(16) + String(r.x).padStart(8) + String(r.w).padStart(8) + String(r.y).padStart(8) + String(r.h).padStart(8) + '   ' + d);
    }
    await browser.close();
})();
