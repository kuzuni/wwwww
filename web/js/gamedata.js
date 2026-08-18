// ===== 정적 게임 정의 (시대/등급/장비 카탈로그/스킬/펫 비주얼) =====

const AGES = ['primitive', 'medieval', 'earlyModern', 'modern', 'space',
              'interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];

// 시대 이름은 음차 대신 자연스러운 한글로 (사용자 지시 2026-08-17).
// 그 지시는 표기를 둘로 갈라 놨다 — **디바인 → 천상은 '사용자 확정'**이고, 나머지 음차
// (멀티버스·퀀텀·언더월드)는 "방향만 이렇고 **정확한 표기는 원본 확인 우선**"이었다.
// 그래서 2026-08-18 원본 대조(shot-042950·shot-043117 두 장 모두)로 확정한 표기를 쓴다:
//   항성간 · 다중 우주(띄어쓰기) · 지하 세계(띄어쓰기). 양자는 원본과 이미 일치.
//   divine 만 원본('신성한')과 다르게 '천상'을 유지한다 — 사용자가 확정한 표기라 원본보다 우선.
// 앞 4개(원시적·중세의·근대 초기·현대의)는 2026-08-18 재대조에서 고쳤다. 앞 세션이 '일치'로 판정한 건
// 자동 제련 원본 두 장만 본 결과인데, 그 화면의 유지 시대 목록에는 **앞 시대가 아예 안 나온다** —
// 앞 시대가 보이는 원본은 확률 정보(shot-042831, 10시대 전부)와 장비 목록(shot-042905)이고
// 두 장 모두 `원시적`·`중세의`·`근대 초기`·`현대의`다(3배 확대 대조). 클론은 `원시/중세/근세/현대`였다.
const AGE_KR = {
    primitive: '원시적', medieval: '중세의', earlyModern: '근대 초기', modern: '현대의', space: '우주',
    interstellar: '항성간', multiverse: '다중 우주', quantum: '양자', underworld: '지하 세계', divine: '천상'
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
// ⚠️ 한 시대 안에서 같은 스타일을 두 번 쓰지 말 것 — 스타일이 곧 3D 프리뷰/썸네일 모양이라,
// 겹치면 '모든 장비의 목록'에서 이름만 다르고 그림이 똑같은 장비가 나온다 (사용자 지적 "중복된 거 하지 말라 했던 거").
// 이름과 모양을 맞추되(예: 깃털 모자=plume, 뱀의 화관=crown) 시대별로 전부 다른 실루엣이 되게 배정한다.
const HELMET_STYLES = {
    primitive:    ['hair', 'mask', 'cone', 'visor', 'plume'],
    medieval:     ['visor', 'fin', 'plume', 'crown', 'cone'],
    earlyModern:  ['visor', 'crown', 'plume', 'cone', 'tophat'],
    modern:       ['visor', 'bubble', 'fin', 'tophat', 'crown', 'plume', 'hair'],
    space:        ['bubble', 'tech', 'mask', 'visor', 'fin'],
    interstellar: ['tech', 'bubble', 'mask', 'fin', 'visor', 'crown'],
    multiverse:   ['tech', 'mask', 'visor', 'tophat', 'crown'],
    quantum:      ['tech', 'visor', 'mask', 'hair', 'plume'],
    underworld:   ['fin', 'crown', 'mask', 'visor', 'cone'],
    divine:       ['halo', 'cone', 'crown', 'plume', 'hair'],
};
// 갑옷: hide(가죽) plate(판금+견갑) vest(전술조끼) suit(슈트+백팩) robe(로브) cape(망토)
// 시대당 5종 (원본 카탈로그 2~3종 + 자체 확충)
// 헬멧과 같은 규칙 — 시대 안에서 스타일 중복 금지 (계열이 6종뿐이라 시대당 5개를 겹치지 않게 고른다)
const ARMOR_STYLES = {
    primitive:    ['hide', 'robe', 'plate', 'cape', 'vest'],
    medieval:     ['plate', 'suit', 'vest', 'cape', 'robe'],
    earlyModern:  ['plate', 'robe', 'suit', 'vest', 'cape'],
    modern:       ['vest', 'hide', 'plate', 'cape', 'suit'],
    space:        ['suit', 'plate', 'vest', 'robe', 'cape'],
    interstellar: ['suit', 'plate', 'vest', 'robe', 'cape'],
    multiverse:   ['suit', 'plate', 'robe', 'vest', 'cape'],
    quantum:      ['plate', 'suit', 'robe', 'vest', 'cape'],
    underworld:   ['plate', 'suit', 'cape', 'robe', 'vest'],
    divine:       ['robe', 'plate', 'cape', 'vest', 'suit'],
};

// 장신구류(외형 미반영 5부위): 부위당 3종 변형 — 이름/프리뷰 모델이 다름
// 시대 정체성 반영 (사용자 지시 2026-08-17: "장신구 이름도 시대 테마에 맞게 — 원시=가죽·뼈, 미래=합금·홀로").
// 전 시대가 같은 이름 3종을 돌려쓰던 탓에 원시 시대에 '건틀릿'·'인장 반지'가 나왔다.
// 인덱스 0/1/2는 프리뷰 모델 변형과 정렬돼 있으므로 시대별로 순서를 지킬 것.
const ACC_NAMES_BY_AGE = {
    primitive: {
        gloves:   ['가죽 손싸개', '뼈 손목보호대', '생가죽 랩'],
        necklace: ['뼈 목걸이', '이빨 부적', '조가비 펜던트'],
        ring:     ['뼈 고리', '돌 반지', '나무 고리'],
        shoes:    ['가죽 신', '털가죽 발싸개', '풀 엮은 신'],
        belt:     ['가죽 끈', '사냥꾼 허리띠', '뼈 장식 띠'],
    },
    medieval: {
        gloves:   ['사슬 장갑', '건틀릿', '가죽 장갑'],
        necklace: ['성물 목걸이', '기사단 아뮬렛', '십자 펜던트'],
        ring:     ['인장 반지', '문장 반지', '보석 반지'],
        shoes:    ['사슬 신발', '판금 부츠', '그리브'],
        belt:     ['검대', '전투 벨트', '문장 허리띠'],
    },
    earlyModern: {
        gloves:   ['총사 장갑', '승마 장갑', '레이스 커프스'],
        necklace: ['회중시계 줄', '항해사 목걸이', '카메오 펜던트'],
        ring:     ['귀족 인장 반지', '은 반지', '보석 반지'],
        shoes:    ['버클 구두', '승마 부츠', '각반'],
        belt:     ['탄약 벨트', '장교 허리띠', '장식 새시'],
    },
    modern: {
        gloves:   ['전술 장갑', '방탄 건틀릿', '핸드랩'],
        necklace: ['인식표', '전자 목걸이', '군용 펜던트'],
        ring:     ['티타늄 반지', '부대 반지', '보석 반지'],
        shoes:    ['전투화', '방탄 부츠', '정강이 보호대'],
        belt:     ['전술 벨트', '탄입대 벨트', '장교 벨트'],
    },
    space: {
        gloves:   ['여압 장갑', '합금 건틀릿', '진공 랩'],
        necklace: ['산소 회로 목걸이', '항법 아뮬렛', '궤도 펜던트'],
        ring:     ['합금 반지', '신호 반지', '결정 반지'],
        shoes:    ['자력 부츠', '추진 부츠', '여압 그리브'],
        belt:     ['생명유지 벨트', '공구 벨트', '추진 벨트'],
    },
    interstellar: {
        gloves:   ['플라즈마 건틀릿', '나노 장갑', '중력자 랩'],
        necklace: ['항성 목걸이', '초광속 아뮬렛', '성운 펜던트'],
        ring:     ['아다만티움 반지', '항성 반지', '중력 반지'],
        shoes:    ['관성 부츠', '아다만티움 그리브', '항성 신발'],
        belt:     ['중력 벨트', '워프 벨트', '항성 허리띠'],
    },
    multiverse: {
        gloves:   ['홀로 장갑', '코드 건틀릿', '픽셀 랩'],
        necklace: ['차원 목걸이', '방화벽 아뮬렛', '데이터 펜던트'],
        ring:     ['홀로 반지', '해시 인장 반지', '프리즘 반지'],
        shoes:    ['부팅 부츠', '가상 신발', '렌더 그리브'],
        belt:     ['차원 벨트', '코드 벨트', '픽셀 허리띠'],
    },
    quantum: {
        gloves:   ['파동 장갑', '얽힘의 건틀릿', '입자 랩'],
        necklace: ['얽힘의 목걸이', '중첩 아뮬렛', '위상 펜던트'],
        ring:     ['양자 반지', '스핀 반지', '위상 반지'],
        shoes:    ['위상 부츠', '터널링 신발', '입자 그리브'],
        belt:     ['양자 벨트', '주파수 벨트', '위상 허리띠'],
    },
    underworld: {
        gloves:   ['헬포지드 건틀릿', '망자의 장갑', '용암 랩'],
        necklace: ['원한의 목걸이', '영혼 아뮬렛', '독니 펜던트'],
        ring:     ['저주받은 반지', '망자의 인장', '흑염 반지'],
        shoes:    ['용암 부츠', '망자의 신발', '재의 그리브'],
        belt:     ['사슬 벨트', '지옥불 허리띠', '뼈 장식 벨트'],
    },
    divine: {
        gloves:   ['성흔의 장갑', '천상의 건틀릿', '광휘의 랩'],
        necklace: ['후광 목걸이', '대천사 아뮬렛', '신탁의 펜던트'],
        ring:     ['맹세의 반지', '성인의 인장', '광휘의 반지'],
        shoes:    ['천상의 신발', '성광 부츠', '광휘의 그리브'],
        belt:     ['성대', '팔라딘 벨트', '후광 허리띠'],
    },
};
// 시대 미지정 호출용 기본 이름 (구 세이브·폴백 경로)
const ACC_NAMES = {
    gloves:   ['장갑', '건틀릿', '핸드랩'],
    necklace: ['목걸이', '아뮬렛', '펜던트'],
    ring:     ['반지', '인장 반지', '보석 반지'],
    shoes:    ['신발', '부츠', '그리브'],
    belt:     ['벨트', '전투 벨트', '장식 벨트'],
};
// 시대·부위별 장신구 이름 3종 (표에 없으면 시대 무관 기본 이름)
function accNames(age, slot) {
    const byAge = ACC_NAMES_BY_AGE[age];
    return (byAge && byAge[slot]) || ACC_NAMES[slot] || [SLOT_KR[slot]];
}

function itemStyleOf(item) {
    if (!item) return null;
    const table = item.slot === 'helmet' ? HELMET_STYLES : item.slot === 'armor' ? ARMOR_STYLES : null;
    if (!table) return null;
    const arr = table[item.age];
    return (arr && arr[item.nameIdx]) || (item.slot === 'helmet' ? 'plume' : 'plate');
}

// 장비 이름 — 목록·썸네일은 이름 없이 (부위, 시대, 인덱스)만 넘기므로 표에서 되찾는다.
// 실제 소지품(Forge.roll 산출물)은 item.name 을 이미 들고 있으니 그걸 우선한다.
function itemNameOf(item) {
    if (!item) return '';
    if (item.name) return item.name;
    if (item.slot === 'weapon') return ((WEAPON_TYPES[item.wtype] || {}).kr) || '';
    if (item.slot === 'helmet' || item.slot === 'armor') {
        const arr = (ITEM_NAMES[item.age] || {})[item.slot] || [];
        return arr[item.nameIdx] || '';
    }
    return accNames(item.age, item.slot)[item.nameIdx] || '';
}

// 이름 → 물질(재질) 계열 — 사용자 지시 "장비 디자인 중복 제거 … ③ 이름 정합"
// ('뼈 갑옷'이 돌처럼, '사슬 조끼'가 통판금처럼 보이던 문제. 시대 재질만 쓰면 한 시대 안의
//  다섯 이름이 전부 같은 물질이 돼 '이름만 다른 같은 그림'이 된다.)
// ⚠️ **부분 문자열 검사라 순서가 곧 우선순위다.** 긴·구체적 키워드를 먼저 둘 것 —
//    '항성 목걸이'가 '성'에 걸려 황금이 되면 안 된다(그래서 한 글자 키워드는 쓰지 않는다).
const NAME_SUBSTANCES = [
    ['holo',    ['홀로', '픽셀', '가상', '버추얼', '코드', '데이터', '프리즘', '렌더', '스펙트럴', '해시', '방화벽', '차원']],
    ['lava',    ['용암', '지옥불', '지옥', '헬포지드', '흑염', '화염', '둠']],
    ['ash',     ['재의', '잿', '어둠의', '원한', '저주']],
    ['bone',    ['해골', '뼈', '이빨', '독니', '망자', '로트팽', '조가비', '조개']],
    ['wood',    ['나무', '목재', '풀잎', '풀 엮은', '짚']],
    ['stone',   ['돌', '바위', '석기']],
    ['leather', ['생가죽', '털가죽', '곰가죽', '가죽', '무두', '사냥꾼', '승마', '버클']],
    ['chain',   ['사슬', '체인']],
    ['gold',    ['성스러운', '성광', '성흔', '성인', '성대', '후광', '홀리', '팔라딘', '대천사', '신탁', '광휘', '천상', '맹세', '켈틱', '금장']],
    ['silver',  ['은 ', '은반지', '은 반지', '백금']],
    ['brass',   ['황동', '회중시계', '카메오', '귀족', '장교', '선장', '항해사']],
    ['plate',   ['철판', '판금', '철모', '강철', '퀴레스', '기사 투구', '건틀릿', '그리브']],
    ['energy',  ['플라즈마', '에너지', '파동', '입자', '양자', '얽힘', '중첩', '위상', '스핀', '주파수', '터널링', '델타', '오비터']],
    ['alloy',   ['아다만티움', '티타늄', '합금', '나노', '중력', '워프', '관성', '자력', '추진', '여압', '진공']],
    ['tactical',['케블라', '전술', '방탄', '위장', '탄약', '탄입대', '인식표', '전투화', '특수부대', '진압']],
    // ⚠️ 옷 '모양' 키워드(로브·조끼·코트…)는 **맨 끝** — 물질을 정하는 말이 아니라서
    //    '파동 로브'·'전술 조끼'가 천으로 잡히면 안 된다. 물질 키워드가 다 빗나갔을 때만 천이다.
    ['fabric',  ['로브', '가운', '망토', '새시', '반다나', '두건', '커프스', '레이스', '카디건', '코트', '조끼', '모자', '머리', '수염', '깃털']],
];
function substanceOf(name) {
    if (!name) return null;
    for (const [sub, keys] of NAME_SUBSTANCES) {
        for (const k of keys) if (name.indexOf(k) >= 0) return sub;
    }
    return null;
}

// 무기 타입 — 타입마다 3D 모델·공격 모션이 다름
// impact: 공격 시작 후 데미지 적용 시점(초), range: 공격 가능 거리
// restX: 평상시 오른팔 각도(거치 자세) — 활/총은 항상 앞으로 조준, 근접은 내려 들기
// shape: 3D 지오메트리 계열(Scene3D.makeWeapon의 분기) — 여러 타입이 한 계열을 공유하고 재질·비율로 갈린다
// mat:   재질 계열(stone/bone/steel/blackpowder/gunmetal/energy/holy) — 시대 정체성을 만드는 축
// ⚠️ 실제 등장 시대는 AGE_WEAPONS가 정한다 (사용자 지시 2026-08-17 "원시 시대에 총이 나오면 안 됨").
//    여기 정의됐다고 아무 시대에서나 뽑히지 않는다. 시대 분리 이전 세이브가 들고 있는 타입도
//    렌더는 돼야 하므로 기존 id 10종은 이름·계열만 바뀐 채 전부 살아 있다.
const WEAPON_TYPES = {
    // ── 원시: 돌·나무·뼈 ──
    club:       { kr: '몽둥이',       kind: 'melee',  impact: 0.12, motion: 'slam',   restX: -0.25, shape: 'club',     mat: 'stone' },
    stoneAxe:   { kr: '돌도끼',       kind: 'melee',  impact: 0.10, motion: 'chop',   restX: -0.25, shape: 'axe',      mat: 'stone' },
    stoneSpear: { kr: '돌창',         kind: 'melee',  impact: 0.13, motion: 'thrust', restX: -0.6,  shape: 'spear',    mat: 'stone' },
    boneDagger: { kr: '뼈 단검',      kind: 'melee',  impact: 0.13, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'bone' },
    sling:      { kr: '투석구',       kind: 'ranged', impact: 0.30, motion: 'throw',  restX: -0.45, shape: 'sling',    mat: 'bone' },
    // ── 중세: 단조 강철 ──
    sword:      { kr: '검',           kind: 'melee',  impact: 0.08, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'steel' },
    axe:        { kr: '전투도끼',     kind: 'melee',  impact: 0.10, motion: 'chop',   restX: -0.25, shape: 'axe',      mat: 'steel' },
    spear:      { kr: '창',           kind: 'melee',  impact: 0.13, motion: 'thrust', restX: -0.6,  shape: 'spear',    mat: 'steel' },
    mace:       { kr: '철퇴',         kind: 'melee',  impact: 0.13, motion: 'slam',   restX: -0.25, shape: 'mace',     mat: 'steel' },
    hammer:     { kr: '전투 망치',    kind: 'melee',  impact: 0.13, motion: 'slam',   restX: -0.25, shape: 'hammer',   mat: 'steel' },
    bow:        { kr: '활',           kind: 'ranged', impact: 0.34, motion: 'bow',    restX: -1.35, shape: 'bow',      mat: 'steel' },
    crossbow:   { kr: '석궁',         kind: 'ranged', impact: 0.30, motion: 'bow',    restX: -1.35, shape: 'crossbow', mat: 'steel' },
    // ── 근세: 흑색화약·레이피어 ──
    sabre:      { kr: '사브르',       kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'steel' },
    rapier:     { kr: '레이피어',     kind: 'melee',  impact: 0.12, motion: 'thrust', restX: -0.3,  shape: 'rapier',   mat: 'steel' },
    dagger:     { kr: '단검',         kind: 'melee',  impact: 0.13, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'steel' },
    thrown:     { kr: '투척 도끼',    kind: 'ranged', impact: 0.32, motion: 'throw',  restX: -0.45, shape: 'thrown',   mat: 'steel' },
    musket:     { kr: '머스킷',       kind: 'ranged', impact: 0.26, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'blackpowder' },
    flintlock:  { kr: '플린트락',     kind: 'ranged', impact: 0.22, motion: 'gun',    restX: -1.45, shape: 'pistol',   mat: 'blackpowder' },
    // ── 현대: 화기 ──
    combatKnife:{ kr: '전투 나이프',  kind: 'melee',  impact: 0.12, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'gunmetal' },
    pistol:     { kr: '권총',         kind: 'ranged', impact: 0.16, motion: 'gun',    restX: -1.45, shape: 'pistol',   mat: 'gunmetal' },
    gun:        { kr: '소총',         kind: 'ranged', impact: 0.20, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'gunmetal' },
    shotgun:    { kr: '산탄총',       kind: 'ranged', impact: 0.24, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'gunmetal' },
    smg:        { kr: '기관단총',     kind: 'ranged', impact: 0.14, motion: 'gun',    restX: -1.45, shape: 'smg',      mat: 'gunmetal' },
    // ── 우주: 에너지 무기 등장 ──
    ionBlade:   { kr: '이온 블레이드', kind: 'melee', impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    gravHammer: { kr: '중력 해머',    kind: 'melee',  impact: 0.14, motion: 'slam',   restX: -0.25, shape: 'hammer',   mat: 'energy' },
    laser:      { kr: '레이저 라이플', kind: 'ranged', impact: 0.18, motion: 'gun',   restX: -1.45, shape: 'rifle',    mat: 'energy' },
    plasmaCannon:{ kr: '플라즈마 캐논', kind: 'ranged', impact: 0.28, motion: 'gun',  restX: -1.45, shape: 'cannon',   mat: 'energy' },
    railgun:    { kr: '레일건',       kind: 'ranged', impact: 0.30, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'energy' },
    // ── 성간 ──
    fusionBlade:{ kr: '융합 검',      kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    photonLance:{ kr: '광자 창',      kind: 'melee',  impact: 0.13, motion: 'thrust', restX: -0.6,  shape: 'spear',    mat: 'energy' },
    starHammer: { kr: '항성 망치',    kind: 'melee',  impact: 0.14, motion: 'slam',   restX: -0.25, shape: 'hammer',   mat: 'energy' },
    novaCannon: { kr: '노바 캐논',    kind: 'ranged', impact: 0.30, motion: 'gun',    restX: -1.45, shape: 'cannon',   mat: 'energy' },
    arcThrower: { kr: '아크 방사기',  kind: 'ranged', impact: 0.34, motion: 'cast',   restX: -0.55, shape: 'staff',    mat: 'energy' },
    // ── 다중우주 ──
    realityBlade:{ kr: '현실 절단검', kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    glitchDagger:{ kr: '글리치 단검', kind: 'melee',  impact: 0.12, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'energy' },
    riftLauncher:{ kr: '균열 발사기', kind: 'ranged', impact: 0.30, motion: 'gun',    restX: -1.45, shape: 'cannon',   mat: 'energy' },
    staff:      { kr: '마법 지팡이',  kind: 'ranged', impact: 0.36, motion: 'cast',   restX: -0.55, shape: 'staff',    mat: 'energy' },
    echoBow:    { kr: '메아리 활',    kind: 'ranged', impact: 0.32, motion: 'bow',    restX: -1.35, shape: 'bow',      mat: 'energy' },
    // ── 양자 ──
    waveBlade:  { kr: '파동검',       kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    tunnelDagger:{ kr: '터널링 단검', kind: 'melee',  impact: 0.12, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'energy' },
    collapseHammer:{ kr: '붕괴 망치', kind: 'melee',  impact: 0.14, motion: 'slam',   restX: -0.25, shape: 'hammer',   mat: 'energy' },
    quantumRifle:{ kr: '양자 소총',   kind: 'ranged', impact: 0.20, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'energy' },
    entangleStaff:{ kr: '얽힘의 지팡이', kind: 'ranged', impact: 0.36, motion: 'cast', restX: -0.55, shape: 'staff',   mat: 'energy' },
    // ── 명계 ──
    hellBlade:  { kr: '지옥검',       kind: 'melee',  impact: 0.08, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    soulScythe: { kr: '영혼 낫',      kind: 'melee',  impact: 0.11, motion: 'chop',   restX: -0.25, shape: 'scythe',   mat: 'energy' },
    doomHammer: { kr: '파멸의 망치',  kind: 'melee',  impact: 0.14, motion: 'slam',   restX: -0.25, shape: 'hammer',   mat: 'energy' },
    boneStaff:  { kr: '해골 지팡이',  kind: 'ranged', impact: 0.36, motion: 'cast',   restX: -0.55, shape: 'staff',    mat: 'bone' },
    wraithBow:  { kr: '망령의 활',    kind: 'ranged', impact: 0.32, motion: 'bow',    restX: -1.35, shape: 'bow',      mat: 'energy' },
    // ── 천상: 신성·오라 ──
    holySword:  { kr: '신성한 검',    kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'holy' },
    divineLance:{ kr: '신의 창',      kind: 'melee',  impact: 0.13, motion: 'thrust', restX: -0.6,  shape: 'spear',    mat: 'holy' },
    judgementHammer:{ kr: '심판의 망치', kind: 'melee', impact: 0.14, motion: 'slam', restX: -0.25, shape: 'hammer',   mat: 'holy' },
    auraStaff:  { kr: '오라 지팡이',  kind: 'ranged', impact: 0.36, motion: 'cast',   restX: -0.55, shape: 'staff',    mat: 'holy' },
    seraphBow:  { kr: '세라핌의 활',  kind: 'ranged', impact: 0.32, motion: 'bow',    restX: -1.35, shape: 'bow',      mat: 'holy' },
};

// 시대별 등장 무기 (사용자 지시 2026-08-17) — 뽑기·확률 목록·3D 전부 이 표만 본다.
// 원시·중세에 화약/에너지 무기가 절대 섞이지 않는 것이 이 항목의 핵심 수용 조건.
const AGE_WEAPONS = {
    primitive:    ['club', 'stoneAxe', 'stoneSpear', 'boneDagger', 'sling'],
    medieval:     ['sword', 'axe', 'spear', 'mace', 'hammer', 'bow', 'crossbow'],
    earlyModern:  ['sabre', 'rapier', 'dagger', 'thrown', 'musket', 'flintlock'],
    modern:       ['combatKnife', 'pistol', 'gun', 'shotgun', 'smg'],
    space:        ['ionBlade', 'gravHammer', 'laser', 'plasmaCannon', 'railgun'],
    interstellar: ['fusionBlade', 'photonLance', 'starHammer', 'novaCannon', 'arcThrower'],
    multiverse:   ['realityBlade', 'glitchDagger', 'riftLauncher', 'staff', 'echoBow'],
    quantum:      ['waveBlade', 'tunnelDagger', 'collapseHammer', 'quantumRifle', 'entangleStaff'],
    underworld:   ['hellBlade', 'soulScythe', 'doomHammer', 'boneStaff', 'wraithBow'],
    divine:       ['holySword', 'divineLance', 'judgementHammer', 'auraStaff', 'seraphBow'],
};

// 그 시대에 나올 수 있는 무기 id 목록 (미정의 시대는 중세로 폴백)
function weaponsOfAge(age) { return AGE_WEAPONS[age] || AGE_WEAPONS.medieval; }
// 3D 지오메트리 계열 — 여러 무기 타입이 한 모델 계열을 공유한다
function weaponShape(wtypeId) { const d = WEAPON_TYPES[wtypeId]; return (d && d.shape) || wtypeId; }
// 재질 계열 — 미지정이면 시대로 자동(후반 시대는 에너지)
function weaponMatKind(wtypeId, ageIdx) {
    const d = WEAPON_TYPES[wtypeId];
    if (d && d.mat) return d.mat;
    return (ageIdx || 0) >= 4 ? 'energy' : 'steel';
}

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
    'Oak Leaf': '떡갈나무잎', 'Log Raft': '통나무 뗏목', 'Sheep': '양',
    'Turtle': '거북이', 'Crab': '게', 'Brown Horse': '갈색 말', 'Dino': '공룡', 'Boar': '멧돼지',
    'Pig': '돼지', 'Goat': '염소', 'Camel': '낙타', 'Elk': '큰사슴', 'Panther': '흑표범',
    'Bike': '자전거', 'Giant Bee': '거대 벌', 'Armored Rhino': '장갑 코뿔소',
    'Mini Dragon': '미니 드래곤', 'One-Wheel Droid': '외바퀴 드로이드', 'Mech Spider': '기계 거미',
    'Hover Board': '호버보드', 'Hover Disk': '호버 디스크', 'Star Whale': '별고래',
};
const MOUNT_ICONS = {
    'Brown Leaf': '🍂', 'Lily Leaf': '🍃', 'Lily Pad': '🪷',
    'Oak Leaf': '🌿', 'Log Raft': '🪵', 'Sheep': '🐑',
    'Turtle': '🐢', 'Crab': '🦀', 'Brown Horse': '🐴', 'Dino': '🦕', 'Boar': '🐗',
    'Pig': '🐷', 'Goat': '🐐', 'Camel': '🐫', 'Elk': '🦌', 'Panther': '🐆',
    'Bike': '🚲', 'Giant Bee': '🐝', 'Armored Rhino': '🦏',
    'Mini Dragon': '🐉', 'One-Wheel Droid': '🤖', 'Mech Spider': '🕷',
    'Hover Board': '🛹', 'Hover Disk': '🛸', 'Star Whale': '🐋',
};

// 기능 해금 (원본 스테이지 해금 테이블)
const UNLOCKS = [
    { stage: '2-10', key: 'autoForge', name: '오토 포지' },
];

// 챕터별 배경 테마 (하늘색, 안개색, 바닥색)
// biome: 챕터별 소품 세트(Scene3D.buildProps) — 색만 바뀌는 게 아니라 지형 소재 자체가 바뀜
// celestial: 하늘 천체 ('sun'|'moon'|'none', 생략 시 sun) — 밤 챕터는 달+별
const CHAPTER_THEMES = [
    { sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342, biome: 'forest' },                    // 1 초원
    { sky: 0xffcc80, fog: 0xffe0b2, ground: 0xbca77b, biome: 'desert' },                    // 2 사막
    { sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x6b6157, biome: 'rock' },                      // 3 바위산 (웜 그레이 지면 × 쿨 블루 하늘 — 회색×회색 단색 화면의 hue 분리)
    { sky: 0x4a6572, fog: 0x607d8b, ground: 0x455a64, biome: 'forest' },                    // 4 폭풍
    { sky: 0x263238, fog: 0x37474f, ground: 0x33691e, biome: 'forest', celestial: 'moon' }, // 5 밤 숲
    { sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, biome: 'snow', celestial: 'moon' },   // 6 설원 밤 (눈 고유색 복원 — 남색 지면은 "파란 지형"으로 보였음)
    { sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, biome: 'magic', celestial: 'moon' },  // 7 마법 (지면·하늘을 눌러 크리스탈 발광이 튀게)
    { sky: 0x006064, fog: 0x00838f, ground: 0x00acc1, biome: 'magic', celestial: 'none' },  // 8 심해
    { sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17, biome: 'lava' },                      // 9 용암 (어두운 현무암 + 작열 크랙 — 하늘 대비 지면을 깊게 누름)
    { sky: 0xffd54f, fog: 0xffe082, ground: 0xfff176, biome: 'forest' },                    // 10 천상
];
