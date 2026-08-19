// '장착하면 팝업이 꺼진다/깜빡인다'(사용자 재지적 2026-08-17)의 재현·회귀 검증 도구.
//
// 게임 안에서 [장착] 라벨이 붙은 버튼은 5곳이다. 전부 같은 기준으로 잰다:
//   ① 보류 카드 클릭 → 비교 팝업 (보관함 폐기 후 유일한 '들고 있는' 상태)
//   ② 제작 비교 팝업 → [장착]                   (UI.resolveCraft('equip'))
//   ③ 펫 상세 → [장착]                          (UI.onTogglePet + openPetDetail)
//   ④ 스킬 상세 → [장착]                        (UI.onToggleSkill + openSkillDetail)
//   ⑤ 탈것 상세 → [장착]                        (UI.onEquipMount + openMountDetail)
// (⑥ 보관함 스크롤 보존 케이스는 보관함 시스템이 사용자 지시로 폐기되면서 함께 제거했다 —
// 재장착했을 때 맨 위로 튀면, 팝업은 열려 있어도 사용자 눈에는 '팝업이 사라졌다'로 읽힌다.
//
// 기대: ②만 닫히는 게 정상(판매/장착 강제 선택 팝업이라 고르면 끝난다).
//       ①③④⑤는 **닫히지 않고 갱신된 채 그대로** 열려 있어야 한다.
//
// 판정 근거를 classList의 'hidden' 하나로 잡으면 안 된다 — 'opening'이 재렌더마다 다시 붙으면
// CSS 진입 애니메이션(cardpop: scale .7 + opacity 0 → 1)이 재시작해서 사용자 눈에는
// '투명해졌다 다시 나타남'인데 hidden은 계속 false다. 그래서 세 갈래로 같이 잰다:
//   frames    — rAF마다 getComputedStyle (실제로 칠해진 모습)
//   mutations — class/style/childList 변경을 MutationObserver로 전부 포착
//               (헤드리스에서 rAF는 초당 몇 프레임까지 throttle되므로 프레임 사이 토글은 이걸로만 잡힌다)
//   hidden 추가 스택 — 누가 닫았는지 특정
//
// 버튼 선택자 주의: 펫/탈것 상세의 .petd-btn은 [업그레이드]가 먼저, [장착]이 나중이다.
// 첫 .petd-btn을 누르면 '업그레이드'라서 closeDetail()로 팝업이 정상적으로 닫히고,
// 이걸 버그로 오독하게 된다. 반드시 :last-child로 [장착]을 집는다.
//
// 사용: node probe-equip-popup.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const BOOT = async page => {
    await page.goto(INDEX, { waitUntil: 'load' });
    // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
    //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
    //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
    //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
    await waitBootDone(page);
    // UI·S는 최상위 const라 waitForFunction 컨텍스트에서 안 보일 때가 있다(실측으로 타임아웃 확인) —
    // 부팅 판정은 evaluate 폴링으로 한다.
    for (let i = 0, t0 = Date.now(); ; i++) {
        if (await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false)) break;
        if (Date.now() - t0 > 20000) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
    await page.waitForTimeout(700);
    await page.evaluate(() => { Combat.tick = function () {}; S.autoForgeOn = false; }); // 전투 수입이 장비/코인을 흔들지 않게
};

// 진입 애니메이션이 확실히 끝난 뒤에 재기 위한 대기 — 고정 sleep으로는 안 된다.
// showModal은 'opening'을 setTimeout 300ms로 떼는데, 3D 씬이 메인 스레드를 잡고 있으면
// 이 타이머가 600ms 넘게 밀린다. 고정 대기로 재면 '남아 있던 opening'을 '장착이 재부착한 opening'으로
// 오독해 없는 버그를 만들어 낸다(실제로 이 도구를 만들며 그렇게 한 번 헛짚었다).
const SETTLE = async (page, id) => {
    await page.waitForFunction(
        i => { const e = document.getElementById(i); return e && !e.classList.contains('hidden') && !e.classList.contains('opening'); },
        id, { timeout: 10000 });
    await page.waitForTimeout(120); // 애니메이션 종료 직후의 합성 잔여분까지 흘려보낸다
};

// 관찰 시작 — 대상 모달의 표시 상태를 프레임·변경 두 갈래로 기록하고, hidden을 붙인 호출자를 남긴다.
const ARM = id => {
    const el = document.getElementById(id);
    window.__frames = []; window.__muts = []; window.__hidden = [];
    const snap = () => {
        const cs = getComputedStyle(el);
        return {
            t: Math.round(performance.now()),
            hidden: el.classList.contains('hidden'),
            opening: el.classList.contains('opening'),
            opacity: Number(cs.opacity), visibility: cs.visibility, display: cs.display,
        };
    };
    window.__mo = new MutationObserver(rs => {
        for (const r of rs) window.__muts.push({ ...snap(), kind: r.type === 'attributes' ? r.attributeName : 'childList' });
    });
    window.__mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'], childList: true });
    const add = el.classList.add.bind(el.classList);
    el.classList.add = function (...a) {
        if (a.includes('hidden')) window.__hidden.push(new Error('hidden').stack);
        return add(...a);
    };
    window.__raf = true;
    (function step() { if (!window.__raf) return; window.__frames.push(snap()); requestAnimationFrame(step); })();
};
const DISARM = () => {
    window.__raf = false; window.__mo && window.__mo.disconnect();
    return { frames: window.__frames, muts: window.__muts, hidden: window.__hidden };
};

// 열린 채 유지돼야 하는 팝업의 판정 — 한 순간도 숨겨지거나 흐려지면 안 된다.
function judgeStaysOpen({ frames, muts, hidden }) {
    const bad = [];
    if (hidden.length) bad.push(`hidden 추가 ${hidden.length}회`);
    if (muts.some(m => m.hidden) || frames.some(f => f.hidden)) bad.push('hidden 관측됨');
    if (muts.some(m => m.opening) || frames.some(f => f.opening)) bad.push('opening 재부착(진입 애니메이션 재시작)');
    const minOp = Math.min(1, ...frames.map(f => f.opacity), ...muts.map(m => m.opacity));
    if (minOp < 0.99) bad.push(`opacity 최저 ${minOp}`);
    if (frames.length && !(frames[frames.length - 1].opacity > 0.99 && !frames[frames.length - 1].hidden)) bad.push('종료 시 안 보임');
    return bad;
}
// 닫히는 게 정상인 팝업의 판정 — '닫힌 뒤 다시 보임'(투명해졌다 재등장)만 잡는다.
// (2026-08-18 현재 호출부 없음 — 제작 비교 팝업이 '유지'로 뒤집히며 마지막 사용처가 사라졌다.
//  닫힘이 정상인 팝업이 다시 생기면 그대로 쓰면 되므로 남겨 둔다.)
function judgeClosesOnce({ frames, muts }) {
    const bad = [];
    const seq = frames.map(f => !f.hidden && f.display !== 'none' && f.opacity > 0.99);
    let blocks = 0;
    for (let i = 0; i < seq.length; i++) if (seq[i] && (i === 0 || !seq[i - 1])) blocks++;
    if (blocks > 1) bad.push(`보임 구간 ${blocks}개 — 닫혔다 다시 뜸`);
    if (seq.length && seq[seq.length - 1]) bad.push('끝까지 안 닫힘');
    let wasHidden = false;
    for (const m of muts) { if (m.hidden) wasHidden = true; else if (wasHidden && !m.hidden) bad.push('hidden 해제 — 재등장'); }
    return bad;
}

let fail = 0;
// 실패하면 원자료까지 같이 뱉는다 — 어느 프레임에서 무엇이 바뀌었는지 없이는 원인을 못 좁힌다.
const report = (label, bad, extra, raw) => {
    if (bad.length) fail++;
    console.log(`\n== ${label} == ${bad.length ? '*** FAIL ***' : 'PASS'}${extra ? '  ' + extra : ''}`);
    if (!bad.length) return;
    console.log('   ' + bad.join(' / '));
    if (!raw) return;
    console.log('   변경: ' + JSON.stringify(raw.muts));
    console.log('   프레임 앞 4: ' + JSON.stringify(raw.frames.slice(0, 4)));
    if (raw.hidden.length) console.log('   hidden 스택: ' + raw.hidden[0].split('\n').slice(0, 6).join(' | '));
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    const newPage = async tag => {
        const p = await browser.newPage({ viewport: { width: 430, height: 932 } });
        p.on('pageerror', e => errs.push(`${tag} ${e.message}`));
        p.on('console', m => { if (m.type() === 'error') errs.push(`${tag} ${m.text()}`); });
        await BOOT(p);
        return p;
    };

    // ---------- ① 보류 카드 클릭 → 비교 팝업 (보관함 폐기 후의 유일한 '들고 있는' 상태) ----------
    {
        const p = await newPage('①');
        await p.evaluate(() => {
            S.hammers = 300;
            const it = Forge.rollItem();
            UI.setPendingCraft(it);
            UI.els.craftModal.classList.add('hidden');   // 보류 상태(팝업 닫힘 + 모루 자리에 카드)
            UI.renderEquipSheet();
        });
        await p.waitForTimeout(500);
        const has = await p.evaluate(() => !!document.querySelector('.anvil-btn.held-slot'));
        if (!has) { console.log('\n== ①보류카드 == 준비 실패 — 카드가 없다'); fail++; await p.close(); }
        else {
            await p.evaluate(ARM, 'craft-modal');
            await p.click('.anvil-btn.held-slot');   // 직접 호출이 아니라 진짜 클릭
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            // 이 경로는 팝업이 '열리는' 게 정상이라 닫힘/재등장 판정 대신 열렸는지만 본다
            const opened = await p.evaluate(() => !document.getElementById('craft-modal').classList.contains('hidden'));
            report('①보류카드 → 비교 팝업', opened ? [] : ['팝업이 열리지 않았다'], `rAF표본=${r.frames.length}`, r);
            await p.close();
        }
    }

    // ---------- ② 제작 비교 팝업에서 장착 ----------
    // 🚨 **자리가 비어 있으면 [장착]은 팝업을 닫는 게 사양이다** (`doResolveCraft` 예외 ⑴ —
    //    내려올 옛 장비가 없으면 맞바꿀 게 없다). 종전 이 판정기는 `S.equipment = {}` 로
    //    **빈 자리를 만들어 놓고 '유지'를 요구**해서, 사양대로 닫는 코드를 계속 FAIL 로 찍었다
    //    (red-probes-4 ⑶ — 자가 낡은 게 아니라 처음부터 전제가 어긋나 있었다).
    //    그래서 두 갈래를 **갈라서** 잰다: ②-a 자리가 차 있으면 유지(스왑), ②-b 비어 있으면 닫힘.
    const openCraftPopup = async (p) => p.evaluate(async () => {
        S.hammers = 500; S.equipment = {};
        for (let i = 0; i < 20; i++) {
            UI.onCraft();
            await new Promise(r => setTimeout(r, 120));
            if (!document.getElementById('craft-modal').classList.contains('hidden')) return true;
        }
        return false;
    });

    // ②-a 자리가 차 있을 때 = 맞바꿈이라 팝업이 **유지**된다 (사용자 지시 2026-08-18
    //     "새거 장착했다가 예전꺼 장착했다가 판매할 수 있게").
    {
        const p = await newPage('②a');
        const opened = await openCraftPopup(p);
        if (!opened) { console.log('\n== ②a제작비교팝업 == 팝업이 뜨지 않아 측정 불가'); fail++; }
        else {
            // 대기품과 **같은 부위**에 옛 장비를 채워 스왑 경로를 만든다(빈 자리면 닫힘이 정상이라
            // 유지를 요구할 수 없다). 이 한 줄이 이 검사의 전제 그 자체다.
            await p.evaluate(() => { const it = UI._pendingItem; const prev = Forge.rollItem(); prev.slot = it.slot; S.equipment[it.slot] = prev; });
            await SETTLE(p, 'craft-modal');
            await p.evaluate(ARM, 'craft-modal');
            await p.click('#craft-modal .btn.equip');
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            report('②a제작비교팝업 장착·자리 참(유지 정상)', judgeStaysOpen(r), `rAF표본=${r.frames.length}`, r);
        }
        await p.close();
    }

    // ②-b 자리가 비어 있을 때 = 맞바꿀 옛 장비가 없으니 **닫힌다**. '닫혔다 다시 뜸'만 결함이다.
    {
        const p = await newPage('②b');
        const opened = await openCraftPopup(p);
        if (!opened) { console.log('\n== ②b제작비교팝업 == 팝업이 뜨지 않아 측정 불가'); fail++; }
        else {
            await p.evaluate(() => { S.equipment[UI._pendingItem.slot] = null; });
            await SETTLE(p, 'craft-modal');
            await p.evaluate(ARM, 'craft-modal');
            await p.click('#craft-modal .btn.equip');
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            const bad = judgeClosesOnce(r);
            const closed = await p.evaluate(() => document.getElementById('craft-modal').classList.contains('hidden'));
            if (!closed) bad.push('빈 자리에 장착했는데 팝업이 안 닫혔다');
            report('②b제작비교팝업 장착·빈 자리(닫힘 정상)', bad, `rAF표본=${r.frames.length}`, r);
        }
        await p.close();
    }

    // ---------- ③ 펫 상세 장착 ----------
    {
        const p = await newPage('③');
        const n = await p.evaluate(() => {
            S.eggCurrency = 999999;
            for (let r = 0; r < 8 && (S.pets || []).length < 3; r++) {
                Pets.summon(3);
                while ((S.eggs || []).length && S.hatching.length < Pets.maxHatchSlots()) Pets.startHatch(0);
                for (const h of S.hatching) h.endsAt = 0;   // 부화 완료로 강제
                Pets.tick();
            }
            S.activePets = [];
            return (S.pets || []).length;
        });
        if (!n) { console.log('\n== ③펫상세장착 == 펫 생성 실패 — 측정 불가'); fail++; }
        else {
            await p.evaluate(() => UI.openPetDetail(0));
            await SETTLE(p, 'detail-modal');
            await p.evaluate(ARM, 'detail-modal');
            await p.click('#detail-modal .petd-btns .petd-btn:last-child');  // :last-child = [장착] (첫째는 업그레이드)
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            report('③펫상세장착', judgeStaysOpen(r), `rAF표본=${r.frames.length}`, r);
        }
        await p.close();
    }

    // ---------- ④ 스킬 상세 장착 ----------
    {
        const p = await newPage('④');
        const id = await p.evaluate(() => {
            S.tickets = 999999;
            for (let i = 0; i < 40 && (!S.skills || !Object.keys(S.skills).length); i++) { try { Skills.summon(false, 1); } catch (e) {} }
            S.equippedSkills = [];
            return (S.skills && Object.keys(S.skills)[0]) || null;
        });
        if (!id) { console.log('\n== ④스킬상세장착 == 스킬 획득 실패 — 측정 불가'); fail++; }
        else {
            await p.evaluate(i => UI.openSkillDetail(i), id);
            await SETTLE(p, 'detail-modal');
            await p.evaluate(ARM, 'detail-modal');
            await p.click('#detail-modal .skd-btn:last-child');
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            report('④스킬상세장착', judgeStaysOpen(r), `rAF표본=${r.frames.length}`, r);
        }
        await p.close();
    }

    // ---------- ⑤ 탈것 상세 장착 ----------
    // 실제 경로 그대로 — 탈것 목록을 먼저 열고 타일을 눌러 상세로 들어간다.
    // (목록을 닫아 둔 채 상세만 직접 띄우면 onEquipMount 안의 openMounts()가
    //  전체화면 목록을 새로 여는, 실제로는 안 생기는 상태가 만들어진다.)
    {
        const p = await newPage('⑤');
        const n = await p.evaluate(() => {
            Mounts.ensure(); S.winders = 999999;
            for (let i = 0; i < 40 && Object.keys(S.mounts).length < 2; i++) { try { Mounts.summon(1); } catch (e) {} }
            S.activeMount = null;
            return Object.keys(S.mounts).length;
        });
        if (!n) { console.log('\n== ⑤탈것상세장착 == 탈것 획득 실패 — 측정 불가'); fail++; }
        else {
            await p.evaluate(() => UI.openMounts());
            await SETTLE(p, 'mount-modal');
            await p.click('#mount-modal .pet-tile');
            await SETTLE(p, 'detail-modal');
            await p.evaluate(ARM, 'detail-modal');
            await p.click('#detail-modal .petd-btns .petd-btn:last-child');
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            report('⑤탈것상세장착', judgeStaysOpen(r), `rAF표본=${r.frames.length}`, r);
        }
        await p.close();
    }

    console.log('\n콘솔/페이지 에러: ' + (errs.length ? '\n  ' + errs.slice(0, 10).join('\n  ') : '없음'));
    if (errs.length) fail++;
    console.log(fail ? `\n결과: 실패 ${fail}건` : '\n결과: 전부 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
