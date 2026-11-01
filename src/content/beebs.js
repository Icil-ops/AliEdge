// Sur Beebs (si activé, accès facultatif à beebs.app) : outils AliEdge sur les pages que le membre ouvre.
// AUCUNE requête vers Beebs : on lit seulement ce que la page affiche.
// - Article : « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein) et « + Concurrent » pour son vendeur.
// - Dressing : « + Concurrent » ; dressing d'un concurrent suivi relevé (annonces disparues = ventes probables).
// - Dépôt : l'annonce préparée dans AliEdge (depuis une annonce Vinted du membre) est remplie d'un clic,
//   photos comprises. Le membre vérifie et clique lui-même sur « Mettre en vente ».
(() => {
  if (window.__aliedgeBeebs) return;
  window.__aliedgeBeebs = true;
  const send = async (msg) => { try { return await chrome.runtime.sendMessage(msg); } catch { return null; } };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
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

  function setValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const visible = (el) => !!el && el.offsetParent !== null && !el.disabled && !el.readOnly;
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


  const productId = () => location.pathname.match(/^\/[a-z]{2}\/p\/(\d{3,15})/)?.[1] || null;
  const dressingId = () => location.pathname.match(/^\/[a-z]{2}\/dressing\/([A-Za-z0-9_-]{10,64})/)?.[1] || null;
  const uidFrom = (href) => String(href || "").match(/\/dressing\/([A-Za-z0-9_-]{10,64})/)?.[1] || null;
  let tracked = new Set();

  // ───────── Article : fournisseur + vendeur
  function readProduct() {
    let ld = null;
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const j = JSON.parse(s.textContent || "null"); if (j && j["@type"] === "Product") { ld = j; break; } } catch { /* autre bloc */ }
    }
    const title = clean(ld?.name || document.querySelector("h1")?.textContent);
    if (!title) return null;
    const img = Array.isArray(ld?.image) ? ld.image[0] : ld?.image;
    const seller = document.querySelector('a[href*="/dressing/"]');
    return { title, photo: /^https:\/\//.test(String(img || "")) ? String(img) : null, sellerUid: uidFrom(seller?.getAttribute("href")), sellerName: clean(seller?.textContent).slice(0, 80) || null };
  }
  function supplierLinks(p) {
    const q = encodeURIComponent(p.title.replace(/\b(neuf|neuve|tbe|très bon état|bon état|taille \S+|\d+ ?(mois|ans))\b/gi, "").trim().split(/\s+/).slice(0, 6).join(" "));
    const links = [["AliExpress", `https://fr.aliexpress.com/w/wholesale-${q.replace(/%20/g, "-")}.html`], ["Temu", `https://www.temu.com/search_result.html?search_key=${q}`], ["Shein", `https://fr.shein.com/pdsearch/${q}/`]];
    if (p.photo) links.unshift(["Google Lens (photo)", `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.photo)}`]);
    return links;
  }
  function mountProduct(p) {
    const ui = shell("aliedge-beebs-tools", "AliEdge");
    if (!ui) return;
    const on = p.sellerUid && tracked.has(p.sellerUid);
    ui.panel.innerHTML = `<h4>Trouver le fournisseur</h4>
      ${supplierLinks(p).map(([n, u]) => `<a class="row" href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)}<span aria-hidden="true">↗</span></a>`).join("")}
      ${p.sellerUid ? `<hr><button class="b ${on ? "" : "p"} wide" type="button" data-track>${on ? "✓ Concurrent suivi" : "+ Concurrent"}${p.sellerName ? ` · ${esc(p.sellerName)}` : ""}</button><p class="msg" data-tmsg></p>` : ""}`;
    ui.panel.querySelector("[data-track]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget, isOn = tracked.has(p.sellerUid);
      const r = await send({ type: isOn ? "beebs:untrack" : "beebs:track", uid: p.sellerUid, label: p.sellerName });
      if (r?.ok) { if (isOn) tracked.delete(p.sellerUid); else tracked.add(p.sellerUid); b.textContent = tracked.has(p.sellerUid) ? "✓ Concurrent suivi" : "+ Concurrent"; b.classList.toggle("p", !tracked.has(p.sellerUid)); ui.panel.querySelector("[data-tmsg]").textContent = tracked.has(p.sellerUid) ? "Ouvre son dressing de temps en temps : AliEdge repère ce qu'il vend." : ""; }
      else ui.panel.querySelector("[data-tmsg]").textContent = r?.error || "Ouvre AliEdge et réessaie.";
    });
  }

  // ───────── Dressing : bouton « + Concurrent » et relevé des annonces d'un concurrent suivi
  function readDressing() {
    const items = new Map();
    for (const a of document.querySelectorAll('a[href*="/p/"]')) {
      const id = a.getAttribute("href").match(/\/p\/(\d{3,15})/)?.[1];
      if (!id || items.has(id)) continue;
      const text = clean(a.innerText);
      const price = (() => { const m = text.match(/(\d{1,5})\s*€\s*(\d{2})?/); return m ? Number(`${m[1]}.${m[2] || "00"}`) : null; })();
      const img = a.querySelector("img");
      items.set(id, { id, title: clean(img?.alt) || text.split(" ").slice(-4).join(" "), price, photo: img?.currentSrc || img?.src || null, url: new URL(a.getAttribute("href"), location.href).href });
    }
    const total = Number((document.body.innerText || "").match(/Annonces\s*\((\d+)\)/i)?.[1]);
    return { items: [...items.values()], total: Number.isFinite(total) ? total : null };
  }
  function mountDressingButton(uid) {
    const h = document.querySelector("h1") || [...document.querySelectorAll("p, span, div")].find((e) => e.children.length === 0 && /^[A-ZÀ-Ý].{1,40}\.$/.test(clean(e.textContent)));
    if (!h || document.querySelector(".aliedge-beebs-competitor")) return;
    const name = clean(document.title.replace(/^Dressing de\s*/i, "")) || clean(h.textContent);
    const host = document.createElement("span");
    host.className = "aliedge-beebs-competitor";
    host.style.cssText = "display:inline-flex;margin-left:8px;vertical-align:middle";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>button{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;background:#6d3bff;color:#fff;font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif}button.ok{background:#0fa968}</style><button type="button"></button>`;
    const btn = root.querySelector("button");
    const paint = () => { const on = tracked.has(uid); btn.className = on ? "ok" : ""; btn.textContent = on ? "✓ Concurrent suivi" : "+ Concurrent"; };
    paint();
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = tracked.has(uid);
      const r = await send({ type: on ? "beebs:untrack" : "beebs:track", uid, label: name });
      if (r?.ok) { if (on) tracked.delete(uid); else { tracked.add(uid); reportDressing(uid); } paint(); }
    });
    h.insertAdjacentElement(h.tagName === "H1" ? "beforeend" : "afterend", host);
  }
  let lastReport = "";
  function reportDressing(uid) {
    if (!tracked.has(uid)) return;
    const d = readDressing();
    const key = `${uid}:${d.items.length}`;
    if (!d.items.length || key === lastReport) return;
    lastReport = key;
    send({ type: "beebs:dressing", uid, name: clean(document.title.replace(/^Dressing de\s*/i, "")), total: d.total, items: d.items });
  }

  // ───────── Dépôt d'une annonce : annonce préparée dans AliEdge, remplie d'un clic
  const visibleField = (el) => !!el && el.offsetParent !== null && !el.disabled && !el.readOnly;
  function field(kind) {
    const all = [...document.querySelectorAll("input, textarea")].filter(visibleField);
    const label = (el) => `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""} ${el.closest("label")?.textContent || ""} ${document.querySelector(`label[for="${el.id}"]`)?.textContent || ""}`.toLowerCase();
    if (kind === "title") return all.find((el) => el.tagName === "INPUT" && /titre|title|nom de l.article/.test(label(el)));
    if (kind === "body") return all.find((el) => el.tagName === "TEXTAREA") || all.find((el) => /description/.test(label(el)));
    if (kind === "price") return all.find((el) => el.tagName === "INPUT" && /prix|price/.test(label(el)));
    if (kind === "brand") return all.find((el) => el.tagName === "INPUT" && /marque|brand/.test(label(el)));
    return null;
  }
  const isSellForm = () => !!document.querySelector('input[type="file"]') && !!field("body");
  async function mountSell(l) {
    if (document.getElementById("aliedge-beebs-sell")) return;
    const ui = shell("aliedge-beebs-sell", "Annonce AliEdge");
    if (!ui) return;
    const { panel } = ui;
    panel.hidden = false;
    const vals = { title: l.title, body: l.description, price: l.price ? String(Math.round(l.price)) : "", brand: l.brand || "" };
    const f = (k, label, v) => v ? `<div class="f"><b>${esc(label)}</b><div>${esc(v)}</div><button class="b" type="button" data-copy="${k}">Copier</button></div>` : "";
    panel.innerHTML = `<h4>Annonce AliEdge pour Beebs</h4>
      ${f("title", "Titre", vals.title)}${f("body", "Description", vals.body)}${f("price", "Prix", vals.price && `${vals.price} €`)}${f("brand", "Marque", vals.brand)}
      ${[l.condition && `État : ${l.condition}`, l.size && `Taille : ${l.size}`, l.category && `Catégorie : ${l.category}`].filter(Boolean).map((t) => `<p class="msg">${esc(t)}</p>`).join("")}
      ${(l.photos || []).length ? `<div class="f"><b>Photos (${l.photos.length})</b><div class="thumbs">${l.photos.slice(0, 10).map((u) => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer">`).join("")}</div></div>` : ""}
      <button class="b p wide" type="button" data-fill>Tout remplir</button>
      <p class="msg" data-msg>Vérifie l'annonce, choisis la catégorie, l'état et la taille si Beebs les demande, puis clique sur « Mettre en vente ».</p>
      <button class="b wide" type="button" data-done>Annonce publiée : effacer de l'aide</button>`;
    panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(vals[b.dataset.copy].replace(/ €$/, "")); b.textContent = "Copié"; } catch { b.textContent = "Copie impossible"; }
      setTimeout(() => { b.textContent = "Copier"; }, 1500);
    }));
    panel.querySelector("[data-fill]").addEventListener("click", async (e) => {
      const b = e.currentTarget, msg = panel.querySelector("[data-msg]");
      b.textContent = "Remplissage…";
      let n = 0;
      for (const k of ["title", "body", "price", "brand"]) { const el = vals[k] && field(k); if (el && !el.value) { setValue(el, vals[k]); n++; } }
      const ph = await addPhotos(l.photos || []);
      b.textContent = "Tout remplir";
      msg.textContent = n || ph
        ? `${n} champ${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}${ph ? `, ${ph} photo${ph > 1 ? "s" : ""} ajoutée${ph > 1 ? "s" : ""}` : ""}. Vérifie, complète la catégorie, l'état et la taille si besoin, puis clique sur « Mettre en vente ».`
        : "Les champs ne sont pas encore affichés sur cette étape : utilise les boutons « Copier ».";
    });
    panel.querySelector("[data-done]").addEventListener("click", async () => { await send({ type: "beebs:clearListing" }); ui.host.remove(); });
    // Remplissage automatique dès que le formulaire est là : il ne reste qu'à vérifier et cliquer sur « Mettre en vente ».
    setTimeout(() => panel.querySelector("[data-fill]")?.click(), 900);
  }
  // Arrivée depuis « Publier sur Beebs » : on ouvre le formulaire de vente de Beebs (bouton « Vendre » de la page).
  function openSell() {
    const btn = [...document.querySelectorAll("a, button")].find((e) => /^vendre$/i.test(clean(e.textContent)) && e.offsetParent !== null);
    if (btn) btn.click();
  }

  async function run() {
    const r = await send({ type: "beebs:listing" });
    const l = r?.ok ? r.data : null;
    const fresh = l && Date.now() - (l.at || 0) < 2 * 3600_000;
    if (fresh && new URLSearchParams(location.search).get("ae") === "sell") { history.replaceState(null, "", location.pathname); setTimeout(openSell, 1200); }
    if (fresh && isSellForm()) mountSell(l);
    const pid = productId(), uid = dressingId();
    if (pid) { const p = readProduct(); if (p) mountProduct(p); }
    if (uid) { mountDressingButton(uid); reportDressing(uid); }
  }
  send({ type: "beebs:trackedIds" }).then((r) => { if (r?.ok) tracked = new Set(r.data || []); setTimeout(run, 1200); });
  let last = location.pathname, timer = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (location.pathname !== last) { last = location.pathname; document.getElementById("aliedge-beebs-tools")?.remove(); lastReport = ""; }
      run();
    }, 1500);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
