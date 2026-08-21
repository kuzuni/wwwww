# 이 저장소에서 일하는 규칙

## 🔔 작업이 끝나면 ntfy 로 알린다 (사용자 지시 2026-08-21, 상시)

사용자 원문: *"이제 작업 완료하면 이거로 쏴. 잘 오네."*

작업(한 덩어리의 요구사항)을 끝내고 push 한 **직후**, ntfy 토픽으로 완료 알림을 쏜다.

```
GitHub MCP → actions_run_trigger
  method: run_workflow · owner: kuzuni · repo: wwwww
  workflow_id: ntfy-notify.yml · ref: main
  inputs: { topic: "<사용자 토픽>", text: "<무엇을 끝냈는지 한 줄>" }
```

- 🚨 **컨테이너에서 직접 `curl https://ntfy.sh/...` 하지 말 것 — 반드시 실패한다.**
  클라우드 세션의 egress 프록시가 ntfy 를 막는다(실측 2026-08-21:
  `gateway answered 403 to CONNECT`, host `ntfy.sh:443`). 그래서 **GitHub 러너**를 거친다.
- 🚨 **토픽 이름을 저장소 파일에 쓰지 말 것.** 이 저장소는 **공개**고, ntfy 토픽은 인증이 없어서
  이름이 곧 발행·구독 권한이다. 워크플로에는 `secrets.NTFY_TOPIC` 참조만 두고, secret 이 아직
  없으면 위처럼 **수동 발사 입력값**으로 넘긴다(입력은 `::add-mask::` 로 로그에서 가려진다).
  토픽 값은 사용자가 대화에서 알려준 것을 쓴다 — 여기 적어 두지 않는다.
- `NTFY_TOPIC` secret 이 등록되면 push → Pages 배포 완료 시점에 **자동으로** 알림이 가므로
  수동 발사는 필요 없어진다(`workflow_run` 트리거).
- 문구는 한 줄로, **무엇을 끝냈는지**를 적는다("작업 완료" 같은 건 정보가 0이다).

⚠️ Claude 앱 푸시(`PushNotification`)와 Routine 완료 알림은 이 계정/세션 조합에서 **도착하지
않는다**(2026-08-21 각각 2회·1회 실측). 알림 경로는 ntfy 하나로 본다.

## 🎨 조형·게임 규약

`web/TODO.md` 상단 블록들이 규약의 원본이다. 특히:
- 펫·탈것·적 조형 = 마인크래프트 몹 문법(`web/js/mobs*.js` 표가 단독으로 쥔다)
- 탑승 자세 = 탈것 위에 서기 · 무기 파지 = 마크 handheld 각
작업 전에 해당 블록을 반드시 읽을 것.
