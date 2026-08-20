// 스킬 **연출(fx) ↔ 이름 ↔ 아이콘** 정합 검사 (`skill-name-icon-match-fx`, 사용자 지시 2026-08-19)
//   "스킬 이펙트에 어울리는 이름과 스킬 아이콘으로 바꾸고."
// 판정 = "이름·아이콘만 보고 그 스킬 연출이 뭔지 짐작되는가" — 사람이 보는 그 판정을 회귀로
// 굳히기 위해, **fx 마다 허용되는 아이콘 모티프**를 표로 못 박고 어긋나면 실패시킨다.
// (아포칼립스가 연출은 화염룡인데 아이콘은 **운석**이던 자리가 이 검사의 출발점이다.)
//
// ① 정적 검사(브라우저 불필요): `gamedata.js` 의 SKILL_DEFS(fx) ↔ `icongen.js` 의 SK(모티프) 대조
// ② 모티프가 `P` 에 실제로 정의돼 있는가(오타면 sparkle 로 조용히 떨어져 아무도 모른다)
// ③ 참고 출력: fx 를 **공유**하는 스킬 묶음 — 아이콘·이름을 아무리 갈라도 연출이 같으면
//    "이름만 보고 연출을 안다"는 완전히 성립하지 않는다(연출 분리는 3D 스트림 `skill-unique-signature`).
// 사용: node tools/probe-skill-fx-name-icon.js
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

// fx → 허용 모티프. 여러 스킬이 나눠 쓰는 fx(heal·aura·beam)는 그 안에서 갈라 쓰는 걸 허용한다.
/* fx → 허용 모티프.
   🚨 **2026-08-19 현행화(icon-gen)**: 이 표는 fx 가 **스킬마다 하나씩으로 갈라진** 뒤로 낡아
   있었다 — `firstaid`·`warcry`·`voidrift`·`timewarp`·`wardshield` 다섯이 표에 없어 **5건 불통과가
   상시로 떠 있었다**(모티프는 전부 멀쩡했다. 낡은 건 자다). 종전엔 `heal`·`aura`·`beam` 하나를
   여러 스킬이 나눠 썼는데, 3D 스트림의 연출 분리(`skill-unique-signature`)가 끝나면서 스킬마다
   제 fx 를 갖게 됐다 — 그래서 아래 '**fx 공유 묶음**' 출력이 지금은 **비어 있는 게 정상**이다.
   ⚠️ 새 fx 를 만들면 여기 한 줄을 같이 등재할 것. 안 하면 이 게이트가 통째로 빨개져서
      **진짜 어긋남이 묻힌다**(그게 이번에 실제로 일어난 일이다). */
const ALLOW = {
    slash: ['slashx'],            // 참격이 엇갈려 여러 번 (slashArcs)
    ring: ['whirl'],              // 회오리 소용돌이 (whirlwindVortex)
    firstaid: ['cross'],          // 응급 처치 — 회복 십자
    heal: ['cross', 'sparkle', 'halo'],   // 빛기둥 강림 — 회복 계열(축복)
    explode: ['flame'],           // 투척 불덩이 + 폭발 (fireStorm)
    beam: ['arrows', 'spear'],    // 화살 세례 (arrowVolley) — 마지막 한 발만 굵다
    warcry: ['horn'],             // 전투의 함성 — 메가폰 + 음파
    aura: ['horn', 'sanctum', 'hourglass'],// 룬 서클 — 버프/성역 계열
    meteor: ['meteor'],           // 운석 세례 (meteorStorm)
    bolt: ['bolt'],               // 먹구름 낙뢰 (stormCloudStrike)
    breath: ['maw'],              // 지중 습격 거대 아가리 (dragonMaw)
    guillotine: ['cleaver'],      // 처형 칼날 낙하 (guillotineDrop)
    nova: ['burst'],              // 수축 후 대폭발 (supernovaBlast)
    voidrift: ['spear'],          // 공허의 창 — 균열에서 뻗는 창
    timewarp: ['hourglass'],      // 시간 왜곡 — 모래시계
    dragonfire: ['dragon'],       // 화염룡 강림 (dragonfireBreath)
    spear: ['spear'],             // 하늘이 열리고 황금 창 (godSpearDrop)
    wardshield: ['halo', 'shield'],// 신성한 가호 — 후광 링 + 날개
};


const gd = R('js/gamedata.js');
const ig = R('js/icongen.js');

const defs = [...gd.matchAll(/\{\s*id:\s*'(\w+)',\s*name:\s*'([^']+)'[^}]*?fx:\s*'(\w+)'/g)]
    .map(m => ({ id: m[1], name: m[2], fx: m[3] }));
const skBlock = ig.slice(ig.indexOf('const SK = {'), ig.indexOf('};', ig.indexOf('const SK = {')));
const motifs = {};
for (const m of skBlock.matchAll(/(\w+):\s*\['(\w+)'/g)) motifs[m[1]] = m[2];
const pBlock = ig.slice(ig.indexOf('const P = {'));
const defined = new Set([...pBlock.matchAll(/^\s{8}(\w+)\(ctx, S\)/gm)].map(m => m[1]));

const fails = [];
if (defs.length !== 18) fails.push(`SKILL_DEFS 파싱 ${defs.length}종 (18종이어야 한다 — 정규식이 형식 변경을 못 따라갔다)`);
const byFx = {};
for (const d of defs) {
    const motif = motifs[d.id];
    (byFx[d.fx] = byFx[d.fx] || []).push(d);
    if (!motif) { fails.push(`${d.id}: IconGen SK 표에 아이콘 모티프가 없다`); continue; }
    if (!defined.has(motif)) fails.push(`${d.id}: 모티프 '${motif}' 가 P 에 없다 — sparkle 로 조용히 떨어진다`);
    const allow = ALLOW[d.fx];
    if (!allow) fails.push(`${d.id}: fx '${d.fx}' 가 이 검사표에 없다 — fx 를 새로 만들었으면 허용 모티프를 여기 등재할 것`);
    else if (!allow.includes(motif)) fails.push(`${d.id}(${d.name}): 연출 '${d.fx}' 인데 아이콘 모티프가 '${motif}' 다 (허용: ${allow.join('/')})`);
    console.log(`  ${d.id.padEnd(13)} ${d.name.padEnd(8)} fx=${d.fx.padEnd(11)} icon=${motif}`);
}
const shared = Object.entries(byFx).filter(([, v]) => v.length > 1);
console.log('\nfx 공유 묶음(연출 분리는 3D `skill-unique-signature` 담당 — 이름·아이콘만으론 끝까지 안 갈린다):');
for (const [fx, v] of shared) console.log(`  ${fx}: ${v.map(d => d.name).join(' · ')}`);

if (fails.length) { console.log('\n❌ FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('\n✅ PASS — 18종 전부 연출에 맞는 아이콘 모티프');
