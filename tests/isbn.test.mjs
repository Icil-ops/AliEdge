import test from "node:test";
import assert from "node:assert/strict";
import { cleanIsbn, isbnOf } from "../src/lib/vinted.js";

test("ISBN : validation et conversion en 13 chiffres", () => {
  assert.equal(cleanIsbn("978-2-07-036024-6"), "9782070360246");
  assert.equal(cleanIsbn("2070360245"), "9782070360246");
  assert.equal(cleanIsbn("9782070360245"), null);
  assert.equal(cleanIsbn("06 12 34 56 78"), null);
});
test("ISBN lu sans requête : champ, attributs, description", () => {
  assert.equal(isbnOf({ isbn: "9782070360246" }), "9782070360246");
  assert.equal(isbnOf({ item_attributes: [{ code: "isbn", value: "978-2-07-036024-6" }] }), "9782070360246");
  assert.equal(isbnOf({ title: "L'Étranger Camus", description: "Très bon état. ISBN : 2-07-036024-5" }), "9782070360246");
  assert.equal(isbnOf({ title: "Sac cuir", description: "Tel 0612345678, réf 123456789" }), null);
});
