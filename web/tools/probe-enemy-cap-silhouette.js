// 버섯 갓 실루엣 판정기 (enemy-quality ⓒ '베벨 지오메트리 — 구·박스 그대로인 부위').
//
// 이 항목의 ⓒ 는 골렘에서 결론이 나 있다: **깨야 하는 건 면 음영이 아니라 실루엣**이다.
// 구는 어떤 플랫셰이딩을 걸어도 윤곽이 완전한 원이라 '플라스틱 우산/눈사람'으로 읽힌다.
// 그래서 재는 것은 '예뻐졌나'(=채점)가 아니라 **윤곽이 실제로 원에서 벗어났는가**다.
//
// 재는 축 셋:
//   ⑴ 갓 돔 지오메트리의 **반경 변동계수(CV)** — 완전구면 0. 변형이 걸리면 유의미하게 오른다.
//   ⑵ 반점이 **갓 표면에 얹혀 있는가** — 변형 후 상수 반경을 그대로 쓰면 오목한 쪽에서 파묻히고
//      볼록한 쪽에서 뜬다(이 저장소가 호랑이 줄무늬에서 밟은 함정의 재발 방지).
//   ⑶ 갓 플랩 애니가 **변형된 지오메트리를 기준으로** 잡혔는가(base 가 변형 전 값이면 첫 프레임에
//      갓이 원래 구로 튄다).
//
// ⚠️ 자기검증: `CAPSELFTEST=1` 이면 변형을 끄고(원본 구) 돌려 ⑴ 이 반드시 FAIL 나는지 본다 —
//    자에 변별력이 있는지부터 확인하는 게 이 저장소의 규약이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const fails = [];
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); };

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?enemy=mushroom', { waitUntil: 'load' });
    for (let i = 0; i < 160; i++) {
        if (await p.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && Scene3D.enemyMap && Scene3D.enemyMap.size > 0)) break;
        await p.waitForTimeout(250);
    }
    await p.waitForTimeout(800);

    // 🚨 **자기검증은 메시를 실제로 다시 지어야 한다.** 첫 판은 `Scene3D.sculptOrganic` 만 갈아
    //    끼우고 `refreshEnemies && refreshEnemies()` 로 갱신하려 했는데 **그런 함수가 없어서**
    //    `&&` 가 조용히 넘어갔다 — 이미 지어진(변형된) 메시를 그대로 재서 자기검증이 PASS 로
    //    나왔다(= 자에 변별력이 없다는 뜻인데 통과로 읽히는, 가장 위험한 실패). 그래서 아래
    //    ⑴⑵ 는 **그 자리에서 새로 지은** 메시로 잰다(`monsterMesh`).
    if (process.env.CAPSELFTEST) console.log('※ 자기검증 모드 — sculptOrganic 을 무력화하고 새로 짓는다. ⑴ 이 FAIL 나야 정상.');

    await p.evaluate(v => { window.__capSelfTest = v; }, !!process.env.CAPSELFTEST);
    const r = await p.evaluate(() => {
        const S = Scene3D;
        const m = [...S.enemyMap.values()][0];
        if (!m) return { err: '적 메시 없음' };
        // 갓 돔 = capFlap 이 쥐고 있는 메시(연출이 스스로 심어 둔 표식을 쓴다 — 타입으로 찾으면
        // 반점·다른 구가 같이 잡힌다).
        const flap = m.anim && m.anim.capFlap;
        if (!flap) return { err: 'capFlap 없음(갓 플랩 애니가 안 잡혔다)' };
        // ⑴⑵ 용 메시는 **새로 짓는다** — 살아 있는 메시는 갓 플랩이 정점을 밀고 있어서
        //    '변형이 걸렸나'와 '지금 애니가 밀었나'가 뒤섞인다.
        const orig = S.sculptOrganic;
        if (window.__capSelfTest) S.sculptOrganic = geo => geo;
        const fresh = S.monsterMesh({ id: 0, x: 0 });
        S.sculptOrganic = orig;
        const fflap = fresh.anim && fresh.anim.capFlap;
        if (!fflap) return { err: '새로 지은 메시에 capFlap 이 없다' };
        const dome = fflap.mesh, dp = dome.geometry.attributes.position;
        let sum = 0, n = 0, rmin = 1e9, rmax = 0;
        const rs = [];
        for (let i = 0; i < dp.count; i++) {
            const len = Math.hypot(dp.getX(i), dp.getY(i), dp.getZ(i));
            if (len < 1e-6) continue;
            rs.push(len); sum += len; n++;
            rmin = Math.min(rmin, len); rmax = Math.max(rmax, len);
        }
        const mean = sum / n;
        const cv = Math.sqrt(rs.reduce((a, v) => a + (v - mean) * (v - mean), 0) / n) / mean;
        // 🚨 base 를 **현재 정점과 비교하면 안 된다** — 갓 플랩 애니가 매 프레임 정점을 밀고 있어서
        //    살아 있는 메시에서는 둘이 당연히 다르다(첫 판이 이 자를 써서 0.028 어긋남으로 FAIL 을
        //    냈는데, 그건 코드가 아니라 자가 틀린 것이었다 — 재는 순간의 플랩 변위였다).
        //    물어야 할 것은 '**base 가 변형된 갓을 담았는가**'이므로, base 자체의 반경 CV 를 본다
        //    (변형 전 원본 구를 담았다면 여기서 0 이 나온다).
        let bsum = 0, bn = 0; const brs = [];
        for (let i = 0; i < flap.base.length; i += 3) {
            const len = Math.hypot(flap.base[i], flap.base[i + 1], flap.base[i + 2]);
            if (len < 1e-6) continue;
            brs.push(len); bsum += len; bn++;
        }
        const bmean = bsum / bn;
        const baseCv = Math.sqrt(brs.reduce((a, v) => a + (v - bmean) * (v - bmean), 0) / bn) / bmean;
        // 반점 = capG 안의 흰 구. 각자 방향에서 갓 표면까지의 거리와 비교한다.
        const capG = dome.parent;
        const spots = capG.children.filter(o => o !== dome && o.isMesh && o.geometry.type === 'SphereGeometry');
        const off = [];
        for (const sp of spots) {
            const px = sp.position.x, py = sp.position.y / 0.82, pz = sp.position.z;   // 돔 스케일 되돌림
            const len = Math.hypot(px, py, pz);
            if (len < 1e-6) continue;
            const ux = px / len, uy = py / len, uz = pz / len;
            let best = -2, surf = 0;
            for (let i = 0; i < dp.count; i++) {
                const vx = dp.getX(i), vy = dp.getY(i), vz = dp.getZ(i);
                const vl = Math.hypot(vx, vy, vz); if (vl < 1e-6) continue;
                const d = (vx * ux + vy * uy + vz * uz) / vl;
                if (d > best) { best = d; surf = vl; }
            }
            off.push(+(len / surf).toFixed(3));      // 1.0 = 표면, <1 파묻힘, >1 떠 있음
        }
        return { cv: +cv.toFixed(4), rmin: +rmin.toFixed(4), rmax: +rmax.toFixed(4), mean: +mean.toFixed(4), n, baseCv: +baseCv.toFixed(4), off };
    });

    if (r.err) { ok(false, r.err); }
    else {
        console.log(`  갓 반경 평균 ${r.mean} · 최소 ${r.rmin} · 최대 ${r.rmax} · 정점 ${r.n}`);
        console.log(`  반점 표면비(1.0=표면): ${r.off.join(', ')}`);
        // 완전구는 CV 가 0(부동소수 오차 수준)이다. 2% 를 넘으면 윤곽이 실제로 깨진 것.
        ok(r.cv >= 0.02, `⑴ 갓 실루엣이 원에서 벗어났다 — 반경 변동계수 ${(r.cv * 100).toFixed(2)}% (기준 2% 이상)`);
        ok(r.off.every(v => v >= 0.9 && v <= 1.02),
            `⑵ 반점 6개가 전부 갓 표면에 얹혀 있다 (0.90~1.02)` + (r.off.every(v => v >= 0.9 && v <= 1.02) ? '' : ` · 벗어남: ${r.off.filter(v => v < 0.9 || v > 1.02).join(', ')}`));
        ok(r.baseCv >= 0.02, `⑶ 갓 플랩 base 가 **변형된** 갓을 담았다 — base 반경 변동계수 ${(r.baseCv * 100).toFixed(2)}% (원본 구였다면 0%)`);
    }
    ok(errors.length === 0, `⑷ 콘솔 에러 0건` + (errors.length ? ` · ${errors.slice(0, 2).join(' | ')}` : ''));

    console.log(`\n${fails.length ? 'FAIL ' + fails.length + '건' : '전건 PASS'}`);
    await b.close();
    process.exit(fails.length ? 1 : 0);
})();
