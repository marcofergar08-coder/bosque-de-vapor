/* ===== Fase 8: online con amigos (2 a 4 jugadores; el anfitrión simula la partida) =====
 El anfitrión calcula todo y manda a los demás lo que cambia. Si un invitado se corta, su
 personaje espera 60 s a que vuelva (con el mismo identificador) antes de salir de la partida. */
const NET={on:0,host:0,peer:null,conn:null,code:'',max:4,gs:[],pl:[],you:0,ids:new WeakMap(),nx:0,prev:new Map(),objs:new Map(),it:0,fx:[],hp:0,cq:[],inp:{x:0,y:0,u:0},
  gid:'',nm:'',allow:null,mid:null,rc:0,leaving:0,full:0};
const NET_PFX='bosquevapor8-',NET_SNAP=1/15,NET_WAIT=60;
try{NET.gid=sessionStorage.getItem('bdv_gid')||'';if(!NET.gid){NET.gid=Math.random().toString(36).slice(2,12);sessionStorage.setItem('bdv_gid',NET.gid)}}catch(e){NET.gid=Math.random().toString(36).slice(2,12)}
/* temporizadores internos que la pantalla del invitado no necesita */
const NET_SKIP=new Set(['wa','_w','ho','cd','hh','ha','hs','bnt','age','lx','ly','bt','pt','at','ht','au','af','ct','gt','rt','bs','ft','grace','mt','sp','nb','_tx','_ty','_lt']),NET_INT=new Set(['x','y','vx','vy','tx','ty']),NET_D1=new Set(['f','l','t','hurt']);
function netCfg(){const q=new URLSearchParams(location.search),h=q.get('peerhost');return h?{host:h,port:+(q.get('peerport')||9000),path:'/',secure:false,debug:0}:{debug:0}}
function netCode(){const L='ABCDEFGHJKLMNPQRSTUVWXYZ';let s='';for(let i=0;i<4;i++)s+=L[Math.floor(Math.random()*L.length)];return s}
const netName=()=>(typeof ME!=='undefined'&&ME&&ME.username)||'';
function netSend(m){try{if(NET.conn&&NET.conn.open)NET.conn.send(m)}catch(e){}}
function netTo(g,m){try{if(g.c&&g.c.open)g.c.send(m)}catch(e){}}
function netAll(m){for(const g of NET.gs)netTo(g,m)}
const netGuests=()=>NET.gs.filter(g=>g.q);
function netClose(msg){const c=NET.conn,p=NET.peer,gs=NET.gs;NET.conn=null;NET.peer=null;NET.on=0;NET.host=0;NET.gs=[];NET.pl=[];NET.cq=[];NET.objs.clear();NET.prev.clear();NET.allow=null;NET.rc=0;clearTimeout(NET.rcT);
  for(const g of gs)try{g.c&&g.c.close()}catch(e){}try{c&&c.close()}catch(e){}try{p&&p.destroy()}catch(e){}if(msg)toast(msg,'boss')}
/* --- cambiar de jugador activo: casi todo el juego lee la variable global P --- */
const WAK=['AN','HN','TR','BL','GD'];
function getWA(){return{AN,HN,TR,BL,GD}}
function setWA(o){AN=o.AN;HN=o.HN;TR=o.TR;BL=o.BL;GD=o.GD}
function withP(q,f,full){if(!q||q===P)return f();const sp=P;let sa=null;if(full){sa=getWA();setWA(q.wa)}P=q;
  try{return f()}finally{if(full){q.wa=getWA();setWA(sa)}P=sp}}
function mkPlayer(h,slot){const sv=P;
  const q={x:40+28*slot,y:0,hp:h.hp,max:h.hp,spd:h.spd,lvl:1,xp:0,next:3,mag:h.pas==='light'?140:70,dm:h.dmg,reg:({regen:.6,druid:.3,squire:.4})[h.pas]||0,uc:12,um:12,ux:0,ur:0,slow:0,pz:0,h,w:Object.fromEntries(WKEYS.map(k=>[k,0])),p:Object.fromEntries(Object.keys(PAS).map(k=>[k,0])),ev:{},wb:{},at:{},cdA:h.pas==='spark'?.88:1,bf:null,evfl:0,at:0,ht:0,ang:0,bt:0,pt:0,hurt:0,fx:0};
  q.mag+=12*MT('mag');q.max+=10*MT('hp');q.hp=q.max;q.dm*=1+.08*MT('dm');q.spd*=1+.05*MT('spd');q.w[h.w]=1;
  q.wa={AN:[],HN:[],TR:[],BL:[],GD:[]};P=sv;return q}
/* --- jugador caído: vuelve a los 12 s; si caen todos, se acaba la partida --- */
function netDown(q){if(q.dn)return;q.dn=12;q._w=q.w;q.w={};q._spd=q.spd;q.spd=0;q.hp=1;q.ivf=999;q.bf=null;
  toast((q.nm||q.h.n)+' ha caído: vuelve en 12 s','boss');netAllDown()}
function netAllDown(){const a=NET.pl.filter(o=>!o.off);if(a.length&&a.every(o=>o.dn)){const s=P;P=NET.pl[0];NET.end=1;over();P=s}}
function netDownTick(q,dt){if(!q.dn)return;q.dn-=dt;q.ivf=999;q.hp=Math.max(q.hp,1);if(q.dn<=0){q.dn=0;q.w=q._w;q.spd=q._spd;q.hp=Math.ceil(q.max*.5);q.ivf=2;toast('¡'+(q.nm||q.h.n)+' ha vuelto!','chest')}}
/* --- turno de cada invitado en el anfitrión --- */
function gTick(g,dt){const q=g.q,P1=NET.pl[0];if(!q)return;
  if(q.off){q.ivf=999;if(!g.c){g.off-=dt;if(g.off<=0)netDrop(g,(q.nm||'Un jugador')+' no ha vuelto y sale de la partida')}return}
  netDownTick(q,dt);
  withP(q,()=>{P.uc=Math.max(0,P.uc-dt);let dx=g.inp.x||0,dy=g.inp.y||0;const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m}
    const k=ptr()*(P.slow>0?.55:1)*(P.bf&&P.bf.id==='willie'?1.25:1)*(S.F?S.F.M.spd:1);P.x+=dx*P.spd*k*dt;P.y+=dy*P.spd*k*dt;pushOut(P,9);
    const tx=P.x-P1.x,ty=P.y-P1.y,td=Math.hypot(tx,ty);if(td>520){P.x=P1.x+tx/td*520;P.y=P1.y+ty/td*520}
    P.hp=Math.min(P.max,P.hp+(P.reg+({pooh:3,hedera:4}[P.bf&&P.bf.id]||0))*dt);P.hurt-=dt;P.ivf=Math.max(0,(P.ivf||0)-dt);if(P.bf){P.bf.t-=dt;if(P.bf.t<=0)P.bf=null}if(P.evfl>0)P.evfl-=dt;P.slow-=dt;if(P.h.pas==='golem')P.slow=0;if(P.pz>0){P.pz-=dt;P.hp-=3*dt}
    const mvx=P.x-(P.lx==null?P.x:P.lx),mvy=P.y-(P.ly==null?P.y:P.ly),sp=Math.hypot(mvx,mvy)/Math.max(dt,1e-3);P.lx=P.x;P.ly=P.y;P.mv+=((sp>20?1:0)-(P.mv||0))*Math.min(1,dt*10)||0;if(!(P.mv>=0))P.mv=0;
    weapons(dt);P.fx-=dt;P.ux-=dt;
    EB.forEach(b=>{if(P.hurt<=0&&Math.hypot(P.x-b.x,P.y-b.y)<14){hurtP(b.dm||12);P.hurt=.45;if(b.sw)P.slow=Math.max(P.slow,b.sw);b.l=0;sfx(5)}});EB=EB.filter(b=>b.l>0);
    G=G.filter(o=>{if(o.ch)return true;const d=Math.hypot(P.x-o.x,P.y-o.y);
      if(d<P.mag){o.x+=(P.x-o.x)/d*260*dt;o.y+=(P.y-o.y)/d*260*dt}
      if(d<14){if(o.c){S.coins+=Math.max(1,Math.round(o.v*(1+.15*MT('coin'))*(S.F?S.F.M.coin:1)));sfx('coin');fxCoin(o.x,o.y)}else{P1.xp+=o.v*(1+.08*MT('xp'));sfx('gem');fxGem(o.x,o.y)}return false}return true});
    if(g.inp.u){g.inp.u=0;useUlt()}
  },true);
  q.lvl=P1.lvl;q.xp=P1.xp;q.next=P1.next;
  if(q.hp<=0&&!q.dn)netDown(q)}
/* un invitado sale de la partida (abandona o no vuelve a tiempo) */
function netDrop(g,msg){const i=NET.gs.indexOf(g);if(i>=0)NET.gs.splice(i,1);if(g.q){NET.pl=NET.pl.filter(o=>o!==g.q);g.q.wa={AN:[],HN:[],TR:[],BL:[],GD:[]}}
  try{g.c&&g.c.close()}catch(e){}if(msg)toast(msg,'boss');NET.full=1;if(run)netAllDown();else netLobby()}
/* --- réplica del estado: el anfitrión manda solo lo que cambia --- */
function nid(o){let i=NET.ids.get(o);if(!i){i=++NET.nx;NET.ids.set(o,i)}return i}
function enc(v,d){if(v==null||typeof v==='boolean'||typeof v==='string')return v;
  if(typeof v==='number')return Number.isFinite(v)?Math.round(v*100)/100:0;
  if(typeof v!=='object'||v instanceof Set||v instanceof Map||v instanceof Node||v instanceof Image||v instanceof CanvasPattern||v instanceof CanvasGradient)return undefined;
  const i=NET.ids.get(v);if(i&&d>0)return{'@':i};if(d>4)return undefined;
  if(Array.isArray(v))return v.map(x=>{const r=enc(x,d+1);return r===undefined?null:r});
  const o={};for(const k in v){if(k==='wa'||k==='_w'||k==='__')continue;const r=enc(v[k],d+1);if(r!==undefined)o[k]=r}return o}
function netPack(full){NET.tk=(NET.tk||0)+1;const gq=NET.pl.slice(1).filter(q=>!q.off);
  const nr=o=>o.boss||gq.some(q=>Math.abs(o.x-q.x)<760&&Math.abs(o.y-q.y)<760);
  const A={E:E.filter(nr),G:G.filter(nr),B:B.filter(nr),EB:EB.filter(nr),LG,FXL};
  const W=NET.pl.map((q,i)=>i?q.wa:getWA());
  const ids={},objs=[S,...NET.pl];for(const k in A){ids[k]=A[k].map(o=>{objs.push(o);return nid(o)})}
  ids.W=W.map(w=>{const r={};for(const k of WAK)r[k]=w[k].map(o=>{objs.push(o);return nid(o)});return r});
  const o={},live=new Set();
  for(const ob of objs){const i=nid(ob);live.add(i);let pv=NET.prev.get(i);if(!pv||full){pv={};NET.prev.set(i,pv)}const ch={};let n=0;
    for(const k in ob){if(NET_SKIP.has(k))continue;const v=ob[k];if(v&&typeof v==='object'&&!full&&NET.tk%4&&pv[k]!==undefined&&!NET.ids.get(v))continue;
      const r=typeof v==='number'?(NET_INT.has(k)?Math.round(v):NET_D1.has(k)&&ob!==S?Math.round(v*10)/10:enc(v,1)):enc(v,1);if(r===undefined)continue;const s=typeof r==='object'&&r!==null?JSON.stringify(r):r;if(pv[k]!==s){pv[k]=s;ch[k]=r;n++}}
    if(n)o[i]=ch}
  if(NET.prev.size>live.size*2+200)for(const k of NET.prev.keys())if(!live.has(k))NET.prev.delete(k);
  const fx=NET.fx;NET.fx=[];
  return{t:'s',a:ids,o,S:nid(S),pl:NET.pl.map(nid),pz:paused?1:0,fx}}
function dec(v){if(v==null||typeof v!=='object')return v;if(v['@']!=null){let o=NET.objs.get(v['@']);if(!o){o={};NET.objs.set(v['@'],o)}return o}
  if(Array.isArray(v))return v.map(dec);const o={};for(const k in v)o[k]=dec(v[k]);return o}
const NET_LERP=new Set(['x','y']);
function netApply(m){
  for(const id in m.o){let ob=NET.objs.get(+id);const fresh=!ob;if(!ob){ob={};NET.objs.set(+id,ob)}const ch=m.o[id];
    for(const k in ch){const v=dec(ch[k]);if(NET_LERP.has(k)&&typeof v==='number'&&typeof ob[k]==='number'&&!fresh){ob[k==='x'?'_tx':'_ty']=v}else{ob[k]=v;if(k==='x')ob._tx=v;if(k==='y')ob._ty=v}}}
  const g=i=>NET.objs.get(i),mp=a=>(a||[]).map(g).filter(Boolean);
  const nS=g(m.S);if(nS){if(!S||S!==nS){const t=S&&S.t;S=nS;if(t!=null&&Math.abs(S.t-t)<.25)S.t=t}if(PL!==MAPS[S.map||'forest'].pal){PL=MAPS[S.map||'forest'].pal;CK.clear()}}
  if(S&&S._lt!=null&&Math.abs(S._lt-S.t)<.25)S.t=S._lt;
  const A=m.a;E=mp(A.E);G=mp(A.G);B=mp(A.B);EB=mp(A.EB);LG=mp(A.LG);FXL=mp(A.FXL);
  const pl=m.pl.map(g);
  for(const q of pl)if(q&&q.h&&q.h.id){const h=HID(q.h.id);if(h)q.h=h}
  const W=(A.W||[]).map(w=>{const r={};for(const k of WAK)r[k]=mp(w[k]);return r});
  pl.forEach((q,i)=>{if(q)q.wa=W[i]||{AN:[],HN:[],TR:[],BL:[],GD:[]}});
  const all={AN:[],HN:[],TR:[],BL:[],GD:[]};for(const w of W)for(const k of WAK)all[k]=all[k].concat(w[k]);setWA(all);
  const me=pl[NET.you];if(pl.every(q=>q&&q.h&&q.w)&&me){P=me;NET.pl=pl}
  NET.hp=m.pz;
  for(const f of m.fx||[]){try{if(f[0]==='s')sfx(f[1],f[2]);else if(f[0]==='b')pBurst(...f.slice(1));else if(f[0]==='d')dnum(...f.slice(1))}catch(e){}}}
function netLerp(dt){const k=Math.min(1,dt*18);const L=o=>{if(o&&o._tx!=null){o.x+=(o._tx-o.x)*k;o.y+=(o._ty-o.y)*k}};
  E.forEach(L);B.forEach(L);EB.forEach(L);G.forEach(L);GD.forEach(L);AN.forEach(L);NET.pl.forEach(L)}
/* efectos y sonidos que solo existen en la pantalla: se reenvían a los invitados */
{const _s=sfx,_b=pBurst,_d=dnum;
 sfx=function(n,p){if(NET.on&&NET.host&&NET.fx.length<120)NET.fx.push(['s',n,p]);return _s(n,p)};
 pBurst=function(...a){if(NET.on&&NET.host&&NET.fx.length<120&&a.every(x=>typeof x!=='object'))NET.fx.push(['b',...a.map(x=>typeof x==='number'?Math.round(x*10)/10:x)]);return _b(...a)};
 dnum=function(...a){if(NET.on&&NET.host&&NET.fx.length<120&&a.every(x=>typeof x!=='object'))NET.fx.push(['d',...a.map(x=>typeof x==='number'?Math.round(x):x)]);return _d(...a)}}
/* --- enganches con el juego --- */
const netMulti=()=>NET.on&&NET.host&&NET.pl.length>1;
const _ea8=enemyAI;enemyAI=function(e,dt){if(!netMulti())return _ea8(e,dt);
  let q=P,bd=Infinity;for(const o of NET.pl){if(o.dn||o.off)continue;const d=Math.hypot(o.x-e.x,o.y-e.y);if(d<bd){bd=d;q=o}}
  return withP(q,()=>_ea8(e,dt))};
function netEnd(w){netAll({t:'end',w,k:S.kills,tm:Math.floor(S.t),c:S.coins,bs:S.bk|0,...(S.inf?{wv:S.inf.done|0,iw:S.inf.w|0}:{})})}
const _ov8=over;over=function(){if(netMulti()&&!NET.end){if(P.hp<=0)netDown(P);return}
  if(NET.on&&NET.host)netEnd(0);NET.end=0;return _ov8()};
const _wn8=win;win=function(){if(NET.on&&NET.host)netEnd(1);return _wn8()};
const _uu8=useUlt;useUlt=function(){if(NET.on&&!NET.host){NET.inp.u=1;return}if(P&&P.dn)return;return _uu8()};
const _lu8=levelUp;levelUp=function(ch){const r=_lu8(ch);if(netMulti()&&P===NET.pl[0])for(const g of netGuests())netOffer(g,ch);return r};
function netOffer(g,ch){if(g.q.off)return;withP(g.q,()=>{const ev=ch?evoReady()[0]:null;
  if(ev){P.ev[ev.w]=1;P.evfl=1.4;netTo(g,{t:'msg',m:'¡Evolución: '+ev.n+'!'});return}
  const pick=drawCards(3,ch?2.4:1);g.offers.push(pick);
  netTo(g,{t:'cards',ch:ch?1:0,lv:NET.pl[0].lvl,c:pick.map(u=>({g:u.g||'',t:u.t,d:u.d,r:u.r,tg:u.tg||''}))})},true)}
function netPick(g,i){const pick=g.offers.shift();if(!pick)return;const u=pick[i]||pick[0];withP(g.q,()=>{try{u.f()}catch(e){}},true);if(u.r===3){SAVE.leg=1;save()}}
const _up8=update;update=function(dt){
  if(!NET.on)return _up8(dt);
  if(!NET.host){netGuestTick(dt);return}
  if(NET.pl.length<2)return _up8(dt);
  for(const g of netGuests())if(g.offers.length&&(!g.c||g.q.off))while(g.offers.length)netPick(g,0);
  const wt=netGuests().find(g=>g.offers.length);
  if(wt){NET.wt=(NET.wt||0)-dt;if(NET.wt<=0){NET.wt=4;toast('Esperando a que '+(wt.q.nm||'tu amigo')+' elija mejora…','')}for(const g of netGuests())if(g.q.off&&!g.c){g.off-=dt;if(g.off<=0)netDrop(g,(g.q.nm||'Un jugador')+' no ha vuelto y sale de la partida')}return}
  netWatch();netDownTick(NET.pl[0],dt);_up8(dt);if(!run||paused)return;for(const g of netGuests().slice())gTick(g,dt)};
const _rd8=render;render=function(){
  if(netMulti()&&run){const now=performance.now();if(now-(NET.ls||0)>=NET_SNAP*1000){NET.ls=now;try{netAll(netPack(NET.full));NET.full=0}catch(e){console.error(e)}}}
  if(netMulti()){const s=getWA(),all={...s};for(const q of NET.pl.slice(1))for(const k of WAK)all[k]=all[k].concat(q.wa[k]);setWA(all);try{_rd8()}finally{setWA(s)}}
  else _rd8();
  if(NET.on&&!NET.host&&run&&(NET.hp||NET.rc)){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='rgba(20,18,16,.55)';ctx.fillRect(0,H/2-26,W,52);ctx.fillStyle='#f3ecd8';ctx.font='20px "Special Elite",monospace';ctx.textAlign='center';
    ctx.fillText(NET.rc?'Conexión perdida: reconectando…':'El anfitrión ha pausado la partida',W/2,H/2+7)}};
/* los otros jugadores se dibujan junto al tuyo, ordenados por altura */
function netOthers(lst){if(!NET.on)return;for(const q of NET.pl){if(!q||q===P||!q.h||!q.w)continue;lst.push([q.y,()=>withP(q,()=>{
  const s1=TR,s2=BL,s3=LG;TR=[];BL=[];LG=[];try{if(q.dn||q.off)ctx.globalAlpha=.4;drawGround2();drawHero();drawAir();ctx.globalAlpha=1;
    if(P.w.orb){const n=sv('orb','cnt'),rad=wAr('orb');for(let i=0;i<n;i++){const a=P.ang+i*6.283/n,rr=orbR(rad,i,.4),x=P.x+Math.cos(a)*rr,y=P.y+Math.sin(a)*rr;bl(x-5,y-8,4,2.5,'#ffffff');bl(x+5,y-8,4,2.5,'#ffffff');bl(x,y,7,6,PAPER);ctx.fillStyle=INKC;ctx.fillRect(x-2,y-5.5,2.5,11);ctx.fillRect(x+3,y-4.5,2,9)}}
    ctx.font='14px "Special Elite",monospace';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle=PAPER;const lb=q.off?'Desconectado':q.dn?'Caído · '+Math.ceil(q.dn)+' s':(q.nm||'Amigo');ctx.strokeText(lb,q.x,q.y-34);ctx.fillStyle=INKC;ctx.fillText(lb,q.x,q.y-34);
    const w=36,f=Math.max(0,q.hp/q.max);ctx.lineWidth=2;ctx.strokeStyle=INKC;ctx.fillStyle=PAPER;ctx.fillRect(q.x-w/2,q.y-30,w,5);ctx.fillStyle='#c9243a';ctx.fillRect(q.x-w/2,q.y-30,w*f,5);ctx.strokeRect(q.x-w/2,q.y-30,w,5);ctx.lineWidth=3}
  finally{TR=s1;BL=s2;LG=s3;ctx.globalAlpha=1}})])}}
/* --- invitado: manda los controles y dibuja lo que llega --- */
function netGuestTick(dt){
  let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);if(joy){dx=joy.x;dy=joy.y}
  NET.it-=dt;if(NET.it<=0||NET.inp.u){NET.it=1/30;netSend({t:'in',x:Math.round(dx*100)/100,y:Math.round(dy*100)/100,u:NET.inp.u?1:0});NET.inp.u=0}
  if(!NET.rc&&NET.conn&&NET.seen&&performance.now()-NET.seen>6000){const c=NET.conn;NET.conn=null;try{c.close()}catch(e){}netReconnect(Date.now())}
  if(!P||!S)return;if(!NET.hp&&!NET.rc){S.t+=dt;S._lt=S.t}netLerp(dt);try{polish(dt)}catch(e){}
  if(NET.cq.length&&ov.style.display==='none')netShowCards()}
function netShowCards(){const m=NET.cq[0];if(!m)return;ov.style.display='flex';
  ov.innerHTML=`<div class="box lvl"><h1>${m.ch?'¡Cofre del bosque!':'¡Nivel '+m.lv+'!'}</h1><p>Elige tu mejora</p><div class="cs">`+m.c.map((u,i)=>`<button class="opt rar r${u.r}" style="--c:${RAR[u.r].c};--d:${i*.09}s" data-i="${i}"><span class="dot"></span><div><b>${u.g} ${u.t}<i class="rr" style="background:${RAR[u.r].c}">${RAR[u.r].n}</i>${u.tg?'<i class="rr" style="background:#c9243a">'+u.tg+'</i>':''}</b><span>${u.d}</span></div></button>`).join('')+'</div></div>';
  ov.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{if(b.dataset.used)return;b.dataset.used=1;NET.cq.shift();netSend({t:'pick',i:+b.dataset.i});ov.style.display='none';sfx(2)})}
function netGuestStart(m){pReset();P=null;S={map:'forest',t:0,ts:[],kills:0,coins:0,wave:1};E=[];G=[];B=[];EB=[];setWA({AN:[],HN:[],TR:[],BL:[],GD:[]});LG=[];FXL=[];NET.objs.clear();NET.cq=[];NET.hp=0;NET.rc=0;
  NET.you=m&&m.you||1;NET.mid=m&&m.mid||null;NET.pl=[];NET.seen=performance.now();
  run=true;paused=false;pm=false;keys={};joy=null;lp.x=0;ov.style.display='none';hud.style.display='block';hd.kk='';invKey='';NET.on=1}
function netGuestEnd(m){if(!NET.on&&!run)return;run=false;NET.on=0;hud.style.display='none';SAVE.coins+=m.c||0;SAVE.earned=(SAVE.earned||0)+(m.c||0);SAVE.runs=(SAVE.runs||0)+1;save();
  scr(`<div class="box"><h1>${m.w?'¡Amanece en el bosque!':'Los demonios os han devorado'}</h1>${resultRows([['Tiempo',fmt(m.tm||0)],['Demonios derrotados',m.k||0],['Monedas para ti','+'+(m.c||0)]])}<div id="nres"></div><p>${m.host?'':'Esperando a que el anfitrión empiece otra partida…'}</p><button class="opt" id="nlv">${IC('back')}<div><b>Salir de la sala</b></div></button></div>`);
  $('nlv').onclick=()=>{NET.leaving=1;netClose();menu()}}
/* --- mensajes --- */
function netHostData(c,m){let g=NET.gs.find(x=>x.c===c);if(g)g.seen=performance.now();
  if(m.t==='hello'){const h=HID(m.h)||HEROES[0],gid=String(m.gid||'').slice(0,16),nm=String(m.nm||'').replace(/[^A-Za-z0-9_]/g,'').slice(0,16);
    const old=NET.gs.find(x=>x.gid===gid&&gid);
    if(old&&old.q&&run){if(old.c&&old.c!==c)try{old.c.close()}catch(e){}old.c=c;old.seen=performance.now();old.q.off=0;old.q.ivf=2;NET.full=1;toast('¡'+(old.q.nm||'Tu amigo')+' ha vuelto!','chest');
      netTo(old,{t:'start',you:NET.pl.indexOf(old.q),mid:NET.mid,re:1});return}
    if(old){if(old.c&&old.c!==c)try{old.c.close()}catch(e){}old.c=c;old.h=h;old.nm=nm;netLobby();return}
    if(run){try{c.send({t:'busy'})}catch(e){}setTimeout(()=>{try{c.close()}catch(e){}},300);return}
    if(NET.allow&&!NET.allow.includes(nm.toLowerCase())){try{c.send({t:'deny'})}catch(e){}setTimeout(()=>{try{c.close()}catch(e){}},300);return}
    if(NET.gs.length>=NET.max-1){try{c.send({t:'full'})}catch(e){}setTimeout(()=>{try{c.close()}catch(e){}},300);return}
    NET.gs.push({c,gid,nm,h,q:null,inp:{x:0,y:0,u:0},offers:[],off:0,seen:performance.now()});netLobby();return}
  if(!g)return;
  if(m.t==='in'){g.inp.x=+m.x||0;g.inp.y=+m.y||0;if(m.u)g.inp.u=1}
  else if(m.t==='pick')netPick(g,m.i|0);
  else if(m.t==='bye'){netDrop(g,run?(g.nm||'Un jugador')+' ha abandonado la partida':null)}}
function netGuestData(m){
  if(m.t==='start'){netGuestStart(m);if(!m.re)toast('¡Empieza la partida!','chest');else toast('¡Reconectado!','chest');if(window.onNetStart)onNetStart(m)}
  else if(m.t==='s'){if(!run)return;NET.rc=0;NET.seen=performance.now();netApply(m)}
  else if(m.t==='cards'){NET.cq.push(m)}
  else if(m.t==='msg')toast(m.m,'chest')
  else if(m.t==='end'){if(window.onNetEnd)onNetEnd(m);netGuestEnd(m)}
  else if(m.t==='lobby'){netGuestWait(m)}
  else if(m.t==='full'||m.t==='deny'||m.t==='busy'){NET.leaving=1;netErr(m.t==='full'?'La sala está llena.':m.t==='busy'?'La partida de esta sala ya ha empezado.':'Esta sala es solo para los miembros del grupo.')}}
function netWire(c){
  if(NET.host){c.on('data',m=>{if(m&&typeof m==='object')netHostData(c,m)});
    c.on('close',()=>{const g=NET.gs.find(x=>x.c===c);if(!g)return;g.c=null;
      netLost(g)});c.on('error',()=>{});return}
  NET.conn=c;c.on('data',m=>{if(c===NET.conn&&m&&typeof m==='object')netGuestData(m)});
  c.on('close',()=>{if(c!==NET.conn)return;NET.conn=null;
    if(run&&NET.on&&!NET.leaving){netReconnect(Date.now());return}
    const left=NET.leaving;netClose();if(left)return;
    scr(`<div class="box"><h1>Conexión perdida</h1><p>Se ha cortado la conexión con la sala.</p><button class="opt" id="nbk">${IC('back')}<div><b>Volver al menú</b></div></button></div>`);$('nbk').onclick=menu});
  c.on('error',()=>{})}
function netLost(g){if(run&&g.q){if(g.q.off)return;g.q.off=1;g.off=NET_WAIT;g.inp={x:0,y:0,u:0};toast((g.q.nm||'Tu amigo')+' se ha desconectado: le esperamos 60 s','boss')}else netDrop(g)}
/* si un invitado deja de mandar controles 5 s, se da por cortado (el canal a veces no avisa) */
function netWatch(){const now=performance.now();for(const g of NET.gs.slice())if(g.c&&now-(g.seen||now)>5000){const c=g.c;g.c=null;try{c.close()}catch(e){}netLost(g)}}
/* el invitado intenta volver a la misma partida durante 60 s */
function netReconnect(t0){NET.rc=1;if(!run)return;
  if(Date.now()-t0>NET_WAIT*1000){const m={w:0,k:S?S.kills:0,tm:S?Math.floor(S.t):0,c:0,lost:1};NET.rc=0;if(window.onNetEnd)onNetEnd(m);netGuestEnd(m);
    const h=ov.querySelector('h1');if(h)h.textContent='Se ha perdido la conexión con el anfitrión';netClose();return}
  const go=()=>{const c=NET.peer.connect(NET_PFX+NET.code,{reliable:true});let done=0;
    c.on('open',()=>{done=1;netWire(c);netSend({t:'hello',h:(HID(SAVE.last)||HEROES[0]).id,gid:NET.gid,nm:NET.nm})});
    NET.rcT=setTimeout(()=>{if(!done){try{c.close()}catch(e){}netReconnect(t0)}},4000)};
  try{if(!NET.peer||NET.peer.destroyed){NET.peer=new Peer(netCfg());NET.peer.on('open',go);NET.peer.on('error',()=>{})}else if(NET.peer.disconnected){NET.peer.reconnect();NET.rcT=setTimeout(()=>netReconnect(t0),2500)}else go()}
  catch(e){NET.rcT=setTimeout(()=>netReconnect(t0),2500)}}
function netLoad(cb){if(window.Peer)return cb();scr(`<div class="box"><h1>Jugar con amigos</h1><p>No se ha podido cargar el modo online.</p><button class="opt" id="nbk">${IC('back')}<div><b>Volver</b></div></button></div>`);$('nbk').onclick=menu}
function netErr(t){scr(`<div class="box"><h1>Jugar con amigos</h1><div class="note warn">${t}</div><button class="opt" id="nbk">${IC('back')}<div><b>Volver</b></div></button></div>`);$('nbk').onclick=()=>{NET.leaving=1;netClose();menu()}}
function netMenu(){scr(`<div class="box"><h1>Jugar con amigos</h1><p>Uno crea la sala y le pasa el código a los demás (hasta 4 jugadores). Hace falta internet. El que crea la sala elige el mapa y la dificultad.</p>
  <button class="opt big" id="nmk">${IC('play')}<div><b>Crear sala</b><span>Jugarás con ${(HID(SAVE.last)||HEROES[0]).n}</span></div></button>
  <button class="opt" id="njn">${IC('user')}<div><b>Unirme con un código</b><span>Jugarás con ${(HID(SAVE.last)||HEROES[0]).n}</span></div></button>
  <button class="opt" id="nbk">${IC('back')}<div><b>Volver</b></div></button></div>`);
  $('nmk').onclick=()=>netLoad(()=>netHost({}));$('njn').onclick=()=>netLoad(netJoinScreen);$('nbk').onclick=menu}
/* o: {max, allow:[nombres], code, onOpen(code), lobby:false (pantalla propia)} */
function netHost(o){netClose();NET.leaving=0;NET.code=o.code||netCode();NET.max=o.max||4;NET.allow=o.allow||null;NET.opts=o;NET.mid=null;NET.nm=netName();if(o.lobby!==false)scr(`<div class="box"><h1>Creando sala…</h1></div>`);
  const p=new Peer(NET_PFX+NET.code,netCfg());NET.peer=p;
  p.on('open',()=>{NET.host=1;if(o.onOpen)o.onOpen(NET.code);netLobby()});
  p.on('connection',c=>{c.on('open',()=>netWire(c))});
  p.on('disconnected',()=>{try{if(!p.destroyed)p.reconnect()}catch(e){}});
  p.on('error',e=>{if(e&&e.type==='unavailable-id'&&!o.code){netHost(o);return}if(e&&e.type==='peer-unavailable')return;
    if(!NET.host)(o.onErr||netErr)('No se ha podido crear la sala. Comprueba tu conexión a internet.')})}
function netLobby(){if(!NET.host||run)return;if(NET.opts&&NET.opts.lobby===false){if(NET.opts.onLobby)NET.opts.onLobby();return}const n=NET.gs.length;
  scr(`<div class="box"><h1>Sala ${NET.code}</h1><p>${n?`¡Dentro: ${NET.gs.map(g=>esc(g.nm||g.h.n)).join(', ')}!`:'Pásales este código a tus amigos para que entren (hasta 3 más):'}</p>
  <div style="font:400 54px 'Abril Fatface',Georgia,serif;letter-spacing:10px;margin:6px 0 14px">${NET.code}</div>
  <button class="opt big" id="ngo" ${n?'':'disabled'}>${IC('play')}<div><b>${n?'Empezar partida ('+(n+1)+' jugadores)':'Esperando a tus amigos…'}</b><span>con ${(HID(SAVE.last)||HEROES[0]).n} en ${MAPS[SAVE.map].n}</span></div></button>
  <button class="opt" id="nbk">${IC('back')}<div><b>Cerrar la sala</b></div></button></div>`);
  $('ngo').onclick=()=>{if(NET.gs.length)netGo()};$('nbk').onclick=()=>{NET.leaving=1;netClose();menu()};
  netAll({t:'lobby',code:NET.code,n:n+1})}
function netGo(mid){NET.mid=mid||null;start(HID(SAVE.last)&&isUn(HID(SAVE.last))?HID(SAVE.last):HEROES[0])}
function netJoinScreen(){scr(`<div class="box"><h1>Unirme a una sala</h1><p>Escribe el código de 4 letras que te ha pasado tu amigo.</p>
  <input id="ncd" maxlength="4" autocomplete="off" autocapitalize="characters" style="font:400 40px 'Abril Fatface',Georgia,serif;letter-spacing:10px;text-align:center;width:220px;padding:8px;border:3px solid #141210;background:#f3ecd8;text-transform:uppercase">
  <button class="opt big" id="ngo">${IC('play')}<div><b>Entrar</b></div></button><button class="opt" id="nbk">${IC('back')}<div><b>Volver</b></div></button></div>`);
  const inp=$('ncd');setTimeout(()=>{try{inp.focus()}catch(e){}},50);inp.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')$('ngo').click()};
  $('ngo').onclick=()=>{const c=(inp.value||'').toUpperCase().replace(/[^A-Z]/g,'');if(c.length!==4)return;netJoin(c)};$('nbk').onclick=netMenu}
/* o: {quiet:true (sin pantallas propias), onFail(texto)} */
function netJoin(code,o){o=o||{};netClose();NET.leaving=0;NET.code=code;NET.nm=netName();NET.jo=o;if(!o.quiet)scr(`<div class="box"><h1>Entrando en la sala ${code}…</h1></div>`);
  const p=new Peer(netCfg());NET.peer=p;let ok=0;const fail=t=>{if(ok)return;ok=-1;(o.onFail||netErr)(t)};
  p.on('open',()=>{const c=p.connect(NET_PFX+code,{reliable:true});c.on('open',()=>{if(ok)return;ok=1;netWire(c);netSend({t:'hello',h:(HID(SAVE.last)||HEROES[0]).id,gid:NET.gid,nm:NET.nm});if(!o.quiet)netGuestWait()});
    setTimeout(()=>fail('No se ha encontrado la sala '+code+'. Revisa el código.'),9000)});
  p.on('error',e=>{if(!run)fail(e&&e.type==='peer-unavailable'?'No existe ninguna sala con el código '+code+'.':'No se ha podido conectar. Comprueba tu conexión a internet.')})}
function netGuestWait(m){if(run||(NET.jo&&NET.jo.quiet))return;scr(`<div class="box"><h1>Sala ${NET.code}</h1><p>¡Estás dentro${m&&m.n?' ('+m.n+' jugadores)':''}! Esperando a que el anfitrión empiece la partida…</p><button class="opt" id="nlv">${IC('back')}<div><b>Salir de la sala</b></div></button></div>`);
  $('nlv').onclick=()=>{NET.leaving=1;netSend({t:'bye'});setTimeout(()=>{netClose();menu()},150)}}
const _st8=start;start=function(h){NET.end=0;const r=_st8(h);
  const gs=NET.gs.filter(g=>g.c&&g.c.open);
  if(NET.host&&gs.length){NET.gs=gs;NET.on=1;P.nm=NET.nm;NET.pl=[P];gs.forEach((g,i)=>{g.q=mkPlayer(g.h,i+1);g.q.nm=g.nm||g.h.n;g.offers=[];g.off=0;g.inp={x:0,y:0,u:0};NET.pl.push(g.q)});
    NET.prev.clear();NET.full=1;gs.forEach((g,i)=>netTo(g,{t:'start',you:i+1,mid:NET.mid}));toast('Partida online: ¡a por ellos!','chest')}
  else{NET.on=0;NET.pl=[];for(const g of NET.gs)g.q=null}
  return r};
const _mn8=menu;menu=function(){if(NET.host&&NET.on&&S&&!S.ended)netEnd(0);const r=_mn8.apply(this,arguments);
  if(NET.host&&NET.peer){NET.on=0;for(const g of NET.gs)g.q=null;NET.pl=[];if(!(NET.opts&&NET.opts.lobby===false)){netLobby();return r}}
  if(NET.conn&&!NET.host&&!(NET.jo&&NET.jo.quiet)){NET.leaving=1;netSend({t:'bye'});netClose()}
  const b=$('mplay');if(b&&!$('mnet')){const x=document.createElement('button');x.className='opt';x.id='mnet';x.innerHTML=IC('user')+'<div><b>Jugar con amigos</b><span>Online, con un código de sala (hasta 4)</span></div>';b.after(x);x.onclick=netMenu}
  return r};
function netLeaveGame(){NET.leaving=1;if(window.onNetLeave)onNetLeave();netSend({t:'bye'});setTimeout(()=>netClose(),150);run=false;menu()}
const _tp8=togglePause;togglePause=function(f){if(NET.on&&!NET.host){if(!f&&!pm){pm=true;scr(`<div class="box"><h1>Menú</h1><p>La partida sigue en marcha para los demás.</p><button class="opt big" id="nrs">${IC('play')}<div><b>Seguir jugando</b></div></button><button class="opt" id="nlv">${IC('back')}<div><b>Abandonar la partida</b></div></button></div>`);$('nrs').onclick=()=>{pm=false;ov.style.display='none'};$('nlv').onclick=()=>{pm=false;netLeaveGame()}}else if(pm&&!f){pm=false;ov.style.display='none'}return}return _tp8(f)};
