// 곡면 생성자 **래칫 게이트** — "다 큐브여야 한다"(사용자 2026-08-20)의 강제 장치.
//
// 왜: 큐브화가 "거의 안 됐다"(곡면 프리미티브 ~400개 잔존)는 실측이 나왔는데, 지금까지는
//   이 수를 아무도 추적하지 않아 "큐브화 했다"는 커밋과 실제 잔존 수가 어긋나도 몰랐다.
//   이 자는 js/ 소스의 곡면 지오메트리 생성자 개수를 세어 기준선(web/data/voxel-ratchet.json)과
//   비교한다 — **늘면 FAIL(exit 1)**, 줄면 기준선을 그 값으로 내려 적는다(단조 감소 = 래칫).
//   0 이 되면 "다 큐브"가 소스 수준에서 증명된다.
//
// 무엇을 세나: new THREE.<타입>Geometry 호출. 타입 = Cylinder·Sphere·Cone·Torus·TorusKnot·
//   Capsule·Lathe·Tube·Icosahedron·Dodecahedron·Octahedron·Tetrahedron·Circle·Ring.
//   (Box·Plane·Shape·Extrude·Buffer 는 각지거나 임의 조형이라 제외 — lensGeo 균열 렌즈가
//   ShapeGeometry 인 것도 그래서 애초에 카운트 밖이다. TODO 2435 '매끈 유지 의도' 참조.)
//   주석은 미리 벗겨 세므로 죽은 코드를 주석 처리해도 수는 정직하게 내려간다.
//
// 화이트리스트: 의도적으로 곡면을 남겨야 하는 줄은 그 줄에 `voxel-ok: <사유>` 주석을 단다.
//   그 줄의 생성자는 본 카운트에서 빠지고 별도 집계로 인쇄된다 — 사유 없는 곡면은 전부 부채다.
//
// ⚠️ 소스 카운트는 근사치다(TODO 2445) — 0 이 됐다고 끝이 아니라, **실게임 캡처로 그 엔티티가
//   실제로 각진 블록으로 보이는지**를 함께 확인할 것(렌더 경로가 딴 데일 수 있다).
//   촘촘함(잔 큐브) 축은 이 자가 못 본다 — probe-voxel-consistency.js 의 VOXCON_MAXCELLS 가 잰다.
//
// 사용: node probe-geo-ratchet.js            (게이트 — regress.sh 등재)
//       node probe-geo-ratchet.js --detail   (파일×타입 전체 표)
const fs = require('fs');
const path = require('path');
const JS_DIR = path.resolve(__dirname, '../js');
const BASE_FILE = path.resolve(__dirname, '../data/voxel-ratchet.json');
const TYPES = ['Cylinder', 'Sphere', 'Cone', 'Torus', 'TorusKnot', 'Capsule', 'Lathe', 'Tube',
               'Icosahedron', 'Dodecahedron', 'Octahedron', 'Tetrahedron', 'Circle', 'Ring'];
const RE = new RegExp('new\\s+THREE\\.(' + TYPES.join('|') + ')Geometry\\b', 'g');
const DETAIL = process.argv.includes('--detail');

// 주석을 공백으로 치환하되 **줄 구조는 보존**한다 — voxel-ok 마커를 원본 줄에서 봐야 하므로.
// 문자열('  "  `) 안의 //, /* 는 주석이 아니다. 템플릿 내부 ${} 는 문자열로 뭉뚱그린다(근사 —
// 보간식 안에 지오메트리 생성자를 만드는 코드는 이 저장소에 없고, 있어도 감사에서 눈에 띈다).
const stripComments = (src) => {
    let out = '', i = 0, n = src.length, st = 0; // 0 코드 · 1 ' · 2 " · 3 ` · 4 // · 5 /* */
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (st === 0) {
            if (c === '/' && d === '/') { st = 4; out += '  '; i += 2; continue; }
            if (c === '/' && d === '*') { st = 5; out += '  '; i += 2; continue; }
            if (c === "'") st = 1; else if (c === '"') st = 2; else if (c === '`') st = 3;
            out += c; i++; continue;
        }
        if (st === 1 || st === 2) {
            if (c === '\\') { out += c + (d || ''); i += 2; continue; }
            if ((st === 1 && c === "'") || (st === 2 && c === '"') || c === '\n') st = 0;
            out += c; i++; continue;
        }
        if (st === 3) {
            if (c === '\\') { out += c + (d || ''); i += 2; continue; }
            if (c === '`') st = 0;
            out += c; i++; continue;
        }
        if (st === 4) { if (c === '\n') { st = 0; out += '\n'; } else out += ' '; i++; continue; }
        /* st === 5 */
        if (c === '*' && d === '/') { st = 0; out += '  '; i += 2; continue; }
        out += c === '\n' ? '\n' : ' '; i++;
    }
    return out;
};

const count = () => {
    const files = {}; let total = 0, whitelisted = 0; const whitelistRows = [];
    for (const f of fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()) {
        const raw = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
        const rawLines = raw.split('\n'), lines = stripComments(raw).split('\n');
        const per = {};
        for (let ln = 0; ln < lines.length; ln++) {
            let m; RE.lastIndex = 0;
            while ((m = RE.exec(lines[ln])) !== null) {
                if (/voxel-ok:/.test(rawLines[ln])) {
                    whitelisted++;
                    whitelistRows.push(`${f}:${ln + 1} ${m[1]} — ${(rawLines[ln].match(/voxel-ok:\s*([^*]*)/) || [])[1] || ''}`.trim());
                } else { per[m[1]] = (per[m[1]] || 0) + 1; total++; }
            }
        }
        if (Object.keys(per).length) files[f] = per;
    }
    return { total, files, whitelisted, whitelistRows };
};

const cur = count();
const flat = (o) => { const r = {}; for (const [f, per] of Object.entries(o.files || {})) for (const [t, n] of Object.entries(per)) r[f + '·' + t] = n; return r; };

console.log(`곡면 지오메트리 생성자(소스, 주석 제외): 총 ${cur.total}개  · 화이트리스트 ${cur.whitelisted}개`);
for (const [f, per] of Object.entries(cur.files)) {
    const sum = Object.values(per).reduce((a, b) => a + b, 0);
    const top = Object.entries(per).sort((a, b) => b[1] - a[1]);
    console.log(`  ${f.padEnd(14)} ${String(sum).padStart(4)}  (${(DETAIL ? top : top.slice(0, 4)).map(([t, n]) => `${t} ${n}`).join(' · ')}${!DETAIL && top.length > 4 ? ' · …' : ''})`);
}
if (cur.whitelistRows.length) console.log('  화이트리스트:\n    ' + cur.whitelistRows.join('\n    '));

if (!fs.existsSync(BASE_FILE)) {
    fs.writeFileSync(BASE_FILE, JSON.stringify({ note: '곡면 생성자 래칫 기준선 — probe-geo-ratchet.js 가 관리. 손으로 올리지 말 것(늘리면 그 프로브가 FAIL 낸다).', total: cur.total, whitelisted: cur.whitelisted, files: cur.files }, null, 1) + '\n');
    console.log(`\n기준선이 없어 새로 만들었다 → data/voxel-ratchet.json (총 ${cur.total}). 커밋에 포함할 것.`);
    process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));

if (cur.total > base.total) {
    console.log(`\n❌ FAIL — 곡면 생성자가 늘었다: 기준선 ${base.total} → 현재 ${cur.total} (+${cur.total - base.total})`);
    const b = flat(base), c = flat(cur);
    for (const k of Object.keys(c)) if (c[k] > (b[k] || 0)) console.log(`   ⬆ ${k}: ${b[k] || 0} → ${c[k]}`);
    console.log('   "다 큐브여야"(사용자 2026-08-20) — 새 조형은 Voxel/Box 적층으로 만들 것.');
    console.log('   의도적 곡면이면 그 줄에 `voxel-ok: <사유>` 주석을 달아 화이트리스트로 뺄 것.');
    process.exit(1);
}
if (cur.total < base.total || JSON.stringify(flat(base)) !== JSON.stringify(flat(cur)) || (base.whitelisted || 0) !== cur.whitelisted) {
    fs.writeFileSync(BASE_FILE, JSON.stringify({ note: base.note, total: cur.total, whitelisted: cur.whitelisted, files: cur.files }, null, 1) + '\n');
    console.log(`\n⬇ 래칫 ${base.total} → ${cur.total} — 기준선 갱신했다(data/voxel-ratchet.json). **같은 커밋에 포함할 것.**`);
    console.log(cur.total === 0 ? '   🎉 소스 잔존 0 — 이제 실게임 캡처 확인만 남았다.' : `   0 까지 ${cur.total}개 남음.`);
    process.exit(0);
}
console.log(`\n✅ PASS — 기준선 ${base.total} 유지(늘지 않음). 0 까지 ${cur.total}개 남음.`);
process.exit(0);
