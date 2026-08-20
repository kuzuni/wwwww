// `ref-cmp/clone/*.png` 가 **지금 코드로 구운 것인지** 확인한다. 낡았으면 판정기를 끊는다.
//
// 🚨 왜 필요한가 — 이게 없어서 세 세션이 헛수치를 읽었다 (2026-08-20 UI 스트림이 음성 대조로 발견).
//   `probe-skill-orb-ink.js` 같은 '원본 대조형' 판정기는 브라우저를 안 띄운다. **커밋된 클론 캡처
//   PNG 와 원본 PNG 두 장을 맞대기만 한다.** 그래서 게임 코드를 고치고 캡처를 다시 굽지 않으면
//   **판정기는 옛 화면을 재면서 아무 말도 안 한다** — 실패도 경고도 없이 옛 수치를 그대로 인쇄한다.
//   실제 사고: `IconGen._EMBLEM_STEP` 를 `.30 → .24` 로 내리고 이 판정기를 읽었더니 ⓑ 가
//   `44.8 → 44.7` 로 **꿈쩍도 안 했다.** 그래서 "이 노브는 채도 레버가 아니다"라는 **틀린 결론**을
//   내리고 `_shade` 의 수식까지 끌어와 그럴듯하게 설명까지 붙였다(커밋 하나가 그 상태로 나갔다).
//   🔍 **음성 대조가 그걸 깼다** — 채움을 거의 순백(`0.92/0.90/0.88/0.90`)으로 만드는 극단값을 넣고
//      다시 쟀는데 **ⓑ 가 44.7% 로 한 자리도 안 바뀌었다.** 화면이 그렇게 바뀌었는데 자가 안 움직이면
//      바뀐 건 화면이 아니라 **자가 다른 걸 보고 있다는 뜻**이다. 캡처를 다시 굽고 재니
//      `.30 → .24` 는 실제로 **ⓑ 45.6% → 50.0% (+4.4%p)** 였다.
//   📌 교훈: **판정기가 '변화 없음'을 말하면 먼저 그 자가 변화를 볼 수 있는지부터 증명할 것.**
//      극단값 음성 대조는 30초면 된다(`probe-emblem-core` 가 이미 자 안에 그걸 박아 두고 있다).
//
// 신선도 판정은 **커밋된 것끼리는 git 커밋 시각**으로 한다 — 새로 clone 한 컨테이너에서는 모든
// 파일의 mtime 이 체크아웃 시각이라 순서가 무의미해진다(이 저장소는 매 세션 새 컨테이너다).
//   ⓐ 소스의 마지막 커밋 시각 > PNG 의 마지막 커밋 시각 → **낡음(exit 2)**.
//   ⓑ 소스가 **워킹 트리에서 수정 중**이면 커밋 시각이 없으니 **그 둘의 mtime 을 본다**(같은 세션
//      안이라 mtime 이 의미를 갖는 유일한 경우다):
//        · PNG mtime > 소스 mtime → 고친 뒤 다시 구웠다는 뜻 → **통과하되 경고 한 줄**
//          ("커밋 전 트리 기준 수치"). 개발 중에 A/B 를 뜨는 게 정상 작업이라 여기서 끊으면 안 된다.
//        · PNG mtime < 소스 mtime → 고쳐 놓고 안 구웠다 → **낡음(exit 2)**.
//      ⚠️ 이 완화를 '더러우면 무조건 통과'로 되돌리지 말 것 — 그러면 가드가 **정작 필요할 때만
//         골라서 꺼진다**(고치는 중이 곧 재는 중이다). 반드시 mtime 비교를 남길 것.
//
// 🚨 **다시 구워도 안 풀리는 막다른 골목이 있었다 — 그래서 재굽기 스탬프를 둔다 (2026-08-20 UI 스트림,
//    slug `clone-fresh-identical-rebake`).**
//   위 규칙 ⓐ 는 **커밋 시각**으로 신선도를 재는데, 처방문("다시 구워 소스와 같은 커밋에 담아라")은
//   **다시 구운 PNG 가 달라진다**는 전제 위에 서 있다. 그런데 그 화면을 안 건드리는 소스 변경이면
//   **다시 구운 PNG 가 바이트 동일**이라 `git status` 가 비고 **커밋이 안 생긴다** → 캡처 커밋 시각이
//   그대로라 **가드가 영원히 안 풀린다.** 실제로 밟았다: `js/icongen.js` 의 알 조형만 고쳤는데(스킬
//   화면엔 알이 없다) `shot-skills.js` 가 `wrote …/skills.png` 를 찍고도 `git status` 는 빈 줄이었고,
//   `probe-orb-face-flat` 은 계속 `icongen.js 07:38:57 > 캡처 07:28:53` 으로 exit 2 였다.
//   👉 **처방**: 캡처 옆에 `<이름>.png.fresh` 스탬프를 둔다. 굽는 스크립트가 **구울 때마다 굽는 시각을
//      새로 쓰므로 내용이 항상 바뀌고**, 그래서 **바이트 동일 재굽기도 커밋할 것이 생긴다.** 가드는
//      캡처와 스탬프 중 **더 새로운 쪽**을 캡처의 시각으로 본다.
//   ⚠️ **스탬프는 '봤다'가 아니라 '구웠다'의 기록이어야 한다** — 손으로 찍지 말고 반드시 굽는
//      스크립트가 쓰게 할 것(`stampFresh`). 손으로 갱신하면 가드가 그냥 꺼진다.
//   ⚠️ 스탬프는 **캡처와 같은 커밋에** 담을 것(캡처가 안 바뀌면 스탬프만 담긴다).
//
// 사용:
//   const { assertFresh } = require('./clone-fresh.js');
//   assertFresh('tools/ref-cmp/clone/skills.png', ['js/icongen.js', 'js/skills.js', 'js/ui.js', 'css'],
//               'node tools/shot-skills.js');
//   // 굽는 스크립트 쪽:
//   const { stampFresh } = require('./clone-fresh.js');
//   await page.screenshot({ path: OUT });  stampFresh(OUT);
// ⚠️ 소스 목록은 **그 화면을 그리는 것만** 좁게 적을 것 — `js/` 를 통째로 넣으면 무관한 3D 작업에도
//    빨개져서, 다음 사람이 캡처를 다시 굽는 대신 **이 가드를 뜯어낼** 유인이 된다.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');          // 저장소 루트(web/ 의 부모)

function git(args) {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
    catch (e) { return null; }
}

// 마지막 커밋 시각(epoch). 추적 안 되는 경로면 null.
function lastCommit(rel) {
    const t = git(['log', '-1', '--format=%ct', '--', rel]);
    return t ? parseInt(t, 10) : null;
}

function mtime(abs) {
    try { return fs.statSync(abs).mtimeMs; } catch (e) { return null; }
}

// 파일이면 그 mtime, 디렉터리면 그 아래에서 **가장 새로운** mtime(한 겹만 훑는다 — css/ 용).
function newestMtime(abs) {
    let st;
    try { st = fs.statSync(abs); } catch (e) { return null; }
    if (!st.isDirectory()) return st.mtimeMs;
    let best = st.mtimeMs;
    for (const f of fs.readdirSync(abs)) {
        const m = mtime(path.join(abs, f));
        if (m !== null && m > best) best = m;
    }
    return best;
}

function dirty(rel) {
    const s = git(['status', '--porcelain', '--', rel]);
    return s === null ? false : s.length > 0;
}

// repo 루트 기준 상대경로로 정규화(절대경로를 줘도 받는다).
function rel(p) {
    return path.isAbsolute(p) ? path.relative(ROOT, p) : (p.startsWith('web/') ? p : path.posix.join('web', p));
}

/* 캡처 옆 재굽기 스탬프 경로. `…/skills.png` → `…/skills.png.fresh`. */
function stampOf(pngRel) { return pngRel + '.fresh'; }

/* 캡처를 구운 직후에 부른다 — 굽는 스크립트 전용. **매번 내용이 달라지므로** 캡처가 바이트
   동일하게 나와도 커밋할 것이 생기고, 그래서 가드가 풀린다(머리말 🚨 참조).
   인자는 방금 쓴 PNG 의 경로(절대·상대 아무거나). 굽기와 같은 커밋에 담을 것. */
function stampFresh(png) {
    /* ⚠️ 여기서는 `rel()` 을 쓰지 않는다 — 굽는 스크립트는 임시 디렉터리로도 굽는다(`shot-screens.js <dir>`).
       `rel()` 은 저장소 밖 경로를 `web/../../tmp/…` 로 접어 **엉뚱한 자리에 스탬프를 쓴다.**
       스탬프는 **방금 쓴 PNG 바로 옆**이어야 한다. */
    const abs = stampOf(path.isAbsolute(String(png)) ? String(png) : path.join(ROOT, rel(png)));
    try {
        fs.writeFileSync(abs,
            `# ${path.basename(String(png))} 재굽기 스탬프 — tools/clone-fresh.js 가 읽는다.\n` +
            `# 손으로 고치지 말 것: 굽는 스크립트만 쓴다(손으로 쓰면 신선도 가드가 그냥 꺼진다).\n` +
            `# 캡처가 바이트 동일하게 나와도 이 줄이 바뀌므로 '다시 구웠다'가 커밋에 남는다.\n` +
            `baked=${new Date().toISOString()}\n`);
    } catch (e) { console.error(`⚠️ 재굽기 스탬프를 못 썼다(${abs}): ${e.message}`); }
}

/* 낡았으면 exit 2(= '측정기 고장', probe-emblem-core 와 같은 규약)로 끊는다.
   판정 실패(exit 1)와 갈라 두는 이유: 낡은 캡처는 **아이콘이 나쁘다는 뜻이 아니라 잰 게 없다는 뜻**이다.

   opts.warnOnly — 진단만 찍고 **끊지 않는다**(낡으면 false 반환). 왜 이 모드가 있나:
     이 저장소는 `ref-cmp/clone/*.png` 를 **`shot-screens.js` 로 한꺼번에** 다시 굽는 관행이라,
     소스 목록을 넓게(`web/js`·`web/css`) 잡으면 **무관한 작업 중에도 자주 낡음으로 잡힌다.**
     거기서 곧장 `exit 2` 로 끊으면 멀쩡히 쓰던 판정기가 갑자기 죽고, 다음 사람은 캡처를 굽는
     대신 **가드를 뜯어낼** 유인을 받는다(2026-08-20 UI 스트림 판단).
     👉 그래서 **처음 물릴 때는 warnOnly** 로 두어 '이 수치는 낡은 캡처다'를 읽는 사람에게 알리기만
        하고, 소스 목록을 그 화면에 맞게 **좁힌 뒤에** 하드 게이트로 올릴 것.
        (`probe-skill-orb-ink` 는 이미 좁혀서 하드 게이트로 돌고 있다 — 그 모양이 목표다.) */
function assertFresh(png, sources, howToRebake, opts = {}) {
    const pngRel = rel(png);
    /* 캡처 시각 = **캡처와 스탬프 중 더 새로운 쪽.** 스탬프는 '이 소스 상태에서 다시 구웠고
       결과가 (같든 다르든) 이것이다'의 기록이라, 바이트 동일 재굽기를 여기서 받아 준다. */
    const stRel = stampOf(pngRel);
    const stT = lastCommit(stRel);
    const pngT0 = lastCommit(pngRel);
    const pngT = pngT0 === null ? null : Math.max(pngT0, stT === null ? 0 : stT);
    if (pngT === null) {
        console.error(`⚠️ ${pngRel} 이 git 에 없다 — 신선도를 확인할 수 없다.`);
        console.error(`   커밋된 클론 캡처가 아니면 이 판정기의 '클론' 쪽 수치는 근거가 없다.`);
        if (opts.warnOnly) return false;
        process.exit(2);
    }
    const pngM0 = mtime(path.join(ROOT, pngRel)), stM = mtime(path.join(ROOT, stRel));
    const pngM = pngM0 === null ? stM : (stM === null ? pngM0 : Math.max(pngM0, stM));
    const stale = [], uncommitted = [];
    for (const s of sources) {
        const sRel = rel(s);
        if (dirty(sRel)) {
            // 커밋 시각이 없다 → 같은 세션 안이므로 mtime 으로 '고친 뒤 다시 구웠나'를 본다.
            const sM = newestMtime(path.join(ROOT, sRel));
            if (pngM !== null && sM !== null && pngM >= sM) uncommitted.push(sRel);
            else stale.push(`${sRel} (워킹 트리에서 수정됨 — 그 뒤로 캡처를 다시 굽지 않았다)`);
            continue;
        }
        const sT = lastCommit(sRel);
        if (sT !== null && sT > pngT) {
            /* 커밋 시각으로는 낡았지만 **이 세션에서 방금 다시 구웠을 수 있다** — 스탬프를 아직 커밋
               안 한 창이 그렇다(재굽기 → 검증 → 커밋 순서라 그 창은 반드시 생긴다).
               새 컨테이너에서는 모든 파일 mtime 이 체크아웃 시각이라 스탬프 mtime 이 소스보다
               **새롭다는 것 자체가** '체크아웃 뒤에 구웠다'는 증거다(규칙 ⓑ 와 같은 논리). */
            const stM2 = mtime(path.join(ROOT, stRel)), sM2 = newestMtime(path.join(ROOT, sRel));
            if (stM2 !== null && sM2 !== null && stM2 > sM2) { uncommitted.push(`${sRel} (스탬프가 더 새롭다 — 커밋 전 재굽기)`); continue; }
            stale.push(`${sRel} (${new Date(sT * 1000).toISOString()} > 캡처 ${new Date(pngT * 1000).toISOString()})`);
        }
    }
    if (!stale.length) {
        if (uncommitted.length) {
            console.error(`⚠️ 아래 소스가 커밋 전이다 — 캡처는 그 뒤에 다시 구웠으니 수치는 유효하지만,`);
            console.error(`   **'지금 워킹 트리' 기준**이다(커밋된 상태의 수치가 아니다):`);
            uncommitted.forEach(s => console.error('   · ' + s));
            console.error(`   👉 커밋할 때 다시 구운 PNG 를 **같은 커밋에** 담을 것.\n`);
        }
        return true;
    }
    console.error(`🚨 클론 캡처가 낡았다 — ${pngRel} 는 지금 코드로 구운 것이 아니다.`);
    stale.forEach(s => console.error('   · ' + s));
    console.error(`\n   이 자는 브라우저를 안 띄우고 **커밋된 PNG 두 장을 맞대기만 한다.** 이대로 재면`);
    console.error(`   옛 화면의 수치가 아무 경고 없이 나오고, 그걸 '내 변경이 효과가 없다'로 오독하게 된다`);
    console.error(`   (실제로 그 사고가 났다 — clone-fresh.js 머리말 참조).`);
    console.error(`\n   다시 구울 것:  ${howToRebake}`);
    console.error(`   📌 다시 구운 PNG 는 **소스 변경과 같은 커밋에 담을 것** — 커밋 시각이 같아지면`);
    console.error(`      이 가드가 통과한다. 갈라 커밋하면 그 사이 상태에서 또 낡은 걸로 잡힌다.`);
    console.error(`   📌 그 화면을 안 건드리는 변경이면 **PNG 가 바이트 동일**이라 커밋할 게 없어 보인다 —`);
    console.error(`      그때 커밋할 것은 옆에 같이 굽히는 **${path.basename(stRel)}**(재굽기 스탬프)다.`);
    console.error(`      스탬프가 안 생겼으면 그 굽는 스크립트가 아직 \`stampFresh(OUT)\` 를 안 부르는 것이다.`);
    console.error(`   📌 아직 작업 중이라 커밋 전이면(위에 '워킹 트리에서 수정됨'이 뜬 경우) 그게 정상이다 —`);
    console.error(`      캡처를 굽고 재는 건 되지만, 그 수치는 커밋 전까지 '지금 트리' 기준임을 알고 쓸 것.`);
    if (opts.warnOnly) {
        console.error(`\n   ⚠️ (경고 전용 모드라 판정은 그대로 진행한다 — **아래 '클론' 수치를 그대로 믿지 말 것.**)\n`);
        return false;
    }
    process.exit(2);
}

module.exports = { assertFresh, stampFresh };
