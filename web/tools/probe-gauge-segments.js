// probe-gauge-segments.js — 게이지가 **분절 블록 채움 + 플랫 매트**인지 화소로 검사한다.
//
// 근거(사용자 확정 화풍 2026-08-20, 화풍 블록 ⓕ):
//   ㉯ 표면은 플랫/매트 — 글로시 유리·금속 광택 폐기
//   ㉳ 게이지·바 = 분절/블록 채움(마인크래프트 하트처럼 청키 세그먼트)
//   ㉮ 배치·레이아웃은 원본 절대 기준 — 그래서 이 축은 **칠하는 속성만** 바꿔야 한다
//
// 검사 3축(게이지 5종 각각):
//   ① **분절이 실제로 칠해진다** — 채움 구간을 가로로 훑어 어두운 세로 구분선을 센다(≥3줄).
//      ⚠️ 클래스나 computed style 로 보면 안 된다: `::after` 의 repeating-gradient 는 DOM 에 흔적이
//         없어 CSS 를 통째로 지워도 '통과'가 난다(`probe-hold-deck` 이 화소를 보는 것과 같은 이유).
//   ② **구분선 간격이 공용 격자(--seg)와 맞는다** — 게이지마다 제각각이면 voxel 격자가 아니다.
//      실측 피치를 첫 게이지의 피치와 대조해 ±1.5px 안인지 본다(전 게이지가 한 벌인지의 검사).
//   ③ **채움이 평탄하다(광택 없음)** — 면 열들의 세로 밝기 낙차(중앙값)를 잰다.
//      문턱 20 은 눈대중이 아니라 **음성 대조 실측**에서 나왔다: 광택(9차·12차 층)이 살아 있는
//      옛 CSS 에서 퀘스트 45.7 · 펫 소환 44.1 · 기술 44.1 이고, 걷어 낸 지금은 **다섯 개 전부 0** 이다.
//      🚨 **아래 문턱만 두면 안 된다**(이 저장소가 ⓐ-3 에서 배운 것): '평탄할수록 좋아지는' 지표라
//         면을 통째로 단색으로 만들면 무조건 통과한다 — 그래서 ① 이 같이 걸려 있다(단색이면
//         구분선도 사라져 ① 이 떨어진다). 두 축이 서로의 상한 노릇을 한다.
//
// 기하 불변(㉮) 축은 `probe-sheet-skin` 이 이미 스킨 on/off ±0.5px 로 상시 단언하므로 여기서는
// `::after` 를 죽였을 때 게이지 rect 가 그대로인지만 한 번 더 확인한다(이 층이 paint-only 인가).
//
// 사용: node tools/probe-gauge-segments.js
// ⚠️ 픽셀 계측은 **빈 페이지**에서 돈다 — 게임 페이지 안에서는 `new Function` 이 조용히 막혀
//    결과가 통째로 null 이 된다(aaa-skin 메모 ⓒ).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitUiReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 기술 노드 팝업(= `.upg-progress`)은 '연구 진행 중'일 때만 그려진다 — `shot-screens.js` 와 같은 시드.
const TECH_SRC = `(() => {
    const id = TechTree.nid('extraEgg', 4);
    S.tech = S.tech || {};
    const openUp = (n, d) => { if (d > 12) return; for (const p of TechTree.parentsOf(n)) { if (!(S.tech[p] >= 1)) S.tech[p] = 1; openUp(p, d + 1); } };
    openUp(id, 0); S.tech[id] = 1;
    S.techResearch = { id, endsAt: U.now() + 90 * 60e3 };
    UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('skillpet'); UI.openTechNode(id);
})()`;

// [이름, 화면을 여는 코드, 트랙 선택자, 채움 선택자]
// ⚠️ 게이지마다 **떠 있는 조건**이 다르다(진행 중일 때만 그려지는 것이 둘) — 오프너는 `shot-screens.js`
//    의 시드를 그대로 빌려 쓴다. 조건을 안 맞추면 '트랙을 못 찾았다'로 조용히 미검사가 된다.
const FLAT_MAX = 20;   // ③ 문턱 — 옛 광택 44~46 ↔ 지금 0 사이에 넉넉히 놓는다(음성 대조 실측)

const GAUGES = [
    ['퀘스트 진행바', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openQuests()`, '#quest-modal .qst-bar', '#quest-modal .qst-bar i'],
    ['펫 소환 게이지', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.switchTab('summon'); UI.switchSummonSub('pets')`, '#panel-pets .summon-gauge', '#panel-pets .summon-gauge i'],
    ['기술 연구 진행바', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); ` + TECH_SRC, '.upg-progress.tech-prog', '.upg-progress.tech-prog > div'],
    ['확률표 진행바', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openSummonRates('pet')`, '.rates-prog', '.rates-prog > div'],
    ['펫 경험치바', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); ` + PETS_STATE_SRC + `; S.pets[1].name='Treant'; UI.openPetUpgrade(1)`, '.petup-xpbar', '.petup-xpbar > div'],
];

// 빈 페이지에서 돌 픽셀 코드 — 잘라 온 게이지 그림 한 장을 받아 ①②③ 지표를 낸다.
const PIX = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const lum = (x, y) => { const k = (y * W + x) * 4; return .2126*d[k] + .7152*d[k+1] + .0722*d[k+2]; };
    // 세로 중앙 띠(테두리·라운드 모서리를 피해 가운데 60%만)에서 열별 평균 밝기 프로파일
    const y0 = Math.max(1, Math.round(H * 0.2)), y1 = Math.min(H - 1, Math.round(H * 0.8));
    const prof = [], mixed = [];
    for (let x = 0; x < W; x++) {
        let s = 0, n = 0, lo = 1e9, hi = -1e9;
        for (let y = y0; y < y1; y++) { const v = lum(x, y); s += v; n++; if (v < lo) lo = v; if (v > hi) hi = v; }
        prof.push(s / n);
        // 🚨 게이지 한가운데에는 **흰 수치 글자**가 얹혀 있다(예: 기술 진행바 '1시 30분').
        //    글자 열은 세로로 밝기가 크게 흔들린다 — 면(균일 밝음)·구분선(균일 어두움)과 그것으로
        //    갈라 낸다. 이걸 안 하면 전역 퍼센타일이 **글자 흰색**으로 잡혀 파란 면 전체가
        //    '어두운 열'로 오인되고 구분선이 통째로 뭉개진다(실측: 24줄이 8줄로 셌다).
        mixed.push((hi - lo) > 60);
    }
    const clearX = [];
    for (let x = 0; x < W; x++) if (!mixed[x]) clearX.push(x);
    // ① 구분선 = 채움 면보다 뚜렷하게 어두운 열.
    // ⚠️ **국소 최대(좌우 ±6열)를 기준으로 삼으면 안 된다** — 창이 피치와 비슷해 창 안이 통째로
    //    구분선일 때가 생겨 멀쩡한 줄을 놓친다(실측: 8.4px 피치를 10.0px 로 잘못 재고 줄을 흘렸다).
    //    글자 열을 걷어 낸 뒤 남는 열은 면 아니면 구분선이라 **전역 90 퍼센타일**을 면으로 쓴다.
    const sorted = clearX.map(x => prof[x]).sort((p, q) => p - q);
    const face = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0;
    const dips = clearX.filter(x => face - prof[x] > 18);
    // 붙어 있는 열은 한 줄로 합친다
    const lines = [];
    for (const x of dips) {
        if (lines.length && x - lines[lines.length - 1].e <= 2) { lines[lines.length - 1].e = x; continue; }
        lines.push({ s: x, e: x });
    }
    const mids = lines.map(l => (l.s + l.e) / 2);
    // 피치는 **글자에 가려지지 않은 이웃 쌍**에서만 잰다 — 사이에 글자 열이 끼면 그 간격은 두 칸이다
    const gaps = [];
    for (let i = 1; i < mids.length; i++) {
        let blocked = false;
        for (let x = Math.ceil(mids[i - 1]); x <= Math.floor(mids[i]); x++) if (mixed[x]) { blocked = true; break; }
        if (!blocked) gaps.push(mids[i] - mids[i - 1]);
    }
    gaps.sort((p, q) => p - q);
    const pitch = gaps.length ? gaps[gaps.length >> 1] : 0;
    // ③ 평탄도 — **면 열 전체**의 세로 밝기 낙차(상하 10% 트림)의 중앙값.
    // ⚠️ 처음엔 '구분선에서 가장 먼 열 하나'로 쟀는데, 그 한 열이 하필 글자 안티에일리어싱 옆이면
    //    광택이 없는 면에서도 낙차 42~59 가 나온다(실측 — 광택이 있던 옛 값 44 와 구별이 안 됐다).
    //    한 표본으로 면을 판정하지 말 것. 중앙값을 쓰면 글자 자락 몇 열은 표에 묻힌다.
    const isDip = new Uint8Array(W);
    for (const l of lines) for (let x = l.s; x <= l.e; x++) isDip[x] = 1;
    const ranges = [];
    for (const x of clearX) {
        if (x < 3 || x > W - 4 || isDip[x]) continue;
        const col = [];
        for (let y = y0; y < y1; y++) col.push(lum(x, y));
        col.sort((p, q) => p - q);
        ranges.push(col[Math.floor(col.length * 0.1)] === undefined ? 0
            : col[Math.ceil(col.length * 0.9) - 1] - col[Math.floor(col.length * 0.1)]);
    }
    ranges.sort((p, q) => p - q);
    const flat = ranges.length ? ranges[ranges.length >> 1] : 0;
    return { W, H, clear: clearX.length, faceCols: ranges.length, lines: lines.length, pitch, flat: +flat.toFixed(1) };
})`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const pix = await browser.newPage();
    await pix.goto('about:blank');
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitUiReady(page);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.coins = 1e12; S.gems = 1e6; S.tickets = 500; S.bestChapter = 5; S.bestStage = 9; S.forgeLevel = 20;
    });

    // 팝업 등장 트랜지션이 흐르는 중에 재면 같은 게이지가 런마다 다른 rect 로 잡힌다(실측: 스케일
    // 애니 도중 w 221 ↔ 316). 연출을 통째로 끄고, rect 가 두 번 연속 같을 때까지 기다린다.
    await page.addStyleTag({ content: `*, *::before, *::after { transition: none !important; animation: none !important; }` });

    async function measure(open, track, fill, killSeg) {
        await page.evaluate(([o, t, f, kill]) => {
            let el = document.getElementById('kill-seg');
            if (kill) {
                if (!el) { el = document.createElement('style'); el.id = 'kill-seg'; document.head.appendChild(el); }
                el.textContent = `.upg-progress::after,.summon-gauge::after,.qst-bar::after,.summon-prog::after,.petup-xpbar::after,.rates-prog::after{content:none !important}`;
            } else if (el) el.remove();
            // eslint-disable-next-line no-eval
            eval(o);
            // 🚨 게이지가 뷰포트 밖이면 `page.screenshot({clip})` 이 그대로 던진다(실측: 펫 소환
            //    게이지 y=1376). 패널이 길어 스크롤 아래에 있는 게이지가 있으므로 반드시 끌어온다.
            const te = document.querySelector(t);
            if (te) te.scrollIntoView({ block: 'center', inline: 'center' });
        }, [open, track, fill, killSeg]);
        const rectOf = () => page.evaluate(t => {
            const e = document.querySelector(t);
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
        }, track);
        let rect = await rectOf();
        for (let i = 0; i < 20; i++) {                     // rect 가 두 번 연속 같을 때까지
            await page.waitForTimeout(120);
            const r2 = await rectOf();
            if (rect && r2 && rect.x === r2.x && rect.y === r2.y && rect.w === r2.w && rect.h === r2.h) { rect = r2; break; }
            rect = r2;
        }
        if (rect && (rect.y < 0 || rect.y + rect.h > 892)) return { rect, pix: null, offscreen: true };
        if (!rect || rect.w < 8) return { rect, pix: null };
        // 🚨 채움 폭 못 박기는 **rect 안정화 뒤에, 찍기 직전에** 해야 한다. 어떤 게이지는 화면이
        //    1초마다 스스로 다시 그려져(기술 연구 진행바 = 남은 시간 표시) 앞에서 심어 둔 인라인
        //    width 가 통째로 날아간다 — 그러면 실제 진행도(≈0%)의 **빈 트랙**을 찍고도 그림은
        //    멀쩡해 보여 '구분선 0줄'이라는 **유령 불통과**가 난다(실측으로 이 함정을 밟았다).
        //    그래서 심고 → 찍고 → **정말 82% 였는지 되재서** 아니면 다시 한다.
        const clip = { x: rect.x + 3, y: rect.y + 2, width: Math.max(8, rect.w * 0.82 - 6), height: Math.max(4, rect.h - 4) };
        for (let tries = 0; tries < 4; tries++) {
            await page.evaluate(f => { const fe = document.querySelector(f); if (fe) { fe.style.width = '82%'; fe.style.right = 'auto'; } }, fill);
            const buf = await page.screenshot({ clip });
            const held = await page.evaluate(([t, f]) => {
                const te = document.querySelector(t), fe = document.querySelector(f);
                if (!te || !fe) return 0;
                return fe.getBoundingClientRect().width / te.getBoundingClientRect().width;
            }, [track, fill]);
            if (held > 0.72) {
                const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
                const r = await pix.evaluate(({ src, a }) => (new Function('return ' + src))()(a), { src: PIX, a: { dataUrl } });
                return { rect, pix: r };
            }
        }
        return { rect, pix: null, unstableFill: true };
    }

    // 기대 피치는 게이지끼리 견주는 게 아니라 **토큰 `--seg` 실측값**에 못 박는다 — 그래야 '전부
    // 똑같이 틀린' 경우(예: 격자를 통째로 두 배로 키움)도 잡힌다.
    const segPx = await page.evaluate(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:var(--seg);visibility:hidden';
        document.body.appendChild(d);
        const w = d.getBoundingClientRect().width; d.remove(); return w;
    });
    console.log(`공용 격자 --seg = ${segPx.toFixed(2)}px`);
    // 토큰이 없으면 `width: var(--seg)` 가 무효라 0 이 나온다 — 기대 줄 수가 Infinity 로 새므로 여기서 끊는다
    if (!(segPx > 1)) { console.log('\n❌ FAIL\n - 토큰 --seg 를 못 읽었다(0px) — 분절 격자가 정의돼 있지 않다'); await browser.close(); process.exit(1); }

    for (const [name, open, track, fill] of GAUGES) {
        const on = await measure(open, track, fill, false);
        if (!on.rect) { fails.push(`${name}: 트랙(${track})을 찾지 못했다 — 오프너가 그 화면을 못 연다(미검사로 새는 자리)`); continue; }
        if (on.offscreen) { fails.push(`${name}: 게이지가 뷰포트 밖이다 ${JSON.stringify(on.rect)}`); continue; }
        if (on.unstableFill) { fails.push(`${name}: 채움 폭을 못 박지 못했다(화면이 스스로 다시 그린다) — 측정 불가`); continue; }
        const off = await measure(open, track, fill, true);
        const same = off.rect && Math.abs(on.rect.x - off.rect.x) <= 0.5 && Math.abs(on.rect.y - off.rect.y) <= 0.5
            && Math.abs(on.rect.w - off.rect.w) <= 0.5 && Math.abs(on.rect.h - off.rect.h) <= 0.5;
        ok(same, `${name}: 분절 층이 기하를 움직였다(paint-only 위반) on=${JSON.stringify(on.rect)} off=${JSON.stringify(off.rect)}`);
        // 기대 줄 수는 **글자에 안 가린 폭**으로만 잡는다(가운데 수치 글자가 몇 칸을 덮는다).
        // 양 끝 한 줄은 라운드 모서리에 먹힐 수 있어 빼 준다.
        const clearW = on.pix ? on.pix.clear : 0;
        const want = Math.max(2, Math.floor(clearW / segPx) - 1);
        ok(on.pix && on.pix.lines >= want,
            `① ${name}: 글자 없는 채움 ${clearW}px 구간에 세로 구분선이 ${on.pix ? on.pix.lines : 0}줄뿐이다(≥${want} 필요) — 분절이 안 칠해졌다`);
        if (on.pix && on.pix.lines >= 3) {
            ok(Math.abs(on.pix.pitch - segPx) <= 1.5,
                `② ${name}: 구분선 피치 ${on.pix.pitch.toFixed(1)}px 가 토큰 --seg ${segPx.toFixed(1)}px 와 어긋난다(±1.5px)`);
        }
        ok(on.pix && on.pix.flat <= FLAT_MAX,
            `③ ${name}: 채움 세로 밝기 낙차 ${on.pix ? on.pix.flat : '?'} (≤${FLAT_MAX} 필요) — 광택 그라디언트가 남아 있다`);
        console.log(`${name}: 채움폭 ${on.pix ? on.pix.W : 0}px(글자밖 ${clearW}px) · 구분선 ${on.pix ? on.pix.lines : 0}줄(≥${want}) · 피치 ${on.pix ? on.pix.pitch.toFixed(1) : 0}px · 채움 낙차 ${on.pix ? on.pix.flat : '?'} · 기하불변 ${same}`);
    }

    await browser.close();
    if (errs.length) fails.push(`콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    if (fails.length) { console.log('\n❌ FAIL'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\n✅ PASS — 게이지 5종이 공용 격자로 분절되고 채움이 평탄하다');
})();
