// `probe-emblem-core` 의 **속살 판정식 자체**를 고른다 — 문턱 후보를 늘어놓고 셋을 한꺼번에 본다:
//   ⓐ 옛 화법(글로시 흰 채움)  ⓑ 새 화법(평면 3단)  ⓒ 음성 대조(키라인 0.16 으로 살찌운 새 화법)
//
// 왜: 이 자의 임무는 딱 하나다 — **"두꺼운 키라인이 가는 부재를 통째로 검게 먹었나"**.
// 그런데 종전 정의('루마 ≥110')도, 그 자리에 넣어 본 상대 정의('≥0.55×채움 85백분위')도
// 실제로는 **'채움이 흰가'** 를 재고 있었다: 새 화법은 `shot-emblem-ab.js` 로 보면 38px 에서
// 옛 화법보다 **더 잘 읽히는데도** 두 정의 모두에서 7~10종이 '미달'로 찍힌다. 상대 정의로
// 밴드 밝기를 0.80 까지 올려 봐도 최소 속살이 27~28% 에서 꿈쩍하지 않는다(=밝기 탓이 아니다).
// 둘 다 **글리프와 오브 바탕의 대비**(진짜 읽힘)는 아예 안 본다 — 흰 글리프가 흰 오브 위에서
// 사라져도 만점이다. 그건 `probe-skill-orb-ink` 의 몫이다.
//
// 그래서 판정식을 고르는 기준은 **'무엇을 잡아야 하는가'** 하나로 좁힌다:
//   ① 음성 대조(살찐 키라인)를 확실히 잡아야 한다(대다수 종이 미달로 걸릴 것).
//   ② 눈으로 읽히는 게 확인된 두 화법(옛·새)에는 **둘 다 조용해야** 한다.
// ①은 되고 ②가 안 되면 그 문턱은 '검은 막대기'가 아니라 '흰 채움'을 재고 있는 것이다.
//
// 사용: node sweep-emblem-core-th.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const AT = 38, GATE = 34, FAT = 0.16;

// 후보: {kind:'abs', v} = 루마 ≥ v · {kind:'rel', v} = 루마 ≥ v × (실루엣 루마 85백분위)
const THS = [
    { kind: 'abs', v: 50 }, { kind: 'abs', v: 60 }, { kind: 'abs', v: 70 },
    { kind: 'abs', v: 80 }, { kind: 'abs', v: 95 }, { kind: 'abs', v: 110 },
    { kind: 'rel', v: 0.40 }, { kind: 'rel', v: 0.48 }, { kind: 'rel', v: 0.55 },
];

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof IconGen !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });

    const data = await page.evaluate(async (a) => {
        const names = Object.keys(IconGen.draw).filter(n => /^sk_|^tm_/.test(n));
        const BASE = JSON.parse(JSON.stringify(IconGen._EMBLEM_STEP));
        async function lumas(patch) {                 // 판(版)별 종별 실루엣 루마 목록
            IconGen._EMBLEM_STEP = Object.assign({}, BASE, patch);
            IconGen.cache = {};
            const per = {};
            for (const name of names) {
                let u = ''; try { u = IconGen.url(name); } catch (e) { }
                if (!u) continue;
                const im = new Image();
                await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
                const c = document.createElement('canvas'); c.width = a.AT; c.height = a.AT;
                const x = c.getContext('2d', { willReadFrequently: true });
                x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
                x.drawImage(im, 0, 0, a.AT, a.AT);
                const d = x.getImageData(0, 0, a.AT, a.AT).data, L = [];
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 120) continue;
                    L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                }
                per[name] = L;
            }
            return per;
        }
        const out = {
            old: await lumas({ legacy: true }),
            neo: await lumas({}),
            fat: await lumas({ keyline: a.FAT }),
        };
        IconGen._EMBLEM_STEP = BASE; IconGen.cache = {};
        return out;
    }, { AT, FAT });

    const score = (per, th) => {
        let bad = 0, min = 101, minName = '';
        for (const name of Object.keys(per)) {
            const L = per[name];
            if (!L || L.length < 40) { bad++; continue; }
            let t = th.v;
            if (th.kind === 'rel') {
                const s = L.slice().sort((p, q) => p - q);
                t = th.v * s[Math.min(s.length - 1, Math.floor(s.length * 0.85))];
            }
            const pct = L.filter(v => v >= t).length / L.length * 100;
            if (pct < GATE) bad++;
            if (pct < min) { min = pct; minName = name; }
        }
        return { bad, min, minName };
    };

    const n = Object.keys(data.neo).length;
    console.log(`엠블럼 ${n}종 · 표시 ${AT}px · 게이트 ${GATE}%\n`);
    console.log('  판정식            | 옛 화법 미달 | 새 화법 미달 | 음성대조 미달 | 판정');
    for (const th of THS) {
        const o = score(data.old, th), q = score(data.neo, th), f = score(data.fat, th);
        // 쓸 만한 자 = 음성 대조는 대다수 잡고(≥60%), 읽히는 두 화법에는 조용하다(0종).
        const ok = f.bad >= n * 0.6 && o.bad === 0 && q.bad === 0;
        const label = th.kind === 'abs' ? `루마 ≥ ${th.v}`.padEnd(16) : `≥ ${th.v}×85백분위`.padEnd(16);
        console.log(`  ${label} | ${String(o.bad).padStart(7)}종 | ${String(q.bad).padStart(7)}종 | ` +
            `${String(f.bad).padStart(8)}종 | ${ok ? '✅ 쓸 만함' : '—'}   (새 최소 ${q.min.toFixed(1)}% ${q.minName})`);
    }
    console.log('\n※ ✅ 조건: 음성 대조 ≥60% 적발 + 옛·새 화법 각 0종 미달(둘 다 육안으로 읽히는 게 확인됨).');
    if (errs.length) console.log('콘솔 에러:', errs.slice(0, 3).join(' | '));
    await browser.close();
})();
