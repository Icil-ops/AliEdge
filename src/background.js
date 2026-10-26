// AliEdge — service worker : session, analyses, catalogue, suivis, détection des ventes.
import { DEFAULT_SETTINGS, MARKETS } from "./config.js";
import * as sb from "./lib/supabase.js";
import * as vinted from "./lib/vinted.js";
import { analyse, toEur, parsePrice, round2 } from "./lib/pricing.js";
import { buildQuery, guessCategory } from "./lib/text.js";
import { extractProduct, detectPlatform, sourceIdFromUrl, canonicalUrl } from "./lib/extract.js";

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
  await syncRadarAlarm();
}

// ───────────────────────── Installation

async function setup() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch { /* Chrome < 116 */ }
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ae-search", title: "Chercher « %s » sur Vinted avec AliEdge", contexts: ["selection"] });
  });
  await syncAlarms();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await setup();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html?mode=tab#/compte?welcome=1") });
});
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

  const { items: found, total } = await vinted.searchText(query, { market, condition });
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
    total, lowConfidence, productId,
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

async function communityCheck() {
  const settings = await getSettings();
  if (!(await sb.getSession())) return;
  // 1) Par vendeur : un dressing lu = toutes ses annonces suivies revérifiées d'un coup.
  let sellers = [];
  try { sellers = await sb.rpc("aliedge_sellers_to_check", { _limit: 4 }); } catch { /* fonction absente : on passe aux annonces */ }
  for (const { seller_id, market } of sellers || []) {
    try {
      const items = await vinted.sellerItems(seller_id, market);
      if (items.length) await reportWardrobe(seller_id, market, items);
    } catch (e) {
      if (e.code === "blocked" || e.code === "rate_limited") return;
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
      if (e.code === "blocked" || e.code === "rate_limited") break;
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
  try { rows = await sb.rpc("aliedge_products_to_refresh", { _limit: 2 }); } catch { return; }
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
      if (e.code === "blocked" || e.code === "rate_limited") return;
    }
    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
  }
}

// ───────────────────────── Radar : nouvelles annonces Vinted selon des filtres (sans achat automatique)

const RADAR_KEY = "ae_radar";          // { filters: [...], feed: [...], seen: { [filterId]: [ids] } }
const RADAR_MAX_FILTERS = 5;
async function radarState() {
  const r = await chrome.storage.local.get(RADAR_KEY);
  return { filters: [], feed: [], seen: {}, ...(r[RADAR_KEY] || {}) };
}
async function saveRadar(st) { await chrome.storage.local.set({ [RADAR_KEY]: st }); }
async function syncRadarAlarm(st) {
  const active = (st || (await radarState())).filters.some((f) => f.active);
  if (active) chrome.alarms.create("radar", { periodInMinutes: 0.5, delayInMinutes: 0.1 });
  else chrome.alarms.clear("radar");
}

let radarRunning = false;
async function radarTick() {
  if (radarRunning) return;
  radarRunning = true;
  try {
    const st = await radarState();
    const active = st.filters.filter((f) => f.active).slice(0, RADAR_MAX_FILTERS);
    let fresh = 0;
    for (const f of active) {
      let items;
      try { items = await vinted.searchNewest({ query: f.query, market: f.market, condition: f.condition, priceMin: f.priceMin, priceMax: f.priceMax }); }
      catch (e) { if (e.code === "blocked" || e.code === "rate_limited") break; continue; }
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
    if (fresh) {
      const prev = Number((await chrome.action.getBadgeText({})) || 0);
      chrome.action.setBadgeBackgroundColor({ color: "#0fa968" });
      chrome.action.setBadgeText({ text: String(Math.min(99, prev + fresh)) });
      broadcast({ type: "radar:new" });
    }
  } finally { radarRunning = false; }
}
const eur0 = (n) => `${Number(n).toFixed(2).replace(".", ",")} €`;

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith("radar-")) return;
  const vid = id.slice(6);
  const st = await radarState();
  const it = st.feed.find((x) => String(x.vinted_id) === vid);
  if (it?.url) chrome.tabs.create({ url: it.url });
  chrome.notifications.clear(id);
});

async function radarSave({ filter }) {
  const st = await radarState();
  const f = {
    id: filter.id || `f${Date.now().toString(36)}`,
    name: String(filter.name || filter.query || "Filtre").slice(0, 40),
    query: String(filter.query || "").slice(0, 120),
    market: MARKETS[filter.market] ? filter.market : "fr",
    condition: ["all", "new", "very_good"].includes(filter.condition) ? filter.condition : "all",
    priceMin: filter.priceMin === "" || filter.priceMin == null ? null : Math.max(0, Number(filter.priceMin) || 0),
    priceMax: filter.priceMax === "" || filter.priceMax == null ? null : Math.max(0, Number(filter.priceMax) || 0),
    notify: filter.notify !== false,
    active: filter.active !== false,
  };
  if (!f.query) throw new sb.ApiError("Indique des mots-clés à surveiller.", 400, "invalid");
  const i = st.filters.findIndex((x) => x.id === f.id);
  if (i >= 0) st.filters[i] = f;
  else {
    if (st.filters.length >= RADAR_MAX_FILTERS) throw new sb.ApiError(`${RADAR_MAX_FILTERS} filtres au maximum : supprime-en un avant d'en ajouter.`, 400, "limit");
    st.filters.push(f);
    st.seen[f.id] = [];
  }
  await saveRadar(st);
  await syncRadarAlarm(st);
  vinted.inBackground(radarTick).catch(() => {});
  return st;
}

// ───────────────────────── Trackers de vendeurs (14 jours)

async function addTracker({ sellerId, market = "fr", label = null }) {
  if (!(await sb.getSession())) throw new sb.ApiError("Connecte-toi à AliEdge pour suivre un vendeur.", 401, "auth");
  const id = Number(sellerId);
  if (!Number.isFinite(id) || id <= 0) throw new sb.ApiError("Profil Vinted introuvable.", 400, "invalid");
  let trackerId;
  try {
    trackerId = await sb.rpc("aliedge_tracker_add", { _seller_id: id, _market: MARKETS[market] ? market : "fr", _label: label ? String(label).slice(0, 80) : null });
  } catch (e) {
    if (/too many/.test(e.message)) throw new sb.ApiError("Tu suis déjà 30 vendeurs : arrête un tracker avant d'en ajouter un.", 400, "limit");
    throw e;
  }
  // Premier relevé tout de suite : c'est la photo de départ du dressing.
  try {
    const items = await vinted.sellerItems(id, market);
    if (items.length) await reportWardrobe(id, market, items);
  } catch { /* le prochain passage automatique s'en chargera */ }
  return { id: trackerId };
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "community") vinted.inBackground(communityCheck).catch(() => {});
  if (a.name === "radar") vinted.inBackground(radarTick).catch(() => {});
  if (a.name === "watch") refreshWatches();
});

async function reportWardrobe(sellerId, market, items) {
  return sb.rpc("aliedge_report_wardrobe", {
    _seller_id: Number(sellerId), _market: market,
    _items: items.slice(0, 200).map((i) => ({ vinted_id: i.vinted_id, status: i.status, price: i.price, title: i.title, photo_url: i.photo_url, url: i.url, favourites: i.favourites })),
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
async function reportVintedItem(item) {
  const settings = await getSettings();
  if (!settings.shareAnalyses || !item?.vinted_id || !item.status) return;
  const last = reported.get(item.vinted_id);
  if (last && Date.now() - last < 6 * 3600_000) return;
  if (!(await sb.getSession())) return;
  reported.set(item.vinted_id, Date.now());
  if (reported.size > 500) reported.delete(reported.keys().next().value);
  await sb.rpc("aliedge_report_items", { _items: [item] }).catch(() => {});
}

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
  "vinted:item": async ({ item }) => { await reportVintedItem(item); return {}; },
  "vinted:member": async (msg) => reportMember(msg),
  "tracker:add": async (msg) => addTracker(msg),
  "radar:state": async () => { chrome.action.setBadgeText({ text: "" }); const st = await radarState(); return { filters: st.filters, feed: st.feed }; },
  "radar:save": async (msg) => { const st = await radarSave(msg); return { filters: st.filters, feed: st.feed }; },
  "radar:remove": async ({ id }) => { const st = await radarState(); st.filters = st.filters.filter((f) => f.id !== id); delete st.seen[id]; st.feed = st.feed.filter((x) => x.filterId !== id); await saveRadar(st); await syncRadarAlarm(st); return { filters: st.filters, feed: st.feed }; },
  "radar:tick": async () => { await vinted.inBackground(radarTick); const st = await radarState(); return { filters: st.filters, feed: st.feed }; },
  "radar:clear": async () => { const st = await radarState(); st.feed = []; await saveRadar(st); return { filters: st.filters, feed: [] }; },
  "tracker:list": async () => sb.rpc("aliedge_trackers"),
  "tracker:items": async ({ id }) => sb.rpc("aliedge_tracker_items", { _id: id }),
  "tracker:remove": async ({ id }) => sb.rpc("aliedge_tracker_remove", { _id: id }),
  "community:stats": async () => sb.publicRpc("aliedge_public_stats"),
  "pending:take": async () => {
    const r = await chrome.storage.session.get("ae_pending");
    await chrome.storage.session.remove("ae_pending");
    const p = r.ae_pending;
    return p && Date.now() - p.at < 60_000 ? p : null;
  },
  "open:panel": async (_msg, sender) => {
    if (sender.tab?.id != null) {
      // sidePanel.open doit partir avant tout await pour garder le geste de l'utilisateur.
      const opening = chrome.sidePanel.open({ tabId: sender.tab.id });
      await chrome.storage.session.set({ ae_pending: { analyze: true, at: Date.now() } });
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
  if (fromContent && !["open:panel", "vinted:item", "vinted:member", "settings:pill", "tracker:add"].includes(msg.type)) return false;
  Promise.resolve(h(msg, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e?.message || "Erreur inattendue.", code: e?.code || "" }));
  return true;
});
