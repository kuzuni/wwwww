// 보관함이 가득 찼을 때 소환 버튼 표기 검증 (slug: summon-btn-when-inventory-full)
// QA 20차 실측 그대로: 펫은 `소환 x0 · 🥚 0`(공짜로 0개 뽑는 것처럼 보임), 탈것은 멀쩡한
// `소환 x1 · ⚙️ 50` 인데 활성으로 남아 눌러도 절대 성공하지 않았다.
// 기대: 두 화면이 **같은 규칙** — 가득 차면 ⓐ 비활성 ⓑ 라벨/비용 자리에 이유(가득 + n/cap).
//
// 사용: node probe-summon-full-btn.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

let bad = 0;
const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Mounts !== 'undefined' && UI.els, null, { timeout: 20000 });
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });   // 전투 수입이 재화를 흔들지 않게

    // 버튼 상태를 한 번에 읽는다(텍스트·클래스·실측 높이)
    // ⚠️ **레이아웃이 앉을 때까지 기다린 뒤 재야 한다** — 탈것 목록은 250칸의 3D 썸네일을 다음
    //    프레임부터 채우느라(`hydrateMountThumbs`) 한동안 높이가 흔들린다. 고정 400ms 로 쟀더니
    //    같은 버튼이 40.9px 로 헛나와 없는 회귀를 보고했다(실측). 연속 두 번 같은 값이 나올 때까지 본다.
    const readBtn = async (sel) => {
        let prev = null;
        for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(150);
            const cur = await page.evaluate((s) => {
                const b = document.querySelector(s);
                if (!b) return null;
                const r = b.getBoundingClientRect();
                return { text: b.textContent.replace(/\s+/g, ' ').trim(), cls: b.className, h: +r.height.toFixed(1), w: +r.width.toFixed(1) };
            }, sel);
            if (prev && cur && prev.h === cur.h && prev.w === cur.w) return cur;
            prev = cur;
        }
        return prev;
    };

    // ── ① 펫: 알 보관함 100/100 ────────────────────────────────────
    console.log('── ① 펫 (알 보관함 가득) ──');
    await page.evaluate(() => {
        S.eggs = Array.from({ length: Pets.EGG_CAP }, () => ({ rarity: 'common' }));
        S.eggCurrency = 100000;                 // 재화는 넉넉히 — '못 누르는 이유'가 보관함뿐이도록
        UI.switchTab('summon'); UI.switchSummonSub('pets');   // 펫은 소환 탭의 서브탭이다
    });
    const petFull = await readBtn('#panel-pets .summon-btn');
    await page.locator('#panel-pets .summon-bar').screenshot({ path: 'summon-full-pet.png' });
    chk(/가득/.test(petFull.text), `라벨에 이유가 있다 — "${petFull.text}"`);
    chk(!/x0/.test(petFull.text), '`소환 x0` 이 사라졌다(공짜로 0개 뽑는 것처럼 보이던 표기)');
    chk(/\b100\/100\b/.test(petFull.text), '가득 찬 수치 100/100 를 보여준다');
    chk(/\bdisabled\b/.test(petFull.cls), `비활성 유지 — class="${petFull.cls}"`);

    // 배수를 x5 로 바꿔도 이유가 유지된다(종전에는 `소환 x0 0` 그대로라 토글이 죽은 것처럼 보였다)
    await page.evaluate(() => { S.summonMult = { pet: 5 }; UI.renderPets(); });
    const petFull5 = await readBtn('#panel-pets .summon-btn');
    chk(/가득/.test(petFull5.text) && /100\/100/.test(petFull5.text), `x5 로 토글해도 같은 이유 — "${petFull5.text}"`);

    // 눌러도 재화가 새지 않고 토스트가 같은 사실을 말한다
    const petClick = await page.evaluate(() => {
        const before = { cur: S.eggCurrency, eggs: S.eggs.length };
        UI.onSummonPetEgg();
        const t = document.querySelector('.toast, #toast-lane .toast, .toast-lane .toast');
        return { before, after: { cur: S.eggCurrency, eggs: S.eggs.length }, toast: t ? t.textContent.trim() : null };
    });
    chk(petClick.before.cur === petClick.after.cur && petClick.before.eggs === petClick.after.eggs,
        `눌러도 재화·보관함 불변 — 🥚화폐 ${petClick.before.cur}→${petClick.after.cur} · 알 ${petClick.before.eggs}→${petClick.after.eggs}`);
    chk(!!petClick.toast && /가득/.test(petClick.toast), `토스트도 같은 사실을 말한다 — "${petClick.toast}"`);

    // 대조군: 한 칸 비우면 곧바로 평소 표기로 돌아온다
    await page.evaluate(() => { S.eggs.pop(); S.summonMult = { pet: 1 }; UI.renderPets(); });
    const petFree = await readBtn('#panel-pets .summon-btn');
    chk(/소환 x1/.test(petFree.text) && !/가득/.test(petFree.text), `여유 1칸 → 평소 표기 복귀 — "${petFree.text}"`);
    chk(!/\bdisabled\b/.test(petFree.cls), '여유가 생기면 활성 — class="' + petFree.cls + '"');
    // 레이아웃 회귀: 가득/평소 버튼 높이가 흔들리면 안 된다(두 줄 구조 유지)
    const dh = Math.abs(petFull.h - petFree.h) / petFree.h * 100;
    chk(dh <= 2, `버튼 높이 변화 ${dh.toFixed(2)}%p (가득 ${petFull.h}px vs 평소 ${petFree.h}px, 허용 ±2%p)`);

    // ── ② 탈것: 보관함 250/250 ────────────────────────────────────
    console.log('\n── ② 탈것 (보관함 가득) ──');
    await page.evaluate(() => {
        Mounts.ensure();
        S.mounts = Array.from({ length: Mounts.INV_CAP }, () => ({ name: '당나귀', rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] }));
        S.winders = 100000;
        UI.openMounts();
    });
    const mFull = await readBtn('#mount-modal .summon-btn');
    await page.locator('#mount-modal .summon-bar').screenshot({ path: 'summon-full-mount.png' });
    chk(/가득/.test(mFull.text), `라벨에 이유가 있다 — "${mFull.text}"`);
    chk(/\b250\/250\b/.test(mFull.text), '가득 찬 수치 250/250 를 보여준다');
    chk(/\bdisabled\b/.test(mFull.cls), `비활성이 붙는다(종전에는 안 붙었다) — class="${mFull.cls}"`);

    const mClick = await page.evaluate(() => {
        const before = { w: S.winders, n: Mounts.count() };
        UI.onSummonMount();
        return { before, after: { w: S.winders, n: Mounts.count() } };
    });
    chk(mClick.before.w === mClick.after.w && mClick.before.n === mClick.after.n,
        `눌러도 재화·보관함 불변 — ⚙️ ${mClick.before.w}→${mClick.after.w} · 탈것 ${mClick.before.n}→${mClick.after.n}`);

    await page.evaluate(() => { S.mounts.pop(); UI.openMounts(); });
    const mFree = await readBtn('#mount-modal .summon-btn');
    chk(/소환 x/.test(mFree.text) && !/가득/.test(mFree.text), `여유 1칸 → 평소 표기 복귀 — "${mFree.text}"`);
    chk(!/\bdisabled\b/.test(mFree.cls), '여유가 생기면 활성');
    const dh2 = Math.abs(mFull.h - mFree.h) / mFree.h * 100;
    chk(dh2 <= 2, `버튼 높이 변화 ${dh2.toFixed(2)}%p (가득 ${mFull.h}px vs 평소 ${mFree.h}px, 허용 ±2%p)`);

    // ── ③ 회귀: 여유가 배수보다 적을 때의 클램프는 그대로여야 한다 ──
    console.log('\n── ③ 회귀: 부분 여유 클램프(의도된 동작)는 건드리지 않았다 ──');
    const clamp = await page.evaluate(() => {
        S.eggs = Array.from({ length: Pets.EGG_CAP - 3 }, () => ({ rarity: 'common' }));   // 여유 3칸
        S.eggCurrency = 100000; S.summonMult = { pet: 5 }; UI.renderPets();
        const b = document.querySelector('#panel-pets .summon-btn');
        const label = b.textContent.replace(/\s+/g, ' ').trim();
        const r = Pets.summon(5);
        return { label, space: 3, summoned: r && r.summoned, clamped: r && r.clamped, eggs: S.eggs.length };
    });
    chk(/소환 x3/.test(clamp.label), `여유 3칸 + x5 → 라벨이 실제 소환 수로 줄어든다 — "${clamp.label}"`);
    chk(clamp.summoned === 3 && clamp.clamped === true, `x5 를 눌러도 3개만 나간다(clamped=${clamp.clamped}, summoned=${clamp.summoned})`);

    chk(errors.length === 0, `콘솔 에러 ${errors.length}건${errors.length ? ' — ' + errors[0].slice(0, 140) : ''}`);

    await browser.close();
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과');
    process.exit(bad ? 1 : 0);
})();
