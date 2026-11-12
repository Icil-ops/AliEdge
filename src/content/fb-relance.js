// Relances Facebook Marketplace / Messenger — semi-automatique : AliEdge repère les conversations où la dernière
// réponse vient du membre (« Vous : … ») depuis assez longtemps, ouvre chacune et y écrit la relance. C'est TOUJOURS
// le membre qui appuie sur Entrée pour l'envoyer : aucun message n'est envoyé par l'extension.
// Rien n'est envoyé à AliEdge : la liste est lue sur l'écran du membre et l'historique des relances reste dans ce
// navigateur (chrome.storage.local). Limites : 2 relances au plus par conversation, 3 jours d'écart, 25 par séance.
(async () => {
  try { if ((await chrome.storage.local.get("ae_disabled")).ae_disabled) return; } catch { return; }
  if (window.__aliedgeFbRelance) return;
  window.__aliedgeFbRelance = true;

  const KEY = "ae_fb_relances";       // { idConversation: [horodatages des relances] }
  const TPL_KEY = "ae_fb_relance_tpl";
  const MIN_AGE_H = 24, GAP_DAYS = 3, MAX_PER_THREAD = 2, MAX_SESSION = 25;
  const DEFAULT_TPL = "Bonjour {prenom}, je reviens vers vous : l'article est toujours disponible si vous êtes intéressé(e). Bonne journée !";
  const onPage = () => /^\/(messages|marketplace\/inbox|marketplace\/t)\b/.test(location.pathname);
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get: async (k, d) => { try { return (await chrome.storage.local.get(k))[k] ?? d; } catch { return d; } },
    set: async (k, v) => { try { await chrome.storage.local.set({ [k]: v }); } catch { /* ignoré */ } },
  };

  // Âge du dernier message affiché dans la liste (« 5 min », « 3 h », « 2 j », « 1 sem », « 12 nov. »…), en heures.
  function ageHours(text) {
    const m = /(?:^|[\s·])(\d{1,3})\s?(min|m|h|j|d|sem|w|an|y)\b/i.exec(text);
    if (m) {
      const n = Number(m[1]), u = m[2].toLowerCase();
      return n * ({ min: 1 / 60, m: 1 / 60, h: 1, j: 24, d: 24, sem: 168, w: 168, an: 8760, y: 8760 }[u] ?? 0);
    }
    // Date (« 12 nov. », « 3 oct. 2025 », « lun. ») : forcément plus d'un jour.
    if (/\b\d{1,2}\s?(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\b/i.test(text)
      || /\b(lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun)\.?\b/i.test(text.slice(-12))) return 48;
    return null;
  }

  // Conversations visibles dans la liste de gauche. Dernier message du membre = aperçu qui commence par « Vous : ».
  function readThreads() {
    const seen = new Map();
    for (const a of document.querySelectorAll('a[href*="/messages/t/"], a[href*="/marketplace/t/"], a[href*="/messages/e2ee/t/"]')) {
      const id = (a.getAttribute("href") || "").match(/\/t\/([^/?#]+)/)?.[1];
      if (!id || seen.has(id)) continue;
      // Pas la conversation ouverte dans le volet de droite (lien d'en-tête) : seulement les lignes de la liste.
      if (!a.closest('[role="navigation"], [role="grid"], [role="list"], [aria-label*="iscussion"], [aria-label*="hats"], [aria-label*="onversation"]')) continue;
      const lines = [...a.querySelectorAll('span[dir="auto"], span')].map((s) => clean(s.textContent)).filter(Boolean);
      const text = clean(a.textContent);
      const name = lines.find((l) => l.length >= 2 && !/^(vous|you)\s*:/i.test(l) && !/^\d/.test(l)) || "";
      const preview = lines.find((l) => /^(vous|you)\s*:/i.test(l)) || "";
      seen.set(id, { id, a, name: name.slice(0, 80), mine: !!preview, preview: preview.slice(0, 120), age: ageHours(text) });
    }
    return [...seen.values()];
  }

  async function candidates() {
    const hist = await store.get(KEY, {});
    const now = Date.now();
    return readThreads().filter((t) => {
      if (!t.mine) return false;                                   // l'autre personne a répondu en dernier
      if (t.age != null && t.age < MIN_AGE_H) return false;        // trop récent
      const h = hist[t.id] || [];
      if (h.length >= MAX_PER_THREAD) return false;                // déjà relancé deux fois
      if (h.length && now - h[h.length - 1] < GAP_DAYS * 86400e3) return false;
      return true;
    });
  }

  // ───────── Interface : bouton en bas à droite + panneau
  const host = document.createElement("div");
  host.id = "aliedge-fb-relance";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{font:500 14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1530}
    .fab{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;background:#1b1530;color:#fff;font-weight:600;box-shadow:0 10px 30px -8px rgba(27,21,48,.55)}
    .fab:focus-visible,button:focus-visible{outline:2px solid #6d3bff;outline-offset:2px}
    .mark{min-width:28px;height:28px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:#6d3bff;display:grid;place-items:center;font-variant-numeric:tabular-nums}
    .panel{position:absolute;right:0;bottom:58px;width:340px;max-height:70vh;overflow:auto;background:#fff;border-radius:16px;padding:14px;box-shadow:0 18px 50px -12px rgba(27,21,48,.45);border:1px solid #ecebf1}
    .panel[hidden]{display:none}
    h3{margin:0 0 4px;font-size:15px}
    p{margin:0 0 10px;font-size:12.5px;color:#74708a}
    textarea{width:100%;box-sizing:border-box;min-height:74px;padding:9px 10px;border:1px solid #ecebf1;border-radius:10px;font:inherit;font-size:13px;resize:vertical}
    ul{list-style:none;margin:10px 0;padding:0;display:grid;gap:4px}
    li{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:10px;background:#f7f6fb;font-size:13px}
    li.on{background:#efe9ff;outline:1.5px solid #6d3bff}
    li.done{opacity:.5}
    li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    li small{color:#74708a;white-space:nowrap}
    .row{display:flex;gap:8px}
    button.b{all:unset;cursor:pointer;flex:1;padding:9px 12px;border-radius:10px;background:#f4f3f8;font-weight:650;font-size:13px;text-align:center}
    button.p{background:#6d3bff;color:#fff}
    button[disabled]{opacity:.45;cursor:default}
    .tip{margin:10px 0 0;padding:9px 10px;border-radius:10px;background:#fff7e6;color:#7a4b00;font-size:12.5px}
    .tip[hidden]{display:none}
  </style>
  <div class="panel" hidden role="dialog" aria-label="Relancer les conversations sans réponse"></div>
  <button class="fab" type="button" aria-expanded="false"><span class="mark">0</span><span class="lbl">Relancer</span></button>`;
  const fab = root.querySelector(".fab"), panel = root.querySelector(".panel"), mark = root.querySelector(".mark");
  let list = [], idx = -1, sentThisSession = 0, watching = null;

  async function refreshCount() {
    if (!onPage()) { host.remove(); return; }
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (idx >= 0) return; // séance en cours : la liste ne bouge pas
    list = await candidates();
    mark.textContent = String(list.length);
    fab.title = list.length ? `${list.length} conversation(s) sans réponse depuis plus de 24 h` : "Aucune conversation à relancer pour le moment";
  }

  async function drawPanel() {
    const tpl = await store.get(TPL_KEY, DEFAULT_TPL);
    if (idx < 0) {
      panel.innerHTML = `<h3>Relancer les conversations sans réponse</h3>
        <p>${list.length ? `${list.length} conversation(s) où l'acheteur ne t'a pas répondu depuis plus de 24 h.` : "Aucune conversation à relancer : fais défiler la liste de gauche pour en charger d'autres."} AliEdge ouvre chacune et écrit la relance, <b>tu l'envoies toi-même avec Entrée</b>.</p>
        <textarea aria-label="Message de relance">${esc(tpl)}</textarea>
        <p style="margin-top:4px">{prenom} est remplacé par le prénom de l'acheteur.</p>
        <ul>${list.slice(0, MAX_SESSION).map((t) => `<li><span>${esc(t.name || "Conversation")}</span><small>${t.age == null ? "" : t.age >= 48 ? `${Math.round(t.age / 24)} j` : `${Math.round(t.age)} h`}</small></li>`).join("")}</ul>
        <div class="row"><button class="b" type="button" data-a="close">Fermer</button><button class="b p" type="button" data-a="start" ${list.length ? "" : "disabled"}>Commencer (${Math.min(list.length, MAX_SESSION)})</button></div>`;
      panel.querySelector("textarea").addEventListener("input", (e) => store.set(TPL_KEY, e.target.value.slice(0, 1000)));
    } else {
      const total = Math.min(list.length, MAX_SESSION), cur = list[idx];
      panel.innerHTML = `<h3>Relance ${idx + 1} sur ${total}</h3>
        <p>${cur ? `Conversation avec <b>${esc(cur.name || "l'acheteur")}</b> : vérifie le message puis appuie sur <b>Entrée</b> pour l'envoyer.` : ""}</p>
        <ul>${list.slice(0, total).map((t, i) => `<li class="${i === idx ? "on" : i < idx ? "done" : ""}"><span>${esc(t.name || "Conversation")}</span><small>${i < idx ? "✓" : ""}</small></li>`).join("")}</ul>
        <div class="row"><button class="b" type="button" data-a="stop">Arrêter</button><button class="b" type="button" data-a="skip">Passer</button></div>
        <div class="tip" hidden></div>`;
    }
    panel.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => act(b.dataset.a)));
  }

  function composer() {
    const boxes = [...document.querySelectorAll('[role="main"] div[role="textbox"][contenteditable="true"], div[role="textbox"][contenteditable="true"][aria-label]')];
    return boxes.find((b) => b.offsetParent !== null) || null;
  }

  function tip(text) { const t = panel.querySelector(".tip"); if (t) { t.textContent = text; t.hidden = !text; } }

  async function openCurrent() {
    const cur = list[idx];
    if (!cur) return finish();
    await drawPanel();
    // Ouvre la conversation (même onglet, navigation de Facebook) puis attend la zone de saisie.
    const link = document.querySelector(`a[href*="/t/${CSS.escape(cur.id)}"]`) || cur.a;
    if (!link?.isConnected) { tip("Conversation introuvable dans la liste : passe à la suivante."); return; }
    link.click();
    let box = null;
    for (let i = 0; i < 40 && !box; i++) { await sleep(250); if (location.pathname.includes(cur.id)) box = composer(); }
    if (!box) { tip("La zone de message n'apparaît pas : clique dans la conversation, ou passe à la suivante."); return; }
    const first = clean(cur.name).split(" ")[0] || "";
    const tpl = await store.get(TPL_KEY, DEFAULT_TPL);
    const text = tpl.replace(/(\s?)\{prenom\}/gi, (m, sp) => (first ? sp + first : "")).trim();
    box.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
    if (!clean(box.textContent)) { box.textContent = text; box.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); }
    tip("Appuie sur Entrée pour envoyer. AliEdge passera ensuite à la suivante.");
    // Envoi par le membre : la zone de saisie se vide. On note la relance puis on passe à la suivante.
    clearInterval(watching);
    let hadText = !!clean(box.textContent);
    watching = setInterval(async () => {
      const b = composer();
      const now = clean(b?.textContent);
      if (now) { hadText = true; return; }
      if (!hadText) return;
      clearInterval(watching); watching = null;
      const hist = await store.get(KEY, {});
      hist[cur.id] = [...(hist[cur.id] || []), Date.now()].slice(-MAX_PER_THREAD);
      await store.set(KEY, hist);
      sentThisSession++;
      await sleep(1200);
      next();
    }, 400);
  }

  function next() {
    clearInterval(watching); watching = null;
    idx++;
    if (idx >= Math.min(list.length, MAX_SESSION)) return finish();
    openCurrent();
  }
  async function finish() {
    clearInterval(watching); watching = null;
    const n = sentThisSession;
    idx = -1; sentThisSession = 0;
    await refreshCount();
    await drawPanel();
    const p = panel.querySelector("p");
    if (p) p.insertAdjacentHTML("afterbegin", `<b style="color:#1b7a3a">${n} relance(s) envoyée(s).</b> `);
  }
  async function act(a) {
    if (a === "close") { panel.hidden = true; fab.setAttribute("aria-expanded", "false"); }
    else if (a === "start") { idx = 0; sentThisSession = 0; openCurrent(); }
    else if (a === "skip") next();
    else if (a === "stop") finish();
  }

  fab.addEventListener("click", async () => {
    const open = panel.hidden;
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    if (open) { if (idx < 0) await refreshCount(); await drawPanel(); }
  });

  // Facebook change de page sans recharger : on suit l'adresse et la liste (défilement, nouveaux messages).
  let lastPath = "";
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; refreshCount(); }
  }, 800);
  setInterval(refreshCount, 10000);
  refreshCount();
})();
