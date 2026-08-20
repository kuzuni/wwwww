// probe-screen-ring-todo.js — **한 화면의 링 작업 목록**을 요소별 선택자 경로로 뽑는다.
// 짝: `probe-label-keyline-census.js`(전 화면 집계) · `probe-ref-ring-rule.js`(규칙의 근거).
//
// 규칙(㉮ 실측 확정): 원본은 **글자 칠이 밝으면 검정 링, 칠이 검정이면 민무늬**다.
//   그래서 작업 목록은 계산된 `color` 휘도로 기계가 정한다 —
//     · 넣을 것 = 밝은 칠(휘도 ≥128)인데 링 없음
//     · 뺄 것   = 검정 칠인데 링 있음(상속으로 걸면 반드시 꺼야 하는 자리)
//
// 🚨 **CSS 를 고친 뒤 캡처보다 먼저 이걸 돌릴 것.** 주석 여닫이 하나만 어긋나도(짝 없는 `*/`)
//    규칙이 통째로 무시되는데 **CSS 는 그걸 조용히 삼킨다** — 콘솔 에러도 `node --check` 도
//    안 잡는다(㉱ 에서 실제로 밟았다). '넣을 것'이 안 줄면 규칙이 안 먹은 것이다.
// 🚨 **검정 칠이 나오면 되끄기부터 짜지 말 것.** 먼저 원본을 14배로 확대해(`crop-zoom.js`)
//    정말 검정인지 볼 것 — `pass` 화면에서는 검정 칠 11개가 **전부 클론의 오독**이었고
//    원본은 흰 칠 + 링이었다(링이 굵어 축소하면 검은 글자로 보인다).
//
// 사용: node tools/probe-screen-ring-todo.js <화면이름>     (기본 pass)
//       화면 이름은 `shot-screens.js` 의 SCREENS 첫 열.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path=require('path'), fs=require('fs');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
// 🚨 규칙(술어 ①~④)은 `ring-rule.js` 한 곳에만 있다 — 여기에 다시 적지 말 것.
//    이 파일과 `probe-label-keyline-census` 가 규칙을 따로 들고 있다가 소리 없이 갈라졌다.
const RR = require('./ring-rule.js');
const INDEX='file://'+path.resolve(__dirname,'../index.html');
const WANT = process.argv[2] || 'pass';
function loadScreens(){const src=fs.readFileSync(path.join(__dirname,'shot-screens.js'),'utf8');const i=src.indexOf('const SCREENS = [');const j=src.indexOf('\n];',i);return new Function('PETS_STATE_SRC','return '+src.slice(i+'const SCREENS = '.length,j+2))(PETS_STATE_SRC);}
(async()=>{
  const SCREENS=loadScreens();
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--enable-unsafe-swiftshader']});
  const page=await b.newPage({viewport:{width:499,height:892},deviceScaleFactor:1});
  const READY='typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene';
  await page.goto(INDEX,{waitUntil:'load'}); await waitReady(page,READY,{label:'load'});
  await page.evaluate(SEED_SRC); await page.reload({waitUntil:'load'});
  await waitReady(page,'S && S.forgeLevel === 29 && '+READY,{label:'seed'});
  await page.evaluate(()=>{UI.toast=()=>{};UI.showCraftModal=()=>{};UI.resolvePendingCraft=()=>{};UI.autoSeqStep=()=>{};UI.coinBurst=()=>{};UI.bossWarning=()=>{};try{UI.clearPendingCraft();UI.renderEquipSheet();}catch(e){}});
  const sc=SCREENS.find(s=>s[0]===WANT);
  if(!sc){console.error(`화면 '${WANT}' 없음. 고를 수 있는 이름: ${SCREENS.map(s=>s[0]).join(', ')}`);await b.close();process.exit(2);}
  await page.evaluate(new Function(sc[2])); await page.waitForTimeout(700);
  await page.evaluate(()=>document.querySelectorAll('.modal, .modal-card').forEach(m=>m.classList.remove('opening')));
  const res=await page.evaluate(new Function(RR.SWEEP_SRC));
  const {need,over,moot,free,dark}=RR.classify(res);
  console.log(`화면 ${WANT}: 글자요소 ${res.length} · 넣을 것 ${need.length} · 뺄 것 ${over.length}`
    + (moot.length?` · 링 무의미(검정 판 위) ${moot.length}`:'')
    + (free.length?` · 원본 민무늬 면 ${free.length}`:''));
  console.log('\n-- 넣을 것 --'); for(const r of need) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} ${r.color.padEnd(18)} "${r.t}"  ${r.p}`);
  if(moot.length){console.log('\n-- 링 무의미(검정 판 위 · 원본도 민무늬) --');
    for(const r of moot) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} "${r.t}"  ${r.p}`);}
  if(free.length){console.log('\n-- 원본 민무늬 면(#chat-preview · .summon-gauge — 원본 확대로 확인) --');
    for(const r of free) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} "${r.t}"  ${r.p}`);}
  console.log('\n-- 뺄 것 --'); for(const r of over) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} "${r.t}"  ${r.p}`);
  console.log('\n-- 검정 칠(상속 스트로크를 꺼야 하는 자리) --'); for(const r of dark) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} sw=${r.sw} sh=${r.sh} "${r.t}"  ${r.p}`);
  await b.close();
})();
