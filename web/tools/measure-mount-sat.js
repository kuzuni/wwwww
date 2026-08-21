// [측정 전용, 커밋 제외] 탈것 썸네일의 몸통 픽셀 평균 채도/명도를 잰다.
// 세션6 이 "웜 hue 는 ACES+올리브 hemi 로 채도가 뭉갠다" 를 근거로 게이트 미달을 렌더러 벽으로
// 확정했는데, 그 주장을 A/B 실측으로 검증/반증하기 위한 도구. 여러 렌더러 변형을 같은 종에
// 태워 몸 픽셀(불투명·비안장) 평균 HSL 을 출력한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

const SPECIES = process.argv.slice(2).length ? process.argv.slice(2)
    : ['Pony', 'Camel', 'Boar', 'Giant Bee', 'Pterosaur', 'Dump Truck', 'Donkey', 'Alpaca', 'Armored Rhino'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.mountThumb && typeof MOUNT_KR !== "undefined"');

    const out = await page.evaluate((species) => {
        Scene3D.mountThumb('Pony', 'common'); // init
        const CELL = 240;
        Scene3D._creatureR.setSize(CELL, CELL);

        // 렌더러 변형들 — 렌더 직전에 조명/노출을 바꿔 A/B.
        const variants = {
            base: () => {},
            neutralSun: () => { Scene3D._creatureSun.color.setHex(0xffffff); },   // 웜크림 태양 → 순백 (웜면 R클리핑 완화)
            coolSun: () => { Scene3D._creatureSun.color.setHex(0xe8eeff); },       // 살짝 쿨 태양
            noTonemap: () => { Scene3D._creatureR.toneMapping = THREE.NoToneMapping; }, // ACES 제거 (채도 손실 원흉 검증)
            cineon: () => { Scene3D._creatureR.toneMapping = THREE.CineonToneMapping; },
            neutralSunNoAces: () => { Scene3D._creatureSun.color.setHex(0xffffff); Scene3D._creatureR.toneMapping = THREE.NoToneMapping; },
        };

        function measure(name, applyVariant) {
            Scene3D.creatureThumbInit();
            const sc = Scene3D._creatureScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._creatureHemi, Scene3D._creatureSun, Scene3D._creatureRim);
            // creatureThumbInit/syncCreatureLights 는 노출·sun색은 되돌리지만 toneMapping·hemi ground 는
            // 안 되돌린다 — 변형이 새면 다음 렌더가 오염되므로 매 측정 전 정본으로 리셋한다.
            Scene3D._creatureR.toneMapping = THREE.ACESFilmicToneMapping;
            applyVariant();
            const g = new THREE.Group();
            g.rotation.y = 0.55;
            g.add(Scene3D.makeMountMesh(name, 'epic'));
            sc.add(g);
            g.traverse(o => { if (o.userData && o.userData.hideInThumb) o.visible = false; });
            Scene3D.thumbFrameToFit(Scene3D._creatureCam, g, new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize(), 1.04);
            Scene3D._creatureR.render(sc, Scene3D._creatureCam);
            const url = Scene3D._creatureR.domElement.toDataURL();
            return url;
        }

        // 픽셀 읽기용 캔버스
        const cvs = document.createElement('canvas'); cvs.width = CELL; cvs.height = CELL;
        const ctx = cvs.getContext('2d');
        function toHSL(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            let h = 0, s = 0, l = (mx + mn) / 2;
            if (mx !== mn) {
                const d = mx - mn;
                s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
                if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
                else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
                h /= 6;
            }
            return [h, s, l];
        }
        const results = {};
        return new Promise((resolve) => {
            let pending = species.length * Object.keys(variants).length;
            for (const sp of species) {
                results[sp] = {};
                for (const [vn, vf] of Object.entries(variants)) {
                    const url = measure(sp, vf);
                    const img = new Image();
                    img.onload = (function (sp, vn) { return function () {
                        ctx.clearRect(0, 0, CELL, CELL);
                        ctx.drawImage(img, 0, 0, CELL, CELL);
                        const data = ctx.getImageData(0, 0, CELL, CELL).data;
                        let sSum = 0, lSum = 0, n = 0, candy = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            const a = data[i + 3];
                            if (a < 200) continue; // 배경 투명 제외
                            const [h, s, l] = toHSL(data[i], data[i + 1], data[i + 2]);
                            if (l > 0.92 || l < 0.06) continue; // 하이라이트/암부 클리핑 제외 = 순수 몸색만
                            sSum += s; lSum += l; n++;
                            if (s > 0.5 && l >= 0.5 && l <= 0.82) candy++; // candy zone = 높은 채도+밝은 명도
                        }
                        results[sp][vn] = { s: n ? +(sSum / n).toFixed(3) : 0, l: n ? +(lSum / n).toFixed(3) : 0, candy: n ? +(candy / n).toFixed(2) : 0, n };
                        if (--pending === 0) resolve(results);
                    }; })(sp, vn);
                    img.src = url;
                }
            }
        });
    }, SPECIES);

    console.log('종\t변형\tS\tL\tcandy%\t픽셀수');
    for (const sp of Object.keys(out)) {
        for (const vn of Object.keys(out[sp])) {
            const r = out[sp][vn];
            console.log(`${sp}\t${vn}\t${r.s}\t${r.l}\t${r.candy}\t${r.n}`);
        }
    }
    if (errors.length) console.log('ERRORS:', errors.slice(0, 5));
    await browser.close();
})();
