# 포지마스터 원본 밸런스 스펙

원본 게임에서 추출된 실측 데이터 기반 (출처: ForgeMasterCalculator, clashiverse 공략).
전체 수치 테이블은 `data/raw/*.js`에 원본 그대로 보관 — 게임 구현 시 이 파일을 JSON으로 변환해 사용.

## 등급 체계 (공통 6등급)

Common → Rare → Epic → Legendary → Ultimate → Mythic
(장비는 별도로 "시대 티어" 10단계: Primitive → Medieval → Early-Modern → Modern → Space → Interstellar → Multiverse → Quantum → Underworld → Divine)

## 대장간 (Forge) — `data/raw/app.js`

- 레벨 1~35. 레벨별 **업그레이드 비용/시간 전체 테이블** 확보 (`forgeUpgrades`).
  - Lv2: 해머 400 / 5분 → Lv10: 15만 / 1일 → Lv20: 370만 / 9일 2시간 → Lv35: 1.03억 / 23일
  - Lv9부터 분할 제작(33.3k×3 형태) = 오토포지 슬롯 확장과 연동
- 레벨별 **시대 티어 제작 확률 전체 테이블** 확보 (`forgeProbabilities`).
  - 예: Lv8에서 Modern 0.2% 최초 등장, Lv20에서 Quantum 0.05%, Lv30에서 Divine 0.01%
- 제작 EXP: Primitive~EarlyModern 1, Modern~Interstellar 2, Multiverse~Divine 3
- **장비 판매가 공식**: `20 × 1.01^(아이템레벨-1) × (1 + 판매보너스%)`

## 장비

- 8부위: 무기/장갑/목걸이/반지/투구/갑옷/신발/벨트
- 서브스탯 부위별 상한 (예: 데미지 +15%/부위, 8부위 캐릭터 합산 실질 상한 존재)
- ❗티어별 기본 공격력/체력 수치는 미확보 → EXP 가중치(1/2/3)와 판매가 커브에 맞춰 근사 설계 필요
- 고유 아이콘/이름이 있는 부위는 무기·투구·갑옷 3종 (캐릭터 외형에 표시되는 부위).
  나머지 5부위(장갑/목걸이/반지/신발/벨트)는 시대별 고유 아트 없음 — 제네릭 처리

### 장비 아이템 카탈로그 (원본 에셋 추출, 총 132종)

| 시대 | 무기 | 투구 | 갑옷 |
|---|---|---|---|
| Primitive | Rock, Branch, Bone, Club, Axe, Slinger, Blowgun | Beard, Mask, Paint, Skull | Hide, Bearskin |
| Medieval | Sword&Shield, Spear&Shield, Bow, Katana, Scythe, Tomahawk, Warhammer | Knight/Greek/Roman/Samurai Helmet, Death's Hat | Iron Plates, Cuirass |
| Early-Modern | Rapier, Crossbow, Musket, Dual Pistols, Pirate's Sword, Executioner | Battle Helmet, Captain's Hat, Feather Hat, Slavic Hat, Top Hat | Armor Skirt, Cavalry Cardigan |
| Modern | AK, M4, Uzi, Sniper, Baton, Riot Shield, Wrench, Knuckledusters | Kevlar/Riot/Steel Helmet, Fedora, Officer's/Sergeant/Winter Hat | Kevlar, Camouflage |
| Space | Blaster, Saber, Robot Sword, Space Gun, Space Pistol | Space Helmet, Bio Helmet, Gas Mask, Iron Mech | Space Suit, Exoskeleton |
| Interstellar | Plasma Rifle, Raygun, Ionic Blaster, Isobaric Cutter, Light Sword&Shield, Dual Wield Melee | Robo Helm, Alien Head, Destroyer Mask, Advanced Mech, Heavy Duty, Stellarium Helm | Plasma Suit, Adamantium Suit |
| Multiverse | Virtual Sword, Virtual Gun, Simulated Bow, Holographic Trident, Mental Spear, Projected Cutlass | Virtual Helmet, Firewall Mask, Stalker Helm, Speedrunner Casquette | Holo Armor, Spectral Plates |
| Quantum | Black Sword&Shield, Black Bow, Black Gun, Black Hammer, Black Spear, Quantum Staff | Energy Helmet, Entanglement Helm, Sub-frequency Mask, Hair Bandana, Hair Tied | Delta Armor, Orbiter Suit |
| Underworld | Shadow Scimitar, Doom Mace, Infernal Trident, Abyssal Fork, Soulpiercer | Hellforged Helm, Spite Crown, Venom Crest, Rotfang Visor | Doom Plate, Molten Plates, Cape |
| Divine | Serpent Sword, Dragon Dagger, Angelic Pitchfork, Siren's Song, Staff, Staff of Wisdom | Protective Halo, Wizard's Hat, Serpent Wreath, Celtic Overhead, White Hair | Holy Gown, Paladin Armor |

## 펫 — `data/raw/eggs.js`

- **알 드랍 등급 확률**: 스테이지 1-1 ~ 10-10 전체 테이블 확보 (`eggDropRates`)
  - 등급 해금 스테이지: Epic 1-4, Legendary 3-1, Ultimate 5-1, Mythic 7-1
  - 후반 수렴 패턴: 하위 등급 17.5/16.5%로 고정되고 최상위 등급만 상승
- **부화 시간**: 30분 / 2시간 / 4시간 / 8시간 / 16시간 / 32시간
- **펫 개체 스탯 전체 확보** (`petStats`): 등급별 3~6종
  - Common: Snail(공50/체1200) ~ Dog(공150/체400) — 같은 등급 내 공/체 트레이드오프
  - Mythic: Genie(156,250/3,750,000), Baby Dragon(312,500/2,500,000), Spectral Tiger(468,750/1,250,000)

## 스킬 — `data/raw/skills.js`

- 소환(고스트타운) 레벨 1~100별 **등급 확률 전체 테이블** 확보 (`skillRatesData`)
  - Lv21에서 Legendary 0.01% 최초 등장, Lv64에서 Mythic 0.01%, Lv100에서 전등급 16.5~17.5% 균등
- 젬 소환 비용: 200젬/회
- 중복 획득 → 스킬 레벨업. 용도 구분: 광역(웨이브) / 단일(보스) / 힐
- ❗개별 스킬 계수/쿨타임은 미확보 → 자체 설계 필요

## 마운트 — `data/raw/mounts.js`

- 소환 비용: 와인더 50개/회
- 마운트 레벨 1~50: 레벨별 **필요 누적 오픈 수 + 등급 확률 전체 테이블** 확보 (`mountSummonRates`)
  - 레벨업 필요 오픈: Lv1→2 2회, 이후 +3씩, Lv34부터 +34씩, Lv50 MAX
- 등급 해금 마운트레벨: Rare 2 / Epic 10 / Legendary 18 / Ultimate 26 / Mythic 34
- **스탯 부스트**: 데미지&체력 +10% / +40% / +80% / +150% / +250% / +400%
- 마운트 이름 목록 확보 (Brown Leaf ~ Hover Disk, 16종)

## 기술트리 (3분기: 대장간 / 힘 / 스킬&펫)

- **노드당 5레벨 상한 · 분기마다 5단계(티어) 세로 트리** (사용자 정정 2026-08-17 — 원본 스크린샷
  shot-042546의 노드 표기가 `N/5`이고, 5단계는 '노드 안의 단계'가 아니라 **트리의 단계**다.
  한 단계의 노드를 전부 만렙으로 만들면 아래 단계가 해금된다. 그전에 적어둔 '노드당 5회 × 5티어 = 25업'
  해석은 폐기)
- 확보된 효과 수치(포인트당): 대장간 타이머 +4%, 업그레이드 비용 -2%, 오프라인 시간 +16%,
  오프라인 획득량 +2%, 장비 숙련 +2%, 판매가 +2%
- 적용 공식: 비용 `base × (1 - tech%)`, 시간 `base ÷ (1 + tech%)`
- ❗노드별 재화(포션/블러드) 비용 커브 미확보 → 근사 설계 필요

## 던전 4종

| 던전 | 해금 | 보상 |
|---|---|---|
| Hammer Thief | 2-10 | 해머/코인 |
| Ghost Town | 2-15 | 스킬 티켓 |
| Invasion | 3-1 | 펫 알 (고등급 확률↑) |
| Zombie Rush | 4-1 | 기술트리 재화(블러드) |

- 열쇠 2/2, 자정 리셋, 최고 클리어 단계 소탕 지원

## 오프라인 보상

- 기본: 코인 1/초 + 해머 1/분, 캡 4시간
- 기술트리로 캡 +16%/pt, 속도 +2%/pt

## 승천 (Ascension)

- **리셋**: 캐릭터 레벨, 장비, 펫, 스킬, 마운트, 알
- **유지**: 골드, 해머, 알껍질(eggshell), 스킬 티켓, 클록와인더
- **권장 시점**: 포지 Lv35 + 스킬/펫/마운트 Lv100 + 던전 19-1~20-1 도달
- **재건 비용(할인 전)**: 포지 골드 41,886,000 + 승천비 300만 / 스킬 티켓 396,600 / 알껍질 193,500 / 와인더 99,000
- 파워 스케일: A1(승천1회차) Multiverse 포지 파워 ≈ 승천 전 Divine 포지 파워

## 기능 해금 순서 (스테이지)

상점 2-1 → 배틀패스 2-5 → 오토포지·해머도둑 2-10 → 고스트타운 2-15 → PvP리그·침공 3-1 → 좀비러시 4-1 → 클랜 4-15

## 미확보 데이터 (자체 설계 필요)

1. 스테이지별 몬스터 HP/공격력/마릿수 — 펫 스탯 스케일(챕터당 약 ×5~6)에 맞춰 역산 설계
2. 장비 티어·레벨별 기본 스탯
3. 기술트리 노드별 비용 커브
4. 개별 스킬 성능(계수, 쿨타임, 범위)
5. PvP 리그/클랜전 상세 (서버 필요 — HTML판은 봇 아레나로 대체)
