// 영웅 피해 숫자의 판독성 실측 — 비평가 4차 지적 ⓒ("붉은 비네트 위 붉은 글자라 가장 안 읽힌다").
// 사용: node probe-heronum.js
// 같은 프레임 안에서 **구/신 스타일만 토글하는 대응 비교(paired A/B)** — 이 저장소가 조명·재질에서
// 여러 번 데인 방식이다(로드마다 흔들리는 절대 수치를 믿으면 안 된다).
// 지표: 글자 바운딩박스 안에서 글리프(상위 밝기)와 배경(하위 밝기)의 **명도 대비비**.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 교정 전 스타일 — 붉은 글로우가 글자 둘레를 비네트와 같은 붉은 기로 채우던 그 값
const OLD = {
    color: '#ff5555',
    stroke: '.6px rgba(30,10,0,.95)',
    shadow: '0 0 8px rgba(198,40,40,.6), 0 2px 4px rgba(0,0,0,.6)',
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
            let gl = [], bl = [];
            const n = Math.min(A.d.length, B.d.length);
            for (let i = 0; i < n; i += 4) {
                // 글리프 픽셀 = 숫자를 지웠을 때 색이 유의미하게 바뀌는 자리
                const dr = Math.abs(A.d[i] - B.d[i]), dg = Math.abs(A.d[i + 1] - B.d[i + 1]), db = Math.abs(A.d[i + 2] - B.d[i + 2]);
                if (dr + dg + db > 40) { gl.push(lumAt(A.d, i)); bl.push(lumAt(B.d, i)); }
            }
            if (!gl.length) return null;
            gl.sort((p, q) => p - q); bl.sort((p, q) => p - q);
            const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
            // 채움 = 글리프 상위 밝기(스트로크가 아닌 안쪽), 외곽선 = 하위, 배경 = 그 자리의 원래 화면
            return { fill: q(gl, 0.85), outline: q(gl, 0.10), bg: q(bl, 0.5), px: gl.length };
        };
        const ratio = (l1, l2) => +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
        const A = await measure(a, aBg), B = await measure(b, bBg);
        const pack = (s) => s && ({ ...s, fillVsBg: ratio(s.fill, s.bg), fillVsOutline: ratio(s.fill, s.outline), outlineVsBg: ratio(s.outline, s.bg) });
        return { neo: pack(A), old: pack(B) };
    }, [newB64, newBgB64, oldB64, oldBgB64]);

    const line = (t, s) => console.log(t.padEnd(8) +
        ' 채움 ' + s.fill.toFixed(4) + ' · 외곽선 ' + s.outline.toFixed(4) + ' · 그 자리 배경 ' + s.bg.toFixed(4) +
        '\n         → 채움:배경 ' + s.fillVsBg + ':1 · **채움:외곽선 ' + s.fillVsOutline + ':1** · 외곽선:배경 ' + s.outlineVsBg + ':1  (글리프 ' + s.px + 'px)');
    console.log('영웅 피해 숫자 판독성 — 비네트 정점(--vig 0.9) 고정 · 숫자 유/무 차분 마스크 대응 비교\n');
    line('교정 전', stat.old);
    line('교정 후', stat.neo);
    const d1 = +(stat.neo.fillVsOutline - stat.old.fillVsOutline).toFixed(2);
    const d2 = +(stat.neo.outlineVsBg - stat.old.outlineVsBg).toFixed(2);
    console.log('\n채움:외곽선 ' + (d1 >= 0 ? '+' : '') + d1 + ' · 외곽선:배경 ' + (d2 >= 0 ? '+' : '') + d2 +
        '\n(붉은 필드 위 붉은 글자는 채움 색으로는 못 띄운다 — 소유자 색코딩을 지키면서 판독성을 만드는 축은' +
        '\n 글리프 자신의 **명도 경계**다. 두 지표가 함께 올라야 실제로 읽힌다.)');
    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
})();
