// ===== 큰 수(Big): 가수+지수 표기 실수 =====
// 왜 BigInt가 아니라 가수/지수인가 (TODO ⑥ '빅인티저 또는 큰수 라이브러리' 중 후자를 택한 이유):
//   · 이 게임의 수치는 1.01^레벨, 등급 배수 1.5/2.2/6.5, 치명타 1.75배, 공속 1.1, 각종 % 처럼
//     '소수 배율'로 쌓인다. BigInt는 정수만 담아서 이걸 표현하지 못하고, Number와 섞으면 TypeError가 난다.
//   · 승천 배수(⑤) 때문에 값이 승천 횟수에 대해 지수적으로 커진다 — 승천 20회면 10^148, 100회면 10^740.
//     BigInt는 그 자릿수를 전부 들고 곱셈이 자릿수의 초선형이라 60fps 전투 루프에서 감당이 안 된다.
//     가수+지수는 자릿수와 무관하게 상수 시간이다.
//   · 정밀도: 가수를 double로 들어 유효숫자 약 15자리를 보존한다. 표시·전투 밸런스에는 충분하고,
//     "정확히 몇 개"가 중요한 값(해머 개수, 티켓 수 등 소량 카운터)은 기존 Number로 남긴다.
// CDN 금지 제약 때문에 외부 라이브러리를 받지 않고 필요한 연산만 직접 구현했다.
//
// 표현: { m, e } — 값 = m × 10^e, m은 [1,10) 또는 0(음수는 m이 음수). 0은 {m:0, e:0}으로 정규화.
const BIG_MAX_E = 1e308;      // 이 이상은 사실상 무한대로 취급(부동소수 지수 한계 근처)
const BIG_ADD_CUTOFF = 17;    // 지수 차가 이만큼 나면 작은 쪽은 유효숫자에 영향을 못 준다

class Big {
    constructor(m, e) {
        this.m = m;
        this.e = e;
        this.norm();
    }

    // 가수를 [1,10)으로 되돌린다. 곱셈·덧셈 결과는 항상 이걸 거친다.
    norm() {
        if (!isFinite(this.m) || this.m === 0) {
            // 가수가 0이거나 계산 중 오버플로우로 Infinity가 되면 0/무한대로 확정
            if (this.m === 0 || isNaN(this.m)) { this.m = 0; this.e = 0; }
            else { this.m = this.m > 0 ? 1 : -1; this.e = BIG_MAX_E; }
            return this;
        }
        const abs = Math.abs(this.m);
        if (abs < 1 || abs >= 10) {
            const shift = Math.floor(Math.log10(abs));
            this.m = this.m / Math.pow(10, shift);
            this.e = this.e + shift;
        }
        // 가수를 유효숫자 13자리로 스냅. 10-3이 6.999999999999999로 남는 식의 부동소수 찌꺼기를
        // 흡수해 정수가 정수로 보이게 한다 (게임 표시·비교가 이 찌꺼기에 걸리면 티가 크다).
        this.m = Math.round(this.m * 1e12) / 1e12;
        // 위 보정·스냅으로 가수가 경계를 넘는 경우 되돌린다
        if (Math.abs(this.m) >= 10) { this.m /= 10; this.e++; }
        else if (this.m !== 0 && Math.abs(this.m) < 1) { this.m *= 10; this.e--; }
        if (this.m === 0) { this.e = 0; return this; }
        if (!isFinite(this.e)) this.e = this.e > 0 ? BIG_MAX_E : -BIG_MAX_E;
        if (this.e > BIG_MAX_E) { this.e = BIG_MAX_E; }
        if (this.e < -BIG_MAX_E) { this.m = 0; this.e = 0; } // 언더플로우는 0으로
        return this;
    }

    // ---- 생성 ----
    // 숫자·문자열·Big 아무거나 받아 Big으로. 저장/로드 경로에서도 이걸 통과시킨다.
    static of(v) {
        if (v instanceof Big) return v;
        if (v === null || v === undefined) return new Big(0, 0);
        if (typeof v === 'number') {
            if (!isFinite(v)) return v > 0 ? new Big(1, BIG_MAX_E) : (v < 0 ? new Big(-1, BIG_MAX_E) : new Big(0, 0));
            return new Big(v, 0);
        }
        if (typeof v === 'bigint') return Big.fromString(v.toString());
        if (typeof v === 'string') return Big.fromString(v);
        if (typeof v === 'object' && typeof v.m === 'number' && typeof v.e === 'number') return new Big(v.m, v.e);
        return new Big(0, 0);
    }

    // "1.234e567" / "12345" / "1.5" 를 모두 받는다. 세이브에서 되읽는 경로.
    static fromString(s) {
        s = String(s).trim();
        if (!s) return new Big(0, 0);
        const i = s.indexOf('e') >= 0 ? s.indexOf('e') : s.indexOf('E');
        if (i >= 0) {
            const m = parseFloat(s.slice(0, i)), e = parseFloat(s.slice(i + 1));
            if (isNaN(m) || isNaN(e)) return new Big(0, 0);
            return new Big(m, e);
        }
        const n = parseFloat(s);
        return isNaN(n) ? new Big(0, 0) : new Big(n, 0);
    }

    static get ZERO() { return new Big(0, 0); }
    static get ONE() { return new Big(1, 0); }

    // 10^x — 지수만 다루므로 x가 얼마든 상수 시간
    static pow10(x) { return new Big(Math.pow(10, x - Math.floor(x)), Math.floor(x)); }

    // ---- 사칙연산 (모두 새 Big 반환, 원본 불변) ----
    add(o) {
        o = Big.of(o);
        if (this.m === 0) return new Big(o.m, o.e);
        if (o.m === 0) return new Big(this.m, this.e);
        const [big, small] = this.e >= o.e ? [this, o] : [o, this];
        const de = big.e - small.e;
        if (de > BIG_ADD_CUTOFF) return new Big(big.m, big.e); // 작은 쪽이 유효숫자 밖
        return new Big(big.m + small.m / Math.pow(10, de), big.e);
    }
    sub(o) { o = Big.of(o); return this.add(new Big(-o.m, o.e)); }
    mul(o) { o = Big.of(o); if (this.m === 0 || o.m === 0) return new Big(0, 0); return new Big(this.m * o.m, this.e + o.e); }
    div(o) {
        o = Big.of(o);
        if (o.m === 0) return new Big(0, 0); // 0으로 나누기는 0으로 (게임 로직상 무한대가 더 위험)
        if (this.m === 0) return new Big(0, 0);
        return new Big(this.m / o.m, this.e - o.e);
    }
    neg() { return new Big(-this.m, this.e); }
    abs() { return new Big(Math.abs(this.m), this.e); }

    // 지수는 실수도 허용 (1.01^99 같은 배율에 그대로 쓴다)
    pow(n) {
        if (this.m === 0) return n === 0 ? new Big(1, 0) : new Big(0, 0);
        if (n === 0) return new Big(1, 0);
        if (this.m < 0) {
            // 음수의 실수 거듭제곱은 정의가 갈리므로 정수 지수만 부호를 살려 처리
            const sign = Math.abs(n % 2) === 1 ? -1 : 1;
            const r = this.abs().pow(n);
            return sign < 0 ? r.neg() : r;
        }
        return Big.pow10(this.log10() * n);
    }
    log10() { return this.m === 0 ? -Infinity : Math.log10(Math.abs(this.m)) + this.e; }
    sqrt() { return this.m < 0 ? new Big(0, 0) : Big.pow10(this.log10() / 2); }

    // ---- 비교 ----
    cmp(o) {
        o = Big.of(o);
        if (this.m === 0 && o.m === 0) return 0;
        if (this.m === 0) return o.m > 0 ? -1 : 1;
        if (o.m === 0) return this.m > 0 ? 1 : -1;
        const s1 = this.m > 0, s2 = o.m > 0;
        if (s1 !== s2) return s1 ? 1 : -1;
        if (this.e !== o.e) return (this.e > o.e) === s1 ? 1 : -1;
        return this.m === o.m ? 0 : ((this.m > o.m) ? 1 : -1);
    }
    gt(o) { return this.cmp(o) > 0; }
    gte(o) { return this.cmp(o) >= 0; }
    lt(o) { return this.cmp(o) < 0; }
    lte(o) { return this.cmp(o) <= 0; }
    eq(o) { return this.cmp(o) === 0; }
    isZero() { return this.m === 0; }
    isPos() { return this.m > 0; }
    isNeg() { return this.m < 0; }
    min(o) { o = Big.of(o); return this.lte(o) ? this : o; }
    max(o) { o = Big.of(o); return this.gte(o) ? this : o; }
    // [a,b]로 자르기 — 체력 비율 등에서 U.clamp 대용
    clamp(a, b) { return this.max(a).min(b); }

    // ---- 변환 ----
    // Number로. 표현 범위를 넘으면 ±Infinity가 아니라 유한 최대값으로 눌러서
    // 호출부(3D 좌표·게이지 폭 등)가 NaN으로 오염되지 않게 한다.
    toNumber() {
        if (this.m === 0) return 0;
        if (this.e > 308) return this.m > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
        if (this.e < -308) return 0;
        return this.m * Math.pow(10, this.e);
    }
    // 비율 계산용: this / o 를 Number로 (둘 다 거대해도 지수 차만 보므로 안전)
    ratioTo(o) {
        o = Big.of(o);
        if (o.m === 0) return 0;
        return this.div(o).toNumber();
    }
    floor() {
        if (this.e >= 15) return new Big(this.m, this.e); // 유효숫자를 넘어서면 이미 정수
        return Big.of(Math.floor(this.toNumber()));
    }
    // 세이브 직렬화 — JSON.stringify가 자동으로 부른다 (BigInt와 달리 문자열로 안전하게 나간다)
    toJSON() { return this.toString(); }
    toString() { return this.m === 0 ? '0' : `${this.m}e${this.e}`; }
}

// ---- 표시 포맷 ----
// 1000 미만은 그대로, 이후 K/M/B/T → aa/ab/ac… (10^15부터 3자리마다) → 한계 넘으면 e표기.
const BIG_UNITS = ['K', 'M', 'B', 'T'];
const BIG_ALPHA = 'abcdefghijklmnopqrstuvwxyz';

function bigUnitFor(tier) {
    // tier: 1=K, 2=M, 3=B, 4=T, 5=aa, 6=ab, …
    if (tier <= BIG_UNITS.length) return BIG_UNITS[tier - 1];
    let i = tier - BIG_UNITS.length - 1; // 0 → aa
    if (i >= BIG_ALPHA.length * BIG_ALPHA.length) return null; // zz 초과는 e표기로
    return BIG_ALPHA[Math.floor(i / BIG_ALPHA.length)] + BIG_ALPHA[i % BIG_ALPHA.length];
}

// 큰 수 표기: 999 / 1.23K / 4.56aa / 1.2e2000
function fmtBig(v, decimals) {
    const b = Big.of(v);
    if (b.m === 0) return '0';
    const neg = b.isNeg();
    const a = b.abs();
    if (a.e < 3) {
        const n = a.toNumber();
        const s = decimals === undefined ? String(Math.floor(n)) : n.toFixed(decimals);
        return neg ? '-' + s : s;
    }
    const tier = Math.floor(a.e / 3);
    const unit = bigUnitFor(tier);
    if (unit === null) return (neg ? '-' : '') + `${a.m.toFixed(2)}e${a.e}`;
    // 가수를 3자리 묶음에 맞춰 되돌린다: 10^(e - 3*tier) 만큼 곱함 → [1,1000)
    const shown = a.m * Math.pow(10, a.e - tier * 3);
    const d = decimals !== undefined ? decimals : (shown >= 100 ? 0 : shown >= 10 ? 1 : 2);
    return (neg ? '-' : '') + shown.toFixed(d) + unit;
}
