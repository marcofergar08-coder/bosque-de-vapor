// Pasarela local que imita Supabase para las pruebas: /auth/v1 va al servidor de
// cuentas real (GoTrue) y /rest/v1/rpc ejecuta las funciones como hace PostgREST
// (rol y identidad sacados del token firmado).
const http = require('http'), crypto = require('crypto'), { Pool } = require('pg');
const SECRET = process.env.GOTRUE_JWT_SECRET;
const pool = new Pool({ host: '/tmp/pg', port: 5433, user: 'postgres', database: process.env.DB || 'sbe2e' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(p) { const h = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(p); return h + '.' + crypto.createHmac('sha256', SECRET).update(h).digest('base64url'); }
function verify(t) {
  const [h, p, s] = String(t || '').split('.');
  if (!s) return null;
  const ok = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  if (ok.length !== s.length || !crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(s))) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url'));
  if (c.exp && c.exp < Date.now() / 1000) return null;
  return c;
}
const ANON = sign({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 2000000000 });
if (process.argv[2] === 'anon') { console.log(ANON); process.exit(0); }
if (process.argv[2] === 'service') { console.log(sign({ role: 'service_role', iss: 'supabase', iat: 1700000000, exp: 2000000000 })); process.exit(0); }
const log = [];
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}
http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
    const body = Buffer.concat(chunks);
    if (req.url === '/__log') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(log)); }
    log.push(req.method + ' ' + req.url.split('?')[0]);
    const open = /^\/auth\/v1\/(verify|callback|authorize)\b/.test(req.url) && req.method === 'GET';
    if (!open && req.headers.apikey !== ANON) { res.writeHead(401); return res.end('{"message":"Invalid API key"}'); }
    if (req.url.startsWith('/auth/v1/')) {
      const h = { ...req.headers }; delete h.host;
      const up = http.request({ host: '127.0.0.1', port: 9999, path: req.url.slice(8), method: req.method, headers: h }, r => {
        const hh = { ...r.headers }; delete hh['access-control-allow-origin'];
        res.writeHead(r.statusCode, hh); r.pipe(res);
      });
      up.on('error', e => { res.writeHead(502); res.end(String(e)); });
      return up.end(body);
    }
    const m = req.url.match(/^\/rest\/v1\/rpc\/([a-z_]+)(\?.*)?$/);
    if (!m || !['POST', 'GET'].includes(req.method)) { res.writeHead(404); return res.end('{"message":"no"}'); }
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '') || ANON;
    const c = verify(tok);
    if (!c) { res.writeHead(401); return res.end('{"code":"PGRST301","message":"JWT inválido"}'); }
    const role = c.role === 'authenticated' ? 'authenticated' : 'anon';
    let args = {}; try { args = body.length ? JSON.parse(body) : {}; } catch (e) { }
    const keys = Object.keys(args).filter(k => /^p_[a-z_]+$/.test(k));
    const vals = keys.map(k => args[k] === null ? null : typeof args[k] === 'object' ? JSON.stringify(args[k]) : String(args[k]));
    const sql = `select to_jsonb(public."${m[1]}"(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')})) as r`;
    const cl = await pool.connect();
    try {
      await cl.query('begin');
      await cl.query(`set local role ${role}`);
      await cl.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(c)]);
      const r = await cl.query(sql, vals);
      await cl.query('commit');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.rows[0].r));
    } catch (e) {
      await cl.query('rollback').catch(() => { });
      res.writeHead(e.code === '42501' ? 403 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null }));
    } finally { cl.release(); }
  });
}).listen(54321, '127.0.0.1', () => console.log('pasarela en 54321'));
