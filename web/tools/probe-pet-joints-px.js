// 펫 관절 모션의 **화면 픽셀 단위** 가시성 실측 (pet-articulated-joints 재오픈 조사용)
//
// 재오픈 배경: probe-pet-joints.js 는 25종 전부 PASS 인데 사용자는 "관절 안 움직이는 거 아직 있음".
// 그 프로브의 지표는 종별 **최대** 관절의 월드 이동폭이라, ⓐ 최대 관절 하나(더듬이 등)만 돌고
// 나머지(다리)가 얼어 있어도 통과하고 ⓑ 월드 0.03 이 화면에서 몇 px 인지(= 사람 눈에 보이는지)를
// 말해 주지 않는다. 여기서는 실제 게임 카메라로 **관절별 화면 px 이동폭**을 재서
// '육안으로 정지로 읽히는' 종·관절을 찾는다.
//
// 사용: node probe-pet-joints-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const WEB = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await page.goto('file://' + path.join(WEB, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene);
    await page.waitForTimeout(800);

    const res = await page.evaluate(() => {
        const names = Object.keys(PET_COLORS);
        // 실게임과 같은 배치로 3마리씩 세워 카메라 거리·스케일을 실전과 맞춘다
        // (25마리를 한 번에 세우면 바깥 호로 밀려 실제보다 작게 보인다)
        const canvas = Scene3D.renderer.domElement;
        const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
        const cam = Scene3D.camera;
        const toPx = (v) => {
            const p = v.clone().project(cam);
            return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
        };
        const out = [];
        for (let base = 0; base < names.length; base += 3) {
            const batch = names.slice(base, base + 3);
            S.pets = batch.map(n => ({ name: n, rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }));
            S.activePets = batch.map((_, i) => i);
            Scene3D.refreshPets();
            Scene3D.anims.length = 0;
            const per = Scene3D.petGroups.map(pg => (pg.userData.joints || []).map(() => ({ mnx: 1e9, mny: 1e9, mxx: -1e9, mxy: -1e9 })));
            const meas = (walking, frames) => {
                Scene3D.walking = walking;
                for (let f = 0; f < frames; f++) {
                    Scene3D.update(1 / 60);
                    Scene3D.petGroups.forEach((pg, i) => {
                        // 몸통(그룹) 이동을 화면에서도 빼기 위해 그룹 원점의 px 을 같이 잰다
                        const org = new THREE.Vector3();
                        pg.getWorldPosition(org);
                        const opx = toPx(org);
                        (pg.userData.joints || []).forEach((j, k) => {
                            j.o.updateMatrixWorld(true);
                            const w = new THREE.Vector3(0, -0.1, 0).applyMatrix4(j.o.matrixWorld);
                            const p = toPx(w);
                            const r = per[i][k];
                            const dx = p.x - opx.x, dy = p.y - opx.y;
                            r.mnx = Math.min(r.mnx, dx); r.mxx = Math.max(r.mxx, dx);
                            r.mny = Math.min(r.mny, dy); r.mxy = Math.max(r.mxy, dy);
                        });
                    });
                }
            };
            meas(false, 120); // 대기 2초
            Scene3D.petGroups.forEach((pg, i) => {
                const spans = per[i].map(r => Math.hypot(r.mxx - r.mnx, r.mxy - r.mny));
                out.push({
                    name: pg.userData.name,
                    joints: spans.length,
                    px: spans.map(s => +s.toFixed(1)),
                    max: +Math.max(...spans).toFixed(1),
                    med: +spans.slice().sort((a, b) => a - b)[Math.floor(spans.length / 2)].toFixed(1),
                    frozen: spans.filter(s => s < 1.5).length,
                });
            });
        }
        return { out, W, H };
    });

    console.log(`화면 ${res.W}x${res.H} — 대기(idle) 2초 동안 관절별 화면 이동폭(px), 몸통 상대`);
    for (const m of res.out) {
        const tag = m.max < 3 ? ' 🚨 종 전체가 사실상 정지로 보임' : m.frozen > m.joints / 2 ? ' ⚠️ 관절 절반 이상 정지' : '';
        console.log(`  ${m.name.padEnd(15)} 관절 ${String(m.joints).padStart(2)}개  max ${String(m.max).padStart(5)}px  중간값 ${String(m.med).padStart(5)}px  <1.5px ${m.frozen}개${tag}`);
        console.log(`    ${JSON.stringify(m.px)}`);
    }
    console.log('콘솔 에러: ' + errors.length);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
    await browser.close();
})();
