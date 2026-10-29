// Sur Vinted : les annonces déjà affichées par la page (résultats, fil d'accueil, dressings, favoris) sont ajoutées
// à la base commune. AUCUNE requête en plus vers Vinted : on lit seulement ce que le navigateur affiche déjà.
// Les annonces de la page « Favoris » du membre sont marquées comme intéressantes : leurs ventes sont surveillées.
(() => {
  if (window.__aliedgeHarvest) return;
  window.__aliedgeHarvest = true;
  const market = location.hostname.endsWith(".co.uk") ? "uk" : location.hostname.split(".").pop();
  const seen = new Set();
  let timer = null;

  const num = (t) => { const m = String(t || "").match(/(\d{1,5}(?:[.,]\d{1,2})?)\s?€/); return m ? parseFloat(m[1].replace(",", ".")) : null; };
  const field = (parts, re) => (parts.find((x) => re.test(x)) || "").replace(re, "").trim() || null;
  const isFavourites = () => /\/member\/items\/favou?rite/i.test(location.pathname) || /favou?rite/i.test(location.search);

  function readCards() {
    const out = [];
    for (const a of document.querySelectorAll('a[href*="/items/"]')) {
      const id = Number((a.getAttribute("href") || "").match(/\/items\/(\d{5,15})/)?.[1]);
      if (!id || seen.has(id)) continue;
      // Carte d'annonce : l'attribut title porte « Titre, marque: X, état: Y, taille: Z, 15,00 € ».
      const t = a.getAttribute("title") || "";
      if (!t || !/€/.test(t)) continue;
      const parts = t.split(/,\s+/);
      const card = a.closest('[data-testid*="grid-item"], [class*="feed-grid__item"], [class*="ItemBox"], li, article') || a.parentElement;
      const img = card?.querySelector("img");
      // « Vendu » : seulement un badge dont le texte entier est le mot (jamais un mot du titre).
      const sold = !!card && [...card.querySelectorAll("span, div, p")].some((el) => el.children.length === 0 && /^(vendu|sold|verkauft|vendido|venduto|verkocht|sprzedane)$/i.test((el.textContent || "").trim()));
      seen.add(id);
      out.push({
        vinted_id: id, market, title: parts[0]?.slice(0, 300) || null,
        brand: field(parts, /^(marque|brand|marke|marca|merk)\s*:\s*/i), size: field(parts, /^(taille|size|größe|talla|taglia|maat)\s*:\s*/i),
        condition: field(parts, /^(état|condition|zustand|estado|stato|staat)\s*:\s*/i), price: num(t), currency: "EUR",
        photo_url: img?.getAttribute("src") || img?.getAttribute("data-src") || null,
        url: new URL(a.getAttribute("href"), location.href).href.split("?")[0],
        status: sold ? "sold" : "active", liked: isFavourites(),
      });
      if (out.length >= 96) break;
    }
    return out;
  }

  function flush() {
    timer = null;
    const items = readCards();
    if (items.length) chrome.runtime.sendMessage({ type: "vinted:cards", items }).catch(() => {});
  }
  // Lecture quand la page est au repos et visible : jamais pendant que la page charge ou s'anime.
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 0));
  const schedule = () => { if (!timer) timer = setTimeout(() => { if (document.hidden) { timer = null; return; } idle(flush); }, 3000); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  // Clic sur le cœur (favori) d'une annonce : elle est marquée comme intéressante, sans aucune requête vers Vinted.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.('button[data-testid*="favourite"], button[aria-label*="avori"], button[aria-label*="avourite"], [data-testid*="favourite-button"]');
    if (!btn) return;
    const scope = btn.closest('[data-testid*="grid-item"], [class*="feed-grid__item"], article, li') || document;
    const a = scope.querySelector?.('a[href*="/items/"]');
    const id = Number(((a && a.getAttribute("href")) || location.pathname).match(/\/items\/(\d{5,15})/)?.[1]);
    if (!id) return;
    seen.delete(id);
    const items = readCards().filter((i) => i.vinted_id === id).map((i) => ({ ...i, liked: true }));
    chrome.runtime.sendMessage({ type: "vinted:cards", items: items.length ? items : [{ vinted_id: id, market, url: location.href.split("?")[0], status: "active", liked: true }] }).catch(() => {});
  }, true);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
