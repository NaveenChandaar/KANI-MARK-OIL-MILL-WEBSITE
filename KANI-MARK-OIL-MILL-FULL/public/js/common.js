const KM = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  cart() { return KM.get("km_cart_v2", {}); },
  setCart(c) { KM.put("km_cart_v2", c); KM.badge(); },
  count() { return Object.values(KM.cart()).reduce((a, b) => a + b, 0); },
  add(id, n = 1) { const c = KM.cart(); c[id] = Math.min((c[id] || 0) + n, 10); KM.setCart(c); },
  set(id, n) { const c = KM.cart(); if (n < 1) delete c[id]; else c[id] = Math.min(n, 10); KM.setCart(c); },
  clear() { KM.setCart({}); },
  orders() { return KM.get("km_orders", []); },
  addOrder(id) { const o = KM.orders(); if (!o.includes(id)) { o.unshift(id); KM.put("km_orders", o.slice(0, 30)); } },
  badge() { document.querySelectorAll(".cart-count").forEach(e => { e.textContent = KM.count(); }); },
  el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; },
  inr(n) { return "₹" + Number(n).toLocaleString("en-IN"); },
  async products() { return (await fetch("/api/products")).json(); },
  toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = KM.el("div", null, "toast"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(KM._t); KM._t = setTimeout(() => t.classList.remove("show"), 1700);
  }
};
document.addEventListener("DOMContentLoaded", () => {
  if (!document.body.dataset.nofab) {
    const a = KM.el("a", null, "fab"); a.href = "/cart.html"; a.setAttribute("aria-label", "Open cart");
    a.append("🛒 ", KM.el("span", "0", "cart-count")); document.body.appendChild(a);
  }
  KM.badge();
});
