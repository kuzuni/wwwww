// hp-juicy ② '접점 임팩트 밀도' 판정 — 비평가 6차 잔여 지적("접점이 둥근 플레어 몇 겹뿐이라
// 부딪힌 순간의 밀도가 없다 — 방사형 스파이크와 플레어 링, 크리는 1.5배").
//
// 무엇을 재는가(전부 **코드가 만든 오브젝트**에서 뽑는다 — 인자를 손으로 베끼지 않는다, TODO 함정 ④):
//   ① 한 타격이 방사형 스파이크를 실제로 만든다 · 각도가 한쪽에 몰리지 않고 **한 바퀴에 퍼진다**
//   ② 스파이크가 접점에서 **바깥으로 자란다**(정지한 별표가 아니다)
//   ③ 접점 링이 생기고 **끝까지 퍼진다**(멈춰 서면 테가 아니라 얼룩 — expandRing 교훈)
//   ④ 크리가 일반보다 **더 촘촘하고 크다**(1.5배 사양)
//   ⑤ 크기가 **적 실높이에 묶여** 있다(작은 적에서 몸보다 커지면 하반신이 지워진다)
//   ⑥ 수명이 끝나면 **전부 치워진다**(씬 잔존 0)
//
// ⚠️ 헤드리스에서 rAF 는 사실상 안 돈다 — `Scene3D.update` 를 손으로 흘린다(TODO 함정 ③).
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
//
// 사용: node probe-impact-density.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.heroG && typeof Combat !== "undefined"').catch(() => false);
        if (ready) break;
        if (w > 900) throw new Error('부팅 대기 초과');
        await page.waitForTimeout(200);
    }

    const run = async (crit) => page.evaluate((isCrit) => {
        // 전투를 먼저 멈춘 뒤 적을 확보한다 — 밖에서 기다리면 그 사이에 죽는다(probe-spark-anchor 교훈)
        Combat.tick = () => { };
        let e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        if (!e) { Combat.setupStage(); e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id)); }
        if (!e) return { err: '살아 있는 적을 못 세웠다' };
        const m = Scene3D.enemyMap.get(e.id);
        const eh = (m.topY || 1.1) * (m.baseScale || 1);

        // 이번 타격이 만든 것만 쥔다 — 씬 자식 차분(타입으로 찾으면 다른 연출이 섞인다, TODO 함정 ④⑵)
        const before = new Set(Scene3D.scene.children);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.hitEnemy(e.id, Big.of(30), isCrit, null, false);
        const fresh = Scene3D.scene.children.filter(o => !before.has(o));
        // 🚨 타입으로 찾으면 **같은 프레임의 플레어 3층·파편까지** 같이 잡힌다(첫 판정이 6개 대신 14개를
        //    셌다 — TODO 함정 ④⑵ 그대로). 코드가 남긴 표식으로만 고른다.
        const spikes = fresh.filter(o => o.userData && o.userData.impactSpike);
        const rings = fresh.filter(o => o.userData && o.userData.impactRing);

        // ⚠️ 기준점을 **적 위치로 잡으면 안 된다** — 같은 구간에 넉백 복귀가 돌아 적이 움직이므로
        //    스파이크가 자라도 거리가 줄어드는 것처럼 나온다(첫 판정이 그래서 FAIL 이었다).
        //    각 스파이크 **자신의 생성 지점**에서 얼마나 밀려났는지를 본다.
        const origin = spikes.map(o => o.position.clone());
        const snap = () => ({
            spikeLen: spikes.map(o => +o.scale.y.toFixed(4)),
            spikeDist: spikes.map((o, i) => +o.position.distanceTo(origin[i]).toFixed(4)),
            ringScale: rings.map(o => +o.scale.x.toFixed(4)),
        });
        const t0 = snap();
        for (let i = 0; i < 5; i++) realUpdate(1 / 120);
        const t1 = snap();
        for (let i = 0; i < 8; i++) realUpdate(1 / 120);
        const t2 = snap();

        // 각도 분포 — 스파이크의 로컬 Y축(뻗는 방향)을 카메라 평면에서 본 각
        const angles = spikes.map(o => {
            const v = new THREE.Vector3().setFromMatrixColumn(o.matrix, 1).normalize();
            return +(Math.atan2(v.y, v.x)).toFixed(3);
        }).sort((a, b) => a - b);
        let maxGap = 0;
        for (let i = 0; i < angles.length; i++) {
            const g = (i === angles.length - 1) ? (angles[0] + Math.PI * 2 - angles[i]) : (angles[i + 1] - angles[i]);
            maxGap = Math.max(maxGap, g);
        }
        // 수명 뒤 정리 확인
        for (let i = 0; i < 60; i++) realUpdate(1 / 60);
        const left = Scene3D.scene.children.filter(o => spikes.indexOf(o) >= 0 || rings.indexOf(o) >= 0).length;

        return {
            eh: +eh.toFixed(3),
            nSpike: spikes.length, nRing: rings.length,
            maxGap: +maxGap.toFixed(3), angles,
            grow: { t0: t0.spikeDist, t1: t1.spikeDist, t2: t2.spikeDist },
            len: { t0: t0.spikeLen, t1: t1.spikeLen, t2: t2.spikeLen },
            ring: { t0: t0.ringScale, t1: t1.ringScale, t2: t2.ringScale },
            maxSpikeLen: Math.max(...t2.spikeLen),
            maxRing: Math.max(...t2.ringScale),
            left,
        };
    }, crit);

    const normal = await run(false);
    const crit = await run(true);

    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const ok = (n, c, d) => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === undefined ? '' : ` — ${d}`}`);
    console.log('hp-juicy ② 접점 임팩트 밀도 판정');
    if (normal.err || crit.err) { ok('적 확보', false, normal.err || crit.err); await browser.close(); return; }

    ok('① 일반 타격이 방사형 스파이크를 만든다', normal.nSpike >= 6, `${normal.nSpike}개`);
    ok('① 각도가 한 바퀴에 퍼진다(최대 빈틈 < 120°)', normal.maxGap < Math.PI * 2 / 3,
        `최대 빈틈 ${(normal.maxGap * 180 / Math.PI).toFixed(0)}°`);
    ok('② 스파이크가 접점에서 바깥으로 자란다',
        avg(normal.grow.t2) > avg(normal.grow.t1) && avg(normal.grow.t1) > avg(normal.grow.t0),
        `거리 ${avg(normal.grow.t0).toFixed(3)} → ${avg(normal.grow.t1).toFixed(3)} → ${avg(normal.grow.t2).toFixed(3)}`);
    ok('② 길이도 계속 늘어난다(정지한 별표가 아니다)', avg(normal.len.t2) > avg(normal.len.t0),
        `${avg(normal.len.t0).toFixed(3)} → ${avg(normal.len.t2).toFixed(3)}`);
    ok('③ 접점 링이 생긴다', normal.nRing >= 1, `${normal.nRing}개`);
    ok('③ 링이 끝까지 퍼진다(정체 구간 없음)',
        normal.ring.t2[0] > normal.ring.t1[0] && normal.ring.t1[0] > normal.ring.t0[0],
        `${normal.ring.t0[0]} → ${normal.ring.t1[0]} → ${normal.ring.t2[0]}`);
    ok('④ 크리가 더 촘촘하다', crit.nSpike > normal.nSpike, `일반 ${normal.nSpike} → 크리 ${crit.nSpike}`);
    ok('④ 크리가 더 크다(스파이크·링 둘 다)',
        crit.maxSpikeLen > normal.maxSpikeLen && crit.maxRing > normal.maxRing,
        `스파이크 ${normal.maxSpikeLen.toFixed(2)}→${crit.maxSpikeLen.toFixed(2)} · 링 ${normal.maxRing.toFixed(2)}→${crit.maxRing.toFixed(2)}`);
    ok('⑤ 크기가 적 실높이에 묶여 있다(스파이크가 적 키를 안 넘는다)',
        crit.maxSpikeLen <= crit.eh * 1.6, `최대 길이 ${crit.maxSpikeLen.toFixed(2)} vs 적 높이 ${crit.eh}`);
    ok('⑥ 수명 뒤 잔존 0', normal.left === 0 && crit.left === 0, `일반 ${normal.left} · 크리 ${crit.left}`);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
