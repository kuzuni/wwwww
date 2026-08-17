# 클라우드 루틴 세팅 런북 (두 번째 계정 붙일 때 바로 실행용)

> 목적: 새 Claude 계정(2번째)을 이 프로젝트에 **스무스하게** 붙이기 위한 복붙용 레시피.
> 루틴 = claude.ai Code 크론 세션(RemoteTrigger). 8개 랄프 루프(개발) + 1개 QA가 **같은 저장소에 병렬로 push**하며 `web/TODO.md`를 소진한다.
> 관리 화면: https://claude.ai/code/routines · 게임 배포본: https://kuzuni.github.io/wwwww/web/ · 저장소: https://github.com/kuzuni/wwwww

---

## 0. 사전 준비 (2번째 계정에서 딱 3가지)

1. **GitHub 저장소 접근** — `kuzuni/wwwww`에 2번째 계정의 GitHub 아이디를 **Collaborator(write)** 로 초대. (Settings → Collaborators → Add people) 초대 수락해야 그 계정의 클라우드 세션이 push 가능.
2. **환경(environment) 생성** — 2번째 계정으로 claude.ai/code에서 `github.com/kuzuni/wwwww`를 연결해 한 번 세션을 띄우면 그 계정 전용 `environment_id`(예: `env_xxx`)가 생긴다. **이 값은 계정마다 다르다** — 아래 레시피의 `environment_id`를 그걸로 교체.
3. **모델 정책 확인** — [[fable-only-model]]: 루틴 모델은 `claude-fable-5`, 한도 소진 시 `claude-opus-5`. **소넷 금지.** (현재 1번 계정 루틴은 전부 `claude-opus-5`.)

---

## 1. 핵심 개념 (왜 이렇게 도는가)

- **도메인 분할 병렬 2스트림** — 파일 충돌 없이 동시에 돌리려고 담당 파일을 갈랐다:
  - **UI 스트림**: `ui.js` · `css/` · `index.html` (레이아웃·비율·팝업·스킨·아이콘)
  - **3D 스트림**: `scene3d.js` · `prochar.js` · `combat.js` (3D·전투·연출·캐릭터·적·이펙트)
  - 크로스컷(소환 결과 팝업·모루 연출·판매 코인 연출·장비 썸네일)은 **3D 스트림**이 담당(ui.js도 최소 수정).
- **클레임 가드(직렬화)** — 같은 스트림끼리는 겹치면 안 되므로, 세션 시작 시 `[UI작업중]`/`[3D작업중]` 빈 커밋을 push해 선점하고, 최근 10분 내 같은 스트림 마커가 있으면 `SKIP`. 종료 시 `[UI종료]`/`[3D종료]` + 인계 메모. **다른 스트림 마커는 무시**(병렬).
- **왜 계정 2개** — 처리량 2배 or 한 계정 주간 한도 소진 대비. 2번째 계정은 **같은 저장소·같은 TODO에 워커를 더 붙이는 것**. 클레임 가드가 저장소 커밋 기준이라 계정이 달라도 자동 직렬화된다.
- **2번째 계정 크론은 1번과 시간을 어긋나게** — 아래 스태거 표에서 1번 계정 슬롯 사이 빈틈(약 +3~4분)에 넣으면 워커가 촘촘해진다. (겹쳐도 가드가 SKIP 처리하니 안전하지만, 어긋나야 낭비가 없다.)

---

## 2. 스태거 크론 표 (현재 1번 계정 = 총 9개)

| 슬롯 | 스트림 | cron (매시 N분) |
|---|---|---|
| E | UI | `7 * * * *` |
| B | 3D | `14 * * * *` |
| F | UI | `22 * * * *` |
| C | 3D | `29 * * * *` |
| QA | QA | `29 * * * *` |
| G | UI | `37 * * * *` |
| A | 3D | `44 * * * *` |
| H | UI | `52 * * * *` |
| D | 3D | `59 * * * *` |

→ UI(7·22·37·52)와 3D(14·29·44·59)가 약 7~8분 간격으로 번갈아 실행. 세션이 10~40분 도니 실제로 겹쳐서 2배 병렬.

**2번째 계정 권장 슬롯(빈틈 채우기)**: UI `11·26·41·56`, 3D `3·18·33·48`, QA `48`. (원하면 스트림 하나만, 예: 2번 계정은 UI 4슬롯만 돌려도 됨.)

---

## 3. 공통 job_config (create/update 바디 틀)

RemoteTrigger `create` 액션 바디. `NAME`·`CRON`·`PROMPT`만 슬롯마다 바꾸고 나머지는 고정. **`environment_id`는 그 계정 값으로 교체.**

```json
{
  "name": "NAME",
  "cron_expression": "CRON",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "env_XXXXXXXX_그_계정_값으로_교체",
      "events": [
        { "data": { "message": {
          "role": "user",
          "content": "PROMPT (아래 §4에서 복사)",
          "type": "user",
          "uuid": "슬롯마다_고유_uuid"
        } } }
      ],
      "session_context": {
        "model": "claude-fable-5",
        "allowed_tools": ["Bash","Read","Write","Edit","Glob","Grep","WebSearch","WebFetch","Task"],
        "sources": [ { "git_repository": { "url": "https://github.com/kuzuni/wwwww" } } ]
      }
    }
  }
}
```

- QA 루틴만 `allowed_tools`에서 `Task` 빼도 됨(코드 수정 안 함).
- `model`: 기본 `claude-fable-5`, 한도 소진 시 `claude-opus-5`로 일괄 교체.
- ⚠️ **부분 업데이트(model만) 금지** — model만 보내면 `400 (environment_id 요구)`. 바꿀 땐 위 job_config **전체**(events의 uuid·content 포함)를 재전송.
- 생성 방법 택1: (a) 이 레포에서 세션 띄워 RemoteTrigger 툴로 `create`, (b) claude.ai/code/routines UI에서 수동 생성(프롬프트·크론·모델·repo 지정), (c) `schedule` 스킬.

---

## 4. 프롬프트 3종 (복붙용, 검증된 현행판)

### 4-A. UI 스트림 랄프 루프 (UI 슬롯 전부 동일)

```
**[UI 스트림] 세션 시작 가드**: 이 루틴은 UI 스트림(도메인=ui.js·css·index.html)이다. 3D 스트림과 병렬로 돈다. `git log -6 --format="%s"`로 최근 커밋 확인: ① 최신 UI 마커가 '[UI종료]'면 즉시 시작 ② 최근 10분 내 '[UI작업중]' 커밋이 있으면 다른 UI 세션 활동 중 → 'SKIP_UI' 출력 후 종료 ③ 그 외 시작. **'[3D작업중]'/'[3D종료]' 등 3D 마커는 완전히 무시(병렬이므로 3D가 돌든 말든 UI는 진행).** 시작하면 `git commit --allow-empty -m "[UI작업중] 클레임"` 후 `git push origin main`. push 거부되면 `git pull --rebase origin main` 후 재확인: 최근 10분 내 내가 아닌 '[UI작업중]'가 있으면 'SKIP_UI' 종료, 없으면 다시 push. 종료 시 마지막 커밋 메시지 맨 앞에 '[UI종료]' + 인계 메모.

kuzuni/wwwww 저장소 web/ '포지마스터 클론' HTML 게임을 개발하는 자율 세션(사용자 승인 불필요, 한 작업 끝나도 즉시 다음).

**담당 도메인 = UI만**: web/TODO.md에서 체크 안 된 항목 중 **주로 ui.js·css·index.html을 고치는 작업**(UI 레이아웃·비율·팝업·스킨·아이콘)만 위에서부터 골라 구현. **scene3d.js·prochar.js·combat.js 위주 작업은 건너뛴다 — 3D 스트림 담당.** 크로스컷(소환 결과 팝업·모루 제작 연출·판매 코인 연출·장비 디자인 썸네일)도 3D 스트림 담당이라 손대지 않는다. 순수 캔버스 아이콘 생성(IconGen)은 UI 담당.

반복: 1. `git pull --rebase origin main` 후 TODO.md 읽기 2. 내 도메인 첫 미완료 작업 구현(제약: three.js r128·file://·CDN 금지·base64 임베드; UI는 web/ref/screens/shot-*.png 비율 대조, 통과 기준=독립 비평가 2명 90/100 초과 + 요소 ±2%p 실측) 3. 변경 js `node --check` 4. TODO [x] → 한국어 커밋 → `git pull --rebase origin main` 후 push(TODO.md 충돌 시 양쪽 체크 모두 살림) 5. 즉시 1번.

내 도메인 미완료 없으면 'UI_DONE' 종료. 규칙: 작업당 커밋 하나, 깨진 상태 push 금지, 못 끝내면 동작하는 중간까지 커밋+메모.
```

### 4-B. 3D 스트림 랄프 루프 (3D 슬롯 전부 동일)

```
**[3D 스트림] 세션 시작 가드**: 이 루틴은 3D 스트림(도메인=scene3d.js·prochar.js·combat.js)이다. UI 스트림과 병렬로 돈다. `git log -6 --format="%s"`로 최근 커밋 확인: ① 최신 3D 마커가 '[3D종료]'면 즉시 시작 ② 최근 10분 내 '[3D작업중]' 커밋이 있으면 다른 3D 세션 활동 중 → 'SKIP_3D' 출력 후 종료 ③ 그 외 시작. **'[UI작업중]'/'[UI종료]' 등 UI 마커는 완전히 무시(병렬이므로 UI가 돌든 말든 3D는 진행).** 시작하면 `git commit --allow-empty -m "[3D작업중] 클레임"` 후 `git push origin main`. push 거부되면 `git pull --rebase origin main` 후 재확인: 최근 10분 내 내가 아닌 '[3D작업중]'가 있으면 'SKIP_3D' 종료, 없으면 다시 push. 종료 시 마지막 커밋 맨 앞에 '[3D종료]' + 인계 메모.

kuzuni/wwwww 저장소 web/ '포지마스터 클론' HTML 게임 자율 개발 세션(사용자 승인 불필요, 연속 작업).

**담당 도메인 = 3D·전투·연출**: web/TODO.md 체크 안 된 항목 중 **scene3d.js·prochar.js·combat.js 위주 작업**(3D·전투 밸런스·연출·캐릭터·적·맵 프롭·이펙트·HP연출·보스·탈것 탑승·펫 배치)만 위에서부터 골라 구현. **ui.js·css 순수 UI 레이아웃/스킨 작업은 건너뛴다 — UI 스트림 담당.** 크로스컷(소환 결과 팝업·모루 제작 연출·판매 코인 연출·장비 디자인 썸네일)은 내가 담당 — 이때 ui.js도 필요한 최소한만 수정.

반복: 1. `git pull --rebase origin main` 후 TODO.md 읽기 2. 내 도메인 첫 미완료 작업 구현(제약: three.js r128·file://·CDN 금지·base64; 그래픽/연출은 web/ref/POLISH.md 원신급 기준, 비평가 Task로 9/10 통과제, 연속 프레임 캡처) 3. 변경 js `node --check` + 로직 node 실행 4. TODO [x] → 한국어 커밋 → `git pull --rebase origin main` 후 push(TODO.md 충돌 시 양쪽 체크 살림) 5. 즉시 1번.

내 도메인 미완료 없으면 '3D_DONE' 종료. 규칙: 작업당 커밋 하나, 깨진 상태 push 금지, 못 끝내면 중간까지 커밋+메모.
```

### 4-C. QA 플레이 테스터 (코드 수정 안 함, TODO에 버그만 기록)

```
너는 kuzuni/wwwww 저장소의 web/ '포지마스터 클론' HTML 게임의 **QA 플레이 테스터**다. 사용자 승인 없이 자율로 진행한다. 코드를 고치지 말고(수정은 개발 루프 담당) 직접 플레이해서 버그를 찾아 보고하라.

절차:
1. `git pull --rebase origin main`. Playwright(없으면 npx playwright install chromium)로 `web/index.html`을 열어 실제로 플레이한다.
2. 플레이 시나리오 (각각 수행, 콘솔 에러 수집):
   - 새 세이브 부팅 → 30초 전투 관찰 (적 스폰/전투/웨이브 진행 정상?)
   - 디버그 탭으로 재화 +100000, 스테이지 5-1 이동 → 이상 없는지
   - 모든 탭/팬널/모달 열고 닫기 (대장간/펫/스킬/메뉴/던전/기술트리/마운트 등 전부)
   - 제작 x1/x10, 장착/판매, 스킬 소환 x5, 펫 부화/출전, 던전 4종 입장·소탕, 기술트리 연구
   - 새로고침 후 세이브 유지 확인
3. 각 단계마다 체크: 콘솔 error/uncaught, 화면에 NaN/undefined/Infinity 텍스트, 눌러도 반응 없는 버튼, 격침·화면 밖 UI, 음수 재화, 진행 불가 상태. 스크린샷도 찍어 육안 확인.
4. 발견한 버그는 `web/TODO.md`의 '작업 목록' 맨 위에 `### 🐛 QA 발견 버그` 섹션을 만들어 체크박스로 추가한다 — 재현 절차와 기대/실제 동작을 명확히. 이미 같은 버그가 적혔 있으면 중복 추가하지 않는다.
5. TODO.md만 커밋하고 `git pull --rebase origin main && git push origin main`. 게임 코드는 절대 수정하지 않는다.
6. 버그가 하나도 없으면 'QA_CLEAN' 출력하고 종료.
```

---

## 5. 빠른 체크리스트 (2번째 계정 붙이기)

- [ ] `kuzuni/wwwww`에 2번째 계정 GitHub 아이디 Collaborator 초대·수락
- [ ] 2번째 계정 claude.ai/code에서 repo 연결 → `environment_id` 확보
- [ ] §3 틀에 §4 프롬프트 넣어 루틴 생성 — UI 4슬롯(11·26·41·56) + 3D 4슬롯(3·18·33·48) [+ QA 48]
- [ ] `environment_id` 교체, `model` = `claude-fable-5`(한도 소진 시 `claude-opus-5`)
- [ ] 슬롯마다 `events[].data.message.uuid` 고유값
- [ ] 생성 후 반환된 `next_run_at`·routines URL로 시간 맞는지 확인
- [ ] 첫 실행 후 커밋 로그에 `[UI작업중]`/`[3D작업중]` 클레임과 `[UI종료]`/`[3D종료]` 인계가 도는지 확인

## 6. 운영 팁

- **한도 소진 징후**(런 연속 실패/커밋 중단) → 전 루틴 `model`을 `claude-opus-5`로 일괄 교체(§3 전체 재전송). 한도 풀리면 `claude-fable-5` 복원.
- **로컬 저장소**는 작업 전 항상 `git pull`. 로컬 세션이 직접 코딩하지 말 것(작업은 클라우드가) — 로컬은 TODO 관리·지시 정리 역할.
- **일시정지/삭제/편집**은 claude.ai/code/routines에서.
- 새 슬롯 추가 시 §4 프롬프트 문구를 **그대로** 복붙(가드 프로토콜이 깨지면 직렬화가 무너진다).
