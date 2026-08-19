// 도구가 `UI.els.*` 를 만지면서 **준비 대기를 안 거는** 것을 정적으로 잡는다. 브라우저를 안 띄운다.
// 사용: node probe-tools-wait-guard.js
//
// 왜 이 판정기가 필요한가 — 같은 병이 이 저장소에서 **네 번** 재발했다(probe-cell-icon-size 상시
// 크래시 · probe-skills-dom 간헐 크래시 · probe-grid-empty · probe-debug-icons). 매번 사람이
// `grep -l "UI\.els\." tools/probe-*.js` 를 훑어 고쳤고, 새로 쓴 도구가 다시 같은 모양으로 들어왔다.
// **훑는 일을 판정기로 바꾸면 재발이 커밋 시점에 잡힌다.**
//
// 병의 정체(둘이 겹쳐 있다):
//  ⑴ `UI.init()` 이 `els` 를 채우기 전에 `UI.els.*` 를 만지면 `Cannot read properties of undefined`
//     로 도구가 통째로 죽는다. **크래시는 통과로도 불통과로도 안 세어진다** — 스윕 요약에서 조용히
//     사라져 '사각지대'가 된다. 부팅이 빠른 런에서는 우연히 지나가 '간헐 결함'으로 오독되기도 한다.
//  ⑵ 헤드리스에서 **`page.evaluate` 를 한 번만 부르고 폴링을 멈추면 rAF 펌프가 죽어 부팅이 굳는다**
//     (실측표는 `wait-ready.js` 의 `waitBootDone` 머리말). 그래서 고정 `waitForTimeout` 도,
//     한 번짜리 대기도 답이 아니다 — **조건이 찰 때까지 계속 두드리는 대기**여야 한다.
//
// 판정: `UI.els.` 를 쓰는 도구는 다음 중 하나를 가져야 한다.
//   ⓐ `waitUiReady(page)`  — els 만 있으면 되는 도구
//   ⓑ `waitBootDone(page)` — 부팅 뒷단계(딥링크·복원·자동 시퀀스)에 기대는 도구
//   ⓒ 대기/폴링 식 안에 `UI.els` 가 직접 들어간 것 (waitForFunction/waitReady/evaluate 폴링)
const fs = require('fs'), path = require('path');
const DIR = __dirname;

const files = fs.readdirSync(DIR)
    .filter(f => /^(probe|test|shot)-.*\.js$/.test(f))
    .sort();

const offenders = [];
let touching = 0;
for (const f of files) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (!src.includes('UI.els.')) continue;
    touching++;
    // ⚠️ 이름이 **보이기만** 하는 걸로 통과시키면 안 된다 — `const { waitBootDone } = require(…)` 만
    //    남기고 호출을 지워도 통과해 버린다(자가진단에서 실제로 그렇게 새는 걸 확인하고 고쳤다).
    //    **호출**(이름 뒤에 여는 괄호)을 요구한다.
    if (/\bwait(?:UiReady|BootDone)\s*\(/.test(src)) continue;
    // 대기/폴링 줄 안에 UI.els 가 들어갔는가 (한 줄 + 다음 두 줄까지 이어 본다)
    const L = src.split('\n');
    let guarded = false;
    for (let i = 0; i < L.length; i++) {
        if (!/waitForFunction|waitReady\(|const ready|evaluate\(`typeof/.test(L[i])) continue;
        if (L.slice(i, i + 3).join(' ').includes('UI.els')) { guarded = true; break; }
    }
    if (!guarded) offenders.push(f);
}

console.log(`도구 ${files.length}개 중 UI.els 를 만지는 것 ${touching}개`);
if (offenders.length) {
    console.log(`\n준비 대기 없이 UI.els 를 만지는 도구 ${offenders.length}개:`);
    offenders.forEach(f => console.log('  ✗ ' + f));
    console.log('\n고치는 법: goto 뒤에 `waitUiReady(page)`(els 면 충분) 또는');
    console.log("           `waitBootDone(page)`(?tab= 딥링크·복원·자동 시퀀스에 기대면) 를 넣을 것.");
    console.log("           require: const { waitUiReady } = require('./wait-ready.js');");
    console.log(`\nFAIL — ${offenders.length}개 도구가 무방비`);
    process.exit(1);
}
console.log('\nPASS — UI.els 를 만지는 도구 전부 준비 대기를 건다');
