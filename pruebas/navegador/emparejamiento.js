// Emparejamiento: tres desconocidos buscan partida de tríos y acaban jugando juntos.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const {execSync}=require('child_process');
const SBD=require('path').join(__dirname,'..','servidor-local');
const key=k=>execSync(`cd ${SBD} && . ./gotrue.env.sh && node gateway.js ${k}`,{shell:'/bin/bash'}).toString().trim();
const ANON=key('anon'),SERVICE=key('service'),API='http://127.0.0.1:54321';
const GAME=process.env.GAME_URL||'http://127.0.0.1:8766/www/index.html';
const U=`${GAME}?sburl=${encodeURIComponent(API)}&sbkey=${ANON}&peerhost=127.0.0.1&peerport=9000`;
const DB=process.env.DB||'sbe2e';
const sql=q=>execSync(`psql -h /tmp/pg -p 5433 -U postgres -d ${DB} -tAc "${q.replace(/"/g,'\\"')}"`).toString().trim();
let ok=0,bad=0;const check=(n,c,x)=>{if(c){ok++;console.log('  ok   ',n)}else{bad++;console.log('  FALLO',n,x===undefined?'':JSON.stringify(x).slice(0,300))}};
async function mkUser(email,name){const r=await fetch(API+'/auth/v1/admin/users',{method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'},
  body:JSON.stringify({email,password:'Clave12345',email_confirm:true})});const j=await r.json();sql(`update profiles set username='${name}' where id='${j.id}'`);return j.id}
(async()=>{sql('delete from auth.users');sql('delete from matches');const T=Date.now();for(const k of ['c','d','e'])await mkUser(`${k}${T}@p.local`,'Jug_'+k.toUpperCase());
const b=await chromium.launch();const errs=[];
const txt=p=>p.evaluate(()=>ov.style.display==='none'?'':ov.innerText.replace(/\s+/g,' '));
const wait=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await f())return true;await p.waitForTimeout(250)}return false};
const login=async(k)=>{const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();
  p.on('pageerror',e=>{errs.push(k+' '+e.message);console.log(k,'ERR',e.message,(e.stack||'').split('\n')[1])});
  await p.goto(U);await p.waitForTimeout(600);await p.click('#macc');await p.fill('#ace',`${k}${T}@p.local`);await p.fill('#acpw','Clave12345');await p.click('#acgo');
  await wait(p,async()=>/Mi cuenta/.test(await txt(p)));await p.evaluate(()=>menu());return p};
const P=[];for(const k of ['c','d','e'])P.push(await login(k));
await P[2].evaluate(()=>{SAVE.dif='a';save()});await P[2].click('#mfr');await wait(P[2],async()=>/Jugar con otros/.test(await txt(P[2])));await P[2].click('#soq_trio');
check('desde Aventura no se puede buscar (no cuenta)',/Aventura no cuenta/.test(await txt(P[2])),await txt(P[2]));
await P[2].evaluate(()=>{SAVE.dif='s';save();soScreen('pt')});await P[2].waitForTimeout(500);
for(const p of P.slice(0,2)){await p.click('#mfr');await wait(p,async()=>/Jugar con otros/.test(await txt(p)));await p.click('#soq_trio');}
check('esperan en la cola',await wait(P[1],async()=>/Buscando jugadores.*2 de 3/.test(await txt(P[1])),6000),await txt(P[1]));
await P[1].screenshot({path:'/tmp/mm_wait.png'});
await P[2].click('#soq_trio');
const all=async f=>{for(const p of P)if(!(await f(p)))return false;return true};
check('al llegar el tercero empieza la partida para los tres',await wait(P[0],()=>all(p=>p.evaluate(()=>run===true)),30000),await Promise.all(P.map(txt)));
const host=(await Promise.all(P.map(p=>p.evaluate(()=>NET.host)))).filter(Boolean).length;
check('uno es el anfitrión y los otros dos invitados',host===1);
check('el servidor tiene la partida de tríos con los tres',sql(`select mode||count(*) from matches m join match_players mp on mp.match_id=m.id group by m.id,mode`)==='trio3');
check('nadie queda en la cola',sql('select count(*) from queue')==='0');
check('sin errores de JavaScript',errs.length===0,errs);
console.log(`\n${ok} bien, ${bad} fallos`);await b.close();process.exit(bad?1:0)})();
