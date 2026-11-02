// Sur Leboncoin (si activé) : outils AliEdge sur les pages que le membre ouvre. Aucune requête vers Leboncoin.
// - Annonce : « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein), relier le produit fournisseur,
//   « Confier à la warehouse » (la warehouse achète, emballe et expédie à la place du membre).
// - Dépôt d'annonce : l'annonce rédigée dans AliEdge (version Leboncoin, ou reprise d'une annonce Vinted du membre)
//   prête à copier, ou à remplir d'un clic, photos comprises. Le membre relit et publie lui-même.
// - Messagerie : réponses toutes prêtes à insérer (jamais envoyées par AliEdge) et aide à la négociation.
// - Résultats de recherche : badge sur les produits déjà repérés dans le catalogue AliEdge (fournisseur, prix Vinted).
(() => {
  if (window.__aliedgeLbcTools) return;
  window.__aliedgeLbcTools = true;
  const WAREHOUSE = "https://ivanbara.com/warehouse/";
  const send = async (msg) => { try { return await chrome.runtime.sendMessage(msg); } catch { return null; } };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const idFromUrl = (u) => Number(String(u || "").match(/\/(?:ad\/[^/]+|vi)\/(\d{6,15})/)?.[1]) || null;

  const CSS = `
    :host{font:500 14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1530}
    .fab{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;background:#1b1530;color:#fff;font-weight:600;box-shadow:0 10px 30px -8px rgba(27,21,48,.55)}
    .mark{width:28px;height:28px;border-radius:50%;background:#6d3bff;display:grid;place-items:center}
    .panel{position:absolute;right:0;bottom:56px;width:300px;background:#fff;border-radius:16px;padding:12px;box-shadow:0 18px 50px -12px rgba(27,21,48,.45);border:1px solid #ecebf1}
    .panel[hidden]{display:none}
    h4{margin:4px 4px 6px;font-size:12px;color:#74708a;font-weight:650;text-transform:uppercase;letter-spacing:.04em}
    a.row{display:flex;justify-content:space-between;padding:9px 10px;border-radius:10px;color:inherit;text-decoration:none}
    a.row:hover{background:#f4f3f8}
    hr{border:0;border-top:1px solid #ecebf1;margin:8px 0}
    form{display:flex;gap:6px;padding:0 4px}
    input{flex:1;min-width:0;padding:8px 10px;border:1px solid #ecebf1;border-radius:10px;font:inherit;font-size:13px}
    button.b{all:unset;cursor:pointer;padding:8px 12px;border-radius:10px;background:#f4f3f8;font-weight:600;font-size:13px;text-align:center}
    button.p{background:#6d3bff;color:#fff}
    .wide{display:block;margin:4px}
    p.msg{margin:6px 6px 0;font-size:12px;color:#74708a}
    .f{margin:8px 4px}.f b{display:block;font-size:12px;color:#74708a;margin-bottom:3px}
    .f div{background:#f4f3f8;border-radius:10px;padding:8px 10px;font-size:13px;white-space:pre-wrap;max-height:120px;overflow:auto}
    .f button{margin-top:4px}
    .thumbs{display:flex;gap:4px;flex-wrap:wrap;background:none!important;padding:0!important}.thumbs img{width:44px;height:56px;object-fit:cover;border-radius:6px}
    .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .chip{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;background:#f4f3f8;font-size:12.5px;font-weight:600;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .chip:hover{background:#ebe6fb}
    .neg{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap}.neg input{max-width:90px}
    .good{color:#0b8f62;font-weight:700}.bad{color:#cf3346;font-weight:700}
    a:focus-visible,button:focus-visible{outline:3px solid #8f6bff;outline-offset:2px}`;

  function shell(id, label) {
    if (document.getElementById(id)) return null;
    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="panel" hidden></div>
      <button class="fab" type="button" aria-expanded="false"><span class="mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg></span>${esc(label)}</button>`;
    const fab = root.querySelector(".fab"), panel = root.querySelector(".panel");
    fab.addEventListener("click", () => { panel.hidden = !panel.hidden; fab.setAttribute("aria-expanded", String(!panel.hidden)); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.hidden = true; });
    document.documentElement.appendChild(host);
    return { host, root, panel };
  }

  // ───────── Page d'une annonce
  function readAd() {
    const id = idFromUrl(location.pathname);
    if (!id) return null;
    let ld = null;
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const j = JSON.parse(s.textContent || "null"); if (j && (j["@type"] === "Product" || j.offers)) { ld = j; break; } } catch { /* autre bloc */ }
    }
    const title = String(ld?.name || document.querySelector('[data-qa-id="adview_title"] h1, [data-qa-id="adview_title"]')?.textContent || "").trim();
    if (!title) return null;
    const img = Array.isArray(ld?.image) ? ld.image[0] : ld?.image;
    const price = Number(ld?.offers?.price) || Number(String(document.querySelector('[data-qa-id="adview_price"]')?.textContent || "").replace(/[^\d,]/g, "").replace(",", ".")) || null;
    return { id, title: title.slice(0, 200), price, photo: /^https:\/\//.test(String(img || "")) ? String(img) : null };
  }

  function supplierLinks(ad) {
    const q = encodeURIComponent(ad.title.replace(/\b(neuf|neuve|new|jamais porté|taille \w+|tbe|très bon état)\b/gi, "").trim().split(/\s+/).slice(0, 6).join(" "));
    const links = [
      ["AliExpress", `https://fr.aliexpress.com/w/wholesale-${q.replace(/%20/g, "-")}.html`],
      ["Temu", `https://www.temu.com/search_result.html?search_key=${q}`],
      ["Shein", `https://fr.shein.com/pdsearch/${q}/`],
    ];
    if (ad.photo) links.unshift(["Google Lens (photo)", `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(ad.photo)}`]);
    return links;
  }

  const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function mountAd(ad) {
    const ui = shell("aliedge-lbc-tools", "AliEdge");
    if (!ui) return;
    const { panel } = ui;
    panel.innerHTML = `
      <h4>Trouver le fournisseur</h4>
      ${supplierLinks(ad).map(([n, u]) => `<a class="row" href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}<span aria-hidden="true">↗</span></a>`).join("")}
      <hr>
      <h4>Lien du produit fournisseur</h4>
      <form data-link><input type="url" placeholder="Colle ici le lien du produit trouvé" aria-label="Lien du produit fournisseur"><button class="b" type="submit">Relier</button></form>
      <p class="msg" data-linkmsg></p>
      <hr>
      <button class="b p wide" type="button" data-wh>Confier à la warehouse</button>
      <p class="msg">Tu as vendu cet article ? La warehouse l'achète, l'emballe et l'expédie à ta place.</p>`;
    panel.querySelector("[data-link]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = e.currentTarget.querySelector("input").value.trim();
      const msg = panel.querySelector("[data-linkmsg]");
      const r = await send({ type: "lbc:link", listId: ad.id, url });
      msg.textContent = r?.ok ? "Produit relié : il rejoint le catalogue commun." : (r?.error || "Ouvre AliEdge et connecte-toi");
    });
    panel.querySelector("[data-wh]").addEventListener("click", async () => {
      const r = await send({ type: "lbc:itemInfo", title: ad.title });
      const sup = r?.ok ? r.data : null;
      const payload = { src: "Leboncoin", ref: String(ad.id), title: ad.title, price: ad.price, supplier: sup ? { url: sup.url, price: sup.price, sure: !!sup.sure } : null };
      window.open(`${WAREHOUSE}?ae=${b64(payload)}`, "_blank", "noopener");
    });
  }

  // ───────── Dépôt d'une annonce : l'annonce rédigée dans AliEdge, prête à copier ou à remplir
  function setValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const visible = (el) => !!el && el.offsetParent !== null && !el.disabled && !el.readOnly;
  function findField(kind) {
    const sel = {
      title: 'input[name*="subject" i], input[name*="title" i], input[id*="subject" i], input[id*="title" i]',
      body: 'textarea[name*="body" i], textarea[name*="description" i], textarea[id*="body" i], textarea[id*="description" i], textarea',
      price: 'input[name*="price" i], input[id*="price" i]',
    }[kind];
    return [...document.querySelectorAll(sel)].find(visible) || null;
  }

  const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  function bestSlot(grid) {
    let b = null;
    grid.forEach((row, d) => row.forEach((v, h) => { if (!b || v > b.v) b = { v, d, h }; }));
    return b && b.v > 0 ? `${DAYS[b.d]} entre ${b.h * 3} h et ${b.h * 3 + 3} h` : null;
  }
  // Photos : récupérées puis déposées dans le champ « photos » de la page, comme si le membre les avait choisies.
  async function addPhotos(urls) {
    const input = [...document.querySelectorAll('input[type="file"]')].find((i) => !i.disabled && /image|^$/.test(i.accept || ""));
    if (!input || !urls.length) return 0;
    const dt = new DataTransfer();
    for (const [i, u] of urls.slice(0, 10).entries()) {
      try {
        const res = await fetch(u, { mode: "cors", credentials: "omit" });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (!/^image\//.test(blob.type)) continue;
        dt.items.add(new File([blob], `photo-${i + 1}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`, { type: blob.type }));
      } catch { /* image refusée par son site */ }
      if (!input.multiple && dt.files.length) break;
    }
    if (!dt.files.length) return 0;
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return dt.files.length;
  }

  async function mountDeposit() {
    const r = await send({ type: "lbc:listing" });
    const l = r?.ok ? r.data : null;
    const ui = shell("aliedge-lbc-deposit", "Annonce AliEdge");
    if (!ui) return;
    const { panel } = ui;
    if (!l) {
      panel.innerHTML = `<h4>Annonce AliEdge</h4><p class="msg">Dans AliEdge, analyse un produit puis clique sur « Annonce » et choisis « Leboncoin » : l'annonce apparaîtra ici, prête à copier.</p>`;
      return;
    }
    const field = (k, label, v) => v ? `<div class="f"><b>${esc(label)}</b><div>${esc(v)}</div><button class="b" type="button" data-copy="${k}">Copier</button></div>` : "";
    const q = l.queue;
    panel.innerHTML = `<h4>Annonce AliEdge${q ? ` · ${q.index + 1} / ${q.total}` : ""}</h4>
      ${field("title", "Titre", l.title)}${field("body", "Description", l.description)}${field("price", "Prix conseillé", l.price ? String(l.price) : "")}
      ${l.category ? `<p class="msg">Catégorie : ${esc(l.category)}</p>` : ""}
      ${(l.photos || []).length ? `<div class="f"><b>Photos (${l.photos.length})</b><div class="thumbs">${l.photos.slice(0, 10).map((u) => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer">`).join("")}</div><button class="b" type="button" data-photos>Ajouter les photos à l'annonce</button></div>` : ""}
      <button class="b p wide" type="button" data-fill>Remplir les champs de la page</button>
      <p class="msg" data-best></p>
      <p class="msg" data-fillmsg>Relis tout avant de publier : c'est toi qui publies l'annonce.</p>
      ${q ? `<button class="b p wide" type="button" data-next>Publiée : annonce suivante</button><div class="bar" style="margin:4px"><button class="chip" type="button" data-skip>Passer celle-ci</button><button class="chip" type="button" data-stop>Arrêter</button></div>`
        : l.vintedId ? `<button class="b wide" type="button" data-done>Annonce publiée : effacer de l'aide</button>` : ""}`;
    panel.hidden = false;
    const goNext = async (posted) => {
      const r = await send({ type: "lbc:next", posted });
      const d = r?.ok ? r.data : null;
      ui.host.remove();
      if (d && !d.done) location.href = d.sell || "https://www.leboncoin.fr/deposer-une-annonce";
    };
    panel.querySelector("[data-next]")?.addEventListener("click", () => goNext(true));
    panel.querySelector("[data-skip]")?.addEventListener("click", () => goNext(false));
    panel.querySelector("[data-stop]")?.addEventListener("click", async () => { await send({ type: "lbc:stopQueue" }); ui.host.remove(); });
    panel.querySelector("[data-done]")?.addEventListener("click", async () => { await send({ type: "lbc:clearListing" }); ui.host.remove(); });
    const vals = { title: l.title, body: l.description, price: l.price ? String(Math.round(l.price)) : "" };
    panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(vals[b.dataset.copy]); b.textContent = "Copié"; } catch { b.textContent = "Copie impossible"; }
      setTimeout(() => { b.textContent = "Copier"; }, 1500);
    }));
    panel.querySelector("[data-photos]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget, msg = panel.querySelector("[data-fillmsg]");
      b.textContent = "Ajout des photos…";
      const n = await addPhotos(l.photos || []);
      if (n > 0) { b.textContent = `${n} photo${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""}`; return; }
      b.textContent = "Ajouter les photos à l'annonce";
      msg.innerHTML = `Ajout automatique impossible sur cette étape : ouvre les photos et enregistre-les, puis glisse-les dans l'annonce. ${(l.photos || []).slice(0, 10).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">photo ${i + 1}</a>`).join(" · ")}`;
    });
    send({ type: "lbc:bestTimes", search: null }).then((r) => {
      const d = r?.ok ? r.data : null;
      const best = d && d.n >= 20 ? bestSlot(d.grid) : null;
      if (best) panel.querySelector("[data-best]").textContent = `Meilleur moment pour publier : ${best} (d'après ${d.n} ventes repérées, estimation).`;
    });
    panel.querySelector("[data-fill]").addEventListener("click", () => {
      let n = 0;
      for (const k of ["title", "body", "price"]) { const el = vals[k] && findField(k); if (el) { setValue(el, vals[k]); n++; } }
      panel.querySelector("[data-fillmsg]").textContent = n
        ? `${n} champ${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}. Relis tout avant de publier : c'est toi qui publies l'annonce.`
        : "Champs pas encore affichés sur cette étape : utilise les boutons « Copier ».";
    });
    // Publication rapide (annonce reprise de Vinted) : le dépôt Leboncoin se fait en plusieurs étapes, chaque champ
    // est rempli dès qu'il apparaît (seulement s'il est vide), les photos dès que le champ photos est là.
    if (l.from === "vinted") {
      const filled = new Set();
      let photosDone = false;
      const tick = async () => {
        if (!document.getElementById("aliedge-lbc-deposit")) return clearInterval(auto);
        for (const k of ["title", "body", "price"]) {
          if (filled.has(k) || !vals[k]) continue;
          const el = findField(k);
          if (el && !el.value) { setValue(el, vals[k]); filled.add(k); }
        }
        if (!photosDone && (l.photos || []).length && document.querySelector('input[type="file"]')) { photosDone = true; const n = await addPhotos(l.photos); if (n) panel.querySelector("[data-fillmsg]").textContent = `${n} photo${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""}. Relis tout avant de publier : c'est toi qui publies l'annonce.`; }
      };
      const auto = setInterval(tick, 1500);
      setTimeout(tick, 900);
    }
  }

  // ───────── Messagerie : réponses toutes prêtes + aide à la négociation (rien n'est envoyé par AliEdge)
  const DEFAULT_REPLIES = [
    "Bonjour, oui l'article est toujours disponible 😊",
    "Bonjour, je peux l'envoyer avec la livraison Leboncoin : tu peux faire la demande d'achat directement depuis l'annonce.",
    "Merci pour ta proposition ! Je peux descendre à {prix} €, c'est mon dernier prix.",
    "Merci pour ton achat ! L'envoi est en préparation, je te tiens au courant.",
    "Bonjour, désolé, l'article n'est plus disponible.",
  ];
  function messageBox() {
    return [...document.querySelectorAll("textarea, [contenteditable='true']")].filter(visible).pop() || null;
  }
  function insertText(el, text) {
    if (el instanceof HTMLTextAreaElement) {
      const cur = el.value;
      setValue(el, cur ? `${cur.replace(/\s+$/, "")} ${text}` : text);
    } else {
      el.focus();
      document.execCommand("insertText", false, text);
    }
    el.focus();
  }
  function convTitle() {
    const a = [...document.querySelectorAll('a[href*="/ad/"], a[href*="/vi/"]')].find((x) => (x.textContent || "").trim().length > 3);
    return (a?.textContent || "").trim().slice(0, 200);
  }
  async function mountMessages() {
    if (document.getElementById("aliedge-lbc-replies")) return;
    const box = messageBox();
    if (!box) return;
    const r = await send({ type: "lbc:replies" });
    const replies = (r?.ok && Array.isArray(r.data) && r.data.length ? r.data : DEFAULT_REPLIES);
    const host = document.createElement("div");
    host.id = "aliedge-lbc-replies";
    host.style.cssText = "margin:6px 0;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="bar">${replies.map((t, i) => `<button class="chip" type="button" data-r="${i}" title="${esc(t)}">${esc(t.replace(/\{prix\}/g, "…"))}</button>`).join("")}</div>
      <div class="neg"><span class="msg" style="margin:0">Offre reçue</span><input type="number" min="1" step="1" placeholder="€" aria-label="Montant de l'offre"><span class="msg" data-neg style="margin:0"></span></div>`;
    let counter = null;
    root.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
      const el = messageBox(); if (!el) return;
      let t = replies[Number(b.dataset.r)];
      if (t.includes("{prix}")) t = t.replace(/\{prix\}/g, counter ? String(counter) : "…");
      insertText(el, t);
    }));
    const inp = root.querySelector("input"), out = root.querySelector("[data-neg]");
    let tmr = null;
    inp.addEventListener("input", () => {
      clearTimeout(tmr);
      tmr = setTimeout(async () => {
        const offer = Number(inp.value);
        if (!(offer > 0)) { out.textContent = ""; return; }
        const res = await send({ type: "lbc:offer", title: convTitle(), offer });
        const d = res?.ok ? res.data : null;
        if (!d || d.margin == null) { out.textContent = "Relie le produit fournisseur à cette annonce pour voir ta marge."; counter = null; return; }
        counter = d.margin >= 5 ? null : d.floor;
        out.innerHTML = `Si tu acceptes : <span class="${d.margin > 0 ? "good" : "bad"}">${d.margin > 0 ? "+" : ""}${d.margin.toFixed(2).replace(".", ",")} €</span> de marge${counter ? ` · contre-offre conseillée : <b>${counter} €</b>` : " · offre correcte"}`;
      }, 350);
    });
    (box.closest("form") || box.parentElement).insertAdjacentElement("beforebegin", host);
  }

  // ───────── Résultats de recherche : badge sur les produits déjà repérés dans le catalogue AliEdge
  const badged = new WeakSet();
  let badgeTimer = null;
  async function badgeCards() {
    badgeTimer = null;
    const cards = [...document.querySelectorAll("article")].filter((a) => !badged.has(a) && a.querySelector('a[href*="/ad/"]'));
    if (!cards.length) return;
    cards.forEach((a) => badged.add(a));
    const titles = cards.map((a) => (a.getAttribute("aria-label") || a.querySelector("p")?.textContent || "").trim());
    const r = await send({ type: "lbc:badges", titles });
    const res = r?.ok ? r.data : [];
    res.forEach((m, i) => {
      if (!m) return;
      const host = document.createElement("span");
      host.className = "aliedge-lbc-badge";
      host.style.cssText = "position:absolute;top:8px;left:8px;z-index:3;";
      const root = host.attachShadow({ mode: "closed" });
      const name = { aliexpress: "AliExpress", temu: "Temu", shein: "Shein" }[m.platform] || "Fournisseur";
      const eur = (n) => (n == null ? "?" : `${Number(n).toFixed(2).replace(".", ",")} €`);
      root.innerHTML = `<style>span{all:initial;display:inline-block;font:600 11.5px/1.25 ui-sans-serif,system-ui,sans-serif;background:#1b1530;color:#fff;padding:5px 8px;border-radius:8px;box-shadow:0 4px 14px -6px rgba(0,0,0,.5)} b{color:#c4b5fd}</style><span title="Produit repéré dans le catalogue AliEdge">${name} ${eur(m.price)} · Vinted <b>${eur(m.vinted)}</b></span>`;
      const card = cards[i];
      const ph = card.querySelector("img")?.parentElement || card;
      if (getComputedStyle(ph).position === "static") ph.style.position = "relative";
      ph.appendChild(host);
    });
  }
  const isSearch = () => /^\/(recherche|c\/|annonces|boutique)/.test(location.pathname);
  new MutationObserver(() => { if (isSearch() && !badgeTimer) badgeTimer = setTimeout(badgeCards, 1200); }).observe(document.documentElement, { childList: true, subtree: true });

  function run() {
    if (/^\/messages/.test(location.pathname)) { mountMessages(); setTimeout(mountMessages, 2500); return; }
    if (isSearch()) { setTimeout(badgeCards, 800); }
    document.getElementById("aliedge-lbc-tools")?.remove();
    if (/^\/deposer-une-annonce/.test(location.pathname)) { if (!document.getElementById("aliedge-lbc-deposit")) mountDeposit(); return; }
    document.getElementById("aliedge-lbc-deposit")?.remove();
    const ad = readAd();
    if (ad) mountAd(ad);
  }
  setTimeout(run, 1200);
  let last = location.pathname;
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; setTimeout(run, 1200); } }, 1000);
})();
