// probe-enemy-ao.js — 적 AO 링이 **실제로 화면에 기여하는지** 종별로 잰다.
// 사용: node probe-enemy-ao.js [kind...]   (기본 7종 전부)
//
// 왜 필요한가: AO 링은 '그 높이의 실제 몸 반지름'에 맞춰야 하는데, 반지름을 조금만 작게 잡으면
// **몸 안에 완전히 파묻혀 화면에 한 픽셀도 안 나온다.** 그래도 콘솔 에러도 없고 캡처도 멀쩡해 보여서
// 육안으로는 '넣었는데 안 보이네' 와 '아예 안 들어갔네' 가 구분되지 않는다(실제로 버섯 갓 밑은
// 게임 카메라가 살짝 내려다보는 각이라 육안 A/B 가 거의 불가능했다). 반대로 너무 크면 실루엣 밖으로
// 튀어 '후프'가 된다 — 그것도 같이 잡는다.
//
// 재는 법: **같은 프레임에서** 링만 껐다 켜서(userData.aoRing) 두 장을 찍고 픽셀 차분을 낸다.
//   ⚠️ 다시 스폰하거나 페이지를 새로 띄우면 개체 지터(색 랜덤)·애니메이션 위상이 달라져
//      차분이 통째로 오염된다. 반드시 한 페이지·한 정지 상태에서 visible 만 토글할 것.
//   ① darkPx  = 눈에 띄게 어두워진 픽셀 수(휘도 −6 이상) → 0 이면 링이 파묻힌 것 = 무효과
//   ② maxDrop = 최대 휘도 하락폭 → 너무 작으면 있으나 마나
//   ③ 후프 유출 = 링이 켜지며 **실루엣에서 2px 넘게 떨어진 배경**이 어두워진 픽셀 수 → 0 이어야 한다.
//      경계 1~2px 의 앤티앨리어싱은 곡면을 감는 링이면 반드시 생기므로 따로 세어(경계AA) 통과시킨다 —
//      그걸 유출로 세면 잘 앉힌 링도 전부 걸린다(실측 5~52px).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const MIN_DARK_PX = 60;    // 이보다 적으면 사실상 안 보이는 것으로 본다
const MIN_DROP = 10;       // 최대 하락폭 하한

// 🚨 렌더와 읽기는 **반드시 한 evaluate(=한 JS 턴) 안에서** 해야 한다.
// 이 저장소의 메인 렌더러는 preserveDrawingBuffer 가 아니라, 렌더를 한 호출에서 하고
// drawImage 를 다음 호출에서 하면 그 사이에 드로잉 버퍼가 **비워져 검은 판**이 읽힌다.
// 실측: 그렇게 쟀더니 박쥐가 한 번은 66px, 다음 실행에서 197,862px 로 튀고 임프는 배경까지
// 17만 화소가 '어두워졌다'고 나왔다 — 링과 무관한 계측 아티팩트였다(같은 함정: 6번째 줄 경고).
// setup(page 안에서 돌 준비 함수)을 넘기면 그리기 직전에 같은 턴에서 실행한다.
async function renderAndGrab(page, rect, setup) {
    return await page.evaluate(({ r, setup }) => {
        // eslint-disable-next-line no-new-func
        (new Function(setup))();
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        const cv = document.querySelector('canvas');
        const off = document.createElement('canvas');
        off.width = Math.round(r.width); off.height = Math.round(r.height);
        const cx = off.getContext('2d');
        cx.drawImage(cv, 0, 0, off.width, off.height);
        const d = cx.getImageData(0, 0, off.width, off.height).data;
        return { w: off.width, h: off.height, data: Array.from(d) };
    }, { r: rect, setup });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    const rows = [];
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
        const nRings = await page.evaluate((kind) => {
            Combat.tick = () => {};
            Scene3D.walking = false;
            Scene3D.heroG.visible = false;
            Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
            if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
            Scene3D.petGroups.forEach(p => p.visible = false);
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.heroAttack = () => {};
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m.g.position.y = 0; m.g.userData.landed = true;
            m.g.position.x = e.x + Scene3D.worldX;
            if (kind === 'wolf') m.g.rotation.y = -1.15;
            m.g.updateMatrixWorld(true);
            for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
                if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
                o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
            }
            const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
            if (hpG) hpG.visible = false;
            if (m.hpG) m.hpG.visible = false;
            const box = new THREE.Box3().setFromObject(m.g);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z);
            const dist = r * 1.75 + 0.4;
            Scene3D.camLock = {
                pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95),
                look: c.clone(),
            };
            // 링 목록을 전역에 매달아 둔다(토글용)
            window.__aoRings = [];
            m.g.traverse(o => { if (o.userData && o.userData.aoRing) window.__aoRings.push(o); });
            return window.__aoRings.length;
        }, kind);
        await page.waitForTimeout(700);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        });
        const rect = await page.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        // ⚠️ 애니메이션이 계속 돌면 두 장의 포즈가 달라 차분이 오염된다 — rAF 루프를 멈추고
        //    수동으로 한 프레임씩 그린다(연출 백로그는 위에서 이미 비웠다).
        await page.evaluate(() => {
            Scene3D.__frozenUpdate = Scene3D.update;
            Scene3D.update = () => {};
        });
        const on = await renderAndGrab(page, rect, 'window.__aoRings.forEach(o => o.visible = true); Scene3D.enemyMap.get(999).g.visible = true;');
        const off = await renderAndGrab(page, rect, 'window.__aoRings.forEach(o => o.visible = false); Scene3D.enemyMap.get(999).g.visible = true;');
        // 실루엣 마스크: 적을 통째로 숨긴 배경 판 — '어두워진 화소가 배경인가'를 가르는 기준이다.
        const bg = await renderAndGrab(page, rect, 'Scene3D.enemyMap.get(999).g.visible = false;');
        await page.evaluate(() => { Scene3D.enemyMap.get(999).g.visible = true; });

        const L = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
        const W = on.w, H = on.h;
        // 적 실루엣 마스크 = '적을 숨긴 판'과 다른 화소(적 본체 + 적이 드리운 그림자).
        const inSil = new Uint8Array(W * H);
        for (let px = 0; px < W * H; px++) {
            if (Math.abs(L(off.data, px * 4) - L(bg.data, px * 4)) >= 2) inSil[px] = 1;
        }
        // ⚠️ 마스크를 **2px 부풀린다.** 링은 곡면 몸을 감싸므로 접선 자리에서 반드시 서브픽셀만큼
        //    비어져 나오고, 안티에일리어싱된 경계 화소가 배경 휘도와 구분이 안 된다. 그걸 그대로
        //    '유출'로 세면 아무리 잘 앉힌 링도 5~50px 씩 걸린다(실측). 우리가 잡고 싶은 건
        //    **실루엣에서 떨어져 나온 후프**지 경계 1~2px 의 앤티앨리어싱이 아니다.
        const dil = new Uint8Array(W * H);
        const R = 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!inSil[y * W + x]) continue;
            for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                const ny = y + dy, nx = x + dx;
                if (ny >= 0 && ny < H && nx >= 0 && nx < W) dil[ny * W + nx] = 1;
            }
        }
        let darkPx = 0, maxDrop = 0, leak = 0, sumDrop = 0, edgePx = 0;
        for (let px = 0; px < W * H; px++) {
            const i = px * 4;
            const drop = L(off.data, i) - L(on.data, i);    // 링을 켜서 어두워진 양
            if (drop > 6) {
                darkPx++; sumDrop += drop;
                if (drop > maxDrop) maxDrop = drop;
                if (!dil[px]) leak++;                        // 부풀린 실루엣 **밖** = 진짜 후프
                else if (!inSil[px]) edgePx++;               // 경계 1~2px = 앤티앨리어싱(정상)
            }
        }
        if (nRings === 0) {   // 링을 의도적으로 안 두는 종(슬라임: 이음새 없음) — 검사 대상이 아니다
            console.log(`${kind.padEnd(9)} 링  0개 · 해당 없음(이음새가 없는 종 — 의도된 미적용)`);
            rows.push({ kind, nRings, skipped: true });
            await page.close();
            continue;
        }
        const okDark = darkPx >= MIN_DARK_PX;
        const okDrop = maxDrop >= MIN_DROP;
        const okLeak = leak === 0;
        if (!okDark || !okDrop || !okLeak || errors.length) fail++;
        rows.push({ kind, nRings, darkPx, maxDrop, avgDrop: darkPx ? sumDrop / darkPx : 0, leak, edgePx, errors: errors.length, ok: okDark && okDrop && okLeak && !errors.length });
        console.log(`${kind.padEnd(9)} 링 ${String(nRings).padStart(2)}개 · 어두워진 화소 ${String(darkPx).padStart(5)} · 최대 하락 ${maxDrop.toFixed(1).padStart(5)} · 평균 ${(darkPx ? sumDrop / darkPx : 0).toFixed(1).padStart(4)} · 경계AA ${String(edgePx).padStart(3)} · 후프 유출 ${leak}` +
            (okDark && okDrop && okLeak && !errors.length ? '   ok' : '   ← ' +
                [!okDark ? `링이 파묻혀 안 보인다(${darkPx}<${MIN_DARK_PX})` : '', !okDrop ? `하락폭 부족(${maxDrop.toFixed(1)}<${MIN_DROP})` : '', !okLeak ? `실루엣 밖으로 후프가 튀어나왔다 ${leak}px` : '', errors.length ? '콘솔 에러' : ''].filter(Boolean).join(' / ')));
        if (errors.length) console.log('    ' + errors.slice(0, 3).join(' | '));
        await page.close();
    }
    await browser.close();
    console.log('');
    const checked = rows.filter(r => !r.skipped).length;
    console.log(fail === 0 ? `PASS — 검사 ${checked}종 전부 AO 링이 화면에 실제로 기여하고 실루엣 밖 유출 0 (링 미적용 ${rows.length - checked}종 제외)`
        : `반려 — ${fail}종`);
    process.exit(fail === 0 ? 0 : 1);
})();
