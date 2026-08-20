// 몸색 방향 결정용 대조 시트 (`creature-body-species-color` — 사용자 결정 재료).
// 그 항목은 "조형 작업이 아니라 기획 결정 … 사용자 확인이 필요한 자리"라 코드 착수가 금지돼 있고,
// 허용된 것은 **세 안을 같은 로스터에 입혀 나란히 놓은 대조 시트**뿐이다. 이 도구가 그것이다.
//   ⓐ 몸통=종색, 등급=부속(여기서는 바닥 링으로 대변 — 실제 구현은 테두리 광채/안장 트림 등)
//   ⓑ 몸통=종색, 등급=채도·명도 단계(등급이 오를수록 진하고 밝다)
//   ⓒ 현행 유지(몸통=등급색, 종색은 무늬·부속에만)
// 판 구성: ① 같은 등급(에픽) 5종 × ⓐⓑⓒ — "종이 갈리는가" ② 조랑말 1종 × 5등급 × ⓐⓑⓒ —
// "등급이 살아남는가". 두 질문에 대한 답이 곧 선택이다.
//
// ⚠️ **게임 코드는 한 줄도 안 바꾼다** — 몸통 재질(등급색 c · ±0.18 파생 light/dark)을 RGB 근접
//    매칭으로 걷어 그 자리에서만 색을 바꾼다. 시트가 곧 폐기 가능한 실험이다.
// 사용: node shot-mount-color-options.js   → tools/mount-color-options.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1240, height: 2100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof MOUNT_KR !== "undefined"');

    await page.evaluate(() => {
        // 5차 채점이 '한 덩어리로 수렴한다'고 지목한 네발짐승 무리에서 자연색 스펙트럼이 넓은 5종.
        const SPECIES = ['Pony', 'Pig', 'Goat', 'Camel', 'Elk'];
        // 종 자연색 — 결정용 근사값(확정 팔레트가 아니다. 채택되면 종별로 정식으로 잡는다).
        const SPC = { Pony: 0xc9a15e, Pig: 0xe8a79c, Goat: 0xd9d2c4, Camel: 0xc79b5b, Elk: 0x6b4a30 };
        const RARS = ['common', 'rare', 'epic', 'legendary', 'mythic'];
        const RI = { common: 0, rare: 1, epic: 2, legendary: 3, ultimate: 4, mythic: 4 };

        Scene3D.mountThumb('Pony', 'common');            // 렌더러 1회 초기화(조명 동기화 포함)
        const CELL = 205;
        Scene3D._creatureR.setSize(CELL, CELL);

        // 몸통 재질만 걷어 종색으로 — 등급색 c 와 ±0.18 파생(light/dark)에 RGB 근접한 재질이 몸통이다.
        // (고정 자연색 표식·각질·눈·마구는 거리가 멀어 안 걸린다 — 그게 이 매칭을 고른 이유다.)
        const applyVariant = (g, name, rar, mode) => {
            if (mode === 'c') return;
            const spc = new THREE.Color(SPC[name] || 0x999999), sh = {};
            spc.getHSL(sh);
            const c0 = new THREE.Color(RARITY_HEX[rar]);
            const refs = [[c0, 0], [c0.clone().offsetHSL(0, 0, -0.18), -0.18], [c0.clone().offsetHSL(0, 0, 0.18), 0.18]];
            const seen = new Set();
            g.traverse(o => {
                if (!o.isMesh || !o.material || !o.material.color || seen.has(o.material)) return;
                const m = o.material.color;
                for (const [rc, dl] of refs) {
                    if (Math.abs(m.r - rc.r) + Math.abs(m.g - rc.g) + Math.abs(m.b - rc.b) < 0.03) {
                        seen.add(o.material);
                        if (mode === 'a') m.setHSL(sh.h, sh.s, Math.max(0.06, Math.min(0.93, sh.l + dl)));
                        else m.setHSL(sh.h, Math.min(1, sh.s * (0.55 + 0.20 * RI[rar])),
                            Math.max(0.06, Math.min(0.93, (sh.l + dl) * (0.86 + 0.06 * RI[rar]))));
                        break;
                    }
                }
            });
            if (mode === 'a') {                          // 등급 신호를 부속으로 — 시트에서는 바닥 링이 대변
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.60, 0.032, 10, 40),
                    new THREE.MeshBasicMaterial({ color: RARITY_HEX[rar] }));
                ring.rotation.x = Math.PI / 2;
                ring.position.y = 0.015;
                g.add(ring);
            }
        };

        const shot = (name, rar, mode) => {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
            const g = new THREE.Group();
            g.rotation.y = 0.55;                          // 게임 앵글 — 색 판정은 실제 노출 각으로
            const m = Scene3D.makeMountMesh(name, rar);
            applyVariant(m, name, rar, mode);
            g.add(m);
            sc.add(g);
            Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            Scene3D._creatureR.render(sc, Scene3D._creatureCam);
            return Scene3D._creatureR.domElement.toDataURL();
        };

        const LAB = {
            a: 'ⓐ 몸통=종색 · 등급=부속(바닥 링으로 대변)',
            b: 'ⓑ 몸통=종색 · 등급=채도/명도 단계',
            c: 'ⓒ 현행(몸통=등급색 · 종색은 무늬만)'
        };
        const cell = (img, cap) => `<div style="margin:2px;text-align:center"><img src="${img}" style="width:${CELL}px;height:${CELL}px;background:#20242b;border-radius:8px"><div style="font:10px sans-serif;color:#9fb0c0">${cap}</div></div>`;
        const row = (mode, cells) => `<div style="display:flex;align-items:center"><div style="width:118px;font:11px sans-serif;color:#cfd8e3;padding:0 4px">${LAB[mode]}</div>${cells}</div>`;

        let html = `<div style="font:bold 14px sans-serif;color:#e8eef5;padding:6px 4px">① 같은 등급(에픽) 5종 — 종이 갈리는가</div>`;
        for (const mode of ['a', 'b', 'c'])
            html += row(mode, SPECIES.map(nm => cell(shot(nm, 'epic', mode), (MOUNT_KR[nm] || nm))).join(''));
        html += `<div style="font:bold 14px sans-serif;color:#e8eef5;padding:10px 4px 6px">② 조랑말 × 5등급 — 등급이 살아남는가</div>`;
        for (const mode of ['a', 'b', 'c'])
            html += row(mode, RARS.map(r => cell(shot('Pony', r, mode), r)).join(''));

        // body 를 갈아엎기 전에 게임 타이머를 끊는다 — 사라진 노드를 UI 주기 갱신이 잡아 가짜
        // 콘솔 에러를 뱉으면 진짜 회귀가 덮인다(shot-mount-species 와 같은 함정).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#11141a;padding:8px;width:1200px">${html}</div>`;
    });

    await page.locator('#sheet').screenshot({ path: path.join(__dirname, 'mount-color-options.png') });
    await browser.close();
    console.log(`→ tools/mount-color-options.png · 콘솔 에러 ${errors.length}건`);
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 240)));
})();
