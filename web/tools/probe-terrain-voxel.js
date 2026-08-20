// 지형이 **정말로 계단식 복셀인지** 기계적으로 재는 게이트 (map-quality-up 지형·잔디 voxel, 2026-08-20).
//
// 왜 이 자인가: 장비 voxel 전환이 화풍 정합 2/10 을 받은 이유는 '매끈해서'가 아니라 **면이
//   축정렬이 아니어서**였다(probe-prop-voxel 머리말). 지형도 같은 자로 잰다 — 눈 판정은 안 쓴다.
//
// 무엇을 재는가:
//   ① **지면 법선 축정렬** — ground 지오메트리의 모든 법선이 ±x/±y/±z(오차 1e-3). 하나라도
//      비스듬하면 곡면 그라디언트가 남아 있다는 뜻이다.
//   ② **지면 정점 높이 양자화** — 모든 정점 y 가 VOXG.step 의 정수배. 윗면·벽 코너 전부에 걸린다.
//   ③ **heightAt 양자화·셀 상수** — 값이 step 정수배이고, 같은 셀 안 세 점에서 같은 값.
//      프롭·스캐터가 블록 윗면에 정확히 서는 조건이다.
//   ④ **x 주기 30 보존** — heightAt(x,z) == heightAt(x±30,z). 타일 순환(ground.position.x += 30)의
//      무결 조건 — 깨지면 순환 순간 지형이 튄다.
//   ⑤ **전투 라인 평지** — z −1.5~2.0 에서 heightAt == 0. 영웅·적·흙길 데칼이 서는 자리다.
//   ⑥ **음성 대조(양자화가 실제로 일함)** — heightSmooth 와 heightAt 의 차이가 표본 어딘가에서
//      0.05 를 넘어야 한다. 안 넘으면 '원곡선이 우연히 계단'이라는 뜻이라 이 자 전체가 공허하다.
//   ⑦ **원경 능선 계단 실루엣** — mountains/hills 지오메트리의 법선이 전부 (0,0,±1)이고,
//      정점 y 의 고유값 개수가 14 이하(스텝 h/12 양자화의 흔적). 곡선 프로파일이면 수십 개가 나온다.
//   ⑧ **잔디 복셀 블레이드** — scatter(인스턴스드) 지오메트리 법선이 전부 축정렬(blade 바이옴).
//   ⑨ **스캐터 전 층 + 흔들림 식생** — 광물·악센트 스캐터(scatter/2/3)와 windSway 식생(꽃·양치류·
//      나무)의 모든 메시 법선이 축정렬. 2026-08-20 scatterGeo·꽃·양치류 voxel 전환의 재발 방지 —
//      blade 만 재던 ⑧ 의 확장이다(접지 블롭 blobGeo 는 음영 오버레이라 제외).
//
// 판정: 마지막 줄 + exit 코드 (0 통과 · 1 미달 · 2 자 고장). 사용: node probe-terrain-voxel.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX);
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.renderer && Scene3D.ground', { timeout: 180000, label: '전장 부팅' });

    const r = await page.evaluate(() => {
        const S = Scene3D, out = { fails: [] };
        const axisAligned = (geo, allowY) => {
            const n = geo.attributes.normal;
            if (!n) return 'normal 속성 없음';
            let bad = 0;
            for (let i = 0; i < n.count; i++) {
                const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
                const m = Math.max(x, y, z);
                if (Math.abs(m - 1) > 1e-3 || (x + y + z) - m > 1e-3) bad++;
            }
            return bad;
        };
        const SH = S.VOXG.step, BS = S.VOXG.cell;
        const isStep = v => Math.abs(v / SH - Math.round(v / SH)) < 1e-4;

        // ① 지면 법선 축정렬
        const badN = axisAligned(S.ground.geometry);
        out.groundBadNormals = badN;
        if (badN !== 0) out.fails.push(`① 지면 비축정렬 법선 ${badN}개`);
        // ② 지면 정점 y 양자화
        const gp = S.ground.geometry.attributes.position;
        let badY = 0;
        for (let i = 0; i < gp.count; i++) if (!isStep(gp.getY(i))) badY++;
        out.groundBadY = badY;
        if (badY !== 0) out.fails.push(`② step 비정수배 정점 y ${badY}개`);
        // ③ heightAt 양자화 + 셀 상수
        let badQ = 0, badCell = 0;
        for (let i = 0; i < 400; i++) {
            const x = (Math.random() * 60 - 30), z = (Math.random() * 60 - 45);
            const h = S.heightAt(x, z);
            if (!isStep(h)) badQ++;
            const cx = Math.floor(x / BS) * BS, cz = Math.floor(z / BS) * BS;
            if (S.heightAt(cx + 0.1, cz + 0.1) !== h || S.heightAt(cx + BS - 0.1, cz + BS - 0.1) !== h) badCell++;
        }
        if (badQ) out.fails.push(`③ heightAt 비양자화 ${badQ}/400`);
        if (badCell) out.fails.push(`③ 셀 내 값 불일치 ${badCell}/400`);
        // ④ x 주기 30
        let badP = 0;
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 120 - 60, z = Math.random() * 60 - 45;
            if (Math.abs(S.heightAt(x, z) - S.heightAt(x + 30, z)) > 1e-6) badP++;
        }
        if (badP) out.fails.push(`④ x 주기 30 위반 ${badP}/200`);
        // ⑤ 전투 라인 평지
        let badF = 0;
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 60 - 30, z = -1.5 + Math.random() * 3.5;
            if (S.heightAt(x, z) !== 0) badF++;
        }
        if (badF) out.fails.push(`⑤ 전투 라인 비평지 ${badF}/100`);
        // ⑥ 음성 대조 — 양자화가 실제로 뭔가를 바꾸는가
        let maxDiff = 0;
        for (let i = 0; i < 400; i++) {
            const x = Math.random() * 60 - 30, z = -45 + Math.random() * 60;
            maxDiff = Math.max(maxDiff, Math.abs(S.heightSmooth(x, z) - S.heightAt(x, z)));
        }
        out.maxDiff = +maxDiff.toFixed(3);
        if (maxDiff < 0.05) out.fails.push(`⑥ 음성 대조 실패 — smooth 와 최대차 ${maxDiff.toFixed(3)} (자가 공허)`);
        // ⑦ 원경 능선
        const ridges = [...(S.mountains || []), ...(S.hills || [])];
        out.ridges = ridges.length;
        for (let ri = 0; ri < ridges.length; ri++) {
            const g = ridges[ri].geometry;
            const n = g.attributes.normal;
            let badRN = 0;
            for (let i = 0; i < n.count; i++)
                if (Math.abs(Math.abs(n.getZ(i)) - 1) > 1e-3) badRN++;
            const ys = new Set();
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) ys.add(+p.getY(i).toFixed(4));
            if (badRN) out.fails.push(`⑦ 능선${ri} 비축정렬 법선 ${badRN}개`);
            if (ys.size > 14) out.fails.push(`⑦ 능선${ri} 고유 y ${ys.size}개(>14) — 곡선 프로파일 잔존`);
        }
        // ⑧ 잔디(blade 스캐터) — 현 바이옴이 blade 를 쓸 때만 잰다
        const bio = S.BIOMES && S.BIOMES[S.biome];
        const usesBlade = (bio && bio.scatter) ? bio.scatter.geo === 'blade' : (S.biome === 'forest' || !S.biome);
        out.bladeChecked = !!(usesBlade && S.scatter);
        if (usesBlade && S.scatter) {
            const badB = axisAligned(S.scatter.geometry);
            out.bladeBadNormals = badB;
            if (badB !== 0) out.fails.push(`⑧ 잔디 비축정렬 법선 ${badB}개`);
        }
        // ⑨ 스캐터 전 층(광물·악센트 포함) + 흔들림 식생(꽃·양치류·나무) — 전부 복셀이어야 한다
        out.scatBad = 0; out.scatLayers = 0; out.vegBad = 0; out.vegMeshes = 0;
        for (const sm of [S.scatter, S.scatter2, S.scatter3]) {
            if (!sm || !sm.geometry) continue;
            out.scatLayers++;
            if (axisAligned(sm.geometry) !== 0) out.scatBad++;
        }
        if (out.scatBad) out.fails.push(`⑨ 스캐터 층 ${out.scatBad}/${out.scatLayers}개에 비축정렬 법선`);
        S.scene.children.forEach(g => {
            if (!g.userData || !g.userData.windSway) return;
            g.traverse(m => {
                if (!m.isMesh || !m.geometry || m.geometry === S.blobGeo) return;   // 접지 블롭 = 음영 오버레이
                out.vegMeshes++;
                if (axisAligned(m.geometry) !== 0) out.vegBad++;
            });
        });
        if (out.vegBad) out.fails.push(`⑨ 흔들림 식생 ${out.vegBad}/${out.vegMeshes}개 메시에 비축정렬 법선`);
        out.biome = S.biome;
        return out;
    });

    await browser.close();
    console.log(`지면 비축정렬 ${r.groundBadNormals} · 비양자화 y ${r.groundBadY} · smooth 최대차 ${r.maxDiff}`);
    console.log(`능선 ${r.ridges}겹 · 잔디 검사 ${r.bladeChecked ? `수행(비축정렬 ${r.bladeBadNormals})` : '건너뜀(비 blade 바이옴)'} · 바이옴 ${r.biome}`);
    console.log(`스캐터 층 ${r.scatLayers}개(위반 ${r.scatBad}) · 흔들림 식생 ${r.vegMeshes}메시(위반 ${r.vegBad})`);
    console.log(`콘솔 에러 ${errs.length}건`);
    if (errs.length) { console.log(errs.slice(0, 3).join('\n')); }
    if (r.fails.length || errs.length) {
        console.log('❌ FAIL\n' + r.fails.map(f => '  ✗ ' + f).join('\n'));
        process.exit(1);
    }
    console.log('✅ PASS — 지형·능선(·잔디)이 복셀 격자다');
})().catch(e => { console.error('자 고장:', e); process.exit(2); });
