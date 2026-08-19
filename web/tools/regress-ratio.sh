#!/usr/bin/env bash
# ============================================================================
# regress-ratio.sh — '전 UI 비율 전수 검증 패스'(ui-ratio-audit)의 판정기를 한 번에 돌린다.
# ----------------------------------------------------------------------------
# 왜: 이 항목의 화면별 판정기는 20종이 넘는데 **아무도 전부 돌리지 않는다**. 인계 메모가
#     반복해 짚은 사고가 정확히 그것이다 — `probe-cell-icon-size` 는 판정기가 멀쩡히
#     있는데 4뷰포트 전건 FAIL 인 채로 며칠 썩었고, `probe-grid-empty` 는 기대치가 낡아
#     가짜 FAIL 을 내고 있었다. 병렬 세션이 css 를 계속 고치는 구조라 **한 화면을 고치면
#     다른 화면이 조용히 깨진다.** 그래서 판정기를 모아 한 줄 요약으로 뽑는다.
#
# 사용: bash web/tools/regress-ratio.sh            (전부)
#       bash web/tools/regress-ratio.sh main pass  (이름 일부로 골라서)
#
# ⚠️ px 계열(`*-px.js`)은 `tools/ref-cmp/clone/*.png` 를 읽는다 — 먼저
#    `node tools/shot-screens.js` 로 클론 캡처를 갱신하지 않으면 **낡은 그림을 재고**
#    '고쳤는데 그대로'라는 유령 결과가 나온다(인계 함정 ④ 와 같은 뿌리).
# ⚠️ 병렬 세션이 붙으면 컨테이너가 눌려 멀쩡한 코드에서도 20s 대기가 터진다(인계 ⓔ).
#    TIMEOUT 을 넉넉히 두고, 죽은 건 코드를 의심하기 전에 한 번 더 돌릴 것.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"

TIMEOUT="${RATIO_TIMEOUT:-420}"

# 화면별 비율 판정기 — '판정 줄 + exit 코드'를 실제로 내는 것만 넣는다.
# (측정 덤프는 exit 0 이 통과를 뜻하지 않으므로 여기 넣으면 거짓 초록이 된다 — 인계 메모 ㉡.)
PROBES=(
    probe-main-px.js            # main        042120
    probe-techov-px.js          # tech-overview 042407
    probe-techbranch-px.js      # tech-branch 042546
    probe-geardetail-px.js      # gear-detail 043244
    probe-pets-dom.js           # pets        042356
    probe-pets2-dom.js          # pets-2      042445
    probe-lgr-dom.js            # league-rewards 042208
    probe-league-verdict.js     # league      042149
    probe-lc-dom.js             # league-challenge 042228
    probe-profile-dom.js        # profile     042724
    probe-settings.js           # settings    042744
    probe-af-dom.js             # autoforge   043117
    probe-dgd-dom.js            # dungeon-detail 042304
    probe-fi-dom.js             # forge-info  042831
    probe-shop-dom.js           # shop        042632
    probe-tn-dom.js             # tech-node   042605
    probe-pinfo-px.js           # player-info 043313 — 판정문·종료코드를 갖췄는데 목록에 없어 묻혀 있었다
    probe-cell-icon-size.js     # 메인 장비 칸 아이콘 채움
    probe-grid-empty.js         # 빈 상태 문구 스팬
    probe-xmark-dom.js          # 닫기 ✕ 캔버스 아이콘 계약(폭/높이/색, icon-gen)
    probe-autoforge-toast.js    # 자동 제련 처리 토스트 0건(autoforge-toast-suppress)
    probe-offline-collect-tick.js  # 오프라인 [수집] 버튼 재렌더 유실 0(offline-collect-tick-rerender)
    probe-eggcell-label-shadow.js  # 탈것 셀 라벨 외곽선(eggcell-slotname-noshadow)
    probe-lgr-rank-clip.js      # 리그 보상 등수 라벨 pill 침범 0(lgr-rank-label-overflow)
)

if [ "$#" -gt 0 ]; then
    sel=()
    for pat in "$@"; do for p in "${PROBES[@]}"; do case "$p" in *"$pat"*) sel+=("$p");; esac; done; done
    PROBES=("${sel[@]}")
fi

pass=0; fail=0; dead=0
# ⚠️ `declare -a FAILED` 만 하면 배열이 **아직 안 만들어진다** — 전부 통과해서 한 번도 안 담기면
#    `set -u` 아래에서 아래 `${#FAILED[@]}` 가 'unbound variable' 로 터진다(전 화면 초록인 런에서만
#    에러가 찍히는 뒤집힌 증상이라 오래 안 잡혔다). 빈 배열로 초기화해 둔다.
declare -a FAILED=() DEAD=()
for p in "${PROBES[@]}"; do
    [ -f "$p" ] || { echo "SKIP  $p (없음)"; continue; }
    out="$(timeout "$TIMEOUT" node "$p" 2>&1)"; rc=$?
    # 판정 줄만 뽑는다(마지막 PASS/FAIL 줄. '판정: FAIL — …' 꼴도 잡는다).
    verdict="$(printf '%s\n' "$out" | grep -oE '(^|판정: )(PASS|FAIL)' | tail -1)"
    worst="$(printf '%s\n' "$out" | grep -oE '최대 편차 [+-]?[0-9.]+%p' | tail -1)"
    # 🚨 종료 코드만 믿지 않는다 — `probe-shop-dom` 은 판정문을 찍으면서 exit 코드를 안 내
    #    ±2%p 를 넘겨도 초록으로 찍히고 있었다(2026-08-19 실측, 그 자리에서 고쳤다).
    #    글자로 FAIL 인데 rc=0 이면 도구가 고장 난 것이므로 통과로 세지 않는다.
    if [ "$rc" = 0 ] && printf '%s' "$verdict" | grep -q FAIL; then
        fail=$((fail+1)); FAILED+=("$p")
        printf 'FAIL  %-26s %s  (⚠️ 판정문은 FAIL 인데 exit 0 — 그 도구에 종료 코드를 붙일 것)\n' "$p" "$worst"
        printf '%s\n' "$out" | grep -E '←|✗|초과 [0-9]+건' | head -8 | sed 's/^/        /'
    elif [ "$rc" = 0 ]; then
        pass=$((pass+1)); printf 'PASS  %-26s %s%s\n' "$p" "$worst" "$([ -z "$verdict" ] && echo '  (⚠️ 판정문 없음 — 측정 덤프일 수 있다)')"
    elif [ "$rc" = 124 ]; then
        dead=$((dead+1)); DEAD+=("$p"); printf 'DEAD  %-26s (%ss 초과 — 병렬 부하일 수 있다, 재실행할 것)\n' "$p" "$TIMEOUT"
    else
        fail=$((fail+1)); FAILED+=("$p")
        printf 'FAIL  %-26s %s\n' "$p" "$worst"
        printf '%s\n' "$out" | grep -E '←|✗|초과 [0-9]+건' | head -8 | sed 's/^/        /'
    fi
done

echo
echo "통과 $pass · 불통과 $fail · 미완 $dead"
[ "${#FAILED[@]}" -gt 0 ] && echo "불통과: ${FAILED[*]}"
[ "${#DEAD[@]}" -gt 0 ] && echo "미완:   ${DEAD[*]}"
exit $(( fail > 0 ? 1 : 0 ))
