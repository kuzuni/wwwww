// ============================================================================
// 펫 25종 박스 모델 (pet-mount-minecraft-remake, 2026-08-21)
// ----------------------------------------------------------------------------
// 참고: 마인크래프트의 닭·고양이·늑대·여우·판다·거북·거미·북극곰·말·엔더드래곤.
// 규칙(마크 몹이 지키는 것 그대로):
//   · 종당 직육면체 6~14 덩이. 곡면 근사·비스듬한 관 금지.
//   · 눈·무늬·발굽은 **칸 색**으로 칠한다(덩어리를 더 붙이지 않는다).
//   · 종 판독은 비례 + 실루엣 부속 2~3개가 진다(마크 여우/늑대가 같은 섀시인 것과 같다).
//   · 색은 종 자연색.
// ============================================================================
(function (root) {
    'use strict';
    var P = root.MobParts, E = P.eyes, Q = P.quad, X = P.extend, T = P.tail;
    var M = {};

    // 달팽이 — 껍데기는 **옆에서 보는 나선 원반**이다(마크에 달팽이가 없어 나선을 칠로 낸다).
    //   계단으로 쌓아 올리면 '판때기 더미'로 읽힌다(첫 판에서 실측).
    var SNAIL_SH = 0xc07a2e, SNAIL_D = 0x7a4419, SNAIL_B = 0xe8cfae;
    M['Snail'] = { cell: 0.022, parts: [
        { id: 'body', box: [6, 3, 14], at: [0, 1.5, 1], c: SNAIL_B, paint: [{ c: 0xd2b28c, y: 0 }] },
        { id: 'head', box: [5, 4, 5], at: [0, 4, 8], pivot: [0, 3, 6], c: SNAIL_B, tag: 'head',
          paint: E({ y: 1, inset: 1, ew: 1, eh: 1 }), joint: { axis: 'y', amp: 0.12, f: 0.6 } },
        { box: [1, 5, 1], at: [-1.5, 8.5, 8], parent: 'head', c: SNAIL_B, paint: [{ c: 0x2b211a, y: -1 }] },
        { box: [1, 5, 1], at: [1.5, 8.5, 8], parent: 'head', c: SNAIL_B, paint: [{ c: 0x2b211a, y: -1 }] },
        // 나선 원반 — 팔각 실루엣(가로/세로/대각 상자 3장)으로 '둥근 껍데기'를 낸다.
        //   한 상자로 두면 정육면체라 껍데기가 아니라 **짐짝**으로 읽힌다(첫 판 실측).
        { box: [5, 11, 7], at: [0, 7.5, -2], c: SNAIL_SH, paint: [{ c: SNAIL_D, y: [4, 6] }] },
        { box: [5, 7, 11], at: [0, 7.5, -2], c: SNAIL_SH, paint: [{ c: SNAIL_D, z: [4, 6] }] },
        { box: [6, 9, 9], at: [0, 7.5, -2], c: SNAIL_SH, paint: [
            { c: SNAIL_D, y: [3, 4], z: [2, 6] }, { c: SNAIL_D, y: [3, 6], z: [3, 4] },
            { c: SNAIL_D, y: [5, 6], z: [4, 7] }, { c: 0xe0a25c, y: [-1, -1] } ] },
    ] };

    // 거북 — 마크 거북(초록 2단 등딱지 + 크림 배딱지 + 옆으로 뻗은 지느러미)
    (function () {
        var SHELL = 0x4f9440, DK = 0x2f5c2b, SKIN = 0xa8c86e, flip = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 2; i++) {
            flip.push({ box: [4, 2, 4], at: [s2 * 6, 2, i ? 4 : -4], pivot: [s2 * 4, 2.5, i ? 4 : -4],
                c: SKIN, tag: 'leg', gait: s2 * (i ? 1 : -1),
                joint: { axis: 'y', amp: 0.3, ph: i ? 0 : Math.PI, gain: 1.5 } });
        }
        M['Turtle'] = { cell: 0.023, parts: [
            { id: 'body', box: [9, 3, 12], at: [0, 2.5, 0], c: 0xd9d0a0, paint: [{ c: 0xbfb488, z: [4, 7] }] },
            { box: [10, 3, 12], at: [0, 5.5, 0], c: SHELL, paint: [{ c: DK, x: [0, 0] }, { c: DK, x: [-1, -1] }, { c: DK, z: [0, 0] }, { c: DK, z: [-1, -1] }] },
            { box: [7, 2, 9], at: [0, 8, 0], c: DK, paint: [{ c: SHELL, y: -1, x: [1, -2], z: [1, -2] }] },
            { id: 'head', box: [5, 4, 5], at: [0, 4.5, 8], pivot: [0, 4, 6], c: SKIN, tag: 'head',
              paint: E({ y: 1, inset: 1, ew: 1, eh: 1 }), joint: { axis: 'x', amp: 0.12, f: 0.7 } },
            T({ box: [2, 2, 3], at: [0, 3.5, -7.5], c: SKIN, amp: 0.2 }),
        ].concat(flip) };
    })();

    // 생쥐 — 큰 귀 두 장 + 분홍 꼬리
    (function () {
        var GR = 0x8f8f8f, PK = 0xe0909e;
        var q = Q({ c: GR, body: [6, 6, 10], legH: 2, legW: 2, legC: PK, legInset: 1,
            head: [6, 5, 6], headY: 9, headDrop: 1,
            face: E({ y: 2, inset: 1 }).concat([{ c: PK, x: [2, 3], y: 1, z: -1 }]) });
        M['Mouse'] = { cell: 0.021, parts: X(q, [
            { box: [1, 5, 5], at: [-3.5, 11.5, 6], parent: 'head', c: PK },
            { box: [1, 5, 5], at: [3.5, 11.5, 6], parent: 'head', c: PK },
            T({ box: [1, 1, 8], at: [0, 6, -9], c: PK, amp: 0.4, f: 2.4 }),
        ]) };
    })();

    // 닭 — 마크 닭(볏·부리·육수 + 옆에 붙은 날개판)
    (function () {
        var W = 0xf2ede4, RED = 0xd93a2a, ORG = 0xe8a020;
        M['Chicken'] = { cell: 0.023, parts: [
            { id: 'body', box: [6, 7, 8], at: [0, 8, 0], c: W, paint: [{ c: 0xdcd4c4, y: 0 }] },
            { id: 'head', box: [5, 5, 4], at: [0, 14, 3], pivot: [0, 11.5, 2], c: W, tag: 'head',
              paint: E({ y: 2, inset: 1, ew: 1, eh: 1 }), joint: { axis: 'x', amp: 0.12, f: 1 } },
            { box: [3, 2, 3], at: [0, 13.5, 6], parent: 'head', c: ORG },
            { box: [2, 2, 2], at: [0, 11.5, 5], parent: 'head', c: RED },
            { box: [2, 2, 5], at: [0, 17, 2.5], parent: 'head', c: RED },
            { box: [1, 5, 6], at: [-3.5, 8.5, 0], c: W, tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.3, f: 2 } },
            { box: [1, 5, 6], at: [3.5, 8.5, 0], c: W, tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.3, f: 2, ph: Math.PI } },
            T({ box: [5, 5, 2], at: [0, 12, -5], c: W, axis: 'x', amp: 0.1 }),
            { box: [2, 4, 2], at: [-1.6, 2, 0.5], pivot: [-1.6, 4, 0.5], c: ORG, tag: 'leg', gait: 1,
              joint: { axis: 'x', amp: 0.5, gain: 1.8 } },
            { box: [2, 4, 2], at: [1.6, 2, 0.5], pivot: [1.6, 4, 0.5], c: ORG, tag: 'leg', gait: -1,
              joint: { axis: 'x', amp: 0.5, ph: Math.PI, gain: 1.8 } },
        ] };
    })();

    // 고양이 — 마크 고양이(작은 머리 + 세운 귀 + 긴 꼬리). 줄무늬는 칠한다.
    (function () {
        var OR = 0xd98b3a, ST = 0xa85f1c, BL = 0xf0dcc0;
        var q = Q({ c: OR, body: [6, 6, 12], legH: 4, legW: 2, legC: OR, legSpread: 0.5,
            head: [6, 6, 5], headY: 11, headDrop: 1,
            face: E({ y: 2, inset: 1 }).concat([{ c: 0xf0b8b0, x: [2, 3], y: 1, z: -1 }]),
            bodyPaint: [{ c: BL, y: 0 }, { c: ST, z: 2 }, { c: ST, z: 5 }, { c: ST, z: 8 }] });
        M['Cat'] = { cell: 0.023, parts: X(q, [
            { box: [2, 2, 1], at: [-1.8, 14.5, 7], parent: 'head', c: OR },
            { box: [2, 2, 1], at: [1.8, 14.5, 7], parent: 'head', c: OR },
            T({ box: [2, 2, 9], at: [0, 9, -10.5], c: OR, amp: 0.3, f: 1.4,
                paint: [{ c: ST, z: [1, 2] }, { c: ST, z: [5, 6] }] }),
        ]) };
    })();

    // 강아지 — 마크 늑대(주둥이 + 쫑긋 귀 + 치켜든 꼬리)
    (function () {
        var TAN = 0x9e8a6c, LT = 0xe4dccb, NOSE = 0x2b241d;
        var q = Q({ c: TAN, body: [7, 7, 11], legH: 4, legW: 3, legC: LT,
            head: [7, 6, 6], headY: 12, headDrop: 1,
            face: E({ y: 2, inset: 1 }),
            bodyPaint: [{ c: LT, y: 0 }] });
        M['Dog'] = { cell: 0.023, parts: X(q, [
            { box: [4, 3, 3], at: [0, 11, 12], parent: 'head', c: LT, paint: [{ c: NOSE, z: -1, y: -1 }] },
            { box: [2, 3, 1], at: [-2, 16, 6], parent: 'head', c: TAN },
            { box: [2, 3, 1], at: [2, 16, 6], parent: 'head', c: TAN },
            T({ box: [3, 6, 3], at: [0, 12, -6.5], c: TAN, axis: 'x', amp: 0.35, f: 3,
                paint: [{ c: LT, y: -1 }] }),
        ]) };
    })();

    // 고슴도치 — 등을 덮는 **가시 언덕**(가시는 작고 촘촘해야 가시로 읽힌다. 성기게 심으면 빗이 된다)
    (function () {
        var BODY = 0xc9a877, SP = 0x4e3a28, SP2 = 0x6b5138, spikes = [];
        for (var r = 0; r < 7; r++) for (var i = 0; i < 6; i++) {
            var x = (r - 3) * 1.3, z = 3.6 - i * 1.6;
            var top = 9.2 - Math.abs(r - 3) * 0.55 - Math.abs(i - 2.5) * 0.35;
            spikes.push({ box: [1, 2, 1], at: [x, top, z], c: (r + i) % 2 ? SP : SP2 });
        }
        var q = Q({ c: BODY, body: [8, 6, 11], legH: 2, legW: 2, legC: 0x8a6f4e, legInset: 1,
            head: [5, 4, 5], headY: 5.5, headDrop: 1,
            face: E({ y: 1, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x2b241d, x: [2, 2], y: 0, z: -1 }]) });
        M['Hedgehog'] = { cell: 0.023, parts: X(q, [
            { box: [8, 3, 11], at: [0, 8.5, 0], c: SP, paint: [{ c: SP2, z: [3, 4] }, { c: SP2, z: [7, 8] }] },
        ].concat(spikes)) };
    })();

    // 곰 — 마크 북극곰 비례(큰 몸통 · 낮은 머리 · 짧고 굵은 다리), 색은 갈색곰
    (function () {
        var BR = 0x7a4d2b, MZ = 0xc7a077;
        var q = Q({ c: BR, body: [10, 9, 15], legH: 4, legW: 4, legC: 0x653e21,
            head: [7, 6, 7], headY: 11, headDrop: 1, face: E({ y: 3, inset: 1 }) });
        M['Bear'] = { cell: 0.025, parts: X(q, [
            { box: [4, 3, 2], at: [0, 10, 14.5], parent: 'head', c: MZ, paint: [{ c: 0x2b241d, z: -1, y: -1 }] },
            { box: [2, 2, 2], at: [-2.5, 14.5, 9.5], parent: 'head', c: BR },
            { box: [2, 2, 2], at: [2.5, 14.5, 9.5], parent: 'head', c: BR },
        ]) };
    })();

    // 타조 — 두 다리 + 긴 목(마크 닭의 문법을 늘린 것)
    (function () {
        var W = 0xf0ece2, SK = 0xe8b585, DK = 0x3a332c, ORG = 0xe8a020;
        M['Ostrich'] = { cell: 0.023, parts: [
            { id: 'body', box: [7, 8, 10], at: [0, 13, 0], c: W, paint: [{ c: DK, y: 0 }] },
            { box: [3, 8, 3], at: [0, 20, 3], pivot: [0, 16, 3], c: SK, joint: { axis: 'x', amp: 0.1, f: 0.7 } },
            { id: 'head', box: [4, 4, 5], at: [0, 25, 4], pivot: [0, 23, 3], c: SK, tag: 'head',
              paint: E({ y: 1, inset: 1, ew: 1, eh: 1 }), joint: { axis: 'x', amp: 0.16, f: 0.9 } },
            { box: [2, 2, 3], at: [0, 24.5, 8], parent: 'head', c: ORG },
            { box: [1, 6, 6], at: [-3.5, 13, -1], c: W, tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.16, f: 1.4 } },
            { box: [1, 6, 6], at: [3.5, 13, -1], c: W, tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.16, f: 1.4, ph: Math.PI } },
            T({ box: [6, 5, 3], at: [0, 14, -6], c: DK, axis: 'x', amp: 0.12 }),
            { box: [2, 9, 2], at: [-2, 4.5, 0], pivot: [-2, 9, 0], c: SK, tag: 'leg', gait: 1,
              joint: { axis: 'x', amp: 0.55, gain: 1.8 } },
            { box: [2, 9, 2], at: [2, 4.5, 0], pivot: [2, 9, 0], c: SK, tag: 'leg', gait: -1,
              joint: { axis: 'x', amp: 0.55, ph: Math.PI, gain: 1.8 } },
        ] };
    })();

    // 전갈 — 납작한 몸 + 앞으로 뻗은 집게 + 등 위로 계단처럼 올라가는 꼬리
    (function () {
        var CH = 0x9a5230, DK = 0x5d2f1c, legs = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 3; i++) {
            var z = 2.5 - i * 3;
            legs.push({ box: [4, 1, 1], at: [s2 * 5.5, 3.5, z], c: DK });                 // 바깥으로 뻗은 마디
            legs.push({ box: [1, 4, 1], at: [s2 * 7, 1.5, z], pivot: [s2 * 7, 3.5, z], c: DK,
                tag: 'leg', gait: s2 * (i % 2 ? 1 : -1), joint: { axis: 'x', amp: 0.2, ph: i * 1.1, gain: 1.6 } });
        }
        var tailSeg = [];
        for (var k = 0; k < 5; k++) {
            tailSeg.push({ box: [3, 3, 3], at: [0, 5.5 + k * 2.3, -6 - k * 1.1], c: CH, paint: [{ c: DK, y: 0 }] });
        }
        M['Scorpion'] = { cell: 0.023, parts: [
            { id: 'body', box: [8, 4, 12], at: [0, 4, 0], c: CH, paint: [{ c: DK, y: 0 }, { c: DK, z: [4, 5] }] },
            { id: 'head', box: [6, 3, 4], at: [0, 4.5, 7.5], pivot: [0, 4.5, 5.5], c: CH, tag: 'head',
              paint: E({ y: 1, inset: 1, ew: 1, eh: 1, pupil: null, white: 0xf3c14a }), joint: { axis: 'y', amp: 0.1, f: 0.8 } },
            { box: [2, 2, 4], at: [-3.5, 4.5, 10], c: DK },
            { box: [2, 2, 4], at: [3.5, 4.5, 10], c: DK },
            { box: [4, 3, 5], at: [-4.5, 4.5, 13], pivot: [-4.5, 4.5, 11], c: CH, tag: 'claw', s: 1,
              paint: [{ c: DK, z: [-2, -1], y: [1, 1] }] },
            { box: [4, 3, 5], at: [4.5, 4.5, 13], pivot: [4.5, 4.5, 11], c: CH, tag: 'claw', s: -1,
              paint: [{ c: DK, z: [-2, -1], y: [1, 1] }] },
            { box: [3, 4, 3], at: [0, 17.5, -11], c: DK },
            { box: [2, 3, 2], at: [0, 20.5, -10], c: 0xf3c14a, mat: { emissive: 0x8a6a10, emissiveIntensity: 0.5 } },
        ].concat(legs, tailSeg) };
    })();

    // 거미 — 마크 거미(뒷몸 + 머리가슴 + **꺾인 다리 8** + 빨간 눈)
    (function () {
        var BK = 0x2b2b2b, HAIR = 0x3d3d3d, legs = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 4; i++) {
            var z = 4 - i * 2.6;
            legs.push({ box: [6, 1, 1], at: [s2 * 6.5, 10, z], c: BK });                  // 몸에서 밖으로
            legs.push({ box: [1, 7, 1], at: [s2 * 9, 5.5, z], pivot: [s2 * 9, 10, z], c: BK,
                tag: 'leg', gait: s2 * (i % 2 ? 1 : -1),
                joint: { axis: 'x', amp: 0.16, ph: i * 1.3, gain: 1.8 } });
        }
        M['Spider'] = { cell: 0.023, parts: [
            { id: 'body', box: [9, 7, 9], at: [0, 9, -4], c: BK, paint: [{ c: HAIR, y: -1 }] },
            { id: 'head', box: [7, 6, 7], at: [0, 9, 5], pivot: [0, 9, 2], c: BK, tag: 'head',
              paint: [{ c: 0xd32f2f, x: [1, 2], y: [3, 3], z: -1, mx: true },
                      { c: 0xd32f2f, x: [2, 3], y: [1, 1], z: -1, mx: true }],
              joint: { axis: 'y', amp: 0.1, f: 0.8 } },
        ].concat(legs) };
    })();

    // 판다 — 마크 판다(흰 몸 + 검은 어깨띠·팔다리·귀·눈두덩)
    (function () {
        var W = 0xf2f0ea, BK = 0x232326;
        var q = Q({ c: W, body: [10, 9, 13], legH: 4, legW: 4, legC: BK,
            head: [8, 7, 7], headY: 11, headDrop: 1,
            face: [{ c: BK, x: [1, 2], y: [2, 4], z: -1, mx: true },
                   { c: 0xf4f0e6, x: [2, 2], y: [3, 3], z: -1, mx: true },
                   { c: BK, x: [3, 4], y: [0, 1], z: -1 }],
            bodyPaint: [{ c: BK, z: [8, 10] }] });
        M['Panda'] = { cell: 0.025, parts: X(q, [
            { box: [2, 2, 3], at: [-3, 15, 8], parent: 'head', c: BK },
            { box: [2, 2, 3], at: [3, 15, 8], parent: 'head', c: BK },
        ]) };
    })();

    // 그리핀 — 앞은 독수리(흰 머리·금부리·날개), 뒤는 사자(황갈 몸·꼬리술)
    (function () {
        var EAG = 0xe8dcc0, LION = 0xbb8a34, GOLD = 0xe8a81a;
        var q = Q({ c: LION, body: [8, 8, 13], legH: 5, legW: 3, legC: LION, legAmp: 0.36,
            head: [7, 6, 6], headY: 14, headDrop: 1, headC: EAG, face: E({ y: 2, inset: 1, pupil: 0x1c1a17 }),
            bodyPaint: [{ c: EAG, z: [9, 12] }] });
        M['Griffin'] = { cell: 0.024, parts: X(q, [
            { box: [3, 3, 4], at: [0, 13, 13], parent: 'head', c: GOLD },
            { box: [2, 8, 11], at: [-5.5, 12, -1], pivot: [-4, 15, -1], c: EAG, rot: [0, 0, 0.32], tag: 'wing', s: 1,
              paint: [{ c: 0xd9cbb0, y: [0, 2] }, { c: 0xbdae92, y: 0 }], joint: { axis: 'z', amp: 0.35, f: 2.2 } },
            { box: [2, 8, 11], at: [5.5, 12, -1], pivot: [4, 15, -1], c: EAG, rot: [0, 0, -0.32], tag: 'wing', s: -1,
              paint: [{ c: 0xd9cbb0, y: [0, 2] }, { c: 0xbdae92, y: 0 }], joint: { axis: 'z', amp: 0.35, f: 2.2, ph: Math.PI } },
            T({ box: [2, 2, 7], at: [0, 11, -9.5], c: LION, amp: 0.3, f: 1.6, paint: [{ c: 0x8a6432, z: [0, 2] }] }),
        ]) };
    })();


    // 유니콘 — 마크 말 모델(몸통 + 세운 목 + 갈기 + 긴 다리) + 뿔
    (function () {
        var W = 0xf5f2ec, MANE = 0xe79ac4, GOLD = 0xf0cf5e, HOOF = 0x4a4a4a;
        var q = Q({ c: W, body: [8, 8, 15], legH: 7, legW: 3, legC: W, hoof: HOOF,
            head: [5, 6, 8], headY: 20, headDrop: 3, legAmp: 0.4,
            face: E({ y: 3, inset: 1, ew: 1, eh: 2 }).concat([{ c: 0xd8b0a8, x: [1, 3], y: 0, z: -1 }]) });
        M['Unicorn'] = { cell: 0.024, parts: X(q, [
            { box: [4, 9, 5], at: [0, 16, 5.5], c: W },
            { box: [2, 9, 3], at: [0, 17, 3], c: MANE },
            { box: [2, 4, 2], at: [0, 22.5, 8.5], parent: 'head', c: MANE },
            { box: [1, 4, 1], at: [0, 24, 12], parent: 'head', c: GOLD },
            { box: [1, 2, 1], at: [0, 26.5, 12], parent: 'head', c: GOLD },
            { box: [2, 2, 1], at: [-1.6, 23, 7], parent: 'head', c: W },
            { box: [2, 2, 1], at: [1.6, 23, 7], parent: 'head', c: W },
            T({ box: [3, 10, 3], at: [0, 12, -8.5], c: MANE, axis: 'x', amp: 0.16, f: 1.2 }),
        ]) };
    })();

    // 검치호 — 큰 고양잇과 + 입 밖으로 내려오는 송곳니 두 개(종 판독은 이 둘이 진다)
    (function () {
        var TAN = 0xcf9147, DK = 0x9a6229, CR = 0xf2e2c4;
        var q = Q({ c: TAN, body: [9, 8, 15], legH: 5, legW: 4, legC: TAN,
            head: [8, 7, 7], headY: 13, headDrop: 1,
            face: E({ y: 3, inset: 1 }).concat([{ c: CR, x: [3, 4], y: [0, 1], z: -1 }]),
            bodyPaint: [{ c: CR, y: 0 }, { c: DK, z: [3, 4] }, { c: DK, z: [9, 10] }] });
        M['Saber Tooth'] = { cell: 0.025, parts: X(q, [
            { box: [1, 4, 1], at: [-1.6, 8.5, 13], parent: 'head', c: CR },
            { box: [1, 4, 1], at: [1.6, 8.5, 13], parent: 'head', c: CR },
            { box: [2, 2, 2], at: [-2.6, 16.5, 8.5], parent: 'head', c: TAN },
            { box: [2, 2, 2], at: [2.6, 16.5, 8.5], parent: 'head', c: TAN },
            T({ box: [2, 2, 6], at: [0, 11, -9.5], c: TAN, amp: 0.26, f: 1.4 }),
        ]) };
    })();

    // 호랑이 — 몸에 **칠한** 검은 줄무늬(줄무늬를 덩어리로 붙이면 갈기가 된다)
    (function () {
        var OR = 0xef8a1e, ST = 0x2a1c14, CR = 0xf7e9d2;
        var stripes = [{ c: CR, y: 0 }];
        for (var i = 0; i < 5; i++) stripes.push({ c: ST, z: [1 + i * 3, 1 + i * 3] });
        var q = Q({ c: OR, body: [8, 8, 15], legH: 5, legW: 3, legC: OR,
            head: [8, 7, 7], headY: 13, headDrop: 1,
            face: E({ y: 3, inset: 1 }).concat([
                { c: CR, x: [2, 5], y: [0, 1], z: -1 }, { c: ST, x: [3, 4], y: [1, 1], z: -1 },
                { c: ST, x: [0, 0], y: [4, 5], z: -1, mx: true }]),
            bodyPaint: stripes });
        M['Tiger'] = { cell: 0.025, parts: X(q, [
            { box: [2, 2, 2], at: [-2.6, 16.5, 8.5], parent: 'head', c: OR, paint: [{ c: ST, y: -1 }] },
            { box: [2, 2, 2], at: [2.6, 16.5, 8.5], parent: 'head', c: OR, paint: [{ c: ST, y: -1 }] },
            T({ box: [2, 2, 8], at: [0, 11, -10.5], c: OR, amp: 0.3, f: 1.4,
                paint: [{ c: ST, z: [1, 1] }, { c: ST, z: [4, 4] }, { c: ST, z: [7, 7] }] }),
        ]) };
    })();

    // 케르베로스 — 같은 섀시에 머리 셋. 가운데만 tag:'head'(드라이버가 하나만 잡는다)
    (function () {
        var DK = 0x343238, FIRE = 0xd2452e;
        var face = [{ c: FIRE, x: [1, 2], y: [3, 4], z: -1, mx: true }, { c: 0x2b2333, x: [2, 4], y: [0, 1], z: -1 }];
        var q = Q({ c: DK, body: [10, 8, 14], legH: 5, legW: 3, legC: 0x2b2333,
            head: [6, 6, 6], headY: 12, headDrop: 1, face: face,
            bodyPaint: [{ c: 0x2b2333, y: 0 }] });
        var side = function (sx, ph) {
            return [
                { id: 'h' + (sx > 0 ? 'R' : 'L'), box: [5, 5, 6], at: [sx * 4, 11.5, 8], pivot: [sx * 3, 9.5, 5],
                  c: DK, head: true, paint: face, joint: { axis: 'y', amp: 0.16, f: 1.2, ph: ph } },
                { box: [2, 2, 2], at: [sx * 5.4, 14.5, 6.5], parent: 'h' + (sx > 0 ? 'R' : 'L'), c: 0x2b2333 },
            ];
        };
        M['Cerberus'] = { cell: 0.024, parts: X(q, [
            { box: [2, 2, 2], at: [-2, 15.5, 7.5], parent: 'head', c: 0x2b2333 },
            { box: [2, 2, 2], at: [2, 15.5, 7.5], parent: 'head', c: 0x2b2333 },
            T({ box: [3, 3, 8], at: [0, 12, -10], c: DK, amp: 0.3, f: 1.6, paint: [{ c: FIRE, z: [0, 1] }] }),
        ].concat(side(-1, 0.8), side(1, 2.1))) };
    })();

    // 구미호 — 마크 여우(주황 등 + 흰 배·주둥이 + 검은 발) + 부채처럼 편 꼬리 5
    (function () {
        var OR = 0xe0682a, W = 0xf2ece0, BK = 0x2b241d, tails = [];
        for (var i = 0; i < 5; i++) {
            var a = (i - 2) * 0.34;
            tails.push({ box: [2, 3, 10], at: [Math.sin(a) * 6, 10 + Math.cos(a) * 1.5, -11], pivot: [0, 10, -6],
                rot: [0, a, 0], c: OR, paint: [{ c: W, z: [0, 3] }],
                joint: { axis: 'y', amp: 0.14, ph: i * 0.9, f: 1.3 }, tag: i === 2 ? 'tail' : undefined });
        }
        var q = Q({ c: OR, body: [6, 6, 13], legH: 4, legW: 2, legC: OR, hoof: BK, hoofH: 1,
            head: [6, 5, 6], headY: 11, headDrop: 1,
            face: E({ y: 2, inset: 1 }),
            bodyPaint: [{ c: W, y: 0 }] });
        M['Kitsune'] = { cell: 0.024, parts: X(q, [
            { box: [3, 2, 3], at: [0, 10, 12], parent: 'head', c: W, paint: [{ c: BK, z: -1, y: -1 }] },
            { box: [2, 3, 1], at: [-2, 14.5, 6], parent: 'head', c: OR, paint: [{ c: BK, y: -1 }] },
            { box: [2, 3, 1], at: [2, 14.5, 6], parent: 'head', c: OR, paint: [{ c: BK, y: -1 }] },
        ].concat(tails)) };
    })();

    // 서펀트 — 다리 없는 마디 사슬. 마디마다 y 축 관절을 걸어 물결친다.
    (function () {
        var TE = 0x3f9e8c, BEL = 0xd7e6c8, DK = 0x2c7a6c, segs = [];
        for (var i = 0; i < 5; i++) {
            var w = 7 - i, z = -2 - i * 4.5;
            segs.push({ box: [w, w, 5], at: [0, 4 + (i % 2 ? 0.8 : 0), z], pivot: [0, 4, z + 2.5], c: TE,
                paint: [{ c: BEL, y: 0 }, { c: DK, y: -1 }],
                joint: { axis: 'y', amp: 0.16, ph: i * 0.8, f: 1.1 } });
        }
        M['Serpent'] = { cell: 0.024, parts: [
            { id: 'head', box: [7, 6, 8], at: [0, 5, 5], pivot: [0, 4.5, 1], c: TE, tag: 'head',
              paint: E({ y: 3, inset: 1, white: 0xf6d24a, pupil: 0x241c17 }).concat([{ c: BEL, y: 0 }]),
              joint: { axis: 'y', amp: 0.2, f: 0.9 } },
            { box: [2, 1, 3], at: [0, 3, 10], parent: 'head', c: 0xd2453a },
        ].concat(segs) };
    })();

    // 트렌트 — 마크 참나무 문법(껍질 기둥 + 잎 덩이). 얼굴은 기둥에 칠한 옹이다.
    (function () {
        var BARK = 0x6b4a2a, BARK2 = 0x53381f, LEAF = 0x3f7a2e, LEAF2 = 0x59a03c;
        M['Treant'] = { cell: 0.026, parts: [
            { id: 'body', box: [8, 14, 7], at: [0, 9, 0], c: BARK, paint: [
                { c: BARK2, x: [2, 2] }, { c: BARK2, x: [5, 5] },
                { c: 0xf3c14a, x: [1, 2], y: [9, 10], z: -1, mx: true },
                { c: 0x2b1d10, x: [3, 4], y: [6, 6], z: -1 } ] },
            { box: [4, 3, 7], at: [-4, 3, 0], c: BARK, paint: [{ c: BARK2, y: 0 }] },
            { box: [4, 3, 7], at: [4, 3, 0], c: BARK, paint: [{ c: BARK2, y: 0 }] },
            { box: [3, 9, 3], at: [-6, 13, 0], pivot: [-4, 15, 0], rot: [0, 0, 0.5], c: BARK,
              tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.1, f: 0.5 } },
            { box: [3, 9, 3], at: [6, 13, 0], pivot: [4, 15, 0], rot: [0, 0, -0.5], c: BARK,
              tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.1, f: 0.5, ph: Math.PI } },
            { box: [14, 5, 12], at: [0, 18, 0], c: LEAF, paint: [{ c: LEAF2, y: -1 }] },
            { box: [10, 4, 9], at: [0, 22, 0], c: LEAF, paint: [{ c: LEAF2, y: -1 }] },
            { box: [5, 3, 5], at: [0, 25, 0], c: LEAF2 },
        ] };
    })();

    // 마법 사슴 — 긴 다리 + 가지 뿔(뿔은 세로 기둥 + 가로 가지로 각지게)
    (function () {
        var BL = 0x9cc4e8, W = 0xf2f7fb, ANT = 0xe6e0d0, antler = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) {
            antler.push({ box: [1, 7, 1], at: [s2 * 2, 24, 6], parent: 'head', c: ANT });
            antler.push({ box: [1, 1, 4], at: [s2 * 2, 26, 8], parent: 'head', c: ANT });
            antler.push({ box: [3, 1, 1], at: [s2 * 3.5, 27.5, 6], parent: 'head', c: ANT });
            antler.push({ box: [1, 3, 1], at: [s2 * 5, 28.5, 6], parent: 'head', c: ANT });
        }
        var q = Q({ c: BL, body: [7, 7, 14], legH: 8, legW: 2, legC: BL, hoof: 0x3c4a58,
            head: [5, 5, 7], headY: 21, headDrop: 3,
            face: E({ y: 2, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x3c4a58, x: [1, 3], y: 0, z: -1 }]),
            bodyPaint: [{ c: W, y: 0 }] });
        M['Enchanted Elk'] = { cell: 0.025, parts: X(q, [
            { box: [4, 8, 4], at: [0, 17, 5.5], c: BL },
            { box: [2, 2, 1], at: [-2.6, 22, 5], parent: 'head', c: W },
            { box: [2, 2, 1], at: [2.6, 22, 5], parent: 'head', c: W },
            T({ box: [3, 3, 3], at: [0, 13, -8], c: W, axis: 'x', amp: 0.2, f: 2 }),
        ].concat(antler)) };
    })();

    // 일렉트리 — 발광 구체 대신 **발광 큐브**. 번개 뿔·스파크 큐브가 회전한다.
    (function () {
        var Y = 0xf5d63a, GLOW = { emissive: 0xd8a400, emissiveIntensity: 0.75 }, SPARK = 0xfff59d;
        M['Electry'] = { cell: 0.024, parts: [
            { id: 'body', box: [9, 9, 9], at: [0, 6.5, 0], c: Y, mat: GLOW, paint: [
                { c: 0xf4f0e6, x: [1, 2], y: [5, 6], z: -1, mx: true },
                { c: 0x241c17, x: [2, 2], y: [5, 6], z: -1, mx: true },
                { c: 0xe07a1e, x: [3, 5], y: [2, 2], z: -1 },
                { c: 0xe0b41e, y: 0 } ] },
            { box: [2, 5, 2], at: [-3, 12, 1], c: SPARK, mat: GLOW, rot: [0, 0, 0.4] },
            { box: [2, 5, 2], at: [3, 12, 1], c: SPARK, mat: GLOW, rot: [0, 0, -0.4] },
            { box: [2, 2, 2], at: [-2.4, 1, 2.4], pivot: [-2.4, 2, 2.4], c: 0xe07a1e, tag: 'leg', gait: 1,
              joint: { axis: 'x', amp: 0.4, gain: 1.6 } },
            { box: [2, 2, 2], at: [2.4, 1, 2.4], pivot: [2.4, 2, 2.4], c: 0xe07a1e, tag: 'leg', gait: -1,
              joint: { axis: 'x', amp: 0.4, ph: Math.PI, gain: 1.6 } },
            { box: [2, 2, 2], at: [0, 15.5, -4], pivot: [0, 10, 0], c: SPARK, mat: GLOW,
              joint: { axis: 'y', amp: 1, f: 2, spin: true } },
            T({ box: [3, 3, 5], at: [0, 5, -6.5], c: SPARK, mat: GLOW, amp: 0.3, f: 2.2 }),
        ] };
    })();

    // 지니 — 다리 대신 **연기 꼬리**(아래로 갈수록 좁아지는 계단). 마크 유령·엔더 계열의 문법.
    (function () {
        var PU = 0x7b52c0, PU2 = 0x5c3a9a, GOLD = 0xe8c04a, SMOKE = { opacity: 0.82 };
        M['Genie'] = { cell: 0.024, parts: [
            { box: [4, 3, 4], at: [0, 2, 0], c: PU2, mat: SMOKE },
            { box: [6, 3, 5], at: [0, 5, 0], c: PU2, mat: SMOKE },
            { box: [8, 3, 6], at: [0, 8, 0], c: PU, mat: SMOKE },
            { id: 'body', box: [9, 8, 6], at: [0, 13.5, 0], c: PU, paint: [{ c: GOLD, y: [0, 1] }] },
            { box: [10, 2, 7], at: [0, 17.5, 0], c: GOLD },
            { id: 'head', box: [7, 6, 6], at: [0, 21.5, 0], pivot: [0, 18.5, 0], c: PU, tag: 'head',
              paint: E({ y: 2, inset: 1, white: 0xf4f0e6 }).concat([{ c: 0xf0e6d2, x: [2, 4], y: [0, 0], z: -1 }]),
              joint: { axis: 'y', amp: 0.12, f: 0.6 } },
            { box: [8, 3, 7], at: [0, 25.5, 0], parent: 'head', c: GOLD },
            { box: [2, 2, 2], at: [0, 27.5, 3], parent: 'head', c: 0x6fd8e0, mat: { emissive: 0x2aa0b0, emissiveIntensity: 0.6 } },
            { box: [3, 7, 3], at: [-6, 13, 0], pivot: [-4.5, 16, 0], rot: [0, 0, 0.35], c: PU,
              tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.12, f: 0.7 } },
            { box: [3, 7, 3], at: [6, 13, 0], pivot: [4.5, 16, 0], rot: [0, 0, -0.35], c: PU,
              tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.12, f: 0.7, ph: Math.PI } },
        ] };
    })();

    // 아기 드래곤 — 마크 엔더드래곤의 축소 문법(주둥이 + 뿔 + 막날개 + 마디 꼬리)
    (function () {
        var RED = 0xd23b2e, BELLY = 0xe8b878, MEM = 0x8f2a22, HORN = 0xf0e6d2;
        var q = Q({ c: RED, body: [8, 8, 12], legH: 3, legW: 3, legC: 0xa82c22,
            head: [7, 6, 7], headY: 11, headDrop: 1,
            face: E({ y: 3, inset: 1, white: 0xf6d24a, pupil: 0x241c17 }),
            bodyPaint: [{ c: BELLY, y: 0 }] });
        M['Baby Dragon'] = { cell: 0.024, parts: X(q, [
            { box: [4, 3, 4], at: [0, 10, 13], parent: 'head', c: RED, paint: [{ c: 0x2b1a16, z: -1, y: -1 }] },
            { box: [1, 3, 1], at: [-2, 15, 7], parent: 'head', c: HORN },
            { box: [1, 3, 1], at: [2, 15, 7], parent: 'head', c: HORN },
            { box: [2, 8, 10], at: [-5.5, 13, -1], pivot: [-4, 11, -1], rot: [0, 0, 0.45], c: MEM,
              paint: [{ c: RED, y: -1 }], tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.45, f: 2.4 } },
            { box: [2, 8, 10], at: [5.5, 13, -1], pivot: [4, 11, -1], rot: [0, 0, -0.45], c: MEM,
              paint: [{ c: RED, y: -1 }], tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.45, f: 2.4, ph: Math.PI } },
            T({ box: [4, 4, 6], at: [0, 7, -8.5], c: RED, amp: 0.3, f: 1.6, paint: [{ c: BELLY, y: 0 }] }),
            { box: [3, 3, 5], at: [0, 7.5, -13], c: RED, paint: [{ c: HORN, z: [0, 1] }] },
        ]) };
    })();

    // 유령 호랑이 — 호랑이 섀시 + 반투명 청록 + 발광(형태는 그대로 두고 재질만 유령으로)
    (function () {
        var CY = 0x8fe4ec, ST = 0x2f6f7a, GH = { opacity: 0.72, emissive: 0x2a8f9c, emissiveIntensity: 0.45 };
        var stripes = [{ c: 0xd8f6f8, y: 0 }];
        for (var i = 0; i < 5; i++) stripes.push({ c: ST, z: [1 + i * 3, 1 + i * 3] });
        var q = Q({ c: CY, body: [8, 8, 15], legH: 5, legW: 3, legC: CY,
            head: [8, 7, 7], headY: 13, headDrop: 1,
            face: E({ y: 3, inset: 1, white: 0xeafcff, pupil: 0x1d4a52 }).concat([
                { c: 0xd8f6f8, x: [2, 5], y: [0, 1], z: -1 }, { c: ST, x: [0, 0], y: [4, 5], z: -1, mx: true }]),
            bodyPaint: stripes });
        for (var k = 0; k < q.parts.length; k++) q.parts[k].mat = GH;
        M['Spectral Tiger'] = { cell: 0.025, parts: X(q, [
            { box: [2, 2, 2], at: [-2.6, 16.5, 8.5], parent: 'head', c: CY, mat: GH },
            { box: [2, 2, 2], at: [2.6, 16.5, 8.5], parent: 'head', c: CY, mat: GH },
            T({ box: [2, 2, 8], at: [0, 11, -10.5], c: CY, mat: GH, amp: 0.3, f: 1.4,
                paint: [{ c: ST, z: [1, 1] }, { c: ST, z: [4, 4] }, { c: ST, z: [7, 7] }] }),
        ]) };
    })();

    root.PET_MODELS = M;
})(typeof window !== 'undefined' ? window : globalThis);
