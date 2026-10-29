// Pages de résultats AliExpress, Temu et Shein.
// 1) Les prix affichés alimentent l'historique des prix de la communauté (aucune requête en plus).
// 2) Après « Trouver moins cher » dans AliEdge : les annonces du même article sont repérées et classées.
(() => {
  if (window.__aliedgeSearch) return;
  window.__aliedgeSearch = true;

  const PATS = [
    ["aliexpress", /^https:\/\/[a-z.]*aliexpress\.[a-z.]+\/item\/(\d+)\.html/i],
    ["temu", /^https:\/\/(?:www\.)?temu\.com\/[^?#]*-g-(\d+)\.html/i],
    ["shein", /^https:\/\/[a-z.]*shein\.[a-z.]+\/[^?#]*-p-(\d+)(?:-cat-\d+)?\.html/i],
  ];
  const isProductPage = () => /\/item\/\d+\.html|-g-\d+\.html|-p-\d+(-cat-\d+)?\.html|[?&]goods_id=/.test(location.href);
  const isCheckout = () => /\/p\/trade\/|checkout|order_confirm|\/cart/i.test(location.pathname);
  if (isCheckout()) return;

  const send = (msg) => { try { return chrome.runtime.sendMessage(msg); } catch { return Promise.resolve(null); } };
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const num = (s) => Number(String(s).replace(/\s/g, "").replace(",", "."));

  /** Cartes produit visibles : lien, titre, photo, prix, ventes et note quand la carte les affiche. */
  function readCards() {
    const out = new Map();
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href;
      for (const [platform, re] of PATS) {
        const m = href.match(re);
        if (!m) continue;
        const key = `${platform}:${m[1]}`;
        if (out.has(key)) break;
        let card = a;
        for (let i = 0; i < 6 && card.parentElement; i++) {
          if (card.querySelector("img") && /\d[.,]\d{2}\s?€|€\s?\d/.test(card.textContent || "")) break;
          card = card.parentElement;
        }
        const img = card.querySelector("img");
        let src = img ? (img.currentSrc || img.getAttribute("src") || img.dataset?.src || "") : "";
        if (src.startsWith("//")) src = `https:${src}`;
        const text = clean(card.textContent);
        const title = clean(a.getAttribute("title") || card.querySelector("[title]")?.getAttribute("title") || img?.alt || card.querySelector("h1,h2,h3")?.textContent || a.textContent);
        const pm = text.match(/(\d{1,4}[.,]\d{2})\s?€|€\s?(\d{1,4}[.,]\d{2})/);
        const price = pm ? num(pm[1] || pm[2]) : null;
        const om = text.match(/(\d[\d\s.,]*\s?(?:k|K|\+)?)\s*(?:vendus|vendu|sold|commandes)/i);
        let orders = null;
        if (om) { const raw = om[1].replace(/\s/g, ""); orders = /k/i.test(raw) ? Math.round(num(raw.replace(/[kK+]/g, "")) * 1000) : Math.round(num(raw.replace(/[+.]/g, "").replace(",", ""))); }
        const rm = text.match(/(?:^|\s)([1-5][.,]\d)(?:\s|$|★)/);
        const rating = rm ? num(rm[1]) : null;
        if (title.length >= 6 && title.length <= 400) out.set(key, { platform, source_id: m[1], url: href.split(/[?#]/)[0], title: title.slice(0, 300), image_url: /^https:\/\//.test(src) ? src : null, price, orders: Number.isFinite(orders) ? orders : null, rating: Number.isFinite(rating) && rating <= 5 ? rating : null, el: card });
        break;
      }
    }
    return [...out.values()].slice(0, 120);
  }

  let session = null;
  let sentKeys = new Set();
  let busy = false;
  let lastRun = 0;
  let matches = [];
  let sortBy = "price";
  let panel = null;

  async function run(force = false) {
    if (busy || isProductPage() || isCheckout()) return;
    if (!force && Date.now() - lastRun < 15_000) return;
    const cards = readCards();
    if (cards.length < 4) return;
    const fresh = cards.filter((c) => !sentKeys.has(`${c.platform}:${c.source_id}`));
    if (!fresh.length) { if (session && force) renderPanel("done"); return; }
    busy = true;
    lastRun = Date.now();
    if (session) renderPanel("loading");
    try {
      const payload = fresh.map(({ el, ...c }) => c);
      const r = await send({ type: "compare:cards", cards: payload });
      fresh.forEach((c) => sentKeys.add(`${c.platform}:${c.source_id}`));
      if (r?.ok && r.data?.session) {
        const byKey = new Map(cards.map((c) => [`${c.platform}:${c.source_id}`, c]));
        const found = (r.data.matches || []).map((m) => ({ ...m, el: byKey.get(`${m.platform}:${m.source_id}`)?.el || null }));
        const known = new Set(matches.map((m) => `${m.platform}:${m.source_id}`));
        for (const f of found) if (!known.has(`${f.platform}:${f.source_id}`)) matches.push(f);
        badges();
        renderPanel(r.data.ai ? "done" : "noai");
      }
    } finally { busy = false; }
  }

  function badges() {
    const ref = session?.ref;
    for (const m of matches) {
      if (!m.el || m.el.querySelector(":scope > .aliedge-same")) continue;
      if (getComputedStyle(m.el).position === "static") m.el.style.position = "relative";
      const b = document.createElement("div");
      b.className = "aliedge-same";
      const diff = ref?.price > 0 && m.price > 0 ? m.price - ref.price : null;
      b.textContent = diff == null ? "Même produit" : diff < -0.004 ? `Même produit · ${diff.toFixed(2).replace(".", ",")} €` : diff > 0.004 ? `Même produit · +${diff.toFixed(2).replace(".", ",")} €` : "Même produit · même prix";
      b.style.cssText = `position:absolute;left:8px;top:8px;z-index:5;padding:5px 9px;border-radius:999px;font:700 12px/1.1 ui-sans-serif,system-ui,sans-serif;color:#fff;background:${diff != null && diff < 0 ? "#0fa968" : "#6d3bff"};box-shadow:0 6px 16px -6px rgba(0,0,0,.5);pointer-events:none`;
      m.el.appendChild(b);
      m.el.style.outline = `3px solid ${diff != null && diff < 0 ? "#0fa968" : "#6d3bff"}`;
      m.el.style.outlineOffset = "2px";
      m.el.style.borderRadius = m.el.style.borderRadius || "10px";
    }
  }

  const eur = (n) => (n == null ? "—" : `${Number(n).toFixed(2).replace(".", ",")} €`);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function sorted() {
    const list = [...matches];
    if (sortBy === "orders") list.sort((a, b) => (b.orders || 0) - (a.orders || 0) || (a.price || 1e9) - (b.price || 1e9));
    else if (sortBy === "value") {
      // Score maison : le prix compte le plus, la note et les ventes rassurent.
      const s = (m) => (m.price || 999) * (1 - 0.06 * Math.max(0, (m.rating || 4.2) - 4.2) * 5) * (m.orders >= 1000 ? 0.92 : m.orders >= 100 ? 0.96 : 1);
      list.sort((a, b) => s(a) - s(b));
    } else list.sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    return list;
  }

  function renderPanel(state) {
    if (!session) return;
    if (!panel) {
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;left:18px;bottom:18px;z-index:2147483646;";
      panel = host.attachShadow({ mode: "closed" });
      document.documentElement.appendChild(host);
      panel.host_ = host;
    }
    const ref = session.ref;
    const list = sorted();
    const best = list.find((m) => m.price > 0);
    panel.innerHTML = `
      <style>
        .box{width:330px;max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#17132e;border-radius:18px;box-shadow:0 24px 60px -20px rgba(27,21,48,.6),0 0 0 1px rgba(23,19,46,.08);font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
        .hd{padding:14px 14px 10px;background:#1b1530;color:#fff}
        .hd .t{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px}
        .hd .s{opacity:.75;font-size:12.5px;margin-top:4px}
        .x{all:unset;cursor:pointer;margin-left:auto;opacity:.7;font-size:18px;padding:0 4px}
        .x:hover{opacity:1}
        .sorts{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid #eee9fb}
        .sorts button{all:unset;cursor:pointer;padding:6px 10px;border-radius:8px;font-weight:600;font-size:12.5px;color:#4a4566}
        .sorts button[aria-pressed="true"]{background:#ece7ff;color:#17132e}
        .list{overflow:auto;padding:6px}
        a.row{display:grid;grid-template-columns:48px 1fr auto;gap:10px;align-items:center;padding:7px;border-radius:12px;color:inherit;text-decoration:none}
        a.row:hover{background:#f5f3ff}
        a.row img{width:48px;height:48px;border-radius:9px;object-fit:cover;background:#f1eefc}
        .tt{font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .mt{font-size:11.5px;color:#6b6585;margin-top:2px}
        .p{font-weight:800;text-align:right;white-space:nowrap}
        .d{font-size:11.5px;font-weight:700;text-align:right}
        .d.neg{color:#0fa968}.d.pos{color:#d6334a}
        .ft{display:flex;gap:6px;padding:10px;border-top:1px solid #eee9fb}
        .ft button{all:unset;cursor:pointer;flex:1;text-align:center;padding:9px;border-radius:10px;font-weight:700;font-size:13px;background:#f1eefc}
        .ft button.main{background:#6d3bff;color:#fff}
        .empty{padding:16px;color:#4a4566;font-size:13px}
        .best{margin:8px 10px 0;padding:9px 11px;border-radius:12px;background:#dcf7ea;color:#0b7a4b;font-weight:700;font-size:13px}
        .spin{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;animation:sp 1s linear infinite}
        @keyframes sp{to{transform:rotate(360deg)}}
      </style>
      <div class="box" role="dialog" aria-label="Même produit chez d'autres vendeurs">
        <div class="hd">
          <div class="t">${state === "loading" ? '<span class="spin" aria-hidden="true"></span>' : ""}Même produit, ${list.length} vendeur${list.length > 1 ? "s" : ""}<button class="x" type="button" data-act="close" aria-label="Fermer">×</button></div>
          <div class="s">Ton produit : ${eur(ref.price)} · recherche « ${esc(session.query)} »</div>
        </div>
        ${best && ref.price > 0 && best.price < ref.price ? `<div class="best">Jusqu'à ${eur(ref.price - best.price)} de moins par article chez un autre vendeur.</div>` : ""}
        <div class="sorts" role="group" aria-label="Classer">
          <button type="button" data-sort="price" aria-pressed="${sortBy === "price"}">Prix</button>
          <button type="button" data-sort="value" aria-pressed="${sortBy === "value"}">Prix + avis</button>
          <button type="button" data-sort="orders" aria-pressed="${sortBy === "orders"}">Ventes</button>
        </div>
        <div class="list">${list.length ? list.map((m) => {
          const diff = ref.price > 0 && m.price > 0 ? m.price - ref.price : null;
          return `<a class="row" href="${esc(m.url)}" target="_blank" rel="noopener">
            ${m.image_url ? `<img src="${esc(m.image_url)}" alt="" referrerpolicy="no-referrer">` : "<span></span>"}
            <span><span class="tt">${esc(m.title)}</span><span class="mt">${[m.orders ? `${m.orders.toLocaleString("fr-FR")} vendus` : "", m.rating ? `★ ${String(m.rating).replace(".", ",")}` : "", m.score >= 0.99 ? "même photo" : "même article (IA)"].filter(Boolean).join(" · ")}</span></span>
            <span><span class="p">${eur(m.price)}</span>${diff != null ? `<span class="d ${diff < 0 ? "neg" : diff > 0 ? "pos" : ""}" style="display:block">${diff < 0 ? "−" : diff > 0 ? "+" : ""}${Math.abs(diff).toFixed(2).replace(".", ",")} €</span>` : ""}</span>
          </a>`;
        }).join("") : `<div class="empty">${state === "loading" ? "AliEdge compare les photos des résultats avec ton produit…" : "Pas encore d'annonce identique sur cette page. Fais défiler pour charger plus de résultats, puis relis la page."}${state === "noai" ? " (Comparaison des photos par l'IA indisponible : seules les photos identiques sont reconnues.)" : ""}</div>`}</div>
        <div class="ft"><button type="button" data-act="rerun">Relire la page</button><button type="button" class="main" data-act="close">Terminer</button></div>
      </div>`;
    panel.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { sortBy = b.dataset.sort; renderPanel(state); }));
    panel.querySelector('[data-act="rerun"]').addEventListener("click", () => run(true));
    panel.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener("click", () => {
      send({ type: "compare:end" });
      session = null; matches = [];
      panel.host_.remove(); panel = null;
      document.querySelectorAll(".aliedge-same").forEach((x) => { x.parentElement.style.outline = ""; x.remove(); });
    }));
  }

  // Lancement : session de comparaison éventuelle, puis lecture après chargement et à chaque pause du défilement.
  send({ type: "compare:session" }).then((r) => {
    session = r?.ok ? r.data : null;
    if (session) renderPanel("loading");
    setTimeout(() => run(true), session ? 2500 : 4000);
  });
  let t = null;
  addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(() => run(false), 1800); }, { passive: true });
})();
