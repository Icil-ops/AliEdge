// AliEdge — panneau latéral et plein écran.
import { MARKETS, BUY_URL, BARAPICS_URL, SKOOL_URL, PRIVACY_URL, WAREHOUSE_URL } from "../src/config.js";
import { VERDICT_LABEL, histogram } from "../src/lib/pricing.js";
import { draftListing, buildQuery, lbcListing } from "../src/lib/text.js";
import { titleKey } from "../src/lib/match.js";

const $view = document.getElementById("view");
// Photo cassée ou absente (lien Vinted expiré) : vignette neutre au lieu de l'icône cassée.
const IMG_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg>';
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.off) return;
  img.dataset.off = "1";
  const d = document.createElement("div");
  d.className = `img-off ${img.className || ""}`;
  d.innerHTML = IMG_OFF;
  const r = img.getBoundingClientRect();
  if (r.width && r.height) { d.style.width = `${r.width}px`; d.style.height = `${r.height}px`; }
  d.style.borderRadius = getComputedStyle(img).borderRadius;
  img.replaceWith(d);
}, true);
const $plan = document.getElementById("plan");
const isTab = new URLSearchParams(location.search).get("mode") === "tab";
if (isTab) document.body.classList.add("mode-tab");

const state = {
  me: null,
  settings: null,
  product: null,
  productLoading: false,
  analysing: false,
  step: 0,
  entry: null,
  error: null,
  query: "",
  shipping: 0,
  priceOverride: null,
  catalog: { filters: { sort: "sold", platform: "", search: "" }, rows: [], loading: false, error: null, total: 0 },
  // Achat malin (fiche fournisseur ouverte)
  smart: { key: null, history: null, historyErr: null, review: null, reviewBusy: false, reviewErr: null, coupons: null, pageCoupons: [], compareBusy: false, open: { review: false } },
  // Recherche par image
  img: { image: null, busy: false, result: null, error: null },
};

// ───────────────────────── Utilitaires

/** Montant pour un champ de saisie : « 6,40 ». */
const money = (n) => Number(n).toFixed(2).replace(".", ",");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n, sign = false) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const s = Math.abs(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : ""}${s} €`;
};
const PLATFORM = { aliexpress: ["AliExpress", "ali"], temu: ["Temu", "temu"], shein: ["Shein", "shein"] };
const chip = (p) => (PLATFORM[p] ? `<span class="chip ${PLATFORM[p][1]}">${PLATFORM[p][0]}</span>` : "");
const ago = (t) => {
  if (!t) return "";
  const d = (Date.now() - new Date(t).getTime()) / 1000;
  if (d < 3600) return `il y a ${Math.max(1, Math.round(d / 60))} min`;
  if (d < 86400) return `il y a ${Math.round(d / 3600)} h`;
  return `il y a ${Math.round(d / 86400)} j`;
};
const safeUrl = (u) => (/^https:\/\//.test(String(u || "")) ? esc(u) : "#");

async function api(type, payload = {}) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type, ...payload });
  } catch {
    throw Object.assign(new Error("L'extension a été mise à jour. Ferme et rouvre ce panneau."), { code: "reload" });
  }
  if (!res?.ok) throw Object.assign(new Error(res?.error || "Erreur inattendue."), { code: res?.code || "" });
  return res.data;
}

function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

function announce(msg) {
  document.getElementById("live").textContent = msg;
}

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [name, qs] = h.split("?");
  return { name: ["analyse", "catalogue", "radar", "concurrents", "suivis", "compte", "bienvenue", "image", "balade"].includes(name) ? name : "analyse", params: new URLSearchParams(qs || "") };
}

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M6 16l4-5 3 3 5-7"/></svg>',
};

// ───────────────────────── Radar

const CONDITIONS = { all: "Tous états", new: "Neuf avec étiquette", very_good: "Neuf ou très bon" };
let radarEdit = null;

function radarFeedHtml(feed) {
  if (!feed.length) return `<div class="card empty">${ICON.search}<h2>En attente de nouvelles annonces</h2><p class="muted">Dès qu'une annonce correspondant à un filtre est publiée sur Vinted, elle apparaît ici et tu reçois une notification. Garde Chrome ouvert.</p></div>`;
  return `<div class="items">${feed.slice(0, 120).map((i) => `
    <a class="item radar-item" href="${safeUrl(i.url)}" target="_blank" rel="noopener" style="grid-template-columns:56px 1fr auto">
      ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
      <div><div class="t">${esc(i.title || "Annonce")}</div><div class="m">${esc(i.filterName || "")} · ${esc(ago(i.at))}${i.brand ? ` · ${esc(i.brand)}` : ""}${i.size ? ` · ${esc(i.size)}` : ""}</div></div>
      <div class="stack" style="align-items:flex-end;gap:4px"><span class="p num">${eur(Number(i.price))}</span><span class="btn small primary">Voir</span></div>
    </a>`).join("")}</div>`;
}

const radarMode = (f) => (f.id ? (f.params ? "link" : "query") : radarModePref);
let radarModePref = "link";

async function viewRadar() {
  if (!state.me) return `<section class="card pad stack"><h2>Radar</h2><p class="muted">Connecte-toi pour surveiller les nouvelles annonces Vinted.</p><a class="btn primary" href="#/compte">Se connecter</a></section>`;
  const { filters, feed } = await api("radar:state").catch(() => ({ filters: [], feed: [] }));
  const guard = await api("guard:status").catch(() => null);
  const guardLine = !guard ? "" : guard.pausedUntil
    ? `<p class="small guard paused">Protection du compte : pause jusqu'à ${new Date(guard.pausedUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Vinted a ralenti les réponses, AliEdge reprend tout seul.</p>`
    : `<p class="small guard">Protection du compte active : ${guard.lastHour}/${guard.budget.perHour} vérifications cette heure, rythme humain, pause automatique au moindre signal de Vinted.</p>`;
  const f = radarEdit ? filters.find((x) => x.id === radarEdit) || {} : {};
  const marketOpts = Object.entries(MARKETS).map(([k, x]) => `<option value="${k}" ${(f.market || state.settings?.market || "fr") === k ? "selected" : ""}>${x.label}</option>`).join("");
  const condOpts = Object.entries(CONDITIONS).map(([k, l]) => `<option value="${k}" ${(f.condition || "all") === k ? "selected" : ""}>${l}</option>`).join("");
  return `
    <section class="stack">
      <div class="row between"><h2>Radar des nouvelles annonces</h2><span class="radar-live"><i></i>en direct</span></div>
      <p class="small muted">${state.me?.skool ? "Jusqu'à 10 filtres (membre du Skool)." : "Jusqu'à 5 filtres (10 pour les membres du Skool)."} AliEdge regarde les nouvelles annonces Vinted à tour de rôle, toutes les 30 secondes environ, et te prévient. L'achat se fait toujours toi-même, sur Vinted.</p>
      ${guardLine}
      <form id="radarform" class="card pad stack">
        <input type="hidden" name="id" value="${esc(f.id || "")}">
        <input type="hidden" name="mode" value="${radarMode(f)}">
        <div class="seg" role="tablist" aria-label="Type de filtre">
          <button type="button" role="tab" data-rmode="link" aria-selected="${radarMode(f) === "link"}">Lien de recherche Vinted</button>
          <button type="button" role="tab" data-rmode="query" aria-selected="${radarMode(f) === "query"}">Mots-clés</button>
        </div>
        <div class="stack" data-rpane="link" ${radarMode(f) === "link" ? "" : "hidden"}>
          <label class="field"><span>Lien de la recherche</span><input class="input" name="link" type="url" inputmode="url" value="${esc(f.link || "")}" placeholder="https://www.vinted.fr/catalog?search_text=…&brand_ids[]=…"></label>
          <p class="small muted">Fais ta recherche sur Vinted avec tous tes filtres (marque, catégorie, taille, état, couleur, prix), puis copie l'adresse de la page ici. AliEdge surveille exactement cette recherche.</p>
          <label class="field"><span>Nom du filtre</span><input class="input" name="lname" value="${esc(f.name || "")}" placeholder="ex. Nike Tech taille M"></label>
        </div>
        <div class="stack" data-rpane="query" ${radarMode(f) === "query" ? "" : "hidden"}>
          <div class="grid2">
            <label class="field"><span>Mots-clés</span><input class="input" name="query" value="${esc(f.query || "")}" placeholder="ex. sac bandoulière cuir"></label>
            <label class="field"><span>Nom du filtre</span><input class="input" name="name" value="${esc(f.name || "")}" placeholder="facultatif"></label>
          </div>
          <div class="grid2">
            <label class="field"><span>Prix min.</span><div class="input-euro"><input class="input num" name="priceMin" inputmode="decimal" value="${f.priceMin ?? ""}"></div></label>
            <label class="field"><span>Prix max.</span><div class="input-euro"><input class="input num" name="priceMax" inputmode="decimal" value="${f.priceMax ?? ""}"></div></label>
          </div>
          <div class="grid2">
            <label class="field"><span>Pays</span><select class="input" name="market">${marketOpts}</select></label>
            <label class="field"><span>État</span><select class="input" name="condition">${condOpts}</select></label>
          </div>
        </div>
        <label class="switch small"><span>Notification à chaque nouvelle annonce</span><input type="checkbox" name="notify" ${f.notify === false ? "" : "checked"}></label>
        <div id="radarerr" role="alert"></div>
        <div class="row" style="gap:8px"><button class="btn primary" type="submit">${f.id ? "Enregistrer" : "Ajouter le filtre"}</button>${f.id ? '<button class="btn ghost" type="button" id="radarcancel">Annuler</button>' : ""}</div>
      </form>
      ${filters.length ? `<div class="radar-filters">${filters.map((x) => `
        <div class="radar-filter ${x.active ? "" : "off"}">
          <div><b>${esc(x.name)}</b><div class="small muted">${x.params ? `Recherche Vinted${x.params.brand_ids ? " · marque" : ""}${x.params.catalog_ids ? " · catégorie" : ""}${x.params.size_ids ? " · taille" : ""}${x.params.price_from || x.params.price_to ? " · prix" : ""}` : esc(x.query)}${x.priceMin != null ? ` · dès ${eur(x.priceMin)}` : ""}${x.priceMax != null ? ` · jusqu'à ${eur(x.priceMax)}` : ""} · ${esc((x.market || "fr").toUpperCase())}</div></div>
          <div class="row" style="gap:6px">
            <button class="btn ghost small" type="button" data-rtoggle="${esc(x.id)}">${x.active ? "Pause" : "Reprendre"}</button>
            <button class="btn ghost small" type="button" data-redit="${esc(x.id)}">Modifier</button>
            <button class="btn ghost small" type="button" data-rdel="${esc(x.id)}" aria-label="Supprimer ${esc(x.name)}">×</button>
          </div>
        </div>`).join("")}</div>` : ""}
    </section>
    <details class="card pad phone-alerts" id="phonealerts" ${filters.length ? "" : "open"}>
      <summary><b>Recevoir les alertes sur mon téléphone</b><span class="small muted" id="alertstatus">Telegram, Discord</span></summary>
      <div class="stack" id="alertsbody" style="margin-top:10px"><div class="skel" style="height:56px"></div></div>
    </details>
    <section class="stack" style="margin-top:22px">
      <div class="row between"><h2>Flux</h2>${feed.length ? '<button class="btn ghost small" type="button" id="radarclear">Vider</button>' : ""}</div>
      <div id="radarfeed">${radarFeedHtml(feed)}</div>
    </section>`;
}

async function refreshRadarFeed() {
  const box = document.getElementById("radarfeed");
  if (!box) return;
  const { feed } = await api("radar:state").catch(() => ({ feed: [] }));
  box.innerHTML = radarFeedHtml(feed);
  box.querySelector(".radar-item")?.classList.add("flash");
}

function alertsHtml(a) {
  const on = (x) => (x ? '<span class="pill-on">Activé</span>' : "");
  return `
    <div class="alert-row">
      <div><b>Telegram</b> ${on(a.telegram)}<p class="small muted">Une notification sur ton téléphone avec la photo, le prix et le lien, même quand tu n'es pas devant l'ordinateur.</p></div>
      ${a.telegramAvailable ? (a.telegram ? '<button class="btn ghost small" type="button" data-alert="tg-off">Arrêter</button>' : '<button class="btn primary small" type="button" data-alert="tg-on">Recevoir sur Telegram</button>') : '<span class="small muted">Bientôt disponible</span>'}
    </div>
    <div class="alert-row">
      <div><b>Discord</b> ${on(a.discord)}<p class="small muted">Colle le lien d'un webhook de ton serveur (Paramètres du salon → Intégrations → Webhooks).</p></div>
    </div>
    <form class="row" id="discordform" style="gap:8px">
      <input class="input" id="discordurl" type="url" placeholder="${a.discord ? "Webhook enregistré · colle un nouveau lien pour le changer" : "https://discord.com/api/webhooks/…"}" aria-label="Webhook Discord" style="flex:1">
      <button class="btn small" type="submit">Enregistrer</button>
      ${a.discord ? '<button class="btn ghost small" type="button" data-alert="dc-off">Retirer</button>' : ""}
    </form>
    ${a.skoolAvailable ? `<label class="switch small"><span>Partager mes trouvailles dans le salon Radar du Skool VintedDrop</span><input type="checkbox" id="shareskool" ${a.shareSkool ? "checked" : ""}></label>` : ""}
    ${a.telegram || a.discord ? '<button class="btn ghost small" type="button" data-alert="test">Envoyer une alerte de test</button>' : ""}
    <p class="small muted">Les alertes partent pendant que Chrome est ouvert sur un ordinateur, même s'il n'est pas devant toi.</p>`;
}

async function loadAlerts() {
  const body = document.getElementById("alertsbody");
  if (!body) return;
  let a;
  try { a = await api("alerts:get"); } catch (e) { body.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  body.innerHTML = alertsHtml(a);
  const st = document.getElementById("alertstatus");
  if (st) st.textContent = [a.telegram && "Telegram", a.discord && "Discord", a.shareSkool && "Skool"].filter(Boolean).join(" · ") || "désactivées";
  const set = async (patch, msg) => { try { await api("alerts:set", { patch }); toast(msg); loadAlerts(); } catch (e) { toast(e.message); } };
  body.querySelector('[data-alert="tg-on"]')?.addEventListener("click", async () => {
    try { const { url } = await api("alerts:telegramLink"); window.open(url, "_blank", "noopener"); toast("Dans Telegram, appuie sur « Démarrer » pour connecter ton Radar"); setTimeout(loadAlerts, 15000); }
    catch (e) { toast(e.message); }
  });
  body.querySelector('[data-alert="tg-off"]')?.addEventListener("click", () => set({ telegram: false }, "Alertes Telegram arrêtées"));
  body.querySelector('[data-alert="dc-off"]')?.addEventListener("click", () => set({ discordWebhook: null }, "Webhook Discord retiré"));
  body.querySelector("#discordform")?.addEventListener("submit", (e) => { e.preventDefault(); const v = document.getElementById("discordurl").value.trim(); if (v) set({ discordWebhook: v }, "Webhook Discord enregistré"); });
  body.querySelector("#shareskool")?.addEventListener("change", (e) => set({ shareSkool: e.target.checked }, e.target.checked ? "Tes trouvailles seront partagées dans le salon du Skool" : "Partage arrêté"));
  body.querySelector('[data-alert="test"]')?.addEventListener("click", async () => {
    try { const r = await api("alerts:test"); toast(r.discord || r.telegram ? "Alerte de test envoyée" : "Aucun canal n'a répondu : vérifie tes réglages"); } catch (e) { toast(e.message); }
  });
}

function bindRadar() {
  loadAlerts();
  document.getElementById("radarform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const num = (v) => (String(v || "").trim() === "" ? null : Number(String(v).replace(",", ".")));
    const link = fd.get("mode") === "link";
    if (link && !String(fd.get("link") || "").trim()) { document.getElementById("radarerr").innerHTML = `<div class="notice err">Colle le lien d'une recherche Vinted.</div>`; return; }
    if (!link && !String(fd.get("query") || "").trim()) { document.getElementById("radarerr").innerHTML = `<div class="notice err">Indique des mots-clés à surveiller.</div>`; return; }
    const filter = link
      ? { id: fd.get("id") || undefined, link: String(fd.get("link")).trim(), name: fd.get("lname"), notify: fd.get("notify") === "on", active: true }
      : { id: fd.get("id") || undefined, query: fd.get("query"), name: fd.get("name"), priceMin: num(fd.get("priceMin")), priceMax: num(fd.get("priceMax")), market: fd.get("market"), condition: fd.get("condition"), notify: fd.get("notify") === "on", active: true };
    try { await api("radar:save", { filter }); radarEdit = null; toast("Filtre enregistré : surveillance lancée"); render(); }
    catch (x) { document.getElementById("radarerr").innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  });
  document.querySelectorAll("[data-rmode]").forEach((b) => b.addEventListener("click", () => {
    const mode = b.dataset.rmode;
    radarModePref = mode;
    document.querySelector('#radarform [name="mode"]').value = mode;
    document.querySelectorAll("[data-rmode]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll("[data-rpane]").forEach((p) => { p.hidden = p.dataset.rpane !== mode; });
  }));
  document.getElementById("radarcancel")?.addEventListener("click", () => { radarEdit = null; render(); });
  document.getElementById("radarclear")?.addEventListener("click", async () => { await api("radar:clear"); render(); });
  document.querySelectorAll("[data-redit]").forEach((b) => b.addEventListener("click", () => { radarEdit = b.dataset.redit; render(); }));
  document.querySelectorAll("[data-rdel]").forEach((b) => b.addEventListener("click", async () => { await api("radar:remove", { id: b.dataset.rdel }); render(); }));
  document.querySelectorAll("[data-rtoggle]").forEach((b) => b.addEventListener("click", async () => {
    const { filters } = await api("radar:state");
    const f = filters.find((x) => x.id === b.dataset.rtoggle);
    if (f) { await api("radar:save", { filter: { ...f, active: !f.active } }); render(); }
  }));
}

// ───────────────────────── Compte

async function loadAuth() {
  try {
    const r = await api("auth:state");
    state.me = r.me;
    state.settings = r.settings;
  } catch (e) {
    state.me = null;
  }
  state.authReady = true;
  renderPlan();
  api("community:stats").then((c) => { state.community = c; if (route().name === "compte") render(); }).catch(() => {});
}

function renderPlan() {
  if (!state.me) { $plan.textContent = "Se connecter"; $plan.className = "plan"; return; }
  $plan.textContent = state.me.free_launch ? "Accès complet" : state.me.pro ? "Pro" : "Gratuit";
  $plan.className = state.me.pro ? "plan pro" : "plan";
}
$plan.addEventListener("click", () => { location.hash = "#/compte"; });
document.getElementById("expand").addEventListener("click", () => api("open:tab", { hash: location.hash.slice(1) }).catch(() => {}));
if (isTab) document.getElementById("expand").hidden = true;

// ───────────────────────── Analyse

async function loadProduct() {
  state.productLoading = true;
  if (route().name === "analyse") render();
  try {
    const p = await api("product:current");
    const changed = !state.product || p.source_id !== state.product.source_id;
    state.product = p;
    if (changed) {
      state.query = p.query || "";
      state.priceOverride = null;
      state.shipping = 0;
      state.error = null;
      // Résultat déjà calculé pour ce produit : on le réaffiche.
      if (p.source_id) {
        const hist = await api("history:list").catch(() => []);
        state.entry = hist.find((h) => h.product?.source_id === p.source_id) || null;
      } else if (state.entry?.product) {
        state.entry = null;
      }
    }
  } catch (e) {
    state.product = { supported: false, error: e.message };
  } finally {
    state.productLoading = false;
    if (route().name === "analyse") render();
  }
  loadSmart();
}

// ───────────────────────── Achat malin : historique des prix, même produit moins cher, avis IA, codes promo

async function loadSmart(force = false) {
  const p = state.product;
  const sm = state.smart;
  const key = p?.supported && !p.error && p.source_id ? `${p.platform}:${p.source_id}` : null;
  if (!key || !state.me) { if (sm.key) Object.assign(sm, { key: null, history: null, review: null, coupons: null, pageCoupons: [] }); return; }
  if (key === sm.key && !force) return;
  Object.assign(sm, { key, history: null, historyErr: null, review: null, reviewErr: null, coupons: null, pageCoupons: [] });
  const [h, c, pc] = await Promise.all([
    api("prices:history", { platform: p.platform, source_id: p.source_id, current: p.priceEur }).catch((e) => ({ error: e.message })),
    api("coupons:list", { platform: p.platform }).catch(() => []),
    api("coupons:page").catch(() => []),
  ]);
  if (sm.key !== key) return;
  if (h?.error) sm.historyErr = h.error; else sm.history = h;
  sm.coupons = c || [];
  sm.pageCoupons = pc || [];
  if (route().name === "analyse") render();
}

const VERDICT_PRICE = {
  lowest: ["Prix le plus bas relevé", "gain"],
  good: ["En dessous du prix moyen", "gain"],
  average: ["Prix dans la moyenne", ""],
  high: ["Plus cher que d'habitude", "loss"],
  unknown: ["Pas encore assez de relevés", ""],
};

function priceSpark(points, w = 300, h = 64) {
  if (!points?.length) return "";
  const vals = points.map((x) => x.min);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const t0 = new Date(points[0].day).getTime(), t1 = new Date(points[points.length - 1].day).getTime();
  const X = (d) => (points.length === 1 || t1 === t0 ? w / 2 : 4 + ((new Date(d).getTime() - t0) / (t1 - t0)) * (w - 8));
  const Y = (v) => 6 + (1 - (v - lo) / span) * (h - 14);
  const path = points.map((x, i) => `${i ? "L" : "M"}${X(x.day).toFixed(1)},${Y(x.min).toFixed(1)}`).join(" ");
  const area = `${path} L${X(points[points.length - 1].day).toFixed(1)},${h} L${X(points[0].day).toFixed(1)},${h} Z`;
  const last = points[points.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Évolution du prix : de ${eur(points[0].min)} à ${eur(last.min)}">
    <path d="${area}" class="spark-area"/><path d="${path}" class="spark-line" fill="none"/>
    <circle cx="${X(last.day).toFixed(1)}" cy="${Y(last.min).toFixed(1)}" r="3.5" class="spark-dot"/></svg>`;
}

function smartHtml() {
  const p = state.product;
  const sm = state.smart;
  if (!p?.supported || p.error || !state.me) return "";
  const h = sm.history;
  const st = h?.stats;
  const v = VERDICT_PRICE[st?.verdict || "unknown"];
  const day = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
  const lens = p.image ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.image)}` : null;
  const r = sm.review;
  const RV = { go: ["Bon produit à tester", "gain"], maybe: ["À vérifier avant de commander", "warn"], avoid: ["À éviter", "loss"] };
  const coupons = sm.coupons || [];
  return `
  <section class="card smart" aria-label="Acheter malin">
    <h3 class="smart-title">Acheter malin</h3>
    <details class="fold smart-block" data-fold="history" ${sm.open.history ? "open" : ""}>
      <summary><b>Historique du prix</b>${st ? `<span class="pill ${v[1]}">${esc(v[0])}</span>` : ""}</summary>
      ${sm.historyErr ? `<p class="small muted">${esc(sm.historyErr)}</p>` : !h ? `<div class="skel" style="height:64px;margin-top:8px"></div>` : !st ? `<p class="small muted">Premier relevé de ce produit aujourd'hui. L'historique se construit à chaque visite des membres AliEdge.</p>` : `
        ${priceSpark(h.points)}
        <div class="smart-stats num">
          <div><span>Plus bas</span><b>${eur(st.low)}</b><small>${esc(day(st.lowDay))}</small></div>
          <div><span>Moyenne</span><b>${eur(st.avg)}</b><small>${st.days} jour${st.days > 1 ? "s" : ""} relevé${st.days > 1 ? "s" : ""}</small></div>
          <div><span>Plus haut</span><b>${eur(st.high)}</b><small>depuis le ${esc(day(st.since))}</small></div>
        </div>`}
    </details>

    <details class="fold smart-block" data-fold="compare" ${sm.open.compare ? "open" : ""}>
      <summary><b>Même produit moins cher</b></summary>
      <p class="small muted" style="margin:4px 0 8px">AliEdge lance une recherche triée par prix et repère sur la page les vendeurs du même article (même photo ou photo identique selon l'IA).</p>
      <div class="grid3">
        <button class="btn primary small" type="button" data-compare="${esc(p.platform)}" ${sm.compareBusy ? "disabled" : ""}>${PLATFORM[p.platform]?.[0] || "Comparer"}</button>
        ${["aliexpress", "temu", "shein"].filter((x) => x !== p.platform).map((x) => `<button class="btn small" type="button" data-compare="${x}" ${sm.compareBusy ? "disabled" : ""}>${PLATFORM[x][0]}</button>`).join("")}
      </div>
      ${lens ? `<a class="small" href="${safeUrl(lens)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px">Chercher la photo avec Google Lens</a>` : ""}
    </details>

    <details class="fold smart-block" data-fold="review" ${sm.open.review || r || sm.reviewBusy ? "open" : ""}>
      <summary><b>Avis IA sur la fiche</b>${r ? `<span class="pill ${RV[r.verdict]?.[1] || ""}">${esc(RV[r.verdict]?.[0] || "")}</span>` : ""}</summary>
      ${r ? `
        <p style="margin:6px 0">${esc(r.summary)}</p>
        ${r.good?.length ? `<p class="small"><b>Points forts</b></p><ul class="smart-list">${r.good.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.watch?.length ? `<p class="small"><b>À surveiller</b></p><ul class="smart-list warn">${r.watch.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.save?.length ? `<p class="small"><b>Payer moins cher</b></p><ul class="smart-list">${r.save.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.resale ? `<p class="small"><b>Revente Vinted</b></p><p class="small">${esc(r.resale)}</p>` : ""}
      ` : `
        <p class="small muted" style="margin:4px 0 8px">Résumé de la fiche, pièges à éviter, comment payer moins cher et l'angle pour le revendre sur Vinted. 25 avis par jour.</p>
        ${sm.reviewErr ? `<p class="notice warn">${esc(sm.reviewErr)}</p>` : ""}
        <button class="btn small" type="button" data-aireview ${sm.reviewBusy ? "disabled" : ""}>${sm.reviewBusy ? "Lecture de la fiche…" : "Demander l'avis IA"}</button>`}
    </details>

    <details class="fold smart-block" data-fold="coupons" ${sm.open.coupons ? "open" : ""}>
      <summary><b>Codes promo</b>${coupons.length ? `<span class="pill">${coupons.length}</span>` : ""}</summary>
      ${sm.pageCoupons?.length ? `<p class="small muted" style="margin:4px 0">Coupons affichés sur la fiche :</p><div class="row wrap" style="gap:6px">${sm.pageCoupons.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
      ${coupons.length ? `<div class="coupons">${coupons.slice(0, 6).map((c) => `
        <div class="coupon"><div><code>${esc(c.code)}</code><div class="small muted">${[c.note, c.ok_count ? `a marché ${c.ok_count} fois` : "pas encore confirmé"].filter(Boolean).map(esc).join(" · ")}</div></div>
        <button class="btn small" type="button" data-copycode="${esc(c.code)}">${ICON.copy}Copier</button></div>`).join("")}</div>
        <p class="small muted">Au moment de payer, AliEdge propose ces codes directement sur la page et te demande s'ils ont marché.</p>`
      : `<p class="small muted" style="margin:4px 0">Aucun code partagé pour l'instant. Tu peux en ajouter un au moment de payer : il servira à toute la communauté.</p>`}
    </details>
  </section>`;
}

function bindSmart() {
  document.querySelectorAll("[data-compare]").forEach((b) => b.addEventListener("click", async () => {
    const p = state.product;
    state.smart.compareBusy = true; render();
    try {
      const r = await api("compare:start", { product: p, platform: b.dataset.compare });
      toast(`Recherche « ${r.query} » ouverte, triée par prix`);
    } catch (e) { toast(e.message); }
    finally { state.smart.compareBusy = false; render(); }
  }));
  document.querySelector("[data-aireview]")?.addEventListener("click", async () => {
    const sm = state.smart;
    sm.reviewBusy = true; sm.reviewErr = null; render();
    try {
      const res = state.entry?.result;
      sm.review = await api("review:run", {
        product: state.product,
        vinted: res ? { sell: res.sell ?? null, margin: res.margin ?? null, sold: res.soldStats?.count ?? null } : null,
        history: sm.history?.stats || null,
      });
    } catch (e) { sm.reviewErr = e.message; }
    finally { sm.reviewBusy = false; render(); }
  });
  document.querySelectorAll("[data-copycode]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copycode); toast(`Code ${b.dataset.copycode} copié`); } catch { toast("Copie impossible"); }
  }));
}

// ───────────────────────── Recherche par image

async function runImageSearch() {
  const im = state.img;
  if (!im.image) return;
  im.busy = true; im.error = null; im.result = null;
  render();
  try {
    im.result = await api("imagesearch:run", { image: im.image.data || im.image.src });
  } catch (e) { im.error = e; }
  finally { im.busy = false; if (route().name === "image") render(); }
}

/** Image choisie dans les fichiers ou collée : réduite à 768 px avant l'envoi. */
async function imageFromFile(file) {
  if (!file || !/^image\//.test(file.type)) { toast("Choisis une image (JPG, PNG ou WebP)."); return; }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { toast("Image illisible : essaie une autre image."); return; }
  const scale = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  state.img.image = { data: c.toDataURL("image/jpeg", 0.82) };
  runImageSearch();
}

function viewImage() {
  const im = state.img;
  const src = im.image?.data || im.image?.src || null;
  const supplierLinks = (q) => [
    ["AliExpress", `https://fr.aliexpress.com/w/wholesale-${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}.html?SortType=total_tranpro_desc`],
    ["Temu", `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`],
    ["Shein", `https://fr.shein.com/pdsearch/${encodeURIComponent(q)}/`],
  ];
  const r = im.result;
  return `
  <section class="stack" aria-label="Recherche par image">
    <div class="card pad stack">
      <h3>Recherche par image</h3>
      <p class="small muted">Retrouve chez les fournisseurs un produit vu sur Vinted, TikTok, Instagram ou n'importe quel site.</p>
      <ul class="small muted tips">
        <li><b>Clic droit sur une photo</b> → « Trouver ce produit chez les fournisseurs ».</li>
        <li><b>Vidéo ou capture d'écran</b> : clic droit sur la page → « Capturer une zone », ou <kbd>Alt</kbd>+<kbd>Maj</kbd>+<kbd>S</kbd>.</li>
        <li>Ou ici : choisis une image, ou colle-la avec <kbd>Ctrl</kbd>+<kbd>V</kbd>.</li>
      </ul>
      <label class="btn block" for="imgfile">${ICON.camera}Choisir une image<input id="imgfile" type="file" accept="image/*" hidden></label>
    </div>
    ${src ? `<div class="card pad stack">
      <div class="imgsearch"><img src="${esc(src)}" alt="Image recherchée" referrerpolicy="no-referrer">
        <div>${im.busy ? `<div class="skel" style="height:14px"></div><div class="skel" style="height:14px;width:60%;margin-top:8px"></div><p class="small muted" style="margin-top:8px">L'IA regarde la photo…</p>` : r ? `<h3>${esc(r.name || "Produit")}</h3>${r.category ? `<span class="chip">${esc(r.category)}</span>` : ""}` : ""}</div>
      </div>
      ${im.error ? `<p class="notice err">${esc(im.error.message)}${im.error.code === "auth" ? ' <a href="#/compte">Se connecter</a>' : ""}</p>` : ""}
      ${r?.branded ? `<p class="notice warn">Produit de marque${r.brand ? ` (${esc(r.brand)})` : ""} : les fournisseurs AliExpress, Temu ou Shein ne vendent que des imitations, à ne jamais revendre. Cherche plutôt un article sans marque du même style.</p>` : ""}
      ${r?.supplier?.length ? `<b>Chez les fournisseurs</b>
        <div class="stack" style="gap:8px">${r.supplier.map((q) => `<div class="qrow"><span class="small">${esc(q)}</span><span class="row" style="gap:4px">${supplierLinks(q).map(([n, u]) => `<a class="chip" href="${safeUrl(u)}" target="_blank" rel="noopener">${n}</a>`).join("")}</span></div>`).join("")}</div>` : ""}
      ${im.image?.src && /^https:/.test(im.image.src) ? `<a class="btn small" href="${safeUrl(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(im.image.src)}`)}" target="_blank" rel="noopener">${ICON.search}Comparer avec Google Lens</a>` : ""}
      ${r?.vinted?.length ? `<b>Sur Vinted</b><div class="row wrap" style="gap:6px">${r.vinted.map((q) => `<button class="btn small" type="button" data-vq="${esc(q)}">${ICON.search}${esc(q)}</button>`).join("")}</div><p class="small muted">Lance l'analyse Vinted : prix de revente, marge et ventes.</p>` : ""}
    </div>` : ""}
  </section>`;
}

function bindImage() {
  document.querySelectorAll("[data-vq]").forEach((b) => b.addEventListener("click", () => {
    state.query = b.dataset.vq;
    state.product = { supported: false };
    state.entry = null;
    location.hash = "#/analyse";
    setTimeout(startAnalysis, 50);
  }));
}
// Délégation : la vue est redessinée souvent, le champ peut changer entre-temps.
document.addEventListener("change", (e) => { if (e.target?.id === "imgfile") imageFromFile(e.target.files?.[0]); });
document.addEventListener("paste", (e) => {
  if (route().name !== "image") return;
  const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
  if (f) { e.preventDefault(); imageFromFile(f); }
});

function productPrice() {
  if (state.priceOverride != null) return state.priceOverride;
  return state.product?.priceEur ?? null;
}

async function startAnalysis() {
  if (state.analysing) return;
  if (!state.me) { location.hash = "#/compte?next=analyse"; return; }
  const q = state.query.trim();
  if (!q) { state.error = { message: "Indique des mots-clés pour chercher sur Vinted." }; render(); return; }
  state.analysing = true;
  state.error = null;
  state.step = 1;
  render();
  const timer = setInterval(() => { if (state.step < 3) { state.step++; renderSteps(); } }, 1400);
  try {
    const p = state.product?.supported && !state.product.error ? { ...state.product, priceEur: productPrice() } : null;
    const manualPrice = !p ? productPrice() : null;
    const product = p || (manualPrice != null ? { priceEur: manualPrice, title: q } : null);
    state.entry = await api("analyze", {
      product, query: q, market: state.settings?.market, condition: state.settings?.condition, shipping: state.shipping,
    });
    announce(`Analyse terminée : marge ${eur(state.entry.result.margin, true)}, score ${state.entry.result.score} sur 100.`);
    loadAuth();
    if (state.entry?.result?.sell != null) setTimeout(maybeAskReview, 2500);
  } catch (e) {
    state.error = { message: e.message, code: e.code };
  } finally {
    clearInterval(timer);
    state.analysing = false;
    render();
  }
}

// Demande d'avis sur le Chrome Web Store : neutre, sans contrepartie, une fois après la 3e analyse réussie.
const REVIEW_URL = "https://chromewebstore.google.com/detail/okkbjdadgkjdmdfepgcfeabholbgfafg/reviews";
async function maybeAskReview() {
  try {
    const { review = {} } = await chrome.storage.local.get("review");
    review.analyses = (review.analyses || 0) + 1;
    const due = review.analyses >= 3 && !review.done && !review.never && (!review.snoozeUntil || Date.now() > review.snoozeUntil);
    await chrome.storage.local.set({ review });
    if (!due || document.getElementById("review-ask")) return;
    const box = document.createElement("div");
    box.id = "review-ask";
    box.className = "review-ask";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-labelledby", "review-title");
    box.innerHTML = `
      <div class="review-card">
        <div class="review-stars" aria-hidden="true">${"<span>★</span>".repeat(5)}</div>
        <h2 id="review-title">Un avis sur AliEdge ?</h2>
        <p class="small muted">AliEdge est gratuit et son catalogue grandit avec chaque membre. Ton avis sur le Chrome Web Store aide d'autres revendeurs à le trouver.</p>
        <a class="btn primary block" id="review-go" href="${REVIEW_URL}" target="_blank" rel="noopener">Donner mon avis</a>
        <div class="row between" style="margin-top:8px">
          <button class="btn ghost" type="button" id="review-later">Plus tard</button>
          <button class="btn ghost" type="button" id="review-never">Ne plus demander</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    const close = async (patch) => {
      Object.assign(review, patch);
      await chrome.storage.local.set({ review });
      box.classList.add("out");
      setTimeout(() => box.remove(), 250);
    };
    box.querySelector("#review-go").addEventListener("click", () => close({ done: true }));
    box.querySelector("#review-later").addEventListener("click", () => close({ snoozeUntil: Date.now() + 7 * 864e5 }));
    box.querySelector("#review-never").addEventListener("click", () => close({ never: true }));
    box.addEventListener("click", (e) => { if (e.target === box) close({ snoozeUntil: Date.now() + 7 * 864e5 }); });
    box.querySelector("#review-go").focus();
  } catch { /* stockage indisponible : on ne demande rien */ }
}

function renderSteps() {
  document.querySelectorAll(".step").forEach((el, i) => {
    el.className = `step ${i + 1 < state.step ? "done" : i + 1 === state.step ? "on" : ""}`;
  });
}

function viewAnalyse() {
  const p = state.product;
  const parts = [];
  if (!state.me) {
    parts.push(`<div class="notice info row between wrap"><span>Crée ton compte gratuit : 5 analyses par jour, sans carte bancaire.</span><a class="btn primary" href="#/compte">Créer mon compte</a></div>`);
  }

  if (state.productLoading && !p) {
    parts.push(`<div class="card pad"><div class="product"><div class="ph skel"></div><div class="stack"><div class="skel" style="height:14px"></div><div class="skel" style="height:14px;width:70%"></div></div></div></div>`);
  } else if (p?.supported && !p.error) {
    parts.push(`
      <section class="card pad stack" aria-label="Produit">
        <div class="product">
          ${p.image ? `<img src="${safeUrl(p.image)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div>
            <div class="row" style="gap:6px;margin-bottom:4px">${chip(p.platform)}<span class="chip">${esc(p.category)}</span></div>
            <h3>${esc(p.title)}</h3>
            ${p.orders ? `<p class="small muted" style="margin-top:4px">${esc(p.orders)}</p>` : ""}
          </div>
        </div>
        <div class="grid2">
          <label class="field"><span>Prix d'achat</span><div class="input-euro"><input id="price" class="input num" inputmode="decimal" value="${productPrice() != null ? money(productPrice()) : ""}" placeholder="0,00"></div></label>
          <label class="field"><span>Livraison fournisseur</span><div class="input-euro"><input id="shipping" class="input num" inputmode="decimal" value="${state.shipping ? money(state.shipping) : ""}" placeholder="0,00"></div></label>
        </div>
        <div id="aliofficial"></div>
        ${p.currency && p.currency !== "EUR" && p.price ? `<p class="small muted">Prix affiché ${esc(p.price)} ${esc(p.currency)}, converti en euros au taux indicatif.</p>` : ""}
        ${productPrice() == null ? `<p class="notice warn">Prix non détecté : saisis le prix payé pour calculer la marge.</p>` : ""}
        ${searchControls()}
      </section>`);
  } else {
    parts.push(`
      <section class="card pad stack">
        ${p?.error ? `<p class="notice warn">${esc(p.error)}</p>` : `
        <div class="empty" style="padding:8px 0 4px">
          ${ICON.tag}
          <h2>Ouvre un produit AliExpress, Temu ou Shein</h2>
          <p class="muted">AliEdge lit la fiche et te dit à combien elle se revend sur Vinted.</p>
        </div>`}
        <div class="row wrap" style="justify-content:center;gap:6px">
          <a class="chip ali" href="https://fr.aliexpress.com" target="_blank" rel="noopener">AliExpress</a>
          <a class="chip temu" href="https://www.temu.com/fr" target="_blank" rel="noopener">Temu</a>
          <a class="chip shein" href="https://fr.shein.com" target="_blank" rel="noopener">Shein</a>
        </div>
        <a class="btn block" href="#/image">${ICON.camera}Recherche par image</a>
        <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
        <h3>Ou cherche directement</h3>
        <label class="field"><span>Prix d'achat (facultatif)</span><div class="input-euro"><input id="price" class="input num" inputmode="decimal" value="${state.priceOverride != null ? money(state.priceOverride) : ""}" placeholder="0,00"></div></label>
        ${searchControls()}
      </section>`);
  }

  if (!isTab) parts.push(`<div id="tourcard"></div>`);

  if (state.analysing) {
    parts.push(`
      <section class="card steps" aria-busy="true" aria-label="Analyse en cours">
        <div class="step"><span class="dot"></span>Recherche des annonces sur Vinted</div>
        <div class="step"><span class="dot"></span>Tri des annonces vraiment comparables</div>
        <div class="step"><span class="dot"></span>Calcul du prix conseillé et de la marge</div>
      </section>`);
  } else if (state.error) {
    const e = state.error;
    parts.push(`<div class="notice err stack"><p>${esc(e.message)}</p>${
      e.code === "quota" ? `<a class="btn primary" href="${BUY_URL}" target="_blank" rel="noopener">Passer à AliEdge Pro</a>` :
      e.code === "auth" ? `<a class="btn primary" href="#/compte">Se connecter</a>` :
      e.code === "blocked" || e.code === "bridge_timeout" ? `<a class="btn" href="https://www.vinted.fr" target="_blank" rel="noopener">Ouvrir Vinted</a>` : ""
    }</div>`);
  }

  if (state.entry && !state.analysing) parts.push(viewResult(state.entry));
  if (p?.supported && !p.error) parts.push(smartHtml());
  return parts.join("");
}

function searchControls() {
  const s = state.settings || {};
  const markets = Object.entries(MARKETS).map(([k, m]) => `<option value="${k}" ${s.market === k ? "selected" : ""}>${m.label}</option>`).join("");
  const cond = { all: "Tous états", new: "Neuf avec étiquette", very_good: "Neuf ou très bon" }[s.condition || "all"];
  return `
    <details class="fold soft" data-fold="search" ${state.foldSearch === true || (state.foldSearch !== false && !state.query) ? "open" : ""}>
      <summary><span>Recherche Vinted</span><span class="fold-val">${esc((state.query || "—").slice(0, 34))} · ${esc(MARKETS[s.market || "fr"]?.label || "")} · ${esc(cond)}</span></summary>
      <div class="stack" style="margin-top:10px">
    <label class="field"><span>Mots-clés</span><input id="query" class="input" value="${esc(state.query)}" placeholder="ex. robe satin longue"></label>
    <div class="grid2">
      <label class="field"><span>Pays</span><select id="market" class="input">${markets}</select></label>
      <label class="field"><span>État</span><select id="condition" class="input">
        <option value="all" ${s.condition === "all" ? "selected" : ""}>Tous</option>
        <option value="new" ${s.condition === "new" ? "selected" : ""}>Neuf avec étiquette</option>
        <option value="very_good" ${s.condition === "very_good" ? "selected" : ""}>Neuf ou très bon état</option>
      </select></label>
    </div>
      </div>
    </details>
    <button id="go" class="btn primary block" type="button" ${state.analysing ? "disabled" : ""}>${ICON.search}${state.entry ? "Relancer l'analyse" : "Analyser sur Vinted"}</button>`;
}

function ring(score) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#6ff0b4" : score >= 55 ? "#b9a6ff" : score >= 35 ? "#ffd27a" : "#ff9aa6";
  return `<div class="ring" role="img" aria-label="Score ${score} sur 100">
    <svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8"/>
    <circle class="meter" cx="46" cy="46" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - score / 100)}"/></svg>
    <div class="val"><div><b class="num">${score}</b><span>/ 100</span></div></div></div>`;
}

/** Barapics reçoit directement le titre et les photos du produit : aucun import à refaire. */
function barapicsLink(product) {
  const images = (product?.images?.length ? product.images : product?.image ? [product.image] : []).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  if (!product?.url || !images.length) return BARAPICS_URL;
  return `${BARAPICS_URL}#import=${encodeURIComponent(JSON.stringify({ u: product.url, t: (product.title || "").slice(0, 300), i: images }))}`;
}

function viewResult(entry) {
  const r = entry.result;
  const loss = r.margin != null && r.margin <= 0;
  const st = r.activeStats;
  const prices = entry.items.filter((i) => !i.excluded).map((i) => i.price);
  const hist = histogram(prices, isTab ? 14 : 9);
  const maxCount = Math.max(1, ...hist.map((b) => b.count));
  const active = entry.items.filter((i) => !i.excluded).length;
  const listing = draftListing(entry.product || { title: entry.query }, r.sell);
  const watchKey = entry.product?.source_id || entry.query;

  return `
  <section class="stack" aria-label="Résultat">
    ${r.sell == null ? `<div class="notice warn">Aucune annonce comparable trouvée. Essaie des mots-clés plus simples (2 ou 3 mots).</div>` : `
    <div class="ticket ${loss ? "loss" : ""}">
      <div>
        <div class="k">Marge par vente</div>
        <div class="big num ${loss ? "neg" : "pos"}">${eur(r.margin, true)}</div>
        <div class="sub">Prix conseillé <b class="num">${eur(r.sell)}</b> · coût <b class="num">${eur(r.cost)}</b>${r.roi != null ? ` · ROI <b class="num">${r.roi} %</b>` : ""}</div>
        <div class="sub verdict" style="margin-top:6px">${esc(VERDICT_LABEL[r.verdict])}</div>
        ${loss && r.breakEven ? `<div class="sub" style="margin-top:4px">Rentable à partir de <b class="num">${eur(r.breakEven)}</b>, au-dessus de ce que le marché paie.</div>` : ""}
      </div>
      ${ring(r.score)}
    </div>`}
    ${entry.visual ? `<div class="notice info">Recherche par image : ${entry.items.filter((i) => (i.visual ?? 0) >= 0.6).length} annonce${entry.items.filter((i) => (i.visual ?? 0) >= 0.6).length > 1 ? "s" : ""} reconnue${entry.items.filter((i) => (i.visual ?? 0) >= 0.6).length > 1 ? "s" : ""} sur photo, même avec un autre titre.</div>` : ""}
    ${entry.lowConfidence && r.sell != null ? `<div class="notice warn">Peu d'annonces identiques : vérifie la liste ci-dessous et décoche celles qui ne correspondent pas.</div>` : ""}
    <div class="stats">
      <div class="stat"><div class="k">Annonces comparables</div><div class="v num">${active}<span class="small muted"> / ${esc(entry.total)}</span></div></div>
      <div class="stat"><div class="k">Prix médian</div><div class="v num">${eur(st?.median)}</div></div>
      <div class="stat"><div class="k">Fourchette courante</div><div class="v num" style="font-size:15px">${st ? `${eur(st.p25)} – ${eur(st.p75)}` : "—"}</div></div>
      <div class="stat"><div class="k">${r.soldStats ? "Ventes constatées" : "Favoris moyens"}</div><div class="v num">${r.soldStats ? `${r.soldStats.count} <span class="small muted">à ${eur(r.soldStats.median)}</span>` : (r.avgFavourites || 0).toLocaleString("fr-FR")}</div></div>
    </div>
    ${!state.me?.pro ? `<p class="small muted">Les ventes réellement constatées sur Vinted sont incluses avec AliEdge Pro.</p>` : ""}
    ${hist.length ? `
    <div class="card pad">
      <div class="row between"><h3>Prix des annonces</h3><span class="small muted">barre violette : prix conseillé</span></div>
      <div class="histo" aria-hidden="true">${hist.map((b, i) => `<div class="bar ${r.sell >= b.from && r.sell <= b.to ? "hit" : ""}" style="height:${Math.max(4, (b.count / maxCount) * 100)}%;animation-delay:${i * 30}ms" title="${eur(b.from)} – ${eur(b.to)} : ${b.count}"></div>`).join("")}</div>
      <div class="histo-axis num"><span>${eur(hist[0].from)}</span><span>${eur(hist[hist.length - 1].to)}</span></div>
    </div>` : ""}
    <div id="lbcbox"></div>
    <div class="grid3">
      <button class="btn" type="button" data-act="watch" data-key="${esc(watchKey)}">${ICON.eye}Suivre</button>
      <button class="btn" type="button" data-act="copy" title="Titre, description, catégorie et prix conseillé, prêts à copier">${ICON.copy}Annonce</button>
      <button class="btn" type="button" data-act="photos" title="Créer des photos réalistes avec Barapics, sans quitter AliEdge">${ICON.camera}Photos</button>
    </div>
    <details class="card pad">
      <summary style="cursor:pointer;font-weight:600">Texte d'annonce prêt à coller</summary>
      <div class="stack" style="margin-top:10px">
        <input class="input" readonly value="${esc(listing.title)}" aria-label="Titre de l'annonce">
        <textarea class="input" rows="7" readonly aria-label="Description de l'annonce">${esc(listing.description)}</textarea>
      </div>
    </details>
    <div class="row between"><h3>Annonces Vinted retenues</h3><span class="small muted">Décoche celles qui ne correspondent pas</span></div>
    <div class="items">
      ${entry.items.map((i) => `
        <div class="item ${i.excluded ? "off" : ""}">
          ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div>
            <a class="t" href="${safeUrl(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>
            <div class="m">${(i.visual ?? 0) >= 0.6 ? `<span class="badge-photo">Même photo</span> ` : ""}${[i.brand, i.size, i.condition].filter(Boolean).map(esc).join(" · ")}${i.favourites != null ? ` · ♥ ${i.favourites}` : ""}</div>
          </div>
          <div class="stack" style="text-align:right">
            <div class="p num">${eur(i.price)}</div>
            <input type="checkbox" ${i.excluded ? "" : "checked"} data-exclude="${i.vinted_id}" aria-label="Garder cette annonce dans le calcul">
          </div>
        </div>`).join("")}
    </div>
    ${entry.sold?.length ? `
      <h3>Ventes constatées</h3>
      <div class="items">${entry.sold.map((i) => `
        <div class="item">
          ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div><a class="t" href="${safeUrl(i.url)}" target="_blank" rel="noopener">${esc(i.title || "Annonce Vinted")}</a><div class="m"><span class="badge-sold">Vendu</span> ${esc(ago(i.sold_at))}</div></div>
          <div class="p num">${eur(i.price)}</div>
        </div>`).join("")}</div>` : ""}
    <p class="small muted">Analyse du ${new Date(entry.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · ${esc((MARKETS[entry.market] || MARKETS.fr).label)} · ${entry.quota ? `${entry.quota.used}/${entry.quota.limit} analyses aujourd'hui` : ""}</p>
  </section>`;
}

// Fiche officielle AliExpress (API Drop Shipping, via le serveur) : prix livré en France, stock, note. Affichée
// seulement quand le serveur répond ; rien ne change sinon.
async function loadAliOfficial() {
  const box = document.getElementById("aliofficial");
  const p = state.product;
  if (!box || !p || p.platform !== "aliexpress" || !p.url) return;
  const o = await api("ali:official", { url: p.url }).catch(() => null);
  if (!o || !document.body.contains(box) || state.product !== p) return;
  const range = o.price != null ? (o.priceMax && o.priceMax !== o.price ? `${eur(o.price)} à ${eur(o.priceMax)}` : eur(o.price)) : null;
  const bits = [range && `<b class="num">${range}</b> livré en France`, o.stock != null && `${o.stock.toLocaleString("fr-FR")} en stock`, o.rating && `note ${String(o.rating).replace(".", ",")}/5`, o.orders && `${Number(o.orders).toLocaleString("fr-FR")} ventes`, o.delivery && `livraison ${esc(o.delivery)} j`].filter(Boolean);
  if (!bits.length) return;
  box.innerHTML = `<div class="notice info small" style="margin:0"><b>Fiche officielle AliExpress</b> · ${bits.join(" · ")}${o.store ? ` · boutique ${esc(o.store)}` : ""}${o.price != null && productPrice() == null ? ` <button class="btn ghost small" type="button" id="useofficial">Utiliser ce prix</button>` : ""}</div>`;
  document.getElementById("useofficial")?.addEventListener("click", () => { state.priceOverride = o.price; render(); });
}

function bindAnalyse() {
  loadAliOfficial();
  const parseNum = (v) => {
    const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  };
  const q = document.getElementById("query");
  q?.addEventListener("input", () => { state.query = q.value; });
  q?.addEventListener("keydown", (e) => { if (e.key === "Enter") startAnalysis(); });
  document.getElementById("price")?.addEventListener("change", (e) => { state.priceOverride = parseNum(e.target.value); recomputeIfNeeded(); });
  document.getElementById("shipping")?.addEventListener("change", (e) => { state.shipping = parseNum(e.target.value) || 0; recomputeIfNeeded(); });
  document.getElementById("market")?.addEventListener("change", (e) => saveSettings({ market: e.target.value }));
  document.getElementById("condition")?.addEventListener("change", (e) => saveSettings({ condition: e.target.value }));
  document.getElementById("go")?.addEventListener("click", startAnalysis);
  document.querySelectorAll("[data-exclude]").forEach((cb) => cb.addEventListener("change", recomputeIfNeeded));
  document.querySelector('[data-act="watch"]')?.addEventListener("click", async () => {
    try { await api("watch:add", { entry: state.entry }); toast("Produit suivi : prix Vinted revérifié toutes les 6 h"); }
    catch (e) { toast(e.message); }
  });
  document.querySelector('[data-act="copy"]')?.addEventListener("click", () => openListing(state.entry));
  document.querySelector('[data-act="photos"]')?.addEventListener("click", () => openPhotos(state.entry?.product));
  document.querySelectorAll(".ring circle.meter").forEach((c) => requestAnimationFrame(() => { c.style.strokeDashoffset = c.dataset.target; }));
  bindSmart();
}

async function recomputeIfNeeded() {
  if (!state.entry) { render(); return; }
  const excluded = [...document.querySelectorAll("[data-exclude]")].filter((c) => !c.checked).map((c) => Number(c.dataset.exclude));
  const entry = { ...state.entry, product: state.entry.product ? { ...state.entry.product, priceEur: productPrice() ?? state.entry.product.priceEur } : { priceEur: productPrice() } };
  try {
    state.entry = await api("recompute", { entry, shipping: state.shipping, excluded });
  } catch (e) { toast(e.message); }
  render();
}

async function saveSettings(patch) {
  try { state.settings = (await api("settings:set", { patch })).settings; } catch (e) { toast(e.message); }
}

// ───────────────────────── Catalogue

async function loadCatalog(append = false) {
  const c = state.catalog;
  if (!state.me) { render(); return; }
  c.loading = true;
  c.error = null;
  if (!append) c.rows = [];
  render();
  try {
    const rows = await api("catalog", { filters: { ...c.filters, platform: c.filters.platform || null, search: c.filters.search || null, offset: append ? c.rows.length : 0, limit: isTab ? 40 : 20 } });
    c.rows = append ? [...c.rows, ...rows] : rows;
    c.total = rows[0]?.total_count ?? c.rows.length;
  } catch (e) {
    c.error = e.message;
  } finally {
    c.loading = false;
    render();
  }
}

function viewCatalogue() {
  if (!state.me) {
    return `<div class="card empty">${ICON.chart}<h2>Les produits qui se vendent déjà</h2><p class="muted">Connecte-toi pour voir les produits AliExpress, Temu et Shein déjà vendus sur Vinted, avec leur marge.</p><a class="btn primary" style="margin-top:12px" href="#/compte">Se connecter</a></div>`;
  }
  const c = state.catalog;
  const f = c.filters;
  const sorts = [["sold", "Plus vendus"], ["trend", "Tendance 7 j"], ["margin", "Meilleure marge"], ["recent", "Récents"]];
  const head = `
    <div class="stack">
      <div class="filters">
        <label class="sr-only" for="csearch">Rechercher</label>
        <input id="csearch" class="input" type="search" placeholder="Rechercher un produit…" value="${esc(f.search)}">
        <select id="cplatform" class="input" aria-label="Plateforme">
          <option value="">Toutes les plateformes</option>
          <option value="aliexpress" ${f.platform === "aliexpress" ? "selected" : ""}>AliExpress</option>
          <option value="temu" ${f.platform === "temu" ? "selected" : ""}>Temu</option>
          <option value="shein" ${f.platform === "shein" ? "selected" : ""}>Shein</option>
        </select>
      </div>
      <div class="seg" role="group" aria-label="Trier">${sorts.map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${f.sort === k}">${l}</button>`).join("")}</div>
      <section class="picks" id="picks" aria-label="Sélection VintedDrop"></section>
      <details class="card pad trends fold" id="trends">
        <summary><b>Tendances du marché Vinted</b><span class="small muted">30 derniers jours</span></summary>
        <div id="trendsbody" style="margin-top:10px"><div class="skel" style="height:60px"></div></div>
      </details>
      <details class="card pad import-vinted fold">
        <summary><b>Ajouter au catalogue</b></summary>
        <div class="stack" style="margin-top:10px">
          <div class="import-row">
            <button id="import-page" class="btn block" type="button">${ICON.tag}Ajouter les produits de la page ouverte</button>
            <p id="import-status" class="small muted" aria-live="polite"></p>
            <span class="small muted">Sur une recherche AliExpress, Temu ou Shein : AliEdge ajoute les produits affichés et vérifie leurs ventes Vinted.</span>
          </div>
          <form id="vintedimport" class="stack">
            <textarea class="input" id="vintedlinks" rows="3" placeholder="Liens d'annonces Vinted, un par ligne (20 au plus)" aria-label="Liens d'annonces Vinted"></textarea>
            <button class="btn" type="submit">Ajouter ces annonces</button>
          </form>
        </div>
      </details>
      ${!state.me.pro ? `<div class="notice info row between wrap"><span>Version gratuite : les 3 premiers produits sont visibles.</span><a class="btn primary" href="${BUY_URL}" target="_blank" rel="noopener">Tout débloquer</a></div>` : ""}
    </div>`;
  let body;
  if (c.loading && !c.rows.length) {
    body = `<div class="cat-grid">${Array.from({ length: 6 }, () => `<div class="card"><div class="skel" style="aspect-ratio:1;border-radius:14px 14px 0 0"></div><div class="pad stack"><div class="skel" style="height:12px"></div><div class="skel" style="height:12px;width:60%"></div></div></div>`).join("")}</div>`;
  } else if (c.error) {
    body = `<div class="notice err">${esc(c.error)}</div>`;
  } else if (!c.rows.length) {
    body = `<div class="card empty">${ICON.tag}<h2>Le catalogue se remplit</h2><p class="muted">Ici s'affichent les produits fournisseurs déjà vendus sur Vinted (les ventes sans fournisseur identifié sont listées plus bas). Chaque fiche consultée par les membres est suivie, et apparaît ici dès sa première vente constatée. Pour accélérer, ouvre une page de résultats AliExpress, Temu ou Shein et clique sur « Ajouter les produits de la page ouverte ».</p></div>`;
  } else {
    body = `<div class="cat-grid">${c.rows.map((r, i) => `
      <button type="button" class="pcard ${r.locked ? "locked" : ""}" data-pid="${esc(r.product_id)}" style="animation-delay:${Math.min(i, 12) * 35}ms">
        <div class="img">
          ${r.image_url ? `<img src="${safeUrl(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : (r.vinted_photos?.[0] ? `<img src="${safeUrl(r.vinted_photos[0])}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "")}
          ${chip(r.platform)}
          <span class="sold num">${r.sold_30d} vendu${r.sold_30d > 1 ? "s" : ""} / 30 j</span>
        </div>
        <div class="body">
          <div class="title">${esc(r.title)}</div>
          <div class="nums">
            <span>Achat<b class="num">${eur(r.price)}</b></span>
            <span>Vinted<b class="num">${eur(r.median_sold_price ?? r.median_active_price)}</b></span>
            <span>Marge<b class="num gain">${eur(r.est_margin, true)}</b></span>
          </div>
        </div>
        ${r.locked ? `<div class="lock"><span>Pro</span></div>` : ""}
      </button>`).join("")}</div>
      ${c.rows.length < c.total ? `<button id="more" class="btn block" type="button" ${c.loading ? "disabled" : ""}>Voir plus</button>` : ""}`;
  }
  return head + `<div style="margin-top:12px">${body}</div><section class="stack" id="salesfeed" style="margin-top:22px" aria-label="Ventes Vinted constatées"></section>`;
}

/** Toutes les ventes Vinted constatées, même quand le fournisseur n'est pas encore identifié. */
async function loadSalesFeed(append = false) {
  const box = document.getElementById("salesfeed");
  if (!box || !state.me) return;
  const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignoré */ } };
  const sf = state.salesFeed || (state.salesFeed = { rows: [], total: 0, key: null, at: 0, dropship: pref("ae_dropship", "1") !== "0", platform: pref("ae_sales_platform", "vinted") === "lbc" ? "lbc" : "vinted", lbcOn: null });
  const lbc = sf.platform === "lbc";
  if (lbc && sf.lbcOn !== true) sf.lbcOn = (await api("lbc:status").catch(() => ({ enabled: false }))).enabled;
  const key = `${sf.platform}|${sf.dropship ? 1 : 0}|${state.catalog.filters.search || ""}`;
  const name = lbc ? "Leboncoin" : "Vinted";
  const head = (extra = "") => `
    <div class="row between wrap"><h2>Ventes ${name} constatées</h2>${extra}</div>
    <div class="row between wrap" style="gap:10px">
      <div class="seg" role="group" aria-label="Plateforme de revente"><button type="button" data-plat="vinted" aria-pressed="${!lbc}">Vinted</button><button type="button" data-plat="lbc" aria-pressed="${lbc}">Leboncoin</button></div>
      <label class="switch" style="padding:0;border:0" title="Écarte les grandes marques connues (Nike, Adidas, Zara…)"><span><b>Dropshipping uniquement</b></span><input type="checkbox" id="dropship" ${sf.dropship ? "checked" : ""}></label>
    </div>`;
  const bindHead = () => {
    document.getElementById("dropship")?.addEventListener("change", (e) => { sf.dropship = e.currentTarget.checked; save("ae_dropship", sf.dropship ? "1" : "0"); loadSalesFeed(); });
    box.querySelectorAll("[data-plat]").forEach((b) => b.addEventListener("click", () => { sf.platform = b.dataset.plat; save("ae_sales_platform", sf.platform); loadSalesFeed(); }));
  };
  if (lbc && !sf.lbcOn) {
    box.innerHTML = `${head()}
      <div class="card pad stack" style="gap:8px">
        <b>Active Leboncoin dans AliEdge</b>
        <p class="small muted" style="margin:0">AliEdge lira les annonces Leboncoin que tu affiches (recherches, annonces) pour repérer celles qui se vendent. Aucune requête en plus vers Leboncoin, rien n'est publié ni envoyé à ta place, et ton compte n'est jamais partagé.</p>
        <button class="btn primary" type="button" id="lbcenable">Activer Leboncoin</button>
      </div>`;
    bindHead();
    document.getElementById("lbcenable")?.addEventListener("click", async () => {
      const ok = await enableLbc();
      if (ok) { sf.lbcOn = (await api("lbc:status").catch(() => ({ enabled: true }))).enabled; toast("Leboncoin activé : ouvre une recherche sur leboncoin.fr"); sf.key = null; loadSalesFeed(); }
      else toast("Accès à leboncoin.fr refusé : rien n'a changé.");
    });
    return;
  }
  // Le catalogue se redessine souvent : on réutilise la liste chargée (2 min) tant que rien ne change.
  if (append || sf.key !== key || Date.now() - sf.at > 120_000) {
    let rows;
    try { rows = await api(lbc ? "lbc:feed" : "sales:feed", { search: state.catalog.filters.search || null, offset: append ? sf.rows.length : 0, dropship: sf.dropship }); }
    catch { box.innerHTML = ""; return; }
    sf.rows = append ? [...sf.rows, ...rows] : rows;
    sf.total = Number(rows[0]?.total_count ?? sf.rows.length);
    sf.key = key; sf.at = Date.now();
  }
  if (!document.body.contains(box)) return;
  if (!sf.rows.length) {
    box.innerHTML = `${head()}<p class="small muted" style="margin:0">${lbc ? "Aucune vente Leboncoin repérée pour l'instant. Elles apparaissent quand des annonces vues par les membres disparaissent ou passent en « vendu »." : sf.dropship ? "Aucune vente de produit sans grande marque pour l'instant. Désactive le filtre pour voir toutes les ventes." : "Aucune vente constatée pour l'instant."}</p>`;
    bindHead();
    return;
  }
  const badge = (r) => r.certainty && r.certainty !== "sold"
    ? `<span class="badge-sold" title="${lbc ? "L'annonce a disparu moins de 30 jours après sa mise en ligne" : "L'annonce n'apparaît plus dans les recherches alors que les autres annonces du même produit si"}">Vendu (estimation)</span>`
    : `<span class="badge-sold">Vendu</span>`;
  const extra = (r) => lbc ? `${r.department ? ` · ${esc(r.department)}` : ""}${r.shipping ? " · livraison" : ""}` : r.brand ? ` · ${esc(r.brand)}` : "";
  const line = (r) => `
    <div class="sale-row">
      <a class="item" href="${safeUrl(r.url)}" target="_blank" rel="noopener" data-sale="${esc(r.list_id || r.vinted_id)}" style="grid-template-columns:56px 1fr auto">
        ${r.photo_url ? `<img src="${safeUrl(r.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
        <div><div class="t">${esc(r.title || `Annonce ${name}`)}</div><div class="m">${badge(r)} ${esc(ago(new Date(r.sold_at).getTime()))}${r.days_to_sell != null ? ` · parti en ${esc(String(r.days_to_sell).replace(".", ","))} j` : ""}${extra(r)}</div></div>
        <div class="p num">${r.price != null ? eur(Number(r.price)) : ""}</div>
      </a>${supplierHtml(r)}
    </div>`;
  box.innerHTML = `${head(`<span class="small muted">${sf.total} vente${sf.total > 1 ? "s" : ""}</span>`)}
    <p class="small muted" style="margin:0">${lbc ? "Leboncoin ne publie pas ses ventes : « Vendu » quand Leboncoin l'affiche, « estimation » quand l'annonce a disparu moins de 30 jours après sa mise en ligne." : "Chaque annonce vue vendue par la communauté, même quand le fournisseur n'est pas encore identifié."} Trouve le fournisseur et relie-le : il rejoint le catalogue pour tout le monde.</p>
    ${lbc ? `<details class="card pad fold" id="lbcbest"><summary><b>Quand publier sur Leboncoin</b></summary><div id="lbcbestbody" style="margin-top:10px"><div class="skel" style="height:80px"></div></div></details>` : ""}
    <div class="items">${sf.rows.map(line).join("")}</div>
    ${sf.rows.length < sf.total ? `<button id="salesmore" class="btn block" type="button">Voir plus de ventes</button>` : ""}`;
  document.getElementById("lbcbest")?.addEventListener("toggle", async (e) => {
    if (!e.target.open || e.target.dataset.loaded) return;
    e.target.dataset.loaded = "1";
    const d = await api("lbc:bestTimes", { search: state.catalog.filters.search || null }).catch(() => null);
    document.getElementById("lbcbestbody").innerHTML = lbcBestHtml(d);
  });
  bindSupplierForms(box);
  bindHead();
  document.getElementById("salesmore")?.addEventListener("click", () => loadSalesFeed(true));
  box.querySelectorAll("[data-sale]").forEach((a) => a.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // ouvrir dans un onglet : comportement normal
    e.preventDefault();
    const r = sf.rows.find((x) => String(x.list_id || x.vinted_id) === a.dataset.sale);
    if (r) openSaleSheet(r, lbc);
  }));
}

/** Fiche d'une vente : infos, lien vers l'annonce, délai de vente, et fournisseurs probables tirés de la base commune. */
const SUP_REASON = { linked: "Relié à cette annonce", similar_sale: "Relié à une vente au titre proche", similar_title: "Titre proche", photo: "Trouvé par la photo" };
async function openSaleSheet(r, lbc) {
  document.getElementById("salesheet")?.remove();
  const d = document.createElement("dialog");
  d.id = "salesheet"; d.className = "salesheet";
  const site = lbc ? "Leboncoin" : "Vinted";
  const rows = [
    ["Prix", r.price != null ? eur(Number(r.price)) : "—"],
    ["Vendu", `${esc(ago(new Date(r.sold_at).getTime()))}${r.certainty && r.certainty !== "sold" ? " (estimation)" : ""}`],
    ["Parti en", r.days_to_sell != null ? `${esc(String(r.days_to_sell).replace(".", ","))} j` : "délai inconnu"],
    ...(lbc ? [["Département", esc(r.department || "—")], ["Livraison", r.shipping ? "oui" : "non"]] : [["Marque", esc(r.brand || "—")], ["Taille", esc(r.size || "—")]]),
  ];
  d.innerHTML = `<div style="position:relative">
    <button class="btn ghost small close" type="button" data-close aria-label="Fermer">✕</button>
    <div class="sh">
      <div class="sh-l">
        ${r.photo_url ? `<img src="${safeUrl(r.photo_url)}" alt="" referrerpolicy="no-referrer">` : ""}
        <h3 style="margin:12px 0 0;font-size:15px">${esc(r.title || `Annonce ${site}`)}</h3>
        <div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("")}</div>
        <a class="btn primary block" href="${safeUrl(r.url)}" target="_blank" rel="noopener">Voir l'annonce sur ${site}</a>
      </div>
      <div class="sh-r">
        <h3 style="margin:0;font-size:15px">Fournisseurs probables</h3>
        <p class="small muted" style="margin:0">Tirés du catalogue AliEdge, puis vérifiés par la photo : chaque produit est comparé à la photo de la vente. Vérifie toujours que c'est le même article avant de commander.</p>
        <div class="stack" id="shsup" style="gap:8px"><div class="skel" style="height:64px"></div><div class="skel" style="height:64px"></div></div>
        <details class="small"><summary>Chercher ailleurs</summary><div class="row wrap" style="gap:6px;margin-top:6px">${supplierLinks(r).map(([n, u]) => `<a class="btn ghost small" href="${safeUrl(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join("")}</div></details>
      </div>
    </div></div>`;
  document.body.appendChild(d);
  d.querySelector("[data-close]").addEventListener("click", () => d.close());
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.showModal();
  const platform = lbc ? "lbc" : "vinted";
  const id = Number(r.list_id || r.vinted_id);
  const box = d.querySelector("#shsup");
  const paint = (list, visual) => {
    if (!box?.isConnected) return;
    box.innerHTML = list.length ? list.map((p) => {
      const margin = Number(r.price) && Number(p.price) ? Number(r.price) - Number(p.price) : null;
      const why = visual && p.score ? `Même article à ${Math.round(p.score * 100)} % (photo)` : SUP_REASON[p.reason] || "";
      return `<a class="sup" href="${safeUrl(p.url)}" target="_blank" rel="noopener">${p.image_url ? `<img src="${safeUrl(p.image_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
        <div><div class="t">${esc(p.title)}</div><div class="small muted">${esc(PLATFORM_NAME[p.platform] || p.platform)} · ${esc(why)}</div></div>
        <div class="num" style="text-align:right">${p.price != null ? `<b>${eur(Number(p.price))}</b>` : ""}${margin != null ? `<div class="small" style="color:${margin > 0 ? "var(--gain)" : "var(--loss)"}">${eur(margin, true)}</div>` : ""}</div></a>`;
    }).join("") : `<p class="small muted" style="margin:0">${visual ? "Aucun produit du catalogue ne ressemble vraiment à cette photo. Essaie Google Lens ci-dessous : il cherche par l'image." : "Aucun fournisseur trouvé dans la base pour l'instant. Cherche-le avec les liens ci-dessous et relie-le depuis la liste des ventes : il servira à tout le monde."}</p>`;
  };
  // 1. Par le titre, tout de suite (base commune). 2. Par la photo : chaque candidat est comparé à la photo de la vente.
  const res = await api("sales:suppliers", { platform, id }).catch(() => null);
  const byTitle = res?.suppliers || [];
  paint(byTitle, false);
  if (!r.photo_url || !box?.isConnected) return;
  box.insertAdjacentHTML("beforebegin", '<p class="small muted" id="shvis" style="margin:0">Recherche par image en cours…</p>');
  try {
    const v = await api("barapics", { body: { action: "suppliers", platform, id, photo: r.photo_url, title: r.title || "" } });
    d.querySelector("#shvis")?.remove();
    paint(v.suppliers || [], true);
  } catch {
    const s = d.querySelector("#shvis");
    if (s) s.textContent = "Recherche par image indisponible pour le moment : résultats par le titre.";
  }
}

async function loadPicks() {
  const box = document.getElementById("picks");
  if (!box) return;
  const [feed, ch] = await Promise.all([api("picks").catch(() => null), api("challenge").catch(() => null)]);
  const picks = feed?.picks || [];
  const bar = ch && feed?.member ? `<div class="challenge"><div class="row between"><span class="small"><b>Défi Skool :</b> ${ch.installed} / ${ch.goal} membres utilisent AliEdge</span><span class="small muted">${Math.min(100, Math.round((ch.installed / Math.max(1, ch.goal)) * 100))} %</span></div><div class="cbar"><i style="width:${Math.min(100, (ch.installed / Math.max(1, ch.goal)) * 100)}%"></i></div></div>` : "";
  if (!picks.length) { box.innerHTML = bar; return; }
  box.innerHTML = `
    <div class="row between"><h2>Sélection VintedDrop</h2>${feed.member ? '<span class="pill-on">Membre du Skool</span>' : ""}</div>
    ${bar}
    <div class="picks-row">${picks.slice(0, 8).map((p, i) => p.locked ? `
      <a class="pick locked" href="${SKOOL_URL}" target="_blank" rel="noopener" style="animation-delay:${i * 40}ms">
        <span class="kind">${p.kind === "video" ? "Vidéo d'analyse" : "Produit gagnant"}</span>
        <b>${esc(p.title)}</b>
        <span class="small">🔒 Réservé aux membres du Skool VintedDrop</span>
      </a>` : `
      <a class="pick" href="${safeUrl(p.url)}" target="_blank" rel="noopener" style="animation-delay:${i * 40}ms">
        ${p.image_url ? `<img src="${safeUrl(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <span class="kind">${p.kind === "video" ? "🎬 Vidéo d'analyse" : "🛍️ Produit gagnant"}</span>
        <b>${esc(p.title)}</b>
        ${p.note ? `<span class="small muted">${esc(p.note)}</span>` : ""}
      </a>`).join("")}</div>
    ${!feed.member ? `<a class="btn block" href="${SKOOL_URL}" target="_blank" rel="noopener">Rejoindre le Skool VintedDrop pour tout débloquer</a>` : ""}`;
}

const DOW = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
async function loadTrends() {
  const box = document.getElementById("trendsbody");
  if (!box) return;
  let t;
  try { t = await api("trends", { days: 30 }); } catch (e) { box.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  if (!t?.sold) { box.innerHTML = `<p class="small muted">Pas encore assez de ventes constatées. Les tendances apparaissent au fil des analyses et des suivis des membres.</p>`; return; }
  const list = (rows) => rows.map((r, i) => `<li><span class="num rank">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="num">${r.sold} vente${r.sold > 1 ? "s" : ""}</span><span class="num muted">${eur(r.median_price)}</span></li>`).join("");
  // Meilleurs créneaux : jour × tranche de 3 h, d'après l'heure de publication des annonces qui se sont vendues.
  const cells = {};
  for (const h of t.hours || []) { const k = `${h.dow}-${Math.floor(h.hour / 3)}`; cells[k] = (cells[k] || 0) + h.sold; }
  const maxCell = Math.max(1, ...Object.values(cells));
  const best = Object.entries(cells).sort((a, b) => b[1] - a[1])[0];
  box.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="k">Ventes constatées</div><div class="v num">${t.sold}</div></div>
      <div class="stat"><div class="k">Délai de vente médian</div><div class="v num">${t.median_days_to_sell != null ? `${String(t.median_days_to_sell).replace(".", ",")} j` : "—"}</div></div>
    </div>
    ${t.categories?.length ? `<h3 class="small" style="margin-top:12px">Catégories qui vendent</h3><ol class="trend-list">${list(t.categories)}</ol>` : ""}
    ${t.brands?.length ? `<h3 class="small" style="margin-top:12px">Marques qui vendent</h3><ol class="trend-list">${list(t.brands)}</ol>` : ""}
    ${Object.keys(cells).length ? `<h3 class="small" style="margin-top:12px">Quand publier</h3>
      <div class="heat" role="img" aria-label="Heures de publication des annonces vendues">
        <span></span>${["0h", "3h", "6h", "9h", "12h", "15h", "18h", "21h"].map((h) => `<span class="hh">${h}</span>`).join("")}
        ${DOW.map((dname, i) => `<span class="dd">${dname}</span>${Array.from({ length: 8 }, (_, b) => { const v = cells[`${i + 1}-${b}`] || 0; return `<span class="hc" style="opacity:${v ? 0.18 + 0.82 * (v / maxCell) : 0.06}" title="${dname} ${b * 3}h-${b * 3 + 3}h : ${v} vente(s)"></span>`; }).join("")}`).join("")}
      </div>
      ${best ? `<p class="small muted">Meilleur créneau observé : ${DOW[Number(best[0].split("-")[0]) - 1]} entre ${Number(best[0].split("-")[1]) * 3} h et ${Number(best[0].split("-")[1]) * 3 + 3} h.</p>` : ""}` : ""}`;
}

/** Heures de dépôt estimées des annonces Leboncoin vendues (date de vente moins délai de vente). */
function lbcBestHtml(d) {
  if (!d || d.n < 10) return `<p class="small muted">Pas encore assez de ventes Leboncoin repérées pour en tirer une tendance. Elles s'accumulent au fil des pages ouvertes par les membres.</p>`;
  const max = Math.max(1, ...d.grid.flat());
  let best = null;
  d.grid.forEach((row, i) => row.forEach((v, b) => { if (!best || v > best.v) best = { v, i, b }; }));
  return `<div class="heat" role="img" aria-label="Heures de dépôt des annonces Leboncoin vendues">
      <span></span>${["0h", "3h", "6h", "9h", "12h", "15h", "18h", "21h"].map((h) => `<span class="hh">${h}</span>`).join("")}
      ${DOW.map((dname, i) => `<span class="dd">${dname}</span>${d.grid[i].map((v, b) => `<span class="hc" style="opacity:${v ? 0.18 + 0.82 * (v / max) : 0.06}" title="${dname} ${b * 3}h-${b * 3 + 3}h : ${v} vente(s)"></span>`).join("")}`).join("")}
    </div>
    <p class="small muted">${best?.v ? `Meilleur créneau observé : ${DOW[best.i]} entre ${best.b * 3} h et ${best.b * 3 + 3} h. ` : ""}Estimation d'après ${d.n} ventes Leboncoin repérées (les ventes en moins de 7 jours comptent double).</p>`;
}

let searchTimer = null;
function bindCatalogue() {
  loadPicks();
  loadSalesFeed();
  document.getElementById("trends")?.addEventListener("toggle", (e) => { if (e.target.open) loadTrends(); }, { once: true });
  const c = state.catalog;
  document.getElementById("csearch")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { c.filters.search = e.target.value.trim(); loadCatalog(); }, 350);
  });
  document.getElementById("cplatform")?.addEventListener("change", (e) => { c.filters.platform = e.target.value; loadCatalog(); });
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { c.filters.sort = b.dataset.sort; loadCatalog(); }));
  document.getElementById("more")?.addEventListener("click", () => loadCatalog(true));
  document.getElementById("vintedimport")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Lecture des annonces…";
    try {
      const r = await api("catalog:importVinted", { links: document.getElementById("vintedlinks").value });
      toast(`${r.added} annonce${r.added > 1 ? "s" : ""} ajoutée${r.added > 1 ? "s" : ""}${r.sold ? `, dont ${r.sold} vendue${r.sold > 1 ? "s" : ""}` : ""}${r.failed ? ` · ${r.failed} illisible${r.failed > 1 ? "s" : ""}` : ""}`);
      document.getElementById("vintedlinks").value = "";
    } catch (err) { toast(err.message); }
    btn.disabled = false;
    btn.textContent = "Ajouter au catalogue";
  });
  importStatus();
  document.getElementById("import-page")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Lecture de la page…";
    try {
      const r = await api("catalog:importPage");
      toast(`${r.found} produit${r.found > 1 ? "s" : ""} ajouté${r.found > 1 ? "s" : ""}. Ils sont reliés aux annonces Vinted de la base en comparant les photos, sans aucune recherche sur Vinted : ils apparaissent dans le catalogue dès qu'une annonce correspond.`);
      btn.disabled = false;
      btn.innerHTML = `${ICON.tag}Ajouter les produits de la page ouverte`;
      importStatus();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.innerHTML = `${ICON.tag}Ajouter les produits de la page ouverte`;
    }
  });
  document.querySelectorAll("[data-pid]").forEach((b) => b.addEventListener("click", () => openProduct(c.rows.find((r) => r.product_id === b.dataset.pid))));
}

/** Progression de la recherche Vinted des produits importés (affichée sous le bouton). */
async function importStatus() {
  const box = document.getElementById("import-status");
  if (!box) return;
  const st = await api("catalog:importStatus").catch(() => null);
  if (!st || !st.left) { box.textContent = ""; return; }
  const done = Math.max(0, st.total - st.left);
  box.innerHTML = `Recherche Vinted des produits ajoutés : <b>${done} / ${st.total}</b> · environ ${Math.ceil(st.left / 2)} min restantes`;
  const fold = box.closest("details"); if (fold) fold.open = true; // import en cours : on le montre
}

/** Indicateurs d'un produit : taux de vente, saturation, délai, prix qui fait vendre, tendance. */
const TREND = { up: ["En hausse", "gain"], down: ["En baisse", "loss"], flat: ["Stable", ""], unknown: ["Pas encore assez de ventes", ""] };
function indicatorsHtml(st) {
  const small = (st.sample || 0) < 5;
  const sat = st.saturation == null ? "—" : `${String(st.saturation).replace(".", ",")} annonce${st.saturation >= 2 ? "s" : ""} / vente`;
  const satLevel = st.saturation == null ? "" : st.saturation <= 3 ? "gain" : st.saturation >= 10 ? "loss" : "";
  const t = TREND[st.trend] || TREND.unknown;
  return `<h3>Indicateurs</h3>
    <div class="stats">
      <div class="stat"><div class="k">Taux de vente (30 j)</div><div class="v num">${st.sell_through == null ? "—" : `${st.sell_through} %`}</div></div>
      <div class="stat"><div class="k">Saturation</div><div class="v num ${satLevel === "gain" ? "pos" : satLevel === "loss" ? "neg" : ""}" style="font-size:15px">${sat}</div></div>
      <div class="stat"><div class="k">Délai de vente médian</div><div class="v num">${st.median_days == null ? "—" : `${String(st.median_days).replace(".", ",")} j`}</div></div>
      <div class="stat"><div class="k">Prix qui fait vendre</div><div class="v num">${eur(st.median_sold_price)}</div></div>
    </div>
    <p class="small muted" style="margin-top:6px"><span class="pill ${t[1]}">${t[0]}</span> ${st.sold_30d || 0} vendu${st.sold_30d > 1 ? "s" : ""} ce mois-ci contre ${st.sold_prev_30d || 0} le mois d'avant${st.probable_30d ? ` · ${st.probable_30d} vente${st.probable_30d > 1 ? "s" : ""} probable${st.probable_30d > 1 ? "s" : ""} (annonce disparue des recherches)` : ""}${st.median_active_price != null ? ` · prix demandé en ligne ${eur(st.median_active_price)}` : ""}${st.fav_per_day != null ? ` · ${String(st.fav_per_day).replace(".", ",")} favori/jour` : ""}.</p>
    ${small ? `<p class="small muted">Estimation sur peu de ventes : à confirmer avec l'analyse.</p>` : ""}`;
}

async function openProduct(row) {
  if (!row) return;
  if (row.locked) { window.open(BUY_URL, "_blank", "noopener"); return; }
  closeDrawer();
  const bg = document.createElement("div");
  bg.className = "drawer-bg";
  const d = document.createElement("div");
  d.className = "drawer";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-label", row.title);
  d.innerHTML = `
    <div class="stack">
      <div class="row between"><div class="row" style="gap:6px">${chip(row.platform)}<span class="chip">${esc(row.category || "Autres")}</span></div><button class="btn ghost" type="button" data-close aria-label="Fermer">✕</button></div>
      <div class="product">${row.image_url ? `<img src="${safeUrl(row.image_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}<div><h3>${esc(row.title)}</h3><p class="small muted" style="margin-top:4px">Analysé ${esc(row.analyses)} fois par les membres</p></div></div>
      <div class="stats">
        <div class="stat"><div class="k">Vendus 7 j / 30 j</div><div class="v num">${row.sold_7d} / ${row.sold_30d}</div></div>
        <div class="stat"><div class="k">En vente</div><div class="v num">${row.active_count}</div></div>
        <div class="stat"><div class="k">Prix vendu médian</div><div class="v num">${eur(row.median_sold_price)}</div></div>
        <div class="stat"><div class="k">Marge estimée</div><div class="v num" style="color:var(--gain)">${eur(row.est_margin, true)}</div></div>
      </div>
      <div class="grid2">
        <a class="btn primary" href="${safeUrl(row.url)}" target="_blank" rel="noopener">${ICON.ext}Voir chez ${esc(PLATFORM[row.platform]?.[0] || "le fournisseur")}</a>
        <button class="btn" type="button" data-save>${ICON.eye}Enregistrer</button>
      </div>
      <p class="small muted">Ouvre la fiche puis clique sur « Analyser sur Vinted » pour le calcul complet avec ton prix.</p>
      <div id="dstats"></div>
      <div id="dhistory"></div>
      <h3>Annonces Vinted</h3>
      <div class="items" id="ditems"><div class="skel" style="height:72px"></div><div class="skel" style="height:72px"></div></div>
    </div>`;
  document.body.append(bg, d);
  const close = () => closeDrawer();
  bg.addEventListener("click", close);
  d.querySelector("[data-close]").addEventListener("click", close);
  d.querySelector("[data-close]").focus();
  d.querySelector("[data-save]").addEventListener("click", async () => {
    try { await api("saved:add", { productId: row.product_id }); toast("Produit enregistré dans Suivis"); } catch (e) { toast(e.message); }
  });
  api("catalog:stats", { ids: [row.product_id] }).then((rows) => {
    const box = d.querySelector("#dstats");
    const st = (rows || [])[0];
    if (box && st) box.innerHTML = indicatorsHtml(st);
  }).catch(() => {});
  api("product:history", { productId: row.product_id }).then((h) => {
    const box = d.querySelector("#dhistory");
    if (!box || !h) return;
    const weeks = h.weeks || [];
    const prices = (h.prices || []).map((p) => Number(p.price)).filter((n) => Number.isFinite(n));
    if (!weeks.length && prices.length < 2) return;
    const max = Math.max(1, ...weeks.map((w) => w.sold));
    box.innerHTML = `<h3>Historique</h3>
      ${weeks.length ? `<div class="small muted">Ventes Vinted par semaine (12 semaines)</div><div class="weeks" role="img" aria-label="Ventes par semaine">${weeks.map((w) => `<div class="wk" style="height:${Math.max(6, (w.sold / max) * 100)}%" title="Semaine du ${new Date(w.week).toLocaleDateString("fr-FR")} : ${w.sold} vente(s) à ${eur(w.median_price)}"></div>`).join("")}</div>` : ""}
      ${prices.length >= 2 ? `<div class="small muted" style="margin-top:8px">Prix fournisseur relevé : de ${eur(Math.min(...prices))} à ${eur(Math.max(...prices))}, dernier ${eur(prices[prices.length - 1])}</div>` : ""}`;
  }).catch(() => {});
  try {
    const items = await api("catalog:items", { productId: row.product_id });
    d.querySelector("#ditems").innerHTML = items.length ? items.map((i) => `
      <div class="item">
        ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
        <div><a class="t" href="${safeUrl(i.url)}" target="_blank" rel="noopener">${esc(i.title || "Annonce Vinted")}</a>
        <div class="m">${i.status === "sold" ? `<span class="badge-sold">Vendu</span> ${esc(ago(i.sold_at))}` : i.status === "active" ? "En vente" : "Retirée"}</div></div>
        <div class="p num">${eur(i.price)}</div>
      </div>`).join("") : `<p class="muted">Aucune annonce enregistrée.</p>`;
  } catch (e) {
    d.querySelector("#ditems").innerHTML = `<p class="notice err">${esc(e.message)}</p>`;
  }
}

// ───────────────────────── Photos Barapics dans AliEdge (même compte, mêmes crédits)

const PHOTO_SCENES = [
  ["front-carpet", "Posé au sol"], ["side", "De côté"], ["detail", "Gros plan"], ["flat-lay", "À plat"],
  ["worn", "Porté"], ["lifestyle", "Chez soi"], ["studio", "Studio"], ["outdoor", "Extérieur"],
];

async function openPhotos(product) {
  const images = (product?.images?.length ? product.images : product?.image ? [product.image] : []).filter((u) => /^https:\/\//.test(u)).slice(0, 6);
  closeDrawer();
  const bg = document.createElement("div");
  bg.className = "drawer-bg";
  const d = document.createElement("div");
  d.className = "drawer photos";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-label", "Photos Barapics");
  const picked = new Set(["front-carpet", "side", "detail", "flat-lay"]);
  d.innerHTML = `
    <div class="stack">
      <div class="row between"><h3>${ICON.camera} Photos Barapics</h3><button class="btn ghost" type="button" data-close aria-label="Fermer">✕</button></div>
      ${!images.length ? `<div class="notice warn">Aucune photo du produit trouvée sur cette page. Ouvre la fiche produit puis relance l'analyse.</div>` : `
      <div class="product">${images.map((u) => `<img src="${safeUrl(u)}" alt="" referrerpolicy="no-referrer">`).join("")}<div><h3>${esc(product.title || "Article")}</h3><p class="small muted" id="pcredits">Vérification du solde…</p></div></div>
      <p class="small muted">Choisis les photos à créer. Chacune est contrôlée (fidélité, réalisme, texture) et refaite si besoin. 1 crédit par photo livrée.</p>
      <div class="scene-grid" role="group" aria-label="Photos à créer">${PHOTO_SCENES.map(([id, label]) => `<button type="button" class="scene" data-scene="${id}" aria-pressed="${picked.has(id)}">${esc(label)}</button>`).join("")}</div>
      <button id="pgo" class="btn primary block" type="button" disabled>Créer 4 photos</button>
      <div id="presults" class="photo-grid"></div>
      <a class="small" href="${esc(barapicsLink(product))}" target="_blank" rel="noopener">Plus de réglages (mannequins, décors, consignes) dans le studio Barapics</a>`}
    </div>`;
  document.body.append(bg, d);
  const close = () => closeDrawer();
  bg.addEventListener("click", close);
  d.querySelector("[data-close]").addEventListener("click", close);
  d.querySelector("[data-close]").focus();
  if (!images.length) return;
  const go = d.querySelector("#pgo");
  const credits = d.querySelector("#pcredits");
  let remaining = 0;
  const refreshGo = () => {
    const n = picked.size;
    go.textContent = `Créer ${n} photo${n > 1 ? "s" : ""}`;
    go.disabled = !n || (remaining !== null && remaining < 1);
  };
  d.querySelectorAll("[data-scene]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.scene;
    picked.has(id) ? picked.delete(id) : picked.add(id);
    b.setAttribute("aria-pressed", String(picked.has(id)));
    refreshGo();
  }));
  const noAccess = (msg) => `<div class="notice info stack"><span>${esc(msg)}</span><a class="btn primary" href="https://barapics.com/tarifs" target="_blank" rel="noopener">Démarrer l'essai gratuit (3 jours, 4 photos)</a></div>`;
  try {
    const c = await api("barapics", { body: { action: "credits" } });
    remaining = c.unlimited ? null : c.remaining;
    credits.textContent = c.unlimited ? "Crédits illimités" : `${c.remaining} photo${c.remaining > 1 ? "s" : ""} disponible${c.remaining > 1 ? "s" : ""} · ${c.planLabel}`;
    if (!c.unlimited && c.remaining < 1) d.querySelector("#presults").innerHTML = noAccess("Plus de photos disponibles sur ton compte Barapics.");
  } catch (e) {
    credits.textContent = "";
    d.querySelector("#presults").innerHTML = e.code === "no_access" || e.code === "quota" ? noAccess(e.message) : `<p class="notice err">${esc(e.message)}</p>`;
    remaining = 0;
  }
  refreshGo();
  go.addEventListener("click", async () => {
    let scenes = [...picked];
    if (remaining !== null) scenes = scenes.slice(0, remaining);
    if (!scenes.length) return;
    go.disabled = true;
    d.querySelectorAll("[data-scene]").forEach((b) => { b.disabled = true; });
    const grid = d.querySelector("#presults");
    grid.innerHTML = scenes.map((id) => `<figure class="pshot" data-shot="${id}"><div class="developing"></div><figcaption>${esc(PHOTO_SCENES.find((x) => x[0] === id)?.[1] || id)} · en attente</figcaption></figure>`).join("");
    go.textContent = "Lecture des détails du produit…";
    let spec = null;
    try { spec = await api("barapics", { body: { action: "brief", title: product.title || "Article", description: "", images } }); } catch { spec = null; }
    go.textContent = "Création en cours (1 à 2 min)…";
    // Photos « chez soi » : créées par planches de 4 (une seule image découpée, 4 fois moins chère) ; studio, extérieur et déco une par une.
    const HOME = new Set(["front-carpet", "side", "detail", "flat-lay", "worn"]);
    const grouped = scenes.filter((id) => HOME.has(id));
    const jobs = [];
    for (let k = 0; k < grouped.length; k += 4) jobs.push(grouped.slice(k, k + 4));
    for (const id of scenes) if (!HOME.has(id)) jobs.push([id]);
    let stop = false;
    const common = { productUrl: product.url || "", title: product.title || "Article", description: "", images, quality: "medium", ...(product.priceEur ? { price: `${money(product.priceEur)} €` } : {}), ...(spec ? { spec } : {}) };
    const labelOf = (id) => PHOTO_SCENES.find((x) => x[0] === id)?.[1] || id;
    const figOf = (id) => grid.querySelector(`[data-shot="${id}"]`);
    const showDone = (id, r) => {
      const fig = figOf(id);
      fig.innerHTML = `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener"><img src="${safeUrl(r.url)}" alt="Photo ${esc(labelOf(id))}"></a><figcaption>${esc(labelOf(id))} · contrôlée${r.attempts > 1 ? `, corrigée ${r.attempts - 1}×` : ""}</figcaption>`;
      fig.classList.add("done");
    };
    const showError = (id, message) => { figOf(id).innerHTML = `<div class="ph"></div><figcaption class="neg">${esc(labelOf(id))} · ${esc(message)}</figcaption>`; };
    const worker = async () => {
      for (;;) {
        const job = jobs.shift();
        if (!job) return;
        if (stop) { job.forEach((id) => { figOf(id).querySelector("figcaption").textContent = `${labelOf(id)} · non créée`; }); continue; }
        job.forEach((id) => { figOf(id).querySelector("figcaption").textContent = `${labelOf(id)} · création…`; });
        try {
          if (job.length === 1) showDone(job[0], await api("barapics", { body: { action: "photo", ...common, sceneId: job[0] } }));
          else {
            const r = await api("barapics", { body: { action: "planche", ...common, scenes: job.map((sceneId) => ({ sceneId })) } });
            for (const x of r.results || []) {
              if (x.ok) showDone(x.sceneId, x);
              else { showError(x.sceneId, x.error); if (/quota|crédit/i.test(x.error || "")) stop = true; }
            }
          }
        } catch (e) {
          job.forEach((id) => showError(id, e.message));
          if (e.code === "quota" || e.code === "no_access" || e.code === "auth") stop = true;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    go.textContent = "Photos enregistrées dans ta galerie Barapics";
    grid.insertAdjacentHTML("afterend", `<a class="btn block" href="https://barapics.com/galerie" target="_blank" rel="noopener">${ICON.ext}Ouvrir ma galerie Barapics</a>`);
  });
}

// ───────────────────────── Annonce Vinted complète (rédacteur Barapics : titre, description, catégorie, prix)

async function openListing(entry) {
  const product = entry?.product;
  const images = (product?.images?.length ? product.images : product?.image ? [product.image] : []).filter((u) => /^https:\/\//.test(u)).slice(0, 6);
  const fallback = draftListing(product || { title: entry.query }, entry.result.sell);
  closeDrawer();
  const bg = document.createElement("div");
  bg.className = "drawer-bg";
  const d = document.createElement("div");
  d.className = "drawer listing";
  d.setAttribute("role", "dialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-label", "Annonce");
  d.innerHTML = `<div class="stack"><div class="row between"><h3>${ICON.copy} Annonce</h3><button class="btn ghost" type="button" data-close aria-label="Fermer">✕</button></div><div id="lbody"><div class="skel" style="height:90px"></div><p class="small muted">Rédaction à partir des photos et des prix Vinted constatés…</p></div></div>`;
  document.body.append(bg, d);
  const close = () => closeDrawer();
  bg.addEventListener("click", close);
  d.querySelector("[data-close]").addEventListener("click", close);
  const field = (label, value, multi = false) => value ? `<div class="lfield"><div class="row between"><span class="small muted">${esc(label)}</span><button class="btn ghost small" type="button" data-copy="${esc(value)}">${ICON.copy}Copier</button></div>${multi ? `<p class="ltext">${esc(value)}</p>` : `<b>${esc(value)}</b>`}</div>` : "";
  const bind = () => d.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copié"); } catch { toast("Copie impossible"); }
  }));
  if (!images.length) {
    d.querySelector("#lbody").innerHTML = field("Titre", fallback.title) + field("Description", fallback.description, true);
    bind();
    return;
  }
  try {
    const l = await api("barapics", { body: { action: "listing", title: product.title || entry.query, description: "", images, ...(product.priceEur ? { supplierPrice: `${money(product.priceEur)} €` } : {}) } });
    // L'annonce créée ici est reliée à ce produit : à la vente, la warehouse saura quoi acheter.
    if (l.title && product.url) api("sales:link", { title: l.title, supplier: { url: product.url, title: product.title, price: product.priceEur, image: product.image, platform: product.platform } }).catch(() => {});
    const tags = (l.hashtags || []).map((h) => `#${h}`).join(" ");
    const lb = lbcListing(l);
    api("lbc:saveListing", { listing: lb }).catch(() => {}); // repris par l'assistant de dépôt sur leboncoin.fr
    const lbcHtml = `
      <div class="ticket"><div><div class="k">Prix conseillé</div><div class="big num pos">${eur(lb.price)}</div></div></div>
      ${field("Titre", lb.title)}
      ${field("Description", lb.description, true)}
      <div class="grid2">${field("Catégorie", lb.category)}${field("État", l.condition)}</div>
      <a class="btn primary block" href="https://www.leboncoin.fr/deposer-une-annonce" target="_blank" rel="noopener">Déposer sur Leboncoin</a>
      <p class="small muted">Sur la page de dépôt, le bouton « Annonce AliEdge » remplit le titre, la description et le prix. Tu relis et tu publies toi-même.</p>`;
    d.querySelector("h3").insertAdjacentHTML("afterend", `<div class="seg" role="group" aria-label="Plateforme"><button type="button" data-lplat="vinted" aria-pressed="true">Vinted</button><button type="button" data-lplat="lbc" aria-pressed="false">Leboncoin</button></div>`);
    const vintedHtml = () => `
      <div class="ticket"><div><div class="k">Prix conseillé</div><div class="big num pos">${eur(l.price)}</div>
      ${l.margin != null ? `<div class="sub">Marge ${eur(l.margin, true)} sur un achat à ${eur(l.supplierPrice)}</div>` : ""}
      ${l.priceReason ? `<div class="sub" style="margin-top:4px">${esc(l.priceReason)}</div>` : ""}</div></div>
      ${field("Titre", l.title)}
      ${field("Description", `${l.description}${tags ? `\n\n${tags}` : ""}`, true)}
      <div class="grid2">${field("Catégorie", l.category)}${field("Marque", l.brand)}${field("État", l.condition)}${field("Taille", l.size)}${field("Couleur", (l.colors || []).join(", "))}${field("Colis", l.parcel)}</div>`;
    const showPlat = (plat) => {
      d.querySelector("#lbody").innerHTML = plat === "lbc" ? lbcHtml : vintedHtml();
      d.querySelectorAll("[data-lplat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lplat === plat)));
      bind();
    };
    d.querySelectorAll("[data-lplat]").forEach((b) => b.addEventListener("click", () => showPlat(b.dataset.lplat)));
    showPlat(d.dataset.plat || "vinted");
  } catch (e) {
    d.querySelector("#lbody").innerHTML = `<div class="notice info">${esc(e.message)} Voici une version simple :</div>` + field("Titre", fallback.title) + field("Description", fallback.description, true);
  }
  bind();
}

function closeDrawer() {
  document.querySelectorAll(".drawer, .drawer-bg").forEach((n) => n.remove());
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// ───────────────────────── Suivis et historique

function sparkline(points) {
  const vals = points.map((p) => p.median).filter((v) => v != null);
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 88 + 1},${28 - ((v - min) / span) * 26}`).join(" ");
  return `<svg class="spark" viewBox="0 0 90 30" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--violet)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ───────────────────────── Concurrents (suivis 14 jours, puis retirés)

function viewTrackers(trackers) {
  const rows = (trackers || []).filter((t) => new Date(t.expires_at).getTime() > Date.now()).map((t) => `
      <div class="tracker">
        <button class="tracker-head" type="button" data-tracker="${esc(t.id)}" aria-expanded="false">
          <span class="tracker-dot" aria-hidden="true"></span>
          <span class="tracker-name"><b>${esc(t.label || `Vendeur ${t.seller_id}`)}</b><span class="small muted">${esc((t.market || "fr").toUpperCase())} · suivi depuis ${esc(ago(new Date(t.created_at).getTime()))} · ${(() => { const d = Math.max(0, Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / 86400_000)); return d <= 1 ? "dernier jour" : `encore ${d} j`; })()}${t.last_checked_at ? ` · vérifié ${esc(ago(new Date(t.last_checked_at).getTime()))}` : " · premier relevé en cours"}</span></span>
          <span class="tracker-kpi num"><b>${t.sold_7d ?? 0}</b><span class="small muted">ventes 7 j</span></span>
          <span class="tracker-kpi num"><b>${eur(Number(t.amount_30d ?? t.sold_amount))}</b><span class="small muted">${t.sold_30d ?? t.sold_count} ventes 30 j</span></span>
        </button>
        <div class="tracker-body" id="tb-${esc(t.id)}" hidden></div>
      </div>`).join("");
  return `
    <section class="stack">
      <div class="row between"><h2>Concurrents</h2><span class="small muted">${rows ? (trackers || []).filter((t) => new Date(t.expires_at).getTime() > Date.now()).length : 0} / 30</span></div>
      <p class="small muted">Colle le lien du profil Vinted d'un concurrent, ou clique sur « + Concurrent » à côté de son pseudo sur Vinted. Pendant 14 jours, AliEdge relève son dressing plusieurs fois par jour, repère chaque nouvelle vente et mesure en combien de temps elle est partie. Ensuite le suivi s'arrête tout seul.</p>
      <form id="trackform" class="row" style="gap:8px">
        <input class="input" id="trackurl" type="url" inputmode="url" placeholder="https://www.vinted.fr/member/123456-pseudo" aria-label="Lien du profil Vinted" style="flex:1">
        <button class="btn primary" type="submit">Suivre</button>
      </form>
      <div id="trackerr" role="alert"></div>
      <div class="trackers">${rows || `<div class="card empty">${ICON.eye}<h2>Aucun concurrent suivi</h2><p class="muted">Ajoute les vendeurs qui cartonnent dans ta niche : tu verras ce qu'ils vendent, à quel prix et en combien de temps.</p></div>`}</div>
    </section>`;
}

async function viewConcurrents() {
  if (!state.me) return `<section class="card pad stack"><h2>Concurrents</h2><p class="muted">Connecte-toi pour suivre les ventes de tes concurrents.</p><a class="btn primary" href="#/compte">Se connecter</a></section>`;
  const [trackers, sales, diag, lbcOn] = await Promise.all([api("tracker:list").catch(() => []), api("competitor:sales").catch(() => null), api("diagnostic:last").catch(() => null), api("lbc:status").then((r) => r.enabled).catch(() => false)]);
  const lbcRows = lbcOn ? await api("lbc:trackers").catch(() => []) : [];
  const chRows = [];
  for (const ch of Object.keys(CHANNELS).filter((c) => !CHANNELS[c].fillOnly)) {
    const on = (await api(`${ch}:status`).catch(() => ({ enabled: false }))).enabled;
    chRows.push([ch, on ? await api(`${ch}:trackers`).catch(() => []) : [], on]);
  }
  return `${viewTrackers(trackers)}
    ${viewLbcTrackers(lbcRows, lbcOn)}
    ${chRows.map(([ch, rows, on]) => viewChannelTrackers(ch, rows, on)).join("")}
    <section class="stack" style="margin-top:22px">${salesFeedHtml(sales)}</section>
    <section class="stack" style="margin-top:22px">
      <h2>Analyser une niche</h2>
      <p class="small muted">Tape un produit ou une niche : AliEdge regarde les annonces en ligne sur Vinted et les ventes constatées par la communauté, puis te montre les vendeurs à suivre.</p>
      <form id="nicheform" class="row" style="gap:8px">
        <input class="input" id="nicheq" type="search" placeholder="ex. sac bandoulière cuir" aria-label="Niche à analyser" value="${esc(state.nicheQuery || "")}" style="flex:1" minlength="3" required>
        <button class="btn primary" type="submit">Analyser</button>
      </form>
      <div id="nicheout">${nicheHtml(state.niche)}</div>
    </section>
    <details class="card pad fold" data-fold="diag" style="margin-top:22px" ${diag || state.smart.open.diag ? "open" : ""}>
      <summary><h2>Diagnostic de ton compte</h2>${diag?.score != null ? `<span class="pill">${esc(diag.score)}/100</span>` : ""}</summary>
      <div class="stack" style="margin-top:10px">
      <p class="small muted">Colle le lien de ton profil Vinted : AliEdge lit tes annonces et ton profil, te donne une note sur 100 et les corrections qui comptent le plus, en te comparant à tes concurrents suivis.</p>
      <form id="diagform" class="row" style="gap:8px">
        <input class="input" id="diagurl" type="url" inputmode="url" placeholder="https://www.vinted.fr/member/123456-ton-pseudo" aria-label="Lien de ton profil Vinted" value="${esc(diag?.url || "")}" style="flex:1" required>
        <button class="btn primary" type="submit">${diag ? "Refaire" : "Lancer"}</button>
      </form>
      <div id="diagout">${diagnosticHtml(diag)}</div>
      </div>
    </details>`;
}

/** Produit fournisseur d'une annonce vendue : celui de la base commune, sinon les recherches pour le trouver. */
function supplierLinks(i) {
  const q = buildQuery(i.title || "", 6) || i.title || "";
  const e = encodeURIComponent(q);
  return [
    i.photo_url ? ["Google Lens (photo)", `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(i.photo_url)}`] : null,
    ["AliExpress", `https://fr.aliexpress.com/w/wholesale-${e}.html`],
    ["Temu", `https://www.temu.com/search_result.html?search_key=${e}`],
    ["Shein", `https://fr.shein.com/pdsearch/${e}/`],
  ].filter(Boolean);
}
function supplierHtml(i) {
  if (i.product_url) {
    const cost = Number(i.product_price), sale = Number(i.price);
    const margin = Number.isFinite(cost) && cost > 0 && Number.isFinite(sale) ? sale - cost : null;
    return `<div class="supplier ok small"><span>Fournisseur ${esc(PLATFORM_NAME[i.product_platform] || "")}${Number.isFinite(cost) && cost > 0 ? ` · ${eur(cost)}` : ""}${margin != null ? ` · écart <b class="num" style="color:${margin > 0 ? "var(--gain)" : "var(--loss)"}">${eur(margin, true)}</b> avant frais` : ""}</span><a href="${safeUrl(i.product_url)}" target="_blank" rel="noopener">Voir le produit</a></div>`;
  }
  return `<details class="supplier small"><summary>Trouver le fournisseur</summary>
    <div class="row wrap" style="gap:6px;margin:6px 0">${supplierLinks(i).map(([n, u]) => `<a class="btn ghost small" href="${safeUrl(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join("")}</div>
    <form class="row" ${i.list_id ? `data-lbclink="${esc(i.list_id)}"` : `data-link="${esc(i.vinted_id)}"`} style="gap:6px"><input class="input" type="url" placeholder="Colle ici le lien du produit trouvé" aria-label="Lien du produit fournisseur" style="flex:1" required><button class="btn primary small" type="submit">Relier</button></form>
    <p class="small muted" style="margin:4px 0 0">Le produit relié rejoint le catalogue commun : tout le monde voit ensuite le fournisseur de cette vente.</p>
  </details>`;
}
const PLATFORM_NAME = { aliexpress: "AliExpress", temu: "Temu", shein: "Shein" };

function salesFeedHtml(s) {
  const feed = (s?.feed || []).slice(0, 8);
  return `
    <div class="card pad stack" style="gap:8px">
      <div class="row between wrap"><h3 style="margin:0">Dernières ventes de tes concurrents</h3>
        <label class="small row" style="gap:6px"><input type="checkbox" id="salesnotify" ${s?.notify !== false ? "checked" : ""}> Me prévenir à chaque vente</label></div>
      ${feed.length ? `<div class="items">${feed.map((r) => `
        <a class="item" href="${safeUrl(r.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">
          ${r.photo_url ? `<img src="${safeUrl(r.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div><div class="t">${esc(r.title || "Annonce")}</div><div class="m">${esc(r.label || "Concurrent")} · vendu ${esc(ago(new Date(r.sold_at).getTime()))}${r.days_to_sell != null ? ` · parti en ${esc(String(r.days_to_sell).replace(".", ","))} j` : ""}${r.product_url ? " · fournisseur connu" : ""}</div></div>
          <div class="p num">${eur(Number(r.price))}</div>
        </a>`).join("")}</div>` : `<p class="small muted" style="margin:0">AliEdge relève les dressings de tes concurrents plusieurs fois par jour. Chaque vente constatée s'affiche ici et déclenche une notification (et une alerte sur ton téléphone si tu l'as réglée dans le Radar).</p>`}
    </div>`;
}

function diagnosticHtml(d) {
  if (!d) return "";
  const m = d.metrics || {};
  const sc = d.score || { total: 0, parts: [] };
  const tone = sc.total >= 75 ? "var(--gain)" : sc.total >= 50 ? "var(--amber, #d68a00)" : "var(--loss)";
  const num = (v, suf = "") => (v == null ? "–" : `${String(Math.round(v * 10) / 10).replace(".", ",")}${suf}`);
  return `
    <div class="stack" style="gap:10px">
      <div class="diag-score"><b class="num" style="color:${tone}">${sc.total}</b><span>/ 100</span><span class="small muted">${esc(m.login || "Ton compte")} · ${esc(ago(d.at))}</span></div>
      <div class="diag-parts">${sc.parts.map((p) => `<div><span class="small">${esc(p.label)}</span><span class="bar"><i style="width:${Math.round((p.value / p.max) * 100)}%"></i></span><b class="num small">${num(p.value)} / ${p.max}</b></div>`).join("")}</div>
      <div class="kpis">
        <div class="kpi"><b class="num">${m.active ?? 0}</b><span class="small muted">annonces en ligne</span></div>
        <div class="kpi"><b class="num">${m.new_7d ?? 0}</b><span class="small muted">mises en ligne 7 j</span></div>
        <div class="kpi"><b class="num">${m.rating != null ? `${num(m.rating)} ★` : "–"}</b><span class="small muted">${m.reviews ?? 0} avis</span></div>
        <div class="kpi"><b class="num">${num(m.median_favourites)}</b><span class="small muted">favoris par annonce</span></div>
        <div class="kpi"><b class="num">${m.median_price != null ? eur(m.median_price) : "–"}</b><span class="small muted">prix médian</span></div>
        <div class="kpi"><b class="num">${num(m.median_age_days, " j")}</b><span class="small muted">âge médian des annonces</span></div>
      </div>
      ${d.bench ? `<p class="small muted" style="margin:0">Repère : tes ${d.bench.competitors} concurrents suivis vendent en médiane ${num(d.bench.median_sold_30d)} articles en 30 jours${d.bench.median_price_30d != null ? ` à ${eur(d.bench.median_price_30d)}` : ""}, avec ${num(d.bench.median_active)} annonces en ligne.</p>` : `<p class="small muted" style="margin:0">Suis quelques concurrents pour comparer ton compte au leur.</p>`}
      ${d.summary ? `<p style="margin:0">${esc(d.summary)}</p>` : ""}
      ${d.strengths?.length ? `<div><h3 class="small">Ce qui va bien</h3><ul class="diag-list">${d.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${d.fixes?.length ? `<div><h3 class="small">À corriger en priorité</h3><ol class="diag-list">${d.fixes.map((f) => `<li><b>${esc(f.title)}</b><br><span class="small muted">${esc(f.why || "")}</span><br><span class="small">${esc(f.how || "")}</span></li>`).join("")}</ol></div>` : ""}
      ${d.error ? `<div class="notice info">Conseils personnalisés indisponibles : ${esc(d.error)} La note et les chiffres restent valables.</div>` : ""}
    </div>`;
}

function nicheHtml(n) {
  if (!n) return "";
  const L = n.live, D = n.db;
  const seller = (x, extra) => `
    <div class="item" style="grid-template-columns:1fr auto">
      <div><div class="t">${esc(x.login || `Vendeur ${x.seller_id}`)}</div><div class="m">${extra}</div></div>
      ${x.tracked ? `<span class="small muted">Suivi</span>` : `<button class="btn ghost small" type="button" data-follow="${esc(x.seller_id)}" data-login="${esc(x.login || "")}">+ Suivre</button>`}
    </div>`;
  return `
    <div class="stack" style="gap:10px">
      ${n.error ? `<div class="notice err">${esc(n.error)}</div>` : ""}
      <div class="kpis">
        <div class="kpi"><b class="num">${L.total ?? 0}</b><span class="small muted">annonces en ligne</span></div>
        <div class="kpi"><b class="num">${L.median != null ? eur(L.median) : "–"}</b><span class="small muted">prix médian en ligne</span></div>
        <div class="kpi"><b class="num">${L.p25 != null ? `${eur(L.p25)} – ${eur(L.p75)}` : "–"}</b><span class="small muted">fourchette courante</span></div>
        <div class="kpi"><b class="num">${D?.sold ?? 0}</b><span class="small muted">ventes constatées 30 j</span></div>
        <div class="kpi"><b class="num">${D?.median_price != null ? eur(Number(D.median_price)) : "–"}</b><span class="small muted">prix médian vendu</span></div>
        <div class="kpi"><b class="num">${D?.median_days != null ? `${String(D.median_days).replace(".", ",")} j` : "–"}</b><span class="small muted">délai de vente médian</span></div>
      </div>
      <p class="small muted" style="margin:0">Les ventes viennent de la base commune AliEdge : ce sont celles constatées par la communauté, pas toutes les ventes de Vinted.</p>
      ${D?.top_sellers?.length ? `<div><h3 class="small">Ceux qui vendent le plus (30 j)</h3><div class="items">${D.top_sellers.map((x) => seller(x, `${x.sold} vente${x.sold > 1 ? "s" : ""} constatée${x.sold > 1 ? "s" : ""}${x.median_price != null ? ` · ${eur(Number(x.median_price))} médian` : ""}`)).join("")}</div></div>` : ""}
      ${L.sellers?.length ? `<div><h3 class="small">Ceux qui ont le plus d'annonces en ligne</h3><div class="items">${L.sellers.map((x) => seller(x, `${x.listings} annonce${x.listings > 1 ? "s" : ""} sur cette recherche${x.median != null ? ` · ${eur(x.median)} médian` : ""}`)).join("")}</div></div>` : ""}
      ${D?.recent?.length ? `<div><h3 class="small">Dernières ventes constatées</h3><div class="items">${D.recent.map((r) => `<a class="item" href="${safeUrl(r.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">${r.photo_url ? `<img src="${safeUrl(r.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}<div><div class="t">${esc(r.title || "Annonce")}</div><div class="m">vendu ${esc(ago(new Date(r.sold_at).getTime()))}</div></div><div class="p num">${eur(Number(r.price))}</div></a>`).join("")}</div></div>` : ""}
    </div>`;
}

function recapHtml(r, items) {
  const days = (d) => (d == null ? "–" : d < 1 ? "moins d'1 j" : `${String(d).replace(".", ",")} j`);
  const kpi = (v, l) => `<div class="kpi"><b class="num">${v}</b><span class="small muted">${l}</span></div>`;
  const maxW = Math.max(1, ...r.per_week.map((w) => w.sold));
  const weeks = r.per_week.length ? `<div class="bars" aria-label="Ventes par semaine">${r.per_week.map((w) => `<span title="Semaine du ${esc(new Date(w.week).toLocaleDateString("fr-FR"))} : ${w.sold} vente${w.sold > 1 ? "s" : ""}" style="height:${Math.max(6, Math.round((w.sold / maxW) * 100))}%"></span>`).join("")}</div>` : "";
  const line = (i) => `
    <a class="item" href="${safeUrl(i.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">
      ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
      <div><div class="t">${esc(i.title || "Annonce")}</div><div class="m">${i.status === "sold"
        ? i.sold_before ? `<span class="badge-sold">Vendu</span> avant le suivi` : `<span class="badge-sold">Vendu</span> en ${esc(days(i.days_to_sell))} · ${esc(ago(new Date(i.sold_at).getTime()))}`
        : `en ligne depuis ${esc(ago(new Date(i.listed_at || i.first_seen_at).getTime()))}${i.favourites ? ` · ${i.favourites} ♥` : ""}`}</div></div>
      <div class="p num">${eur(Number(i.price))}</div>
    </a>`;
  const seen = items.filter((i) => i.status === "sold" && !i.sold_before);
  const soldLine = (i) => `<div class="sale-row">${line(i)}${supplierHtml(i)}</div>`;
  const before = items.filter((i) => i.sold_before);
  const active = items.filter((i) => i.status === "active");
  return `
    <div class="stack" style="gap:10px;margin-top:8px">
      <div class="kpis">
        ${kpi(r.sold_seen, "ventes constatées")}
        ${kpi(eur(Number(r.revenue_seen)), "chiffre constaté")}
        ${kpi(days(r.median_days), "délai de vente médian")}
        ${kpi(r.median_price_sold != null ? eur(Number(r.median_price_sold)) : "–", "prix médian vendu")}
        ${kpi(r.active, `en ligne · ${eur(Number(r.active_value))}`)}
        ${kpi(r.new_listings_7d, "nouvelles annonces 7 j")}
      </div>
      ${weeks}
      ${r.brands.length ? `<div><h3 class="small">Ce qui se vend</h3><div class="items">${r.brands.map((b) => `<div class="item" style="grid-template-columns:1fr auto"><div><div class="t">${esc(b.name)}</div><div class="m">${b.sold} vendu${b.sold > 1 ? "s" : ""}${b.median_days != null ? ` · en ${esc(days(b.median_days))}` : ""}</div></div><div class="p num">${b.median_price != null ? eur(Number(b.median_price)) : ""}</div></div>`).join("")}</div></div>` : ""}
      ${r.price_bands.length ? `<div><h3 class="small">Prix : vendus / en ligne</h3><div class="bands">${r.price_bands.map((b) => `<div><span>${esc(b.band)}</span><b class="num">${b.sold}</b><span class="muted num">${b.active}</span></div>`).join("")}</div></div>` : ""}
      ${r.fastest.length ? `<div><h3 class="small">Partis le plus vite</h3><div class="items">${r.fastest.map((i) => line({ ...i, status: "sold", days_to_sell: i.days, sold_at: Date.now() })).join("")}</div></div>` : ""}
      <h3 class="small">Ventes constatées (${seen.length})</h3>
      ${seen.length ? `<div class="items">${seen.map(soldLine).join("")}</div>` : `<p class="small muted">Les ventes apparaissent au fil des relevés (plusieurs fois par jour).</p>`}
      <h3 class="small">En ligne (${active.length})</h3>
      ${active.length ? `<div class="items">${active.slice(0, 120).map(line).join("")}</div>${active.length > 120 ? `<p class="small muted">Et ${active.length - 120} autres.</p>` : ""}` : ""}
      ${before.length ? `<details><summary class="small">Déjà vendus avant le suivi (${before.length})</summary><div class="items" style="margin-top:6px">${before.slice(0, 120).map(line).join("")}</div></details>` : ""}
      <button class="btn ghost small" type="button" data-untrack="__ID__">Arrêter le suivi</button>
    </div>`;
}

async function viewSuivis() {
  const [watch, hist] = await Promise.all([api("watch:list").catch(() => []), api("history:list").catch(() => [])]);
  const w = watch.length ? watch.map((x) => {
    const first = x.points[0]?.median, last = x.points[x.points.length - 1]?.median;
    const delta = first && last ? Math.round(((last - first) / first) * 100) : 0;
    return `
      <div class="item" style="grid-template-columns:56px 1fr auto">
        ${x.product?.image ? `<img src="${safeUrl(x.product.image)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
        <div><a class="t" href="${safeUrl(x.product?.url)}" target="_blank" rel="noopener">${esc(x.product?.title || x.query)}</a>
          <div class="m num">Médiane ${eur(last)}${delta ? ` <b style="color:${delta > 0 ? "var(--gain)" : "var(--loss)"}">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} %</b>` : ""} · ${x.points[x.points.length - 1]?.count ?? 0} annonces</div></div>
        <div class="stack" style="align-items:flex-end">${sparkline(x.points)}<button class="btn ghost small" type="button" data-unwatch="${esc(x.key)}">Retirer</button></div>
      </div>`;
  }).join("") : `<div class="card empty">${ICON.eye}<h2>Aucun produit suivi</h2><p class="muted">Après une analyse, clique sur « Suivre » : AliEdge revérifie le prix Vinted toutes les 6 h et te prévient s'il bouge de plus de 10 %.</p></div>`;
  const h = hist.length ? hist.map((e, i) => `
    <button class="item" type="button" data-hist="${i}" style="text-align:left;cursor:pointer;width:100%">
      ${e.product?.image ? `<img src="${safeUrl(e.product.image)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
      <div><div class="t">${esc(e.product?.title || e.query)}</div><div class="m">${esc(ago(e.at))} · score ${e.result.score}/100</div></div>
      <div class="p num" style="color:${(e.result.margin ?? 0) > 0 ? "var(--gain)" : "var(--loss)"}">${eur(e.result.margin, true)}</div>
    </button>`).join("") : `<p class="muted">Tes analyses apparaîtront ici.</p>`;
  return `
    ${salesSectionHtml()}
    ${repostHtml()}
    <section class="stack" style="margin-top:22px"><h2>Produits suivis</h2><div class="items">${w}</div></section>
    <section class="stack" style="margin-top:22px"><div class="row between"><h2>Historique</h2>${hist.length ? '<button class="btn ghost small" type="button" id="clearhist">Effacer</button>' : ""}</div><div class="items">${h}</div></section>`;
}


/** Concurrents Leboncoin : leur page est relue quand tu l'ouvres (aucune requête en arrière-plan vers Leboncoin). */
function viewLbcTrackers(rows, on) {
  const days = (d) => (d == null ? "–" : `${String(d).replace(".", ",")} j`);
  const list = (rows || []).map((t) => `
    <div class="tracker">
      <button class="tracker-head" type="button" data-lbctracker="${esc(t.seller_uuid)}" aria-expanded="false">
        <span class="tracker-dot" aria-hidden="true"></span>
        <span class="tracker-name"><b>${esc(t.label || "Vendeur Leboncoin")}</b>${!t.last_visit_at || Date.now() - new Date(t.last_visit_at).getTime() > 3 * 864e5 ? ' <span class="pill warn">à revoir</span>' : ""}<span class="small muted">suivi depuis ${esc(ago(new Date(t.created_at).getTime()))} · ${t.last_visit_at ? `page vue ${esc(ago(new Date(t.last_visit_at).getTime()))}` : "page jamais ouverte"}</span></span>
        <span class="tracker-kpi num"><b>${t.active_count}</b><span class="small muted">en ligne</span></span>
        <span class="tracker-kpi num"><b>${t.gone_30d}</b><span class="small muted">ventes 30 j (estim.)</span></span>
      </button>
      <div class="tracker-body" id="lbt-${esc(t.seller_uuid)}" hidden></div>
    </div>`).join("");
  return `
    <section class="stack" id="lbcsection" style="margin-top:22px">
      <div class="row between"><h2>Concurrents Leboncoin</h2><span class="small muted">${(rows || []).length} / 30</span></div>
      ${on ? `
        <p class="small muted">Colle le lien du profil Leboncoin d'un concurrent, ou clique sur « + Concurrent » à côté de son nom sur Leboncoin. Ouvre sa page de temps en temps (bouton « Revoir ses annonces ») : les annonces disparues depuis ta dernière visite sont comptées comme ventes probables. AliEdge n'envoie aucune requête à Leboncoin à ta place.</p>
        <form id="lbctrackform" class="row" style="gap:8px">
          <input class="input" id="lbctrackurl" type="url" inputmode="url" placeholder="https://www.leboncoin.fr/profile/…/offers" aria-label="Lien du profil Leboncoin" style="flex:1">
          <button class="btn primary" type="submit">Suivre</button>
        </form>
        <div id="lbctrackerr" role="alert"></div>
        <div class="trackers">${list || `<p class="small muted">Aucun concurrent Leboncoin suivi.</p>`}</div>`
      : `<div class="card pad stack" style="gap:8px"><p class="small muted" style="margin:0">Active Leboncoin pour suivre aussi tes concurrents Leboncoin. AliEdge lit seulement les pages que tu ouvres, sans aucune requête en plus.</p><button class="btn" type="button" id="lbcenable2">Activer Leboncoin</button></div>`}
    </section>`;
}

/** Concurrents Beebs / Opla : suivis dans ce navigateur, relevés quand tu ouvres leur boutique (aucune requête vers le site). */
function viewChannelTrackers(ch, rows, on) {
  const C = CHANNELS[ch];
  const stale = (t) => !t.last_visit_at || Date.now() - t.last_visit_at > 3 * 864e5;
  const list = (rows || []).map((t) => `
    <div class="tracker">
      <button class="tracker-head" type="button" data-chtracker="${esc(t.uid)}" data-ch="${ch}" aria-expanded="false">
        <span class="tracker-dot" aria-hidden="true"></span>
        <span class="tracker-name"><b>${esc(t.label || `Vendeur ${C.label}`)}</b>${stale(t) ? ' <span class="pill warn">à revoir</span>' : ""}<span class="small muted">suivi depuis ${esc(ago(t.added))} · ${t.last_visit_at ? `${C.shop} vue ${esc(ago(t.last_visit_at))}` : `${C.shop} jamais ouverte`}</span></span>
        <span class="tracker-kpi num"><b>${t.active_count}</b><span class="small muted">en ligne</span></span>
        <span class="tracker-kpi num"><b>${t.gone_30d}</b><span class="small muted">ventes 30 j (estim.)</span></span>
      </button>
      <div class="tracker-body" id="cht-${ch}-${esc(t.uid).replace(/[^\w-]/g, "_")}" hidden></div>
    </div>`).join("");
  return `
    <section class="stack" id="${ch}section" style="margin-top:22px">
      <div class="row between"><h2>Concurrents ${C.label}</h2><span class="small muted">${(rows || []).length} / 30</span></div>
      ${on ? `
        <p class="small muted">Colle le lien de la ${C.shop} ${C.label} d'un concurrent, ou clique sur « + Concurrent » sur ${C.label} (sa ${C.shop} ou un de ses articles). Ouvre sa ${C.shop} de temps en temps : les annonces disparues depuis ta dernière visite sont comptées comme ventes probables.</p>
        <form class="row" data-chform="${ch}" style="gap:8px">
          <input class="input" type="url" inputmode="url" placeholder="${C.placeholder}" aria-label="Lien de la ${C.shop} ${C.label}" style="flex:1">
          <button class="btn primary" type="submit">Suivre</button>
        </form>
        <div data-cherr="${ch}" role="alert"></div>
        <div class="trackers">${list || `<p class="small muted">Aucun concurrent ${C.label} suivi.</p>`}</div>`
      : `<div class="card pad stack" style="gap:8px"><p class="small muted" style="margin:0">Active ${C.label} pour suivre aussi tes concurrents ${C.label} et publier tes annonces Vinted sur ${C.label} en un clic.</p><button class="btn" type="button" data-chenable2="${ch}">Activer ${C.label}</button></div>`}
    </section>`;
}

function bindChannelTrackers() {
  document.querySelectorAll("[data-chenable2]").forEach((b) => b.addEventListener("click", async () => { if (await enableChannel(b.dataset.chenable2)) render(); }));
  document.querySelectorAll("[data-chform]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ch = f.dataset.chform, C = CHANNELS[ch];
    const err = document.querySelector(`[data-cherr="${ch}"]`);
    const m = f.querySelector("input").value.match(C.shopRe);
    if (!m) { err.innerHTML = `<div class="notice warn">Colle le lien d'une ${C.shop} ${C.label}.</div>`; return; }
    let uid = m[1]; try { uid = decodeURIComponent(uid); } catch { /* déjà décodé */ }
    try { await api(`${ch}:track`, { uid }); toast(`Concurrent ajouté : ouvre sa ${C.shop} pour relever ses annonces`); render(); }
    catch (x) { err.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  }));
  document.querySelectorAll("[data-chtracker]").forEach((b) => b.addEventListener("click", async () => {
    const uid = b.dataset.chtracker, ch = b.dataset.ch, C = CHANNELS[ch];
    const body = b.parentElement.querySelector(".tracker-body");
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
    if (open || body.dataset.loaded) return;
    const { items = [], gone = [] } = await api(`${ch}:trackerItems`, { uid }).catch(() => ({}));
    const line = (i, sold) => `<a class="item" href="${safeUrl(i.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">${i.photo ? `<img src="${safeUrl(i.photo)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}<div><div class="t">${esc(i.title || "Article")}</div><div class="m">${sold ? `<span class="badge-sold">Vente probable</span> ${esc(ago(i.goneAt))}${i.days != null ? ` · en ${esc(String(i.days).replace(".", ","))} j` : ""}` : `en ligne depuis ${esc(ago(i.firstSeen))}`}</div></div><div class="p num">${i.price != null ? eur(Number(i.price)) : ""}</div></a>`;
    body.innerHTML = `<div class="stack" style="gap:10px;margin-top:8px">
      <div class="row wrap" style="gap:8px"><a class="btn primary small" href="${safeUrl(C.shopUrl(uid))}" target="_blank" rel="noopener">Revoir sa ${C.shop}</a><button class="btn ghost small" type="button" data-chuntrack>Arrêter le suivi</button></div>
      <h3 class="small">Ventes probables (${gone.length})</h3>
      ${gone.length ? `<div class="items">${gone.map((i) => line(i, true)).join("")}</div>` : `<p class="small muted">Elles apparaissent quand des annonces ont disparu entre deux visites de sa ${C.shop}.</p>`}
      <h3 class="small">En ligne (${items.length})</h3>
      ${items.length ? `<div class="items">${items.slice(0, 120).map((i) => line(i, false)).join("")}</div>` : `<p class="small muted">Ouvre sa ${C.shop} avec « Revoir sa ${C.shop} » pour relever ses annonces.</p>`}
    </div>`;
    body.dataset.loaded = "1";
    body.querySelector("[data-chuntrack]")?.addEventListener("click", async () => { await api(`${ch}:untrack`, { uid }); toast("Concurrent retiré"); render(); });
  }));
}

function bindLbcTrackers() {
  if (route().params.get("lbc") === "review") document.getElementById("lbcsection")?.scrollIntoView({ block: "start" });
  document.getElementById("lbcenable2")?.addEventListener("click", async () => {
    const ok = await enableLbc();
    if (ok) { await api("lbc:status").catch(() => {}); toast("Leboncoin activé"); render(); } else toast("Accès à leboncoin.fr refusé : rien n'a changé.");
  });
  document.getElementById("lbctrackform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("lbctrackerr");
    const m = document.getElementById("lbctrackurl").value.match(/leboncoin\.fr\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!m) { err.innerHTML = `<div class="notice err">Colle le lien d'un profil Leboncoin (…/profile/…/offers).</div>`; return; }
    err.innerHTML = "";
    try { await api("lbc:track", { seller: m[1].toLowerCase(), label: null }); toast("Concurrent ajouté : ouvre sa page pour relever ses annonces"); render(); }
    catch (x) { err.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  });
  document.querySelectorAll("[data-lbctracker]").forEach((b) => b.addEventListener("click", async () => {
    const seller = b.dataset.lbctracker;
    const body = document.getElementById(`lbt-${seller}`);
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
    if (open || body.dataset.loaded) return;
    body.innerHTML = `<div class="skel" style="height:90px;margin-top:8px"></div>`;
    const items = await api("lbc:trackerItems", { seller }).catch(() => []);
    const active = items.filter((i) => i.status === "active");
    // Annonce disparue puis remise en ligne avec le même titre : republication, pas une vente.
    const activeKeys = new Set(active.map((i) => titleKey(i.title)));
    const gone = items.filter((i) => i.status !== "active").map((i) => ({ ...i, republished: i.status !== "sold" && activeKeys.has(titleKey(i.title)) }));
    const sold = gone.filter((i) => !i.republished);
    const line = (i) => `<div class="sale-row"><a class="item" href="${safeUrl(i.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}<div><div class="t">${esc(i.title || "Annonce")}</div><div class="m">${i.status === "active" ? `en ligne depuis ${esc(ago(new Date(i.first_seen_at).getTime()))}` : `<span class="badge-sold" ${i.republished ? 'style="opacity:.55"' : ""}>${i.republished ? "Republiée" : i.status === "sold" ? "Vendu (confirmé)" : "Vente probable"}</span> ${esc(ago(new Date(i.gone_at).getTime()))}${i.days_to_sell != null ? ` · en ${esc(String(i.days_to_sell).replace(".", ","))} j` : ""}`}</div></div><div class="p num">${i.price != null ? eur(Number(i.price)) : ""}</div></a>${i.status !== "active" ? supplierHtml(i) : ""}</div>`;
    body.innerHTML = `
      <div class="stack" style="gap:10px;margin-top:8px">
        <div class="row wrap" style="gap:8px"><a class="btn primary small" href="https://www.leboncoin.fr/profile/${esc(seller)}/offers" target="_blank" rel="noopener">Revoir ses annonces</a><button class="btn ghost small" type="button" data-lbcuntrack="${esc(seller)}">Arrêter le suivi</button></div>
        <h3 class="small">Ventes probables (${sold.length})</h3>
        ${gone.length ? `<div class="items">${[...sold, ...gone.filter((i) => i.republished)].map(line).join("")}</div>` : `<p class="small muted">Elles apparaissent quand des annonces ont disparu entre deux visites de sa page.</p>`}
        <h3 class="small">En ligne (${active.length})</h3>
        ${active.length ? `<div class="items">${active.slice(0, 120).map(line).join("")}</div>` : `<p class="small muted">Ouvre sa page avec « Revoir ses annonces » pour relever ses annonces.</p>`}
      </div>`;
    body.dataset.loaded = "1";
    bindSupplierForms(body);
    body.querySelector("[data-lbcuntrack]")?.addEventListener("click", async (ev) => { await api("lbc:untrack", { seller: ev.currentTarget.dataset.lbcuntrack }); toast("Concurrent retiré"); render(); });
  }));
}

function bindNicheResults(root) {
  root.querySelectorAll("[data-follow]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await api("tracker:add", { sellerId: b.dataset.follow, market: state.niche?.market || "fr", label: b.dataset.login || null });
      b.replaceWith(Object.assign(document.createElement("span"), { className: "small muted", textContent: "Suivi" }));
      toast("Concurrent ajouté : relevé de son dressing en cours");
    } catch (x) { b.disabled = false; toast(x.message); }
  }));
}
function bindSupplierForms(root) {
  root.querySelectorAll("form[data-link], form[data-lbclink]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = f.querySelector("input"), btn = f.querySelector("button");
    btn.disabled = true;
    try {
      const r = f.dataset.lbclink ? await api("lbc:link", { listId: f.dataset.lbclink, url: input.value.trim() }) : await api("item:link", { vintedId: f.dataset.link, url: input.value.trim() });
      f.closest("details").outerHTML = `<div class="supplier ok small"><span>Fournisseur ${esc(PLATFORM_NAME[r.platform] || "")} relié</span><a href="${safeUrl(input.value.trim())}" target="_blank" rel="noopener">Voir le produit</a></div>`;
      toast("Produit relié à la vente");
    } catch (x) { btn.disabled = false; toast(x.message); }
  }));
}

function bindTrackers() {
  bindLbcTrackers();
  bindChannelTrackers();
  document.getElementById("salesnotify")?.addEventListener("change", (e) => { api("competitor:salesNotify", { on: e.currentTarget.checked }).catch(() => {}); });
  const nout = document.getElementById("nicheout");
  if (nout) bindNicheResults(nout);
  document.getElementById("diagform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = document.getElementById("diagout");
    const btn = e.currentTarget.querySelector("button");
    btn.disabled = true; btn.textContent = "Lecture de ton compte…";
    out.innerHTML = `<div class="skel" style="height:160px"></div>`;
    try { out.innerHTML = diagnosticHtml(await api("diagnostic:run", { url: document.getElementById("diagurl").value.trim() })); }
    catch (x) { out.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
    finally { btn.disabled = false; btn.textContent = "Refaire"; }
  });
  document.getElementById("nicheform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("nicheq").value.trim();
    const btn = e.currentTarget.querySelector("button");
    state.nicheQuery = q;
    btn.disabled = true; btn.textContent = "Analyse…";
    nout.innerHTML = `<div class="skel" style="height:140px"></div>`;
    try { state.niche = await api("niche:search", { query: q }); nout.innerHTML = nicheHtml(state.niche); bindNicheResults(nout); }
    catch (x) { nout.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
    finally { btn.disabled = false; btn.textContent = "Analyser"; }
  });
  if (state.nicheAuto) {
    state.nicheAuto = false;
    const f = document.getElementById("nicheform");
    if (f) { document.getElementById("nicheq").value = state.nicheQuery || ""; f.scrollIntoView({ block: "start" }); f.requestSubmit(); }
  }
  document.getElementById("trackform")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("trackerr");
    const raw = document.getElementById("trackurl").value.trim();
    const m = raw.match(/vinted\.([a-z.]+)\/member\/(\d+)(?:-([^/?#]+))?/i) || raw.match(/^(\d{3,15})$/);
    if (!m) { err.innerHTML = `<div class="notice err">Colle le lien d'un profil Vinted (…/member/123456-pseudo).</div>`; return; }
    const sellerId = m.length > 2 ? m[2] : m[1];
    const tld = m.length > 2 ? m[1].toLowerCase() : "fr";
    const market = tld === "co.uk" ? "uk" : tld;
    const label = m[3] ? decodeURIComponent(m[3]).replace(/[-_]+/g, " ") : null;
    err.innerHTML = "";
    try { await api("tracker:add", { sellerId, market, label }); toast("Concurrent ajouté : relevé de son dressing en cours"); render(); }
    catch (x) { err.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  });
  document.querySelectorAll("[data-tracker]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.tracker;
    const body = document.getElementById(`tb-${id}`);
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
    if (open || body.dataset.loaded) return;
    body.innerHTML = `<div class="skel" style="height:120px;margin-top:8px"></div>`;
    try {
      const [recap, items] = await Promise.all([api("tracker:recap", { id }), api("tracker:items", { id })]);
      body.innerHTML = recapHtml(recap || { per_week: [], brands: [], price_bands: [], fastest: [], sold_seen: 0, revenue_seen: 0, active: 0, active_value: 0, new_listings_7d: 0 }, items || []).replace("__ID__", esc(id));
      body.dataset.loaded = "1";
      bindSupplierForms(body);
      body.querySelector("[data-untrack]")?.addEventListener("click", async (ev) => { await api("tracker:remove", { id: ev.currentTarget.dataset.untrack }); toast("Concurrent retiré"); render(); });
    } catch (x) { body.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  }));
}

function bindSuivis(hist) {
  bindSales();
  bindRepost();
  document.querySelectorAll("[data-unwatch]").forEach((b) => b.addEventListener("click", async () => { await api("watch:remove", { key: b.dataset.unwatch }); render(); }));
  document.getElementById("clearhist")?.addEventListener("click", async () => { await api("history:clear"); render(); });
  document.querySelectorAll("[data-hist]").forEach((b) => b.addEventListener("click", async () => {
    const list = await api("history:list");
    const e = list[Number(b.dataset.hist)];
    if (!e) return;
    state.entry = e;
    state.query = e.query;
    location.hash = "#/analyse";
  }));
}

// ───────────────────────── Compte

function viewCompte(params) {
  const welcome = params.get("welcome");
  if (!state.me) {
    const mode = params.get("mode") === "signin" ? "signin" : "signup";
    return `
      ${params.get("gate") && !welcome ? `<div class="notice info" style="max-width:440px;margin:0 auto 12px"><b>Crée ton compte gratuit pour utiliser AliEdge.</b> C'est 10 secondes, sans carte bancaire. Avec Google, c'est un clic.</div>` : ""}
      ${welcome ? `<div class="notice ok" style="margin-bottom:12px">AliEdge est installé. Épingle-le dans la barre de Chrome (icône puzzle), puis crée ton compte gratuit. Chaque analyse que tu lances enrichit le catalogue de toute la communauté.</div>` : ""}
      <section class="card pad stack" style="max-width:440px;margin:0 auto">
        <div class="seg" role="tablist">
          <button type="button" data-mode="signup" aria-pressed="${mode === "signup"}">Créer un compte</button>
          <button type="button" data-mode="signin" aria-pressed="${mode === "signin"}">Se connecter</button>
        </div>
        <p class="muted small">${mode === "signup" ? "Gratuit et complet pendant le lancement : analyses illimitées et tout le catalogue. Même compte que Barapics." : "Utilise le même compte que sur Barapics."}</p>
        <form id="authform" class="stack" novalidate>
          <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Mot de passe</span><input class="input" name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" required></label>
          ${mode === "signup" ? `<label class="switch small"><span>Recevoir les conseils de revente et les nouveautés par email</span><input type="checkbox" name="marketing"></label>` : ""}
          <div id="autherr" role="alert"></div>
          <button class="btn primary block" type="submit">${mode === "signup" ? "Créer mon compte" : "Se connecter"}</button>
        </form>
        <button id="google" class="btn block" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z"/></svg>Continuer avec Google</button>
        ${mode === "signin" ? `<button id="forgot" class="btn ghost small" type="button">Mot de passe oublié ?</button>` : ""}
      </section>`;
  }
  const m = state.me;
  const s = state.settings || {};
  const pct = Math.min(100, Math.round(((m.used_today || 0) / (m.daily_limit || 5)) * 100));
  return `
    <section class="card pad stack">
      <div class="row between"><div><h2>${esc(m.email || "Mon compte")}</h2><p class="small muted">${m.free_launch ? "Accès complet offert pendant le lancement" : m.pro ? `AliEdge Pro${m.expires_at ? ` jusqu'au ${new Date(m.expires_at).toLocaleDateString("fr-FR")}` : ""}${m.source === "skool" ? " · offert aux membres Skool" : ""}` : "Offre gratuite"}</p></div><span class="plan ${m.pro ? "pro" : ""}" style="margin:0">${m.free_launch ? "Complet" : m.pro ? "Pro" : "Gratuit"}</span></div>
      ${m.pro ? `<p class="small"><b class="num">${m.used_today || 0}</b> analyse${(m.used_today || 0) > 1 ? "s" : ""} aujourd'hui · <b class="num">${m.contributed || 0}</b> produit${(m.contributed || 0) > 1 ? "s" : ""} ajouté${(m.contributed || 0) > 1 ? "s" : ""} au catalogue par toi</p>` : `<div><div class="row between small"><span>Analyses aujourd'hui</span><span class="num">${m.used_today || 0} / ${m.daily_limit}</span></div><div class="quota" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>`}
      ${state.community ? `<p class="small muted">Catalogue commun : <b class="num">${state.community.products}</b> produits, <b class="num">${state.community.sold}</b> ventes repérées, <b class="num">${state.community.contributors}</b> membres contributeurs.</p>` : ""}
      ${m.offline ? `<p class="notice warn">Serveur AliEdge injoignable : ton offre sera vérifiée à la reconnexion.</p>` : ""}
    </section>
    ${!m.pro ? `
    <section class="card pad stack" style="margin-top:12px">
      <h2>AliEdge Pro</h2>
      <ul class="muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li>Analyses illimitées</li>
        <li>Catalogue complet des produits déjà vendus sur Vinted</li>
        <li>Ventes réellement constatées dans chaque analyse</li>
      </ul>
      <a class="btn primary block" href="${BUY_URL}" target="_blank" rel="noopener">Passer à Pro</a>
      <p class="small muted">Membre du Skool VintedDrop ? Ton premier mois est offert. <a href="${SKOOL_URL}" target="_blank" rel="noopener">Voir le Skool</a></p>
    </section>` : ""}
    ${m.source !== "skool" ? `
    <section class="card pad stack" style="margin-top:12px">
      <h2>Apprendre la méthode complète</h2>
      <p class="small muted">AliEdge te dit quoi vendre. Le Skool VintedDrop t'apprend à le vendre et à l'expédier sans stock, avec l'entrepôt. L'entrée donne un mois offert sur Barapics.</p>
      <a class="btn primary block" href="${SKOOL_URL}" target="_blank" rel="noopener">Découvrir le Skool</a>
    </section>` : ""}
    <section class="card pad stack" style="margin-top:12px">
      <h2>Gagner de l'argent avec ton lien</h2>
      <p class="small muted">Recommande Barapics et AliEdge : tu touches une commission sur chaque abonnement de tes filleuls.</p>
      <a class="btn block" href="https://barapics.com/parrainage" target="_blank" rel="noopener">Mon lien d'affiliation</a>
    </section>
    <section class="card pad" style="margin-top:12px">
      <h2 style="margin-bottom:6px">Réglages</h2>
      <div class="grid2" style="margin:8px 0">
        <label class="field"><span>Pays Vinted</span><select class="input" data-set="market">${Object.entries(MARKETS).map(([k, x]) => `<option value="${k}" ${s.market === k ? "selected" : ""}>${x.label}</option>`).join("")}</select></label>
        <label class="field"><span>Coût par vente</span><div class="input-euro"><input class="input num" data-set="costPerSale" inputmode="decimal" value="${String(s.costPerSale ?? 0.5).replace(".", ",")}"></div></label>
      </div>
      <p class="small muted">Coût par vente : emballage, étiquette, petits frais. Vinted ne prend pas de commission au vendeur.</p>
      <p class="small muted" style="margin-top:10px">En utilisant AliEdge, tu alimentes le catalogue commun des ventes constatées sur Vinted. Rien de personnel n'est partagé. <a href="${PRIVACY_URL}" target="_blank" rel="noopener">En savoir plus</a></p>
      <label class="switch"><span><b>Partager mes favoris Vinted</b><br><span class="small muted">Les annonces que tu mets en favori rejoignent la base commune pour repérer leurs ventes. Ton compte n'est jamais associé.</span></span><input type="checkbox" data-set="shareLikes" ${s.shareLikes !== false ? "checked" : ""}></label>
      <label class="switch"><span><b>Ajouter les produits des recherches fournisseurs</b><br><span class="small muted">Les produits affichés par tes recherches AliExpress, Temu et Shein rejoignent le catalogue commun (aucune requête en plus vers ces sites).</span></span><input type="checkbox" data-set="autoSupplier" ${s.autoSupplier !== false ? "checked" : ""}></label>
      ${Object.entries(CHANNELS).map(([ch, C]) => `<label class="switch"><span><b>${C.label}</b><br><span class="small muted">${C.desc || `Publier tes annonces Vinted sur ${C.label} en un clic, suivre tes concurrents ${C.label}, trouver le fournisseur d'un article. Aucune requête en plus vers ${C.label}.`}</span></span><input type="checkbox" data-set="${ch}" ${s[ch] !== false && state.chPerm?.[ch] ? "checked" : ""}></label>`).join("")}
      ${["beebs", "opla"].map((ch) => `<label class="switch"><span><b>Publier automatiquement sur ${CHANNELS[ch].label}</b><br><span class="small muted">Quand titre, prix, photos, catégorie et état sont remplis, AliEdge clique sur « Publier » après 5 secondes (annulable). Vérifie tes premières annonces : une erreur partirait en ligne.</span></span><input type="checkbox" data-set="autoPublish_${ch}" ${s[`autoPublish_${ch}`] === true ? "checked" : ""}></label>`).join("")}
      <label class="switch"><span><b>Leboncoin</b><br><span class="small muted">Outils AliEdge sur Leboncoin (fournisseur, warehouse, aide au dépôt, concurrents) et ventes repérées sur les pages que tu ouvres. Aucune requête en plus vers Leboncoin.</span></span><input type="checkbox" data-set="lbc" ${s.lbc !== false && !state.lbcAsk && state.lbcPerm !== false ? "checked" : ""}></label>
      <details class="fold" data-fold="replies" style="margin-top:6px"><summary><b>Réponses toutes prêtes (messagerie Leboncoin)</b></summary>
        <div class="stack" style="margin-top:8px">
          <p class="small muted">Une réponse par paragraphe (ligne vide entre deux). {prix} est remplacé par la contre-offre conseillée. AliEdge insère le texte, c'est toi qui envoies.</p>
          <textarea id="lbcreplies" class="input" rows="7"></textarea>
          <button class="btn small" type="button" id="lbcrepliessave">Enregistrer les réponses</button>
        </div>
      </details>
      <label class="field" style="margin-top:6px"><span><b>Adresse pour reposter</b> <span class="small muted">· demandée par certains sites (Beebs…) pour calculer la distance avec les acheteurs. AliEdge la remplit pour toi ; elle reste dans ce navigateur.</span></span><input class="input" type="text" data-set="sellAddress" value="${esc(s.sellAddress || "")}" placeholder="Ex : 12 rue de la République, 30000 Nîmes" autocomplete="street-address" maxlength="200"></label>
      <label class="switch"><span><b>Bouton sur les fiches produit</b><br><span class="small muted">Affiche « Analyser sur Vinted » sur AliExpress, Temu et Shein.</span></span><input type="checkbox" data-set="showPill" ${s.showPill ? "checked" : ""}></label>
    </section>
    <div class="row between" style="margin-top:12px">
      <span class="small muted">AliEdge ${esc(chrome.runtime.getManifest().version)} · by Ivan Bara · <a href="${PRIVACY_URL}" target="_blank" rel="noopener">Confidentialité</a></span>
      <button id="signout" class="btn ghost" type="button">Se déconnecter</button>
    </div>`;
}

// ───────── Leboncoin : accès facultatif à leboncoin.fr, proposé d'office à l'ouverture du panneau (un clic).
// (Une permission obligatoire désactiverait AliEdge chez tous les membres à la mise à jour.)
const LBC_PERM = { origins: ["https://www.leboncoin.fr/*"] };
async function enableLbc() {
  let ok = false;
  try { ok = await chrome.permissions.request(LBC_PERM); } catch { ok = false; }
  if (!ok) { toast("Accès à leboncoin.fr refusé : rien n'a changé."); return false; }
  await saveSettings({ lbc: true }).catch(() => {});
  await api("lbc:status").catch(() => {});
  toast("Leboncoin activé");
  return true;
}
// Canaux de vente en plus (Beebs, Opla) : accès facultatif à chaque site, demandé en un clic.
const CHANNELS = {
  beebs: { label: "Beebs", host: "beebs.app", perm: { origins: ["https://www.beebs.app/*", "https://beebs.app/*"] }, shop: "boutique", shopUrl: (u) => `https://www.beebs.app/fr/dressing/${encodeURIComponent(u)}`, shopRe: /beebs\.app\/[a-z]{2}\/dressing\/([A-Za-z0-9_-]{10,64})/, placeholder: "https://www.beebs.app/fr/dressing/…" },
  facebook: { label: "Facebook", host: "facebook.com", perm: { origins: ["https://www.facebook.com/*"] }, fillOnly: true, desc: "Reposter une annonce Vinted sur Facebook Marketplace : AliEdge remplit le formulaire, tu publies. Meta exige une expédition sous 3 jours : seulement pour des articles déjà en stock à la warehouse. AliEdge ne lit aucune autre page Facebook." },
  opla: { label: "Opla", host: "opla.co", perm: { origins: ["https://www.opla.co/*", "https://opla.co/*"] }, shop: "boutique", shopUrl: (u) => `https://www.opla.co/seller/${encodeURIComponent(u)}`, shopRe: /opla\.co\/(?:[a-z]{2}\/)?seller\/([^/?#\s]{6,160})/, placeholder: "https://www.opla.co/seller/…" },
};
const BEEBS_PERM = CHANNELS.beebs.perm;
async function enableChannel(ch) {
  const C = CHANNELS[ch];
  let ok = false;
  try { ok = await chrome.permissions.request(C.perm); } catch { ok = false; }
  if (!ok) { toast(`Accès à ${C.host} refusé : rien n'a changé.`); return false; }
  await saveSettings({ [ch]: true }).catch(() => {});
  await api(`${ch}:status`).catch(() => {});
  state.chPerm = { ...(state.chPerm || {}), [ch]: true };
  toast(`${C.label} activé`);
  return true;
}
const enableBeebs = () => enableChannel("beebs");

async function loadLbcAsk() {
  const has = await chrome.permissions.contains(LBC_PERM).catch(() => true);
  const later = (await chrome.storage.local.get("ae_lbc_ask_later")).ae_lbc_ask_later || 0;
  state.lbcPerm = has;
  state.chPerm = {};
  for (const ch of Object.keys(CHANNELS)) state.chPerm[ch] = await chrome.permissions.contains(CHANNELS[ch].perm).catch(() => false);
  state.beebsPerm = state.chPerm.beebs;
  state.lbcAsk = !has && Date.now() - later > 14 * 864e5; // « Plus tard » : reproposé 14 jours après
}

// Langue du panneau : automatique (langue de Chrome), français ou anglais.
let langPref = "auto";
function langPickerHtml() {
  return `<label class="field" style="max-width:440px;margin:16px auto 0"><span>Langue</span>
    <select id="langpick" class="input">
      <option value="auto" ${langPref === "auto" ? "selected" : ""}>Automatique</option>
      <option value="fr" ${langPref === "fr" ? "selected" : ""} data-no-i18n>Français</option>
      <option value="en" ${langPref === "en" ? "selected" : ""} data-no-i18n>English</option>
    </select></label>`;
}

const DEFAULT_LBC_REPLIES = [
  "Bonjour, oui l'article est toujours disponible 😊",
  "Bonjour, je peux l'envoyer avec la livraison Leboncoin : tu peux faire la demande d'achat directement depuis l'annonce.",
  "Merci pour ta proposition ! Je peux descendre à {prix} €, c'est mon dernier prix.",
  "Merci pour ton achat ! L'envoi est en préparation, je te tiens au courant.",
  "Bonjour, désolé, l'article n'est plus disponible.",
];

function bindCompte(params) {
  document.querySelectorAll("[data-chenable]").forEach((b) => b.addEventListener("click", async () => { if (await enableChannel(b.dataset.chenable)) render(); }));
  const rep = document.getElementById("lbcreplies");
  if (rep) {
    api("lbc:replies").then((r) => { rep.value = (r && r.length ? r : DEFAULT_LBC_REPLIES).join("\n\n"); }).catch(() => { rep.value = DEFAULT_LBC_REPLIES.join("\n\n"); });
    rep.setAttribute("data-no-i18n", "");
    document.getElementById("lbcrepliessave")?.addEventListener("click", async () => {
      const list = rep.value.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      await api("lbc:setReplies", { replies: list });
      toast("Réponses enregistrées");
    });
  }
  document.getElementById("langpick")?.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ ae_lang: e.target.value });
    location.reload();
  });
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { location.hash = `#/compte?mode=${b.dataset.mode}`; }));
  const form = document.getElementById("authform");
  const err = document.getElementById("autherr");
  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const after = async () => {
    await loadAuth();
    const next = params.get("next");
    location.hash = next === "analyse" || !next ? "#/analyse" : `#/${next}`;
    render();
  };
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.innerHTML = `<p class="notice err">Email invalide.</p>`; return; }
    if (password.length < 8) { err.innerHTML = `<p class="notice err">Mot de passe : 8 caractères minimum.</p>`; return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      if (mode === "signup") {
        const r = await api("auth:signUp", { email, password, marketing: fd.get("marketing") === "on" });
        if (r.confirm) { err.innerHTML = `<p class="notice ok">Compte créé. Clique sur le lien reçu par email, puis connecte-toi ici.</p>`; btn.disabled = false; return; }
      } else {
        await api("auth:signIn", { email, password });
      }
      toast("Connecté");
      await after();
    } catch (e2) {
      err.innerHTML = `<p class="notice err">${esc(e2.message)}</p>`;
      btn.disabled = false;
    }
  });
  document.getElementById("google")?.addEventListener("click", async () => {
    try { await api("auth:google"); toast("Connecté"); await after(); }
    catch (e) { if (err) err.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; }
  });
  document.getElementById("forgot")?.addEventListener("click", async () => {
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) { err.innerHTML = `<p class="notice warn">Saisis ton email ci-dessus, puis clique à nouveau.</p>`; return; }
    try { await api("auth:recover", { email }); err.innerHTML = `<p class="notice ok">Email envoyé : suis le lien pour choisir un nouveau mot de passe.</p>`; }
    catch (e) { err.innerHTML = `<p class="notice err">${esc(e.message)}</p>`; }
  });
  document.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", async () => {
    const k = el.dataset.set;
    if (CHANNELS[k] && el.checked && !(await chrome.permissions.contains(CHANNELS[k].perm).catch(() => false))) {
      if (!(await enableChannel(k))) el.checked = false;
      return;
    }
    if (k === "lbc" && el.checked && !(await chrome.permissions.contains(LBC_PERM).catch(() => false))) {
      if (!(await enableLbc())) el.checked = false;
      else { state.lbcAsk = false; }
      return;
    }
    const v = el.type === "checkbox" ? el.checked : k === "costPerSale" ? parseFloat(el.value.replace(",", ".")) || 0 : el.value;
    saveSettings({ [k]: v }).then(() => toast("Réglage enregistré"));
  }));
  document.getElementById("signout")?.addEventListener("click", async () => { await api("auth:signOut"); state.me = null; renderPlan(); render(); });
}

// ───────────────────────── Prise en main (premier lancement, 3 écrans)

const ONBOARD_KEY = "ae_onboarded";
const EXAMPLE_QUERY = "sac bandoulière cuir femme";
let onboarded = true;
async function loadOnboarded() {
  try { onboarded = !!(await chrome.storage.local.get(ONBOARD_KEY))[ONBOARD_KEY]; } catch { onboarded = true; }
}
async function finishOnboarding(hash = "#/analyse") {
  onboarded = true;
  try { await chrome.storage.local.set({ [ONBOARD_KEY]: Date.now() }); } catch { /* stockage indisponible */ }
  location.hash = hash;
}

function viewBienvenue(params) {
  const step = Math.min(3, Math.max(1, Number(params.get("s")) || 1));
  const dots = [1, 2, 3].map((n) => `<span class="ob-dot ${n <= step ? "on" : ""}" aria-hidden="true"></span>`).join("");
  const market = state.settings?.market || "fr";
  let body;
  if (step === 1) {
    body = `
      <h2>Bienvenue sur AliEdge</h2>
      <p class="muted">Avant de commander chez AliExpress, Temu ou Shein, AliEdge te montre ce que le produit vaut vraiment sur Vinted. Trois réglages et c'est parti.</p>
      <label class="stack" style="gap:6px"><span class="small"><b>Sur quel Vinted tu vends ?</b></span>
        <select id="ob-market" class="input">${Object.entries(MARKETS).map(([k, m]) => `<option value="${k}" ${k === market ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
      </label>
      <button class="btn primary block" type="button" data-next="2">Continuer</button>`;
  } else if (step === 2) {
    body = `
      <h2>Ta première analyse</h2>
      <p class="muted">Sur une fiche produit, le bouton « Analyser sur Vinted » fait tout. Essaie ici avec un exemple : AliEdge cherche les annonces identiques et calcule le prix de revente.</p>
      <div class="row" style="gap:8px"><input id="ob-query" class="input" value="${esc(EXAMPLE_QUERY)}" aria-label="Mots-clés de l'exemple" style="flex:1"><button id="ob-run" class="btn primary" type="button">Analyser</button></div>
      <div id="ob-result" aria-live="polite"></div>
      <button class="btn block" type="button" data-next="3">Continuer</button>`;
  } else {
    body = `
      <h2>Ton premier filtre Radar</h2>
      <p class="muted">Le Radar surveille les nouvelles annonces Vinted et te prévient dès qu'une bonne affaire sort. L'achat se fait toujours toi-même.</p>
      <div class="stack" style="gap:8px">
        <input id="ob-rq" class="input" value="${esc(EXAMPLE_QUERY)}" aria-label="Mots-clés à surveiller">
        <div class="row" style="gap:8px"><input id="ob-rmax" class="input" inputmode="decimal" placeholder="Prix max (€)" aria-label="Prix maximum" style="flex:1"><button id="ob-radar" class="btn primary" type="button">Créer le filtre</button></div>
      </div>
      <button class="btn ghost block" type="button" data-done>Passer et commencer</button>`;
  }
  return `<section class="card pad stack onboard" aria-label="Prise en main"><div class="ob-dots">${dots}<span class="small muted">Étape ${step} sur 3</span></div>${body}</section>`;
}

function bindBienvenue(params) {
  const step = Number(params.get("s")) || 1;
  document.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", async () => {
    if (step === 1) await saveSettings({ market: document.getElementById("ob-market").value });
    location.hash = `#/bienvenue?s=${b.dataset.next}`;
  }));
  document.querySelector("[data-done]")?.addEventListener("click", () => finishOnboarding());
  document.getElementById("ob-run")?.addEventListener("click", async (e) => {
    const out = document.getElementById("ob-result");
    const q = document.getElementById("ob-query").value.trim();
    if (!q) return;
    e.currentTarget.disabled = true;
    out.innerHTML = `<div class="skel" style="height:64px"></div>`;
    try {
      const entry = await api("analyze", { product: null, query: q, market: state.settings?.market, condition: state.settings?.condition, shipping: 0 });
      const r = entry.result;
      out.innerHTML = r.sell == null ? `<div class="notice warn">Pas assez d'annonces pour cet exemple. Essaie d'autres mots-clés.</div>` : `
        <div class="ticket ob-ticket"><div><div class="k">Prix de revente conseillé</div><div class="big num pos">${eur(r.sell)}</div>
        <div class="sub">${entry.items.filter((i) => !i.excluded).length} annonces comparables · médiane ${eur(r.activeStats?.median)}</div>
        <div class="sub" style="margin-top:6px">Sur une vraie fiche, AliEdge déduit le prix d'achat et te donne ta marge.</div></div></div>`;
    } catch (err) {
      out.innerHTML = `<div class="notice err">${esc(err.message)}</div>`;
    } finally {
      e.currentTarget.disabled = false;
    }
  });
  document.getElementById("ob-radar")?.addEventListener("click", async (e) => {
    const query = document.getElementById("ob-rq").value.trim();
    if (!query) return;
    e.currentTarget.disabled = true;
    try {
      const max = parseFloat(document.getElementById("ob-rmax").value.replace(",", "."));
      await api("radar:save", { filter: { query, name: query, market: state.settings?.market || "fr", priceMax: Number.isFinite(max) ? max : null } });
      toast("Filtre créé : le Radar te prévient des nouvelles annonces");
      finishOnboarding("#/radar");
    } catch (err) {
      toast(err.message);
      e.currentTarget.disabled = false;
    }
  });
}

// ───────────────────────── Leboncoin dans l'analyse : ventes Leboncoin repérées par la communauté pour la même recherche
// (base commune AliEdge : aucune requête vers Leboncoin).
async function fillLbcBox() {
  const box = document.getElementById("lbcbox");
  const e = state.entry;
  if (!box || !e?.query || !state.me) return;
  const st = await api("lbc:status").catch(() => ({ enabled: false }));
  if (!st.enabled) { box.remove(); return; }
  const rows = await api("lbc:feed", { search: e.query.slice(0, 80), dropship: false }).catch(() => []);
  const prices = rows.map((r) => Number(r.price)).filter((n) => n > 0).sort((a, b) => a - b);
  const med = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const sure = rows.filter((r) => r.certainty === "sold").length;
  const search = `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(e.query)}`;
  const diff = med != null && e.result?.sell ? med - e.result.sell : null;
  box.innerHTML = `<div class="card pad row between wrap" style="gap:8px">
    <div><b>Sur Leboncoin</b><div class="small muted">${rows.length
      ? `${rows.length} vente${rows.length > 1 ? "s" : ""} repérée${rows.length > 1 ? "s" : ""}${sure ? ` (dont ${sure} confirmée${sure > 1 ? "s" : ""})` : ""} · prix médian ${eur(med)}${diff != null && Math.abs(diff) >= 1 ? ` · ${diff > 0 ? "plus cher" : "moins cher"} que Vinted de ${eur(Math.abs(diff))}` : ""}`
      : "Pas encore de vente Leboncoin repérée pour cette recherche."}</div></div>
    <a class="btn small" href="${safeUrl(search)}" target="_blank" rel="noopener">Voir sur Leboncoin</a></div>`;
}

// ───────────────────────── Ventes à expédier → warehouse
// Chaque vente Vinted pas encore expédiée est reliée à son produit fournisseur. Un clic l'envoie à la
// warehouse d'Ivan Bara avec le lien d'achat déjà rempli : la warehouse achète, emballe et expédie.

const sales = { state: "idle", list: [], error: "", linking: null, cands: null };

function supplierLine(s, i) {
  const sup = s.supplier;
  if (sales.linking === i) {
    const opts = (sales.cands || []).slice(0, 30).map((c, j) => `<option value="${j}">${esc((c.title || c.url).slice(0, 70))}</option>`).join("");
    return `<form class="stack" data-linkform="${i}" style="gap:6px;margin-top:6px">
      ${opts ? `<select class="input" name="pick"><option value="">Choisir un produit analysé…</option>${opts}</select>` : ""}
      <input class="input" name="url" type="url" inputmode="url" placeholder="ou colle le lien AliExpress / Temu / Shein">
      <div class="row" style="gap:6px"><button class="btn small primary" type="submit">Relier</button><button class="btn small ghost" type="button" data-linkcancel>Annuler</button></div>
    </form>`;
  }
  if (!sup) return `<div class="m">Produit fournisseur inconnu · <button class="btn ghost small" type="button" data-link="${i}">Associer</button></div>`;
  return `<div class="m">${sup.sure ? "✓" : "Suggestion :"} <a href="${safeUrl(sup.url)}" target="_blank" rel="noopener">${esc((sup.title || "produit fournisseur").slice(0, 60))}</a>${sup.price ? ` · ${eur(sup.price)}` : ""}
    ${sup.sure ? `<button class="btn ghost small" type="button" data-link="${i}">Changer</button>` : `<button class="btn ghost small" type="button" data-confirm="${i}">C'est bien lui</button><button class="btn ghost small" type="button" data-link="${i}">Changer</button>`}</div>`;
}

function salesSectionHtml() {
  const head = `<div class="row between"><h2>Ventes à expédier</h2>${sales.state === "done" ? '<button class="btn ghost small" type="button" id="salesreload">↻</button>' : ""}</div>`;
  let body;
  if (sales.state === "idle") body = `<div class="card pad stack"><p class="small muted">AliEdge lit tes ventes Vinted pas encore expédiées (compte ouvert dans ce navigateur) et retrouve le produit fournisseur de chacune. Un clic, et la warehouse achète, emballe et expédie à ta place.</p><button class="btn primary block" type="button" id="salesload">Voir mes ventes à expédier</button></div>`;
  else if (sales.state === "loading") body = `<div class="skel" style="height:90px"></div>`;
  else if (sales.state === "error") body = `<div class="notice warn">${esc(sales.error)}</div>`;
  else if (!sales.list.length) body = `<p class="muted small">Aucune vente en attente d'expédition.</p>`;
  else body = `<div class="items">${sales.list.map((s, i) => `
    <div class="item" style="grid-template-columns:56px 1fr">
      ${s.photo ? `<img src="${safeUrl(s.photo)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
      <div>
        <div class="row between" style="gap:8px;align-items:flex-start"><span class="t">${esc(s.title)}</span><span class="p num">${s.price ? eur(s.price) : ""}</span></div>
        <div class="m">${[s.buyer ? `pour ${esc(s.buyer)}` : "", esc(s.status || "")].filter(Boolean).join(" · ")}</div>
        ${supplierLine(s, i)}
        <a class="btn small ${s.supplier ? "primary" : ""}" style="margin-top:6px" href="${esc(WAREHOUSE_URL)}?vsale=${encodeURIComponent(s.transaction_id)}" target="_blank" rel="noopener" data-wh="${i}">Confier à la warehouse</a>
      </div>
    </div>`).join("")}</div>
    <p class="small muted">Sur la page warehouse, il ne reste qu'à vérifier l'article et ajouter le bordereau Vinted.</p>`;
  return `<section class="stack" id="salesbox">${head}${body}</section>`;
}

async function loadSales() {
  sales.state = "loading"; sales.linking = null;
  refreshSales();
  try { sales.list = await api("sales:pending"); sales.state = "done"; }
  catch (e) { sales.state = "error"; sales.error = e.message; }
  refreshSales();
}

function refreshSales() {
  const box = document.getElementById("salesbox");
  if (!box) return;
  box.outerHTML = salesSectionHtml();
  bindSales();
}

function bindSales() {
  const box = document.getElementById("salesbox");
  if (!box) return;
  box.querySelector("#salesload")?.addEventListener("click", loadSales);
  box.querySelector("#salesreload")?.addEventListener("click", loadSales);
  box.querySelectorAll("[data-link]").forEach((b) => b.addEventListener("click", async () => {
    sales.linking = Number(b.dataset.link);
    if (!sales.cands) sales.cands = await api("sales:candidates").catch(() => []);
    refreshSales();
  }));
  box.querySelector("[data-linkcancel]")?.addEventListener("click", () => { sales.linking = null; refreshSales(); });
  box.querySelectorAll("[data-confirm]").forEach((b) => b.addEventListener("click", async () => {
    const s = sales.list[Number(b.dataset.confirm)];
    await api("sales:link", { title: s.title, supplier: s.supplier }).catch((e) => toast(e.message));
    s.supplier = { ...s.supplier, sure: true };
    toast("Produit relié à cette vente");
    refreshSales();
  }));
  box.querySelector("[data-linkform]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const s = sales.list[Number(f.dataset.linkform)];
    const pick = f.pick?.value !== "" && f.pick ? sales.cands[Number(f.pick.value)] : null;
    const url = f.url.value.trim();
    const supplier = url ? { url, title: s.title } : pick;
    if (!supplier) { toast("Choisis un produit ou colle un lien"); return; }
    try {
      await api("sales:link", { title: s.title, supplier });
      s.supplier = { ...supplier, sure: true };
      sales.linking = null;
      toast("Produit relié à cette vente");
      refreshSales();
    } catch (x) { toast(x.message); }
  });
}

// ───────────────────────── Beebs, canal de vente en plus : reposter ses annonces Vinted en série
// Sites où reposter ses annonces Vinted en série : Beebs, Opla et Leboncoin.
// Facebook : une annonce à la fois depuis Vinted, pas de série.
const REPOST_CH = { ...Object.fromEntries(Object.entries(CHANNELS).filter(([, C]) => !C.fillOnly)), lbc: { label: "Leboncoin" } };
const repost = { state: "idle", items: [], sel: new Set(), error: "", market: "fr", ch: "beebs" };
function repostHtml() {
  let body;
  const L = REPOST_CH[repost.ch].label;
  const seg = `<div class="seg" role="group" aria-label="Canal de vente">${Object.entries(REPOST_CH).map(([ch, C]) => `<button type="button" data-rpch="${ch}" aria-pressed="${repost.ch === ch}">${C.label}</button>`).join("")}</div>`;
  if (repost.state === "idle") body = `<div class="card pad stack"><p class="small muted">Un canal de vente en plus : choisis tes annonces Vinted, AliEdge les prépare une par une sur ${L} (texte, prix, photos). Tu publies chacune d'un clic, la suivante s'ouvre toute seule.</p><button class="btn primary block" type="button" id="repostload">Choisir mes annonces Vinted</button></div>`;
  else if (repost.state === "loading") body = `<div class="skel" style="height:90px"></div>`;
  else if (repost.state === "error") body = `<div class="notice warn">${esc(repost.error)}</div>${repost.needEnable ? `<button class="btn" type="button" id="repostenable">Activer ${L}</button>` : ""}`;
  else if (!repost.items.length) body = `<p class="muted small">Aucune annonce en ligne sur ton compte Vinted.</p>`;
  else body = `<div class="row between wrap" style="gap:8px"><label class="row small"><input type="checkbox" id="repostall"> Tout sélectionner (hors déjà sur ${L})</label><span class="small muted">${repost.sel.size} sélectionnée${repost.sel.size > 1 ? "s" : ""}</span></div>
    <div class="items">${repost.items.map((i) => `<label class="item" style="grid-template-columns:20px 44px 1fr auto;cursor:pointer"><input type="checkbox" data-rp="${i.id}" ${repost.sel.has(i.id) ? "checked" : ""}>${i.photo ? `<img src="${safeUrl(i.photo)}" alt="" referrerpolicy="no-referrer" style="width:44px;height:56px">` : '<div class="ph" style="width:44px;height:56px"></div>'}<div><div class="t">${esc(i.title || "Annonce")}</div><div class="m">${[i.sold ? "Vendue sur Vinted" : "", i.posted ? `Déjà sur ${L}` : ""].filter(Boolean).join(" · ")}</div></div><div class="p num">${i.price != null ? eur(i.price) : ""}</div></label>`).join("")}</div>
    <button class="btn primary block" type="button" id="repostgo" ${repost.sel.size ? "" : "disabled"}>Publier ${repost.sel.size || ""} annonce${repost.sel.size > 1 ? "s" : ""} sur ${L}</button>
    <p class="small muted">Sois connecté à ${L}. Vérifie chaque annonce avant de la publier (catégorie, état, taille).</p>`;
  return `<section class="stack" id="repostbox" style="margin-top:22px"><div class="row between wrap" style="gap:8px"><h2>Reposter sur un autre site</h2>${seg}</div>${body}</section>`;
}
function refreshRepost() { const b = document.getElementById("repostbox"); if (!b) return; b.outerHTML = repostHtml(); bindRepost(); }
function bindRepost() {
  const box = document.getElementById("repostbox");
  if (!box) return;
  const load = async () => {
    const L = REPOST_CH[repost.ch].label;
    repost.needEnable = false;
    if (!(await api(`${repost.ch}:status`).catch(() => ({ enabled: false }))).enabled) { repost.state = "error"; repost.needEnable = true; repost.error = `Active ${L} pour publier tes annonces sur ${L}.`; refreshRepost(); return; }
    repost.state = "loading"; refreshRepost();
    try { repost.items = await api(`${repost.ch}:myItems`); repost.market = repost.items[0]?.market || "fr"; repost.state = "done"; }
    catch (e) { repost.state = "error"; repost.error = e.message; }
    refreshRepost();
  };
  box.querySelector("#repostload")?.addEventListener("click", load);
  box.querySelector("#repostenable")?.addEventListener("click", async () => { if (await (repost.ch === "lbc" ? enableLbc() : enableChannel(repost.ch))) load(); });
  box.querySelectorAll("[data-rpch]").forEach((b) => b.addEventListener("click", () => { repost.ch = b.dataset.rpch; repost.state = "idle"; repost.items = []; repost.sel = new Set(); refreshRepost(); }));
  box.querySelectorAll("[data-rp]").forEach((c) => c.addEventListener("change", () => { const id = Number(c.dataset.rp); if (c.checked) repost.sel.add(id); else repost.sel.delete(id); refreshRepost(); }));
  box.querySelector("#repostall")?.addEventListener("change", (e) => { repost.sel = new Set(e.target.checked ? repost.items.filter((i) => !i.posted).map((i) => i.id).slice(0, 40) : []); refreshRepost(); });
  box.querySelector("#repostgo")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true; e.currentTarget.textContent = "Préparation…";
    try { await api(`${repost.ch}:queue`, { ids: [...repost.sel], market: repost.market }); toast(`${REPOST_CH[repost.ch].label} s'ouvre avec ta première annonce`); }
    catch (x) { toast(x.message); refreshRepost(); }
  });
}

// ───────────────────────── Balade SHEIN (trouver des niches sans rien faire)
// La balade parcourt le catalogue SHEIN de l'onglet ouvert, lentement, et note ce qu'elle voit.
// Le rapport transforme ces articles en pistes : catégories et mots qui reviennent, puis analyse Vinted.

const TOUR_STOP = new Set(("de du des la le les un une et en pour avec sans au aux à a sur par ou d l the and for with of in on to " +
  "femme femmes homme hommes fille filles garçon enfant enfants bébé women woman men man girls girl boys boy kids baby " +
  "shein 1pc pièce pièces pcs pc lot set ensemble nouveau nouvelle mode style décontracté casual elegant élégant " +
  "grande taille plus size couleur unie solid simple basique imprimé print manches courtes longues col rond " +
  "été hiver printemps automne summer winter spring fall quotidien daily cm mm 2pcs 3pcs").split(/\s+/));
const tourPrefs = { minutes: 10, pace: "calme" }; // le rythme repart toujours sur « Calme »
let tourView = { filter: "all", sort: "recent", q: "" };

const tourWords = (title) => String(title || "").toLowerCase()
  .replace(/[^a-zà-ÿ0-9\s'-]/g, " ").split(/[\s'-]+/)
  .filter((w) => w.length > 2 && !TOUR_STOP.has(w) && !/^\d+$/.test(w));
const tourPrice = (p) => { const m = String(p || "").match(/[\d.]+/); return m ? parseFloat(m[0]) : Infinity; };
const vintedSearch = (q) => `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(q)}`;
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function tourInsights(items) {
  const cats = {};
  const words = {};
  for (const x of items) {
    const c = x.cats?.length ? x.cats[x.cats.length - 1] : x.from;
    if (c) cats[c] = (cats[c] || 0) + (x.opened ? 3 : 1); // un article ouvert compte plus qu'un passage
    const ws = tourWords(x.title);
    const uniq = new Set(ws);
    for (let i = 0; i < ws.length - 1; i++) uniq.add(`${ws[i]} ${ws[i + 1]}`);
    uniq.forEach((w) => { words[w] = (words[w] || 0) + 1; });
  }
  const min = items.length > 30 ? 3 : 2;
  let top = Object.keys(words).filter((w) => words[w] >= min).sort((a, b) => words[b] - words[a] || b.length - a.length);
  // Un mot seul disparaît quand une expression qui le contient est presque aussi fréquente.
  top = top.filter((w) => w.includes(" ") || !top.some((p) => p.includes(" ") && p.split(" ").includes(w) && words[p] >= words[w] * 0.7)).slice(0, 20);
  const catTop = Object.keys(cats).sort((a, b) => cats[b] - cats[a]).slice(0, 6);
  const prices = items.map((x) => tourPrice(x.price)).filter(Number.isFinite).sort((a, b) => a - b);
  return { cats, catTop, words, top, median: prices.length ? prices[Math.floor(prices.length / 2)] : null };
}

function tourControlsHtml(st) {
  if (!st?.shein) {
    return `<section class="card pad stack">
      <h2>Balade SHEIN</h2>
      <p class="muted">Ouvre une catégorie ou une recherche sur SHEIN dans cet onglet (par exemple « robe crochet »), puis reviens ici pour lancer la balade.</p>
      <a class="btn primary block" href="https://fr.shein.com" target="_blank" rel="noopener">Ouvrir SHEIN</a>
    </section>`;
  }
  if (st.running) {
    return `<section class="card pad stack" aria-live="polite">
      <div class="row between"><h2>Balade en cours</h2><span class="chip shein">SHEIN</span></div>
      <p class="muted">${st.paused ? "En pause." : `Encore ${esc(mmss(st.left || 0))}.`} ${st.opened ? `${st.opened} article${st.opened > 1 ? "s" : ""} ouvert${st.opened > 1 ? "s" : ""}.` : ""}</p>
      <p class="small muted">Échap pour arrêter, Espace pour mettre en pause. Si SHEIN demande une vérification, la balade s'arrête et t'attend : fais-la, puis clique « Reprendre » sur la page.</p>
      <button class="btn block" type="button" id="tourstop">Arrêter la balade</button>
    </section>`;
  }
  const seg = (key, opts) => `<div class="seg" role="group" data-tour="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(tourPrefs[key]) === String(v)}">${l}</button>`).join("")}</div>`;
  return `<section class="card pad stack">
    <div class="row between"><h2>Balade SHEIN</h2><span class="chip shein">SHEIN</span></div>
    <p class="muted">AliEdge parcourt le catalogue à ta place, lentement : défilement, pauses, survol des produits, ouverture de quelques articles. Il note tout ce qu'il voit pour te sortir des pistes de niches.</p>
    <div class="field"><span>Durée</span>${seg("minutes", [[3, "3 min"], [10, "10 min"], [20, "20 min"], [45, "45 min"]])}</div>
    <div class="field"><span>Rythme</span>${seg("pace", [["calme", "Calme"], ["normal", "Normal"], ["dynamique", "Dynamique"]])}</div>
    <label class="row small"><input type="checkbox" id="touropen" ${tourPrefs.open === false ? "" : "checked"}> Ouvrir quelques articles</label>
    <label class="row small"><input type="checkbox" id="tourcursor" ${tourPrefs.cursor ? "checked" : ""}> Curseur visible (pour filmer)</label>
    <label class="row small"><input type="checkbox" id="tourbadge" ${tourPrefs.badge === false ? "" : "checked"}> Compteur sur la page</label>
    <button class="btn primary block" type="button" id="tourstart">Lancer la balade</button>
    <p class="small muted">Garde-fous : 45 min maximum, 20 articles ouverts par heure. La balade ne clique que sur des articles et ne touche jamais aux vérifications de SHEIN.</p>
    <div id="tourerr" role="alert"></div>
  </section>`;
}

function tourReportHtml(seen) {
  const all = Object.values(seen || {}).filter((x) => x?.title);
  if (!all.length) {
    return `<section class="card empty">${ICON.search}<h2>Pas encore de pistes</h2><p class="muted">Lance une balade : les catégories et les mots qui reviennent apparaîtront ici.</p></section>`;
  }
  const ins = tourInsights(all);
  const opened = all.filter((x) => x.opened).length;
  const max = ins.catTop.length ? ins.cats[ins.catTop[0]] : 1;
  let list = all.slice();
  if (tourView.filter === "opened") list = list.filter((x) => x.opened);
  if (tourView.q) { const q = tourView.q.toLowerCase(); list = list.filter((x) => `${x.title} ${(x.cats || []).join(" ")} ${x.from || ""}`.toLowerCase().includes(q)); }
  list.sort((a, b) => (tourView.sort === "views" ? (b.views || 0) - (a.views || 0) : tourView.sort === "price" ? tourPrice(a.price) - tourPrice(b.price) : (b.last || 0) - (a.last || 0)));
  return `
    <section class="stack" style="margin-top:18px">
      <div class="row between"><h2>Pistes de niches</h2><span class="small muted">${all.length} vus · ${opened} ouverts${ins.median != null ? ` · prix médian ${eur(ins.median)}` : ""}</span></div>
      ${ins.top.length ? `<div class="card pad stack">
        <h3>Ce qui revient le plus</h3>
        <p class="small muted">« Analyser » regarde les annonces et les ventes sur Vinted pour ce mot. « Vinted » ouvre la recherche.</p>
        <div class="items">${ins.top.slice(0, 12).map((w) => `
          <div class="row between" style="gap:8px">
            <span><b>${esc(w)}</b> <span class="small muted">×${ins.words[w]}</span></span>
            <span class="row" style="gap:6px"><button class="btn small primary" type="button" data-niche="${esc(w)}">Analyser</button><a class="btn small" href="${vintedSearch(w)}" target="_blank" rel="noopener">Vinted</a></span>
          </div>`).join("")}</div>
      </div>` : `<p class="notice info">Pas encore assez d'articles pour dégager des mots : laisse la balade tourner un peu plus.</p>`}
      ${ins.catTop.length ? `<div class="card pad stack"><h3>Catégories</h3>${ins.catTop.map((c) => `
        <div><div class="row between small"><span>${esc(c)}</span><span class="muted">${ins.cats[c]}</span></div>
        <div style="height:6px;border-radius:99px;background:var(--soft);overflow:hidden;margin-top:4px"><div style="height:100%;width:${Math.round((ins.cats[c] / max) * 100)}%;background:var(--violet)"></div></div></div>`).join("")}</div>` : ""}
      <div class="row between wrap" style="gap:8px">
        <div class="seg" role="group" aria-label="Filtrer">
          <button type="button" data-tf="all" aria-pressed="${tourView.filter === "all"}">Tous</button>
          <button type="button" data-tf="opened" aria-pressed="${tourView.filter === "opened"}">Ouverts</button>
          <button type="button" data-ts="recent" aria-pressed="${tourView.sort === "recent"}">Récents</button>
          <button type="button" data-ts="views" aria-pressed="${tourView.sort === "views"}">Plus vus</button>
          <button type="button" data-ts="price" aria-pressed="${tourView.sort === "price"}">Prix</button>
        </div>
        <input class="input" id="tourq" type="search" placeholder="Filtrer" aria-label="Filtrer les articles" value="${esc(tourView.q)}" style="flex:1;min-width:120px">
      </div>
      <div class="items">${list.slice(0, 150).map((x) => `
        <div class="item">
          ${x.img ? `<img src="${safeUrl(x.img)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '<div class="ph"></div>'}
          <div><a class="t" href="${safeUrl(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
            <div class="m">${x.opened ? "Ouvert · " : x.views > 1 ? `Vu ×${x.views} · ` : ""}${esc((x.cats?.length ? x.cats[x.cats.length - 1] : x.from) || "")}${x.rating ? ` · ★ ${esc(x.rating)}` : ""}</div></div>
          <div class="stack" style="align-items:flex-end;gap:4px"><span class="p num">${esc(String(x.price || "—").replace(".", ","))}</span><a class="btn small" href="${vintedSearch(tourWords(x.title).slice(0, 4).join(" ") || x.title)}" target="_blank" rel="noopener">Vinted</a></div>
        </div>`).join("") || `<p class="muted small">Aucun article ne correspond.</p>`}</div>
      <div class="row" style="gap:8px"><button class="btn small" type="button" id="tourcsv">Exporter (CSV)</button><button class="btn small" type="button" id="tourclear">Tout effacer</button></div>
      <p class="small muted">Ce sont les articles que SHEIN t'a montrés, pas forcément les meilleures ventes : vérifie toujours la demande sur Vinted avant de choisir une niche.</p>
    </section>`;
}

let tourTimer = null;
async function viewBalade() {
  const [st, seen, prefs] = await Promise.all([
    api("tour:state").catch(() => null),
    api("tour:seen").catch(() => ({})),
    chrome.storage.local.get("ae_tour_prefs").then((r) => r.ae_tour_prefs || {}).catch(() => ({})),
  ]);
  Object.assign(tourPrefs, { minutes: [3, 10, 20, 45].includes(prefs.minutes) ? prefs.minutes : 10, open: prefs.open, cursor: prefs.cursor, badge: prefs.badge });
  state.tourSeen = seen;
  state.tourState = st;
  return `<div class="row between" style="margin-bottom:10px"><a class="small" href="#/analyse">← Analyse</a></div>${tourControlsHtml(st)}<div id="tourreport">${tourReportHtml(seen)}</div>`;
}

function saveTourPrefs() {
  chrome.storage.local.set({ ae_tour_prefs: { minutes: tourPrefs.minutes, open: tourPrefs.open, cursor: tourPrefs.cursor, badge: tourPrefs.badge } });
}

function bindTourReport() {
  const box = document.getElementById("tourreport");
  if (!box) return;
  const rerender = () => { box.innerHTML = tourReportHtml(state.tourSeen); bindTourReport(); };
  box.querySelectorAll("[data-tf]").forEach((b) => b.addEventListener("click", () => { tourView.filter = b.dataset.tf; rerender(); }));
  box.querySelectorAll("[data-ts]").forEach((b) => b.addEventListener("click", () => { tourView.sort = b.dataset.ts; rerender(); }));
  const q = document.getElementById("tourq");
  q?.addEventListener("input", () => { tourView.q = q.value.trim(); clearTimeout(q._t); q._t = setTimeout(() => { rerender(); const el = document.getElementById("tourq"); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 250); });
  box.querySelectorAll("[data-niche]").forEach((b) => b.addEventListener("click", () => {
    state.nicheQuery = b.dataset.niche;
    state.nicheAuto = true;
    location.hash = "#/concurrents";
  }));
  box.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => { const d = document.createElement("div"); d.className = "ph"; img.replaceWith(d); }));
  document.getElementById("tourcsv")?.addEventListener("click", () => {
    const rows = Object.values(state.tourSeen || {}).map((x) => [x.title, x.price, (x.cats || []).join(" > "), x.from, x.opened ? "oui" : "non", x.views || 0, x.rating || "", x.reviews || "", x.url]);
    const csv = [["titre", "prix", "catégorie", "page", "ouvert", "vu", "note", "avis", "lien"], ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "pistes-niches-shein.csv";
    a.click();
  });
  document.getElementById("tourclear")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirmer l'effacement"; return; }
    await api("tour:clear").catch(() => {});
    state.tourSeen = {};
    rerender();
  });
}

function bindBalade() {
  clearInterval(tourTimer);
  document.querySelectorAll("[data-tour]").forEach((group) => {
    const key = group.dataset.tour;
    group.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      tourPrefs[key] = key === "minutes" ? Number(b.dataset.v) : b.dataset.v;
      group.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      saveTourPrefs();
    }));
  });
  [["touropen", "open"], ["tourcursor", "cursor"], ["tourbadge", "badge"]].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener("change", (e) => { tourPrefs[key] = e.target.checked; saveTourPrefs(); });
  });
  document.getElementById("tourstart")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "Lancement…";
    try {
      await api("tour:start", { opts: {
        minutes: tourPrefs.minutes, pace: tourPrefs.pace,
        open: document.getElementById("touropen").checked,
        cursor: document.getElementById("tourcursor").checked,
        badge: document.getElementById("tourbadge").checked,
      } });
      toast("Balade lancée");
      render();
    } catch (x) {
      document.getElementById("tourerr").innerHTML = `<div class="notice err">${esc(x.message)}</div>`;
      btn.disabled = false; btn.textContent = "Lancer la balade";
    }
  });
  document.getElementById("tourstop")?.addEventListener("click", async () => { await api("tour:stop").catch(() => {}); render(); });
  bindTourReport();
  // Pendant la balade : état et pistes rafraîchis toutes les 5 s.
  if (state.tourState?.running) {
    tourTimer = setInterval(async () => {
      if (route().name !== "balade") { clearInterval(tourTimer); return; }
      if (document.activeElement?.id === "tourq") return;
      const st = await api("tour:state").catch(() => null);
      if (!st?.running) { clearInterval(tourTimer); render(); return; }
      state.tourSeen = await api("tour:seen").catch(() => state.tourSeen);
      const scroll = $view.scrollTop;
      render().then(() => { $view.scrollTop = scroll; });
    }, 5000);
  }
}

// Petit encart sur l'onglet Analyse quand une page SHEIN est ouverte.
async function fillTourCard() {
  const box = document.getElementById("tourcard");
  if (!box) return;
  const st = await api("tour:state").catch(() => null);
  if (!st?.shein) { box.remove(); return; }
  box.innerHTML = `<a class="card pad row between" href="#/balade" style="text-decoration:none;color:inherit;gap:10px">
    <span><b>${st.running ? "Balade SHEIN en cours" : "Balade SHEIN"}</b><br><span class="small muted">${st.running ? "Voir l'avancement et les pistes" : "Trouve des niches sans rien faire : AliEdge parcourt le catalogue pour toi."}</span></span>
    <span class="btn small primary">${st.running ? "Voir" : "Lancer"}</span></a>`;
}

// ───────────────────────── Rendu

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  let { name, params } = route();
  // Compte obligatoire : sans compte connecté, AliEdge s'ouvre sur la création de compte (gratuite).
  if (!state.authReady && name !== "compte") { $view.innerHTML = `<div class="view"><div class="skel" style="height:120px"></div></div>`; return; }
  if (!state.me && name !== "compte") { location.hash = "#/compte?mode=signup&gate=1"; return; }
  // Premier lancement, compte connecté : prise en main avant tout le reste.
  if (state.me && !onboarded && name !== "bienvenue" && name !== "compte") { location.hash = "#/bienvenue"; return; }
  document.querySelectorAll(".tabs a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#/${name === "balade" ? "analyse" : name}`));
  document.querySelectorAll(".tabs a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  document.getElementById("account")?.classList.toggle("on", name === "compte" || name === "bienvenue");
  let html;
  if (name === "analyse") html = viewAnalyse();
  else if (name === "catalogue") html = viewCatalogue();
  else if (name === "suivis") html = await viewSuivis();
  else if (name === "concurrents") html = await viewConcurrents();
  else if (name === "radar") html = await viewRadar();
  else if (name === "bienvenue") html = viewBienvenue(params);
  else if (name === "image") html = viewImage();
  else if (name === "balade") html = await viewBalade();
  else html = Object.keys(CHANNELS).filter((ch) => params.get(ch) && state.me && !state.chPerm?.[ch]).map((ch) => `<div class="notice info row between wrap" style="margin-bottom:12px"><span><b>Active ${CHANNELS[ch].label} pour publier ton annonce.</b> Un clic, puis reviens sur ton annonce Vinted et clique à nouveau sur « Publier sur ${CHANNELS[ch].label} ».</span><button class="btn primary small" type="button" data-chenable="${ch}">Activer ${CHANNELS[ch].label}</button></div>`).join("") + viewCompte(params) + langPickerHtml();
  if (seq !== renderSeq) return;
  const [upd, notice] = await Promise.all([api("update:state").catch(() => null), api("remote:message").catch(() => null)]);
  if (seq !== renderSeq) return;
  const banner = (notice ? `<div class="update-banner" role="status"><span>${esc(notice)}</span></div>` : "") + (upd?.ready
    ? `<div class="update-banner ready"><span><b>Nouvelle version ${esc(upd.ready.version)} prête.</b> Installe-la en un clic, AliEdge redémarre en quelques secondes.</span><button class="btn primary small" type="button" data-update="apply">Mettre à jour</button></div>`
    : upd?.whatsnew
      ? `<div class="update-banner" role="status"><span class="notes" title="Afficher tout"><b>AliEdge ${esc(upd.whatsnew.version)} est installé.</b> ${esc(upd.whatsnew.notes || "Découvre les nouveautés dans les onglets.")}</span><button class="close" type="button" data-update="seen" aria-label="Fermer les nouveautés">✕</button></div>`
      : "");
  const keepFocus = document.activeElement?.id;
  const lbcAsk = state.lbcAsk && name !== "bienvenue" ? `<div class="update-banner lbc-ask" role="status"><span><b>Active Leboncoin en un clic.</b> Ventes Leboncoin dans tes analyses, fournisseur et warehouse depuis les annonces, aide au dépôt. AliEdge lit seulement les pages que tu ouvres.</span><span class="row" style="gap:6px"><button class="btn primary small" type="button" data-lbcask="on">Activer Leboncoin</button><button class="btn ghost small" type="button" data-lbcask="later">Plus tard</button></span></div>` : "";
  $view.innerHTML = `${banner}${lbcAsk}<div class="view">${html}</div>`;
  $view.querySelector('[data-lbcask="on"]')?.addEventListener("click", async () => { if (await enableLbc()) { state.lbcAsk = false; render(); } });
  $view.querySelector('[data-lbcask="later"]')?.addEventListener("click", async () => { state.lbcAsk = false; await chrome.storage.local.set({ ae_lbc_ask_later: Date.now() }); render(); });
  $view.querySelector('[data-update="apply"]')?.addEventListener("click", (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Installation…"; api("update:apply").catch(() => {}); });
  $view.querySelector(".update-banner .notes")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("open"));
  $view.querySelector('[data-update="seen"]')?.addEventListener("click", async (e) => { const box = e.currentTarget.closest(".update-banner"); await api("update:seen").catch(() => {}); box?.remove(); });
  if (keepFocus && ["csearch", "query"].includes(keepFocus)) {
    const el = document.getElementById(keepFocus);
    if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
  }
  if (name === "analyse") { bindAnalyse(); renderSteps(); fillTourCard(); fillLbcBox(); }
  else if (name === "catalogue") bindCatalogue();
  else if (name === "suivis") bindSuivis();
  else if (name === "concurrents") bindTrackers();
  else if (name === "radar") bindRadar();
  else if (name === "bienvenue") bindBienvenue(params);
  else if (name === "image") bindImage();
  else if (name === "balade") bindBalade();
  else bindCompte(params);
}

// Les volets repliables gardent leur état d'un rendu à l'autre.
// (seuls les clics du membre comptent : un volet rendu ouvert par défaut ne change rien.)
document.addEventListener("click", (e) => {
  const sum = e.target.closest?.("details.fold > summary");
  const d = sum?.parentElement;
  if (!d?.dataset.fold) return;
  setTimeout(() => {
    if (d.dataset.fold === "search") state.foldSearch = d.open;
    else state.smart.open[d.dataset.fold] = d.open;
  }, 0);
});

let lastRoute = null;
window.addEventListener("hashchange", () => {
  const { name } = route();
  closeDrawer();
  if (name === "catalogue" && lastRoute !== "catalogue" && !state.catalog.rows.length) loadCatalog();
  else render();
  lastRoute = name;
  $view.focus({ preventScroll: true });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "tab:changed" && !isTab) { if (route().name === "balade") render(); else loadProduct(); }
  if (msg?.type === "pending") takePending();
  if (msg?.type === "radar:new" && route().name === "radar") refreshRadarFeed();
  if (msg?.type === "sales:new" && route().name === "concurrents" && !document.activeElement?.matches?.("input")) render();
  if (msg?.type === "import:progress" && route().name === "catalogue") importStatus();
  if (msg?.type === "update:ready") render();
});

async function takePending() {
  const p = await api("pending:take").catch(() => null);
  if (!p) return;
  if (p.route === "concurrents") { location.hash = "#/concurrents"; return; }
  if (p.route === "image" && p.image) {
    state.img.image = p.image;
    if (route().name !== "image") location.hash = "#/image"; else render();
    runImageSearch();
    return;
  }
  location.hash = "#/analyse";
  if (p.query) {
    state.query = p.query;
    state.product = { supported: false };
    state.entry = null;
    render();
    startAnalysis();
  } else if (p.analyze) {
    await loadProduct();
    if (state.product?.supported && !state.product.error && !state.entry) startAnalysis();
  }
}

(async function init() {
  langPref = (await chrome.storage.local.get("ae_lang")).ae_lang || "auto";
  document.documentElement.lang = (await globalThis.AE_I18N?.start([document.body])) || "fr";
  await Promise.all([loadAuth(), loadOnboarded(), loadLbcAsk()]);
  lastRoute = route().name;
  render();
  if (!isTab) await loadProduct();
  if (lastRoute === "catalogue") loadCatalog();
  await takePending();
})();
