// 설원이 '눈'으로 읽히는지 실측 — `map-quality-up` 잔여 결함 ㉱
// ("설원 수광면을 백색 근처로 — 현재 '눈'이 아니라 '파란 바이옴'").
//
// 무엇을 재는가: **실제로 렌더된 화면**(gl.readPixels)의 지면 영역에서 **수광면**(빛 받는 면)의 채도.
//   눈은 알베도가 거의 1 이라, 밤이어도 **빛이 닿는 면은 백색에 가깝고** 색은 그늘에만 남는다.
//   수광면까지 파랗게 물들면 '눈 덮인 땅'이 아니라 '파란 물질로 된 땅'으로 읽힌다 — 지적의 요지.
//   · 지평선 아래 지면 화소만 본다(하늘·UI 제외, 영웅·적·소품 숨김).
//   · 그중 **밝기 상위 12%** 를 수광면으로 본다. 그 화소들의 평균 채도(HSL S)와 명도(L)를 낸다.
//   · 비교군으로 하위 40%(그늘)도 같이 낸다 — 그늘은 파래도 된다. 수광면만 백색이어야 한다.
// ⚠️ 채도는 캔버스의 sRGB 값에서 낸다(눈으로 보는 값과 같은 자). 선형 공간으로 바꾸지 말 것.
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-snow-white.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const SNOW = [6, 18];        // 설원 밤 · 빙하 (19 툰드라는 '눈이 걷힌 갈색 이끼 지대'라 대상 아님)
const REF = [1, 9];          // 대조군 — 초원·용암(여기는 수광면이 유채색이어도 정상)
const LIT_SAT_MAX = 0.22;    // 수광면 평균 채도 상한 — 이 위는 '흰 눈'이 아니라 '색 있는 땅'
const LIT_L_MIN = 0.55;      // 수광면 평균 명도 하한 — 눈은 밤이어도 수광면이 밝아야 한다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.ground)) break;
        await page.waitForTimeout(200);
    }

    const rows = [];
    for (const ch of SNOW.concat(REF)) {
        const r = await page.evaluate((chapter) => {
            Scene3D.setChapterTheme(chapter);
            const R = Scene3D.renderer, gl = R.getContext();
            const w = R.domElement.width, h = R.domElement.height;
            const hidden = [];
            Scene3D.scene.traverse(o => {
                if (o === Scene3D.scene || o === Scene3D.ground) return;
                let p = o.parent, under = false;
                while (p) { if (p === Scene3D.ground) { under = true; break; } p = p.parent; }
                // 스캐터도 숨겨 **지형 표면만** 남긴다 — 빙하 스캐터는 MeshBasicMaterial 시안(0xbfe6ff)
                // 이라 조명과 무관하게 밝아서 '밝기 상위 12% = 수광면' 가정을 흔들 수 있다.
                // ⚠️ 다만 실측 결과 빙하의 높은 채도는 **스캐터 탓이 아니었다**(숨겨도 0.724→0.719).
                //    빙하 지면은 원래 청빙색이다(테마 ground 0x9fc9de = S 0.49 에 tint 가 +0.16 채도).
                //    즉 빙하는 '설계된 파란 바이옴'이고, ㉱ 가 겨냥한 건 6 설원 쪽이다.
                if (under && !(o.isInstancedMesh || o.isMesh)) return;
                if (o.isMesh && o.visible) { o.visible = false; hidden.push(o); }
            });
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            for (const o of hidden) o.visible = true;

            const cam = Scene3D.camera;
            const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
            const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
            hp.project(cam);
            const yHorPx = Math.min(h - 1, Math.round((hp.y + 1) / 2 * h));

            const px = [];
            for (let y = 0; y < yHorPx; y++) for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
                const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0);
                const L = (mx + mn) / 2;
                const S = (mx === mn) ? 0 : (L > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
                px.push({ L, S });
            }
            px.sort((a, b) => b.L - a.L);
            const lit = px.slice(0, Math.max(1, Math.round(px.length * 0.12)));
            const shade = px.slice(Math.round(px.length * 0.60));
            const avg = (arr, k) => arr.reduce((s, o) => s + o[k], 0) / arr.length;
            return {
                n: px.length,
                litS: avg(lit, 'S'), litL: avg(lit, 'L'),
                shS: avg(shade, 'S'), shL: avg(shade, 'L'),
            };
        }, ch);
        rows.push({ ch, snow: SNOW.includes(ch), ...r });
    }
    await browser.close();

    let fail = 0;
    console.log('ch  구분   | 수광면 채도/명도 | 그늘 채도/명도 | 판정');
    for (const r of rows) {
        const ok = !r.snow || (r.litS <= LIT_SAT_MAX && r.litL >= LIT_L_MIN);
        if (!ok) fail++;
        console.log(String(r.ch).padStart(2) + '  ' + (r.snow ? '설원  ' : '대조군') + ' |     ' +
            r.litS.toFixed(3) + '/' + r.litL.toFixed(3) + '   |   ' +
            r.shS.toFixed(3) + '/' + r.shL.toFixed(3) + '  | ' +
            (r.snow ? (ok ? 'ok' : '✗') : '—'));
    }
    console.log('기준(설원만): 수광면 채도 ≤ ' + LIT_SAT_MAX + ' · 수광면 명도 ≥ ' + LIT_L_MIN);
    if (errs.length) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log(fail === 0 ? 'PASS — 설원 수광면이 백색에 가깝다' : 'FAIL — ' + fail + '개 설원 챕터 미달');
})();
