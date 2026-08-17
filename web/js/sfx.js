// ===== WebAudio 프로시저럴 효과음 (외부 파일 금지 — 오실레이터/노이즈로 전부 합성) =====

// ---- BGM 악곡 데이터: C장조 캐주얼 판타지 코드 진행(I-V-vi-IV) + 2마디 멜로디 모티프 ----
const MUSIC_BPM = 96;
const MUSIC_STEPS_PER_BAR = 16;      // 16분음표 해상도
const MUSIC_BARS_PER_CHORD = 2;
const MUSIC_PROGRESSION = [          // MIDI 노트 번호 (베이스 1개 + 패드 3화음)
    { bass: 48, pad: [60, 64, 67] }, // C  (I)
    { bass: 55, pad: [67, 71, 74] }, // G  (V)
    { bass: 57, pad: [69, 72, 76] }, // Am (vi)
    { bass: 53, pad: [65, 69, 72] }, // F  (IV)
];
const MUSIC_LOOP_STEPS = MUSIC_PROGRESSION.length * MUSIC_BARS_PER_CHORD * MUSIC_STEPS_PER_BAR; // 128스텝 = 8마디
// 2마디(32스텝) 펜타토닉 멜로디 모티프 — 코드 진행 4개 구간에서 그대로 반복(위에 얹히는 코드가 달라 매번 다르게 들림)
const MUSIC_MELODY = (() => {
    const m = new Array(32).fill(0);
    const notes = { 0: 72, 4: 76, 8: 79, 12: 76, 16: 74, 20: 72, 22: 74, 24: 79, 28: 76, 30: 74 };
    for (const k in notes) m[k] = notes[k];
    return m;
})();

// ---- 보스전 변주: 템포를 올리고 A단조 쪽(i-VI-III-V)으로 틀어 긴장감을 더함 ----
const MUSIC_BPM_BOSS = 112;
const MUSIC_PROGRESSION_BOSS = [
    { bass: 57, pad: [69, 72, 76] }, // Am (i)
    { bass: 53, pad: [65, 69, 72] }, // F  (VI)
    { bass: 48, pad: [60, 64, 67] }, // C  (III)
    { bass: 52, pad: [64, 68, 71] }, // E  (V, 장3도로 긴장 부여)
];
const MUSIC_MELODY_BOSS = (() => {
    const m = new Array(32).fill(0);
    const notes = { 0: 81, 3: 79, 6: 76, 8: 79, 12: 81, 16: 84, 19: 81, 22: 79, 24: 76, 28: 79, 30: 76 };
    for (const k in notes) m[k] = notes[k];
    return m;
})();

const SFX = {
    ctx: null,
    master: null,

    // 최초 호출 시점에 AudioContext 생성 (브라우저 자동재생 정책상 사용자 입력 이후 유효)
    ensure() {
        if (this.ctx) return this.ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.35;
            this.master.connect(this.ctx.destination);
        } catch (e) { /* WebAudio 미지원 환경 — 무음 처리 */ }
        return this.ctx;
    },

    get on() { return !S || S.sfxOn !== false; },

    resume() {
        const ctx = this.ensure();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    tone(freq, dur, opts) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        opts = opts || {};
        const type = opts.type || 'sine', gain = opts.gain || 0.3, delay = opts.delay || 0;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(this.master);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // 감쇠하는 화이트노이즈 버스트(타격감) — 저역통과 필터로 톤 조절
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
        filt.type = 'lowpass'; filt.frequency.value = filterFreq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(filt); filt.connect(g); g.connect(this.master);
        src.start(t0);
    },

    hit(crit) {
        this.noiseBurst(0.09, { gain: crit ? 0.5 : 0.32, filterFreq: crit ? 2600 : 1300 });
        if (crit) this.tone(1200, 0.12, { type: 'triangle', gain: 0.22, slideTo: 1800 });
    },

    // 보스 경고 사이렌 — 화면 연출(#boss-warning)과 같은 .42초 박자로 상승/하강 스윕 3회,
    // 그 아래 저역 럼블을 계속 깔고, 1.55초에 보스가 지면을 밟는 서브베이스 임팩트로 닫는다.
    // 박자를 CSS 애니메이션과 맞추는 게 핵심 — 소리와 점멸이 어긋나면 경보가 아니라 잡음으로 들린다.
    bossSiren() {
        for (let i = 0; i < 3; i++) {
            const d = i * 0.42;
            this.tone(330, 0.2, { type: 'sawtooth', gain: 0.15, delay: d, slideTo: 880 });        // 올림
            this.tone(880, 0.2, { type: 'sawtooth', gain: 0.15, delay: d + 0.2, slideTo: 330 });  // 내림
            this.tone(110, 0.34, { type: 'square', gain: 0.05, delay: d });                       // 사이렌 아래 배음
        }
        this.noiseBurst(1.5, { gain: 0.11, filterFreq: 130 }); // 지축 럼블
        this.tone(72, 0.5, { type: 'sine', gain: 0.4, delay: 1.55, slideTo: 34 });
        this.noiseBurst(0.42, { gain: 0.32, filterFreq: 700, delay: 1.55 });
    },

    // 모루 타격 — 금속 클랭(고음이 빠르게 떨어지고 배음이 남는다) + 짧은 스파크 노이즈.
    // 마지막 타격은 더 세고 낮게 울려 '마무리'로 들린다.
    anvilHit(strong) {
        this.tone(strong ? 1650 : 1950, strong ? 0.2 : 0.12, { type: 'square', gain: strong ? 0.2 : 0.14, slideTo: strong ? 620 : 900 });
        this.tone(strong ? 520 : 660, strong ? 0.26 : 0.16, { type: 'triangle', gain: strong ? 0.16 : 0.1, slideTo: strong ? 300 : 440 });
        this.noiseBurst(strong ? 0.11 : 0.07, { gain: strong ? 0.22 : 0.14, filterFreq: 5200 });
    },

    craft() {
        this.tone(660, 0.09, { type: 'square', gain: 0.2 });
        this.tone(880, 0.12, { type: 'square', gain: 0.2, delay: 0.06 });
    },

    // 제작 결과 리빌 카드가 튀어나오는 순간 — 시대가 높을수록 음이 높고, 중세 이후는 5도를 한 겹 얹는다
    craftReveal(ageIdx) {
        const idx = Math.max(0, ageIdx | 0);
        const base = 560 * Math.pow(1.07, idx);
        this.tone(base, 0.13, { type: 'triangle', gain: 0.18, slideTo: base * 1.5 });
        if (idx >= 4) this.tone(base * 1.5, 0.2, { type: 'sine', gain: 0.1, delay: 0.05, slideTo: base * 2 });
    },

    levelUp() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
            this.tone(f, 0.16, { type: 'triangle', gain: 0.28, delay: i * 0.07 }));
    },

    gacha(rarity) {
        const hi = rarity === 'legendary' || rarity === 'ultimate' || rarity === 'mythic';
        this.tone(440, 0.18, { type: 'sine', gain: 0.25, slideTo: hi ? 1320 : 880 });
        this.noiseBurst(0.15, { gain: 0.1, filterFreq: 4000, delay: 0.02 });
    },

    // 소환 결과 팝업 '빛 모임' 구간 — 상승 스윕 + 얕은 노이즈. 최고 등급이 높을수록 더 높고 길게 감아올린다
    summonCharge(rarity) {
        const hi = rarity === 'legendary' || rarity === 'ultimate' || rarity === 'mythic';
        this.tone(220, hi ? 0.42 : 0.3, { type: 'triangle', gain: 0.16, slideTo: hi ? 1760 : 880 });
        this.noiseBurst(hi ? 0.34 : 0.22, { gain: 0.06, filterFreq: 2600 });
    },
    // 아이콘 하나가 팝하는 순간 — 등급이 올라갈수록 음이 높아지고, 전설 이상은 5도 화음을 한 겹 더 얹는다
    summonReveal(rarity) {
        const idx = Math.max(0, RARITIES.indexOf(rarity));
        const base = 520 * Math.pow(1.09, idx);
        this.tone(base, 0.12, { type: 'sine', gain: 0.17, slideTo: base * 1.5 });
        if (idx >= 3) this.tone(base * 1.5, 0.22, { type: 'triangle', gain: 0.11, delay: 0.04, slideTo: base * 2 });
    },

    // ===== 배경 음악 (설정 팝업 "음악" 토글, UI-SPEC 20번 실동작) =====
    // 외부 파일 없이 프로시저럴로 실제 곡처럼 들리게 합성 — 베이스+코드패드+멜로디+하이햇 4레이어를
    // WebAudio 표준 look-ahead 스케줄러 패턴(짧은 타이머로 ctx.currentTime 기준 미리 예약)으로 루프.
    // sfxOn과 별개 버스(효과음 꺼도 음악은 계속 재생)
    musicTimer: null,
    musicGain: null,
    _musicStep: 0,
    _musicNextTime: 0,
    _musicStepDur: 0,
    musicMode: 'normal',        // 'normal' | 'boss' — Combat이 보스 웨이브 시작/종료 시 전환
    _musicPendingMode: null,    // 코드 전환 경계에서만 실제 반영(마디 중간에 뚝 끊기지 않게)
    get musicEnabled() { return !S || S.musicOn !== false; },

    // 보스전 진입/종료 시 Combat이 호출 — 즉시 바뀌지 않고 다음 코드 전환 시점에 자연스럽게 갈아탐
    setMusicMode(mode) {
        if (mode !== this.musicMode) this._musicPendingMode = mode;
        else this._musicPendingMode = null;
    },

    startMusic() {
        if (this.musicTimer || !this.musicEnabled) return;
        const ctx = this.ensure();
        if (!ctx) return;
        if (!this.musicGain) {
            this.musicGain = ctx.createGain();
            this.musicGain.gain.value = 0.16; // 마스터 음악 버스(스펙: 0.1~0.2)
            this.musicGain.connect(ctx.destination);
        }
        this.musicMode = 'normal';
        this._musicPendingMode = null;
        this._musicStep = 0;
        this._musicStepDur = 60 / MUSIC_BPM / 4; // 16분음표 길이(초)
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
        // 모드 전환은 코드 구간 경계에서만 반영 — 곡 중간에 뚝 끊기지 않음
        if (step % chordSteps === 0 && this._musicPendingMode) {
            if (this._musicPendingMode !== this.musicMode) {
                this.musicMode = this._musicPendingMode;
                this._musicStepDur = 60 / (this.musicMode === 'boss' ? MUSIC_BPM_BOSS : MUSIC_BPM) / 4;
            }
            this._musicPendingMode = null;
        }
        const isBoss = this.musicMode === 'boss';
        const PROG = isBoss ? MUSIC_PROGRESSION_BOSS : MUSIC_PROGRESSION;
        const MEL = isBoss ? MUSIC_MELODY_BOSS : MUSIC_MELODY;
        const barStep = step % MUSIC_STEPS_PER_BAR;
        const chord = PROG[Math.floor(step / chordSteps) % PROG.length];
        // 베이스: 마디 1·3박에 스타카토로 (보스전은 1박에 저음 킥 강조 추가)
        if (barStep === 0 || barStep === 8) {
            this._musicOsc(this._noteFreq(chord.bass), 0.5, t0, { type: 'triangle', gain: isBoss ? 0.6 : 0.5, attack: 0.008 });
        }
        if (isBoss && barStep === 0) this._musicKick(t0);
        // 코드 패드: 코드가 바뀌는 시점(2마디)마다 한 번, 구간 전체를 채우는 길이로 스웰
        if (step % chordSteps === 0) {
            const dur = chordSteps * this._musicStepDur * 1.03;
            for (const midi of chord.pad) {
                this._musicOsc(this._noteFreq(midi), dur, t0, { type: 'sine', gain: isBoss ? 0.34 : 0.3, attack: dur * 0.3 });
            }
        }
        // 멜로디: 2마디 모티프(코드 진행 4구간에 반복 — 코드가 바뀌어 매번 다르게 들림)
        const mel = MEL[step % 32];
        if (mel) this._musicOsc(this._noteFreq(mel), isBoss ? 0.32 : 0.4, t0, { type: 'triangle', gain: 0.45, attack: 0.01 });
        // 퍼커션: 엇박(각 박의 "and")에 여린 하이햇, 보스전은 좀 더 촘촘하게
        if (isBoss ? barStep % 2 === 1 : barStep % 4 === 2) this._musicHat(t0, isBoss ? 0.1 : 0.12);
    },

    // 보스전 전용: 저음 킥(피치가 아래로 꺾이는 사인파) — 마디 첫 박에 타격감을 더함
    _musicKick(t0) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t0);
        osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.15);
        g.gain.setValueAtTime(0.001, t0);
        g.gain.linearRampToValueAtTime(0.55, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t0); osc.stop(t0 + 0.25);
    },

    // 절대 시각 t0에 정확히 시작하는 오실레이터 노트(어택-감쇠 엔벌로프)
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
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t0); osc.stop(t0 + dur + 0.05);
    },

    // 절대 시각 t0에 정확히 시작하는 여린 하이햇(고역통과 필터 노이즈)
    _musicHat(t0, gain) {
        const ctx = this.ctx;
        const dur = 0.045;
        const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 5500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(filt); filt.connect(g); g.connect(this.musicGain);
        src.start(t0);
    },
};
