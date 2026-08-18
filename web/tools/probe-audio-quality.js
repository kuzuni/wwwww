// 오디오 품질 실측 — audio-quality-up(사용자 지시 2026-08-18) 판정기 + A/B 렌더러.
// 시각 비평가를 못 쓰는 도메인이라(스샷 불가) '잘 만들었나'의 재료를 수치로 남긴다:
//   레이어 수(스텝당 생성 노드) · 주파수 대역 분포(저/중/고 RMS) · 다이내믹 레인지(윈도 RMS p95/p15)
//   · 클리핑(|s|>0.99 샘플) · 루프 이음새(경계 1ms 최대 샘플 점프가 본문 대비 튀는지).
// OfflineAudioContext 로 실제 게임 코드 경로(SFX.ensure → _musicScheduleStep / 각 효과음 함수)를
// 그대로 태워 렌더한다 — 별도 재현 코드를 두면 게임과 어긋난 것을 재게 된다.
//
// 사용:  node probe-audio-quality.js            → 수치 + 판정
//        node probe-audio-quality.js --wav DIR  → 수치 + DIR 에 22.05kHz 16bit mono WAV 덤프(A/B 청취용)
//
// ⚠️ 함정: ⓐ OfflineAudioContext 는 currentTime 이 렌더 시작 전 0 이라, look-ahead 타이머
//    (`_musicTick`)를 쓰면 한 윈도(120ms)만 예약되고 끝난다 — startMusic() 으로 상태를 세팅한 직후
//    타이머를 걷어내고 `_musicScheduleStep` 을 직접 루프로 돌려 전 구간을 예약할 것.
//    ⓑ `SFX.ensure()` 가 offline ctx 위에 자기 체인을 짓게 하려면 window.AudioContext 를 잠깐
//    off 를 돌려주는 함수로 바꿔치기하고, SFX.ctx/master/musicGain(및 파생 노드 캐시)을 전부
//    null 로 리셋해야 한다 — 안 그러면 죽은 실시간 ctx 노드에 연결돼 무음 렌더가 나온다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const wavIdx = process.argv.indexOf('--wav');
const WAV_DIR = wavIdx > -1 ? path.resolve(process.argv[wavIdx + 1] || '.') : null;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof SFX !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });

    // 한 번의 render(job) — kind: 'music'(mode, seconds) | 'sfx'(calls: [[name, ...args], delaySec])
    const render = (job) => page.evaluate(async (job) => {
        const SR = 22050;
        const dur = job.seconds;
        const off = new OfflineAudioContext(1, Math.ceil(SR * dur), SR);
        // ---- SFX 를 offline ctx 위에 다시 세운다 (버전 무관: 캐시로 보이는 필드 전부 리셋) ----
        const saved = {};
        for (const k of Object.keys(SFX)) { if (SFX[k] && typeof SFX[k] === 'object' && k !== 'els') { saved[k] = SFX[k]; SFX[k] = null; } }
        const savedTimer = SFX.musicTimer; SFX.musicTimer = null;
        const RealAC = window.AudioContext;
        window.AudioContext = function () { return off; };
        // 레이어 수 재료 — 생성 노드 계수
        let oscN = 0, bufN = 0;
        const co = off.createOscillator.bind(off), cb = off.createBufferSource.bind(off);
        off.createOscillator = () => { oscN++; return co(); };
        off.createBufferSource = () => { bufN++; return cb(); };
        try {
            SFX.ensure();
            if (job.kind === 'music') {
                SFX.startMusic();
                if (SFX.musicTimer) { clearInterval(SFX.musicTimer); SFX.musicTimer = null; }
                SFX.setMusicMode(job.mode);
                let guard = 0;
                while (SFX._musicNextTime < dur && guard++ < 20000) {
                    SFX._musicScheduleStep(SFX._musicStep, SFX._musicNextTime);
                    SFX._musicNextTime += SFX._musicStepDur;
                    SFX._musicStep = (SFX._musicStep + 1) % (SFX._loopSteps || 128);
                }
            } else {
                for (const [delay, name, ...args] of job.calls) {
                    // tone()류는 ctx.currentTime(=0)+delay 에 예약된다 — 호출별 delay 는 스케줄용
                    SFX._probeDelay = delay; // (신형이 지원하면 사용) 구형은 아래 setTimeout 불가라 즉시 예약
                    const fn = SFX[name];
                    if (typeof fn === 'function') {
                        // 구형/신형 공통: 함수가 delay 옵션을 안 받으므로 currentTime 오프셋 대신
                        // 각 호출을 서로 다른 시각에 넣기 위해 임시로 master 직전에 지연을 끼울 수 없음 —
                        // 대신 호출 자체를 순서대로 즉시 넣고 구간을 나눠 렌더하지 않는다(몽타주는 겹침 허용).
                        fn.apply(SFX, args);
                    }
                }
            }
            const buf = await off.startRendering();
            const s = buf.getChannelData(0);
            // ---- 수치 ----
            let peak = 0, clip = 0;
            for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; if (a > 0.99) clip++; }
            // 윈도 RMS(50ms) → 다이내믹 레인지
            const win = Math.floor(SR * 0.05), rms = [];
            for (let i = 0; i + win <= s.length; i += win) {
                let e = 0; for (let j = i; j < i + win; j++) e += s[j] * s[j];
                rms.push(Math.sqrt(e / win));
            }
            const sorted = rms.filter(v => v > 1e-5).sort((a, b) => a - b);
            const q = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
            const dynDb = sorted.length ? 20 * Math.log10(q(0.95) / Math.max(1e-6, q(0.15))) : 0;
            // 대역 분포 — 1폴 저역(300Hz)·고역(3kHz) 시간영역 필터
            const a1 = Math.exp(-2 * Math.PI * 300 / SR), a2 = Math.exp(-2 * Math.PI * 3000 / SR);
            let lp1 = 0, lp2 = 0, eL = 0, eM = 0, eH = 0;
            for (let i = 0; i < s.length; i++) {
                lp1 = (1 - a1) * s[i] + a1 * lp1;         // <300Hz
                lp2 = (1 - a2) * s[i] + a2 * lp2;         // <3kHz
                const lo = lp1, hi = s[i] - lp2, mid = lp2 - lp1;
                eL += lo * lo; eM += mid * mid; eH += hi * hi;
            }
            const eT = eL + eM + eH || 1;
            // 루프 이음새(음악만): 마지막 스텝 경계 앞뒤 1ms 최대 점프 vs 본문 중앙 1ms 최대 점프
            let seam = null;
            if (job.kind === 'music' && job.loopAt) {
                const at = Math.floor(job.loopAt * SR), w = Math.floor(SR * 0.001);
                const jump = (c) => { let m = 0; for (let i = Math.max(1, c - w); i < Math.min(s.length, c + w); i++) m = Math.max(m, Math.abs(s[i] - s[i - 1])); return m; };
                seam = { atJump: +jump(at).toFixed(4), midJump: +jump(Math.floor(s.length / 2)).toFixed(4) };
            }
            // WAV(옵션)
            let wav = null;
            if (job.wav) {
                const pcm = new Int16Array(s.length);
                for (let i = 0; i < s.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s[i] * 32767)));
                const bytes = new Uint8Array(44 + pcm.length * 2);
                const dv = new DataView(bytes.buffer);
                const wstr = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
                wstr(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); wstr(8, 'WAVE');
                wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
                dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
                wstr(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
                new Uint8Array(bytes.buffer, 44).set(new Uint8Array(pcm.buffer));
                let b = ''; const CH = 0x8000;
                for (let i = 0; i < bytes.length; i += CH) b += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
                wav = btoa(b);
            }
            return {
                ok: true, oscN, bufN, peak: +peak.toFixed(3), clipPct: +(100 * clip / s.length).toFixed(3),
                dynDb: +dynDb.toFixed(1),
                bands: { lo: +(eL / eT).toFixed(3), mid: +(eM / eT).toFixed(3), hi: +(eH / eT).toFixed(3) },
                seam, wav,
            };
        } finally {
            window.AudioContext = RealAC;
            for (const k in saved) SFX[k] = saved[k];
            SFX.musicTimer = savedTimer;
        }
    }, job);

    const secsFor = (mode) => {
        // 8마디 루프 길이 = 128스텝 × 스텝길이. BPM 을 코드에서 안 읽고 넉넉히 2루프 상한으로 잡는다.
        return mode === 'boss' ? 18 : 22;
    };
    const jobs = [];
    for (const mode of ['normal', 'boss', 'dungeon', 'shop']) jobs.push({ kind: 'music', mode, seconds: secsFor(mode), wav: !!WAV_DIR, name: 'bgm-' + mode });
    jobs.push({
        kind: 'sfx', seconds: 3, wav: !!WAV_DIR, name: 'sfx-montage',
        calls: [[0, 'hit', false], [0, 'hit', true], [0, 'craft'], [0, 'craftReveal', 4], [0, 'levelUp'], [0, 'gacha', 'legendary'], [0, 'summonCharge', 'legendary'], [0, 'summonReveal', 'legendary'], [0, 'anvilHit', true]],
    });

    const out = {};
    for (const j of jobs) {
        const r = await render(j);
        out[j.name] = r;
        if (r && r.wav && WAV_DIR) {
            fs.mkdirSync(WAV_DIR, { recursive: true });
            fs.writeFileSync(path.join(WAV_DIR, j.name + '.wav'), Buffer.from(r.wav, 'base64'));
            delete r.wav;
        }
        console.log(j.name.padEnd(14) + JSON.stringify({ ...r, wav: undefined }));
    }

    // ---- 판정 (audio-quality-up 개편 후 기준 — 개편 전 실측은 항목 진행 메모에 남긴다) ----
    // ⓐ 4개 모드가 전부 소리를 내고(무음 방지) 서로 다른 곡이어야 한다: osc 노드 수·대역 분포가
    //    모드마다 달라야 '화면별 분위기 분화'가 실재하는 것(동일 곡 4벌이면 노드 수가 같게 나온다).
    // ⓑ 레이어 풍부함: normal BGM 이 초당 osc 6+ (베이스·패드 3화음·아르페지오·멜로디만 해도 그 위).
    // ⓒ 클리핑 0.1% 미만(리미터가 일하는지) · 피크 0.999 미만.
    // ⓓ SFX 몽타주가 저·중·고 3대역 모두에 에너지(레이어드 합성 — 트랜지언트 고역 + 바디 중역 + 럼블 저역).
    const M = out;
    const musics = ['bgm-normal', 'bgm-boss', 'bgm-dungeon', 'bgm-shop'].map(k => M[k]);
    const allSound = musics.every(r => r && r.ok && r.peak > 0.05);
    const distinct = new Set(musics.map(r => r && r.oscN)).size === 4;
    const layered = M['bgm-normal'] && M['bgm-normal'].oscN / secsFor('normal') >= 6;
    const noClip = Object.values(M).every(r => r && r.clipPct < 0.1 && r.peak < 0.999);
    const sfx3band = M['sfx-montage'] && ['lo', 'mid', 'hi'].every(b => M['sfx-montage'].bands[b] >= 0.03);
    const okErr = errs.length === 0;
    if (!okErr) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    const pass = allSound && distinct && layered && noClip && sfx3band && okErr;
    console.log((pass ? 'PASS' : 'FAIL')
        + ' — 4모드 발성 ' + (allSound ? 'OK' : 'NG')
        + ' · 모드 분화 ' + (distinct ? 'OK' : 'NG')
        + ' · 레이어 ' + (layered ? 'OK' : 'NG')
        + ' · 클리핑/피크 ' + (noClip ? 'OK' : 'NG')
        + ' · SFX 3대역 ' + (sfx3band ? 'OK' : 'NG')
        + ' · 콘솔 ' + (okErr ? 'OK' : 'NG'));
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
