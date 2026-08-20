// 아이콘 조형 **후보 패치 여러 개**를 차례로 `js/icongen.js` 에 얹고
// `probe-skill-icon-distinct.js` 의 **세 숫자를 양쪽 크기(38/20px)로** 뽑아 표로 찍는다.
// 끝나면(예외·중단 포함) **반드시 원본을 되돌린다.**
//
// 왜 이 자가 필요한가 (2026-08-20 UI 스트림, 락 `icon-gen` — 이 세션이 만들었고 후보 10개를 갈랐다):
//   ⓐ 이 항목의 반복 함정은 **'한 쌍만 보고 치수를 바꾸면 다른 무리로 걸어 들어간다'**(TODO 함정 ㉠)다.
//      노린 쌍만 확인하면 **맞바꿈이 개선으로 보인다** — 실제로 이 세션의 첫 시도(창에 날개촉)는
//      노린 쌍을 .630 → .503 으로 확실히 풀고도 **최악값을 .640 → .721 로 올렸다.**
//      그래서 후보마다 **최악값 · `≥.60` · `≥.55` 를 38/20px 둘 다** 찍는다. 채택 기준은
//      **여섯 숫자 중 하나도 오르지 않을 것**(내려간 게 하나라도 있고, 오른 게 없으면 채택).
//   ⓑ 손으로 고치고 되돌리기를 반복하면 **되돌리기를 빠뜨려 섞인 판을 재게 된다.**
//      이 자는 `finally` 에서 원본을 복구하므로 그 사고가 구조적으로 안 난다.
//
// 사용: node sweep-icon-shape.js cases.json
//   cases.json = [{ "name": "사람이 읽을 이름", "edits": [["찾을 문자열", "바꿀 문자열"], ...] }, ...]
//   · `edits` 는 **정확 일치 치환**이다. 문자열이 파일에 정확히 1번 나와야 하고, 아니면 그 후보는 건너뛴다
//     (조용히 엉뚱한 자리를 고치느니 안 재는 편이 낫다).
//   · 첫 줄에 **기준(현재 트리)** 을 자동으로 한 번 찍는다 — 전/후를 같은 자로 재기 위해서다.
//
// ⚠️ 이 자가 도는 동안에는 `icongen.js` 가 계속 바뀐다.
//    **`regress.sh` 나 아이콘 판정기를 동시에 돌리지 말 것** — 그쪽이 패치된 코드를 읽어 조용히 틀린다.
//    (특히 `probe-orb-face-flat` · `probe-skill-orb-ink` 는 낡은 캡처 가드까지 얽힌다.)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.resolve(__dirname, '../js/icongen.js');
const PROBE = path.resolve(__dirname, 'probe-skill-icon-distinct.js');
const casesPath = process.argv[2];
if (!casesPath) { console.error('사용: node sweep-icon-shape.js cases.json'); process.exit(2); }
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const original = fs.readFileSync(SRC, 'utf8');

const parse = (out) => {
    const g = (re) => { const m = out.match(re); return m ? m.slice(1) : null; };
    return {
        a: g(/분포 38px: 최악 ([\d.]+) · IoU ≥0\.60 인 쌍 (\d+)개 · ≥0\.55 (\d+)/),
        b: g(/분포 20px: 최악 ([\d.]+) · IoU ≥0\.60 인 쌍 (\d+)개 · ≥0\.55 (\d+)/),
        top: (out.match(/\s+1\. IoU ([\d.]+)\s+(.+)/) || [])[2] || '',
    };
};

let base = null;
try {
    for (const c of [{ name: '(기준=현재 트리)', edits: [] }, ...cases]) {
        let s = original, ok = true;
        for (const [from, to] of c.edits) {
            const n = s.split(from).length - 1;
            if (n !== 1) { console.error(`✗ ${c.name}: 문자열이 ${n}번 나온다(1번이어야 한다) → ${from.slice(0, 60)}`); ok = false; break; }
            s = s.replace(from, to);
        }
        if (!ok) continue;
        fs.writeFileSync(SRC, s);
        let out;
        try { out = execFileSync('node', [PROBE], { encoding: 'utf8', timeout: 600000 }); }
        catch (e) { console.error(`✗ ${c.name}: 프로브 실패 — ${String(e.message).split('\n').slice(0, 2).join(' / ')}`); continue; }
        const r = parse(out);
        if (!r.a || !r.b) { console.error(`✗ ${c.name}: 출력 파싱 실패(프로브 출력 형식이 바뀌었나?)`); continue; }
        if (!base) base = r;
        // 기준 대비 오른 숫자가 있으면 그 자리에서 표시한다 — 표를 눈으로 훑다 놓치는 걸 막는다.
        const worse = [0, 1, 2].flatMap(i => [
            +r.a[i] > +base.a[i] ? `38px[${['최악', '≥.60', '≥.55'][i]}]` : null,
            +r.b[i] > +base.b[i] ? `20px[${['최악', '≥.60', '≥.55'][i]}]` : null,
        ]).filter(Boolean);
        const mark = c.edits.length === 0 ? '' : (worse.length ? `  ⛔ 오름: ${worse.join(' ')}` : '  ✅ 오른 숫자 없음');
        console.log(`${c.name.padEnd(32)} 38px ${r.a.join(' / ')}   20px ${r.b.join(' / ')}   1위 ${r.top}${mark}`);
    }
} finally {
    fs.writeFileSync(SRC, original);
    console.log('\n원본 복구 완료 (js/icongen.js)');
}
console.log('판정: **여섯 숫자 중 하나도 오르지 않은** 후보만 채택할 것(✅ 표시).');
console.log('⚠️ 채택 뒤에는 `probe-emblem-core`(속살 ≥34%) 를 반드시 따로 돌릴 것 — 이 자는 실루엣만 본다.');
