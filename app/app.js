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
  return { name: ["analyse", "catalogue", "suivis", "compte"].includes(name) ? name : "analyse", params: new URLSearchParams(qs || "") };
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
      <button class="btn" type="button" data-act="copy">${ICON.copy}Annonce</button>
      <a class="btn" href="${esc(barapicsLink(entry.product))}" target="_blank" rel="noopener" title="Créer des photos portées réalistes avec Barapics">${ICON.camera}Photos</a>
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
            <div class="m">${[i.brand, i.size, i.condition].filter(Boolean).map(esc).join(" · ")}${i.favourites != null ? ` · ♥ ${i.favourites}` : ""}</div>
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
  document.querySelector('[data-act="copy"]')?.addEventListener("click", async () => {
    const l = draftListing(state.entry.product || { title: state.entry.query }, state.entry.result.sell);
    try { await navigator.clipboard.writeText(`${l.title}\n\n${l.description}`); toast("Annonce copiée"); } catch { toast("Copie impossible : sélectionne le texte ci-dessous"); }
  });
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
      ${!state.me.pro ? `<div class="notice info row between wrap"><span>Version gratuite : les 3 premiers produits sont visibles.</span><a class="btn primary" href="${BUY_URL}" target="_blank" rel="noopener">Tout débloquer</a></div>` : ""}
    </div>`;
  let body;
  if (c.loading && !c.rows.length) {
    body = `<div class="cat-grid">${Array.from({ length: 6 }, () => `<div class="card"><div class="skel" style="aspect-ratio:1;border-radius:14px 14px 0 0"></div><div class="pad stack"><div class="skel" style="height:12px"></div><div class="skel" style="height:12px;width:60%"></div></div></div>`).join("")}</div>`;
  } else if (c.error) {
    body = `<div class="notice err">${esc(c.error)}</div>`;
  } else if (!c.rows.length) {
    body = `<div class="card empty">${ICON.tag}<h2>Le catalogue se remplit</h2><p class="muted">Chaque analyse des membres y ajoute un produit et ses annonces Vinted. Lance une analyse pour l'enrichir.</p></div>`;
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

let searchTimer = null;
function bindCatalogue() {
  const c = state.catalog;
  document.getElementById("csearch")?.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { c.filters.search = e.target.value.trim(); loadCatalog(); }, 350);
  });
  document.getElementById("cplatform")?.addEventListener("change", (e) => { c.filters.platform = e.target.value; loadCatalog(); });
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => { c.filters.sort = b.dataset.sort; loadCatalog(); }));
  document.getElementById("more")?.addEventListener("click", () => loadCatalog(true));
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

function viewTrackers(trackers) {
  const now = Date.now();
  const rows = (trackers || []).map((t) => {
    const left = Math.ceil((new Date(t.expires_at).getTime() - now) / 864e5);
    const live = left > 0;
    return `
      <div class="tracker ${live ? "" : "ended"}">
        <button class="tracker-head" type="button" data-tracker="${esc(t.id)}" aria-expanded="false">
          <span class="tracker-dot" aria-hidden="true"></span>
          <span class="tracker-name"><b>${esc(t.label || `Vendeur ${t.seller_id}`)}</b><span class="small muted">${live ? `${left} j restant${left > 1 ? "s" : ""}` : "Terminé"} · ${esc((t.market || "fr").toUpperCase())}${t.last_checked_at ? ` · vérifié ${esc(ago(new Date(t.last_checked_at).getTime()))}` : " · premier relevé en cours"}</span></span>
          <span class="tracker-kpi num"><b>${t.sold_count}</b><span class="small muted">vente${t.sold_count > 1 ? "s" : ""}</span></span>
          <span class="tracker-kpi num"><b>${eur(Number(t.sold_amount))}</b><span class="small muted">${t.active_count} en ligne</span></span>
        </button>
        <div class="tracker-body" id="tb-${esc(t.id)}" hidden></div>
      </div>`;
  }).join("");
  return `
    <section class="stack">
      <div class="row between"><h2>Vendeurs suivis (14 jours)</h2></div>
      <p class="small muted">Colle le lien d'un profil Vinted, ou clique sur « Suivre ses ventes 14 jours » sur sa page : AliEdge relève son dressing régulièrement et liste tout ce qu'il vend.</p>
      <form id="trackform" class="row" style="gap:8px">
        <input class="input" id="trackurl" type="url" inputmode="url" placeholder="https://www.vinted.fr/member/123456-pseudo" aria-label="Lien du profil Vinted" style="flex:1">
        <button class="btn primary" type="submit">Suivre</button>
      </form>
      <div id="trackerr" role="alert"></div>
      <div class="trackers">${rows || `<p class="muted small">Aucun vendeur suivi pour l'instant.</p>`}</div>
    </section>`;
}

async function viewSuivis() {
  const [watch, hist, trackers] = await Promise.all([api("watch:list").catch(() => []), api("history:list").catch(() => []), state.me ? api("tracker:list").catch(() => []) : Promise.resolve([])]);
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
    ${state.me ? viewTrackers(trackers) : ""}
    <section class="stack" style="margin-top:22px"><h2>Produits suivis</h2><div class="items">${w}</div></section>
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
    try { await api("tracker:add", { sellerId, market, label }); toast("Vendeur suivi pendant 14 jours"); render(); }
    catch (x) { err.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  });
  document.querySelectorAll("[data-tracker]").forEach((b) => b.addEventListener("click", async () => {
    const body = document.getElementById(`tb-${b.dataset.tracker}`);
    const open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
    if (open || body.dataset.loaded) return;
    body.innerHTML = `<p class="small muted">Chargement…</p>`;
    try {
      const items = await api("tracker:items", { id: b.dataset.tracker });
      const sold = items.filter((i) => i.status === "sold");
      const active = items.filter((i) => i.status === "active");
      const line = (i) => `
        <a class="item" href="${safeUrl(i.url)}" target="_blank" rel="noopener" style="grid-template-columns:44px 1fr auto">
          ${i.photo_url ? `<img src="${safeUrl(i.photo_url)}" alt="" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
          <div><div class="t">${esc(i.title || "Annonce")}</div><div class="m">${i.status === "sold" ? `<span class="badge-sold">Vendu</span> ${esc(ago(new Date(i.sold_at).getTime()))}` : `en ligne depuis ${esc(ago(new Date(i.first_seen_at).getTime()))}`}</div></div>
          <div class="p num">${eur(Number(i.price))}</div>
        </a>`;
      body.innerHTML = `
        <div class="stack" style="gap:6px;margin-top:8px">
          <h3 class="small">Ventes constatées (${sold.length})</h3>
          ${sold.length ? `<div class="items">${sold.map(line).join("")}</div>` : `<p class="small muted">Aucune vente constatée pour l'instant. Les ventes apparaissent au fil des relevés.</p>`}
          <h3 class="small" style="margin-top:8px">En ligne (${active.length})</h3>
          ${active.length ? `<div class="items">${active.slice(0, 60).map(line).join("")}</div>` : ""}
          <button class="btn ghost small" type="button" data-untrack="${esc(b.dataset.tracker)}">Arrêter le suivi</button>
        </div>`;
      body.dataset.loaded = "1";
      body.querySelector("[data-untrack]")?.addEventListener("click", async (ev) => { await api("tracker:remove", { id: ev.currentTarget.dataset.untrack }); toast("Suivi arrêté"); render(); });
    } catch (x) { body.innerHTML = `<div class="notice err">${esc(x.message)}</div>`; }
  }));
}

function bindSuivis(hist) {
  bindTrackers();
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

// ───────────────────────── Rendu

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const { name, params } = route();
  document.querySelectorAll(".tabs a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === `#/${name}`));
  document.querySelectorAll(".tabs a[aria-current]").forEach((a) => a.setAttribute("aria-current", "page"));
  let html;
  if (name === "analyse") html = viewAnalyse();
  else if (name === "catalogue") html = viewCatalogue();
  else if (name === "suivis") html = await viewSuivis();
  else html = viewCompte(params);
  if (seq !== renderSeq) return;
  const keepFocus = document.activeElement?.id;
  $view.innerHTML = `<div class="view">${html}</div>`;
  if (keepFocus && ["csearch", "query"].includes(keepFocus)) {
    const el = document.getElementById(keepFocus);
    if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
  }
  if (name === "analyse") { bindAnalyse(); renderSteps(); }
  else if (name === "catalogue") bindCatalogue();
  else if (name === "suivis") bindSuivis();
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
});

async function takePending() {
  const p = await api("pending:take").catch(() => null);
  if (!p) return;
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
  await loadAuth();
  lastRoute = route().name;
  render();
  if (!isTab) await loadProduct();
  if (lastRoute === "catalogue") loadCatalog();
  await takePending();
})();
