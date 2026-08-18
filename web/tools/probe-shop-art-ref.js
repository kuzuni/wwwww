// 상점 특가 카드 '상품 일러스트'(나무 상자 + 앞 소품) **원본 PNG 실측** — icon-gen 슬라이스용.
// 사용: PW_PATH=<playwright> node probe-shop-art-ref.js [png경로]
//
// 재는 것: 카드 3장 각각에서 흰 카드 바탕 위에 그려진 일러스트의 바운딩 박스.
//   · 카드 y 범위는 probe-shop-ref.js 와 같은 방법(흰 런)으로 잡는다.
//   · 일러스트는 카드 오른쪽 절반에 있고, 같은 영역에 **파란 가격 버튼**이 겹친다 →
//     파란 마스크(B가 R·G보다 크게 우세)를 제외해야 한다. 안 그러면 박스가 버튼까지 먹는다.
//   · 카드 왼쪽 회색 보상 pill·빨간 리본과 겹치지 않도록 x 는 카드 중앙(50%) 오른쪽만 본다.
// ⚠️ 앱 폭 ≠ 이미지 폭: 이 컷은 이미지 500px 인데 가운데 정렬 요소(배너·카드·상단바 잉크)의
//    중심이 244.5~245 라 appW≈490 이다. %W 는 **앱 폭 기준**으로 낸다(probe-shop-ref.js 메모 ④).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042632.png');

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(PNG).toString('base64');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const out = await page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const isWhite = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
        const isBlue = (p) => p[2] > 120 && p[2] - p[0] > 55 && p[2] - p[1] > 40;

        // 특가 카드 3장의 y 범위. ⚠️ '가장 긴 흰 런'은 이 카드에서 못 쓴다 —
        // 빨간 리본(x84~341)과 파란 가격 버튼(x343~417)이 카드 폭을 거의 다 덮어 흰 런이 끊긴다.
        // 대신 **카드 왼쪽 여백 열**(x=68·72)이 카드 안에서만 흰색인 성질을 쓴다.
        const rows = [];
        for (let y = 180; y < 600; y++) rows.push(isWhite(at(68, y)) && isWhite(at(72, y)));
        const cards = [];
        let st = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i] && st < 0) st = i;
            if (!rows[i] && st >= 0) { if (i - st > 40) cards.push([st + 180, i + 180 - 1]); st = -1; }
        }
        if (st >= 0 && rows.length - st > 40) cards.push([st + 180, 599]);

        // 🚨 흰 여백열로 잡은 밴드는 **카드 위쪽 31px 이 통째로 빠진다** — 그 구간은 빨간 리본이
        //    x=68·72 를 덮기 때문이다(카드 3장 모두 98px 로 균일하게 짧게 나온다).
        //    그대로 쓰면 일러스트 상단(상자 윗면)이 잘려 높이가 9.34%H 로 과소 측정된다.
        //    카드 세로 경계는 **카드 상단 검정 키라인**으로 다시 잡는다: 리본이 없는 x=200·260 열에서
        //    밴드 위쪽으로 올라가며 처음 만나는 어두운 행이 카드 윗변이다.
        const isDark = (p) => p[0] < 90 && p[1] < 90 && p[2] < 90;
        for (const c of cards) {
            for (let y = c[0]; y > c[0] - 60; y--) {
                if (isDark(at(200, y)) && isDark(at(260, y))) { c[0] = y; break; }
            }
        }

        // 카드마다 오른쪽 절반의 '흰색도 파랑도 아닌' 잉크 = 일러스트
        const res = cards.map(([y0, y1]) => {
            let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
            // ⚠️ 카드 자체의 **검은 외곽선**도 잉크라 그대로 재면 박스가 카드와 똑같이 나온다
            //    (첫 판이 정확히 그랬다: 일러 = 카드 상자). 카드 안쪽으로 8px 물려서 본다(4px 는 테두리+그림자에 아직 닿는다 — 실측으로 확인).
            for (let y = y0 + 8; y <= y1 - 8; y++) {
                for (let x = 250; x < 419; x++) {
                    // 🚨 파란 마스크만으로는 가격 버튼을 못 뺀다 — 버튼의 **검정 키라인과 드롭섀도**가
                    //    잉크로 남아 일러 하단이 카드 바닥까지 끌려 내려간다(1차 측정에서 h 가 13px 부풀었다).
                    //    버튼 상자(카드 바닥 기준 -53~-9px, x 337~423)를 여유 두고 통째로 제외한다.
                    if (x >= 337 && x <= 423 && y >= y1 - 53 && y <= y1 - 9) continue;
                    const p = at(x, y);
                    if (isWhite(p) || isBlue(p)) continue;
                    // 카드 밖(다크 마룬 배경)은 제외
                    if (p[0] < 60 && p[1] < 20 && p[2] < 50) continue;
                    n++;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
            return { y0, y1, minX, maxX, minY, maxY, n };
        });
        return { W, H, cards, res };
    }, dataUrl);
    await browser.close();

    // 앱 프레임: 가운데 정렬 요소 중심 245 → appW = 245*2 = 490, 좌 오프셋 (W-490)/2
    const APP_W = 490, APP_L = (out.W - APP_W) / 2, APP_H = out.H;
    console.log(`원본 ${out.W}x${out.H} · 앱 프레임 appW=${APP_W} appL=${APP_L} (중심 245 기준)`);
    const names = ['기술', '펫', '탈것'];
    out.res.forEach((r, i) => {
        const w = r.maxX - r.minX + 1, h = r.maxY - r.minY + 1;
        console.log(`${names[i] || i} 카드 y ${r.y0}~${r.y1} · 일러 x ${r.minX}~${r.maxX} y ${r.minY}~${r.maxY}`
            + ` · w ${w}px(${(w / APP_W * 100).toFixed(2)}%W) h ${h}px(${(h / APP_H * 100).toFixed(2)}%H)`
            + ` · 종횡비 ${(w / h).toFixed(3)}`
            + ` · 카드상단대비 top +${r.minY - r.y0}px · 카드우끝(427)대비 right ${427 - r.maxX}px`);
    });
})();
