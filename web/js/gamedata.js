// ===== 정적 게임 정의 (시대/등급/장비 카탈로그/스킬/펫 비주얼) =====

const AGES = ['primitive', 'medieval', 'earlyModern', 'modern', 'space',
              'interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];

const AGE_KR = {
    primitive: '원시', medieval: '중세', earlyModern: '근세', modern: '현대', space: '우주',
    interstellar: '성간', multiverse: '멀티버스', quantum: '퀀텀', underworld: '언더월드', divine: '디바인'
};

// 시대 색 (UI-SPEC.md:77 실측: 원시적=회백/중세의=하늘/근대 초기=초록/현대의=노랑/우주=빨강/항성간=보라/다중 우주=청록/양자=남색/지하 세계=적갈/신성한=주황, shot-042831.png로 재확인)
const AGE_COLORS = {
    primitive: 0xe0e0e0, medieval: 0x1cafff, earlyModern: 0x1cff41, modern: 0xf8ff1c,
    space: 0xff1c1c, interstellar: 0xaa1cff, multiverse: 0x2dffda, quantum: 0x341cff,
    underworld: 0x6e2f30, divine: 0xff6408
};

const AGE_ICON = {
    primitive: '🪨', medieval: '⚔️', earlyModern: '🏴‍☠️', modern: '🔫', space: '🚀',
    interstellar: '🛸', multiverse: '🌀', quantum: '⚛️', underworld: '🔥', divine: '✨'
};

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];
// 등급 이름·색은 원본 소환 확률 팝업 표기 그대로 (회/파/초/노/빨/보)
const RARITY_KR = { common: '일반', rare: '희귀한', epic: '서사시', legendary: '전설', ultimate: '궁극의', mythic: '신화' };
const RARITY_CSS = { common: '#d6d6d6', rare: '#29b6f6', epic: '#3ddc50', legendary: '#ffe93d', ultimate: '#ff3b30', mythic: '#b23dff' };
const RARITY_HEX = { common: 0xd6d6d6, rare: 0x29b6f6, epic: 0x3ddc50, legendary: 0xffe93d, ultimate: 0xff3b30, mythic: 0xb23dff };
const RARITY_MULT = { common: 1, rare: 1.5, epic: 2.2, legendary: 3.2, ultimate: 4.6, mythic: 6.5 };

// 장비 8부위. 무기/투구/갑옷은 외형에 반영(원본 페이퍼돌 방식)
const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'];
const SLOT_KR = { weapon: '무기', helmet: '투구', armor: '갑옷', gloves: '장갑', necklace: '목걸이', ring: '반지', shoes: '신발', belt: '벨트' };
// 부위별 주스탯: 공격형 4부위 / 체력형 4부위
const SLOT_MAIN = { weapon: 'atk', gloves: 'atk', necklace: 'atk', ring: 'atk', helmet: 'hp', armor: 'hp', shoes: 'hp', belt: 'hp' };

// 원본 에셋에서 추출한 시대별 장비 이름 (투구/갑옷 — 무기는 WEAPON_TYPES에서 타입별로 조립)
const ITEM_NAMES = {
    primitive: {
        helmet: ['수염', '가면', '전투 페인트', '해골 투구', '깃털 장식'],
        armor: ['가죽옷', '곰가죽', '뼈 갑옷', '풀잎 망토', '사냥꾼 조끼']
    },
    medieval: {
        helmet: ['기사 투구', '그리스 투구', '로마 투구', '사무라이 투구', '사신의 모자'],
        armor: ['철판 갑옷', '퀴레스', '사슬 조끼', '기사단 망토', '성직자 로브']
    },
    earlyModern: {
        helmet: ['전투 투구', '선장 모자', '깃털 모자', '슬라브 모자', '톱햇'],
        armor: ['아머 스커트', '기병 카디건', '총사 코트', '항해사 조끼', '귀족 망토']
    },
    modern: {
        helmet: ['케블라 헬멧', '진압 헬멧', '철모', '페도라', '장교 모자', '병장 모자', '겨울 모자'],
        armor: ['케블라', '위장복', '전술 조끼', '방탄 코트', '특수부대 슈트']
    },
    space: {
        helmet: ['우주 헬멧', '바이오 헬멧', '방독면', '아이언 메크', '위성 안테나 헬름'],
        armor: ['우주복', '엑소스켈레톤', '진공 슈트', '추진 슈트', '궤도 망토']
    },
    interstellar: {
        helmet: ['로보 헬름', '에일리언 헤드', '디스트로이어 마스크', '어드밴스드 메크', '헤비듀티', '스텔라리움 헬름'],
        armor: ['플라즈마 슈트', '아다만티움 슈트', '성간 코트', '중력자 로브', '항성 망토']
    },
    multiverse: {
        helmet: ['버추얼 헬멧', '방화벽 마스크', '스토커 헬름', '스피드러너 캡', '픽셀 크라운'],
        armor: ['홀로 아머', '스펙트럴 플레이트', '코드 로브', '가상 슈트', '차원 망토']
    },
    quantum: {
        helmet: ['에너지 헬멧', '얽힘의 헬름', '주파수 마스크', '헤어 반다나', '묶은 머리'],
        armor: ['델타 아머', '오비터 슈트', '파동 로브', '입자 조끼', '양자 망토']
    },
    underworld: {
        helmet: ['헬포지드 헬름', '원한의 왕관', '독니 문장', '로트팽 바이저', '망자의 두건'],
        armor: ['둠 플레이트', '용암 갑주', '어둠의 망토', '지옥 로브', '재의 조끼']
    },
    divine: {
        helmet: ['수호의 후광', '마법사의 모자', '뱀의 화관', '켈틱 오버헤드', '성스러운 백발'],
        armor: ['홀리 가운', '팔라딘 아머', '대천사 망토', '성광 조끼', '신탁의 로브']
    }
};

// 투구/갑옷 이름별 3D 스타일 (ITEM_NAMES 배열과 인덱스 정렬)
// 투구: plume(돔+깃) cone(고깔) tophat(실크햇) visor(풀헬름) fin(볏 투구) mask(가면/방독면)
//       halo(후광) hair(머리카락/수염) crown(왕관) tech(메카) bubble(우주 헬멧)
const HELMET_STYLES = {
    primitive:    ['hair', 'mask', 'mask', 'visor', 'plume'],
    medieval:     ['visor', 'fin', 'fin', 'fin', 'cone'],
    earlyModern:  ['visor', 'tophat', 'plume', 'cone', 'tophat'],
    modern:       ['visor', 'visor', 'visor', 'tophat', 'tophat', 'tophat', 'hair'],
    space:        ['bubble', 'bubble', 'mask', 'tech', 'tech'],
    interstellar: ['tech', 'bubble', 'mask', 'tech', 'visor', 'bubble'],
    multiverse:   ['tech', 'mask', 'visor', 'tophat', 'crown'],
    quantum:      ['tech', 'visor', 'mask', 'hair', 'hair'],
    underworld:   ['fin', 'crown', 'crown', 'visor', 'cone'],
    divine:       ['halo', 'cone', 'crown', 'crown', 'hair'],
};
// 갑옷: hide(가죽) plate(판금+견갑) vest(전술조끼) suit(슈트+백팩) robe(로브) cape(망토)
// 시대당 5종 (원본 카탈로그 2~3종 + 자체 확충)
const ARMOR_STYLES = {
    primitive:    ['hide', 'hide', 'plate', 'cape', 'vest'],
    medieval:     ['plate', 'plate', 'vest', 'cape', 'robe'],
    earlyModern:  ['robe', 'vest', 'robe', 'vest', 'cape'],
    modern:       ['vest', 'vest', 'vest', 'cape', 'suit'],
    space:        ['suit', 'plate', 'suit', 'suit', 'cape'],
    interstellar: ['suit', 'plate', 'vest', 'robe', 'cape'],
    multiverse:   ['suit', 'plate', 'robe', 'suit', 'cape'],
    quantum:      ['plate', 'suit', 'robe', 'vest', 'cape'],
    underworld:   ['plate', 'plate', 'cape', 'robe', 'vest'],
    divine:       ['robe', 'plate', 'cape', 'vest', 'robe'],
};

// 장신구류(외형 미반영 5부위): 부위당 3종 변형 — 이름/프리뷰 모델이 다름
const ACC_NAMES = {
    gloves:   ['장갑', '건틀릿', '핸드랩'],
    necklace: ['목걸이', '아뮬렛', '펜던트'],
    ring:     ['반지', '인장 반지', '보석 반지'],
    shoes:    ['신발', '부츠', '그리브'],
    belt:     ['벨트', '전투 벨트', '장식 벨트'],
};

function itemStyleOf(item) {
    if (!item) return null;
    const table = item.slot === 'helmet' ? HELMET_STYLES : item.slot === 'armor' ? ARMOR_STYLES : null;
    if (!table) return null;
    const arr = table[item.age];
    return (arr && arr[item.nameIdx]) || (item.slot === 'helmet' ? 'plume' : 'plate');
}

// 무기 타입: 근거리 5종 + 원거리 5종 — 타입마다 3D 모델·공격 모션이 다름
// impact: 공격 시작 후 데미지 적용 시점(초), range: 공격 가능 거리
// restX: 평상시 오른팔 각도(거치 자세) — 활/총은 항상 앞으로 조준, 근접은 내려 들기
const WEAPON_TYPES = {
    sword:    { kr: '검',        kind: 'melee',  impact: 0.16, motion: 'slash',  restX: -0.25 },
    axe:      { kr: '도끼',      kind: 'melee',  impact: 0.20, motion: 'chop',   restX: -0.25 },
    spear:    { kr: '창',        kind: 'melee',  impact: 0.16, motion: 'thrust', restX: -0.6 },
    hammer:   { kr: '해머',      kind: 'melee',  impact: 0.22, motion: 'slam',   restX: -0.25 },
    dagger:   { kr: '단검',      kind: 'melee',  impact: 0.13, motion: 'double', restX: -0.25 },
    bow:      { kr: '활',        kind: 'ranged', impact: 0.34, motion: 'bow',    restX: -1.35 },
    crossbow: { kr: '석궁',      kind: 'ranged', impact: 0.30, motion: 'bow',    restX: -1.35 },
    gun:      { kr: '총',        kind: 'ranged', impact: 0.20, motion: 'gun',    restX: -1.45 },
    staff:    { kr: '마법 지팡이', kind: 'ranged', impact: 0.36, motion: 'cast',  restX: -0.55 },
    thrown:   { kr: '투척 도끼',  kind: 'ranged', impact: 0.32, motion: 'throw',  restX: -0.45 },
};

// 서브스탯 풀: 원본 13종 (UI-SPEC 21~24번 '장비 상세' 팝업 확인) — [키, 표시명, 등급별 최대치(%)]
// 등급별 최대치는 원본 개별 수치 미확보로 기존 methodology(공/체% 커브 비율)를 그대로 적용해 스펙의 전체 범위(1~X%)에 맞춰 자체 설계.
// value = rand(cap×0.4, cap) → common 등급도 대략 스펙 하한(1%대)에 근접.
// 서브스탯 풀 13종 (장비·펫·탈것 공용) — 원본 '장비 상세 팝업' 표기 그대로.
// 굴림 범위는 등급과 무관하게 항상 +1% ~ 최대치이며(스킬 쿨감만 -1% ~ -7%),
// 등급이 정하는 것은 값이 아니라 '몇 개를 굴리는가'다. [키, 이름, 최대치]
const SUBSTAT_MIN = 1;
const SUBSTATS = [
    ['critCh',    '치명타 확률',            12],
    ['critDmg',   '치명타 피해',            80],
    ['block',     '블록 확률',              5],
    ['hpRegen',   '체력 재생',              4],
    ['lifesteal', '생명력 흡수',            20],
    ['dblAtk',    '더블 찬스',              20],
    ['dmgPct',    '피해',                   15],
    ['meleeDmg',  '근접 피해',              50],
    ['rangedDmg', '원거리 피해',            15],
    ['atkSpd',    '공격 속도',              40],
    ['skillDmg',  '스킬 피해',              30],
    ['skillCd',   '스킬 재사용 대기시간',   7], // 값은 감소량(양수 저장) — 표기 시 '-'
    ['hpPct',     '체력',                   15],
];

// ===== 스킬 정의 (등급별 3종: 광역/단일/유틸) =====
// type: aoe(광역) | single(단일) | heal(회복) | buff(버프)
const SKILL_DEFS = [
    { id: 'powerStrike', name: '강타',           rarity: 'common',    type: 'single', mult: 3.0,  cd: 6,  fx: 'slash',    color: '#cfd8dc' },
    { id: 'whirlwind',   name: '회오리 베기',     rarity: 'common',    type: 'aoe',    mult: 1.6,  cd: 9,  fx: 'ring',     color: '#b0bec5' },
    { id: 'firstAid',    name: '응급 처치',       rarity: 'common',    type: 'heal',   healPct: 0.18, cd: 14, fx: 'heal',  color: '#a5d6a7' },
    { id: 'fireball',    name: '화염구',          rarity: 'rare',      type: 'aoe',    mult: 2.4,  cd: 10, fx: 'explode',  color: '#ff8a65' },
    { id: 'pierceShot',  name: '관통 사격',       rarity: 'rare',      type: 'single', mult: 4.5,  cd: 7,  fx: 'beam',     color: '#81d4fa' },
    { id: 'warCry',      name: '전투의 함성',     rarity: 'rare',      type: 'buff',   buff: { atkPct: 15 }, dur: 8, cd: 18, fx: 'aura', color: '#ffcc80' },
    { id: 'meteor',      name: '메테오',          rarity: 'epic',      type: 'aoe',    mult: 4.0,  cd: 13, fx: 'meteor',   color: '#ff7043' },
    { id: 'lightning',   name: '낙뢰',            rarity: 'epic',      type: 'single', mult: 7.0,  cd: 9,  fx: 'bolt',     color: '#fff176' },
    { id: 'blessing',    name: '축복',            rarity: 'epic',      type: 'heal',   healPct: 0.35, cd: 16, fx: 'heal',  color: '#80cbc4' },
    { id: 'dragonBreath', name: '용의 숨결',      rarity: 'legendary', type: 'aoe',    mult: 6.5,  cd: 15, fx: 'breath',   color: '#ba68c8' },
    { id: 'execution',   name: '처형',            rarity: 'legendary', type: 'single', mult: 11.0, cd: 11, fx: 'slash',    color: '#e57373' },
    { id: 'sanctuary',   name: '성역',            rarity: 'legendary', type: 'buff',   buff: { atkSpd: 30 }, dur: 8, cd: 20, fx: 'aura', color: '#ce93d8' },
    { id: 'supernova',   name: '초신성',          rarity: 'ultimate',  type: 'aoe',    mult: 10.0, cd: 17, fx: 'explode',  color: '#ffb74d' },
    { id: 'voidLance',   name: '공허의 창',       rarity: 'ultimate',  type: 'single', mult: 18.0, cd: 12, fx: 'beam',     color: '#9575cd' },
    { id: 'timeWarp',    name: '시간 왜곡',       rarity: 'ultimate',  type: 'buff',   buff: { atkSpd: 50 }, dur: 10, cd: 24, fx: 'aura', color: '#4dd0e1' },
    { id: 'apocalypse',  name: '아포칼립스',      rarity: 'mythic',    type: 'aoe',    mult: 18.0, cd: 20, fx: 'meteor',   color: '#ef5350' },
    { id: 'godspear',    name: '신의 창',         rarity: 'mythic',    type: 'single', mult: 32.0, cd: 14, fx: 'bolt',     color: '#ffd54f' },
    { id: 'divineShield', name: '신성한 가호',    rarity: 'mythic',    type: 'heal',   healPct: 0.7, cd: 22, fx: 'heal',   color: '#fff59d' },
];

// 스킬 고정 데미지·패시브 등급별 기준치 (원본 개별 계수 미확보 → 자체 설계, BALANCE.md 참고)
// 데미지 = 기준치 × 스킬의 mult(등급 내 상대 위력) × 레벨 배율. 패시브는 장착만 해도 상시 적용.
const SKILL_BASE_DMG = { common: 40, rare: 200, epic: 1000, legendary: 5000, ultimate: 25000, mythic: 125000 };
const SKILL_BASE_PASSIVE = {
    common:    { atk: 5,    hp: 30 },
    rare:      { atk: 20,   hp: 150 },
    epic:      { atk: 80,   hp: 700 },
    legendary: { atk: 350,  hp: 3000 },
    ultimate:  { atk: 1500, hp: 15000 },
    mythic:    { atk: 7000, hp: 70000 },
};

// 스킬/펫 아이콘 (이모지 프리뷰)
const SKILL_ICONS = {
    powerStrike: '⚔️', whirlwind: '🌀', firstAid: '💊',
    fireball: '🔥', pierceShot: '🏹', warCry: '📣',
    meteor: '☄️', lightning: '⚡', blessing: '✨',
    dragonBreath: '🐉', execution: '🪓', sanctuary: '🛡️',
    supernova: '💥', voidLance: '🔱', timeWarp: '⏳',
    apocalypse: '🌋', godspear: '🌩️', divineShield: '😇',
};

const PET_ICONS = {
    'Snail': '🐌', 'Turtle': '🐢', 'Mouse': '🐭', 'Chicken': '🐔', 'Cat': '🐱', 'Dog': '🐶',
    'Hedgehog': '🦔', 'Bear': '🐻', 'Ostrich': '🦃', 'Scorpion': '🦂', 'Spider': '🕷️',
    'Panda': '🐼', 'Griffin': '🦅', 'Unicorn': '🦄', 'Saber Tooth': '🐯', 'Tiger': '🐅',
    'Cerberus': '🐺', 'Kitsune': '🦊', 'Serpent': '🐍',
    'Treant': '🌳', 'Enchanted Elk': '🦌', 'Electry': '⚡',
    'Genie': '🧞', 'Baby Dragon': '🐲', 'Spectral Tiger': '👻',
};

// 펫 이름 한글화 + 비주얼 (색상/형태)
const PET_KR = {
    'Snail': '달팽이', 'Turtle': '거북이', 'Mouse': '생쥐', 'Chicken': '닭', 'Cat': '고양이', 'Dog': '강아지',
    'Hedgehog': '고슴도치', 'Bear': '곰', 'Ostrich': '타조', 'Scorpion': '전갈', 'Spider': '거미',
    'Panda': '판다', 'Griffin': '그리핀', 'Unicorn': '유니콘', 'Saber Tooth': '검치호', 'Tiger': '호랑이',
    'Cerberus': '케르베로스', 'Kitsune': '구미호', 'Serpent': '서펀트',
    'Treant': '트렌트', 'Enchanted Elk': '마법 사슴', 'Electry': '일렉트리',
    'Genie': '지니', 'Baby Dragon': '아기 드래곤', 'Spectral Tiger': '유령 호랑이'
};

const PET_COLORS = {
    'Snail': 0xffcc80, 'Turtle': 0x81c784, 'Mouse': 0xbdbdbd, 'Chicken': 0xfff176, 'Cat': 0xffab91, 'Dog': 0xbcaaa4,
    'Hedgehog': 0x8d6e63, 'Bear': 0x795548, 'Ostrich': 0xe0e0e0, 'Scorpion': 0xef9a9a, 'Spider': 0x616161,
    'Panda': 0xeeeeee, 'Griffin': 0xffe082, 'Unicorn': 0xf8bbd0, 'Saber Tooth': 0xffcc80, 'Tiger': 0xffb74d,
    'Cerberus': 0x8e24aa, 'Kitsune': 0xff8a65, 'Serpent': 0x4db6ac,
    'Treant': 0x66bb6a, 'Enchanted Elk': 0x90caf9, 'Electry': 0xfff59d,
    'Genie': 0x7e57c2, 'Baby Dragon': 0xef5350, 'Spectral Tiger': 0x80deea
};

// 펫 종별 모션 파라미터: freq(속도) amp(진폭) hop(총총) sway(좌우 기울기) yaw(몸 좌우 회전) pitch(앞뒤 끄덕)
const PET_MOTION = {
    'Snail': { freq: 1.2, amp: 0.015, sway: 0.04 },
    'Turtle': { freq: 2, amp: 0.03, sway: 0.05 },
    'Mouse': { freq: 10, amp: 0.06, hop: 1 },
    'Chicken': { freq: 8, amp: 0.05, hop: 1, pitch: 0.15 },
    'Cat': { freq: 3, amp: 0.05, sway: 0.03 },
    'Dog': { freq: 6, amp: 0.07, hop: 1 },
    'Hedgehog': { freq: 7, amp: 0.04, hop: 1, sway: 0.12 },
    'Bear': { freq: 2, amp: 0.04, sway: 0.08 },
    'Ostrich': { freq: 5, amp: 0.09, hop: 1, pitch: 0.1 },
    'Scorpion': { freq: 2.5, amp: 0.02, sway: 0.03 },
    'Spider': { freq: 14, amp: 0.03, hop: 1 },
    'Panda': { freq: 1.8, amp: 0.04, sway: 0.1 },
    'Griffin': { freq: 3, amp: 0.12 },
    'Unicorn': { freq: 4.5, amp: 0.09, hop: 1, pitch: 0.08 },
    'Saber Tooth': { freq: 3.4, amp: 0.06, pitch: 0.04 },
    'Tiger': { freq: 3.2, amp: 0.06, pitch: 0.05 },
    'Cerberus': { freq: 4, amp: 0.05, sway: 0.04 },
    'Kitsune': { freq: 3, amp: 0.07 },
    'Serpent': { freq: 2.2, amp: 0.03, yaw: 0.35 },
    'Treant': { freq: 1.2, amp: 0.02, sway: 0.06 },
    'Enchanted Elk': { freq: 4, amp: 0.08, hop: 1 },
    'Electry': { freq: 18, amp: 0.05, sway: 0.15 },
    'Genie': { freq: 1.6, amp: 0.12, yaw: 0.15 },
    'Baby Dragon': { freq: 3.5, amp: 0.13 },
    'Spectral Tiger': { freq: 2.6, amp: 0.07, yaw: 0.1 },
};

// 마운트 이름 한글화 + 아이콘(이모지 프리뷰)
const MOUNT_KR = {
    'Brown Leaf': '갈색 나뭇잎', 'Lily Leaf': '수련잎', 'Lily Pad': '연잎',
    'Turtle': '거북이', 'Crab': '게', 'Brown Horse': '갈색 말', 'Dino': '공룡',
    'Pig': '돼지', 'Goat': '염소',
    'Bike': '자전거', 'Giant Bee': '거대 벌',
    'Mini Dragon': '미니 드래곤', 'One-Wheel Droid': '외바퀴 드로이드',
    'Hover Board': '호버보드', 'Hover Disk': '호버 디스크',
};
const MOUNT_ICONS = {
    'Brown Leaf': '🍂', 'Lily Leaf': '🍃', 'Lily Pad': '🪷',
    'Turtle': '🐢', 'Crab': '🦀', 'Brown Horse': '🐴', 'Dino': '🦕',
    'Pig': '🐷', 'Goat': '🐐',
    'Bike': '🚲', 'Giant Bee': '🐝',
    'Mini Dragon': '🐉', 'One-Wheel Droid': '🤖',
    'Hover Board': '🛹', 'Hover Disk': '🛸',
};

// 기능 해금 (원본 스테이지 해금 테이블)
const UNLOCKS = [
    { stage: '2-10', key: 'autoForge', name: '오토 포지' },
];

// 챕터별 배경 테마 (하늘색, 안개색, 바닥색)
const CHAPTER_THEMES = [
    { sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 }, // 1 초원
    { sky: 0xffcc80, fog: 0xffe0b2, ground: 0xbca77b }, // 2 사막
    { sky: 0x90a4ae, fog: 0xb0bec5, ground: 0x78909c }, // 3 바위산
    { sky: 0x4a6572, fog: 0x607d8b, ground: 0x455a64 }, // 4 폭풍
    { sky: 0x263238, fog: 0x37474f, ground: 0x33691e }, // 5 밤 숲
    { sky: 0x1a237e, fog: 0x283593, ground: 0x3949ab }, // 6 설원 밤
    { sky: 0x4527a0, fog: 0x512da8, ground: 0x5e35b1 }, // 7 마법
    { sky: 0x006064, fog: 0x00838f, ground: 0x00acc1 }, // 8 심해
    { sky: 0xbf360c, fog: 0xd84315, ground: 0x6d4c41 }, // 9 용암
    { sky: 0xffd54f, fog: 0xffe082, ground: 0xfff176 }, // 10 천상
];
