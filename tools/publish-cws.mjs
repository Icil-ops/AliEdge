// Publie dist/aliedge-<version>.zip sur le Chrome Web Store (API v2) si la version du manifest
// est plus récente que celle déjà envoyée. Sans secrets configurés, ne fait rien (sortie 0).
// Variables : CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID, CWS_EXTENSION_ID (optionnel).
import { readFileSync } from "node:fs";

const env = process.env;
const EXT = env.CWS_EXTENSION_ID || "okkbjdadgkjdmdfepgcfeabholbgfafg";
// Identifiant d'éditeur du Chrome Web Store (pas secret). Le secret CWS_PUBLISHER_ID ne sert qu'à le remplacer.
const DEFAULT_PUBLISHER = "96af20c5-dbc9-48c6-8db5-6c5642a5b983";
const PUBLISHER = env.CWS_PUBLISHER_ID && env.CWS_PUBLISHER_ID !== EXT ? env.CWS_PUBLISHER_ID : DEFAULT_PUBLISHER;
const missing = ["CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN"].filter((k) => !env[k]);
if (missing.length) {
  console.log(`::warning title=Chrome Web Store::Publication automatique désactivée, secrets manquants : ${missing.join(", ")}`);
  process.exit(0);
}

const version = JSON.parse(readFileSync("manifest.json", "utf8")).version;
const zip = `dist/aliedge-${version}.zip`;
const base = `https://chromewebstore.googleapis.com/v2/publishers/${PUBLISHER}/items/${EXT}`;

export function newer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

async function token() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET, refresh_token: env.CWS_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(`Jeton Google refusé (${res.status}) : ${j.error_description || j.error || "?"}`);
  return j.access_token;
}

const auth = { Authorization: `Bearer ${await token()}` };
const status = async () => {
  const res = await fetch(`${base}:fetchStatus`, { headers: auth });
  const j = await res.json();
  if (!res.ok) throw new Error(`fetchStatus ${res.status} : ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const versions = (s) => [s.publishedItemRevisionStatus, s.submittedItemRevisionStatus]
  .flatMap((r) => r?.distributionChannels ?? []).map((c) => c.crxVersion).filter(Boolean);

const before = await status();
const known = versions(before);
const latest = known.reduce((m, v) => (newer(v, m) ? v : m), "0");
console.log(`Manifest ${version} · store ${latest} (publié : ${before.publishedItemRevisionStatus?.state ?? "aucun"}, soumis : ${before.submittedItemRevisionStatus?.state ?? "aucun"})`);
if (!newer(version, latest)) {
  console.log("Rien à publier : augmentez « version » dans manifest.json pour envoyer une mise à jour.");
  process.exit(0);
}

const up = await fetch(`https://chromewebstore.googleapis.com/upload/v2/publishers/${PUBLISHER}/items/${EXT}:upload`, {
  method: "POST",
  headers: { ...auth, "content-type": "application/zip" },
  body: readFileSync(zip),
});
const uj = await up.json();
if (!up.ok) { for (const d of uj.error?.details ?? []) if (d.message) console.log(`Détail : ${d.message}`); throw new Error(`Envoi refusé (${up.status}) : ${uj.error?.message ?? ""}`); }
let state = uj.uploadState;
for (let i = 0; state === "IN_PROGRESS" || state === "UPLOAD_IN_PROGRESS"; i++) {
  if (i > 30) throw new Error("Envoi toujours en cours après 5 minutes.");
  await new Promise((r) => setTimeout(r, 10_000));
  state = (await status()).lastAsyncUploadState;
}
if (state && state !== "SUCCEEDED" && state !== "SUCCESS") throw new Error(`Envoi échoué : ${state} ${JSON.stringify(uj).slice(0, 400)}`);
console.log(`Paquet ${version} envoyé.`);

const pub = await fetch(`${base}:publish`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}" });
const pj = await pub.json();
if (!pub.ok) throw new Error(`Publication refusée (${pub.status}) : ${JSON.stringify(pj).slice(0, 400)}`);
console.log(`Soumis à la revue Google (${pj.state ?? "ok"}). La mise à jour sera installée automatiquement chez les utilisateurs après validation.`);
