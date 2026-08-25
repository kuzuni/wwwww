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
    probe-topbar-badge.js       # main 상단 프로필 배지 — 타일↔알약 겹침(오버행·flush). main-px 의 `프로필`은 아바타 판 잉크만 보고 이 관계는 아무도 안 봤다
    probe-techov-px.js          # tech-overview 042407
    probe-techbranch-px.js      # tech-branch 042546
    probe-geardetail-px.js      # gear-detail 043244
    probe-pets-dom.js           # pets        042356
    probe-pets2-dom.js          # pets-2      042445
    probe-pets-timer-px.js      # pets·pets-2 부화 타이머 글자 크기 — dom 판정기가 줄 y 만 보고 크기는 안 봤다
    probe-equipped-label.js     # pets·skills '장착됨' 흰 깃발(폭·바 안 세로 정렬) — dom 판정기가 '바'만 보고 깃발은 안 봤다
    probe-hatch-cone.js         # pets 부화기 빛기둥 세로 범위 — pets2-dom 은 폭·중심·피치만 보고 세로는 안 봤다
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
    probe-pinfo-subs-bottom.js  # player-info 스탯 목록 **아랫끝** — pinfo-px 는 목록 위(그리드·오브 줄)만 보고 아랫끝은 아무도 안 봤다
    probe-pinfo-header.js       # player-info 머리줄 — 우측 3줄 블록(고친 값) + 좌·우 인셋(R6 교집합을 기각한 값) 둘 다 지킨다
    probe-fl-head.js            # forge-list 042905 시대 헤더 막대 — 같은 사유로 묻혀 있었다(3건째)
    probe-fl-body.js            # forge-list 042905 본문(카드·그리드·타일)
    probe-fl-cell-star.js       # forge-list 셀 ★ ↔ 승천 횟수 1:1
    probe-fl-section-gap.js     # forge-list 시대 섹션 사이 간격 — 타일 개수와 무관한 값이라 판정 가능한데 미판정이었다
    probe-cell-icon-size.js     # 메인 장비 칸 아이콘 채움
    probe-grid-empty.js         # 빈 상태 문구 스팬
    probe-xmark-dom.js          # 닫기 ✕ 캔버스 아이콘 계약(폭/높이/색, icon-gen)
    probe-autoforge-toast.js    # 자동 제련 처리 토스트 0건(autoforge-toast-suppress)
    probe-offline-collect-tick.js  # 오프라인 [수집] 버튼 재렌더 유실 0(offline-collect-tick-rerender)
    probe-eggcell-label-shadow.js  # 탈것 셀 라벨 외곽선(eggcell-slotname-noshadow)
    probe-lgr-rank-clip.js      # 리그 보상 등수 라벨 pill 침범 0(lgr-rank-label-overflow)
    probe-chat-win-badge.js     # 채팅 전투 공유 `승리` 배지 위치 + 검정 키라인(chat-win-badge)
    # 🚩 아래 3종은 **판정문·종료코드를 다 갖춘 판정기인데 목록에 없어 묻혀 있었다**(4~6건째 — 앞선
    #    pinfo-px·fl-head·fl-body 와 같은 사유). 이 셋이 빠져 있어서 dungeons·pass·craft-compare
    #    세 화면이 '전수 검증'이라는 이름 아래 **한 번도 판정되지 않고** 있었다.
    probe-dungeons-px.js        # dungeons     042251
    probe-dungeons-pitch-dom.js # dungeons 카드 피치를 **DOM 으로** — 위 px 자는 배너 그림 값에 끌려다닌다(dungeons-card-pitch-2p)
    probe-pass-px.js            # pass         042705 (단위가 %TW=탭줄 폭 기준이다)
    probe-ccmp-px.js            # craft-compare 043224
    # 🚩 7~10건째 — 판정 낱말이 없어(ⓖ 방언) 덤프로 오해받던 판정기들. 원본 목표치와 ±2%p 로
    #    대조하고 종료 코드까지 내는데 목록에 없어, 이 4개 화면도 한 번도 판정되지 않았다.
    probe-skills-dom.js         # skills       042340 (이번에 종료 코드를 붙였다)
    probe-sheet-title-center.js # skills       042340 시트 헤더 제목이 앱 가로 중앙인가. skills-dom 은 14요소를 재고 전부 통과인데 그 표에 제목이 없어, 중앙에서 8.52%p 밀린 걸 아무 게이트도 못 봤다
    probe-skills-dashed-divider.js # skills    042340 버튼행↔소환바 사이 전폭 점선. **없는 요소는 좌표 표에 줄이 안 생겨 영원히 초록**이라, 존재·구조부터 판정한다
    probe-sheet-head-hairline.js # 전 시트     원본엔 없는 헤더 아래 전폭 가로선이 **다시 들어오지 않는가**(있어야 할 것이 아니라 없어야 할 것을 지키는 자)
    probe-equipped-icons-pitch.js # skills     042340 장착됨 바 **안쪽** 미니오브 피치·묶음. equipped-label 은 바와 깃발만, skills-dom 은 바 한 줄만 봐서 안쪽 배분은 아무도 안 봤다
    probe-offline-dom.js        # offline      042110
    probe-skilldetail-dom.js    # skill-detail 042426
    probe-rates-dom.js          # summon-rates 042521
    # 🚩 11~14건째 — 같은 ⓖ 방언. 이들도 원본 목표치 대조 + 종료 코드를 이미 갖추고 있었다
    #    (한때 '원본 참조 없는 클론 덤프'로 잘못 적어 뒀는데, 실제로는 동반 `-ref` 프로브가 뽑은
    #    원본 실측치를 표로 박아 두고 ±2%p 로 대조하는 완성된 판정기다).
    probe-petdetail-dom.js      # pet-detail   042449
    probe-petupgrade-dom.js     # pet-upgrade  042503
    probe-affilter-dom.js       # autoforge-filter 042950
    probe-forge-detail-dom.js   # forge-detail 042931
    # 🚩 판정기가 아니라 **판정기의 자(尺)를 지키는 판정기**. 키라인 규칙의 술어 ①~④ 를 합성
    #    레코드로 재확인한다(원본 확대로 얻은 반례가 그대로 케이스로 박혀 있다).
    #    등재 사유: `probe-label-keyline-census` 와 `probe-screen-ring-todo` 가 같은 규칙을 따로
    #    베껴 두고 있다가 술어 4개만큼 갈라졌고, 하필 **작업 순위(ⓛ)를 뽑는 쪽**이 낡은 자였다.
    ring-rule.js                # 키라인 규칙 단일 원본 — 술어 ①~④ 회귀
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
    # 판정 줄만 뽑는다(마지막 것). 🚨 **판정문 방언이 6가지다** — 옛 정규식은 `(^|판정: )(PASS|FAIL)`
    #    뿐이라 나머지를 **전부 못 읽고 '판정문 없음 — 측정 덤프일 수 있다'로 흘려보냈다**
    #    (2026-08-19 전수 실행 실측: 29종 중 **12종**이 멀쩡한 판정기인데 덤프 취급이었다).
    #    그 경고는 '이 도구는 못 믿는다'는 뜻이라, 진짜 덤프와 구별이 안 되면 경고가 무의미해진다.
    #    ⓐ `판정: 통과/불통과`(probe-main-px·techbranch-px·geardetail-px·league-verdict)
    #    ⓑ `=> PASS` / `=> 불통과 N건`(probe-lgr-dom·tn-dom) — 실패에 'FAIL' 글자를 아예 안 쓴다
    #    ⓒ `✅ PASS` / `❌ FAIL`(probe-fi-dom)
    #    ⓓ `결과: PASS` / `결과: FAIL N건`(probe-xmark-dom·autoforge-toast·offline-collect-tick·
    #       eggcell-label-shadow·lgr-rank-clip)
    #    ⓔ `총평: PASS/FAIL`(뷰포트를 여러 개 도는 판정기 — probe-chatprev-contrast 꼴)
    #    ⓕ `측정기 고장`(자기검증에 걸려 수치를 안 낸 것 — 아래 rc=2 와 짝이다)
    #    도구 12개를 고치는 대신 **읽는 쪽 한 곳**을 넓힌다 — 판정문 문구를 바꾸면 그 문구를 따로
    #    긁어 쓰는 다른 스크립트가 조용히 깨질 수 있고, 방언은 앞으로도 또 생긴다.
    #    ⚠️ 못 읽으면 경고 한 줄로 끝나는 게 아니다: 아래 **'판정문은 FAIL 인데 exit 0' 안전망이
    #    그 12종에서 통째로 꺼진다**(probe-shop-dom 때 잡은 사고가 재발해도 초록). 실제로 술어를
    #    넓히자마자 `probe-geardetail-px` 가 그 상태로 걸렸다(판정문 불통과인데 exit 0).
    #    ⓖ `최대 편차 X%p · 초과 N건`(probe-offline-dom·skilldetail-dom·rates-dom) — **판정 낱말이 아예
    #       없고 초과 건수가 곧 판정이다**(0 건이면 통과). 종료 코드는 멀쩡히 내므로 판정기가 맞다.
    vline="$(printf '%s\n' "$out" | grep -E '(^|=> |✅ |❌ |결과: |판정: |총평: )(PASS|FAIL|통과|불통과)|불통과 [0-9]+건|초과 [0-9]+건|측정기 고장' | tail -1)"
    # 잡은 줄을 PASS/FAIL 로 환산한다(불통과 0건·초과 0건은 통과다).
    # ⚠️ `불통과` 가 `통과` 를 포함하므로 **반드시 불통과를 먼저** 볼 것.
    # ⚠️ 행 표시자 `← ±2%p 초과` 에는 건수가 없어 `초과 [0-9]+건` 에 안 걸린다(의도한 것).
    if   printf '%s' "$vline" | grep -qE 'FAIL|❌|불통과 [1-9]|측정기 고장'; then verdict=FAIL
    elif printf '%s' "$vline" | grep -qE '불통과 0건|초과 0건';               then verdict=PASS
    elif printf '%s' "$vline" | grep -qE '불통과|초과 [1-9]';                 then verdict=FAIL
    elif printf '%s' "$vline" | grep -qE 'PASS|통과';                         then verdict=PASS
    else verdict=""; fi
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
    elif [ "$rc" = 2 ]; then
        # rc=2 는 **측정기 고장**(자기검증에 걸려 수치를 안 낸 것)이지 비율 결함이 아니다 —
        # 좇으면 멀쩡한 레이아웃을 망가뜨리니 라벨을 구분한다. 다만 '검증 안 된 화면'이므로
        # 초록으로 세지 않고 불통과에 함께 담아 스크립트가 1 로 끝나게 둔다.
        fail=$((fail+1)); FAILED+=("$p")
        printf 'BROKEN %-25s (측정기 고장 — 비율 결함 아님. 재실행할 것)\n' "$p"
        printf '%s\n' "$out" | grep -E '측정기 고장|측정 실패|→' | head -4 | sed 's/^/        /'
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
