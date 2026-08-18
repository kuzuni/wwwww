// 탭바 아이콘 6종을 큰 캔버스 + 실제 탭바 크기로 나란히 뽑는다 — `pvp-dungeon-icon-swap` 검수용.
// 아이콘은 50px 안팎으로 줄어들 때 뭉개지는지가 관건이라 **축소 크기도 같이** 찍는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KEYS = ['tab_pvp', 'tab_dungeon', 'tab_summon', 'tab_quest', 'tab_shop', 'tab_debug'];

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await b.newPage({ viewport: { width: 760, height: 420 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const missing = await page.evaluate(keys => {
        const bad = keys.filter(k => typeof IconGen.draw[k] !== 'function');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1c2128;display:flex;flex-direction:column;gap:14px;padding:18px;font:700 13px sans-serif;color:#fff';
        const row = (size, label) => {
            const r = document.createElement('div');
            r.style.cssText = 'display:flex;gap:18px;align-items:flex-end';
            r.innerHTML = `<span style="width:52px">${label}</span>`;
            keys.forEach(k => {
                const c = document.createElement('div');
                c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
                c.innerHTML = IconGen.img(k) + `<small style="font-weight:400;opacity:.7">${k.replace('tab_', '')}</small>`;
                const ico = c.querySelector('.ico, img, svg, canvas');
                if (ico) { ico.style.width = size + 'px'; ico.style.height = size + 'px'; ico.style.margin = '0'; }
                r.appendChild(c);
            });
            return r;
        };
        host.appendChild(row(128, '128px'));
        host.appendChild(row(50, '50px'));
        host.appendChild(row(32, '32px'));
        document.body.appendChild(host);
        return bad;
    }, KEYS);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.resolve(__dirname, 'tab-icons.png') });
    console.log(missing.length ? 'MISSING 드로어: ' + missing.join(', ') : '드로어 6종 모두 존재');
    if (errors.length) errors.slice(0, 6).forEach(e => console.log('  ' + e));
    await b.close();
    process.exit(missing.length || errors.length ? 1 : 0);
})();
