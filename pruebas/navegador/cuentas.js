// Prueba de cuentas de principio a fin en el navegador, contra el servidor de cuentas real (GoTrue)
// y la base de datos con la migración del juego.
const {chromium}=require(process.env.PLAYWRIGHT||'playwright');
const fs=require('fs'),{execSync}=require('child_process');
const SBD=require('path').join(__dirname,'..','servidor-local');
const MAIL=process.env.MAILDIR||SBD+'/mail';
const ANON=execSync(`cd ${SBD} && . ./gotrue.env.sh && node gateway.js anon`,{shell:'/bin/bash'}).toString().trim();
const GAME=process.env.GAME_URL||'http://127.0.0.1:8766/www/index.html';
const U=`${GAME}?sburl=${encodeURIComponent('http://127.0.0.1:54321')}&sbkey=${ANON}`;
const sql=q=>execSync(`psql -h /tmp/pg -p 5433 -U postgres -d sbe2e -tAc "${q.replace(/"/g,'\\"')}"`).toString().trim();
let ok=0,bad=0;const check=(n,c,x)=>{if(c){ok++;console.log('  ok   ',n)}else{bad++;console.log('  FALLO',n,x===undefined?'':JSON.stringify(x))}};
const EM='marco'+Date.now()+'@prueba.local';
const mails=()=>fs.readdirSync(MAIL).filter(f=>f.includes(EM)).sort();
const linkIn=f=>{const t=fs.readFileSync(MAIL+'/'+f,'utf8').replace(/=\r?\n/g,'').replace(/=3D/g,'=');const m=t.match(/href="([^"]+)"/);return m&&m[1].replace(/&amp;/g,'&')};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{sql('delete from auth.users');fs.readdirSync(MAIL).forEach(f=>fs.unlinkSync(MAIL+'/'+f));const b=await chromium.launch();
const errs=[];
const mk=async(n,url)=>{const c=await b.newContext({viewport:{width:844,height:390},acceptDownloads:true});const p=await c.newPage();
  p.on('pageerror',e=>{errs.push(n+' '+e.message);console.log(n,'ERR',e.message)});p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))console.log(n,'CON',m.text().slice(0,200))});
  p.on('request',r=>{const u=r.url();if(u.startsWith('https://accounts.google.com/'))p.__g=u;if(u.startsWith('https://discord.com/'))p.__d=u});
  await c.route(/^https:\/\/(accounts\.google|discord)\.com\//,r=>r.fulfill({status:200,body:'falso'}));
  await p.goto(url||U);await p.waitForTimeout(700);return p};
const txt=p=>p.evaluate(()=>ov.innerText.replace(/\s+/g,' '));
const wait=async(p,re,ms=6000)=>{const t=Date.now();while(Date.now()-t<ms){const s=await txt(p);if(re.test(s))return s;await p.waitForTimeout(150)}return await txt(p)};

console.log('Sin servidor configurado');
{const p=await mk('X',GAME+'?sburl=off');const req=[];p.on('request',r=>{if(!r.url().startsWith(new URL(GAME).origin))req.push(r.url())});
 check('el menú muestra el botón de cuenta',await p.$('#macc')!==null);await p.click('#macc');
 check('avisa de que las cuentas no están activadas',/no están activadas/.test(await txt(p)));await p.click('#bk');
 await p.click('#mplay');await p.waitForTimeout(1500);check('se puede jugar igual sin cuenta',await p.evaluate(()=>run===true));
 check('no hace ninguna petición a internet',req.length===0,req);await p.context().close()}

console.log('Crear cuenta con correo');
const d1=await mk('D1');
await d1.evaluate(()=>{SAVE.coins=123;SAVE.runs=4;save()});
await d1.click('#macc');check('pantalla de entrar',/Entrar/.test(await txt(d1)));
await d1.click('#acsw');await d1.fill('#ace',EM);await d1.fill('#acpw','corta');await d1.fill('#acpw2','corta');await d1.click('#acgo');
check('contraseña corta rechazada',/al menos 8/.test(await txt(d1)));
await d1.fill('#acpw','Secreta123');await d1.fill('#acpw2','Secreta124');await d1.click('#acgo');
check('contraseñas distintas rechazadas',/no coinciden/.test(await txt(d1)));
await d1.fill('#acpw2','Secreta123');await d1.click('#acgo');check('pide la casilla de edad',/casilla de edad/.test(await txt(d1)));
await d1.check('#acage');await d1.click('#acgo');
check('pide confirmar el correo',/Revisa tu correo/.test(await wait(d1,/Revisa tu correo|falla/)));
check('la contraseña no se guarda en claro',sql(`select count(*) from auth.users where email='${EM}' and encrypted_password like '$2%'`)==='1' &&
  sql(`select count(*) from auth.users where encrypted_password like '%Secreta123%'`)==='0');
await d1.click('#bk');await d1.fill('#ace',EM);await d1.fill('#acpw','Secreta123');await d1.click('#acgo');
check('sin confirmar no se puede entrar',/confirmado tu correo/.test(await wait(d1,/confirmado|Algo/)));
await sleep(600);const m1=mails();check('llega el correo de confirmación',m1.length>=1,m1);
const link=linkIn(m1[0]);check('el correo trae el enlace',!!link&&link.includes('/verify'),link);
await d1.goto(link);await d1.waitForTimeout(2500);
let t=await wait(d1,/jugador_/);check('al pulsar el enlace queda dentro con su perfil',/jugador_/.test(t),t.slice(0,160));
check('tiene perfil en la base de datos',sql(`select count(*) from profiles p join auth.users u on u.id=p.id where u.email='${EM}'`)==='1');
await d1.waitForTimeout(800);
check('su progreso de este dispositivo sube a la nube',sql(`select data->>'coins' from saves s join auth.users u on u.id=s.user_id where u.email='${EM}'`)==='123');

console.log('Perfil');
await d1.click('#macc');await wait(d1,/Mi cuenta/);check('pantalla de mi cuenta',/Progreso guardado en la nube/.test(await txt(d1)),await txt(d1));
await d1.click('#aced');await d1.fill('#acun','ab');await d1.click('#acgo');check('nombre corto rechazado',/3 a 16/.test(await txt(d1)));
await d1.fill('#acun','Marco_Prueba');await d1.fill('#acco','es');await d1.check('#acsc');await d1.selectOption('#acvi','friends');
const avs=await d1.$$('[data-av]');if(avs[1])await avs[1].click();await d1.click('#acgo');
t=await wait(d1,/Marco_Prueba/);check('perfil guardado',/Marco_Prueba/.test(t),t.slice(0,100));
check('en el servidor',sql(`select username||country||show_country||visibility from profiles where username='Marco_Prueba'`)==='Marco_PruebaEStruefriends');
// segundo usuario para probar nombre ocupado
sql(`insert into auth.users(id,email,aud,role,instance_id) values (gen_random_uuid(),'otro${Date.now()}@x.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000')`);
sql(`update profiles set username='Ocupado' where username like 'jugador_%' and id <> (select id from profiles where username='Marco_Prueba')`);
await d1.click('#aced');await d1.fill('#acun','ocupado');await d1.click('#acgo');check('nombre ya usado rechazado',/ya lo usa otra persona/.test(await wait(d1,/otra persona|Algo/)));
await d1.click('#bk');

console.log('Guardado en la nube entre dispositivos');
const d2=await mk('D2');await d2.click('#macc');await d2.fill('#ace',EM);await d2.fill('#acpw','mala-clave');await d2.click('#acgo');
check('contraseña incorrecta',/incorrectos/.test(await wait(d2,/incorrectos|Algo/)));
await d2.fill('#acpw','Secreta123');await d2.click('#acgo');t=await wait(d2,/Marco_Prueba/,8000);
check('entra en el otro dispositivo',/Marco_Prueba/.test(t),t.slice(0,120));
check('recibe el progreso de la nube',await d2.evaluate(()=>SAVE.coins)===123);
await d2.evaluate(()=>{SAVE.coins=200;save()});await d2.waitForTimeout(7000);
check('el segundo dispositivo sube su cambio',sql(`select data->>'coins' from saves s join profiles p on p.id=s.user_id where p.username='Marco_Prueba'`)==='200');
await d1.evaluate(()=>{SAVE.coins=50;save()});await d1.waitForTimeout(7000);
t=await txt(d1);check('el primero no pisa el progreso nuevo: pregunta cuál conservar',/Qué progreso conservas/.test(t),t.slice(0,80));
check('...y la nube sigue intacta',sql(`select data->>'coins' from saves s join profiles p on p.id=s.user_id where p.username='Marco_Prueba'`)==='200');
await d1.click('#acc1');await d1.waitForTimeout(500);check('elige el de la nube',await d1.evaluate(()=>SAVE.coins)===200);
check('el guardado de la nube se limpia al cargarlo',await d1.evaluate(()=>typeof SAVE.unl==='object'&&SAVE.v===2));

console.log('Cerrar sesión y recuperar contraseña');
await d2.evaluate(()=>menu());await d2.click('#macc');await wait(d2,/Mi cuenta/);await d2.click('#acout');await d2.waitForTimeout(800);
check('cerrar sesión',/Entra o crea una cuenta/.test(await txt(d2)));
check('el progreso local se queda',await d2.evaluate(()=>SAVE.coins)===200);
await d2.click('#macc');await d2.click('#acfg');await d2.fill('#ace',EM);await d2.click('#acgo');
check('pide el enlace de recuperación',/te hemos enviado un enlace/.test(await wait(d2,/enviado|Algo/)));
await sleep(800);const m2=mails();check('llega el correo de recuperación',m2.length>=2,m2);
await d2.goto(linkIn(m2[m2.length-1]));t=await wait(d2,/Contraseña nueva/,8000);check('el enlace abre la pantalla de contraseña nueva',/Contraseña nueva/.test(t),t.slice(0,80));
await d2.fill('#acpw','NuevaClave99');await d2.fill('#acpw2','NuevaClave99');await d2.click('#acgo');
check('contraseña cambiada',/Contraseña cambiada/.test(await wait(d2,/cambiada|Algo/)));
await d2.waitForTimeout(1200);await d2.click('#bk').catch(()=>{});await d2.evaluate(()=>menu());
await d2.click('#macc');await wait(d2,/Mi cuenta/);await d2.click('#acout');await d2.waitForTimeout(600);
await d2.click('#macc');await d2.fill('#ace',EM);await d2.fill('#acpw','Secreta123');await d2.click('#acgo');
check('la contraseña vieja ya no sirve',/incorrectos/.test(await wait(d2,/incorrectos|Algo/)));
await d2.fill('#acpw','NuevaClave99');await d2.click('#acgo');check('la nueva sí',/Marco_Prueba/.test(await wait(d2,/Marco_Prueba/,8000)));

console.log('Google, Apple y Discord');
const d3=await mk('D3');await d3.click('#macc');await d3.click('#acp_google');await d3.waitForTimeout(1500);
check('Google: abre la página de Google con el identificador del juego',/accounts\.google\.com.*client_id=falso-solo-para-pruebas/.test(d3.__g||''),d3.__g);
await d3.goto(U);await d3.waitForTimeout(600);await d3.click('#macc');await d3.click('#acp_apple');
check('Apple: si no está activado, lo dice claramente',/todavía no está activado/.test(await wait(d3,/activado|Algo/)),await txt(d3));
await d3.click('#acp_discord');await d3.waitForTimeout(1500);check('Discord: abre la página de Discord',/discord\.com/.test(d3.__d||''),d3.__d);

console.log('Datos personales');
await d1.evaluate(()=>menu());await d1.click('#macc');await wait(d1,/Mi cuenta/);
const [dl]=await Promise.all([d1.waitForEvent('download'),d1.click('#acex')]);const pth=await dl.path();const ex=JSON.parse(fs.readFileSync(pth,'utf8'));
check('descargar mis datos',ex.perfil.username==='Marco_Prueba'&&ex.guardado.coins===200,Object.keys(ex));
check('la descarga no incluye la contraseña',!JSON.stringify(ex).includes('encrypted_password'));
await d1.click('#acln');t=await wait(d1,/Métodos de acceso/);check('métodos vinculados: correo',/Correo y contraseña Vinculado/.test(t),t);
await d1.click('#bk');await d1.click('#acdel');await d1.fill('#acun','otro');await d1.click('#acgo');check('borrar pide confirmar el nombre',/no coincide/.test(await txt(d1)));
await d1.fill('#acun','marco_prueba');await d1.click('#acgo');t=await wait(d1,/Cuenta borrada/);check('cuenta borrada',/Cuenta borrada/.test(t),t.slice(0,80));
check('ya no existe en el servidor',sql(`select count(*) from auth.users where email='${EM}'`)==='0'&&sql(`select count(*) from profiles where username='Marco_Prueba'`)==='0');
check('su guardado en la nube se ha borrado',sql(`select count(*) from saves s left join profiles p on p.id=s.user_id where p.id is null`)==='0');
await d2.evaluate(()=>{SAVE.coins=7;save()});await d2.waitForTimeout(7000);
check('el otro dispositivo pierde la sesión y no puede guardar',sql(`select count(*) from saves`)==='0');
check('sin errores de JavaScript',errs.length===0,errs);
console.log(`\n${ok} bien, ${bad} fallos`);await b.close();process.exit(bad?1:0)})();
