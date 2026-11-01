// Relie une vente Vinted au produit fournisseur d'où elle vient, pour la confier à la warehouse en un clic.
// 1. Lien enregistré : titre de l'annonce identique à un titre déjà relié (annonce créée avec Barapics,
//    ou association faite à la main) → sûr.
// 2. Sinon, suggestion : le produit analysé dont le titre ressemble le plus à celui de l'annonce.

const STOP = new Set(("de du des la le les un une et en pour avec sans au aux a à sur par ou d l the and for with of in on to " +
  "neuf neuve new taille size femme homme women men woman man fille garcon enfant kids lot set tres bon etat " +
  "nouveau nouvelle mode style 1pc pcs pc piece pieces").split(/\s+/));

/** Mots utiles d'un titre, sans accents ni mots vides. */
export function titleWords(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Clé d'un titre d'annonce (sert à retrouver un lien enregistré). */
export function titleKey(t) {
  return titleWords(t).join(" ").slice(0, 160);
}

/** Ressemblance entre deux titres, de 0 à 1 (coefficient de Dice sur les mots : pluriel retiré, racine de 5 lettres). */
export function similarity(a, b) {
  const stem = (w) => w.replace(/(?<=...)[sx]$/, "").slice(0, 5);
  const A = new Set(titleWords(a).map(stem)), B = new Set(titleWords(b).map(stem));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return (2 * common) / (A.size + B.size);
}

/**
 * Produit fournisseur d'une vente.
 * @param {{title:string}} sale
 * @param {Record<string, object>} links  titleKey → produit fournisseur relié
 * @param {Array<{title?:string, query?:string, url:string}>} candidates  produits analysés
 * @returns {null | (object & {sure:boolean, score:number})}
 */
export function matchSale(sale, links = {}, candidates = []) {
  const key = titleKey(sale?.title);
  if (key && links[key]?.url) return { ...links[key], sure: true, score: 1 };
  let best = null;
  for (const c of candidates) {
    if (!c?.url) continue;
    const s = Math.max(similarity(sale?.title, c.title), similarity(sale?.title, c.query));
    if (!best || s > best.score) best = { ...c, score: s };
  }
  // Liens enregistrés proches (annonce dont le titre a été retouché après coup).
  for (const [k, l] of Object.entries(links)) {
    const s = similarity(sale?.title, k) * 0.98;
    if (l?.url && (!best || s > best.score)) best = { ...l, score: s };
  }
  if (!best || best.score < 0.5) return null;
  return { ...best, sure: false, score: Math.round(best.score * 100) / 100 };
}
