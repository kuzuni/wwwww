// ============================================================================
// 적(몬스터) 7종 박스 모델 — 마인크래프트 몹 문법 (enemy-minecraft-remake, 2026-08-21)
// ----------------------------------------------------------------------------
// 사용자 지시(2026-08-21): *"적들 디자인도 마인크래프트 느낌 디자인으로 다시 해줘야함."*
//
// 왜 표로 옮기나 — 펫 25종·탈것 29종에서 이미 같은 이유로 같은 이행을 했다(`mobs.js` 머리말).
// 종전 적 조형은 `scene3d.js` 안에서 1,250줄에 걸쳐 **타원체·원뿔·원기둥·회전체(revolve)**를
// 복셀로 적층해 깎은 것이었다. 곡면을 칸으로 근사하면 계단 실루엣과 들쭉날쭉한 표면이 남아
// '큐브처럼 생겼지만 마크로는 안 읽히는' 상태가 된다 — 펫·탈것이 폐기된 사유와 정확히 같다.
//
// 이 파일이 지키는 규약(펫·탈것 표와 동일):
//   ① 한 종 = **축정렬 직육면체 6~14 덩이.** 곡면 근사 금지(구·원뿔·관·회전체).
//   ② 얼굴·무늬·발톱은 덩어리를 더 붙이지 않고 **칸 색(`paint`)** 으로 칠한다.
//   ③ 색은 **종 자연색** — 마크 아이언골렘은 철색, 슬라임은 초록, 버섯은 빨간 갓/흰 기둥.
//   ④ 애니는 파츠 피벗 회전뿐. 관절 피벗은 **id 규약**으로 노출한다(아래).
//
// 좌표는 전부 **칸**. y=0 이 발바닥, +z 가 정면, x 는 좌우 대칭. `cell` 이 칸의 월드 크기다.
// 🔑 **7종 전부 cell = 0.05 = `Scene3D.ENEMY_VS`** — 보스 레갈리아(관·등가시·견갑뿔)가 그 값으로
//    큐브를 찍으므로, 종마다 칸을 달리 주면 보스 한 마리 안에서 벽돌 크기가 갈려 '몸에 씌운
//    남의 장신구'가 된다. 몸집은 칸 개수로만 조절한다.
//
// 🚨 **관절 id 규약 — `scene3d.js` 의 적 애니 드라이버가 이 이름으로 파츠를 찾는다.**
//    바꾸면 그 종의 걷기·공격·플린치가 통째로 죽는다(조용히, 예외 없이).
//      hipL/hipR + kneeL/kneeR ... 이족 다리 → `anim.bleg` [{hip,knee}]
//      shL/shR  + elbowL/elbowR ... 이족 팔  → `anim.barm` [{sh,elbow}] · `armRJ`(=R) · armR/armL
//                                             ⚠️ `barm` 유무가 곧 **보스 견갑뿔 humanoid 판정**이다.
//      glegL/glegR ............... 무릎 없는 기둥 다리(골렘) → `anim.gleg`
//      legFL/legFR/legBL/legBR + kneeF*/kneeB* ... 사족(늑대) → `anim.legs`/`anim.knees`
//      tag:'wing'(+ s:±1) ........ 막날개 → `anim.wings` (드라이버가 `userData.s` 로 좌우를 가른다)
//      tag:'tail' ................ 꼬리 → `anim.tail`
//      cap / capDome / capTop .... 버섯 갓 피벗·플랩 메시 → `anim.cap`/`anim.capFlap`
//      body(+ `jelly:true`) ...... 슬라임 젤리 웨이브 → `anim.jelly`
//    ⚠️ 팔·다리 드라이버는 `rotation.x` 를 **절대 대입**한다 — 그 축의 `rot` 은 매 프레임 지워진다.
//       벌림·젖힘 같은 기본 자세는 z/y 축으로 줄 것(날개는 반대로 z 가 지워지니 x/y 로).
// ============================================================================
(function (root) {
    'use strict';
    var P = root.MobParts, E = P.eyes;
    var M = {};

    // ── 슬라임 — 마크 슬라임: 반투명 초록 상자 + 안쪽 코어 ──────────────────────────
    // 마크의 슬라임은 '물방울'이 아니라 **정육면체**다. 종전 판이 회전체 물방울이었던 게
    // 이 종에서 화풍이 가장 크게 어긋난 지점이라, 형태를 마크 원형으로 되돌린다.
    // 🚨 얼굴은 **몸에 칠하지 않고 앞면에 한 칸 덧대는 판**으로 낸다 — 몸이 반투명이라
    //    거기에 칠하면 눈까지 66% 투명이 되어 배경이 비쳐 '표정이 없는 젤리'가 된다.
    (function () {
        // 초록이되 **초원보다 확실히 밝은** 연두 — 마크 슬라임 색을 유지하면서 명도로 배경에서 갈린다.
        var SL = 0x74d848, CORE = 0x27691a, DK = 0x11280a;
        M['slime'] = {
            cell: 0.05, jelly: true, parts: [
                // 몸 — 반투명. `opacity < 1` 이면 `Mobs.makeMat` 이 depthWrite 를 끄므로 안쪽 코어가 비친다.
                { id: 'body', box: [14, 12, 14], at: [0, 6, 0], c: SL, mat: { opacity: 0.62, rough: 0.25 } },
                // 안쪽 코어 — 마크 슬라임의 '속에 든 작은 슬라임'. 불투명이라 실루엣 안에서 밀도를 만든다.
                { box: [7, 6, 7], at: [0, 5, 0], c: CORE },
                // 얼굴판 — 몸 앞면(z=7)에 한 칸 덧댄 불투명 판. 눈 2 + 입 3칸(마크 텍스처 그대로).
                // ⚠️ z 를 7.5(완전 바깥)로 두면 옆모습에서 얼굴판이 **튀어나온 탭**으로 읽히고,
                //    7.0(몸 앞면과 같은 면)이면 두 면이 겹쳐 z-파이팅이다. 반 칸만 물린다.
                { box: [10, 6, 1], at: [0, 7, 7], c: SL, paint: [
                    { c: 0xf4f0e6, x: [1, 3], y: [3, 5], mx: true },
                    { c: DK, x: [3, 3], y: [3, 5], mx: true },
                    { c: DK, x: [4, 5], y: [0, 0] },
                    { c: DK, x: [3, 3], y: [1, 1], mx: true },
                ] },
            ],
        };
    })();

    // ── 골렘 — 마크 아이언골렘: 철색 거인, 넓은 흉곽 · 좁은 허리 · 무릎까지 내려오는 긴 팔 ──
    // 아이언골렘의 판독 근거는 ⓐ 팔이 비정상적으로 길다 ⓑ 코가 앞으로 튀어나온 각진 두상
    // ⓒ 몸에 덩굴이 감겨 있다 — 셋 다 덩어리 하나 혹은 칠 하나로 낸다.
    (function () {
        // 🚨 명도를 한 단 더 내렸다 — 첫 인게임 캡처(사막 챕터)에서 밝은 철색 골렘이 **모래와 명도가 붙어**
//    보호색이 됐다. 이 저장소가 종별 키 컬러를 세 번 조정하며 싸운 결함과 같은 것이다
//    (`KIND_COLOR` 주석의 '명도가 안 갈라짐'). 마크 아이언골렘도 순백이 아니라 중회색이다.
        var IR = 0xa9a495, IR2 = 0x6e6a5e, VN = 0x74a03e, DK = 0x3b3833;
        M['golem'] = {
            cell: 0.05, parts: [
                // 기둥 다리 — 무릎이 없다(마크 골렘도 통짜다). 피벗은 골반 높이.
                { id: 'glegL', box: [5, 7, 6], at: [-3.5, 3.5, 0], pivot: [-3.5, 7, 0], c: IR2, paint: [{ c: DK, y: 0 }] },
                { id: 'glegR', box: [5, 7, 6], at: [3.5, 3.5, 0], pivot: [3.5, 7, 0], c: IR2, paint: [{ c: DK, y: 0 }] },
                { box: [12, 3, 7], at: [0, 8.5, 0], c: IR2 },                       // 골반
                { box: [7, 3, 5], at: [0, 11.5, 0], c: IR2 },                       // 잘록한 허리
                // 흉곽 + 덩굴. 🚨 덩굴을 z 무제한으로 칠하면 **옆면까지 통째로 초록 띠**가 된다
                //    (첫 판 실측: 가슴에 초록 직사각형 하나로 읽혔다) — 앞면(z:-1)에만, 한 줄기로.
                { id: 'body', box: [14, 7, 8], at: [0, 16.5, 0], c: IR, paint: [
                    { c: IR2, y: 0 }, { c: IR2, y: -1 },
                    { c: VN, x: [3, 3], y: [1, 5], z: -1 }, { c: VN, x: [3, 5], y: [3, 3], z: -1 },
                    { c: VN, x: [5, 5], y: [3, 5], z: -1 }, { c: VN, x: [10, 10], y: [0, 3], z: -1 } ] },
                { id: 'head', box: [7, 6, 6], at: [0, 23, 0.5], pivot: [0, 20, 0], c: IR, tag: 'head',
                  paint: E({ y: 2, inset: 1, ew: 2, eh: 2, white: 0xe8e4d8, pupil: 0x2a2723 }) },
                { box: [3, 5, 3], at: [0, 22, 4.5], parent: 'head', c: IR2 },       // 앞으로 튀어나온 코
                { box: [7, 1, 2], at: [0, 25.5, 3], parent: 'head', c: IR2 },       // 눈두덩 — 머리(꼭대기 26) 안쪽에 물린다
                // 긴 팔 — 아래팔 끝이 무릎(3칸)까지 내려온다. 이게 아이언골렘 실루엣의 절반이다.
                { id: 'shL', box: [4, 9, 5], at: [-8.5, 15, 0], pivot: [-8.5, 19.5, 0], c: IR, rot: [0, 0, 0.06] },
                { id: 'elbowL', box: [4, 8, 5], at: [-8.5, 6.5, 0], pivot: [-8.5, 10.5, 0], parent: 'shL', c: IR2,
                  paint: [{ c: DK, y: [0, 1] }] },
                { id: 'shR', box: [4, 9, 5], at: [8.5, 15, 0], pivot: [8.5, 19.5, 0], c: IR, rot: [0, 0, -0.06] },
                { id: 'elbowR', box: [4, 8, 5], at: [8.5, 6.5, 0], pivot: [8.5, 10.5, 0], parent: 'shR', c: IR2,
                  paint: [{ c: DK, y: [0, 1] }] },
            ],
        };
    })();

    // ── 고블린 — 마크 좀비 문법의 초록 인간형(굽은 등 · 큰 귀 · 누더기) ──────────────
    // 🚨 몸 전체를 초록으로 두면 초원에 잠식된다 — 이 저장소가 종전 판에서 키 컬러를 세 번
    //    낮춘 자리다(`KIND_COLOR` 주석). 마크 좀비가 **살은 초록, 몸통은 옷**인 것을 그대로 빌려
    //    흉곽·다리를 어두운 누더기 색으로 덮는다. 초록은 머리·팔에만 남아 종은 유지되고
    //    실루엣의 명도는 배경에서 갈린다.
    (function () {
        var GR = 0x4f9440, GR2 = 0x35702b, RAG = 0x4a3d2a, RAG2 = 0x2f2619, DK = 0x1b2a14;
        M['goblin'] = {
            cell: 0.05, parts: [
                { id: 'hipL', box: [3, 5, 3], at: [-2.5, 6.5, 0], pivot: [-2.5, 9, 0], c: RAG2 },
                { id: 'kneeL', box: [3, 4, 4], at: [-2.5, 2, 0.5], pivot: [-2.5, 4, 0], parent: 'hipL', c: GR,
                  paint: [{ c: DK, y: 0 }] },
                { id: 'hipR', box: [3, 5, 3], at: [2.5, 6.5, 0], pivot: [2.5, 9, 0], c: RAG2 },
                { id: 'kneeR', box: [3, 4, 4], at: [2.5, 2, 0.5], pivot: [2.5, 4, 0], parent: 'hipR', c: GR,
                  paint: [{ c: DK, y: 0 }] },
                { id: 'body', box: [8, 7, 4], at: [0, 12.5, 0], c: RAG, paint: [
                    { c: RAG2, y: [0, 1] }, { c: GR2, y: -1 }, { c: 0x8a6a3a, y: [2, 2] } ] },   // 허리띠
                { id: 'head', box: [8, 7, 7], at: [0, 18, 0.5], pivot: [0, 15.5, 0], c: GR, tag: 'head',
                  paint: E({ y: 3, inset: 1, ew: 2, eh: 2, white: 0xf0d94a, pupil: 0x1b2a14 }).concat([
                      { c: DK, x: [2, 5], y: [1, 1], z: -1 },                        // 씩 벌린 입
                      { c: 0xf4efe0, x: [2, 2], y: [0, 1], z: -1, mx: true } ]) },   // 송곳니
                { box: [2, 2, 2], at: [0, 17, 4.5], parent: 'head', c: GR2 },        // 주먹코
                { box: [4, 3, 1], at: [-5.5, 19, -1], parent: 'head', c: GR2, rot: [0, 0, 0.35] },  // 큰 귀
                { box: [4, 3, 1], at: [5.5, 19, -1], parent: 'head', c: GR2, rot: [0, 0, -0.35] },
                { id: 'shL', box: [3, 6, 3], at: [-5, 12.5, 0], pivot: [-5, 15.5, 0], c: GR, rot: [0, 0, 0.12] },
                { id: 'elbowL', box: [3, 5, 3], at: [-5, 7, 0], pivot: [-5, 9.5, 0], parent: 'shL', c: GR2 },
                { id: 'shR', box: [3, 6, 3], at: [5, 12.5, 0], pivot: [5, 15.5, 0], c: GR, rot: [0, 0, -0.12] },
                { id: 'elbowR', box: [3, 5, 3], at: [5, 7, 0], pivot: [5, 9.5, 0], parent: 'shR', c: GR2 },
            ],
        };
    })();

    // ── 박쥐 — 마크 박쥐: 작은 갈색 몸 + 큰 귀 + 몸보다 큰 막날개 ────────────────────
    // 막은 **계단 스캘럽**(세로 길이가 다른 판 3장)으로 낸다 — 한 판으로 두면 '비행기 주익'이 된다.
    // 🚨 날개 드라이버가 `rotation.z` 를 절대 대입하므로 기본 자세는 y(뒤로 젖힘)로만 준다.
    (function () {
        var BR = 0x6f5a49, BR2 = 0x4d3d31, MEM = 0x5a4436, DK = 0x2a201a;
        var wing = function (s) {
            var id = s > 0 ? 'wingR' : 'wingL';
            return [
                { id: id, box: [3, 7, 1], at: [s * 4.5, 9.5, -0.5], pivot: [s * 2.5, 9.5, -0.5],
                  c: MEM, mat: { opacity: 0.88 }, tag: 'wing', s: s, rot: [0, s * -0.2, 0] },
                { box: [3, 5, 1], at: [s * 7.5, 9.5, -0.5], parent: id, c: MEM, mat: { opacity: 0.88 } },
                { box: [3, 3, 1], at: [s * 10.5, 10, -0.5], parent: id, c: MEM, mat: { opacity: 0.88 } },
                { box: [9, 1, 2], at: [s * 7.5, 12.5, -0.5], parent: id, c: BR2 },   // 앞전 뼈대
                { box: [1, 4, 2], at: [s * 6, 11, -0.5], parent: id, c: BR2 },       // 손가락 골
            ];
        };
        M['bat'] = {
            cell: 0.05, fly: true, parts: [
                { box: [2, 2, 3], at: [-1.5, 1, -0.5], c: DK },                      // 늘어뜨린 발
                { box: [2, 2, 3], at: [1.5, 1, -0.5], c: DK },
                { id: 'body', box: [5, 7, 4], at: [0, 7.5, 0], c: BR, paint: [{ c: BR2, z: 0 }, { c: 0x8f7860, z: -1 }] },
                { id: 'head', box: [5, 4, 4], at: [0, 13, 0.5], pivot: [0, 11, 0], c: BR, tag: 'head',
                  paint: E({ y: 1, inset: 1, ew: 1, eh: 2, white: 0xf3d24a, pupil: 0x2a1c14 }).concat([
                      { c: DK, x: [2, 2], y: [0, 0], z: -1 } ]) },
                { box: [3, 2, 2], at: [0, 12, 3.5], parent: 'head', c: BR2, paint: [{ c: DK, z: -1 }] }, // 주둥이
                { box: [2, 4, 1], at: [-1.5, 16.5, 0], parent: 'head', c: BR2, rot: [0, 0, 0.18] },      // 큰 귀
                { box: [2, 4, 1], at: [1.5, 16.5, 0], parent: 'head', c: BR2, rot: [0, 0, -0.18] },
            ].concat(wing(-1), wing(1)),
        };
    })();

    // ── 버섯 — 마크 빨간 버섯 + 무시룸(Mooshroom) 문법: 흰 기둥 + 흰 반점 빨간 갓 ────────
    // 갓은 계단 3단(넓은 갓 → 좁은 단 → 꼭지)으로 쌓아 **돔이 아니라 갓**으로 읽히게 한다.
    // `cap` 은 회전 피벗(갓 밑동)이고, 그 밑에 달린 `capDome` 이 테두리 플랩용 메시다.
    (function () {
        var RED = 0xc4392b, RED2 = 0x8f2519, SPOT = 0xf2ece0, STEM = 0xe8e1cf, STEM2 = 0xc9c0aa, GILL = 0xd8cdb4;
        M['mushroom'] = {
            cell: 0.05, hop: true, parts: [
                { box: [3, 2, 4], at: [-2.5, 1, 0.5], c: STEM2 },                    // 뭉툭한 발 두 짝
                { box: [3, 2, 4], at: [2.5, 1, 0.5], c: STEM2 },
                { id: 'body', box: [6, 8, 6], at: [0, 6, 0], c: STEM, paint: [
                    { c: STEM2, y: 0 } ].concat(E({ y: 4, inset: 1, ew: 1, eh: 2 }), [
                    { c: 0x5a4a38, x: [2, 3], y: [2, 2], z: -1 },                    // 입
                    { c: 0xe6a89c, x: [0, 0], y: [3, 3], z: -1, mx: true } ]) },     // 볼 홍조
                // 갓 — 피벗은 밑동(줄기 꼭대기). 여기가 통째로 기울며 홉 박자를 낸다.
                { id: 'cap', box: [11, 1, 11], at: [0, 9.5, 0], pivot: [0, 9.5, 0], c: GILL },   // 주름살(갓 밑면)
                // 🚨 반점은 **윗면(y:-1)에만** 칠한다. y 를 열어 두면 같은 x/z 기둥의 옆면 칸까지
                //    흰색이 되어 갓 테두리에 흰 띠가 세로로 내려온다 — '반점'이 아니라 '줄무늬 갓'이다.
                { id: 'capDome', box: [15, 3, 15], at: [0, 11.5, 0], parent: 'cap', c: RED, paint: [
                    { c: RED2, y: 0 },
                    { c: SPOT, x: [1, 3], y: -1, z: [5, 7] }, { c: SPOT, x: [5, 7], y: -1, z: [1, 3] },
                    { c: SPOT, x: [11, 13], y: -1, z: [4, 6] }, { c: SPOT, x: [6, 8], y: -1, z: [11, 13] },
                    { c: SPOT, x: [2, 3], y: -1, z: [11, 12] },
                    { c: SPOT, x: [6, 8], y: [1, 2], z: -1 } ] },   // 테두리 정면에 한 점만 — 낮은 게임 카메라용
                { id: 'capTop', box: [11, 2, 11], at: [0, 14, 0], parent: 'cap', c: RED, paint: [
                    { c: SPOT, x: [1, 3], y: -1, z: [4, 6] }, { c: SPOT, x: [7, 9], y: -1, z: [2, 4] },
                    { c: SPOT, x: [4, 6], y: -1, z: [8, 10] } ] },
                { box: [5, 1, 5], at: [0, 15.5, 0], parent: 'cap', c: RED2 },
            ],
        };
    })();

    // ── 늑대 — 마크 늑대(회색 코트 · 흰 주둥이 · 쫑긋 귀 · 브러시 꼬리) ────────────────
    // 마크 늑대는 사족 섀시지만 다리가 **2관절**이라야 질주 사이클이 산다(드라이버가 무릎을
    // 따로 접는다) — `MobParts.quad()` 의 통짜 다리를 안 쓰고 여기서 직접 짠다.
    (function () {
        var FUR = 0x9a938a, DK = 0x6b645b, LT = 0xe4dfd4, NOSE = 0x2b2620;
        var legs = [];
        [['FL', -2, 4, 1], ['FR', 2, 4, 1], ['BL', -2, -4, 0], ['BR', 2, -4, 0]].forEach(function (L) {
            var nm = L[0], lx = L[1], lz = L[2], front = L[3];
            legs.push({ id: 'leg' + nm, box: [2, 4, 2], at: [lx, 4, lz], pivot: [lx, 6, lz], c: FUR,
                rot: [front ? 0.1 : -0.16, 0, 0] });
            legs.push({ id: 'knee' + nm, box: [2, 3, 3], at: [lx, 1.5, lz + 0.5], pivot: [lx, 3, lz],
                parent: 'leg' + nm, c: DK, rot: [front ? -0.1 : 0.3, 0, 0], paint: [{ c: 0x322d27, y: 0 }] });
        });
        M['wolf'] = {
            cell: 0.05, parts: [
                { id: 'body', box: [6, 7, 13], at: [0, 9.5, 0], c: FUR, paint: [
                    { c: LT, y: 0 }, { c: DK, y: -1 }, { c: DK, y: [4, 5], z: [8, 12] } ] },
                { box: [8, 8, 3], at: [0, 10, 5.5], c: FUR, paint: [{ c: LT, y: [0, 1] }] },   // 목 러프
                { id: 'head', box: [6, 5, 5], at: [0, 13.5, 8], pivot: [0, 11.5, 6], c: FUR, tag: 'head',
                  paint: E({ y: 2, inset: 1, ew: 1, eh: 2, white: 0xf2c23a, pupil: 0x2a1a12 }) },
                { box: [3, 3, 3], at: [0, 12.5, 11.5], parent: 'head', c: LT, paint: [
                    { c: NOSE, z: -1, y: -1 }, { c: NOSE, y: 0, z: [1, 2] } ] },               // 흰 주둥이 + 코
                { box: [2, 3, 1], at: [-1.5, 16.5, 7.5], parent: 'head', c: FUR, paint: [{ c: DK, y: -1 }] },
                { box: [2, 3, 1], at: [1.5, 16.5, 7.5], parent: 'head', c: FUR, paint: [{ c: DK, y: -1 }] },
                // 꼬리 — 밑동 피벗. 드라이버가 z 를 절대 대입하므로 치켜든 각은 x 로 준다.
                { id: 'tail', box: [3, 3, 8], at: [0, 13.5, -9.5], pivot: [0, 12, -6], c: FUR,
                  tag: 'tail', rot: [-0.45, 0, 0], paint: [{ c: LT, z: [0, 2] }] },
            ].concat(legs),
        };
    })();

    // ── 임프 — 작은 붉은 악마. 마크 피글린(두상·주둥이)+블레이즈(유황 발광)에서 빌려 온다 ──
    // 마크에 임프는 없다. 대신 네더 계열 두 몹의 문법을 섞는다: 붉은 살 · 앞으로 튀어나온
    // 주둥이 · 뒤로 휜 뿔 · 노란 유황 발광 눈 · 박쥐와 같은 언어의 막날개.
    (function () {
        var SK = 0xb0433a, SK2 = 0x7d2a24, HORN = 0xc9b490, HORN2 = 0xa08a68, MEM = 0x6b2924, EYE = 0xffca3a;
        var wing = function (s) {
            var id = s > 0 ? 'wingR' : 'wingL';
            return [
                { id: id, box: [3, 6, 1], at: [s * 4, 10.5, -2.5], pivot: [s * 2, 10.5, -2.5],
                  c: MEM, mat: { opacity: 0.86 }, tag: 'wing', s: s, rot: [0.18, s * -0.3, 0] },
                { box: [3, 4, 1], at: [s * 7, 10.5, -2.5], parent: id, c: MEM, mat: { opacity: 0.86 } },
                { box: [2, 2, 1], at: [s * 9.5, 11, -2.5], parent: id, c: MEM, mat: { opacity: 0.86 } },
                { box: [8, 1, 2], at: [s * 6, 13, -2.5], parent: id, c: SK2 },
            ];
        };
        M['imp'] = {
            cell: 0.05, parts: [
                { id: 'hipL', box: [2, 4, 2], at: [-2, 4, 0], pivot: [-2, 6, 0], c: SK },
                { id: 'kneeL', box: [2, 3, 3], at: [-2, 1.5, 0.5], pivot: [-2, 3, 0], parent: 'hipL', c: SK2,
                  paint: [{ c: 0x2a1512, y: 0 }] },
                { id: 'hipR', box: [2, 4, 2], at: [2, 4, 0], pivot: [2, 6, 0], c: SK },
                { id: 'kneeR', box: [2, 3, 3], at: [2, 1.5, 0.5], pivot: [2, 3, 0], parent: 'hipR', c: SK2,
                  paint: [{ c: 0x2a1512, y: 0 }] },
                { id: 'body', box: [6, 5, 4], at: [0, 8.5, 0], c: SK, paint: [{ c: SK2, y: 0 }, { c: 0xd9705f, z: -1, x: [1, 4], y: [1, 3] }] },
                { id: 'head', box: [7, 5, 6], at: [0, 13.5, 0.5], pivot: [0, 11, 0], c: SK, tag: 'head',
                  paint: [{ c: EYE, x: [1, 2], y: [2, 3], z: -1, mx: true },
                          { c: 0x8a2f10, x: [2, 2], y: [2, 3], z: -1, mx: true },
                          { c: 0x2a1210, x: [2, 4], y: [0, 0], z: -1 },
                          { c: 0xf4efe0, x: [2, 2], y: [1, 1], z: -1, mx: true }],
                  mat: { emissive: 0x3a0f08, emissiveIntensity: 0.18 } },
                { box: [3, 2, 2], at: [0, 12.5, 4], parent: 'head', c: SK2, paint: [{ c: 0x2a1210, z: -1, y: 0 }] },
                // 뒤로 휜 뿔 — 계단 2단으로 굽힘을 낸다(비스듬한 관 금지 규약).
                // ⚠️ 한 칸 굵기로 두면 뿔이 아니라 **더듬이**로 읽힌다(첫 판 실측) — 밑동을 2칸으로.
                // ⚠️ 수직으로 세우면 뿔이 아니라 **토끼 귀**로 읽힌다(첫 판 실측) — 바깥·뒤로 눕힌다.
                { box: [2, 3, 2], at: [-2.8, 16.5, -0.5], parent: 'head', c: HORN, rot: [0.2, 0, 0.55] },
                { box: [2, 2, 2], at: [-4.2, 18.2, -2], parent: 'head', c: HORN2, rot: [0.7, 0, 0.75] },
                { box: [2, 3, 2], at: [2.8, 16.5, -0.5], parent: 'head', c: HORN, rot: [0.2, 0, -0.55] },
                { box: [2, 2, 2], at: [4.2, 18.2, -2], parent: 'head', c: HORN2, rot: [0.7, 0, -0.75] },
                { box: [2, 2, 1], at: [-4.5, 14.5, -1], parent: 'head', c: SK2, rot: [0, 0, 0.5] },  // 뾰족 귀
                { box: [2, 2, 1], at: [4.5, 14.5, -1], parent: 'head', c: SK2, rot: [0, 0, -0.5] },
                { id: 'shL', box: [2, 5, 2], at: [-4, 9, 0], pivot: [-4, 11.5, 0], c: SK, rot: [0, 0, 0.14] },
                { id: 'elbowL', box: [2, 4, 2], at: [-4, 4.5, 0], pivot: [-4, 6.5, 0], parent: 'shL', c: SK2,
                  paint: [{ c: HORN, y: 0 }] },
                { id: 'shR', box: [2, 5, 2], at: [4, 9, 0], pivot: [4, 11.5, 0], c: SK, rot: [0, 0, -0.14] },
                { id: 'elbowR', box: [2, 4, 2], at: [4, 4.5, 0], pivot: [4, 6.5, 0], parent: 'shR', c: SK2,
                  paint: [{ c: HORN, y: 0 }] },
                // 화살촉 꼬리 — 밑동 피벗 + 끝에 촉 한 덩이.
                { id: 'tail', box: [1, 1, 7], at: [0, 7, -6], pivot: [0, 7.5, -2], c: SK2, tag: 'tail', rot: [0.5, 0, 0] },
                { box: [3, 1, 2], at: [0, 7, -10], parent: 'tail', c: HORN },
            ].concat(wing(-1), wing(1)),
        };
    })();

    root.ENEMY_MODELS = M;
})(typeof window !== 'undefined' ? window : globalThis);
