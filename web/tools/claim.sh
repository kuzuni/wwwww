#!/usr/bin/env bash
# ============================================================================
# claim.sh — 항목 단위 원자적 클레임 (병렬 세션 충돌 방지)
# ----------------------------------------------------------------------------
# 왜: 여러 세션(스케줄 루틴/루프)이 동시에 돌면서 커밋 로그만 보고 조율하면
#     경계에서 새서 같은 TODO 항목을 두 세션이 구현→한쪽 폐기가 반복됐다.
#     로그는 과거 기록이라 "지금 누가 뭘 잡았나"의 실시간 상태가 아니다.
#     이 스크립트는 remote의 push가 원자적 직렬화 지점이라는 사실을 이용한다:
#     두 세션이 같은 항목 락을 만들어도 push는 하나만 먼저 land하고,
#     진 세션은 rebase에서 상대 락(같은 파일)을 보고 양보한다.
#
# 사용법 (반드시 항목 작업을 시작하기 "전에" acquire를 먼저 부를 것):
#   bash web/tools/claim.sh acquire "<항목ID>"   # 잡기.  성공 exit 0 / 이미 점유 exit 2
#   bash web/tools/claim.sh refresh "<항목ID>"   # 리스 갱신(30분 넘는 작업이면 주기적으로)
#   bash web/tools/claim.sh release "<항목ID>"   # 놓기(작업 끝/양보 시)
#   bash web/tools/claim.sh list                 # 살아있는 클레임 목록
#   bash web/tools/claim.sh mine                 # 내 세션이 잡고 있는 항목
#
# 규약:
#  - <항목ID>는 짧고 안정적인 슬러그로 통일한다(예: techtree-links, nav-tabs,
#    mount-slot-icon, craft-popup-stay). TODO 항목마다 같은 ID를 쓸 것.
#  - acquire가 exit 2(BUSY)면 그 항목은 건드리지 말고 다른 항목으로 넘어간다.
#  - 리스(기본 30분)가 지난 락은 죽은 세션 것으로 보고 자동 회수(steal)된다.
#    그래서 긴 작업은 refresh로 리스를 갱신해야 뺏기지 않는다.
#  - 🚨 **STALE 은 '그 세션이 죽었다'는 증거가 아니다** (2026-08-19 3D 스트림 실측).
#    refresh 를 안 부르고 한 시간짜리 작업을 하는 세션이 실제로 있다. 30분 STALE 락을
#    회수해 `pet-articulated-joints` 를 통째로 구현했는데, 그 사이 원 소유 세션이 같은
#    항목을 먼저 push 해서 두 구현이 rebase 에서 충돌했다(내 쪽 전량 폐기 — 두 세션이
#    독립적으로 같은 배선 버그까지 찾아냈다). **갓 STALE 이 된 락(60분 미만)을 회수하기
#    전에 `git log -20 --format=%s | grep <슬러그>` 로 그 세션의 최근 활동을 확인할 것.**
#    최근 커밋이 있으면 살아 있는 것이니 다른 항목으로 넘어간다. 몇 시간~하루짜리
#    STALE(예: 400분+)은 안전하다.
# ============================================================================
set -uo pipefail

LEASE_SEC="${CLAIM_LEASE_SEC:-1800}"   # 30분
BRANCH="${CLAIM_BRANCH:-main}"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not a git repo"; exit 3; }
LOCK_DIR="locks"

# 세션 고유 id — 이 체크아웃에 한 번만 만들고 재사용(.gitignore 처리됨)
ID_FILE=".claim-id"
if [ ! -f "$ID_FILE" ]; then
  echo "sess-$(date +%s)-$$-${RANDOM}${RANDOM}" > "$ID_FILE"
fi
ME="$(cat "$ID_FILE")"
NOW="$(date +%s)"

slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
field() { sed -n "s/^$1=//p" "$2" 2>/dev/null | head -1; }

# remote 최신화(깨끗한 트리 전제). 실패 시 1.
sync() { git pull --rebase -q origin "$BRANCH" 2>/dev/null; }

# 락 파일만 커밋하고 push. push 실패 시 rebase 후 재시도.
# on rebase conflict(같은 항목을 상대가 먼저 잡음) → 콜러가 처리하도록 1 반환.
# ⚠️ push refspec 은 반드시 `HEAD:refs/heads/$BRANCH` 로 줄 것 — `origin $BRANCH` 는
#    "로컬 브랜치 $BRANCH"를 밀기 때문에, 체크아웃이 detached HEAD 이거나 로컬 main 이
#    낡은 컨테이너에서는 push 가 non-fast-forward 로 **항상** 거부된다.
#    (2026-08-18 UI 세션 실측: 클론된 컨테이너가 detached HEAD + 로컬 main 이 구
#     히스토리(ahead 8/behind 51)에 머문 상태라 acquire 가 전부 거짓 BUSY 를 냈다.)
push_lock() {
  local msg="$1"
  git add "$LOCK_DIR" >/dev/null 2>&1
  git commit -q -m "$msg" >/dev/null 2>&1 || return 0   # 변경 없음
  local i
  for i in 1 2 3 4 5 6 7 8; do
    if git push -q origin "HEAD:refs/heads/$BRANCH" 2>/dev/null; then return 0; fi
    if ! git pull --rebase -q origin "$BRANCH" 2>/dev/null; then
      return 1   # 충돌 — 콜러가 양보/복구 결정
    fi
  done
  return 1
}

lock_owner() { field owner "$LOCK_DIR/$1.lock"; }
lock_ts()    { field ts    "$LOCK_DIR/$1.lock"; }

cmd="${1:-}"; raw="${2:-}"
id="$(slug "$raw")"

case "$cmd" in
  acquire)
    [ -n "$id" ] || { echo "usage: claim.sh acquire <항목ID>"; exit 3; }
    sync || true
    if [ -f "$LOCK_DIR/$id.lock" ]; then
      owner="$(lock_owner "$id")"; ts="$(lock_ts "$id")"; ts="${ts:-0}"
      age=$(( NOW - ts ))
      if [ "$owner" != "$ME" ] && [ "$age" -lt "$LEASE_SEC" ]; then
        echo "BUSY $id — owner=$owner age=${age}s (리스 $((LEASE_SEC/60))분). 다른 항목으로."
        exit 2
      fi
      # 내 것이거나 리스 만료 → 회수/갱신 진행
    fi
    mkdir -p "$LOCK_DIR"
    printf 'owner=%s\nitem=%s\nts=%s\n' "$ME" "$id" "$NOW" > "$LOCK_DIR/$id.lock"
    if ! push_lock "[claim] $id"; then
      # 내 락 커밋을 버리고 remote 상태로 되돌린 뒤 원인을 갈라 본다.
      # ⚠️ 이 reset --hard 는 **커밋 안 한 작업 파일까지 날린다**. acquire 는 문서대로
      #    반드시 깨끗한 트리에서 부를 것(더티 트리면 pull --rebase 가 거부돼 여기로 온다).
      git rebase --abort >/dev/null 2>&1 || true
      git fetch -q origin "$BRANCH" >/dev/null 2>&1 || true
      git reset --hard -q FETCH_HEAD >/dev/null 2>&1 || true
      # 진짜 경쟁이면 remote 에 남의 락이 살아 있다. 없으면 push 자체가 고장난 것 —
      # 이걸 BUSY 로 뭉개면 세션이 '남이 잡았구나' 하고 멀쩡한 항목을 계속 건너뛴다.
      if [ -f "$LOCK_DIR/$id.lock" ]; then
        owner="$(lock_owner "$id")"; ts="$(lock_ts "$id")"; ts="${ts:-0}"
        if [ "$owner" != "$ME" ] && [ $(( NOW - ts )) -lt "$LEASE_SEC" ]; then
          echo "BUSY $id — 경쟁 세션이 먼저 잡음(owner=$owner). 양보함."
          exit 2
        fi
      fi
      echo "ERROR $id — 경쟁이 아니라 push/rebase 자체가 실패했다(remote 에 남의 락 없음)."
      echo "  ① 트리가 더러우면(git status -sb) pull --rebase 가 거부된다 → 먼저 커밋할 것."
      echo "  ② detached HEAD 이거나 로컬 $BRANCH 가 낡으면 push 가 계속 거부된다 →"
      echo "     git checkout -B $BRANCH origin/$BRANCH 로 붙이고 재시도."
      exit 4
    fi
    # land 후 재확인: 정말 내가 소유자인가(동시 land 레이스 방어)
    sync || true
    if [ "$(lock_owner "$id")" = "$ME" ]; then
      echo "OK $id — 클레임 성공 (owner=$ME)"
      exit 0
    fi
    echo "BUSY $id — land 레이스에서 밀림. 양보함."
    exit 2
    ;;

  refresh)
    [ -n "$id" ] || { echo "usage: claim.sh refresh <항목ID>"; exit 3; }
    sync || true
    if [ ! -f "$LOCK_DIR/$id.lock" ] || [ "$(lock_owner "$id")" != "$ME" ]; then
      echo "WARN $id — 내 락이 아니거나 없음. refresh 무시."
      exit 2
    fi
    printf 'owner=%s\nitem=%s\nts=%s\n' "$ME" "$id" "$NOW" > "$LOCK_DIR/$id.lock"
    if push_lock "[claim-refresh] $id"; then echo "OK $id — 리스 갱신"; exit 0; fi
    echo "WARN $id — refresh push 실패(다음 주기 재시도)"; exit 1
    ;;

  release)
    [ -n "$id" ] || { echo "usage: claim.sh release <항목ID>"; exit 3; }
    sync || true
    if [ -f "$LOCK_DIR/$id.lock" ] && [ "$(lock_owner "$id")" != "$ME" ]; then
      echo "WARN $id — 내 락이 아님(owner=$(lock_owner "$id")). release 안 함."
      exit 2
    fi
    rm -f "$LOCK_DIR/$id.lock"
    if push_lock "[release] $id"; then echo "OK $id — 놓음"; exit 0; fi
    echo "WARN $id — release push 실패"; exit 1
    ;;

  list)
    sync || true
    found=0
    for f in "$LOCK_DIR"/*.lock; do
      [ -e "$f" ] || continue
      o="$(field owner "$f")"; t="$(field ts "$f")"; t="${t:-0}"; it="$(field item "$f")"
      age=$(( NOW - t )); st="live"; [ "$age" -ge "$LEASE_SEC" ] && st="STALE"
      printf '%-28s owner=%-22s age=%4dm  %s\n' "$it" "$o" "$((age/60))" "$st"
      found=1
    done
    [ "$found" = 0 ] && echo "(살아있는 클레임 없음)"
    exit 0
    ;;

  mine)
    sync || true
    for f in "$LOCK_DIR"/*.lock; do
      [ -e "$f" ] || continue
      [ "$(field owner "$f")" = "$ME" ] && echo "$(field item "$f")"
    done
    exit 0
    ;;

  *)
    echo "usage: claim.sh {acquire|refresh|release|list|mine} [<항목ID>]"
    echo "  내 세션 id: $ME"
    exit 3
    ;;
esac
