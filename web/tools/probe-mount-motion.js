// 탈것이 실제로 '움직이는지' 실측 — 사용: node probe-mount-motion.js
// 사용자 지시 2026-08-19 (`mount-animal-machine-dynamic`): "탈것도 왠만하면 다 동물, 기계 같은 거로
// 해서 움직임 자체가 좀 동적인 거로 해줘. 지금 드래곤 부분 같은 게 그나마 맘에 듬."
// → 드래곤(날갯짓·꼬리)이 기준선이고, 나머지 계열도 그만큼 움직여야 한다. 예전엔 계열을 통틀어
//   위아래 바운스 하나뿐이라 말·공룡·자전거가 통짜로 떠다니는 조형물이었다.
//
// ⚠️ **헤드리스에서는 rAF 가 사실상 안 돈다**(TODO '비평가 채점 함정 ③'). 화면을 띄워 놓고 기다리면
//    `Scene3D.update` 가 안 불려 "아무것도 안 움직인다"는 가짜 결과가 나온다. 그래서 이 프로브는
//    **`Scene3D.update(1/60)` 를 손으로 N번 흘려** 프레임을 만든다. 절대 기다림으로 바꾸지 말 것.
//
// 판정(계열별, 탄 상태 + 따라오는 무리 양쪽):
//   ① quad  : 다리 4개가 실제로 흔들린다(진폭 ≥ 0.15rad) + **대각선 짝이 역위상**(트롯) + 머리가 움직인다
//   ② wheeled: 바퀴가 한 방향으로 계속 구른다(누적 ≥ 1rad, 단조) — 스포크가 있어야 회전이 읽힌다
//   ③ flat  : 몸통 피치가 흔들린다 + 추진 노즐 밝기가 맥동한다(호버 계열)
//   ④ fly   : 날개·꼬리가 흔들린다(드래곤 기준선 — 회귀 방지)
//   ⑤ 정지 자세 보존: t=0 프레임의 다리 각이 0 근처 — 피벗을 잘못 달면 모델이 통째로 어긋난다
//   ⑥ 콘솔 에러 0건
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 계열별 대표 종 — MOUNT_FORM_OF 의 네 갈래를 하나씩
const CASES = [
    ['quad', 'Brown Horse'],
    ['wheeled', 'Bike'],
    ['flat', 'Hover Board'],
    ['fly', 'Mini Dragon'],
];
const FRAMES = 90;   // 1.5초분 — 가장 느린 채널(머리 좌우 스캔 0.9rad/s)도 한 번은 방향을 바꾼다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof UI !== "undefined" && !!UI.els && typeof Scene3D !== "undefined" && !!Scene3D.scene').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
    const rows = [];

    for (const [form, name] of CASES) {
        const r = await page.evaluate(({ form, name, FRAMES }) => {
            // 대표 종 하나를 보유·장착시키고, 무리 쪽도 보이게 한 마리 더 둔다.
            // ⚠️ 2026-08-19 `mount-inventory-like-pet-250` 로 **`S.mounts` 는 이름 맵이 아니라 개체 배열**이고
            //    `S.activeMounts` 는 이름이 아니라 **인덱스** 배열이다. 옛 형태로 세우면 `riddenInst()` 가
            //    null 을 돌려줘 `refreshMount` 가 아무것도 안 만들고, 이 프로브는 계열 4개 전부
            //    "mountGroup 이 안 만들어졌다"로 죽는다 — 실제로 그 상태로 방치돼 있었다(2026-08-19 발견).
            S.mounts = [
                { name, rarity: 'epic', level: 1, xp: 0, stars: 0, subs: [] },
                { name: 'Sheep', rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] },
            ];
            // ⚠️ 무리(followers)는 `S.activeMounts.slice(1)` 이다. 지금은 장착이 1마리로 제한돼
            //    (`mount-single-equip`) 게임에서는 잘 안 생기지만 **코드 경로는 그대로 살아 있다** —
            //    파츠를 한쪽에만 올리는 사고(드래곤 날개 동결)가 재발하는 자리라 여기서 강제로 만든다.
            S.activeMounts = [0, 1];
            Scene3D.refreshMount();
            Scene3D.riding = Scene3D.riding || null;
            Scene3D.walking = true;

            const mg = Scene3D.mountGroup;
            if (!mg) return { err: 'mountGroup 이 안 만들어졌다' };
            const ud = mg.userData;
            const fg = Scene3D.mountFollowers[0] || null;

            // 프레임을 손으로 흘리며 채널별 최소/최대를 모은다
            const track = { legs: [], head: [], headY: [], wheel: [], pitch: [], glow: [], wing: [], tail: [] };
            const legAt = [];   // 프레임별 다리 각(대각선 역위상 검사용)
            const push = (arr, v) => arr.push(+v.toFixed(5));
            const legN = ud.legs ? ud.legs.length : 0;
            const sample = () => {
                if (ud.legs) { legAt.push(ud.legs.map(l => +l.rotation.x.toFixed(5))); ud.legs.forEach(l => push(track.legs, l.rotation.x)); }
                if (ud.head) { push(track.head, ud.head.rotation.x); push(track.headY, ud.head.rotation.y); }
                if (ud.wheels) push(track.wheel, ud.wheels[0].rotation.x);
                if (ud.wings) push(track.wing, ud.wings[0].rotation.z);
                if (ud.tail) push(track.tail, ud.tail.rotation.z);
                if (ud.glow && ud.glow.length) {
                    const m = ud.glow[0].material;
                    push(track.glow, m.emissiveIntensity !== undefined && m.emissive ? m.emissiveIntensity : m.color.r);
                }
                push(track.pitch, mg.rotation.x);
            };
            sample();                                  // t=0 (⑤ 정지 자세)
            for (let i = 0; i < FRAMES; i++) { Scene3D.update(1 / 60); sample(); }

            // 대각선 짝 역위상: 진폭이 가장 큰 프레임에서 gait 부호가 다른 두 다리의 각 부호가 반대여야 한다
            let anti = null;
            if (legN === 4) {
                const sign = ud.legs.map(l => (l.userData.gait > 0 ? 1 : -1));
                let best = 0, bi = 0;
                legAt.forEach((row, i) => { const a = Math.max(...row.map(Math.abs)); if (a > best) { best = a; bi = i; } });
                const row = legAt[bi];
                const pos = row.filter((v, j) => sign[j] > 0), neg = row.filter((v, j) => sign[j] < 0);
                anti = { frame: bi, plus: pos, minus: neg,
                         opposite: pos.every(v => v > 0.05) && neg.every(v => v < -0.05) || pos.every(v => v < -0.05) && neg.every(v => v > 0.05) };
            }
            const span = a => a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(4) : null;
            const wheelSum = track.wheel.length ? +(track.wheel[track.wheel.length - 1] - track.wheel[0]).toFixed(3) : null;
            const wheelMono = track.wheel.every((v, i) => i === 0 || v <= track.wheel[i - 1] + 1e-9);
            return {
                form, name, legN,
                leg0: legAt.length ? Math.max(...legAt[0].map(Math.abs)) : null,   // ⑤ t=0 정지 자세
                legSpan: span(track.legs), headSpan: span(track.head), headYSpan: span(track.headY),
                wheelSum, wheelMono, pitchSpan: span(track.pitch), glowSpan: span(track.glow),
                wingSpan: span(track.wing), tailSpan: span(track.tail), anti,
                follower: fg ? { legs: fg.userData.legs ? fg.userData.legs.length : 0, head: !!fg.userData.head } : null,
            };
        }, { form, name, FRAMES });

        if (!ok(!r.err, `[${form}/${name}] ${r.err}`)) continue;
        rows.push(r);

        if (form === 'quad') {
            ok(r.legN === 4, `[${form}] 다리 피벗이 4개가 아니다 (${r.legN})`);
            ok(r.leg0 !== null && r.leg0 < 0.02, `[${form}] t=0 정지 자세에서 다리가 이미 꺾여 있다 (${r.leg0}) — 피벗 오프셋 오류`);
            ok(r.legSpan >= 0.15, `[${form}] 다리가 거의 안 움직인다 (진폭 ${r.legSpan}rad)`);
            ok(r.anti && r.anti.opposite, `[${form}] 대각선 짝이 역위상이 아니다(트롯이 아님) — ${JSON.stringify(r.anti)}`);
            ok(r.headSpan >= 0.05 || r.headYSpan >= 0.05, `[${form}] 머리가 안 움직인다 (x ${r.headSpan} · y ${r.headYSpan})`);
            ok(r.follower && r.follower.legs === 4 && r.follower.head,
                `[${form}] 따라오는 무리에 다리·머리가 안 붙었다(파츠를 탄 쪽에만 올린 사고) — ${JSON.stringify(r.follower)}`);
        }
        if (form === 'wheeled') {
            ok(r.wheelSum !== null && Math.abs(r.wheelSum) >= 1, `[${form}] 바퀴가 안 구른다 (누적 ${r.wheelSum}rad)`);
            ok(r.wheelMono, `[${form}] 바퀴가 앞뒤로 덜덜 떤다 — 누적이 단조가 아니다`);
        }
        if (form === 'flat') {
            ok(r.pitchSpan >= 0.02, `[${form}] 판이 통짜로 굳어 있다 (피치 진폭 ${r.pitchSpan}rad)`);
            ok(r.glowSpan !== null && r.glowSpan >= 0.05, `[${form}] 추진 노즐이 맥동하지 않는다 (${r.glowSpan})`);
        }
        if (form === 'fly') {
            ok(r.wingSpan >= 0.3, `[${form}] 날개가 안 퍼덕인다 (${r.wingSpan}rad) — 드래곤 기준선 회귀`);
            ok(r.tailSpan >= 0.2, `[${form}] 꼬리가 안 흔들린다 (${r.tailSpan}rad)`);
        }
    }

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    for (const r of rows) {
        console.log(`${r.form.padEnd(8)} ${r.name.padEnd(13)} 다리 ${r.legN}개·진폭 ${r.legSpan} (t=0 ${r.leg0})`
            + ` · 머리 x${r.headSpan}/y${r.headYSpan} · 바퀴 ${r.wheelSum}${r.wheelSum !== null ? (r.wheelMono ? '(단조)' : '(비단조!)') : ''}`
            + ` · 피치 ${r.pitchSpan} · 노즐 ${r.glowSpan} · 날개 ${r.wingSpan} · 꼬리 ${r.tailSpan}`);
        if (r.anti) console.log(`         트롯 검사: 최대 프레임 ${r.anti.frame} · 대각+ ${JSON.stringify(r.anti.plus)} · 대각- ${JSON.stringify(r.anti.minus)} → ${r.anti.opposite ? '역위상 OK' : '실패'}`);
    }
    if (fail.length) { console.log('\nFAIL ' + fail.length + '건:'); fail.forEach(f => console.log(' ✗ ' + f)); }
    else console.log('\nPASS — 네 계열 전부 파츠가 실제로 움직인다(다리 트롯·머리·바퀴·노즐·날개·꼬리)');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
