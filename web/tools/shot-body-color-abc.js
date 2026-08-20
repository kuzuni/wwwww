// `creature-body-species-color` **결정 재료** 시트 — 코드(게임)는 한 줄도 바꾸지 않는다.
//
// 항목 본문이 못 박은 대로 몸 색은 '기획 결정'이라 자율 세션이 정하지 않는다. 대신 사용자가
// 그림 하나로 고를 수 있게, 같은 등급(epic) 5종을 세 안(현행 / ⓐ / ⓑ)으로 나란히 굽는다:
//   현행  = 몸통 색이 등급색(RARITY_HEX) — 같은 등급이면 전 종이 같은 색.
//   ⓐ    = 몸통은 **종색**, 등급 신호는 부속(테두리 광채·링·트림)으로 이동 — 시트에서는 셀
//           테두리 광채로 대신 보여 준다(실구현 시 3D 바닥 링/안장 트림이 이 자리를 맡는다).
//   ⓑ    = 몸통은 종색 **바탕** + 등급을 채도/명도 단계로 — epic 단계만큼 종색을 선명하게 민다.
//   ⓒ    = 현행 몸통 + 종색은 무늬로만 — 3D 무늬가 아직 없어 그림으로 못 보여 준다(하단 주석 참조).
//
// 종색 오버라이드 방법: `makeMountMesh` 는 빌드 시점에 전역 `RARITY_HEX[rarity]` 를 읽어 몸통
// 재질(mat/light/dark)을 파생시키므로, 빌드 직전 `RARITY_HEX.epic` 을 종색으로 바꿨다가 되돌리면
// **게임 코드 무수정**으로 '몸통이 종색인 판'이 나온다. 등급색을 벗긴 부속(주둥이·발굽 등 19곳)은
// 원래 종 파생이라 그대로 남는다 — 즉 ⓐ/ⓑ 렌더는 실구현과 같은 색 구조다.
//
// 사용: node shot-body-color-abc.js   → tools/body-color-abc.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

// 종색 — 실제 동물 기준(밝기는 시트에서 판독되게 중명도로).
const SPECIES = [
    ['Pony', 0xa9713e],    // 조랑말 = 밤색
    ['Donkey', 0x8d8178],  // 당나귀 = 회갈색
    ['Goat', 0xe3dccb],    // 염소 = 크림 흰색
    ['Pig', 0xe8a3a6],     // 돼지 = 분홍
    ['Camel', 0xc9a063],   // 낙타 = 모래빛 탠
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1240, height: 1180 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof MOUNT_KR !== "undefined"');

    await page.evaluate((SPECIES) => {
        Scene3D.mountThumb('Pony', 'common');   // 렌더러 1회 초기화(조명 동기화 포함)
        const CELL = 220;
        Scene3D._creatureR.setSize(CELL, CELL);
        const epicHex = RARITY_HEX.epic;
        const shot = (name, bodyHex) => {
            if (bodyHex !== undefined) RARITY_HEX.epic = bodyHex;   // 빌드 시점 파생이라 이걸로 충분
            let url;
            try {
                Scene3D.creatureThumbInit();
                const sc = Scene3D._creatureScene;
                Scene3D.clearGroup(sc);
                sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
                const g = new THREE.Group();
                g.rotation.y = 0.55;   // 게임 앵글
                g.add(Scene3D.makeMountMesh(name, 'epic'));
                sc.add(g);
                Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
                Scene3D._creatureR.render(sc, Scene3D._creatureCam);
                url = Scene3D._creatureR.domElement.toDataURL();
            } finally {
                RARITY_HEX.epic = epicHex;                          // 어떤 경로로 나가도 복원
            }
            return url;
        };
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const vivid = (h) => { const c = new THREE.Color(h); c.offsetHSL(0, 0.10, 0.07); return c.getHex(); };
        const cell = (img, label, frame) => `
            <div style="width:${CELL}px;margin:4px;background:#20242b;border-radius:10px;padding:4px;${frame ? `box-shadow:0 0 0 3px ${frame},0 0 14px ${frame}` : ''}">
                <img src="${img}" style="width:${CELL}px;height:${CELL}px">
                <div style="font:11px sans-serif;color:#9fb0c0;text-align:center">${label}</div>
            </div>`;
        const rows = [];
        const mk = (title, fn, frame) => {
            const cells = SPECIES.map(([nm, sc2]) => cell(fn(nm, sc2), MOUNT_KR[nm] || nm, frame)).join('');
            rows.push(`<div style="font:bold 15px sans-serif;color:#e8eef4;margin:14px 4px 2px">${title}</div><div style="display:flex">${cells}</div>`);
        };
        mk('현행 — 몸통 = 등급색 (epic ' + hex(epicHex) + '): 같은 등급이면 전 종이 같은 색', (nm) => shot(nm));
        mk('ⓐ 몸통 = 종색 · 등급 = 부속으로 이동 (셀 테두리 광채가 그 자리 — 실구현은 바닥 링/안장 트림)', (nm, sc2) => shot(nm, sc2), hex(epicHex));
        mk('ⓑ 몸통 = 종색 바탕 + 등급만큼 채도/명도 상승 (epic 단계 예시)', (nm, sc2) => shot(nm, vivid(sc2)));
        document.body.innerHTML = `<div style="background:#12161d;padding:12px 14px 8px">
            <div style="font:bold 17px sans-serif;color:#fff">creature-body-species-color — 몸 색 3안 대조 (같은 등급 epic · 5종)</div>
            ${rows.join('')}
            <div style="font:12px sans-serif;color:#8194a8;margin:12px 4px">ⓒ(현행 몸통 + 종색 무늬만)은 무늬 조형이 아직 없어 그림으로 못 보여 줍니다 — 현행 행에서 몸통색이 그대로라고 보면 됩니다. 시트 생성: tools/shot-body-color-abc.js (게임 코드 무수정, RARITY_HEX 임시 오버라이드)</div>
        </div>`;
    }, SPECIES);

    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(__dirname, 'body-color-abc.png'), fullPage: true });
    console.log('tools/body-color-abc.png 저장 · 콘솔 에러 ' + errors.length + '건');
    if (errors.length) { console.log(errors.slice(0, 3).join('\n')); process.exit(1); }
    await browser.close();
})().catch(e => { console.error('고장:', e); process.exit(2); });
