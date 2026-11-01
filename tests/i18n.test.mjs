import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Charge src/i18n/en.js (script classique) dans un bac à sable.
const ctx = { globalThis: {}, console };
ctx.globalThis = ctx;
vm.runInNewContext(readFileSync("src/i18n/en.js", "utf8"), ctx);
const { tr } = ctx.AE_I18N;

test("traductions exactes et par motif", () => {
  assert.equal(tr("Analyser sur Vinted"), "Analyze on Vinted");
  assert.equal(tr("  Ventes à expédier \n"), "Sales to ship");
  assert.equal(tr("il y a 5 min"), "5 min ago");
  assert.equal(tr("12 vendus / 30 j"), "12 sold / 30 d");
  assert.equal(tr("Encore 3:05. 2 articles ouverts."), "3:05 left. 2 items opened.");
  assert.equal(tr("il y a 2 min · score 80/100"), "2 min ago · score 80/100");
  assert.equal(tr("Meilleur créneau observé : dim. entre 18 h et 21 h. Estimation d'après 40 ventes Leboncoin repérées (les ventes en moins de 7 jours comptent double)."), "Best time slot observed: Sun between 18:00 and 21:00. Estimate based on 40 spotted Leboncoin sales (sales in under 7 days count double).");
  assert.equal(tr("Texte inconnu du dictionnaire"), null);
});

test("aucune traduction vide", () => {
  const src = readFileSync("src/i18n/en.js", "utf8");
  assert.ok(!/": ""\s*[,}]/.test(src), "une entrée a une traduction vide");
});
