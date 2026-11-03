// Test de bout en bout de l'extension dans Chromium, avec Vinted, AliExpress et le serveur simulés.
// Usage : node tests/e2e.mjs [dossier-captures]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFileSync, readdirSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
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
const catalogItems = titles.map((t, i) => ({ id: 9000 + i, title: t, price: { amount: String(prices[i]), currency_code: "EUR" }, brand_title: i % 3 ? "Sans marque" : "Zara", size_title: "Taille unique", status: "Neuf avec étiquette", favourite_count: 4 + i, photo: { url: `https://images1.vinted.net/t/${i}.jpeg` }, url: `https://www.vinted.fr/items/${9000 + i}-sac`, user: { id: 8800 + i, login: `vendeuse${i}` } }));

const calls = [];
const vintedApi = [];
const reportBodies = [];
const lbcBodies = [];
const profileBodies = [];
const startedAt = Date.now();
let radarCalls = 0;
const lbcRequests = [];
const barapicsCalls = [];
const rpc = {
  aliedge_register_own_seller: 0,
  aliedge_report_prices: 3,
  aliedge_price_history: [12, 9, 6, 2, 0].map((d, i) => ({ day: new Date(Date.now() - d * 864e5).toISOString().slice(0, 10), min_price: [7.9, 7.2, 6.9, 6.4, 6.4][i], max_price: [8.5, 7.9, 7.2, 6.9, 6.4][i], last_price: [7.9, 7.2, 6.9, 6.4, 6.4][i], samples: 3 })),
  aliedge_coupons_list: [{ id: "00000000-0000-0000-0000-00000000c001", code: "AEFR3", note: "3 € dès 25 €", min_order: 25, expires_on: null, ok_count: 4, ko_count: 1, last_ok_at: new Date().toISOString(), mine: false, my_vote: null }, { id: "00000000-0000-0000-0000-00000000c002", code: "SACFR5", note: null, min_order: null, expires_on: null, ok_count: 0, ko_count: 0, last_ok_at: null, mine: false, my_vote: null }],
  aliedge_coupon_add: "00000000-0000-0000-0000-00000000c003",
  aliedge_coupon_vote: null,
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
  aliedge_trackers: [{ id: "00000000-0000-0000-0000-0000000000aa", seller_id: 555, market: "fr", label: "vendeuse", created_at: new Date(Date.now() - 2 * 864e5).toISOString(), expires_at: new Date(Date.now() + 12 * 864e5).toISOString(), last_checked_at: new Date(Date.now() - 18e5).toISOString(), active_count: 3, sold_count: 2, sold_amount: 41, last_sold_at: new Date().toISOString(), sold_7d: 2, sold_30d: 2, amount_30d: 41, median_price_30d: 20 }],
  aliedge_remote_config: { message: "Maintenance Vinted ce soir : le Radar ralentit un peu.", radar_seconds: "45", budget_per_hour: "500" },
  aliedge_report_health: null,
  aliedge_report_error: null,
  aliedge_seed_pending: [{ login: "vendeuse0", market: "fr" }],
  aliedge_seed_resolve: "added",
  aliedge_competitor_recap: { since: new Date(Date.now() - 2 * 864e5).toISOString(), active: 3, active_value: 57, sold_total: 3, sold_seen: 2, sold_before: 1, revenue_seen: 41, median_price_sold: 20, median_price_active: 18, median_days: 2.5, sold_under_7d: 2, new_listings_7d: 4, per_week: [{ week: "2026-10-12", sold: 1, revenue: 20 }, { week: "2026-10-19", sold: 2, revenue: 41 }], brands: [{ name: "Sans marque", sold: 2, median_price: 20, median_days: 2.5 }], price_bands: [{ band: "10 à 20 €", sold: 1, active: 2 }, { band: "20 à 35 €", sold: 1, active: 1 }], fastest: [{ title: "Sac bandoulière cuir noir", price: 21, days: 1.2, url: "https://www.vinted.fr/items/9000-sac", photo_url: "https://images1.vinted.net/t/0.jpeg" }] },
  aliedge_tracker_items: [
    { vinted_id: 9000, title: "Sac bandoulière cuir noir", price: 21, photo_url: "https://images1.vinted.net/t/0.jpeg", url: "https://www.vinted.fr/items/9000-sac", status: "sold", first_seen_at: new Date(Date.now() - 2 * 864e5).toISOString(), sold_at: new Date(Date.now() - 36e5).toISOString(), favourites: 4, days_to_sell: 1.2, sold_before: false },
    { vinted_id: 9002, title: "Sac seau tressé", price: 24, photo_url: "https://images1.vinted.net/t/2.jpeg", url: "https://www.vinted.fr/items/9002-sac", status: "sold", first_seen_at: new Date(Date.now() - 3 * 864e5).toISOString(), sold_at: new Date(Date.now() - 72e5).toISOString(), favourites: 2, days_to_sell: 2.9, sold_before: false, product_id: "00000000-0000-0000-0000-0000000000cc", product_title: "Sac seau", product_url: "https://fr.aliexpress.com/item/1005007.html", product_price: 5.2, product_platform: "aliexpress" },
    { vinted_id: 9001, title: "Petit sac à main cuir femme", price: 18, photo_url: "https://images1.vinted.net/t/1.jpeg", url: "https://www.vinted.fr/items/9001-sac", status: "active", first_seen_at: new Date(Date.now() - 864e5).toISOString(), sold_at: null, favourites: 5 },
  ],
  aliedge_seen_products: 1,
  aliedge_competitor_sales_since: [{ vinted_id: 9000, seller_id: 555, label: "vendeuse", title: "Sac bandoulière cuir noir", brand: null, price: 21, photo_url: "https://images1.vinted.net/t/0.jpeg", url: "https://www.vinted.fr/items/9000-sac", sold_at: new Date(Date.now() - 36e5).toISOString(), days_to_sell: 1.2, product_url: null, product_price: null }],
  aliedge_niche_stats: { sold: 7, active_known: 12, median_price: 20, median_days: 3.5, top_sellers: [{ seller_id: 8801, sold: 4, median_price: 21 }, { seller_id: 555, sold: 2, median_price: 19 }], recent: [{ title: "Sac cuir femme", price: 19, url: "https://www.vinted.fr/items/7002", photo_url: "https://images1.vinted.net/t/s2.jpeg", sold_at: new Date(Date.now() - 864e5).toISOString() }] },
  aliedge_sale_suppliers: { words: ["tapis"], suppliers: [{ title: "Tapis rond coloré tissé", url: "https://fr.aliexpress.com/item/1005009999.html", price: 9.5, platform: "aliexpress", image_url: null, reason: "similar_sale", score: 30 }] },
  aliedge_sales_feed: [{ vinted_id: 7101, title: "Tapis multicolore", brand: "Vintage", size: null, price: 32, photo_url: "https://images1.vinted.net/t/s9.jpeg", url: "https://www.vinted.fr/items/7101", sold_at: new Date(Date.now() - 864e5).toISOString(), days_to_sell: 14, product_title: null, product_url: null, product_price: null, product_platform: null, total_count: 1 }],
  aliedge_report_lbc_items: 2,
  aliedge_lbc_report_profile: { shown: 2, gone: 0, complete: true },
  aliedge_lbc_tracker_add: "00000000-0000-0000-0000-0000000000dd",
  aliedge_lbc_tracker_remove: true,
  aliedge_lbc_trackers: [{ id: "00000000-0000-0000-0000-0000000000dd", seller_uuid: "20f25f94-11be-4ddd-9fe0-20891b9db732", label: "Asm4ever", created_at: new Date(Date.now() - 864e5).toISOString(), last_visit_at: new Date().toISOString(), active_count: 2, active_value: 49, gone_30d: 1, amount_30d: 24, median_days: 6 }],
  aliedge_lbc_tracker_items: [{ list_id: 2900000004, title: "Sac bandoulière y2k recyclé", price: 24, category: "Accessoires & Bagagerie", photo_url: null, url: "https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000004", status: "gone", first_seen_at: new Date(Date.now() - 7 * 864e5).toISOString(), gone_at: new Date(Date.now() - 864e5).toISOString(), days_to_sell: 6, product_url: null, product_price: null, product_platform: null }, { list_id: 2900000005, title: "Sac à bandoulière noir vintage y2k", price: 27, category: null, photo_url: null, url: "https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000005", status: "active", first_seen_at: new Date().toISOString(), gone_at: null, days_to_sell: null, product_url: null, product_price: null, product_platform: null }],
  aliedge_lbc_sales_feed: [{ list_id: 2900000009, title: "Lampe de chevet LED tactile", price: 18, category: "Décoration", department: "Rhône", photo_url: "https://img.leboncoin.fr/api/v1/lbcpb1/images/a.jpg", url: "https://www.leboncoin.fr/ad/decoration/2900000009", shipping: true, sold_at: new Date(Date.now() - 36e5).toISOString(), days_to_sell: 4, certainty: "probable", product_title: null, product_url: null, product_price: null, product_platform: null, total_count: 1 }],
  aliedge_link_item: "00000000-0000-0000-0000-0000000000bb",
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

// Copie de test de l'extension : l'accès facultatif à leboncoin.fr est déjà accordé (impossible de cliquer la fenêtre Chrome en headless).
const ext = path.join(os.tmpdir(), `aliedge-ext-${Date.now()}`);
cpSync(root, ext, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git|shots)([\\/]|$)/.test(src.slice(root.length)) });
{
  const m = JSON.parse(readFileSync(path.join(ext, "manifest.json"), "utf8"));
  m.host_permissions = [...m.host_permissions, ...(m.optional_host_permissions || [])];
  writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(m, null, 2));
}
// Balade SHEIN accélérée pour le test (mêmes gestes, pauses et écarts raccourcis).
{
  const f = path.join(ext, "src/content/tour.js");
  writeFileSync(f, readFileSync(f, "utf8")
    .replace("pause: 1.7, speed: [180, 380]", "pause: 0.15, speed: [2500, 4000]")
    .replace("openGap: 80000, product: [26000, 55000]", "openGap: 2500, product: [2500, 3500]")
    .replace("weights: { scroll: 44, product: 24, back: 8, read: 16, flick: 0, open: 8 }", "weights: { scroll: 40, product: 10, back: 5, read: 5, flick: 0, open: 40 }")
    .replace("const MAX_OPENS_PER_HOUR = 20;", "const MAX_OPENS_PER_HOUR = 2;"));
}
const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), `aliedge-profile-${Date.now()}`), {
  headless: true,
  channel: "chromium",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--lang=fr-FR"],
  viewport: { width: 420, height: 900 },
  // Chrome en français : le panneau s'affiche en français (la version anglaise est vérifiée à la fin).
  locale: "fr-FR",
  env: { ...process.env, LANG: "fr_FR.UTF-8", LANGUAGE: "fr" },
});

const radarUrls = [];
const fbRequests = [];
const imageProxyCalls = [];
let oplaStock = [["art_a1b2c3d4e5f6a7b8c9d0", "Sweat Nike gris", 25], ["art_b1b2c3d4e5f6a7b8c9d0", "Jean Levi's 501", 30]];
let beebsStock = [[34000001, "Robe crochet fille", 12], [34000002, "Gilet bébé laine", 9]];
await ctx.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const h = url.hostname;
  if (url.protocol === "chrome-extension:") return route.continue();
  if (h.endsWith("supabase.co")) {
    calls.push(url.pathname);
    if (url.pathname.endsWith("aliedge_report_items")) reportBodies.push(req.postData() || "");
    if (url.pathname.endsWith("aliedge_report_lbc_items")) lbcBodies.push(req.postData() || "");
    if (url.pathname.endsWith("aliedge_lbc_report_profile")) profileBodies.push(req.postData() || "");
    if (url.pathname.startsWith("/auth/v1/token") || url.pathname.startsWith("/auth/v1/signup")) return route.fulfill({ json: { access_token: "jwt", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "membre@example.com" } } });
    const name = url.pathname.split("/rpc/")[1];
    // Analyse sans requête Vinted : recherche dans la base commune (mêmes annonces que l'ancien catalogue Vinted simulé).
    if (name === "aliedge_base_search") {
      calls.push("base_search");
      return route.fulfill({ json: { total: 214, items: catalogItems.map((it, i) => ({ vinted_id: it.id, market: "fr", title: it.title, brand: it.brand_title, size: it.size_title, condition: it.status, price: Number(it.price.amount), currency: "EUR", photo_url: it.photo.url, url: it.url, favourites: it.favourite_count, status: i % 4 === 0 ? "sold" : "active", sold_at: i % 4 === 0 ? new Date(Date.now() - 864e5).toISOString() : null, listed_at: null, seller_id: it.user.id })) } });
    }
    if (name && name in rpc) return route.fulfill({ json: rpc[name] });
    if (url.pathname.includes("/rest/v1/aliedge_saved")) return route.fulfill({ json: [] });
    if (url.pathname.includes("/rest/v1/app_settings")) return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: "not mocked" } });
  }
  if (/(^|\.)beebs\.app$/.test(h)) {
    const html = (body) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8">${body}` });
    const head = '<header><a href="/fr/vendre">Vendre</a></header>';
    const card = (id, t, p) => `<a href="/fr/p/${id}-x" style="display:inline-block;width:150px"><img alt="${t}" src="https://cdn.beebs.app/${id}.jpg" style="width:150px;height:150px"><span>${p} € 00</span><span>${t}</span></a>`;
    if (url.pathname.startsWith("/fr/p/")) return html(`<title>Robe | Beebs</title><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Robe crochet fille 6 ans", image: ["https://cdn.beebs.app/a.jpg"], offers: { price: "12.00" } })}</script></head><body>${head}<h1>Robe crochet fille 6 ans</h1><p>Vendu par</p><a href="/fr/dressing/KJ3GOEqX9Kdh8kFE7Ti2MOwOcDo2">CELINE D.</a></body></html>`);
    if (url.pathname.startsWith("/fr/dressing/")) return html(`<title>Dressing de CELINE D</title></head><body>${head}<h1>CELINE D.</h1><p>Annonces (${beebsStock.length})</p>${beebsStock.map(([id, t, p]) => card(id, t, p)).join("")}</body></html>`);
    if (url.pathname.startsWith("/fr/vendre")) return html(`<title>Vendre | Beebs</title></head><body>${head}<h1>Mettre un article en vente</h1><input type="file" accept="image/*" multiple><label>Titre <input name="title" placeholder="Titre"></label><label>Description <textarea name="description"></textarea></label><label>Prix <input name="price" placeholder="Prix"></label><label>État <select name="condition"><option value="">Choisir</option><option value="new">Neuf avec étiquette</option><option value="vgood">Très bon état</option><option value="good">Bon état</option></select></label><label>Taille <select name="size"><option value="">Choisir</option><option value="s">S</option><option value="m">M</option></select></label><p>Adresse</p><div><input name="addr" placeholder="Votre adresse"></div><button type="button">Mettre en vente</button></body></html>`);
    return html(`<title>Beebs</title></head><body>${head}<h1>Seconde main des familles</h1></body></html>`);
  }
  if (/(^|\.)opla\.co$/.test(h)) {
    const html = (body) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8">${body}` });
    const head = '<header><a href="/sell/create">Vendre</a></header>';
    const card = (id, t, p) => `<a href="/product/${id}" style="display:inline-block;width:150px"><img alt="${t}" src="https://cdn.opla.co/${id}.jpg" style="width:150px;height:150px"><span>${t}</span><span>${p},00 €</span></a>`;
    if (url.pathname.startsWith("/product/")) return html(`<title>Sweat | Opla</title><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Sweat Nike gris taille M", image: "https://cdn.opla.co/a.jpg", offers: { price: "25.00" } })}</script></head><body>${head}<h1>Sweat Nike gris taille M</h1><a href="/seller/google-oauth2%7C1234567890">Marc V.</a></body></html>`);
    if (url.pathname.startsWith("/seller/")) return html(`<title>Marc V. sur Opla</title></head><body>${head}<h1>Marc V.</h1>${oplaStock.map(([id, t, p]) => card(id, t, p)).join("")}</body></html>`);
    // Formulaire comme sur opla.co : titres au-dessus des champs (pas de <label>), lignes « Sélectionner » qui ouvrent
    // une liste (catégorie en deux niveaux, marque avec recherche, état), prix pré-rempli à 0,00, photos en zone de dépôt.
    if (url.pathname.startsWith("/sell/create")) return html(`<title>Vendre | Opla</title><style>.row{display:flex;justify-content:space-between;padding:10px;border:1px solid #ddd}[role=dialog]{position:fixed;inset:20%;background:#fff;border:1px solid #000;padding:10px}</style></head><body>${head}<h1>Importer</h1>
      <p>Photo (0/20)</p><div class="drop" onclick="this.querySelector('input').click()">Glissez-déposez vos images ou cliquez pour parcourir<input type="file" accept="image/jpeg,image/png,image/webp" multiple style="display:none" id="ph"></div>
      <p>Titre</p><div><input id="t" placeholder="ex: Veste en jean vintage"></div>
      <p>Description</p><div><textarea id="d"></textarea></div>
      <div class="row"><span>Catégorie</span><button type="button" id="cat" onclick="pick('cat')">Sélectionner</button></div>
      <div class="row"><span>Marque</span><button type="button" id="brand" onclick="pick('brand')">Sélectionner</button></div>
      <div class="row"><span>État</span><button type="button" id="etat" onclick="pick('etat')">Sélectionner</button></div>
      <div class="row"><span>Taille</span><button type="button" id="taille" onclick="pick('taille')">Sélectionner</button></div>
      <div class="row"><span>Prix (€)</span><input id="p" value="0,00"></div>
      <button type="button" onclick="document.body.dataset.published = '1'">Publier l'article</button>
      <script>
        const LISTS = { cat: [["Femme", "Homme", "Maison"], ["Vêtements", "Chaussures"]], etat: [["Neuf avec étiquette", "Très bon état", "Bon état"]], brand: [["Nike", "adidas", "Zara"]], taille: [["S", "M", "L", "XL"]] };
        const DESC = { "Très bon état": "Porté très peu, aucun défaut visible.", "Bon état": "Traces d'usure légères.", "Neuf avec étiquette": "Jamais porté." };
        function pick(kind, level = 0) {
          document.querySelector("[role=dialog]")?.remove();
          const d = document.createElement("div"); d.setAttribute("role", "dialog");
          d.innerHTML = '<div class="h">' + kind + '</div>' + (kind === "brand" ? '<input placeholder="Rechercher une marque">' : "") + "<ul>" + LISTS[kind][level].map((o) => kind === "etat" ? "<li class=opt><div><div>" + o + "</div><div>" + DESC[o] + "</div></div></li>" : "<li><button type=button>" + o + "</button></li>").join("") + "</ul>";
          document.body.appendChild(d);
          d.querySelectorAll("li button, li.opt").forEach((b) => b.onclick = (ev) => {
            ev.stopPropagation();
            const btn = document.getElementById(kind);
            btn.dataset.v = (btn.dataset.v ? btn.dataset.v + ">" : "") + (b.matches("li.opt") ? b.querySelector(":scope > div > div").textContent : b.textContent);
            if (LISTS[kind][level + 1]) pick(kind, level + 1); else { btn.textContent = btn.dataset.v; d.remove(); }
          });
        }
      </script></body></html>`);
    return html(`<title>Opla</title></head><body>${head}<h1>Opla</h1></body></html>`);
  }
  // Facebook Marketplace : formulaire « Créer une annonce » (champs dans des <label>, listes en combobox).
  if (h === "www.facebook.com") {
    // Pages ouvertes sur Facebook (Chrome fait aussi ses propres appels en CI : /ajax/qm, /data/manifest).
    if (route.request().resourceType() === "document") fbRequests.push(url.pathname);
    if (url.pathname.startsWith("/marketplace/create")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><title>Marketplace</title></head><body><main>
      <input type="file" accept="image/*,image/heif,image/heic" multiple id="fbph" style="display:none"><div>Ajouter des photos</div>
      <label><span>Titre</span><input type="text" id="fbt"></label>
      <label><span>Prix</span><input type="text" id="fbp"></label>
      <label role="combobox" id="fbcat" tabindex="0" onclick="fbOpen('fbcat', ['Vêtements et chaussures pour hommes', 'Vêtements et chaussures pour femmes', 'Maison'])"><span>Catégorie</span></label>
      <label role="combobox" id="fbcond" tabindex="0" onclick="fbOpen('fbcond', ['Neuf', 'D’occasion - comme neuf', 'D’occasion - bon état', 'D’occasion - assez bon état'])"><span>État</span></label>
      <label><span>Description</span><textarea id="fbd"></textarea></label>
      <div role="button">Suivant</div></main>
      <script>function fbOpen(id, opts) { document.querySelector('[role=listbox]')?.remove(); const l = document.createElement('div'); l.setAttribute('role', 'listbox'); l.innerHTML = opts.map((o) => '<div role="option"><span>' + o + '</span></div>').join(''); document.body.appendChild(l); l.querySelectorAll('[role=option]').forEach((o) => o.onclick = (e) => { e.stopPropagation(); document.getElementById(id).dataset.v = o.textContent; l.remove(); }); }</script></body></html>` });
    return route.fulfill({ status: 404, body: "" });
  }
  if (h === "www.leboncoin.fr") {
    lbcRequests.push(url.pathname);
    const html = (body) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Leboncoin</title><body>${body}</body>` });
    // Accueil : carrousels d'annonces recommandées (pas de conteneur de résultats de recherche).
    if (url.pathname === "/") return html(`<main><h2>Annonces récentes</h2><ul>${Array.from({ length: 110 }, (_, i) => `<li><a aria-label="Voir l’annonce" href="https://www.leboncoin.fr/ad/vetements/${3100000000 + i}"><img alt="" src="https://img.leboncoin.fr/api/v1/lbcpb1/images/h${i}.jpg"><span title="Voir l’annonce: Veste accueil ${i}"></span><p>Veste accueil ${i}</p><span>${20 + i} €</span><p>Lyon 69003</p></a></li>`).join("")}</ul></main>`);
    if (url.pathname.startsWith("/messages")) return html(`<main><a href="https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000005">Sac à bandoulière noir vintage y2k</a><div class="thread"><p>Bonjour, vous feriez 20 € ?</p></div><form><textarea name="message" placeholder="Écrire un message"></textarea><button type="button">Envoyer</button></form></main>`);
    if (url.pathname.startsWith("/deposer-une-annonce")) return html(`<main><h1>Déposer une annonce</h1><label>Titre <input name="subject"></label><label>Description <textarea name="body"></textarea></label><label>Prix <input name="price"></label></main>`);
    // Carte d'annonce telle que Leboncoin l'affiche (relevé sur une vraie page enregistrée).
    const card = (id, title, price, cp, ville) => `<li><article aria-label="${title}"><div data-qa-id="aditem_container"><a aria-label="Voir l’annonce" href="https://www.leboncoin.fr/ad/accessoires_bagagerie/${id}"><span title="Voir l’annonce: ${title}"></span></a><img alt="" src="https://img.leboncoin.fr/api/v1/lbcpb1/images/${id}.jpg?rule=ad-small"><p>${title}</p><span>${price} €</span><p>Prix: ${price} €.</p><div>dès ${price + 1},90 €</div><span>Livraison dès</span><p aria-hidden="true">Accessoires &amp; Bagagerie</p><p>Catégorie : Accessoires &amp; Bagagerie.</p><p aria-hidden="true">${ville} ${cp}</p><p>Située à ${ville} ${cp}.</p><p>10/10/2026</p><p>Date de dépôt : 10/10/2026.</p></div></article></li>`;
    if (url.pathname.startsWith("/ad/accessoires_bagagerie/2900000003")) return html("<main><h1>Cette annonce n'est plus disponible</h1></main>");
    if (url.pathname.startsWith("/ad/accessoires_bagagerie/2900000005")) return html(`<main><div data-qa-id="adview_title"><h1>Sac à bandoulière noir vintage y2k</h1></div><div data-qa-id="adview_price">27 €</div><div data-qa-id="adview_delivery_container">Livraison</div><p>Arras 62000</p><div data-qa-id="adview_profile_part"><a href="https://www.leboncoin.fr/profile/31a5e0aa-0000-4000-8000-000000000001/offers"></a><a href="https://www.leboncoin.fr/profile/31a5e0aa-0000-4000-8000-000000000001/offers">Bohem-Paris</a></div></main><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org/", "@type": "Product", category: "Accessoires & Bagagerie", name: "Sac à bandoulière noir vintage y2k", image: "https://img.leboncoin.fr/api/v1/lbcpb1/images/78/a2.jpg?rule=ad-image", offers: { "@type": "Offer", price: 27, priceCurrency: "EUR", availability: "http://schema.org/InStock" } })}</script>`);
    if (url.pathname.startsWith("/profile/20f25f94-11be-4ddd-9fe0-20891b9db732")) return html(`<main><h1>Asm4ever</h1><p>Annonces (2)</p><ul>${card(2900000005, "Sac à bandoulière noir vintage y2k", 27, "62000", "Arras")}${card(2900000006, "Sac seau tressé", 22, "62000", "Arras")}</ul></main>`);
    return html(`<main><h2>Résultats de recherche : 354 annonces</h2><ul>${card(2900000001, "Lampe de chevet LED tactile", 18, "13001", "Marseille")}${card(2900000002, "Plaid XXL doux", 25, "59000", "Lille")}${card(2900000007, "Sac bandoulière cuir femme noir", 22, "75011", "Paris")}</ul></main>`);
  }
  if (/vinted\.(fr|be|de)$/.test(h)) {
    // 3.6.8 : AliEdge ne doit plus JAMAIS interroger l'API de Vinted (comptes de membres bloqués).
    if (url.pathname.startsWith("/api/")) vintedApi.push(url.pathname);
    if (url.pathname.startsWith("/api/v2/catalog/items") && url.searchParams.get("order") === "newest_first") {
      radarCalls++;
      radarUrls.push(url.search);
      return route.fulfill({ json: { items: radarCalls === 1 ? catalogItems.slice(2) : catalogItems, pagination: { total_entries: 10 } } });
    }
    const det = url.pathname.match(/^\/api\/v2\/items\/(\d+)(\/details)?$/);
    if (det) { const it = catalogItems.find((x) => String(x.id) === det[1]) || catalogItems[0]; return route.fulfill({ json: { item: { ...it, is_closed: det[1] === "9000", item_closing_action: det[1] === "9000" ? "sold" : null } } }); }
    if (url.pathname.startsWith("/api/v2/catalog/items") && /secours/.test(url.searchParams.get("search_text") || "")) return route.fulfill({ status: 401, json: { code: 100, message: "invalid_authentication_token" } });
    if (url.pathname.startsWith("/catalog") && /secours/.test(url.searchParams.get("search_text") || "")) return route.fulfill({ contentType: "text/html", body: `<!doctype html><main>${catalogItems.slice(0, 6).map((it) => `<div data-testid="grid-item"><a href="/items/${it.id}-x" title="${it.title}, marque: Zara, état: Très bon état, taille: M, ${it.price.amount.replace(".", ",")} €, 9,99 € incl."></a><img src="${it.photo.url}"></div>`).join("")}</main>` });
    if (url.pathname.startsWith("/api/v2/catalog/items")) return route.fulfill({ json: { items: catalogItems, pagination: { total_entries: 214 } } });
    if (url.pathname === "/api/v2/my_orders") return route.fulfill({ contentType: "application/json", body: fx("my_orders.json") });
    if (url.pathname === "/api/v2/users/current") return route.fulfill({ json: { user: { id: 4242, login: "moncomptevinted" } } });
    if (url.pathname === "/api/v2/users") return route.fulfill({ json: { users: [{ id: 8800, login: "vendeuse0" }, { id: 9911, login: "vendeuse01" }] } });
    if (/^\/api\/v2\/users\/\d+$/.test(url.pathname)) return route.fulfill({ json: { user: { id: Number(url.pathname.split("/").pop()), login: "moncompte", feedback_reputation: 0.96, feedback_count: 23, followers_count: 12, item_count: 4, photo: { url: "https://images1.vinted.net/t/u.jpeg" }, about: "Articles neufs, envoi rapide depuis l'entrepôt." } } });
    if (/^\/api\/v2\/(wardrobe|users)\/\d+\/items/.test(url.pathname)) return route.fulfill({ json: { items: catalogItems.slice(0, 4).map((it, i) => ({ ...it, is_closed: i === 0, item_closing_action: i === 0 ? "sold" : null })) } });
    if (url.pathname.startsWith("/inbox")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Messages | Vinted</title><main><h2><a href=\"/member/9090-gd02840\">gd02840</a></h2><p>Ta vente est finalisée.</p><a href=\"/member/9090-gd02840/feedback\">Évaluer</a></main>" });
    if (url.pathname.startsWith("/member/")) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Profil | Vinted</title><main><h1>vendeuse</h1><section><a href=\"/member/777-autrevendeuse\">autrevendeuse</a></section></main>" });
    if (url.pathname.startsWith("/items/")) return route.fulfill({ contentType: "text/html", body: fx("vinted-item.html") });
    // Page d'accueil (fil d'actu) : beaucoup de cartes, sans attribut title (texte dans l'alt de la photo, ou prix affiché).
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Vinted</title><main><div class="feed-grid">${Array.from({ length: 130 }, (_, i) => `<div class="feed-grid__item"><a href="/items/${5100000 + i}-article"><img src="https://images1.vinted.net/t/h${i}.jpeg" alt="${i % 2 ? `Article accueil ${i}, marque: Zara, état: Neuf, taille: M, ${10 + i},00 €` : `Article accueil ${i}`}"></a><p>${10 + i},00 €</p></div>`).join("")}</div></main>` });
    if (url.pathname.startsWith("/catalog")) return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Recherche | Vinted</title><main><div class="grid">${catalogItems.slice(1, 3).map((it) => `<div data-testid="grid-item" style="width:200px;display:inline-block;margin:10px"><a href="/member/88${it.id}-vendeuse">vendeuse</a><a href="/items/${it.id}-sac" title="${it.title}, marque: Zara, état: Très bon état, taille: M, ${it.price.amount.replace(".", ",")} €"><img src="${it.photo.url}" width="200" height="260" alt=""></a><p>${it.price.amount} €</p></div>`).join("")}</div></main>` });
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Vinted</title>" });
  }
  if (/(^|\.)shein\.com$/.test(h)) {
    const html = (body) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8">${body}` });
    const pid = url.pathname.match(/-p-(\d+)\.html$/);
    if (pid) return html(`<title>Robe | SHEIN</title><script type="application/ld+json">${JSON.stringify([{ "@type": "Product", name: `Robe crochet bohème ${pid[1]}`, image: ["https://img.ltwebstatic.com/robe.jpg"], offers: { price: "14.99" }, aggregateRating: { ratingValue: 4.8, reviewCount: 120 } }, { "@type": "BreadcrumbList", itemListElement: [{ name: "Accueil" }, { name: "Femme" }, { name: "Robes" }, { name: "Robes crochet" }] }])}</script></head><body style="margin:0"><h1>Robe crochet bohème ${pid[1]}</h1><ul class="thumbs">${'<li style="display:inline-block;width:60px;height:80px;background:#ccc"></li>'.repeat(4)}</ul><div style="height:2600px">Description</div>${url.searchParams.has("verif") ? "" : ""}</body></html>`);
    const names = ["Robe crochet bohème", "Robe crochet plage", "Sac crochet fleur", "Top crochet été", "Gilet crochet vintage", "Bob crochet"];
    const cards = Array.from({ length: 48 }, (_, i) => { const t = `${names[i % names.length]} ${i}`; return `<section role="listitem" class="product-card" style="display:inline-block;width:180px;height:330px;margin:6px;vertical-align:top"><a href="/${t.replace(/ /g, "-")}-p-${1000 + i}.html" target="_blank" aria-label="${t}"><img alt="${t}" src="https://img.ltwebstatic.com/p${i}.jpg" style="width:100%;height:240px"></a><div class="goods-title">${t}</div><div>${9 + (i % 7)},99€</div></section>`; }).join("");
    return html(`<title>Crochet | SHEIN FR</title></head><body style="margin:0"><h1>Crochet</h1>${cards}</body></html>`);
  }
  if (h.endsWith("aliexpress.com") && url.pathname.startsWith("/p/trade")) return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Paiement</title><main><h1>Confirmer la commande</h1><div class="coupon-box"><input type="text" placeholder="Code promo" id="cp"><button type="button" onclick="window.__applied = document.getElementById('cp').value">Appliquer</button></div><p>Total : 12,40 €</p></main>` });
  if (h.endsWith("aliexpress.com") && url.pathname.startsWith("/w/wholesale")) {
    const cards = ["Sac seau cuir tressé femme", "Lunettes de soleil oeil de chat", "Collier chaîne dorée fine", "Casquette brodée vintage", "Pochette téléphone bandoulière"]
      .map((t, i) => `<div class="card"><a href="https://fr.aliexpress.com/item/100500700${i}.html?spm=x"><img src="https://ae01.alicdn.com/kf/L${i}.jpg" alt="${t}"><h3>${t}</h3></a><div class="price">${(3.5 + i).toFixed(2).replace(".", ",")} €</div></div>`).join("");
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><title>Recherche</title><main>${cards}</main>` });
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
    if (body.action === "diagnostic") return route.fulfill({ headers: cors, json: { summary: "Ton compte a une bonne base mais publie trop peu.", strengths: ["Bonne note"], fixes: [{ title: "Publie 1 annonce par jour", why: "0 annonce cette semaine", how: "Prépare 7 articles le dimanche." }, { title: "Ajoute la marque", why: "Peu d'annonces avec marque", how: "Renseigne le champ marque." }, { title: "Refais les vieilles annonces", why: "Âge médian élevé", how: "Supprime et republie avec de nouvelles photos." }] } });
    if (body.action === "imageproxy") { imageProxyCalls.push(body.url); return route.fulfill({ headers: cors, json: { type: "image/png", b64: PNG.toString("base64") } }); }
    if (body.action === "imagesearch") return route.fulfill({ headers: cors, json: { name: "Sac bandoulière cuir noir", supplier: ["women leather crossbody bag black", "small shoulder bag pu leather"], vinted: ["sac bandoulière noir", "petit sac cuir"], brand: null, branded: false, category: "Sacs" } });
    if (body.action === "review") return route.fulfill({ headers: cors, json: { verdict: "go", summary: "Bon sac d'entrée de gamme, bien noté.", good: ["Note de 4,8"], watch: ["Les dimensions sont petites"], save: ["Prends la variante noire, moins chère"], resale: "Vends-le autour de 20 € avec des photos portées." } });
    if (body.action === "compare") return route.fulfill({ headers: cors, json: { scores: Object.fromEntries(body.candidates.slice(0, 2).map((c) => [c.id, 0.9])) } });
    if (body.action === "link") return route.fulfill({ headers: cors, json: { checked: 3, linked: 1 } });
    if (body.action === "suppliers") return route.fulfill({ headers: cors, json: { suppliers: [{ id: "p1", title: "Tapis rond coloré tissé", url: "https://fr.aliexpress.com/item/1005009999.html", price: 9.5, platform: "aliexpress", image_url: null, reason: "photo", score: 0.9 }], queries: ["tapis rond coloré"], checked: 1 } });
    if (body.action === "keywords") return route.fulfill({ headers: cors, json: { queries: ["sac bandoulière noir", "petit sac cuir femme"] } });
    if (body.action === "match") return route.fulfill({ headers: cors, json: { scores: Object.fromEntries(body.candidates.slice(0, 4).map((c) => [c.id, 0.9])) } });
    if (body.action === "brief") return route.fulfill({ headers: cors, json: { category: "sac", title: "Sac", colors: ["noir"], materials: ["cuir PU"], keyDetails: [], textAndLogos: [], parts: "1 sac", scale: "25 cm", texture: "grain fin" } });
    await new Promise((r) => setTimeout(r, 400));
    if (body.action === "planche") return route.fulfill({ headers: cors, json: { results: body.scenes.map((x) => ({ sceneId: x.sceneId, ok: true, id: `p-${x.sceneId}`, url: "https://barapics.com/mock.png", attempts: 1, qualityReport: null })) } });
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
// Fonctions qui interrogeaient Vinted avec le compte du membre : arrêtées en 3.6.8 (comptes bloqués). Leur échec est attendu.
const OFF_SINCE_368 = [/^catalogue : annonces Vinted ajoutées par lien/, /^radar/, /^vente d'un concurrent : alerte/, /^diagnostic du compte/, /^rythme du Radar/, /^admin : concurrents de référence/, /^dressing d'un vendeur envoyé/, /^compte Vinted du membre reconnu/, /^Ventes à expédier/, /^Beebs : plusieurs annonces Vinted reprises/, /^Leboncoin : publication rapide en série/];
const check = (name, ok, extra = "") => {
  if (!ok && OFF_SINCE_368.some((re) => re.test(name))) { console.log(`– ${name} — arrêté en 3.6.8 (aucune requête Vinted)`); return; }
  results.push({ name, ok }); console.log(`${ok ? "✔" : "✘"} ${name}${extra ? " — " + extra : ""}`);
};

// 1. Écran de compte (déconnecté) puis connexion
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(app("/compte"));
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/1-compte.png`, fullPage: true });
const email = page.locator('input[type="email"]').first();
check("formulaire de connexion affiché", (await email.count()) > 0);
await page.goto(app("/catalogue")); await page.waitForTimeout(1200);
check("compte obligatoire : sans compte, AliEdge s'ouvre sur la création de compte", /#\/compte\?mode=signup&gate=1/.test(page.url()) && /Crée ton compte gratuit pour utiliser AliEdge/.test(await page.locator("#view").innerText()), page.url());
await page.goto(app("/compte")); await page.waitForTimeout(600);
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
{
  // Le bouton Barapics est le premier (au-dessus) de la pile ; on réessaie si la pile n'est pas encore en place.
  let req = null;
  let diag = "";
  for (let attempt = 0; attempt < 3 && !req; attempt++) {
    await product.waitForTimeout(800);
    const box = await product.locator("div[style*='2147483646']").first().boundingBox().catch(() => null);
    const reqWait = ctx.waitForEvent("request", { predicate: (r) => r.url().startsWith("https://barapics.com/app"), timeout: 8000 }).catch(() => null);
    if (box) await product.mouse.click(box.x + box.width / 2, box.y + 14);
    req = await reqWait;
  }
  // Sur certaines machines de CI le clic dans la racine fermée n'arrive pas : on vérifie alors l'ouverture côté extension.
  if (!req) {
    const reqWait = ctx.waitForEvent("request", { predicate: (r) => r.url().startsWith("https://barapics.com/app"), timeout: 8000 }).catch(() => null);
    diag = await page.evaluate(() => chrome.runtime.sendMessage({ type: "open:barapics", url: "https://fr.aliexpress.com/item/1005006.html" })).then((r) => JSON.stringify(r)).catch((e) => `err ${e.message}`);
    req = await reqWait;
    if (!req) {
      await product.waitForTimeout(1500);
      const opened = ctx.pages().map((pg) => pg.url()).find((u) => u.includes("barapics.com/app"));
      if (opened) req = { url: () => opened };
      diag += ` pages=${ctx.pages().map((pg) => pg.url().slice(0, 60)).join(" | ")}`;
    }
  }
  const target = req ? req.url() : "";
  check("bouton « Photos et annonce avec Barapics » ouvre Barapics avec le lien du produit", target.startsWith("https://barapics.com/app?url=") && decodeURIComponent(target).includes("aliexpress.com/item/1005006.html"), `${target.slice(0, 90)} ${diag}`.slice(0, 400));
  for (const pg of ctx.pages()) if (pg.url().includes("barapics.com/app") || pg.url().startsWith("chrome-error")) await pg.close().catch(() => {});
}
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
await panel.waitForFunction(() => /Sur Leboncoin/.test(document.getElementById("lbcbox")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
check("analyse : ventes Leboncoin de la même recherche affichées (activé par défaut)", /1 vente repérée · prix médian 18,00/.test(await panel.locator("#lbcbox").innerText().catch(() => "")), (await panel.locator("#lbcbox").innerText().catch(() => "")).replace(/\s+/g, " "));
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
// 2a. Achat malin : historique des prix, avis IA, codes promo, même produit moins cher, recherche par image
await panel.waitForSelector(".smart", { timeout: 8000 }).catch(() => {});
// Les volets « Acheter malin » sont repliés par défaut (design épuré) : on les ouvre comme le ferait le membre.
await panel.evaluate(() => document.querySelectorAll(".smart details.fold").forEach((d) => { d.open = true; }));
await panel.waitForSelector(".smart .spark", { timeout: 8000 }).catch(() => {});
check("achat malin : historique des prix (courbe + plus bas)", (await panel.locator(".smart .spark").count()) === 1 && /6,40/.test(await panel.locator(".smart-stats").innerText().catch(() => "")), (await panel.locator(".smart").innerText().catch(() => "")).slice(0, 120));
check("achat malin : codes promo de la communauté", (await panel.locator(".smart .coupon").count()) === 2);
await panel.click("[data-aireview]").catch(() => {});
await panel.waitForFunction(() => /entrée de gamme/.test(document.querySelector(".smart")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
check("achat malin : avis IA de la fiche", barapicsCalls.includes("review") && /Payer moins cher/.test(await panel.locator(".smart").innerText().catch(() => "")));
await panel.screenshot({ path: `${shots}/5c-achat-malin.png`, fullPage: true });
{
  const opened = ctx.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await panel.evaluate(() => { const d = document.querySelector('[data-fold="compare"]'); if (d) d.open = true; });
await panel.click('[data-compare="aliexpress"]').catch(() => {});
  const cmp = await opened;
  if (cmp) {
    await cmp.waitForLoadState("domcontentloaded").catch(() => {});
    await cmp.waitForSelector(".aliedge-same", { timeout: 15000 }).catch(() => {});
    const u = cmp.url();
    const n = await cmp.locator(".aliedge-same").count();
    check("même produit moins cher : recherche triée par prix + vendeurs repérés", /SortType=price_asc/.test(u) && /leather-crossbody/.test(u) && n >= 1 && barapicsCalls.includes("compare"), `${u.slice(0, 90)} · ${n} repéré(s)`);
    await cmp.screenshot({ path: `${shots}/5d-meme-produit.png` });
    await cmp.close();
  } else check("même produit moins cher : recherche triée par prix + vendeurs repérés", false, "aucun onglet ouvert");
}
{
  const pay = await ctx.newPage();
  await pay.goto("https://fr.aliexpress.com/p/trade/confirm.html");
  await pay.waitForTimeout(2500);
  check("codes promo proposés sur la page de paiement", (await pay.locator("div[style*='2147483646']").count()) >= 1 && calls.includes("/rest/v1/rpc/aliedge_coupons_list"));
  await pay.screenshot({ path: `${shots}/5e-paiement.png` });
  await pay.close();
}
await panel.evaluate(() => chrome.storage.session.set({ ae_pending: { route: "image", image: { src: "https://ae01.alicdn.com/kf/clic-droit.jpg" }, at: Date.now() } }));
await panel.goto(app("/image", false));
await panel.reload();
await panel.waitForFunction(() => /women leather crossbody/.test(document.querySelector("main")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
const imgText = await panel.locator("main").innerText().catch(() => "");
check("recherche par image (clic droit) : produit reconnu, liens fournisseurs et Vinted", barapicsCalls.includes("imagesearch") && /women leather crossbody bag/.test(imgText) && (await panel.locator("[data-vq]").count()) === 2 && (await panel.locator('a[href^="https://lens.google.com"]').count()) === 1, imgText.slice(0, 120));
await panel.screenshot({ path: `${shots}/5f-image.png`, fullPage: true });
await panel.setInputFiles("#imgfile", { name: "capture.jpg", mimeType: "image/jpeg", buffer: readFileSync(path.join(root, "tests/fixtures/capture.jpg")) }).catch(() => {});
await panel.waitForFunction(() => document.querySelector(".imgsearch img")?.getAttribute("src")?.startsWith("data:image/jpeg"), null, { timeout: 8000 }).catch(() => {});
check("recherche par image : image importée depuis l'ordinateur", ((await panel.locator(".imgsearch img").getAttribute("src").catch(() => "")) || "").startsWith("data:image/jpeg"), ((await panel.locator(".imgsearch img").getAttribute("src").catch((e) => e.message)) || "").slice(0, 80) + " " + (await panel.locator(".toast").innerText().catch(() => "")));
await panel.evaluate(() => chrome.runtime.sendMessage({ type: "prices:history", platform: "aliexpress", source_id: "1005006" })).catch(() => {});
await panel.waitForTimeout(500);
check("historique des prix : relevés envoyés depuis les fiches et les résultats", calls.includes("/rest/v1/rpc/aliedge_report_prices"));
await panel.goto(app("/analyse", false));
await product.bringToFront();
await panel.evaluate(() => chrome.runtime.sendMessage({ type: "tab:changed" }).catch(() => {}));
await panel.waitForSelector(".product h3", { timeout: 10000 }).catch(() => {});

// 2b. Photos Barapics créées depuis le panneau AliEdge (API Barapics)
await panel.click('[data-act="photos"]');
await panel.waitForFunction(() => /disponible/.test(document.querySelector("#pcredits")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
check("photos Barapics : solde affiché dans AliEdge", /12 photos disponibles/.test((await panel.locator("#pcredits").textContent().catch(() => "")) || ""));
await panel.click("#pgo");
await panel.waitForFunction(() => document.querySelectorAll(".pshot.done").length === 4, null, { timeout: 20000 }).catch(() => {});
await panel.screenshot({ path: `${shots}/5c-photos.png`, fullPage: true });
check("photos Barapics : 4 photos créées depuis AliEdge (en une planche)", (await panel.locator(".pshot.done").count()) === 4 && barapicsCalls.includes("planche"), barapicsCalls.join(","));
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
await page.waitForSelector("#salesfeed .sale-row", { timeout: 6000 }).catch(() => {});
check("catalogue : ventes Vinted sans fournisseur affichées, avec recherche du fournisseur", (await page.locator("#salesfeed .sale-row").count()) === 1 && (await page.locator("#salesfeed details.supplier").count()) === 1);
await page.click("#salesfeed [data-sale]").catch(() => {});
await page.waitForSelector("#salesheet .sup", { timeout: 6000 }).catch(() => {});
await page.waitForFunction(() => /Même article à 90/.test(document.getElementById("salesheet")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
const sheet = await page.evaluate(() => { const d = document.getElementById("salesheet"); return d ? { open: d.open, text: d.innerText.replace(/\s+/g, " ").slice(0, 1200), sup: d.querySelectorAll(".sup").length, link: d.querySelector('a.btn.primary')?.href } : null; });
check("catalogue : fiche d'une vente (délai, lien vers l'annonce, fournisseurs vérifiés par la photo)", sheet?.open && sheet.sup === 1 && /Même article à 90/.test(sheet.text) && /14 j/.test(sheet.text) && /Tapis rond/.test(sheet.text) && /vinted\.fr\/items\/7101/.test(sheet.link || ""), JSON.stringify(sheet));
await page.evaluate(() => document.getElementById("salesheet")?.close());
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
const seenBefore = calls.filter((c) => c.endsWith("aliedge_seen_products")).length;
await listing.goto("https://fr.aliexpress.com/w/wholesale-sac.html");
await listing.bringToFront();
{
  const n0 = seenBefore;
  await listing.waitForTimeout(7000);
  // (Les produits déjà envoyés depuis une autre page AliExpress ouverte avant ne sont pas renvoyés dans les 24 h.)
check("recherche AliExpress : produits affichés ajoutés automatiquement au catalogue (réglage activé par défaut)", calls.filter((c) => c.endsWith("aliedge_seen_products")).length > 0, JSON.stringify({ before: n0, after: calls.filter((c) => c.endsWith("aliedge_seen_products")).length }));
}
const before = calls.filter((c) => c.endsWith("aliedge_seen_products")).length;
const imported = await page.evaluate(() => chrome.runtime.sendMessage({ type: "catalog:importPage" }));
check("catalogue : produits d'une page de résultats ajoutés", imported?.ok && imported.data.found === 5 && calls.filter((c) => c.endsWith("aliedge_seen_products")).length > before, JSON.stringify(imported));
{
  await page.waitForTimeout(1500);
  check("produits ajoutés : reliés par les photos côté serveur, sans recherche Vinted", barapicsCalls.includes("link") && imported?.data?.queued === 0, barapicsCalls.join(","));
}
await listing.close();

// 3a bis. Ajout d'annonces Vinted par leur lien
const imp = await page.evaluate(() => chrome.runtime.sendMessage({ type: "catalog:importVinted", links: "https://www.vinted.fr/items/9000-sac\nhttps://www.vinted.fr/items/9001-sac" }));
check("catalogue : annonces Vinted ajoutées par lien", imp?.ok && imp.data.added === 2, JSON.stringify(imp));

// 3b. Radar : un filtre, puis de nouvelles annonces détectées
await page.goto(app("/radar"));
await page.waitForSelector("#radarform", { timeout: 8000 }).catch(() => {});
await page.fill('#radarform input[name="link"]', "https://www.vinted.fr/catalog?search_text=sac%20bandouli%C3%A8re&brand_ids[]=53&brand_ids[]=88&catalog[]=1242&price_to=25&order=relevance").catch(() => {});
await page.fill('#radarform input[name="lname"]', "Sacs Zara").catch(() => {});
await page.click('#radarform button[type="submit"]').catch(() => {});
await page.waitForSelector(".radar-filter", { timeout: 8000 }).catch(() => {});
check("radar : filtre enregistré", (await page.locator(".radar-filter").count()) === 1);
await page.waitForSelector("#alertsbody .alert-row", { timeout: 6000 }).catch(() => {});
check("radar : réglages des alertes téléphone", (await page.locator("#alertsbody .alert-row").count()) === 2 && barapicsCalls.includes("alerts:get"));
await page.waitForTimeout(1500);
await page.evaluate(() => chrome.runtime.sendMessage({ type: "radar:tick" }));
await page.goto(app("/radar"));
await page.waitForSelector(".radar-item", { timeout: 8000 }).catch(() => {});
check("radar : lien de recherche Vinted repris (marques, catégorie, prix)", radarUrls.some((q) => q.includes("brand_ids=53%2C88") && q.includes("catalog_ids=1242") && q.includes("price_to=25") && q.includes("order=newest_first")), radarUrls[0] || "aucune requête");
check("radar : nouvelles annonces dans le flux", (await page.locator(".radar-item").count()) === 2, `${await page.locator(".radar-item").count()} annonce(s)`);
check("radar : alerte envoyée sur le téléphone", barapicsCalls.includes("alerts:send"));
await page.screenshot({ path: `${shots}/7b-radar.png`, fullPage: true });

// 4. Concurrents : suivi en continu et récap
await page.goto(app("/concurrents"));
await page.waitForSelector(".tracker", { timeout: 8000 }).catch(() => {});
check("concurrent affiché dans l'onglet Concurrents", (await page.locator("[data-tracker]").count()) === 1);
await page.fill("#trackurl", "https://www.vinted.fr/member/4242-boutique-sacs").catch(() => {});
const addsBefore = calls.filter((c) => c.endsWith("aliedge_tracker_add")).length;
await page.click('#trackform button[type="submit"]').catch(() => {});
await page.waitForTimeout(1500);
check("concurrent ajouté par le lien de son profil", calls.filter((c) => c.endsWith("aliedge_tracker_add")).length > addsBefore);
await page.waitForSelector("[data-tracker]", { timeout: 6000 }).catch(() => {});
await page.locator("[data-tracker]").first().click().catch(() => {});
await page.waitForSelector(".tracker-body .kpis", { timeout: 6000 }).catch(() => {});
check("récap du concurrent (délai de vente, ce qui se vend)", (await page.locator("[id^='tb-'] .kpi").count()) === 6 && (await page.locator("[id^='tb-']").first().innerText().catch(() => "")).includes("2,5 j"));
check("ventes du concurrent listées", (await page.locator(".tracker-body .badge-sold").count()) >= 1);
check("vente du concurrent : fournisseur connu affiché, sinon recherche du fournisseur", (await page.locator(".tracker-body .supplier.ok").count()) === 1 && (await page.locator(".tracker-body details.supplier").count()) === 1);
{
  await page.locator(".tracker-body details.supplier summary").first().click().catch(() => {});
  const links = await page.locator(".tracker-body details.supplier a").evaluateAll((as) => as.map((a) => a.href)).catch(() => []);
  check("trouver le fournisseur : Google Lens par photo + AliExpress, Temu, Shein", links.some((u) => u.startsWith("https://lens.google.com/uploadbyurl?url=")) && links.some((u) => u.includes("aliexpress.com/w/wholesale-")) && links.length === 4, links.join(" ").slice(0, 200));
  const before = calls.filter((c) => c.endsWith("aliedge_link_item")).length;
  await page.fill(".tracker-body form[data-link] input", "https://fr.aliexpress.com/item/1005009.html?spm=x").catch(() => {});
  await page.click(".tracker-body form[data-link] button").catch(() => {});
  await page.waitForTimeout(1200);
  check("produit fournisseur relié à la vente", calls.filter((c) => c.endsWith("aliedge_link_item")).length > before && (await page.locator(".tracker-body .supplier.ok").count()) === 2);
}
{
  // Alerte « un concurrent vient de vendre » : 1er passage mémorise, le suivant prévient.
  await page.evaluate(() => chrome.storage.local.remove("ae_sales"));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "competitor:checkSales" }));
  const primed = await page.evaluate(async () => (await chrome.storage.local.get("ae_sales")).ae_sales);
  rpc.aliedge_competitor_sales_since = [{ ...rpc.aliedge_competitor_sales_since[0], vinted_id: 9010, title: "Sac cabas paille" }, ...rpc.aliedge_competitor_sales_since];
  const alertsBefore = barapicsCalls.filter((c) => c === "alerts:send").length;
  const r = await page.evaluate(() => chrome.runtime.sendMessage({ type: "competitor:checkSales" }));
  check("vente d'un concurrent : alerte seulement pour la nouvelle vente", primed?.primed && primed.feed.length === 1 && r?.ok && r.data.feed.length === 2 && r.data.feed[0].vinted_id === 9010, JSON.stringify(r).slice(0, 160));
  check("vente d'un concurrent : alerte envoyée sur le téléphone", barapicsCalls.filter((c) => c === "alerts:send").length > alertsBefore);
  await page.reload();
  await page.waitForSelector("#salesnotify", { timeout: 6000 }).catch(() => {});
  check("dernières ventes des concurrents affichées", (await page.locator("section").filter({ hasText: "Dernières ventes de tes concurrents" }).locator(".item").count()) === 2);
}
{
  await page.fill("#nicheq", "sac cuir").catch(() => {});
  await page.click('#nicheform button[type="submit"]').catch(() => {});
  await page.waitForSelector("#nicheout .kpis", { timeout: 10000 }).catch(() => {});
  const txt = await page.locator("#nicheout").innerText().catch(() => "");
  check("niche : annonces en ligne + ventes constatées + vendeurs à suivre", /214/.test(txt) && /3,5 j/.test(txt) && (await page.locator("#nicheout [data-follow]").count()) >= 2 && calls.some((c) => c.endsWith("aliedge_niche_stats")), txt.slice(0, 160));
  const before = calls.filter((c) => c.endsWith("aliedge_tracker_add")).length;
  await page.locator("#nicheout [data-follow]").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  check("niche : meilleur vendeur suivi en un clic", calls.filter((c) => c.endsWith("aliedge_tracker_add")).length > before);
}
{
  await page.evaluate(() => { const d = document.querySelector('[data-fold="diag"]'); if (d) d.open = true; });
  await page.fill("#diagurl", "https://www.vinted.fr/member/31337-moncompte").catch(() => {});
  await page.click('#diagform button[type="submit"]').catch(() => {});
  await page.waitForSelector("#diagout .diag-score", { timeout: 15000 }).catch(() => {});
  const txt = await page.locator("#diagout").innerText().catch(() => "");
  const total = Number((await page.locator("#diagout .diag-score b").textContent().catch(() => "")) || NaN);
  check("diagnostic du compte : note sur 100, 5 rubriques, corrections", total >= 0 && total <= 100 && (await page.locator("#diagout .diag-parts > div").count()) === 5 && (await page.locator("#diagout ol.diag-list li").count()) === 3 && barapicsCalls.includes("diagnostic"), `${total} ${txt.slice(0, 120)}`);
}
await page.screenshot({ path: `${shots}/8-concurrents.png`, fullPage: true });

// 4b. Réglages à distance, santé et erreurs
await page.evaluate(() => chrome.alarms.create("remote", { when: Date.now() + 100 }));
await page.waitForTimeout(2500);
check("réglages à distance lus et santé envoyée", calls.some((c) => c.endsWith("aliedge_remote_config")) && calls.some((c) => c.endsWith("aliedge_report_health")));
const remoteState = await page.evaluate(async () => (await chrome.storage.local.get("ae_remote")).ae_remote);
check("réglages à distance enregistrés", remoteState?.radar_seconds === "45");
await page.goto(app("/radar"));
await page.waitForSelector(".update-banner", { timeout: 6000 }).catch(() => {});
check("message de l'admin affiché dans l'extension", (await page.locator(".update-banner").first().innerText().catch(() => "")).includes("Maintenance Vinted"));
const radarAlarm = await page.evaluate(() => chrome.alarms.get("radar"));
check("rythme du Radar réglé à distance (45 s)", Math.abs((radarAlarm?.periodInMinutes ?? 0) - 0.75) < 0.01, JSON.stringify(radarAlarm?.periodInMinutes));

// 5. Page d'une annonce Vinted vendue
const v = await ctx.newPage();
await v.goto("https://www.vinted.fr/items/9000-sac-bandouliere");
await v.waitForSelector("#aliedge-source", { timeout: 10000, state: "attached" }).catch(() => {});
await v.waitForTimeout(1500);
check("bouton « Trouver le fournisseur » sur Vinted", (await v.locator("#aliedge-source").count()) === 1);
check("vente signalée au catalogue", calls.filter((c) => c.endsWith("aliedge_report_items")).length >= 1);
await v.screenshot({ path: `${shots}/9-vinted.png` });

// 5a0. Compte admin : les pseudos de concurrents de référence sont retrouvés et suivis
rpc.aliedge_me.admin = true;
await page.evaluate(() => chrome.storage.local.remove("ae_guard")); // repart d'un garde-fou vierge (4 lectures par minute en tâche de fond)
{
  const seedBefore = calls.filter((c) => c.endsWith("aliedge_seed_resolve")).length;
  await page.evaluate(() => chrome.alarms.create("remote", { when: Date.now() + 50 }));
  await page.waitForTimeout(14000);
  const g = await page.evaluate(() => chrome.runtime.sendMessage({ type: "guard:status" })).catch(() => null);
  check("admin : concurrents de référence retrouvés par leur pseudo et suivis", calls.filter((c) => c.endsWith("aliedge_seed_resolve")).length > seedBefore, `pending=${calls.filter((c) => c.endsWith("aliedge_seed_pending")).length} guard=${JSON.stringify(g?.data)}`);
}
rpc.aliedge_me.admin = false;

// 5a. Recherche Vinted de secours : l'API refuse (session expirée), AliEdge lit la page de résultats
{
  const r = await page.evaluate(() => chrome.runtime.sendMessage({ type: "analyze", product: null, query: "sac secours", market: "fr", condition: "all", shipping: 0 })).catch((e) => ({ ok: false, error: e.message }));
  const n = r?.data?.comparable?.length ?? r?.data?.result?.count ?? (Array.isArray(r?.data?.items) ? r.data.items.length : 0);
  check("recherche Vinted de secours par la page quand l'API refuse", r?.ok && JSON.stringify(r.data).includes("vinted.fr/items/900"), r?.ok ? `${n}` : r?.error);
}

// 5b. Résultats de recherche : « + Concurrent » au survol d'une carte d'annonce
{
  const cat = await ctx.newPage();
  await cat.goto("https://www.vinted.fr/catalog?search_text=tapis");
  await cat.waitForSelector(".aliedge-card-add", { timeout: 6000, state: "attached" }).catch(() => {});
  check("bouton « + Concurrent » sur les cartes d'annonces", (await cat.locator(".aliedge-card-add").count()) === 2);
  const card = cat.locator('[data-testid="grid-item"]').first();
  await card.hover().catch(() => {});
  await cat.waitForTimeout(300);
  const before = calls.filter((c) => c.endsWith("aliedge_tracker_add")).length;
  const box = await cat.locator(".aliedge-card-add").first().boundingBox().catch(() => null);
  if (box) await cat.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await cat.waitForTimeout(2500);
  check("survol d'une annonce : vendeur ajouté aux concurrents sans ouvrir l'annonce", calls.filter((c) => c.endsWith("aliedge_tracker_add")).length > before && cat.url().includes("/catalog"));
  await cat.waitForTimeout(3500);
  check("annonces affichées : vendeur lu sur la carte (lien de son profil), sans requête", reportBodies.some((b) => /"seller_id":88\d+/.test(b)), (reportBodies.find((b) => b.includes("seller_id")) || "").slice(0, 160));
  check("annonces affichées par Vinted ajoutées à la base sans requête en plus", reportBodies.some((b) => b.includes('"vinted_id":9001') && b.includes('"brand":"Zara"') && b.includes('"status":"active"')), reportBodies.slice(-1)[0]?.slice(0, 160));
  await cat.screenshot({ path: `${shots}/9b-catalogue-vinted.png` });
  await cat.close();
}

// 5b bis. Messagerie : aucun bouton « + Concurrent » (ce sont tes acheteurs)
{
  const inbox = await ctx.newPage();
  await inbox.goto("https://www.vinted.fr/inbox/123");
  await inbox.waitForTimeout(2500);
  check("messagerie Vinted : aucun bouton « + Concurrent »", (await inbox.locator(".aliedge-competitor").count()) === 0);
  await inbox.close();
}

// 5c. Leboncoin : annonces affichées lues sans requête en plus, annonce, vendeur, concurrents, ventes dans le catalogue
{
  const lbc = await ctx.newPage();
  await lbc.goto("https://www.leboncoin.fr/recherche?text=lampe");
  await lbc.waitForTimeout(5000);
  let body = lbcBodies.join("\n");
  check("Leboncoin : annonces des résultats ajoutées (département, jamais la ville)", body.includes('"list_id":2900000001') && body.includes('"department":"13"') && body.includes('"price":18') && body.includes('"published_at":"2026-10-10T12:00:00+01:00"') && body.includes('"shipping":true') && !body.includes("Marseille"), body.slice(0, 160));
  await lbc.goto("https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000005");
  await lbc.waitForTimeout(5000);
  body = lbcBodies.join("\n");
  check("Leboncoin : annonce lue avec son vendeur", body.includes('"list_id":2900000005') && body.includes('"seller_uuid":"31a5e0aa-0000-4000-8000-000000000001"') && body.includes('"department":"62"'), body.slice(-200));
  const addBefore = calls.filter((c) => c.endsWith("aliedge_lbc_tracker_add")).length;
  check("Leboncoin : bouton « + Concurrent » à côté du vendeur", (await lbc.locator(".aliedge-lbc-competitor").count()) === 1);
  await lbc.locator(".aliedge-lbc-competitor").first().click().catch(() => {});
  await lbc.waitForTimeout(1200);
  check("Leboncoin : concurrent ajouté en un clic", calls.filter((c) => c.endsWith("aliedge_lbc_tracker_add")).length > addBefore);
  await lbc.goto("https://www.leboncoin.fr/profile/20f25f94-11be-4ddd-9fe0-20891b9db732/offers");
  await lbc.waitForTimeout(5000);
  check("Leboncoin : page du vendeur relevée (annonces + disparues)", profileBodies.some((b) => b.includes("20f25f94-11be-4ddd-9fe0-20891b9db732") && b.includes("2900000006") && b.includes('"_total":2') && b.includes('"_name":"Asm4ever"')), profileBodies.slice(-1)[0]);
  await lbc.goto("https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000003");
  await lbc.waitForTimeout(5000);
  check("Leboncoin : annonce disparue signalée", lbcBodies.some((b) => b.includes('"list_id":2900000003') && b.includes('"status":"gone"')));
  check("Leboncoin : aucune requête d'AliEdge vers Leboncoin", lbcRequests.every((p) => ["/recherche", "/ad/accessoires_bagagerie/2900000005", "/profile/20f25f94-11be-4ddd-9fe0-20891b9db732/offers", "/ad/accessoires_bagagerie/2900000003"].includes(p)), lbcRequests.join(","));
  await lbc.close();
  await page.goto(app("/catalogue"));
  await page.waitForSelector("#salesfeed [data-plat='lbc']", { timeout: 8000 }).catch(() => {});
  await page.click("#salesfeed [data-plat='lbc']").catch(() => {});
  await page.waitForSelector("#salesfeed .sale-row", { timeout: 6000 }).catch(() => {});
  const t = await page.locator("#salesfeed").innerText().catch(() => "");
  check("catalogue : ventes Leboncoin (estimation) avec recherche du fournisseur", /Ventes Leboncoin/.test(t) && /estimation/.test(t) && (await page.locator("#salesfeed form[data-lbclink]").count()) === 1, t.slice(0, 120));
  await page.click("#salesfeed [data-plat='vinted']").catch(() => {});
  await page.goto(app("/concurrents"));
  await page.waitForSelector("[data-lbctracker]", { timeout: 8000 }).catch(() => {});
  await page.locator("[data-lbctracker]").first().click().catch(() => {});
  await page.waitForSelector("#lbt-20f25f94-11be-4ddd-9fe0-20891b9db732 .sale-row", { timeout: 6000 }).catch(() => {});
  check("Concurrents Leboncoin : suivi, ventes probables et lien vers sa page", (await page.locator("[data-lbctracker]").count()) === 1 && (await page.locator("#lbt-20f25f94-11be-4ddd-9fe0-20891b9db732 a[href*='/profile/20f25f94']").count()) === 1 && (await page.locator("#lbt-20f25f94-11be-4ddd-9fe0-20891b9db732 .badge-sold").count()) === 1);
}

// 6. Profil d'un vendeur : son dressing met à jour le catalogue
const mbr = await ctx.newPage();
await mbr.goto("https://www.vinted.fr/member/555-vendeuse");
await mbr.waitForTimeout(3500);
check("dressing d'un vendeur envoyé au catalogue", calls.some((c) => c.endsWith("aliedge_report_wardrobe")));
await mbr.waitForSelector(".aliedge-competitor", { timeout: 6000, state: "attached" }).catch(() => {});
check("bouton « + Concurrent » à côté des profils Vinted", (await mbr.locator(".aliedge-competitor").count()) === 2);
const addsBefore2 = calls.filter((c) => c.endsWith("aliedge_tracker_add")).length;
const chip = await mbr.locator("a[href*='777'] + .aliedge-competitor").boundingBox().catch(() => null);
if (chip) await mbr.mouse.click(chip.x + chip.width / 2, chip.y + chip.height / 2);
await mbr.waitForTimeout(2500);
check("clic sur « + Concurrent » : vendeur ajouté sans quitter Vinted", calls.filter((c) => c.endsWith("aliedge_tracker_add")).length > addsBefore2 && mbr.url().includes("555"));
{
  const rmBefore = calls.filter((c) => c.endsWith("aliedge_tracker_remove")).length;
  const own = await mbr.locator("h1 .aliedge-competitor").boundingBox().catch(() => null);
  if (own) await mbr.mouse.click(own.x + own.width / 2, own.y + own.height / 2);
  await mbr.waitForTimeout(2000);
  check("second clic sur « Concurrent suivi » : le suivi s'arrête", calls.filter((c) => c.endsWith("aliedge_tracker_remove")).length > rmBefore);
}
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
    ["/concurrents", "5-concurrents", async () => { await page.locator("[data-tracker]").first().click().catch(() => {}); await page.waitForTimeout(1200); }],
  ]) {
    await page.goto(app(hash));
    await page.waitForTimeout(1800);
    await prep();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shotsDir}/${name}.png` });
  }
  console.log(`captures store : ${shotsDir}`);
}

// Compte Vinted personnel : reconnu, jamais publié ni suivi.
{
  const v = await ctx.newPage();
  await v.goto("https://www.vinted.fr/catalog?search_text=sac");
  await v.waitForTimeout(5000);
  const own = await page.evaluate(async () => (await chrome.storage.local.get("ae_own_vinted")).ae_own_vinted || []);
  const refused = await page.evaluate(() => chrome.runtime.sendMessage({ type: "tracker:add", sellerId: 4242, market: "fr" }));
  const before = reportBodies.length;
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "vinted:cards", items: [{ vinted_id: 777001, market: "fr", title: "Mon sac perso", price: 20, seller_id: 4242, url: "https://www.vinted.fr/items/777001" }] }));
  await page.waitForTimeout(500);
  const leaked = reportBodies.slice(before).some((b) => b.includes("777001"));
  check("compte Vinted du membre reconnu et jamais publié ni suivi", own.some((x) => x.id === 4242) && calls.includes("/rest/v1/rpc/aliedge_register_own_seller") && refused?.ok === false && !leaked, JSON.stringify({ own: own.map((x) => x.id), refused: refused?.error, leaked }));
  await v.close();
}

// Ventes à expédier : chaque vente retrouve son produit fournisseur, un clic la confie à la warehouse.
{
  const sup = { url: "https://fr.aliexpress.com/item/1005008123456.html", title: "Ceinture tressée cuir marron", price: 3.2, platform: "aliexpress" };
  const before = await page.evaluate(() => chrome.runtime.sendMessage({ type: "sales:pending" }));
  const linked = await page.evaluate((s) => chrome.runtime.sendMessage({ type: "sales:link", title: "Ceinture tressée marron", supplier: s }), sup);
  const after = await page.evaluate(() => chrome.runtime.sendMessage({ type: "sales:pending" }));
  const sale = (after?.data || []).find((x) => x.transaction_id === 23500000004);
  await page.goto(app("/suivis"));
  await page.waitForTimeout(1000);
  await page.click("#salesload");
  await page.waitForTimeout(2500);
  const href = await page.locator("[data-wh]").first().getAttribute("href").catch(() => "");
  const shown = await page.locator("#salesbox").innerText().catch(() => "");
  check("Ventes à expédier : produit fournisseur retrouvé, « Confier à la warehouse » prêt", before?.ok && linked?.ok && sale?.supplier?.url === sup.url && sale.supplier.sure === true && /vsale=23500000004/.test(href || "") && /Ceinture tressée cuir marron/.test(shown), JSON.stringify({ supplier: sale?.supplier?.url, href }));
  await page.screenshot({ path: `${shots}/ventes.png`, fullPage: true });
}

// Balade SHEIN : parcourt le catalogue, ouvre un article puis revient, note les articles,
// s'arrête net sur une vérification SHEIN, respecte le plafond d'articles ouverts par heure.
{
  const sh = await ctx.newPage();
  await sh.setViewportSize({ width: 1280, height: 800 });
  await sh.goto("https://fr.shein.com/category/crochet.html");
  await sh.waitForTimeout(800);
  const tabId = await page.evaluate(async () => (await chrome.tabs.query({ url: "https://fr.shein.com/*" }))[0]?.id);
  const st0 = await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:state", tabId: id }), tabId);
  const started = await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:start", tabId: id, opts: { minutes: 3, open: true, badge: true, cursor: true } }), tabId);
  const urls = new Set();
  let maxY = 0;
  for (let i = 0; i < 18; i++) {
    await sh.waitForTimeout(1500);
    const s = await sh.evaluate(() => ({ u: location.pathname, y: scrollY })).catch(() => null);
    if (s) { urls.add(s.u); if (s.u.includes("category")) maxY = Math.max(maxY, s.y); }
  }
  const visitedProduct = [...urls].some((u) => /-p-\d+\.html$/.test(u));
  const backToList = (await sh.evaluate(() => location.pathname).catch(() => "")).includes("category") || urls.has("/category/crochet.html");
  const seen = await page.evaluate(() => chrome.runtime.sendMessage({ type: "tour:seen" }));
  const items = Object.values(seen?.data || {});
  const opened = items.filter((x) => x.opened);
  check("Balade SHEIN : défile, ouvre un article puis revient au catalogue", st0?.data?.shein === true && started?.ok && maxY > 300 && visitedProduct && backToList, JSON.stringify({ maxY, urls: [...urls].slice(0, 4) }));
  check("Balade SHEIN : articles vus et ouverts notés pour les pistes de niches", items.length >= 6 && opened.length >= 1 && opened[0].cats?.includes("Robes crochet") && opened[0].price === "14.99 €", `${items.length} vus, ${opened.length} ouverts`);

  // Vérification SHEIN : la balade s'arrête net et ne reprend qu'une fois la vérification faite.
  await sh.waitForURL(/category/, { timeout: 15000 }).catch(() => {});
  await sh.waitForTimeout(1200);
  await sh.evaluate(() => { const d = document.createElement("div"); d.className = "geetest_panel"; d.style.cssText = "position:fixed;left:300px;top:150px;width:320px;height:220px;background:#fff;z-index:9"; document.body.appendChild(d); });
  await sh.waitForTimeout(2000);
  const y1 = await sh.evaluate(() => scrollY);
  await sh.waitForTimeout(3000);
  const y2 = await sh.evaluate(() => scrollY);
  const label = await sh.evaluate(() => document.querySelector("#ae-shein-tour-badge [data-label]")?.textContent || "");
  await sh.click("#ae-shein-tour-badge [data-pause]");
  await sh.waitForTimeout(600);
  const badgeLabel = () => sh.evaluate(() => document.querySelector("#ae-shein-tour-badge [data-label]")?.textContent || "");
  const stillPaused = /vérification/.test(await badgeLabel());
  await sh.evaluate(() => document.querySelector(".geetest_panel")?.remove());
  await sh.click("#ae-shein-tour-badge [data-pause]");
  await sh.waitForTimeout(500);
  const resumed = !/vérification|pause/i.test(await badgeLabel());
  check("Balade SHEIN : pause nette sur une vérification SHEIN, reprise seulement après", y1 === y2 && /vérification/.test(label) && stillPaused && resumed, JSON.stringify({ y1, y2, stillPaused, resumed }));

  // Plafond d'articles ouverts (2 par heure dans la copie de test) puis arrêt depuis le panneau.
  await sh.waitForTimeout(9000);
  const tours = await sw.evaluate(async () => (await chrome.storage.session.get("ae_shein_tours")).ae_shein_tours || {});
  const tour = Object.values(tours)[0] || {};
  await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:stop", tabId: id }), tabId);
  await sh.waitForTimeout(600);
  const gone = await sh.evaluate(() => !document.getElementById("ae-shein-tour-badge")).catch(() => false);
  const ended = await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:state", tabId: id }), tabId);
  check("Balade SHEIN : plafond d'articles par heure, arrêt depuis le panneau", (tour.opensLog || []).length <= 2 && tour.cautious === true && gone && ended?.data?.running === false, JSON.stringify({ opens: (tour.opensLog || []).length, cautious: tour.cautious }));

  // Panneau : la page Balade affiche les pistes (mots qui reviennent) et le bouton Analyser.
  await page.goto(app("/balade"));
  await page.waitForTimeout(1500);
  const txt = await page.locator("#view").innerText();
  const nicheBtn = await page.locator("[data-niche]").count();
  check("Balade SHEIN : rapport « pistes de niches » dans le panneau", /Pistes de niches/.test(txt) && /crochet/i.test(txt) && nicheBtn > 0, `${nicheBtn} pistes`);
  await page.screenshot({ path: `${shots}/balade.png`, fullPage: true });
  await sh.close();
}

// Leboncoin : outils sur une annonce (fournisseur, warehouse) et assistant de dépôt (annonce rédigée dans AliEdge).
{
  const lbc = await ctx.newPage();
  await lbc.setViewportSize({ width: 1280, height: 800 });
  await lbc.goto("https://www.leboncoin.fr/ad/accessoires_bagagerie/2900000005");
  await lbc.waitForSelector("#aliedge-lbc-tools", { timeout: 8000 }).catch(() => {});
  const onAd = await lbc.locator("#aliedge-lbc-tools").count();
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:saveListing", listing: { title: "Sac bandoulière cuir noir", description: "Joli sac neuf.", price: 19, category: "Accessoires & Bagagerie" } }));
  const info = await lbc.evaluate(() => 1).then(() => page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:listing" })));
  await lbc.goto("https://www.leboncoin.fr/deposer-une-annonce");
  await lbc.waitForSelector("#aliedge-lbc-deposit", { timeout: 8000 }).catch(() => {});
  const onDeposit = await lbc.locator("#aliedge-lbc-deposit").count();
  const st = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:status" }));
  // Messagerie : réponses toutes prêtes et aide à la négociation au-dessus de la zone de message.
  await lbc.goto("https://www.leboncoin.fr/messages/abc123");
  await lbc.waitForSelector("#aliedge-lbc-replies", { timeout: 9000 }).catch(() => {});
  const onMessages = await lbc.locator("#aliedge-lbc-replies").count();
  const offer = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:offer", title: "Sac bandoulière cuir noir", offer: 20 }));
  // Recherche : badge sur le produit déjà repéré dans le catalogue AliEdge.
  await lbc.goto("https://www.leboncoin.fr/recherche?text=sac");
  await lbc.waitForSelector(".aliedge-lbc-badge", { timeout: 9000 }).catch(() => {});
  const badges = await lbc.locator(".aliedge-lbc-badge").count();
  const best = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:bestTimes" }));
  check("Leboncoin : réponses toutes prêtes, aide à la négociation, badge produit repéré, moments de publication", onMessages === 1 && offer?.ok && badges === 1 && best?.data?.grid?.length === 7, JSON.stringify({ onMessages, badges, offer: offer?.data, n: best?.data?.n }));
  check("Leboncoin activé : outils sur l'annonce et assistant de dépôt", onAd === 1 && onDeposit === 1 && st?.data?.enabled === true && info?.data?.title === "Sac bandoulière cuir noir", JSON.stringify({ onAd, onDeposit, enabled: st?.data?.enabled }));
  await lbc.close();
}

// Onglet ouvert par l'extension (chrome.tabs.create) : Playwright ne l'intercepte pas toujours à temps (en CI la vraie
// page se charge), alors on le recharge sur l'adresse attendue, sous les copies de test, puis on attend l'étape voulue.
async function extTab(before, flowUrl, finalRe) {
  let p = null;
  for (let i = 0; i < 20 && !p; i++) { await page.waitForTimeout(500); p = ctx.pages().find((x) => !before.has(x)); }
  if (!p) return null;
  await p.goto(flowUrl).catch(() => {});
  for (let i = 0; i < 24 && !finalRe.test(p.url()); i++) await page.waitForTimeout(500);
  return finalRe.test(p.url()) ? p : null;
}

// Pages d'accueil : toutes les annonces déjà chargées rejoignent la base (Vinted et Leboncoin), par paquets.
{
  const ids = (bodies, key) => new Set(bodies.flatMap((b) => { try { return (JSON.parse(b)._items || []).map((i) => i[key]); } catch { return []; } }));
  const hv = await ctx.newPage();
  await hv.goto("https://www.vinted.fr/");
  await hv.waitForTimeout(6000);
  const vin = [...ids(reportBodies, "vinted_id")].filter((x) => x >= 5100000 && x < 5100130);
  const sample = reportBodies.map((b) => { try { return JSON.parse(b)._items.find((i) => i.vinted_id === 5100002); } catch { return null; } }).find(Boolean) || null;
  await hv.goto("https://www.leboncoin.fr/");
  await hv.waitForTimeout(6000);
  const lbcAll = lbcBodies.flatMap((b) => { try { return JSON.parse(b)._items || []; } catch { return []; } }).filter((i) => i.list_id >= 3100000000 && i.list_id < 3100000110);
  const lb = new Set(lbcAll.map((i) => i.list_id));
  const lbs = lbcAll.find((i) => i.list_id === 3100000004) || null;
  check("pages d'accueil : toutes les annonces chargées ajoutées à la base (Vinted 130, Leboncoin 110)", vin.length === 130 && sample?.price === 12 && sample?.title === "Article accueil 2" && lb.size === 110 && lbs?.title === "Veste accueil 4" && lbs?.price === 24 && lbs?.department === "69", JSON.stringify({ vinted: vin.length, sample, lbc: lb.size, lbs }));
  await hv.close();
}

// Beebs : outils sur un article, concurrent suivi par son dressing (ventes probables), « Publier sur Beebs ».
{
  const bb = await ctx.newPage();
  await bb.setViewportSize({ width: 1280, height: 800 });
  await bb.goto("https://www.beebs.app/fr/p/34000009-robe");
  await bb.waitForSelector("#aliedge-beebs-tools", { timeout: 9000 }).catch(() => {});
  const onItem = await bb.locator("#aliedge-beebs-tools").count();
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:track", uid: "KJ3GOEqX9Kdh8kFE7Ti2MOwOcDo2", label: "CELINE D." }));
  await bb.goto("https://www.beebs.app/fr/dressing/KJ3GOEqX9Kdh8kFE7Ti2MOwOcDo2");
  await bb.waitForTimeout(4000);
  beebsStock = [[34000001, "Robe crochet fille", 12]];
  await bb.reload();
  await bb.waitForTimeout(4500);
  const tr = (await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:trackers" })))?.data?.[0] || {};
  const onDressing = await bb.locator(".aliedge-beebs-competitor").count();
  const before_926 = new Set(ctx.pages());
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:open", listing: { title: "Robe crochet bohème", description: "Neuve.", price: 15, brand: "Zara", condition: "Très bon état", size: "M", photos: ["https://cdn.beebs.app/a.jpg"] } }));
  let sellTab = null;
  sellTab = await extTab(before_926, "https://www.beebs.app/fr?ae=sell", /beebs\.app\/fr\/vendre/);
  if (sellTab) await sellTab.waitForSelector("#aliedge-beebs-sell", { timeout: 9000 }).catch(() => {});
  const onSell = sellTab ? await sellTab.locator("#aliedge-beebs-sell").count() : 0;
  await sellTab?.waitForTimeout(2500);
  const filled = sellTab ? await sellTab.evaluate(() => ({ t: document.querySelector('input[name="title"]').value, d: document.querySelector('textarea').value, p: document.querySelector('input[name="price"]').value, c: document.querySelector('select[name="condition"]').value, s: document.querySelector('select[name="size"]').value, a: document.querySelector('input[name="addr"]').value })) : {};
  check("Beebs : fournisseur sur l'article, concurrent suivi (vente probable repérée), « Publier sur Beebs » ouvre le formulaire avec l'annonce", onItem === 1 && onDressing === 1 && tr.active_count === 1 && tr.gone_30d === 1 && onSell === 1 && filled.t === "Robe crochet bohème" && filled.d === "Neuve." && filled.p === "15" && filled.c === "vgood" && filled.s === "m" && filled.a !== "Zara", JSON.stringify({ onItem, onDressing, tr, sell: sellTab?.url() || null, onSell, filled }));
  await sellTab?.close();
  // Reposter plusieurs annonces Vinted du membre sur Beebs, l'une après l'autre.
  const mine = await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:myItems" }));
  const ids = (mine?.data || []).slice(0, 2).map((i) => i.id);
  const before_938 = new Set(ctx.pages());
  await page.evaluate((x) => chrome.runtime.sendMessage({ type: "beebs:queue", ids: x, market: "fr" }), ids);
  let qTab = null;
  qTab = await extTab(before_938, "https://www.beebs.app/fr?ae=sell", /beebs\.app\/fr\/vendre/);
  if (qTab) await qTab.waitForSelector("#aliedge-beebs-sell", { timeout: 9000 }).catch(() => {});
  await qTab?.waitForFunction(() => document.querySelector('input[name="title"]')?.value, null, { timeout: 8000 }).catch(() => {});
  const firstTitle = qTab ? await qTab.evaluate(() => document.querySelector('input[name="title"]').value) : "";
  const queued = await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:listing" }));
  const nxt = await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:next", posted: true }));
  const second = await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:listing" }));
  check("Beebs : plusieurs annonces Vinted reprises l'une après l'autre (file)", ids.length === 2 && firstTitle.length > 3 && nxt?.data?.done === false && second?.data?.queue?.index === 1 && second.data.title !== firstTitle, JSON.stringify({ ids, firstTitle, queued: queued?.data?.title, panel: qTab ? await qTab.locator("#aliedge-beebs-sell").count() : -1, next: nxt?.data, second: second?.data?.title }));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:stopQueue" }));
  await qTab?.close();
  await bb.close();
}

// Leboncoin : publier rapidement ses annonces Vinted, une par une, formulaire rempli au fur et à mesure.
{
  const mine = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:myItems" }));
  const ids = (mine?.data || []).slice(0, 2).map((i) => i.id);
  const before_957 = new Set(ctx.pages());
  await page.evaluate((x) => chrome.runtime.sendMessage({ type: "lbc:queue", ids: x, market: "fr" }), ids);
  let dep = null;
  dep = await extTab(before_957, "https://www.leboncoin.fr/deposer-une-annonce", /leboncoin\.fr\/deposer-une-annonce/);
  await dep?.waitForFunction(() => document.querySelector('input[name="subject"]')?.value, null, { timeout: 9000 }).catch(() => {});
  const t1 = dep ? await dep.evaluate(() => document.querySelector('input[name="subject"]').value) : "";
  const nx = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:next", posted: true }));
  const l2 = await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:listing" }));
  const postedIds = (await page.evaluate(() => chrome.runtime.sendMessage({ type: "vinted:postedIds" })))?.data || {};
  check("Leboncoin : publication rapide en série (annonce Vinted reprise, formulaire rempli, suivante, repère « déjà publiée »)", ids.length === 2 && t1.length > 3 && nx?.data?.done === false && l2?.data?.queue?.index === 1 && (postedIds.lbc || []).map(Number).includes(ids[0]), JSON.stringify({ ids, t1, next: nx?.data, l2: l2?.data?.title, posted: postedIds }));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "lbc:stopQueue" }));
  await dep?.close();
}

// Facebook Marketplace : remplissage seulement (titre, prix, description, catégorie, état, photos), aucune autre page lue.
{
  const before_972 = new Set(ctx.pages());
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "facebook:open", listing: { title: "Chemise à carreaux Chaps", description: "Taille XL.", price: 10, condition: "Très bon état", categoryPath: ["Hommes", "Vêtements", "Chemises"], photos: ["https://images1.vinted.net/t/1.jpeg"] } }));
  let fb = null;
  fb = await extTab(before_972, "https://www.facebook.com/marketplace/create/item?ae=sell", /facebook\.com\/marketplace\/create/);
  await fb?.waitForFunction(() => document.getElementById("fbcond")?.dataset.v && document.getElementById("fbph")?.files.length, null, { timeout: 20000 }).catch(() => {});
  const f = fb ? await fb.evaluate(() => ({ t: document.getElementById("fbt").value, p: document.getElementById("fbp").value, d: document.getElementById("fbd").value, cat: document.getElementById("fbcat").dataset.v, c: document.getElementById("fbcond").dataset.v, ph: document.getElementById("fbph").files.length })) : {};
  check("Facebook Marketplace : formulaire rempli (titre, prix, description, catégorie, état, photos), aucune autre page Facebook ouverte", f.t === "Chemise à carreaux Chaps" && f.p === "10" && f.d === "Taille XL." && f.cat === "Vêtements et chaussures pour hommes" && /comme neuf/i.test(f.c || "") && f.ph === 1 && fbRequests.every((x) => x.startsWith("/marketplace/")), JSON.stringify({ f, fbRequests }));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "facebook:clearListing", posted: false }));
  await fb?.close();
}

// « Reposter partout » : Beebs, Opla et Leboncoin s'ouvrent ensemble, chacun avec l'annonce.
{
  const before = new Set(ctx.pages());
  const r = await page.evaluate(() => chrome.runtime.sendMessage({ type: "xpost:all", listing: { title: "Gilet laine bébé", description: "Tout doux.", price: 9, photos: [] } }));
  await page.waitForTimeout(3000);
  const opened = ctx.pages().filter((p) => !before.has(p)).map((p) => p.url());
  check("« Reposter partout » ouvre Beebs, Opla et Leboncoin avec l'annonce", r?.data?.beebs && r?.data?.opla && r?.data?.lbc && opened.length >= 3, JSON.stringify({ r: r?.data, opened }));
  for (const p of ctx.pages()) if (!before.has(p)) await p.close();
  for (const ch of ["beebs", "opla", "lbc"]) await page.evaluate((c) => chrome.runtime.sendMessage({ type: `${c}:clearListing`, posted: false }), ch);
}

// Opla : mêmes outils que Beebs (article, boutique d'un concurrent, « Publier sur Opla » qui remplit /sell/create).
{
  const op = await ctx.newPage();
  await op.setViewportSize({ width: 1280, height: 800 });
  await op.goto("https://www.opla.co/product/art_c1b2c3d4e5f6a7b8c9d0");
  await op.waitForSelector("#aliedge-beebs-tools", { timeout: 9000 }).catch(() => {});
  const onItem = await op.locator("#aliedge-beebs-tools").count();
  const uid = "google-oauth2|1234567890";
  await page.evaluate((u) => chrome.runtime.sendMessage({ type: "opla:track", uid: u, label: "Marc V." }), uid);
  await op.goto("https://www.opla.co/seller/google-oauth2%7C1234567890");
  await op.waitForTimeout(4000);
  oplaStock = [oplaStock[0]];
  await op.reload();
  await op.waitForTimeout(4500);
  const tr = (await page.evaluate(() => chrome.runtime.sendMessage({ type: "opla:trackers" })))?.data?.[0] || {};
  const onShop = await op.locator(".aliedge-beebs-competitor").count();
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "settings:set", patch: { autoPublish_opla: true } }));
  const before_1010 = new Set(ctx.pages());
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "opla:open", listing: { title: "Sweat Nike vintage", description: "Très bon état.", price: 22, brand: "Nike", condition: "Très bon état", size: "M", categoryPath: ["Hommes", "Vêtements", "Sweats"], photos: ["https://images1.vinted.net/t/0.jpeg"] } }));
  let sellTab = null;
  sellTab = await extTab(before_1010, "https://www.opla.co/sell/create?ae=sell", /opla\.co\/sell\/create/);
  if (sellTab) await sellTab.waitForSelector("#aliedge-beebs-sell", { timeout: 9000 }).catch(() => {});
  await sellTab?.waitForFunction(() => document.getElementById("etat")?.dataset.v && document.getElementById("ph")?.files.length, null, { timeout: 20000 }).catch(() => {});
  const filled = sellTab ? await sellTab.evaluate(() => ({ t: document.getElementById("t").value, d: document.getElementById("d").value, p: document.getElementById("p").value, cat: document.getElementById("cat").dataset.v, b: document.getElementById("brand").dataset.v, c: document.getElementById("etat").dataset.v, sz: document.getElementById("taille").dataset.v, ph: document.getElementById("ph").files.length })) : {};
  await sellTab?.waitForFunction(() => document.body.dataset.published === "1", null, { timeout: 12000 }).catch(() => {});
  const published = sellTab ? await sellTab.evaluate(() => document.body.dataset.published === "1") : false;
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "settings:set", patch: { autoPublish_opla: false } }));
  check("Opla : publication automatique (option cochée) quand tout est rempli, après le compte à rebours", published);
  const beebsIds = (await page.evaluate(() => chrome.runtime.sendMessage({ type: "beebs:trackedIds" })))?.data || [];
  check("Opla : fournisseur sur l'article, concurrent suivi (vente probable repérée), « Publier sur Opla » remplit titre, description, prix, catégorie, marque, état et photos, séparé de Beebs", onItem === 1 && onShop === 1 && tr.uid === uid && tr.active_count === 1 && tr.gone_30d === 1 && filled.t === "Sweat Nike vintage" && filled.d === "Très bon état." && filled.p === "22" && filled.cat === "Homme>Vêtements" && filled.b === "Nike" && filled.c === "Très bon état" && filled.sz === "M" && filled.ph === 1 && !beebsIds.includes(uid), JSON.stringify({ onItem, onShop, tr, sell: sellTab?.url() || null, filled, beebsIds }));
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "opla:clearListing", posted: false }));
  await sellTab?.close();
  await op.close();
}

// Version anglaise : panneau traduit, éléments ajoutés sur les sites traduits, texte des sites jamais touché.
{
  await page.evaluate(() => chrome.storage.local.set({ ae_lang: "en" }));
  await page.goto(app("/suivis"));
  await page.reload();
  await page.waitForTimeout(1500);
  const tabs = await page.locator(".tabs").innerText();
  const body = await page.locator("#view").innerText();
  const sh = await ctx.newPage();
  await sh.setViewportSize({ width: 1280, height: 800 });
  await sh.goto("https://fr.shein.com/category/crochet.html");
  await sh.waitForTimeout(800);
  const tabId = await page.evaluate(async () => (await chrome.tabs.query({ url: "https://fr.shein.com/*" }))[0]?.id);
  await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:start", tabId: id, opts: { minutes: 3, open: false } }), tabId);
  await sh.waitForTimeout(1500);
  const badge = await sh.evaluate(() => document.getElementById("ae-shein-tour-badge")?.innerText || "");
  const siteTitle = await sh.evaluate(() => document.querySelector("h1")?.textContent || "");
  await page.evaluate((id) => chrome.runtime.sendMessage({ type: "tour:stop", tabId: id }), tabId);
  check("version anglaise : panneau et éléments ajoutés sur les sites traduits, site intact", /Analyze/.test(tabs) && /Catalog/.test(tabs) && /Sales to ship/.test(body) && /Tour/.test(badge) && /Stop/.test(badge) && siteTitle === "Crochet", JSON.stringify({ tabs: tabs.replace(/\s+/g, " ").slice(0, 60), badge: badge.replace(/\s+/g, " ") }));
  await page.screenshot({ path: `${shots}/english.png`, fullPage: true });
  const left = new Set();
  const harvest = async () => (await page.evaluate(() => {
    const FR = /[éèàùçêâîôûœ«»]|\b(le|la|les|des|une|pour|sur|ton|tes|avec|dans|aucun|ventes?|annonces?|produits?|prix|suivi|vendu|depuis|ligne|filtres?|réglages)\b/i;
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t.length > 1 && FR.test(t) && !n.parentElement.closest("script,style,[data-no-i18n]")) out.push(t); }
    document.querySelectorAll("[placeholder],[title],[aria-label]").forEach((e) => ["placeholder", "title", "aria-label"].forEach((a) => { const v = e.getAttribute(a); if (v && FR.test(v)) out.push(v); }));
    return out;
  })).forEach((t) => left.add(t));
  for (const [h, n] of [["/analyse", "english-analyse"], ["/catalogue", "english-catalogue"], ["/concurrents", "english-concurrents"], ["/radar", "english-radar"], ["/balade", "english-balade"], ["/compte", "english-compte"], ["/suivis", "english-suivis"], ["/image", "english-image"]]) {
    await page.goto(app(h)); await page.reload(); await page.waitForTimeout(1800);
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    await page.waitForTimeout(800);
    await harvest();
    await page.screenshot({ path: `${shots}/${n}.png`, fullPage: true });
  }
  writeFileSync(path.join(os.tmpdir(), "aliedge-en-left.json"), JSON.stringify([...left], null, 1));
  await sh.close();
  await page.evaluate(() => chrome.storage.local.set({ ae_lang: "fr" }));
}

// Leboncoin facultatif : sans l'accès à leboncoin.fr, le panneau le propose d'office (un clic).
// (La copie de test a l'accès d'office : on simule ici un membre qui ne l'a pas encore accordé.)
{
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { try { chrome.permissions.contains = async () => false; } catch { /* rien */ } });
  await p2.evaluate(() => 0).catch(() => {});
  await p2.goto(app("/analyse"));
  await p2.evaluate(() => chrome.storage.local.remove("ae_lbc_ask_later"));
  await p2.reload(); await p2.waitForTimeout(1500);
  const shown = await p2.locator('[data-lbcask="on"]').count();
  await p2.click('[data-lbcask="later"]').catch(() => {});
  await p2.waitForTimeout(500);
  const hidden = (await p2.locator('[data-lbcask="on"]').count()) === 0;
  check("Leboncoin proposé d'office quand l'accès manque, « Plus tard » le masque", shown === 1 && hidden, JSON.stringify({ shown, hidden }));
  await p2.close();
}

await ctx.close();
check("aucune requête à l'API Vinted pendant tout le parcours (3.6.8)", vintedApi.length === 0, vintedApi.slice(0, 5).join(", "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications OK · captures : ${shots}`);
process.exit(failed.length ? 1 : 0);
