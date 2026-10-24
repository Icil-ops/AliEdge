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
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) {
      if ([401, 403, 429].includes(res.status)) directBlockedUntil = Date.now() + 5 * 60_000;
      return null;
    }
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
  if (out.error) {
    if (out.status === 401 || out.status === 403) throw new VintedError("Vinted bloque la recherche. Ouvre vinted.fr, connecte-toi, puis relance.", "blocked");
    if (out.status === 429) throw new VintedError("Vinted limite les recherches. Patiente une minute.", "rate_limited");
    throw new VintedError("Recherche Vinted impossible pour le moment.", "bridge_error");
  }
  return out;
}

async function vFetch(url, kind, market) {
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

export async function itemStatus(vintedId, market = "fr") {
  const res = await vFetch(`https://${host(market)}/items/${vintedId}`, "html", market);
  if (res.status === 404) return "closed";
  return parseItemStatus(res.body);
}
