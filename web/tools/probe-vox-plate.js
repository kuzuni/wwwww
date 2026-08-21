// 영웅 리그의 **voxel 판금 파츠**가 진짜 큐브로 서 있는지 재는 판정기 (화풍 확정 2026-08-20).
//
// 🚫 **2026-08-21 은퇴 — 이 판정기가 재던 판금 갑옷 영웅은 사용자 지시로 사라졌다 (slug: voxlimb-vox-030-mismatch).**
//   사용자 2026-08-21 "옷을 왜 입히냐 기본인데" → `scene3d.js setupHeroProc`(라인 396~)이 리그의
//   레거시 판금/바지/부츠 메시를 전부 숨기고 `simpleBox` 치비 박스 + 얼굴만 남긴다(맨살 치비).
//   그래서 이 판정기의 14개 파츠는 조립된 영웅 리그에 **더 이상 없다**: cuisse·greave·kneeCap·
//   poleynWing·kneeLame·cuirass·yoke·gorget·emblem·emblemRim 은 통째로 부재, thigh·shin·
//   upperArm·forearm 은 빈 피벗 본(자식 0)만 남았다(실측 2026-08-21 — 세 세션 인계 메모에 '선재
//   FAIL' 로 떠돌던 것의 뿌리). '옛 장비 디자인 전부 폐기'(equip-full-set-build)로 판금은 mc 천
//   갑옷(`mcArmorParts`/`dressMcRig`)으로 대체됐고 인게임 영웅은 맨살 치비다.
//   → **의도적으로 제거된 파츠는 FAIL 이 아니라 '은퇴(n/a)' 로 넘긴다.** 그래도 어떤 판금 파츠가
//     리그에 다시 나타나면(누가 판금을 되살리면) 그 파츠는 계속 ①~④로 잰다 — 게이트를 통째로
//     떼는 대신 '있는 것만 지킨다'. 원래 표적이던 `voxLimb` 칸 치수(VOX 0.03↔0.016)는 사지 메시가
//     리그에 없으니 지금은 휴면이다(되살릴 때 그쪽이 칸을 맞출 것).
//   현재 맨살 치비 영웅의 큐브 정합은 다른 판정기가 진다: `probe-vox-limb`(voxLimb 치수 보존·node
//   단위테스트) · `probe-voxel-build`(Voxel.build 면제거/AO/중심) · `probe-hero-tris`(삼각형 예산) ·
//   장비 voxel 은 `probe-equip-voxel`.
//
// 왜 이게 따로 필요한가 — 이 저장소에서 voxel 전환이 **조용히 무효가 되는 길이 두 개** 있다.
//   ⓐ **누가 프리미티브로 되돌린다.** 구/토러스/캡슐로 만든 파츠는 비스듬한 면이 나오고,
//      그 순간 voxel 로 안 읽힌다(화풍 블록의 기계적 정의). 캡처만 봐서는 "좀 매끈하네" 로
//      지나가기 쉬워서 수치 게이트가 있어야 한다.
//   ⓑ 🚨 **누가 `mesh.scale` 로 축별 배율을 준다 — 이쪽이 훨씬 흔하고 더 나쁘다.** 원본이
//      `SphereGeometry(r)` + `scale(1, 1.45, 1)` 같은 꼴이라, 큐브로 바꾸면서 scale 만 그대로
//      옮기고 싶은 유혹이 크다. 그러면 **큐브가 직육면체로 눌려** 격자가 어긋나고 다른 파츠와
//      칸 크기가 안 맞는다(화풍 ⓐ '조형은 그대로 큐브'의 정면 위반). 배율은 `mesh.scale` 이
//      아니라 **축별 칸 반지름**으로 흡수해야 한다(`ProChar.vr`).
//
// 판정 (파츠마다):
//   ① `Voxel.build` 산출물인가 (`userData.voxel`)
//   ② 월드 스케일이 등방인가 (x·y·z 최대/최소 ≤ 1.001) — ⓑ 를 잡는 판정
//   ③ 실제 큐브 한 칸의 월드 변이 리그 공용 칸(`ProChar.VOX`)과 같은가 (±2%)
//   ④ 전 면이 축정렬인가 (법선 성분이 하나뿐)
// 사용: node probe-vox-plate.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 여기 이름을 추가하는 것이 곧 '이 파츠를 voxel 로 옮겼다'의 선언이다 — 새 전환을 하면 같이 넓힐 것
// (이 저장소가 반복해 밟은 '판정기에 구멍이 있으면 그 구멍 안에서 결함이 자란다').
const PARTS = ['thigh', 'shin', 'upperArm', 'forearm', 'cuisse', 'kneeCap', 'poleynWing', 'kneeLame', 'greave', 'cuirass', 'yoke', 'gorget', 'emblem', 'emblemRim'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate((PARTS) => {
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        R.group.updateWorldMatrix(true, true);

        const rows = [];
        const seen = Object.create(null);
        R.group.traverse(o => {
            const tag = o.userData && o.userData.part;
            if (!tag || PARTS.indexOf(tag) < 0) return;
            if (seen[tag]) return;              // 좌우 한 쌍이라 한쪽만 본다
            seen[tag] = 1;
            // 태그가 그룹에 붙은 경우(사지)는 그 아래 첫 voxel 메시를 쥔다.
            let mesh = o.isMesh ? o : null;
            if (!mesh) o.traverse(c => { if (!mesh && c.isMesh) mesh = c; });
            if (!mesh) { rows.push({ tag, err: '메시 없음' }); return; }
            mesh.updateWorldMatrix(true, false);
            const s = new THREE.Vector3();
            mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
            const sMax = Math.max(s.x, s.y, s.z), sMin = Math.min(s.x, s.y, s.z);

            // 큐브 한 칸의 변 — 위치 속성에서 **0 이 아닌 최소 좌표 간격**을 찾는다.
            //   면 하나는 한 칸 사각형이므로, 그 네 코너의 좌표 차가 곧 칸 변이다.
            //   ⚠️ 전체 bbox / 칸 수로 역산하면 안 된다 — 칸 수를 코드에서 베껴 와야 해서
            //      '자가 코드보다 낡는' 함정(④)에 그대로 걸린다.
            const pos = mesh.geometry.attributes.position;
            let edge = Infinity;
            for (let f = 0; f < pos.count; f += 3) {
                for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
                    for (const k of ['getX', 'getY', 'getZ']) {
                        const d = Math.abs(pos[k](f + a) - pos[k](f + b));
                        if (d > 1e-6 && d < edge) edge = d;
                    }
                }
            }
            edge *= s.x;   // 로컬 → 월드 (등방 판정이 통과했다면 어느 축을 써도 같다)

            // 전 면 축정렬 — 법선 성분이 하나만 0 이 아니어야 한다.
            const nor = mesh.geometry.attributes.normal;
            let skew = 0;
            for (let i = 0; i < nor.count; i++) {
                const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
                if (n.filter(c => Math.abs(c) > 1e-3).length !== 1) skew++;
            }
            // 칸이 세로로 몇 층인지 — 허용 오차를 이걸로 정한다(아래 ③ 주석 참조).
            let yMin = Infinity, yMax = -Infinity;
            for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
            const layers = Math.max(1, Math.round((yMax - yMin) / (edge / s.x)));
            rows.push({
                tag, voxel: !!mesh.userData.voxel, sMax: +sMax.toFixed(4), sMin: +sMin.toFixed(4),
                edge: +edge.toFixed(5), skew, verts: nor.count, layers,
            });
        });
        return { rows, VOX: ProChar.VOX };
    }, PARTS);

    let fail = 0, retired = 0, live = 0;
    const chk = (ok, label, got) => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label} — ${got}`); };
    console.log(`--- voxel 판금 파츠 실측 (리그 공용 칸 ${out.VOX}) ---`);
    for (const t of PARTS) {
        const r = out.rows.find(x => x.tag === t);
        // 🚫 은퇴 파츠(맨살 치비로 숨김/제거)는 FAIL 이 아니라 n/a 로 넘긴다 (헤더 참조).
        //    태그가 아예 없거나(부재) 빈 본만 남은(메시 없음) 경우 = 의도적 제거.
        if (!r) { retired++; console.log(`  n/a  [${t}] — 은퇴(맨살 치비로 제거, scene3d setupHeroProc)`); continue; }
        if (r.err) { retired++; console.log(`  n/a  [${t}] — 은퇴(빈 피벗 본만 남음: ${r.err})`); continue; }
        live++;
        // ③ 허용 오차는 상수가 아니라 **층수에서 나온다.** `voxLimb` 은 길이를 정확히 보존하려고
        //    칸을 `len / 층수` 로 되잡으므로, 층이 적은 짧은 파츠일수록 칸이 VOX 에서 더 벌어진다
        //    (구조적 상한 = 0.5/층수 — 정강이 10층이면 5%). 그래서 ±2% 로 못 박으면 정강이가
        //    **코드가 옳은데** 떨어진다. 반대로 상수 8% 같은 걸로 퉁치면 잡아야 할 실수(격자를
        //    통째로 절반/두 배로 쓴 것 = 50~100% 오차)만 남기고 그 사이가 다 새어 나간다.
        //    → 층수를 지오메트리에서 세어(세로 변 / 칸) 그 파츠의 구조적 상한을 그대로 문턱으로 쓴다.
        const tol = Math.max(0.02, 0.5 / r.layers);
        console.log(`[${t}] 칸 ${r.edge} · 스케일 ${r.sMin}~${r.sMax} · 정점 ${r.verts} · 층 ${r.layers}`);
        chk(r.voxel, '  ① Voxel.build 산출물', `userData.voxel=${r.voxel}`);
        chk(r.sMax / r.sMin <= 1.001, '  ② 월드 스케일 등방(큐브가 안 눌렸다)', `${r.sMin}~${r.sMax}`);
        chk(Math.abs(r.edge / (out.VOX * r.sMax) - 1) <= tol,
            `  ③ 칸 = 리그 공용 VOX ±${(tol * 100).toFixed(1)}%(= 0.5/${r.layers}층)`,
            `${r.edge} vs ${(out.VOX * r.sMax).toFixed(5)} (오차 ${((r.edge / (out.VOX * r.sMax) - 1) * 100).toFixed(1)}%)`);
        chk(r.skew === 0, '  ④ 전 면 축정렬', `비축정렬 정점 ${r.skew}/${r.verts}`);
    }
    console.log('콘솔 에러 ' + errs.length + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 3)) : ''));
    if (errs.length) fail++;
    console.log(`\n판금 파츠 ${live}개 라이브 · ${retired}개 은퇴(맨살 치비)` + (fail ? ` · 미통과 ${fail}건` : ' · 라이브 전건 통과'));
    if (retired === PARTS.length) console.log('→ 판금 갑옷 영웅 전면 은퇴 상태(맨살 치비). 이 판정기는 판금이 되살아나면 다시 잰다.');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
