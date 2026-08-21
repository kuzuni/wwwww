// ============================================================================
// MobData — 펫·탈것 종별 박스 모델 (pet-mount-minecraft-remake, 2026-08-21)
// ----------------------------------------------------------------------------
// 마인크래프트 몹 모델의 문법 그대로다(`mobs.js` 머리말 참조):
//   · 한 종 = 직육면체 6~14 덩이. 곡면 근사(구·원뿔·비스듬한 관) **금지** — 그게 종전 판이
//     '사탕 덩어리'로 읽힌 원인이다.
//   · 눈·무늬·발굽·부리는 **덩어리를 더 붙이지 않고 칸 색으로 칠한다**(마크의 텍스처 자리).
//   · 색은 종 자연색. 마크 돼지는 분홍이고 말은 갈색이다.
//   · 비례가 곧 종이다 — 마크 돼지/소/양이 같은 사족 섀시에 크기·머리·부속만 바꾼 것처럼,
//     여기서도 `quad()` 하나에서 갈라져 나온다.
//
// 좌표는 전부 **칸**. y=0 이 발바닥, +z 가 정면. `cell` 이 칸의 월드 크기다.
// ============================================================================
(function (root) {
    'use strict';

    // ── 얼굴 픽셀 ────────────────────────────────────────────────────────────
    // 마크 몹의 눈은 튀어나온 알이 아니라 **머리 앞면에 칠한 두 칸**이다. 종전 판은 흰 판 +
    // 동공 큐브를 얼굴 밖으로 세워 뒀는데(펫 25종 공통), 그 두 덩이가 240px 에서 '얼굴에 박힌
    // 나사'로 읽혔다. 앞면 칸을 칠하면 실루엣이 안 더러워지면서 표정은 그대로 산다.
    function eyes(o) {
        o = o || {};
        var inset = o.inset === undefined ? 1 : o.inset;
        var ew = o.ew || 2, eh = o.eh || 2, y = o.y === undefined ? 3 : o.y;
        var white = o.white === undefined ? 0xf4f0e6 : o.white;
        var pupil = o.pupil === undefined ? 0x241c17 : o.pupil;
        var z = o.z === undefined ? -1 : o.z;
        var r = [{ c: white, x: [inset, inset + ew - 1], y: [y, y + eh - 1], z: z, mx: true }];
        if (pupil !== null) r.push({ c: pupil, x: [inset + ew - 1, inset + ew - 1], y: [y, y + eh - 1], z: z, mx: true });
        return r;
    }
    // 옆면에 눈이 붙는 종(말·양·물고기 계열은 마크에서도 머리 옆면이다)
    function eyesSide(o) {
        o = o || {};
        var y = o.y === undefined ? 3 : o.y, z = o.z === undefined ? -3 : o.z, ez = o.ez || 2, eh = o.eh || 2;
        var zs = [z, z + ez - 1];
        return [
            { c: o.white === undefined ? 0xf4f0e6 : o.white, x: 0, y: [y, y + eh - 1], z: zs },
            { c: o.white === undefined ? 0xf4f0e6 : o.white, x: -1, y: [y, y + eh - 1], z: zs },
            { c: o.pupil === undefined ? 0x241c17 : o.pupil, x: 0, y: [y, y + eh - 1], z: [zs[0], zs[0]] },
            { c: o.pupil === undefined ? 0x241c17 : o.pupil, x: -1, y: [y, y + eh - 1], z: [zs[0], zs[0]] },
        ];
    }

    // ── 사족 섀시 ────────────────────────────────────────────────────────────
    // 마크 돼지·소·양·말이 공유하는 뼈대: 몸통 한 덩이 + 머리 한 덩이 + 다리 넷.
    // 다리는 **어깨 높이에 피벗**을 두고 아래로 내려 단다(가운데를 축으로 돌리면 프로펠러가 된다).
    //  o: { c 몸색 · body [w,h,d] · legH 다리 길이 · legW 다리 굵기 · legC 다리색 · hoof 발굽색 ·
    //       head [w,h,d] · headY 머리 중심 · headDrop 머리를 몸통 앞면에서 얼마나 겹칠지 ·
    //       headC · face 얼굴 칠 규칙 · bodyPaint · legSpread 다리 x 안쪽 여유 · bodyZ }
    function quad(o) {
        var bw = o.body[0], bh = o.body[1], bl = o.body[2];
        var legH = o.legH, legW = o.legW || 3, legC = o.legC === undefined ? o.c : o.legC;
        var bodyY = o.bodyY === undefined ? legH + bh / 2 : o.bodyY;
        var bz = o.bodyZ || 0;
        var lx = bw / 2 - legW / 2 - (o.legSpread || 0);
        var lzF = bl / 2 - legW / 2 - (o.legInset === undefined ? 0.5 : o.legInset) + bz;
        var lzB = -(bl / 2 - legW / 2 - (o.legInsetB === undefined ? 0.5 : o.legInsetB)) + bz;
        var hoofPaint = o.hoof ? [{ c: o.hoof, y: [0, o.hoofH || 1] }] : null;
        var parts = [
            { id: 'body', box: [bw, bh, bl], at: [0, bodyY, bz], c: o.c, paint: o.bodyPaint },
        ];
        var corners = [[1, lzF, 'FL', 1], [-1, lzF, 'FR', -1], [1, lzB, 'BL', -1], [-1, lzB, 'BR', 1]];
        for (var i = 0; i < corners.length; i++) {
            var C = corners[i];
            parts.push({
                id: 'leg' + C[2], box: [legW, legH, legW], at: [C[0] * lx, legH / 2, C[1]],
                pivot: [C[0] * lx, legH, C[1]], c: legC, paint: hoofPaint, tag: 'leg', gait: C[3],
                joint: { axis: 'x', amp: o.legAmp === undefined ? 0.42 : o.legAmp, ph: C[3] > 0 ? 0 : Math.PI, gain: 1.7 },
            });
        }
        var hw = o.head[0], hh = o.head[1], hd = o.head[2];
        var hz = bz + bl / 2 + hd / 2 - (o.headDrop === undefined ? 1 : o.headDrop);
        parts.push({
            id: 'head', box: [hw, hh, hd], at: [0, o.headY, hz], pivot: [0, o.pivotY === undefined ? o.headY - hh / 2 : o.pivotY, hz - hd / 2],
            c: o.headC === undefined ? o.c : o.headC, paint: o.face, tag: 'head', rot: o.headRot,
            joint: { axis: 'x', amp: 0.07, f: 0.5 },
        });
        return { parts: parts, bodyY: bodyY, hz: hz, legH: legH };
    }
    // 사족 섀시에 부속을 얹는다(귀·뿔·꼬리·주둥이…). 머리 소속은 parent:'head' 로 준다.
    function extend(base, extra) { return base.parts.concat(extra || []); }

    // 꼬리 한 덩이 — 피벗을 밑동에 두고 흔든다.
    function tail(o) {
        return {
            id: 'tail', box: o.box, at: o.at, pivot: o.pivot || [0, o.at[1], o.at[2] + o.box[2] / 2],
            c: o.c, paint: o.paint, tag: 'tail', rot: o.rot,
            joint: { axis: o.axis || 'y', amp: o.amp === undefined ? 0.22 : o.amp, f: o.f === undefined ? 1.6 : o.f },
        };
    }

    root.MobParts = { eyes: eyes, eyesSide: eyesSide, quad: quad, extend: extend, tail: tail };
})(typeof window !== 'undefined' ? window : globalThis);

