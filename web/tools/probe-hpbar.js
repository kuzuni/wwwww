// 머리 위 HP바 실측 — 두 가지를 한 번에 잰다.
//   ⑴ 렌더된 색이 **디자인 팔레트와 같은가** (출력 sRGB 인코딩 때문에 팔레트가 한 단계 밝아지던 문제).
//      기대: 트랙 0x0d1114 니어블랙 / 채움 0x2ebd6b 민트 / 잔상 0xd63a3a·0xe8a800.
//   ⑵ 3차 지적 ⑥ "손실 잔상바가 스캔라인처럼 4/8행만 채워지고 트랙 밖으로 삐져나온다" —
//      바를 크게 찍어 **행별 프로파일**로 채움률과 트랙 경계 이탈을 확인한다.
// 사용: node probe-hpbar.js
// ⚠️ 바가 화면에서 6px 남짓이라 기본 카메라로는 못 잰다 — 측정 동안만 카메라를 바 앞으로 옮긴다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const W = 480, H = 854;

async function decode(page, buf) {
    return page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data;
        return { w: img.width, h: img.height, d: Array.from(d) };
    }, buf.toString('base64'));
}
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(2000);

    const setup = await page.evaluate(() => {
        Combat.tick = function () { };
        Scene3D.walking = false;
        Scene3D._probeRAF = Scene3D.update;
        Scene3D.update = function () { };
        // ⚠️ enemyMap.values()의 첫 항목을 그냥 집으면 안 된다 — **죽어가는 중인 적**이 앞에 남아 있다.
        // (헤드리스에서는 main.js의 dt 클램프 0.1s 때문에 사망 연출이 실시간의 6배 넘게 늘어져
        //  죽은 적이 enemyMap에 한참 머문다. 그 개체는 설계대로 hpG.visible=false라 바가 안 보인다.)
        const liveId = Combat.enemies.filter(e => e.alive).map(e => e.id).find(id => Scene3D.enemyMap.has(id));
        const m = liveId != null ? Scene3D.enemyMap.get(liveId) : null;
        if (!m || !m.hpG.visible) return { ok: false };
        // 바 앞으로 카메라를 붙인다(측정 전용) — 바 world 위치는 hpG가 소유
        const p = m.hpG.position, by = m.barY * (m.hpG.scale.y || 1);
        Scene3D.camera.position.set(p.x, p.y + by, p.z + 1.15);
        Scene3D.camera.lookAt(p.x, p.y + by, p.z);
        Scene3D.camera.updateProjectionMatrix();
        const r = Scene3D.renderer.domElement.getBoundingClientRect();
        window._liveId = liveId;
        return { ok: true, barY: by, canvas: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    });
    if (!setup.ok) { console.log('살아있는 적을 못 찾음 — 재시도할 것'); await browser.close(); process.exitCode = 1; return; }

    // 절반쯤 깎고, 흰 플래시(0.14초)는 지나가되 잔상 홀드(0.28초)는 아직인 시점에서 찍는다.
    // ⚠️ 피격 직후 프레임은 트랙이 흰색으로 밀려 있어(설계대로) 색 측정에 못 쓴다 —
    //    첫 시도에서 트랙이 #cacbcb로 나온 게 그 때문이었다.
    const state = await page.evaluate(() => {
        const m = Scene3D.enemyMap.get(window._liveId);
        m.ghostV = 0.92;                 // 직전 체력
        Scene3D.hitHpBar(m, 0.3);        // 큰 피해 → 잔상 빨강
        for (let i = 0; i < 9; i++) Scene3D.driveHpBar(m, 0.55, 1 / 60);  // 0.15초 경과
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);

        // 바 세 조각의 화면 좌표를 **직접 투영**해 얻는다(픽셀 탐색은 골렘 마그마·풀을
        // 잔상/채움으로 오인한다 — 첫 시도가 그랬다).
        const r = Scene3D.renderer.domElement.getBoundingClientRect();
        const toPx = v => {
            const p = v.clone().project(Scene3D.camera);
            return [(p.x * 0.5 + 0.5) * r.width + r.left, (-p.y * 0.5 + 0.5) * r.height + r.top];
        };
        const quad = mesh => {
            mesh.updateWorldMatrix(true, false);
            const g = mesh.geometry.parameters;
            const cs = [[-g.width / 2, -g.height / 2], [g.width / 2, g.height / 2]].map(([x, y]) =>
                toPx(mesh.localToWorld(new THREE.Vector3(x, y, 0))));
            return { x0: Math.min(cs[0][0], cs[1][0]), x1: Math.max(cs[0][0], cs[1][0]),
                     y0: Math.min(cs[0][1], cs[1][1]), y1: Math.max(cs[0][1], cs[1][1]) };
        };
        return {
            ratio: 0.55, ghostV: +m.ghostV.toFixed(3), hpFlash: +(m.hpFlash || 0).toFixed(3),
            fg: m.hpFg.material.color.getHexString(),
            gh: m.hpGhost.material.color.getHexString(),
            bg: m.hpBg.material.color.getHexString(),
            qBg: quad(m.hpBg), qFg: quad(m.hpFg), qGh: quad(m.hpGhost),
        };
    });
    await page.waitForTimeout(150);
    const img = await decode(page, await page.screenshot());
    const at = (x, y) => { const i = (y * img.w + x) * 4; return [img.d[i], img.d[i + 1], img.d[i + 2]]; };
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

    const R = (q) => [Math.round(q.x0), Math.round(q.y0), Math.round(q.x1), Math.round(q.y1)];
    console.log('=== HP바 실측 (골렘, ratio %s / ghostV %s / hpFlash %s) ===', state.ratio, state.ghostV, state.hpFlash);
    console.log('머티리얼 저장색(선형):', 'fg=' + state.fg, 'ghost=' + state.gh, 'track=' + state.bg);
    console.log('트랙 화면 사각:', R(state.qBg).join(','), ' 채움:', R(state.qFg).join(','), ' 잔상:', R(state.qGh).join(','));

    const bg = state.qBg, gh = state.qGh;
    const by0 = Math.max(0, Math.round(bg.y0)), by1 = Math.min(img.h - 1, Math.round(bg.y1));
    // 잔상 노출 구간 = 채움 오른쪽 끝 ~ 잔상 오른쪽 끝
    const gx0 = Math.round(state.qFg.x1) + 1, gx1 = Math.round(gh.x1) - 1;
    console.log('\n트랙 세로 ' + (by1 - by0 + 1) + '행 / 잔상 노출 가로 구간 x ' + gx0 + '~' + gx1 + ' (' + (gx1 - gx0 + 1) + 'px)');

    // 상태 덤프 — '빨강 0'이 나올 때 잔상이 꺼진 건지 색이 다른 건지 가른다
    const dbg = await page.evaluate(() => {
        const m = Scene3D.enemyMap.get(window._liveId);
        return { visible: m.hpGhost.visible, opacity: m.hpGhost.material.opacity,
                 scaleX: +m.hpGhost.scale.x.toFixed(3), renderOrder: m.hpGhost.renderOrder,
                 parentVisible: m.hpGhost.parent.visible, hpGvis: m.hpG.visible, inScene: !!m.hpG.parent };
    });
    console.log('잔상 상태:', JSON.stringify(dbg));
    const midR = Math.round((by0 + by1) / 2);
    console.log('잔상 구간 실제 픽셀 (y=' + midR + '):',
        [0, 0.25, 0.5, 0.75, 1].map(f => hex(at(Math.round(gx0 + (gx1 - gx0) * f), midR))).join(' '));
    console.log('채움 구간 실제 픽셀 (y=' + midR + '):',
        [0.2, 0.5, 0.8].map(f => hex(at(Math.round(state.qFg.x0 + (state.qFg.x1 - state.qFg.x0) * f), midR))).join(' '));

    console.log('\n행별 프로파일 (잔상 노출 구간 안에서 — 빨강 픽셀 수 / 그 행 폭)');
    const width = gx1 - gx0 + 1;
    const rows = [];
    for (let y = by0; y <= by1; y++) {
        let red = 0;
        for (let x = gx0; x <= gx1; x++) {
            const [r, g, b] = at(x, y);
            if (r > g + 30 && r > b + 25) red++;
        }
        rows.push(red);
        const pct = width > 0 ? Math.round(red / width * 100) : 0;
        console.log('  y=' + y, String(red).padStart(3) + '/' + width, '='.repeat(Math.round(pct / 5)) + ' ' + pct + '%');
    }
    const filled = rows.filter(v => v > width * 0.5).length;
    console.log('\n잔상이 절반 이상 채운 행:', filled, '/', rows.length,
        filled >= Math.floor(rows.length * 0.5) ? '→ OK (연속 띠 — 스캔라인 아님)' : '→ NG (일부 행만 = 스캔라인)');

    // 트랙 밖으로 삐져나오는지: 잔상 사각이 트랙 사각 안에 있는가
    const inside = gh.x0 >= bg.x0 - 1 && gh.x1 <= bg.x1 + 1 && gh.y0 >= bg.y0 - 1 && gh.y1 <= bg.y1 + 1;
    console.log('잔상이 트랙 안에 있는가:', inside ? 'OK' : 'NG (트랙 밖으로 삐져나옴)');

    // 색 정확도 — 채움 중앙, 트랙 왼쪽 여백(채움보다 큰 테두리 부분)
    const midY = Math.round((bg.y0 + bg.y1) / 2);
    const fgPx = at(Math.round((state.qFg.x0 + state.qFg.x1) / 2), midY);
    const trackPx = at(Math.round(bg.x0 + 2), midY);
    console.log('\n채움 픽셀:', hex(fgPx) + ' rgb(' + fgPx.join(',') + ')', ' 기대 ≈ #2ebd6b(46,189,107)');
    console.log('트랙 픽셀:', hex(trackPx) + ' rgb(' + trackPx.join(',') + ')', ' 기대 ≈ #0d1114(13,17,20)');
    const near = (c, t) => Math.max(...c.map((v, i) => Math.abs(v - t[i])));
    console.log('채움 최대 채널 오차:', near(fgPx, [46, 189, 107]), ' 트랙 최대 채널 오차:', near(trackPx, [13, 17, 20]));

    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 3).join(' | '));
    await browser.close();
})();
