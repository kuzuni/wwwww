// 영웅 피해 숫자의 판독성 실측 — 비평가 4차 지적 ⓒ("붉은 비네트 위 붉은 글자라 가장 안 읽힌다").
// 사용: node probe-heronum.js
// 같은 프레임 안에서 **구/신 스타일만 토글하는 대응 비교(paired A/B)** — 이 저장소가 조명·재질에서
// 여러 번 데인 방식이다(로드마다 흔들리는 절대 수치를 믿으면 안 된다).
// 지표: 글자 바운딩박스 안에서 글리프(상위 밝기)와 배경(하위 밝기)의 **명도 대비비**.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 대조군 = **직전 라운드(4차 ⓒ)의 값**. 이 프로브는 현재 스타일시트의 `.dmg-hero`(=neo)와 이 값을
// 같은 프레임 조건에서 맞대 보는 A/B 다. 라운드를 넘길 때마다 여기를 그 시점 값으로 갱신할 것 —
// 안 그러면 두 라운드 전 값과 비교하게 돼 이번 교정의 효과가 부풀려 보인다.
// (3차 이전 값은 `color:#ff5555 · stroke .6px · shadow 0 0 8px rgba(198,40,40,.6)` 이었다 —
//  붉은 글로우가 글자 둘레를 비네트와 같은 붉은 기로 채워 경계를 지우던 그 값.)
const OLD = {
    color: '#ff9a9a',
    stroke: '1.3px rgba(28,2,2,.96)',
    shadow: '0 0 5px rgba(0,0,0,.85), 0 0 12px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.7)',
    marker: false
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 렌더 루프를 멈춰 캡처를 빠르게(스크래치 메모: 도는 동안 스샷 한 장이 15~30초, 멈추면 0.15초)
    await page.evaluate(() => { Scene3D.update = () => {}; Combat.tick = () => {}; });

    const shoot = async (variant) => {
        const box = await page.evaluate((v) => {
            Scene3D.fxLayer.innerHTML = '';
            const vig = document.getElementById('dmg-flash');
            vig.classList.add('on');
            vig.style.setProperty('--vig', '0.9');
            vig.style.setProperty('opacity', '0.9', 'important'); // 비네트 정점에 고정 — 최악 조건에서 잰다
            // 화면 중앙(비네트가 옅은 곳이 아니라 가장자리 쪽)에 띄워 실제 최악 위치를 재현
            const el = document.createElement('div');
            el.className = 'float-dmg dmg-hero';
            el.textContent = '300';
            el.style.left = '120px'; el.style.top = '300px';
            el.style.animation = 'none'; // 아크 정지 — 위치·투명도 흔들림 제거
            if (v) { // 구 스타일 강제
                el.style.color = v.color;
                el.style.setProperty('-webkit-text-stroke', v.stroke);
                el.style.textShadow = v.shadow;
                if (!v.marker) el.classList.add('__nomarker');
            }
            Scene3D.fxLayer.appendChild(el);
            const r = el.getBoundingClientRect();
            window.__lastBox = { x: r.left, y: r.top, w: r.width, h: r.height };
            return window.__lastBox;
        }, variant);
        // 여유를 두고 크롭 — 글자 둘레의 배경까지 포함해야 대비를 잰다
        const pad = 6;
        const buf = await page.screenshot({ clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 } });
        return buf.toString('base64');
    };

    // 같은 크롭에서 '숫자만 지운' 배경 프레임 — 차분해 글리프 마스크를 얻는다
    // (`probe-silhouette.js`가 영웅 실루엣을 뽑을 때 쓴 것과 같은 방식. 퍼센타일은 글리프와
    //  배경을 못 가른다 — 스트로크를 두껍게 하면 어두운 픽셀이 늘어 지표가 저절로 좋아 보인다.)
    const shootBg = async (box) => {
        await page.evaluate(() => { Scene3D.fxLayer.innerHTML = ''; });
        const pad = 6;
        const buf = await page.screenshot({ clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2 } });
        return buf.toString('base64');
    };

    // 구 스타일에서는 ▼ 표식을 숨겨야 공정한 비교가 된다
    await page.addStyleTag({ content: '.float-dmg.dmg-hero.__nomarker::before { content: none; }' });

    const newB64 = await shoot(null);
    const newBox = await page.evaluate(() => window.__lastBox);
    const newBgB64 = await shootBg(newBox);
    const oldB64 = await shoot(OLD);
    const oldBox = await page.evaluate(() => window.__lastBox);
    const oldBgB64 = await shootBg(oldBox);

    const stat = await page.evaluate(async ([a, aBg, b, bBg]) => {
        const decode = (b64) => new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                res({ d: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height });
            };
            img.src = 'data:image/png;base64,' + b64;
        });
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lumAt = (d, i) => 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
        const measure = async (fg64, bg64) => {
            const A = await decode(fg64), B = await decode(bg64);
            let gl = [], bl = [], body = [];
            const n = Math.min(A.d.length, B.d.length);
            for (let i = 0; i < n; i += 4) {
                // 글리프 자국 = 숫자를 지웠을 때 색이 유의미하게 바뀌는 자리(글로우 헤일로까지 포함)
                const dr = Math.abs(A.d[i] - B.d[i]), dg = Math.abs(A.d[i + 1] - B.d[i + 1]), db = Math.abs(A.d[i + 2] - B.d[i + 2]);
                const dsum = dr + dg + db;
                if (dsum > 40) {
                    gl.push(lumAt(A.d, i)); bl.push(lumAt(B.d, i));
                    // 🚨 **채움을 '자국 전체의 상위 15%'로 재면 안 된다.** 자국에는 글로우 헤일로가 통째로
                    //    들어가는데, 글로우를 넓힐수록 어두운 픽셀이 수백 개씩 불어나 같은 퍼센타일이
                    //    **더 어두운 자리로 밀려난다** — 채움을 흰색(#fff2f4)으로 바꿔도 지표가 0.3246→0.3293
                    //    으로 꿈쩍 안 하던 원인이 이것이었다(글리프 자국 2283→3153px). 스트로크를 두껍게
                    //    하면 지표가 저절로 좋아 보이던 옛 함정(4차 메모)의 **거울상**이다.
                    //    그래서 **글자 몸통**(배경이 거의 완전히 가려진 = 불투명 픽셀)만 따로 모은다.
                    if (dsum > 200) body.push(lumAt(A.d, i));
                }
            }
            if (!gl.length || !body.length) return null;
            gl.sort((p, q) => p - q); bl.sort((p, q) => p - q); body.sort((p, q) => p - q);
            const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
            // 채움 = 몸통 상위 밝기(=글자 속), 외곽선 = 몸통 하위(=스트로크), 배경 = 그 자리의 원래 화면
            // 🚨 **'속이 비었나'는 밝기 하나로는 못 잰다 — 밝은 픽셀이 몇 개나 되는지를 같이 봐야 한다.**
            //    실측: 4차(#ff9a9a)는 몸통 최대 밝기가 0.4747, 5차(#fff2f4)는 0.9045 로 흰 채움이 분명히
            //    렌더되는데도 p90 은 0.10→0.14 로 꿈쩍 안 했다. 몸통 1000여 px 중 **속살이 1%뿐**이기
            //    때문이다 — 1rem 글자에 1.4px 스트로크를 양쪽으로 두르면 획 두께를 스트로크가 거의 다
            //    먹는다. 비평가가 말한 '속 빈 아웃라인'은 **색이 아니라 이 면적** 이야기였다.
            //    그래서 채움은 속살 밝기(p99)로 재고, **속살이 몸통에서 차지하는 비율**을 따로 낸다.
            const core = q(body, 0.99);
            const mid = (core + q(bl, 0.5)) / 2;
            const coreFrac = body.filter(v => v > mid).length / body.length;
            return { fill: core, fillMax: body[body.length - 1], coreFrac: +coreFrac.toFixed(3),
                     outline: q(body, 0.1), bg: q(bl, 0.5), px: gl.length, bodyPx: body.length };
        };
        const ratio = (l1, l2) => +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
        const A = await measure(a, aBg), B = await measure(b, bBg);
        const pack = (s) => s && ({ ...s, fillVsBg: ratio(s.fill, s.bg), fillVsOutline: ratio(s.fill, s.outline), outlineVsBg: ratio(s.outline, s.bg) });
        return { neo: pack(A), old: pack(B) };
    }, [newB64, newBgB64, oldB64, oldBgB64]);

    const line = (t, s) => console.log(t.padEnd(8) +
        ' 채움 ' + s.fill.toFixed(4) + ' · 외곽선 ' + s.outline.toFixed(4) + ' · 그 자리 배경 ' + s.bg.toFixed(4) +
        '\n         (몸통 최대 ' + s.fillMax.toFixed(4) + ' · **속살 비율 ' + (s.coreFrac * 100).toFixed(1) + '%**)\n         → 채움:배경 ' + s.fillVsBg + ':1 · **채움:외곽선 ' + s.fillVsOutline + ':1** · 외곽선:배경 ' + s.outlineVsBg + ':1  (자국 ' + s.px + 'px 중 몸통 ' + s.bodyPx + 'px)');
    console.log('영웅 피해 숫자 판독성 — 비네트 정점(--vig 0.9) 고정 · 숫자 유/무 차분 마스크 대응 비교\n');
    line('4차', stat.old);
    line('5차(현재)', stat.neo);
    const d1 = +(stat.neo.fillVsOutline - stat.old.fillVsOutline).toFixed(2);
    const d2 = +(stat.neo.outlineVsBg - stat.old.outlineVsBg).toFixed(2);
    console.log('\n채움:외곽선 ' + (d1 >= 0 ? '+' : '') + d1 + ' · 외곽선:배경 ' + (d2 >= 0 ? '+' : '') + d2 +
        '\n(붉은 필드 위 붉은 글자는 채움 색으로는 못 띄운다 — 소유자 색코딩을 지키면서 판독성을 만드는 축은' +
        '\n 글리프 자신의 **명도 경계**다. 두 지표가 함께 올라야 실제로 읽힌다.)');
    // ── 판정 ── 대비'비'만 보면 **채움이 배경보다 어두워도** 지표가 올라간다(4차가 정확히 그 상태였다:
    // 채움 0.2974 < 배경 0.3990 인데 비는 1.29:1). 눈에는 그게 '속이 빈 아웃라인'으로 보인다(B #4).
    // 그래서 ⑴ 채움이 배경보다 **밝을 것** ⑵ 채움:배경 ≥ 2:1 ⑶ 채움:외곽선이 4차보다 안 낮을 것, 셋을 건다.
    const brighter = stat.neo.fill > stat.neo.bg;
    // 게이트 1.8 — 이 배경(비네트 정점의 붉은 필드, 휘도 0.43~0.56)에서는 **완전한 순백이라도**
    // 대비비가 2.0~2.1 을 못 넘는다. 2.0 을 걸면 채움을 아무리 밝혀도 통과가 불가능한 게이트가 된다.
    // 이 지적의 실체는 비율이 아니라 **속살 면적**이었으므로 무게는 아래 coreFrac 에 싣는다.
    const okBg = stat.neo.fillVsBg >= 1.8;
    const okCore = stat.neo.coreFrac >= 0.25;
    console.log('\n  속살이 배경보다 밝은가: ' + (brighter ? '✓' : '✗') + ' (속살 ' + stat.neo.fill.toFixed(4) + ' vs 배경 ' + stat.neo.bg.toFixed(4) + ')' +
        '\n  속살:배경 ' + stat.neo.fillVsBg + ':1 (≥1.8 필요, 이 배경의 이론 상한 ~2.05) ' + (okBg ? '✓' : '✗') +
        '\n  속살 비율 ' + (stat.neo.coreFrac * 100).toFixed(1) + '% (≥25% 필요, 4차 ' + (stat.old.coreFrac * 100).toFixed(1) + '%) ' + (okCore ? '✓' : '✗'));
    const pass = brighter && okBg && okCore;
    console.log('\n  판정: ' + (pass ? 'PASS — 글자 몸통이 붉은 필드 위로 뜬다' : 'FAIL — 채움이 안 떠 속 빈 아웃라인으로 읽힌다(지적 ⓕ가 맞다)'));
    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
    process.exit(pass && !errors.length ? 0 : 1);
})();
