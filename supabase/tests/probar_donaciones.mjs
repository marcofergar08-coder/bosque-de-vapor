// Donaciones de principio a fin con la base de datos local, las funciones del servidor de
// supabase/functions y un Stripe falso (pruebas/servidor-local/stripe-falso.mjs) que firma los
// avisos igual que Stripe. Necesita la pasarela (54321), funciones.mjs (54330) y stripe-falso (12111).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), SBD = path.join(here, '..', '..', 'pruebas', 'servidor-local');
const key = k => execSync(`cd ${SBD} && . ./gotrue.env.sh && node gateway.js ${k}`, { shell: '/bin/bash' }).toString().trim();
const ANON = key('anon'), SERVICE = key('service'), API = 'http://127.0.0.1:54321', ST = 'http://127.0.0.1:12111';
const DB = process.env.DB || 'sbe2e';
const sql = q => execSync(`psql -h /tmp/pg -p 5433 -U postgres -d ${DB} -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
let ok = 0, bad = 0; const check = (n, c, x) => { if (c) { ok++; console.log('  ok   ', n) } else { bad++; console.log('  FALLO', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)) } };
const ENV = { SUPABASE_URL: API, SUPABASE_SERVICE_ROLE_KEY: SERVICE, STRIPE_API_BASE: ST };
const H = {}; let cur;
globalThis.Deno = { env: { get: k => ENV[k] }, serve: h => { H[cur] = h } };
for (const n of ['crear-donacion', 'stripe-webhook']) { cur = n; await import(path.join(here, '..', 'functions', n, 'index.ts')); }
let ipn = 1;
const crear = async (body, tok, ip) => { const r = await H['crear-donacion'](new Request('http://fn/crear-donacion', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip || `10.0.0.${ipn++}`, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, j: await r.json() } };
const rpc = async (f, a, tok = ANON) => { const r = await fetch(`${API}/rest/v1/rpc/${f}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  return { status: r.status, j: await r.json().catch(() => null) } };
const ev = async (type, session, q = {}) => (await fetch(`${ST}/__event?` + new URLSearchParams({ type, session, ...q }))).json();
const stLog = async () => (await fetch(ST + '/__log')).json();
const st = id => sql(`select status from donations where id='${id}'`);
import crypto from 'node:crypto';
const signed = async evo => { const p = JSON.stringify(evo), t = Math.floor(Date.now() / 1000), sg = crypto.createHmac('sha256', 'whsec_solo_pruebas_locales').update(`${t}.${p}`).digest('hex');
  const rr = await fetch(API + '/functions/v1/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sg}` }, body: p }); return { status: rr.status, body: await rr.text() } };
const RET = 'http://127.0.0.1:8766/www/index.html';
sql('delete from donations'); sql('delete from donation_events'); sql("delete from security_events where kind like 'donacion%'");

console.log('Sin configurar');
let r = await crear({ amount_cents: 500, return_url: RET });
check('sin claves de Stripe no se puede donar (y lo dice)', r.status === 503 && r.j.error === 'DONACIONES_NO_CONFIGURADAS', r);
const wh0 = await H['stripe-webhook'](new Request('http://fn/stripe-webhook', { method: 'POST', body: '{}' }));
check('el aviso tampoco funciona sin su secreto', wh0.status === 503);
check('no se ha creado ninguna donación', sql('select count(*) from donations') === '0');
Object.assign(ENV, { STRIPE_SECRET_KEY: 'sk_test_SOLO_PRUEBAS_LOCALES', STRIPE_WEBHOOK_SECRET: 'whsec_solo_pruebas_locales', ALLOWED_RETURN_URLS: 'http://127.0.0.1:8766/www/' });

console.log('Comprobaciones de la petición');
for (const [a, n] of [[50, '0,50 €'], [50001, '500,01 €'], [250.5, 'con decimales de céntimo'], ['abc', 'texto'], [null, 'vacía']])
  check(`cantidad rechazada: ${n}`, (r = await crear({ amount_cents: a, return_url: RET })).status === 400 && r.j.error === 'CANTIDAD_NO_VALIDA', r);
check('dirección de vuelta de otra web rechazada', (r = await crear({ amount_cents: 500, return_url: 'https://malvado.example/www/' })).status === 400 && r.j.error === 'DIRECCION_NO_PERMITIDA', r);
check('dirección parecida rechazada', (r = await crear({ amount_cents: 500, return_url: 'http://127.0.0.1:8766/wwwx/' })).status === 400, r);
check('nada creado por peticiones malas', sql('select count(*) from donations') === '0');

console.log('Donación con tarjeta (sin cuenta)');
r = await crear({ amount_cents: 500, return_url: RET + '?x=1#y' });
check('crea la página de pago de Stripe', r.status === 200 && /^http:\/\/127\.0\.0\.1:12111\/pay\/cs_test_/.test(r.j.url) && r.j.id, r);
const d1 = r.j.id; let L = await stLog(); const s1 = L.sessions.find(s => s.metadata.donation_id === d1);
check('a Stripe le llega la cantidad, en euros y como donación', s1 && s1.amount_total === 500 && s1.currency === 'eur' && s1.submit_type === 'donate' && s1.mode === 'payment', s1);
check('vuelve al juego con el identificador (conserva sus parámetros, quita el #)', s1.success_url === `${RET}?x=1&donacion=${d1}&resultado=ok` && s1.cancel_url === `${RET}?x=1&donacion=${d1}&resultado=cancelada`, s1);
check('la respuesta no lleva ninguna clave', !JSON.stringify(r.j).includes('sk_') && !JSON.stringify(r.j).includes('whsec'));
check('queda pendiente en la base de datos, sin usuario', sql(`select status||':'||coalesce(user_id::text,'-')||':'||(stripe_session_id='${s1.id}') from donations where id='${d1}'`) === 'pending:-:true');
check('el juego la ve pendiente', (await rpc('get_donation', { p_id: d1 })).j.status === 'pending');
check('volver de Stripe sin el aviso NO la marca como pagada', st(d1) === 'pending');
console.log('Avisos falsos');
check('firma con otro secreto: rechazado', (await ev('checkout.session.completed', s1.id, { ps: 'paid', secret: 'whsec_otro' })).status === 400);
check('aviso viejo (copiado): rechazado', (await ev('checkout.session.completed', s1.id, { ps: 'paid', t: String(Math.floor(Date.now() / 1000) - 3600) })).status === 400);
const raw = await fetch(API + '/functions/v1/stripe-webhook', { method: 'POST', body: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', data: { object: { ...s1, payment_status: 'paid' } } }) });
check('sin firma: rechazado', raw.status === 400);
check('sigue pendiente', st(d1) === 'pending');
check('el navegador no puede marcarla pagada por su cuenta', (await rpc('donation_apply_event', { p_event_id: 'e', p_kind: 'k', p_session: s1.id, p_donation: d1, p_status: 'paid', p_amount_cents: 500, p_currency: 'eur', p_payment_intent: null })).status === 403 && st(d1) === 'pending');
check('ni crear donaciones saltándose la función', (await rpc('donation_create', { p_amount_cents: 500, p_user: null, p_ip_hash: null })).status === 403);
console.log('Pago confirmado por Stripe');
let e1 = await ev('checkout.session.completed', s1.id, { ps: 'paid', id: 'evt_pagado_1' });
check('con el aviso firmado pasa a pagada', e1.status === 200 && e1.body === 'paid' && st(d1) === 'paid', e1);
check('el juego la ve pagada', (await rpc('get_donation', { p_id: d1 })).j.status === 'paid');
e1 = await ev('checkout.session.completed', s1.id, { ps: 'paid', id: 'evt_pagado_1' });
check('el mismo aviso repetido no hace nada', e1.status === 200 && e1.body === 'repetido', e1);
e1 = await ev('checkout.session.expired', s1.id);
check('una pagada no vuelve atrás', e1.body === 'ya_pagada' && st(d1) === 'paid', e1);
check('cancelar después no la cambia', (await rpc('cancel_donation', { p_id: d1 })).j.status === 'paid');
check('se apunta una sola vez', sql(`select count(*) from security_events where kind='donacion_pagada'`) === '1');

console.log('Con cuenta, cancelada, pendiente, fallida y caducada');
const T = Date.now(); const u = await (await fetch(API + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `don${T}@p.local`, password: 'Clave12345', email_confirm: true }) })).json();
const tok = (await (await fetch(API + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `don${T}@p.local`, password: 'Clave12345' }) })).json()).access_token;
r = await crear({ amount_cents: 2000, return_url: RET }, tok);
check('con cuenta se guarda quién dona', r.status === 200 && sql(`select user_id from donations where id='${r.j.id}'`) === u.id, r);
r = await crear({ amount_cents: 1000, return_url: RET }, 'a.b.c');
check('un token falso dona como anónimo', r.status === 200 && sql(`select coalesce(user_id::text,'-') from donations where id='${r.j.id}'`) === '-');
r = await crear({ amount_cents: 1000, return_url: RET }); const d2 = r.j.id;
check('cancelar: el juego deja de esperar', (await rpc('cancel_donation', { p_id: d2 })).j.status === 'canceled');
L = await stLog(); const s2 = L.sessions.find(s => s.metadata.donation_id === d2);
e1 = await ev('checkout.session.completed', s2.id, { ps: 'paid' });
check('si al final Stripe sí lo cobra, cuenta como pagada', e1.body === 'paid' && st(d2) === 'paid', e1);
r = await crear({ amount_cents: 700, return_url: RET }); const d3 = r.j.id; L = await stLog(); const s3 = L.sessions.find(s => s.metadata.donation_id === d3);
e1 = await ev('checkout.session.completed', s3.id, { ps: 'unpaid' });
check('pago lento (transferencia): sigue pendiente', e1.body === 'pending' && st(d3) === 'pending', e1);
e1 = await ev('checkout.session.async_payment_failed', s3.id);
check('si el pago lento falla: fallida', e1.body === 'failed' && st(d3) === 'failed', e1);
r = await crear({ amount_cents: 900, return_url: RET }); const d4 = r.j.id; L = await stLog(); const s4 = L.sessions.find(s => s.metadata.donation_id === d4);
await ev('checkout.session.completed', s4.id, { ps: 'unpaid' }); e1 = await ev('checkout.session.async_payment_succeeded', s4.id);
check('si el pago lento llega: pagada', e1.body === 'paid' && st(d4) === 'paid', e1);
r = await crear({ amount_cents: 300, return_url: RET }); const d5 = r.j.id; L = await stLog(); const s5 = L.sessions.find(s => s.metadata.donation_id === d5);
check('sesión caducada: caducada', (await ev('checkout.session.expired', s5.id)).body === 'expired' && st(d5) === 'expired');
r = await crear({ amount_cents: 300, return_url: RET }); const d6 = r.j.id; L = await stLog(); const s6 = L.sessions.find(s => s.metadata.donation_id === d6);
const e2 = await signed({ id: 'evt_cant2', type: 'checkout.session.completed', data: { object: { ...s6, amount_total: 1, payment_status: 'paid' } } });
check('un aviso con otra cantidad no cuenta', e2.body === 'cantidad_distinta' && st(d6) === 'pending', e2);
const e3 = await signed({ id: 'evt_ajena', type: 'checkout.session.completed', data: { object: { ...s6, id: 'cs_test_no_existe', metadata: {}, client_reference_id: null, payment_status: 'paid' } } });
check('aviso de una sesión que no es nuestra: se ignora sin error', e3.status === 200 && e3.body === 'desconocida' && st(d6) === 'pending', e3);
const e4 = await signed({ id: 'evt_otro', type: 'payment_intent.created', data: { object: {} } });
check('otros avisos de Stripe se aceptan y se ignoran', e4.status === 200 && e4.body === 'ignorado', e4);
console.log('Fallos y abusos');
await fetch(ST + '/__fail'); r = await crear({ amount_cents: 500, return_url: RET });
check('si Stripe no responde, se dice y la donación queda fallida', r.status === 502 && r.j.error === 'STRIPE_NO_DISPONIBLE' && st(r.j.id) === 'failed', r);
await fetch(ST + '/__ok');
let lim = 0; for (let i = 0; i < 10; i++) { r = await crear({ amount_cents: 100, return_url: RET }, null, '10.9.9.9'); if (r.status === 429) lim++ }
check('muchas peticiones seguidas desde el mismo sitio: se frenan', lim === 2, lim);
check('get_donation no enseña quién dona ni los datos de Stripe', Object.keys((await rpc('get_donation', { p_id: d1 })).j).sort().join() === 'amount_cents,currency,paid_at,status');
check('identificador inventado: nada', (await rpc('get_donation', { p_id: '00000000-0000-0000-0000-000000000000' })).j === null);
check('la base de datos no tiene campos de tarjeta', sql(`select count(*) from information_schema.columns where table_name='donations' and column_name ~ '(card|tarjeta|cvc|pan|iban|email)'`) === '0');
console.log(`\n${ok} bien, ${bad} fallos`); process.exit(bad ? 1 : 0);
