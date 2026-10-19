
/* ===== Fase 10: amigos, perfiles de otros jugadores, grupos e invitaciones =====
 Los cambios llegan al momento por tiempo real de Supabase cuando está disponible y,
 en cualquier caso, se comprueban cada pocos segundos mientras la pantalla está abierta. */
const MODES={solo:'Solitario',duo:'Dúos',trio:'Tríos',squad:'Escuadrones'},MSIZE={solo:1,duo:2,trio:3,squad:4},VARS={normal:'Normal',inf:'Infinito'};
// Tipo de partida elegido para crear grupo o buscar jugadores (normal o Infinito).
let SOV='normal';try{SOV=localStorage.getItem('bdv_var')==='inf'?'inf':'normal'}catch(e){}
const soVar=v=>{SOV=v==='inf'?'inf':'normal';try{localStorage.setItem('bdv_var',SOV)}catch(e){}};
const soVarBtns=(cur,lead)=>`<div class="rbtn">${Object.keys(VARS).map(v=>`<button class="opt" id="sov_${v}" ${lead?'':'disabled'} ${cur===v?'aria-pressed="true" style="background:#141210;color:#f3ecd8"':''}><b>${VARS[v]}</b><span>${v==='inf'?'Oleadas sin fin':'Con jefe final'}</span></button>`).join('')}</div>`;
const SO={tab:'fr',poll:0,inv:[],invT:0,ch:null,party:null,seen:{}};
const dot=st=>`<span title="${st==='online'?'Conectado':st==='playing'?'Jugando':'Desconectado'}" style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid #141210;margin-right:6px;background:${st==='online'?'#2a7a2a':st==='playing'?'#ffd23d':'transparent'}"></span>`;
{const st=document.createElement('style');st.textContent=`.sotabs{display:flex;gap:6px;margin:6px 0 10px}.sotabs .opt{margin:0;padding:8px 6px;justify-content:center;flex:1}.sotabs .opt[aria-pressed=true]{background:#141210;color:#f3ecd8}
.solist>div{display:flex;align-items:center;gap:8px;border-bottom:1px dashed #141210;padding:6px 0;text-align:left}.solist>div>span{flex:1;min-width:0;overflow-wrap:anywhere}.solist img{width:34px;height:34px;object-fit:contain;border:2px solid #141210;background:#f3ecd8}
.sob{border:2px solid #141210;background:#f3ecd8;color:#141210;font:700 14px inherit;padding:6px 9px;border-radius:8px 3px 8px 3px;cursor:pointer;box-shadow:2px 2px 0 #141210;white-space:nowrap}.sob.w{background:#ffd23d}.sob:disabled{opacity:.5}
.socode{font:400 34px 'Special Elite',monospace;letter-spacing:6px;border:3px dashed #141210;padding:4px 10px;display:inline-block;margin:4px 0;background:#f3ecd8}
.soinv{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:60;max-width:min(92vw,420px)}
.soinv .box{padding:10px 12px;animation:none}.soinv p{margin:4px 0}`;document.head.appendChild(st)}
const soStop=()=>{clearInterval(SO.poll);SO.poll=0};
{const _scr=scr;scr=function(h){soStop();return _scr(h)}}
function soNeed(next){if(!sbOn())return acNoServer();if(!SESS)return acLogin('in');if(!ME){acLoading();return acAfterLogin()}return next()}
function soTabs(t){return `<div class="sotabs">${[['fr','Amigos'],['pt','Grupo'],['se','Buscar']].map(x=>`<button class="opt" data-tab="${x[0]}" aria-pressed="${t===x[0]}"><b>${x[1]}</b></button>`).join('')}</div>`}
function soWire(){ov.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>soScreen(b.dataset.tab));const k=$('bk');if(k)k.onclick=menu}
function soScreen(t){return soNeed(()=>{SO.tab=t||SO.tab;({fr:soFriends,pt:soParty,se:soSearch})[SO.tab]()})}
function soRow(p,btns){return `<div><img src="${IMG[(HID(p.avatar)||HEROES[0]).id].src}" alt=""><span>${p.status!==undefined?dot(p.status):''}<b>${esc(p.username)}</b> <small>· nv. ${p.level}</small>${p.note?`<br><small>${p.note}</small>`:''}</span>${btns}</div>`}
const soB=(id,txt,w)=>`<button class="sob${w?' w':''}" data-act="${id}">${txt}</button>`;
function soActs(map){ov.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{const [a,u]=b.dataset.act.split('|');const f=map[a];if(f)acBusy(null,async()=>{b.disabled=true;await f(u)})})}

// ---- Amigos ----
async function soFriends(){scr(`<div class="box wide"><h1>Amigos</h1>${soTabs('fr')}<div id="acm"></div><div id="sol" class="solist"><p>Cargando…</p></div>
  <button class="opt" id="sobl">${IC('lock')}<div><b>Jugadores bloqueados</b></div></button>${BK}</div>`);soWire();$('sobl').onclick=soBlocked;
  const draw=async()=>{const l=await rpc('list_friends'),el=$('sol');if(!el)return;
    const rec=l.filter(f=>f.state==='recibida'),fr=l.filter(f=>f.state==='amigo'),sent=l.filter(f=>f.state==='enviada');
    fr.sort((a,b)=>(a.status==='offline')-(b.status==='offline')||a.username.localeCompare(b.username));
    el.innerHTML=(rec.length?'<h3>Solicitudes recibidas</h3>'+rec.map(f=>soRow(f,soB('ok|'+f.username,'Aceptar',1)+soB('no|'+f.username,'Rechazar'))).join(''):'')+
      '<h3>Mis amigos ('+fr.length+')</h3>'+(fr.length?fr.map(f=>soRow(f,soB('inv|'+f.username,'Invitar',1)+soB('ver|'+f.username,'Perfil'))).join(''):'<p>Aún no tienes amigos en el juego. Búscalos por su nombre en «Buscar».</p>')+
      (sent.length?'<h3>Enviadas</h3>'+sent.map(f=>soRow(f,soB('cancel|'+f.username,'Cancelar'))).join(''):'');
    soActs({ok:async u=>{await rpc('respond_friend_request',{p_username:u,p_accept:true});draw()},no:async u=>{await rpc('respond_friend_request',{p_username:u,p_accept:false});draw()},
      cancel:async u=>{await rpc('remove_friend',{p_username:u});draw()},ver:u=>soProfile(u,'fr'),inv:async u=>{await soInvite(u);acMsg('Invitación enviada a '+esc(u)+'.')}})};
  try{await draw()}catch(e){acMsg(acErr(e),true)}SO.poll=setInterval(()=>draw().catch(()=>{}),8000)}
async function soInvite(u){if(!SO.party||!(await rpc('get_party'))){const p=await rpc('create_party',{p_mode:'duo'});SO.party=p}await rpc('invite_to_party',{p_username:u})}
async function soBlocked(){scr(`<div class="box"><h1>Bloqueados</h1><p>No pueden verte, invitarte ni enviarte solicitudes.</p><div id="acm"></div><div id="sol" class="solist"><p>Cargando…</p></div><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);
  $('bk').onclick=()=>soScreen('fr');try{const l=await rpc('list_blocked');$('sol').innerHTML=l.length?l.map(u=>`<div><span><b>${esc(u)}</b></span>${soB('un|'+u,'Desbloquear')}</div>`).join(''):'<p>No has bloqueado a nadie.</p>';
  soActs({un:async u=>{await rpc('unblock_user',{p_username:u});soBlocked()}})}catch(e){acMsg(acErr(e),true)}}

// ---- Buscar ----
function soSearch(){scr(`<div class="box wide"><h1>Buscar jugadores</h1>${soTabs('se')}<label class="acl" for="soq">Nombre de usuario</label><input class="acf" id="soq" maxlength="16" autocomplete="off" data-go="sogo">
  <button class="opt" id="sogo">${IC('user')}<div><b>Buscar</b></div></button><div id="acm"></div><div id="sol" class="solist"></div>${BK}</div>`);soWire();acKeys();
  $('sogo').onclick=()=>acBusy('sogo',async()=>{const q=$('soq').value.trim();if(q.length<2)return acMsg('Escribe al menos 2 letras.',true);
    const r=await rpc('search_players',{p_query:q});$('sol').innerHTML=r.length?r.map(p=>soRow(p,(p.friend?'<small>Amigo</small>':soB('add|'+p.username,'Añadir',1))+soB('ver|'+p.username,'Perfil'))).join(''):'<p>No hay nadie con ese nombre (los perfiles privados no aparecen).</p>';
    soActs({add:async u=>{const r=await rpc('send_friend_request',{p_username:u});acMsg({enviada:'Solicitud enviada a '+esc(u)+'.',aceptada:'¡Ahora sois amigos!',ya_enviada:'Ya le habías enviado una solicitud.',ya_amigos:'Ya sois amigos.'}[r]||'Hecho.')},ver:u=>soProfile(u,'se')})})}

// ---- Perfil de otro jugador ----
async function soProfile(name,back){scr(`<div class="box wide"><h1>Perfil</h1><div id="acm"></div><div id="sop"><p>Cargando…</p></div><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);
  $('bk').onclick=()=>typeof back==='function'?back():soScreen(back);
  try{const p=await rpc('get_profile',{p_username:name});const el=$('sop');if(!el)return;
    if(!p){el.innerHTML='<p>Este jugador no existe o no puedes ver su perfil.</p>';return}
    const st=p.stats||{},h=p.visible&&!p.me?await rpc('get_history',{p_username:name,p_limit:10}):[];
    el.innerHTML=`<div class="acav"><button tabindex="-1">${heroImg(p.avatar)}</button></div><h2 style="margin:4px 0">${p.status?dot(p.status):''}${esc(p.username)}</h2>
    <p>Nivel ${p.level}${p.country?' · '+esc(p.country):''}${p.friend?' · Amigo':''}</p>
    ${p.visible?`<div class="rows">${Object.keys(MODES).map(m=>st[m]?`<div><span>${MODES[m]}</span><b>${st[m].points} pts · ${st[m].division} · ${st[m].wins}/${st[m].games} victorias</b></div>`:'').join('')||'<div><span>Esta temporada</span><b>Sin partidas</b></div>'}
      ${p.totals?`<div><span>Total</span><b>${p.totals.games} partidas · ${p.totals.wins} victorias</b></div>`:''}</div>${typeof infProfileHtml==='function'?infProfileHtml(p.inf):''}
      ${h.length?'<h3>Últimas partidas</h3><div class="rows">'+h.map(x=>`<div><span>${MODES[x.mode]||x.mode} · ${new Date(x.date).toLocaleDateString('es-ES')}</span><b>${x.survived!=null?fmt(x.survived)+' · '+x.kills+' ☠ · '+(x.variant==='inf'?'Infinito: oleada '+(x.waves|0):x.won?'Victoria':'Derrota')+' · '+x.score+' pts':'Sin terminar'}</b></div>`).join('')+'</div>':''}`
      :'<div class="note">Este perfil es privado.</div>'}
    ${p.me?'':`<div class="acrow" style="flex-wrap:wrap;justify-content:center;margin-top:10px">${p.friend?soB('del|'+name,'Quitar amigo'):soB('add|'+name,'Añadir amigo',1)}${soB('blk|'+name,'Bloquear')}${soB('rep|'+name,'Denunciar')}</div>`}`;
    soActs({add:async u=>{await rpc('send_friend_request',{p_username:u});acMsg('Solicitud enviada.')},del:async u=>{await rpc('remove_friend',{p_username:u});soProfile(u,back)},
      blk:async u=>{if(!confirm('¿Bloquear a '+u+'? Dejaréis de ser amigos y no podrá invitarte.'))return;await rpc('block_user',{p_username:u});acMsg(esc(u)+' bloqueado.')},rep:u=>soReport(u,()=>soProfile(u,back))})}
  catch(e){acMsg(acErr(e),true)}}
function soReport(u,back){scr(`<div class="box"><h1>Denunciar a ${esc(u)}</h1><p>El equipo del juego revisará la denuncia.</p>
  ${[['trampas','Hace trampas'],['nombre','Nombre ofensivo'],['acoso','Acoso o insultos'],['otro','Otro motivo']].map((r,i)=>`<label class="acchk"><input type="radio" name="sor" value="${r[0]}" ${i?'':'checked'}> ${r[1]}</label>`).join('')}
  <label class="acl" for="sod">Detalles (opcional)</label><textarea class="acf" id="sod" maxlength="500" rows="3"></textarea><div id="acm"></div>
  <button class="opt big" id="acgo">${IC('check')}<div><b>Enviar denuncia</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);acKeys();$('bk').onclick=back;
  $('acgo').onclick=()=>acBusy('acgo',async()=>{await rpc('report_user',{p_username:u,p_reason:ov.querySelector('[name=sor]:checked').value,p_details:$('sod').value.trim()||null});acMsg('Denuncia enviada. Gracias.');$('acgo').remove()})}

// ---- Grupo ----
function soRealtime(pid){try{if(SO.ch){sb.removeChannel(SO.ch);SO.ch=null}if(!pid||!sb.channel)return;
  SO.ch=sb.channel('grupo-'+pid).on('postgres_changes',{event:'*',schema:'public',table:'party_members',filter:'party_id=eq.'+pid},()=>SO.refresh&&SO.refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'parties',filter:'id=eq.'+pid},()=>SO.refresh&&SO.refresh()).subscribe()}catch(e){}}
async function soParty(){scr(`<div class="box wide"><h1>Grupo</h1>${soTabs('pt')}<div id="acm"></div><div id="sog"><p>Cargando…</p></div>${BK}</div>`);soWire();
  const draw=async()=>{const p=await rpc('get_party'),el=$('sog');if(!el)return;SO.party=p;
    if(!p){soRealtime(null);const inv=await rpc('list_invites');
      el.innerHTML=(inv.length?'<h3>Te han invitado</h3><div class="solist">'+inv.map(i=>`<div><span><b>${esc(i.from)}</b> · ${MODES[i.mode]}</span>${soB('join|'+i.code,'Unirme',1)}</div>`).join('')+'</div>':'')+
      `<p>Tipo de partida</p>${soVarBtns(SOV,1)}<p>Crea un grupo y comparte el código, o invita a tus amigos.</p><div class="rbtn">${['duo','trio','squad'].map(m=>`<button class="opt" id="som_${m}"><b>${MODES[m]}</b><span>${MSIZE[m]} jugadores</span></button>`).join('')}</div>
      <h3>Jugar con otros jugadores</h3><p class="acsm">Te buscamos compañeros de tu misma dificultad (${DIFS[mmDif()].n}).</p>
      <div class="rbtn">${['duo','trio','squad'].map(m=>`<button class="opt" id="soq_${m}"><b>${MODES[m]}</b><span>Buscar</span></button>`).join('')}</div>
      <label class="acl" for="socd">¿Tienes un código de grupo?</label><div class="acrow"><input class="acf" id="socd" maxlength="6" autocomplete="off" style="text-transform:uppercase" data-go="sojn"><button class="sob w" id="sojn">Unirme</button></div>`;
      acKeys();for(const m of ['duo','trio','squad'])$('soq_'+m).onclick=()=>acBusy('soq_'+m,()=>mmJoin(m));
      for(const m of ['duo','trio','squad'])$('som_'+m).onclick=()=>acBusy('som_'+m,async()=>{await rpc('create_party',{p_mode:m});if(SOV==='inf')await rpc('set_party_variant',{p_variant:'inf'});draw()});
      for(const v of Object.keys(VARS))$('sov_'+v).onclick=()=>{soVar(v);draw()};
      $('sojn').onclick=()=>acBusy('sojn',async()=>{const c=$('socd').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(c))return acMsg('El código tiene 6 letras o números.',true);await rpc('join_party',{p_code:c});draw()});
      soActs({join:async c=>{await rpc('join_party',{p_code:c});draw()}});return}
    soRealtime(p.id);const me=p.members.find(m=>m.username===ME.username)||{},full=p.members.length===p.size,allReady=p.members.every(m=>m.ready||m.leader);
    el.innerHTML=`<p>Código del grupo</p><div class="socode">${esc(p.code)}</div><p>${MODES[p.mode]} · ${VARS[p.variant]||'Normal'} · ${p.members.length} de ${p.size} jugadores</p>
      ${p.me_leader?soVarBtns(p.variant,1):''}
      ${p.me_leader?`<div class="rbtn">${['duo','trio','squad'].map(m=>`<button class="opt" id="som_${m}" ${p.mode===m?'aria-pressed="true" style="background:#141210;color:#f3ecd8"':''}><b>${MODES[m]}</b></button>`).join('')}</div>`:''}
      <div class="solist">${p.members.map(m=>soRow({...m,note:m.leader?'Líder':m.ready?'Listo':'No está listo'},p.me_leader&&!m.leader?soB('kick|'+m.username,'Expulsar'):'')).join('')}
      ${Array.from({length:p.size-p.members.length},()=>'<div><span><i>Hueco libre</i></span></div>').join('')}</div>
      ${p.me_leader?'':`<button class="opt big" id="sordy">${IC(me.ready?'check':'play')}<div><b>${me.ready?'Estoy listo ✓':'Marcar que estoy listo'}</b></div></button>`}
      ${p.me_leader&&window.ptStart?`<button class="opt big" id="sogo" ${full&&allReady?'':'disabled'}>${IC('play')}<div><b>Empezar partida</b><span>${!full?'Faltan jugadores':!allReady?'Esperando a que todos estén listos':'¡Todo listo!'}</span></div></button>`:''}
      ${p.size>p.members.length?`<button class="opt" id="soinv">${IC('user')}<div><b>Invitar amigos</b></div></button>`:''}
      ${p.me_leader&&p.size>p.members.length&&p.members.length>1?`<button class="opt" id="soqp">${IC('star')}<div><b>Completar con otros jugadores</b><span>Buscar ${p.size-p.members.length} más</span></div></button>`:''}
      <button class="opt" id="solv">${IC('back')}<div><b>Salir del grupo</b></div></button>`;
    if(p.me_leader)for(const v of Object.keys(VARS))$('sov_'+v).onclick=()=>acBusy('sov_'+v,async()=>{soVar(v);await rpc('set_party_variant',{p_variant:v});draw()});
    if(p.me_leader)for(const m of ['duo','trio','squad'])$('som_'+m).onclick=()=>acBusy('som_'+m,async()=>{await rpc('set_party_mode',{p_mode:m});draw()});
    if($('sordy'))$('sordy').onclick=()=>acBusy('sordy',async()=>{await rpc('set_ready',{p_ready:!me.ready});draw()});
    if($('sogo'))$('sogo').onclick=()=>acBusy('sogo',()=>ptStart(p));
    if($('soinv'))$('soinv').onclick=soInvitePick;
    if($('soqp'))$('soqp').onclick=()=>acBusy('soqp',()=>mmJoin(p.mode,p.variant));
    $('solv').onclick=()=>acBusy('solv',async()=>{await rpc('leave_party');soRealtime(null);draw()});
    soActs({kick:async u=>{await rpc('kick_member',{p_username:u});draw()}});
    if(window.ptWatch)ptWatch(p)};
  SO.refresh=()=>draw().catch(()=>{});try{await draw()}catch(e){acMsg(acErr(e),true)}SO.poll=setInterval(SO.refresh,3000)}
async function soInvitePick(){scr(`<div class="box"><h1>Invitar amigos</h1><div id="acm"></div><div id="sol" class="solist"><p>Cargando…</p></div><button class="opt" id="bk">${IC('back')}<div><b>Volver al grupo</b></div></button></div>`);
  $('bk').onclick=()=>soScreen('pt');try{const l=(await rpc('list_friends')).filter(f=>f.state==='amigo');
    $('sol').innerHTML=l.length?l.map(f=>soRow(f,soB('inv|'+f.username,'Invitar',1))).join(''):'<p>Aún no tienes amigos. Búscalos en «Buscar».</p>';
    soActs({inv:async u=>{await rpc('invite_to_party',{p_username:u});acMsg('Invitación enviada a '+esc(u)+'.')}})}catch(e){acMsg(acErr(e),true)}}

// ---- Emparejamiento ----
const mmDif=()=>{const d=curDif();return ['s','n','x'].includes(d)?d:'s'};
async function mmJoin(mode,variant){if(!['s','n','x'].includes(curDif()))return acMsg('Para buscar jugadores elige la dificultad Supervivencia o una más difícil (menú › Dificultad). La Aventura no cuenta para la clasificación.',true);const r=await rpc('queue_join',{p_mode:mode,p_difficulty:mmDif(),p_variant:variant||SOV});mmScreen(r)}
function mmScreen(r){if(!r.queued)return mmFound(r);const t0=Date.parse(r.since)||Date.now();
  scr(`<div class="box"><h1>Buscando jugadores</h1><p>${MODES[r.mode]} · ${VARS[r.variant]||'Normal'} · ${DIFS[r.difficulty].n}</p><p style="font-size:28px" id="mmt">0:00</p><p id="mmw">${r.waiting} de ${r.size} en la cola</p>
  <p class="acsm">Si cierras el juego, sales de la cola.</p><div id="acm"></div><button class="opt" id="mmx">${IC('back')}<div><b>Cancelar</b></div></button></div>`);
  $('mmx').onclick=()=>acBusy('mmx',async()=>{soStop();await rpc('queue_leave');soScreen('pt')});
  SO.poll=setInterval(async()=>{const el=$('mmt');if(!el)return soStop();el.textContent=fmt(Math.max(0,(Date.now()-t0)/1000));
    try{const q=await rpc('queue_status');if(!$('mmt'))return;if(q.queued){$('mmw').textContent=q.waiting+' de '+q.size+' en la cola'}
      else{soStop();if(q.party)mmFound(q);else{acMsg('Has salido de la cola. Vuelve a intentarlo.',true)}}}catch(e){}},2000)}
function mmFound(r){const p=r.party;if(!p)return soScreen('pt');sfx('win');toast('¡Grupo encontrado!','chest');
  if(p.me_leader&&p.members.length===p.size&&window.ptStart){ptStart(p).catch(e=>{soScreen('pt');setTimeout(()=>acMsg(acErr(e),true),300)})}else soScreen('pt')}

// ---- Avisos de invitación en el menú ----
async function soCheckInv(){if(!SESS||run||AC.view!=='menu')return;try{const l=await rpc('list_invites');const n=l.find(i=>!SO.seen[i.id]);if(!n||AC.view!=='menu')return;SO.seen[n.id]=1;
  let d=$('soinvb');if(!d){d=document.createElement('div');d.id='soinvb';d.className='soinv';document.body.appendChild(d)}
  d.innerHTML=`<div class="box"><p><b>${esc(n.from)}</b> te invita a su grupo de ${MODES[n.mode]}.</p><div class="acrow"><button class="sob w" id="soia">Unirme</button><button class="sob" id="soix">Ahora no</button></div></div>`;
  $('soix').onclick=()=>d.remove();$('soia').onclick=async()=>{d.remove();try{await rpc('join_party',{p_code:n.code});soScreen('pt')}catch(e){soScreen('pt');setTimeout(()=>acMsg(acErr(e),true),300)}}}catch(e){}}
setInterval(soCheckInv,10000);
{const _mn=menu;menu=function(){const r=_mn.apply(this,arguments);const a=$('macc');if(a&&!run&&!$('mfr')&&sbOn()){const x=document.createElement('button');x.className='opt';x.id='mfr';
  x.innerHTML=IC('user')+'<div><b>Amigos y grupo</b><span>'+(ME?'Invita a tus amigos y jugad juntos':'Necesitas una cuenta')+'</span></div>';a.after(x);x.onclick=()=>soScreen('pt')}if(SESS)setTimeout(soCheckInv,600);return r}}
