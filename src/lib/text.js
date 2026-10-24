// Traitement des titres : requête de recherche Vinted et pertinence des annonces. Module pur.

const STOP = new Set(`
a au aux avec ce ces dans de des du en et for for la le les leur ma mon new nouveau nouvelle nouveaux nouvelles
of on ou par pour sa sans se ses son sur ta the to un une vos votre with 1pc 1pcs pcs pc piece pieces pièce pièces
lot set mode style tendance tendances qualité haute high quality hot sale vente offre promo gratuit livraison free shipping
2022 2023 2024 2025 2026 2027 ete été hiver automne printemps summer winter spring autumn fall
femme femmes homme hommes women woman men man ladies unisex enfant enfants kids
taille size grande grand petite petit plus cm mm
fashion trendy cute chic pu womens mens girls
`.split(/\s+/).filter(Boolean));

export function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s) {
  return normalise(s)
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Requête courte (4 à 6 mots porteurs) à partir d'un titre de fiche produit souvent interminable. */
export function buildQuery(title, max = 5) {
  const seen = new Set();
  const out = [];
  for (const t of tokens(title)) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.join(" ");
}

/** Pertinence d'un titre d'annonce par rapport à la requête (0 à 1). */
export function relevance(query, title) {
  const q = new Set(tokens(query));
  if (!q.size) return 0;
  const t = new Set(tokens(title));
  let hit = 0;
  for (const w of q) {
    if (t.has(w)) { hit++; continue; }
    // Correspondance partielle (pluriels, abréviations) : « robe » ↔ « robes ».
    for (const x of t) {
      if (x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x))) { hit += 0.7; break; }
    }
  }
  return Math.round((hit / q.size) * 100) / 100;
}

export function guessCategory(title) {
  const t = normalise(title);
  const rules = [
    ["Chaussures", /chaussure|basket|sneaker|botte|bottine|sandale|escarpin|mocassin|claquette|tong/],
    ["Sacs", /\bsac\b|sacoche|pochette|cabas|sac a dos|backpack|tote|banane/],
    ["Bijoux", /collier|bracelet|bague|boucle d oreille|pendentif|bijou|chaine/],
    ["Montres", /montre|watch/],
    ["Lunettes", /lunette|sunglass/],
    ["Beauté", /maquillage|rouge a levre|mascara|parfum|serum|creme|palette|vernis|perruque/],
    ["Maison", /coussin|lampe|bougie|vase|decoration|deco|rideau|tapis|cadre|organisateur|rangement/],
    ["High-tech", /ecouteur|casque|chargeur|cable|coque|telephone|iphone|samsung|bluetooth|enceinte|montre connectee/],
    ["Jouets", /jouet|peluche|poupee|lego|puzzle/],
    ["Sport", /legging|brassiere|yoga|fitness|sport|running/],
    ["Accessoires", /ceinture|echarpe|foulard|casquette|bonnet|chapeau|gant|barrette|chouchou/],
    ["Vêtements", /robe|jupe|pantalon|jean|short|t shirt|tee shirt|chemise|blouse|top|pull|gilet|sweat|hoodie|veste|manteau|doudoune|combinaison|ensemble|maillot|pyjama|lingerie|corset|body/],
  ];
  for (const [name, re] of rules) if (re.test(t)) return name;
  return "Autres";
}

/** Texte d'annonce Vinted prêt à coller (titre + description), à partir du produit. */
export function draftListing(product, price) {
  const words = buildQuery(product.title, 7).split(" ").filter(Boolean);
  const title = words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ").slice(0, 60);
  const lines = [
    `${title} neuf, jamais porté${product.category === "Vêtements" ? "" : " ni utilisé"}.`,
    "",
    "✔️ Article neuf",
    "📦 Envoi rapide et soigné sous 24/48 h",
    "💬 N'hésite pas si tu as une question ou pour un lot",
  ];
  if (price) lines.push("", `Prix : ${price.toFixed(2).replace(".", ",")} €`);
  return { title, description: lines.join("\n") };
}
