const wrap = document.getElementById("products");
KM.products().then(products => {
  wrap.innerHTML = "";
  products.forEach(p => {
    const card = KM.el("article", null, "card");
    card.append(KM.el("div", p.emoji, "emoji"), KM.el("h3", p.name), KM.el("small", p.tamil),
      KM.el("p", "Traditional oil for everyday cooking and familiar South Indian flavours."), KM.el("b", `₹${p.price} / 1 L`));
    const row = KM.el("div", null, "card-actions");
    const add = KM.el("button", "🛒 Add to Cart");
    add.onclick = () => { KM.add(p.id); KM.toast(`${p.name} added to cart`); };
    const buy = KM.el("button", "Buy Now", "alt");
    buy.onclick = () => { KM.add(p.id); location.href = "/cart.html"; };
    row.append(add, buy); card.append(row); wrap.append(card);
  });
}).catch(() => { wrap.textContent = "Could not load products. Please refresh the page."; });
