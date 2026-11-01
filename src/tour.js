// AliEdge — Balade SHEIN : chef d'orchestre (service worker).
// Garde l'état de la balade par onglet (chrome.storage.session) pour qu'elle continue quand elle ouvre
// un article puis revient au catalogue, et réinjecte src/content/tour.js à chaque page SHEIN.
// Enregistre les articles vus / ouverts (chrome.storage.local, clé ae_shein_seen) pour le rapport.
// Garde-fous : 45 min maximum, 20 articles ouverts par heure (dans le script), arrêt net si SHEIN
// demande une vérification anti-robot : la personne la fait elle-même.

const SHEIN_RE = /^https:\/\/([a-z0-9-]+\.)*shein\.(com|fr)\//i;
const KEY = "ae_shein_tours";
export const SEEN_KEY = "ae_shein_seen";
const MAX_SEEN = 600;
const MAX_MINUTES = 45;
const store = chrome.storage.session || chrome.storage.local;

export const isShein = (url) => SHEIN_RE.test(url || "");

// Les écritures passent une par une : deux sauvegardes simultanées ne s'écrasent pas.
let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}

async function getTours() { return (await store.get(KEY))[KEY] || {}; }
async function setTours(t) { await store.set({ [KEY]: t }); }
async function getTour(tabId) { return (await getTours())[tabId] || null; }

function saveTour(tabId, patch, create = false) {
  return serial(async () => {
    const t = await getTours();
    if (!t[tabId] && !create) return null;
    t[tabId] = { ...(t[tabId] || {}), ...patch };
    await setTours(t);
    return t[tabId];
  });
}
function endTour(tabId) {
  return serial(async () => { const t = await getTours(); delete t[tabId]; await setTours(t); });
}

async function inject(tabId, tour) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content/tour.js"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t) => (window.__aeSheinTour ? window.__aeSheinTour.start(t) : null),
      args: [tour],
    });
  } catch { /* onglet fermé ou page non accessible */ }
}

async function tabStatus(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__aeSheinTour ? window.__aeSheinTour.status() : null),
    });
    return r?.result || null;
  } catch { return null; }
}

// ───────── Articles vus

function record(items) {
  if (!Array.isArray(items) || !items.length) return Promise.resolve();
  return serial(async () => {
    const seen = (await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] || {};
    const now = Date.now();
    for (const it of items.slice(0, 60)) {
      if (!it?.url || !/^https:\/\//.test(it.url)) continue;
      const key = String(it.url).split("?")[0];
      const cur = seen[key] || { url: key, first: now, views: 0, opened: false };
      if (!it.opened) cur.views += 1;
      cur.last = now;
      for (const f of ["title", "price", "img", "cats", "rating", "reviews", "from"]) {
        if (it[f] && (!cur[f] || it.opened)) cur[f] = typeof it[f] === "string" ? it[f].slice(0, 300) : it[f];
      }
      if (it.opened) cur.opened = true;
      seen[key] = cur;
    }
    const keys = Object.keys(seen);
    if (keys.length > MAX_SEEN) {
      keys.sort((a, b) => (seen[a].last || 0) - (seen[b].last || 0));
      for (const k of keys.slice(0, keys.length - MAX_SEEN)) delete seen[k];
    }
    await chrome.storage.local.set({ [SEEN_KEY]: seen });
  });
}

// ───────── Messages (le panneau appelle start / stop / state ; le script de page appelle le reste)

// Message envoyé par une page SHEIN (et non par le panneau AliEdge, même ouvert dans un onglet).
const fromShein = (sender) => !!sender?.tab?.id && isShein(sender.tab.url || sender.url);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}
// Onglet visé : celui donné par le panneau (messages réservés aux pages de l'extension), sinon l'onglet actif.
async function pickTab(tabId) {
  if (Number.isInteger(tabId)) { try { return await chrome.tabs.get(tabId); } catch { return null; } }
  return activeTab();
}

export const tourHandlers = {
  "tour:state": async ({ tabId } = {}) => {
    const tab = await pickTab(tabId);
    const seen = (await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] || {};
    const base = { shein: isShein(tab?.url), seenCount: Object.keys(seen).length };
    if (!tab?.id) return base;
    const tour = await getTour(tab.id);
    if (!tour) return { ...base, running: false };
    const st = await tabStatus(tab.id);
    return { ...base, running: true, paused: !!st?.paused, left: st?.left ?? Math.max(0, tour.endAt - tour.activeMs), opened: tour.opened || 0 };
  },
  "tour:start": async ({ opts = {}, tabId }) => {
    const tab = await pickTab(tabId);
    if (!tab?.id || !isShein(tab.url)) throw Object.assign(new Error("Ouvre d'abord une page SHEIN (une catégorie ou une recherche)."), { code: "invalid" });
    const minutes = Math.min(MAX_MINUTES, Number(opts.minutes) > 0 ? Number(opts.minutes) : 10);
    const tour = await saveTour(tab.id, {
      opts: {
        minutes,
        pace: ["calme", "normal", "dynamique"].includes(opts.pace) ? opts.pace : "calme",
        open: opts.open !== false, cursor: !!opts.cursor, badge: opts.badge !== false,
      },
      endAt: minutes * 60000, activeMs: 0, mode: "listing", startUrl: tab.url,
      returnUrl: null, returnY: 0, lastOpenAt: 0, opened: 0, opensLog: [], startedAt: Date.now(),
    }, true);
    await inject(tab.id, tour);
    return { ok: true };
  },
  "tour:stop": async (msg, sender) => {
    const fromPage = fromShein(sender);
    const tabId = fromPage ? sender.tab.id : (await pickTab(msg?.tabId))?.id;
    if (!tabId) return {};
    await endTour(tabId);
    if (!fromPage) {
      // Arrêt demandé depuis le panneau : on prévient la page.
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => { if (window.__aeSheinTour) window.__aeSheinTour.stop(true); },
      }).catch(() => {});
    }
    return {};
  },
  "tour:save": async ({ patch = {} }, sender) => {
    if (!fromShein(sender)) return {};
    await saveTour(sender.tab.id, patch);
    return {};
  },
  "tour:resume": async (msg, sender) => {
    const tabId = fromShein(sender) ? sender.tab.id : null;
    const tour = tabId ? await getTour(tabId) : null;
    if (tour) await inject(tabId, tour);
    return {};
  },
  "tour:verify": async (msg, sender) => {
    chrome.notifications.create(`ae-shein-verify-${sender?.tab?.id || 0}`, {
      type: "basic", iconUrl: "icons/icon128.png", priority: 2,
      title: "Balade SHEIN en pause",
      message: "SHEIN demande une vérification. Fais-la toi-même, puis clique « Reprendre » sur la page.",
    });
    return {};
  },
  "tour:record": async ({ items }, sender) => { if (fromShein(sender)) await record(items); return {}; },
  "tour:seen": async () => (await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] || {},
  "tour:clear": async () => { await serial(() => chrome.storage.local.remove(SEEN_KEY)); return {}; },
};

// Messages que la page SHEIN a le droit d'envoyer (le reste est réservé au panneau).
export const TOUR_CONTENT_TYPES = ["tour:save", "tour:record", "tour:stop", "tour:resume", "tour:verify"];

// Nouvelle page dans un onglet en balade : on relance le script, ou on arrête si on a quitté SHEIN.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const tour = await getTour(tabId);
  if (!tour) return;
  if (!isShein(tab?.url)) { await endTour(tabId); return; }
  await inject(tabId, tour);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (await getTour(tabId)) await endTour(tabId);
});
