// Voxel 공용 빌더의 **순수 계산부** 시험 — 브라우저 없이 node 로 돈다.
//   면 제거(안 보이는 면을 안 만드는가)와 이음새 AO(오목한 구석이 실제로 어두운가)는
//   렌더를 안 거쳐도 참/거짓이 정해지는 값이라, 여기서 잠근다.
//   ⚠️ 이 시험은 `Voxel.build`(THREE 필요)는 안 건드린다 — 그건 화면 쪽 자의 몫이다.
// 사용: node test-voxel.js      (전부 통과 exit 0 / 하나라도 실패 exit 1)
const Voxel = require('../js/voxel.js');

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

// ── ① 면 제거 ────────────────────────────────────────────────────────────────
// 복셀 하나는 사방이 트여 6면.
eq('단일 복셀은 6면', Voxel.faces([{ x: 0, y: 0, z: 0 }], {}).length, 6);

// 두 복셀이 붙으면 맞닿은 두 면이 사라져 10면.
eq('붙은 복셀 2개는 10면', Voxel.faces([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], {}).length, 10);

// 2×2×2 덩어리: 겉면만 24면(각 축마다 4면 × 6방향). 안쪽 면 24개가 제거된 것이다.
eq('2×2×2 는 24면', Voxel.faces(Voxel.box(2, 2, 2), {}).length, 24);

// 3×3×3 = 겉면 9×6 = 54면. 가운데 복셀은 6면 전부 가려져 **한 면도 안 만든다**.
eq('3×3×3 은 54면', Voxel.faces(Voxel.box(3, 3, 3), {}).length, 54);
const mid = Voxel.faces(Voxel.box(3, 3, 3), {}).filter(f => f.vx === 1 && f.vy === 1 && f.vz === 1);
eq('3×3×3 정중앙 복셀은 0면', mid.length, 0);

// 큰 덩어리일수록 절약폭이 커진다 — 안 하면 8×8×8 이 3072면, 하면 384면.
eq('8×8×8 은 384면(제거 없으면 3072)', Voxel.faces(Voxel.box(8, 8, 8), {}).length, 384);

// ── ② 이음새 AO ──────────────────────────────────────────────────────────────
// 외톨이 복셀은 어느 코너도 막히지 않아 전부 3(가장 밝음).
{
    const f = Voxel.faces([{ x: 0, y: 0, z: 0 }], {});
    ok('외톨이 복셀은 AO 가 전부 3', f.every(x => x.ao.every(a => a === 3)),
        `실측 최소 ${Math.min(...f.flatMap(x => x.ao))}`);
}

// 🚨 **이 시험의 첫 판은 기대값이 틀렸다(코드가 아니라 시험이 틀린 쪽이었다).**
//   평면 L 자(같은 층에 3개)를 놓고 "AO 0 이 나와야 한다"고 걸었는데 실측은 2 였다. 다시 보니
//   **AO 를 가리는 것은 그 면과 같은 층의 이웃이 아니라, 면 앞쪽(법선 방향) 층에 있는 복셀**이다.
//   +z 면을 가리려면 z+1 층에 뭔가 있어야지, 같은 z 층의 옆 복셀은 그 면을 가리지 못한다.
//   평면 L 은 어느 노출면에 대해서도 '옆 둘이 다 막힌 코너'를 만들 수 없으므로 2 가 정답이다.
//   그래서 시험을 두 갈래로 쪼갠다 — ⑴ 한쪽만 막히는 배치는 3 미만 · ⑵ 진짜 0 은 아래 배치.

// ⑴ 평면 L: 어둠이 생기긴 하되 완전히 막힌 구석은 아니다.
{
    const L = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }];
    const lo = Math.min(...Voxel.faces(L, {}).flatMap(x => x.ao));
    ok('평면 L 은 AO 가 3 미만으로 내려가되 0 은 아니다', lo === 2, `최소 AO ${lo}`);
}

// ⑵ 완전히 막힌 구석: (0,0,0)의 +z 면 한 코너를 가리려면 **z+1 층**에 옆 둘이 있어야 한다.
{
    const cup = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }];
    const top = Voxel.faces(cup, {}).filter(x => x.vx === 0 && x.vy === 0 && x.vz === 0 && x.n[2] === 1);
    const lo = Math.min(...top.flatMap(x => x.ao));
    ok('앞층에서 두 옆이 막히면 그 코너는 AO 0', lo === 0, `+z 면 최소 AO ${lo}`);
}

// 🚨 **음성 대조 — 자가 아무 데나 어둠을 뿌리는 게 아님을 확인한다.**
//   한 줄로 곧게 뻗은 막대는 오목한 구석이 없다. 여기서 AO 0 이 나오면 판정이 헛돈 것이다.
{
    const bar = Voxel.box(4, 1, 1);
    const f = Voxel.faces(bar, {});
    const lo = Math.min(...f.flatMap(x => x.ao));
    ok('곧은 막대에는 AO 0 이 없다(음성 대조)', lo > 0, `최소 AO ${lo}`);
}

// 평평한 판의 윗면은 이웃이 옆으로만 있어 막히지 않는다 — 윗면 AO 는 전부 3이어야 한다.
{
    const slab = Voxel.box(3, 1, 3);
    const top = Voxel.faces(slab, {}).filter(x => x.n[1] === 1);
    ok('평평한 판의 윗면 AO 는 전부 3', top.every(x => x.ao.every(a => a === 3)),
        `실측 최소 ${Math.min(...top.flatMap(x => x.ao))}`);
}

// AO 단계 → 밝기 계수는 단조 증가하고, 가장 어두운 값이 0.4 아래로 내려가지 않아야 한다
// (작은 복셀이 많은 조형이 통째로 회색으로 가라앉는 것을 막는 선 — voxel.js 주석 참조).
{
    const s = [0, 1, 2, 3].map(l => Voxel.aoShade(l, 1));
    ok('AO 밝기 계수는 단조 증가', s[0] < s[1] && s[1] < s[2] && s[2] < s[3], s.map(v => v.toFixed(3)).join(' < '));
    ok('가장 어두운 AO 도 0.4 이상', s[0] >= 0.4, `최암 ${s[0].toFixed(3)}`);
    eq('AO 3 은 원색 그대로(계수 1)', Voxel.aoShade(3, 1), 1);
}

// ── ③ 색 변화가 결정적인가 ───────────────────────────────────────────────────
// 같은 좌표는 항상 같은 값이어야 한다 — 랜덤이면 리빌드마다 무늬가 바뀌어 회귀 캡처가 흔들린다.
{
    const a = Voxel.jitter(3, 7, 11, 0.06), b = Voxel.jitter(3, 7, 11, 0.06);
    ok('색 변화는 좌표 해시라 재현된다', a === b, `${a} vs ${b}`);
    const c = Voxel.jitter(4, 7, 11, 0.06);
    ok('이웃 좌표는 다른 값을 받는다', a !== c, `${a} vs ${c}`);
    const many = [];
    for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) many.push(Voxel.jitter(x, y, 0, 0.06));
    const mn = Math.min(...many), mx = Math.max(...many);
    ok('색 변화 폭이 요청치(±6%) 안에 있다', mn >= 0.94 - 1e-9 && mx <= 1.06 + 1e-9, `${mn.toFixed(4)} ~ ${mx.toFixed(4)}`);
}

// ── ④ 면의 감김 방향 ─────────────────────────────────────────────────────────
// 각 면의 네 코너는 법선축 성분이 전부 같아야 한다(면이 평평하다는 뜻). 어긋나면 뒤틀린 면이다.
{
    const f = Voxel.faces(Voxel.box(2, 2, 2), {});
    const flat = f.every(x => {
        const ax = x.n.findIndex(v => v !== 0);
        return x.corners.every(c => Math.abs(c[ax] - x.corners[0][ax]) < 1e-9);
    });
    ok('모든 면이 법선축에 대해 평평하다', flat);
}

// ── ⑤ 회전체 프리미티브 (ellipsoid · revolve · hollow) ──────────────────────
// 적·펫·탈것의 파츠는 거의 전부 회전체라, 이 셋이 큐브 전환의 실제 작업 표면이다.
{
    // 타원체는 **중심 판정**이라 반지름 r 이면 지름이 2r+1 칸이다(모서리 판정이면 부풀어 오른다).
    const e2 = Voxel.ellipsoid(2, 2, 2);
    const xs = e2.map(v => v.x);
    eq('ellipsoid(2,2,2) 의 x 폭은 5칸', Math.max(...xs) - Math.min(...xs) + 1, 5);
    ok('ellipsoid 는 구 방정식 밖을 안 담는다',
        e2.every(v => (v.x * v.x + v.y * v.y + v.z * v.z) / 4 <= 1.0001));
    // 축마다 다른 반지름이 실제로 다른 폭을 낸다(한 축만 보고 만들면 조용히 구가 된다).
    {
        const e = Voxel.ellipsoid(4, 1, 2);
        const w = a => Math.max(...e.map(v => v[a])) - Math.min(...e.map(v => v[a])) + 1;
        ok('ellipsoid 축별 반지름이 독립이다', w('x') === 9 && w('y') === 3 && w('z') === 5,
            `${w('x')}×${w('y')}×${w('z')}`);
    }

    // 회전체 — 원기둥 프로파일이면 층마다 같은 단면이 나와야 한다.
    {
        const cyl = Voxel.revolve([[2, 0], [2, 3]]);
        const layer = y => cyl.filter(v => v.y === y).length;
        ok('revolve 는 프로파일 y 범위를 다 채운다',
            Math.min(...cyl.map(v => v.y)) === 0 && Math.max(...cyl.map(v => v.y)) === 3);
        ok('일정 반지름 프로파일은 층 단면이 같다', layer(0) === layer(3) && layer(0) > 1, `${layer(0)} vs ${layer(3)}`);
        // 원뿔 프로파일이면 위로 갈수록 단면이 줄어야 한다 — 안 그러면 보간이 안 걸린 것이다.
        const cone = Voxel.revolve([[4, 0], [0, 4]]);
        const cl = [0, 1, 2, 3].map(y => cone.filter(v => v.y === y).length);
        ok('테이퍼 프로파일은 층 단면이 단조 감소한다', cl[0] > cl[1] && cl[1] > cl[2] && cl[2] >= cl[3], cl.join(' > '));
    }

    // 겉껍질 — 3×3×3 이면 가운데 한 칸만 빠져 26칸.
    {
        const solid = Voxel.box(3, 3, 3);
        eq('hollow(3×3×3) 은 26칸', Voxel.hollow(solid).length, 26);
        // 5×5×5 껍질은 속이 비어 **안쪽 면**이 새로 생긴다 — 반투명 파츠에 두께를 주는 근거.
        const s5 = Voxel.hollow(Voxel.box(5, 5, 5));
        ok('hollow 는 안쪽 면을 만들어 두께를 준다',
            Voxel.faces(s5, {}).length > Voxel.faces(Voxel.box(5, 5, 5), {}).length,
            `${Voxel.faces(s5, {}).length} > ${Voxel.faces(Voxel.box(5, 5, 5), {}).length}`);
        // 🚨 **`shell` 과 `hollow` 는 이름만 비슷하고 하는 일이 다르다** — 2026-08-19 에 두 세션이
        //    동시에 넣어 이름이 겹쳤던 자리다. `shell` 은 링으로 회전체를 만들며 **반경 방향으로만**
        //    속을 파서 위·아래가 뚫린 관이 되고, `hollow` 는 이미 만든 덩어리의 겉 한 겹만 남겨
        //    정수리·바닥까지 닫는다. 이 차이가 사라지면 젤리 슬라임 속이 위에서 뚫려 보인다.
        const tube = Voxel.shell([{ y: 0, rx: 3 }, { y: 4, rx: 3 }], undefined, { t: 1 });
        const top = Math.max(...tube.map(v => v.y));
        ok('shell 은 위가 뚫린 관이다(가운데 칸이 없다)',
            !tube.some(v => v.y === top && v.x === 0 && v.z === 0));
        const cap = Voxel.hollow(Voxel.revolve([[3, 0], [3, 4]]));
        const capTop = Math.max(...cap.map(v => v.y));
        ok('hollow 는 정수리를 닫는다(가운데 칸이 있다)',
            cap.some(v => v.y === capTop && v.x === 0 && v.z === 0));
    }

    // 바위 — 겉만 깎고 속은 안 건드린다(속을 깎으면 겉이 뚫려 구멍이 난다).
    {
        const r0 = Voxel.rock(4, 3), r1 = Voxel.rock(4, 3), r2 = Voxel.rock(4, 11);
        ok('rock 은 같은 seed 에 같은 바위를 낸다', JSON.stringify(r0) === JSON.stringify(r1));
        ok('rock 은 seed 가 다르면 다른 바위를 낸다', JSON.stringify(r0) !== JSON.stringify(r2));
        eq('bite 0 이면 타원체 그대로', Voxel.rock(4, 3, { bite: 0 }).length, Voxel.ellipsoid(4, 4, 4).length);
        ok('bite 가 걸리면 칸이 준다', r0.length < Voxel.ellipsoid(4, 4, 4).length,
            `${r0.length} < ${Voxel.ellipsoid(4, 4, 4).length}`);
        // 🚨 속 칸은 한 개도 안 깎여야 한다 — 깎이면 겉에서 들여다보이는 구멍이 된다.
        const full = Voxel.ellipsoid(4, 4, 4);
        const inner = full.filter(v => Voxel.faces([v], {}) &&
            [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
                .every(n => full.some(w => w.x === v.x + n[0] && w.y === v.y + n[1] && w.z === v.z + n[2])));
        const have = new Set(r0.map(v => v.x + ',' + v.y + ',' + v.z));
        ok('rock 은 속 칸을 안 깎는다', inner.every(v => have.has(v.x + ',' + v.y + ',' + v.z)),
            `속 ${inner.length}칸`);
        // 접지면은 평평해야 땅에 얹힌다 — flatBottom 아래는 통째로 잘린다.
        ok('flatBottom 아래는 잘린다', Math.min(...Voxel.rock(4, 7, { flatBottom: -1 }).map(v => v.y)) === -1);
    }

    // 조립 — `at` 은 원본을 안 건드리고, `merge` 는 **단순 이어붙이기**다(중복 제거 아님).
    {
        const src = [{ x: 0, y: 0, z: 0, c: 0x111111 }];
        const mv = Voxel.at(src, 1, 2, 3);
        ok('at 은 원본을 안 건드린다', src[0].x === 0 && mv[0].x === 1 && mv[0].y === 2 && mv[0].z === 3);
        // ⚠️ 겹친 칸은 그대로 두 번 담긴다 — `faces` 는 점유 집합으로 가려진 면을 지우므로
        //    형태는 멀쩡하지만 **같은 자리에 면이 두 장** 나와 z-파이팅이 난다.
        //    덩어리를 겹쳐 쌓을 계획이면 겹치지 않게 깎을 것.
        eq('merge 는 단순 이어붙이기다(중복을 안 지운다)',
            Voxel.merge(Voxel.box(2, 2, 2), Voxel.box(2, 2, 2)).length, 16);
    }
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
