import test from "node:test";
import assert from "node:assert/strict";
import { matchSale, similarity, titleKey } from "../src/lib/match.js";

const ali = { url: "https://fr.aliexpress.com/item/1005007001.html", title: "Women Crochet Beach Dress Bohemian Summer", query: "robe crochet plage bohème", price: 8.4, platform: "aliexpress" };
const sac = { url: "https://fr.aliexpress.com/item/1005007002.html", title: "Sac bandoulière cuir noir petit", query: "sac bandoulière cuir noir", price: 6.4, platform: "aliexpress" };

test("une annonce créée avec Barapics est reliée à coup sûr", () => {
  const links = { [titleKey("Robe crochet plage bohème neuve")]: ali };
  const m = matchSale({ title: "Robe crochet plage bohème neuve" }, links, []);
  assert.equal(m.url, ali.url);
  assert.equal(m.sure, true);
});

test("sinon, le produit analysé le plus proche est proposé (pas sûr)", () => {
  const m = matchSale({ title: "Robe en crochet bohème pour la plage" }, {}, [sac, ali]);
  assert.equal(m.url, ali.url);
  assert.equal(m.sure, false);
  assert.ok(m.score >= 0.5);
});

test("aucune suggestion quand rien ne ressemble", () => {
  assert.equal(matchSale({ title: "Montre connectée sport" }, {}, [sac, ali]), null);
  assert.equal(matchSale({ title: "" }, {}, [sac]), null);
});

test("la ressemblance ignore accents, mots vides et pluriels", () => {
  assert.ok(similarity("Sacs bandoulières en cuir", "sac bandouliere cuir") > 0.8);
  assert.equal(similarity("", "sac"), 0);
});
