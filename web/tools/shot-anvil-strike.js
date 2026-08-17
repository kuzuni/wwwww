// 모루 타격 연출 검증 — 클릭 → 망치 타격 프레임 → 비교 팝업 순서·타이밍 실측 + 정지 프레임 시트
// 판정은 rAF 타임라인(스크린샷 없음)으로, 그림은 애니메이션을 음수 지연으로 밀어 결정론적으로 찍는다
// (소프트웨어 GL에서 스크린샷 1장이 ~1초라 "자고 찍기"는 프레임 시각이 통째로 거짓이 된다).
// 사용: node shot-anvil-strike.js  → tools/anvil-strike.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STEP = 90, FRAMES = 9;   // 0 ~ 720ms

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 20000 });
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });
    // rAF 안정화 대기 — 콜드스타트 직후엔 셰이더 컴파일로 프레임이 수 초씩 멈춘다
    await page.evaluate(() => new Promise(res => {
        let last = performance.now(), stable = 0;
        const w = () => { const n = performance.now(); stable = (n - last) < 220 ? stable + 1 : 0; last = n;
            if (stable >= 10 || n > 20000) res(); else requestAnimationFrame(w); };
        requestAnimationFrame(w);
    }));

    // ── 타임라인: 클릭 순간부터 망치·불티·링·팝업 등장을 매 프레임 기록 ──
    const tl = await page.evaluate(() => new Promise(res => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
            const t = performance.now() - t0;
            if (t > 1600) return res(out);
            const fx = document.querySelector('.anvil-fx');
            const btn = document.querySelector('.anvil-btn');
            const ham = fx && fx.querySelector('.af-hammer');
            out.push({
                t: Math.round(t),
                fx: !!fx,
                striking: !!(btn && btn.classList.contains('striking')),
                hammer: ham ? getComputedStyle(ham).transform : 'none',
                sparks: fx ? fx.querySelectorAll('.af-spark').length : 0,
                modal: !UI.els.craftModal.classList.contains('hidden'),
                hammers: S.hammers, busy: !!UI._anvilBusy,
            });
            requestAnimationFrame(tick);
        };
        // 모루는 메인 화면 장비 시트에 늘 떠 있다 — 탭을 옮기면(메뉴 등) 오히려 가려진다
        const before = S.hammers;
        UI.onCraft();
        UI.onCraft();                    // 연타 — 연출 중 재클릭은 무시돼야 한다
        window.__spent = before - S.hammers;
        requestAnimationFrame(tick);
    }));

    // ── 정지 프레임 시트 ──
    // ⚠️ 여기서 거는 인라인 animation-delay는 .af-ring.h0/h1/h2가 CSS로 갖고 있는 개별 지연(.17/.41/.65s)을
    //    덮어쓴다 — 그래서 정지 프레임에서는 링 3개가 같이 뜬다. 실제 타격 시각이 어긋난 게 아니라 캡처
    //    방식의 한계이며, 타격 순서 판정은 위의 실시간 타임라인이 담당한다.
    await page.evaluate(() => { UI.els.craftModal.classList.add('hidden'); UI.clearPendingCraft(); });
    const shots = [], poses = [];
    for (let i = 0; i < FRAMES; i++) {
        poses.push(await page.evaluate((ms) => {
            document.querySelectorAll('.anvil-fx').forEach(n => n.remove());
            const btn = document.querySelector('.anvil-btn');
            UI._anvilBusy = false;
            UI.playAnvilStrike(() => {});
            const fx = document.querySelector('.anvil-fx');
            for (const n of [btn, fx, ...fx.querySelectorAll('*')]) {
                n.style.animationPlayState = 'paused';
                n.style.animationDelay = `-${ms}ms`;
            }
            const h = fx.querySelector('.af-hammer'), r = fx.querySelector('.af-ring.h2');
            return { hammer: getComputedStyle(h).transform, hOp: getComputedStyle(h).opacity,
                     ring: getComputedStyle(r).transform, rOp: getComputedStyle(r).opacity };
        }, i * STEP));
        // 캡처 영역은 모루 버튼 rect에서 실측해 잡는다 — 좌표를 손으로 박으면 레이아웃이 바뀔 때 엉뚱한 데를 찍는다
        const clip = await page.evaluate(() => {
            const b = document.querySelector('.anvil-btn').getBoundingClientRect();
            const pad = 70;
            return { x: Math.max(0, Math.round(b.x - pad)), y: Math.max(0, Math.round(b.y - pad)),
                     width: Math.round(b.width + pad * 2), height: Math.round(b.height + pad * 2) };
        });
        shots.push(await page.screenshot({ clip }));
    }
    const errsBeforeCompose = errors.length;
    const b64 = shots.map(b => 'data:image/png;base64,' + b.toString('base64'));
    await page.setViewportSize({ width: 1140, height: 800 });
    await page.evaluate(([imgs, step]) => {
        document.body.innerHTML = `<div id="sheet" style="background:#111;padding:6px;width:1128px;display:flex;flex-wrap:wrap;gap:4px">`
            + imgs.map((d, i) => `<div style="width:368px"><img src="${d}" style="width:368px;display:block"><div style="font:12px sans-serif;color:#eee;text-align:center">${i * step}ms</div></div>`).join('')
            + `</div>`;
    }, [b64, STEP]);
    await page.locator('#sheet').screenshot({ path: path.join(__dirname, 'anvil-strike.png') });

    // ── 판정 ──
    let bad = 0;
    const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };
    const fxOn = tl.filter(f => f.fx);
    const firstModal = tl.find(f => f.modal);
    const spent = await page.evaluate(() => window.__spent);
    console.log(`타임라인 ${tl.length}프레임 (rAF ${Math.round(tl.length / (tl[tl.length - 1].t / 1000))}fps)`);
    chk(fxOn.length > 0, `타격 오버레이 표시 ${fxOn.length}프레임`);
    if (fxOn.length) {
        const dur = fxOn[fxOn.length - 1].t - fxOn[0].t;
        chk(dur >= 450 && dur <= 950, `타격 연출 길이 ${dur}ms (요구 600~900ms 대)`);
        // 망치 궤적은 실시간 샘플(여기선 ~4fps)로는 못 본다 — 결정론적 정지 프레임 쪽에서 판정한다
        const hSet = new Set(poses.map(p => p.hammer));
        chk(hSet.size >= 6, `망치가 실제로 움직임 (정지 프레임 ${poses.length}개 중 ${hSet.size}종 transform)`);
        const rSet = new Set(poses.map(p => p.ring));
        chk(rSet.size >= 3, `타격 링이 퍼짐 (${rSet.size}종 scale)`);
        chk(Math.max(...fxOn.map(f => f.sparks)) >= 18, `불티 ${Math.max(...fxOn.map(f => f.sparks))}개 생성`);
        chk(fxOn.every(f => f.striking), '연출 중 모루 버튼이 눌림 상태(striking) 유지');
    }
    chk(!!firstModal, firstModal ? `비교 팝업 등장 ${firstModal.t}ms` : '비교 팝업이 뜨지 않음');
    if (firstModal && fxOn.length) chk(firstModal.t >= fxOn[fxOn.length - 1].t, `팝업이 타격 연출 뒤에 뜸 (타격 종료 ${fxOn[fxOn.length - 1].t}ms → 팝업 ${firstModal.t}ms)`);
    chk(spent === 1, `연타해도 해머 1개만 소모 (실측 ${spent}개) — 연출 중 재클릭 무시`);
    chk(tl.some(f => f.busy), '연출 중 _anvilBusy 잠금 관측');
    const gameErrs = errors.slice(0, errsBeforeCompose);
    console.log(gameErrs.length ? '✗ 콘솔 에러 ' + gameErrs.length + '건: ' + gameErrs.slice(0, 4).join(' | ') : '✓ 콘솔 에러 0건');
    console.log('→ tools/anvil-strike.png');
    await browser.close();
    process.exit(bad || gameErrs.length ? 1 : 0);
})();
