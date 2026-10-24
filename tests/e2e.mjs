// Test de bout en bout de l'extension dans Chromium, avec Vinted, AliExpress et le serveur simulés.
// Usage : node tests/e2e.mjs [dossier-captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || path.join(os.tmpdir(), "aliedge-shots");
mkdirSync(shots, { recursive: true });
const fx = (f) => readFileSync(path.join(root, "tests/fixtures", f), "utf8");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8sPL/fwAH/wNMkQ+HXQAAAABJRU5ErkJggg==", "base64");

const titles = ["Sac bandoulière cuir noir", "Petit sac à main cuir femme", "Sac bandoulière simili cuir", "Sac cuir femme neuf", "Sac à main bandoulière noir", "Sac bandoulière cuir camel", "Sac cuir bandoulière beige", "Pochette bandoulière cuir", "Sac main cuir PU noir", "Robe longue satin"];
const prices = [22, 18, 19.5, 25, 20, 21, 17, 15, 23, 30];
const catalogItems = titles.map((t, i) => ({ id: 9000 + i, title: t, price: { amount: String(prices[i]), currency_code: "EUR" }, brand_title: i % 3 ? "Sans marque" : "Zara", size_title: "Taille unique", status: "Neuf avec étiquette", favourite_count: 4 + i, photo: { url: `https://images1.vinted.net/t/${i}.jpeg` }, url: `https://www.vinted.fr/items/${9000 + i}-sac` }));

const calls = [];
const rpc = {
  aliedge_me: { pro: true, admin: false, email: "membre@example.com", source: "skool", expires_at: new Date(Date.now() + 20 * 864e5).toISOString(), used_today: 3, daily_limit: 500 },
  aliedge_start_analysis: { allowed: true, used: 4, limit: 500, pro: true },
  aliedge_contribute: "c3f50103-f4a4-414b-b502-74634864fe06",
  aliedge_product_items: [
    { vinted_id: 7001, title: "Sac bandoulière cuir noir", price: 21, photo_url: "https://images1.vinted.net/t/s1.jpeg", url: "https://www.vinted.fr/items/7001", status: "sold", sold_at: new Date(Date.now() - 2 * 864e5).toISOString() },
    { vinted_id: 7002, title: "Sac cuir femme", price: 19, photo_url: "https://images1.vinted.net/t/s2.jpeg", url: "https://www.vinted.fr/items/7002", status: "sold", sold_at: new Date(Date.now() - 5 * 864e5).toISOString() },
    { vinted_id: 7003, title: "Sac bandoulière", price: 20, photo_url: "https://images1.vinted.net/t/s3.jpeg", url: "https://www.vinted.fr/items/7003", status: "sold", sold_at: new Date(Date.now() - 9 * 864e5).toISOString() },
  ],
  aliedge_report_items: 1,
  aliedge_items_to_check: [],
  aliedge_catalog: Array.from({ length: 8 }, (_, i) => ({
    product_id: `00000000-0000-0000-0000-00000000000${i}`, platform: ["aliexpress", "temu", "shein"][i % 3],
    url: "https://fr.aliexpress.com/item/1005006.html", title: ["Sac bandoulière cuir femme", "Robe longue satin", "Lunettes de soleil rétro", "Collier perles dorées", "Baskets plateforme blanches", "Chouchou satin lot de 6", "Sweat à capuche oversize", "Montre minimaliste"][i],
    image_url: "https://ae01.alicdn.com/kf/S1.jpg", price: [6.4, 9.9, 2.5, 1.9, 14, 1.2, 11, 4.8][i], category: ["Sacs", "Vêtements", "Lunettes", "Bijoux", "Chaussures", "Accessoires", "Vêtements", "Montres"][i],
    sold_7d: 9 - i, sold_30d: 30 - i * 3, sold_total: 42 - i * 4, active_count: 12 + i, median_sold_price: [21, 28, 12, 9, 35, 8, 30, 18][i], median_active_price: 22, last_sold_at: new Date(Date.now() - i * 36e5).toISOString(),
    est_margin: [14.6, 18.1, 9.5, 7.1, 21, 6.8, 19, 13.2][i], vinted_photos: ["https://images1.vinted.net/t/a.jpeg", "https://images1.vinted.net/t/b.jpeg"], analyses: 5 + i, locked: false, total_count: 8,
  })),
};

const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), `aliedge-profile-${Date.now()}`), {
  headless: true,
  channel: "chromium",
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  viewport: { width: 420, height: 900 },
});

await ctx.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const h = url.hostname;
  if (url.protocol === "chrome-extension:") return route.continue();
  if (h.endsWith("supabase.co")) {
    calls.push(url.pathname);
    if (url.pathname.startsWith("/auth/v1/token") || url.pathname.startsWith("/auth/v1/signup")) return route.fulfill({ json: { access_token: "jwt", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "membre@example.com" } } });
    const name = url.pathname.split("/rpc/")[1];
    if (name && name in rpc) return route.fulfill({ json: rpc[name] });
    if (url.pathname.includes("/rest/v1/aliedge_saved")) return route.fulfill({ json: [] });
    if (url.pathname.includes("/rest/v1/app_settings")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: "not mocked" } });
  }
  if (/vinted\.(fr|be|de)$/.test(h)) {
    if (url.pathname.startsWith("/api/v2/catalog/items")) return route.fulfill({ json: { items: catalogItems, pagination: { total_entries: 214 } } });
    if (url.pathname.startsWith("/items/")) return route.fulfill({ contentType: "text/html", body: fx("vinted-item.html") });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Vinted</title>" });
  }
  if (h.endsWith("aliexpress.com")) return route.fulfill({ contentType: "text/html", body: fx("ali.html") });
  if (/alicdn|vinted\.net|kwcdn|ltwebstatic/.test(h)) return route.fulfill({ contentType: "image/png", body: PNG });
  return route.fulfill({ status: 204, body: "" });
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;
const app = (hash, tab = true) => `chrome-extension://${extId}/app/app.html${tab ? "?mode=tab" : ""}#${hash}`;
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`); };

// 1. Écran de compte (déconnecté) puis connexion
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(app("/compte"));
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/1-compte.png`, fullPage: true });
const email = page.locator('input[type="email"]').first();
check("formulaire de connexion affiché", (await email.count()) > 0);
if (await email.count()) {
  await page.locator("main button", { hasText: "Se connecter" }).first().click();
  await page.waitForTimeout(200);
  await email.fill("membre@example.com");
  await page.locator('input[type="password"]').first().fill("motdepasse123");
  await page.locator('form button[type="submit"], form .btn.primary').first().click();
  await page.waitForFunction(() => document.querySelector("#plan")?.textContent?.includes("Pro"), null, { timeout: 15000 }).catch(() => {});
}
await page.screenshot({ path: `${shots}/2-compte-connecte.png`, fullPage: true });
check("connecté en Pro", (await page.locator("#plan").textContent())?.includes("Pro") ?? false, await page.locator("#plan").textContent());

// 2. Analyse depuis une fiche AliExpress (panneau attaché à l'onglet produit)
const product = await ctx.newPage();
await product.goto("https://fr.aliexpress.com/item/1005006.html");
await product.waitForTimeout(1500);
check("bouton flottant sur la fiche produit", (await product.locator("div[style*='2147483646']").count()) > 0);
await product.screenshot({ path: `${shots}/3-fiche-ali.png` });
const extractSrc = readFileSync(path.join(root, "src/lib/extract.js"), "utf8").match(/export function extractProduct\(\) \{[\s\S]*?\n\}/)[0].replace("export ", "");
const extracted = await product.evaluate((src) => (0, eval)(`(${src.replace("function extractProduct", "function")})`)(), extractSrc);
check("lecture de la fiche AliExpress", extracted.title?.startsWith("Sac bandoulière") && extracted.priceText === "6,40 €" && extracted.images.length >= 2, JSON.stringify({ t: extracted.title, p: extracted.priceText, n: extracted.images.length }));

await product.bringToFront();
const panel = await ctx.newPage();
await panel.goto(app("/analyse", false));
await product.bringToFront();
await panel.evaluate(() => chrome.runtime.sendMessage({ type: "tab:changed" }).catch(() => {}));
await panel.waitForSelector(".product h3", { timeout: 10000 }).catch(() => {});
await panel.screenshot({ path: `${shots}/4-panneau-produit.png`, fullPage: true });
const hasProduct = (await panel.locator(".product h3").count()) > 0;
check("panneau : produit détecté", hasProduct, hasProduct ? await panel.locator(".product h3").textContent() : await panel.locator("main").innerText());
if (!hasProduct) await panel.fill("#query", "sac bandouliere cuir");
await panel.click("#go");
await panel.waitForSelector(".ticket, .notice.err", { timeout: 30000 });
await panel.waitForTimeout(1200);
await panel.screenshot({ path: `${shots}/5-resultat.png`, fullPage: true });
const margin = await panel.locator(".ticket .big").textContent().catch(() => null);
check("analyse : marge calculée", !!margin && /€/.test(margin), margin ?? (await panel.locator(".notice").first().textContent()));
check("analyse : ventes constatées affichées", (await panel.locator(".badge-sold").count()) === 3);
const link = await panel.locator('a[title^="Créer des photos"]').getAttribute("href");
check("lien Barapics avec photos importées", /#import=/.test(link || ""), (link || "").slice(0, 80));
check("analyse partagée au catalogue", calls.includes("/rest/v1/rpc/aliedge_contribute"));

// 3. Catalogue
await page.goto(app("/catalogue"));
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Sac bandoulière cuir femme"), null, { timeout: 10000 }).catch(() => {});
await page.screenshot({ path: `${shots}/6-catalogue.png`, fullPage: true });
check("catalogue affiché", (await page.locator("main").innerText()).includes("Sac bandoulière cuir femme"));
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/7-catalogue-large.png`, fullPage: true });

// 4. Suivis
await page.goto(app("/suivis"));
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/8-suivis.png`, fullPage: true });

// 5. Page d'une annonce Vinted vendue
const v = await ctx.newPage();
await v.goto("https://www.vinted.fr/items/9000-sac-bandouliere");
await v.waitForSelector("#aliedge-source", { timeout: 10000, state: "attached" }).catch(() => {});
await v.waitForTimeout(1500);
check("bouton « Trouver le fournisseur » sur Vinted", (await v.locator("#aliedge-source").count()) === 1);
check("vente signalée au catalogue", calls.filter((c) => c.endsWith("aliedge_report_items")).length >= 1);
await v.screenshot({ path: `${shots}/9-vinted.png` });

await ctx.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications OK · captures : ${shots}`);
process.exit(failed.length ? 1 : 0);
