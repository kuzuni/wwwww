// 무기 썸네일 '자루 굵기' 판정기 (equip-era-theming ⓑ — 3차 채점 C·D 공통 지적)
//   지적: 96px 아이콘에서 창·지팡이·낫의 자루가 2~4px 로 증발해 '헤드만 떠 있는 그림'이 된다.
//   판정: 실루엣 **아래쪽 30% 행**(= 쥐는 구간, 헤드가 안 섞인다)의 행별 채워진 폭 중앙값 px.
//
// ⚠️ 함정 회피(TODO '비평가 채점 함정' ④ 계열):
//   ⑴ 인자를 손으로 베끼지 않는다 — `Scene3D.itemThumb` 을 **진짜 그대로** 태우고,
//      끄는 쪽은 `weaponThumbBulk` 를 no-op 으로 바꿔 **같은 경로**로 다시 굽는다(A/B 한 런).
//   ⑵ 캐시는 A/B 사이에 반드시 비운다(`_thumbCache`) — 안 비우면 두 값이 같게 나온다.
//   ⑶ '전체 실루엣 폭'으로 재지 않는다 — 헤드(촉·크리스탈·날)가 섞여 자루가 굵어져도 지표가 안 움직인다.
//
// 사용: node probe-thumb-shaft.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 자루가 있는 무기 = 이 항목의 대상. (검·단검·총기는 자루가 실루엣의 주인공이 아니다 — 참고 출력만)
const SHAFTED = ['spear', 'staff', 'scythe', 'axe', 'hammer', 'mace', 'club', 'thrown'];
const GATE = 6;   // px @96 — 4px 이하가 '증발'로 읽힌 값이므로 그 위로 확실히 뗀다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 콜드 스타트 상한은 60s — 스위프트셰이더 소프트웨어 GL 컨테이너에서 20s 는 간헐 TimeoutError (shot-hero.js 함정 기록)
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && typeof WEAPON_TYPES !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const res = await page.evaluate(async (opt) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 96;
        const cx = cv.getContext('2d');
        const widthOf = (url) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                cx.clearRect(0, 0, 96, 96);
                cx.drawImage(img, 0, 0, 96, 96);
                const d = cx.getImageData(0, 0, 96, 96).data;
                const rows = [];
                for (let y = 0; y < 96; y++) {
                    let n = 0;
                    for (let x = 0; x < 96; x++) if (d[(y * 96 + x) * 4 + 3] > 16) n++;
                    if (n > 0) rows.push({ y, n });
                }
                if (!rows.length) return resolve(null);
                // 아래쪽 30% 행 = 쥐는 구간. 헤드가 안 섞이므로 자루 굵기가 그대로 나온다.
                const y0 = rows[0].y, y1 = rows[rows.length - 1].y;
                const cut = y1 - (y1 - y0) * 0.30;
                const grip = rows.filter(r => r.y >= cut).map(r => r.n).sort((a, b) => a - b);
                const all = rows.map(r => r.n).sort((a, b) => a - b);
                resolve({
                    grip: grip.length ? grip[grip.length >> 1] : 0,
                    gripMin: grip.length ? grip[0] : 0,
                    span: y1 - y0 + 1,
                    wide: all[all.length - 1],
                });
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });

        const out = { on: {}, off: {}, bulk: {}, order: [] };
        const mk = (w) => {
            const age = (typeof weaponsOfAge === 'function' && weaponsOfAge('medieval').indexOf(w) >= 0) ? 'medieval'
                : (typeof AGES !== 'undefined' ? (AGES.find(a => weaponsOfAge(a).indexOf(w) >= 0) || 'medieval') : 'medieval');
            return { name: (WEAPON_TYPES[w] || {}).kr || w, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'legendary', level: 10, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: 0 };
        };
        const types = Object.keys(WEAPON_TYPES);
        // ① 켠 상태 — 실제 출하 경로 그대로. 배율 k 는 코드가 준 값을 그대로 받아 찍는다(손 계산 금지).
        const realBulk = Scene3D.weaponThumbBulk.bind(Scene3D);
        // ⚠️ 인자를 **전부 그대로 흘려보낸다**(`...a`) — 하나라도 빠뜨리면 실제 코드가 다른 인자로
        //    돌아 '전종 무변화' 같은 유령 결과가 나온다(실측: wtypeId 를 안 넘겨 화이트리스트가 전부 탈락).
        Scene3D.weaponThumbBulk = function (...a) { const r = realBulk(...a); if (r) out.bulk[this.__w] = r; return r; };
        for (const w of types) {
            Scene3D.__w = w;
            Scene3D._thumbCache = {};
            const u = Scene3D.itemThumb(mk(w));
            out.on[w] = u ? await widthOf(u) : null;
            out.order.push(w);
        }
        // ② 끈 상태 — 같은 경로, 과장만 no-op
        Scene3D.weaponThumbBulk = function () { return null; };
        for (const w of types) {
            Scene3D._thumbCache = {};
            const u = Scene3D.itemThumb(mk(w));
            out.off[w] = u ? await widthOf(u) : null;
        }
        Scene3D.weaponThumbBulk = realBulk;
        Scene3D._thumbCache = {};
        return out;
    }, {});

    const pad = (s, n) => String(s).padEnd(n);
    console.log('무기 썸네일 자루 굵기 (96px, 아래 30% 행 중앙값) — off = 과장 없음 / on = 출하');
    console.log(pad('wtype', 12) + pad('off', 6) + pad('on', 6) + pad('Δ', 6) + pad('k', 7) + pad('parts', 7) + '판정');
    let fail = [], changed = 0;
    for (const w of res.order) {
        const on = res.on[w], off = res.off[w], b = res.bulk[w];
        if (!on || !off) { fail.push(w + '(썸네일 없음)'); continue; }
        const shafted = SHAFTED.indexOf(w) >= 0;
        if (b) changed++;
        let verdict = shafted ? (on.grip >= GATE ? 'PASS' : 'FAIL(자루 ' + on.grip + 'px < ' + GATE + ')') : '(참고)';
        if (shafted && on.grip < GATE) fail.push(w + ' 자루 ' + on.grip + 'px');
        // 회귀: 과장이 걸린 종은 반드시 굵어져야 한다(안 굵어지면 코드가 실제로는 안 도는 것)
        if (b && on.grip <= off.grip) { fail.push(w + ' k=' + b.k.toFixed(2) + ' 인데 폭이 안 늘었다(' + off.grip + '→' + on.grip + ')'); verdict += ' ⚠️무변화'; }
        console.log(pad(w, 12) + pad(off.grip, 6) + pad(on.grip, 6) + pad((on.grip - off.grip >= 0 ? '+' : '') + (on.grip - off.grip), 6)
            + pad(b ? b.k.toFixed(2) : '-', 7) + pad(b ? b.parts : '-', 7) + verdict);
    }
    console.log('\n과장이 걸린 종: ' + changed + '개');
    console.log('콘솔 에러: ' + errors.length + (errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''));
    console.log(fail.length ? '\n❌ FAIL ' + fail.length + '건: ' + fail.join(', ') : '\n✅ PASS — 자루 있는 무기 전종 ' + GATE + 'px 이상');
    await browser.close();
    process.exit(fail.length || errors.length ? 1 : 0);
})();
