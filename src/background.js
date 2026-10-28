// AliEdge — service worker : session, analyses, catalogue, suivis, détection des ventes.
import { DEFAULT_SETTINGS, MARKETS, SITE_URL } from "./config.js";
import * as sb from "./lib/supabase.js";
import * as vinted from "./lib/vinted.js";
import { analyse, toEur, parsePrice, round2 } from "./lib/pricing.js";
import { buildQuery, guessCategory } from "./lib/text.js";
import { extractProduct, detectPlatform, sourceIdFromUrl, canonicalUrl } from "./lib/extract.js";
const STOP_CODES = new Set(["blocked", "rate_limited", "paused", "budget"]);

const HISTORY_KEY = "ae_history";
const WATCH_KEY = "ae_watch";
const SETTINGS_KEY = "ae_settings";
const ME_TTL = 60_000;
let meCache = { at: 0, value: null };

// ───────────────────────── Réglages

async function getSettings() {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  // Le partage au catalogue fait partie du fonctionnement d'AliEdge (voir la page confidentialité).
  return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] || {}), shareAnalyses: true };
}

async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  if (!MARKETS[next.market]) next.market = "fr";
  next.costPerSale = Math.max(0, Math.min(50, Number(next.costPerSale) || 0));
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  await syncAlarms(next);
  return next;
}

async function syncAlarms(settings) {
  const s = settings || (await getSettings());
  // La détection des ventes fait partie du fonctionnement d'AliEdge : toujours active (voir la page confidentialité).
  chrome.alarms.create("community", { periodInMinutes: 30, delayInMinutes: 3 });
  chrome.alarms.create("watch", { periodInMinutes: 360, delayInMinutes: 30 });
  chrome.alarms.create("remote", { periodInMinutes: 360, delayInMinutes: 1 });
  await syncRadarAlarm();
}

// ───────────────────────── Réglages à distance, santé et erreurs (Phase 0)
// L'admin Barapics peut ralentir ou couper une fonction chez tous les membres sans nouvelle version.
let remote = {};
chrome.storage.local.get("ae_remote").then((r) => { remote = r.ae_remote || {}; vinted.applyRemoteBudget(remote); }).catch(() => {});
function radarPeriodMinutes() {
  const s = Number(remote.radar_seconds);
  return (Number.isFinite(s) && s > 0 ? Math.min(300, Math.max(20, s)) : 30) / 60;
}
async function refreshRemote() {
  if (!(await sb.getSession())) return;
  const cfg = await sb.rpc("aliedge_remote_config").catch(() => null);
  if (!cfg || typeof cfg !== "object") return;
  remote = cfg;
  vinted.applyRemoteBudget(remote);
  await chrome.storage.local.set({ ae_remote: remote });
  await syncRadarAlarm();
}
async function reportHealth() {
  if (!(await sb.getSession())) return;
  const g = await vinted.guardStatus();
  const st = await radarState().catch(() => ({ filters: [] }));
  await sb.rpc("aliedge_report_health", {
    _version: chrome.runtime.getManifest().version, _requests: g.lastDay, _pauses: g.pausesToday || 0,
    _reason: g.lastPauseReason || null, _filters: st.filters.filter((f) => f.active).length,
  }).catch(() => {});
}
// Erreurs inattendues regroupées puis envoyées toutes les 30 min (20 envois par jour au plus côté serveur).
const errBuffer = new Map();
function noteError(area, err) {
  const message = String(err?.message || err || "?").replace(/https?:\/\/\S+/g, "<url>").replace(/\d{5,}/g, "<n>").slice(0, 300);
  const key = `${area}|${message}`;
  errBuffer.set(key, (errBuffer.get(key) || 0) + 1);
  if (errBuffer.size > 50) errBuffer.delete(errBuffer.keys().next().value);
}
async function flushErrors() {
  if (!errBuffer.size || !(await sb.getSession())) return;
  const items = [...errBuffer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  errBuffer.clear();
  for (const [key, count] of items) {
    const [area, ...rest] = key.split("|");
    await sb.rpc("aliedge_report_error", { _version: chrome.runtime.getManifest().version, _area: area, _message: rest.join("|"), _count: count }).catch(() => {});
  }
}
self.addEventListener("error", (e) => noteError("worker", e?.error || e?.message));
self.addEventListener("unhandledrejection", (e) => noteError("promise", e?.reason));

// ───────────────────────── Installation

async function setup() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch { /* Chrome < 116 */ }
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ae-search", title: "Chercher « %s » sur Vinted avec AliEdge", contexts: ["selection"] });
  });
  await syncAlarms();
  checkForUpdate().catch(() => {});
}

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  await setup();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html?mode=tab#/compte?welcome=1") });
  // Membres existants : pas de prise en main après une mise à jour, mais les nouveautés.
  if (reason === "update") {
    chrome.storage.local.set({ ae_onboarded: Date.now() }).catch(() => {});
    announceUpdate(previousVersion).catch(() => {});
  }
});

// ───────────────────────── Mises à jour : Chrome installe les nouvelles versions tout seul ;
// AliEdge le signale, propose de l'appliquer tout de suite, puis montre les nouveautés.

async function releaseNotes() {
  try { return await (await fetch(chrome.runtime.getURL("version.json"))).json(); } catch { return {}; }
}

async function announceUpdate(previousVersion) {
  const version = chrome.runtime.getManifest().version;
  if (!previousVersion || previousVersion === version) return;
  const rel = await releaseNotes();
  const notes = rel.version === version && rel.notes ? rel.notes : "";
  await chrome.storage.local.set({ ae_whatsnew: { version, notes, at: Date.now() }, ae_update_ready: null });
  chrome.notifications.create("ae-updated", {
    type: "basic", iconUrl: "icons/icon128.png",
    title: `AliEdge est à jour (${version})`,
    message: (notes || "Découvre les nouveautés dans le panneau AliEdge.").slice(0, 200),
    priority: 1,
  });
}

// Une nouvelle version a été téléchargée par Chrome : on prévient, un clic l'installe immédiatement.
chrome.runtime.onUpdateAvailable.addListener(async ({ version }) => {
  await chrome.storage.local.set({ ae_update_ready: { version, at: Date.now() } });
  chrome.action.setBadgeBackgroundColor({ color: "#6d3bff" });
  chrome.action.setBadgeText({ text: "↑" });
  chrome.notifications.create("ae-update-ready", {
    type: "basic", iconUrl: "icons/icon128.png",
    title: `Nouvelle version d'AliEdge (${version})`,
    message: "Clique ici pour l'installer maintenant (quelques secondes). Sinon, elle s'installera au prochain redémarrage de Chrome.",
    priority: 2,
    requireInteraction: true,
  });
  broadcast({ type: "update:ready", version });
});

/** Demande à Chrome de vérifier s'il existe une nouvelle version (au plus toutes les 6 heures). */
async function checkForUpdate() {
  const { ae_update_check: last = 0 } = await chrome.storage.local.get("ae_update_check");
  if (Date.now() - last < 6 * 3600_000) return;
  await chrome.storage.local.set({ ae_update_check: Date.now() });
  try { chrome.runtime.requestUpdateCheck(() => void chrome.runtime.lastError); } catch { /* indisponible en mode développeur */ }
}
chrome.runtime.onStartup.addListener(setup);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ae-search" || !info.selectionText) return;
  if (tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  await chrome.storage.session.set({ ae_pending: { query: info.selectionText.slice(0, 120), at: Date.now() } });
  broadcast({ type: "pending" });
});

// Le panneau suit l'onglet actif.
chrome.tabs.onActivated.addListener(() => broadcast({ type: "tab:changed" }));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active) broadcast({ type: "tab:changed" });
  // Shein, Temu et AliExpress changent de variante sans recharger la page : on relit la fiche.
  if (info.url && tab.active && info.status !== "complete") setTimeout(() => broadcast({ type: "tab:changed" }), 1500);
  if (info.status === "complete" && tab.url && detectPlatform(tab.url)) setTimeout(() => recordSeen(tabId), 3000);
});

// Fiches fournisseur consultées : enregistrées au catalogue même sans analyse (par lots).
const seenAt = new Map();
let seenQueue = [];
let seenTimer = null;
async function recordSeen(tabId) {
  try {
    if (!(await sb.getSession())) return;
    const p = await currentProduct(tabId);
    if (!p?.supported || !p.title || !p.source_id) return;
    const key = `${p.platform}:${p.source_id}`;
    if (Date.now() - (seenAt.get(key) || 0) < 12 * 3600_000) return;
    seenAt.set(key, Date.now());
    if (seenAt.size > 1000) seenAt.delete(seenAt.keys().next().value);
    seenQueue.push({ platform: p.platform, source_id: p.source_id, url: p.url, title: p.title, image_url: p.image, price: p.priceEur, category: p.category });
    if (seenQueue.length >= 5) return flushSeen();
    clearTimeout(seenTimer);
    seenTimer = setTimeout(flushSeen, 20_000);
  } catch { /* page fermée entre-temps */ }
}
async function flushSeen() {
  clearTimeout(seenTimer);
  const batch = seenQueue.splice(0, 20);
  if (batch.length) await sb.rpc("aliedge_seen_products", { _products: batch }).catch(() => {});
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ───────────────────────── Compte

async function me(force = false) {
  const session = await sb.getSession();
  if (!session) { meCache = { at: 0, value: null }; return null; }
  if (!force && meCache.value && Date.now() - meCache.at < ME_TTL) return meCache.value;
  try {
    const value = await sb.rpc("aliedge_me");
    meCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    if (e.code === "auth") return null;
    // Serveur injoignable : compte connu mais offre inconnue.
    return { email: session.user?.email, pro: false, offline: true, used_today: 0, daily_limit: 5 };
  }
}

// ───────────────────────── Produit de l'onglet actif

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function currentProduct(tabId) {
  const tab = tabId ? await chrome.tabs.get(tabId) : await activeTab();
  if (!tab?.url) return { supported: false };
  const platform = detectPlatform(tab.url);
  if (!platform) return { supported: false, url: tab.url };
  let data;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: extractProduct });
    data = res?.result;
  } catch {
    return { supported: true, platform, error: "Impossible de lire cette page. Recharge-la puis réessaie." };
  }
  if (!data?.title) return { supported: true, platform, error: "Fiche produit pas encore chargée. Patiente une seconde puis réessaie." };
  let price = Number.isFinite(data.price) && data.price > 0 ? { amount: data.price, currency: data.currency } : null;
  const shown = parsePrice(data.priceText);
  // Le prix affiché (avec promotions et devise locale) prime sur les données structurées.
  if (shown) price = { amount: shown.amount, currency: shown.currency || price?.currency || "EUR" };
  const currency = (price?.currency || "EUR").toUpperCase();
  return {
    supported: true,
    tabId: tab.id,
    platform,
    source_id: sourceIdFromUrl(tab.url),
    url: canonicalUrl(tab.url),
    title: data.title,
    image: data.image,
    images: data.images,
    price: price ? round2(price.amount) : null,
    currency,
    priceEur: price ? toEur(price.amount, currency) : null,
    category: guessCategory(data.title),
    query: buildQuery(data.title),
    orders: data.orders || null,
    rating: data.rating || null,
  };
}

// ───────────────────────── Analyse

async function runAnalysis({ product, query, market, condition, shipping = 0, excluded = [] }) {
  const settings = await getSettings();
  market = MARKETS[market] ? market : settings.market;
  condition = condition || settings.condition;
  const session = await sb.getSession();
  if (!session) throw new sb.ApiError("Crée ton compte gratuit pour lancer une analyse.", 401, "auth");
  const quota = await sb.rpc("aliedge_start_analysis");
  if (!quota.allowed) {
    throw new sb.ApiError(`Tu as utilisé tes ${quota.limit} analyses gratuites du jour. Passe à AliEdge Pro pour analyser sans limite.`, 402, "quota");
  }
  meCache.at = 0;

  const first = await vinted.searchText(query, { market, condition });
  if (!first.items.length && vinted.lastSearchIssue && Date.now() - vinted.lastSearchIssue.at < 30_000) {
    noteError("search", `vide status=${vinted.lastSearchIssue.status} keys=${vinted.lastSearchIssue.keys}`);
    flushErrors().catch(() => {});
    if (vinted.lastSearchIssue.status === 401 || vinted.lastSearchIssue.status === 403) {
      throw new sb.ApiError("Vinted n'accepte pas la recherche pour l'instant : ouvre vinted.fr dans un onglet (connecté à ton compte), puis relance l'analyse.", 503, "vinted_auth");
    }
  }
  const total = first.total;
  let found = first.items;
  // Recherche par image : les vendeurs Vinted titrent rarement comme le fournisseur.
  // L'IA lit la photo du produit, propose les recherches que tapent les vendeurs, puis compare les photos.
  const image = product?.image && /^https:\/\//.test(product.image) ? product.image : null;
  let visual = false;
  if (image) {
    try {
      const { queries = [] } = await barapics({ action: "keywords", image, title: product.title || query });
      const seen = new Set(found.map((i) => i.vinted_id));
      for (const q of queries.filter((x) => x.toLowerCase() !== query.toLowerCase()).slice(0, 2)) {
        try {
          const more = await vinted.searchText(q, { market, condition, perPage: 48 });
          for (const it of more.items) if (!seen.has(it.vinted_id)) { seen.add(it.vinted_id); found.push(it); }
        } catch (e) { if (["blocked", "rate_limited", "paused"].includes(e.code)) break; }
      }
      const pool = [...found].sort((a, b) => b.relevance - a.relevance).filter((i) => /^https:\/\//.test(i.photo_url || "")).slice(0, 48);
      const { scores = {} } = await barapics({ action: "match", image, title: product.title || query, candidates: pool.map((i) => ({ id: i.vinted_id, photo: i.photo_url })) });
      found = found.map((i) => {
        const v = scores[i.vinted_id];
        return v == null ? i : { ...i, visual: v, relevance: Math.max(i.relevance, v) };
      });
      visual = Object.keys(scores).length > 0;
    } catch { /* recherche visuelle indisponible : on garde la recherche par mots-clés */ }
  }
  // Annonces comparables : les plus pertinentes d'abord ; on garde le reste en réserve.
  found.sort((a, b) => b.relevance - a.relevance);
  let comparable = found.filter((i) => i.relevance >= 0.5);
  let lowConfidence = false;
  if (comparable.length < 5) {
    comparable = found.filter((i) => i.relevance >= 0.3).slice(0, 24);
    lowConfidence = true;
  }
  if (comparable.length < 3) {
    comparable = found.slice(0, 12);
    lowConfidence = true;
  }
  const excludedSet = new Set(excluded.map(Number));
  comparable = comparable.slice(0, 60).map((i) => ({ ...i, excluded: excludedSet.has(i.vinted_id) }));

  // Catalogue communautaire : on partage l'analyse puis on récupère les ventes déjà constatées.
  let productId = null;
  let sold = [];
  if (settings.shareAnalyses && product?.platform && product.source_id) {
    try {
      productId = await sb.rpc("aliedge_contribute", {
        _product: {
          platform: product.platform, source_id: product.source_id, url: product.url, title: product.title,
          image_url: product.image, price: product.priceEur, currency: "EUR", category: product.category,
        },
        _items: comparable.filter((i) => !i.excluded && i.relevance >= 0.5).slice(0, 40).map((i) => ({
          vinted_id: i.vinted_id, market, title: i.title, brand: i.brand, size: i.size, condition: i.condition,
          price: i.price, currency: i.currency, photo_url: i.photo_url, url: i.url, favourites: i.favourites, seller_id: i.seller_id, status: "active",
        })),
      });
      const m = await me();
      if (m?.pro && productId) {
        const rows = await sb.rpc("aliedge_product_items", { _product_id: productId });
        sold = (rows || []).filter((r) => r.status === "sold").map((r) => ({ ...r, price: Number(r.price) }));
      }
    } catch { /* le partage ne doit jamais bloquer l'analyse */ }
  }

  const result = analyse({
    productPrice: product?.priceEur ?? 0,
    shipping: Number(shipping) || 0,
    costPerSale: settings.costPerSale,
    items: comparable,
    soldItems: sold,
  });
  const entry = {
    id: `${product?.source_id || "q"}-${Date.now()}`,
    at: Date.now(),
    product: product ? { platform: product.platform, source_id: product.source_id, url: product.url, title: product.title, image: product.image, images: (product.images || []).slice(0, 8), priceEur: product.priceEur, category: product.category } : null,
    query, market, condition, shipping: Number(shipping) || 0,
    total, lowConfidence, productId, visual,
    items: comparable,
    sold: sold.slice(0, 30),
    result,
    quota: { used: quota.used, limit: quota.limit },
  };
  await pushHistory(entry);
  if (product?.tabId) {
    chrome.tabs.sendMessage(product.tabId, { type: "pill:result", margin: result.margin, score: result.score, verdict: result.verdict }).catch(() => {});
  }
  return entry;
}

/** Recalcul local (annonce exclue, frais modifiés) sans nouvelle recherche Vinted. */
async function recompute({ entry, shipping, excluded = [] }) {
  const settings = await getSettings();
  const ex = new Set(excluded.map(Number));
  const items = entry.items.map((i) => ({ ...i, excluded: ex.has(i.vinted_id) }));
  const result = analyse({
    productPrice: entry.product?.priceEur ?? 0, shipping: Number(shipping) || 0, costPerSale: settings.costPerSale,
    items, soldItems: entry.sold || [],
  });
  return { ...entry, items, shipping: Number(shipping) || 0, result };
}

// ───────────────────────── Historique et suivis (stockés sur l'appareil)

async function pushHistory(entry) {
  const r = await chrome.storage.local.get(HISTORY_KEY);
  const list = (r[HISTORY_KEY] || []).filter((e) => !(e.product?.source_id && e.product.source_id === entry.product?.source_id && e.query === entry.query));
  list.unshift({ ...entry, items: entry.items.slice(0, 30) });
  await chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, 40) });
}

async function getList(key) {
  const r = await chrome.storage.local.get(key);
  return r[key] || [];
}

async function addWatch(entry) {
  const list = await getList(WATCH_KEY);
  const key = entry.product?.source_id || entry.query;
  const next = list.filter((w) => w.key !== key);
  next.unshift({
    key, product: entry.product, query: entry.query, market: entry.market, condition: entry.condition,
    addedAt: Date.now(),
    points: [{ at: Date.now(), median: entry.result.activeStats?.median ?? null, count: entry.result.activeStats?.count ?? 0 }],
  });
  await chrome.storage.local.set({ [WATCH_KEY]: next.slice(0, 30) });
  return next;
}

async function removeWatch(key) {
  const next = (await getList(WATCH_KEY)).filter((w) => w.key !== key);
  await chrome.storage.local.set({ [WATCH_KEY]: next });
  return next;
}

async function refreshWatches() {
  const list = await getList(WATCH_KEY);
  if (!list.length || !(await sb.getSession())) return;
  for (const w of list.slice(0, 20)) {
    try {
      const { items } = await vinted.searchText(w.query, { market: w.market, condition: w.condition });
      const kept = items.filter((i) => i.relevance >= 0.5);
      const prices = kept.map((i) => i.price).sort((a, b) => a - b);
      const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
      const prev = w.points[w.points.length - 1];
      w.points.push({ at: Date.now(), median, count: kept.length });
      w.points = w.points.slice(-40);
      if (prev?.median && median && Math.abs(median - prev.median) / prev.median >= 0.1) {
        const up = median > prev.median;
        chrome.notifications.create(`watch-${w.key}-${Date.now()}`, {
          type: "basic", iconUrl: "icons/icon128.png",
          title: up ? "Le prix Vinted monte" : "Le prix Vinted baisse",
          message: `${(w.product?.title || w.query).slice(0, 60)} : ${prev.median.toFixed(2)} € → ${median.toFixed(2)} €`,
        });
      }
      await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
    } catch { /* on réessaiera au prochain passage */ }
  }
  await chrome.storage.local.set({ [WATCH_KEY]: list });
}

// ───────────────────────── Détection des ventes (membres volontaires)

/** Sélection VintedDrop : notifie les nouvelles publications d'Ivan (produits, vidéos d'analyse). */
async function checkPicks() {
  if (!(await sb.getSession())) return;
  const feed = await sb.rpc("aliedge_picks_feed").catch(() => null);
  const picks = feed?.picks || [];
  if (!picks.length) return;
  const { ae_picks_seen: seen = null } = await chrome.storage.local.get("ae_picks_seen");
  const ids = picks.map((p) => p.id);
  await chrome.storage.local.set({ ae_picks_seen: ids.slice(0, 50) });
  if (!seen) return; // premier passage : on mémorise sans notifier
  const fresh = picks.filter((p) => !seen.includes(p.id));
  if (!fresh.length) return;
  const p = fresh[0];
  chrome.notifications.create("ae-pick", {
    type: "basic", iconUrl: "icons/icon128.png",
    title: p.kind === "video" ? "Nouvelle vidéo d'analyse VintedDrop" : "Nouveau produit sélectionné par Ivan",
    message: `${p.title}${fresh.length > 1 ? ` (et ${fresh.length - 1} autre${fresh.length > 2 ? "s" : ""})` : ""}`.slice(0, 200),
    priority: 1,
  });
}

async function communityCheck() {
  checkPicks().catch(() => {});
  const settings = await getSettings();
  if (!(await sb.getSession())) return;
  // 1) Par vendeur : un dressing lu = toutes ses annonces suivies revérifiées d'un coup.
  let sellers = [];
  try { sellers = await sb.rpc("aliedge_sellers_to_check", { _limit: 4 }); } catch { /* fonction absente : on passe aux annonces */ }
  const { ae_fullscan: full = {} } = await chrome.storage.local.get("ae_fullscan");
  for (const { seller_id, market, pending } of (sellers || []).filter((x) => remote.trackers_enabled !== "off" || x.pending !== -1)) {
    try {
      // Concurrent suivi : dressing complet (toutes les pages) toutes les 3 h, première page entre-temps.
      const key = `${market}:${seller_id}`;
      const deep = pending === -1 && Date.now() - (full[key] || 0) > 3 * 3600_000;
      const items = await vinted.sellerItems(seller_id, market, { pages: deep ? 10 : 1 });
      if (deep) { full[key] = Date.now(); await chrome.storage.local.set({ ae_fullscan: Object.fromEntries(Object.entries(full).slice(-200)) }); }
      if (items.length) await reportWardrobe(seller_id, market, items);
    } catch (e) {
      if (STOP_CODES.has(e.code)) return;
    }
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
  }
  // 2) Annonces sans vendeur connu : une par une.
  let batch = [];
  try { batch = await sb.rpc("aliedge_items_to_check", { _limit: 6 }); } catch { return; }
  const report = [];
  for (const { vinted_id, market } of batch || []) {
    try {
      const status = await vinted.itemStatus(vinted_id, market);
      if (status) report.push({ vinted_id, market, status });
    } catch (e) {
      if (STOP_CODES.has(e.code)) break;
    }
    await new Promise((r) => setTimeout(r, 2500 + Math.random() * 3500));
  }
  if (report.length) await sb.rpc("aliedge_report_items", { _items: report }).catch(() => {});
  // 3) Rafraîchissement : quelques produits du catalogue relancés sur Vinted pour trouver les nouvelles annonces.
  await refreshProducts();
  await flushSeen();
}

async function refreshProducts() {
  let rows = [];
  try { rows = await sb.rpc("aliedge_products_to_refresh", { _limit: 4 }); } catch { return; }
  const market = (await getSettings()).market || "fr";
  for (const p of rows || []) {
    try {
      const { items } = await vinted.searchText(buildQuery(p.title), { market });
      const good = items.filter((i) => i.relevance >= 0.5).sort((a, b) => b.relevance - a.relevance).slice(0, 40);
      await sb.rpc("aliedge_refresh", {
        _product_id: p.product_id,
        _items: good.map((i) => ({ vinted_id: i.vinted_id, market, title: i.title, brand: i.brand, size: i.size, condition: i.condition, price: i.price, currency: i.currency, photo_url: i.photo_url, url: i.url, favourites: i.favourites, seller_id: i.seller_id, status: "active" })),
      });
    } catch (e) {
      if (STOP_CODES.has(e.code)) return;
    }
    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
  }
}

// ───────────────────────── Radar : nouvelles annonces Vinted selon des filtres (sans achat automatique)

const RADAR_KEY = "ae_radar";          // { filters: [...], feed: [...], seen: { [filterId]: [ids] } }
const RADAR_MAX_FILTERS = 10; // plafond absolu (membres du Skool)
/** Filtres Radar autorisés : 10 pour les membres du Skool VintedDrop, 5 sinon. */
async function radarLimit() { const m = await me().catch(() => null); return m?.skool ? 10 : 5; }
async function radarState() {
  const r = await chrome.storage.local.get(RADAR_KEY);
  return { filters: [], feed: [], seen: {}, ...(r[RADAR_KEY] || {}) };
}
async function saveRadar(st) { await chrome.storage.local.set({ [RADAR_KEY]: st }); }
async function syncRadarAlarm(st) {
  const active = (st || (await radarState())).filters.some((f) => f.active);
  if (active && remote.radar_enabled !== "off") chrome.alarms.create("radar", { periodInMinutes: radarPeriodMinutes(), delayInMinutes: 0.1 });
  else chrome.alarms.clear("radar");
}

let radarRunning = false;
async function radarTick() {
  if (radarRunning || remote.radar_enabled === "off") return;
  radarRunning = true;
  try {
    const st = await radarState();
    const all = st.filters.filter((f) => f.active).slice(0, RADAR_MAX_FILTERS);
    // Un seul filtre par passage, à tour de rôle : 2 requêtes par minute au plus, quel que soit le nombre de filtres.
    st.cursor = ((st.cursor ?? -1) + 1) % Math.max(1, all.length);
    const active = all.length ? [all[st.cursor]] : [];
    let fresh = 0;
    for (const f of active) {
      let items;
      try { items = await vinted.searchNewest({ query: f.query, market: f.market, condition: f.condition, priceMin: f.priceMin, priceMax: f.priceMax, params: f.params || null }); }
      catch (e) { if (["blocked", "rate_limited", "paused", "budget"].includes(e.code)) break; continue; }
      const seen = new Set(st.seen[f.id] || []);
      const first = seen.size === 0;            // premier passage : on mémorise sans notifier
      const news = items.filter((i) => !seen.has(i.vinted_id));
      for (const i of items) seen.add(i.vinted_id);
      st.seen[f.id] = [...seen].slice(-400);
      if (first) continue;
      for (const i of news.slice(0, 10)) {
        st.feed.unshift({ ...i, filterId: f.id, filterName: f.name, at: Date.now() });
        fresh++;
        if (f.notify !== false) {
          chrome.notifications.create(`radar-${i.vinted_id}`, {
            type: "basic", iconUrl: "icons/icon128.png",
            title: `${eur0(i.price)} · ${f.name}`.slice(0, 80),
            message: (i.title || "Nouvelle annonce").slice(0, 120),
            priority: 2,
          });
        }
      }
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
    }
    st.feed = st.feed.slice(0, 200);
    await saveRadar(st);
    if (fresh) sendPhoneAlerts(st.feed.slice(0, fresh)).catch(() => {});
    if (fresh) {
      const prev = Number((await chrome.action.getBadgeText({})) || 0);
      chrome.action.setBadgeBackgroundColor({ color: "#0fa968" });
      chrome.action.setBadgeText({ text: String(Math.min(99, prev + fresh)) });
      broadcast({ type: "radar:new" });
    }
  } finally { radarRunning = false; }
}
/** Alertes sur téléphone (Telegram, Discord, salon du Skool) : seulement si le membre en a configuré. */
async function sendPhoneAlerts(items) {
  const { ae_alerts: cfg } = await chrome.storage.local.get("ae_alerts");
  if (!cfg || !(cfg.discord || cfg.telegram || cfg.shareSkool) || !items.length) return;
  await barapics({
    action: "alerts:send",
    alerts: items.slice(0, 10).map((i) => ({ title: String(i.title || "Annonce Vinted").slice(0, 300), price: Number.isFinite(Number(i.price)) ? Number(i.price) : null, url: i.url, photo: i.photo_url || null, filter: i.filterName || null, brand: i.brand || null, size: i.size || null })),
  });
}
const eur0 = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === "ae-update-ready") { chrome.notifications.clear(id); chrome.runtime.reload(); return; }
  if (id === "ae-pick") { chrome.notifications.clear(id); chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html?mode=tab#/catalogue") }); return; }
  if (id === "ae-updated") {
    chrome.notifications.clear(id);
    chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html?mode=tab#/analyse") });
    return;
  }
  if (!id.startsWith("radar-")) return;
  const vid = id.slice(6);
  const st = await radarState();
  const it = st.feed.find((x) => String(x.vinted_id) === vid);
  if (it?.url) chrome.tabs.create({ url: it.url });
  chrome.notifications.clear(id);
});

async function radarSave({ filter }) {
  const st = await radarState();
  // Lien de recherche Vinted (marque, catégorie, taille…) : repris tel quel par le Radar.
  const link = filter.link ? vinted.parseSearchUrl(filter.link) : null;
  if (filter.link && !link) throw new sb.ApiError("Ce lien n'est pas une recherche Vinted : fais ta recherche sur Vinted avec tes filtres, puis copie l'adresse de la page.", 400, "invalid");
  const linkQuery = link?.params?.search_text || "";
  const f = {
    id: filter.id || `f${Date.now().toString(36)}`,
    name: String(filter.name || filter.query || linkQuery || "Recherche Vinted").slice(0, 40),
    query: link ? "" : String(filter.query || "").slice(0, 120),
    link: link ? String(filter.link).slice(0, 1000) : null,
    params: link ? link.params : null,
    market: link ? link.market : MARKETS[filter.market] ? filter.market : "fr",
    condition: ["all", "new", "very_good"].includes(filter.condition) ? filter.condition : "all",
    priceMin: filter.priceMin === "" || filter.priceMin == null ? null : Math.max(0, Number(filter.priceMin) || 0),
    priceMax: filter.priceMax === "" || filter.priceMax == null ? null : Math.max(0, Number(filter.priceMax) || 0),
    notify: filter.notify !== false,
    active: filter.active !== false,
  };
  if (!f.query && !f.params) throw new sb.ApiError("Indique des mots-clés ou colle un lien de recherche Vinted.", 400, "invalid");
  const i = st.filters.findIndex((x) => x.id === f.id);
  if (i >= 0) st.filters[i] = f;
  else {
    const max = await radarLimit();
    if (st.filters.length >= max) throw new sb.ApiError(max < 10 ? `5 filtres au maximum : supprime-en un, ou passe à 10 filtres en rejoignant le Skool VintedDrop.` : `10 filtres au maximum : supprime-en un avant d'en ajouter.`, 400, "limit");
    st.filters.push(f);
    st.seen[f.id] = [];
  }
  await saveRadar(st);
  await syncRadarAlarm(st);
  vinted.inBackground(radarTick).catch(() => {});
  return st;
}

// ───────────────────────── Trackers de vendeurs (14 jours)

// Concurrents déjà suivis (pour les boutons affichés sur Vinted).
let competitorIds = null;
async function getCompetitorIds() {
  if (competitorIds && Date.now() - competitorIds.at < 120_000) return competitorIds.ids;
  if (!(await sb.getSession())) return [];
  const rows = await sb.rpc("aliedge_trackers").catch(() => []);
  const ids = (rows || []).filter((t) => new Date(t.expires_at).getTime() > Date.now()).map((t) => `${t.market}:${t.seller_id}`);
  competitorIds = { at: Date.now(), ids };
  return ids;
}

async function addTracker({ sellerId, market = "fr", label = null }) {
  if (!(await sb.getSession())) throw new sb.ApiError("Connecte-toi à AliEdge pour suivre un vendeur.", 401, "auth");
  const id = Number(sellerId);
  if (!Number.isFinite(id) || id <= 0) throw new sb.ApiError("Profil Vinted introuvable.", 400, "invalid");
  let trackerId;
  try {
    trackerId = await sb.rpc("aliedge_tracker_add", { _seller_id: id, _market: MARKETS[market] ? market : "fr", _label: label ? String(label).slice(0, 80) : null });
  } catch (e) {
    if (/too many/.test(e.message)) throw new sb.ApiError("Tu suis déjà 30 concurrents : retires-en un avant d'en ajouter.", 400, "limit");
    throw e;
  }
  competitorIds = null;
  // Premier relevé tout de suite, dressing complet : c'est la photo de départ (annonces en ligne et déjà vendues).
  (async () => {
    const items = await vinted.sellerItems(id, market, { pages: 10 });
    if (items.length) await reportWardrobe(id, market, items);
    const { ae_fullscan: full = {} } = await chrome.storage.local.get("ae_fullscan");
    full[`${market}:${id}`] = Date.now();
    await chrome.storage.local.set({ ae_fullscan: full });
  })().catch(() => { /* le prochain passage automatique s'en chargera */ });
  return { id: trackerId };
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "remote") { refreshRemote().then(() => reportHealth()).catch(() => {}); }
  if (a.name === "community") { flushErrors().catch(() => {}); if (remote.community_enabled !== "off") vinted.inBackground(communityCheck).catch(() => {}); checkForUpdate().catch(() => {}); }
  if (a.name === "radar") vinted.inBackground(radarTick).catch(() => {});
  if (a.name === "importq") vinted.inBackground(importQueueTick).catch(() => {});
  if (a.name === "watch") refreshWatches();
});

async function reportWardrobe(sellerId, market, items) {
  return sb.rpc("aliedge_report_wardrobe", {
    _seller_id: Number(sellerId), _market: market,
    _items: items.slice(0, 1000).map((i) => ({ vinted_id: i.vinted_id, status: i.status, price: i.price, title: i.title, brand: i.brand, size: i.size, photo_url: i.photo_url, url: i.url, favourites: i.favourites, listed_at: i.listed_at })),
  });
}

// Profil Vinted ouvert par le membre : son dressing met à jour les annonces suivies.
const wardrobeSeen = new Map();
async function reportMember({ sellerId, market, items }) {
  const settings = await getSettings();
  if (!settings.shareAnalyses || !sellerId || !Array.isArray(items) || !(await sb.getSession())) return {};
  const last = wardrobeSeen.get(sellerId);
  if (last && Date.now() - last < 3 * 3600_000) return {};
  wardrobeSeen.set(sellerId, Date.now());
  if (wardrobeSeen.size > 300) wardrobeSeen.delete(wardrobeSeen.keys().next().value);
  const clean = items.map((it) => ({ ...vinted.normaliseItem(it, market), status: vinted.statusFromJson(it) })).filter((i) => i.vinted_id);
  return reportWardrobe(sellerId, market, clean).catch(() => ({}));
}

// Annonces vues sur Vinted (statut lu sur la page de l'annonce).
const reported = new Map();
async function reportVintedItem(item, raw = null) {
  const settings = await getSettings();
  if (!settings.shareAnalyses || !item?.vinted_id) return;
  if (raw && Number(raw.id) === Number(item.vinted_id)) {
    // Détails complets lus sur la page : vendeur, marque, taille, favoris, date de mise en ligne.
    const n = vinted.normaliseItem(raw, item.market);
    item = { ...n, url: item.url || n.url, status: vinted.statusFromJson(raw), visited: true };
  } else {
    if (!item.status) return;
    item = { ...item, visited: true };
  }
  const last = reported.get(item.vinted_id);
  if (last && Date.now() - last < 6 * 3600_000) return;
  if (!(await sb.getSession())) return;
  reported.set(item.vinted_id, Date.now());
  if (reported.size > 500) reported.delete(reported.keys().next().value);
  await sb.rpc("aliedge_report_items", { _items: [item] }).catch(() => {});
}


// ───────────────────────── Catalogue : ajout des produits d'une page de résultats (AliExpress, Temu, Shein)

/** Lit les cartes produit visibles sur la page (aucune requête en plus : seulement ce que la page affiche). */
function readProductCards() {
  const pats = [
    ["aliexpress", /^https:\/\/[a-z.]*aliexpress\.[a-z.]+\/item\/(\d+)\.html/i],
    ["temu", /^https:\/\/(?:www\.)?temu\.com\/[^?#]*-g-(\d+)\.html/i],
    ["shein", /^https:\/\/[a-z.]*shein\.[a-z.]+\/[^?#]*-p-(\d+)(?:-cat-\d+)?\.html/i],
  ];
  const out = new Map();
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    for (const [platform, re] of pats) {
      const m = href.match(re);
      if (!m) continue;
      const key = `${platform}:${m[1]}`;
      if (out.has(key)) break;
      let card = a;
      for (let i = 0; i < 6 && card.parentElement; i++) {
        if (card.querySelector("img") && /\d[.,]\d{2}\s?€|€\s?\d/.test(card.textContent || "")) break;
        card = card.parentElement;
      }
      const img = card.querySelector("img");
      let src = img ? (img.currentSrc || img.getAttribute("src") || img.dataset?.src || "") : "";
      if (src.startsWith("//")) src = `https:${src}`;
      const title = clean(a.getAttribute("title") || card.querySelector("[title]")?.getAttribute("title") || img?.alt || a.textContent || card.querySelector("h1,h2,h3")?.textContent);
      const pm = clean(card.textContent).match(/(\d{1,4}[.,]\d{2})\s?€|€\s?(\d{1,4}[.,]\d{2})/);
      const price = pm ? Number((pm[1] || pm[2]).replace(",", ".")) : null;
      if (title.length >= 8 && title.length <= 400) out.set(key, { platform, source_id: m[1], url: href.split(/[?#]/)[0], title: title.slice(0, 300), image_url: /^https:\/\//.test(src) ? src : null, price, category: null });
      break;
    }
  }
  return [...out.values()].slice(0, 120);
}

async function importPage() {
  if (!(await sb.getSession())) throw new sb.ApiError("Connecte-toi pour ajouter des produits au catalogue.", 401, "auth");
  // Onglet de la page fournisseur : l'onglet actif de la fenêtre (le panneau latéral n'est pas un onglet).
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || /^chrome-extension:/.test(tab.url || "")) [tab] = await chrome.tabs.query({ active: true, url: ["https://*.aliexpress.com/*", "https://*.aliexpress.fr/*", "https://*.aliexpress.us/*", "https://*.temu.com/*", "https://*.shein.com/*", "https://*.shein.fr/*"] });
  let host = "";
  try { host = new URL(tab?.url || "").hostname; } catch { /* onglet sans adresse */ }
  if (!tab?.id || !/(^|\.)(aliexpress\.[a-z.]+|temu\.com|shein\.[a-z.]+)$/.test(host)) throw new sb.ApiError("Ouvre une page de résultats AliExpress, Temu ou Shein (recherche, catégorie ou meilleures ventes), puis réessaie.", 400, "page");
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProductCards });
  const cards = res?.result || [];
  if (!cards.length) throw new sb.ApiError("Aucun produit lisible sur cette page. Fais défiler la liste pour charger les produits, puis réessaie.", 400, "empty");
  let added = 0;
  for (let i = 0; i < cards.length; i += 20) {
    added += Number(await sb.rpc("aliedge_seen_products", { _products: cards.slice(i, i + 20) }).catch(() => 0)) || 0;
  }
  // Recherche Vinted de chaque produit ajouté, 2 par minute (garde-fou du compte) : il apparaît au catalogue dès ses annonces trouvées.
  const { ae_import_queue: q = [] } = await chrome.storage.local.get("ae_import_queue");
  const keys = new Set(q.map((x) => `${x.platform}:${x.source_id}`));
  const next = [...q, ...cards.filter((c) => !keys.has(`${c.platform}:${c.source_id}`))].slice(0, 200);
  await chrome.storage.local.set({ ae_import_queue: next, ae_import_total: next.length });
  chrome.alarms.create("importq", { periodInMinutes: 1, delayInMinutes: 0.05 });
  return { found: cards.length, added, queued: next.length };
}

let importRunning = false;
async function importQueueTick() {
  if (importRunning) return;
  importRunning = true;
  try {
    const { ae_import_queue: q = [] } = await chrome.storage.local.get("ae_import_queue");
    if (!q.length || !(await sb.getSession())) { chrome.alarms.clear("importq"); return; }
    const market = (await getSettings()).market || "fr";
    const batch = q.slice(0, 2);
    let done = 0;
    for (const c of batch) {
      try {
        const { items } = await vinted.searchText(buildQuery(c.title), { market });
        const good = items.filter((i) => i.relevance >= 0.5).sort((a, b) => b.relevance - a.relevance).slice(0, 40);
        await sb.rpc("aliedge_contribute", {
          _product: { platform: c.platform, source_id: c.source_id, url: c.url, title: c.title, image_url: c.image_url, price: c.price, currency: "EUR", category: c.category },
          _items: good.map((i) => ({ vinted_id: i.vinted_id, market, title: i.title, brand: i.brand, size: i.size, condition: i.condition, price: i.price, currency: i.currency, photo_url: i.photo_url, url: i.url, favourites: i.favourites, seller_id: i.seller_id, status: "active" })),
        });
        done++;
      } catch (e) {
        if (STOP_CODES.has(e.code)) break; // pause ou budget : on reprend à la minute suivante
        done++; // produit illisible : on passe au suivant
      }
    }
    const left = q.slice(done);
    await chrome.storage.local.set({ ae_import_queue: left });
    if (!left.length) { chrome.alarms.clear("importq"); await chrome.storage.local.remove("ae_import_total"); }
    broadcast({ type: "import:progress" });
  } finally { importRunning = false; }
}

// ───────────────────────── Catalogue : ajout d'annonces Vinted par leur lien (données réelles)

async function importVintedLinks(links) {
  if (!(await sb.getSession())) throw new sb.ApiError("Connecte-toi pour ajouter des annonces.", 401, "auth");
  const found = [];
  for (const raw of String(links || "").split(/[\s,;]+/).filter(Boolean).slice(0, 20)) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    const m = u.hostname.match(/(?:^|\.)vinted\.([a-z.]+)$/);
    const id = u.pathname.match(/\/items\/(\d+)/)?.[1];
    if (!m || !id) continue;
    const market = Object.keys(MARKETS).find((k) => MARKETS[k].host.endsWith(`vinted.${m[1]}`)) || "fr";
    found.push({ id, market });
  }
  if (!found.length) throw new sb.ApiError("Colle un ou plusieurs liens d'annonces Vinted (https://www.vinted.fr/items/…).", 400, "links");
  const items = [];
  const failed = [];
  for (const { id, market } of found) {
    try {
      const it = await vinted.itemDetails(id, market);
      if (it?.vinted_id) items.push(it); else failed.push(id);
    } catch (e) {
      failed.push(id);
      if (["paused", "blocked", "rate_limited"].includes(e.code)) break;
    }
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
  if (items.length) await sb.rpc("aliedge_report_items", { _items: items });
  return { added: items.length, sold: items.filter((i) => i.status === "sold").length, failed: failed.length };
}

// ───────────────────────── Barapics en API (même compte, mêmes crédits)

async function barapics(body) {
  const session = await sb.getSession();
  if (!session) throw new sb.ApiError("Connecte-toi pour créer des photos.", 401, "auth");
  let res;
  try {
    res = await fetch(`${SITE_URL}/api/public/aliedge-photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new sb.ApiError("Barapics ne répond pas. Vérifie ta connexion et réessaie.", 0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new sb.ApiError(data.error || "Création impossible pour le moment.", res.status, data.code || (res.status === 402 ? "quota" : ""));
  return data;
}


// ───────────────────────── Barapics : lecture d'une fiche produit dans le navigateur du membre
// Quand le site du fournisseur bloque la lecture côté serveur (Shein, Temu…), Barapics demande à AliEdge
// d'ouvrir la fiche en arrière-plan dans le navigateur du membre et d'en lire le titre, le prix et les photos.

function waitTabComplete(tabId, timeout = 25_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); clearTimeout(t); resolve(ok); } };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") finish(true); };
    const t = setTimeout(() => finish(false), timeout);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(true); }).catch(() => finish(false));
  });
}

async function readProductForBarapics(url) {
  if (typeof url !== "string" || !/^https:\/\//.test(url) || !detectPlatform(url)) throw new Error("Lien de fiche produit AliExpress, Temu ou Shein attendu.");
  const id = sourceIdFromUrl(url);
  const tabs = await chrome.tabs.query({});
  let tab = tabs.find((t) => t.url && detectPlatform(t.url) && sourceIdFromUrl(t.url) === id && !t.discarded);
  let opened = false;
  if (!tab) {
    tab = await chrome.tabs.create({ url, active: false });
    opened = true;
    await waitTabComplete(tab.id);
  }
  try {
    let p = null;
    for (let i = 0; i < 10; i++) {
      p = await currentProduct(tab.id).catch(() => null);
      if (p?.title && p.images?.length) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    if (!p?.title || !p.images?.length) throw new Error("La fiche n'a pas pu être lue (vérification anti-robot ?). Ouvre-la dans un onglet, puis réessaie.");
    const price = p.price != null ? `${Number(p.price).toFixed(2).replace(".", ",")} ${p.currency === "EUR" ? "€" : p.currency}` : "";
    return { title: p.title, price, images: (p.images || []).filter((u) => /^https:\/\//.test(u)).slice(0, 12), url: p.url };
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  let origin = "";
  try { origin = new URL(sender.url || sender.origin || "").hostname; } catch { /* inconnu */ }
  if (!/^(www\.)?barapics\.com$/.test(origin)) return false;
  if (msg?.type === "barapics:ping") { sendResponse({ ok: true, version: chrome.runtime.getManifest().version }); return false; }
  if (msg?.type === "barapics:readProduct") {
    readProductForBarapics(msg.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e?.message || "Lecture impossible." }));
    return true;
  }
  return false;
});

// ───────────────────────── Messages

const handlers = {
  "auth:state": async () => ({ me: await me(true), settings: await getSettings() }),
  "auth:signIn": async ({ email, password }) => { await sb.signIn(email, password); return { me: await me(true) }; },
  "auth:signUp": async ({ email, password, marketing }) => {
    const r = await sb.signUp(email, password, marketing);
    return { confirm: r.confirm, me: r.session ? await me(true) : null };
  },
  "auth:recover": async ({ email }) => { await sb.recover(email); return {}; },
  "auth:google": async () => { await sb.signInWithGoogle(); return { me: await me(true) }; },
  "auth:signOut": async () => { await sb.signOut(); meCache = { at: 0, value: null }; return {}; },
  "settings:set": async ({ patch }) => ({ settings: await setSettings(patch) }),
  "product:current": async () => currentProduct(),
  "analyze": async (msg) => runAnalysis(msg),
  "recompute": async (msg) => recompute(msg),
  "history:list": async () => getList(HISTORY_KEY),
  "history:clear": async () => { await chrome.storage.local.set({ [HISTORY_KEY]: [] }); return []; },
  "watch:list": async () => getList(WATCH_KEY),
  "watch:add": async ({ entry }) => addWatch(entry),
  "watch:remove": async ({ key }) => removeWatch(key),
  "catalog": async ({ filters = {} }) => sb.rpc("aliedge_catalog", {
    _search: filters.search || null, _platform: filters.platform || null, _category: filters.category || null,
    _sort: filters.sort || "sold", _min_sold: filters.minSold || 0, _limit: filters.limit || 30, _offset: filters.offset || 0,
  }),
  "catalog:items": async ({ productId }) => sb.rpc("aliedge_product_items", { _product_id: productId }),
  "saved:list": async () => sb.select("aliedge_saved", "select=product_id,note,created_at&order=created_at.desc"),
  "saved:add": async ({ productId }) => sb.insert("aliedge_saved", { product_id: productId }, true),
  "saved:remove": async ({ productId }) => sb.remove("aliedge_saved", `product_id=eq.${encodeURIComponent(productId)}`),
  "vinted:item": async ({ item, raw }) => { await reportVintedItem(item, raw); return {}; },
  "vinted:member": async (msg) => reportMember(msg),
  "tracker:add": async (msg) => addTracker(msg),
  "radar:state": async () => { chrome.action.setBadgeText({ text: "" }); const st = await radarState(); return { filters: st.filters, feed: st.feed }; },
  "radar:save": async (msg) => { const st = await radarSave(msg); return { filters: st.filters, feed: st.feed }; },
  "radar:remove": async ({ id }) => { const st = await radarState(); st.filters = st.filters.filter((f) => f.id !== id); delete st.seen[id]; st.feed = st.feed.filter((x) => x.filterId !== id); await saveRadar(st); await syncRadarAlarm(st); return { filters: st.filters, feed: st.feed }; },
  "guard:status": () => vinted.guardStatus(),
  "update:state": async () => {
    const r = await chrome.storage.local.get(["ae_update_ready", "ae_whatsnew"]);
    return { version: chrome.runtime.getManifest().version, ready: r.ae_update_ready || null, whatsnew: r.ae_whatsnew || null };
  },
  "update:apply": async () => { setTimeout(() => chrome.runtime.reload(), 300); return {}; },
  "update:seen": async () => { await chrome.storage.local.remove("ae_whatsnew"); return {}; },
  "radar:tick": async () => { await vinted.inBackground(radarTick); const st = await radarState(); return { filters: st.filters, feed: st.feed }; },
  "radar:clear": async () => { const st = await radarState(); st.feed = []; await saveRadar(st); return { filters: st.filters, feed: [] }; },
  "tracker:list": async () => sb.rpc("aliedge_trackers"),
  "tracker:items": async ({ id }) => sb.rpc("aliedge_tracker_items", { _id: id }),
  "tracker:recap": async ({ id }) => sb.rpc("aliedge_competitor_recap", { _id: id }),
  "competitor:ids": async () => getCompetitorIds(),
  // Second clic sur « Concurrent suivi » (sur Vinted) : le suivi s'arrête.
  "competitor:remove": async ({ sellerId, market }) => {
    const rows = await sb.rpc("aliedge_trackers");
    const t = (rows || []).find((x) => Number(x.seller_id) === Number(sellerId) && x.market === (MARKETS[market] ? market : "fr") && new Date(x.expires_at).getTime() > Date.now());
    if (t) await sb.rpc("aliedge_tracker_remove", { _id: t.id });
    competitorIds = null;
    return { removed: !!t };
  },
  "product:changed": async (_msg, sender) => { if (sender.tab?.active) broadcast({ type: "tab:changed" }); return {}; },
  // Bouton Barapics des fiches produit : ouvre Barapics avec le lien du produit, à côté de l'onglet en cours.
  "open:barapics": async ({ url }, sender) => {
    let u;
    try { u = new URL(String(url)); } catch { throw new sb.ApiError("Lien du produit illisible.", 400, "invalid"); }
    if (!/(^|\.)(aliexpress\.(com|fr|us)|temu\.com|shein\.(com|fr))$/.test(u.hostname)) throw new sb.ApiError("Seules les fiches AliExpress, Temu et Shein sont acceptées.", 400, "invalid");
    const target = `https://barapics.com/app?url=${encodeURIComponent(u.toString())}&utm_source=aliedge&utm_medium=extension&utm_campaign=product_button`;
    await chrome.tabs.create({ url: target, ...(sender.tab ? { index: sender.tab.index + 1, openerTabId: sender.tab.id } : {}) });
    return {};
  },
  "remote:message": async () => (remote.message ? String(remote.message).slice(0, 300) : null),
  "tracker:remove": async ({ id }) => { competitorIds = null; return sb.rpc("aliedge_tracker_remove", { _id: id }); },
  "community:stats": async () => sb.publicRpc("aliedge_public_stats"),
  "catalog:importPage": async () => importPage(),
  "catalog:importStatus": async () => { const r = await chrome.storage.local.get(["ae_import_queue", "ae_import_total"]); return { left: (r.ae_import_queue || []).length, total: r.ae_import_total || 0 }; },
  "catalog:importVinted": async ({ links }) => importVintedLinks(links),
  "barapics": async ({ body }) => barapics(body),
  "alerts:get": async () => { const r = await barapics({ action: "alerts:get" }); await chrome.storage.local.set({ ae_alerts: r }); return r; },
  "alerts:set": async ({ patch }) => { await barapics({ action: "alerts:set", ...patch }); const r = await barapics({ action: "alerts:get" }); await chrome.storage.local.set({ ae_alerts: r }); return r; },
  "alerts:telegramLink": async () => barapics({ action: "alerts:telegramLink" }),
  "alerts:test": async () => barapics({ action: "alerts:send", test: true, alerts: [] }),
  "picks": async () => sb.rpc("aliedge_picks_feed"),
  "challenge": async () => sb.rpc("aliedge_skool_challenge"),
  "radar:limit": async () => ({ max: await radarLimit() }),
  "trends": async ({ days = 30 }) => sb.rpc("aliedge_market_trends", { _days: days }),
  "product:history": async ({ productId }) => sb.rpc("aliedge_product_history", { _product_id: productId }),
  "pending:take": async () => {
    const r = await chrome.storage.session.get("ae_pending");
    await chrome.storage.session.remove("ae_pending");
    const p = r.ae_pending;
    return p && Date.now() - p.at < 60_000 ? p : null;
  },
  "open:panel": async (msg, sender) => {
    if (sender.tab?.id != null) {
      // sidePanel.open doit partir avant tout await pour garder le geste de l'utilisateur.
      const opening = chrome.sidePanel.open({ tabId: sender.tab.id });
      await chrome.storage.session.set({ ae_pending: msg.route === "concurrents" ? { route: "concurrents", at: Date.now() } : { analyze: true, at: Date.now() } });
      await opening;
      broadcast({ type: "pending" });
    }
    return {};
  },
  "open:tab": async ({ hash = "" }) => { await chrome.tabs.create({ url: chrome.runtime.getURL(`app/app.html?mode=tab#${hash}`) }); return {}; },
  "settings:pill": async () => ({ showPill: (await getSettings()).showPill }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  // Les pages web ne peuvent appeler que les messages prévus pour les scripts de contenu.
  const fromContent = sender.tab && !sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
  if (fromContent && !["open:panel", "vinted:item", "vinted:member", "settings:pill", "tracker:add", "competitor:ids", "competitor:remove", "open:barapics", "product:changed"].includes(msg.type)) return false;
  Promise.resolve(h(msg, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => {
      if (!e?.code || !["auth", "limit", "invalid", "paused", "budget", "rate_limited", "blocked", "empty_query"].includes(e.code)) noteError(msg.type, e);
      sendResponse({ ok: false, error: e?.message || "Erreur inattendue.", code: e?.code || "" });
    });
  return true;
});
