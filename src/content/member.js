// Profil d'un vendeur Vinted : son dressing met à jour les annonces que suit le catalogue AliEdge.
// Lecture identique à celle de la page (même origine, mêmes cookies), une fois par profil.
(() => {
  if (window.__aliedgeMember) return;
  window.__aliedgeMember = true;

  const marketOf = (h) => (h.endsWith(".co.uk") ? "uk" : h.split(".").pop());
  const done = new Set();

  async function run() {
    const sellerId = Number(location.pathname.match(/\/member\/(\d+)/)?.[1]);
    if (!sellerId || done.has(sellerId)) return;
    done.add(sellerId);
    try {
      const res = await fetch(`${location.origin}/api/v2/users/${sellerId}/items?page=1&per_page=96&order=newest_first`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const body = await res.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      if (items.length) chrome.runtime.sendMessage({ type: "vinted:member", sellerId, market: marketOf(location.hostname), items });
    } catch { /* hors ligne ou extension rechargée */ }
  }

  // Bouton « Suivre ce vendeur 14 jours » (tracker AliEdge).
  let pill = null;
  function mountPill() {
    const sellerId = Number(location.pathname.match(/\/member\/(\d+)/)?.[1]);
    pill?.remove(); pill = null;
    if (!sellerId) return;
    pill = document.createElement("div");
    pill.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483646;";
    const root = pill.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        button{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;border-radius:999px;background:#1b1530;color:#fff;
          font:600 14px/1.1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px -8px rgba(27,21,48,.55);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
        button:hover{transform:translateY(-2px)} button:focus-visible{outline:3px solid #8f6bff;outline-offset:3px}
        .mark{width:28px;height:28px;border-radius:50%;background:#6d3bff;display:grid;place-items:center}
        .ok .mark{background:#0fa968}
        @media (prefers-reduced-motion:reduce){button{transition:none}}
      </style>
      <button type="button"><span class="mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg></span><span class="label">Suivre ses ventes 14 jours</span></button>`;
    const btn = root.querySelector("button");
    const label = root.querySelector(".label");
    btn.addEventListener("click", async () => {
      label.textContent = "Mise en place…";
      const name = (document.querySelector("h1")?.textContent || "").trim().slice(0, 80) || null;
      let r = null;
      try { r = await chrome.runtime.sendMessage({ type: "tracker:add", sellerId, market: marketOf(location.hostname), label: name }); } catch { /* extension rechargée */ }
      if (r?.ok) { btn.classList.add("ok"); label.textContent = "Suivi pendant 14 jours"; }
      else label.textContent = r?.error || "Ouvre AliEdge et connecte-toi";
    });
    document.documentElement.appendChild(pill);
  }

  setTimeout(run, 2000);
  setTimeout(mountPill, 1500);
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname !== last) { last = location.pathname; setTimeout(run, 2000); setTimeout(mountPill, 1500); }
  }, 1000);
})();
