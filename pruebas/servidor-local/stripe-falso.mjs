// Imitación MÍNIMA de Stripe para las pruebas locales (puerto 12111). No cobra nada ni se parece
// a la página real: solo responde como la API de Checkout y manda los avisos firmados (webhooks)
// igual que Stripe, para probar todos los casos (pagado, cancelado, pendiente, fallido, repetido).
import http from 'node:http';
import crypto from 'node:crypto';
const SECRET = 'whsec_solo_pruebas_locales', KEY = 'sk_test_SOLO_PRUEBAS_LOCALES';
const HOOK = process.env.HOOK || 'http://127.0.0.1:54321/functions/v1/stripe-webhook';
const sessions = new Map(), idem = new Map(), log = [];
let fail = 0;
export async function sendEvent(type, s, extra = {}, opts = {}) {
  const ev = { id: opts.id || 'evt_' + crypto.randomBytes(8).toString('hex'), type, data: { object: { ...s, ...extra } } };
  const payload = JSON.stringify(ev), t = opts.t || Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', opts.secret || SECRET).update(`${t}.${payload}`).digest('hex');
  const r = await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
  return { status: r.status, body: await r.text(), id: ev.id };
}
const page = s => `<!doctype html><meta charset="utf-8"><title>Stripe falso</title><body style="font:16px sans-serif;padding:20px">
<h1>Pago de prueba (Stripe falso)</h1><p id="amt">${(s.amount_total / 100).toFixed(2)} €</p>
<form method="post" action="/pay/${s.id}/ok"><button id="pay">Pagar</button></form>
<form method="post" action="/pay/${s.id}/slow"><button id="slow">Pagar por transferencia (lento)</button></form>
<a id="cancel" href="${s.cancel_url}">Cancelar y volver</a></body>`;
http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
    const body = Buffer.concat(chunks).toString(), u = req.url;
    log.push(req.method + ' ' + u);
    if (u === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ log, sessions: [...sessions.values()] })); }
    if (u === '/__fail') { fail = 1; res.writeHead(200); return res.end('ok'); }
    if (u === '/__ok') { fail = 0; res.writeHead(200); return res.end('ok'); }
    if (u.startsWith('/__event')) { // /__event?type=...&session=...&paid=...
      const q = new URL('http://x' + u).searchParams, s = sessions.get(q.get('session'));
      const r = await sendEvent(q.get('type'), s, q.get('ps') ? { payment_status: q.get('ps') } : {}, { id: q.get('id') || undefined, secret: q.get('secret') || undefined, t: q.get('t') ? +q.get('t') : undefined });
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r));
    }
    if (u === '/v1/checkout/sessions' && req.method === 'POST') {
      if (req.headers.authorization !== 'Bearer ' + KEY) { res.writeHead(401); return res.end('{"error":{"message":"Invalid API Key"}}'); }
      if (fail) { res.writeHead(500); return res.end('{"error":{"message":"caido"}}'); }
      const k = req.headers['idempotency-key'];
      if (k && idem.has(k)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(sessions.get(idem.get(k)))); }
      const f = new URLSearchParams(body), id = 'cs_test_' + crypto.randomBytes(10).toString('hex');
      const s = { id, object: 'checkout.session', url: `http://127.0.0.1:12111/pay/${id}`, amount_total: +f.get('line_items[0][price_data][unit_amount]'),
        currency: f.get('line_items[0][price_data][currency]'), client_reference_id: f.get('client_reference_id'),
        metadata: { donation_id: f.get('metadata[donation_id]') }, payment_status: 'unpaid', payment_intent: 'pi_' + id.slice(8),
        success_url: f.get('success_url'), cancel_url: f.get('cancel_url'), mode: f.get('mode'), submit_type: f.get('submit_type'), form: Object.fromEntries(f) };
      sessions.set(id, s); if (k) idem.set(k, id);
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(s));
    }
    let m = u.match(/^\/pay\/(cs_test_\w+)(\/(ok|slow))?$/);
    if (m && sessions.has(m[1])) {
      const s = sessions.get(m[1]);
      if (!m[3]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page(s)); }
      if (m[3] === 'ok') { s.payment_status = 'paid'; await sendEvent('checkout.session.completed', s); }
      else await sendEvent('checkout.session.completed', s, { payment_status: 'unpaid' });
      res.writeHead(303, { location: s.success_url }); return res.end();
    }
    res.writeHead(404); res.end('no');
  });
}).listen(12111, '127.0.0.1', () => console.log('stripe falso en 12111'));
