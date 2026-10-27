// Sur Vinted : un bouton « + Concurrent » à côté de chaque profil (annonces, résultats, page vendeur)
// pour l'ajouter en un clic aux concurrents suivis par AliEdge.
(() => {
  if (window.__aliedgeCompetitors) return;
  window.__aliedgeCompetitors = true;

  const market = location.hostname.endsWith(".co.uk") ? "uk" : location.hostname.split(".").pop();
  let tracked = new Set();
  let loggedIn = true;

  const send = async (msg) => { try { return await chrome.runtime.sendMessage(msg); } catch { return null; } };

  async function refreshTracked() {
    const r = await send({ type: "competitor:ids" });
    if (r?.ok) tracked = new Set(r.data || []);
    else if (r?.code === "auth") loggedIn = false;
  }

  const CSS = `
    :host{all:initial;display:inline-flex;vertical-align:middle;margin-left:6px}
    button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:999px;
      background:#6d3bff;color:#fff;font:600 11.5px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;
      box-shadow:0 2px 6px -2px rgba(109,59,255,.6);transition:background .15s}
    button:hover{background:#5a2be6} button:focus-visible{outline:2px solid #8f6bff;outline-offset:2px}
    button.ok{background:#0fa968;box-shadow:none;cursor:default}
    button.err{background:#b4233a}
    svg{flex:none}`;
  const PLUS = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  const CHECK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';

  function makeButton(sellerId, name) {
    const host = document.createElement("span");
    host.className = "aliedge-competitor";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><button type="button"></button>`;
    const btn = root.querySelector("button");
    const paint = () => {
      const on = tracked.has(`${market}:${sellerId}`);
      btn.className = on ? "ok" : "";
      btn.innerHTML = on ? `${CHECK}Concurrent suivi` : `${PLUS}Concurrent`;
      btn.title = on ? "Suivi par AliEdge : ouvre l'onglet Concurrents pour le récap" : "Ajouter aux concurrents suivis par AliEdge";
      btn.setAttribute("aria-label", on ? `${name || "Ce vendeur"} est suivi par AliEdge` : `Ajouter ${name || "ce vendeur"} aux concurrents AliEdge`);
    };
    host.__paint = paint;
    paint();
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (tracked.has(`${market}:${sellerId}`)) { send({ type: "open:panel", route: "concurrents" }); return; }
      btn.textContent = "Ajout…";
      const r = await send({ type: "tracker:add", sellerId, market, label: name || null });
      if (r?.ok) { tracked.add(`${market}:${sellerId}`); document.querySelectorAll(".aliedge-competitor").forEach((h) => h.__paint?.()); }
      else { btn.className = "err"; btn.textContent = r?.error || "Ouvre AliEdge et connecte-toi"; setTimeout(paint, 4000); }
    }, true);
    // Le bouton est souvent posé dans une carte cliquable : on ne laisse pas le clic l'ouvrir.
    host.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
    return host;
  }

  const idOf = (a) => Number((a.getAttribute("href") || "").match(/\/member\/(\d+)(?:[-/?#]|$)/)?.[1]) || 0;

  function decorate() {
    if (!loggedIn) return;
    // Liens vers un profil qui affichent un pseudo (pas seulement l'avatar).
    for (const a of document.querySelectorAll('a[href*="/member/"]:not([data-aliedge])')) {
      a.dataset.aliedge = "1";
      const sellerId = idOf(a);
      if (!sellerId) continue;
      if (a.closest("header, nav, footer, [role=menu], [role=dialog]")) continue;
      const name = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!name || name.length > 40) continue;
      a.insertAdjacentElement("afterend", makeButton(sellerId, name));
    }
    // Page d'un vendeur : à côté de son pseudo.
    const own = Number(location.pathname.match(/^\/member\/(\d+)/)?.[1]);
    const h1 = own && document.querySelector("main h1, h1");
    if (h1 && !h1.querySelector(".aliedge-competitor") && !h1.dataset.aliedge) {
      h1.dataset.aliedge = "1";
      h1.appendChild(makeButton(own, h1.textContent.trim().slice(0, 80)));
    }
  }

  let queued = false;
  const schedule = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; decorate(); }, 600); };

  refreshTracked().then(() => {
    decorate();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  });
  // Changement de page sans rechargement (Vinted est une application) : on rafraîchit l'état.
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname === last) return;
    last = location.pathname;
    refreshTracked().then(() => { document.querySelectorAll(".aliedge-competitor").forEach((h) => h.__paint?.()); schedule(); });
  }, 1000);
})();
