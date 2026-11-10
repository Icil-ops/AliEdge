// Page d'une annonce Vinted : « Trouver le fournisseur » + statut de l'annonce pour le catalogue.
// Sur une annonce du membre lui-même : « Publier aussi sur Leboncoin » et « Publier sur Beebs / Opla » (texte, prix et
// photos repris dans l'assistant de dépôt de chaque site ; le membre vérifie et publie lui-même).
// Liens fournisseur (AliExpress, Temu, Shein) ouverts par AliEdge : lien partenaire si l'option est active (même prix).
// Clic normal seulement ; Ctrl/Cmd/clic molette ouvrent le lien tel quel.
globalThis.__aeAffClicks ||= (root) => root.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.composedPath?.() || []).find((n) => n?.tagName === "A") || e.target?.closest?.("a");
  if (!a?.href || !/^https:\/\/([a-z0-9-]+\.)*(aliexpress\.(com|fr|us)|temu\.com|shein\.(com|fr))\//i.test(a.href)) return;
  e.preventDefault();
  const href = a.href;
  chrome.runtime.sendMessage({ type: "aff:open", url: href }).then((r) => { if (!r?.ok) window.open(href, "_blank", "noopener"); }).catch(() => window.open(href, "_blank", "noopener"));
}, true);
(async () => {
  try { if ((await chrome.storage.local.get("ae_disabled")).ae_disabled) return; } catch { /* stockage indisponible */ }
  if (window.__aliedgeVinted) return;
  window.__aliedgeVinted = true;

  const marketOf = (h) => (h.endsWith(".co.uk") ? "uk" : h.split(".").pop());

  function readItem() {
    const id = Number(location.pathname.match(/\/items\/(\d+)/)?.[1]);
    if (!id) return null;
    let title = document.querySelector('meta[property="og:title"]')?.content || document.title;
    let photo = document.querySelector('meta[property="og:image"]')?.content || null;
    let price = null;
    let status = null;
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(s.textContent || "null");
        const list = Array.isArray(d) ? d : [d];
        for (const x of list) {
          if (!x || !/Product/i.test(String(x["@type"]))) continue;
          title = x.name || title;
          photo = (Array.isArray(x.image) ? x.image[0] : x.image) || photo;
          const o = Array.isArray(x.offers) ? x.offers[0] : x.offers;
          if (o?.price != null) price = Number(o.price);
          const av = String(o?.availability || "");
          if (/SoldOut|OutOfStock/i.test(av)) status = "sold";
          else if (/InStock/i.test(av)) status = "active";
        }
      } catch { /* ignoré */ }
    }
    if (!status) {
      const badge = [...document.querySelectorAll('[data-testid*="status"], [class*="status"]')].map((e) => e.textContent || "").join(" ");
      if (/\b(vendu|sold|verkauft|vendido|venduto|verkocht|sprzedane)\b/i.test(badge)) status = "sold";
    }
    title = String(title || "").replace(/\s*\|\s*Vinted.*$/i, "").trim();
    // Livres : l'ISBN affiché sur la page (rubrique des détails ou description), sans aucune requête.
    let isbn = null;
    try {
      const rows = [...document.querySelectorAll('[data-testid*="isbn" i], [itemprop="isbn"], [class*="details-list"] div, [class*="item-attributes"] div')];
      const lab = rows.find((el) => /isbn/i.test(el.getAttribute?.("data-testid") || "") || /^\s*ISBN/i.test(el.textContent || ""));
      const txt = (lab ? lab.textContent : "") + " " + (document.querySelector('[itemprop="description"], [data-testid*="description"]')?.textContent || "");
      const m = txt.match(/(?:97[89][\s-]?)?\d{1,5}[\s-]?\d{1,7}[\s-]?\d{1,7}[\s-]?[\dX]/gi) || [];
      for (const c of m) { const d = c.replace(/[^0-9X]/gi, ""); if (d.length === 10 || d.length === 13) { isbn = d; break; } }
    } catch { /* page inattendue */ }
    return { vinted_id: id, market: marketOf(location.hostname), title, price, photo_url: photo, url: location.href.split("?")[0], status, ...(isbn ? { isbn } : {}) };
  }

  function sourcingLinks(item) {
    const q = encodeURIComponent(item.title.replace(/\b(neuf|new|jamais porté|taille \w+)\b/gi, "").trim().split(/\s+/).slice(0, 6).join(" "));
    const links = [
      ["AliExpress", `https://fr.aliexpress.com/w/wholesale-${q.replace(/%20/g, "-")}.html`],
      ["Temu", `https://www.temu.com/search_result.html?search_key=${q}`],
      ["Shein", `https://fr.shein.com/pdsearch/${q}/`],
    ];
    if (item.photo_url) links.unshift(["Google Lens (photo)", `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.photo_url)}`]);
    return links;
  }

  function mount(item) {
    if (document.getElementById("aliedge-source")) return;
    const host = document.createElement("div");
    host.id = "aliedge-source";
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;";
    const root = host.attachShadow({ mode: "closed" });
    globalThis.__aeAffClicks(root);
    const rows = sourcingLinks(item).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${n}<span aria-hidden="true">↗</span></a>`).join("");
    root.innerHTML = `
      <style>
        :host{font:500 14px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
        .btn{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;background:#1b1530;color:#fff;font-weight:600;box-shadow:0 10px 30px -8px rgba(27,21,48,.55)}
        .btn:focus-visible,a:focus-visible{outline:3px solid #8f6bff;outline-offset:2px}
        .mark{width:28px;height:28px;border-radius:50%;background:#6d3bff;display:grid;place-items:center}
        .menu{position:absolute;right:0;bottom:56px;width:250px;background:#fff;color:#1b1530;border-radius:14px;padding:8px;box-shadow:0 18px 50px -12px rgba(27,21,48,.45);border:1px solid #e6e1f2}
        .menu[hidden]{display:none}
        .stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px;margin-bottom:10px}
        .stack .btn{padding:8px 14px 8px 8px;font-size:13.5px}
        .stack .mark{width:24px;height:24px}
        .stack .all .mark{background:#16a34a}
        .stack .done{opacity:.75}
        p{margin:6px 8px 8px;color:#6b6585;font-size:12px}
        a{display:flex;justify-content:space-between;padding:10px;border-radius:9px;color:inherit;text-decoration:none}
        a:hover{background:#f3f0fb}
        .sug{width:280px;margin-bottom:10px;background:#fff;color:#1b1530;border-radius:14px;padding:10px;box-shadow:0 18px 50px -12px rgba(27,21,48,.45);border:1px solid #e6e1f2;display:flex;gap:10px}
        .sug img{width:64px;height:64px;object-fit:cover;border-radius:9px;flex-shrink:0;background:#f3f0fb}
        .sug b{display:block;font-size:13px}
        .sug .t{display:block;font-size:12px;color:#6b6585;margin:2px 0 6px;max-height:2.6em;overflow:hidden}
        .sug .q{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px}
        .sug .row{display:flex;gap:6px;align-items:center}
        .sug button{all:unset;cursor:pointer;padding:5px 12px;border-radius:999px;background:#6d3bff;color:#fff;font-size:12.5px;font-weight:600}
        .sug button.no{background:#efeaf9;color:#1b1530}
        .sug .row a{display:inline;padding:0 0 0 4px;font-size:12px;color:#6d3bff}
        .sug .ok{font-size:12.5px;color:#16a34a;font-weight:600}
      </style>
      <div class="menu" hidden role="menu">
        <p>Chercher ce produit chez les fournisseurs</p>
        ${rows}
      </div>
      <button class="btn" type="button" aria-haspopup="menu" aria-expanded="false">
        <span class="mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg></span>
        <span class="lbl">Trouver le fournisseur</span>
      </button>`;
    const btn = root.querySelector(".btn");
    const menu = root.querySelector(".menu");
    btn.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
    document.documentElement.appendChild(host);
    mountedMenu = menu;
    mountedLabel = root.querySelector(".lbl");
    mountedRoot = root;
  }
  // Fournisseur probable (même photo pas encore prouvée) : le membre confirme ou non. Deux « oui » de deux membres
  // différents et aucun « non » relient l'annonce au produit pour tout le monde. Aucune requête Vinted.
  async function suggestion(id, path) {
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "suggest:get", vintedId: id }); } catch { return; }
    const sg = r?.data;
    if (!sg?.product_id || !mountedRoot || location.pathname !== path || mountedRoot.querySelector(".sug")) return;
    const box = document.createElement("div");
    box.className = "sug";
    box.innerHTML = `<img alt="" referrerpolicy="no-referrer"><div><b>Fournisseur probable</b><span class="t"></span>
      <span class="q">C'est exactement le même produit ?</span>
      <div class="row"><button type="button" data-v="1">Oui</button><button type="button" class="no" data-v="0">Non</button><a target="_blank" rel="noopener noreferrer">Voir</a></div></div>`;
    if (/^https:\/\//.test(sg.image_url || "")) box.querySelector("img").src = sg.image_url; else box.querySelector("img").remove();
    box.querySelector(".t").textContent = String(sg.title || "").slice(0, 120);
    const link = box.querySelector("a");
    if (/^https:\/\//.test(sg.url || "")) link.href = sg.url; else link.remove();
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      const same = b.dataset.v === "1";
      box.querySelector(".row").innerHTML = '<span class="ok"></span>';
      box.querySelector(".ok").textContent = same ? "Merci ! Le lien sera ajouté s'il est confirmé." : "Merci, c'est noté.";
      try { await chrome.runtime.sendMessage({ type: "suggest:vote", productId: sg.product_id, vintedId: id, same }); } catch { /* rien */ }
      setTimeout(() => box.remove(), 2500);
    }));
    mountedRoot.querySelector(".btn")?.before(box);
  }

  let mountedLabel = null, mountedRoot = null;
  let mountedMenu = null;

  // Annonce du membre : Vinted affiche ses boutons de vendeur (« Modifier l'annonce », « Indiquer comme vendu »…).
  // Reconnu ainsi même quand la lecture des détails échoue ou que le compte n'est pas encore enregistré.
  // Annonce vendue : Vinted n'affiche plus que « Supprimer » (absent sur les annonces des autres).
  const OWNER_BTN = /^(modifier l.annonce|indiquer comme vendu|marquer comme r[ée]serv[ée]|booster|supprimer|edit listing|mark as sold|bump|delete)$/i;
  // Aussi les statistiques réservées au vendeur (« Impressions », « membres ont vu cet article »), affichées même vendue.
  const ownerControls = () => [...document.querySelectorAll("button, a")].some((b) => OWNER_BTN.test((b.textContent || "").replace(/\s+/g, " ").trim()))
    || /membres ont vu cet article|clic\(s\) sur cet article|members viewed this item/i.test(document.body.innerText || "");
  // Détail affiché sur la page (« Marque », « Taille », « État ») : valeur de la ligne qui porte ce libellé.
  function domDetail(re) {
    for (const el of document.querySelectorAll("div, span, dt, td")) {
      if (el.children.length || !re.test((el.textContent || "").trim())) continue;
      const row = el.parentElement;
      const val = [...(row?.children || [])].find((x) => x !== el && (x.textContent || "").trim())
        || el.nextElementSibling || row?.nextElementSibling;
      // Texte visible seulement (Vinted ajoute « Menu relatif à la marque » pour les lecteurs d'écran).
      const t = (val?.innerText || val?.textContent || "").split("\n")[0].replace(/menu relatif.*$/i, "").replace(/\s+/g, " ").trim();
      if (t && t.length < 60) return t;
    }
    return null;
  }
  // Photos de l'annonce seulement : la galerie (jamais la photo de profil du vendeur ni les annonces similaires).
  function domPhotos() {
    const gallery = [...document.querySelectorAll('img[data-testid*="item-photo"], [data-testid*="item-photo"] img, [class*="item-photos" i] img, [class*="item-photo" i] img')];
    const imgs = gallery.length ? gallery : [...document.querySelectorAll('img[src*="vinted.net"]')]
      .filter((i) => (i.naturalWidth || i.width) >= 200 && !i.closest('a[href*="/items/"], a[href*="/member/"], [class*="avatar" i], [class*="user" i], [data-testid*="user" i], [data-testid*="seller" i]'));
    const urls = imgs.map((i) => i.currentSrc || i.src).filter((u) => /^https:\/\//.test(u) && !/avatar|\/50x50\/|\/100x100\//i.test(u));
    return [...new Set(urls)].slice(0, 10);
  }

  // Vendeur : lien de son profil dans l'encadré de l'annonce (jamais l'avatar de l'en-tête, qui est le membre connecté).
  // Sur la page d'une annonce À SOI, Vinted n'affiche pas d'encadré vendeur : null.
  const pageSeller = () => [...document.querySelectorAll('a[href*="/member/"]')]
    .filter((x) => !x.closest('header, nav, [class*="header" i], a[href*="/items/"], [data-testid*="item-box"], [class*="feed" i]'))
    .map((x) => Number((x.getAttribute("href") || "").match(/\/member\/(\d+)/)?.[1]))
    .find(Boolean) || null;
  // Membre connecté : lien de son profil dans l'en-tête (menu du compte).
  const selfId = () => [...document.querySelectorAll('header a[href*="/member/"], nav a[href*="/member/"], [class*="header" i] a[href*="/member/"]')]
    .map((x) => Number((x.getAttribute("href") || "").match(/\/member\/(\d+)/)?.[1]))
    .find(Boolean) || null;

  /**
   * L'annonce est-elle au membre ? On regarde pendant ~8 s (boutons et statistiques du vendeur s'affichent tard).
   * Jamais d'envoi vers la base commune tant que ce n'est pas tranché, et jamais sans vendeur identifié.
   */
  async function ownership() {
    let sellerId = null;
    for (let k = 0; k < 8; k++) {
      if (ownerControls()) return { own: true, sellerId: pageSeller() };
      sellerId = pageSeller() || sellerId;
      const me = selfId();
      if (sellerId && me && sellerId === me) return { own: true, sellerId };
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (sellerId) {
      try { const r = await chrome.runtime.sendMessage({ type: "vinted:isOwn", sellerId }); if (r?.data?.own) return { own: true, sellerId }; } catch { return { own: true, sellerId }; }
    }
    return { own: false, sellerId };
  }

  async function crossPost(item, raw, retry = 6) {
    if (!mountedMenu || mountedMenu.dataset.lbc) return;
    const domSeller = pageSeller();
    const sellerId = Number(raw?.user_id ?? raw?.user?.id) || domSeller;
    const byPage = ownerControls();
    let own = byPage;
    if (!own && sellerId) { try { const r = await chrome.runtime.sendMessage({ type: "vinted:isOwn", sellerId }); own = !!r?.data?.own; } catch { return; } }
    // Les boutons et statistiques du vendeur s'affichent parfois tard : on regarde encore quelques fois.
    if (!own) { if (retry > 0) setTimeout(() => crossPost(item, raw, retry - 1).catch(() => {}), 2000); return; }
    // Compte reconnu par la page : enregistré comme compte du membre (ses annonces ne vont jamais dans la base commune).
    if (byPage && sellerId) chrome.runtime.sendMessage({ type: "vinted:self", id: sellerId, market: location.hostname.split(".").pop() }).catch(() => {});
    if (mountedMenu.dataset.lbc) return;
    // Annonce vendue comprise : on peut la remettre en vente ailleurs (même article en stock).
    const photos = raw ? (raw.photos || []).map((p) => p.full_size_url || p.url).filter((u) => /^https:\/\//.test(u || "")).slice(0, 10) : domPhotos();
    const price = Number(raw?.price?.amount ?? raw?.price ?? item.price) || null;
    const descEl = document.querySelector('[itemprop="description"], [data-testid*="description"]');
    const description = String(raw?.description || descEl?.textContent || document.querySelector('meta[name="description"]')?.content || "").trim();
    const listing = { vintedId: Number(item.vinted_id) || null, title: String(raw?.title || item.title).replace(/\s*\|\s*Vinted.*$/i, "").slice(0, 70), description, price, category: null, photos, from: "vinted" };
    // Catégorie Vinted (fil d'Ariane de l'annonce : « Hommes / Vêtements / … / Maillots »), pour choisir la catégorie ailleurs.
    const crumbs = [...document.querySelectorAll('[itemtype*="BreadcrumbList"] a, nav[aria-label*="readcrumb" i] a, [class*="breadcrumb" i] a, [data-testid*="breadcrumb" i] a')]
      .map((x) => (x.innerText || x.textContent || "").replace(/\s+/g, " ").trim()).filter((x) => x && x.length < 60 && !/^(accueil|home|vinted)$/i.test(x));
    const extra = {
      categoryPath: [...new Set(crumbs)].slice(0, 6),
      brand: raw?.brand_title || raw?.brand || domDetail(/^(marque|brand)$/i),
      size: raw?.size_title || raw?.size || domDetail(/^(taille|size)$/i),
      condition: raw?.status || raw?.condition || domDetail(/^(état|etat|condition)$/i),
      color: domDetail(/^(couleur|couleurs|color|colour)$/i),
    };
    let posted = {};
    try { const r = await chrome.runtime.sendMessage({ type: "vinted:postedIds" }); posted = r?.data || {}; } catch { /* rien */ }
    const done = (ch) => (posted[ch] || []).map(String).includes(String(item.vinted_id));
    // Sur sa propre annonce : un bouton par site, au-dessus de « Trouver le fournisseur », et « Reposter partout »
    // qui ouvre les trois sites d'un coup (chacun avec l'annonce remplie).
    mountedMenu.dataset.lbc = "1"; // une seule fois par annonce
    const ICON = '<span class="mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>';
    const pill = (label, cls, onClick) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = `btn ${cls || ""}`;
      b.innerHTML = `${ICON}<span>${label}</span>`;
      b.addEventListener("click", onClick);
      return b;
    };
    const full = { ...listing, ...extra };
    const stack = document.createElement("div");
    stack.className = "stack";
    stack.append(
      pill("Reposter partout", "all", () => chrome.runtime.sendMessage({ type: "xpost:all", listing: full }).catch(() => {})),
      ...[["beebs", "Beebs"], ["opla", "Opla"], ["lbc", "Leboncoin"], ["depop", "Depop"], ["facebook", "Facebook"]].map(([ch, label]) =>
        pill(`${done(ch) ? "✓ " : ""}Reposter sur ${label}`, done(ch) ? "done" : "", () => chrome.runtime.sendMessage({ type: `${ch}:open`, listing: full }).catch(() => {}))),
    );
    mountedRoot?.querySelector(".btn")?.before(stack);
    document.getElementById("aliedge-source")?.setAttribute("data-repost", String(stack.children.length));
  }

  // Chaque annonce ouverte enrichit la base commune : vendeur, marque, taille, favoris, date de mise en ligne.
  // Une seule lecture des détails publics, comme la page elle-même (même origine, mêmes cookies).
  async function details(id) {
    return null; // plus aucune requête à Vinted : seules les informations affichées par la page sont lues
    // eslint-disable-next-line no-unreachable
    try {
      const res = await fetch(`${location.origin}/api/v2/items/${id}/details`, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = await res.json();
      return body && body.item && body.item.id ? body.item : null;
    } catch { return null; }
  }

  async function run() {
    const path = location.pathname;
    const item = readItem();
    if (!item) return;
    mount(item);
    const raw = await details(item.vinted_id);
    crossPost(item, raw).catch(() => {});
    // Annonce du membre (la sienne) : jamais dans la base commune, enregistrée comme « à lui » (effacée si elle y était).
    // Annonce sans vendeur identifiable : jamais envoyée (c'est le cas de sa propre annonce, sans encadré vendeur).
    const who = await ownership();
    if (location.pathname !== path) return;
    try {
      if (who.own) {
        chrome.runtime.sendMessage({ type: "vinted:ownItems", items: [{ ...item, status: item.status === "sold" ? "sold" : "active" }], single: true, sellerId: who.sellerId, market: location.hostname.split(".").pop() });
        return;
      }
      if (!who.sellerId) return;
      // Toutes les photos affichées par la galerie (aucune requête en plus) : le fournisseur est retrouvé même si
      // le vendeur a mis en couverture la 2e ou la 3e photo de la fiche.
      const photos = domPhotos().slice(0, 8);
      if (raw) chrome.runtime.sendMessage({ type: "vinted:item", item: { ...item, photos, seller_id: who.sellerId }, raw });
      else if (item.status || item.price != null) chrome.runtime.sendMessage({ type: "vinted:item", item: { ...item, photos, seller_id: who.sellerId, status: item.status || "active" } });
      suggestion(item.vinted_id, path).catch(() => {});
    } catch { /* extension rechargée */ }
  }

  setTimeout(run, 1200);
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname !== last) {
      last = location.pathname;
      document.getElementById("aliedge-source")?.remove();
      setTimeout(run, 1200);
    }
  }, 1000);
})();
