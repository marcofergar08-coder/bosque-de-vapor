
/* ===== Fase 13: modo Infinito =====
 Oleadas sin fin: cada oleada tiene un número de demonios que hay que derrotar, un descanso
 corto después, un jefe cada 5 oleadas, eventos y desafíos al azar e hitos (10, 25, 50, 100
 y luego cada 50). La dificultad sigue subiendo sin tope de oleadas, pero con límites de
 demonios vivos a la vez para que el juego no se atasque. En las partidas en grupo todo lo
 decide el anfitrión y los demás lo reciben con el resto del estado (S.inf). */
const INF={next:0,retry:0,show:0};
const INF_MIL=[10,25,50,100];
const infMil=w=>INF_MIL.includes(w)||(w>100&&w%50===0);
// Oleada con la que se calculan vida, velocidad y daño de los demonios: igual hasta la 20 y
// después sube más despacio, para que las oleadas altas sean duras sin números absurdos.
const infSW=w=>w<=20?w:20+(w-20)*.75;
// Además, a partir de la oleada 12 los demonios ganan vida y daño extra que crece cada vez más
// deprisa: los héroes también se hacen muy fuertes y la partida tiene que acabar llegando a su límite.
const infHP=w=>1+.06*Math.max(0,w-12)+.0025*Math.pow(Math.max(0,w-30),2);
const infDM=w=>1+.025*Math.max(0,w-15);
const INF_DM={a:0,s:1,n:1.3,x:1.6};
// Misma fórmula que el servidor (inf_score); la que cuenta es la del servidor.
const infScore=(w,k,b,d)=>Math.min(2e9,Math.round((5*w*(w+1)+40*w+Math.min(k,1e7)+250*b)*(INF_DM[d]==null?1:INF_DM[d])));
const fmtN=n=>Math.round(n).toLocaleString('es-ES');
const INF_EV={
  enjambre:{n:'Enjambre',d:'Bandadas de murciélagos de ceniza',cnt:1.4,ty:'vol'},
  blindados:{n:'Blindados',d:'Demonios con un 60 % más de vida, pero menos',cnt:.75,hp:1.6,xp:1.5},
  estampida:{n:'Estampida',d:'Demonios un 30 % más rápidos',sp:1.3},
  elites:{n:'Noche de élites',d:'Llegan élites extra con cofres',el:3},
  oro:{n:'Lluvia de oro',d:'Los demonios sueltan más monedas',gold:1},
  niebla:{n:'Bruma espesa',d:'Espectros de bruma por todas partes',ty:'brm',cnt:1.1},
  gigantes:{n:'Pisadas de gigante',d:'Demonios gigantes en la oleada',ty:'gig',cnt:.8},
  cofre:{n:'Cofre del bosque',d:'Aparece un cofre al empezar',chest:1},
  intocable:{n:'Desafío: intocable',d:'Supera la oleada sin recibir daño',ch:'hurt'},
  reloj:{n:'Desafío: contrarreloj',d:'Supera la oleada a tiempo',ch:'time'}};
const INF_EVK=Object.keys(INF_EV);
/* ---- guardado local: récord del Infinito en este dispositivo ---- */
function infSan(x){const n=v=>Number.isFinite(+v)&&+v>=0?Math.min(2e9,Math.floor(+v)):0;const o={runs:0,best:null};
  if(x&&typeof x==='object'){o.runs=n(x.runs);const b=x.best;if(b&&typeof b==='object')o.best={sc:n(b.sc),w:n(b.w),t:n(b.t),k:n(b.k),b:n(b.b),d:['a','s','n','x'].includes(b.d)?b.d:'s'}}
  return o}
{const _sz=sanitize;sanitize=function(r){const s=_sz(r);s.inf=infSan(r&&r.inf);return s};
 try{const raw=localStorage.getItem(SK);SAVE.inf=infSan(raw?JSON.parse(raw).inf:null)}catch(e){SAVE.inf=infSan(null)}}
/* ---- empezar ---- */
{const _st=start;start=function(h){const inf=(INF.next||INF.retry)&&!PSPEC;INF.next=0;INF.show=0;const r=_st(h);
  if(inf&&S){S.inf={w:0,st:'rest',rt:4,q:0,left:0,tot:0,done:0,sc:0,ev:'',bt:0,lt:S.t,tw:0,hurt:0,lim:0,np:1};
    S.sched=[];S.L=1e9;S.xt=1e12;S.sp=1;S.wl=1e12;toast('Modo Infinito: aguanta todas las oleadas que puedas','boss')}
  return r}}
{const _mn=menu;menu=function(){INF.retry=0;INF.show=0;return _mn.apply(this,arguments)}}
// En el Infinito los demonios no salen poco a poco por tiempo: los saca cada oleada.
{const _sk=spawnTick;spawnTick=function(w){if(S&&S.inf){S.sp=1;return}return _sk(w)}}
// Cada demonio nace con la fuerza de su oleada y con lo que diga el evento de la oleada.
{const _se=spawnEnemy;spawnEnemy=function(k,x,y,o){if(!S||!S.inf)return _se(k,x,y,o);const I=S.inf,w0=S.wave;S.wave=Math.max(1,Math.floor(infSW(I.w||1)));
  let e;try{e=_se(k,x,y,o)}finally{S.wave=w0}const ev=INF_EV[I.ev]||{};const th=1+.15*((I.np||1)-1);
  e.hp=Math.max(1,Math.round(e.hp*(ev.hp||1)*th*infHP(I.w||1)));if(e.d>0)e.d=Math.round(e.d*infDM(I.w||1));if(ev.sp)e.sp*=ev.sp;if(ev.xp)e.xp=Math.round(e.xp*ev.xp);if(INF.mark)e.iw=I.w;return e}}
{const _hp=hurtP;hurtP=function(d){if(S&&S.inf&&S.inf.st==='fight'&&!(P.ivf>0))S.inf.hurt=1;return _hp(d)}}
{const _dr=drops;drops=function(e){const n0=G.length,r=_dr(e);if(!S||!S.inf)return r;
  // Con muchas oleadas salen muchos élites: si ya hay muchos cofres por recoger, el élite suelta monedas.
  if(e.el&&G.length>n0&&G[G.length-1].ch&&G.reduce((n,g)=>n+(g.ch?1:0),0)>10){G.pop();for(let i=0;i<3;i++)G.push({x:e.x+i*8,y:e.y,v:3,c:1})}
  if(S.inf.ev==='oro'&&!e.boss&&Math.random()<.35)G.push({x:e.x-6,y:e.y+6,v:2,c:1});return r}}
/* ---- oleadas ---- */
const infHost=()=>!!(S&&S.inf&&run&&!(NET.on&&!NET.host));
const infAlive=()=>NET.on&&NET.host&&NET.pl.length>1?NET.pl.filter(q=>!q.off&&!q.dn):[P];
function infBegin(){const I=S.inf,w=++I.w;S.wave=w;const sw=infSW(w);
  I.np=NET.on&&NET.host?Math.max(1,NET.pl.filter(q=>!q.off).length):1;const tm=[1,1.6,2.1,2.6][I.np-1]||2.6;
  const boss=w%5===0;let ev='';
  if(!boss&&w>=3&&Math.random()<.55){const opts=INF_EVK.filter(k=>k!==I.ev&&!(k==='reloj'&&w<6));ev=opts[Math.floor(Math.random()*opts.length)]}
  I.ev=ev;const E0=INF_EV[ev]||{};
  let n=Math.round((10+3.2*Math.pow(w,.85))*tm*(E0.cnt||1));if(boss)n=Math.round(n*.45);
  I.q=n;I.tot=n;I.tw=0;I.hurt=0;I.bt=.4;I.st='fight';I.lim=E0.ch==='time'?Math.round(25+n*.9):0;
  INF.mark=1;try{
    if(boss){const k=Math.floor(w/5)-1;S.bc=Math.floor(k/3);spawnBoss(k%3,false);const b=E[E.length-1];if(b&&b.boss){b.iw=w;if(I.np>1){b.hp=Math.round(b.hp*(1+.35*(I.np-1)));b.mhp=b.hp}}I.tot++}
    const ne=(w%3===0?Math.min(5,1+Math.floor(w/9)):0)+(E0.el||0);for(let i=0;i<ne;i++){spawnElite();I.tot++}
  }finally{INF.mark=0}
  if(E0.chest){const a=infAlive()[0]||P;G.push({x:a.x+40,y:a.y-20,v:0,ch:1})}
  const msg='Oleada '+w+(ev?' · '+E0.n+': '+E0.d+(I.lim?' ('+I.lim+' s)':''):'');toast(msg,boss?'boss':ev?'elite':'');sfx(boss?4:3);
  if(!boss&&(ev||w===1))S.intro={nm:'Oleada '+w,sub:ev?E0.n+' · '+E0.d:'¡Que empiece la noche!',t:2.2,col:'#d9a441',k:'inf'}}
function infSpawn(d){const I=S.inf,w=I.w,sw=Math.max(1,Math.floor(infSW(w)));I.bt-=d;if(I.bt>0||I.q<=0)return;
  const cap=Math.min(150,30+w*4);let live=0;for(const e of E)if(e.iw===w&&!e.dead)live++;if(live>=cap||E.length>=210){I.bt=.25;return}
  const al=infAlive(),a0=al[Math.floor(Math.random()*al.length)]||P,E0=INF_EV[I.ev]||{};
  let b=Math.min(I.q,2+Math.floor(w/4),Math.max(1,cap-live));const ang=Math.random()*6.283,dd=Math.hypot(W,H)/Z/2+40;
  INF.mark=1;try{while(b>0){const k=E0.ty&&Math.random()<.55?E0.ty:pickType(sw),g=Math.min(b,ARCH[k].grp||1);
    for(let i=0;i<g;i++){const aa=ang+(i-1)*.12+(Math.random()-.5)*.5;spawnEnemy(k,a0.x+Math.cos(aa)*dd,a0.y+Math.sin(aa)*dd)}b-=g;I.q-=g}}
  finally{INF.mark=0}
  I.bt=Math.max(.3,1.3-w*.025)}
function infEnd(){const I=S.inf,w=I.w;I.done=w;I.st='rest';I.rt=w%5===0?9:6;
  let c=4+Math.floor(w*1.5);const out=['Oleada '+w+' superada'];
  const E0=INF_EV[I.ev]||{};
  if(E0.ch==='hurt'){if(!I.hurt){c+=25+w;out.push('desafío superado')}else out.push('desafío fallado')}
  if(E0.ch==='time'){if(I.tw<=I.lim){c+=25+w;out.push('desafío superado')}else out.push('desafío fallado')}
  if(infMil(w)){const mb=w>=100?1000:w>=50?400:w>=25?150:50;c+=mb;const a=infAlive()[0]||P;G.push({x:a.x+36,y:a.y+10,v:0,ch:2});
    S.intro={nm:'¡Oleada '+w+'!',sub:'Hito del modo Infinito · +'+mb+' monedas y un cofre raro',t:3.4,col:'#d9a441',k:'inf'};sfx('win')}
  S.coins+=Math.round(c*(S.F?S.F.M.coin:1));
  // descanso: todos se curan un poco, los caídos vuelven y hay experiencia extra
  const pl=NET.on&&NET.host&&NET.pl.length>1?NET.pl:[P];
  for(const q of pl){if(q.off)continue;if(q.dn)q.dn=.01;q.hp=Math.min(q.max,q.hp+q.max*.15)}
  P.xp+=P.next*.3;I.ev='';
  I.sc=infScore(I.done,S.kills,S.bk,S.dif);
  toast(out.join(' · ')+' · +'+c+' monedas','chest')}
function infTick(){const I=S.inf,d=S.t-I.lt;I.lt=S.t;if(!(d>0)||d>1)return;
  if(I.st==='rest'){I.rt-=d;if(I.rt<=0)infBegin();return}
  I.tw+=d;infSpawn(d);
  let alive=0,boss=0;for(const e of E)if(e.iw===I.w&&!e.dead){alive++;if(e.boss)boss=1}
  if(I.q+alive!==I.left)I.lk=I.tw;I.left=I.q+alive;I.boss=boss;
  // Rezagados: si quedan pocos y llevan un rato sin caer (huyen o se han quedado lejos),
  // vuelven a aparecer cerca de un jugador para que la oleada no se quede atascada.
  if(I.q<=0&&alive>0&&!boss&&alive<=Math.max(3,Math.ceil(I.tot*.15))&&I.tw-(I.lk||0)>20){I.lk=I.tw-5;const al=infAlive();
    for(const e of E)if(e.iw===I.w&&!e.dead){const a0=al[Math.floor(Math.random()*al.length)]||P,an=Math.random()*6.283;e.x=a0.x+Math.cos(an)*190;e.y=a0.y+Math.sin(an)*190;fxr(e.x,e.y,40,'#c9243a',.4)}
    toast('¡Los últimos demonios de la oleada vuelven a por ti!','elite')}
  if(I.q<=0&&alive===0&&!S.bd)infEnd()}
{const _up=update;update=function(dt){if(!infHost())return _up(dt);const I=S.inf;
  // la oleada que el juego calcula por tiempo pasa a ser la oleada del Infinito
  S.wl=I.w<=1?1e12:Math.max(1e-6,(S.t+dt)/(I.w-.5));
  const r=_up(dt);if(S&&S.inf&&run&&!S.ended)infTick();return r}}
/* ---- marcador ---- */
{const _uh=updHud;updHud=function(){_uh();if(!S||!S.inf||!P)return;const I=S.inf,E0=INF_EV[I.ev]||{};
  const t=I.st==='rest'?(I.w?'Oleada '+I.w+' superada · siguiente en '+Math.max(0,Math.ceil(I.rt))+' s':'Prepárate · oleada 1 en '+Math.max(0,Math.ceil(I.rt))+' s')
    :'Oleada '+I.w+' · quedan '+(I.left||0)+(I.boss?' · ¡Jefe!':'')+(E0.ch==='time'?' · '+Math.max(0,Math.ceil(I.lim-I.tw))+' s':'')+(E0.ch==='hurt'?(I.hurt?' · desafío fallado':' · sin daño'):'');
  setT(hd.wn,t+' · '+fmtN(infScore(I.done,S.kills,S.bk,S.dif))+' pts'+(S.dif&&S.dif!=='s'?' · '+DIFS[S.dif].n:''))}}
/* ---- final de la partida ---- */
function infSummary(){const I=S.inf;return `<div class="note" id="infres" style="text-align:left"><b>Modo Infinito</b><br>Oleada alcanzada: <b>${I.w}</b> (${I.done} superadas) · Jefes: ${S.bk}<br>
  Tiempo: ${fmt(S.t)} · Demonios: ${fmtN(S.kills)} · Puntuación: <b>${fmtN(I.sc)}</b>${INF.rec?'<br><b>¡Nuevo récord en este dispositivo!</b>':''}</div>`}
{const _er=endRun;endRun=function(w){const first=S&&S.inf&&!S.ended;const r=_er(w);
  if(first){const I=S.inf;I.sc=infScore(I.done,S.kills,S.bk,S.dif);INF.retry=!NET.on;INF.show=1;INF.rec=0;
    const s=SAVE.inf||(SAVE.inf=infSan(null));s.runs=Math.min(2e9,s.runs+1);
    if(S.dif!=='a'&&(!s.best||I.sc>s.best.sc)){s.best={sc:I.sc,w:I.w,t:Math.floor(S.t),k:S.kills,b:S.bk,d:S.dif};INF.rec=1}save()}
  return r}}
{const _scr=scr;scr=function(h){const r=_scr(h);if(INF.show&&S&&S.inf&&!$('infres')){const bx=ov.querySelector('.box');if(bx){const d=document.createElement('div');d.innerHTML=infSummary();const b=bx.querySelector('.opt');if(b)b.parentNode.insertBefore(d.firstChild,b);else bx.appendChild(d.firstChild)}}return r}}
// Invitado: el anfitrión manda al final las oleadas y jefes exactos.
if(typeof netGuestEnd==='function'){const _ge=netGuestEnd;netGuestEnd=function(m){if(S&&S.inf){if(m.wv!=null){S.inf.done=m.wv|0;S.inf.w=m.iw|0||S.inf.w}if(m.bs!=null)S.bk=m.bs|0;
  S.inf.sc=infScore(S.inf.done,m.k|0,S.bk|0,S.dif);INF.show=1;INF.rec=0}return _ge.apply(this,arguments)}}
{const _ne=window.onNetEnd;window.onNetEnd=null;Object.defineProperty(window,'onNetEnd',{configurable:true,get(){return INF._one},set(f){INF._one=f?function(m){if(S&&S.inf){if(m.wv!=null){S.inf.done=m.wv|0}if(m.bs!=null)S.bk=m.bs|0}return f.apply(this,arguments)}:f}});if(_ne)window.onNetEnd=_ne}
/* ---- en grupo: estar cerca de un compañero caído lo levanta antes ---- */
if(typeof netDownTick==='function'){const _nd=netDownTick;netDownTick=function(q,dt){if(q.dn&&NET.on&&NET.host){for(const o of NET.pl){if(o===q||o.dn||o.off)continue;if(Math.hypot(o.x-q.x,o.y-q.y)<70){q.dn-=dt*2;break}}}return _nd(q,dt)}}
/* ---- menú: botón del modo Infinito ---- */
{const _mn=menu;menu=function(){const r=_mn.apply(this,arguments);const a=$('mplay');if(a&&!$('minf')){const b=SAVE.inf&&SAVE.inf.best,x=document.createElement('button');x.className='opt big';x.id='minf';
  x.innerHTML=IC('star')+`<div><b>Modo Infinito</b><span>Oleadas sin fin${b?' · récord: oleada '+b.w+', '+fmtN(b.sc)+' pts':' · ¿hasta dónde llegarás?'}</span></div>`;a.after(x);
  x.onclick=()=>{const h=HID(SAVE.last)&&isUn(HID(SAVE.last))?HID(SAVE.last):HEROES[0];INF.next=1;start(h)}}return r}}
/* ---- sala con código: el anfitrión elige partida normal o Infinito ---- */
if(typeof netLobby==='function'){const _nl=netLobby;netLobby=function(){const r=_nl.apply(this,arguments);const g=$('ngo');if(g&&!$('ninf')&&NET.host&&!run){
  const x=document.createElement('button');x.className='opt';x.id='ninf';const draw=()=>{x.innerHTML=IC('star')+`<div><b>Modo: ${INF.lobby?'Infinito':'Normal'}</b><span>${INF.lobby?'Oleadas sin fin':'Con jefe final'} · toca para cambiar</span></div>`};draw();
  x.onclick=()=>{INF.lobby=!INF.lobby;draw()};g.after(x);const go=g.onclick;g.onclick=()=>{INF.next=INF.lobby?1:0;go&&go()}}return r}}
window.INF=INF;
