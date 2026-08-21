// 새 박스 모델(마인크래프트 문법) 종 시트 — pet-mount-minecraft-remake.
// 사용: node shot-mobs.js pets|mounts|enemies|skillfx [출력이름]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const KIND = process.argv[2] || 'pets';
const OUT = process.argv[3] || (KIND + '-new');

// 종류별 표 이름 + 시트 치수. pets/mounts/enemies 는 종전 값 그대로다(회귀 금지).
// skillfx 는 19종이라 4열 5행 — 셀이 좁아지면 조형이 몇 픽셀로 쪼그라들어 평가가 불가능하므로
// 시트를 넓히고(1680) 렌더 해상도도 올린다(340).
const SHEET = {
    pets: { table: 'PET_MODELS', width: 1200, size: 260, cols: 4, img: 48 },
    mounts: { table: 'MOUNT_MODELS', width: 1200, size: 260, cols: 4, img: 48 },
    enemies: { table: 'ENEMY_MODELS', width: 1200, size: 260, cols: 4, img: 48 },
    skillfx: { table: 'SKILLFX_MODELS', width: 1680, size: 340, cols: 4, img: 50, pad: 1.14 },
};
const CFG = SHEET[KIND];
if (!CFG) { console.error('알 수 없는 종류: ' + KIND + ' (pets|mounts|enemies|skillfx)'); process.exit(1); }

// 스킬 액터 19종 한국어 설명 — 원본은 `js/mobs-skillfx.js` 각 모델 위 주석이다(거기가 정본).
const SKILLFX_KR = {
    swordbot: '검사 로봇 — slash 연속 참격',
    executioner: '처형인 — guillotine 처형',
    shuriken: '표창 — ring 회오리 베기',
    archer: '궁수 자동인형 — beam 화살 세례',
    imp: '임프 — explode 화염구',
    fireblock: '불덩이 블록 — 임프의 투사체',
    wyvern: '와이번 — breath 용의 아가리',
    firedragon: '화룡 — dragonfire 종말의 화룡',
    rockgolem: '바위 골렘 — meteor 메테오',
    thunderbird: '번개새 — bolt 낙뢰',
    starbot: '성좌 로봇 — nova 초신성',
    voidknight: '공허 기사 — voidrift 공허의 창',
    spearknight: '신성 기사 — spear 신의 창',
    angel: '치유 천사 — heal 축복',
    medic: '의무 정령 — firstaid 응급 처치',
    statue: '수호 석상 — aura 성역',
    orcchief: '오크 대장 — warcry 전투의 함성',
    clockbot: '태엽 로봇 — timewarp 시간 왜곡',
    shieldgolem: '방패 골렘 — wardshield 신성한 가호',
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: CFG.width, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, 'mobsheet.html'), { waitUntil: 'load' });
    const names = await page.evaluate(t => Object.keys(window[t] || {}), CFG.table);
    if (!names.length) { console.error(CFG.table + ' 이 비었다 — mobsheet.html 의 스크립트 로드를 확인해라.'); process.exit(1); }
    const shots = [];
    for (const n of names) {
        const two = await page.evaluate(({ n, t, size, pad }) => {
            const m = window[t][n];
            return [renderMob(m, size, 0.62, pad), renderMob(m, size, Math.PI / 2, pad)];
        }, { n, t: CFG.table, size: CFG.size, pad: CFG.pad });
        shots.push({ n, two });
    }
    const html = `<html><head><meta charset="utf-8"><style>
      body{margin:0;background:#191d22;font:13px/1.4 system-ui,sans-serif;color:#cfd6de;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(${CFG.cols},1fr);gap:8px}
      .cell{background:#23272e;border-radius:8px;padding:6px;text-align:center}
      .cell img{width:${CFG.img}%;vertical-align:top}
      .cell div{margin-top:2px;font-size:12px;color:#9fb0c0}
      .cell .kr{margin-top:0;font-size:12px;color:#6f8296}
    </style></head><body><div class="grid">${shots.map(s =>
        `<div class="cell">${s.two.map(u => `<img src="${u}">`).join('')}<div>${s.n}</div>` +
        (SKILLFX_KR[s.n] && KIND === 'skillfx' ? `<div class="kr">${SKILLFX_KR[s.n]}</div>` : '') +
        `</div>`).join('')}
    </div></body></html>`;
    const tmp = path.resolve(__dirname, '_mobsheet-out.html');
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp, { waitUntil: 'load' });
    // ⚠️ `body.scrollHeight` 는 내용이 뷰포트보다 짧으면 **뷰포트 높이**를 돌려준다 —
    //    7종처럼 두 줄이면 시트 아래 절반이 빈 배경으로 남는다. 그리드 실제 바닥을 잰다.
    const h = await page.evaluate(() => Math.ceil(document.querySelector('.grid').getBoundingClientRect().bottom) + 12);
    await page.setViewportSize({ width: CFG.width, height: Math.min(9000, h + 20) });
    await page.screenshot({ path: path.resolve(__dirname, OUT + '.png'), fullPage: true });
    fs.unlinkSync(tmp);
    await browser.close();
    console.log(`→ tools/${OUT}.png · ${names.length}종 · 에러 ${errs.length}건`);
    if (errs.length) console.log(errs.slice(0, 5).join('\n'));
})();
