# AliEdge 3

Extension Chrome pour revendeurs Vinted : sur une fiche AliExpress, Temu ou Shein, elle dit à combien le produit se revend sur Vinted, la marge réelle et s'il s'est déjà vendu. By Ivan Bara.

## Ce qu'elle fait

- **Analyse** d'une fiche produit (bouton flottant ou panneau latéral) : annonces Vinted comparables, prix conseillé, marge, ROI, score sur 100, seuil de rentabilité.
- **Ventes constatées** : chaque annonce comparable est suivie ; quand elle passe « vendue », le catalogue le sait (membres volontaires + robot serveur).
- **Catalogue** des produits déjà vendus sur Vinted, avec leur source AliExpress / Temu / Shein, ventes 7 j / 30 j et marge estimée.
- **Suivis** : alerte quand le prix Vinted d'un produit bouge de plus de 10 %.
- **Sur Vinted** : bouton « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein) sur chaque annonce.
- **Barapics** : un clic envoie le titre et les photos du produit au studio photo, sans réimport.

## Comptes et offres

Même compte que Barapics (Supabase, projet « Ivan Bara »). Gratuit : 5 analyses par jour et les 3 premiers produits du catalogue. Pro : analyses illimitées, catalogue complet, ventes constatées. Pro s'obtient par Whop (offre avec la métadonnée `plan: aliedge`), par l'admin Barapics (onglet AliEdge) ou avec le mois offert Skool.

Le serveur (tables, fonctions, robot) vit dans le repo Barapics : migration `0017_aliedge.sql`, route `/api/public/aliedge-robot`.

## Développement

Aucune compilation : charger le dossier dans `chrome://extensions` (mode développeur → « Charger l'extension non empaquetée »).

```sh
node --test tests/*.test.mjs   # calculs, lecture des pages, Vinted
node tests/e2e.mjs             # extension chargée dans Chromium, sites simulés (Playwright)
./tools/pack.sh                # dist/aliedge-<version>.zip pour le Chrome Web Store
```
