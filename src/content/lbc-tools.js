// Sur Leboncoin (si activé) : outils AliEdge sur les pages que le membre ouvre. Aucune requête vers Leboncoin.
// - Annonce : « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein), relier le produit fournisseur,
//   « Confier à la warehouse » (la warehouse achète, emballe et expédie à la place du membre).
// - Dépôt d'annonce : l'annonce rédigée dans AliEdge (version Leboncoin, ou reprise d'une annonce Vinted du membre)
//   prête à copier, ou à remplir d'un clic, photos comprises. Le membre relit et publie lui-même.
// - Messagerie : réponses toutes prêtes à insérer (jamais envoyées par AliEdge) et aide à la négociation.
// - Résultats de recherche : badge sur les produits déjà repérés dans le catalogue AliEdge (fournisseur, prix Vinted).
(async () => {
  try { if ((await chrome.storage.local.get("ae_disabled")).ae_disabled) return; } catch { /* stockage indisponible */ }
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

  // ───────── Listes déroulantes du site (catégorie, marque, état, taille) : on ouvre la ligne, on repère les choix
  // apparus après le clic (différence avant / après), on tape la recherche s'il y a un champ, on clique le bon choix.
  const pnorm = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
      const opt = bestOption(cands, words, false);
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
    [/satisfaisant|satisfactory/, ["satisfaisant", "etat satisfaisant", "correct", "etat correct", "etat moyen"]],
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

  // Étape « Choisissez une catégorie suggérée » : AliEdge coche la suggestion qui correspond à la catégorie Vinted
  // de l'annonce (Vêtements, Chaussures, Accessoires…), sinon la première suggestion de Leboncoin. Modifiable ensuite.
  const LBC_FROM_VINTED = [
    [/chaussure|basket|botte|sandale|escarpin|sneaker/i, /chaussures/i],
    [/sac|bagage|valise|portefeuille|ceinture|chapeau|casquette|lunettes|[ée]charpe|accessoire/i, /accessoires|bagagerie/i],
    [/montre|bijou|bracelet|collier|bague|boucle/i, /montres|bijoux/i],
    [/b[ée]b[ée]|pu[ée]riculture|poussette/i, /b[ée]b[ée]|pu[ée]riculture/i],
    [/jouet|jeux|peluche|figurine/i, /jeux|jouets/i],
    [/maison|d[ée]co|linge|cuisine|tapis|lampe/i, /d[ée]coration|ameublement|linge|maison/i],
    [/sport|v[ée]lo|fitness|camping/i, /sport/i],
    [/v[êe]tement|maillot|t-shirt|robe|pull|sweat|veste|manteau|jean|pantalon|jupe|chemise|short|top|gilet/i, /v[êe]tements/i],
  ];
  function pickSuggestedCategory(l) {
    const radios = [...document.querySelectorAll('input[type="radio"]')].filter((r) => r.offsetParent !== null || r.closest("label")?.offsetParent !== null);
    if (radios.length < 2 || !/cat[ée]gorie/i.test(document.body.innerText || "")) return false;
    if (radios.some((r) => r.checked)) return true;
    const labelOf = (r) => (r.closest("label")?.textContent || document.querySelector(`label[for="${r.id}"]`)?.textContent || r.parentElement?.textContent || "").replace(/\s+/g, " ");
    const source = `${(l.categoryPath || []).join(" ")} ${l.title || ""}`;
    let pick = null;
    for (const [from, to] of LBC_FROM_VINTED) {
      if (!from.test(source)) continue;
      pick = radios.find((r) => to.test(labelOf(r)));
      if (pick) break;
    }
    pick = pick || radios[0];
    (pick.closest("label") || document.querySelector(`label[for="${pick.id}"]`) || pick).click();
    if (!pick.checked) pick.click();
    return true;
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
      // Une seule fois par annonce, même si Leboncoin recharge ses étapes (sinon les photos repartiraient à chaque étape).
      const key = `ae_lbc_done_${l.vintedId || l.at || ""}`;
      const doneSet = new Set((() => { try { return JSON.parse(sessionStorage.getItem(key) || "[]"); } catch { return []; } })());
      const mark = (k) => { doneSet.add(k); try { sessionStorage.setItem(key, JSON.stringify([...doneSet])); } catch { /* rien */ } };
      let photosDone = doneSet.has("photos"), photosBusy = false, catDone = doneSet.has("cat"), condDone = false, brandDone = false;
      const note = (what) => { const m = panel.querySelector("[data-fillmsg]"); if (m) m.textContent = `${what === "état" ? "État" : "Marque"} choisi${what === "état" ? "" : "e"}. Relis tout avant de publier : c'est toi qui publies l'annonce.`; };
      let ticking = false;
      const tick = async () => {
        if (!document.getElementById("aliedge-lbc-deposit")) return clearInterval(auto);
        if (ticking) return;
        ticking = true;
        try { await step(); } finally { ticking = false; }
      };
      const step = async () => {
        for (const k of ["title", "body", "price"]) {
          if (filled.has(k) || !vals[k]) continue;
          const el = findField(k);
          if (el && !el.value) { setValue(el, vals[k]); filled.add(k); }
        }
        if (!catDone && pickSuggestedCategory(l)) { catDone = true; mark("cat"); }
        // Étape « Dites-nous en plus » : état (obligatoire) puis marque (ignorée si Leboncoin ne la connaît pas).
        if (!condDone && l.condition && rowTrigger(/^etat\b/)) { condDone = true; if (await pickValue(/^etat\b/, condWords(l.condition))) note("état"); }
        if (!brandDone && l.brand && rowTrigger(/^marque\b/)) { brandDone = true; if (await pickValue(/^marque\b/, [l.brand], { search: true })) note("marque"); }
        if (!photosDone && !photosBusy && (l.photos || []).length && (document.querySelector('input[type="file"]') || /d[ée]posez jusqu|importer|ajouter des photos/i.test(document.body.innerText || ""))) {
          photosBusy = true;
          const n = await addPhotos(l.photos);
          photosBusy = false;
          if (n) { photosDone = true; mark("photos"); panel.querySelector("[data-fillmsg]").textContent = `${n} photo${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""}. Relis tout avant de publier : c'est toi qui publies l'annonce.`; }
        }
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
    host.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:6px 0;flex:0 0 100%;";
    const root = host.attachShadow({ mode: "closed" });
    // Une seule ligne de réponses, défilable, au-dessus de la zone de saisie (sans la déformer).
    root.innerHTML = `<style>${CSS}
      .row{display:flex;gap:6px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}
      .row .chip{flex:0 0 auto;max-width:260px}</style>
      <div class="row" role="group" aria-label="Réponses toutes prêtes AliEdge">${replies.map((t, i) => `<button class="chip" type="button" data-r="${i}" title="${esc(t)}">${esc(t.replace(/\{prix\}/g, "…"))}</button>`).join("")}</div>`;
    root.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => {
      const el = messageBox(); if (!el) return;
      insertText(el, replies[Number(b.dataset.r)].replace(/\{prix\}/g, "…"));
    }));
    // Placé avant le bloc de saisie entier (pas à l'intérieur de sa ligne bouton + / texte / envoyer).
    let anchor = box.closest("form");
    if (!anchor) {
      anchor = box.parentElement;
      const rowFlex = (el) => { const cs = el && getComputedStyle(el); return !!cs && /flex/.test(cs.display) && !/column/.test(cs.flexDirection); };
      while (anchor?.parentElement && rowFlex(anchor.parentElement)) anchor = anchor.parentElement;
      if (rowFlex(anchor) && anchor.parentElement) anchor = anchor;
    }
    (anchor || box.parentElement).insertAdjacentElement("beforebegin", host);
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
