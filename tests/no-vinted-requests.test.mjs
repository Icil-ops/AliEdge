// Règle permanente : AliEdge n'envoie AUCUNE requête à Vinted avec le compte d'un membre (API, pages, onglet caché).
// Ce test échoue si une lecture désactivée le 03/11/2026 est réactivée, ou si une nouvelle apparaît.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("l'interrupteur des requêtes Vinted reste coupé", () => {
  assert.match(read("src/lib/vinted.js"), /export const REQUESTS_OFF = true;/);
});

test("les lectures avec la session du membre restent désactivées", () => {
  assert.match(read("src/content/vinted.js"), /async function details\(id\) \{\s*return null;/);
  assert.match(read("src/content/whoami.js"), /return; \/\/ plus aucune requête à Vinted/);
  assert.match(read("src/content/member.js"), /return; \/\/ plus aucune requête à Vinted/);
  const lib = read("src/lib/vinted.js");
  for (const fn of ["directFetch", "vFetch", "searchFromPage"]) {
    const body = lib.slice(lib.indexOf(`function ${fn}(`), lib.indexOf(`function ${fn}(`) + 400);
    assert.match(body, /if \(REQUESTS_OFF\) throw/, `${fn} doit s'arrêter sur REQUESTS_OFF`);
  }
});

test("aucun autre fichier n'envoie de requête avec les cookies du membre", () => {
  const allowed = new Set(["lib/vinted.js", "content/vinted.js", "content/whoami.js", "content/member.js"]);
  const walk = (dir) => readdirSync(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : e.name.endsWith(".js") ? [`${dir}${e.name}`] : []));
  for (const f of walk("")) {
    if (allowed.has(f)) continue;
    assert.doesNotMatch(read(`src/${f}`), /credentials:\s*["']include["']/, `${f} : requête avec les cookies du membre`);
  }
});
