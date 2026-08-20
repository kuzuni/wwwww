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
  const res=await page.evaluate(()=>{
    const vis=(el)=>{const r=el.getBoundingClientRect();if(r.width<8||r.height<7)return false;if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return false;const s=getComputedStyle(el);return s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>0.05;};
    const surfaces=[...document.querySelectorAll('.modal:not(.hidden) .modal-card, .modal:not(.hidden) .sheet, .modal-card.sheet')].filter(vis);
    const root=surfaces.length?surfaces[surfaces.length-1]:(document.getElementById('app')||document.body);
    const pathOf=(el)=>{const p=[];for(let e=el;e&&e!==document.body;e=e.parentElement){const c=typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\s+/).join('.'):'';p.unshift(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+c);if(p.length>=4)break;}return p.join(' > ');};
    const out=[];
    for(const el of root.querySelectorAll('*')){
      if(!vis(el))continue;
      const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
      if((own.match(/[0-9A-Za-z가-힣]/g)||[]).length<1)continue;
      const s=getComputedStyle(el);
      const sw=parseFloat(s.webkitTextStrokeWidth)||0;
      // 🚨 스트로크가 있다고 다 키라인이 아니다 — **칠과 같은 색 스트로크는 '굵기 보정'**이다.
      //    `.chat-bubble`/`.chat-time` 이 `-webkit-text-stroke: .5px currentColor` 를 쓰는데(원본보다
      //    획이 1px 얇아서 채운 것, 7차 비평가 실측), 이걸 키라인으로 세면 검정 칠 22개가 통째로
      //    '뺄 것'으로 잡혀 **애써 맞춘 획 굵기를 도로 지우게 된다.** 색이 다를 때만 키라인으로 센다.
      const sameHue=(a,b)=>{const p=x=>((x||'').match(/-?[\d.]+/g)||[]).slice(0,3).join(',');return p(a)===p(b);};
      const keyline=sw>0&&!sameHue(s.webkitTextStrokeColor,s.color);
      const sh=s.textShadow||'none';
      const hardRing=sh!=='none'&&(sh.match(/0px 0px|0px -|-?\d+px 0px/g)||[]).length>=2;
      const m=(s.color||'').match(/-?[\d.]+/g)||[0,0,0];
      const ink=0.2126*+m[0]+0.7152*+m[1]+0.0722*+m[2];
      // 🚨 **휘도만으로 '검정 칠'을 가르면 포화색을 오독한다** (㉶ 에서 밟았다).
      //    원본 042340 소환 버튼의 `160` 은 **빨강 rgb(237,28,36) + 검정 링**인데, 그 휘도는 73 이라
      //    `ink<128` 술어에 걸려 '검정 칠인데 링 있음 = 뺄 것'으로 잡혔다. 그대로 따랐으면
      //    **원본에 있는 링을 지울 뻔했다**(㉴ 의 '같은 색 스트로크' 오독과 같은 계열).
      //    사람 눈이 '검정 칠'이라 부르는 것은 어두운 **무채색**이므로, 밝기는 최대 채널로 잰다 —
      //    빨강은 max 237 이라 밝은 칠이고, `#17181a` 급 잉크는 max 26 이라 검정 칠 그대로다.
      const inkMax=Math.max(+m[0],+m[1],+m[2]);
      // 글자가 실제로 깔린 판의 휘도 — 자기 자신부터 위로 올라가 처음 만나는 불투명 배경.
      let bg=null;
      for(let e=el;e&&e!==document.documentElement;e=e.parentElement){
        const q=(getComputedStyle(e).backgroundColor||'').match(/-?[\d.]+/g);
        if(!q)continue;
        if((q.length>3?+q[3]:1)<0.5)continue;
        bg=0.2126*+q[0]+0.7152*+q[1]+0.0722*+q[2]; break;
      }
      // 🚨 **원본이 통째로 민무늬인 면** — 규칙 ㉮ 는 '칠이 밝으면 링'이지만, 원본에는 그 규칙이
      //    아예 미치지 않는 면이 있다. `#chat-preview`(메인 하단 채팅 미리보기 띠)가 그렇다:
      //    042120 을 20배로 확대하면 빨간 배지의 흰 `99`, 회색 띠 위 흰 `Ligma`, 검정 본문 세
      //    가지가 **전부 민무늬**다(배지는 원 테두리조차 없다). 이 띠는 게임 크롬이 아니라
      //    채팅 **본문 타이포**이고, 채팅 화면(043500)에서도 본문 `.chat-bubble`/`.chat-time` 은
      //    민무늬다(㉴ 가 확인) — 링을 두르는 건 닉네임 칩 쪽이다. `#tabbar` 처럼 '작업이 아닌
      //    자리'라 세는 칸을 따로 둔다(지우지 않는다 — 근거가 남아야 다음 세션이 다시 안 판다).
      //    ⓑ `.summon-gauge`(소환 게이지 트랙 가운데 수치) — 원본 042340 의 같은 자리 `5/110` 은
      //       16배로 봐도 민무늬다. 원본 트랙 판이 rgb(14,17,27) 휘도 17 이라 그렇고, 클론 트랙이
      //       휘도 43 인 것은 `ui-quality-up` 12차가 **사용자 지시로 일부러 밝힌**(`#262c34`) 값이다.
      //       판이 밝아진 건 클론 사정이고 화법은 원본을 따른다(흰/#262c34 대비는 이미 12:1 이라
      //       링이 할 일도 없다). **임계를 올려 걷어내면 안 된다** — 위 DEAD_BG 머리말의 반례 참조.
      const ringFree=!!el.closest('#chat-preview, .summon-gauge');
      out.push({p:pathOf(el),has:keyline||hardRing,sw,ringFree,sh:sh.slice(0,60),ink:+ink.toFixed(0),inkMax,bg:bg===null?null:+bg.toFixed(0),fs:+parseFloat(s.fontSize).toFixed(1),t:own.slice(0,14),color:s.color});
    }
    return out;
  });
  // 검정 판 위의 밝은 글자는 **링을 넣어도 안 보인다** — 링 색이 판 색이라 아무것도 안 갈라 주고,
  // 굵게 잡으면 글리프만 갉는다. 원본이 실제로 그렇게 돼 있다: 042521 의 ⓘ 버튼(검정 원반 위 흰 `i`)을
  // 14배로 확대하면 **민무늬**다(획이 통짜 흰 막대 + 점). 그래서 '넣을 것'에서 빼고 따로 센다.
  // ⚠️ **임계 40 은 근사치이고, 원본에 이미 반례가 있다** (㉶ 실측). 이 값을 40 → 45 로 올려
  //    `.summon-gauge` 를 걷어내려다 되돌린 자리다: **원본 042340 소환 시트 헤더의 `44` pill 은
  //    판이 rgb(35,35,35) 휘도 35 인데도 흰 글자에 검정 테를 두른다**(042356 `28` 도 같다).
  //    즉 35 에서는 두르고 0(042521 ⓘ 검정 원반)·12(상단바 프로필 판)에서는 안 두른다 — 진짜
  //    경계는 40 보다 훨씬 아래다. 임계를 올리면 `.cur-pill.winder`(#2b2b2b, 43) 같은 자리를
  //    **원본이 두르는데도 '무의미'로 걷어내** 버린다. 그래서 40 을 유지하고, 개별 반례는
  //    아래 RING_FREE(원본을 확대해 확인한 면)로 근거를 남겨 뺀다.
  const DEAD_BG=40;   // --pp-line 이 #000 이라 이보다 어두운 판에서는 검정 링이 무의미하다
  const dead=r=>r.bg!==null&&r.bg<=DEAD_BG;
  const BRIGHT=r=>r.inkMax>=128;   // 휘도가 아니라 최대 채널 — 위 머리말(포화색 오독)
  // 🚨 **'넣을 것'과 '뺄 것'의 술어는 대칭이 아니다** — 링이 하는 일이 양쪽에서 다르기 때문이다.
  //    ⓐ **넣을 것 = 판보다 밝은 칠**. 원본에서 링이 붙는 자리는 전부 밝은 칠이 어두운 판을
  //       딛고 선 자리다(042340 `스킬` 흰 칠/파란 판 · `44` 흰 칠/#2b2b2b · 042120 `자동`
  //       흰 칠/초록). 반대로 **판보다 어두운 칠은 원본이 안 두른다** — 이 술어 없이 최대 채널만
  //       보면 `x1` 토글(흰 판 위 파란 `#005dff`, 휘도 85·최대 255)이 '넣을 것'으로 잡히는데,
  //       원본에는 이 꺼진 상태 자체가 없고(항상 `x5`) 파랑/흰 대비는 이미 8:1 이라 링이 할 일이 없다.
  //    ⓑ **뺄 것 = 어두운 무채색 칠에 링이 있는 자리**(위 최대 채널). 여기에 ⓐ 를 같이 걸면
  //       안 된다 — 원본 소환 버튼의 빨간 `160` 은 **밝은 회색 판 위 어두운 칠인데도 링이 있다.**
  const lighter=r=>r.bg===null||r.ink>r.bg;
  const cand=r=>BRIGHT(r)&&lighter(r)&&!r.has;
  const need=res.filter(r=>cand(r)&&!dead(r)&&!r.ringFree), over=res.filter(r=>!BRIGHT(r)&&r.has&&!r.ringFree);
  const moot=res.filter(r=>cand(r)&&dead(r)&&!r.ringFree);
  const free=res.filter(r=>cand(r)&&r.ringFree);
  console.log(`화면 ${WANT}: 글자요소 ${res.length} · 넣을 것 ${need.length} · 뺄 것 ${over.length}`
    + (moot.length?` · 링 무의미(검정 판 위) ${moot.length}`:'')
    + (free.length?` · 원본 민무늬 면 ${free.length}`:''));
  console.log('\n-- 넣을 것 --'); for(const r of need) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} ${r.color.padEnd(18)} "${r.t}"  ${r.p}`);
  if(moot.length){console.log('\n-- 링 무의미(검정 판 위 · 원본도 민무늬) --');
    for(const r of moot) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} "${r.t}"  ${r.p}`);}
  if(free.length){console.log('\n-- 원본 민무늬 면(#chat-preview · .summon-gauge — 원본 확대로 확인) --');
    for(const r of free) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} bg${String(r.bg).padStart(4)} "${r.t}"  ${r.p}`);}
  console.log('\n-- 뺄 것 --'); for(const r of over) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} "${r.t}"  ${r.p}`);
  console.log('\n-- 검정 칠(상속 스트로크를 꺼야 하는 자리) --'); for(const r of res.filter(x=>!BRIGHT(x))) console.log(`  ${String(r.fs+'px').padEnd(7)} ink${String(r.ink).padStart(4)} sw=${r.sw} sh=${r.sh} "${r.t}"  ${r.p}`);
  await b.close();
})();
