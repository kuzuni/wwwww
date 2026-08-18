// 빌릿(두들길 소재) 확대 검수 — 모루 버튼을 6벌 복제해 각각 다른 절대 시각에 세워 두고
// 한 장으로 찍는다. 한 컷씩 따로 찍으면 비교가 안 되고, 자고 찍으면 소프트웨어 GL 에서
// 프레임 시각이 거짓이 된다(anvil-seq 와 같은 이유로 전부 pause + currentTime 주입).
//
// ⚠️ 복제본에도 `.anvil-fx` 오버레이가 붙어야 망치가 같이 선다 — playAnvilStrike 는 원본
//    버튼에만 붙이므로, 원본에 연출을 건 **뒤에** 복제한다.
// ⚠️ 뷰포트는 probe-anvil-hammer·shot-anvil-seq 와 같은 390×844 로 고정한다(480 으로 찍으면
//    모루가 113px 로 나와 네이티브 판독성을 23% 관대하게 보게 된다).
// 사용: node shot-billet.js  → tools/billet-zoom.png (확대) + tools/billet-native.png (92px)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 정지 / 1타 접촉 / 1타 드웰 / 타격 사이 / 2타 접촉 / 3타 접촉 / 3타 드웰 / 꼬리
const TIMES = [0, 173, 206, 300, 378, 648, 700, 860];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    for (const [name, dsf] of [['billet-zoom', 8], ['billet-native', 1]]) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dsf });
        page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n')[0]));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 30000 });
        await page.evaluate(() => {
            if (typeof Combat !== 'undefined') Combat.tick = () => {};
            if (typeof Scene3D !== 'undefined' && Scene3D.renderer) Scene3D.renderer.render = () => {};
            UI.openSheet && UI.openSheet('equip');
        });
        await page.waitForSelector('.anvil-btn .anvil-svg', { timeout: 20000 });
        await page.evaluate((TIMES) => {
            UI._anvilBusy = false; UI.playAnvilStrike(() => {});
            (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
            const src = document.querySelector('.anvil-btn');
            const strip = document.createElement('div');
            strip.id = 'billet-strip';
            strip.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;gap:2px;'
                + 'background:#0e0c0b;padding:2px;align-items:flex-start';
            for (const t of TIMES) {
                const cell = document.createElement('div');
                cell.style.cssText = 'width:92px;position:relative';
                const c = src.cloneNode(true);
                c.style.cssText = 'width:92px;display:block';
                cell.appendChild(c);
                const lb = document.createElement('div');
                lb.textContent = t + 'ms';
                lb.style.cssText = 'color:#fff;font:6px/1.4 monospace;text-align:center';
                cell.appendChild(lb);
                strip.appendChild(cell);
            }
            document.body.appendChild(strip);
            // 복제본마다 다른 절대 시각으로 세운다 — 원본은 0ms(정지 자세)로 둔다.
            strip.querySelectorAll('.anvil-btn').forEach((c, i) => {
                c.querySelectorAll('*').forEach(n => n.getAnimations().forEach(a => {
                    a.pause(); a.currentTime = Math.min(TIMES[i], (a.effect.getComputedTiming().endTime || 0));
                }));
                c.getAnimations().forEach(a => { a.pause(); a.currentTime = TIMES[i]; });
            });
        }, TIMES);
        await page.waitForTimeout(300);
        const strip = await page.$('#billet-strip');
        await strip.screenshot({ path: path.join(__dirname, name + '.png') });
        await page.close();
    }
    await browser.close();
    console.log(errors.length ? '⚠ 콘솔 에러 ' + errors.length + '건\n' + errors.join('\n') : '✓ 콘솔 에러 0건');
    console.log('→ tools/billet-zoom.png (dsf8) · tools/billet-native.png (92px)');
})();
