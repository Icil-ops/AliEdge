// ===============================
// Content script AliExpress complet : Favoris, dashboard, comptabilité Vinted + courbe évolution en overlay
// + VERROUILLAGE PAR CLÉ : rien n'est injecté tant que la clé n'est pas enregistrée.
// ===============================

var LICENSE_STORAGE_KEY = "ae_license_key";

// ── Guard : si le contexte extension est invalide (après rechargement), on se retire proprement
function isExtensionContextValid() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
  catch (e) { return false; }
}

function cleanupInvalidatedExtension() {
  // Retirer tous les boutons injectés et afficher une alerte discrète
  ["alivinted-dashboard-btn", "alivinted-analyse-btn", "alivinted-fav-heart-btn",
   "alivinted-dashboard-modal", "alivinted-vinted-results-overlay"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  console.warn("[ALIVINTED] Contexte extension invalidé — rechargez la page pour réactiver l'extension.");
  // Petite notification discrète
  const notif = document.createElement("div");
  notif.innerText = "Extension mise à jour — rechargez la page (F5) pour réactiver";
  Object.assign(notif.style, {
    position: "fixed", bottom: "16px", right: "16px", zIndex: "99999",
    background: "#1e293b", color: "#fbbf24", padding: "10px 16px",
    borderRadius: "8px", fontSize: "13px", boxShadow: "0 4px 16px #0004",
    fontFamily: "sans-serif", cursor: "pointer"
  });
  notif.onclick = () => notif.remove();
  document.body.appendChild(notif);
  setTimeout(() => { if (notif.parentNode) notif.remove(); }, 6000);
}

function hasValidLicense(callback) {
  try {
    chrome.storage.local.get(LICENSE_STORAGE_KEY, function (res) {
      var key = res && res[LICENSE_STORAGE_KEY];
      var ok =
        key &&
        /^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(String(key).trim());
      callback(!!ok);
    });
  } catch (e) {
    console.warn("[ALIVINTED] hasValidLicense error", e);
    callback(false);
  }
}

// Extraction produit
function getAliTitle() {
  // ── 1. Données JSON embarquées
  try {
    const rp = window.runParams || window.__runParams;
    if (rp) {
      const data = rp.data || rp;
      const title = data?.titleModule?.subject
                 || data?.data?.titleModule?.subject
                 || data?.pageModule?.title;
      if (title && title.trim().length > 5) return title.trim();
    }
  } catch (e) { /* continue */ }

  // ── 2. Balises <script> embarquées
  try {
    for (const s of document.querySelectorAll("script")) {
      const txt = s.textContent || "";
      const m = txt.match(/"subject"\s*:\s*"([^"]{10,})"/);
      if (m) return m[1];
    }
  } catch (e) { /* continue */ }

  // ── 3. Sélecteurs CSS (fragile mais utile en fallback)
  const titleSelectors = [
    "[class*='title--wrap'] h1",
    "[class*='product-title']",
    "[class*='pdp-title']",
    ".product-title-text",
    "h1[class*='title']",
    "h1"
  ];
  for (const sel of titleSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 5) return el.innerText.trim();
    } catch (e) { continue; }
  }

  // ── 4. Titre de la page
  return (document.title || "").replace(/\s*[\|–-]\s*AliExpress.*$/i, "").trim() || document.title;
}

// VERSION CIBLÉE : lit le gros prix dans .product-price-current
function getAliPrice() {
  const el = document.querySelector(".product-price-current");
  if (el) {
    const txt = (el.innerText || el.textContent || "").trim();
    const m = txt.match(/(\d[\d.,]*)\s*€/);
    if (m) {
      const num = parseFloat(m[1].replace(",", "."));
      if (!isNaN(num) && num > 0.2 && num < 20000) {
        return num;
      }
    }
  }

  const m2 = document.body.innerText.match(/(\d[\d.,]*)\s*€/);
  if (m2) {
    const num = parseFloat(m2[1].replace(",", "."));
    if (!isNaN(num) && num > 0.2 && num < 20000) {
      return num;
    }
  }

  return null;
}

function normalizeAliImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) url = "https:" + url;
  if (!url.startsWith("http")) return null;
  // Supprimer les suffixes de taille AliExpress pour avoir l'image originale
  // Ex: _640x640.jpg → .jpg, _Q80.jpg → .jpg, _50x50xz.jpg → .jpg
  url = url.replace(/(_\d+x\d+[^.]*)(\.(?:jpg|jpeg|png|webp))(\?.*)?$/i, "$2$3");
  url = url.replace(/(_Q\d+)(\.(?:jpg|jpeg|png|webp))(\?.*)?$/i, "$2$3");
  return url;
}

function getAliImage() {
  // ── 1. Lire les données JSON embarquées par AliExpress (le plus fiable)
  try {
    const rp = window.runParams || window.__runParams;
    if (rp) {
      const data = rp.data || rp;
      const imgs = data?.imageModule?.imagePathList
                || data?.data?.imageModule?.imagePathList;
      if (Array.isArray(imgs) && imgs.length) {
        const url = normalizeAliImageUrl(imgs[0]);
        if (url) {
          console.log("[ALIVINTED] Image source: runParams.imageModule →", url);
          return url;
        }
      }
    }
  } catch (e) { /* continue */ }

  // ── 1.5. Galerie produit principale par sélecteur CSS ciblé
  try {
    const gallerySelectors = [
      '.pdp-image .html-content img',
      '.image-view-item img',
      '[class*="product-gallery"] img',
      '[class*="pdp-img"] img',
      '.slider-image img',
      '.magnifier-image',
      '[data-role="image-viewer"] img',
      '.product-image-main img'
    ];
    for (const sel of gallerySelectors) {
      const img = document.querySelector(sel);
      if (img) {
        const src = img.getAttribute('data-src') || img.currentSrc || img.src || "";
        const url = normalizeAliImageUrl(src);
        if (url && url.includes("alicdn.com")) {
          console.log("[ALIVINTED] Image source: gallery CSS selector →", url);
          return url;
        }
      }
    }
  } catch (e) { /* continue */ }

  // ── 2. Chercher dans les balises <script> (JSON-LD ou données embarquées)
  try {
    const scripts = document.querySelectorAll("script");
    for (const s of scripts) {
      const txt = s.textContent || "";
      // Pattern : "imagePathList":["https://ae01.alicdn.com/..."] or ["//ae01..."]
      const m = txt.match(/"imagePathList"\s*:\s*\["((?:https?:|\/\/)[^"]+)"/);
      if (m) {
        const url = normalizeAliImageUrl(m[1]);
        if (url) {
          console.log("[ALIVINTED] Image source: script tag imagePathList →", url);
          return url;
        }
      }
      // Pattern JSON-LD Product image
      if (s.type === "application/ld+json") {
        try {
          const json = JSON.parse(txt);
          const img = json?.image?.[0] || json?.image || null;
          const url = normalizeAliImageUrl(typeof img === "string" ? img : null);
          if (url) {
            console.log("[ALIVINTED] Image source: JSON-LD →", url);
            return url;
          }
        } catch(e) { /* continue */ }
      }
    }
  } catch (e) { /* continue */ }

  // ── 3. Images CDN AliExpress dans la zone produit (haut de page, avant les recommandations)
  try {
    const allImgs = [...document.images];
    // Trouver la position du fold approximatif (hauteur viewport × 2)
    const foldY = window.innerHeight * 2;

    const candidates = allImgs.filter(img => {
      try {
        const src = img.currentSrc || img.src || "";
        if (!/ae0[0-9]\.alicdn\.com/.test(src)) return false;
        if (img.naturalWidth < 200 || img.naturalHeight < 200) return false;
        // Exclure images dans les sections recommandations/similaires
        const inReco = img.closest(
          "[class*='recommend'], [class*='similar'], [class*='related'], " +
          "[class*='bundle'], [class*='sponsor'], [class*='carousel'], " +
          "[class*='slider']:not([class*='product']):not([class*='main'])"
        );
        if (inReco) return false;
        // Préférer les images en haut de page
        const rect = img.getBoundingClientRect();
        return (rect.top + window.scrollY) < foldY;
      } catch (e) { return false; }
    });

    if (candidates.length) {
      candidates.sort((a, b) =>
        (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight)
      );
      const src = candidates[0].currentSrc || candidates[0].src;
      console.log("[ALIVINTED] Image source: CDN fallback (level 3) →", src);
      return src;
    }
  } catch (e) { /* continue */ }

  // ── 4. Dernier recours : plus grande image de la page
  try {
    let best = null, bestScore = 0;
    for (const img of document.images) {
      const score = (img.naturalWidth || 0) * (img.naturalHeight || 0);
      if (score > bestScore && score > 150 * 150) { best = img; bestScore = score; }
    }
    if (best) {
      const src = best.currentSrc || best.src || null;
      console.warn("[ALIVINTED] Image source: largest image fallback (level 4) →", src, "— résultats potentiellement incorrects");
      return src;
    }
    return null;
  } catch (e) { return null; }
}
function getAliShipping() {
  return 0;
}

// ==========================================================
// Fonction pour copier l'image dans le presse-papier (utilisé si demandé)
// ==========================================================
async function copyImageToClipboard(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);

    console.log("[CONTENT] Image copiée dans le presse-papier");
    return true;
  } catch (err) {
    console.error("[CONTENT] Erreur copie image:", err);
    return false;
  }
}

if (isExtensionContextValid()) chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_ALI") {
    const title = getAliTitle();
    const price = getAliPrice();
    const image = getAliImage();
    console.log("[ALIVINTED] GET_ALI →", { title, price, image });
    sendResponse({ ok: true, title, price, shipping: getAliShipping(), image });
  }

  if (msg.type === "COPY_IMAGE_TO_CLIPBOARD") {
    copyImageToClipboard(msg.imageUrl).then((ok) => {
      sendResponse({ ok });
    });
    return true;
  }

  return true;
});

// Dashboard bouton (gros bouton money)
function injectDashboardButton() {
  if (document.getElementById("alivinted-dashboard-btn")) return;
  const btn = document.createElement("button");
  btn.id = "alivinted-dashboard-btn";
  btn.innerText = "💸";
  btn.title = "Ouvrir le Dashboard AliExpress → Vinted";
  Object.assign(btn.style, {
    position: "fixed",
    top: "18px",
    right: "22px",
    zIndex: "10049",
    width: "48px",
    height: "48px",
    fontSize: "26px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)",
    color: "#fff",
    border: "2px solid rgba(255,255,255,0.15)",
    boxShadow: "0 4px 16px rgba(107,33,232,0.45)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "box-shadow 0.2s, transform 0.12s"
  });
  btn.onmouseenter = function () {
    btn.style.boxShadow = "0 6px 24px rgba(107,33,232,0.65)";
    btn.style.transform = "scale(1.05)";
  };
  btn.onmouseleave = function () {
    btn.style.boxShadow = "0 4px 16px rgba(107,33,232,0.45)";
    btn.style.transform = "scale(1)";
  };
  btn.onclick = function() {
    try {
      if (!isExtensionContextValid()) { try { cleanupInvalidatedExtension(); } catch(_) {} return; }
      showDashboardModal();
    } catch(e) { try { cleanupInvalidatedExtension(); } catch(_) {} }
  };
  document.body.appendChild(btn);
}

// Bouton loupe sous le dashboard pour ouvrir le popup de l'extension
function injectAnalyseButton() {
  if (document.getElementById("alivinted-analyse-btn")) return;
  const dashBtn = document.getElementById("alivinted-dashboard-btn");
  if (!dashBtn) return;

  const analyseBtn = document.createElement("button");
  analyseBtn.id = "alivinted-analyse-btn";
  analyseBtn.innerText = "🔍";
  analyseBtn.title = "Analyser ce produit sur Vinted";

  Object.assign(analyseBtn.style, {
    position: "fixed",
    top: "72px",
    right: "22px",
    zIndex: "10049",
    width: "48px",
    height: "48px",
    fontSize: "26px",
    borderRadius: "999px",
    background: "rgba(139,92,246,0.15)",
    color: "#C4B5FD",
    border: "2px solid rgba(139,92,246,0.4)",
    boxShadow: "0 2px 12px rgba(107,33,232,0.2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "box-shadow 0.2s, transform 0.12s"
  });

  analyseBtn.onmouseenter = function () {
    analyseBtn.style.boxShadow = "0 4px 20px rgba(107,33,232,0.4)";
    analyseBtn.style.transform = "scale(1.05)";
  };
  analyseBtn.onmouseleave = function () {
    analyseBtn.style.boxShadow = "0 2px 12px rgba(107,33,232,0.2)";
    analyseBtn.style.transform = "scale(1)";
  };

  analyseBtn.onclick = function () {
    try {
      // La vérification de chrome.runtime.id peut passer même quand le contexte
      // est invalide. On entoure TOUT dans un try/catch silencieux.
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        try { cleanupInvalidatedExtension(); } catch(_) {}
        return;
      }
      chrome.runtime.sendMessage({ type: "OPEN_POPUP" }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {
      // Contexte invalide après rechargement extension — nettoyage silencieux
      try { cleanupInvalidatedExtension(); } catch(_) {}
    }
  };

  document.body.appendChild(analyseBtn);
}

// Nouveau: petit bouton coeur fixé, sous la loupe, action = ajouter aux favoris
function injectFavHeartButton() {
  if (document.getElementById("alivinted-fav-heart-btn")) return;
  const dashBtn = document.getElementById("alivinted-dashboard-btn");
  if (!dashBtn) return;

  const heartBtn = document.createElement("button");
  heartBtn.id = "alivinted-fav-heart-btn";
  heartBtn.innerText = "❤️";
  heartBtn.title = "Ajouter ce produit à mes favoris";
  Object.assign(heartBtn.style, {
    position: "fixed",
    top: "126px",
    right: "22px",
    zIndex: "10049",
    width: "48px",
    height: "48px",
    fontSize: "24px",
    borderRadius: "999px",
    background: "rgba(192,57,43,0.15)",
    color: "#e57373",
    border: "2px solid rgba(192,57,43,0.4)",
    boxShadow: "0 2px 12px rgba(192,57,43,0.2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "box-shadow 0.2s, transform 0.12s"
  });

  heartBtn.onmouseenter = function () {
    heartBtn.style.boxShadow = "0 6px 24px rgba(192,57,43,0.4)";
    heartBtn.style.transform = "scale(1.06)";
  };
  heartBtn.onmouseleave = function () {
    heartBtn.style.boxShadow = "0 2px 12px rgba(192,57,43,0.2)";
    heartBtn.style.transform = "scale(1)";
  };

  heartBtn.onclick = function () {
    if (!isExtensionContextValid()) { cleanupInvalidatedExtension(); return; }
    try {
      addCurrentProductToFav();
      heartBtn.innerText = "💖";
      setTimeout(() => {
        heartBtn.innerText = "❤️";
      }, 900);
    } catch (e) {
      console.warn("[ALIVINTED] ajout favoris échoué:", e);
    }
  };

  document.body.appendChild(heartBtn);
}

// Ajout au panier (1 unité) - inchangé
function autoAddToCart() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("addtocart")) {
      let variations = Array.from(
        document.querySelectorAll(
          '[class*="sku-property"],[data-sku-name],.sku-property-list,.sku-property-item'
        )
      ).filter((node) => node.querySelectorAll("li,span,button,input").length > 0);
      variations.forEach((node) => {
        let option = Array.from(node.querySelectorAll("li,span,button,input")).find(
          (o) => o.offsetParent !== null && !o.classList.contains("selected")
        );
        if (option) option.click();
      });
      setTimeout(() => {
        let btns = Array.from(document.querySelectorAll("button,span")).filter(
          (b) =>
            b.textContent &&
            b.textContent.toLowerCase().includes("ajouter au panier") &&
            b.offsetParent !== null
        );
        let addBtn = btns.find(
          (b) =>
            b.getBoundingClientRect().width > 100 &&
            b.getBoundingClientRect().height > 20
        );
        if (addBtn) addBtn.click();
        setTimeout(() => {
          params.delete("addtocart");
          params.delete("qty");
          history.replaceState(null, "", window.location.pathname);
        }, 1100);
      }, 350);
    }
  } catch (e) {}
}

// Fonction qui ajoute le produit courant aux favoris (localStorage)
function addCurrentProductToFav() {
  try {
    const favs = JSON.parse(localStorage.getItem("alivinted-favs") || "[]");
    const currentUrl = window.location.href;
    if (favs.find((f) => f.url === currentUrl)) {
      console.log("[ALIVINTED] produit déjà en favoris :", currentUrl);
      return;
    }
    const titre = getAliTitle();
    const image = getAliImage();
    const prix = getAliPrice();
    favs.push({
      titre: titre || "Produit AliExpress",
      image: image || null,
      url: currentUrl,
      prix: typeof prix === "number" ? Number(prix) : null,
      date: new Date().toISOString()
    });
    localStorage.setItem("alivinted-favs", JSON.stringify(favs));
    showTemporaryToast("Produit ajouté à vos favoris ✔", 1500);
    console.log("[ALIVINTED] favori ajouté :", titre);
  } catch (e) {
    console.error("[ALIVINTED] addCurrentProductToFav error:", e);
  }
}

// petit toast discret
function showTemporaryToast(txt, ms) {
  try {
    const id = "alivinted-toast";
    let t = document.getElementById(id);
    if (t) t.remove();
    t = document.createElement("div");
    t.id = id;
    t.textContent = txt;
    Object.assign(t.style, {
      position: "fixed",
      left: "18px",
      bottom: "18px",
      background: "#111827",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "8px",
      zIndex: 120000,
      boxShadow: "0 8px 30px rgba(0,0,0,0.3)"
    });
    document.body.appendChild(t);
    setTimeout(() => {
      try {
        t.remove();
      } catch (e) {}
    }, ms || 1200);
  } catch (e) {}
}

// Dashboard + overlay (identique à la version précédente)
// For brevity the implementation remains functionally same.
// It includes showDashboardModal(), renderInspirationsList(), computeSeries(), drawCurveOnCanvas(), renderTabsContent().
// (Full implementation preserved from previous version; included below)

// ... start of dashboard modal and helpers (kept as before) ...

function showDashboardModal() {
  if (document.getElementById('alivinted-dashboard-modal')) return;
  const modal = document.createElement('div');
  modal.id = "alivinted-dashboard-modal";
  Object.assign(modal.style, {
    position: "fixed", top: "0", left: "0",
    width: "100vw", height: "100vh", zIndex: "10050",
    background: "rgba(30,41,59,0.96)",
    display: "flex", alignItems: "center", justifyContent: "center"
  });
  const content = document.createElement('div');
  Object.assign(content.style, {
    background: "#fff", borderRadius: "20px", boxShadow: "0 6px 40px #0006",
    padding: "34px 28px 24px 28px", minWidth: "380px", maxWidth: "96vw", maxHeight: "88vh",
    overflowY: "auto", position: "relative", display: "flex", flexDirection: "column", gap: "24px"
  });
  const closeBtn = document.createElement('button');
  closeBtn.innerText = "✕";
  Object.assign(closeBtn.style, {
    position: "absolute", top: "7px", right: "18px",
    fontSize: "22px", border: "none", background: "none", color: "#374151", cursor: "pointer"
  });
  closeBtn.onclick = () => modal.remove();
  content.appendChild(closeBtn);

  // Tabs
  const tabsBar = document.createElement("div");
  Object.assign(tabsBar.style, { display: "flex", gap: "16px", marginBottom: "16px", alignItems: "center", justifyContent: "center" });
  const tabs = [{ key: "fav", label: "⭐ Favoris AliExpress" }, { key: "compta", label: "📊 Compta Vinted" }];
  let activeTab = "fav";
  tabs.forEach(t => {
    const tabBtn = document.createElement("button");
    tabBtn.innerText = t.label;
    Object.assign(tabBtn.style, { fontSize: "15px", border: "none", background: "none", padding: "8px 20px", borderRadius: "17px", cursor: "pointer", fontWeight: "bold", transition: "background 0.2s" });
    tabBtn.onclick = function() {
      activeTab = t.key;
      renderTabsContent();
      tabsBar.querySelectorAll("button").forEach(btn => { btn.style.background = ""; btn.style.color = "#374151"; });
      tabBtn.style.background = "#fde68a"; tabBtn.style.color = "#1e293b";
    };
    if (t.key === activeTab) { tabBtn.style.background = "#fde68a"; tabBtn.style.color = "#1e293b"; }
    tabsBar.appendChild(tabBtn);
  });
  content.appendChild(tabsBar);

  const tabsContent = document.createElement("div");
  tabsContent.id = "alivinted-tabs-content";
  content.appendChild(tabsContent);

  function addProductToCart(url) {
    const urlObj = new URL(url);
    urlObj.searchParams.set('addtocart', '1');
    window.open(urlObj.toString(), "_blank");
  }
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, function (s) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s];
    });
  }

  // Helper: fetch with timeout and fallback
  function fetchWithTimeout(url, options = {}, timeout = 7000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(() => clearTimeout(id));
  }

  // Render helper for inspirations (max 3)
  function renderInspirationsList(container, inspirations) {
    container.innerHTML = ""; // clear
    if (!Array.isArray(inspirations) || inspirations.length === 0) {
      container.innerHTML = `<div style="font-size:12px;color:#64748b;margin-top:8px">Aucune inspiration trouvée.</div>`;
      return;
    }
    const list = document.createElement("div");
    Object.assign(list.style, { display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" });
    inspirations.slice(0, 3).forEach((ins, i) => {
      const card = document.createElement("div");
      Object.assign(card.style, {
        display: "flex", flexDirection: "column", alignItems: "center",
        width: "170px", background: "#0f1724", color: "#fff", borderRadius: "9px",
        padding: "10px", boxShadow: "0 6px 20px #0008"
      });
      const img = document.createElement("img");
      img.src = ins.image || "";
      Object.assign(img.style, { width: "120px", height: "90px", objectFit: "cover", borderRadius: "6px", background: "#fff" });
      const t = document.createElement("div");
      t.innerText = ins.title || "Annonce Vinted";
      Object.assign(t.style, { fontSize: "13px", color: "#fff", marginTop: "8px", textAlign: "center", minHeight: "34px", overflow: "hidden", textOverflow: "ellipsis" });
      const p = document.createElement("div");
      p.innerText = (ins.price != null) ? (ins.price + " €") : "";
      Object.assign(p.style, { fontSize: "13px", color: "#22c55e", marginTop: "6px" });
      const a = document.createElement("a");
      a.href = ins.url || "#";
      a.target = "_blank";
      a.innerText = "Voir l'annonce";
      Object.assign(a.style, { marginTop: "8px", background: "#4f46e5", color: "#fff", padding: "6px 8px", borderRadius: "6px", textDecoration: "none", fontSize: "12px" });

      card.appendChild(img);
      card.appendChild(t);
      card.appendChild(p);
      card.appendChild(a);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  function computeSeries(compta, period) {
    let points = [], labels = [], groups = {};
    if (period === "quotidien") {
      compta.forEach(c => { groups[c.date] = (groups[c.date] || 0) + c.benef; });
      labels = Object.keys(groups).sort();
      points = labels.map(k => groups[k]);
    } else if (period === "hebdo") {
      compta.forEach(c => {
        const d = new Date(c.date);
        const week = d.getFullYear() + "-W" + parseInt((d.getDate() - d.getDay() + 10) / 7);
        groups[week] = (groups[week] || 0) + c.benef;
      });
      labels = Object.keys(groups).sort();
      points = labels.map(k => groups[k]);
    } else {
      compta.forEach(c => {
        const m = c.date.slice(0, 7);
        groups[m] = (groups[m] || 0) + c.benef;
      });
      labels = Object.keys(groups).sort();
      points = labels.map(k => groups[k]);
    }
    return { points, labels };
  }

  function drawCurveOnCanvas(canvasEl, compta, period, options = {}) {
    if (!canvasEl) return { points: [], labels: [], coords: [] };
    const ctx = canvasEl.getContext("2d");
    const c = canvasEl;
    ctx.clearRect(0, 0, c.width, c.height);
    const { points, labels } = computeSeries(compta, period);
    ctx.font = (options.big ? "14px Arial" : "12px Arial");
    let min = Math.min(0, ...points), max = Math.max(...points, 10);
    let hx = c.height - (options.big ? 60 : 36), wx = c.width - (options.big ? 70 : 41), n = points.length;
    ctx.strokeStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(options.big ? 65 : 32, 12);
    ctx.lineTo(options.big ? 65 : 32, hx);
    ctx.lineTo(wx, hx);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.fillText("€", options.big ? 26 : 10, 18);
    const coords = [];
    if (n > 0) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (options.big ? 65 : 32) + i * (wx - (options.big ? 65 : 32)) / Math.max(n - 1, 1);
        const y = hx - (points[i] - min) / (max - min + 0.001) * (hx - (options.big ? 22 : 14));
        coords.push({ x, y, val: points[i], label: labels[i] });
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = options.big ? 3.5 : 2.5;
      ctx.stroke();
      // points
      for (let i = 0; i < n; i++) {
        const { x, y } = coords[i];
        ctx.beginPath();
        ctx.arc(x, y, options.big ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.strokeStyle = "#2563eb";
        ctx.stroke();
        if (options.big || n <= 10) {
          ctx.fillStyle = "#374151";
          ctx.font = options.big ? "13px Arial" : "11px Arial";
          ctx.fillText(labels[i], x - (options.big ? 24 : 16), hx + (options.big ? 26 : 15));
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const { x, y } = coords[i];
        if (i === 0) { ctx.moveTo(x, hx); ctx.lineTo(x, y); } else ctx.lineTo(x, y);
      }
      ctx.lineTo(coords[n - 1].x, hx);
      ctx.closePath();
      ctx.fillStyle = "#22c55e";
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#1e293b";
    ctx.fillText((max.toFixed(2) || "0") + " €", options.big ? 22 : 10, 24);
    ctx.fillText((min.toFixed(2) || "0") + " €", options.big ? 22 : 10, hx - 2);
    return { points, labels, coords };
  }

  function renderTabsContent() {
    tabsContent.innerHTML = "";
    // Favoris
    if (activeTab === "fav") {
      const favs = JSON.parse(localStorage.getItem('alivinted-favs') || "[]");
      const title = document.createElement("div");
      title.innerHTML = `<span style="font-size:18px;font-weight:bold;color:#22c55e;letter-spacing:0.5px">⭐ Mes Favoris AliExpress</span>`;
      tabsContent.appendChild(title);
      if (favs.length === 0) {
        tabsContent.innerHTML += `<div style="margin-top:14px;font-size:14px;color:#64748b;">Aucun produit en favori pour l'instant.</div>`;
      } else {
        favs.slice().reverse().forEach((f, i) => {
          const card = document.createElement("div");
          Object.assign(card.style, { display: "flex", alignItems: "center", gap: "14px", background: "#f3f4f6", borderRadius: "9px", padding: "14px", margin: "8px 0", position: "relative" });
          const delBtn = document.createElement("button");
          delBtn.innerText = "✕";
          Object.assign(delBtn.style, { position: "absolute", top: "7px", right: "13px", border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: "18px" });
          delBtn.title = "Supprimer ce favori";
          delBtn.onclick = function() {
            const favs2 = JSON.parse(localStorage.getItem('alivinted-favs') || "[]");
            favs2.splice(favs2.length - 1 - i, 1);
            localStorage.setItem('alivinted-favs', JSON.stringify(favs2));
            renderTabsContent();
          };
          card.appendChild(delBtn);
          if (f.image) {
            const imgEl = document.createElement("img");
            imgEl.src = f.image;
            Object.assign(imgEl.style, { width: "60px", height: "60px", objectFit: "cover", borderRadius: "7px", background: "#ddd" });
            card.appendChild(imgEl);
          }
          const infos = document.createElement("div");
          infos.style.flex = "1";
          infos.innerHTML = `<b style="font-size:16px;color:#163a16">${escapeHtml(f.titre) || "Produit AliExpress"}</b><br>
            <a href="${f.url}" target="_blank" style="font-size:13px;color:#4f46e5;text-decoration:underline;">Voir la fiche produit</a>
            <br><span style="font-size:14px;color:#64748b">Prix : ${f.prix != null ? f.prix.toFixed(2) + " €" : "—"}</span>`;

          const analyzeDiv = document.createElement("div");
          analyzeDiv.style.marginTop = "8px";
          analyzeDiv.innerHTML = `<div style="font-size:11px;color:#8B5CF6;font-family:'Space Mono',monospace;">💡 Lance une analyse depuis le popup AliEdge pour voir les résultats Vinted ici.</div>`;
          infos.appendChild(analyzeDiv);

          const panierBtn = document.createElement("button");
          panierBtn.innerHTML = "🛒 Ajouter au panier sur AliExpress";
          Object.assign(panierBtn.style, { background: "#facc15", color: "#1e293b", fontWeight: "bold", fontSize: "13.5px", border: "none", borderRadius: "7px", padding: "6px 18px", marginLeft: "12px", cursor: "pointer" });
          panierBtn.onclick = function() { addProductToCart(f.url); };
          infos.appendChild(panierBtn);

          card.appendChild(infos);
          tabsContent.appendChild(card);
        });
      }
    }

    // Comptabilité Vinted
    if (activeTab === "compta") {
      const compta = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
      const favoris = JSON.parse(localStorage.getItem("alivinted-favs") || "[]");
      const title = document.createElement("div");
      title.innerHTML = `<span style="font-size:18px;font-weight:bold;color:#4f46e5;">📊 Ma comptabilité Vinted</span>`;
      tabsContent.appendChild(title);

      const form = document.createElement("form");
      Object.assign(form.style, { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "20px" });

      const nomSelect = document.createElement("select");
      Object.assign(nomSelect.style, { padding: "7px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "13px", flex: "1" });
      nomSelect.required = true;
      nomSelect.innerHTML = `<option value="">Choisir produit favori</option>`;
      favoris.forEach(f => { nomSelect.innerHTML += `<option value="${escapeHtml(f.titre)}" data-prix="${f.prix}">${escapeHtml(f.titre)}</option>`; });
      form.appendChild(nomSelect);

      const achatInput = document.createElement("input");
      achatInput.type = "number"; achatInput.step = "0.01"; achatInput.placeholder = "Prix d'achat (€)";
      Object.assign(achatInput.style, { width: "110px", padding: "7px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "13px" });
      achatInput.required = true; form.appendChild(achatInput);
      nomSelect.onchange = function() {
        const opt = nomSelect.options[nomSelect.selectedIndex];
        achatInput.value = opt ? opt.getAttribute('data-prix') || "" : "";
      };

      const venteInput = document.createElement("input");
      venteInput.type = "number"; venteInput.step = "0.01"; venteInput.placeholder = "Prix de vente (€)";
      Object.assign(venteInput.style, { width: "110px", padding: "7px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "13px" });
      venteInput.required = true; form.appendChild(venteInput);

      const dateInput = document.createElement("input");
      dateInput.type = "date"; dateInput.value = new Date().toISOString().slice(0, 10);
      Object.assign(dateInput.style, { width: "142px", padding: "7px", borderRadius: "5px", border: "1px solid #cbd5e1", fontSize: "13px" });
      form.appendChild(dateInput);

      const benefSpan = document.createElement("span");
      benefSpan.style.fontWeight = "bold"; benefSpan.style.color = "#22c55e"; benefSpan.style.width = "110px";
      benefSpan.textContent = "Bénéfice : 0 €";
      form.appendChild(benefSpan);

      venteInput.oninput = achatInput.oninput = function() {
        const b = (parseFloat(venteInput.value || "0") - parseFloat(achatInput.value || "0")).toFixed(2);
        benefSpan.textContent = "Bénéfice : " + (isNaN(b) ? "0" : b) + " €";
        benefSpan.style.color = b >= 0 ? "#22c55e" : "#ef4444";
      };

      const addBtn = document.createElement("button");
      addBtn.type = "submit"; addBtn.innerText = "Ajouter vente";
      Object.assign(addBtn.style, { background: "#facc15", color: "#1e293b", fontWeight: "bold", border: "none", borderRadius: "7px", padding: "9px 20px", fontSize: "14px", cursor: "pointer" });
      form.appendChild(addBtn);

      form.onsubmit = function(e) {
        e.preventDefault();
        const nom = nomSelect.value;
        const achat = parseFloat(achatInput.value || "0");
        const vente = parseFloat(venteInput.value || "0");
        const date = dateInput.value;
        if (!nom || isNaN(achat) || isNaN(vente) || !date) return;
        const benef = +(vente - achat).toFixed(2);
        const data = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
        data.push({ nom, achat, vente, benef, date });
        localStorage.setItem("alivinted-compta", JSON.stringify(data));
        nomSelect.value = ""; achatInput.value = ""; venteInput.value = "";
        dateInput.value = new Date().toISOString().slice(0, 10);
        benefSpan.textContent = "Bénéfice : 0 €";
        renderTabsContent();
      };
      tabsContent.appendChild(form);

      const dataCompta = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
      if (dataCompta.length) {
        const table = document.createElement("table");
        Object.assign(table.style, { width: "100%", borderCollapse: "collapse", marginBottom: "22px" });
        table.innerHTML = `<thead>
          <tr style="background:#f3f4f6;font-size:14px">
            <th style="padding:6px 9px;">Produit</th>
            <th>Prix d'achat (€)</th>
            <th>Prix vente (€)</th>
            <th>Bénéfice (€)</th>
            <th>Date vente</th>
            <th></th>
          </tr></thead><tbody></tbody>`;
        const tbody = table.querySelector("tbody");
        dataCompta.slice().reverse().forEach((c, i) => {
          const row = document.createElement("tr");
          row.style.fontSize = "13px";
          row.innerHTML = `<td style="padding:6px 9px;">${escapeHtml(c.nom)}</td>
            <td style="text-align:right;">${c.achat.toFixed(2)}</td>
            <td style="text-align:right;">${c.vente.toFixed(2)}</td>
            <td style="text-align:right;"><span style="color:${c.benef>=0?"#22c55e":"#ef4444"}">${c.benef.toFixed(2)}</span></td>
            <td style="text-align:center;">${c.date}</td>
            <td><button style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px" title="Supprimer">✕</button></td>`;
          row.querySelector("button").onclick = function() {
            const all = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
            all.splice(all.length - 1 - i, 1);
            localStorage.setItem("alivinted-compta", JSON.stringify(all));
            renderTabsContent();
          };
          tbody.appendChild(row);
        });
        tabsContent.appendChild(table);
      }

      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      let benefMonth = 0, nbMonth = 0;
      dataCompta.forEach(c => { if (c.date.slice(0, 7) === thisMonth) { benefMonth += c.benef; nbMonth++; } });
      const recap = document.createElement("div");
      recap.style.marginBottom = "18px";
      recap.innerHTML = `<b style="font-size:15px;color:#1e293b">Récap mensuel : <span style="color:#22c55e">${thisMonth}</span></b><br>
         <span style="color:#64748b">Ventes : <b>${nbMonth}</b> | Bénéfice total : <b>${benefMonth.toFixed(2)} €</b></span>`;
      tabsContent.appendChild(recap);

      const periods = ["quotidien", "hebdo", "mensuel"];
      let periodSel = "mensuel";
      const curveWrapper = document.createElement("div");
      curveWrapper.style.marginBottom = "8px";
      curveWrapper.innerHTML = `<b style="color:#4f46e5">Courbe évolution</b> `;
      const selectPeriod = document.createElement("select");
      selectPeriod.style.marginLeft = "10px";
      periods.forEach(p => { const opt = document.createElement("option"); opt.value = p; opt.innerText = p[0].toUpperCase() + p.slice(1); selectPeriod.appendChild(opt); });
      selectPeriod.value = "mensuel";
      curveWrapper.appendChild(selectPeriod);
      tabsContent.appendChild(curveWrapper);

      const smallCanvas = document.createElement("canvas");
      smallCanvas.width = 384; smallCanvas.height = 100;
      Object.assign(smallCanvas.style, { background: "#fff", borderRadius: "13px", boxShadow: "0 2px 10px #0002", marginTop: "9px", cursor: "pointer" });
      tabsContent.appendChild(smallCanvas);

      function redrawSmall() {
        const all = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
        drawCurveOnCanvas(smallCanvas, all, selectPeriod.value, { big: false });
      }
      redrawSmall();
      selectPeriod.onchange = redrawSmall;

      smallCanvas.onclick = function () {
        if (document.getElementById('alivinted-curve-overlay')) return;
        const all = JSON.parse(localStorage.getItem("alivinted-compta") || "[]");
        let periodGraph = selectPeriod.value;
        const overlay = document.createElement("div");
        overlay.id = 'alivinted-curve-overlay';
        Object.assign(overlay.style, {
          position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", zIndex: 12000,
          background: "rgba(18,22,36,0.86)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "30px", boxSizing: "border-box"
        });
        const card = document.createElement("div");
        Object.assign(card.style, {
          width: "980px", maxWidth: "96vw", maxHeight: "92vh", background: "#fff", borderRadius: "14px",
          padding: "18px 20px", boxShadow: "0 12px 60px #0008", overflow: "auto", position: "relative"
        });
        const closeBtn = document.createElement("button");
        closeBtn.innerText = "✕";
        Object.assign(closeBtn.style, { position: "absolute", right: "14px", top: "10px", border: "none", background: "none", fontSize: "22px", cursor: "pointer" });
        closeBtn.onclick = () => overlay.remove();
        card.appendChild(closeBtn);

        const title = document.createElement("div");
        title.innerText = "Courbe d'évolution du business";
        Object.assign(title.style, { fontSize: "23px", color: "#225", fontWeight: "700", marginBottom: "8px", textAlign: "center" });
        card.appendChild(title);

        const statsDiv = document.createElement("div");
        Object.assign(statsDiv.style, { marginBottom: "12px", color: "#1e293b", fontWeight: "600", textAlign: "center" });
        card.appendChild(statsDiv);

        const controls = document.createElement("div");
        Object.assign(controls.style, { display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", marginBottom: "8px" });
        const periodSelect = document.createElement("select");
        ["quotidien", "hebdo", "mensuel"].forEach(p => {
          const o = document.createElement("option");
          o.value = p; o.innerText = p[0].toUpperCase() + p.slice(1);
          periodSelect.appendChild(o);
        });
        periodSelect.value = selectPeriod.value;
        Object.assign(periodSelect.style, { padding: "8px", borderRadius: "8px", border: "1px solid #ccc" });
        controls.appendChild(periodSelect);
        card.appendChild(controls);

        const bigCanvas = document.createElement("canvas");
        bigCanvas.width = 900; bigCanvas.height = 400;
        Object.assign(bigCanvas.style, { display: "block", margin: "6px auto", background: "#fff", borderRadius: "12px" });
        card.appendChild(bigCanvas);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function drawCurveFull(period) {
          let points=[],labels=[],groups={};
          if(period==="quotidien"){
            all.forEach(c => { groups[c.date]=(groups[c.date]||0)+c.benef; });
            labels = Object.keys(groups).sort(); points = labels.map(k=>groups[k]);
          }
          else if(period==="hebdo"){
            all.forEach(c=>{
              const d=new Date(c.date);
              const week = d.getFullYear()+"-W"+parseInt((d.getDate()-d.getDay()+10)/7);
              groups[week]=(groups[week]||0)+c.benef;
            });
            labels = Object.keys(groups).sort(); points = labels.map(k=>groups[k]);
          }
          else{
            all.forEach(c=>{
              const m = c.date.slice(0,7);
              groups[m]=(groups[m]||0)+c.benef;
            });
            labels = Object.keys(groups).sort(); points = labels.map(k=>groups[k]);
          }
          let ctx = bigCanvas.getContext("2d");
          ctx.clearRect(0,0,bigCanvas.width,bigCanvas.height);
          ctx.font="15px Arial";
          let min = Math.min(0,...points), max = Math.max(...points, 10);
          let hx = bigCanvas.height-56, wx = bigCanvas.width-78, n = points.length;
          ctx.strokeStyle="#64748b";
          ctx.beginPath();
          ctx.moveTo(73,28); ctx.lineTo(73,hx);
          ctx.lineTo(wx,hx); ctx.stroke();
          ctx.fillStyle="#64748b"; ctx.fillText("€",38,36);
          const coords = [];
          if(n>0){
            ctx.beginPath();
            for(let i=0;i<n;i++){
              let x=73+i*(wx-73)/Math.max(n-1,1), y=hx-(points[i]-min)/(max-min+0.001)*(hx-28);
              coords.push({x,y,val:points[i],label:labels[i]});
              if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            }
            ctx.strokeStyle="#2563eb"; ctx.lineWidth=3;
            ctx.stroke();
            for(let i=0;i<n;i++){
              let x=coords[i].x, y=coords[i].y;
              ctx.beginPath(); ctx.arc(x,y,8,0,6.3);
              ctx.fillStyle="#22c55e"; ctx.fill();
              ctx.strokeStyle="#2563eb"; ctx.stroke();
              ctx.fillStyle="#374151"; ctx.font="13px Arial";
              ctx.fillText(labels[i],x-27,hx+28);
            }
            ctx.save();
            ctx.globalAlpha=0.16;
            ctx.beginPath();
            for(let i=0;i<n;i++){
              let x=coords[i].x, y=coords[i].y;
              if(i===0) ctx.moveTo(x,hx),ctx.lineTo(x,y);
              else ctx.lineTo(x,y);
            }
            ctx.lineTo(coords[n-1].x,hx);
            ctx.closePath();
            ctx.fillStyle="#22c55e"; ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle="#1e293b";
          ctx.fillText((max.toFixed(2)||"0")+" €",38,46);
          ctx.fillText((min.toFixed(2)||"0")+" €",38,hx-2);

          const total = points.reduce((s,v)=>s+v,0).toFixed(2);
          const avg = points.length?(points.reduce((s,v)=>s+v,0)/points.length).toFixed(2):"0.00";
          statsDiv.innerHTML = `<b style="color:#16a34a;">Total : ${total} €</b> · <b>Moyenne : ${avg} €</b> · <b>Max : ${Math.max(...points)} €</b> · <b>Min : ${Math.min(...points)} €</b> · <b>Points : ${points.length}</b>`;

          return coords;
        }

        function redrawOverlay() { drawCurveFull(periodSelect.value || "mensuel"); }
        redrawOverlay(); periodSelect.onchange = redrawOverlay;

        let tooltip = null;
        bigCanvas.onmousemove = function(e){
          const rect = bigCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left, y = e.clientY - rect.top;
          const coords = drawCurveFull(periodSelect.value);
          for(let i=0;i<coords.length;i++){
            if(Math.abs(x-coords[i].x)<15 && Math.abs(y-coords[i].y)<15){
              if(!tooltip){
                tooltip = document.createElement("div");
                Object.assign(tooltip.style, {
                  position: "fixed", zIndex: "13000", background: "#fff", color: "#1b3f2b",
                  padding: "8px 12px", borderRadius: "8px", boxShadow: "0 6px 22px #0002", fontSize: "15px"
                });
                document.body.appendChild(tooltip);
              }
              tooltip.innerHTML = `<b>${coords[i].label}</b><br/>Bénéfice : <span style="color:${coords[i].val>=0?"#22c55e":"#ef4444"}">${coords[i].val.toFixed(2)} €</span>`;
              tooltip.style.left = (e.clientX + 14) + "px";
              tooltip.style.top = (e.clientY + 7) + "px";
              return;
            }
          }
          if (tooltip) { tooltip.remove(); tooltip = null; }
        };
        bigCanvas.onmouseleave = () => { if (tooltip) { tooltip.remove(); tooltip = null; } };
        overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };
        function escHandler(e){ if(e.key==="Escape"){overlay.remove();document.removeEventListener('keydown',escHandler);} }
        document.addEventListener('keydown',escHandler);
      };
    }
  }
  renderTabsContent();
  modal.appendChild(content);
  document.body.appendChild(modal);
}

// ===============================
// QUICK SEARCH BUTTON ⚡
// ===============================

function injectQuickSearchButton() {
  if (document.getElementById("alivinted-quicksearch-btn")) return;
  const btn = document.createElement("button");
  btn.id = "alivinted-quicksearch-btn";
  btn.title = "Analyser directement sur Vinted (1 clic)";
  btn.innerHTML = "⚡";
  Object.assign(btn.style, {
    position: "fixed",
    top: "180px",
    right: "22px",
    zIndex: "10049",
    width: "48px",
    height: "48px",
    fontSize: "22px",
    borderRadius: "999px",
    background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)",
    color: "#fff",
    border: "2px solid rgba(255,255,255,0.2)",
    boxShadow: "0 4px 16px rgba(107,33,232,0.45)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "box-shadow 0.2s, transform 0.12s, opacity 0.15s"
  });

  btn.onmouseenter = function () {
    if (!btn.disabled) {
      btn.style.boxShadow = "0 6px 28px rgba(107,33,232,0.65)";
      btn.style.transform = "scale(1.06)";
    }
  };
  btn.onmouseleave = function () {
    btn.style.boxShadow = "0 4px 16px rgba(107,33,232,0.45)";
    btn.style.transform = "scale(1)";
  };

  btn.onclick = function () {
    if (btn.disabled) return;
    if (!isExtensionContextValid()) { cleanupInvalidatedExtension(); return; }
    runQuickSearch(btn);
  };

  document.body.appendChild(btn);
}

async function runQuickSearch(btn) {
  const originalHTML = btn.innerHTML;

  function setLoading(msg) {
    btn.innerHTML = msg || "⏳";
    btn.disabled = true;
    btn.style.opacity = "0.75";
    btn.style.cursor = "default";
  }
  function resetBtn() {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }

  try {
    setLoading("⏳");

    var title = getAliTitle();
    var price = getAliPrice();
    var imageUrl = getAliImage();

    // Si le titre manque, utiliser le titre de la page comme fallback
    if (!title) title = document.title.replace(/\s*-\s*AliExpress.*$/i, "").trim();

    // Si le prix n'est pas détecté, permettre quand même la recherche avec prix=0
    // (l'utilisateur pourra l'entrer manuellement dans les résultats)
    if (!price) {
      showTemporaryToast("⚠️ Prix non détecté — la marge sera à 0 dans l'historique. Attends le chargement.", 3000);
      price = 0; // permet de continuer
    }

    if (!title) {
      showTemporaryToast("❌ Page produit non détectée. Ouvre une fiche produit AliExpress.", 2500);
      resetBtn();
      return;
    }
    if (!imageUrl) {
      showTemporaryToast("❌ Image produit non détectée. La page est peut-être encore en chargement.", 2500);
      resetBtn();
      return;
    }

    showTemporaryToast("⚡ Analyse en cours... La page résultats va s'ouvrir.", 5000);

    // 1. Récupérer l'image en dataUrl via le background (évite les problèmes CORS)
    var fetchResp = await new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: "FETCH_IMAGE", url: imageUrl }, function (r) {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      } catch (e) { resolve(null); }
    });

    if (!fetchResp || fetchResp.error || !fetchResp.dataUrl) {
      showTemporaryToast("❌ Impossible de charger l'image produit.", 2500);
      resetBtn();
      return;
    }

    // 2. Récupérer le marché + condition + multi-marché sauvegardés
    var settingsData = await new Promise(function (resolve) {
      try {
        chrome.storage.local.get(["ae_market", "ae_condition", "ae_multimarket"], function (res) {
          void chrome.runtime.lastError;
          resolve(res || {});
        });
      } catch (e) { resolve({}); }
    });
    var market = (settingsData && settingsData.ae_market) ? settingsData.ae_market : "fr";
    var condition = (settingsData && settingsData.ae_condition) ? settingsData.ae_condition : "all";
    var multiMarket = !!(settingsData && settingsData.ae_multimarket);

    // 3. Stocker l'image dans le state du background
    await new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { type: "UPLOAD_IMAGE_FOR_VINTED", dataUrl: fetchResp.dataUrl, imageUrl: imageUrl },
          function (r) { void chrome.runtime.lastError; resolve(r); }
        );
      } catch (e) { resolve(null); }
    });

    // 4. Lancer la recherche (ouvre la page résultats + analyse complète)
    chrome.runtime.sendMessage({
      type: "SEARCH_VINTED_BY_IMAGE",
      aliPrice: price,
      aliTitle: title,
      market: market,
      condition: condition,
      multiMarket: multiMarket
    }, function () { void chrome.runtime.lastError; });

    btn.innerHTML = "✅";
    showTemporaryToast("✅ Analyse lancée ! La page résultats s'ouvre...", 2000);
    setTimeout(resetBtn, 2200);

  } catch (e) {
    console.error("[ALIVINTED] quickSearch error:", e);
    showTemporaryToast("❌ Erreur : " + (e.message || String(e)), 2500);
    resetBtn();
  }
}

// ===============================
// RACCOURCI CLAVIER Alt+Shift+V (Feature 2)
// ===============================

function initKeyboardShortcut() {
  document.addEventListener("keydown", function (e) {
    // Alt + Shift + V → lancer le Quick Search
    if (e.altKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
      e.preventDefault();
      if (!isExtensionContextValid()) return;
      var btn = document.getElementById("alivinted-quicksearch-btn");
      if (btn && !btn.disabled) {
        showTemporaryToast("⚡ Quick Search lancé (Alt+Shift+V)", 1500);
        runQuickSearch(btn);
      } else if (!btn) {
        showTemporaryToast("⚡ Charge la page produit AliExpress d’abord", 2000);
      }
    }
  });
  console.log("[ALIVINTED] Raccourci clavier Alt+Shift+V activé");
}

// ===============================
// INIT AVEC VÉRIFICATION DE CLÉ
// ===============================

function initAllFeatures() {
  injectDashboardButton();
  injectAnalyseButton();
  injectFavHeartButton();
  injectQuickSearchButton();
  autoAddToCart();
  initKeyboardShortcut();
}

hasValidLicense(function (ok) {
  if (ok) {
    console.log("[ALIVINTED] licence OK → initialisation des fonctionnalités");
    initAllFeatures();
    startUrlChangeWatcher();
  } else {
    console.log("[ALIVINTED] licence absente → extension verrouillée");
    showTemporaryToast(
      "Active ta clé AliEdge dans l’icône de l’extension pour débloquer le bot 🔑",
      2500
    );
    // Rien n’est injecté si pas de clé.
  }
});

// ===============================
// DÉTECTION CHANGEMENT DE PRODUIT (SPA / navigation AliExpress)
// ===============================
var _lastWatchedUrl = location.href;
var _urlWatcherObserver = null;

function startUrlChangeWatcher() {
  if (_urlWatcherObserver) return; // Déjà actif

  _urlWatcherObserver = new MutationObserver(function () {
    var currentUrl = location.href;
    if (currentUrl === _lastWatchedUrl) return;

    var wasProduct = _lastWatchedUrl.includes("/item/");
    _lastWatchedUrl = currentUrl;
    var isProduct = currentUrl.includes("/item/");

    if (!isProduct) return; // Ne s’active que sur les fiches produit

    // Si on arrive sur une nouvelle fiche produit, réinjecter les boutons et notifier
    setTimeout(function () {
      if (!isExtensionContextValid()) return;

      // Réinjecter les boutons si nécessaire (supprimés par navigation SPA)
      injectDashboardButton();
      injectAnalyseButton();
      injectFavHeartButton();
      injectQuickSearchButton();

      // Toast discret si c’était déjà un produit → nouveau produit
      if (wasProduct) {
        showTemporaryToast("⚡ Nouveau produit détecté — clique sur ⚡ pour analyser", 2500);
      }

      console.log("[ALIVINTED] Navigation SPA → nouveau produit détecté:", currentUrl);
    }, 1200); // Délai pour laisser la page se charger
  });

  // Observer les changements DOM (titre de page, body) pour détecter la navigation SPA
  _urlWatcherObserver.observe(document.body, { childList: true, subtree: false });
  // Observer aussi le titre qui change à chaque navigation
  var headObserver = new MutationObserver(function () {
    var currentUrl = location.href;
    if (currentUrl !== _lastWatchedUrl) {
      _urlWatcherObserver.takeRecords(); // Flush
      _urlWatcherObserver.disconnect();
      _urlWatcherObserver = null;
      startUrlChangeWatcher();
    }
  });
  if (document.head) {
    headObserver.observe(document.head, { childList: true, subtree: true });
  }

  console.log("[ALIVINTED] URL change watcher démarré");
}
