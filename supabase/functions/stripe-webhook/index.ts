// Función del servidor "stripe-webhook" (Supabase Edge Function).
// Stripe la llama cuando cambia el estado de un pago. Solo se acepta un aviso con la firma
// correcta (STRIPE_WEBHOOK_SECRET); así nadie puede marcar una donación como pagada desde fuera.
// Cada aviso se procesa una sola vez (Stripe puede repetirlos) y una donación pagada no vuelve atrás.
//
// En Supabase esta función debe desplegarse con "Verify JWT" desactivado: Stripe no tiene sesión;
// la seguridad la da la firma.
//
// Secretos: STRIPE_WEBHOOK_SECRET (whsec_...). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

const env = (k: string) => (Deno.env.get(k) || '').trim();
const TOLERANCE = 300; // segundos: un aviso viejo (o copiado) se rechaza
const text = (status: number, t: string) => new Response(t, { status, headers: { 'Content-Type': 'text/plain' } });

function hex(buf: ArrayBuffer) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function verify(payload: string, header: string, secret: string, now = Date.now() / 1000) {
  const parts = header.split(',').map(p => p.trim().split('='));
  const t = Number(parts.find(p => p[0] === 't')?.[1]);
  const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1] || '');
  if (!Number.isFinite(t) || !sigs.length || Math.abs(now - t) > TOLERANCE) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some(s => same(s, mac));
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return text(405, 'metodo');
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret) return text(503, 'no configurado');
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('stripe-signature') || '', secret))) return text(400, 'firma no valida');
  let ev: any;
  try { ev = JSON.parse(payload); } catch (_) { return text(400, 'json'); }
  const s = ev?.data?.object || {};
  let status: string | null = null;
  switch (ev.type) {
    case 'checkout.session.completed':
      // Con tarjeta llega ya pagado; con métodos lentos (transferencia...) llega "unpaid" y se espera.
      status = s.payment_status === 'paid' || s.payment_status === 'no_payment_required' ? 'paid' : 'pending'; break;
    case 'checkout.session.async_payment_succeeded': status = 'paid'; break;
    case 'checkout.session.async_payment_failed': status = 'failed'; break;
    case 'checkout.session.expired': status = 'expired'; break;
    default: return text(200, 'ignorado');
  }
  if (s.object !== 'checkout.session' || typeof s.id !== 'string') return text(400, 'objeto');
  const don = s.metadata?.donation_id || s.client_reference_id || null;
  try {
    const r = await rpc('donation_apply_event', {
      p_event_id: String(ev.id), p_kind: String(ev.type), p_session: s.id,
      p_donation: typeof don === 'string' && /^[0-9a-f-]{36}$/.test(don) ? don : null,
      p_status: status, p_amount_cents: Number.isInteger(s.amount_total) ? s.amount_total : null,
      p_currency: typeof s.currency === 'string' ? s.currency : null,
      p_payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : null,
    });
    return text(200, String(r));
  } catch (_) {
    return text(500, 'error'); // Stripe lo reintentará
  }
}

Deno.serve(handler);
