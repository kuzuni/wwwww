// voxel 사지(`ProChar.voxLimb`)의 **치수 보존** 판정기 — node 로 바로 돈다(THREE 불필요).
//
// 왜 필요한가: `capsule` → `voxLimb` 는 조형만 바꾸고 **길이·반지름·끝 캡 위치는 그대로 두는**
// 교체다. 그 규약이 깨지면 팔꿈치/무릎 피벗, 부츠 앵커, 두신비·다리비 게이트가 한꺼번에
// 틀어지는데, 브라우저 캡처로는 "좀 짧아 보인다" 정도로만 보여서 못 잡는다. 그래서 칸 계산을
// 코드와 **같은 식**으로 재현해 수치로 잰다.
//   ⚠️ 이 저장소의 함정 ④: 인자를 손으로 베끼면 코드가 바뀌어도 옛 값으로 재게 된다.
//      그래서 아래 LIMBS 는 `prochar.js` 에서 **정규식으로 뽑아 온다**(하드코딩 금지).
const fs = require('fs');
const path = require('path');
const Voxel = require(path.join(__dirname, '..', 'js', 'voxel.js'));

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'prochar.js'), 'utf8');

// 리터럴이 아닌 길이(THIGH_L/SHIN_L)는 선언에서 같이 뽑는다.
function constOf(name) {
    const m = src.match(new RegExp(name + '\\s*=\\s*([0-9.]+)'));
    if (!m) throw new Error(name + ' 를 prochar.js 에서 못 찾았다');
    return parseFloat(m[1]);
}
const NUM = { THIGH_L: constOf('THIGH_L'), SHIN_L: constOf('SHIN_L') };

const LIMBS = [];
const re = /const (\w+) = this\.voxLimb\(([^)]*)\)/g;
let m;
while ((m = re.exec(src))) {
    const args = m[2].split(',').map(s => s.trim());
    const num = a => (a in NUM ? NUM[a] : parseFloat(a));
    LIMBS.push({ name: m[1], rTop: num(args[0]), rBot: num(args[1]), len: num(args[2]) });
}

// `voxLimb` 과 같은 식으로 칸을 만든다.
function build(rTop, rBot, len, vs) {
    const h = Math.max(2, Math.round(len / (vs || 0.016)));
    const size = len / h;
    const rT = rTop / size, rB = rBot / size;
    let vox = Voxel.taper(rB, rT, h);
    const capH = Math.max(1, Math.round(rB));
    vox = Voxel.merge(vox, Voxel.at(Voxel.rotX(Voxel.dome(rB, capH), 2), 0, -1, 0));
    return { vox, h, size, rT, rB, offset: -(h - 0.5) * size };
}

// 로컬 y(피벗 0, 아래가 음수)에서 voxel 기둥의 바깥 면까지 거리. 층이 없으면 null.
function halfWidthAt(b, yLocal) {
    const yi = Math.round((yLocal - b.offset) / b.size);
    let mx = -1;
    for (const v of b.vox) if (v.y === yi) { const a = Math.abs(v.x), c = Math.abs(v.z); if (a > mx) mx = a; if (c > mx) mx = c; }
    return mx < 0 ? null : (mx + 0.5) * b.size;
}

let fail = 0;
const chk = (ok, label, got) => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label} — ${got}`); };

if (!LIMBS.length) { console.log('FAIL 사지 호출부를 하나도 못 찾았다 (voxLimb 로 안 바뀌었나)'); process.exit(1); }

for (const L of LIMBS) {
    const b = build(L.rTop, L.rBot, L.len);
    const bd = Voxel.bounds(b.vox);
    // 월드 y = (칸 y ± 0.5) × size + offset
    const topY = (bd.y1 + 0.5) * b.size + b.offset;
    const botY = (bd.y0 - 0.5) * b.size + b.offset;
    // 맨 위 층의 반경(칸) → 월드 반지름
    const topLayer = b.vox.filter(v => v.y === bd.y1);
    const rTopGot = (Math.max(...topLayer.map(v => Math.abs(v.x))) + 0.5) * b.size;
    console.log(`[${L.name}] r ${L.rTop}→${L.rBot} len ${L.len} · 층 ${b.h} · 칸 ${b.size.toFixed(5)} · 복셀 ${b.vox.length}`);
    // ① 기둥 맨 윗면 = 피벗(로컬 0). 여기가 틀리면 어깨/고관절에서 팔다리가 떠 보인다.
    chk(Math.abs(topY) < 1e-9, '① 기둥 상단 = 로컬 0', `topY=${topY.toExponential(2)}`);
    // ② 캡 밑동 = −(len + rBot) ± 반 칸. 부츠·개스킷 좌표가 이 값에 맞춰져 있다.
    chk(Math.abs(botY + (L.len + L.rBot)) <= b.size * 0.75,
        '② 캡 밑동 = −(len+rBot)', `botY=${botY.toFixed(4)} vs ${(-(L.len + L.rBot)).toFixed(4)}`);
    // ③ 바깥 면이 캡슐 반지름을 **반 칸 넘게** 벗어나면 안 된다. 칸 폭이 홀수라 반 칸까지는
    //    구조적으로 어쩔 수 없다(그 반 칸에 걸리는 소매는 ⑥ 이 따로 잰다) — 하지만 한 칸을
    //    넘으면 그건 반올림이 아니라 계산이 틀린 것이다.
    let worst = 0, worstY = -1;
    for (let y = 0; y < b.h; y++) {
        const k = b.h === 1 ? 0 : y / (b.h - 1);
        const rTarget = L.rBot + (L.rTop - L.rBot) * k;
        let mx = 0;
        for (const v of b.vox) if (v.y === y) { const a = Math.abs(v.x), c = Math.abs(v.z); if (a > mx) mx = a; if (c > mx) mx = c; }
        const over = (mx + 0.5) * b.size - rTarget;
        if (over > worst) { worst = over; worstY = y; }
    }
    chk(worst <= b.size * 0.5 + 1e-9, '③ 캡슐 초과 ≤ 반 칸',
        `최대 초과 ${worst.toFixed(4)} (층 ${worstY}, 반 칸 ${(b.size * 0.5).toFixed(4)}) · 상단 반경 ${rTopGot.toFixed(4)}/${L.rTop}`);
    // ④ 화풍: 지름이 최소 5칸은 돼야 '큐브로 정교하게'가 성립한다(대형 블록 금지의 반대편 하한).
    const dia = 2 * b.rB;
    chk(dia >= 5, '④ 최소 지름 ≥ 5칸(복셀 밀도)', `${dia.toFixed(1)}칸`);
    // ⑤ 축정렬 면만 나와야 한다(voxel 판독의 기계적 정의).
    const fl = Voxel.faces(b.vox, { color: 0xffffff });
    const axis = fl.every(f => f.n.filter(c => c !== 0).length === 1);
    chk(axis, '⑤ 전 면 축정렬', `${fl.length}면`);
}

// ⑥ 🚨 **소매 관통 게이트 — 이 항목의 진짜 회귀는 여기서 난다.**
//    voxel 기둥의 바깥 면은 칸 반올림 때문에 캡슐 반지름을 최대 반 칸 넘어선다(③). 그런데
//    이 리그의 누빔 소매는 "사슬보다 0.002~0.008 굵다"는 식으로 아슬아슬하게 잡혀 있어서
//    그 반 칸이 그대로 관통이 된다. 게다가 원통은 **각 사이 평평한 면**이 반지름×cos(π/seg)
//    까지 안으로 들어오므로, 반지름끼리 비교하면 통과인데 화면에서는 뚫린다.
//    → 소매 반지름·y·높이·세그먼트를 `prochar.js` 에서 뽑아 그 구간 전체를 훑는다.
const SLEEVES = [
    { name: 'thighPad(대퇴 누빔)', limb: 'thigh', decl: 'thighPad' },
    { name: 'armPad(상완 누빔)', limb: 'upperArm', decl: 'armPad' },
];
console.log('\n[소매 관통]');
for (const S of SLEEVES) {
    const L = LIMBS.find(l => l.name === S.limb);
    if (!L) { chk(false, `⑥ ${S.name}`, `사지 ${S.limb} 를 못 찾았다`); continue; }
    const g = src.match(new RegExp('const ' + S.decl + ' = new THREE\\.Mesh\\(new THREE\\.CylinderGeometry\\(([^)]*)\\)'));
    const py = src.match(new RegExp(S.decl + '\\.position\\.y = ([-0-9.]+)(\\s*\\*\\s*TS)?'));
    if (!g || !py) { chk(false, `⑥ ${S.name}`, '선언을 못 찾았다'); continue; }
    const a = g[1].split(',').map(s => parseFloat(s.trim()));
    let yC = parseFloat(py[1]);
    if (py[2]) yC *= NUM.THIGH_L / 0.32;                       // `* TS` — TS = THIGH_L / THIGH_L0
    const rUp = a[0], rDn = a[1], hh = a[2], seg = a[3] || 12;
    const flat = Math.cos(Math.PI / seg);                       // 각 사이 평면이 안으로 들어오는 비율
    const b = build(L.rTop, L.rBot, L.len);
    let minClear = Infinity, atY = 0;
    for (let i = 0; i <= 20; i++) {
        const y = yC + hh / 2 - hh * (i / 20);                  // 소매 윗단 → 밑단
        const rS = (rUp + (rDn - rUp) * (i / 20)) * flat;       // 그 높이의 **평면** 반지름
        const hw = halfWidthAt(b, y);
        if (hw === null) continue;
        if (rS - hw < minClear) { minClear = rS - hw; atY = y; }
    }
    chk(minClear > 0, `⑥ ${S.name} 이 ${S.limb} 을 덮는다`,
        `최소 여유 ${minClear.toFixed(4)} (y ${atY.toFixed(4)}, 평면계수 ${flat.toFixed(3)})`);
}
console.log(fail ? `\n미통과 ${fail}건` : '\n전건 통과');
process.exit(fail ? 1 : 0);
