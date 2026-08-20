// 근접 앵글에서 **스커트 밑단과 안장 사이 구간이 화면에서 무엇으로 읽히는가**.
// 사용: node probe-ride-seat.js [탈것이름]      (기본 Brown Horse)
//
// 왜 필요한가: 이 자리의 살구색 덩어리를 비평가가 세 번(2026-08-17 2인, 08-18 2인) 독립적으로
//   "갑옷 밑 맨살 프리미티브 노출 / 즉시 QA 리젝"으로 읽었다. 실제 소속은 **안장 부속**인데,
//   ⑴ 소스만 보면 "안장이니 괜찮다"고 넘기게 되고 ⑵ 크롭 색만 보면 "맨살이다"라고 잘못 고치게 된다.
//   둘 다 틀린다. 판정해야 하는 것은 **화면에 렌더된 색이 같은 프레임의 살색과 구분되는가** 하나뿐이다.
//   (램버트 + ACES 라 재질 0x4e342e 같은 진갈색도 정면광 구간에서 rgb(168,139,118)까지 밝아진다.)
//
// 판정(세 갈래 가드):
//   ①-재질 안장 칸의 **albedo 가 영웅 살색 재질과 같은 계열이면** 그 자체로 결함이다(맨살 프리미티브).
//            조명과 무관해 프레임 노이즈에 안 흔들린다 — 아래 🚨 의 실측이 이 가드를 만든 이유다.
//   ①-화면 안장 칸이 **영웅 얼굴색과 색거리 60 미만이면서 동시에 살처럼 웜한 색조**일 때 결함이다.
//            (색거리만으로는 못 가른다 — 아래 🚨. 웜 조건이 있어야 '맨살로 읽힌다'가 된다.
//             이 축은 이미시브·반투명·클리핑용 보조 그물이다 — 아래 대조표 🚨 를 반드시 읽을 것.)
//   ②        안장 칸 **평균 휘도 40 이상** — 살색을 피하려고 무작정 내리면 그림자 구멍이 된다.
//
// 🚨 **색거리 하나로 ①을 재던 옛 판정은 실제로 뒤집혀 있었다 (2026-08-20 3D 스트림이 A/B 로 확정,
//    `ride-seat-flat-chrome`).** 호버보드에서 이 자가 빨갛길래 양성 대조군을 만들어 봤다 — 데크 재질을
//    **진짜 살색 `f2c9a4` 로 통째로 갈아끼우고** 같은 자로 쟀더니 최소 색거리가 **55**, 그대로 둔
//    회색 데크(`d6d6d6`)는 **32** 였다. 즉 **자가 회색을 진짜 살보다 더 살 같다고 순위 매겼다.**
//    원인: 플랫 계열의 안장 칸은 라이더가 **딛고 서는 넓은 윗면**이라 프레임마다 하늘빛/자기 그림자를
//    크게 타서(휘도 71↔186) 색거리가 **재질이 아니라 셰이딩 노이즈**를 인쇄한다. 그 구간에서는
//    임계값을 어떻게 옮겨도 두 경우가 안 갈린다 — 그래서 **재질 축(①-재질)을 따로 세우고**, 화면 축은
//    **웜 조건**을 달아 무채색 금속을 배제했다. 실측: 살색 데크는 프레임별 웜(R−B) 이 −9~+28 로
//    **화면색만 보면 살로 안 읽히는 프레임이 6개 중 4개** 였다 — 화면 축 하나로는 원래 못 잡는다.
// 🚨 **살색 기준을 '머리로 쏜 레이의 화면색'으로 잡던 것도 같이 고쳤다.** 같은 실측에서 그 레이가
//    호버보드에서는 살(`f2c9a4`)을, 브라운 호스에서는 **투구 흰색(`ffffff`)** 을 맞았다. 흰색이 기준이
//    되면 '살색 = 흰색'이라 **밝은 무채색이면 뭐든 맨살**이 된다. 이제 기준 albedo 는 `heroRig.skinMat`
//    에서 직접 읽고(고정), 화면 축의 밝기 정규화에만 머리 표본을 쓴다.
// 🔬 **자가검증 훅**: `SEAT_FORCE_DECK=f2c9a4 node probe-ride-seat.js "Hover Board"` 로 마운트 재질을
//    통째로 그 색으로 갈아끼워 돌릴 수 있다. 이 자를 고칠 때는 **양성 대조군이 FAIL 로 남는지** 반드시
//    확인할 것. 아래가 2026-08-20 에 실제로 돌린 **7건 대조표**(전부 이 훅으로 재현된다):
//      A  Hover Board 손 안 댐            → PASS  (재질 없음 · 화면 없음 · 참고 색거리 36)
//      B  Hover Board  f2c9a4(진짜 살색)  → **FAIL — 재질 축이 잡음**(화면 축은 못 잡았다)
//      C  Hover Board  4e342e(진갈색)     → PASS  (참고 색거리 115 — 옛 자도 통과시켰을 값)
//      F  Hover Board  f0e0d0(아이보리)   → PASS  (화면 rgb(163,166,168) — **차가운 회색으로 렌더된다**)
//      D  Brown Horse 손 안 댐            → PASS  (참고 색거리 182)
//      E  Brown Horse  f2c9a4(진짜 살색)  → **FAIL — 재질 축이 잡음.** 🚨 **옛 자는 이걸 통과시켰다**
//                                            (색거리 124 ≫ 60). 즉 이 변경은 자를 느슨하게 한 게 아니라
//                                            **옛 자가 놓치던 진짜 맨살 회귀를 새로 잡게** 만든 것이다.
//      G  Brown Horse  f0e0d0(아이보리)   → PASS  (색거리 107 — 안장 포켓은 늘 얼굴보다 훨씬 어둡다)
// 🚨 **대조표가 말하는 것: 화면 축(①-화면)은 7건 전부에서 한 번도 발화하지 않았다.** 이건 버그가 아니라
//    **램버트의 구조**다 — 렌더색 = albedo ⊗ 조명이고 albedo 는 레이캐스트로 **이미 정확히 알고 있으므로**,
//    렌더색은 albedo 에 대해 추가 정보를 주지 않는다(둘은 수학적으로 같은 축이다). 그래서 화면 축은
//    **곱셈 모델이 깨지는 경우에만** 의미가 있다 — 이미시브·반투명 블렌딩·톤매핑 클리핑. 그 셋을 위해
//    남겨 두되, **평범한 불투명 재질에서 화면 축이 조용한 것을 "자가 안 돈다"고 오해하지 말 것.**
//    ⚠️ 반대로 **화면 축을 되살리겠다고 색거리 임계값을 올리지 말 것** — 위 A 가 보여 주듯 플랫 계열의
//    데크는 하늘빛을 정면으로 받아 **아이보리(f0e0d0)조차 차가운 회색으로 렌더된다.** 임계값을 올리면
//    잡히는 건 맨살이 아니라 **밝은 무채색 금속 전부**다(= 이 항목이 원래 빨갰던 그 오검출).
// ⚠️ 페이지의 자체 rAF 루프가 계속 돌아 프레임마다 조명·포즈가 달라진다. 한 프레임만 재면 같은
//    코드가 PASS/FAIL 을 오간다(실측으로 확인). **여러 프레임을 재서 최악값**으로 판정한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Brown Horse';
const FORCE_DECK = process.env.SEAT_FORCE_DECK || '';   // 자가검증용 — 위 🔬 주석
const FRAMES = 6;
// ── ①-화면 축의 두 상수 — **반드시 짝으로만 움직인다** ────────────────────────────────────
// 판정식은 `round(원거리 × NORM_REF / 얼굴휘도) < NEAR_T` 인데, 이건 대수적으로
//   **원거리 / 얼굴휘도 < NEAR_T / NORM_REF**  와 같다.
// 즉 판정에 들어가는 건 두 상수의 **비율(현재 60/155 = 0.387)** 뿐이고, 각각의 절대값은
// 인쇄되는 숫자의 단위만 정한다. 🚨 **그래서 `NORM_REF` 만 바꾸면 게이트가 통째로 움직인다** —
// 예컨대 "요즘 얼굴 휘도는 230 이더라"며 155→230 으로만 고치면 비율이 0.387→0.261 로 떨어져
// **모든 탈것의 살색 가드가 3분의 1 느슨해진다.** 단위만 바로잡고 싶다면 둘을 **같은 배율로**
// 올릴 것(155·60 → 230·89 는 판정이 동일하다).
// 🚨 **실측(2026-08-20, `ride-seat-face-norm`) — 이 정규화는 지금 사실상 죽어 있다.** 챕터 7종을
//    가장 밝은 맵부터 가장 어두운 맵까지 훑어 얼굴 표본 휘도를 쟀더니(Brown Horse, 챕터당 2프레임):
//      ch1 초원 224~231 · ch4 폭풍 230~241 · ch5 밤숲 208~247 · ch8 심해 225~240 ·
//      ch9 용암 237~239 · ch14 소금사막 226~236 · ch23 심연 224~246   → **전체 208~247**
//    **밤 챕터가 낮 챕터보다 낮지도 않다.** 이유: 머리로 쏜 레이가 맞는 건 **투구 흰색(`ffffff`)** 인데
//    흰색은 어느 조명에서도 톤매핑 어깨에서 **클리핑**돼 거의 같은 값으로 렌더된다. 즉 이 기준은
//    '프레임 밝기'가 아니라 **거의 상수**를 재고 있다. 따라서 ⑴ `norm` 은 프레임별 보정이 아니라
//    **고정 배율 ≈0.66** 이고 ⑵ `fl < 60` 무효 프레임 가드도 사실상 절대 안 걸린다.
//    👉 결과적으로 화면 축의 게이트는 '장면 밝기 대비'가 아니라 **원거리 91 안팎의 고정 임계**다.
//    ⚠️ 그래도 **상수를 건드리지 않았다** — 위에서 보듯 한쪽만 움직이면 게이트가 통째로 이동하고,
//    양쪽을 같이 움직이면 판정이 완전히 동일하다(순수 표기 변경). 게다가 화면 축은 파일 머리
//    대조표대로 **7건 전부에서 한 번도 발화하지 않는 보조 그물**이라, 이 축의 보정을 정교하게
//    만드는 일의 실익이 낮다. **지금 필요한 건 숫자가 거짓말을 안 하는 것**이라 아래 판정 출력에
//    **정규화 전 원거리를 함께 인쇄**하는 것으로 갈음했다.
//    📌 이 정규화를 진짜로 살리려면 기준을 **클리핑되지 않는 표면**(예: 중간 회색 프롭)으로 바꿔야
//    한다 — 그건 이 자 하나가 아니라 화면색을 쓰는 프로브 전반의 문제라 별도 항목감이다.
const NORM_REF = 155;   // 정규화 기준 휘도 — NEAR_T 와 짝
const NEAR_T = 60;      // '살색에 가깝다' 임계 — NORM_REF 와 짝
const DXS = [-0.18, -0.09, 0, 0.09, 0.18];
const DYS = [-0.02, -0.07, -0.12];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    // 셋업: 탈것을 태우고 shot-ride-pets 의 near 앵글과 같은 카메라를 세운다(camLock 훅).
    await page.evaluate(([name, forceDeck]) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        Scene3D.refreshMount();
        // 자가검증 훅 — 마운트 재질을 통째로 강제색으로 (공유 인스턴스라 clone 후 칠한다).
        if (forceDeck) {
            const done = new Map();
            Scene3D.mountGroup.traverse(o => {
                if (!o.isMesh || !o.material || !o.material.color) return;
                let m = done.get(o.material.uuid);
                if (!m) { m = o.material.clone(); m.color.set('#' + forceDeck); done.set(o.material.uuid, m); }
                o.material = m;
            });
        }
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const hero = Scene3D.heroG;
        Scene3D.camLock = {
            pos: new THREE.Vector3(hero.position.x, hero.position.y + 1.7, 3.4),
            look: new THREE.Vector3(hero.position.x, hero.position.y + 0.95, 0),
        };
        for (let i = 0; i < 3; i++) Scene3D.update(1 / 60);
    }, [NAME, FORCE_DECK]);

    // 한 프레임 측정: 소속(레이캐스트) + 화면 픽셀 좌표를 뽑고, 스크린샷을 떠서 색을 읽는다.
    const measure = async () => {
        const geo = await page.evaluate(() => {
            const rig = Scene3D.heroRig, hero = Scene3D.heroG, mg = Scene3D.mountGroup;
            hero.updateWorldMatrix(true, true); mg.updateWorldMatrix(true, true);
            const cam = new THREE.Vector3(hero.position.x, hero.position.y + 1.7, 3.4);
            const pelvis = rig.bones.pelvis;
            pelvis.updateWorldMatrix(true, true);
            const pw = pelvis.getWorldPosition(new THREE.Vector3());
            const hemY = pw.y - Scene3D.heroSeatDropY();          // 스커트 밑단 = 안장 윗면
            // ⚠️ three r128 의 Raycaster 는 조상의 visible 을 안 본다 — 렌더 안 되는 레거시 메시가
            //    잡힌다(probe-ride-thigh 에서 실제로 유령 히트를 냈다). 조상까지 훑는다.
            const shown = o => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
            const seat = new Set((rig.seatParts || []).map(m => m.uuid));
            const ray = new THREE.Raycaster();
            const camObj = Scene3D.camera;
            camObj.updateMatrixWorld(true);
            const rect = Scene3D.renderer.domElement.getBoundingClientRect();
            const toPx = (v) => {
                const p = v.clone().project(camObj);
                return [Math.round(rect.left + (p.x * 0.5 + 0.5) * rect.width),
                        Math.round(rect.top + (-p.y * 0.5 + 0.5) * rect.height)];
            };
            const rows = [];
            for (const dy of [-0.02, -0.07, -0.12]) for (const dx of [-0.18, -0.09, 0, 0.09, 0.18]) {
                const target = new THREE.Vector3(pw.x + dx, hemY + dy, pw.z + 0.06);
                ray.set(cam, target.clone().sub(cam).normalize());
                const hit = ray.intersectObjects([hero, mg], true).filter(h => shown(h.object))[0];
                let who = '(빈 배경)', col = '-';
                // ⚠️ 표적점은 표면 **뒤쪽**에 있다 — 그걸 그대로 투영하면 픽셀이 실루엣 가장자리로 밀려
                //    5×5 평균에 배경이 섞인다(바깥 칸이 rgb(151,146,118) 처럼 회백으로 뜨던 원인).
                //    실제로 보이는 표면인 **레이 히트점**을 투영해야 그 재질의 색이 잡힌다.
                const pxAt = hit ? hit.point : target;
                if (hit) {
                    who = 'other';
                    for (let o = hit.object; o; o = o.parent) {
                        if (seat.has(o.uuid)) { who = 'skirt'; break; }
                        if (o === mg) { who = 'mount'; break; }
                        if (o === hero) { who = 'hero'; break; }
                    }
                    const m = hit.object.material;
                    col = m && m.color ? m.color.getHexString() : '-';
                }
                rows.push({ dx, dy, who, col, px: toPx(pxAt) });
            }
            // 살색 기준점 — 머리 중심에서 z 를 더한 자리를 그냥 투영했더니 **지오메트리 안쪽이나 가려진
            // 자리**가 잡혀 프레임 절반이 암부 rgb(8,14,14) 로 나왔다(비행형에서 6프레임 중 5프레임 무효).
            // 카메라에서 머리로 레이를 쏘아 **실제로 화면에 보이는 첫 표면**을 기준으로 삼는다.
            const headBone = rig.bones.head || rig.headMount;
            let facePx = null;
            if (headBone) {
                const hp = headBone.getWorldPosition(new THREE.Vector3());
                ray.set(cam, hp.clone().sub(cam).normalize());
                const fh = ray.intersectObjects([hero], true).filter(h => shown(h.object))[0];
                facePx = toPx(fh ? fh.point : hp);
            }
            // 🔑 살색 **기준 albedo** — 화면색이 아니라 재질에서 직접 읽는다(위 🚨 두 번째).
            //    `skinMat` 이 없으면(모델이 바뀌었다면) null 을 올려 보내 판정 불가로 떨어뜨린다 —
            //    조용히 옛 하드코딩으로 되돌아가면 그때부터 자가 거짓말을 시작한다.
            const sm = rig.skinMat;
            const skin = sm && sm.color
                ? [Math.round(sm.color.r * 255), Math.round(sm.color.g * 255), Math.round(sm.color.b * 255)]
                : null;
            return { rows, facePx, skin };
        });

        const shot = await page.screenshot();
        const p2 = await browser.newPage();
        await p2.setContent('<canvas id=c></canvas>');
        const sampled = await p2.evaluate(async ([src, px, facePx]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const c = document.getElementById('c');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const data = g.getImageData(0, 0, c.width, c.height).data;
            // 한 점만 찍으면 스펙큘러 하이라이트 한 픽셀에 판정이 끌려간다 — 5×5 평균으로 읽는다.
            const at = (p) => {
                if (!p) return null;
                let r = 0, gg = 0, b = 0, n = 0;
                for (let y = p[1] - 2; y <= p[1] + 2; y++) for (let x = p[0] - 2; x <= p[0] + 2; x++) {
                    if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
                    const i = (y * c.width + x) * 4;
                    r += data[i]; gg += data[i + 1]; b += data[i + 2]; n++;
                }
                return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null;
            };
            return { cells: px.map(at), face: at(facePx) };
        }, ['data:image/png;base64,' + shot.toString('base64'), geo.rows.map(r => r.px), geo.facePx]);
        await p2.close();
        return { rows: geo.rows, cells: sampled.cells, face: sampled.face, skin: geo.skin };
    };

    const dist = (a, b) => (a && b) ? Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])) : 999;
    const lum = c => c ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : 0;
    const warm = c => c ? c[0] - c[2] : 0;                       // R−B = 살의 웜 바이어스
    const hex2rgb = h => /^[0-9a-f]{6}$/i.test(h) ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null;
    // 화면색이 '살처럼 웜한가' — 무채색 금속(크롬 데크: R−B 가 −17~+18 로 흔들리고 최대 채널이 G/B)을
    // 배제한다. 살은 어떤 조명에서도 **R 이 최대 채널이고 R−B 가 뚜렷하다**(실측 얼굴 표본 +10~+21).
    const readsWarm = c => c && c[0] === Math.max(c[0], c[1], c[2]) && warm(c) >= 12;

    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
        frames.push(await measure());
        await page.evaluate(() => { for (let i = 0; i < 24; i++) Scene3D.update(1 / 60); });
    }

    // 재질 albedo 가 살 계열인가 — **거리만으로는 못 가른다.** 일반 등급색 `d6d6d6` 은 살색 `f2c9a4`
    // 와 albedo 거리가 59 라 거리 기준 하나면 무채색 흰 데크가 '맨살'이 된다. 살의 정체는 밝기가 아니라
    // **웜 바이어스**(f2c9a4 는 R−B=78, d6d6d6 은 0)라 두 축을 함께 요구한다.
    const skinAlbedo = frames.map(f => f.skin).find(Boolean) || null;
    const isSkinAlbedo = hexStr => {
        const a = hex2rgb(hexStr);
        if (!a || !skinAlbedo) return false;
        return dist(a, skinAlbedo) < 70 && Math.abs(warm(a) - warm(skinAlbedo)) < 40;
    };

    console.log(`[${NAME}] 스커트 밑단(=안장 윗면) 아래 구간 — 소속(레이캐스트) + 화면색, ${FRAMES}프레임 최악값 판정\n`);
    const f0 = frames[0];
    console.log('   Δy      x=-0.18   x=-0.09    x=0      x=+0.09   x=+0.18');
    for (const dy of DYS) {
        const cells = f0.rows.filter(r => r.dy === dy).map(r => `${r.who}:${r.col}`.padEnd(10));
        console.log(`  ${String(dy).padStart(5)}   ${cells.join('')}`);
    }

    // 프레임별 최악값 — 안장 칸이 살색에 가장 가까웠던 순간과, 가장 어두웠던 순간.
    let worstD = 999, worstAt = '', worstLum = 999, skipped = 0;
    let warmD = 999, warmAt = '';            // ①-화면: 색거리가 가깝고 웜하기까지 한 최악 칸
    let rawD = 999, rawAt = '';              // 정규화 **전** 실제 화면 색거리(진단 정직성용 — 아래 🚨)
    const skinMatHits = new Set();           // ①-재질: albedo 가 살 계열인 칸
    for (const fr of frames) {
        const seatIdx = fr.rows.map((r, i) => r.who === 'mount' ? i : -1).filter(i => i >= 0);
        // ⚠️ **기준(얼굴)이 무효인 프레임은 살색 판정에서 뺀다.** 비행형에서 얼굴 표본이 rgb(8,14,14)로
        //    잡힌 프레임이 나왔는데(머리가 순간 프레임 밖/암부), 그러면 새까만 안장과의 색거리가 18이
        //    나와 **멀쩡한 안장이 "맨살"로 FAIL** 한다. 살색 기준은 최소한 살색만큼은 밝아야 한다.
        // ⚠️ 색거리는 **프레임 밝기에 비례해 줄어든다** — 어두운 프레임에서는 서로 다른 재질끼리도
        //    거리가 작게 나온다(비행형 어두운 프레임: 안장 rgb(89,83,57) vs 얼굴 rgb(101,103,87) = 38).
        //    그대로 재면 '어두워서 FAIL' 이 되므로 **기준(얼굴) 휘도로 정규화**해 밝은 프레임과 같은
        //    잣대로 만든다(155 = 정상 조명에서 실측된 얼굴 휘도).
        const fl = lum(fr.face);
        const norm = NORM_REF / Math.max(60, fl);
        if (fl < 60) { skipped++; }
        else for (const i of seatIdx) {
            const raw = dist(fr.cells[i], fr.face);
            const d = Math.round(raw * norm);
            if (raw < rawD) { rawD = raw; rawAt = `얼굴휘도 ${Math.round(fl)}`; }
            // ①-재질: albedo 가 살 계열이면 프레임과 무관하게 결함으로 적재한다.
            if (isSkinAlbedo(fr.rows[i].col)) skinMatHits.add(`Δy${fr.rows[i].dy} x${fr.rows[i].dx} albedo #${fr.rows[i].col}`);
            // ①-화면: 색거리가 가깝고 **동시에** 살처럼 웜할 때만 '맨살로 읽힌다'로 센다.
            //    웜하지 않은 칸도 최소 색거리는 참고용으로 계속 인쇄한다(자를 못 보게 하지 않는다).
            if (d < worstD) { worstD = d; worstAt = `Δy${fr.rows[i].dy} x${fr.rows[i].dx} 화면 rgb(${(fr.cells[i] || []).join(',')}) vs 얼굴 rgb(${(fr.face || []).join(',')})`; }
            if (d < NEAR_T && readsWarm(fr.cells[i])) {
                if (d < warmD) { warmD = d; warmAt = `Δy${fr.rows[i].dy} x${fr.rows[i].dx} 화면 rgb(${(fr.cells[i] || []).join(',')}) R−B=${warm(fr.cells[i])} vs 얼굴 rgb(${(fr.face || []).join(',')})`; }
            }
        }
        if (seatIdx.length) {
            const ml = Math.round(seatIdx.reduce((a, i) => a + lum(fr.cells[i]), 0) / seatIdx.length);
            // ⚠️ 휘도는 **가장 밝았던 프레임**으로 본다. 최저값으로 잡으면 영웅 몸이 안장에 그림자를
            //    드리운 순간이 걸려 멀쩡한 안장도 FAIL 이 된다(실측: 같은 코드에서 33 ↔ 67).
            //    '어둠에 묻혔다'가 결함인 것은 **어느 순간에도 안 밝아질 때**다.
            worstLum = worstLum === 999 ? ml : Math.max(worstLum, ml);
        }
    }
    const valid = FRAMES - skipped;
    const noSkinRef = !skinAlbedo;
    console.log(`\n살색 기준 albedo(heroRig.skinMat) = ${skinAlbedo ? `rgb(${skinAlbedo.join(',')}) R−B=${warm(skinAlbedo)}` : '**못 읽었다**'}`);
    console.log(`①-재질 안장 칸 albedo 가 살 계열인 칸: ${skinMatHits.size ? [...skinMatHits].join(' · ') : '없음'}`);
    console.log(`①-화면 색거리<60 **이면서** 살처럼 웜한 칸: ${warmD < 999 ? `있다(색거리 ${warmD}) — ${warmAt}` : '없음'}`);
    console.log(`   (참고) 웜 조건 무시한 최소 색거리 ${worstD} — 유효 프레임 ${valid}/${FRAMES}${skipped ? ` (얼굴 기준이 암부로 잡힌 ${skipped}프레임 제외)` : ''} · 최악 지점 ${worstAt}`);
    // 🚨 위 '색거리'는 NORM_REF(=${NORM_REF}) 로 정규화된 값이라 **화면에서 실제로 잰 거리가 아니다.**
    //    그 숫자만 보고 임계값을 옮기지 않도록 정규화 전 원거리를 나란히 인쇄한다(파일 머리 🔬 참조).
    console.log(`   (참고) **정규화 전** 실제 화면 최소 색거리 ${rawD}${rawAt ? ` (그때 ${rawAt})` : ''} — 판정은 '원거리/얼굴휘도 < ${(NEAR_T / NORM_REF).toFixed(3)}' 로 하며, 위 정규화 값은 그 비율을 ${NORM_REF} 단위로 옮겨 적은 것이다`);
    console.log(`② 안장 칸 **최고 평균 휘도 ${worstLum}** (하한 40 — 이보다 어두우면 그림자 구멍으로 읽힌다)`);
    const bad = (valid === 0 ? 1 : 0) + (noSkinRef ? 1 : 0) + (skinMatHits.size ? 1 : 0) + (warmD < 999 ? 1 : 0) + (worstLum < 40 ? 1 : 0);
    console.log(`\n판정: ${bad ? 'FAIL' : 'PASS'}`
        + (valid === 0 ? ' — 유효 프레임 0(얼굴 기준을 못 잡았다, 판정 불가)' : '')
        + (noSkinRef ? ' — heroRig.skinMat 을 못 읽었다(기준 없음, 판정 불가)' : '')
        + (skinMatHits.size ? ' — 안장 자리에 살색 재질이 있다' : '')
        + (warmD < 999 ? ' — 안장이 맨살로 읽힌다' : '')
        + (worstLum < 40 ? ' — 안장이 어둠에 묻혔다' : ''));
    console.log('※ 소속이 mount 여도 재질이나 화면색이 살이면 결함이다. 반대로 소속만 보고 "안장이니 괜찮다"고 넘기지도 말 것.');
    console.log('※ 색거리 하나만 보고 임계값을 옮기지 말 것 — 파일 머리 🚨 의 A/B(회색 32 < 진짜 살 55)를 먼저 읽어라.');
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
