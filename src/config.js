// Configuration publique (aucun secret ici : la clé publishable est faite pour être distribuée).
export const SUPABASE_URL = "https://qwjsryjrkwbfibavqici.supabase.co";
export const SUPABASE_KEY = "sb_publishable_SEmlqQiGgsxgHpOmTIYddQ_0ovIWr_D";

export const SITE_URL = "https://barapics.com";
export const ALIEDGE_PAGE = "https://ivanbara.com/aliedge";
export const BUY_URL = ALIEDGE_PAGE;
export const PRIVACY_URL = "https://ivanbara.com/aliedge/confidentialite";
export const RESET_URL = `${SITE_URL}/reset-password`;
export const BARAPICS_URL = `${SITE_URL}/app`;
export const SKOOL_URL = "https://www.skool.com/vinteddrop-accompagnement-5463/about";

export const MARKETS = {
  fr: { host: "www.vinted.fr", label: "France", currency: "EUR" },
  be: { host: "www.vinted.be", label: "Belgique", currency: "EUR" },
  de: { host: "www.vinted.de", label: "Allemagne", currency: "EUR" },
  es: { host: "www.vinted.es", label: "Espagne", currency: "EUR" },
  it: { host: "www.vinted.it", label: "Italie", currency: "EUR" },
  nl: { host: "www.vinted.nl", label: "Pays-Bas", currency: "EUR" },
  pt: { host: "www.vinted.pt", label: "Portugal", currency: "EUR" },
  lu: { host: "www.vinted.lu", label: "Luxembourg", currency: "EUR" },
  at: { host: "www.vinted.at", label: "Autriche", currency: "EUR" },
  pl: { host: "www.vinted.pl", label: "Pologne", currency: "PLN" },
  uk: { host: "www.vinted.co.uk", label: "Royaume-Uni", currency: "GBP" },
};

export const DEFAULT_SETTINGS = {
  market: "fr",
  condition: "all",          // all | new | very_good
  costPerSale: 0.5,          // emballage, étiquette… (€ par vente)
  shareAnalyses: true,       // chaque analyse enrichit le catalogue communautaire
  helpDetectSales: true,     // une fois par heure : dressing de quelques vendeurs suivis (voir confidentialité)
  showPill: true,            // bouton flottant sur les fiches produit
};
