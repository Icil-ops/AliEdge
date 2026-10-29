// Ventes à expédier : lecture d'après le format réel de « Mes commandes → Ventes » de Vinted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pendingSaleFrom } from "../src/lib/vinted.js";

test("seules les ventes encore à expédier sont gardées", () => {
  const { my_orders } = JSON.parse(readFileSync(new URL("./fixtures/my_orders.json", import.meta.url), "utf8"));
  const kept = my_orders.map((o) => pendingSaleFrom(o, "fr")).filter(Boolean);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].transaction_id, 23500000004);
  assert.equal(kept[0].title, "Ceinture tressée marron");
  assert.equal(kept[0].price, 14.5);
  assert.equal(kept[0].photo, "https://images1.vinted.net/t/d.jpeg");
  assert.equal(kept[0].url, "https://www.vinted.fr/inbox/01a2a2a2-0000-7000-8000-000000000004");
});
