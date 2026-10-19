/* ===== Apoyar al creador: donaciones voluntarias con Stripe (solo en la versión web) =====
 El pago se hace en la página oficial de Stripe; este código nunca ve la tarjeta ni ninguna clave
 secreta. Una donación solo se muestra como recibida cuando el servidor dice que Stripe la ha
 confirmado con su aviso firmado; volver a esta página no basta. En la app del móvil no aparece:
 Apple y Google exigen sus propios pagos dentro de las apps. */
const DON={amt:500,ret:null,poll:0};
const donOn=()=>sbOn()&&!isNative();
const eur=c=>(c/100).toLocaleString('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:c%100?2:0});
{const q=new URLSearchParams(location.search),id=q.get('donacion'),r=q.get('resultado');
  if(id&&/^[0-9a-f-]{36}$/.test(id)&&['ok','cancelada'].includes(r)){DON.ret={id,r};q.delete('donacion');q.delete('resultado');
    try{history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:''))}catch(e){}}}
const DERR={DONACIONES_NO_CONFIGURADAS:'Las donaciones todavía no están activadas en el servidor del juego. No se ha cobrado nada.',
  CANTIDAD_NO_VALIDA:'La cantidad debe estar entre 1 € y 500 €.',DIRECCION_NO_PERMITIDA:'Esta copia del juego no está autorizada para recibir donaciones. No se ha cobrado nada.',
  STRIPE_NO_DISPONIBLE:'No se ha podido abrir la página de pago de Stripe. Inténtalo más tarde; no se ha cobrado nada.',DEMASIADAS_PETICIONES:ERRS.DEMASIADAS_PETICIONES};
Object.assign(ERRS,DERR);
function donScreen(){if(!donOn())return donOff();
  scr(`<div class="box"><h1>Apoyar al creador</h1>
  <p>¡Gracias por jugar a Bosque de Vapor! Si te gusta y quieres ayudar a que siga creciendo, puedes hacer una donación.</p>
  <div class="note">Es totalmente <b>voluntaria</b>: no desbloquea nada ni da ventajas en el juego, que sigue siendo igual para todos.</div>
  <div class="rbtn" id="donam">${[200,500,1000,2000].map(c=>`<button class="opt" data-c="${c}" aria-pressed="${DON.amt===c}"><b>${eur(c)}</b></button>`).join('')}</div>
  <label class="acl" for="donx">Otra cantidad (de 1 € a 500 €)</label><input class="acf" id="donx" inputmode="decimal" maxlength="7" placeholder="Por ejemplo 3,50" data-go="dongo">
  <div id="acm"></div>
  <button class="opt big" id="dongo">${IC('heart')}<div><b>Continuar al pago</b><span id="dons">${eur(DON.amt)} · pago seguro en la página de Stripe</span></div></button>
  <button class="opt" id="bk">${IC('back')}<div><b>Volver sin donar</b></div></button>
  <p class="acsm">Pagas en la web de Stripe: el juego no ve ni guarda los datos de tu tarjeta.${SESS?' La donación quedará asociada a tu cuenta.':''}</p></div>`);
  acKeys();$('bk').onclick=menu;
  const pick=c=>{DON.amt=c;ov.querySelectorAll('#donam [data-c]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.c===c)));$('dons').textContent=eur(c)+' · pago seguro en la página de Stripe'};
  ov.querySelectorAll('#donam [data-c]').forEach(b=>b.onclick=()=>{$('donx').value='';acMsg('');pick(+b.dataset.c)});
  $('donx').oninput=()=>{const v=$('donx').value.trim().replace(',','.');if(!v)return pick(DON.amt);const n=Math.round(parseFloat(v)*100);
    if(!/^\d{1,3}(\.\d{1,2})?$/.test(v)||!(n>=100&&n<=50000))return acMsg(DERR.CANTIDAD_NO_VALIDA,true);acMsg('');pick(n)};
  $('dongo').onclick=()=>acBusy('dongo',async()=>{const v=$('donx').value.trim();if(v&&!(/^\d{1,3}([.,]\d{1,2})?$/.test(v)&&DON.amt===Math.round(parseFloat(v.replace(',','.'))*100)))throw new Error('CANTIDAD_NO_VALIDA');
    const r=await donCall('crear-donacion',{amount_cents:DON.amt,return_url:location.origin+location.pathname+location.search});
    try{localStorage.setItem('bdv_don',JSON.stringify({id:r.id,c:DON.amt,t:Date.now()}))}catch(e){}
    acMsg('Abriendo la página de pago de Stripe…');location.assign(r.url)})}
async function donCall(fn,body){let r;
  try{r=await fetch(`${SB.url}/functions/v1/${fn}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SB.key,Authorization:'Bearer '+(SESS&&SESS.access_token||SB.key)},body:JSON.stringify(body)})}
  catch(e){throw new Error('Failed to fetch')}
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j||!j.url){const k=j&&j.error;throw new Error(DERR[k]?k:r.status===404?'DONACIONES_NO_CONFIGURADAS':'STRIPE_NO_DISPONIBLE')}
  return j}
function donOff(){scr(`<div class="box"><h1>Apoyar al creador</h1><div class="note warn">${isNative()?'Las donaciones solo se pueden hacer desde la versión web del juego.':'Las donaciones todavía no están activadas en esta versión del juego: falta conectar el servidor.'}</div>${BK}</div>`);$('bk').onclick=menu}
// Vuelta desde Stripe: se pregunta al servidor cómo está la donación.
async function donReturn(){const {id,r}=DON.ret;DON.ret=null;let c=0;try{const s=JSON.parse(localStorage.getItem('bdv_don')||'{}');if(s.id===id)c=s.c}catch(e){}
  scr(`<div class="box"><h1>Apoyar al creador</h1><div id="acm"></div><div id="donst"><p>${r==='ok'?'Comprobando el pago con Stripe…':'Volviendo…'}</p></div><div id="donbt"></div>${BK}</div>`);$('bk').onclick=()=>{clearTimeout(DON.poll);menu()};
  const show=(h,again)=>{const el=$('donst');if(!el)return;el.innerHTML=h;$('donbt').innerHTML=again?`<button class="opt" id="donre">${IC('check')}<div><b>Comprobar otra vez</b></div></button>`:'';
    if(again)$('donre').onclick=()=>{DON.ret={id,r:'ok'};donReturn()}};
  const done=d=>{try{localStorage.removeItem('bdv_don')}catch(e){}};
  try{if(r==='cancelada'){const d=await rpc('cancel_donation',{p_id:id});
      if(d&&d.status==='paid'){done();return show(`<div class="note">¡Gracias! Stripe ha confirmado tu donación de <b>${eur(d.amount_cents)}</b>.</div>`)}
      done();return show(`<div class="note">Has vuelto sin donar. No se ha cobrado nada.</div><p>¡Gracias igualmente por jugar!</p>`)}
    const t0=Date.now();
    const tick=async()=>{let d;try{d=await rpc('get_donation',{p_id:id})}catch(e){if(!$('donst'))return;return show(`<div class="note warn">${acErr(e)}</div>`,1)}
      if(!$('donst'))return;
      if(!d){done();return show('<div class="note warn">No se encuentra esa donación.</div>')}
      if(d.status==='paid'){done();return show(`<div class="note"><b>¡Muchísimas gracias!</b> Stripe ha confirmado tu donación de <b>${eur(d.amount_cents)}</b>. Tu apoyo ayuda a que Bosque de Vapor siga creciendo.</div>`)}
      if(d.status==='failed'){done();return show('<div class="note warn">El pago no se ha completado, así que no se ha cobrado nada. Puedes intentarlo otra vez si quieres.</div>')}
      if(d.status==='expired'||d.status==='canceled'){done();return show('<div class="note warn">La página de pago se cerró sin completar el pago. No se ha cobrado nada.</div>')}
      if(Date.now()-t0<40000){show(`<p>Comprobando el pago con Stripe…</p><p class="acsm">Esperando la confirmación de ${eur(d.amount_cents||c)}. No cierres esta pantalla.</p>`);DON.poll=setTimeout(tick,2000);return}
      show(`<div class="note">Stripe todavía no ha confirmado el pago de ${eur(d.amount_cents||c)}. Si has pagado con un método lento (por ejemplo una transferencia) puede tardar: <b>no hace falta volver a pagar</b>.</div>`,1)};
    await tick()}catch(e){show(`<div class="note warn">${acErr(e)}</div>`,1)}}
{const _mn=menu;let first=1;menu=function(){const r=_mn.apply(this,arguments);
  if(first){first=0;if(DON.ret&&sbOn()){setTimeout(donReturn,0);return r}}
  if(!run&&!isNative()&&!$('mdon')){const a=$('mlb')||$('mnet')||$('mplay');if(a){const x=document.createElement('button');x.className='opt';x.id='mdon';
    x.innerHTML=IC('heart')+'<div><b>Apoyar al creador</b><span>Donación voluntaria</span></div>';(a.parentNode.querySelector('.opt:last-of-type')||a).after(x);x.onclick=donScreen}}return r}}
