# KERF

Precision stainless steel puzzles, haptic sliders and kinetic toys, with PayPal checkout.

## Repo layout (upload exactly like this)

```
kerf/
├── wrangler.jsonc     ← Cloudflare settings (PayPal client ID, sandbox/live)
├── .gitignore
├── README.md
├── src/
│   └── index.js       ← Worker: talks to PayPal, sets the real prices
└── public/
    └── index.html     ← the website
```

## 1. Deploy on Cloudflare (Workers)

1. Push these files to your GitHub repo, with `wrangler.jsonc` at the repo root.
2. Cloudflare → Workers & Pages → Create → Import a repository → pick the repo.
3. Project name: `kerf`. Build command: blank. Deploy command: `npx wrangler deploy`.

(This version needs **Workers**, not Pages, because of the PayPal code in `src/index.js`.)

## 2. Add the PayPal secret (required, do this once)

Cloudflare → Workers & Pages → **kerf** → Settings → Variables and Secrets → Add:

- Type: **Secret**
- Name: `PAYPAL_CLIENT_SECRET`
- Value: the **Sandbox Secret** from developer.paypal.com → Apps & Credentials

Never put the secret in any file in GitHub. Secrets stay put between deploys.

## 3. Test with fake money

1. developer.paypal.com → Testing Tools → **Sandbox Accounts**. Use the *Personal* account's email and password.
2. On your site, add something to the cart → Proceed to Checkout → PayPal button → log in with that sandbox personal account → pay.
3. You should see "Payment received". Check the sandbox *Business* account at sandbox.paypal.com to see the money arrive.

## 4. Going live (real money)

1. In PayPal's dashboard, switch to **Live** and copy the Live Client ID and Live Secret.
2. In `wrangler.jsonc`: set `"PAYPAL_ENV": "live"` and paste the Live Client ID. Commit and push.
3. In Cloudflare, replace the `PAYPAL_CLIENT_SECRET` secret with the **Live** secret.

## Changing prices or products

Prices are set in **two** places and must match:
- `public/index.html` → `PRODUCTS` (what the site displays)
- `src/index.js` → `CATALOG` (what PayPal actually charges, in cents)

Same for the `KERF10` promo (`PROMOS` in `src/index.js`) and shipping ($15, free over $100).

## Orders

PayPal emails you every payment with the buyer's name and shipping address. You can also see them at paypal.com → Activity.

## If something breaks
- Site loads unstyled: Cloudflare → your domain → Speed → Optimization → turn **Rocket Loader off**.
- "Payment system failed to load": check `/api/config` on your site shows your client ID.
- "Could not start payment": the secret is missing or wrong. Cloudflare → kerf → Logs shows the exact PayPal error.
