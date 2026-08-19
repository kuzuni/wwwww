// 96px 실루엣 분화 자동 게이트 — 사용: node probe-equip-silhouette.js
// TODO 'equip-design-dedupe' ⓒ⑵ 전용. 비평가 2차 지적:
//   "다운샘플하면 갑옷 plate/hide/cape/vest/suit 5칸이 같은 흰 항아리로 수렴한다.
//    굽기 스크립트에 96px 자동 출력 + 변형 간 실루엣 미분화 시 자동 반려를 넣어라."
// shot-equip-sculpt.js 의 3번째 행(96px 실루엣 판)은 **눈으로 보는** 도구라 회귀를 못 막는다.
// 이건 그 판정을 수치로 굳힌 것이다.
//
// 왜 알파 IoU 하나로는 부족한가 — 자동 프레이밍(thumbFrameToFit)이 모든 칸을 프레임에 꽉 채우므로
// 덩어리 겹침(IoU)은 형상이 달라도 늘 높게 나온다. 아이콘이 96px 로 줄었을 때 실제로 읽히는 것은
// **바깥 윤곽의 굴곡**이라, 행별 폭 프로파일(아래 rowW)을 같이 잰다.
//   shapeIoU : 알파 마스크 교집합/합집합 (1.0 = 같은 덩어리)
//   profD    : 96행 각각의 실루엣 폭을 정규화해 뺀 평균 절대차 (0 = 같은 윤곽)
// 판정(GATE): 같은 (부위, 시대) 그룹 안의 모든 쌍이 **IoU ≤ 0.90 이거나 profD ≥ 0.055** 여야 한다.
//   = 덩어리가 거의 같으면(IoU>0.90) 윤곽이라도 확실히 갈려 있어야 통과.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const IOU_MAX = 0.90;    // 이 아래면 덩어리부터 갈렸다 — 통과
const PROF_MIN = 0.055;  // 덩어리가 같아도 윤곽이 이만큼 갈리면 통과

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async () => {
        // itemThumb 은 (시대,이름idx) 캐시 키라 스타일/변형을 직접 못 고른다 —
        // shot-equip-sculpt 와 같은 방식으로 같은 씬·카메라·프레이밍을 재현하고 모델만 갈아 끼운다.
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });
        Scene3D._thumbR.setSize(256, 256);
        Scene3D._thumbCache = {};

        // ⚠️ 손으로 베낀 목록을 두지 말 것 — 표에 새 스타일이 생겨도(2026-08-19 `bone`) 게이트가
        //    옛 6종만 재서 **새 조형이 한 번도 판정되지 않는다.** 투구 쪽 주석과 같은 이유로
        //    ARMOR_STYLES 에서 직접 뽑는다.
        const ARMOR = [];
        for (const age of AGES) for (const st of (ARMOR_STYLES[age] || [])) if (ARMOR.indexOf(st) < 0) ARMOR.push(st);
        const cells = [];
        for (const st of ARMOR) cells.push({ group: 'armor', label: 'armor/' + st, slot: 'armor', style: st });
        for (const sl of ['gloves', 'shoes', 'belt', 'necklace', 'ring'])
            for (let v = 0; v < 3; v++) cells.push({ group: sl, label: sl + '/v' + v, slot: sl, variant: v });
        // 투구도 같은 게이트를 건다. ⚠️ 스타일 이름은 **반드시 gamedata 의 HELMET_STYLES 에서
        //    뽑을 것** — 표에 없는 이름(예전 판의 'horn'·'hood')을 넣으면 makeHelmet 의 기본 분기로
        //    떨어져 **둘이 문자적으로 같은 그림**이 되고, 게이트가 '없는 중복'을 잡는다(첫 판 실측:
        //    IoU 1.000·윤곽차 0.0000 3쌍이 전부 이것이었다).
        const HELM = [...new Set(Object.values(HELMET_STYLES).flat())];

        const AGE_ROWS = ['primitive', 'medieval', 'space'];
        const buildErrs = [];
        const out = [];

        const shoot = (make) => {
            const model = make();
            const sc = Scene3D._thumbScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
            const g = new THREE.Group();
            g.add(model); sc.add(g);
            const d = Scene3D.ITEM_THUMB_DIR;
            Scene3D.thumbFrameToFit(Scene3D._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
            Scene3D._thumbR.render(sc, Scene3D._thumbCam);
            return Scene3D._thumbR.domElement.toDataURL();
        };

        const jobs = [];
        const N = 96;
        const t = document.createElement('canvas'); t.width = t.height = N;
        const tc = t.getContext('2d', { willReadFrequently: true });

        const push = (age, group, label, make) => {
            let url = null;
            try { url = shoot(make); } catch (e) { buildErrs.push(label + '@' + age + ': ' + e.message); }
            if (!url) return;
            jobs.push(new Promise(resolve => {
                const im = new Image();
                im.onload = () => {
                    tc.clearRect(0, 0, N, N);
                    tc.drawImage(im, 0, 0, N, N);
                    const d = tc.getImageData(0, 0, N, N).data;
                    // 실루엣 마스크(알파 임계 24 — shot-equip-sculpt 판독성 행과 같은 기준)
                    const mask = new Uint8Array(N * N);
                    let area = 0;
                    for (let i = 0; i < N * N; i++) { if (d[i * 4 + 3] > 24) { mask[i] = 1; area++; } }
                    // 행별 폭 프로파일 — 96px 에서 눈이 읽는 '바깥 윤곽의 굴곡'
                    const rowW = new Float32Array(N);
                    for (let y = 0; y < N; y++) {
                        let lo = -1, hi = -1;
                        for (let x = 0; x < N; x++) if (mask[y * N + x]) { if (lo < 0) lo = x; hi = x; }
                        rowW[y] = lo < 0 ? 0 : (hi - lo + 1) / N;
                    }
                    out.push({ age, group, label, area, mask: Array.from(mask), rowW: Array.from(rowW) });
                    resolve();
                };
                im.onerror = () => resolve();
                im.src = url;
            }));
        };

        for (const age of AGE_ROWS) {
            for (const c of cells) {
                push(age, c.group, c.label, () => c.slot === 'armor'
                    ? Scene3D.makeArmorPreview(age, 'rare', c.style, '')
                    : Scene3D.makeAccessoryPreview(c.slot, c.variant, age, 'rare', ''));
            }
            for (const st of HELM) push(age, 'helmet', 'helmet/' + st, () => Scene3D.makeHelmet(age, 'rare', st, ''));
        }
        await Promise.all(jobs);
        return { out, buildErrs };
    });

    const cells = res.out;
    if (!cells.length) { console.log('FAIL — 굽힌 칸이 0'); process.exit(1); }

    const iou = (a, b) => {
        let inter = 0, uni = 0;
        for (let i = 0; i < a.mask.length; i++) {
            const x = a.mask[i], y = b.mask[i];
            if (x && y) inter++;
            if (x || y) uni++;
        }
        return uni ? inter / uni : 1;
    };
    const profD = (a, b) => {
        let s = 0;
        for (let i = 0; i < a.rowW.length; i++) s += Math.abs(a.rowW[i] - b.rowW[i]);
        return s / a.rowW.length;
    };

    // (부위, 시대) 그룹 안에서만 잰다 — 이 항목의 판정 기준은 '시대 안' 분화다(㉰⑵ 참고).
    const groups = {};
    for (const c of cells) (groups[c.group + '@' + c.age] = groups[c.group + '@' + c.age] || []).push(c);

    const fails = [], worst = [];
    let pairs = 0;
    for (const k of Object.keys(groups).sort()) {
        const g = groups[k];
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
            pairs++;
            const s = iou(g[i], g[j]), p = profD(g[i], g[j]);
            const pass = s <= IOU_MAX || p >= PROF_MIN;
            const rec = { k, a: g[i].label, b: g[j].label, iou: s, prof: p, pass };
            if (!pass) fails.push(rec);
            worst.push(rec);
        }
    }
    worst.sort((x, y) => (y.iou - y.prof * 4) - (x.iou - x.prof * 4));

    console.log(`칸 ${cells.length} · 그룹 ${Object.keys(groups).length} · 쌍 ${pairs}`);
    console.log(`게이트: IoU ≤ ${IOU_MAX} 이거나 윤곽차 ≥ ${PROF_MIN}`);
    console.log('— 가장 안 갈린 쌍 12 —');
    for (const w of worst.slice(0, 12)) {
        console.log(`  ${w.pass ? 'ok  ' : 'FAIL'} ${w.k.padEnd(20)} ${w.a.padEnd(16)} vs ${(w.b + '').padEnd(16)} IoU ${w.iou.toFixed(3)} 윤곽차 ${w.prof.toFixed(4)}`);
    }
    if (res.buildErrs.length) console.log('모델 빌드 실패:', res.buildErrs.join(' | '));
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? `\n반려 — 미분화 ${fails.length}쌍 / ${pairs}` : `\nPASS — 미분화 0쌍 / ${pairs}`);
    await browser.close();
    process.exit(fails.length || res.buildErrs.length || errors.length ? 1 : 0);
})();
