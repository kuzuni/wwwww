// 버섯 갓 판정기 — 🧊 **voxel 전환(2026-08-19, enemy-quality 3종째)으로 재작성했다.**
//
// 왜 재작성인가: 이 자의 옛 축 셋은 **매끈 조형 시절의 결함**을 겨눈 것이었다.
//   ⑴ '갓 반경 변동계수(CV) ≥2%' = "완전구를 쓰지 마라". 복셀 계단은 애초에 구를 안 만들므로
//      이 게이트는 **구조적으로 항상 통과**한다 = 변별력 0. 지금 물어야 할 것은 그게 아니라
//      **면이 축정렬 6방향뿐인가**(= 화풍이 요구하는 '큐브로 읽힌다'의 기계적 정의)다.
//   ⑵ '반점이 갓 표면에 얹혀 있는가'는 **살아 있다** — 다만 재는 법이 바뀐다(아래 🚨).
//   ⑶ 'capFlap.base 가 변형된 갓을 담았는가' 역시 전제(변형 전/후 구분)가 사라졌다.
//      복셀에서 같은 사고를 내는 실수는 **돔 메시를 갈면서 base 를 안 갈아** 길이가 어긋나는 것이다.
//
// 🚨 **⑵ 를 방향 벡터로 재지 말 것 — 복셀 갓에서는 그 자가 무너진다(이번에 실물로 겪었다).**
//    매끈 갓은 구라 '원점에서 표면까지의 거리'가 방향마다 비슷했다. 계단 돔은 **테두리 0.32 vs
//    정수리 0.22** 로 크게 갈려서, 그 거리를 반지름으로 쓰면 위쪽 방향 반점이 전부 안쪽으로
//    당겨져 **정수리에 한 덩이로 뭉친다**(캡처에서 갓 위에 슬래브 하나가 얹힌 그림이 나왔다).
//    복셀에서 '표면에 얹는다'의 정의는 **그 열(column)의 맨 위 칸 바로 위**다 — 그걸 재라.
//
// 🚨 **옛 ⑵ 는 조용한 구멍도 하나 안고 있었다** — 반점을 `geometry.type === 'SphereGeometry'` 로
//    찾았다. voxel 반점은 BufferGeometry 라 **0개가 잡히고, `every` 가 빈 배열에 참을 줘 게이트가
//    통과**한다. 이제 `userData.capSpot` 표식으로 찾고 **개수(6)까지 센다**.
//
// ⚠️ 자기검증: `CAPSELFTEST=1` 이면 돔 지오메트리를 **매끈한 SphereGeometry 로 갈아** ⑴ 이 반드시
//    FAIL 나는지 본다 — 자에 변별력이 있는지부터 확인하는 게 이 저장소의 규약이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const fails = [];
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?enemy=mushroom', { waitUntil: 'load' });
    for (let i = 0; i < 160; i++) {
        if (await p.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && Scene3D.enemyMap && Scene3D.enemyMap.size > 0)) break;
        await p.waitForTimeout(250);
    }
    await p.waitForTimeout(800);

    if (process.env.CAPSELFTEST) console.log('※ 자기검증 모드 — 돔을 매끈한 구로 갈아 끼운다. ⑴ 이 FAIL 나야 정상.');
    await p.evaluate(v => { window.__capSelfTest = v; }, !!process.env.CAPSELFTEST);

    const r = await p.evaluate(() => {
        const S = Scene3D;
        // ⑴⑵ 용 메시는 **새로 짓는다** — 살아 있는 메시는 갓 플랩이 정점을 밀고 있어서
        //    '조형이 그런가'와 '지금 애니가 밀었나'가 뒤섞인다.
        const fresh = S.monsterMesh({ id: 0, x: 0 });
        const flap = fresh.anim && fresh.anim.capFlap;
        if (!flap) return { err: '새로 지은 메시에 capFlap 이 없다(갓 플랩 애니가 안 잡혔다)' };
        const dome = flap.mesh;
        if (window.__capSelfTest) dome.geometry = new THREE.SphereGeometry(0.32, 16, 12);
        const dp = dome.geometry.attributes.position, dn = dome.geometry.attributes.normal;
        if (!dn) return { err: '돔에 법선 속성이 없다' };

        // ── ⑴ 면 법선 축정렬 ─────────────────────────────────────────────
        // 큐브 조형이면 모든 면 법선이 ±x/±y/±z 중 하나다. 비스듬한 삼각형이 하나라도 있으면
        // 그 순간 voxel 로 안 읽힌다(`equip-voxelize` 가 등재한 비평가 지적).
        let axis = 0, total = 0;
        for (let i = 0; i < dn.count; i++) {
            const nx = Math.abs(dn.getX(i)), ny = Math.abs(dn.getY(i)), nz = Math.abs(dn.getZ(i));
            const mx = Math.max(nx, ny, nz), sum = nx + ny + nz;
            total++;
            if (mx > 0.999 && sum < 1.001) axis++;   // 한 축 성분만 1, 나머지 0
        }
        const axisPct = axis / total;

        // ── 복셀 한 칸의 월드 크기를 지오메트리에서 되뽑는다(상수를 손으로 베끼지 않는다) ──
        const xs = new Set();
        for (let i = 0; i < dp.count; i++) xs.add(+dp.getX(i).toFixed(6));
        const sorted = [...xs].sort((a, c) => a - c);
        let pitch = Infinity;
        for (let i = 1; i < sorted.length; i++) pitch = Math.min(pitch, sorted[i] - sorted[i - 1]);
        if (!isFinite(pitch) || pitch <= 0) pitch = 0.05;

        // ── ⑵ 반점이 자기 열의 맨 위 칸 바로 위에 얹혀 있는가 ─────────────
        const capG = dome.parent;
        const spots = capG.children.filter(o => o.userData && o.userData.capSpot);
        // 🚨 **정점을 xz 반경으로 걸러 열을 찾으면 안 된다 — 이웃 열이 섞인다(초안에서 실제로 겪었다).**
        //    복셀 면의 코너는 칸 경계(±0.5칸)에 있어서 **옆 열과 좌표를 공유**한다. 그래서 반경
        //    필터는 계단 턱에서 이웃(한 칸 높은) 열의 정점을 같이 집어 멀쩡한 반점을 '−1칸 파묻힘'
        //    으로 읽었다. → **면 단위로 처리한다**: 비인덱스 지오메트리라 정점 6개가 사각형 하나이고,
        //    그 6개의 평균이 곧 면 중심이다. 법선이 +y 인 면의 중심 xz 가 **그 열의 정확한 좌표**다.
        const tops = [];   // { x, z, y } — 윗면(+y)들
        for (let f = 0; f + 5 < dp.count; f += 6) {
            if (dn.getY(f) < 0.999) continue;                 // 윗면만
            let ax = 0, ay = 0, az = 0;
            for (let k = 0; k < 6; k++) { ax += dp.getX(f + k); ay += dp.getY(f + k); az += dp.getZ(f + k); }
            tops.push({ x: ax / 6, y: ay / 6, z: az / 6 });
        }
        const gaps = [];
        for (const sp of spots) {
            let top = -1e9;
            for (const t of tops) {
                if (Math.abs(t.x - sp.position.x) > pitch * 0.1) continue;
                if (Math.abs(t.z - sp.position.z) > pitch * 0.1) continue;
                if (t.y > top) top = t.y;
            }
            if (top < -1e8) { gaps.push(999); continue; }   // 그 열에 갓이 없다 = 허공에 떠 있다
            // 반점 밑면(중심 − 반 칸)과 그 열 갓 윗면의 간격, 칸 단위
            gaps.push(+(((sp.position.y - pitch * 0.5) - top) / pitch).toFixed(3));
        }

        // ── ⑶ base 가 지금 돔 정점과 같은 길이인가 ────────────────────────
        const baseLen = flap.base.length, posLen = dp.array.length;
        // 참고값: 반경 CV(옛 ⑴ 의 수치 — 판정에는 안 쓰고 보고만 한다)
        let sum = 0, n = 0; const rs = [];
        for (let i = 0; i < dp.count; i++) {
            const len = Math.hypot(dp.getX(i), dp.getY(i), dp.getZ(i));
            if (len < 1e-6) continue;
            rs.push(len); sum += len; n++;
        }
        const mean = sum / n;
        const cv = Math.sqrt(rs.reduce((a, v) => a + (v - mean) * (v - mean), 0) / n) / mean;
        return { axisPct: +axisPct.toFixed(4), total, pitch: +pitch.toFixed(4), spotN: spots.length, gaps, baseLen, posLen, cv: +cv.toFixed(4) };
    });

    if (r.err) { ok(false, r.err); }
    else {
        console.log(`  면 법선 ${r.total}개 · 복셀 한 칸 ${r.pitch} · 갓 반경 변동계수 ${(r.cv * 100).toFixed(2)}% (참고값)`);
        console.log(`  반점 ${r.spotN}개 · 열 윗면과의 간격(칸): ${r.gaps.join(', ')}`);
        ok(r.axisPct >= 0.999, `⑴ 갓 면 법선이 전부 축정렬이다 — ${(r.axisPct * 100).toFixed(2)}% (기준 99.9% 이상 · 매끈한 구면이면 크게 떨어진다)`);
        const spotOk = r.spotN === 6 && r.gaps.every(v => v >= -0.35 && v <= 0.35);
        ok(spotOk, `⑵ 반점 6개가 각자 열의 맨 위 칸 바로 위에 얹혀 있다 — 개수 ${r.spotN}/6 · 간격 허용 ±0.35칸`
            + (spotOk ? '' : ` · 벗어남: ${r.gaps.filter(v => v < -0.35 || v > 0.35).join(', ')}`));
        ok(r.baseLen === r.posLen, `⑶ 갓 플랩 base 가 지금 돔 정점과 같은 길이다 — base ${r.baseLen} / 정점 ${r.posLen} (어긋나면 첫 프레임에 갓이 깨진다)`);
    }
    ok(errors.length === 0, `⑷ 콘솔 에러 0건` + (errors.length ? ` · ${errors.slice(0, 2).join(' | ')}` : ''));

    console.log(`\n${fails.length ? 'FAIL ' + fails.length + '건' : '전건 PASS'}`);
    await b.close();
    process.exit(fails.length ? 1 : 0);
})();
