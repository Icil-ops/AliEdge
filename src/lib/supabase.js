// Client Supabase minimal (Auth + RPC) pour le service worker. Aucune dépendance.
import { SUPABASE_URL, SUPABASE_KEY, RESET_URL } from "../config.js";

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

async function saveSession(raw) {
  if (!raw?.access_token) return null;
  const session = {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at ? raw.expires_at * 1000 : Date.now() + (raw.expires_in || 3600) * 1000,
    user: raw.user ? { id: raw.user.id, email: raw.user.email } : null,
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

/** Session valide (rafraîchie si besoin) ou null. */
export async function getSession() {
  const s = await loadSession();
  if (!s) return null;
  if (s.expires_at - Date.now() > 90_000) return s;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const raw = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh_token } });
        return await saveSession(raw);
      } catch (e) {
        // Jeton révoqué ou expiré : on déconnecte proprement. Erreur réseau : on garde la session.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) { await clearSession(); return null; }
        return s;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
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
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
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
  if (s) call("/auth/v1/logout", { method: "POST", token: s.access_token }).catch(() => {});
  await clearSession();
}

async function authed(fn) {
  const s = await getSession();
  if (!s) throw new ApiError("Connecte-toi pour utiliser AliEdge.", 401, "auth");
  try {
    return await fn(s.access_token);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await clearSession();
      throw new ApiError("Session expirée. Reconnecte-toi.", 401, "auth");
    }
    throw e;
  }
}

export function rpc(name, args = {}) {
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
