// ===== WebAudio 프로시저럴 효과음 (외부 파일 금지 — 오실레이터/노이즈로 전부 합성) =====
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

    craft() {
        this.tone(660, 0.09, { type: 'square', gain: 0.2 });
        this.tone(880, 0.12, { type: 'square', gain: 0.2, delay: 0.06 });
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

    // ===== 배경 음악 (설정 팝업 "음악" 토글, UI-SPEC 20번 실동작) =====
    // 외부 파일 없이 프로시저럴 코드 패드를 반복 재생 — sfxOn과 별개 버스(effOn 꺼도 음악은 계속)
    musicTimer: null,
    musicGain: null,
    get musicEnabled() { return !!(S && S.musicOn); },

    startMusic() {
        if (this.musicTimer || !this.musicEnabled) return;
        const ctx = this.ensure();
        if (!ctx) return;
        if (!this.musicGain) {
            this.musicGain = ctx.createGain();
            this.musicGain.gain.value = 0.05;
            this.musicGain.connect(ctx.destination);
        }
        const chord = [130.81, 164.81, 196.00, 246.94]; // C3-E3-G3-B3 소프트 패드
        const playPad = () => {
            if (!this.musicEnabled) return;
            const t0 = ctx.currentTime;
            chord.forEach(f => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.linearRampToValueAtTime(0.6, t0 + 2);
                g.gain.linearRampToValueAtTime(0.0001, t0 + 7.5);
                osc.connect(g); g.connect(this.musicGain);
                osc.start(t0); osc.stop(t0 + 8);
            });
        };
        playPad();
        this.musicTimer = setInterval(playPad, 8000);
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
};
