// ============================================================================
// Mobs — 마인크래프트 몹 문법 박스 모델 (pet-mount-minecraft-remake, 2026-08-21)
// ----------------------------------------------------------------------------
// 사용자 지시(2026-08-21): *"펫, 탈것 디자인 너무 구림. 전부 마인크래프트꺼 참고해서
//   폐기하고 다시 만들어."* + 재확인 *"안장 같은 장구류도 디자인이니 같이 갈아엎어라."*
//
// 왜 통째로 새 파일인가 — 종전 조형이 실패한 원인은 종별 좌표가 아니라 **문법**이었다:
//   ⓐ `sp`(타원체)·`cn`(원뿔)·`cy`(원기둥)·`tube`(비스듬한 관)를 복셀로 적층해 만들었다.
//      곡면을 칸으로 근사하면 **계단 실루엣 + 들쭉날쭉한 표면**이 나온다 — 캡처에서 54종이
//      전부 '뭉개진 사탕 덩어리'로 읽힌 실체가 이것이다(칸 크기 문제가 아니다).
//   ⓑ 파츠 수가 종당 40~120개라 240px 썸네일에서 실루엣이 뭉친다.
//   ⓒ 색이 '캔디 재배정'을 거치며 종 자연색을 잃었다(파란 조랑말·분홍 염소·보라 큰사슴).
//
// 마인크래프트의 문법은 정확히 그 반대이고, 이 파일은 그것만 한다:
//   ① **축정렬 직육면체 몇 개**로 끝낸다(돼지 = 몸통·머리·주둥이·다리 4 = 6덩이).
//      곡면 근사가 아예 없으니 실루엣이 항상 깨끗하다.
//   ② 디테일은 형태가 아니라 **면에 칠한 픽셀(텍스처)** 로 낸다 — 눈·코·무늬·발굽이 전부
//      칸 색이다. (여기선 텍스처 파일 대신 `paint` 규칙으로 칸 색을 직접 칠한다.)
//   ③ 색은 **종 자연색**. 마크가 "다이아몬드 검"이지 "네모 다이아몬드 검"이 아닌 것처럼,
//      돼지는 분홍이고 말은 갈색이다.
//   ④ 애니는 파츠 피벗 회전(다리 스윙·머리 끄덕)뿐 — 마크 몹이 하는 그대로.
//
// 좌표 규약: 모든 수치는 **칸(cell)** 이다. y=0 이 발바닥, +z 가 정면, x 는 좌우 대칭.
//   `at` 은 덩어리 **중심**. 월드 크기는 `cell`(칸 한 변의 월드 길이)이 정한다 —
//   종마다 cell 을 달리 주면 같은 격자 문법을 유지한 채 몸집만 갈린다.
// ============================================================================
(function (root) {
    'use strict';
    var Voxel = root.Voxel;

    // ── 칸 칠하기 ────────────────────────────────────────────────────────────
    // 규칙 하나 = { c: 색, x/y/z: 범위 }. 범위는 [a,b](끝 포함) · 숫자 하나 · 생략(전체).
    // 음수는 뒤에서부터 센다(−1 = 마지막 칸) — 얼굴 앞면(z:-1)·발바닥(y:0)을 종에 무관하게
    // 같은 문법으로 집기 위한 것이다. 마크 텍스처가 하는 일을 좌표로 하는 셈.
    function span(r, n) {
        if (r === undefined || r === null) return [0, n - 1];
        if (typeof r === 'number') { var v = r < 0 ? n + r : r; return [v, v]; }
        var a = r[0] < 0 ? n + r[0] : r[0], b = r[1] < 0 ? n + r[1] : r[1];
        return [a, b];
    }
    function paint(cells, w, h, d, rules) {
        if (!rules || !rules.length) return cells;
        var out = cells.slice(), i, k;
        for (k = 0; k < rules.length; k++) {
            var R = rules[k];
            if (!R) continue;
            var xs = span(R.x, w), ys = span(R.y, h), zs = span(R.z, d);
            for (i = 0; i < out.length; i++) {
                var v = out[i];
                if (v.x < xs[0] || v.x > xs[1]) continue;
                if (v.y < ys[0] || v.y > ys[1]) continue;
                if (v.z < zs[0] || v.z > zs[1]) continue;
                // mirror: 좌우 한쪽만 칠하는 규칙(귀·눈 한 짝)을 반대쪽에도 자동 적용
                out[i] = { x: v.x, y: v.y, z: v.z, c: R.c };
            }
        }
        return out;
    }

    // 좌우 대칭 칠하기 — {mx:true} 면 x 범위를 거울로 한 번 더 적용한다(눈 두 짝을 한 줄로).
    function expand(rules, w) {
        if (!rules) return null;
        var out = [];
        for (var i = 0; i < rules.length; i++) {
            var R = rules[i];
            out.push(R);
            if (R && R.mx) {
                var xs = span(R.x, w);
                out.push({ c: R.c, x: [w - 1 - xs[1], w - 1 - xs[0]], y: R.y, z: R.z });
            }
        }
        return out;
    }

    // ── 재질 캐시 ────────────────────────────────────────────────────────────
    // 파츠마다 재질을 새로 만들면 드로우콜 배칭이 통째로 깨진다. 성질(투명·발광·무조명)이
    // 같은 것끼리 하나를 공유한다. 색은 정점에 굽으므로 재질 색은 항상 흰색이다.
    function matKey(o) {
        if (!o) return 'std';
        return (o.basic ? 'b' : 's') + '|' + (o.opacity === undefined ? 1 : o.opacity) +
            '|' + (o.emissive === undefined ? '' : o.emissive) + '|' + (o.emissiveIntensity || 0) +
            '|' + (o.rough === undefined ? '' : o.rough);
    }
    function makeMat(THREE, o) {
        o = o || {};
        var p = { vertexColors: true, color: 0xffffff };
        if (o.opacity !== undefined && o.opacity < 1) { p.transparent = true; p.opacity = o.opacity; p.depthWrite = false; }
        if (o.basic) return new THREE.MeshBasicMaterial(p);
        if (o.emissive !== undefined) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveIntensity === undefined ? 0.7 : o.emissiveIntensity; }
        p.metalness = 0; p.roughness = o.rough === undefined ? 0.9 : o.rough;
        p.flatShading = true;
        return new THREE.MeshStandardMaterial(p);
    }

    // ── 조립 ────────────────────────────────────────────────────────────────
    // model = { cell, parts: [...] }
    // part  = { id, box:[w,h,d], at:[x,y,z], c, paint, mat, parent, pivot, rot, joint, tag, s, gait, head }
    //   parent : 이 파츠를 어느 피벗 밑에 달지(머리 장식은 parent:'head' — 안 그러면 머리만
    //            끄덕이고 뿔·귀가 허공에 남는다. 종전 판이 실제로 밟은 사고다).
    //   pivot  : 회전축 자리(칸). 주면 그 자리에 Group 을 세우고 파츠를 그 밑에 단다.
    //   joint  : 펫 제너릭 드라이버용 서술 { axis, amp, f, ph, gain, abs, spin }.
    //   tag    : 탈것 드라이버가 훑는 손잡이('leg'|'head'|'tail'|'wing'|'wheel'|'spinner'|'glow'|'claw').
    function build(model, opts) {
        opts = opts || {};
        var THREE = root.THREE;
        if (!THREE) throw new Error('Mobs.build 는 THREE 가 필요하다');
        var cell = opts.cell || model.cell || 0.03;
        var tint = opts.tint || null;                  // (hex, role) → hex : 등급·상태 색 보정 훅
        // 🎨 채도 보정 — 게임 씬은 ACES 톤맵 + 낮은 광량이라 같은 색이 미리보기보다 한 단계 씻긴다
        //    (이 저장소가 여러 번 실측한 렌더러 성질). 표의 색은 '눈으로 고른 자연색'이므로 표를
        //    흔들지 말고 **게임 경로에서만** 채도를 조금 올려 원래 의도한 색으로 되돌린다.
        var vivid = opts.vivid || 0;
        var group = new THREE.Group();
        var mats = {}, pivots = {}, i;
        var out = {
            group: group, cell: cell, joints: [], legs: [], wings: [], wheels: [],
            spinners: [], glow: [], claws: [], parts: {}, head: null, tail: null, boxes: {},
        };
        var parts = model.parts;
        for (i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (!p || p.off) continue;
            var w = p.box[0], h = p.box[1], d = p.box[2];
            var col = tint ? tint(p.c, p) : p.c;
            if (vivid) {
                var _c = new THREE.Color(col), _h = {};
                _c.getHSL(_h);
                if (_h.s > 0.06) _c.setHSL(_h.h, Math.min(1, _h.s + vivid), Math.min(0.94, _h.l + vivid * 0.22));
                col = _c.getHex();
            }
            var cells = Voxel.box(w, h, d, col);
            if (p.paint) cells = paint(cells, w, h, d, expand(p.paint, w));
            var mk = matKey(p.mat);
            if (!mats[mk]) mats[mk] = makeMat(THREE, p.mat);
            var mesh = Voxel.build(cells, {
                size: cell, material: mats[mk], color: col, center: true,
                jitter: p.mat && p.mat.basic ? 0 : 0.022, ao: 0.85,
            });
            var parent = (p.parent && pivots[p.parent]) || group;
            var base = (p.parent && pivots[p.parent]) ? pivots[p.parent].userData.origin : [0, 0, 0];
            var node = mesh;
            if (p.pivot) {
                var pv = new THREE.Group();
                pv.position.set((p.pivot[0] - base[0]) * cell, (p.pivot[1] - base[1]) * cell, (p.pivot[2] - base[2]) * cell);
                pv.userData.origin = p.pivot;
                mesh.position.set((p.at[0] - p.pivot[0]) * cell, (p.at[1] - p.pivot[1]) * cell, (p.at[2] - p.pivot[2]) * cell);
                pv.add(mesh);
                parent.add(pv);
                node = pv;
                if (p.id) pivots[p.id] = pv;
            } else {
                mesh.position.set((p.at[0] - base[0]) * cell, (p.at[1] - base[1]) * cell, (p.at[2] - base[2]) * cell);
                parent.add(mesh);
                if (p.id) { pivots[p.id] = mesh; mesh.userData.origin = p.at; }
            }
            if (p.rot) { node.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0); }
            if (p.id) { out.parts[p.id] = node; out.boxes[p.id] = { box: p.box, at: p.at }; }
            // 머리 소속 표식 — 탑승 가림 판정(probe-ride-clear)이 머리 파츠만 골라 본다.
            if (p.head || p.tag === 'head' || (p.parent === 'head')) node.userData.part = 'head';
            // 🔎 파츠 이름표 — 레이캐스트가 맞은 게 **어느 파츠인지** 말할 수 있어야 한다.
            //    (2026-08-25: `probe-ride-clear` 가 가림 지점을 좌표로만 찍어, 익룡 근쪽 다리를 가리는
            //     범인을 세 세션이 '목인가 부리인가 몸통인가' 로 추측만 하다 끝났다. 표에 이미 있는
            //     `id`/`tag` 를 메시까지 내려 두면 그 추측이 한 번에 끝난다.)
            //    ⚠️ 히트하는 건 **메시**고 `p.pivot` 이 있으면 node 는 그 위의 Group 이라 **둘 다** 찍는다.
            var pid = p.id || p.tag || ('part' + i);
            mesh.userData.pid = pid; node.userData.pid = pid;
            if (!mesh.name) mesh.name = pid;
            if (p.parent) { mesh.userData.pparent = p.parent; node.userData.pparent = p.parent; }
            switch (p.tag) {
                case 'head': out.head = node; break;
                case 'tail': if (!out.tail) out.tail = node; break;
                case 'leg': node.userData.gait = p.gait === undefined ? 1 : p.gait; out.legs.push(node); break;
                case 'wing': node.userData.s = p.s === undefined ? 1 : p.s; out.wings.push(node); break;
                case 'wheel': out.wheels.push(node); break;
                case 'spinner': out.spinners.push(node); break;
                case 'glow': out.glow.push(node); break;
                case 'claw': node.userData.s = p.s === undefined ? 1 : p.s; out.claws.push(node); break;
            }
            if (p.joint) {
                out.joints.push({
                    o: node, axis: p.joint.axis || 'x', base: node.rotation[p.joint.axis || 'x'] || 0,
                    amp: p.joint.amp === undefined ? 0.3 : p.joint.amp, ph: p.joint.ph || 0,
                    f: p.joint.f === undefined ? 1 : p.joint.f, gain: p.joint.gain === undefined ? 1 : p.joint.gain,
                    abs: !!p.joint.abs, spin: !!p.joint.spin,
                });
            }
        }
        return out;
    }

    root.Mobs = { build: build, paint: paint, span: span };
})(typeof window !== 'undefined' ? window : globalThis);
