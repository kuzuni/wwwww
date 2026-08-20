// 장비 썸네일이 **실제로 voxel 로 렌더되는가**를 재는 게이트 — 사용: node probe-equip-voxel.js
// TODO `equip-voxelize` 전용. 전환한 슬롯이 늘어나면 아래 DONE 에 슬롯 이름만 추가하면 된다.
//
// 🚨 **왜 이 자가 따로 필요한가.** `test-voxel-shapes.js` ⑨ 는 헬퍼가 만드는 **복셀 데이터**의
//    면 법선이 6방향뿐임을 잰다 — 그건 헬퍼의 성질이지 **화면의 성질이 아니다.** 호출부가
//    헬퍼를 안 쓰고 `SphereGeometry` 를 그대로 두거나, 메시를 임의 각도로 기울이거나
//    (`rotation.z = 0.4`), 매끈한 `ExtrudeGeometry` 곡선을 되살리면 ⑨ 는 그대로 초록이고
//    화면만 옛 화풍으로 돌아간다. 비평가가 화풍 정합 2/10 을 준 것이 정확히 그 상태였다.
//    그래서 **구운 픽셀에서** 재야 한다.
//
// 무엇을 재는가 — 매끈한 곡면과 큐브 적층을 가르는 두 가지:
//  ① **플랫 고원 비율**: 큐브는 면당 한 색이라 **같은 색이 넓게 이어지는 판**이 생긴다.
//     구·토러스는 픽셀마다 법선이 조금씩 달라 **연속 그라디언트**가 된다. 그래서
//     "3×3 이웃이 전부 자기와 같은 색(ΔL ≤ 2)인 픽셀"의 비율이 갈린다.
//  ② **축정렬 실루엣 비율**: 큐브 실루엣의 경계는 가로·세로 직선 토막(계단)의 연속이다.
//     원형 실루엣은 매 줄 1px 씩 어긋난다. 그래서 "왼쪽/오른쪽 경계 x 가 윗줄과 같은 줄"의
//     비율이 갈린다.
//
// ⚠️ **마감(`thumbFinish`)은 끄고 잰다.** 접지 그림자·소프트 AO·비네트는 전부 저주파
//    그라디언트라 ① 을 통째로 깎는다 — 그건 조형이 아니라 마감의 성질이므로, 이 자는
//    조형만 본다(마감은 `probe-equip-finish` 가 따로 본다).
//
// 🚨 **음성 대조가 이 자의 핵심이다.** 임계값 하나만 두면 "그 숫자가 정말 voxel 을 재는가"를
//    아무도 확인 못 한다. 아직 전환 안 한 슬롯(`armor`·`helmet`·`weapon`)이 지금 이 저장소에
//    **살아 있는 매끈한 대조군**이라, 전환한 슬롯이 그것들보다 확실히 높은지도 같이 잰다.
//    ⓘ 전환이 끝나 대조군이 사라지면 그 비교는 자동으로 건너뛰고 절대 기준만 남는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const DONE = ['necklace', 'ring', 'gloves', 'shoes', 'belt', 'armor'];   // voxel 전환 완료 슬롯
const TODO_SLOTS = ['helmet', 'weapon'];                        // 아직 매끈한 대조군
// 🚨 **일차 게이트는 SEPARATION(음성 대조)이고, 절대 하한은 '진짜 매끈 덩어리'만 걸러내는
//    바닥이다 — 이유를 남긴다.** 플랫 고원 비율은 파츠가 작고 많을수록(신발 = 부츠 두 짝)
//    경계 픽셀이 늘어 **매끈함이 아니라 표면 복잡도 때문에** 떨어진다. 실측: 전환한 신발이
//    플랫 0.23 인데, 비평가 2인이 서로 모른 채 **신발 v1/v2 를 이 시트에서 가장 voxel 로 잘
//    읽히는 칸('오늘 출고 가능')** 으로 꼽았다. 즉 높은 절대 하한(0.42)은 신발에 **가짜 실패**를
//    낸다. 반대로 매끈한 대조군(armor 0.16 · helmet 0.19)은 플랫·계단이 **둘 다** 낮다 —
//    그게 진짜 매끈함의 지문이다. 그래서 절대 판정은 'flat 과 step 이 **둘 다** 바닥 밑'일 때만
//    실패로 본다(둘 중 하나만 낮은 건 조형이 아니라 형태 특성이다). 신뢰 가능한 판별은
//    **전환 슬롯 평균이 대조군보다 확실히 높다**는 SEPARATION 이고, 그게 이 자의 본체다.
const FLAT_FLOOR = 0.20;  // 이 밑 + 계단도 바닥이면 '매끈 덩어리'로 본다(단독으로는 실패 아님)
const STEP_FLOOR = 0.50;  // 위와 AND
const SEPARATION = 0.08;  // 🚨 일차 게이트 — 전환 슬롯 평균이 대조군 평균보다 이만큼은 높아야 한다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async ({ DONE, TODO_SLOTS }) => {
        const S = 192;                       // 96px 표시분의 2배 — 계단 한 칸이 최소 2px 은 되게
        const cv = document.createElement('canvas'); cv.width = cv.height = S;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const read = async (url) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.onerror = r; img.src = url; });
            cx.clearRect(0, 0, S, S); cx.drawImage(img, 0, 0, S, S);
            return cx.getImageData(0, 0, S, S).data;
        };
        const lum = (d, i) => 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
        const on = (d, i) => d[i * 4 + 3] >= 160;

        // ① 플랫 고원 비율 — 3×3 이웃이 전부 자기와 같은 색인 피사체 픽셀의 비율.
        //    경계 픽셀은 이웃에 배경이 끼므로 애초에 세지 않는다(피사체가 작을수록 불리해지는
        //    편향을 없앤다 — 반지처럼 가느다란 조형이 그 편향의 최대 피해자다).
        const flatRatio = (d) => {
            let inner = 0, flat = 0;
            for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
                const i = y * S + x;
                if (!on(d, i)) continue;
                let allOn = true;
                for (let dy = -1; dy <= 1 && allOn; dy++) for (let dx = -1; dx <= 1; dx++)
                    if (!on(d, (y + dy) * S + (x + dx))) { allOn = false; break; }
                if (!allOn) continue;
                inner++;
                const L = lum(d, i);
                let same = true;
                for (let dy = -1; dy <= 1 && same; dy++) for (let dx = -1; dx <= 1; dx++)
                    if (Math.abs(lum(d, (y + dy) * S + (x + dx)) - L) > 2) { same = false; break; }
                if (same) flat++;
            }
            return inner ? flat / inner : 0;
        };

        // ② 축정렬 실루엣 비율 — 줄마다 좌·우 경계 x 를 재서, 윗줄과 **같은 x** 인 비율.
        //    큐브 실루엣은 세로 직선 구간이 길어 같은 x 가 이어지고, 원은 매 줄 밀린다.
        const stepRatio = (d) => {
            const L = [], R = [];
            for (let y = 0; y < S; y++) {
                let l = -1, r = -1;
                for (let x = 0; x < S; x++) if (on(d, y * S + x)) { if (l < 0) l = x; r = x; }
                L.push(l); R.push(r);
            }
            let pairs = 0, same = 0;
            for (let y = 1; y < S; y++) {
                if (L[y] < 0 || L[y - 1] < 0) continue;
                pairs += 2;
                if (L[y] === L[y - 1]) same++;
                if (R[y] === R[y - 1]) same++;
            }
            return pairs ? same / pairs : 0;
        };

        const AGES6 = AGES.slice(0, 6);
        const cells = [];
        for (const slot of DONE.concat(TODO_SLOTS))
            for (const age of AGES6) for (let v = 0; v < 3; v++) cells.push({ slot, age, v });

        const out = [];
        const fin0 = Scene3D.THUMB_FINISH_OFF;
        Scene3D.THUMB_FINISH_OFF = true;      // 조형만 본다 — 마감은 저주파라 ①을 통째로 깎는다
        Scene3D._thumbCache = {};
        Scene3D.itemThumb({ slot: 'ring', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        Scene3D._thumbR.setSize(S, S);
        for (const c of cells) {
            Scene3D._thumbCache = {};
            const u = Scene3D.itemThumb({
                slot: c.slot, age: c.age, ageIdx: AGES.indexOf(c.age),
                rarity: 'common', nameIdx: c.v,
                wtype: c.slot === 'weapon' ? ['sword', 'axe', 'bow'][c.v] : null,
            });
            if (!u) { out.push({ ...c, fail: true }); continue; }
            const d = await read(u);
            out.push({ ...c, flat: flatRatio(d), step: stepRatio(d) });
        }
        Scene3D.THUMB_FINISH_OFF = fin0;
        Scene3D._thumbR.setSize(96, 96);
        Scene3D._thumbCache = {};
        return out;
    }, { DONE, TODO_SLOTS });

    const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const bySlot = {};
    for (const c of res) (bySlot[c.slot] = bySlot[c.slot] || []).push(c);

    const fails = [];
    console.log('슬롯          칸   플랫고원   축정렬실루엣   판정');
    const slotAvg = {};
    for (const slot of DONE.concat(TODO_SLOTS)) {
        const cs = (bySlot[slot] || []).filter(c => !c.fail);
        if (!cs.length) { console.log(`${slot.padEnd(12)}  — 렌더 실패`); fails.push(`${slot} 렌더 실패`); continue; }
        const f = avg(cs.map(c => c.flat)), s = avg(cs.map(c => c.step));
        slotAvg[slot] = { f, s };
        const done = DONE.indexOf(slot) >= 0;
        const bad = done && f < FLAT_FLOOR && s < STEP_FLOOR;   // 둘 다 바닥 밑 = 매끈 덩어리
        console.log(`${slot.padEnd(12)} ${String(cs.length).padStart(3)}   ${f.toFixed(3)}      ${s.toFixed(3)}        `
            + (done ? (bad ? '❌ 전환됨(매끈)' : '✅ 전환됨') : '· 대조군(아직 매끈)'));
        if (bad) fails.push(`${slot} 플랫·계단 둘 다 바닥(${f.toFixed(3)}/${s.toFixed(3)}) — 매끈 덩어리로 읽힌다`);
    }

    // 칸 단위 최악 5개 — 슬롯 평균이 통과해도 한 변형만 매끈하면 여기서 보인다.
    const worst = res.filter(c => !c.fail && DONE.indexOf(c.slot) >= 0)
        .sort((a, b) => (a.flat + a.step) - (b.flat + b.step)).slice(0, 5);
    console.log('\n전환 슬롯 중 가장 안 좋은 칸 5:');
    for (const c of worst) console.log(`  ${c.slot}/${c.age}/v${c.v}  플랫 ${c.flat.toFixed(3)} 계단 ${c.step.toFixed(3)}`);

    // 🚨 음성 대조 — 이 자가 정말 'voxel 여부'를 재는지 확인하는 자리.
    const ctrl = TODO_SLOTS.filter(s => slotAvg[s]);
    if (ctrl.length) {
        const dF = avg(DONE.filter(s => slotAvg[s]).map(s => slotAvg[s].f)) - avg(ctrl.map(s => slotAvg[s].f));
        const dS = avg(DONE.filter(s => slotAvg[s]).map(s => slotAvg[s].s)) - avg(ctrl.map(s => slotAvg[s].s));
        console.log(`\n음성 대조: 전환 슬롯 − 미전환 슬롯 = 플랫 +${dF.toFixed(3)} · 계단 +${dS.toFixed(3)} (기준 각 ≥${SEPARATION})`);
        if (dF < SEPARATION) fails.push(`플랫 분리 ${dF.toFixed(3)} < ${SEPARATION} — 자가 조형을 못 가르고 있다`);
        if (dS < SEPARATION) fails.push(`계단 분리 ${dS.toFixed(3)} < ${SEPARATION} — 자가 조형을 못 가르고 있다`);
    } else {
        console.log('\n음성 대조 없음 — 미전환 슬롯이 남아 있지 않다(전환 완료). 절대 기준만 본다.');
    }

    console.log(`\n콘솔 에러: ${errors.length}`, errors.slice(0, 3));
    if (errors.length) fails.push('콘솔 에러 ' + errors.length);
    console.log(fails.length ? '\nFAIL:\n - ' + fails.join('\n - ') : '\nPASS — 전환 슬롯이 픽셀에서도 큐브로 읽힌다');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
