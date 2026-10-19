// Ejecuta en Node las funciones del servidor de supabase/functions (escritas para Deno, sin
// dependencias) para las pruebas locales. Uso: node funciones.mjs  (puerto 54330)
import http from 'node:http';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const service = execSync(`cd ${here} && . ./gotrue.env.sh && node gateway.js service`, { shell: '/bin/bash' }).toString().trim();
const ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: service,
  STRIPE_API_BASE: 'http://127.0.0.1:12111',          // Stripe falso de stripe-falso.mjs
  STRIPE_SECRET_KEY: 'sk_test_SOLO_PRUEBAS_LOCALES',  // no es una clave real
  STRIPE_WEBHOOK_SECRET: 'whsec_solo_pruebas_locales',
  ALLOWED_RETURN_URLS: 'http://127.0.0.1:8766/www/,http://localhost:8766/www/',
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('FN_')).map(([k, v]) => [k.slice(3), v])),
};
const handlers = {};
let current = null;
globalThis.Deno = { env: { get: k => ENV[k] }, serve: h => { handlers[current] = h; } };
for (const n of ['crear-donacion', 'stripe-webhook']) {
  current = n;
  await import(path.join(here, '..', '..', 'supabase', 'functions', n, 'index.ts'));
}
http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
    const name = req.url.split('?')[0].replace(/^\//, '');
    const h = handlers[name];
    if (!h) { res.writeHead(404); return res.end('no'); }
    const body = Buffer.concat(chunks);
    const r = await h(new Request('http://fn' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
}).listen(54330, '127.0.0.1', () => console.log('funciones en 54330'));
