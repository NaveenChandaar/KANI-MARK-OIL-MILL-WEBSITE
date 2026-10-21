const $ = id => document.getElementById(id);
const LABEL = { paid: ["Paid", "ok"], failed: ["Failed", "err"], created: ["Not completed", "warn"] };
async function load() {
  const ids = KM.orders(), box = $("list"); box.innerHTML = "";
  if (!ids.length) return box.append(KM.el("p", "No orders on this phone/browser yet."));
  box.append(KM.el("p", "Loading…"));
  let list;
  try { list = await (await fetch("/api/my-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })).json(); }
  catch (e) { box.textContent = "Could not load orders. Please refresh."; return; }
  box.innerHTML = "";
  if (!list.length) return box.append(KM.el("p", "No matching orders found."));
  list.forEach(o => {
    const [txt, cls] = LABEL[o.status] || [o.status, "warn"];
    const card = KM.el("div", null, "order-card"), top = KM.el("div", null, "oc-top");
    top.append(KM.el("b", new Date(o.createdAt).toLocaleString("en-IN")), KM.el("span", txt, "badge " + cls));
    card.append(top, KM.el("small", "Order ID: " + o.orderId));
    o.items.forEach(i => card.append(KM.el("div", `${i.name} × ${i.quantity}  —  ${KM.inr(i.unitPrice * i.quantity)}`)));
    card.append(KM.el("h3", "Total: " + KM.inr(o.amount)));
    if (o.paymentId) card.append(KM.el("small", "Payment ID: " + o.paymentId));
    box.append(card);
  });
}
$("find").onclick = () => { const v = $("oid").value.trim(); if (v) { KM.addOrder(v); $("oid").value = ""; load(); } };
load();
