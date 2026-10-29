// Vinted : AliEdge reconnaît le compte Vinted connecté pour ne JAMAIS publier ses annonces
// dans la base commune (ni les suivre comme concurrent). Une seule lecture par jour, sur la page déjà ouverte.
(() => {
  if (window.__aliedgeWhoami) return;
  window.__aliedgeWhoami = true;
  const KEY = "ae_whoami_at";
  const marketOf = (h) => (h.endsWith(".co.uk") ? "uk" : h.split(".").pop());
  setTimeout(async () => {
    try {
      const r = await chrome.storage.local.get(KEY);
      const last = (r[KEY] || {})[location.hostname] || 0;
      if (Date.now() - last < 12 * 3600_000) return;
      const res = await fetch(`${location.origin}/api/v2/users/current`, { credentials: "include", headers: { Accept: "application/json" } });
      const all = { ...(r[KEY] || {}), [location.hostname]: Date.now() };
      await chrome.storage.local.set({ [KEY]: all });
      if (!res.ok || !/json/.test(res.headers.get("content-type") || "")) return;
      const u = (await res.json())?.user;
      if (u?.id) chrome.runtime.sendMessage({ type: "vinted:self", id: Number(u.id), login: u.login || null, market: marketOf(location.hostname) });
    } catch { /* pas connecté à Vinted, ou extension rechargée */ }
  }, 3500);
})();
