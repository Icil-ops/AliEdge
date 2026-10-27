// AliEdge — panneau latéral et plein écran.
import { MARKETS, BUY_URL, BARAPICS_URL, SKOOL_URL, PRIVACY_URL } from "../src/config.js";
import { VERDICT_LABEL, histogram } from "../src/lib/pricing.js";
import { draftListing } from "../src/lib/text.js";

const $view = document.getElementById("view");
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
  return { name: ["analyse", "catalogue", "radar", "concurrents", "suivis", "compte", "bienvenue"].includes(name) ? name : "analyse", params: new URLSearchParams(qs || "") };
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
}

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
        <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
        <h3>Ou cherche directement</h3>
        <label class="field"><span>Prix d'achat (facultatif)</span><div class="input-euro"><input id="price" class="input num" inputmode="decimal" value="${state.priceOverride != null ? money(state.priceOverride) : ""}" placeholder="0,00"></div></label>
        ${searchControls()}
      </section>`);
  }

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
  return parts.join("");
}

function searchControls() {
  const s = state.settings || {};
  const markets = Object.entries(MARKETS).map(([k, m]) => `<option value="${k}" ${s.market === k ? "selected" : ""}>${m.label}</option>`).join("");
  return `
    <label class="field"><span>Recherche Vinted</span><input id="query" class="input" value="${esc(state.query)}" placeholder="ex. robe satin longue"></label>
    <div class="grid2">
      <label class="field"><span>Pays</span><select id="market" class="input">${markets}</select></label>
      <label class="field"><span>État</span><select id="condition" class="input">
        <option value="all" ${s.condition === "all" ? "selected" : ""}>Tous</option>
        <option value="new" ${s.condition === "new" ? "selected" : ""}>Neuf avec étiquette</option>
        <option value="very_good" ${s.condition === "very_good" ? "selected" : ""}>Neuf ou très bon état</option>
      </select></label>
    </div>
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

function bindAnalyse() {
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
      <details class="card pad trends" id="trends">
        <summary><b>Tendances du marché Vinted</b><span class="small muted">30 derniers jours</span></summary>
        <div id="trendsbody" style="margin-top:10px"><div class="skel" style="height:60px"></div></div>
      </details>
      <details class="card pad import-vinted">
        <summary><b>Ajouter des annonces Vinted par leur lien</b><span class="small muted">données réelles</span></summary>
        <form id="vintedimport" class="stack" style="margin-top:8px">
          <textarea class="input" id="vintedlinks" rows="3" placeholder="https://www.vinted.fr/items/…  (un lien par ligne, 20 au plus)" aria-label="Liens d'annonces Vinted"></textarea>
          <button class="btn" type="submit">Ajouter au catalogue</button>
          <p class="small muted">AliEdge relève le titre, le prix, la photo et le statut (en ligne ou vendue) de chaque annonce. Elles alimentent les tendances et les prix constatés.</p>
        </form>
      </details>
      <div class="import-row">
        <button id="import-page" class="btn" type="button">${ICON.tag}Ajouter les produits de la page ouverte</button>
        <span class="small muted">Sur une recherche ou une catégorie AliExpress, Temu ou Shein : AliEdge ajoute les produits affichés et vérifie leurs ventes Vinted.</span>
      </div>
      ${!state.me.pro ? `<div class="notice info row between wrap"><span>Version gratuite : les 3 premiers produits sont visibles.</span><a class="btn primary" href="${BUY_URL}" target="_blank" rel="noopener">Tout débloquer</a></div>` : ""}
    </div>`;
  let body;
  if (c.loading && !c.rows.length) {
    body = `<div class="cat-grid">${Array.from({ length: 6 }, () => `<div class="card"><div class="skel" style="aspect-ratio:1;border-radius:14px 14px 0 0"></div><div class="pad stack"><div class="skel" style="height:12px"></div><div class="skel" style="height:12px;width:60%"></div></div></div>`).join("")}</div>`;
  } else if (c.error) {
    body = `<div class="notice err">${esc(c.error)}</div>`;
  } else if (!c.rows.length) {
    body = `<div class="card empty">${ICON.tag}<h2>Le catalogue se remplit</h2><p class="muted">Chaque fiche produit consultée par les membres y entre, puis AliEdge vérifie ses ventes sur Vinted. Pour l'accélérer, ouvre une page de résultats AliExpress, Temu ou Shein et clique sur « Ajouter les produits de la page ouverte ».</p></div>`;
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
  return head + `<div style="margin-top:12px">${body}</div>`;
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

let searchTimer = null;
function bindCatalogue() {
  loadPicks();
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
  document.getElementById("import-page")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Lecture de la page…";
    try {
      const r = await api("catalog:importPage");
      toast(`${r.added} produit${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""} au catalogue. Leurs ventes Vinted arrivent au fil des vérifications.`);
      loadCatalog();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.innerHTML = `${ICON.tag}Ajouter les produits de la page ouverte`;
    }
  });
  document.querySelectorAll("[data-pid]").forEach((b) => b.addEventListener("click", () => openProduct(c.rows.find((r) => r.product_id === b.dataset.pid))));
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
    go.textContent = "Création en cours (1 à 2 min par photo)…";
    const queue = [...scenes];
    let stop = false;
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        const fig = grid.querySelector(`[data-shot="${id}"]`);
        const label = PHOTO_SCENES.find((x) => x[0] === id)?.[1] || id;
        if (stop) { fig.querySelector("figcaption").textContent = `${label} · non créée`; continue; }
        fig.querySelector("figcaption").textContent = `${label} · création…`;
        try {
          const r = await api("barapics", { body: { action: "photo", productUrl: product.url || "", title: product.title || "Article", description: "", images, sceneId: id, quality: "medium", ...(product.priceEur ? { price: `${money(product.priceEur)} €` } : {}), ...(spec ? { spec } : {}) } });
          fig.innerHTML = `<a href="${safeUrl(r.url)}" target="_blank" rel="noopener"><img src="${safeUrl(r.url)}" alt="Photo ${esc(label)}"></a><figcaption>${esc(label)} · contrôlée${r.attempts > 1 ? `, corrigée ${r.attempts - 1}×` : ""}</figcaption>`;
          fig.classList.add("done");
        } catch (e) {
          fig.innerHTML = `<div class="ph"></div><figcaption class="neg">${esc(label)} · ${esc(e.message)}</figcaption>`;
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
  d.setAttribute("aria-label", "Annonce Vinted");
  d.innerHTML = `<div class="stack"><div class="row between"><h3>${ICON.copy} Annonce Vinted</h3><button class="btn ghost" type="button" data-close aria-label="Fermer">✕</button></div><div id="lbody"><div class="skel" style="height:90px"></div><p class="small muted">Rédaction à partir des photos et des prix Vinted constatés…</p></div></div>`;
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
    const tags = (l.hashtags || []).map((h) => `#${h}`).join(" ");
    d.querySelector("#lbody").innerHTML = `
      <div class="ticket"><div><div class="k">Prix conseillé</div><div class="big num pos">${eur(l.price)}</div>
      ${l.margin != null ? `<div class="sub">Marge ${eur(l.margin, true)} sur un achat à ${eur(l.supplierPrice)}</div>` : ""}
      ${l.priceReason ? `<div class="sub" style="margin-top:4px">${esc(l.priceReason)}</div>` : ""}</div></div>
      ${field("Titre", l.title)}
      ${field("Description", `${l.description}${tags ? `\n\n${tags}` : ""}`, true)}
      <div class="grid2">${field("Catégorie", l.category)}${field("Marque", l.brand)}${field("État", l.condition)}${field("Taille", l.size)}${field("Couleur", (l.colors || []).join(", "))}${field("Colis", l.parcel)}</div>`;
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

// ───────────────────────── Concurrents (suivis en continu)

function viewTrackers(trackers) {
  const rows = (trackers || []).filter((t) => new Date(t.expires_at).getTime() > Date.now()).map((t) => `
      <div class="tracker">
        <button class="tracker-head" type="button" data-tracker="${esc(t.id)}" aria-expanded="false">
          <span class="tracker-dot" aria-hidden="true"></span>
          <span class="tracker-name"><b>${esc(t.label || `Vendeur ${t.seller_id}`)}</b><span class="small muted">${esc((t.market || "fr").toUpperCase())} · suivi depuis ${esc(ago(new Date(t.created_at).getTime()))}${t.last_checked_at ? ` · vérifié ${esc(ago(new Date(t.last_checked_at).getTime()))}` : " · premier relevé en cours"}</span></span>
          <span class="tracker-kpi num"><b>${t.sold_7d ?? 0}</b><span class="small muted">ventes 7 j</span></span>
          <span class="tracker-kpi num"><b>${eur(Number(t.amount_30d ?? t.sold_amount))}</b><span class="small muted">${t.sold_30d ?? t.sold_count} ventes 30 j</span></span>
        </button>
        <div class="tracker-body" id="tb-${esc(t.id)}" hidden></div>
      </div>`).join("");
  return `
    <section class="stack">
      <div class="row between"><h2>Concurrents</h2><span class="small muted">${rows ? (trackers || []).filter((t) => new Date(t.expires_at).getTime() > Date.now()).length : 0} / 30</span></div>
      <p class="small muted">Colle le lien du profil Vinted d'un concurrent, ou clique sur « + Concurrent » à côté de son pseudo sur Vinted. AliEdge enregistre toutes ses annonces, repère chaque vente et mesure en combien de temps elle est partie.</p>
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
  const trackers = await api("tracker:list").catch(() => []);
  return viewTrackers(trackers);
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
      ${seen.length ? `<div class="items">${seen.map(line).join("")}</div>` : `<p class="small muted">Les ventes apparaissent au fil des relevés (plusieurs fois par jour).</p>`}
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
    <section class="stack"><h2>Produits suivis</h2><div class="items">${w}</div></section>
    <section class="stack" style="margin-top:22px"><div class="row between"><h2>Historique</h2>${hist.length ? '<button class="btn ghost small" type="button" id="clearhist">Effacer</button>' : ""}</div><div class="items">${h}</div></section>`;
}

function bindTrackers() {
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
      body.querySelector("[data-untrack]")?.addEventListener("click", async (ev) => { await api("tracker:remove", { id: ev.currentTarget.dataset.untrack }); toast("Concurrent retiré"); render(); });
    } catch (x) { body.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  }));
}

function bindSuivis(hist) {
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
      <label class="switch"><span><b>Bouton sur les fiches produit</b><br><span class="small muted">Affiche « Analyser sur Vinted » sur AliExpress, Temu et Shein.</span></span><input type="checkbox" data-set="showPill" ${s.showPill ? "checked" : ""}></label>
    </section>
    <div class="row between" style="margin-top:12px">
      <span class="small muted">AliEdge ${esc(chrome.runtime.getManifest().version)} · by Ivan Bara · <a href="${PRIVACY_URL}" target="_blank" rel="noopener">Confidentialité</a></span>
      <button id="signout" class="btn ghost" type="button">Se déconnecter</button>
    </div>`;
}

function bindCompte(params) {
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
  document.querySelectorAll("[data-set]").forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.set;
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

// ───────────────────────── Rendu

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  let { name, params } = route();
  // Premier lancement, compte connecté : prise en main avant tout le reste.
  if (state.me && !onboarded && name !== "bienvenue" && name !== "compte") { location.hash = "#/bienvenue"; return; }
  document.querySelectorAll(".tabs a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#/${name}`));
  document.querySelectorAll(".tabs a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  let html;
  if (name === "analyse") html = viewAnalyse();
  else if (name === "catalogue") html = viewCatalogue();
  else if (name === "suivis") html = await viewSuivis();
  else if (name === "concurrents") html = await viewConcurrents();
  else if (name === "radar") html = await viewRadar();
  else if (name === "bienvenue") html = viewBienvenue(params);
  else html = viewCompte(params);
  if (seq !== renderSeq) return;
  const [upd, notice] = await Promise.all([api("update:state").catch(() => null), api("remote:message").catch(() => null)]);
  if (seq !== renderSeq) return;
  const banner = (notice ? `<div class="update-banner" role="status"><span>${esc(notice)}</span></div>` : "") + (upd?.ready
    ? `<div class="update-banner ready"><span><b>Nouvelle version ${esc(upd.ready.version)} prête.</b> Installe-la en un clic, AliEdge redémarre en quelques secondes.</span><button class="btn primary small" type="button" data-update="apply">Mettre à jour</button></div>`
    : upd?.whatsnew
      ? `<div class="update-banner" role="status"><span class="notes" title="Afficher tout"><b>AliEdge ${esc(upd.whatsnew.version)} est installé.</b> ${esc(upd.whatsnew.notes || "Découvre les nouveautés dans les onglets.")}</span><button class="close" type="button" data-update="seen" aria-label="Fermer les nouveautés">✕</button></div>`
      : "");
  const keepFocus = document.activeElement?.id;
  $view.innerHTML = `${banner}<div class="view">${html}</div>`;
  $view.querySelector('[data-update="apply"]')?.addEventListener("click", (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Installation…"; api("update:apply").catch(() => {}); });
  $view.querySelector(".update-banner .notes")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("open"));
  $view.querySelector('[data-update="seen"]')?.addEventListener("click", async (e) => { const box = e.currentTarget.closest(".update-banner"); await api("update:seen").catch(() => {}); box?.remove(); });
  if (keepFocus && ["csearch", "query"].includes(keepFocus)) {
    const el = document.getElementById(keepFocus);
    if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
  }
  if (name === "analyse") { bindAnalyse(); renderSteps(); }
  else if (name === "catalogue") bindCatalogue();
  else if (name === "suivis") bindSuivis();
  else if (name === "concurrents") bindTrackers();
  else if (name === "radar") bindRadar();
  else if (name === "bienvenue") bindBienvenue(params);
  else bindCompte(params);
}

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
  if (msg?.type === "tab:changed" && !isTab) loadProduct();
  if (msg?.type === "pending") takePending();
  if (msg?.type === "radar:new" && route().name === "radar") refreshRadarFeed();
  if (msg?.type === "update:ready") render();
});

async function takePending() {
  const p = await api("pending:take").catch(() => null);
  if (!p) return;
  if (p.route === "concurrents") { location.hash = "#/concurrents"; return; }
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
  await Promise.all([loadAuth(), loadOnboarded()]);
  lastRoute = route().name;
  render();
  if (!isTab) await loadProduct();
  if (lastRoute === "catalogue") loadCatalog();
  await takePending();
})();
