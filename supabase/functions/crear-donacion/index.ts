// Función del servidor "crear-donacion" (Supabase Edge Function).
// El juego pide una donación de X euros; aquí se comprueba la cantidad, se apunta la donación en
// la base de datos como pendiente y se crea la página de pago oficial de Stripe (Checkout).
// El navegador nunca ve la clave secreta de Stripe ni los datos de la tarjeta: paga en la página
// de Stripe y la donación solo pasa a "pagada" cuando llega el aviso firmado (stripe-webhook).
//
// Secretos que hay que poner en Supabase (Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      clave secreta de Stripe (sk_live_... o sk_test_...)
//   ALLOWED_RETURN_URLS    direcciones del juego a las que se puede volver tras pagar,
//                          separadas por comas (por ejemplo https://tu-usuario.github.io/bosque-de-vapor/)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.

const env = (k: string) => (Deno.env.get(k) || '').trim();
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rpc(fn: string, args: Record<string, unknown>) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) {
    let m = t; try { m = JSON.parse(t).message || t; } catch (_) { /* texto tal cual */ }
    throw new Error(m);
  }
  return t ? JSON.parse(t) : null;
}

// Quién dona (si ha entrado con su cuenta). Sin cuenta también se puede donar.
async function userId(req: Request): Promise<string | null> {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok || tok.split('.').length !== 3) return null;
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return typeof u?.id === 'string' && u.role === 'authenticated' ? u.id : null;
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Solo se vuelve a las direcciones del juego apuntadas en ALLOWED_RETURN_URLS (se conservan sus
// parámetros, pero no los de una donación anterior ni el #).
function allowedReturn(u: string): URL | null {
  let url: URL;
  try { url = new URL(u); } catch (_) { return null; }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
  const list = env('ALLOWED_RETURN_URLS').split(',').map(s => s.trim()).filter(Boolean);
  const clean = url.origin + url.pathname;
  if (!list.some(a => clean === a || clean.startsWith(a.endsWith('/') ? a : a + '/'))) return null;
  url.hash = ''; url.searchParams.delete('donacion'); url.searchParams.delete('resultado');
  return url;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'METODO_NO_VALIDO' });
  if (!env('STRIPE_SECRET_KEY') || !env('ALLOWED_RETURN_URLS')) return json(503, { error: 'DONACIONES_NO_CONFIGURADAS' });
  let body: { amount_cents?: unknown; return_url?: unknown };
  try { body = await req.json(); } catch (_) { return json(400, { error: 'PETICION_NO_VALIDA' }); }
  const cents = Number(body.amount_cents);
  if (!Number.isInteger(cents) || cents < 100 || cents > 50000) return json(400, { error: 'CANTIDAD_NO_VALIDA' });
  const ret = allowedReturn(String(body.return_url || ''));
  if (!ret) return json(400, { error: 'DIRECCION_NO_PERMITIDA' });

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ipHash = ip ? await sha256('bdv-donaciones:' + ip) : null;
  let id: string;
  try { id = await rpc('donation_create', { p_amount_cents: cents, p_user: await userId(req), p_ip_hash: ipHash }); }
  catch (e) {
    const m = String((e as Error).message);
    return json(m.includes('DEMASIADAS_PETICIONES') ? 429 : 400, { error: m.includes('DEMASIADAS_PETICIONES') ? 'DEMASIADAS_PETICIONES' : 'NO_SE_PUDO_CREAR' });
  }

  const back = (res: string) => { const b = new URL(ret); b.searchParams.set('donacion', id); b.searchParams.set('resultado', res); return b.toString(); };
  const f = new URLSearchParams({
    mode: 'payment',
    submit_type: 'donate',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(cents),
    'line_items[0][price_data][product_data][name]': 'Apoyo voluntario a Bosque de Vapor',
    'line_items[0][price_data][product_data][description]': 'Donación voluntaria. No desbloquea nada en el juego.',
    client_reference_id: id,
    'metadata[donation_id]': id,
    'payment_intent_data[metadata][donation_id]': id,
    success_url: back('ok'),
    cancel_url: back('cancelada'),
  });
  const r = await fetch(`${env('STRIPE_API_BASE') || 'https://api.stripe.com'}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `donacion-${id}`,   // si se repite la petición, Stripe no crea otra sesión
    },
    body: f.toString(),
  }).catch(() => null);
  const s = r && r.ok ? await r.json().catch(() => null) : null;
  if (!s || typeof s.id !== 'string' || typeof s.url !== 'string') {
    await rpc('donation_fail_create', { p_id: id }).catch(() => {});
    return json(502, { error: 'STRIPE_NO_DISPONIBLE', id });
  }
  await rpc('donation_set_session', { p_id: id, p_session: s.id });
  return json(200, { id, url: s.url });
}

Deno.serve(handler);
