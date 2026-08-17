// '장착하면 팝업이 꺼진다/깜빡인다'(사용자 재지적 2026-08-17)의 재현·회귀 검증 도구.
//
// 게임 안에서 [장착] 라벨이 붙은 버튼은 5곳이다. 전부 같은 기준으로 잰다:
//   ① 장비 상세/보관함 팝업 → 보관 장비 [장착]  (UI.onEquipStored)
//   ② 제작 비교 팝업 → [장착]                   (UI.resolveCraft('equip'))
//   ③ 펫 상세 → [장착]                          (UI.onTogglePet + openPetDetail)
//   ④ 스킬 상세 → [장착]                        (UI.onToggleSkill + openSkillDetail)
//   ⑤ 탈것 상세 → [장착]                        (UI.onEquipMount + openMountDetail)
// 여기에 ⑥ 보관함 스크롤 보존을 더한다(병행 UI 세션이 찾아 고친 실제 결함) — 목록을 내려 둔 채
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
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const BOOT = async page => {
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
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

    // ---------- ① 보관함에서 재장착 (여러 조건) ----------
    // S.inventory는 부위별 배열을 담는 **객체**다(Forge.ensureInventory) — 배열로 덮으면 안 된다.
    // rollItem()은 부위를 무작위로 고르므로 slot만 맞춰 심는다.
    const GEAR_CASES = [
        { name: '장착1+보관3', eq: true, n: 3 },
        { name: '장착1+보관1', eq: true, n: 1 },
        { name: '빈슬롯+보관1 (장착 뒤 보관 0 → 보관함 박스가 사라져 카드가 줄어드는 경우)', eq: false, n: 1 },
        { name: '빈슬롯+보관2', eq: false, n: 2 },
    ];
    for (const c of GEAR_CASES) {
        const p = await newPage('①');
        const st = await p.evaluate(({ eq, n }) => {
            S.hammers = 500; S.equipment = {}; S.inventory = {}; Forge.ensureInventory();
            const need = n + (eq ? 1 : 0), got = [];
            for (let i = 0; i < 120 && got.length < need; i++) {
                const it = Forge.rollItem(); if (!it) continue;
                it.slot = 'weapon'; it.main = SLOT_MAIN['weapon']; got.push(it);
            }
            if (eq) S.equipment.weapon = got.shift();
            for (const it of got) Forge.inventoryOf('weapon').push(it);
            UI.renderEquipSheet();
            return { eq: !!S.equipment.weapon, stored: Forge.inventoryOf('weapon').length };
        }, c);
        if (st.stored < 1) { console.log(`\n== ①보관함재장착 ${c.name} == 준비 실패 — 측정 불가`); fail++; await p.close(); continue; }
        await p.evaluate(() => UI.openGearDetail('weapon'));
        await SETTLE(p, 'gear-detail-modal');           // 진입 애니메이션이 끝난 뒤부터 잰다
        await p.evaluate(ARM, 'gear-detail-modal');
        await p.click('#gear-detail-modal .inv-row .btn.equip');   // 직접 호출이 아니라 진짜 클릭
        await p.waitForTimeout(700);
        const r = await p.evaluate(DISARM);
        report(`①보관함재장착 ${c.name}`, judgeStaysOpen(r), `rAF표본=${r.frames.length} DOM변경=${r.muts.length}`, r);
        await p.close();
    }

    // ---------- ② 제작 비교 팝업에서 장착 (닫히는 게 정상) ----------
    {
        const p = await newPage('②');
        const opened = await p.evaluate(async () => {
            S.hammers = 500; S.equipment = {};
            for (let i = 0; i < 20; i++) {
                UI.onCraft();
                await new Promise(r => setTimeout(r, 120));
                if (!document.getElementById('craft-modal').classList.contains('hidden')) return true;
            }
            return false;
        });
        if (!opened) { console.log('\n== ②제작비교팝업 == 팝업이 뜨지 않아 측정 불가'); fail++; }
        else {
            await SETTLE(p, 'craft-modal');
            await p.evaluate(ARM, 'craft-modal');
            await p.click('#craft-modal .btn.equip');
            await p.waitForTimeout(700);
            const r = await p.evaluate(DISARM);
            report('②제작비교팝업 장착(닫힘 정상)', judgeClosesOnce(r), `rAF표본=${r.frames.length}`, r);
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

    // ---------- ⑥ 보관함 스크롤 보존 ----------
    // installScrollKeeper()는 render* 만 감싼다. 재렌더를 openGearDetail(= open* )로 하면
    // 스크롤 보존을 안 타서 목록이 매번 맨 위로 튄다 — 그래서 재렌더 경로를 render*로 분리했다(047120a).
    {
        const p = await newPage('⑥');
        const setup = await p.evaluate(() => {
            S.hammers = 500; S.equipment = {}; S.inventory = {}; Forge.ensureInventory();
            for (let i = 0; i < 10; i++) { const it = Forge.rollItem(); if (!it) continue; it.slot = 'weapon'; it.main = SLOT_MAIN['weapon']; Forge.store(it); }
            if (!S.equipment.weapon) { const it = Forge.rollItem(); it.slot = 'weapon'; it.main = SLOT_MAIN['weapon']; Forge.equip(it); }
            UI.renderEquipSheet();
            return Forge.inventoryOf('weapon').length;
        });
        await p.evaluate(() => UI.openGearDetail('weapon'));
        await SETTLE(p, 'gear-detail-modal');
        const r = await p.evaluate(() => {
            const list = document.querySelector('#gear-detail-modal .inv-list');
            if (!list) return { err: '보관함 목록 없음' };
            const scrollable = list.scrollHeight > list.clientHeight;
            list.scrollTop = 60;
            const set = list.scrollTop;
            const btns = document.querySelectorAll('#gear-detail-modal .inv-row .btn.equip');
            const target = btns[Math.min(4, btns.length - 1)];
            if (!target) return { err: '장착 버튼 없음' };
            target.click();
            const after = document.querySelector('#gear-detail-modal .inv-list');
            return { scrollable, set, after: after ? after.scrollTop : null };
        });
        const bad = [];
        if (r.err) bad.push(r.err);
        else {
            if (!r.scrollable) bad.push('목록이 스크롤되지 않아 검증 불가 — 보관품을 더 심어야 한다');
            if (r.after !== r.set) bad.push(`스크롤이 ${r.set} → ${r.after}로 튐`);
        }
        report(`⑥보관함 스크롤 보존(보관 ${setup}개)`, bad, r.err ? '' : `스크롤가능=${r.scrollable} ${r.set}→${r.after}`);
        await p.close();
    }

    console.log('\n콘솔/페이지 에러: ' + (errs.length ? '\n  ' + errs.slice(0, 10).join('\n  ') : '없음'));
    if (errs.length) fail++;
    console.log(fail ? `\n결과: 실패 ${fail}건` : '\n결과: 전부 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
