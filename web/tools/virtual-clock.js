// 가상 시계 심(shim) — 연출 촬영기·프로브 공용 (slug: skill-fx)
//
// 왜 있는가 — 이 저장소의 연출 촬영기는 rAF 를 끊고 `Scene3D.update(dt)` 를 고정 dt 로 몰아
// **가상 시각**으로 찍는다(소프트웨어 GL 이라 실시간으로 찍으면 420ms 에 1~3프레임밖에 안 돈다).
// 그런데 연출 코드의 층 상당수는 `setTimeout` 으로 예약돼 있고 setTimeout 은 **벽시계**로 터진다.
// 한 프레임 촬영에 실제로 ~800ms 가 걸리므로(evaluate + toDataURL) **560ms 짜리 예약이
// 가상 30ms 프레임에서 이미 발화**한다 — 시트의 '언제'가 전부 앞으로 쏠려, 3박자 타이밍을
// 그 시트로 채점하면 코드가 아니라 촬영기를 채점하게 된다(저장소 함정 ④).
//
// 그래서 촬영 동안에는 setTimeout 을 가로채 **가상 시각 큐**에 넣고, 프레임마다 `pump(가상ms)`
// 로 도달한 것만 순서대로 발화시킨다. 촬영이 끝나면 `VClock.restore()` 로 되돌린다.
//
// 사용(브라우저 컨텍스트에 문자열로 주입):
//   await page.evaluate(VCLOCK_SRC);          // window.VClock 설치
//   await page.evaluate(() => VClock.install());
//   ... 프레임마다 await page.evaluate(t => VClock.pump(t), 가상ms) ...
//
// ⚠️ 심을 걸면 `setTimeout` 이 가상 시각에 묶이므로, **가상 시각을 안 흘리는 대기**(예: 실제
//    `await page.waitForTimeout`)는 심 설치 전에 끝내 둘 것. 안 그러면 아무것도 안 터진다.
const VCLOCK_SRC = `
window.VClock = {
    _on: false, _now: 0, _q: [], _seq: 1, _rst: null, _rct: null,
    install() {
        if (this._on) return;
        this._on = true; this._now = 0; this._q = []; this._seq = 1;
        this._rst = window.setTimeout.bind(window);
        this._rct = window.clearTimeout.bind(window);
        const self = this;
        window.setTimeout = function (fn, ms) {
            const id = self._seq++;
            self._q.push({ id: id, due: self._now + (Number(ms) || 0), delay: (Number(ms) || 0), fn: fn, at: self._now });
            return id;
        };
        window.clearTimeout = function (id) {
            const i = self._q.findIndex(function (p) { return p.id === id; });
            if (i >= 0) self._q.splice(i, 1); else if (self._rct) self._rct(id);
        };
        this.log = [];
    },
    // 가상 시각 t(ms)까지 도달한 예약을 due 순서대로 발화한다.
    // 콜백이 새 예약을 걸 수 있으므로(연쇄 연출) 매 회 큐를 다시 정렬한다.
    pump(t) {
        if (!this._on) return 0;
        this._now = t;
        let n = 0;
        for (;;) {
            this._q.sort(function (a, b) { return a.due - b.due; });
            const p = this._q[0];
            if (!p || p.due > t) break;
            this._q.shift();
            this.log.push({ delay: p.delay, at: p.at, firedAt: t });
            try { p.fn(); } catch (e) { }
            n++;
            if (n > 4000) break;   // 폭주 방지
        }
        return n;
    },
    pending() { return this._q.length; },
    restore() {
        if (!this._on) return;
        window.setTimeout = this._rst; window.clearTimeout = this._rct;
        this._on = false;
        // 남은 예약은 실제 타이머로 넘겨 정리 콜백(노드 제거 등)이 유실되지 않게 한다
        const q = this._q.slice(); this._q = [];
        for (const p of q) { try { this._rst(p.fn, 0); } catch (e) { } }
    },
};
`;
module.exports = { VCLOCK_SRC };
