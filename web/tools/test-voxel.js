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

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
