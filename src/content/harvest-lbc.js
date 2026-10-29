// Sur Leboncoin (seulement si le membre a activé Leboncoin dans AliEdge) : les annonces déjà affichées par la page
// sont ajoutées à la base commune. AUCUNE requête vers Leboncoin : on lit les données déjà présentes dans la page.
// Données gardées : identifiant, titre, prix, catégorie, département, photo, lien, livraison. Jamais le vendeur.
(() => {
  if (window.__aliedgeLbc) return;
  window.__aliedgeLbc = true;
  const seen = new Set();
  let timer = null;

  const num = (v) => { const n = Array.isArray(v) ? Number(v[0]) : Number(String(v ?? "").replace(/[^\d,.]/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  const iso = (d) => { const s = String(d || "").trim().replace(" ", "T"); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? `${s.slice(0, 19)}+01:00` : null; };
  const idFromUrl = (u) => Number(String(u || "").match(/\/(?:ad\/[^/]+|vi)\/(\d{6,15})/)?.[1]) || null;
  const shippable = (ad) => {
    const a = (ad.attributes || []).find((x) => /shippable|shipping_type|livraison/i.test(x?.key || ""));
    if (!a) return undefined;
    return /true|oui|mondial|colissimo|shipping|delivery/i.test(String(a.value ?? a.value_label ?? ""));
  };
  const statusOf = (ad) => {
    const s = String(ad.status || ad.ad_status || "").toLowerCase();
    if (/sold|vendu/.test(s) || ad.is_sold === true) return "sold";
    if (/reserved|réserv/.test(s) || ad.is_reserved === true) return "sold";
    if (/deleted|expired|disabled|inactive|archived/.test(s)) return "gone";
    return "active";
  };
  // Annonce au format des données de la page (__NEXT_DATA__) → ce qu'on partage.
  const fromJson = (ad) => {
    const id = Number(ad?.list_id ?? ad?.listId ?? ad?.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const img = ad.images?.urls_large?.[0] || ad.images?.urls?.[0] || ad.images?.thumb_url || ad.images?.small_url || null;
    return {
      list_id: id, title: String(ad.subject || ad.title || "").slice(0, 200) || null, price: num(ad.price ?? ad.price_cents / 100),
      category: ad.category_name || null, department: ad.location?.department_name || null, photo_url: img,
      url: ad.url || `https://www.leboncoin.fr/vi/${id}.htm`, shipping: shippable(ad), published_at: iso(ad.first_publication_date || ad.index_date), status: statusOf(ad),
    };
  };
  function fromNextData() {
    const out = [];
    try {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")?.textContent || "null");
      const pp = data?.props?.pageProps || {};
      for (const ad of [...(pp.searchData?.ads || []), ...(pp.searchData?.ads_alu || []), ...(pp.ad ? [pp.ad] : [])]) { const x = fromJson(ad); if (x) out.push(x); }
    } catch { /* données absentes ou autre format */ }
    return out;
  }
  // Pages chargées sans rechargement (filtres, pages suivantes) : lecture des cartes affichées.
  function fromCards() {
    const out = [];
    for (const a of document.querySelectorAll('a[href*="/ad/"], a[href*="/vi/"]')) {
      const id = idFromUrl(a.getAttribute("href"));
      if (!id || seen.has(id)) continue;
      const card = a.closest('[data-qa-id="aditem_container"], article, li') || a;
      const title = (card.querySelector('[data-qa-id="aditem_title"], [data-test-id="adcard-title"], h2, h3, p[title]')?.textContent || a.getAttribute("title") || a.getAttribute("aria-label") || "").trim();
      const priceText = card.querySelector('[data-qa-id="aditem_price"], [data-test-id="price"]')?.textContent || (card.textContent || "").match(/\d[\d\s]{0,6}(?:,\d{2})?\s?€/)?.[0];
      if (!title || !priceText) continue;
      seen.add(id);
      const img = card.querySelector("img");
      out.push({ list_id: id, title: title.slice(0, 200), price: num(priceText), photo_url: img?.getAttribute("src") || null, url: new URL(a.getAttribute("href"), location.href).href.split("?")[0], status: "active" });
      if (out.length >= 96) break;
    }
    return out;
  }
  // Page d'une annonce qui n'existe plus : elle a disparu (vendue ou retirée).
  function goneAd() {
    const id = idFromUrl(location.pathname);
    if (!id || seen.has(id)) return [];
    const txt = (document.body?.innerText || "").slice(0, 4000);
    if (!/(n.est plus disponible|a été vendue?|annonce (?:a été )?(?:supprimée|désactivée|expirée))/i.test(txt)) return [];
    seen.add(id);
    return [{ list_id: id, status: /vendu/i.test(txt) ? "sold" : "gone", url: location.href.split("?")[0] }];
  }
  function flush() {
    timer = null;
    const items = [...fromNextData(), ...goneAd(), ...fromCards()].slice(0, 96);
    if (items.length) chrome.runtime.sendMessage({ type: "lbc:cards", items }).catch(() => {});
  }
  // Lecture quand la page est au repos et visible : jamais pendant que la page charge ou s'anime.
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 0));
  const schedule = () => { if (!timer) timer = setTimeout(() => { if (document.hidden) { timer = null; return; } idle(flush); }, 3000); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
