// Test de bout en bout de l'extension dans Chromium, avec Vinted, AliExpress et le serveur simulés.
// Usage : node tests/e2e.mjs [dossier-captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || path.join(os.tmpdir(), "aliedge-shots");
mkdirSync(shots, { recursive: true });
const fx = (f) => readFileSync(path.join(root, "tests/fixtures", f), "utf8");
const storeImages = process.env.STORE_IMAGES ? readdirSync(process.env.STORE_IMAGES).filter((f) => /\.jpe?g$/i.test(f)).map((f) => path.join(process.env.STORE_IMAGES, f)) : [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8sPL/fwAH/wNMkQ+HXQAAAABJRU5ErkJggg==", "base64");

const titles = ["Sac bandoulière cuir noir", "Petit sac à main cuir femme", "Sac bandoulière simili cuir", "Sac cuir femme neuf", "Sac à main bandoulière noir", "Sac bandoulière cuir camel", "Sac cuir bandoulière beige", "Pochette bandoulière cuir", "Sac main cuir PU noir", "Robe longue satin"];
const prices = [22, 18, 19.5, 25, 20, 21, 17, 15, 23, 30];
const catalogItems = titles.map((t, i) => ({ id: 9000 + i, title: t, price: { amount: String(prices[i]), currency_code: "EUR" }, brand_title: i % 3 ? "Sans marque" : "Zara", size_title: "Taille unique", status: "Neuf avec étiquette", favourite_count: 4 + i, photo: { url: `https://images1.vinted.net/t/${i}.jpeg` }, url: `https://www.vinted.fr/items/${9000 + i}-sac` }));

const calls = [];
const startedAt = Date.now();
let radarCalls = 0;
const barapicsCalls = [];
const rpc = {
  aliedge_me: { pro: true, free_launch: true, contributed: 7, admin: false, skool: true, email: "membre@example.com", source: "skool", expires_at: new Date(Date.now() + 20 * 864e5).toISOString(), used_today: 3, daily_limit: 500 },
  aliedge_start_analysis: { allowed: true, used: 4, limit: 500, pro: true },
  aliedge_contribute: "c3f50103-f4a4-414b-b502-74634864fe06",
  aliedge_product_items: [
    { vinted_id: 7001, title: "Sac bandoulière cuir noir", price: 21, photo_url: "https://images1.vinted.net/t/s1.jpeg", url: "https://www.vinted.fr/items/7001", status: "sold", sold_at: new Date(Date.now() - 2 * 864e5).toISOString() },
    { vinted_id: 7002, title: "Sac cuir femme", price: 19, photo_url: "https://images1.vinted.net/t/s2.jpeg", url: "https://www.vinted.fr/items/7002", status: "sold", sold_at: new Date(Date.now() - 5 * 864e5).toISOString() },
    { vinted_id: 7003, title: "Sac bandoulière", price: 20, photo_url: "https://images1.vinted.net/t/s3.jpeg", url: "https://www.vinted.fr/items/7003", status: "sold", sold_at: new Date(Date.now() - 9 * 864e5).toISOString() },
  ],
  aliedge_report_items: 1,
  aliedge_report_wardrobe: { updated: 2, sold: 1, tracked: true },
  aliedge_tracker_add: "00000000-0000-0000-0000-0000000000aa",
  aliedge_tracker_remove: true,
  aliedge_trackers: [{ id: "00000000-0000-0000-0000-0000000000aa", seller_id: 555, market: "fr", label: "vendeuse", created_at: new Date(Date.now() - 2 * 864e5).toISOString(), expires_at: new Date(Date.now() + 12 * 864e5).toISOString(), last_checked_at: new Date(Date.now() - 18e5).toISOString(), active_count: 3, sold_count: 2, sold_amount: 41, last_sold_at: new Date().toISOString() }],
  aliedge_tracker_items: [
    { vinted_id: 9000, title: "Sac bandoulière cuir noir", price: 21, photo_url: "https://images1.vinted.net/t/0.jpeg", url: "https://www.vinted.fr/items/9000-sac", status: "sold", first_seen_at: new Date(Date.now() - 2 * 864e5).toISOString(), sold_at: new Date(Date.now() - 36e5).toISOString(), favourites: 4 },
    { vinted_id: 9001, title: "Petit sac à main cuir femme", price: 18, photo_url: "https://images1.vinted.net/t/1.jpeg", url: "https://www.vinted.fr/items/9001-sac", status: "active", first_seen_at: new Date(Date.now() - 864e5).toISOString(), sold_at: null, favourites: 5 },
  ],
  aliedge_seen_products: 1,
  aliedge_picks_feed: { member: true, picks: [{ id: "p1", kind: "video", title: "Analyse : le compte qui vend 40 sacs par semaine", note: "Regarde sa stratégie de prix.", url: "https://www.skool.com/vinteddrop/v1", image_url: null, created_at: new Date().toISOString(), locked: false }, { id: "p2", kind: "product", title: "Sac seau tressé", note: null, url: "https://fr.aliexpress.com/item/1005006.html", image_url: "https://ae01.alicdn.com/kf/apres-sac-bandouliere.jpg", created_at: new Date().toISOString(), locked: false }] },
  aliedge_skool_challenge: { installed: 37, goal: 50 },
  aliedge_market_trends: { days: 30, sold: 42, median_days_to_sell: 3.5, categories: [{ name: "Sacs", sold: 18, median_price: 21 }, { name: "Bijoux", sold: 9, median_price: 9 }], brands: [{ name: "Sans marque", sold: 25, median_price: 15 }], hours: [{ dow: 7, hour: 19, sold: 6 }, { dow: 3, hour: 12, sold: 2 }] },
  aliedge_product_history: { prices: [{ at: "2026-10-01", price: 6.9 }, { at: "2026-10-20", price: 6.4 }], weeks: [{ week: "2026-10-05", sold: 2, median_price: 20 }, { week: "2026-10-12", sold: 5, median_price: 21 }] },
  aliedge_products_to_refresh: [],
  aliedge_refresh: 0,
  aliedge_sellers_to_check: [],
  aliedge_public_stats: { products: 1280, items: 15400, sold: 3120, sold_7d: 410, contributors: 96 },
  aliedge_items_to_check: [],
  aliedge_catalog: Array.from({ length: 8 }, (_, i) => ({
    product_id: `00000000-0000-0000-0000-00000000000${i}`, platform: ["aliexpress", "temu", "shein"][i % 3],
    url: "https://fr.aliexpress.com/item/1005006.html", title: ["Sac bandoulière cuir femme", "Robe longue satin", "Lunettes de soleil rétro", "Collier perles dorées", "Baskets plateforme blanches", "Chouchou satin lot de 6", "Sweat à capuche oversize", "Montre minimaliste"][i],
    image_url: `https://ae01.alicdn.com/kf/${["apres-sac-bandouliere", "apres-robe", "apres-lunettes", "apres-collier", "apres-baskets", "apres-casquette", "apres-sweat", "apres-montre"][i]}.jpg`, price: [6.4, 9.9, 2.5, 1.9, 14, 1.2, 11, 4.8][i], category: ["Sacs", "Vêtements", "Lunettes", "Bijoux", "Chaussures", "Accessoires", "Vêtements", "Montres"][i],
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
    if (url.pathname.startsWith("/api/v2/catalog/items") && url.searchParams.get("order") === "newest_first") {
      radarCalls++;
      return route.fulfill({ json: { items: radarCalls === 1 ? catalogItems.slice(2) : catalogItems, pagination: { total_entries: 10 } } });
    }
    const det = url.pathname.match(/^\/api\/v2\/items\/(\d+)(\/details)?$/);
    if (det) { const it = catalogItems.find((x) => String(x.id) === det[1]) || catalogItems[0]; return route.fulfill({ json: { item: { ...it, is_closed: det[1] === "9000", item_closing_action: det[1] === "9000" ? "sold" : null } } }); }
    if (url.pathname.startsWith("/api/v2/catalog/items")) return route.fulfill({ json: { items: catalogItems, pagination: { total_entries: 214 } } });
    if (/^\/api\/v2\/users\/\d+\/items/.test(url.pathname)) return route.fulfill({ json: { items: catalogItems.slice(0, 4).map((it, i) => ({ ...it, is_closed: i === 0, item_closing_action: i === 0 ? "sold" : null })) } });
    if (url.pathname.startsWith("/member/")) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Profil | Vinted</title><h1>vendeuse</h1>" });
    if (url.pathname.startsWith("/items/")) return route.fulfill({ contentType: "text/html", body: fx("vinted-item.html") });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Vinted</title>" });
  }
  if (h.endsWith("aliexpress.com") && url.pathname.startsWith("/w/wholesale")) {
    const cards = ["Sac seau cuir tressé femme", "Lunettes de soleil oeil de chat", "Collier chaîne dorée fine", "Casquette brodée vintage", "Pochette téléphone bandoulière"]
      .map((t, i) => `<div class="card"><a href="https://fr.aliexpress.com/item/100500700${i}.html?spm=x"><img src="https://ae01.alicdn.com/kf/L${i}.jpg" alt="${t}"><h3>${t}</h3></a><div class="price">${(3.5 + i).toFixed(2).replace(".", ",")} €</div></div>`).join("");
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Recherche</title><main>${cards}</main>` });
  }
  if (h.endsWith("aliexpress.com")) return route.fulfill({ contentType: "text/html", body: fx("ali.html") });
  if (h === "barapics.com" && url.pathname === "/api/public/aliedge-photos") {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const body = JSON.parse(req.postData() || "{}");
    barapicsCalls.push(body.action);
    if (body.action === "credits") return route.fulfill({ headers: cors, json: { remaining: 12, unlimited: false, plan: "pro", planLabel: "Pro" } });
    if (body.action === "alerts:get") return route.fulfill({ headers: cors, json: { discord: true, telegram: false, telegramAvailable: true, shareSkool: false, skoolAvailable: true } });
    if (body.action === "alerts:set") return route.fulfill({ headers: cors, json: { ok: true } });
    if (body.action === "alerts:send") return route.fulfill({ headers: cors, json: { ok: true, discord: true, telegram: false, skool: false } });
    if (body.action === "listing") return route.fulfill({ headers: cors, json: { title: "Sac bandoulière cuir noir femme", description: "Joli sac neuf.", category: "Femmes > Sacs > Sacs à bandoulière", brand: "Sans marque", condition: "Neuf sans étiquette", size: "Taille unique", colors: ["Noir"], material: "Cuir synthétique", parcel: "Petit", price: 19, priceReason: "Prix médian des ventes constatées.", hashtags: ["sac", "cuir"], market: null, supplierPrice: 6.4, margin: 12.6 } });
    if (body.action === "keywords") return route.fulfill({ headers: cors, json: { queries: ["sac bandoulière noir", "petit sac cuir femme"] } });
    if (body.action === "match") return route.fulfill({ headers: cors, json: { scores: Object.fromEntries(body.candidates.slice(0, 4).map((c) => [c.id, 0.9])) } });
    if (body.action === "brief") return route.fulfill({ headers: cors, json: { category: "sac", title: "Sac", colors: ["noir"], materials: ["cuir PU"], keyDetails: [], textAndLogos: [], parts: "1 sac", scale: "25 cm", texture: "grain fin" } });
    await new Promise((r) => setTimeout(r, 400));
    return route.fulfill({ headers: cors, json: { id: `p-${body.sceneId}`, url: "https://barapics.com/mock.png", attempts: 1, qualityReport: null } });
  }
  if (h === "barapics.com" && url.pathname === "/mock.png") return route.fulfill({ contentType: "image/png", body: PNG });
  if (/alicdn|vinted\.net|kwcdn|ltwebstatic/.test(h)) {
    // Captures du store : de vraies photos (STORE_IMAGES = dossier de JPG) au lieu d'un pixel.
    if (storeImages.length) {
      const named = storeImages.find((f) => path.basename(f) === path.basename(url.pathname));
      if (named) return route.fulfill({ contentType: "image/jpeg", body: readFileSync(named) });
      const key = [...url.pathname].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
      return route.fulfill({ contentType: "image/jpeg", body: readFileSync(storeImages[key % storeImages.length]) });
    }
    return route.fulfill({ contentType: "image/png", body: PNG });
  }
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
  await page.waitForFunction(() => /Pro|Accès complet/.test(document.querySelector("#plan")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
}
await page.screenshot({ path: `${shots}/2-compte-connecte.png`, fullPage: true });
check("connecté avec l'accès complet", /Pro|Accès complet/.test((await page.locator("#plan").textContent()) || ""), await page.locator("#plan").textContent());

// 1b. Prise en main au premier lancement : pays, analyse d'exemple, Radar
await page.waitForSelector(".onboard", { timeout: 8000 }).catch(() => {});
check("prise en main affichée au premier lancement", (await page.locator(".onboard").count()) === 1);
await page.screenshot({ path: `${shots}/2b-bienvenue-1.png`, fullPage: true });
await page.click('[data-next="2"]').catch(() => {});
await page.waitForSelector("#ob-run", { timeout: 5000 }).catch(() => {});
await page.click("#ob-run").catch(() => {});
await page.waitForSelector("#ob-result .ticket, #ob-result .notice", { timeout: 20000 }).catch(() => {});
check("prise en main : analyse d'exemple", (await page.locator("#ob-result .ticket").count()) === 1, await page.locator("#ob-result").innerText().catch(() => ""));
await page.screenshot({ path: `${shots}/2c-bienvenue-2.png`, fullPage: true });
await page.click('[data-next="3"]').catch(() => {});
await page.waitForSelector("[data-done]", { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `${shots}/2d-bienvenue-3.png`, fullPage: true });
await page.click("[data-done]").catch(() => {});
await page.waitForTimeout(500);
check("prise en main terminée", await page.evaluate(async () => !!(await chrome.storage.local.get("ae_onboarded")).ae_onboarded));

// 1c. Mise à jour : bandeau « Nouvelle version prête » puis nouveautés
await page.evaluate(() => chrome.storage.local.set({ ae_update_ready: { version: "9.9.9", at: Date.now() } }));
await page.goto(app("/catalogue"));
await page.waitForSelector(".update-banner.ready", { timeout: 6000 }).catch(() => {});
check("mise à jour : bandeau pour installer la nouvelle version", (await page.locator('.update-banner.ready [data-update="apply"]').count()) === 1);
await page.evaluate(() => chrome.storage.local.set({ ae_update_ready: null, ae_whatsnew: { version: "3.2.0", notes: "Radar et alertes sur téléphone.", at: Date.now() } }));
await page.reload();
await page.waitForFunction(() => /Radar/.test(document.querySelector(".update-banner")?.textContent || ""), null, { timeout: 6000 }).catch(() => {});
await page.waitForSelector(".update-banner", { timeout: 6000 }).catch(() => {});
const wn = await page.locator(".update-banner").innerText().catch(() => "");
await page.click('[data-update="seen"]').catch(() => {});
await page.waitForTimeout(300);
check("mise à jour : nouveautés affichées une fois", /Radar/.test(wn) && !(await page.evaluate(async () => (await chrome.storage.local.get("ae_whatsnew")).ae_whatsnew)), wn.slice(0, 60));

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
await panel.evaluate(() => chrome.storage.local.set({ review: { analyses: 2 } }));
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
check("analyse : recherche par image", (await panel.locator(".badge-photo").count()) >= 1 && barapicsCalls.includes("match"), `${await panel.locator(".badge-photo").count()} badge(s)`);
check("analyse : ventes constatées affichées", (await panel.locator(".badge-sold").count()) === 3);
check("analyse partagée au catalogue", calls.includes("/rest/v1/rpc/aliedge_contribute"));
await panel.waitForSelector("#review-ask", { timeout: 6000 }).catch(() => {});
check("demande d'avis après la 3e analyse", (await panel.locator("#review-ask").count()) === 1);
await panel.screenshot({ path: `${shots}/5b-avis.png` });
await panel.click("#review-later").catch(() => {});

// 2b. Photos Barapics créées depuis le panneau AliEdge (API Barapics)
await panel.click('[data-act="photos"]');
await panel.waitForFunction(() => /disponible/.test(document.querySelector("#pcredits")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
check("photos Barapics : solde affiché dans AliEdge", /12 photos disponibles/.test((await panel.locator("#pcredits").textContent().catch(() => "")) || ""));
await panel.click("#pgo");
await panel.waitForFunction(() => document.querySelectorAll(".pshot.done").length === 4, null, { timeout: 20000 }).catch(() => {});
await panel.screenshot({ path: `${shots}/5c-photos.png`, fullPage: true });
check("photos Barapics : 4 photos créées depuis AliEdge", (await panel.locator(".pshot.done").count()) === 4, barapicsCalls.join(","));
await panel.keyboard.press("Escape");

// 2c. Annonce complète rédigée par Barapics depuis AliEdge
await panel.click('[data-act="copy"]');
await panel.waitForSelector(".drawer.listing .ticket", { timeout: 8000 }).catch(() => {});
check("annonce complète : prix conseillé et champs à copier", (await panel.locator(".drawer.listing .lfield").count()) >= 4, await panel.locator(".drawer.listing .big").textContent().catch(() => ""));
await panel.screenshot({ path: `${shots}/5d-annonce.png`, fullPage: true });
await panel.keyboard.press("Escape");

// 3. Catalogue
await page.goto(app("/catalogue"));
await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Sac bandoulière cuir femme"), null, { timeout: 10000 }).catch(() => {});
await page.screenshot({ path: `${shots}/6-catalogue.png`, fullPage: true });
check("catalogue affiché", (await page.locator("main").innerText()).includes("Sac bandoulière cuir femme"));
await page.waitForSelector(".pick", { timeout: 6000 }).catch(() => {});
check("sélection VintedDrop et défi Skool", (await page.locator(".pick").count()) === 2 && /37 \/ 50/.test(await page.locator(".challenge").innerText().catch(() => "")));
await page.click("#trends summary").catch(() => {});
await page.waitForSelector(".trend-list li", { timeout: 6000 }).catch(() => {});
check("tendances du marché : catégories et créneaux", (await page.locator(".trend-list li").count()) >= 3 && (await page.locator(".heat .hc").count()) === 56);
await page.locator("[data-pid]").first().click().catch(() => {});
await page.waitForSelector("#dhistory .wk", { timeout: 6000 }).catch(() => {});
check("historique du produit : ventes par semaine", (await page.locator("#dhistory .wk").count()) === 2);
await page.screenshot({ path: `${shots}/6b-tendances.png`, fullPage: true });
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/7-catalogue-large.png`, fullPage: true });

// 3a. Ajout des produits d'une page de résultats AliExpress au catalogue
const listing = await ctx.newPage();
await listing.goto("https://fr.aliexpress.com/w/wholesale-sac.html");
await listing.bringToFront();
const before = calls.filter((c) => c.endsWith("aliedge_seen_products")).length;
const imported = await page.evaluate(() => chrome.runtime.sendMessage({ type: "catalog:importPage" }));
check("catalogue : produits d'une page de résultats ajoutés", imported?.ok && imported.data.found === 5 && calls.filter((c) => c.endsWith("aliedge_seen_products")).length > before, JSON.stringify(imported));
await listing.close();

// 3a bis. Ajout d'annonces Vinted par leur lien
const imp = await page.evaluate(() => chrome.runtime.sendMessage({ type: "catalog:importVinted", links: "https://www.vinted.fr/items/9000-sac\nhttps://www.vinted.fr/items/9001-sac" }));
check("catalogue : annonces Vinted ajoutées par lien", imp?.ok && imp.data.added === 2, JSON.stringify(imp));

// 3b. Radar : un filtre, puis de nouvelles annonces détectées
await page.goto(app("/radar"));
await page.waitForSelector("#radarform", { timeout: 8000 }).catch(() => {});
await page.fill('#radarform input[name="query"]', "sac bandoulière cuir").catch(() => {});
await page.fill('#radarform input[name="priceMax"]', "25").catch(() => {});
await page.click('#radarform button[type="submit"]').catch(() => {});
await page.waitForSelector(".radar-filter", { timeout: 8000 }).catch(() => {});
check("radar : filtre enregistré", (await page.locator(".radar-filter").count()) === 1);
await page.waitForSelector("#alertsbody .alert-row", { timeout: 6000 }).catch(() => {});
check("radar : réglages des alertes téléphone", (await page.locator("#alertsbody .alert-row").count()) === 2 && barapicsCalls.includes("alerts:get"));
await page.waitForTimeout(1500);
await page.evaluate(() => chrome.runtime.sendMessage({ type: "radar:tick" }));
await page.goto(app("/radar"));
await page.waitForSelector(".radar-item", { timeout: 8000 }).catch(() => {});
check("radar : nouvelles annonces dans le flux", (await page.locator(".radar-item").count()) === 2, `${await page.locator(".radar-item").count()} annonce(s)`);
check("radar : alerte envoyée sur le téléphone", barapicsCalls.includes("alerts:send"));
await page.screenshot({ path: `${shots}/7b-radar.png`, fullPage: true });

// 4. Suivis : trackers de vendeurs
await page.goto(app("/suivis"));
await page.waitForSelector(".tracker", { timeout: 8000 }).catch(() => {});
check("tracker de vendeur affiché dans Suivis", (await page.locator(".tracker").count()) === 1);
await page.locator("[data-tracker]").first().click().catch(() => {});
await page.waitForSelector(".tracker-body .badge-sold", { timeout: 6000 }).catch(() => {});
check("ventes du vendeur suivi listées", (await page.locator(".tracker-body .badge-sold").count()) === 1);
await page.screenshot({ path: `${shots}/8-suivis.png`, fullPage: true });

// 5. Page d'une annonce Vinted vendue
const v = await ctx.newPage();
await v.goto("https://www.vinted.fr/items/9000-sac-bandouliere");
await v.waitForSelector("#aliedge-source", { timeout: 10000, state: "attached" }).catch(() => {});
await v.waitForTimeout(1500);
check("bouton « Trouver le fournisseur » sur Vinted", (await v.locator("#aliedge-source").count()) === 1);
check("vente signalée au catalogue", calls.filter((c) => c.endsWith("aliedge_report_items")).length >= 1);
await v.screenshot({ path: `${shots}/9-vinted.png` });

// 6. Profil d'un vendeur : son dressing met à jour le catalogue
const mbr = await ctx.newPage();
await mbr.goto("https://www.vinted.fr/member/555-vendeuse");
await mbr.waitForTimeout(3500);
check("dressing d'un vendeur envoyé au catalogue", calls.some((c) => c.endsWith("aliedge_report_wardrobe")));
const pillBox = await mbr.locator("div[style*='2147483646']").first().boundingBox().catch(() => null);
if (pillBox) await mbr.mouse.click(pillBox.x + pillBox.width / 2, pillBox.y + pillBox.height / 2);
await mbr.waitForTimeout(2500);
check("bouton « Suivre ses ventes » sur un profil Vinted", calls.some((c) => c.endsWith("aliedge_tracker_add")));
await mbr.screenshot({ path: `${shots}/10-profil.png` });
await mbr.waitForTimeout(Math.max(0, 25_000 - (Date.now() - startedAt)));
check("fiche fournisseur consultée enregistrée au catalogue", calls.some((c) => c.endsWith("aliedge_seen_products")));

// Captures pour la fiche Chrome Web Store (1280 × 800), seulement si STORE_SHOTS=1.
if (process.env.STORE_SHOTS) {
  const shotsDir = path.join(shots, "store");
  mkdirSync(shotsDir, { recursive: true });
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.goto(app("/analyse", false));
  await product.bringToFront();
  await panel.evaluate(() => chrome.runtime.sendMessage({ type: "tab:changed" }).catch(() => {}));
  await panel.waitForSelector(".product h3", { timeout: 10000 }).catch(() => {});
  await panel.click("#go").catch(() => {});
  await panel.waitForSelector(".ticket", { timeout: 30000 }).catch(() => {});
  await panel.waitForTimeout(1500);
  await panel.click("#review-later").catch(() => {});
  await panel.screenshot({ path: `${shotsDir}/1-analyse.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [hash, name, prep] of [
    ["/radar", "2-radar", async () => { await page.click("#phonealerts summary").catch(() => {}); }],
    ["/catalogue", "3-catalogue", async () => {}],
    ["/catalogue", "4-tendances", async () => { await page.click("#trends summary").catch(() => {}); await page.waitForSelector(".trend-list li", { timeout: 6000 }).catch(() => {}); await page.evaluate(() => document.getElementById("trends")?.scrollIntoView()); }],
    ["/suivis", "5-suivis", async () => { await page.locator("[data-tracker]").first().click().catch(() => {}); await page.waitForTimeout(1200); }],
  ]) {
    await page.goto(app(hash));
    await page.waitForTimeout(1800);
    await prep();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shotsDir}/${name}.png` });
  }
  console.log(`captures store : ${shotsDir}`);
}

await ctx.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications OK · captures : ${shots}`);
process.exit(failed.length ? 1 : 0);
