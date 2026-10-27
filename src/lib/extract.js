// Lecture d'une fiche produit AliExpress, Temu ou Shein.
// extractProduct() est injectée telle quelle dans la page (monde MAIN) : elle ne doit
// dépendre d'aucune variable extérieure.

export function detectPlatform(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname;
  if (/(^|\.)aliexpress\.(com|fr|us|ru)$/.test(h) && /\/item\/(\d+)\.html/.test(u.pathname)) return "aliexpress";
  if (/(^|\.)temu\.com$/.test(h) && (/-g-\d+\.html/.test(u.pathname) || u.searchParams.has("goods_id"))) return "temu";
  if (/(^|\.)shein\.(com|fr)$/.test(h) && /-p-\d+(-cat-\d+)?\.html/.test(u.pathname)) return "shein";
  return null;
}

export function sourceIdFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  return (
    u.pathname.match(/\/item\/(\d+)\.html/)?.[1] ||
    u.pathname.match(/-g-(\d+)\.html/)?.[1] ||
    u.searchParams.get("goods_id") ||
    u.pathname.match(/-p-(\d+)(?:-cat-\d+)?\.html/)?.[1] ||
    null
  );
}

/** URL canonique sans paramètres de suivi. */
export function canonicalUrl(url) {
  const platform = detectPlatform(url);
  const id = sourceIdFromUrl(url);
  if (!platform || !id) return url;
  const u = new URL(url);
  if (platform === "aliexpress") return `https://${u.hostname.replace(/^[a-z]{2}\./, "fr.")}/item/${id}.html`;
  if (platform === "temu") return `https://www.temu.com${u.pathname.includes("-g-") ? u.pathname : `/goods.html?goods_id=${id}`}`;
  return `https://${u.hostname}${u.pathname}`;
}

export function extractProduct() {
  const out = { title: null, price: null, priceText: null, currency: null, image: null, images: [], rating: null, orders: null };
  const txt = (el) => (el && (el.textContent || "").replace(/\s+/g, " ").trim()) || null;
  const meta = (name) => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute("content") || null;
  const abs = (src) => {
    if (!src) return null;
    let s = String(src).trim();
    if (s.startsWith("//")) s = "https:" + s;
    if (!/^https:\/\//.test(s)) return null;
    // Vignettes AliExpress : « …jpg_220x220.jpg » → image d'origine.
    return s.replace(/(\.(jpe?g|png|webp))_\d+x\d+[^/]*$/i, "$1").replace(/\?.*$/, (q) => (/kwcdn|ltwebstatic/.test(s) ? "" : q));
  };
  const pushImg = (src) => {
    const a = abs(src);
    if (a && !out.images.includes(a) && out.images.length < 12) out.images.push(a);
  };

  // 1) JSON-LD Product (Temu, Shein et certaines pages AliExpress)
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent || "null");
      const list = Array.isArray(data) ? data : data && data["@graph"] ? data["@graph"] : [data];
      for (const d of list) {
        if (!d || !/Product/i.test(String(d["@type"]))) continue;
        out.title = out.title || d.name || null;
        const imgs = Array.isArray(d.image) ? d.image : d.image ? [d.image] : [];
        imgs.forEach((i) => pushImg(typeof i === "string" ? i : i?.url));
        const offers = Array.isArray(d.offers) ? d.offers[0] : d.offers;
        const p = offers?.price ?? offers?.lowPrice;
        if (p != null && out.price == null) { out.price = Number(p); out.currency = offers.priceCurrency || null; }
        if (d.aggregateRating?.ratingValue) out.rating = Number(d.aggregateRating.ratingValue);
      }
    } catch { /* JSON-LD invalide : on continue */ }
  }

  const host = location.hostname;
  // Variante choisie (couleur…) : sa photo passe en premier, et sur Shein la galerie affichée
  // remplace les données de la page (qui restent celles de la première couleur ouverte).
  const domFirst = [];
  try {
    if (/aliexpress/.test(host)) {
      document.querySelectorAll('[class*="sku-item--selected"] img, [class*="sku-item--image"][class*="selected"] img, [class*="sku-property-image"][class*="selected"] img').forEach((i) => domFirst.push(i.getAttribute("src")));
    } else if (/shein/.test(host)) {
      document.querySelectorAll('.product-intro__main-item img, [class*="main-picture"] img, .crop-image-container img, .product-intro__thumbs-item img, [class*="thumbs-item"] img, [class*="thumbs"] .crop-image-container img').forEach((i) => domFirst.push(i.getAttribute("data-src") || i.getAttribute("src")));
    } else if (/temu/.test(host)) {
      document.querySelectorAll('[class*="sku"][aria-checked="true"] img, [class*="sku"][class*="selected"] img').forEach((i) => domFirst.push(i.getAttribute("src")));
    }
  } catch { /* galerie introuvable */ }
  if (domFirst.length) {
    const rest = out.images.splice(0);
    domFirst.forEach(pushImg);
    if (!/shein/.test(host)) rest.forEach(pushImg);
  }
  try {
    if (/aliexpress/.test(host)) {
      out.title = txt(document.querySelector('h1[data-pl="product-title"]')) || txt(document.querySelector('[class*="title--wrap"] h1')) || out.title;
      const priceEl = document.querySelector('[class*="price-default--current"], [class*="price--currentPriceText"], .product-price-current, [class*="uniform-banner-box-price"], [class*="es--wrap"] [class*="notranslate"]');
      if (priceEl) out.priceText = txt(priceEl);
      document.querySelectorAll('[class*="slider--img"] img, [class*="magnifier--image"], [class*="image-view--previewBox"] img').forEach((i) => pushImg(i.getAttribute("src")));
      const rp = window.runParams && window.runParams.data;
      if (rp) {
        out.title = out.title || rp.productInfoComponent?.subject || rp.titleModule?.subject;
        (rp.imageModule?.imagePathList || rp.imageComponent?.imagePathList || []).forEach(pushImg);
        const act = rp.priceComponent?.discountPrice || rp.priceModule;
        const v = act?.minActivityAmount || act?.minAmount;
        if (v?.value && out.price == null) { out.price = Number(v.value); out.currency = v.currency || null; }
      }
      out.orders = txt(document.querySelector('[class*="reviewer--sold"], [class*="sold--"], .product-reviewer-sold'));
    } else if (/temu/.test(host)) {
      out.title = out.title || txt(document.querySelector("h1")) || meta("og:title");
      const priceEl = document.querySelector('[data-type="price"], [class*="goods-price"] [class*="price"], [aria-label*="€"]');
      if (priceEl) out.priceText = priceEl.getAttribute("aria-label") || txt(priceEl);
      const raw = window.rawData && window.rawData.store;
      const goods = raw && (raw.goods || raw.goodsInfo);
      if (goods) {
        out.title = out.title || goods.goodsName;
        (goods.gallery || goods.images || []).forEach((g) => pushImg(g.url || g));
      }
    } else if (/shein/.test(host)) {
      const intro = window.gbRawData && window.gbRawData.productIntroData;
      let detail = intro && intro.detail;
      // Shein change de couleur sans recharger : ces données décrivent alors une autre couleur.
      const urlId = location.pathname.match(/-p-(\d+)/)?.[1];
      if (detail && urlId && detail.goods_id && String(detail.goods_id) !== urlId) detail = null;
      if (detail) {
        out.title = out.title || detail.goods_name;
        if (!domFirst.length) pushImg(detail.original_img || detail.goods_img);
        const sp = detail.salePrice || detail.retailPrice;
        if (sp && out.price == null) { out.price = Number(sp.amount); out.currency = sp.currency || null; }
        if (!domFirst.length) (intro.goods_imgs?.detail_image || []).forEach((g) => pushImg(g.origin_image || g.medium_image));
      }
      out.title = out.title || txt(document.querySelector("h1.product-intro__head-name, h1"));
      const priceEl = document.querySelector(".product-intro__head-mainprice .from, .product-intro__head-mainprice .original, [class*='productPrice'] [class*='price'], .product-intro__head-price");
      if (priceEl) out.priceText = txt(priceEl);
    }
  } catch { /* structure de page inattendue : les solutions de secours prennent le relais */ }

  out.title = out.title || meta("og:title") || document.title;
  if (!(domFirst.length && /shein/.test(host))) pushImg(meta("og:image"));
  if (!out.images.length) {
    const big = [...document.images].filter((i) => i.naturalWidth >= 300 && i.naturalHeight >= 300).slice(0, 4);
    big.forEach((i) => pushImg(i.currentSrc || i.src));
  }
  out.image = out.images[0] || null;
  if (out.price == null) {
    const p = meta("product:price:amount") || meta("og:price:amount");
    if (p) { out.price = Number(p); out.currency = meta("product:price:currency") || meta("og:price:currency"); }
  }
  out.title = out.title ? String(out.title).replace(/\s*[-|]\s*(AliExpress|Temu|SHEIN).*$/i, "").trim().slice(0, 300) : null;
  return out;
}
