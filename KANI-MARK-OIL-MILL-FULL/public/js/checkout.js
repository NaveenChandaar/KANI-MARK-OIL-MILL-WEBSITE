const $ = id => document.getElementById(id);
let lines = [], config = null;
const say = (msg, cls) => { $("status").textContent = msg; $("status").className = cls || ""; };
const total = () => lines.reduce((t, l) => t + l.p.price * l.q, 0);

function render() {
  const box = $("summary"); box.innerHTML = "";
  lines.forEach(l => {
    const r = KM.el("div", null, "sum-line");
    r.append(KM.el("span", `${l.p.emoji} ${l.p.name} × ${l.q}`), KM.el("b", KM.inr(l.p.price * l.q)));
    box.append(r);
  });
  box.append(KM.el("h3", "Total: " + KM.inr(total())));
  const a = KM.el("a", "← Edit cart"); a.href = "/cart.html"; box.append(a);
}

// Ask OUR server (which asks Cashfree) whether the order is paid
async function checkOrder(orderId) {
  say("Confirming your payment…");
  try {
    const res = await (await fetch("/api/order-status/" + encodeURIComponent(orderId))).json();
    if (res.status === "paid") {
      KM.addOrder(orderId); KM.clear();
      $("form").hidden = true; $("testbanner").hidden = true; $("summary").innerHTML = "";
      const o = res.order;
      say(`✅ Payment successful! Order ${o.orderId} · ${KM.inr(o.amount)} · ${o.items.map(i => i.name + " × " + i.quantity).join(", ")}. We will contact you on your mobile to arrange delivery.`, "ok");
      const a = KM.el("a", "View My Orders →", "btn gold"); a.href = "/history.html"; $("status").after(a);
    } else {
      $("payBtn").disabled = false;
      say("Payment was not completed. No money is taken for failed payments. You can try again.", "err");
    }
  } catch (e) {
    say("We could not confirm your payment right now. If money was deducted it will be reconciled automatically — note Order ID " + orderId + " and contact us.", "err");
  }
}

async function init() {
  try {
    const [products, cfg] = await Promise.all([KM.products(), fetch("/api/config").then(r => r.json())]);
    config = cfg; $("testbanner").hidden = cfg.mode !== "sandbox";
    const back = new URLSearchParams(location.search).get("order_id");   // returning from Cashfree redirect
    if (back) return checkOrder(back);
    const cart = KM.cart();
    lines = products.filter(p => cart[p.id]).map(p => ({ p, q: cart[p.id] }));
    if (!lines.length) { $("summary").innerHTML = "<p>Your cart is empty. <a href='/#oils'>Choose oils</a></p>"; return; }
    $("form").hidden = false; render();
  } catch (e) { say("Could not load checkout. Please refresh.", "err"); }
}

async function pay() {
  const customer = { name: $("name").value, email: $("email").value, mobile: $("mobile").value, address: $("address").value };
  if (typeof Cashfree === "undefined") return say("Payment system could not load. Check your internet and refresh.", "err");
  $("payBtn").disabled = true; say("Creating your order…");
  let data;
  try {
    const r = await fetch("/api/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: lines.map(l => ({ productId: l.p.id, quantity: l.q })), customer }) });
    data = await r.json();
    if (!r.ok) { $("payBtn").disabled = false; return say(data.error || "Could not create order.", "err"); }
  } catch (e) { $("payBtn").disabled = false; return say("Network error. Please try again.", "err"); }
  KM.addOrder(data.orderId);   // remembered on this device so it shows in My Orders
  const cashfree = Cashfree({ mode: config.mode === "production" ? "production" : "sandbox" });
  say("Opening secure payment…");
  cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_modal" })
    .then(() => checkOrder(data.orderId)).catch(() => checkOrder(data.orderId));
}
init();
