// 원본|클론 좌우 합성 — 비평가 채점용. 같은 높이로 정규화 + 10% 눈금자
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path'), fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens');
const CLONE = path.join(__dirname, 'ref-cmp/clone');
const OUT = path.join(__dirname, 'ref-cmp/cmp');
fs.mkdirSync(OUT, { recursive: true });

const PAIRS = [
    ['main', '042120'], ['offline', '042110'], ['league', '042149'], ['league-rewards', '042208'],
    ['league-challenge', '042228'], ['dungeons', '042251'], ['dungeon-detail', '042304'],
    ['skills', '042340'], ['pets', '042356'], ['pets-2', '042445'], ['tech-overview', '042407'],
    ['skill-detail', '042426'], ['pet-detail', '042449'], ['pet-upgrade', '042503'],
    ['summon-rates', '042521'], ['tech-branch', '042546'], ['tech-node', '042605'],
    ['shop', '042632'], ['pass', '042705'], ['profile', '042724'], ['settings', '042744'],
    ['forge-info', '042831'], ['forge-list', '042905'], ['forge-detail', '042931'],
    ['autoforge', '042950'], ['autoforge-filter', '043117'], ['craft-compare', '043224'],
    ['gear-detail', '043244'], ['player-info', '043313'], ['chat', '043500'],
];
const H = 880; // 정규화 높이

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1100, height: 960 } });
    const made = [];
    for (const [name, ref] of PAIRS) {
        const a = path.join(REF, 'shot-' + ref + '.png');
        const b = path.join(CLONE, name + '.png');
        if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log('skip ' + name); continue; }
        const d64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
        const ticks = Array.from({ length: 9 }, (_, i) => `<div class="tick" style="top:${(i + 1) * 10}%"><span>${(i + 1) * 10}%</span></div>`).join('');
        await page.setContent(`<style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#22252b;font:12px/1.3 system-ui,sans-serif;color:#eee}
        .row{display:flex;gap:14px;padding:26px 14px 14px;justify-content:center;align-items:flex-start}
        .col{position:relative}
        .col img{height:${H}px;display:block;border:1px solid #555}
        .lab{position:absolute;top:-20px;left:0;font-weight:700;letter-spacing:.5px}
        .tick{position:absolute;left:0;right:0;height:0;border-top:1px dashed rgba(255,80,80,.45)}
        .tick span{position:absolute;right:2px;top:-12px;font-size:9px;color:#ff8080}
        </style><div class="row">
          <div class="col"><div class="lab">원본 (shot-${ref})</div><img src="${d64(a)}">${ticks}</div>
          <div class="col"><div class="lab">클론 (${name})</div><img src="${d64(b)}">${ticks}</div>
        </div>`);
        await page.waitForTimeout(120);
        const el = await page.$('.row');
        await el.screenshot({ path: path.join(OUT, name + '.png') });
        made.push(name);
    }
    console.log('composed ' + made.length + ': ' + made.join(', '));
    await browser.close();
})();
