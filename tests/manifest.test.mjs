// Garde : Barapics et ivanbara.com doivent toujours pouvoir parler à l'extension
// (lecture des fiches Shein/Temu dans Barapics, ventes Vinted dans la warehouse).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
test("externally_connectable garde barapics.com et ivanbara.com", () => {
  const ok = m.externally_connectable?.matches ?? [];
  for (const host of ["https://barapics.com/*", "https://www.barapics.com/*", "https://ivanbara.com/*", "https://www.ivanbara.com/*"]) {
    assert.ok(ok.includes(host), `manque ${host}`);
  }
});
