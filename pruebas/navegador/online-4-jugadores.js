// Partida online de 4 jugadores con sala por código: entrar, sala llena, jugar, mejoras,
// corte y reconexión, abandono, jugador que no vuelve y fin de partida.
// Necesita un PeerServer local (pruebas/servidor-local/peerserver.js) en el puerto 9000.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const GAME=process.env.GAME_URL||'http://127.0.0.1:8766/www/index.html';
const U=GAME+'?peerhost=127.0.0.1&peerport=9000';
let ok=0,bad=0;const check=(n,c,x)=>{if(c){ok++;console.log('  ok   ',n)}else{bad++;console.log('  FALLO',n,x===undefined?'':JSON.stringify(x).slice(0,300))}};
(async()=>{const b=await chromium.launch();const errs=[];
const mk=async(n)=>{const c=await b.newContext({viewport:{width:844,height:390}});const p=await c.newPage();p.__n=n;
  p.on('pageerror',e=>{errs.push(n+' '+e.message);console.log(n,'ERR',e.message,(e.stack||'').split('\n')[1])});await p.goto(U);await p.waitForTimeout(700);return p};
const txt=p=>p.evaluate(()=>ov.style.display==='none'?'':ov.innerText.replace(/\s+/g,' '));
const wait=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await f())return true;await p.waitForTimeout(200)}return false};
const st=p=>p.evaluate(()=>({run,on:NET.on,host:NET.host,you:NET.you,n:NET.pl.length,me:P&&[Math.round(P.x),Math.round(P.y)],t:S&&S.t,off:NET.pl.map(q=>q.off?1:0)}));
const cards=async ps=>{for(const p of ps){const o=await txt(p);if(/Nivel|Cofre/.test(o)){const bt=await p.$('#ov .opt');if(bt)await bt.click().catch(()=>{})}}};
const H=await mk('H');await H.click('#mnet');await H.click('#nmk');await wait(H,async()=>/Sala [A-Z]{4}/.test(await txt(H)));
const code=(await txt(H)).match(/Sala ([A-Z]{4})/)[1];
const G=[];for(const n of ['G1','G2','G3']){const g=await mk(n);await g.click('#mnet');await g.click('#njn');await g.fill('#ncd',code);await g.click('#ngo');G.push(g)}
check('entran 3 invitados',await wait(H,async()=>/4 jugadores/.test(await txt(H))),await txt(H));
const G4=await mk('G4');await G4.click('#mnet');await G4.click('#njn');await G4.fill('#ncd',code);await G4.click('#ngo');
check('el quinto ve «sala llena»',await wait(G4,async()=>/llena/.test(await txt(G4))),await txt(G4));await G4.context().close();
await H.click('#ngo');
check('empieza para los 4',await wait(H,async()=>{for(const g of G)if(!(await st(g)).run)return false;return true}));
await H.waitForTimeout(1500);
const s=await Promise.all(G.map(st));check('cada invitado controla su propio personaje',s.map(x=>x.you).sort().join()==='1,2,3'&&s.every(x=>x.n===4),s);
check('el anfitrión tiene 4 jugadores',(await st(H)).n===4);
const pos0=await H.evaluate(()=>NET.pl.map(q=>[q.x,q.y]));
const dirs=['d','s','a'];for(let i=0;i<3;i++)await G[i].keyboard.down(dirs[i]);await H.keyboard.down('w');await H.waitForTimeout(2500);for(let i=0;i<3;i++)await G[i].keyboard.up(dirs[i]);await H.keyboard.up('w');
const pos1=await H.evaluate(()=>NET.pl.map(q=>[q.x,q.y]));
check('cada uno se mueve por su lado',pos1[0][1]<pos0[0][1]-50&&pos1[1][0]>pos0[1][0]+50&&pos1[2][1]>pos0[2][1]+50&&pos1[3][0]<pos0[3][0]-50,{pos0,pos1});
const gp=await G[0].evaluate(()=>[Math.round(P.x),Math.round(P.y)]);check('el invitado ve su posición real',Math.abs(gp[0]-pos1[1][0])<40,{gp,h:pos1[1]});
await H.evaluate(()=>{window.__b=0;for(const g of NET.gs){const s=g.c.send.bind(g.c);g.c.send=m=>{window.__b+=JSON.stringify(m).length;s(m)}}});
for(let i=0;i<16;i++){for(let k=0;k<3;k++)await G[k].keyboard.down('wasd'[(i+k)%4]);await H.waitForTimeout(1000);for(let k=0;k<3;k++)await G[k].keyboard.up('wasd'[(i+k)%4]);await cards([H,...G])}
const bw=await H.evaluate(()=>window.__b/16/3);console.log('   datos por invitado:',Math.round(bw/1024),'KB/s');check('datos por invitado razonables (<60 KB/s)',bw<60*1024,bw);
check('subida de nivel compartida',(await H.evaluate(()=>NET.pl[0].lvl))>1);
console.log('Corte y reconexión');
const q2=await H.evaluate(()=>NET.gs[1].q.nm||1);
await G[1].evaluate(()=>{NET.peer.destroy()});
check('el anfitrión marca al jugador como desconectado',await wait(H,async()=>(await st(H)).off[2]===1,6000),await st(H));
check('el invitado ve que está reconectando',await G[1].evaluate(()=>NET.rc===1));
check('vuelve solo a la misma partida',await wait(H,async()=>(await st(H)).off[2]===0,20000),await st(H));
const t1=(await st(G[1])).t;await G[1].waitForTimeout(1500);const after=await st(G[1]);
check('y sigue recibiendo la partida con su personaje',after.run&&after.t>t1&&after.you===2&&after.n===4,after);
console.log('Abandono');
await G[2].keyboard.press('Escape');await G[2].waitForTimeout(300);
const hasLeave=await G[2].$('#nlv');if(hasLeave)await G[2].click('#nlv');else await G[2].evaluate(()=>netLeaveGame());
check('quien abandona sale al menú',await wait(G[2],async()=>!!(await G[2].$('#mplay'))));
check('el anfitrión lo quita de la partida',await wait(H,async()=>(await st(H)).n===3),await st(H));
console.log('Jugador que no vuelve');
await G[0].context().close();
check('se marca como desconectado',await wait(H,async()=>(await st(H)).off[1]===1,8000),await st(H));
await H.evaluate(()=>{for(const g of NET.gs)if(!g.c)g.off=0.1});
check('pasado el tiempo de espera sale de la partida',await wait(H,async()=>(await st(H)).n===2),await st(H));
console.log('Fin de partida');
await H.evaluate(()=>{for(const q of NET.pl){q.hp=0}});
check('si caen todos se acaba para todos',await wait(G[1],async()=>/devorado/.test(await txt(G[1])),8000),await txt(G[1]));
check('el anfitrión ve el final',await wait(H,async()=>!(await st(H)).run));
check('sin errores de JavaScript',errs.length===0,errs);
console.log(`\n${ok} bien, ${bad} fallos`);await b.close();process.exit(bad?1:0)})();
