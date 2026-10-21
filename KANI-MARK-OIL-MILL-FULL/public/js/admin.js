const $ = id => document.getElementById(id);
let all = [];
$("tok").value = sessionStorage.getItem("km_admin") || "";
const itemsText = o => (o.items ? o.items.map(i => `${i.name} × ${i.quantity}`).join(", ") : `${o.productName} × ${o.quantity}`);
const msg = t => { $("msg").textContent = t; };

async function load() {
  const token = $("tok").value.trim(); msg("Loading…");
  try {
    const r = await fetch("/api/admin/orders", { headers: { "x-admin-token": token } });
    if (r.status === 401) return msg("Wrong token.");
    if (r.status === 404) return msg("Admin is disabled. Set ADMIN_TOKEN in .env and restart.");
    all = await r.json(); sessionStorage.setItem("km_admin", token); msg(""); draw();
  } catch (e) { msg("Could not load orders."); }
}
function view() { const f = $("flt").value; return all.filter(o => f === "all" || o.status === f); }
function draw() {
  const paid = all.filter(o => o.status === "paid");
  $("stats").textContent = `Paid: ${paid.length} · Revenue: ${KM.inr(paid.reduce((t, o) => t + o.amountRupees, 0))} · Not completed/failed: ${all.length - paid.length} · Total orders: ${all.length}`;
  const tb = $("rows"); tb.innerHTML = "";
  view().forEach(o => {
    const tr = document.createElement("tr");
    [new Date(o.createdAt).toLocaleString("en-IN"), o.orderId, itemsText(o), KM.inr(o.amountRupees), o.status, o.paymentId || "", o.customer.name, o.customer.mobile, o.customer.address]
      .forEach(v => tr.append(KM.el("td", v)));
    tb.append(tr);
  });
}
function csv() {
  const safe = v => { v = String(v == null ? "" : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const rows = [["Date", "Order ID", "Items", "Amount", "Status", "Payment ID", "Name", "Email", "Mobile", "Address"]]
    .concat(view().map(o => [o.createdAt, o.orderId, itemsText(o), o.amountRupees, o.status, o.paymentId || "", o.customer.name, o.customer.email, o.customer.mobile, o.customer.address]));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.map(r => r.map(safe).join(",")).join("\n")], { type: "text/csv" }));
  a.download = "kani-mark-orders.csv"; a.click();
}
$("load").onclick = load; $("flt").onchange = draw; $("csv").onclick = csv;
if ($("tok").value) load();
