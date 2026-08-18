// ===== WebAudio 프로시저럴 효과음·음악 (외부 파일 금지 — 전부 코드 합성) =====
// audio-quality-up(사용자 지시 2026-08-18) 전면 개편:
//   음악  — 모드 4종(normal/boss/dungeon/shop) 곡 분화 + 레이어 6종(서브베이스·베이스·디튠 패드·
//           아르페지오·멜로디(옥타브 더블)·퍼커션) + 스윙·박 위계 다이내믹 + 템포 동기 딜레이/합성 리버브.
//   효과음 — 오실레이터 단발 → 레이어드 합성(어택 트랜지언트 + 바디 + 저역 텀프 + 테일/리버브)
//           + 호출마다 피치 랜덤화(반복 청감 피로 완화).
//   버스   — master(SFX)·musicGain(BGM) → 소프트 리미터(DynamicsCompressor) → destination,
//           합성 IR 리버브 센드 공용.
// 검증: tools/probe-audio-quality.js (OfflineAudioContext 로 실코드 경로 렌더 — 레이어 수·대역 분포·
//       다이내믹 레인지·클리핑·모드 분화를 수치로 판정). 개편 전 실측은 TODO 진행 메모 참조.

// ---- 악곡 데이터: 모드별 곡 (bpm · 코드 진행 · 멜로디 A/B · 층별 패턴 플래그) ----
// pad 는 MIDI 3~4화음, arp 는 아르페지오에 쓸 코드 톤(9th 등 색채음 포함), bass 는 근음.
// mel/melB 는 2마디(32스텝) 모티프 — 8마디 루프의 전반 4마디는 mel, 후반은 melB 를 돌려
// 같은 모티프 반복의 지루함을 줄이고, 루프 이음새는 melB 끝이 mel 첫 음으로 해결되게 짠다.
const MUSIC_MODES = {
    // 메인/일반 전투 — C장조 I-V-vi-IV 캐주얼 판타지. 밝고 걷는 템포.
    normal: {
        bpm: 96, swing: 0.10,
        prog: [
            { bass: 48, pad: [60, 64, 67], arp: [60, 64, 67, 71] },  // C  (I, add7 색채)
            { bass: 55, pad: [67, 71, 74], arp: [67, 71, 74, 79] },  // G  (V)
            { bass: 57, pad: [69, 72, 76], arp: [69, 72, 76, 81] },  // Am (vi)
            { bass: 53, pad: [65, 69, 72], arp: [65, 69, 72, 77] },  // F  (IV)
        ],
        mel: { 0: 72, 4: 76, 8: 79, 12: 76, 16: 74, 20: 72, 22: 74, 24: 79, 28: 76, 30: 74 },
        melB: { 0: 76, 4: 79, 8: 84, 12: 81, 16: 79, 20: 76, 22: 79, 24: 74, 26: 76, 28: 72, 30: 74 },
        bassSteps: [0, 8, 14], arpEvery: 2, padType: 'triangle', padLp: 2600, hatEvery: 4, hatOff: 2, kick: false, shaker: false,
    },
    // 보스전 — A단조 i-VI-III-V, 템포 상승 + 킥 + 16분 아르페지오로 긴장.
    boss: {
        bpm: 112, swing: 0,
        prog: [
            { bass: 45, pad: [69, 72, 76], arp: [81, 84, 88, 91] },  // Am (i) — 아르페지오는 고역 질주
            { bass: 41, pad: [65, 69, 72], arp: [77, 81, 84, 89] },  // F  (VI)
            { bass: 48, pad: [64, 67, 72], arp: [76, 79, 84, 88] },  // C  (III)
            { bass: 40, pad: [64, 68, 71], arp: [76, 80, 83, 88] },  // E  (V, 장3도 긴장)
        ],
        mel: { 0: 81, 3: 79, 6: 76, 8: 79, 12: 81, 16: 84, 19: 81, 22: 79, 24: 76, 28: 79, 30: 76 },
        melB: { 0: 84, 3: 83, 6: 81, 8: 79, 12: 81, 14: 83, 16: 84, 20: 88, 24: 84, 28: 83, 30: 81 },
        bassSteps: [0, 2, 4, 6, 8, 10, 12, 14], arpEvery: 1, padType: 'sawtooth', padLp: 1500, hatEvery: 2, hatOff: 1, kick: true, shaker: false,
    },
    // 던전 — D도리안 i-VI-III-VII, 느리고 어두움: 낮은 톱니 패드 + 저역 멜로디 + 깊은 소프트 킥.
    dungeon: {
        bpm: 80, swing: 0.06,
        prog: [
            { bass: 38, pad: [62, 65, 69], arp: [62, 69] },          // Dm (i)
            { bass: 34, pad: [58, 62, 65], arp: [58, 65] },          // Bb (VI)
            { bass: 41, pad: [65, 69, 72], arp: [65, 72] },          // F  (III)
            { bass: 36, pad: [60, 64, 67], arp: [60, 67] },          // C  (VII)
        ],
        mel: { 0: 62, 8: 65, 14: 64, 16: 62, 24: 57, 28: 60 },
        melB: { 0: 65, 8: 69, 14: 67, 16: 65, 24: 64, 28: 62, 30: 61 },
        bassSteps: [0, 8], arpEvery: 8, padType: 'sawtooth', padLp: 900, hatEvery: 8, hatOff: 4, kick: 'soft', shaker: false,
    },
    // 상점 — F장조 maj7/m7 순환, 통통 튀는 스타카토 베이스 + 엇박 콤핑 + 셰이커. 전투 퍼커션 없음.
    shop: {
        bpm: 104, swing: 0.14,
        prog: [
            { bass: 41, pad: [65, 69, 72, 76], arp: [69, 72, 76, 81] },  // Fmaj7
            { bass: 38, pad: [62, 65, 69, 72], arp: [65, 69, 72, 77] },  // Dm7
            { bass: 43, pad: [67, 70, 74, 77], arp: [70, 74, 77, 82] },  // Gm7
            { bass: 36, pad: [64, 67, 70, 72], arp: [67, 70, 72, 76] },  // C7
        ],
        mel: { 0: 77, 6: 76, 8: 74, 12: 72, 16: 74, 20: 77, 24: 76, 28: 72 },
        melB: { 0: 81, 6: 79, 8: 77, 12: 76, 16: 77, 20: 74, 24: 72, 26: 74, 28: 76, 30: 77 },
        bassSteps: [0, 6, 8, 14], arpEvery: 4, arpOff: 2, padType: 'triangle', padLp: 3200, hatEvery: 0, hatOff: 0, kick: false, shaker: true,
    },
};
const MUSIC_STEPS_PER_BAR = 16;      // 16분음표 해상도
const MUSIC_BARS_PER_CHORD = 2;
const MUSIC_LOOP_STEPS = 4 * MUSIC_BARS_PER_CHORD * MUSIC_STEPS_PER_BAR; // 128스텝 = 8마디

const SFX = {
    ctx: null,
    master: null,       // 효과음 버스
    comp: null,         // 소프트 리미터(마스터) — 모든 버스가 여기로 모인다
    _rvbIn: null,       // 합성 리버브 센드 입구

    // 최초 호출 시점에 AudioContext 생성 (브라우저 자동재생 정책상 사용자 입력 이후 유효)
    ensure() {
        if (this.ctx) return this.ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            // 마스터 소프트 리미터 — 레이어가 겹칠 때(전투+음악) 합이 터지는 것을 부드럽게 눌러준다
            this.comp = this.ctx.createDynamicsCompressor();
            this.comp.threshold.value = -12; this.comp.knee.value = 18;
            this.comp.ratio.value = 5; this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
            this.comp.connect(this.ctx.destination);
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.35;
            this.master.connect(this.comp);
            // 합성 IR 리버브(외부 파일 금지 — 지수 감쇠 노이즈로 IR 을 만든다) — 공용 센드 버스
            const conv = this.ctx.createConvolver();
            conv.buffer = this._makeIR(1.4, 2.6);
            const wet = this.ctx.createGain();
            wet.gain.value = 0.18;
            conv.connect(wet); wet.connect(this.comp);
            this._rvbIn = this.ctx.createGain();
            this._rvbIn.gain.value = 1;
            this._rvbIn.connect(conv);
        } catch (e) { /* WebAudio 미지원 환경 — 무음 처리 */ }
        return this.ctx;
    },

    // 지수 감쇠 노이즈 IR — decayPow 를 키우면 꼬리가 빨리 어두워진다(고역이 먼저 죽는 실내 느낌은
    // 뒤로 갈수록 이웃 샘플 평균(1폴 저역)을 더 섞어 근사)
    _makeIR(seconds, decayPow) {
        const sr = this.ctx.sampleRate, n = Math.floor(sr * seconds);
        const buf = this.ctx.createBuffer(1, n, sr);
        const d = buf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < n; i++) {
            const t = i / n;
            const w = (Math.random() * 2 - 1) * Math.pow(1 - t, decayPow);
            lp += (w - lp) * (1 - t * 0.85);      // 꼬리로 갈수록 저역만 남김
            d[i] = lp;
        }
        return buf;
    },

    get on() { return !S || S.sfxOn !== false; },

    resume() {
        const ctx = this.ensure();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    // ---- 합성 프리미티브 ----
    // jitter: 호출마다 주파수를 ±비율로 흔든다(연타 청감 피로 완화). rvb: 리버브 센드 비율.
    tone(freq, dur, opts) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        opts = opts || {};
        const type = opts.type || 'sine', gain = opts.gain || 0.3, delay = opts.delay || 0;
        const j = opts.jitter ? 1 + (Math.random() * 2 - 1) * opts.jitter : 1;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * j, t0);
        if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo * j, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + (opts.attack || 0.012));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(this.master);
        if (opts.rvb && this._rvbIn) { const s = ctx.createGain(); s.gain.value = opts.rvb; g.connect(s); s.connect(this._rvbIn); }
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // 감쇠 노이즈 버스트 — type(lowpass/highpass/bandpass)·filterTo(스윕)·Q 로 톤을 빚는다
    noiseBurst(dur, opts) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        opts = opts || {};
        const gain = opts.gain || 0.3, delay = opts.delay || 0, filterFreq = opts.filterFreq || 1200;
        const t0 = ctx.currentTime + delay;
        const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = opts.type || 'lowpass';
        filt.frequency.setValueAtTime(filterFreq, t0);
        if (opts.filterTo) filt.frequency.exponentialRampToValueAtTime(opts.filterTo, t0 + dur);
        if (opts.Q) filt.Q.value = opts.Q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(filt); filt.connect(g); g.connect(this.master);
        if (opts.rvb && this._rvbIn) { const s = ctx.createGain(); s.gain.value = opts.rvb; g.connect(s); s.connect(this._rvbIn); }
        src.start(t0);
    },

    // 저역 텀프 — 피치가 뚝 떨어지는 사인 바디(타격의 '무게')
    thump(f0, f1, dur, opts) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        opts = opts || {};
        const t0 = ctx.currentTime + (opts.delay || 0);
        const j = 1 + (Math.random() * 2 - 1) * (opts.jitter || 0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f0 * j, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * j), t0 + dur);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(opts.gain || 0.35, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // 어택 트랜지언트 — 아주 짧은 고역 클릭(소리의 '첫 획'. 이게 없으면 전부 물렁하게 들린다)
    click(opts) {
        opts = opts || {};
        this.noiseBurst(0.008, { type: 'highpass', filterFreq: opts.freq || 3000, gain: opts.gain || 0.25, delay: opts.delay || 0 });
    },

    // 금속 링 — 비정수배 부분음 2개(디튠 삼각파)로 '쇠가 운다'를 만든다
    ring(freq, dur, opts) {
        opts = opts || {};
        const g = opts.gain || 0.12, d = opts.delay || 0;
        this.tone(freq, dur, { type: 'triangle', gain: g, delay: d, jitter: 0.02, rvb: opts.rvb || 0.2 });
        this.tone(freq * 1.503, dur * 0.8, { type: 'triangle', gain: g * 0.6, delay: d + 0.005, jitter: 0.02, rvb: opts.rvb || 0.2 });
    },

    // 반짝임 — 고역 사인 짧은 계단(보상·리빌의 '가루')
    sparkle(base, opts) {
        opts = opts || {};
        const n = opts.n || 3, g = opts.gain || 0.07, d0 = opts.delay || 0;
        for (let i = 0; i < n; i++)
            this.tone(base * Math.pow(1.335, i), 0.09, { type: 'sine', gain: g, delay: d0 + i * 0.045, jitter: 0.04, rvb: 0.35 });
    },

    // ---- 게임 효과음 (전부 레이어드: 트랜지언트 + 바디 + 무게 + 테일) ----
    hit(crit) {
        this.click({ freq: crit ? 4200 : 3200, gain: crit ? 0.3 : 0.2 });
        this.noiseBurst(crit ? 0.12 : 0.08, { gain: crit ? 0.4 : 0.28, filterFreq: crit ? 2600 : 1800, filterTo: crit ? 700 : 500 });
        this.thump(crit ? 200 : 170, 65, crit ? 0.11 : 0.08, { gain: crit ? 0.4 : 0.28, jitter: 0.05 });
        if (crit) {
            this.ring(2600, 0.16, { gain: 0.1, delay: 0.004, rvb: 0.25 });
            this.tone(1200, 0.12, { type: 'triangle', gain: 0.16, slideTo: 1800, jitter: 0.04 });
        }
    },

    // 보스 경고 사이렌 — 화면 연출(#boss-warning)과 같은 .42초 박자로 상승/하강 스윕 3회,
    // 그 아래 저역 럼블을 계속 깔고, 1.55초에 보스가 지면을 밟는 서브베이스 임팩트로 닫는다.
    // ⚠️ 박자를 CSS 애니메이션과 맞추는 게 핵심 — 타이밍 상수를 바꾸지 말 것.
    bossSiren() {
        for (let i = 0; i < 3; i++) {
            const d = i * 0.42;
            this.tone(330, 0.2, { type: 'sawtooth', gain: 0.15, delay: d, slideTo: 880, rvb: 0.15 });        // 올림
            this.tone(880, 0.2, { type: 'sawtooth', gain: 0.15, delay: d + 0.2, slideTo: 330, rvb: 0.15 });  // 내림
            this.tone(110, 0.34, { type: 'square', gain: 0.05, delay: d });                                  // 사이렌 아래 배음
        }
        this.noiseBurst(1.5, { gain: 0.11, filterFreq: 130 }); // 지축 럼블
        this.thump(72, 34, 0.5, { gain: 0.42, delay: 1.55 });
        this.noiseBurst(0.42, { gain: 0.32, filterFreq: 700, delay: 1.55, rvb: 0.3 });
    },

    // 모루 타격 — 클릭 + 금속 클랭 2겹 + 스파크 스윕 + 바닥 무게. 마지막 타격은 낮고 길게 '마무리'.
    anvilHit(strong) {
        this.click({ freq: 6000, gain: strong ? 0.3 : 0.22 });
        this.tone(strong ? 1650 : 1950, strong ? 0.2 : 0.12, { type: 'square', gain: strong ? 0.2 : 0.14, slideTo: strong ? 620 : 900, jitter: 0.03 });
        this.tone(strong ? 520 : 660, strong ? 0.26 : 0.16, { type: 'triangle', gain: strong ? 0.16 : 0.1, slideTo: strong ? 300 : 440, jitter: 0.03, rvb: 0.2 });
        this.noiseBurst(strong ? 0.11 : 0.07, { gain: strong ? 0.22 : 0.14, filterFreq: 6200, filterTo: 2400 });
        this.thump(150, 55, strong ? 0.13 : 0.09, { gain: strong ? 0.3 : 0.2, jitter: 0.04 });
    },

    craft() {
        this.click({ freq: 2600, gain: 0.14 });
        this.thump(260, 180, 0.06, { gain: 0.16, jitter: 0.05 });
        this.tone(660, 0.09, { type: 'square', gain: 0.16, jitter: 0.03 });
        this.tone(880, 0.12, { type: 'square', gain: 0.16, delay: 0.06, jitter: 0.03, rvb: 0.12 });
    },

    // 제작 결과 리빌 카드가 튀어나오는 순간 — 시대가 높을수록 음이 높고, 중세 이후는 5도 + 반짝임을 얹는다
    craftReveal(ageIdx) {
        const idx = Math.max(0, ageIdx | 0);
        const base = 560 * Math.pow(1.07, idx);
        this.click({ freq: 3400, gain: 0.12 });
        this.tone(base, 0.13, { type: 'triangle', gain: 0.18, slideTo: base * 1.5, jitter: 0.02, rvb: 0.2 });
        if (idx >= 4) {
            this.tone(base * 1.5, 0.2, { type: 'sine', gain: 0.1, delay: 0.05, slideTo: base * 2, rvb: 0.3 });
            this.sparkle(base * 2, { n: 3, delay: 0.08 });
        }
    },

    levelUp() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const last = i === 3;
            this.tone(f, last ? 0.3 : 0.16, { type: 'triangle', gain: 0.26, delay: i * 0.07, jitter: 0.01, rvb: last ? 0.35 : 0.15 });
            this.tone(f * 2, last ? 0.24 : 0.1, { type: 'sine', gain: 0.08, delay: i * 0.07 + 0.01, rvb: 0.3 }); // 옥타브 광택
        });
        this.sparkle(2093, { n: 4, gain: 0.06, delay: 0.24 });
    },

    gacha(rarity) {
        const hi = rarity === 'legendary' || rarity === 'ultimate' || rarity === 'mythic';
        this.noiseBurst(0.22, { type: 'bandpass', filterFreq: 600, filterTo: hi ? 3400 : 2200, Q: 1.6, gain: 0.14 }); // 휙 감아올리는 바람
        this.tone(440, 0.18, { type: 'sine', gain: 0.22, slideTo: hi ? 1320 : 880, jitter: 0.02, rvb: 0.2 });
        this.tone(660, 0.16, { type: 'triangle', gain: 0.1, delay: 0.08, jitter: 0.03, rvb: 0.25 });
        if (hi) this.sparkle(1760, { n: 4, delay: 0.14 });
    },

    // 소환 결과 팝업 '빛 모임' 구간 — 상승 스윕 + 노이즈 라이저 + 서브 스웰. 최고 등급일수록 높고 길게.
    summonCharge(rarity) {
        const hi = rarity === 'legendary' || rarity === 'ultimate' || rarity === 'mythic';
        this.tone(220, hi ? 0.42 : 0.3, { type: 'triangle', gain: 0.16, slideTo: hi ? 1760 : 880, rvb: 0.2 });
        this.noiseBurst(hi ? 0.4 : 0.26, { type: 'bandpass', filterFreq: 500, filterTo: hi ? 5200 : 3000, Q: 2, gain: 0.09 });
        this.thump(55, 110, hi ? 0.4 : 0.28, { gain: 0.14 }); // 역방향 스웰 느낌의 저역 받침
    },
    // 아이콘 하나가 팝하는 순간 — 등급이 올라갈수록 음이 높아지고, 전설 이상은 5도 + 반짝임을 더 얹는다
    summonReveal(rarity) {
        const idx = Math.max(0, RARITIES.indexOf(rarity));
        const base = 520 * Math.pow(1.09, idx);
        this.click({ freq: 3600, gain: 0.1 });
        this.tone(base, 0.12, { type: 'sine', gain: 0.16, slideTo: base * 1.5, jitter: 0.03, rvb: 0.15 });
        if (idx >= 3) {
            this.tone(base * 1.5, 0.22, { type: 'triangle', gain: 0.11, delay: 0.04, slideTo: base * 2, rvb: 0.25 });
            this.sparkle(base * 2.2, { n: 3, delay: 0.06 });
        }
    },

    // ===== 배경 음악 (설정 팝업 "음악" 토글, UI-SPEC 20번 실동작) =====
    // 외부 파일 없이 프로시저럴로 실제 곡처럼 들리게 합성 — 레이어 6종을 WebAudio 표준 look-ahead
    // 스케줄러(짧은 타이머로 ctx.currentTime 기준 미리 예약)로 루프. sfxOn과 별개 버스.
    // 모드: setMusicMode(Combat 이 normal/boss/dungeon 을 지정) + 상점 모달이 열려 있으면 'shop' 오버레이.
    // 전환은 항상 코드 경계(2마디)에서만 — 곡 중간에 뚝 끊기지 않는다.
    musicTimer: null,
    musicGain: null,
    _musicStep: 0,
    _musicNextTime: 0,
    _musicStepDur: 0,
    musicMode: 'normal',        // 실제 재생 중인 모드
    _combatMode: 'normal',      // Combat 이 지정한 기본 모드 (shop 오버레이가 벗겨지면 여기로 복귀)
    _musicDelay: null, _musicDelaySend: null, _musicRvbSend: null,
    get musicEnabled() { return !S || S.musicOn !== false; },

    // Combat(보스/던전 진입·이탈)이 호출 — 다음 코드 경계에서 자연스럽게 갈아탄다
    setMusicMode(mode) {
        this._combatMode = MUSIC_MODES[mode] ? mode : 'normal';
    },

    // 상점 모달이 열려 있나 — 닫힘 경로가 여러 갈래(닫기 버튼·탭 전환·closeAllTabSurfaces)라
    // 호출부에 심지 않고 코드 경계마다 직접 읽는다(놓치는 경로가 없다).
    _shopOpen() {
        try { return typeof UI !== 'undefined' && UI.els && UI.els.shopModal && !UI.els.shopModal.classList.contains('hidden'); }
        catch (e) { return false; }
    },

    startMusic() {
        if (this.musicTimer || !this.musicEnabled) return;
        const ctx = this.ensure();
        if (!ctx) return;
        if (!this.musicGain) {
            this.musicGain = ctx.createGain();
            this.musicGain.gain.value = 0.16; // 마스터 음악 버스(스펙: 0.1~0.2)
            this.musicGain.connect(this.comp || ctx.destination);
            // 템포 동기 피드백 딜레이(점8분) — 아르페지오·멜로디만 보낸다(베이스를 보내면 저역이 운다)
            this._musicDelay = ctx.createDelay(1.5);
            const fb = ctx.createGain(); fb.gain.value = 0.3;
            const fbLp = ctx.createBiquadFilter(); fbLp.type = 'lowpass'; fbLp.frequency.value = 2400;
            this._musicDelay.connect(fb); fb.connect(fbLp); fbLp.connect(this._musicDelay);
            const wet = ctx.createGain(); wet.gain.value = 0.4;
            this._musicDelay.connect(wet); wet.connect(this.musicGain);
            this._musicDelaySend = ctx.createGain(); this._musicDelaySend.gain.value = 1;
            this._musicDelaySend.connect(this._musicDelay);
            // 음악 → 공용 리버브 센드(패드·멜로디)
            this._musicRvbSend = ctx.createGain(); this._musicRvbSend.gain.value = 1;
            if (this._rvbIn) this._musicRvbSend.connect(this._rvbIn);
        }
        this.musicMode = 'normal';
        this._musicStep = 0;
        this._applyModeTiming('normal');
        this._musicNextTime = ctx.currentTime + 0.05;
        this.musicTimer = setInterval(() => this._musicTick(), 25); // look-ahead: 25ms마다 깨어나 예약 큐를 채움
    },

    stopMusic() {
        if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    },

    toggleMusic() {
        S.musicOn = !S.musicOn;
        if (S.musicOn) this.startMusic(); else this.stopMusic();
        saveGame();
        return S.musicOn;
    },

    _noteFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

    _applyModeTiming(mode) {
        const cfg = MUSIC_MODES[mode];
        this._musicStepDur = 60 / cfg.bpm / 4; // 16분음표 길이(초)
        if (this._musicDelay) this._musicDelay.delayTime.setValueAtTime(this._musicStepDur * 6, this.ctx.currentTime); // 점8분
    },

    // 다음 스케줄 윈도우(현재 시각 + 120ms)까지 필요한 스텝을 모두 정확한 절대 시각으로 예약
    _musicTick() {
        const ctx = this.ctx;
        if (!ctx || !this.musicEnabled) return;
        while (this._musicNextTime < ctx.currentTime + 0.12) {
            this._musicScheduleStep(this._musicStep, this._musicNextTime);
            this._musicNextTime += this._musicStepDur;
            this._musicStep = (this._musicStep + 1) % MUSIC_LOOP_STEPS;
        }
    },

    _musicScheduleStep(step, t0) {
        const chordSteps = MUSIC_BARS_PER_CHORD * MUSIC_STEPS_PER_BAR;
        // 모드 결정은 코드 경계에서만 — 상점 오버레이 > Combat 지정 모드
        if (step % chordSteps === 0) {
            const target = this._shopOpen() ? 'shop' : this._combatMode;
            if (target !== this.musicMode) {
                this.musicMode = target;
                this._applyModeTiming(target);
            }
        }
        const cfg = MUSIC_MODES[this.musicMode];
        const barStep = step % MUSIC_STEPS_PER_BAR;
        const chord = cfg.prog[Math.floor(step / chordSteps) % cfg.prog.length];
        // 스윙 — 16분 엇박을 뒤로 살짝 민다(기계 박자 탈피). 박 위계 액센트로 다이내믹.
        const t = t0 + (step % 2 === 1 ? this._musicStepDur * cfg.swing : 0);
        const accent = barStep === 0 ? 1 : barStep % 8 === 0 ? 0.85 : 0.7;

        // ① 베이스 — 서브(사인) + 윤곽(삼각 스타카토) 2겹
        if (cfg.bassSteps.includes(barStep)) {
            const f = this._noteFreq(chord.bass);
            this._musicOsc(f, 0.42, t, { type: 'sine', gain: 0.5 * accent, attack: 0.008 });
            this._musicOsc(f * 2, 0.18, t, { type: 'triangle', gain: 0.22 * accent, attack: 0.006 });
        }
        if (cfg.kick && barStep === 0) this._musicKick(t, cfg.kick === 'soft');
        // ② 코드 패드 — 코드 전환마다 한 번, 구간 전체 스웰. 성부마다 ±6센트 디튠 2겹 + 저역통과 + 리버브.
        if (step % chordSteps === 0) {
            const dur = chordSteps * this._musicStepDur * 1.03;
            for (const midi of chord.pad) {
                const f = this._noteFreq(midi);
                this._musicOsc(f * 1.0035, dur, t0, { type: cfg.padType, gain: 0.16, attack: dur * 0.3, lp: cfg.padLp, rvb: 0.5 });
                this._musicOsc(f * 0.9965, dur, t0, { type: cfg.padType, gain: 0.16, attack: dur * 0.35, lp: cfg.padLp, rvb: 0.5 });
            }
        }
        // ③ 아르페지오 — 코드 톤 순환(플럭: 짧은 감쇠 + 딜레이 센드). 상점은 엇박 콤핑, 보스는 16분 질주.
        if (cfg.arpEvery && barStep % cfg.arpEvery === (cfg.arpOff || 0) % (cfg.arpEvery || 1)) {
            const arpIdx = Math.floor(step / cfg.arpEvery) % chord.arp.length;
            this._musicOsc(this._noteFreq(chord.arp[arpIdx]), 0.14, t, { type: 'triangle', gain: 0.2 * accent, attack: 0.004, delaySend: 0.5 });
        }
        // ④ 멜로디 — 8마디 루프의 전반은 mel, 후반은 melB(A/B 프레이즈). 본음 + 옥타브 사인 광택.
        const half = step < MUSIC_LOOP_STEPS / 2 ? cfg.mel : cfg.melB;
        const mel = half[step % 32];
        if (mel) {
            const f = this._noteFreq(mel);
            this._musicOsc(f, this.musicMode === 'boss' ? 0.3 : 0.42, t, { type: 'triangle', gain: 0.4, attack: 0.01, delaySend: 0.25, rvb: 0.3 });
            this._musicOsc(f * 2, 0.16, t, { type: 'sine', gain: 0.09, attack: 0.01 });
        }
        // ⑤ 퍼커션 — 하이햇(엇박) / 셰이커(상점 8분). 스윙·액센트 공유.
        if (cfg.hatEvery && barStep % cfg.hatEvery === cfg.hatOff) this._musicHat(t, (this.musicMode === 'boss' ? 0.1 : 0.12) * accent);
        if (cfg.shaker && barStep % 2 === 0) this._musicHat(t, 0.05 * accent, 3800);
    },

    // 킥 — 피치가 아래로 꺾이는 사인파. soft(던전)는 낮고 부드럽게, 보스는 단단하게.
    _musicKick(t0, soft) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(soft ? 110 : 150, t0);
        osc.frequency.exponentialRampToValueAtTime(soft ? 36 : 45, t0 + (soft ? 0.22 : 0.15));
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(soft ? 0.4 : 0.55, t0 + (soft ? 0.015 : 0.008));
        g.gain.exponentialRampToValueAtTime(0.001, t0 + (soft ? 0.3 : 0.22));
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t0); osc.stop(t0 + 0.32);
    },

    // 절대 시각 t0에 정확히 시작하는 음악 노트 — lp(개별 저역통과)·delaySend·rvb 센드 지원
    _musicOsc(freq, dur, t0, opts) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        const attack = Math.max(0.005, opts.attack || 0.01);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(opts.gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        let head = osc;
        if (opts.lp) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = opts.lp;
            osc.connect(f); head = f;
        }
        head.connect(g); g.connect(this.musicGain);
        if (opts.delaySend && this._musicDelaySend) { const s = ctx.createGain(); s.gain.value = opts.delaySend; g.connect(s); s.connect(this._musicDelaySend); }
        if (opts.rvb && this._musicRvbSend) { const s = ctx.createGain(); s.gain.value = opts.rvb; g.connect(s); s.connect(this._musicRvbSend); }
        osc.start(t0); osc.stop(t0 + dur + 0.05);
    },

    // 절대 시각 t0에 정확히 시작하는 여린 하이햇/셰이커(고역통과 노이즈 — freq 로 밝기 조절)
    _musicHat(t0, gain, freq) {
        const ctx = this.ctx;
        const dur = 0.045;
        const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = freq || 5500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(filt); filt.connect(g); g.connect(this.musicGain);
        src.start(t0);
    },
};
