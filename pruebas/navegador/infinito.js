// Modo Infinito en solitario sin cuenta: oleadas, jefes, eventos, hitos, final y una partida
// muy larga acelerada (cientos de oleadas) para vigilar memoria, rendimiento y números.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const GAME=process.env.GAME_URL||'http://127.0.0.1:8766/www/index.html';
let ok=0,bad=0;const check=(n,c,x)=>{if(c){ok++;console.log('  ok   ',n)}else{bad++;console.log('  FALLO',n,x===undefined?'':JSON.stringify(x).slice(0,400))}};
(async()=>{const b=await chromium.launch({args:['--enable-precise-memory-info','--js-flags=--expose-gc']});const p=await (await b.newContext({viewport:{width:844,height:390}})).newPage();
const errs=[];p.on('pageerror',e=>{errs.push(e.message);console.log('ERR',e.message,(e.stack||'').split('\n')[1])});
await p.goto(GAME+'?sburl=off');await p.waitForTimeout(800);
await p.evaluate(()=>{SAVE.ob.skip=1;save();menu()});
check('el menú tiene el botón del modo Infinito',!!(await p.$('#minf')));
// avanza el juego deprisa: el jugador no recibe daño, se eligen mejoras solas y (si se pide) caen los demonios
await p.evaluate(()=>{window.T={god:1,kill:0,steps:0,maxE:0,maxG:0,maxB:0,maxFX:0,bad:0,t0:0,ms:0};
  window.tick=n=>{for(let i=0;i<n;i++){if(!run)return;if(paused){const c=ov.querySelector('button.opt');if(c)c.click();paused=false;continue}
    if(T.god)P.ivf=1e9;if(T.kill)for(const e of E)if(!e.dead&&!(e.inv>0))hit(e,1e12);
    const a=performance.now();update(1/30);T.ms+=performance.now()-a;T.steps++;
    T.maxE=Math.max(T.maxE,E.length);T.maxG=Math.max(T.maxG,G.length);T.maxB=Math.max(T.maxB,B.length);T.maxFX=Math.max(T.maxFX,FXL.length);
    for(const e of E)if(!Number.isFinite(e.hp)||!Number.isFinite(e.x))T.bad++;}}});
console.log('Empezar');
await p.click('#minf');await p.waitForTimeout(300);
let s=await p.evaluate(()=>({inf:!!S.inf,st:S.inf&&S.inf.st,w:S.inf&&S.inf.w,hud:hd.wn.textContent,sched:S.sched.length}));
check('empieza en modo Infinito con un descanso para prepararse',s.inf&&s.st==='rest'&&s.w===0&&/Prepárate/.test(s.hud),s);
check('sin jefe final ni horario de la partida normal',s.sched===0);
await p.evaluate(()=>tick(150));
s=await p.evaluate(()=>({w:S.inf.w,st:S.inf.st,q:S.inf.q,tot:S.inf.tot,iw:E.filter(e=>e.iw===1).length,hud:hd.wn.textContent}));
check('llega la oleada 1 con sus demonios',s.w===1&&s.st==='fight'&&s.tot>=12&&s.iw>0,s);
check('el marcador muestra oleada, restantes y puntos',/Oleada 1 · quedan \d+/.test(s.hud)&&/pts/.test(s.hud),s.hud);
await p.evaluate(()=>{T.kill=1;tick(30*25)});
s=await p.evaluate(()=>({w:S.inf.w,done:S.inf.done,st:S.inf.st,coins:S.coins,hud:hd.wn.textContent}));
check('al acabar con todos se supera la oleada y hay descanso',s.done>=1&&(s.st==='rest'||s.w>s.done),s);
check('superar oleadas da monedas',s.coins>0,s);
console.log('Jefes, eventos e hitos');
const seen=await p.evaluate(()=>{const o={boss:{},ev:{},hp:{},mil:0};const t0=S.t;
  while(S.inf.done<26&&S.t-t0<3000&&run){tick(30);const I=S.inf;if(I.st==='fight'){if(I.ev)o.ev[I.ev]=1;const b=E.find(e=>e.boss&&!e.dead);if(b)o.boss[I.w]=b.nm;
    if(!o.hp[I.w]){const c=E.find(e=>e.iw===I.w&&e.ty==='com'&&!e.dead);if(c&&!I.ev)o.hp[I.w]=c.hp}}if(S.intro&&/^¡Oleada \d+!$/.test(S.intro.nm))o.mil++}
  return {...o,done:S.inf.done,w:S.inf.w,bk:S.bk,t:S.t}});
check('hay jefe en las oleadas 5, 10, 15, 20 y 25',[5,10,15,20,25].every(w=>seen.boss[w]),seen.boss);
check('los jefes derrotados cuentan',seen.bk>=5,seen.bk);
check('salen eventos y desafíos variados',Object.keys(seen.ev).length>=4,seen.ev);
check('los hitos (10 y 25) se anuncian',seen.mil>=2,seen.mil);
const hw=Object.entries(seen.hp).map(([w,h])=>[+w,h]).sort((a,b)=>a[0]-b[0]);
check('los demonios tienen más vida en oleadas más altas',hw.length>=2&&hw[hw.length-1][1]>hw[0][1],hw);
console.log('Partida muy larga (acelerada)');
const lr=await p.evaluate(()=>{const t0=performance.now();T.ms=0;T.steps=0;const m0=performance.memory?performance.memory.usedJSHeapSize:0;
  while(S.inf.done<300&&performance.now()-t0<240000&&run)tick(60);
  if(window.gc)gc();const m1=performance.memory?performance.memory.usedJSHeapSize:0;
  return {done:S.inf.done,t:Math.round(S.t),steps:T.steps,avg:T.ms/T.steps,maxE:T.maxE,maxG:T.maxG,maxB:T.maxB,maxFX:T.maxFX,bad:T.bad,heapMB:[Math.round(m0/1e6),Math.round(m1/1e6)],
    sc:S.inf.sc,score:infScore(S.inf.done,S.kills,S.bk,S.dif),kills:S.kills,hp:Math.max(...E.filter(e=>!e.boss).map(e=>e.hp),0)}});
console.log('   ',JSON.stringify(lr));
check('supera 300 oleadas sin tope ni bloqueo',lr.done>=300,lr.done);
check('nunca hay más de 200 demonios a la vez',lr.maxE<=200,lr.maxE);
check('gemas, balas y efectos con tope',lr.maxG<=430&&lr.maxB<=230&&lr.maxFX<=100,lr);
check('sin números rotos (vida y posición siempre válidas)',lr.bad===0,lr.bad);
check('la puntuación es un número seguro',Number.isSafeInteger(lr.score)&&lr.score>0&&lr.score<=2e9,lr.score);
check('cada paso del juego sigue siendo rápido (< 8 ms de media)',lr.avg<8,lr.avg);
check('la memoria no se dispara (< 150 MB)',!lr.heapMB[1]||lr.heapMB[1]<150,lr.heapMB);
console.log('Final de la partida');
await p.evaluate(()=>{T.kill=0;T.god=0;P.ivf=0;for(let i=0;i<20&&run;i++){P.hp=-9999;tick(1)}});await p.waitForTimeout(500);
let t=await p.evaluate(()=>ov.innerText.replace(/\s+/g,' '));
check('al morir se ve el resumen del Infinito',/Modo Infinito/.test(t)&&/Oleada alcanzada: \d+/.test(t)&&/Puntuación: [\d.]+/.test(t),t.slice(0,300));
check('guarda el récord en el dispositivo',await p.evaluate(()=>SAVE.inf.best&&SAVE.inf.best.w>=300&&SAVE.inf.runs===1),await p.evaluate(()=>SAVE.inf));
await p.click('#rt');await p.waitForTimeout(300);
check('Reintentar vuelve a empezar en el Infinito',await p.evaluate(()=>!!(S.inf&&S.inf.w===0&&run)));
await p.evaluate(()=>menu());await p.waitForTimeout(200);
t=await p.evaluate(()=>$('minf').innerText);check('el menú muestra el récord',/récord: oleada \d+/.test(t),t);
await p.click('#mplay');await p.waitForTimeout(200);
check('Jugar sigue siendo la partida normal',await p.evaluate(()=>!S.inf&&S.sched.length>0&&run));
check('sin errores de JavaScript',errs.length===0,errs);
console.log(`\n${ok} bien, ${bad} fallos`);await b.close();process.exit(bad?1:0)})();
