#!/usr/bin/env bash
# ============================================================================
# Stop 훅 — 작업이 끝나면 ntfy 로 알린다 (로컬 데스크탑 훅과 같은 방식).
# ----------------------------------------------------------------------------
# 왜 저장소 안에 두는가: 클라우드 세션(claude.ai/code)은 **매번 새 컨테이너**라
#   `~/.claude` 에 심은 훅이 세션이 끝나면 사라진다. 저장소에 두면 어느 기기에서
#   열어도 같은 알림이 붙는다.
#
# 설정 (둘 다 필요):
#   ① 토픽 — 환경변수 `NTFY_TOPIC`. 클라우드면 claude.ai/code 환경 설정의
#      Environment variables 에, 로컬이면 쉘 프로필에 넣는다.
#      (자체 호스팅은 `NTFY_SERVER`, 보호 토픽은 `NTFY_TOKEN` 도 함께)
#   ② 네트워크 — 클라우드 컨테이너는 egress 프록시가 기본적으로 ntfy 를 막는다.
#      실측(2026-08-21): `gateway answered 403 to CONNECT`, host `ntfy.sh:443`.
#      환경 설정의 네트워크 허용 도메인에 `ntfy.sh`(자체 호스팅이면 그 도메인)를
#      추가해야 한다. 안 하면 이 훅은 **조용히 실패**한다(아래 참조).
#
# 🚨 이 훅은 어떤 경우에도 세션을 막지 않는다 — 네트워크가 죽었든 토픽이 없든
#    항상 exit 0. 훅이 실패해서 작업이 멈추면 알림보다 더 큰 손해다.
# ============================================================================
set -uo pipefail

TOPIC="${NTFY_TOPIC:-}"
[ -z "$TOPIC" ] && exit 0                       # 설정 전이면 아무 일도 안 한다
SERVER="${NTFY_SERVER:-https://ntfy.sh}"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
SUBJECT="$(git log -1 --format=%s 2>/dev/null | cut -c1-90)"
SHORT="$(git log -1 --format=%h 2>/dev/null || echo '')"
DIRTY=""
[ -n "$(git status --porcelain 2>/dev/null)" ] && DIRTY=" · 커밋 안 된 변경 있음"

AUTH=()
[ -n "${NTFY_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer ${NTFY_TOKEN}")

curl -sS --max-time 10 \
  "${AUTH[@]}" \
  -H "Title: 클로드 작업 종료 · ${BRANCH}" \
  -H "Tags: white_check_mark" \
  -H "Click: https://kuzuni.github.io/wwwww/web/" \
  -d "${SHORT} ${SUBJECT}${DIRTY}" \
  "${SERVER}/${TOPIC}" >/dev/null 2>&1 || true

exit 0
