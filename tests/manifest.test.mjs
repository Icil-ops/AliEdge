import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = JSON.parse(readFileSync("manifest.json", "utf8"));

test("le manifest respecte les limites du Chrome Web Store", () => {
  assert.ok(m.name.length <= 75, `nom trop long (${m.name.length}/75)`);
  assert.ok(!m.short_name || m.short_name.length <= 12, "short_name trop long (12 max)");
  assert.ok(m.description.length <= 132, `description trop longue (${m.description.length}/132)`);
  assert.match(m.version, /^\d+(\.\d+){0,3}$/);
  assert.equal(m.key, undefined, "pas de clé « key » dans le paquet du store");
});

test("les traductions du nom et de la description respectent les limites du store", () => {
  for (const l of ["fr", "en"]) {
    const msg = JSON.parse(readFileSync(`_locales/${l}/messages.json`, "utf8"));
    assert.ok(msg.extName.message.length <= 75, `${l} : nom trop long`);
    assert.ok(msg.extDesc.message.length <= 132, `${l} : description trop longue`);
    assert.ok(msg.captureZone.message.length > 0);
  }
  assert.equal(m.default_locale, "fr");
});

test("Leboncoin reste une permission facultative (une permission obligatoire désactiverait AliEdge à la mise à jour)", () => {
  assert.ok(!m.host_permissions.some((h) => h.includes("leboncoin")));
  assert.ok(m.optional_host_permissions.includes("https://www.leboncoin.fr/*"));
  assert.ok(!m.host_permissions.some((h) => h.includes("beebs")), "Beebs reste facultatif aussi");
});

test("le paquet du store contient tout ce que le manifest utilise (traductions comprises)", () => {
  const pack = readFileSync("tools/pack.sh", "utf8");
  assert.match(pack, /_locales/, "tools/pack.sh doit copier _locales (nom et description traduits)");
});
