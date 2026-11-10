// Client Supabase minimal (Auth + RPC) pour le service worker. Aucune dépendance.
import { SUPABASE_URL, SUPABASE_KEY, RESET_URL, SITE_URL } from "../config.js";

const SESSION_KEY = "ae_session";
let refreshing = null;

export class ApiError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const AUTH_MESSAGES = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  email_not_confirmed: "Confirme ton email avec le lien reçu, puis reconnecte-toi.",
  user_already_exists: "Un compte existe déjà avec cet email. Connecte-toi.",
  weak_password: "Mot de passe trop faible : 8 caractères minimum.",
  over_email_send_rate_limit: "Trop d'emails envoyés. Réessaie dans quelques minutes.",
  over_request_rate_limit: "Trop de tentatives. Réessaie dans quelques minutes.",
};

function friendly(body, status) {
  const code = body?.error_code || body?.code || body?.error || "";
  const msg = AUTH_MESSAGES[code] || body?.msg || body?.message || body?.error_description || `Erreur ${status}`;
  if (/rate limited/i.test(msg)) return { code: "rate_limited", msg: "Trop de requêtes. Patiente quelques minutes." };
  if (/pro required/i.test(msg)) return { code: "pro_required", msg: "Réservé à AliEdge Pro." };
  if (/not authenticated|JWT/i.test(msg)) return { code: "auth", msg: "Session expirée. Reconnecte-toi." };
  return { code, msg };
}

async function call(path, { method = "GET", body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Pas de connexion au serveur AliEdge. Vérifie ta connexion internet.", 0, "network");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const f = friendly(data, res.status);
    throw new ApiError(f.msg, res.status, f.code);
  }
  return data;
}

async function saveSession(raw, anonymous = false) {
  if (!raw?.access_token) return null;
  const session = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    // Durée relative à l'horloge du PC : une horloge en avance ou en retard ne fait plus expirer la session.
    expires_at: Date.now() + (raw.expires_in || 3600) * 1000,
    user: raw.user ? { id: raw.user.id, email: raw.user.email || null } : null,
    anonymous: !!(anonymous || raw.user?.is_anonymous),
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

export async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}

async function loadSession() {
  const res = await chrome.storage.local.get(SESSION_KEY);
  return res[SESSION_KEY] || null;
}

/**
 * Rafraîchit la session. Un seul rafraîchissement à la fois (verrou partagé entre les pages de l'extension).
 * Si le jeton a déjà été remplacé entre-temps, on garde le nouveau. Jeton vraiment refusé : session anonyme.
 */
async function refresh(s) {
  if (!refreshing) {
    refreshing = (async () => {
      const run = async () => {
        const cur = await loadSession();
        if (!cur) return null;
        if (cur.refresh_token !== s.refresh_token && cur.expires_at - Date.now() > 90_000) return cur;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const raw = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: cur.refresh_token } });
            return await saveSession(raw, cur.anonymous);
          } catch (e) {
            if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 429) return cur; // réseau : on garde la session
            const again = await loadSession();
            if (again && again.refresh_token !== cur.refresh_token) return again;
            if (attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
            await clearSession();
            return await anonymousSession();
          }
        }
        return cur;
      };
      try { return navigator.locks ? await navigator.locks.request("ae-auth-refresh", run) : await run(); }
      finally { setTimeout(() => { refreshing = null; }, 0); }
    })();
  }
  return refreshing;
}

let anonFailedAt = 0;
/** AliEdge sans compte : session anonyme Supabase (si activée côté Supabase). Sinon null. */
async function anonymousSession() {
  if (Date.now() - anonFailedAt < 30 * 60_000) return null;
  try {
    const raw = await call("/auth/v1/signup", { method: "POST", body: { data: { signup_source: "aliedge" } } });
    const s = await saveSession(raw, true);
    if (!s) anonFailedAt = Date.now();
    return s;
  } catch { anonFailedAt = Date.now(); return null; }
}

/** Session valide (rafraîchie si besoin), session anonyme si personne n'est connecté, ou null. */
export async function getSession() {
  const s = await loadSession();
  if (!s) return anonymousSession();
  if (s.expires_at - Date.now() > 90_000) return s;
  return refresh(s);
}

export async function signIn(email, password) {
  const raw = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  return saveSession(raw);
}

export async function signUp(email, password, marketingOptIn) {
  const raw = await call("/auth/v1/signup", {
    method: "POST",
    body: { email, password, data: { marketing_opt_in: !!marketingOptIn, signup_source: "aliedge" } },
  });
  // Avec la confirmation d'email activée, aucune session n'est renvoyée.
  if (raw?.access_token) return { session: await saveSession(raw), confirm: false };
  return { session: null, confirm: true };
}

export async function recover(email) {
  await call(`/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_URL)}`, { method: "POST", body: { email } });
}

/** Connexion Google : l'URL de retour chrome.identity doit être autorisée dans Supabase Auth. */
export async function signInWithGoogle() {
  const redirect = chrome.identity.getRedirectURL("supabase");
  // Supabase ne renvoie que vers des adresses autorisées (barapics.com) : on passe par une page relais de barapics.com
  // qui renvoie aussitôt la connexion vers l'extension. Sans elle, Google ramenait sur la page d'accueil de Barapics.
  const relay = `${SITE_URL}/aliedge-auth.html?ret=${encodeURIComponent(redirect)}`;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(relay)}`;
  let result;
  try { result = await chrome.identity.launchWebAuthFlow({ url, interactive: true }); }
  catch (e) {
    // Fenêtre fermée : souvent parce que Google a renvoyé sur barapics.com au lieu de revenir dans AliEdge
    // (adresse de retour de ce navigateur pas encore autorisée). La connexion par email marche toujours.
    throw new ApiError(/approve|closed|cancel/i.test(String(e?.message)) ? "Connexion Google interrompue. Réessaie, ou connecte-toi avec ton email et un mot de passe (même compte que Barapics)." : "Connexion Google impossible pour le moment : utilise ton email et un mot de passe.");
  }
  if (!result) throw new ApiError("Connexion Google annulée.");
  const hash = new URL(result).hash.slice(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  if (!access_token) throw new ApiError(params.get("error_description") || "Connexion Google refusée.");
  const user = await call("/auth/v1/user", { token: access_token });
  return saveSession({
    access_token,
    refresh_token: params.get("refresh_token"),
    expires_in: Number(params.get("expires_in") || 3600),
    user,
  });
}

export async function signOut() {
  const s = await loadSession();
  // scope=local : ne déconnecte que l'extension (pas Barapics ni les autres appareils).
  if (s && !s.anonymous) call("/auth/v1/logout?scope=local", { method: "POST", token: s.access_token }).catch(() => {});
  await clearSession();
}

async function authed(fn) {
  const s = await getSession();
  if (!s) throw new ApiError("Connecte-toi pour utiliser AliEdge.", 401, "auth");
  try {
    return await fn(s.access_token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Jeton refusé (souvent expiré plus tôt que prévu) : on rafraîchit une fois et on réessaie, sans déconnecter.
      const fresh = await refresh({ ...s, expires_at: 0 });
      if (fresh && fresh.access_token !== s.access_token) return await fn(fresh.access_token);
      throw new ApiError("Session expirée. Reconnecte-toi.", 401, "auth");
    }
    throw e;
  }
}

/** RPC publique (compteurs du catalogue), sans compte. */
export function publicRpc(name, args = {}) {
  return call(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
}

export function rpc(name, args = {}) {
  // Annonces envoyées à la base commune : cette version a déjà écarté celles du membre (dressing, page d'annonce,
  // numéros connus). Le marqueur chk le dit au serveur, qui refuse sinon toute vente sans vendeur connu.
  if (Array.isArray(args?._items)) args = { ...args, _items: args._items.map((i) => (i && typeof i === "object" ? { ...i, chk: 1 } : i)) };
  return authed((token) => call(`/rest/v1/rpc/${name}`, { method: "POST", body: args, token }));
}

export function select(table, query) {
  return authed((token) => call(`/rest/v1/${table}?${query}`, { token }));
}

export function insert(table, row, upsert = false) {
  return authed((token) => call(`/rest/v1/${table}`, {
    method: "POST", body: row, token,
    headers: { Prefer: upsert ? "resolution=merge-duplicates,return=minimal" : "return=minimal" },
  }));
}

export function remove(table, query) {
  return authed((token) => call(`/rest/v1/${table}?${query}`, { method: "DELETE", token }));
}
