// Accès à Vinted avec la session du membre.
// 1) requête directe depuis l'extension (cookies Vinted inclus) ;
// 2) si Vinted la refuse, la même requête est exécutée dans un onglet Vinted (même origine),
//    ouvert en arrière-plan si besoin puis refermé.
import { MARKETS } from "../config.js";
import { relevance } from "./text.js";

const BRIDGE_IDLE_MS = 90_000;
let bridgeTab = null;      // { id, market, owned }
let bridgeTimer = null;
let directBlockedUntil = 0;
// Tâches de fond : jamais d'onglet ouvert pour elles (on réutilise un onglet Vinted déjà ouvert, sinon on attend).
let quiet = false;
export async function inBackground(fn) {
  quiet = true;
  try { return await fn(); } finally { quiet = false; }
}

// ── Garde-fou : protège le compte Vinted du membre.
// Les tâches de fond (catalogue, suivis, radar) ont un budget strict, un espacement aléatoire
// et s'arrêtent net (de 15 min à 12 h) dès que Vinted montre le moindre signe de gêne.
// Les recherches lancées à la main ne sont jamais bloquées par le budget, seulement par une pause en cours.
export const BUDGET = { perMinute: 4, perHour: 90, perDay: 700, gapMin: 4000, gapMax: 9000 };
const BUDGET_LIMITS = { perHour: [10, 120], perDay: [50, 900] };
/** Réglages à distance (admin Barapics) : toujours bornés ici, l'extension ne dépasse jamais ses limites de sécurité. */
export function applyRemoteBudget(cfg = {}) {
  for (const [k, key] of [["perHour", "budget_per_hour"], ["perDay", "budget_per_day"]]) {
    const v = Number(cfg[key]);
    const [lo, hi] = BUDGET_LIMITS[k];
    BUDGET[k] = Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, Math.round(v))) : { perHour: 90, perDay: 700 }[k];
  }
}
const COOLDOWNS = [15, 60, 180, 720]; // minutes
const GUARD_KEY = "ae_guard";
let lastBg = 0;
async function guardState() {
  const r = await chrome.storage.local.get(GUARD_KEY).catch(() => ({}));
  return { hits: [], pauseUntil: 0, strikes: 0, okStreak: 0, ...(r[GUARD_KEY] || {}) };
}
async function saveGuard(g) { await chrome.storage.local.set({ [GUARD_KEY]: g }).catch(() => {}); }
export async function guardStatus() {
  const g = await guardState(); const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const p = g.pauses?.day === today ? g.pauses : { n: 0, reason: null };
  return { pausedUntil: g.pauseUntil > now ? g.pauseUntil : 0, lastHour: g.hits.filter((t) => t > now - 3600e3).length, lastDay: g.hits.length, budget: BUDGET, pausesToday: p.n, lastPauseReason: p.reason };
}
async function beforeRequest() {
  const g = await guardState(); const now = Date.now();
  if (g.pauseUntil > now) throw new VintedError("Pause de protection : AliEdge laisse Vinted tranquille un moment.", "paused");
  if (!quiet) return;
  g.hits = g.hits.filter((t) => t > now - 86400e3);
  const inLast = (ms) => g.hits.filter((t) => t > now - ms).length;
  if (inLast(60e3) >= BUDGET.perMinute || inLast(3600e3) >= BUDGET.perHour || g.hits.length >= BUDGET.perDay)
    throw new VintedError("Budget de fond atteint, reprise plus tard.", "budget");
  const wait = lastBg + BUDGET.gapMin + Math.random() * (BUDGET.gapMax - BUDGET.gapMin) - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastBg = Date.now();
  g.hits.push(lastBg);
  await saveGuard(g);
}
async function afterResponse(status, suspicious = false) {
  const g = await guardState();
  // 401 = session Vinted expirée (pas un signal de blocage) : on ne met pas le compte en pause pour ça.
  if (status === 403 || status === 429 || suspicious) {
    const min = COOLDOWNS[Math.min(g.strikes, COOLDOWNS.length - 1)];
    g.pauseUntil = Date.now() + min * 60e3 * (0.9 + Math.random() * 0.2);
    g.strikes += 1; g.okStreak = 0;
    const today = new Date().toISOString().slice(0, 10);
    g.pauses = { day: today, n: (g.pauses?.day === today ? g.pauses.n : 0) + 1, reason: suspicious ? "page suspecte" : `HTTP ${status}` };
  } else if (status >= 200 && status < 300 || status === 404) {
    g.okStreak += 1;
    if (g.okStreak >= 50 && g.strikes > 0) { g.strikes -= 1; g.okStreak = 0; }
  } else return;
  await saveGuard(g);
}

export class VintedError extends Error {
  constructor(message, code = "") { super(message); this.code = code; }
}

function host(market) {
  return (MARKETS[market] || MARKETS.fr).host;
}

async function directFetch(url, kind) {
  if (Date.now() < directBlockedUntil) return null;
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: kind === "json" ? "application/json, text/plain, */*" : "text/html" },
    });
    if (res.status === 404) { await afterResponse(404); return { status: 404, body: null }; }
    if (!res.ok) {
      if ([401, 403, 429].includes(res.status)) directBlockedUntil = Date.now() + 5 * 60_000;
      if (res.status === 429) await afterResponse(429);
      return null;
    }
    await afterResponse(res.status);
    if (kind === "json") {
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) { directBlockedUntil = Date.now() + 5 * 60_000; return null; }
      return { status: res.status, body: await res.json() };
    }
    return { status: res.status, body: await res.text() };
  } catch {
    return null;
  }
}

function waitComplete(tabId, timeout = 20_000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); clearTimeout(t); resolve(ok); } };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") finish(true); };
    const t = setTimeout(() => finish(false), timeout);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(true); }).catch(() => finish(false));
  });
}

async function getBridgeTab(market) {
  const h = host(market);
  if (bridgeTab) {
    try {
      const t = await chrome.tabs.get(bridgeTab.id);
      if (t.url && new URL(t.url).hostname === h) return t.id;
    } catch { /* onglet fermé */ }
    bridgeTab = null;
  }
  const existing = await chrome.tabs.query({ url: `https://${h}/*` });
  const usable = existing.find((t) => !t.discarded && t.status === "complete") || existing[0];
  if (usable) {
    bridgeTab = { id: usable.id, market, owned: false };
    return usable.id;
  }
  if (quiet) throw new VintedError("Vinted indisponible en arrière-plan pour l'instant.", "blocked");
  const created = await chrome.tabs.create({ url: `https://${h}/`, active: false, pinned: false });
  bridgeTab = { id: created.id, market, owned: true };
  const ok = await waitComplete(created.id);
  if (!ok) throw new VintedError("Vinted ne répond pas. Ouvre vinted.fr dans un onglet puis relance l'analyse.", "bridge_timeout");
  return created.id;
}

function scheduleBridgeClose() {
  clearTimeout(bridgeTimer);
  bridgeTimer = setTimeout(async () => {
    if (bridgeTab?.owned) chrome.tabs.remove(bridgeTab.id).catch(() => {});
    bridgeTab = null;
  }, BRIDGE_IDLE_MS);
}

/** Requête lancée depuis un onglet Vinted (même origine, session de la page). Injectée telle quelle. */
async function pageFetch(u, k) {
  try {
    const r = await fetch(u, { credentials: "include", headers: { Accept: k === "json" ? "application/json, text/plain, */*" : "text/html" } });
    if (r.status === 404) return { status: 404, body: null };
    if (!r.ok) return { status: r.status, error: true };
    return { status: r.status, body: k === "json" ? await r.json() : await r.text() };
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  }
}

async function bridgeFetch(url, kind, market) {
  const tabId = await getBridgeTab(market);
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [url, kind],
    func: pageFetch,
  });
  scheduleBridgeClose();
  let out = res?.result;
  if (out?.error && out.status === 401 && !bridgeFetch.reloaded) {
    // Session Vinted expirée dans l'onglet : on le recharge (Vinted renouvelle sa session) puis on réessaie une fois.
    bridgeFetch.reloaded = true;
    try {
      await chrome.tabs.reload(tabId);
      await waitComplete(tabId);
      await new Promise((r) => setTimeout(r, 1500));
      const [again] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", args: [url, kind], func: pageFetch });
      out = again?.result;
    } finally { setTimeout(() => { bridgeFetch.reloaded = false; }, 60_000); }
  }
  if (!out) throw new VintedError("Vinted n'a pas répondu.", "bridge_empty");
  await afterResponse(out.status || 0);
  if (out.error) {
    if (out.status === 401 || out.status === 403) throw new VintedError("Vinted bloque la recherche. Ouvre vinted.fr, connecte-toi, puis relance.", "blocked");
    if (out.status === 429) throw new VintedError("Vinted limite les recherches. Patiente une minute.", "rate_limited");
    throw new VintedError("Recherche Vinted impossible pour le moment.", "bridge_error");
  }
  return out;
}

async function vFetch(url, kind, market) {
  await beforeRequest();
  const direct = await directFetch(url, kind);
  if (direct) return direct;
  return bridgeFetch(url, kind, market);
}

function num(v) {
  if (v == null) return null;
  if (typeof v === "object") v = v.amount ?? v.value ?? null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}

function listedAt(it, photo) {
  const ts = Number(photo?.high_resolution?.timestamp ?? it.created_at_ts ?? 0);
  if (ts > 1e9 && ts < 1e11) return Math.round(ts);
  const iso = Date.parse(it.created_at || "");
  return Number.isFinite(iso) ? Math.round(iso / 1000) : null;
}

export function normaliseItem(it, market) {
  const photo = it.photo || (Array.isArray(it.photos) ? it.photos[0] : null);
  const thumb = photo?.thumbnails?.find?.((t) => t.type === "thumb310x430")?.url;
  return {
    vinted_id: Number(it.id),
    market,
    title: it.title || "",
    brand: it.brand_title || it.brand || null,
    size: it.size_title || null,
    condition: it.status || it.status_title || null,
    price: num(it.price),
    total_price: num(it.total_item_price),
    currency: (typeof it.price === "object" && it.price?.currency_code) || it.currency || "EUR",
    photo_url: thumb || photo?.url || photo?.full_size_url || null,
    url: it.url || `https://${host(market)}/items/${it.id}`,
    favourites: Number.isFinite(it.favourite_count) ? it.favourite_count : null,
    seller_id: Number(it.user?.id ?? it.user_id ?? it.seller_id) || null,
    seller_login: it.user?.login || null,
    photo_count: Array.isArray(it.photos) ? it.photos.length : null,
    description_length: typeof it.description === "string" ? it.description.length : null,
    views: Number.isFinite(it.view_count) ? it.view_count : null,
    // Mise en ligne : horodatage de la première photo (secondes), à défaut la date de création.
    listed_at: listedAt(it, photo),
  };
}

const CONDITION_IDS = { all: [], new: [6], very_good: [6, 1] };

/** Recherche d'annonces actives par mots-clés. */
export async function searchText(query, { market = "fr", condition = "all", perPage = 96 } = {}) {
  const q = String(query || "").trim();
  if (!q) throw new VintedError("Indique des mots-clés à chercher.", "empty_query");
  const url = new URL(`https://${host(market)}/api/v2/catalog/items`);
  url.searchParams.set("search_text", q);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", "1");
  url.searchParams.set("order", "relevance");
  (CONDITION_IDS[condition] || []).forEach((id) => url.searchParams.append("status_ids[]", String(id)));
  let res = null;
  try { res = await vFetch(url.toString(), "json", market); }
  catch (e) { if (["paused", "budget", "rate_limited"].includes(e.code)) throw e; }
  const raw = Array.isArray(res?.body?.items) ? res.body.items : [];
  let items = raw.map((it) => normaliseItem(it, market)).filter((i) => i.vinted_id && i.price != null);
  let total = res?.body?.pagination?.total_entries ?? items.length;
  if (!items.length) {
    // L'API ne répond pas (session Vinted expirée…) : on lit la page de recherche Vinted elle-même.
    const page = await searchFromPage(q, market).catch(() => []);
    if (page.length) { items = page; total = page.length; }
    else lastSearchIssue = { at: Date.now(), status: res?.status ?? 0, keys: res?.body && typeof res.body === "object" ? Object.keys(res.body).slice(0, 6).join(",") : "" };
  }
  for (const i of items) i.relevance = relevance(q, i.title);
  return { items, total };
}

/** Dernier problème de recherche (pour le diagnostic remonté à l'admin). */
export let lastSearchIssue = null;

/**
 * Secours : page de résultats Vinted lue dans un onglet Vinted. Chaque carte d'annonce porte dans son attribut
 * « title » le titre, la marque, l'état, la taille et le prix (« Sac cuir, marque: Zara, état: Très bon état, 15,00 € »).
 */
async function searchFromPage(q, market) {
  const tabId = await getBridgeTab(market);
  const pageUrl = `https://${host(market)}/catalog?search_text=${encodeURIComponent(q)}&order=relevance`;
  const [res] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN", args: [pageUrl],
    func: async (u) => {
      try {
        const r = await fetch(u, { credentials: "include", headers: { Accept: "text/html" } });
        if (!r.ok) return [];
        const doc = new DOMParser().parseFromString(await r.text(), "text/html");
        const out = [];
        const seen = new Set();
        for (const a of doc.querySelectorAll('a[href*="/items/"]')) {
          const id = Number((a.getAttribute("href") || "").match(/\/items\/(\d+)/)?.[1]);
          if (!id || seen.has(id)) continue;
          const t = a.getAttribute("title") || a.getAttribute("aria-label") || "";
          if (!t) continue;
          seen.add(id);
          const parts = t.split(/,\s+/);
          const field = (re) => (parts.find((x) => re.test(x)) || "").replace(re, "").trim() || null;
          const prices = (t.match(/\d{1,5}(?:[.,]\d{2})?\s?€/g) || []).map((x) => parseFloat(x.replace(/[^\d,.]/g, "").replace(",", ".")));
          const card = a.closest('[data-testid*="grid-item"], [class*="feed-grid__item"]') || a.parentElement;
          const img = card?.querySelector("img");
          out.push({
            id, title: parts[0] || t, brand_title: field(/^(marque|brand|marke|marca|merk)\s*:\s*/i), status: field(/^(état|condition|zustand|estado|stato|staat)\s*:\s*/i),
            size_title: field(/^(taille|size|größe|talla|taglia|maat)\s*:\s*/i), price: prices[0] ?? null,
            photo: img ? { url: img.getAttribute("src") || img.getAttribute("data-src") } : null, url: new URL(a.getAttribute("href"), u).href.split("?")[0],
          });
          if (out.length >= 96) break;
        }
        return out;
      } catch { return []; }
    },
  });
  scheduleBridgeClose();
  return (res?.result || []).map((it) => normaliseItem(it, market)).filter((i) => i.vinted_id && i.price != null);
}

/** Nouvelles annonces pour le Radar : les plus récentes d'abord, avec fourchette de prix. */
/**
 * Lien de recherche Vinted collé par le membre (…/catalog?search_text=…&brand_ids[]=…) → paramètres de l'API.
 * Seuls les filtres de recherche sont repris (marque, catégorie, taille, état, couleur, matière, prix…).
 */
const SEARCH_KEYS = { catalog: "catalog_ids", catalog_ids: "catalog_ids", brand_ids: "brand_ids", size_ids: "size_ids", status_ids: "status_ids",
  color_ids: "color_ids", material_ids: "material_ids", patterns_ids: "patterns_ids", country_ids: "country_ids", city_ids: "city_ids",
  video_game_rating_ids: "video_game_rating_ids", search_text: "search_text", price_from: "price_from", price_to: "price_to", currency: "currency", disposal: "disposal" };
export function parseSearchUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  const m = u.hostname.match(/^(?:www\.)?vinted\.([a-z.]+)$/i);
  if (!m || !/^\/(?:catalog|vetements|brand|[a-z-]+\/catalog)/i.test(u.pathname) && !u.search) return null;
  const tld = m[1].toLowerCase();
  const market = tld === "co.uk" ? "uk" : tld;
  if (!MARKETS[market]) return null;
  const params = {};
  for (const [k, v] of u.searchParams) {
    const key = SEARCH_KEYS[k.replace(/\[\]$/, "")];
    if (!key || v === "") continue;
    const val = String(v).slice(0, 120);
    if (key.endsWith("_ids")) { if (!/^\d{1,12}$/.test(val)) continue; params[key] = params[key] ? `${params[key]},${val}` : val; }
    else if (/^price_/.test(key)) { if (/^\d+(\.\d+)?$/.test(val)) params[key] = val; }
    else params[key] = val;
  }
  // Pages de catégorie (/catalog/2050-vetements) : l'identifiant est dans le chemin.
  const cat = u.pathname.match(/\/catalog\/(\d+)/)?.[1];
  if (cat && !params.catalog_ids) params.catalog_ids = cat;
  const brand = u.pathname.match(/\/brand\/(\d+)/)?.[1];
  if (brand && !params.brand_ids) params.brand_ids = brand;
  if (!Object.keys(params).length) return null;
  return { market, params };
}

export async function searchNewest({ query, market = "fr", condition = "all", priceMin = null, priceMax = null, perPage = 40, params = null }) {
  const url = new URL(`https://${host(market)}/api/v2/catalog/items`);
  if (params && typeof params === "object") for (const [k, v] of Object.entries(params)) if (Object.values(SEARCH_KEYS).includes(k)) url.searchParams.set(k, String(v));
  if (query) url.searchParams.set("search_text", String(query).trim());
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", "1");
  url.searchParams.set("order", "newest_first");
  if (priceMin != null && priceMin !== "") url.searchParams.set("price_from", String(priceMin));
  if (priceMax != null && priceMax !== "") url.searchParams.set("price_to", String(priceMax));
  if (!params?.status_ids) (CONDITION_IDS[condition] || []).forEach((id) => url.searchParams.append("status_ids[]", String(id)));
  const res = await vFetch(url.toString(), "json", market);
  const raw = Array.isArray(res.body?.items) ? res.body.items : [];
  return raw.map((it) => normaliseItem(it, market)).filter((i) => i.vinted_id && i.price != null);
}

/**
 * État d'une annonce à partir de sa page : vendue, active ou retirée.
 * Repose sur le JSON-LD (availability) et, à défaut, sur les champs du flux de la page.
 */
export function parseItemStatus(html) {
  if (html == null) return "closed";
  const ld = html.match(/"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?(\w+)"/i)?.[1];
  if (ld) {
    if (/soldout|outofstock|discontinued/i.test(ld)) return "sold";
    if (/instock|limitedavailability|preorder/i.test(ld)) return "active";
  }
  if (/\\?"item_closing_action\\?"\s*:\s*\\?"sold/i.test(html) || /\\?"is_sold\\?"\s*:\s*true/i.test(html)) return "sold";
  if (/\\?"is_closed\\?"\s*:\s*true/i.test(html)) return "closed";
  if (/\\?"can_buy\\?"\s*:\s*true/i.test(html) || /\\?"is_closed\\?"\s*:\s*false/i.test(html)) return "active";
  return null;
}

/**
 * Statut d'après un objet « item » de l'API Vinted. Une vente n'est comptée que si Vinted
 * l'indique explicitement ; une annonce fermée sans ce motif est « closed ».
 */
export function statusFromJson(it) {
  const closing = String(it?.item_closing_action ?? "").toLowerCase();
  if (closing === "sold" || it?.is_sold === true || String(it?.status ?? "").toLowerCase() === "sold") return "sold";
  if (it?.is_closed === true || it?.is_hidden === true || it?.is_draft === true) return "closed";
  return "active";
}

/**
 * Dressing d'un vendeur (une requête pour toutes ses annonces récentes, vendues comprises
 * quand le vendeur les affiche). C'est ce qui rend la détection des ventes économe.
 */
export async function sellerItems(sellerId, market = "fr", { pages = 1 } = {}) {
  const id = Number(sellerId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const out = [];
  for (let page = 1; page <= Math.min(Math.max(1, pages), 12); page++) {
    const res = await vFetch(`https://${host(market)}/api/v2/users/${id}/items?page=${page}&per_page=96&order=newest_first`, "json", market);
    const raw = Array.isArray(res.body?.items) ? res.body.items : [];
    out.push(...raw.map((it) => ({ ...normaliseItem(it, market), seller_id: id, status: statusFromJson(it) })).filter((i) => i.vinted_id));
    const total = Number(res.body?.pagination?.total_pages);
    if (raw.length < 96 || (Number.isFinite(total) && page >= total)) break;
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
  }
  return out;
}

/** Profil public d'un membre : pseudo, note, avis, abonnés, nombre d'annonces. */
export async function userInfo(userId, market = "fr") {
  const res = await vFetch(`https://${host(market)}/api/v2/users/${Number(userId)}`, "json", market);
  const u = res?.body?.user;
  if (!u?.id) return null;
  return {
    id: Number(u.id), login: u.login || null,
    rating: Number.isFinite(Number(u.feedback_reputation)) ? Math.round(Number(u.feedback_reputation) * 50) / 10 : null,
    reviews: Number(u.feedback_count ?? 0) || 0,
    followers: Number(u.followers_count ?? 0) || 0,
    items: Number(u.item_count ?? 0) || 0,
    given: Number(u.given_item_count ?? 0) || null,
    photo: !!(u.photo && (u.photo.url || u.photo.full_size_url)),
    about: typeof u.about === "string" ? u.about.trim().length : 0,
    business: !!u.business,
    verified: !!(u.verification?.email?.valid || u.verified_email),
    last_seen: u.last_loged_on_ts || u.last_logged_on_ts || null,
  };
}

/** Retrouve un vendeur à partir de son pseudo (recherche de membres Vinted), sinon null. */
export async function findSeller(login, market = "fr") {
  const want = String(login || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(want)) return null;
  try {
    const res = await vFetch(`https://${host(market)}/api/v2/users?search_text=${encodeURIComponent(want)}&page=1&per_page=20`, "json", market);
    const users = Array.isArray(res?.body?.users) ? res.body.users : [];
    const hit = users.find((u) => String(u.login || "").toLowerCase() === want);
    if (hit?.id) return { id: Number(hit.id), login: hit.login };
  } catch (e) { if (["paused", "budget", "rate_limited"].includes(e.code)) throw e; }
  // Secours : page de recherche de membres (liens /member/<id>-<pseudo>).
  try {
    const out = await bridgeFetch(`https://${host(market)}/member/general/search?search_text=${encodeURIComponent(want)}`, "html", market);
    const re = new RegExp(`/member/(\\d+)-${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=["/?#])`, "i");
    const m = String(out?.body || "").match(re);
    if (m) return { id: Number(m[1]), login: want };
  } catch (e) { if (["paused", "budget", "rate_limited"].includes(e.code)) throw e; }
  return null;
}

export async function itemStatus(vintedId, market = "fr") {
  const res = await vFetch(`https://${host(market)}/items/${vintedId}`, "html", market);
  if (res.status === 404) return "closed";
  return parseItemStatus(res.body);
}

/** Détails publics d'une annonce (titre, prix, photo, statut) à partir de son identifiant. */
export async function itemDetails(vintedId, market = "fr") {
  for (const path of [`/api/v2/items/${vintedId}/details`, `/api/v2/items/${vintedId}`]) {
    let res;
    try { res = await vFetch(`https://${host(market)}${path}`, "json", market); } catch (e) { if (e.code === "paused" || e.code === "blocked") throw e; continue; }
    if (res.status === 404) return { vinted_id: Number(vintedId), market, status: "closed" };
    const it = res.body?.item;
    if (it?.id) return { ...normaliseItem(it, market), status: statusFromJson(it) };
  }
  return null;
}
