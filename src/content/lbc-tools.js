// Sur Leboncoin (si activé) : outils AliEdge sur les pages que le membre ouvre. Aucune requête vers Leboncoin.
// - Annonce : « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein), relier le produit fournisseur,
//   « Confier à la warehouse » (la warehouse achète, emballe et expédie à la place du membre).
// - Dépôt d'annonce : l'annonce rédigée dans AliEdge (version Leboncoin) prête à copier, ou à remplir d'un clic.
//   Le membre relit et publie lui-même : AliEdge ne publie jamais rien.
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
    panel.innerHTML = `<h4>Annonce AliEdge</h4>
      ${field("title", "Titre", l.title)}${field("body", "Description", l.description)}${field("price", "Prix conseillé", l.price ? String(l.price) : "")}
      ${l.category ? `<p class="msg">Catégorie : ${esc(l.category)}</p>` : ""}
      <button class="b p wide" type="button" data-fill>Remplir les champs de la page</button>
      <p class="msg" data-fillmsg>Relis tout avant de publier : c'est toi qui publies l'annonce.</p>`;
    const vals = { title: l.title, body: l.description, price: l.price ? String(Math.round(l.price)) : "" };
    panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(vals[b.dataset.copy]); b.textContent = "Copié"; } catch { b.textContent = "Copie impossible"; }
      setTimeout(() => { b.textContent = "Copier"; }, 1500);
    }));
    panel.querySelector("[data-fill]").addEventListener("click", () => {
      let n = 0;
      for (const k of ["title", "body", "price"]) { const el = vals[k] && findField(k); if (el) { setValue(el, vals[k]); n++; } }
      panel.querySelector("[data-fillmsg]").textContent = n
        ? `${n} champ${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""}. Relis tout avant de publier : c'est toi qui publies l'annonce.`
        : "Champs pas encore affichés sur cette étape : utilise les boutons « Copier ».";
    });
  }

  function run() {
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
