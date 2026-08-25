// 검정 아웃라인 균일도 **육안 검수 시트** — probe-outline-uniform.js 의 짝.
// 데스크톱 UA / 모바일 UA 를 각각 찍어 ⓐ 인게임 전경 ⓑ 영웅머리·무기·탈것·펫·적 6× 최근접 확대
// 크롭을 한 장에 붙인다. 확대가 필요한 이유: 1px 선은 1:1 스샷에서 '있는지조차' 판독이 안 된다
// (첫 판에서 아웃라인이 없다고 오판할 뻔했다 — 실제로는 있었고 눈·입 칸이 더 두꺼워 보였을 뿐).
// 사용: node shot-outline-uniform.js [출력경로]   기본 tools/outline-uniform.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'outline-uniform.png');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const capture = async (browser, ua) => {
    const page = await browser.newPage(Object.assign({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 }, ua ? { userAgent: ua } : {}));
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse'; Scene3D.refreshMount();
        S.pets = Object.keys(PET_ICONS).slice(0, 3).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
        S.activePets = [0, 1, 2]; Scene3D.refreshPets();
        Scene3D.clearEnemies();
        const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        const em = Scene3D.enemyMap.get(951);
        em.g.position.set(e.x + Scene3D.worldX, 0, 0); em.g.userData.landed = true;
        step(0.9);
        Scene3D.renderFrame();
        const gl = Scene3D.renderer.domElement;
        const cv = document.createElement('canvas'); cv.width = gl.width; cv.height = gl.height;
        cv.getContext('2d').drawImage(gl, 0, 0);
        // 크롭 중심 = 각 대상의 화면 투영점
        const proj = (v3) => { const v = v3.clone().project(Scene3D.camera); return { x: (v.x * 0.5 + 0.5) * gl.width, y: (-v.y * 0.5 + 0.5) * gl.height }; };
        const hp = Scene3D.heroG.position;
        const petG = (Scene3D.petGroups || [])[0];
        const spots = [
            ['영웅 머리', proj(new THREE.Vector3(hp.x, hp.y + 1.45, hp.z))],
            ['영웅 몸·무기', proj(new THREE.Vector3(hp.x + 0.25, hp.y + 0.75, hp.z))],
            ['탈것', proj(Scene3D.mountGroup.getWorldPosition(new THREE.Vector3()).setY(0.55))],
            ['펫', petG ? proj(petG.getWorldPosition(new THREE.Vector3()).setY(0.35)) : null],
            ['적', proj(em.g.getWorldPosition(new THREE.Vector3()).setY(0.6))],
        ].filter(s => s[1]);
        return {
            full: cv.toDataURL('image/png'), spots, w: gl.width, h: gl.height,
            postOn: !!Scene3D.postOn, postEdge: !!Scene3D.postEdge,
        };
    });
    await page.close();
    return { r, errors };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const A = await capture(browser, null);
    const B = await capture(browser, MOBILE_UA);
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const url = await page.evaluate(async ({ rows }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const Z = 6, CS = 96;                                  // 확대율 · 크롭 원본 한 변
        const HEAD = 40, GAP = 10;
        const imgs = []; for (const r of rows) imgs.push(await load(r.full));
        const FW = imgs[0].width, FH = imgs[0].height;
        const stripW = rows[0].spots.length * (CS * Z + GAP);
        const c = document.createElement('canvas');
        c.width = Math.max(FW + GAP + stripW, 800);
        c.height = rows.length * (Math.max(FH, CS * Z + 30) + HEAD + GAP);
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.fillStyle = '#101216'; x.fillRect(0, 0, c.width, c.height);
        let oy = 0;
        rows.forEach((row, i) => {
            const rowH = Math.max(FH, CS * Z + 30) + HEAD;
            x.font = 'bold 24px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(row.title, 12, oy + 28);
            x.drawImage(imgs[i], 0, oy + HEAD);
            row.spots.forEach((s, k) => {
                const sx = Math.max(0, Math.min(FW - CS, s[1].x - CS / 2));
                const sy = Math.max(0, Math.min(FH - CS, s[1].y - CS / 2));
                const dx = FW + GAP + k * (CS * Z + GAP), dy = oy + HEAD + 26;
                x.drawImage(imgs[i], sx, sy, CS, CS, dx, dy, CS * Z, CS * Z);
                x.strokeStyle = '#ffe08a'; x.lineWidth = 2; x.strokeRect(dx, dy, CS * Z, CS * Z);
                x.font = 'bold 20px sans-serif'; x.fillStyle = '#7fff9f';
                x.fillText(s[0] + ' (' + 6 + '×)', dx + 4, dy - 6);
                x.strokeStyle = '#ff5f5f'; x.lineWidth = 1.5; x.strokeRect(sx, oy + HEAD + sy, CS, CS);
            });
            oy += rowH + 10;
        });
        return c.toDataURL('image/png');
    }, {
        rows: [
            { title: `데스크톱 UA — postOn(블룸)=${A.r.postOn} · postEdge(아웃라인)=${A.r.postEdge}`, full: A.r.full, spots: A.r.spots },
            { title: `모바일 UA — postOn(블룸)=${B.r.postOn} · postEdge(아웃라인)=${B.r.postEdge}`, full: B.r.full, spots: B.r.spots },
        ],
    });
    fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
    console.log('시트 저장: ' + OUT);
    const errs = [...A.errors, ...B.errors];
    console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : '콘솔 에러 0건');
    await browser.close();
})();
