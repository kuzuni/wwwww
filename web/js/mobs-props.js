// ============================================================================
// Props — 맵 소품(프롭) 마인크래프트 지형 문법 표 (map-props-minecraft, 2026-08-21)
// ----------------------------------------------------------------------------
// 사용자 지시(2026-08-21): *"맵들 다 바꾸고 싶음. 맵 소품들 싹다 마인크래프트 식으로 만들어서
//   스샷 찍어서 보내셈."*
//
// 왜 또 갈아엎는가 — 프롭은 2026-08-20 에 이미 한 번 '복셀화'를 했다. 그런데 그때 한 일은
// **곡면 프리미티브를 칸으로 근사한 것**이었다: 잎단 = `Voxel.ellipse`(계단 원기둥), 바위 =
// `Voxel.rock`(구를 깎은 덩어리), 버섯 갓 = `Voxel.dome`, 선인장 = `Voxel.revolve`(배흘림 회전체),
// 결정 = 섹터 변조 타원 단면. 이건 펫·탈것 54종이 '뭉개진 사탕 덩어리'로 반려당한 사유(ⓐ 곡면
// 근사 = 계단 실루엣 + 들쭉날쭉한 표면)와 **완전히 같은 실패**다. `web/js/mobs.js` 머리말이
// 그 진단을 이미 적어 뒀고, 펫·탈것·적은 그 문법으로 다시 만들어졌다. 배경만 옛 문법으로 남아
// 있으면 한 화면에 두 문법이 섞인다.
//
// 그래서 이 파일은 마인크래프트의 **지형 프롭 문법**만 쓴다:
//   ① **나무 = 원목 기둥(2×2) + 잎 덩이(계단식 상자 2~4단)**. 종은 잎단 폭 표와 기둥 색이 가른다
//      (참나무·자작나무·가문비·정글). 곡면 없음 — 잎단은 전부 축정렬 상자고, '동그란 수관'은
//      **모서리를 뗀 팔각 상자**(마크 잎 블록 배치 그대로)로 낸다.
//   ② **바위 = 축정렬 상자 2~4개를 어긋나게 쌓은 덩어리.** 구·다면체 근사 금지.
//   ③ **풀/덤불/꽃 = 얇은 판 또는 작은 상자 몇 개.** 마크의 십자 스프라이트를 대신하는 청키한 형태.
//   ④ 눈·이끼는 형태가 아니라 **레이어**다 — 칸기둥의 맨 윗칸 위에 한 칸(`capLayer`). 마크의
//      눈 레이어 규칙 그대로라, 어느 실루엣에 얹어도 '어깨에만' 앉는다.
//   ⑤ 색은 종·바이옴 자연색. 면 안의 디테일(자작나무 껍질 무늬·대나무 마디)은 덩어리를 더
//      붙이는 게 아니라 **칸 색**으로 낸다(`Voxel.faces` 가 칸의 `c` 를 그대로 굽는다).
//
// 좌표 규약: 전부 **칸(cell)** 단위. y=0 이 접지면, 상자 좌표는 **최소 모서리**다(중심이 아니다 —
//   `Mobs.build` 의 `at` 과 반대다. 프롭은 밑동을 바닥에 붙이는 물건이라 최소 모서리가 편하다).
// 반환 규약: `{ u, sway, parts: [{ m: 재질역할, v: [칸…] }, …] }`
//   u    = 칸 한 변의 월드 길이. **월드 치수는 옛 판을 물려받는다** — 프롭 점유 면적 위에
//          `probe-nearfield-mass`·`probe-midground-depth`·`probe-prop-blob` 게이트가 서 있어서,
//          조형만 바꾸고 덩치를 바꾸면 그 자들이 통째로 흔들린다.
//   m    = 재질 역할 문자열. 실제 재질은 `Scene3D.propMat()` 이 쥔다(바이옴 재색칠을 따라가야
//          하므로 표가 재질을 직접 만들면 안 된다).
//   sway = 바람 흔들림 계수(식물만).
//
// 🚨 **칸의 `c` 는 절대색이 아니라 재질 색에 곱해지는 계수다**(정점 색). 그래서 밝게는 못 만들고
//    어둡게만 할 수 있다 — 자작나무 흰 기둥처럼 **밝은 색이 필요하면 재질을 따로 둬야 한다**
//    (`propMat('birch')`). 이걸 모르고 c 로 흰색을 칠하면 그냥 갈색 기둥이 나온다.
// ============================================================================
(function (root) {
    'use strict';
    var V = root.Voxel;

    // 난수는 전역 `Math.random` 을 쓴다 — 캡처 도구(`shot-biomes.js` 등)가 시드를 갈아끼워
    // 결정론을 만드는 규약이라, 여기서 자체 RNG 를 쓰면 그 도구의 전/후 대조가 깨진다.
    function R(a, b) { return a + Math.random() * (b - a); }
    function RI(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function pick(a) { return a[Math.random() * a.length | 0]; }

    // ── 상자 어휘 ────────────────────────────────────────────────────────────
    // 상자 하나. (x,y,z) 는 **최소 모서리**다.
    function bx(w, h, d, x, y, z, c) { return V.at(V.box(w, h, d, c), x, y, z); }
    // x·z 중심을 0 에 맞춘 상자 — 기둥·잎단처럼 축 위에 서는 덩어리용(짝수 폭은 반 칸 쏠린다).
    function cbx(w, h, d, y, c) { return bx(w, h, d, -(w >> 1), y, -(d >> 1), c); }
    // 모서리를 뗀 잎단 — 마크 잎 블록이 정사각이 아니라 **모서리가 빠진 팔각**으로 놓이는 것을
    // 그대로 옮긴다. 상자 두 개를 십자로 겹치면 그 모양이 정확히 나온다(곡면 근사가 아니다).
    function octa(w, h, y, cut, c) {
        if (!cut || w <= 3) return cbx(w, h, w, y, c);
        return V.merge(cbx(w, h, w - cut * 2, y, c), cbx(w - cut * 2, h, w, y, c));
    }
    // 눈·이끼 레이어 — 각 칸기둥의 **맨 윗칸 바로 위**에 한 칸. 마크의 눈 규칙이라, 계단식
    // 실루엣이면 자동으로 '단마다 쌓인 눈'이 되고 오버행 밑에는 안 쌓인다.
    function capLayer(vox, c) {
        var top = {}, i, v, k;
        for (i = 0; i < vox.length; i++) {
            v = vox[i]; k = v.x + ',' + v.z;
            if (top[k] === undefined || top[k] < v.y) top[k] = v.y;
        }
        var out = [];
        for (k in top) {
            var p = k.split(',');
            out.push({ x: +p[0], y: top[k] + 1, z: +p[1], c: c });
        }
        return out;
    }
    // 겹친 칸 빼기 — 색이 달라 **메시를 나눠야 하는** 두 덩어리가 같은 칸을 채우면 z-파이팅이다.
    function sub(a, b) {
        var occ = {}, i;
        for (i = 0; i < b.length; i++) occ[b[i].x + ',' + b[i].y + ',' + b[i].z] = 1;
        var out = [];
        for (i = 0; i < a.length; i++) if (!occ[a[i].x + ',' + a[i].y + ',' + a[i].z]) out.push(a[i]);
        return out;
    }
    // 칸 목록의 최고 높이(칸) — u 를 역산할 때 쓴다.
    function topY(vox) {
        var m = 0;
        for (var i = 0; i < vox.length; i++) if (vox[i].y > m) m = vox[i].y;
        return m + 1;
    }
    // 칸 목록의 가로 폭(칸) — x·z 중 넓은 쪽.
    function spanXZ(vox) {
        var mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        for (var i = 0; i < vox.length; i++) {
            var v = vox[i];
            if (v.x < mnx) mnx = v.x; if (v.x > mxx) mxx = v.x;
            if (v.z < mnz) mnz = v.z; if (v.z > mxz) mxz = v.z;
        }
        return Math.max(mxx - mnx, mxz - mnz) + 1;
    }
    // 🚨 **칸 한 변은 높이·폭 **둘 다**의 목표에서 역산한다 — 하나만 보면 다른 쪽이 대역을 넘는다.**
    //    실제로 그랬다: 높이만 맞췄더니 마크식 넓은 수관·상자 바위가 옛 판보다 넓어져
    //    `probe-prop-voxel` ③(치수 유지)이 9종에서 폭 초과로 걸렸다. 그 대역 위에 근경/중경 점유
    //    게이트가 서 있으므로 **조형은 바꾸되 덩치는 옛 판 안에 두는 것**이 이 프로젝트의 규약이다.
    //    둘 중 작은 배율을 쓰면 어느 쪽도 대역을 안 넘고 비율(실루엣)은 그대로 남는다.
    function fitU(vox, targetH, targetW) {
        return Math.min(targetH / topY(vox), targetW / spanXZ(vox));
    }

    // 지층 교번 색 — 옛 `vxBandTint` 와 같은 계수(웜 사암 ↔ 쿨 이암). 재질 색에 곱해지므로 1 이하다.
    var BAND_WARM = 0xebdbc9, BAND_COOL = 0xd4d9e3;
    // 원목 껍질 얼룩 — 칸 좌표 해시로 몇 칸만 눌러 '한 색 기둥'을 면다(마크 원목 텍스처의 세로 결).
    function barkTint(vox, amt) {
        var out = [];
        for (var i = 0; i < vox.length; i++) {
            var v = vox[i];
            var h = Math.sin(v.x * 12.9898 + v.y * 4.1414 + v.z * 78.233) * 43758.5453;
            h -= Math.floor(h);
            var k = 1 - (h < 0.34 ? amt : 0);
            var g = Math.round(255 * k);
            out.push({ x: v.x, y: v.y, z: v.z, c: (g << 16) | (g << 8) | g });
        }
        return out;
    }

    // ── 나무 종 표 ───────────────────────────────────────────────────────────
    // plan = 잎단 [폭, 층수] 을 **아래에서 위로**. cut = 모서리를 뗄 칸 수(폭 5 이상만).
    // 이 표 하나가 종의 실루엣을 전부 쥔다 — 참나무는 가운데가 부푼 렌즈, 가문비는 계단 원뿔,
    // 자작나무는 좁고 높은 기둥, 정글은 높은 기둥 끝의 넓고 납작한 지붕.
    var TREES = {
        // 🚨 **기둥 높이(th)와 수관 폭은 한 벌로 고른다.** `fitU` 는 높이·폭 중 **빡빡한 쪽**을 쓰므로,
        //    수관만 넓히면 폭이 배율을 잡아 전고가 대역 아래로 떨어진다(실제로 참나무가 1.10s 로
        //    떨어져 `probe-prop-voxel` 높이 하한 1.2 에 걸렸다). 폭 9칸이면 전고도 11칸쯤 돼야 한다.
        oak: {
            trunk: 'trunk', th: [7, 9], sway: 0.034, bark: 0.10,
            plans: [[[7, 1], [9, 2], [7, 1], [5, 1]], [[9, 2], [7, 2], [5, 1]], [[7, 2], [9, 1], [7, 1], [3, 1]]],
            cut: 2, lobe: 0.45,
        },
        birch: {
            trunk: 'birch', th: [6, 8], sway: 0.036, bark: 0,
            plans: [[[5, 2], [7, 1], [5, 1], [3, 1]], [[7, 1], [5, 2], [3, 1]]],
            cut: 1, lobe: 0.12, speck: true,
        },
        jungle: {
            trunk: 'trunk', th: [9, 11], sway: 0.030, bark: 0.14,
            plans: [[[9, 1], [9, 1], [7, 1]], [[9, 1], [7, 1], [5, 1]]],
            cut: 2, lobe: 0.3,
        },
        spruce: {
            trunk: 'trunk', th: 0, sway: 0.030, bark: 0.16, dark: 0.72,
            plans: [
                [[9, 1], [7, 2], [5, 1], [5, 1], [3, 2], [1, 2]],
                [[9, 1], [7, 1], [7, 1], [5, 2], [3, 2], [1, 2]],
                [[7, 1], [5, 2], [5, 1], [3, 2], [1, 2]],
            ],
            cut: 1,
        },
    };

    // 잎단을 쌓아 수관을 만든다 — 나무 넷이 공유하는 유일한 조립 루틴.
    function crown(plan, y0, cut) {
        var v = [], y = y0;
        for (var i = 0; i < plan.length; i++) {
            v = v.concat(octa(plan[i][0], plan[i][1], y, plan[i][0] >= 5 ? cut : 0));
            y += plan[i][1];
        }
        return { v: v, top: y };
    }

    var Props = {
        bx: bx, cbx: cbx, octa: octa, capLayer: capLayer, sub: sub,

        // 🌲 침엽수(가문비) — 계단식 잎단 원뿔 + 2×2 원목. 설원은 단마다 눈 레이어가 앉는다.
        //    전고 1.75s 는 옛 판에서 그대로 물려받는다(프롭 점유 게이트가 그 위에 서 있다).
        pine: function (s, o) {
            o = o || {};
            var sp = TREES.spruce;
            var base = RI(2, 4);                       // 잎이 시작하는 밑동 길이(개체차 ①)
            var c = crown(pick(sp.plans), base, sp.cut);
            var H = c.top;
            var trunk = barkTint(cbx(2, H - 1, 2, 0), sp.bark);
            // 원목을 어둡게 — 가문비는 참나무보다 검은 껍질이다(재질을 늘리지 않고 칸 색 계수로).
            for (var i = 0; i < trunk.length; i++) {
                var g = Math.round(((trunk[i].c >> 16) & 255) * sp.dark);
                trunk[i].c = (g << 16) | (g << 8) | g;
            }
            var leaf = sub(c.v, trunk);
            var parts = [{ m: 'trunk', v: trunk }, { m: 'leaf' + RI(0, 2), v: leaf }];
            if (o.snow) parts.push({ m: 'snow', v: capLayer(leaf) });
            // 전고 ≈1.75s · 폭 ≤1.2s (옛 판 대역) — 둘 중 빡빡한 쪽이 칸 크기를 정한다.
            return { u: s * fitU(c.v, 1.75, 1.2), sway: sp.sway, parts: parts };
        },

        // 🌳 활엽수 — 참나무/자작나무/정글. 종은 `species` 로 받는다(바이옴이 고른다).
        //    전고 ≈1.42s(옛 판) 유지.
        broadleaf: function (s, o) {
            o = o || {};
            var sp = TREES[o.species] || TREES.oak;
            var th = RI(sp.th[0], sp.th[1]);
            var c = crown(pick(sp.plans), th - 2, sp.cut);
            var H = c.top;
            var leaf = c.v;
            // 곁가지 수관 — 한쪽으로 뻗은 덩이 하나. 실루엣이 완전 대칭이면 '복붙'으로 읽힌다.
            var branch = [];
            if (Math.random() < sp.lobe) {
                var dx = Math.random() < 0.5 ? -1 : 1, dz = Math.random() < 0.5 ? -1 : 1;
                var by = th - RI(3, 5);
                branch = bx(2, 1, 1, dx > 0 ? 1 : -2, by, 0);
                leaf = leaf.concat(V.at(octa(3, 2, 0, 0), dx * 3, by, dz));
            }
            var trunk = barkTint(cbx(2, th, 2, 0).concat(branch), sp.bark);
            if (sp.speck) {   // 🪵 자작나무 껍질 무늬 — 칸 몇 개만 눌러 검은 결(형태가 아니라 색으로)
                for (var i = 0; i < trunk.length; i++) {
                    var h = Math.sin(trunk[i].x * 31.7 + trunk[i].y * 7.13 + trunk[i].z * 17.3) * 43758.5453;
                    if (h - Math.floor(h) < 0.16) trunk[i].c = 0x4a4a4a;
                }
            }
            return {
                u: s * fitU(leaf.concat(trunk), 1.42, 1.1), sway: sp.sway,   // 전고 ≈1.42s · 폭 ≤1.1s
                parts: [{ m: sp.trunk, v: trunk }, { m: 'leaf' + RI(0, 2), v: sub(leaf, trunk) }],
            };
        },

        // 🪵 고사목 — 잎 없는 검게 탄 원목. 가지는 **ㄱ자 상자**(수평 팔 → 수직 토막)로만 낸다.
        //    비스듬한 계단 가지는 격자는 지키지만 마크 어휘가 아니다 — 마크 나무의 가지는 언제나
        //    블록 하나 단위의 직각 꺾임이다.
        deadTree: function (s) {
            // ⚠️ 전고를 더 키우면 칸이 잘아져 **가지가 실 같아진다**(폭 하한 게이트에 걸렸다).
            var H = RI(10, 12);
            var v = barkTint(cbx(2, H, 2, 0), 0.18);
            var n = RI(3, 4), used = {};
            for (var i = 0; i < n; i++) {
                var d = RI(0, 3);
                if (used[d]) d = (d + 1) % 4;
                used[d] = 1;
                var y = 3 + i * 2 + RI(0, 1);
                var dx = [1, -1, 0, 0][d], dz = [0, 0, 1, -1][d];
                var len = RI(4, 5);
                // 수평 팔 — 기둥 옆면에서 시작해 밖으로
                v = v.concat(bx(dx ? len : 1, 1, dz ? len : 1,
                    dx > 0 ? 1 : (dx < 0 ? -len : (-1)), y, dz > 0 ? 1 : (dz < 0 ? -len : (-1)), 0xcfcfcf));
                // 끝에서 위로 꺾인 토막
                v = v.concat(bx(1, RI(3, 5), 1, dx > 0 ? len : (dx < 0 ? -len : -1),
                    y + 1, dz > 0 ? len : (dz < 0 ? -len : -1), 0xdedede));
            }
            v = v.concat(cbx(1, 2, 1, H, 0xbfbfbf));     // 부러진 우듬지
            return { u: 1.07 * s / (H + 2), sway: 0.020, parts: [{ m: 'char', v: v }] };
        },

        // 🌵 선인장 — 마크 선인장 그대로: 곧은 기둥 + 옆으로 한 칸 나갔다 위로 꺾이는 팔.
        //    배흘림(회전체) 폐기 — 마크 선인장에는 굵기 변화가 없다.
        cactus: function (s) {
            // ⚠️ **팔은 몸통과 같은 굵기여야 한다.** 첫 시트에서 팔을 1칸으로 뒀더니 12칸 기둥 옆의
            //    돌기로 뭉개져 '초록 말뚝'으로 읽혔다 — 마크 선인장의 팔은 몸통과 같은 블록 굵기다.
            var H = RI(10, 13);
            var v = cbx(2, H, 2, 0);
            for (var side = -1; side <= 1; side += 2) {
                if (Math.random() < 0.15) continue;
                // 🚨 팔뚝을 몸통에 **딱 붙이면** 그냥 굵어진 기둥으로 보인다(시트에서 두 판 연속 그랬다).
                //    마크 선인장처럼 **한 칸 띄우고** 이음새 한 칸으로만 붙여야 팔이 팔로 읽힌다.
                var y = RI(2, Math.max(3, H - 7));
                var jx = side > 0 ? 1 : -2;                                 // 이음새(몸통에 닿는 한 칸)
                var ax = side > 0 ? 2 : -4;                                 // 팔뚝(한 칸 띄운 자리)
                v = v.concat(bx(1, 1, 2, jx, y, -1));                       // 수평 이음새
                v = v.concat(bx(2, RI(4, 6), 2, ax, y, -1));                // 위로 선 팔뚝
            }
            var parts = [{ m: 'cactus', v: v }];
            if (Math.random() < 0.4) parts.push({ m: 'flower', v: cbx(2, 1, 2, H) });
            return { u: 1.06 * s / (H + 1), parts: parts };
        },

        // 🪨 둥근 바위 — 축정렬 상자 3~4개를 **어긋나게** 쌓은 덩어리. 구 근사 금지.
        //    눈·이끼는 형태가 아니라 위 레이어 한 칸(`capLayer`).
        boulder: function (s, snow, moss) {
            // 상자 4~5개 — 셋 이하면 '큐브 두 개'로 읽힌다(첫 시트에서 실제로 그렇게 나왔다).
            var v = bx(RI(6, 8), RI(3, 4), RI(5, 7), -4, 0, -3);
            var n = RI(2, 3), i;
            for (i = 0; i < n; i++) {
                v = v.concat(bx(RI(3, 5), RI(2, 4), RI(3, 5), RI(0, 3), 0, RI(-4, 1)));
            }
            v = v.concat(bx(RI(3, 5), RI(1, 3), RI(3, 5), RI(-4, 0), RI(2, 3), RI(-3, 1)));
            v = v.concat(bx(RI(2, 3), 1, RI(2, 3), RI(-4, 2), RI(3, 5), RI(-3, 1)));
            var parts;
            if (snow || moss) {
                var cap = capLayer(v);
                parts = [{ m: 'stone', v: v }, { m: snow ? 'snow' : 'moss', v: cap }];
            } else parts = [{ m: 'stone', v: v }];
            return { u: s * fitU(v, 0.62, 1.0), parts: parts };   // 전고 ≈0.6s · 폭 ≤1.0s (옛 판 대역)
        },

        // 🪨 판형 노두 — 납작한 상자를 언더컷으로 어긋나게 쌓고 층마다 지층색을 교번한다.
        slab: function (s) {
            var n = RI(3, 4), v = [], y = 0, ox = 0, oz = 0;
            var lean = RI(-1, 1), leanD = RI(-1, 1);
            for (var i = 0; i < n; i++) {
                var t = i / Math.max(1, n - 1);
                var w = Math.round(R(7, 9) * (1.12 - t * 0.45)), d = Math.round(w * R(0.6, 0.85));
                var h = RI(1, 2);
                ox += lean; oz += leanD;
                v = v.concat(bx(w, h, d, ox - (w >> 1), y, oz - (d >> 1), i % 2 === 0 ? BAND_WARM : BAND_COOL));
                y += h;
            }
            for (i = 0; i < 2; i++) {   // 꼭대기 풍화 잔돌 — 종단 실루엣을 깬다
                v = v.concat(bx(RI(1, 2), 1, RI(1, 2), ox + RI(-2, 2), y, oz + RI(-2, 2), BAND_WARM));
            }
            return { u: s * fitU(v, 0.78, 1.45), parts: [{ m: 'stone', v: v }] };   // 전고 ≈0.8s · 폭 ≤1.45s
        },

        // 🪨 수평 퇴적층(메사 축소판) — 넓은 판을 낮게 쌓는다. 위층이 살짝 밀린 침식.
        strata: function (s) {
            var n = RI(3, 4), v = [], y = 0;
            for (var i = 0; i < n; i++) {
                var w = Math.round(R(9, 12) * (1 - i * 0.15)), d = Math.round(w * R(0.5, 0.7));
                var h = RI(1, 2);
                v = v.concat(bx(w, h, d, -(w >> 1) + RI(-1, 1), y, -(d >> 1) + RI(-1, 1),
                    i % 2 === 0 ? BAND_WARM : BAND_COOL));
                y += h;
            }
            return { u: s * fitU(v, 0.72, 1.65), parts: [{ m: 'stone', v: v }] };   // 전고 ≈0.72s · 폭 ≤1.65s
        },

        // 🪨 바위 첨탑 — 위로 갈수록 좁아지는 상자 3~4단, 단마다 한두 칸씩 쏠려 자연 기울기.
        // ⚠️ **높이는 칸 수가 아니라 목표 월드 치수에서 역산한다.** 첫 판은 `u = s/13` 고정이라
        //    단 수·단 높이 난수가 그대로 전고에 실려 첨탑이 1.9~2.3s 짜리 '탑'이 됐다(캡처로 확인).
        //    옛 판 전고 ≈1.5s 에 맞춰 u 를 나중에 정하면 실루엣만 바뀌고 덩치는 안 흔들린다.
        spire: function (s) {
            var n = RI(3, 4), v = [], y = 0, ox = 0, oz = 0;
            var lean = RI(-1, 1), leanD = RI(-1, 1);
            for (var i = 0; i < n; i++) {
                var t = i / Math.max(1, n - 1);
                var w = Math.max(2, Math.round(R(6, 8) * (1 - t * 0.45)));
                var d = Math.max(2, Math.round(w * R(0.75, 1.05)));
                var h = Math.max(2, Math.round(w * R(0.6, 0.95)));
                ox += lean; oz += leanD;
                v = v.concat(bx(w, h, d, ox - (w >> 1), y, oz - (d >> 1), i % 2 === 0 ? BAND_WARM : BAND_COOL));
                y += h;
            }
            return { u: s * fitU(v, 1.5, 1.4), parts: [{ m: 'stone', v: v }] };
        },

        // 🌋 화산암 — 마크 마그마 블록 문법: **검은 상자 껍질 사이로 발광 코어 칸이 드러난다.**
        volcanic: function (s) {
            // 🚨 코어를 껍질보다 **높게** 세운다 — 첫 시트에서 코어가 껍질에 완전히 덮여 발광이
            //    옆구리 한 조각으로만 새 나왔다. 마크 마그마 블록은 '틈'이 아니라 **면 전체**가 빛난다.
            var core = bx(4, 4, 4, -2, 0, -2);
            var shell = bx(7, 2, 7, -3, 0, -3);          // 밑동 받침
            var n = RI(3, 4);
            for (var i = 0; i < n; i++) {                // 코어를 둘러싼 암석 조각(위는 열어 둔다)
                var a = i / n * Math.PI * 2;
                shell = shell.concat(bx(RI(2, 3), RI(2, 4), RI(2, 3),
                    Math.round(Math.cos(a) * 3) - 1, 1, Math.round(Math.sin(a) * 3) - 1));
            }
            return {
                u: 0.62 * s / topY(shell.concat(core)),
                parts: [{ m: 'lava', v: core }, { m: 'charRock', v: sub(shell, core) }],
            };
        },

        // 🪾 마른 관목(죽은 덤불) — 얇은 세로 막대 몇 개 + 한 칸 꺾인 잔가지. 마크 데드부시의 청키판.
        dryShrub: function (s) {
            // 🚨 **가지가 굵으면 관목이 아니라 '작은 상자 더미'다**(첫 시트 실패). 칸 수를 늘려
            //    1칸 막대가 전고의 1/7 이하가 되게 한다 — 굵기는 u 가 아니라 **칸 비율**이 정한다.
            var v = bx(1, 3, 1, 0, 0, 0);
            var n = RI(5, 7);
            for (var i = 0; i < n; i++) {
                var a = i / n * Math.PI * 2;
                var dx = Math.round(Math.cos(a) * RI(1, 3)), dz = Math.round(Math.sin(a) * RI(1, 3));
                var y = RI(0, 2);
                v = v.concat(bx(1, RI(3, 6), 1, dx, y, dz));                    // 바깥 막대
                v = v.concat(bx(Math.abs(dx) ? Math.abs(dx) + 1 : 1, 1, Math.abs(dz) ? Math.abs(dz) + 1 : 1,
                    dx > 0 ? 0 : dx, y, dz > 0 ? 0 : dz));                      // 밑동에서 뻗어 나가는 가로 가지
            }
            // ⚠️ **마른 관목은 흔들지 않는다** — 사막·황무지 같은 광물 바이옴에 서는 유일한 식생이라,
            //    여기에 sway 를 주면 `probe-wind` 의 '광물 바이옴 정지' 기준을 깬다(첫 판에서 sway 0.05 를
            //    줬다가 사막에서 흔들리는 소품 3개로 잡혔다). 죽은 덤불은 뻣뻣한 게 조형적으로도 맞다.
            return { u: 0.44 * s / topY(v), parts: [{ m: 'char', v: v }] };
        },

        // 🦴 뼈 — 갈비 아치를 **ㄷ자 상자**(기둥 둘 + 위 들보)로. 토러스 근사 폐기.
        bones: function (s) {
            var ribs = RI(3, 5), v = [];
            for (var i = 0; i < ribs; i++) {
                var w = 7 - (i % 2) * 2, h = RI(4, 6), z = i * 3;
                v = v.concat(bx(1, h, 1, -(w >> 1), 0, z));
                v = v.concat(bx(1, h, 1, (w >> 1), 0, z));
                v = v.concat(bx(w, 1, 1, -(w >> 1), h, z));
            }
            var sx = 5, sz = ribs * 3 + 1;
            v = v.concat(bx(3, 3, 4, sx, 0, sz - 3));            // 두개골
            v = v.concat(bx(2, 2, 2, sx + 3, 0, sz - 2));        // 주둥이
            return { u: 0.42 * s / topY(v), parts: [{ m: 'bone', v: v }] };
        },

        // 🎋 대나무 — 가늘고 곧은 1칸 기둥 여러 대. **마디는 형태가 아니라 색**(칸 하나를 눌러 굽는다).
        //    옛 판은 마디에서 기둥을 3칸으로 부풀렸는데, 마크 대나무는 굵기 변화가 없다.
        //    🚨 다발 전체를 **기둥 1메시 + 잎 1메시**로 굽는다 — 옛 판은 대마다 메시 2개라
        //       대나무 맵 하나가 드로우콜을 수십 개 더 먹었다.
        bamboo: function (s) {
            var u = s / 12;
            var culms = RI(3, 5), pole = [], leaf = [], i, k;
            for (i = 0; i < culms; i++) {
                var h = Math.round(R(1.6, 2.4) * s / u);
                var a = i / culms * Math.PI * 2 + R(-0.4, 0.4), rad = R(0.4, 1.9);   // 다발 폭 상한(옛 판 ≤1.0s)
                var cx = Math.round(Math.cos(a) * rad), cz = Math.round(Math.sin(a) * rad);
                var d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
                var per = Math.max(6, Math.round(h / RI(2, 4)));   // 계단 기울임 주기(격자 유지)
                var nodeEvery = RI(4, 6);
                for (var y = 0; y < h; y++) {
                    var off = Math.floor(y / per);
                    pole.push({ x: cx + d[0] * off, y: y, z: cz + d[1] * off, c: (y % nodeEvery === 0 && y ? 0x9e9e9e : 0xffffff) });
                }
                for (k = 0; k < 4; k++) {   // 잎 — 상단에서 옆으로 2칸 뻗은 얇은 판
                    var ly = Math.round(h * R(0.62, 0.95)), lo = Math.floor(ly / per);
                    var ld = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
                    var lx = cx + d[0] * lo + ld[0], lz = cz + d[1] * lo + ld[1];
                    leaf = leaf.concat(bx(ld[0] ? 2 : 1, 1, ld[1] ? 2 : 1,
                        ld[0] > 0 ? lx : (ld[0] < 0 ? lx - 1 : lx), ly,
                        ld[1] > 0 ? lz : (ld[1] < 0 ? lz - 1 : lz)));
                }
            }
            // 다발이 넓게 퍼진 개체는 폭이 옛 판 상한(1.0s)을 넘는다 — 그때만 칸을 줄여 되돌린다
            // (전고 대역 1.4~2.7s 는 여유가 커서 줄어든 만큼을 흡수한다).
            return {
                u: Math.min(u, 0.95 * s / spanXZ(pole.concat(leaf))), sway: 0.055,
                parts: [{ m: 'bamboo', v: pole }, { m: 'bambooLeaf', v: sub(leaf, pole) }],
            };
        },

        // 🍄 거대 버섯 — 마크 거대버섯 문법: **흰 2×2 대 + 넓고 납작한 갓 + 한 칸 내려온 갓 테두리**,
        //    갓 윗면에 반점 칸. 반구 돔 폐기(그건 곡면 근사였다).
        //    🚨 곁 개체까지 **한 모델 안에서** 칸으로 합친다 — 메시 수가 개체 수만큼 늘지 않게.
        mushroom: function (s) {
            var stem = [], gill = [], cap = [], dot = [], i;
            var li = RI(0, 2);
            var one = function (ox, oz, sc) {
                // 대가 짧으면 갓이 '탁자'가 된다 — 마크 거대버섯도 대가 갓 지름의 절반은 된다.
                var sh = Math.max(3, Math.round(RI(6, 8) * sc));            // 대 높이
                var w = Math.max(3, Math.round(RI(7, 9) * sc) | 1);          // 갓 폭(홀수)
                stem = stem.concat(bx(2, sh, 2, ox - 1, 0, oz - 1));
                gill = gill.concat(V.at(octa(w - 2, 1, sh, 1), ox, 0, oz));  // 갓 아래 밝은 주름
                var rim = V.at(octa(w, 1, sh + 1, 1), ox, 0, oz);            // 한 칸 내려온 테두리
                var top = V.at(octa(w - 2, 1, sh + 2, 1), ox, 0, oz);        // 갓 윗면
                var c = rim.concat(top);
                var picks = RI(3, 5);
                for (i = 0; i < picks; i++) {
                    var t = top[Math.random() * top.length | 0];
                    if (t) dot.push({ x: t.x, y: t.y, z: t.z });
                }
                cap = cap.concat(c);
            };
            one(0, 0, 1);
            var n = RI(1, 2);
            for (i = 0; i < n; i++) {
                var a = R(0, Math.PI * 2), rr = R(4, 7);
                one(Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr), R(0.4, 0.6));
            }
            cap = sub(cap, dot);          // 반점 칸은 갓에서 뺀다(같은 칸을 두 메시가 채우면 z-파이팅)
            gill = sub(gill, cap);
            return {
                u: s / 9, sway: 0.016,
                // 대와 주름은 **같은 재질(크림 화이트)** 이라 한 메시로 굽는다 — 나누면 드로우콜만 는다.
                parts: [
                    { m: 'gill', v: stem.concat(gill) },
                    { m: 'leaf' + li, v: sub(cap, stem) }, { m: 'spore', v: dot },
                ],
            };
        },

        // 🌿 덤불 — 작은 상자 2~3개를 어긋나게. 마크의 잎 블록 한두 개짜리 수풀.
        bush: function (rad) {
            var v = bx(4, 2, 4, -2, 0, -2);
            v = v.concat(bx(RI(2, 3), RI(1, 2), RI(2, 3), RI(-2, 1), RI(1, 2), RI(-2, 1)));
            if (Math.random() < 0.5) v = v.concat(bx(2, 1, 2, RI(-3, 1), 0, RI(-3, 1)));
            return { u: rad * 2 / 5, parts: [{ m: 'bush', v: v }] };
        },

        // 🪨 잔돌 — 상자 1~2개. 납작형(flat)은 판석.
        pebble: function (rad, flat, mat) {
            // 상자 **둘 이상**이어야 한다 — 하나면 시트에서 그냥 '큰 정육면체'로 찍혔다.
            var v = flat ? bx(RI(3, 4), 1, RI(2, 3), -1, 0, -1) : bx(RI(2, 3), RI(1, 2), RI(2, 3), -1, 0, -1);
            v = v.concat(bx(RI(1, 2), 1, RI(1, 2), RI(-2, 1), flat ? 0 : 1, RI(-2, 1)));
            if (Math.random() < 0.5) v = v.concat(bx(1, 1, 1, RI(-2, 2), 0, RI(-2, 2)));
            return { u: rad * 2 / 4, parts: [{ m: mat || 'stone', v: v }] };
        },

        // 🌼 꽃 무리 — 마크 꽃의 청키판: 얇은 줄기 + **십자 꽃잎 판 한 층**(가운데 칸은 꽃술 색).
        //    🚨 무리 전체를 줄기 1메시 + 꽃잎 1메시로 굽는다(옛 판은 꽃송이마다 메시 2개였다).
        flowers: function () {
            // ⚠️ 줄기가 짧으면 꽃잎 판이 **탁자**로 읽힌다(첫 시트). 꽃잎 폭 3칸 대비 줄기를 4~7칸으로.
            var stem = [], petal = [], n = RI(3, 5);
            for (var i = 0; i < n; i++) {
                var x = RI(-3, 3), z = RI(-3, 3), h = RI(4, 7);
                stem = stem.concat(bx(1, h, 1, x, 0, z));
                petal = petal.concat(V.at(octa(3, 1, h, 1), x, 0, z));   // 십자(모서리 뗀 3×3) = 꽃잎
            }
            return { u: 0.028, sway: 0.075, parts: [{ m: 'stem', v: stem }, { m: 'petal', v: sub(petal, stem) }] };
        },

        // 🌿 양치류 — 중심에서 4방으로 뻗은 **얇은 판 잎날**(끝이 한 칸 처진다).
        fern: function () {
            var v = bx(1, 2, 1, 0, 0, 0);
            var blades = RI(4, 6);
            var DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (var j = 0; j < blades; j++) {
                var d = DIR[j % 4], len = RI(2, 3), up = j >= 4 ? 1 : 0;
                v = v.concat(bx(d[0] ? len : 1, 1, d[1] ? len : 1,
                    d[0] > 0 ? 1 : (d[0] < 0 ? -len : 0), up + 1,
                    d[1] > 0 ? 1 : (d[1] < 0 ? -len : 0)));
                v = v.concat(bx(1, 1, 1, d[0] * (len + (d[0] > 0 ? 0 : 0)), up, d[1] * len));   // 끝 처짐
            }
            return { u: 0.055, sway: 0.055, parts: [{ m: 'fern', v: v }] };
        },
    };

    root.Props = Props;
})(typeof window !== 'undefined' ? window : globalThis);
