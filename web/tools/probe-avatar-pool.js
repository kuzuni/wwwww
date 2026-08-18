// 아바타 풀 단일화 검증 — 리그·채팅·프로필 세 화면이 **같은 한 벌**을 쓰는지 본다.
//
// 왜 필요한가: 아바타 목록이 league.js(20종)·chat.js(12종)·ui.js(12종) 로 흩어져 있던 시절,
// `Chat.shareLeagueResult()` 가 리그 봇의 얼굴을 채팅 공유 카드에 그대로 실어 보내서
// **채팅 화면 한 곳에 두 풀의 얼굴이 함께 떴다.** 목록이 다시 갈라지면 같은 일이 재발하는데,
// 화면을 눈으로 봐서는 안 잡힌다(둘 다 그럴듯한 이모지라 섞여도 티가 안 난다).
// 그래서 ⑴ 세 참조가 같은 배열 객체인지 ⑵ 실제로 **생성된** 봇 얼굴이 전부 그 안에 드는지
// (하드코딩 잔재를 잡는다) ⑶ 프로필 피커가 24칸을 다 그리는지를 코드로 못 박는다.
//
// 도트 초상 교체(2026-08-18 완료)까지 끝난 지금은 **24종이 전부 그려져 있는지**와
// **아바타 자리에 이모지 글자가 한 톨도 안 남았는지**도 같이 게이트로 건다.
// (초상이 하나라도 비면 `IconGen.avatar()` 가 이모지로 되돌아가므로 화면에서는 그 칸만
//  조용히 이모지로 뜬다 — 눈으로는 24칸을 다 세어 보지 않는 한 안 잡힌다.)
//
// 사용: node probe-avatar-pool.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const EXPECT_N = 24;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    // ⚠️ `const AVATAR_POOL = …` 은 클래식 스크립트의 **렉시컬** 전역이라 `window.AVATAR_POOL` 로는
    //    안 보인다(`IconGen` 도 같다). 맨 이름으로 봐야 한다 — window 로 기다리면 영원히 안 뜬다.
    await page.waitForFunction(
        () => typeof UI !== 'undefined' && typeof League !== 'undefined'
            && typeof Chat !== 'undefined' && typeof AVATAR_POOL !== 'undefined' && UI.els,
        null, { timeout: 150000 });

    const r = await page.evaluate(() => {
        const pool = AVATAR_POOL;
        const inPool = new Set(pool);

        // ⑵ 얼굴을 실제로 만들어 본다. 상수만 비교하면 `avatar: '🐯'` 같은 하드코딩 잔재를 놓친다.
        //    리그는 봇 생성을, 채팅은 이름 해시 매핑을 각각 여러 번 돌려 표본을 넓힌다.
        const strayLeague = [];
        for (let i = 0; i < 40; i++) {
            for (const b of League.genBots(1e6)) if (!inPool.has(b.avatar)) strayLeague.push(b.avatar);
        }
        const strayChat = [];
        for (let i = 0; i < 800; i++) {
            const a = Chat.persona('bot' + i).avatar;
            if (!inPool.has(a)) strayChat.push(a);
        }

        // ⑶ 프로필 피커를 실제로 펼쳐 버튼을 센다.
        UI.openProfile();
        UI.onToggleAvatarPick();
        // 피커 버튼은 이제 글자가 아니라 초상이라 키를 data-av 로 읽는다(글자가 남아 있으면 그건 회귀다).
        const btnEls = [...document.querySelectorAll('.avatar-pick-btn')];
        const btns = btnEls.map(b => b.dataset.av || '');
        const btnText = btnEls.map(b => b.textContent.trim()).filter(Boolean);
        const btnIco = btnEls.filter(b => b.querySelector('.ico.av-ico')).length;
        UI.closeProfile();

        // 24종 전부 실제로 그려지는지 — 등록 여부만 보지 않고 `url()` 을 굽혀 **빈 문자열이 아닌지**까지 본다.
        const drawn = pool.filter(e => IconGen.draw && IconGen.draw['avatar_' + [...e].map(c => c.codePointAt(0).toString(16)).join('_')]);
        const baked = pool.filter(e => (IconGen.url(IconGen.avatarKey(e)) || '').startsWith('data:image/png'));
        // 이모지로 되돌아간 칸이 있는지 — avatar() 가 <i> 를 못 내면 이모지 문자열을 그대로 돌려준다.
        const fellBack = pool.filter(e => !IconGen.avatar(e).startsWith('<i'));

        return {
            n: pool.length,
            uniq: new Set(pool).size,
            // 같은 배열 객체를 보는지 — 복사본이면 나중에 한쪽만 고쳐도 안 걸린다.
            sameLeague: League.AVATAR_POOL === pool,
            sameChat: Chat.AVATAR_POOL === pool,
            sameUI: UI.AVATAR_POOL === pool,
            defaultInPool: inPool.has(DEFAULT_AVATAR),
            stateDefault: (typeof newGame === 'function' ? null : undefined), // 참고용, 미사용
            strayLeague: [...new Set(strayLeague)],
            strayChat: [...new Set(strayChat)],
            btnCount: btns.length,
            btnStray: btns.filter(t => t && !inPool.has(t)),
            btnText, btnIco,
            drawn: drawn.length, baked: baked.length, fellBack,
            pool,
        };
    });

    console.log(`공용 AVATAR_POOL: ${r.n}종 (고유 ${r.uniq})`);
    console.log(`  같은 배열 참조 — League:${r.sameLeague} Chat:${r.sameChat} UI:${r.sameUI}`);
    console.log(`  기본 아바타가 풀 안에 있는가: ${r.defaultInPool}`);
    console.log(`  생성 표본 이탈 — 리그 봇: ${r.strayLeague.length ? r.strayLeague.join(' ') : '없음'} · 채팅 봇: ${r.strayChat.length ? r.strayChat.join(' ') : '없음'}`);
    console.log(`  프로필 피커 버튼: ${r.btnCount}칸 (풀 밖 항목 ${r.btnStray.length}개)`);
    console.log(`  도트 초상: 등록 ${r.drawn}/${r.n}종 · 실제 굽기 성공 ${r.baked}/${r.n}종 · 이모지로 되돌아간 칸 ${r.fellBack.length}개`);
    console.log(`  피커 초상 노드: ${r.btnIco}/${r.btnCount}칸 · 남은 이모지 글자 ${r.btnText.length}개`);

    const bad = [];
    if (r.n !== 24 || r.uniq !== 24) bad.push(`풀이 24종 고유가 아니다(${r.n}/${r.uniq})`);
    if (!r.sameLeague || !r.sameChat || !r.sameUI) bad.push('세 파일이 같은 배열을 안 본다(풀이 다시 갈라졌다)');
    if (!r.defaultInPool) bad.push('DEFAULT_AVATAR 가 풀 밖이다');
    if (r.strayLeague.length) bad.push('리그 봇 얼굴에 풀 밖 값: ' + r.strayLeague.join(' '));
    if (r.strayChat.length) bad.push('채팅 봇 얼굴에 풀 밖 값: ' + r.strayChat.join(' '));
    if (r.btnCount !== r.n) bad.push(`피커가 ${r.btnCount}칸 — 풀 ${r.n}종과 다르다`);
    if (r.btnStray.length) bad.push('피커에 풀 밖 항목: ' + r.btnStray.join(' '));
    if (r.drawn !== r.n) bad.push(`도트 초상이 ${r.drawn}/${r.n}종만 등록됐다`);
    if (r.baked !== r.n) bad.push(`도트 초상 ${r.n - r.baked}종이 실제로 안 구워진다(draw 가 예외를 던졌을 수 있다)`);
    if (r.fellBack.length) bad.push('이모지로 되돌아간 칸: ' + r.fellBack.join(' '));
    if (r.btnIco !== r.btnCount) bad.push(`피커 ${r.btnCount}칸 중 ${r.btnIco}칸만 초상이다`);
    if (r.btnText.length) bad.push('피커에 이모지 글자가 남았다: ' + r.btnText.join(' '));
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));

    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : `\nPASS — 아바타 풀 한 벌(${EXPECT_N}종) · 세 파일 동일 참조 · 생성 표본 전부 풀 안 · 도트 초상 ${r.baked}/${r.n}종 · 피커 ${r.btnCount}칸 전부 초상 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
