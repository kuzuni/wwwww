// 도구가 `UI.els.*` 를 만지면서 **준비 대기를 안 거는** 것을 정적으로 잡는다. 브라우저를 안 띄운다.
// 사용: node probe-tools-wait-guard.js        # 판정 (regress.sh 등재)
//       node probe-tools-wait-guard.js --list # 어떤 도구가 어떤 근거로 통과했는지 전부 찍기
//       node probe-tools-wait-guard.js --selftest # 탐지기 자체의 자가진단(합성 소스 10종)
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
// 판정: `UI.els.` 를 **재는 코드에서** 쓰는 도구는 다음 중 하나를 가져야 한다.
//   ⓐ `waitUiReady(page)`  — els 만 있으면 되는 도구
//   ⓑ `waitBootDone(page)` — 부팅 뒷단계(딥링크·복원·자동 시퀀스)에 기대는 도구
//   ⓒ 대기/폴링 식 안에 `UI.els` 가 직접 들어간 것 (waitForFunction/waitReady/evaluate 폴링)
//   ⓓ ⓒ 와 같되 **준비 식을 상수에 담아** 대기 호출에 넘긴 것 —
//        `const READY = '… UI.els && !!UI.els.equipSheet …'; … await waitReady(page, READY)`
//
// 🚨 **ⓓ 를 왜 나중에 붙였나 (2026-08-20 UI 스트림, `wait-guard-header-tools`).**
//    1차 판은 "대기 호출 줄 ±2줄 안에 `UI.els` 라는 글자가 보이는가" 로만 봤다. 그런데 이 저장소의
//    화면 계측 도구들은 준비 식이 길어서 **한 줄 위의 `const READY = …` 에 담아 두고** 대기 호출엔
//    이름만 넘긴다(`shot-screens-seed` 계열 5종이 전부 그 모양이다). 그래서 판정기가
//    **가드를 제대로 건 도구 5개를 무방비로 지목**했고 `regress.sh` 가 그 하나로 빨갛게 섰다.
//    ⚠️ **거짓 양성이 판정기를 무디게 만드는 경로가 여기 있었다** — 지목당한 쪽에서 보면
//    "이미 기다리는데 왜 빨갛지?" 라서, 손쉬운 해결이 **판정기를 느슨하게 푸는 것**이 된다.
//    그래서 ⓓ 는 느슨하게 풀지 않았다: 상수 선언에 `UI.els` 가 들어 있는 것만으로는 부족하고
//    **그 상수가 실제 대기 호출의 인자로 넘어가야** 한다(선언만 남기고 호출을 지우면 다시 걸린다).
//
// 🚨 **'만진다' 의 정의도 같이 좁혔다.** 종전엔 파일 어디든 `UI.els.` 라는 글자가 있으면
//    '만지는 도구' 로 셌는데, 그러면 **가드 식 자체가 `UI.els.equipSheet` 를 담고 있다는 이유로**
//    가드를 건 도구가 되레 후보에 오른다(위 5종이 정확히 그랬다 — 재는 코드에는 `UI.els` 가
//    한 번도 안 나온다). 이제 ⑴ 줄머리 주석 ⑵ 대기 호출로 넘어간 준비 식 선언 — 둘을 걷어낸
//    나머지에서 `UI.els.` 를 찾는다. 판정기 자신도 후보에서 뺀다(문서에 `UI.els.` 가 잔뜩 있다).
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const SELF = path.basename(__filename);

const WAIT_CALL = /\b(?:waitReady|waitForFunction|waitUiReady|waitBootDone)\s*\(/;

// 줄머리 주석만 걷어낸다(`'file://'` 같은 코드 속 `//` 를 자르면 되레 진짜 사용을 숨긴다).
function stripLeadingComments(lines) {
    const out = lines.slice();
    let inBlock = false;
    for (let i = 0; i < out.length; i++) {
        const t = out[i].trim();
        if (inBlock) { out[i] = ''; if (t.includes('*/')) inBlock = false; continue; }
        if (t.startsWith('//')) { out[i] = ''; continue; }
        if (t.startsWith('/*')) { out[i] = ''; if (!t.includes('*/')) inBlock = true; continue; }
    }
    return out;
}

// `const NAME = …UI.els…;` 선언을 찾아 { name, from, to } 로 돌려준다(세미콜론까지 최대 12줄).
function readyDecls(lines) {
    const decls = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[i]);
        if (!m) continue;
        let end = i;
        while (end < lines.length && end < i + 12 && !/;\s*$/.test(lines[end])) end++;
        if (end >= lines.length) end = lines.length - 1;
        const body = lines.slice(i, end + 1).join('\n');
        if (body.includes('UI.els')) decls.push({ name: m[1], from: i, to: end });
        i = end;
    }
    return decls;
}

// 대기 호출의 **인자 본문**을 괄호 짝을 맞춰 떼어 낸다.
// 🚨 종전 판정은 "대기 호출 줄 + 다음 두 줄에 `UI.els` 라는 글자가 보이는가" 였는데, 그 '다음 두 줄'은
//    보통 **재는 줄**이다. 그래서 `await waitReady(page, 'typeof UI !== "undefined"')` 바로 아래에
//    `await page.evaluate(() => UI.els.grid)` 를 쓰면 **판정기가 스스로 통과시켰다** — 이 판정기가
//    잡으라고 만들어진 바로 그 모양이다(2026-08-20 자가진단으로 발견해 함께 고쳤다).
//    이제 대기가 **무엇을 기다리는지**(인자)만 본다.
function callArgs(text, re) {
    const out = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
        let depth = 0, i = m.index + m[0].length - 1;
        const start = i + 1;
        for (; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')' && --depth === 0) break;
        }
        out.push({ name: m[1], args: text.slice(start, Math.min(i, text.length)), at: m.index });
    }
    return out;
}
const waitCalls = text => callArgs(text, /\b(waitReady|waitForFunction|waitUiReady|waitBootDone)\s*\(/g);

/* ⓔ 손으로 짠 Node 쪽 폴링 루프도 진짜 가드다 — 이 저장소가 실제로 쓰는 모양이다.
     for (let w = 0; ; w++) {
         const ready = await page.evaluate('typeof UI !== "undefined" && !!UI.els').catch(() => false);
         if (ready) break;  …
     }
   `waitForFunction` 이 swiftshader 헤드리스에서 3D 렌더 한 프레임에 밀려 안 도는 문제 때문에
   여러 도구가 이 손폴링으로 갔다(`probe-sr-stage-gap` 머리말에 실측 이유가 적혀 있다).
   ⚠️ **루프 안일 것을 요구한다** — 폴링 없이 `evaluate` 를 한 번만 부르면 되레 rAF 펌프가 죽어
      부팅이 굳는다(병 ⑵). 루프 여부는 바로 위 3줄에 `for (`/`while (` 가 있는지로 본다. */
function pollingGuard(lines) {
    const text = lines.join('\n');
    const calls = callArgs(text, /\b(?:const|let|var)\s+\w*[Rr]eady\w*\s*=\s*await\s+[\w.]+\.(evaluate)\s*\(/g);
    for (const c of calls) {
        if (!c.args.includes('UI.els')) continue;
        const line = text.slice(0, c.at).split('\n').length - 1;
        if (/\b(?:for|while)\s*\(/.test(lines.slice(Math.max(0, line - 3), line).join(' '))) return true;
    }
    return false;
}

// 한 파일을 본다 → { touches, guarded, why }
function inspect(src) {
    const lines = stripLeadingComments(src.split('\n'));
    const text = lines.join('\n');
    const decls = readyDecls(lines);
    const calls = waitCalls(text);
    const usedIn = d => calls.some(c => new RegExp('\\b' + d.name + '\\b').test(c.args));
    const viaConst = decls.filter(usedIn);

    // 재는 코드만 남긴다 — 대기 호출로 넘어간 준비 식 선언을 지운다.
    const body = lines.slice();
    for (const d of viaConst) for (let i = d.from; i <= d.to; i++) body[i] = '';
    const touches = body.join('\n').includes('UI.els.');
    if (!touches) return { touches: false, guarded: true, why: viaConst.length ? 'ⓓ 준비 식 상수뿐(재는 코드에 UI.els 없음)' : '재는 코드에 UI.els 없음' };

    if (calls.some(c => c.name === 'waitUiReady' || c.name === 'waitBootDone')) return { touches, guarded: true, why: 'ⓐⓑ waitUiReady/waitBootDone 호출' };
    if (calls.some(c => c.args.includes('UI.els'))) return { touches, guarded: true, why: 'ⓒ 대기 인자에 UI.els 직접' };
    if (viaConst.length) return { touches, guarded: true, why: 'ⓓ 준비 식 상수(' + viaConst.map(d => d.name).join(',') + ') 를 대기 호출에 넘김' };
    if (pollingGuard(lines)) return { touches, guarded: true, why: 'ⓔ 손폴링 루프(const ready = await …evaluate(…UI.els…))' };
    return { touches, guarded: false, why: '무방비' };
}

// ── 자가진단: 탐지기가 새지도(거짓 음성) 과하지도(거짓 양성) 않은지 합성 소스로 확인한다.
function selftest() {
    const G = "const { waitUiReady } = require('./wait-ready.js');\n";
    const cases = [
        ['무방비 — 대기 없이 els', "await page.goto(I);\nconst n = await page.evaluate(() => UI.els.grid.children.length);\n", false],
        ['ⓐ waitUiReady 호출', G + "await page.goto(I);\nawait waitUiReady(page);\nawait page.evaluate(() => UI.els.grid);\n", true],
        ['🚨 require 만 있고 호출은 없음 → 무방비', G + "await page.goto(I);\nawait page.evaluate(() => UI.els.grid);\n", false],
        ['ⓒ 대기 식에 UI.els 직접', "await page.waitForFunction(() => UI.els && UI.els.grid);\nawait page.evaluate(() => UI.els.grid);\n", true],
        ['ⓓ 준비 식 상수 → waitReady', "const READY = 'typeof UI !== \"undefined\" && UI.els && !!UI.els.equipSheet';\nawait page.goto(I);\nawait waitReady(page, READY);\nawait page.evaluate(() => UI.els.grid);\n", true],
        ['ⓓ 준비 식 상수 → 문자열 연결', "const READY = 'UI.els && !!UI.els.equipSheet';\nawait waitReady(page, 'S && S.forgeLevel === 29 && ' + READY);\nawait page.evaluate(() => UI.els.grid);\n", true],
        ['ⓓ 화살표 상수 → waitForFunction', "const READY = () => typeof UI !== 'undefined' && UI.els && UI.els.craftModal;\nawait page.waitForFunction(READY, null, { timeout: 20000 });\nawait page.evaluate(() => UI.els.craftModal);\n", true],
        ['🚨 준비 식 상수만 두고 대기 호출 삭제 → 무방비', "const READY = 'UI.els && !!UI.els.equipSheet';\nawait page.goto(I);\nawait page.evaluate(() => UI.els.grid);\n", false],
        ['가드 식에만 UI.els — 재는 코드엔 없음 → 후보 아님', "const READY = 'UI.els && !!UI.els.equipSheet';\nawait waitReady(page, READY);\nconst n = await page.evaluate(() => document.querySelectorAll('.cell').length);\n", true],
        ['줄머리 주석의 UI.els 는 만지는 게 아니다', "// 이 도구는 UI.els.grid 를 안 만진다\nconst n = await page.evaluate(() => document.querySelectorAll('.cell').length);\n", true],
        ['🚨 대기는 typeof UI 만 보고 바로 다음 줄에서 els → 무방비', "await waitReady(page, 'typeof UI !== \"undefined\"');\nawait page.evaluate(() => UI.els.grid);\n", false],
        ['🚨 다른 상수(UI.els 없음)를 넘긴 대기 → 무방비', "const READY = 'typeof UI !== \"undefined\" && typeof S !== \"undefined\"';\nawait waitReady(page, READY);\nawait page.evaluate(() => UI.els.grid);\n", false],
        ['ⓔ 손폴링 루프', "for (let w = 0; ; w++) {\n  const ready = await page.evaluate('typeof UI !== \"undefined\" && !!UI.els').catch(() => false);\n  if (ready) break;\n  await new Promise(r => setTimeout(r, 500));\n}\nawait page.evaluate(() => UI.els.grid);\n", true],
        ['🚨 루프 없는 한 번짜리 evaluate → 무방비(rAF 펌프가 죽는다)', "const ready = await page.evaluate('typeof UI !== \"undefined\" && !!UI.els');\nawait page.evaluate(() => UI.els.grid);\n", false],
    ];
    let bad = 0;
    for (const [name, src, want] of cases) {
        const r = inspect(src);
        const ok = r.guarded === want;
        if (!ok) bad++;
        console.log(`  ${ok ? '✓' : '✗'} ${name} → guarded=${r.guarded} (${r.why})${ok ? '' : `  기대=${want}`}`);
    }
    console.log(bad ? `\nFAIL — 자가진단 ${bad}/${cases.length} 불일치` : `\nPASS — 자가진단 ${cases.length}/${cases.length}`);
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

const files = fs.readdirSync(DIR)
    .filter(f => /^(probe|test|shot)-.*\.js$/.test(f) && f !== SELF)
    .sort();

const offenders = [];
const guarded = [];
let touching = 0;
for (const f of files) {
    const r = inspect(fs.readFileSync(path.join(DIR, f), 'utf8'));
    if (!r.touches) continue;
    touching++;
    if (r.guarded) guarded.push([f, r.why]); else offenders.push(f);
}

console.log(`도구 ${files.length}개 중 재는 코드에서 UI.els 를 만지는 것 ${touching}개`);
if (process.argv.includes('--list')) guarded.forEach(([f, why]) => console.log('  ✓ ' + f + '  — ' + why));
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
