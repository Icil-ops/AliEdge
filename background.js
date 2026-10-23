// background.js — v1.0
// Features: notifications, historique, score, frais Vinted réels, market selector, analyse approfondie,
//           cache 24h, multi-marché parallèle, filtre état Vinted, watchlist produits

// ─── LICENCE ───────────────────────────────────────────────────────────────
function hasValidLicense(cb) {
  try {
    chrome.storage.local.get(["ae_license_key"], (res) => {
      const key = (res && res.ae_license_key) ? String(res.ae_license_key).trim() : "";
      cb(/^AE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key));
    });
  } catch (e) {
    console.warn("[BG] hasValidLicense error:", e);
    cb(false);
  }
}

// ─── DEBUG LOG (circulaire, max 400 entrées, exportable via GET_DEBUG_LOGS) ──
const _debugLog = [];
const _MAX_LOG  = 400;
function dbg(level, ...args) {
  const msg = args.map(a => {
    try { return (a !== null && typeof a === "object") ? JSON.stringify(a) : String(a); }
    catch(e) { return "[objet non-sérialisable]"; }
  }).join(" ");
  _debugLog.push({ ts: new Date().toISOString(), level, msg });
  if (_debugLog.length > _MAX_LOG) _debugLog.shift();
  if (level === "warn" || level === "error") console.warn("[BG]", msg);
  else console.log("[BG]", msg);
}

// ─── STATE ─────────────────────────────────────────────────────────────────
let lastVintedResults   = null;
let resultsTabId        = null;
let pendingImageDataUrl = null;
let lastAliBuyPrice     = null;
let lastAliTitle        = null;
let lastSearchImageUrl  = null;

// ─── CSRF CACHE (poussé par vinted-content.js depuis les pages Vinted) ──────
// Quand l'utilisateur a un onglet Vinted ouvert, le content script envoie le CSRF
// dès le chargement de la page. On le cache ici pour l'utiliser immédiatement.
const _liveCsrfCache = {}; // market → { csrf, ts }
const LIVE_CSRF_TTL  = 30 * 60 * 1000; // 30 minutes

function getLiveCsrf(market) {
  const mkt = market || "fr";
  const cached = _liveCsrfCache[mkt];
  if (cached && cached.csrf && (Date.now() - cached.ts) < LIVE_CSRF_TTL) {
    console.log("[BG] CSRF live cache hit, market:", mkt, cached.csrf.slice(0, 10) + "...");
    return cached.csrf;
  }
  return null;
}
function setLiveCsrf(market, csrf) {
  if (!market || !csrf) return;
  _liveCsrfCache[market] = { csrf, ts: Date.now() };
  console.log("[BG] CSRF live mis en cache, market:", market, csrf.slice(0, 10) + "...");
}

// ─── RÉSULTATS CACHE 24H (Feature 1) ────────────────────────────────────────
const _resultsCache = new Map(); // key: imageHash_market_condition → { results, ts }
const RESULTS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures

function _hashImageData(dataUrl) {
  // FNV-1a hash sur un échantillon de l'image (2000 chars) → suffisant pour identifier une image unique
  let h = 0x811c9dc5;
  const sample = (dataUrl || "").slice(22, 2200); // skip "data:image/xxx;base64,"
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h.toString(16);
}

function getCachedResults(dataUrl, market, condition) {
  if (!dataUrl) return null;
  const key = _hashImageData(dataUrl) + '_' + (market || 'fr') + '_' + (condition || 'all');
  const cached = _resultsCache.get(key);
  if (cached && (Date.now() - cached.ts) < RESULTS_CACHE_TTL) {
    console.log('[BG] Cache hit ✅ — résultats en cache (24h)');
    return cached.results;
  }
  return null;
}

function setCachedResults(dataUrl, market, condition, results) {
  if (!dataUrl || !results) return;
  const key = _hashImageData(dataUrl) + '_' + (market || 'fr') + '_' + (condition || 'all');
  _resultsCache.set(key, { results, ts: Date.now() });
  // Cleanup: garder max 50 entrées
  if (_resultsCache.size > 50) {
    const oldestKey = _resultsCache.keys().next().value;
    _resultsCache.delete(oldestKey);
  }
}

// ─── WATCHLIST (Feature 6) — Alarm toutes les 12h ───────────────────────────
try {
  chrome.alarms.create('ae-watchlist', { periodInMinutes: 720 }); // 12h
} catch (e) { /* alarms API can fail if not supported */ }

// Feature 7 (new) : Session Vinted persistante — refresh cookies toutes les 20 min
try {
  chrome.alarms.create('vinted-session-refresh', { periodInMinutes: 20 });
} catch (e) { /* alarms API can fail if not supported */ }

// ─── SIDE PANEL (Feature 1) ──────────────────────────────────────────────────
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// ─── CONTEXT MENU (Feature 2) ───────────────────────────────────────────────
try {
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: "aliedge-search-image",
      title: "📊 Chercher sur Vinted (AliEdge)",
      contexts: ["image"],
    });
    chrome.contextMenus.create({
      id: "aliedge-search-link",
      title: "📊 Chercher cette image sur Vinted",
      contexts: ["link"],
    });
  });
} catch(e) { dbg("warn", "contextMenus create error:", e.message); }

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const imageUrl = info.srcUrl || info.linkUrl || null;
  if (!imageUrl || !imageUrl.startsWith("http")) return;
  dbg("info", "Context menu: chercher image:", imageUrl.slice(0, 80));
  safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 1, message: "Récupération de l'image..." });
  try {
    const dataUrl = await fetchImageAsDataUrl(imageUrl);
    pendingImageDataUrl = dataUrl;
    lastSearchImageUrl = imageUrl;
    openOrEnsureResultsPage(true, () => {}, true);
    setTimeout(() => {
      _searchRequestId++;
      const myReqId = _searchRequestId;
      const market = "fr";
      const condition = "all";
      const aliPrice = lastAliBuyPrice || 0;
      safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 2, message: "Recherche sur Vinted..." });
      const searchPromise = searchVintedDirect(pendingImageDataUrl, aliPrice, market, condition, 3);
      searchPromise.then(async results => {
        if (myReqId !== _searchRequestId) return;
        const enriched = await runDeepAnalysis(results, market);
        broadcastResults(enriched);
      }).catch(async err => {
        dbg("warn", "Context menu search failed:", err.message);
        safeRuntimeSend({ type: "VINTED_STATUS", status: "fallback", message: "Ouverture Vinted..." });
        searchVintedViaTab(pendingImageDataUrl, aliPrice, market, true);
      });
    }, 1500);
  } catch(e) {
    dbg("warn", "Context menu fetchImage error:", e.message);
    safeRuntimeSend({ type: "VINTED_STATUS", status: "error", message: "Impossible de récupérer l'image." });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ae-watchlist') {
    console.log('[BG] Watchlist alarm triggered → vérification des produits surveillés');
    await checkWatchlist();
  }
  if (alarm.name === 'vinted-session-refresh') {
    dbg('info', '[BG] Vinted session refresh alarm → silent fetch to keep cookies alive');
    // Vérifier si un onglet Vinted est déjà ouvert — si oui, fetch silencieux suffit
    const markets = ['fr', 'be'];
    for (const mkt of markets) {
      try {
        const tabs = await new Promise(resolve => {
          chrome.tabs.query({ url: `https://www.vinted.${mkt}/*` }, t => { void chrome.runtime.lastError; resolve(t || []); });
        });
        if (tabs.length > 0) {
          // Onglet Vinted ouvert → fetch silencieux pour rafraîchir les cookies
          fetch(`https://www.vinted.${mkt}/`, { credentials: 'include', method: 'HEAD' })
            .then(() => dbg('info', '[BG] Session refresh OK for', mkt))
            .catch(() => {});
        }
      } catch(e) { /* non bloquant */ }
    }
  }
});

async function checkWatchlist() {
  try {
    const res = await chrome.storage.local.get('ae_watchlist');
    void chrome.runtime.lastError;
    const watchlist = Array.isArray(res.ae_watchlist) ? res.ae_watchlist : [];
    if (!watchlist.length) return;

    for (const item of watchlist) {
      if (!item.imageDataUrl) continue;
      try {
        const results = await searchVintedDirect(item.imageDataUrl, item.aliPrice, item.market || 'fr');
        const newAdvisedSell = results?.profitability?.advisedSell;
        const oldAdvisedSell = item.lastAdvisedSell;

        if (newAdvisedSell && oldAdvisedSell && Math.abs(newAdvisedSell - oldAdvisedSell) > 1) {
          const diff = newAdvisedSell > oldAdvisedSell ? '📈' : '📉';
          chrome.notifications.create('ae-wl-' + item.id, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icon.png'),
            title: 'AliEdge — Marché Vinted évolué',
            message: `${diff} ${(item.title || 'Produit').slice(0,40)}: ${oldAdvisedSell}€ → ${newAdvisedSell}€`
          }, () => { void chrome.runtime.lastError; });
        }

        item.lastAdvisedSell = newAdvisedSell || item.lastAdvisedSell;
        item.lastChecked = Date.now();
      } catch (e) {
        console.warn('[BG] Watchlist check error for item', item.id, e.message);
      }
    }

    chrome.storage.local.set({ ae_watchlist: watchlist }, () => { void chrome.runtime.lastError; });
  } catch (e) {
    console.warn('[BG] checkWatchlist error:', e);
  }
}

// ─── CSRF CACHE ─────────────────────────────────────────────────────────────
const _csrfCache = {}; // { market: { token, anonId, ts } }
const CSRF_CACHE_TTL = 9 * 60 * 1000; // 9 minutes

function invalidateCsrfCache(market) {
  delete _csrfCache[market || "fr"];
  console.log("[BG] CSRF cache invalidé pour market:", market || "fr");
}

// ─── UTILITAIRES ────────────────────────────────────────────────────────────
function isValidImageUrl(u) {
  if (!u || typeof u !== "string") return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (e) { return false; }
}

// Protège contre les recherches concurrentes : seule la dernière est diffusée
let _searchRequestId = 0;

// ─── SCORE DE RENTABILITÉ (Feature 3) ──────────────────────────────────────
function computeScore(stats, margin, aliPrice) {
  let score = 0;
  const marginPct = aliPrice > 0 ? (margin / aliPrice) * 100 : 0;
  if (marginPct > 200) score += 4;
  else if (marginPct > 100) score += 3;
  else if (marginPct > 30) score += 2;
  else if (marginPct > 0) score += 1;

  const count = stats.count || 0;
  if (count > 30) score += 3;
  else if (count > 15) score += 2;
  else if (count > 5) score += 1;

  if (stats.avgPrice > 0) {
    const spread = (stats.maxPrice - stats.minPrice) / stats.avgPrice;
    if (spread < 0.3) score += 3;
    else if (spread < 0.6) score += 2;
    else if (spread < 1.0) score += 1;
  }
  return Math.min(10, score);
}

// ─── HISTORIQUE (Feature 2) ─────────────────────────────────────────────────
function saveToHistory(results) {
  try {
    const prof = results.profitability || {};
    const stats = results.stats || {};

    // Toujours recalculer à partir de lastAliBuyPrice (valeur la plus fraîche)
    // prof.margin peut être null si aliPrice=0 lors de la normalisation
    const advisedSell = typeof prof.advisedSell === "number" ? prof.advisedSell : 0;
    const aliPrice = (lastAliBuyPrice != null && lastAliBuyPrice > 0)
      ? lastAliBuyPrice
      : (typeof prof.aliBuyPrice === "number" && prof.aliBuyPrice > 0 ? prof.aliBuyPrice : 0);
    const margin = advisedSell > 0 && aliPrice > 0
      ? parseFloat((advisedSell - aliPrice).toFixed(2))
      : (typeof prof.margin === "number" ? prof.margin : 0);
    const score = computeScore(stats, margin, aliPrice);
    console.log("[BG] saveToHistory → aliPrice:", aliPrice, "advisedSell:", advisedSell, "margin:", margin);

    const item = {
      id: Date.now(),
      ts: Date.now(),
      date: new Date().toLocaleDateString("fr-FR"),
      title: lastAliTitle || "Produit sans titre",
      aliPrice: aliPrice,
      stats: stats,
      advisedSell: prof.advisedSell || 0,
      vintedAvg: (stats && typeof stats.avgPrice === "number") ? parseFloat(stats.avgPrice.toFixed(2)) : null,
      market: prof.market || "fr",
      margin: margin,
      score: score,
      imageUrl: lastSearchImageUrl || ""
    };

    chrome.storage.local.get(["ae_history"], (res) => {
      void chrome.runtime.lastError;
      let history = [];
      if (res && Array.isArray(res.ae_history)) history = res.ae_history;
      history.unshift(item);
      if (history.length > 20) history = history.slice(0, 20);
      chrome.storage.local.set({ ae_history: history }, () => {
        void chrome.runtime.lastError;
        console.log("[BG] Historique mis à jour:", history.length, "items");
      });
    });
  } catch (e) {
    console.warn("[BG] saveToHistory error:", e);
  }
}

// ─── NOTIFICATION (Feature 1) ───────────────────────────────────────────────
function sendNotification(results) {
  try {
    const prof  = results.profitability || {};
    const stats = results.stats || {};
    const count = stats.count || 0;
    if (count === 0) return; // Pas de notification si 0 résultats

    // Récupérer le prix d'achat — depuis profitability OU lastAliBuyPrice (fallback)
    const aliPrice = (prof.aliBuyPrice > 0 ? prof.aliBuyPrice : null)
                  ?? (lastAliBuyPrice > 0 ? lastAliBuyPrice : null)
                  ?? 0;

    // Recalculer la marge depuis advisedSell si prof.margin est null/0
    let margin = (typeof prof.margin === "number" && prof.margin !== 0) ? prof.margin : null;
    if (margin === null && prof.advisedSell > 0 && aliPrice > 0) {
      margin = parseFloat((prof.advisedSell - aliPrice).toFixed(2));
    }
    if (margin === null && stats.avgPrice > 0 && aliPrice > 0) {
      margin = parseFloat(((stats.avgPrice * 0.92) - aliPrice).toFixed(2));
    }

    const score = prof.score ?? computeScore(stats, margin ?? 0, aliPrice);
    const label = prof.label
      ?? (margin === null ? "Prix manquant" : margin > 0.5 ? "Rentable" : margin > 0 ? "Faible" : "Non rentable");

    const margeStr = margin !== null
      ? `Marge: ${margin >= 0 ? "+" : ""}${margin.toFixed(2)}€`
      : `Moy. Vinted: ${(stats.avgPrice || 0).toFixed(2)}€`;

    const avgStr = stats.avgPrice > 0 ? ` · Moy. ${stats.avgPrice.toFixed(0)}€` : "";

    chrome.notifications.create("ae-result-" + Date.now(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon128.png"),
      title: "AliEdge — Analyse terminée",
      message: `${count} annonces${avgStr} · ${margeStr} · ${label} · Score: ${score}/10`
    }, () => { void chrome.runtime.lastError; });
  } catch (e) {
    console.warn("[BG] sendNotification error:", e);
  }
}

// ─── ANALYSE APPROFONDIE (Feature 7) ────────────────────────────────────────
async function fetchVintedItemDetails(itemId, market) {
  const mkt = market || "fr";
  try {
    const resp = await fetch(`https://www.vinted.${mkt}/api/v2/items/${itemId}`, {
      credentials: "include",
      headers: { "Accept": "application/json" }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const it = data.item || data;
    const viewCount = it.view_count || 0;
    const favCount = it.favourite_count || 0;
    const createdAt = it.created_at || null;

    let ageDays = null;
    let viewsPerDay = null;
    if (createdAt) {
      const created = new Date(createdAt);
      const now = new Date();
      ageDays = Math.max(1, Math.round((now - created) / (1000 * 60 * 60 * 24)));
      viewsPerDay = parseFloat((viewCount / ageDays).toFixed(1));
    }

    return { viewCount, favCount, ageDays, viewsPerDay };
  } catch (e) {
    console.warn("[BG] fetchVintedItemDetails error for", itemId, e.message);
    return null;
  }
}

async function runDeepAnalysis(results, market) {
  try {
    const inspirations = Array.isArray(results.inspirations) ? results.inspirations : [];
    if (inspirations.length === 0) return results;

    // Analyser top 5 si rentable, sinon top 3 (toujours utile pour stats marché)
    const prof = results.profitability || {};
    const margin = typeof prof.margin === "number" ? prof.margin : -999;
    const limit = margin > 0.5 ? 5 : 3;
    const top5 = inspirations.slice(0, limit);

    const enriched = await Promise.all(top5.map(async (it) => {
      const urlStr = it.url || "";
      const match = urlStr.match(/\/items\/(\d+)/);
      if (!match) return it;
      const itemId = match[1];
      const details = await fetchVintedItemDetails(itemId, market);
      if (!details) return it;
      return { ...it, deepData: details };
    }));

    // Remplacement des 5 premiers avec données enrichies
    const updatedInspirations = [
      ...enriched,
      ...inspirations.slice(5)
    ];

    // Calcul agrégat marché
    const withData = enriched.filter(it => it.deepData);
    let marketAnalysis = null;
    if (withData.length > 0) {
      const avgViewsPerDay = parseFloat((withData.reduce((s, it) => s + (it.deepData.viewsPerDay || 0), 0) / withData.length).toFixed(1));
      const avgFavs = parseFloat((withData.reduce((s, it) => s + (it.deepData.favCount || 0), 0) / withData.length).toFixed(1));
      const avgAge = parseFloat((withData.reduce((s, it) => s + (it.deepData.ageDays || 0), 0) / withData.length).toFixed(0));
      const marketActive = avgViewsPerDay >= 3;
      marketAnalysis = { avgViewsPerDay, avgFavs, avgAge, marketActive };
    }

    return { ...results, inspirations: updatedInspirations, marketAnalysis };
  } catch (e) {
    console.warn("[BG] runDeepAnalysis error:", e);
    return results;
  }
}

// ─── MESSAGES ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) { sendResponse({ ok: false, error: "no-msg-or-type" }); return true; }

  if (msg.type === "CHECK_LICENSE_STATUS") {
    hasValidLicense((ok) => sendResponse({ ok, activated: ok }));
    return true;
  }

  const protectedTypes = new Set([
    "UPLOAD_IMAGE_FOR_VINTED", "OPEN_POPUP", "OPEN_RESULTS_PAGE",
    "SEARCH_VINTED_BY_IMAGE", "VINTED_IMAGE_RESULTS",
    "GET_LAST_VINTED_RESULTS", "FETCH_IMAGE"
  ]);

  if (protectedTypes.has(msg.type)) {
    hasValidLicense((ok) => {
      if (!ok) { sendResponse({ ok: false, error: "license_required" }); return; }
      handleMessage(msg, sender, sendResponse);
    });
    return true;
  }

  handleMessage(msg, sender, sendResponse);
  return true;
});

function handleMessage(msg, sender, sendResponse) {
  const fromContentScript = !!(sender && sender.tab); // Quick Search ⚡ depuis AliExpress

  // ── CSRF poussé par vinted-content.js (onglet Vinted ouvert) ──────────────
  // Stocké immédiatement dans _liveCsrfCache pour les prochaines recherches
  if (msg.type === "VINTED_CSRF_READY") {
    if (msg.csrf && msg.market) setLiveCsrf(msg.market, msg.csrf);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_ALI_INFO") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
      void chrome.runtime.lastError;
      if (!tabs || !tabs.length) { sendResponse({ ok: false }); return; }
      const tab = tabs[0];
      const url = tab.url || "";
      const isAli  = url.includes("aliexpress.com") || url.includes("aliexpress.fr");
      const isTemu = url.includes("temu.com");
      if (!url.startsWith("http") || (!isAli && !isTemu)) {
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "GET_ALI" }, function (res) {
        void chrome.runtime.lastError;
        sendResponse(res && res.ok ? res : { ok: false });
      });
    });
    return true;
  }

  if (msg.type === "UPLOAD_IMAGE_FOR_VINTED") {
    pendingImageDataUrl = msg.dataUrl || null;
    lastSearchImageUrl  = msg.imageUrl || null;
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "OPEN_POPUP") {
    if (chrome.action && chrome.action.openPopup) chrome.action.openPopup().catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "OPEN_RESULTS_PAGE") {
    openOrEnsureResultsPage(false, () => {});
    sendResponse({ ok: true });
    return;
  }

  // ── RECHERCHE PRINCIPALE ──────────────────────────────────────────────────
  if (msg.type === "SEARCH_VINTED_BY_IMAGE") {
    const aliPrice = typeof msg.aliPrice === "number" ? msg.aliPrice
                   : msg.aliPrice ? Number(msg.aliPrice) : null;
    lastAliBuyPrice = aliPrice;
    if (msg.aliTitle) lastAliTitle = msg.aliTitle;
    const market = msg.market || "fr";
    const condition = msg.condition || "all";
    const multiMarket = msg.multiMarket === true; // Feature 5 : multi-marché simultané
    // Feature 1 (new): frais envoi vendeur passés depuis popup
    const vintedShippingFee = typeof msg.vintedShipping === 'number' ? msg.vintedShipping : 3;

    // Protège contre les recherches concurrentes (seule la dernière est diffusée)
    const myReqId = ++_searchRequestId;

    // Si Quick Search depuis content script → ouvrir la page résultats en actif
    openOrEnsureResultsPage(fromContentScript, () => {}, fromContentScript);
    sendResponse({ ok: true });

    // Feature 1 : Vérifier le cache 24h avant de relancer une recherche
    if (pendingImageDataUrl) {
      const cacheKey = multiMarket ? (market + '+be') : market;
      const cached = getCachedResults(pendingImageDataUrl, cacheKey, condition);
      if (cached) {
        safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 3, message: "Résultats en cache ⚡" });
        setTimeout(() => {
          if (myReqId !== _searchRequestId) return;
          broadcastResults(cached);
        }, 300);
        return;
      }
    }

    safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 1, message: "Connexion Vinted..." });

    // Feature 5 : multi-marché simultané
    const searchPromise = multiMarket
      ? searchVintedMultiMarket(pendingImageDataUrl, aliPrice, [market, market === 'fr' ? 'be' : 'fr'], condition, vintedShippingFee)
      : searchVintedDirect(pendingImageDataUrl, aliPrice, market, condition, vintedShippingFee);

    searchPromise
      .then(async results => {
        if (myReqId !== _searchRequestId) { dbg("info", "Résultats obsolètes ignorés (reqId:", myReqId, ")"); return; }
        dbg("info", "✅ Recherche directe réussie :", JSON.stringify(results.stats));
        if (pendingImageDataUrl) {
          const cacheKey = multiMarket ? (market + '+be') : market;
          setCachedResults(pendingImageDataUrl, cacheKey, condition, results);
        }
        safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 3, message: "Analyse approfondie..." });
        const enriched = await runDeepAnalysis(results, market);
        if (myReqId !== _searchRequestId) { dbg("info", "Deep analysis obsolète ignorée"); return; }
        broadcastResults(enriched);
      })
      .catch(async err => {
        if (myReqId !== _searchRequestId) return;
        dbg("warn", "❌ Recherche directe échouée :", err.message);
        // ── Fallback : onglet Vinted ACTIF ──────────────────────────────────
        // La recherche par image Vinted est la seule méthode fiable.
        // Bing reste disponible via bouton manuel dans la page résultats.
        dbg("info", "→ Fallback : onglet Vinted actif");
        safeRuntimeSend({ type: "VINTED_STATUS", status: "fallback", message: "Ouverture Vinted — recherche image en cours..." });
        searchVintedViaTab(pendingImageDataUrl, aliPrice, market, true, vintedShippingFee);
      });

    return;
  }

  // ── WATCHLIST ─────────────────────────────────────────────────────────────
  if (msg.type === "ADD_TO_WATCHLIST") {
    const item = {
      id: Date.now(),
      title: msg.title || "Produit",
      aliPrice: msg.aliPrice || 0,
      imageDataUrl: msg.imageDataUrl || null,
      market: msg.market || "fr",
      lastAdvisedSell: msg.advisedSell || null,
      lastChecked: Date.now(),
      addedDate: new Date().toLocaleDateString("fr-FR")
    };
    chrome.storage.local.get("ae_watchlist", (res) => {
      void chrome.runtime.lastError;
      let list = Array.isArray(res.ae_watchlist) ? res.ae_watchlist : [];
      // Dédupliquer par titre
      list = list.filter(it => it.title !== item.title);
      list.unshift(item);
      if (list.length > 15) list = list.slice(0, 15);
      chrome.storage.local.set({ ae_watchlist: list }, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "GET_WATCHLIST") {
    chrome.storage.local.get("ae_watchlist", (res) => {
      void chrome.runtime.lastError;
      sendResponse({ watchlist: Array.isArray(res.ae_watchlist) ? res.ae_watchlist : [] });
    });
    return true;
  }

  if (msg.type === "REMOVE_FROM_WATCHLIST") {
    chrome.storage.local.get("ae_watchlist", (res) => {
      void chrome.runtime.lastError;
      let list = Array.isArray(res.ae_watchlist) ? res.ae_watchlist : [];
      list = list.filter(it => it.id !== msg.id);
      chrome.storage.local.set({ ae_watchlist: list }, () => {
        void chrome.runtime.lastError;
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "CHECK_WATCHLIST_NOW") {
    checkWatchlist().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ── LOGS DEBUG : retourner tous les logs pour diagnostic ─────────────────
  if (msg.type === "GET_DEBUG_LOGS") {
    sendResponse({ logs: _debugLog.slice() });
    return true;
  }

  // ── Bing : déclenchement manuel depuis le bouton dans results.js ────────────
  if (msg.type === "SEARCH_BING_MANUAL") {
    if (!pendingImageDataUrl) { sendResponse({ ok: false, error: "no-image" }); return true; }
    const mkt  = msg.market    || "fr";
    const cond = msg.condition || "all";
    const ap   = msg.aliPrice  || lastAliBuyPrice || 0;
    dbg("info", "Bing manuel déclenché, market:", mkt);
    safeRuntimeSend({ type: "VINTED_STATUS", status: "fallback", message: "Identification produit via Bing..." });
    searchVintedViaBingVisual(pendingImageDataUrl, lastSearchImageUrl || null, ap, mkt, cond)
      .then(async res => {
        dbg("info", "✅ Bing manuel réussi:", res.stats.count, "articles");
        if (pendingImageDataUrl) setCachedResults(pendingImageDataUrl, mkt, cond, res);
        const enriched = await runDeepAnalysis(res, mkt);
        broadcastResults(enriched);
      })
      .catch(e => {
        dbg("warn", "❌ Bing manuel échoué:", e.message);
        safeRuntimeSend({ type: "VINTED_STATUS", status: "error", message: "Bing n'a pas pu identifier le produit." });
      });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "VINTED_SEARCH_FAILED") {
    console.warn("[BG] VINTED_SEARCH_FAILED:", msg.reason);
    closeVintedScrapeTab();
    safeRuntimeSend({ type: "VINTED_STATUS", status: "error", message: "Recherche image échouée (" + (msg.reason || "inconnu") + ") — réessayez." });
    sendResponse({ ok: true });
    return;
  }

  // ── RECHERCHE TEXTE MANUELLE (Feature 4) ────────────────────────────────────
  if (msg.type === "SEARCH_VINTED_TEXT_MANUAL") {
    const query = (msg.query || "").trim();
    if (!query || query.length < 2) { sendResponse({ ok: false }); return true; }
    dbg("info", "Recherche texte manuelle:", query);
    safeRuntimeSend({ type: "VINTED_STATUS", status: "fallback", message: `Recherche "${query.slice(0,30)}"...` });
    searchVintedByText(query, msg.aliPrice || 0, msg.market || "fr", "all")
      .then(async res => {
        res.searchMode = "text-manual";
        res.bingProductName = query;
        const enriched = await runDeepAnalysis(res, msg.market || "fr");
        broadcastResults(enriched);
      })
      .catch(e => {
        dbg("warn", "Recherche texte manuelle échouée:", e.message);
        safeRuntimeSend({ type: "VINTED_STATUS", status: "error", message: "Aucun résultat pour : " + query });
      });
    sendResponse({ ok: true });
    return true;
  }

  // ── ANALYSE EN LOT depuis listing (Feature 7) ────────────────────────────────
  if (msg.type === "BULK_ANALYZE_PRODUCTS") {
    const products = msg.products || [];
    dbg("info", "Analyse en lot:", products.length, "produits");
    chrome.storage.local.set({ ae_compare_queue: products.slice(0, 6) });
    chrome.tabs.create({ url: chrome.runtime.getURL("compare.html"), active: true });
    sendResponse({ ok: true, count: products.length });
    return true;
  }

  if (msg.type === "VINTED_IMAGE_RESULTS") {
    lastVintedResults = msg.data || null;
    broadcastResults(lastVintedResults);
    closeVintedScrapeTab();
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "GET_LAST_VINTED_RESULTS") {
    sendResponse({ data: lastVintedResults, aliBuyPrice: lastAliBuyPrice, searchImageUrl: lastSearchImageUrl });
    return;
  }

  if (msg.type === "FETCH_IMAGE") {
    if (!msg.url) { sendResponse({ error: "no-url" }); return; }
    fetchImageAsDataUrl(msg.url).then(dataUrl => sendResponse({ dataUrl })).catch(e => sendResponse({ error: String(e) }));
    return;
  }

  sendResponse({ ok: true });
}

// ─── BROADCAST ─────────────────────────────────────────────────────────────
function broadcastResults(results) {
  lastVintedResults = results;
  safeRuntimeSend({ type: "VINTED_IMAGE_RESULTS", data: results });

  // Feature 1 : notification
  sendNotification(results);

  // Feature 2 : historique
  saveToHistory(results);

  openOrEnsureResultsPage(false, () => {
    if (!resultsTabId) return;
    chrome.tabs.get(resultsTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        resultsTabId = null;
        return;
      }
      if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("about:")) return;
      chrome.tabs.sendMessage(resultsTabId, { type: "VINTED_IMAGE_RESULTS", data: results }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

function safeRuntimeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) { /* no listener, ok */ }
    });
  } catch (e) { /* ignore */ }
}

// ─── MULTI-MARCHÉ SIMULTANÉ (Feature 5) ─────────────────────────────────────
async function searchVintedMultiMarket(imageDataUrl, aliPrice, markets, condition, vintedShipping) {
  console.log("[BG] Multi-marché simultané :", markets.join(', '));
  safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 2, message: `Recherche sur ${markets.join(' + ')}...` });

  const results = await Promise.allSettled(
    markets.map(m => searchVintedDirect(imageDataUrl, aliPrice, m, condition, vintedShipping))
  );

  const successes = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  if (!successes.length) throw new Error('Tous les marchés ont échoué');

  // Choisir le meilleur marché (count × advisedSell = liquidité × valeur)
  successes.sort((a, b) => {
    const sA = (a.stats.count || 0) + ((a.profitability.advisedSell || 0) * 0.5);
    const sB = (b.stats.count || 0) + ((b.profitability.advisedSell || 0) * 0.5);
    return sB - sA;
  });

  const best = successes[0];
  // Annoter avec les données des autres marchés pour comparaison
  best.allMarkets = successes.map(r => ({
    market: r.market || '?',
    count: r.stats.count,
    avgPrice: r.stats.avgPrice,
    advisedSell: r.profitability.advisedSell
  }));

  console.log("[BG] Meilleur marché :", best.allMarkets);
  return best;
}

// ─── API DIRECTE ───────────────────────────────────────────────────────────
async function searchVintedDirect(imageDataUrl, aliPrice, market, condition, vintedShipping) {
  const mkt = market || "fr";
  const baseUrl = `https://www.vinted.${mkt}`;
  console.log("[BG] searchVintedDirect start, market:", mkt);

  // Timeout global 12s : si Cloudflare bloque, ça échoue vite → fallback scripting rapide
  const _abortCtrl = new AbortController();
  const _abortTimeout = setTimeout(() => {
    _abortCtrl.abort();
    console.warn("[BG] searchVintedDirect: timeout 12s atteint");
  }, 12000);

  // ── Étape 1 : récupérer cookies complets + CSRF ──────────────────────────
  // On récupère TOUS les cookies (session + Cloudflare + auth) pour les injecter
  // manuellement dans les headers → le service worker est indiscernable d'un vrai onglet
  const { header: cookieHeader, csrf: cookieCsrf, anonId: cookieAnonId } = await getAllVintedCookiesHeader(mkt);
  console.log("[BG] Cookies injectés:", cookieHeader ? `${cookieHeader.length} chars` : "aucun");

  // CSRF : priorité cookies → onglet ouvert → fetch HTML
  let csrfToken = cookieCsrf;
  let anonId = cookieAnonId;
  if (!csrfToken) {
    const sess = await fetchVintedSession(mkt);
    csrfToken = sess.csrfToken;
    anonId = anonId || sess.anonId;
  }
  console.log("[BG] CSRF:", csrfToken ? csrfToken.slice(0, 10) + "..." : "null");

  if (!csrfToken) throw new Error("CSRF token introuvable — ouvre Vinted dans un onglet d'abord");

  const blob = dataUrlToBlob(imageDataUrl);
  if (!blob) throw new Error("Blob conversion failed");

  // Headers navigateur réalistes — Cloudflare accepte la requête comme un vrai navigateur
  const baseHeaders = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "X-CSRF-Token": csrfToken,
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
  if (anonId) baseHeaders["X-Anon-Id"] = anonId;
  // Injecter les cookies de session si disponibles (passe Cloudflare)
  if (cookieHeader) baseHeaders["Cookie"] = cookieHeader;

  safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 1, message: "Connexion Vinted..." });

  const uploadEndpoints = [
    `${baseUrl}/api/v2/image_searches`,
    `${baseUrl}/api/v2/catalog/image_searches`
  ];

  let uuid = null;
  let lastUploadError = null;

  for (const endpoint of uploadEndpoints) {
    try {
      const formData = new FormData();
      formData.append("image", blob, "search.png");

      const resp = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: baseHeaders,
        body: formData,
        signal: _abortCtrl.signal
      });

      console.log("[BG] Upload attempt", endpoint, "→ status:", resp.status);

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        lastUploadError = `${endpoint} → ${resp.status}: ${body.slice(0, 120)}`;
        if (resp.status === 401 || resp.status === 403) invalidateCsrfCache(mkt);
        continue;
      }

      const data = await resp.json();
      uuid = data?.image_search?.uuid || data?.uuid || data?.id || null;
      if (uuid) { console.log("[BG] UUID trouvé:", uuid); break; }
    } catch (e) {
      lastUploadError = String(e);
      console.warn("[BG] Upload error on", endpoint, e.message || e);
    }
  }

  if (!uuid) {
    clearTimeout(_abortTimeout);
    throw new Error("UUID introuvable. Dernier échec: " + lastUploadError);
  }

  safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 2, message: "Recherche par image..." });

  const searchUrl = new URL(`${baseUrl}/api/v2/catalog/items`);
  searchUrl.searchParams.set("search_by_image_uuid", uuid);
  searchUrl.searchParams.set("per_page", "30");
  searchUrl.searchParams.set("page", "1");

  // Filtre état Vinted (condition)
  // Codes Vinted : 6=Neuf avec étiquettes, 1=Très bon état, 2=Bon état, 3=Satisfaisant
  const conditionMap = {
    'new':       [6],
    'very_good': [1, 6],
    'good':      [1, 2, 6],
    'all':       []
  };
  const condIds = conditionMap[condition] || [];
  condIds.forEach(id => searchUrl.searchParams.append("status_ids[]", String(id)));
  if (condIds.length) console.log("[BG] Filtre état Vinted :", condition, "→ status_ids:", condIds);

  const searchResp = await fetch(searchUrl.toString(), {
    credentials: "include",
    headers: baseHeaders,
    signal: _abortCtrl.signal
  });

  console.log("[BG] Search status:", searchResp.status);
  if (!searchResp.ok) {
    if (searchResp.status === 401 || searchResp.status === 403) invalidateCsrfCache(mkt);
    clearTimeout(_abortTimeout);
    throw new Error("Search failed: " + searchResp.status);
  }

  const searchData = await searchResp.json();
  const count = searchData.items?.length ?? 0;
  console.log("[BG] Items reçus page 1:", count);

  if (count === 0) {
    clearTimeout(_abortTimeout);
    throw new Error("0 résultats — aucun article Vinted trouvé pour cette image");
  }

  // Si peu de résultats, tenter la page 2 pour enrichir les stats
  if (count < 8) {
    try {
      const page2Url = new URL(searchUrl.toString());
      page2Url.searchParams.set("page", "2");
      const p2Resp = await fetch(page2Url.toString(), {
        credentials: "include",
        headers: baseHeaders,
        signal: _abortCtrl.signal
      });
      if (p2Resp.ok) {
        const p2Data = await p2Resp.json();
        if (Array.isArray(p2Data.items) && p2Data.items.length > 0) {
          searchData.items = [...(searchData.items || []), ...p2Data.items];
          console.log("[BG] Page 2 ajoutée:", p2Data.items.length, "items. Total:", searchData.items.length);
        }
      }
    } catch (e) {
      console.warn("[BG] Page 2 fetch échouée (non bloquant):", e.message);
    }
  }

  clearTimeout(_abortTimeout);
  const normalized = normalizeVintedApiResults(searchData, aliPrice, vintedShipping);
  normalized.market = mkt;
  return normalized;
}

async function getCsrfFromCookies(market) {
  const domain = `vinted.${market || "fr"}`;
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, (cookies) => {
      void chrome.runtime.lastError;
      if (!cookies || !cookies.length) { resolve(null); return; }
      const csrfNames = ["XSRF-TOKEN", "csrf_token", "_csrf", "csrf-token", "authenticity_token", "X-CSRF-Token"];
      for (const cookie of cookies) {
        if (csrfNames.some(n => cookie.name.toLowerCase() === n.toLowerCase())) {
          console.log("[BG] CSRF trouvé dans cookie:", cookie.name);
          resolve(decodeURIComponent(cookie.value));
          return;
        }
      }
      resolve(null);
    });
  });
}

// Récupère TOUS les cookies Vinted (session + Cloudflare) et les formate en header Cookie
// C'est ce qui permet aux requêtes du service worker de passer comme si elles venaient d'un vrai onglet
async function getAllVintedCookiesHeader(market) {
  const domain = `vinted.${market || "fr"}`;
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, (cookies) => {
      void chrome.runtime.lastError;
      if (!cookies || !cookies.length) { resolve({ header: null, csrf: null, anonId: null }); return; }
      const csrfNames = ["xsrf-token", "csrf_token", "_csrf", "csrf-token", "authenticity_token", "x-csrf-token"];
      let csrf = null;
      let anonId = null;
      const parts = [];
      for (const c of cookies) {
        // Inclure : session, Cloudflare (__cf_bv, __cflb, cf_clearance), auth, tracking (sauf _ga)
        const lname = c.name.toLowerCase();
        if (lname.startsWith('_ga') && !lname.includes('session')) continue; // skip pure GA
        parts.push(`${c.name}=${c.value}`);
        if (csrfNames.includes(lname)) csrf = decodeURIComponent(c.value);
        if (lname === 'anon_id' || lname === '_anon_id') anonId = c.value;
      }
      console.log(`[BG] getAllVintedCookiesHeader: ${parts.length} cookies, csrf=${csrf ? 'OK' : 'null'}`);
      resolve({ header: parts.length ? parts.join('; ') : null, csrf, anonId });
    });
  });
}

// Extraire le CSRF depuis un onglet Vinted déjà ouvert (évite d'ouvrir un nouvel onglet)
async function getCsrfFromOpenVintedTab(market) {
  const mkt = market || "fr";
  return new Promise((resolve) => {
    chrome.tabs.query({ url: `https://www.vinted.${mkt}/*` }, async (tabs) => {
      void chrome.runtime.lastError;
      if (!tabs || !tabs.length) { resolve(null); return; }
      for (const tab of tabs) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                // Next.js data
                const nd = window.__NEXT_DATA__;
                if (nd) {
                  const t = nd?.props?.pageProps?.csrfToken
                         || nd?.props?.initialState?.config?.csrfToken
                         || nd?.props?.pageProps?.config?.csrfToken;
                  if (t) return t;
                }
              } catch(e) {}
              try {
                const meta = document.querySelector('meta[name="csrf-token"]');
                if (meta) return meta.getAttribute('content');
              } catch(e) {}
              try {
                // Scan inline scripts for CSRF patterns
                for (const s of document.querySelectorAll('script')) {
                  const txt = s.textContent || "";
                  const m = txt.match(/"csrf_token"\s*:\s*"([^"]{10,})"/)
                         || txt.match(/"CSRF_TOKEN"\s*:\s*"([^"]{10,})"/);
                  if (m) return m[1];
                }
              } catch(e) {}
              return null;
            }
          });
          const csrf = results?.[0]?.result;
          if (csrf) { console.log("[BG] CSRF extrait depuis onglet Vinted ouvert"); resolve(csrf); return; }
        } catch(e) {
          console.warn("[BG] getCsrfFromOpenVintedTab error tab", tab.id, e.message);
        }
      }
      resolve(null);
    });
  });
}

async function fetchVintedSession(market) {
  const mkt = market || "fr";

  // Priorité 0 : CSRF live poussé par vinted-content.js (le plus fiable — accès DOM direct)
  const live = getLiveCsrf(mkt);
  if (live) return { csrfToken: live, anonId: null };

  // Vérifier le cache d'abord
  const cached = _csrfCache[mkt];
  if (cached && (Date.now() - cached.ts) < CSRF_CACHE_TTL) {
    console.log("[BG] CSRF cache hit, market:", mkt);
    return { csrfToken: cached.token, anonId: cached.anonId };
  }
  const result = await _fetchVintedSessionRaw(mkt);
  if (result && result.csrfToken) {
    _csrfCache[mkt] = { token: result.csrfToken, anonId: result.anonId || null, ts: Date.now() };
    console.log("[BG] CSRF mis en cache pour market:", mkt);
  }
  return result;
}

async function _fetchVintedSessionRaw(market) {
  const mkt = market || "fr";
  const empty = { csrfToken: null, anonId: null };
  try {
    // Priorité 1 : onglet Vinted déjà ouvert (scripting DOM)
    const fromTab = await getCsrfFromOpenVintedTab(mkt);
    if (fromTab) return { csrfToken: fromTab, anonId: null };

    // Priorité 2 : cookies (peut inclure XSRF-TOKEN non-HttpOnly)
    const fromCookie = await getCsrfFromCookies(mkt);
    if (fromCookie) return { csrfToken: fromCookie, anonId: null };

    // Priorité 3 : charger la page Vinted
    const resp = await fetch(`https://www.vinted.${mkt}/`, {
      credentials: "include",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache"
      }
    });
    if (!resp.ok) return empty;

    const headerCsrf = resp.headers.get("X-CSRF-Token") || resp.headers.get("csrf-token");
    if (headerCsrf) return { csrfToken: headerCsrf, anonId: null };

    const html = await resp.text();
    let csrfToken = null;
    const patterns = [
      /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i,
      /"CSRF_TOKEN"\s*:\s*"([^"]+)"/,
      /"csrf_token"\s*:\s*"([^"]+)"/i,
      /data-csrf=["']([^"']+)["']/,
      /csrf[_-]token["']\s*:\s*["']([^"']{10,})["']/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) { csrfToken = m[1]; break; }
    }

    const anonMatch = html.match(/"anon_id"\s*:\s*"([^"]+)"/)
                   || html.match(/data-anon-id=["']([^"']+)["']/);
    const anonId = anonMatch ? anonMatch[1] : null;

    if (!csrfToken) {
      const cookieRetry = await getCsrfFromCookies(mkt);
      if (cookieRetry) return { csrfToken: cookieRetry, anonId };
    }

    return { csrfToken, anonId };
  } catch (e) {
    console.warn("[BG] fetchVintedSession error:", e);
    return empty;
  }
}

function dataUrlToBlob(dataUrl) {
  try {
    const parts = dataUrl.split(",");
    const mime  = parts[0].match(/:(.*?);/)[1];
    const bstr  = atob(parts[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  } catch (e) {
    console.warn("[BG] dataUrlToBlob error:", e);
    return null;
  }
}

// Feature 4 : prix conseillé intelligent avec détection d'outliers
// Si le min est un outlier (< 50% de la moyenne), on pondère vers la moyenne
// pour éviter de sous-estimer massivement la rentabilité
// Feature 1 (new) : vintedShipping déduit de la marge (frais envoi vendeur)
function computeAdvisedSell(minPrice, avgPrice) {
  if (minPrice == null || minPrice <= 0) return null;

  let ref = minPrice;

  // Détection outlier : min trop bas par rapport à la moyenne → annonce atypique
  if (avgPrice && avgPrice > 0 && minPrice < avgPrice * 0.5) {
    // Mix pondéré : 25% min + 75% avg → prix réaliste du marché
    ref = minPrice * 0.25 + avgPrice * 0.75;
    console.log("[BG] Outlier min détecté (" + minPrice + " < " + (avgPrice * 0.5).toFixed(2) + ") → ref pondérée:", ref.toFixed(2));
  }

  // Prix conseillé = référence × 0.92 (compétitif sans brader)
  return parseFloat((ref * 0.92).toFixed(2));
}

// Feature 5 (new) : Détection de catégorie depuis le titre
function _detectCategoryFromTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const t = title.toLowerCase();
  const categories = [
    { key: 'chaussures', label: 'Chaussures / Baskets', keywords: ['chaussures', 'baskets', 'sneakers', 'shoes', 'boots', 'bottes', 'sandales', 'mocassins', 'espadrilles', 'tennis', 'running'] },
    { key: 'haut', label: 'Vêtements Haut', keywords: ['tshirt', 't-shirt', 'chemise', 'shirt', 'blouse', 'top', 'débardeur', 'polo', 'pull', 'sweater', 'sweat', 'hoodie'] },
    { key: 'bas', label: 'Vêtements Bas', keywords: ['pantalon', 'jean', 'jeans', 'short', 'legging', 'jupe', 'trousers', 'pants'] },
    { key: 'veste', label: 'Vestes / Manteaux', keywords: ['veste', 'manteau', 'doudoune', 'parka', 'blouson', 'coat', 'jacket', 'vest'] },
    { key: 'sac', label: 'Sacs', keywords: ['sac', 'bag', 'backpack', 'pochette', 'cartable', 'sacoche', 'purse', 'tote'] },
    { key: 'montre', label: 'Montres / Bijoux', keywords: ['montre', 'watch', 'bijou', 'collier', 'bracelet', 'bague', 'boucle', 'earring', 'necklace', 'ring'] },
    { key: 'sport', label: 'Sport', keywords: ['sport', 'fitness', 'yoga', 'running', 'trail', 'gym', 'natation', 'maillot de bain', 'swimsuit'] },
    { key: 'accessoire', label: 'Accessoires', keywords: ['accessoire', 'ceinture', 'chapeau', 'bonnet', 'écharpe', 'gants', 'casquette', 'lunettes', 'belt', 'cap', 'hat', 'scarf', 'gloves', 'wallet', 'portefeuille'] },
  ];
  for (const cat of categories) {
    if (cat.keywords.some(kw => t.includes(kw))) {
      return { key: cat.key, label: cat.label };
    }
  }
  return null;
}

function normalizeVintedApiResults(data, aliPrice, vintedShipping) {
  // Feature 1 (new): frais envoi vendeur Vinted (défaut 3€ Mondial Relay)
  const _vintedShipping = (typeof vintedShipping === 'number' && vintedShipping >= 0) ? vintedShipping : 3;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  // Extraire le prix depuis n'importe quel format Vinted :
  //   - number   : 45.5
  //   - string   : "45.50" ou "45,50"
  //   - object   : {amount:"45.50", currency_code:"EUR"}  ← format catalog API
  //   - fallback : price_numeric ou total_item_price
  function extractPrice(it) {
    let raw = it.price_numeric ?? it.price ?? it.total_item_price ?? null;
    if (raw === null) return null;
    if (typeof raw === "object" && raw !== null) {
      raw = raw.amount ?? raw.value ?? raw.price ?? null;
    }
    if (raw === null) return null;
    const p = parseFloat(String(raw).replace(",", "."));
    return !isNaN(p) && p > 0 && p < 10000 ? p : null;
  }

  const items = rawItems.slice(0, 20).map(it => {
    const price = extractPrice(it);

    // Photos : l'API catalog utilise it.photo (objet), l'API search utilise it.photos (tableau)
    let image = null;
    if (it.photo) {
      const candidate = it.photo.url || it.photo.full_size_url || it.photo.thumbnail_url || null;
      if (isValidImageUrl(candidate)) image = candidate;
    }
    if (!image && it.photos && it.photos[0]) {
      const candidate = it.photos[0].url || it.photos[0].full_size_url || null;
      if (isValidImageUrl(candidate)) image = candidate;
    }

    const url = it.url || (it.id ? `https://www.vinted.fr/items/${it.id}` : "#");

    return {
      title: it.title || "Annonce Vinted",
      price,
      image,
      url
    };
  }).filter(it => it.price != null);

  const prices = items.map(it => it.price);
  const stats = {
    count:    items.length,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    avgPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
  };

  // Feature 4 : prix conseillé intelligent (anti-outlier)
  const advisedSell = computeAdvisedSell(stats.minPrice, stats.avgPrice);
  // Feature 1 (new): marge nette = prix conseillé - frais envoi vendeur - prix achat
  const margin = advisedSell != null && aliPrice
    ? parseFloat((advisedSell - _vintedShipping - aliPrice).toFixed(2))
    : null;

  // Feature 3 : score
  const score = margin != null && aliPrice
    ? computeScore(stats, margin, aliPrice)
    : 0;

  // Feature 5 (new) : catégorie détectée
  const category = _detectCategoryFromTitle(lastAliTitle || "");

  return {
    stats,
    inspirations: items,
    profitability: {
      aliBuyPrice:  Number(aliPrice || 0),
      avgPrice:     Number((stats.avgPrice || 0).toFixed(2)),
      advisedSell,
      vintedShipping: _vintedShipping,
      margin,
      label: margin != null ? (margin > 0.5 ? "Rentable" : margin > 0 ? "Faible" : "Non rentable") : "Indéterminé",
      score
    },
    category,
    source: "api"
  };
}

// ─── HELPER : attendre qu'un onglet soit chargé ────────────────────────────
function waitForTabComplete(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    // Vérifier d'abord si déjà chargé
    chrome.tabs.get(tabId, (tab) => {
      void chrome.runtime.lastError;
      if (tab && tab.status === "complete") { resolve(); return; }

      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        console.warn("[BG] waitForTabComplete timeout pour tab", tabId);
        resolve(); // timeout → on tente quand même
      }, timeout);

      function listener(id, changeInfo) {
        if (id !== tabId || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

// ─── MÉTHODE 2 : SCRIPTING DANS UN ONGLET VINTED (fiable même en arrière-plan) ─
// Le CSRF est extrait depuis le background (accès aux cookies HttpOnly) et passé
// en argument — plus besoin de le chercher dans le DOM de la page.
async function searchVintedViaScripting(imageDataUrl, aliPrice, market, condition, vintedShipping) {
  const mkt = market || "fr";
  const baseUrl = `https://www.vinted.${mkt}`;
  console.log("[BG] searchVintedViaScripting start, market:", mkt);

  // ── Étape 0 : obtenir le CSRF — priorité au cache live (poussé par vinted-content.js) ──
  // vinted-content.js lit le DOM Vinted directement et push le CSRF au background.
  // C'est la source la plus fiable : accès au __NEXT_DATA__ complet côté page.
  let csrfToUse = getLiveCsrf(mkt);
  if (!csrfToUse) {
    // Fallback : cookies (chrome.cookies.getAll lit les HttpOnly)
    const { csrf: bgCsrf } = await getAllVintedCookiesHeader(mkt);
    csrfToUse = bgCsrf;
  }
  if (!csrfToUse) {
    // Dernier fallback : fetchVintedSession (scripting DOM ou fetch HTML)
    const sess = await fetchVintedSession(mkt).catch(() => ({}));
    csrfToUse = sess.csrfToken || null;
  }
  console.log("[BG] CSRF pour scripting:", csrfToUse ? csrfToUse.slice(0, 12) + "..." : "null — sera cherché côté page");

  // ── Étape 1 : trouver ou créer un onglet Vinted ──────────────────────────
  let tabId = null;
  let createdTab = false;

  const existingTabs = await new Promise(resolve => {
    chrome.tabs.query({ url: `${baseUrl}/*` }, (tabs) => {
      void chrome.runtime.lastError;
      resolve(tabs || []);
    });
  });

  if (existingTabs.length > 0) {
    tabId = existingTabs[0].id;
    console.log("[BG] Onglet Vinted existant réutilisé:", tabId);
  } else {
    console.log("[BG] Création d'un nouvel onglet Vinted (background)...");
    const newTab = await new Promise(resolve => {
      chrome.tabs.create({ url: baseUrl, active: false }, (t) => {
        void chrome.runtime.lastError;
        resolve(t);
      });
    });
    if (!newTab) throw new Error("Impossible de créer un onglet Vinted");
    tabId = newTab.id;
    createdTab = true;
    safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 2, message: "Chargement Vinted..." });
    await waitForTabComplete(tabId, 20000);
    // Attendre que les cookies soient posés par Vinted (session init)
    await new Promise(r => setTimeout(r, 1500));
    // Après chargement, ré-essayer de récupérer le CSRF depuis les nouveaux cookies
    if (!csrfToUse) {
      const { csrf: freshCsrf } = await getAllVintedCookiesHeader(mkt);
      csrfToUse = freshCsrf;
      console.log("[BG] CSRF après chargement onglet:", csrfToUse ? "OK" : "toujours null");
    }
  }

  const conditionMap = {
    'new':       [6],
    'very_good': [1, 6],
    'good':      [1, 2, 6],
    'all':       []
  };
  const condIds = conditionMap[condition] || [];

  try {
    safeRuntimeSend({ type: "VINTED_STATUS", status: "step", step: 2, message: "Recherche image (onglet Vinted)..." });

    // Exécuter la recherche dans le contexte de l'onglet Vinted.
    // Le CSRF est passé en arg depuis le background qui peut lire les HttpOnly cookies.
    // La fonction injectée essaie d'abord le CSRF passé, puis cherche dans le DOM en fallback.
    const execResults = await chrome.scripting.executeScript({
      target: { tabId },
      args: [imageDataUrl, condIds, csrfToUse],
      func: async function(imgDataUrl, statusIds, bgCsrf) {
        // ── CSRF : priorité au token extrait par le background (HttpOnly) ──
        let csrf = bgCsrf || null;

        // Fallback DOM si le background n'a pas trouvé le CSRF
        if (!csrf) {
          try {
            const nd = window.__NEXT_DATA__;
            if (nd) {
              csrf = nd?.props?.pageProps?.csrfToken
                  || nd?.props?.initialState?.config?.csrfToken
                  || nd?.props?.pageProps?.config?.csrfToken
                  || nd?.query?.csrfToken;
            }
            // Vinted peut aussi stocker le CSRF dans initialReduxState
            if (!csrf && nd?.props?.initialState) {
              const s = JSON.stringify(nd.props.initialState);
              const m = s.match(/"csrf_?[Tt]oken"\s*:\s*"([^"]{10,})"/);
              if (m) csrf = m[1];
            }
          } catch(e) {}
        }
        if (!csrf) {
          const meta = document.querySelector('meta[name="csrf-token"]');
          if (meta) csrf = meta.getAttribute('content');
        }
        if (!csrf) {
          // Scan tous les scripts inline
          for (const s of document.querySelectorAll('script')) {
            const txt = s.textContent || '';
            const m = txt.match(/"csrf_token"\s*:\s*"([^"]{10,})"/)
                   || txt.match(/"CSRF_TOKEN"\s*:\s*"([^"]{10,})"/)
                   || txt.match(/csrf[_-]?token["']\s*:\s*["']([^"']{10,})["']/i);
            if (m) { csrf = m[1]; break; }
          }
        }
        // Dernier recours : lire document.cookie pour les cookies non-HttpOnly
        if (!csrf) {
          const csrfCookie = document.cookie.split(';')
            .map(c => c.trim())
            .find(c => /^(XSRF-TOKEN|csrf_token|_csrf)=/i.test(c));
          if (csrfCookie) csrf = decodeURIComponent(csrfCookie.split('=').slice(1).join('='));
        }

        if (!csrf) return { error: 'no-csrf', debug: { cookies: document.cookie.slice(0, 200), hasNextData: !!window.__NEXT_DATA__ } };

        const headers = {
          'X-CSRF-Token': csrf,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'X-Requested-With': 'XMLHttpRequest',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        };

        // ── Conversion dataUrl → Blob ────────────────────────────────────
        let blob;
        try {
          const r = await fetch(imgDataUrl);
          blob = await r.blob();
        } catch(e) {
          return { error: 'blob-failed', detail: e.message };
        }

        // ── Upload de l'image ────────────────────────────────────────────
        let uuid = null;
        let uploadStatus = null;
        for (const ep of ['/api/v2/image_searches', '/api/v2/catalog/image_searches']) {
          try {
            const fd = new FormData();
            fd.append('image', blob, 'search.png');
            const r = await fetch(ep, { method: 'POST', credentials: 'include', headers, body: fd });
            uploadStatus = r.status;
            if (!r.ok) continue;
            const d = await r.json();
            uuid = d?.image_search?.uuid || d?.uuid || d?.id;
            if (uuid) break;
          } catch(e) { continue; }
        }
        if (!uuid) return { error: 'no-uuid', uploadStatus };

        // ── Recherche par image ──────────────────────────────────────────
        let searchUrl = `/api/v2/catalog/items?search_by_image_uuid=${uuid}&per_page=30&page=1`;
        if (statusIds && statusIds.length) {
          searchUrl += '&' + statusIds.map(id => `status_ids[]=${id}`).join('&');
        }
        const sr = await fetch(searchUrl, { credentials: 'include', headers });
        if (!sr.ok) return { error: 'search-failed', status: sr.status };

        const sd = await sr.json();
        const count = sd.items?.length ?? 0;

        // Page 2 si peu de résultats
        if (count > 0 && count < 8) {
          try {
            const p2 = await fetch(searchUrl.replace('page=1', 'page=2'), { credentials: 'include', headers });
            if (p2.ok) {
              const p2d = await p2.json();
              if (Array.isArray(p2d.items) && p2d.items.length > 0) {
                sd.items = [...sd.items, ...p2d.items];
              }
            }
          } catch(e) {}
        }

        if (!count && !sd.items?.length) return { error: 'no-results' };
        return { ok: true, data: sd };
      }
    });

    const result = execResults?.[0]?.result;
    if (!result) throw new Error("executeScript returned null");
    if (result.error) {
      // Logger le détail pour diagnostic
      console.warn("[BG] scripting error:", result.error, result.debug || result.uploadStatus || result.status || "");
      throw new Error(`scripting: ${result.error}${result.detail ? ' — ' + result.detail : ''}${result.status ? ' (HTTP ' + result.status + ')' : ''}${result.uploadStatus ? ' [upload:' + result.uploadStatus + ']' : ''}`);
    }

    console.log("[BG] searchVintedViaScripting ✅", result.data.items?.length, "items");

    if (createdTab) chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });

    const normalized = normalizeVintedApiResults(result.data, aliPrice, vintedShipping);
    normalized.market = mkt;
    return normalized;

  } catch (e) {
    if (createdTab && tabId) chrome.tabs.remove(tabId, () => { void chrome.runtime.lastError; });
    throw e;
  }
}

// ─── MÉTHODE 3 : BING IDENTIFIE LE PRODUIT → RECHERCHE VINTED PAR TEXTE ─────
// Problème central : les titres AliExpress ("2024 Fashion Hip Hop Oversized Tee")
// ne correspondent jamais aux titres Vinted ("Supreme Box Logo T-shirt L").
// Solution : Bing Visual Search identifie ce qu'est réellement le produit
// ("Supreme Box Logo T-shirt") → on cherche sur Vinted avec CE vrai nom.
// Bing est très fort pour la reconnaissance produit. Pas de CSRF, pas de session.
async function searchVintedViaBingVisual(imageDataUrl, imageUrl, aliPrice, market, condition) {
  const mkt = market || "fr";
  dbg("info", "searchVintedViaBingVisual start, market:", mkt, "| imageUrl:", imageUrl ? imageUrl.slice(0, 60) : "null");

  // ── Étape 1 : POST l'image à Bing pour identification ───────────────────
  const blob = dataUrlToBlob(imageDataUrl);
  dbg("info", "Blob créé:", blob ? (blob.size + " bytes, type=" + blob.type) : "NULL ← conversion échouée");
  if (!blob) throw new Error("Blob conversion échouée");

  const bingEndpoint = "https://www.bing.com/images/search?view=detailv2&iss=sbi&FORM=SBIIDP&sbisrc=ImgPaste";
  const formData = new FormData();
  formData.append("imgbin", blob, "image.jpg");

  const ctrl = new AbortController();
  const timer = setTimeout(() => { ctrl.abort(); dbg("warn", "Bing POST timeout 15s"); }, 15000);

  let html = "";
  let finalUrl = "";
  try {
    dbg("info", "Bing POST envoi...");
    const resp = await fetch(bingEndpoint, {
      method: "POST",
      body: formData,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.bing.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Origin": "https://www.bing.com",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
      },
      redirect: "follow",
      signal: ctrl.signal
    });
    clearTimeout(timer);
    finalUrl = resp.url || "";
    dbg("info", "Bing POST HTTP", resp.status, "| finalUrl:", finalUrl.slice(0, 150));
    if (!resp.ok) throw new Error("Bing POST HTTP " + resp.status);
    html = await resp.text();
    dbg("info", "Bing HTML reçu:", html.length, "chars | contient bestRepresentativeQuery:", html.includes("bestRepresentativeQuery"));
  } catch (e) {
    clearTimeout(timer);
    dbg("warn", "Bing POST échoué :", e.message, "| imageUrl dispo:", imageUrl ? "oui" : "non");
    // Fallback : essayer avec l'URL CDN AliExpress en GET
    if (imageUrl && imageUrl.startsWith("http")) {
      dbg("info", "Essai Bing GET avec URL CDN...");
      const bingGet = `https://www.bing.com/images/search?view=detailv2&iss=sbi&imgurl=${encodeURIComponent(imageUrl)}&FORM=SBIVSP`;
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 10000);
      try {
        const r2 = await fetch(bingGet, {
          headers: {
            "Accept": "text/html",
            "Accept-Language": "fr-FR,fr;q=0.9",
            "Referer": "https://www.bing.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          redirect: "follow",
          signal: ctrl2.signal
        });
        clearTimeout(t2);
        finalUrl = r2.url || "";
        dbg("info", "Bing GET HTTP", r2.status, "| finalUrl:", finalUrl.slice(0, 100));
        if (!r2.ok) throw new Error("Bing GET HTTP " + r2.status);
        html = await r2.text();
        dbg("info", "Bing GET HTML:", html.length, "chars");
      } catch(e2) {
        clearTimeout(t2);
        dbg("warn", "Bing GET aussi échoué :", e2.message);
        throw e2;
      }
    } else {
      throw e;
    }
  }

  // ── Étape 2 : extraire le nom du produit identifié par Bing ─────────────
  const productName = _extractBingProductName(html, finalUrl);
  dbg("info", "Produit Bing extrait:", JSON.stringify(productName), "| q= dans finalUrl:", (() => { try { return new URL(finalUrl || "https://x.com").searchParams.get("q"); } catch(e) { return "n/a"; } })());

  // Si Bing n'a pas pu identifier le produit, fallback sur le titre AliExpress nettoyé
  let usedFallbackTitle = false;
  let resolvedName = productName;
  if (!resolvedName && lastAliTitle && lastAliTitle.length >= 4) {
    resolvedName = _cleanAliTitleForSearch(lastAliTitle);
    usedFallbackTitle = true;
    dbg("warn", "Bing sans résultat → fallback titre AliExpress:", JSON.stringify(resolvedName));
  }
  if (!resolvedName) throw new Error("Bing n'a pas pu identifier le produit et aucun titre AliExpress disponible");

  safeRuntimeSend({
    type: "VINTED_STATUS", status: "step", step: 2,
    message: usedFallbackTitle
      ? `Recherche Vinted par mots-clés : "${resolvedName.slice(0, 35)}"...`
      : `Produit identifié : "${resolvedName.slice(0, 35)}" → recherche Vinted...`
  });

  // ── Étape 3 : préparer la query Vinted ─────────────────────────────────
  // a) Supprimer les descripteurs génériques de Bing
  let vintedQuery = resolvedName
    .replace(/\b(with various designs?|various designs?|different styles?|multiple colors?|collection|assorted|pack of|set of|lot of|bundle)\b/gi, " ")
    .replace(/\s+/g, " ").trim();

  // b) Traduire EN→FR pour les marchés francophones (Vinted.fr, .be)
  //    Les vendeurs français écrivent "bonnet" pas "beanie", "baskets" pas "sneakers"
  if (["fr", "be", "lu"].includes(mkt)) {
    const enFr = [
      [/\bbeanies?\b/gi, "bonnet"], [/\bsneakers?\b/gi, "baskets"], [/\btrainers?\b/gi, "baskets"],
      [/\bhoodie\b/gi, "sweat capuche"], [/\bsweatshirt\b/gi, "sweat"], [/\bjacket\b/gi, "veste"],
      [/\bcoat\b/gi, "manteau"], [/\bjeans?\b/gi, "jean"], [/\bshorts?\b/gi, "short"],
      [/\bdress\b/gi, "robe"], [/\bskirt\b/gi, "jupe"], [/\bboots?\b/gi, "bottes"],
      [/\bsandals?\b/gi, "sandales"], [/\bshoes?\b/gi, "chaussures"], [/\bpants\b/gi, "pantalon"],
      [/\btrousers\b/gi, "pantalon"], [/\bshirt\b/gi, "chemise"], [/\bblouse\b/gi, "blouse"],
      [/\bsweater\b/gi, "pull"], [/\bsocks?\b/gi, "chaussettes"], [/\bscarf\b/gi, "écharpe"],
      [/\bgloves?\b/gi, "gants"], [/\bhat\b/gi, "chapeau"], [/\bcap\b/gi, "casquette"],
      [/\bbag\b/gi, "sac"], [/\bbackpack\b/gi, "sac à dos"], [/\bpurse\b/gi, "sac"],
      [/\bwallet\b/gi, "portefeuille"], [/\bbelt\b/gi, "ceinture"], [/\bwatch\b/gi, "montre"],
      [/\bsunglasses\b/gi, "lunettes de soleil"], [/\bnecklace\b/gi, "collier"],
      [/\bbracelet\b/gi, "bracelet"], [/\bearrings?\b/gi, "boucles d'oreilles"],
      [/\bjumper\b/gi, "pull"], [/\btracksuit\b/gi, "jogging"], [/\bjogging\b/gi, "jogging"],
      [/\bleggings?\b/gi, "legging"], [/\btank top\b/gi, "débardeur"],
    ];
    enFr.forEach(([rx, fr]) => { vintedQuery = vintedQuery.replace(rx, fr); });
  }
  vintedQuery = vintedQuery.replace(/\s+/g, " ").trim();
  dbg("info", "Query Vinted finale (après traduction):", JSON.stringify(vintedQuery));

  // ── Étape 4 : chercher sur Vinted ──────────────────────────────────────
  const results = await searchVintedByText(vintedQuery, aliPrice, mkt, condition);

  // Seuil minimum : si < 5 articles pertinents, les résultats ne sont pas fiables
  if (results.stats.count < 5) {
    dbg("warn", "Trop peu de résultats Bing (", results.stats.count, ") → seuil min 5 non atteint → throw pour fallback");
    throw new Error("Résultats Bing insuffisants (" + results.stats.count + " < 5) — stats non fiables");
  }

  results.searchMode = usedFallbackTitle ? "text" : "bing-visual";
  results.bingProductName = usedFallbackTitle ? null : vintedQuery;
  return results;
}

// ── Extraire le nom du produit depuis le HTML + URL finale de réponse Bing ──
function _extractBingProductName(html, finalUrl) {
  // 0. q= dans l'URL finale après redirection — le plus fiable
  // Bing redirige souvent vers ?q=Nike+Air+Max+90 après upload d'image
  if (finalUrl) {
    try {
      const u = new URL(finalUrl);
      const q = u.searchParams.get("q");
      if (q && q.length >= 4 && !q.includes("site:")) {
        return decodeURIComponent(q.replace(/\+/g, " ")).trim();
      }
    } catch(e) { /* URL malformée, on continue */ }
  }

  // Bing embarque le JSON dans le HTML avec des guillemets échappés (\") ou normaux.
  // On normalise une seule fois pour que toutes les regex s'appliquent correctement.
  const norm = html.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

  // 1. bestRepresentativeQuery — la meilleure requête textuelle identifiée par Bing
  // Structure : "bestRepresentativeQuery":{"displayText":"...","text":"VALEUR","webSearchUrl":"..."}
  // On cherche d'abord l'index de la clé, puis on scanne les 600 chars suivants.
  const bqIdx = norm.indexOf('"bestRepresentativeQuery"');
  if (bqIdx !== -1) {
    const slice = norm.slice(bqIdx, bqIdx + 600);
    dbg("info", "BQ slice (200 chars):", slice.slice(0, 200));
    // "text" seul (pas "displayText" ni "webSearchUrl") — chercher ,"text": ou {"text":
    const tm = slice.match(/[,{]\s*"text"\s*:\s*"([^"]{3,120})"/i);
    if (tm && tm[1]) { dbg("info", "bestRepresentativeQuery.text:", tm[1]); return tm[1]; }
    // Fallback : displayText dans le même bloc
    const dt = slice.match(/"displayText"\s*:\s*"([^"]{3,120})"/i);
    if (dt && dt[1]) { dbg("info", "bestRepresentativeQuery.displayText:", dt[1]); return dt[1]; }
  }

  // 2. Entités reconnues (marque / modèle)
  const m2 = norm.match(/"entities"[^[]*\[\s*\{[^}]*"name"\s*:\s*"([^"]{3,80})"/i);
  if (m2) return m2[1];

  // 3. Tags visuels Bing
  const m3 = norm.match(/"displayName"\s*:\s*"([^"]{3,80})"/i);
  if (m3 && !m3[1].toLowerCase().includes("bing") && !m3[1].toLowerCase().includes("image")) return m3[1];

  // 4. Titre de la page Bing
  const m4 = html.match(/<title[^>]*>([^<]{5,100})\s*[-–|]\s*Bing/i);
  if (m4) {
    const candidate = m4[1].trim();
    if (candidate.length >= 4 && !candidate.toLowerCase().includes("recherche")) return candidate;
  }

  // 5. q= dans le HTML
  const m5 = norm.match(/[?&]q=([^&"'\s]{4,80})/i);
  if (m5) {
    const decoded = decodeURIComponent(m5[1].replace(/\+/g, " ")).trim();
    if (decoded.length >= 4 && !decoded.includes("site:") && !decoded.includes("view=")) return decoded;
  }

  return null;
}

// ── Nettoyer le titre AliExpress pour en extraire des mots-clés Vinted ──────
// Supprime le bruit marketing, garde marque + type de produit (max 5 mots utiles)
function _cleanAliTitleForSearch(rawTitle) {
  if (!rawTitle) return null;
  // 1. Supprimer les suffixes courants AliExpress
  let t = rawTitle
    .replace(/\b(for men|for women|pour homme|pour femme|unisex|homme|femme|men'?s|women'?s)\b/gi, " ")
    .replace(/\b(new|nouveau|fashion|style|luxury|high quality|haute qualité|casual|streetwear|hip hop)\b/gi, " ")
    .replace(/\b(20\d\d|spring|summer|autumn|winter|collection|edition|version|design)\b/gi, " ")
    .replace(/\b(free shipping|livraison|discount|sale|promo|original|authentic|genuine|official)\b/gi, " ")
    .replace(/\b(size|taille|xl|xxl|xs|sm|medium|large)\b/gi, " ")
    .replace(/\b\d+\s*(pcs?|pieces?|pairs?|sets?|pack)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s'\-]/gu, " ")  // Garder lettres Unicode (é,ç,ñ…) + chiffres + apostrophes/tirets
    .replace(/\s+/g, " ").trim();

  // 2. Garder les mots significatifs (≥3 chars, pas de chiffres seuls)
  const words = t.split(" ").filter(w => w.length >= 3 && !/^\d+$/.test(w));

  // 3. Limiter à 5 mots pour ne pas surcharger la recherche
  return words.slice(0, 5).join(" ") || null;
}

// ─── HELPER : recherche Vinted par texte (avec session cookies) ──────────────
// Utilisé par searchVintedViaBingVisual (après identification Bing).
// Récupère les cookies Vinted depuis chrome.cookies pour éviter le 401.
async function searchVintedByText(query, aliPrice, market, condition) {
  const mkt = market || "fr";
  if (!query || query.length < 3) throw new Error("Requête trop courte");

  // Nettoyer la requête : enlever les termes trop génériques
  const cleanQuery = query
    .replace(/\b(for men|for women|pour homme|pour femme|fashion|style|new|nouveau|2024|2025)\b/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 60);

  dbg("info", "searchVintedByText query:", JSON.stringify(cleanQuery), "| market:", mkt, "| condition:", condition);

  // Récupérer les cookies Vinted (incluant session HttpOnly) pour éviter le 401
  let cookieHeader = "";
  let csrfToken = "";
  try {
    const cookieData = await getAllVintedCookiesHeader(mkt);
    cookieHeader = cookieData.header || "";
    csrfToken    = cookieData.csrf || getLiveCsrf(mkt) || "";
    dbg("info", "Cookies Vinted récupérés:", cookieHeader.length, "chars | CSRF:", csrfToken ? csrfToken.slice(0,10)+"..." : "absent");
  } catch(e) {
    dbg("warn", "Impossible de récupérer cookies Vinted:", e.message);
  }

  const url = new URL(`https://www.vinted.${mkt}/api/v2/catalog/items`);
  url.searchParams.set("search_text", cleanQuery);
  url.searchParams.set("per_page", "30");
  url.searchParams.set("order", "relevance");

  const conditionMap = { new: [6], very_good: [1, 6], good: [1, 2, 6], all: [] };
  (conditionMap[condition] || []).forEach(id => url.searchParams.append("status_ids[]", String(id)));

  const headers = {
    "Accept": "application/json",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  if (csrfToken)    headers["X-CSRF-Token"] = csrfToken;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const resp = await fetch(url.toString(), { headers, signal: ctrl.signal });
  clearTimeout(timer);

  dbg("info", "Vinted catalog HTTP", resp.status, "| url:", url.toString().slice(0, 120));
  if (!resp.ok) throw new Error("Vinted text search HTTP " + resp.status);
  const data = await resp.json();
  const count = data.items?.length ?? 0;
  // Inspecter le format du 1er prix pour diagnostic
  if (data.items && data.items[0]) {
    dbg("info", "Format prix item[0]:", JSON.stringify({ price: data.items[0].price, price_numeric: data.items[0].price_numeric }).slice(0, 120));
  }
  dbg("info", "Vinted catalog items reçus:", count);
  if (count === 0) throw new Error("0 résultats Vinted pour : " + cleanQuery);

  // Page 2 si peu de résultats
  if (count < 8) {
    try {
      const url2 = new URL(url.toString());
      url2.searchParams.set("page", "2");
      const r2 = await fetch(url2.toString(), { headers: { ...headers } });
      if (r2.ok) {
        const d2 = await r2.json();
        if (Array.isArray(d2.items) && d2.items.length > 0) data.items = [...data.items, ...d2.items];
      }
    } catch(e) { /* non bloquant */ }
  }

  // ── Filtre de pertinence ────────────────────────────────────────────────────
  // Extraire les mots-clés "importants" de la requête (≥3 chars, pas de stop words).
  // Un article est pertinent si son titre contient au moins 1 mot-clé (insensible à la casse).
  // Cela évite que "mode" dans "JUL mode" retourne des articles de mode sans rapport.
  const STOP = new Set(["les","des","une","pour","sur","par","avec","dans","son","ses","que","qui","mode","style","homme","femme","neuf","bon","pas","tbe"]);
  const keywords = cleanQuery
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP.has(w));

  dbg("info", "Mots-clés pertinence:", JSON.stringify(keywords));

  let filtered = data.items;
  if (keywords.length > 0) {
    const relevant = data.items.filter(it => {
      const t = (it.title || "").toLowerCase();
      return keywords.some(kw => t.includes(kw));
    });
    // N'appliquer le filtre que si on garde au moins 3 articles, sinon garder tout
    if (relevant.length >= 3) {
      dbg("info", "Filtre pertinence : gardé", relevant.length, "/", data.items.length, "articles");
      filtered = relevant;
    } else {
      dbg("warn", "Filtre pertinence trop restrictif (", relevant.length, "résultats) → on garde tout");
    }
  }

  data.items = filtered;
  const normalized = normalizeVintedApiResults(data, aliPrice);
  normalized.market = mkt;
  normalized.searchMode = "bing-visual"; // sera écrasé par l'appelant si besoin
  return normalized;
}

// ── Récupérer les détails des annonces Vinted via leur ID ──────────────────
async function _fetchVintedItemsFromUrls(vintedUrls, market, condition) {
  const mkt = market || "fr";
  const conditionMap = { new: [6], very_good: [1, 6], good: [1, 2, 6], all: [] };
  const condIds = conditionMap[condition] || [];

  const fetchOne = async (vintedUrl) => {
    const idMatch = vintedUrl.match(/\/items\/(\d+)/);
    if (!idMatch) return null;
    const itemId = idMatch[1];

    // Essai 1 : API JSON /api/v2/items/ID (rapide, peut nécessiter auth)
    try {
      const r = await fetch(`https://www.vinted.${mkt}/api/v2/items/${itemId}`, {
        headers: { "Accept": "application/json", "Accept-Language": "fr-FR,fr;q=0.9" },
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
      });
      if (r.ok) {
        const d = await r.json();
        const item = d?.item || d;
        if (item?.id && (item.price_numeric || item.price?.amount)) {
          return {
            id: item.id,
            title: item.title || "",
            price_numeric: parseFloat(item.price_numeric || item.price?.amount || 0),
            url: `https://www.vinted.${mkt}/items/${item.id}`,
            photos: item.photos || [],
            status_id: item.status_id || item.status || null
          };
        }
      }
    } catch(e) { /* continuer */ }

    // Essai 2 : page HTML + JSON-LD (si API exige auth)
    try {
      const r2 = await fetch(vintedUrl, {
        headers: { "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9" }
      });
      if (!r2.ok) return null;
      const htmlText = await r2.text();

      // JSON-LD schema.org/Product
      const jldMatch = htmlText.match(/"@type"\s*:\s*"(?:Product|Offer)"[^}]*"price"\s*:\s*"?([\d.,]+)"?/);
      const titleMatch = htmlText.match(/<title[^>]*>([^<]{3,120})<\/title>/i);
      const imgMatch = htmlText.match(/"image"\s*:\s*"(https:\/\/[^"]+vinted[^"]+)"/);

      if (!jldMatch) return null;
      const price = parseFloat(jldMatch[1].replace(",", "."));
      if (!price || price <= 0) return null;

      return {
        id: itemId,
        title: titleMatch ? titleMatch[1].replace(/\s*[\|–-]\s*Vinted.*/i, "").trim() : "",
        price_numeric: price,
        url: vintedUrl,
        photos: imgMatch ? [{ url: imgMatch[1] }] : [],
        status_id: null
      };
    } catch(e) { return null; }
  };

  // Fetch en parallèle par lots de 8 pour ne pas saturer
  const results = await Promise.allSettled(vintedUrls.slice(0, 20).map(fetchOne));
  let items = results
    .filter(r => r.status === "fulfilled" && r.value?.price_numeric > 0)
    .map(r => r.value);

  // Filtre état si demandé
  if (condIds.length) {
    const filtered = items.filter(it => it.status_id == null || condIds.includes(Number(it.status_id)));
    if (filtered.length > 0) items = filtered;
  }

  return items;
}

// ─── FALLBACK FINAL : onglet Vinted (dernier recours garanti) ──────────────
// makeActive=true → l'onglet est rendu visible, l'utilisateur voit Vinted s'ouvrir
// et la recherche s'effectue automatiquement. Moins élégant mais 100% fonctionnel.
let vintedScrapeTabId = null;

function searchVintedViaTab(imageDataUrl, aliPrice, market, makeActive = false) {
  const mkt = market || "fr";
  console.log("[BG] Fallback UI tab, market:", mkt, "makeActive:", makeActive);
  if (imageDataUrl) pendingImageDataUrl = imageDataUrl;

  chrome.tabs.create({ url: `https://www.vinted.${mkt}/`, active: makeActive }, function (tab) {
    void chrome.runtime.lastError;
    if (!tab) return;
    vintedScrapeTabId = tab.id;

    // Si on rend l'onglet actif, afficher une notification pour guider l'utilisateur
    if (makeActive) {
      safeRuntimeSend({
        type: "VINTED_STATUS", status: "fallback",
        message: "Vinted ouvert — recherche en cours automatiquement..."
      });
    }

    setTimeout(() => closeVintedScrapeTab(), 60000);

    const onUpdated = function (tabId, changeInfo) {
      if (tabId !== tab.id || changeInfo.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      // Délai légèrement plus long si actif (Next.js hydration)
      setTimeout(function () {
        const payload = { type: "VINTED_IMAGE_SEARCH", aliPrice };
        if (pendingImageDataUrl) payload.imageDataUrl = pendingImageDataUrl;
        chrome.tabs.sendMessage(tab.id, payload, function () {
          void chrome.runtime.lastError;
        });
      }, makeActive ? 1800 : 1200);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function closeVintedScrapeTab() {
  if (!vintedScrapeTabId) return;
  const id = vintedScrapeTabId;
  vintedScrapeTabId = null;
  chrome.tabs.remove(id, () => { void chrome.runtime.lastError; });
  console.log("[BG] Onglet Vinted scraping fermé:", id);
}

// ─── RÉSULTATS PAGE ─────────────────────────────────────────────────────────
function openOrEnsureResultsPage(focusIfExists, cb, activeOnCreate = false) {
  const popupUrl = chrome.runtime.getURL("results.html");
  chrome.tabs.query({ url: popupUrl }, function (tabs) {
    void chrome.runtime.lastError;
    try {
      if (tabs && tabs.length) {
        if (tabs.length > 1) {
          const toClose = tabs.slice(1).map(t => t.id).filter(Boolean);
          if (toClose.length) chrome.tabs.remove(toClose, () => { void chrome.runtime.lastError; });
        }
        resultsTabId = tabs[0].id;
        if (focusIfExists) {
          chrome.tabs.update(resultsTabId, { active: true }, () => {
            void chrome.runtime.lastError;
            if (cb) cb();
          });
        } else {
          if (cb) cb();
        }
      } else {
        // activeOnCreate=true pour le Quick Search : l'utilisateur voit la page s'ouvrir
        chrome.tabs.create({ url: popupUrl, active: activeOnCreate }, function (t) {
          void chrome.runtime.lastError;
          if (!t) { if (cb) cb(); return; }
          resultsTabId = t.id;
          setTimeout(() => { if (cb) cb(); }, 600);
        });
      }
    } catch (e) {
      console.error("[BG] openOrEnsureResultsPage error:", e);
      if (cb) cb();
    }
  });
}

// ─── FETCH IMAGE HELPER ─────────────────────────────────────────────────────
async function fetchImageAsDataUrl(url) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 12000);
  let r;
  try {
    r = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!r.ok) throw new Error("fetch status " + r.status);
  const buf  = await r.arrayBuffer();
  const u8   = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  const base64   = btoa(binary);
  const extMatch = url.match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i);
  const mime     = extMatch
    ? (extMatch[1].toLowerCase() === "jpg" ? "image/jpeg" : "image/" + extMatch[1].toLowerCase())
    : "image/png";
  return "data:" + mime + ";base64," + base64;
}
