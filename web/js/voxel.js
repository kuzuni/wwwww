// ============================================================================
// Voxel — 큐브 조형 공용 빌더 (화풍 확정 2026-08-20: Voxel + 치비)
// ----------------------------------------------------------------------------
// 왜 공용 모듈인가: 화풍 블록이 "모든 것(캐릭터·적·탈것·펫·장비·이펙트·배경·프롭·UI)을
//   큐브 기반 조형으로 통일" 하라고 못 박았다. 세션이 병렬로 도는 저장소라, 각자 큐브를
//   손으로 짜면 **이음새 AO·색변화·면 제거 규칙이 종마다 달라져** 같은 화풍으로 안 모인다.
//   그래서 '복셀 덩어리 하나 → THREE.Mesh 하나'를 만드는 자리를 여기 한 곳으로 모은다.
//
// 설계 결정 3가지와 근거:
//  ⓐ **파츠마다 지오메트리를 병합한다**(InstancedMesh 아님). 화풍 ⓑ 가 "파츠=큐브 덩어리를
//     관절 회전으로 애니(리깅 없이 피벗 회전)" 이므로, 애니 단위는 큐브가 아니라 **파츠**다.
//     파츠 하나를 병합 메시로 만들어 피벗 Group 에 달면 드로우콜이 파츠 수로 끝나고
//     기존 `pet-articulated-joints` 의 파츠 리그를 그대로 재활용할 수 있다.
//     (반대로 파티클·잔디처럼 **같은 큐브가 수백 개 흩어지는** 경우는 InstancedMesh 가 맞다 —
//      그건 이 빌더가 아니라 호출부에서 `THREE.InstancedMesh` 로 직접 할 일이다.)
//  ⓑ **안 보이는 면은 만들지 않는다.** 이웃 복셀이 있는 면은 영원히 안 보이므로 버린다.
//     이게 voxel 메시가 싼 이유이자, 안 하면 8×8×8 덩어리 하나가 3072 면이 되는 이유다.
//  ⓒ **색은 정점 색(vertexColors)으로 굽는다.** 화풍 ⓒ 가 "면당 플랫 색 + 큐브별 미세 색변화 ·
//     텍스처 파일 없음" 이라 텍스처를 쓸 이유가 없고, 정점 색이면 큐브마다 색을 달리 줘도
//     재질이 하나라 드로우콜이 안 늘어난다. 이음새 AO(ⓓ)도 같은 정점 색에 곱해 굽는다.
//
// 🚨 **AO 를 '그림자'로 착각하지 말 것.** 여기서 굽는 건 큐브가 서로 만나 생기는 **오목한
//    이음새의 어둠**이지 광원 그림자가 아니다. 광원·그림자·림라이트는 Scene3D 가 따로 준다.
//    두 개를 한 값에 섞으면 조명이 바뀔 때 이음새가 같이 흔들려 '지저분한 얼룩'이 된다.
//
// node 에서도 로드된다(THREE 없이). 순수 계산부(`faces`·`aoOf`)는 브라우저 없이 시험할 수
// 있어야 하기 때문이다 — `tools/test-voxel.js` 가 그걸 검증한다.
// ============================================================================
(function (root) {
    'use strict';

    // 6면의 법선과, 그 면을 이루는 4개 코너의 로컬 오프셋(반 칸 단위, -1/+1).
    //   순서는 반시계(바깥에서 볼 때) — 뒤집히면 면이 안쪽을 향해 안 보인다.
    var FACES = [
        { n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },   // +x
        { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },   // -x
        { n: [0, 1, 0], c: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },   // +y
        { n: [0, -1, 0], c: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },   // -y
        { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },   // +z
        { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },   // -z
    ];

    function key(x, y, z) { return x + ',' + y + ',' + z; }

    // 복셀 목록 → 점유 집합. 입력은 [{x,y,z,c}] (c = 0xRRGGBB, 없으면 opts.color).
    function occupancy(voxels) {
        var set = Object.create(null);
        for (var i = 0; i < voxels.length; i++) {
            var v = voxels[i];
            set[key(v.x, v.y, v.z)] = true;
        }
        return set;
    }

    // ── 이음새 AO ─────────────────────────────────────────────────────────────
    // 표준 복셀 AO: 한 코너의 어둠은 그 코너에 닿는 **옆 이웃 2개와 대각 이웃 1개**로 정해진다.
    //   옆 둘이 다 차 있으면 완전히 막힌 구석(가장 어둡다) — 대각은 그때 볼 것도 없다.
    // 반환 0..3 (3 = 가장 밝음). 이 값을 밝기 계수로 바꾸는 건 `aoShade`.
    function aoOf(occ, vx, vy, vz, n, corner) {
        // 면의 법선축을 뺀 나머지 두 축이 '옆', 둘 다 더한 것이 '대각'.
        var s1 = [0, 0, 0], s2 = [0, 0, 0], d = [0, 0, 0];
        var axes = [];
        for (var a = 0; a < 3; a++) if (n[a] === 0) axes.push(a);
        // corner 는 -1/+1 부호 3개. 법선축 성분은 면 바깥쪽이라 그대로 쓴다.
        for (var a2 = 0; a2 < 3; a2++) { s1[a2] = n[a2]; s2[a2] = n[a2]; d[a2] = n[a2]; }
        s1[axes[0]] += corner[axes[0]];
        s2[axes[1]] += corner[axes[1]];
        d[axes[0]] += corner[axes[0]];
        d[axes[1]] += corner[axes[1]];
        var o1 = !!occ[key(vx + s1[0], vy + s1[1], vz + s1[2])];
        var o2 = !!occ[key(vx + s2[0], vy + s2[1], vz + s2[2])];
        if (o1 && o2) return 0;                       // 두 옆이 다 막힘 = 가장 어두운 구석
        var od = !!occ[key(vx + d[0], vy + d[1], vz + d[2])];
        return 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (od ? 1 : 0));
    }

    // AO 단계(0..3) → 밝기 계수. 0.62 는 '이음새가 보이되 때가 낀 것처럼은 안 보이는' 선.
    //   ⚠️ 여기를 0.4 아래로 내리지 말 것 — 큐브가 작을수록 AO 면적 비율이 커져서,
    //      캐릭터처럼 잔 복셀이 많은 조형은 통째로 회색으로 가라앉는다.
    function aoShade(level, strength) {
        var s = (strength === undefined ? 1 : strength);
        return 1 - (3 - level) / 3 * 0.38 * s;
    }

    // ── 면 생성 ───────────────────────────────────────────────────────────────
    // 이웃이 있는 면은 만들지 않는다(ⓑ). 반환은 THREE 에 의존하지 않는 순수 데이터라
    // node 에서 그대로 시험할 수 있다.
    function faces(voxels, opts) {
        opts = opts || {};
        var occ = occupancy(voxels);
        var out = [];
        for (var i = 0; i < voxels.length; i++) {
            var v = voxels[i];
            for (var f = 0; f < FACES.length; f++) {
                var F = FACES[f], n = F.n;
                if (occ[key(v.x + n[0], v.y + n[1], v.z + n[2])]) continue;   // 가려진 면 — 만들지 않는다
                var corners = [], ao = [];
                for (var c = 0; c < 4; c++) {
                    var co = F.c[c];
                    corners.push([v.x + co[0] * 0.5, v.y + co[1] * 0.5, v.z + co[2] * 0.5]);
                    ao.push(aoOf(occ, v.x, v.y, v.z, n, co));
                }
                out.push({ n: n, corners: corners, ao: ao, c: (v.c === undefined ? opts.color : v.c), vx: v.x, vy: v.y, vz: v.z });
            }
        }
        return out;
    }

    // 큐브별 미세 색변화(화풍 ⓒ) — 좌표 해시라 같은 복셀은 항상 같은 값이다.
    //   랜덤을 쓰면 리빌드마다 무늬가 바뀌어 A/B 비교와 회귀 캡처가 흔들린다(이 저장소가
    //   `probe-nearfield-mass` 에서 같은 이유로 시드를 고정했다).
    function jitter(x, y, z, amt) {
        var h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        h = (h ^ (h >>> 13)) >>> 0;
        return 1 + ((h % 1000) / 1000 - 0.5) * 2 * amt;
    }

    // 90° 회전 k 번 적용. k 를 4 로 나눈 나머지만 쓰므로 k=4 는 제자리다.
    function rot(voxels, k, step) {
        var n = ((k === undefined ? 1 : k) % 4 + 4) % 4;
        var cur = voxels;
        for (var t = 0; t < n; t++) {
            var out = [];
            for (var i = 0; i < cur.length; i++) {
                var v = cur[i], p = step(v);
                out.push({ x: p[0], y: p[1], z: p[2], c: v.c });
            }
            cur = out;
        }
        return cur === voxels ? voxels.slice() : cur;
    }

    var Voxel = {
        FACES: FACES,
        faces: faces,
        aoOf: aoOf,
        aoShade: aoShade,
        jitter: jitter,

        // 직육면체 복셀 덩어리 — 가장 흔한 파츠 원형(몸통·팔·다리·머리).
        //   w/h/d 는 **복셀 개수**다(월드 크기가 아니다). 월드 크기는 build 의 `size` 가 정한다.
        box: function (w, h, d, color) {
            var out = [];
            for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) for (var z = 0; z < d; z++)
                out.push({ x: x, y: y, z: z, c: color });
            return out;
        },

        // ── 조립 유틸 ─────────────────────────────────────────────────────────
        // 큐브 적층 조형은 "덩어리를 만들어 옮겨 붙이는" 일이라, 그 네 동작을 먼저 둔다.
        //   ⚠️ 전부 **새 배열을 반환한다**(입력을 안 고친다) — 같은 덩어리를 좌우로 두 번
        //      쓰는 패턴(어깨·장갑·부츠)이 흔한데, 제자리 수정이면 첫 번째가 같이 밀린다.
        at: function (voxels, dx, dy, dz) {
            var out = [];
            for (var i = 0; i < voxels.length; i++) {
                var v = voxels[i];
                out.push({ x: v.x + (dx || 0), y: v.y + (dy || 0), z: v.z + (dz || 0), c: v.c });
            }
            return out;
        },
        merge: function () {
            var out = [];
            for (var i = 0; i < arguments.length; i++) {
                var a = arguments[i];
                if (a) for (var j = 0; j < a.length; j++) out.push(a[j]);
            }
            return out;
        },
        // x 를 뒤집는다. 좌우 대칭 파츠를 한 번만 깎게 해 준다.
        //   ⚠️ `about` 은 **거울면의 x**다. 기본 0 이면 x → −x 라 격자가 반 칸 안 어긋난다.
        mirrorX: function (voxels, about) {
            var a = about || 0, out = [];
            for (var i = 0; i < voxels.length; i++) {
                var v = voxels[i];
                out.push({ x: 2 * a - v.x, y: v.y, z: v.z, c: v.c });
            }
            return out;
        },
        // 90° 단위 회전 — 아래 단면 헬퍼는 전부 **+y 로 쌓는다**. 정면을 보고 서는 조형(반지
        //   밴드·목걸이 고리)은 그 축이 z 라, 세워 놓으려면 이걸 통과시킨다.
        //   k 는 반시계 90° 횟수(음수도 된다).
        // 🚨 **축 맞바꾸기로 대신하지 말 것.** `(x,y,z) → (x,z,y)` 는 회전이 아니라 거울이라
        //    행렬식이 −1 이고, 그러면 면의 감김이 뒤집혀 **전부 안쪽을 향한다**(화면에서 사라진다).
        //    아래 셋은 전부 행렬식 +1 이고 `test-voxel-shapes.js` ⑫ 가 그걸 잰다.
        //    ⚠️ 임의 각도 회전은 여기 두지 않는다 — 격자가 깨져 면이 비스듬해지면 그 순간
        //       voxel 로 안 읽힌다(그게 화풍 정합 2/10 의 원인이었다). 기울임이 필요하면
        //       조형 자체를 계단으로 깎을 것.
        rotX: function (voxels, k) { return rot(voxels, k, function (v) { return [v.x, -v.z, v.y]; }); },
        rotY: function (voxels, k) { return rot(voxels, k, function (v) { return [v.z, v.y, -v.x]; }); },
        rotZ: function (voxels, k) { return rot(voxels, k, function (v) { return [-v.y, v.x, v.z]; }); },

        // 색을 다시 칠한다. fn(v) 가 undefined 를 주면 그 칸의 색은 그대로 둔다.
        recolor: function (voxels, fn) {
            var out = [];
            for (var i = 0; i < voxels.length; i++) {
                var v = voxels[i], c = (typeof fn === 'function') ? fn(v, i) : fn;
                out.push({ x: v.x, y: v.y, z: v.z, c: (c === undefined ? v.c : c) });
            }
            return out;
        },
        // 🚨 **`hollow`(속 파내기)를 '최적화'로 쓰지 말 것 — 그쪽으론 함정이다.** 착수 때
        //    "속 칸을 버리면 메모리가 준다"고 넣었다가 시험(`test-voxel-shapes.js` ⑧)에서
        //    뒤집혔다: 6³ 덩어리의 속을 파면 칸은 216 → 152 로 줄지만 **면이 216 → 312 로
        //    는다**. 파낸 공동(4³)의 안쪽 벽 96면이 새로 드러나기 때문이다. 즉 면 제거 규칙
        //    ⓑ 가 이미 속 칸의 면을 전부 버리고 있어서 **속 칸은 렌더 비용이 0 이었고**,
        //    파내는 순간 없던 비용이 생긴다. 속이 비어야 하는 조형(고리·튜브·나팔 커프)은
        //    파내는 게 아니라 `ring`/`taper({t})` 로 **처음부터 비워서** 만들 것.
        //    ⚠️ 그래도 헬퍼 자체는 아래에 **있다** — 반투명 파츠는 그 96면이 '두께'라서
        //    반드시 필요하다(사유는 `hollow` 정의부 주석 참고). 없다고 적힌 옛 주석을 보고
        //    지우지 말 것.
        // 덩어리의 정수 경계 상자. 파츠를 이어 붙일 때 "어디서 끝났나"를 재는 자.
        bounds: function (voxels) {
            if (!voxels.length) return null;
            var b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
            for (var i = 0; i < voxels.length; i++) {
                var v = voxels[i];
                if (v.x < b.x0) b.x0 = v.x; if (v.x > b.x1) b.x1 = v.x;
                if (v.y < b.y0) b.y0 = v.y; if (v.y > b.y1) b.y1 = v.y;
                if (v.z < b.z0) b.z0 = v.z; if (v.z > b.z1) b.z1 = v.z;
            }
            return b;
        },

        // ── 단면 적층 조형 ────────────────────────────────────────────────────
        // 🚨 **여기가 화풍 전환의 핵심이다.** 구/토러스/캡슐 프리미티브가 화풍 정합 2/10 을
        //    받은 이유는 '매끈해서'가 아니라 **면이 축정렬이 아니어서**다(비스듬한 삼각형이
        //    보이면 그 순간 voxel 로 안 읽힌다). 아래 헬퍼는 전부 **정수 격자 칸만** 채우므로
        //    나오는 면이 6방향뿐이다 — 그게 '큐브로 읽힌다'의 기계적 정의다.
        //
        // 타원 기둥의 한 층(또는 여러 층). rix/riz > 0 이면 그만큼 속을 판다(= 큐브 링).
        //   반지름은 **칸 개수 단위의 실수**다(r = 3.5 면 −3..3 = 7칸 폭).
        //   포함 판정을 칸 중심(정수 좌표)으로 하므로 r 이 0.5 미만이면 중앙 한 칸만 남는다.
        ellipse: function (rx, rz, h, opts) {
            opts = opts || {};
            var rix = opts.rix || 0, riz = opts.riz || 0, color = opts.color;
            var y0 = opts.y0 || 0, hh = (h === undefined ? 1 : h);
            var out = [];
            if (rx <= 0 || rz <= 0 || hh <= 0) return out;
            var mx = Math.floor(rx), mz = Math.floor(rz);
            for (var x = -mx; x <= mx; x++) for (var z = -mz; z <= mz; z++) {
                var ox = x / rx, oz = z / rz;
                if (ox * ox + oz * oz > 1.0000001) continue;
                if (rix > 0 && riz > 0) {
                    var ix = x / rix, iz = z / riz;
                    if (ix * ix + iz * iz <= 1.0000001) continue;   // 속을 판 자리
                }
                for (var y = 0; y < hh; y++) out.push({ x: x, y: y0 + y, z: z, c: color });
            }
            return out;
        },
        // 원기둥(속 찬 원판 기둥). 토러스가 아니라 **판**이 필요할 때.
        disc: function (r, h, color, rz) {
            return this.ellipse(r, rz === undefined ? r : rz, h, { color: color });
        },
        // 🧊 **큐브 링** — 토러스 대체. 반지·목걸이 고리·버클·왕관 테두리가 전부 이것이다.
        //   두께 t 는 바깥 반지름에서 안쪽을 판 나머지다(t 가 1 미만이면 링이 끊긴다).
        ring: function (rOut, t, h, color) {
            return this.ellipse(rOut, rOut, h === undefined ? 1 : h,
                { rix: rOut - t, riz: rOut - t, color: color });
        },
        // 🧊 **계단형 돔** — 반구 대체. 층마다 반지름이 줄어드는 원판을 쌓아 계단을 만든다.
        //   ⚠️ 층 반지름을 **칸 중심 높이**(y+0.5)로 계산한다. y 로 계산하면 맨 아래 층이
        //      정확히 r 이 되어 밑동이 원기둥처럼 한 층 곧게 서고, 맨 위가 반 층 뾰족해진다.
        //   opts.t 를 주면 껍데기만 남긴다(속이 안 보이는 투구·돔 지붕에서 칸 수를 줄인다).
        dome: function (r, h, color, opts) {
            opts = opts || {};
            var hin = (h === undefined ? r : h);
            if (hin <= 0 || r <= 0) return [];      // 높이 0 은 '층 없음' — `disc(r,0)` 과 같게 맞춘다
            var out = [], hh = Math.max(1, Math.round(hin));
            for (var y = 0; y < hh; y++) {
                var k = (y + 0.5) / hh;
                var rr = r * Math.sqrt(Math.max(0, 1 - k * k));
                if (rr < 0.5) rr = 0.5;                       // 꼭대기는 한 칸으로 닫는다
                var lay = this.ellipse(rr, rr, 1, { y0: y, color: color });
                if (opts.t > 0) {
                    var inner = this.ellipse(rr - opts.t, rr - opts.t, 1, { y0: y, color: color });
                    var seen = occupancy(inner);
                    lay = lay.filter(function (v) { return !seen[key(v.x, v.y, v.z)]; });
                }
                out = out.concat(lay);
            }
            return out;
        },
        // 절두원뿔(테이퍼) — 캡슐·원뿔 대체. r0(밑) → r1(위) 로 층마다 선형 보간한다.
        //   opts.t 로 속을 파면 나팔형 커프·소매가 된다.
        taper: function (r0, r1, h, color, opts) {
            opts = opts || {};
            if (!(h > 0)) return [];                // ⚠️ `Math.max(1, …)` 만 두면 h=0 이 한 층을 만든다
            var out = [], hh = Math.max(1, Math.round(h));
            for (var y = 0; y < hh; y++) {
                var k = hh === 1 ? 0 : y / (hh - 1);
                var rr = r0 + (r1 - r0) * k;
                if (rr < 0.5) continue;
                out = out.concat(this.ellipse(rr, rr, 1, {
                    y0: y, color: color,
                    rix: opts.t > 0 ? rr - opts.t : 0, riz: opts.t > 0 ? rr - opts.t : 0,
                }));
            }
            return out;
        },
        // 링 목록을 선형 보간해 쌓는다 — 기존 `shellFromRings`(매끈 회전체)의 voxel 대응.
        //   rings = [{y, rx, rz, t?}] · y 는 **칸 번호**다. 부위마다 단면을 재서 옮겨 적으면
        //   비례를 그대로 유지한 채 조형만 큐브로 바뀐다(인계 메모: 비례는 그대로 옮겨 쓸 것).
        shell: function (rings, color, opts) {
            opts = opts || {};
            var out = [];
            for (var i = 0; i < rings.length - 1; i++) {
                var a = rings[i], b = rings[i + 1];
                var y0 = Math.round(a.y), y1 = Math.round(b.y);
                for (var y = y0; y < y1; y++) {
                    var k = (y1 === y0) ? 0 : (y - y0) / (y1 - y0);
                    var rx = a.rx + (b.rx - a.rx) * k;
                    var rz = (a.rz === undefined ? a.rx : a.rz) + ((b.rz === undefined ? b.rx : b.rz) - (a.rz === undefined ? a.rx : a.rz)) * k;
                    var t = (a.t === undefined ? opts.t : a.t);
                    out = out.concat(this.ellipse(rx, rz, 1, {
                        y0: y, color: color,
                        rix: t > 0 ? rx - t : 0, riz: t > 0 ? rz - t : 0,
                    }));
                }
            }
            return out;
        },
        // 🧊 **라멜라 판** — 판금 라메·견갑·치마갑의 겹친 판. 판이 서로 **겹치는 게 실제 라멜라다**
        //   (판이 미끄러지며 포개진다). step < h 로 두어 겹침을 만든다.
        //   opts: { rx, rz, h 판 두께(칸), step 판 간격, drx/drz 판마다 반경 증감,
        //           t 속 두께(띠로 만들 때), colors 판별 색 배열 }
        lamella: function (n, opts) {
            opts = opts || {};
            var rx = opts.rx === undefined ? 4 : opts.rx;
            var rz = opts.rz === undefined ? rx : opts.rz;
            var h = Math.max(1, Math.round(opts.h === undefined ? 2 : opts.h));
            var step = opts.step === undefined ? Math.max(1, h - 1) : Math.round(opts.step);
            var out = [];
            for (var i = 0; i < n; i++) {
                var px = rx + (opts.drx || 0) * i, pz = rz + (opts.drz || 0) * i;
                if (px < 0.5 || pz < 0.5) break;
                var c = opts.colors ? opts.colors[i % opts.colors.length] : opts.color;
                out = out.concat(this.ellipse(px, pz, h, {
                    y0: i * step, color: c,
                    rix: opts.t > 0 ? px - opts.t : 0, riz: opts.t > 0 ? pz - opts.t : 0,
                }));
            }
            return out;
        },
        // 계단형 구 — `SphereGeometry` 대체. 구슬·펜던트·너클처럼 '덩어리 하나'가 필요한 자리.
        //   ⚠️ 반지름이 2 미만이면 구가 아니라 그냥 큐브로 보인다. 작은 알은 `gem`(45° 계단)이
        //      낫다 — 같은 칸 수에서 모서리가 살아 '깎은 보석'으로 읽힌다.
        ball: function (r, color) {
            var out = [], m = Math.floor(r), rr = r * r;
            for (var x = -m; x <= m; x++) for (var y = -m; y <= m; y++) for (var z = -m; z <= m; z++)
                if (x * x + y * y + z * z <= rr + 1e-6) out.push({ x: x, y: y, z: z, c: color });
            return out;
        },
        // 🧊 **큐브 보석** — 팔면체 대체. |x|+|y|+|z| ≤ r 이라 계단이 45° 로 떨어진다.
        //   보석은 작게 쓰이므로(반지 알 r=2~3) 밀도를 더 올려도 칸 수가 안 는다.
        gem: function (r, color) {
            var out = [], m = Math.floor(r);
            for (var x = -m; x <= m; x++) for (var y = -m; y <= m; y++) for (var z = -m; z <= m; z++)
                if (Math.abs(x) + Math.abs(y) + Math.abs(z) <= r) out.push({ x: x, y: y, z: z, c: color });
            return out;
        },
        // 계단식 픽셀 베벨을 먹인 판 — 화풍 ㉱ 의 3D 대응(부드러운 라운드 금지, 계단으로 깎는다).
        //   bevel 칸만큼 네 모서리를 대각으로 잘라낸다. 중심은 (0,0,0) 기준 x/z 대칭.
        slab: function (w, h, d, color, bevel) {
            var out = [], bv = bevel || 0;
            var hx = (w - 1) / 2, hz = (d - 1) / 2;
            for (var xi = 0; xi < w; xi++) for (var zi = 0; zi < d; zi++) {
                var ex = Math.min(xi, w - 1 - xi), ez = Math.min(zi, d - 1 - zi);
                if (bv > 0 && ex + ez < bv) continue;              // 모서리를 계단으로 깎는다
                for (var y = 0; y < h; y++)
                    out.push({ x: Math.round(xi - hx), y: y, z: Math.round(zi - hz), c: color });
            }
            return out;
        },

        // 채워진 타원체. r* 는 반지름(복셀 수, 실수 가능).
        //   판정은 복셀 **중심**에서 한다 — 모서리로 하면 반지름 1 짜리가 3×3×3 으로 부푼다.
        ellipsoid: function (rx, ry, rz, color) {
            var out = [];
            var ix = Math.floor(rx), iy = Math.floor(ry), iz = Math.floor(rz);
            for (var x = -ix; x <= ix; x++) for (var y = -iy; y <= iy; y++) for (var z = -iz; z <= iz; z++) {
                var dx = x / (rx || 1), dy = y / (ry || 1), dz = z / (rz || 1);
                if (dx * dx + dy * dy + dz * dz <= 1.0001) out.push({ x: x, y: y, z: z, c: color });
            }
            return out;
        },
        // 회전체 — `prof` = [[r, y], ...] 를 y 로 정렬해 선형 보간하며 채운다.
        //   `LatheGeometry` 를 쓰던 파츠(슬라임 물방울·골렘 몸통·버섯 갓)를 **같은 프로파일
        //   숫자 그대로** 큐브로 옮기기 위한 것이다 — 실루엣을 다시 디자인하지 않아도 된다.
        //   y 는 0 부터 시작하는 '바닥 기준' 좌표를 그대로 받는다(회전축 = y).
        revolve: function (prof, color) {
            var p = prof.slice().sort(function (a, b) { return a[1] - b[1]; });
            var y0 = Math.round(p[0][1]), y1 = Math.round(p[p.length - 1][1]);
            var out = [];
            for (var y = y0; y <= y1; y++) {
                // 이 높이의 반지름 — 프로파일 구간을 찾아 선형 보간.
                var r = 0;
                for (var i = 0; i < p.length - 1; i++) {
                    var a = p[i], b = p[i + 1];
                    if (y >= a[1] && y <= b[1]) {
                        var t = (b[1] === a[1]) ? 0 : (y - a[1]) / (b[1] - a[1]);
                        r = a[0] + (b[0] - a[0]) * t;
                        break;
                    }
                }
                if (y <= p[0][1]) r = p[0][0];
                if (y >= p[p.length - 1][1]) r = p[p.length - 1][0];
                var ir = Math.floor(r);
                for (var x = -ir; x <= ir; x++) for (var z = -ir; z <= ir; z++)
                    if (x * x + z * z <= r * r + 0.0001) out.push({ x: x, y: y, z: z, c: color });
            }
            return out;
        },
        // 🧊 **바위 덩어리** — `Scene3D.boulderGeo`(이십면체를 노이즈로 깎던 것)의 voxel 대응.
        //   골렘·맵 프롭·광석이 전부 이 모양이라 한 자리에 모은다.
        //   타원체에서 시작해 **표면 칸만** 좌표 해시로 깎아 내(0..1 이 `bite` 미만이면 제거)
        //   울퉁불퉁한 청크를 만든다. 속 칸은 안 건드린다 — 속을 깎으면 겉이 뚫려 구멍이 난다.
        //   ⚠️ **`Math.random` 을 쓰지 않는다.** 개체마다 달라야 하는 건 `seed` 로 주고, 같은
        //      seed 는 언제나 같은 바위를 낸다 — 안 그러면 A/B 캡처와 회귀 프로브가 흔들린다.
        //   opts: { bite 깎는 비율 0~0.5 · flatBottom 밑을 평평하게 자를 y(칸) · color }
        rock: function (r, seed, opts) {
            opts = opts || {};
            var bite = opts.bite === undefined ? 0.28 : opts.bite;
            var rx = opts.rx === undefined ? r : opts.rx;
            var ry = opts.ry === undefined ? r : opts.ry;
            var rz = opts.rz === undefined ? r : opts.rz;
            var base = this.ellipsoid(rx, ry, rz, opts.color);
            var occ = occupancy(base), out = [];
            var sd = (seed || 0) | 0;
            for (var i = 0; i < base.length; i++) {
                var v = base[i];
                if (opts.flatBottom !== undefined && v.y < opts.flatBottom) continue;  // 접지면은 평평하게
                // 표면 칸인가 — 6이웃 중 하나라도 비었으면 겉이다.
                var surf = false;
                for (var f = 0; f < FACES.length; f++) {
                    var n = FACES[f].n;
                    if (!occ[key(v.x + n[0], v.y + n[1], v.z + n[2])]) { surf = true; break; }
                }
                if (surf) {
                    var h = ((v.x + 31) * 73856093) ^ ((v.y + 37) * 19349663) ^ ((v.z + 41) * 83492791) ^ (sd * 2654435761);
                    h = (h ^ (h >>> 13)) >>> 0;
                    if ((h % 1000) / 1000 < bite) continue;   // 이 칸은 떨어져 나갔다
                }
                out.push(v);
            }
            return out;
        },

        // 겉껍질만 남긴다 — 6이웃 중 하나라도 비어 있는 복셀만.
        //   🚨 **위의 `shell(rings, …)` 과 헷갈리지 말 것 — 이름이 비슷하지만 하는 일이 다르다.**
        //      `shell` 은 링 목록으로 **회전체를 만들면서** 반경 방향으로만 속을 판다(위·아래가
        //      뚫린 관이 된다). `hollow` 는 **이미 만든 덩어리**에서 겉 한 겹만 남기므로
        //      정수리·바닥까지 닫힌다. 젤리처럼 위에서 속이 보이면 안 되는 파츠는 이쪽이다.
        //      (두 함수는 2026-08-19 에 두 세션이 동시에 넣은 것이라 이름이 겹쳤다 — 합칠 때
        //       뒤엣것을 `hollow` 로 고쳤다. 다시 `shell` 로 되돌리지 말 것.)
        //   🚨 **반투명 파츠(젤리 슬라임 등)에는 이게 필수다.** 속을 꽉 채우면 안쪽 면이
        //      전부 제거돼(ⓑ) 겉면 한 겹만 남고, 그러면 반투명 너머로 보여야 할 **속 파츠가
        //      가려지는 게 아니라 '두께가 없어' 유리막처럼 보인다.** 껍질로 만들면 안쪽 면이
        //      살아나 두께가 읽히고 핵·기포가 그 안에 잠긴 것으로 읽힌다.
        //   불투명 파츠에 걸어도 결과 메시는 같고(안 보이는 면은 어차피 제거된다) 복셀 수만
        //   준다 — 다만 AO 는 달라진다(속이 비면 안쪽 코너가 안 막혀 이음새가 밝아진다).
        hollow: function (voxels) {
            var occ = occupancy(voxels), out = [];
            for (var i = 0; i < voxels.length; i++) {
                var v = voxels[i], open = false;
                for (var f = 0; f < FACES.length; f++) {
                    var n = FACES[f].n;
                    if (!occ[key(v.x + n[0], v.y + n[1], v.z + n[2])]) { open = true; break; }
                }
                if (open) out.push(v);
            }
            return out;
        },
        // 복셀 목록 → THREE.Mesh. 브라우저 전용(THREE 필요).
        // opts: { size 복셀 한 변의 월드 길이, color 기본색, jitter 색변화 폭(0~0.15),
        //         ao 이음새 강도(0~1), material 재질 오버라이드, center 중심 정렬 여부 }
        build: function (voxels, opts) {
            opts = opts || {};
            var THREE = root.THREE;
            if (!THREE) throw new Error('Voxel.build 는 THREE 가 필요하다(브라우저 전용)');
            var size = opts.size === undefined ? 0.1 : opts.size;
            var jit = opts.jitter === undefined ? 0.06 : opts.jitter;
            var aoS = opts.ao === undefined ? 1 : opts.ao;
            var fl = faces(voxels, { color: opts.color === undefined ? 0xffffff : opts.color });

            // 중심 정렬 — 파츠를 피벗에 달 때 기준점이 덩어리 한복판이어야 회전이 자연스럽다.
            var cx = 0, cy = 0, cz = 0;
            if (opts.center !== false && voxels.length) {
                var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
                for (var i = 0; i < voxels.length; i++) {
                    var v = voxels[i];
                    if (v.x < mnx) mnx = v.x; if (v.x > mxx) mxx = v.x;
                    if (v.y < mny) mny = v.y; if (v.y > mxy) mxy = v.y;
                    if (v.z < mnz) mnz = v.z; if (v.z > mxz) mxz = v.z;
                }
                cx = (mnx + mxx) / 2; cy = (mny + mxy) / 2; cz = (mnz + mxz) / 2;
            }

            var pos = new Float32Array(fl.length * 18);      // 면당 삼각형 2개 = 정점 6개
            var nor = new Float32Array(fl.length * 18);
            var col = new Float32Array(fl.length * 18);
            var col3 = new THREE.Color();
            var p = 0;
            for (var f = 0; f < fl.length; f++) {
                var F = fl[f];
                col3.setHex(F.c === undefined ? 0xffffff : F.c);
                var jf = jitter(F.vx, F.vy, F.vz, jit);
                // 🚨 AO 가 낮은 코너 쪽으로 사각형을 갈라야 한다. 반대로 가르면 어두운 구석이
                //    삼각형 하나를 가로질러 번져 '이음새가 대각선으로 새는' 무늬가 된다
                //    (복셀 렌더링에서 잘 알려진 flipped-quad 문제).
                var flip = (F.ao[0] + F.ao[2]) < (F.ao[1] + F.ao[3]);
                var order = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
                for (var k = 0; k < 6; k++) {
                    var ci = order[k], cn = F.corners[ci];
                    pos[p] = (cn[0] - cx) * size; pos[p + 1] = (cn[1] - cy) * size; pos[p + 2] = (cn[2] - cz) * size;
                    nor[p] = F.n[0]; nor[p + 1] = F.n[1]; nor[p + 2] = F.n[2];
                    var sh = aoShade(F.ao[ci], aoS) * jf;
                    col[p] = col3.r * sh; col[p + 1] = col3.g * sh; col[p + 2] = col3.b * sh;
                    p += 3;
                }
            }
            var geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
            geo.computeBoundingSphere();
            var mat = opts.material || new THREE.MeshStandardMaterial({
                vertexColors: true, metalness: 0, roughness: 0.85, flatShading: true,
            });
            var mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData.voxel = true;
            return mesh;
        },
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Voxel;
    root.Voxel = Voxel;
})(typeof window !== 'undefined' ? window : globalThis);
