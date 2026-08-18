// probe-bakewear.js — 에지 웨어/크레비스 다크닝 베이크의 **부호와 완결성**을 WebGL 없이 검사한다.
//
// 왜 node 단독인가: 이 환경은 소프트웨어 GL 이라 브라우저 프로브가 한 개당 10~60분 걸린다.
// bakeWear 는 순수 지오메트리 계산이라 렌더링 없이도 전부 확인할 수 있다 — 렌더가 필요한 건
// 클리핑(probe-equip-clip)·중복(probe-equip-dedupe)뿐이므로 그 둘만 브라우저로 돌린다.
//
// 검사 항목
//  ① 볼록 모서리가 평면보다 밝다 (에지 웨어가 실제로 얹혔나 — 부호가 뒤집히면 여기서 잡힌다)
//  ② 오목 골이 평면보다 어둡다 (크레비스 다크닝)
//  ③ 아래를 보는 면이 위를 보는 면보다 어둡다 (하늘 가림)
//  ④ 접촉 AO — 다른 메시가 바짝 붙은 자리가 어둡다
//  ⑤ **완결성**: vertexColors 를 켠 재질을 쓰는 그룹 안 모든 메시에 color 속성이 있다
//     (하나라도 빠지면 그 메시가 통째로 검게 렌더된다 — 이 파이프라인의 유일한 치명 실패 모드)
//  ⑥ 실제 장비 빌더 3종(투구·갑옷·장신구) × 시대 5계열에서 위 ⑤가 유지되고, 시대마다
//     굽힌 값의 분포가 서로 다르다(= '색 스와프뿐'이 아니게 됐다)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..');
const sandbox = { console, window: {}, document: undefined, navigator: { userAgent: 'node' } };
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(rel) {
    const code = fs.readFileSync(path.join(WEB, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
}

load('lib/three.min.js');
const THREE = sandbox.THREE;
if (!THREE) { console.error('three.js 로드 실패'); process.exit(1); }

// ── ProChar 의 캔버스 텍스처는 node 에 캔버스가 없으므로 스텁으로 바꾼다.
// bakeWear 는 map 을 읽지 않으므로(색만 본다) 결과에 영향이 없다.
const texStub = () => ({ isTexture: true, wrapS: 0, wrapT: 0, repeat: { set() {} } });
sandbox.ProChar = { rockTex: texStub, leatherTex: texStub, metalTex: texStub, furTex: texStub, skinTex: texStub };

load('js/gamedata.js');
load('js/scene3d.js');
// ⚠️ 이 파일들의 최상위 선언은 `const` 라 vm 컨텍스트의 **렉시컬 스코프**에 들어간다 —
//    globalThis 의 속성이 아니므로 sandbox.Scene3D 로는 안 잡힌다. 같은 컨텍스트에서 한 줄 실행해 건넨다.
vm.runInContext('globalThis.__S3 = Scene3D;', sandbox);
const S3 = sandbox.__S3;
if (!S3 || typeof S3.bakeWear !== 'function') { console.error('Scene3D.bakeWear 없음'); process.exit(1); }

let fail = 0;
const ok = (cond, msg, extra) => {
    if (!cond) fail++;
    console.log(`${cond ? '  OK  ' : ' FAIL '} ${msg}${extra !== undefined ? '  — ' + extra : ''}`);
};

const lum = (col, i) => 0.299 * col.getX(i) + 0.587 * col.getY(i) + 0.114 * col.getZ(i);

// 정점 위치로 색을 찾는다(용접된 자리는 전부 같은 값이므로 아무거나 하나면 된다)
function lumAt(mesh, pred) {
    const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color;
    let s = 0, n = 0;
    for (let i = 0; i < pos.count; i++) {
        if (pred(pos.getX(i), pos.getY(i), pos.getZ(i))) { s += lum(col, i); n++; }
    }
    return n ? s / n : NaN;
}

const metalMats = () => S3.ageGearMatsBase('medieval');

console.log('── ①②③ 부호 검사: L 자로 꺾인 판 (볼록 모서리 · 오목 골 · 윗면/아랫면) ──');
{
    // 오목/볼록이 둘 다 있는 최소 형상을 손으로 만든다.
    // 단면(xy)이 ⌐ 모양인 압출체: (0,0)-(2,0)-(2,1)-(1,1)-(1,2)-(0,2)
    //  → (1,1) 이 **오목** 모서리, 나머지 바깥 모서리가 **볼록**.
    // ⚠️ 변 한가운데에도 점을 찍어 둔다 — ExtrudeGeometry 는 shape 의 점에서만 정점을 만들기 때문에
    //    꼭짓점만 주면 '평면 기준 정점'이 아예 존재하지 않아 비교 대상이 사라진다.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1, 0); shape.lineTo(2, 0);
    shape.lineTo(2, 0.5); shape.lineTo(2, 1);
    shape.lineTo(1.5, 1); shape.lineTo(1, 1);
    shape.lineTo(1, 1.5); shape.lineTo(1, 2);
    shape.lineTo(0.5, 2); shape.lineTo(0, 2);
    shape.lineTo(0, 1); shape.lineTo(0, 0);
    // ⚠️ steps 를 안 주면 압출 벽에 **중간 정점이 없어** 모든 벽 정점이 앞뒤 뚜껑 경계에 걸린다.
    //    그러면 벽-뚜껑 볼록 모서리가 벽-벽 오목 모서리와 같은 정점에 섞여 검사가 뜻을 잃는다.
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 4 });
    const mats = metalMats();
    const mesh = new THREE.Mesh(geo, mats.body);
    const g = new THREE.Group();
    g.add(mesh);
    S3.bakeWear(g, mats);

    const near = (v, t) => Math.abs(v - t) < 0.02;
    const mid = z => z > 0.1 && z < 0.9;                               // 뚜껑 경계에서 떨어진 중간 깊이만
    const convex = lumAt(mesh, (x, y, z) => near(x, 2) && near(y, 0) && mid(z));   // 바깥 직각 모서리
    const concave = lumAt(mesh, (x, y, z) => near(x, 1) && near(y, 1) && mid(z));  // 안쪽 꺾임(골)
    const flat = lumAt(mesh, (x, y, z) => near(x, 0) && near(y, 1) && mid(z)); // 평평한 왼쪽 벽 한가운데
    console.log(`      볼록 ${convex.toFixed(4)} · 오목 ${concave.toFixed(4)} · 평면 ${flat.toFixed(4)}`);
    ok(isFinite(convex) && isFinite(concave) && isFinite(flat), '표본 정점 3종을 찾았다');
    ok(convex > flat, '① 볼록 모서리가 평면보다 밝다(에지 웨어)', `${convex.toFixed(4)} > ${flat.toFixed(4)}`);
    ok(concave < flat, '② 오목 골이 평면보다 어둡다(크레비스 다크닝)', `${concave.toFixed(4)} < ${flat.toFixed(4)}`);
}

console.log('── ③ 역할 분담: 하늘 가림은 bakeWear 가 **하지 않는다**(ageShade 소관) ──');
{
    // 🔗 ageShade(onBeforeCompile)가 월드 법선 y 로 아랫면을 이미 어둡게 한다.
    //    bakeWear 가 같은 일을 또 하면 아랫면이 두 번 죽는다 — 그래서 여기선 위/아래가 **같아야** 한다.
    //    (예전 판에는 가중치 0.28 짜리 하늘 가림 항이 있었다. 두 파이프라인을 합치며 걷어냈다.)
    const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const mats = metalMats();
    const mesh = new THREE.Mesh(geo, mats.body);
    const g = new THREE.Group(); g.add(mesh);
    S3.bakeWear(g, mats);
    const near = v => Math.abs(v) < 1e-6;
    const top = lumAt(mesh, (x, y, z) => Math.abs(y - 0.5) < 1e-6 && near(x) && near(z));
    const bot = lumAt(mesh, (x, y, z) => Math.abs(y + 0.5) < 1e-6 && near(x) && near(z));
    console.log(`      윗면 중앙 ${top.toFixed(4)} · 밑면 중앙 ${bot.toFixed(4)}`);
    ok(Math.abs(top - bot) < 1e-4, '③ 홀로 놓인 상자의 윗면과 밑면이 같다(하늘 가림 항 없음)', `Δ${Math.abs(top - bot).toFixed(6)}`);
    ok(Math.abs(top - 1) < 1e-4, '③\' 가려지지도 꺾이지도 않은 면은 원래 색 그대로다', top.toFixed(4));
}

console.log('── ④ 접촉 AO: 다른 메시가 바짝 붙은 자리 ──');
{
    const mats = metalMats();
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2, 8, 1, 8), mats.body);
    g.add(plate);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 0.3), mats.dark);
    post.position.set(0.7, 0.6, 0);           // 판 위에 기둥이 서 있다 → 그 밑동 주변이 어두워야
    g.add(post);
    S3.bakeWear(g, mats);
    const under = lumAt(plate, (x, y) => Math.abs(y - 0.1) < 1e-6 && Math.abs(x - 0.75) < 0.02);
    const far = lumAt(plate, (x, y) => Math.abs(y - 0.1) < 1e-6 && Math.abs(x + 0.75) < 0.02);
    console.log(`      기둥 밑동 ${under.toFixed(4)} · 반대편 ${far.toFixed(4)}`);
    ok(under < far, '④ 붙어 있는 쪽이 먼 쪽보다 어둡다', `${under.toFixed(4)} < ${far.toFixed(4)}`);
}

console.log('── ⑤⑥ 완결성 + 시대 분화: 실제 빌더 3종 × 5계열 ──');
{
    const AGES_BY_KIND = { primal: 'primitive', forged: 'medieval', brass: 'earlyModern', polymer: 'modern', alloy: 'space' };
    // (빌더 이름, 만들기)
    const builders = [
        ['투구', (age, name) => S3.makeHelmet(age, 'rare', 'visor', name)],
        ['갑옷', (age, name) => S3.makeArmorPreview(age, 'rare', 'plate', name)],
        ['장신구', (age, name) => S3.makeAccessoryPreview('gloves', 0, age, 'rare', name)],
    ];
    const sig = {};
    for (const [label, build] of builders) {
        for (const kind of Object.keys(AGES_BY_KIND)) {
            const age = AGES_BY_KIND[kind];
            let g;
            try { g = build(age, ''); } catch (e) { ok(false, `${label}/${kind} 빌드`, e.message); continue; }
            // ⑤ 완결성 — vertexColors 를 켠 재질을 쓰면서 color 속성이 없는 메시가 있으면 검게 나온다
            let bad = 0, meshes = 0, vals = [];
            g.traverse(n => {
                if (!n.isMesh || !n.geometry) return;
                meshes++;
                const mArr = Array.isArray(n.material) ? n.material : [n.material];
                const vc = mArr.some(m => m && m.vertexColors);
                const has = !!n.geometry.attributes.color;
                if (vc && !has) bad++;
                if (has) {
                    const c = n.geometry.attributes.color;
                    for (let i = 0; i < c.count; i += Math.max(1, c.count >> 6)) vals.push(lum(c, i));
                }
            });
            // ⑦ 지오메트리를 두 메시가 나눠 쓰면 뒤에 구운 값이 앞의 것을 덮어써
            //    한쪽은 자기 자리와 안 맞는 접촉 AO 를 뒤집어쓴다. 이 파이프라인엔 없어야 한다.
            const seen = new Map();
            let shared = 0;
            g.traverse(n => {
                if (!n.isMesh || !n.geometry) return;
                const c = (seen.get(n.geometry) || 0) + 1;
                seen.set(n.geometry, c);
                if (c === 2) shared++;
            });
            ok(shared === 0, `⑦ ${label}/${kind} — 두 메시가 나눠 쓰는 지오메트리 0`, `shared=${shared}`);
            ok(bad === 0, `⑤ ${label}/${kind} — 색 속성 빠진 메시 0 (메시 ${meshes})`, `bad=${bad}`);
            ok(vals.length > 0, `   ${label}/${kind} — 굽힌 정점 표본 존재`, vals.length);
            if (vals.length) {
                const mn = Math.min(...vals), mx = Math.max(...vals);
                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                sig[`${label}/${kind}`] = { mn, mx, avg };
                console.log(`      ${label}/${kind}  min ${mn.toFixed(3)} · max ${mx.toFixed(3)} · avg ${avg.toFixed(3)} · 진폭 ${(mx - mn).toFixed(3)}`);
                ok(mx - mn > 0.05, `   ${label}/${kind} — 굽힌 값이 평탄하지 않다(진폭>0.05)`, (mx - mn).toFixed(3));
            }
        }
    }
    // ⑥ 시대 계열끼리 분포가 갈리는가 — '색 스와프뿐'이면 진폭이 전부 같은 값으로 나온다
    for (const label of ['투구', '갑옷', '장신구']) {
        const amps = Object.keys(AGES_BY_KIND).map(k => (sig[`${label}/${k}`] || {}).mx - (sig[`${label}/${k}`] || {}).mn);
        const uniq = new Set(amps.map(a => a.toFixed(3)));
        ok(uniq.size >= 3, `⑥ ${label} — 5계열 중 최소 3가지 진폭(표면 이력이 계열마다 다르다)`, [...uniq].join(' '));
    }
}

console.log(fail === 0 ? '\n전부 통과' : `\n실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
