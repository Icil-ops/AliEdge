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
  return { pausedUntil: g.pauseUntil > now ? g.pauseUntil : 0, lastHour: g.hits.filter((t) => t > now - 3600e3).length, lastDay: g.hits.length, budget: BUDGET };
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
  if (status === 401 || status === 403 || status === 429 || suspicious) {
    const min = COOLDOWNS[Math.min(g.strikes, COOLDOWNS.length - 1)];
    g.pauseUntil = Date.now() + min * 60e3 * (0.9 + Math.random() * 0.2);
    g.strikes += 1; g.okStreak = 0;
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

async function bridgeFetch(url, kind, market) {
  const tabId = await getBridgeTab(market);
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    args: [url, kind],
    func: async (u, k) => {
      try {
        const r = await fetch(u, { credentials: "include", headers: { Accept: k === "json" ? "application/json, text/plain, */*" : "text/html" } });
        if (r.status === 404) return { status: 404, body: null };
        if (!r.ok) return { status: r.status, error: true };
        return { status: r.status, body: k === "json" ? await r.json() : await r.text() };
      } catch (e) {
        return { status: 0, error: String(e && e.message || e) };
      }
    },
  });
  scheduleBridgeClose();
  const out = res?.result;
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
    views: Number.isFinite(it.view_count) ? it.view_count : null,
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
  const res = await vFetch(url.toString(), "json", market);
  const raw = Array.isArray(res.body?.items) ? res.body.items : [];
  const items = raw.map((it) => normaliseItem(it, market)).filter((i) => i.vinted_id && i.price != null);
  const total = res.body?.pagination?.total_entries ?? items.length;
  for (const i of items) i.relevance = relevance(q, i.title);
  return { items, total };
}

/** Nouvelles annonces pour le Radar : les plus récentes d'abord, avec fourchette de prix. */
export async function searchNewest({ query, market = "fr", condition = "all", priceMin = null, priceMax = null, perPage = 40 }) {
  const url = new URL(`https://${host(market)}/api/v2/catalog/items`);
  if (query) url.searchParams.set("search_text", String(query).trim());
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", "1");
  url.searchParams.set("order", "newest_first");
  if (priceMin != null && priceMin !== "") url.searchParams.set("price_from", String(priceMin));
  if (priceMax != null && priceMax !== "") url.searchParams.set("price_to", String(priceMax));
  (CONDITION_IDS[condition] || []).forEach((id) => url.searchParams.append("status_ids[]", String(id)));
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
export async function sellerItems(sellerId, market = "fr") {
  const id = Number(sellerId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const res = await vFetch(`https://${host(market)}/api/v2/users/${id}/items?page=1&per_page=96&order=newest_first`, "json", market);
  const raw = Array.isArray(res.body?.items) ? res.body.items : [];
  return raw.map((it) => ({ ...normaliseItem(it, market), seller_id: id, status: statusFromJson(it) })).filter((i) => i.vinted_id);
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
