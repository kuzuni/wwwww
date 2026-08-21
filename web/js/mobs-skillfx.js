// ============================================================================
// 스킬 연출 액터 19종 박스 모델 — 마인크래프트 몹 문법 (skill-fx-minecraft-actors, 2026-08-21)
// ----------------------------------------------------------------------------
// 사용자 지시(2026-08-21): *"스킬에 나오는 오브젝트들 전부 동물, 로봇, 드래곤 이런 느낌이어야 함.
//   지금 꺼들 폐기하고 그런 식으로 바꾸고 … 마인크래프트식으로 바꿔야 함. 로봇이 나와서 적
//   때리던지, 표창 10개가 적한테 날아간다던지 그런 걸로 해야 함."*
//
// 왜 표를 새로 만드나 — 종전 스킬 연출은 **화면에 물건이 하나도 없었다**. 링·플레어·글로우·
// 파티클이 전부라 18종이 죄다 '빛나는 뭔가'로 수렴했고(그게 폐기 사유다), 그래서 '무슨 일이
// 일어났는지'가 아니라 '무슨 색이 번쩍였는지'만 남았다. 마크의 연출 문법은 정반대다 —
// **실체가 나와서 실제로 때린다**(아이언골렘이 팔을 휘두르고, 이블로커가 이빨을 소환하고,
// 위더가 해골을 쏜다). 이 파일은 그 '실체' 쪽만 들고 있고, 움직임은 `scene3d.js` 가 준다.
//
// 규약은 펫·탈것·적 표와 **완전히 동일**하다(`mobs.js` 머리말이 원본):
//   ① 한 액터 = 축정렬 직육면체 4~12 덩이. 곡면 근사(구·원뿔·관·회전체) 금지.
//   ② 얼굴·무늬·균열은 덩어리를 붙이지 말고 **칸 색(`paint`)** 으로 칠한다.
//   ③ 색은 소재 자연색(철은 회색, 바위는 회갈색, 용은 비늘색). 등급 틴트는 쓰지 않는다 —
//      등급은 크기·발수·조명이 말한다.
//   ④ 애니는 파츠 피벗 회전뿐. 여기서는 `joint` 를 안 쓰고 연출 코드가 직접 각을 준다.
//
// 좌표는 전부 **칸**. y=0 이 발바닥, **+z 가 정면**, x 는 좌우 대칭.
//   🚨 정면이 +z 인 것이 계약이다 — 연출 코드는 액터를 적 쪽(+x)으로 세울 때 `rotation.y = π/2`
//      하나로 돌린다. 표에서 정면을 −z 로 만들면 그 액터만 등을 보이고 싸운다.
//
// 🚨 **파츠 id 가 곧 애니 계약이다.** `scene3d.js` 의 액터 드라이버가 이 이름으로 파츠를 찾는다:
//      head · body · armL/armR(어깨 피벗) · legL/legR(골반 피벗) · wingL/wingR(등 피벗) ·
//      tail · jaw(턱 경첩 피벗) · weapon(손에 달린 무기 — armR 자식) · core(가슴 발광)
//    이름을 바꾸면 그 액터의 스윙·날갯짓·물기가 **조용히** 죽는다(두 파일을 항상 같이 볼 것).
//
// 🚨 **파츠 수 = 드로우콜이다.** `Mobs.build` 는 파츠 하나당 메시 하나를 만든다. 스킬은 매 시전
//    여러 체를 띄우므로(표창 10개·궁수 3기·석상 4기) 여러 체로 쓰는 액터는 파츠를 4~6으로 조인다.
//    시전마다 새로 굽지 않도록 `scene3d.js` 가 **프로토타입 1개를 캐시하고 clone** 한다.
// ============================================================================
(function (root) {
    'use strict';
    var P = root.MobParts, E = P.eyes;
    var M = {};

    // 공용 팔레트 — 소재 자연색(마크 블록 색 대역).
    var STEEL = 0x767c86, STEEL_D = 0x4b5058, STEEL_K = 0x2b2e33;   // 🔽 명도 2차 하향(배경 보호색 교정, 실측)
    var GOLD = 0xf0c33c, GOLD_D = 0xa9812a;
    var STONE = 0x7a776f, STONE_D = 0x504e49, MOSS = 0x5f8a33;
    var CLOTH = 0x8c2f2a, CLOTH_D = 0x5c1e1b;
    var BONE = 0xe6e0cf;

    // ── ① 검사 로봇 — `slash` 연속 참격 (2기가 좌우에서 교차 참격) ──────────────────
    // 마크 아이언골렘의 비례(넓은 흉곽·좁은 허리·각진 두상)에 바이저를 얹은 기계병.
    // 로봇 판독의 근거는 ⓐ 가슴 코어 발광 ⓑ 이음매(어두운 칸 띠) ⓒ 한 줄 바이저 — 셋 다 칠이다.
    M['swordbot'] = {
        cell: 0.079, parts: [
            { id: 'legL', box: [3, 5, 3], at: [-2.5, 2.5, 0], pivot: [-2.5, 5, 0], c: STEEL_D, paint: [{ c: STEEL_K, y: 0 }] },
            { id: 'legR', box: [3, 5, 3], at: [2.5, 2.5, 0], pivot: [2.5, 5, 0], c: STEEL_D, paint: [{ c: STEEL_K, y: 0 }] },
            { id: 'body', box: [8, 7, 5], at: [0, 8.5, 0], c: STEEL, paint: [
                { c: STEEL_K, y: [0, 0] }, { c: STEEL_D, y: [3, 3] } ] },
            // 가슴 코어 — 발광. 로봇이라고 말하는 한 칸.
            { id: 'core', box: [2, 2, 1], at: [0, 9.5, 3], c: 0x5fe3d6, mat: { emissive: 0x2ad1c0, emissiveIntensity: 1.5 } },
            { id: 'head', box: [5, 4, 5], at: [0, 14, 0], pivot: [0, 12, 0], c: STEEL, paint: [
                { c: STEEL_K, y: [1, 2], z: -1 },
                { c: 0xff6a3c, x: [1, 3], y: [1, 2], z: -1 } ] },       // 한 줄 바이저(주황 발광색)
            { id: 'armL', box: [3, 8, 3], at: [-5.5, 8.5, 0], pivot: [-5.5, 12, 0], c: STEEL, paint: [{ c: STEEL_D, y: [0, 2] }] },
            { id: 'armR', box: [3, 8, 3], at: [5.5, 8.5, 0], pivot: [5.5, 12, 0], c: STEEL, paint: [{ c: STEEL_D, y: [0, 2] }] },
            // 검 — 팔 자식. 주먹(팔 아래끝 y≈4.5)에서 위로 뻗는다.
            { id: 'weapon', box: [1, 11, 3], at: [5.5, 9, 0], parent: 'armR', c: 0xdfe6ee, paint: [
                { c: 0x9aa4b0, y: [0, 1] }, { c: 0x5b4326, y: [0, 2] } ] },
            { box: [1, 1, 5], at: [5.5, 4.5, 0], parent: 'armR', c: GOLD_D },     // 칼받이
        ],
    };

    // ── ② 처형인 — `guillotine` 처형 (거대 도끼를 머리 위에서 내려찍는다) ─────────────
    // 마크 '이빌 배저'류가 아니라 후드 처형인. 실루엣의 절반이 **도끼 날**이라 날을 크게 잡는다.
    M['executioner'] = {
        cell: 0.093, parts: [
            { id: 'legL', box: [4, 6, 4], at: [-3, 3, 0], pivot: [-3, 6, 0], c: 0x3a3129 },
            { id: 'legR', box: [4, 6, 4], at: [3, 3, 0], pivot: [3, 6, 0], c: 0x3a3129 },
            { id: 'body', box: [10, 8, 6], at: [0, 10, 0], c: CLOTH_D, paint: [
                { c: 0x2a2420, y: [0, 1] }, { c: CLOTH, y: [5, 7] } ] },
            { id: 'head', box: [6, 5, 6], at: [0, 15.5, 0], pivot: [0, 14, 0], c: 0x2a2420, paint: [
                { c: 0xff4b3a, x: [1, 2], y: [2, 2], z: -1, mx: true } ] },        // 두건 속 붉은 눈 두 점
            { id: 'armL', box: [4, 9, 4], at: [-7, 9.5, 0], pivot: [-7, 13.5, 0], c: 0x6d5b45 },
            { id: 'armR', box: [4, 9, 4], at: [7, 9.5, 0], pivot: [7, 13.5, 0], c: 0x6d5b45 },
            // 도끼 — 자루 + 넓은 날. 자루를 팔보다 길게 빼야 '내려찍는 무기'로 읽힌다.
            { id: 'weapon', box: [1, 20, 1], at: [7, 12, 0], parent: 'armR', c: 0x4a3520 },
            { box: [2, 8, 9], at: [7, 20, 3], parent: 'armR', c: STEEL, paint: [
                { c: STEEL_K, z: [0, 1] }, { c: 0xd9dde3, z: -1 } ] },
        ],
    };

    // ── ③ 표창 — `ring` 회오리 베기 (10개가 적을 감아 돈다) ─────────────────────────
    // 사용자 원문의 "표창 10개". 10체를 동시에 띄우므로 **파츠 2개**로 못 박는다(드로우콜 20).
    // 십자로 겹친 두 판 = 마크 텍스처 문법의 사수리검. 가운데는 어둡게 칠해 구멍처럼 보이게.
    M['shuriken'] = {
        cell: 0.06, parts: [
            { id: 'body', box: [9, 1, 3], at: [0, 0, 0], c: 0xd7dce3, paint: [
                { c: 0x8f959d, x: [3, 5] }, { c: 0x2f3338, x: [4, 4] } ] },
            { box: [3, 1, 9], at: [0, 0, 0], c: 0xd7dce3, paint: [
                { c: 0x8f959d, z: [3, 5] }, { c: 0x2f3338, z: [4, 4] } ] },
        ],
    };

    // ── ④ 궁수 자동인형 — `beam` 화살 세례 (3기가 일렬로 서서 연사) ──────────────────
    M['archer'] = {
        cell: 0.084, parts: [
            { id: 'legL', box: [3, 5, 3], at: [-2, 2.5, 0], pivot: [-2, 5, 0], c: 0x4c5a41 },
            { id: 'legR', box: [3, 5, 3], at: [2, 2.5, 0], pivot: [2, 5, 0], c: 0x4c5a41 },
            { id: 'body', box: [7, 7, 4], at: [0, 8.5, 0], c: 0x6f7f56, paint: [
                { c: 0x3f4a33, y: [0, 1] }, { c: 0x8a6a3a, y: [3, 3] } ] },
            { id: 'head', box: [5, 4, 5], at: [0, 14, 0], pivot: [0, 12, 0], c: 0x9b8b6a, paint: [
                { c: 0x3f4a33, y: [2, 3] },                                       // 후드
                { c: 0xffd166, x: [1, 1], y: [1, 1], z: -1, mx: true } ] },        // 노란 눈 점
            { id: 'armL', box: [3, 7, 3], at: [-5, 9.5, 0], pivot: [-5, 12.5, 0], c: 0x6f7f56 },
            { id: 'armR', box: [3, 7, 3], at: [5, 9.5, 0], pivot: [5, 12.5, 0], c: 0x6f7f56 },
            // 석궁 — 가로 활대 + 세로 총열. 팔 자식이라 겨눔 각이 팔을 따라간다.
            { id: 'weapon', box: [2, 2, 9], at: [5, 6.5, 2], parent: 'armR', c: 0x5b4326 },
            { box: [8, 2, 2], at: [5, 6.5, 4], parent: 'armR', c: 0x4a3520, paint: [{ c: 0xbfc4cb, x: [0, 0] }, { c: 0xbfc4cb, x: [-1, -1] }] },
        ],
    };

    // ── ⑤ 임프 — `explode` 화염구 (불덩이 블록을 던진다) ────────────────────────────
    // 마크 피글린+블레이즈 대역. 뿔·박쥐 날개·꼬리로 종이 갈린다.
    M['imp'] = {
        cell: 0.058, parts: [
            { id: 'legL', box: [2, 4, 2], at: [-2, 2, 0], pivot: [-2, 4, 0], c: 0x7a2a1c },
            { id: 'legR', box: [2, 4, 2], at: [2, 2, 0], pivot: [2, 4, 0], c: 0x7a2a1c },
            { id: 'body', box: [6, 6, 4], at: [0, 7, 0], c: 0xb14226, paint: [{ c: 0x7a2a1c, y: [0, 1] }] },
            { id: 'head', box: [6, 5, 5], at: [0, 12.5, 0], pivot: [0, 10, 0], c: 0xc95232, paint: [
                { c: 0xffe08a, x: [1, 1], y: [2, 2], z: -1, mx: true },
                { c: 0x3a1109, x: [2, 3], y: [0, 0], z: -1 } ] },                  // 이빨 보이는 입
            { box: [1, 3, 1], at: [-2, 16, -1], parent: 'head', c: 0x3a2a20 },     // 뿔
            { box: [1, 3, 1], at: [2, 16, -1], parent: 'head', c: 0x3a2a20 },
            { id: 'armL', box: [2, 6, 2], at: [-4, 8, 0], pivot: [-4, 10.5, 0], c: 0xc95232 },
            { id: 'armR', box: [2, 6, 2], at: [4, 8, 0], pivot: [4, 10.5, 0], c: 0xc95232 },
            { id: 'wingL', box: [7, 5, 1], at: [-6, 9, -2.5], pivot: [-2.5, 9, -2], c: 0x54211a, s: -1, tag: 'wing' },
            { id: 'wingR', box: [7, 5, 1], at: [6, 9, -2.5], pivot: [2.5, 9, -2], c: 0x54211a, s: 1, tag: 'wing' },
            { id: 'tail', box: [1, 1, 6], at: [0, 6, -4], pivot: [0, 6, -2], c: 0x7a2a1c, tag: 'tail' },
        ],
    };

    // ── ⑥ 불덩이 블록 — 임프가 던지는 투사체 (마크 마그마 큐브 문법: 검은 껍질 + 주황 균열) ──
    // 파츠 1개. 투사체는 여러 발이 동시에 날 수 있어 가장 싸야 한다.
    M['fireblock'] = {
        cell: 0.1, parts: [
            { id: 'body', box: [4, 4, 4], at: [0, 0, 0], c: 0x2a1408, mat: { emissive: 0xff5a12, emissiveIntensity: 0.9 }, paint: [
                { c: 0xff8a2b, y: [1, 2], z: -1 }, { c: 0xff8a2b, y: [1, 2], z: 0 },
                { c: 0xffd166, x: [1, 2], y: [1, 2], z: -1 },
                { c: 0xff8a2b, x: 0, y: [1, 2] }, { c: 0xff8a2b, x: -1, y: [1, 2] } ] },
        ],
    };

    // ── ⑦ 와이번 — `breath` 용의 아가리 (땅에서 솟아 문다) ──────────────────────────
    // 지중 습격이라 화면에 남는 건 머리·목·날개다. 턱(jaw)이 이 연출의 전부라 크게 잡는다.
    M['wyvern'] = {
        cell: 0.087, parts: [
            { id: 'body', box: [8, 7, 10], at: [0, 4, -4], c: 0x7a4b96, paint: [{ c: 0x53306a, y: [0, 1] }] },
            { id: 'head', box: [7, 5, 8], at: [0, 11, 4], pivot: [0, 9, 0], c: 0x8d59aa, paint: [
                { c: 0xffe066, x: [1, 1], y: [2, 3], z: [5, 6], mx: true },        // 노란 눈
                { c: 0x53306a, y: -1 } ] },
            { box: [1, 4, 1], at: [-2, 15.5, -1], parent: 'head', c: BONE },       // 뿔 2
            { box: [1, 4, 1], at: [2, 15.5, -1], parent: 'head', c: BONE },
            // 아래턱 — 경첩은 머리 뒤끝. 이게 벌어지는 각이 '아가리'다.
            { id: 'jaw', box: [6, 2, 8], at: [0, 7.5, 4], pivot: [0, 8.5, 0], parent: 'head', c: 0x8d59aa, paint: [
                { c: BONE, y: -1, z: [4, 7] } ] },                                  // 아랫니
            { box: [6, 1, 6], at: [0, 8.8, 5], parent: 'head', c: BONE },          // 윗니
            { id: 'wingL', box: [12, 1, 8], at: [-9, 9, -4], pivot: [-3.5, 9, -4], c: 0x53306a, s: -1, tag: 'wing' },
            { id: 'wingR', box: [12, 1, 8], at: [9, 9, -4], pivot: [3.5, 9, -4], c: 0x53306a, s: 1, tag: 'wing' },
        ],
    };

    // ── ⑧ 화룡 — `dragonfire` 종말의 화룡 (날아와 브레스를 뿜는다) ──────────────────
    // 사용자 예시 그대로. 와이번과 **덩치·비례·색**이 갈려야 한다(둘 다 용이라 가장 닮을 위험).
    // 여기는 목이 길고 날개가 크고 꼬리가 있다 — 옆으로 긴 비행 실루엣.
    M['firedragon'] = {
        cell: 0.12, parts: [
            { id: 'body', box: [8, 8, 14], at: [0, 8, -3], c: 0x8f2420, paint: [
                { c: 0x571412, y: [0, 2] }, { c: 0xd9662c, y: -1, z: [3, 10] } ] },
            { box: [5, 5, 7], at: [0, 11, 6], c: 0x8f2420 },                        // 목 밑동
            { id: 'head', box: [6, 5, 9], at: [0, 13.5, 12], pivot: [0, 12, 8], c: 0xa52c26, paint: [
                { c: 0xffcf4d, x: [1, 1], y: [2, 3], z: [5, 7], mx: true },
                { c: 0x571412, y: -1 } ] },
            { box: [1, 5, 1], at: [-2, 18, 8], parent: 'head', c: BONE },
            { box: [1, 5, 1], at: [2, 18, 8], parent: 'head', c: BONE },
            { id: 'jaw', box: [5, 2, 9], at: [0, 10, 12], pivot: [0, 11, 8], parent: 'head', c: 0xa52c26, paint: [{ c: BONE, y: -1, z: [5, 8] }] },
            { id: 'wingL', box: [16, 1, 12], at: [-12, 13, -3], pivot: [-4, 13, -3], c: 0x571412, s: -1, tag: 'wing',
              paint: [{ c: 0x8f2420, x: [0, 3] }] },
            { id: 'wingR', box: [16, 1, 12], at: [12, 13, -3], pivot: [4, 13, -3], c: 0x571412, s: 1, tag: 'wing',
              paint: [{ c: 0x8f2420, x: [-4, -1] }] },
            { id: 'tail', box: [3, 3, 12], at: [0, 8, -16], pivot: [0, 8, -10], c: 0x8f2420, tag: 'tail', paint: [{ c: 0x571412, z: [0, 3] }] },
        ],
    };

    // ── ⑨ 바위 골렘 — `meteor` 메테오 (하늘에서 떨어져 주먹으로 내려찍는다) ───────────
    // 종전 메테오는 '돌멩이'라 던진 돌로 읽혔다. 마크 아이언골렘 비례의 **돌 거인**이 떨어지면
    // 같은 낙하 연출인데도 무엇이 떨어졌는지가 읽힌다.
    M['rockgolem'] = {
        cell: 0.084, parts: [
            { id: 'legL', box: [5, 6, 5], at: [-3.5, 3, 0], pivot: [-3.5, 6, 0], c: STONE_D },
            { id: 'legR', box: [5, 6, 5], at: [3.5, 3, 0], pivot: [3.5, 6, 0], c: STONE_D },
            { id: 'body', box: [12, 8, 7], at: [0, 10, 0], c: STONE, paint: [
                { c: STONE_D, y: [0, 1] }, { c: MOSS, x: [2, 4], y: [5, 7], z: -1 }, { c: MOSS, x: [8, 9], y: [6, 7], z: -1 } ] },
            { id: 'head', box: [6, 5, 6], at: [0, 16.5, 0.5], pivot: [0, 14, 0], c: STONE, paint: [
                { c: 0xffb03a, x: [1, 1], y: [2, 2], z: -1, mx: true },            // 용암 눈
                { c: MOSS, y: -1 } ] },
            { id: 'armL', box: [4, 10, 4], at: [-8, 9, 0], pivot: [-8, 13.5, 0], c: STONE, paint: [{ c: STONE_D, y: [0, 3] }] },
            { id: 'armR', box: [4, 10, 4], at: [8, 9, 0], pivot: [8, 13.5, 0], c: STONE, paint: [{ c: STONE_D, y: [0, 3] }] },
            { id: 'weapon', box: [6, 5, 6], at: [8, 2, 0], parent: 'armR', c: STONE_D, paint: [{ c: 0x4a4844, y: [0, 1] }] },  // 뭉툭한 주먹
        ],
    };

    // ── ⑩ 번개새 — `bolt` 낙뢰 (구름 대신 새가 선회하다 급강하한다) ────────────────
    M['thunderbird'] = {
        cell: 0.09, parts: [
            { id: 'body', box: [5, 5, 9], at: [0, 5, 0], c: 0x35507a, paint: [{ c: 0x223354, y: [0, 1] }, { c: 0xfff07a, y: [3, 3], z: [3, 5] }] },
            { id: 'head', box: [4, 4, 4], at: [0, 9, 5], pivot: [0, 7.5, 3], c: 0x4a6a9c, paint: [
                { c: 0xfff07a, x: [1, 1], y: [2, 2], z: -1, mx: true } ] },
            { box: [2, 2, 4], at: [0, 8.5, 8], parent: 'head', c: GOLD },           // 부리
            { id: 'wingL', box: [11, 1, 7], at: [-8, 7, 0], pivot: [-2.5, 7, 0], c: 0x2c4166, s: -1, tag: 'wing',
              paint: [{ c: 0xfff07a, x: [0, 1] }] },
            { id: 'wingR', box: [11, 1, 7], at: [8, 7, 0], pivot: [2.5, 7, 0], c: 0x2c4166, s: 1, tag: 'wing',
              paint: [{ c: 0xfff07a, x: [-2, -1] }] },
            { id: 'tail', box: [4, 1, 6], at: [0, 5, -7], pivot: [0, 5, -4], c: 0x2c4166, tag: 'tail', paint: [{ c: 0xfff07a, z: [0, 1] }] },
        ],
    };

    // ── ⑪ 성좌 로봇 — `nova` 초신성 (강림 → 웅크림 → 팔 벌리며 폭발) ────────────────
    // 발광 파츠가 많은 유일한 액터. '별'을 색이 아니라 **조형**(어깨 별 블록·가슴 코어)으로 낸다.
    M['starbot'] = {
        cell: 0.08, parts: [
            { id: 'legL', box: [4, 6, 4], at: [-3, 3, 0], pivot: [-3, 6, 0], c: 0x3d4661 },
            { id: 'legR', box: [4, 6, 4], at: [3, 3, 0], pivot: [3, 6, 0], c: 0x3d4661 },
            { id: 'body', box: [9, 8, 6], at: [0, 10, 0], c: 0x515c7d, paint: [{ c: 0x2c334a, y: [0, 1] }] },
            { id: 'core', box: [4, 4, 2], at: [0, 11, 3], c: 0xffd98a, mat: { emissive: 0xffb03a, emissiveIntensity: 2.2 } },
            { id: 'head', box: [5, 4, 5], at: [0, 16, 0], pivot: [0, 14, 0], c: 0x646f92, paint: [
                { c: 0xffe6a8, x: [1, 3], y: [1, 2], z: -1 } ] },
            { id: 'armL', box: [3, 9, 3], at: [-6.5, 9.5, 0], pivot: [-6.5, 13.5, 0], c: 0x515c7d },
            { id: 'armR', box: [3, 9, 3], at: [6.5, 9.5, 0], pivot: [6.5, 13.5, 0], c: 0x515c7d },
            { box: [3, 3, 3], at: [-6.5, 15.5, 0], c: 0xffd98a, mat: { emissive: 0xffb03a, emissiveIntensity: 1.8 } },  // 어깨 별
            { box: [3, 3, 3], at: [6.5, 15.5, 0], c: 0xffd98a, mat: { emissive: 0xffb03a, emissiveIntensity: 1.8 } },
        ],
    };

    // ── ⑫⑬ 기사 2종 — `voidrift` 공허의 창 / `spear` 신의 창 ───────────────────────
    // 같은 섀시에서 갈라진다(마크가 좀비/드라운드를 같은 뼈대로 내는 방식). 갈리는 것은
    // **색·투구 형태·날개 유무**다 — 실루엣이 안 갈리면 두 스킬이 같아 보이므로 날개로 못 박는다.
    function knight(o) {
        var parts = [
            { id: 'legL', box: [3, 6, 3], at: [-2.5, 3, 0], pivot: [-2.5, 6, 0], c: o.dark },
            { id: 'legR', box: [3, 6, 3], at: [2.5, 3, 0], pivot: [2.5, 6, 0], c: o.dark },
            { id: 'body', box: [8, 8, 5], at: [0, 10, 0], c: o.main, paint: [{ c: o.dark, y: [0, 1] }, { c: o.trim, y: [6, 7] }] },
            { id: 'head', box: [5, 5, 5], at: [0, 16, 0], pivot: [0, 14, 0], c: o.main, paint: [
                { c: o.dark, y: [1, 2], z: -1 }, { c: o.eye, x: [1, 3], y: [2, 2], z: -1 },
                { c: o.trim, y: -1 } ] },
            { id: 'armL', box: [3, 8, 3], at: [-5.5, 10, 0], pivot: [-5.5, 13.5, 0], c: o.main },
            { id: 'armR', box: [3, 8, 3], at: [5.5, 10, 0], pivot: [5.5, 13.5, 0], c: o.main },
            // 창 — 자루(길게) + 촉. 촉이 앞으로 나가야 찌르기가 읽힌다.
            { id: 'weapon', box: [2, 2, 22], at: [5.5, 10, 6], parent: 'armR', c: o.shaft },
            { box: [3, 3, 5], at: [5.5, 10, 18], parent: 'armR', c: o.tip, mat: o.tipMat },
        ];
        if (o.wings) {
            parts.push({ id: 'wingL', box: [10, 1, 9], at: [-8, 12, -3], pivot: [-3, 12, -3], c: o.wing, s: -1, tag: 'wing' });
            parts.push({ id: 'wingR', box: [10, 1, 9], at: [8, 12, -3], pivot: [3, 12, -3], c: o.wing, s: 1, tag: 'wing' });
        }
        return { cell: o.cell, parts: parts };
    }
    M['voidknight'] = knight({
        cell: 0.075, main: 0x3b3252, dark: 0x241d33, trim: 0x6f5aa8, eye: 0xc79bff,
        shaft: 0x241d33, tip: 0xb98cff, tipMat: { emissive: 0x7b4fd4, emissiveIntensity: 1.4 },
    });
    M['spearknight'] = knight({
        cell: 0.073, main: 0xe8e2cf, dark: 0xb7ad8e, trim: GOLD, eye: 0xfff3b0, wings: 0xf6f2e2, wing: 0xf6f2e2,
        shaft: GOLD_D, tip: GOLD, tipMat: { emissive: GOLD_D, emissiveIntensity: 1.5 },
    });

    // ── ⑭ 치유 천사 — `heal` 축복 (내려와 회복 블록을 떨어뜨린다) ───────────────────
    M['angel'] = {
        cell: 0.073, parts: [
            { id: 'body', box: [5, 8, 4], at: [0, 4, 0], c: 0xeef3ee, paint: [{ c: 0x9fd6c4, y: [0, 2] }] },
            { id: 'head', box: [4, 4, 4], at: [0, 10, 0], pivot: [0, 8, 0], c: 0xf7e6c9, paint: [
                { c: 0x3a2f28, x: [1, 1], y: [1, 1], z: -1, mx: true } ] },
            { box: [6, 1, 6], at: [0, 13, 0], c: GOLD, mat: { emissive: GOLD_D, emissiveIntensity: 1.4 } },  // 후광
            { id: 'wingL', box: [8, 6, 1], at: [-6, 7, -2.5], pivot: [-2, 7, -2], c: 0xffffff, s: -1, tag: 'wing' },
            { id: 'wingR', box: [8, 6, 1], at: [6, 7, -2.5], pivot: [2, 7, -2], c: 0xffffff, s: 1, tag: 'wing' },
            { id: 'armL', box: [2, 6, 2], at: [-3.5, 5, 0], pivot: [-3.5, 7.5, 0], c: 0xf7e6c9 },
            { id: 'armR', box: [2, 6, 2], at: [3.5, 5, 0], pivot: [3.5, 7.5, 0], c: 0xf7e6c9 },
        ],
    };

    // ── ⑮ 의무 정령 — `firstaid` 응급 처치 (붕대 상자를 들고 와 붙인다) ─────────────
    // 천사와 **역할이 겹치므로** 실루엣을 갈라야 한다: 날개가 짧고, 손에 든 상자가 크고,
    // 머리에 붕대를 감았다. 회복계 3종(축복·응급·성역)이 서로 안 닮게 만드는 자리다.
    M['medic'] = {
        cell: 0.082, parts: [
            { id: 'body', box: [5, 6, 4], at: [0, 4, 0], c: 0xdfe9e2, paint: [{ c: 0xc0463f, y: [3, 4], z: -1, x: [2, 2] }] },
            { id: 'head', box: [5, 4, 4], at: [0, 9, 0], pivot: [0, 7, 0], c: 0xf2dcc0, paint: [
                { c: 0xf4f0e6, y: [2, 3] }, { c: 0xc0463f, x: [2, 2], y: [2, 3], z: -1 },   // 붕대 + 붉은 십자
                { c: 0x3a2f28, x: [1, 1], y: [1, 1], z: -1, mx: true } ] },
            { id: 'wingL', box: [5, 4, 1], at: [-4.5, 6, -2.5], pivot: [-2, 6, -2], c: 0xbfe6d6, s: -1, tag: 'wing' },
            { id: 'wingR', box: [5, 4, 1], at: [4.5, 6, -2.5], pivot: [2, 6, -2], c: 0xbfe6d6, s: 1, tag: 'wing' },
            { id: 'armR', box: [2, 5, 2], at: [3.5, 4, 0], pivot: [3.5, 6.5, 0], c: 0xf2dcc0 },
            // 구급 상자 — 흰 상자에 붉은 십자. 이 액터의 판독 근거라 크게 잡는다.
            { id: 'weapon', box: [5, 4, 4], at: [3.5, 0, 1], parent: 'armR', c: 0xf4f0e6, paint: [
                { c: 0xc0463f, x: [2, 2] }, { c: 0xc0463f, y: [1, 2], z: -1 }, { c: 0xc0463f, y: [1, 2], z: 0 } ] },
        ],
    };

    // ── ⑯ 수호 석상 — `aura` 성역 (넷이 땅에서 솟아 영웅을 둘러싼다) ────────────────
    // 4체를 동시에 띄우므로 파츠 5개로 조인다.
    M['statue'] = {
        cell: 0.094, parts: [
            { id: 'body', box: [6, 9, 5], at: [0, 6, 0], c: 0x8d8676, paint: [
                { c: 0x7d7767, y: [0, 1] }, { c: 0x6fb0a8, x: [2, 3], y: [4, 6], z: -1 } ] },   // 가슴 청동판
            { box: [8, 2, 7], at: [0, 1, 0], c: 0x7d7767 },                        // 받침
            { id: 'head', box: [5, 4, 5], at: [0, 12.5, 0], pivot: [0, 10.5, 0], c: 0x8d8676, paint: [
                { c: 0x6fb0a8, x: [1, 3], y: [1, 2], z: -1 } ] },
            { id: 'armL', box: [2, 7, 2], at: [-4, 7.5, 0], pivot: [-4, 11, 0], c: 0x8d8676 },
            { id: 'armR', box: [2, 7, 2], at: [4, 7.5, 0], pivot: [4, 11, 0], c: 0x8d8676 },
        ],
    };

    // ── ⑰ 오크 대장 — `warcry` 전투의 함성 (뿔피리를 분다) ─────────────────────────
    M['orcchief'] = {
        cell: 0.085, parts: [
            { id: 'legL', box: [4, 5, 4], at: [-3, 2.5, 0], pivot: [-3, 5, 0], c: 0x4a3d2a },
            { id: 'legR', box: [4, 5, 4], at: [3, 2.5, 0], pivot: [3, 5, 0], c: 0x4a3d2a },
            { id: 'body', box: [10, 8, 6], at: [0, 9, 0], c: 0x5c7a3a, paint: [
                { c: 0x3f5a28, y: [0, 1] }, { c: 0x8a6a3a, y: [3, 4] } ] },        // 가죽 띠
            { id: 'head', box: [6, 5, 6], at: [0, 15.5, 0], pivot: [0, 13, 0], c: 0x6d8f45, paint: [
                { c: 0xffe08a, x: [1, 1], y: [2, 2], z: -1, mx: true },
                { c: 0xf4f0e6, x: [2, 3], y: [0, 0], z: -1 } ] },                  // 아랫니
            { id: 'armL', box: [4, 8, 4], at: [-7, 9, 0], pivot: [-7, 13, 0], c: 0x6d8f45 },
            { id: 'armR', box: [4, 8, 4], at: [7, 9, 0], pivot: [7, 13, 0], c: 0x6d8f45 },
            // 뿔피리 — 팔 자식. 짧은 관 3단(굵→가늘)으로 나팔 실루엣을 낸다(곡면 금지 규약).
            { id: 'weapon', box: [3, 3, 5], at: [7, 6, 3], parent: 'armR', c: 0xd9c9a3 },
            { box: [5, 5, 3], at: [7, 6, 7], parent: 'armR', c: 0xbfae86, paint: [{ c: GOLD_D, z: -1 }] },
        ],
    };

    // ── ⑱ 태엽 로봇 — `timewarp` 시간 왜곡 (등의 태엽 열쇠를 돌린다) ────────────────
    // 검사 로봇과 **같은 로봇 계열**이라 실루엣을 강제로 가른다: 몸이 원통형 상자(시계판)고
    // 등에 열쇠가 꽂혀 있고 팔이 짧다.
    M['clockbot'] = {
        cell: 0.078, parts: [
            { id: 'legL', box: [3, 4, 3], at: [-2.5, 2, 0], pivot: [-2.5, 4, 0], c: 0x6b5a3a },
            { id: 'legR', box: [3, 4, 3], at: [2.5, 2, 0], pivot: [2.5, 4, 0], c: 0x6b5a3a },
            // 시계판 몸통 — 앞면에 12시 눈금과 바늘을 칠한다(칠로 내는 디테일 규약).
            { id: 'body', box: [9, 9, 5], at: [0, 8.5, 0], c: 0xb08d4e, paint: [
                { c: 0xf0dfae, x: [1, -2], y: [1, -2], z: -1 },                    // 흰 시계판
                { c: 0x3a2f28, x: [4, 4], y: [4, 6], z: -1 },                      // 긴 바늘(12시)
                { c: 0x3a2f28, x: [4, 6], y: [4, 4], z: -1 },                      // 짧은 바늘(3시)
                { c: 0x8a6a3a, x: [4, 4], y: [1, 1], z: -1 }, { c: 0x8a6a3a, x: [4, 4], y: [-2, -2], z: -1 },
                { c: 0x8a6a3a, x: [1, 1], y: [4, 4], z: -1 }, { c: 0x8a6a3a, x: [-2, -2], y: [4, 4], z: -1 } ] },
            { id: 'head', box: [5, 4, 5], at: [0, 15, 0], pivot: [0, 13, 0], c: 0xd8b46a, paint: [
                { c: 0x3a2f28, x: [1, 3], y: [1, 2], z: -1 } ] },
            { id: 'armL', box: [2, 5, 2], at: [-5.5, 9.5, 0], pivot: [-5.5, 12, 0], c: 0xb08d4e },
            { id: 'armR', box: [2, 5, 2], at: [5.5, 9.5, 0], pivot: [5.5, 12, 0], c: 0xb08d4e },
            // 태엽 열쇠 — 등에서 뒤로. 이 액터의 판독 근거.
            { id: 'weapon', box: [2, 2, 4], at: [0, 10, -4.5], c: 0x8a7a5a },
            { box: [7, 7, 1], at: [0, 10, -7], c: 0x8a7a5a, paint: [{ c: 0xd8b46a, x: [3, 3] }, { c: 0xd8b46a, y: [3, 3] }] },
        ],
    };

    // ── ⑲ 방패 골렘 — `wardshield` 신성한 가호 (영웅 앞에 방패를 세운다) ────────────
    // 바위 골렘과 계열이 겹치므로 **금속·금테·거대 방패**로 가른다.
    M['shieldgolem'] = {
        cell: 0.081, parts: [
            { id: 'legL', box: [5, 5, 5], at: [-3.5, 2.5, 0], pivot: [-3.5, 5, 0], c: 0x7b6a4a },
            { id: 'legR', box: [5, 5, 5], at: [3.5, 2.5, 0], pivot: [3.5, 5, 0], c: 0x7b6a4a },
            { id: 'body', box: [11, 8, 6], at: [0, 9, 0], c: 0x9c8a63, paint: [
                { c: 0x6b5c3f, y: [0, 1] }, { c: GOLD_D, y: [4, 4] } ] },
            { id: 'head', box: [6, 5, 6], at: [0, 15.5, 0], pivot: [0, 13, 0], c: 0x9c8a63, paint: [
                { c: 0xffe08a, x: [1, 1], y: [2, 2], z: -1, mx: true }, { c: GOLD, y: -1 } ] },
            { id: 'armL', box: [4, 9, 4], at: [-7.5, 8.5, 0], pivot: [-7.5, 13, 0], c: 0x9c8a63 },
            { id: 'armR', box: [4, 9, 4], at: [7.5, 8.5, 0], pivot: [7.5, 13, 0], c: 0x9c8a63 },
            // 큰 방패 — 왼팔 자식. 앞면에 금색 십자 문양.
            { id: 'weapon', box: [10, 14, 2], at: [-9, 8, 3], parent: 'armL', c: 0xc9b47a, paint: [
                { c: GOLD_D, x: [0, 0] }, { c: GOLD_D, x: [-1, -1] },
                { c: GOLD, x: [4, 5], z: -1 }, { c: GOLD, y: [8, 9], z: -1 } ] },
        ],
    };

    // ── ⑳ 땅벌레 — `burrowworm` (적 발밑에서 솟아 문다) ─────────────────────────────
    // skill-object-protagonist(2026-08-22): 소환체가 걸어오는 게 아니라 **적 발밑에서 지렁이 괴물이
    //   솟아 덥석 문다**. 세로로 마디가 쌓인 몸통 + 큰 머리·아래턱(경첩). 1체만 띄우므로 파츠에 여유.
    //   색은 흙지렁이(살구빛 갈색 + 어두운 마디 고리). 머리 정면(+z)에 노란 눈 두 점.
    M['worm'] = {
        cell: 0.088, parts: [
            { id: 'body', box: [5, 5, 5], at: [0, 3, 0], c: 0x7d5b4e, paint: [{ c: 0x4e342e, y: [0, 0] }] },       // 하단 마디(땅에 박힌 밑동)
            { box: [5, 5, 5], at: [0, 8, 0], c: 0x9c7b6a, paint: [{ c: 0x5d4037, y: [0, 0] }, { c: 0x5d4037, y: [4, 4] }] },  // 중단(고리 마디)
            { box: [6, 5, 6], at: [0, 13, 0], c: 0x7d5b4e, paint: [{ c: 0x5d4037, y: [4, 4] }] },                   // 상단(목 밑동)
            { id: 'head', box: [7, 6, 7], at: [0, 18.5, 0], pivot: [0, 16, 0], c: 0x9c7b6a, paint: [
                { c: 0xffd94a, x: [1, 1], y: [3, 3], z: -1, mx: true },   // 노란 눈 두 점(정면)
                { c: 0x4e342e, y: -1 } ] },                               // 아래 그늘
            { box: [1, 3, 2], at: [-2, 15.5, 3], parent: 'head', c: 0xf4f0e6 },   // 위 엄니 2
            { box: [1, 3, 2], at: [2, 15.5, 3], parent: 'head', c: 0xf4f0e6 },
            // 아래턱 — 경첩 위쪽. 벌어지는 각이 '아가리'다. 앞니는 칠로.
            { id: 'jaw', box: [6, 2, 6], at: [0, 15, 2], pivot: [0, 16, 0], parent: 'head', c: 0x7d5b4e, paint: [
                { c: 0xf4f0e6, z: -1, y: -1 } ] },
        ],
    };

    root.SKILLFX_MODELS = M;
})(typeof window !== 'undefined' ? window : globalThis);
