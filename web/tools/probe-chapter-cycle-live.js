// chapter-cycle-difficulty 라이브 판정 — 로직은 tools/test-chapter-cycle.js(vm)가 다 보고,
// 여기서는 **브라우저에서만 드러나는 것**만 본다:
//   ① 상단 스테이지 라벨이 티어 접두를 달고 실제로 찍히는가
//   ② 25-10 클리어가 배경(맵)을 1챕터 테마로 되감고 그 전환에서 3D가 안 터지는가
//   ③ 난이도 상승 토스트가 실제 DOM 으로 뜨는가
//   ④ 디버그 패널의 난이도 셀렉트가 실제 상태를 옮기는가(스텝 버튼의 사이클 경계 포함)
//   ⑤ 저장→재로드 왕복에서 티어가 살아남는가
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것 (probe-death-fade 와 같은 규약).
//
// 사용: node probe-chapter-cycle-live.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
    //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
    //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
    //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
    await waitBootDone(page);
    // 부팅 대기는 Node 측 폴링으로 — 이 컨테이너에서 waitForFunction 이 20초로 죽는다(2026-08-19 실측 기록)
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Combat !== 'undefined' && typeof S !== 'undefined' && !!S && !!UI.els.stageLabel)) break;
        await page.waitForTimeout(200);
    }

    const label = () => page.evaluate(() => UI.els.stageLabel.textContent.trim());

    // ① 기본 순환 라벨
    await page.evaluate(() => { S.difficulty = 0; S.chapter = 4; S.stage = 1; UI.updateStageLabel(); });
    const base = await label();

    // ②③ 25-10 클리어 → 어려움 1-1 (실제 stageClear 경로 · 배경 테마 되감기 포함)
    const cleared = await page.evaluate(() => {
        S.difficulty = 0; S.chapter = 25; S.stage = 10;
        S.bestDifficulty = 0; S.bestChapter = 25; S.bestStage = 10;
        Combat.stageClear();
        Combat.setupStage();               // 전진 뒤 실제 스테이지 셋업(= setChapterTheme(1) 경로)
        UI.updateStageLabel();
        return {
            at: `${S.difficulty}:${S.chapter}-${S.stage}`,
            label: UI.els.stageLabel.textContent.trim(),
            toasts: [...document.querySelectorAll('.toast, #toast-layer > *, .toast-combat')].map(t => t.textContent).join(' | '),
            // 하늘색은 scene.background 가 아니라 렌더러 클리어컬러·반구광에 실린다(Scene3D.setTheme)
            themeSky: Scene3D.hemi ? Scene3D.hemi.color.getHexString() : null,
            enemies: Combat.enemies.length,
        };
    });
    // 1챕터(초원) 하늘색으로 되감겼는지 — CHAPTER_THEMES[0].sky
    const wantSky = await page.evaluate(() => CHAPTER_THEMES[0].sky.toString(16).padStart(6, '0'));

    // ④ 디버그 패널: 난이도 셀렉트로 이동 + 스텝 버튼이 사이클 경계를 넘는다
    const dbg = await page.evaluate(() => {
        UI.switchTab('debug');   // renderDebug 는 activeTab 가드가 있어 탭을 실제로 열어야 그려진다
        const out = {};
        const sel = document.getElementById('dbg-difficulty');
        out.selectExists = !!sel;
        out.options = sel ? [...sel.options].map(o => o.textContent).join('/') : '';
        if (sel) {
            sel.value = '3';
            document.getElementById('dbg-chapter').value = '25';
            document.getElementById('dbg-stage').value = '10';
            UI.onDebugGoStage();
        }
        out.afterGo = `${S.difficulty}:${S.chapter}-${S.stage}`;
        out.goLabel = UI.els.stageLabel.textContent.trim();
        UI.onDebugStageStep(-1);           // 헬 25-10 → 헬 25-9
        out.stepBack = `${S.difficulty}:${S.chapter}-${S.stage}`;
        S.difficulty = 1; S.chapter = 1; S.stage = 1;
        UI.onDebugStageStep(-1);           // 어려움 1-1 → 기본 25-10 (사이클 경계 역주행)
        out.crossBack = `${S.difficulty}:${S.chapter}-${S.stage}`;
        UI.onDebugStageStep(1);            // 다시 어려움 1-1
        out.crossFwd = `${S.difficulty}:${S.chapter}-${S.stage}`;
        return out;
    });

    // ⑤ 저장 왕복 — 티어가 세이브에 실려 살아남는가
    const roundTrip = await page.evaluate(() => {
        S.difficulty = 2; S.chapter = 7; S.stage = 3; saveGame();
        const raw = JSON.parse(localStorage.getItem('forgeclone_save_v1'));
        loadGame();
        return { saved: raw.difficulty, loaded: `${S.difficulty}:${S.chapter}-${S.stage}`, label: (UI.updateStageLabel(), UI.els.stageLabel.textContent.trim()) };
    });

    const ok = (n, c, d) => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === undefined ? '' : ` — ${d}`}`);
    console.log('chapter-cycle-difficulty 라이브 판정');
    ok('① 기본 순환 라벨(원본 표기 유지)', base === '어려움 4-1', base);
    ok('② 25-10 클리어 → 어려움 1-1', cleared.at === '1:1-1', cleared.at);
    ok('② 상단 라벨에 티어 접두', cleared.label === '어려움 1-1', cleared.label);
    ok('② 배경이 1챕터 맵으로 되감김', cleared.themeSky === wantSky, `${cleared.themeSky} (기대 ${wantSky})`);
    ok('② 새 스테이지가 실제로 섰다(적 생성)', cleared.enemies > 0, `${cleared.enemies}마리`);
    ok('③ 난이도 상승 토스트', /난이도 상승/.test(cleared.toasts), cleared.toasts.slice(0, 120));
    ok('④ 디버그 난이도 셀렉트 존재', dbg.selectExists, dbg.options);
    ok('④ 헬 25-10 이동', dbg.afterGo === '3:25-10' && dbg.goLabel === '헬 25-10', `${dbg.afterGo} / ${dbg.goLabel}`);
    ok('④ 스텝 뒤로', dbg.stepBack === '3:25-9', dbg.stepBack);
    ok('④ 사이클 경계 역주행(어려움 1-1 → 기본 25-10)', dbg.crossBack === '0:25-10', dbg.crossBack);
    ok('④ 사이클 경계 전진(기본 25-10 → 어려움 1-1)', dbg.crossFwd === '1:1-1', dbg.crossFwd);
    ok('⑤ 세이브에 티어 기록', roundTrip.saved === 2, roundTrip.saved);
    ok('⑤ 재로드 후 좌표·라벨 유지', roundTrip.loaded === '2:7-3' && roundTrip.label === '매우 어려움 7-3', `${roundTrip.loaded} / ${roundTrip.label}`);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
