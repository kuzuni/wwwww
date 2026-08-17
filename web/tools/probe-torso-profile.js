// 몸통 실루엣 폭 프로파일 — 비평가 1위 결함 "몸통이 이목구비 없는 달걀, 허리가 없어 눈사람 스택"의
// 유일한 객관 지표. 영웅을 숨긴 프레임과 차분해 캐릭터 마스크를 만들고, 스캔라인마다 마스크 폭을 재
// ① 가장 넓은 지점이 배(중간)인지 가슴(상단 1/3)인지 ② 허리/가슴 폭 비 ③ 어깨선이 수평인지를 낸다.
//
// ⚠️ 반드시 포즈를 고정한다 — Idle 모션이 돌면 팔·망토가 매 프레임 폭을 바꿔 같은 코드로도 값이 흔들린다
//    (probe-shield.js가 같은 함정에 빠졌던 기록: 0~1576px). ProChar.update를 끊고 _t=0으로 고정.
// ⚠️ 팔·망토·방패·검은 몸통 폭이 아니다 — 정면 프레임에서 팔이 몸통 옆에 붙어 폭에 섞이므로
//    측정 전에 arms/cape/shield/weapon 그룹을 숨겨 '몸통 코어'만 남긴다.
//
// 사용: node probe-torso-profile.js [side]
// ⚠️ `side` 인자를 주면 카메라를 옆으로 90° 돌려 **깊이(앞뒤) 프로파일**을 잰다. 정면 프로파일이
//    통과해도 측면이 균일 깊이면 몸통은 여전히 달걀이다(비평가 잔여 지적 ⓔ "측면이 균일 깊이 달걀").
//    측면 모드에서 'w'로 찍히는 값은 폭이 아니라 **깊이**이고, 허리÷가슴도 깊이 비다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const SIDE = process.argv.slice(2).includes('side');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate((SIDE) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};                                   // 포즈 고정 (결정성)
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        // 몸통 코어만 남기기 — 팔/망토/방패/무기는 폭 측정 오염원
        const hidden = [];
        const hide = o => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
        if (R.arms) for (const a of R.arms) hide(a.shoulder);
        hide(R.bones && R.bones.cape);
        hide(R.shield);
        hide(Scene3D.weaponG);
        // 다리·머리도 숨긴다 — 다리 벌림이 하단 폭을, 두상·머리카락이 상단 폭을 대신 채워
        // 몸통 라테의 실제 프로파일을 가린다(첫 측정에서 최대폭이 어깨 높이로 잘못 잡혔던 원인).
        if (R.legs) for (const l of R.legs) hide(l.hip);
        hide(R.bones && R.bones.neck);
        Scene3D.heroG.updateMatrixWorld(true);

        // 정면 카메라 — 몸통을 화면 세로에 꽉 채운다 (camLock: 렌더 루프가 카메라를 되돌리므로 필수)
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        // 측면 모드: 시선 방향을 y축으로 90° 돌린다(정면 벡터의 수평 수직축) — 같은 거리·같은 높이라
        // 정면/측면 수치를 그대로 비교할 수 있다.
        if (SIDE) fwd.set(-fwd.z, fwd.y, fwd.x);
        const dist = Math.max(size.x, size.y, size.z) * 1.25 + 0.3;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() }; // 수평 시선 — 원근 왜곡 없이 폭만
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        // ⚠️ '영웅 숨긴 프레임과 차분'하는 방식은 이 측정에 쓸 수 없다 — 허리를 만드는 벨트가
        //    니어블랙(deepHide)이라 어두운 나무 앞에서는 색차가 임계값 아래로 떨어져 허리 행이
        //    통째로 마스크에서 빠진다(실측: 허리 폭이 12px로 찍혔다). 대신 **지형·소품을 모두 숨기고
        //    평면 마젠타 배경에 몸통만 렌더**해 배경색과 다른 픽셀을 마스크로 쓴다. 어떤 albedo에도
        //    안전하고 그림자·안개 오염도 없다.
        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        for (const c of Scene3D.scene.children) if (c !== Scene3D.heroG && !c.isLight) hide(c);
        const savedFog = Scene3D.scene.fog;
        Scene3D.scene.fog = null;
        const savedClear = new THREE.Color();
        Rr.getClearColor(savedClear);
        Rr.setClearColor(0xff00ff);
        Rr.render(Scene3D.scene, Scene3D.camera);
        const fg = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, fg);
        Rr.setClearColor(savedClear);
        Scene3D.scene.fog = savedFog;
        // readPixels는 아래에서 위로 — row 0 = 화면 최하단
        const widths = new Array(h).fill(0), lo = new Array(h).fill(-1), hi = new Array(h).fill(-1);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                // 마젠타(255,0,255)에서 벗어난 픽셀 = 몸통. 톤매핑을 거쳐도 G가 확실히 뜨므로 G로 판정
                if (!(fg[i] > 200 && fg[i + 1] < 60 && fg[i + 2] > 200)) { if (lo[y] < 0) lo[y] = x; hi[y] = x; widths[y]++; }
            }
        }
        for (const o of hidden) o.visible = true;

        const rows = [];
        for (let y = 0; y < h; y++) if (widths[y] > 0) rows.push(y);
        if (!rows.length) return { error: 'mask empty' };
        // 실루엣 폭은 좌우 극단 간격(hi-lo)으로 본다 — 내부 구멍(관절 틈)에 폭이 갉히지 않게
        const span = y => (lo[y] < 0 ? 0 : hi[y] - lo[y] + 1);
        // 다리·머리·팔을 숨긴 뒤의 마스크는 **몸통(스커트 밑단~고젯)** 그 자체다. 그래서 랜드마크를
        // 월드 좌표로 투영하지 않고 **몸통 정규 높이**(0 = 스커트 밑단 행, 1 = 고젯 최상단 행)로 쓴다.
        // 이게 전후 비교에 안전한 이유: 이번 수정은 라테의 **반지름만** 바꾸고 스커트 밑단·고젯의
        // **높이는 건드리지 않으므로** yBot/yTop 행이 고정돼 같은 분율이 같은 해부 위치를 가리킨다.
        // (반대로 캐릭터 전체 바운딩 박스로 정규화하면 팔·망토 가시성에 따라 기준이 흔들린다.)
        // ⚠️ 마스크에는 **지면에 드리운 캐릭터 그림자**도 섞인다 — 영웅을 숨기면 그림자도 사라지므로
        //    차분에 잡힌다. 몸통과 그림자 사이에는 빈 행이 있으므로 **폭>0인 최장 연속 구간**을
        //    몸통으로 잡는다(그림자 덩어리보다 몸통이 항상 더 높다).
        let bestA = rows[0], bestB = rows[0], curA = rows[0], prev = rows[0];
        for (const y of rows) {
            if (y - prev > 1) { if (prev - curA > bestB - bestA) { bestA = curA; bestB = prev; } curA = y; }
            prev = y;
        }
        if (prev - curA > bestB - bestA) { bestA = curA; bestB = prev; }
        const yBot = bestA, yTop = bestB, H = yTop - yBot;
        const frac = r => (r - yBot) / H;
        const rowOfFrac = f => Math.round(yBot + f * H);
        const at = f => { const r = rowOfFrac(f); return { f: +f.toFixed(3), w: span(r) }; };
        const scan = (f0, f1, cmp) => { // 구간 극값 + 그 위치
            let bw = cmp === 'max' ? -1 : 1e9, br = -1;
            for (let r = rowOfFrac(f0); r <= rowOfFrac(f1); r++) {
                const s = span(r); if (!s) continue;
                if (cmp === 'max' ? s > bw : s < bw) { bw = s; br = r; }
            }
            return { w: bw, f: +frac(br).toFixed(3) };
        };
        const waist = scan(0.20, 0.58, 'min');   // 허리 — 벨트 위 잘록해야 하는 구간
        const chest = scan(0.55, 0.95, 'max');   // 가슴 — 몸통 최대폭이 여기 있어야 한다
        // 어깨선 수평도 — 몸통 최상단 구간에서 행별 폭 변화가 작을수록 '수평 어깨'(달걀 수렴이면 커진다)
        let shMin = 1e9, shMax = 0, shN = 0;
        for (let r = rowOfFrac(0.86); r <= rowOfFrac(0.97); r++) { const s = span(r); if (!s) continue; shMin = Math.min(shMin, s); shMax = Math.max(shMax, s); shN++; }
        const samples = [];
        for (let i = 0; i <= 16; i++) samples.push(at(i / 16));
        // 실루엣 중심선 — 측면 모드에서 이게 수직 직선이면 앞뒤 대칭(=회전체 달걀)이다.
        // 라테는 정의상 회전체라 z 스케일을 높이별로 바꿔도 중심선은 그대로 직선이다. 즉 '측면 달걀'을
        // 깨는 유일한 방법은 높이별 z 오프셋(가슴 앞으로·허리 뒤로)이고, 그 효과는 이 지표에만 나타난다.
        const mid = f => { const r = rowOfFrac(f); return lo[r] < 0 ? null : (lo[r] + hi[r]) / 2; };
        const midS = [];
        for (let i = 0; i <= 16; i++) { const m = mid(i / 16); midS.push({ f: +(i / 16).toFixed(3), m: m === null ? null : +m.toFixed(1) }); }
        const mv = midS.map(s => s.m).filter(m => m !== null);
        const midSpread = mv.length ? +(Math.max(...mv) - Math.min(...mv)).toFixed(1) : null;
        return {
            px: { w, h }, trunk: { yBot, yTop, heightPx: H },
            waist, chest, hip: at(0.06),
            waistOverChest: null, shoulderFlatness: shN ? +((shMax - shMin) / shMax).toFixed(3) : null,
            samples, midS, midSpread,
        };
    }, SIDE);

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    out.waistOverChest = +(out.waist.w / out.chest.w).toFixed(3);
    const L = SIDE ? '깊이' : '폭';
    console.log('시점 :', SIDE ? '측면(깊이 프로파일)' : '정면(폭 프로파일)');
    console.log('canvas', JSON.stringify(out.px), '몸통 마스크', JSON.stringify(out.trunk));
    console.log('허리 최소' + L + ' :', out.waist.w + 'px @ 몸통분율 ' + out.waist.f);
    console.log('가슴 최대' + L + ' :', out.chest.w + 'px @ 몸통분율 ' + out.chest.f, '(가슴이면 ≥0.62, 배면 0.45~0.58)');
    console.log('허리÷가슴  :', out.waistOverChest, '(목표 ≤0.78 — 잘록한 허리. 1에 가까우면 달걀)');
    console.log('어깨선 비수평도 :', out.shoulderFlatness, '(작을수록 수평 어깨)');
    console.log(L + ' 프로파일(몸통분율:' + L + 'px)  0=스커트 밑단, 1=고젯');
    console.log('  ' + out.samples.map(s => s.f + ':' + s.w).join('  '));
    console.log('중심선 이동폭 :', out.midSpread + 'px', SIDE ? '(측면: 0에 가까우면 앞뒤 대칭 = 회전체 달걀. S자면 6px 이상)' : '(정면: 좌우 대칭이라 0 근처가 정상)');
    console.log('중심선(몸통분율:중심x px)');
    console.log('  ' + out.midS.map(s => s.f + ':' + s.m).join('  '));
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
