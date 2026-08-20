// probe-boss-identity.js — 보스가 **같은 종의 일반 적과 다르게 읽히는가**를 화소로 잰다.
//   (`enemy-quality` 의 '+보스 변형' 축. 진행 메모 2 가 남긴 다음 착수 지점:
//    "레갈리아 외 보스 전용 재질·발광(눈빛·룬)과 등장 연출은 아직 안 건드렸다".)
//
// ── 왜 이 자인가 ───────────────────────────────────────────────────────────────
//   보스 처리는 지금 `g.scale.setScalar(1.9)` + `bossRegalia`(관·등가시·견갑뿔)가 전부다. 즉
//   **몸 자체는 일반 적과 완전히 같은 메시**다. 코드 주석도 그 위험을 스스로 적어 뒀다 —
//   "같은 메시를 그대로 키운 것이라 박자까지 같으면 '크기만 키운 장난감'으로 읽힌다"(보행 박자는
//   그래서 이미 손봤다). 남은 건 **재질·발광**이고, 그건 크기를 맞춰 놓고 비교해야만 보인다.
//
// ── 재는 법 ────────────────────────────────────────────────────────────────────
//   같은 종을 **보스**와 **일반**으로 한 번씩 세우고, 보스의 `g.scale` 을 일반과 같게 되돌려
//   **화면 크기를 맞춘 뒤** 같은 카메라로 찍어 화소를 뺀다. 그리고 **레갈리아를 숨긴 상태**로도
//   한 번 더 찍는다. 두 수치의 뜻이 다르다:
//     · `관포함 차이%`  = 보스 전체가 일반과 다른 정도. 관만 얹어도 올라간다.
//     · `몸만 차이%`    = **레갈리아를 뺀 몸**이 다른 정도. ← 이게 이 자의 판정 대상이다.
//                          0 에 가까우면 보스의 정체성이 **얹은 장신구뿐**이라는 뜻이다.
//   🚨 **크기를 안 맞추면 이 자는 무의미하다.** 1.9배 상태로 빼면 실루엣이 통째로 어긋나
//      '몸이 다르다'가 100% 로 나온다 — 실제로는 같은 메시인데도.
//
// 🚨 **레갈리아 식별은 `userData.bossRegalia` 태그로만** 한다(`probe-boss-crown-seat` 와 같은 규약).
//    색·지오메트리 타입으로 고르면 몸의 금색 파츠까지 딸려 온다.
//
// 사용: node probe-boss-identity.js        # 게이트. 몸만 차이가 기준 미달인 종이 있으면 종료코드 1
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const KINDS = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const VW = 480, VH = 854;
const DTH = 10;          // 화소 차 문턱(RGB 합). 이 아래는 AA·디더 잡음으로 본다.
// '몸만 차이%'(분모=실루엣) 하한. **실측 전/후 양쪽 끝에서 잡았다**:
//   수정 전 0.0 / 0.9 / 1.9 / [bat 59.0] / 1.5 / 4.2 / 5.8  ↔  수정 후 99.0 / 100.5 / 48.2 / 98.5 / 97.4 / 98.8 / 85.3
// 🚨 **박쥐는 이 자로 판정하지 말 것 — 수정 전부터 59.0% 다.** 7종 중 유일한 비행체이고, 보스는
//   `gaitOf(kind, true)` 로 **박자·진폭이 설계상 다른** 걸음을 받으므로 날개 기본 자세가 갈리는 것으로
//   보인다(원인을 끝까지 격리하지는 않았다). 어느 기준선을 잡아도 박쥐만은 변별력이 없다 —
//   25 로 두면 수정 전에도 통과하고, 60 으로 올리면 수정 후 고블린(48.2)이 떨어진다. 나머지 6종은
//   25 가 양쪽을 깨끗이 가른다(전 ≤5.8 · 후 ≥48.2).
// ⚠️ 차이%가 100 을 넘을 수 있다 — 분모가 '일반 적 실루엣'인데 색이 바뀌면 AA 가장자리·림라이트가
//   실루엣 바깥 화소까지 건드린다. 100 은 상한이 아니라 '실루엣 넓이만큼 바뀌었다'는 눈금이다.
const GATE_BODY = 25.0;

const INPAGE = `(kind) => {
    Combat.tick = () => {};
    Scene3D.walking = false;
    Scene3D.heroG.visible = false;
    Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
    if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
    if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
    Scene3D.petGroups.forEach(p => p.visible = false);
    Scene3D.heroAttack = () => {};

    const gl = Scene3D.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => {
        Scene3D.renderFrame();
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
    };
    // 한 마리를 세우고 화면을 얻는다. boss=true 면 배율을 일반과 같게 되돌려 **크기를 맞춘다**.
    const shot = (isBoss, hideRegalia) => {
        // 🚨 **매 빌드 같은 시드를 심는다 — 안 하면 이 자는 통째로 거짓말을 한다.**
        //   적 조형은 voxel jitter·종별 변주가 전부 Math.random 이라, 같은 종을 두 번 세우면
        //   몸이 서로 다르게 나온다. 시드 없이 재면 그 **빌드 잡음이 곧 '차이'로 잡혀**
        //   재질을 하나도 안 바꾼 HEAD 에서 goblin·wolf 가 몸만 차이 **77.2%** 를 찍었다
        //   (같은 판에서 imp 는 1.9% — 값이 종마다 튀는 게 잡음이라는 증거다).
        //   시드를 고정하면 몸 파츠는 isBoss 분기 **앞**에서 같은 난수로 지어지므로,
        //   남는 차이는 정확히 '보스 처리가 만든 것'뿐이다.
        let rs = 0x1234567 >>> 0;
        Math.random = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100, isBoss: isBoss, kind: kind };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.y = 0; m.g.userData.landed = true;
        m.g.position.x = e.x + Scene3D.worldX;
        if (kind === 'wolf') m.g.rotation.y = -1.15;
        // 🚨 크기 정규화 — 이걸 빼면 실루엣이 통째로 어긋나 '몸이 다르다'가 100% 로 나온다.
        m.g.scale.setScalar(1);
        if (m.hpG) m.hpG.visible = false;
        // 접지 블롭·실그림자는 몸이 아니다 — 켜 두면 관이 만든 그림자 차이가 '몸 차이'로 샌다
        if (m.blob) m.blob.visible = false;
        m.g.traverse(o => { if (o.isMesh) o.castShadow = false; });
        let reg = [];
        m.g.traverse(o => { if (o.isMesh && o.userData.bossRegalia) reg.push(o); });
        if (hideRegalia) reg.forEach(o => { o.visible = false; });
        // 소품·그림자가 배경에서 흔들리면 차분에 섞인다 — 근처만 숨긴다.
        for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
            if (Math.abs(o.position.x - m.g.position.x) < 7) o.visible = false;
        }
        m.g.updateMatrixWorld(true);
        return { px: grab(), nReg: reg.length };
    };
    // 🚨 **분모는 화면 전체가 아니라 그 생물의 실루엣이다.** 크기를 1 로 정규화하면 적이 화면의
    //   1~2% 밖에 안 덮어서, 화면 기준으로 재면 몸이 **통째로** 바뀌어도 1% 미만으로 찍힌다
    //   (실제로 첫 판에서 그렇게 나와 기준선 6% 를 못 넘었다 — 코드가 아니라 자가 틀린 경우다).
    //   실루엣은 **적을 아예 안 세운 화면**과의 차분으로 구한다(색 임계 추측 금지).
    const changed = (a, b) => {
        let n = 0;
        for (let i = 0; i < a.length; i += 4) {
            const d = Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
            if (d > ${DTH}) n++;
        }
        return n;
    };
    Scene3D.clearEnemies();
    for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
        if (Math.abs(o.position.x - (Combat.MELEE_X + 0.6 + Scene3D.worldX)) < 7) o.visible = false;
    }
    const empty = grab();
    const normal = shot(false, false);
    const bossAll = shot(true, false);
    const bossBody = shot(true, true);
    const sil = changed(empty, normal.px) || 1;      // 일반 적의 화면 점유 화소 = 분모
    return {
        sil,
        withReg: 100 * changed(normal.px, bossAll.px) / sil,
        bodyOnly: 100 * changed(normal.px, bossBody.px) / sil,
        nReg: bossAll.nReg,
    };
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.renderer && Scene3D.heroG, null, { timeout: 120000 });
    await page.waitForTimeout(1200);

    // 🚨 **종은 `?enemy=` 로만 고른다.** 적 객체에 `kind` 를 넣어도 무시된다 — `monsterMesh` 는
    //   `kinds[(e.id + S.chapter*2) % 7]` 로 정한다(그 필드는 읽지도 않는다). 처음에 `kind` 를
    //   넣어 두고 7종을 다 쟀다고 믿었는데 **실루엣 화소가 네 종에서 1709 로 똑같이 나와서** 알았다
    //   — 같은 종을 일곱 번 잰 것이었다. 문서화된 디버그 훅(`?enemy=`)이 유일하게 안전한 길이다.
    const rows = [];
    for (const k of KINDS) {
        await page.goto(INDEX + '?enemy=' + k, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.renderer && Scene3D.heroG, null, { timeout: 120000 });
        await page.waitForTimeout(900);
        rows.push({ k, ...(await page.evaluate(new Function('return ' + INPAGE)(), k)) });
    }
    await page.close(); await browser.close();

    console.log('\n===== 보스 정체성 — 같은 종 일반 적과의 화소 차이 (크기 정규화) =====');
    console.log(`문턱 RGB합 ${DTH} · '몸만'은 레갈리아(userData.bossRegalia)를 숨기고 잰 값\n`);
    console.log('종        레갈리아수  실루엣px   관포함 차이%   몸만 차이%   ← 차이%의 분모는 실루엣');
    const bad = [];
    for (const r of rows) {
        console.log(`${r.k.padEnd(10)} ${String(r.nReg).padStart(8)} ${String(r.sil).padStart(9)} ${r.withReg.toFixed(1).padStart(13)} ${r.bodyOnly.toFixed(1).padStart(12)}`);
        if (r.bodyOnly < GATE_BODY) bad.push(`${r.k} 몸만 차이 ${r.bodyOnly.toFixed(2)}%`);
    }
    console.log(`\n참고선 몸만 차이 ≥${GATE_BODY}%`);
    for (const b of bad) console.log('  ✗ ' + b);
    console.log(bad.length ? `❌ ${bad.length}종 — 보스의 정체성이 얹은 장신구뿐이다(몸은 일반과 같다)`
        : '✅ 보스 몸 자체가 일반과 다르게 읽힌다');
    console.log(`콘솔 에러 ${errs.length}건`);
    if (errs.length) errs.slice(0, 5).forEach(e => console.log('  ' + e));
    process.exit(bad.length || errs.length ? 1 : 0);
})();
