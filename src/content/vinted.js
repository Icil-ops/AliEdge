// Page d'une annonce Vinted : « Trouver le fournisseur » + statut de l'annonce pour le catalogue.
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
        Trouver le fournisseur
      </button>`;
    const btn = root.querySelector(".btn");
    const menu = root.querySelector(".menu");
    btn.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.hidden = true; });
    document.documentElement.appendChild(host);
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
