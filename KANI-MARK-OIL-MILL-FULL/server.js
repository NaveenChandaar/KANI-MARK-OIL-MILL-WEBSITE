require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const APP_ID = (process.env.CASHFREE_APP_ID || "").trim();
const SECRET = (process.env.CASHFREE_SECRET_KEY || "").trim();
const ENV = (process.env.CASHFREE_ENV || "sandbox").trim().toLowerCase() === "production" ? "production" : "sandbox";
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
const PORT = process.env.PORT || 5000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).trim().replace(/\/+$/, "");
const DB = process.env.DATA_FILE || path.join(__dirname, "data", "orders.json");

if (!APP_ID || !SECRET || APP_ID.includes("YOUR") || SECRET.includes("YOUR")) {
  console.error("\n[!] Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env (copy .env.example) and restart.\n");
  process.exit(1);
}
const CF = ENV === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
async function cf(method, p, body) {
  const r = await fetch(CF + p, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "x-client-id": APP_ID, "x-client-secret": SECRET, "x-api-version": "2023-08-01", "Content-Type": "application/json" }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || "Cashfree HTTP " + r.status); e.detail = j; throw e; }
  return j;
}

// ---- Product catalogue: the ONLY source of prices (₹ per 1 L) ----
const PRODUCTS = [
  { id: "coconut",   name: "Coconut Oil",   tamil: "தேங்காய் எண்ணெய்", emoji: "🥥", price: 440 },
  { id: "groundnut", name: "Groundnut Oil", tamil: "கடலை எண்ணெய்",     emoji: "🥜", price: 320 },
  { id: "sesame",    name: "Sesame Oil",    tamil: "எள்ளெண்ணெய்",      emoji: "🌿", price: 440 },
  { id: "castor",    name: "Castor Oil",    tamil: "ஆமணக்கு எண்ணெய்",   emoji: "🌱", price: 400 }
];
const MAX_QTY = 10;

// ---- Order store (JSON file, synchronous writes = no race conditions) ----
let orders = {};
try { orders = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
function save() {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB + ".tmp", JSON.stringify(orders, null, 2));
  fs.renameSync(DB + ".tmp", DB);
}
function markPaid(id, paymentId, via) {
  const o = orders[id];
  if (!o) return null;
  if (o.status !== "paid") { Object.assign(o, { status: "paid", paymentId, paidVia: via, paidAt: new Date().toISOString() }); save(); }
  return o;
}
function markFailed(id, reason) {
  const o = orders[id];
  if (o && o.status === "created") { Object.assign(o, { status: "failed", failure: reason }); save(); }
}

// ---- Helpers ----
const sha = d => crypto.createHash("sha256").update(String(d)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const sigOk = (secret, data, sig) =>
  typeof sig === "string" && same(crypto.createHmac("sha256", secret).update(data).digest("hex"), sig);

function limiter(max, windowMs = 60000) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(); let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    if (++h.n > max) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

function validateCustomer(c = {}) {
  const t = v => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B-\u001F]/g, "").trim() : "");
  const name = t(c.name).replace(/\s+/g, " ");
  const email = t(c.email).toLowerCase();
  let mobile = t(c.mobile).replace(/[\s\-()]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  const address = t(c.address).replace(/[ \t]+/g, " ");
  if (name.length < 2 || name.length > 80) return { error: "Please enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return { error: "Please enter a valid email." };
  if (!/^[6-9]\d{9}$/.test(mobile)) return { error: "Please enter a valid 10-digit mobile number." };
  if (address.length < 10 || address.length > 300) return { error: "Please enter your full delivery address." };
  return { value: { name, email, mobile, address } };
}

// ---- App ----
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY);
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin" });
  next();
});

// Webhook needs the RAW body for signature checking, so it is registered before express.json()
app.post("/api/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  const sig = req.get("x-webhook-signature"), ts = req.get("x-webhook-timestamp");
  if (!Buffer.isBuffer(req.body) || !sig || !ts) return res.status(400).json({ error: "Bad request" });
  const raw = req.body.toString("utf8");
  const expected = crypto.createHmac("sha256", SECRET).update(ts + raw).digest("base64");
  if (!same(expected, sig)) return res.status(400).json({ error: "Invalid signature" });
  try {
    const ev = JSON.parse(raw), d = ev.data || {};
    const o = orders[d.order && d.order.order_id];
    if (!o) return res.json({ received: true });
    if (ev.type === "PAYMENT_SUCCESS_WEBHOOK") {
      if (Number(d.payment && d.payment.payment_amount) !== o.amountRupees) console.error("AMOUNT MISMATCH", o.orderId);
      else markPaid(o.orderId, String(d.payment.cf_payment_id || ""), "webhook");
    } else if (ev.type === "PAYMENT_FAILED_WEBHOOK") {
      markFailed(o.orderId, (d.error_details && d.error_details.error_description) || "Payment failed");
    }
    res.json({ received: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Webhook error" }); }
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/products", (req, res) => res.json(PRODUCTS));
app.get("/api/config", (req, res) => res.json({ mode: ENV }));

// ---- Orders: multi-item cart, status refresh, history ----
const itemsOf = o => o.items || [{ productId: o.productId, name: o.productName, unitPrice: o.unitPrice, quantity: o.quantity }];
const publicOrder = o => ({
  orderId: o.orderId, createdAt: o.createdAt, status: o.status, amount: o.amountRupees,
  paymentId: o.paymentId || "", paidAt: o.paidAt || "",
  items: itemsOf(o).map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice }))
});

// Ask Cashfree directly whether an unpaid order has been paid - never trust the browser
async function refresh(o) {
  if (o.status === "paid") return;
  try {
    const c = await cf("GET", "/orders/" + encodeURIComponent(o.orderId));
    if (c.order_status !== "PAID") return;
    if (Number(c.order_amount) !== o.amountRupees) return console.error("AMOUNT MISMATCH", o.orderId);
    const pays = await cf("GET", "/orders/" + encodeURIComponent(o.orderId) + "/payments").catch(() => []);
    const ok = Array.isArray(pays) && pays.find(p => p.payment_status === "SUCCESS");
    markPaid(o.orderId, String((ok && ok.cf_payment_id) || ""), "status-check");
  } catch (e) { console.error("Status check error:", e.detail || e.message); }
}

app.post("/api/create-order", limiter(20), async (req, res) => {
  const { items, customer } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 10) return res.status(400).json({ error: "Your cart is empty." });
  const lines = [], seen = new Set();
  for (const it of items) {
    const p = PRODUCTS.find(x => x.id === (it && it.productId)), q = Number(it && it.quantity);
    if (!p || seen.has(p.id)) return res.status(400).json({ error: "Invalid item in cart." });
    if (!Number.isInteger(q) || q < 1 || q > MAX_QTY) return res.status(400).json({ error: `Quantity must be 1 to ${MAX_QTY} for each oil.` });
    seen.add(p.id); lines.push({ productId: p.id, name: p.name, unitPrice: p.price, quantity: q });
  }
  const c = validateCustomer(customer);
  if (c.error) return res.status(400).json({ error: c.error });

  const amountRupees = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);   // priced on the server only
  const summary = lines.map(l => `${l.name} x ${l.quantity}`).join(", ");
  const orderId = "KM" + Date.now() + crypto.randomBytes(2).toString("hex");
  try {
    const meta = { return_url: `${SITE_URL}/checkout.html?order_id={order_id}` };
    if (SITE_URL.startsWith("https://")) meta.notify_url = SITE_URL + "/api/webhook";
    const o = await cf("POST", "/orders", {
      order_id: orderId, order_amount: amountRupees, order_currency: "INR", order_note: summary.slice(0, 200),
      customer_details: { customer_id: "cust_" + c.value.mobile, customer_name: c.value.name, customer_email: c.value.email, customer_phone: c.value.mobile },
      order_meta: meta
    });
    orders[orderId] = { orderId, items: lines, summary, amountRupees, currency: "INR", customer: c.value, status: "created", createdAt: new Date().toISOString() };
    save();
    res.json({ orderId, paymentSessionId: o.payment_session_id });
  } catch (e) {
    console.error("Cashfree order error:", e.detail || e.message);
    res.status(500).json({ error: "Could not start payment. Please try again." });
  }
});

app.get("/api/order-status/:id", limiter(60), async (req, res) => {
  const o = orders[req.params.id];
  if (!o) return res.status(404).json({ status: "not_found" });
  await refresh(o);
  res.json({ status: o.status, order: o.status === "paid" ? publicOrder(o) : undefined });
});

// Customer's transaction history: the browser sends the order IDs it remembers (long random IDs act as the key)
app.post("/api/my-orders", limiter(30), async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.filter(x => typeof x === "string").slice(0, 30) : [];
  const mine = ids.map(id => orders[id]).filter(Boolean);
  await Promise.all(mine.filter(o => o.status === "created").slice(0, 5).map(refresh));
  res.json(mine.map(publicOrder).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

// Order list for the shop owner:  curl -H "x-admin-token: <ADMIN_TOKEN>" http://localhost:5000/api/admin/orders
app.get("/api/admin/orders", limiter(30), (req, res) => {
  if (!ADMIN_TOKEN) return res.status(404).json({ error: "Not found" });
  if (!same(req.get("x-admin-token") || "", ADMIN_TOKEN)) return res.status(401).json({ error: "Unauthorized" });
  res.json(Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.get("*", (req, res) =>
  path.extname(req.path) ? res.status(404).end() : res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  console.error(err); res.status(500).json({ error: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`KANI MARK OIL MILL running at http://localhost:${PORT}  [Cashfree ${ENV.toUpperCase()} mode]`);
  if (!SITE_URL.startsWith("https://")) console.log("Note: SITE_URL is not https - Cashfree webhook (notify_url) is skipped; status check still works.");
  if (!ADMIN_TOKEN) console.log("Note: ADMIN_TOKEN not set - admin order list disabled.");
});
