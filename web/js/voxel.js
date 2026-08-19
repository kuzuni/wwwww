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
