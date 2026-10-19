
/* ===== Fase 9: cuentas, perfil y guardado en la nube (Supabase) =====
 Rellena SB.url y SB.key con los datos de tu proyecto (Supabase > Project Settings > API).
 La clave "anon"/"publishable" es pública: está pensada para ir dentro del juego.
 Todo lo competitivo (puntos, victorias, nivel) lo decide el servidor, nunca este código. */
const SB={url:'https://gtkuopfkubxxlkvidhlg.supabase.co',key:'sb_publishable_NcJqPX444kj-dJVIGi36Yg_njXTlfCa',redirect:'bosquedevapor://auth'};
{const q=new URLSearchParams(location.search);if(q.get('sburl')){SB.url=q.get('sburl');SB.key=q.get('sbkey')||''}}
let sb=null,ME=null,SESS=null;
const AC={view:'',base:null,hash:'',busy:false,timer:0,err:'',pushT:0,state:'',beat:0};
const sbOn=()=>!!(SB.url&&SB.key&&window.supabase);
const esc=s=>String(s??'').replace(/[&<>"'`]/g,c=>'&#'+c.charCodeAt(0)+';');
const ERRS={NO_SESION:'Tienes que iniciar sesión.',CUENTA_BLOQUEADA:'Esta cuenta está suspendida.',DEMASIADAS_PETICIONES:'Has hecho demasiadas peticiones seguidas. Espera un poco.',
  NOMBRE_OCUPADO:'Ese nombre ya lo usa otra persona.',NOMBRE_NO_VALIDO:'El nombre debe tener de 3 a 16 letras, números o _ y no puede imitar al equipo del juego.',
  AVATAR_NO_VALIDO:'Avatar no válido.',PAIS_NO_VALIDO:'El país debe ser un código de 2 letras (ES, MX, AR...).',PRIVACIDAD_NO_VALIDA:'Privacidad no válida.',
  DEMASIADOS_EN_EL_GRUPO:'Hay demasiados jugadores en el grupo para ese modo.',SOLO_EL_LIDER:'Solo el líder del grupo puede hacer eso.',GRUPO_LLENO:'El grupo está lleno.',
  GRUPO_NO_EXISTE:'No hay ningún grupo con ese código.',SOLO_AMIGOS:'Solo puedes invitar a tus amigos.',NO_PERMITIDO:'No puedes hacer eso con este jugador.',JUGADOR_NO_EXISTE:'Ese jugador no existe.',
  ERES_TU:'Ese eres tú.',SIN_GRUPO:'Primero crea un grupo.',FALTAN_JUGADORES:'Faltan jugadores en el grupo.',NO_TODOS_LISTOS:'No todos están listos.',YA_EN_PARTIDA:'Alguien del grupo ya está en otra partida.',
  MODO_NO_VALIDO:'Modo no válido.',PARTIDA_NO_VALIDA:'Esa partida no es tuya.',RESULTADO_NO_VALIDO:'El servidor ha rechazado el resultado de la partida por no ser posible.',YA_ENVIADO:'El resultado ya se había enviado.',
  PARTIDA_CERRADA:'La partida ya estaba cerrada.',SALA_NO_VALIDA:'Sala no válida.',DIFICULTAD_NO_VALIDA:'Dificultad no válida.',MAPA_NO_VALIDO:'Mapa no válido.',DATOS_INCOMPLETOS:'Faltan datos.',
  GUARDADO_DEMASIADO_GRANDE:'El guardado es demasiado grande.',GUARDADO_NO_VALIDO:'El guardado no es válido.',
  'Invalid login credentials':'Correo o contraseña incorrectos.','Email not confirmed':'Aún no has confirmado tu correo. Mira tu bandeja de entrada.',
  'User already registered':'Ya hay una cuenta con ese correo. Entra o recupera la contraseña.','provider is not enabled':'Este método de acceso todavía no está activado en el servidor del juego.',
  'Unsupported provider':'Este método de acceso todavía no está activado en el servidor del juego.','Password should be at least':'La contraseña debe tener al menos 8 caracteres.',
  'rate limit':'Demasiados intentos. Espera unos minutos.','Unable to validate email address':'Ese correo no es válido.','Failed to fetch':'No hay conexión con el servidor. Comprueba tu internet.',
  'New password should be different':'La nueva contraseña debe ser distinta de la anterior.','Identity is already linked':'Ese método ya está vinculado a otra cuenta.',
  'Manual linking is disabled':'Vincular cuentas no está activado en el servidor del juego.'};
function acErr(e){const m=String((e&&(e.message||e.error_description||e.msg))||e||'');for(const k in ERRS)if(m.includes(k))return ERRS[k];return 'Algo ha fallado: '+esc(m.slice(0,120))}
async function rpc(fn,args){if(!sb)throw new Error('Failed to fetch');const {data,error}=await sb.rpc(fn,args||{});if(error)throw error;if(data&&data.error)throw new Error(data.error);return data}
function acKeys(){ov.querySelectorAll('input,select,textarea').forEach(i=>{i.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'&&i.dataset.go&&$(i.dataset.go))$(i.dataset.go).click()};i.onkeyup=e=>e.stopPropagation()})}
function acMsg(t,warn){const el=$('acm');if(el)el.innerHTML=t?`<div class="note${warn?' warn':''}">${t}</div>`:''}
async function acBusy(btn,f){if(AC.busy)return;AC.busy=true;const b=btn&&$(btn);if(b)b.disabled=true;acMsg('');try{await f()}catch(e){acMsg(acErr(e),true)}finally{AC.busy=false;if(b)b.disabled=false}}
{const st=document.createElement('style');st.textContent=`.acf{display:block;width:100%;box-sizing:border-box;font:400 20px 'Special Elite',monospace;padding:9px 10px;margin:6px 0;border:3px solid #141210;background:#f3ecd8;color:#141210;border-radius:0}
.acl{display:block;text-align:left;font-size:14px;margin-top:8px}.acrow{display:flex;gap:8px}.acrow .opt{margin:6px 0}.acchk{display:flex;align-items:center;gap:8px;text-align:left;margin:8px 0;font-size:15px}.acchk input{width:22px;height:22px;accent-color:#141210}
.acav{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:6px 0}.acav button{border:3px solid #141210;background:#f3ecd8;padding:2px;width:52px;height:52px;cursor:pointer}.acav button[aria-pressed=true]{background:#ffd23d}.acav img{width:100%;height:100%;object-fit:contain}
.acbar{height:12px;border:2px solid #141210;background:#f3ecd8;margin:4px 0 10px}.acbar i{display:block;height:100%;background:#141210}.acsm{font-size:13px;opacity:.85}.opt:disabled{opacity:.55;cursor:wait}
.acprov .opt{justify-content:center}.acprov .opt b{font-size:16px}`;document.head.appendChild(st)}
{const _scr=scr;scr=function(h){AC.view='';return _scr(h)}}

// ---- Sesión ----
function sbInit(){if(!sbOn())return;
  sb=supabase.createClient(SB.url,SB.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'bdv_auth'}});
  sb.auth.onAuthStateChange((ev,s)=>{const was=SESS&&SESS.user&&SESS.user.id;SESS=s;
    if(ev==='PASSWORD_RECOVERY'){setTimeout(acNewPass,0);return}
    if(s&&s.user&&s.user.id!==was)setTimeout(acAfterLogin,0);
    if(!s){const v=AC.view;ME=null;AC.state='';if(v==='menu')menu();else if(v==='acc'||v==='loading'||v==='prof')acExpired()}});
  // App del móvil: Google/Apple/Discord vuelven a bosquedevapor://auth?code=...
  try{const A=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.App;if(A)A.addListener('appUrlOpen',async o=>{const u=new URL(o.url);const c=u.searchParams.get('code');
    if(c){try{await sb.auth.exchangeCodeForSession(c)}catch(e){}try{Capacitor.Plugins.Browser&&Capacitor.Plugins.Browser.close()}catch(e){}}})}catch(e){}
  setInterval(()=>{if(SESS&&document.visibilityState==='visible')rpc('set_status',{p_status:run?'playing':'online'}).catch(()=>{})},90000);
  addEventListener('online',()=>{if(SESS)acPush(true)})}
const isNative=()=>!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const backUrl=()=>isNative()?SB.redirect:location.origin+location.pathname+location.search;
async function acAfterLogin(){try{ME=await rpc('get_me');rpc('set_status',{p_status:'online'}).catch(()=>{});await acSync();if(AC.view==='menu')menu();else if(AC.view==='acc'||AC.view==='loading')acProfile()}catch(e){AC.err=acErr(e);if(AC.view==='loading')acMsg(AC.err,true)}}

// ---- Guardado en la nube ----
const hashOf=o=>{const s=JSON.stringify(o);let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return String(h)};
const metaKey=()=>'bdv_cloud_'+(SESS&&SESS.user.id);
function acMeta(){try{return JSON.parse(localStorage.getItem(metaKey())||'{}')}catch(e){return {}}}
function acSetMeta(base){AC.base=base;AC.hash=hashOf(SAVE);try{localStorage.setItem(metaKey(),JSON.stringify({base,hash:AC.hash}))}catch(e){}}
const isFresh=s=>!s.runs&&!s.coins&&!s.spent&&!s.earned;
function adopt(data){const s=sanitize(data);SAVE=s;save0()}
async function acSync(){if(!SESS)return;const m=acMeta();AC.base=m.base||null;AC.hash=m.hash||'';
  const cl=await rpc('load_progress');const dirty=hashOf(SAVE)!==AC.hash;
  if(!cl){await acPush(true);return}
  if(m.base&&cl.updated_at===m.base){if(dirty)await acPush(true);AC.state='ok';return}
  if(hashOf(sanitize(cl.data))===hashOf(SAVE)){acSetMeta(cl.updated_at);AC.state='ok';return}
  if(isFresh(SAVE)||(m.base&&!dirty)){adopt(cl.data);acSetMeta(cl.updated_at);AC.state='ok';return}
  AC.state='conflict';AC.cloud=cl;if(!run)acConflict()}
async function acPush(now){clearTimeout(AC.pushT);if(!SESS||AC.state==='conflict')return;
  if(!now){AC.pushT=setTimeout(()=>acPush(true),6000);return}
  if(hashOf(SAVE)===AC.hash&&AC.base){AC.state='ok';return}
  try{const r=await rpc('save_progress',{p_data:SAVE,p_base:AC.base,p_force:false});
    if(r.conflict){AC.state='conflict';AC.cloud={data:r.data,updated_at:r.updated_at};if(!run)acConflict();return}
    acSetMeta(r.updated_at);AC.state='ok'}catch(e){AC.state='offline'}}
const save0=save;save=function(){save0();if(SESS)acPush(false)};
function sumSave(s){const n=HEROES.filter(h=>s.unl&&s.unl[h.id]).length;return `${s.coins} monedas · ${s.runs} partidas · mejor ${fmt(s.best)} · ${n} personajes desbloqueados`}
function acConflict(){const c=sanitize(AC.cloud.data);AC.view='conf';
  scr(`<div class="box"><h1>¿Qué progreso conservas?</h1><p>Hay un progreso distinto en la nube y en este dispositivo. Elige cuál quieres seguir usando. El otro se perderá.</p>
  <button class="opt" id="acc1">${IC('up')}<div><b>El de la nube</b><span>${esc(sumSave(c))}<br>Guardado ${new Date(AC.cloud.updated_at).toLocaleString('es-ES')}</span></div></button>
  <button class="opt" id="acc2">${IC('user')}<div><b>El de este dispositivo</b><span>${esc(sumSave(SAVE))}</span></div></button><div id="acm"></div></div>`);
  $('acc1').onclick=()=>acBusy('acc1',async()=>{adopt(AC.cloud.data);acSetMeta(AC.cloud.updated_at);AC.state='ok';menu()});
  $('acc2').onclick=()=>acBusy('acc2',async()=>{const r=await rpc('save_progress',{p_data:SAVE,p_base:null,p_force:true});acSetMeta(r.updated_at);AC.state='ok';menu()})}

// ---- Pantallas ----
function acScreen(){if(!sbOn())return acNoServer();if(!SESS)return acLogin();if(!ME){acLoading();return acAfterLogin()}return acProfile()}
function acNoServer(){scr(`<div class="box"><h1>Cuenta</h1><div class="note warn">Las cuentas aún no están activadas en esta versión del juego: falta conectar el servidor.</div><p>Puedes seguir jugando: tu progreso se guarda en este dispositivo.</p>${BK}</div>`);$('bk').onclick=menu}
function acLoading(){scr(`<div class="box"><h1>Cuenta</h1><p>Cargando…</p><div id="acm"></div><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);AC.view='loading';$('bk').onclick=menu;if(AC.err)acMsg(AC.err,true)}
const PROV=[['google','Google'],['apple','Apple'],['discord','Discord']];
function acLogin(mode){mode=mode||'in';const up=mode==='up';AC.view='acc';
  scr(`<div class="box"><h1>${up?'Crear cuenta':'Entrar'}</h1><p>${up?'Guarda tu progreso en la nube, juega con amigos y entra en la clasificación mundial.':'Entra para recuperar tu progreso en cualquier dispositivo.'}</p>
  <div class="rbtn acprov">${PROV.map(p=>`<button class="opt" id="acp_${p[0]}"><b>${p[1]}</b></button>`).join('')}</div>
  <p class="acsm">o con tu correo</p>
  <label class="acl" for="ace">Correo</label><input class="acf" id="ace" type="email" autocomplete="email" maxlength="120" data-go="acgo">
  <label class="acl" for="acpw">Contraseña${up?' (mínimo 8 caracteres)':''}</label><input class="acf" id="acpw" type="password" autocomplete="${up?'new-password':'current-password'}" maxlength="72" data-go="${up?'':'acgo'}">
  ${up?`<label class="acl" for="acpw2">Repite la contraseña</label><input class="acf" id="acpw2" type="password" autocomplete="new-password" maxlength="72" data-go="acgo">
  <label class="acchk"><input type="checkbox" id="acage"> Tengo al menos 14 años o permiso de mi madre, padre o tutor.</label>`:''}
  <div id="acm"></div>
  <button class="opt big" id="acgo">${IC(up?'star':'play')}<div><b>${up?'Crear cuenta':'Entrar'}</b></div></button>
  <div class="acrow"><button class="opt" id="acsw"><div><b>${up?'Ya tengo cuenta':'Crear una cuenta nueva'}</b></div></button>${up?'':`<button class="opt" id="acfg"><div><b>He olvidado la contraseña</b></div></button>`}</div>
  ${BK}</div>`);acKeys();$('bk').onclick=menu;$('acsw').onclick=()=>acLogin(up?'in':'up');if(!up)$('acfg').onclick=acForgot;
  for(const [p] of PROV)$('acp_'+p).onclick=()=>acBusy('acp_'+p,async()=>{if(up&&!acAgeOk())return;await acOAuth(p,false)});
  $('acgo').onclick=()=>acBusy('acgo',async()=>{const em=$('ace').value.trim(),pw=$('acpw').value;
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return acMsg('Escribe un correo válido.',true);
    if(up){if(pw.length<8)return acMsg('La contraseña debe tener al menos 8 caracteres.',true);if(pw!==$('acpw2').value)return acMsg('Las contraseñas no coinciden.',true);if(!acAgeOk())return;
      const {data,error}=await sb.auth.signUp({email:em,password:pw,options:{emailRedirectTo:backUrl()}});if(error)throw error;
      if(data.user&&data.user.identities&&data.user.identities.length===0)return acMsg(ERRS['User already registered'],true);
      if(!data.session)return acSent(em,'Te hemos enviado un correo a <b>'+esc(em)+'</b>. Pulsa el enlace para confirmar tu cuenta y vuelve aquí para entrar.')}
    else{const {error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error)throw error;acLoading()}})}
function acAgeOk(){const a=$('acage');if(a&&!a.checked){acMsg('Marca la casilla de edad para crear la cuenta.',true);return false}return true}
// Antes de salir hacia Google/Apple/Discord se comprueba que el servidor lo tiene activado.
async function acProviders(){if(AC.prov)return AC.prov;const r=await fetch(SB.url+'/auth/v1/settings',{headers:{apikey:SB.key}});if(!r.ok)throw new Error('Failed to fetch');AC.prov=(await r.json()).external||{};return AC.prov}
async function acOAuth(p,link){const pr=await acProviders();if(!pr[p])throw new Error('provider is not enabled');
  const o={provider:p,options:{redirectTo:backUrl(),skipBrowserRedirect:true}};
  const {data,error}=link?await sb.auth.linkIdentity(o):await sb.auth.signInWithOAuth(o);if(error)throw error;
  if(!data||!data.url)throw new Error('Failed to fetch');
  const Br=isNative()&&Capacitor.Plugins.Browser;if(Br)await Br.open({url:data.url});else location.assign(data.url)}
function acSent(em,txt){scr(`<div class="box"><h1>Revisa tu correo</h1><p>${txt}</p><p class="acsm">Si no llega en unos minutos, mira en la carpeta de spam.</p><div id="acm"></div>
  <button class="opt" id="acrs"><div><b>Reenviar el correo</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);
  $('bk').onclick=()=>acLogin('in');$('acrs').onclick=()=>acBusy('acrs',async()=>{const {error}=await sb.auth.resend({type:'signup',email:em,options:{emailRedirectTo:backUrl()}});if(error)throw error;acMsg('Correo reenviado.')})}
function acForgot(){scr(`<div class="box"><h1>Recuperar contraseña</h1><p>Te enviaremos un enlace para elegir una contraseña nueva.</p>
  <label class="acl" for="ace">Correo</label><input class="acf" id="ace" type="email" autocomplete="email" maxlength="120" data-go="acgo"><div id="acm"></div>
  <button class="opt big" id="acgo">${IC('check')}<div><b>Enviar enlace</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);acKeys();
  $('bk').onclick=()=>acLogin('in');$('acgo').onclick=()=>acBusy('acgo',async()=>{const em=$('ace').value.trim();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return acMsg('Escribe un correo válido.',true);
    const {error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:backUrl()});if(error)throw error;
    acMsg('Si hay una cuenta con ese correo, te hemos enviado un enlace. Ábrelo en este dispositivo.')})}
function acNewPass(){scr(`<div class="box"><h1>Contraseña nueva</h1><label class="acl" for="acpw">Contraseña nueva (mínimo 8 caracteres)</label><input class="acf" id="acpw" type="password" autocomplete="new-password" maxlength="72">
  <label class="acl" for="acpw2">Repítela</label><input class="acf" id="acpw2" type="password" autocomplete="new-password" maxlength="72" data-go="acgo"><div id="acm"></div>
  <button class="opt big" id="acgo">${IC('check')}<div><b>Guardar contraseña</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);acKeys();$('bk').onclick=menu;
  $('acgo').onclick=()=>acBusy('acgo',async()=>{const pw=$('acpw').value;if(pw.length<8)return acMsg('La contraseña debe tener al menos 8 caracteres.',true);if(pw!==$('acpw2').value)return acMsg('Las contraseñas no coinciden.',true);
    const {error}=await sb.auth.updateUser({password:pw});if(error)throw error;acMsg('Contraseña cambiada.');setTimeout(acScreen,900)})}
const lvlXp=l=>50*(l-1)*(l-1);
function heroImg(id){const h=HID(id)||HEROES[0];return `<img src="${IMG[h.id].src}" alt="">`}
const SYNC={ok:'Progreso guardado en la nube.',offline:'Sin conexión: tu progreso se subirá a la nube cuando vuelva internet.',conflict:'Hay que elegir qué progreso conservar.','':'Comprobando el guardado en la nube…'};
async function acProfile(){const u=SESS.user,ids=(u.identities||[]).map(i=>i.provider);
  const a=lvlXp(ME.level),b=lvlXp(ME.level+1),pc=Math.max(0,Math.min(100,Math.round(100*(ME.xp-a)/Math.max(1,b-a))));
  scr(`<div class="box"><h1>Mi cuenta</h1><div class="acav" aria-hidden="true"><button tabindex="-1">${heroImg(ME.avatar)}</button></div>
  <h2 style="margin:4px 0">${esc(ME.username)}</h2><p class="acsm">${esc(u.email||'')}</p>
  <div class="acl">Nivel ${ME.level} · ${ME.xp} de experiencia</div><div class="acbar"><i style="width:${pc}%"></i></div>
  <div class="note${AC.state==='ok'?'':' warn'}" id="acst">${SYNC[AC.state]||SYNC['']}</div><div id="acm"></div>
  <button class="opt" id="aced">${IC('user')}<div><b>Editar perfil y privacidad</b><span>Nombre, avatar, país y quién puede ver tu perfil</span></div></button>
  <button class="opt" id="acln">${IC('lock')}<div><b>Métodos de acceso</b><span>${ids.map(x=>x==='email'?'Correo':x[0].toUpperCase()+x.slice(1)).join(' · ')||'Correo'}</span></div></button>
  <button class="opt" id="acex">${IC('book')}<div><b>Descargar mis datos</b><span>Un archivo con todo lo que el juego guarda de ti</span></div></button>
  <button class="opt" id="acout">${IC('back')}<div><b>Cerrar sesión</b></div></button>
  <button class="opt" id="acdel" style="--c:#c9243a">${IC('skull')}<div><b>Borrar mi cuenta</b><span>Para siempre, con todos sus datos</span></div></button>
  ${BK}</div>`);AC.view='prof';$('bk').onclick=menu;$('aced').onclick=acEdit;$('acln').onclick=acLinks;$('acdel').onclick=acDelete;
  if(AC.state==='conflict')$('acst').onclick=acConflict;
  $('acout').onclick=()=>acBusy('acout',async()=>{await acPush(true);await rpc('set_status',{p_status:'offline'}).catch(()=>{});await sb.auth.signOut();ME=null;SESS=null;menu()});
  $('acex').onclick=()=>acBusy('acex',async()=>{const d=await rpc('export_my_data');const bl=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    const l=document.createElement('a');l.href=URL.createObjectURL(bl);l.download='bosque-de-vapor-mis-datos.json';document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(l.href),5000);acMsg('Descarga preparada.')})}
function acEdit(){let av=ME.avatar;const hs=HEROES.filter(h=>isUn(h)||h.id===ME.avatar);
  scr(`<div class="box"><h1>Editar perfil</h1>
  <label class="acl" for="acun">Nombre de usuario (3 a 16 letras, números o _)</label><input class="acf" id="acun" maxlength="16" autocomplete="off" value="${esc(ME.username)}" data-go="acgo">
  <div class="acl">Avatar</div><div class="acav">${hs.map(h=>`<button data-av="${h.id}" aria-pressed="${h.id===av}" aria-label="${esc(h.n)}">${heroImg(h.id)}</button>`).join('')}</div>
  <label class="acl" for="acco">País (código de 2 letras, opcional)</label><input class="acf" id="acco" maxlength="2" autocomplete="off" value="${esc(ME.country||'')}" style="text-transform:uppercase">
  <label class="acchk"><input type="checkbox" id="acsc" ${ME.show_country?'checked':''}> Mostrar mi país en las clasificaciones</label>
  <label class="acl" for="acvi">Quién puede ver mi perfil y estadísticas</label><select class="acf" id="acvi">
   ${[['public','Todo el mundo'],['friends','Solo mis amigos'],['private','Nadie']].map(o=>`<option value="${o[0]}" ${ME.visibility===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>
  <label class="acchk"><input type="checkbox" id="acsh" ${ME.show_history?'checked':''}> Mostrar mi historial de partidas</label>
  <p class="acsm">Tu nombre, avatar y nivel siempre se ven en las clasificaciones y en los grupos.</p><div id="acm"></div>
  <button class="opt big" id="acgo">${IC('check')}<div><b>Guardar</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);acKeys();
  ov.querySelectorAll('[data-av]').forEach(b=>b.onclick=()=>{av=b.dataset.av;ov.querySelectorAll('[data-av]').forEach(x=>x.setAttribute('aria-pressed',x===b))});
  $('bk').onclick=acProfile;
  $('acgo').onclick=()=>acBusy('acgo',async()=>{const un=$('acun').value.trim();if(!/^[A-Za-z0-9_]{3,16}$/.test(un))return acMsg(ERRS.NOMBRE_NO_VALIDO,true);
    const co=$('acco').value.trim().toUpperCase();if(co&&!/^[A-Z]{2}$/.test(co))return acMsg(ERRS.PAIS_NO_VALIDO,true);
    await rpc('update_profile',{p_username:un===ME.username?null:un,p_avatar:av,p_country:co,p_show_country:$('acsc').checked,p_visibility:$('acvi').value,p_show_history:$('acsh').checked});
    ME=await rpc('get_me');acProfile()})}
function acExpired(){SESS=null;ME=null;acLogin('in');acMsg('Tu sesión se ha cerrado (por ejemplo, porque cambiaste la contraseña en otro dispositivo). Vuelve a entrar.',true)}
async function acLinks(){if(!SESS)return acExpired();const u=SESS.user,ids=u.identities||[];
  const has=p=>ids.some(i=>i.provider===p);
  scr(`<div class="box"><h1>Métodos de acceso</h1><p>Vincula varios métodos para entrar siempre en la misma cuenta.</p><div class="rows">
  ${[['email','Correo y contraseña'],...PROV].map(([p,n])=>`<div><span>${n}</span><b>${has(p)?'Vinculado':p==='email'?'—':`<button class="opt" style="margin:0;padding:4px 10px" id="acl_${p}">Vincular</button>`}</b></div>`).join('')}</div>
  <div id="acm"></div>${has('email')?`<button class="opt" id="acpwc">${IC('lock')}<div><b>Cambiar contraseña</b></div></button>`:''}
  <button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);$('bk').onclick=acProfile;if(has('email'))$('acpwc').onclick=acNewPass;
  for(const [p] of PROV)if(!has(p))$('acl_'+p).onclick=()=>acBusy('acl_'+p,()=>acOAuth(p,true))}
function acDelete(){scr(`<div class="box"><h1>Borrar mi cuenta</h1><div class="note warn">Se borrarán para siempre tu perfil, tu progreso en la nube, tus amigos, tus puntos y tu historial. No se puede deshacer.</div>
  <p>El progreso de este dispositivo no se toca.</p><label class="acl" for="acun">Escribe tu nombre de usuario (<b>${esc(ME.username)}</b>) para confirmar</label><input class="acf" id="acun" maxlength="16" autocomplete="off"><div id="acm"></div>
  <button class="opt" id="acgo" style="--c:#c9243a">${IC('skull')}<div><b>Borrar para siempre</b></div></button><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);acKeys();
  $('bk').onclick=acProfile;$('acgo').onclick=()=>acBusy('acgo',async()=>{if($('acun').value.trim().toLowerCase()!==String(ME.username).toLowerCase())return acMsg('El nombre no coincide.',true);
    await rpc('delete_my_account');try{localStorage.removeItem(metaKey())}catch(e){}await sb.auth.signOut({scope:'local'}).catch(()=>{});ME=null;SESS=null;
    scr(`<div class="box"><h1>Cuenta borrada</h1><p>Tu cuenta y sus datos se han borrado.</p>${BK}</div>`);$('bk').onclick=menu})}

// ---- Botón en el menú ----
{const _mn=menu;menu=function(){const r=_mn.apply(this,arguments);AC.view='menu';if(!run&&!$('macc')){const a=$('mplay');if(a){const x=document.createElement('button');x.className='opt';x.id='macc';
  const nm=ME?esc(ME.username):'';x.innerHTML=IC('user')+'<div><b>'+(ME?nm:'Cuenta')+'</b><span>'+(!sbOn()?'Guarda tu progreso en la nube':ME?('Nivel '+ME.level+(AC.state==='offline'?' · sin conexión':AC.state==='conflict'?' · elige tu progreso':' · progreso en la nube')):SESS?'Cargando…':'Entra o crea una cuenta')+'</span></div>';
  const ref=$('mlb')||$('mnet')||a;ref.after(x);x.onclick=acScreen}}return r}}
sbInit();
