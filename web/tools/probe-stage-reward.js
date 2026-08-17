// 스테이지 클리어 보상이 골드만인지 실측 — 사용: node probe-stage-reward.js
// 판정: 클리어 전후 비-골드 재화(🎫 티켓·⚙️ 태엽·🥚 알·🧪 물약·🔨 해머·💎 젬) 델타 0, 코인만 증가,
//       첫 클리어 토스트에 🎫/⚙️ 표기 없음. 던전 클리어(해머 도둑)는 별개 경로라 태엽이 나와야 정상.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CUR = ['coins', 'tickets', 'winders', 'eggCurrency', 'potions', 'hammers', 'gems'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Combat !== 'undefined' && typeof S !== 'undefined' && Combat.hero.stats, null, { timeout: 20000 });

    const run = await page.evaluate((CUR) => {
        // 토스트 문구를 가로챈다 (첫 클리어 표기 확인용)
        const toasts = [];
        const realToast = UI.toast.bind(UI);
        UI.toast = (msg) => { toasts.push(String(msg)); return realToast(msg); };
        // 시간축 통제: rAF·인터벌 대신 직접 틱을 돌린다
        const realTick = Combat.tick.bind(Combat);
        Combat.tick = () => {};
        const step = (sec) => { const n = Math.round(sec * 10); for (let i = 0; i < n; i++) realTick(0.1); };

        const snap = () => CUR.reduce((o, k) => (o[k] = S[k] || 0, o), {});
        const out = {};

        // ---- ① 첫 클리어 ----
        S.clearedBosses = {};                     // 현재 스테이지를 첫 클리어 상태로
        const before = snap();
        const stage0 = `${S.chapter}-${S.stage}`;
        toasts.length = 0;
        Combat.stageClear();
        out.first = { stage: stage0, before, after: snap(), toasts: [...toasts] };

        // ---- ② 반복 클리어 (이미 클리어한 스테이지) ----
        S.chapter = 1; S.stage = 1; S.clearedBosses['1-1'] = true;
        const before2 = snap();
        toasts.length = 0;
        Combat.stageClear();
        out.repeat = { before: before2, after: snap(), toasts: [...toasts] };

        // ---- ③ 던전(해머 도둑) 클리어는 별개 경로 — 태엽이 나와야 정상 ----
        Dungeons.ensure();
        const before3 = snap();
        Dungeons.grantRewards('hammer', 1);
        out.dungeon = { before: before3, after: snap(), text: Dungeons.rewardText('hammer', 1) };

        Combat.tick = realTick; UI.toast = realToast;
        return out;
    }, CUR);

    let fail = 0;
    const t = (n, c, extra) => { console.log((c ? '  ✅ ' : '  ❌ ') + n + (extra ? ' — ' + extra : '')); if (!c) fail++; };
    const delta = (r) => CUR.reduce((o, k) => (o[k] = r.after[k] - r.before[k], o), {});
    const show = (d) => CUR.filter(k => d[k]).map(k => `${k} +${d[k]}`).join(', ') || '변화 없음';

    const d1 = delta(run.first), d2 = delta(run.repeat), d3 = delta(run.dungeon);
    console.log(`① 첫 클리어(${run.first.stage}) 델타: ${show(d1)}`);
    console.log(`   토스트: ${run.first.toasts.join(' / ') || '(없음)'}`);
    console.log(`② 반복 클리어(1-1) 델타: ${show(d2)}`);
    console.log(`   토스트: ${run.repeat.toasts.join(' / ') || '(없음)'}`);
    console.log(`③ 던전 해머도둑 1단계 델타: ${show(d3)}`);
    console.log(`   목록 표기: ${run.dungeon.text}`);

    const NONGOLD = CUR.filter(k => k !== 'coins');
    console.log('\n판정');
    t('첫 클리어 — 비-골드 재화 델타 0', NONGOLD.every(k => d1[k] === 0), NONGOLD.filter(k => d1[k]).map(k => `${k} +${d1[k]}`).join(', ') || '전부 0');
    t('첫 클리어 — 코인은 증가', d1.coins > 0, `+${d1.coins}`);
    t('첫 클리어 토스트에 🎫/⚙️ 표기 없음', !run.first.toasts.some(m => /🎫|⚙️/.test(m)), run.first.toasts.join(' / '));
    t('반복 클리어 — 비-골드 재화 델타 0', NONGOLD.every(k => d2[k] === 0), NONGOLD.filter(k => d2[k]).map(k => `${k} +${d2[k]}`).join(', ') || '전부 0');
    t('반복 클리어 — 티켓·태엽 지급 없음', d2.tickets === 0 && d2.winders === 0);
    t('던전(해머 도둑)은 태엽 수급처로 유지 — 탈것이 잠기지 않게', d3.winders > 0, `⚙️ +${d3.winders}`);
    t('던전 목록 표기에 태엽 반영', /⚙️/.test(run.dungeon.text), run.dungeon.text);
    t('콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

    console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
