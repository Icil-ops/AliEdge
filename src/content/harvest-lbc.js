// Sur Leboncoin (seulement si le membre a activé Leboncoin dans AliEdge) : les annonces déjà affichées par la page
// sont ajoutées à la base commune. AUCUNE requête vers Leboncoin : on lit seulement ce que la page affiche.
// Données gardées : identifiant, titre, prix, catégorie, département, photo, lien, livraison, identifiant public
// du vendeur (pour le suivi des concurrents). Jamais le nom de la ville, le téléphone ni les messages.
(() => {
  if (window.__aliedgeLbc) return;
  window.__aliedgeLbc = true;
  const seen = new Set();
  let timer = null;

  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const num = (t) => { const m = String(t ?? "").replace(/ | /g, " ").match(/(\d[\d ]{0,8}(?:,\d{1,2})?)\s*€/); return m ? Number(m[1].replace(/ /g, "").replace(",", ".")) || null : null; };
  const idFromUrl = (u) => Number(String(u || "").match(/\/(?:ad\/[^/]+|vi)\/(\d{6,15})/)?.[1]) || null;
  // Département seulement (jamais la ville) : 13001 → 13, 97411 → 974, 20000 → 20.
  const dept = (t) => { const cp = String(t || "").match(/\b(\d{5})\b/)?.[1]; return cp ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : null; };
  const photo = (img) => { const s = img?.currentSrc || img?.getAttribute("src") || ""; return /^https:\/\//.test(s) ? s : null; };
  // « Date de dépôt : 10/10/2026. » → 2026-10-10
  const depot = (t) => { const m = String(t || "").match(/Date de dépôt\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}T12:00:00+01:00` : null; };
  const profileId = () => location.pathname.match(/^\/profile\/([0-9a-f-]{36})/i)?.[1] || null;

  /** Cartes d'annonces affichées : résultats de recherche, annonces similaires, page d'un vendeur. */
  function fromCards() {
    const out = [];
    const seller = profileId();
    for (const art of document.querySelectorAll("article")) {
      // Le conteneur d'annonce est dans la carte (recherche) ou autour (page vendeur).
      const box = art.querySelector('[data-qa-id="aditem_container"]') || art.closest('[data-qa-id="aditem_container"]');
      const a = art.querySelector('a[href*="/ad/"], a[href*="/vi/"]');
      const id = idFromUrl(a?.getAttribute("href"));
      if (!box || !id || seen.has(id)) continue;
      const text = (art.innerText || art.textContent || "").replace(/\s+/g, " ");
      const title = (art.getAttribute("aria-label") || box.querySelector("p")?.textContent || "").trim();
      const price = num(text.match(/Prix\s*:\s*[^.]*€/)?.[0] || text);
      if (!title || !price) continue;
      seen.add(id);
      const sold = [...art.querySelectorAll("span, p, div")].some((el) => el.children.length === 0 && /^(vendu|réservé)$/i.test((el.textContent || "").trim()));
      out.push({
        list_id: id, title: title.slice(0, 200), price,
        category: text.match(/Catégorie\s*:\s*([^.]+)\./)?.[1]?.trim() || null,
        department: dept(text.match(/Située à ([^.]+)\./)?.[1] || ""),
        photo_url: photo(art.querySelector("img")), url: new URL(a.getAttribute("href"), location.href).href.split("?")[0],
        shipping: /Livraison/i.test(text), status: sold ? "sold" : "active", ...(seller ? { seller_uuid: seller } : {}),
        ...(depot(text) ? { published_at: depot(text) } : {}),
      });
      if (out.length >= 96) break;
    }
    return out;
  }

  /** Page d'une annonce : données structurées de la page (schema.org) + vendeur. */
  function fromAdPage() {
    const id = idFromUrl(location.pathname);
    if (!id || seen.has(id)) return [];
    let ld = null;
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const j = JSON.parse(s.textContent || "null"); if (j && (j["@type"] === "Product" || j.offers)) { ld = j; break; } } catch { /* autre bloc */ }
    }
    const titleEl = document.querySelector('[data-qa-id="adview_title"] h1, [data-qa-id="adview_title"]');
    const title = (ld?.name || titleEl?.querySelector("h1")?.textContent || "").trim();
    if (!ld && !title) return [];
    seen.add(id);
    const avail = String(ld?.offers?.availability || "");
    const prof = document.querySelector('[data-qa-id="adview_profile_part"] a[href*="/profile/"]');
    const main = document.querySelector("main") || document.body;
    return [{
      list_id: id, title: title.slice(0, 200) || null,
      price: Number(ld?.offers?.price) || num(document.querySelector('[data-qa-id="adview_price"]')?.textContent),
      category: ld?.category || null, department: dept((main.innerText || "").match(/[A-ZÀ-Ÿa-zà-ÿ' -]+ \d{5}/)?.[0]),
      photo_url: /^https:\/\//.test(String(ld?.image || "")) ? String(Array.isArray(ld.image) ? ld.image[0] : ld.image) : photo(document.querySelector("main img")),
      url: location.origin + location.pathname, shipping: !!document.querySelector('[data-qa-id="adview_delivery_container"]'),
      status: /SoldOut|OutOfStock|Discontinued/i.test(avail) ? "sold" : "active",
      ...(prof?.getAttribute("href")?.match(UUID) ? { seller_uuid: prof.getAttribute("href").match(UUID)[0] } : {}),
    }];
  }

  /** Page d'une annonce qui n'existe plus : elle a disparu (vendue ou retirée). */
  function goneAd() {
    const id = idFromUrl(location.pathname);
    if (!id || seen.has(id)) return [];
    const txt = (document.body?.innerText || "").slice(0, 4000);
    if (!/(n.est plus disponible|a été vendue?|annonce (?:a été )?(?:supprimée|désactivée|expirée))/i.test(txt)) return [];
    seen.add(id);
    return [{ list_id: id, status: /vendu/i.test(txt) ? "sold" : "gone", url: location.origin + location.pathname }];
  }

  /** Page d'un vendeur : toutes ses annonces affichées + le nombre total annoncé par la page. */
  let profileSent = "";
  function profile(items) {
    const seller = profileId();
    if (!seller) return;
    const cards = [...document.querySelectorAll("article a[href*='/ad/']")].map((a) => idFromUrl(a.getAttribute("href"))).filter(Boolean);
    // « Annonces (13) » : nombre d'annonces en ligne du vendeur, affiché sur sa page.
    const total = Number((document.body.innerText || "").match(/Annonces\s*\((\d+)\)/i)?.[1]) || null;
    const name = (document.querySelector("h1")?.textContent || "").trim().slice(0, 80) || null;
    const key = `${seller}:${cards.length}`;
    if (!cards.length || key === profileSent) return;
    profileSent = key;
    chrome.runtime.sendMessage({ type: "lbc:profile", seller, name, ids: [...new Set(cards)].slice(0, 500), total, items }).catch(() => {});
  }

  function flush() {
    timer = null;
    const items = [...fromAdPage(), ...goneAd(), ...fromCards()].slice(0, 96);
    if (profileId()) { profile(items); return; }
    if (items.length) chrome.runtime.sendMessage({ type: "lbc:cards", items }).catch(() => {});
  }
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 5000 }) : setTimeout(fn, 0));
  const schedule = () => { if (!timer) timer = setTimeout(() => { if (document.hidden) { timer = null; return; } idle(flush); }, 3000); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
