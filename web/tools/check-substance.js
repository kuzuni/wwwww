// 이름 → 물질 매핑 로직 검사 (브라우저 없이) — 사용: node check-substance.js
// ① 이름이 가리키는 물질로 실제 매핑되는가 ② 부분 문자열 오탐이 없는가('항성'이 금이 되면 안 됨)
// ③ 한 시대·부위 안에서 이름들이 서로 다른 물질로 갈리는가(= 목록에서 같은 그림이 안 나오는가)
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '../js/gamedata.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
// ⚠️ vm 안의 최상위 const/let 은 컨텍스트 객체에 **안 붙는다**(함수 선언만 붙는다).
//    AGES·ITEM_NAMES 같은 const 는 식으로 꺼내야 한다.
const pull = expr => vm.runInContext(expr, ctx);
const substanceOf = pull('substanceOf'), itemNameOf = pull('itemNameOf');
const AGES = pull('AGES'), ITEM_NAMES = pull('ITEM_NAMES'), accNames = pull('accNames');

let fail = 0;
const eq = (name, want) => {
    const got = substanceOf(name);
    const ok = got === want;
    if (!ok) { fail++; console.log(`  ✗ "${name}" → ${got} (기대 ${want})`); }
    return ok;
};
console.log('[1] 이름 → 물질');
eq('뼈 갑옷', 'bone'); eq('해골 투구', 'bone'); eq('이빨 부적', 'bone'); eq('망자의 신발', 'bone');
eq('사슬 조끼', 'chain'); eq('사슬 벨트', 'chain');
eq('철판 갑옷', 'plate'); eq('퀴레스', 'plate'); eq('건틀릿', 'plate');
eq('가죽옷', 'leather'); eq('곰가죽', 'leather'); eq('생가죽 랩', 'leather');
eq('돌 반지', 'stone'); eq('나무 고리', 'wood'); eq('풀잎 망토', 'wood');
eq('용암 갑주', 'lava'); eq('지옥 로브', 'lava'); eq('재의 조끼', 'ash');
eq('홀리 가운', 'gold'); eq('팔라딘 아머', 'gold'); eq('후광 목걸이', 'gold');
eq('홀로 아머', 'holo'); eq('픽셀 크라운', 'holo'); eq('코드 로브', 'holo');
eq('파동 로브', 'energy'); eq('양자 반지', 'energy');
eq('케블라', 'tactical'); eq('전술 조끼', 'tactical');
eq('아다만티움 슈트', 'alloy'); eq('진공 슈트', 'alloy');
eq('성직자 로브', 'fabric'); eq('깃털 모자', 'fabric');

console.log('[2] 부분 문자열 오탐 — 금이 되면 안 되는 이름');
for (const n of ['항성 목걸이', '항성 반지', '성간 코트', '초광속 아뮬렛', '성운 펜던트', '항성 신발', '항성 허리띠', '성물 목걸이']) {
    const got = substanceOf(n);
    if (got === 'gold') { fail++; console.log(`  ✗ "${n}" → gold (별·성물인데 황금으로 오탐)`); }
}

console.log('[3] 시대·부위 안 물질 분화 (같은 물질만 나오면 그림이 겹친다)');
let flatGroups = 0, groups = 0;
for (const age of AGES) {
    for (const slot of ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt']) {
        const names = (slot === 'helmet' || slot === 'armor')
            ? ((ITEM_NAMES[age] || {})[slot] || []) : accNames(age, slot);
        if (names.length < 2) continue;
        groups++;
        const subs = new Set(names.map(n => substanceOf(n) || 'age'));
        if (subs.size === 1) {
            flatGroups++;
            console.log(`  · ${age}/${slot}: 전원 ${[...subs][0]} — ${names.join(', ')}`);
        }
    }
}
console.log(`  묶음 ${groups}개 중 물질이 하나뿐인 묶음 ${flatGroups}개`);

console.log('[4] itemNameOf 역인출 (목록은 이름 없이 인덱스만 넘긴다)');
const t1 = itemNameOf({ slot: 'armor', age: 'primitive', nameIdx: 2 });
if (t1 !== '뼈 갑옷') { fail++; console.log(`  ✗ armor/primitive/2 → "${t1}" (기대 "뼈 갑옷")`); }
const t2 = itemNameOf({ slot: 'ring', age: 'primitive', nameIdx: 1 });
if (t2 !== '돌 반지') { fail++; console.log(`  ✗ ring/primitive/1 → "${t2}" (기대 "돌 반지")`); }
const t3 = itemNameOf({ slot: 'weapon', wtype: 'boneDagger' });
if (t3 !== '뼈 단검') { fail++; console.log(`  ✗ weapon/boneDagger → "${t3}" (기대 "뼈 단검")`); }
const t4 = itemNameOf({ name: '곰가죽', slot: 'armor', age: 'primitive', nameIdx: 1 });
if (t4 !== '곰가죽') { fail++; console.log(`  ✗ item.name 우선 실패 → "${t4}"`); }

console.log(fail === 0 ? '\n전부 통과' : `\n실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
