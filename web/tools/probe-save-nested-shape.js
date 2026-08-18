// 세이브 중첩 필드 손상 → 부팅 생존 전수 프로브 (slug: save-null-nested-boot)
// 왜: ensureStateShape()는 defaultState()에 있는 키만 본다 — `dungeons`·`chat`처럼 모듈
//     ensure()가 지연 생성하는 키는 재귀 보정 대상이 아니라서, 하위 필드(`keys`·`messages`)가
//     null/빈 객체면 boot()가 try/catch 밖(Dungeons.ensure)에서 TypeError로 통째로 죽고
//     세이브가 그대로라 새로고침해도 매번 백지다(수동 복구 경로 없음).
// 무엇을 재나: 정상 부팅으로 만든 세이브의 **모든 중첩 객체 키**를 ⓐ null ⓑ 같은 종류의
//     빈 값({}/[]) ⓒ 객체/배열인 직계 하위 필드 각각 null — 로 바꿔 그 세이브로 부팅시키고,
//     ⑴ pageerror/콘솔 에러 0 ⑵ #topbar·#equip-sheet 가 실제로 그려짐(빈 문자열 아님)
//     ⑶ 던전 열쇠 4종 복구 — 를 케이스마다 판정한다. 항목의 QA 실측(56케이스 중 5실패)을
//     코드에 박아 회귀를 막는 자다.
// 사용: node probe-save-nested-shape.js            (전수. 실패 있으면 exit 1)
//       node probe-save-nested-shape.js --quick    (QA가 실측한 사망 5케이스만)
//       node probe-save-nested-shape.js --shard 1/3 (전수를 3등분한 1번째 조각만 —
//         병렬 세션이 붙어 컨테이너가 눌리면 한 번에 다 돌리다 통째로 죽는다. 실측: 백그라운드
//         전수 실행이 두 번 연속 출력 0바이트로 살해당했다. 조각내 포그라운드로 돌릴 것.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SAVE_KEY = 'forgeclone_save_v1';
const QUICK = process.argv.includes('--quick');

// QA 플레이 세션이 실측한 부팅 사망 5케이스 — 이 프로브의 최소 계약.
const KNOWN_FATAL = ['dungeons=ⓑ{}', 'dungeons.keys=null', 'dungeons.best=null', 'chat=ⓑ{}', 'chat.messages=null'];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    let errs = [], where = 'seed';
    page.on('pageerror', e => errs.push(`[${where}] ${e.message}`));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/favicon\.ico/.test(m.text())) return; // 파일 부재 — 게임 동작과 무관(probe-screens-errors와 동일 판정)
        errs.push(`[${where}] ${m.text()}`);
    });

    const bootDone = async () => {
        await page.waitForFunction(() => typeof S !== 'undefined' && typeof UI !== 'undefined' && UI.els, null, { timeout: 60000 });
        await page.waitForTimeout(400); // ensure() 계열이 전부 지나가고 첫 렌더가 앉을 시간
    };

    // ── 1) 정상 부팅으로 기준 세이브를 만든다 ──────────────────────────────
    await page.goto(INDEX, { waitUntil: 'load' });
    await bootDone();
    const baseSave = await page.evaluate(k => {
        localStorage.clear(); saveGame();
        return localStorage.getItem(k);
    }, SAVE_KEY);
    if (!baseSave) { console.log('FAIL: 기준 세이브 생성 실패'); process.exit(1); }
    if (errs.length) { console.log('FAIL: 정상 부팅부터 에러', errs); process.exit(1); }
    const base = JSON.parse(baseSave);

    // ── 2) 케이스 생성: 중첩 객체 키 × (ⓐ null / ⓑ 빈 값 / ⓒ 하위 객체 필드 null) ──
    const isObj = v => v !== null && typeof v === 'object';
    const cases = [];
    for (const k of Object.keys(base)) {
        if (!isObj(base[k])) continue;
        cases.push({ name: `${k}=null`, mut: o => { o[k] = null; } });
        cases.push({ name: `${k}=ⓑ${Array.isArray(base[k]) ? '[]' : '{}'}`, mut: o => { o[k] = Array.isArray(base[k]) ? [] : {}; } });
        if (!Array.isArray(base[k])) {
            for (const sk of Object.keys(base[k])) {
                if (!isObj(base[k][sk])) continue;
                cases.push({ name: `${k}.${sk}=null`, mut: o => { o[k][sk] = null; } });
            }
        }
    }
    let run = QUICK ? cases.filter(c => KNOWN_FATAL.includes(c.name)) : cases;
    const missing = KNOWN_FATAL.filter(n => !cases.some(c => c.name === n));
    if (missing.length) { console.log('FAIL: 실측 사망 케이스가 목록에 안 잡힘(자가 버그):', missing); process.exit(1); }
    const shardArg = process.argv[process.argv.indexOf('--shard') + 1];
    if (process.argv.includes('--shard')) {
        const [i, n] = (shardArg || '').split('/').map(Number);
        if (!(i >= 1 && i <= n)) { console.log('FAIL: --shard 는 1/3 꼴이어야 한다'); process.exit(1); }
        const per = Math.ceil(run.length / n);
        run = run.slice((i - 1) * per, i * per);
        console.log(`샤드 ${i}/${n}: 전체 ${cases.length}케이스 중 ${run.length}개`);
    }

    // ── 3) 케이스마다 손상 세이브로 부팅 → 생존 판정 ──────────────────────
    const fails = [];
    for (const c of run) {
        const o = JSON.parse(baseSave); c.mut(o);
        errs = []; where = c.name;
        await page.evaluate(([k, v]) => {
            localStorage.setItem(k, v);
            // 🚨 이거 없이는 5케이스 전부가 가짜 PASS 다(실측) — 리로드 직전 beforeunload→saveGame이
            // 아직 건강한 메모리 S로 손상 세이브를 도로 덮어쓴다. 구 문서의 setItem만 무력화하면
            // (인스턴스 프로퍼티라 새 문서엔 안 남는다) 손상본이 부팅까지 살아남는다.
            localStorage.setItem = () => {};
        }, [SAVE_KEY, JSON.stringify(o)]);
        await page.reload({ waitUntil: 'load' });
        let verdict;
        try {
            await bootDone();
            verdict = await page.evaluate(() => {
                const top = document.getElementById('topbar'), eq = document.getElementById('equip-sheet');
                if (!top || !top.innerHTML.length) return '#topbar 미렌더(백지)';
                if (!eq || !eq.innerHTML.length) return '#equip-sheet 미렌더(백지)';
                if (!S.dungeons || !S.dungeons.keys || Object.keys(S.dungeons.keys).length !== Dungeons.DEFS.length)
                    return '던전 열쇠 미복구';
                if (!S.chat || !Array.isArray(S.chat.messages) || !S.chat.messages.length) return '채팅 미복구';
                return null;
            });
        } catch (e) { verdict = `부팅 대기 실패: ${String(e).slice(0, 120)}`; }
        if (errs.length && !verdict) verdict = errs[0];
        if (verdict) { fails.push(`${c.name} → ${verdict}`); console.log(`  FAIL ${c.name} → ${verdict}`); }
    }

    await browser.close();
    console.log(`\n중첩 손상 ${run.length}케이스 부팅 생존: ${run.length - fails.length}/${run.length}`);
    if (fails.length) { console.log('FAIL 목록:\n  ' + fails.join('\n  ')); process.exit(1); }
    console.log('PASS');
})().catch(e => { console.error(e); process.exit(1); });
