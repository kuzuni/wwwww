// 스킬 아이콘 **두 종의 실루엣을 ASCII 로 겹쳐 찍는다** — 어디가 품고 어디가 삐져나오는지 눈으로 본다.
//
// 왜 이 자가 필요한가 (2026-08-20 UI 스트림, 락 `icon-gen` — 이 세션이 만들었고 세 번 다 값을 했다):
//   `probe-skill-icon-distinct.js` 는 '어느 쌍이 얼마나 겹치나'는 답하지만 **왜 겹치나**는 답하지 않는다.
//   그런데 처방은 셋(ⓐ 품는 쪽을 좁힌다 · ⓑ 품기는 쪽을 한 축 늘린다 · ⓒ 상대의 골 방향으로 눕힌다)
//   중 **어느 것을 골라야 하는지가 겹치는 모양에 달려 있어서**, 목록만 보고 치수를 흔들면
//   '한 쌍만 보고 다른 무리로 걸어 들어가는' 함정(TODO 함정 ㉠)에 그대로 빠진다.
//   실제로 이 자를 돌리자마자 `시간 왜곡 ↔ 신의 창 .630` 의 정체가 5초 만에 나왔다 —
//   **창이 38px 에서 폭 12px 짜리 민 세로 막대**이고 **모래시계 허리도 정확히 12px** 이라 통째로 삼켜진 것.
//   맨 아래 두 줄(`A 중 b 밖` · `b 중 A 밖`)이 **포함이냐 상호 겹침이냐**를 바로 가른다:
//   한쪽이 10%대면 포함(→ 작은 쪽을 줄이면 IoU 가 되레 오른다), 양쪽이 20~30%대면 상호 겹침이다.
//
// 사용: node diag-icon-pair.js <idA> <idB> [px]
//   예: node diag-icon-pair.js timeWarp godspear 38
//   id 는 `SKILL_DEFS` 의 스킬 id (supernova · apocalypse · divineShield …).
//   px 은 실표시 크기 — 38(스킬 오브)과 20(작은 pill)을 **둘 다** 볼 것. 순위가 크기마다 갈린다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const A = process.argv[2], B = process.argv[3], PX = +(process.argv[4] || 38);

if (!A || !B) { console.error('사용: node diag-icon-pair.js <idA> <idB> [px]'); process.exit(2); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 200; i++) {
        if (await page.evaluate(() => typeof IconGen !== 'undefined' && typeof SKILL_DEFS !== 'undefined').catch(() => false)) break;
        await page.waitForTimeout(100);
    }
    // 🚨 `IconGen.url` 로 **실제 파이프라인**(슈퍼샘플링·아웃라인까지 거친 것)을 태운다.
    //    인자를 손으로 베껴 두면 코드가 바뀐 뒤에도 옛 값으로 재는 유령이 나온다(TODO 함정 ④).
    const out = await page.evaluate(async ({ A, B, PX }) => {
        const mask = async (id) => {
            const url = IconGen.url('sk_' + id, 128);
            if (!url) return null;
            const img = new Image(); img.src = url;
            await img.decode();
            const c = document.createElement('canvas'); c.width = c.height = PX;
            const g = c.getContext('2d'); g.clearRect(0, 0, PX, PX); g.drawImage(img, 0, 0, PX, PX);
            const d = g.getImageData(0, 0, PX, PX).data;
            const m = new Uint8Array(PX * PX);
            for (let i = 0; i < PX * PX; i++) m[i] = d[i * 4 + 3] > 115 ? 1 : 0;   // 알파 > .45 = 잉크(판정기와 같은 문턱)
            return Array.from(m);
        };
        return { a: await mask(A), b: await mask(B) };
    }, { A, B, PX });
    if (!out.a || !out.b) { console.error(`✗ 아이콘을 못 구웠다 — id 를 확인할 것 (sk_${A} / sk_${B})`); await browser.close(); process.exit(2); }
    const a = out.a, b = out.b;
    let ia = 0, ib = 0, inter = 0, uni = 0; const lines = [];
    for (let y = 0; y < PX; y++) {
        let row = '';
        for (let x = 0; x < PX; x++) {
            const i = y * PX + x, va = a[i], vb = b[i];
            if (va) ia++; if (vb) ib++; if (va && vb) inter++; if (va || vb) uni++;
            row += va && vb ? '#' : va ? 'A' : vb ? 'b' : '.';
        }
        lines.push(row);
    }
    console.log(`${A}(A, 대문자) vs ${B}(b, 소문자) @${PX}px   # = 겹침`);
    console.log(lines.join('\n'));
    console.log(`잉크 A=${ia} b=${ib} · 교집합=${inter} · 합집합=${uni} · IoU=${(inter / uni).toFixed(3)}`);
    const oa = (ia - inter) / ia * 100, ob = (ib - inter) / ib * 100;
    console.log(`A 중 b 밖 = ${ia - inter} (${oa.toFixed(1)}%) · b 중 A 밖 = ${ib - inter} (${ob.toFixed(1)}%)`);
    const lo = Math.min(oa, ob);
    console.log(lo < 20
        ? `📌 **포함**(작은 쪽이 ${lo.toFixed(1)}% 만 밖) — IoU ≈ |작은 쪽|/|큰 쪽| 이라 **작은 쪽을 줄이면 되레 오른다.**\n   처방: ⓐ 품는 쪽을 좁힌다 · ⓑ 품기는 쪽을 한 축 늘려 삐져나오게 한다 · ⓒ 상대의 '골' 방향으로 눕힌다.`
        : `📌 **상호 겹침**(양쪽 다 ${lo.toFixed(1)}% 이상 밖) — 포함이 아니므로 위 ⓐⓑⓒ 와 처방이 다르다.\n   ⚠️ 크기를 줄이는 길은 사용자 지시 ⑤('프레임의 85~95%로 꽉 차게')와 충돌하니 쓰지 말 것 — 남은 축은 **모양**이다.`);
    console.log(`콘솔 에러 ${errs.length}건 ${JSON.stringify(errs.slice(0, 3))}`);
    await browser.close();
})();
