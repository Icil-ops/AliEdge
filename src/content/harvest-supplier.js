// Sur AliExpress, Temu et Shein (réglage « Ajouter automatiquement les produits des recherches », activé par défaut) :
// les produits déjà affichés par la page (résultats, accueil, catégories, au fil du défilement) sont ajoutés au catalogue commun d'AliEdge.
// AUCUNE requête en plus vers le site : on lit seulement ce que la page affiche. Les ventes Vinted de ces produits
// sont ensuite repérées par le serveur et par les analyses des membres.
(async () => {
  try { if ((await chrome.storage.local.get("ae_disabled")).ae_disabled) return; } catch { /* stockage indisponible */ }
  if (window.__aliedgeSupplierHarvest) return;
  window.__aliedgeSupplierHarvest = true;
  const PATS = [
    ["aliexpress", /^https:\/\/[a-z.]*aliexpress\.[a-z.]+\/item\/(\d+)\.html/i],
    ["temu", /^https:\/\/(?:www\.)?temu\.com\/[^?#]*-g-(\d+)\.html/i],
    ["shein", /^https:\/\/[a-z.]*shein\.[a-z.]+\/[^?#]*-p-(\d+)(?:-cat-\d+)?\.html/i],
  ];
  const sent = new Set();
  const noImage = new Map(); // produits envoyés sans photo (image pas encore chargée) : renvoyés quand elle apparaît
  // Photo réelle de la carte : les sites chargent les images au défilement (data-src, srcset, fond CSS).
  function bestSrc(card) {
    const cands = [];
    for (const img of card.querySelectorAll("img")) {
      cands.push(img.currentSrc, img.getAttribute("data-src"), img.getAttribute("data-original"), img.getAttribute("data-lazy"), img.getAttribute("data-design-src"), img.getAttribute("src"));
      const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset");
      if (ss) cands.push(ss.split(",").map((x) => x.trim().split(/\s+/)[0]).pop());
    }
    for (const el of card.querySelectorAll("[style*='background-image']")) { const m = (el.getAttribute("style") || "").match(/url\(["']?([^"')]+)/); if (m) cands.push(m[1]); }
    for (let c of cands) {
      if (!c) continue;
      c = String(c).trim();
      if (c.startsWith("//")) c = `https:${c}`;
      if (!/^https:\/\//.test(c) || /^data:|placeholder|blank|loading|lazy|\.gif(\?|$)|1x1|transparent|bg-grey|default_img|ad_tag|temu_rec_leo|\/icons?\/|\/\d{2}x\d{2}\.(png|jpe?g)$/i.test(c)) continue; // badges, icônes, logos
      return c;
    }
    return null;
  }
  let timer = null;
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().replace(/^(photo|image) de l['’]article\s+/i, "");
  const JUNK_TITLE = /^(report fraud item|report item|signaler (un |l.)?(article|produit|fraude)|add to cart|ajouter au panier|choice|sponsored|sponsoris)/i;

  // Prix de la carte : jamais un prix barré, une économie (« -0,87 € »), un paiement en plusieurs fois ou un prix
  // « club » ; parmi les prix restants, le plus élevé est le prix réel (le reste est une remise ou une mensualité).
  const PRICE_RE = /(\d{1,4}(?:[ \u202f]\d{3})?[.,]\d{2})\s?€|€\s?(\d{1,4}(?:[ \u202f]\d{3})?[.,]\d{2})/g;
  const NOT_PRICE = /(économ|economi|save|off\b|réduc|reduc|remise|coupon|club|klarna|paypal|x\s?\d|\d\s?x\b|\/\s?mois|par mois|-\s*$)/i;
  function cardPrice(card) {
    const found = [];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest("del, s, strike") || /line-through/.test(getComputedStyle(el).textDecorationLine || "")) continue;
      const ctx = clean((el.parentElement || el).textContent).slice(0, 80);
      for (const m of String(n.textContent).matchAll(PRICE_RE)) {
        const before = ctx.slice(0, Math.max(0, ctx.indexOf(m[0]))).slice(-14);
        if (NOT_PRICE.test(before) || NOT_PRICE.test(ctx.replace(m[0], "").slice(0, 30)) && ctx.length < 40) continue;
        const v = Number((m[1] || m[2]).replace(/[ \u202f]/g, "").replace(",", "."));
        if (v >= 0.5 && v <= 500) found.push(v);
      }
    }
    return found.length ? Math.max(...found) : null;
  }

  function readCards() {
    const out = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href;
      for (const [platform, re] of PATS) {
        const m = href.match(re);
        if (!m) continue;
        const key = `${platform}:${m[1]}`;
        if (sent.has(key) && !noImage.has(key)) break;
        let card = a;
        for (let i = 0; i < 6 && card.parentElement; i++) {
          if (card.querySelector("img") && /\d[.,]\d{2}\s?€|€\s?\d/.test(card.textContent || "")) break;
          card = card.parentElement;
        }
        const img = card.querySelector("img");
        const src = bestSrc(card);
        if (noImage.has(key)) {
          // Déjà envoyé sans photo : renvoyé dès que la photo est chargée (au défilement), tant que la page reste ouverte.
          if (!src) { const n = noImage.get(key) + 1; if (n >= 60) noImage.delete(key); else noImage.set(key, n); break; }
          noImage.delete(key);
        }
        // Premier vrai titre : jamais un libellé d'interface (AliExpress a ajouté « Report fraud item » dans ses cartes).
        const title = [a.getAttribute("title"), ...[...card.querySelectorAll("[title]")].map((x) => x.getAttribute("title")), card.querySelector("h1,h2,h3")?.textContent, img?.alt, a.textContent]
          .map(clean).find((x) => x.length >= 8 && !JUNK_TITLE.test(x)) || "";
        const price = cardPrice(card);
        if (title.length >= 8 && title.length <= 400) {
          sent.add(key);
          if (!src) noImage.set(key, 0);
          out.push({ platform, source_id: m[1], url: href.split(/[?#]/)[0], title: title.slice(0, 300), image_url: src, price, category: null });
        }
        break;
      }
      if (out.length >= 600) break;
    }
    return out;
  }
  function flush() {
    timer = null;
    // Tous les produits déjà chargés (au fil du défilement, accueil et catégories compris), par paquets de 60.
    const items = readCards();
    for (let i = 0; i < items.length; i += 60) chrome.runtime.sendMessage({ type: "catalog:autoSeen", items: items.slice(i, i + 60) }).catch(() => {});
  }
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 0));
  const schedule = (delay = 4000) => { if (!timer) timer = setTimeout(() => { if (document.hidden) { timer = null; return; } idle(flush); }, delay); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  new MutationObserver(() => schedule()).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", () => schedule(2000), { passive: true });
  // Une photo de carte qui finit de se charger (chargement au défilement) : le produit est renvoyé avec elle.
  document.addEventListener("load", (e) => { if (noImage.size && e.target instanceof HTMLImageElement) schedule(1500); }, true);
  schedule(2000);
})();
