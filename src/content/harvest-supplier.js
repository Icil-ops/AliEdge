// Sur AliExpress, Temu et Shein (réglage « Ajouter automatiquement les produits des recherches », activé par défaut) :
// les produits déjà affichés par la page (résultats, accueil, catégories, au fil du défilement) sont ajoutés au catalogue commun d'AliEdge.
// AUCUNE requête en plus vers le site : on lit seulement ce que la page affiche. Les ventes Vinted de ces produits
// sont ensuite repérées par le serveur et par les analyses des membres.
(() => {
  if (window.__aliedgeSupplierHarvest) return;
  window.__aliedgeSupplierHarvest = true;
  const PATS = [
    ["aliexpress", /^https:\/\/[a-z.]*aliexpress\.[a-z.]+\/item\/(\d+)\.html/i],
    ["temu", /^https:\/\/(?:www\.)?temu\.com\/[^?#]*-g-(\d+)\.html/i],
    ["shein", /^https:\/\/[a-z.]*shein\.[a-z.]+\/[^?#]*-p-(\d+)(?:-cat-\d+)?\.html/i],
  ];
  const sent = new Set();
  let timer = null;
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

  function readCards() {
    const out = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href;
      for (const [platform, re] of PATS) {
        const m = href.match(re);
        if (!m) continue;
        const key = `${platform}:${m[1]}`;
        if (sent.has(key)) break;
        let card = a;
        for (let i = 0; i < 6 && card.parentElement; i++) {
          if (card.querySelector("img") && /\d[.,]\d{2}\s?€|€\s?\d/.test(card.textContent || "")) break;
          card = card.parentElement;
        }
        const img = card.querySelector("img");
        let src = img ? (img.currentSrc || img.getAttribute("src") || img.dataset?.src || "") : "";
        if (src.startsWith("//")) src = `https:${src}`;
        const title = clean(a.getAttribute("title") || card.querySelector("[title]")?.getAttribute("title") || img?.alt || a.textContent || card.querySelector("h1,h2,h3")?.textContent);
        const pm = clean(card.textContent).match(/(\d{1,4}[.,]\d{2})\s?€|€\s?(\d{1,4}[.,]\d{2})/);
        const price = pm ? Number((pm[1] || pm[2]).replace(",", ".")) : null;
        if (title.length >= 8 && title.length <= 400) {
          sent.add(key);
          out.push({ platform, source_id: m[1], url: href.split(/[?#]/)[0], title: title.slice(0, 300), image_url: /^https:\/\//.test(src) ? src : null, price, category: null });
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
  schedule(2000);
})();
