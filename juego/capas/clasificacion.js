
/* ===== Fase 12: clasificación mundial, temporadas e historial =====
 Todo sale del servidor (get_leaderboard, get_my_rank). Si no hay nadie, se dice: nunca se
 muestran jugadores de ejemplo. */
const LBV={mode:'solo',kind:'players',season:null,country:'',off:0,seasons:null};
const DIVC={Bronce:'#a86a3d',Plata:'#8c8c8c',Oro:'#d9a400',Platino:'#3f8f8f',Leyenda:'#c9243a'};
const divTag=d=>`<i class="rr" style="background:${DIVC[d]||'#141210'}">${esc(d)}</i>`;
{const st=document.createElement('style');st.textContent=`.lbt{width:100%;border-collapse:collapse;font-size:14px;text-align:left}.lbt th{font-size:12px;border-bottom:2px solid #141210;padding:4px 3px}
.lbt td{border-bottom:1px dashed #141210;padding:6px 3px;vertical-align:middle}.lbt tr.me td{background:#ffd23d}.lbt .n{text-align:right;white-space:nowrap}.lbt button{all:unset;cursor:pointer;font-weight:700;overflow-wrap:anywhere}
.lbt .rr{font-style:normal;color:#fff;font-size:11px;padding:1px 5px;border-radius:3px}.lbf{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.lbf select,.lbf input{font:inherit;border:2px solid #141210;background:#f3ecd8;padding:5px;min-width:0}
.lbme{border:3px solid #141210;background:#f3ecd8;padding:8px;margin:8px 0;text-align:left}@media (max-width:480px){.lbt .hm{display:none}}`;document.head.appendChild(st)}
function lbOpen(){if(!sbOn())return acNoServer();LBV.off=0;lbScreen()}
async function lbScreen(){const team=LBV.mode!=='solo';if(!team)LBV.kind='players';
  scr(`<div class="box wide"><h1>Clasificación mundial</h1><div id="lbs" class="acsm"></div>
  <div class="sotabs">${Object.keys(MODES).map(m=>`<button class="opt" data-m="${m}" aria-pressed="${LBV.mode===m}"><b>${MODES[m]}</b></button>`).join('')}</div>
  ${team?`<div class="sotabs">${[['players','Jugadores'],['teams','Equipos']].map(k=>`<button class="opt" data-k="${k[0]}" aria-pressed="${LBV.kind===k[0]}"><b>${k[1]}</b></button>`).join('')}</div>`:''}
  <div class="lbf"><select id="lbse" aria-label="Temporada"><option value="">Temporada actual</option></select>
  ${LBV.kind==='players'?`<input id="lbco" maxlength="2" placeholder="País (ES…)" aria-label="País" value="${esc(LBV.country)}" style="width:7em;text-transform:uppercase">`:''}</div>
  <div id="lbme"></div><div id="acm"></div><div id="lbl"><p>Cargando…</p></div><div id="lbmore"></div>
  <p class="acsm">Puntos: la suma de tus 10 mejores partidas de la temporada. Solo cuentan las partidas verificadas por el servidor (no la Aventura ni las Hazañas).</p>${BK}</div>`);
  $('bk').onclick=menu;
  ov.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{LBV.mode=b.dataset.m;LBV.off=0;lbScreen()});
  ov.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{LBV.kind=b.dataset.k;LBV.off=0;lbScreen()});
  const co=$('lbco');if(co){acKeys();co.onchange=()=>{const v=co.value.trim().toUpperCase();if(v&&!/^[A-Z]{2}$/.test(v))return acMsg(ERRS.PAIS_NO_VALIDO,true);LBV.country=v;LBV.off=0;lbScreen()}}
  try{if(!LBV.seasons)LBV.seasons=await rpc('list_seasons');const se=$('lbse');if(!se)return;
    se.innerHTML='<option value="">Temporada actual</option>'+LBV.seasons.filter(s=>!s.current).map(s=>`<option value="${s.id}" ${LBV.season===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
    se.onchange=()=>{LBV.season=se.value?+se.value:null;LBV.off=0;lbScreen()};
    const cur=LBV.seasons.find(s=>LBV.season?s.id===LBV.season:s.current);
    if(cur)$('lbs').textContent=cur.name+(cur.current?' · termina en '+Math.max(0,Math.ceil((Date.parse(cur.ends)-Date.now())/864e5))+' días':' · terminada');
    await lbRows()}catch(e){const l=$('lbl');if(l)l.innerHTML=`<div class="note warn">${acErr(e)}</div>`}}
async function lbRows(){const args={p_mode:LBV.mode,p_season:LBV.season,p_country:LBV.kind==='players'&&LBV.country||null,p_kind:LBV.kind,p_limit:50,p_offset:LBV.off};
  const rows=await rpc('get_leaderboard',args),el=$('lbl');if(!el)return;const team=LBV.kind==='teams';
  if(!rows.length&&!LBV.off){el.innerHTML=`<div class="note">Todavía no hay nadie en esta clasificación${LBV.country?' para este país':''}. ¡Juega una partida clasificada de ${MODES[LBV.mode]} para ser el primero!</div>`;$('lbmore').innerHTML=''}
  else{const mine=ME&&ME.username;
    const html=rows.map(r=>`<tr class="${!team&&r.name===mine||team&&mine&&r.name.split(' · ').includes(mine)?'me':''}"><td class="n">${r.pos}</td>
      <td>${team?esc(r.name):`<button data-u="${esc(r.name)}">${esc(r.name)}</button>`}${r.country?` <small>${esc(r.country)}</small>`:''}<br>${divTag(r.division)}</td>
      <td class="n hm">nv. ${r.level}</td><td class="n"><b>${r.points}</b></td><td class="n">${r.wins}/${r.games}</td><td class="n hm">${r.winrate}%</td></tr>`).join('');
    if(LBV.off)el.querySelector('tbody').insertAdjacentHTML('beforeend',html);
    else el.innerHTML=`<table class="lbt"><thead><tr><th class="n">#</th><th>${team?'Equipo':'Jugador'}</th><th class="n hm">Nivel</th><th class="n">Puntos</th><th class="n">Vict./Part.</th><th class="n hm">% vict.</th></tr></thead><tbody>${html}</tbody></table>`;
    el.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>soProfile(b.dataset.u,lbScreen));
    $('lbmore').innerHTML=rows.length===50?`<button class="opt" id="lbm"><div><b>Ver más</b></div></button>`:'';if($('lbm'))$('lbm').onclick=()=>acBusy('lbm',async()=>{LBV.off+=50;await lbRows()})}
  const me=$('lbme');if(!me||LBV.off)return;
  if(!SESS){me.innerHTML=`<div class="lbme">Entra con tu cuenta para competir y ver tu posición.</div>`;return}
  if(team){me.innerHTML='';return}
  const r=await rpc('get_my_rank',{p_mode:LBV.mode,p_season:LBV.season,p_country:LBV.country||null});if(!$('lbme'))return;
  me.innerHTML=`<div class="lbme">${r?`Tu posición: <b>${r.pos}º</b> · ${r.points} puntos · ${divTag(r.division)} · ${r.wins} victorias en ${r.games} partidas (${r.winrate}%)`:`Aún no tienes partidas de ${MODES[LBV.mode]} en esta temporada.`}</div>`}
/* historial propio */
async function lbHistory(back){scr(`<div class="box wide"><h1>Mi historial</h1><div id="acm"></div><div id="lbl"><p>Cargando…</p></div><button class="opt" id="bk">${IC('back')}<div><b>Volver</b></div></button></div>`);$('bk').onclick=back||acProfile;
  try{const h=await rpc('get_history',{p_username:ME.username,p_limit:50}),el=$('lbl');if(!el)return;
    el.innerHTML=h.length?`<table class="lbt"><thead><tr><th>Fecha</th><th>Modo</th><th class="n">Tiempo</th><th class="n hm">☠</th><th>Resultado</th><th class="n">Puntos</th></tr></thead><tbody>${h.map(x=>`<tr><td>${new Date(x.date).toLocaleDateString('es-ES')}</td><td>${MODES[x.mode]||esc(x.mode)}<br><small>${DIFS[x.difficulty]?DIFS[x.difficulty].n:''}</small></td>
      <td class="n">${x.survived!=null?fmt(x.survived):'—'}</td><td class="n hm">${x.kills!=null?x.kills:'—'}</td><td>${x.status==='finished'?(x.won?'Victoria':'Derrota'):x.status==='active'?'En curso':'Abandonada'}</td><td class="n">${x.score!=null?x.score:'—'}</td></tr>`).join('')}</tbody></table>`
      :'<p>Todavía no has jugado partidas clasificadas.</p>'}catch(e){acMsg(acErr(e),true)}}
/* recompensas de la temporada que terminó */
async function lbRewards(){try{const r=await rpc('claim_season_rewards');if(r&&r.coins>0){SAVE.coins+=r.coins;SAVE.earned=(SAVE.earned||0)+r.coins;save();toast('Recompensa de la temporada: +'+r.coins+' monedas','chest')}}catch(e){}}
{const _al=acAfterLogin;acAfterLogin=async function(){const r=await _al.apply(this,arguments);if(ME)lbRewards();return r}}
{const _ap=acProfile;acProfile=async function(){const r=await _ap.apply(this,arguments);const a=$('aced');if(a&&!$('achi')){const x=document.createElement('button');x.className='opt';x.id='achi';
  x.innerHTML=IC('chart')+'<div><b>Mi historial</b><span>Tus partidas clasificadas</span></div>';a.before(x);x.onclick=()=>lbHistory()}return r}}
{const _mn=menu;menu=function(){const r=_mn.apply(this,arguments);if(!run&&sbOn()&&!$('mlb')){const a=$('mnet')||$('mplay');if(a){const x=document.createElement('button');x.className='opt';x.id='mlb';
  x.innerHTML=IC('trophy')+'<div><b>Clasificación mundial</b><span>Solitario, dúos, tríos y escuadrones</span></div>';a.after(x);x.onclick=lbOpen}}return r}}
