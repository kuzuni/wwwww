# 작업 완료 알림 (ntfy)

`ntfy-topic.txt` = 알림을 받을 ntfy 토픽 이름.

## 왜 저장소에 두나
사용자 지시(2026-08-21): *"되게 하라고. md 쓰던 뭘 하든."*
원래 자리는 GitHub Secret(`NTFY_TOPIC`)인데 **에이전트에게 Secret 등록 권한이 없어서**,
어느 세션(웹·앱·데스크탑·다른 클로드 세션)에서 열어도 알림이 가게 하려고 파일로 둔다.

## ⚠️ 이 파일은 공개된다
이 저장소는 **public** 이고 ntfy 토픽은 **인증이 없다** — 이름을 아는 사람은 누구나
그 토픽으로 **알림을 보낼 수 있고(스팸), 구독해 내용을 볼 수 있다(도청)**.
그걸 알고도 편의를 택한 상태다. 숨기려 base64 같은 걸로 감싸지 말 것 — 어차피
되돌릴 수 있어 보안이 아니고, 의도만 흐린다.

## 더 안전하게 바꾸는 법 (둘 중 하나, 아무 때나 가능)
1. 저장소 **Settings → Secrets and variables → Actions** 에 `NTFY_TOPIC` 등록
   → **secret 이 이 파일보다 우선**이므로 등록만 하면 이 파일은 자동으로 무시된다.
   그 뒤 이 파일을 지우면 노출도 끝난다.
2. ntfy 에서 **접근 토큰이 걸린 토픽**을 만들고 `NTFY_TOPIC`·`NTFY_TOKEN` 을 Secret 으로.
   (워크플로·훅 둘 다 `NTFY_TOKEN` 을 이미 지원한다)

## 우선순위 (워크플로·Stop 훅 공통)
`NTFY_TOPIC`(secret/환경변수) → 없으면 이 디렉터리의 `ntfy-topic.txt`.
로그에는 `::add-mask::` 로 가려 찍힌다.

## 언제 알림이 가나
- **자동**: main 에 푸시 → GitHub Pages 배포 완료 → `배포 완료 · <커밋7자리>` + 커밋 제목
  (`.github/workflows/ntfy-notify.yml`, `workflow_run` 트리거)
- **수동**: Actions → *ntfy notify* → Run workflow (문구 입력 가능)
- **세션 안에서**: `.claude/hooks/ntfy-notify.sh` (Stop 훅). 단 클라우드 컨테이너는
  egress 프록시가 ntfy 를 막으므로(실측 403) 환경 설정에서 `ntfy.sh` 를 허용해야 동작한다.
