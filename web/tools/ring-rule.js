// ring-rule.js — **키라인(글자 검정 링) 규칙의 단일 원본**.
// `probe-screen-ring-todo.js`(한 화면 작업 목록)와 `probe-label-keyline-census.js`(전 화면 집계)가
// 둘 다 여기를 읽는다. 예전에는 같은 규칙을 두 파일에 따로 적어 뒀다.
//
// 🚨 **이 파일이 생긴 이유 — 자 두 개가 소리 없이 갈라져 있었다 (2026-08-20 UI 스트림 실측).**
//   ㉮ 규칙은 처음 "칠이 밝으면 검정 링, 검정이면 민무늬" 한 줄이었고 두 프로브가 그대로
//   베껴 적었다. 그 뒤 세 세션이 원본을 확대해 가며 **술어 네 개**를 덧붙였는데(아래 ①~④),
//   전부 `probe-screen-ring-todo.js` **한쪽에만** 들어갔다. 그래서 두 자가 같은 화면을 재고도
//   다른 답을 냈다 — 그런데 **작업 순서를 정하는 ⓛ 순위는 갱신이 안 된 census 쪽**이 뽑는다.
//   실측 대조(2026-08-20):
//     · `.chat-bubble`·`.chat-time` 22개 — census 는 '뺄 것', 화면 프로브는 **해당 없음**(①).
//     · `#tabbar` 31개 · `#chat-preview` 18개 — census ⓛ 순위 2·4위인데 둘 다 **작업이 아닌 면**
//       (③④). 인계 메모가 "다음 세션이 그대로 칠 위험이 크다"고 두 번 박아 둔 바로 그 자리다.
//   즉 ⓛ 순위는 **폐기된 자로 잰 목록**이었다. 인계가 세 세션 연속으로 남긴 배움
//   ("목록이 길게 나오면 먼저 자를 의심할 것")이 자기 자신에게도 걸린 셈이다.
//   → 규칙을 파일 하나로 모으고, `--selftest` 로 술어 네 개를 매번 재확인한다.
//
// ── 술어 ①~④ (전부 원본 확대 실측이 근거. 지우려면 그 근거부터 반증할 것) ──────────
//  ① **칠과 같은 색 스트로크는 키라인이 아니다** — 굵기 보정이다. `.chat-bubble`/`.chat-time` 의
//     `-webkit-text-stroke: .5px currentColor` 는 원본보다 획이 1px 얇아서 채운 것(7차 비평가
//     실측)이라, 키라인으로 세면 검정 칠 22개가 '뺄 것'으로 잡혀 **애써 맞춘 획을 도로 지운다.**
//  ② **'검정 칠'은 휘도가 아니라 최대 채널로 가른다** — 원본 042340 소환 버튼의 `160` 은
//     빨강 rgb(237,28,36) + 검정 링인데 휘도가 73 이라 `ink<128` 술어에 걸려 '뺄 것'이 됐다.
//     사람이 검정 칠이라 부르는 것은 어두운 **무채색**이다(빨강은 max 237 = 밝은 칠).
//  ③ **검정 판 위에서는 검정 링이 무의미하다** — 링 색이 판 색이라 아무것도 안 갈라 준다.
//     원본도 그렇다(042521 ⓘ 버튼: 검정 원반 위 흰 `i`, 14배 확대해도 민무늬).
//     ⚠️ 임계 `DEAD_BG=40` 은 **근사치이고 원본에 반례가 있다** — 042340 헤더의 `44` pill 은
//     판 휘도 35 인데도 두른다. 임계를 올려 반례를 지우지 말 것(그러면 원본이 두르는 자리까지
//     '무의미'로 걷어낸다). 개별 반례는 ④ 로 근거를 달아 뺀다.
//  ④ **원본이 통째로 민무늬인 면** — ㉮ 가 아예 안 미치는 자리. `#chat-preview`(메인 하단 채팅
//     띠: 042120 20배 확대 시 빨간 배지의 흰 `99`·회색 띠 위 흰 `Ligma`·검정 본문이 전부 민무늬)
//     와 `.summon-gauge`(042340 의 `5/110`, 16배에서 민무늬). **지우지 말고 따로 센다** —
//     근거가 남아야 다음 세션이 같은 자리를 다시 파지 않는다.
//  그리고 '넣을 것'에는 술어가 하나 더 붙는다: **판보다 밝은 칠**만 넣는다. 원본에서 링이
//  붙는 자리는 전부 밝은 칠이 어두운 판을 딛고 선 자리다. 이게 없으면 `x1` 토글(흰 판 위
//  파란 `#005dff`)이 잡히는데, 대비가 이미 8:1 이라 링이 할 일이 없다.
//  🚨 **'넣을 것'과 '뺄 것'의 술어는 대칭이 아니다** — '판보다 밝은 칠' 조건을 '뺄 것'에 같이
//     걸면 안 된다. 원본 소환 버튼의 빨간 `160` 은 밝은 판 위 어두운 칠인데도 링이 있다.
//
// 사용:
//   const RR = require('./ring-rule.js');
//   const rows = await page.evaluate(new Function(RR.SWEEP_SRC));   // 맨 위 면의 글자 요소 전수
//   const { need, over, moot, free } = RR.classify(rows);
//   node tools/ring-rule.js --selftest      # 술어 ①~④ 회귀 (regress-ratio.sh 등재)

// ── 브라우저에서 도는 부분 — 맨 위에 떠 있는 면의 글자 요소를 전수로 재 온다 ────────
// 판정은 하지 않는다(측정만). 그래야 술어를 고칠 때 Node 쪽 한 곳만 고치면 된다.
const SWEEP_SRC = `
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 7) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
  };
  // ⓑ 뒤에 깔린 면을 세지 않는다 — 지금 맨 위에 떠 있는 면 안만 본다.
  const surfaces = [...document.querySelectorAll('.modal:not(.hidden) .modal-card, .modal:not(.hidden) .sheet, .modal-card.sheet')].filter(vis);
  const root = surfaces.length ? surfaces[surfaces.length - 1] : (document.getElementById('app') || document.body);
  const pathOf = (el) => {
    const p = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '';
      p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + c);
      if (p.length >= 4) break;
    }
    return p.join(' > ');
  };
  const sameHue = (a, b) => {
    const p = x => ((x || '').match(/-?[\\d.]+/g) || []).slice(0, 3).join(',');
    return p(a) === p(b);
  };
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    if (!vis(el)) continue;
    // ⓐ 자기 텍스트 노드가 있는 것만(컨테이너 제외 — 자손 글자는 그 자손이 따로 잡힌다)
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if ((own.match(/[0-9A-Za-z가-힣]/g) || []).length < 1) continue;   // ⓒ 이모지·기호만은 활자가 아니다
    const s = getComputedStyle(el);
    const sw = parseFloat(s.webkitTextStrokeWidth) || 0;
    const keyline = sw > 0 && !sameHue(s.webkitTextStrokeColor, s.color);   // ① 같은 색 = 굵기 보정
    const sh = s.textShadow || 'none';
    // blur 0 인 그림자가 두 방향 이상이면 '링'으로 친다(이 저장소의 8방향 text-shadow 관용구)
    const hardRing = sh !== 'none' && (sh.match(/0px 0px|0px -|-?\\d+px 0px/g) || []).length >= 2;
    const m = (s.color || '').match(/-?[\\d.]+/g) || [0, 0, 0];
    const ink = 0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2];
    const inkMax = Math.max(+m[0], +m[1], +m[2]);                           // ② 무채색 판정은 최대 채널
    // 글자가 실제로 깔린 판의 휘도 — 자기 자신부터 위로 올라가 처음 만나는 불투명 배경
    let bg = null;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const q = (getComputedStyle(e).backgroundColor || '').match(/-?[\\d.]+/g);
      if (!q) continue;
      if ((q.length > 3 ? +q[3] : 1) < 0.5) continue;
      bg = 0.2126 * +q[0] + 0.7152 * +q[1] + 0.0722 * +q[2];
      break;
    }
    const ringFree = !!el.closest('#chat-preview, .summon-gauge');          // ④ 원본이 통째로 민무늬인 면
    // 집계용 키(태그 + 클래스 2개까지)와 상속 조상 후보
    const key = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
    let host = '';
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.id) { host = '#' + p.id; break; }
      const c = typeof p.className === 'string' ? p.className.trim().split(/\\s+/)[0] : '';
      if (c && /panel|sheet|modal|card|bar|row/.test(c)) { host = '.' + c; break; }
    }
    out.push({ p: pathOf(el), key, host, has: keyline || hardRing, sw, ringFree,
               sh: sh.slice(0, 60), ink: +ink.toFixed(0), inkMax,
               bg: bg === null ? null : +bg.toFixed(0),
               fs: +parseFloat(s.fontSize).toFixed(1), t: own.slice(0, 14), color: s.color });
  }
  return out;
`;

// ── Node 에서 도는 판정 — 술어 ①~④ (①은 SWEEP 안에서 이미 걸렸다) ─────────────────
const DEAD_BG = 40;                                    // ③ --pp-line 이 #000 이라 이보다 어두운 판에선 무의미
const dead    = r => r.bg !== null && r.bg <= DEAD_BG;
const bright  = r => r.inkMax >= 128;                  // ② 휘도 아님 — 최대 채널
const lighter = r => r.bg === null || r.ink > r.bg;    // 넣을 것에만 붙는 비대칭 술어
const cand    = r => bright(r) && lighter(r) && !r.has;

const isNeed = r => cand(r) && !dead(r) && !r.ringFree;
const isOver = r => !bright(r) && r.has && !r.ringFree;
const isMoot = r => cand(r) && dead(r) && !r.ringFree;
const isFree = r => cand(r) && r.ringFree;

function classify(rows) {
    return {
        need: rows.filter(isNeed),
        over: rows.filter(isOver),
        moot: rows.filter(isMoot),
        free: rows.filter(isFree),
        dark: rows.filter(r => !bright(r)),   // 상속 스트로크를 꺼야 하는 자리
    };
}

module.exports = { SWEEP_SRC, DEAD_BG, dead, bright, lighter, cand, isNeed, isOver, isMoot, isFree, classify };

// ── --selftest — 술어 네 개가 살아 있나. 근거가 된 실측 케이스를 그대로 박아 둔다. ──
// ⚠️ 인자 없이 직접 실행해도 돌아야 한다 — `regress-ratio.sh` 는 `node <파일>` 로만 부른다
//    (`--selftest` 를 요구하면 목록에 넣어도 **아무것도 검사하지 않는 초록**이 된다).
if (require.main === module) {
    let bad = 0;
    const T = (name, got, want) => {
        const ok = got === want;
        if (!ok) bad++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} — got ${got}, want ${want}`);
    };
    const row = (o) => Object.assign({ p: '', key: '', host: '', has: false, sw: 0, ringFree: false,
                                       sh: 'none', ink: 0, inkMax: 0, bg: null, fs: 14, t: '', color: '' }, o);

    console.log('ring-rule --selftest — 술어 ①~④');
    // ① 같은 색 스트로크는 키라인이 아니다 (.chat-bubble: 검정 칠 + .5px currentColor)
    //    SWEEP 안에서 has=false 로 나오므로, 판정 단에서는 '뺄 것'이 아니어야 한다.
    T('① 같은 색 스트로크(chat-bubble)는 뺄 것이 아니다',
      isOver(row({ ink: 24, inkMax: 26, has: false, bg: 240 })), false);
    T('① 다른 색 링을 두른 검정 칠은 여전히 뺄 것',
      isOver(row({ ink: 24, inkMax: 26, has: true, bg: 240 })), true);
    // ② 포화색은 검정 칠이 아니다 (원본 042340 소환 버튼의 빨간 `160`, rgb(237,28,36) 휘도 73)
    T('② 빨강 rgb(237,28,36)(휘도 73)은 검정 칠이 아니다',
      isOver(row({ ink: 73, inkMax: 237, has: true, bg: 200 })), false);
    T('② #17181a(max 26)는 검정 칠 그대로',
      bright(row({ ink: 24, inkMax: 26 })), false);
    // ③ 검정 판 위 밝은 칠은 '넣을 것'이 아니라 '무의미' (042521 ⓘ 버튼: 검정 원반 위 흰 i)
    T('③ 검정 판(휘도 24) 위 흰 칠은 넣을 것이 아니다',
      isNeed(row({ ink: 255, inkMax: 255, bg: 24 })), false);
    T('③ 그 자리는 무의미로 따로 센다',
      isMoot(row({ ink: 255, inkMax: 255, bg: 24 })), true);
    // ③ 임계는 근사치다 — 042340 헤더 `44` pill(판 휘도 35)은 원본이 두르는데도 '무의미'로 걷힌다.
    //    그게 이 임계의 알려진 오차이고, 그 자리는 CSS 에서 개별 스코프로 칠해 뒀다(㉶ ⑵).
    //    이 두 줄은 **임계를 40 위로 올리지 못하게 박아 두는 것**이 목적이다 — 45 로 올리면
    //    `.cur-pill.winder`(#2b2b2b, 휘도 43)까지 '무의미'로 걷혀 원본이 두르는 자리를 지운다.
    T('③ 임계는 40 그대로(45 로 올린 적이 있다 — 되돌린 자리)', DEAD_BG, 40);
    T('③ 판 휘도 43(.cur-pill.winder)은 넣을 것으로 남는다',
      isNeed(row({ ink: 255, inkMax: 255, bg: 43 })), true);
    // ④ 원본이 통째로 민무늬인 면은 넣을 것도 뺄 것도 아니다
    T('④ #chat-preview 안의 흰 칠은 넣을 것이 아니다',
      isNeed(row({ ink: 255, inkMax: 255, bg: 60, ringFree: true })), false);
    T('④ 그 자리는 원본 민무늬 면으로 따로 센다',
      isFree(row({ ink: 255, inkMax: 255, bg: 60, ringFree: true })), true);
    // 비대칭 — 판보다 어두운 칠은 넣지 않지만(x1 토글), 뺄 것 판정에는 이 술어를 안 건다
    T('비대칭 ⓐ 흰 판 위 파란 칠(#005dff)은 넣을 것이 아니다',
      isNeed(row({ ink: 85, inkMax: 255, bg: 240 })), false);

    console.log(bad ? `\nFAIL — 술어 ${bad}건이 깨졌다` : '\nPASS — 술어 ①~④ 전부 살아 있다');
    process.exit(bad ? 1 : 0);
}
