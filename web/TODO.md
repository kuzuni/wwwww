# 포지마스터 클론 — 남은 작업 목록

작업 규칙: 한 세션(런)에 **하나의 작업만** 진행한다. 완료하면 체크박스를 채우고 커밋·푸시한다.
시작 전 반드시 `git pull --rebase origin main` 으로 최신화한다.

## 제약 (절대 어기지 말 것)
- three.js r128, 클래식 `<script>` 태그 방식 (모듈/빌드 없음)
- `file://` 더블클릭 실행이 항상 동작해야 함 — 외부 CDN·fetch 금지, 에셋은 base64 임베드
- 밸런스 수치는 `web/BALANCE.md`와 `web/data/raw/` 실측치 기준
- 변경한 js는 `node --check`로 문법 검증, GLB 추가 시 `node web/tools/gen-models-data.js`로 재생성
- 디버그 훅: `?tab=`, `?debug=craft|gear|pets|dungeon|tech|mount|ascend`, `?enemy=slime|golem|goblin|bat|mushroom|wolf|imp`

## 작업 목록 (위에서부터 순서대로)
- [x] 장신구 5부위 3D 프리뷰/썸네일 (부위당 3종 변형)
- [x] Skeleton Mage/Rogue GLB 임베드 — mushroom→Mage, imp→Rogue
- [x] 던전 4종 구현 (Hammer Thief 해머/코인 · Ghost Town 스킬티켓 · Invasion 펫알 · Zombie Rush 블러드) — 열쇠 2/2 자정 리셋, 소탕, `?debug=dungeon[&d=id]`
- [x] 기술 트리(대장장이 연구) 시스템 — BALANCE.md 스펙 기반. 3분기(대장간/힘/스킬&펫) × 노드당 25업(5업×5티어), 재화는 블러드. 메뉴 탭 → 🔬 기술 트리. `?debug=tech`
- [x] 마운트(탈것) 시스템 기초
- [x] 승천(프레스티지) 시스템 — BALANCE.md 스펙 기반
- [ ] 사운드: WebAudio 프로시저럴 효과음 (타격/제작 완료/레벨업/뽑기) — 외부 파일 금지
- [ ] GLB 모드에서 투구/갑옷 외형 반영 (Knight 고정 갑옷 문제) — 색 오버레이 방식
- [ ] 펫 GLB 전환 검토 (Quaternius Animals CC0, poly.pizza) — 25종 중 대표 몇 종만

## 보류 (로컬 실기기 확인 필요 — 클라우드에서 하지 말 것)
- 무기 본 부착 방향/크기 실기기 확인
