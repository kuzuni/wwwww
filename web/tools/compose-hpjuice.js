// HP 타격감 채점용 스트립 합성 — shot-hpjuice.js가 뽑은 연속 프레임을 격자로 붙이고
// 프레임 번호 + 연출 경과시간(ms)을 태그한다. 정지 1장으로는 타이밍·이징을 못 보므로 채점은 이 스트립으로 한다.
// 사용: node compose-hpjuice.js   (shot-hpjuice.js 실행 후)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const SRC = path.join(__dirname, 'hpjuice');
const OUT = path.join(__dirname, 'hpjuice');

const CANVAS_TOP = 141.5;  // 3D 캔버스의 뷰포트 y 오프셋 (project()가 캔버스 기준 좌표를 준다)
const CROP_TOP = 105;      // shot-hpjuice.js의 CROP_ENEMY.y

const SEQ = [
    { tag: 'A0-impact', cols: 4, title: '크리티컬 타격 순간 (수동 스텝 0.012s — 히트스톱 구간은 프레임이 거의 안 나아간다)' },
    { tag: 'A-crit', cols: 5, title: '크리티컬 이후 2단 HP바 (앞바 즉시 / 주황 잔상바 홀드→가속 추격)' },
    { tag: 'B-combo', cols: 5, title: '일반 3연타 (프레임 0/4/8 타격) — 잔상바가 연타 누적 손실을 한 덩어리로 보여준다' },
    { tag: 'C-kill', cols: 5, title: '처치 버스트 (스파크 2색 + 충격 링 + 쓰러짐 진입)' },
    { tag: 'D-hero', cols: 5, title: '영웅 피격 — 머리 위 2단 바 + 화면 가장자리 붉은 비네트 (풀 뷰포트)' },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', e => console.log('PAGEERROR: ' + e));
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE: ' + m.text()); });
    const made = [];

    for (const s of SEQ) {
        const meta = JSON.parse(fs.readFileSync(path.join(SRC, s.tag + '.json'), 'utf8'));
        const files = meta.map((_, i) => path.join(SRC, `${s.tag}-${String(i).padStart(2, '0')}.png`)).filter(fs.existsSync);
        if (!files.length) { console.log('skip ' + s.tag); continue; }
        const t0 = meta[0].clock;
        const labels = meta.map((m, i) => `f${i}  +${Math.round((m.clock - t0) * 1000)}ms`);
        const d64 = files.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));

        // 바 확대 스트립: 프레임별 barY(캔버스 좌표)를 크롭 이미지 좌표로 환산해 바 주변만 3배로
        const barYs = meta.map(m => m.barY).filter(v => v != null);
        const isFull = s.tag === 'D-hero';
        const zoom = barYs.length ? {
            x: 96, w: 220, h: 74, s: 3,
            y: Math.round(barYs.reduce((a, b) => a + b, 0) / barYs.length + CANVAS_TOP - (isFull ? 0 : CROP_TOP)) - 37
        } : null;

        for (const mode of (zoom ? ['grid', 'bar'] : ['grid'])) {
            const out = path.join(OUT, `strip-${s.tag}${mode === 'bar' ? '-bar' : ''}.png`);
            await page.setContent(`<body style="margin:0;background:#12161c;font:12px/1.3 monospace;color:#cfd8dc">
<div style="padding:10px 12px;font:600 15px/1.4 sans-serif;color:#fff">${s.title}${mode === 'bar' ? '  — 머리 위 바 3배 확대' : ''}</div>
<div id=g style="display:grid;grid-template-columns:repeat(${mode === 'bar' ? 4 : s.cols},max-content);gap:6px;padding:0 12px 12px"></div>
<script>
(()=>{ // setContent가 document.write로 같은 window에 덮어써서 최상위 const가 재선언 충돌한다 — IIFE로 격리
const D=${JSON.stringify(d64)}, L=${JSON.stringify(labels)}, MODE='${mode}', Z=${JSON.stringify(zoom)};
const CW=${isFull ? 200 : 240};
let left=D.length;
D.forEach((src,i)=>{
  const cell=document.createElement('div');
  const cv=document.createElement('canvas');
  const cap=document.createElement('div');
  cap.textContent=L[i]; cap.style.cssText='text-align:center;padding-top:2px;color:#90a4ae';
  cell.appendChild(cv); cell.appendChild(cap);
  document.getElementById('g').appendChild(cell);
  const im=new Image();
  im.onload=()=>{
    const x=cv.getContext('2d'); x.imageSmoothingEnabled=false;
    if(MODE==='bar'){ cv.width=Z.w*Z.s; cv.height=Z.h*Z.s;
      x.drawImage(im,Z.x,Z.y,Z.w,Z.h,0,0,Z.w*Z.s,Z.h*Z.s); }
    else { const sc=CW/im.width; cv.width=CW; cv.height=Math.round(im.height*sc);
      x.drawImage(im,0,0,im.width,im.height,0,0,cv.width,cv.height); }
    if(--left===0) document.title='ok';
  };
  im.src=src;
});
})();
</script></body>`);
            await page.waitForFunction(() => document.title === 'ok', null, { timeout: 30000 });
            const box = await page.evaluate(() => {
                const b = document.body.getBoundingClientRect();
                return { width: Math.ceil(document.body.scrollWidth), height: Math.ceil(document.body.scrollHeight), _: b.top };
            });
            await page.setViewportSize({ width: Math.min(2400, box.width), height: Math.min(4000, box.height) });
            await page.screenshot({ path: out, fullPage: true });
            made.push(path.basename(out));
        }
    }
    console.log('composed: ' + made.join(', '));
    await browser.close();
})();
