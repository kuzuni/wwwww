// ============================================================================
// 탈것 29종 박스 모델 (pet-mount-minecraft-remake, 2026-08-21)
// ----------------------------------------------------------------------------
// 참고: 마인크래프트의 말·당나귀·라마·양·돼지·염소·낙타·거북·벌·엔더드래곤·광차.
// 규칙은 펫과 같다(직육면체 · 칠한 얼굴 · 종 자연색). 여기에 **탑승 규격**이 하나 더 붙는다:
//   · `seat` = 안장 윗면의 y(칸). 빌더가 `cell = form.saddle / seat` 로 칸 크기를 정하므로
//     이 값 하나로 종 비례(다리:몸통)를 자유롭게 잡아도 탑승 높이는 항상 맞는다.
//   · 마구는 **마크 말안장** 문법이다 — 진갈색 가죽 패드 + 앞턱 + 뱃대끈. 금테 두른 왕좌를
//     얹지 않는다(종전 판이 그래서 29종이 전부 '금장 안장 얹은 사탕'으로 읽혔다).
// ============================================================================
(function (root) {
    'use strict';
    var P = root.MobParts, E = P.eyes, Q = P.quad, X = P.extend, T = P.tail;
    var M = {};

    var LEATHER = 0x6b4423, LEATHER2 = 0x4e2f16, IRON = 0x9aa0a6, DARKIRON = 0x4a4f55, WOOL = 0xd8cfc0;

    // ── 마크식 안장 ──────────────────────────────────────────────────────────
    // 가죽 패드 + 앞턱 + 뱃대끈 세 덩이. 그 이상 얹으면 종 실루엣을 덮는다.
    function saddle(o) {
        var w = o.w, sy = o.seat, z = o.z || 0, bh = o.bodyH, by = o.bodyY;
        return [
            { box: [w, 2, 11], at: [0, sy - 1, z], c: LEATHER, paint: [{ c: LEATHER2, y: 0 }] },
            { box: [w - 4, 2, 3], at: [0, sy + 0.5, z + 5], c: LEATHER2 },
            { box: [3, 2, 2], at: [0, sy + 1, z - 5], c: LEATHER2 },
            { box: [w + 1, bh, 3], at: [0, by, z + 1], c: LEATHER2 },
            { box: [2, 3, 4], at: [-(w / 2 + 0.5), sy - 3, z], c: LEATHER },
            { box: [2, 3, 4], at: [w / 2 + 0.5, sy - 3, z], c: LEATHER },
        ];
    }
    // 굴레 — 주둥이를 한 바퀴 두르는 얇은 띠 + 볼 고리(마크 말은 텍스처지만 여기선 1칸 띠)
    function bridle(o) {
        var hw = o.hw, hy = o.y, hz = o.z, hd = o.d;
        return [
            { box: [hw + 1, 1, 2], at: [0, hy, hz + hd / 2 - 2], parent: 'head', c: LEATHER2 },
            { box: [1, 4, 2], at: [-(hw / 2), hy + 1.5, hz + hd / 2 - 2], parent: 'head', c: LEATHER2 },
            { box: [1, 4, 2], at: [hw / 2, hy + 1.5, hz + hd / 2 - 2], parent: 'head', c: LEATHER2 },
        ];
    }

    // ── 사족 탈것 공통 ───────────────────────────────────────────────────────
    // o: quad() 인자 + { seat, tackW, tackZ, form }
    function rideQuad(o) {
        var q = Q(o);
        var bh = o.body[1], by = q.bodyY;
        var parts = X(q, (o.extra || []).concat(
            o.noSaddle ? [] : saddle({ w: o.tackW || (o.body[0] - 1), seat: o.seat, z: o.tackZ || 0, bodyH: bh + 1, bodyY: by })));
        return { seat: o.seat, form: o.form || 'quad', parts: parts, foot: o.foot, harness: o.harness };
    }

    // ── 말 계열 ─────────────────────────────────────────────────────────────
    // 마크 말: 몸통 + 비스듬히 선 목 + 머리 + 갈기 + 긴 다리. 목은 계단 두 칸으로 세운다
    // (비스듬한 관은 금지 — 그게 종전 판을 뭉갠 원인).
    function horse(o) {
        var C = o.c, MANE = o.mane, HOOF = o.hoof || 0x3c3228;
        var q = rideQuad({
            c: C, body: [11, 10, o.len], legH: o.legH, legW: 4, legC: C, hoof: HOOF,
            head: [5, 6, 9], headY: o.headY, headDrop: 4, legAmp: 0.44, headRot: [0.42, 0, 0],
            face: E({ y: 3, inset: 1, ew: 1, eh: 2 }).concat([{ c: 0x2b241d, x: [1, 3], y: 0, z: -1 }]),
            bodyPaint: o.bodyPaint, seat: o.seat, tackW: 8,
            extra: [
                { id: 'neck', box: [5, o.neckH, 6], at: [0, o.neckY, o.len / 2 - 1], c: C },      // 목
                { id: 'mane', box: [2, o.neckH + 2, 4], at: [0, o.neckY + 1.5, o.len / 2 - 3], c: MANE },
                { id: 'muzzle', box: [4, 4, 3], at: [0, o.headY - 2, o.headZ + 5], parent: 'head', c: C,
                  paint: [{ c: 0x2b241d, z: -1, y: [0, 1] }] },                       // 주둥이
                { id: 'forelock', box: [2, 3, 5], at: [0, o.headY + 4, o.headZ - 1], parent: 'head', c: MANE },
                { id: 'earL', box: [2, 2, 1], at: [-1.6, o.headY + 4, o.headZ - 2], parent: 'head', c: C },
                { id: 'earR', box: [2, 2, 1], at: [1.6, o.headY + 4, o.headZ - 2], parent: 'head', c: C },
                T({ box: [3, 10, 3], at: [0, o.tailY, -(o.len / 2 + 1.5)], c: MANE, axis: 'x', amp: 0.14, f: 1.2 }),
            ].concat(o.ears || []),
        });
        q.harness = 'bridle';
        q.head = { hw: 5, y: o.headY, z: o.headZ, d: 9 };
        return q;
    }

    // 조랑말 — 짧은 다리·짧은 몸(마크 새끼 말 비례)
    M['Pony'] = horse({ c: 0x9c7248, mane: 0x4c3823, len: 21, legH: 7, headY: 18, headZ: 11, neckY: 15, neckH: 8, seat: 15.5, tailY: 12 });
    // 갈색 말 — 마크 말 기본 비례(긴 다리·긴 목)
    M['Brown Horse'] = horse({ c: 0x6b4a2a, mane: 0x2f2117, len: 24, legH: 10, headY: 23, headZ: 12, neckY: 19, neckH: 9, seat: 19, tailY: 15 });
    // 당나귀 — 회갈색 + **긴 귀 두 장**(말과 갈리는 유일한 축이 귀다, 마크도 같다)
    M['Donkey'] = horse({ c: 0x7c7c7c, mane: 0x3a3a3a, len: 21, legH: 8, headY: 19, headZ: 11, neckY: 16, neckH: 8, seat: 16.5, tailY: 13,
        ears: [
            { id: 'longEarL', box: [2, 7, 2], at: [-2, 24, 8], parent: 'head', c: 0x7c7c7c, paint: [{ c: 0x3a3a3a, y: -1 }] },
            { id: 'longEarR', box: [2, 7, 2], at: [2, 24, 8], parent: 'head', c: 0x7c7c7c, paint: [{ c: 0x3a3a3a, y: -1 }] },
        ] });

    // 알파카 — 마크 라마(작은 몸 + 아주 긴 목 + 네모난 머리 + 짧은 귀)
    (function () {
        var C = 0xf0e4cc, D = 0xcbb894;
        var q = rideQuad({ c: C, body: [10, 9, 17], legH: 9, legW: 3, legC: D, seat: 17,
            head: [5, 6, 6], headY: 24, headDrop: 2, legAmp: 0.4,
            face: E({ y: 3, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x3c332a, x: [1, 3], y: [0, 1], z: -1 }]),
            extra: [
                { id: 'neck', box: [5, 10, 5], at: [0, 19, 5], c: C },
                { id: 'earL', box: [2, 3, 1], at: [-1.6, 27, 3], parent: 'head', c: C },
                { id: 'earR', box: [2, 3, 1], at: [1.6, 27, 3], parent: 'head', c: C },
                T({ box: [3, 4, 2], at: [0, 15, -7.5], c: C, axis: 'x', amp: 0.2 }),
            ] });
        q.harness = 'bridle'; q.head = { hw: 5, y: 24, z: 8.5, d: 6 };
        M['Alpaca'] = q;
    })();

    // 양 — 마크 양(털뭉치 몸통 = 큰 상자 + 작은 머리, 다리는 짧고 검다)
    (function () {
        var W = 0xeae6de, HEAD = 0xd9cbb2, LEG = 0x4a4238;
        M['Sheep'] = rideQuad({ c: W, body: [13, 11, 19], legH: 5, legW: 3, legC: LEG, seat: 16,
            head: [6, 6, 7], headY: 13, headDrop: 1, headC: HEAD, legAmp: 0.34,
            face: E({ y: 2, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x2b241d, x: [2, 3], y: [0, 0], z: -1 }]),
            bodyPaint: [{ c: 0xd8d2c6, y: 0 }],
            extra: [
                { box: [2, 2, 2], at: [-3.5, 14.5, 10], parent: 'head', c: HEAD },
                { box: [2, 2, 2], at: [3.5, 14.5, 10], parent: 'head', c: HEAD },
                T({ box: [3, 3, 3], at: [0, 12, -8.5], c: W, axis: 'x', amp: 0.2 }),
            ] });
    })();

    // 돼지 — 마크 돼지 그대로(분홍 통짜 + 코 + 짧은 다리 + 꼬리)
    (function () {
        var PK = 0xf58f9c, SN = 0xdb7180;
        M['Pig'] = rideQuad({ c: PK, body: [13, 11, 20], legH: 4, legW: 4, legC: 0xdb7180, seat: 15,
            head: [8, 8, 8], headY: 11, headDrop: 1, legAmp: 0.34,
            face: E({ y: 4, inset: 1 }),
            extra: [
                { box: [4, 3, 2], at: [0, 10, 15.5], parent: 'head', c: SN, paint: [{ c: 0x8a4e4b, z: -1, x: [1, 1] }, { c: 0x8a4e4b, z: -1, x: [2, 2] }] },
                { box: [2, 2, 1], at: [-2.5, 15.5, 9], parent: 'head', c: SN },
                { box: [2, 2, 1], at: [2.5, 15.5, 9], parent: 'head', c: SN },
                T({ box: [1, 3, 1], at: [0, 12, -9], c: SN, axis: 'x', amp: 0.3, f: 2.4 }),
            ] });
    })();

    // 멧돼지 — 돼지 섀시 + 어두운 갈기·엄니(종 판독은 엄니가 진다)
    (function () {
        var BR = 0x5b4636, DK = 0x392c22, TUSK = 0xf0ead8;
        M['Boar'] = rideQuad({ c: BR, body: [13, 11, 20], legH: 5, legW: 4, legC: DK, seat: 16,
            head: [8, 8, 9], headY: 12, headDrop: 1, legAmp: 0.36,
            face: E({ y: 4, inset: 1, white: 0xd8c8a8 }),
            bodyPaint: [{ c: DK, y: -1 }],
            extra: [
                { box: [4, 3, 2], at: [0, 11, 16.5], parent: 'head', c: DK },
                { box: [1, 3, 1], at: [-2.5, 9.5, 15.5], parent: 'head', c: TUSK },
                { box: [1, 3, 1], at: [2.5, 9.5, 15.5], parent: 'head', c: TUSK },
                { box: [2, 4, 6], at: [0, 18, 4], c: DK },
                T({ box: [1, 4, 1], at: [0, 13, -9], c: DK, axis: 'x', amp: 0.3, f: 2.2 }),
            ] });
    })();

    // 염소 — 마크 염소(흰회색 + 뒤로 굽은 뿔 + 턱수염)
    (function () {
        var C = 0xe2e2e0, D = 0x969696, HORN = 0xb8ac96;
        var q = rideQuad({ c: C, body: [10, 10, 18], legH: 8, legW: 3, legC: D, seat: 16.5,
            head: [6, 6, 7], headY: 18, headDrop: 2, legAmp: 0.42,
            face: E({ y: 3, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x3c332a, x: [2, 3], y: 0, z: -1 }]),
            extra: [
                { box: [4, 5, 4], at: [0, 15.5, 6], c: C },
                { box: [1, 4, 1], at: [-1.6, 22, 4], parent: 'head', c: HORN },
                { box: [1, 4, 1], at: [1.6, 22, 4], parent: 'head', c: HORN },
                { box: [1, 1, 4], at: [-1.6, 24, 1.5], parent: 'head', c: HORN },
                { box: [1, 1, 4], at: [1.6, 24, 1.5], parent: 'head', c: HORN },
                { box: [2, 3, 1], at: [0, 15, 8], parent: 'head', c: WOOL },
                T({ box: [2, 3, 2], at: [0, 13.5, -8], c: C, axis: 'x', amp: 0.2 }),
            ] });
        q.harness = 'bridle'; q.head = { hw: 6, y: 18, z: 9, d: 7 };
        M['Goat'] = q;
    })();

    // 낙타 — 마크 낙타(모래색 · 아주 긴 다리 · 혹 + 긴 목)
    (function () {
        var C = 0xe8b562, D = 0xc08c3c;
        var q = rideQuad({ c: C, body: [11, 10, 21], legH: 12, legW: 3, legC: C, seat: 21,
            head: [5, 6, 8], headY: 27, headDrop: 3, legAmp: 0.4,
            face: E({ y: 3, inset: 1, ew: 1, eh: 1 }).concat([{ c: 0x4a3a24, x: [1, 3], y: 0, z: -1 }]),
            tackZ: -1,
            extra: [
                { id: 'neck', box: [5, 10, 5], at: [0, 23, 6], c: C },
                { id: 'hump', box: [7, 4, 6], at: [0, 22, 3], c: D },                       // 앞 혹
                // 귀 — z 5 → 10.5. 두 가지를 한 번에 고친다(`diag-ride-sightline` 실측):
                //  ⑴ **원래 머리 위가 아니었다.** 머리는 칸 z 7.5~15.5 인데 귀가 z 4.5~5.5 라 머리
                //     뒤쪽 허공(목 윗면과도 1칸 뜬 자리)에 떠 있었다. `probe-mount-detached` 는
                //     **최상위 자식만** 훑어서 머리에 딸린 이 조각을 못 본다.
                //  ⑵ 그 자리가 하필 카메라→라이더 먼쪽 다리 시선 띠였다 — 낙타 실패의 범인이 이 귀다.
                //     레이는 z 가 클수록 높으므로 귀를 머리 위 제자리로 옮기면 레이가 귀 위로 지난다.
                { id: 'earL', box: [2, 2, 1], at: [-1.6, 30, 10.5], parent: 'head', c: C },
                { id: 'earR', box: [2, 2, 1], at: [1.6, 30, 10.5], parent: 'head', c: C },
                T({ box: [2, 7, 2], at: [0, 16, -9.5], c: D, axis: 'x', amp: 0.16 }),
            ] });
        q.harness = 'bridle'; q.head = { hw: 5, y: 27, z: 11, d: 8 };
        M['Camel'] = q;
    })();

    // 큰사슴 — 긴 다리 + 가지 뿔. 뿔은 **옆으로 벌리지 않는다**(탑승 시선을 가린다).
    (function () {
        var C = 0x7a5230, D = 0x5c3b20, ANT = 0xc9b48c, antler = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) {
            antler.push({ box: [2, 10, 2], at: [s2 * 2.5, 32, 4], parent: 'head', c: ANT });
            antler.push({ box: [2, 2, 7], at: [s2 * 2.5, 35, 8], parent: 'head', c: ANT });
            antler.push({ box: [2, 5, 2], at: [s2 * 2.5, 38, 11], parent: 'head', c: ANT });
            antler.push({ box: [5, 2, 2], at: [s2 * 5, 34, 2], parent: 'head', c: ANT });
            antler.push({ box: [2, 5, 2], at: [s2 * 7, 36, 2], parent: 'head', c: ANT });
        }
        var q = rideQuad({ c: C, body: [11, 11, 21], legH: 11, legW: 3, legC: D, seat: 21,
            head: [5, 7, 9], headY: 26, headDrop: 3, legAmp: 0.42,
            face: E({ y: 3, inset: 1, ew: 1, eh: 2 }).concat([{ c: 0x2b1f14, x: [1, 3], y: 0, z: -1 }]),
            bodyPaint: [{ c: D, y: 0 }],
            extra: [
                { box: [5, 9, 6], at: [0, 22, 6], c: C },
                { box: [2, 2, 1], at: [-2.6, 28, 5], parent: 'head', c: C },
                { box: [2, 2, 1], at: [2.6, 28, 5], parent: 'head', c: C },
                T({ box: [3, 3, 2], at: [0, 17, -9.5], c: 0xe8e2d4, axis: 'x', amp: 0.2 }),
            ].concat(antler) });
        q.harness = 'bridle'; q.head = { hw: 5, y: 26, z: 12, d: 9 };
        M['Elk'] = q;
    })();

    // 흑표범 — 낮게 깔린 고양잇과(마크 고양이를 크게 키운 비례) + 긴 꼬리
    (function () {
        var BK = 0x2b2b2b, D = 0x1c1c1c;
        M['Panther'] = rideQuad({ c: BK, body: [11, 9, 22], legH: 7, legW: 3, legC: BK, seat: 15,
            head: [8, 7, 8], headY: 13, headDrop: 1, legAmp: 0.46,
            face: E({ y: 3, inset: 1, white: 0xf3d24a, pupil: 0x161318 }).concat([{ c: D, x: [3, 4], y: [0, 1], z: -1 }]),
            bodyPaint: [{ c: D, y: 0 }],
            extra: [
                { box: [2, 2, 2], at: [-2.6, 16.5, 10], parent: 'head', c: BK },
                { box: [2, 2, 2], at: [2.6, 16.5, 10], parent: 'head', c: BK },
                T({ box: [2, 2, 11], at: [0, 11, -14], c: BK, amp: 0.3, f: 1.4 }),
            ] });
    })();

    // 공룡 — 두 발 수각류 실루엣(굵은 꼬리 + 앞으로 나온 머리). 마크엔 없어 실루엣만 빌린다.
    (function () {
        var G = 0x5a9e3c, D = 0x3d7028, BELLY = 0xcbd98c;
        M['Dino'] = rideQuad({ c: G, body: [12, 12, 20], legH: 8, legW: 4, legC: G, seat: 18,
            head: [8, 7, 12], headY: 22, headDrop: 4, legAmp: 0.44,
            face: E({ y: 4, inset: 1, white: 0xf3d24a, pupil: 0x161318 })
                .concat([{ c: 0x2b2118, x: [2, 5], y: 0, z: -1 }, { c: BELLY, y: 0 }]),
            bodyPaint: [{ c: BELLY, y: 0 }, { c: D, y: -1 }],
            extra: [
                { id: 'neck', box: [6, 7, 6], at: [0, 19, 7], c: G },                       // 목
                // 볏 — 앞으로 3칸(`diag-ride-sightline` 실측). 종전 `[0,26,12]` 의 **뒤끝**이 카메라→
                // 라이더 먼쪽 정강이 시선 띠를 **0.2칸 차이로** 스쳐 `probe-ride-clear` 를 깼다.
                // 레이는 z 가 클수록 높으니 앞으로 미는 것만으로 빠진다 — 높이는 한 칸도 안 건드렸다
                // (1칸 낮추는 안도 통과했지만 머리 위로 나온 몫이 반으로 줄어 볏이 죽는다. 실측 후 되돌렸다).
                { id: 'crest', box: [2, 2, 9], at: [0, 26, 15], parent: 'head', c: D },
                { box: [5, 5, 9], at: [0, 12, -11], c: G, paint: [{ c: BELLY, y: 0 }] },
                T({ box: [4, 4, 9], at: [0, 10, -18], c: D, amp: 0.24, f: 1.2 }),
            ] });
    })();

    // 거북 — 마크 거북을 탈것 크기로(2단 등딱지가 곧 안장 자리라 패드를 얇게)
    (function () {
        var SHELL = 0x4f9440, DK = 0x2f5c2b, SKIN = 0xa8c86e, flip = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 2; i++) {
            flip.push({ box: [5, 3, 6], at: [s2 * 8, 3, i ? 6 : -6], pivot: [s2 * 5.5, 4, i ? 6 : -6],
                c: SKIN, tag: 'leg', gait: s2 * (i ? 1 : -1),
                joint: { axis: 'y', amp: 0.3, ph: i ? 0 : Math.PI, gain: 1.5 } });
        }
        M['Turtle'] = { seat: 13, form: 'quad', noBridle: true, parts: [
            { id: 'body', box: [13, 4, 18], at: [0, 4, 0], c: 0xd9d0a0 },
            { box: [15, 4, 19], at: [0, 8, 0], c: SHELL, paint: [{ c: DK, x: 0 }, { c: DK, x: -1 }, { c: DK, z: 0 }, { c: DK, z: -1 }] },
            { box: [11, 3, 14], at: [0, 11.5, 0], c: DK, paint: [{ c: SHELL, y: -1, x: [1, -2], z: [1, -2] }] },
            { id: 'head', box: [6, 5, 6], at: [0, 7, 11], pivot: [0, 6, 9], c: SKIN, tag: 'head',
              paint: E({ y: 2, inset: 1, ew: 1, eh: 1 }), joint: { axis: 'x', amp: 0.12, f: 0.7 } },
            T({ box: [3, 3, 4], at: [0, 6, -11], c: SKIN, amp: 0.2 }),
        ].concat(flip, saddle({ w: 9, seat: 13, z: 0, bodyH: 4, bodyY: 11.5 })) };
    })();

    // 게 — 넓적한 등딱지 + 옆으로 벌어진 다리 + 앞 집게(마크에 없어 실루엣 4조건으로 짓는다)
    (function () {
        var RD = 0xd0472e, DK = 0x9c2f1c, legs = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 3; i++) {
            var z = 5 - i * 5;
            legs.push({ box: [5, 2, 2], at: [s2 * 10, 7, z], c: DK });
            legs.push({ box: [2, 6, 2], at: [s2 * 12, 3.5, z], pivot: [s2 * 12, 7, z], c: DK,
                tag: 'leg', gait: s2 * (i % 2 ? 1 : -1), joint: { axis: 'x', amp: 0.24, ph: i * 1.1, gain: 1.5 } });
        }
        M['Crab'] = { seat: 13, form: 'quad', noBridle: true, parts: [
            { id: 'body', box: [18, 6, 14], at: [0, 9, 0], c: RD, paint: [{ c: DK, y: 0 }, { c: DK, z: -1, y: [1, 2] }] },
            { id: 'head', box: [8, 3, 3], at: [0, 10.5, 8], pivot: [0, 10.5, 6], c: RD, tag: 'head',
              joint: { axis: 'y', amp: 0.08, f: 0.7 } },
            { box: [2, 4, 2], at: [-2.5, 14, 8], parent: 'head', c: RD, paint: [{ c: 0xf4f0e6, y: -1 }, { c: 0x241c17, y: -1, z: -1 }] },
            { box: [2, 4, 2], at: [2.5, 14, 8], parent: 'head', c: RD, paint: [{ c: 0xf4f0e6, y: -1 }, { c: 0x241c17, y: -1, z: -1 }] },
            { box: [5, 5, 7], at: [-8, 6, 11], pivot: [-8, 7, 7], c: RD, tag: 'claw', s: 1,
              paint: [{ c: DK, y: [2, 2], z: [-3, -1] }] },
            { box: [5, 5, 7], at: [8, 6, 11], pivot: [8, 7, 7], c: RD, tag: 'claw', s: -1,
              paint: [{ c: DK, y: [2, 2], z: [-3, -1] }] },
        ].concat(legs, saddle({ w: 9, seat: 13, z: -1, bodyH: 7, bodyY: 9 })) };
    })();

    // 장갑 코뿔소 — 회색 몸 + 철판 + 코뿔 하나(마크 철골렘의 판 문법을 빌린다)
    (function () {
        var GY = 0x8c8c8c, D = 0x5e5e5e, HORN = 0xe8e2d4;
        M['Armored Rhino'] = rideQuad({ c: GY, body: [14, 12, 22], legH: 6, legW: 5, legC: D, seat: 18,
            head: [8, 8, 9], headY: 13, headDrop: 1, legAmp: 0.34,
            face: E({ y: 4, inset: 1, ew: 1, eh: 1 }),
            bodyPaint: [{ c: D, y: 0 }],
            extra: [
                { box: [3, 4, 3], at: [0, 15.5, 17], parent: 'head', c: HORN },
                { box: [2, 2, 2], at: [0, 18, 14], parent: 'head', c: HORN },
                { box: [13, 2, 12], at: [0, 19.5, 1], c: IRON, paint: [{ c: DARKIRON, y: 0 }] },
                { box: [4, 4, 2], at: [-5, 15, 9], c: IRON },
                { box: [4, 4, 2], at: [5, 15, 9], c: IRON },
                T({ box: [2, 5, 2], at: [0, 14, -10], c: D, axis: 'x', amp: 0.2 }),
            ] });
    })();


    // ── 기계 계열 공통 ───────────────────────────────────────────────────────
    // 바퀴 = 축정렬 상자 3장으로 만든 **팔각 원반**(45° 회전 금지 — 격자가 깨지면 voxel 이 아니다).
    //   허브 상자에 피벗을 두고 tag:'wheel' 을 달면 드라이버가 x 축으로 굴린다.
    function wheel(id, x, y, z, R, w) {
        var TIRE = 0x22262a, HUB = 0x9aa0a6, r = R - 1, k = Math.round(R * 0.72), out = [];
        out.push({ id: id, box: [w, 3, 3], at: [x, y, z], pivot: [x, y, z], c: HUB, tag: 'wheel' });
        // 살(스포크) 두 짝 — 이게 없으면 굴러도 회전이 안 읽힌다
        out.push({ box: [w - 1, 2 * r, 2], at: [x, y, z], parent: id, c: HUB });
        out.push({ box: [w - 1, 2, 2 * r], at: [x, y, z], parent: id, c: HUB });
        // 테(림) — 팔각으로 둘러 **가운데를 비운다**. 꽉 채우면 바퀴가 아니라 검은 판이 된다.
        out.push({ box: [w, 2, Math.round(R * 1.2)], at: [x, y + r, z], parent: id, c: TIRE });
        out.push({ box: [w, 2, Math.round(R * 1.2)], at: [x, y - r, z], parent: id, c: TIRE });
        out.push({ box: [w, Math.round(R * 1.2), 2], at: [x, y, z + r], parent: id, c: TIRE });
        out.push({ box: [w, Math.round(R * 1.2), 2], at: [x, y, z - r], parent: id, c: TIRE });
        for (var i = 0; i < 4; i++) {
            out.push({ box: [w, 3, 3], at: [x, y + (i < 2 ? k : -k), z + (i % 2 ? k : -k)], parent: id, c: TIRE });
        }
        return out;
    }

    // 태엽 감개 — 기계 탈것의 정체를 정지 화면에서 알리는 부속. 계속 감긴다.
    function winder(id, x, y, z) {
        return [
            { id: id, box: [2, 2, 4], at: [x, y, z], pivot: [x, y, z], c: IRON, tag: 'spinner' },
            { box: [8, 2, 2], at: [x, y, z - 1], parent: id, c: IRON },
            { box: [2, 8, 2], at: [x, y, z - 1], parent: id, c: IRON },
        ];
    }

    // 태엽 생쥐 — 놋쇠 생쥐 + 등의 감개
    (function () {
        var BR = 0xd8a53a, D = 0x9c7420, PK = 0xe0a0a0;
        M['Clockwork Mouse'] = rideQuad({ c: BR, body: [12, 10, 19], legH: 4, legW: 3, legC: D, seat: 15,
            head: [8, 7, 8], headY: 11, headDrop: 1, legAmp: 0.4,
            face: E({ y: 3, inset: 1, white: 0x2b2b30, pupil: 0xf3c14a }),
            bodyPaint: [{ c: D, y: 0 }, { c: D, z: [5, 6] }],
            extra: [
                { box: [3, 2, 2], at: [0, 10, 15.5], parent: 'head', c: PK },
                { box: [1, 6, 6], at: [-4.5, 16, 8], parent: 'head', c: D },
                { box: [1, 6, 6], at: [4.5, 16, 8], parent: 'head', c: D },
                T({ box: [2, 2, 9], at: [0, 11, -12], c: IRON, amp: 0.3, f: 2 }),
            ].concat(winder('mw', 0, 15, -8.5)) });
    })();

    // 태엽 딱정벌레 — 구리 몸통 + 딱지날개 두 장 + 감개
    (function () {
        var CU = 0xb87333, D = 0x7a4a20, SH = 0x2f7a52;
        M['Clockwork Beetle'] = rideQuad({ c: CU, body: [15, 9, 20], legH: 4, legW: 3, legC: D, seat: 14,
            head: [7, 5, 6], headY: 9, headDrop: 1, legAmp: 0.42, tackW: 8,
            face: E({ y: 2, inset: 1, white: 0xf3c14a, pupil: 0x241c17 }),
            extra: [
                { box: [6, 3, 13], at: [-3.5, 12.5, -1], c: SH, paint: [{ c: 0x1f5c3c, x: 0 }] },
                { box: [6, 3, 13], at: [3.5, 12.5, -1], c: SH, paint: [{ c: 0x1f5c3c, x: -1 }] },
                { box: [1, 4, 1], at: [-2, 13, 12], parent: 'head', c: IRON },
                { box: [1, 4, 1], at: [2, 13, 12], parent: 'head', c: IRON },
            ].concat(winder('bw', 0, 13, -9)) });
    })();

    // 기계 거미 — 철제 몸통 + 꺾인 다리 6 + 위의 포탑
    (function () {
        var ST = 0x787878, D = 0x4a4a4a, legs = [];
        for (var s2 = -1; s2 <= 1; s2 += 2) for (var i = 0; i < 3; i++) {
            var z = 6 - i * 6;
            legs.push({ box: [7, 2, 2], at: [s2 * 10, 11, z], c: D });
            legs.push({ box: [2, 10, 2], at: [s2 * 13, 5, z], pivot: [s2 * 13, 11, z], c: ST,
                tag: 'leg', gait: s2 * (i % 2 ? 1 : -1), joint: { axis: 'x', amp: 0.26, ph: i * 1.2, gain: 1.6 } });
        }
        M['Mech Spider'] = { seat: 17, form: 'quad', noBridle: true, parts: [
            { id: 'body', box: [12, 6, 16], at: [0, 13, 0], c: ST, paint: [{ c: D, y: 0 }, { c: D, z: [7, 8] }] },
            { id: 'head', box: [8, 5, 6], at: [0, 13, 10], pivot: [0, 13, 7], c: D, tag: 'head',
              paint: [{ c: 0xf05a2a, x: [1, 2], y: [2, 3], z: -1, mx: true }], joint: { axis: 'y', amp: 0.1, f: 0.8 } },
            { box: [4, 3, 3], at: [0, 17.5, -4], c: D },
            { box: [2, 2, 7], at: [0, 18.5, 1], c: IRON },
        ].concat(legs, saddle({ w: 9, seat: 17, z: -1, bodyH: 7, bodyY: 13 })) };
    })();

    // ── 비행 계열 ───────────────────────────────────────────────────────────
    // 거대 벌 — 마크 벌(노랑/검정 줄무늬 + 반투명 날개 + 침 + 더듬이)
    (function () {
        var Y = 0xf0c020, BK = 0x2f2a24, WING = { opacity: 0.55 };
        M['Giant Bee'] = { seat: 14, form: 'fly', noBridle: true, parts: [
            { id: 'body', box: [13, 12, 18], at: [0, 8, 0], c: Y, paint: [
                { c: BK, z: [2, 4] }, { c: BK, z: [8, 10] }, { c: BK, z: [14, 16] }, { c: 0xd9a818, y: 0 } ] },
            { id: 'head', box: [10, 9, 6], at: [0, 9, 11], pivot: [0, 9, 8], c: BK, tag: 'head',
              paint: E({ y: 4, inset: 1, white: 0x1b1814, pupil: 0xf4f0e6 }), joint: { axis: 'x', amp: 0.1, f: 0.8 } },
            { box: [1, 5, 1], at: [-2.5, 15, 11], parent: 'head', c: BK },
            { box: [1, 5, 1], at: [2.5, 15, 11], parent: 'head', c: BK },
            // 🧊 세운 반투명 날개 — 눕힌 1칸 판은 부감에서 회색 슬래브였다(막날개 공통 처방).
            //    벌은 날개가 몸보다 작아야 벌로 읽히므로 익룡·드래곤보다 한 단계 작게 잡는다.
            { box: [2, 9, 9], at: [-6, 16, -1], pivot: [-5, 14, -1], rot: [0, 0, 0.22], c: 0xdfe8f0, mat: WING,
              tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.42, f: 3 } },
            { box: [2, 9, 9], at: [6, 16, -1], pivot: [5, 14, -1], rot: [0, 0, -0.22], c: 0xdfe8f0, mat: WING,
              tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.42, f: 3, ph: Math.PI } },
            { box: [3, 3, 4], at: [0, 6, -10], c: BK },
            { box: [1, 1, 4], at: [0, 5, -13], c: 0xd8d2c6 },
        ].concat(saddle({ w: 9, seat: 14, z: 0, bodyH: 9, bodyY: 8 })) };
    })();

    // 미니 드래곤 — 마크 엔더드래곤 문법(가는 목 + 뾰족 머리 + 막날개 + 마디 꼬리)
    (function () {
        var RED = 0xb83b2a, MEM = 0x8c3a1a, BELLY = 0xd9a06a, HORN = 0xe8dcc4;
        M['Mini Dragon'] = { seat: 15, form: 'fly', harness: 'harness', parts: [
            { id: 'body', box: [11, 10, 16], at: [0, 9, 0], c: RED, paint: [{ c: BELLY, y: 0 }] },
            { box: [5, 5, 8], at: [0, 13, 10], c: RED },                       // 목
            { id: 'head', box: [6, 5, 9], at: [0, 16, 17], pivot: [0, 14, 13], c: RED, tag: 'head',
              paint: E({ y: 2, inset: 1, ew: 1, eh: 2, white: 0xf3c14a, pupil: 0x241c17 })
                .concat([{ c: 0x2b1a16, x: [2, 3], y: 0, z: -1 }, { c: BELLY, y: 0 }]),
              joint: { axis: 'x', amp: 0.1, f: 0.7 } },
            { box: [1, 4, 1], at: [-2, 20, 14], parent: 'head', c: HORN },
            { box: [1, 4, 1], at: [2, 20, 14], parent: 'head', c: HORN },
            // 🧊 세운 막날개 — 익룡과 같은 문법(펫 그리핀 [2,8,11] 계보). 눕힌 판은 부감에서 널빤지다.
            { box: [3, 11, 11], at: [-6, 17, -3], pivot: [-4.5, 14, -3], rot: [0, 0, 0.3], c: MEM,
              paint: [{ c: RED, y: [0, 2] }], tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.34, f: 2 } },
            { box: [3, 11, 11], at: [6, 17, -3], pivot: [4.5, 14, -3], rot: [0, 0, -0.3], c: MEM,
              paint: [{ c: RED, y: [0, 2] }], tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.34, f: 2, ph: Math.PI } },
            { box: [5, 5, 7], at: [0, 8, -11], c: RED, paint: [{ c: BELLY, y: 0 }] },
            T({ box: [3, 3, 8], at: [0, 7.5, -17], c: RED, amp: 0.24, f: 1.4, paint: [{ c: MEM, z: [0, 2] }] }),
        ].concat(saddle({ w: 9, seat: 15, z: -1, bodyH: 11, bodyY: 9 })) };
    })();

    // 별고래 — 앞뒤로 **계단처럼 좁아지는** 몸통(한 상자로 두면 파란 벽돌이 된다) + 꼬리 지느러미
    (function () {
        var BL = 0x3a6fc0, D = 0x2a5296, BELLY = 0xd8e4f0, ST = 0xf3e8a0;
        M['Star Whale'] = { seat: 14, form: 'fly', noBridle: true, parts: [
            { id: 'body', box: [14, 12, 20], at: [0, 8, 0], c: BL, paint: [
                { c: BELLY, y: [0, 1] }, { c: ST, x: 0, y: [7, 7], z: [5, 5] }, { c: ST, x: 0, y: [9, 9], z: [12, 12] },
                { c: ST, x: -1, y: [8, 8], z: [8, 8] }, { c: ST, x: -1, y: [6, 6], z: [15, 15] } ] },
            { box: [11, 9, 6], at: [0, 8, 12], c: BL, paint: [{ c: BELLY, y: [0, 1] }] },
            { id: 'head', box: [8, 6, 6], at: [0, 8, 17], pivot: [0, 8, 14], c: BL, tag: 'head',
              paint: E({ y: 3, inset: 1, white: 0xf4f0e6 }).concat([{ c: BELLY, y: 0 }]),
              joint: { axis: 'x', amp: 0.08, f: 0.5 } },
            { box: [8, 2, 7], at: [-9, 5, 1], pivot: [-6, 6, 1], rot: [0, 0, -0.35], c: D, tag: 'wing', s: -1,
              joint: { axis: 'z', amp: 0.16, f: 1 } },
            { box: [8, 2, 7], at: [9, 5, 1], pivot: [6, 6, 1], rot: [0, 0, 0.35], c: D, tag: 'wing', s: 1,
              joint: { axis: 'z', amp: 0.16, f: 1, ph: Math.PI } },
            { box: [9, 7, 6], at: [0, 9, -12], c: BL },
            { box: [5, 4, 5], at: [0, 10, -16], c: D },
            T({ box: [17, 2, 6], at: [0, 11, -20], c: D, axis: 'x', amp: 0.2, f: 1.2 }),
        ].concat(saddle({ w: 9, seat: 14, z: 1, bodyH: 13, bodyY: 8 })) };
    })();

    // 익룡 — 얇은 몸 + 큰 막날개 + 뒤로 뻗은 볏(볏이 종 판독을 진다)
    // 🚨 **수평 널빤지 금지** (mount-riverbond-remake, 2026-08-25). 종전 판은 몸 9×8×20(가는 막대)에
    //    14×2×9 막을 **거의 수평(z 0.5)** 으로 양쪽에 달아, 3/4 부감 썸네일에서 몸이 막 밑으로 숨고
    //    타일 전체가 '갈색 널빤지 더미'로 읽혔다(비평가 만장일치 최악 타일). 처방 셋을 같이 건다:
    //      ⑴ **이면각을 세운다**(z 0.5 → 0.95) — 실루엣에 V 가 생겨 막과 몸이 분리돼 읽힌다.
    //      ⑵ **뒤로 쓸어(y sweep) 폭을 줄인다**(반폭 14 → 11) — 종전 총폭 37칸이 몸 길이(20)의 두 배라
    //         '날개가 곧 생물' 이었다. 지금은 총폭 33 → 몸 15 대비 비율이 실제 익룡에 가깝다.
    //      ⑶ **막을 3칸으로 두껍히고 앞전 손가락뼈를 얹는다** — 2칸 막은 부감에서 종잇장이다.
    //    ⚠️ 세우는 방향은 **위**다(아래로 내리면 `probe-ride-clear` 가 라이더 허벅지 가림으로 깨진다 —
    //       이 저장소가 여러 세션 실측으로 확인한 금지 구역).
    (function () {
        // 🎨 막을 **몸보다 어둡게** 잡는다(종전 MEM 0xc0a184 는 몸 TN 보다 밝아, vivid+ACES 를 지나면
        //    둘 다 크림색이 돼 타일 전체가 무채 덩어리로 읽혔다 — 비평가 'beige/muddy' 지적의 실체).
        var TN = 0x8b7358, D = 0x53412c, MEM = 0x6f5a42, CREST = 0xd8503a, BONE = 0xd9c9a8;
        M['Pterosaur'] = { seat: 14, form: 'fly', harness: 'harness', parts: [
            // 몸통 — 9×8×20(철사) → 11×10×15(덩어리). 길이를 줄이고 폭·높이를 키운다.
            // 등에 어두운 줄 + 밝은 배 — 단색 덩어리를 위/아래로 갈라 부피를 읽힌다(거북·공룡과 같은 화법).
            { id: 'body', box: [11, 10, 15], at: [0, 9, 0], c: TN,
              paint: [{ c: 0xb9a184, y: [0, 1] }, { c: D, y: 9 }] },
            { id: 'neck', box: [7, 7, 6], at: [0, 12, 9], c: TN, paint: [{ c: D, y: 6 }] },
            { id: 'head', box: [6, 6, 7], at: [0, 15, 14], pivot: [0, 13, 11], c: TN, tag: 'head',
              paint: E({ y: 2, inset: 1, ew: 1, eh: 1, white: 0xf3c14a, pupil: 0x241c17 }),
              joint: { axis: 'x', amp: 0.1, f: 0.7 } },
            { id: 'beak', box: [4, 3, 6], at: [0, 14, 19], parent: 'head', c: TN,
              paint: [{ c: BONE, y: 2 }, { c: D, y: 0 }] },                 // 부리 — 몸색 몸통·각질 윗면·어두운 아래턱
            // 볏 — 종 판독의 주역(머리보다 작게). 🚨 자리는 **눈대중이 아니라 산수로** 잡았다
            // (`tools/diag-ride-sightline.js`, 2026-08-25): 종전 `at [0,19,10]` 은 카메라→라이더 먼쪽
            // 정강이 시선 띠 한복판에 앉아 `probe-ride-clear` 익룡 shinR 을 50% 가리는 **유일한 범인**
            // 이었다. 레이는 z 가 클수록 높으므로 **앞으로 밀면 레이 아래로 빠진다** — z 10 → 17 이면
            // 로컬 zmin 0.394 에서 레이가 볏 위로 지난다(여유 1.5칸). 내리는 길(2.5칸)은 볏이 머리에
            // 파묻혀 종이 죽고, 올리는 길은 이번엔 허벅지 레이에 새로 걸린다 — 앞으로 미는 것만 남았다.
            // y 19 → 18 은 볏 밑면(칸 15.5)을 부리 윗면(15.5)에 정확히 붙여 틈을 없애려는 것이다.
            // 조형은 프테라노돈(뒤로 뻗은 볏) → **타페야라(주둥이 위 돛볏)** 로 간다 — 종 판독은 오히려 세진다.
            { id: 'crest', box: [2, 5, 6], at: [0, 18, 17], parent: 'head', c: CREST },
            // 🧊 **날개는 세운 판**이다 — 펫 그리핀(`mobs-pets.js` [2,8,11])과 같은 문법.
            //    가로로 눕힌 판(종전 [14,2,9])은 3/4 부감에서 넓은 면이 카메라를 마주 봐 몸을 덮고
            //    '널빤지'가 된다. x 로 얇고 y 로 높은 판은 같은 각도에서 **모서리**를 보여 실루엣에
            //    날개로 읽힌다. z 를 뒤로 물려(−3) 라이더 다리 대역(안장 z −6.5~4.5)의 바깥에 둔다.
            { id: 'wingL', box: [3, 10, 10], at: [-6, 17, -3], pivot: [-4.5, 14, -3], rot: [0, 0, 0.26], c: MEM,
              paint: [{ c: D, y: [0, 2] }], tag: 'wing', s: 1, joint: { axis: 'z', amp: 0.3, f: 1.8 } },
            { parent: 'wingL', box: [3, 2, 10], at: [-6, 22, -3], c: D },    // 앞전 손가락뼈 — 막 위쪽에 뼈대
            { id: 'wingR', box: [3, 10, 10], at: [6, 17, -3], pivot: [4.5, 14, -3], rot: [0, 0, -0.26], c: MEM,
              paint: [{ c: D, y: [0, 2] }], tag: 'wing', s: -1, joint: { axis: 'z', amp: 0.3, f: 1.8, ph: Math.PI } },
            { parent: 'wingR', box: [3, 2, 10], at: [6, 22, -3], c: D },
            { box: [4, 4, 8], at: [0, 8, -11], c: TN },
        ].concat(saddle({ w: 8, seat: 14, z: -1, bodyH: 9, bodyY: 9 })) };
    })();

    // ── 호버 계열 ───────────────────────────────────────────────────────────
    (function () {
        var DECK = 0x8a5a2e, RAIL = 0x2f7fbf, GLOW = { emissive: 0x1f6fa8, emissiveIntensity: 0.9 };
        M['Hover Board'] = { seat: 5, form: 'flat', flat: true, noBridle: true, parts: [
            { id: 'body', box: [12, 3, 34], at: [0, 3, 0], c: DECK, paint: [
                { c: 0x6b4423, z: [4, 5] }, { c: 0x6b4423, z: [16, 17] }, { c: 0x6b4423, z: [28, 29] } ] },
            { box: [14, 2, 8], at: [0, 1, 12], c: RAIL, mat: GLOW, tag: 'glow' },
            { box: [14, 2, 8], at: [0, 1, -12], c: RAIL, mat: GLOW, tag: 'glow' },
            { box: [13, 1, 30], at: [0, 4.5, 0], c: 0x3c3228 },
            { box: [3, 2, 4], at: [0, 5.5, 14], c: RAIL, mat: GLOW, tag: 'glow' },
        ] };
    })();
    (function () {
        var C = 0x35a877, D = 0x1f7a55, GLOW = { emissive: 0x1a8f66, emissiveIntensity: 0.9 };
        M['Hover Disk'] = { seat: 5, form: 'flat', flat: true, noBridle: true, parts: [
            { id: 'body', box: [30, 3, 16], at: [0, 3, 0], c: C },
            { box: [16, 3, 30], at: [0, 3, 0], c: C },
            { box: [24, 3, 24], at: [0, 3, 0], c: C, paint: [{ c: D, y: 0 }] },
            { box: [26, 1, 12], at: [0, 1, 0], c: 0x5ef0b0, mat: GLOW, tag: 'glow' },
            { box: [12, 1, 26], at: [0, 1, 0], c: 0x5ef0b0, mat: GLOW, tag: 'glow' },
            { box: [14, 1, 14], at: [0, 4.8, 0], c: D },
        ] };
    })();

    // ── 바퀴 계열 ───────────────────────────────────────────────────────────
    (function () {
        var FR = 0xc0392b, D = 0x8c2418;
        M['Bike'] = { seat: 16, form: 'wheeled', noBridle: true, bar: [0, 17, 9], parts: [
            { id: 'body', box: [3, 3, 20], at: [0, 12, 0], c: FR },
            { box: [3, 8, 3], at: [0, 13, -7], c: FR },
            { box: [3, 9, 3], at: [0, 13, 8], c: FR },
            { box: [3, 8, 8], at: [0, 9, 3], c: D },
            { box: [7, 2, 8], at: [0, 16, -7], c: 0x2b2b30 },
            { box: [3, 2, 5], at: [0, 8, 0], c: 0x9aa0a6 },
        ].concat(wheel('wF', 0, 8, 12, 8, 3), wheel('wB', 0, 8, -12, 8, 3)) };
    })();
    (function () {
        var C = 0x4a90c4, D = 0x2f6b96;
        M['One-Wheel Droid'] = { seat: 18, form: 'wheeled', noBridle: true, parts: [
            { id: 'body', box: [11, 9, 12], at: [0, 16, 0], c: C, paint: [{ c: D, y: 0 }] },
            { box: [9, 3, 3], at: [0, 17, 7], c: 0x1b2126, paint: [{ c: 0x5ef0ff, z: -1 }] },
            { box: [3, 5, 3], at: [0, 23, -2], c: D },
            { box: [2, 2, 2], at: [0, 26, -2], c: 0xf05a2a, mat: { emissive: 0xb03a10, emissiveIntensity: 0.8 }, tag: 'glow' },
            { box: [13, 2, 6], at: [0, 11, 0], c: D },
        ].concat(wheel('w1', 0, 10, 0, 10, 5)) };
    })();
    (function () {
        var Y = 0xe0a41a, D = 0xb07f10, BED = 0x5b5f66;
        M['Dump Truck'] = { seat: 16, form: 'wheeled', noBridle: true, bar: [0, 17, 8], parts: [
            { id: 'body', box: [14, 5, 30], at: [0, 10, 0], c: D },
            { box: [14, 8, 10], at: [0, 16, 9], c: Y, paint: [{ c: 0x1b2126, z: -1, y: [3, 6] }] },
            { box: [15, 7, 16], at: [0, 16, -6], c: BED, paint: [{ c: 0x40444a, y: -1 }] },
            { box: [16, 2, 3], at: [0, 12, 15], c: 0x9aa0a6 },
            { box: [3, 2, 2], at: [-5, 19, 14], c: 0xf3e08a, mat: { emissive: 0xb09010, emissiveIntensity: 0.7 }, tag: 'glow' },
            { box: [3, 2, 2], at: [5, 19, 14], c: 0xf3e08a, mat: { emissive: 0xb09010, emissiveIntensity: 0.7 }, tag: 'glow' },
        ].concat(wheel('t1', -7, 7, 10, 7, 3), wheel('t2', 7, 7, 10, 7, 3),
                 wheel('t3', -7, 7, -9, 7, 3), wheel('t4', 7, 7, -9, 7, 3)) };
    })();
    (function () {
        var C = 0xdcdcda, D = 0xa0a0a0, BR = 0xe0b040;
        M['Cleaning Robot'] = { seat: 14, form: 'wheeled', noBridle: true, bar: [0, 15, 8], parts: [
            { id: 'body', box: [22, 7, 12], at: [0, 8, 0], c: C },
            { box: [12, 7, 22], at: [0, 8, 0], c: C, paint: [{ c: D, y: 0 }] },
            { box: [18, 7, 18], at: [0, 8, 0], c: C, paint: [{ c: D, y: 0 }] },
            { box: [10, 3, 10], at: [0, 12.5, 0], c: D, paint: [{ c: 0x5ef0ff, y: -1 }] },
            { box: [16, 2, 4], at: [0, 12, 8], c: 0x1b2126, paint: [{ c: 0x5ef0ff, z: -1 }] },
        ].concat(winder('cb1', -8, 4, 9), winder('cb2', 8, 4, 9),
                 wheel('cw1', -8, 3, -6, 3, 2), wheel('cw2', 8, 3, -6, 3, 2)) };
    })();
    (function () {
        var ST = 0x5b6b7a, D = 0x3c4854, GLOW = { emissive: 0x1f8fa8, emissiveIntensity: 0.8 };
        M['Bipedal Mech'] = { seat: 26, form: 'biped', noBridle: true, bar: [0, 27, 8], parts: [
            { id: 'body', box: [14, 12, 12], at: [0, 22, 0], c: ST, paint: [{ c: D, y: 0 }, { c: D, z: 0 }] },
            { box: [10, 4, 4], at: [0, 26, 7], c: 0x1b2126, paint: [{ c: 0x5ef0ff, z: -1 }] },
            { box: [5, 8, 5], at: [-9, 22, 0], pivot: [-8, 27, 0], c: D, tag: 'wing', s: 1,
              joint: { axis: 'x', amp: 0.3, f: 1 } },
            { box: [5, 8, 5], at: [9, 22, 0], pivot: [8, 27, 0], c: D, tag: 'wing', s: -1,
              joint: { axis: 'x', amp: 0.3, f: 1, ph: Math.PI } },
            { box: [6, 16, 6], at: [-4, 8, 0], pivot: [-4, 16, 0], c: ST, tag: 'leg', gait: 1,
              paint: [{ c: D, y: [0, 2] }], joint: { axis: 'x', amp: 0.45, gain: 1.6 } },
            { box: [6, 16, 6], at: [4, 8, 0], pivot: [4, 16, 0], c: ST, tag: 'leg', gait: -1,
              paint: [{ c: D, y: [0, 2] }], joint: { axis: 'x', amp: 0.45, ph: Math.PI, gain: 1.6 } },
            { box: [8, 2, 10], at: [-4, 1, 1], c: D },
            { box: [8, 2, 10], at: [4, 1, 1], c: D },
            { box: [3, 3, 3], at: [0, 29, 0], c: 0x5ef0ff, mat: GLOW, tag: 'glow' },
        ].concat(saddle({ w: 9, seat: 26, z: -2, bodyH: 13, bodyY: 22 })) };
    })();

    root.MOUNT_MODELS = M;
    root.MOUNT_TACK = { saddle: saddle, bridle: bridle, LEATHER: LEATHER, LEATHER2: LEATHER2, IRON: IRON, DARKIRON: DARKIRON };
})(typeof window !== 'undefined' ? window : globalThis);
