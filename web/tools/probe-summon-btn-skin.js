// probe-summon-btn-skin.js — 소환 버튼 스킨이 원본과 같은가 (aaa-skin ⓐ)
//
// 왜 이 판정기가 필요했나: R3 비평가 2인이 "버튼이 상단 하이라이트·아래턱이 없어 **비활성
// 판때기**로 읽힌다"를 화면마다 반복해 지적했는데, 그게 취향인지 실결함인지 가르는 자가
// 없었다. 원본 두 컷의 열 스캔이 같은 값(면 rgb(163,163,163) **평면** · 턱 rgb(50,49,50))을
// 내므로 수치로 못박을 수 있다.
//
// 재는 것 — 원본 PNG 와 클론 캡처를 **같은 함수**로 통과시킨다:
//   ① 면 최빈색  원본은 한 색이라 최빈색 점유율이 압도적이다.
//   ② 면 산포    채널별 (최대-최소). 그라디언트면 커진다 — 교정 전 클론이 정확히 그랬다.
//   ③ 아래턱 색  면 아래 띠. 면과의 명도차가 원본만큼 나야 '턱'으로 읽힌다.
//   ④ 잉크 비율  버튼 창의 어두운 화소%(검정 키라인) / 흰 화소%(글리프 코어).
//                키라인이 없으면 어두운 화소가 반토막 난다(원본 15.00% ↔ 교정 전 6.70%).
//
// ⚠️ 클론 좌표는 **DOM 에서 버튼 사각형을 받아** 쓴다. 좌표를 베껴 두면 레이아웃이 밀렸을 때
//    자가 엉뚱한 자리를 재고도 통과한다(TODO '함정 ④ 자가 코드보다 낡으면 판정이 무효').
// ⚠️ 원본 컷은 앱 폭이 490·496 이고 클론은 499 다 — 창 크기를 px 로 베끼면 안 되므로 폭 대비
//    비율로 환산해 옮긴다.
//
// 사용: node tools/probe-summon-btn-skin.js
// 종료: 0 통과 / 1 불통과 / 2 측정 불가(자 고장)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 소환 버튼 — 검정 키라인 **안쪽**. 열 스캔(x=190/200)으로 경계를 직접 확인한 값이다.
// ⚠️ `face` 는 글자가 없는 **왼쪽 세로 띠**만 잡는다 — 면 창에 글리프가 들어오면 산포가 곧바로
//    255 가 돼(흰 코어 ↔ 검정 키라인) '면이 평면인가'라는 질문 자체가 성립하지 않는다.
const REF = [
    { file: 'shot-042356.png', name: '펫',   face: [182, 490, 14, 50], lip: [182, 545, 128, 4], win: [175, 484, 145, 64] },
    { file: 'shot-042340.png', name: '스킬', face: [186, 658, 14, 50], lip: [186, 714, 128, 4], win: [179, 652, 145, 64] },
];

// 페이지 안에서 도는 계측기 — 원본·클론 양쪽에 같은 소스가 주입된다.
const MEASURE_SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
    const get = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };
    const scan = (r) => {
        const [x, y, w, h] = r;
        if (x < 0 || y < 0 || x + w > c.width || y + h > c.height || w <= 0 || h <= 0) return null;
        const tally = new Map(); let dark = 0, white = 0, tot = 0;
        const lo = [255,255,255], hi = [0,0,0];
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const p = get(x + i, y + j), key = p.join(',');
            tally.set(key, (tally.get(key) || 0) + 1);
            const L = .299*p[0] + .587*p[1] + .114*p[2];
            tot++; if (L < 40) dark++; if (L > 200) white++;
            for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
        }
        const top = [...tally.entries()].sort((u, v) => v[1] - u[1])[0];
        const mode = top[0].split(',').map(Number);
        return { mode, modePct: +(100*top[1]/tot).toFixed(1),
                 dark: +(100*dark/tot).toFixed(2), white: +(100*white/tot).toFixed(2),
                 span: hi.map((v, k) => v - lo[k]),
                 lum: +(.299*mode[0] + .587*mode[1] + .114*mode[2]).toFixed(1) };
    };
    return { imgW: c.width, imgH: c.height, face: scan(a.face), lip: scan(a.lip), win: scan(a.win) };
})`;

const dataUrlOf = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// ⚠️ `page.evaluate(<문자열>, arg)` 는 문자열을 **식**으로 보고 arg 를 안 넘긴다(실측: 함수가
//    그대로 평가돼 undefined 가 돌아온다). 진짜 함수로 감싸 안에서 다시 만들어 호출한다.
const measure = (page, arg) => page.evaluate(
    ({ src, a }) => (new Function('return ' + src))()(a), { src: MEASURE_SRC, a: arg });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];

    // ── ① 원본 두 컷 ──────────────────────────────────────────────────────
    // ⚠️ 계측은 **빈 페이지**에서만 돈다 — 게임 페이지 안에서 `new Function` 을 만들면 조용히
    //    막혀 결과가 통째로 null 로 돌아온다(이 판정기를 만들며 실제로 밟았다). 클론 캡처도
    //    파일로 떨궈 이 페이지에서 잰다.
    const flat = await browser.newPage();
    const ref = [];
    for (const r of REF) {
        const dataUrl = dataUrlOf(path.resolve(__dirname, '../ref/screens/', r.file));
        const m = await measure(flat, { dataUrl, face: r.face, lip: r.lip, win: r.win });
        ref.push({ name: r.name, file: r.file, m });
    }

    // ── ② 클론 두 화면 — 실제로 띄워 DOM 사각형을 받아 잰다 ─────────────
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 🚨 시드를 안 넣으면 펫 보유가 기본값이라 그리드가 2행 더 쌓이고 소환 바가 **뷰포트 밖**
    //    (실측 y=1329)으로 내려간다 — 캡처 스크립트와 같은 시드·리로드 절차를 그대로 쓴다.
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene', { label: '시드 상태 로드' });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; UI.toast = () => {}; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const clone = [];
    for (const [name, opener] of [['펫', PETS_STATE_SRC], ['스킬', `UI.switchTab('summon'); UI.switchSummonSub('skills')`]]) {
        await page.evaluate(opener);
        await page.waitForTimeout(500);
        const box = await page.evaluate(() => {
            // ⚠️ 숨은 패널(펫/스킬)이 DOM 에 함께 남아 있어 `querySelector` 는 **안 보이는 쪽**을
            //    집을 수 있다(실측: 스킬 화면에서 0x0 사각형이 돌아왔다). 실제로 그려진 것만 쥔다.
            const el = [...document.querySelectorAll('.summon-btn')]
                .find(n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const bw = parseFloat(cs.borderTopWidth) || 0;
            return { x: r.x, y: r.y, w: r.width, h: r.height, bw, cls: el.className };
        });
        if (!box) { console.log(`FAIL ${name} — .summon-btn 을 못 찾았다(측정 불가)`); await browser.close(); process.exit(2); }
        const shot = path.join(require('os').tmpdir(), `sbs-${name}.png`);
        await page.screenshot({ path: shot });
        // 면 = 글자가 없는 왼쪽 세로 띠(원본과 같은 규약), 턱 = 버튼 밑단 띠
        const X = Math.round(box.x + box.bw + box.w * .04);
        const Wd = Math.max(6, Math.round(box.w * .10));
        const faceY = Math.round(box.y + box.bw + 2);
        const faceH = Math.round((box.h - 2 * box.bw) * .84);
        const lipY = Math.round(box.y + box.h - box.bw - 5);
        const m = await measure(flat, {
            dataUrl: dataUrlOf(shot),
            face: [X, faceY, Wd, faceH],
            lip: [Math.round(box.x + box.bw + box.w * .04), lipY, Math.round(box.w * .84), 4],
            win: [Math.round(box.x - 7), Math.round(box.y - 4), 145, 64],
        });
        fs.unlinkSync(shot);
        clone.push({ name, box, m });
    }
    await browser.close();

    // ── ③ 판정 ────────────────────────────────────────────────────────────
    const fails = [];
    const line = (t, o, c, unit = '') => `    ${t.padEnd(16)} 원본 ${String(o).padEnd(18)} 클론 ${c}${unit}`;
    for (let i = 0; i < ref.length; i++) {
        const R = ref[i].m, C = clone[i].m, name = ref[i].name;
        if (!R || !R.face || !C || !C.face) { console.log(`FAIL ${name} — 측정 창이 그림 밖이다(자 고장) box=${JSON.stringify(clone[i] && clone[i].box)}`); process.exit(2); }
        console.log(`[${name}] 원본 ${ref[i].file} ${R.imgW}x${R.imgH} · 클론 ${C.imgW}x${C.imgH} (${clone[i].box.cls})`);
        console.log(line('면 최빈색', R.face.mode.join(','), C.face.mode.join(',')));
        console.log(line('면 최빈 점유', R.face.modePct + '%', C.face.modePct + '%'));
        console.log(line('면 산포(RGB)', R.face.span.join('/'), C.face.span.join('/')));
        console.log(line('턱 최빈색', R.lip.mode.join(','), C.lip.mode.join(',')));
        console.log(line('턱↔면 명도차', (R.face.lum - R.lip.lum).toFixed(1), (C.face.lum - C.lip.lum).toFixed(1)));
        console.log(line('창 어두운 화소', R.win.dark + '%', C.win.dark + '%'));
        console.log(line('창 흰 화소', R.win.white + '%', C.win.white + '%'));

        // ⑴ 면 색 — 채널당 ±10 (원본이 완전 평면이라 여유를 크게 줄 이유가 없다)
        const dRGB = C.face.mode.map((v, k) => v - R.face.mode[k]);
        if (dRGB.some(v => Math.abs(v) > 10)) fails.push(`${name} 면 색 Δ${dRGB.join('/')} (허용 ±10)`);
        // ⑵ 면 평탄도 — 원본은 산포 0. 그라디언트를 다시 얹으면 여기서 걸린다.
        if (Math.max(...C.face.span) > 24) fails.push(`${name} 면이 평면이 아니다 — 산포 ${C.face.span.join('/')} (허용 ≤24, 원본 ${R.face.span.join('/')})`);
        // ⑶ 턱 — 면보다 이만큼 어두워야 '턱'으로 읽힌다(원본 차 ≈113)
        const need = (R.face.lum - R.lip.lum) * .7;
        if ((C.face.lum - C.lip.lum) < need) fails.push(`${name} 아래턱이 면과 안 갈린다 — 명도차 ${(C.face.lum - C.lip.lum).toFixed(1)} < ${need.toFixed(1)}(원본의 70%)`);
        // ⑷ 글자 키라인 — 검정 잉크가 원본의 60% 는 돼야 한다(민글자면 반토막 난다)
        if (C.win.dark < R.win.dark * .6) fails.push(`${name} 글자 검정 키라인 부족 — 어두운 화소 ${C.win.dark}% < ${(R.win.dark * .6).toFixed(2)}%(원본 ${R.win.dark}% 의 60%)`);
        // ⑸ 흰 화소가 원본의 2배를 넘으면 면이 통째로 밝다(교정 전 28.62% ↔ 10.09%)
        if (C.win.white > R.win.white * 2) fails.push(`${name} 창이 원본보다 지나치게 밝다 — 흰 화소 ${C.win.white}% > ${(R.win.white * 2).toFixed(2)}%`);
    }
    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);

    if (fails.length) { console.log('\n판정: 불통과 ' + fails.length + '건'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
    console.log('\n판정: 통과 — 소환 버튼 면·턱·잉크가 원본 두 컷과 같다 (콘솔 에러 0)');
    process.exit(0);
})();
