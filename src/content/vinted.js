// Page d'une annonce Vinted : « Trouver le fournisseur » + statut de l'annonce pour le catalogue.
// Sur une annonce du membre lui-même : « Publier aussi sur Leboncoin » et « Publier sur Beebs / Opla » (texte, prix et
// photos repris dans l'assistant de dépôt de chaque site ; le membre vérifie et publie lui-même).
(() => {
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
    return { vinted_id: id, market: marketOf(location.hostname), title, price, photo_url: photo, url: location.href.split("?")[0], status };
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
  let mountedLabel = null, mountedRoot = null;
  let mountedMenu = null;

  // Annonce du membre : Vinted affiche ses boutons de vendeur (« Modifier l'annonce », « Indiquer comme vendu »…).
  // Reconnu ainsi même quand la lecture des détails échoue ou que le compte n'est pas encore enregistré.
  const OWNER_BTN = /^(modifier l.annonce|indiquer comme vendu|marquer comme r[ée]serv[ée]|booster|edit listing|mark as sold|bump)$/i;
  const ownerControls = () => [...document.querySelectorAll("button, a")].some((b) => OWNER_BTN.test((b.textContent || "").replace(/\s+/g, " ").trim()));
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
  function domPhotos() {
    const urls = [...document.querySelectorAll('img[src*="vinted.net"]')]
      .filter((i) => (i.naturalWidth || i.width) >= 200 && !i.closest('a[href*="/items/"]:not([href*="' + location.pathname.split("/")[2] + '"])'))
      .map((i) => i.currentSrc || i.src).filter((u) => /^https:\/\//.test(u));
    return [...new Set(urls)].slice(0, 10);
  }

  async function crossPost(item, raw, retry = true) {
    if (!mountedMenu || mountedMenu.dataset.lbc) return;
    const sellerId = Number(raw?.user_id ?? raw?.user?.id) || null;
    const byPage = ownerControls();
    let own = byPage;
    if (!own && sellerId) { try { const r = await chrome.runtime.sendMessage({ type: "vinted:isOwn", sellerId }); own = !!r?.data?.own; } catch { return; } }
    if (!own) { if (retry) setTimeout(() => crossPost(item, raw, false).catch(() => {}), 2500); return; }
    // Compte reconnu par la page : enregistré comme compte du membre (ses annonces ne vont jamais dans la base commune).
    if (byPage && sellerId) chrome.runtime.sendMessage({ type: "vinted:self", id: sellerId, market: location.hostname.split(".").pop() }).catch(() => {});
    if (mountedMenu.dataset.lbc) return;
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
      ...[["beebs", "Beebs"], ["opla", "Opla"], ["lbc", "Leboncoin"]].map(([ch, label]) =>
        pill(`${done(ch) ? "✓ " : ""}Reposter sur ${label}`, done(ch) ? "done" : "", () => chrome.runtime.sendMessage({ type: `${ch}:open`, listing: full }).catch(() => {}))),
    );
    mountedRoot?.querySelector(".btn")?.before(stack);
  }

  // Chaque annonce ouverte enrichit la base commune : vendeur, marque, taille, favoris, date de mise en ligne.
  // Une seule lecture des détails publics, comme la page elle-même (même origine, mêmes cookies).
  async function details(id) {
    try {
      const res = await fetch(`${location.origin}/api/v2/items/${id}/details`, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = await res.json();
      return body && body.item && body.item.id ? body.item : null;
    } catch { return null; }
  }

  async function run() {
    const item = readItem();
    if (!item) return;
    mount(item);
    const raw = await details(item.vinted_id);
    crossPost(item, raw).catch(() => {});
    try {
      if (raw) chrome.runtime.sendMessage({ type: "vinted:item", item, raw });
      else if (item.status || item.price != null) chrome.runtime.sendMessage({ type: "vinted:item", item: { ...item, status: item.status || "active" } });
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
