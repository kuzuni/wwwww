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
// 신선도 판정은 **mtime 이 아니라 git 커밋 시각**으로 한다 — 새로 clone 한 컨테이너에서는 모든
// 파일의 mtime 이 체크아웃 시각이라 순서가 무의미해진다(이 저장소는 매 세션 새 컨테이너다).
//   ⓐ 소스 중 하나라도 **워킹 트리에서 수정됨**(git status) → 낡음. 지금 고치는 중이라는 뜻이다.
//   ⓑ 소스의 마지막 커밋 시각 > PNG 의 마지막 커밋 시각 → 낡음.
//
// 사용:
//   const { assertFresh } = require('./clone-fresh.js');
//   assertFresh('tools/ref-cmp/clone/skills.png', ['js/icongen.js', 'js/skills.js', 'js/ui.js', 'css'],
//               'node tools/shot-skills.js');
// ⚠️ 소스 목록은 **그 화면을 그리는 것만** 좁게 적을 것 — `js/` 를 통째로 넣으면 무관한 3D 작업에도
//    빨개져서, 다음 사람이 캡처를 다시 굽는 대신 **이 가드를 뜯어낼** 유인이 된다.
const { execFileSync } = require('child_process');
const path = require('path');

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

function dirty(rel) {
    const s = git(['status', '--porcelain', '--', rel]);
    return s === null ? false : s.length > 0;
}

// repo 루트 기준 상대경로로 정규화(절대경로를 줘도 받는다).
function rel(p) {
    return path.isAbsolute(p) ? path.relative(ROOT, p) : (p.startsWith('web/') ? p : path.posix.join('web', p));
}

/* 낡았으면 exit 2(= '측정기 고장', probe-emblem-core 와 같은 규약)로 끊는다.
   판정 실패(exit 1)와 갈라 두는 이유: 낡은 캡처는 **아이콘이 나쁘다는 뜻이 아니라 잰 게 없다는 뜻**이다. */
function assertFresh(png, sources, howToRebake) {
    const pngRel = rel(png);
    const pngT = lastCommit(pngRel);
    if (pngT === null) {
        console.error(`⚠️ ${pngRel} 이 git 에 없다 — 신선도를 확인할 수 없다.`);
        console.error(`   커밋된 클론 캡처가 아니면 이 판정기의 '클론' 쪽 수치는 근거가 없다.`);
        process.exit(2);
    }
    const stale = [];
    for (const s of sources) {
        const sRel = rel(s);
        if (dirty(sRel)) { stale.push(`${sRel} (워킹 트리에서 수정됨 — 지금 고치는 중)`); continue; }
        const sT = lastCommit(sRel);
        if (sT !== null && sT > pngT) stale.push(`${sRel} (${new Date(sT * 1000).toISOString()} > 캡처 ${new Date(pngT * 1000).toISOString()})`);
    }
    if (!stale.length) return true;
    console.error(`🚨 클론 캡처가 낡았다 — ${pngRel} 는 지금 코드로 구운 것이 아니다.`);
    stale.forEach(s => console.error('   · ' + s));
    console.error(`\n   이 자는 브라우저를 안 띄우고 **커밋된 PNG 두 장을 맞대기만 한다.** 이대로 재면`);
    console.error(`   옛 화면의 수치가 아무 경고 없이 나오고, 그걸 '내 변경이 효과가 없다'로 오독하게 된다`);
    console.error(`   (실제로 그 사고가 났다 — clone-fresh.js 머리말 참조).`);
    console.error(`\n   다시 구울 것:  ${howToRebake}`);
    console.error(`   📌 다시 구운 PNG 는 **소스 변경과 같은 커밋에 담을 것** — 커밋 시각이 같아지면`);
    console.error(`      이 가드가 통과한다. 갈라 커밋하면 그 사이 상태에서 또 낡은 걸로 잡힌다.`);
    console.error(`   📌 아직 작업 중이라 커밋 전이면(위에 '워킹 트리에서 수정됨'이 뜬 경우) 그게 정상이다 —`);
    console.error(`      캡처를 굽고 재는 건 되지만, 그 수치는 커밋 전까지 '지금 트리' 기준임을 알고 쓸 것.`);
    process.exit(2);
}

module.exports = { assertFresh };
