# KANI MARK OIL MILL — Cashfree Payments

Prices (per 1 L): Coconut ₹440 · Groundnut ₹320 · Sesame ₹440 · Castor ₹400.
Edit prices only in the `PRODUCTS` list at the top of `server.js`.

## Run
1. `npm install`
2. Copy `.env.example` to `.env`, add your Cashfree **Sandbox** App ID and Secret Key.
3. `npm start` → http://localhost:5000

## How payment works
Browser sends product + quantity → server prices it and creates a Cashfree order → Cashfree checkout opens → after payment the server asks Cashfree directly if the order is PAID → order saved in `data/orders.json`. A webhook (`/api/webhook`, signature-verified) also records payments if the customer closes the tab.

## Cart, history and owner page
- **Cart:** customers tap *Add to Cart* on any oils, change quantities at `/cart.html`, then check out once for everything. Prices are always calculated on the server.
- **My Orders:** `/history.html` shows each customer's payments (date, items, amount, status, payment ID) for orders placed on their phone/browser.
- **Owner transactions:** open `/admin.html`, enter your `ADMIN_TOKEN` (from `.env`) to see every order with customer details, filter by status, and download a CSV for Excel.
- Raw data is also in `data/orders.json`.

## Webhook (online sites only, https)
Cashfree Dashboard → Developers → Webhooks → add `https://YOUR-DOMAIN/api/webhook`, enable payment success/failed events. Set `SITE_URL` in `.env` to your https domain.

## Going live
Complete Cashfree KYC, generate Production keys, set `CASHFREE_ENV=production`, use HTTPS, and whitelist your server IP if Cashfree asks (Developers → Whitelisted IPs).
