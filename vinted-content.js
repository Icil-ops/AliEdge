// ===============================
// vinted-content.js — v0.9 — Validation anti-feed + retry injection + CSRF push
// ===============================

console.log("[VINTED BOT] content script loaded v0.9");

// ─── CAPTURE ET PUSH DU CSRF VERS LE BACKGROUND ────────────────────────────
// Ce bloc s'exécute dès que la page Vinted est chargée.
// Le content script a accès au DOM complet (Next.js data, meta tags, scripts inline).
// Il extrait le CSRF et l'envoie au background qui ne peut pas le lire directement
// (cookies HttpOnly inaccessibles depuis fetch() du service worker).
(function pushCsrfToBackground() {
  try {
    var csrf = null;

    // 1. __NEXT_DATA__ (Next.js — source la plus fiable)
    try {
      var nd = window.__NEXT_DATA__;
      if (nd) {
        csrf = (nd.props && nd.props.pageProps && nd.props.pageProps.csrfToken)
            || (nd.props && nd.props.initialState && nd.props.initialState.config && nd.props.initialState.config.csrfToken)
            || (nd.props && nd.props.pageProps && nd.props.pageProps.config && nd.props.pageProps.config.csrfToken)
            || null;
        // Chercher récursivement dans initialState sérialisé
        if (!csrf && nd.props && nd.props.initialState) {
          var s = JSON.stringify(nd.props.initialState);
          var m = s.match(/"csrf_?[Tt]oken"\s*:\s*"([^"]{10,})"/);
          if (m) csrf = m[1];
        }
      }
    } catch(e) {}

    // 2. Meta tag (Rails classique)
    if (!csrf) {
      var meta = document.querySelector('meta[name="csrf-token"]');
      if (meta) csrf = meta.getAttribute('content');
    }

    // 3. Scan scripts inline
    if (!csrf) {
      var scripts = document.querySelectorAll('script');
      for (var i = 0; i < scripts.length; i++) {
        var txt = scripts[i].textContent || '';
        var m2 = txt.match(/"csrf_token"\s*:\s*"([^"]{10,})"/)
               || txt.match(/"CSRF_TOKEN"\s*:\s*"([^"]{10,})"/)
               || txt.match(/csrf[_-]?token["']\s*:\s*["']([^"']{10,})["']/i);
        if (m2) { csrf = m2[1]; break; }
      }
    }

    if (csrf) {
      console.log("[VINTED BOT] CSRF trouvé → push background:", csrf.slice(0, 12) + "...");
      chrome.runtime.sendMessage({ type: "VINTED_CSRF_READY", csrf: csrf, market: location.hostname.split('.').pop() });
    } else {
      console.log("[VINTED BOT] CSRF non trouvé dans le DOM");
    }
  } catch(e) {
    console.warn("[VINTED BOT] pushCsrfToBackground error:", e);
  }
})();

// ---- config ------------------------------------------------
var aliPrice = 0;
var AFTER_SEARCH_WAIT_MS   = 2500;  // délai après détection URL search
var IMAGE_INJECT_TIMEOUT   = 5000;  // délai max pour trouver l'input fichier
var SEARCH_URL_TIMEOUT     = 16000; // délai max pour que l'URL change vers search_by_image_uuid
var CARDS_WAIT_TIMEOUT     = 12000; // délai max pour que les cartes apparaissent
var MIN_IMAGES_TO_WAIT     = 3;
// ------------------------------------------------------------

var pendingImageDataUrl = null;

// ─── MESSAGE LISTENER ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  console.log("[VINTED BOT] onMessage:", msg && msg.type);
  try {
    if (msg && msg.type === "VINTED_IMAGE_SEARCH") {
      aliPrice = msg.aliPrice || 0;
      pendingImageDataUrl = msg.imageDataUrl || null;
      lancerRechercheImage(pendingImageDataUrl)
        .catch(e => console.error("[VINTED BOT] lancerRechercheImage error:", e));
      sendResponse({ ok: true });
      return true;
    }
  } catch (e) {
    console.error("[VINTED BOT] onMessage handler error:", e);
  }
  return true;
});

// ─── AUTO-SCRAPE si on arrive déjà sur une URL search_by_image_uuid ────────
(function monitorUrlForSearchByImage() {
  try {
    if (location.href.includes("search_by_image_uuid")) {
      console.log("[VINTED BOT] URL search_by_image_uuid détectée au chargement → auto-scrape");
      setTimeout(() => {
        autoScrapeWhenReady().catch(e => console.error("[VINTED BOT] autoScrapeWhenReady error:", e));
      }, 700);
    }

    let lastHref = location.href;
    const hrefObserver = new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        if (location.href.includes("search_by_image_uuid")) {
          console.log("[VINTED BOT] Navigation vers search_by_image_uuid détectée → auto-scrape");
          setTimeout(() => {
            autoScrapeWhenReady().catch(e => console.error("[VINTED BOT] autoScrapeWhenReady error:", e));
          }, 700);
        }
      }
    });
    hrefObserver.observe(document, { subtree: true, childList: true });
  } catch (e) {
    console.warn("[VINTED BOT] monitorUrlForSearchByImage error:", e);
  }
})();

// ─── HELPERS ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function isOnImageSearchPage() {
  return location.href.includes("search_by_image_uuid");
}

// Attend que l'URL inclue search_by_image_uuid (prouve que Vinted a bien traité l'image)
function waitForSearchUrl(timeout) {
  timeout = timeout || SEARCH_URL_TIMEOUT;
  return new Promise(function(resolve) {
    if (isOnImageSearchPage()) { resolve(true); return; }

    var settled = false;
    function finish(val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(pollId);
      try { observer.disconnect(); } catch(e) {}
      resolve(val);
    }

    var timer = setTimeout(function() { finish(false); }, timeout);

    // MutationObserver sur le document pour détecter changements d'URL
    var observer = new MutationObserver(function() {
      if (isOnImageSearchPage()) finish(true);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

    // Polling de secours (certains changements d'URL SPA échappent au MO)
    var pollId = setInterval(function() {
      if (isOnImageSearchPage()) finish(true);
    }, 400);
  });
}

// Attend que l'input[type="file"] soit disponible dans le DOM
function waitForFileInput(timeout) {
  timeout = timeout || IMAGE_INJECT_TIMEOUT;
  return new Promise(function(resolve) {
    var fi = document.querySelector('input[type="file"]');
    if (fi) { resolve(fi); return; }

    var settled = false;
    function finish(val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { observer.disconnect(); } catch(e) {}
      resolve(val);
    }

    var timer = setTimeout(function() { finish(null); }, timeout);
    var observer = new MutationObserver(function() {
      var el = document.querySelector('input[type="file"]');
      if (el) finish(el);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

// Attend que les cartes de résultats soient chargées (seulement APRÈS confirmation URL)
function waitForCardsAndImages(timeout, minImages) {
  timeout   = timeout   || CARDS_WAIT_TIMEOUT;
  minImages = minImages || MIN_IMAGES_TO_WAIT;

  return new Promise(function(resolve) {
    var cardsSelector = '[class*="feed-grid"] > div, [data-testid*="item"], a[href*="/items/"]';

    function getCards() { return Array.from(document.querySelectorAll(cardsSelector)); }

    function waitImgsLoaded(cards) {
      return new Promise(function(res) {
        var required = Math.min(Math.max(1, minImages), cards.length);
        var imgs = [];
        for (var i = 0; i < cards.length && imgs.length < required; i++) {
          var el = cards[i].querySelector && cards[i].querySelector('img');
          if (el) imgs.push(el);
        }
        if (!imgs.length) { res(); return; }
        var count = 0, done = false;
        function finish() { if (!done) { done = true; clearTimeout(imgTimer); res(); } }
        var imgTimer = setTimeout(finish, Math.min(timeout, 5000));
        imgs.forEach(function(img) {
          try {
            if (img.complete && img.naturalWidth > 10) { if (++count >= Math.min(required, imgs.length)) finish(); }
            else {
              img.addEventListener('load',  function() { if (++count >= Math.min(required, imgs.length)) finish(); }, { once: true });
              img.addEventListener('error', function() { if (++count >= Math.min(required, imgs.length)) finish(); }, { once: true });
            }
          } catch(e) { finish(); }
        });
      });
    }

    function checkCards() {
      var cards = getCards();
      if (cards.length > 0) {
        if (cardObserver) { try { cardObserver.disconnect(); } catch(e) {} }
        waitImgsLoaded(cards).then(resolve);
        return true;
      }
      return false;
    }

    var cardObserver = null;
    function startObserving() {
      if (checkCards()) return;
      var globalTimer = setTimeout(function() {
        if (cardObserver) { try { cardObserver.disconnect(); } catch(e) {} }
        resolve();
      }, timeout);
      cardObserver = new MutationObserver(function() {
        if (checkCards()) clearTimeout(globalTimer);
      });
      cardObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === "complete") startObserving();
    else {
      document.addEventListener('readystatechange', function() {
        if (document.readyState === 'complete') startObserving();
      }, { once: true });
      setTimeout(startObserving, 2000);
    }
  });
}

// ─── CONVERSION dataURL → Blob ──────────────────────────────────────────────
function dataUrlToBlob(dataUrl) {
  try {
    var parts = dataUrl.split(',');
    var mime  = parts[0].match(/:(.*?);/)[1];
    var bstr  = atob(parts[1]);
    var n = bstr.length;
    var u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  } catch (e) { return null; }
}

// ─── INJECTION DE L'IMAGE ──────────────────────────────────────────────────
async function injecterImageDansVinted(imageDataUrl) {
  var blob = dataUrlToBlob(imageDataUrl);
  if (!blob) { console.warn("[VINTED BOT] dataUrlToBlob failed"); return false; }

  // Méthode 1 : injecter directement dans input[type="file"]
  var fileInput = await waitForFileInput(IMAGE_INJECT_TIMEOUT);
  if (fileInput) {
    try {
      var f  = new File([blob], "recherche.png", { type: blob.type || "image/png" });
      var dt = new DataTransfer();
      dt.items.add(f);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('input',  { bubbles: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log("[VINTED BOT] Image injectée dans input[type=file] ✓");
      return true;
    } catch (e) {
      console.warn("[VINTED BOT] Injection input échouée:", e);
    }
  }

  // Méthode 2 : simuler un drag & drop sur la dropzone
  try {
    var dropZone = document.querySelector('[data-testid="image-search-dropzone"]')
                || document.querySelector('[data-testid*="dropzone"]')
                || document.querySelector('[class*="dropzone"]')
                || document.body;
    var f2  = new File([blob], "recherche.png", { type: blob.type || "image/png" });
    var dt2 = new DataTransfer();
    dt2.items.add(f2);
    var dropEvent;
    try {
      dropEvent = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 });
    } catch (e) {
      dropEvent = document.createEvent('Event');
      dropEvent.initEvent('drop', true, true);
      dropEvent.dataTransfer = dt2;
    }
    dropZone.dispatchEvent(dropEvent);
    console.log("[VINTED BOT] Image injectée par drag&drop ✓");
    return true;
  } catch (e) {
    console.warn("[VINTED BOT] Injection drag&drop échouée:", e);
    return false;
  }
}

// ─── FLOW PRINCIPAL ────────────────────────────────────────────────────────
async function lancerRechercheImage(imageDataUrl) {
  console.log("[VINTED BOT] lancerRechercheImage start — imageDataUrl:", !!imageDataUrl);

  if (!imageDataUrl) {
    console.warn("[VINTED BOT] Aucune imageDataUrl → abandon");
    sendSearchFailed("aucune image fournie");
    return;
  }

  try {
    // ── Étape 1 : trouver et cliquer le bouton caméra ──────────────────────
    var cameraBtn = findCameraButton();
    if (!cameraBtn) {
      console.error("[VINTED BOT] Bouton caméra introuvable");
      sendSearchFailed("bouton caméra introuvable");
      return;
    }
    cameraBtn.click();
    console.log("[VINTED BOT] Bouton caméra cliqué");
    await sleep(800);

    // ── Étape 2 : injecter l'image ─────────────────────────────────────────
    var injected = await injecterImageDansVinted(imageDataUrl);
    if (!injected) {
      console.warn("[VINTED BOT] Injection image échouée — retry avec bouton import");
      // Retry : chercher un bouton "Importer"
      var importBtn = findImportButton();
      if (importBtn) {
        importBtn.click();
        await sleep(700);
        injected = await injecterImageDansVinted(imageDataUrl);
      }
    }

    if (!injected) {
      console.error("[VINTED BOT] Injection image impossible après retries");
      sendSearchFailed("injection image impossible");
      return;
    }

    // ── Étape 3 : attendre que l'URL change vers search_by_image_uuid ──────
    // C'est LA validation clé — prouve que Vinted a bien traité l'image
    console.log("[VINTED BOT] En attente de search_by_image_uuid dans l'URL...");
    var searchUrlDetected = await waitForSearchUrl(SEARCH_URL_TIMEOUT);

    if (!searchUrlDetected) {
      console.warn("[VINTED BOT] Timeout : URL search_by_image_uuid non détectée → FEED probable");
      // Deuxième tentative : re-cliquer caméra + re-injecter
      console.log("[VINTED BOT] Deuxième tentative d'injection...");
      await sleep(500);
      var cameraBtn2 = findCameraButton();
      if (cameraBtn2) {
        cameraBtn2.click();
        await sleep(800);
        await injecterImageDansVinted(imageDataUrl);
        searchUrlDetected = await waitForSearchUrl(10000);
      }

      if (!searchUrlDetected) {
        console.error("[VINTED BOT] Recherche par image non confirmée → abandon");
        sendSearchFailed("URL search_by_image_uuid non détectée après 2 tentatives — feed ou erreur Vinted");
        return;
      }
    }

    console.log("[VINTED BOT] ✓ URL de recherche par image confirmée:", location.href);

    // ── Étape 4 : attendre le chargement des cartes ────────────────────────
    await sleep(AFTER_SEARCH_WAIT_MS);
    await waitForCardsAndImages(CARDS_WAIT_TIMEOUT, MIN_IMAGES_TO_WAIT);
    await sleep(300);

    // ── Étape 5 : scraper ET valider qu'on est bien sur la page de résultats
    scraperEtEnvoyer();

  } catch (e) {
    console.error("[VINTED BOT] lancerRechercheImage unexpected error:", e);
    sendSearchFailed("erreur inattendue: " + (e.message || String(e)));
  } finally {
    pendingImageDataUrl = null;
  }
}

// ─── AUTO-SCRAPE (URL déjà correcte au chargement) ─────────────────────────
async function autoScrapeWhenReady() {
  try {
    console.log("[VINTED BOT] autoScrapeWhenReady — URL valide confirmée");
    var start = Date.now();
    while (document.readyState !== "complete" && Date.now() - start < 5000) {
      await sleep(200);
    }
    await sleep(600);
    await waitForCardsAndImages(CARDS_WAIT_TIMEOUT, MIN_IMAGES_TO_WAIT);
    await sleep(300);
    scraperEtEnvoyer();
  } catch (e) {
    console.error("[VINTED BOT] autoScrapeWhenReady error:", e);
  }
}

// ─── VALIDATION + SCRAPING ─────────────────────────────────────────────────
function scraperEtEnvoyer() {
  try {
    // ❗ Validation critique : on doit absolument être sur une page de recherche par image
    if (!isOnImageSearchPage()) {
      console.error("[VINTED BOT] FEED DÉTECTÉ — URL:", location.href, "— ne contient pas search_by_image_uuid → abandon scraping");
      sendSearchFailed("feed détecté à la place des résultats — URL: " + location.href.slice(0, 100));
      return;
    }

    var results = scraperResultats();
    var stats   = results.stats || {};

    if (stats.count === 0) {
      console.warn("[VINTED BOT] 0 annonces scrapées malgré URL valide — possible erreur de sélecteurs");
      // On envoie quand même avec count=0 pour que le background sache
    }

    var avg        = stats.avgPrice || 0;
    var minP       = stats.minPrice || 0;
    // Détection outlier : si minP < 50% de la moyenne → pondérer
    var _ref = minP;
    if (avg > 0 && minP > 0 && minP < avg * 0.5) {
      _ref = minP * 0.25 + avg * 0.75;
    }
    var advisedSell = _ref > 0 ? parseFloat((_ref * 0.92).toFixed(2)) : null;
    var margin      = (advisedSell != null && aliPrice) ? parseFloat((advisedSell - aliPrice).toFixed(2)) : null;

    results.profitability = {
      aliBuyPrice:  Number(aliPrice || 0),
      avgPrice:     Number(avg || 0),
      advisedSell:  advisedSell != null ? Number(advisedSell) : null,
      margin:       margin != null ? Number(margin) : null,
      label:        margin != null ? (margin > 0.5 ? "Rentable" : margin > 0 ? "Faible" : "Non rentable") : "Indéterminé"
    };
    results.source = "fallback-scrape";

    console.log("[VINTED BOT] ✓ Résultats confirmés (search_by_image) :", stats);

    // Overlay visuel sur la page Vinted
    setTimeout(function() {
      try { if (typeof renderResultsOverlay === "function") renderResultsOverlay(results); } catch(e) {}
    }, 120);

    // Envoyer au background
    try {
      chrome.runtime.sendMessage({ type: "VINTED_IMAGE_RESULTS", data: results }, function(resp) {
        if (chrome.runtime.lastError) console.warn("[VINTED BOT] sendMessage error:", chrome.runtime.lastError);
        else console.log("[VINTED BOT] Résultats envoyés au background ✓");
      });
    } catch (e) {
      console.warn("[VINTED BOT] sendMessage error:", e);
    }
  } catch (e) {
    console.error("[VINTED BOT] scraperEtEnvoyer error:", e);
  }
}

// ─── SCRAPER DOM ───────────────────────────────────────────────────────────
function scraperResultats() {
  try {
    var items = [];
    var selectors = [
      '[class*="feed-grid"] > div',
      '[data-testid*="item-box"]',
      '[data-testid*="item"]',
      'a[href*="/items/"]',
      '.catalog-grid a[href*="/items/"]'
    ];
    var nodes = [];
    selectors.forEach(function(sel) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function(n) {
          if (n && nodes.indexOf(n) === -1) nodes.push(n);
        });
      } catch(e) {}
    });

    var seenUrls = new Set();
    console.log("[VINTED BOT] Nœuds candidats:", nodes.length);

    for (var i = 0; i < nodes.length && items.length < 20; i++) {
      var card = nodes[i];
      if (!card) continue;

      var text       = (card.textContent || "").trim();
      var priceMatch = text.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s*€/);
      var price      = null;
      if (priceMatch) price = parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."));

      // Image
      var imgEl = null;
      try { imgEl = card.querySelector('img') || card.querySelector('source'); } catch(e) {}
      var image = null;
      if (imgEl) {
        try {
          image = imgEl.currentSrc || imgEl.src
               || imgEl.getAttribute('data-src')
               || imgEl.getAttribute('data-original') || null;
          if (!image && imgEl.getAttribute && imgEl.getAttribute('srcset')) {
            image = imgEl.getAttribute('srcset').split(',')[0].trim().split(' ')[0] || null;
          }
        } catch(e) {}
      }

      // URL
      var url = "#";
      if (card.href) url = card.href;
      else {
        var a = (card.closest && card.closest('a')) || (card.querySelector && card.querySelector('a'));
        if (a && a.href) url = a.href;
      }
      if (url && url !== "#" && seenUrls.has(url)) continue;
      if (url && url !== "#") seenUrls.add(url);

      // Titre
      var title = "";
      try {
        var tEl = card.querySelector('[data-testid*="title"], .item-title, .title, h3, h4');
        if (tEl && tEl.innerText) title = tEl.innerText.trim();
      } catch(e) {}
      if (!title) title = (text.split("\n")[0] || "").slice(0, 80).trim();

      if (price && price > 0 && price < 10000) {
        items.push({ title: title || "Annonce Vinted", price: price, image: image, url: url });
      }
    }

    console.log("[VINTED BOT] Items scrapés:", items.length);

    var prices = items.map(function(it) { return it.price; }).filter(Boolean);
    var stats  = {
      count:    items.length,
      minPrice: prices.length ? Math.min.apply(null, prices) : 0,
      maxPrice: prices.length ? Math.max.apply(null, prices) : 0,
      avgPrice: prices.length ? prices.reduce(function(a,b){return a+b;},0) / prices.length : 0
    };
    console.log("[VINTED BOT] Stats:", stats);
    return { stats: stats, inspirations: items };
  } catch (e) {
    console.error("[VINTED BOT] scraperResultats error:", e);
    return { stats: { count:0, minPrice:0, maxPrice:0, avgPrice:0 }, inspirations: [] };
  }
}

// ─── HELPER : signaler un échec au background ───────────────────────────────
function sendSearchFailed(reason) {
  try {
    chrome.runtime.sendMessage({ type: "VINTED_SEARCH_FAILED", reason: reason || "inconnu" }, function() {
      void chrome.runtime.lastError;
    });
  } catch (e) {}
  console.warn("[VINTED BOT] SEARCH_FAILED envoyé — raison:", reason);
}

// ─── HELPER : trouver le bouton caméra ─────────────────────────────────────
function findCameraButton() {
  try {
    // 1. data-testid ciblé
    var btn = document.querySelector('[data-testid="search-bar-photo-button"]')
           || document.querySelector('[data-testid*="photo-search"]')
           || document.querySelector('button[aria-label*="photo"]')
           || document.querySelector('button[aria-label*="image"]')
           || document.querySelector('button[aria-label*="camera"]');
    if (btn) return btn;

    // 2. Heuristique : bouton avec SVG proche de la barre de recherche
    var btns = document.querySelectorAll('button');
    var searchBar = document.querySelector('input[type="search"], input[placeholder*="Rechercher"], input[placeholder*="Search"]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b.querySelector('svg')) continue;
      var rect = b.getBoundingClientRect();
      if (rect.width < 20 || rect.width > 70) continue;
      if (searchBar) {
        var sRect = searchBar.getBoundingClientRect();
        if (Math.abs(rect.top - sRect.top) < 60) return b;
      }
    }
    return null;
  } catch (e) { return null; }
}

// ─── HELPER : trouver le bouton "Importer une photo" ───────────────────────
function findImportButton() {
  try {
    var btn = document.querySelector('[data-testid*="image-search-upload-button"]')
           || document.querySelector('button[aria-label*="Importer"]')
           || document.querySelector('button[title*="Importer"]');
    if (btn) return btn;
    var btns = Array.from(document.querySelectorAll('button'));
    return btns.find(function(b) {
      var t = (b.textContent || '').trim().toLowerCase();
      return t.includes('importer') || t.includes('import a photo') || t.includes('import photo') || t.includes('télécharger');
    }) || null;
  } catch (e) { return null; }
}

// ─── OVERLAY VISUEL SUR LA PAGE VINTED ─────────────────────────────────────
function renderResultsOverlay(data) {
  try {
    var prev = document.getElementById('alivinted-vinted-results-overlay');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = 'alivinted-vinted-results-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', left: '12px', bottom: '12px', width: '380px', maxHeight: '65vh',
      overflowY: 'auto', zIndex: '99999999',
      background: '#0C0618',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: '10px',
      boxShadow: '0 10px 40px rgba(107,33,232,0.35)',
      padding: '14px',
      fontFamily: "'Space Mono', monospace, sans-serif",
      color: '#F0ECFF',
    });

    var closeBtn = document.createElement('button');
    closeBtn.innerText = '✕';
    Object.assign(closeBtn.style, {
      position: 'absolute', right: '8px', top: '6px', border: 'none',
      background: 'none', fontSize: '12px', cursor: 'pointer', color: '#7A7090',
    });
    closeBtn.onclick = function() { overlay.remove(); };
    overlay.appendChild(closeBtn);

    var title = document.createElement('div');
    title.innerText = '✅ Résultats — Recherche par image';
    Object.assign(title.style, {
      fontWeight: '700', marginBottom: '8px', fontSize: '11px',
      letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8B5CF6',
    });
    overlay.appendChild(title);

    var stats   = data.stats || {};
    var prof    = data.profitability || {};
    var statusEl = document.createElement('div');
    statusEl.style.fontSize = '10px';
    statusEl.style.marginBottom = '8px';
    statusEl.style.color = '#7A7090';
    statusEl.innerText = stats.count + ' annonces · Moy : ' + (stats.avgPrice ? stats.avgPrice.toFixed(2) : '—') + ' €';
    overlay.appendChild(statusEl);

    var statsBox = document.createElement('div');
    statsBox.style.fontSize = '11px';
    statsBox.style.marginBottom = '10px';
    statsBox.style.lineHeight = '1.7';
    var marginColor = prof.margin != null ? (prof.margin > 0.5 ? '#4caf7d' : prof.margin > 0 ? '#d4874a' : '#C0392B') : '#7A7090';
    statsBox.innerHTML = '<span style="color:#7A7090">Fourchette : </span>' + (stats.minPrice ? stats.minPrice.toFixed(2) : '—') + ' – ' + (stats.maxPrice ? stats.maxPrice.toFixed(2) : '—') + ' €<br/>'
      + '<span style="color:#7A7090">Prix conseillé : </span><b style="color:#F0ECFF">' + (prof.advisedSell != null ? prof.advisedSell + ' €' : '—') + '</b>'
      + ' · <span style="color:#7A7090">Marge : </span><b style="color:' + marginColor + '">' + (prof.margin != null ? (prof.margin >= 0 ? '+' : '') + prof.margin + ' €' : '—') + '</b>'
      + ' · <span style="color:' + marginColor + '">' + (prof.label || '') + '</span>';
    overlay.appendChild(statsBox);

    var insp     = data.inspirations || [];
    var inspWrap = document.createElement('div');
    Object.assign(inspWrap.style, { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' });

    if (insp.length === 0) {
      var none = document.createElement('div');
      none.style.fontSize = '10px'; none.style.color = '#7A7090';
      none.innerText = 'Aucune inspiration.';
      inspWrap.appendChild(none);
    } else {
      insp.slice(0, 4).forEach(function(item) {
        var card = document.createElement('a');
        card.href = item.url || '#'; card.target = '_blank';
        Object.assign(card.style, {
          width: '84px', textDecoration: 'none', color: 'inherit', display: 'block',
          background: '#130D22', border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: '6px', overflow: 'hidden', transition: 'border-color 0.15s',
        });
        card.onmouseenter = function() { card.style.borderColor = 'rgba(139,92,246,0.5)'; };
        card.onmouseleave = function() { card.style.borderColor = 'rgba(139,92,246,0.2)'; };
        var img = document.createElement('img'); img.src = item.image || '';
        Object.assign(img.style, { width: '84px', height: '70px', objectFit: 'cover', background: '#1A1230', display: 'block' });
        card.appendChild(img);
        var p = document.createElement('div'); p.innerText = item.price ? (item.price + ' €') : '';
        Object.assign(p.style, { fontSize: '11px', color: '#4caf7d', padding: '4px 6px', fontFamily: "'Space Mono', monospace" });
        card.appendChild(p);
        inspWrap.appendChild(card);
      });
    }
    overlay.appendChild(inspWrap);

    var actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '8px', marginTop: '4px' });

    var btnOpen = document.createElement('button');
    btnOpen.innerText = '📊 Résultats complets';
    Object.assign(btnOpen.style, {
      padding: '7px 12px', flex: '1',
      background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
      color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
      fontSize: '10px', letterSpacing: '0.5px', fontFamily: "'Space Mono', monospace",
    });
    btnOpen.onclick = function() {
      try { chrome.runtime.sendMessage({ type: 'OPEN_RESULTS_PAGE' }, function(){}); } catch(e) {}
    };

    var btnClose = document.createElement('button');
    btnClose.innerText = '✕';
    Object.assign(btnClose.style, {
      padding: '7px 10px', background: 'transparent',
      color: '#7A7090', border: '1px solid rgba(139,92,246,0.2)',
      borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
    });
    btnClose.onclick = function() { overlay.remove(); };

    actions.appendChild(btnOpen);
    actions.appendChild(btnClose);
    overlay.appendChild(actions);

    document.body.appendChild(overlay);
  } catch (e) {
    console.error('[VINTED BOT] renderResultsOverlay error:', e);
  }
}
