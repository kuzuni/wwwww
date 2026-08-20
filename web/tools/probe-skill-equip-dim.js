// 스킬 그리드 '장착됨' 오브의 **딤 강도**를 원본과 클론에서 같은 방법으로 재 비교한다.
//
// 왜 이 자가 필요했나: `.sk-orb.equipped::after` 는 `rgba(0,0,0,.58)` 로 깔려 있고, 그 옆 주석은
// "원본 4배 확대 실측: 아트 윤곽만 희미하게 남는 암도" 라고 적어 뒀다. 그런데 원본 shot-042340
// 3행 장착 오브 3개를 4배로 확대해 보면 **등급색(분홍·초록)과 모티프가 그대로 읽힌다** — 윤곽만
// 남는 수준이 아니다. 눈으로 갈리는 주장이라 **화소로** 갈라야 한다.
//
// 판정축(이미지 크기·오브 위치·시드 상태와 무관하게 비교되도록):
//   딤율 = 1 - (장착 오브 면의 평균 휘도 / 같은 이미지 안 미장착 오브 면의 평균 휘도)
// 즉 **같은 이미지 안에서** 장착/미장착을 비교해 비율만 뽑는다. 원본과 클론은 오브 색·스킬
// 구성이 다르므로 절대 휘도를 맞대면 안 된다(그 함정 때문에 앞 세션들이 헛수치를 냈다).
//
// 🚨 표본 함정 3가지 — 다 피해 뒀다:
//   ⑴ 검정 타원판('장착됨')이 오브 중심을 가린다 → 중심 띠(|dy| < 0.34R)는 통째로 제외.
//   ⑵ Lv 라벨이 오브 하단에 걸친다 → 아래쪽(dy > 0.34R)도 제외. 즉 **위쪽 고리만** 쓴다.
//      미장착 오브도 **같은 마스크**로 재야 비율이 성립한다(대칭 적용).
//   ⑶ 오브 테두리(검정 외곽선)가 평균을 끌어내린다 → 반지름 0.30R~0.78R 고리만.
// 🚨 **채도(saturation)는 이 자의 판정축이 될 수 없다** — 첫 판에서 걸려 넘어졌으니 적어 둔다.
//   클론의 장착 오브 3개는 마침 **일반 등급(회색)** 스킬이고 미장착 표본은 파랑/노랑이라, 채도
//   0.7% vs 37.7% 가 나온다. 이걸 '딤이 색을 죽였다'로 읽으면 오독이다 — 애초에 회색 스킬이다.
//   원본도 같은 병을 앓는다(장착=분홍/초록, 미장착=노랑 → 채도가 오히려 **올라간다**: -67%).
//   즉 장착/미장착 표본의 등급색이 서로 다르므로 **색 계열 수치는 비교 불가**다. 참고로만 찍는다.
//
// 🚨 **상대 내부대비 C = (p90-p10)/p50 도 판정축으로 쓰지 말 것** — 이 자에서 한 번 세웠다가
//   기각했으니 근거를 남긴다. 검정 오버레이는 RGB 에 상수배를 걸 뿐이라 C 가 이론상 불변이므로
//   그럴듯해 보였는데, **C 는 마스크에 모티프가 걸렸느냐에 통째로 좌우된다**: 원본 미장착 5개의
//   낱값이 `0.000 / 0.891 / 0.000 / 0.932 / 1.339` 로 **두 개가 정확히 0**(위쪽 초승달에 모티프가
//   안 걸려 면이 통짜였다)이라 분모 평균이 0.632 로 주저앉고, 비가 3.48 이라는 헛수치가 나왔다.
//   즉 C 는 '모티프가 읽히나'가 아니라 '모티프가 마침 표본에 걸렸나'를 잰다.
//   👉 '모티프가 오브 면과 갈리나'는 **`probe-skill-orb-ink.js`(잉크율)** 로 잰다 — 최빈 휘도를
//      바탕으로 잡아 |ΔL|≥40 화소 비율을 세므로 마스크에 모티프가 걸렸는지와 무관하다.
//      (그 자로 재면 클론 미장착 평균 잉크율 53.9% vs 원본 34.8% 로 **클론이 오히려 낫다**.)
//
// 사용: node probe-skill-equip-dim.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { assertFresh } = require('./clone-fresh.js');
/* 🚨 **이 자는 브라우저를 안 띄운다 — 커밋된 클론 캡처 PNG 를 원본과 맞대기만 한다.**
   그래서 게임 코드를 고치고 캡처를 다시 굽지 않으면 **옛 화면을 재면서 아무 말도 안 한다.**
   그 사고가 실제로 났다(`probe-skill-orb-ink` — `clone-fresh.js` 머리말에 전말이 있다).
   ⚠️ 지금은 **경고 전용**이다: 소스 목록이 `web/js`·`web/css` 로 넓어서 무관한 작업에도 자주
      걸리기 때문에 끊지는 않는다. 이 화면을 그리는 파일만으로 목록을 **좁힌 뒤** 네 번째 인자를
      빼면 하드 게이트(exit 2)가 된다. */
assertFresh('tools/ref-cmp/clone/skills.png', ['web/js', 'web/css'], 'node tools/shot-skills.js', { warnOnly: true });


// [파일, 라벨, 오브반지름R, [장착 오브 중심...], [미장착 오브 중심...]]
// 중심 좌표는 crop-zoom 확대 크롭에서 눈으로 집은 뒤 아래 자기검증(원반 채움률)으로 확인한다.
const CASES = [
    {
        file: path.resolve(__dirname, '../ref/screens/shot-042340.png'),
        label: '원본 shot-042340',
        r: 25,
        eq: [[233, 293], [321, 293], [409, 293]],
        un: [[57, 293], [145, 293], [57, 205], [145, 205], [233, 205]],
    },
    {
        file: path.resolve(__dirname, 'ref-cmp/clone/skills.png'),
        label: '클론 skills.png',
        r: 25,
        eq: [[94, 111], [172, 111], [249, 111]],
        un: [[327, 111], [404, 111], [94, 200], [172, 200], [249, 200]],
    },
];

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx * 100; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const out = [];
    let bad = 0;

    for (const c of CASES) {
        if (!fs.existsSync(c.file)) { console.error('없음:', c.file); process.exit(2); }
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(c.file).toString('base64');
        const res = await page.evaluate(async (a) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = a.dataUrl; });
            const cv = document.createElement('canvas');
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const D = g.getImageData(0, 0, cv.width, cv.height).data;
            const W = cv.width;
            // 위쪽 고리만: 반지름 0.30R~0.78R · dy < -0.34R (오브 중심보다 위)
            const ring = (cx, cy, R) => {
                let n = 0, sr = 0, sg = 0, sb = 0;
                const Ls = [];
                for (let dy = -R; dy <= R; dy++) {
                    for (let dx = -R; dx <= R; dx++) {
                        const d = Math.hypot(dx, dy) / R;
                        if (d < 0.30 || d > 0.78) continue;
                        if (dy > -0.34 * R) continue;            // 타원판·Lv 라벨 회피
                        const x = Math.round(cx + dx), y = Math.round(cy + dy);
                        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
                        const i = (y * W + x) * 4;
                        sr += D[i]; sg += D[i + 1]; sb += D[i + 2]; n++;
                        Ls.push(0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]);
                    }
                }
                if (!n) return null;
                Ls.sort((p, q) => p - q);
                const q = (t) => Ls[Math.min(Ls.length - 1, Math.max(0, Math.round(t * (Ls.length - 1))))];
                const p10 = q(0.10), p50 = q(0.50), p90 = q(0.90);
                return { n, r: sr / n, g: sg / n, b: sb / n, C: p50 > 1 ? (p90 - p10) / p50 : 0 };
            };
            const grab = (list) => list.map(([x, y]) => ring(x, y, a.r));
            return { eq: grab(a.eq), un: grab(a.un), w: cv.width, h: cv.height };
        }, { dataUrl, r: c.r, eq: c.eq, un: c.un });

        const stat = (arr) => {
            const L = arr.map(p => lum(p.r, p.g, p.b));
            const Sv = arr.map(p => sat(p.r, p.g, p.b));
            const Cv = arr.map(p => p.C);
            const avg = (v) => v.reduce((s, x) => s + x, 0) / v.length;
            return { L: avg(L), S: avg(Sv), C: avg(Cv), Ls: L, Cs: Cv };
        };
        const E = stat(res.eq), U = stat(res.un);
        const dim = (1 - E.L / U.L) * 100;
        const desat = (1 - E.S / U.S) * 100;
        const cRatio = E.C / U.C;
        out.push({ label: c.label, dim, desat, cRatio, E, U, size: `${res.w}x${res.h}` });

        console.log(`\n■ ${c.label}  (${res.w}x${res.h})`);
        console.log(`  장착 오브 ${res.eq.length}개 — 휘도 ${E.L.toFixed(1)} · 채도 ${E.S.toFixed(1)}% · 상대내부대비 C ${E.C.toFixed(3)}`);
        console.log(`     낱값 휘도: ${E.Ls.map(v => v.toFixed(1)).join(' / ')}`);
        console.log(`     낱값 C   : ${E.Cs.map(v => v.toFixed(3)).join(' / ')}`);
        console.log(`  미장착 오브 ${res.un.length}개 — 휘도 ${U.L.toFixed(1)} · 채도 ${U.S.toFixed(1)}% · 상대내부대비 C ${U.C.toFixed(3)}`);
        console.log(`     낱값 휘도: ${U.Ls.map(v => v.toFixed(1)).join(' / ')}`);
        console.log(`     낱값 C   : ${U.Cs.map(v => v.toFixed(3)).join(' / ')}`);
        console.log(`  ▶ 딤율 ${dim.toFixed(1)}%  ·  C비(장착/미장착) ${cRatio.toFixed(2)}  ·  (참고·비교불가) 탈채도율 ${desat.toFixed(1)}%`);
        if (U.L < 40) { console.log('  🚨 자기검증 실패 — 미장착 표본 휘도가 너무 낮다(좌표가 오브를 벗어났을 수 있다).'); bad++; }
    }

    await browser.close();

    const [ref, clone] = out;
    console.log('\n===== 대조 =====');
    console.log(`딤율   원본 ${ref.dim.toFixed(1)}%  vs  클론 ${clone.dim.toFixed(1)}%   (차 ${(clone.dim - ref.dim).toFixed(1)}%p)`);
    console.log('(참고·판정 제외) 탈채도율 · C비 — 위 머리말의 두 🚨 참조. 등급색 표본이 서로 달라 비교 불가다.');
    console.log(`   탈채도율 원본 ${ref.desat.toFixed(1)}% vs 클론 ${clone.desat.toFixed(1)}%   ·   C비 원본 ${ref.cRatio.toFixed(2)} vs 클론 ${clone.cRatio.toFixed(2)}`);
    if (bad) { console.log('\n측정기 고장 — 수치를 쓰지 말 것.'); process.exit(2); }
    const ok = Math.abs(clone.dim - ref.dim) <= 8;
    console.log(ok
        ? `\nPASS — 딤율이 원본 ±8%p 안이다(${(clone.dim - ref.dim).toFixed(1)}%p). \`.sk-orb.equipped::after\` 의 rgba(0,0,0,.58) 은 맞게 잡혀 있다.`
        : `\nFAIL — 딤율이 원본과 ${(clone.dim - ref.dim).toFixed(1)}%p 어긋난다.`);
    process.exit(ok ? 0 : 1);
})();
