// ===== 유틸리티 =====
const U = {
    now: () => Date.now(),

    // 플레이어 자유 입력(닉네임·채팅)을 innerHTML에 꽂기 전 이스케이프
    escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // 큰 수 표기: 1.2K, 3.4M, 5.6B, 7.8T, 이후 e표기
    fmt(n) {
        if (n === null || n === undefined || isNaN(n)) return '0';
        n = Math.floor(n);
        const abs = Math.abs(n);
        if (abs < 1000) return String(n);
        const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
        let u = -1, v = n;
        while (Math.abs(v) >= 1000 && u < units.length - 1) { v /= 1000; u++; }
        return (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) + units[u];
    },

    // 소수점 보존 표기 (오프라인 보상 수급률·누적량 등 실수 표시용): 1.13, 8.87k, 149.05
    fmtDec(n) {
        if (n === null || n === undefined || isNaN(n)) return '0';
        const abs = Math.abs(n);
        if (abs < 1000) return n.toFixed(2);
        const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
        let u = -1, v = n;
        while (Math.abs(v) >= 1000 && u < units.length - 1) { v /= 1000; u++; }
        return v.toFixed(2) + units[u];
    },

    fmtTime(sec) {
        sec = Math.max(0, Math.ceil(sec));
        const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600),
              m = Math.floor(sec % 3600 / 60), s = sec % 60;
        if (d > 0) return `${d}일 ${h}시간`;
        if (h > 0) return `${h}시간 ${m}분`;
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

    // 서브스탯 풀 범위 표기 — 원본 장비 상세 팝업 형식 ("+1% - 12%", 쿨감만 "-1% - -7%")
    subRangeText(key, max) {
        return key === 'skillCd'
            ? `-${SUBSTAT_MIN}% - -${max}%`
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
