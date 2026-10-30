# KERF

Precision stainless steel puzzles, haptic sliders and kinetic toys.

## Repo layout (upload exactly like this)

```
kerf/
├── wrangler.jsonc     ← tells Cloudflare where the site is
├── README.md
└── public/
    └── index.html     ← the whole website
```

## Deploy on Cloudflare

**Option A: Workers (current Cloudflare default)**
1. Push these files to a GitHub repo (e.g. `kerf`), with `wrangler.jsonc` at the repo root.
2. Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick the repo.
3. Project name: `kerf`. Build command: leave blank. Deploy command: `npx wrangler deploy`.
4. Deploy. The site is live at `kerf.<your-subdomain>.workers.dev`.

**Option B: Pages**
1. Workers & Pages → Create → Pages → Connect to Git → pick the repo.
2. Framework preset: None. Build command: blank. Build output directory: `public`.
3. Save and Deploy.

## If it still looks broken
- Cloudflare dashboard → your domain → Speed → Optimization → turn **Rocket Loader off** (the scripts are also tagged to skip it).
- Make sure the file is named `index.html` (lowercase) inside `public/`.

## Editing
- Products: `PRODUCTS` array near the bottom of `index.html`.
- Reviews: add real ones to the `REVIEWS` array.
- Checkout and newsletter forms have `TODO` comments where a real payment/email service (Stripe, Shopify, Formspree, etc.) plugs in.
