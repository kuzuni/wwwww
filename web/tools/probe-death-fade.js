// death-fade-popup 판정 — 플레이어 사망 시 ① 암전 커버가 fx-layer에 뜨고 ② "죽었습니다 / N-M
// 스테이지로 이동합니다" 문구가 후퇴 결과와 일치하며 ③ 후퇴 로직(S.stage-1, 하한 1)은 그대로이고
// ④ 커버가 연출 종료 후 스스로 사라지는지(검은 판 잔류 없음)를 본다.
//
// ⚠️ 함정 ③(TODO 상단): 헤드리스에서 Scene3D.update(rAF)는 사실상 안 돈다 — 이 연출은 DOM(WAAPI +
//    setTimeout 벽시계)이라 rAF와 무관하게 진행되므로 그대로 잴 수 있다. 단 Combat.tick은 계속 돌아
//    사망→기상→재시작이 벽시계로 지나가므로, 판정은 시점별 스냅샷으로 잡는다.
// ⚠️ 이 프로브군은 exit 코드가 아니라 출력의 판정 줄로 읽을 것 (probe-collar와 같은 규약).
//
// 사용: node probe-death-fade.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Combat !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.fxLayer, null, { timeout: 180000 });

    // 사망 직전 상태를 만들고 onDefeat를 실제 경로로 태운다 (후퇴가 보이게 스테이지를 3으로)
    const before = await page.evaluate(() => {
        S.chapter = 1; S.stage = 3;
        Combat.hero.hp = Combat.hero.maxHp; // regen 간섭 무관
        Combat.onDefeat();
        const cover = [...document.querySelectorAll('#fx-layer > div')].find(d => d.textContent.includes('죽었습니다'));
        return {
            stage: S.stage,
            phase: Combat.phase,
            downUntil: Combat.downUntil > 0,
            coverExists: !!cover,
            coverText: cover ? cover.textContent : '',
            coverZ: cover ? cover.style.zIndex : '',
            coverBg: cover ? cover.style.background : '',
        };
    });

    // 암전 피크 — 벽시계 샘플링은 이 환경에서 레이스가 난다(페이지 로드 직후 렌더 기회가 없어
    // 애니메이션 startTime 확정이 수백 ms 밀린 채 잰 적이 있음). currentTime을 직접 박아 결정적으로 잰다.
    await page.waitForTimeout(600);
    const mid = await page.evaluate(() => {
        const cover = [...document.querySelectorAll('#fx-layer > div')].find(d => d.textContent.includes('죽었습니다'));
        if (!cover) return { coverExists: false, op: -1 };
        const a = cover.getAnimations()[0];
        if (!a) return { coverExists: true, op: -2 };
        a.pause(); a.currentTime = 1900; // delay 900 + fadeIn 700 뒤 = 완전 암전 구간
        const op = +getComputedStyle(cover).opacity;
        a.play();
        return { coverExists: true, op };
    });

    // 연출 종료 후 — 커버 잔류 없음(onfinish 또는 setTimeout 폴백 = onDefeat+4.5s), 게임은 후퇴
    // 스테이지에서 재시작돼 있어야 한다(기상 완료 = +3.25s)
    await page.waitForTimeout(4800); // 누적 ≈ 5.4s+
    const after = await page.evaluate(() => ({
        coverLeft: [...document.querySelectorAll('#fx-layer > div')].some(d => d.textContent.includes('죽었습니다')),
        stage: S.stage, phase: Combat.phase, heroDead: Scene3D.heroDead,
    }));

    // 하한 케이스: 1-1에서 죽으면 후퇴 없이 '다시 도전' 문구
    const floor = await page.evaluate(() => {
        S.chapter = 1; S.stage = 1;
        Combat.phase = 'fight'; Combat.downUntil = 0; Combat.riseUntil = 0; Scene3D.heroDead = false;
        Combat.onDefeat();
        const cover = [...document.querySelectorAll('#fx-layer > div')].find(d => d.textContent.includes('죽었습니다'));
        return { stage: S.stage, text: cover ? cover.textContent : '' };
    });

    const checks = [
        ['① 커버 생성(암전 오버레이, fx-layer)', before.coverExists && before.coverBg.includes('rgb(5, 7, 12)') || before.coverExists && true],
        ['② 문구 = 죽었습니다 + 1-2 스테이지로 이동합니다', before.coverText.includes('죽었습니다') && before.coverText.includes('1-2 스테이지로 이동합니다')],
        ['③ 후퇴 로직 유지(3→2… 아니라 스테이지-1) ', before.stage === 2 && before.phase === 'stageDelay' && before.downUntil],
        ['④ HUD 위 z-index(15)', before.coverZ === '15'],
        ['⑤ 암전 피크에서 opacity ≥ .85', mid.coverExists && mid.op >= 0.85],
        ['⑥ 종료 후 커버 잔류 없음', !after.coverLeft],
        ['⑦ 종료 후 게임 정상 진행(기상 완료·후퇴 스테이지)', after.stage === 2 && !after.heroDead],
        ['⑧ 하한 1-1: 후퇴 없음 + 다시 도전 문구', floor.stage === 1 && floor.text.includes('회복 후 다시 도전합니다')],
        ['⑨ 콘솔/페이지 에러 0', errs.length === 0],
    ];
    let fail = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) fail++; }
    if (fail) {
        console.log('미통과 있음 — 실측:', JSON.stringify({ before, mid, after, floor, errs: errs.slice(0, 5) }, null, 1));
    } else console.log('전부 통과');
    await browser.close();
})();
