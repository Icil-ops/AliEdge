// Vinted : AliEdge reconnaît le compte Vinted connecté pour ne JAMAIS publier ses annonces dans la base commune
// (ni les suivre comme concurrent). Aucune requête à Vinted : tout est lu sur la page déjà ouverte.
//
// Avant, le compte n'était reconnu que si le membre ouvrait son profil ou une de ses annonces : beaucoup de comptes
// n'étaient jamais reconnus. Maintenant, sur toute page Vinted :
//   1. le lien « Mon profil » du menu du compte (en haut de page), dès qu'il est affiché : signal sûr ;
//   2. le témoin (cookie) v_uid de Vinted : pris en compte seulement s'il a déjà été confirmé une fois par le signal 1
//      dans ce navigateur (on ne déclare jamais un compte sur un simple chiffre non vérifié).
(async () => {
  try { if ((await chrome.storage.local.get("ae_disabled")).ae_disabled) return; } catch { /* stockage indisponible */ }
  if (window.__aliedgeWhoami) return;
  window.__aliedgeWhoami = true;
  const marketOf = (h) => (h.endsWith(".co.uk") ? "uk" : h.split(".").pop());
  const PROFILE = /^(mon profil|profil|my profile|profile|mein profil|mi perfil|perfil|il mio profilo|profilo|mijn profiel|profiel|mój profil|meu perfil|můj profil|môj profil|profilom|profilul meu|mano profilis|min profil|oma profiili)$/i;
  const MENU = '[data-testid*="user-menu" i], [id*="user-menu" i], [data-testid*="header-menu" i], [class*="user-menu" i]';

  /** Lien « Mon profil » du menu du compte : { id, login } ou null. Jamais un lien vers un autre membre. */
  function menuProfile() {
    for (const a of document.querySelectorAll('header a[href*="/member/"], nav a[href*="/member/"], [role="menu"] a[href*="/member/"]')) {
      let path = "";
      try { path = new URL(a.getAttribute("href"), location.href).pathname; } catch { continue; }
      const m = path.match(/^\/member\/(\d{3,15})(?:-([A-Za-z0-9._-]{1,40}))?\/?$/);
      if (!m) continue;
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!PROFILE.test(text) && !a.closest(MENU)) continue;
      return { id: Number(m[1]), login: m[2] || null };
    }
    return null;
  }
  const cookieUid = () => {
    try { const v = (document.cookie.split("; ").find((c) => c.startsWith("v_uid=")) || "").slice(6); return /^\d{3,15}$/.test(v) ? Number(v) : null; } catch { return null; }
  };

  let sent = 0;
  const KEY = "ae_whoami";
  async function check() {
    try {
      const strong = menuProfile();
      const uid = cookieUid();
      const st = (await chrome.storage.local.get(KEY))[KEY] || {};
      let id = null, login = null;
      if (strong) {
        id = strong.id; login = strong.login;
        // Le cookie dit la même chose que le menu : on pourra s'y fier seul ensuite (changement de compte compris).
        if (uid && uid === strong.id && !st.cookieOk) { st.cookieOk = true; await chrome.storage.local.set({ [KEY]: st }); }
      } else if (uid && st.cookieOk) id = uid;
      // Diagnostic anonyme, une fois par jour : sert à vérifier que la reconnaissance fonctionne (aucun identifiant envoyé).
      if (Date.now() - (st.diagAt || 0) > 24 * 3600_000 && (strong || uid || document.readyState === "complete")) {
        st.diagAt = Date.now();
        await chrome.storage.local.set({ [KEY]: st });
        chrome.runtime.sendMessage({ type: "vinted:selfDiag", info: `menu=${strong ? "oui" : "non"} cookie=${uid ? "oui" : "non"} accord=${strong && uid ? (strong.id === uid ? "oui" : "NON") : "-"} confirme=${st.cookieOk ? "oui" : "non"}` }).catch(() => {});
      }
      if (!id || id === sent) return;
      sent = id;
      chrome.runtime.sendMessage({ type: "vinted:self", id, login, market: marketOf(location.hostname) }).catch(() => {});
    } catch { /* extension rechargée */ }
  }
  // Au chargement, puis quand la page change (menu du compte ouvert, navigation interne) : jamais plus d'une lecture
  // toutes les 2 secondes.
  let timer = null;
  const schedule = () => { if (!timer) timer = setTimeout(() => { timer = null; check(); }, 2000); };
  setTimeout(check, 3500);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();
