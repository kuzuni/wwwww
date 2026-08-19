// '이모지 파생(near-tracing)' 지적을 눈으로 끝내기 위한 증거 시트.
// 사용: node shot-icon-originality.js  → tools/icon-vs-ref.png
//
// 왜: icon-gen 채점 메모에 "상점🏪·디버그🐞·두루마리📜·뒤로가기◀ 는 이모지 파생 — 오리지널리티
//     감점"이 남아 있다. 그런데 이 넷 중 **둘은 원본 스크린샷을 실측해 재현한 것**이라, 이모지에서
//     멀어지게 다시 그리면 원본 대조 게이트가 깨진다(이 저장소의 통과 기준은 '원본과 같아 보이는가'다).
//     주장을 말로 반박하지 말고 **원본 크롭을 나란히 놓아** 채점자가 직접 보게 만든다.
//
// 시트 구성: [원본 크롭(있으면)] | [우리 아이콘 8×] · 대응 원본이 없는 것은 그 자리를 명시한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitUiReady } = require('./wait-ready.js');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens');

// 원본 탭바(shot-042120, 499×892)는 **5칸이고 디버그 탭이 없다**(probe-tabbar.js 머리말).
// 밴드는 y 808~889 이고 5칸이 폭을 고르게 나눈다 — 상점은 마지막 칸이다.
const BAND = { y: 808, h: 81, w: 499, cells: 5 };
const SHOP_CELL = 4;

const CASES = [
    { name: 'tab_shop', kr: '상점', emoji: '🏪',
      ref: { file: 'shot-042120.png', x: Math.round(BAND.w / BAND.cells * SHOP_CELL), y: BAND.y,
             w: Math.round(BAND.w / BAND.cells), h: BAND.h },
      verdict: '원본 탭바 5칸 중 마지막 칸을 실측해 재현 — 크기 Δ ±0.45%p (probe-tabbar.js)' },
    { name: 'tri_left', kr: '뒤로가기', emoji: '◀',
      // 원본 실측: 빨간 버튼의 밝은 면이 x8,y773 에서 **31×21px**(icongen.js tri 머리말의 그 수치다).
      // ⚠️ 자동 탐색("위쪽에서 제일 붉은 덩어리")은 두 번 다 헛것을 물어 왔다 — 선물 상자, 그 다음엔
      //    아바타 얼굴. 이 버튼은 리그 화면 **왼쪽 아래**에 있고, 같은 화면에 더 크고 더 붉은 것들이
      //    위에 여럿 있다. 실측값을 박아 둔다(이 저장소의 다른 원본 대조와 같은 방식).
      //    붉은 덩어리를 연결 성분으로 갈라 크기·흰 잉크로 거른 결과: 탭바 ✕ 51×45(ar 1.13) vs
      //    뒤로가기 31×21(ar 1.48) — 크기로 갈린다. 키라인까지 담으려고 사방 4px 씩 넓혔다.
      ref: { file: 'shot-042149.png', x: 4, y: 769, w: 39, h: 29 },
      verdict: '원본 잉크 12×13px·비 0.923 을 그대로 씀 (icongen.js tri 머리말 / probe-tri-ref.js)' },
    { name: 'tab_debug', kr: '디버그', emoji: '🐞',
      ref: null, verdict: '대응 원본 없음 — 클론 전용 탭이고 배포 탭바에서는 숨김(?debug= 로만 노출)' },
    { name: 'scroll', kr: '두루마리', emoji: '📜',
      ref: null, verdict: '대응 원본 없음 — 자체 아이콘(축을 원반이 아니라 둥근 막대로 세 번 고쳐 잡은 자리)' },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitUiReady(page);

    // 원본 PNG 를 dataURL 로 들여보낸다(file:// 에서 다른 파일을 fetch 하면 CORS 로 막힌다).
    const refData = {};
    for (const c of CASES) {
        if (!c.ref) continue;
        const p = path.join(REF, c.ref.file);
        if (!fs.existsSync(p)) { errors.push('원본 없음: ' + c.ref.file); c.ref = null; continue; }
        refData[c.ref.file] = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    }

    const b64 = await page.evaluate(async ([cases, refData]) => {
        const load = (src) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });

        const CELL = 168;          // 한 칸 변
        const ROW = CELL + 74;     // 캡션 자리 포함
        const cv = document.createElement('canvas');
        cv.width = 1120; cv.height = 90 + ROW * cases.length;
        const g = cv.getContext('2d');
        g.fillStyle = '#141519'; g.fillRect(0, 0, cv.width, cv.height);
        g.imageSmoothingEnabled = false;
        g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif';
        g.fillText("'이모지 파생' 지적 대조 — 원본 크롭 vs 우리 아이콘", 28, 46);
        g.font = '15px sans-serif'; g.fillStyle = '#9aa0ab';
        g.fillText('※ 원본이 있는 것은 원본을 재현한 것이지 이모지를 베낀 것이 아니다 — 이모지 쪽으로 안 닮게 고치면 원본 대조 게이트가 깨진다.', 28, 72);

        for (let i = 0; i < cases.length; i++) {
            const c = cases[i], top = 96 + ROW * i;
            g.strokeStyle = '#2b2f37'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(28, top - 12); g.lineTo(cv.width - 28, top - 12); g.stroke();

            // ── 왼쪽: 원본 크롭
            g.fillStyle = '#6f7681'; g.font = '14px sans-serif';
            g.fillText('원본', 28, top + 16);
            if (c.ref) {
                const img = await load(refData[c.ref.file]);
                const box = c.ref;
                if (box) {
                    const s = Math.min(CELL / box.w, CELL / box.h);
                    const dw = box.w * s, dh = box.h * s;
                    g.fillStyle = '#000'; g.fillRect(28, top + 26, CELL, CELL);
                    g.drawImage(img, box.x, box.y, box.w, box.h, 28 + (CELL - dw) / 2, top + 26 + (CELL - dh) / 2, dw, dh);
                    g.fillStyle = '#6f7681'; g.font = '13px monospace';
                    g.fillText(`${c.ref.file.replace('shot-','')} @${box.x},${box.y} ${box.w}×${box.h}`, 28, top + 26 + CELL + 20);
                }
            } else {
                g.fillStyle = '#22252b'; g.fillRect(28, top + 26, CELL, CELL);
                g.fillStyle = '#6f7681'; g.font = '15px sans-serif';
                g.fillText('대응 원본', 54, top + 26 + CELL / 2 - 6);
                g.fillText('없음', 54, top + 26 + CELL / 2 + 18);
            }

            // ── 오른쪽: 우리 아이콘(투명 배경이라 탭바와 같은 어두운 판 위에 얹는다)
            const url = IconGen.url(c.name);   // 크기는 IconGen 이 이름별로 정한다(opt 로 못 준다)
            const ico = await load(url);
            const x0 = 28 + CELL + 46;
            const s2 = Math.min(CELL / ico.width, CELL / ico.height);
            g.fillStyle = '#1b1d22'; g.fillRect(x0, top + 26, CELL, CELL);
            g.drawImage(ico, x0 + (CELL - ico.width * s2) / 2, top + 26 + (CELL - ico.height * s2) / 2, ico.width * s2, ico.height * s2);
            g.fillStyle = '#6f7681'; g.font = '13px monospace';
            g.fillText(`IconGen '${c.name}'`, x0, top + 26 + CELL + 20);

            // ── 오른쪽 글: 이름 + 지적 + 판정
            const tx = x0 + CELL + 46;
            g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif';
            g.fillText(`${c.kr}  ${c.emoji}`, tx, top + 46);
            g.fillStyle = '#e0693f'; g.font = '15px sans-serif';
            g.fillText(`지적: "${c.emoji} 이모지 파생 — 오리지널리티 감점"`, tx, top + 78);
            g.fillStyle = '#7fc98a'; g.font = '15px sans-serif';
            // 긴 판정문은 접어서 두 줄까지
            const words = c.verdict.split(' ');
            let line = '', ly = top + 110;
            for (const w of words) {
                if (g.measureText(line + w).width > cv.width - tx - 40) { g.fillText(line, tx, ly); line = ''; ly += 24; }
                line += w + ' ';
            }
            g.fillText(line, tx, ly);
        }
        return cv.toDataURL('image/png').split(',')[1];
    }, [CASES, refData]);

    fs.writeFileSync(path.join(__dirname, 'icon-vs-ref.png'), Buffer.from(b64, 'base64'));
    console.log('wrote tools/icon-vs-ref.png');
    console.log(`콘솔/페이지 에러 ${errors.length}건`);
    errors.slice(0, 5).forEach(e => console.log('  ! ' + e.slice(0, 160)));
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
