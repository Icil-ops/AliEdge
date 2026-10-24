// Calculs de rentabilité. Module pur (testé avec node --test).

// Taux indicatifs vers l'euro pour les prix affichés dans une autre devise.
export const FX_TO_EUR = { EUR: 1, USD: 0.92, GBP: 1.17, PLN: 0.23, CHF: 1.05 };

export function toEur(amount, currency = "EUR") {
  const rate = FX_TO_EUR[String(currency || "EUR").toUpperCase()];
  if (!Number.isFinite(amount) || !rate) return null;
  return round2(amount * rate);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Lit un prix affiché ("12,99 €", "€12.99", "US $3.45", "1 299,00 zł") et renvoie { amount, currency }. */
export function parsePrice(text) {
  if (text == null) return null;
  if (typeof text === "number") return Number.isFinite(text) && text > 0 ? { amount: round2(text), currency: null } : null;
  const s = String(text).replace(/ | /g, " ").trim();
  if (!s) return null;
  let currency = null;
  if (/€|eur\b/i.test(s)) currency = "EUR";
  else if (/£|gbp\b/i.test(s)) currency = "GBP";
  else if (/\$|usd\b/i.test(s)) currency = "USD";
  else if (/zł|pln\b/i.test(s)) currency = "PLN";
  else if (/chf\b/i.test(s)) currency = "CHF";
  const m = s.match(/\d[\d\s.,]*/);
  if (!m) return null;
  let num = m[0].replace(/\s/g, "");
  const lastComma = num.lastIndexOf(",");
  const lastDot = num.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Le dernier séparateur est le séparateur décimal.
    num = lastComma > lastDot ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (lastComma > -1) {
    num = /,\d{1,2}$/.test(num) ? num.replace(/,(?=\d{3}\b)/g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(num)) {
    num = num.replace(/\./g, ""); // "1.299" = séparateur de milliers
  }
  const amount = parseFloat(num);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
  return { amount: round2(amount), currency };
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Retire les prix aberrants (méthode des quartiles), sauf s'il reste trop peu de prix. */
export function trimOutliers(prices) {
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (sorted.length < 5) return sorted;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept = sorted.filter((p) => p >= lo && p <= hi);
  return kept.length >= 3 ? kept : sorted;
}

export function priceStats(prices) {
  const kept = trimOutliers(prices);
  if (!kept.length) return null;
  const sum = kept.reduce((a, b) => a + b, 0);
  return {
    count: kept.length,
    removed: prices.length - kept.length,
    min: round2(kept[0]),
    p25: round2(quantile(kept, 0.25)),
    median: round2(quantile(kept, 0.5)),
    p75: round2(quantile(kept, 0.75)),
    max: round2(kept[kept.length - 1]),
    mean: round2(sum / kept.length),
  };
}

/** Prix arrondi comme sur Vinted : à 0,50 € près sous 20 €, à l'euro au-dessus. */
export function friendlyPrice(p) {
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p >= 20) return Math.round(p);
  return Math.max(1, Math.round(p * 2) / 2);
}

/**
 * Prix conseillé : légèrement sous la médiane des annonces comparables pour vendre vite,
 * jamais sous le premier quartile. Il suit le marché, pas le coût : si le marché paie moins
 * que le coût, l'analyse le dit (verdict « à perte ») au lieu de conseiller un prix invendable.
 */
export function recommendedPrice(stats) {
  if (!stats) return null;
  return round2(friendlyPrice(Math.max(stats.p25, stats.median * 0.95)));
}

/** Prix de vente minimum pour ne pas perdre d'argent (arrondi au-dessus, comme sur Vinted). */
export function breakEvenPrice(cost) {
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return cost >= 20 ? Math.ceil(cost) : Math.ceil(cost * 2) / 2;
}

/**
 * Score de 0 à 100.
 * - marge relative (45 pts) : la part du prix de vente qui reste dans ta poche
 * - marge absolue (20 pts) : 8 € et plus par vente = plein score
 * - demande (20 pts) : ventes constatées, ou à défaut favoris moyens des annonces
 * - concurrence (15 pts) : moins d'annonces actives identiques = mieux
 */
export function scoreOpportunity({ sell, cost, activeCount = 0, soldCount = 0, avgFavourites = 0 }) {
  if (!sell || sell <= 0) return { score: 0, verdict: "unknown" };
  const margin = sell - cost;
  const rel = Math.max(0, Math.min(1, margin / sell));
  const relPts = Math.min(45, (rel / 0.6) * 45);
  const absPts = Math.max(0, Math.min(20, (margin / 8) * 20));
  const demand = soldCount > 0 ? Math.min(1, soldCount / 10) : Math.min(1, avgFavourites / 12);
  const demandPts = demand * 20;
  const compPts = activeCount <= 0 ? 8 : Math.max(0, 15 - Math.max(0, activeCount - 5) * 0.4);
  let score = Math.round(relPts + absPts + demandPts + compPts);
  if (margin <= 0) score = Math.min(score, 15);
  score = Math.max(0, Math.min(100, score));
  const verdict = margin <= 0 ? "loss" : score >= 75 ? "excellent" : score >= 55 ? "good" : score >= 35 ? "average" : "weak";
  return { score, verdict };
}

export const VERDICT_LABEL = {
  excellent: "Excellente affaire",
  good: "Bonne affaire",
  average: "Rentable, sans plus",
  weak: "Marge trop faible",
  loss: "À perte",
  unknown: "Pas assez de données",
};

/** Analyse complète à partir du coût et des annonces Vinted retenues. */
export function analyse({ productPrice, shipping = 0, costPerSale = 0, items = [], soldItems = [] }) {
  const cost = round2((productPrice || 0) + (shipping || 0) + (costPerSale || 0));
  const active = items.filter((i) => !i.excluded && Number.isFinite(i.price));
  const sold = soldItems.filter((i) => Number.isFinite(i.price));
  const activeStats = priceStats(active.map((i) => i.price));
  const soldStats = priceStats(sold.map((i) => i.price));
  // Les prix réellement vendus font foi quand on en a assez.
  const ref = soldStats && soldStats.count >= 3 ? soldStats : activeStats;
  const sell = recommendedPrice(ref);
  const favs = active.map((i) => i.favourites).filter(Number.isFinite);
  const avgFavourites = favs.length ? favs.reduce((a, b) => a + b, 0) / favs.length : 0;
  const { score, verdict } = scoreOpportunity({
    sell, cost, activeCount: active.length, soldCount: sold.length, avgFavourites,
  });
  const margin = sell != null ? round2(sell - cost) : null;
  return {
    cost,
    sell,
    margin,
    marginPct: sell ? Math.round(((sell - cost) / sell) * 100) : null,
    roi: cost > 0 && margin != null ? Math.round((margin / cost) * 100) : null,
    breakEven: breakEvenPrice(cost),
    activeStats,
    soldStats,
    reference: ref === soldStats && soldStats ? "sold" : "active",
    avgFavourites: round2(avgFavourites),
    score,
    verdict,
  };
}

/** Histogramme en n classes pour le graphique des prix. */
export function histogram(prices, bins = 8) {
  const kept = trimOutliers(prices);
  if (kept.length < 2) return [];
  const min = kept[0];
  const max = kept[kept.length - 1];
  if (max === min) return [{ from: min, to: max, count: kept.length }];
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: round2(min + i * width), to: round2(min + (i + 1) * width), count: 0 }));
  for (const p of kept) out[Math.min(bins - 1, Math.floor((p - min) / width))].count++;
  return out;
}
