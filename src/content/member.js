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

  setTimeout(run, 2000);
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname !== last) { last = location.pathname; setTimeout(run, 2000); }
  }, 1000);
})();
