// 탑승 접지 실측 — 항목 '탈것 탑승' 불합격 조건 중 **공중부양·관통**을 25종 전부에 대해 수치로 판정한다.
// 사용: node probe-ride-ground.js
//
// 기존 probe-ride-fit / probe-ride-clear 가 못 잡는 것만 본다:
//   ㉠ 두 probe 는 계열 대표 11종만 돌고, **접지(탈것 최하단 y)는 비행형에서만** 봤다.
//      지상 계열(quad/wheeled)과 평판형은 접지를 아무도 안 재고 있었다.
//   ㉡ 탑승 정합은 안장 높이를 역산해 **탈것을 최대 2.6배까지 키운다**(refreshMount의 rideScale).
//      키운 만큼 발굽·바퀴가 지면 아래로 파고들거나(관통) 위로 뜨는지는 배율과 무관하게 확인해야 한다.
//
// 판정 기준 (탈것 로컬이 아니라 **월드 y**, 지면 = 0):
//   지상 계열(hover 0): 최하단 y 가 0 ± TOL 이면 접지. 0-TOL 미만이면 관통, 0+TOL 초과면 공중부양.
//   비행형(hover>0)   : 뜨는 게 정상 — 최하단 y > 0 이기만 하면 OK(높이 값도 같이 찍는다).
// 영웅 발도 같이 잰다: 지상 계열에서 부츠 밑이 지면 아래로 내려가면 '발이 땅에 끌린다'.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.05;   // 월드 단위. 영웅 키(≈1.6)의 3% — 이보다 크면 화면에서 뜬 게 보인다.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate((TOL) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        // 전 종을 돈다 — 계열 대표만 보면 같은 계열 안에서 지오메트리가 다른 종을 통째로 놓친다.
        const all = [];
        for (const r in mountNames) for (const n of mountNames[r]) all.push([n, r]);

        const out = [];
        for (const [name, rarity] of all) {
            S.mounts = {}; S.mounts[name] = { rarity, count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            // 바운스(update의 bob)가 섞이지 않은 정지 상태에서 잰다 — bob 은 최대 0.08이라
            // 그대로 재면 접지 판정이 프레임마다 흔들린다.
            Scene3D.walking = false;
            Scene3D.mountGroup.updateWorldMatrix(true, true);
            Scene3D.heroG.updateWorldMatrix(true, true);

            const box = new THREE.Box3().setFromObject(Scene3D.mountGroup);
            const form = Scene3D.mountFormOf(name);
            const isFly = !!form.hover && !form.stand;

            // 영웅 부츠 최하단 — 발 메시가 따로 없으면 heroG 전체 bbox 하단으로 대신한다
            const hbox = new THREE.Box3().setFromObject(Scene3D.heroG);

            out.push({
                name, rarity,
                formKey: Scene3D.MOUNT_FORM_OF[name] || 'quad',
                isFly, stand: !!form.stand,
                bottom: +box.min.y.toFixed(3),
                top: +box.max.y.toFixed(3),
                heroFoot: +hbox.min.y.toFixed(3),
                heroY: +Scene3D.heroG.position.y.toFixed(3),
                scale: +(Scene3D.riding ? Scene3D.riding.scale : 0).toFixed(3),
            });
        }
        return out;
    }, TOL);

    let bad = 0;
    const byForm = {};
    for (const r of rows) (byForm[r.formKey] = byForm[r.formKey] || []).push(r);

    for (const formKey of Object.keys(byForm)) {
        console.log(`\n=== ${formKey} ===`);
        for (const r of rows.filter(x => x.formKey === formKey)) {
            const flags = [];
            if (r.isFly) {
                if (r.bottom <= 0) { flags.push('✗ 비행형인데 지면에 닿음/파묻힘'); bad++; }
                else flags.push(`OK 부양 ${r.bottom}`);
            } else {
                if (r.bottom < -TOL) { flags.push(`✗ 관통 ${r.bottom} (지면 아래)`); bad++; }
                else if (r.bottom > TOL) { flags.push(`✗ 공중부양 +${r.bottom}`); bad++; }
                else flags.push(`OK 접지 ${r.bottom}`);
            }
            // 발이 지면을 뚫는가 (지상 계열만 — 비행형은 허공에 뜬 발이 정상)
            if (!r.isFly && r.heroFoot < -TOL) { flags.push(`✗ 발이 지면 아래 ${r.heroFoot}`); bad++; }
            console.log(`  ${r.name.padEnd(16)} ${r.rarity.padEnd(10)} 배율 ${String(r.scale).padStart(5)}  탈것 y[${r.bottom} ~ ${r.top}]  영웅발 ${r.heroFoot}  ${flags.join(' / ')}`);
        }
    }

    if (errors.length) { console.log('\n페이지 에러:'); errors.forEach(e => console.log('  ' + e)); }
    else console.log('\n(no page errors)');
    console.log(bad === 0 ? `\n전부 통과 (${rows.length}종)` : `\n불합격 ${bad}건 / ${rows.length}종`);
    await browser.close();
    process.exit(bad === 0 && !errors.length ? 0 : 2);
})();
