// 던전 배너 배경 일러스트 4종 눈 확인용 (icon-gen 슬라이스, 사용자 지시 2026-08-19 대응).
// 원본 대조: web/ref/screens/shot-042251.png 와 나란히 두고 볼 것.
// 사용: node shot-dg-banners.js [출력경로접두사]   (기본 tools/dg-banners)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { SEED_SRC } = require('./shot-screens-seed.js');
const OUT = process.argv[2] || path.join(__dirname, 'dg-banners');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:499,height:892}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errs.push(m.text());});
 await p.goto(INDEX);
 await p.waitForFunction(()=>typeof UI!=='undefined'&&typeof S!=='undefined'&&typeof Forge!=='undefined',null,{timeout:30000});
 await p.evaluate(SEED_SRC); await p.reload();
 await p.waitForFunction(()=>typeof UI!=='undefined'&&S&&S.forgeLevel===29,null,{timeout:30000});
 await p.evaluate(`Scene3D&&(Scene3D.update=function(){}); UI.toast=function(){}; S.autoForgeOn=false; UI.showCraftModal=function(){}; S.bestChapter=20; S.bestStage=9;`);
 await p.waitForTimeout(1500);
 await p.evaluate(`UI.closeAllTabSurfaces&&UI.closeAllTabSurfaces(); UI.openDungeons();`);
 await p.waitForTimeout(1500);
 await p.screenshot({path:OUT+'-dungeons.png'});
 console.log('errs',errs.length,errs.slice(0,3));
 await b.close();
})();
