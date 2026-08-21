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
// 원본 소환 확률 팝업(shot-042521)의 막대를 x=200 세로 스캔해 그대로 옮긴 값이다.
// 6색이 전부 **한 채널이 0x1c** 로 떨어지는 규칙적인 팔레트라 눈대중이 아니라 실측이 맞다
// (교체 전 클론값은 채널마다 10~30 어긋나 있었다: d6d6d6 / 29b6f6 / 3ddc50 / ffe93d / ff3b30 / b23dff).
// ⚠️ 파생색(구체 그라디언트·흰 카드용 잉크·펫 타일 면)은 전부 이 값에서 **런타임 계산**되므로
//    여기만 바꾸면 따라 움직인다 — 파생색을 따로 박아 두지 말 것.
const RARITY_CSS = { common: '#e0e0e0', rare: '#1cafff', epic: '#1cff41', legendary: '#f8ff1c', ultimate: '#ff1c1c', mythic: '#aa1cff' };
// 🚨 **이 표는 위 `RARITY_CSS` 와 지금 값이 다르다 — 의도된 미완이다.**
// `RARITY_CSS` 는 2026-08-18 `rarity-css-exact` 에서 원본 실측값으로 교체했는데, 이 `RARITY_HEX` 는
// `prochar.js`·`scene3d.js` 의 **three.js 재질색으로만** 쓰여 조명·이미시브가 얹힌 화면값이 달라진다.
// UI 스트림이 3D 재질을 임의로 흔들지 않으려고 **일부러 안 맞췄다.** 3D 스트림이 판단해 맞출 것
// (맞춘다면 emissive 가 함께 걸린 자리라 밝기 재확인이 필요하다 — TODO `rarity-css-exact` 메모 참조).
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
        // ⚠️ 투구 3종은 2026-08-19 에 천상 테마로 갈았다(`equip-era-theming`, 사용자 지시 "이름도 그렇고").
        //    옛 이름 `마법사의 모자`·`뱀의 화관`·`켈틱 오버헤드` 는 천상과 무관했다(마법사·뱀은 오히려 반대).
        //    ref/screens 어디에도 이 이름들이 안 나와(원본 목록 화면 shot-042905 는 아이콘만 있고 이름이 없다)
        //    원본 카탈로그가 아니라 자체 확충분으로 판단했다. **스타일 매핑(cone/crown/plume)은 그대로**라
        //    3D 실루엣은 안 움직인다. 새 이름은 `NAME_SUBSTANCES` 의 금 키워드(성광·대천사·광휘)에 걸리게
        //    골라서 시대 팔레트(금)로 수렴시켰다 — 옛 이름 중 둘은 키워드에 안 걸려 분홍·갈색으로 떴다.
        //    ('켈틱' 키워드는 구세이브가 든 옛 이름을 위해 NAME_SUBSTANCES 에 남겨 뒀다.)
        helmet: ['수호의 후광', '성광 주교관', '대천사의 관', '광휘의 깃', '성스러운 백발'],
        armor: ['홀리 가운', '팔라딘 아머', '대천사 망토', '성광 조끼', '신탁의 로브']
    }
};

// 투구/갑옷 이름별 3D 스타일 (ITEM_NAMES 배열과 인덱스 정렬)
// 투구: plume(돔+깃) cone(고깔) tophat(실크햇) visor(풀헬름) fin(볏 투구) mask(가면/방독면)
//       halo(후광) hair(머리카락/수염) crown(왕관) tech(메카) bubble(우주 헬멧)
//       skull(짐승 두개골 — 주둥이·눈구멍·광대활·이빨, 원시 전용)
//       sealed(밀폐 여압 투구 — 목 개스킷 칼라+걸쇠 3개+넓은 전면창+턱 레귤레이터, 현대~양자 전용)
// 🚨 갑옷 표와 같은 규칙 — 시대에 안 맞는 조형을 배정하지 말 것(equip-era-theming).
//    원시 '해골 투구'가 `visor`(중세 기사 풀헬름)였다 → `skull` 로 교체했다.
//    같은 이유로 **현대·우주·성간·다중 우주·양자 다섯 시대의 `visor` 를 `sealed` 로 옮겼다** —
//    합금 재질이라 덜 튀었을 뿐 조형은 중세 풀헬름 그대로였다. `visor` 가 남는 곳은 판금 투구가
//    실제로 그 시대의 언어인 **중세·근대 초기·지하 세계** 셋뿐이다.
//    시대 집합은 갑옷의 `Scene3D.SUIT_SEALED` 와 **일부러 같게** 뒀다(투구+갑옷이 한 벌).
// 🚨 `fin` 은 이제 **시대마다 조형이 갈리는 계열**이다(`Scene3D.FIN_VARIANT`):
//    galea(중세 그리스 투구) / combat(현대 철모 M1) / antenna(우주 위성 안테나 헬름) /
//    mech(항성간 어드밴스드 메크) / hellforged(지하 헬포지드 헬름).
//    새 시대에 `fin` 을 배정하면 `FIN_VARIANT` 에도 한 줄 적을 것 — 안 적으면 조용히
//    로마 갈레아로 떨어져 그 시대에 또 '중세 볏 투구'가 생긴다(이 항목의 원래 결함 그대로).
// ⚠️ 한 시대 안에서 같은 스타일을 두 번 쓰지 말 것 — 스타일이 곧 3D 프리뷰/썸네일 모양이라,
// 겹치면 '모든 장비의 목록'에서 이름만 다르고 그림이 똑같은 장비가 나온다 (사용자 지적 "중복된 거 하지 말라 했던 거").
// 이름과 모양을 맞추되(예: 깃털 모자=plume, 뱀의 화관=crown) 시대별로 전부 다른 실루엣이 되게 배정한다.
const HELMET_STYLES = {
    primitive:    ['hair', 'mask', 'cone', 'skull', 'plume'],   // 수염·가면·전투 페인트·해골 투구·깃털 장식 (visor=기사 풀헬름 제거)
    medieval:     ['visor', 'fin', 'plume', 'crown', 'cone'],
    earlyModern:  ['visor', 'crown', 'plume', 'cone', 'tophat'],
    modern:       ['sealed', 'bubble', 'fin', 'tophat', 'crown', 'plume', 'hair'],
    space:        ['bubble', 'tech', 'mask', 'sealed', 'fin'],
    interstellar: ['tech', 'bubble', 'mask', 'fin', 'sealed', 'crown'],
    multiverse:   ['tech', 'mask', 'sealed', 'tophat', 'crown'],
    quantum:      ['tech', 'sealed', 'mask', 'hair', 'plume'],
    underworld:   ['fin', 'crown', 'mask', 'visor', 'cone'],
    divine:       ['halo', 'cone', 'crown', 'plume', 'hair'],
};
// 갑옷: hide(가죽) plate(판금+견갑) vest(전술조끼) suit(슈트+백팩) robe(로브) cape(망토)
//       bone(뼈 갑주 — 늑골 아치+견갑골 판+가죽끈, 원시 전용)
//       exo(외골격 — 어깨 짐벌 링+옆구리 액추에이터+동력 코어, 우주 이후 전용)
//       carrier(플레이트 캐리어 — 평판 하드플레이트+MOLLE 웨빙+어깨 요크+커머번드, 현대 전용)
//       vestment(제의 — 어깨 케이프(모제타)+스톨 2줄+종 소매+금 헴, 천상 전용)
// 시대당 5종 (원본 카탈로그 2~3종 + 자체 확충)
// 헬멧과 같은 규칙 — 시대 안에서 스타일 중복 금지 (계열이 8종뿐이라 시대당 5개를 겹치지 않게 고른다)
// 🚨 **시대에 안 맞는 조형을 배정하지 말 것 (equip-era-theming, 사용자 지시 2026-08-19).**
//    스타일이 곧 3D 조형이라, 이름이 '뼈 갑옷'이어도 style 이 'plate' 면 화면에는 **중세 판금 흉갑**
//    (라멜라 파울드론·파울드·리벳)이 나온다. 실제로 원시 시대 3번 칸이 그랬고, 그게 사용자 지적
//    "원시 장비가 원시 장비 같지 않다 / 전부 중세 같은 디자인임"의 가장 직접적인 실물이었다.
//    → `plate` 는 **판금이 실제로 그 시대의 언어인 시대에만** 준다(중세·근대 초기·지하 세계·다중 우주·천상).
//    같은 이유로 우주·성간·양자의 '엑소스켈레톤/아다만티움 슈트/델타 아머'는 `exo`(외골격)로 옮겼다.
//    현대 '전술 조끼'는 `carrier`(플레이트 캐리어)로 옮겼다 — 같은 '판'이라도 곡면 흉갑이 아니라
//    평판 하드플레이트 + 가로 웨빙이라 조형 언어가 판금과 정반대다.
const ARMOR_STYLES = {
    primitive:    ['hide', 'robe', 'bone', 'cape', 'vest'],   // 가죽옷·곰가죽·뼈 갑옷·풀잎 망토·사냥꾼 조끼 (plate 제거)
    medieval:     ['plate', 'suit', 'vest', 'cape', 'robe'],
    earlyModern:  ['plate', 'robe', 'suit', 'vest', 'cape'],
    modern:       ['vest', 'hide', 'carrier', 'cape', 'suit'],  // 케블라·위장복·전술 조끼·방탄 코트·특수부대 슈트 (plate 제거)
    space:        ['suit', 'exo', 'vest', 'robe', 'cape'],     // 우주복·엑소스켈레톤·진공 슈트·추진 슈트·궤도 망토 (plate 제거)
    interstellar: ['suit', 'exo', 'vest', 'robe', 'cape'],     // 플라즈마 슈트·아다만티움 슈트·성간 코트·중력자 로브·항성 망토
    multiverse:   ['suit', 'plate', 'robe', 'vest', 'cape'],
    quantum:      ['exo', 'suit', 'robe', 'vest', 'cape'],     // 델타 아머·오비터 슈트·파동 로브·입자 조끼·양자 망토
    underworld:   ['plate', 'suit', 'cape', 'robe', 'vest'],
    divine:       ['robe', 'plate', 'cape', 'vest', 'vestment'], // 홀리 가운·팔라딘 아머·대천사 망토·성광 조끼·신탁의 로브 (suit=기밀복/퀴레스 제거)
};

// 장신구류(외형 미반영 5부위): 부위당 3종 변형 — 이름/프리뷰 모델이 다름
// 시대 정체성 반영 (사용자 지시 2026-08-17: "장신구 이름도 시대 테마에 맞게 — 원시=가죽·뼈, 미래=합금·홀로").
// 전 시대가 같은 이름 3종을 돌려쓰던 탓에 원시 시대에 '건틀릿'·'인장 반지'가 나왔다.
// 인덱스 0~4는 프리뷰 모델 변형과 정렬돼 있으므로 시대별로 순서를 지킬 것
// (0 기본 / 1 중장 / 2 랩·새시류 / 3 브레이서·로켓·쌍줄·샌들·이중띠 / 4 너클·초커·왕관·장화·장식판 — equip-build-acc 2026-08-21 확장).
const ACC_NAMES_BY_AGE = {
    primitive: {
        gloves:   ['가죽 손싸개', '뼈 손목보호대', '생가죽 랩', '나무껍질 브레이서', '돌 너클'],
        necklace: ['뼈 목걸이', '이빨 부적', '조가비 펜던트', '호박 부적함', '엄니 초커'],
        ring:     ['뼈 고리', '돌 반지', '나무 고리', '덩굴 쌍고리', '족장의 뿔반지'],
        shoes:    ['가죽 신', '털가죽 발싸개', '풀 엮은 신', '엮은 샌들', '털가죽 장화'],
        belt:     ['가죽 끈', '사냥꾼 허리띠', '뼈 장식 띠', '이중 사냥끈', '조개 장식판 띠'],
    },
    medieval: {
        gloves:   ['사슬 장갑', '건틀릿', '가죽 장갑', '강철 브레이서', '철 너클'],
        necklace: ['성물 목걸이', '기사단 아뮬렛', '십자 펜던트', '성유물함', '사슬 초커'],
        ring:     ['인장 반지', '문장 반지', '보석 반지', '쌍고리 반지', '왕관 반지'],
        shoes:    ['사슬 신발', '판금 부츠', '그리브', '순례자 샌들', '기사 장화'],
        belt:     ['검대', '전투 벨트', '문장 허리띠', '이중 검대', '판금 장식대'],
    },
    earlyModern: {
        gloves:   ['총사 장갑', '승마 장갑', '레이스 커프스', '펜싱 브레이서', '결투 너클'],
        necklace: ['회중시계 줄', '항해사 목걸이', '카메오 펜던트', '로켓 펜던트', '진주 초커'],
        ring:     ['귀족 인장 반지', '은 반지', '보석 반지', '쌍줄 은반지', '제독의 반지'],
        shoes:    ['버클 구두', '승마 부츠', '각반', '갑판 샌들', '기병 장화'],
        belt:     ['탄약 벨트', '장교 허리띠', '장식 새시', '이중 탄띠', '금장 판벨트'],
    },
    modern: {
        gloves:   ['전술 장갑', '방탄 건틀릿', '핸드랩', '전술 브레이서', '너클 가드'],
        necklace: ['인식표', '전자 목걸이', '군용 펜던트', '위성 로켓', '전술 초커'],
        ring:     ['티타늄 반지', '부대 반지', '보석 반지', '쌍줄 티타늄 반지', '지휘관 반지'],
        shoes:    ['전투화', '방탄 부츠', '정강이 보호대', '정글 샌들', '특전사 장화'],
        belt:     ['전술 벨트', '탄입대 벨트', '장교 벨트', '이중 전술 벨트', '장갑판 벨트'],
    },
    space: {
        gloves:   ['여압 장갑', '합금 건틀릿', '진공 랩', '여압 브레이서', '자기장 너클'],
        necklace: ['산소 회로 목걸이', '항법 아뮬렛', '궤도 펜던트', '중력 로켓', '궤도 초커'],
        ring:     ['합금 반지', '신호 반지', '결정 반지', '쌍궤도 반지', '사령관 반지'],
        shoes:    ['자력 부츠', '추진 부츠', '여압 그리브', '무중력 샌들', '착륙 장화'],
        belt:     ['생명유지 벨트', '공구 벨트', '추진 벨트', '이중 궤도 벨트', '합금판 벨트'],
    },
    interstellar: {
        gloves:   ['플라즈마 건틀릿', '나노 장갑', '중력자 랩', '나노 브레이서', '플라즈마 너클'],
        necklace: ['항성 목걸이', '초광속 아뮬렛', '성운 펜던트', '성간 로켓', '중력자 초커'],
        ring:     ['아다만티움 반지', '항성 반지', '중력 반지', '쌍성 반지', '항성왕 반지'],
        shoes:    ['관성 부츠', '아다만티움 그리브', '항성 신발', '이온 샌들', '항성 장화'],
        belt:     ['중력 벨트', '워프 벨트', '항성 허리띠', '이중 워프 벨트', '아다만티움 판벨트'],
    },
    multiverse: {
        gloves:   ['홀로 장갑', '코드 건틀릿', '픽셀 랩', '코드 브레이서', '픽셀 너클'],
        necklace: ['차원 목걸이', '방화벽 아뮬렛', '데이터 펜던트', '차원 로켓', '홀로 초커'],
        ring:     ['홀로 반지', '해시 인장 반지', '프리즘 반지', '쌍차원 반지', '관리자 반지'],
        shoes:    ['부팅 부츠', '가상 신발', '렌더 그리브', '가상 샌들', '렌더 장화'],
        belt:     ['차원 벨트', '코드 벨트', '픽셀 허리띠', '이중 차원 벨트', '데이터판 벨트'],
    },
    quantum: {
        gloves:   ['파동 장갑', '얽힘의 건틀릿', '입자 랩', '위상 브레이서', '입자 너클'],
        necklace: ['얽힘의 목걸이', '중첩 아뮬렛', '위상 펜던트', '중첩 로켓', '얽힘 초커'],
        ring:     ['양자 반지', '스핀 반지', '위상 반지', '쌍스핀 반지', '관측자 반지'],
        shoes:    ['위상 부츠', '터널링 신발', '입자 그리브', '터널링 샌들', '파동 장화'],
        belt:     ['양자 벨트', '주파수 벨트', '위상 허리띠', '이중 위상 벨트', '양자판 벨트'],
    },
    underworld: {
        gloves:   ['헬포지드 건틀릿', '망자의 장갑', '용암 랩', '망자의 브레이서', '지옥 너클'],
        necklace: ['원한의 목걸이', '영혼 아뮬렛', '독니 펜던트', '영혼 로켓', '가시 초커'],
        ring:     ['저주받은 반지', '망자의 인장', '흑염 반지', '쌍사슬 반지', '망령왕 반지'],
        shoes:    ['용암 부츠', '망자의 신발', '재의 그리브', '재의 샌들', '용암 장화'],
        belt:     ['사슬 벨트', '지옥불 허리띠', '뼈 장식 벨트', '이중 사슬 벨트', '뼈 장식판 벨트'],
    },
    divine: {
        gloves:   ['성흔의 장갑', '천상의 건틀릿', '광휘의 랩', '축복의 브레이서', '천벌의 너클'],
        necklace: ['후광 목걸이', '대천사 아뮬렛', '신탁의 펜던트', '성물 로켓', '후광 초커'],
        ring:     ['맹세의 반지', '성인의 인장', '광휘의 반지', '쌍천사 반지', '성왕의 반지'],
        shoes:    ['천상의 신발', '성광 부츠', '광휘의 그리브', '순례 샌들', '대천사 장화'],
        belt:     ['성대', '팔라딘 벨트', '후광 허리띠', '이중 성대', '성광 판벨트'],
    },
};
// 시대 미지정 호출용 기본 이름 (구 세이브·폴백 경로)
const ACC_NAMES = {
    gloves:   ['장갑', '건틀릿', '핸드랩', '브레이서', '너클'],
    necklace: ['목걸이', '아뮬렛', '펜던트', '로켓', '초커'],
    ring:     ['반지', '인장 반지', '보석 반지', '쌍줄 반지', '왕관 반지'],
    shoes:    ['신발', '부츠', '그리브', '샌들', '장화'],
    belt:     ['벨트', '전투 벨트', '장식 벨트', '이중 벨트', '장식판 벨트'],
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
    boneDagger: { kr: '뼈 단검',      kind: 'melee',  impact: 0.07, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'bone' },
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
    dagger:     { kr: '단검',         kind: 'melee',  impact: 0.07, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'steel' },
    thrown:     { kr: '투척 도끼',    kind: 'ranged', impact: 0.32, motion: 'throw',  restX: -0.45, shape: 'thrown',   mat: 'steel' },
    musket:     { kr: '머스킷',       kind: 'ranged', impact: 0.26, motion: 'gun',    restX: -1.45, shape: 'rifle',    mat: 'blackpowder' },
    flintlock:  { kr: '플린트락',     kind: 'ranged', impact: 0.22, motion: 'gun',    restX: -1.45, shape: 'pistol',   mat: 'blackpowder' },
    // ── 현대: 화기 ──
    combatKnife:{ kr: '전투 나이프',  kind: 'melee',  impact: 0.07, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'gunmetal' },
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
    glitchDagger:{ kr: '글리치 단검', kind: 'melee',  impact: 0.07, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'energy' },
    riftLauncher:{ kr: '균열 발사기', kind: 'ranged', impact: 0.30, motion: 'gun',    restX: -1.45, shape: 'cannon',   mat: 'energy' },
    staff:      { kr: '마법 지팡이',  kind: 'ranged', impact: 0.36, motion: 'cast',   restX: -0.55, shape: 'staff',    mat: 'energy' },
    echoBow:    { kr: '메아리 활',    kind: 'ranged', impact: 0.32, motion: 'bow',    restX: -1.35, shape: 'bow',      mat: 'energy' },
    // ── 양자 ──
    waveBlade:  { kr: '파동검',       kind: 'melee',  impact: 0.07, motion: 'slash',  restX: -0.25, shape: 'sword',    mat: 'energy' },
    tunnelDagger:{ kr: '터널링 단검', kind: 'melee',  impact: 0.07, motion: 'double', restX: -0.25, shape: 'dagger',   mat: 'energy' },
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
// type: aoe(광역) | single(단일) | heal(회복=지속 고정량 HoT) | buff(버프=고정 공격력 가산)
// ⚠️ 버프 종류는 **HP 회복·공격력 업 둘뿐**이다 (사용자 지시 2026-08-19 buff-redesign-heal-atk-fixed:
//    "버프는 hp회복, 공격력 업만 되게 하고 공속업 이딴 거 넣지 마셈"). 공속(atkSpd) 버프는 폐기됐고
//    성역·시간 왜곡이 그 자리를 회복/공격력으로 대체했다 — 되살리지 말 것.
//    heal·buff 는 `healPct`/`buff:{...}` 같은 **비율** 필드를 더 쓰지 않는다. 위력은 데미지 스킬과 같은
//    규약(등급 기준치 × mult × 레벨 × 승천)으로 `Skills.healAmt`/`Skills.buffAtk` 가 계산한다.
//    `dur` = 지속(초): heal 은 그 시간 동안 나눠 회복, buff 는 그 시간 동안 공격력 가산.
// ⚠️ **쿨타임(cd) 규약 — 등급 차등 금지 (사용자 지시 2026-08-19 skill-cooldown-uniform:**
//    "스킬 쿨타임이 너무 길다. 전부 10~14초 내외로 해라 모든 스킬. 등급별로 쿨타임 다르지도 마라.")
//    ① 모든 cd 는 **10~14초 대역 안**에 있어야 한다. ② cd 는 **rarity 와 무관**하다 —
//    등급이 높다고 길게(옛 timeWarp 24·divineShield 22) 주지 말 것. ③ 남은 변주는 **type 축 하나뿐**:
//    single 11 · aoe 12 · heal 13 · buff 14. 등급마다 single/aoe 가 하나씩 + heal|buff 가 하나라
//    이 배정은 등급별 평균을 12.0~12.33 으로 평평하게 만든다(단조 증가 없음 = 등급 차등 아님).
//    새 스킬을 넣을 때도 이 표에서 type 값을 그대로 가져올 것. 검증기: `tools/test-skill-cooldown.js`.
// ⚠️ **이름 규약 — 이름·아이콘·연출 3가지가 같은 것을 가리켜야 한다** (사용자 지시 2026-08-19
//    `skill-name-icon-match-fx`: "스킬 이펙트에 어울리는 이름과 스킬 아이콘으로 바꾸고").
//    fx 를 갈아 놓고 이름을 안 고치면 **연출은 세례인데 이름은 한 발**(옛 '강타'·'관통 사격')이 된다.
//    새 스킬을 넣거나 fx 를 바꿀 땐 `IconGen` 의 `SK` 모티프까지 **한 벌로** 갱신할 것.
const SKILL_DEFS = [
    // 🆕 커먼 3종 재설계 (skill-object-protagonist, 사용자 지시 2026-08-22): 소환체가 걸어나오는 게
    //    아니라 **오브젝트 자체가 주인공**이다 — 표창·화살이 화면 왼쪽에서 날아 들어와 적을 맞히고,
    //    지렁이 괴물이 적 발밑에서 솟는다. 옛 연출(slash/ring/firstaid → 검사로봇·표창회오리·의무정령)은
    //    defs 에서 떼어 놓기만 했다(코드는 _legacy 처럼 살아 있음). fx 이름이 새 안무로 라우팅된다.
    //    ⚠️ firstAid 는 heal→single 로 바뀌었다(지렁이는 적을 문다) — 커먼 회복 슬롯이 잠시 빈다.
    { id: 'powerStrike', name: '표창 난무',       rarity: 'common',    type: 'single', mult: 3.0,  cd: 11, fx: 'shurikenrun', color: '#cfd8dc' },
    { id: 'whirlwind',   name: '화살비',          rarity: 'common',    type: 'aoe',    mult: 1.6,  cd: 12, fx: 'arrowrain',   color: '#b0bec5' },
    { id: 'firstAid',    name: '땅벌레',          rarity: 'common',    type: 'single', mult: 2.6,  cd: 13, fx: 'burrowworm',  color: '#8d6e63' },
    { id: 'fireball',    name: '화염구',          rarity: 'rare',      type: 'aoe',    mult: 2.4,  cd: 12, fx: 'explode',  color: '#ff8a65' },
    { id: 'pierceShot',  name: '화살 세례',       rarity: 'rare',      type: 'single', mult: 4.5,  cd: 11, fx: 'beam',     color: '#81d4fa' },
    { id: 'warCry',      name: '전투의 함성',     rarity: 'rare',      type: 'buff',   mult: 1.5,  dur: 8,  cd: 14, fx: 'warcry', color: '#ffcc80' },
    { id: 'meteor',      name: '메테오',          rarity: 'epic',      type: 'aoe',    mult: 4.0,  cd: 12, fx: 'meteor',   color: '#ff7043' },
    { id: 'lightning',   name: '낙뢰',            rarity: 'epic',      type: 'single', mult: 7.0,  cd: 11, fx: 'bolt',     color: '#fff176' },
        // 지원계 6종은 fx 가 전부 다르다 (skill-unique-signature). 축복이 `heal`(빛기둥 강림), 성역이
    // `aura`(룬 서클) 자리를 유지하고 나머지 4종이 전용 연출로 갈렸다 — 개념이 가장 잘 맞는 짝을 남겼다.
    { id: 'blessing',    name: '축복',            rarity: 'epic',      type: 'heal',   mult: 3.5,  dur: 5,  cd: 13, fx: 'heal', color: '#80cbc4' },
    { id: 'dragonBreath', name: '용의 아가리',    rarity: 'legendary', type: 'aoe',    mult: 6.5,  cd: 12, fx: 'breath',   color: '#ba68c8' },
    // ⚠️ fx 'guillotine' — 강타와 fx 를 공유하던 것을 분리 (skill-unique-signature): 교차 참격이 아니라
    //    거대한 처형 칼날이 내리찍히는 전용 연출.
    { id: 'execution',   name: '처형',            rarity: 'legendary', type: 'single', mult: 11.0, cd: 11, fx: 'guillotine', color: '#e57373' },
    { id: 'sanctuary',   name: '성역',            rarity: 'legendary', type: 'heal',   mult: 4.0,  dur: 6,  cd: 13, fx: 'aura', color: '#ce93d8' },
    // ⚠️ fx 'nova' — 화염구와 fx 를 공유하던 것을 분리 (skill-unique-signature): 투척 불덩이가 아니라
    //    허공에 빛이 **빨려 들어가 붕괴했다가** 한 번에 터지는 초신성 전용 연출.
    { id: 'supernova',   name: '초신성',          rarity: 'ultimate',  type: 'aoe',    mult: 10.0, cd: 12, fx: 'nova',     color: '#ffb74d' },
    // fx 'beam'(=화살 세례) 을 관통 사격과 공유하던 것을 분리 (skill-unique-signature).
    // 궁극기인데 레어 스킬과 같은 화살이 발수만 늘어난 그림이라 '공허의 창'이 화면에 없었다.
    { id: 'voidLance',   name: '공허의 창',       rarity: 'ultimate',  type: 'single', mult: 18.0, cd: 11, fx: 'voidrift', color: '#9575cd' },
    { id: 'timeWarp',    name: '시간 왜곡',       rarity: 'ultimate',  type: 'buff',   mult: 2.0,  dur: 10, cd: 14, fx: 'timewarp', color: '#4dd0e1' },
    // ⚠️ fx 'dragonfire' — 메테오와 fx 를 공유하던 것을 분리 (skill-unique-signature, 사용자 지목 쌍:
    //    "아포칼립스랑 메테오라는 스킬 너무 똑같음. 거대한 용이 나와서 불을 뿜는 스킬로 바꾸든지").
    { id: 'apocalypse',  name: '종말의 화룡',     rarity: 'mythic',    type: 'aoe',    mult: 18.0, cd: 12, fx: 'dragonfire', color: '#ef5350' },
    // ⚠️ fx 'spear' — 낙뢰와 fx 를 공유하던 것을 분리 (skill-unique-signature): 먹구름 번개가 아니라
    //    하늘이 열리고 거대한 황금 창이 내리꽂히는 전용 연출.
    { id: 'godspear',    name: '신의 창',         rarity: 'mythic',    type: 'single', mult: 32.0, cd: 11, fx: 'spear',    color: '#ffd54f' },
    { id: 'divineShield', name: '신성한 가호',    rarity: 'mythic',    type: 'heal',   mult: 7.0,  dur: 6,  cd: 13, fx: 'wardshield', color: '#fff59d' },
];

// 스킬 고정 데미지·패시브 등급별 기준치 (원본 개별 계수 미확보 → 자체 설계, BALANCE.md 참고)
// 데미지 = 기준치 × 스킬의 mult(등급 내 상대 위력) × 레벨 배율. 패시브는 장착만 해도 상시 적용.
const SKILL_BASE_DMG = { common: 40, rare: 200, epic: 1000, legendary: 5000, ultimate: 25000, mythic: 125000 };
// 버프 위력 기준치 — 영웅 스탯(maxHp·atk)에 비례하지 않는 **고정량**이라, 게임이 이미 쓰는
// '영웅 체력·공격력 축'인 SKILL_BASE_PASSIVE 의 4배를 등급 기준치로 잡았다(같은 가족 안에서 눈금을 맞춘 것).
// 실제 값 = 기준치 × 스킬의 mult(등급 내 상대 위력) × 레벨 배율 × 승천 배율.
const SKILL_BASE_HEAL = { common: 120, rare: 600, epic: 2800, legendary: 12000, ultimate: 60000, mythic: 280000 };
const SKILL_BASE_BUFF_ATK = { common: 20, rare: 80, epic: 320, legendary: 1400, ultimate: 6000, mythic: 28000 };
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
    powerStrike: '✴️', whirlwind: '🏹', firstAid: '🐛',
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

// 🎨 종별 몸색 — 리버본드 '생생한 색' (pet-riverbond-remake 채도 상향, 2026-08-21).
// 🚨 **왜 상향인가**: 파스텔 라이트값(호랑이 0xffb74d·구미호 0xff8a65·그리핀 0xffe082 등)이 복셀 AO +
//    어두운 조명 아래에서 **중간 회탁색으로 씻겨** 나가, 비평가 2인이 공통 최상위 감점으로 "죄다 회색/탄
//    mud, 종 구별 안 됨"(3·4점)을 짚었다. 호랑이=선명 주황·구미호(여우)=주황 처럼 **종 자연색을 채도
//    올려** 되살린다. 생쥐·판다·타조·거미처럼 원래 무채색인 종은 그대로 둔다(probe-pet-thumbs ④ 는
//    무채색 종을 저채도로 통과시키므로 건드리면 안 된다). 색상각은 ±40° 안(재질색↔썸네일 동반 이동)이라
//    프로브 불변, 지오메트리 무변경.
const PET_COLORS = {
    'Snail': 0xf0a83c, 'Turtle': 0x81c784, 'Mouse': 0xbdbdbd, 'Chicken': 0xf2ce3a, 'Cat': 0xe38b3e, 'Dog': 0xc98f4e,
    'Hedgehog': 0x8d6e63, 'Bear': 0x8a5a2e, 'Ostrich': 0xe0e0e0, 'Scorpion': 0xef9a9a, 'Spider': 0x6f5240,
    'Panda': 0xeeeeee, 'Griffin': 0xe0a828, 'Unicorn': 0xf6a8cc, 'Saber Tooth': 0xd98a34, 'Tiger': 0xf5801c,
    'Cerberus': 0x8e24aa, 'Kitsune': 0xe85e26, 'Serpent': 0x4db6ac,
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
    'Pony': '조랑말', 'Donkey': '당나귀', 'Alpaca': '알파카',
    'Clockwork Mouse': '태엽 생쥐', 'Clockwork Beetle': '태엽 딱정벌레', 'Sheep': '양',
    'Turtle': '거북이', 'Crab': '게', 'Brown Horse': '갈색 말', 'Dino': '공룡', 'Boar': '멧돼지',
    'Pig': '돼지', 'Goat': '염소', 'Camel': '낙타', 'Elk': '큰사슴', 'Panther': '흑표범',
    'Bike': '자전거', 'Giant Bee': '거대 벌', 'Armored Rhino': '장갑 코뿔소',
    'Mini Dragon': '미니 드래곤', 'One-Wheel Droid': '외바퀴 드로이드', 'Mech Spider': '기계 거미',
    'Hover Board': '호버보드', 'Hover Disk': '호버 디스크', 'Star Whale': '별고래',
    // mount-roster-add5 (사용자 지시 2026-08-19) — 공룡은 위 'Dino' 가 이미 그것이라 새로 넣지 않았다.
    'Pterosaur': '익룡', 'Bipedal Mech': '두발 로봇', 'Dump Truck': '덤프트럭', 'Cleaning Robot': '청소로봇',
};
const MOUNT_ICONS = {
    'Pony': '🐴', 'Donkey': '🫏', 'Alpaca': '🦙',
    'Clockwork Mouse': '🐭', 'Clockwork Beetle': '🪲', 'Sheep': '🐑',
    // ⚠️ 갈색 말은 조랑말과 **같은 🐴 를 쓰고 있었다** — 목록에서 두 종이 같은 아이콘으로 보인다
    //    (2026-08-19 `mount-roster-add5` 의 아이콘 중복 게이트가 잡았다). 말은 🐎 로 갈랐다.
    'Turtle': '🐢', 'Crab': '🦀', 'Brown Horse': '🐎', 'Dino': '🦕', 'Boar': '🐗',
    'Pig': '🐷', 'Goat': '🐐', 'Camel': '🐫', 'Elk': '🦌', 'Panther': '🐆',
    'Bike': '🚲', 'Giant Bee': '🐝', 'Armored Rhino': '🦏',
    'Mini Dragon': '🐉', 'One-Wheel Droid': '🤖', 'Mech Spider': '🕷',
    'Hover Board': '🛹', 'Hover Disk': '🛸', 'Star Whale': '🐋',
    // ⚠️ 이모지는 서로 겹치지 않게 골랐다 — 🦕(Dino)·🤖(외바퀴 드로이드)·🕷(기계 거미)는 이미 쓰인다.
    'Pterosaur': '🦅', 'Bipedal Mech': '🦾', 'Dump Truck': '🚚', 'Cleaning Robot': '🧹',
};

// 기능 해금 (원본 스테이지 해금 테이블)
const UNLOCKS = [
    { stage: '2-10', key: 'autoForge', name: '오토 포지' },
];

// 챕터별 배경 테마 (하늘색, 안개색, 바닥색)
// biome: 챕터별 소품 세트(Scene3D.buildProps) — 색만 바뀌는 게 아니라 지형 소재 자체가 바뀜
// celestial: 하늘 천체 ('sun'|'moon'|'none', 생략 시 sun) — 밤 챕터는 달+별
const CHAPTER_THEMES = [
    // 1 초원 — 안개를 하늘색 청록(0xa8d8ea)에서 **연둣빛 파스텔 연무**로 (map-palette-unify).
    // 종전엔 중경 나무 절반이 청록 베일에 씻겨 '초록 초원 vs 청록 숲'의 이중 세계로 갈라졌다
    // (팔레트 실측: 유채색 무게가 청록 185° 53% vs 초록 85° 42% 로 양분). 안개가 지면 계열의
    // 연둣빛이면 원경 숲이 같은 초록 세계 안에서 부드럽게 후퇴한다(하늘 쪽 30% lerp 는 setTheme 몫).
    { sky: 0x87ceeb, fog: 0xc0e2b6, ground: 0x7cb342, biome: 'forest' },

    // 2 사막 — 하늘을 모래와 같은 베이지로 두면 지평선이 소멸하고 화면 전체가 한 덩어리 베이지가 된다
    // (map-quality-up 비평가 2인 공통 지적). 원신 수메르 문법대로 '따뜻한 모래 vs 푸른 하늘' 보색으로 —
    // 안개(fog)는 모래색을 유지하므로 지평선엔 여전히 따뜻한 모래 연무가 깔리고 천정만 파랗게 벌어진다.
    { sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b, biome: 'desert' },
    // 3 바위산 — 지면을 0x6b6157→0x8a7c68로 밝힘: 값 그레이딩(-비례 하향) 후에도 절벽(0x51483e)과
    // 명도 단차가 남아야 한다(map-quality-up 재채점 A2·B2 공통 1위 '지면·바위·원경이 같은 회갈색 뭉개짐').
    // 🎨 0x8a7c68 → 0x857d6f(3차) → 0x7e7c74(4차, map-palette-unify): 명도는 유지(위 단차 결론
    //    보존)하고 채도를 근중성(s≈0.04)까지 뺐다 — 3차 채점 A 픽셀 실측에서 반 단계 냉각으로도
    //    웜:쿨 = 15.3k:23.9k 로 화면이 갈라져 있었다(암체 205° vs 지면·길 37°). 잎 파생 함정
    //    (툰드라 주석)은 rock 바이옴엔 잎이 없어 해당 없음을 확인하고 근중성까지 간다.
    { sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x7e7c74, biome: 'rock' },
    { sky: 0x4a6572, fog: 0x607d8b, ground: 0x455a64, biome: 'forest' },                    // 4 폭풍
    { sky: 0x263238, fog: 0x37474f, ground: 0x33691e, biome: 'forest', celestial: 'moon' }, // 5 밤 숲
    { sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, biome: 'snow', celestial: 'moon' },   // 6 설원 밤 (눈 고유색 복원 — 남색 지면은 "파란 지형"으로 보였음)
    { sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, biome: 'magic', celestial: 'moon' },  // 7 마법 (지면·하늘을 눌러 크리스탈 발광이 튀게)
    { sky: 0x006064, fog: 0x00838f, ground: 0x00acc1, biome: 'magic', celestial: 'none' },  // 8 심해
    { sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17, biome: 'lava' },                      // 9 용암 (어두운 현무암 + 작열 크랙 — 하늘 대비 지면을 깊게 누름)
    { sky: 0xffd54f, fog: 0xffe082, ground: 0xfff176, biome: 'forest' },                    // 10 천상
    // ---- 11~25: 맵 25종 확장 (main-stage-25-maps, 사용자 지시 2026-08-19) ----
    // 신설 바이옴 15종은 `Scene3D.BIOMES` 에 정의된다(kin = 형질을 물려받는 원본 바이옴 + 덮어쓸 값).
    // 팔레트는 원본 10종과 겹치지 않게 색상환·명도를 흩었다 — 같은 kin 이라도 지면 틴트·프롭·스캐터가 달라
    // "색만 바꾼 같은 맵"으로 읽히지 않게 한다.
    { sky: 0x9aa88c, fog: 0xb4c0a4, ground: 0x53603c, biome: 'marsh' },                     // 11 늪지 (탁한 올리브 연무)
    { sky: 0xcfe8b8, fog: 0xdff0c8, ground: 0x8aa63f, biome: 'bamboo' },                    // 12 대나무 숲
    { sky: 0xf3b98a, fog: 0xf7d3ae, ground: 0xa8632c, biome: 'autumn' },                    // 13 단풍 숲
    // 소금 평원은 게임에서 가장 밝은 맵이지만 **다크 엔드는 남겨야 한다** — 첫 판(지면 0xe4e8ea +
    // 틴트 명도 +0.16)은 `probe-chapters` 에서 명도 0.18 이하 비율이 0.46% 뿐이라 값 구조가 무너졌다.
    { sky: 0xdfe9f5, fog: 0xeef4fa, ground: 0xc9d0d4, biome: 'salt' },                      // 14 소금 사막
    { sky: 0xe8a06a, fog: 0xf0c39a, ground: 0xa4522e, biome: 'canyon' },                    // 15 붉은 협곡
    { sky: 0x9d9078, fog: 0xbdb29a, ground: 0x7a6a52, biome: 'badland' },                   // 16 황무지
    { sky: 0x6e6a66, fog: 0x8b8783, ground: 0x4a4744, biome: 'ash' },                       // 17 화산재 평원
    { sky: 0x8fc7e8, fog: 0xc2e2f2, ground: 0x9fc9de, biome: 'glacier' },                   // 18 빙하
    // ⚠️ 툰드라 지면은 **채도를 너무 빼면 안 된다.** 잎 색은 `setTheme` 에서 지면 albedo 를 명도-0.16
    //    + 채도 비례 하향으로 파생시키는데, 지면이 무채색에 가까우면 그 파생값이 니어블랙 중성색이 돼
    //    침엽수가 밝은 하늘 앞에서 **검은 종이 오림**으로 읽힌다(첫 판 실측). 올리브 탠으로 채도를 남긴다.
    { sky: 0xa9b7bf, fog: 0xc6d2d8, ground: 0x9a8f60, biome: 'tundra' },                    // 19 툰드라
    { sky: 0x5a3f8c, fog: 0x7a5aa8, ground: 0x6b4a9c, biome: 'amethyst', celestial: 'moon' },// 20 수정 평원
    { sky: 0xc9a227, fog: 0xd2b444, ground: 0x6d5a18, biome: 'sulfur' },                    // 21 유황 지대
    { sky: 0x6b7383, fog: 0x8a94a6, ground: 0x1c1e26, biome: 'obsidian' },                   // 22 흑요석 지대 (밝은 하늘 × 니어블랙 지면 = 실루엣 대비)
    { sky: 0x0b1b2e, fog: 0x14304a, ground: 0x0e2338, biome: 'abyss', celestial: 'none' },  // 23 심연
    { sky: 0xffe9a8, fog: 0xf0dcae, ground: 0xb89a52, biome: 'sanctum' },                   // 24 성역 (첫 판은 지면까지 밝아 화면 전체가 화이트아웃이었다)
    { sky: 0x7a1f12, fog: 0x9c3a22, ground: 0x2a1410, biome: 'doomland' },                  // 25 종말의 땅
];
