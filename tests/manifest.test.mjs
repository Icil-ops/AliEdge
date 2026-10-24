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
