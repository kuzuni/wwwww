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
const IconGen = {
    // 그리는 해상도. pill(약 14px)~타일(약 44px) 어디에 써도 선명하도록 넉넉히 잡는다.
    SIZE: 128,
    // 2배로 그린 뒤 축소해 계단현상을 없앤다(슈퍼샘플링 배율).
    SUPERSAMPLE: 2,
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
        const S = this.SIZE, SS = this.SUPERSAMPLE;
        const big = document.createElement('canvas');
        big.width = big.height = S * SS;
        const bctx = big.getContext('2d');
        bctx.lineJoin = 'round';
        bctx.lineCap = 'round';
        try { fn.call(this, bctx, S * SS, opt || {}); } catch (e) { console.warn('[IconGen] draw fail', name, e); }
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(big, 0, 0, S, S);
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
    // #rrggbb 를 밝기 조정
    _shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
        return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
    },

    draw: {
        // ---- 코인: 금화 동전 (테두리 세레이션 + 왕관 음각 + 광택) ----
        coin(ctx, S) {
            const G = IconGen, cx = S / 2, cy = S / 2, R = S * 0.465;

            // 접지 그림자
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(cx, cy + R * 0.94, R * 0.72, R * 0.16, 0, 0, Math.PI * 2);
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.fill();
            ctx.restore();

            // ① 세레이션(밀링) 테두리 — 톱니 40개
            const N = 26, rOut = R, rIn = R * 0.93;   // 밀링 피치를 굵게 — 40개는 14px에서 뭉개져 링이 흐려진다
            ctx.beginPath();
            for (let i = 0; i < N * 2; i++) {
                const a = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 ? rIn : rOut;
                const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = G._lin(ctx, cx - R, cy - R, cx + R, cy + R,
                [[0, '#ffe9a3'], [0.45, '#d99414'], [1, '#7a4a06']]);
            ctx.fill();

            // ② 본체 디스크
            const disc = () => { ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); };
            disc();
            ctx.fillStyle = G._rad(ctx, cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, rIn * 1.15,
                [[0, '#fff6cf'], [0.3, '#ffd75e'], [0.68, '#e8a412'], [1, '#a2650a']]);
            ctx.fill();

            // ③ 테두리 링 베벨 (위쪽 밝게 / 아래쪽 어둡게)
            ctx.save();
            ctx.lineWidth = S * 0.045;
            ctx.beginPath();
            ctx.arc(cx, cy, rIn - ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.strokeStyle = G._lin(ctx, cx, cy - R, cx, cy + R,
                [[0, 'rgba(255,255,255,.72)'], [0.5, 'rgba(255,220,130,.18)'], [1, 'rgba(120,68,4,.62)']]);
            ctx.stroke();
            ctx.restore();

            // ④ 안쪽 면(음각) — 살짝 파인 느낌
            const face = () => ctx.arc(cx, cy, rIn * 0.78, 0, Math.PI * 2);
            ctx.beginPath();
            face();
            ctx.fillStyle = G._rad(ctx, cx - R * 0.2, cy - R * 0.25, R * 0.05, cx, cy, rIn * 0.9,
                [[0, '#ffe98f'], [1, '#d18f0d']]);
            ctx.fill();
            G._innerShadow(ctx, face, 'rgba(96,56,4,.7)', S * 0.045, 0, S * 0.02);
            // 음각 경계의 얇은 하이라이트(아래쪽에 빛이 고이는 느낌)
            ctx.beginPath();
            ctx.arc(cx, cy, rIn * 0.78, Math.PI * 0.12, Math.PI * 0.88);
            ctx.lineWidth = S * 0.014;
            ctx.strokeStyle = 'rgba(255,240,190,.45)';
            ctx.stroke();

            // ⑤ 왕관 문양 음각 (이 게임의 코인 표기가 👑 이므로 정체성 유지)
            const cw = S * 0.44, ch = S * 0.30, bx = cx - cw / 2, by = cy - ch * 0.46;
            const crown = () => {
                ctx.beginPath();
                ctx.moveTo(bx, by + ch * 0.28);
                ctx.lineTo(bx + cw * 0.22, by + ch * 0.72);
                ctx.lineTo(bx + cw * 0.5, by);
                ctx.lineTo(bx + cw * 0.78, by + ch * 0.72);
                ctx.lineTo(bx + cw, by + ch * 0.28);
                ctx.lineTo(bx + cw * 0.9, by + ch * 1.02);
                ctx.lineTo(bx + cw * 0.1, by + ch * 1.02);
                ctx.closePath();
            };
            // 엠보싱: 아래쪽에 어두운 판 + 위쪽에 밝은 판을 겹쳐 '찍어낸 부조'로 보이게 한다.
            // (선 각인만으로는 14px에서 왕관이 통째로 소멸한다)
            ctx.save();
            ctx.translate(0, S * 0.018);
            crown();
            ctx.fillStyle = 'rgba(104,58,3,.85)';
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.translate(0, -S * 0.008);
            crown();
            ctx.fillStyle = G._lin(ctx, cx, by, cx, by + ch, [[0, '#fffdf2'], [1, '#ffca3a']]);
            ctx.fill();
            ctx.restore();
            // 왕관 보석 3알 — 각각 실제 첨두 꼭짓점 위에 얹는다
            // (셋을 같은 y에 두면 가운데 알이 중앙 첨두에서 아래로 밀려 비대칭으로 보인다)
            [[0.0, ch * 0.28], [0.5, 0], [1.0, ch * 0.28]].forEach(([fx, fy]) => {
                ctx.beginPath();
                ctx.arc(bx + cw * fx, by + fy - S * 0.012, S * 0.026, 0, Math.PI * 2);
                ctx.fillStyle = '#fffdf0';
                ctx.fill();
                ctx.lineWidth = S * 0.008;
                ctx.strokeStyle = 'rgba(104,58,3,.5)';
                ctx.stroke();
            });

            // ⑥ 스펙큘러 — 좌상단 넓은 광택 + 우하단 림라이트
            ctx.save();
            disc();
            ctx.clip();
            ctx.beginPath();
            ctx.ellipse(cx - R * 0.36, cy - R * 0.44, R * 0.44, R * 0.24, -0.6, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, cx - R * 0.36, cy - R * 0.44, 0, cx - R * 0.36, cy - R * 0.44, R * 0.44,
                [[0, 'rgba(255,255,255,.85)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fill();
            ctx.lineWidth = S * 0.03;
            ctx.beginPath();
            ctx.arc(cx, cy, rIn * 0.98, Math.PI * 0.15, Math.PI * 0.6);
            ctx.strokeStyle = 'rgba(255,247,214,.5)';
            ctx.stroke();
            ctx.restore();

            // ⑦ 외곽선
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.995, 0, Math.PI * 2);
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(62,34,2,.75)';
            ctx.stroke();
        },

        // ---- 젬: 컷 보석 (파셋 면 + 굴절 하이라이트) ----
        gem(ctx, S, o) {
            const G = IconGen;
            const base = o.tint || '#e5352b';
            const TIP = [0.50, 0.93], TL = [0.30, 0.24], TR = [0.70, 0.24];
            const GL = [0.08, 0.46], GR = [0.92, 0.46];
            const body = [TL, TR, GR, TIP, GL];

            // 아래쪽 광채(보석이 빛을 흘리는 느낌)
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = G._rad(ctx, 0.5 * S, 0.55 * S, 0, 0.5 * S, 0.55 * S, 0.52 * S,
                [[0, G._shade(base, 0.35)], [1, 'rgba(0,0,0,0)']]);
            ctx.fillRect(0, 0, S, S);
            ctx.restore();

            // 본체
            G._poly(ctx, body, S);
            ctx.fillStyle = G._lin(ctx, 0.2 * S, 0.2 * S, 0.8 * S, 0.9 * S,
                [[0, G._shade(base, 0.42)], [0.45, base], [1, G._shade(base, -0.55)]]);
            ctx.fill();

            ctx.save();
            G._poly(ctx, body, S);
            ctx.clip();

            // 파빌리온(아래) 파셋 — 거들 위 5점에서 팁으로 모임
            const gy = 0.46;
            const pav = [[0.08, 0.30, 0.10], [0.30, 0.50, -0.20], [0.50, 0.70, 0.22], [0.70, 0.92, -0.30]];
            pav.forEach(([x0, x1, a]) => {
                G._poly(ctx, [[x0, gy], [x1, gy], TIP], S);
                ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`;
                ctx.fill();
            });

            // 크라운(위) 파셋
            G._poly(ctx, [GL, [0.30, gy], TL], S);
            ctx.fillStyle = 'rgba(0,0,0,.16)';
            ctx.fill();
            G._poly(ctx, [[0.70, gy], GR, TR], S);
            ctx.fillStyle = 'rgba(255,255,255,.26)';
            ctx.fill();
            // 테이블(맨 위 평면) — 가장 밝게
            G._poly(ctx, [TL, TR, [0.70, gy], [0.30, gy]], S);
            ctx.fillStyle = G._lin(ctx, 0, 0.24 * S, 0, gy * S,
                [[0, 'rgba(255,255,255,.60)'], [1, 'rgba(255,255,255,.10)']]);
            ctx.fill();

            // 거들 라인
            ctx.beginPath();
            ctx.moveTo(GL[0] * S, gy * S);
            ctx.lineTo(GR[0] * S, gy * S);
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(255,255,255,.42)';
            ctx.stroke();

            // 굴절 하이라이트 — 테이블 위 사선 스트릭
            ctx.beginPath();
            ctx.moveTo(0.34 * S, 0.28 * S);
            ctx.lineTo(0.52 * S, 0.28 * S);
            ctx.lineTo(0.44 * S, 0.42 * S);
            ctx.lineTo(0.32 * S, 0.42 * S);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,.72)';
            ctx.fill();
            ctx.restore();

            // 외곽선 — 색조에서 파생시킨다(고정 적갈색을 쓰면 청색 젬에 루비 테두리가 남는다).
            // 밝은 배경(회색 pill·흰 카드)에서도 실루엣이 살도록 충분히 어둡게.
            G._poly(ctx, body, S);
            ctx.lineWidth = S * 0.032;
            ctx.strokeStyle = G._shade(base, -0.78);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(TL[0] * S, TL[1] * S);
            ctx.lineTo(TR[0] * S, TR[1] * S);
            ctx.lineWidth = S * 0.024;
            ctx.strokeStyle = 'rgba(255,255,255,.8)';
            ctx.stroke();

            // 반짝임 — 실루엣 밖으로 삐져나오지 않게 본체로 클립한다
            ctx.save();
            G._poly(ctx, body, S);
            ctx.clip();
            const spark = (x, y, r, a) => {
                ctx.save();
                ctx.globalAlpha = a;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * .18, y - r * .18, x + r, y);
                ctx.quadraticCurveTo(x + r * .18, y + r * .18, x, y + r);
                ctx.quadraticCurveTo(x - r * .18, y + r * .18, x - r, y);
                ctx.quadraticCurveTo(x - r * .18, y - r * .18, x, y - r);
                ctx.fill();
                ctx.restore();
            };
            spark(0.70 * S, 0.36 * S, S * 0.095, 0.95);
            spark(0.32 * S, 0.62 * S, S * 0.05, 0.6);
            ctx.restore();
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
            const cx = S * 0.5, cy = S * 0.565, w = S * 0.305;
            const hTop = S * 0.455, hBot = S * 0.375, bot = cy + hBot;
            const path = () => {
                ctx.beginPath();
                for (let i = 0; i <= 96; i++) {
                    const t = (i / 96) * Math.PI * 2;
                    const cs = Math.cos(t), up = Math.max(0, cs);
                    const rx = w * (1 - 0.24 * up * up);          // 위로 갈수록 좁아짐
                    const ry = cs > 0 ? hTop : hBot;
                    const x = cx + Math.sin(t) * rx, y = cy - cs * ry;
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.closePath();
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
            ctx.fillStyle = G._rad(ctx, cx - w * 0.42, S * 0.30, S * 0.02, cx, S * 0.55, S * 0.56,
                [[0, G._shade(base, 0.55)], [0.42, base], [1, G._shade(base, -0.5)]]);
            ctx.fill();

            ctx.save();
            path();
            ctx.clip();
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
                [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.24)']]);
            ctx.fillRect(0, S * 0.66, S, S * 0.34);
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

            // 밝은 배경(회색 pill·흰 카드)에서도 실루엣이 살도록 키라인을 색조에서 파생시켜 진하게
            path();
            ctx.lineWidth = S * 0.032;
            ctx.strokeStyle = G._shade(base, -0.72);
            ctx.stroke();
        },

        // ---- 티켓: 소환권 (노치 + 절취선 + 별) ----
        ticket(ctx, S) {
            const G = IconGen;
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(-0.14);
            ctx.translate(-S / 2, -S / 2);
            const x = S * 0.08, y = S * 0.26, w = S * 0.84, h = S * 0.48, r = S * 0.06;
            const nr = S * 0.075, nx = x + w * 0.34;

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
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            path();
            ctx.fill('evenodd');
            ctx.restore();

            path();
            ctx.fillStyle = G._lin(ctx, 0, y, 0, y + h,
                [[0, '#ffe9a8'], [0.28, '#f6c343'], [0.62, '#e09a12'], [1, '#a4650a']]);
            ctx.fill('evenodd');

            ctx.save();
            path();
            ctx.clip('evenodd');
            // 상단 하이라이트 / 하단 턱
            ctx.fillStyle = 'rgba(255,255,255,.55)';
            ctx.fillRect(x, y, w, h * 0.10);
            ctx.fillStyle = 'rgba(90,52,4,.35)';
            ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
            // 절취선
            ctx.setLineDash([S * 0.028, S * 0.026]);
            ctx.lineWidth = S * 0.016;
            ctx.strokeStyle = 'rgba(120,70,6,.6)';
            ctx.beginPath();
            ctx.moveTo(nx, y + nr * 1.2);
            ctx.lineTo(nx, y + h - nr * 1.2);
            ctx.stroke();
            ctx.setLineDash([]);
            // 오른쪽 본권의 문자 라인 (정보 표기 느낌)
            ctx.fillStyle = 'rgba(120,70,6,.32)';
            ctx.fillRect(x + w * 0.46, y + h * 0.30, w * 0.42, h * 0.09);
            ctx.fillRect(x + w * 0.46, y + h * 0.50, w * 0.30, h * 0.09);
            ctx.restore();

            // 왼쪽 스텁의 별
            const sx = x + w * 0.17, sy = y + h * 0.5, sr = S * 0.10;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                const rr = i % 2 ? sr * 0.46 : sr;
                const px = sx + Math.cos(a) * rr, py = sy + Math.sin(a) * rr;
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = G._lin(ctx, 0, sy - sr, 0, sy + sr, [[0, '#fffdf2'], [1, '#ffd977']]);
            ctx.fill();
            ctx.lineWidth = S * 0.014;
            ctx.strokeStyle = 'rgba(120,70,6,.55)';
            ctx.stroke();

            path();
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(74,42,2,.75)';
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
    },
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
        // ② 본체 밝은 채움
        ctx.beginPath(); pathFn(ctx, S);
        ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.9,
            [[0, '#ffffff'], [0.5, G._shade(color, 0.62)], [1, G._shade(color, 0.08)]]);
        ctx.fill();
        // ③ 어두운 외곽선 — 색조 파생. 밝은 등급색 오브(노랑·연두)에서도 실루엣이 살도록.
        ctx.beginPath(); pathFn(ctx, S);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.lineWidth = S * 0.038;
        ctx.strokeStyle = G._shade(color, -0.64);
        ctx.stroke();
        // ④ 상단 하이라이트(클립)
        ctx.save();
        ctx.beginPath(); pathFn(ctx, S); ctx.clip();
        ctx.fillStyle = G._lin(ctx, 0, S * 0.12, 0, S * 0.52,
            [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(0, S * 0.08, S, S * 0.46);
        ctx.restore();
    }

    // ---- 모티프 경로(정규화 0..1 좌표, beginPath 없이 서브패스만) ----
    const P = {
        sword(ctx, S) {                                  // 강타 — 위로 선 검
            ctx.moveTo(x(.5, S), y(.07, S)); ctx.lineTo(x(.575, S), y(.30, S));
            ctx.lineTo(x(.55, S), y(.60, S)); ctx.lineTo(x(.45, S), y(.60, S));
            ctx.lineTo(x(.425, S), y(.30, S)); ctx.closePath();
            ctx.moveTo(x(.28, S), y(.595, S)); ctx.lineTo(x(.72, S), y(.595, S));
            ctx.lineTo(x(.72, S), y(.665, S)); ctx.lineTo(x(.28, S), y(.665, S)); ctx.closePath();
            ctx.moveTo(x(.47, S), y(.665, S)); ctx.lineTo(x(.53, S), y(.665, S));
            ctx.lineTo(x(.53, S), y(.855, S)); ctx.lineTo(x(.47, S), y(.855, S)); ctx.closePath();
            ctx.moveTo(x(.5, S) + S * .055, y(.905, S)); ctx.arc(x(.5, S), y(.905, S), S * .055, 0, Math.PI * 2);
        },
        axe(ctx, S) {                                    // 처형 — 전투 도끼
            ctx.moveTo(x(.455, S), y(.30, S)); ctx.lineTo(x(.545, S), y(.30, S));
            ctx.lineTo(x(.545, S), y(.92, S)); ctx.lineTo(x(.455, S), y(.92, S)); ctx.closePath();
            ctx.moveTo(x(.19, S), y(.36, S));
            ctx.quadraticCurveTo(x(.5, S), y(.02, S), x(.81, S), y(.36, S));
            ctx.quadraticCurveTo(x(.62, S), y(.31, S), x(.56, S), y(.42, S));
            ctx.quadraticCurveTo(x(.5, S), y(.31, S), x(.44, S), y(.42, S));
            ctx.quadraticCurveTo(x(.38, S), y(.31, S), x(.19, S), y(.36, S)); ctx.closePath();
        },
        whirl(ctx, S) {                                  // 회오리 베기 — 소용돌이 2엽
            const cx = .5 * S, cy = .5 * S, ro = .40 * S, ri = .18 * S;
            for (let k = 0; k < 2; k++) {
                const a0 = k * Math.PI - 0.2, a1 = a0 + Math.PI * 0.92;
                ctx.moveTo(cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri);
                ctx.arc(cx, cy, ri, a0, a1, false);
                ctx.lineTo(cx + Math.cos(a1) * ro, cy + Math.sin(a1) * ro);
                ctx.arc(cx, cy, ro, a1, a0, true);
                ctx.closePath();
            }
        },
        cross(ctx, S) {                                  // 응급 처치 — 십자
            const lo = .18, hi = .82, a = .385, b = .615;
            ctx.moveTo(x(a, S), y(lo, S)); ctx.lineTo(x(b, S), y(lo, S)); ctx.lineTo(x(b, S), y(a, S));
            ctx.lineTo(x(hi, S), y(a, S)); ctx.lineTo(x(hi, S), y(b, S)); ctx.lineTo(x(b, S), y(b, S));
            ctx.lineTo(x(b, S), y(hi, S)); ctx.lineTo(x(a, S), y(hi, S)); ctx.lineTo(x(a, S), y(b, S));
            ctx.lineTo(x(lo, S), y(b, S)); ctx.lineTo(x(lo, S), y(a, S)); ctx.lineTo(x(a, S), y(a, S)); ctx.closePath();
        },
        flame(ctx, S) {                                  // 화염구 — 불꽃
            ctx.moveTo(x(.5, S), y(.05, S));
            ctx.bezierCurveTo(x(.84, S), y(.36, S), x(.72, S), y(.68, S), x(.5, S), y(.93, S));
            ctx.bezierCurveTo(x(.28, S), y(.68, S), x(.16, S), y(.36, S), x(.5, S), y(.05, S));
            ctx.closePath();
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
            ctx.moveTo(x(.5, S), y(.07, S)); ctx.lineTo(x(.69, S), y(.34, S)); ctx.lineTo(x(.565, S), y(.34, S));
            ctx.lineTo(x(.565, S), y(.80, S)); ctx.lineTo(x(.435, S), y(.80, S)); ctx.lineTo(x(.435, S), y(.34, S));
            ctx.lineTo(x(.31, S), y(.34, S)); ctx.closePath();
            ctx.moveTo(x(.435, S), y(.70, S)); ctx.lineTo(x(.29, S), y(.92, S)); ctx.lineTo(x(.375, S), y(.70, S)); ctx.closePath();
            ctx.moveTo(x(.565, S), y(.70, S)); ctx.lineTo(x(.71, S), y(.92, S)); ctx.lineTo(x(.625, S), y(.70, S)); ctx.closePath();
        },
        horn(ctx, S) {                                   // 전투의 함성 — 메가폰 + 음파
            ctx.moveTo(x(.20, S), y(.40, S)); ctx.lineTo(x(.60, S), y(.18, S));
            ctx.lineTo(x(.60, S), y(.82, S)); ctx.lineTo(x(.20, S), y(.60, S)); ctx.closePath();
            ctx.moveTo(x(.12, S), y(.43, S)); ctx.lineTo(x(.20, S), y(.40, S));
            ctx.lineTo(x(.20, S), y(.60, S)); ctx.lineTo(x(.12, S), y(.57, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.30, S)); ctx.lineTo(x(.86, S), y(.24, S)); ctx.lineTo(x(.80, S), y(.40, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.70, S)); ctx.lineTo(x(.86, S), y(.76, S)); ctx.lineTo(x(.80, S), y(.60, S)); ctx.closePath();
        },
        meteor(ctx, S) {                                 // 메테오 — 꼬리 달린 운석
            const cx = .62, cy = .46, r = .21;
            ctx.moveTo(x(cx, S) + r * S, y(cy, S)); ctx.arc(x(cx, S), y(cy, S), r * S, 0, Math.PI * 2);
            const streak = (sx, sy, len, w) => {
                ctx.moveTo(x(sx, S), y(sy, S));
                ctx.lineTo(x(sx - len, S), y(sy - len, S));
                ctx.lineTo(x(sx - len + w, S), y(sy - len + w * 1.6, S)); ctx.closePath();
            };
            streak(cx - .12, cy - .10, .30, .07);
            streak(cx - .16, cy + .04, .24, .06);
            streak(cx - .02, cy - .17, .22, .06);
        },
        bolt(ctx, S) {                                   // 낙뢰 — 번개
            ctx.moveTo(x(.58, S), y(.05, S)); ctx.lineTo(x(.30, S), y(.52, S)); ctx.lineTo(x(.47, S), y(.52, S));
            ctx.lineTo(x(.36, S), y(.95, S)); ctx.lineTo(x(.72, S), y(.40, S)); ctx.lineTo(x(.53, S), y(.40, S));
            ctx.lineTo(x(.66, S), y(.05, S)); ctx.closePath();
        },
        sparkle(ctx, S) {                                // 축복 — 4각 반짝임
            const cx = .5, cy = .48, R = .44, c = .11;
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
            sm(.82, .22, .085); sm(.20, .78, .06);
        },
        shield(ctx, S) {                                 // 성역 — 방패
            ctx.moveTo(x(.5, S), y(.09, S)); ctx.lineTo(x(.83, S), y(.22, S)); ctx.lineTo(x(.81, S), y(.55, S));
            ctx.quadraticCurveTo(x(.72, S), y(.82, S), x(.5, S), y(.93, S));
            ctx.quadraticCurveTo(x(.28, S), y(.82, S), x(.19, S), y(.55, S)); ctx.lineTo(x(.17, S), y(.22, S)); ctx.closePath();
        },
        halo(ctx, S) {                                   // 신성한 가호 — 후광 링 + 날개
            const cx = .5 * S, cy = .44 * S, ro = .35 * S, ri = .20 * S;
            ctx.moveTo(cx + ro, cy); ctx.arc(cx, cy, ro, 0, Math.PI * 2, false);
            ctx.moveTo(cx + ri, cy); ctx.arc(cx, cy, ri, 0, Math.PI * 2, true);
            ctx.moveTo(x(.30, S), y(.76, S)); ctx.lineTo(x(.5, S), y(.66, S)); ctx.lineTo(x(.42, S), y(.90, S)); ctx.closePath();
            ctx.moveTo(x(.70, S), y(.76, S)); ctx.lineTo(x(.5, S), y(.66, S)); ctx.lineTo(x(.58, S), y(.90, S)); ctx.closePath();
        },
        burst(ctx, S) {                                  // 초신성 — 8각 폭발
            const cx = .5 * S, cy = .5 * S, R = .47 * S, r = .17 * S, N = 8;
            for (let i = 0; i < N * 2; i++) {
                const a = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R;
                const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
                i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.closePath();
        },
        spear(ctx, S) {                                  // 공허의 창 / 신의 창 — 창(세로)
            ctx.moveTo(x(.5, S), y(.05, S));
            ctx.quadraticCurveTo(x(.64, S), y(.20, S), x(.565, S), y(.37, S));
            ctx.lineTo(x(.435, S), y(.37, S));
            ctx.quadraticCurveTo(x(.36, S), y(.20, S), x(.5, S), y(.05, S)); ctx.closePath();
            ctx.moveTo(x(.41, S), y(.36, S)); ctx.lineTo(x(.59, S), y(.36, S));
            ctx.lineTo(x(.565, S), y(.44, S)); ctx.lineTo(x(.435, S), y(.44, S)); ctx.closePath();
            ctx.moveTo(x(.47, S), y(.42, S)); ctx.lineTo(x(.53, S), y(.42, S));
            ctx.lineTo(x(.53, S), y(.95, S)); ctx.lineTo(x(.47, S), y(.95, S)); ctx.closePath();
        },
        hourglass(ctx, S) {                              // 시간 왜곡 — 모래시계
            ctx.moveTo(x(.24, S), y(.11, S)); ctx.lineTo(x(.76, S), y(.11, S));
            ctx.lineTo(x(.76, S), y(.19, S)); ctx.lineTo(x(.24, S), y(.19, S)); ctx.closePath();
            ctx.moveTo(x(.24, S), y(.81, S)); ctx.lineTo(x(.76, S), y(.81, S));
            ctx.lineTo(x(.76, S), y(.89, S)); ctx.lineTo(x(.24, S), y(.89, S)); ctx.closePath();
            ctx.moveTo(x(.30, S), y(.19, S)); ctx.lineTo(x(.70, S), y(.19, S));
            ctx.lineTo(x(.525, S), y(.50, S)); ctx.lineTo(x(.475, S), y(.50, S)); ctx.closePath();
            ctx.moveTo(x(.475, S), y(.50, S)); ctx.lineTo(x(.525, S), y(.50, S));
            ctx.lineTo(x(.70, S), y(.81, S)); ctx.lineTo(x(.30, S), y(.81, S)); ctx.closePath();
        },
    };

    // 스킬 id → [모티프, 회전(rad, 선택), 글로우세기(선택)]
    const SK = {
        powerStrike: ['sword'], whirlwind: ['whirl'], firstAid: ['cross'],
        fireball: ['flame'], pierceShot: ['arrow'], warCry: ['horn'],
        meteor: ['meteor'], lightning: ['bolt', 0, 0.15], blessing: ['sparkle', 0, 0.16],
        dragonBreath: ['flame3'], execution: ['axe'], sanctuary: ['shield'],
        supernova: ['burst', 0, 0.15], voidLance: ['spear', Math.PI * 0.25], timeWarp: ['hourglass'],
        apocalypse: ['meteor', 0, 0.16], godspear: ['spear', 0, 0.16], divineShield: ['halo', 0, 0.15],
    };
    // 색은 그리는 시점에 SKILL_DEFS 에서 조회한다(스크립트 로드 순서 무관하게 지연 조회).
    const FALLBACK = { powerStrike: '#cfd8dc', whirlwind: '#b0bec5', firstAid: '#a5d6a7', fireball: '#ff8a65', pierceShot: '#81d4fa', warCry: '#ffcc80', meteor: '#ff7043', lightning: '#fff176', blessing: '#80cbc4', dragonBreath: '#ba68c8', execution: '#e57373', sanctuary: '#ce93d8', supernova: '#ffb74d', voidLance: '#9575cd', timeWarp: '#4dd0e1', apocalypse: '#ef5350', godspear: '#ffd54f', divineShield: '#fff59d' };

    Object.keys(SK).forEach((id) => {
        const [motif, rot, glow] = SK[id];
        G.draw['sk_' + id] = function (ctx, S) {
            let color = FALLBACK[id];
            try { if (typeof SKILL_DEFS !== 'undefined') { const d = SKILL_DEFS.find(k => k.id === id); if (d && d.color) color = d.color; } } catch (e) { }
            const path = P[motif] || P.sparkle;
            if (rot) { ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(rot); ctx.translate(-S / 2, -S / 2); }
            emblem(ctx, S, color, path, glow);
            if (rot) ctx.restore();
        };
    });

    // 스킬 오브에 얹을 심볼 아이콘 HTML. (오브 배경/글로우는 CSS .sk-orb 가 담당)
    G.skill = function (id) { return this.img('sk_' + id, 'sk-ico'); };
})(IconGen);
