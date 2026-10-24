import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrice, priceStats, recommendedPrice, breakEvenPrice, analyse, scoreOpportunity, histogram, toEur } from "../src/lib/pricing.js";
import { buildQuery, relevance, guessCategory, draftListing } from "../src/lib/text.js";
import { detectPlatform, sourceIdFromUrl, canonicalUrl } from "../src/lib/extract.js";
import { parseItemStatus, normaliseItem, statusFromJson } from "../src/lib/vinted.js";

test("parsePrice lit les formats courants", () => {
  assert.deepEqual(parsePrice("12,99 €"), { amount: 12.99, currency: "EUR" });
  assert.deepEqual(parsePrice("€12.99"), { amount: 12.99, currency: "EUR" });
  assert.deepEqual(parsePrice("US $3.45"), { amount: 3.45, currency: "USD" });
  assert.deepEqual(parsePrice("1 299,00 €"), { amount: 1299, currency: "EUR" });
  assert.deepEqual(parsePrice("1.299,50 €"), { amount: 1299.5, currency: "EUR" });
  assert.deepEqual(parsePrice("1,299.50 $"), { amount: 1299.5, currency: "USD" });
  assert.deepEqual(parsePrice("£7"), { amount: 7, currency: "GBP" });
  assert.equal(parsePrice("gratuit"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice(null), null);
});

test("toEur convertit au taux indicatif", () => {
  assert.equal(toEur(10, "EUR"), 10);
  assert.equal(toEur(10, "USD"), 9.2);
  assert.equal(toEur(10, "XYZ"), null);
});

test("priceStats retire les prix aberrants", () => {
  const s = priceStats([10, 11, 12, 12, 13, 14, 15, 200]);
  assert.equal(s.max, 15);
  assert.equal(s.removed, 1);
  assert.equal(s.median, 12);
});

test("recommendedPrice suit le marché, breakEvenPrice donne le seuil", () => {
  const s = priceStats([10, 12, 14, 16, 18]);
  const p = recommendedPrice(s);
  assert.ok(p <= s.median && p >= s.p25, `prix ${p}`);
  assert.equal(breakEvenPrice(12.2), 12.5);
  assert.equal(breakEvenPrice(20.1), 21);
});

test("analyse : marge, score et verdict", () => {
  const items = [9, 10, 11, 12, 12, 13, 14].map((price, i) => ({ vinted_id: i + 1, price, favourites: 8 }));
  const r = analyse({ productPrice: 3, shipping: 0, costPerSale: 0.5, items });
  assert.equal(r.cost, 3.5);
  assert.ok(r.sell >= 10 && r.sell <= 12);
  assert.ok(r.margin > 6);
  assert.ok(r.score >= 55, `score ${r.score}`);
  assert.equal(r.reference, "active");
  const loss = analyse({ productPrice: 30, items });
  assert.equal(loss.verdict, "loss");
  assert.ok(loss.margin <= 0);
});

test("analyse privilégie les ventes constatées", () => {
  const items = [20, 21, 22].map((price, i) => ({ vinted_id: i, price }));
  const soldItems = [12, 13, 14, 15].map((price) => ({ price }));
  const r = analyse({ productPrice: 2, items, soldItems });
  assert.equal(r.reference, "sold");
  assert.ok(r.sell <= 14);
});

test("annonces exclues ignorées", () => {
  const items = [{ vinted_id: 1, price: 10 }, { vinted_id: 2, price: 11 }, { vinted_id: 3, price: 90, excluded: true }];
  const r = analyse({ productPrice: 1, items });
  assert.equal(r.activeStats.max, 11);
});

test("scoreOpportunity borne le score", () => {
  assert.equal(scoreOpportunity({ sell: 0, cost: 1 }).score, 0);
  const s = scoreOpportunity({ sell: 30, cost: 2, activeCount: 3, soldCount: 20 });
  assert.ok(s.score <= 100 && s.verdict === "excellent");
});

test("histogram", () => {
  const h = histogram([1, 2, 3, 4, 5, 6, 7, 8], 4);
  assert.equal(h.length, 4);
  assert.equal(h.reduce((a, b) => a + b.count, 0), 8);
});

test("buildQuery garde les mots porteurs", () => {
  assert.equal(buildQuery("2024 Nouvelle Robe Longue Satin Femme Élégante Soirée Été"), "robe longue satin elegante soiree");
  assert.equal(buildQuery("1PCS Sac à main en cuir PU pour femmes"), "sac main cuir");
});

test("relevance", () => {
  assert.equal(relevance("robe satin longue", "Robe longue en satin noir"), 1);
  assert.ok(relevance("robe satin longue", "Jean slim bleu") === 0);
  assert.ok(relevance("robes satin", "robe satin") > 0.8);
});

test("guessCategory", () => {
  assert.equal(guessCategory("Baskets montantes blanches"), "Chaussures");
  assert.equal(guessCategory("Robe longue satin"), "Vêtements");
  assert.equal(guessCategory("Collier perles"), "Bijoux");
  assert.equal(guessCategory("Truc bizarre"), "Autres");
});

test("draftListing", () => {
  const l = draftListing({ title: "Robe longue satin femme", category: "Vêtements" }, 14.5);
  assert.ok(l.title.startsWith("Robe"));
  assert.ok(l.description.includes("14,50 €"));
});

test("détection des fiches produit", () => {
  assert.equal(detectPlatform("https://fr.aliexpress.com/item/1005006123456789.html?spm=abc"), "aliexpress");
  assert.equal(detectPlatform("https://www.temu.com/fr/robe-satin-g-601099512345678.html?_x_sessn_id=1"), "temu");
  assert.equal(detectPlatform("https://www.temu.com/goods.html?goods_id=601099512345678"), "temu");
  assert.equal(detectPlatform("https://fr.shein.com/Robe-satin-p-12345678-cat-1727.html?src=x"), "shein");
  assert.equal(detectPlatform("https://www.shein.com/Dress-p-987654.html"), "shein");
  assert.equal(detectPlatform("https://fr.aliexpress.com/w/wholesale-robe.html"), null);
  assert.equal(detectPlatform("https://www.vinted.fr/items/1"), null);
  assert.equal(detectPlatform("pas une url"), null);
});

test("identifiants et URL canoniques", () => {
  assert.equal(sourceIdFromUrl("https://fr.aliexpress.com/item/1005006123456789.html?x=1"), "1005006123456789");
  assert.equal(sourceIdFromUrl("https://www.temu.com/fr/a-g-601099512345678.html"), "601099512345678");
  assert.equal(sourceIdFromUrl("https://fr.shein.com/Robe-p-12345678-cat-1727.html"), "12345678");
  assert.equal(canonicalUrl("https://es.aliexpress.com/item/1005006123456789.html?spm=abc"), "https://fr.aliexpress.com/item/1005006123456789.html");
  assert.equal(canonicalUrl("https://fr.shein.com/Robe-p-12345678-cat-1727.html?src=x"), "https://fr.shein.com/Robe-p-12345678-cat-1727.html");
});

test("statut d'une annonce Vinted", () => {
  assert.equal(parseItemStatus('<script type="application/ld+json">{"offers":{"availability":"https://schema.org/SoldOut"}}</script>'), "sold");
  assert.equal(parseItemStatus('{"availability":"http://schema.org/InStock"}'), "active");
  assert.equal(parseItemStatus('self.__next_f.push([1,"{\\"is_closed\\":true,\\"item_closing_action\\":\\"sold\\"}"])'), "sold");
  assert.equal(parseItemStatus('{"is_closed":true}'), "closed");
  assert.equal(parseItemStatus("<html></html>"), null);
  assert.equal(parseItemStatus(null), "closed");
});

test("normalisation d'une annonce du catalogue Vinted", () => {
  const it = normaliseItem({
    id: 42, title: "Robe", price: { amount: "12.5", currency_code: "EUR" }, brand_title: "Zara", size_title: "M",
    status: "Neuf avec étiquette", favourite_count: 3, photo: { url: "https://images1.vinted.net/a.jpg" },
  }, "fr");
  assert.equal(it.vinted_id, 42);
  assert.equal(it.price, 12.5);
  assert.equal(it.url, "https://www.vinted.fr/items/42");
  assert.equal(it.favourites, 3);
});

test("statut d'une annonce dans un dressing", () => {
  assert.equal(statusFromJson({ is_closed: true, item_closing_action: "sold" }), "sold");
  assert.equal(statusFromJson({ is_closed: true }), "closed");
  assert.equal(statusFromJson({ is_hidden: true }), "closed");
  assert.equal(statusFromJson({ id: 1 }), "active");
});

test("le vendeur d'une annonce est conservé", () => {
  assert.equal(normaliseItem({ id: 3, title: "x", price: "5", user: { id: 4242 } }, "fr").seller_id, 4242);
  assert.equal(normaliseItem({ id: 3, title: "x", price: "5" }, "fr").seller_id, null);
});
