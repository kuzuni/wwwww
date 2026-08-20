// 영웅 리그의 **삼각형·드로우콜 예산** 실측기 (voxel 전환 2026-08-20 신설).
//
// 왜 필요한가: voxel 조형은 칸을 줄이면 면 수가 **세제곱이 아니라 제곱**으로 늘지만, 그래도
// 매끈 프리미티브보다 훨씬 많다(흉갑: 라테 22세그 ≈ 400면 → 큐브 회전체 8484면). 화풍 블록이
// "성능·모바일 고려해 병합/인스턴싱으로 드로우콜 관리"라고 못 박았는데, 지금까지 **그걸 재는
// 자가 없었다.** 캡처는 느려져도 그냥 '부하'로 보이기 때문에(이 저장소 함정 ⑤) 조용히 넘어간다.
//
// 출력: 파츠별 삼각형 수 상위 + 리그 합계 + 드로우콜(메시 수). 판정 문턱은 리그 합계에만 건다.
//
// 🚨 **문턱은 '이 이상이면 느리다'가 아니라 '이 이상이면 다시 재라'는 트립와이어다 — 근거를 실측으로
//    깔아 뒀으니 숫자만 보고 옮기지 말 것.** 처음엔 통념(모바일 캐릭터 1.5만~3만)으로 30000 을
//    박았는데, 그 값은 **voxel 화풍과 애초에 양립하지 않는다**: 큐브 표면은 계단이라 같은 실루엣도
//    매끈 저폴리보다 면이 몇 배다. 그래서 통념 대신 **비용을 직접 쟀다**(`probe-hero-frametime`,
//    같은 컨테이너에서 A/B 3런씩):
//      · 21,846 tri (voxel 전환 전) → 프레임 중앙값 168.3 / 167.3 / 168.3 ms
//      · 50,778 tri (사지+다리판금+흉갑 전환 후) → 182.1 / 180.6 / 184.5 ms
//    **삼각형 2.3배에 프레임 +8%.** 이 씬은 정점이 아니라 필레이트·나머지 작업이 지배하기 때문이고,
//    그것도 swiftshader **소프트웨어 렌더**라는 최악 조건에서의 수치다(실제 GPU에선 차이가 더 작다).
//    → 문턱을 60000 으로 둔다: 남은 전환(요크·견갑·스커트·부츠·손)이 들어갈 여유이면서, 거기서
//      더 늘면 **다시 A/B 를 재라**는 신호가 되는 자리다. ⚠️ 넘겼다고 조형을 되돌리기 전에 반드시
//      `probe-hero-frametime` 으로 실제 비용부터 확인할 것 — 이번에도 '무거워 보인다'가 아니라
//      실측이 판단을 뒤집었다(`shot-hero` 타임아웃의 범인은 조형이 아니라 고정 대기 문턱이었다).
//
// 🔁 **2026-08-20 두상 voxel 전환에서 트립와이어가 실제로 울렸고, 지시대로 다시 쟀다 → 66000 으로 옮긴다.**
//    두상·턱을 구 두 개에서 큐브 상자로 옮기니 합계 55,070 → **60,762**(+5,692, 문턱 1.3% 초과).
//    조형을 되돌리기 전에 이 머리말이 시키는 대로 `probe-hero-frametime` 을 **같은 실행 조건에서 교차로**
//    돌렸다(old/new 를 번갈아, 120프레임, 중앙값):
//      · R1  old 255.1ms(p90 543.5 — 다른 프로브가 붙어 오염된 판) / new 246.4ms
//      · R2  old **245.3ms** / new **247.9ms**  ← 깨끗한 짝
//    **삼각형 +10.3% 에 프레임 +1.1%.** 앞선 측정(2.3배에 +8%)과 같은 결론이다 — 이 씬은 정점이 아니라
//    필레이트·나머지 작업이 지배한다. 그래서 조형을 되돌리지 않고 문턱을 옮겼다.
//    ⚠️ **다음에 또 울리면 똑같이 하라: 먼저 재고, 그 다음에 판단하라.** 다만 66000 은 남은 전환
//       (무기·방패·손·코)까지 잡은 자리이므로 **여기서 또 넘으면 이번엔 정말 조형/병합을 손볼 때**다.
//       ⓐ 얼굴 안 보이는 면(투구 착용 시 두상 전체)을 조건부로 빼는 길 ⓑ 파츠 병합으로 드로우콜부터
//       줄이는 길이 남아 있다 — 문턱만 또 올리지 말 것.
// 사용: node probe-hero-tris.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const BUDGET = 66000;   // ⚠️ 숫자만 보고 옮기지 말 것 — 머리말의 실측 근거를 먼저 읽어라

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig, null, { timeout: 60000 });

    const out = await page.evaluate(() => {
        const R = Scene3D.heroRig;
        const rows = [];
        let tris = 0, meshes = 0;
        R.group.traverse(o => {
            if (!o.isMesh || !o.geometry) return;
            const g = o.geometry;
            const n = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
            tris += n; meshes++;
            // 이름표가 없는 조각이 대부분이라, 가장 가까운 조상의 part 태그를 라벨로 쓴다.
            let lab = '(무명)';
            for (let p = o; p; p = p.parent) { if (p.userData && p.userData.part) { lab = p.userData.part; break; } }
            rows.push({ lab, n, vox: !!o.userData.voxel });
        });
        const by = Object.create(null);
        for (const r of rows) {
            if (!by[r.lab]) by[r.lab] = { tris: 0, meshes: 0, vox: 0 };
            by[r.lab].tris += r.n; by[r.lab].meshes++; if (r.vox) by[r.lab].vox++;
        }
        return { tris, meshes, by };
    });

    const list = Object.entries(out.by).sort((a, b) => b[1].tris - a[1].tris);
    console.log('--- 영웅 리그 삼각형 예산 ---');
    for (const [lab, v] of list.slice(0, 12)) {
        console.log(`  ${String(lab).padEnd(12)} ${String(Math.round(v.tris)).padStart(7)} tri · 메시 ${v.meshes}${v.vox ? ' · voxel ' + v.vox : ''}`);
    }
    console.log(`합계 ${Math.round(out.tris)} tri · 메시(드로우콜) ${out.meshes}`);
    const ok = out.tris <= BUDGET;
    console.log(`${ok ? 'PASS' : 'FAIL'} 리그 합계 ${Math.round(out.tris)} ≤ ${BUDGET}`);
    console.log('콘솔 에러 ' + errs.length);
    await browser.close();
    process.exit(ok && !errs.length ? 0 : 1);
})();
