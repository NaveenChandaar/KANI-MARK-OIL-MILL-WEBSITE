const $ = id => document.getElementById(id);
async function render() {
  const products = await KM.products(), cart = KM.cart(), box = $("lines");
  box.innerHTML = ""; let total = 0, n = 0;
  products.filter(p => cart[p.id]).forEach(p => {
    const q = cart[p.id]; total += p.price * q; n++;
    const row = KM.el("div", null, "cart-line");
    const info = KM.el("div"); info.append(KM.el("b", `${p.emoji} ${p.name}`), KM.el("small", `${KM.inr(p.price)} per 1 L`));
    const st = KM.el("div", null, "stepper");
    const minus = KM.el("button", "−"); minus.onclick = () => { KM.set(p.id, q - 1); render(); };
    const plus = KM.el("button", "+"); plus.onclick = () => { KM.set(p.id, q + 1); render(); };
    st.append(minus, KM.el("span", String(q)), plus);
    const rm = KM.el("button", "✕", "remove"); rm.title = "Remove"; rm.onclick = () => { KM.set(p.id, 0); render(); };
    row.append(info, st, KM.el("div", KM.inr(p.price * q), "line-total"), rm); box.append(row);
  });
  $("go").hidden = !n;
  if (!n) { box.append(KM.el("p", "Your cart is empty. Choose some oils to get started.")); $("total").textContent = ""; return; }
  $("total").textContent = "Total: " + KM.inr(total);
}
render().catch(() => { $("lines").textContent = "Could not load your cart. Please refresh."; });
