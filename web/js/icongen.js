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
    // 세로:가로가 1:1 이 아닌 아이콘의 가로 배율(캔버스 폭 = SIZE × 이 값). 없으면 정사각.
    // 상점 특가 일러스트처럼 **프레임 자체가 가로로 긴** 자리는 정사각으로 그리면 contain 이
    // 세로에 맞춰 줄여 좌우가 텅 빈다 — 프레임 종횡비와 같은 값을 여기에 적어 꽉 채운다.
    ASPECT: { shop_tech: 1.52, shop_pet: 1.52, shop_mount: 1.52, passsword: 0.553 },
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
        const S = this.SIZE, SS = this.SUPERSAMPLE, AR = this.ASPECT[name] || 1;
        const big = document.createElement('canvas');
        big.height = S * SS;
        big.width = Math.round(S * SS * AR);
        const bctx = big.getContext('2d');
        bctx.lineJoin = 'round';
        bctx.lineCap = 'round';
        try { fn.call(this, bctx, S * SS, opt || {}); } catch (e) { console.warn('[IconGen] draw fail', name, e); }
        const cv = document.createElement('canvas');
        cv.height = S;
        cv.width = Math.round(S * AR);
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(big, 0, 0, cv.width, cv.height);
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
    // 라운드 사각형을 **서브패스로만** 추가한다(beginPath 안 함) — 여러 도형을 한 경로로 합치거나
    // _innerShadow 의 pathFn 규약("서브패스만 추가")을 지켜야 할 때 쓴다.
    _rrSub(ctx, x, y, w, h, r) {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
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
    // 등수 왕관(리그 보상 1·2위) — 뿔 3개 + 각 뿔 끝 구슬 + 받침띠. 팔레트만 갈아 두 등수를 낸다.
    // ⚠️ 숫자는 여기서 그리지 않는다 — 원본도 배지 위에 흰 글자를 얹는 구조라, 등수마다 아이콘을
    //    새로 굽지 않고 DOM 글자로 덮는 편이 캐시(아이콘당 20~36KB)에도 유리하다.
    _crownRank(ctx, S, pal) {
        const G = this, cx = S * 0.5;
        const L = S * 0.13, R = S * 0.87;            // 좌우 끝
        const peakY = S * 0.30, midPeakY = S * 0.25; // 바깥 뿔 / 가운데 뿔 꼭짓점
        const valleyY = S * 0.52, baseTop = S * 0.66, baseBot = S * 0.80;
        const body = () => {
            ctx.moveTo(L, peakY);
            ctx.lineTo(cx - S * 0.155, valleyY);
            ctx.lineTo(cx, midPeakY);
            ctx.lineTo(cx + S * 0.155, valleyY);
            ctx.lineTo(R, peakY);
            ctx.lineTo(R - S * 0.02, baseTop);
            ctx.lineTo(L + S * 0.02, baseTop);
            ctx.closePath();
        };
        const base = () => G._rrSub(ctx, L - S * 0.01, baseTop, (R - L) + S * 0.02, baseBot - baseTop, S * 0.03);
        // 받침띠 먼저(몸통 아래로 깔린다)
        ctx.beginPath(); base();
        ctx.fillStyle = G._lin(ctx, 0, baseTop, 0, baseBot, pal.base);
        ctx.fill();
        ctx.beginPath(); body();
        ctx.fillStyle = G._lin(ctx, 0, peakY, 0, baseTop, pal.body);
        ctx.fill();
        G._innerShadow(ctx, body, 'rgba(40,20,0,.45)', S * 0.045, 0, -S * 0.02);
        // 뿔 끝 구슬 — 몸통 위에 얹되 테는 마지막에 한 번에 두른다
        const balls = [[L, peakY - S * 0.055], [cx, midPeakY - S * 0.06], [R, peakY - S * 0.055]];
        const ballR = S * 0.085;
        for (const [bx, by] of balls) {
            ctx.beginPath(); ctx.arc(bx, by, ballR, 0, Math.PI * 2);
            ctx.fillStyle = pal.ball; ctx.fill();
            ctx.lineWidth = S * 0.062; ctx.strokeStyle = '#17181a'; ctx.stroke();
        }
        ctx.lineWidth = S * 0.062; ctx.strokeStyle = '#17181a';
        ctx.beginPath(); base(); ctx.stroke();
        ctx.beginPath(); body(); ctx.stroke();
    },
    // 시대 아이콘용 — 굵은 검정 테를 먼저 깔고 색면을 덮는 '실루엣 먼저' 렌더.
    // 시대 막대는 바탕색이 10가지라 테가 없으면 밝은 막대(노랑·청록)에서 형태가 사라진다.
    _ageStroke(ctx, S, pts, w, stops) {
        const line = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)));
        };
        line(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = (w + 0.055) * S; ctx.strokeStyle = '#17181a'; ctx.stroke();
        line();
        ctx.lineWidth = w * S;
        ctx.strokeStyle = this._lin(ctx, pts[0][0] * S, pts[0][1] * S, pts[pts.length - 1][0] * S, pts[pts.length - 1][1] * S, stops);
        ctx.stroke();
    },
    _agePoly(ctx, S, pts, stops) {
        const path = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * S, p[1] * S) : ctx.moveTo(p[0] * S, p[1] * S)));
            ctx.closePath();
        };
        path();
        ctx.fillStyle = this._lin(ctx, 0, 0, 0, S, stops);
        ctx.fill();
        ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.lineJoin = 'round'; ctx.stroke();
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

            // ---- 균열(깨진 알) ----
            // 게임에 '알'이 둘이라(부화하는 진짜 알 S.eggs / 펫 소환 화폐 S.eggCurrency) 같은 아이콘을
            // 쓰면 헷갈린다 → 화폐만 이 균열을 얹어 한눈에 갈리게 한다(사용자 지시 2026-08-18).
            // 껍질 밖으로 새지 않게 알 path로 클립한 뒤 그린다.
            if (!o.cracked) return;
            ctx.save();
            path();
            ctx.clip();
            // 가로 지그재그 + 위/아래로 뻗는 곁가지. 알 폭(w) 파생이라 크기가 바뀌어도 비율이 유지된다.
            const zig = (y0, amp, steps) => {
                ctx.beginPath();
                for (let i = 0; i <= steps; i++) {
                    const x = cx - w * 1.1 + (w * 2.2) * (i / steps);
                    i ? ctx.lineTo(x, y0 + (i % 2 ? amp : -amp)) : ctx.moveTo(x, y0 + amp);
                }
            };
            const branch = (x0, y0, dx, dy) => {
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x0 + dx * 0.45, y0 + dy * 0.55);
                ctx.lineTo(x0 + dx, y0 + dy);
            };
            const yMid = cy + hBot * 0.10;
            // 균열 바로 아래에 밝은 선을 깔아 '갈라진 틈'의 두께감을 준다(그림자만 있으면 낙서로 보인다)
            ctx.save();
            ctx.lineWidth = S * 0.030;
            ctx.strokeStyle = G._shade(base, 0.5);
            ctx.translate(0, S * 0.016);
            zig(yMid, S * 0.028, 7); ctx.stroke();
            branch(cx + w * 0.30, yMid + S * 0.012, w * 0.34, -S * 0.20); ctx.stroke();
            branch(cx - w * 0.44, yMid - S * 0.014, -w * 0.20, S * 0.17); ctx.stroke();
            ctx.restore();
            ctx.lineWidth = S * 0.036;
            ctx.strokeStyle = G._shade(base, -0.74);
            zig(yMid, S * 0.028, 7); ctx.stroke();
            branch(cx + w * 0.30, yMid + S * 0.012, w * 0.34, -S * 0.20); ctx.stroke();
            branch(cx - w * 0.44, yMid - S * 0.014, -w * 0.20, S * 0.17); ctx.stroke();
            ctx.restore();
        },

        // ---- 깨진 알: 펫 소환 화폐 전용 (진짜 알 S.eggs 와 구분) ----
        eggCracked(ctx, S, o) {
            IconGen.draw.egg.call(this, ctx, S, Object.assign({}, o, { cracked: true }));
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

        // ---- 자물쇠: 잠김 배지 (던전 미해금·기술 노드·자동 제련 버튼) ----
        // 어두운 강철 고리 + 황동 몸통. 14px 배지로도 읽히도록 고리를 굵게, 열쇠구멍을 크게 잡는다.
        lock(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const bx = S * 0.17, by = S * 0.44, bw = S * 0.66, bh = S * 0.44, br = S * 0.10;
            const body = () => G._rrSub(ctx, bx, by, bw, bh, br);   // 서브패스만 추가(_innerShadow 규약)

            // 고리 — 몸통 뒤에 깔리도록 먼저
            ctx.beginPath();
            ctx.arc(cx, by + S * 0.015, S * 0.20, Math.PI, 0);
            ctx.lineWidth = S * 0.115;
            ctx.strokeStyle = G._lin(ctx, cx - S * 0.2, 0, cx + S * 0.2, 0,
                [[0, '#8d99a5'], [0.35, '#e8eff5'], [0.7, '#8996a3'], [1, '#4a555f']]);
            ctx.stroke();
            ctx.lineWidth = S * 0.145;
            ctx.strokeStyle = 'rgba(20,26,32,.55)';
            ctx.globalCompositeOperation = 'destination-over';
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';

            // 몸통 그림자
            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.028);
            ctx.beginPath(); body(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); body();
            ctx.fillStyle = G._lin(ctx, 0, by, 0, by + bh,
                [[0, '#ffe08a'], [0.3, '#f0b52e'], [0.68, '#c8870f'], [1, '#8a5806']]);
            ctx.fill();
            G._innerShadow(ctx, body, 'rgba(70,40,2,.6)', S * 0.04, 0, -S * 0.018);
            // 상단 광택
            ctx.save();
            ctx.beginPath(); body(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.5)';
            ctx.fillRect(bx, by, bw, bh * 0.16);
            ctx.restore();

            // 열쇠구멍 — 원 + 아래로 벌어지는 홈
            ctx.beginPath();
            ctx.arc(cx, by + bh * 0.40, S * 0.075, 0, Math.PI * 2);
            ctx.moveTo(cx - S * 0.038, by + bh * 0.42);
            ctx.lineTo(cx - S * 0.062, by + bh * 0.84);
            ctx.lineTo(cx + S * 0.062, by + bh * 0.84);
            ctx.lineTo(cx + S * 0.038, by + bh * 0.42);
            ctx.closePath();
            ctx.fillStyle = 'rgba(48,26,2,.88)';
            ctx.fill();

            ctx.beginPath(); body();
            ctx.lineWidth = S * 0.024;
            ctx.strokeStyle = 'rgba(60,34,2,.8)';
            ctx.stroke();
        },

        // ---- 열쇠: 던전 입장 열쇠 개수 표시 ----
        key(ctx, S) {
            const G = IconGen;
            const gold = () => G._lin(ctx, 0, S * 0.2, 0, S * 0.85,
                [[0, '#ffeba6'], [0.32, '#f4c034'], [0.7, '#cf920f'], [1, '#8d5c05']]);
            ctx.save();
            ctx.translate(S / 2, S / 2); ctx.rotate(-0.62); ctx.translate(-S / 2, -S / 2);
            const bx = S * 0.30, by = S * 0.26, bR = S * 0.155;   // 손잡이 고리
            const path = () => {
                ctx.moveTo(bx + bR, by);
                ctx.arc(bx, by, bR, 0, Math.PI * 2);
                G._rrSub(ctx, bx - S * 0.045, by + bR * 0.6, S * 0.09, S * 0.50, S * 0.03);   // 대
                G._rrSub(ctx, bx + S * 0.04, by + bR * 0.6 + S * 0.30, S * 0.13, S * 0.075, S * 0.02); // 이 1
                G._rrSub(ctx, bx + S * 0.04, by + bR * 0.6 + S * 0.42, S * 0.10, S * 0.07, S * 0.02);  // 이 2
            };
            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(S * 0.02, S * 0.03);
            ctx.beginPath(); path(); ctx.fill('evenodd');
            ctx.restore();

            ctx.beginPath(); path();
            ctx.fillStyle = gold();
            ctx.fill('evenodd');
            // 고리 구멍
            ctx.beginPath();
            ctx.arc(bx, by, bR * 0.44, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(50,30,2,.85)';
            ctx.fill();
            ctx.beginPath(); path();
            ctx.lineWidth = S * 0.022;
            ctx.strokeStyle = 'rgba(64,38,2,.78)';
            ctx.stroke();
            // 대 위쪽 하이라이트
            ctx.beginPath();
            ctx.moveTo(bx - S * 0.018, by + bR * 0.8);
            ctx.lineTo(bx - S * 0.018, by + bR * 0.6 + S * 0.44);
            ctx.lineWidth = S * 0.018;
            ctx.strokeStyle = 'rgba(255,255,255,.45)';
            ctx.stroke();
            ctx.restore();
        },

        // ---- 선물 상자: 보상 수령 (리그 시즌·패스·특가) ----
        gift(ctx, S) {
            const G = IconGen;
            const bx = S * 0.14, bw = S * 0.72, ly = S * 0.30, lh = S * 0.16;
            const by = ly + lh, bh = S * 0.44;
            const rw = S * 0.15;                     // 리본 폭
            const rx = S * 0.5 - rw / 2;

            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            ctx.beginPath(); G._rr(ctx, bx, ly, bw, bh + lh, S * 0.05); ctx.fill();
            ctx.restore();

            // 상자 몸통
            const boxPath = () => G._rrSub(ctx, bx + S * 0.03, by, bw - S * 0.06, bh, S * 0.035);
            ctx.beginPath(); boxPath();
            ctx.fillStyle = G._lin(ctx, 0, by, 0, by + bh,
                [[0, '#ff7a6b'], [0.45, '#e8402f'], [1, '#96150c']]);
            ctx.fill();
            G._innerShadow(ctx, boxPath, 'rgba(70,6,2,.5)', S * 0.035, 0, -S * 0.018);
            ctx.beginPath(); boxPath();
            ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(58,6,2,.8)'; ctx.stroke();

            // 뚜껑
            ctx.beginPath(); G._rr(ctx, bx, ly, bw, lh, S * 0.035);
            ctx.fillStyle = G._lin(ctx, 0, ly, 0, ly + lh,
                [[0, '#ff9c8e'], [0.6, '#ee5240'], [1, '#b8200f']]);
            ctx.fill();
            ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(58,6,2,.8)'; ctx.stroke();

            // 리본 세로 + 매듭 고리 2개
            const ribbon = G._lin(ctx, rx, 0, rx + rw, 0,
                [[0, '#e0a70d'], [0.4, '#ffe58a'], [1, '#c98a06']]);
            ctx.beginPath(); ctx.rect(rx, ly, rw, bh + lh);
            ctx.fillStyle = ribbon; ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(96,60,2,.6)'; ctx.stroke();

            const loop = (dir) => {
                ctx.beginPath();
                ctx.moveTo(S * 0.5, ly + S * 0.02);
                ctx.quadraticCurveTo(S * 0.5 + dir * S * 0.30, ly - S * 0.20, S * 0.5 + dir * S * 0.10, ly - S * 0.015);
                ctx.closePath();
                ctx.fillStyle = ribbon; ctx.fill();
                ctx.lineWidth = S * 0.02; ctx.strokeStyle = 'rgba(96,60,2,.65)'; ctx.stroke();
            };
            loop(1); loop(-1);
            ctx.beginPath();
            ctx.arc(S * 0.5, ly + S * 0.005, S * 0.055, 0, Math.PI * 2);
            ctx.fillStyle = G._rad(ctx, S * 0.48, ly - S * 0.015, S * 0.005, S * 0.5, ly, S * 0.07,
                [[0, '#fff6c9'], [1, '#d99c08']]);
            ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(96,60,2,.65)'; ctx.stroke();
        },

        // ---- 트로피: 리그 승리 ----
        trophy(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const cupTop = S * 0.20, cupBot = S * 0.60, halfTop = S * 0.24;
            const gold = G._lin(ctx, cx - halfTop, cupTop, cx + halfTop, cupBot,
                [[0, '#fff2bd'], [0.28, '#f5cb45'], [0.62, '#d69a12'], [1, '#8f5f05']]);
            const cup = () => {
                ctx.moveTo(cx - halfTop, cupTop);
                ctx.lineTo(cx + halfTop, cupTop);
                ctx.lineTo(cx + halfTop * 0.72, cupBot - S * 0.06);
                ctx.quadraticCurveTo(cx, cupBot + S * 0.05, cx - halfTop * 0.72, cupBot - S * 0.06);
                ctx.closePath();
            };
            // 손잡이
            const handle = (dir) => {
                ctx.beginPath();
                ctx.moveTo(cx + dir * halfTop * 0.94, cupTop + S * 0.03);
                ctx.quadraticCurveTo(cx + dir * S * 0.40, cupTop + S * 0.10, cx + dir * halfTop * 0.90, cupTop + S * 0.21);
                ctx.lineWidth = S * 0.055;
                ctx.strokeStyle = gold;
                ctx.stroke();
                ctx.lineWidth = S * 0.075;
                ctx.strokeStyle = 'rgba(64,38,2,.55)';
                ctx.globalCompositeOperation = 'destination-over';
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            };
            handle(1); handle(-1);

            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.016}px)`;
            ctx.translate(0, S * 0.03);
            ctx.beginPath(); cup(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); cup();
            ctx.fillStyle = gold;
            ctx.fill();
            G._innerShadow(ctx, cup, 'rgba(70,40,2,.55)', S * 0.04, 0, -S * 0.018);
            ctx.save();
            ctx.beginPath(); cup(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.45)';
            ctx.fillRect(cx - halfTop, cupTop, halfTop * 2, S * 0.045);
            ctx.fillStyle = 'rgba(255,255,255,.3)';
            ctx.fillRect(cx - halfTop * 0.6, cupTop, S * 0.05, cupBot - cupTop);
            ctx.restore();
            ctx.beginPath(); cup();
            ctx.lineWidth = S * 0.024; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();

            // 기둥 + 받침 2단
            const post = () => G._rr(ctx, cx - S * 0.055, cupBot, S * 0.11, S * 0.11, S * 0.02);
            const base1 = () => G._rr(ctx, cx - S * 0.15, cupBot + S * 0.10, S * 0.30, S * 0.07, S * 0.02);
            const base2 = () => G._rr(ctx, cx - S * 0.21, cupBot + S * 0.16, S * 0.42, S * 0.09, S * 0.025);
            for (const p of [post, base1, base2]) {
                ctx.beginPath(); p();
                ctx.fillStyle = G._lin(ctx, 0, cupBot, 0, cupBot + S * 0.26,
                    [[0, '#f7d364'], [0.5, '#d29a14'], [1, '#8a5a05']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();
            }
        },

        // ---- 교차 검: 전투력(CP) 표시 ----
        // 상단바·리그 행에서 10~14px로 찍힌다. 날을 가늘게 그리면 그 크기에서 회색 얼룩이 되므로
        // 날 폭을 넉넉히 잡고 검마다 짙은 테를 둘러 X 실루엣이 먼저 읽히게 한다.
        power(ctx, S) {
            const G = IconGen;
            // 검 하나 = 날(끝이 뾰족한 사다리꼴) + 가드 + 손잡이 + 폼멜. 원점 기준 세로로 그린 뒤 회전한다.
            const blade = (rot) => {
                ctx.save();
                ctx.translate(S / 2, S / 2);
                ctx.rotate(rot);
                const w = S * 0.135, L = S * 0.40;          // 날 반폭 / 날 길이 — 10px에서 날이 사라지지 않게 두껍게
                const shape = () => {
                    ctx.moveTo(0, -L - S * 0.05);            // 칼끝
                    ctx.lineTo(w, -L + S * 0.06);
                    ctx.lineTo(w, S * 0.02);
                    ctx.lineTo(-w, S * 0.02);
                    ctx.lineTo(-w, -L + S * 0.06);
                    ctx.closePath();
                };
                ctx.beginPath(); shape();
                ctx.fillStyle = G._lin(ctx, -w, 0, w, 0,
                    [[0, '#7d8b98'], [0.3, '#eef4f9'], [0.62, '#9fadba'], [1, '#4d5862']]);
                ctx.fill();
                ctx.lineWidth = S * 0.038; ctx.strokeStyle = 'rgba(18,24,30,.92)'; ctx.stroke();

                // 가드(십자) — 금색
                ctx.beginPath(); G._rrSub(ctx, -S * 0.22, S * 0.02, S * 0.44, S * 0.09, S * 0.03);
                ctx.fillStyle = G._lin(ctx, 0, S * 0.02, 0, S * 0.095,
                    [[0, '#ffe38f'], [0.55, '#e8a81a'], [1, '#96620a']]);
                ctx.fill();
                ctx.lineWidth = S * 0.024; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();

                // 손잡이 + 폼멜
                ctx.beginPath(); G._rrSub(ctx, -S * 0.045, S * 0.09, S * 0.09, S * 0.145, S * 0.025);
                ctx.fillStyle = G._lin(ctx, -S * 0.045, 0, S * 0.045, 0,
                    [[0, '#5a3a1c'], [0.45, '#9c6a35'], [1, '#4a2f16']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(40,24,8,.85)'; ctx.stroke();
                ctx.beginPath(); ctx.arc(0, S * 0.255, S * 0.055, 0, Math.PI * 2);
                ctx.fillStyle = G._rad(ctx, -S * 0.015, S * 0.24, S * 0.005, 0, S * 0.255, S * 0.07,
                    [[0, '#ffe9a6'], [1, '#b8790c']]);
                ctx.fill();
                ctx.lineWidth = S * 0.022; ctx.strokeStyle = 'rgba(64,38,2,.8)'; ctx.stroke();
                ctx.restore();
            };
            ctx.save();
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.02}px)`;
            ctx.translate(0, S * 0.03);
            blade(0.72); blade(-0.72);
            ctx.restore();
            blade(0.72);    // 뒤쪽 검
            blade(-0.72);   // 앞쪽 검
        },

        // ---- 별: 승천 등급 배지(장비 셀·스킬/펫/탈것 타일·비교 카드·리그 점수) ----
        // 이 배지는 `.sk-star` 기준 10~12px로도 찍히므로 디테일보다 **실루엣과 테**가 전부다.
        // 뾰족한 5각 + 굵은 갈색 테 + 위쪽 밝은 그라디언트만 남기고 잔무늬는 넣지 않는다.
        star(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.52, R = S * 0.46, r = R * 0.44;
            const path = () => {
                for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
                    const rr = i % 2 ? r : R;
                    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
                    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.closePath();
            };
            ctx.save();
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.018}px)`;
            ctx.translate(0, S * 0.035);
            ctx.beginPath(); path(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); path();
            ctx.fillStyle = G._rad(ctx, cx - R * 0.25, cy - R * 0.45, S * 0.01, cx, cy, R * 1.15,
                [[0, '#fffbe0'], [0.32, '#ffd94e'], [0.68, '#f2ab12'], [1, '#b46b04']]);
            ctx.fill();
            G._innerShadow(ctx, path, 'rgba(90,52,2,.55)', S * 0.035, 0, -S * 0.016);
            // 위쪽 뿔 하이라이트 — 작은 크기에서 '금속 별'로 읽히게 하는 유일한 디테일
            ctx.save();
            ctx.beginPath(); path(); ctx.clip();
            ctx.fillStyle = G._lin(ctx, 0, cy - R, 0, cy,
                [[0, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
            ctx.fillRect(cx - R, cy - R, R * 2, R);
            ctx.restore();
            ctx.beginPath(); path();
            ctx.lineWidth = S * 0.05;   // 흰 셀·검은 리본 어디에 얹혀도 형태가 유지되도록 두껍게
            ctx.strokeStyle = 'rgba(74,42,2,.85)';
            ctx.stroke();
        },

        // ---- 리그 보상 등수 배지 (원본 shot-042208 확대 대조) ----
        // 원본은 👑🥈🥉 이모지가 아니라 **숫자를 얹는 배지**다: 1·2위는 뿔 3개 끝에 구슬이 달린 왕관
        // (1위 주황금, 2위 올리브회색 + 밝은 받침띠), 3위는 벽돌색 마름모. 숫자는 배지가 아니라
        // 그 위에 흰 글자로 얹히므로 **아이콘에는 숫자를 그리지 않는다**(등수 칸이 span 으로 덮는다).
        // 두 왕관은 팔레트만 다른 같은 도형이라 `_crownRank` 하나로 그린다.
        rank1(ctx, S) {
            IconGen._crownRank(ctx, S, {
                body: [[0, '#ffc65a'], [0.45, '#f5a11b'], [1, '#e07f08']],
                base: [[0, '#f79a14'], [1, '#e07a06']], ball: '#f78a0f',
            });
        },
        rank2(ctx, S) {
            IconGen._crownRank(ctx, S, {
                body: [[0, '#a8a189'], [0.45, '#857f68'], [1, '#6b6553']],
                base: [[0, '#d6d0b6'], [1, '#b9b298']], ball: '#8f8971',
            });
        },
        // 3위 — 벽돌색 마름모(정사각형 45° 회전). 굵은 검정 테 + 위쪽 하이라이트.
        rank3(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.5, r = S * 0.40;
            const dia = () => {
                ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
            };
            ctx.beginPath(); dia();
            ctx.fillStyle = G._lin(ctx, 0, cy - r, 0, cy + r, [[0, '#c4644a'], [0.5, '#a64a34'], [1, '#7d3524']]);
            ctx.fill();
            G._innerShadow(ctx, dia, 'rgba(60,20,10,.5)', S * 0.05, 0, -S * 0.02);
            ctx.save(); ctx.beginPath(); dia(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.22)';
            ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.beginPath(); dia();
            ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },

        // ---- 기술 트리 노드 모티프 8종 ----
        // 원본(shot-042605)의 노드는 **청동 원판 위에 작은 픽토그램**이고 이모지가 아니다.
        // 노드는 --tt-node(≈58px)의 40% = 23px 로 찍히므로, 전부 **단일 실루엣 + 굵은 검정 테**로
        // 그린다(power 아이콘에서 배운 대로 도형이 둘 이상이면 이 크기에서 얼룩이 된다 —
        // paw/clover/dice 는 부속을 붙이되 본체가 먼저 읽히도록 본체를 크게 잡았다).
        // opt.tint 로 색을 갈아 같은 도형을 둘로 쓴다(펫 체력=초록 / 펫 피해=붉은색) —
        // 같은 가지에 나란히 놓이는 두 노드라 색까지 같으면 '중복 아이콘'으로 읽힌다.
        paw(ctx, S, o) {                                 // 펫 보너스 — 발바닥
            const G = IconGen, ink = '#17181a';
            const base = (o && o.tint) || '#35c14a';
            const pad = G._lin(ctx, 0, S * 0.4, 0, S * 0.9,
                [[0, G._shade(base, 0.42)], [0.5, base], [1, G._shade(base, -0.35)]]);
            const toe = (x, y, rx, ry) => {
                ctx.beginPath(); ctx.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2);
                ctx.fillStyle = pad; ctx.fill();
                ctx.lineWidth = S * 0.055; ctx.strokeStyle = ink; ctx.stroke();
            };
            const main = () => { ctx.ellipse(S * 0.5, S * 0.685, S * 0.28, S * 0.225, 0, 0, Math.PI * 2); };
            ctx.beginPath(); main(); ctx.fillStyle = pad; ctx.fill();
            G._innerShadow(ctx, main, 'rgba(6,50,18,.5)', S * 0.045, 0, -S * 0.02);
            ctx.beginPath(); main(); ctx.lineWidth = S * 0.062; ctx.strokeStyle = ink; ctx.stroke();
            toe(0.20, 0.335, 0.105, 0.125); toe(0.415, 0.245, 0.105, 0.13);
            toe(0.625, 0.26, 0.105, 0.13); toe(0.82, 0.365, 0.10, 0.12);
        },
        check(ctx, S) {                                  // 최대 레벨 노드 — 초록 체크
            const G = IconGen;
            const p = () => {
                ctx.moveTo(S * 0.14, S * 0.50); ctx.lineTo(S * 0.30, S * 0.34);
                ctx.lineTo(S * 0.42, S * 0.50); ctx.lineTo(S * 0.74, S * 0.19);
                ctx.lineTo(S * 0.90, S * 0.35); ctx.lineTo(S * 0.42, S * 0.82);
                ctx.closePath();
            };
            ctx.beginPath(); p();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.19, 0, S * 0.82, [[0, '#7ee2a0'], [0.5, '#2fb85e'], [1, '#177a3a']]);
            ctx.fill();
            G._innerShadow(ctx, p, 'rgba(8,50,24,.45)', S * 0.045, 0, -S * 0.02);
            ctx.beginPath(); p(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        heart(ctx, S) {                                  // 패시브 체력 — 하트
            const G = IconGen, cx = S * 0.5;
            const p = () => {
                ctx.moveTo(cx, S * 0.86);
                ctx.bezierCurveTo(S * 0.02, S * 0.53, S * 0.14, S * 0.13, cx, S * 0.35);
                ctx.bezierCurveTo(S * 0.86, S * 0.13, S * 0.98, S * 0.53, cx, S * 0.86);
                ctx.closePath();
            };
            ctx.beginPath(); p();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.2, 0, S * 0.86, [[0, '#ff7a86'], [0.45, '#e8323f'], [1, '#9c1420']]);
            ctx.fill();
            G._innerShadow(ctx, p, 'rgba(80,4,12,.5)', S * 0.05, 0, -S * 0.02);
            ctx.save(); ctx.beginPath(); p(); ctx.clip();
            ctx.fillStyle = 'rgba(255,255,255,.4)';
            ctx.beginPath(); ctx.ellipse(S * 0.33, S * 0.34, S * 0.10, S * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.beginPath(); p(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        clover(ctx, S) {                                 // 무료 제련 확률 — 네잎 클로버
            const G = IconGen, cx = S * 0.5, cy = S * 0.46, r = S * 0.20;
            const grad = G._lin(ctx, 0, cy - r * 2, 0, cy + r * 2, [[0, '#6ee87f'], [0.5, '#2fb84a'], [1, '#177a30']]);
            ctx.beginPath();
            ctx.moveTo(cx, cy + S * 0.03);
            ctx.quadraticCurveTo(cx - S * 0.05, cy + S * 0.30, cx - S * 0.17, cy + S * 0.40);
            ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#177a30'; ctx.stroke();
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                ctx.beginPath();
                ctx.ellipse(cx + dx * r * 0.78, cy + dy * r * 0.78, r * 0.78, r * 0.78, 0, 0, Math.PI * 2);
                ctx.fillStyle = grad; ctx.fill();
                ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
            }
        },
        horse(ctx, S) {                                  // 탈것 마스터리 — 말 머리
            const G = IconGen;
            const head = () => {
                ctx.moveTo(S * 0.30, S * 0.88);
                ctx.lineTo(S * 0.30, S * 0.52);
                ctx.quadraticCurveTo(S * 0.32, S * 0.30, S * 0.50, S * 0.24);
                ctx.lineTo(S * 0.46, S * 0.10);                  // 귀
                ctx.lineTo(S * 0.62, S * 0.22);
                ctx.quadraticCurveTo(S * 0.84, S * 0.28, S * 0.86, S * 0.44);
                ctx.quadraticCurveTo(S * 0.87, S * 0.56, S * 0.70, S * 0.58);
                ctx.quadraticCurveTo(S * 0.58, S * 0.60, S * 0.56, S * 0.88);
                ctx.closePath();
            };
            ctx.beginPath(); head();
            ctx.fillStyle = G._lin(ctx, S * 0.3, 0, S * 0.86, S, [[0, '#b98652'], [0.5, '#8d5f31'], [1, '#5a3a1a']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(40,20,4,.55)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); ctx.arc(S * 0.66, S * 0.40, S * 0.045, 0, Math.PI * 2);
            ctx.fillStyle = '#17181a'; ctx.fill();
        },
        moneybag(ctx, S) {                               // 판매가·코인 보너스 — 돈자루
            const G = IconGen, cx = S * 0.5;
            const bag = () => {
                ctx.moveTo(cx - S * 0.16, S * 0.34);
                ctx.bezierCurveTo(S * 0.04, S * 0.50, S * 0.08, S * 0.88, cx, S * 0.88);
                ctx.bezierCurveTo(S * 0.92, S * 0.88, S * 0.96, S * 0.50, cx + S * 0.16, S * 0.34);
                ctx.closePath();
            };
            ctx.beginPath(); bag();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.34, 0, S * 0.88, [[0, '#e6c98a'], [0.45, '#c79a4e'], [1, '#8a6524']]);
            ctx.fill();
            G._innerShadow(ctx, bag, 'rgba(60,38,4,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); bag(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 목끈
            ctx.beginPath(); G._rrSub(ctx, cx - S * 0.20, S * 0.20, S * 0.40, S * 0.15, S * 0.05);
            ctx.fillStyle = G._lin(ctx, 0, S * 0.20, 0, S * 0.35, [[0, '#a9752c'], [1, '#7a5218']]);
            ctx.fill(); ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 코인 문양
            ctx.beginPath(); ctx.arc(cx, S * 0.62, S * 0.15, 0, Math.PI * 2);
            ctx.fillStyle = '#f5cb45'; ctx.fill();
            ctx.lineWidth = S * 0.05; ctx.strokeStyle = '#6b4a08'; ctx.stroke();
        },
        robot(ctx, S) {                                  // 오토포지 — 로봇 머리
            const G = IconGen, cx = S * 0.5;
            const head = () => G._rrSub(ctx, S * 0.16, S * 0.30, S * 0.68, S * 0.52, S * 0.14);
            // 안테나
            ctx.beginPath(); ctx.moveTo(cx, S * 0.30); ctx.lineTo(cx, S * 0.14);
            ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, S * 0.12, S * 0.085, 0, Math.PI * 2);
            ctx.fillStyle = '#ff5a4a'; ctx.fill();
            ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.beginPath(); head();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.30, 0, S * 0.82, [[0, '#dfe6ee'], [0.5, '#a9b5c2'], [1, '#6f7b88']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(24,32,42,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head(); ctx.lineWidth = S * 0.065; ctx.strokeStyle = '#17181a'; ctx.stroke();
            // 눈 두 개 (파란 발광)
            for (const dx of [-0.155, 0.155]) {
                ctx.beginPath(); ctx.arc(cx + dx * S, S * 0.52, S * 0.075, 0, Math.PI * 2);
                ctx.fillStyle = '#2f7bff'; ctx.fill();
                ctx.lineWidth = S * 0.045; ctx.strokeStyle = '#17181a'; ctx.stroke();
            }
            // 입 슬릿
            ctx.beginPath(); G._rrSub(ctx, cx - S * 0.16, S * 0.66, S * 0.32, S * 0.075, S * 0.03);
            ctx.fillStyle = '#3a444f'; ctx.fill();
        },
        uptri(ctx, S) {                                  // 장비 최대 레벨 — 상승 삼각형
            const G = IconGen, cx = S * 0.5;
            const tri = () => {
                ctx.moveTo(cx, S * 0.14); ctx.lineTo(S * 0.90, S * 0.78);
                ctx.lineTo(S * 0.10, S * 0.78); ctx.closePath();
            };
            ctx.beginPath(); tri();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.78, [[0, '#7ee2a0'], [0.5, '#2fb85e'], [1, '#177a3a']]);
            ctx.fill();
            G._innerShadow(ctx, tri, 'rgba(8,50,24,.5)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); tri(); ctx.lineWidth = S * 0.075; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        dice(ctx, S) {                                   // 추가 획득 확률 — 주사위
            const G = IconGen;
            const box = () => G._rrSub(ctx, S * 0.14, S * 0.14, S * 0.72, S * 0.72, S * 0.15);
            ctx.beginPath(); box();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.14, 0, S * 0.86, [[0, '#ffffff'], [0.5, '#e2e6ea'], [1, '#aeb6bd']]);
            ctx.fill();
            G._innerShadow(ctx, box, 'rgba(30,36,42,.45)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); box(); ctx.lineWidth = S * 0.07; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.fillStyle = '#17181a';
            for (const [x, y] of [[0.32, 0.32], [0.5, 0.5], [0.68, 0.68], [0.68, 0.32], [0.32, 0.68]]) {
                ctx.beginPath(); ctx.arc(x * S, y * S, S * 0.062, 0, Math.PI * 2); ctx.fill();
            }
        },

        // ---- 시대 아이콘 10종 (원본 shot-042831·042950 확대) ----
        // 🚨 원본의 시대 아이콘은 범용 이모지가 아니라 **그 시대의 무기 실루엣**이 순서대로 놓인 것이다:
        //    원시=나무 몽둥이 · 중세=검 · 근대 초기=나팔총 · 현대=권총 · 우주=블래스터 ·
        //    항성간=광선총 · 다중 우주=포탈건 · 양자=원자 · 지하 세계=삼지창 · 신성한=황금 날개.
        //    종전 매핑(🪨⚔️🏴‍☠️🔫🚀🛸🌀⚛️🔥✨)은 절반이 아예 다른 물건이었다.
        // 시대 막대 위에 얹히므로 **바탕색이 매번 다르다** — 전부 굵은 검정 테로 실루엣을 먼저 세운다.
        age_primitive(ctx, S) {                          // 나무 몽둥이
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.16, 0.80], [0.62, 0.30]], 0.115,
                [[0, '#a9773f'], [1, '#5d3a15']]);
            G._ageStroke(ctx, S, [[0.58, 0.34], [0.86, 0.14]], 0.175,
                [[0, '#b98a4e'], [1, '#6b4419']]);
        },
        age_medieval(ctx, S) {                           // 검 — 회청 날 + 주황 손잡이
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.20, 0.84], [0.38, 0.66]], 0.13, [[0, '#d98b2b'], [1, '#8c4f0d']]);
            G._ageStroke(ctx, S, [[0.28, 0.62], [0.46, 0.80]], 0.085, [[0, '#e0a44a'], [1, '#95580f']]);
            G._ageStroke(ctx, S, [[0.36, 0.66], [0.84, 0.20]], 0.145, [[0, '#e9eef4'], [1, '#7f8a97']]);
        },
        age_earlyModern(ctx, S) {                        // 나팔총 — 개머리판 + 벌어진 총구
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.14, 0.80], [0.40, 0.56]], 0.155, [[0, '#8a5c2c'], [1, '#4a2d0d']]);
            G._ageStroke(ctx, S, [[0.36, 0.60], [0.80, 0.22]], 0.115, [[0, '#6c737b'], [1, '#31373d']]);
            G._agePoly(ctx, S, [[0.74, 0.32], [0.92, 0.10], [0.98, 0.26], [0.84, 0.42]], [[0, '#8a929b'], [1, '#3d444b']]);
        },
        age_modern(ctx, S) {                             // 권총
            const G = IconGen;
            G._agePoly(ctx, S, [[0.12, 0.42], [0.86, 0.42], [0.86, 0.58], [0.44, 0.58], [0.34, 0.86], [0.14, 0.86], [0.22, 0.56], [0.12, 0.56]],
                [[0, '#4b5158'], [1, '#171b1f']]);
        },
        age_space(ctx, S) {                              // 블래스터 — 흰 몸체 + 총열 홈
            const G = IconGen;
            G._agePoly(ctx, S, [[0.10, 0.36], [0.82, 0.24], [0.90, 0.42], [0.46, 0.54], [0.36, 0.84], [0.16, 0.82], [0.22, 0.50]],
                [[0, '#f2f5f8'], [1, '#98a2ac']]);
            G._ageStroke(ctx, S, [[0.44, 0.34], [0.72, 0.29]], 0.05, [[0, '#5c666f'], [1, '#5c666f']]);
        },
        age_interstellar(ctx, S) {                       // 광선총 — 둥근 발광부
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.20, 0.82], [0.44, 0.56]], 0.15, [[0, '#e7ecf1'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.40, 0.60], [0.74, 0.28]], 0.185, [[0, '#f4f7fa'], [1, '#9aa4ae']]);
            ctx.beginPath(); ctx.arc(S * 0.80, S * 0.22, S * 0.115, 0, Math.PI * 2);
            ctx.fillStyle = IconGen._lin(ctx, S * 0.7, S * 0.1, S * 0.9, S * 0.34, [[0, '#ffffff'], [1, '#aab4be']]);
            ctx.fill(); ctx.lineWidth = S * 0.055; ctx.strokeStyle = '#17181a'; ctx.stroke();
        },
        age_multiverse(ctx, S) {                         // 포탈건 — 분홍 고리 + 회색 몸체
            const G = IconGen;
            G._agePoly(ctx, S, [[0.38, 0.34], [0.88, 0.34], [0.88, 0.66], [0.38, 0.66]], [[0, '#dfe5ea'], [1, '#8b959f']]);
            ctx.beginPath(); ctx.ellipse(S * 0.30, S * 0.50, S * 0.10, S * 0.30, 0, 0, Math.PI * 2);
            ctx.fillStyle = IconGen._lin(ctx, S * 0.2, 0, S * 0.4, S, [[0, '#ff5f8a'], [1, '#c01f4d']]);
            ctx.fill(); ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a'; ctx.stroke();
            ctx.lineWidth = S * 0.045; ctx.strokeStyle = '#3c454e';
            for (const x of [0.52, 0.64, 0.76]) { ctx.beginPath(); ctx.moveTo(x * S, S * 0.40); ctx.lineTo(x * S, S * 0.60); ctx.stroke(); }
        },
        age_quantum(ctx, S) {                            // 원자 — 핵 + 궤도 3
            const cx = S * 0.5, cy = S * 0.5;
            ctx.lineWidth = S * 0.06; ctx.strokeStyle = '#17181a';
            for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
                ctx.beginPath(); ctx.ellipse(0, 0, S * 0.40, S * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
            ctx.beginPath(); ctx.arc(cx, cy, S * 0.115, 0, Math.PI * 2);
            ctx.fillStyle = '#17181a'; ctx.fill();
        },
        age_underworld(ctx, S) {                         // 삼지창
            const G = IconGen;
            G._ageStroke(ctx, S, [[0.50, 0.92], [0.50, 0.34]], 0.10, [[0, '#e2e7ec'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.20, 0.42], [0.80, 0.42]], 0.085, [[0, '#e2e7ec'], [1, '#8d97a1']]);
            G._ageStroke(ctx, S, [[0.20, 0.42], [0.20, 0.16]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
            G._ageStroke(ctx, S, [[0.80, 0.42], [0.80, 0.16]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
            G._ageStroke(ctx, S, [[0.50, 0.34], [0.50, 0.08]], 0.085, [[0, '#eef2f6'], [1, '#95a0aa']]);
        },
        age_divine(ctx, S) {                             // 황금 날개 한 쌍
            const G = IconGen;
            const half = (dir) => G._agePoly(ctx, S, [
                [0.5 + dir * 0.06, 0.30], [0.5 + dir * 0.46, 0.20], [0.5 + dir * 0.34, 0.42],
                [0.5 + dir * 0.46, 0.40], [0.5 + dir * 0.30, 0.62], [0.5 + dir * 0.34, 0.60],
                [0.5 + dir * 0.20, 0.78], [0.5 + dir * 0.06, 0.56],
            ], [[0, '#ffd86a'], [0.5, '#f0a81c'], [1, '#9c6403']]);
            half(-1); half(1);
        },

        // ---- 리그 문장 (원본 shot-042149 확대) ----
        // 원본은 방패 하나가 아니라 **날개가 뒤로 뻗은 플래티넘 문장**이다: 검은 굵은 테 + 민트 방패면 +
        // 위쪽 흰 띠 + 가운데 어두운 실루엣, 방패 뒤로 좌우 날개(짙은 청록 + 흰 줄무늬)와 물방울 장식.
        // 종전 구현은 🛡️ 이모지 한 글자라 '단색 방패 하나'였다(비율 감사 ⑸ 지적).
        leagueEmblem(ctx, S) {
            const G = IconGen, cx = S * 0.5, ink = '#0d1a1a';
            const wing = (dir) => {
                ctx.beginPath();
                ctx.moveTo(cx + dir * S * 0.14, S * 0.30);
                ctx.lineTo(cx + dir * S * 0.49, S * 0.20);
                ctx.lineTo(cx + dir * S * 0.44, S * 0.38);
                ctx.lineTo(cx + dir * S * 0.49, S * 0.36);
                ctx.lineTo(cx + dir * S * 0.40, S * 0.56);
                ctx.lineTo(cx + dir * S * 0.16, S * 0.50);
                ctx.closePath();
                ctx.fillStyle = G._lin(ctx, cx, S * 0.2, cx + dir * S * 0.5, S * 0.56,
                    [[0, '#2f6b66'], [1, '#16403d']]);
                ctx.fill();
                ctx.lineWidth = S * 0.055; ctx.strokeStyle = ink; ctx.stroke();
                // 깃 줄무늬(밝은 선) — 원본에서 날개마다 두 줄이 밝게 뜬다
                ctx.beginPath();
                ctx.moveTo(cx + dir * S * 0.22, S * 0.31); ctx.lineTo(cx + dir * S * 0.43, S * 0.25);
                ctx.moveTo(cx + dir * S * 0.23, S * 0.42); ctx.lineTo(cx + dir * S * 0.40, S * 0.37);
                ctx.lineWidth = S * 0.035; ctx.strokeStyle = 'rgba(233,252,250,.92)'; ctx.stroke();
                // 물방울 장식
                ctx.beginPath();
                ctx.moveTo(cx + dir * S * 0.30, S * 0.56);
                ctx.lineTo(cx + dir * S * 0.35, S * 0.66);
                ctx.lineTo(cx + dir * S * 0.25, S * 0.63);
                ctx.closePath();
                ctx.fillStyle = '#6fe0e0'; ctx.fill();
                ctx.lineWidth = S * 0.03; ctx.strokeStyle = ink; ctx.stroke();
            };
            wing(-1); wing(1);
            const shield = () => {
                ctx.moveTo(cx - S * 0.21, S * 0.16);
                ctx.lineTo(cx + S * 0.21, S * 0.16);
                ctx.lineTo(cx + S * 0.21, S * 0.55);
                ctx.quadraticCurveTo(cx + S * 0.19, S * 0.74, cx, S * 0.86);
                ctx.quadraticCurveTo(cx - S * 0.19, S * 0.74, cx - S * 0.21, S * 0.55);
                ctx.closePath();
            };
            ctx.beginPath(); shield();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.16, 0, S * 0.86,
                [[0, '#bdf0ea'], [0.45, '#7fd4cc'], [1, '#3f9d97']]);
            ctx.fill();
            G._innerShadow(ctx, shield, 'rgba(6,40,38,.5)', S * 0.05, 0, -S * 0.02);
            // 위쪽 흰 띠
            ctx.save(); ctx.beginPath(); shield(); ctx.clip();
            ctx.fillStyle = '#f2fbfa';
            ctx.fillRect(cx - S * 0.21, S * 0.16, S * 0.42, S * 0.10);
            ctx.restore();
            // 가운데 어두운 실루엣 (교차 검)
            ctx.save(); ctx.beginPath(); shield(); ctx.clip();
            ctx.strokeStyle = '#12302e'; ctx.lineCap = 'round';
            ctx.lineWidth = S * 0.075;
            ctx.beginPath();
            ctx.moveTo(cx - S * 0.10, S * 0.66); ctx.lineTo(cx + S * 0.11, S * 0.35);
            ctx.moveTo(cx + S * 0.10, S * 0.66); ctx.lineTo(cx - S * 0.11, S * 0.35);
            ctx.stroke();
            ctx.beginPath(); ctx.ellipse(cx, S * 0.50, S * 0.075, S * 0.115, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#12302e'; ctx.fill();
            ctx.restore();
            ctx.beginPath(); shield();
            ctx.lineWidth = S * 0.062; ctx.strokeStyle = ink; ctx.stroke();
        },

        // ---- 유령: 던전 '유령 마을' 배너 ----
        // 배너 배경이 밝은 회색이라 흰 유령이 묻힌다 — 푸른 그림자와 짙은 외곽선으로 실루엣을 세운다.
        ghost(ctx, S) {
            const G = IconGen, cx = S * 0.5;
            const top = S * 0.16, bot = S * 0.86, hw = S * 0.30;
            const body = () => {
                ctx.moveTo(cx - hw, bot - S * 0.12);
                ctx.lineTo(cx - hw, top + hw * 0.6);
                ctx.arc(cx, top + hw * 0.6, hw, Math.PI, 0);          // 둥근 머리
                ctx.lineTo(cx + hw, bot - S * 0.12);
                // 아래 자락 물결 3개
                const w = (hw * 2) / 3;
                for (let i = 0; i < 3; i++) {
                    const x0 = cx + hw - w * i;
                    ctx.quadraticCurveTo(x0 - w * 0.25, bot + S * 0.06, x0 - w * 0.5, bot - S * 0.05);
                    ctx.quadraticCurveTo(x0 - w * 0.75, bot - S * 0.16, x0 - w, bot - S * 0.12);
                }
                ctx.closePath();
            };
            ctx.save();
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#0b1430';
            ctx.filter = `blur(${S * 0.03}px)`;
            ctx.translate(S * 0.015, S * 0.04);
            ctx.beginPath(); body(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); body();
            ctx.fillStyle = G._rad(ctx, cx - hw * 0.4, top + hw * 0.3, S * 0.02, cx, S * 0.55, S * 0.62,
                [[0, '#ffffff'], [0.5, '#e8eefb'], [1, '#b9c6e4']]);
            ctx.fill();
            G._innerShadow(ctx, body, 'rgba(70,90,140,.55)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); body();
            ctx.lineWidth = S * 0.026; ctx.strokeStyle = 'rgba(38,48,78,.8)'; ctx.stroke();

            // 눈 2개 + 벌린 입
            const eye = (ex) => {
                ctx.beginPath();
                ctx.ellipse(ex, top + hw * 0.62, S * 0.055, S * 0.075, 0, 0, Math.PI * 2);
                ctx.fillStyle = '#1b2440'; ctx.fill();
                ctx.beginPath();
                ctx.ellipse(ex - S * 0.018, top + hw * 0.50, S * 0.018, S * 0.024, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
            };
            eye(cx - S * 0.115); eye(cx + S * 0.115);
            ctx.beginPath();
            ctx.ellipse(cx, top + hw * 1.20, S * 0.055, S * 0.075, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#1b2440'; ctx.fill();
        },

        // ---- 좀비: 던전 '좀비 러시' 배너 ----
        zombie(ctx, S) {
            const G = IconGen, cx = S * 0.5, cy = S * 0.52;
            const hw = S * 0.30, hh = S * 0.34;
            const head = () => { ctx.moveTo(cx + hw, cy); ctx.ellipse(cx, cy, hw, hh, 0, 0, Math.PI * 2); };

            ctx.save();
            ctx.globalAlpha = 0.38; ctx.fillStyle = '#000';
            ctx.filter = `blur(${S * 0.02}px)`;
            ctx.translate(0, S * 0.035);
            ctx.beginPath(); head(); ctx.fill();
            ctx.restore();

            ctx.beginPath(); head();
            ctx.fillStyle = G._rad(ctx, cx - hw * 0.35, cy - hh * 0.45, S * 0.02, cx, cy, hw * 1.5,
                [[0, '#b6e88a'], [0.45, '#77bf4a'], [0.78, '#4a8a2c'], [1, '#28551a']]);
            ctx.fill();
            G._innerShadow(ctx, head, 'rgba(16,44,10,.6)', S * 0.05, 0, -S * 0.02);
            ctx.beginPath(); head();
            ctx.lineWidth = S * 0.026; ctx.strokeStyle = 'rgba(18,42,12,.85)'; ctx.stroke();

            // 썩은 자국 2개
            ctx.save();
            ctx.beginPath(); head(); ctx.clip();
            ctx.fillStyle = 'rgba(40,84,26,.55)';
            ctx.beginPath(); ctx.ellipse(cx + hw * 0.45, cy - hh * 0.15, S * 0.06, S * 0.045, 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx - hw * 0.5, cy + hh * 0.35, S * 0.05, S * 0.035, -0.4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // 눈 — 왼쪽은 크게 튀어나오고(흰자+작은 동공) 오른쪽은 감긴 흉터
            ctx.beginPath();
            ctx.ellipse(cx - S * 0.11, cy - S * 0.06, S * 0.075, S * 0.068, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#f6ffe9'; ctx.fill();
            ctx.lineWidth = S * 0.018; ctx.strokeStyle = 'rgba(18,42,12,.8)'; ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx - S * 0.095, cy - S * 0.045, S * 0.028, 0, Math.PI * 2);
            ctx.fillStyle = '#16240e'; ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + S * 0.055, cy - S * 0.075); ctx.lineTo(cx + S * 0.185, cy - S * 0.035);
            ctx.lineWidth = S * 0.028; ctx.strokeStyle = 'rgba(18,42,12,.85)'; ctx.stroke();

            // 입 — 벌어진 채 이가 몇 개만 남은
            const my = cy + S * 0.16;
            ctx.beginPath();
            ctx.moveTo(cx - S * 0.155, my - S * 0.03);
            ctx.quadraticCurveTo(cx, my + S * 0.12, cx + S * 0.155, my - S * 0.03);
            ctx.quadraticCurveTo(cx, my + S * 0.02, cx - S * 0.155, my - S * 0.03);
            ctx.closePath();
            ctx.fillStyle = '#20180f'; ctx.fill();
            ctx.fillStyle = '#f2f6e4';
            ctx.fillRect(cx - S * 0.085, my - S * 0.022, S * 0.045, S * 0.05);
            ctx.fillRect(cx + S * 0.035, my - S * 0.022, S * 0.04, S * 0.042);
        },

        // ---- 채팅 이름줄 성별 심볼 (원본 shot-043500 실측) ----
        // 원본은 이름 뒤에 **색이 있는 성별 아이콘**을 둔다 — 클론은 회색 텍스트 글리프(♀ 1.00%W)라
        // 원본 클러스터(8.42%W) 대비 −7.4%p로 이름줄이 통째로 가벼워 보였다(비평가 2인 공통 1순위 지적).
        // 실측 색: 몸통 rgb(0,48,144)·외곽 rgb(0,0,24)·하이라이트 rgb(240,240,240).
        gender_m(ctx, S) { IconGen._genderSym(ctx, S, false); },
        gender_f(ctx, S) { IconGen._genderSym(ctx, S, true); },

        // ---- 채팅 이름줄 클랜 배지 ----
        // 원본 실측 색: 몸통 rgb(24,0,48)/rgb(24,0,24), 발광 rgb(168,0,240), 금속 하이라이트 rgb(192~240).
        // 뿔이 좌우로 벌어지고 위에 밝은 관이 얹힌 어두운 보라 문장.
        clanbadge(ctx, S) {
            const G = IconGen, cx = S / 2;
            const ink = '#180018', body = '#180030', glow = '#a800f0';
            // 원본 배지는 26×22px = 가로가 1.18배 넓다. `.ico`는 background-size:contain 이라
            // **정사각 캔버스를 넣으면 상자의 짧은 변(세로)에 맞춰져** 가로가 그만큼 좁아진다
            // (교정 전 실측 3.81%W, 목표 5.21%W). 그래서 그림 자체를 세로로 눌러 1.18 비율로 만든다.
            ctx.save();
            ctx.translate(0, S * 0.09);
            ctx.scale(1, 0.84);

            // ① 좌우 뿔 — 배지 위쪽에서 바깥으로 벌어진다
            ctx.save();
            ctx.strokeStyle = ink;
            ctx.lineWidth = S * 0.055;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(cx + s * S * 0.20, S * 0.36);
                ctx.quadraticCurveTo(cx + s * S * 0.46, S * 0.20, cx + s * S * 0.48, S * 0.04);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx + s * S * 0.20, S * 0.36);
                ctx.quadraticCurveTo(cx + s * S * 0.44, S * 0.22, cx + s * S * 0.46, S * 0.07);
                ctx.strokeStyle = glow;
                ctx.lineWidth = S * 0.03;
                ctx.stroke();
                ctx.strokeStyle = ink;
                ctx.lineWidth = S * 0.055;
            }
            ctx.restore();

            // ② 방패 본체 (아래로 뾰족한 문장)
            const shield = () => {
                ctx.beginPath();
                ctx.moveTo(cx - S * 0.30, S * 0.22);
                ctx.lineTo(cx + S * 0.30, S * 0.22);
                ctx.lineTo(cx + S * 0.30, S * 0.62);
                ctx.quadraticCurveTo(cx, S * 0.98, cx - S * 0.30, S * 0.62);
                ctx.closePath();
            };
            shield();
            ctx.fillStyle = ink;
            ctx.lineJoin = 'round';
            ctx.lineWidth = S * 0.10;
            ctx.strokeStyle = ink;
            ctx.stroke();
            ctx.fill();

            ctx.save();
            shield();
            ctx.clip();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.24, 0, S * 0.92,
                [[0, '#4a1070'], [0.55, body], [1, '#0c0018']]);
            ctx.fillRect(0, 0, S, S);
            // 가운데 세로 발광 슬릿 — 원본의 보라 빛줄기
            ctx.fillStyle = glow;
            ctx.globalAlpha = 0.92;
            ctx.fillRect(cx - S * 0.045, S * 0.30, S * 0.09, S * 0.42);
            ctx.globalAlpha = 0.30;
            ctx.fillStyle = G._lin(ctx, cx - S * 0.2, 0, cx + S * 0.2, 0,
                [[0, 'rgba(168,0,240,0)'], [0.5, glow], [1, 'rgba(168,0,240,0)']]);
            ctx.fillRect(cx - S * 0.30, S * 0.22, S * 0.60, S * 0.76);
            ctx.restore();

            // ③ 위에 얹힌 밝은 관
            ctx.beginPath();
            ctx.moveTo(cx - S * 0.25, S * 0.25);
            ctx.lineTo(cx - S * 0.16, S * 0.06);
            ctx.lineTo(cx, S * 0.20);
            ctx.lineTo(cx + S * 0.16, S * 0.06);
            ctx.lineTo(cx + S * 0.25, S * 0.25);
            ctx.closePath();
            ctx.fillStyle = G._lin(ctx, 0, S * 0.06, 0, S * 0.25,
                [[0, '#ffffff'], [1, '#c0c0c0']]);
            ctx.strokeStyle = ink;
            ctx.lineWidth = S * 0.05;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.fill();
            ctx.restore();
        },
    },
};

// 성별 심볼 공용 — 화성(♂)/금성(♀) 기호를 같은 굵기·같은 외곽선으로 그린다.
// 14px 안팎에서 읽혀야 하므로 획을 굵게 잡고 검은 외곽선을 먼저 깔아 흰 배경에서 떠 보이게 한다.
IconGen._genderSym = function (ctx, S, female) {
    const cx = S / 2, ink = '#001030';
    const body = female ? '#e0409f' : '#0030b4';
    const lite = female ? '#ff9ad4' : '#7fc4ff';
    const r = S * 0.215, cy = female ? S * 0.40 : S * 0.60;

    const path = () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (female) {
            ctx.moveTo(cx, cy + r);
            ctx.lineTo(cx, S * 0.92);
            ctx.moveTo(cx - S * 0.15, S * 0.78);
            ctx.lineTo(cx + S * 0.15, S * 0.78);
        } else {
            const d = r * 0.707;
            ctx.moveTo(cx + d, cy - d);
            ctx.lineTo(S * 0.90, S * 0.10);
            ctx.moveTo(S * 0.90, S * 0.10);
            ctx.lineTo(S * 0.58, S * 0.10);
            ctx.moveTo(S * 0.90, S * 0.10);
            ctx.lineTo(S * 0.90, S * 0.42);
        }
    };

    // 원본 성별 기호는 15w x 14.7h 로 거의 정사각(비 1.02)인데, 그대로 그리면 원+화살표가
    // 세로로 길어 비 0.82(18.7h)가 된다(비평가 D 실측 +0.81%p). 세로만 눌러 원본 비로 맞춘다.
    ctx.save();
    ctx.translate(0, S * 0.09);
    ctx.scale(1, 0.82);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path();
    ctx.strokeStyle = ink;
    ctx.lineWidth = S * 0.30;
    ctx.stroke();
    path();
    ctx.strokeStyle = body;
    ctx.lineWidth = S * 0.17;
    ctx.stroke();
    // 좌상단 하이라이트 — 작은 크기에서도 입체로 읽히게
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.55);
    ctx.strokeStyle = lite;
    ctx.lineWidth = S * 0.06;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
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

    // ---- 기술 트리 노드용 단독 모티프 ----
    // 🚨 `sword`·`shield`·`cross`·`burst`·`hourglass`·`sparkle` 는 **`draw` 의 항목이 아니라 `P`(모티프 경로)**다.
    //    `draw` 에 있는 줄 알고 `IconGen.img('sword')` 를 부르면 조용히 빈 문자열이 돌아와 **노드가 빈 원으로
    //    렌더된다**(실제로 그렇게 나왔다). 스킬 오브와 같은 `emblem` 렌더러로 감싸 단독 아이콘으로 등록한다.
    const TECH_MOTIF = {
        tm_sword: ['sword', '#cfd8dc'], tm_shield: ['shield', '#b39ddb'],
        tm_cross: ['cross', '#a5d6a7'], tm_burst: ['burst', '#ffb74d'],
        tm_hourglass: ['hourglass', '#4dd0e1'], tm_sparkle: ['sparkle', '#80cbc4'],
    };
    Object.keys(TECH_MOTIF).forEach((k) => {
        const [motif, color] = TECH_MOTIF[k];
        G.draw[k] = function (ctx, S) { emblem(ctx, S, color, P[motif]); };
    });

    // 스킬 오브에 얹을 심볼 아이콘 HTML. (오브 배경/글로우는 CSS .sk-orb 가 담당)
    G.skill = function (id) { return this.img('sk_' + id, 'sk-ico'); };
})(IconGen);

/* ============================================================================
 * 하단 탭바 아이콘 5종 (기타 슬라이스)
 *
 * 🎨 아트 랭귀지 — 앞 세션이 남긴 '원본 정합 vs AAA 품질' 충돌을 여기서 정한다.
 *   원본 탭바(shot-042120 y808~889)를 9배 확대해 보면 아이콘 화풍이 명확하다:
 *   **두꺼운 검정 키라인 + 평면 채색 + 한 톤 음영 + 점 하이라이트**(슬라임 이마의 흰 점).
 *   즉 원본은 '평면 3색 벡터'도 아니고 '준사실 베벨'도 아닌 **스티커형 카툰 벡터**다.
 *   그래서 재화 아이콘처럼 그라디언트·베벨로 가면 원본 정합에서 감점, 완전 평면으로 가면
 *   품질에서 감점이다 — 이 슬라이스는 **원본의 키라인 언어를 그대로 쓰고 그 안에서
 *   음영·하이라이트로 마감**한다(이 화풍 자체가 AAA 모바일 아이콘의 주류 표현이다).
 *
 * 원본 실측(499×892 · tools/probe-tabbar.js) 잉크 bbox:
 *   던전(해골) 43×43 · 소환(발바닥+슬라임) 49×47 · PVP(방패기) 58×47 · 상점 45×41 px
 *   → 각 아이콘의 잉크가 캔버스의 92% 안팎을 채우고, 가로세로비는 원본 실루엣을 따른다.
 * ============================================================================ */
(function (G) {
    // 키라인은 **순검정**이어야 한다. 원본을 native 499px 폭에서 재면 키라인 평균이
    // rgb(1~6,1~4,1~2)이고 **잉크의 35.8%가 완전한 #000**이다(tools/probe-icon-style.js).
    // 처음 쓴 #0b0d10 은 rgb(13,15,19)로 측정돼 순검정 비율이 0% 였다 — 파란 기가 도는 회색이라
    // 원본의 '검정으로 끊어 주는' 인상이 안 났다.
    // ⚠️ 두께는 건드리지 말 것: 원본 키라인 중앙값 2px(상점 1px)이고 우리도 2px(상점 1px)로 **이미 같다**.
    //   비평가 1인이 '원본 1px vs 클론 3px, 3배 두껍다'며 1순위 수정으로 지목했지만, 그건 합성
    //   이미지(원본은 2.5배 확대 → 보간으로 흐려져 얇게 보이고, 클론은 축소 → 선명)에서 잰 오측정이다.
    //   native 해상도로 각자 재면 같다. 좇아서 얇게 만들면 원본에서 멀어진다.
    const K = '#000';               // 키라인(순검정) — 원본 실측값
    // 스티커 기법: 같은 경로를 굵게 스트로크한 뒤 그 위에 칠한다.
    // 스트로크의 안쪽 절반이 칠에 덮여 **바깥 절반만 남아** 균일한 키라인이 된다.
    const ink = (ctx, S, path, fill, lw) => {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); path();
        ctx.strokeStyle = K; ctx.lineWidth = S * (lw === undefined ? 0.075 : lw);
        ctx.stroke();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
    };
    // 도넛(고리)용 — 서브패스 2개를 evenodd 로 칠해 구멍을 내고, 스트로크는 안팎 양쪽에 키라인을 준다.
    const inkEO = (ctx, S, path, fill, lw) => {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); path();
        ctx.strokeStyle = K; ctx.lineWidth = S * (lw === undefined ? 0.075 : lw);
        ctx.stroke();
        ctx.fillStyle = fill; ctx.fill('evenodd');
        ctx.restore();
    };
    // 키라인 없이 위에 얹는 칠(음영·하이라이트·구멍). clip 안에서 쓰면 실루엣을 안 넘는다.
    const on = (ctx, path, fill) => { ctx.save(); ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); };
    const circle = (ctx, S, x, y, r) => () => ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
    const ell = (ctx, S, x, y, rx, ry, rot) => () => ctx.ellipse(x * S, y * S, rx * S, ry * S, rot || 0, 0, Math.PI * 2);
    const poly = (ctx, S, pts) => () => pts.forEach((p, i) => { const X = p[0] * S, Y = p[1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    const rrect = (ctx, S, x, y, w, h, r) => () => G._rr(ctx, x * S, y * S, w * S, h * S, r * S);
    // 굵은 선분(자루·팔 등) — 스트로크로 그리면 키라인을 못 씌우니 사각형 경로로 만든다
    const bar = (ctx, S, x0, y0, x1, y1, w) => {
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
        const nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
        return poly(ctx, S, [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
    };

    // ---- 던전: 해골 + 관통한 단검 (원본 0번 칸) ----
    G.draw.tab_dungeon = function (ctx, S) {
        // 단검은 **하나의 축 위에** 있어야 한다 — 자루·코등이·칼날·칼끝이 한 직선에서 어긋나면
        // '해골에 꽂힌 검'이 아니라 '해골 옆의 부품들'로 읽힌다(비평가 1순위 지적, 원본 확대에서도 확인).
        const P0 = [0.182, 0.108], P1 = [0.858, 0.856];
        const dx = P1[0] - P0[0], dy = P1[1] - P0[1];
        const at = (t) => [P0[0] + dx * t, P0[1] + dy * t];
        const perp = (t, len) => {                       // 축에 수직인 선분(코등이)
            const L = Math.hypot(dx, dy), nx = (-dy / L) * len / 2, ny = (dx / L) * len / 2;
            const c = at(t);
            return [[c[0] + nx, c[1] + ny], [c[0] - nx, c[1] - ny]];
        };
        const bl = at(0.20), tip = at(1);
        ink(ctx, S, bar(ctx, S, bl[0], bl[1], tip[0], tip[1], 0.115), '#d8d8d8', 0.058);    // 칼날
        const f1 = at(0.86), f2 = at(1);   // 원본의 노출 칼끝은 턱 아래에 살짝 걸치는 작은 조각이다
        ink(ctx, S, poly(ctx, S, [[f1[0] + 0.042, f1[1] - 0.042], [f2[0], f2[1]], [f1[0] - 0.056, f1[1] + 0.056]]), '#3f3f3f', 0.046); // 칼끝 어두운 면
        const g = perp(0.205, 0.300);
        ink(ctx, S, bar(ctx, S, g[0][0], g[0][1], g[1][0], g[1][1], 0.088), '#f07000', 0.052); // 코등이 = 축을 가로지르는 긴 바 하나
        const h0 = at(0.045), h1 = at(0.175);
        ink(ctx, S, bar(ctx, S, h0[0], h0[1], h1[0], h1[1], 0.098), '#5a2b22', 0.050);      // 자루(마룬)
        ink(ctx, S, circle(ctx, S, P0[0], P0[1], 0.049), '#bdbdbd', 0.046);                 // 자루 끝 구슬(원본은 작다)

        // 해골: 원본은 **턱 판이 없다** — 흰 이빨 3개가 두개골 아래로 매달리고 그 사이로 배경이 보인다.
        [0.408, 0.500, 0.592].forEach(x => ink(ctx, S, rrect(ctx, S, x - 0.045, 0.615, 0.090, 0.150, 0.026), '#fff', 0.060));
        ink(ctx, S, circle(ctx, S, 0.500, 0.435, 0.272), '#fff', 0.072);                     // 두개골(순백)
        ctx.save();
        ctx.beginPath(); circle(ctx, S, 0.500, 0.435, 0.272)(); ctx.clip();
        // 원본 음영은 좌·좌하 테두리를 따르는 **좁은 초승달** 한 톤이다(공 같은 반쪽 그림자가 아니다).
        ctx.beginPath();
        ctx.arc(0.500 * S, 0.435 * S, 0.272 * S, Math.PI * 0.55, Math.PI * 1.35);
        ctx.arc(0.560 * S, 0.415 * S, 0.272 * S, Math.PI * 1.35, Math.PI * 0.55, true);
        ctx.closePath();
        ctx.fillStyle = '#b4b4b4'; ctx.fill();
        ctx.restore();
        on(ctx, rrect(ctx, S, 0.356, 0.368, 0.110, 0.222, 0.052), K);                        // 눈구멍(순검정, 원본 세로비 2.0)
        on(ctx, rrect(ctx, S, 0.534, 0.368, 0.110, 0.222, 0.052), K);
        // 원본 해골에는 스페큘러 점이 없다(유일한 반짝임은 칼날의 4각 스파클) — 칼날에만 준다.
        const sp = at(0.30);
        on(ctx, poly(ctx, S, [[sp[0], sp[1] - 0.052], [sp[0] + 0.030, sp[1]], [sp[0], sp[1] + 0.052], [sp[0] - 0.030, sp[1]]]), '#fff');
    };

    // ---- 소환: 발바닥 + 슬라임 + 초록 순환 고리 (원본 2번 칸) ----
    G.draw.tab_summon = function (ctx, S) {
        const paw = '#0b56ab';
        // 발가락은 원본처럼 **크기를 점점 줄여** 패드에 붙인다(균일한 크기·균일한 간격이면 기계적으로 보인다)
        ink(ctx, S, ell(ctx, S, 0.320, 0.585, 0.132, 0.168, -0.16), paw, 0.066);
        [[0.128, 0.415, 0.072], [0.268, 0.318, 0.066], [0.098, 0.612, 0.060], [0.172, 0.762, 0.054]]
            .forEach(t => ink(ctx, S, circle(ctx, S, t[0], t[1], t[2]), paw, 0.058));
        ctx.save();
        ctx.beginPath(); ell(ctx, S, 0.320, 0.585, 0.132, 0.168, -0.16)(); ctx.clip();
        on(ctx, poly(ctx, S, [[0.320, 0.400], [0.470, 0.560], [0.470, 0.780], [0.240, 0.780]]), '#053d80'); // 하드엣지 2톤 분할
        ctx.restore();

        // 초록 순환 고리 — 원본은 **구멍이 뚫린 닫힌 고리**(열린 초승달 아님)에 머리·꼬리 스파이크가 붙는다.
        const G1 = '#22f03c', rx = 0.600, ry = 0.330, R = 0.172, r = 0.082;
        inkEO(ctx, S, () => {
            ctx.moveTo((rx + R) * S, ry * S); ctx.arc(rx * S, ry * S, R * S, 0, Math.PI * 2);
            ctx.moveTo((rx + r) * S, ry * S); ctx.arc(rx * S, ry * S, r * S, 0, Math.PI * 2);
        }, G1, 0.060);
        ink(ctx, S, poly(ctx, S, [[0.700, 0.128], [0.828, 0.238], [0.664, 0.286]]), G1, 0.052);   // 머리 스파이크
        ink(ctx, S, poly(ctx, S, [[0.452, 0.436], [0.560, 0.500], [0.446, 0.540]]), G1, 0.050);   // 꼬리 노치
        ctx.save();                                                                               // 고리 아래쪽 어두운 초록
        ctx.beginPath();
        ctx.moveTo((rx + R) * S, ry * S); ctx.arc(rx * S, ry * S, R * S, 0, Math.PI * 2);
        ctx.moveTo((rx + r) * S, ry * S); ctx.arc(rx * S, ry * S, r * S, 0, Math.PI * 2);
        ctx.clip('evenodd');
        on(ctx, rrect(ctx, S, rx - R, ry + R * 0.42, R * 2, R, 0), '#12ab27');
        ctx.restore();
        ink(ctx, S, poly(ctx, S, [[0.884, 0.428], [0.930, 0.470], [0.902, 0.520], [0.848, 0.492]]), '#ffb400', 0.046); // 금 스파클

        // 슬라임 — 원본 몸통은 **물방울/플라스크**다: 둥근 아래 + 비스듬한 목 + 우상단 부리.
        const cx = 0.662, cy = 0.706, rr = 0.212, beak = [0.868, 0.492];
        const body = () => {
            ctx.moveTo(beak[0] * S, beak[1] * S);
            // -20° → 300°: 남는 각(=목/부리)이 **32°**뿐이라 몸통은 원본처럼 거의 둥글다.
            // 90°를 남겼더니 큰 사선 절단면이 생겨 '잘린 반달'로 읽혔고, 50°에서도 좌상단 절단면이
            // 눈에 보였다(원본은 그 부위가 발바닥·고리에 가려 안 보인다) — 두 번 줄여 32°로 맞췄다.
            ctx.arc(cx * S, cy * S, rr * S, -0.35, 5.24);
            ctx.closePath();
        };
        ink(ctx, S, body, '#3fcdf5', 0.068);
        ctx.save();
        ctx.beginPath(); body(); ctx.clip();
        on(ctx, circle(ctx, S, 0.790, 0.830, 0.180), '#1c9fd4');                              // 아래 음영
        ctx.restore();
        // 벌린 입: 원본은 몸통 폭의 55% 에 두꺼운 검정 입술 — anticlockwise:true 라야 아래로 벌어진다
        ink(ctx, S, () => { ctx.moveTo((cx - 0.128) * S, 0.700 * S); ctx.arc(cx * S, 0.700 * S, 0.128 * S, Math.PI, 0, true); ctx.closePath(); }, '#ff0d0d', 0.056);
        // 스페큘러는 원본처럼 **번지는** 느낌 — 단단한 원반이 아니라 부드러운 그라디언트
        on(ctx, circle(ctx, S, 0.598, 0.572, 0.062), G._rad(ctx, 0.598 * S, 0.572 * S, 0, 0.598 * S, 0.572 * S, 0.062 * S, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,.92)'], [1, 'rgba(255,255,255,0)']]));
    };

    // ---- PVP: 방패 깃발 + 교차 검 (원본 3번 칸) ----
    G.draw.tab_pvp = function (ctx, S) {
        // 천은 **중성 차콜**이다(원본은 채도 0의 #1a1a1a 계열 — 파란 기가 도는 슬레이트가 아니다).
        // 폭도 깃대 배럴을 꽉 채운다(원본은 천이 배럴과 같은 폭, 우리 첫 시안은 75%라 봉이 튀어나왔다).
        // 원본 천은 **납작한 펜넌트**(가로세로비 1.19)이고 V 테이퍼가 높이의 아래 34% 뿐이다.
        // 우리 첫 시안은 1.05·44% 로 세로로 길어 '연(kite)' 처럼 보였다.
        const cloth = () => poly(ctx, S, [[0.140, 0.246], [0.860, 0.246], [0.860, 0.678], [0.500, 0.862], [0.140, 0.678]])();
        ink(ctx, S, cloth, '#1a1a1a', 0.070);
        ctx.save();
        ctx.beginPath(); cloth(); ctx.clip();
        on(ctx, ell(ctx, S, 0.500, 0.305, 0.310, 0.110), '#262626');                          // 상단만 살짝 밝게(부드러운 형태)
        ctx.restore();

        // 교차 검은 **천 안에 완전히 들어가야** 한다 — 첫 시안은 위·좌·우로 삐져나가 실루엣을 깼다.
        const sword = (hx, hy, tx, ty) => {
            const ang = Math.atan2(ty - hy, tx - hx), L = Math.hypot(tx - hx, ty - hy);
            ctx.save();
            ctx.translate(hx * S, hy * S); ctx.rotate(ang + Math.PI / 2);
            const u = (v) => -v * L, w = 0.047;
            ink(ctx, S, poly(ctx, S, [[-w, u(0.16)], [w, u(0.16)], [w, u(0.86)], [0, u(1.0)], [-w, u(0.86)]]), '#ffb200', 0.044);
            on(ctx, poly(ctx, S, [[0, u(0.16)], [w, u(0.16)], [w, u(0.86)], [0, u(1.0)]]), '#a86b00');
            on(ctx, poly(ctx, S, [[-w * 0.34, u(0.20)], [w * 0.34, u(0.20)], [w * 0.34, u(0.84)], [0, u(0.94)]]), '#ffd200'); // 밝은 코어 스트라이프
            ink(ctx, S, poly(ctx, S, [[-0.082, u(0.185)], [0.082, u(0.185)], [0.082, u(0.125)], [-0.082, u(0.125)]]), '#ffb200', 0.040); // 코등이(얇고 길게)
            ink(ctx, S, circle(ctx, S, -0.082, u(0.155), 0.030), '#ffb200', 0.038);            // 코등이 끝 구슬 2개 (분리)
            ink(ctx, S, circle(ctx, S, 0.082, u(0.155), 0.030), '#ffb200', 0.038);
            ink(ctx, S, poly(ctx, S, [[-0.022, u(0.12)], [0.022, u(0.12)], [0.022, u(0.01)], [-0.022, u(0.01)]]), '#a86b00', 0.038); // 자루
            ink(ctx, S, circle(ctx, S, 0, u(-0.03), 0.034), '#ffb200', 0.038);                 // 자루 끝 구슬
            ctx.restore();
        };
        sword(0.374, 0.726, 0.646, 0.392);
        sword(0.626, 0.726, 0.354, 0.392);

        // 깃대 = 마구리 → 좁은 목(칼라) → 배럴. 원본은 마구리·배럴이 딱 2톤으로 갈린다.
        const rod = (x, y, w, h, r) => {
            ink(ctx, S, rrect(ctx, S, x, y, w, h, r), '#ffad00', 0.052);
            ctx.save();
            ctx.beginPath(); G._rr(ctx, x * S, y * S, w * S, h * S, r * S); ctx.clip();
            on(ctx, rrect(ctx, S, x, y + h * 0.55, w, h * 0.45, 0), '#986700');                // 아래 45% 어두운 금
            ctx.restore();
        };
        // 마구리는 원본처럼 **얇고 긴 페룰**(가로:세로 ≈ 1:4)이고, 배럴과 작은 너브로 이어진다.
        // 첫 시안은 정사각에 가까운 뭉툭한 캡을 배럴에 바로 붙여 '아령'처럼 보였다.
        ink(ctx, S, rrect(ctx, S, 0.086, 0.146, 0.828, 0.040, 0.016), '#986700', 0.030);        // 배럴↔페룰 연결 너브
        rod(0.140, 0.108, 0.720, 0.126, 0.046);                                                 // 배럴(원본만큼 굵게)
        rod(0.036, 0.070, 0.062, 0.212, 0.024);                                                 // 왼 페룰
        rod(0.902, 0.070, 0.062, 0.212, 0.024);                                                 // 오른 페룰
    };

    // ---- 퀘스트: 양피지 두루마리 (사용자 지시 2026-08-18 — 소환과 상점 사이 새 탭) ----
    // 원본 탭바에 대응 칸이 없는 신규 아이콘이라, 형태는 옆 4종과 같은 규약으로만 맞춘다:
    // ⓐ 순검정 키라인 하나로 실루엣을 끊고 ⓑ 채움은 2톤(밝은 면 + 아래 40% 그림자)
    // ⓒ 스페큘러는 한 점만 ⓓ 50px 축소에서 뭉개지지 않게 내부 디테일은 3개 이하.
    // 두루마리는 '위·아래 말린 봉 + 가운데 펼친 종이 + 글줄 3개'가 이 크기에서 가장 잘 읽힌다
    // (봉을 좌우에 두는 가로형은 축소하면 글줄이 1px로 사라져 빈 사각형이 된다).
    G.draw.tab_quest = function (ctx, S) {
        const paper = '#f6e3b8', shade = '#d8bd85', rod = '#a2643a', rodDark = '#6d3f22';
        // 펼친 종이 — 좌우 가장자리가 살짝 안으로 휘어 '팽팽한 면'으로 읽힌다
        const sheet = () => {
            ctx.moveTo(0.196 * S, 0.212 * S);
            ctx.bezierCurveTo(0.166 * S, 0.500 * S, 0.166 * S, 0.560 * S, 0.196 * S, 0.836 * S);
            ctx.lineTo(0.804 * S, 0.836 * S);
            ctx.bezierCurveTo(0.834 * S, 0.560 * S, 0.834 * S, 0.500 * S, 0.804 * S, 0.212 * S);
            ctx.closePath();
        };
        ink(ctx, S, sheet, paper, 0.068);
        ctx.save();
        ctx.beginPath(); sheet(); ctx.clip();
        on(ctx, rrect(ctx, S, 0.150, 0.612, 0.700, 0.300, 0), shade);          // 아래 40% 그림자(옆 아이콘과 같은 처리)
        ctx.restore();
        // 글줄 3개 — 길이를 달리 줘야 '글'로 읽힌다(같은 길이면 줄무늬 무늬가 된다)
        [[0.300, 0.392, 0.400], [0.300, 0.516, 0.330], [0.300, 0.640, 0.250]]
            .forEach(([x, y, w]) => on(ctx, rrect(ctx, S, x, y, w, 0.052, 0.026), 'rgba(20,16,10,.72)'));
        // 위·아래 말린 봉 — 종이보다 넓게 빼서 '감긴 축'이 되게 한다
        [0.116, 0.788].forEach(y => {
            ink(ctx, S, rrect(ctx, S, 0.106, y, 0.788, 0.130, 0.062), rod, 0.056);
            ctx.save();
            ctx.beginPath(); G._rr(ctx, 0.106 * S, y * S, 0.788 * S, 0.130 * S, 0.062 * S); ctx.clip();
            on(ctx, rrect(ctx, S, 0.106, y + 0.074, 0.788, 0.070, 0), rodDark);
            ctx.restore();
        });
        on(ctx, ell(ctx, S, 0.286, 0.152, 0.086, 0.030), 'rgba(255,255,255,.62)');   // 스페큘러 1점(위 봉)
    };

    // ---- 상점: 줄무늬 어닝 가게 (원본 4번 칸) ----
    G.draw.tab_shop = function (ctx, S) {
        // 원본의 폭 위계: 간판 > 어닝 > 건물, 그리고 바닥 바가 건물보다 양옆으로 튀어나온다.
        // 첫 시안은 셋이 같은 폭이라 '처마가 덮은' 인상이 없었다.
        ink(ctx, S, rrect(ctx, S, 0.070, 0.818, 0.860, 0.070, 0.016), '#3c4149', 0.050);        // 바닥 바(건물보다 넓다)
        ink(ctx, S, rrect(ctx, S, 0.185, 0.452, 0.630, 0.372, 0.018), '#dcdcdc', 0.062);        // 건물
        on(ctx, rrect(ctx, S, 0.185, 0.452, 0.630, 0.055, 0), '#b9b9b9');                       // 건물 상단 어두운 띠
        ink(ctx, S, rrect(ctx, S, 0.228, 0.536, 0.150, 0.288, 0.014), '#008f96', 0.046);        // 문
        on(ctx, rrect(ctx, S, 0.246, 0.556, 0.042, 0.248, 0.010), '#00b0b8');                   // 문 광택
        ink(ctx, S, rrect(ctx, S, 0.408, 0.536, 0.372, 0.196, 0.014), '#009090', 0.046);        // 창(원본 실측 H180 S100)
        on(ctx, rrect(ctx, S, 0.408, 0.690, 0.372, 0.042, 0), '#017083');                       // 창 아래 테두리 음영
        ink(ctx, S, rrect(ctx, S, 0.398, 0.732, 0.392, 0.036, 0.012), '#c4c4c4', 0.040);        // 창 아래 선반(원본에 있다)

        // 어닝: 큰 스캘럽 7개 + **각 스캘럽 아래 40% 자기 그림자**(원본은 이 2단 띠가 뚜렷하다)
        const ax0 = 0.098, ax1 = 0.902, ay = 0.286, ah = 0.180, n = 7, sw = (ax1 - ax0) / n;
        const skirt = () => {
            ctx.moveTo(ax0 * S, ay * S);
            ctx.lineTo(ax1 * S, ay * S);
            ctx.lineTo(ax1 * S, (ay + ah * 0.42) * S);
            for (let i = n - 1; i >= 0; i--) ctx.arc((ax0 + sw * i + sw / 2) * S, (ay + ah * 0.42) * S, (sw / 2) * S, 0, Math.PI, false);
            ctx.lineTo(ax0 * S, ay * S);
            ctx.closePath();
        };
        ink(ctx, S, skirt, '#fff', 0.058);
        ctx.save();
        ctx.beginPath(); skirt(); ctx.clip();
        for (let i = 0; i < n; i++) {
            const x = ax0 + sw * i, red = i % 2 === 0;
            on(ctx, rrect(ctx, S, x, ay, sw, ah, 0), red ? '#e00000' : '#fff');
            on(ctx, rrect(ctx, S, x, ay + ah * 0.40, sw, ah, 0), red ? '#a30000' : '#d0d0d0');   // 로브별 아래 그림자
            // 원본은 **패널마다 검정 구분선**이 있다. 없으면 50px 에서 붉은/흰이 뭉개져 '사탕 띠'가 된다.
            if (i) on(ctx, rrect(ctx, S, x - 0.006, ay, 0.012, ah, 0), K);
        }
        ctx.restore();
        // 간판: 두꺼운 외곽선 없이 얇게 + 위쪽에 짙은 앰버 림만(원본과 같은 처리)
        ink(ctx, S, rrect(ctx, S, 0.082, 0.222, 0.836, 0.064, 0.018), '#ff8c00', 0.034);
        on(ctx, rrect(ctx, S, 0.082, 0.222, 0.836, 0.018, 0.008), '#c96a00');
    };

    // ---- 디버그: 무당벌레 (배포 탭바에서는 숨김 — ?debug= 로만 노출) ----
    G.draw.tab_debug = function (ctx, S) {
        [[-1, 0.30], [-1, 0.52], [-1, 0.74], [1, 0.30], [1, 0.52], [1, 0.74]].forEach(([s, y]) =>
            ink(ctx, S, bar(ctx, S, 0.5 + s * 0.16, y, 0.5 + s * 0.40, y - 0.06, 0.055), '#26292f', 0.045));
        ink(ctx, S, circle(ctx, S, 0.500, 0.230, 0.135), '#26292f', 0.062);                   // 머리
        ink(ctx, S, ell(ctx, S, 0.500, 0.590, 0.290, 0.320), '#e01010', 0.072);               // 몸통
        ctx.save();
        ctx.beginPath(); ell(ctx, S, 0.500, 0.590, 0.290, 0.320)(); ctx.clip();
        on(ctx, rrect(ctx, S, 0.478, 0.270, 0.044, 0.650, 0), K);                             // 등 가운데 줄
        [[0.340, 0.470, 0.062], [0.660, 0.470, 0.062], [0.375, 0.720, 0.052], [0.625, 0.720, 0.052]]
            .forEach(d => on(ctx, circle(ctx, S, d[0], d[1], d[2]), K));                      // 점
        on(ctx, circle(ctx, S, 0.640, 0.760, 0.170), 'rgba(0,0,0,.16)');                      // 아래 음영
        ctx.restore();
        on(ctx, circle(ctx, S, 0.400, 0.400, 0.052), 'rgba(255,255,255,.92)');                // 점 하이라이트
    };

    // 탭바 아이콘 HTML. 크기는 CSS(#tabbar .tab-ico)가 원본 실측 비율로 잡는다.
    G.tab = function (name) { return this.img('tab_' + name, 'tab-ico'); };

    // 스티커 화법 헬퍼를 밖으로 낸다 — 아래 상점 보석 묶음처럼 **같은 화풍**으로 그려야 하는
    // 아이콘이 이 블록을 복사하지 않게 하려는 것이다(정의는 여기 하나만 남는다).
    G._sticker = { K, ink, inkEO, on, circle, ell, poly, rrect, bar };
})(IconGen);

/* ============================================================================
 * 상점 보석 패키지 3종 (원본 shot-042632 하단 '보석' 섹션)
 *
 * 원본 3배 확대 실측: 이모지(🪙👛💰)가 아니라 **전부 같은 붉은 보석 묶음**이다 — 양이 늘수록
 *   ① 낱개 6개 피라미드 → ② 보석이 넘치는 자루 → ③ 테두리 두른 큰 항아리 로 커진다.
 *   클론이 쓰던 금화·지갑·돈자루 이모지는 '보석 패키지'라는 정체성 자체가 달랐다(색도 노랑이었다).
 * 색 실측: 보석 링 rgb(239,32,77) · 안쪽 rgb(255,157,186) · 자루/항아리 몸통 rgb(121,52,45).
 * 화풍은 탭바와 같은 스티커형(두꺼운 순검정 키라인 + 평면 채색 + 한 톤 음영).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, circle, ell, rrect } = G._sticker;
    const RED = '#ef204d', PINK = '#ff9dba', WOOD = '#79342d', WOOD_DK = '#4d1f1a';

    // 낱개 보석 — 원본은 각진 보석이 아니라 **동그란 도넛형**이다(링 + 밝은 속 + 키라인).
    const gemDot = (ctx, S, x, y, r) => {
        // ⚠️ 키라인 두께는 **보석 반지름에 비례**해야 한다 — 고정 두께로 두면 낱개가 작은 ②③에서
        // 검정이 알을 통째로 먹어 '어두운 덩어리'로 읽힌다(1차 렌더에서 실제로 그랬다).
        ink(ctx, S, circle(ctx, S, x, y, r), RED, r * 0.34);
        ink(ctx, S, circle(ctx, S, x, y, r * 0.50), PINK, r * 0.22);
        on(ctx, circle(ctx, S, x - r * 0.32, y - r * 0.36, r * 0.17), 'rgba(255,255,255,.8)');
    };
    const ground = (ctx, S, x, y, rx, ry) => on(ctx, ell(ctx, S, x, y, rx, ry), 'rgba(0,0,0,.13)');

    // ① 60젬 — 낱개 6개 피라미드(아래 3 · 가운데 2 · 위 1)
    G.draw.shop_gems1 = function (ctx, S) {
        ground(ctx, S, 0.50, 0.815, 0.36, 0.075);
        const r = 0.118;
        [[0.255, 0.735], [0.500, 0.735], [0.745, 0.735]].forEach(p => gemDot(ctx, S, p[0], p[1], r));
        [[0.378, 0.560], [0.622, 0.560]].forEach(p => gemDot(ctx, S, p[0], p[1], r));
        gemDot(ctx, S, 0.500, 0.385, r);
    };

    // ② 220젬 — 보석이 목까지 차 넘치는 자루
    G.draw.shop_gems2 = function (ctx, S) {
        ground(ctx, S, 0.52, 0.900, 0.30, 0.058);
        // 자루 몸통(아래가 무겁게 퍼진 물방울) + 목
        ink(ctx, S, ell(ctx, S, 0.545, 0.680, 0.245, 0.215), WOOD, 0.060);
        ink(ctx, S, rrect(ctx, S, 0.435, 0.395, 0.225, 0.150, 0.045), WOOD, 0.055);
        ctx.save(); ctx.beginPath(); ell(ctx, S, 0.545, 0.680, 0.245, 0.215)(); ctx.clip();
        on(ctx, ell(ctx, S, 0.700, 0.760, 0.200, 0.190), 'rgba(0,0,0,.22)');   // 오른쪽 아래 음영
        on(ctx, rrect(ctx, S, 0.500, 0.470, 0.030, 0.400, 0.015), 'rgba(0,0,0,.18)'); // 주름
        ctx.restore();
        // 목 위로 솟은 보석 3개
        [[0.455, 0.345, 0.088], [0.560, 0.300, 0.092], [0.655, 0.355, 0.084]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        // 앞으로 굴러 나온 보석 3개
        [[0.215, 0.735, 0.082], [0.310, 0.815, 0.082], [0.170, 0.850, 0.076]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
    };

    // ③ 800젬 — 테두리 두른 큰 항아리, 앞줄에 보석이 줄지어 쏟아진다
    G.draw.shop_gems3 = function (ctx, S) {
        ground(ctx, S, 0.50, 0.925, 0.38, 0.055);
        ink(ctx, S, ell(ctx, S, 0.500, 0.680, 0.335, 0.255), WOOD, 0.058);
        ctx.save(); ctx.beginPath(); ell(ctx, S, 0.500, 0.680, 0.335, 0.255)(); ctx.clip();
        on(ctx, ell(ctx, S, 0.720, 0.800, 0.270, 0.230), 'rgba(0,0,0,.22)');
        on(ctx, rrect(ctx, S, 0.470, 0.440, 0.028, 0.480, 0.014), 'rgba(0,0,0,.16)');
        ctx.restore();
        ink(ctx, S, rrect(ctx, S, 0.245, 0.375, 0.510, 0.090, 0.038), WOOD_DK, 0.052);  // 아가리 테
        // 테 위로 넘치는 보석
        [[0.360, 0.315, 0.078], [0.470, 0.285, 0.082], [0.585, 0.310, 0.078], [0.675, 0.340, 0.070]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
        // 앞줄로 쏟아진 보석
        [[0.240, 0.830, 0.076], [0.375, 0.860, 0.076], [0.510, 0.868, 0.076], [0.645, 0.848, 0.076]]
            .forEach(p => gemDot(ctx, S, p[0], p[1], p[2]));
    };
})(IconGen);

/* ============================================================================
 * 상점 '오늘의 특가' 3종 상품 일러스트 (원본 shot-042632 · 5배 확대 실측)
 *
 * 종전 클론은 `.shop-deal-art` 를 CSS 그라디언트 상자 + 회색 금속판 위 이모지(🔧🐾⚙️)로
 * 그렸다. 원본을 확대해 보면 셋 다 **3/4 부감 나무 상자 + 상자 앞에 놓인 소품**이고,
 * 상자 색·소품·앞면 표식이 거래 종류마다 다르다(인계 메모 ㉥ — "이모지를 아이콘으로"만
 * 생각하면 틀린 그림을 그린다):
 *   ① 기술 = 적갈색 목상자 + 앞면에 검은 렌치, 앞에 붉은 물약 2병
 *   ② 펫   = 골판지 상자(윗면 접이선·앞면 공기구멍 2개) + 회색 발바닥 도장, 앞에 공 장난감·초록 링
 *   ③ 탈것 = 짙은 초록 궤짝(가로 널판 + 말굽 표식) + 위로 넘치는 주황 태엽 더미, 앞에 흘린 태엽
 *
 * 실측(앱 폭 490 기준 — ⚠️ 이미지 폭 500 이 아니다, `probe-shop-art-ref.js` 머리말):
 *   일러 바운딩 박스 x 307~418(22.9%W) · y 189~258(7.9%H) · 종횡비 1.52.
 *   그래서 이 3종만 **가로로 긴 캔버스**(`IconGen.ASPECT` 1.52)에 그린다. 정사각으로 그리면
 *   `.ico { background-size: contain }` 이 세로에 맞춰 줄여 프레임 좌우가 텅 빈다.
 * 좌표계: 세로 1.0 을 단위로 쓰고 x 는 0~1.52 를 쓴다 — `_sticker` 헬퍼가 두 축 모두 S(세로
 *   픽셀)를 곱하므로 별도 변환 없이 그대로 맞는다.
 * ============================================================================ */
(function (G) {
    const { K, ink, inkEO, on, circle, ell, poly, rrect, bar } = G._sticker;

    // 상자 공통 기하 (원본 5배 확대에서 딴 값을 위 좌표계로 환산)
    const FX0 = 0.260, FX1 = 1.245;          // 앞면 좌·우
    const DX = 0.232, DY = -0.185;           // 깊이 벡터(뒤·위)
    const LW = 0.052;                        // 키라인 두께

    // 3/4 부감 상자. 윗면 → 오른면 → 앞면 순서로 그린다(앞면이 마지막이라 모서리 키라인이
    // 겹쳐 두꺼워지지 않는다). y0/y1 은 거래마다 다르다(탈것 궤짝은 낮고 넓다).
    const crate = (ctx, S, c, y0, y1) => {
        ink(ctx, S, poly(ctx, S, [[FX0, y0], [FX1, y0], [FX1 + DX, y0 + DY], [FX0 + DX, y0 + DY]]), c.top, LW);
        ink(ctx, S, poly(ctx, S, [[FX1, y0], [FX1 + DX, y0 + DY], [FX1 + DX, y1 + DY], [FX1, y1]]), c.side, LW);
        ink(ctx, S, rrect(ctx, S, FX0, y0, FX1 - FX0, y1 - y0, 0.028), c.front, LW);
    };
    // 앞면 안쪽에만 얹는 칠(널판 이음선·표식) — 클립해서 키라인을 넘지 않게 한다.
    const onFront = (ctx, S, y0, y1, fn) => {
        ctx.save();
        ctx.beginPath(); rrect(ctx, S, FX0, y0, FX1 - FX0, y1 - y0, 0.028)(); ctx.clip();
        fn();
        ctx.restore();
    };
    const shadow = (ctx, S, x, rx) => on(ctx, ell(ctx, S, x, 0.905, rx, 0.062), 'rgba(0,0,0,.15)');

    // ---- ① 기술 거래 — 적갈색 목상자 + 렌치, 앞에 물약 2병 ----
    const TEAL = '#5ab6c8', GLASS_DK = '#2e7f92', LIQ = '#b01221', LIQ_DK = '#7d0a16', CORK = '#c39a2e';

    // 물약: 목(뒤) → 병(앞) 순. 원본은 **유리 테가 청록, 속 액체가 검붉은색**이다.
    const flask = (ctx, S, x, y, r, neck) => {
        ink(ctx, S, rrect(ctx, S, x - r * 0.30, y - r - neck, r * 0.60, neck + r * 0.7, r * 0.16), TEAL, LW * 0.85);
        ink(ctx, S, rrect(ctx, S, x - r * 0.38, y - r - neck - r * 0.34, r * 0.76, r * 0.40, r * 0.10), CORK, LW * 0.85);
        ink(ctx, S, circle(ctx, S, x, y, r), TEAL, LW);
        on(ctx, circle(ctx, S, x, y + r * 0.06, r * 0.74), LIQ);
        on(ctx, ell(ctx, S, x + r * 0.34, y + r * 0.40, r * 0.44, r * 0.34), LIQ_DK);
        on(ctx, circle(ctx, S, x - r * 0.34, y - r * 0.30, r * 0.17), 'rgba(255,255,255,.85)');
        on(ctx, rrect(ctx, S, x - r * 0.22, y - r - neck * 0.85, r * 0.16, neck * 0.62, r * 0.08), 'rgba(255,255,255,.55)');
    };

    G.draw.shop_tech = function (ctx, S) {
        const y0 = 0.250, y1 = 0.778;
        shadow(ctx, S, 0.78, 0.52);
        crate(ctx, S, { front: '#96604f', top: '#b07a66', side: '#6d4034' }, y0, y1);
        onFront(ctx, S, y0, y1, () => {
            on(ctx, rrect(ctx, S, FX0, y0, FX1 - FX0, 0.100, 0), 'rgba(255,255,255,.16)');          // 뚜껑 판(밝게)
            on(ctx, rrect(ctx, S, FX0, y0 + 0.100, FX1 - FX0, 0.030, 0.012), 'rgba(0,0,0,.72)');    // 뚜껑 이음선
            on(ctx, rrect(ctx, S, FX0 + 0.070, y0 + 0.130, 0.026, y1 - y0, 0), 'rgba(0,0,0,.52)');  // 왼쪽 기둥
            on(ctx, rrect(ctx, S, FX1 - 0.096, y0 + 0.130, 0.026, y1 - y0, 0), 'rgba(0,0,0,.52)');  // 오른쪽 기둥
            on(ctx, rrect(ctx, S, FX0, y1 - 0.070, FX1 - FX0, 0.070, 0), 'rgba(0,0,0,.16)');        // 아래턱 음영
        });
        // 윗면 널판 이음선
        on(ctx, poly(ctx, S, [[FX0 + DX * 0.52, y0 + DY * 0.52], [FX1 + DX * 0.52, y0 + DY * 0.52],
            [FX1 + DX * 0.52 + 0.012, y0 + DY * 0.52 + 0.026], [FX0 + DX * 0.52 + 0.012, y0 + DY * 0.52 + 0.026]]), 'rgba(0,0,0,.34)');

        // 렌치 — 자루(둥근 꼬리)와 열린 C 머리를 **한 경로**로 그린다. ink()가 먼저 스트로크하고
        // 그 위에 칠하므로 두 서브패스가 겹친 안쪽 키라인은 칠에 덮여 사라진다(윤곽만 남는다).
        ctx.save();
        ctx.translate(0.570 * S, 0.632 * S); ctx.rotate(-0.40);
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        G._rrSub(ctx, -0.075 * S, -0.038 * S, 0.415 * S, 0.076 * S, 0.038 * S); // 자루
        ctx.moveTo(0.415 * S + 0.118 * S, 0);                                    // 열린 C 머리(오른쪽으로 벌어짐)
        ctx.arc(0.415 * S, 0, 0.118 * S, 0.22 * Math.PI, 1.78 * Math.PI);
        ctx.arc(0.415 * S, 0, 0.056 * S, 1.78 * Math.PI, 0.22 * Math.PI, true);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 0.026 * S; ctx.stroke();
        ctx.fillStyle = '#17171a'; ctx.fill();
        ctx.restore();

        flask(ctx, S, 0.145, 0.700, 0.138, 0.142);
        flask(ctx, S, 0.312, 0.748, 0.116, 0.100);
    };

    // ---- ② 펫 거래 — 골판지 상자 + 발바닥 도장, 앞에 공·초록 링 ----
    G.draw.shop_pet = function (ctx, S) {
        const y0 = 0.250, y1 = 0.778;
        shadow(ctx, S, 0.78, 0.52);
        crate(ctx, S, { front: '#a5764a', top: '#bd8d5f', side: '#7b5533' }, y0, y1);
        // 윗면 접이선 2줄(골판지 뚜껑) — 앞모서리에서 뒤로 간다
        on(ctx, bar(ctx, S, FX0 + 0.30, y0, FX0 + 0.30 + DX, y0 + DY, 0.020), 'rgba(0,0,0,.30)');
        on(ctx, bar(ctx, S, FX1 - 0.14, y0, FX1 - 0.14 + DX, y0 + DY, 0.020), 'rgba(0,0,0,.30)');
        onFront(ctx, S, y0, y1, () => {
            on(ctx, circle(ctx, S, 0.400, 0.400, 0.042), '#3a2415');    // 공기구멍
            on(ctx, circle(ctx, S, 1.110, 0.400, 0.042), '#3a2415');
        });
        // 발바닥 도장 — 발가락 4개(바깥 2개가 아래로 처진 부채꼴) + 아래 넓은 패드.
        // ⚠️ 1차 렌더에서 발가락을 작게(rx .036) 잡았더니 106px 프레임에서 '알약 4개'로 읽혔다 —
        //    발가락은 패드 폭의 1/3 이상이어야 발바닥으로 읽힌다.
        const PAW = '#c9c9c9';
        [[0.678, 0.487, 0.046, 0.058], [0.792, 0.440, 0.048, 0.061],
         [0.908, 0.440, 0.048, 0.061], [1.020, 0.487, 0.046, 0.058]]
            .forEach(t => ink(ctx, S, ell(ctx, S, t[0], t[1], t[2], t[3]), PAW, LW * 0.62));
        ink(ctx, S, ell(ctx, S, 0.850, 0.645, 0.148, 0.098), PAW, LW * 0.62);

        // 소품: 뒤쪽 공 → 앞쪽 공 → 초록 링 순(뒤에서 앞으로).
        // ⚠️ 1차 렌더는 흰 공 위에 새까만 원을 얹어 **눈알 두 개**로 읽혔다 — 검정 얼룩은
        //    공의 위쪽 가장자리를 물고 지나가는 띠여야 하고, 아래엔 회색 음영이 있어야 공이 된다.
        const ballTop = (x, y, r) => {
            ctx.save(); ctx.beginPath(); circle(ctx, S, x, y, r)(); ctx.clip();
            on(ctx, ell(ctx, S, x - r * 0.30, y - r * 0.86, r * 0.92, r * 0.62, -0.35), '#33333a');
            on(ctx, ell(ctx, S, x + r * 0.30, y + r * 0.52, r * 0.85, r * 0.60), 'rgba(0,0,0,.16)');
            ctx.restore();
            on(ctx, circle(ctx, S, x - r * 0.34, y + r * 0.10, r * 0.20), 'rgba(255,255,255,.9)');
        };
        ink(ctx, S, circle(ctx, S, 0.300, 0.612, 0.112), '#e9e9ea', LW);
        ballTop(0.300, 0.612, 0.112);
        ink(ctx, S, circle(ctx, S, 0.162, 0.742, 0.140), '#e9e9ea', LW);
        ballTop(0.162, 0.742, 0.140);
        inkEO(ctx, S, () => { ell(ctx, S, 0.480, 0.808, 0.175, 0.086)(); ell(ctx, S, 0.480, 0.808, 0.094, 0.036)(); }, '#1c7a2a', LW);
    };

    // ---- ③ 탈것 거래 — 초록 궤짝 + 넘치는 태엽 ----
    // 태엽 하나 = 주황 고리(도넛) + 노란 축. 더미로 쌓이면 원본처럼 '주황 뭉치에 노란 조각'으로 읽힌다.
    const winder = (ctx, S, x, y, sc, rot) => {
        ctx.save();
        ctx.translate(x * S, y * S); ctx.rotate(rot); ctx.scale(sc * S, sc * S);
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath(); G._rrSub(ctx, 0.30, -0.15, 0.82, 0.30, 0.15);
        ctx.strokeStyle = K; ctx.lineWidth = 0.22; ctx.stroke();
        ctx.fillStyle = '#ffc21e'; ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 0.52, 0, Math.PI * 2);
        ctx.arc(0, 0, 0.23, 0, Math.PI * 2, true);
        ctx.strokeStyle = K; ctx.lineWidth = 0.22; ctx.stroke();
        ctx.fillStyle = '#f4791f'; ctx.fill('evenodd');
        ctx.restore();
    };

    G.draw.shop_mount = function (ctx, S) {
        const y0 = 0.470, y1 = 0.815;
        shadow(ctx, S, 0.76, 0.50);
        crate(ctx, S, { front: '#2e6b31', top: '#3d8038', side: '#1d4a23' }, y0, y1);
        onFront(ctx, S, y0, y1, () => {
            on(ctx, rrect(ctx, S, FX0, y0 + 0.104, FX1 - FX0, 0.022, 0.009), 'rgba(0,0,0,.46)');   // 널판 이음선
            on(ctx, rrect(ctx, S, FX0, y0 + 0.216, FX1 - FX0, 0.022, 0.009), 'rgba(0,0,0,.46)');
            on(ctx, rrect(ctx, S, FX0, y1 - 0.055, FX1 - FX0, 0.055, 0), 'rgba(0,0,0,.16)');
        });
        // 말굽 표식 — 원본은 앞면 가운데 아래에 굵게 찍혀 있다(1차 렌더는 반지처럼 작았다)
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0.752 * S, 0.712 * S, 0.098 * S, Math.PI * 1.06, Math.PI * 1.94);
        ctx.strokeStyle = '#12331a'; ctx.lineWidth = 0.052 * S; ctx.stroke();
        ctx.restore();
        // 넘치는 태엽 더미 — **궤짝 윗면을 통째로 덮는다.** 원본에서 윗면 초록은 한 점도 안 보이고
        // 태엽이 앞 모서리 위로 흘러넘친다. 1차 렌더는 더미를 상자보다 먼저 그려 윗면에 가려졌다.
        [[0.300, 0.185], [0.500, 0.170], [0.700, 0.178], [0.900, 0.166], [1.095, 0.180], [1.270, 0.205],
         [0.235, 0.290], [0.420, 0.272], [0.605, 0.264], [0.790, 0.262], [0.975, 0.268], [1.160, 0.282], [1.340, 0.305],
         [0.300, 0.382], [0.480, 0.372], [0.660, 0.366], [0.840, 0.366], [1.020, 0.372], [1.200, 0.386], [1.375, 0.408],
         [0.375, 0.458], [0.605, 0.452], [0.840, 0.452], [1.075, 0.458], [1.300, 0.478]]
            .forEach((w, i) => winder(ctx, S, w[0], w[1], 0.132, ((i * 2.399) % 6.283) - 3.14));
        // 앞으로 흘러나온 태엽
        [[0.168, 0.792, 0.124, 0.6], [0.312, 0.856, 0.116, -1.2], [0.086, 0.898, 0.104, 2.1]]
            .forEach(w => winder(ctx, S, w[0], w[1], w[2], w[3]));
    };
})(IconGen);

/* ============================================================================
 * 재화 pill 의 초록 `+` 배지 (원본 shot-043224·042632 6배 확대)
 *
 * 원본은 pill 옆에 놓인 **원형 버튼이 아니라**, 재화 아이콘의 오른쪽 아래에 걸치는
 * **굵은 초록 십자(플러스) 스티커**다 — 검정 키라인 + 밝은 초록 면 + 위쪽 하이라이트.
 * 클론은 주황/빨강 원 안에 얇은 `+` 글자를 pill **왼쪽 안**에 넣어, 모양도 자리도 달랐고
 * 그만큼 pill 이 가로로 늘어나 있었다(코인 pill 106.8px = 21.4%W, 원본 ≈17.3%W).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect } = G._sticker;
    G.draw.plus = function (ctx, S) {
        const c = 0.5, a = 0.158, R = 0.425;   // 팔 반폭 · 반길이
        const P = [[c - a, c - R], [c + a, c - R], [c + a, c - a], [c + R, c - a], [c + R, c + a], [c + a, c + a],
                   [c + a, c + R], [c - a, c + R], [c - a, c + a], [c - R, c + a], [c - R, c - a], [c - a, c - a]];
        ink(ctx, S, poly(ctx, S, P), '#3ad12f', 0.115);
        // 위·왼쪽 면만 밝게 — 스티커 화법의 한 톤 음영(클립해서 십자 밖으로 안 샌다)
        ctx.save(); ctx.beginPath(); poly(ctx, S, P)(); ctx.clip();
        on(ctx, rrect(ctx, S, c - a, c - R, a * 2, 0.30, 0.02), '#7ef05c');
        on(ctx, rrect(ctx, S, c - R, c - a, 0.28, a * 2, 0.02), '#7ef05c');
        on(ctx, rrect(ctx, S, c - a, c + 0.20, a * 2, 0.22, 0.02), 'rgba(0,0,0,.16)');
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 연필 — 프로필 팝업의 편집 버튼 3곳 (원본 shot-042724 12배 확대)
 *
 * 원본: 파란 라운드 사각 버튼(아래턱 남색 + 검정 키라인) 안에 **흰 연필이 좌하→우상 대각**으로
 * 누워 있다. 촉은 왼쪽 아래로 뾰족하고 심은 검정, 몸통 아래-오른쪽 면에 한 톤 회색 음영이 있다.
 * 버튼 자체(파란 면·아래턱)는 CSS(`.profile-edit-btn`)가 그리므로 여기선 연필만 그린다.
 * ============================================================================ */
(function (G) {
    const { ink, on, poly } = G._sticker;
    G.draw.pencil = function (ctx, S) {
        const BODY = '#f4f4f6', SHADE = '#b7bac2', LEAD = '#26262c';
        const u = 0.7071, w = 0.118;                       // 45° 방향 단위 · 몸통 반폭
        const P0 = [0.360, 0.640], P1 = [0.760, 0.240];    // 촉쪽 끝 · 지우개쪽 끝(중심선)
        const n = [w * u, w * u];                          // 중심선에 직교하는 반폭 벡터
        const A = [P0[0] + n[0], P0[1] + n[1]], B = [P1[0] + n[0], P1[1] + n[1]];
        const C = [P1[0] - n[0], P1[1] - n[1]], D = [P0[0] - n[0], P0[1] - n[1]];
        const tip = [P0[0] - 0.22 * u, P0[1] + 0.22 * u];
        const shape = poly(ctx, S, [tip, A, B, C, D]);
        ink(ctx, S, shape, BODY, 0.082);
        ctx.save(); ctx.beginPath(); shape(); ctx.clip();
        on(ctx, poly(ctx, S, [P0, P1, C, D]), SHADE);      // 아래-오른쪽 면
        const q = [P0[0] - 0.13 * u, P0[1] + 0.13 * u];    // 촉(심) — 끝에서 조금 올라온 삼각형
        on(ctx, poly(ctx, S, [tip, [q[0] + n[0], q[1] + n[1]], [q[0] - n[0], q[1] - n[1]]]), LEAD);
        ctx.restore();
    };
})(IconGen);

/* ============================================================================
 * 자동 반복 고리 · 채팅 말풍선 (원본 shot-042120 확대)
 *
 * ⓐ `autoloop` — [자동] 버튼 안. 원본은 **흰 원형 2화살 고리**(검정 외곽선)다. 클론은 🔄 이모지라
 *    바로 옆의 코드 생성 자물쇠와 화풍이 갈렸다(파란 사각 배경이 통째로 얹혀 있었다).
 * ⓑ `chatbubble` — 하단 채팅 미리보기. 원본은 **꼬리가 왼쪽 아래로 난 흰 말풍선 + 짙은 회색 점 3개**
 *    이고 뒤에 카드가 없다. 클론은 💬 이모지(꼬리가 오른쪽 아래)를 흰 카드 안에 넣어 두 겹이었다.
 *    ⚠️ 원본 미리보기 바는 회색이라 흰 말풍선이 그대로 읽히지만 클론 바는 크림색이다 —
 *    그래서 클론 전역 화풍대로 **검정 키라인을 준다**(바 색은 이 항목 소관이 아니다).
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect, circle } = G._sticker;

    // 링 조각 + 끝 화살촉을 한 경로로 — 안팎 호를 잇고 화살촉 삼각형을 끼워 넣는다.
    const arcArrow = (ctx, S, cx, cy, R, tw, a0, a1, fill, lw) => {
        const X = (r, a) => [cx * S + Math.cos(a) * r * S, cy * S + Math.sin(a) * r * S];
        const dir = a1 > a0 ? 1 : -1, head = 0.30 * dir;
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(...X(R + tw / 2, a0));
        ctx.arc(cx * S, cy * S, (R + tw / 2) * S, a0, a1, dir < 0);
        ctx.lineTo(...X(R + tw * 1.25, a1));
        ctx.lineTo(...X(R, a1 + head));                  // 화살촉 끝
        ctx.lineTo(...X(R - tw * 1.25, a1));
        ctx.arc(cx * S, cy * S, (R - tw / 2) * S, a1, a0, dir > 0);
        ctx.closePath();
        ctx.strokeStyle = K; ctx.lineWidth = lw * S; ctx.stroke();
        ctx.fillStyle = fill; ctx.fill();
        ctx.restore();
    };

    G.draw.autoloop = function (ctx, S) {
        const P = Math.PI, W = '#f4f4f6';
        // ⚠️ 호 끝각 + 화살촉 각(0.30rad ≈ 0.095π)이 다음 호의 시작각을 넘으면 두 화살촉이
        //    겹쳐 고리가 아니라 소용돌이 덩어리로 읽힌다(0.84π + head 0.40 에서 실제로 그랬다).
        arcArrow(ctx, S, 0.5, 0.5, 0.305, 0.165, P * 0.14, P * 0.82, W, 0.078);
        arcArrow(ctx, S, 0.5, 0.5, 0.305, 0.165, P * 1.14, P * 1.82, W, 0.078);
    };

    G.draw.chatbubble = function (ctx, S) {
        const DOT = '#4a4a52';
        // 몸통 + 왼쪽 아래 꼬리를 한 경로로(겹친 안쪽 키라인은 칠에 덮인다)
        ctx.save();
        ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath();
        G._rrSub(ctx, 0.085 * S, 0.185 * S, 0.83 * S, 0.505 * S, 0.145 * S);
        poly(ctx, S, [[0.190, 0.605], [0.120, 0.945], [0.455, 0.680]])();
        ctx.closePath();
        ctx.strokeStyle = K; ctx.lineWidth = 0.078 * S; ctx.stroke();
        ctx.fillStyle = '#f7f7f8'; ctx.fill();
        ctx.restore();
        [[0.295, 0.438], [0.500, 0.438], [0.705, 0.438]]
            .forEach(d => on(ctx, circle(ctx, S, d[0], d[1], 0.077), DOT));
    };
})(IconGen);

/* ============================================================================
 * 진행 패스 머리의 큰 검 (원본 shot-042705 4배 확대 실측)
 *
 * 원본은 **아래를 향한 육중한 3/4 검**이다 — 위에서부터 둥근 회색 폼멜, 주황 감은 손잡이,
 * 좌우로 넓은 십자 가드(왼쪽 밝은 회색 / 오른쪽 짙은 슬레이트), 그 아래 두 톤 칼날이
 * 배너 뒤로 내려간다. **칼끝은 배너에 가려 안 보이므로 그리지 않고 아래 변까지 채운다.**
 * 클론은 🗡️ 이모지를 -45° 돌려 쓴 것이라 가늘고 장식적이었고, 회전 탓에 바운딩 박스가
 * 실제 그림보다 훨씬 커서 자리 잡기도 어려웠다(QA 4차 메모의 잘림 사고가 그 때문이다).
 *
 * 실측(원본 픽셀): 검 전체 y 29.5~142.5(113px) · x 208.75~271.25(62.5px) → **종횡비 0.553**.
 *   폼멜 y 0~0.137 · 손잡이 0.125~0.490 · 가드 0.485~0.635(폭 100%) · 칼날 0.630~1.0(폭 60%).
 *   좌우 두 톤 경계는 가드·칼날 모두 거의 정가운데다.
 * ============================================================================ */
(function (G) {
    const { K, ink, on, poly, rrect, ell } = G._sticker;
    G.draw.passsword = function (ctx, S) {
        const W = ctx.canvas.width / S, cx = W / 2;      // 가로로 좁은 캔버스(ASPECT 0.553)
        const GRIP = '#c96a24', GRIP_DK = '#8f430f', POMMEL = '#a8adb2';
        const GUARD_L = '#d2d7db', GUARD_R = '#3b4a58';
        const BLADE_L = '#c9d0d5', BLADE_R = '#7c96a2';
        const hw = (f) => W * f / 2;                     // 폭 비율 → 반폭

        on(ctx, ell(ctx, S, cx, 0.965, W * 0.42, 0.052), 'rgba(0,0,0,.42)');       // 접지 그림자

        // 손잡이 → 폼멜 순서로 뒤에서 앞으로. 손잡이 아랫동은 가드가 덮는다.
        ink(ctx, S, rrect(ctx, S, cx - hw(0.32), 0.115, W * 0.32, 0.395, W * 0.05), GRIP, 0.048);
        ctx.save(); ctx.beginPath(); rrect(ctx, S, cx - hw(0.32), 0.115, W * 0.32, 0.395, W * 0.05)(); ctx.clip();
        [0.13, 0.235, 0.34, 0.445].forEach(y =>                                    // 감은 자국(사선)
            on(ctx, poly(ctx, S, [[cx - hw(1), y + 0.052], [cx + hw(1), y - 0.012],
                                  [cx + hw(1), y + 0.026], [cx - hw(1), y + 0.090]]), GRIP_DK));
        ctx.restore();
        ink(ctx, S, rrect(ctx, S, cx - hw(0.48), 0.008, W * 0.48, 0.130, W * 0.13), POMMEL, 0.048);
        on(ctx, rrect(ctx, S, cx - hw(0.40), 0.022, W * 0.22, 0.040, W * 0.06), 'rgba(255,255,255,.35)');

        // 칼날 — 칼끝 없이 아래 변까지
        const blade = rrect(ctx, S, cx - hw(0.60), 0.618, W * 0.60, 0.382, W * 0.03);
        ink(ctx, S, blade, BLADE_L, 0.048);
        ctx.save(); ctx.beginPath(); blade(); ctx.clip();
        on(ctx, rrect(ctx, S, cx, 0.610, W * 0.32, 0.400, 0), BLADE_R);
        ctx.restore();

        // 십자 가드
        const guard = rrect(ctx, S, W * 0.020, 0.482, W * 0.960, 0.155, W * 0.035);
        ink(ctx, S, guard, GUARD_L, 0.048);
        ctx.save(); ctx.beginPath(); guard(); ctx.clip();
        on(ctx, rrect(ctx, S, cx, 0.470, W * 0.52, 0.180, 0), GUARD_R);
        on(ctx, rrect(ctx, S, W * 0.020, 0.482, W * 0.960, 0.028, 0), 'rgba(255,255,255,.30)');
        ctx.restore();
    };
})(IconGen);
