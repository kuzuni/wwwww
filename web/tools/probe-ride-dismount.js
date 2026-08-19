// 탑승 해제 복귀 실측 — 항목 '탈것 탑승' ⑤(해제 시 지면 복귀)는 어느 probe 도 안 보고 있었다.
// 사용: node probe-ride-dismount.js
// 재는 것 (계열마다 장착 → 해제 → 다른 계열로 갈아타기까지):
//   ㉠ 해제 후 영웅 y 가 0 으로 돌아오는가 (탑승 높이가 남으면 영웅이 허공에 선다)
//   ㉡ 해제 후 상체 기울기(rotation.x)가 0 인가 (탑승 lean 이 남으면 어정쩡하게 기운 채 걷는다)
//   ㉢ 해제 후 탑승 하체 포즈(ridePose)가 풀렸는가 (남으면 다리를 벌린 채 서 있다)
//   ㉣ 해제 후 탈것 메시가 씬에서 실제로 사라졌는가 (남으면 유령 탈것)
//   ㉤ 계열을 갈아탈 때 앞 탈것의 높이가 이월되지 않는가 (비행형 → 지상형에서 공중부양이 남던 자리)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.001;
const SEQ = [['fly', 'Mini Dragon'], ['quad', 'Brown Horse'], ['wheeled', 'Bike'], ['flat', 'Hover Board']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate((SEQ) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        const out = [];
        const mount = (name) => {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name; Scene3D.refreshMount();
        };
        const dismount = () => { S.activeMount = null; S.activeMounts = []; Scene3D.refreshMount(); };
        // 해제 직후뿐 아니라 몇 프레임 굴린 뒤도 본다 — update()가 되돌려 놓거나 되레 밀어 올릴 수 있다.
        const settle = (n) => { for (let i = 0; i < n; i++) Scene3D.update(1 / 60); };

        for (const [form, name] of SEQ) {
            mount(name);
            const onY = Scene3D.heroG.position.y;
            dismount();
            const offY0 = Scene3D.heroG.position.y;
            settle(30);
            out.push({
                form, name,
                onY: +onY.toFixed(3),
                offY0: +offY0.toFixed(3),
                offY: +Scene3D.heroG.position.y.toFixed(3),
                rotX: +Scene3D.heroG.rotation.x.toFixed(4),
                ridePose: !!Scene3D.ridePose,
                riding: !!Scene3D.riding,
                mountInScene: !!Scene3D.mountGroup,
                rideY: +(Scene3D.rideY || 0).toFixed(3),
                // 라이딩 스커트(탑승 중 옆을 터서 앞판·뒤판으로 가르는 것)가 **하차 후 통짜로 되돌아오는지**.
                // 안 되돌아오면 서 있는 영웅의 옆구리가 뚫린 채 남는다 — 눈으로는 잘 안 잡히는 회귀라
                // 여기서 지오메트리 동일성으로 못 박는다.
                skirtRestored: (Scene3D.heroRig && Scene3D.heroRig.seatParts || [])
                    .every(m => !m.userData.fullGeo || m.geometry === m.userData.fullGeo),
            });
        }
        // ㉤ 비행형 → 지상형 직결 환승: 앞 탈것 높이가 남는지
        mount('Mini Dragon'); settle(10);
        const flyY = Scene3D.heroG.position.y;
        mount('Brown Horse'); settle(30);
        out.push({
            form: 'switch', name: 'Mini Dragon→Brown Horse',
            onY: +flyY.toFixed(3), offY0: 0, offY: +Scene3D.heroG.position.y.toFixed(3),
            rotX: +Scene3D.heroG.rotation.x.toFixed(4), ridePose: !!Scene3D.ridePose,
            riding: !!Scene3D.riding, mountInScene: !!Scene3D.mountGroup,
            rideY: +(Scene3D.rideY || 0).toFixed(3),
        });
        return out;
    }, SEQ);

    let bad = 0;
    for (const r of rows) {
        const f = [];
        if (r.form === 'switch') {
            // 환승은 '해제'가 아니다 — 새 탈것의 안장 높이(rideY)에 정확히 앉아 있어야 한다.
            if (Math.abs(r.offY - r.rideY) > 0.09) { f.push(`✗ 환승 후 높이 이월 (영웅 ${r.offY} vs 새 안장 ${r.rideY})`); bad++; }
            else f.push(`OK 새 안장에 안착 (${r.offY} ≈ ${r.rideY})`);
            if (!r.riding) { f.push('✗ 환승 후 riding 이 꺼짐'); bad++; }
            console.log(`[환승] ${r.name}  비행높이 ${r.onY} → ${f.join(' / ')}`);
            continue;
        }
        if (Math.abs(r.offY) > TOL) { f.push(`✗ 지면 미복귀 y=${r.offY}`); bad++; } else f.push('OK 지면 복귀');
        if (Math.abs(r.rotX) > TOL) { f.push(`✗ 기울기 잔존 ${r.rotX}`); bad++; } else f.push('OK 기울기 0');
        if (r.ridePose) { f.push('✗ 탑승 포즈 잔존'); bad++; } else f.push('OK 포즈 해제');
        if (r.riding) { f.push('✗ riding 플래그 잔존'); bad++; }
        if (r.mountInScene) { f.push('✗ 유령 탈것 잔존'); bad++; } else f.push('OK 메시 제거');
        if (!r.skirtRestored) { f.push('✗ 라이딩 스커트 잔존(옆이 뚫린 채)'); bad++; } else f.push('OK 스커트 복원');
        console.log(`[${r.form}] ${r.name.padEnd(14)} 탑승 y ${String(r.onY).padStart(6)} → 해제 즉시 ${String(r.offY0).padStart(6)} → 30프레임 후 ${String(r.offY).padStart(6)}  ${f.join(' / ')}`);
    }

    if (errors.length) { console.log('\n페이지 에러:'); errors.forEach(e => console.log('  ' + e)); }
    else console.log('\n(no page errors)');
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}건`);
    await browser.close();
    process.exit(bad === 0 && !errors.length ? 0 : 2);
})();
