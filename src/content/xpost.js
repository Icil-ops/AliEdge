// Canaux de vente en plus — Beebs et Opla (si activés, accès facultatif à chaque site) : outils AliEdge sur les
// pages que le membre ouvre. AUCUNE requête vers ces sites : on lit seulement ce que la page affiche.
// - Article : « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein) et « + Concurrent » pour son vendeur.
// - Boutique : « + Concurrent » ; boutique d'un concurrent suivi relevée (annonces disparues = ventes probables).
// - Vente : l'annonce préparée dans AliEdge (annonce Vinted du membre) est remplie automatiquement, photos
//   comprises ; le membre vérifie et clique lui-même sur le bouton de mise en vente. En série, la suivante s'ouvre.
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
  if (window.__aliedgeXpost) return;
  window.__aliedgeXpost = true;
  const SITES = {
    beebs: {
      host: /(^|\.)beebs\.app$/, label: "Beebs", shop: "boutique", home: "/fr",
      product: /^\/[a-z]{2}\/p\/(\d{3,15})/, shopPage: /^\/[a-z]{2}\/dressing\/([A-Za-z0-9_-]{10,64})/,
      sellerLink: 'a[href*="/dressing/"]', sellerId: /\/dressing\/([A-Za-z0-9_-]{10,64})/,
      itemLink: 'a[href*="/p/"]', itemId: /\/p\/(\d{3,15})/,
      total: () => { const n = Number((document.body.innerText || "").match(/Annonces\s*\((\d+)\)/i)?.[1]); return Number.isFinite(n) ? n : null; },
      sellPage: () => false, sellUrl: "/fr?ae=sell",
    },
    opla: {
      host: /(^|\.)opla\.co$/, label: "Opla", shop: "boutique", home: "/",
      product: /^\/(?:[a-z]{2}\/)?product\/(art_[a-f0-9]{16,40})/, shopPage: /^\/(?:[a-z]{2}\/)?seller\/([^/?#]{6,160})/,
      sellerLink: 'a[href*="/seller/"]', sellerId: /\/seller\/([^/?#]{6,160})/,
      itemLink: 'a[href*="/product/art_"]', itemId: /\/product\/(art_[a-f0-9]{16,40})/,
      total: () => null, sellPage: () => /^\/(?:[a-z]{2}\/)?sell\/create/.test(location.pathname), sellUrl: "/sell/create?ae=sell",
    },
  };
  // Facebook Marketplace : seulement la page « Créer une annonce » (aucune lecture des autres pages).
  SITES.facebook = {
    host: /(^|\.)facebook\.com$/, label: "Facebook", shop: "page", home: "/marketplace",
    product: /(?!)/, shopPage: /(?!)/, sellerLink: "a[data-ae-never]", sellerId: /(?!)/, itemLink: "a[data-ae-never]", itemId: /(?!)/,
    total: () => null, sellPage: () => /^\/marketplace\/create/.test(location.pathname), sellUrl: "/marketplace/create/item?ae=sell",
  };
  const CH = Object.keys(SITES).find((k) => SITES[k].host.test(location.hostname));
  if (!CH) return;
  const S = SITES[CH];
  const dec = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
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
    globalThis.__aeAffClicks(root);
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
  // Photos : lues par AliEdge (directement, ou par le serveur quand le site d'images refuse), converties en JPEG
  // si besoin, puis déposées dans le champ photos de la page (ou glissées sur la zone de dépôt).
  async function photoFiles(urls) {
    const r = await send({ type: "photos:get", urls: (urls || []).slice(0, 10) });
    const list = r?.ok && Array.isArray(r.data) ? r.data : [];
    const files = [];
    for (const [i, p] of list.entries()) {
      try {
        const bin = atob(p.b64); const buf = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
        let blob = new Blob([buf], { type: p.type || "image/jpeg" });
        if (!/^image\/(jpeg|png)$/.test(blob.type)) {
          const bmp = await createImageBitmap(blob);
          const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
          c.getContext("2d").drawImage(bmp, 0, 0);
          blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.92));
        }
        if (blob) files.push(new File([blob], `photo-${i + 1}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }));
      } catch { /* photo illisible */ }
    }
    return files;
  }
  async function addPhotos(urls) {
    if (!urls?.length) return 0;
    const input = [...document.querySelectorAll('input[type="file"]')].find((i) => !i.disabled && /image|jpe?g|png|webp|^$/i.test(i.accept || ""));
    const zone = input ? null : [...document.querySelectorAll("div, label, section, button")]
      .filter((el) => /glissez|d[ée]posez|ajouter des photos|importer|parcourir|add photos/i.test(el.textContent || "") && el.offsetParent !== null)
      .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
    if (!input && !zone) return 0;
    const files = await photoFiles(urls);
    if (!files.length) return 0;
    const dt = new DataTransfer();
    for (const f of input && !input.multiple ? files.slice(0, 1) : files) dt.items.add(f);
    if (input) {
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      for (const type of ["dragenter", "dragover", "drop"]) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    return dt.files.length;
  }


  const productId = () => location.pathname.match(S.product)?.[1] || null;
  const dressingId = () => { const m = location.pathname.match(S.shopPage)?.[1]; return m ? dec(m) : null; };
  const uidFrom = (href) => { const m = String(href || "").match(S.sellerId)?.[1]; return m ? dec(m) : null; };
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
    const seller = document.querySelector(S.sellerLink);
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
      const r = await send({ type: isOn ? `${CH}:untrack` : `${CH}:track`, uid: p.sellerUid, label: p.sellerName });
      if (r?.ok) { if (isOn) tracked.delete(p.sellerUid); else tracked.add(p.sellerUid); b.textContent = tracked.has(p.sellerUid) ? "✓ Concurrent suivi" : "+ Concurrent"; b.classList.toggle("p", !tracked.has(p.sellerUid)); ui.panel.querySelector("[data-tmsg]").textContent = tracked.has(p.sellerUid) ? `Ouvre sa ${S.shop} de temps en temps : AliEdge repère ce qu'il vend.` : ""; }
      else ui.panel.querySelector("[data-tmsg]").textContent = r?.error || "Ouvre AliEdge et réessaie.";
    });
  }

  // ───────── Dressing : bouton « + Concurrent » et relevé des annonces d'un concurrent suivi
  function readDressing() {
    const items = new Map();
    for (const a of document.querySelectorAll(S.itemLink)) {
      const id = a.getAttribute("href").match(S.itemId)?.[1];
      if (!id || items.has(id)) continue;
      const text = clean(a.innerText);
      const price = (() => { const m = text.match(/(\d{1,5})\s*€\s*(\d{2})?/); return m ? Number(`${m[1]}.${m[2] || "00"}`) : null; })();
      const img = a.querySelector("img");
      items.set(id, { id, title: clean(img?.alt) || text.split(" ").slice(-4).join(" "), price, photo: img?.currentSrc || img?.src || null, url: new URL(a.getAttribute("href"), location.href).href });
    }
    const list = [...items.values()];
    const total = S.total();
    // Tout est affiché : le nombre annoncé est atteint, ou (sans nombre) la page est descendue jusqu'en bas.
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 300;
    const complete = total != null ? list.length >= total : (atBottom || list.length < 12);
    return { items: list, total, complete };
  }
  function mountDressingButton(uid) {
    const h = document.querySelector("h1") || [...document.querySelectorAll("p, span, div")].find((e) => e.children.length === 0 && /^[A-ZÀ-Ý].{1,40}\.$/.test(clean(e.textContent)));
    if (!h || document.querySelector(".aliedge-beebs-competitor")) return;
    const name = clean(document.title.replace(/^Dressing de\s*/i, "").replace(/\s+sur Opla.*$/i, "")) || clean(h.textContent).replace(/^Boutique de\s*/i, "");
    const host = document.createElement("span");
    host.className = "aliedge-beebs-competitor";
    host.style.cssText = "display:inline-flex;margin-left:8px;vertical-align:middle";
    const root = host.attachShadow({ mode: "closed" });
    globalThis.__aeAffClicks(root);
    root.innerHTML = `<style>button{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;background:#6d3bff;color:#fff;font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif}button.ok{background:#0fa968}</style><button type="button"></button>`;
    const btn = root.querySelector("button");
    const paint = () => { const on = tracked.has(uid); btn.className = on ? "ok" : ""; btn.textContent = on ? "✓ Concurrent suivi" : "+ Concurrent"; };
    paint();
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = tracked.has(uid);
      const r = await send({ type: on ? `${CH}:untrack` : `${CH}:track`, uid, label: name });
      if (r?.ok) { if (on) tracked.delete(uid); else { tracked.add(uid); reportDressing(uid); } paint(); }
    });
    h.insertAdjacentElement(h.tagName === "H1" ? "beforeend" : "afterend", host);
  }
  let lastReport = "";
  function reportDressing(uid) {
    if (!tracked.has(uid)) return;
    const d = readDressing();
    const key = `${uid}:${d.items.length}:${d.complete}`;
    if (!d.items.length || key === lastReport) return;
    lastReport = key;
    send({ type: `${CH}:shop`, uid, name: clean(document.title.replace(/^Dressing de\s*/i, "").replace(/\s+sur Opla.*$/i, "")), complete: d.complete, items: d.items });
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
  // Champ repéré par le titre affiché au-dessus ou à côté (« Titre », « Prix (€) »…) quand il n'a pas de vrai <label>.
  const FIELD_HEAD = { title: /^(titre|title)\b/, body: /^description\b/, price: /^prix\b/, brand: /^marque\b/ };
  function fieldNear(kind) {
    const re = FIELD_HEAD[kind];
    if (!re) return null;
    const FOLLOW = Node.DOCUMENT_POSITION_FOLLOWING;
    const heads = [...document.querySelectorAll("label, p, span, div, h2, h3, h4, legend")].filter((x) => x.children.length <= 1 && isVis(x) && HEADS.test(pnorm(x.textContent)) && pnorm(x.textContent).length < 40);
    const inputs = [...document.querySelectorAll(kind === "body" ? "textarea" : "input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden])")].filter(visibleField);
    for (const h of heads) {
      if (!re.test(pnorm(h.textContent))) continue;
      // Premier champ après ce titre, sans autre titre de champ entre les deux (la marque ne va jamais dans « Adresse »).
      const el = inputs.find((x) => h.compareDocumentPosition(x) & FOLLOW);
      if (!el) continue;
      const between = heads.some((o) => o !== h && !o.contains(h) && !h.contains(o) && (h.compareDocumentPosition(o) & FOLLOW) && (o.compareDocumentPosition(el) & FOLLOW));
      if (!between) return el;
    }
    return null;
  }
  const isEmpty = (el) => !el.value || /^0+([.,]0+)?$/.test(el.value.trim());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ───────── Listes déroulantes du site (catégorie, marque, état, taille) : on ouvre la ligne, on repère les choix
  // apparus après le clic (différence avant / après), on tape la recherche s'il y a un champ, on clique le bon choix.
  const pnorm = (t) => String(t || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const psleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVis = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const psing = (w) => w.replace(/(?<=..)s$/, "");
  const LEAVES = 'li, button, [role="option"], label, a, div, span, p';
  const leaves = () => [...document.querySelectorAll(LEAVES)].filter((x) => isVis(x) && (x.textContent || "").length < 120 && !x.closest("#aliedge-beebs-sell, #aliedge-lbc-deposit"));
  function press(el) {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    el.click();
  }
  const HEADS = /^(titre|description|prix|marque|adresse|taille|etat|categorie|couleur|matiere|type de vetement|format du colis)\b/;
  function rowTrigger(re) {
    for (const h of document.querySelectorAll("label, p, span, div, h2, h3, h4, legend, dt")) {
      if (h.children.length > 2 || !isVis(h)) continue;
      const t = pnorm(h.textContent);
      if (!t || t.length > 40 || !re.test(t)) continue;
      const own = h.closest('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]');
      if (own && isVis(own)) return own; // Facebook : le titre est dans la liste elle-même
      let row = h.parentElement;
      for (let d = 0; row && d < 4; d++, row = row.parentElement) {
        // Le bloc de CE champ seulement (un seul titre de champ dedans).
        const heads = [...row.querySelectorAll("label, p, span, h2, h3, h4, legend, dt")].filter((x) => x.children.length === 0 && HEADS.test(pnorm(x.textContent)) && pnorm(x.textContent).length < 40);
        if (heads.length > 1) break;
        const trig = [...row.querySelectorAll('[role="combobox"], [aria-haspopup], button, [role="button"], input:not([type=file]):not([type=hidden]), select')].find(isVis);
        if (trig) return trig;
        if (/s[ée]lectionner|choisi(r|ssez)/i.test(row.textContent || "") && (row.textContent || "").length < 200 && d > 0) return row;
      }
    }
    return null;
  }
  function bestOption(cands, words, loose) {
    for (const w of words) {
      const exact = cands.filter((x) => { const t = pnorm(x.textContent); return t === w || psing(t) === psing(w); });
      const hit = exact.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length)[0]
        || (loose && cands.filter((x) => pnorm(x.textContent).startsWith(w)).sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0]);
      const near = !hit && loose && cands.filter((x) => pnorm(x.textContent).includes(w) && pnorm(x.textContent).length < 60).sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
      if (near) return near.closest('[role="option"], button, a, label, li') || near;
      if (hit) return hit.matches('button, a, [role="option"], label') ? hit : hit.querySelector('button, a, [role="option"], label, input[type="radio"]') || hit.closest('button, a, [role="option"], label, li') || hit;
    }
    return null;
  }
  async function closeOpen(trig) {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await psleep(200);
    const x = [...document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button')].find((b) => isVis(b) && /fermer|close|×|✕/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent || ""}`));
    if (x) x.click();
    await psleep(200);
  }
  /** Ouvre la liste du champ (re) et choisit une des valeurs (words, déjà normalisées). search : tape d'abord words[0]. */
  async function pickValue(re, words, { search = false, loose = false } = {}) {
    words = words.map(pnorm).filter(Boolean);
    const trig = rowTrigger(re);
    if (!trig || !words.length) return false;
    if (trig.tagName === "SELECT") {
      const o = [...trig.options].find((x) => words.some((w) => pnorm(x.textContent) === w || pnorm(x.textContent).startsWith(w)));
      if (!o) return false;
      trig.value = o.value; trig.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const before = new Set(leaves());
    const inputsBefore = new Set([...document.querySelectorAll("input")].filter(isVis));
    press(trig);
    if (trig.tagName === "INPUT") { trig.focus(); trig.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true })); }
    await psleep(800);
    if (search) {
      const q = (trig.tagName === "INPUT" ? trig : null) || trig.querySelector?.("input")
        || [...document.querySelectorAll("input")].find((i) => isVis(i) && !inputsBefore.has(i) && !/file|checkbox|radio|hidden/.test(i.type));
      if (q) { q.focus(); setValue(q, words[0]); await psleep(1100); }
    }
    const cands = leaves().filter((x) => search || !before.has(x));
    const opt = bestOption(cands, words, loose);
    if (!opt) { await closeOpen(trig); return false; }
    press(opt);
    await psleep(600);
    return true;
  }
  /** Catégorie : avec un champ de recherche, on tape les mots du fil d'Ariane Vinted (du plus précis au plus large) ;
   *  sinon on descend l'arbre niveau par niveau (Homme › Vêtements › …). */
  async function pickCategory(path) {
    const crumbs = (path || []).map(pnorm).filter(Boolean);
    if (!crumbs.length) return false;
    const gender = /^(homme|femme|enfant|fille|garcon|bebe)/.exec(crumbs[0])?.[1] || "";
    const trig = rowTrigger(/^(categorie|type de vetement)\b/);
    if (!trig) return false;
    const inputsBefore = new Set([...document.querySelectorAll("input")].filter(isVis));
    let before = new Set(leaves());
    press(trig);
    await psleep(900);
    const q = (trig.tagName === "INPUT" ? trig : null) || [...document.querySelectorAll("input")].find((i) => isVis(i) && !inputsBefore.has(i) && !/file|checkbox|radio|hidden/.test(i.type));
    if (q) {
      // Le plus précis d'abord, sans le dernier niveau quand il porte la marque (« CHAPS Chemises… »).
      const terms = crumbs.slice(1).reverse().map((c) => c.split(/\s+/).filter((w) => w.length > 3).slice(-2).join(" ")).filter(Boolean);
      for (const term of terms) {
        setValue(q, term.split(" ")[0]);
        await psleep(1100);
        const cands = leaves().filter((x) => pnorm(x.textContent).includes(psing(term.split(" ")[0])) && pnorm(x.textContent).length < 60);
        const pick = cands.find((x) => gender && pnorm(x.textContent).includes(gender)) || cands.sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
        if (pick) { press(pick.closest('button, a, [role="option"], li, label') || pick); await psleep(600); return true; }
      }
      await closeOpen(trig);
      return false;
    }
    let words = crumbs.slice(), picked = 0;
    for (let level = 0; level < 5 && words.length; level++) {
      const cands = leaves().filter((x) => !before.has(x));
      let opt = bestOption(cands, words, false);
      // Libellés composés (« Vêtements et chaussures pour hommes ») : le choix qui contient le genre et un mot du chemin.
      if (!opt) {
        const keys = words.flatMap((w) => w.split(/\s+/)).filter((w) => w.length > 3).map(psing);
        const scored = cands.map((x) => { const t = pnorm(x.textContent); return [x, (gender && t.includes(gender) ? 2 : 0) + keys.filter((k) => t.includes(k)).length]; })
          .filter(([x, n]) => n >= 2 && pnorm(x.textContent).length < 70).sort((a, b) => b[1] - a[1] || (a[0].textContent || "").length - (b[0].textContent || "").length);
        if (scored[0]) opt = scored[0][0].closest('[role="option"], button, a, label, li') || scored[0][0];
      }
      if (!opt) break;
      const t = pnorm(opt.textContent);
      before = new Set(leaves());
      press(opt);
      picked++;
      const i = words.findIndex((w) => psing(w) === psing(t) || w === t);
      words = i >= 0 ? words.slice(i + 1) : words.slice(1);
      await psleep(800);
    }
    if (!picked) await closeOpen(trig);
    return picked > 0;
  }
  // État Vinted → libellés des autres sites (Beebs, Opla, Leboncoin).
  const COND_WORDS = [
    [/neuf avec etiquette|new with tags/, ["neuf avec etiquette", "neuf avec etiquettes", "etat neuf", "neuf"]],
    [/neuf sans etiquette|new without tags/, ["neuf sans etiquette", "neuf sans etiquettes", "etat neuf", "comme neuf", "neuf"]],
    [/tres bon etat|very good/, ["tres bon etat", "excellent etat", "comme neuf", "d'occasion - comme neuf"]],
    [/bon etat|good/, ["bon etat", "d'occasion - bon etat"]],
    [/satisfaisant|satisfactory/, ["satisfaisant", "etat satisfaisant", "correct", "etat correct", "etat moyen", "d'occasion - assez bon etat"]],
  ];
  const condWords = (v) => COND_WORDS.find(([re]) => re.test(pnorm(v)))?.[1] || [pnorm(v)];
  /** Adresse (Beebs…) : celle enregistrée dans AliEdge (Compte), puis la première suggestion du site. */
  async function fillAddress(addr) {
    if (!addr) return false;
    const el = [...document.querySelectorAll("input")].find((i) => isVis(i) && /adresse|address/i.test(`${i.name} ${i.id} ${i.placeholder} ${i.getAttribute("aria-label") || ""}`));
    if (!el || (el.value && !/^\s*$/.test(el.value))) return false;
    const before = new Set(leaves());
    el.focus(); setValue(el, addr);
    await psleep(1300);
    const first = pnorm(addr).split(/\s+/).find((w) => w.length > 2) || "";
    const sug = leaves().filter((x) => !before.has(x) && first && pnorm(x.textContent).includes(first)).sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
    if (sug) { press(sug.closest('[role="option"], li, button') || sug); await psleep(400); }
    return true;
  }
  // État et taille : l'état Vinted traduit vers les libellés courants (Beebs, Opla), puis choisi dans la liste
  // du site (menu <select>, ou boutons / cases à cocher affichés sous le titre « État » / « Taille »).
  const norm = (t) => clean(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const CONDITIONS = [
    [/neuf avec etiquette|new with tags|^6$/, ["neuf avec etiquette", "neuf avec etiquettes", "neuf (avec etiquette)", "neuf"]],
    [/neuf sans etiquette|new without tags|^1$/, ["neuf sans etiquette", "neuf sans etiquettes", "comme neuf", "jamais porte", "neuf"]],
    [/tres bon etat|very good|^2$/, ["tres bon etat", "excellent etat", "comme neuf"]],
    [/bon etat|good|^3$/, ["bon etat", "etat correct"]],
    [/satisfaisant|satisfactory|^4$/, ["satisfaisant", "etat correct", "etat moyen", "usage"]],
  ];
  function conditionWords(v) {
    const n = norm(v);
    return CONDITIONS.find(([re]) => re.test(n))?.[1] || (n ? [n] : []);
  }
  const clickable = 'button, [role="option"], [role="radio"], [role="button"], label, li, span, div';
  function choose(kind, words) {
    if (!words.length) return false;
    const head = kind === "condition" ? /^(etat|condition|etat de l.article)\b/ : /^(taille|size|pointure|age)\b/;
    // 1. Un vrai menu <select>.
    for (const sel of document.querySelectorAll("select")) {
      if (!visibleField(sel)) continue;
      const lab = norm(`${sel.name} ${sel.id} ${sel.getAttribute("aria-label") || ""} ${sel.closest("label")?.textContent || ""} ${document.querySelector(`label[for="${sel.id}"]`)?.textContent || ""}`);
      if (!head.test(lab) && !(kind === "condition" ? /etat|condition/ : /taille|size/).test(lab)) continue;
      for (const w of words) {
        const opt = [...sel.options].find((o) => norm(o.textContent) === w) || [...sel.options].find((o) => norm(o.textContent).startsWith(w));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true })); return true; }
      }
    }
    // 2. Boutons ou cases affichés dans le bloc qui suit le titre « État » / « Taille ».
    const heads = [...document.querySelectorAll("h1, h2, h3, h4, h5, legend, label, p, span, div")].filter((el) => el.children.length === 0 && head.test(norm(el.textContent)) && norm(el.textContent).length < 40 && el.offsetParent !== null);
    for (const h of heads) {
      let box = h.parentElement;
      for (let depth = 0; box && depth < 3; depth++, box = box.parentElement) {
        for (const w of words) {
          const el = [...box.querySelectorAll(clickable)].find((x) => x !== h && x.offsetParent !== null && x.children.length <= 2 && norm(x.textContent) === w);
          if (el) { (el.closest('button, [role="option"], [role="radio"], label') || el).click(); return true; }
        }
      }
    }
    return false;
  }
  // ───────── Facebook Marketplace : liste de catégories à un seul niveau (« Sacs et bagages », « Vêtements et
  // chaussures pour femmes »…, suivie de « Livraison possible »), description repliée sous « Plus de détails ».
  const FB_CATS = [
    [/sac|bagage|valise|sacoche|pochette|cartable|trousse/, "sacs et bagages"],
    [/bijou|collier|bracelet|bague|boucle|montre|lunette|ceinture|chapeau|casquette|bonnet|echarpe|foulard|gant|accessoire/, "bijoux et accessoires"],
    [/bebe|enfant|fille|garcon|puericulture|poussette/, "puericulture et enfants"],
    [/beaute|maquillage|soin|parfum|cosmetique|coiffure/, "sante et beaute"],
    [/jouet|jeu de societe|peluche|figurine|lego|puzzle/, "jouets et jeux"],
    [/jeux? video|console|manette/, "jeux video"],
    [/telephone|smartphone|iphone|coque/, "telephones mobiles"],
    [/electronique|ordinateur|ecouteur|casque audio|enceinte|tablette|montre connectee|camera/, "electronique et ordinateurs"],
    [/livre|film|dvd|musique|vinyle|cd\b/, "livres, films et musique"],
    [/sport|velo|fitness|randonnee|camping|ski|yoga/, "sports et activites exterieures"],
    [/animal|chien|chat|animaux/, "produits pour animaux"],
    [/maison|deco|linge de lit|couette|housse|tapis|coussin|rideau|cuisine|vaisselle|lampe|bougie|rangement|plaid/, "pour la maison"],
    [/homme|men\b/, "vetements et chaussures pour hommes"],
    [/femme|women|robe|jupe|chaussure|vetement|veste|manteau|pull|jean|pantalon|top|t-shirt/, "vetements et chaussures pour femmes"],
  ];
  function fbCategory(l) {
    const path = (l.categoryPath || []).map(pnorm);
    const all = `${path.join(" ")} ${pnorm(l.title)}`;
    // Le genre du fil d'Ariane Vinted décide pour les vêtements et chaussures.
    if (/^(homme|hommes|men)/.test(path[0] || "") && !/sac|bijou|accessoire|beaute/.test(path.slice(1).join(" "))) return "vetements et chaussures pour hommes";
    if (/^(enfant|enfants|bebe)/.test(path[0] || "")) return "puericulture et enfants";
    for (const [re, cat] of FB_CATS) if (re.test(all)) return cat;
    return "divers";
  }
  async function fbPickCategory(l) {
    const trig = rowTrigger(/^categorie\b/);
    if (!trig) return false;
    if (pnorm(trig.textContent).replace(/^categorie\s*/, "")) return true; // déjà choisie
    const target = fbCategory(l);
    press(trig);
    await psleep(1100);
    const opt = [...document.querySelectorAll('[role="dialog"] [role="button"], [role="dialog"] [role="option"], [role="listbox"] [role="option"]')]
      .filter((x) => isVis(x) && pnorm(x.textContent).startsWith(target)).sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
    if (!opt) { await closeOpen(trig); return false; }
    press(opt);
    await psleep(1200); // Facebook ajoute alors Marque, Couleur, Matériau…
    return true;
  }
  function fbOpenDetails() {
    if ([...document.querySelectorAll("textarea")].some(visibleField)) return;
    const h = [...document.querySelectorAll("span, div")].find((x) => x.children.length === 0 && /^plus de d[ée]tails$/i.test(clean(x.textContent)) && isVis(x));
    if (h) press(h.closest('[role="button"]') || h);
  }
  function textFieldByLabel(re) {
    return [...document.querySelectorAll("label input[type=text], label textarea")].find((el) => visibleField(el) && re.test(pnorm(el.closest("label")?.textContent || "")));
  }

  const isSellForm = () => S.sellPage() || (!!document.querySelector('input[type="file"]') && !!field("body"));
  let submittedAt = 0;
  async function mountSell(l) {
    if (document.getElementById("aliedge-beebs-sell")) return;
    const ui = shell("aliedge-beebs-sell", "Annonce AliEdge");
    if (!ui) return;
    const { panel } = ui;
    panel.hidden = false;
    const vals = { title: l.title, body: l.description, price: l.price ? String(Math.round(l.price)) : "", brand: l.brand || "" };
    const f = (k, label, v) => v ? `<div class="f"><b>${esc(label)}</b><div>${esc(v)}</div><button class="b" type="button" data-copy="${k}">Copier</button></div>` : "";
    const q = l.queue;
    panel.innerHTML = `<h4>Annonce AliEdge pour ${S.label}${q ? ` · ${q.index + 1} / ${q.total}` : ""}</h4>
      ${f("title", "Titre", vals.title)}${f("body", "Description", vals.body)}${f("price", "Prix", vals.price && `${vals.price} €`)}${f("brand", "Marque", vals.brand)}
      ${[l.condition && `État : ${l.condition}`, l.size && `Taille : ${l.size}`, l.category && `Catégorie : ${l.category}`].filter(Boolean).map((t) => `<p class="msg">${esc(t)}</p>`).join("")}
      ${(l.photos || []).length ? `<div class="f"><b>Photos (${l.photos.length})</b><div class="thumbs">${l.photos.slice(0, 10).map((u) => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer">`).join("")}</div></div>` : ""}
      <button class="b p wide" type="button" data-fill>Tout remplir</button>
      <p class="msg" data-msg>Vérifie l'annonce, choisis la catégorie, l'état et la taille si ${S.label} les demande, puis publie-la.</p>
      ${q ? `<button class="b p wide" type="button" data-next>Publiée : annonce suivante</button><div class="bar" style="margin:4px"><button class="chip" type="button" data-skip>Passer celle-ci</button><button class="chip" type="button" data-stop>Arrêter</button></div>`
        : `<button class="b wide" type="button" data-done>Annonce publiée : effacer de l'aide</button>`}`;
    const goNext = async (posted) => {
      const r = await send({ type: `${CH}:next`, posted });
      const d = r?.ok ? r.data : null;
      ui.host.remove();
      if (d && !d.done) location.href = `${location.origin}${S.sellUrl}`;
    };
    panel.querySelector("[data-next]")?.addEventListener("click", () => goNext(true));
    panel.querySelector("[data-skip]")?.addEventListener("click", () => goNext(false));
    panel.querySelector("[data-stop]")?.addEventListener("click", async () => { await send({ type: `${CH}:stopQueue` }); ui.host.remove(); });
    // Le membre clique sur le bouton de mise en vente de Beebs : quand le formulaire disparaît, on passe à la suivante.
    if (q) {
      document.addEventListener("click", (e) => {
        const b = e.target.closest?.("button, [role=button], input[type=submit]");
        if (b && /mettre en vente|publier|vendre/i.test(clean(b.textContent || b.value)) && !ui.host.contains(b)) submittedAt = Date.now();
      }, true);
      const watch = setInterval(() => {
        if (!document.getElementById("aliedge-beebs-sell")) { clearInterval(watch); return; }
        if (submittedAt && Date.now() - submittedAt > 3000 && !isSellForm()) { clearInterval(watch); goNext(true); }
      }, 1000);
    }
    panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(vals[b.dataset.copy].replace(/ €$/, "")); b.textContent = "Copié"; } catch { b.textContent = "Copie impossible"; }
      setTimeout(() => { b.textContent = "Copier"; }, 1500);
    }));
    panel.querySelector("[data-fill]").addEventListener("click", async (e) => {
      const b = e.currentTarget, msg = panel.querySelector("[data-msg]");
      b.textContent = "Remplissage…";
      let n = 0;
      // Facebook : catégorie d'abord (elle fait apparaître Marque et Couleur), et description dépliée.
      const fbRows = [];
      if (CH === "facebook") {
        if (await fbPickCategory(l)) fbRows.push("catégorie");
        fbOpenDetails();
        await psleep(700);
        for (const [re, v] of [[/^marque\b/, l.brand], [/^couleur\b/, l.color]]) {
          const el = v && textFieldByLabel(re);
          if (el && isEmpty(el)) { setValue(el, String(v).slice(0, 60)); n++; }
        }
      }
      for (const k of ["title", "body", "price"]) { const el = vals[k] && (field(k) || fieldNear(k)); if (el && isEmpty(el)) { setValue(el, vals[k]); n++; } }
      const brandInput = vals.brand && field("brand");
      if (brandInput && isEmpty(brandInput)) { setValue(brandInput, vals.brand); n++; }
      // Listes du site : la catégorie d'abord (elle fait apparaître taille, marque, état), puis le reste.
      const rows = [...fbRows];
      if (CH !== "facebook" && l.categoryPath?.length && await pickCategory(l.categoryPath)) { rows.push("catégorie"); await psleep(1200); }
      if (l.size && (await pickValue(/^taille\b/, [l.size]) || choose("size", [norm(l.size)]))) rows.push("taille");
      if (l.brand && !brandInput && await pickValue(/^marque\b/, [l.brand], { search: true })) rows.push("marque");
      if (l.condition && (await pickValue(/^(etat|condition)\b/, condWords(l.condition), { loose: CH === "facebook" }) || choose("condition", condWords(l.condition)))) rows.push("état");
      const addr = (await send({ type: "settings:sellAddress" }))?.data;
      if (addr && await fillAddress(addr)) rows.push("adresse");
      n += rows.length;
      const picked = rows;
      const ph = await addPhotos(l.photos || []);
      b.textContent = "Tout remplir";
      autoPublish({ ph, rows, title: !!(field("title") || fieldNear("title"))?.value, price: !isEmpty(field("price") || fieldNear("price") || { value: "" }) }).catch(() => {});
      msg.textContent = n || ph
        ? `${n} champ${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}${ph ? `, ${ph} photo${ph > 1 ? "s" : ""} ajoutée${ph > 1 ? "s" : ""}` : ""}. Vérifie, complète ce qui manque${picked.length ? "" : " (catégorie, état, taille)"}, puis publie l'annonce.`
        : "Les champs ne sont pas encore affichés sur cette étape : utilise les boutons « Copier ».";
    });
    panel.querySelector("[data-done]")?.addEventListener("click", async () => { await send({ type: `${CH}:clearListing` }); ui.host.remove(); });
    document.addEventListener("aliedge-say", (e) => {
      const m = panel.querySelector("[data-msg]"); if (!m) return;
      m.textContent = e.detail;
      if (/dans \d s/.test(e.detail) && !panel.querySelector("[data-cancel]")) {
        const c = document.createElement("button"); c.className = "b wide"; c.type = "button"; c.dataset.cancel = "1"; c.textContent = "Annuler la publication";
        c.addEventListener("click", () => { document.dispatchEvent(new Event("aliedge-cancel")); c.remove(); });
        m.after(c);
      } else if (!/dans \d s/.test(e.detail)) panel.querySelector("[data-cancel]")?.remove();
    });
    // Annonce seule publiée (par toi ou automatiquement) : quand le formulaire disparaît, elle est marquée comme repostée.
    if (!q) {
      document.addEventListener("click", (e) => {
        const b = e.target.closest?.("button, [role=button], input[type=submit]");
        if (b && /mettre en vente|publier|vendre/i.test(clean(b.textContent || b.value)) && !ui.host.contains(b)) submittedAt = Date.now();
      }, true);
      const watchOne = setInterval(() => {
        if (!document.getElementById("aliedge-beebs-sell")) { clearInterval(watchOne); return; }
        if (submittedAt && Date.now() - submittedAt > 3000 && !isSellForm()) { clearInterval(watchOne); send({ type: `${CH}:clearListing` }); ui.host.remove(); }
      }, 1000);
    }
    // Remplissage automatique dès que le formulaire est là : il ne reste qu'à vérifier et cliquer sur « Mettre en vente ».
    setTimeout(() => panel.querySelector("[data-fill]")?.click(), 900);
  }
  // Publication automatique (Beebs, Opla ; option cochée par le membre dans Compte) : seulement quand titre, prix,
  // photos, catégorie et état sont remplis. Compte à rebours de 5 s avec « Annuler » ; sinon AliEdge dit ce qui manque.
  async function autoPublish(st) {
    if (!["beebs", "opla"].includes(CH)) return;
    const on = (await send({ type: "settings:autoPublish", ch: CH }))?.data === true;
    const panelMsg = document.getElementById("aliedge-beebs-sell") && document.querySelector("#aliedge-beebs-sell");
    if (!on || !panelMsg) return;
    const missing = [!st.title && "titre", !st.price && "prix", !st.ph && "photos", !st.rows.includes("catégorie") && "catégorie", !st.rows.includes("état") && "état"].filter(Boolean);
    const say = (t) => { const ev = new CustomEvent("aliedge-say", { detail: t }); document.dispatchEvent(ev); };
    if (missing.length) { say(`Publication automatique en pause : complète ${missing.join(", ")}, puis publie.`); return; }
    const btn = [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].filter((x) => isVis(x) && !x.disabled)
      .find((x) => /^(mettre en vente|publier l.article|publier|valider l.annonce)$/i.test((x.textContent || x.value || "").replace(/\s+/g, " ").trim()));
    if (!btn) { say("Bouton de publication introuvable : publie l'annonce toi-même."); return; }
    let cancelled = false;
    document.addEventListener("aliedge-cancel", () => { cancelled = true; }, { once: true });
    for (let k = 5; k > 0; k--) { if (cancelled) return say("Publication automatique annulée : publie quand tu veux."); say(`Publication automatique dans ${k} s… (Annuler dans l'aide AliEdge)`); await psleep(1000); }
    if (cancelled) return say("Publication automatique annulée : publie quand tu veux.");
    submittedAt = Date.now();
    btn.click();
    say("Annonce envoyée : vérifie qu'elle est bien en ligne.");
  }
  // Arrivée depuis « Publier sur Beebs » : on ouvre le formulaire de vente de Beebs (bouton « Vendre » de la page).
  function openSell() {
    const btn = [...document.querySelectorAll("a, button")].find((e) => /^vendre$/i.test(clean(e.textContent)) && e.offsetParent !== null);
    if (btn) btn.click();
  }

  async function run() {
    const r = await send({ type: `${CH}:listing` });
    const l = r?.ok ? r.data : null;
    const fresh = l && Date.now() - (l.at || 0) < 2 * 3600_000;
    if (fresh && new URLSearchParams(location.search).get("ae") === "sell") { history.replaceState(null, "", location.pathname); if (!S.sellPage()) setTimeout(openSell, 1200); }
    if (fresh && isSellForm()) mountSell(l);
    const pid = productId(), uid = dressingId();
    if (pid) { const p = readProduct(); if (p) mountProduct(p); }
    if (uid) { mountDressingButton(uid); reportDressing(uid); }
  }
  // Boutique d'un concurrent suivi : relevée aussi quand le membre arrive en bas de la page (tout est chargé).
  let scrollT = null;
  window.addEventListener("scroll", () => { if (scrollT) return; scrollT = setTimeout(() => { scrollT = null; const u = dressingId(); if (u) reportDressing(u); }, 800); }, { passive: true });
  send({ type: `${CH}:trackedIds` }).then((r) => { if (r?.ok) tracked = new Set(r.data || []); setTimeout(run, 1200); });
  let last = location.pathname, timer = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (location.pathname !== last) { last = location.pathname; document.getElementById("aliedge-beebs-tools")?.remove(); lastReport = ""; }
      if (dressingId()) reportDressing(dressingId());
      run();
    }, 1500);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
