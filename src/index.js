/**
 * KERF Worker
 * - Serves the static site from /public
 * - /api/config                 -> public PayPal client ID for the browser
 * - /api/orders                 -> creates a PayPal order (prices set HERE, never trusted from the browser)
 * - /api/orders/:id/capture     -> captures the payment after the buyer approves
 *
 * Settings (Cloudflare dashboard -> kerf -> Settings -> Variables and Secrets):
 *   PAYPAL_CLIENT_ID      (variable, also in wrangler.jsonc)
 *   PAYPAL_ENV            "sandbox" or "live"
 *   PAYPAL_CLIENT_SECRET  (SECRET - never commit this)
 */

// Source of truth for prices, in cents. Keep in sync with PRODUCTS in index.html.
const CATALOG = {
  'p1':           { name: 'The Aegis Core',             cents: 14900 },
  'p2':           { name: 'Hyperion Haptic Slider',     cents: 11900 },
  'p3':           { name: 'Orbital V2 Kinetic Spinner', cents: 8900  },
  'p4':           { name: 'Prism Micro-Lock',           cents: 17500 },
  'bundle-vault': { name: "Master Collector's Chest",   cents: 42500 },
};

const PROMOS = { KERF10: 10 };          // percent off
const FREE_SHIPPING_CENTS = 10000;      // $100
const SHIPPING_CENTS = 1500;            // $15
const MAX_QTY = 20;

const apiBase = (env) =>
  env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const usd = (cents) => (cents / 100).toFixed(2);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function getAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured');
  }
  const res = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  return (await res.json()).access_token;
}

/** Turns [{id, qty}] from the browser into a PayPal purchase unit using server prices. */
function buildPurchaseUnit(body) {
  const lines = Array.isArray(body?.items) ? body.items : [];
  if (lines.length === 0 || lines.length > 10) throw new Error('Cart is empty or invalid');

  const merged = {};
  for (const line of lines) {
    const product = CATALOG[line?.id];
    const qty = Number(line?.qty);
    if (!product || !Number.isInteger(qty) || qty < 1) throw new Error('Cart contains an invalid item');
    merged[line.id] = (merged[line.id] || 0) + qty;
  }

  const items = Object.entries(merged).map(([id, qty]) => {
    if (qty > MAX_QTY) throw new Error(`Maximum ${MAX_QTY} of each item per order`);
    return {
      name: CATALOG[id].name,
      sku: id,
      quantity: String(qty),
      unit_amount: { currency_code: 'USD', value: usd(CATALOG[id].cents) },
      category: 'PHYSICAL_GOODS',
    };
  });

  const itemTotal = Object.entries(merged).reduce((s, [id, qty]) => s + CATALOG[id].cents * qty, 0);
  const promo = String(body?.promo || '').trim().toUpperCase();
  const discount = PROMOS[promo] ? Math.round(itemTotal * PROMOS[promo] / 100) : 0;
  const afterDiscount = itemTotal - discount;
  const shipping = afterDiscount >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS;
  const total = afterDiscount + shipping;

  return {
    description: 'KERF order',
    items,
    amount: {
      currency_code: 'USD',
      value: usd(total),
      breakdown: {
        item_total: { currency_code: 'USD', value: usd(itemTotal) },
        shipping:   { currency_code: 'USD', value: usd(shipping) },
        discount:   { currency_code: 'USD', value: usd(discount) },
      },
    },
  };
}

async function createOrder(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  let unit;
  try { unit = buildPurchaseUnit(body); } catch (e) { return json({ error: e.message }, 400); }

  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [unit],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'KERF',
            shipping_preference: 'GET_FROM_FILE',   // buyer picks/enters shipping address in PayPal
            user_action: 'PAY_NOW',
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Create order failed', JSON.stringify(data));
    return json({ error: 'Could not start payment' }, 502);
  }
  return json({ id: data.id });
}

async function captureOrder(orderId, env) {
  if (!/^[A-Z0-9]{5,40}$/.test(orderId)) return json({ error: 'Invalid order' }, 400);

  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();

  if (!res.ok) {
    const issue = data?.details?.[0]?.issue;
    console.error('Capture failed', JSON.stringify(data));
    return json({ error: 'Payment was not completed', issue }, 422);
  }

  const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
  return json({
    status: data.status,
    captureId: capture?.id,
    payerName: data?.payer?.name?.given_name || '',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/config' && request.method === 'GET') {
        return json({ clientId: env.PAYPAL_CLIENT_ID, env: env.PAYPAL_ENV || 'sandbox' });
      }
      if (path === '/api/orders' && request.method === 'POST') {
        return await createOrder(request, env);
      }
      const m = path.match(/^\/api\/orders\/([^/]+)\/capture$/);
      if (m && request.method === 'POST') {
        return await captureOrder(decodeURIComponent(m[1]), env);
      }
      if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Payment service error. You have not been charged.' }, 500);
    }

    // Everything else: the website
    return env.ASSETS.fetch(request);
  },
};
