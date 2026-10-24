// Visuels de la fiche Chrome Web Store : node tools/store-assets/render.mjs store-assets
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const out = process.argv[2] || "store-assets";
mkdirSync(out, { recursive: true });
const tile = "file://" + resolve("tools/store-assets/tile.html");
const b = await chromium.launch();

// Vignettes promo (petite 440×280, grande 1400×560).
for (const [w, h, s, pad, mw, stamp, name] of [[440, 280, 29, 30, 390, "none", "promo-440x280"], [1400, 560, 78, 110, 900, "block", "marquee-1400x560"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(tile);
  await p.evaluate(([w, h, s, pad, mw, stamp]) => {
    const r = document.body.style;
    r.setProperty("--w", w + "px"); r.setProperty("--h", h + "px"); r.setProperty("--s", s + "px");
    r.setProperty("--pad", pad + "px"); r.setProperty("--mw", mw + "px"); r.setProperty("--stamp", stamp);
  }, [w, h, s, pad, mw, stamp]);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
}

// Captures 1280×800 de la page en ligne (démo de l'extension, fonctions, catalogue).
const site = "https://ivanbara.com/aliedge";
const shots = [
  ["capture-1-analyse", null, 6500],
  ["capture-2-catalogue", "#catalogue", 2600],
  ["capture-3-fonctions", "#fonctions", 2600],
  ["capture-4-installer", "#installer", 2600],
];
for (const [name, sel, wait] of shots) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.route(/analytics\.tiktok/, (r) => r.abort());
  await p.goto(site, { waitUntil: "networkidle" });
  if (sel) await p.evaluate((s) => { const el = document.querySelector(s); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: "instant" }); }, sel);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
}
await b.close();
console.log("ok");
