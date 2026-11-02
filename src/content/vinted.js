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
  }
  let mountedLabel = null;
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
      const t = (val?.textContent || "").replace(/\s+/g, " ").trim();
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
    if (!mountedMenu || mountedMenu.querySelector("[data-lbc]")) return;
    const sellerId = Number(raw?.user_id ?? raw?.user?.id) || null;
    const byPage = ownerControls();
    let own = byPage;
    if (!own && sellerId) { try { const r = await chrome.runtime.sendMessage({ type: "vinted:isOwn", sellerId }); own = !!r?.data?.own; } catch { return; } }
    if (!own) { if (retry) setTimeout(() => crossPost(item, raw, false).catch(() => {}), 2500); return; }
    // Compte reconnu par la page : enregistré comme compte du membre (ses annonces ne vont jamais dans la base commune).
    if (byPage && sellerId) chrome.runtime.sendMessage({ type: "vinted:self", id: sellerId, market: location.hostname.split(".").pop() }).catch(() => {});
    if (mountedMenu.querySelector("[data-lbc]")) return;
    const photos = raw ? (raw.photos || []).map((p) => p.full_size_url || p.url).filter((u) => /^https:\/\//.test(u || "")).slice(0, 10) : domPhotos();
    const price = Number(raw?.price?.amount ?? raw?.price ?? item.price) || null;
    const descEl = document.querySelector('[itemprop="description"], [data-testid*="description"]');
    const description = String(raw?.description || descEl?.textContent || document.querySelector('meta[name="description"]')?.content || "").trim();
    const listing = { vintedId: Number(item.vinted_id) || null, title: String(raw?.title || item.title).replace(/\s*\|\s*Vinted.*$/i, "").slice(0, 70), description, price, category: null, photos, from: "vinted" };
    const sep = document.createElement("p");
    sep.textContent = "Vendre aussi ailleurs";
    const extra = {
      brand: raw?.brand_title || raw?.brand || domDetail(/^(marque|brand)$/i),
      size: raw?.size_title || raw?.size || domDetail(/^(taille|size)$/i),
      condition: raw?.status || raw?.condition || domDetail(/^(état|etat|condition)$/i),
    };
    let posted = {};
    try { const r = await chrome.runtime.sendMessage({ type: "vinted:postedIds" }); posted = r?.data || {}; } catch { /* rien */ }
    const done = (ch) => (posted[ch] || []).map(String).includes(String(item.vinted_id));
    // « Publier sur Beebs / Opla / Leboncoin » : AliEdge ouvre le site, ouvre le formulaire de vente et remplit
    // l'annonce (photos comprises). « ✓ » quand elle y a déjà été publiée.
    const chBtn = (ch, label) => {
      const b = document.createElement("a");
      b.href = "#"; b.dataset[ch] = "1";
      b.innerHTML = `${done(ch) ? "✓ " : ""}Publier sur ${label}<span aria-hidden="true">${done(ch) ? "déjà publiée" : "↗"}</span>`;
      b.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: `${ch}:open`, listing: { ...listing, ...extra } }).catch(() => {});
      });
      return b;
    };
    // Sur sa propre annonce, reposter passe en premier : le bouton s'appelle « Reposter ailleurs ».
    const fold = document.createElement("p");
    fold.textContent = "Chercher ce produit chez les fournisseurs";
    mountedMenu.querySelector("p")?.remove();
    mountedMenu.prepend(sep, chBtn("beebs", "Beebs"), chBtn("opla", "Opla"), chBtn("lbc", "Leboncoin"), fold);
    if (mountedLabel) mountedLabel.textContent = "Reposter ailleurs";
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
