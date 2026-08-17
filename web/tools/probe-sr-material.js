// 소환 결과 구체 — **재질 위계(구면감)** 실측.
// 사용: node probe-sr-material.js
//
// 9차 비평가 지적 ⑸ [중간] 2인 일치:
//   A "일반=제대로 된 무광 금속인데 서사시·전설 **유리가 평면 원판**이라 최하 등급이 가장 입체적"
//   B "**신화 구체가 구면 셰이딩 없는 각진 부채꼴 바람개비**"
// 둘 다 '색은 다른데 공이 아니다'라는 같은 말이고, 등급이 오를수록 심하다는 것도 같다.
//
// 그래서 '구로 보이는가'를 세 물리량으로 가른다(전부 등급색과 무관한 **휘도 기하**다 —
// 색 위계는 이 항목이 아니라 --pre-k/tier filter 소관이라 여기서 재면 서로를 오염시킨다):
//
//  M1 **터미네이터 감쇠** = (광원 반대편 림 휘도) / (구체 평균 휘도)
//     구는 빛 반대쪽 가장자리가 어둡게 말려 들어간다. 평면 원판은 가장자리도 가운데와 같아 1에 붙는다.
//  M2 **광축 단조성** = 광원→반대편 림으로 그은 축에서 휘도가 '계속 내려가는' 구간 비율
//     구면 램버트 음영의 정의 그 자체다. 원판·바람개비는 오르내려서 1이 안 나온다.
//  M3 **바람개비 지수** = (각도 3차 이상 하모닉 에너지 비율) × (안쪽 링 ↔ 바깥 링 고주파 상관)
//     B가 말한 '부채꼴 바람개비'는 **중심 한 점에서 갈라져 나온 쐐기**다. 그 정의를 그대로 잰다:
//     쐐기는 반지름이 달라도 **같은 각도**에 있으므로 안쪽 링과 바깥 링의 고주파 무늬가 겹친다(상관≈1).
//     🚨 **자를 두 번 갈아엎었다 — 되돌리지 말 것.**
//     ⑴ 첫 판 '이동평균 잔차 std': 패싯 9면의 각폭(40°)이 평균 창(±4/96표본=33.75°)과 비슷해
//        **패싯이 평균에 같이 먹혔다**. 수정 전 보석이 0.322로 '거의 통과'로 나왔는데 대조 시트를
//        눈으로 보면 바람개비가 그대로 있었다. 창 크기가 결과를 정하는 자는 못 쓴다.
//     ⑵ 둘째 판 '고차 하모닉 에너지 비율'만: 이번엔 **금속의 이방성 가로 밴드**(정상적인 금속 단서)가
//        0.246으로 보석 0.274와 붙어 버렸다. 직선 밴드도 극좌표에서는 고차 하모닉이기 때문이다.
//        그래서 '반지름이 달라도 같은 각도인가'(=중심에서 갈라졌는가)를 곱해 밴드와 쐐기를 가른다.
//     ⚠️ 눈으로 대조 시트(`sr-material.png`)를 먼저 볼 것. 이 항목은 두 번 다 **수치가 통과인데
//        그림은 불합격**이었다.
//
// ⚠️ 자(尺)에 대한 주의 3건 — 앞 회차들이 '자가 틀려서' 멀쩡한 걸 고친 전례가 많다:
//  ㉠ **하이라이트 쪽을 M1에 넣지 말 것.** 스페큘러는 구면감의 근거지 반례가 아니다.
//     림 표본은 광축 기준 **어두운 쪽 반구**(cos < -0.5)만 쓴다.
//  ㉡ **유리/보석의 밝은 림(프레넬)은 정상이다.** 그래서 M1의 림 표본은 최외곽이 아니라
//     r 0.78~0.92 대역이다(테두리 인셋 1px·outline·글로우가 섞이는 r>0.94를 피한다).
//  ㉢ **아이콘 글리프를 빼야 한다.** 셀 가운데 이모지가 크게 박히므로 r<0.34는 전부 제외한다.
//
// 판정 게이트는 '금속(현재 유일하게 합격이라고 비평가가 인정한 재질)' 실측을 기준선으로 잡되,
// 등급이 올라갈수록 **더** 입체적이어야 한다는 지적을 반영해 전 등급 동일 기준으로 건다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 게이트 보정 근거(실측) — 비평가가 유일하게 합격이라 인정한 **금속**을 기준선으로 잡는다.
//   금속 실측: M1 0.556~0.585 · M2 1.000 · M3 0.101~0.168
//   수정 전 유리: M1 0.889 · M2 0.462   / 수정 전 보석: M1 0.654 · M3 0.322
// A의 지적이 "**최하 등급이 가장 입체적**"이었으므로, 상위 등급은 최소한 금속만큼은 구여야 한다
// → M1 게이트를 금속 최악값(0.585) 바로 위인 0.62에 건다(수정 전 유리·보석이 둘 다 떨어진다).
// M3(바람개비 지수)은 패싯을 금지하는 게 아니라 **중심에서 갈라지는 쐐기**만 막는 자다.
//   실측: 금속 0.000~0.018 · 유리 0.010~0.049 · 수정 후 보석 0.000 / **수정 전 보석 0.175**
//   → 게이트 0.10 (정상 재질 최댓값 0.049 와 수정 전 보석 0.175 사이).
const GATE = { m1: 0.62, m2: 0.80, m3: 0.10 };
const ORB = 240;   // 실측용 구체 지름(px) — 크게 찍어야 패싯 톱니가 표본에 잡힌다

// 페이지 안에 실제 게임 CSS 그대로의 셀 6개(등급 0~5)를 세운다.
// 소환을 굴리면 등급 구성이 난수라 6등급을 한 판에 못 모은다 — 재질 스택만 격리해서 본다.
const BUILD = `(SZ => {
    document.body.style.background = '#000';
    const host = document.createElement('div');
    host.id = 'matprobe';
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#05070f;display:flex;gap:24px;padding:24px';
    for (let t = 0; t < 6; t++) {
        const rc = RARITY_CSS[RARITIES[t]];
        const cell = document.createElement('div');
        cell.className = 'sr-cell';
        cell.dataset.tier = String(t);
        cell.dataset.mat = UI.srMaterial(RARITIES[t]);
        // ⚠️ .sr-cell 기본값은 opacity:0 · scale(.35)다(등장 애니메이션 전 상태) — 실측용으로 편다
        cell.style.cssText = 'opacity:1;transform:none;width:' + SZ + 'px;--rc:' + rc
            + ';--rc-lite:' + UI.srShade(rc, .5) + ';--rc-deep:' + UI.srShade(rc, -.62);
        // 래퍼 transform: scale(--sz)가 걸리면 캡처 상자와 구체 반경이 어긋난다 — 실측 중에만 끈다
        cell.innerHTML = '<div class="sr-orbwrap" style="transform:none"><span class="sr-orb"></span></div>';
        host.appendChild(cell);
    }
    document.body.appendChild(host);
    return [...host.querySelectorAll('.sr-orb')].map(o => {
        const r = o.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
})`;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1720, height: 420 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction('typeof UI !== "undefined" && typeof RARITY_CSS !== "undefined"');
    await page.evaluate('Scene3D.update = function () {};');
    // ⚠️ 문자열 표현식에 evaluate 의 arg 는 안 넘어간다(표현식은 그대로 평가되고 인자는 무시된다)
    //    — 이 저장소의 다른 프로브들처럼 호출까지 문자열로 붙인다.
    const boxes = await page.evaluate(`${BUILD}(${ORB})`);
    await page.waitForTimeout(300);

    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1720, height: 420 } });
    const png = await page.evaluate(async (b64) => {
        // 캔버스 디코드 — 노드 쪽 PNG 의존성 없이 픽셀을 얻는다
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height);
        return { w: c.width, h: c.height, data: Array.from(d.data) };
    }, shot.toString('base64'));

    const px = (x, y) => {
        const i = ((y | 0) * png.w + (x | 0)) * 4;
        return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };

    const RK = ['일반', '희귀한', '서사시', '전설', '궁극의', '신화'];
    const MAT = ['metal', 'metal', 'glass', 'glass', 'gem', 'gem'];
    // 구체 그라디언트 광원 위치는 CSS 전체가 'at 30% 20%' 계열이다 → 중심에서 그쪽을 광축으로 잡는다
    const LX = 0.30 - 0.5, LY = 0.20 - 0.5;
    const LL = Math.hypot(LX, LY), lx = LX / LL, ly = LY / LL;

    const rows = [];
    for (let t = 0; t < 6; t++) {
        const b = boxes[t];
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = b.w / 2;
        // 전체 평균(아이콘 자리 r<0.34 제외, 테두리 r>0.94 제외)
        let sum = 0, n = 0;
        for (let y = -R; y <= R; y += 1) for (let x = -R; x <= R; x += 1) {
            const rr = Math.hypot(x, y) / R;
            if (rr < 0.34 || rr > 0.94) continue;
            const [r0, g0, b0] = px(cx + x, cy + y);
            sum += luma(r0, g0, b0); n++;
        }
        const mean = sum / n;

        // M1 — 광원 반대편 림(r 0.78~0.92, cos < -0.5)
        let ls = 0, ln = 0;
        for (let y = -R; y <= R; y += 1) for (let x = -R; x <= R; x += 1) {
            const d = Math.hypot(x, y), rr = d / R;
            if (rr < 0.78 || rr > 0.92) continue;
            const cos = (x / d) * lx + (y / d) * ly;
            if (cos > -0.5) continue;
            const [r0, g0, b0] = px(cx + x, cy + y);
            ls += luma(r0, g0, b0); ln++;
        }
        const m1 = (ls / ln) / mean;

        // M2 — 광축 단조성. 하이라이트 자체(코어)는 빼고 r 0.36 → 0.90 구간만 본다.
        const N = 14, axis = [];
        for (let i = 0; i < N; i++) {
            const rr = 0.36 + (0.90 - 0.36) * (i / (N - 1));
            // 광원 쪽(-) → 반대쪽(+)으로 훑는다
            const sx = cx - lx * rr * R, sy = cy - ly * rr * R;   // 광원 반대 방향으로 전진
            // 접선 방향으로 ±6px 평균내 노이즈를 죽인다
            let s = 0, c = 0;
            for (let k = -6; k <= 6; k++) {
                const [r0, g0, b0] = px(sx + (-ly) * k, sy + lx * k);
                s += luma(r0, g0, b0); c++;
            }
            axis.push(s / c);
        }
        let down = 0;
        for (let i = 1; i < axis.length; i++) if (axis[i] <= axis[i - 1] + 0.5) down++;
        const m2 = down / (axis.length - 1);

        // M3 — 바람개비 지수. 링 3개(안·중·바깥)에서 고주파 무늬를 뽑아
        //  ⒜ 3차 이상 에너지 비율(패싯이 얼마나 세나)과
        //  ⒝ 안쪽↔바깥쪽 무늬의 각도 상관(중심에서 갈라졌나)을 곱한다.
        const A = 180;
        const ringAt = rr => {
            const v = [];
            for (let i = 0; i < A; i++) {
                const a = i / A * Math.PI * 2;
                const [r0, g0, b0] = px(cx + Math.cos(a) * rr * R, cy + Math.sin(a) * rr * R);
                v.push(luma(r0, g0, b0));
            }
            return v;
        };
        // 3차 이상 하모닉만 남긴 신호와 그 에너지 비율
        const hipass = ring => {
            let ac = 0, hi = 0;
            const out = new Array(A).fill(0);
            for (let k = 1; k <= A / 2 - 1; k++) {
                let re = 0, im = 0;
                for (let i = 0; i < A; i++) {
                    const th = 2 * Math.PI * k * i / A;
                    re += ring[i] * Math.cos(th); im -= ring[i] * Math.sin(th);
                }
                const e = (re * re + im * im) / (A * A);
                ac += e;
                if (k < 3) continue;      // 1·2차는 구면 음영(방향광)의 몫이라 뺀다
                hi += e;
                for (let i = 0; i < A; i++) {
                    const th = 2 * Math.PI * k * i / A;
                    out[i] += 2 * (re * Math.cos(th) - im * Math.sin(th)) / A;
                }
            }
            return { sig: out, frac: Math.sqrt(hi / (ac || 1e-9)) };
        };
        const inner = hipass(ringAt(0.45)), outer = hipass(ringAt(0.80));
        const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
        const corr = dot(inner.sig, outer.sig)
            / (Math.sqrt(dot(inner.sig, inner.sig) * dot(outer.sig, outer.sig)) || 1e-9);
        const m3 = (inner.frac + outer.frac) / 2 * Math.max(0, corr);

        rows.push({ t, kr: RK[t], mat: MAT[t], mean, m1, m2, m3, axis });
    }

    console.log('== 소환 구체 재질 위계(구면감) 실측 ==');
    console.log('등급        재질   평균휘도   M1 터미네이터   M2 광축단조   M3 각고주파');
    let fail = 0;
    for (const r of rows) {
        const bad = [];
        if (r.m1 > GATE.m1) bad.push('M1');
        if (r.m2 < GATE.m2) bad.push('M2');
        if (r.m3 > GATE.m3) bad.push('M3');
        if (bad.length) fail++;
        console.log(`${r.kr.padEnd(8)}  ${r.mat.padEnd(6)} ${r.mean.toFixed(1).padStart(7)}`
            + `   ${r.m1.toFixed(3).padStart(10)}   ${r.m2.toFixed(3).padStart(9)}   ${r.m3.toFixed(3).padStart(9)}`
            + (bad.length ? `   ← FAIL ${bad.join(',')}` : '   PASS'));
    }
    console.log(`게이트: M1 ≤ ${GATE.m1} · M2 ≥ ${GATE.m2} · M3 ≤ ${GATE.m3}`);
    // M2가 떨어졌을 때 '어느 반경에서 다시 밝아졌는지'를 봐야 원인 층을 짚을 수 있다 —
    // 수치만 보고 층을 지우면 멀쩡한 재질 단서(유리 굴절 핫스팟 등)를 잃는다.
    if (process.argv.indexOf('--profile') >= 0) {
        console.log('\n-- 광축 휘도 프로파일 (r 0.36 → 0.90, 광원 반대 방향) --');
        for (const r of rows) console.log(`${r.kr.padEnd(8)} ` + r.axis.map(v => v.toFixed(0).padStart(4)).join(''));
    }
    const outPng = path.join(__dirname, 'sr-material.png');
    require('fs').writeFileSync(outPng, shot);
    console.log(`\n대조 시트: ${outPng} (좌→우 일반·희귀한·서사시·전설·궁극의·신화)`);
    console.log(errs.length ? `콘솔/페이지 에러 ${errs.length}건:\n  ` + errs.join('\n  ') : '콘솔/페이지 에러 0건');
    console.log(fail ? `판정: FAIL (${fail}/6 등급)` : '판정: PASS (6/6 등급)');
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
