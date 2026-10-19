const {chromium}=require('/opt/node-tools/node_modules/playwright');
const U='http://127.0.0.1:8765/game.html?peerhost=127.0.0.1&peerport=9000';
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream']});
const mk=async(n)=>{const c=await b.newContext({viewport:{width:844,height:390}});const p=await c.newPage();p.on('pageerror',e=>console.log(n,'ERR',e.message,e.stack&&e.stack.split('\n')[1]));p.on('console',m=>{if(m.type()==='error')console.log(n,'CON',m.text().slice(0,200))});await p.goto(U);await p.waitForTimeout(800);return p};
const h=await mk('H'),g=await mk('G');
await h.click('#mnet');await h.click('#nmk');await h.waitForTimeout(1500);
const code=(await h.textContent('#ov h1')).replace('Sala ','').trim();console.log('code',code);
await g.click('#mnet');await g.click('#njn');await g.fill('#ncd',code);await g.click('#ngo');await g.waitForTimeout(2500);
console.log('G:',(await g.textContent('#ov')).slice(0,80));console.log('H:',(await h.textContent('#ov')).slice(0,90));
await h.click('#ngo');await h.waitForTimeout(1500);
const st=async(p)=>p.evaluate(()=>({run,on:NET.on,host:NET.host,P:P&&[Math.round(P.x),Math.round(P.y),P.h&&P.h.id,Math.round(P.hp)],oth:NET.pl.map(q=>q&&[Math.round(q.x),Math.round(q.y)]),E:E.length,t:S&&S.t&&S.t.toFixed(1),ov:getComputedStyle(ov).display}));
console.log('H',JSON.stringify(await st(h)));console.log('G',JSON.stringify(await st(g)));
// guest moves right, host moves up
await g.keyboard.down('d');await h.keyboard.down('w');await h.waitForTimeout(3000);await g.keyboard.up('d');await h.keyboard.up('w');
console.log('H',JSON.stringify(await st(h)));console.log('G',JSON.stringify(await st(g)));
await h.screenshot({path:'h1.png'});await g.screenshot({path:'g1.png'});
let bytes=0;await h.evaluate(()=>{window.__b=0;const s=NET.conn.send.bind(NET.conn);NET.conn.send=m=>{window.__b+=JSON.stringify(m).length;s(m)}});
for(let i=0;i<20;i++){const k=['w','a','s','d'][i%4];await g.keyboard.down(k);await h.keyboard.down(['d','s','a','w'][i%4]);await h.waitForTimeout(1000);await g.keyboard.up(k);await h.keyboard.up(['d','s','a','w'][i%4]);
  for(const p of [h,g]){const o=await p.evaluate(()=>getComputedStyle(ov).display!=='none'?ov.innerText.slice(0,60).replace(/\s+/g,' '):'');if(o){console.log(p===h?'H':'G','OV',o);const bt=await p.$('#ov .opt');if(bt&&/Nivel|Cofre/.test(o))await bt.click()}}}
console.log('bytes/s',await h.evaluate(()=>window.__b/20));
console.log('H',JSON.stringify(await st(h)));console.log('G',JSON.stringify(await st(g)));
await h.screenshot({path:'h2.png'});await g.screenshot({path:'g2.png'});
await b.close()})();
