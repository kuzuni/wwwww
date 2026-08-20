// probe-label-keyline-census.js — 클론의 **보이는 글자 요소 전수**를 훑어
// '검정 키라인이 있나 없나'를 선택자별로 적는다(화풍 ⓕ-㉴ 의 작업 목록).
//
// 왜 원본을 안 재고 클론만 재나 — ⓛ 이 여기서 막혔다. 라벨은 높이가 15~20px 뿐인데
//   원본과 클론 레이아웃이 요소마다 ±2%p(≈18px)까지 다르다. 그래서 **임의 요소의 띠를
//   원본에 옮기면 다른 것을 잰다**(실측: `무료/프리미엄` 띠에서 클론 '흰 속살 174px' =
//   아래 흰 트랙을 통째로 먹었다). 원본이 이 활자를 **전 화면에 걸쳐** 쓴다는 건 이미
//   두 근거로 확정돼 있다 — `probe-ring-sweep` 의 30화면 전부 음수(Δ 중앙값 -0.120), 그리고
//   `pass` 원본 크롭(제목·안내문·배지·탭 라벨·알약이 모두 흰+검정링). 남은 물음은
//   **"클론에서 어디가 아직 안 됐나"** 뿐이고, 그건 클론 DOM 만으로 정확히 답할 수 있다.
//
// 무엇을 세는가 — 자기 글자를 가진 요소마다 `-webkit-text-stroke-width` 와 `text-shadow` 를 읽어
//   ⑴ 키라인 있음(스트로크 >0 또는 그림자에 blur 0 링) ⑵ 없음 으로 가른다.
//   선택자(태그.클래스)별로 묶어 **없음이 많은 순**으로 인쇄한다 = 그대로 작업 목록이다.
//
// ⚠️ 함정 대비:
//   ⓐ **컨테이너를 글자 요소로 세지 말 것** — 자식 텍스트 노드가 있는 것만 센다(자손 글자는 그
//      자손이 따로 잡힌다). 안 그러면 카드 하나가 안쪽 글자 수만큼 중복으로 잡힌다.
//   ⓑ **안 보이는 것/뒤에 깔린 면은 빼야 한다** — 지금 맨 위에 떠 있는 면 안만 본다
//      (probe-header-ring 1차 판이 뒤 시트 제목을 18화면에 찍은 그 함정).
//   ⓒ 이모지·기호만 있는 요소는 활자가 아니다 — 한글/영숫자 1자 이상만.
//
// 🏁 **판정은 `ring-rule.js` 가 한다 — 이 파일은 화면을 돌며 모으고 인쇄만 한다.**
//   ㉮ 규칙("글자 칠이 밝으면 검정 링, 검정이면 민무늬")은 그 뒤 세 세션이 원본을 확대해
//   술어 네 개를 덧붙였다(같은 색 스트로크 · 최대 채널 · 검정 판 · 원본 민무늬 면).
//   근거와 반례는 전부 `ring-rule.js` 머리말에 있다.
//   🚨 **2026-08-20 이전 이 파일은 규칙을 따로 베껴 두고 있었고, 네 술어가 다 빠져 있었다.**
//      그래서 `probe-screen-ring-todo` 와 답이 갈렸는데 — 하필 **작업 순서를 정하는 ⓛ 순위를
//      뽑는 건 이쪽**이라, 순위 2·4위(`#tabbar` 31 · `#chat-preview` 18)가 통째로 '작업이 아닌
//      면'이었고 `.chat-bubble`·`.chat-time` 22개가 가짜 '뺄 것'으로 올라와 있었다.
//      술어를 여기에 다시 적지 말 것 — 갈라지는 순간 순위가 거짓말을 한다.
//   ⚠️ `-webkit-text-stroke` 는 상속되므로 조상에 한 번 걸어야 하는데, 그러면 **검정 칠 자손까지
//      따라간다**. 그래서 '빼야 할 것' 집계가 넣는 것만큼 중요하다.
//
// 사용: node tools/probe-label-keyline-census.js         (선택자별 집계)
//       node tools/probe-label-keyline-census.js screens (화면별로도 인쇄)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
// 🚨 규칙은 `ring-rule.js` 한 곳에만 있다 — 여기에 술어를 다시 적지 말 것.
//    예전에 이 파일이 규칙을 따로 베껴 두는 바람에 `probe-screen-ring-todo` 와 소리 없이
//    갈라졌고(술어 4개 누락), **작업 순서를 정하는 ⓛ 순위를 낡은 자로 뽑고 있었다.**
const RR = require('./ring-rule.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const BY_SCREEN = process.argv.includes('screens');

function loadScreens() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const i = src.indexOf('const SCREENS = [');
    const j = src.indexOf('\n];', i);
    return new Function('PETS_STATE_SRC', 'return ' + src.slice(i + 'const SCREENS = '.length, j + 2))(PETS_STATE_SRC);
}


(async () => {
    const SCREENS = loadScreens();
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const READY = 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene';
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'S && S.forgeLevel === 29 && ' + READY, { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { };
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        try { UI.clearPendingCraft(); UI.renderEquipSheet(); } catch (e) { }
        UI.coinBurst = () => { };
        UI.bossWarning = () => { };
    });

    const tally = new Map();
    for (const [name, , src] of SCREENS) {
        try {
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                try { UI.switchTab && UI.switchTab(null); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
            });
            await page.waitForTimeout(100);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(600);
            await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
            await page.waitForTimeout(120);
            const els = await page.evaluate(new Function(RR.SWEEP_SRC));
            const miss = els.filter(e => !e.has).length;
            if (BY_SCREEN) {
                const c = RR.classify(els);
                console.log(`${name.padEnd(17)} 글자요소 ${String(els.length).padStart(3)}개 · 키라인 없음 ${String(miss).padStart(3)}개`
                    + ` (${(miss / (els.length || 1) * 100).toFixed(0)}%) · 넣을 것 ${String(c.need.length).padStart(2)}`
                    + ` · 뺄 것 ${String(c.over.length).padStart(2)}`
                    + ` · 무의미 ${String(c.moot.length).padStart(2)} · 민무늬 면 ${String(c.free.length).padStart(2)}`);
            }
            for (const e of els) {
                if (!tally.has(e.key)) tally.set(e.key, { has: 0, no: 0, fs: e.fs, ex: e.t, screens: new Set(),
                                                          need: 0, over: 0, ok: 0, moot: 0, free: 0, hosts: new Map() });
                const t = tally.get(e.key);
                t[e.has ? 'has' : 'no']++;
                t.screens.add(name);
                // 술어는 전부 ring-rule 이 판다 — 여기서 다시 세지 말 것(그 중복이 자를 갈라 놨다).
                if (RR.isNeed(e)) { t.need++; t.hosts.set(e.host, (t.hosts.get(e.host) || 0) + 1); }
                else if (RR.isOver(e)) t.over++;
                else if (RR.isMoot(e)) t.moot++;
                else if (RR.isFree(e)) t.free++;
                else t.ok++;
                if (e.fs > t.fs) { t.fs = e.fs; t.ex = e.t; }
            }
        } catch (e) { console.log(`${name.padEnd(17)} SKIP ${e.message.slice(0, 50)}`); }
    }
    await browser.close();

    const rows = [...tally.entries()].filter(([, v]) => v.no > 0).sort((a, b) => b[1].no - a[1].no);
    const totalNo = [...tally.values()].reduce((s, v) => s + v.no, 0);
    const totalHas = [...tally.values()].reduce((s, v) => s + v.has, 0);
    console.log(`\n===== 키라인 **없는** 글자 요소 — 선택자별(많은 순) =====`);
    console.log(`  (전체 글자 요소 ${totalNo + totalHas}개 중 키라인 없음 ${totalNo}개 = ${(totalNo / (totalNo + totalHas) * 100).toFixed(0)}%)`);
    for (const [k, v] of rows.slice(0, 30)) {
        console.log(`  ${String(v.no).padStart(4)}개  ${k.padEnd(40)} 최대 ${String(v.fs + 'px').padEnd(7)} ${String(v.screens.size + '화면').padEnd(6)} "${v.ex}"${v.has ? `  (같은 선택자 중 ${v.has}개는 이미 있음)` : ''}`);
    }

    // ── ㉮ 규칙으로 가른 작업 목록 ────────────────────────────────────────
    const all = [...tally.values()];
    const need = all.reduce((s, v) => s + v.need, 0);
    const over = all.reduce((s, v) => s + v.over, 0);
    const okn  = all.reduce((s, v) => s + v.ok, 0);
    const moot = all.reduce((s, v) => s + v.moot, 0);
    const free = all.reduce((s, v) => s + v.free, 0);
    console.log(`\n===== ㉮ 규칙(ring-rule.js 술어 ①~④)으로 가른 결과 =====`);
    console.log(`  전체 ${need + over + okn + moot + free}개 = 이미 규칙대로 ${okn}개 · **넣어야 할 것 ${need}개** · **빼야 할 것 ${over}개**`);
    console.log(`  ＋ 작업이 아닌 것: 링 무의미(검정 판 위) ${moot}개 · 원본이 민무늬인 면 ${free}개`);
    console.log(`  ⚠️ 종전 '키라인 없음 ${totalNo}개'가 곧 작업량이 아니다 — 그중 검정 칠은 원본도 민무늬라 손댈 게 없다.`);

    const needRows = [...tally.entries()].filter(([, v]) => v.need > 0).sort((a, b) => b[1].need - a[1].need);
    console.log(`\n  ── 넣어야 할 것(밝은 칠인데 링 없음) — 선택자별 ──`);
    for (const [k, v] of needRows.slice(0, 25)) {
        const hosts = [...v.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `${h || '(없음)'}×${n}`).join(' ');
        console.log(`  ${String(v.need).padStart(4)}개  ${k.padEnd(38)} ${String(v.fs + 'px').padEnd(7)} "${v.ex}"  아래: ${hosts}`);
    }

    const overRows = [...tally.entries()].filter(([, v]) => v.over > 0).sort((a, b) => b[1].over - a[1].over);
    console.log(`\n  ── 빼야 할 것(검정 칠인데 링 있음) — 상속으로 걸 때 반드시 꺼야 하는 자리 ──`);
    if (!overRows.length) console.log('  (없음)');
    for (const [k, v] of overRows.slice(0, 15)) {
        console.log(`  ${String(v.over).padStart(4)}개  ${k.padEnd(38)} ${String(v.fs + 'px').padEnd(7)} "${v.ex}"`);
    }

    // 상속 조상 후보 — '넣어야 할 것'이 어느 면 아래 몰려 있나
    const hostAgg = new Map();
    for (const v of all) for (const [h, n] of v.hosts) hostAgg.set(h, (hostAgg.get(h) || 0) + n);
    console.log(`\n  ── 상속으로 걸 조상 후보(넣어야 할 것이 몰린 면, 많은 순) ──`);
    for (const [h, n] of [...hostAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${String(n).padStart(4)}개  ${h || '(면 못 찾음)'}`);
    }
})();
