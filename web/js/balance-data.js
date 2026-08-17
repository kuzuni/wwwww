// ===== 포지마스터 원본 밸런스 데이터 (ForgeMasterCalculator에서 추출) =====
// 전역 상수로 선언 — 게임 로직에서 참조
const forgeProbabilities = {
    1: { primitive: 100.00 },
    2: { primitive: 99.00, medieval: 1.00 },
    3: { primitive: 98.00, medieval: 2.00 },
    4: { primitive: 96.00, medieval: 4.00 },
    5: { primitive: 91.50, medieval: 8.00, earlyModern: 0.50 },
    6: { primitive: 82.00, medieval: 16.00, earlyModern: 2.00 },
    7: { primitive: 64.00, medieval: 32.00, earlyModern: 4.00 },
    8: { primitive: 27.80, medieval: 64.00, earlyModern: 8.00, modern: 0.20 },
    9: { primitive: 13.00, medieval: 70.00, earlyModern: 16.00, modern: 1.00 },
    10: { primitive: 6.00, medieval: 60.00, earlyModern: 32.00, modern: 2.00 },
    11: { medieval: 31.90, earlyModern: 64.00, modern: 4.00, space: 0.10 },
    12: { medieval: 27.50, earlyModern: 64.00, modern: 8.00, space: 0.50 },
    13: { medieval: 8.00, earlyModern: 75.00, modern: 16.00, space: 1.00 },
    14: { earlyModern: 66.00, modern: 32.00, space: 2.00, interstellar: 0.05 },
    15: { earlyModern: 31.70, modern: 64.00, space: 4.00, interstellar: 0.25 },
    16: { earlyModern: 21.50, modern: 70.00, space: 8.00, interstellar: 0.50 },
    17: { modern: 82.90, space: 16.00, interstellar: 1.00, multiverse: 0.05 },
    18: { modern: 65.70, space: 32.00, interstellar: 2.00, multiverse: 0.25 },
    19: { modern: 31.50, space: 64.00, interstellar: 4.00, multiverse: 0.50 },
    20: { space: 91.00, interstellar: 8.00, multiverse: 1.00, quantum: 0.05 },
    21: { space: 81.70, interstellar: 16.00, multiverse: 2.00, quantum: 0.25 },
    22: { space: 63.50, interstellar: 32.00, multiverse: 4.00, quantum: 0.50 },
    23: { space: 27.00, interstellar: 64.00, multiverse: 8.00, quantum: 1.00 },
    24: { interstellar: 82.00, multiverse: 16.00, quantum: 2.00, underworld: 0.01 },
    25: { interstellar: 64.00, multiverse: 32.00, quantum: 4.00, underworld: 0.05 },
    26: { interstellar: 43.80, multiverse: 50.00, quantum: 6.00, underworld: 0.25 },
    27: { interstellar: 31.50, multiverse: 60.00, quantum: 8.00, underworld: 0.50 },
    28: { interstellar: 21.00, multiverse: 65.00, quantum: 13.00, underworld: 1.00 },
    // 29레벨만 원본 게임 스크린샷(ref/screens/shot-042950·043117 자동 제련 '유지' 목록)이 기준이다.
    // 추출원(ForgeMasterCalculator = data/raw/app.js)은 이 행을 `interstellar 7.00 … 4줄`로 적어 뒀지만,
    // 원본 게임은 같은 행을 **6.99 / 68 / 23 / 2 / 신성한 0.02 의 5줄**로 띄운다(두 스샷 모두 동일).
    // 합이 100.01 이라 추출원 저자가 divine 0.02 를 버리고 6.99→7.00 으로 반올림해 100.00 을 맞춘 것으로 보인다.
    // 추첨은 U.weightedPick 이 합으로 정규화하므로 100.01 이어도 안전하다. data/raw/app.js 는 추출 원문이라 손대지 않는다.
    29: { interstellar: 6.99, multiverse: 68.00, quantum: 23.00, underworld: 2.00, divine: 0.02 },
    30: { multiverse: 60.00, quantum: 36.00, underworld: 4.00, divine: 0.01 },
    31: { multiverse: 50.90, quantum: 43.00, underworld: 6.00, divine: 0.05 },
    32: { multiverse: 41.70, quantum: 50.00, underworld: 8.00, divine: 0.25 },
    33: { multiverse: 28.50, quantum: 58.00, underworld: 13.00, divine: 0.50 },
    34: { multiverse: 12.00, quantum: 64.00, underworld: 23.00, divine: 1.00 },
    35: { quantum: 62.00, underworld: 36.00, divine: 2.00 }
};

// 대장간 업그레이드: 해머 비용 + 시간(초) — 원본 실측
const forgeUpgrades = {
    2:{cost:400,time:300}, 3:{cost:700,time:900}, 4:{cost:1500,time:1800}, 5:{cost:3500,time:3600},
    6:{cost:10000,time:7140}, 7:{cost:25000,time:27180}, 8:{cost:50000,time:47160}, 9:{cost:99900,time:67140},
    10:{cost:150000,time:87180}, 11:{cost:249900,time:126000}, 12:{cost:336000,time:176400}, 13:{cost:452000,time:234000},
    14:{cost:612000,time:306000}, 15:{cost:830000,time:385200}, 16:{cost:1120000,time:464400}, 17:{cost:1510000,time:543600},
    18:{cost:2040000,time:626400}, 19:{cost:2750000,time:705600}, 20:{cost:3700000,time:784800}, 21:{cost:5020000,time:867180},
    22:{cost:6780000,time:946800}, 23:{cost:9160000,time:1026000}, 24:{cost:12300000,time:1105200}, 25:{cost:16600000,time:1184400},
    26:{cost:20000000,time:1263600}, 27:{cost:24000000,time:1346400}, 28:{cost:28800000,time:1425600}, 29:{cost:34600000,time:1504800},
    30:{cost:41500000,time:1584000}, 31:{cost:49800000,time:1666800}, 32:{cost:59800000,time:1746000}, 33:{cost:71700000,time:1825200},
    34:{cost:86100000,time:1904400}, 35:{cost:103000000,time:1987200}
};

const eggDropRates = {
    // Chapter 1 (1-1 to 1-10)
    '1-1': { common: 0.99, rare: 0.01 },
    '1-2': { common: 0.98, rare: 0.02 },
    '1-3': { common: 0.95, rare: 0.05 },
    '1-4': { common: 0.8995, rare: 0.10, epic: 0.0005 },
    '1-5': { common: 0.8854, rare: 0.114, epic: 0.0006 },
    '1-6': { common: 0.8693, rare: 0.13, epic: 0.0007 },
    '1-7': { common: 0.851, rare: 0.1482, epic: 0.0008 },
    '1-8': { common: 0.83, rare: 0.1689, epic: 0.0011 },
    '1-9': { common: 0.8061, rare: 0.1925, epic: 0.0014 },
    '1-10': { common: 0.7788, rare: 0.2195, epic: 0.0017 },
    
    // Chapter 2 (2-1 to 2-10)
    '2-1': { common: 0.7476, rare: 0.2503, epic: 0.0021 },
    '2-2': { common: 0.7121, rare: 0.2852, epic: 0.0027 },
    '2-3': { common: 0.6714, rare: 0.3252, epic: 0.0034 },
    '2-4': { common: 0.6251, rare: 0.3707, epic: 0.0042 },
    '2-5': { common: 0.5721, rare: 0.4227, epic: 0.0052 },
    '2-6': { common: 0.5117, rare: 0.4817, epic: 0.0066 },
    '2-7': { common: 0.4426, rare: 0.5492, epic: 0.0082 },
    '2-8': { common: 0.3636, rare: 0.6262, epic: 0.0102 },
    '2-9': { common: 0.2734, rare: 0.7138, epic: 0.0128 },
    '2-10': { common: 0.175, rare: 0.809, epic: 0.016 },
    
    // Chapter 3 (3-1 to 3-10) - Legendary starts appearing
    '3-1': { common: 0.175, rare: 0.8048, epic: 0.02, legendary: 0.0002 },
    '3-2': { common: 0.175, rare: 0.8007, epic: 0.024, legendary: 0.0003 },
    '3-3': { common: 0.175, rare: 0.7958, epic: 0.0288, legendary: 0.0004 },
    '3-4': { common: 0.175, rare: 0.79, epic: 0.0345, legendary: 0.0005 },
    '3-5': { common: 0.175, rare: 0.7831, epic: 0.0413, legendary: 0.0006 },
    '3-6': { common: 0.175, rare: 0.7747, epic: 0.0496, legendary: 0.0007 },
    '3-7': { common: 0.175, rare: 0.7647, epic: 0.0594, legendary: 0.0009 },
    '3-8': { common: 0.175, rare: 0.7527, epic: 0.0712, legendary: 0.0011 },
    '3-9': { common: 0.175, rare: 0.7382, epic: 0.0854, legendary: 0.0014 },
    '3-10': { common: 0.175, rare: 0.7209, epic: 0.1024, legendary: 0.0017 },
    
    // Chapter 4 (4-1 to 4-10)
    '4-1': { common: 0.175, rare: 0.7, epic: 0.1229, legendary: 0.0021 },
    '4-2': { common: 0.175, rare: 0.6751, epic: 0.1472, legendary: 0.0027 },
    '4-3': { common: 0.175, rare: 0.6451, epic: 0.1765, legendary: 0.0034 },
    '4-4': { common: 0.175, rare: 0.6091, epic: 0.2117, legendary: 0.0042 },
    '4-5': { common: 0.175, rare: 0.566, epic: 0.2538, legendary: 0.0052 },
    '4-6': { common: 0.175, rare: 0.5141, epic: 0.3043, legendary: 0.0066 },
    '4-7': { common: 0.175, rare: 0.4519, epic: 0.3649, legendary: 0.0082 },
    '4-8': { common: 0.175, rare: 0.3773, epic: 0.4375, legendary: 0.0102 },
    '4-9': { common: 0.175, rare: 0.2877, epic: 0.5245, legendary: 0.0128 },
    '4-10': { common: 0.175, rare: 0.1801, epic: 0.6289, legendary: 0.016 },
    
    // Chapter 5 (5-1 to 5-10) - Ultimate starts appearing
    '5-1': { common: 0.175, rare: 0.165, epic: 0.6398, legendary: 0.02, ultimate: 0.0002 },
    '5-2': { common: 0.175, rare: 0.165, epic: 0.6361, legendary: 0.0236, ultimate: 0.0003 },
    '5-3': { common: 0.175, rare: 0.165, epic: 0.6318, legendary: 0.0278, ultimate: 0.0004 },
    '5-4': { common: 0.175, rare: 0.165, epic: 0.6267, legendary: 0.0328, ultimate: 0.0005 },
    '5-5': { common: 0.175, rare: 0.165, epic: 0.6207, legendary: 0.0387, ultimate: 0.0006 },
    '5-6': { common: 0.175, rare: 0.165, epic: 0.6135, legendary: 0.0458, ultimate: 0.0007 },
    '5-7': { common: 0.175, rare: 0.165, epic: 0.6051, legendary: 0.054, ultimate: 0.0009 },
    '5-8': { common: 0.175, rare: 0.165, epic: 0.5952, legendary: 0.0637, ultimate: 0.0011 },
    '5-9': { common: 0.175, rare: 0.165, epic: 0.5834, legendary: 0.0752, ultimate: 0.0014 },
    '5-10': { common: 0.175, rare: 0.165, epic: 0.5696, legendary: 0.0887, ultimate: 0.0017 },
    
    // Chapter 6 (6-1 to 6-10)
    '6-1': { common: 0.175, rare: 0.165, epic: 0.5532, legendary: 0.1047, ultimate: 0.0021 },
    '6-2': { common: 0.175, rare: 0.165, epic: 0.5338, legendary: 0.1235, ultimate: 0.0027 },
    '6-3': { common: 0.175, rare: 0.165, epic: 0.5109, legendary: 0.1457, ultimate: 0.0034 },
    '6-4': { common: 0.175, rare: 0.165, epic: 0.4838, legendary: 0.172, ultimate: 0.0042 },
    '6-5': { common: 0.175, rare: 0.165, epic: 0.4518, legendary: 0.203, ultimate: 0.0052 },
    '6-6': { common: 0.175, rare: 0.165, epic: 0.414, legendary: 0.2394, ultimate: 0.0066 },
    '6-7': { common: 0.175, rare: 0.165, epic: 0.3692, legendary: 0.2826, ultimate: 0.0082 },
    '6-8': { common: 0.175, rare: 0.165, epic: 0.3163, legendary: 0.3335, ultimate: 0.0102 },
    '6-9': { common: 0.175, rare: 0.165, epic: 0.2537, legendary: 0.3935, ultimate: 0.0128 },
    '6-10': { common: 0.175, rare: 0.165, epic: 0.1797, legendary: 0.4643, ultimate: 0.016 },
    
    // Chapter 7 (7-1 to 7-10) - Mythic starts appearing
    '7-1': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4748, ultimate: 0.02, mythic: 0.0002 },
    '7-2': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4717, ultimate: 0.023, mythic: 0.0003 },
    '7-3': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4681, ultimate: 0.0265, mythic: 0.0004 },
    '7-4': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4641, ultimate: 0.0304, mythic: 0.0005 },
    '7-5': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4594, ultimate: 0.035, mythic: 0.0006 },
    '7-6': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4541, ultimate: 0.0402, mythic: 0.0007 },
    '7-7': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4478, ultimate: 0.0463, mythic: 0.0009 },
    '7-8': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4407, ultimate: 0.0532, mythic: 0.0011 },
    '7-9': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4324, ultimate: 0.0612, mythic: 0.0014 },
    '7-10': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4229, ultimate: 0.0704, mythic: 0.0017 },
    
    // Chapter 8 (8-1 to 8-10)
    '8-1': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.4119, ultimate: 0.081, mythic: 0.0021 },
    '8-2': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.3993, ultimate: 0.093, mythic: 0.0027 },
    '8-3': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.3846, ultimate: 0.107, mythic: 0.0034 },
    '8-4': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.3677, ultimate: 0.1231, mythic: 0.0042 },
    '8-5': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.3482, ultimate: 0.1416, mythic: 0.0052 },
    '8-6': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.3257, ultimate: 0.1627, mythic: 0.0066 },
    '8-7': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.2997, ultimate: 0.1871, mythic: 0.0082 },
    '8-8': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.2695, ultimate: 0.2153, mythic: 0.0102 },
    '8-9': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.2347, ultimate: 0.2475, mythic: 0.0128 },
    '8-10': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.1944, ultimate: 0.2846, mythic: 0.016 },
    
    // Chapter 9 (9-1 to 9-10)
    '9-1': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.31, mythic: 0.02 },
    '9-2': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.3076, mythic: 0.0224 },
    '9-3': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.3049, mythic: 0.0251 },
    '9-4': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.3019, mythic: 0.0281 },
    '9-5': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2985, mythic: 0.0315 },
    '9-6': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2948, mythic: 0.0352 },
    '9-7': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2905, mythic: 0.0395 },
    '9-8': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2858, mythic: 0.0442 },
    '9-9': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2805, mythic: 0.0495 },
    '9-10': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2745, mythic: 0.0555 },
    
    // Chapter 10 (10-1 to 10-10)
    '10-1': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2679, mythic: 0.0621 },
    '10-2': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2604, mythic: 0.0696 },
    '10-3': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2521, mythic: 0.0779 },
    '10-4': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2427, mythic: 0.0873 },
    '10-5': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2323, mythic: 0.0977 },
    '10-6': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2205, mythic: 0.1095 },
    '10-7': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2074, mythic: 0.1226 },
    '10-8': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.1927, mythic: 0.1373 },
    '10-9': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.1762, mythic: 0.1538 },
    '10-10': { common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.165, mythic: 0.165 }
};

const baseHatchingTimes = {
    common: 30,      // 30 minutes
    rare: 120,       // 2 hours
    epic: 240,       // 4 hours
    legendary: 480,  // 8 hours
    ultimate: 960,   // 16 hours
    mythic: 1920     // 32 hours (1 day 8 hours)
};

const petStats = {
    common: [
        { name: 'Snail', damage: 50, health: 1200 },
        { name: 'Turtle', damage: 50, health: 1200 },
        { name: 'Mouse', damage: 100, health: 800 },
        { name: 'Chicken', damage: 100, health: 800 },
        { name: 'Cat', damage: 100, health: 800 },
        { name: 'Dog', damage: 150, health: 400 }
    ],
    rare: [
        { name: 'Hedgehog', damage: 250, health: 6000 },
        { name: 'Bear', damage: 250, health: 6000 },
        { name: 'Ostrich', damage: 500, health: 4000 },
        { name: 'Scorpion', damage: 750, health: 2000 },
        { name: 'Spider', damage: 750, health: 2000 }
    ],
    epic: [
        { name: 'Panda', damage: 1250, health: 30000 },
        { name: 'Griffin', damage: 1250, health: 30000 },
        { name: 'Unicorn', damage: 2500, health: 20000 },
        { name: 'Saber Tooth', damage: 3750, health: 10000 },
        { name: 'Tiger', damage: 3750, health: 10000 }
    ],
    legendary: [
        { name: 'Cerberus', damage: 12500, health: 100000 },
        { name: 'Kitsune', damage: 18750, health: 50000 },
        { name: 'Serpent', damage: 18750, health: 50000 }
    ],
    ultimate: [
        { name: 'Treant', damage: 31200, health: 750000 },
        { name: 'Enchanted Elk', damage: 62500, health: 500000 },
        { name: 'Electry', damage: 93700, health: 250000 }
    ],
    mythic: [
        { name: 'Genie', damage: 156250, health: 3750000 },
        { name: 'Baby Dragon', damage: 312500, health: 2500000 },
        { name: 'Spectral Tiger', damage: 468750, health: 1250000 }
    ]
};

const skillRatesData = {
    1: [100, 0, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0, 0], 3: [100, 0, 0, 0, 0, 0],
    4: [89.95, 10, 0.05, 0, 0, 0], 5: [88.54, 11.40, 0.06, 0, 0, 0], 6: [86.93, 13, 0.07, 0, 0, 0],
    7: [85.1, 14.84, 0.08, 0, 0, 0], 8: [83, 16.89, 0.11, 0, 0, 0], 9: [80.61, 19.25, 0.14, 0, 0, 0],
    10: [77.88, 21.95, 0.17, 0, 0, 0], 11: [74.76, 25.03, 0.21, 0, 0, 0], 12: [71.21, 28.53, 0.26, 0, 0, 0],
    13: [67.14, 32.52, 0.34, 0, 0, 0], 14: [62.51, 37.07, 0.42, 0, 0, 0], 15: [57.21, 42.27, 0.52, 0, 0, 0],
    16: [51.17, 48.18, 0.65, 0, 0, 0], 17: [44.26, 54.92, 0.82, 0, 0, 0], 18: [36.36, 62.62, 1.02, 0, 0, 0],
    19: [27.34, 71.38, 1.28, 0, 0, 0], 20: [17.5, 80.9, 1.6, 0, 0, 0],
    21: [17.5, 80.49, 2, 0.01, 0, 0], 22: [17.5, 80.09, 2.4, 0.01, 0, 0], 23: [17.5, 79.61, 2.87, 0.02, 0, 0],
    24: [17.5, 79.03, 3.45, 0.02, 0, 0], 25: [17.5, 78.34, 4.13, 0.03, 0, 0], 26: [17.5, 77.51, 4.95, 0.04, 0, 0],
    27: [17.5, 76.51, 5.59, 0.04, 0, 0], 28: [17.5, 75.32, 7.13, 0.05, 0, 0], 29: [17.5, 73.89, 8.54, 0.07, 0, 0],
    30: [17.5, 72.17, 10.24, 0.09, 0, 0], 31: [17.5, 70.11, 12.28, 0.11, 0, 0], 32: [17.5, 67.64, 14.73, 0.13, 0, 0],
    33: [17.5, 64.68, 17.65, 0.17, 0, 0], 34: [17.5, 61.12, 21.17, 0.21, 0, 0], 35: [17.5, 56.86, 25.38, 0.26, 0, 0],
    36: [17.5, 51.74, 30.43, 0.33, 0, 0], 37: [17.5, 45.6, 36.49, 0.41, 0, 0], 38: [17.5, 38.24, 43.75, 0.51, 0, 0],
    39: [17.5, 29.41, 52.45, 0.64, 0, 0], 40: [17.5, 18.81, 62.89, 0.80, 0, 0],
    41: [17.5, 16.5, 65, 1.00, 0, 0], 42: [17.5, 16.5, 64.78, 1.22, 0, 0], 43: [17.5, 16.5, 64.51, 1.49, 0, 0],
    44: [17.5, 16.5, 64.17, 1.82, 0.01, 0], 45: [17.5, 16.5, 63.76, 2.22, 0.02, 0], 46: [17.5, 16.5, 63.27, 2.7, 0.03, 0],
    47: [17.5, 16.5, 62.66, 3.3, 0.04, 0], 48: [17.5, 16.5, 61.92, 4.03, 0.05, 0], 49: [17.5, 16.5, 61.02, 4.91, 0.07, 0],
    50: [17.5, 16.5, 59.93, 5.99, 0.08, 0], 51: [17.5, 16.5, 58.59, 7.3, 0.11, 0], 52: [17.5, 16.5, 56.95, 8.92, 0.13, 0],
    53: [17.5, 16.5, 54.96, 10.87, 0.17, 0], 54: [17.5, 16.5, 52.53, 13.26, 0.21, 0], 55: [17.5, 16.5, 49.56, 16.18, 0.26, 0],
    56: [17.5, 16.5, 45.93, 19.74, 0.33, 0], 57: [17.5, 16.5, 41.5, 24.09, 0.41, 0], 58: [17.5, 16.5, 36.1, 29.39, 0.51, 0],
    59: [17.5, 16.5, 29.51, 35.85, 0.64, 0], 60: [17.5, 16.5, 21.46, 43.74, 0.80, 0],
    61: [17.5, 16.5, 16.5, 48.5, 1, 0], 62: [17.5, 16.5, 16.5, 48.31, 1.19, 0], 63: [17.5, 16.5, 16.5, 48.08, 1.42, 0],
    64: [17.5, 16.5, 16.5, 47.8, 1.69, 0.01], 65: [17.5, 16.5, 16.5, 47.47, 2.01, 0.02], 66: [17.5, 16.5, 16.5, 47.08, 2.39, 0.03],
    67: [17.5, 16.5, 16.5, 46.62, 2.84, 0.04], 68: [17.5, 16.5, 16.5, 46.07, 3.38, 0.05], 69: [17.5, 16.5, 16.5, 45.41, 4.02, 0.07],
    70: [17.5, 16.5, 16.5, 44.63, 4.79, 0.08], 71: [17.5, 16.5, 16.5, 43.7, 5.69, 0.11], 72: [17.5, 16.5, 16.5, 42.59, 6.78, 0.13],
    73: [17.5, 16.5, 16.5, 41.27, 8.06, 0.17], 74: [17.5, 16.5, 16.5, 39.69, 9.6, 0.21], 75: [17.5, 16.5, 16.5, 37.82, 11.42, 0.26],
    76: [17.5, 16.5, 16.5, 35.58, 13.59, 0.33], 77: [17.5, 16.5, 16.5, 32.92, 16.17, 0.41], 78: [17.5, 16.5, 16.5, 29.74, 19.25, 0.51],
    79: [17.5, 16.5, 16.5, 25.96, 22.9, 0.64], 80: [17.5, 16.5, 16.5, 21.46, 27.25, 0.8],
    81: [17.5, 16.5, 16.5, 16.5, 32, 1.00], 82: [17.5, 16.5, 16.5, 16.5, 31.84, 1.16], 83: [17.5, 16.5, 16.5, 16.5, 31.65, 1.35],
    84: [17.5, 16.5, 16.5, 16.5, 31.44, 1.56], 85: [17.5, 16.5, 16.5, 16.5, 31.19, 1.81], 86: [17.5, 16.5, 16.5, 16.5, 30.9, 2.1],
    87: [17.5, 16.5, 16.5, 16.5, 30.56, 2.44], 88: [17.5, 16.5, 16.5, 16.5, 30.17, 2.83], 89: [17.5, 16.5, 16.5, 16.5, 29.72, 3.28],
    90: [17.5, 16.5, 16.5, 16.5, 29.2, 3.8], 91: [17.5, 16.5, 16.5, 16.5, 28.59, 4.41], 92: [17.5, 16.5, 16.5, 16.5, 27.88, 5.12],
    93: [17.5, 16.5, 16.5, 16.5, 27.06, 5.94], 94: [17.5, 16.5, 16.5, 16.5, 26.11, 6.89], 95: [17.5, 16.5, 16.5, 16.5, 25.01, 7.99],
    96: [17.5, 16.5, 16.5, 16.5, 23.73, 9.27], 97: [17.5, 16.5, 16.5, 16.5, 22.25, 10.75], 98: [17.5, 16.5, 16.5, 16.5, 20.53, 12.47],
    99: [17.5, 16.5, 16.5, 16.5, 18.54, 14.46], 100: [17.5, 16.5, 16.5, 16.5, 16.5, 16.5]
};

// ===== 마운트 (data/raw/mounts.js 원본 실측치) =====
// 마운트 레벨 1~50: 레벨별 누적 오픈 수(needed) + 그 레벨에서의 등급 확률(합 1.0)
const mountSummonRates = {
    1: { needed: 2, common: 1.0000 },
    2: { needed: 5, common: 0.995, rare: 0.005 },
    3: { needed: 8, common: 0.9931, rare: 0.0069 },
    4: { needed: 11, common: 0.9905, rare: 0.0095 },
    5: { needed: 14, common: 0.9869, rare: 0.0131 },
    6: { needed: 17, common: 0.9819, rare: 0.0181 },
    7: { needed: 20, common: 0.975, rare: 0.025 },
    8: { needed: 23, common: 0.9655, rare: 0.0345 },
    9: { needed: 26, common: 0.95, rare: 0.05 },
    10: { needed: 29, common: 0.929, rare: 0.07, epic: 0.001 },
    11: { needed: 32, common: 0.9002, rare: 0.098, epic: 0.0018 },
    12: { needed: 35, common: 0.8596, rare: 0.1372, epic: 0.0032 },
    13: { needed: 38, common: 0.8021, rare: 0.1921, epic: 0.0058 },
    14: { needed: 41, common: 0.7206, rare: 0.2689, epic: 0.0105 },
    15: { needed: 44, common: 0.6046, rare: 0.3765, epic: 0.0189 },
    16: { needed: 47, common: 0.4389, rare: 0.5271, epic: 0.034 },
    17: { needed: 50, common: 0.3511, rare: 0.5989, epic: 0.05 },
    18: { needed: 53, common: 0.2809, rare: 0.6481, epic: 0.07, legendary: 0.001 },
    19: { needed: 56, common: 0.2247, rare: 0.6755, epic: 0.098, legendary: 0.0018 },
    20: { needed: 59, common: 0.1798, rare: 0.6798, epic: 0.1372, legendary: 0.0032 },
    21: { needed: 62, common: 0.165, rare: 0.6371, epic: 0.1921, legendary: 0.0058 },
    22: { needed: 65, common: 0.165, rare: 0.5556, epic: 0.2689, legendary: 0.0105 },
    23: { needed: 68, common: 0.165, rare: 0.4396, epic: 0.3765, legendary: 0.0189 },
    24: { needed: 71, common: 0.165, rare: 0.2739, epic: 0.5271, legendary: 0.034 },
    25: { needed: 74, common: 0.165, rare: 0.165, epic: 0.62, legendary: 0.05 },
    26: { needed: 77, common: 0.165, rare: 0.165, epic: 0.599, legendary: 0.07, ultimate: 0.001 },
    27: { needed: 80, common: 0.165, rare: 0.165, epic: 0.5702, legendary: 0.098, ultimate: 0.0018 },
    28: { needed: 83, common: 0.165, rare: 0.165, epic: 0.5296, legendary: 0.1372, ultimate: 0.0032 },
    29: { needed: 86, common: 0.165, rare: 0.165, epic: 0.4721, legendary: 0.1921, ultimate: 0.0058 },
    30: { needed: 89, common: 0.165, rare: 0.165, epic: 0.3906, legendary: 0.2689, ultimate: 0.0105 },
    31: { needed: 92, common: 0.165, rare: 0.165, epic: 0.2746, legendary: 0.3765, ultimate: 0.0189 },
    32: { needed: 95, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.471, ultimate: 0.034 },
    33: { needed: 98, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.455, ultimate: 0.05 },
    34: { needed: 132, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.434, ultimate: 0.07, mythic: 0.001 },
    35: { needed: 166, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.4052, ultimate: 0.098, mythic: 0.0018 },
    36: { needed: 200, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.3646, ultimate: 0.1372, mythic: 0.0032 },
    37: { needed: 234, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.3071, ultimate: 0.1921, mythic: 0.0058 },
    38: { needed: 268, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.2256, ultimate: 0.2689, mythic: 0.0105 },
    39: { needed: 302, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.3211, mythic: 0.0189 },
    40: { needed: 336, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.306, mythic: 0.034 },
    41: { needed: 370, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.29, mythic: 0.05 },
    42: { needed: 404, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.283, mythic: 0.057 },
    43: { needed: 438, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.275, mythic: 0.065 },
    44: { needed: 472, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2659, mythic: 0.0741 },
    45: { needed: 506, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2556, mythic: 0.0844 },
    46: { needed: 540, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2437, mythic: 0.0963 },
    47: { needed: 574, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2303, mythic: 0.1097 },
    48: { needed: 608, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.2149, mythic: 0.1251 },
    49: { needed: 642, common: 0.165, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.1974, mythic: 0.1426 },
    50: { needed: 'MAX', common: 0.175, rare: 0.165, epic: 0.165, legendary: 0.165, ultimate: 0.165, mythic: 0.165 }
};

// 마운트 등급별 스탯 부스트 (%) — 데미지·체력 동일 배율
const mountBoosts = {
    common: 10, rare: 40, epic: 80, legendary: 150, ultimate: 250, mythic: 400
};

// 마운트 이름 목록 (등급별)
// 탈것 로스터 — 등급당 종수를 **펫과 같은 수준**으로 맞춘다 (사용자 지시 2026-08-18
// "탈것 존나 여러 개 뽑았는데 3개만 보인다, 펫처럼 각자로 되게 여러 개 떠야 하는데").
// 중복은 펫과 똑같이 dupes로 합쳐지는 게 정상 규칙이고, 3개만 보인 진짜 원인은 **common이 3종뿐**이라
// 초반 소환이 그 3종으로 수렴한 것이었다(실측: 20회 소환 → 타일 3개·중복 17). 펫 로스터(6/5/5/3/3/3)에
// 맞춰 common 6 · rare 5 · epic 5 · legendary 3 · ultimate 3 · mythic 3 = 25종으로 늘렸다.
// ⚠️ 종을 추가하면 MOUNT_KR·MOUNT_ICONS(gamedata.js)와 Scene3D.MOUNT_FORM_OF(계열)도 같이 채울 것.
const mountNames = {
    common: ['Brown Leaf', 'Lily Leaf', 'Lily Pad', 'Oak Leaf', 'Log Raft', 'Sheep'],
    rare: ['Turtle', 'Crab', 'Brown Horse', 'Dino', 'Boar'],
    epic: ['Pig', 'Goat', 'Camel', 'Elk', 'Panther'],
    legendary: ['Bike', 'Giant Bee', 'Armored Rhino'],
    ultimate: ['Mini Dragon', 'One-Wheel Droid', 'Mech Spider'],
    mythic: ['Hover Board', 'Hover Disk', 'Star Whale']
};

const WINDERS_PER_SUMMON = 50; // 소환 1회당 태엽(클록와인더) 비용
