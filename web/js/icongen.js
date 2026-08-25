'use strict';
/*
 * IconGen — Canvas 2D 프로시저럴 아이콘 생성기
 *
 * 제약 준수: 외부 에셋 파일을 일절 임베드하지 않고 코드로만 아이콘을 그린다.
 * 부팅 후 최초 요청 시 1회 그려 dataURL로 캐시하고, 이후에는 캐시를 재사용한다.
 *
 * 사용법:
 *   IconGen.url('coin')              → dataURL
 *   IconGen.img('coin')              → <i class="ico ico-coin"></i> HTML 문자열
 *   IconGen.img('egg', null, { tint: '#a855f7' })  → 등급색 알
 *
 * dataURL 은 아이콘 하나가 20~36KB라 innerHTML 에 직접 박으면 그리드 한 번 그릴 때마다
 * 수백 KB짜리 문자열이 만들어진다. 그래서 dataURL 은 주입한 <style> 안에 클래스로 한 번만 두고,
 * 마크업에는 짧은 클래스명만 넣는다(브라우저도 디코드된 이미지 하나를 공유한다).
 */

/*
 * AVATAR_POOL — 아바타 한 벌(24종). IconGen 이웃 상수로 두는 이유는 아래 두 가지다.
 *
 * ⓐ **한 화면에 두 풀의 얼굴이 섞여 뜬다.** 원래 이 목록은 league.js(20종) · chat.js(12종) ·
 *    ui.js(12종) 세 곳에 서로 다른 내용으로 흩어져 있었다. 세 집단이 안 겹치면 그래도 됐겠지만,
 *    `Chat.shareLeagueResult()` 가 리그 봇의 `opp.avatar` 를 그대로 채팅 공유 카드에 실어 보내서
 *    **채팅 화면 한 곳에 리그 풀과 채팅 풀의 얼굴이 함께 뜬다.** 어느 화면이 어느 풀을 쓰는지로
 *    범위를 나눌 수가 없으니, 애초에 한 벌로 합치는 게 맞다.
 * ⓑ **곧 이 24종을 픽셀 초상으로 바꾼다.** 원본(shot-043500)의 아바타는 이모지가 아니라 흰 라운드
 *    타일 + 순검정 키라인 위의 32×32급 도트 초상이다. 교체 매핑(이모지 키 → IconGen 아이콘)을
 *    한 벌로 끝내려면 키 목록이 한 곳에 있어야 해서, 그리는 쪽인 IconGen 옆에 둔다.
 *
 * ⚠️ `🧑‍🌾` `🧑‍✈️` 류는 ZWJ(+변이 선택자) 결합 문자다. 문자열을 글자로 쪼개면(`Array.from` 포함)
 *    조각나므로, **반드시 이 배열의 원소를 통째로 꺼내 키로 쓸 것.**
 */
const DEFAULT_AVATAR = '🛡️';
const AVATAR_POOL = [
    // 사람/직업 10종
    '🛡️', '🧑‍🚀', '🧑‍✈️', '🧑‍🌾', '🧑‍🎤', '🧑‍🎨', '🧑‍🔬', '🧑‍🚒', '🤠', '🥋',
    // 판타지 종족 6종
    '🥷', '🧙', '🧛', '🧟', '🧝', '🦸',
    // 크리처 8종
    '🐲', '🦖', '🐺', '🦊', '🐯', '👽', '🎃', '👑',
];

const IconGen = {
    // 그리는 해상도. pill(약 14px)~타일(약 44px) 어디에 써도 선명하도록 넉넉히 잡는다.
    SIZE: 128,
    // 2배로 그린 뒤 축소해 계단현상을 없앤다(슈퍼샘플링 배율).
    SUPERSAMPLE: 2,
    // 세로:가로가 1:1 이 아닌 아이콘의 가로 배율(캔버스 폭 = SIZE × 이 값). 없으면 정사각.
    // 상점 특가 일러스트처럼 **프레임 자체가 가로로 긴** 자리는 정사각으로 그리면 contain 이
    // 세로에 맞춰 줄여 좌우가 텅 빈다 — 프레임 종횡비와 같은 값을 여기에 적어 꽉 채운다.
    ASPECT: { shop_tech: 1.52, shop_pet: 1.52, shop_mount: 1.52, passsword: 0.553, barrier: 1.39 },
    /* 아이콘별 굽기 해상도 예외. 도트 아이콘(아바타 초상, `js/avatars.js`)은 **격자 칸수의 정수배**로
       구워야 한다 — 기본 128px 에 40칸을 넣으면 3.2px/칸이라 칸마다 3px/4px 로 널뛰고, 화면에서
       `image-rendering:pixelated` 로 40px 까지 줄일 때 그 불균일이 그대로 남아 키라인 굵기가 흔들린다.
       160 = 40×4 로 구우면 40px 표시에서 정확히 4:1 이라 칸이 전부 같은 굵기로 떨어진다.
       (아래 SIZES 는 이름 접두사로 걸어 24종을 일일이 안 적는다.) */
    SIZES: {
        avatar_: 160,
        /* 던전 배너(dg_*)는 302 css px × dpr2 = 604 장치 px 폭으로 표시되는데 기본 128(폭 442)로
           구우면 **업스케일**돼 엣지가 뭉갠다(비평가 5차 '계단현상'). 표시 폭보다 크게 굽는다. */
        dg_: 200,
    },
    _sizeOf(name) {
        for (const k in this.SIZES) if (name.indexOf(k) === 0) return this.SIZES[k];
        return this.SIZE;
    },
    /* OUTLINE — 실루엣 바깥에 순검정 키라인을 **사후에** 두르는 아이콘과 그 두께(S 대비 비율).
     *
     * 왜 사후 처리인가: 원본의 아이콘 화법은 예외 없이 '순검정 키라인 + 평면 채움'인데, 재화·보상
     * 계열 8종(망치·티켓·물약·태엽·알·깨진알·돈주머니·전투력)은 그라디언트로 입체를 낸 **테 없는**
     * 그림이라 같은 줄에 놓으면 혼자 다른 게임 아이콘처럼 보인다(코인·젬을 원본 화법으로 고친 뒤
     * 그 차이가 확 드러났다 — 10종을 한 줄에 놓고 확인). 이 8종은 형태 자체는 멀쩡하므로 **다시
     * 그리지 않고 테만 두른다** — 스티커 화법의 `ink()` 로 전부 다시 그리면 실루엣 좌표를 8번
     * 새로 잡아야 하고, 그 과정에서 이미 맞춰 둔 비율이 흔들린다.
     * ⚠️ **이미 키라인이 있는 아이콘(탭바·슬롯·무기 등)은 여기 넣지 말 것** — 테가 두 겹이 된다.
     * 값은 S 대비 **바깥으로 번지는 반지름**이다(= 보이는 띠 폭). 코인의 띠 폭 0.155/2 ≈ 0.078 과
     * 같은 급으로 잡되, 이 8종은 표시 크기가 20~24px 로 코인과 비슷해 같은 값을 쓴다. */
    OUTLINE: {
        hammer: 0.062, ticket: 0.062, potion: 0.062, winder: 0.062,
        moneybag: 0.062, power: 0.055,
        /* 🥚 egg·eggCracked 는 여기서 **뺐다** (사용자 지시 2026-08-19 `outline-halve-egg-none`:
           "펫 알 부분은 검정 아웃라인 빼기"). 이 둘은 재화·보상 화법 통일 때 테를 둘렀지만, 이후
           사용자가 알만은 테 없이 두라고 지시했다. 지시가 명시적이라 여기가 유일한 노브다 —
           CSS `--slot-out` 을 아무리 꺼도 이 표에 있으면 그림 PNG 자체에 테가 구워져 남았다
           (그래서 [x] 로 닫힌 `outline-halve-egg-none` 이 제 프로브 `probe-slot-outline` 알 타일
           1건을 계속 FAIL 시켰다 — slug `egg-outline-baked-in`). `probe-icon-keyline` 은 알을
           SKIN_NO_OUTLINE 예외로 빼 이 지시와 충돌하지 않게 했다(테를 요구하던 낡은 술어였다). */
        /* 2차 — `tools/probe-icon-keyline.js` 로 등록 아이콘 150종을 전수 검사해 색출한 것들.
           표시 28px 로 줄인 뒤 실루엣 **경계 픽셀 중 거의-검정 비율**을 재면 자물쇠·트로피·유령이
           **0%**, 선물 6.8%, 별 13.9%, 지하세계 31.4% 로 나온다(같은 계열 `age_*` 다른 아이콘은
           전부 통과하므로 지하세계만 혼자 떨어져 있었다). 눈으로도 이 여섯만 이모지풍이다.
           ⚠️ `star` 만 값이 작다 — 별은 승천 표시에서 **10px 안팎**으로도 뜨는데 다른 값과 같은
              두께를 두르면 뾰족한 끝 다섯 개가 검정에 먹혀 **덩어리**가 된다(작게 렌더해 확인). */
        lock: 0.062, trophy: 0.062, ghost: 0.062, gift: 0.062, age_underworld: 0.058, star: 0.042,
    },
    _outlineOf(name) { return this.OUTLINE[name] || 0; },
    /* 알파 실루엣을 반지름 r 만큼 사방으로 부풀린 검정 판을 깔고 그 위에 원본을 얹는다.
     * ⚠️ **한 방향씩 16번 찍는 방식이라야 한다** — `shadowBlur` 로 대신하면 테가 흐린 그을음이 되고
     *    (순검정 비율이 안 나온다), 스케일 확대로 부풀리면 **가운데가 빈 아이콘이 통째로 커져** 구멍이
     *    메워진다(반지·도넛류에서 바로 깨진다). 방향 수 16은 r 이 커져도 다각형 티가 안 나는 최소치다. */
    _outlined(big, r) {
        const sil = document.createElement('canvas');
        sil.width = big.width; sil.height = big.height;
        const sc = sil.getContext('2d');
        sc.drawImage(big, 0, 0);
        sc.globalCompositeOperation = 'source-in';
        sc.fillStyle = '#000';
        sc.fillRect(0, 0, sil.width, sil.height);
        const out = document.createElement('canvas');
        out.width = big.width; out.height = big.height;
        const oc = out.getContext('2d');
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            oc.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
        }
        oc.drawImage(big, 0, 0);
        return out;
    },

    /* ── 마인크래프트 블록 화법 (slug `ui-icon-blockify`, 사용자 지시) ────────────────────
     *
     * 사용자 원문 요구: 게임 전반 UI 아이콘을 **네모네모(마크/픽셀 블록) 느낌**으로 —
     * 굵은 각진 외곽 · 제한 팔레트 · 픽셀 블록.
     *
     * 🚨 **왜 150종을 한 종씩 다시 그리지 않고 출력 직전 한 곳에서 바꾸는가.**
     *   ⓐ `draw.*` 는 150종이 넘고, 종마다 실루엣 좌표가 원본 스크린샷 비율에 맞춰져 있다
     *      (`probe-cell-icon-size`·`probe-icon-cross-screen`·`probe-league-emblem` 이 그 비율을
     *      ±2%p 로 물고 있다). 한 종씩 다시 그리면 **그 비율을 150번 다시 맞춰야 하고**, 이 저장소가
     *      반복해 밟은 함정("벌렸더니 다른 게 어긋난다")을 150번 다시 밟는다.
     *   ⓑ 반대로 **박스 다운샘플 → 칸 스냅**은 실루엣의 무게중심·bbox 를 보존한다(칸 살아남는 기준을
     *      평균 알파 0.5 근처로 잡으면 경계가 반 칸 안쪽/바깥쪽으로만 흔들린다). 즉 **비율 계약을
     *      깨지 않고** 화법만 갈아탄다.
     *   ⓒ 새 아이콘이 나중에 추가돼도 이 한 곳을 지나므로 **화법이 저절로 통일**된다. 종별로 다시
     *      그리는 방식은 새 아이콘이 들어올 때마다 화법이 갈린다(그게 재화 8종이 혼자 다른 게임처럼
     *      보였던 `OUTLINE` 표의 사연이다).
     *
     * 파이프라인: 큰 캔버스(슈퍼샘플)로 평소대로 그린다 → **CELLS 칸 격자로 박스 다운샘플**
     * (칸마다 평균색+평균알파) → 칸 단위로 ⑴알파 문턱 ⑵제한 팔레트 스냅 ⑶칸별 명도 흔들기
     * → **최근접 확대**로 출력 해상도에 되박는다. 확대가 최근접이라 칸 경계가 각지게 남는다.
     *
     * 🚨 **굵은 각진 외곽은 새로 두르지 않는다 — 아이콘이 이미 가진 검정 키라인을 한 칸으로 굵힌다.**
     *    바깥으로 한 칸 부풀리면 실루엣이 칸 하나(=1/16 ≈ 6%)씩 커져 위 ±2%p 계약을 그 자리에서 깬다.
     *    대신 다운샘플에서 어둡게 내려앉은 경계 칸을 `KEYL` 이하에서 **순검정으로 못박아** 두께가
     *    칸에 딱 맞는 각진 테를 만든다. 테가 원래 없던 종(알 — 사용자 지시 `outline-halve-egg-none`
     *    으로 일부러 뺐다)은 여기서도 안 생긴다: **기존 종별 결정을 뒤집지 않는다.**
     *
     * ⚠️ CELLS 는 SIZE(128)의 약수여야 한다 — 128/16 = 8px/칸이라 칸이 전부 같은 굵기로 떨어진다.
     *    약수가 아니면 칸마다 7px/8px 로 널뛰어(아바타 도트가 겪은 그 문제) 격자가 흔들려 보인다. */
    BLOCK: {
        /* 세로 한 변의 블록 칸 수. 마크 아이템 텍스처는 16 이지만 **16 은 이 저장소에서 못 쓴다** —
         * 실측(2026-08-25): 코인 안의 왕관이 칸 3개짜리 검정 덩어리 셋으로 뭉쳐 **호박 얼굴**로 읽히고
         * 티켓의 별·점선이 통째로 사라져 파란 물고기가 됐다. 마크 텍스처는 애초에 16칸에 맞춰 그린
         * 그림이지만 이 150종은 매끈한 화법으로 그려 둔 그림이라, 16칸으로 다지면 **종 판독 단서가
         * 먼저 죽는다**. 20 이 '블록으로 읽히는 최소 칸'과 '왕관·별이 살아남는 최소 칸'이 만나는 점이다. */
        CELLS: 20,
        PX: 8,            // 출력 PNG 의 칸당 픽셀. 정수라야 칸이 전부 같은 굵기로 떨어진다(아바타 도트의 교훈)
        COVER: 0.46,      // 칸이 살아남는 최소 평균 알파. 0.5 근처라 bbox 가 반 칸 넘게 안 움직인다
        /* 색조 단계 수. 15°(=360/24) 각인데, **종 판독을 지키면서 팔레트를 접는 최대치**다:
         * 코인 주황 32° → 30° · 젬 진홍 345° → 345° 처럼 눈에 안 보이는 이동만 준다.
         * ⚠️ 더 거칠게(12단계=30°) 접지 말 것 — 주황이 노랑으로 넘어가 종이 뒤집힌다.
         * 이게 없으면 색이 많은 종(티켓)이 400칸에서 85색까지 벌어져 '제한 팔레트'가 말뿐이 된다. */
        HSTEP: 24,
        SSTEP: 4,         // 채도 단계 수 (제한 팔레트)
        SLIFT: 1.14,      // 채도 리프트 — 칸 평균이 채도를 깎으므로 되올린다(마크 텍스처는 쨍하다)
        /* 명도 단계 수 — 이게 '제한 팔레트'의 몸통이다.
         * 🚨 7 은 **너무 많았다**(2026-08-25 채점 라운드1, 5.5·6.8). 구·금속봉처럼 명도가 연속인 조형에서
         *    7단계는 눈에 '계단'이 아니라 **매끈한 램프**로 읽혀 두 비평가가 공통으로 같은 종을 집었다
         *    (돋보기 `research`·알 `egg`·연필 `pencil`·`age_interstellar` = "에어브러시" · "축소된 3D 렌더").
         *    마크 아이템 텍스처는 한 재질을 보통 **3톤**(밝은 면·본색·그늘)으로 끝낸다.
         * ⚠️ 더 줄이지 말 것 — 4단계에서는 물약 유리의 하이라이트와 액체가 같은 톤으로 합쳐진다. */
        LSTEP: 5,
        /* 칸별 명도 흔들기. 단계 폭(1/6)보다 작아 **단계 경계에 걸친 칸만** ±1단계로 튄다 = 마크 결.
         * ⚠️ 0.05 는 과했다 — 태엽·티켓처럼 명도 그라디언트가 넓은 종에서 소금후추 잡티가 됐다. */
        JITTER: 0.03,
        /* 흔들기를 **채도에 비례**해 준다. 무채 칸(해머 머리·태엽 쇠)은 흔들면 곧장 소금후추 잡티로
         * 읽혀 '흙 묻은 덩어리'가 된다(실측: 태엽이 회색 뭉치로 떴다) — 반면 채색 칸은 흔들어야
         * 마크 텍스처의 결이 난다. 무채는 JITTER 의 35% 만 받아 **깨끗한 명도 띠**로 남는다. */
        JITTER_GRAY: 0.35,
        /* 명도 대비 확장(**그 아이콘 자신의 평균 명도** 중심 — 0.5 고정이 아니다).
         * 🚨 0.5 고정은 **어두운 종을 통째로 더 어둡게** 민다: 평균이 0.3 인 종은 거의 모든 칸이
         *    피벗 아래라 확장이 곧 '전부 내리기'가 된다. 실측(2026-08-25) `probe-emblem-core` 에서
         *    sk_apocalypse 속살이 35.2%(블록화 이전) → **19.4%** 로 무너져 24종 중 12종이 미달이었다.
         *    자기 평균을 피벗으로 쓰면 밝은 면은 올라가고 그늘은 내려가 **톤은 갈리되 종의 전체
         *    밝기는 보존**된다. 클램프 [0.15,0.75]는 거의 흑/백 한 덩어리인 종에서 피벗이 끝으로
         *    붙어 확장이 한쪽으로만 도는 것을 막는다.
         * 칸 평균은 대비를 깎는데 마크 텍스처는 톤이 확 갈린다 — 제한 팔레트가 '뿌연 중간톤 뭉치'가
         * 아니라 '몇 개의 또렷한 톤'으로 읽히게 하는 노브다. 채점 라운드1(5.5·6.8)에서 1.12 는
         * 모자랐다 — LSTEP 을 줄인 만큼 톤 사이를 더 벌려야 '계단'이 보인다. */
        LCON: 1.2,
        /* 이 명도 이하 **경계 칸** = 키라인으로 보고 순검정으로 못박는다.
         * 🚨 0.26 은 '어두운 칸' 을 넉넉히 잡는 값이라 예전(위치를 안 보던 판)에는 속살까지 먹었다.
         *    지금은 **경계 칸에만** 걸리므로 넉넉해도 안전하다 — 오히려 낮추면(0.13 실측) 테가 얇아져
         *    `probe-icon-keyline` 이 `save`·`shop_tech`·`shop_gems4` 에서 미달로 떨어진다. */
        KEYL: 0.26,
        /* 경계가 아닌 **속 칸**의 명도 바닥. KEYL 이하로 내려앉아도 순검정으로 안 만들고 여기서 멈춘다.
         * 🚨 이게 없으면 어두운 종(권총 `age_modern`·말 `horse`)이 통째로 순검정 한 덩어리가 돼
         *    내부 음영이 0 이 된다 — 비평가 2인이 라운드1에서 공통 지목한 결함이다("벡터 실루엣으로
         *    읽힌다"·"하이라이트 칸이 하나도 없다"). 마크 아이템도 검정 재질에는 3면 음영이 있다. */
        LFLOOR: 0.25,
        /* 팔레트 상한 색 수. 칸 스냅(색조 24·채도 4·명도 5)만으로는 **조합 수가 상한이 아니다** —
         * 하늘 그라디언트가 넓은 종(던전 배너)은 스냅 뒤에도 63색까지 벌어졌다(실측 2026-08-25).
         * 그런데 그 63색 중 **상위 20색이 이미 90% 를 덮는다** = 나머지는 단계 경계에 한두 칸씩
         * 걸친 부스러기다. 그래서 **칸 수로 가중해 상위 PAL_MAX 색만 남기고 나머지는 가장 가까운
         * 색으로 흡수한다** — 마크 텍스처 작가가 고정 램프 몇 개로 그리는 것과 같은 조작이고,
         * '제한 팔레트'를 조합 상한이 아니라 **실제 색 수**로 보장한다.
         * ⚠️ INK(키라인)는 칸 수가 적어도 **항상 남긴다** — 흡수되면 테가 통째로 사라진다. */
        PAL_MAX: 24,
        /* 키라인을 **경계 칸에만** 찍을지. 제품은 항상 true — false 는 `probe-emblem-core` 계열 판정기가
         * **음성 대조**로 쓰는 스위치다(끄면 속 칸까지 순검정 = 2026-08-25 이전의 코어 잠식 화법이
         * 그대로 재현된다). 자가 검증 없는 자는 아무나 통과시키므로, 판정기는 이 스위치로
         * '고장 난 판'을 매 런 같이 구워 **그 판이 반드시 FAIL 하는지**를 확인한다. */
        /* 3×3 최빈색 평탄화의 문턱(9칸 중 몇 표). 0 이면 끈다.
         * 블라인드 비평가 4인(라운드4·5)이 공통으로 "면 분할 대신 **단일 픽셀 얼룩**으로 셰이딩을
         * 흉내 냈다"고 지적한 자리를 겨냥한다 — 그 얼룩은 두 톤이 **짝지어** 번갈아 박힌 디더라
         * `_despeckle` 의 고립 판정(4-이웃에 제 색 없음)에는 안 걸린다.
         * 라운드5 비평가 C 가 준 규칙 "최소 색면 크기 2×2 칸"이 곧 이 필터다.
         * 🚨 **문턱 실측(되돌리기 전에 읽을 것)**: **5(과반)는 거의 아무것도 안 바꾼다** — 디더 램프의
         *    3×3 은 최빈색이 보통 3~4표라 과반이 안 나온다. **4 가 실제로 무는 최저값**이고,
         *    그 아래(3)는 최빈이 곧 동률이라 방향이 임의가 된다. 4에서 `winder` 의 회색 얼룩이
         *    면으로 합쳐지고 `trophy`·`ticket` 이 옅게 정리된다.
         * 🚨 **여기서 멈춘다 — 남은 얼룩은 이 필터로 못 없앤다(실측).** `shop_gems3`·`key` 는 4에서도
         *    그대로인데, 그건 디더가 아니라 **조형**이기 때문이다(면이 아예 안 나뉜 단일 슬래브·
         *    구멍 없는 열쇠 머리). 비평가 4인이 요구한 '재질당 3톤 면 분할'은 **빛 방향을 아는 그림**이
         *    있어야 나오고, `draw.*` 가 방사/선형 그라디언트로 그린 이상 후처리 양자화로는 안 만들어진다.
         *    👉 **다음 세션은 상수를 더 돌리지 말고 `draw.*` 를 종별로 다시 그릴 것**(TODO 🎯 목록).
         * ⚠️ 밝기 비내림 조건은 `_despeckle` 과 같은 이유로 필수 — 빼면 `probe-emblem-core` 가 깨진다. */
        MODE_MAJ: 4,
        EDGE_ONLY: true,
        INK: 8,           // 그 순검정 값 (probe-icon-keyline 의 '거의 검정' 문턱 46 보다 한참 아래)
    },
    /* 블록화에서 빼는 이름(접두사로도 걸린다).
     *  · `avatar_` — 이미 40칸 도트 초상이다. 20칸으로 다시 다지면 얼굴이 뭉갠다.
     *  · `xmark`   — 🚨 **칸보다 잘게 정해진 계약이 걸려 있다.** 이 글리프의 흰 속살은 캔버스의
     *    0.505 × 0.573(= 20칸 격자에서 **10.1칸 × 11.5칸**)이고, 그 **가로:세로 = 1:1.135** 를
     *    `probe-xmark-dom` 이 원본 25장 평균 대비 ±2%p 로 물고 있다. 칸 스냅은 10.1 과 11.5 를
     *    **둘 다 10칸으로** 반올림해 그 11% 세로 초과를 통째로 지운다 — 실측 34×38 → 34×34,
     *    높이 비 −2.62%p 로 게이트를 깬다. **알파 문턱(COVER)이나 키라인 문턱(KEYL)으로는 못 고친다**
     *    (0.28~0.46 · 0.16~0.26 전 구간에서 34×34 로 같았다 — 반올림이지 문턱이 아니다).
     *    ⚠️ 그렇다고 원본 좌표(WX·WY)를 키워 보정하지 말 것 — 조형이 격자 칸수에 종속돼 `CELLS` 를
     *    건드리는 순간 조용히 깨진다.
     *    ✅ **해결됨(2026-08-25 라운드4) — `BLOCK_CELLS.xmark = 40` 으로 돌아왔다.** 위 문단이
     *    "40칸급으로 올리면 나머지 131종이 먼저 죽는다"고 적은 건 `CELLS` 를 **전역으로** 올리는
     *    경우고, 종별 override 는 그 131종을 안 건드린다. 아래 `BLOCK_CELLS` 주석 참조.
     * 🚨 `dg_`(던전 배너)는 여기서 **뺐다**(2026-08-25 라운드2). '아이콘이 아니라 302px 일러스트'라
     *    제외했는데, 블라인드 비평가 2인이 라운드1에서 **둘 다 1순위 감점**으로 지목했다 — 같은 UI 에
     *    섞여 나오는데 혼자 그라디언트 하늘을 깔고 있어 "스크린샷처럼 튄다". 칸수는 `gx = CELLS·(W/H)`
     *    로 폭에 비례해 늘어나므로 **가로로 긴 그림도 칸은 정사각**이다(302×200 → 30×20칸).
     *    ⚠️ `xmark` 와 달리 배너에는 칸보다 잘게 정해진 비율 계약이 없다(전수 판정기 대조 완료).
     *  · `egg` (= `egg` · `eggCracked`) — 🚨 **`xmark` 와 같은 사유: 칸보다 잘게 정해진 계약.**
     *    `probe-egg-shade` 가 등급 6종의 **그늘 정보**를 두 수치로 물고 있다 — ⑴ 크러시(순흑으로
     *    내려앉은 화소 비율) ⑵ 터미네이터(좌상 중앙값 − 우하 중앙값 ≥ 60). 알의 구(球)감은 **4스톱
     *    방사 그라디언트 + 그늘쪽 반사광**으로 내는데, 20칸 × 명도 5단계로 다지면 그 램프가
     *    **5단으로 접혀** 크러시가 터지고 터미네이터가 무너진다 — 실측 2026-08-25:
     *    블록화 채로 크러시 **5.0~12.5%** · 터미네이터 rare 57 · epic 49 · legendary **37**(게이트 60).
     *    제외하면 **크러시 0.0% · 6등급 전부 ok** 로 돌아온다.
     *    ⚠️ 🔀 **이건 두 지시가 실제로 부딪히는 자리다 — 다음 세션이 임의로 뒤집지 말 것.**
     *    `ui-icon-blockify`(2026-08-25, "UI 아이콘을 네모네모로")는 알도 블록으로 갈라 하고,
     *    앞선 폴리싱 라운드가 세운 `probe-egg-shade` 게이트는 **매끈한 구 셰이딩**을 요구한다.
     *    둘 다는 못 한다: 5단계로는 6등급 터미네이터가 표현이 안 되고, 단계를 늘리면 나머지
     *    150종의 '블록으로 읽히는' 성질이 죽는다. 지금은 **이미 판정기가 있는 쪽(egg-shade)을
     *    살리고** 블록화를 뺐다 — 블라인드 비평가들이 3라운드 내내 알을 "에어브러시"로 지목했으므로
     *    **사용자가 '알도 네모로'라고 정하면** 그때 `probe-egg-shade` 를 폐기하고 알을 면 분할로
     *    다시 그려야 한다(TODO 의 `ui-icon-blockify` 블록에 이 갈림길을 적어 뒀다).
     *    🔬 **음성 결과 — `xmark` 처럼 '칸만 잘게'로는 안 풀린다(2026-08-25 라운드4에서 실제로 해 봄).**
     *    알을 `BLOCK_CELLS 40` + LSTEP 9 + 키라인 끔 + 명도 바닥 0.17 로 블록화하니 `probe-egg-shade`
     *    는 **6등급 중 5등급까지 통과**했다(터미네이터 89~101, 게이트 60 — 크러시도 0.0%.
     *    남은 건 신화 #aa1cff 2.5% 뿐이고 이건 채도 높은 보라라 HSL 바닥이 루마 바닥이 아니어서다).
     *    **그런데 그림은 지적을 하나도 안 닫는다** — 확대해 보면 여전히 매끈한 구 램프 + 드롭섀도이고,
     *    바뀐 건 안티에일리어싱이 사라진 것뿐이다. 즉 상수로는 못 푼다: 비평가가 요구하는 건
     *    '칸 경계'가 아니라 **면 분할**이고, 그건 `draw.egg` 를 다시 그려야 나온다.
     *    👉 다음 세션은 이 실험을 되풀이하지 말 것. 갈림길은 그대로 사용자 결정 대기다. */
    BLOCK_SKIP: ['avatar_', 'egg'],
    /* 🚨 **격자만 더 잘게 주면 되는 종** — 제외(BLOCK_SKIP)와 다르다. 제외는 화법을 통째로 빼서
     *    그 종만 시트에서 '에어브러시 이탈자'로 튀는데(블라인드 비평가 라운드4 A 가 `xmark` 를
     *    최악 5종에 올렸다: "모서리가 둥글게 말린 벡터 X … 계단이 단 한 칸도 안 나온다"),
     *    **계약이 요구하는 건 화법을 빼는 게 아니라 칸을 잘게 하는 것**이었다.
     *  · `xmark` 20칸 → **40칸**: 흰 속살이 캔버스의 0.505 × 0.573 이고 그 세로 초과 11% 를
     *    `probe-xmark-dom` 이 ±2%p 로 문다. 20칸에서는 10.1 과 11.5 가 **둘 다 10칸으로** 반올림돼
     *    그 11% 가 통째로 지워졌다(34×38 → 34×34). 40칸이면 20.2 → 20칸 · 22.9 → 23칸이라
     *    비가 1:1.15 로 남는다(계약 1:1.135 대비 폭 −0.5%p · 높이 +0.2%p = 여유 충분).
     *    ⚠️ 앞 세션 주석이 "격자를 40칸급으로 올리면 나머지 131종의 블록감이 죽는다"고 적은 건
     *       `CELLS` 를 **전역으로** 올리는 경우다 — 종별 override 는 그 131종을 안 건드린다. */
    BLOCK_CELLS: { xmark: 40 },
    _blockCells(name) {
        for (const k in this.BLOCK_CELLS) if (name.indexOf(k) === 0) return this.BLOCK_CELLS[k];
        return 0;
    },
    _blockSkip(name) {
        for (const p of this.BLOCK_SKIP) if (name.indexOf(p) === 0) return true;
        return false;
    },
    _rgb2hsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
        if (!d) return [0, 0, l];
        const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        let h;
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return [h / 6, s, l];
    },
    _hsl2rgb(h, s, l) {
        if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const ch = (t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)];
    },
    /* 고립 칸 흡수(디스페클) — 4-이웃 중 **제 색과 같은 칸이 하나도 없는** 칸을 이웃 최빈색으로 덮는다.
     * 왜: 다운샘플 + 단계 스냅은 그라디언트가 넓은 종에서 단계 경계에 한 칸씩 걸친 칸을 흩뿌린다.
     *     마크 텍스처에는 그런 게 없다 — 한 칸짜리 색은 **의도된 점**(눈·리벳)이거나 아예 없다.
     *     실측(2026-08-25 채점 라운드4): `dg_zombie` 가 흰 하늘 위에 보라 단색 칸이 무작위로 흩뿌려져
     *     "디더링이 아니라 그냥 노이즈"로 읽혔고, `dg_invasion` 은 갈색 20여 톤이 진흙처럼 섞였다.
     * 🚨 **경계 칸(실루엣 테)은 절대 안 건드린다** — 두 계약이 거기에 걸려 있다:
     *    ⑴ `probe-cell-icon-size` 의 잉크 긴변(지금 정확히 76.0%, 허용 ±2%p) = 실루엣 bbox.
     *    ⑵ `probe-icon-keyline` 의 테 두께. 알파는 아예 안 만지므로 bbox 는 원리적으로 불변이고,
     *    경계를 제외하면 테 색도 불변이다. 즉 이 패스는 **속살의 잡티만** 지운다.
     * ⚠️ 이웃이 전부 서로 달라 최빈색이 1표씩이면(진짜 그라디언트 속) 덮지 않는다 — 최빈색이
     *    2표 이상일 때만 흡수한다. 안 그러면 넓은 램프를 한 방향으로 밀어 형태가 흐른다. */
    _despeckle(d, alive, gx, gy, B) {
        const key = (c) => (d[c * 4] << 16) | (d[c * 4 + 1] << 8) | d[c * 4 + 2];
        const src = new Int32Array(alive.length);
        for (let c = 0; c < alive.length; c++) src[c] = alive[c] ? key(c) : -1;
        for (let y = 1; y < gy - 1; y++) for (let x = 1; x < gx - 1; x++) {
            const c = y * gx + x;
            if (!alive[c]) continue;
            const nb = [c - 1, c + 1, c - gx, c + gx];
            if (nb.some((n) => !alive[n])) continue;          // 경계 칸 = 테 — 손대지 않는다
            if (B.MODE_MAJ) {
                /* 3×3 최빈색이 **뚜렷한 다수**(MODE_MAJ 표 이상)면 그 색으로 편다 = 디더 램프를 면으로.
                 * 고립 칸(4-이웃에 제 색 없음)만 보던 것보다 세다 — 비평가가 "면 분할 대신 무작위 톤
                 * 점묘"라고 부른 건 두 톤이 **짝지어** 번갈아 박힌 자리라 고립 판정에 안 걸린다. */
                const t9 = new Map();
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const n = c + dy * gx + dx;
                    if (alive[n]) t9.set(src[n], (t9.get(src[n]) || 0) + 1);
                }
                let mb = -1, mn2 = 0;
                for (const [k, v] of t9) if (v > mn2) { mn2 = v; mb = k; }
                if (mn2 >= B.MODE_MAJ && mb !== src[c]) {
                    const lm = (v) => 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
                    if (lm(mb) >= lm(src[c])) {               // 어둡게 만드는 평탄화는 금지(코어 보존)
                        const i2 = c * 4;
                        d[i2] = (mb >> 16) & 255; d[i2 + 1] = (mb >> 8) & 255; d[i2 + 2] = mb & 255;
                        continue;
                    }
                }
            }
            if (nb.some((n) => src[n] === src[c])) continue;  // 같은 색 이웃이 있으면 고립이 아니다
            const tally = new Map();
            for (const n of nb) tally.set(src[n], (tally.get(src[n]) || 0) + 1);
            let best = -1, bn = 0;
            for (const [k, v] of tally) if (v > bn) { bn = v; best = k; }
            if (bn < 2) continue;                              // 진짜 그라디언트 속 — 밀지 않는다
            /* 🚨 **어둡게 만드는 흡수는 하지 않는다.** 처음엔 방향을 안 보고 흡수했더니
             *    `probe-emblem-core`(38px 표시에서 루마 ≥ 50 인 '속살' 비율 ≥ 34%)가
             *    **미달 1종 → 3종**으로 벌어졌다(sk_powerStrike 29.5 · sk_voidLance 33.8 ·
             *    sk_apocalypse 30.4). 이유는 분명하다 — 어두운 몸통에 박힌 **한 칸짜리 하이라이트**가
             *    바로 이 판정의 '고립 칸'이라, 방향을 안 보면 잡티를 지우면서 **의도된 스페큘러까지**
             *    같이 지운다. 지우려는 건 `dg_zombie` 의 흰 하늘 위 보라 점 같은 **어두운 잡티**이고,
             *    그건 전부 '이웃보다 어두운 고립 칸'이다. 밝기를 안 내리는 흡수만 남기면
             *    잡티는 그대로 잡히고 코어는 손대지 않는다(실측: 미달 3종 → 1종 = 선재 잔여만 남음). */
            const lum = (v) => 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
            if (lum(best) < lum(src[c])) continue;
            const i = c * 4;
            d[i] = (best >> 16) & 255; d[i + 1] = (best >> 8) & 255; d[i + 2] = best & 255;
        }
    },
    /* 칸 색 히스토그램에서 상위 `PAL_MAX` 색만 남기고 나머지를 가장 가까운 색(RGB 거리)으로 흡수한다.
     * 칸 수가 최대 1,380(가장 넓은 배너)이라 O(칸×팔레트)=3만 회 — 굽기 한 번에 한 번만 돈다. */
    _foldPalette(d, alive, B) {
        const cnt = new Map();
        for (let c = 0; c < alive.length; c++) {
            if (!alive[c]) continue;
            const i = c * 4, k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            cnt.set(k, (cnt.get(k) || 0) + 1);
        }
        if (cnt.size <= B.PAL_MAX) return;
        const inkKey = (B.INK << 16) | (B.INK << 8) | B.INK;
        const rank = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
        const keep = rank.slice(0, B.PAL_MAX);
        if (cnt.has(inkKey) && keep.indexOf(inkKey) < 0) keep[keep.length - 1] = inkKey;
        const kv = keep.map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
        const map = new Map();                     // 흡수 결과 캐시 — 같은 색은 한 번만 계산한다
        for (const k of keep) map.set(k, k);
        for (let c = 0; c < alive.length; c++) {
            if (!alive[c]) continue;
            const i = c * 4, k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
            let to = map.get(k);
            if (to === undefined) {
                let best = 0, bd = Infinity;
                for (let j = 0; j < kv.length; j++) {
                    const dr = d[i] - kv[j][0], dg = d[i + 1] - kv[j][1], db = d[i + 2] - kv[j][2];
                    const dist = dr * dr + dg * dg + db * db;
                    if (dist < bd) { bd = dist; best = j; }
                }
                to = keep[best];
                map.set(k, to);
            }
            d[i] = (to >> 16) & 255; d[i + 1] = (to >> 8) & 255; d[i + 2] = to & 255;
        }
    },
    /* 큰 캔버스 → 블록화된 출력 캔버스(W×H). 색조(H)는 절대 안 건드린다 —
     * 코인 주황·젬 진홍처럼 **종을 알아보는 단서가 색조**라, 색조까지 양자화하면 종이 뒤집힌다
     * (탈것 candy 재배정이 폐기된 것과 같은 사유). 제한 팔레트는 S·L 단계로만 낸다. */
    _blockify(src, W, H, cells) {
        const B = this.BLOCK;
        const gy = cells || B.CELLS, gx = Math.max(1, Math.round(gy * (W / H)));
        const sm = document.createElement('canvas');
        sm.width = gx; sm.height = gy;
        const sc = sm.getContext('2d');
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'high';
        sc.drawImage(src, 0, 0, gx, gy);           // 박스 다운샘플 = 칸마다 평균색·평균알파
        const im = sc.getImageData(0, 0, gx, gy), d = im.data;
        /* ① 알파 문턱을 **먼저 전부** 판정해 생존 마스크를 만든다. ②의 키라인 판정이 이웃 칸의
         *    생존 여부를 봐야 하기 때문이다(한 번에 훑으면 아직 안 지나간 칸의 알파가 원본값이라
         *    경계 판정이 훑는 방향으로 치우친다). */
        const alive = new Uint8Array(gx * gy);
        for (let c = 0; c < gx * gy; c++) {
            if (d[c * 4 + 3] / 255 < B.COVER) d[c * 4 + 3] = 0;
            else { d[c * 4 + 3] = 255; alive[c] = 1; }   // 반투명 없음 = 각진 칸 경계
        }
        /* 실루엣 **경계 칸**인가 = 4-이웃 중 하나라도 죽었거나(투명) 격자 밖인가.
         * 🚨 이 판정이 키라인의 전부다. 예전엔 위치를 안 보고 `l ≤ KEYL` 인 칸을 전부 순검정으로
         *    못박았는데, 그러면 **어두운 재질의 속살까지** 검정이 돼 종이 통째로 실루엣 한 덩어리가
         *    된다(라운드1 공통 지목). 테는 테로, 속은 어두운 톤으로 남겨야 마크 아이템처럼 읽힌다. */
        const edge = (x, y) => (
            x === 0 || y === 0 || x === gx - 1 || y === gy - 1 ||
            !alive[y * gx + x - 1] || !alive[y * gx + x + 1] ||
            !alive[(y - 1) * gx + x] || !alive[(y + 1) * gx + x]
        );
        // 대비 확장의 피벗 = 살아 있는 칸의 평균 명도(위 BLOCK.LCON 주석 참조)
        let lsum = 0, ln = 0;
        for (let c = 0; c < alive.length; c++) {
            if (!alive[c]) continue;
            lsum += this._rgb2hsl(d[c * 4], d[c * 4 + 1], d[c * 4 + 2])[2]; ln++;
        }
        const piv = ln ? Math.min(0.75, Math.max(0.15, lsum / ln)) : 0.5;
        for (let y = 0; y < gy; y++) for (let x = 0; x < gx; x++) {
            if (!alive[y * gx + x]) continue;
            const i = (y * gx + x) * 4;
            let [h, s, l] = this._rgb2hsl(d[i], d[i + 1], d[i + 2]);
            // 칸별 결정적 흔들기(같은 아이콘은 항상 같은 결) — 단계 경계 근처 칸만 ±1단계로 튄다
            const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const amp = B.JITTER * (B.JITTER_GRAY + (1 - B.JITTER_GRAY) * Math.min(1, s));
            l = piv + (l - piv) * B.LCON + ((n - Math.floor(n)) - 0.5) * 2 * amp;
            s = Math.min(1, Math.round(Math.min(1, s * B.SLIFT) * B.SSTEP) / B.SSTEP);
            l = Math.min(1, Math.max(0, Math.round(l * (B.LSTEP - 1)) / (B.LSTEP - 1)));
            if (l <= B.KEYL) {
                if (!B.EDGE_ONLY || edge(x, y)) { d[i] = d[i + 1] = d[i + 2] = B.INK; continue; }
                l = B.LFLOOR;                      // 속 칸은 검정이 아니라 '가장 어두운 톤'
            }
            const rgb = this._hsl2rgb(Math.round(h * B.HSTEP) / B.HSTEP, s, l);
            d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
        }
        this._foldPalette(d, alive, B);
        this._despeckle(d, alive, gx, gy, B);
        sc.putImageData(im, 0, 0);
        /* 출력 해상도는 **칸수 × PX** 로 새로 잡는다 — 원래 굽기 크기(S)를 쓰면 S 가 칸수의 배수가
         * 아닐 때(예: 128/20 = 6.4) 칸마다 6px/7px 로 널뛴다. CSS 는 `background-size:contain` 이라
         * PNG 픽셀 크기가 바뀌어도 표시 크기는 그대로고, 종횡비만 지키면 된다. */
        const cv = document.createElement('canvas');
        cv.width = gx * B.PX; cv.height = gy * B.PX;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = false;         // 최근접 확대라야 칸이 각지게 선다
        ctx.drawImage(sm, 0, 0, cv.width, cv.height);
        return cv;
    },
    cache: {},
    _classes: {},
    _styleEl: null,

    // ---- 공개 API ----
    url(name, opt) {
        const key = name + (opt && opt.tint ? '|' + opt.tint : '');
        if (this.cache[key]) return this.cache[key];
        const fn = this.draw[name];
        if (!fn) return (this.cache[key] = '');
        // 2배 크기로 그린 뒤 축소(슈퍼샘플링) — 톱니·사선 엣지의 계단현상을 없앤다.
        const S = this._sizeOf(name), SS = this.SUPERSAMPLE, AR = this.ASPECT[name] || 1;
        const big = document.createElement('canvas');
        big.height = S * SS;
        big.width = Math.round(S * SS * AR);
        const bctx = big.getContext('2d');
        bctx.lineJoin = 'round';
        bctx.lineCap = 'round';
        try { fn.call(this, bctx, S * SS, opt || {}); } catch (e) { console.warn('[IconGen] draw fail', name, e); }
        const ow = this._outlineOf(name);
        const src = ow ? this._outlined(big, ow * S * SS) : big;
        const W = Math.round(S * AR);
        // 블록화(`ui-icon-blockify`)가 축소까지 함께 한다 — 칸 평균이 곧 슈퍼샘플이라 별도 축소 불필요.
        if (!this._blockSkip(name)) return (this.cache[key] = this._blockify(src, W, S, this._blockCells(name)).toDataURL('image/png'));
        const cv = document.createElement('canvas');
        cv.height = S;
        cv.width = W;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, cv.width, cv.height);
        return (this.cache[key] = cv.toDataURL('image/png'));
    },

    // 아이콘 dataURL 을 담은 CSS 클래스를 (최초 1회) 만들어 클래스명을 돌려준다.
    cls(name, opt) {
        const key = name + (opt && opt.tint ? '|' + opt.tint : '');
        if (this._classes[key] !== undefined) return this._classes[key];
        const u = this.url(name, opt);
        if (!u) return (this._classes[key] = '');
        const c = 'ico-' + name + (opt && opt.tint ? '-' + opt.tint.replace(/[^a-z0-9]/gi, '') : '');
        if (!this._styleEl) {
            this._styleEl = document.createElement('style');
            this._styleEl.id = 'icongen-css';
            (document.head || document.documentElement).appendChild(this._styleEl);
        }
        this._styleEl.appendChild(document.createTextNode(`.${c}{background-image:url("${u}")}\n`));
        return (this._classes[key] = c);
    },

    // 인라인 아이콘 HTML. 크기는 CSS(.ico)가 프레임 기준으로 잡는다 — 프레임을 꽉 채우도록.
    img(name, cls, opt) {
        const c = this.cls(name, opt);
        if (!c) return '';
        return `<i class="ico ${c}${cls ? ' ' + cls : ''}"></i>`;
    },

    // ---- 그리기 헬퍼 ----
    _lin(ctx, x0, y0, x1, y1, stops) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (const s of stops) g.addColorStop(s[0], s[1]);
        return g;
    },
    _rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
        const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        for (const s of stops) g.addColorStop(s[0], s[1]);
        return g;
    },
    // 현재 경로를 다각형으로 채우기 (정규화 좌표 배열 → 픽셀)
    _poly(ctx, pts, S) {
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = p[0] * S, y = p[1] * S;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
    },
    // 라운드 사각형을 **서브패스로만** 추가한다(beginPath 안 함) — 여러 도형을 한 경로로 합치거나
    // _innerShadow 의 pathFn 규약("서브패스만 추가")을 지켜야 할 때 쓴다.
    _rrSub(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },
    _rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },
    // 내부 그림자: 도형으로 클립한 뒤 "도형 바깥 영역"을 그림자와 함께 채운다.
    // 채움 자체는 클립 밖이라 보이지 않고, 안쪽으로 번진 그림자만 남는다.
    // (pathFn 은 beginPath 를 호출하지 않고 서브패스만 추가하는 규약)
    _innerShadow(ctx, pathFn, color, blur, dx, dy) {
        const S = ctx.canvas.width, m = blur * 4 + Math.abs(dx) + Math.abs(dy) + 8;
        ctx.save();
        ctx.beginPath();
        pathFn();
        ctx.clip();
        ctx.beginPath();
        ctx.rect(-m, -m, S + m * 2, S + m * 2);
        pathFn();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = dx;
        ctx.shadowOffsetY = dy;
        ctx.fillStyle = '#000';
        ctx.fill('evenodd');
        ctx.restore();
    },
    // 아이콘 판(그림자→그라디언트 본체→테두리→안쪽 그림자→스펙큘러)을 한 번에 그리는 공용 헬퍼.
    // ⚠️ 예전에는 이 함수가 아이콘 블록 두 곳에 **복사본**으로 있었고, 도넛 구멍 버그(evenodd) 수정이
    //    한쪽에만 들어가 **정작 도넛을 그리는 쪽(slot_ring·slot_belt)은 안 고쳐진 채로 남았다**
    //    — 반지가 구멍 없는 금 원판으로 나왔다(중심 알파 255 로 실측). 복사본을 두지 말 것.
    // opt.eo=true 면 구멍 뚫린 경로(도넛)로 취급한다: 접지 그림자·본체를 evenodd 로 채우고,
    // 안쪽 그림자는 건너뛴다(`_innerShadow` 가 clip 을 nonzero 로 걸어 구멍을 검게 메우기 때문).
    _plate(ctx, S, path, stops, opt) {
        const G = IconGen;
        const o = opt || {};
        ctx.save();                                   // ① 접지 그림자
        ctx.globalAlpha = 0.36; ctx.fillStyle = '#000';
        ctx.filter = `blur(${S * 0.020}px)`;
        ctx.translate(0, S * 0.035);
        // ⚠️ 구멍 뚫린 경로(반지 밴드·벨트 버클)는 **그림자도 같은 규칙으로 칠해야** 한다 —
        //    안 그러면 구멍 뒤에 검은 원판이 남아 '까만 구멍'처럼 보인다(실측으로 확인).
        ctx.beginPath(); path(); ctx.fill(o.eo ? 'evenodd' : 'nonzero');
        ctx.restore();
        ctx.save();                                   // ② 본체 + ⑤ 테두리
        ctx.beginPath(); path();
        const g = ctx.createLinearGradient(0, S * (o.y0 === undefined ? 0.04 : o.y0), 0, S * (o.y1 === undefined ? 0.98 : o.y1));
        stops.forEach(s => g.addColorStop(s[0], s[1]));
        ctx.fillStyle = g; ctx.fill(o.eo ? 'evenodd' : 'nonzero');
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.strokeStyle = o.line || 'rgba(16,14,11,.88)';
        ctx.lineWidth = S * (o.lw === undefined ? 0.048 : o.lw);
        ctx.stroke();
        ctx.restore();
        // ⚠️ `_innerShadow` 는 `clip()` 을 **nonzero 로** 걸어서 도넛의 구멍까지 클립 안에 넣는다 —
        //    구멍이 검게 메워진다(반지 밴드에서 실측). 구멍 뚫린 경로(`eo`)는 안쪽 그림자를 건너뛴다.
        if (!o.flat && !o.eo) G._innerShadow(ctx, path, o.inner || 'rgba(0,0,0,.40)', S * 0.05, 0, S * 0.022);
        if (o.spec !== false) {                       // ④ 스펙큘러
            ctx.save(); ctx.beginPath(); path(); ctx.clip();
            const sx = (o.sx === undefined ? 0.33 : o.sx) * S, sy = (o.sy === undefined ? 0.24 : o.sy) * S;
            ctx.fillStyle = G._rad(ctx, sx, sy, 0, sx, sy, S * 0.36,
                [[0, 'rgba(255,255,255,.52)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(0, 0, S * 2, S * 2);
            ctx.restore();
        }
    },
    // 결정론적 의사난수 (아이콘이 매번 같게 나오도록)
    _rng(seed) {
        let s = seed >>> 0 || 1;
        return () => {
            s ^= s << 13; s >>>= 0;
            s ^= s >> 17;
            s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        };
    },
    // 등수 왕관(리그 보상 1·2위) — 뿔 3개 + 각 뿔 끝 구슬 + 받침띠. 팔레트만 갈아 두 등수를 낸다.
    // ⚠️ 숫자는 여기서 그리지 않는다 — 원본도 배지 위에 흰 글자를 얹는 구조라, 등수마다 아이콘을
    //    새로 굽지 않고 DOM 글자로 덮는 편이 캐시(아이콘당 20~36KB)에도 유리하다.
    _crownRank(ctx, S, pal) {
        const G = this, cx = S * 0.5;
        const L = S * 0.13, R = S * 0.87;            // 좌우 끝
        const peakY = S * 0.30, midPeakY = S * 0.25; // 바깥 뿔 / 가운데 뿔 꼭짓점
        const valleyY = S * 0.52, baseTop = S * 0.66, baseBot = S * 0.80;
        const body = () => {
            ctx.moveTo(L, peakY);
            ctx.lineTo(cx - S * 0.155, valleyY);
            ctx.lineTo(cx, midPeakY);
            ctx.lineTo(cx + S * 0.155, valleyY);
            ctx.lineTo(R, peakY);
            ctx.lineTo(R - S * 0.02, baseTop);
            ctx.lineTo(L + S * 0.02, baseTop);
            ctx.closePath();
        };
        const base = () => G._rrSub(ctx, L - S * 0.01, baseTop, (R - L) + S * 0.02, baseBot - baseTop, S * 0.03);
        // 받침띠 먼저(몸통 아래로 깔린다)
        ctx.beginPath(); base();
        ctx.fillStyle = G._lin(ctx, 0, baseTop, 0, baseBot, pal.base);
        ctx.fill();
        ctx.beginPath(); body();
        ctx.fillStyle = G._lin(ctx, 0, peakY, 0, baseTop, pal.body);
        ctx.fill();
        G._innerShadow(ctx, body, 'rgba(40,20,0,.45)', S * 0.045, 0, -S * 0.02);
        // 뿔 끝 구슬 — 몸통 위에 얹되 테는 마지막에 한 번에 두른다
        const balls = [[L, peakY - S * 0.055], [cx, midPeakY - S * 0.06], [R, peakY - S * 0.055]];
        const ballR = S * 0.085;
        for (const [bx, by] of balls) {
            ctx.beginPath(); ctx.arc(bx, by, ballR, 0, Math.PI * 2);
            ctx.fillStyle = pal.ball; ctx.fill();
            ctx.lineWidth = S * 0.062; ctx.strokeStyle = '#17181a'; ctx.stroke();
        }
        ctx.lineWidth = S * 0.062; ctx.strokeStyle = '#17181a';
        ctx.beginPath(); base(); ctx.stroke();
        ctx.beginPath(); body(); ctx.stroke();
    },
    // 시대 아이콘용 — 굵은 검정 테를 먼저 깔고 색면을 덮는 '실루엣 먼저' 렌더.
    // 시대 막대는 바탕색이 10가지라 테가 없으면 밝은 막대(노랑·청록)에서 형태가 사라진다.
    _ageStroke(ctx, S, pts, w, stops) {
        const line = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)));
        };
        line(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = (w + 0.055) * S; ctx.strokeStyle = '#17181a'; ctx.stroke();
        line();
        ctx.lineWidth = w * S;
        ctx.strokeStyle = this._lin(ctx, pts[0][0] * S, pts[0][1] * S, pts[pts.length - 1][0] * S, pts[pts.length - 1][1] * S, stops);
        ctx.stroke();
    },
    _agePoly(ctx, S, pts, stops) {
        const path = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)));
            ctx.closePath();
        };
        path();
        ctx.fillStyle = this._lin(ctx, 0, 0, 0, S, stops);
        ctx.fill();
        ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.lineJoin = 'round'; ctx.stroke();
    },
    // #rrggbb 를 밝기 조정
    _shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
        return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    },
    /* `_shade` 로 어둡게 하되 **명도 바닥(floorL)** 을 두고, 모자란 만큼을 찬 하늘빛으로 채운다.
       🚨 왜 필요한가 (2026-08-19 `ui-quality-up` 16차, `tools/probe-egg-shade.js` 실측):
          `_shade` 는 채널별 곱셈이라 **같은 amt 라도 색상마다 명도가 다르게 무너진다** — 명도의
          72%를 G 채널이 지고 있어서, G 가 작은 색(빨강 #ff1c1c·보라 #aa1cff 는 G=28)만 그늘이
          순흑으로 내려앉는다. 실제로 알 6색 중 그 둘만 크러시 5.4·5.5%(나머지는 0.0~0.1%)였고,
          비평가 2인이 각각 "터미네이터가 없다 / 그늘 쪽 반사광이 없다" 로 잡은 게 이 자리였다.
          **순흑은 다크 엔드가 아니라 정보의 소실이다**(POLISH.md 3D 스트림이 잎에서 남긴 교훈).
       채우는 빛을 흰색이 아니라 (0.30,0.42,0.72) 하늘빛으로 쓰는 이유: 회색으로 들어올리면
       채도가 빠져 '먼지 낀 면'이 되지만, 찬 빛은 **햇빛을 등진 면에 하늘이 비친다**는 읽기가 된다. */
    /* 파스텔 색을 **블록 아이콘 팔레트**(굵고 진하고 밝은 제한 팔레트)로 옮긴다 — 색상(hue)은 그대로,
       채도와 밝기만 끌어올린다. (2026-08-20 UI 스트림, 락 `icon-gen`)
       왜: 확정 화풍 ㉰ 가 `IconGen` 을 "굵고 각지고 **제한 팔레트** 블록 아이콘"으로 못 박는데,
       스킬 색 `SKILL_DEFS[].color` 는 머티리얼 200~300 톤이라 **18색 평균 HSV 채도가 46.9%**,
       최악은 `연속 참격 #cfd8dc`(**5.9%**)·`회오리 베기 #b0bec5`(**10.7%**)로 사실상 무채색이다.
       채움 화법을 아무리 고쳐도(㉢) 원재료가 회색이면 색이 안 나온다 — 실제로 `probe-skill-orb-ink`
       의 잉크 채도는 원본 53.5% 대비 32.9% 에서 더 못 올라갔고, 남은 격차의 정체가 이것이었다.
       🚨 **`SKILL_DEFS` 를 고치지 않는 이유**: 그 색은 `combat.js` 의 스킬 FX 가 같이 쓴다(3D 스트림
          도메인). 여기서 파생색을 만들면 **아이콘만** 바뀌고 전투 연출은 그대로다.
       기준점은 재화 아이콘이다 — 원본 실측 코인이 `rgb(255,136,15)`(채도 **94%** · 밝기 255)이니
       이 게임의 팔레트는 원래 밝고 진하다. 파스텔이 예외였다.
       ⚠️ 채도를 상수로 몰지 말 것(`s*0.75 + 0.34`) — 전부 상한에 붙이면 18색의 **서로 다름**이
          뭉개져 스킬 구분이 색에서 사라진다. 원 순서를 유지한 채 대역만 올린다. */
    _block(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (!mx) return hex;
        let h = 0;
        if (d) {
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        const s2 = Math.min(0.90, (d / mx) * 0.75 + 0.34);
        const v2 = Math.max(mx, 232) / 255;
        const c = v2 * s2, xx = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v2 - c;
        let rr, gg, bb;
        if (h < 60) { rr = c; gg = xx; bb = 0; }
        else if (h < 120) { rr = xx; gg = c; bb = 0; }
        else if (h < 180) { rr = 0; gg = c; bb = xx; }
        else if (h < 240) { rr = 0; gg = xx; bb = c; }
        else if (h < 300) { rr = xx; gg = 0; bb = c; }
        else { rr = c; gg = 0; bb = xx; }
        const f = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return '#' + f(rr) + f(gg) + f(bb);
    },
    _shadeFloor(hex, amt, floorL) {
        const n = parseInt(hex.slice(1), 16);
        const f = (v) => Math.max(0, Math.min(255, amt > 0 ? v + (255 - v) * amt : v * (1 + amt)));
        let r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (L < floorL) {
            const SKY = [0.30, 0.42, 0.72];
            const perK = 255 * (0.2126 * SKY[0] + 0.7152 * SKY[1] + 0.0722 * SKY[2]);
            const k = Math.min(1, (floorL - L) / perK);
            r = Math.min(255, r + k * SKY[0] * 255);
            g = Math.min(255, g + k * SKY[1] * 255);
            b = Math.min(255, b + k * SKY[2] * 255);
        }
        return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    },

    draw: {
        /* ---- 코인: 주황 원판 + 금빛 왕관 (원본 상단바 실측 2026-08-19) ----
           🚨 **종전 그림은 '사실적인 금화'였다 — 원본과 화풍이 다르다.** 원본 상단바(shot-042120)
           재화 pill 을 14배로 떠서 재면 코인은 **평평한 주황 원판 `rgb(255,136,15)` + 굵은 순검정
           키라인 + 그 안의 금빛 왕관 `rgb(255,180,69)`** 이 전부다. 그라디언트도, 세레이션(밀링)
           톱니도, 광택 스펙큘러도 **없다.** 종전 구현은 방사 그라디언트 4겹 + 톱니 26개 + 음각
           내부 그림자 + 엠보싱 왕관 + 스펙큘러 2겹이었는데, **표시 크기가 26px 라 그게 전부 뭉개져**
           '테 없는 노란 원'으로만 보였다(원본-클론 나란히 캡처로 확인 — 왕관이 아예 안 보였다).
           ⚠️ **키라인이 탭바보다 두꺼운 건 의도다**: 원본 실측으로 키라인/지름 = 2px/26px ≈ 7.7%
           라, 탭바 아이콘(53px 에 2px ≈ 3.8%)의 두 배다. 작게 쓰는 아이콘일수록 테를 두껍게
           잡아야 배경에서 떨어진다 — 여기서 탭바 값을 그대로 쓰면 테가 1px 로 사라진다. */
        coin(ctx, S) {
            const { ink, on, circle, poly } = IconGen._sticker;
            const ORANGE = '#ff880f', ORANGE_DK = '#d96b05', GOLD = '#ffb445', GOLD_DK = '#b9822e';
            // 키라인 폭은 원본 비(검정 띠 2px / 원판 지름 26px = 7.7%)에서 역산했다:
            // 스트로크는 경로 중심에 걸려 **바깥 절반만** 남으므로 lw/2 가 곧 띠 폭이다 →
            // (lw/2)/(2r+lw) = 0.077 을 r=0.415 로 풀면 lw ≈ 0.155(바깥 지름 0.985 = 프레임 꽉 참).
            ink(ctx, S, circle(ctx, S, 0.5, 0.5, 0.415), ORANGE, 0.155);
            ctx.save(); ctx.beginPath(); circle(ctx, S, 0.5, 0.5, 0.415)(); ctx.clip();
            on(ctx, circle(ctx, S, 0.5, 1.02, 0.415), ORANGE_DK);       // 아래 그림자(2톤 규약)
            ctx.restore();
            // 왕관 — 원본 실측 폭 0.437·높이 0.344, 원판 중심에서 살짝 위(-0.015).
            // 바깥 첨두 2개 + 가운데 첨두 1개 + 아래 띠. 이 실루엣이 코인의 정체라 색보다 먼저 읽힌다.
            const cw = 0.437, ch = 0.344, bx = 0.5 - cw / 2, by = 0.485 - ch / 2;
            const crown = poly(ctx, S, [
                [bx, by + ch * 0.28], [bx + cw * 0.22, by + ch * 0.72], [bx + cw * 0.5, by],
                [bx + cw * 0.78, by + ch * 0.72], [bx + cw, by + ch * 0.28],
                [bx + cw * 0.92, by + ch], [bx + cw * 0.08, by + ch],
            ]);
            ink(ctx, S, crown, GOLD, 0.105);   // 왕관 테도 같은 비로 — 0.072 는 24px 표시에서 0.9px 라 사라진다
            ctx.save(); ctx.beginPath(); crown(); ctx.clip();
            on(ctx, poly(ctx, S, [[bx, by + ch * 0.74], [bx + cw, by + ch * 0.74], [bx + cw, by + ch], [bx, by + ch]]), GOLD_DK);  // 띠 그늘
            ctx.restore();
        },

        /* ---- 젬: 마름모 두 겹 (원본 상단바 실측 2026-08-19) ----
           🚨 원본의 젬은 **컷 보석이 아니라 마름모**다: 진홍 마름모 `rgb(239,32,77)` + 순검정
           키라인 + 그 안에 **연분홍 마름모 `rgb(255,157,186)`** 한 겹, 끝. 종전 구현은 파빌리온·
           크라운 파셋 8면 + 거들 라인 + 굴절 스트릭 + 반짝임 2개짜리 '진짜 보석'이었는데,
           26px 에서는 파셋이 전부 뭉개져 **테 없는 빨간 얼룩**이 됐다(코인과 같은 병).
           `o.tint` 는 계속 받는다 — 색만 갈아 끼우면 등급색 젬으로 그대로 쓸 수 있다. */
        gem(ctx, S, o) {
            const G = IconGen;
            const { ink, poly } = G._sticker;
            const base = (o && o.tint) || '#ef204d';
            const rhomb = (rx, ry) => poly(ctx, S, [[0.5, 0.5 - ry], [0.5 + rx, 0.5], [0.5, 0.5 + ry], [0.5 - rx, 0.5]]);
            ink(ctx, S, rhomb(0.400, 0.410), base, 0.150);
            // 안쪽 면은 tint 에서 파생시킨다(고정 분홍을 쓰면 파란 젬 안에 분홍 심이 남는다).
            // 원본 실측 비: 안쪽 마름모가 바깥의 0.42 배, 색은 바깥을 밝게 민 값(239,32,77 → 255,157,186).
            ink(ctx, S, rhomb(0.168, 0.172), G._shade(base, 0.52), 0.110);
        },

        // ---- 해머: 단조 금속 헤드 + 나무 자루 ----
        hammer(ctx, S) {
            const G = IconGen;
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(-0.26);   // 기울기를 완화 — 급하면 14px에서 대각 막대로 무너진다
            ctx.translate(-S / 2, -S / 2);

            // 자루 (나무)
            const hw = S * 0.115, hx = S * 0.5 - hw / 2;
            G._rr(ctx, hx, S * 0.30, hw, S * 0.62, hw * 0.42);
            ctx.fillStyle = G._lin(ctx, hx, 0, hx + hw, 0,
                [[0, '#8a5a2b'], [0.32, '#c08c4e'], [0.62, '#9a6634'], [1, '#5c3818']]);
            ctx.fill();
            // 나뭇결
            ctx.save();
            G._rr(ctx, hx, S * 0.30, hw, S * 0.62, hw * 0.42);
            ctx.clip();
            ctx.strokeStyle = 'rgba(70,40,14,.35)';
            ctx.lineWidth = S * 0.008;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(hx + hw * (0.28 + i * 0.22), S * 0.33);
                ctx.quadraticCurveTo(hx + hw * (0.2 + i * 0.26), S * 0.6, hx + hw * (0.3 + i * 0.2), S * 0.9);
                ctx.stroke();
            }
            ctx.restore();
            // 손잡이 밴드
            ctx.fillStyle = '#3f2a12';
            ctx.fillRect(hx, S * 0.80, hw, S * 0.035);
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.fillRect(hx, S * 0.80, hw, S * 0.010);

            // 헤드 — 대장간 해머 실루엣: [펜 쐐기] + [몸통] + [눈(자루 통과) 칼라] + [플레어 타격면]
            // 짧고 두툼한 블록(길이:높이 ≈ 1.7:1) — 길게 테이퍼진 쐐기는 '총알'로 읽힌다.
            const by = S * 0.135, bh = S * 0.325, y0 = by, y1 = by + bh;
            const px = S * 0.20, x0 = S * 0.315, x1 = S * 0.775, fx = S * 0.855;
            const head = () => {
                ctx.moveTo(px, y0 + bh * 0.16);          // 펜(뒤쪽) — 살짝만 좁힌다
                ctx.lineTo(x0, y0);
                ctx.lineTo(x1, y0);
                ctx.lineTo(x1, y0 - bh * 0.07);          // 타격면 플레어
                ctx.lineTo(fx, y0 - bh * 0.07);
                ctx.lineTo(fx, y1 + bh * 0.07);
                ctx.lineTo(x1, y1 + bh * 0.07);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x0, y1);
                ctx.lineTo(px, y1 - bh * 0.16);
                ctx.closePath();
            };
            ctx.beginPath();
            head();
            ctx.fillStyle = G._lin(ctx, 0, y0 - bh * 0.08, 0, y1 + bh * 0.08,
                [[0, '#f3f7fb'], [0.16, '#d5dee6'], [0.34, '#9fadba'], [0.62, '#75838f'], [0.86, '#4d5862'], [1, '#333c45']]);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            head();
            ctx.clip();
            // 단조 강철 면 분할 — 윗면(밝음) / 앞면 / 아래 베벨(어두움)
            ctx.fillStyle = 'rgba(255,255,255,.42)';
            ctx.fillRect(0, y0, S, bh * 0.16);
            ctx.fillStyle = 'rgba(255,255,255,.62)';
            ctx.fillRect(0, y0 + bh * 0.22, S, bh * 0.09);
            ctx.fillStyle = 'rgba(10,16,22,.30)';
            ctx.fillRect(0, y1 - bh * 0.16, S, bh * 0.16);
            // 눈(자루가 통과하는 부위)의 융기 칼라
            const ex = S * 0.50, ew = S * 0.115;
            ctx.fillStyle = 'rgba(255,255,255,.20)';
            ctx.fillRect(ex - ew / 2, y0, ew, bh);
            ctx.fillStyle = 'rgba(12,18,24,.35)';
            ctx.fillRect(ex + ew / 2, y0, S * 0.014, bh);
            ctx.fillStyle = 'rgba(12,18,24,.28)';
            ctx.fillRect(ex - ew / 2 - S * 0.014, y0, S * 0.014, bh);
            // 타격면 경계 — 어두운 이음새가 넓으면 헤드가 부러져 보이므로 얇은 음영 한 줄만
            ctx.fillStyle = 'rgba(12,18,24,.22)';
            ctx.fillRect(x1 - S * 0.008, y0, S * 0.008, bh);
            ctx.fillStyle = 'rgba(255,255,255,.28)';
            ctx.fillRect(x1, y0 - bh * 0.07, S * 0.014, bh * 1.14);
            // 금속 스펙큘러 핫스팟 (플라스틱처럼 보이지 않게)
            ctx.fillStyle = G._rad(ctx, x0 + (x1 - x0) * 0.38, y0 + bh * 0.26, 0,
                x0 + (x1 - x0) * 0.38, y0 + bh * 0.26, bh * 0.42,
                [[0, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(x0, y0, x1 - x0, bh);
            ctx.restore();

            ctx.beginPath();
            head();
            ctx.lineWidth = S * 0.024;
            ctx.strokeStyle = 'rgba(18,24,30,.82)';
            ctx.stroke();
            ctx.restore();
        },

        // ---- 알: 등급색 알 (반점 + 광택) ----
        egg(ctx, S, o) {
            const G = IconGen;
            const base = o.tint || '#e8d9b8';
            // 알 윤곽: 위쪽이 길고 좁은(테이퍼) / 아래쪽이 짧고 둥근 타원 조합을 샘플링
            const cx = S * 0.5, cy = S * 0.560, w = S * 0.305;
            /* 🔧 **세로를 0.83S → 0.70S 로 줄였다 — 가로세로비를 원본에 맞춘 것 (2026-08-20, `egg-spur-widened-tile`).**
               뿔을 거둬 가로가 원본과 같아지자 **세로만 남아 알이 물방울처럼 뾰족해 보였다.** 원본 알은
               40×46px = **1.15**, 우리는 0.61S×0.83S = **1.36** 이었다. 가로(=`2w`)는 잉크폭 게이트가
               잡고 있으므로 **세로를 0.61S×1.15 = 0.70S 로 맞춘다**(hTop·hBot 을 같은 배율 0.843 로).
               ⚠️ 뿔 좌표는 `hTop` 배수라 같이 줄어들고, 세로 비율 `t = hTop·(1−v)/(hTop+hBot)` 은
               분자·분모가 같이 줄어 **0.549·(1−v) 로 그대로다** — 뿔이 붙는 높이는 안 바뀐다.
               `cy` 는 실루엣 세로 중심이 0.525S 에 그대로 있게 0.565 → 0.560 으로 미세 보정했다. */
            const hTop = S * 0.384, hBot = S * 0.316, bot = cy + hBot;
            /* 🔧 **어깨 테이퍼 0.24 → 0.30 — 원본 실루엣에 맞춘 미세 보정 (2026-08-20, `egg-spur-widened-tile`).**
               🚨 **여기서 한 번 크게 틀렸다. 다시 밟지 말라고 남긴다** — 처음엔 "뿔 끝을 `1.00w` 로
               거둬들이면 어깨(`rx = 0.91w`)와 겨우 `0.09w` 차이라 귀로 안 읽힌다"고 보고 테이퍼를
               **0.83 까지 깎았다.** 그런데 `rx` 는 **실루엣 폭이 아니라 그 높이의 가로 반지름**이다.
               실제 실루엣은 `x = sin(θ)·rx` 이고 `v = cos(θ)` 이므로 **`√(1−v²)·rx`** 다. 뿔 끝
               높이(v=0.62)에서 옛 테이퍼로도 몸통은 `0.785 × 0.908 = 0.713w` 라, 뿔은 처음부터
               **0.287w(반폭의 29%)** 나 튀어나와 있었다 — 원본의 뿔 돌출(0.31w, 아래)과 거의 같다.
               **0.83 은 멀쩡한 어깨를 깎아 알을 물방울로 만든 자해였다**(t=0.05 반폭이 원본 0.300 ↔
               클론 0.163 으로 벌어졌다. 눈으로도 뾰족한 고깔이었다).
               값은 그래서 **원본에서 역산**한다 — `√(1−v²)·(1−k·v²) = 원본 반폭` 을 뿔이 없는 쪽에서:
               t=0.05(v=0.909) → k 0.34 · t=0.10(v=0.818) → k 0.26 · t=0.15(v=0.727) → k 0.44.
               ⚠️ **t≥0.25 는 k 가 음수로 나온다** — 원본 몸통은 타원이 아니라 **옆이 곧은 초타원**이라
               그 대역이 타원보다 넓다(`probe-egg-form` 의 평탄도 원본 0.876 ↔ 클론 0.703 이 그 차이다).
               타원 식으로는 그 대역을 못 맞추므로 위 셋만 써서 **k ≈ 0.30** 으로 잡았다. 초타원 전환은
               이 항목(폭 회귀) 밖이라 안 건드린다.
               ⚠️ **최대폭은 이 값과 무관하다** — `up = max(0, cs)` 라 아랫절반은 `rx = w` 고정이고
               가장 넓은 자리는 v=0(`sin=1`)이다. 즉 테이퍼는 `알 잉크폭` 게이트를 **안 건드린다**
               (폭은 뿔 끝점이 정한다). 둘을 따로 만질 수 있는 게 이 조합의 요점이다. */
            const TAPER = 0.30;
            // 🚫 **좌우 뿔(로브)을 '파라메트릭 rx 에 봉우리를 더해' 얹으려다 되돌린 기록 — 그 길로 가지 말 것.**
            //    (뿔 자체는 2026-08-20 에 **별도 서브패스**로 해결했다 — 아래 `spur()` 주석 참조.)
            //    사실관계는 맞다: 원본(shot-042356)의 알은 매끈한 달걀이 아니라 **좌우로 뿔이 뻗은
            //    몬스터 알**이고, `tools/probe-egg-form.js` 의 로브 돌출도(최대폭/허리폭)가 원본 1.068
            //    ↔ 우리 1.010 으로 그 차이를 잡아낸다. 그런데 **이 파라메트릭 경로에 가우시안 봉우리를
            //    더하는 방식으로는 뿔이 안 나온다**: `rx` 만 밀고 세로 반지름(`hTop`)은 그대로라, 봉우리가
            //    솟는 대신 어깨에 **평평한 모따기(shelf)** 가 생겨 '뿔 달린 알'이 아니라 **찌그러진 알**로
            //    읽힌다(LOBE_AT 0.36 · σ 0.13 · 진폭 0.085 로 구워 128px 확대 확인 — 보라 알이 특히 험했다).
            //    원본의 뿔이 뿔로 읽히는 건 **굵은 검정 키라인이 그 끝을 뾰족하게 잡아 주기** 때문인데,
            //    그 키라인은 사용자 지시 `outline-halve-egg-none`("펫 알 부분은 검정 아웃라인 빼기")로
            //    우리가 **일부러 뺀** 것이다. 즉 뿔을 제대로 하려면 경로를 별도 서브패스(뾰족한 스퍼)로
            //    그리는 재설계가 필요하고, 키라인 없이도 뿔로 읽히게 만드는 문제를 먼저 풀어야 한다.
            /* ✅ **좌우 뿔(스퍼)을 별도 서브패스로 얹었다 (2026-08-20 UI 스트림, 락 `icon-gen`).**
               위 🚫 주석이 "제대로 하려면 뾰족한 스퍼를 별도 서브패스로 그려야 한다"고 남긴 자리다.
               ⓐ **왜 서브패스인가** — 파라메트릭 `rx` 를 밀면 세로 반지름이 안 따라와 어깨에 평평한
                  모따기가 생긴다(위 실패 기록). 뿔은 **몸통과 다른 축**으로 뻗어야 뿔로 읽힌다.
               ⓑ **뿔은 몸통 안쪽에서 시작해 밖으로 나갔다가 다시 몸통 안으로 돌아온다** — 시작·끝
                  두 점이 몸통 실루엣 **안**이라 nonzero 합집합에서 이음매가 안 생긴다. 알은 키라인이
                  없으므로(사용자 지시 `outline-halve-egg-none`) 이음매가 생기면 그대로 흉터가 된다.
               ⓒ **끝을 뾰족하게** — 원본에서 뿔이 뿔로 읽히는 건 굵은 검정 테가 끝을 잡아 주기
                  때문인데 우리는 그 테가 없다. 대신 **바깥 등은 볼록, 아랫변은 오목**으로 잡아
                  실루엣만으로 끝이 모이게 했다. */
            const spur = (dir) => {
                const sx = (v) => cx + dir * v * w;      // 몸통 반폭(w) 배수
                const sy = (v) => cy - hTop * v;         // 몸통 위 반지름 배수(+가 위)
                /* ⚠️ **감기 방향을 몸통과 맞춘다 — nonzero 에서 반대로 감으면 겹친 부분이 뚫린다.**
                   몸통 루프는 위 → 오른쪽 → 아래(시계)다. 뿔을 ①→끝→② 순으로 그으면 **오른쪽은
                   시계인데 왼쪽은 거울이라 반시계**가 되고, 그 순간 왼쪽 뿔의 몸통 겹침 부분이
                   감김수 0 이 돼 **흰 삼각 구멍**으로 뚫린다(128px 확대로 확인). 그래서 왼쪽은
                   점 순서를 뒤집어 긋는다. */
                /* ⚠️ **되돌아오는 변은 직선 현이 아니라 '몸통 옆선을 따라가는 곡선'이어야 한다.**
                   이 알에는 `path()` 를 통째로 긋는 얇은 껍질선(아래 `lineWidth S*0.012`)이 있어서,
                   현을 몸통 **안쪽**으로 그으면 그 선이 뿔 안에 **검은 V 흉터**로 그대로 보인다
                   (첫 판이 그랬다 — 128px 확대로 확인). 붙는 두 점을 몸통 옆선 위에 두고 되돌아오는
                   곡선을 옆선에 겹치게 태우면, 그 획이 몸통 자신의 껍질선과 겹쳐 안 보인다.
                   ⚠️ **감기 방향도 몸통과 맞춘다** — nonzero 라 반대로 감으면 겹친 부분이 감김수 0 이
                      돼 뚫린다. 오른쪽은 시계인데 왼쪽은 거울이라 반시계가 되므로 뒤집어 긋는다. */
                /* 🔧 **뿔을 몸통 최대폭 안으로 거둬들이고 어깨로 올렸다 (2026-08-20 UI 스트림, slug `egg-spur-widened-tile`).**
                   앞 판은 끝점이 `1.40w` 라 **몸통 최대폭보다 40% 밖으로** 나갔고, 그만큼 타일 잉크가
                   넓어져 `probe-pets-dom` 의 `알 잉크폭` 이 원본 7.96%W ↔ 클론 10.62%W(Δ+2.66%p)로
                   빨개졌다. 원본 실측이 그 상한을 정해 준다 — **원본의 뿔 끝은 몸통 최대폭을 안 넘는다**:
                   행별 프로파일(shot-042356, 알 40×46px)에서 뿔 끝이 ±19.5px(t=0.20~0.31)인데 몸통
                   최대폭도 ±19.5~20px(t=0.76~0.80, 아래 배)라 **둘이 같은 자리에서 멈춘다.**
                   그래서 끝점을 `1.00w`(= 몸통 최대 반폭)로 못박았다 — 뿔을 더 밖으로 빼면 그 순간
                   타일 폭이 다시 원본을 넘는다.
                   자리도 올렸다: 원본 뿔은 **어깨(t 0.11~0.33)** 에 붙은 귀지 허리에 달린 지느러미가
                   아니다. `v`(몸통 위 반지름 배수) 로 환산하면 t = 0.548·(1−v) 이므로 t 0.11~0.33 =
                   **v 0.80~0.40**. 앞 판은 v 0.58~−0.16(t 0.23~0.63)이라 **허리에서 배까지** 걸쳐 있었다. */
                const fwd = dir > 0;
                const A = [0.42, 0.80], C1 = [0.80, 0.82], B = [1.00, 0.62], C2 = [0.82, 0.52], E = [0.80, 0.44], C3 = [0.79, 0.62];
                const s0 = fwd ? A : E, s1 = fwd ? C1 : C2, s2 = fwd ? C2 : C1, e0 = fwd ? E : A;
                ctx.moveTo(sx(s0[0]), sy(s0[1]));                               // 붙는 자리(몸통 옆선 위)
                ctx.quadraticCurveTo(sx(s1[0]), sy(s1[1]), sx(B[0]), sy(B[1])); // 바깥으로 뻗은 등(볼록)
                ctx.quadraticCurveTo(sx(s2[0]), sy(s2[1]), sx(e0[0]), sy(e0[1]));// 끝 → 몸통으로(오목)
                ctx.quadraticCurveTo(sx(C3[0]), sy(C3[1]), sx(s0[0]), sy(s0[1]));// 몸통 옆선을 따라 복귀
                ctx.closePath();
                //   ⚠️ **되돌아오는 변을 곡선으로 그리지 말 것** — 처음 판은 네 번째 곡선이 두 번째
                //      곡선을 가로질러 **감김수가 0 인 구멍**이 생겼고, 키라인이 없는 알에서 그게
                //      뿔 안쪽의 **흰 초승달 흉터**로 그대로 보였다(128px 확대로 확인). 직선 현은
                //      몸통 안에 있어 아무것도 안 그린다.
            };
            const path = () => {
                ctx.beginPath();
                for (let i = 0; i <= 96; i++) {
                    const t = (i / 96) * Math.PI * 2;
                    const cs = Math.cos(t), up = Math.max(0, cs);
                    const rx = w * (1 - TAPER * up * up);         // 위로 갈수록 좁아짐
                    const ry = cs > 0 ? hTop : hBot;
                    const x = cx + Math.sin(t) * rx, y = cy - cs * ry;
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.closePath();
                spur(1); spur(-1);
            };
            // 접지 그림자
            ctx.save();
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.beginPath();
            ctx.ellipse(cx, bot - S * 0.01, w * 0.78, S * 0.045, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            path();
            // 15차(ui-quality-up · 비평가 R7 A[6]·B[6] 교집합): 종전 3스톱은 그늘 쪽이 -0.5 에서
            // 멈춰 **터미네이터가 없는 '납작한 원반'**으로 읽혔다(둘 다 "flat radial with one blob").
            // 스톱을 넷으로 늘려 밝은 쪽은 더 밝게, 그늘 쪽은 더 깊게 — 명도 폭이 곧 구(球)의 단서다.
            // 16차(비평가 R8 A[D2]·B[2] 교집합): 15차의 4스톱은 **밝은 알에서만** 통했다.
            // `probe-egg-shade` 로 6색을 재니 빨강·보라만 크러시 5.4·5.5%(나머지 0.0~0.1%) —
            // 어두운 두 스톱이 `_shade` 의 채널 곱셈 때문에 순흑으로 내려앉아 **그늘 반쪽이 통째로
            // 검정 키라인에 흡수**되고 있었다(그 키라인 색도 마침 `_shade(base,-0.72)` 로 **같은 값**
            // 이라 선과 면이 구별되지 않았다). 어두운 두 스톱만 명도 바닥이 있는 `_shadeFloor` 로
            // 바꾼다 — 밝은 색 알은 바닥에 안 걸려 값이 그대로다(회귀 없음).
            ctx.fillStyle = G._rad(ctx, cx - w * 0.42, S * 0.30, S * 0.02, cx, S * 0.55, S * 0.56,
                [[0, G._shade(base, 0.62)], [0.38, base],
                 [0.78, G._shadeFloor(base, -0.42, 52)], [1, G._shadeFloor(base, -0.72, 34)]]);
            ctx.fill();
            /* 뿔은 몸통과 **다른 면**이라 빛을 다르게 받는다 — 광원이 좌상단이므로 왼쪽 뿔은 밝고
               오른쪽 뿔은 어둡다. 몸통용 방사 그라디언트를 그대로 태우면 둘 다 가장자리라 **똑같이
               어두워지고**, 그러면 `probe-egg-shade` 의 터미네이터(좌상 중앙값 − 우하 중앙값)가
               왼쪽 뿔 몫만큼 깎여 빨강·보라에서 게이트(60)를 깬다 — 실측 69 → **55**.
               면마다 평평한 값을 주면 수치도 살고(터미네이터 회복) 조형도 '두 장의 지느러미'로 읽힌다. */
            ctx.beginPath(); spur(-1); ctx.fillStyle = G._shade(base, 0.34); ctx.fill();
            ctx.beginPath(); spur(1); ctx.fillStyle = G._shadeFloor(base, -0.34, 46); ctx.fill();

            ctx.save();
            path();
            ctx.clip();
            // 그늘 쪽 반사광(rim/bounce) — 두 비평가가 각각 "no rim light on the shade side"·"crescent
            // rim on the lower-right" 로 같은 것을 요구했다. 광원이 좌상단이므로 우하단 가장자리에만
            // 초승달로 얹는다. 껍질 색에서 파생시켜(흰색이 아니라) 등급색 알에서도 색이 안 튄다.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = G._rad(ctx, cx + w * 0.72, cy + hBot * 0.62, S * 0.01,
                                        cx + w * 0.52, cy + hBot * 0.48, w * 0.95,
                [[0, G._shade(base, 0.30)], [0.55, G._shade(base, -0.55)], [1, 'rgba(0,0,0,0)']]);
            ctx.globalAlpha = 0.55;
            ctx.fillRect(0, 0, S, S);
            ctx.restore();
            // 반점
            const rnd = G._rng(20260817);
            const glX = cx - w * 0.40, glY = S * 0.31;   // 광택 위치 — 반점이 겹치면 구멍처럼 보인다
            ctx.fillStyle = G._shade(base, -0.42);
            // 중앙에 몰리면 14px 축소 시 반점 쌍이 '눈'으로 읽힌다 → 바깥 링에만, 개수도 줄여 배치
            for (let i = 0; i < 11; i++) {
                const a = rnd() * Math.PI * 2, rr = (0.52 + rnd() * 0.44) * w * 0.92;
                const x = cx + Math.cos(a) * rr, y = S * 0.58 + Math.sin(a) * rr * 1.3;
                // 광택 위/정수리 근처의 고립된 반점은 '구멍'처럼 보이므로 제외
                if (Math.hypot((x - glX) / (w * 0.46), (y - glY) / (S * 0.20)) < 1) continue;
                if (y < S * 0.36) continue;
                ctx.save();
                ctx.globalAlpha = 0.14 + rnd() * 0.2;
                ctx.beginPath();
                ctx.ellipse(x, y, S * (0.018 + rnd() * 0.026), S * (0.014 + rnd() * 0.02), rnd() * 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            // 아래쪽 바운스 라이트
            ctx.fillStyle = G._lin(ctx, 0, S * 0.66, 0, bot,
                [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.16)']]);
            ctx.fillRect(0, S * 0.66, S, S * 0.34);
            // 밑동 앰비언트 오클루전 — 껍질이 바닥에 닿는 쪽을 눌러 준다.
            // 근거: 비평가 2인이 **각각** "알이 세트 중 밝은 프레임 대비 최약"을 짚었고(A는 '검정
            // 컨투어를 달라', B는 '껍질 하부에 어두운 앰비언트 오클루전을 달라'), `probe-egg-form.js`
            // 의 ⑵ 밑동 암도도 원본 0.263 ↔ 종전 우리 0.771 로 같은 곳을 가리켰다.
            // 🚩 **A 의 처방(검정 컨투어)은 안 받는다** — 사용자 지시 `outline-halve-egg-none`
            //    ("펫 알 부분은 검정 아웃라인 빼기")을 정면으로 되돌리고 `probe-slot-outline` 알
            //    타일이 즉시 뒤집힌다. 같은 증상에 대한 B 의 처방(껍질 **안쪽** 음영)만 받는다 —
            //    이건 테가 아니라 명암이라 그 지시와 충돌하지 않는다.
            // 색은 방향성 그늘과 같은 (18,24,42) 알파 합성이다. `_shade` 채널 곱셈을 쓰면 빨강·보라
            // 알만 순흑으로 주저앉는 그 병(16차 메모)이 여기서도 그대로 재발한다.
            ctx.fillStyle = G._lin(ctx, 0, S * 0.70, 0, bot,
                [[0, 'rgba(18,24,42,0)'], [0.55, 'rgba(18,24,42,.20)'], [1, 'rgba(18,24,42,.46)']]);
            ctx.fillRect(0, S * 0.70, S, bot - S * 0.70);
            // ---- 방향성 그늘(터미네이터) ----
            // 🚨 16차에 신설한 `probe-egg-shade` 의 **터미네이터 지표**(좌상 사분면 중앙값 − 우하
            //    사분면 중앙값)로 재 보니 알 6색이 −3 ~ 46 이었다: 흰 알·노란 알은 사실상 **0**,
            //    즉 두 비평가가 말한 '납작한 도장'은 은유가 아니라 **실측값**이었다. 방사 그라디언트
            //    하나로는 못 만든다 — 방사는 가장자리를 고르게 어둡게 하는 **비네트**라 방향이 없다.
            //    광원 축(좌상 → 우하)을 따라 **찬 그늘을 얹는 층**을 따로 둔다.
            // 🚨 곱셈(multiply)이 아니라 `source-atop` 반투명 합성인 이유: 곱셈은 채널 배수라
            //    `_shade` 와 같은 색상 의존 붕괴를 도로 불러온다(빨강·보라만 다시 순흑으로 간다).
            //    알파 합성은 도착점이 (18,24,42)로 **묶여** 있어 어떤 색조에서도 바닥이 보장된다.
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = G._lin(ctx, cx - w * 0.55, S * 0.28, cx + w * 0.85, S * 0.95,
                [[0, 'rgba(18,24,42,0)'], [0.30, 'rgba(18,24,42,0)'],
                 [0.58, 'rgba(18,24,42,.26)'], [0.82, 'rgba(18,24,42,.50)'],
                 [1, 'rgba(18,24,42,.62)']]);
            ctx.fillRect(0, 0, S, S);
            ctx.restore();
            // 광택
            ctx.beginPath();
            ctx.ellipse(cx - w * 0.40, S * 0.31, w * 0.30, S * 0.135, -0.42, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, cx - w * 0.40, S * 0.31, 0, cx - w * 0.40, S * 0.31, w * 0.34,
                [[0, 'rgba(255,255,255,.92)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx - w * 0.30, S * 0.265, w * 0.115, S * 0.045, -0.4, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, cx - w * 0.30, S * 0.265, 0, cx - w * 0.30, S * 0.265, w * 0.13,
                [[0, 'rgba(255,255,255,.95)'], [0.55, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fill();
            ctx.restore();

            // 실루엣 림. **얇게** 긋는다 — 이 선의 이력이 중요하다:
            // 🚨 원래 이게 알의 유일한 테였는데, 한때 `OUTLINE.egg = 0.062`(사후 순검정 바깥 띠)가
            //    겹쳐 검정 띠가 0.078·S 까지 두꺼워지며 그늘 반쪽을 파먹었다(`tools/probe-egg-shade.js`
            //    로 위치 확인). 그래서 두께를 0.032 → 0.012 로 줄였었다.
            // 🚩 지금은 **`OUTLINE.egg` 자체를 뺐다**(사용자 지시 `outline-halve-egg-none`: "펫 알 부분은
            //    검정 아웃라인 빼기"). 그러니 이제 바깥 순검정 띠는 없고 **이 림이 다시 알의 유일한
            //    윤곽**이다 — 밝은 배경(펫 타일)에서 실루엣이 배경에 녹지 않게 하는 것이 이 줄의 일이다.
            //    ⚠️ 두께를 다시 키우거나 색을 순검정으로 되돌리지 말 것 — 그러면 사용자가 빼라고 한
            //    '검정 아웃라인'이 이 줄로 부활한다(`probe-slot-outline` 알 타일이 즉시 FAIL). 색은
            //    `_shadeFloor`(순흑 아님)라 '검정 테'가 아니라 몸통 그늘 림으로 읽힌다.
            path();
            ctx.lineWidth = S * 0.012;
            ctx.strokeStyle = G._shadeFloor(base, -0.72, 30);
            ctx.stroke();

            // ---- 균열(깨진 알) ----
            // 게임에 '알'이 둘이라(부화하는 진짜 알 S.eggs / 펫 소환 화폐 S.eggCurrency) 같은 아이콘을
            // 쓰면 헷갈린다 → 화폐만 이 균열을 얹어 한눈에 갈리게 한다(사용자 지시 2026-08-18).
            // 껍질 밖으로 새지 않게 알 path로 클립한 뒤 그린다.
            if (!o.cracked) return;
            ctx.save();
            path();
            ctx.clip();
            // 가로 지그재그 + 위/아래로 뻗는 곁가지. 알 폭(w) 파생이라 크기가 바뀌어도 비율이 유지된다.
            const zig = (y0, amp, steps) => {
                ctx.beginPath();
                for (let i = 0; i <= steps; i++) {
                    const x = cx - w * 1.1 + (w * 2.2) * (i / steps);
                    i ? ctx.lineTo(x, y0 + (i % 2 ? amp : -amp)) : ctx.moveTo(x, y0 + amp);
                }
            };
            const branch = (x0, y0, dx, dy) => {
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x0 + dx * 0.45, y0 + dy * 0.55);
                ctx.lineTo(x0 + dx, y0 + dy);
            };
            const yMid = cy + hBot * 0.10;
            // 균열 바로 아래에 밝은 선을 깔아 '갈라진 틈'의 두께감을 준다(그림자만 있으면 낙서로 보인다)
            ctx.save();
            ctx.lineWidth = S * 0.030;
            ctx.strokeStyle = G._shade(base, 0.5);
            ctx.translate(0, S * 0.016);
            zig(yMid, S * 0.028, 7); ctx.stroke();
            branch(cx + w * 0.30, yMid + S * 0.012, w * 0.34, -S * 0.20); ctx.stroke();
            branch(cx - w * 0.44, yMid - S * 0.014, -w * 0.20, S * 0.17); ctx.stroke();
            ctx.restore();
            ctx.lineWidth = S * 0.036;
            ctx.strokeStyle = G._shade(base, -0.74);
            zig(yMid, S * 0.028, 7); ctx.stroke();
            branch(cx + w * 0.30, yMid + S * 0.012, w * 0.34, -S * 0.20); ctx.stroke();
            branch(cx - w * 0.44, yMid - S * 0.014, -w * 0.20, S * 0.17); ctx.stroke();
            ctx.restore();
        },

        // ---- 깨진 알: 펫 소환 화폐 전용 (진짜 알 S.eggs 와 구분) ----
        eggCracked(ctx, S, o) {
            IconGen.draw.egg.call(this, ctx, S, Object.assign({}, o, { cracked: true }));
        },

        // ---- 티켓: 소환권 (노치 + 절취선 + 별) ----
        ticket(ctx, S) {
            const G = IconGen;
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(-0.14);
            ctx.translate(-S / 2, -S / 2);
            /* 노치는 **크게**. `dungeon-row-quality` 잔여 결함 ⓔ: 26px 프레임(던전 배너 보상 슬롯)에서
               종전 nr = S*0.075 는 라운드 모서리에 묻혀 실루엣이 그냥 둥근 사각형이었고, 아이콘이
               '카드/봉투'로 읽혔다. 티켓을 티켓으로 만드는 건 **허리가 잘록한 실루엣** 하나뿐이라
               위아래 반원을 키워 몸통 높이의 절반씩 베어 낸다(잔여 허리 ≈ 0.25h). */
            const x = S * 0.08, y = S * 0.25, w = S * 0.84, h = S * 0.50, r = S * 0.06;
            const nr = S * 0.125, nx = x + w * 0.36;

            // 티켓 본체 = 라운드 사각형 − 위아래 노치
            const path = () => {
                G._rr(ctx, x, y, w, h, r);
                ctx.moveTo(nx + nr, y);
                ctx.arc(nx, y, nr, 0, Math.PI, false);
                ctx.moveTo(nx + nr, y + h);
                ctx.arc(nx, y + h, nr, Math.PI, 0, false);
            };
            // 그림자도 노치가 뚫린 같은 경로로 그린다.
            // (사각형으로 깔면 노치 구멍 사이로 그림자가 비쳐 '검은 반원 얼룩'이 된다)
            ctx.save();
            ctx.globalAlpha = 0.20;                                       /* .35 는 노치 구멍이 검은 반달로 읽혔다 */
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            path();
            ctx.fill('evenodd');
            ctx.restore();

            path();
            // 원본(shot-042228) 티켓은 금색이 아니라 **파랑**이다 — 도전 버튼 안 실측 #4018ff·#2e16ad.
            // 금색 팔레트를 파랑 계열로 바꿨다(구조·별·노치는 그대로).
            /* 소형(18~26px) 판독 보정: 종전 그라디언트는 아래 절반(#4018ff→#200c96)이 키라인과
               섞여 검은 덩어리가 됐다(비평가 '티켓 판독 모호') — 중간톤을 끌어올려 파랑이 남게 한다. */
            ctx.fillStyle = G._lin(ctx, 0, y, 0, y + h,
                [[0, '#cfd6ff'], [0.30, '#7583ff'], [0.66, '#4b32f2'], [1, '#2c18b8']]);
            ctx.fill('evenodd');

            ctx.save();
            path();
            ctx.clip('evenodd');
            // 상단 하이라이트 / 하단 턱
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.fillRect(x, y, w, h * 0.10);
            ctx.fillStyle = 'rgba(10,6,80,.4)';
            ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
            // 스텁(왼쪽 조각)을 한 단 어둡게 — 절취선 하나로는 두 조각이 안 갈린다
            ctx.fillStyle = 'rgba(12,6,80,.34)';
            ctx.fillRect(x, y, nx - x, h);
            // 절취선 — 파랑 위 어두운 점선은 26px 에서 사라진다. 밝은 점선으로 뒤집고 굵힌다.
            ctx.setLineDash([S * 0.040, S * 0.032]);
            ctx.lineWidth = S * 0.026;
            ctx.strokeStyle = 'rgba(232,236,255,.88)';
            ctx.beginPath();
            ctx.moveTo(nx, y + nr * 1.2);
            ctx.lineTo(nx, y + h - nr * 1.2);
            ctx.stroke();
            ctx.setLineDash([]);
            // 오른쪽 본권의 문자 라인 (정보 표기 느낌)
            ctx.fillStyle = 'rgba(18,10,110,.32)';
            ctx.fillRect(x + w * 0.46, y + h * 0.30, w * 0.42, h * 0.09);
            ctx.fillRect(x + w * 0.46, y + h * 0.50, w * 0.30, h * 0.09);
            ctx.restore();

            // 왼쪽 스텁의 별
            // 별은 작게 — 종전 크기는 노치보다 눈에 먼저 들어와 '별 붙은 카드'로 읽히게 했다
            const sx = x + w * 0.18, sy = y + h * 0.5, sr = S * 0.082;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                const rr = i % 2 ? sr * 0.46 : sr;
                const px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr;
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = G._lin(ctx, 0, sy - sr, 0, sy + sr, [[0, '#ffffff'], [1, '#cdd4ff']]);
            ctx.fill();
            ctx.lineWidth = S * 0.014;
            ctx.strokeStyle = 'rgba(18,10,110,.55)';
            ctx.stroke();

            path();
            // 바깥 키라인 — 노치 곡선이 배경과 갈리려면 선이 필요하지만, 0.032 는 소형에서
            // 채움까지 삼켜 검은 캡슐이 됐다(실측 18~26px 렌더) — 0.022 로 줄인다.
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(10,6,54,.90)';
            ctx.stroke();
            ctx.restore();
        },

        // ---- 물약: 유리 플라스크 + 액체 + 코르크 ----
        potion(ctx, S, o) {
            const G = IconGen;
            const liq = o.tint || '#25d0c0';
            const cx = S * 0.5, bcy = S * 0.645, br = S * 0.30;
            const nw = S * 0.20, nTop = S * 0.185, nBot = S * 0.335;

            ctx.save();
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.beginPath();
            ctx.ellipse(cx, bcy + br * 0.98, br * 0.72, S * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 유리 몸통(구) + 목 — 정확히 좌우 대칭으로 구성한다.
            // 접점 각 th 로 구의 접선 위치를 잡고, 목 벽에서 그 접점까지 오목한 어깨로 잇는다.
            const th = 0.42;                                  // 목이 구에 붙는 각(라디안)
            const sX = br * Math.sin(th), sY = bcy - br * Math.cos(th);   // 어깨 접점
            const glass = () => {
                ctx.beginPath();
                ctx.moveTo(cx - nw / 2, nTop);
                ctx.lineTo(cx - nw / 2, nBot);
                ctx.quadraticCurveTo(cx - nw / 2, sY, cx - sX, sY);       // 좌 어깨
                // 좌 접점 → 아래를 크게 돌아 → 우 접점 (anticlockwise 로 바닥을 지난다)
                ctx.arc(cx, bcy, br, Math.PI * 1.5 - th, Math.PI * 1.5 + th, true);
                ctx.quadraticCurveTo(cx + nw / 2, sY, cx + nw / 2, nBot);  // 우 어깨(좌와 완전 대칭)
                ctx.lineTo(cx + nw / 2, nTop);
                ctx.closePath();
            };
            glass();
            ctx.fillStyle = G._lin(ctx, cx - br, 0, cx + br, 0,
                [[0, 'rgba(232,247,252,.88)'], [0.45, 'rgba(184,215,228,.72)'], [1, 'rgba(126,164,184,.80)']]);
            ctx.fill();

            // 액체 (하단 클립)
            ctx.save();
            glass();
            ctx.clip();
            const lvl = S * 0.50;
            ctx.fillStyle = G._lin(ctx, 0, lvl, 0, bcy + br,
                [[0, G._shade(liq, 0.35)], [0.45, liq], [1, G._shade(liq, -0.5)]]);
            ctx.fillRect(0, lvl, S, S);
            // 액면 (메니스커스)
            ctx.beginPath();
            ctx.ellipse(cx, lvl, br * 0.62, S * 0.028, 0, 0, Math.PI * 2);
            ctx.fillStyle = G._shade(liq, 0.55);
            ctx.fill();
            // 기포
            const rnd = G._rng(7788);
            for (let i = 0; i < 7; i++) {
                const x = cx + (rnd() - 0.5) * br * 1.3, y = lvl + rnd() * (br * 1.5);
                ctx.beginPath();
                ctx.arc(x, y, S * (0.012 + rnd() * 0.02), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.35})`;
                ctx.fill();
            }
            // 액체 내부 광채
            ctx.fillStyle = G._rad(ctx, cx - br * 0.3, bcy - br * 0.1, 0, cx - br * 0.3, bcy - br * 0.1, br * 0.9,
                [[0, 'rgba(255,255,255,.30)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(0, lvl, S, S);
            // 유리 스펙큘러 스트릭
            ctx.fillStyle = 'rgba(255,255,255,.72)';
            G._rr(ctx, cx - br * 0.68, bcy - br * 0.52, S * 0.055, br * 0.78, S * 0.03);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.34)';
            G._rr(ctx, cx + br * 0.46, bcy - br * 0.34, S * 0.032, br * 0.62, S * 0.02);
            ctx.fill();
            ctx.restore();

            glass();
            ctx.lineWidth = S * 0.026;
            ctx.strokeStyle = 'rgba(28,52,64,.72)';
            ctx.stroke();

            // 코르크
            G._rr(ctx, cx - nw * 0.66, S * 0.09, nw * 1.32, S * 0.135, S * 0.03);
            ctx.fillStyle = G._lin(ctx, cx - nw * 0.66, 0, cx + nw * 0.66, 0,
                [[0, '#c08d54'], [0.35, '#e6b479'], [1, '#8a5c2c']]);
            ctx.fill();
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(60,36,12,.75)';
            ctx.stroke();
        },

        // ---- 태엽: 금속 기어 ----
        winder(ctx, S) {
            const G = IconGen, cx = S / 2, cy = S / 2, R = S * 0.465, root = R * 0.72;
            const T = 8, step = (Math.PI * 2) / T;   // 이 수를 줄여 14px에서도 톱니가 뭉치지 않게
            // 이 하나 = [뿌리→이끝 사선] + [이끝 원호] + [이끝→뿌리 사선] + [골 원호]
            const gear = () => {
                for (let i = 0; i < T; i++) {
                    const a = i * step - Math.PI / 2;
                    const tip = step * 0.17, rt = step * 0.30;
                    ctx.lineTo(cx + Math.cos(a - rt) * root, cy + Math.sin(a - rt) * root);
                    ctx.lineTo(cx + Math.cos(a - tip) * R, cy + Math.sin(a - tip) * R);
                    ctx.arc(cx, cy, R, a - tip, a + tip);
                    ctx.lineTo(cx + Math.cos(a + rt) * root, cy + Math.sin(a + rt) * root);
                    ctx.arc(cx, cy, root, a + rt, a + step - rt);
                }
                ctx.closePath();
            };
            ctx.beginPath();
            gear();
            // 밝은 회색 pill 위에서도 실루엣이 죽지 않도록 중간톤을 눌러 잡은 강철
            ctx.fillStyle = G._rad(ctx, cx - R * 0.35, cy - R * 0.4, R * 0.06, cx, cy, R * 1.2,
                [[0, '#e4ecf3'], [0.3, '#a9b6c2'], [0.62, '#6d7b88'], [1, '#333d47']]);
            ctx.fill();
            // 이 끝단 베벨 — 위쪽 이는 밝게, 아래쪽 이는 어둡게
            G._innerShadow(ctx, gear, 'rgba(12,18,24,.75)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath();
            gear();
            ctx.lineWidth = S * 0.024;
            ctx.strokeStyle = 'rgba(24,30,36,.78)';
            ctx.stroke();

            // 살(웹) 면 — 평면 검은 원 4개는 14px에서 '벌레 눈'으로 읽혀 폐기했다.
            // 대신 금속 톤으로 살짝 파인 얕은 홈만 남겨 기계 느낌을 유지한다.
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const hx = cx + Math.cos(a) * R * 0.45, hy = cy + Math.sin(a) * R * 0.45;
                const dip = () => ctx.arc(hx, hy, R * 0.13, 0, Math.PI * 2);
                ctx.beginPath();
                dip();
                ctx.fillStyle = G._lin(ctx, hx, hy - R * 0.13, hx, hy + R * 0.13,
                    [[0, '#5d6a76'], [1, '#93a1ad']]);   // 파인 홈: 위가 어둡고 아래가 밝다
                ctx.fill();
                ctx.beginPath();
                dip();
                ctx.lineWidth = S * 0.012;
                ctx.strokeStyle = 'rgba(28,36,44,.55)';
                ctx.stroke();
            }

            // 허브 — 볼록한 금속 보스(중앙이 뚫린 구멍처럼 보이지 않게)
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.33, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, cx - R * 0.12, cy - R * 0.14, R * 0.02, cx, cy, R * 0.42,
                [[0, '#f4f8fb'], [0.45, '#b9c5d0'], [1, '#5c6772']]);
            ctx.fill();
            ctx.lineWidth = S * 0.02;
            ctx.strokeStyle = 'rgba(24,30,36,.75)';
            ctx.stroke();
            // 축 — 작은 볼록 핀
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.125, 0, Math.PI * 2);
            ctx.fillStyle = G._lin(ctx, cx, cy - R * 0.125, cx, cy + R * 0.125,
                [[0, '#98a5b1'], [1, '#4a545e']]);
            ctx.fill();
            ctx.lineWidth = S * 0.013;
            ctx.strokeStyle = 'rgba(24,30,36,.6)';
            ctx.stroke();

            // 상단 라이팅 — 호(arc)로 그으면 그 호가 지나가는 톱니 3개에만 흰 캡이 붙어
            // '톱니마다 다른 모자'처럼 보인다. 전체에 고르게 걸리는 세로 그라디언트로 대체.
            ctx.save();
            ctx.beginPath();
            gear();
            ctx.clip();
            ctx.fillStyle = G._lin(ctx, 0, cy - R, 0, cy + R * 0.15,
                [[0, 'rgba(255,255,255,.42)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(cx - R, cy - R, R * 2, R * 1.2);
            ctx.restore();
        },

        // ---- 자물쇠: 잠김 배지 (던전 미해금·기술 노드·자동 제련 버튼) ----
        // 어두운 강철 고리 + 황동 몸통. 14px 배지로도 읽히도록 고리를 굵게, 열쇠구멍을 크게 잡는다.
        lock(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const bx = S * 0.17, by = S * 0.44, bw = S * 0.66, bh = S * 0.44, br = S * 0.10;
            const body = () => G._rrSub(ctx, bx, by, bw, bh, br);   // 서브패스만 추가(_innerShadow 규약)

            // 고리 — 몸통 뒤에 깔리도록 먼저
            ctx.beginPath();
            ctx.arc(cx, by + S * 0.015, S * 0.20, Math.PI, 0);
            ctx.lineWidth = S * 0.115;
            ctx.strokeStyle = G._lin(ctx, cx - S * 0.2, 0, cx + S * 0.2, 0,
                [[0, '#8d99a5'], [0.35, '#e8eff5'], [0.7, '#8996a3'], [1, '#4a555f']]);
            ctx.stroke();
            ctx.lineWidth = S * 0.145;
            ctx.strokeStyle = 'rgba(20,26,32,.55)';
            ctx.globalCompositeOperation = 'destination-over';
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';

            // 몸통 그림자
            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.028);
            ctx.beginPath(); body(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); body();
            ctx.fillStyle = G._lin(ctx, 0, by, 0, by + bh,
                [[0, '#ffe08a'], [0.3, '#f0b52e'], [0.68, '#c8870f'], [1, '#8a5806']]);
            ctx.fill();
            G._innerShadow(ctx, body, 'rgba(70,40,2,.6)', S * 0.04, 0, -S * 0.018);
            // 상단 광택
            ctx.save();
            ctx.beginPath(); body(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.5)';
            ctx.fillRect(bx, by, bw, bh * 0.16);
            ctx.restore();

            // 열쇠구멍 — 원 + 아래로 벌어지는 홈
            ctx.beginPath();
            ctx.arc(cx, by + bh * 0.40, S * 0.075, 0, Math.PI * 2);
            ctx.moveTo(cx - S * 0.038, by + bh * 0.42);
            ctx.lineTo(cx - S * 0.062, by + bh * 0.84);
            ctx.lineTo(cx + S * 0.062, by + bh * 0.84);
            ctx.lineTo(cx + S * 0.038, by + bh * 0.42);
            ctx.closePath();
            ctx.fillStyle = 'rgba(48,26,2,.88)';
            ctx.fill();

            ctx.beginPath(); body();
            ctx.lineWidth = S * 0.024;
            ctx.strokeStyle = 'rgba(60,34,2,.8)';
            ctx.stroke();
        },

        // ---- 열쇠: 던전 입장 열쇠 개수 표시 ----
        // 원본(shot-042304 팝업 '0/2' 줄 잉크 히스토그램)은 금색이 아니라 **은회색**이다 —
        // 채움 #b0b0b0(176,176,176) 중심 + 순검정 외곽선(최빈 잉크가 0,0,0). 무채색 그라디언트로 재현.
        // 단, **던전 목록(shot-042251)의 행별 열쇠는 색이 다르다**(확대 실측 2026-08-19: 해머=은회 ·
        // 유령=초록 · 침략=주황 · 좀비=빨강) — key_green/orange/red 가 스톱만 바꿔 같은 화형을 쓴다.
        key(ctx, S) {
            const G = IconGen;
            const stops = G.draw._keyStops || [[0, '#dcdcdc'], [0.32, '#bcbcbc'], [0.7, '#9c9c9c'], [1, '#6e6e6e']];
            G.draw._keyStops = null;
            const silver = () => G._lin(ctx, 0, S * 0.2, 0, S * 0.85, stops);
            ctx.save();
            ctx.translate(S / 2, S / 2); ctx.rotate(-0.62); ctx.translate(-S / 2, -S / 2);
            /* 🚨 **20칸 격자에서 읽히도록 다시 잡은 비례 (2026-08-25 라운드5)**. 블라인드 비평가 2인이
             *    "열쇠 머리에 **구멍이 뚫려 있지 않고** 몸통은 형태 없는 덩어리라 48px 에서 막대사탕·
             *    망치로 읽힌다"고 공통 지목했다(4종 전부 = key·key_green·key_orange·key_red).
             *    옛 판의 병 셋:
             *    ⑴ 고리 구멍이 **진짜 구멍이 아니라 `rgba(20,20,20,.85)` 어두운 칠**이었다 →
             *       블록화 뒤 검정 테와 붙어 **머리가 통짜 덩어리**가 된다.
             *    ⑵ 대 폭 0.124S = **2.5칸**인데 외곽선이 양쪽에서 0.84칸씩 먹어 속살이 1칸 밑으로 내려갔다.
             *    ⑶ 이 2개가 0.10·0.09S = **2칸·1.8칸**이라 칸 스냅에서 서로 뭉개져 한 덩어리가 됐다.
             *    처방(비평가 C 의 규칙 그대로): 구멍을 `destination-out` 으로 **실제로 뚫고**,
             *    구멍 지름을 4칸으로 잡아 고리 벽이 2칸 남게 하고, 대를 3칸으로, 이를 아래로 꺾인
             *    2칸 돌기 둘로 명시한다. ⚠️ 색(은회 + 던전별 스톱)은 원본 실측이라 그대로 둔다. */
            const bx = S * 0.30, by = S * 0.27;
            const bR = S * 0.20, hR = S * 0.10;                   // 고리 바깥 4칸 반지름 · 구멍 2칸 반지름 → 벽 2칸
            const stemW = S * 0.15, stemX = bx - stemW / 2;       // 대 3칸
            const stemTop = by + bR * 0.55, stemBot = by + S * 0.57;
            const solid = () => {
                ctx.moveTo(bx + bR, by);
                ctx.arc(bx, by, bR, 0, Math.PI * 2);
                G._rrSub(ctx, stemX, stemTop, stemW, stemBot - stemTop, S * 0.03);
                G._rrSub(ctx, bx + stemW * 0.35, by + S * 0.27, S * 0.145, S * 0.10, S * 0.02);  // 이 1 (2.9×2칸)
                G._rrSub(ctx, bx + stemW * 0.35, by + S * 0.45, S * 0.145, S * 0.10, S * 0.02);  // 이 2 (2.9×2칸)
            };
            ctx.beginPath(); solid();
            ctx.fillStyle = silver();
            ctx.fill();                                            // nonzero — 겹친 대/고리가 서로 지우지 않게
            // 고리 구멍을 **진짜로 뚫는다**(어둡게 칠하지 않는다 — 그게 옛 판이 덩어리로 읽힌 이유다)
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(bx, by, hR, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            // 외곽선 — 몸통과 구멍 둘 다 두른다(구멍에도 테가 있어야 고리로 읽힌다)
            ctx.lineWidth = S * 0.040;
            ctx.strokeStyle = 'rgba(0,0,0,.92)';
            ctx.beginPath(); solid(); ctx.stroke();
            ctx.beginPath(); ctx.arc(bx, by, hR, 0, Math.PI * 2); ctx.stroke();
            // 대 왼쪽 면 하이라이트 — 한 칸 폭으로 세워 '면 분할'이 칸에 떨어지게
            ctx.beginPath();
            ctx.moveTo(stemX + S * 0.035, stemTop + S * 0.05);
            ctx.lineTo(stemX + S * 0.035, stemBot - S * 0.04);
            ctx.lineWidth = S * 0.05;
            ctx.strokeStyle = 'rgba(255,255,255,.42)';
            ctx.stroke();
            ctx.restore();
        },
        // 던전 목록 행별 색 열쇠(원본 shot-042251 실측: 유령=초록·침략=주황·좀비=빨강. 해머는 기본 은회색)
        key_green(ctx, S) {
            IconGen.draw._keyStops = [[0, '#b8f0a8'], [0.32, '#7ed468'], [0.7, '#46a83e'], [1, '#297428']];
            IconGen.draw.key(ctx, S);
        },
        key_orange(ctx, S) {
            IconGen.draw._keyStops = [[0, '#ffdca4'], [0.32, '#ffb45e'], [0.7, '#ee8a28'], [1, '#b25c12']];
            IconGen.draw.key(ctx, S);
        },
        key_red(ctx, S) {
            IconGen.draw._keyStops = [[0, '#ffb4aa'], [0.32, '#f07260'], [0.7, '#d43a2e'], [1, '#96201a']];
            IconGen.draw.key(ctx, S);
        },

        // ---- 선물 상자: 보상 수령 (리그 시즌·패스·특가) ----
        gift(ctx, S) {
            const G = IconGen;
            const bx = S * 0.14, bw = S * 0.72, ly = S * 0.30, lh = S * 0.16;
            const by = ly + lh, bh = S * 0.44;
            const rw = S * 0.15;                     // 리본 폭
            const rx = S * 0.5 - rw / 2;

            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            ctx.beginPath(); G._rr(ctx, bx, ly, bw, bh + lh, S * 0.05); ctx.fill();
            ctx.restore();

            // 상자 몸통
            const boxPath = () => G._rrSub(ctx, bx + S * 0.03, by, bw - S * 0.06, bh, S * 0.035);
            ctx.beginPath(); boxPath();
            ctx.fillStyle = G._lin(ctx, 0, by, 0, by + bh,
                [[0, '#ff7a6b'], [0.45, '#e8402f'], [1, '#96150c']]);
            ctx.fill();
            G._innerShadow(ctx, boxPath, 'rgba(70,6,2,.5)', S * 0.035, 0, -S * 0.018);
            ctx.beginPath(); boxPath();
            ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(58,6,2,.8)'; ctx.stroke();

            // 뚜껑
            ctx.beginPath(); G._rr(ctx, bx, ly, bw, lh, S * 0.035);
            ctx.fillStyle = G._lin(ctx, 0, ly, 0, ly + lh,
                [[0, '#ff9c8e'], [0.6, '#ee5240'], [1, '#b8200f']]);
            ctx.fill();
            ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(58,6,2,.8)'; ctx.stroke();

            // 리본 세로 + 매듭 고리 2개
            const ribbon = G._lin(ctx, rx, 0, rx + rw, 0,
                [[0, '#e0a70d'], [0.4, '#ffe58a'], [1, '#c98a06']]);
            ctx.beginPath(); ctx.rect(rx, ly, rw, bh + lh);
            ctx.fillStyle = ribbon; ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(96,60,2,.6)'; ctx.stroke();

            const loop = (dir) => {
                ctx.beginPath();
                ctx.moveTo(S * 0.5, ly + S * 0.02);
                ctx.quadraticCurveTo(S * 0.5 + dir * S * 0.30, ly - S * 0.20, S * 0.5 + dir * S * 0.10, ly - S * 0.015);
                ctx.closePath();
                ctx.fillStyle = ribbon; ctx.fill();
                ctx.lineWidth = S * 0.02; ctx.strokeStyle = 'rgba(96,60,2,.65)'; ctx.stroke();
            };
            loop(1); loop(-1);
            ctx.beginPath();
            ctx.arc(S * 0.5, ly + S * 0.005, S * 0.055, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, S * 0.48, ly - S * 0.015, S * 0.005, S * 0.5, ly, S * 0.07,
                [[0, '#fff6c9'], [1, '#d99c08']]);
            ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(96,60,2,.65)'; ctx.stroke();
        },

        // ---- 트로피: 리그 승리 ----
        trophy(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const cupTop = S * 0.20, cupBot = S * 0.60, halfTop = S * 0.24;
            const gold = G._lin(ctx, cx - halfTop, cupTop, cx + halfTop, cupBot,
                [[0, '#fff2bd'], [0.28, '#f5cb45'], [0.62, '#d69a12'], [1, '#8f5f05']]);
            const cup = () => {
                ctx.moveTo(cx - halfTop, cupTop);
                ctx.lineTo(cx + halfTop, cupTop);
                ctx.lineTo(cx + halfTop * 0.72, cupBot - S * 0.06);
                ctx.quadraticCurveTo(cx, cupBot + S * 0.05, cx - halfTop * 0.72, cupBot - S * 0.06);
                ctx.closePath();
            };
            // 손잡이
            const handle = (dir) => {
                ctx.beginPath();
                ctx.moveTo(cx + dir * halfTop * 0.94, cupTop + S * 0.03);
                ctx.quadraticCurveTo(cx + dir * S * 0.40, cupTop + S * 0.10, cx + dir * halfTop * 0.90, cupTop + S * 0.21);
                ctx.lineWidth = S * 0.055;
                ctx.strokeStyle = gold;
                ctx.stroke();
                ctx.lineWidth = S * 0.075;
                ctx.strokeStyle = 'rgba(64,38,2,.55)';
                ctx.globalCompositeOperation = 'destination-over';
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            };
            handle(1); handle(-1);

            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            ctx.beginPath(); cup(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); cup();
            ctx.fillStyle = gold;
            ctx.fill();
            G._innerShadow(ctx, cup, 'rgba(70,40,2,.55)', S * 0.04, 0, -S * 0.018);
            ctx.save();
            ctx.beginPath(); cup(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.45)';
            ctx.fillRect(cx - halfTop, cupTop, halfTop * 2, S * 0.045);
            ctx.fillStyle = 'rgba(255,255,255,.3)';
            ctx.fillRect(cx - halfTop * 0.6, cupTop, S * 0.05, cupBot - cupTop);
            ctx.restore();
            ctx.beginPath(); cup();
            ctx.lineWidth = S * 0.024; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();

            // 기둥 + 받침 2단
            const post = () => G._rr(ctx, cx - S * 0.055, cupBot, S * 0.11, S * 0.11, S * 0.02);
            const base1 = () => G._rr(ctx, cx - S * 0.15, cupBot + S * 0.10, S * 0.30, S * 0.07, S * 0.02);
            const base2 = () => G._rr(ctx, cx - S * 0.21, cupBot + S * 0.16, S * 0.42, S * 0.09, S * 0.025);
            for (const p of [post, base1, base2]) {
                ctx.beginPath(); p();
                ctx.fillStyle = G._lin(ctx, 0, cupBot, 0, cupBot + S * 0.26,
                    [[0, '#f7d364'], [0.5, '#d29a14'], [1, '#8a5a05']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();
            }
        },

        // ---- 교차 검: 전투력(CP) 표시 ----
        // 상단바·리그 행에서 10~14px로 찍힌다. 날을 가늘게 그리면 그 크기에서 회색 얼룩이 되므로
        // 날 폭을 넉넉히 잡고 검마다 짙은 테를 둘러 X 실루엣이 먼저 읽히게 한다.
        power(ctx, S) {
            const G = IconGen;
            // 검 하나 = 날(끝이 뾰족한 사다리꼴) + 가드 + 손잡이 + 폼멜. 원점 기준 세로로 그린 뒤 회전한다.
            const blade = (rot) => {
                ctx.save();
                ctx.translate(S / 2, S / 2);
                ctx.rotate(rot);
                const w = S * 0.135, L = S * 0.40;          // 날 반폭 / 날 길이 — 10px에서 날이 사라지지 않게 두껍게
                const shape = () => {
                    ctx.moveTo(0, -L - S * 0.05);            // 칼끝
                    ctx.lineTo(w, -L + S * 0.06);
                    ctx.lineTo(w, S * 0.02);
                    ctx.lineTo(-w, S * 0.02);
                    ctx.lineTo(-w, -L + S * 0.06);
                    ctx.closePath();
                };
                ctx.beginPath(); shape();
                ctx.fillStyle = G._lin(ctx, -w, 0, w, 0,
                    [[0, '#7d8b98'], [0.3, '#eef4f9'], [0.62, '#9fadba'], [1, '#4d5862']]);
                ctx.fill();
                ctx.lineWidth = S * 0.038; ctx.strokeStyle = 'rgba(18,24,30,.92)'; ctx.stroke();

                // 가드(십자) — 금색
                ctx.beginPath(); G._rrSub(ctx, -S * 0.22, S * 0.02, S * 0.44, S * 0.09, S * 0.03);
                ctx.fillStyle = G._lin(ctx, 0, S * 0.02, 0, S * 0.095,
                    [[0, '#ffe38f'], [0.55, '#e8a81a'], [1, '#96620a']]);
                ctx.fill();
                ctx.lineWidth = S * 0.024; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();

                // 손잡이 + 폼멜
                ctx.beginPath(); G._rrSub(ctx, -S * 0.045, S * 0.09, S * 0.09, S * 0.145, S * 0.025);
                ctx.fillStyle = G._lin(ctx, -S * 0.045, 0, S * 0.045, 0,
                    [[0, '#5a3a1c'], [0.45, '#9c6a35'], [1, '#4a2f16']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(40,24,8,.85)'; ctx.stroke();
                ctx.beginPath(); ctx.arc(0, S * 0.255, S * 0.055, 0, Math.PI * 2);
                ctx.fillStyle = G._rad(ctx, -S * 0.015, S * 0.24, S * 0.005, 0, S * 0.255, S * 0.07,
                    [[0, '#ffe9a6'], [1, '#b8790c']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();
                ctx.restore();
            };
            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.02}px)`;
            ctx.translate(0, S * 0.03);
            blade(0.72); blade(-0.72);
            ctx.restore();
            blade(0.72);    // 뒤쪽 검
            blade(-0.72);   // 앞쪽 검
        },

        // ---- 별: 승천 등급 배지(장비 셀·스킬/펫/탈것 타일·비교 카드·리그 점수) ----
        // 이 배지는 `.sk-star` 기준 10~12px로도 찍히므로 디테일보다 **실루엣과 테**가 전부다.
        // 뾰족한 5각 + 굵은 갈색 테 + 위쪽 밝은 그라디언트만 남기고 잔무늬는 넣지 않는다.
        star(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.52, R = S * 0.46, r = R * 0.44;
            const path = () => {
                for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                    const rr = i % 2 ? r : R;
                    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
                    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.closePath();
            };
            ctx.save();
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.018}px)`;
            ctx.translate(0, S * 0.035);
            ctx.beginPath(); path(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); path();
            ctx.fillStyle = G._rad(ctx, cx - R * 0.25, cy - R * 0.45, S * 0.01, cx, cy, R * 1.15,
                [[0, '#fffbe0'], [0.32, '#ffd94e'], [0.68, '#f2ab12'], [1, '#b46b04']]);
            ctx.fill();
            G._innerShadow(ctx, path, 'rgba(90,52,2,.55)', S * 0.035, 0, -S * 0.016);
            // 위쪽 뿔 하이라이트 — 작은 크기에서 '금속 별'로 읽히게 하는 유일한 디테일
            ctx.save();
            ctx.beginPath(); path(); ctx.clip();
            ctx.fillStyle = G._lin(ctx, 0, cy - R, 0, cy,
                [[0, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(cx - R, cy - R, R * 2, R);
            ctx.restore();
            ctx.beginPath(); path();
            ctx.lineWidth = S * 0.05;   // 흰 셀·검은 리본 어디에 얹혀도 형태가 유지되도록 두껍게
            ctx.strokeStyle = 'rgba(74,42,2,.85)';
            ctx.stroke();
        },

        // ---- 리그 보상 등수 배지 (원본 shot-042208 확대 대조) ----
        // 원본은 👑🥈🥉 이모지가 아니라 **숫자를 얹는 배지**다: 1·2위는 뿔 3개 끝에 구슬이 달린 왕관
        // (1위 주황금, 2위 올리브회색 + 밝은 받침띠), 3위는 벽돌색 마름모. 숫자는 배지가 아니라
        // 그 위에 흰 글자로 얹히므로 **아이콘에는 숫자를 그리지 않는다**(등수 칸이 span 으로 덮는다).
        // 두 왕관은 팔레트만 다른 같은 도형이라 `_crownRank` 하나로 그린다.
        rank1(ctx, S) {
            IconGen._crownRank(ctx, S, {
                body: [[0, '#ffc65a'], [0.45, '#f5a11b'], [1, '#e07f08']],
                base: [[0, '#f79a14'], [1, '#e07a06']], ball: '#f78a0f',
            });
        },
        rank2(ctx, S) {
            IconGen._crownRank(ctx, S, {
                body: [[0, '#a8a189'], [0.45, '#857f68'], [1, '#6b6553']],
                base: [[0, '#d6d0b6'], [1, '#b9b298']], ball: '#8f8971',
            });
        },
        // 3위 — 벽돌색 마름모(정사각형 45° 회전). 굵은 검정 테 + 위쪽 하이라이트.
        rank3(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.5, r = S * 0.40;
            const dia = () => {
                ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
            };
            ctx.beginPath(); dia();
            ctx.fillStyle = G._lin(ctx, 0, cy - r, 0, cy + r, [[0, '#c4644a'], [0.5, '#a64a34'], [1, '#7d3524']]);
            ctx.fill();
            G._innerShadow(ctx, dia, 'rgba(60,20,10,.5)', S * 0.05, 0, -S * 0.02);
            ctx.save(); ctx.beginPath(); dia(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.22)';
            ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.beginPath(); dia();
            ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },

        // ---- 기술 트리 노드 모티프 8종 ----
        // 원본(shot-042605)의 노드는 **청동 원판 위에 작은 픽토그램**이고 이모지가 아니다.
        // 노드는 --tt-node(≈58px)의 40% = 23px 로 찍히므로, 전부 **단일 실루엣 + 굵은 검정 테**로
        // 그린다(power 아이콘에서 배운 대로 도형이 둘 이상이면 이 크기에서 얼룩이 된다 —
        // paw/clover/dice 는 부속을 붙이되 본체가 먼저 읽히도록 본체를 크게 잡았다).
        // opt.tint 로 색을 갈아 같은 도형을 둘로 쓴다(펫 체력=초록 / 펫 피해=붉은색) —
        // 같은 가지에 나란히 놓이는 두 노드라 색까지 같으면 '중복 아이콘'으로 읽힌다.
        paw(ctx, S, o) {                                 // 펫 보너스 — 발바닥
            const G = IconGen, ink = '#17181a';
            const base = (o && o.tint) || '#35c14a';
            const pad = G._lin(ctx, 0, S * 0.4, 0, S * 0.9,
                [[0, G._shade(base, 0.42)], [0.5, base], [1, G._shade(base, -0.35)]]);
            const toe = (x, y, rx, ry) => {
                ctx.beginPath(); ctx.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2);
                ctx.fillStyle = pad; ctx.fill();
                ctx.lineWidth = S * 0.055; ctx.strokeStyle = ink; ctx.stroke();
            };
            const main = () => { ctx.ellipse(S * 0.5, S * 0.685, S * 0.28, S * 0.225, 0, 0, Math.PI * 2); };
            ctx.beginPath(); main(); ctx.fillStyle = pad; ctx.fill();
            G._innerShadow(ctx, main, 'rgba(6,50,18,.5)', S * 0.045, 0, -S * 0.02);
            ctx.beginPath(); main(); ctx.lineWidth = S * 0.062; ctx.strokeStyle = ink; ctx.stroke();
            toe(0.20, 0.335, 0.105, 0.125); toe(0.415, 0.245, 0.105, 0.13);
            toe(0.625, 0.26, 0.105, 0.13); toe(0.82, 0.365, 0.10, 0.12);
        },
        check(ctx, S) {                                  // 최대 레벨 노드 — 초록 체크
            const G = IconGen;
            const p = () => {
                ctx.moveTo(S * 0.14, S * 0.50); ctx.lineTo(S * 0.30, S * 0.34);
                ctx.lineTo(S * 0.42, S * 0.50); ctx.lineTo(S * 0.74, S * 0.19);
                ctx.lineTo(S * 0.90, S * 0.35); ctx.lineTo(S * 0.42, S * 0.82);
                ctx.closePath();
            };
            ctx.beginPath(); p();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.19, 0, S * 0.82, [[0, '#7ee2a0'], [0.5, '#2fb85e'], [1, '#177a3a']]);
            ctx.fill();
            G._innerShadow(ctx, p, 'rgba(8,50,24,.45)', S * 0.045, 0, -S * 0.02);
            ctx.beginPath(); p(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        heart(ctx, S) {                                  // 패시브 체력 — 하트
            const G = IconGen, cx = S * 0.5;
            const p = () => {
                ctx.moveTo(cx, S * 0.86);
                ctx.bezierCurveTo(S * 0.02, S * 0.53, S * 0.14, S * 0.13, cx, S * 0.35);
                ctx.bezierCurveTo(S * 0.86, S * 0.13, S * 0.98, S * 0.53, cx, S * 0.86);
                ctx.closePath();
            };
            ctx.beginPath(); p();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.2, 0, S * 0.86, [[0, '#ff7a86'], [0.45, '#e8323f'], [1, '#9c1420']]);
            ctx.fill();
            G._innerShadow(ctx, p, 'rgba(80,4,12,.5)', S * 0.05, 0, -S * 0.02);
            ctx.save(); ctx.beginPath(); p(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.4)';
            ctx.beginPath(); ctx.ellipse(S * 0.33, S * 0.34, S * 0.10, S * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.beginPath(); p(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        clover(ctx, S) {                                 // 무료 제련 확률 — 네잎 클로버
            const G = IconGen, cx = S * 0.5, cy = S * 0.46, r = S * 0.20;
            const grad = G._lin(ctx, 0, cy - r * 2, 0, cy + r * 2, [[0, '#6ee87f'], [0.5, '#2fb84a'], [1, '#177a30']]);
            ctx.beginPath();
            ctx.moveTo(cx, cy + S * 0.03);
            ctx.quadraticCurveTo(cx - S * 0.05, cy + S * 0.30, cx - S * 0.17, cy + S * 0.40);
            ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#177a30'; ctx.stroke();
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                ctx.beginPath();
                ctx.ellipse(cx + dx * r * 0.78, cy + dy * r * 0.78, r * 0.78, r * 0.78, 0, 0, Math.PI * 2);
                ctx.fillStyle = grad; ctx.fill();
                ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
            }
        },
        horse(ctx, S) {                                  // 탈것 마스터리 — 말 머리
            const G = IconGen;
            const head = () => {
                ctx.moveTo(S * 0.30, S * 0.88);
                ctx.lineTo(S * 0.30, S * 0.52);
                ctx.quadraticCurveTo(S * 0.32, S * 0.30, S * 0.50, S * 0.24);
                ctx.lineTo(S * 0.46, S * 0.10);                  // 귀
                ctx.lineTo(S * 0.62, S * 0.22);
                ctx.quadraticCurveTo(S * 0.84, S * 0.28, S * 0.86, S * 0.44);
                ctx.quadraticCurveTo(S * 0.87, S * 0.56, S * 0.70, S * 0.58);
                ctx.quadraticCurveTo(S * 0.58, S * 0.60, S * 0.56, S * 0.88);
                ctx.closePath();
            };
            ctx.beginPath(); head();
            ctx.fillStyle = G._lin(ctx, S * 0.3, 0, S * 0.86, S, [[0, '#b98652'], [0.5, '#8d5f31'], [1, '#5a3a1a']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(40,20,4,.55)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); ctx.arc(S * 0.66, S * 0.40, S * 0.045, 0, Math.PI * 2);
            ctx.fillStyle = '#17181a'; ctx.fill();
        },
        moneybag(ctx, S) {                               // 판매가·코인 보너스 — 돈자루
            const G = IconGen, cx = S * 0.5;
            const bag = () => {
                ctx.moveTo(cx - S * 0.16, S * 0.34);
                ctx.bezierCurveTo(S * 0.04, S * 0.50, S * 0.08, S * 0.88, cx, S * 0.88);
                ctx.bezierCurveTo(S * 0.92, S * 0.88, S * 0.96, S * 0.50, cx + S * 0.16, S * 0.34);
                ctx.closePath();
            };
            ctx.beginPath(); bag();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.34, 0, S * 0.88, [[0, '#e6c98a'], [0.45, '#c79a4e'], [1, '#8a6524']]);
            ctx.fill();
            G._innerShadow(ctx, bag, 'rgba(60,38,4,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); bag(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 목끈
            ctx.beginPath(); G._rrSub(ctx, cx - S * 0.20, S * 0.20, S * 0.40, S * 0.15, S * 0.05);
            ctx.fillStyle = G._lin(ctx, 0, S * 0.20, 0, S * 0.35, [[0, '#a9752c'], [1, '#7a5218']]);
            ctx.fill(); ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 코인 문양
            ctx.beginPath(); ctx.arc(cx, S * 0.62, S * 0.15, 0, Math.PI * 2);
            ctx.fillStyle = '#f5cb45'; ctx.fill();
            ctx.lineWidth = S * 0.05; ctx.strokeStyle = '#6b4a08'; ctx.stroke();
        },
        robot(ctx, S) {                                  // 오토포지 — 로봇 머리
            const G = IconGen, cx = S * 0.5;
            const head = () => G._rrSub(ctx, S * 0.16, S * 0.30, S * 0.68, S * 0.52, S * 0.14);
            // 안테나
            ctx.beginPath(); ctx.moveTo(cx, S * 0.30); ctx.lineTo(cx, S * 0.14);
            ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, S * 0.12, S * 0.085, 0, Math.PI * 2);
            ctx.fillStyle = '#ff5a4a'; ctx.fill();
            ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); head();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.30, 0, S * 0.82, [[0, '#dfe6ee'], [0.5, '#a9b5c2'], [1, '#6f7b88']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(24,32,42,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 눈 두 개 (파란 발광)
            for (const dx of [-0.155, 0.155]) {
                ctx.beginPath(); ctx.arc(cx + dx * S, S * 0.52, S * 0.075, 0, Math.PI * 2);
                ctx.fillStyle = '#2f7bff'; ctx.fill();
                ctx.lineWidth = S * 0.045; ctx.strokeStyle = '#17181a'; ctx.stroke();
            }
            // 입 슬릿
            ctx.beginPath(); G._rrSub(ctx, cx - S * 0.16, S * 0.66, S * 0.32, S * 0.075, S * 0.03);
            ctx.fillStyle = '#3a444f'; ctx.fill();
        },
        uptri(ctx, S) {                                  // 장비 최대 레벨 — 상승 삼각형
            const G = IconGen, cx = S * 0.5;
            const tri = () => {
                ctx.moveTo(cx, S * 0.14); ctx.lineTo(S * 0.90, S * 0.78);
                ctx.lineTo(S * 0.10, S * 0.78); ctx.closePath();
            };
            ctx.beginPath(); tri();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.78, [[0, '#7ee2a0'], [0.5, '#2fb85e'], [1, '#177a3a']]);
            ctx.fill();
            G._innerShadow(ctx, tri, 'rgba(8,50,24,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); tri(); ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        dice(ctx, S) {                                   // 추가 획득 확률 — 주사위
            const G = IconGen;
            const box = () => G._rrSub(ctx, S * 0.14, S * 0.14, S * 0.72, S * 0.72, S * 0.15);
            ctx.beginPath(); box();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.86, [[0, '#ffffff'], [0.5, '#e2e6ea'], [1, '#aeb6bd']]);
            ctx.fill();
            G._innerShadow(ctx, box, 'rgba(30,36,42,.45)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); box(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.fillStyle = '#17181a';
            for (const [x, y] of [[0.32, 0.32], [0.5, 0.5], [0.68, 0.68], [0.68, 0.32], [0.32, 0.68]]) {
                ctx.beginPath(); ctx.arc(x * S, y * S, S * 0.062, 0, Math.PI * 2); ctx.fill();
            }
        },

        // ---- 시대 아이콘 10종 (원본 shot-042831·042950 확대) ----
        // 🚨 원본의 시대 아이콘은 범용 이모지가 아니라 **그 시대의 무기 실루엣**이 순서대로 놓인 것이다:
        //    원시=나무 몽둥이 · 중세=검 · 근대 초기=나팔총 · 현대=권총 · 우주=블래스터 ·
        //    항성간=광선총 · 다중 우주=포탈건 · 양자=원자 · 지하 세계=삼지창 · 신성한=황금 날개.
        //    종전 매핑(🪨⚔️🏴‍☠️🔫🚀🛸🌀⚛️🔥✨)은 절반이 아예 다른 물건이었다.
        // 시대 막대 위에 얹히므로 **바탕색이 매번 다르다** — 전부 굵은 검정 테로 실루엣을 먼저 세운다.
        age_primitive(ctx, S) {                          // 나무 몽둥이
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.16, 0.80], [0.62, 0.30]], 0.115,
                [[0, '#a9773f'], [1, '#5d3a15']]);
            G._ageStroke(ctx, S, [[0.58, 0.34], [0.86, 0.14]], 0.175,
                [[0, '#b98a4e'], [1, '#6b4419']]);
        },
        age_medieval(ctx, S) {                           // 검 — 회청 날 + 주황 손잡이
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.20, 0.84], [0.38, 0.66]], 0.13, [[0, '#d98b2b'], [1, '#8c4f0d']]);
            G._ageStroke(ctx, S, [[0.28, 0.62], [0.46, 0.80]], 0.085, [[0, '#e0a44a'], [1, '#95580f']]);
            G._ageStroke(ctx, S, [[0.36, 0.66], [0.84, 0.20]], 0.145, [[0, '#e9eef4'], [1, '#7f8a97']]);
        },
        age_earlyModern(ctx, S) {                        // 나팔총 — 개머리판 + 벌어진 총구
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.14, 0.80], [0.40, 0.56]], 0.155, [[0, '#8a5c2c'], [1, '#4a2d0d']]);
            G._ageStroke(ctx, S, [[0.36, 0.60], [0.80, 0.22]], 0.115, [[0, '#6c737b'], [1, '#31373d']]);
            G._agePoly(ctx, S, [[0.74, 0.32], [0.92, 0.10], [0.98, 0.26], [0.84, 0.42]], [[0, '#8a929b'], [1, '#3d444b']]);
        },
        age_modern(ctx, S) {                             // 권총
            const G = IconGen;
            G._agePoly(ctx, S, [[0.12, 0.42], [0.86, 0.42], [0.86, 0.58], [0.44, 0.58], [0.34, 0.86], [0.14, 0.86], [0.22, 0.56], [0.12, 0.56]],
                [[0, '#4b5158'], [1, '#171b1f']]);
        },
        age_space(ctx, S) {                              // 블래스터 — 흰 몸체 + 총열 홈
            const G = IconGen;
            G._agePoly(ctx, S, [[0.10, 0.36], [0.82, 0.24], [0.90, 0.42], [0.46, 0.54], [0.36, 0.84], [0.16, 0.82], [0.22, 0.50]],
                [[0, '#f2f5f8'], [1, '#98a2ac']]);
            G._ageStroke(ctx, S, [[0.44, 0.34], [0.72, 0.29]], 0.05, [[0, '#5c666f'], [1, '#5c666f']]);
        },
        age_interstellar(ctx, S) {                       // 광선총 — 둥근 발광부
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.20, 0.82], [0.44, 0.56]], 0.15, [[0, '#e7ecf1'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.40, 0.60], [0.74, 0.28]], 0.185, [[0, '#f4f7fa'], [1, '#9aa4ae']]);
            ctx.beginPath(); ctx.arc(S * 0.80, S * 0.22, S * 0.115, 0, Math.PI * 2);
            ctx.fillStyle = IconGen._lin(ctx, S * 0.7, S * 0.1, S * 0.9, S * 0.34, [[0, '#ffffff'], [1, '#aab4be']]);
            ctx.fill(); ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        age_multiverse(ctx, S) {                         // 포탈건 — 분홍 고리 + 회색 몸체
            const G = IconGen;
            G._agePoly(ctx, S, [[0.38, 0.34], [0.88, 0.34], [0.88, 0.66], [0.38, 0.66]], [[0, '#dfe5ea'], [1, '#8b959f']]);
            ctx.beginPath(); ctx.ellipse(S * 0.30, S * 0.50, S * 0.10, S * 0.30, 0, 0, Math.PI * 2);
            ctx.fillStyle = IconGen._lin(ctx, S * 0.2, 0, S * 0.4, S, [[0, '#ff5f8a'], [1, '#c01f4d']]);
            ctx.fill(); ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.lineWidth = S * 0.045; ctx.strokeStyle = '#3c454e';
            for (const x of [0.52, 0.64, 0.76]) { ctx.beginPath(); ctx.moveTo(x * S, S * 0.40); ctx.lineTo(x * S, S * 0.60); ctx.stroke(); }
        },
        age_quantum(ctx, S) {                            // 원자 — 핵 + 궤도 3
            const cx = S * 0.5, cy = S * 0.5;
            ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a';
            for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
                ctx.beginPath(); ctx.ellipse(0, 0, S * 0.40, S * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
            ctx.beginPath(); ctx.arc(cx, cy, S * 0.115, 0, Math.PI * 2);
            ctx.fillStyle = '#17181a'; ctx.fill();
        },
        age_underworld(ctx, S) {                         // 삼지창
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.50, 0.92], [0.50, 0.34]], 0.10, [[0, '#e2e7ec'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.20, 0.42], [0.80, 0.42]], 0.085, [[0, '#e2e7ec'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.20, 0.42], [0.20, 0.16]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
            G._ageStroke(ctx, S, [[0.80, 0.42], [0.80, 0.16]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
            G._ageStroke(ctx, S, [[0.50, 0.34], [0.50, 0.08]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
        },
        age_divine(ctx, S) {                             // 황금 날개 한 쌍
            const G = IconGen;
            const half = (dir) => G._agePoly(ctx, S, [
                [0.5 + dir * 0.06, 0.30], [0.5 + dir * 0.46, 0.20], [0.5 + dir * 0.34, 0.42],
                [0.5 + dir * 0.46, 0.40], [0.5 + dir * 0.30, 0.62], [0.5 + dir * 0.34, 0.60],
                [0.5 + dir * 0.20, 0.78], [0.5 + dir * 0.06, 0.56],
            ], [[0, '#ffd86a'], [0.5, '#f0a81c'], [1, '#9c6403']]);
            half(-1); half(1);
        },

        // ---- 리그 문장 (원본 shot-042149 확대 실측) ----
        // 원본은 방패 하나가 아니라 **날개가 뒤로 뻗은 플래티넘 문장**이다: 검은 굵은 테 + 민트 방패면 +
        // 위쪽 흰 띠 + 가운데 검은 검 실루엣, 방패 뒤로 좌우 날개(짙은 청록 + 흰 깃줄)와 물방울 장식.
        //
        // 🎨 **원본의 아트 랭귀지는 "순검정 키라인 + 플랫 면"이다** — 그라디언트가 아니다.
        //    원본 문장 영역(x194..295 y34..104)의 색 히스토그램에서 실제로 나오는 색은 넷뿐이다:
        //      #000000(2184px 순검정 테) · rgb(52,196,188)(밝은 민트면 626px) ·
        //      rgb(10,50,52)(짙은 청록 날개/패싯 363px) · #ffffff(흰 하이라이트 245px) + 시안 물방울.
        //    종전 구현은 테를 `#0d1a1a` 로 줘서 시트 배경 rgb(14,17,27) 과 명도차가 거의 없었다 —
        //    **문장 전체가 배경에 녹아** '어두운 얼룩'으로 읽혔다. 테는 반드시 순검정이어야 한다.
        //
        // 📐 **비율은 원본 픽셀 실측을 그대로 옮겼다.** 정규화 기준: 문장 잉크 상자 = 원본 102x71px.
        //    캔버스 S 안에서 잉크가 x 0..1S, y TOP..BOT(=0.696S) 를 채우도록 좌표를 짰다.
        //    행별 잉크 폭(원본, 반폭을 S 비율로 환산): f0.09 이하 0.283(방패만) → f0.24 0.428(윗깃 끝)
        //    → f0.34 0.351(깃 사이 홈) → f0.55 0.490(아랫깃 끝, 최대) → f0.66 이후 다시 방패만.
        //    ⚠️ 캔버스가 잉크를 자른다 — 테 두께의 절반까지 계산에 넣어야 좌우 끝이 안 잘린다.
        leagueEmblem(ctx, S) {
            const cx = S * 0.5;
            const INK = '#000';                 // 순검정 키라인 (원본 실측)
            const MINT = 'rgb(52,196,188)';     // 방패 밝은 면
            const DEEP = 'rgb(10,50,52)';       // 날개 / 방패 하단 패싯
            const AQUA = 'rgb(28,251,255)';     // 물방울
            const TOP = 0.155, BOT = 0.851, HH = BOT - TOP;   // 잉크 세로 범위(캔버스 비율)
            const yy = f => S * (TOP + f * HH);               // 원본 문장 세로 0..1 → 캔버스 y
            const LW = S * 0.048;                             // 키라인 두께
            const half = LW / 2;

            // ── 날개: 한 쪽당 깃 2장. 바깥으로 갈수록 아래로 처지며 끝이 뾰족하다 ──────────
            // pts 는 [중심에서의 x 반폭(S비율), 세로 f]. 바깥 끝은 키라인 절반만큼 당겨
            // 테를 두른 뒤의 잉크가 실측 반폭(0.428 / 0.490)에 정확히 닿게 한다.
            const feather = (dir, pts, streak) => {
                ctx.beginPath();
                pts.forEach((p, i) => {
                    const x = cx + dir * S * p[0], y = yy(p[1]);
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                });
                ctx.closePath();
                ctx.fillStyle = DEEP; ctx.fill();
                ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
                // 깃 윗면을 따라 흐르는 흰 하이라이트 — 원본에서 깃마다 한 줄씩 밝게 뜬다
                ctx.beginPath();
                ctx.moveTo(cx + dir * S * streak[0], yy(streak[1]));
                ctx.lineTo(cx + dir * S * streak[2], yy(streak[3]));
                ctx.lineWidth = S * 0.030; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.stroke();
            };
            const wing = (dir) => {
                // 깃은 **두꺼운 쐐기**여야 한다 — 얇게 잡으면 0.048S 짜리 키라인이 속을 다 먹어
                // 청록 면이 2~3px 만 남고 '날개'가 아니라 '빗금 두 줄'로 읽힌다(첫 판이 그랬다).
                // 바깥 끝은 **뾰족한 쐐기**다 — 사각으로 끊으면 '날개'가 아니라 '막대'로 읽힌다.
                // 위쪽 모서리(p1→p2)가 길고 아래 모서리(p3→p4)가 짧아 바깥으로 갈수록 처진다.
                feather(dir, [
                    [0.150, 0.005], [0.392, 0.130], [0.428 - half / S, 0.215], [0.368, 0.335], [0.150, 0.250],
                ], [0.202, 0.085, 0.360, 0.198]);
                feather(dir, [
                    [0.160, 0.280], [0.448, 0.425], [0.490 - half / S, 0.520], [0.422, 0.672], [0.160, 0.565],
                ], [0.215, 0.355, 0.418, 0.500]);
            };
            wing(-1); wing(1);

            // ── 방패: 평평한 윗변 + 곧은 옆면 → f0.70 부터 뾰족하게 모인다 ────────────────
            // 🔍 **원본 방패는 테가 두 겹이다.** y55 가로 단면(원본 x216..273, 방패 58px):
            //     검정 3 · 짙은청록 5 · **검정 4** · 민트 34 · 검정 3 · 짙은청록 4 · 검정 4
            //   즉 바깥 키라인 안에 짙은 청록 띠가 있고, 그 안쪽에 **민트 패널을 따로 두른 검은 선**이
            //   한 겹 더 있다. 종전 구현은 이 안쪽 선이 없어 민트가 방패 폭을 그대로 채웠고(45px,
            //   원본 33px 대비 +12px = 앱폭 2.4%p), 그걸 베벨만 두껍게 해서 맞추려 하니 이번엔
            //   '짙은 액자에 갇힌 민트'로 보였다. 두 겹을 그대로 그리는 게 답이다.
            const SW = 0.283 - half / S;      // 방패 반폭(테 포함 잉크가 0.283S 가 되게)
            const shield = () => {
                ctx.moveTo(cx - S * SW, yy(0.030));
                ctx.lineTo(cx + S * SW, yy(0.030));
                ctx.lineTo(cx + S * SW, yy(0.700));
                ctx.lineTo(cx, yy(0.975));
                ctx.lineTo(cx - S * SW, yy(0.700));
                ctx.closePath();
            };
            ctx.beginPath(); shield();
            ctx.fillStyle = DEEP; ctx.fill();          // 방패 바탕 = 짙은 청록(베벨·하단 패싯)

            ctx.save(); ctx.beginPath(); shield(); ctx.clip();
            // 민트 패널 — 방패를 축소한 모양. 옆면은 f0.63 까지 곧고 아래는 V 로 모인다
            // (원본: 민트가 옆에서 y81=f0.67 에 끊기고 가운데 V 끝이 y89=f0.79).
            const MW = SW - 0.095;                     // 민트 반폭 → 폭 0.328S = 원본 34px
            const panel = () => {
                ctx.moveTo(cx - S * MW, yy(0.080));
                ctx.lineTo(cx + S * MW, yy(0.080));
                ctx.lineTo(cx + S * MW, yy(0.630));
                ctx.lineTo(cx, yy(0.780));
                ctx.lineTo(cx - S * MW, yy(0.630));
                ctx.closePath();
            };
            ctx.beginPath(); panel();
            ctx.fillStyle = MINT; ctx.fill();
            ctx.lineWidth = S * 0.033 * 2; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
            // 위쪽 흰 띠 — 원본 y38..47 로 10px, 문장 높이의 14.5%
            ctx.save(); ctx.beginPath(); panel(); ctx.clip();
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - S * MW, yy(0.080), S * MW * 2, S * HH * 0.145);
            ctx.restore();
            // 물방울 — 원본에서 **베벨 골 안**, 방패 아래쪽 옆구리에 맺힌다(y78 단면 x222..224 시안).
            // 패널보다 **뒤에** 그리면 패널이 안쪽 절반을 덮어 실오라기로 남는다 — 골 위에 얹는다.
            for (const dir of [-1, 1]) {
                const dx = cx + dir * S * (SW - 0.046);
                ctx.beginPath();
                ctx.moveTo(dx, yy(0.545));
                ctx.lineTo(dx + S * 0.026, yy(0.700));
                ctx.lineTo(dx, yy(0.775));
                ctx.lineTo(dx - S * 0.026, yy(0.700));
                ctx.closePath();
                ctx.fillStyle = AQUA; ctx.fill();
            }
            // 가운데 검 실루엣 — 오른쪽 위를 향한 한 자루(원본은 교차 검이 아니다).
            // 원본은 방패 면의 절반쯤을 차지하는 **작은** 실루엣이라 0.8배로 줄이고 살짝 위로 올렸다.
            // ⚠️ 방패가 아니라 **민트 패널**로 클립해야 한다 — 방패로 클립하면 코등이가 베벨 골 위로
            //    삐져나와 원본에 없는 '검이 액자를 뚫은' 그림이 된다(실제로 한 판 그렇게 나왔다).
            ctx.beginPath(); panel(); ctx.clip();
            ctx.translate(cx, yy(0.430));
            ctx.rotate(0.42);
            ctx.scale(0.80, 0.80);
            ctx.fillStyle = INK;
            ctx.beginPath();                                  // 칼날
            ctx.moveTo(0, -S * 0.235);
            ctx.lineTo(S * 0.058, -S * 0.135);
            ctx.lineTo(S * 0.048, S * 0.030);
            ctx.lineTo(-S * 0.048, S * 0.030);
            ctx.lineTo(-S * 0.058, -S * 0.135);
            ctx.closePath(); ctx.fill();
            ctx.fillRect(-S * 0.115, S * 0.030, S * 0.230, S * 0.048);   // 코등이
            ctx.fillRect(-S * 0.030, S * 0.078, S * 0.060, S * 0.105);   // 손잡이
            ctx.beginPath();                                             // 자루끝
            ctx.arc(0, S * 0.196, S * 0.042, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            ctx.beginPath(); shield();
            ctx.lineWidth = LW; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
        },

        // ---- 유령: 던전 '유령 마을' 배너 ----
        // 배너 배경이 밝은 회색이라 흰 유령이 묻힌다 — 푸른 그림자와 짙은 외곽선으로 실루엣을 세운다.
        ghost(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const top = S * 0.16, bot = S * 0.86, hw = S * 0.30;
            const body = () => {
                ctx.moveTo(cx - hw, bot - S * 0.12);
                ctx.lineTo(cx - hw, top + hw * 0.6);
                ctx.arc(cx, top + hw * 0.6, hw, Math.PI, 0);          // 둥근 머리
                ctx.lineTo(cx + hw, bot - S * 0.12);
                // 아래 자락 물결 3개
                const w = (hw * 2) / 3;
                for (let i = 0; i < 3; i++) {
                    const x0 = cx + hw - w * i;
                    ctx.quadraticCurveTo(x0 - w * 0.25, bot + S * 0.06, x0 - w * 0.5, bot - S * 0.05);
                    ctx.quadraticCurveTo(x0 - w * 0.75, bot - S * 0.16, x0 - w, bot - S * 0.12);
                }
                ctx.closePath();
            };
            ctx.save();
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#0b1430';
            ctx.filter = `blur(${S * 0.03}px)`;
            ctx.translate(S * 0.015, S * 0.04);
            ctx.beginPath(); body(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); body();
            ctx.fillStyle = G._rad(ctx, cx - hw * 0.4, top + hw * 0.3, S * 0.02, cx, S * 0.55, S * 0.62,
                [[0, '#ffffff'], [0.5, '#e8eefb'], [1, '#b9c6e4']]);
            ctx.fill();
            G._innerShadow(ctx, body, 'rgba(70,90,140,.55)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); body();
            ctx.lineWidth = S * 0.026; ctx.strokeStyle = 'rgba(38,48,78,.8)'; ctx.stroke();

            // 눈 2개 + 벌린 입
            const eye = (ex) => {
                ctx.beginPath();
                ctx.ellipse(ex, top + hw * 0.62, S * 0.055, S * 0.075, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#1b2440'; ctx.fill();
                ctx.beginPath();
                ctx.ellipse(ex - S * 0.018, top + hw * 0.50, S * 0.018, S * 0.024, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
            };
            eye(cx - S * 0.115); eye(cx + S * 0.115);
            ctx.beginPath();
            ctx.ellipse(cx, top + hw * 1.20, S * 0.055, S * 0.075, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#1b2440'; ctx.fill();
        },

        // ---- 좀비: 던전 '좀비 러시' 배너 ----
        zombie(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.52;
            const hw = S * 0.30, hh = S * 0.34;
            const head = () => { ctx.moveTo(cx + hw, cy); ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2); };

            ctx.save();
            ctx.globalAlpha = 0.38; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.02}px)`;
            ctx.translate(0, S * 0.035);
            ctx.beginPath(); head(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); head();
            ctx.fillStyle = G._rad(ctx, cx - hw * 0.35, cy - hh * 0.45, S * 0.02, cx, cy, hw * 1.5,
                [[0, '#b6e88a'], [0.45, '#77bf4a'], [0.78, '#4a8a2c'], [1, '#28551a']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(16,44,10,.6)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head();
            ctx.lineWidth = S * 0.026; ctx.strokeStyle = 'rgba(18,42,12,.85)'; ctx.stroke();

            // 썩은 자국 2개
            ctx.save();
            ctx.beginPath(); head(); ctx.clip();
            ctx.fillStyle = 'rgba(40,84,26,.55)';
            ctx.beginPath(); ctx.ellipse(cx + hw * 0.45, cy - hh * 0.15, S * 0.06, S * 0.045, 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx - hw * 0.5, cy + hh * 0.35, S * 0.05, S * 0.035, -0.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // 눈 — 왼쪽은 크게 튀어나오고(흰자+작은 동공) 오른쪽은 감긴 흉터
            ctx.beginPath();
            ctx.ellipse(cx - S * 0.11, cy - S * 0.06, S * 0.075, S * 0.068, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#f6ffe9'; ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(18,42,12,.8)'; ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - S * 0.095, cy - S * 0.045, S * 0.028, 0, Math.PI * 2);
            ctx.fillStyle = '#16240e'; ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + S * 0.055, cy - S * 0.075); ctx.lineTo(cx + S * 0.185, cy - S * 0.035);
            ctx.lineWidth = S * 0.028; ctx.strokeStyle = 'rgba(18,42,12,.85)'; ctx.stroke();

            // 입 — 벌어진 채 이가 몇 개만 남은
            const my = cy + S * 0.16;
            ctx.beginPath();
            ctx.moveTo(cx - S * 0.155, my - S * 0.03);
            ctx.quadraticCurveTo(cx, my + S * 0.12, cx + S * 0.155, my - S * 0.03);
            ctx.quadraticCurveTo(cx, my + S * 0.02, cx - S * 0.155, my - S * 0.03);
            ctx.closePath();
            ctx.fillStyle = '#20180f'; ctx.fill();
            ctx.fillStyle = '#f2f6e4';
            ctx.fillRect(cx - S * 0.085, my - S * 0.022, S * 0.045, S * 0.05);
            ctx.fillRect(cx + S * 0.035, my - S * 0.022, S * 0.04, S * 0.042);
        },

        // ---- 채팅 이름줄 성별 심볼 (원본 shot-043500 실측) ----
        // 원본은 이름 뒤에 **색이 있는 성별 아이콘**을 둔다 — 클론은 회색 텍스트 글리프(♀ 1.00%W)라
        // 원본 클러스터(8.42%W) 대비 −7.4%p로 이름줄이 통째로 가벼워 보였다(비평가 2인 공통 1순위 지적).
        // 실측 색: 몸통 rgb(0,48,144)·외곽 rgb(0,0,24)·하이라이트 rgb(240,240,240).
        gender_m(ctx, S) { IconGen._genderSym(ctx, S, false); },
        gender_f(ctx, S) { IconGen._genderSym(ctx, S, true); },

        // ---- 채팅 이름줄 클랜 배지 ----
        // 원본 실측 색: 몸통 rgb(24,0,48)/rgb(24,0,24), 발광 rgb(168,0,240), 금속 하이라이트 rgb(192~240).
        // 뿔이 좌우로 벌어지고 위에 밝은 관이 얹힌 어두운 보라 문장.
        clanbadge(ctx, S) {
            const G = IconGen, cx = S / 2;
            const ink = '#180018', body = '#180030', glow = '#a800f0';
            // 원본 배지는 26×22px = 가로가 1.18배 넓다. `.ico`는 background-size:contain 이라
            // **정사각 캔버스를 넣으면 상자의 짧은 변(세로)에 맞춰져** 가로가 그만큼 좁아진다
            // (교정 전 실측 3.81%W, 목표 5.21%W). 그래서 그림 자체를 세로로 눌러 1.18 비율로 만든다.
            ctx.save();
            ctx.translate(0, S * 0.09);
            ctx.scale(1, 0.84);

            // ① 좌우 뿔 — 배지 위쪽에서 바깥으로 벌어진다
            ctx.save();
            ctx.strokeStyle = ink;
            ctx.lineWidth = S * 0.055;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * S * 0.20, S * 0.36);
                ctx.quadraticCurveTo(cx + s * S * 0.46, S * 0.20, cx + s * S * 0.48, S * 0.04);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx + s * S * 0.20, S * 0.36);
                ctx.quadraticCurveTo(cx + s * S * 0.44, S * 0.22, cx + s * S * 0.46, S * 0.07);
                ctx.strokeStyle = glow;
                ctx.lineWidth = S * 0.03;
                ctx.stroke();
                ctx.strokeStyle = ink;
                ctx.lineWidth = S * 0.055;
            }
            ctx.restore();

            // ② 방패 본체 (아래로 뾰족한 문장)
            const shield = () => {
                ctx.beginPath();
                ctx.moveTo(cx - S * 0.30, S * 0.22);
                ctx.lineTo(cx + S * 0.30, S * 0.22);
                ctx.lineTo(cx + S * 0.30, S * 0.62);
                ctx.quadraticCurveTo(cx, S * 0.98, cx - S * 0.30, S * 0.62);
                ctx.closePath();
            };
            shield();
            ctx.fillStyle = ink;
            ctx.lineJoin = 'round';
            ctx.lineWidth = S * 0.10;
            ctx.strokeStyle = ink;
            ctx.stroke();
            ctx.fill();

            ctx.save();
            shield();
            ctx.clip();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.24, 0, S * 0.92,
                [[0, '#4a1070'], [0.55, body], [1, '#0c0018']]);
            ctx.fillRect(0, 0, S, S);
            // 가운데 세로 발광 슬릿 — 원본의 보라 빛줄기
            ctx.fillStyle = glow;
            ctx.globalAlpha = 0.92;
            ctx.fillRect(cx - S * 0.045, S * 0.30, S * 0.09, S * 0.42);
            ctx.globalAlpha = 0.30;
            ctx.fillStyle = G._lin(ctx, cx - S * 0.2, 0, cx + S * 0.2, 0,
                [[0, 'rgba(168,0,240,0)'], [0.5, glow], [1, 'rgba(168,0,240,0)']]);
            ctx.fillRect(cx - S * 0.30, S * 0.22, S * 0.60, S * 0.76);
            ctx.restore();

            // ③ 위에 얹힌 밝은 관
            ctx.beginPath();
            ctx.moveTo(cx - S * 0.25, S * 0.25);
            ctx.lineTo(cx - S * 0.16, S * 0.06);
            ctx.lineTo(cx, S * 0.20);
            ctx.lineTo(cx + S * 0.16, S * 0.06);
            ctx.lineTo(cx + S * 0.25, S * 0.25);
            ctx.closePath();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.06, 0, S * 0.25,
                [[0, '#ffffff'], [1, '#c0c0c0']]);
            ctx.strokeStyle = ink;
            ctx.lineWidth = S * 0.05;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.fill();
            ctx.restore();
        },
    },
};

// 성별 심볼 공용 — 화성(♂)/금성(♀) 기호를 같은 굵기·같은 외곽선으로 그린다.
// 14px 안팎에서 읽혀야 하므로 획을 굵게 잡고 검은 외곽선을 먼저 깔아 흰 배경에서 떠 보이게 한다.
IconGen._genderSym = function (ctx, S, female) {
    const cx = S / 2, ink = '#001030';
    const body = female ? '#e0409f' : '#0030b4';
    const lite = female ? '#ff9ad4' : '#7fc4ff';
    const r = S * 0.215, cy = female ? S * 0.40 : S * 0.60;

    const path = () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (female) {
            ctx.moveTo(cx, cy + r);
            ctx.lineTo(cx, S * 0.92);
            ctx.moveTo(cx - S * 0.15, S * 0.78);
            ctx.lineTo(cx + S * 0.15, S * 0.78);
        } else {
            const d = r * 0.707;
            ctx.moveTo(cx + d, cy - d);
            ctx.lineTo(S * 0.90, S * 0.10);
            ctx.moveTo(S * 0.90, S * 0.10);
            ctx.lineTo(S * 0.58, S * 0.10);
            ctx.moveTo(S * 0.90, S * 0.10);
            ctx.lineTo(S * 0.90, S * 0.42);
        }
    };

    // 원본 성별 기호는 15w x 14.7h 로 거의 정사각(비 1.02)인데, 그대로 그리면 원+화살표가
    // 세로로 길어 비 0.82(18.7h)가 된다(비평가 D 실측 +0.81%p). 세로만 눌러 원본 비로 맞춘다.
    ctx.save();
    ctx.translate(0, S * 0.09);
    ctx.scale(1, 0.82);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = ink;
    ctx.lineWidth = S * 0.30;
    ctx.stroke();
    path();
    ctx.strokeStyle = body;
    ctx.lineWidth = S * 0.17;
    ctx.stroke();
    // 좌상단 하이라이트 — 작은 크기에서도 입체로 읽히게
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.55);
    ctx.strokeStyle = lite;
    ctx.lineWidth = S * 0.06;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
};

// ===== 스킬 아이콘: 속성 모티프 엠블럼(캔버스) — 오브 위에 얹는 발광 심볼 =====
// 이모지(⚔️🌀🔥…)를 코드 생성 심볼로 교체한다. 모티프(칼/불/번개/방패…)가 스킬 정체성을,
// 스킬 고유색(SKILL_DEFS[].color) 글로우가 속성 정체성을 만든다. 오브 배경(등급색 그라디언트)은
// CSS(.sk-orb)가 소유하고, 여기서는 배경이 비치도록 '심볼만' 투명 배경으로 그린다.
(function (G) {
    const x = (v, S) => v * S, y = (v, S) => v * S;

    // 심볼 하나를 '발광 엠블럼'으로 렌더한다.
    //   ① 속성색 글로우(뒤) → ② 밝은 그라디언트 채움 → ③ 어두운 외곽선(밝은 오브 위 대비) → ④ 상단 하이라이트
    // pathFn(ctx, S) 는 beginPath 없이 서브패스만 추가한다(규약). 채움은 nonzero.
    /* 평면 3단 채움의 단별 밝기 + 상단 하이라이트 알파 — **`tools/probe-emblem-core.js` 와 짝인
       노브**다. 채도를 올리려면(㉢) 이 값을 내리고, 속살(38px 표시에서 루마 ≥110 인 화소 비율)이
       34% 를 지키는 한도까지만 내려야 한다. 두 지표는 정면으로 상충한다 —
       **키라인 .067 이 38px 에서 글리프 속을 파고들 때, 밝은 채움만이 안티에일리어싱 혼합 뒤에도
       110 을 넘긴다.** 그래서 '가장 어둡게 하되 속살 게이트를 깨지 않는' 자리를 찾아 굳힌 값이다
       (2026-08-20 UI 스트림이 `tools/sweep-emblem-step.js` 로 8조합을 실측해 고름).
       ⚠️ 값을 바꾸면 **반드시 두 자를 같이** 돌릴 것: `probe-emblem-core.js`(속살 ≥34%) 와
          `probe-skill-orb-ink.js`(잉크율·채도). 한쪽만 보면 반대쪽이 조용히 무너진다.
       📌 **`.30 → .24` 로 한 칸 내렸다 (2026-08-20 UI 스트림, 락 `icon-gen`).** 노브를 만진 게
          아니라 **천장이던 `meteor` 꼬리의 구성 오류를 고쳐 자리가 났다**(아래 `meteor` 주석 참조).
          전후 `sweep-emblem-step.js`: 종전엔 `.24` 가 최소속살 33.2%(`sk_meteor`)로 게이트를
          깼는데, 고친 뒤 **35.0%(`sk_voidLance`)로 통과**한다.
          실제 이득(캡처를 다시 굽고 잰 값): `probe-skill-orb-ink` 의 **ⓑ(검정 뺀 채움 채도)
          45.6% → 50.0%**, 원본과의 격차 -29.3%p → **-24.9%p**.
          ⚠️ 이 수치를 확인할 때는 **반드시 `node tools/shot-skills.js` 로 클론 캡처를 다시 구운 뒤**
             읽을 것 — 그 자는 커밋된 PNG 두 장을 맞대기만 해서 캡처가 낡으면 옛 수치를 조용히
             인쇄한다(이 세션이 거기 한 번 걸렸다. `tools/clone-fresh.js` 머리말 참조).
       🚨 **한 칸 더(`.18`)는 일부러 안 갔다 — 통과는 하지만 34.2% 로 게이트까지 0.2%p 다.**
          409px 실루엣에서 **1px** 이라, 글리프를 조금만 손봐도 곧장 빨개지는 값이다(제품값은
          여유가 있어야 한다). `.18` 을 쓰려면 먼저 새 천장 `sk_voidLance` 를 풀 것 —
          그건 `meteor` 같은 구성 오류가 아니라 **가늘고 긴 조형이라 둘레/넓이 비가 큰** 구조적
          천장이고, 대(.21)를 더 살찌우면 창이 몽둥이로 읽힌다(그쪽 주석의 경고). */
    G._EMBLEM_STEP = { top: 0.00, mid: -0.14, bot: -0.34, floorL: 116, gloss: 0.10, keyline: 0.067 };

    function emblem(ctx, S, color, pathFn, glow) {
        // ① 속성색 글로우 — 두 번 칠해 진하게. 밝은 오브에서 죽지 않도록 어두운 접지 그림자도 함께.
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = S * 0.05;
        ctx.shadowOffsetY = S * 0.02;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); pathFn(ctx, S); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = S * (glow || 0.12);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); pathFn(ctx, S); ctx.fill();
        ctx.beginPath(); pathFn(ctx, S); ctx.fill();
        ctx.restore();
        /* ② 본체 채움 — **평면 3단(계단식)**. (2026-08-20 UI 스트림, 락 `icon-gen`)
           종전엔 `#ffffff → _shade(color,.62) → _shade(color,.08)` 인 **부드러운 흰→색 그라디언트**
           였다. 두 가지가 걸렸다:
             ⓐ **화풍 위반** — 이 게임의 아이콘 화법은 `probe-icon-keyline` 머리말이 적어 둔 대로
                '순검정 키라인 + **평면** 채움'이고, 재화 8종은 이미 그렇게 고쳐졌다(코인 주석 참조).
                2026-08-20 확정 화풍(voxel+치비) ㉯㉰㉱ 도 **플랫/매트 · 제한 팔레트 · 계단식
                픽셀 베벨**을 못 박고 **부드러운 그라디언트를 명시적으로 폐기**한다.
                엠블럼 24종(스킬 18 + 기술 노드 6)만 옛 글로시 화법으로 남아 있었다.
             ⓑ **미결 ㉢ 의 정체** — 비평가 A#3·B#5 가 '글리프 채움이 흰색 지배'라 지적했고
                `probe-skill-orb-ink` 가 잉크 화소 평균 채도로 **원본 53.5% ↔ 클론 26.5%** 를 냈다.
                원인은 스킬 색이 아니라 **이 그라디언트의 위쪽 절반**이다(그 자가 재는 표본이
                오브 **위쪽**이라 흰 끝이 그대로 잡힌다) — 아래 ④ 흰 광택 덮개와 함께.
           단은 위→아래 밝음→기본→어둠, 경계는 **같은 오프셋을 두 번 주어 하드 컷**으로 낸다.
           🚨 **바닥단에 `_shade` 를 쓰지 말고 `_shadeFloor` 를 쓸 것** — `probe-emblem-core` 의
              속살은 **루마 ≥110** 이고 스킬 색 중 `#ef5350`(종말의 화룡)은 루마가 116 뿐이라,
              곱셈으로 어둡게 하면 바닥단이 통째로 속살에서 빠져 게이트(34%)를 깬다. 명도 바닥
              116 을 두면 어두운 단을 주면서도 속살이 산다. */
        ctx.beginPath(); pathFn(ctx, S);
        const K = G._EMBLEM_STEP;
        // `legacy: true` — **옛 글로시 화법 그대로**. 제품 경로에서는 절대 켜지 않는다.
        // `tools/shot-emblem-ab.js` 가 옛/새를 같은 페이지에서 나란히 굽기 위한 문(門)이다:
        // 노브만으로 흉내내면 부드러운 그라디언트를 재현할 수 없어 A/B 가 거짓 비교가 된다.
        if (K.legacy) {
            ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.9,
                [[0, '#ffffff'], [0.5, G._shade(color, 0.62)], [1, G._shade(color, 0.08)]]);
            ctx.fill();
        } else {
        const _top = G._shade(color, K.top), _mid = G._shade(color, K.mid), _bot = G._shadeFloor(color, K.bot, K.floorL);
        ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.9, [
            [0, _top], [0.40, _top],
            [0.40, _mid], [0.74, _mid],
            [0.74, _bot], [1, _bot],
        ]);
        ctx.fill();
        }
        /* ③ 키라인 — **순검정**, 원본 실측 비로. (2026-08-19 UI 스트림)
           종전엔 `_shade(color,-0.64)` 인 **색조 파생 어두운 색** + `lineWidth 0.038` 이었다.
           원본(shot-042120)의 스킬 오브는 전부 쿨다운 상태라 글리프가 어둡지만, 유일하게 읽히는
           번개 글리프는 **순검정 테**를 두르고 있다 — 이 게임의 아이콘 화법에 예외가 없다는 뜻이다.
           색조 파생 테는 밝은 등급색(노랑·연두)에서 갈색·올리브가 돼 테로 안 읽혔고, 두께도
           표시 37.6px 에서 1.4px 라 글로우에 묻혔다.
           ⚠️ **여기서 두께는 `ink()` 규약과 다르다** — `ink()` 는 칠하기 **전에** 그어 바깥 절반만
           남지만(보이는 띠 = lw/2), 여기는 칠한 **뒤에** 그어 **띠 전체가 보인다**(보이는 띠 = lw).
           원본 비(번개 글리프 테 2px / 글리프 세로 30px ≈ 6.7%) = lw 0.067.
           🚨 **이 값은 모티프 경로를 먼저 살찌운 뒤에야 쓸 수 있다.** 종전 경로들은 lw 0.038 을
           전제로 그려져 자루 폭이 0.06 밖에 안 됐고, 테가 양쪽에서 0.0335 씩 먹어 들어와
           **속살이 안 남고 검은 막대기**가 됐다(한 번 넣었다 되돌린 이력이 있다 — 검은 날이
           통째로, 창은 흰 촉만 남은 성냥개비). 2026-08-19 UI 스트림에서 **가는 부재를 전부
           ≥0.12 로 키우고**(검 자루·날받이, 도끼 자루, 창 대·목받이, 모래시계 판·목, 화살 깃,
           메가폰 물부리, 운석 꼬리, 번개 윗변) 원본 비 0.067 로 올렸다.
           ⚠️ **이 값을 다시 올리거나 모티프를 가늘게 되돌리기 전에 `tools/probe-emblem-core.js` 를
              돌릴 것** — 경계 검정 비율(`probe-icon-keyline`)은 테를 두껍게 할수록 **좋아지기만 해서**
              '테가 그림을 다 먹었다'를 절대 못 잡는다. 속살 검사기가 그 반대 방향 지표다. */
        ctx.beginPath(); pathFn(ctx, S);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        // 두께는 노브로 뺀다 — `probe-emblem-core` 가 **음성 대조**(일부러 테를 살찌워 속살
        // 검사가 실제로 FAIL 하는지)를 돌리기 위한 자리다. 제품 기본값은 원본 실측 비 0.067.
        // 🚨 `??` 일 것 — `||` 이면 **`keyline: 0` 이 조용히 기본값 .067 로 되돌아간다**(2026-08-20
        //    UI 스트림이 음성 대조 중 발견). `probe-emblem-core` 의 음성 대조는 테를 **살찌우는**
        //    쪽(0.16)이라 이 구멍에 안 걸렸고, '테를 없애고 재 보기'를 하려던 이 세션이
        //    **아무것도 안 변하는 결과**를 받아 하마터면 "AA 링이 원인이 아니다"를 엉뚱한 근거로
        //    결론지을 뻔했다(고치고 다시 재니 실제로는 잉크율 55.1% → 28.8% 로 크게 움직인다).
        ctx.lineWidth = S * (K.keyline ?? 0.067);
        ctx.strokeStyle = '#000';
        ctx.stroke();
        /* ④ 상단 하이라이트 — **하드 컷 한 단**(클립). (2026-08-20 UI 스트림)
           종전엔 `rgba(255,255,255,.9) → 투명` 을 글리프 위 절반(0.08S~0.54S)에 덮는 **부드러운
           흰 광택**이었다. ㉢('흰색 지배')의 절반은 ② 그라디언트가 아니라 **이 덮개**다 —
           맨 위가 알파 .9 라 어떤 색을 깔아도 그 자리는 사실상 순백이 된다(그래서 채도 지표가
           원본의 절반으로 나왔다). 화풍 ㉯ 도 '글로시 광택 폐기'를 못 박는다.
           대신 **위 22% 에 알파 .22 짜리 평면 띠 하나**만 둔다 — 그라디언트가 아니라 하드 컷이라
           voxel 의 '윗면이 밝다' 읽기는 남기면서 흰색이 색을 덮지 않는다. 알파를 올리거나
           그라디언트로 되돌리면 ㉢ 이 그대로 재발한다. */
        ctx.save();
        ctx.beginPath(); pathFn(ctx, S); ctx.clip();
        if (K.legacy) {
            ctx.fillStyle = G._lin(ctx, 0, S * 0.12, 0, S * 0.52,
                [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(0, S * 0.08, S, S * 0.46);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,' + K.gloss + ')';
            ctx.fillRect(0, S * 0.08, S, S * 0.22);
        }
        ctx.restore();
    }

    // ---- 모티프 경로(정규화 0..1 좌표, beginPath 없이 서브패스만) ----
    const P = {
        sword(ctx, S) {                                  // 강타 — 위로 선 검
            // 부재 폭은 전부 ≥.12 — 키라인 .067 이 양쪽에서 .0335 씩 먹고도 속살이 남아야 한다
            // (종전 자루 .06·날받이 .07 은 테만 두르면 통째로 검은 막대기가 됐다. probe-emblem-core.js 참조)
            ctx.moveTo(x(.5, S), y(.05, S)); ctx.lineTo(x(.625, S), y(.30, S));
            ctx.lineTo(x(.59, S), y(.575, S)); ctx.lineTo(x(.41, S), y(.575, S));
            ctx.lineTo(x(.375, S), y(.30, S)); ctx.closePath();
            ctx.moveTo(x(.24, S), y(.575, S)); ctx.lineTo(x(.76, S), y(.575, S));
            ctx.lineTo(x(.76, S), y(.715, S)); ctx.lineTo(x(.24, S), y(.715, S)); ctx.closePath();
            ctx.moveTo(x(.425, S), y(.715, S)); ctx.lineTo(x(.575, S), y(.715, S));
            ctx.lineTo(x(.575, S), y(.85, S)); ctx.lineTo(x(.425, S), y(.85, S)); ctx.closePath();
            ctx.moveTo(x(.5, S) + S * .09, y(.87, S)); ctx.arc(x(.5, S), y(.87, S), S * .09, 0, Math.PI * 2);
        },
        axe(ctx, S) {                                    // 처형 — 전투 도끼
            // 🚨 **날과 자루를 별개 서브패스로 그리지 말 것** — `emblem()` 은 경로 전체에 획을 긋기
            //    때문에 겹친 자루의 윗변이 **날 한가운데 검은 사각형**으로 남는다. 그 사각형 때문에
            //    도끼가 '버섯/망치'로 읽혔다(2026-08-19 UI 스트림 실측 — 그 전부터 있던 결함).
            //    그래서 자루와 날을 **하나의 닫힌 윤곽**으로 합쳐 그린다. 내부 획이 아예 없다.
            // ⚠️ 안쪽에 V 홈을 판 쌍날로 되돌리지도 말 것 — 홈은 96px 에서 통째로 검정에 먹힌다.
            // 밑면은 **오목**해야 도끼로 읽힌다 — 직선으로 이으면 자루에 얹힌 나무망치가 된다
            //   (2026-08-19 실측: 밑면을 곧게 그은 판은 96px 에서 T 자 해머로 보였다).
            ctx.moveTo(x(.4225, S), y(.92, S));
            ctx.lineTo(x(.4225, S), y(.42, S));                          // 자루 왼쪽 → 날 목
            ctx.quadraticCurveTo(x(.27, S), y(.40, S), x(.09, S), y(.54, S));   // 오목한 밑면 — 뿔이 처진다
            ctx.lineTo(x(.07, S), y(.34, S));                            // 왼쪽 뿔 — 두께 .20
            ctx.quadraticCurveTo(x(.5, S), y(-.08, S), x(.93, S), y(.34, S));   // 등 곡선
            ctx.lineTo(x(.91, S), y(.54, S));                            // 오른쪽 뿔
            ctx.quadraticCurveTo(x(.73, S), y(.40, S), x(.5775, S), y(.42, S));
            ctx.lineTo(x(.5775, S), y(.92, S)); ctx.closePath();
        },
        whirl(ctx, S) {                                  // 회오리 베기 — 굽은 베기 날 3엽 (fx ring)
            /* 🚨 종전 '2엽'은 안팎 두 호가 **거의 닫힌 고리**를 만들고 가운데가 뻥 뚫려 있어서
               38px 로 줄이면 **몬스터볼/로딩 스피너**로 읽혔다(비평가 '범용 클립아트' 지적의
               대표 사례). 고리를 끊고 서로 닿지 않는 날 3장을 120°로 돌려 놓으면 빈 가운데가
               '회전축'이 되고 날 끝이 '베기'를 만든다.
               ⚠️ **날은 뚱뚱해야 한다.** 첫 판은 얇은 초승달이라 `probe-emblem-core` 속살이
                  **8.7%**(문턱 34%)까지 떨어졌다 — 38px 에서 키라인이 날을 통째로 먹어 검은
                  꼬부랑선 세 개가 됐다. 바깥은 뭉툭한 호로 두껍게 열고 안쪽으로만 뾰족하게 좁힌다. */
            const cx = .5 * S, cy = .5 * S, ro = .46 * S, ri = .10 * S;
            const P2 = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
            const D = Math.PI / 180;
            for (let k = 0; k < 3; k++) {
                const a0 = k * 120 * D;
                const [sx, sy] = P2(ri, a0 - 14 * D);                      // 안쪽 뾰족한 끝(축 근처)
                ctx.moveTo(sx, sy);
                // 앞날(베는 쪽) — 축에서 바깥으로 **거의 곧게** 뻗는다. 여기가 굽으면 부채가 된다.
                ctx.quadraticCurveTo(...P2(ro * .62, a0 + 2 * D), ...P2(ro, a0 + 30 * D));
                // 바깥 끝 — 짧은 호로 뭉툭하게(뾰족하게 닫으면 38px 에서 키라인이 먹는다)
                ctx.arc(cx, cy, ro, a0 + 30 * D, a0 + 62 * D, false);
                // 뒷날 — 회전 방향으로 **크게 휘어** 축으로 감겨 든다. 이 곡률이 '회전'을 만든다.
                ctx.quadraticCurveTo(...P2(ro * .52, a0 + 84 * D), sx, sy);
                ctx.closePath();
            }
        },
        // 응급 처치 — 십자. **가는 십자**로(잉크 면적이 줄어 덩어리 무리와 안 겹친다).
        // 팔 폭 .20 은 키라인 .067 이 양쪽에서 .0335 씩 먹고도 속살이 남는 하한 근처다 —
        // 더 가늘게 하면 `probe-emblem-core` 가 곧장 걸린다(검은 막대기 회귀).
        /* 🚨 **팔은 그대로 두고 길이만 늘렸다 (.15~.85 → .06~.94, 2026-08-20 UI 스트림, 락 `icon-gen`).**
           '가늘게' 는 맞았지만 **짧기까지 해서** 초신성(`burst`, 세로 .70) 안에 통째로 들어앉았다
           (IoU 0.627). 세로를 .88 로 늘리면 십자의 위아래 끝이 별의 세로 지름(.70) **밖으로**
           나가 포함이 깨진다 — 팔 폭(.20)은 손대지 않았으니 `probe-emblem-core` 의 하한과 무관하다.
           📌 **작게 만드는 게 늘 안전한 게 아니다** — 남보다 작으면 '품기는 쪽'이 돼서 IoU 가 되레
              오른다. 갈라야 할 상대보다 **한 축이라도 길게** 두는 편이 낫다. */
        cross(ctx, S) {
            const lo = .06, hi = .94, a = .40, b = .60;
            ctx.moveTo(x(a, S), y(lo, S)); ctx.lineTo(x(b, S), y(lo, S)); ctx.lineTo(x(b, S), y(a, S));
            ctx.lineTo(x(hi, S), y(a, S)); ctx.lineTo(x(hi, S), y(b, S)); ctx.lineTo(x(b, S), y(b, S));
            ctx.lineTo(x(b, S), y(hi, S)); ctx.lineTo(x(a, S), y(hi, S)); ctx.lineTo(x(a, S), y(b, S));
            ctx.lineTo(x(lo, S), y(b, S)); ctx.lineTo(x(lo, S), y(a, S)); ctx.lineTo(x(a, S), y(a, S)); ctx.closePath();
        },
        flame(ctx, S) {                                  // 화염구 — 흔들리는 불꽃 (fx explode)
            /* 🚨 종전 모양은 **좌우 대칭 물방울**이라 38px 에서 불이 아니라 **나뭇잎**으로 읽혔다
               (비평가 '범용 클립아트' 지적). 불로 읽히게 만드는 건 색이 아니라 **비대칭**이다 —
               한쪽 옆구리를 안으로 파 S 자로 꺾고(바람에 눕는 결), 끝을 한쪽으로 기울인다.
               밑동은 넓고 둥글게 둬야 '떠 있는 구체'가 아니라 '타오르는 덩어리'가 된다.
               ⚠️ 곁불꽃을 **따로 그리지 말 것** — `emblem()` 은 경로 전체에 획을 그어서 겹친
                  서브패스의 이음매가 안쪽에 검은 줄로 남는다(도끼 날에서 밟은 그 함정).
                  대신 밑동 왼쪽에 **홈 하나**를 파 두 갈래처럼 보이게 한다.
               🚨 **가로로 좁혔다 (2026-08-20 UI 스트림, 락 `icon-gen`).** 종전 폭 .72(38px 표시에서
                  27px)는 불치고 너무 뚱뚱해서 **성역의 바닥 서클을 통째로 삼켰다** — 성역 잉크의
                  대부분이 이 밑동 안에 들어앉아 IoU **0.682 로 153쌍 중 최악**이었다.
                  📌 **한쪽이 다른 쪽을 품으면 작은 쪽을 줄일수록 IoU 가 되레 오른다**(교집합은 그대로,
                     합집합만 준다 — 성역을 줄였더니 0.673 → 0.682 로 올라간 게 그 증거다).
                     그러면 **품는 쪽을 좁혀** 서로 삐져나오게 만드는 게 답이다.
                  ⚠️ **세로로 줄이지 말 것** — 불의 정체는 '위로 솟는 세로 조형'이라, 높이를 깎으면
                     넓고 낮은 무리(초신성·함성·화룡)로 걸어 들어간다. 폭만 줄인다.
                  ⚠️ 여기 `scale` 은 **경로 좌표만** 비균등으로 눌린다 — 획(키라인)은 `emblem()` 이
                     변환을 되돌린 뒤에 긋기 때문에 두께가 한쪽으로 늘어나지 않는다. */
            ctx.save(); ctx.translate(.5 * S, 0); ctx.scale(.84, 1); ctx.translate(-.5 * S, 0);
            ctx.moveTo(x(.585, S), y(.04, S));                                        // 끝(오른쪽으로 기운다)
            ctx.bezierCurveTo(x(.60, S), y(.30, S), x(.86, S), y(.40, S), x(.85, S), y(.63, S));
            ctx.bezierCurveTo(x(.84, S), y(.86, S), x(.68, S), y(.97, S), x(.48, S), y(.96, S));
            ctx.bezierCurveTo(x(.27, S), y(.95, S), x(.13, S), y(.81, S), x(.14, S), y(.61, S));
            ctx.bezierCurveTo(x(.15, S), y(.47, S), x(.26, S), y(.40, S), x(.30, S), y(.28, S));  // 왼쪽 밑동 홈(두 갈래 느낌)
            ctx.bezierCurveTo(x(.36, S), y(.44, S), x(.44, S), y(.47, S), x(.47, S), y(.40, S));
            ctx.bezierCurveTo(x(.51, S), y(.30, S), x(.48, S), y(.17, S), x(.585, S), y(.04, S));
            ctx.closePath();
            ctx.restore();
        },
        flame3(ctx, S) {                                 // 용의 숨결 — 삼중 불꽃 부채
            const tongue = (cx, top, w, h) => {
                ctx.moveTo(x(cx, S), y(top, S));
                ctx.bezierCurveTo(x(cx + w, S), y(top + h * .5, S), x(cx + w * .6, S), y(top + h, S), x(cx, S), y(top + h + .04, S));
                ctx.bezierCurveTo(x(cx - w * .6, S), y(top + h, S), x(cx - w, S), y(top + h * .5, S), x(cx, S), y(top, S));
                ctx.closePath();
            };
            tongue(.5, .06, .24, .72);
            tongue(.28, .30, .16, .5);
            tongue(.72, .30, .16, .5);
        },
        arrow(ctx, S) {                                  // 관통 사격 — 화살
            // 자루 .16 · 촉 폭 .44. 깃은 종전 밑변 .06 짜리 뾰족 삼각이라 테를 두르면 통째로 사라졌다
            // → 밑변 .17 의 통통한 사각 깃으로 바꿨다(속살 26.5% → 회복).
            ctx.moveTo(x(.5, S), y(.06, S)); ctx.lineTo(x(.72, S), y(.35, S)); ctx.lineTo(x(.58, S), y(.35, S));
            ctx.lineTo(x(.58, S), y(.80, S)); ctx.lineTo(x(.42, S), y(.80, S)); ctx.lineTo(x(.42, S), y(.35, S));
            ctx.lineTo(x(.28, S), y(.35, S)); ctx.closePath();
            ctx.moveTo(x(.42, S), y(.66, S)); ctx.lineTo(x(.42, S), y(.83, S));
            ctx.lineTo(x(.24, S), y(.95, S)); ctx.lineTo(x(.25, S), y(.76, S)); ctx.closePath();
            ctx.moveTo(x(.58, S), y(.66, S)); ctx.lineTo(x(.58, S), y(.83, S));
            ctx.lineTo(x(.76, S), y(.95, S)); ctx.lineTo(x(.75, S), y(.76, S)); ctx.closePath();
        },
        /* 🚨 **위로 22.5° 기울였다 (2026-08-20 UI 스트림, 락 `icon-gen`).**
           종전 메가폰은 **정확히 가로축에 누워** 있었는데, 하필 초신성(`burst`) 8각별이 가장
           멀리 뻗는 방향이 그 가로축(외곽 꼭짓점 0°·90°)이다. 그래서 함성 잉크의 **88%가
           초신성 안에 통째로 들어앉아** IoU **0.658 로 153쌍 중 최악**이었다.
           📌 **8각별의 골(안쪽 꼭짓점)은 22.5° 에 있다** — 긴 조형을 그 방향으로 눕히면 양 끝이
              골 밖으로 삐져나와 포함 관계가 깨진다. 별과 겹치는 다른 조형에도 같은 수가 통한다.
           (메가폰을 비스듬히 드는 건 도상적으로도 자연스럽다 — 읽힘 손해가 없는 자리다.) */
        horn(ctx, S) {                                   // 전투의 함성 — 메가폰 + 음파
            ctx.save(); ctx.translate(.5 * S, .5 * S); ctx.rotate(-Math.PI * .125); ctx.translate(-.5 * S, -.5 * S);
            ctx.moveTo(x(.20, S), y(.40, S)); ctx.lineTo(x(.60, S), y(.18, S));
            ctx.lineTo(x(.60, S), y(.82, S)); ctx.lineTo(x(.20, S), y(.60, S)); ctx.closePath();
            ctx.moveTo(x(.08, S), y(.425, S)); ctx.lineTo(x(.20, S), y(.40, S));      // 물부리 폭 .08 → .12
            ctx.lineTo(x(.20, S), y(.60, S)); ctx.lineTo(x(.08, S), y(.575, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.30, S)); ctx.lineTo(x(.86, S), y(.24, S)); ctx.lineTo(x(.80, S), y(.40, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.70, S)); ctx.lineTo(x(.86, S), y(.76, S)); ctx.lineTo(x(.80, S), y(.60, S)); ctx.closePath();
            ctx.restore();
        },
        meteor(ctx, S) {                                 // 메테오 — 꼬리 달린 운석
            const cx = .62, cy = .46, r = .21;
            ctx.moveTo(x(cx, S) + r * S, y(cy, S)); ctx.arc(x(cx, S), y(cy, S), r * S, 0, Math.PI * 2);
            /* 🚨 **꼬리는 '폭 파라미터'가 폭이 아니었다 — 그래서 살찌워도 안 들었다
                  (2026-08-20 UI 스트림, 락 `icon-gen`).**
                  옛 구성은 A=(sx,sy) → B=(sx-len, sy-len) → C=B+(w, 1.6w) 세 점 삼각형이었다.
                  축은 45°(-1,-1)/√2 인데 **오프셋 (w, 1.6w) 는 그 축과 거의 나란해서**,
                  축에 대한 실제 수직 두께는 `w` 의 **42%(0.424w)** 밖에 안 됐다:
                    w .12 → 수직폭 .0509 · w .11 → .0467.
                  키라인(lw .067)이 양쪽에서 .0335 씩 먹으므로 **필요한 최소 두께가 .067** 이다.
                  즉 **세 꼬리는 어느 지점에서도 속살이 음수** — 통째로 검정이었다.
                  검산: 38px 에서 원(r .21)만의 속살 141px ≈ 실측 속살 149px 인데
                  실루엣은 413px 이다. 나머지 213px 이 전부 '검기만 한' 꼬리였다.
                  ⚠️ 앞 세션이 w 를 .15~.16 으로 넓혔다가 속살이 36.1% → 34.9% 로 **떨어진** 것도
                     이 때문이다 — 오프셋의 **축 방향 성분(1.6w)** 이 꼬리를 더 길게 늘여
                     검은 실루엣(분모)만 키웠고, 수직 두께는 .068 로 겨우 문턱에 닿았을 뿐이다.
                  📌 그래서 고칠 곳은 폭 값이 아니라 **구성**이다. 길이·개수·자리는 그대로 두고
                     (조형을 안 바꾼다) 오프셋을 **진짜 수직**(1,-1)/√2 으로 세워 사다리꼴로 만든다.
                     `wNear`/`wFar` 는 이제 **축에 수직인 실제 두께**다 — .067 을 넘겨야 속살이 산다.
                  📌 세 꼭짓점이 전부 운석 원(중심 .62/.46 · r .21) **안에** 있다는 점을 쓴다:
                     가까운 쪽을 두껍게 해도 원에 덮여 **겉모습은 안 변하고**, 꼬리가 원을 빠져나오는
                     자리에서 이미 두께를 갖고 나온다(옛 삼각형은 그 자리 두께가 .022 였다). */
            const SQ = Math.SQRT1_2;                         // 축 (-1,-1)/√2 에 대한 수직 = (1,-1)/√2
            const streak = (sx, sy, len, wNear, wFar) => {
                const ex = sx - len, ey = sy - len, hn = wNear / 2, hf = wFar / 2;
                ctx.moveTo(x(sx + SQ * hn, S), y(sy - SQ * hn, S));
                ctx.lineTo(x(ex + SQ * hf, S), y(ey - SQ * hf, S));
                ctx.lineTo(x(ex - SQ * hf, S), y(ey + SQ * hf, S));
                ctx.lineTo(x(sx - SQ * hn, S), y(sy + SQ * hn, S)); ctx.closePath();
            };
            streak(cx - .12, cy - .10, .30, .10, .16);
            streak(cx - .16, cy + .04, .24, .09, .14);
            streak(cx - .02, cy - .17, .22, .09, .14);
        },
        bolt(ctx, S) {                                   // 낙뢰 — 번개
            /* 🚨 **가로로 벌렸다 (×1.45, 2026-08-20 UI 스트림, 락 `icon-gen`).**
               종전 번개는 폭 20px·높이 38px 짜리 **가느다란 세로 조형**이라, 20px 로 줄이면
               신의 창(16×37)과 구분이 안 됐다(IoU **.613 — 20px 기준 7위**. 38px 에서는 .579 로
               한참 아래라 **38px 만 보던 자에는 안 잡히던 쌍**이다).
               번개는 지그재그의 **꺾임 폭**이 정체라 가로로 벌리면 되레 번개다워진다 — 창은
               벌릴 수 없으니(벌리면 십자가 된다, `spear` 주석의 실패 기록) 번개 쪽을 벌렸다.
               ⚠️ `scale` 은 경로 좌표만 누른다 — 키라인은 `emblem()` 이 변환 밖에서 긋는다.
                  꺾임이 완만해지며 부재의 수직 두께가 **늘어** 속살에도 유리하다(실측 39.2% → 상승). */
            ctx.save(); ctx.translate(.5 * S, 0); ctx.scale(1.45, 1); ctx.translate(-.5 * S, 0);
            ctx.moveTo(x(.56, S), y(.04, S)); ctx.lineTo(x(.28, S), y(.53, S)); ctx.lineTo(x(.47, S), y(.53, S));
            ctx.lineTo(x(.34, S), y(.96, S)); ctx.lineTo(x(.74, S), y(.39, S)); ctx.lineTo(x(.53, S), y(.39, S));
            ctx.lineTo(x(.68, S), y(.04, S)); ctx.closePath();   // 윗변 .08 → .12
            ctx.restore();
        },
        // 축복 — 4각 반짝임. **작게 + 좌상으로 치우치게**(크기·위치로 나머지 셋과 갈린다).
        // 위성 두 알은 그대로 두되 바깥으로 조금 더 밀어 실루엣이 대각으로 흐르게 했다.
        sparkle(ctx, S) {
            const cx = .44, cy = .43, R = .35, c = .09;
            ctx.moveTo(x(cx, S), y(cy - R, S));
            ctx.quadraticCurveTo(x(cx + c, S), y(cy - c, S), x(cx + R, S), y(cy, S));
            ctx.quadraticCurveTo(x(cx + c, S), y(cy + c, S), x(cx, S), y(cy + R, S));
            ctx.quadraticCurveTo(x(cx - c, S), y(cy + c, S), x(cx - R, S), y(cy, S));
            ctx.quadraticCurveTo(x(cx - c, S), y(cy - c, S), x(cx, S), y(cy - R, S)); ctx.closePath();
            const sm = (mx, my, r) => {
                ctx.moveTo(x(mx, S), y(my - r, S));
                ctx.quadraticCurveTo(x(mx + r * .28, S), y(my - r * .28, S), x(mx + r, S), y(my, S));
                ctx.quadraticCurveTo(x(mx + r * .28, S), y(my + r * .28, S), x(mx, S), y(my + r, S));
                ctx.quadraticCurveTo(x(mx - r * .28, S), y(my + r * .28, S), x(mx - r, S), y(my, S));
                ctx.quadraticCurveTo(x(mx - r * .28, S), y(my - r * .28, S), x(mx, S), y(my - r, S)); ctx.closePath();
            };
            sm(.81, .24, .095); sm(.23, .81, .07);
        },
        /* 신성한 가호 — 방패. (경로 이름은 `shield` 지만 쓰는 쪽은 `divineShield` 다. 성역은
           `sanctum` 을 쓴다 — 2026-08-20 이름 뒤바뀜을 고칠 때 갈렸다.)
           🚨 **좁고 길게 + 각지게** (2026-08-20 UI 스트림, 락 `icon-gen`).
              종전은 x .17~.83 · y .09~.93 의 **프레임을 채우는 중앙 둥근 덩어리**라
              `burst`·`sparkle`·`cross` 와 실루엣이 통째로 겹쳤다(IoU 최악 쌍 초신성↔가호 **0.761**).
              IoU 는 내부 무늬가 아니라 **덩어리의 가로세로비·크기·위치**로 갈리므로 안쪽을 아무리
              다듬어도 안 떨어진다 — 그래서 넷을 서로 다른 '자리'로 흩었다: 방패=좁고 길게,
              초신성=넓고 낮게, 축복=작게+치우치게, 응급 처치=가는 십자.
              곡선을 직선 꺾임으로 바꾼 건 확정 화풍 ㉲(모서리는 각지거나 픽셀-라운드)와도 맞다. */
        /* ⚠️ **어깨를 좁히다 못해 '총알'이 된 적이 있다 (2026-08-20, 같은 세션에서 되돌림).**
           IoU 를 떼려고 x .27~.73(폭 .46)까지 좁혔더니 A/B 시트에서 방패가 아니라 **탄두/묘비**로
           읽혔다 — 방패의 정체는 길이가 아니라 **넓은 어깨 + 아래로 모이는 삼각**이다.
           그래서 어깨는 되살리고(폭 .56) 길이만 늘려(.08~.95) 가로세로비 .64 로 갈랐다.
           초신성은 반대로 넓고 낮다(.94 × .70 = 1.34) — 둘은 이제 비(比)로 갈린다. */
        /* 🚫 **'가운데를 가로로 뚫어 IoU 를 떼자'는 시도는 실패했다 — 되돌렸다 (2026-08-20 UI 스트림).**
           이 방패는 bbox 채움 **80.5%** 로 18종 중 가장 꽉 찬 덩어리라, 속을 뚫으면 교집합만
           줄어들 거라 봤다. 세로 .14 짜리 가로 홈을 역방향으로 감아 넣었더니 **잉크가 676 → 675px,
           IoU 는 소수점 셋째 자리만 움직였다.**
           🔬 **왜 안 통했나 — 38px 표시에서는 `.14` 짜리 구멍이 아예 안 뚫린다.** `emblem()` 의
              키라인(lw .067)이 구멍의 **위·아래 변에서 각각 .0335 씩** 안쪽으로 먹으므로 남는
              빈 곳은 `.14 - .067 = .073`(2.8px)뿐이고, 그마저 글로우 번짐과 축소 AA 가 메운다.
           📌 **구멍으로 실루엣을 깎으려면 세로 폭이 최소 `.067 + 보이고 싶은 빈 폭`이어야 한다**
              (4px 을 남기려면 ≈ .17). 그만한 홈은 방패를 위아래 두 조각으로 갈라 놓아서
              '방패'가 아니라 '두 덩어리'가 된다 — 그래서 다른 길(상대 쪽을 늘려 포함을 깨기)로 갔다. */
        shield(ctx, S) {
            ctx.moveTo(x(.22, S), y(.08, S)); ctx.lineTo(x(.78, S), y(.08, S));
            ctx.lineTo(x(.78, S), y(.17, S)); ctx.lineTo(x(.97, S), y(.27, S)); ctx.lineTo(x(.78, S), y(.37, S));
            ctx.lineTo(x(.78, S), y(.42, S)); ctx.lineTo(x(.70, S), y(.70, S));
            ctx.lineTo(x(.5, S), y(.95, S)); ctx.lineTo(x(.30, S), y(.70, S));
            ctx.lineTo(x(.22, S), y(.42, S));
            ctx.lineTo(x(.22, S), y(.37, S)); ctx.lineTo(x(.03, S), y(.27, S)); ctx.lineTo(x(.22, S), y(.17, S));
            ctx.closePath();
        },
        halo(ctx, S) {                                   // 신성한 가호 — 후광 링 + 날개
            const cx = .5 * S, cy = .44 * S, ro = .35 * S, ri = .20 * S;
            ctx.moveTo(cx + ro, cy); ctx.arc(cx, cy, ro, 0, Math.PI * 2, false);
            ctx.moveTo(cx + ri, cy); ctx.arc(cx, cy, ri, 0, Math.PI * 2, true);
            ctx.moveTo(x(.30, S), y(.76, S)); ctx.lineTo(x(.5, S), y(.66, S)); ctx.lineTo(x(.42, S), y(.90, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.76, S)); ctx.lineTo(x(.5, S), y(.66, S)); ctx.lineTo(x(.58, S), y(.90, S)); ctx.closePath();
        },
        sanctum(ctx, S) {                                // 성역 — 바닥 룬 서클 + 솟는 빛기둥 (fx aura)
            /* 왜 새로 그렸나: `probe-skill-icon-distinct.js`(실루엣 IoU 153쌍 전수)로 재니
               **성역 ↔ 신성한 가호 0.782 로 18종 중 최악 쌍**이었다. 성역이 `shield`(둥근 방패),
               가호가 `halo`(둥근 고리)라 **둘 다 프레임을 채우는 중앙 정렬 둥근 덩어리**였고,
               고리의 원반이 방패 실루엣 안에 통째로 들어앉아 겹쳤다. 게다가 비평가 A#8 이
               "이름과 조형이 뒤바뀌었다"고 짚은 것도 정확히 이 쌍이다 — 방패는 이름이 방패인
               `divineShield`(가호) 쪽 것이다.
               📌 그래서 가호는 `shield` 로 되돌리고, 성역에는 **덩어리 계열 자체가 다른** 이 도안을
                  준다. IoU 는 내부 무늬가 아니라 **덩어리의 크기·위치·가로세로비**로 갈리므로,
                  '가운데 둥근 덩어리' 무리에서 빠져나오는 게 요점이다 — 이건 **아래로 눌린 납작한
                  타원 + 위로 솟은 세로 막대들**이라 그 무리와 겹칠 수가 없다.
               ⚠️ 빛기둥은 서클에 **닿지 않게** 띄운다. 서브패스가 겹치면 `emblem()` 이 경로 전체에
                  획을 그어 이음매가 안쪽에 검은 줄로 남는다(처형 아이콘에서 두 번 밟은 함정).
               🚨 **부재 두께는 눈으로 정하지 말 것 — `probe-emblem-core`(속살 검사기)로 정한다.**
                  첫 판은 고리 세로 두께 .085 · 막대 폭 .13 이었는데 속살이 **23.6%**(문턱 34%)로
                  떨어져 게이트가 빨개졌다. 키라인(lw .067)이 **모든 모서리에서 안쪽으로 .0335 씩**
                  먹으므로, 세로 두께 .085 짜리 고리는 속살이 .018 — 사실상 검은 테만 남는다.
                  지금 값(고리 세로 .148 · 막대 폭 .17)은 그 계산에서 역산한 것이다. 줄이지 말 것.
               🚨 **가운데 빛기둥을 다시 프레임 꼭대기까지 올리지 말 것 (2026-08-20 UI 스트림, 실측).**
                  첫 판은 가운데 기둥이 `top .04` 라 **아래 고리 + 중앙 세로 기둥으로 프레임을 통째로
                  덮었다.** 그러면 '중앙 정렬 덩어리' 무리에서 빠져나온 게 아니라 **그 무리를 전부
                  품어 버린다** — 실측: 화염구(잉크 736) 의 **94%(693px)가 성역 안에 들어앉아**
                  IoU 0.673 으로 18종 중 최악 쌍이 됐다(화살 세례 0.636 · 처형 0.624 · 아가리 0.623
                  도 같은 뿌리다. 넷 다 상위 10위 안이었다).
                  📌 **IoU 를 가르는 건 잉크의 총량이 아니라 '중앙 대역을 덮느냐'다** — 기둥을 짧게
                     잘라 잉크는 12% 밖에 안 줄었는데 최악 IoU 는 0.673 → 0.44 대로 내려갔다.
                     이 도안의 정체성(납작한 바닥 + 위로 솟는 빛)은 **기둥의 길이가 아니라 3단 계단**
                     으로 읽힌다. 세로 폭이 늘면 그 값어치를 다 잃는다. */
            const cx = .5 * S, cy = .765 * S;
            // 바닥 룬 서클 — 원근으로 눌린 납작한 고리(안쪽은 역방향으로 뚫는다)
            ctx.moveTo(cx + .47 * S, cy); ctx.ellipse(cx, cy, .47 * S, .195 * S, 0, 0, Math.PI * 2, false);
            ctx.moveTo(cx + .205 * S, cy); ctx.ellipse(cx, cy, .205 * S, .052 * S, 0, 0, Math.PI * 2, true);
            // 솟는 빛기둥 3 — 가운데가 가장 높다. 아래끝(.505)은 고리 윗변(.57)에 **안 닿게** 띄웠다.
            /* 기둥은 위로 갈수록 좁아진다(사다리꼴) — 기둥을 짧게 자른 뒤 직사각형으로 두니
               38px 에서 '빛기둥'이 아니라 **바닥에 놓인 블록 3개**로 읽혔다. 위를 좁히면 짧아도
               '솟는다'가 남는다. ⚠️ 꼭대기 폭(.11)은 키라인 .067 을 빼고 **.043 이 남는 하한**이라
               더 좁히지 말 것(`probe-emblem-core` 로 확인 — 좁히면 끝이 검게 막힌다). */
            const beam = (bx, top) => {
                ctx.moveTo(x(bx - .055, S), y(top, S)); ctx.lineTo(x(bx + .055, S), y(top, S));
                ctx.lineTo(x(bx + .085, S), y(.505, S)); ctx.lineTo(x(bx - .085, S), y(.505, S));
                ctx.closePath();
            };
            beam(.20, .335); beam(.50, .225); beam(.80, .335);
        },
        // 초신성 — 8각 폭발. **넓고 낮게**(가로세로비로 방패와 갈린다 — 위 `shield` 주석 참조).
        /* 🚨 **안쪽 반지름은 `.20/.15` 다 — 위아래로 다 막혀 있으니 값을 흔들기 전에 읽을 것
              (2026-08-20 UI 스트림, 락 `icon-gen`). 종전 `.235/.175` 에서 내린 값이다.**
           ⬇️ **왜 내렸나 — 이 별이 `종말의 화룡` 에게 85% 품히는 것을 푸는 유일한 축이었다.**
              `초신성 ↔ 화룡` .640 은 양쪽 크기 1위였다. 후보 6개를 `sweep` 으로 전수 실측했더니
              **회전은 전부 손해**였다(+22.5° → 38px .677 · −22.5° → 20px .686 · +11.25° → .670 ·
              6갈래 → .658 · 화룡을 +12° 돌리기 → `≥.60` 이 1 → 2). 📌 **별은 회전으로 안 갈린다** —
              `신의 창` 에서 통한 처방 ⓒ 가 여기서는 안 통하는데, 8각 별은 돌려도 여전히 별이고
              방향이 바뀌면 되레 다른 별무리(함성)와 문다. 갈래를 **깊게 파는 것**만 통했다.
              📏 전/후: 38px 최악 **.640 → .614** · `≥.55` **14 → 13** / 20px `≥.55` **17 → 15**
                 (`≥.60` 과 20px 최악은 유지). **오른 숫자 없음.**
           ⛔ **더 내리지 말 것 — `.20` 이 사실상 바닥이다(실측).** 옛 주석이 "`.17` → `.235` 로 올린
              값을 지키라"고 한 이유는 **갈래가 키라인에 먹히던 자리**라서다. 그 경고는 유효하고,
              지금 값은 그 벼랑 바로 위다: `probe-emblem-core` 속살이 **`.235` 에서 44.1% ↔ `.20` 에서
              36.3%** 다(게이트 34%). 즉 이 한 번의 인하가 **여유 10.1%p 중 7.8%p 를 먹었고 2.3%p 만
              남았다.** 대략 선형이라 `.18` 이면 게이트를 깬다. 🚨 **이 값을 만지면 `probe-emblem-core`
              를 반드시 같이 돌릴 것**(잉크도 587 → 545px 로 줄었다). */

        burst(ctx, S) {
            const cx = .5 * S, cy = .5 * S, N = 8;
            const RX = .47 * S, RY = .35 * S, rx = .20 * S, ry = .15 * S;
            for (let i = 0; i < N * 2; i++) {
                const a = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2;
                const px = cx + Math.cos(a) * (i % 2 ? rx : RX), py = cy + Math.sin(a) * (i % 2 ? ry : RY);
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
        },
        spear(ctx, S) {                                  // 공허의 창 / 신의 창 — 창(세로)
            // 종전 대(.06)·목받이(.08) 가 이 파일에서 가장 가는 부재였다 — 키라인 .045 에서도
            // 속살이 28%(sk_voidLance)까지 떨어져 '흰 촉만 남은 성냥개비'로 읽혔다. 대 .13 · 목받이 .12.
            /* 🚨 **한 번 더 살찌웠다 (대 .16 → .21, 2026-08-20 UI 스트림, 락 `icon-gen`).**
               이 창은 **엠블럼 24종 전체의 천장**이었다: `sweep-emblem-step.js` 로 평면 3단 채움의
               밝기를 훑으면 8조합 **전부에서** 최소 속살을 무는 종이 언제나 `sk_voidLance` 였고,
               그 한 종 때문에 제품값을 `.30/.05/-.24` 보다 한 칸도 더 어둡게(=채도 있게) 못 내렸다
               (한 칸 어두운 `.24` 에서 34.8% → 32.0% 로 게이트 34 를 깬다).
               즉 **노브가 아니라 이 경로가 병목**이라, 나머지 23종의 채도를 이 창 하나가 잡고 있었다.
               ⚠️ 더 살찌우지는 말 것 — 대 폭이 촉 폭(.32)에 가까워지면 창이 아니라 **몽둥이**로 읽힌다. */
            /* 🚨 **여기서 '대만' 더 살찌우지 말 것 — 대신 전체를 같은 비로 키웠다
                  (2026-08-20 UI 스트림, 락 `icon-gen`).**
               `sk_voidLance` 는 `sk_meteor` 를 고친 뒤 24종의 새 천장이 됐고, 스윕의 가장 깊은
               조합(`top 0 / mid -.14 / bot -.34 / gloss .10` — 채도가 제일 높다)에서 최소속살
               33.5% 로 게이트 34 에 **0.5%p** 모자란 유일한 종이었다.
               ⚠️ 이 종이 무는 이유는 `meteor` 같은 구성 오류가 아니라 **구조**다: 가늘고 길어
                  둘레/넓이 비가 크고, 키라인은 **둘레에 비례해** 속을 판다(실루엣 = 경로를 .0335
                  바깥으로 부풀린 것 · 속살 = .0335 안으로 깎은 것). 그래서 길이를 줄이거나
                  **폭을 키워야** 하는데, 대(帶)만 굵히면 앞 주석의 경고대로 창이 몽둥이가 된다.
               📌 그래서 **셋을 같은 비로 함께** 키우고, 남는 넓이를 **촉의 길이**로 벌었다:
                  촉 `.04~.36`(길이 .32 · 폭 .32) → **`.05~.43`(길이 .38 · 폭 .33)**, 목받이·대를
                  그만큼 내리고 대는 .21 → .23 · 끝을 .95 → .97(프레임 여백을 속살 있는 부재로 채운다).
               🚨 **'대만 굵히기'와 '촉까지 넓히기' 둘 다 해 보고 세 번째 안을 골랐다 — 수치가 아니라
                  읽힘이 갈랐다.** 촉을 폭으로만 넓힌 안(`.32~.68` = 폭 .36, 길이는 그대로)은 속살이
                  거의 같게 나왔지만(41.1% vs 41.6%) A/B 시트에서 **손전등/횃불로 읽혔다** —
                  촉이 길이보다 넓어지면 '날'이 아니라 '머리통'이 된다. **길이로 번 안이 같은 속살에
                  창으로 읽힌다.** 📌 교훈: 속살은 둘레/넓이 비만 보므로 **넓이를 폭으로 벌든 길이로
                  벌든 수치는 비슷하다 — 그러면 고르는 기준은 읽힘이어야 한다.** */
            /* 🚨 **이 경로를 좌우로 벌려 `시간 왜곡` 과 갈라 보려 하지 말 것 — 두 번째 실패다
                  (2026-08-20 UI 스트림, 락 `icon-gen`. 대신 `SK.godspear` 의 **회전**으로 갈랐다).**
               문제: `시간 왜곡 ↔ 신의 창` .630 은 **포함**이었다 — 창 잉크의 88%가 모래시계 안이다.
               화소로 갈라 보니 원인이 분명했다: **창이 38px 에서 폭 12px 짜리 민 세로 막대 하나**이고
               (촉 .33 · 목받이 .31 · 대 .23 이 키라인 .067 을 먹고 나면 전부 12px 로 수렴한다)
               **모래시계의 잘록한 허리도 정확히 12px** 이라 통째로 삼켜진다.
               🚫 **시도해서 되돌린 것 — 목받이 좌우 모서리에 뒤로 34° 젖힌 날개촉 2장**(`wingspear`
                  라는 별도 모티프로 갈라서 `voidLance` 는 안 건드리게 하고 얹었다). 노린 쌍은 확실히
                  풀렸다(**.630 → .503**). **그런데 세 숫자가 전부 올랐다**:
                  38px 최악 **.640 → .721** · `≥.60` 2 → 3 · `≥.55` 17 → 19 (20px 도 같은 방향).
                  범인은 `화염구`(**.721**)와 `응급 처치`(.671) 였다 — **가운데가 불룩한 실루엣**은
                  이 18종에서 가장 붐비는 무리(불꽃·폭발·방패)라, 좌우로 벌리는 순간 그리로 걸어
                  들어간다. 📌 **십자를 피하려고 날개를 아래로 젖혔더니 십자 대신 불꽃이 됐다** —
                  앞 세션의 '목받이를 벌렸더니 응급 처치와 .691' 과 **같은 함정의 다른 얼굴**이다.
               📌 **교훈: 세로로 긴 조형을 좌우로 벌려 푸는 길은 이 세트에서 거의 항상 손해다.**
                  가운데 불룩한 자리는 이미 만원이다. 남은 축은 **회전**이었고 그게 통했다(아래).
               ⚠️ 되돌릴 때 `probe-skill-fx-name-icon.js` 의 `ALLOW.spear` 도 같이 되돌렸다 —
                  모티프를 새로 만들면 그 자의 허용 목록에 등록해야 `조용히 sparkle 로 떨어진다`. */
            ctx.moveTo(x(.5, S), y(.05, S)); ctx.lineTo(x(.665, S), y(.24, S));
            ctx.lineTo(x(.59, S), y(.43, S)); ctx.lineTo(x(.41, S), y(.43, S));
            ctx.lineTo(x(.335, S), y(.24, S)); ctx.closePath();   // 곡선 촉은 96px 에서 '총알'로 읽혔다 → 각진 창날
            ctx.moveTo(x(.345, S), y(.41, S)); ctx.lineTo(x(.655, S), y(.41, S));
            ctx.lineTo(x(.61, S), y(.54, S)); ctx.lineTo(x(.39, S), y(.54, S)); ctx.closePath();
            ctx.moveTo(x(.385, S), y(.52, S)); ctx.lineTo(x(.615, S), y(.52, S));
            ctx.lineTo(x(.615, S), y(.97, S)); ctx.lineTo(x(.385, S), y(.97, S)); ctx.closePath();
        },
        /* ---- 연출(fx)에 맞춘 모티프 5종 (`skill-name-icon-match-fx`, 사용자 지시 2026-08-19) ----
           "스킬 이펙트에 어울리는 이름과 스킬 아이콘으로 바꾸고." 아래 5개는 **연출이 이미 전용으로
           갈려 있는데 아이콘만 옛 공유 연출 시절 그림**이라 이름·아이콘만 봐선 뭐가 나오는지
           알 수 없던 자리다. 부재 폭은 여기서도 ≥.12 규약을 지킨다(키라인 .067 이 양쪽 .0335). */
        slashx(ctx, S) {                                 // 연속 참격 — 엇갈린 초승달 2줄 (fx slashArcs)
            // 검 한 자루로는 '참격이 여러 번 지나간다'가 안 읽힌다. 초승달 띠는 **가운데가 두껍고
            // 끝이 뾰족**해야 벤 자국이다 — 굵기가 일정한 호는 갈고리로 읽힌다(3D 쪽 함정 기록과 같은 결).
            const arc = (x0, y0, x1, y1, cxO, cyO, cxI, cyI) => {
                ctx.moveTo(x(x0, S), y(y0, S));
                ctx.quadraticCurveTo(x(cxO, S), y(cyO, S), x(x1, S), y(y1, S));
                ctx.quadraticCurveTo(x(cxI, S), y(cyI, S), x(x0, S), y(y0, S));
                ctx.closePath();
            };
            arc(.05, .56, .83, .07, .33, .02, .55, .47);   // 위를 지나간 참격 (중앙 두께 .25)
            arc(.17, .95, .95, .46, .45, .41, .67, .86);   // 엇갈려 한 번 더 (교차시키면 겹친 테가 그림을 먹는다)
        },
        arrows(ctx, S) {                                 // 화살 세례 — 3발 (fx arrowVolley)
            // 연출은 4~7발이 다다다닥 날아간다. 한 발짜리 화살은 '관통 사격' 시절 그림이다.
            const shaft = (cx, top, len, w, hw, hh) => {
                ctx.moveTo(x(cx, S), y(top, S));
                ctx.lineTo(x(cx + hw, S), y(top + hh, S)); ctx.lineTo(x(cx + w / 2, S), y(top + hh, S));
                ctx.lineTo(x(cx + w / 2, S), y(top + len, S)); ctx.lineTo(x(cx - w / 2, S), y(top + len, S));
                ctx.lineTo(x(cx - w / 2, S), y(top + hh, S)); ctx.lineTo(x(cx - hw, S), y(top + hh, S));
                ctx.closePath();
            };
            /* 🚨 **곁 두 발을 가늘게·바깥으로 옮겼다 (2026-08-20 UI 스트림, 락 `icon-gen`).**
               종전엔 곁 화살의 깃(반폭 .155)이 가운데 화살의 깃(반폭 .17, x .33~.67)과 **x .67 에서
               맞닿아**, 20px 로 줄이면 세 깃이 **한 덩어리 가로 띠**로 뭉갰다. 그래서 이 아이콘이
               **20px 에서만 허브**(≥0.55 쌍 5개)였다 — 38px 에서는 세 발이 멀쩡히 갈린다.
               깃 반폭 .155 → .135 · 자리 .175/.825 → .155/.845 로 **깃 사이에 빈 줄**을 냈다.
               결과: 20px `≥0.60` 7 → 5 · `≥0.55` 25 → 23 · 38px `≥0.55` 20 → 18(최악값은 둘 다 유지).
               ⚠️ **대 폭은 .13 이 아니라 .12 여야 한다** — 실측으로 뒤집혔다: `.13` 이면 속살이
                  **34.1%**(문턱 34 코앞)인데 `.12` 면 **37.0%** 다. 굵은 쪽이 더 나쁘다는 게
                  직관과 반대라, 여기 값을 만질 때는 `probe-emblem-core` 를 반드시 다시 돌릴 것. */
            shaft(.50, .03, .78, .16, .17, .26);           // 가운데 한 발이 굵고 길다(연출의 마지막 한 발)
            shaft(.155, .22, .64, .12, .135, .21);
            shaft(.845, .22, .64, .12, .135, .21);
        },
        shuriken(ctx, S) {                               // 표창 난무 — 사수리켄 4날 별 (fx shurikenrun)
            // 왼쪽에서 날아오는 표창. 아이콘은 정면 4날 별로 못 박는다(회전은 늘 돌므로 정지 프레임 상징).
            const cx = .5, cy = .5;
            const blade = [[.5, .04], [.61, .40], [.5, .32], [.39, .40]];   // 위를 향한 한 날(팁·우·안·좌)
            for (let r = 0; r < 4; r++) {
                const ang = r * Math.PI / 2, cA = Math.cos(ang), sA = Math.sin(ang);
                blade.forEach((p, i) => {
                    const dx = p[0] - cx, dy = p[1] - cy;
                    const px = cx + dx * cA - dy * sA, py = cy + dx * sA + dy * cA;
                    if (i === 0) ctx.moveTo(x(px, S), y(py, S)); else ctx.lineTo(x(px, S), y(py, S));
                });
                ctx.closePath();
            }
        },
        worm(ctx, S) {                                   // 땅벌레 — 마디 4단 애벌레 (fx burrowworm)
            // 적 발밑에서 솟는 지렁이 괴물. 아이콘은 아래(꼬리)→위(머리)로 굵어지는 마디 4단으로.
            const seg = (cf, rf) => {
                const r = rf * S;
                ctx.moveTo(x(cf[0], S) + r, y(cf[1], S));
                ctx.arc(x(cf[0], S), y(cf[1], S), r, 0, Math.PI * 2);
            };
            seg([.30, .80], .13);   // 꼬리
            seg([.42, .62], .16);
            seg([.56, .44], .19);
            seg([.70, .26], .22);   // 머리(가장 큼)
        },
        maw(ctx, S) {                                    // 용의 아가리 — 벌어진 턱 (fx dragonMaw)
            /* 연출은 발밑에서 **거대 아가리가 솟아 덥석 문다**.
               🚨 종전 판은 위·아래 턱의 **바깥 변이 곧은 가로선**이라 전체 실루엣이 사각 블록이 됐고,
                  38px 에서 '지퍼/톱니 띠'로 읽혔다(비평가 '범용 클립아트' 지적). 이빨을 아치로 놓는
                  것만으로는 모자라다 — **턱 자체를 바나나꼴로 휘어야** 벌어진 입이 된다.
               ⓐ 바깥 변을 호로 휘어 양끝을 안으로 오므린다(입꼬리).
               ⓑ 이빨은 굵게(밑변 ≥.18) · 아랫니는 윗니 **사이**로 물린다.
               ⓒ 위아래 턱은 가운데에서 **벌어진 채** 두어 목구멍(빈 공간)이 보이게 한다. */
            // 윗턱 — 바깥 변이 위로 볼록한 호, 양끝이 아래로 내려온다
            ctx.moveTo(x(.045, S), y(.20, S));
            ctx.quadraticCurveTo(x(.50, S), y(-.06, S), x(.955, S), y(.20, S));
            ctx.lineTo(x(.885, S), y(.335, S));
            ctx.lineTo(x(.775, S), y(.245, S)); ctx.lineTo(x(.680, S), y(.430, S));
            ctx.lineTo(x(.560, S), y(.235, S)); ctx.lineTo(x(.440, S), y(.430, S));
            ctx.lineTo(x(.320, S), y(.235, S)); ctx.lineTo(x(.225, S), y(.420, S));
            ctx.lineTo(x(.115, S), y(.335, S));
            ctx.closePath();
            // 아랫턱 — 위아래 뒤집은 같은 꼴. 이빨은 윗니 사이(반 칸 어긋나게) 물린다.
            ctx.moveTo(x(.045, S), y(.80, S));
            ctx.quadraticCurveTo(x(.50, S), y(1.06, S), x(.955, S), y(.80, S));
            ctx.lineTo(x(.885, S), y(.665, S));
            ctx.lineTo(x(.775, S), y(.755, S)); ctx.lineTo(x(.680, S), y(.570, S));
            ctx.lineTo(x(.560, S), y(.765, S)); ctx.lineTo(x(.440, S), y(.570, S));
            ctx.lineTo(x(.320, S), y(.765, S)); ctx.lineTo(x(.225, S), y(.580, S));
            ctx.lineTo(x(.115, S), y(.665, S));
            ctx.closePath();
        },
        cleaver(ctx, S) {                                // 처형 — 처형대 칼날 (fx guillotineDrop)
            /* 도끼가 아니라 **거대한 칼날이 수직으로 떨어져 자른다**.
               🚨 이 모티프는 두 번 갈아엎었다. 이력을 남긴다 — 같은 자리로 다시 가지 말 것.
                  ⑴ 첫 판: 기둥 둘이 **따로 떨어진 막대**라 사이의 창백한 사다리꼴이 '깃대에 걸린
                     깃발'로 읽혔다.
                  ⑵ 둘째 판(Π 틀 + 그 안에 뜬 얇은 쐐기): **비평가 2인이 독립으로 '액자·창문'** 이라
                     찍었다(A#7 · B#6, 2026-08-20 3차 재채점). 확대해 보면 원인이 분명하다 —
                     `emblem()` 의 키라인(lw 0.067)이 폭 0.095 짜리 기둥을 **양쪽에서 갉아** 기둥이
                     거의 통짜 검정이 되고, 남은 것은 **검은 이중 사각 테 + 그 안의 창백한 도형**,
                     즉 액자의 정의 그 자체였다. 틀을 닫아 '기계'로 만들려던 의도가 정확히 반대로
                     작동한 것이다.
               📌 셋째 판(지금)의 원리: **틀을 지우고 날을 주인공으로 만든다.** 전체를 바깥 사각
                  하나 + 그 안을 파낸 구멍 하나로 그려, 실루엣이 ⓐ 위쪽의 **두꺼운 쐐기 날**(아래변이
                  비스듬하다) ⓑ 좌우 **짧은 레일** ⓒ 아래쪽 **두꺼운 받침대(형틀)** 세 덩어리로 읽히게
                  했다. 사각 '테'가 아니라 **위가 꽉 찬 덩어리**라 액자로 안 읽힌다.
               ⚠️ 구멍은 바깥과 **반대 감기**여야 nonzero 규칙에서 뚫린다(용 눈의 역방향 호와 같은 문법).
                  두 경로를 같은 방향으로 감으면 구멍이 안 뚫리고 통짜 사각이 된다.
               ⚠️ 여전히 **하나의 경로**다 — 서브패스를 겹쳐 그리면 `emblem()` 이 경로 전체에 획을 그어
                  이음매가 안쪽에 검은 줄로 남는다(도끼 날에서 밟은 그 함정). */
            /* 🚨 **살을 덜어 냈다 (2026-08-20 UI 스트림, 락 `icon-gen`).** 셋째 판은 읽힘은 풀렸지만
               **18종 중 가장 큰 잉크(1024px = 프레임의 70.9%) · bbox 채움 83.7%** 였다 — 즉
               '거의 꽉 찬 사각'이라, 가운데를 쓰는 아이콘과는 무엇을 하든 교집합이 남는다
               (용의 아가리와 IoU **0.653**). 날의 두께와 받침대의 폭만 줄여 **가운데 대역(y .39~.74)을
               비웠다** — 도안(위 쐐기 + 아래 형틀)은 그대로다.
               📌 **틈이 넓어질수록 '아직 안 떨어진 날'이 더 잘 읽힌다** — 이 변경은 IoU 와 읽힘이
                  같은 방향인 드문 자리다. */
            // ⓐ 칼날 — 폭 전체를 쓰는 **두꺼운 쐐기**. 아래변만 비스듬해 '떨어질 준비가 된 날'이 된다.
            ctx.moveTo(x(.06, S), y(.07, S)); ctx.lineTo(x(.94, S), y(.07, S));
            ctx.lineTo(x(.94, S), y(.28, S)); ctx.lineTo(x(.06, S), y(.50, S));
            ctx.closePath();
            // ⓑ 형틀(받침대) — 목이 놓이는 **반달 홈**을 크게 판 두꺼운 막대. 날과 **떨어뜨려** 둔다:
            //    그 빈 틈이 '아직 안 떨어졌다'를 만들고, 동시에 서브패스가 안 겹쳐 이음매 검은 줄도 없다.
            ctx.moveTo(x(.17, S), y(.74, S)); ctx.lineTo(x(.36, S), y(.74, S));
            ctx.lineTo(x(.36, S), y(.865, S)); ctx.lineTo(x(.64, S), y(.865, S));
            ctx.lineTo(x(.64, S), y(.74, S)); ctx.lineTo(x(.83, S), y(.74, S));
            ctx.lineTo(x(.83, S), y(.96, S)); ctx.lineTo(x(.17, S), y(.96, S));
            ctx.closePath();
        },
        dragon(ctx, S) {                                 // 종말의 화룡 — 뿔·송곳니 용 머리 (fx dragonfireBreath)
            // 아포칼립스의 연출은 **거대 화염룡이 수평으로 쓸어 가는 브레스**다(운석이 아니다 —
            // 사용자 지목 '메테오와 똑같다'의 잔재가 아이콘에만 남아 있었다).
            // ⚠️ 38px 에서 용으로 읽히는 최소 단위 = **뒤로 뻗은 뿔 2개 + 크게 벌린 턱 + 송곳니**.
            //    불길까지 그리면 머리와 엉겨 덩어리가 되고(첫 판 '신발'), 뿔이 하나면 새 머리로
            //    읽힌다(둘째 판 '오리'). 뿔은 둘, 서로 다른 각도로.
            ctx.moveTo(x(.10, S), y(.52, S));
            ctx.lineTo(x(.12, S), y(.30, S));
            ctx.lineTo(x(.00, S), y(.13, S)); ctx.lineTo(x(.21, S), y(.25, S));   // 뿔 ①
            ctx.lineTo(x(.17, S), y(.02, S)); ctx.lineTo(x(.37, S), y(.21, S));   // 뿔 ②
            ctx.quadraticCurveTo(x(.50, S), y(.16, S), x(.60, S), y(.28, S));     // 이마 → 콧등
            ctx.lineTo(x(.99, S), y(.36, S));                                     // 위턱 끝
            ctx.lineTo(x(.80, S), y(.40, S)); ctx.lineTo(x(.72, S), y(.55, S));   // 송곳니(하나만 크게 — 둘로 쪼개면 38px 에서 뭉친다)
            ctx.lineTo(x(.62, S), y(.40, S));
            ctx.lineTo(x(.44, S), y(.46, S));                                     // 입 안쪽 끝(크게 벌린다)
            /* 🔧 **아래턱과 입 안쪽 끝을 `.04` 씩 올려 바닥 대역을 비웠다 — `초신성 ↔ 화룡` 의 처방
                  (2026-08-20 UI 스트림, 락 `icon-gen`). 되돌리기 전에 읽을 것.**
               화룡은 초신성을 **85% 품는 쪽**이라 처방 ⓐ(품는 쪽을 좁힌다)가 맞는데, **어디를**
               좁히느냐가 갈랐다. `sweep` 으로 넷을 재서 고른 것이다: 아래턱만 올리면 되레 나쁘고
               (**.617**) · 뿔을 더 뻗으면 조금 낫지만 `≥.60` 이 안 빠지고(**.608**) · 목덜미를 좁히면
               38px 은 좋아져도 **20px `≥.60` 이 2 → 3 으로 는다**. **아래턱 + 입 안쪽을 같이** 올린
               이 안만 세 숫자가 하나도 안 올랐다: 38px 최악 **.614 → .600** · `≥.60` **1 → 0**
               (= **38px 에 `≥.60` 쌍이 하나도 없다**) · `≥.55` 13 유지 / 20px 셋 다 유지.
               ⚠️ **입은 여전히 크게 벌어져 있다** — 위아래를 같은 폭으로 올렸기 때문에 벌어진 간격은
                  거의 그대로다(x .6 기준 .28 → .24, 20px 에서도 4.8px). 이 머리글의 '크게 벌린 턱'
                  요건은 유지된다(시트 육안 확인 — 뿔 2개·눈·송곳니·벌린 턱 전부 읽힌다).
               🚨 **`probe-emblem-core` 속살이 36.9% → 35.2% 로 내려 이 종이 24종의 새 바닥이 됐다**
                  (게이트 34 · 여유 **1.2%p**). 원래도 36.9% 로 얇은 종이었지 내가 벼랑을 만든 건
                  아니지만, **이제 팔레트·키라인을 더 어둡게/두껍게 내리는 것을 이 종이 잡는다**
                  (옛 `voidLance` 가 하던 역할). 이 경로나 제품값을 만지면 반드시 같이 돌릴 것. */
            ctx.lineTo(x(.95, S), y(.62, S)); ctx.lineTo(x(.84, S), y(.70, S));   // 아래턱
            ctx.lineTo(x(.44, S), y(.66, S));
            ctx.quadraticCurveTo(x(.16, S), y(.66, S), x(.10, S), y(.52, S)); ctx.closePath();
            const eye = .058 * S;                                                 // 눈 — 역방향 호로 구멍(halo 와 같은 문법)
            ctx.moveTo(x(.33, S) + eye, y(.36, S)); ctx.arc(x(.33, S), y(.36, S), eye, 0, Math.PI * 2, true);
        },
        hourglass(ctx, S) {                              // 시간 왜곡 — 모래시계
            // 판(.08)·목(.05) 둘 다 테에 먹히던 자리 → .12 로. 목을 넓히면 '모래 떨어지는 잘록함'이
            // 줄지만, 목이 검게 막히는 쪽이 훨씬 나쁘다(속살 검사기로 확인).
            /* 🚫 **'판을 넓혀 신의 창·가호와의 포함을 깨자'는 시도는 실패했다 — 되돌렸다
                  (2026-08-20 UI 스트림, 락 `icon-gen`. 값을 다시 흔들기 전에 읽을 것).**
               모래시계는 폭 22×높이 34 짜리 좁고 긴 덩어리라 신의 창(16×37)·가호(24×35)를 품는다
               (IoU .630 · .629). 판을 `.15~.85` 로 벌리면 창 쪽은 실제로 .630 → .53 대로 떨어졌다.
               🚨 **그런데 전체 최악값은 되레 올라갔다(.640 → .662).** 판을 벌린 모래시계는
                  **'넓은 위 띠 + 넓은 아래 띠'** 가 되는데, 그게 바로 용의 아가리(`maw`)의 실루엣
                  그 자체다 — 한 쌍을 떼려고 **다른 무리로 걸어 들어간** 것이다(`.19~.81` 로 줄여도
                  .652 로 여전히 손해). 📌 **한 쌍만 보고 치수를 바꾸지 말 것 — 이 자는 153쌍
                  전수를 인쇄하니 바꾼 뒤 반드시 최악값과 ≥0.60 개수를 같이 볼 것.** */
            ctx.moveTo(x(.24, S), y(.10, S)); ctx.lineTo(x(.76, S), y(.10, S));
            ctx.lineTo(x(.76, S), y(.22, S)); ctx.lineTo(x(.24, S), y(.22, S)); ctx.closePath();
            ctx.moveTo(x(.24, S), y(.78, S)); ctx.lineTo(x(.76, S), y(.78, S));
            ctx.lineTo(x(.76, S), y(.90, S)); ctx.lineTo(x(.24, S), y(.90, S)); ctx.closePath();
            ctx.moveTo(x(.30, S), y(.21, S)); ctx.lineTo(x(.70, S), y(.21, S));
            ctx.lineTo(x(.56, S), y(.50, S)); ctx.lineTo(x(.44, S), y(.50, S)); ctx.closePath();
            ctx.moveTo(x(.44, S), y(.50, S)); ctx.lineTo(x(.56, S), y(.50, S));
            ctx.lineTo(x(.70, S), y(.79, S)); ctx.lineTo(x(.30, S), y(.79, S)); ctx.closePath();
        },
    };

    // 스킬 id → [모티프, 회전(rad, 선택), 글로우세기(선택)]
    // ⚠️ 모티프는 **그 스킬의 fx 가 화면에 그리는 것**과 맞아야 한다 (`skill-name-icon-match-fx`,
    //    사용자 지시 2026-08-19 — "스킬 이펙트에 어울리는 이름과 스킬 아이콘으로"). fx 를 갈아 놓고
    //    아이콘을 안 고치면 아포칼립스처럼 **연출은 화염룡인데 아이콘은 운석**인 자리가 남는다.
    //    5자리를 fx 기준으로 교체: powerStrike sword→slashx(참격 세례) · pierceShot arrow→arrows(화살 세례)
    //    · dragonBreath flame3→maw(지중 아가리) · execution axe→cleaver(처형 칼날) · apocalypse meteor→dragon(화염룡).
    const SK = {
        // 🆕 커먼 3종 재설계 (skill-object-protagonist, 2026-08-22): 표창·화살·지렁이로 fx 교체 →
        //    아이콘도 연출과 맞춘다(옛 slashx·whirl·cross 는 검사로봇·회오리·붕대 시절 그림).
        powerStrike: ['shuriken'], whirlwind: ['arrows'], firstAid: ['worm'],
        fireball: ['flame'], pierceShot: ['arrows'], warCry: ['horn'],
        meteor: ['meteor'], lightning: ['bolt', 0, 0.15], blessing: ['sparkle', 0, 0.16],
        // sanctuary/divineShield: 2026-08-20 UI 스트림. 종전 `sanctuary:shield` · `divineShield:halo` 는
        // 실루엣 IoU 0.782 로 18종 중 최악 쌍이었고(둘 다 중앙 정렬 둥근 덩어리) 이름과도 어긋나 있었다
        // (방패는 divine**Shield** 것이다 — 비평가 A#8). 가호를 `shield` 로 되돌리고 성역엔 계열이 다른
        // `sanctum`(납작한 바닥 서클 + 세로 빛기둥)을 준다. `probe-skill-icon-distinct.js` 로 전후 대조할 것.
        dragonBreath: ['maw'], execution: ['cleaver'], sanctuary: ['sanctum'],
        supernova: ['burst', 0, 0.15], voidLance: ['spear', Math.PI * 0.25], timeWarp: ['hourglass'],
        /* 🔧 **`godspear` 를 −0.17π(≈ −30.6°) 로 눕혔다 — `시간 왜곡 ↔ 신의 창` .630 의 처방
              (2026-08-20 UI 스트림, 락 `icon-gen`). 값을 0 으로 되돌리기 전에 `spear` 주석부터 읽을 것.**
           포함을 깨는 처방 셋 중 **ⓒ 긴 조형을 상대의 '골' 방향으로 눕힌다**. 모래시계의 허리는
           **축정렬 세로** 라, 창을 눕히면 같은 폭이어도 허리를 가로질러 밖으로 나간다 —
           조형을 하나도 안 건드리고(=다른 종과의 관계를 안 흔들고) 포함만 깨는 유일한 축이었다.
           📏 **전/후 실측(양쪽 크기, 세 숫자 전부)**: 38px 최악 .640 → **.640(유지)** · `≥.60` 2 → **1** ·
              `≥.55` 17 → **14** / 20px 최악 .627 → **.627(유지)** · `≥.60` 3 → **2** · `≥.55` 20 → **17**.
              **넷이 내려가고 둘이 제자리 · 오른 숫자 없음.** 상위 12 목록도 종전에서 이 쌍 한 줄만
              빠졌다(새로 올라온 쌍 없음 — 13위였던 `메테오↔화룡 .557` 이 자리만 메웠다).
           ⚠️ **`voidLance`(+0.25π)와 부딪히지 않는지 반드시 같이 볼 것** — 같은 `spear` 경로를 쓰는
              둘이라 여기가 유일한 위험이었다. **반대 방향으로 눕혀서** 실측 **IoU 0.239**(153쌍 중
              하위권)로 오히려 멀다. 📌 같은 부호로 돌리지 말 것 — 그 순간 둘이 같은 막대가 된다. */
        apocalypse: ['dragon', 0, 0.16], godspear: ['spear', -Math.PI * 0.17, 0.16], divineShield: ['shield', 0, 0.15],
    };
    // 색은 그리는 시점에 SKILL_DEFS 에서 조회한다(스크립트 로드 순서 무관하게 지연 조회).
    const FALLBACK = { powerStrike: '#cfd8dc', whirlwind: '#b0bec5', firstAid: '#8d6e63', fireball: '#ff8a65', pierceShot: '#81d4fa', warCry: '#ffcc80', meteor: '#ff7043', lightning: '#fff176', blessing: '#80cbc4', dragonBreath: '#ba68c8', execution: '#e57373', sanctuary: '#ce93d8', supernova: '#ffb74d', voidLance: '#9575cd', timeWarp: '#4dd0e1', apocalypse: '#ef5350', godspear: '#ffd54f', divineShield: '#fff59d' };

    Object.keys(SK).forEach((id) => {
        const [motif, rot, glow] = SK[id];
        G.draw['sk_' + id] = function (ctx, S) {
            let color = FALLBACK[id];
            try { if (typeof SKILL_DEFS !== 'undefined') { const d = SKILL_DEFS.find(k => k.id === id); if (d && d.color) color = d.color; } } catch (e) { }
            const path = P[motif] || P.sparkle;
            if (rot) { ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(rot); ctx.translate(-S / 2, -S / 2); }
            // 파스텔 원색을 블록 팔레트로 옮겨 그린다(`_block` 주석 참조). **아이콘만** 바뀐다 —
            // `SKILL_DEFS[].color` 원값은 그대로라 `combat.js` 의 스킬 FX 는 영향받지 않는다.
            emblem(ctx, S, G._block(color), path, glow);
            if (rot) ctx.restore();
        };
    });

    // ---- 기술 트리 노드용 단독 모티프 ----
    // 🚨 `sword`·`shield`·`cross`·`burst`·`hourglass`·`sparkle` 는 **`draw` 의 항목이 아니라 `P`(모티프 경로)**다.
    //    `draw` 에 있는 줄 알고 `IconGen.img('sword')` 를 부르면 조용히 빈 문자열이 돌아와 **노드가 빈 원으로
    //    렌더된다**(실제로 그렇게 나왔다). 스킬 오브와 같은 `emblem` 렌더러로 감싸 단독 아이콘으로 등록한다.
    const TECH_MOTIF = {
        tm_sword: ['sword', '#cfd8dc'], tm_shield: ['shield', '#b39ddb'],
        tm_cross: ['cross', '#a5d6a7'], tm_burst: ['burst', '#ffb74d'],
        tm_hourglass: ['hourglass', '#4dd0e1'], tm_sparkle: ['sparkle', '#80cbc4'],
    };
    Object.keys(TECH_MOTIF).forEach((k) => {
        const [motif, color] = TECH_MOTIF[k];
        // 스킬 오브와 **같은 블록 팔레트**를 태운다(`_block`). 안 태우면 기술 트리 노드만 파스텔로
        // 남아 나란히 놓였을 때 혼자 바래 보인다 — 실제로 A/B 시트에서 그렇게 갈렸다.
        G.draw[k] = function (ctx, S) { emblem(ctx, S, G._block(color), P[motif]); };
    });

    // 스킬 오브에 얹을 심볼 아이콘 HTML. (오브 배경/글로우는 CSS .sk-orb 가 담당)
    G.skill = function (id) { return this.img('sk_' + id, 'sk-ico'); };
})(IconGen);

/* ============================================================================
 * 하단 탭바 아이콘 5종 (기타 슬라이스)
 *
 * 🎨 아트 랭귀지 — 앞 세션이 남긴 '원본 정합 vs AAA 품질' 충돌을 여기서 정한다.
 *   원본 탭바(shot-042120 y808~889)를 9배 확대해 보면 아이콘 화풍이 명확하다:
 *   **두꺼운 검정 키라인 + 평면 채색 + 한 톤 음영 + 점 하이라이트**(슬라임 이마의 흰 점).
 *   즉 원본은 '평면 3색 벡터'도 아니고 '준사실 베벨'도 아닌 **스티커형 카툰 벡터**다.
 *   그래서 재화 아이콘처럼 그라디언트·베벨로 가면 원본 정합에서 감점, 완전 평면으로 가면
 *   품질에서 감점이다 — 이 슬라이스는 **원본의 키라인 언어를 그대로 쓰고 그 안에서
 *   음영·하이라이트로 마감**한다(이 화풍 자체가 AAA 모바일 아이콘의 주류 표현이다).
 *
 * 원본 실측(499×892 · tools/probe-tabbar.js) 잉크 bbox:
 *   던전(해골) 43×43 · 소환(발바닥+슬라임) 49×47 · PVP(방패기) 58×47 · 상점 45×41 px
 *   → 각 아이콘의 잉크가 캔버스의 92% 안팎을 채우고, 가로세로비는 원본 실루엣을 따른다.
 * ============================================================================ */
(function (G) {
    // 키라인은 **순검정**이어야 한다. 원본을 native 499px 폭에서 재면 키라인 평균이
    // rgb(1~6,1~4,1~2)이고 **잉크의 35.8%가 완전한 #000**이다(tools/probe-icon-style.js).
    // 처음 쓴 #0b0d10 은 rgb(13,15,19)로 측정돼 순검정 비율이 0% 였다 — 파란 기가 도는 회색이라
    // 원본의 '검정으로 끊어 주는' 인상이 안 났다.
    // ⚠️ 두께는 건드리지 말 것: 원본 키라인 중앙값 2px(상점 1px)이고 우리도 2px(상점 1px)로 **이미 같다**.
    //   비평가 1인이 '원본 1px vs 클론 3px, 3배 두껍다'며 1순위 수정으로 지목했지만, 그건 합성
    //   이미지(원본은 2.5배 확대 → 보간으로 흐려져 얇게 보이고, 클론은 축소 → 선명)에서 잰 오측정이다.
    //   native 해상도로 각자 재면 같다. 좇아서 얇게 만들면 원본에서 멀어진다.
    const K = '#000';               // 키라인(순검정) — 원본 실측값
    // 스티커 기법: 같은 경로를 굵게 스트로크한 뒤 그 위에 칠한다.
    // 스트로크의 안쪽 절반이 칠에 덮여 **바깥 절반만 남아** 균일한 키라인이 된다.
    const ink = (ctx, S, path, fill, lw) => {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); path();
        ctx.strokeStyle = K; ctx.lineWidth = S * (lw === undefined ? 0.075 : lw);
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
    };
    // 도넛(고리)용 — 서브패스 2개를 evenodd 로 칠해 구멍을 내고, 스트로크는 안팎 양쪽에 키라인을 준다.
    const inkEO = (ctx, S, path, fill, lw) => {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); path();
        ctx.strokeStyle = K; ctx.lineWidth = S * (lw === undefined ? 0.075 : lw);
        ctx.stroke();
        ctx.fillStyle = fill; ctx.fill('evenodd');
        ctx.restore();
    };
    // 키라인 없이 위에 얹는 칠(음영·하이라이트·구멍). clip 안에서 쓰면 실루엣을 안 넘는다.
    const on = (ctx, path, fill) => { ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); };
    const circle = (ctx, S, x, y, r) => () => ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    const ell = (ctx, S, x, y, rx, ry, rot) => () => ctx.ellipse(x * S, y * S, rx * S, ry * S, rot || 0, 0, Math.PI * 2);
    const poly = (ctx, S, pts) => () => pts.forEach((p, i) => { const X = p[0] * S, Y = p[1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    const rrect = (ctx, S, x, y, w, h, r) => () => G._rr(ctx, x * S, y * S, w * S, h * S, r * S);
    // 굵은 선분(자루·팔 등) — 스트로크로 그리면 키라인을 못 씌우니 사각형 경로로 만든다
    const bar = (ctx, S, x0, y0, x1, y1, w) => {
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
        const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
        return poly(ctx, S, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
    };

    // ---- PVP: 해골 + 관통한 단검 (원본 0번 칸) ----
    // 🔀 이 그림은 원래 `tab_dungeon` 이었다 — 사용자 지시 2026-08-19 로 **PVP 칸으로 옮겼다**:
    //    "PVP 부분 아이콘이 존나 길드 아이콘처럼 생김. 지금의 던전 아이콘이 PVP로 되게 하고,
    //     던전 아이콘은 던전 문처럼." (옛 PVP 의 방패 깃발+교차 검이 길드 문장으로 읽힌 게 이유다.)
    //    그림 자체는 원본 대조로 맞춰 둔 것이라 **한 획도 안 건드리고 키만 바꿨다**.
    G.draw.tab_pvp = function (ctx, S) {
        // 단검은 **하나의 축 위에** 있어야 한다 — 자루·코등이·칼날·칼끝이 한 직선에서 어긋나면
        // '해골에 꽂힌 검'이 아니라 '해골 옆의 부품들'로 읽힌다(비평가 1순위 지적, 원본 확대에서도 확인).
        const P0 = [0.182, 0.108], P1 = [0.858, 0.856];
        const dx = P1[0] - P0[0], dy = P1[1] - P0[1];
        const at = (t) => [P0[0] + dx * t, P0[1] + dy * t];
        const perp = (t, len) => {                       // 축에 수직인 선분(코등이)
            const L = Math.hypot(dx, dy), nx = (-dy / L) * len / 2, ny = (dx / L) * len / 2;
            const c = at(t);
            return [[c[0] + nx, c[1] + ny], [c[0] - nx, c[1] - ny]];
        };
        const bl = at(0.20), tip = at(1);
        ink(ctx, S, bar(ctx, S, bl[0], bl[1], tip[0], tip[1], 0.115), '#d8d8d8', 0.058);    // 칼날
        const f1 = at(0.86), f2 = at(1);   // 원본의 노출 칼끝은 턱 아래에 살짝 걸치는 작은 조각이다
        ink(ctx, S, poly(ctx, S, [[f1[0] + 0.042, f1[1] - 0.042], [f2[0], f2[1]], [f1[0] - 0.056, f1[1] + 0.056]]), '#3f3f3f', 0.046); // 칼끝 어두운 면
        // 재채점 반영: 가드 주황이 키라인에 먹혀 실낱(주황 픽셀 원본 35 vs 클론 1)이었다 —
        // 가드를 원본처럼 굵은 띠로 키우고 키라인을 줄여 주황 면이 살게 한다.
        const g = perp(0.205, 0.352);
        ink(ctx, S, bar(ctx, S, g[0][0], g[0][1], g[1][0], g[1][1], 0.128), '#f07000', 0.038); // 코등이 = 축을 가로지르는 굵은 주황 바
        const h0 = at(0.040), h1 = at(0.175);
        ink(ctx, S, bar(ctx, S, h0[0], h0[1], h1[0], h1[1], 0.104), '#7a4a12', 0.048);      // 자루(갈색 — 원본의 갈색 그립)
        // 폼멜 — 원본 3배 확대로 확정: **회색 구형**이다(1차 비평가의 '회색이라 돋보기' 지적이
        // 오측정이었고, 주황으로 바꾼 2차가 '주황 얼룩 덩어리' 지적을 받았다). 회색 복원.
        ink(ctx, S, circle(ctx, S, P0[0], P0[1], 0.052), '#d8d8d8', 0.044);

        // 해골: 원본은 **턱 판이 없다** — 흰 이빨 3개가 두개골 아래로 매달리고 그 사이로 배경이 보인다.
        // 재채점 반영: 이빨이 두개골 원에 거의 다 가려 '민짜 원'으로 보였다 — 아래로 더 빼서 보이게 한다.
        [0.408, 0.500, 0.592].forEach(x => ink(ctx, S, rrect(ctx, S, x - 0.048, 0.615, 0.096, 0.196, 0.030), '#fff', 0.056));
        ink(ctx, S, circle(ctx, S, 0.500, 0.435, 0.272), '#fff', 0.072);                     // 두개골(순백)
        ctx.save();
        ctx.beginPath(); circle(ctx, S, 0.500, 0.435, 0.272)(); ctx.clip();
        // 원본 음영은 좌·좌하 테두리를 따르는 **좁은 초승달** 한 톤이다(공 같은 반쪽 그림자가 아니다).
        ctx.beginPath();
        ctx.arc(0.500 * S, 0.435 * S, 0.272 * S, Math.PI * 0.55, Math.PI * 1.35);
        ctx.arc(0.560 * S, 0.415 * S, 0.272 * S, Math.PI * 1.35, Math.PI * 0.55, true);
        ctx.closePath();
        ctx.fillStyle = '#b4b4b4'; ctx.fill();
        ctx.restore();
        on(ctx, rrect(ctx, S, 0.356, 0.368, 0.110, 0.222, 0.052), K);                        // 눈구멍(순검정, 원본 세로비 2.0)
        on(ctx, rrect(ctx, S, 0.534, 0.368, 0.110, 0.222, 0.052), K);
        // 원본 해골에는 스페큘러 점이 없다(유일한 반짝임은 칼날의 4각 스파클) — 칼날에만 준다.
        const sp = at(0.30);
        on(ctx, poly(ctx, S, [[sp[0], sp[1] - 0.052], [sp[0] + 0.030, sp[1]], [sp[0], sp[1] + 0.052], [sp[0] - 0.030, sp[1]]]), '#fff');
    };

    // ---- 소환: 발바닥 + 슬라임 + 초록 순환 고리 (원본 2번 칸) ----
    G.draw.tab_summon = function (ctx, S) {
        const paw = '#0b56ab';
        // 발가락은 원본처럼 **크기를 점점 줄여** 패드에 붙인다(균일한 크기·균일한 간격이면 기계적으로 보인다)
        ink(ctx, S, ell(ctx, S, 0.320, 0.585, 0.132, 0.168, -0.16), paw, 0.066);
        [[0.128, 0.415, 0.072], [0.268, 0.318, 0.066], [0.098, 0.612, 0.060], [0.172, 0.762, 0.054]]
            .forEach(t => ink(ctx, S, circle(ctx, S, t[0], t[1], t[2]), paw, 0.058));
        // 원본 3배 확대 확인: 발바닥은 **플랫 단색 남색**이다 — 2톤 분할을 걷는다(재채점 '내부 베벨' 지적).

        // 초록 고리 — 원본은 **구멍이 뚫린 닫힌 고리** 위로 **불꽃 혀가 솟는 화염 링**이다.
        // 재채점 반영(비평가 2인 공통): 머리 스파이크(화살촉)+꼬리 노치를 달았더니 '재활용/리프레시
        // 화살표'로 읽혔다 — 화살촉을 없애고 링 위에서 위로 솟는 불꽃 혀 2개로 교체한다.
        const G1 = '#22f03c', rx = 0.600, ry = 0.330, R = 0.172, r = 0.082;
        inkEO(ctx, S, () => {
            ctx.moveTo((rx + R) * S, ry * S); ctx.arc(rx * S, ry * S, R * S, 0, Math.PI * 2);
            ctx.moveTo((rx + r) * S, ry * S); ctx.arc(rx * S, ry * S, r * S, 0, Math.PI * 2);
        }, G1, 0.060);
        // 불꽃 혀 — 원본 3배 확대로 확정: 링 위에서 **왼쪽으로 감기는 큰 혀 하나**다.
        // (2차에서 좌우 대칭 혀 2개를 세웠더니 비평가 2인 모두 '고양이 귀'로 읽었다 — 하나만 남긴다.)
        ink(ctx, S, () => {
            ctx.moveTo(0.702 * S, 0.196 * S);
            ctx.bezierCurveTo(0.708 * S, 0.108 * S, 0.664 * S, 0.052 * S, 0.560 * S, 0.030 * S);
            ctx.bezierCurveTo(0.606 * S, 0.078 * S, 0.548 * S, 0.096 * S, 0.494 * S, 0.128 * S);
            ctx.bezierCurveTo(0.548 * S, 0.180 * S, 0.606 * S, 0.152 * S, 0.630 * S, 0.226 * S);
            ctx.closePath();
        }, G1, 0.052);
        ctx.save();                                                                               // 고리 아래쪽 어두운 초록
        ctx.beginPath();
        ctx.moveTo((rx + R) * S, ry * S); ctx.arc(rx * S, ry * S, R * S, 0, Math.PI * 2);
        ctx.moveTo((rx + r) * S, ry * S); ctx.arc(rx * S, ry * S, r * S, 0, Math.PI * 2);
        ctx.clip('evenodd');
        on(ctx, rrect(ctx, S, rx - R, ry + R * 0.42, R * 2, R, 0), '#12ab27');
        ctx.restore();
        // 스파클: 원본은 주황 4점 별 — 마름모 하나로는 '점'으로 퇴화한다(재채점 지적).
        const star = (sx, sy, ro, ri) => () => {
            for (let i = 0; i < 8; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 4, rad = i % 2 === 0 ? ro : ri;
                const X = (sx + Math.cos(a) * rad) * S, Y = (sy + Math.sin(a) * rad) * S;
                i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
            }
            ctx.closePath();
        };
        ink(ctx, S, star(0.888, 0.474, 0.062, 0.022), '#ff9d00', 0.040);                          // 주황 4점 별 스파클

        // 슬라임 — 원본 몸통은 **물방울/플라스크**다: 둥근 아래 + 비스듬한 목 + 우상단 부리.
        const cx = 0.662, cy = 0.706, rr = 0.212, beak = [0.868, 0.492];
        const body = () => {
            ctx.moveTo(beak[0] * S, beak[1] * S);
            // -20° → 300°: 남는 각(=목/부리)이 **32°**뿐이라 몸통은 원본처럼 거의 둥글다.
            // 90°를 남겼더니 큰 사선 절단면이 생겨 '잘린 반달'로 읽혔고, 50°에서도 좌상단 절단면이
            // 눈에 보였다(원본은 그 부위가 발바닥·고리에 가려 안 보인다) — 두 번 줄여 32°로 맞췄다.
            ctx.arc(cx * S, cy * S, rr * S, -0.35, 5.24);
            ctx.closePath();
        };
        ink(ctx, S, body, '#3fcdf5', 0.068);
        ctx.save();
        ctx.beginPath(); body(); ctx.clip();
        on(ctx, circle(ctx, S, 0.790, 0.830, 0.180), '#1c9fd4');                              // 아래 음영
        ctx.restore();
        // 벌린 입: 원본은 몸통 폭의 55% 에 두꺼운 검정 입술 — anticlockwise:true 라야 아래로 벌어진다
        ink(ctx, S, () => { ctx.moveTo((cx - 0.128) * S, 0.700 * S); ctx.arc(cx * S, 0.700 * S, 0.128 * S, Math.PI, 0, true); ctx.closePath(); }, '#ff0d0d', 0.056);
        // 스페큘러 — 원본은 **작은 흰 점 하나**뿐(3배 확대 확인). 그라디언트·타원 다 걷어냈다.
        on(ctx, circle(ctx, S, 0.588, 0.582, 0.036), 'rgba(255,255,255,.9)');
    };

    // ---- 던전: 붉은 나무 아치문 + 좌우 횃불 (사용자 지시 2026-08-19 "던전 아이콘은 던전 문처럼") ----
    // 옛 PVP 의 '방패 깃발 + 교차 검'이 여기 있었는데, 길드 문장으로 읽힌다는 지적으로 폐기했다
    // (해골+단검이 PVP 로 올라갔다 — 위 tab_pvp 참조).
    //
    // 🚨 **원본에 대응 그림이 있다 — 없다고 적어 둔 앞 메모가 틀렸다 (2026-08-19 실측).**
    //    원본 탭바(shot-042120) **1번 칸('방', 지금은 삭제된 탭)이 바로 아치문**이다. 8배로 떠서
    //    확인했다: 회색 돌 아치테 + **붉은 나무 문짝**(rgb 145,53,33 — 이 칸 유채색 최빈값) +
    //    세로 널 3장 + 가운데 **검은 원형 노커** + 아래쪽 밝은 갈색 가로 띠 + 회색 문지방,
    //    그리고 **좌우에 횃불 두 개**. 대응 칸이 없다고 보고 새로 지어낸 '베이지 돌 성문 +
    //    흰 포트컬리스'는 그래서 원본 화풍에서 혼자 떨어져 나와 있었다 — `probe-icon-style.js`
    //    실측이 그걸 그대로 보여준다: 이 칸만 **채도 평균 0.187 · 상위10% 0.377** 로, 옆 5종
    //    (0.43~0.87)과 원본 문짝 칸(0.554 / 0.851)의 절반도 안 됐다. 50px 로 줄이면 대비가
    //    없어 '회색 덩어리'로 뭉갠다(대조 시트 `tools/shot-tabbar-cmp.js` 육안 확인).
    //    → 원본 문짝을 좌표·색까지 그대로 옮긴다. 치수는 원본 잉크 bbox(51×45px)에서 역산했다.
    // ⓐ 순검정 키라인 하나로 실루엣 ⓑ 채움 2톤 ⓒ 50px 에서 살아남는 디테일만(널 이음선·노커·
    //    가로 띠·문지방·횃불 — 원본에 있는 손잡이 고리와 돌 이음매는 1px 미만이라 뺐다).
    G.draw.tab_dungeon = function (ctx, S) {
        const stone = '#b0adb5', stoneDk = '#7e7b85',      // 아치테(원본 회색-보라 계열)
            wood = '#913521', woodDk = '#6b2416',          // 문짝(원본 최빈 유채색 rgb 145,53,33)
            band = '#a86a34', sill = '#5b4f5c', knob = '#2a2530',
            flame = '#f0a51f', flameHi = '#ffd66a', sconce = '#3a3038', sconceLt = '#9c96a2';
        const ARCH_X = 0.498, ARCH_R = 0.285, ARCH_Y = 0.415, FLOOR = 0.8305;   // 아치테
        const DOOR_R = 0.234, DOOR_Y = 0.419;                                   // 문짝(테 안쪽)

        // 횃불 좌우 — **먼저** 그려서 아치테 뒤로 들어가게 한다(원본도 벽에 붙어 있다).
        // 이 주황 두 점이 이 아이콘의 유일한 고채도 화소다: 빼면 채도 지표가 다시 반토막 난다.
        [0.107, 0.893].forEach(tx => {
            // ⚠️ 자루를 통째로 어두운 색 하나로 두면 **근흑 탭바 배경에 먹혀 불꽃만 공중에 뜬다**
            //    (첫 시안이 그랬다 — 대조 시트에서 '촛불 두 점'으로 보였다). 원본처럼
            //    **밝은 회색 몸통 + 위아래 어두운 테**의 3단으로 나눠야 자루가 배경에서 떨어진다.
            ink(ctx, S, poly(ctx, S, [[tx - 0.050, 0.470], [tx + 0.050, 0.470], [tx + 0.024, 0.700], [tx - 0.024, 0.700]]), sconceLt, 0.048);
            on(ctx, rrect(ctx, S, tx - 0.052, 0.462, 0.104, 0.052, 0.014), sconce);     // 위 테(불꽃 받침)
            on(ctx, poly(ctx, S, [[tx - 0.032, 0.618], [tx + 0.032, 0.618], [tx + 0.022, 0.700], [tx - 0.022, 0.700]]), sconce);   // 아래로 좁아지는 꼬리
            ink(ctx, S, () => {                                    // 불꽃 — 위로 뾰족한 물방울
                ctx.moveTo(tx * S, 0.276 * S);
                ctx.bezierCurveTo((tx + 0.066) * S, 0.366 * S, (tx + 0.062) * S, 0.450 * S, tx * S, 0.470 * S);
                ctx.bezierCurveTo((tx - 0.062) * S, 0.450 * S, (tx - 0.066) * S, 0.366 * S, tx * S, 0.276 * S);
                ctx.closePath();
            }, flame, 0.044);
            on(ctx, ell(ctx, S, tx, 0.398, 0.022, 0.042), flameHi);   // 불꽃 심 — 1점만
        });

        // 아치테(돌) = 반원 머리 + 곧은 기둥. 바닥을 문지방까지 내려 '땅에 선 문'으로 읽히게 한다.
        const frame = () => {
            ctx.moveTo((ARCH_X - ARCH_R) * S, FLOOR * S);
            ctx.lineTo((ARCH_X - ARCH_R) * S, ARCH_Y * S);
            ctx.arc(ARCH_X * S, ARCH_Y * S, ARCH_R * S, Math.PI, 0);
            ctx.lineTo((ARCH_X + ARCH_R) * S, FLOOR * S);
            ctx.closePath();
        };
        ink(ctx, S, frame, stone, 0.060);
        ctx.save(); ctx.beginPath(); frame(); ctx.clip();
        on(ctx, rrect(ctx, S, ARCH_X - ARCH_R, FLOOR - 0.150, ARCH_R * 2, 0.150, 0), stoneDk);   // 테 아래 그림자(2톤)
        ctx.restore();

        // 문짝 — 아치테 안쪽에 같은 곡률로 앉는다. 이 붉은 면이 아이콘의 정체다.
        const door = () => {
            ctx.moveTo((ARCH_X - DOOR_R) * S, FLOOR * S);
            ctx.lineTo((ARCH_X - DOOR_R) * S, DOOR_Y * S);
            ctx.arc(ARCH_X * S, DOOR_Y * S, DOOR_R * S, Math.PI, 0);
            ctx.lineTo((ARCH_X + DOOR_R) * S, FLOOR * S);
            ctx.closePath();
        };
        ink(ctx, S, door, wood, 0.052);
        ctx.save(); ctx.beginPath(); door(); ctx.clip();
        on(ctx, rrect(ctx, S, ARCH_X - DOOR_R, 0.700, DOOR_R * 2, 0.200, 0), woodDk);            // 아래 그림자
        // 세로 널 이음선 2줄 — 문짝이 널 3장으로 읽히게 하는 최소 디테일(같은 간격이라야 판자다)
        [ARCH_X - 0.078, ARCH_X + 0.078].forEach(x => on(ctx, rrect(ctx, S, x - 0.017, 0.150, 0.034, 0.760, 0), K));
        on(ctx, rrect(ctx, S, ARCH_X - DOOR_R, 0.674, DOOR_R * 2, 0.046, 0), band);              // 밝은 갈색 가로 띠
        on(ctx, rrect(ctx, S, ARCH_X - DOOR_R, 0.720, DOOR_R * 2, 0.016, 0), K);                 // 띠 아래 그림자선
        ctx.restore();
        // 노커(검은 원) — 널 이음선을 가로질러 앉아야 '문에 박힌 쇠붙이'가 된다. 50px 에서도 안 뭉갠다.
        ink(ctx, S, circle(ctx, S, ARCH_X, 0.388, 0.086), knob, 0.040);

        // 문지방 — 문짝보다 양옆으로 튀어나와야 '바닥에 놓인 단'이 된다(옆 상점 아이콘과 같은 처리).
        ink(ctx, S, rrect(ctx, S, 0.186, FLOOR, 0.634, 0.100, 0.018), sill, 0.048);
        on(ctx, circle(ctx, S, ARCH_X - 0.180, 0.240, 0.042), 'rgba(255,255,255,.80)');          // 스페큘러 한 점
    };

    // ---- 퀘스트: 양피지 두루마리 (사용자 지시 2026-08-18 — 소환과 상점 사이 새 탭) ----
    // 원본 탭바에 대응 칸이 없는 신규 아이콘이라, 형태는 옆 4종과 같은 규약으로만 맞춘다:
    // ⓐ 순검정 키라인 하나로 실루엣을 끊고 ⓑ 채움은 2톤(밝은 면 + 아래 40% 그림자)
    // ⓒ 스페큘러는 한 점만 ⓓ 50px 축소에서 뭉개지지 않게 내부 디테일은 3개 이하.
    // 두루마리는 '위·아래 말린 봉 + 가운데 펼친 종이 + 글줄 3개'가 이 크기에서 가장 잘 읽힌다
    // (봉을 좌우에 두는 가로형은 축소하면 글줄이 1px로 사라져 빈 사각형이 된다).
    /* 퀘스트: **게시판 공고문**(못으로 박은 양피지) — 종전의 '위아래 말린 봉 + 글줄 3개'는
       📜 이모지의 배치를 그대로 옮긴 것이라 비평가 2인이 'near-tracing, 오리지널리티 감점'으로
       공통 지적했다(icon-gen 채점 1라운드). 이 칸은 **원본에 대응 그림이 없어**(퀘스트 탭은
       사용자 추가 기능) 원본 대조 제약이 없고 자유롭게 다시 그릴 수 있는 유일한 탭이다.
       32px 에서 살아남게 노브를 셋만 쓴다: ⓐ **기울인 낱장 실루엣**(봉 없음)
       ⓑ **위쪽 검은 못대가리** ⓒ **초록 체크** — 탭바의 다른 다섯 칸에 없는 색이라 축소해도
       '퀘스트'로 갈린다(pvp 흰 · 던전 갈/빨 · 소환 파/초 · 상점 빨/청록 · 디버그 빨).
       ⚠️ 밑단은 **찢긴 결**로 판다 — 곧은 사각이면 '문서'가 아니라 '카드'로 읽힌다.
       ⚠️ 배율 1.25 는 눈이 아니라 `probe-tabbar` 계약이다: 낱장은 봉이 없어 종전 두루마리보다
          좁아지는데, 그대로 두면 잉크 긴 변이 옆 칸(9.0~9.6%W · 원본 평균 9.86%)보다 한참
          작아져 '혼자 작다'로 떨어진다. 균일 배율이라 못대가리가 타원으로 찌그러지지 않는다. */
    G.draw.tab_quest = function (ctx, S) {
        const paper = '#f6e3b8', shade = '#d8bd85', iron = '#4a5058', ok = '#23c552';
        ctx.save();
        ctx.translate(S * 0.5, S * 0.5); ctx.rotate(-0.075); ctx.scale(1.25, 1.25); ctx.translate(-S * 0.5, -S * 0.5);
        // 낱장 — 밑단 찢긴 결(작은 톱니 3개). 위는 곧게 둬야 못이 박힌 자리로 읽힌다.
        const sheet = () => {
            ctx.moveTo(0.212 * S, 0.166 * S);
            ctx.lineTo(0.788 * S, 0.166 * S);
            ctx.lineTo(0.788 * S, 0.790 * S);
            ctx.lineTo(0.692 * S, 0.846 * S);
            ctx.lineTo(0.596 * S, 0.786 * S);
            ctx.lineTo(0.500 * S, 0.850 * S);
            ctx.lineTo(0.404 * S, 0.788 * S);
            ctx.lineTo(0.308 * S, 0.848 * S);
            ctx.lineTo(0.212 * S, 0.792 * S);
            ctx.closePath();
        };
        ink(ctx, S, sheet, paper, 0.068);
        ctx.save();
        ctx.beginPath(); sheet(); ctx.clip();
        on(ctx, rrect(ctx, S, 0.170, 0.606, 0.700, 0.300, 0), shade);           // 아래 40% 그림자(옆 아이콘과 같은 처리)
        ctx.restore();
        // 글줄 2개 — 체크 옆에만 둔다(3개를 채우면 32px 에서 다시 줄무늬가 된다)
        [[0.452, 0.470, 0.276], [0.320, 0.632, 0.408]]
            .forEach(([x, y, w]) => on(ctx, rrect(ctx, S, x, y, w, 0.060, 0.030), 'rgba(20,16,10,.70)'));
        // 초록 체크 — 이 아이콘의 색 노브. 검정 테를 먼저 굵게 긋고 그 위에 얹는다(스티커 화법).
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, c] of [[0.150, K], [0.084, ok]]) {
            ctx.beginPath();
            ctx.moveTo(0.286 * S, 0.474 * S); ctx.lineTo(0.348 * S, 0.540 * S); ctx.lineTo(0.430 * S, 0.396 * S);
            ctx.strokeStyle = c; ctx.lineWidth = w * S; ctx.stroke();
        }
        // 못대가리 — 위쪽 가운데. 검은 테 + 쇠 원반 + 좌상 하이라이트 한 점.
        ink(ctx, S, circle(ctx, S, 0.500, 0.256, 0.078), iron, 0.062);
        on(ctx, circle(ctx, S, 0.474, 0.232, 0.026), 'rgba(255,255,255,.62)');
        ctx.restore();
    };

    // ---- 상점: 줄무늬 어닝 가게 (원본 4번 칸) ----
    G.draw.tab_shop = function (ctx, S) {
        // 원본의 폭 위계: 간판 > 어닝 > 건물, 그리고 바닥 바가 건물보다 양옆으로 튀어나온다.
        // 첫 시안은 셋이 같은 폭이라 '처마가 덮은' 인상이 없었다.
        ink(ctx, S, rrect(ctx, S, 0.070, 0.818, 0.860, 0.070, 0.016), '#3c4149', 0.050);        // 바닥 바(건물보다 넓다)
        ink(ctx, S, rrect(ctx, S, 0.185, 0.452, 0.630, 0.372, 0.018), '#dcdcdc', 0.062);        // 건물
        on(ctx, rrect(ctx, S, 0.185, 0.452, 0.630, 0.055, 0), '#b9b9b9');                       // 건물 상단 어두운 띠
        ink(ctx, S, rrect(ctx, S, 0.228, 0.536, 0.150, 0.288, 0.014), '#008f96', 0.046);        // 문
        on(ctx, rrect(ctx, S, 0.246, 0.556, 0.042, 0.248, 0.010), '#00b0b8');                   // 문 광택
        ink(ctx, S, rrect(ctx, S, 0.408, 0.536, 0.372, 0.196, 0.014), '#009090', 0.046);        // 창(원본 실측 H180 S100)
        on(ctx, rrect(ctx, S, 0.408, 0.690, 0.372, 0.042, 0), '#017083');                       // 창 아래 테두리 음영
        ink(ctx, S, rrect(ctx, S, 0.398, 0.732, 0.392, 0.036, 0.012), '#c4c4c4', 0.040);        // 창 아래 선반(원본에 있다)

        // 어닝: 큰 스캘럽 7개 + **각 스캘럽 아래 40% 자기 그림자**(원본은 이 2단 띠가 뚜렷하다)
        // 재채점 반영: 띠가 얇아 차양의 부피감이 없었다 — 높이를 키워 둥근 밑단까지 스트라이프가 떨어지게.
        const ax0 = 0.098, ax1 = 0.902, ay = 0.286, ah = 0.225, n = 7, sw = (ax1 - ax0) / n;
        const skirt = () => {
            ctx.moveTo(ax0 * S, ay * S);
            ctx.lineTo(ax1 * S, ay * S);
            ctx.lineTo(ax1 * S, (ay + ah * 0.42) * S);
            for (let i = n - 1; i >= 0; i--) ctx.arc((ax0 + sw * i + sw / 2) * S, (ay + ah * 0.42) * S, (sw / 2) * S, 0, Math.PI, false);
            ctx.lineTo(ax0 * S, ay * S);
            ctx.closePath();
        };
        ink(ctx, S, skirt, '#fff', 0.058);
        ctx.save();
        ctx.beginPath(); skirt(); ctx.clip();
        for (let i = 0; i < n; i++) {
            const x = ax0 + sw * i, red = i % 2 === 0;
            on(ctx, rrect(ctx, S, x, ay, sw, ah, 0), red ? '#e00000' : '#fff');
            on(ctx, rrect(ctx, S, x, ay + ah * 0.40, sw, ah, 0), red ? '#a30000' : '#d0d0d0');   // 로브별 아래 그림자
            // 원본은 **패널마다 검정 구분선**이 있다. 없으면 50px 에서 붉은/흰이 뭉개져 '사탕 띠'가 된다.
            if (i) on(ctx, rrect(ctx, S, x - 0.006, ay, 0.012, ah, 0), K);
        }
        ctx.restore();
        // 간판: 두꺼운 외곽선 없이 얇게 + 위쪽에 짙은 앰버 림만(원본과 같은 처리)
        ink(ctx, S, rrect(ctx, S, 0.082, 0.222, 0.836, 0.064, 0.018), '#ff8c00', 0.034);
        on(ctx, rrect(ctx, S, 0.082, 0.222, 0.836, 0.018, 0.008), '#c96a00');
    };

    // ---- 디버그: 무당벌레 (배포 탭바에서는 숨김 — ?debug= 로만 노출) ----
    G.draw.tab_debug = function (ctx, S) {
        // 다리 — 재채점 반영: 가늘고 키라인이 안 보여 이모지풍으로 이탈했다 — 옆 아이콘들의
        // 두꺼운 외곽선 문법대로 굵힌다.
        [[-1, 0.30], [-1, 0.52], [-1, 0.74], [1, 0.30], [1, 0.52], [1, 0.74]].forEach(([s, y]) =>
            ink(ctx, S, bar(ctx, S, 0.5 + s * 0.16, y, 0.5 + s * 0.42, y - 0.06, 0.085), '#3a3f47', 0.050));
        ink(ctx, S, circle(ctx, S, 0.500, 0.230, 0.135), '#26292f', 0.062);                   // 머리
        ink(ctx, S, ell(ctx, S, 0.500, 0.590, 0.290, 0.320), '#e01010', 0.072);               // 몸통
        ctx.save();
        ctx.beginPath(); ell(ctx, S, 0.500, 0.590, 0.290, 0.320)(); ctx.clip();
        on(ctx, rrect(ctx, S, 0.478, 0.270, 0.044, 0.650, 0), K);                             // 등 가운데 줄
        [[0.340, 0.470, 0.062], [0.660, 0.470, 0.062], [0.375, 0.720, 0.052], [0.625, 0.720, 0.052]]
            .forEach(d => on(ctx, circle(ctx, S, d[0], d[1], d[2]), K));                      // 점
        on(ctx, circle(ctx, S, 0.640, 0.760, 0.170), 'rgba(0,0,0,.16)');                      // 아래 음영
        ctx.restore();
        on(ctx, circle(ctx, S, 0.400, 0.400, 0.040), 'rgba(255,255,255,.55)');                // 점 하이라이트(광택 과다 지적으로 축소)
    };

    // 탭바 아이콘 HTML. 크기는 CSS(#tabbar .tab-ico)가 원본 실측 비율로 잡는다.
    G.tab = function (name) { return this.img('tab_' + name, 'tab-ico'); };

    // 스티커 화법 헬퍼를 밖으로 낸다 — 아래 상점 보석 묶음처럼 **같은 화풍**으로 그려야 하는
    // 아이콘이 이 블록을 복사하지 않게 하려는 것이다(정의는 여기 하나만 남는다).
    G._sticker = { K, ink, inkEO, on, circle, ell, poly, rrect, bar };
})(IconGen);

/* ============================================================================
 * UI 크롬 글리프 — 닫기 ✕ · 체크 ✓ (icon-gen 슬라이스 '기타')
 *
 * 왜 아이콘으로 바꾸나: 이 둘은 지금까지 **폰트 글리프 텍스트 노드**였다(`probe-emoji-sweep`
 * 가 화면 27곳·3곳에서 잡아낸 잔존분). 글리프는 ⓐ 플랫폼 폰트마다 굵기·크기가 달라지고
 * ⓑ 원본이 가진 **검정 키라인이 없다** — 옆 아이콘이 전부 '순검정 키라인 + 평면 채움'인데
 * 닫기 표시만 테 없는 흰 획이라 혼자 다른 게임에서 온 것처럼 보인다.
 *
 * 원본 실측(`tools/probe-xmark-ref.js`, 원본 25장에서 **완전히 일치**):
 *   빨간 원반 지름 51px · 흰 잉크 바운딩 11×12px(= 지름의 0.216 × 0.240) · 중심 획 0.081.
 *   ASCII 덤프로 확대해 보면 흰 획 좌우로 **검정 테가 2~3px** 둘려 있고(같은 스티커 화법),
 *   테까지 포함한 표시 전체는 x240~256 = 17px 이다. 즉 **흰 속살 11 / 전체 17 = 0.647**.
 * 그래서 캔버스 한 변 S 를 '테 포함 전체'로 잡고 그 안에서 위 비를 재현한다 —
 * 표시 크기는 CSS 가 `버튼 지름 × (17/51)` 로 준다(`.x-btn .ico`).
 *
 * ⚠️ 획을 두 번 긋는 순서가 중요하다 — 검정을 **먼저 굵게** 긋고 그 위에 흰 획을 얹어야
 *    테가 바깥으로만 남는다. 반대로 하면 흰 획이 검정에 먹힌다.
 * ⚠️ 대각선이라 `lineCap:'round'` 의 캡 길이(획 두께의 절반)가 바운딩에 그대로 더해진다.
 *    끝점을 캡만큼 안으로 당기지 않으면 흰 잉크가 계약보다 커진다(1차 렌더에서 밟았다).
 * ============================================================================ */
(function (G) {
    const K = '#000';
    // 캔버스 좌표 계약. **흰 속살 바운딩(WX×WY)을 노브로 삼는다** — 계약이 재는 값이 그거라서다.
    // ⚠️ 처음엔 '검정 테 포함 전체'를 캔버스 한 변으로 잡았는데, 원본이 **가로보다 세로가 긴**
    //    X(0.216 : 0.240 = 1 : 1.111)라 세로를 늘리자 검정이 캔버스 밖으로 잘렸다. 그래서 속살을
    //    캔버스보다 넉넉히 작게 두고(테가 들어갈 자리를 남기고) 표시 배율은 CSS 한 곳에서 준다.
    const WX = 0.505, WY = WX * 1.135;   // 속살 바운딩 (세로가 원본 비만큼 길다)
    // CORE = 흰 획의 **수직 두께**. 중심 행 흰 런(계약 0.081)은 두 팔이 겹쳐 두께보다 커지므로
    // (실측 런/두께 ≈ 1.39) 두께를 그 비만큼 낮춰 잡는다.
    const CORE = 0.150;
    // RIM = 흰 획 바깥으로 더 나가는 검정 테의 폭. 원본은 지름 51px 에서 2.5px 급이다.
    const RIM = 0.124;

    // 대각 두 획(또는 체크 꺾은선)을 '검정 밑 + 채움 위' 2패스로 긋는 공용 루틴.
    // fill 기본은 흰색(닫기 ✕·펫 선택 ✓처럼 색 있는 바탕 위). 자동제작 체크는 어두운 칸 위
    // 초록 획이라 fill 로 색을 갈아끼운다 — 검정 테는 그대로라 어두운 바탕에선 테가 묻히고
    // (테두리 없는 초록 체크가 되고) 밝은 바탕에선 원본과 같은 스티커 화법이 된다.
    const stroked = (ctx, S, paths, fill) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [w, color] of [[CORE + RIM * 2, K], [CORE, fill || '#fff']]) {
            ctx.strokeStyle = color;
            ctx.lineWidth = w * S;
            for (const pts of paths) {
                ctx.beginPath();
                pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)));
                ctx.stroke();
            }
        }
        ctx.restore();
    };

    // ---- 닫기 ✕ ----
    // 둥근 캡이 끝점 밖으로 CORE/2 만큼 더 나가므로, 끝점 간격 = 바운딩 - CORE 로 잡아야
    // 흰 잉크 바운딩이 정확히 WX×WY 가 된다(캡 몫을 빼지 않으면 계약보다 커진다).
    const X0 = 0.5 - (WX - CORE) / 2, X1 = 0.5 + (WX - CORE) / 2;
    const Y0 = 0.5 - (WY - CORE) / 2, Y1 = 0.5 + (WY - CORE) / 2;
    G.draw.xmark = function (ctx, S) {
        stroked(ctx, S, [[[X0, Y0], [X1, Y1]], [[X1, Y0], [X0, Y1]]]);
    };

    // ---- 체크 ✓ ----
    // 같은 화법·같은 두께의 꺾은선. ✕ 와 나란히 놓이는 자리(진행 패스 칸·자동제작 필터)라
    // 획 두께가 다르면 두 표시가 다른 세트로 읽힌다 — 그래서 CORE/RIM 을 공유한다.
    // 꺾인 점을 아래로 깊게(0.78) 두어야 14px 안팎에서 'V' 가 아니라 체크로 읽힌다.
    G.draw.check = function (ctx, S, opt) {
        stroked(ctx, S, [[[0.20, 0.52], [0.42, 0.78], [0.82, 0.24]]], opt && opt.tint);
    };
})(IconGen);

/* ============================================================================
 * 상점 보석 패키지 3종 (원본 shot-042632 하단 '보석' 섹션)
 *
 * 원본 3배 확대 실측: 이모지(🪙👛💰)가 아니라 **전부 같은 붉은 보석 묶음**이다 — 양이 늘수록
 *   ① 낱개 6개 피라미드 → ② 보석이 넘치는 자루 → ③ 테두리 두른 큰 항아리 로 커진다.
 *   클론이 쓰던 금화·지갑·돈자루 이모지는 '보석 패키지'라는 정체성 자체가 달랐다(색도 노랑이었다).
 * 색 실측: 보석 링 rgb(239,32,77) · 안쪽 rgb(255,157,186) · 자루/항아리 몸통 rgb(121,52,45).
 * 화풍은 탭바와 같은 스티커형(두꺼운 순검정 키라인 + 평면 채색 + 한 톤 음영).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, circle, ell, rrect, poly } = G._sticker;
    const RED = '#ef204d', PINK = '#ff9dba', WOOD = '#79342d', WOOD_DK = '#4d1f1a';

    // 낱개 보석 — **재화 젬(draw.gem)과 같은 각진 다이아 조형**으로 통일.
    // (원본 실측은 동그란 도넛형이었지만 icon-gen 비평가 2인이 공통 지적: 원형 알갱이는
    //  '산딸기 클러스터'로 읽히고, 상단바 재화 젬(각진 마름모)과 조형 언어가 갈린다.
    //  규칙 1 — 그래픽 퀄은 사용자 지시(AAA)가 원본을 이긴다. 마름모 비율·안쪽면 파생색은
    //  draw.gem 과 같은 식: 안쪽 0.42배, 색은 겉색을 _shade(+0.52)로 밝게 민 값.)
    const gemDot = (ctx, S, x, y, r) => {
        // ⚠️ 키라인 두께는 **보석 반지름에 비례**해야 한다 — 고정 두께로 두면 낱개가 작은 ②③에서
        // 검정이 알을 통째로 먹어 '어두운 덩어리'로 읽힌다(1차 렌더에서 실제로 그랬다).
        const rhomb = (rx, ry) => poly(ctx, S, [[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]]);
        ink(ctx, S, rhomb(r * 0.94, r * 1.02), RED, r * 0.34);
        ink(ctx, S, rhomb(r * 0.40, r * 0.43), G._shade(RED, 0.52), r * 0.20);
        // 좌상단 파셋 스펙큘러 — 원 하이라이트 점 대신 삼각 파셋(각진 보석의 광)
        on(ctx, poly(ctx, S, [[x - r * 0.52, y - r * 0.28], [x - r * 0.06, y - r * 0.78], [x - r * 0.02, y - r * 0.30]]), 'rgba(255,255,255,.75)');
    };
    const ground = (ctx, S, x, y, rx, ry) => on(ctx, ell(ctx, S, x, y, rx, ry), 'rgba(0,0,0,.13)');

    // ① 60젬 — 낱개 6개 피라미드(아래 3 · 가운데 2 · 위 1)
    G.draw.shop_gems1 = function (ctx, S) {
        ground(ctx, S, 0.50, 0.815, 0.36, 0.075);
        const r = 0.118;
        [[0.255, 0.735], [0.500, 0.735], [0.745, 0.735]].forEach(p => gemDot(ctx, S, p[0], p[1], r));
        [[0.378, 0.560], [0.622, 0.560]].forEach(p => gemDot(ctx, S, p[0], p[1], r));
        gemDot(ctx, S, 0.500, 0.385, r);
    };

    // ② 220젬 — 보석이 목까지 차 넘치는 자루
    G.draw.shop_gems2 = function (ctx, S) {
        ground(ctx, S, 0.52, 0.900, 0.30, 0.058);
        // 자루 몸통(아래가 무겁게 퍼진 물방울) + 목
        ink(ctx, S, ell(ctx, S, 0.545, 0.680, 0.245, 0.215), WOOD, 0.060);
        ink(ctx, S, rrect(ctx, S, 0.435, 0.395, 0.225, 0.150, 0.045), WOOD, 0.055);
        ctx.save(); ctx.beginPath(); ell(ctx, S, 0.545, 0.680, 0.245, 0.215)(); ctx.clip();
        on(ctx, ell(ctx, S, 0.700, 0.760, 0.200, 0.190), 'rgba(0,0,0,.22)');   // 오른쪽 아래 음영
        on(ctx, rrect(ctx, S, 0.500, 0.470, 0.030, 0.400, 0.015), 'rgba(0,0,0,.18)'); // 주름
        ctx.restore();
        // 목 위로 솟은 보석 3개
        [[0.455, 0.345, 0.088], [0.560, 0.300, 0.092], [0.655, 0.355, 0.084]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        // 앞으로 굴러 나온 보석 3개
        [[0.215, 0.735, 0.082], [0.310, 0.815, 0.082], [0.170, 0.850, 0.076]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
    };

    // ③ 800젬 — 테두리 두른 큰 항아리, 앞줄에 보석이 줄지어 쏟아진다
    G.draw.shop_gems3 = function (ctx, S) {
        ground(ctx, S, 0.50, 0.925, 0.38, 0.055);
        ink(ctx, S, ell(ctx, S, 0.500, 0.680, 0.335, 0.255), WOOD, 0.058);
        ctx.save(); ctx.beginPath(); ell(ctx, S, 0.500, 0.680, 0.335, 0.255)(); ctx.clip();
        on(ctx, ell(ctx, S, 0.720, 0.800, 0.270, 0.230), 'rgba(0,0,0,.22)');
        on(ctx, rrect(ctx, S, 0.470, 0.440, 0.028, 0.480, 0.014), 'rgba(0,0,0,.16)');
        ctx.restore();
        ink(ctx, S, rrect(ctx, S, 0.245, 0.375, 0.510, 0.090, 0.038), WOOD_DK, 0.052);  // 아가리 테
        // 테 위로 넘치는 보석
        [[0.360, 0.315, 0.078], [0.470, 0.285, 0.082], [0.585, 0.310, 0.078], [0.675, 0.340, 0.070]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        // 앞줄로 쏟아진 보석
        [[0.240, 0.830, 0.076], [0.375, 0.860, 0.076], [0.510, 0.868, 0.076], [0.645, 0.848, 0.076]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
    };

    // ④ 3,300젬 — 널판 궤짝 위로 보석이 산더미로 쌓인 최대 단 (shop-gem-pack-3300).
    //    ①낱개→②자루→③항아리 다음 단이라 '그릇'이 가장 크고 보석 더미가 그릇 위로 제일 높다.
    G.draw.shop_gems4 = function (ctx, S) {
        ground(ctx, S, 0.50, 0.935, 0.42, 0.050);
        // 궤짝 몸통 + 가로 널판 이음 2줄 + 아가리 테 (WOOD 계열은 ②③과 같은 팔레트)
        ink(ctx, S, rrect(ctx, S, 0.175, 0.520, 0.650, 0.390, 0.045), WOOD, 0.055);
        ctx.save(); ctx.beginPath(); rrect(ctx, S, 0.175, 0.520, 0.650, 0.390, 0.045)(); ctx.clip();
        on(ctx, rrect(ctx, S, 0.175, 0.640, 0.650, 0.022, 0.011), 'rgba(0,0,0,.20)');
        on(ctx, rrect(ctx, S, 0.175, 0.775, 0.650, 0.022, 0.011), 'rgba(0,0,0,.20)');
        on(ctx, rrect(ctx, S, 0.640, 0.520, 0.185, 0.390, 0.040), 'rgba(0,0,0,.16)'); // 오른쪽 음영
        ctx.restore();
        ink(ctx, S, rrect(ctx, S, 0.150, 0.455, 0.700, 0.095, 0.040), WOOD_DK, 0.052);
        // 아가리 위 보석 산 — 아래 4 · 가운데 3 · 꼭대기 1 (③보다 한 단 높은 피라미드)
        [[0.290, 0.400, 0.082], [0.430, 0.415, 0.086], [0.570, 0.415, 0.086], [0.710, 0.400, 0.082]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        [[0.360, 0.270, 0.084], [0.500, 0.255, 0.090], [0.640, 0.270, 0.084]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        gemDot(ctx, S, 0.500, 0.130, 0.088);
        // 앞줄로 쏟아진 보석 — ③과 같은 바닥선에 한 개 더
        [[0.150, 0.845, 0.074], [0.290, 0.878, 0.076], [0.435, 0.888, 0.076], [0.580, 0.882, 0.076], [0.720, 0.858, 0.074]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
    };
})(IconGen);

/* ============================================================================
 * 상점 '오늘의 특가' 3종 상품 일러스트 (원본 shot-042632 · 5배 확대 실측)
 *
 * 종전 클론은 `.shop-deal-art` 를 CSS 그라디언트 상자 + 회색 금속판 위 이모지(🔧🐾⚙️)로
 * 그렸다. 원본을 확대해 보면 셋 다 **3/4 부감 나무 상자 + 상자 앞에 놓인 소품**이고,
 * 상자 색·소품·앞면 표식이 거래 종류마다 다르다(인계 메모 ㉥ — "이모지를 아이콘으로"만
 * 생각하면 틀린 그림을 그린다):
 *   ① 기술 = 적갈색 목상자 + 앞면에 검은 렌치, 앞에 붉은 물약 2병
 *   ② 펫   = 골판지 상자(윗면 접이선·앞면 공기구멍 2개) + 회색 발바닥 도장, 앞에 공 장난감·초록 링
 *   ③ 탈것 = 짙은 초록 궤짝(가로 널판 + 말굽 표식) + 위로 넘치는 주황 태엽 더미, 앞에 흘린 태엽
 *
 * 실측(앱 폭 490 기준 — ⚠️ 이미지 폭 500 이 아니다, `probe-shop-art-ref.js` 머리말):
 *   일러 바운딩 박스 x 307~418(22.9%W) · y 189~258(7.9%H) · 종횡비 1.52.
 *   그래서 이 3종만 **가로로 긴 캔버스**(`IconGen.ASPECT` 1.52)에 그린다. 정사각으로 그리면
 *   `.ico { background-size: contain }` 이 세로에 맞춰 줄여 프레임 좌우가 텅 빈다.
 * 좌표계: 세로 1.0 을 단위로 쓰고 x 는 0~1.52 를 쓴다 — `_sticker` 헬퍼가 두 축 모두 S(세로
 *   픽셀)를 곱하므로 별도 변환 없이 그대로 맞는다.
 * ============================================================================ */
(function (G) {
    const { K, ink, inkEO, on, circle, ell, poly, rrect, bar } = G._sticker;

    // 상자 공통 기하 (원본 5배 확대에서 딴 값을 위 좌표계로 환산)
    const FX0 = 0.260, FX1 = 1.245;          // 앞면 좌·우
    const DX = 0.232, DY = -0.185;           // 깊이 벡터(뒤·위)
    const LW = 0.052;                        // 키라인 두께

    // 3/4 부감 상자. 윗면 → 오른면 → 앞면 순서로 그린다(앞면이 마지막이라 모서리 키라인이
    // 겹쳐 두꺼워지지 않는다). y0/y1 은 거래마다 다르다(탈것 궤짝은 낮고 넓다).
    const crate = (ctx, S, c, y0, y1) => {
        ink(ctx, S, poly(ctx, S, [[FX0, y0], [FX1, y0], [FX1 + DX, y0 + DY], [FX0 + DX, y0 + DY]]), c.top, LW);
        ink(ctx, S, poly(ctx, S, [[FX1, y0], [FX1 + DX, y0 + DY], [FX1 + DX, y1 + DY], [FX1, y1]]), c.side, LW);
        ink(ctx, S, rrect(ctx, S, FX0, y0, FX1 - FX0, y1 - y0, 0.028), c.front, LW);
    };
    // 앞면 안쪽에만 얹는 칠(널판 이음선·표식) — 클립해서 키라인을 넘지 않게 한다.
    const onFront = (ctx, S, y0, y1, fn) => {
        ctx.save();
        ctx.beginPath(); rrect(ctx, S, FX0, y0, FX1 - FX0, y1 - y0, 0.028)(); ctx.clip();
        fn();
        ctx.restore();
    };
    const shadow = (ctx, S, x, rx) => on(ctx, ell(ctx, S, x, 0.905, rx, 0.062), 'rgba(0,0,0,.15)');

    // ---- ① 기술 거래 — 적갈색 목상자 + 렌치, 앞에 물약 2병 ----
    const TEAL = '#5ab6c8', GLASS_DK = '#2e7f92', LIQ = '#b01221', LIQ_DK = '#7d0a16', CORK = '#c39a2e';

    // 물약: 목(뒤) → 병(앞) 순. 원본은 **유리 테가 청록, 속 액체가 검붉은색**이다.
    const flask = (ctx, S, x, y, r, neck) => {
        ink(ctx, S, rrect(ctx, S, x - r * 0.30, y - r - neck, r * 0.60, neck + r * 0.7, r * 0.16), TEAL, LW * 0.85);
        ink(ctx, S, rrect(ctx, S, x - r * 0.38, y - r - neck - r * 0.34, r * 0.76, r * 0.40, r * 0.10), CORK, LW * 0.85);
        ink(ctx, S, circle(ctx, S, x, y, r), TEAL, LW);
        on(ctx, circle(ctx, S, x, y + r * 0.06, r * 0.74), LIQ);
        on(ctx, ell(ctx, S, x + r * 0.34, y + r * 0.40, r * 0.44, r * 0.34), LIQ_DK);
        on(ctx, circle(ctx, S, x - r * 0.34, y - r * 0.30, r * 0.17), 'rgba(255,255,255,.85)');
        on(ctx, rrect(ctx, S, x - r * 0.22, y - r - neck * 0.85, r * 0.16, neck * 0.62, r * 0.08), 'rgba(255,255,255,.55)');
    };

    G.draw.shop_tech = function (ctx, S) {
        const y0 = 0.250, y1 = 0.778;
        shadow(ctx, S, 0.78, 0.52);
        crate(ctx, S, { front: '#96604f', top: '#b07a66', side: '#6d4034' }, y0, y1);
        onFront(ctx, S, y0, y1, () => {
            on(ctx, rrect(ctx, S, FX0, y0, FX1 - FX0, 0.100, 0), 'rgba(255,255,255,.16)');          // 뚜껑 판(밝게)
            on(ctx, rrect(ctx, S, FX0, y0 + 0.100, FX1 - FX0, 0.030, 0.012), 'rgba(0,0,0,.72)');    // 뚜껑 이음선
            on(ctx, rrect(ctx, S, FX0 + 0.070, y0 + 0.130, 0.026, y1 - y0, 0), 'rgba(0,0,0,.52)');  // 왼쪽 기둥
            on(ctx, rrect(ctx, S, FX1 - 0.096, y0 + 0.130, 0.026, y1 - y0, 0), 'rgba(0,0,0,.52)');  // 오른쪽 기둥
            on(ctx, rrect(ctx, S, FX0, y1 - 0.070, FX1 - FX0, 0.070, 0), 'rgba(0,0,0,.16)');        // 아래턱 음영
        });
        // 윗면 널판 이음선
        on(ctx, poly(ctx, S, [[FX0 + DX * 0.52, y0 + DY * 0.52], [FX1 + DX * 0.52, y0 + DY * 0.52],
            [FX1 + DX * 0.52 + 0.012, y0 + DY * 0.52 + 0.026], [FX0 + DX * 0.52 + 0.012, y0 + DY * 0.52 + 0.026]]), 'rgba(0,0,0,.34)');

        // 렌치 — 자루(둥근 꼬리)와 열린 C 머리를 **한 경로**로 그린다. ink()가 먼저 스트로크하고
        // 그 위에 칠하므로 두 서브패스가 겹친 안쪽 키라인은 칠에 덮여 사라진다(윤곽만 남는다).
        ctx.save();
        ctx.translate(0.570 * S, 0.632 * S); ctx.rotate(-0.40);
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        G._rrSub(ctx, -0.075 * S, -0.038 * S, 0.415 * S, 0.076 * S, 0.038 * S); // 자루
        ctx.moveTo(0.415 * S + 0.118 * S, 0);                                    // 열린 C 머리(오른쪽으로 벌어짐)
        ctx.arc(0.415 * S, 0, 0.118 * S, 0.22 * Math.PI, 1.78 * Math.PI);
        ctx.arc(0.415 * S, 0, 0.056 * S, 1.78 * Math.PI, 0.22 * Math.PI, true);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 0.026 * S; ctx.stroke();
        ctx.fillStyle = '#17171a'; ctx.fill();
        ctx.restore();

        flask(ctx, S, 0.145, 0.700, 0.138, 0.142);
        flask(ctx, S, 0.312, 0.748, 0.116, 0.100);
    };

    // ---- ② 펫 거래 — 골판지 상자 + 발바닥 도장, 앞에 공·초록 링 ----
    G.draw.shop_pet = function (ctx, S) {
        const y0 = 0.250, y1 = 0.778;
        shadow(ctx, S, 0.78, 0.52);
        crate(ctx, S, { front: '#a5764a', top: '#bd8d5f', side: '#7b5533' }, y0, y1);
        // 윗면 접이선 2줄(골판지 뚜껑) — 앞모서리에서 뒤로 간다
        on(ctx, bar(ctx, S, FX0 + 0.30, y0, FX0 + 0.30 + DX, y0 + DY, 0.020), 'rgba(0,0,0,.30)');
        on(ctx, bar(ctx, S, FX1 - 0.14, y0, FX1 - 0.14 + DX, y0 + DY, 0.020), 'rgba(0,0,0,.30)');
        onFront(ctx, S, y0, y1, () => {
            on(ctx, circle(ctx, S, 0.400, 0.400, 0.042), '#3a2415');    // 공기구멍
            on(ctx, circle(ctx, S, 1.110, 0.400, 0.042), '#3a2415');
        });
        // 발바닥 도장 — 발가락 4개(바깥 2개가 아래로 처진 부채꼴) + 아래 넓은 패드.
        // ⚠️ 1차 렌더에서 발가락을 작게(rx .036) 잡았더니 106px 프레임에서 '알약 4개'로 읽혔다 —
        //    발가락은 패드 폭의 1/3 이상이어야 발바닥으로 읽힌다.
        const PAW = '#c9c9c9';
        [[0.678, 0.487, 0.046, 0.058], [0.792, 0.440, 0.048, 0.061],
         [0.908, 0.440, 0.048, 0.061], [1.020, 0.487, 0.046, 0.058]]
            .forEach(t => ink(ctx, S, ell(ctx, S, t[0], t[1], t[2], t[3]), PAW, LW * 0.62));
        ink(ctx, S, ell(ctx, S, 0.850, 0.645, 0.148, 0.098), PAW, LW * 0.62);

        // 소품: 뒤쪽 공 → 앞쪽 공 → 초록 링 순(뒤에서 앞으로).
        // ⚠️ 1차 렌더는 흰 공 위에 새까만 원을 얹어 **눈알 두 개**로 읽혔다 — 검정 얼룩은
        //    공의 위쪽 가장자리를 물고 지나가는 띠여야 하고, 아래엔 회색 음영이 있어야 공이 된다.
        const ballTop = (x, y, r) => {
            ctx.save(); ctx.beginPath(); circle(ctx, S, x, y, r)(); ctx.clip();
            on(ctx, ell(ctx, S, x - r * 0.30, y - r * 0.86, r * 0.92, r * 0.62, -0.35), '#33333a');
            on(ctx, ell(ctx, S, x + r * 0.30, y + r * 0.52, r * 0.85, r * 0.60), 'rgba(0,0,0,.16)');
            ctx.restore();
            on(ctx, circle(ctx, S, x - r * 0.34, y + r * 0.10, r * 0.20), 'rgba(255,255,255,.9)');
        };
        ink(ctx, S, circle(ctx, S, 0.300, 0.612, 0.112), '#e9e9ea', LW);
        ballTop(0.300, 0.612, 0.112);
        ink(ctx, S, circle(ctx, S, 0.162, 0.742, 0.140), '#e9e9ea', LW);
        ballTop(0.162, 0.742, 0.140);
        inkEO(ctx, S, () => { ell(ctx, S, 0.480, 0.808, 0.175, 0.086)(); ell(ctx, S, 0.480, 0.808, 0.094, 0.036)(); }, '#1c7a2a', LW);
    };

    // ---- ③ 탈것 거래 — 초록 궤짝 + 넘치는 태엽 ----
    // 태엽 하나 = 주황 고리(도넛) + 노란 축. 더미로 쌓이면 원본처럼 '주황 뭉치에 노란 조각'으로 읽힌다.
    const winder = (ctx, S, x, y, sc, rot) => {
        ctx.save();
        ctx.translate(x * S, y * S); ctx.rotate(rot); ctx.scale(sc * S, sc * S);
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath(); G._rrSub(ctx, 0.30, -0.15, 0.82, 0.30, 0.15);
        ctx.strokeStyle = K; ctx.lineWidth = 0.22; ctx.stroke();
        ctx.fillStyle = '#ffc21e'; ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 0.52, 0, Math.PI * 2);
        ctx.arc(0, 0, 0.23, 0, Math.PI * 2, true);
        ctx.strokeStyle = K; ctx.lineWidth = 0.22; ctx.stroke();
        ctx.fillStyle = '#f4791f'; ctx.fill('evenodd');
        ctx.restore();
    };

    G.draw.shop_mount = function (ctx, S) {
        const y0 = 0.470, y1 = 0.815;
        shadow(ctx, S, 0.76, 0.50);
        crate(ctx, S, { front: '#2e6b31', top: '#3d8038', side: '#1d4a23' }, y0, y1);
        onFront(ctx, S, y0, y1, () => {
            on(ctx, rrect(ctx, S, FX0, y0 + 0.104, FX1 - FX0, 0.022, 0.009), 'rgba(0,0,0,.46)');   // 널판 이음선
            on(ctx, rrect(ctx, S, FX0, y0 + 0.216, FX1 - FX0, 0.022, 0.009), 'rgba(0,0,0,.46)');
            on(ctx, rrect(ctx, S, FX0, y1 - 0.055, FX1 - FX0, 0.055, 0), 'rgba(0,0,0,.16)');
        });
        // 말굽 표식 — 원본은 앞면 가운데 아래에 굵게 찍혀 있다(1차 렌더는 반지처럼 작았다)
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0.752 * S, 0.712 * S, 0.098 * S, Math.PI * 1.06, Math.PI * 1.94);
        ctx.strokeStyle = '#12331a'; ctx.lineWidth = 0.052 * S; ctx.stroke();
        ctx.restore();
        // 넘치는 태엽 더미 — **궤짝 윗면을 통째로 덮는다.** 원본에서 윗면 초록은 한 점도 안 보이고
        // 태엽이 앞 모서리 위로 흘러넘친다. 1차 렌더는 더미를 상자보다 먼저 그려 윗면에 가려졌다.
        [[0.300, 0.185], [0.500, 0.170], [0.700, 0.178], [0.900, 0.166], [1.095, 0.180], [1.270, 0.205],
         [0.235, 0.290], [0.420, 0.272], [0.605, 0.264], [0.790, 0.262], [0.975, 0.268], [1.160, 0.282], [1.340, 0.305],
         [0.300, 0.382], [0.480, 0.372], [0.660, 0.366], [0.840, 0.366], [1.020, 0.372], [1.200, 0.386], [1.375, 0.408],
         [0.375, 0.458], [0.605, 0.452], [0.840, 0.452], [1.075, 0.458], [1.300, 0.478]]
            .forEach((w, i) => winder(ctx, S, w[0], w[1], 0.132, ((i * 2.399) % 6.283) - 3.14));
        // 앞으로 흘러나온 태엽
        [[0.168, 0.792, 0.124, 0.6], [0.312, 0.856, 0.116, -1.2], [0.086, 0.898, 0.104, 2.1]]
            .forEach(w => winder(ctx, S, w[0], w[1], w[2], w[3]));
    };
})(IconGen);

/* ============================================================================
 * 재화 pill 의 초록 `+` 배지 (원본 shot-043224·042632 6배 확대)
 *
 * 원본은 pill 옆에 놓인 **원형 버튼이 아니라**, 재화 아이콘의 오른쪽 아래에 걸치는
 * **굵은 초록 십자(플러스) 스티커**다 — 검정 키라인 + 밝은 초록 면 + 위쪽 하이라이트.
 * 클론은 주황/빨강 원 안에 얇은 `+` 글자를 pill **왼쪽 안**에 넣어, 모양도 자리도 달랐고
 * 그만큼 pill 이 가로로 늘어나 있었다(코인 pill 106.8px = 21.4%W, 원본 ≈17.3%W).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect } = G._sticker;
    G.draw.plus = function (ctx, S) {
        /* 이 배지는 화면에서 **12px 안팎**으로 뜬다 — 아이콘 중 가장 작다. 그래서 키라인 비율이
           코인·젬보다도 커야 한다(원본 실측: 검정 띠 2px / 십자 폭 12.8px ≈ 15.6%). 종전 값
           `lw 0.115` 은 12px 표시에서 **0.7px** 이라 축소 보간에 통째로 녹아, 확대 대조에서
           '테 없는 흐린 초록 십자'로 보였다. 띠를 넣을 자리를 만들려고 십자 자체를 줄였다
           (반길이 0.425 → 0.360 · 반폭 0.158 → 0.125): 안 줄이면 바깥 지름이 1 을 넘어 잘린다.
           채움도 원본 실측색으로 바꿨다 — 원본은 `rgb(4,255,0)` 순초록이고 종전 `#3ad12f` 는
           한참 어두웠다(작게 뜨는 배지라 이 채도 차가 그대로 '흐리다'로 읽힌다). */
        const c = 0.5, a = 0.125, R = 0.360;   // 팔 반폭 · 반길이
        const P = [[c - a, c - R], [c + a, c - R], [c + a, c - a], [c + R, c - a], [c + R, c + a], [c + a, c + a],
                   [c + a, c + R], [c - a, c + R], [c - a, c + a], [c - R, c + a], [c - R, c - a], [c - a, c - a]];
        ink(ctx, S, poly(ctx, S, P), '#04ff00', 0.240);
        // 아래 팔만 한 톤 어둡게 — 스티커 화법의 2톤(클립해서 십자 밖으로 안 샌다)
        ctx.save(); ctx.beginPath(); poly(ctx, S, P)(); ctx.clip();
        on(ctx, rrect(ctx, S, c - a, c + 0.13, a * 2, 0.30, 0.02), '#00c400');
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 연필 — 프로필 팝업의 편집 버튼 3곳 (원본 shot-042724 12배 확대)
 *
 * 원본: 파란 라운드 사각 버튼(아래턱 남색 + 검정 키라인) 안에 **흰 연필이 좌하→우상 대각**으로
 * 누워 있다. 촉은 왼쪽 아래로 뾰족하고 심은 검정, 몸통 아래-오른쪽 면에 한 톤 회색 음영이 있다.
 * 버튼 자체(파란 면·아래턱)는 CSS(`.profile-edit-btn`)가 그리므로 여기선 연필만 그린다.
 * ============================================================================ */
(function (G) {
    const { ink, on, poly } = G._sticker;
    G.draw.pencil = function (ctx, S) {
        const BODY = '#f4f4f6', SHADE = '#b7bac2', LEAD = '#26262c';
        const u = 0.7071, w = 0.118;                       // 45° 방향 단위 · 몸통 반폭
        const P0 = [0.360, 0.640], P1 = [0.760, 0.240];    // 촉쪽 끝 · 지우개쪽 끝(중심선)
        const n = [w * u, w * u];                          // 중심선에 직교하는 반폭 벡터
        const A = [P0[0] + n[0], P0[1] + n[1]], B = [P1[0] + n[0], P1[1] + n[1]];
        const C = [P1[0] - n[0], P1[1] - n[1]], D = [P0[0] - n[0], P0[1] - n[1]];
        const tip = [P0[0] - 0.22 * u, P0[1] + 0.22 * u];
        const shape = poly(ctx, S, [tip, A, B, C, D]);
        ink(ctx, S, shape, BODY, 0.082);
        ctx.save(); ctx.beginPath(); shape(); ctx.clip();
        on(ctx, poly(ctx, S, [P0, P1, C, D]), SHADE);      // 아래-오른쪽 면
        const q = [P0[0] - 0.13 * u, P0[1] + 0.13 * u];    // 촉(심) — 끝에서 조금 올라온 삼각형
        on(ctx, poly(ctx, S, [tip, [q[0] + n[0], q[1] + n[1]], [q[0] - n[0], q[1] - n[1]]]), LEAD);
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 자동 반복 고리 · 채팅 말풍선 (원본 shot-042120 확대)
 *
 * ⓐ `autoloop` — [자동] 버튼 안. 원본은 **흰 원형 2화살 고리**(검정 외곽선)다. 클론은 🔄 이모지라
 *    바로 옆의 코드 생성 자물쇠와 화풍이 갈렸다(파란 사각 배경이 통째로 얹혀 있었다).
 * ⓑ `chatbubble` — 하단 채팅 미리보기. 원본은 **꼬리가 왼쪽 아래로 난 흰 말풍선 + 짙은 회색 점 3개**
 *    이고 뒤에 카드가 없다. 클론은 💬 이모지(꼬리가 오른쪽 아래)를 흰 카드 안에 넣어 두 겹이었다.
 *    ⚠️ 원본 미리보기 바는 회색이라 흰 말풍선이 그대로 읽히지만 클론 바는 크림색이다 —
 *    그래서 클론 전역 화풍대로 **검정 키라인을 준다**(바 색은 이 항목 소관이 아니다).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect, circle } = G._sticker;

    // 링 조각 + 끝 화살촉을 한 경로로 — 안팎 호를 잇고 화살촉 삼각형을 끼워 넣는다.
    const arcArrow = (ctx, S, cx, cy, R, tw, a0, a1, fill, lw) => {
        const X = (r, a) => [cx * S + Math.cos(a) * r * S, cy * S + Math.sin(a) * r * S];
        const dir = a1 > a0 ? 1 : -1, head = 0.30 * dir;
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(...X(R + tw / 2, a0));
        ctx.arc(cx * S, cy * S, (R + tw / 2) * S, a0, a1, dir < 0);
        ctx.lineTo(...X(R + tw * 1.25, a1));
        ctx.lineTo(...X(R, a1 + head));                  // 화살촉 끝
        ctx.lineTo(...X(R - tw * 1.25, a1));
        ctx.arc(cx * S, cy * S, (R - tw / 2) * S, a1, a0, dir > 0);
        ctx.closePath();
        ctx.strokeStyle = K; ctx.lineWidth = lw * S; ctx.stroke();
        ctx.fillStyle = fill; ctx.fill();
        ctx.restore();
    };

    G.draw.autoloop = function (ctx, S) {
        const P = Math.PI, W = '#f4f4f6';
        // ⚠️ 호 끝각 + 화살촉 각(0.30rad ≈ 0.095π)이 다음 호의 시작각을 넘으면 두 화살촉이
        //    겹쳐 고리가 아니라 소용돌이 덩어리로 읽힌다(0.84π + head 0.40 에서 실제로 그랬다).
        arcArrow(ctx, S, 0.5, 0.5, 0.305, 0.165, P * 0.14, P * 0.82, W, 0.078);
        arcArrow(ctx, S, 0.5, 0.5, 0.305, 0.165, P * 1.14, P * 1.82, W, 0.078);
    };

    G.draw.chatbubble = function (ctx, S) {
        const DOT = '#4a4a52';
        // 몸통 + 왼쪽 아래 꼬리를 한 경로로(겹친 안쪽 키라인은 칠에 덮인다)
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        G._rrSub(ctx, 0.085 * S, 0.185 * S, 0.83 * S, 0.505 * S, 0.145 * S);
        poly(ctx, S, [[0.190, 0.605], [0.120, 0.945], [0.455, 0.680]])();
        ctx.closePath();
        ctx.strokeStyle = K; ctx.lineWidth = 0.078 * S; ctx.stroke();
        ctx.fillStyle = '#f7f7f8'; ctx.fill();
        ctx.restore();
        [[0.295, 0.438], [0.500, 0.438], [0.705, 0.438]]
            .forEach(d => on(ctx, circle(ctx, S, d[0], d[1], 0.077), DOT));
    };
})(IconGen);

/* ============================================================================
 * 진행 패스 머리의 큰 검 (원본 shot-042705 4배 확대 실측)
 *
 * 원본은 **아래를 향한 육중한 3/4 검**이다 — 위에서부터 둥근 회색 폼멜, 주황 감은 손잡이,
 * 좌우로 넓은 십자 가드(왼쪽 밝은 회색 / 오른쪽 짙은 슬레이트), 그 아래 두 톤 칼날이
 * 배너 뒤로 내려간다. **칼끝은 배너에 가려 안 보이므로 그리지 않고 아래 변까지 채운다.**
 * 클론은 🗡️ 이모지를 -45° 돌려 쓴 것이라 가늘고 장식적이었고, 회전 탓에 바운딩 박스가
 * 실제 그림보다 훨씬 커서 자리 잡기도 어려웠다(QA 4차 메모의 잘림 사고가 그 때문이다).
 *
 * 실측(원본 픽셀): 검 전체 y 29.5~142.5(113px) · x 208.75~271.25(62.5px) → **종횡비 0.553**.
 *   폼멜 y 0~0.137 · 손잡이 0.125~0.490 · 가드 0.485~0.635(폭 100%) · 칼날 0.630~1.0(폭 60%).
 *   좌우 두 톤 경계는 가드·칼날 모두 거의 정가운데다.
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect, ell } = G._sticker;
    G.draw.passsword = function (ctx, S) {
        const W = ctx.canvas.width / S, cx = W / 2;      // 가로로 좁은 캔버스(ASPECT 0.553)
        const GRIP = '#c96a24', GRIP_DK = '#8f430f', POMMEL = '#a8adb2';
        const GUARD_L = '#d2d7db', GUARD_R = '#3b4a58';
        const BLADE_L = '#c9d0d5', BLADE_R = '#7c96a2';
        const hw = (f) => W * f / 2;                     // 폭 비율 → 반폭

        on(ctx, ell(ctx, S, cx, 0.965, W * 0.42, 0.052), 'rgba(0,0,0,.42)');       // 접지 그림자

        // 손잡이 → 폼멜 순서로 뒤에서 앞으로. 손잡이 아랫동은 가드가 덮는다.
        ink(ctx, S, rrect(ctx, S, cx - hw(0.32), 0.115, W * 0.32, 0.395, W * 0.05), GRIP, 0.048);
        ctx.save(); ctx.beginPath(); rrect(ctx, S, cx - hw(0.32), 0.115, W * 0.32, 0.395, W * 0.05)(); ctx.clip();
        [0.13, 0.235, 0.34, 0.445].forEach(y =>                                    // 감은 자국(사선)
            on(ctx, poly(ctx, S, [[cx - hw(1), y + 0.052], [cx + hw(1), y - 0.012],
                                  [cx + hw(1), y + 0.026], [cx - hw(1), y + 0.090]]), GRIP_DK));
        ctx.restore();
        ink(ctx, S, rrect(ctx, S, cx - hw(0.48), 0.008, W * 0.48, 0.130, W * 0.13), POMMEL, 0.048);
        on(ctx, rrect(ctx, S, cx - hw(0.40), 0.022, W * 0.22, 0.040, W * 0.06), 'rgba(255,255,255,.35)');

        // 칼날 — 칼끝 없이 아래 변까지
        const blade = rrect(ctx, S, cx - hw(0.60), 0.618, W * 0.60, 0.382, W * 0.03);
        ink(ctx, S, blade, BLADE_L, 0.048);
        ctx.save(); ctx.beginPath(); blade(); ctx.clip();
        on(ctx, rrect(ctx, S, cx, 0.610, W * 0.32, 0.400, 0), BLADE_R);
        ctx.restore();

        // 십자 가드
        const guard = rrect(ctx, S, W * 0.020, 0.482, W * 0.960, 0.155, W * 0.035);
        ink(ctx, S, guard, GUARD_L, 0.048);
        ctx.save(); ctx.beginPath(); guard(); ctx.clip();
        on(ctx, rrect(ctx, S, cx, 0.470, W * 0.52, 0.180, 0), GUARD_R);
        on(ctx, rrect(ctx, S, W * 0.020, 0.482, W * 0.960, 0.028, 0), 'rgba(255,255,255,.30)');
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 메인 화면 웨이포인트 (원본 shot-042120 8배 확대)
 *
 * `index.html` 이 🎁·❓ 이모지를 그대로 박아 두고 있었다. 원본을 확대해 보면 다른 그림이다:
 *   ⓑ 미스터리(`wp_mystery`) = **갈색 통나무 위에 앉은 초록 덩어리 생물**(검은 눈 두 줄 + 삐죽한
 *      테두리)이고 머리 위에 흰 `?` 가 떠 있다. ❓ 이모지(빨간 라운드 사각)와는 아예 다른 물건이다.
 * (ⓐ 리그 보상 `wp_league` 은 아래 주석대로 폐기됐다 — 사용자 지시 2026-08-19.)
 * `?` 는 폰트에 기대지 않고 **호 + 막대 + 점 경로**로 그린다(캔버스 폰트는 환경마다 달라진다).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect, circle, ell, bar } = G._sticker;

    // 흰 물음표 — 위 갈고리(고리 조각) + 아래 짧은 막대 + 점
    const question = (ctx, S, cx, cy, r) => {
        const W = '#fff', lw = r * 0.42;
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx * S, cy * S, r * S, Math.PI * 1.10, Math.PI * 0.35);
        ctx.strokeStyle = K; ctx.lineWidth = (lw + r * 0.34) * S; ctx.stroke();
        ctx.strokeStyle = W; ctx.lineWidth = lw * S; ctx.stroke();
        ctx.restore();
        ink(ctx, S, bar(ctx, S, cx + r * 0.62, cy + r * 0.62, cx, cy + r * 1.30, lw), W, r * 0.34);
        // ⚠️ 점 반지름을 키라인보다 작게 잡으면 **스트로크의 안쪽 절반이 흰 알을 통째로 먹어**
        //    검은 점이 된다(1차 렌더에서 초록 몸통 위 점이 아예 안 보였다).
        ink(ctx, S, circle(ctx, S, cx, cy + r * 1.98, lw * 1.02), W, r * 0.20);
    };

    // 🗑 `wp_league`(회색 시상대 3단 + 주황 왕관 + 초록 시험관) 드로어는 삭제했다 —
    //    그 시상대+왕관이 곧 랭킹 버튼으로 읽혀 사용자 지시 2026-08-19("메인에 왼쪽에 랭킹 버튼 없애기")로
    //    메인의 리그 보상 이정표를 통째로 걷어냈고, 남은 참조가 하나도 없어 그림도 같이 폐기했다.
    //    리그 보상 팝업 자체는 PVP 탭 → 리그 시트의 시즌 바로 그대로 들어간다.

    G.draw.wp_mystery = function (ctx, S) {
        const BODY = '#2d8b3a', BODY_DK = '#1c6b28', WOOD = '#7a4a26', WOOD_DK = '#553017';
        ink(ctx, S, rrect(ctx, S, 0.150, 0.780, 0.700, 0.150, 0.060), WOOD, 0.055);      // 통나무 받침
        on(ctx, rrect(ctx, S, 0.150, 0.868, 0.700, 0.062, 0.030), WOOD_DK);
        // 몸통 — 둥근 덩어리 + 좌우로 삐죽한 뿔
        ink(ctx, S, poly(ctx, S, [[0.120, 0.660], [0.048, 0.588], [0.140, 0.560], [0.086, 0.470],
            [0.190, 0.478], [0.185, 0.392], [0.300, 0.392], [0.500, 0.318], [0.700, 0.392],
            [0.815, 0.392], [0.810, 0.478], [0.914, 0.470], [0.860, 0.560], [0.952, 0.588],
            [0.880, 0.660], [0.880, 0.800], [0.120, 0.800]]), BODY, 0.058);
        on(ctx, poly(ctx, S, [[0.560, 0.400], [0.880, 0.560], [0.880, 0.800], [0.560, 0.800]]), 'rgba(0,0,0,.10)');
        // 검은 눈 두 줄
        // ⚠️ 눈을 0.36/0.64 · rx 0.135~0.155 로 두면 **두 눈이 붙어 검은 덩어리 하나**로 읽힌다
        //    (1차 렌더가 그랬다). 원본은 눈 사이가 확실히 벌어져 있다.
        ink(ctx, S, ell(ctx, S, 0.320, 0.590, 0.112, 0.066, -0.10), '#0b0b0d', 0.030);
        ink(ctx, S, ell(ctx, S, 0.678, 0.582, 0.128, 0.072, 0.08), '#0b0b0d', 0.030);
        on(ctx, circle(ctx, S, 0.640, 0.556, 0.028), 'rgba(255,255,255,.85)');
        question(ctx, S, 0.500, 0.150, 0.098);
    };
})(IconGen);

/* ============================================================================
 * 채팅 전투 공유 배지 (원본 shot-043500 · 12배 확대 + 픽셀 실루엣 맵으로 실측)
 *
 * 클론은 파랑 배경·검정 테두리를 **CSS 로** 칠하고 그 안에 📹 이모지를 넣었다. 원본은
 * 이모지가 아니라 **탭바와 같은 스티커형 배지 한 덩어리**다 — 순검정 키라인 두른 파랑
 * 라운드 사각 + 아래쪽 진남색 베벨 띠 + 흰 비디오캠 글리프. 그래서 배경/테두리까지
 * 통째로 아이콘 하나로 그리고 CSS 쪽은 빈 정사각 프레임만 남긴다.
 *
 * 실측(원본 픽셀, 배지 바깥 상자 = x430..448 · y548..566 → **19×19 정사각**):
 *   파랑 rgb(0,93,255) · 아래 베벨 rgb(0,28,78) · 키라인 순검정 1px(=5.3%) · 모서리 R 3px(15.8%)
 *   베벨 띠는 y563 부터 → 상자의 78.9% 지점.
 *   흰 글리프: 몸통 x434.5~440.5 · y554.5~560.5 (둘 다 상자의 31.6%, 정사각)
 *              렌즈는 **꼭짓점이 왼쪽(몸통 쪽)을 향한 삼각형** — 밑변 x444.5 가 몸통과 같은
 *              세로 범위를 덮고 꼭짓점이 y 한가운데(557.5)에서 몸통에 닿는다.
 *   ⚠️ 행 프로파일에서 y555·556·559 는 몸통과 렌즈가 **떨어져** 보이고 y557·558 만 이어진다 —
 *      두 도형을 **한 경로**로 칠하면 이 모양이 저절로 나온다(맞닿은 구간만 키라인이 칠에 덮인다).
 *      그래서 꼭짓점을 몸통 오른쪽 변(0.553)보다 약간 안쪽(0.540)에 둬 확실히 잇는다.
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect } = G._sticker;
    const BLUE = '#005dff', BEVEL = '#001c4e';
    const LW = 0.105;    // 배지 키라인 — 보이는 두께 = LW/2 = 5.3%(19px 기준 1px)
    const GLW = 0.092;   // 글리프 키라인 — 쐐기가 얇아 배지보다 가늘게, 그러나 축소 후
                         // 순검정으로 앉을 만큼은 두껍게(0.072 는 회색으로만 떴다)

    G.draw.chatcam = function (ctx, S) {
        // ① 파랑 라운드 사각 — ink 는 경로 중심에 스트로크하므로 LW/2 만큼 안쪽으로 넣어야
        //    키라인 바깥선이 상자 변에 딱 맞는다.
        const i = LW / 2, box = rrect(ctx, S, i, i, 1 - LW, 1 - LW, 0.158 - i);
        ink(ctx, S, box, BLUE, LW);
        // ② 아래 베벨 띠 — 실루엣 안으로 clip 해서 라운드 모서리를 안 넘게 한다.
        ctx.save(); ctx.beginPath(); box(); ctx.clip();
        on(ctx, poly(ctx, S, [[0, 0.789], [1, 0.789], [1, 1], [0, 1]]), BEVEL);
        ctx.restore();
        // ③ 흰 비디오캠 — 몸통과 렌즈를 **겹친 서브패스 2개로 두면 안 된다**: 맞닿는 꼭짓점 부근에서
        //    두 도형의 안쪽 변이 각자 스트로크돼 검정 쐐기가 두껍게 뭉친다(1차 렌더에서 실제로 그랬다).
        //    합집합 윤곽을 **닫힌 폴리곤 하나**로 직접 적어 내부 스트로크 자체를 없앤다 —
        //    오른쪽 변 한가운데를 렌즈 꼭짓점까지 파고드는 V 노치가 원본의 '몸통+렌즈' 실루엣이다.
        //    ⚠️ 세로는 **경로보다 흰 속살이 0.026 씩 줄어든다**(스트로크 안쪽 절반 + 128→19px 축소의
        //    가장자리 침식). 1차 값 0.342~0.658 은 흰 행이 5줄만 남아 원본 6줄보다 1px 짧았다 —
        //    아래를 0.710 까지 늘려 실측 흰 구간을 원본과 같은 0.368~0.684 로 맞췄다.
        //    ⚠️ 키라인은 **글리프 쪽만 얇게** 쓴다(GLW): 렌즈 쐐기는 폭이 19px 기준 4px 밖에 안 돼
        //    배지와 같은 굵기를 두르면 흰 속살이 통째로 먹힌다(2차 렌더에서 쐐기가 검게 죽었다).
        //    노치도 몸통 변보다 살짝 오른쪽(0.575)에서 멈춰 V 를 얕게 판다 — 원본도 꼭짓점이
        //    몸통 오른쪽 변(0.553)보다 반 픽셀 바깥이고 안티에일리어싱으로 이어져 보인다.
        ink(ctx, S, poly(ctx, S, [
            [0.237, 0.368], [0.553, 0.368],   // 몸통 위
            [0.575, 0.534],                   // 오른쪽 변 → 렌즈 꼭짓점(노치 안쪽)
            [0.780, 0.352], [0.780, 0.716],   // 렌즈 위·아래 바깥
            [0.575, 0.534],                   // 다시 꼭짓점
            [0.553, 0.700], [0.237, 0.700],   // 몸통 아래
        ]), '#fff', GLW);
    };
})(IconGen);

/* ============================================================================
 * 공사중 바리케이드 (스텁 모달의 🚧 자리)
 *
 * 원본 스크린샷에 없는 화면(클론 전용 스텁)이라 대조할 그림이 없다 — 탭바·배지와 같은
 * 스티커 화풍(순검정 키라인 + 평면 채색 + 한 톤 음영)에 맞춰 그린다.
 * ⚠️ 이 자리는 본문 글자 크기(약 1.45em ≈ 23px)라 사선을 얇게 여러 줄 넣으면 축소 후
 *    노랑·검정이 섞여 흙색 덩어리로 뭉갠다 — **굵은 사선 3줄**만 넣어 대비를 지킨다.
 * ============================================================================ */
(function (G) {
    const { ink, on, poly, rrect, bar } = G._sticker;
    const YEL = '#f2b90c', LEG = '#9aa0a6', DK = '#17181a';

    /* 좌표계: `_sticker` 헬퍼는 두 축 모두 S(=세로)로 곱하므로 세로 1.0 을 단위로 쓰고
       x 는 0~1.39 를 쓴다(ASPECT). 정사각 캔버스에 그리면 바리케이드가 가로로 길어
       위아래가 텅 비고, `contain` 이 그 빈칸까지 프레임에 맞춰 **그림만 작아진다**
       (1차 렌더에서 글자 옆에 조그맣게 떴다 — 항목 ⑤ '프레임의 85~95%' 위반). */
    G.draw.barrier = function (ctx, S) {
        // 다리 2개 — 판자보다 먼저 그려 뒤로 보내고 아래로 벌어지게 한다.
        ink(ctx, S, bar(ctx, S, 0.445, 0.28, 0.334, 0.95, 0.105), LEG, 0.070);
        ink(ctx, S, bar(ctx, S, 0.945, 0.28, 1.056, 0.95, 0.105), LEG, 0.070);
        // 판자
        const board = rrect(ctx, S, 0.035, 0.045, 1.320, 0.510, 0.075);
        ink(ctx, S, board, YEL, 0.075);
        // 굵은 검정 사선 4줄 — 판자 실루엣 안으로 clip 해서 모서리를 안 넘게.
        ctx.save(); ctx.beginPath(); board(); ctx.clip();
        for (let i = 0; i < 4; i++) {
            const x = 0.10 + i * 0.40;
            on(ctx, poly(ctx, S, [[x, 0.03], [x + 0.205, 0.03], [x - 0.075, 0.58], [x - 0.280, 0.58]]), DK);
        }
        ctx.restore();
        // 아래쪽 한 톤 음영 — 평면이 아니라 판자로 읽히게.
        ctx.save(); ctx.beginPath(); board(); ctx.clip();
        on(ctx, poly(ctx, S, [[0, 0.435], [1.39, 0.435], [1.39, 0.58], [0, 0.58]]), 'rgba(0,0,0,.22)');
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 토스트에 남아 있던 이모지 10종 (👑 💀 ⚡ 📜 🧩 💤 🔓 📌 📍 ✨)
 *
 * 이 아이콘들은 토스트 한 줄 안에서 **코인·젬·해머 같은 재화 아이콘과 나란히 선다.**
 * 그래서 탭바 계열의 납작한 스티커 화풍이 아니라 **재화 아이콘과 같은 입체 화풍**
 * (접지 그림자 → 세로 그라디언트 → 안쪽 그림자 → 스펙큘러 → 어두운 테두리)으로 그린다.
 * 10종을 각자 다 적으면 같은 코드가 열 번 반복되므로 그 5단을 `plate()` 한 곳에 모으고,
 * 아이콘마다 **경로와 팔레트만** 적는다.
 *
 * ⚠️ `plate` 에 넘기는 경로 함수는 `_innerShadow` 규약대로 **서브패스만 추가**해야 한다
 *    (안에서 `beginPath()` 를 부르면 안쪽 그림자가 경로를 잃는다).
 * ============================================================================ */
(function (G) {
    const P2 = Math.PI * 2;
    const sub = {   // 서브패스만 추가하는 경로 조각들
        rr: (ctx, S, x, y, w, h, r) => () => G._rrSub(ctx, x * S, y * S, w * S, h * S, r * S),
        ell: (ctx, S, x, y, rx, ry, rot) => () => { ctx.moveTo((x + rx) * S, y * S); ctx.ellipse(x * S, y * S, rx * S, ry * S, rot || 0, 0, P2); },
        cir: (ctx, S, x, y, r) => () => { ctx.moveTo((x + r) * S, y * S); ctx.arc(x * S, y * S, r * S, 0, P2); },
    };
    // 여러 조각을 한 경로로 — 합집합 실루엣을 만들 때 쓴다.
    const join = (...fns) => () => fns.forEach(f => f());
    const closed = (ctx, S, pts) => () => { pts.forEach((p, i) => { const X = p[0] * S, Y = p[1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };

    // 재화 아이콘과 같은 5단 입체 — 접지 그림자 · 그라디언트 · 안쪽 그림자 · 스펙큘러 · 테두리
        const plate = G._plate;   // 공용 헬퍼(복사본 금지 — 위 _plate 주석 참조)
    // 테두리 없이 위에 얹는 칠(구멍·문양)
    const mark = (ctx, path, fill) => { ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); };

    const GOLD = [[0, '#fff3c0'], [0.30, '#f6cd46'], [0.66, '#d79a12'], [1, '#8c5c04']];
    const BONE = [[0, '#ffffff'], [0.38, '#eceadf'], [0.72, '#c9c5b4'], [1, '#8f8b7c']];
    const STEEL = [[0, '#eef4fa'], [0.34, '#b9c5d1'], [0.70, '#7f8c99'], [1, '#48535e']];

    /* 👑 왕관 — 이 게임의 코인 표기가 👑 라 재화 계열 금색을 그대로 쓴다. */
    G.draw.crown = function (ctx, S) {
        const spikes = closed(ctx, S, [[0.09, 0.72], [0.045, 0.24], [0.27, 0.47], [0.50, 0.14], [0.73, 0.47], [0.955, 0.24], [0.91, 0.72]]);
        plate(ctx, S, join(spikes, sub.rr(ctx, S, 0.075, 0.665, 0.85, 0.215, 0.055)), GOLD, { sy: 0.30 });
        [[0.045, 0.235], [0.50, 0.135], [0.955, 0.235]].forEach(p =>
            plate(ctx, S, sub.cir(ctx, S, p[0], p[1], 0.085), GOLD, { spec: false, lw: 0.040 }));
        mark(ctx, sub.cir(ctx, S, 0.50, 0.775, 0.075), '#e0344f');           // 가운데 보석
        mark(ctx, sub.cir(ctx, S, 0.478, 0.752, 0.028), 'rgba(255,255,255,.7)');
    };

    /* 💀 해골 — 머리와 턱을 한 실루엣으로 합쳐 '두 덩어리'로 안 읽히게 한다. */
    G.draw.skull = function (ctx, S) {
        plate(ctx, S, join(sub.ell(ctx, S, 0.50, 0.42, 0.355, 0.345), sub.rr(ctx, S, 0.305, 0.545, 0.39, 0.345, 0.105)), BONE, { sy: 0.26 });
        [[0.355, 0.435], [0.645, 0.435]].forEach(e => {
            mark(ctx, sub.ell(ctx, S, e[0], e[1], 0.125, 0.135, 0.12 * (e[0] < 0.5 ? 1 : -1)), '#16171b');
            mark(ctx, sub.ell(ctx, S, e[0] - 0.035, e[1] - 0.045, 0.036, 0.040), 'rgba(255,255,255,.25)');
        });
        mark(ctx, closed(ctx, S, [[0.50, 0.545], [0.565, 0.655], [0.435, 0.655]]), '#16171b');   // 코
        [0.415, 0.50, 0.585].forEach(x => mark(ctx, sub.rr(ctx, S, x - 0.018, 0.735, 0.036, 0.145, 0.014), 'rgba(22,23,27,.72)'));
    };

    /* ⚡ 번개 — 획이 가늘면 축소 후 끊긴다. 허리를 두껍게 잡았다. */
    G.draw.bolt = function (ctx, S) {
        plate(ctx, S, closed(ctx, S, [[0.60, 0.03], [0.17, 0.575], [0.415, 0.575], [0.335, 0.97], [0.815, 0.395], [0.545, 0.395]]),
            [[0, '#fff6c8'], [0.32, '#ffd23f'], [0.70, '#f5a207'], [1, '#a85c02']], { sx: 0.40, sy: 0.20 });
    };

    /* 📜 두루마리 — 세 번 헤맨 자리라 결론을 적어 둔다. ⚠️ ① 종이와 축의 폭이 비슷하면 **양철 깡통**.
       ⚠️ ② 축을 나무색 + 가운데 구멍으로 하면 **실패(실감개)**. ⚠️ ③ 축을 **타원**으로 두면 색을 어떻게
       바꿔도 위아래 원반이 실패 실루엣으로 읽힌다. **말린 끝을 원반이 아니라 둥근 막대(rrect)로**
       그리고 종이보다 살짝만 넓게 빼면 그제서야 '말아 둔 양피지'가 된다. */
    G.draw.scroll = function (ctx, S) {
        const PAPER = [[0, '#fffaf0'], [0.40, '#f3e3c0'], [0.78, '#d9c294'], [1, '#a98f5e']];
        const ROLL = [[0, '#f9eed8'], [0.36, '#e7d4aa'], [0.72, '#c4aa79'], [1, '#876c3a']];
        plate(ctx, S, sub.rr(ctx, S, 0.205, 0.150, 0.590, 0.700, 0.028), PAPER, { sy: 0.30 });
        [0.335, 0.445, 0.555, 0.665].forEach((y, i) =>
            mark(ctx, sub.rr(ctx, S, 0.275, y - 0.024, i === 3 ? 0.22 : 0.42, 0.048, 0.024), 'rgba(96,72,34,.55)'));
        [0.085, 0.775].forEach(y =>
            plate(ctx, S, sub.rr(ctx, S, 0.130, y, 0.740, 0.140, 0.070), ROLL, { spec: false, lw: 0.044, y0: y, y1: y + 0.14 }));
    };

    /* 🧩 조각 — ⚠️ 사각형에 **작은 원을 따로 이어 붙이면** 그 원이 통째로 안쪽 그림자에 먹혀
       검은 혹으로 뜬다(1차 렌더). 돌기와 홈을 **하나의 닫힌 윤곽**으로 그려야 그림자가 실루엣을 탄다. */
    G.draw.shard = function (ctx, S) {
        const l = 0.135 * S, r = 0.775 * S, t = 0.150 * S, b = 0.850 * S, my = 0.50 * S, k = 0.145 * S;
        const piece = () => {
            ctx.moveTo(l, t); ctx.lineTo(r, t);
            ctx.lineTo(r, my - k);
            ctx.arc(r, my, k, -Math.PI / 2, Math.PI / 2, false);     // 오른쪽 돌기(바깥으로)
            ctx.lineTo(r, b); ctx.lineTo(l, b);
            ctx.lineTo(l, my + k);
            ctx.arc(l, my, k, Math.PI / 2, -Math.PI / 2, true);      // 왼쪽 홈(안으로 파임)
            ctx.closePath();
        };
        plate(ctx, S, piece, [[0, '#c9f0ff'], [0.34, '#63c8f5'], [0.70, '#2b8fd0'], [1, '#134b78']], { sx: 0.38, sy: 0.28 });
        mark(ctx, sub.cir(ctx, S, 0.345, 0.320, 0.072), 'rgba(255,255,255,.42)');
    };

    /* 🎁 보물 상자 — 오프라인 보상 버튼 (사용자 지시 2026-08-19: "오프라인 보상 버튼은 상자 모양으로").
       ⚠️ 뚜껑을 본체와 **같은 나무색**으로 두면 40px 에서 그냥 둥근 사각형 하나로 뭉갠다 —
       금색 가로 띠를 뚜껑·본체 이음매에 깔아 두 덩어리로 갈라 놓는 게 '상자'로 읽히는 핵심이다.
       세로 걸쇠 + 자물쇠판까지 셋이면 이 크기에서 더 넣을 자리가 없다(디테일 상한). */
    const WOOD = [[0, '#d8a86c'], [0.32, '#ab7439'], [0.68, '#7d4f21'], [1, '#472a0e']];
    G.draw.chest = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.085, 0.235, 0.830, 0.330, 0.150), WOOD, { sy: 0.26 });   // 뚜껑(둥근 돔)
        plate(ctx, S, sub.rr(ctx, S, 0.115, 0.500, 0.770, 0.390, 0.060), WOOD, { y0: 0.50, y1: 0.90, sy: 0.58 }); // 본체
        plate(ctx, S, sub.rr(ctx, S, 0.430, 0.245, 0.140, 0.645, 0.040), GOLD, { spec: false, lw: 0.034 });       // 세로 걸쇠
        plate(ctx, S, sub.rr(ctx, S, 0.070, 0.465, 0.860, 0.095, 0.032), GOLD, { spec: false, lw: 0.034 });       // 이음매 금 띠
        plate(ctx, S, sub.rr(ctx, S, 0.408, 0.545, 0.184, 0.180, 0.048), GOLD, { sy: 0.34, lw: 0.036 });          // 자물쇠판
        mark(ctx, sub.cir(ctx, S, 0.500, 0.618, 0.040), 'rgba(24,16,6,.88)');                                     // 열쇠구멍
    };

    /* 💤 Zzz — ⚠️ Z 를 셋 넣으면 23px 에서 서로 엉켜 **지그재그 덩어리 하나**로 뭉갠다(1차 렌더).
       큰 Z 하나 + 확실히 떨어뜨린 작은 Z 하나로 줄여 '졸음'만 읽히게 한다.
       🚨 **사선 두께(`dg`)를 가로획 두께(`t`)와 따로 준다 — 블록 화법에서 Z 가 죽고 사는 자리다.**
       블라인드 비평가 4인이 라운드2·3 에서 이 아이콘만 공통으로 "파란 조각 둘이 떠 있다 · Z 로
       안 읽힌다"고 집었다. 원인은 **사선의 수직 두께**다: 사선의 가로 두께가 `0.9t` 여도 45° 라
       수직 두께는 `×cos45 = 0.64t` 로 줄고, 20칸 격자에서 **1.9칸**밖에 안 된다. 거기에 키라인
       (`lw` 0.046 = 양쪽 0.9칸)이 얹히면 **속살이 남지 않아 사선이 통째로 증발**하고 가로획 둘만
       남는다 — 비평가가 본 그대로다. `dg = 1.6t` 면 수직 두께가 **3.4칸**이라 키라인을 빼고도
       1.5칸 이상이 남는다(실측: 사선 속살 0칸 → 2칸).
       🚨 **작은 Z 는 `dg` 배수를 그대로 쓰면 안 된다 — 속구멍(카운터)이 닫혀 흰 사각 덩어리가 된다.**
          실측: 6.3칸짜리 Z 에 `dg=1.6t` 를 주면 사선이 폭의 63% 를 먹어 위아래 삼각 구멍이 사라지고
          **Z 가 아니라 밝은 정사각형**으로 찍혔다. 카운터가 남는 조건은 `w − t − dg ≳ 2칸(0.10)` —
          그래서 작은 Z 는 **키우고(0.315 → 0.345) 획을 얇게(0.125 → 0.10) 하고 배수를 1.35** 로 낮춰
          셋(가로·사선·가로)을 다 세운다. 큰 Z 는 11칸이라 1.6 배수로도 카운터가 3칸 넘게 남는다. */
    G.draw.zzz = function (ctx, S) {
        // Z 윤곽: 위 가로획 → 사선 → 아래 가로획을 한 바퀴 돈다(t = 가로획 두께 · dg = 사선 가로폭).
        const Z = (x, y, w, h, t, dg) => closed(ctx, S, [
            [x, y], [x + w, y], [x + w, y + t], [x + dg, y + h - t], [x + w, y + h - t],
            [x + w, y + h], [x, y + h], [x, y + h - t], [x + w - dg, y + t], [x, y + t],
        ]);
        const BLUE = [[0, '#eaf6ff'], [0.36, '#a9d6f5'], [0.72, '#5f9ecf'], [1, '#2d5c85']];
        plate(ctx, S, Z(0.055, 0.400, 0.545, 0.545, 0.150, 0.150 * 1.6), BLUE, { spec: false, lw: 0.046 });
        plate(ctx, S, Z(0.615, 0.045, 0.345, 0.345, 0.100, 0.100 * 1.35), BLUE, { spec: false, lw: 0.040 });
    };

    /* 🔓 열린 자물쇠 — 기존 `lock` 과 같은 실루엣에 **고리를 왼쪽으로 젖힌** 것. */
    G.draw.unlock = function (ctx, S) {
        ctx.save();                                   // 고리(몸통 뒤)
        ctx.beginPath();
        ctx.arc(S * 0.285, S * 0.415, S * 0.195, Math.PI * 0.98, Math.PI * 2.02);
        ctx.lineCap = 'round'; ctx.lineWidth = S * 0.155;
        ctx.strokeStyle = 'rgba(16,14,11,.88)'; ctx.stroke();
        ctx.lineWidth = S * 0.105;
        ctx.strokeStyle = G._lin(ctx, S * 0.09, 0, S * 0.48, 0, [[0, '#8d99a5'], [0.35, '#e8eff5'], [0.7, '#8996a3'], [1, '#4a555f']]);
        ctx.stroke();
        ctx.restore();
        plate(ctx, S, sub.rr(ctx, S, 0.235, 0.475, 0.63, 0.44, 0.10),
            [[0, '#ffe89a'], [0.34, '#f2be2e'], [0.70, '#c98d0d'], [1, '#7d5303']], { y0: 0.44, y1: 0.94, sx: 0.42, sy: 0.58 });
        mark(ctx, sub.cir(ctx, S, 0.55, 0.665, 0.072), 'rgba(58,38,4,.8)');   // 열쇠구멍
        mark(ctx, closed(ctx, S, [[0.518, 0.665], [0.582, 0.665], [0.566, 0.815], [0.534, 0.815]]), 'rgba(58,38,4,.8)');
    };

    /* 📌 압정 — ⚠️ 머리를 동그랗게 두면 **풍선/막대사탕**으로 읽힌다(1차 렌더).
       머리를 납작하게 눌러(rx 0.34 / ry 0.165) 목테를 넓게 드러내야 '눌러 박는 핀'이 된다. */
    G.draw.pin = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.330, 0.470, 0.340, 0.175, 0.045), STEEL, { spec: false, lw: 0.040 });
        plate(ctx, S, closed(ctx, S, [[0.455, 0.630], [0.545, 0.630], [0.50, 0.975]]), STEEL, { spec: false, lw: 0.034 });
        plate(ctx, S, sub.ell(ctx, S, 0.50, 0.320, 0.340, 0.165),
            [[0, '#ffd9d9'], [0.30, '#ef4d52'], [0.68, '#c31d2a'], [1, '#71080f']], { y0: 0.13, y1: 0.50, sx: 0.36, sy: 0.25 });
    };

    /* 📍 지도 핀 — 물방울 실루엣 + 흰 구멍. */
    G.draw.marker = function (ctx, S) {
        plate(ctx, S, closed(ctx, S, [[0.50, 0.975], [0.145, 0.475], [0.145, 0.345], [0.855, 0.345], [0.855, 0.475]]),
            [[0, '#ffd0d4'], [0.30, '#f04452'], [0.68, '#bb1626'], [1, '#650710']], { spec: false, lw: 0.046 });
        plate(ctx, S, sub.cir(ctx, S, 0.50, 0.365, 0.345),
            [[0, '#ffd0d4'], [0.30, '#f04452'], [0.68, '#bb1626'], [1, '#650710']], { y0: 0.02, y1: 0.70, sx: 0.36, sy: 0.22 });
        mark(ctx, sub.cir(ctx, S, 0.50, 0.365, 0.135), 'rgba(74,6,14,.92)');
        mark(ctx, sub.cir(ctx, S, 0.50, 0.365, 0.098), '#ffe9ea');
    };

    /* ✨ 반짝임 — 큰 4각별 하나 + 작은 것 둘. 4각별은 꼭짓점 사이를 깊게 오목하게 판다. */
    G.draw.sparkle = function (ctx, S) {
        const star4 = (cx, cy, R, k) => () => {
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * P2 - Math.PI / 2, r = i % 2 ? R * k : R;
                const X = (cx + Math.cos(a) * r) * S, Y = (cy + Math.sin(a) * r) * S;
                i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
            }
            ctx.closePath();
        };
        const SPARK = [[0, '#ffffff'], [0.34, '#ffee9c'], [0.70, '#f7c525'], [1, '#a97403']];
        plate(ctx, S, star4(0.415, 0.435, 0.415, 0.20), SPARK, { sx: 0.33, sy: 0.30 });
        plate(ctx, S, star4(0.815, 0.185, 0.175, 0.20), SPARK, { spec: false, lw: 0.038 });
        plate(ctx, S, star4(0.775, 0.775, 0.215, 0.20), SPARK, { spec: false, lw: 0.040 });
    };
})(IconGen);

/* ============================================================================
 * 토스트·버튼에 마지막으로 남아 있던 3종 (📋 클립보드 · 💾 저장 · 🔬 연구)
 * 위 10종과 같은 `plate` 5단 입체를 쓴다. 이 파일 안에서 `plate` 은 그 IIFE 안에만
 * 있으므로 여기서 다시 만든다 — 두 블록이 서로를 안 건드리도록 일부러 복사해 둔다.
 * ============================================================================ */
(function (G) {
    const P2 = Math.PI * 2;
    const sub = {
        rr: (ctx, S, x, y, w, h, r) => () => G._rrSub(ctx, x * S, y * S, w * S, h * S, r * S),
        ell: (ctx, S, x, y, rx, ry, rot) => () => { ctx.moveTo((x + rx) * S, y * S); ctx.ellipse(x * S, y * S, rx * S, ry * S, rot || 0, 0, P2); },
        cir: (ctx, S, x, y, r) => () => { ctx.moveTo((x + r) * S, y * S); ctx.arc(x * S, y * S, r * S, 0, P2); },
    };
    const join = (...fns) => () => fns.forEach(f => f());
    const closed = (ctx, S, pts) => () => { pts.forEach((p, i) => { const X = p[0] * S, Y = p[1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
        const plate = G._plate;   // 공용 헬퍼(복사본 금지 — 위 _plate 주석 참조)
    const mark = (ctx, path, fill) => { ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); };
    const STEEL = [[0, '#eef4fa'], [0.34, '#b9c5d1'], [0.70, '#7f8c99'], [1, '#48535e']];

    /* 📋 클립보드 — 판 + 위 집게 + 흰 종이. 토스트뿐 아니라 펫 상세의 공유 버튼 얼굴이기도 하다. */
    G.draw.clipboard = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.145, 0.115, 0.710, 0.800, 0.075),
            [[0, '#e0b785'], [0.34, '#b98548'], [0.70, '#8a5c26'], [1, '#4c2f0d']], { sy: 0.26 });
        mark(ctx, sub.rr(ctx, S, 0.235, 0.265, 0.530, 0.575, 0.030), '#fbf8f1');       // 종이
        [0.375, 0.485, 0.595, 0.705].forEach((y, i) =>
            mark(ctx, sub.rr(ctx, S, 0.305, y - 0.023, i === 3 ? 0.24 : 0.39, 0.046, 0.023), 'rgba(96,72,34,.5)'));
        plate(ctx, S, sub.rr(ctx, S, 0.345, 0.045, 0.310, 0.185, 0.062), STEEL, { spec: false, lw: 0.042, y0: 0.02, y1: 0.24 });
    };

    /* 💾 저장(플로피) — 아래 흰 라벨 + 위 금속 셔터가 있어야 '디스켓'으로 읽힌다. */
    G.draw.save = function (ctx, S) {
        // 오른쪽 위 모서리만 잘린 실루엣 — 디스켓의 핵심 단서다.
        plate(ctx, S, closed(ctx, S, [[0.105, 0.115], [0.760, 0.115], [0.895, 0.250], [0.895, 0.885], [0.105, 0.885]]),
            [[0, '#7fb2e8'], [0.34, '#3a76c4'], [0.70, '#1f4d8c'], [1, '#0d2549']], { sx: 0.34, sy: 0.26 });
        mark(ctx, sub.rr(ctx, S, 0.300, 0.115, 0.400, 0.290, 0.020), '#cdd7e2');        // 위 셔터
        mark(ctx, sub.rr(ctx, S, 0.560, 0.155, 0.105, 0.215, 0.018), '#54606d');
        mark(ctx, sub.rr(ctx, S, 0.235, 0.535, 0.530, 0.350, 0.024), '#f4f6f8');        // 아래 라벨
        [0.640, 0.735].forEach(y => mark(ctx, sub.rr(ctx, S, 0.300, y - 0.021, 0.400, 0.042, 0.021), 'rgba(70,86,102,.45)'));
    };

    /* 🔬 연구 — ⚠️ 현미경으로 그렸더니 23px 에서 '받침 위의 굵은 사선 통' 이 남아 **나무망치**로 읽혔다.
       작은 크기에서 '조사·연구'를 가장 확실하게 읽히는 실루엣은 **돋보기**다 — 둥근 렌즈 + 굵은 손잡이
       둘뿐이라 뭉개져도 정체가 안 흔들린다. */
    G.draw.research = function (ctx, S) {
        // 손잡이(렌즈 뒤로 깔리게 먼저)
        plate(ctx, S, closed(ctx, S, [[0.555, 0.600], [0.735, 0.455], [0.930, 0.760], [0.790, 0.900]]),
            [[0, '#c8a06a'], [0.34, '#a06f36'], [0.70, '#734a18'], [1, '#3d2508']], { spec: false, lw: 0.046 });
        // 테
        plate(ctx, S, sub.cir(ctx, S, 0.415, 0.400, 0.335), STEEL, { spec: false, lw: 0.050, y0: 0.05, y1: 0.75 });
        // 유리
        plate(ctx, S, sub.cir(ctx, S, 0.415, 0.400, 0.230),
            [[0, '#f2fbff'], [0.40, '#bfe6fb'], [0.78, '#7cc3e8'], [1, '#3d84ad']], { sx: 0.32, sy: 0.28, lw: 0.030 });
        mark(ctx, sub.ell(ctx, S, 0.330, 0.310, 0.090, 0.055, -0.6), 'rgba(255,255,255,.75)');
    };

    /* ⚔ 빈 슬롯 실루엣 3종 (🗡 무기 · 🪖 투구 · 👕 갑옷)
       ⚠️ **장착된 칸은 `Scene3D.itemThumb()` 3D 스냅샷이 그린다** — 이 셋은 아이템이 없을 때만
       보이는 자리다(`EMPTY_SLOT_EMOJI`). 새 세이브로 처음 켠 화면이 바로 이 상태라 눈에 띄고,
       `.dim` 으로 어둡게 깔리므로 **색보다 실루엣**이 또렷해야 한다 — 안쪽 장식은 최소로. */
    G.draw.slot_weapon = function (ctx, S) {
        plate(ctx, S, closed(ctx, S, [[0.50, 0.035], [0.605, 0.185], [0.605, 0.545], [0.395, 0.545], [0.395, 0.185]]),
            [[0, '#f2f7fb'], [0.34, '#c3cedb'], [0.70, '#8592a1'], [1, '#49545f']], { sx: 0.40, sy: 0.20 });   // 칼날
        plate(ctx, S, sub.rr(ctx, S, 0.180, 0.540, 0.640, 0.105, 0.050),
            [[0, '#e8c98e'], [0.34, '#c2914a'], [0.72, '#8c6224'], [1, '#4e340f']], { spec: false, lw: 0.042, y0: 0.52, y1: 0.66 });  // 코등이
        plate(ctx, S, sub.rr(ctx, S, 0.425, 0.640, 0.150, 0.245, 0.055),
            [[0, '#d8b887'], [0.34, '#a8762f'], [0.72, '#77501a'], [1, '#3d2708']], { spec: false, lw: 0.040, y0: 0.62, y1: 0.90 });  // 손잡이
        plate(ctx, S, sub.cir(ctx, S, 0.50, 0.910, 0.090),
            [[0, '#f2f7fb'], [0.36, '#c3cedb'], [0.74, '#8592a1'], [1, '#49545f']], { spec: false, lw: 0.038, y0: 0.82, y1: 1.0 });   // 폼멜
    };

    G.draw.slot_helmet = function (ctx, S) {
        const STEELB = [[0, '#eef4fa'], [0.32, '#b9c5d1'], [0.68, '#7f8c99'], [1, '#3f4954']];
        // 돔 + 아래 챙을 한 실루엣으로 — 두 도형을 따로 두면 작은 크기에서 분리돼 보인다.
        plate(ctx, S, join(
            sub.ell(ctx, S, 0.50, 0.520, 0.375, 0.360),
            sub.rr(ctx, S, 0.085, 0.560, 0.830, 0.190, 0.085)), STEELB, { sy: 0.28 });
        // ⚠️ 눈가림 틈이 두꺼우면 **풀페이스 오토바이 헬멧**으로 읽힌다(1차 렌더) — 얇게 줄인다.
        mark(ctx, sub.rr(ctx, S, 0.255, 0.435, 0.490, 0.070, 0.035), 'rgba(28,34,42,.80)');    // 눈가림 틈
        mark(ctx, sub.rr(ctx, S, 0.460, 0.175, 0.080, 0.230, 0.040), 'rgba(28,34,42,.45)');    // 정수리 능선
        mark(ctx, sub.rr(ctx, S, 0.105, 0.640, 0.790, 0.050, 0.025), 'rgba(28,34,42,.30)');    // 챙 그림자
    };

    G.draw.slot_armor = function (ctx, S) {
        plate(ctx, S, closed(ctx, S, [
            [0.500, 0.115], [0.760, 0.185], [0.930, 0.335], [0.845, 0.480], [0.780, 0.420],
            [0.800, 0.905], [0.200, 0.905], [0.220, 0.420], [0.155, 0.480], [0.070, 0.335], [0.240, 0.185],
        ]), [[0, '#eaf1f8'], [0.32, '#b3c0ce'], [0.68, '#788593'], [1, '#3b444f']], { sy: 0.26 });
        // ⚠️ 세로 중앙선 + 마름모를 겹치면 **화살표**로 읽힌다(1차 렌더). 갑옷다움은 마름모가 아니라
        //    **목선과 가슴판 분할**에서 나오므로 그 둘만 남긴다.
        mark(ctx, sub.rr(ctx, S, 0.470, 0.360, 0.060, 0.500, 0.030), 'rgba(30,36,44,.50)');     // 가슴판 분할선
        mark(ctx, sub.ell(ctx, S, 0.500, 0.170, 0.150, 0.085), 'rgba(30,36,44,.62)');           // 목선
        mark(ctx, sub.rr(ctx, S, 0.230, 0.560, 0.540, 0.055, 0.028), 'rgba(30,36,44,.32)');     // 허리 이음선
    };

    /* 나머지 빈 슬롯 5종 — 장갑·목걸이·반지·신발·벨트. 위 셋과 같은 이유로 실루엣 우선. */
    const IRON = [[0, '#eaf1f8'], [0.32, '#b3c0ce'], [0.68, '#788593'], [1, '#3b444f']];
    const LEATHER = [[0, '#d8b887'], [0.32, '#a8762f'], [0.70, '#77501a'], [1, '#3a2507']];

    G.draw.slot_gloves = function (ctx, S) {
        // 손등 + 엄지를 한 실루엣으로(따로 두면 작은 크기에서 '두 덩어리'가 된다)
        plate(ctx, S, join(
            sub.rr(ctx, S, 0.245, 0.190, 0.520, 0.560, 0.130),
            sub.rr(ctx, S, 0.075, 0.400, 0.245, 0.215, 0.105)), LEATHER, { sy: 0.26 });
        plate(ctx, S, sub.rr(ctx, S, 0.205, 0.715, 0.600, 0.190, 0.070), IRON, { spec: false, lw: 0.042, y0: 0.68, y1: 0.94 });  // 손목 밴드
        [0.360, 0.505, 0.650].forEach(x =>
            mark(ctx, sub.rr(ctx, S, x - 0.032, 0.235, 0.064, 0.300, 0.032), 'rgba(50,32,10,.42)'));   // 손가락 골
    };

    G.draw.slot_necklace = function (ctx, S) {
        // 사슬 = 열린 U. `plate` 은 채우기라 링을 그대로 쓰면 원판이 된다 → 굵은 U 를 스트로크로.
        ctx.save();
        ctx.beginPath();
        // ⚠️ 호가 얕고 선이 굵으면 **V(체크표시)** 로 읽힌다(1차 렌더). 반원으로 넓히고 얇게 뽑는다.
        ctx.arc(0.50 * S, 0.345 * S, 0.360 * S, Math.PI * 0.02, Math.PI * 0.98);
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.135 * S; ctx.strokeStyle = 'rgba(16,14,11,.88)'; ctx.stroke();
        ctx.lineWidth = 0.072 * S;
        ctx.strokeStyle = G._lin(ctx, 0.15 * S, 0, 0.85 * S, 0, [[0, '#8d99a5'], [0.35, '#e8eff5'], [0.7, '#8996a3'], [1, '#4a555f']]);
        ctx.stroke();
        ctx.restore();
        plate(ctx, S, closed(ctx, S, [[0.500, 0.630], [0.650, 0.780], [0.500, 0.950], [0.350, 0.780]]),
            [[0, '#cdefff'], [0.32, '#5fc2ef'], [0.68, '#2b7fb5'], [1, '#123f5f']], { y0: 0.60, y1: 0.97, sx: 0.42, sy: 0.68 });
    };

    G.draw.slot_ring = function (ctx, S) {
        // 밴드는 도넛이라 evenodd 로 구멍을 낸다 — 안 그러면 원판이 된다.
        const band = () => { sub.cir(ctx, S, 0.50, 0.605, 0.340)(); sub.cir(ctx, S, 0.50, 0.605, 0.195)(); };
        plate(ctx, S, band, [[0, '#fff3c0'], [0.30, '#f6cd46'], [0.66, '#d79a12'], [1, '#8c5c04']],
            { eo: true, y0: 0.26, y1: 0.96, spec: false, lw: 0.044 });
        plate(ctx, S, closed(ctx, S, [[0.500, 0.055], [0.685, 0.225], [0.500, 0.400], [0.315, 0.225]]),
            [[0, '#eaffff'], [0.30, '#8fe4f2'], [0.66, '#3897b8'], [1, '#134a63']], { y0: 0.02, y1: 0.42, sx: 0.40, sy: 0.14 });
    };

    G.draw.slot_shoes = function (ctx, S) {
        // 부츠 = 목 + 발등 + 밑창을 한 윤곽으로(ㄴ 자). 세 조각으로 두면 관절이 끊겨 보인다.
        plate(ctx, S, closed(ctx, S, [
            [0.255, 0.075], [0.615, 0.075], [0.615, 0.560], [0.905, 0.640], [0.930, 0.845], [0.255, 0.845],
        ]), LEATHER, { sy: 0.22 });
        plate(ctx, S, sub.rr(ctx, S, 0.205, 0.830, 0.760, 0.115, 0.052), IRON, { spec: false, lw: 0.040, y0: 0.80, y1: 0.97 });  // 밑창
        mark(ctx, sub.rr(ctx, S, 0.255, 0.290, 0.360, 0.070, 0.035), 'rgba(50,32,10,.45)');    // 목 접힘
        mark(ctx, sub.rr(ctx, S, 0.255, 0.640, 0.360, 0.060, 0.030), 'rgba(50,32,10,.35)');    // 발등 이음
    };

    G.draw.slot_belt = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.030, 0.395, 0.940, 0.235, 0.055), LEATHER, { y0: 0.36, y1: 0.68, sx: 0.30, sy: 0.44 });
        // 버클 = 사각 고리(evenodd 로 가운데를 비운다) + 혀
        const buckle = () => {
            G._rrSub(ctx, 0.335 * S, 0.320 * S, 0.330 * S, 0.385 * S, 0.070 * S);
            G._rrSub(ctx, 0.415 * S, 0.400 * S, 0.170 * S, 0.225 * S, 0.040 * S);
        };
        plate(ctx, S, buckle, [[0, '#fff3c0'], [0.30, '#f6cd46'], [0.66, '#d79a12'], [1, '#8c5c04']],
            { eo: true, y0: 0.29, y1: 0.74, spec: false, lw: 0.044 });
        [0.115, 0.215, 0.815, 0.905].forEach(x =>
            mark(ctx, sub.cir(ctx, S, x, 0.513, 0.042), 'rgba(46,29,8,.55)'));                  // 벨트 구멍
    };
})(IconGen);

/* ============================================================================
 * 무기 모양 17종 (icon-gen — `UI.WEAPON_SHAPE_ICON` 진입점용, wpn_*)
 *
 * '모든 장비의 목록' 무기 셀(.fl-face)과 장비 상세 폴백이 이모지(🏏🪓🌾…)로 남아 있던
 * 마지막 자리다. 무기 53종은 `weaponShape()` 이 모양 18가지로 모으므로(hammer 는 기존
 * 재화 아이콘 재사용) 여기 17종이면 전부 걸린다.
 *
 * 화법은 빈 슬롯 실루엣(slot_*)과 같은 `G._plate` 5단 입체 — 같은 격자에 나란히 앉는
 * 그림이라 다른 화법(스티커/그라디언트)을 쓰면 그 칸만 붕 뜬다.
 * ⚠️ 23px 판독 규칙(앞 세션 실측 함정): 내부 디테일 3개 이하 · 실루엣이 정체를 다
 *    말해야 한다 · 얇은 선은 lw 0.03 아래로 내리지 말 것(축소에서 사라진다).
 * 근접 무기는 세로로 그려 rot() 로 35° 눕힌다 — 칼끝이 오른쪽 위를 보게(3D 썸네일과
 * 같은 방향). 총기·활은 가로 구도 그대로가 더 잘 읽힌다.
 * ============================================================================ */
(function (G) {
    const P2 = Math.PI * 2;
    const sub = {
        rr: (ctx, S, x, y, w, h, r) => () => G._rrSub(ctx, x * S, y * S, w * S, h * S, r * S),
        ell: (ctx, S, x, y, rx, ry, rot) => () => { ctx.moveTo((x + rx) * S, y * S); ctx.ellipse(x * S, y * S, rx * S, ry * S, rot || 0, 0, P2); },
        cir: (ctx, S, x, y, r) => () => { ctx.moveTo((x + r) * S, y * S); ctx.arc(x * S, y * S, r * S, 0, P2); },
    };
    const closed = (ctx, S, pts) => () => { pts.forEach((p, i) => { const X = p[0] * S, Y = p[1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); };
    const plate = G._plate;   // 공용 헬퍼(복사본 금지 — _plate 주석 참조)
    const mark = (ctx, path, fill) => { ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); };
    // 캔버스째 기울이기 — plate 가 path 를 여러 번 다시 그리므로 회전 안에서 plate 를 통째로 부른다
    const rot = (ctx, S, a, fn) => { ctx.save(); ctx.translate(S * 0.5, S * 0.5); ctx.rotate(a); ctx.translate(-S * 0.5, -S * 0.5); fn(); ctx.restore(); };
    const TILT = 0.62;   // 근접 무기 공통 기울기(≈35°)

    const STEEL = [[0, '#eef4fa'], [0.34, '#b9c5d1'], [0.70, '#7f8c99'], [1, '#48535e']];
    const WOOD = [[0, '#d8b887'], [0.34, '#a8762f'], [0.72, '#77501a'], [1, '#3d2708']];
    const WOOD_PALE = [[0, '#e0b785'], [0.34, '#b98548'], [0.70, '#8a5c26'], [1, '#4c2f0d']];
    const GOLD = [[0, '#ffe9a8'], [0.34, '#f0b842'], [0.72, '#b07f18'], [1, '#5e3f06']];
    const GUN = [[0, '#9aa4ae'], [0.34, '#5a646e'], [0.70, '#3a434c'], [1, '#1d2329']];
    const ENERGY = [[0, '#d9f6ff'], [0.40, '#7fdcff'], [0.78, '#28a7e0'], [1, '#0c5c8c']];

    /* 🗡 검 — 긴 양날 + 코등이 + 손잡이 + 폼멜 (slot_weapon 과 같은 문법, 눕힌 판) */
    G.draw.wpn_sword = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            plate(ctx, S, closed(ctx, S, [[0.50, 0.02], [0.585, 0.15], [0.585, 0.56], [0.415, 0.56], [0.415, 0.15]]), STEEL, { sx: 0.42, sy: 0.18 });
            plate(ctx, S, sub.rr(ctx, S, 0.30, 0.555, 0.40, 0.085, 0.042), GOLD, { spec: false, lw: 0.040, y0: 0.53, y1: 0.66 });
            plate(ctx, S, sub.rr(ctx, S, 0.452, 0.635, 0.096, 0.215, 0.048), WOOD, { spec: false, lw: 0.038, y0: 0.62, y1: 0.87 });
            plate(ctx, S, sub.cir(ctx, S, 0.50, 0.895, 0.062), GOLD, { spec: false, lw: 0.036, y0: 0.82, y1: 0.96 });
        });
    };

    /* 🤺 레이피어 — 바늘 날 + 컵 가드. 날이 얇아 lw 를 내리되 0.03 밑으론 안 간다 */
    G.draw.wpn_rapier = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            plate(ctx, S, closed(ctx, S, [[0.50, 0.02], [0.545, 0.12], [0.53, 0.56], [0.47, 0.56], [0.455, 0.12]]), STEEL, { spec: false, lw: 0.034, sx: 0.46, sy: 0.14 });
            plate(ctx, S, sub.ell(ctx, S, 0.50, 0.60, 0.145, 0.088), GOLD, { lw: 0.038, y0: 0.51, y1: 0.69, sx: 0.44, sy: 0.56 });
            plate(ctx, S, sub.rr(ctx, S, 0.458, 0.685, 0.084, 0.185, 0.042), WOOD, { spec: false, lw: 0.036, y0: 0.66, y1: 0.88 });
            plate(ctx, S, sub.cir(ctx, S, 0.50, 0.905, 0.052), GOLD, { spec: false, lw: 0.034, y0: 0.84, y1: 0.96 });
        });
    };

    /* 🔪 단검 — 검보다 짧고 넓은 날. 실루엣 차이(날 길이 절반)가 정체를 가른다 */
    G.draw.wpn_dagger = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            plate(ctx, S, closed(ctx, S, [[0.50, 0.13], [0.615, 0.29], [0.575, 0.58], [0.425, 0.58], [0.385, 0.29]]), STEEL, { sx: 0.42, sy: 0.26 });
            plate(ctx, S, sub.rr(ctx, S, 0.335, 0.575, 0.33, 0.075, 0.037), GOLD, { spec: false, lw: 0.038, y0: 0.55, y1: 0.66 });
            plate(ctx, S, sub.rr(ctx, S, 0.452, 0.645, 0.096, 0.20, 0.048), WOOD, { spec: false, lw: 0.038, y0: 0.63, y1: 0.86 });
        });
    };

    /* 🪓 도끼 — 자루 + 왼쪽 수염도끼 머리. ⚠️ 직선 poly 로 두르면 팔각 덩어리('막대사탕')로
       읽힌다(1차 렌더에서 실제로 그랬다) — 날은 왼쪽 큰 호, 아랫변은 안으로 파인 수염(beard)
       커브여야 도끼가 된다. */
    const axeHead = (ctx, S, sc, ox, oy) => () => {
        const X = (x) => (ox + x * sc) * S, Y = (y) => (oy + y * sc) * S;
        ctx.moveTo(X(0.58), Y(0.175));                                   // 자루 물림(위) — 물림 띠는 좁게
        ctx.quadraticCurveTo(X(0.34), Y(0.075), X(0.155), Y(0.045));     // 위 어깨 → 위 날끝(왼쪽으로 뾰족)
        ctx.quadraticCurveTo(X(0.005), Y(0.28), X(0.145), Y(0.545));     // 왼쪽 큰 호(날) → 아래 날끝
        ctx.quadraticCurveTo(X(0.33), Y(0.50), X(0.44), Y(0.415));       // 아래 어깨 안으로
        ctx.quadraticCurveTo(X(0.50), Y(0.36), X(0.58), Y(0.345));       // 수염이 자루로 파고든다
        ctx.closePath();
    };
    G.draw.wpn_axe = function (ctx, S) {
        rot(ctx, S, TILT * 0.8, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.475, 0.13, 0.10, 0.76, 0.05), WOOD, { spec: false, lw: 0.040, y0: 0.12, y1: 0.90 });
            plate(ctx, S, axeHead(ctx, S, 1, 0, 0), STEEL, { sx: 0.24, sy: 0.22 });
        });
    };

    /* 🪃 투척 도끼 — 같은 수염도끼 머리를 작게 + 짧은 자루 + 더 눕힘. 도끼와 크기 위계로 갈린다 */
    G.draw.wpn_thrown = function (ctx, S) {
        rot(ctx, S, 1.05, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.468, 0.24, 0.094, 0.62, 0.047), WOOD_PALE, { spec: false, lw: 0.040, y0: 0.22, y1: 0.88 });
            plate(ctx, S, axeHead(ctx, S, 0.78, 0.11, 0.10), STEEL, { sx: 0.26, sy: 0.24 });
        });
    };

    /* 🔨 철퇴 — 자루 + 가시 박힌 쇠공. 가시 6개는 공 실루엣 밖으로 또렷이 */
    G.draw.wpn_mace = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.462, 0.36, 0.076, 0.54, 0.038), WOOD, { spec: false, lw: 0.038, y0: 0.34, y1: 0.90 });
            const spikes = [];
            for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + i * (P2 / 6), cx = 0.50 + Math.cos(a) * 0.155, cy = 0.235 + Math.sin(a) * 0.155;
                spikes.push(closed(ctx, S, [
                    [cx + Math.cos(a) * 0.115, cy + Math.sin(a) * 0.115],
                    [cx + Math.cos(a + 1.9) * 0.062, cy + Math.sin(a + 1.9) * 0.062],
                    [cx + Math.cos(a - 1.9) * 0.062, cy + Math.sin(a - 1.9) * 0.062]]));
            }
            spikes.forEach(p => plate(ctx, S, p, STEEL, { spec: false, lw: 0.034, flat: true }));
            plate(ctx, S, sub.cir(ctx, S, 0.50, 0.235, 0.165), STEEL, { sx: 0.44, sy: 0.16, lw: 0.044 });
        });
    };

    /* 🏏 몽둥이 — 위가 굵은 나무 방망이 + 옹이 2개. ⚠️ 직선 poly 는 '관짝'이 된다 —
       옆구리·머리를 전부 커브로. 디테일은 옹이 둘로 끝(23px 규칙) */
    G.draw.wpn_club = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            const body = () => {
                ctx.moveTo(0.452 * S, 0.92 * S);
                ctx.quadraticCurveTo(0.415 * S, 0.55 * S, 0.352 * S, 0.30 * S);
                ctx.quadraticCurveTo(0.335 * S, 0.09 * S, 0.50 * S, 0.075 * S);
                ctx.quadraticCurveTo(0.665 * S, 0.09 * S, 0.648 * S, 0.30 * S);
                ctx.quadraticCurveTo(0.585 * S, 0.55 * S, 0.548 * S, 0.92 * S);
                ctx.closePath();
            };
            plate(ctx, S, body, WOOD_PALE, { sx: 0.42, sy: 0.20, lw: 0.050 });
            mark(ctx, sub.cir(ctx, S, 0.455, 0.24, 0.038), 'rgba(60,36,10,.55)');
            mark(ctx, sub.cir(ctx, S, 0.565, 0.40, 0.031), 'rgba(60,36,10,.5)');
        });
    };

    /* 🔱 창 — 긴 자루 + 잎날 + 물림쇠. 잎날 폭이 창끝 정체성이라 좁히지 말 것 */
    G.draw.wpn_spear = function (ctx, S) {
        rot(ctx, S, TILT, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.468, 0.30, 0.064, 0.62, 0.032), WOOD, { spec: false, lw: 0.036, y0: 0.28, y1: 0.92 });
            plate(ctx, S, closed(ctx, S, [[0.50, 0.015], [0.615, 0.165], [0.50, 0.325], [0.385, 0.165]]), STEEL, { sx: 0.44, sy: 0.12 });
            plate(ctx, S, sub.rr(ctx, S, 0.442, 0.315, 0.116, 0.062, 0.03), GOLD, { spec: false, lw: 0.034, y0: 0.30, y1: 0.39, flat: true });
        });
    };

    /* 🌾 낫 — 자루 위 끝에서 왼쪽으로 크게 휘는 날. 곡선이라 poly 대신 커브 경로 */
    G.draw.wpn_scythe = function (ctx, S) {
        rot(ctx, S, TILT * 0.55, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.545, 0.20, 0.085, 0.71, 0.042), WOOD, { spec: false, lw: 0.040, y0: 0.18, y1: 0.92 });
            const blade = () => {
                ctx.moveTo(0.63 * S, 0.245 * S);
                ctx.quadraticCurveTo(0.36 * S, 0.075 * S, 0.10 * S, 0.235 * S);   // 바깥 등
                ctx.quadraticCurveTo(0.33 * S, 0.185 * S, 0.565 * S, 0.345 * S);  // 안쪽 날
                ctx.closePath();
            };
            plate(ctx, S, blade, STEEL, { sx: 0.30, sy: 0.14, lw: 0.040 });
        });
    };

    /* 🏹 활 — 왼쪽 활채(초승달) + 시위 + 화살. 화살이 없으면 23px 에서 'D'로 읽힌다.
       ⚠️ 활채의 안팎 커브 간격이 좁으면 활채가 실선으로 사라진다(1차 렌더) — 폭을 확실히 벌린다 */
    G.draw.wpn_bow = function (ctx, S) {
        const limb = () => {
            ctx.moveTo(0.36 * S, 0.055 * S);
            ctx.quadraticCurveTo(0.015 * S, 0.50 * S, 0.36 * S, 0.945 * S);   // 바깥 등
            ctx.quadraticCurveTo(0.245 * S, 0.50 * S, 0.36 * S, 0.055 * S);   // 안쪽 배
            ctx.closePath();
        };
        mark(ctx, closed(ctx, S, [[0.345, 0.06], [0.375, 0.06], [0.375, 0.94], [0.345, 0.94]]), 'rgba(70,50,25,.9)');   // 시위(활채 뒤)
        plate(ctx, S, limb, WOOD_PALE, { sx: 0.16, sy: 0.30, lw: 0.046 });
        plate(ctx, S, closed(ctx, S, [[0.30, 0.468], [0.78, 0.468], [0.78, 0.532], [0.30, 0.532]]), WOOD, { spec: false, lw: 0.030, flat: true });   // 화살대
        plate(ctx, S, closed(ctx, S, [[0.76, 0.40], [0.945, 0.50], [0.76, 0.60]]), STEEL, { spec: false, lw: 0.034, flat: true });                   // 화살촉
    };

    /* 🏹 석궁 — 세로 개머리 + 가로 활채 + V자 시위. 활과 축이 직각이라 안 헷갈린다 */
    G.draw.wpn_crossbow = function (ctx, S) {
        const limb = () => {
            ctx.moveTo(0.075 * S, 0.30 * S);
            ctx.quadraticCurveTo(0.50 * S, 0.02 * S, 0.925 * S, 0.30 * S);
            ctx.quadraticCurveTo(0.50 * S, 0.135 * S, 0.075 * S, 0.30 * S);
            ctx.closePath();
        };
        mark(ctx, closed(ctx, S, [[0.075, 0.285], [0.50, 0.53], [0.925, 0.285], [0.925, 0.325], [0.50, 0.575], [0.075, 0.325]]), 'rgba(240,240,235,.9)');   // 시위
        plate(ctx, S, limb, WOOD_PALE, { sx: 0.30, sy: 0.10, lw: 0.044 });
        plate(ctx, S, sub.rr(ctx, S, 0.45, 0.10, 0.10, 0.80, 0.05), WOOD, { spec: false, lw: 0.042, y0: 0.08, y1: 0.92 });
        plate(ctx, S, closed(ctx, S, [[0.50, 0.015], [0.585, 0.135], [0.415, 0.135]]), STEEL, { spec: false, lw: 0.036, flat: true });   // 볼트 촉
    };

    /* 💫 투석구 — Y자 새총(가죽끈 투석구는 23px 에서 국수가 된다 — 실루엣 우선 규칙) */
    G.draw.wpn_sling = function (ctx, S) {
        const arm = (x0, y0, x1, y1, w) => {
            const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
            return closed(ctx, S, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
        };
        mark(ctx, arm(0.245, 0.215, 0.50, 0.44, 0.045), 'rgba(70,50,25,.9)');    // 밴드(프레임 뒤)
        mark(ctx, arm(0.755, 0.215, 0.50, 0.44, 0.045), 'rgba(70,50,25,.9)');
        plate(ctx, S, arm(0.50, 0.56, 0.265, 0.155, 0.115), WOOD_PALE, { spec: false, lw: 0.044 });
        plate(ctx, S, arm(0.50, 0.56, 0.735, 0.155, 0.115), WOOD_PALE, { spec: false, lw: 0.044 });
        plate(ctx, S, sub.rr(ctx, S, 0.443, 0.52, 0.114, 0.40, 0.055), WOOD, { spec: false, lw: 0.044, y0: 0.50, y1: 0.94 });
        plate(ctx, S, sub.cir(ctx, S, 0.50, 0.415, 0.085), STEEL, { lw: 0.038, sx: 0.46, sy: 0.37, y0: 0.32, y1: 0.51 });   // 장전된 돌
    };

    /* 🔫 권총 — L자 실루엣이 전부다: 총열 + 뒤쪽 손잡이 + 방아쇠울 */
    G.draw.wpn_pistol = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.10, 0.30, 0.72, 0.20, 0.05), GUN, { sx: 0.30, sy: 0.34 });
        plate(ctx, S, closed(ctx, S, [[0.155, 0.48], [0.36, 0.48], [0.315, 0.86], [0.13, 0.86]]), WOOD, { spec: false, lw: 0.042, y0: 0.46, y1: 0.90 });
        mark(ctx, sub.rr(ctx, S, 0.12, 0.255, 0.075, 0.055, 0.02), '#3a434c');   // 가늠쇠(뒤)
        const guard = () => { ctx.moveTo(0.40 * S, 0.50 * S); ctx.quadraticCurveTo(0.52 * S, 0.72 * S, 0.40 * S, 0.72 * S); ctx.quadraticCurveTo(0.35 * S, 0.60 * S, 0.40 * S, 0.50 * S); ctx.closePath(); };
        mark(ctx, guard, 'rgba(29,35,41,.95)');
    };

    /* 🔫 소총 — 긴 총열 + 뒤 개머리판. 길이가 권총과의 유일한 위계라 총열을 끝까지 뺀다 */
    G.draw.wpn_rifle = function (ctx, S) {
        rot(ctx, S, -0.22, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.035, 0.42, 0.62, 0.13, 0.035), GUN, { sx: 0.20, sy: 0.44 });
            plate(ctx, S, closed(ctx, S, [[0.63, 0.40], [0.955, 0.47], [0.955, 0.68], [0.63, 0.575]]), WOOD, { spec: false, lw: 0.042, y0: 0.40, y1: 0.70 });
            plate(ctx, S, closed(ctx, S, [[0.42, 0.55], [0.52, 0.55], [0.49, 0.73], [0.40, 0.73]]), WOOD, { spec: false, lw: 0.038, y0: 0.54, y1: 0.75, flat: true });   // 손잡이
            mark(ctx, sub.rr(ctx, S, 0.055, 0.375, 0.06, 0.05, 0.018), '#3a434c');   // 가늠쇠
        });
    };

    /* 🔫 기관단총 — 뭉툭한 몸통 + 아래로 꽂힌 탄창이 정체. 총열은 짧게 */
    G.draw.wpn_smg = function (ctx, S) {
        plate(ctx, S, sub.rr(ctx, S, 0.13, 0.335, 0.56, 0.215, 0.05), GUN, { sx: 0.26, sy: 0.36 });
        plate(ctx, S, sub.rr(ctx, S, 0.68, 0.385, 0.235, 0.115, 0.04), GUN, { spec: false, lw: 0.040, y0: 0.37, y1: 0.51 });   // 총열
        plate(ctx, S, closed(ctx, S, [[0.315, 0.545], [0.455, 0.545], [0.425, 0.895], [0.30, 0.895]]), GUN, { spec: false, lw: 0.040, y0: 0.53, y1: 0.92 });   // 탄창
        plate(ctx, S, closed(ctx, S, [[0.535, 0.545], [0.665, 0.545], [0.625, 0.83], [0.51, 0.83]]), WOOD, { spec: false, lw: 0.038, y0: 0.53, y1: 0.86, flat: true });   // 손잡이
    };

    /* 💥 대포 — 포신 + 바퀴. 두 덩어리면 끝난다(23px 규칙의 모범 케이스) */
    G.draw.wpn_cannon = function (ctx, S) {
        plate(ctx, S, closed(ctx, S, [[0.16, 0.565], [0.745, 0.175], [0.875, 0.36], [0.295, 0.75]]), GUN, { sx: 0.30, sy: 0.30 });
        plate(ctx, S, closed(ctx, S, [[0.72, 0.135], [0.90, 0.115], [0.955, 0.315], [0.83, 0.40]]), GUN, { spec: false, lw: 0.042, y0: 0.10, y1: 0.42 });   // 포구 플레어
        plate(ctx, S, sub.cir(ctx, S, 0.38, 0.72, 0.185), WOOD, { lw: 0.046, y0: 0.52, y1: 0.92, sx: 0.30, sy: 0.60 });   // 바퀴
        plate(ctx, S, sub.cir(ctx, S, 0.38, 0.72, 0.062), GOLD, { spec: false, lw: 0.034, y0: 0.65, y1: 0.79, flat: true });   // 바퀴 허브
    };

    /* 🪄 지팡이 — 긴 봉 + 끝의 발광 보주. 보주 글로우는 mark 한 겹으로만(과하면 번짐) */
    G.draw.wpn_staff = function (ctx, S) {
        rot(ctx, S, TILT * 0.75, () => {
            plate(ctx, S, sub.rr(ctx, S, 0.455, 0.27, 0.09, 0.66, 0.045), WOOD, { spec: false, lw: 0.042, y0: 0.25, y1: 0.95 });
            plate(ctx, S, closed(ctx, S, [[0.395, 0.315], [0.605, 0.315], [0.545, 0.20], [0.455, 0.20]]), GOLD, { spec: false, lw: 0.038, flat: true });   // 물림 소켓
            mark(ctx, sub.cir(ctx, S, 0.50, 0.145, 0.205), 'rgba(127,220,255,.28)');   // 글로우
            plate(ctx, S, sub.cir(ctx, S, 0.50, 0.145, 0.135), ENERGY, { sx: 0.44, sy: 0.09, lw: 0.040, y0: 0.01, y1: 0.28 });
        });
    };
})(IconGen);

/* ===== 던전 배너 배경 일러스트 4종 (slug: icon-gen 슬라이스 — 사용자 항목 '이모지/저품질 아이콘을
   코드 생성 아이콘으로 전면 교체' ④ 기타) =====
   원본(shot-042251)의 던전 배너는 **한 장 그림**이다 — 망치 도둑=낮 하늘·초록 성벽·수풀, 유령
   마을=밤하늘·달·묘비, 침략=노을 하늘·깃발 든 무리 실루엣, 좀비 러시=보라 하늘·고목·울타리.
   클론은 갈색 그라디언트 한 겹뿐이라 이 화면 감점의 대부분이 여기서 났다(aaa-skin dungeon-detail 메모 🚨).
   🔁 **주인공은 여기서 그린다 (2026-08-19 정정)**. 처음 이 블록은 "주인공(망치·유령·알·좀비)은
   안 그린다 — 배너 우측 `.dg-icon` 이 맡는다" 였는데, **그 `.dg-icon` 은 같은 항목의 사용자
   지시로 삭제됐다**("기존 덩어리 같이 생긴 아이콘은 없애기"). 그 결과 해머 도둑 카드엔 해머도
   도둑도 없는 초원만 남았고(잔여 결함 ⓐ), 좀비 러시는 좀비가 없어 유령 마을과 테마가 겹쳤다(ⓒ).
   원본(shot-042251)도 행마다 배경 **위에** 주인공이 하나씩 서 있다 — 해머 도둑=쥔 대형 망치,
   좀비 러시=팔 든 좀비. 침략은 군중 자체가, 유령 마을은 달·묘비가 주인공이라 따로 안 얹는다.
   외부 에셋 금지 제약대로 전부 캔버스 도형이고, 배치 난수는 고정 수열(LCG)이라 매번 같은 그림이다.
   좌표계는 두 갈래가 섞여 있다: 배경은 raw 픽셀(W=S*AR, H=S), 주인공은 `_sticker` 정규계
   (세로 1.0 · x 0~3.45)다 — 헬퍼가 두 축 모두 S(=H)를 곱하므로 값이 그대로 맞는다. */
(function (G) {
    const { ink, on, circle, ell, poly, rrect, bar } = G._sticker;   // 전경 주인공용(순검정 키라인 화법)
    const AR = 3.45;                                  // 배너 종횡비(원본 실측 3.45:1 — css .dg-banner 와 같은 값)
    ['dg_hammer', 'dg_ghost', 'dg_invasion', 'dg_zombie'].forEach(n => { G.ASPECT[n] = AR; });

    // 고정 수열 — Math.random 을 쓰면 새로고침마다 별·나무 자리가 튄다(캐시도 무의미해진다)
    const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
    const fill = (ctx, c, fn) => { ctx.beginPath(); fn(); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
    // 하늘: 위→아래 세로 그라디언트로 배너 전체를 덮는다
    const sky = (ctx, W, H, top, bot) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, top); g.addColorStop(1, bot);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    /* ⚠️ 좌측 스크림은 **캔버스에서 걷어냈다** — css `.dg-banner::before` 가 같은 일을 하고 있어
       두 겹이 곱해지면서 카드 왼쪽 절반이 통째로 검게 죽었다(유령 마을은 카드 전체). 제목 가독은
       스크림이 아니라 **제목 글자의 순검정 8방 외곽선**이 보증한다(원본도 그 처리). 여기서 다시
       스크림을 그리지 말 것 — 그림을 살리는 게 이 항목의 사용자 지시다. */
    const ground = (ctx, W, H, y, c) => fill(ctx, c, () => { ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.lineTo(W, H); ctx.lineTo(0, H); });

    /* 🔨 망치 도둑 — 원본(shot-042251 1행 확대 실측 2026-08-19): 흉벽 상자가 아니라 **뾰족 지붕
       마을 실루엣 한 장**(연초록 채움 + 회청 키라인)이고, 하늘엔 분홍-라벤더 구름 줄, 오른쪽엔
       줄기 있는 큰 나무(잎 덩어리 + 연두 림 혹), 망치는 **대각선으로 휘두르는 중**이며 주먹이
       자루 중간을 감아쥐고 있다(손가락 골 4개가 보인다). 비평가 A·B 공통 1순위 감점이 여기였다
       ('망치가 수직으로 박힌 정지 구도 + 손이 없다'). */
    G.draw.dg_hammer = function (ctx, S) {
        const W = S * AR, H = S, R = rnd(11);
        /* R4 비평가 2인 공통 '하늘 탁함'(원본 실측 181,214,251): 채도·명도 한 단 위로 */
        sky(ctx, W, H, '#a8dcff', '#c8ecff');   // R8 값게이트: 원본 지배색 #b0e0ff(26.5%) 정합 — 종전 조합은 밴드 평균이 원본보다 25~60 어두웠다
        /* 구름 — 납작한 타원 하나면 '분홍 스티커'로 읽힌다(비평가 6차): 혹 3~4개를 겹친 뭉게
           윤곽 + 아래는 평평하게. 원본의 분홍-라벤더 구름 줄. */
        const cloud = (cx, cy, cw, chh, c) => {
            fill(ctx, c, () => {
                ctx.moveTo(cx - cw, cy + chh * 0.5);
                ctx.arc(cx - cw * 0.55, cy, chh * 0.9, Math.PI * 0.95, Math.PI * 1.9);
                ctx.arc(cx - cw * 0.05, cy - chh * 0.55, chh * 1.1, Math.PI * 1.05, Math.PI * 1.98);
                ctx.arc(cx + cw * 0.45, cy - chh * 0.10, chh * 0.95, Math.PI * 1.15, Math.PI * 2);
                ctx.lineTo(cx + cw, cy + chh * 0.5);
                ctx.closePath();
            });
        };
        cloud(W * 0.16, H * 0.15, W * 0.11, H * 0.045, '#e7d2ec');
        cloud(W * 0.27, H * 0.09, W * 0.07, H * 0.034, '#f4eaf6');
        cloud(W * 0.52, H * 0.08, W * 0.12, H * 0.042, '#e7d2ec');
        cloud(W * 0.63, H * 0.17, W * 0.06, H * 0.030, '#f4eaf6');
        cloud(W * 0.40, H * 0.23, W * 0.05, H * 0.026, '#eedcf2');
        cloud(W * 0.72, H * 0.10, W * 0.07, H * 0.032, '#ddeee0');        // 연둣빛 보조 구름 — 분홍 단색이면 팔레트가 얇다(비평가 7차)
        cloud(W * 0.07, H * 0.07, W * 0.05, H * 0.026, '#ddeee0');
        /* (지평선 웜톤 헤이즈는 R9 에서 **삭제** — 원본 5배 확대 실측상 하늘은 평평한 연하늘 +
           구름 줄뿐이고 지평선 헤이즈가 없다. 이 띠가 스카이라인의 실루엣 대비를 갉아먹어
           '초록 죽으로 뭉갠다'는 지적의 한 축이었다.) */
        // 마을 스카이라인 — 연속 폴리라인 한 장 + 회청 키라인. 뾰족 지붕·박공·망루가 섞인다.
        const town = (pts, fc, oc) => {
            ctx.beginPath(); ctx.moveTo(-H * 0.05, H * 1.2);
            pts.forEach(p => ctx.lineTo(p[0] * W, p[1] * H));
            ctx.lineTo(W + H * 0.05, H * 1.2); ctx.closePath();
            ctx.fillStyle = fc; ctx.fill();
            ctx.strokeStyle = oc; ctx.lineWidth = H * 0.028; ctx.stroke();
        };
        /* ⚠️ 점끼리 x·y 를 동시에 바꾸면 사선 연쇄가 돼 **산맥으로 읽힌다**(1차 시안에서 밟았다).
           벽은 반드시 수직(같은 x 로 두 점), 지붕만 경사 — 그래야 건물이 된다. */
        /* 원경 연회 열(3차 재채점 교집합 ⓒ — '건물 층이 하나로 세어진다'): 청회 열 **뒤**에 한 단
           밝은 연회 열을 깔아 스카이라인을 2단으로 겹친다 — 청회 열의 골 사이(y0.60 부근)로
           비쳐 대기원근 층이 선다. 지붕 경사·높이는 청회 열과 어긋나게. */
        /* R4 비평가 2인 공통 [치명] '회색 스카이라인 = 다른 게임'(원본 실측 87,152,73 초록 성벽):
           10차의 '원경 한색(청회)' 결정을 뒤집는다 — 원경 열은 하늘에 녹아드는 옅은 청록 헤이즈로
           낮추고(내부 윤곽선이 안 보이게 스트로크를 채움과 한 끗 차이로), 중경 열은 올리브그린으로
           복귀시켜 화면의 지배색을 초록으로 되돌린다. */
        town([[-0.02, 0.56], [0.05, 0.56], [0.05, 0.495], [0.09, 0.45], [0.13, 0.495], [0.13, 0.56],
        [0.22, 0.56], [0.22, 0.485], [0.265, 0.44], [0.31, 0.485], [0.31, 0.56],
        [0.40, 0.56], [0.40, 0.50], [0.45, 0.455], [0.50, 0.50], [0.50, 0.56],
        [0.60, 0.56], [0.60, 0.465], [0.645, 0.425], [0.69, 0.465], [0.69, 0.56],
        [0.79, 0.56], [0.79, 0.50], [0.845, 0.455], [0.90, 0.50], [0.90, 0.56], [1.02, 0.56]],
            '#b9dd8d', '#a2ca73');   // R8-2 2인 공통 '연한 세이지가 하늘에 붙어 안개로 뭉갠다': 원경 열도 초록 계열로(백청 이탈 해소)
        town([[-0.02, 0.60], [0.03, 0.60], [0.03, 0.495], [0.055, 0.45], [0.08, 0.495], [0.08, 0.60],
        [0.13, 0.60], [0.13, 0.52], [0.155, 0.52], [0.155, 0.415], [0.185, 0.365], [0.215, 0.415], [0.215, 0.52], [0.24, 0.52], [0.24, 0.60],
        [0.30, 0.60], [0.30, 0.485], [0.335, 0.44], [0.37, 0.485], [0.37, 0.60],
        [0.43, 0.60], [0.43, 0.52], [0.475, 0.52], [0.475, 0.385], [0.505, 0.335], [0.535, 0.385], [0.535, 0.52], [0.565, 0.52], [0.565, 0.60],
        [0.63, 0.60], [0.63, 0.475], [0.665, 0.43], [0.70, 0.475], [0.70, 0.60],
        [0.76, 0.60], [0.76, 0.515], [0.80, 0.47], [0.84, 0.515], [0.84, 0.60],
        [0.90, 0.60], [0.90, 0.50], [0.95, 0.46], [1.02, 0.50]],
            '#7db24a', '#8e9ea6');   // R9: 원본은 근경/중경 초록이 두 톤(밝은 연두 첨탑 ↔ 한 단 어두운 초록 매스)이고 외곽선은 둘 다 회청   // R8-2: 키라인을 채움과 두 단 갈라 중경도 실루엣 레이어로 선다   /* R4: 중경 열 올리브그린 복귀(원본 정합 — 2인 치명 '회색=다른 게임'. 병렬 세션 R3 의 '담장 판독' 처방(지붕 2톤+창)은 아래에 올리브 팔레트로 이식해 병합) */
        /* 중경 열 지붕 2톤 + 창(병렬 R3: '지붕·벽 분리와 창이 없으면 건물 판정이 안 선다') */
        [[0.03, 0.055, 0.08, 0.495, 0.45], [0.155, 0.185, 0.215, 0.415, 0.365], [0.30, 0.335, 0.37, 0.485, 0.44],
        [0.475, 0.505, 0.535, 0.385, 0.335], [0.63, 0.665, 0.70, 0.475, 0.43], [0.76, 0.80, 0.84, 0.515, 0.47]].forEach(([lx, px, rx2, by, py]) =>
            fill(ctx, '#95bb5c', () => { ctx.moveTo(W * lx, H * by); ctx.lineTo(W * px, H * py); ctx.lineTo(W * rx2, H * by); }));
        [[0.048, 0.525], [0.178, 0.455], [0.328, 0.525], [0.498, 0.425], [0.655, 0.515], [0.792, 0.545]].forEach(([wx, wy]) =>
            fill(ctx, '#83aa53', () => ctx.rect(W * wx, H * wy, W * 0.014, H * 0.032)));
        /* R8-2 2인 공통 '같은 오각 지붕이 등간격 반복 = 도장 찍기': 폭·높이·지붕 형태를 셋(박공·
           평지붕 낮은 채·계단형 망루)으로 섞고 피치를 불규칙하게. 벽은 여전히 수직 두 점(사선
           연쇄는 산맥이 된다 — 1차 시안 함정). */
        /* R8-2 재조정: 원본 확대 실측은 **높고 좁은 첨탑**(꼭대기 0.36~0.50H · 밑변 0.75H ·
           폭 0.09~0.11W)인데 첫 시안은 낮고 넓은 채라 '산울타리'로 되돌아갔다. 높이를 올리고
           폭을 좁혀 세로 리듬을 세운다(면적은 비슷해 명도 밴드는 유지된다). */
        town([[-0.02, 0.75], [0.02, 0.75], [0.02, 0.545], [0.062, 0.395], [0.104, 0.545], [0.104, 0.75],
        [0.135, 0.75], [0.135, 0.60], [0.185, 0.60], [0.185, 0.475], [0.225, 0.475], [0.225, 0.68], [0.225, 0.75],
        [0.255, 0.75], [0.255, 0.575], [0.305, 0.415], [0.355, 0.575], [0.355, 0.75],
        [0.385, 0.75], [0.385, 0.645], [0.435, 0.645], [0.435, 0.75],
        [0.465, 0.75], [0.465, 0.515], [0.518, 0.355], [0.571, 0.515], [0.571, 0.75],
        [0.605, 0.75], [0.605, 0.585], [0.648, 0.585], [0.648, 0.455], [0.690, 0.455], [0.690, 0.69], [0.690, 0.75],
        [0.725, 0.75], [0.725, 0.56], [0.778, 0.41], [0.831, 0.56], [0.831, 0.75],
        [0.865, 0.75], [0.865, 0.62], [0.915, 0.47], [0.965, 0.62], [0.965, 0.75],
        [1.00, 0.75], [1.00, 0.58], [1.02, 0.52]],
            '#90c040', '#75858e');   // R9 원본 5배 실측: 마을 외곽선은 초록이 아니라 **회청색**이다
        /* 근경 열 지붕/벽 분리(3차 재채점 교집합 ⓒ — 초록 단색 폴리라인은 '산울타리'로 읽힌다):
           박공마다 지붕 삼각을 어두운 초록으로 채워 벽(연초록)·지붕(진초록)이 갈리면 건물이 된다.
           ⚠️ 원본 실측이 '초록 성벽'이라 초록 자체는 유지(사용자 지시 우선 원칙) — 색상군은 두고
           명도만 가른다. */
        [[0.02, 0.062, 0.104, 0.545, 0.395], [0.255, 0.305, 0.355, 0.575, 0.415], [0.465, 0.518, 0.571, 0.515, 0.355],
        [0.725, 0.778, 0.831, 0.56, 0.41], [0.865, 0.915, 0.965, 0.62, 0.47]].forEach(([lx, px, rx2, by, py]) => {
            fill(ctx, '#6ea63a', () => { ctx.moveTo(W * lx, H * by); ctx.lineTo(W * px, H * py); ctx.lineTo(W * rx2, H * by); });
            fill(ctx, '#8cc44c', () => { ctx.moveTo(W * lx, H * by); ctx.lineTo(W * px, H * py); ctx.lineTo(W * px, H * by); });   // 빛 받는 왼 지붕면(2톤)
        });
        /* 창 실루엣(10차 2인 공통 '마을 판독') — 근경 열 벽면에 어두운 창 5개 */
        [[0.045, 0.605], [0.155, 0.665], [0.290, 0.635], [0.400, 0.690], [0.505, 0.575], [0.660, 0.620], [0.765, 0.620], [0.900, 0.672]].forEach(([wx, wy]) =>
            fill(ctx, '#6ea63a', () => ctx.rect(W * wx, H * wy, W * 0.020, H * 0.038)));
        /* 굴뚝(9차 '마을이 아니라 도시 실루엣') — 근경 열 지붕 경사 위 작은 굴뚝 3개 */
        [[0.075, 0.500], [0.530, 0.462], [0.940, 0.555]].forEach(([cx, cy]) => {
            fill(ctx, '#90c040', () => ctx.rect(W * cx, H * (cy - 0.055), W * 0.017, H * 0.055));
            ctx.strokeStyle = '#5b9432'; ctx.lineWidth = H * 0.014;
            ctx.strokeRect(W * cx, H * (cy - 0.055), W * 0.017, H * 0.055);
            fill(ctx, '#5b9432', () => ctx.rect(W * (cx - 0.004), H * (cy - 0.068), W * 0.025, H * 0.016));
        });
        /* (8차 '오클루전 한 겹'으로 넣었던 중경 소형 나무는 R4 에서 **삭제** — 비평가 2인 공통
           '주인공(망치) 옆 시선 분산 + 원본에 없는 발명'. 오클루전은 우측 큰 나무·모서리 덤불이
           이미 감당한다. R() 호출 수가 줄어 뒤 소품 배치가 달라지지만 전부 고정 수열이라 결정적. */
        ground(ctx, W, H, H * 0.82, '#9bd85c');
        ground(ctx, W, H, H * 0.91, '#86ca4c');
        for (let i = 0; i < 14; i++) {                                    // 풀포기 — R6 2인 공통 '등간격 스탬프/울타리 띠': 수 절반 + 폭·높이 편차
            const x = R() * W, y = H * (0.84 + R() * 0.14), h = H * (0.035 + R() * 0.075), w2 = H * (0.022 + R() * 0.040);
            fill(ctx, '#66ab48', () => { ctx.moveTo(x, y); ctx.lineTo(x + w2 * (0.35 + R() * 0.3), y - h); ctx.lineTo(x + w2, y); });
        }
        // 오른쪽 큰 나무 — 줄기 + 잎 덩어리(어두운 채움 + 연두 림 혹). [열기] 가 일부를 덮는 건 원본과 같다.
        (() => {
            const tx = W * 0.86;
            [[H * 0.026, '#12300f'], [0, '#5d4030']].forEach(([pad, c]) => {   // 줄기 2획(키라인 언더레이 — R2 공통)
                ctx.strokeStyle = c; ctx.lineCap = 'round';
                ctx.lineWidth = H * 0.075 + pad * 2;
                ctx.beginPath(); ctx.moveTo(tx + H * 0.07, H * 0.86); ctx.quadraticCurveTo(tx - H * 0.05, H * 0.60, tx - H * 0.02, H * 0.30); ctx.stroke();
                ctx.lineWidth = H * 0.045 + pad * 2;
                ctx.beginPath(); ctx.moveTo(tx - H * 0.03, H * 0.52); ctx.quadraticCurveTo(tx - H * 0.22, H * 0.42, tx - H * 0.30, H * 0.28); ctx.stroke();
                ctx.lineCap = 'butt';
            });
            const blobs = [];
            for (let i = 0; i < 6; i++)                                   // 아래층 잎(가장 어둡게 — 캐노피 명도 3단, 비평가 5차)
                blobs.push([W * 0.86 + H * (-0.26 + R() * 0.56), H * (0.10 + R() * 0.28), H * (0.11 + R() * 0.08), '#1f5c22']);
            for (let i = 0; i < 9; i++)                                   // 잎 덩어리(진초록)
                blobs.push([W * 0.86 + H * (-0.30 + R() * 0.60), H * (-0.08 + R() * 0.34), H * (0.13 + R() * 0.09), '#2f7a2f']);
            /* 상단 늘어진 캐노피(R8 값게이트): 원본의 우측 나무는 **카드 위 모서리에서 늘어져
               x 0.58W 까지 덮는 큰 덩어리**인데, 클론은 0.86W 에 붙은 작은 사탕나무라 위 밴드가
               원본보다 24 밝았다(비평가 4차 '우측 앵커 왜소'와 같은 결함의 계측판). 위쪽만
               왼쪽으로 뻗어 아래 밴드(0.25~0.33H)는 안 건드린다. */
            for (let i = 0; i < 7; i++)                                   // R9: 좌상단에서 뺀 어두운 질량을 우측 캐노피 확장으로 보충(밴드1 정합)
                blobs.push([W * 0.765 + H * (-0.40 + R() * 0.46), H * (-0.14 + R() * 0.30), H * (0.12 + R() * 0.085), '#2a7029']);
            for (let i = 0; i < 5; i++)                                   // 중간층(윗부분 밝게)
                blobs.push([W * 0.86 + H * (-0.28 + R() * 0.48), H * (-0.10 + R() * 0.20), H * (0.07 + R() * 0.05), '#4b9a3c']);
            for (let i = 0; i < 7; i++)                                   // 연두 림라이트 혹 — R7 2인 공통 '나무 무선': 무선으로 맨 위에 얹으면 실루엣 키라인이 끊긴다 → 스트로크 세트에 포함
                blobs.push([W * 0.86 + H * (-0.30 + R() * 0.52), H * (-0.10 + R() * 0.26), H * (0.045 + R() * 0.035), '#79c257']);
            ctx.strokeStyle = '#12300f'; ctx.lineWidth = H * 0.032;       // 캐노피 합집합 키라인(R2 공통 — 채움이 안쪽 획을 덮는다)
            blobs.forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); });
            blobs.forEach(([x, y, r, c]) => fill(ctx, c, () => ctx.arc(x, y, r, 0, Math.PI * 2)));
        })();
        // 모서리 수풀 — 좌하단(키라인 있는 덤불 덩어리)
        const bush = (bx, by, s, fc, oc) => {
            const p = () => { ctx.arc(bx - H * 0.10 * s, by, H * 0.11 * s, 0, Math.PI * 2); ctx.arc(bx + H * 0.02 * s, by - H * 0.07 * s, H * 0.13 * s, 0, Math.PI * 2); ctx.arc(bx + H * 0.15 * s, by, H * 0.11 * s, 0, Math.PI * 2); };
            /* 스트로크 → 채움 순서(스티커 기법): 채움이 안쪽 획을 덮어 **합집합 실루엣 키라인**만
               남는다 — 채움 먼저 하면 원 3개의 안쪽 경계가 보여 벤다이어그램이 된다(2차 재채점). */
            ctx.beginPath(); p(); ctx.strokeStyle = oc; ctx.lineWidth = H * 0.036; ctx.stroke();
            ctx.beginPath(); p(); ctx.fillStyle = fc; ctx.fill();
            ctx.save();                                                    // 셀 그늘 한 단(R3 B ⓓ '전경 소품 2톤 — 원본 화법'): 아래 절반 하드에지 그늘
            ctx.beginPath(); p(); ctx.clip();
            ctx.fillStyle = 'rgba(0,0,0,.16)';
            ctx.fillRect(bx - H * 0.30 * s, by - H * 0.015 * s, H * 0.60 * s, H * 0.30 * s);
            ctx.restore();
        };
        /* 키라인 통일(3차 재채점 교집합 ⓔ — '주먹·망치만 키라인이라 조형 언어가 갈린다'):
           근경 덤불도 주인공과 같은 근흑 키라인으로 내려 전경 소품의 화법을 하나로 묶는다.
           + 좌측 전경 덤불 1개 추가(좌하단이 풀포기뿐이라 전경 층이 비었다). */
        (() => {                                                          // R9 좌측 프레임 잎 덩어리(원본 5배 실측 — x 0~0.09W · y 0.45~1.05H)
            const blobs = [];
            for (let i = 0; i < 7; i++)
                blobs.push([W * (-0.005 + R() * 0.055), H * (0.50 + R() * 0.55), H * (0.085 + R() * 0.070), i % 2 ? '#1d5a34' : '#17492b']);
            ctx.strokeStyle = '#0b2413'; ctx.lineWidth = H * 0.034;        // 합집합 키라인(스트로크→채움)
            blobs.forEach(([bx, by, r]) => { ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.stroke(); });
            blobs.forEach(([bx, by, r, c]) => fill(ctx, c, () => ctx.arc(bx, by, r, 0, Math.PI * 2)));
            for (let i = 0; i < 6; i++)                                    // 밝은 연두 스캘럽 림(원본의 그 가장자리 혹)
                fill(ctx, '#a8e04a', () => ctx.arc(W * (0.035 + R() * 0.035), H * (0.52 + R() * 0.50), H * (0.028 + R() * 0.024), 0, Math.PI * 2));
        })();
        bush(W * 0.04, H * 0.98, 1.5, '#519f36', '#16391a');
        bush(W * 0.115, H * 1.05, 2.0, '#489733', '#16391a');
        /* (0.30W 덤불은 R9 D4 로 삭제 — 원본 하단 가운데는 평평한 지면 띠라 주인공 실루엣이 깨끗하게 뜬다) */
        bush(W * 0.925, H * 1.00, 1.7, '#3f8f2c', '#16391a');   // R8-2 A13·B7: 우측 나무 밑동을 모서리 덤불이 물어 '가로등 기둥' 오독 해소(원본도 우하단이 어두운 잎 덩어리다)
        // 좌상단 늘어진 수풀 — 원본은 좌우 가장자리가 잎으로 채워져 프레임이 꽉 찬다(비평가 4차 '성김')
        for (let i = 0; i < 7; i++) {
            const x = W * (-0.030 + R() * 0.085), y = H * (0.10 + R() * 0.34), r = H * (0.105 + R() * 0.085);   // R9 D14 '좌상단 잎이 제목 첫 글자 뒤까지' — 아래·왼쪽으로 민다
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 ? '#337c31' : '#2a6f2a'; ctx.fill();
            ctx.strokeStyle = '#12300f'; ctx.lineWidth = H * 0.028; ctx.stroke();
        }
        for (let i = 0; i < 3; i++) {
            const x = W * (0.005 + R() * 0.06), y = H * (-0.06 + R() * 0.22), r = H * (0.035 + R() * 0.025);
            fill(ctx, '#79c257', () => ctx.arc(x, y, r, 0, Math.PI * 2));
        }

        /* 주인공 — **대각선으로 휘두르는 망치 + 자루를 감아쥔 주먹** (비평가 A·B 공통 1순위).
           종전엔 자루가 수직(-0.16rad)이고 주먹이 자루 '아래 끝'에 붙어 '막대 위에 망치가 박힌
           정지 구도'로 읽혔다. 원본(1행 확대)은 망치 머리가 우상단, 자루가 좌하로 45° 기울고
           주먹이 자루 **중간**을 감아쥔다(손가락 골이 자루와 직교로 4줄). 좌표는 세로 1.0 정규계
           (x 0~3.45) — `_sticker` 헬퍼가 두 축 모두 S(=H)를 곱는다.
           ⚠️ 머리는 모서리 둥근 상자(육각 폴리곤이면 302px 에서 '초록 육각 덩어리'). 차례 = 앞뒤:
           자루 → 주먹(자루 위) → 머리(맨 위). 주먹·손가락은 자루 기울기와 같은 프레임에서 그려야
           골이 직교로 떨어진다. */
        const SWING = Math.atan2(0.545 - 1.030, 2.060 - 1.500);                           // 자루 기울기 ≈ -0.71rad
        ink(ctx, S, bar(ctx, S, 1.500, 1.030, 2.060, 0.545, 0.078), '#c08b41', 0.030);    // 자루(좌하→우상) — R8 값게이트: 원본 실측 자리로 내려 앉힌다
        on(ctx, bar(ctx, S, 1.524, 0.978, 2.038, 0.585, 0.024), 'rgba(255,255,255,.30)'); // 자루 광택
        // (5차에 넣던 나무 결 2줄은 뺐다 — 광택선·머리 밴드와 교차해 '누빔 체크'로 읽혔다, 비평가 7차)
        ctx.save();                                                                       // 주먹 — 자루 중간을 감아쥔다
        // 수직 자루(θ=-π/2) 코드의 무회전이 기준이므로, 임의 기울기에선 θ+π/2 만큼 돌린다.
        ctx.translate(1.742 * S, 0.842 * S); ctx.rotate(SWING + Math.PI / 2); ctx.scale(0.76, 0.76);   // R9 2인 공통 '주인공 과대 — 스카이라인 중앙을 가린다'
        /* ⚠️ 주먹 색을 자루(#c08b41)와 같은 갈색 계열(#cf8f5f)로 하면 배너 축소에서 자루와 한
           덩어리로 녹아 '손 없는 막대'로 읽힌다 — 3라운드 연속 비평가 전원이 그렇게 오독했다.
           밝은 살구톤 + 왼 가장자리 너클 스캘럽 + 분리된 엄지로 '주먹'을 세운다. */
        /* R1 비평가 2인 공통 '손이 주인공': 주먹을 ~12% 줄이고 살구톤을 한 단 내려 시선을 망치로
           돌린다(⚠️ 갈색까지 내리면 '손 없음' 오독 — 3라운드 확정 함정이라 살구 계열 유지).
           엄지는 키우고 키라인을 굵혀 '감아쥔 그립'을 명시(A '엄지 없이 겹친 반죽'). */
        /* R2 비평가 2인 공통 '원 4~5개 세로 스택 = 포도알/애벌레': 왼 가장자리 너클 스캘럽 원들을
           **걷어내고 한 덩어리 주먹**으로 단순화(원본의 해법 — 작고 단순한 주먹). 감아쥔 그립은
           스캘럽이 아니라 얕은 손가락 골 2줄 + 엄지가 말한다. */
        ink(ctx, S, rrect(ctx, S, -0.132, -0.145, 0.264, 0.290, 0.095), '#dda269', 0.034);
        on(ctx, rrect(ctx, S, -0.104, -0.020, 0.118, 0.028, 0.014), 'rgba(0,0,0,.28)');   // 손가락 골 — 한 줄, 왼 절반만(가로로 관통하면 '붕대'가 된다, R8 B8)
        ink(ctx, S, ell(ctx, S, 0.100, 0.092, 0.064, 0.084), '#eab27e', 0.034);           // 엄지(감아쥔 쪽, 한 단 밝게 + 굵은 키라인)
        on(ctx, ell(ctx, S, 0.082, 0.066, 0.026, 0.020), 'rgba(255,255,255,.28)');        // 엄지 손톱 쪽 광(그립 방향 명시)
        /* 손목(잔여 결함 ⓑ): 짙은 갈색(#a8683f)이면 주먹과의 경계가 '손목 밴드 장갑'으로 읽힌다
           (8차 지적) — 주먹 살구톤에서 한 톤만 내려 같은 살에서 이어지게 한다.
           9차 '절단된 주먹': 손목 아래로 **소매를 프레임 밖까지** 이어 '화면 밖에서 들어온 팔'로 —
           풀밭 한가운데서 뚝 끊기면 잘린 손이 떠 있는 그림이 된다. */
        ink(ctx, S, rrect(ctx, S, -0.102, 0.132, 0.204, 0.118, 0.048), '#cf9260', 0.028);
        /* (주먹 밑 접힘 가로선은 R8 B8 '가로 줄무늬 = 붕대'로 삭제 — 손목 경계는 실루엣 폭으로만) */
        /* R4 비평가 2인 공통 '보라 소매는 원본에 없는 발명(원본은 맨팔)': 소매를 팔뚝 살빛으로
           되돌린다. 9차 '절단된 주먹' 처방(프레임 밖까지 잇는다)은 형태 그대로 유지 — 색만 살로. */
        ink(ctx, S, rrect(ctx, S, -0.135, 0.238, 0.270, 0.700, 0.060), '#c88a58', 0.030); // 팔뚝(맨팔) — 프레임 하단 크롭 밖까지(0.86 축소분만큼 길이 보정)
        on(ctx, rrect(ctx, S, 0.045, 0.250, 0.092, 0.700, 0.046), 'rgba(0,0,0,.16)');     // 팔뚝 그늘 — 가로 띠가 아니라 **오른 가장자리 세로 한 단**(R8 B8)
        ctx.restore();
        ctx.save();                                                                       // 머리 — 자루 끝(우상단)
        // 머리 상자는 세로(local y)가 장축 = 자루와 직교하려면 회전각이 자루 기울기 그대로여야 한다.
        ctx.translate(2.062 * S, 0.520 * S); ctx.rotate(SWING); ctx.scale(0.62, 0.62);   // R9 2인 공통 '주인공 과대'
        /* R1 비평가 2인 공통 '망치 머리 은색 = 원본 아이덴티티 손실': 원본 실측은 어두운 올리브+
           금색 계열이다 — 어두운 올리브 2톤. 마을 초록(#71a94c·#4c7a3a)보다 두 단 어두운
           올리브라 실루엣이 붙지 않고, 머리가 걸리는 배경도 대부분 하늘이다. 금은 쐐기 못이 맡는다. */
        /* R3 A·B 교집합 ⓐ — '내부 밴드 2면으로는 부족, 실루엣 자체가 사선 평행육면체여야':
           클립 안 밝은 띠(가짜 윗면)를 폐기하고 **윗면 평행사변형 + 끝면 평행사변형을 실루엣에
           붙인다**. local +x = 자루 진행 방향(회전 후 우상향) = 윗면 쪽, 깊이 벡터 v=(0.100,-0.082)
           (화면에서 위쪽으로 물러나는 사선). 정면(바탕 올리브)·윗면(밝은 올리브)·끝면(중간 톤)
           세 채움의 하드 에지가 면 경계 — 그라디언트 밴드 금지 규약은 그대로다. */
        /* 이번 런 A '3면 박스는 소실 방향이 어긋나 접혀 보인다 — 2면(정면+밝은 상판)으로 재작도':
           끝면 평행사변형을 걷어내고 정면 사각 + 윗면 평행사변형만 남긴다(단순 사선 투영 —
           캐주얼 카툰 상자의 표준 문법). 색은 원본 실측(어두운 올리브+금)이라 유지 — A 의
           '짙은 강철로 재채색' 처방은 기록된 원본 아이덴티티 실측과 상충해 채택하지 않는다. */
        const FR = [[-0.185, -0.255], [0.115, -0.255], [0.115, 0.255], [-0.185, 0.255]];  // 정면(A·B·C·D)
        const VX = 0.100, VY = -0.082;                                                    // 깊이 벡터(윗면 사선)
        const uni = poly(ctx, S, [[-0.185, 0.255], [0.115, 0.255],                        // 합집합(D→C→C'→B'→B→A)
        [0.115 + VX, 0.255 + VY], [0.115 + VX, -0.255 + VY], [0.115, -0.255], [-0.185, -0.255]]);
        ink(ctx, S, uni, '#4f5429', 0.040);                                               // 정면 바탕 + 근흑 키라인(R6 A '카키 상자' — 한 단 침강 + 키라인 증량)
        on(ctx, poly(ctx, S, [FR[1], FR[2], [0.115 + VX, 0.255 + VY], [0.115 + VX, -0.255 + VY]]), '#bfa74e');   // 윗면(빛면)
        on(ctx, bar(ctx, S, 0.115, -0.255, 0.115, 0.255, 0.016), 'rgba(0,0,0,.40)');      // 정면-윗면 하드 에지
        ink(ctx, S, ell(ctx, S, 0.005, -0.175, 0.040, 0.034), '#c9a24e', 0.024);          // 쐐기 못(정면)
        on(ctx, ell(ctx, S, -0.007, -0.183, 0.016, 0.013), 'rgba(255,255,255,.55)');      // 못 하이라이트
        ink(ctx, S, rrect(ctx, S, -0.110, 0.215, 0.150, 0.110, 0.026), '#b08a3c', 0.030);   // 자루 물림 금 페룰 — 머리 하변(0.255)에 물려 실루엣과 통합(R7 A '별개 사각' 해소)
        ctx.restore();
    };

    /* 👻 유령 마을 — 밤하늘 + 별 + 큰 달 + 언덕 + 묘비·마른 나무 */
    G.draw.dg_ghost = function (ctx, S) {
        /* 원본(2행 확대 실측 2026-08-19): 별은 **성기다**(십수 개, 크기 편차), 달은 크림색에
           어두운 소용돌이 무늬 + 회청 헤일로 원반, 하늘엔 **찢긴 검은 구름 줄**이 달을 가로지른다
           (박쥐가 아니다). 묘비는 우하단에 큰 것 둘(해골·RIP 각인), 좌측은 잎 달린 큰 나무,
           모서리엔 어두운 덤불. */
        const W = S * AR, H = S, R = rnd(23);
        sky(ctx, W, H, '#1d2547', '#080b1c');   /* R5 B(2연속) '원본은 거의 검정 암청' — 한 단 감광(title-ink 좌반 하한 26 주의: 이 이상 내리지 말 것) */
        /* 🚨 R10 — **상단 가로 헤이즈 타원을 삭제했다.** '원본 상단의 한 단 밝은 하늘 덩어리'라는
           전제가 틀렸다: 원본 2행의 같은 창(x0.36~0.52W · y0.05~0.21H)은 **단색 rgb(36,38,61) 이
           90.4%** 이고 그보다 밝은 픽셀은 4.5% 뿐이다(`tools/probe-dg-sky.js`). 반면 클론은 이
           타원(x0.26~0.86W 를 가로지르는 폭 0.60W 짜리)이 창의 대부분을 덮어 **최빈색 자체가
           타원 색(L58)** 이 돼 있었다 — 원본보다 21 밝고, 눈으로는 '하늘을 가로지르는 얼룩'이다.
           원본에서 밝은 건 **달 주위 둥근 헤일로 하나뿐**이고 가로 띠는 없다(원본 8배 크롭 확인).
           → 타원을 걷고 달 헤일로만 남긴다(아래 mr*1.42 원반. 이 런에서 한 겹 더 넓혀 부드럽게).
           ⚠️ 다음 세션: 여기 다시 가로 띠를 깔지 말 것 — 4행 '구름 막대'와 같은 병이다. */
        for (let i = 0; i < 26; i++) {                                    // 별 — 원본처럼 성기게. 3차 교집합 ⓔ: 최대 지름 절반('행성처럼 크다') — 단 크기 편차는 원본 사양이라 편차 자체는 유지
            const x = R() * W, y = R() * H * 0.72, r = H * (0.005 + R() * 0.007);
            fill(ctx, `rgba(255,255,255,${0.35 + R() * 0.55})`, () => ctx.arc(x, y, r, 0, Math.PI * 2));
        }
        /* 구름 스트릭 공용(R1 비평가 2인 공통 '동일 반원 스캘럽 = 염주/애벌레'): 균일 반원 연쇄를
           버리고 **양끝이 뾰족하게 갈라지는 바람결 스트릭**으로 — 윗변은 반경이 크게 다른 완만한
           혹 몇 개, 아랫변은 뾰족 찢김, 좌우 꼬리는 가늘게 뽑는다(원본의 그 실루엣). */
        /* 이번 런 비평가 2인 교집합 '구름과 박쥐가 같은 뾰족 엣지 어휘를 공유해 번진 얼룩':
           찢김 스파이크(아랫변 지그재그·뾰족 꼬리)를 걷어내고 **매끈한 로브형 밤구름**으로 —
           윗변은 완만한 혹, 아랫변도 완만한 곡선, 꼬리는 둥글게 가늘어진다. 뾰족 엣지는
           이제 박쥐 전용 어휘라 실루엣 단계에서 종이 갈린다. */
        const streak = (sx, sy, len, th, c) => {
            ctx.beginPath();
            ctx.moveTo(sx - th * 2.4, sy + th * 0.45);                     // 둥근 왼 꼬리
            ctx.quadraticCurveTo(sx - th * 0.9, sy + th * 0.08, sx, sy);
            let x = sx;
            while (x < sx + len) {                                         // 윗변 — 완만한 로브
                const seg = H * (0.09 + R() * 0.12), r = th * (0.55 + R() * 0.85);
                ctx.quadraticCurveTo(x + seg * 0.5, sy - r * 1.6, x + seg, sy - r * 0.12);
                x += seg;
            }
            ctx.quadraticCurveTo(x + th * 1.0, sy + th * 0.08, x + th * 2.6, sy + th * 0.42);   // 둥근 오른 꼬리
            while (x > sx) {                                               // 아랫변 — 완만한 로브(찢김 금지)
                const seg = H * (0.10 + R() * 0.12);
                ctx.quadraticCurveTo(x - seg * 0.5, sy + th * (0.85 + R() * 0.45), x - seg, sy + th * (0.40 + R() * 0.20));
                x -= seg;
            }
            ctx.closePath(); ctx.fillStyle = c; ctx.fill();
        };
        streak(W * 0.22, H * 0.14, W * 0.26, H * 0.030, '#141a33');        // 뒤 구름 줄 2개(달 뒤·한 단 밝게)
        streak(W * 0.48, H * 0.55, W * 0.24, H * 0.026, '#141a33');
        const mx = W * 0.578, my = H * 0.375, mr = H * 0.175;             // 달 — R8 값게이트: 원본 실측(중심 0.365H · 반경 0.19H)
        /* 회청 헤일로 — 원본은 달 주위가 **부드럽게** 밝다. 그라디언트 금지 규약은 지키되(플랫
           원반), 상단 가로 헤이즈를 걷어낸 만큼 원반을 **두 겹**으로 넓혀 falloff 를 흉내낸다. */
        fill(ctx, 'rgba(190,200,225,.07)', () => ctx.arc(mx, my, mr * 1.95, 0, Math.PI * 2));   // 바깥 겹(옅게)
        fill(ctx, 'rgba(190,200,225,.13)', () => ctx.arc(mx, my, mr * 1.42, 0, Math.PI * 2));   // 회청 헤일로 원반(플랫 — 원본 실측 사양)
        /* (방사형 발광 그라디언트는 R4 에서 삭제 — 비평가 A '플랫 셀 채색 원칙 정면 위반'.
           원본 달은 플랫 원반 + 플랫 헤일로 원반뿐이다. 달 본체도 원본 실측(255,233,159) 쪽으로 밝힘.) */
        fill(ctx, '#f7e7ad', () => ctx.arc(mx, my, mr, 0, Math.PI * 2));
        ctx.save();
        ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
        // 우하단 크레센트 음영 먼저(비평가 4차 '매끈한 원') — 소용돌이는 그 위에 얹는다
        // (크레센트 음영은 R7 에서 삭제 — A R4 '표면 얼룩': 원본은 플랫 원 + 헤일로 링뿐)
        /* 소용돌이 무늬(원본 달의 'S' 마킹) — 3차 A '숫자 6으로 읽힘': 원본 사양이라 각인 자체는
           유지하되(채택 금지 목록 — 크레이터 전면 교체 아님), 한 획 갈고리 → **위/아래 반원 두 획**
           으로 갈라 진짜 S 리듬으로 재조형. 폐곡선 느낌이 없어져 숫자로 안 읽힌다.
           + 흐린 크레이터 원반 2개(무늬 아닌 지형 결 — 저알파 보조). */
        ctx.strokeStyle = 'rgba(120,100,55,.30)'; ctx.lineWidth = mr * 0.28; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(mx - mr * 0.10, my - mr * 0.22, mr * 0.34, Math.PI * 0.75, Math.PI * 1.85);   // 윗 반원(왼쪽으로 열림)
        ctx.stroke();
        ctx.beginPath(); ctx.arc(mx + mr * 0.02, my + mr * 0.26, mr * 0.32, Math.PI * 1.80, Math.PI * 0.85);   // 아랫 반원(오른쪽으로 열림)
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
        /* 찢긴 검은 구름 줄 — 원본의 그 가로 스트릭. 달 **앞**을 지나는 한 줄이 핵심이라 달 뒤에
           깔면 의미가 없다(그래서 달 다음에 그린다). 좌반부 평균 휘도 하한(probe-dungeon-title-ink,
           26)을 깎지 않게 왼쪽 끝(x<0.18W)까지는 끌지 않는다. */
        /* 달 앞 검은 구름 — R2 비평가 2인 공통 '전폭 관통 균일 파형 = 장식 보더/CSS 패턴':
           **전폭 한 줄을 버리고** 길이·높이가 어긋난 짧은 조각 2개로 갈랐다(원본도 찢긴 조각들이
           달을 지나는 구성). 조각이 짧으면 혹 반복이 두세 개뿐이라 패턴으로 읽힐 틈이 없다. */
        streak(W * 0.355, H * 0.300, W * 0.160, H * 0.040, '#080b18');    // 달 왼 가장자리에 걸치는 조각
        streak(W * 0.590, H * 0.345, W * 0.120, H * 0.034, '#080b18');    // 달 오른 아래 조각(y를 어긋냄)
        /* 박쥐 — '개별 박쥐 실루엣'(비평가 2~4차 공통). ⚠️ 얕은 갈매기 곡선은 '물결 스크리블'로
           읽힌다(4차에서 확인) — 날개를 위로 활짝 편 윤곽 + 아래 가장자리 스캘럽 2개 + 몸통·귀가
           있어야 박쥐가 된다. 밝은 달 원반 위 한 마리가 실루엣 대비의 핵심. */
        const bat = (bx, by, bw, rot) => {
            ctx.save();                                                    // R1 공통 '같은 스탬프 반복 + 나방 오독': 마리마다 기울여 비행 자세를 갈라 도장 반복을 깬다
            ctx.translate(bx, by); ctx.rotate(rot || 0); ctx.translate(-bx, -by);
            ctx.beginPath();
            ctx.moveTo(bx - bw * 1.06, by - bw * 0.86);                                      // 왼 날개 끝(더 높고 뾰족하게 — 대칭 원호 날개는 나방으로 읽힌다)
            ctx.quadraticCurveTo(bx - bw * 0.72, by + bw * 0.10, bx - bw * 0.52, by + bw * 0.16);
            ctx.quadraticCurveTo(bx - bw * 0.40, by - bw * 0.06, bx - bw * 0.28, by + bw * 0.16);   // 스캘럽 1
            ctx.quadraticCurveTo(bx - bw * 0.16, by - bw * 0.04, bx - bw * 0.10, by + bw * 0.14);   // 스캘럽 2
            ctx.lineTo(bx - bw * 0.10, by - bw * 0.16);                                      // 몸통 왼쪽
            ctx.lineTo(bx - bw * 0.14, by - bw * 0.34);                                      // 왼 귀
            ctx.lineTo(bx - bw * 0.04, by - bw * 0.22);
            ctx.lineTo(bx + bw * 0.04, by - bw * 0.22);
            ctx.lineTo(bx + bw * 0.14, by - bw * 0.34);                                      // 오른 귀
            ctx.lineTo(bx + bw * 0.10, by - bw * 0.16);
            ctx.lineTo(bx + bw * 0.10, by + bw * 0.14);
            ctx.quadraticCurveTo(bx + bw * 0.16, by - bw * 0.04, bx + bw * 0.28, by + bw * 0.16);
            ctx.quadraticCurveTo(bx + bw * 0.40, by - bw * 0.06, bx + bw * 0.52, by + bw * 0.16);
            ctx.quadraticCurveTo(bx + bw * 0.72, by + bw * 0.10, bx + bw * 1.06, by - bw * 0.86);   // 오른 날개 끝(뾰족)
            ctx.quadraticCurveTo(bx + bw * 0.34, by - bw * 0.38, bx, by - bw * 0.16);        // 날개 윗변(깊게 파인다 — 박쥐 막날개)
            ctx.quadraticCurveTo(bx - bw * 0.34, by - bw * 0.38, bx - bw * 1.06, by - bw * 0.86);
            ctx.closePath(); ctx.fillStyle = '#05070f'; ctx.fill();
            ctx.restore();
        };
        /* 달 위 1마리(R3 A·B 교집합 ⓒ): 구름과 분리해도 상세 박쥐(스캘럽 2단+귀)는 자체 오독
           ('날개 4장 겹침 얼룩') — 달 원반 위는 **날개 2장 활공 실루엣**으로 단순화한다. 앞전은
           매끈한 한 획, 뒷전만 스캘럽 — 부속(귀·몸통 디테일)을 걷어야 원반 위에서 한 번에 읽힌다. */
        (() => {
            /* ⚠️ 자리 이력: 좌중앙(0.565W) → 원반 우상(0.605W) 모두 '스트릭과 융합' 지적이
               3라운드 연속 나왔다 — R3 A3 처방('달 원 밖으로 6~8px')대로 **원반 오른쪽 헤일로
               위**(0.685W)로 뺀다. 헤일로 발광이 배경이라 실루엣 대비는 유지된다. '달 위 1마리'
               사양보다 '융합 해소'가 3라운드 연속 교집합이라 우선한다. */
            const bx = W * 0.685, by = H * 0.140, bw = H * 0.105;
            fill(ctx, '#05070f', () => {
                ctx.moveTo(bx - bw, by - bw * 0.34);                                            // 왼 날개 끝(뾰족)
                ctx.quadraticCurveTo(bx - bw * 0.45, by - bw * 0.04, bx - bw * 0.10, by - bw * 0.08);   // 앞전(매끈)
                ctx.quadraticCurveTo(bx, by - bw * 0.20, bx + bw * 0.10, by - bw * 0.08);       // 몸통 혹 하나
                ctx.quadraticCurveTo(bx + bw * 0.45, by - bw * 0.04, bx + bw, by - bw * 0.34);  // 오른 날개 끝(뾰족)
                ctx.quadraticCurveTo(bx + bw * 0.52, by + bw * 0.14, bx + bw * 0.28, by + bw * 0.08);   // 뒷전 스캘럽
                ctx.quadraticCurveTo(bx + bw * 0.10, by + bw * 0.24, bx, by + bw * 0.13);
                ctx.quadraticCurveTo(bx - bw * 0.10, by + bw * 0.24, bx - bw * 0.28, by + bw * 0.08);
                ctx.quadraticCurveTo(bx - bw * 0.52, by + bw * 0.14, bx - bw, by - bw * 0.34);
                ctx.closePath();
            });
        })();
        /* R10-2 — **두 박쥐의 높이 대칭을 깬다.** 종전 자리(0.285W·y0.065H 와 0.775W·y0.085H)는
           좌우 반대편에 **거의 같은 높이**로 놓여, 화면 상단을 프레이밍하는 **한 쌍의 눈썹/눈**으로
           읽혔다(작은 박쥐 실루엣의 '날개 위로 편 아치'가 눈썹 획과 같은 어휘라 더 그랬다).
           마릿수·크기·'개별 박쥐 실루엣' 사양은 유지하되(비평가 2~4차 교집합) 자리만 흩는다:
           왼쪽은 그대로 높이 두고, 오른쪽은 **한참 아래(0.115→0.23H)로 내리고 안쪽으로** 당겨
           같은 높이 쌍을 해체한다. 기울기도 더 벌려 '흩어져 활공하는' 자세로. */
        bat(W * 0.285, H * 0.065, H * 0.075, 0.30);
        bat(W * 0.815, H * 0.225, H * 0.050, -0.42);                      // 오른쪽 박쥐 — 높이·크기를 갈라 좌측과 쌍을 이루지 않게
        // 언덕 2겹
        fill(ctx, '#0d1226', () => { ctx.moveTo(0, H * 0.78); ctx.quadraticCurveTo(W * 0.30, H * 0.58, W * 0.62, H * 0.76); ctx.quadraticCurveTo(W * 0.85, H * 0.88, W, H * 0.72); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        /* 폐가 실루엣(9차 — 묘지뿐이라 '유령 **마을**'이 성립 안 함): 언덕 능선 위 좌중앙에
           지붕 꺾인 폐가 한 채 + 노란 창 하나. 창 불빛은 밝은 쪽이라 title-ink 하한(26)에 안전. */
        (() => {
            /* 2차 재채점 2인 공통 1순위: #10142b 는 하늘과 명도가 붙어 창문만 '허공에 뜬 주황 조각'이
               됐다 — 언덕(#151a34)보다 더 어두운 흑청으로 낮추고, 지붕을 키우고, 달 쪽(오른쪽)
               지붕선에 달빛 림라이트 한 줄을 얹어 '집 → 창' 소속을 명시한다. */
            const hx = W * 0.285, hy = H * 0.640, hw = W * 0.147, hh = H * 0.245;   // R8-2 A12: 1.4배 — 종전 크기는 302px 에서 '주황 점 박힌 얼룩'이었다
            const house = () => {
                ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - hh * 0.55);
                ctx.lineTo(hx + hw * 0.16, hy - hh * 0.55); ctx.lineTo(hx + hw * 0.44, hy - hh);   // 꺾인 박공(크게)
                ctx.lineTo(hx + hw * 0.80, hy - hh * 0.58); ctx.lineTo(hx + hw, hy - hh * 0.60);
                ctx.lineTo(hx + hw, hy); ctx.closePath();
            };
            ctx.beginPath(); house(); ctx.strokeStyle = '#03050e'; ctx.lineWidth = H * 0.030; ctx.lineJoin = 'round'; ctx.stroke();   // 키라인(스트로크→채움 = 합집합 실루엣)
            fill(ctx, '#0a0d1d', house);
            fill(ctx, '#0a0d1d', () => ctx.rect(hx + hw * 0.64, hy - hh * 1.15, hw * 0.13, hh * 0.58));   // 굴뚝
            ctx.strokeStyle = 'rgba(210,215,235,.40)'; ctx.lineWidth = H * 0.008;                          // 달빛 림(달 쪽 지붕선)
            ctx.beginPath(); ctx.moveTo(hx + hw * 0.44, hy - hh); ctx.lineTo(hx + hw * 0.80, hy - hh * 0.58); ctx.lineTo(hx + hw, hy - hh * 0.60); ctx.stroke();
            fill(ctx, '#e8c86a', () => ctx.rect(hx + hw * 0.32, hy - hh * 0.40, hw * 0.17, hh * 0.22));   // 불 켜진 창
        })();
        fill(ctx, '#0c1024', () => { ctx.moveTo(0, H * 0.90); ctx.quadraticCurveTo(W * 0.45, H * 0.78, W, H * 0.92); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        /* 유령 1기(이번 런 비평가 A·B 공통 '유령 마을에 유령 부재 — 주인공 없이 소품 나열'):
           오두막 오른쪽 언덕 위에 떠 있는 반투명 흰 유령 — 머리 돔 + 물결 자락 3혹 + 벌린 팔 +
           달빛 실루엣의 눈·입. 블록 머리말의 '달·묘비가 주인공이라 따로 안 얹는다' 전제는 비평가
           2쌍 연속 같은 지적이라 뒤집는다. 좌반부 휘도(title-ink 하한 26)는 밝아지는 쪽이라 안전. */
        (() => {
            /* R2 A2·B2 공통 '유령이 작고 회색이라 조연': 1.35배 확대 + 순백 + 묘비와 같은 근흑
               키라인(스트로크→채움 합집합) — 밤 무드의 다른 전경 소품 문법과 통일. */
            const gx = W * 0.470, gy = H * 0.560, r = H * 0.118, gc = '#f4f7ff';
            const body = () => {
                ctx.arc(gx, gy, r, Math.PI, 0);                                                   // 머리 돔
                ctx.lineTo(gx + r, gy + r * 1.15);
                ctx.arc(gx + r * 0.66, gy + r * 1.15, r * 0.34, 0, Math.PI);                      // 물결 자락(오른→왼)
                ctx.arc(gx, gy + r * 1.15, r * 0.34, 0, Math.PI);
                ctx.arc(gx - r * 0.66, gy + r * 1.15, r * 0.34, 0, Math.PI);
                ctx.closePath();
            };
            const armL = () => ctx.ellipse(gx - r * 1.10, gy + r * 0.32, r * 0.44, r * 0.24, -0.5, 0, Math.PI * 2);
            const armR = () => ctx.ellipse(gx + r * 1.10, gy + r * 0.26, r * 0.44, r * 0.24, 0.5, 0, Math.PI * 2);
            [body, armL, armR].forEach(p => { ctx.beginPath(); p(); ctx.strokeStyle = '#05071a'; ctx.lineWidth = H * 0.028; ctx.lineJoin = 'round'; ctx.stroke(); });
            [body, armL, armR].forEach(p => fill(ctx, gc, p));
            ctx.save();                                                                           // 자락 쪽 셀 그늘 한 단(전경 소품 2톤 문법)
            ctx.beginPath(); body(); ctx.clip();
            ctx.fillStyle = 'rgba(90,105,160,.28)';
            ctx.fillRect(gx - r * 1.1, gy + r * 0.78, r * 2.2, r * 0.85);
            ctx.restore();
            fill(ctx, '#141a34', () => ctx.arc(gx - r * 0.32, gy + r * 0.02, r * 0.14, 0, Math.PI * 2));     // 눈
            fill(ctx, '#141a34', () => ctx.arc(gx + r * 0.32, gy + r * 0.02, r * 0.14, 0, Math.PI * 2));
            fill(ctx, 'rgba(20,26,52,.80)', () => ctx.ellipse(gx, gy + r * 0.44, r * 0.15, r * 0.21, 0, 0, Math.PI * 2));   // 놀란 입
        })();
        /* 묘비 — 원본은 우하단에 **큰 것 둘**(회청 판 + 해골·RIP 각인)이고 [열기]가 일부를 덮는다.
           다섯 개를 고루 늘어놓던 종전 배치는 원본과 다르고 작아서 '바닥 혹'으로 읽혔다. */
        const stone = (x, y, w, h, sq, tilt) => {
            ctx.save(); if (tilt) { ctx.translate(x + w * 0.5, y + h); ctx.rotate(tilt); ctx.translate(-(x + w * 0.5), -(y + h)); }   // R8-2 2인 공통 '3기 균일' — 기울기 변주                                // sq=true 면 각진 어깨(형태 리듬 — 비평가 5차)
            const p = sq
                ? () => { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * 0.28); ctx.lineTo(x + w * 0.16, y + w * 0.12); ctx.lineTo(x + w * 0.84, y + w * 0.12); ctx.lineTo(x + w, y + w * 0.28); ctx.lineTo(x + w, y + h); ctx.closePath(); }
                : () => { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w * 0.5); ctx.arc(x + w * 0.5, y + w * 0.5, w * 0.5, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); };
            ctx.beginPath(); p(); ctx.strokeStyle = '#03050f'; ctx.lineWidth = H * 0.052; ctx.stroke();   // R2 공통 '전경 키라인 비일관' — 굵은 근흑 키라인(스트로크→채움 순서로 바깥만 남긴다)
            ctx.beginPath(); p(); ctx.fillStyle = '#111829'; ctx.fill();   // R9 2인 공통 '밝은 묘비가 달의 주목도를 뺏는다' — 한 단 더 침강   // R8-2 2인 공통 '배경보다 밝아 주목 순서가 뒤집혔다' — 하늘 아래로 침강   // R8 값게이트: 카드 하단 밴드가 원본보다 +24 떴다 — 반 단 침강   // R7: 채움을 반 단 올려 근흑 키라인이 갈리게(무선 오독 해소 — '밝다' 지적과의 균형점)   // R5 A·B 재공통 '묘비 스티커처럼 팝' — 한 단 더 침강(각인 자체는 원본 실측 사양: 해골+RIP 유지)
            /* R8-2 2인 공통 '해골 문양 대비가 과해 콘센트/로봇 얼굴로 읽힌다': 원본 각인은 아주
               얕다(판보다 반 단 어두운 정도) — 알파를 절반 아래로 내려 '새겨진 자국'으로. 형태
               (두 눈·코·이빨 골·RIP 줄)는 원본 실측 사양이라 그대로 둔다. */
            fill(ctx, 'rgba(8,10,24,.42)', () => ctx.arc(x + w * 0.36, y + w * 0.52, w * 0.13, 0, Math.PI * 2));             // 해골 각인(두 눈 + 코)
            fill(ctx, 'rgba(8,10,24,.42)', () => ctx.arc(x + w * 0.64, y + w * 0.52, w * 0.13, 0, Math.PI * 2));
            fill(ctx, 'rgba(8,10,24,.34)', () => { ctx.moveTo(x + w * 0.5, y + w * 0.62); ctx.lineTo(x + w * 0.42, y + w * 0.78); ctx.lineTo(x + w * 0.58, y + w * 0.78); });
            [-0.15, 0, 0.15].forEach(dx =>                                                        // 이빨 골 3개(R3 A3 '해골인지 콘센트인지' — 하악 단서로 확정)
                fill(ctx, 'rgba(8,10,24,.28)', () => ctx.rect(x + w * (0.5 + dx - 0.030), y + w * 0.815, w * 0.060, w * 0.13)));
            fill(ctx, 'rgba(8,10,24,.34)', () => ctx.rect(x + w * 0.22, y + w * 0.94, w * 0.56, h * 0.09));                  // RIP 줄 각인
            fill(ctx, 'rgba(8,10,24,.26)', () => ctx.rect(x + w * 0.30, y + w * 0.94 + h * 0.16, w * 0.40, h * 0.07));
            fill(ctx, 'rgba(255,255,255,.05)', () => ctx.rect(x + w * 0.10, y + w * 0.30, w * 0.09, h * 0.50));             // 왼쪽 세로 하이라이트
            ctx.restore();
        };
        /* R8-2 2인 공통 '3기가 나란히 전부 드러나 반복적': 기울기를 서로 다르게 주고, 하나는
           크게 키워 카드 하단에 잘리게 해 깊이를 만든다(원본도 절반만 보인다). */
        stone(W * 0.475, H * 0.72, H * 0.15, H * 0.30, true, -0.075);              // 셋째(작게, 각진 어깨) — 바닥 허전함 보완(비평가 4차)
        stone(W * 0.575, H * 0.66, H * 0.20, H * 0.40, false, 0.055);
        stone(W * 0.690, H * 0.50, H * 0.30, H * 0.58, true, -0.030);              // 큰 것은 각짐/둥긂을 섞어 리듬(비평가 5차) · 3차 교집합 ⓔ: [열기]에 잘리던 자리에서 ~10px 왼쪽으로
        /* 근흑 전경 띠 — 원본은 카드 **맨 아래 한 줄**이 통째로 검다(묘비 밑동도 여기 잠긴다).
           이게 없으면 묘비가 바닥 없이 떠 보이고 하단 밴드가 원본보다 25 밝다(R8 값게이트). */
        fill(ctx, '#05070f', () => { ctx.moveTo(0, H * 0.945); ctx.quadraticCurveTo(W * 0.5, H * 0.925, W, H * 0.95); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        for (let i = 0; i < 18; i++) {                                     // 앞 언덕 풀 실루엣 — 지면이 무지 단색으로 끊기지 않게
            const x = W * (0.02 + R() * 0.92), y = H * (0.90 + R() * 0.05), h = H * (0.035 + R() * 0.035);
            fill(ctx, '#060913', () => { const w2 = H * (0.020 + R() * 0.020); ctx.moveTo(x, y); ctx.lineTo(x + w2 / 2, y - h); ctx.lineTo(x + w2, y); });
        }
        // 좌측 고목 — 원본은 **잎 달린** 큰 나무다(마른 가지가 아니라). 줄기 갈색 + 아주 어두운 잎 덩어리.
        (() => {
            const x = W * 0.115, top = H * 0.10, t = H * 0.055;
            /* 줄기 언더레이(R2 공통 '전경 키라인 비일관'): 같은 경로를 어둡게 한 번 더 굵게 깔아
               스트로크 소품에도 키라인을 세운다. */
            const trunkStroke = (lw, c) => {
                ctx.strokeStyle = c; ctx.lineCap = 'round';
                ctx.lineWidth = lw;
                ctx.beginPath(); ctx.moveTo(x + H * 0.03, H * 0.96); ctx.quadraticCurveTo(x - H * 0.04, H * 0.55, x, top + H * 0.16); ctx.stroke();
                ctx.lineWidth = lw * 0.55;
                ctx.beginPath(); ctx.moveTo(x - H * 0.01, H * 0.42); ctx.quadraticCurveTo(x + H * 0.16, H * 0.34, x + H * 0.24, H * 0.24); ctx.stroke();
                ctx.lineCap = 'butt';
            };
            trunkStroke(t + H * 0.036, '#070410'); trunkStroke(t, '#1d150e');   // R5 A '주간용 나무' — 밤 실루엣 쪽으로 침강(7차 '너무 검으면 마른 줄기' 함정: 초록 색상군은 유지)
            /* ⚠️ 잎을 너무 검게(#101f16) 깔면 남색 하늘과 명도차가 없어 '잎 없는 마른 줄기'로
               읽힌다(비평가 7차) — 한 단 밝은 초록으로 캐노피 덩어리를 세운다. 좌반부 평균 휘도
               하한(26)은 밝아지는 쪽이라 안전하다. */
            const blobs = [];
            for (let i = 0; i < 14; i++)                                   // 잎 덩어리 · R9 2인 공통 '잎 없는 마른 나무로 읽힌다': 9→14 + 아래로 확장해 캐노피 덩어리를 키운다
                /* 병합 절충(두 스트림 비평가가 정반대 지적): 병렬 R '하늘과 값이 붙어 실루엣 소실 — 밝게'
                   vs 이쪽 R5 A '주간용 나무 — 어둡게'. A 의 실인은 갈색 줄기였고(근흑으로 침강 완료),
                   실루엣 소실은 실측 함정(7차)이라 캐노피는 병렬 값에서 반 스텝만 내려 절충. */
                blobs.push([x + H * (-0.26 + R() * 0.58), H * (-0.10 + R() * 0.48), H * (0.12 + R() * 0.085), i % 2 ? '#1b3a24' : '#20452c']);
            ctx.strokeStyle = '#04080e'; ctx.lineWidth = H * 0.036;        // 합집합 키라인(채움이 안쪽 획을 덮는다 — 덤불 화법)
            blobs.forEach(([lx, ly, r]) => { ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.stroke(); });
            blobs.forEach(([lx, ly, r, c]) => fill(ctx, c, () => ctx.arc(lx, ly, r, 0, Math.PI * 2)));
            for (let i = 0; i < 5; i++) {                                  // 달빛 림 혹
                const lx = x + H * (-0.16 + R() * 0.40), ly = H * (-0.05 + R() * 0.20), r = H * (0.038 + R() * 0.028);
                fill(ctx, '#356343', () => ctx.arc(lx, ly, r, 0, Math.PI * 2));   // 달빛 림(절충값)
            }
        })();
        /* 우측 가장자리 낮은 나무(잔여 결함 ⓒ — 좌측 큰 나무만 있어 좌우 비대칭): 우측 28%는
           UI 열([열기]·열쇠 필)이라 **낮게**(꼭대기 0.50H 아래) 묘비 뒤 언덕 위에 세운다.
           좌반부 휘도(title-ink 하한 26)와 무관한 우측이라 어두워도 안전하다. */
        (() => {
            const x = W * 0.935, t = H * 0.038;
            const trunkStroke = (lw, c) => {
                ctx.strokeStyle = c; ctx.lineCap = 'round';
                ctx.lineWidth = lw;
                ctx.beginPath(); ctx.moveTo(x + H * 0.02, H * 0.92); ctx.quadraticCurveTo(x - H * 0.03, H * 0.74, x - H * 0.01, H * 0.585); ctx.stroke();
                ctx.lineWidth = lw * 0.5;
                ctx.beginPath(); ctx.moveTo(x - H * 0.005, H * 0.70); ctx.quadraticCurveTo(x - H * 0.10, H * 0.645, x - H * 0.145, H * 0.585); ctx.stroke();
                ctx.lineCap = 'butt';
            };
            trunkStroke(t + H * 0.030, '#0a0614'); trunkStroke(t, '#241a12');   // 키라인 언더레이(R2 공통)
            const blobs = [];
            for (let i = 0; i < 5; i++)                                    // 작은 캐노피(좌측 나무와 같은 어두운 초록 계열)
                blobs.push([x + H * (-0.16 + R() * 0.24), H * (0.525 + R() * 0.07), H * (0.05 + R() * 0.032), i % 2 ? '#141f2c' : '#1a2838']);
            ctx.strokeStyle = '#04080e'; ctx.lineWidth = H * 0.032;
            blobs.forEach(([lx, ly, r]) => { ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.stroke(); });
            blobs.forEach(([lx, ly, r, c]) => fill(ctx, c, () => ctx.arc(lx, ly, r, 0, Math.PI * 2)));
            fill(ctx, '#2c3d55', () => ctx.arc(x - H * 0.03, H * 0.525, H * 0.028, 0, Math.PI * 2));   // 달빛 림 혹 하나
        })();
        // 모서리 덤불 — 우하단(묘비 앞)·좌하단. 원본 네 모서리의 어두운 초록 덩어리.
        const dbush = (bx, by, s) => {
            ctx.beginPath();
            ctx.arc(bx - H * 0.10 * s, by, H * 0.10 * s, 0, Math.PI * 2);
            ctx.arc(bx + H * 0.02 * s, by - H * 0.06 * s, H * 0.12 * s, 0, Math.PI * 2);
            ctx.arc(bx + H * 0.14 * s, by, H * 0.10 * s, 0, Math.PI * 2);
            ctx.fillStyle = '#0e1826'; ctx.fill();   // R8-2 A11: 초록 채도를 걷고 밤(남청) 계열로 — 이 두 덩어리만 1행 팔레트처럼 튀었다
            ctx.save();                                                    // 달빛 셀 라이트 한 단(R3 B ⓓ) — 윗변만 밝혀 덩어리의 위아래를 가른다
            ctx.beginPath();
            ctx.arc(bx - H * 0.10 * s, by, H * 0.10 * s, 0, Math.PI * 2);
            ctx.arc(bx + H * 0.02 * s, by - H * 0.06 * s, H * 0.12 * s, 0, Math.PI * 2);
            ctx.arc(bx + H * 0.14 * s, by, H * 0.10 * s, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = 'rgba(120,140,190,.16)';
            ctx.fillRect(bx - H * 0.24 * s, by - H * 0.20 * s, H * 0.48 * s, H * 0.115 * s);
            ctx.restore();
        };
        dbush(W * 0.03, H * 1.00, 1.1); dbush(W * 0.97, H * 1.02, 1.3);
    };

    /* ⚔ 침략 — 원본(3행 확대 실측 2026-08-19): 명도 3단의 **개별 인물 군중**이다. 뒤=연갈 띠 위로
       투구 혹 텍스처, 중간=중갈색 머리(둥근/뾰족 투구 섞임)+어깨, 앞=암갈 대형 실루엣이 서로
       간격을 두고 갈린다. 깃발은 삼각 페넌트가 아니라 **너덜너덜한 대형 배너**가 기운 장대에
       달려 하늘을 가른다. 비평가 A('사람 없는 목책')·B('톱니 산맥 텍스처') 공통 지적이
       '개별 인물이 안 읽힌다'였다 — 톱니 폴리곤 열을 버리고 인물 단위로 다시 그린다. */
    G.draw.dg_invasion = function (ctx, S) {
        const W = S * AR, H = S, R = rnd(37);
        /* R4 비평가 B [치명] '밝은 피치 하늘(원본 실측 255,214,180) vs 새까만 군중의 고대비 붕괴' +
           A '탁한 갈보라 침전': 하늘을 밝은 피치로 올린다. 군중 명도는 아래서 함께 내린다. */
        sky(ctx, W, H, '#ffeed2', '#f2a869');
        const cloud = (cx, cy, cw, chh, c) => fill(ctx, c, () => ctx.ellipse(cx, cy, cw, chh, 0, 0, Math.PI * 2));
        /* R8-2 2인 공통 '상단 하늘이 비었다': 원본은 크림 스트리크가 몇 줄 흐른다. 납작하고
           길게(가로 렌즈형) + 한 단 밝게 — 뭉게 형태는 1행 낮 하늘 어휘라 여기선 금지. */
        cloud(W * 0.20, H * 0.115, W * 0.20, H * 0.030, '#fffaf0');
        cloud(W * 0.53, H * 0.075, W * 0.17, H * 0.026, '#fff6e6');
        cloud(W * 0.78, H * 0.155, W * 0.15, H * 0.024, '#fffaf0');
        cloud(W * 0.36, H * 0.185, W * 0.14, H * 0.020, '#fff6e6');
        cloud(W * 0.66, H * 0.225, W * 0.12, H * 0.018, '#fff2dd');
        fill(ctx, 'rgba(255,244,220,.45)', () => ctx.ellipse(W * 0.36, H * 0.20, W * 0.16, H * 0.016, 0, 0, Math.PI * 2));   // 얇은 구름 결 — 노을 깊이(비평가 7차)
        fill(ctx, 'rgba(255,238,206,.35)', () => ctx.ellipse(W * 0.62, H * 0.30, W * 0.13, H * 0.013, 0, 0, Math.PI * 2));
        (() => {                                                          // 중단 장밋빛 띠 — 노을 다단 전환(비평가 재채점 '2단 그라디언트 납작')
            const hz = ctx.createLinearGradient(0, H * 0.12, 0, H * 0.50);
            hz.addColorStop(0, 'rgba(244,146,100,0)'); hz.addColorStop(1, 'rgba(244,146,100,.24)');   // R4: .38→.24 — 하늘 명도를 잡아먹지 않게(고대비 복원과 한 벌)
            ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
        })();
        /* 우상단 성곽 실루엣 — 원본은 우측 모서리에 성벽/망루가 걸쳐 '포위된 도시' 서사를 세운다
           (비평가 7차 — 빈 하늘이면 구도가 허전하다). 군중·깃발 뒤, 하늘 앞. */
        (() => {
            const c = '#b3916a';   // R6 A '세피아 이탈 순회색' — 황갈 웜톤으로
            fill(ctx, c, () => {
                ctx.moveTo(W * 0.74, H * 0.42); ctx.lineTo(W * 0.74, H * 0.24); ctx.lineTo(W * 0.78, H * 0.24);
                ctx.lineTo(W * 0.78, H * 0.16); ctx.lineTo(W * 0.815, H * 0.16); ctx.lineTo(W * 0.815, H * 0.24);
                ctx.lineTo(W * 0.86, H * 0.24); ctx.lineTo(W * 0.86, H * 0.10); ctx.lineTo(W * 0.90, H * 0.10);
                ctx.lineTo(W * 0.90, H * 0.24); ctx.lineTo(W * 0.95, H * 0.24); ctx.lineTo(W * 0.95, H * 0.18);
                ctx.lineTo(W * 1.01, H * 0.18); ctx.lineTo(W * 1.01, H * 0.42); ctx.closePath();
            });
            for (let i = 0; i < 5; i++)                                     // 총안(어두운 창)
                fill(ctx, 'rgba(70,50,38,.55)', () => ctx.rect(W * (0.765 + i * 0.05), H * 0.29, W * 0.013, H * 0.07));
        })();
        /* 뒤 열 — 연갈 띠, 위 가장자리가 투구 혹(반원 연쇄). ⚠️ 0.48H 에서 시작하면 하늘이 행의
           절반을 먹어 '인파의 바다'(원본)가 얇은 띠로 죽는다(비평가 6차) — 0.40H 까지 올린다. */
        (() => {
            ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.35);
            let x = 0;
            /* R5 A '균일 반원 = 팝콘 텍스처': 반경·간격 지터 확대 + 서너 개마다 뾰족 투구 혹을 섞는다 */
            while (x < W) {
                const r = H * (0.034 + R() * 0.044), cy = H * (0.343 + R() * 0.022);
                if (R() < 0.22) { ctx.lineTo(x, cy + r * 0.2); ctx.lineTo(x + r, cy - r * 1.05); ctx.lineTo(x + r * 2, cy + r * 0.2); }
                else ctx.arc(x + r, cy, r, Math.PI, 0);
                x += r * (1.5 + R() * 1.1);
            }
            ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = '#8a7264'; ctx.fill();   // R8 값게이트: 원경 띠도 원본 밴드(102)에 맞춰 침강
            /* 원경 창끝 시그니처(R2 A2 '원경 군중 = 자갈밭/거품' — 머리 혹만으론 사람 판정이
               안 선다): 띠 위로 솟는 가는 창 8자루. 띠보다 한 단 어두운 톤이라 원경 층은 유지. */
            for (let i = 0; i < 8; i++) {
                const px = W * (0.05 + i * 0.118 + R() * 0.04), top = H * (0.285 + R() * 0.05);
                fill(ctx, '#87705f', () => ctx.rect(px, top, H * 0.009, H * 0.115));
                fill(ctx, '#87705f', () => { ctx.moveTo(px - H * 0.006, top); ctx.lineTo(px + H * 0.004, top - H * 0.024); ctx.lineTo(px + H * 0.014, top); ctx.closePath(); });
            }
        })();
        /* 인물 한 명 — 머리(kind 0=둥근 투구 1=뾰족 투구 2=뿔 투구) + 어깨. oc 를 주면 검정
           키라인을 두른다(앞 열 — 윤곽 없는 균일 반원 반복은 '스캘럽 무늬'로 읽힌다, 비평가 6차).
           ⚠️ 어깨를 좁고 높은 아치로 세우면 'A자 천막' 열이 된다(1차 시안) — 어깨는 넓고 낮게,
           뾰족 투구도 낮게. 몸이 옆 사람과 절반쯤 겹쳐야 '무리'가 되고, 머리 혹만 갈리면 된다. */
        /* 머리 6종(잔여 결함 ⓐ — 원형+삼각 2종 반복은 '볼링공 패턴'으로 읽힌다, 8차 지적):
           0=둥근 투구 1=뾰족 투구 2=뿔 투구 3=후드(꼭지가 한쪽으로 처짐) 4=볏(지느러미) 투구
           5=챙 있는 사다리꼴 투구. 3~5 는 실루엣 단계에서도 윤곽이 갈리게 비대칭/부속을 준다. */
        const figure = (x, y, s, c, kind, oc, wf, ow) => {
            const r = H * 0.055 * s, w = wf || 1.9;
            const paths = [];
            /* R3 B ⓓ '자갈밭 — pickKind 6종이 실루엣 단계에서 안 갈린다': 부속(꼭지·챙·볏·뿔)을
               키워 흑색 실루엣만으로 종이 갈리게 한다. ⚠️ 뿔은 4차 '고양이 귀' 함정 — 길이만 늘이고
               빈도(8%)는 유지. */
            if (kind === 1) {
                paths.push(() => { ctx.moveTo(x - r, y + r * 0.5); ctx.lineTo(x, y - r * 1.18); ctx.lineTo(x + r, y + r * 0.5); ctx.closePath(); });
                paths.push(() => ctx.rect(x - r * 1.10, y + r * 0.30, r * 2.20, r * 0.30));   // R9-2 D2 '순수 삼각형 = 고깔 천막': 챙을 달아 '투구'로 확정한다
            }   // R9 D '정체불명 삼각형': 전경 배율에서 꼭짓점이 너무 높아 고깔 천막으로 읽혔다 — 한 단 낮춤
            else if (kind === 3) paths.push(() => {                        // 후드 — 정수리가 뒤로 흘러 처진 두건(꼭지를 길게)
                ctx.moveTo(x - r, y + r * 0.6);
                ctx.quadraticCurveTo(x - r * 0.95, y - r * 0.85, x + r * 0.10, y - r * 1.02);
                ctx.quadraticCurveTo(x + r * 1.05, y - r * 1.22, x + r * 1.58, y - r * 0.50);   // 처진 꼭지(더 길게 늘어뜨림)
                ctx.quadraticCurveTo(x + r * 1.08, y - r * 0.30, x + r * 0.96, y + r * 0.25);
                ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.6, x + r * 0.7, y + r * 0.6);
                ctx.closePath();
            });
            else if (kind === 5) {                                         // 챙 투구 — 사다리꼴 + 넓은 챙(챙을 더 넓고 두껍게)
                paths.push(() => { ctx.moveTo(x - r * 0.78, y + r * 0.35); ctx.lineTo(x - r * 0.58, y - r * 0.88); ctx.lineTo(x + r * 0.58, y - r * 0.88); ctx.lineTo(x + r * 0.78, y + r * 0.35); ctx.closePath(); });
                paths.push(() => ctx.rect(x - r * 1.40, y + r * 0.18, r * 2.80, r * 0.38));
            }
            else paths.push(() => ctx.arc(x, y, r, 0, Math.PI * 2));       // 0·2·4 는 둥근 기본머리
            if (kind === 2) {                                              // 양쪽 뿔 — R9: 밑동이 두툼하고 바깥으로 **휜** 뿔(원본 실측). 가늘고 곧은 삼각 뿔이 4차 '고양이 귀' 오독의 원인이었다
                [-1, 1].forEach(sgn => paths.push(() => {
                    ctx.moveTo(x + sgn * r * 0.30, y - r * 0.62);
                    ctx.quadraticCurveTo(x + sgn * r * 1.35, y - r * 0.95, x + sgn * r * 1.50, y - r * 1.62);
                    ctx.quadraticCurveTo(x + sgn * r * 1.02, y - r * 1.02, x + sgn * r * 0.34, y - r * 0.90);
                    ctx.closePath();
                }));
            }
            if (kind === 8)                                                // R9 2인 공통 '어깨 위로 삐죽 나온 날붙이' — 무장 단서를 실루엣에 직접 얹는다
                paths.push(() => {
                    ctx.moveTo(x + r * 0.95, y + r * 1.20); ctx.lineTo(x + r * 1.22, y - r * 1.70);
                    ctx.lineTo(x + r * 1.62, y - r * 0.95); ctx.lineTo(x + r * 1.42, y + r * 1.20); ctx.closePath();
                });
            if (kind === 4)                                                // 볏 — 정수리 지느러미 한 장(키를 올려 실루엣 분화)
                paths.push(() => { ctx.moveTo(x - r * 0.58, y - r * 0.72); ctx.quadraticCurveTo(x + r * 0.05, y - r * 2.15, x + r * 0.62, y - r * 0.72); ctx.closePath(); });
            if (kind === 7)                                                // R8-2: 어깨 옆 둥근 방패 — 투구 일변도의 어휘를 깬다(A6 '실루엣 어휘 혼합')
                paths.push(() => ctx.arc(x + r * 1.30, y + r * 1.35, r * 0.86, 0, Math.PI * 2));
            if (kind === 6)                                                // R4: 둥근 투구 돔 + 넓은 챙 — 전경 '삼각 융기=산맥' 오독(2인 공통) 해소용 기본 종
                paths.push(() => ctx.rect(x - r * 1.02, y + r * 0.26, r * 2.04, r * 0.32));
            paths.push(() => {                                             // 어깨(넓고 낮게) + 목 노치
                ctx.moveTo(x - r * w, y + r * 3.2);
                ctx.lineTo(x - r * (w - 0.06), y + r * 1.50);              // 어깨 바깥 — 거의 수직(아래로만 벌어지면 하단에서 조각난다)
                ctx.quadraticCurveTo(x - r * (w - 0.35), y + r * 1.04, x - r * 1.05, y + r * 1.00);   // 어깨 마루(넓고 둥글게)
                ctx.quadraticCurveTo(x - r * 0.54, y + r * 0.96, x - r * 0.46, y + r * 0.60);         // 목 좌 — 둥근 오목(각진 계단은 '탁자'로 읽힌다)
                ctx.lineTo(x + r * 0.46, y + r * 0.60);                    // 목 우
                ctx.quadraticCurveTo(x + r * 0.54, y + r * 0.96, x + r * 1.05, y + r * 1.00);
                ctx.quadraticCurveTo(x + r * (w - 0.35), y + r * 1.04, x + r * (w - 0.06), y + r * 1.50);
                ctx.lineTo(x + r * w, y + r * 3.2);
                ctx.closePath();
            });
            if (oc) {
                ctx.strokeStyle = oc; ctx.lineWidth = ow || H * 0.016; ctx.lineJoin = 'round';
                paths.forEach(p => { ctx.beginPath(); p(); ctx.stroke(); });
            }
            paths.forEach(p => fill(ctx, c, p));
        };
        for (let i = 0; i < 10; i++)                                       // 원경-중경 사이 반층 — 레이어 한 겹 더(비평가 5차)
            figure(W * (i / 10 + 0.015 + R() * 0.03), H * (0.415 + R() * 0.04), 0.85 + R() * 0.35, '#6c5454', [0, 1, 1, 4, 5, 0][(R() * 6) | 0]);   // R7 2인 공통 '균일 돔 반복': 원경 반층에도 투구 변주
        /* 중간 열 — 뒤(#cdb094)와 앞(#241612) 사이의 **명도 중간층**이라 밝은 모브 계열이어야
           대기원근 3단이 선다(비평가 4차 '단일 톤 플랫 매스'). 뿔 투구는 1/8 로 드물게. */
        /* 중경을 명도 2단으로 분리(2차 재채점 2인 공통 '동일 명도 블롭 뭉개짐'):
           위 밴드(원경 쪽)는 +10% 밝은 색군, 아래 밴드는 기존 색군 — 겹침은 유지. */
        /* R4 비평가 2인 공통 '중경이 밝은 황갈 덩어리로 떠 보임(원본은 짙은 회흑)': 두 밴드를
           나란히 한 단 어둡게 — 밝은 하늘과의 대비로 '검은 군중의 바다'를 세운다. 2단 간격은 유지. */
        const MIDC_HI = ['#3c3030', '#3c3030', '#3c3030', '#3c3030'];   // R9-2 층 분리 실측: 원본 중경은 **한 색이 41%** 인 평평한 매스다(클론은 4색+톤 윤곽으로 쪼개져 14%/10%/10% — 이게 '안개처럼 겹친다'의 정체)   // R8 값게이트: 원본 중경 실측 #403030(L52) 대역
        const MIDC = ['#3c3030', '#3c3030', '#3c3030', '#3c3030'];      // 위 밴드와 같은 색 — 원본처럼 중경 전체가 한 덩어리 평면이어야 실루엣이 일한다      // R8-2: 중경은 원본 실측 #403030(L52) 자리로 되돌리고 근흑은 근경 전용으로 — 두 층이 같은 값이면 사다리가 없다      // R8 값게이트: 원본 전경 실측 #201010(L21) 직전 단         // 색·키·크기를 함께 흔들어 타일링 패턴을 깬다
        const pickKind = k =>                                              // 6종 혼합(ⓐ) — 뾰족·뿔은 드물게(9차 '삼각형 정체불명')
            k < 0.24 ? 0 : k < 0.36 ? 1 : k < 0.54 ? 3 : k < 0.74 ? 4 : k < 0.86 ? 5 : k < 0.94 ? 7 : 2;   // R6 A '중경 사각 블록': 챙(5) 빈도 축소
        /* R1 비평가 2인 공통 '중경 군중 뭉개짐/외곽선 부재': 아래 밴드에 어두운 갈색 얇은 윤곽을
           둘러 인물 한 명 한 명이 분절되게 한다(검정이면 전경 열과 층이 안 갈리므로 톤 윤곽).
           밀도도 한 단 올린다(성겨서 '대군'의 압박감이 약하다는 공통 지적). */
        for (let i = 0; i < 10; i++)                                       // 위 밴드(밝게)
            figure(W * (i / 10 - 0.004 + R() * 0.055), H * (0.462 + R() * 0.062), 0.82 + R() * 1.05, MIDC_HI[(R() * 4) | 0], pickKind(R()));
        for (let i = 0; i < 13; i++)                                       // 아래 밴드(기존 명도 + 톤 윤곽)
            figure(W * (i / 13 - 0.004 + R() * 0.050), H * (0.498 + R() * 0.068), 0.90 + R() * 1.10, MIDC[(R() * 4) | 0], pickKind(R()));   // R9-2: 인물별 톤 윤곽 삭제 — 근흑 매스 위 밝은 윤곽은 '붙여넣은 스티커'로 읽힌다(R8 A1). 개체 분리는 **위 윤곽선(투구 실루엣)** 이 맡는 게 원본 방식이다   // 근흑 채움 위 어두운 윤곽은 안 보인다 — 윤곽을 채움보다 **밝게** 뒤집어 분절을 살린다
        // 창 — 군중 사이에서 올라오는 자루+창끝
        for (let i = 0; i < 6; i++) {
            const x = W * (0.06 + i * 0.17 + R() * 0.05), top = H * (0.18 + R() * 0.14);
            fill(ctx, '#3a251d', () => ctx.rect(x, top, H * 0.014, H * 0.55));
            fill(ctx, '#3a251d', () => { ctx.moveTo(x - H * 0.020, top); ctx.lineTo(x + H * 0.007, top - H * 0.075); ctx.lineTo(x + H * 0.034, top); });
        }
        /* 대형 배너 — 기운 장대 + 자락. ⚠️ 폭 0.5H + 깊은 찢김 노치로 다섯 장을 깔면 하늘이
           '검은 덩어리 천지'가 된다(1차 시안) — 폭을 줄이고 찢김은 얕게, 넉 장만. */
        const banner = (x, top, wd, ht, tilt, c) => {
            ctx.save(); ctx.translate(x, top); ctx.rotate(tilt);
            fill(ctx, c, () => ctx.rect(-H * 0.023, 0, H * 0.046, H * 1.05));
            const cloth = () => {                   // 천에는 곡률(펄럭임) — 직선 삼각형이면 정적으로 죽는다(비평가 재채점)
                ctx.moveTo(0, H * 0.02);
                ctx.quadraticCurveTo(wd * 0.50, -H * 0.015, wd, H * 0.09);
                ctx.quadraticCurveTo(wd * 0.85, ht * 0.26, wd * 0.92, ht * 0.44);
                ctx.quadraticCurveTo(wd * 0.98, ht * 0.58, wd, ht * 0.70);
                ctx.lineTo(wd * 0.62, ht * 0.86);   // 찢긴 자락(얕게)
                ctx.lineTo(wd * 0.68, ht * 0.64);
                ctx.quadraticCurveTo(wd * 0.32, ht * 0.80, 0, ht);
                ctx.closePath();
            };
            fill(ctx, c, cloth);
            ctx.save();                             // 천 주름 2톤 — 단색 실루엣이면 접힘이 없다(비평가 6차)
            ctx.beginPath(); cloth(); ctx.clip();
            ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(-wd, ht * 0.58, wd * 3, ht);
            ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(-wd, 0, wd * 3, ht * 0.16);
            ctx.restore();
            ctx.restore();
        };
        banner(W * 0.30, H * 0.095, H * 0.265, H * 0.285, -0.20, '#4a3527');  // R5 B '원본은 검정 깃발': 밝은 갈색 2장 근흑화(암적 악센트 2장은 3차 사양 유지)
        banner(W * 0.585, H * 0.048, H * 0.245, H * 0.265, -0.14, '#3e2b20');
        banner(W * 0.05, H * 0.038, H * 0.275, H * 0.31, 0.06, '#3a1712');   // R6 B(3연속) '원본은 검정 위주' — 암적 악센트도 근흑 쪽으로   /* 9차 '배너 복붙' — 색을 4종으로 갈랐다 · 3차 교집합 ⓔ: 1장은 암적 악센트(전장 서사 + 팔레트 포인트) */
        banner(W * 0.14, H * 0.008, H * 0.325, H * 0.335, 0.10, '#2e1c15');
        banner(W * 0.46, -H * 0.022, H * 0.31, H * 0.315, -0.08, '#241511');
        banner(W * 0.70, H * 0.028, H * 0.30, H * 0.315, 0.16, '#2f130c');  // 3차 교집합 ⓔ: 암적 두 번째(좌우로 벌려 반복감 방지)
        (() => {                                                           // 지면 먼지/헤이즈 — 하단이 딱딱하게 끊기지 않게(비평가 3차)
            const hz = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.82);
            hz.addColorStop(0, 'rgba(242,196,156,0)'); hz.addColorStop(1, 'rgba(242,196,156,.12)');   // R8 값게이트: .30 이면 근흑 군중이 0.6~0.8H 에서 통째로 들려 원본 암부(95%)가 안 나온다
            ctx.fillStyle = hz; ctx.fillRect(0, H * 0.38, W, H * 0.21);   // R8-2: 전경 머리(0.57H~)에 닿지 않게 0.59H 에서 끊는다
        })();
        fill(ctx, '#1e1614', () => ctx.rect(0, H * 0.845, W, H * 0.16));   // R8-2: 전경 인물을 원본 높이(머리 0.70H)로 올린 만큼 어깨 아래가 비어 하단 밴드가 원본보다 16~22 밝았다   // 앞 열 바탕 띠 — 이게 없으면 머리들이 '떠 있는 검은 공'이 된다(어깨가 크롭 아래라 몸이 안 이어진다)
        /* 앞 열(이번 런 A·B 공통 '전경 검은 덩어리 = 바위/가마니'): ⑴ 민머리(kind 0)를 금지하고
           투구 단서 있는 종(뾰족·뿔·볏·챙)만 뽑는다 — 사람 단서가 실루엣에 최소 1개씩 실린다.
           ⑵ 채움을 한 단 밝혀(#241612→#2b1a12 계열) 근흑 키라인(#050302)이 갈리게 한다 —
           종전엔 채움·키라인이 다 근흑이라 윤곽 정보가 0이었다. */
        for (let i = 0; i < 9; i++) {
            /* R4 비평가 2인 공통 '전경이 삼각형 산/바위로 읽힘': 사람 단서는 **둥근 투구 돔+챙**
               (kind 6)이 즉독이라 6을 주종(과반)으로, 뾰족·볏·챙은 악센트로만(민머리 0 금지 유지,
               병렬 R3 '뿔=고양이 귀' — 뿔 종(kind 2)도 제외 유지). */
            /* R9-2: 원본 근경은 **한 색이 58%**(#181818 L24)인 평평한 매스다 — 두 색을 섞으면 평면이 안 선다. */
            figure(W * (i / 9 + 0.012 + R() * 0.030), H * (0.700 + R() * 0.052), 2.18 + R() * 0.58, '#1e1614', [6, 2, 4, 6, 8, 6, 5, 1][(R() * 8) | 0], '#050302', 1.9 + R() * 0.8, H * 0.026);
        }
        /* 근경 주역 1기(R1 A·B 공통 '초점 부재' → R2 A2·B2 공통 '주역이 배경에 묻힘 + 이 행만
           무키라인'): 다른 행 주인공 문법으로 **승격** — 근흑 키라인 + 채움 명도 분리 + 노을
           림라이트 셀 한 단. 투구 챙·볏, 어깨 갑주 펄드런 혹 2개, 검 가드로 사람 단서를 명시.
           우측 28% UI 열은 피한다(≤0.66W). */
        (() => {
            /* R3 A3 '키라인이 안 보인다(근흑 채움 위 검정 키라인)': 채움을 한 단 밝혀 키라인이
               실제로 갈리게 한다. */
            const x0 = W * 0.335, FC = '#241b16';   // R9-2: 전경이 평면 근흑 매스가 되면서 종전 값이 갈색 얼룩으로 떨어졌다 — 매스에 붙인다(초점은 검·투구 볏 실루엣이 맡는다)   // R6 A '살구빛 마네킹' ↔ 병렬 R3 '키라인 가시화' 절충: 중간 명도
            const paths = [];
            paths.push(() => {                                                              // 몸통 — 펄드런 혹 2개 + 목 골
                ctx.moveTo(x0 - H * 0.205, H * 1.03);
                ctx.lineTo(x0 - H * 0.19, H * 0.86);
                ctx.quadraticCurveTo(x0 - H * 0.185, H * 0.775, x0 - H * 0.10, H * 0.775);
                ctx.quadraticCurveTo(x0 - H * 0.045, H * 0.775, x0 - H * 0.04, H * 0.815);
                ctx.lineTo(x0 + H * 0.04, H * 0.815);
                ctx.quadraticCurveTo(x0 + H * 0.05, H * 0.775, x0 + H * 0.105, H * 0.775);
                ctx.quadraticCurveTo(x0 + H * 0.19, H * 0.775, x0 + H * 0.195, H * 0.87);
                ctx.lineTo(x0 + H * 0.21, H * 1.03);
                ctx.closePath();
            });
            paths.push(() => ctx.arc(x0, H * 0.705, H * 0.082, 0, Math.PI * 2));            // 머리
            paths.push(() => {                                                              // 투구 돔 + 챙
                ctx.moveTo(x0 - H * 0.115, H * 0.705);
                ctx.quadraticCurveTo(x0 - H * 0.105, H * 0.585, x0, H * 0.578);
                ctx.quadraticCurveTo(x0 + H * 0.105, H * 0.585, x0 + H * 0.115, H * 0.705);
                ctx.lineTo(x0 + H * 0.135, H * 0.705); ctx.lineTo(x0 + H * 0.135, H * 0.737);
                ctx.lineTo(x0 - H * 0.135, H * 0.737); ctx.lineTo(x0 - H * 0.135, H * 0.705);
                ctx.closePath();
            });
            paths.push(() => {                                                              // 볏(정수리 지느러미)
                ctx.moveTo(x0 - H * 0.045, H * 0.588);
                ctx.quadraticCurveTo(x0 + H * 0.005, H * 0.455, x0 + H * 0.078, H * 0.588);
                ctx.closePath();
            });
            paths.push(() => {                                                              // 오른팔(검 쪽으로)
                ctx.moveTo(x0 + H * 0.10, H * 0.905);
                ctx.lineTo(x0 + H * 0.30, H * 0.640);
                ctx.lineTo(x0 + H * 0.385, H * 0.680);
                ctx.lineTo(x0 + H * 0.175, H * 0.960);
                ctx.closePath();
            });
            const sx = x0 + H * 0.345;
            paths.push(() => ctx.arc(sx, H * 0.660, H * 0.055, 0, Math.PI * 2));            // 주먹
            /* R3 A3·B3 공통 '뚱뚱한 단검/볼라드·테이퍼 없음': 직사각 칼몸을 버리고 가드에서
               칼끝까지 좁아지는 테이퍼 폴리곤 + 폼멜로 '검' 실루엣을 확정한다. */
            paths.push(() => {                                                              // 칼몸(테이퍼) + 칼끝
                ctx.moveTo(sx - H * 0.030, H * 0.598);
                ctx.lineTo(sx - H * 0.015, H * 0.300); ctx.lineTo(sx, H * 0.242);
                ctx.lineTo(sx + H * 0.015, H * 0.300); ctx.lineTo(sx + H * 0.030, H * 0.598);
                ctx.closePath();
            });
            paths.push(() => ctx.rect(sx - H * 0.078, H * 0.598, H * 0.156, H * 0.036));    // 가드(가로바 — '검' 판독의 핵심)
            paths.push(() => ctx.arc(sx, H * 0.740, H * 0.028, 0, Math.PI * 2));            // 폼멜(주먹 아래)
            ctx.lineJoin = 'round';
            paths.forEach(p => { ctx.beginPath(); p(); ctx.strokeStyle = '#000'; ctx.lineWidth = H * 0.028; ctx.stroke(); });   // 합집합 키라인
            paths.forEach(p => { ctx.beginPath(); p(); ctx.fillStyle = FC; ctx.fill(); });
            ctx.save();                                                                     // 노을 림라이트(셀 한 단 — 왼 가장자리)
            ctx.beginPath(); paths[0](); ctx.clip();
            ctx.fillStyle = 'rgba(244,146,100,.28)';
            ctx.fillRect(x0 - H * 0.20, H * 0.775, H * 0.045, H * 0.26);
            ctx.restore();
        })();
        /* 근경 무기 실루엣(3차 재채점 교집합 ⓔ): 앞 열 머리 위로 솟는 도끼·검·미늘창 3자루 —
           창 6자루는 중경 몫이라 가늘어서, 근경엔 '무장한 무리'를 세우는 굵은 실루엣이 없었다.
           우측 28%는 UI 열이라 피하고(≤0.66W), 앞 열보다 한 단 어두운 근흑으로 갈라 층을 만든다. */
        (() => {
            const c = '#140b07';
            const pole = (x, top, bot, w2) => fill(ctx, c, () => ctx.rect(x - w2 / 2, top, w2, bot - top));
            // 도끼(0.135W) — 자루 + 한쪽 초승달 날. ⚠️ 날 윗변을 자루 꼭대기에서 시작하면
            // '장대 깃발'로 읽힌다(1차 캡처 확인) — 자루 끝이 날 **위로** 삐져나오고, 날은
            // 등이 자루에 붙은 두툼한 초승달이어야 도끼가 된다.
            pole(W * 0.135, H * 0.520, H * 1.0, H * 0.030);
            fill(ctx, c, () => {
                ctx.moveTo(W * 0.135 + H * 0.010, H * 0.575);
                ctx.quadraticCurveTo(W * 0.135 + H * 0.215, H * 0.560, W * 0.135 + H * 0.175, H * 0.795);
                ctx.quadraticCurveTo(W * 0.135 + H * 0.085, H * 0.720, W * 0.135 + H * 0.010, H * 0.760);
                ctx.closePath();
            });
            /* (검은 뺐다 — R1 비평가 2인 공통 '중앙의 수직 단검/오벨리스크 판독 불가': 아래가
               군중에 가려 칼끝·가드가 안 보이면 검은 기둥일 뿐이다. 도끼·미늘창 두 자루면 충분.) */
            // 미늘창(0.63W) — 자루 + 창끝 + 옆갈고리
            pole(W * 0.63, H * 0.50, H * 1.0, H * 0.026);
            fill(ctx, c, () => { ctx.moveTo(W * 0.63 - H * 0.030, H * 0.52); ctx.lineTo(W * 0.63, H * 0.42); ctx.lineTo(W * 0.63 + H * 0.030, H * 0.52); ctx.closePath(); });
            fill(ctx, c, () => { ctx.moveTo(W * 0.63, H * 0.545); ctx.quadraticCurveTo(W * 0.63 - H * 0.085, H * 0.545, W * 0.63 - H * 0.075, H * 0.635); ctx.quadraticCurveTo(W * 0.63 - H * 0.035, H * 0.60, W * 0.63, H * 0.615); ctx.closePath(); });
            /* 이번 런 A·B 교집합 '전경 열이 바위 무더기': 열 자체의 투구 부속만으로는 1x 에서
               부족하다 — 전경 열 어깨 사이에서 솟는 **창 3자루**(자루+창끝)로 '무장 군중' 단서를
               실루엣 위에 직접 세운다. 장수(0.335W+검 0.435W)·도끼(0.135W)·미늘창(0.63W)과
               겹치지 않는 자리, 높이는 제각각. */
            [[0.055, 0.70], [0.245, 0.63], [0.525, 0.67]].forEach(([px, ptop]) => {
                pole(W * px, H * ptop, H * 1.0, H * 0.028);
                fill(ctx, c, () => { ctx.moveTo(W * px - H * 0.020, H * ptop); ctx.lineTo(W * px, H * (ptop - 0.055)); ctx.lineTo(W * px + H * 0.020, H * ptop); ctx.closePath(); });
            });
        })();
    };

    /* 🧟 좀비 러시 — 보라 하늘 + 고목 2그루 + 철망 울타리 + 드럼통 */
    G.draw.dg_zombie = function (ctx, S) {
        const W = S * AR, H = S, R = rnd(53);
        /* R10 실측 — 원본 4행 하늘은 **평평한 단색 #ccb1ff** 다. y0.04·0.10·0.16·0.22·0.30·0.46 어디를
           훑어도 최빈색이 같고 그 색이 창의 100% 를 차지한다(그라디언트 없음). R4 비평가가
           '실측 204,177,255' 로 적어 둔 값이 정확히 이것인데, 그 뒤 파스텔 그라디언트로 덮여
           상단이 원본보다 26 밝아져 있었다(값 게이트 1·2밴드가 +17.6/+19.6 로 한계 22 에 붙어 있던
           이유가 이거다). 평평한 단색으로 되돌린다 — R9 '층마다 한 색' 발견과 같은 처방이다. */
        sky(ctx, W, H, '#ccb1ff', '#ccb1ff');
        /* 🚨 R10 — 구름을 '가로 막대'로 그리는 화법을 **폐기**한다.
           9라운드 동안 캡슐→뭉게 혹→키라인 착탈로 *모양만* 바꿨는데 비평가는 매 라운드
           '스켈레톤 로딩 바 / 구슬 꿴 철사'로 읽었다. 이번엔 모양 대신 **자리와 명암**을 쟀고
           (`tools/probe-dg-sky.js`), 지적이 옳았다는 게 수치로 나왔다:
             · 하늘 상단 창(x0.33~0.52W · y0.06~0.30H)에서 원본은 **거의 비어 있다** —
               가로 경계 1.04/행 · 어두운 픽셀 6.3%. 클론은 같은 창의 **51.2%** 를 어두운 막대로
               덮었고 경계가 **12.93/행**(원본의 12배)이었다. '막대로 읽힌다'가 곧 실측이다.
             · 명암이 **반대**였다: 원본 구름은 하늘보다 **밝고**(+7~22L) 아래쪽(y0.29~0.41H)에
               눕는데, 클론 막대는 하늘보다 **어둡고**(-66L) 위쪽(y0.10~0.30H)에 있었다.
           → ⓐ 상단은 비운다 ⓑ 하늘보다 한 단 밝은 라벤더로 ⓒ 아래쪽에만 ⓓ 양끝이 한 점으로
             모이는 **결**(테이퍼)로. 키라인·혹·균일 두께는 전부 금지 — 그게 막대의 정체였다.
           ⚠️ 다음 세션 경고: 여기에 다시 '판독되게' 키라인이나 혹을 얹지 말 것. 그 두 처방이
             R4~R9 를 돈 자리이고, 원본에는 **둘 다 없다**(무외곽선 · 균일하지 않은 결). */
        const wisp = (wx, wy, ww, wh, c) => fill(ctx, c, () => {
            ctx.moveTo(wx, wy + wh * 0.55);                                  // 왼쪽 끝 — 한 점으로 모인다
            ctx.quadraticCurveTo(wx + ww * 0.28, wy - wh * 0.10, wx + ww * 0.60, wy + wh * 0.20);
            ctx.quadraticCurveTo(wx + ww * 0.86, wy + wh * 0.42, wx + ww, wy + wh * 0.50);   // 오른쪽 끝 — 한 점
            ctx.quadraticCurveTo(wx + ww * 0.78, wy + wh * 0.92, wx + ww * 0.44, wy + wh);
            ctx.quadraticCurveTo(wx + ww * 0.18, wy + wh * 1.04, wx, wy + wh * 0.55);
        });
        wisp(W * 0.130, H * 0.296, W * 0.225, H * 0.055, '#dcc6ff');   // 밝은 쪽 (+16L)
        wisp(W * 0.365, H * 0.350, W * 0.155, H * 0.042, '#d6bffd');   // 옅은 쪽 (+8L)
        wisp(W * 0.048, H * 0.392, W * 0.120, H * 0.032, '#d6bffd');
        /* 배경 능선 2겹(잔여 결함 ⓔ): 하늘→지면이 한 번에 끊겨 원경이 없었다(8차 '능선 3단 명도').
           멀수록 밝게(대기원근) — 뒤 #5f4585 → 앞 #533a74 → 기존 지면 #4a3563 으로 3단이 선다. */
        fill(ctx, '#a189c6', () => { ctx.moveTo(0, H * 0.66); ctx.quadraticCurveTo(W * 0.22, H * 0.575, W * 0.46, H * 0.645); ctx.quadraticCurveTo(W * 0.72, H * 0.71, W, H * 0.625); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        fill(ctx, '#8b71b2', () => { ctx.moveTo(0, H * 0.735); ctx.quadraticCurveTo(W * 0.30, H * 0.655, W * 0.58, H * 0.72); ctx.quadraticCurveTo(W * 0.82, H * 0.775, W, H * 0.705); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        ground(ctx, W, H, H * 0.76, '#4a3563');
        // 구불한 어두운 길 — 원본 앞바닥의 진한 띠
        fill(ctx, '#3a2a52', () => { ctx.moveTo(0, H * 0.84); ctx.quadraticCurveTo(W * 0.35, H * 0.76, W * 0.60, H * 0.84); ctx.quadraticCurveTo(W * 0.80, H * 0.90, W, H * 0.84); ctx.lineTo(W, H); ctx.lineTo(0, H); });
        ground(ctx, W, H, H * 0.92, '#33224a');
        const tree = (x, sc) => {
            /* R3 A·B 교집합 ⓑ(2연속 지적) '끝이 둥근 매끈 Y자 = 산호/사슴뿔': 라운드캡 스트로크
               화법 자체가 원인이다 — 가지를 **테이퍼 폴리곤**(밑동 폭 → 끝 한 점 뾰족)으로 다시
               그린다. 처진 잔가지 2개 + 밑동→끝 굵기 변화 + 꼭대기 스파이크로 '고목의 앙상함'을
               세우고, 키라인은 스트로크→채움 2패스 합집합(덤불 화법)으로 통일한다. */
            /* R5 A '중간 명도 보라 나무 — 원본은 거의 검은 자주 실루엣': 파스텔 하늘 전환(R4)으로
               상대 명도가 떠서 한 단 침강 */
            const c = '#2b1c3f', oc = '#080411', u = H * sc, B = H * 0.86;   // R8-2 2인 공통 '중간 보라라 배경에 묻힌다' — 지면보다 어둡게   // R7: 채움·키라인 명도 분리(둘 다 근흑이면 무선으로 읽힌다)
            const P = [];
            const tap = (x0, y0, cx2, cy2, x1, y1, w0) => {                // 테이퍼 가지: 양 변이 끝 한 점에서 만난다
                const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
                const nx = -dy / L * w0 / 2, ny = dx / L * w0 / 2;
                P.push(() => {
                    ctx.moveTo(x0 + nx, y0 + ny);
                    ctx.quadraticCurveTo(cx2 + nx * 0.45, cy2 + ny * 0.45, x1, y1);
                    ctx.quadraticCurveTo(cx2 - nx * 0.45, cy2 - ny * 0.45, x0 - nx, y0 - ny);
                    ctx.closePath();
                });
            };
            /* R8-2 2인 공통 '가는 막대 + 균일 두께 가지 = 파이프': 줄기를 굵히고 밑동에 뿌리
               플레어를 달고, 가지 밑동 폭도 함께 키운다(끝은 여전히 한 점 — 테이퍼 유지). */
            P.push(() => {                                                 // 뿌리 플레어(밑동이 좌우로 벌어진다)
                ctx.moveTo(x - u * 0.235, B + u * 0.02);
                ctx.quadraticCurveTo(x - u * 0.115, B - u * 0.075, x - u * 0.085, B - u * 0.20);
                ctx.lineTo(x + u * 0.085, B - u * 0.20);
                ctx.quadraticCurveTo(x + u * 0.115, B - u * 0.075, x + u * 0.235, B + u * 0.02);
                ctx.closePath();
            });
            /* R10 — **가지를 가늘게, 대신 더 많이.** 두 가지 근거가 같은 곳을 가리켰다:
               ⑴ 값 게이트에서 4~7밴드(y0.29~0.58H)가 원본보다 17~28 어두웠고, 그 구간의 암부
                  초과분(원본 16.6/19.1% vs 클론 22.8/28.6%)은 전부 굵은 가지 + 굵은 키라인이었다.
               ⑵ 같은 자리가 눈으로는 '뭉툭한 가시 덩어리(불가사리·박쥐)'로 읽혔다 — 원본 고목은
                  **가늘고 여러 갈래로 갈라진** 잔가지 다발이다.
               굵기를 0.62~0.70배로 내리고 키라인을 0.034→0.021 로 줄인 뒤, 남는 여백에 잔가지
               3본을 더 꽂았다(면적은 줄고 갈래 수는 늘어 '앙상함'이 산다). */
            tap(x, B, x - u * 0.05, B - u * 0.30, x + u * 0.025, B - u * 0.56, u * 0.150);            // 줄기(S자 뒤틀림·위로 갈수록 가늘게·꼭대기 뾰족)
            tap(x - u * 0.015, B - u * 0.30, x - u * 0.16, B - u * 0.34, x - u * 0.30, B - u * 0.50, u * 0.066);   // 왼 큰 가지
            tap(x + u * 0.015, B - u * 0.40, x + u * 0.13, B - u * 0.50, x + u * 0.27, B - u * 0.56, u * 0.060);   // 오른 큰 가지
            tap(x + u * 0.02, B - u * 0.18, x + u * 0.10, B - u * 0.22, x + u * 0.17, B - u * 0.30, u * 0.040);    // 아래 작은 가지
            tap(x - u * 0.005, B - u * 0.50, x - u * 0.06, B - u * 0.58, x - u * 0.09, B - u * 0.645, u * 0.022);  // 꼭대기 곁스파이크
            tap(x - u * 0.17, B - u * 0.40, x - u * 0.225, B - u * 0.36, x - u * 0.245, B - u * 0.275, u * 0.017); // 처진 잔가지(왼 가지 중간에서 아래로)
            tap(x + u * 0.16, B - u * 0.505, x + u * 0.21, B - u * 0.47, x + u * 0.23, B - u * 0.39, u * 0.016);   // 처진 잔가지(오른 가지 중간에서 아래로)
            tap(x - u * 0.20, B - u * 0.425, x - u * 0.30, B - u * 0.50, x - u * 0.40, B - u * 0.545, u * 0.017);  // 왼 가지에서 위로 갈라진 잔가지
            tap(x + u * 0.135, B - u * 0.455, x + u * 0.20, B - u * 0.585, x + u * 0.225, B - u * 0.680, u * 0.016); // 오른 가지에서 위로
            tap(x + u * 0.025, B - u * 0.545, x + u * 0.115, B - u * 0.585, x + u * 0.175, B - u * 0.660, u * 0.015); // 꼭대기 갈래
            ctx.lineJoin = 'round';
            P.forEach(p => { ctx.beginPath(); p(); ctx.strokeStyle = oc; ctx.lineWidth = H * 0.021; ctx.stroke(); });   // 합집합 키라인(R10 감량 — 위 주석 ⑴)
            P.forEach(p => { ctx.beginPath(); p(); ctx.fillStyle = c; ctx.fill(); });
            fill(ctx, oc, () => ctx.ellipse(x + u * 0.015, B - u * 0.26, u * 0.042, u * 0.062, 0.2, 0, Math.PI * 2));   // 옹이 — R9 D10: 1x 에서 보이게 확대
            ctx.save();                                                    // 셀 라이트 한 단(R3 B ⓓ '전경 소품 2톤') — 줄기 왼 가장자리
            ctx.beginPath(); P[0](); ctx.clip();
            ctx.strokeStyle = '#5a4038'; ctx.lineWidth = u * 0.046;   // R9 D10 '나무가 배경에 눌어붙는다': 빛면을 갈색 중간톤으로 + 두껍게
            ctx.beginPath(); ctx.moveTo(x - u * 0.038, B); ctx.quadraticCurveTo(x - u * 0.085, B - u * 0.30, x + u * 0.005, B - u * 0.54); ctx.stroke();
            ctx.restore();
        };
        // 오른쪽 고목은 x 0.70W 안쪽으로 — 0.86W 에 두면 가지가 열쇠 필과 [열기] 를 관통해
        // '검은 긁힘'으로 얹힌다(잔여 결함 ⓑ). 우측 28% 열은 UI 몫이라 키 큰 소품을 안 넣는다.
        // R4 비평가 A '우측 앵커 왜소': 0.85→1.15 로 키운다(x 0.64W — 가지 최대 도달 ≈0.73W 로 UI 열 직전).
        tree(W * 0.075, 1.00); tree(W * 0.64, 1.15);
        /* 해골+갈비뼈 그리기 — 원본 좌하단의 그 잔해. 흩어진 막대 뼈 셋보다 '좀비 던전'을 한눈에
           세운다. ⚠️ 호출은 철망 **뒤가 아니라 앞**(R1 B '해골이 철망 메쉬에 덮여 바래 사실상 안
           보인다') — 정의만 여기 두고 철망 다음에 부른다. */
        const drawRemains = () => {
            /* 🚨 R10 — **정면 두개골을 폐기하고 원본대로 '옆으로 누운 짐승 두개골'로** 다시 그린다.
               R9 잔여 ⓑ('좌하단 흰 덩어리가 자동차인지 뼈인지 판독 불가')의 정체를 원본 10배
               크롭으로 확정했다: 종전 조형이 **원 + 그 밑 사각 턱 + 세로 이빨 골** 이었는데,
               이 조합은 1x 에서 정확히 **차체 + 창문띠 + 라디에이터 그릴** 로 읽힌다 — 비평가가
               '자동차'라고 한 건 은유가 아니라 그 형태 그대로였다.
               원본은 전혀 다른 물건이다: **오른쪽을 향해 누운 긴 주둥이 짐승 두개골**(말/소 계열)
               + 위로 휜 뿔 하나 + **길쭉한 검은 눈구멍 하나**(정면 눈 두 개가 아니다) + 그 뒤로
               흩어진 **갈비 아치 4개**. 정면성을 버리는 게 핵심이다 — 좌우 대칭이 남아 있는 한
               사람 얼굴이나 차 앞모습으로 계속 읽힌다.
               ⚠️ 다음 세션: 여기에 정면 눈 2개·사각 턱·세로 이빨 골을 다시 넣지 말 것. */
            /* 크기·자리는 원본 10배 크롭 실측: 유해 전체가 가로 ≈0.167W · 세로 ≈0.31H 를 차지하고
               세로로 y0.66~0.97H 에 눕는다. 첫 시안은 그 2/3 크기라 '작은 새'로 읽혔다. */
            const sx = W * 0.108, sy = H * 0.822, r = H * 0.104;
            fill(ctx, 'rgba(15,10,28,.40)', () => ctx.ellipse(sx + r * 1.5, sy + r * 0.95, r * 3.0, r * 0.40, 0, 0, Math.PI * 2));   // 바닥 그림자 — 바닥에 놓인 소품(비평가 7차)
            /* 갈비 아치 — 두개골 **뒤(왼쪽)** 로 흩어진다. 원본도 두개골 왼쪽에 4개가 겹쳐 있다.
               키라인(근흑) → 뼈색 2패스로 늑골 사이 틈이 1x 에서 살아 있게 한다. */
            [[H * 0.034, '#150e26'], [H * 0.019, '#e8e2f2']].forEach(([lw, col]) => {
                ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
                [[-1.62, 0.86, -0.35], [-1.10, 0.95, -0.22], [-0.56, 0.90, -0.10], [-0.04, 0.74, 0.02]].forEach(([k, rad, tilt]) => {
                    ctx.beginPath();
                    ctx.ellipse(sx + r * k, sy + r * 0.30, r * rad, r * rad * 0.62, tilt, Math.PI * 0.92, Math.PI * 2.02);
                    ctx.stroke();
                });
                ctx.lineCap = 'butt';
            });
            /* 두개골 옆모습: 뒤통수(둥근 뒤) → 위로 휜 뿔 → 앞으로 뻗은 긴 주둥이 → 아래턱 선.
               한 폴리곤으로 이어 그려 '덩어리 하나'로 읽히게 한다(조각나면 다시 판독 불가). */
            /* ⚠️ 뒤통수를 완전한 원호로 두면 주둥이와 합쳐 '오리/새 머리'가 된다(2차 시안에서 실제로
               그렇게 읽혔다) — 뒤통수 위를 **각진 마루**로 꺾고 턱 뒤에 하악각을 만들어 짐승
               두개골의 쐐기 실루엣을 세운다. */
            const skullP = () => {
                ctx.moveTo(sx - r * 0.86, sy + r * 0.06);                                          // 뒤통수 아래(하악각)
                ctx.lineTo(sx - r * 0.92, sy - r * 0.44);                                          // 뒤통수 뒷변 — 직선으로 각지게
                ctx.lineTo(sx - r * 0.44, sy - r * 0.74);                                          // 두정 마루(꺾임)
                ctx.quadraticCurveTo(sx + r * 0.14, sy - r * 0.88, sx + r * 0.56, sy - r * 0.52);   // 이마 → 눈두덩
                ctx.quadraticCurveTo(sx + r * 1.34, sy - r * 0.44, sx + r * 2.34, sy - r * 0.10);   // 주둥이 윗선(길게)
                ctx.quadraticCurveTo(sx + r * 2.62, sy + r * 0.04, sx + r * 2.28, sy + r * 0.26);   // 콧등 끝(둥글게 마감)
                ctx.quadraticCurveTo(sx + r * 1.30, sy + r * 0.36, sx + r * 0.62, sy + r * 0.44);   // 주둥이 아랫선
                ctx.quadraticCurveTo(sx + r * 0.08, sy + r * 0.78, sx - r * 0.46, sy + r * 0.66);   // 턱 밑
                ctx.lineTo(sx - r * 0.86, sy + r * 0.06);
            };
            const hornP = () => {                                                                  // 위로 휜 뿔 하나(비대칭 — 옆모습의 증거)
                ctx.moveTo(sx - r * 0.40, sy - r * 0.70);
                ctx.quadraticCurveTo(sx - r * 0.72, sy - r * 1.62, sx + r * 0.16, sy - r * 2.02);
                ctx.quadraticCurveTo(sx - r * 0.20, sy - r * 1.42, sx + r * 0.06, sy - r * 0.60);
            };
            ctx.strokeStyle = '#150e26'; ctx.lineWidth = H * 0.032; ctx.lineJoin = 'round';
            [skullP, hornP].forEach(p => { ctx.beginPath(); p(); ctx.closePath(); ctx.stroke(); });
            fill(ctx, '#e8e2f2', skullP);
            fill(ctx, '#e8e2f2', hornP);
            ctx.lineJoin = 'miter';
            fill(ctx, '#2b1c3f', () => {                                                           // 눈구멍 — 길쭉한 하나(옆모습)
                ctx.ellipse(sx + r * 0.30, sy - r * 0.20, r * 0.40, r * 0.24, -0.16, 0, Math.PI * 2);
            });
            fill(ctx, '#2b1c3f', () => {                                                           // 콧구멍 — 주둥이 끝 작은 점
                ctx.ellipse(sx + r * 1.96, sy + r * 0.04, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
            });
            /* R10 — 화면 한복판 바닥(0.365W · 0.92H)에 떠 있던 **곁뼈 하나를 걷어냈다.** 원본의
               같은 자리는 아무것도 없는 평평한 어두운 바닥이고, 이 뼈는 유해(0.11W)와도 멀어
               주인 없는 조각으로 떠 보였다(R9 잔여 '떠 보이는 조각' 계열). 뼈는 유해 쪽에
               모여 있어야 '한 구의 잔해'로 읽힌다 — 여기 다시 흩뿌리지 말 것. */
        };
        /* 드럼통 — 원본은 **밴드가 층층인 원기둥**이다(파란 사각 블록이 아니라). 옆면을 살짝
           부풀리고 위 타원 + 곡률 따라 도는 어두운 밴드 + 세로 하이라이트 + 키라인.
           자리는 원본대로 **오른쪽 고목 앞**(≈0.68W) — 왼쪽에 두면 소품이 좌측에 몰려 원본의
           '중앙 캐릭터 + 좌우 소품' 프레이밍이 무너진다(비평가 재채점). 고목(0.66W)을 먼저
           그리므로 드럼통이 그 앞에 서고, [열기] 열(0.73W~)에 일부 덮이는 것도 원본과 같다. */
        (() => {
            const bx = W * 0.675, by = H * 0.60, bw = H * 0.16, bh = H * 0.28, ey = bh * 0.085;
            const body = () => {
                ctx.moveTo(bx, by);
                ctx.quadraticCurveTo(bx - bw * 0.055, by + bh * 0.5, bx, by + bh);
                ctx.quadraticCurveTo(bx + bw * 0.5, by + bh + ey * 1.6, bx + bw, by + bh);
                ctx.quadraticCurveTo(bx + bw * 1.055, by + bh * 0.5, bx + bw, by);
                ctx.closePath();
            };
            ctx.beginPath(); body(); ctx.fillStyle = '#4a5c8a'; ctx.fill();   /* 10차: 한 단 더 탈채도(2차 재채점 '유일한 한색') */
            ctx.save();
            ctx.beginPath(); body(); ctx.clip();
            [0.32, 0.66].forEach(k => {                                                           // 곡률 따라 도는 밴드
                ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh * k, bw * 0.56, ey, 0, 0, Math.PI);
                ctx.strokeStyle = '#2a4478'; ctx.lineWidth = bh * 0.09; ctx.stroke();
            });
            /* (세로 흰 하이라이트는 뺐다 — 이번 런 B '광택 렌더링이 플랫 실루엣 소품들과 재질
               문법이 따로 논다': 플랫 2톤(바탕+오른쪽 그늘 한 장)으로 강등) */
            fill(ctx, 'rgba(0,0,0,.22)', () => ctx.rect(bx + bw * 0.78, by, bw * 0.22, bh + ey * 2));       // 오른쪽 음영
            ctx.restore();
            fill(ctx, '#6479a6', () => ctx.ellipse(bx + bw / 2, by, bw / 2, ey, 0, 0, Math.PI * 2));        // 윗면
            ctx.beginPath(); ctx.ellipse(bx + bw / 2, by, bw / 2, ey, 0, 0, Math.PI * 2);
            ctx.strokeStyle = '#101528'; ctx.lineWidth = H * 0.018; ctx.stroke();
            ctx.beginPath(); body(); ctx.strokeStyle = '#101528'; ctx.lineWidth = H * 0.022; ctx.stroke();  // 키라인(R2 공통 — 전경 소품 굵기로 통일)
        })();
        /* 철망 울타리 — **오른쪽 끝으로 되돌린다(R10)**. 앞 라운드가 '[열기] 버튼에 잘려 조각난다'는
           이유로 왼쪽 끝(0~0.22W)으로 옮겼는데, 원본 확대(x0.80~1.0W 크롭)를 보면 **원본도 정확히
           그 자리에 있고 버튼 뒤로 물린다** — 잘리는 게 원본의 구도다. 왼쪽으로 옮긴 대가가 더
           컸다: ⑴ 원본 좌하단의 주인공 소품(짐승 두개골+갈비)을 격자가 덮어 '자동차'로 읽히는
           바탕이 됐고 ⑵ 원본에 없는 구조물이 좌측에 서서 좌우 무게가 뒤집혔다.
           → 원본대로 우측(0.875~1.0W · y0.36~0.78H)에 세우고, 버튼에 물리는 건 그대로 둔다.
           ⚠️ 다시 왼쪽으로 옮기지 말 것 — 원본 대조로 확정한 자리다. */
        const FX0 = W * 0.875, FX1 = W, FY0 = H * 0.36, FY1 = H * 0.78;
        ctx.save();
        ctx.beginPath(); ctx.rect(FX0, FY0, FX1 - FX0, FY1 - FY0); ctx.clip();
        ctx.strokeStyle = 'rgba(178,172,200,.42)'; ctx.lineWidth = H * 0.019;   // 메쉬를 굵고 진하게 — 얇으면 재질감이 죽는다(비평가 3차) · R1 B '철망이 주제부보다 도드라짐' — 구조(레일·포스트)는 진하게, 메쉬는 다시 낮춤
        for (let i = -6; i < 9; i++) {
            const ox = FX0 + i * H * 0.07;
            ctx.beginPath(); ctx.moveTo(ox, FY0); ctx.lineTo(ox + (FY1 - FY0), FY1); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox + (FY1 - FY0), FY0); ctx.lineTo(ox, FY1); ctx.stroke();
        }
        ctx.restore();
        /* 철망 마감(3차 재채점 교집합 ⓓ): 크로스해치가 프레임 없이 공중에서 끊겨 '깨진 무늬'로
           읽혔다 — 상·하단 가로 레일 + 포스트로 '울타리 구조물'을 세운다(자리만 우측으로 옮김). */
        ctx.save();
        ctx.strokeStyle = 'rgba(172,166,194,.72)'; ctx.lineWidth = H * 0.024;
        ctx.beginPath(); ctx.moveTo(FX0, FY0 + H * 0.005); ctx.lineTo(FX1, FY0 + H * 0.005); ctx.stroke();   // 상단 레일
        ctx.beginPath(); ctx.moveTo(FX0, FY1 - H * 0.02); ctx.lineTo(FX1, FY1 - H * 0.02); ctx.stroke();     // 하단 레일
        ctx.lineWidth = H * 0.028;
        ctx.beginPath(); ctx.moveTo(FX0 + W * 0.008, FY0); ctx.lineTo(FX0 + W * 0.008, FY1 - H * 0.01); ctx.stroke();   // 포스트(왼쪽 1본 — 오른쪽은 카드 밖)
        ctx.beginPath(); ctx.arc(FX0 + W * 0.008, FY0 - H * 0.005, H * 0.021, 0, Math.PI * 2);                          // 포스트 캡
        ctx.fillStyle = '#cfc9de'; ctx.fill();
        ctx.strokeStyle = '#1c1333'; ctx.lineWidth = H * 0.010; ctx.stroke();
        ctx.restore();
        drawRemains();                                                     // 해골+갈비는 철망 **앞**(R1 B — 메쉬 뒤에선 바래서 안 보였다)

        /* 지평선 좀비 떼(3차 재채점 교집합 ⓑ — 5~8기·간격/크기 변주·어두운 보라 톤): 종전 2구
           중 0.505W 쪽이 주인공(0.41~0.58W)에 가려 '1구'로 세어졌다 — 그 대역을 비우고 좌 4·우 2 로
           6기를 편성. 암록(#2c4a3c)은 주인공 초록과 색상군이 겹쳐 원근이 안 갈렸다 — 능선(#533a74)
           보다 어두운 보라 2톤으로 내려 '실루엣 떼'로 읽히게 한다. arm: 1=치켜든 팔, 0=없음(변주). */
        /* R8-2 2인 공통 '똑같은 둥근 덩어리 여섯이 등간격 = 묘비인지 덤불인지 판독 불가': 넷으로
           줄이고 배율 편차를 0.44~0.66 → 0.38~1.00 으로 벌린다(간격도 불규칙). 크기 차가 없으면
           같은 스탬프의 반복으로 읽히고, 그러면 개체가 아니라 무늬가 된다. */
        [[0.055, 0.612, 0.42, 1, 0], [0.145, 0.560, 1.00, 0, 1],
        [0.300, 0.598, 0.62, 1, 1], [0.632, 0.582, 0.38, 0, 0]].forEach(([zx, zy, zs, arm, tone]) => {
            const x = W * zx, y = H * zy, u = H * 0.10 * zs, c = tone ? '#3a2a5c' : '#31224e';
            fill(ctx, c, () => {                                           // 몸통+머리 한 덩어리 실루엣
                ctx.moveTo(x - u * 0.9, y + u * 2.6);
                ctx.lineTo(x - u * 0.8, y + u * 0.55); ctx.quadraticCurveTo(x - u * 0.75, y + u * 0.2, x - u * 0.45, y + u * 0.15);
                ctx.arc(x, y, u * 0.52, Math.PI, 0);                       // 머리
                ctx.quadraticCurveTo(x + u * 0.75, y + u * 0.25, x + u * 0.7, y + u * 0.6);
                ctx.lineTo(x + u * 0.85, y + u * 2.6); ctx.closePath();
            });
            if (arm) fill(ctx, c, () => { ctx.moveTo(x + u * 0.58, y + u * 0.58); ctx.lineTo(x + u * 1.38, y - u * 0.40); ctx.lineTo(x + u * 1.04, y - u * 0.66); ctx.lineTo(x + u * 0.36, y + u * 0.26); ctx.closePath(); });   // 치켜든 팔(원경 축소에서도 읽히게 두껍게)
        });
        /* 주인공 — 가운데 팔 든 좀비 (잔여 결함 ⓐ·ⓒ). 좀비 러시 카드에 좀비가 없어서
           유령 마을과 '밤/황무지' 테마가 겹쳐 읽혔다 — 초록 좀비 하나로 두 카드가 갈린다.
           ⚠️ 팔은 몸통 실루엣 **밖**으로 내야 팔로 읽힌다(안쪽에서 올리면 몸통에 통째로 가린다).
           ⚠️ 네모 머리 + 점 눈 둘이면 '초록 로봇'이다 — 눈두덩 그늘·드러난 이·썩은 얼룩이 있어야
           좀비가 된다. 좌표는 세로 1.0 정규계(x 0~3.45). */
        /* 팔-몸통 명도 분리(3차 재채점 교집합 ⓐ — '팔·어깨 경계 모호'): 위팔을 몸통(#41823f)보다
           한 단 어둡게 내려 실루엣이 겹쳐도 경계가 명도로 갈리게 한다. 아래팔은 밝게 유지(빛 방향). */
        /* (위팔 검정 띠·아래팔 흰 띠는 걷었다 — R2 A2 '팔·몸통의 면(facet) 그라데이션이 로우폴리
           문법이라 타 행과 이질': 팔은 명도 갈린 플랫 두 톤이면 충분하다) */
        ink(ctx, S, bar(ctx, S, 1.512, 0.760, 1.404, 0.470, 0.104), '#2b5c2c', 0.030);            // 왼 위팔(몸통보다 어둡게)
        ink(ctx, S, bar(ctx, S, 1.404, 0.490, 1.508, 0.290, 0.098), '#428343', 0.030);            // 왼 아래팔(위로)
        /* 오른팔은 **내린다** — 양팔 만세는 원본(한 팔만 뼈를 들고 다른 팔은 내린 뒷모습)과 달리
           '귀여운 만세 로봇'으로 읽힌다(비평가 6차 2인 공통). */
        /* R3 A3 '오른팔이 조그만 절단 스텁' — 위팔 대부분이 몸통 실루엣에 가려 팔 길이가 안
           보였다: 팔 전체를 바깥으로 내밀어 실루엣 밖에서 위팔→팔꿈치→아래팔이 읽히게 한다. */
        ink(ctx, S, bar(ctx, S, 1.872, 0.690, 1.990, 0.895, 0.100), '#2b5c2c', 0.030);            // 오른 위팔(아래로, 몸통보다 어둡게)
        ink(ctx, S, bar(ctx, S, 1.990, 0.895, 2.052, 1.045, 0.092), '#387137', 0.030);            // 오른 아래팔(그늘 쪽이라 왼쪽보다 어둡게)
        /* 팔꿈치 융합 패치(R2 — R1 A '직선 원통 3마디 + 볼조인트 = 레고 팔'): 관절 이음매의 검정
           키라인 세그먼트 경계를 같은 팔 색 원반으로 덮어 한 줄기 팔로 잇는다(키라인은 바깥
           실루엣에만 남는다). */
        on(ctx, circle(ctx, S, 1.406, 0.480, 0.046), '#428343');                                  // 왼 팔꿈치
        on(ctx, circle(ctx, S, 1.990, 0.897, 0.043), '#387137');                                  // 오른 팔꿈치
        /* 몸통(비평가 9차 2인 공통 '레고/로봇 프리미티브'): 좌우 대칭 사다리꼴을 버린다 —
           오른어깨를 낮게 떨어뜨리고(뼈 든 왼쪽으로 무게가 쏠린 좀비 자세), 아랫단은
           너덜너덜한 옷자락 지그재그. 뒷모습 규약(6차 — 정면 점눈은 '귀여운 로봇')은 유지. */
        /* 몸통(R2 A2·B2 공통 '각진 사각 파츠 + 면 셰이딩 = 로우폴리/선인장'): 좌우 옆구리를
           곡선으로 라운딩하고 왼쪽 지그재그를 걷어 실루엣을 부드럽게 — 톱니는 옷단(하단)에만
           남긴다(B2 처방 그대로). */
        const torso = () => {
            ctx.moveTo(1.452 * S, 1.02 * S);
            ctx.quadraticCurveTo(1.434 * S, 0.80 * S, 1.492 * S, 0.585 * S);                      // 왼 옆구리(곡선)
            ctx.lineTo(1.872 * S, 0.625 * S);                                                     // 어깨선
            ctx.quadraticCurveTo(1.934 * S, 0.83 * S, 1.916 * S, 1.02 * S);                       // 오른 옆구리(곡선)
            ctx.lineTo(1.862 * S, 0.978 * S); ctx.lineTo(1.802 * S, 1.02 * S);                    // 너덜 옷자락(톱니는 옷단에만)
            ctx.lineTo(1.744 * S, 0.972 * S); ctx.lineTo(1.664 * S, 1.02 * S);
            ctx.lineTo(1.596 * S, 0.975 * S); ctx.lineTo(1.528 * S, 1.02 * S);
            ctx.closePath();
        };
        ink(ctx, S, torso, '#3b7739', 0.032);
        ctx.save();
        ctx.beginPath(); torso(); ctx.clip();
        /* 몸통 내부 = 셀 음영 한 톤: 왼 림라이트 + 오른쪽 세로 그늘 밴드 하나(사선 하드엣지
           슬래시는 R2 A2 '면 그라데이션' 지적으로 세로 밴드로 교체 — 머리 음영과 같은 문법). */
        on(ctx, rrect(ctx, S, 1.508, 0.600, 0.036, 0.440, 0.018), '#65a054');                     // 왼 가장자리 림라이트(볼륨 — 비평가 4차)
        on(ctx, rrect(ctx, S, 1.806, 0.585, 0.130, 0.445, 0), 'rgba(0,0,0,.20)');                 // 오른쪽 셀 그늘 밴드
        on(ctx, rrect(ctx, S, 1.618, 0.585, 0.030, 0.440, 0), 'rgba(0,0,0,.16)');                 // 찢어진 옷자락 이음
        ctx.restore();
        /* 찢긴 소매 캡(R2 — R1 A '어깨 구체'): 팔이 몸통에 볼조인트로 꽂힌 것처럼 보이던 어깨
           이음을 몸통색 너덜 소매로 덮어 '옷 입은 몸'으로 잇는다. */
        ink(ctx, S, poly(ctx, S, [[1.446, 0.630], [1.556, 0.612], [1.578, 0.706], [1.544, 0.686], [1.516, 0.728], [1.480, 0.698], [1.446, 0.724]]), '#3b7739', 0.028);   // 왼 어깨
        ink(ctx, S, poly(ctx, S, [[1.830, 0.668], [1.936, 0.652], [1.956, 0.748], [1.922, 0.726], [1.894, 0.768], [1.858, 0.736], [1.830, 0.762]]), '#3b7739', 0.028);   // 오른 어깨
        on(ctx, poly(ctx, S, [[1.856, 0.712], [1.938, 0.700], [1.918, 0.740], [1.884, 0.752]]), 'rgba(0,0,0,.32)');   // 소매 안 절단면 그늘(이번 런 B: 팔 소실이 의도임을 명시)
        /* 목(R2 A '머리가 풍선처럼 떠 있다'): 머리보다 먼저 그려 머리 밑에 깔리는 짧은 목 기둥 —
           머리 기울기와 같은 쪽으로 살짝 물려 어깨선과 잇는다. */
        ink(ctx, S, rrect(ctx, S, 1.622, 0.545, 0.118, 0.085, 0.030), '#356c36', 0.026);
        /* 머리 = **뒷모습**(비평가 6차 2인 공통: 원본은 얼굴이 안 보이는 뒷모습 실루엣인데 점눈+
           이빨 정면 얼굴은 '귀여운 로봇'이 된다). 눈·입·이빨 대신 뒤통수 스티치 흉터 + 헝클어진
           머리털 혹 + 썩은 얼룩으로 좀비를 세운다. */
        /* 머리 — 뒷모습 규약 유지(6차: 정면 점눈+이빨 = '귀여운 로봇') + 9차 '기하 프리미티브'
           반영: 머리를 왼쪽(뼈 든 팔 쪽)으로 8도 기울이고, 왼 실루엣에 귀 한 짝을 내밀어
           3/4 뒷모습으로 — 정면 얼굴 없이도 '고개를 꺾은 좀비'로 읽힌다. */
        ctx.save();
        ctx.translate(1.681 * S, 0.481 * S); ctx.rotate(-0.14); ctx.translate(-1.681 * S, -0.481 * S);
        const head = rrect(ctx, S, 1.542, 0.350, 0.278, 0.262, 0.085);
        /* 머리털 = 헝클어진 삼각 타래(R2 A '연결된 팔 없는 혹 3개 = 남의 손가락' — 원형 혹은 두
           라운드 연속 오독이라 폐기): 밑동이 두피에 박힌 뾰족 타래 3장, 키·기울기 변주. */
        /* ⚠️ 타래가 크고 양끝 2개뿐이면 '고양이 귀'가 된다(캡처 확인) — 작게 4개, 가운데가 제일 크게. */
        /* 타래는 3개로 축소·우측으로 몰아 정수리 실루엣을 낮춘다(이번 런 B '정수리 돌기 = 선인장 단서') */
        [[1.652, 0.366, 0.042, 0.026, 0.006], [1.712, 0.368, 0.036, 0.024, 0.014], [1.762, 0.380, 0.028, 0.020, 0.022]].forEach(([hx, hy, hh, hw, lean]) =>
            ink(ctx, S, poly(ctx, S, [[hx - hw, hy], [hx + lean, hy - hh], [hx + hw, hy]]), '#397338', 0.022));
        ink(ctx, S, ell(ctx, S, 1.826, 0.462, 0.034, 0.046), '#478c46', 0.026);                   // 귀 — 3/4 측면이라 얼굴 반대(오른) 실루엣 밖으로
        ink(ctx, S, head, '#478c46', 0.032);
        ctx.save();
        ctx.beginPath(); head(); ctx.clip();
        /* 머리 내부도 몸통과 같은 셀 규약: 빛면·그늘면·스티치만 — 저알파 얼룩(썩은 반점·볼그늘)은
           3배 확대에서 '무작위 반점'이라 걷었다(ⓐ 처방과 한 벌). */
        on(ctx, rrect(ctx, S, 1.542, 0.350, 0.070, 0.262, 0), 'rgba(255,255,255,.12)');           // 왼쪽 빛면
        on(ctx, rrect(ctx, S, 1.752, 0.350, 0.068, 0.262, 0), 'rgba(0,0,0,.18)');                 // 오른쪽 음영
        on(ctx, rrect(ctx, S, 1.672, 0.372, 0.018, 0.200, 0.009), 'rgba(0,0,0,.34)');             // 두피 스티치 흉터(측면에서도 좀비 단서)
        [0.408, 0.468, 0.528].forEach(y =>
            on(ctx, rrect(ctx, S, 1.646, y, 0.070, 0.014, 0.007), 'rgba(0,0,0,.30)'));
        /* R3 A3 '반대쪽 눈자리가 빈 초록 면 = 미완성': X 봉합 흉터로 '연출'로 확정한다. */
        [[-0.35, 0.35], [0.35, 0.35]].forEach(([dx, dy]) => {
            ctx.save();
            ctx.translate(1.752 * S, 0.446 * S); ctx.rotate(Math.atan2(dy, dx));
            ctx.fillStyle = 'rgba(0,0,0,.42)';
            ctx.fillRect(-0.036 * S, -0.009 * S, 0.072 * S, 0.018 * S);
            ctx.restore();
        });
        /* 3/4 측면 얼굴 단서(이번 런 A·B 공통 '얼굴 단서 0 = 선인장/봉제인형 — 눈 1 + 입만 있어도
           소멸'): 왼(뼈 든 팔 쪽) 실루엣 가장자리에 처진 눈꺼풀의 눈 하나 + 벌어진 턱 + 이빨 1개.
           ⚠️ 6차 금지는 **정면 점눈 둘 + 이빨**('귀여운 로봇') — 한쪽 눈 측면 프로필은 별개 처방이고
           이번 비평가 2인이 공통으로 요구했다. 되물리면 이 메모째 판단 근거를 남길 것. */
        on(ctx, ell(ctx, S, 1.590, 0.444, 0.041, 0.048), '#e8ecd8');                              // 눈 흰자(이번 런 A: 1x 에서 표정 소실 — 25% 확대)
        on(ctx, rrect(ctx, S, 1.544, 0.392, 0.092, 0.034, 0.016), 'rgba(0,0,0,.55)');             // 처진 눈꺼풀
        on(ctx, circle(ctx, S, 1.577, 0.454, 0.016), '#1c2a16');                                  // 동공(왼쪽을 본다)
        on(ctx, poly(ctx, S, [[1.536, 0.494], [1.668, 0.512], [1.652, 0.570], [1.536, 0.576]]), 'rgba(10,16,8,.85)');   // 벌어진 턱(실루엣 가장자리에 물림 — 작으면 수염 얼룩으로 읽힌다)
        [[1.558, 0.506], [1.602, 0.512]].forEach(([tx2, ty2]) =>
            on(ctx, poly(ctx, S, [[tx2, ty2], [tx2 + 0.030, ty2 + 0.004], [tx2 + 0.013, ty2 + 0.030]]), '#dfe3cc'));    // 윗니 2개
        ctx.restore();
        ctx.restore();
        /* 뼈다귀(3차 재채점 교집합 ⓐ — 세로로 세운 짧은 뼈의 끝 혹 2개가 머리 위 '눈알'로 오독):
           **더 크게, 눕혀서** — 자루를 길게 좌상 45°로 뉘고 혹은 먼 끝에만(주먹이 근 끝을 가린다),
           자루 대비 혹 비중을 줄인다. 눕히면 혹 쌍도 대각이라 눈 배치가 안 된다. */
        ink(ctx, S, bar(ctx, S, 1.578, 0.290, 1.310, 0.148, 0.058), '#e6e2d2', 0.024);            // 자루(주먹→좌상 — 주먹을 관통해 아래 밑동까지 잇는다)
        [[1.326, 0.118], [1.282, 0.172]].forEach(p => ink(ctx, S, circle(ctx, S, p[0], p[1], 0.040), '#e6e2d2', 0.022));   // 먼 끝 혹(대각 쌍)
        /* 주먹 = 한 덩어리(R2 A '초록 구슬 다발' — R1 처방이던 마디 혹 3개를 되물림): 뼈와 직교하는
           얕은 골 2줄만 눌러 '감아쥔 손'을 말한다(망치 행 주먹과 같은 해법). */
        /* R3 병렬·R4 합류 '주먹이 안 보인다/쥔 게 아니다': 주먹을 키우고(0.082) 아래팔보다
           **한 단 밝은 초록**으로 갈라(1x 명도 분리) 엄지+골 2줄로 '감아쥔 손'을 세운다. */
        ink(ctx, S, ell(ctx, S, 1.512, 0.290, 0.082, 0.072, -0.48), '#5aa855', 0.028);            // 주먹(뼈 하단을 감아쥔 타원 한 덩어리, 확대·밝게)
        ink(ctx, S, ell(ctx, S, 1.556, 0.330, 0.032, 0.026, -0.48), '#6db863', 0.026);            // 엄지(감아쥔 쪽, 한 단 더 밝게)
        ctx.save();
        ctx.beginPath(); ell(ctx, S, 1.512, 0.290, 0.082, 0.072, -0.48)(); ctx.clip();
        [[1.532, 0.252], [1.548, 0.296]].forEach(([gx, gy]) =>
            on(ctx, rrect(ctx, S, gx - 0.012, gy - 0.056, 0.024, 0.112, 0.012), 'rgba(0,0,0,.26)'));   // 손가락 골 2줄(뼈 자루와 직교 방향)        ctx.restore();
        on(ctx, ell(ctx, S, 1.488, 0.268, 0.028, 0.022), 'rgba(255,255,255,.20)');                // 주먹 광
    };
})(IconGen);

/* ============================================================================
 * 뒤로가기 ◀ · 좌우 스텝 ◀▶ (icon-gen 슬라이스 '기타' — 남은 폰트 글리프 처리)
 *
 * 왜 아이콘으로 바꾸나: 이 삼각형들은 **폰트 글리프 텍스트 노드**(`◀`/`▶`)였다. 닫기 ✕ 를
 * 캔버스로 옮긴 것과 같은 이유다 — ⓐ 플랫폼 폰트마다 굵기·크기·좌우 여백이 달라지고
 * (일부 플랫폼은 U+25C0 을 **컬러 이모지**로 그린다) ⓑ 옆 아이콘이 전부 '순검정 키라인 +
 * 평면 채움'인데 이 표시만 테가 없거나(빨강 뒤로 버튼) 텍스트 스트로크로 흉내 낸다.
 *
 * 원본 실측(`tools/probe-tri-ref.js` + ASCII 확대):
 *  ⓐ **빨간 뒤로가기**(shot-042149, 앱 498×896) — 버튼 밝은 면 31×21px(키라인 포함 35×29),
 *     그 안 흰 삼각형 잉크 **12×13px**, 잉크 둘레에 **순검정 테 2px**. 오른쪽 변이 수직인
 *     정통 ◀ 다. 잉크 폭/높이 비 = 12/13 = **0.923**.
 *  ⓑ **파란 스텝 ◀▶**(shot-042521 소환 확률 팝업) — 파란 잉크 **25×27px**, 검정 테 3px,
 *     테 포함 31×35px. 잉크 비 25/27 = **0.926** — ⓐ 와 같은 삼각형이다(색과 크기만 다르다).
 *
 * 그래서 드로어는 하나의 기하를 쓰고 `opt.tint` 로 채움색만 갈아 끼운다.
 *  · 잉크 세로 = 캔버스 세로의 (1 − LW) · 잉크 가로 = 잉크 세로 × 0.925
 *  · 캔버스 가로(ASPECT) = 잉크 가로 + LW → 테가 캔버스 밖으로 안 잘린다.
 * 표시 크기는 CSS 가 준다 — 원본 비 **아이콘 세로 = 버튼 세로 × 0.554**
 * (잉크 13 ÷ 0.81 = 테 포함 16px, 16/29 = 0.554).
 *
 * ⚠️ 캐시 키는 `이름|tint` 뿐이라 **방향을 opt 로 받으면 안 된다**(왼쪽/오른쪽이 같은 캐시에
 *    걸린다). 그래서 `tri_left`·`tri_right` 두 이름으로 나눠 등록한다.
 * ⚠️ `ink()` 는 경로를 굵게 스트로크한 뒤 그 위를 칠하므로 테는 **바깥으로 LW/2** 만 나간다.
 *    꼭짓점이 뾰족해 `lineJoin:'round'` 가 아니면 미터가 훨씬 멀리 튀어나간다(ink 가 이미 round).
 * ============================================================================ */
(function (G) {
    const { ink, poly } = G._sticker;
    const LW = 0.19;                    // 키라인 두께(캔버스 세로 대비) — 바깥으로 LW/2 = 0.095
    const IH = 1 - LW;                  // 잉크 세로
    const IW = IH * 0.925;              // 잉크 가로 (원본 비 0.923~0.926)
    const AR = IW + LW;                 // 캔버스 가로 = 테 포함 전체 폭
    G.ASPECT.tri_left = AR;
    G.ASPECT.tri_right = AR;

    // pts 는 캔버스 가로가 AR 인 좌표계다(x 는 0..AR, y 는 0..1 — 다른 ASPECT 아이콘과 같은 규약).
    const tri = (dir) => function (ctx, S, opt) {
        const cx = AR / 2, cy = 0.5, hx = IW / 2, hy = IH / 2;
        const apex = [cx - dir * hx, cy];              // 뾰족한 꼭짓점(◀ 면 왼쪽)
        const flat = cx + dir * hx;                    // 수직인 밑변의 x
        ink(ctx, S, poly(ctx, S, [apex, [flat, cy - hy], [flat, cy + hy]]), (opt && opt.tint) || '#fff', LW);
    };
    G.draw.tri_left = tri(1);
    G.draw.tri_right = tri(-1);
})(IconGen);
