#!/bin/sh
# 회귀 목록 — 판정(exit 코드)을 제대로 내는 프로브를 여기 등재하고, 세션 시작/종료 때 돌린다.
# 배경: probe-cell-icon-size.js 는 판정까지 완비된 프로브였는데 아무도 안 돌려서
#       2026-08-17 통과(83.0%)가 +7%p 회귀(90%대)로 조용히 썩었다 (TODO cell-icon-oversize).
# 규칙: ① 여기 넣는 프로브는 PASS/FAIL 판정과 exit 코드가 있어야 한다(측정 덤프는 넣지 말 것)
#       ② 항목을 [x] 로 만들 때 그 판정기를 한 줄 추가할 것 ③ 전부 통과해야 exit 0.
cd "$(dirname "$0")" || exit 1
fail=0
for p in \
    probe-geo-ratchet.js \
    probe-cell-icon-size.js \
    test-voxel.js \
    test-voxel-shapes.js \
    probe-voxel-build.js \
    probe-equip-voxel.js \
    probe-equip-framing.js \
    probe-grid-empty.js \
    test-death-timeline.js \
    probe-death-remnant.js \
    probe-creature-framing.js \
    probe-arm-taper.js \
    probe-vox-limb.js \
    probe-vox-plate.js \
    probe-hero-tris.js \
    probe-icon-cross-screen.js \
    probe-icon-blockify.js \
    probe-skillfx-timeline.js \
    probe-tools-wait-guard.js \
    probe-scene-null-guard.js \
    probe-dungeon-clear-softlock.js \
    probe-fire-color.js \
    probe-blade-exit.js \
    probe-nova-beat.js \
    probe-meteor-causality.js \
    probe-vortex-spin.js \
    probe-buff-aura.js \
    probe-halo-spin.js \
    probe-hold-deck.js \
    check-autoforge-purge-held.js \
    check-autoforge-batch-overlay.js \
    probe-league-emblem.js \
    check-sr-ok-gold.js \
    check-autobatch-nan-coins.js \
    probe-icon-light-frame.js \
    probe-alloy-trim-contact.js \
    probe-armor-era-silhouette.js \
    probe-midground-depth.js \
    probe-emissive-bleed.js \
    probe-sky-band.js \
    probe-sky-lobe.js \
    probe-boot-pending-craft.js \
    probe-summon-full-btn.js \
    probe-upgrade-empty-guard.js \
    probe-tabx-clickable.js \
    probe-popup-close.js \
    probe-dim-tabbar.js \
    probe-css-var-undefined.js \
    probe-arc-centered.js \
    probe-enemy-cute.js \
    probe-lgr-px.js \
    probe-mount-neck-height.js \
    probe-mount-rein-rest.js \
    probe-ride-seat.js \
    probe-prop-voxel.js \
    probe-voxcon-enemy.js \
    probe-terrain-voxel.js \
    probe-crystal-sculpt.js \
    probe-biome-mat-path.js \
    probe-pinfo-scene.js \
    probe-orb-face-flat.js \
    probe-eye-bloom-wash.js \
; do
    echo "── $p"
    node "$p" >/tmp/regress-out.txt 2>&1
    code=$?
    tail -3 /tmp/regress-out.txt
    [ $code -ne 0 ] && { echo "❌ $p (exit $code)"; fail=1; }
done
[ $fail -eq 0 ] && echo "✅ 회귀 목록 전부 통과" || echo "❌ 회귀 발견 — 위 FAIL 프로브를 TODO에 등재할 것"
exit $fail
