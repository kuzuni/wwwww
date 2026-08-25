// ===== 유틸리티 =====
const U = {
    now: () => Date.now(),

    /* 앞말의 **받침 유무**로 한국어 조사를 고른다. `U.josa('스킬', '이/가')` → `'이'`.
     *
     * 왜 헬퍼인가: 조사를 문자열에 하드코딩하면 앞말이 변수일 때 **넷 중 하나만 우연히 맞는다** —
     * 승천 팝업이 그랬다(`${LINE_KR[line]}가` 로 박아 `장비가`만 맞고 `스킬가`·`펫가`·`탈것가`가 됐다,
     * slug `ascend-modal-particle`). 앞말이 표에서 오는 자리라면 반드시 이걸 통과시킬 것.
     *
     * ⚠️ **넘길 것은 조사가 실제로 붙는 '머리 명사'다**(괄호 주석이 끼어 있어도). 승천 팝업은
     *    `기존 스킬(장착 포함)이` 꼴이라 렌더된 문자열의 끝 글자는 `)` 인데, 조사는 괄호 앞의
     *    `스킬` 을 따른다 — 끝 글자로 고르면 `펫(…유지)` 이 `가` 로 뒤집힌다.
     *
     * 받침 판정: 한글 음절은 유니코드에서 `0xAC00 + (초성×21 + 중성)×28 + 종성` 이라
     * `(코드−0xAC00) % 28 !== 0` 이면 종성(받침)이 있다. 한글이 아닌 글자로 끝나면(숫자·영문·기호)
     * 판정이 불가능하므로 **받침 없음 쪽**을 돌려준다(기존 문구가 그렇게 읽히고 있었다). */
    josa(word, pair) {
        const [withJong, withoutJong] = String(pair).split('/');
        const s = String(word == null ? '' : word);
        const c = s.charCodeAt(s.length - 1);
        if (!(c >= 0xac00 && c <= 0xd7a3)) return withoutJong;
        return (c - 0xac00) % 28 !== 0 ? withJong : withoutJong;
    },

    // 플레이어 자유 입력(닉네임·채팅)을 innerHTML에 꽂기 전 이스케이프
    escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // 큰 수 표기: 1.2k, 3.4m, 5.6b, 7.8t, 이후 aa/ab/… (Big은 bignum.js의 fmtBig으로 위임)
    // 접미사 소문자 + 꼬리 0 제거는 원본 실측 규칙 — 근거는 bignum.js BIG_UNITS 주석 참조.
    fmt(n) {
        // 세이브를 거쳐 온 Big은 문자열("1.5e300")로 되읽히므로 문자열도 Big 경로로 보낸다
        if (n instanceof Big || typeof n === 'string') return fmtBig(Big.of(n));
        if (n === null || n === undefined || isNaN(n)) return '0';
        n = Math.floor(n);
        const abs = Math.abs(n);
        if (abs < 1000) return String(n);
        // T(1e12) 위로는 접미사 표가 Big 경로에만 있다(aa/ab/…). number 를 계속 1000으로 나누면
        // 접미사가 Qi 에서 끝나 그 위가 전부 Qi 로 눌리고, 1e18 을 넘는 순간 가수가 지수 표기로
        // 바뀌어 "1e+22Qi"·"InfinityQi" 가 화면에 그대로 샌다. 그래서 여기서부터 fmtBig 에 넘긴다.
        if (!(abs < 1e15)) return fmtBig(Big.of(n));   // NaN 이 아닌 Infinity 도 이 가지로 들어온다
        const units = BIG_UNITS;
        // 부호를 먼저 떼고 절댓값으로만 축약한다 — 자릿수 판정이 음수에서 뒤집히지 않게.
        let u = -1, v = abs;
        while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
        // 반올림이 가수를 1000 으로 올리면 단위를 한 칸 올린다(`1000k` 가 아니라 `1m`). 상세는 bigRenorm 주석.
        const r = bigRenorm(v, u + 1);
        return (n < 0 ? '-' : '') + bigTrimZeros(r.body) + bigUnitFor(r.tier);
    },

    // 소수점 보존 표기 (오프라인 보상 수급률·누적량 등 실수 표시용): 1.13, 8.87k, 149.05
    fmtDec(n) {
        if (n instanceof Big || typeof n === 'string') return fmtBig(Big.of(n), 2);
        if (n === null || n === undefined || isNaN(n)) return '0';
        const abs = Math.abs(n);
        if (abs < 1000) return n.toFixed(2);
        if (!(abs < 1e15)) return fmtBig(Big.of(n), 2);   // fmt 와 같은 이유로 T 위는 Big 경로에 위임
        // fmtDec 는 '소수점 보존'이 목적이라 꼬리 0을 남긴다(fmtBig 의 decimals 명시 경로와 같은 규칙).
        const units = BIG_UNITS;
        let u = -1, v = abs;
        while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
        const r = bigRenorm(v, u + 1, 2);   // 반올림 후 재정규화 — `1000.00k` 가 아니라 `1.00m`
        return (n < 0 ? '-' : '') + r.body + bigUnitFor(r.tier);
    },

    // 확률 표기: 소수 둘째 자리까지 반올림하되 꼬리 0 은 떨어낸다 — 원본은 `0%`·`12.5%`지 `0.00%`가 아니다
    // (확률 정보 팝업과 '모든 장비의 목록' 시대 헤더가 같은 규칙을 써야 해서 U 로 올렸다)
    pctTrim(p) { return (parseFloat(Number(p || 0).toFixed(2)) || 0) + '%'; },

    // 시간 단위 라벨은 원본 실측: 일 구간 `4일 2시`(shot-042831 업그레이드 진행바 · 메인 맵 `1일 4시`),
    // 시 구간 `2시 10분`(shot-042110 오프라인 보상) · `13시 30분`(042546 기술 트리) · `8시 27분`(042356 펫 부화).
    // 즉 **앞 단위는 '시간'이 아니라 '시'**다. 분·초 구간은 원본 스샷 30장에 안 나오는데,
    // 위 세 구간이 전부 '단위 + 다음 단위' 꼴이라 기존 `분 초` 표기를 그대로 둔다
    // (원본에 안 보이는 건 '없는 것'이 아니라 '아직 못 본 것'이므로 지어내지 않는다).
    fmtTime(sec) {
        sec = Math.max(0, Math.ceil(sec));
        const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600),
              m = Math.floor(sec % 3600 / 60), s = sec % 60;
        if (d > 0) return `${d}일 ${h}시`;
        if (h > 0) return `${h}시 ${m}분`;
        if (m > 0) return `${m}분 ${s}초`;
        return `${s}초`;
    },

    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: arr => arr[Math.floor(Math.random() * arr.length)],
    chance: p => Math.random() < p,

    // {키: 확률} 객체에서 가중치 추첨 (확률 합이 1 또는 100이어도 동작)
    weightedPick(obj) {
        const entries = Object.entries(obj);
        const total = entries.reduce((s, [, v]) => s + v, 0);
        let r = Math.random() * total;
        for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
        return entries[entries.length - 1][0];
    },

    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,

    // 서브스탯 count개를 SUBSTATS 풀에서 중복 없이 굴림 (장비·펫·마운트 공용 옵션 체계).
    // 원본과 동일하게 값 범위는 등급과 무관한 1%~최대치 — 등급은 굴리는 개수만 정한다.
    rollSubs(count) {
        const pool = [...SUBSTATS];
        const subs = [];
        for (let i = 0; i < count && pool.length; i++) {
            const idx = this.randInt(0, pool.length - 1);
            const [key, label, max] = pool.splice(idx, 1)[0];
            subs.push({ key, label, value: +(this.rand(SUBSTAT_MIN, max).toFixed(1)) });
        }
        return subs;
    },

    // 서브스탯 1개를 표시용 문자열로 (스킬 쿨감만 감소값이라 '-' 부호)
    subText(s) { return `${s.key === 'skillCd' ? '-' : '+'}${s.value}% ${s.label}`; },

    // 서브스탯 풀 범위 표기 — 원본 장비 상세 팝업 형식 ("+1% - 12%", 쿨감만 "-1% - 7%")
    subRangeText(key, max) {
        return key === 'skillCd'
            ? `-${SUBSTAT_MIN}% - ${max}%`
            : `+${SUBSTAT_MIN}% - ${max}%`;
    },

    // subs 배열들을 키별로 합산 (장비·펫·탈것 공용 서브스탯 집계)
    sumSubs(...subsLists) {
        const bag = {};
        for (const [key] of SUBSTATS) bag[key] = 0;
        for (const subs of subsLists) {
            for (const s of (subs || [])) bag[s.key] = (bag[s.key] || 0) + s.value;
        }
        return bag;
    },
};
