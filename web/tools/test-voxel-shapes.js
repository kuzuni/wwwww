// 큐브 적층 조형 헬퍼(계단형 돔·큐브 링·라멜라 판·테이퍼·큐브 보석)의 순수 계산부 시험.
//   왜 따로 두는가: `test-voxel.js` 는 **면 제거·AO** 라는 렌더 규칙을 잠근다. 이 파일은
//   **모양이 실제로 그 모양인가**(돔이 위로 갈수록 좁아지나, 링 속이 실제로 뚫렸나,
//   라멜라 판이 실제로 겹치나)를 잠근다 — 두 축을 한 파일에 섞으면 회귀 원인이 안 갈린다.
//
// 🚨 이 시험의 존재 이유 = **화풍 정합의 기계적 정의**. `equip-design-dedupe` ⑤ 가 화풍
//    2/10 을 받은 근거는 "구/토러스/캡슐이라 voxel 로 안 읽힌다"였다. 조형이 voxel 인지
//    아닌지는 취향이 아니라 **면 법선이 6방향뿐인가**로 결정되고, 그건 node 로 잰다.
//    (아래 ⑨가 그 판정이다 — 헬퍼가 늘어나면 반드시 거기 목록에 추가할 것.)
// 사용: node test-voxel-shapes.js      (전부 통과 exit 0 / 하나라도 실패 exit 1)
const V = require('../js/voxel.js');

let fail = 0;
const eq = (name, got, want) => {
    const ok = got === want;
    console.log(`${ok ? '✅' : '❌'} ${name}: ${got}${ok ? '' : ` (기대 ${want})`}`);
    if (!ok) fail++;
};
const ok = (name, cond, detail) => {
    console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
    if (!cond) fail++;
};
const has = (vox, x, y, z) => vox.some(v => v.x === x && v.y === y && v.z === z);
// 한 y 층의 x 반경(칸 중심 기준 최대 |x|).
const rowR = (vox, y) => {
    const r = vox.filter(v => v.y === y).map(v => Math.abs(v.x));
    return r.length ? Math.max(...r) : -1;
};

// ── ① 타원 단면 ──────────────────────────────────────────────────────────────
{
    const d = V.disc(3.5, 1);
    ok('원판은 4분면 칸 수가 같다(축정렬 대칭)',
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) =>
            d.filter(v => Math.sign(v.x) === sx && Math.sign(v.z) === sz).length)
            .every((n, _, a) => n === a[0]));
    ok('원판 반지름을 안 넘는다', d.every(v => v.x * v.x + v.z * v.z <= 3.5 * 3.5 + 1e-6));
    eq('원판 높이 h=3 은 층이 3개', new Set(V.disc(3, 3).map(v => v.y)).size, 3);
    // 타원: rx 와 rz 를 다르게 주면 실제로 납작해진다(손등·발 단면이 이걸 쓴다).
    const e = V.ellipse(5, 2, 1);
    eq('타원 x 폭', Math.max(...e.map(v => v.x)), 5);
    eq('타원 z 폭', Math.max(...e.map(v => v.z)), 2);
}

// ── ② 큐브 링(토러스 대체) ───────────────────────────────────────────────────
{
    const r = V.ring(5, 2, 1);
    ok('링 한가운데는 뚫려 있다', !has(r, 0, 0, 0));
    ok('링 바깥 테두리는 있다', has(r, 5, 0, 0) && has(r, -5, 0, 0) && has(r, 0, 0, 5));
    // 두께 t=2 → 안쪽 반지름 3. 반지름 3 이내는 전부 비어야 한다.
    ok('링 두께가 t 를 지킨다',
        r.every(v => Math.hypot(v.x, v.z) > 3 - 1e-6),
        `최소 반지름 ${Math.min(...r.map(v => Math.hypot(v.x, v.z))).toFixed(2)}`);
    // 음성 대조: 두께가 반지름 이상이면 속을 못 파므로 **속 찬 원판**과 같아야 한다.
    eq('t ≥ rOut 이면 속 찬 원판과 같다', V.ring(4, 4, 1).length, V.disc(4, 1).length);
}

// ── ③ 계단형 돔(반구 대체) ───────────────────────────────────────────────────
{
    const d = V.dome(6, 6);
    const rs = [0, 1, 2, 3, 4, 5].map(y => rowR(d, y));
    ok('돔은 위로 갈수록 반지름이 줄어든다(비증가)',
        rs.every((r, i) => i === 0 || r <= rs[i - 1]), `층별 ${rs.join('→')}`);
    ok('돔은 실제로 줄어든다(원기둥이 아니다)', rs[5] < rs[0], `${rs[0]} → ${rs[5]}`);
    ok('돔 꼭대기는 닫혀 있다', has(d, 0, 5, 0));
    // 🚨 밑동을 칸 중심(y+0.5)으로 재는 이유 — y 로 재면 맨 아래 층이 정확히 r 이 되어
    //    한 층이 곧게 서고 실루엣이 '원기둥 + 돔'으로 꺾인다. 그 회귀를 여기서 잡는다.
    ok('돔 밑동이 최대 반지름보다 작다(곧은 층이 없다)', rs[0] < 6, `밑동 ${rs[0]} < 6`);
    // 껍데기 모드: 속을 파면 칸이 줄지만 겉면 수는 그대로여야 한다(안 보이던 면들이다).
    const shell = V.dome(6, 6, 0, { t: 2 });
    ok('돔 껍데기는 칸이 준다', shell.length < d.length, `${d.length} → ${shell.length}`);
}

// ── ④ 테이퍼(원뿔·캡슐 대체) ─────────────────────────────────────────────────
{
    const t = V.taper(5, 1, 6);
    eq('테이퍼 밑 반지름', rowR(t, 0), 5);
    eq('테이퍼 꼭대기 반지름', rowR(t, 5), 1);
    ok('테이퍼는 단조 감소', [0, 1, 2, 3, 4, 5].map(y => rowR(t, y))
        .every((r, i, a) => i === 0 || r <= a[i - 1]));
    // 나팔형 커프: 아래가 좁고 위가 넓은 것도 같은 헬퍼로 나와야 한다(역방향).
    ok('역방향 테이퍼도 된다', rowR(V.taper(1, 5, 6), 5) === 5);
    ok('속을 판 테이퍼는 가운데가 뚫린다', !has(V.taper(5, 5, 3, 0, { t: 2 }), 0, 1, 0));
}

// ── ⑤ 라멜라 판(겹쳐 쌓인 판) ────────────────────────────────────────────────
{
    // h=3 · step=2 → 판 하나가 3층인데 2층마다 새 판이 시작하므로 **한 층씩 겹친다**.
    //   겹치는 게 실제 라멜라다(판이 서로 미끄러지며 포개진다).
    const L = V.lamella(4, { rx: 5, h: 3, step: 2, drx: 0.5, color: 0x223344 });
    const ys = [...new Set(L.map(v => v.y))].sort((a, b) => a - b);
    eq('판 4장 · step 2 · h 3 의 총 높이', ys.length, 3 + 2 * 3);
    ok('판은 아래에서 위로 넓어진다(drx>0)', rowR(L, 8) > rowR(L, 0),
        `밑판 ${rowR(L, 0)} → 윗판 ${rowR(L, 8)}`);
    // 판별 색이 실제로 갈리는지 — 라멜라는 판 경계가 보여야 판으로 읽힌다.
    const C = V.lamella(3, { rx: 4, h: 2, step: 2, colors: [1, 2, 3] });
    eq('판별 색이 3종', new Set(C.map(v => v.c)).size, 3);
    eq('판 0 의 색', C.find(v => v.y === 0).c, 1);
    eq('판 1 의 색', C.find(v => v.y === 2).c, 2);
    // 음성 대조: 판 반경이 0 이하로 줄면 거기서 멈춘다(음수 반경으로 폭주하지 않는다).
    ok('반경이 0 이하가 되면 판을 그만 쌓는다',
        new Set(V.lamella(20, { rx: 3, h: 1, step: 1, drx: -1 }).map(v => v.y)).size <= 4);
}

// ── ⑥ 큐브 보석 · 계단 베벨 판 ───────────────────────────────────────────────
{
    const g = V.gem(3);
    ok('보석은 45° 계단(맨해튼 거리)', g.every(v => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) <= 3));
    ok('보석 꼭짓점 6개가 다 있다', [[3, 0, 0], [-3, 0, 0], [0, 3, 0], [0, -3, 0], [0, 0, 3], [0, 0, -3]]
        .every(([x, y, z]) => has(g, x, y, z)));
    const b = V.ball(4);
    ok('구는 반지름 안에만 있다', b.every(v => v.x * v.x + v.y * v.y + v.z * v.z <= 16 + 1e-6));
    ok('구는 6방향 극점이 다 있다', [[4, 0, 0], [-4, 0, 0], [0, 4, 0], [0, -4, 0], [0, 0, 4], [0, 0, -4]]
        .every(([x, y, z]) => has(b, x, y, z)));
    ok('구가 보석보다 통통하다(같은 r 에서 칸이 많다)', b.length > V.gem(4).length,
        `구 ${b.length} vs 보석 ${V.gem(4).length}`);
    const s = V.slab(7, 1, 5, 0, 2);
    ok('베벨 판은 모서리 칸이 없다', !has(s, 3, 0, 2) && !has(s, -3, 0, -2));
    ok('베벨 판은 변 한복판이 남는다', has(s, 3, 0, 0) && has(s, 0, 0, 2));
    eq('베벨 0 이면 온전한 직사각 판', V.slab(7, 1, 5, 0, 0).length, 35);
}

// ── ⑦ 조립 유틸 ──────────────────────────────────────────────────────────────
{
    const a = V.box(2, 2, 2, 7);
    const b = V.at(a, 10, 0, 0);
    eq('at 은 원본을 안 고친다', Math.max(...a.map(v => v.x)), 1);
    eq('at 이동량', Math.min(...b.map(v => v.x)), 10);
    eq('merge 는 두 덩어리를 합친다', V.merge(a, b).length, 16);
    ok('merge 는 null 인자를 무시한다', V.merge(a, null, undefined).length === 8);
    const m = V.mirrorX(V.at(V.box(1, 1, 1, 0), 3, 0, 0), 0);
    eq('mirrorX(about=0)', m[0].x, -3);
    eq('mirrorX(about=5)', V.mirrorX(V.at(V.box(1, 1, 1, 0), 3, 0, 0), 5)[0].x, 7);
    eq('recolor 고정색', V.recolor(a, 9)[0].c, 9);
    eq('recolor 함수', V.recolor(a, v => v.y === 0 ? 1 : 2).filter(v => v.c === 1).length, 4);
    ok('recolor 가 undefined 를 주면 원색 유지', V.recolor(a, () => undefined)[0].c === 7);
    const bb = V.bounds(V.at(V.box(2, 3, 4, 0), -1, 5, 2));
    ok('bounds', bb.x0 === -1 && bb.x1 === 0 && bb.y0 === 5 && bb.y1 === 7 && bb.z0 === 2 && bb.z1 === 5,
        JSON.stringify(bb));
    eq('빈 덩어리의 bounds 는 null', V.bounds([]), null);
}

// ── ⑧ 🚨 '속 파내기'는 최적화가 아니다 — 쓰는 이유가 따로 있다는 걸 잠근다 ────
// 이력(두 번 뒤집혔으니 여기 남긴다):
//   ⓐ 착수 때 `Voxel.hollow`(사방이 막힌 칸 버리기)를 **메모리 최적화**로 넣었다가 이
//      시험에서 뒤집혔다. 기대는 "칸만 줄고 면은 그대로"였는데 실제로는 **면이 는다** —
//      파낸 공동의 안쪽 벽이 드러나기 때문이다. 면 제거 규칙 ⓑ 덕에 속 칸의 렌더 비용은
//      애초에 0 이었다. 그래서 헬퍼를 지우고 "존재하지 않는다"를 여기 못 박았다.
//   ⓑ 그런데 2026-08-19 에 **다른 이유로** 되살아났다: 반투명 파츠(젤리 슬라임)는 속을
//      꽉 채우면 안쪽 면이 전부 제거돼 겉 한 겹만 남고, 그러면 '두께가 없어' 유리막처럼
//      보인다. 껍질로 만들면 그 안쪽 96면이 **살아나야 하는 면**이 된다.
//   → 즉 ⓐ 의 산수는 그대로 옳고, 결론만 뒤집혔다: **면이 는다는 건 버그가 아니라 대가**다.
//     그래서 이 블록은 이제 "hollow 가 없다"가 아니라 **"hollow 는 있고, 그 대가가 얼마인지"**
//     를 잠근다. 불투명 파츠에 최적화라고 걸지 말 것(칸만 줄고 면은 96 늘어난다).
{
    const solid = V.box(6, 6, 6);
    eq('6³ 속 찬 덩어리의 겉면', V.faces(solid, {}).length, 216);
    // 손으로 속을 판 것과 헬퍼가 하는 일이 같은지 대조.
    const carved = solid.filter(v => [v.x, v.y, v.z].some(c => c === 0 || c === 5));
    eq('속을 파면 칸은 준다', carved.length, 216 - 64);
    ok('그런데 면은 오히려 는다(공동 안쪽 벽 96면)',
        V.faces(carved, {}).length === 216 + 96,
        `${V.faces(solid, {}).length} → ${V.faces(carved, {}).length}`);
    ok('Voxel.hollow 는 존재한다(반투명 두께용)', typeof V.hollow === 'function');
    const key = vox => vox.map(v => `${v.x},${v.y},${v.z}`).sort().join('|');
    ok('hollow 는 손으로 판 것과 정확히 같다', key(V.hollow(solid)) === key(carved),
        `${V.hollow(solid).length}칸`);
    ok('hollow 의 대가 = 면 96 증가(최적화 아님)',
        V.faces(V.hollow(solid), {}).length === 216 + 96,
        `${V.faces(V.hollow(solid), {}).length}면`);
    // 이미 껍질인 덩어리에 다시 걸어도 안 깎인다 — 두 번 걸려 파츠가 사라지는 사고 방지.
    eq('hollow 는 껍질에 다시 걸어도 그대로', V.hollow(V.hollow(solid)).length, 152);
    eq('hollow([]) 는 빈 목록', V.hollow([]).length, 0);
    // 그 '느는 면'이 정확히 어디인지까지 못 박는다 — 개수만 맞고 엉뚱한 자리면 두께가 아니다.
    //   6³ 의 겉 한 겹만 남으면 공동은 1..4 의 4³ 이고, 그 벽면은 법선축 좌표 0.5 / 4.5 에
    //   놓인다(바깥 면은 −0.5 / 5.5). 그 평면 위의 면이 딱 4³ 표면 96개여야 한다.
    ok('늘어난 96면은 전부 공동 안쪽 벽이다(두께가 읽히는 자리)',
        V.faces(V.hollow(solid), {}).filter(f => {
            const ax = f.n.findIndex(v => v !== 0), p = f.corners[0][ax];
            return p === 0.5 || p === 4.5;
        }).length === 96);
}

// ── ⑨ 🚨 화풍 정합의 기계적 판정 — 모든 헬퍼의 면 법선이 6방향뿐인가 ────────
{
    const AXIS = new Set(['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']);
    const shapes = {
        '원판': V.disc(4, 2), '큐브 링': V.ring(6, 2, 2), '계단형 돔': V.dome(5, 5),
        '테이퍼': V.taper(5, 1, 6), '라멜라': V.lamella(3, { rx: 4, h: 2, step: 1, drx: 0.6 }),
        '큐브 보석': V.gem(3), '계단형 구': V.ball(4), '베벨 판': V.slab(9, 2, 7, 0, 3),
        '링 적층': V.shell([{ y: 0, rx: 5, rz: 3 }, { y: 4, rx: 3, rz: 2, t: 1 }], 0),
    };
    let bad = 0;
    for (const k of Object.keys(shapes)) {
        const f = V.faces(shapes[k], {});
        const off = f.filter(x => !AXIS.has(x.n.join(',')));
        if (off.length || !f.length) { bad++; console.log(`   ↳ ${k}: 면 ${f.length}, 비축정렬 ${off.length}`); }
    }
    ok('9종 헬퍼가 전부 축정렬 면만 만든다(= voxel 로 읽힌다)', bad === 0, `위반 ${bad}종`);
    // 밀도: '조잡한 대형 블록 금지'를 수치로 — 반지름 6 짜리 링이 20칸 미만이면 너무 성기다.
    ok('링 밀도가 충분하다', V.ring(6, 2, 1).length >= 40, `${V.ring(6, 2, 1).length}칸`);
}

// ── ⑫ 90° 회전 — 거울이 아니라 회전인가(감김이 안 뒤집히는가) ───────────────
// 🚨 축 맞바꾸기 `(x,y,z)→(x,z,y)` 로 대신하면 행렬식이 −1 이라 면이 전부 안쪽을 향한다.
//    화면에서 통째로 사라지는 종류의 버그인데 node 로는 안 보이므로, 여기서 행렬식을 잰다.
{
    const det = (fn) => {
        // 기저 세 칸을 각각 돌린 뒤 삼중곱을 잰다. 회전이면 +1, 거울이면 −1.
        const m = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) => {
            const r = fn([{ x, y, z }], 1)[0];
            return [r.x, r.y, r.z];
        });
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    };
    eq('rotX 는 회전이다(행렬식 +1)', det(V.rotX.bind(V)), 1);
    eq('rotY 는 회전이다(행렬식 +1)', det(V.rotY.bind(V)), 1);
    eq('rotZ 는 회전이다(행렬식 +1)', det(V.rotZ.bind(V)), 1);
    // 네 번 돌리면 제자리.
    const src = V.taper(4, 1, 5, 3);
    const four = V.rotX(src, 4);
    const sig = a => a.map(v => `${v.x},${v.y},${v.z},${v.c}`).sort().join(';');
    ok('rotX 4회는 제자리', sig(four) === sig(src));
    ok('rotX 는 원본을 안 고친다', sig(V.rotX(src, 1)) !== sig(src) && sig(src) === sig(V.taper(4, 1, 5, 3)));
    // 세워 놓기: +y 로 쌓던 테이퍼가 rotX 한 번에 +z 로 쌓인다(반지 밴드가 이 변환을 쓴다).
    const up = V.rotX(V.taper(4, 4, 6, 0), 1);
    eq('rotX 뒤 적층 축이 z 로 간다', Math.max(...up.map(v => v.z)), 5);
    eq('rotX 뒤 y 폭은 단면 폭이 된다', Math.max(...up.map(v => v.y)), 4);
    eq('회전해도 칸 수는 같다', up.length, V.taper(4, 4, 6, 0).length);
    eq('회전해도 면 수는 같다', V.faces(up, {}).length, V.faces(V.taper(4, 4, 6, 0), {}).length);
    eq('회전해도 색은 따라간다', V.rotZ(V.box(2, 2, 2, 42), 1)[0].c, 42);
}

// ── ⑩ 음성 대조 — 잘못된 인자에 빈 목록을 준다(예외로 죽지 않는다) ──────────
{
    eq('반지름 0 원판', V.ellipse(0, 0, 1).length, 0);
    eq('높이 0 원판', V.disc(4, 0).length, 0);
    eq('높이 0 테이퍼', V.taper(4, 1, 0).length, 0);
    eq('판 0장 라멜라', V.lamella(0, { rx: 4 }).length, 0);
    eq('링 1개짜리 shell 은 층이 없다', V.shell([{ y: 0, rx: 4 }], 0).length, 0);
}

// ── ⑪ shell — 비례를 그대로 옮기는 자리라 보간이 정확해야 한다 ──────────────
{
    const s = V.shell([{ y: 0, rx: 6, rz: 3 }, { y: 6, rx: 2, rz: 1 }], 0);
    eq('shell 밑층 x 반경', rowR(s, 0), 6);
    eq('shell 마지막 층(y=5)은 끝값 직전', rowR(s, 5) <= 3, true);
    ok('shell 은 끝 y 를 포함하지 않는다(다음 구간이 이어받는다)', rowR(s, 6) === -1);
    ok('shell 은 단조 감소', [0, 1, 2, 3, 4, 5].map(y => rowR(s, y)).every((r, i, a) => i === 0 || r <= a[i - 1]));
    // ⓧ 층별 중심 이동 — 신발 갑피가 위로 갈수록 뒤로 물러나는 그 형태. 굵기만으로는 못 낸다.
    const off = V.shell([{ y: 0, rx: 3, z: 0 }, { y: 4, rx: 3, z: -4 }], 0);
    const zc = y => { const v = off.filter(p => p.y === y).map(p => p.z); return (Math.min(...v) + Math.max(...v)) / 2; };
    eq('shell 밑층 z 중심', zc(0), 0);
    eq('shell 윗층 z 중심(보간)', zc(3), -3);
    ok('중심이 움직여도 굵기는 그대로', rowR(off, 0) === rowR(off, 3), `${rowR(off, 0)} vs ${rowR(off, 3)}`);
    const offx = V.shell([{ y: 0, rx: 2, x: 5 }, { y: 2, rx: 2, x: 5 }], 0);
    ok('x 중심 이동도 된다', Math.min(...offx.map(p => p.x)) === 3 && Math.max(...offx.map(p => p.x)) === 7);
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
