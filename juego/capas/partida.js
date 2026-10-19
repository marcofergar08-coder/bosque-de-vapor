
/* ===== Fase 11: partidas del grupo y resultados para el servidor =====
 Con sesión iniciada, cada partida (sola o en grupo) la abre el servidor y, al terminar,
 cada jugador manda lo que ha visto. Los puntos los calcula el servidor. Si no hay
 internet la partida se juega igual, solo que no cuenta para la clasificación. */
const RK={mid:null,sent:0,info:'',pend:[],joining:0,timer:0};
try{RK.pend=JSON.parse(localStorage.getItem('bdv_pend')||'[]')}catch(e){}
const ptSavePend=()=>{try{localStorage.setItem('bdv_pend',JSON.stringify(RK.pend.slice(-10)))}catch(e){}};
const ptRankable=()=>!!(SESS&&S&&S.dif!=='a'&&!S.z7);
/* el aviso del resultado se mantiene en la pantalla final aunque esta se vuelva a dibujar */
{const _scr=scr;scr=function(h){const r=_scr(h);if(RK.showOn&&RK.msg&&!$('ptres'))ptBox(RK.msg);return r}}
/* ---- partidas en solitario ---- */
{const _st=start;start=function(h){RK.showOn=0;RK.msg='';const r=_st(h);RK.sent=0;RK.mid=null;RK.info='';
  if(NET.on&&NET.host){RK.mid=NET.mid}
  else if(!NET.on&&ptRankable()){const s0=S;RK.info='';
    rpc('start_match',{p_difficulty:S.dif,p_map:S.map}).then(m=>{if(S!==s0)return;RK.mid=m.match;if(S.ended&&!RK.sent)ptSubmit(S.res_w,Math.floor(S.t),S.kills,P?P.lvl:1)})
      .catch(e=>{if(S===s0)RK.info='Esta partida no cuenta para la clasificación: '+acErr(e)})}
  return r}}
{const _er=endRun;endRun=function(w){const first=S&&!S.ended;const lvl=P?P.lvl:1;const r=_er(w);if(first&&S){S.res_w=!!w;if(!(NET.on&&!NET.host))ptSubmit(!!w,Math.floor(S.t),S.kills,lvl)}return r}}
window.onNetStart=m=>{RK.sent=0;RK.mid=m.mid||null;RK.info='';soStop()};
window.onNetEnd=m=>{if(RK.mid&&!RK.sent)ptSubmit(!!m.w,m.tm|0,m.k|0,P?P.lvl:1,!!m.lost)};
window.onNetLeave=()=>{if(RK.mid&&!RK.sent&&S){RK.sent=1;const a={p_match:RK.mid,p_survived:Math.floor(S.t),p_kills:S.kills|0,p_level:Math.max(1,Math.min(120,P?P.lvl:1))};
  rpc('abandon_match',a).catch(()=>{RK.pend.push({fn:'abandon_match',a});ptSavePend()})}};
/* salir al menú a mitad de partida cuenta como abandono */
{const _mn=menu;menu=function(){RK.showOn=0;RK.msg='';if(RK.mid&&!RK.sent&&S&&!S.ended&&(!NET.on||NET.host)){RK.sent=1;const a={p_match:RK.mid,p_survived:Math.floor(S.t),p_kills:S.kills|0,p_level:Math.max(1,Math.min(120,P?P.lvl:1))};
  rpc('abandon_match',a).catch(()=>{RK.pend.push({fn:'abandon_match',a});ptSavePend()})}return _mn.apply(this,arguments)}}
function ptBox(t){RK.msg=t;if(!RK.showOn)return;let el=$('ptres');if(!el){const bx=ov.querySelector('.box');if(!bx)return;el=document.createElement('div');el.id='ptres';const b=bx.querySelector('.opt');if(b)b.parentNode.insertBefore(el,b);else bx.appendChild(el)}el.innerHTML=t?`<div class="note">${t}</div>`:''}
async function ptSubmit(won,t,k,lvl,lost){RK.showOn=1;RK.msg='';if(RK.sent)return;if(!RK.mid){if(RK.info)ptBox(esc(RK.info));return}RK.sent=1;const mid=RK.mid;
  const a={p_match:mid,p_survived:Math.max(0,t|0),p_kills:Math.max(0,k|0),p_won:!!won,p_level:Math.max(1,Math.min(120,lvl|0||1))};
  ptBox('Enviando el resultado al servidor…');
  try{const r=await rpc('submit_result',a);ptShow(mid,r,0)}
  catch(e){if(/Failed to fetch|NetworkError|network/i.test(String(e&&e.message))){RK.pend.push({fn:'submit_result',a});ptSavePend();ptBox('Sin conexión: el resultado se enviará cuando vuelva internet.')}else ptBox(acErr(e))}}
function ptShow(mid,r,n){if(!r)return;
  if(r.status==='finished')ptBox(`Partida clasificada: <b>+${r.score} puntos</b>${r.flagged?' (los resultados de los jugadores no coincidían: se ha usado el más bajo)':''}`);
  else if(r.status==='active'){ptBox('Resultado enviado. Esperando a los demás jugadores para calcular los puntos…');if(n<40)setTimeout(async()=>{try{if($('ptres'))ptShow(mid,await rpc('get_match_result',{p_match:mid}),n+1)}catch(e){}},3000)}
  else if(r.status==='abandoned')ptBox('La partida no cuenta: no han llegado suficientes resultados.')}
async function ptRetry(){if(!SESS||!RK.pend.length)return;const l=RK.pend;RK.pend=[];ptSavePend();
  for(const x of l){try{await rpc(x.fn,x.a)}catch(e){if(/Failed to fetch|NetworkError/i.test(String(e&&e.message)))RK.pend.push(x)}}ptSavePend()}
addEventListener('online',ptRetry);setInterval(ptRetry,60000);setTimeout(ptRetry,3000);

/* ---- partidas del grupo ---- */
// El líder crea la sala directa, espera a que se conecten todos y pide la partida al servidor.
window.ptStart=async function(p){if(!window.Peer)throw new Error('No se ha podido cargar el modo online.');
  const others=p.members.filter(m=>!m.leader).map(m=>String(m.username).toLowerCase());
  const reuse=NET.host&&NET.peer&&!NET.peer.destroyed&&NET.opts&&NET.opts.party===p.id;
  const draw=()=>{if(RK.go)return;const n=NET.gs.filter(g=>g.c&&g.c.open).length;
    scr(`<div class="box"><h1>Preparando la partida</h1><p>${MODES[p.mode]} · ${n+1} de ${p.size} conectados</p><div class="solist">${p.members.map(m=>`<div><span><b>${esc(m.username)}</b></span><small>${m.leader||NET.gs.some(g=>g.c&&g.c.open&&(g.nm||'').toLowerCase()===String(m.username).toLowerCase())?'Conectado':'Conectando…'}</small></div>`).join('')}</div>
    <div id="acm"></div><button class="opt" id="ptc">${IC('back')}<div><b>Cancelar</b></div></button></div>`);$('ptc').onclick=()=>{RK.go=0;clearTimeout(RK.timer);rpc('set_party_room',{p_room:null}).catch(()=>{});NET.leaving=1;netClose();soScreen('pt')};
    if(n===p.size-1)go()};
  const go=async()=>{if(RK.go)return;RK.go=1;clearTimeout(RK.timer);
    try{const hs={};hs[ME.username]=(HID(SAVE.last)||HEROES[0]).id;for(const g of NET.gs)if(g.nm)hs[g.nm]=g.h.id;
      const m=await rpc('start_match',{p_difficulty:curDif(),p_map:SAVE.map,p_heroes:hs,p_party:true});RK.go=0;netGo(m.match)}
    catch(e){RK.go=0;draw();acMsg(acErr(e),true)}};
  RK.go=0;
  if(reuse){NET.allow=others;NET.max=p.size;NET.opts.onLobby=draw;draw();
    await rpc('set_party_room',{p_room:NET_PFX+NET.code}).catch(()=>{});}
  else{await new Promise((res,rej)=>{netHost({max:p.size,allow:others,lobby:false,party:p.id,onLobby:draw,onErr:t=>rej(new Error(t)),
    onOpen:async code=>{try{await rpc('set_party_room',{p_room:NET_PFX+code});res()}catch(e){rej(e)}}})});draw()}
  RK.timer=setTimeout(()=>{if(!run&&$('ptc'))acMsg('No se han conectado todos todavía. Pídeles que abran el juego en la pantalla del grupo.',true)},25000)};
// Los demás se conectan solos a la sala del líder cuando aparece en el grupo.
window.ptWatch=function(p){if(!p||p.me_leader||!p.room||run||!window.Peer)return;const code=p.room.slice(NET_PFX.length);
  if(NET.code===code&&NET.conn&&NET.conn.open){const el=$('sog');if(el&&!$('ptw')){const d=document.createElement('div');d.id='ptw';d.className='note';d.textContent='Conectado con el líder. La partida empezará enseguida.';el.prepend(d)}return}
  if(RK.joining)return;RK.joining=1;setTimeout(()=>RK.joining=0,10000);
  netJoin(code,{quiet:true,onFail:()=>{RK.joining=0}})};
// Al acabar, los invitados del grupo vuelven a la pantalla del grupo.
{const _ge=netGuestEnd;netGuestEnd=function(m){const r=_ge(m);if(NET.jo&&NET.jo.quiet){const b=$('nlv');if(b){b.innerHTML=`${IC('back')}<div><b>Volver al grupo</b></div>`;b.onclick=()=>soScreen('pt')}}return r}}
// Desde el menú también se entra a la partida del grupo si el líder la ha empezado.
setInterval(async()=>{if(!SESS||run||AC.view!=='menu'||!window.Peer)return;try{const p=await rpc('get_party');if(p&&p.room&&!p.me_leader){SO.party=p;ptWatch(p)}}catch(e){}},5000);
