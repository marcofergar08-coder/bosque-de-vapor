// Modo Infinito con 4 jugadores en una sala con código: el anfitrión lo elige, todos ven la
// misma oleada, hay más demonios con más jugadores, un caído vuelve al terminar la oleada,
// un corte con reconexión no rompe la oleada y al final todos ven el mismo resumen.
// Necesita el PeerServer local en el puerto 9000.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const GAME=process.env.GAME_URL||'http://127.0.0.1:8766/www/index.html';
const U=GAME+'?sburl=off&peerhost=127.0.0.1&peerport=9000';
let ok=0,bad=0;const check=(n,c,x)=>{if(c){ok++;console.log('  ok   ',n)}else{bad++;console.log('  FALLO',n,x===undefined?'':JSON.stringify(x).slice(0,400))}};
(async()=>{const b=await chromium.launch();const errs=[];
const mk=async(n)=>{const c=await b.newContext({viewport:{width:844,height:390}});const p=await c.newPage();
  p.on('pageerror',e=>{errs.push(n+' '+e.message);console.log(n,'ERR',e.message,(e.stack||'').split('\n')[1])});await p.goto(U);await p.waitForTimeout(700);return p};
const txt=p=>p.evaluate(()=>ov.style.display==='none'?'':ov.innerText.replace(/\s+/g,' '));
const wait=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await f())return true;await p.waitForTimeout(200)}return false};
const cards=async ps=>{for(const p of ps){const o=await txt(p);if(await p.evaluate(()=>run&&!S.ended)&&/Nivel|Cofre|Recompensa/.test(o)){const bt=await p.$('#ov .opt');if(bt)await bt.click().catch(()=>{})}}};
const H=await mk('H');await H.click('#mnet');await H.click('#nmk');await wait(H,async()=>/Sala [A-Z]{4}/.test(await txt(H)));
const code=(await txt(H)).match(/Sala ([A-Z]{4})/)[1];
const G=[];for(const n of ['G1','G2','G3']){const g=await mk(n);await g.click('#mnet');await g.click('#njn');await g.fill('#ncd',code);await g.click('#ngo');G.push(g)}
check('entran 3 invitados',await wait(H,async()=>/4 jugadores/.test(await txt(H))),await txt(H));
check('el anfitrión puede elegir el modo',!!(await H.$('#ninf'))&&/Modo: Normal/.test(await txt(H)));
await H.click('#ninf');check('cambia a Infinito',/Modo: Infinito/.test(await txt(H)));
await H.click('#ngo');
check('empieza el Infinito para los 4',await wait(H,async()=>{for(const p of [H,...G])if(!(await p.evaluate(()=>run&&!!(S&&S.inf))))return false;return true},15000));
// todos invencibles mientras se comprueba el reparto de la partida
await H.evaluate(()=>{window.__god=setInterval(()=>{for(const q of NET.pl)if(!q.dn)q.ivf=1e9},200)});
check('llega la oleada 1',await wait(H,()=>H.evaluate(()=>S.inf.w===1),12000));
const tot=await H.evaluate(()=>({tot:S.inf.tot,np:S.inf.np}));
check('con 4 jugadores la oleada es más grande (×2,6)',tot.np===4&&tot.tot>=30,tot);
check('los invitados ven la misma oleada en su marcador',await wait(G[0],async()=>/Oleada 1 · quedan \d+/.test(await G[0].evaluate(()=>hd.wn.textContent)),6000),await G[0].evaluate(()=>hd.wn.textContent));
const wv=await Promise.all(G.map(g=>g.evaluate(()=>S.inf&&S.inf.w)));check('todos están en la oleada 1',wv.every(x=>x===1),wv);
console.log('Caído y reanimación');
await H.evaluate(()=>{const q=NET.pl[2];q.ivf=0;netDown(q)});
check('el jugador cae',await H.evaluate(()=>NET.pl[2].dn>0));
await H.evaluate(()=>{const q=NET.pl[2],o=NET.pl[1];o.x=q.x+20;o.y=q.y});await H.waitForTimeout(1500);
const dn=await H.evaluate(()=>NET.pl[2].dn);check('un compañero al lado lo levanta más rápido',dn<12-1.5*2.2,dn);
await H.evaluate(()=>{netDown(NET.pl[3])});
// acaba con la oleada desde el anfitrión
await H.evaluate(()=>{window.__k=setInterval(()=>{for(const e of E)if(!e.dead&&e.iw===S.inf.w&&!(e.inv>0))hit(e,1e12)},300)});
check('al superar la oleada los caídos vuelven',await wait(H,()=>H.evaluate(()=>S.inf.done>=1&&!NET.pl[3].dn),40000),await H.evaluate(()=>({d:S.inf.done,dn:NET.pl[3].dn})));
console.log('Corte y reconexión durante el Infinito');
await G[1].evaluate(()=>{NET.peer.destroy()});
check('vuelve solo a la misma partida',await wait(H,async()=>(await H.evaluate(()=>NET.pl[2].off))===false||(await H.evaluate(()=>!NET.pl[2].off)),25000));
check('sigue viendo el Infinito tras volver',await wait(G[1],()=>G[1].evaluate(()=>!!(S&&S.inf&&S.inf.w>=1)),10000));
{const t0=Date.now();while(Date.now()-t0<45000&&(await H.evaluate(()=>S.inf.done))<2){await cards([H,...G]);await H.waitForTimeout(500)}}
const w2=await H.evaluate(()=>S.inf.done);check('las oleadas siguen avanzando',w2>=2,w2);
console.log('Final');
await H.evaluate(()=>{clearInterval(window.__god);clearInterval(window.__k);for(const q of NET.pl){q.ivf=0;netDown(q)}});
check('si caen todos se acaba para todos',await wait(H,async()=>/devorado/.test(await txt(H)),10000),await txt(H));
const hs=await txt(H);check('el anfitrión ve el resumen del Infinito',/Modo Infinito/.test(hs)&&/Oleada alcanzada: \d+/.test(hs),hs.slice(0,300));
const hw=(hs.match(/Oleada alcanzada: (\d+)/)||[])[1];
for(const g of G){await wait(g,async()=>/Modo Infinito/.test(await txt(g)),10000);const t=await txt(g);check('el invitado ve el mismo resumen',/Modo Infinito/.test(t)&&(t.match(/Oleada alcanzada: (\d+)/)||[])[1]===hw,t.slice(0,300))}
const sc=await Promise.all([H,...G].map(p=>p.evaluate(()=>S.inf&&S.inf.sc)));check('la misma puntuación para todos',sc.every(x=>x===sc[0]&&x>0),sc);
check('sin errores de JavaScript',errs.length===0,errs);
console.log(`\n${ok} bien, ${bad} fallos`);await b.close();process.exit(bad?1:0)})();
