# AliEdge 3

Extension Chrome pour revendeurs Vinted : sur une fiche AliExpress, Temu ou Shein, elle dit à combien le produit se revend sur Vinted, la marge réelle et s'il s'est déjà vendu. By Ivan Bara.

## Ce qu'elle fait

- **Analyse** d'une fiche produit (bouton flottant ou panneau latéral) : annonces Vinted comparables, prix conseillé, marge, ROI, score sur 100, seuil de rentabilité.
- **Ventes constatées** : chaque annonce comparable est suivie avec son vendeur. Une fois par heure, l'extension lit le dressing de quelques vendeurs suivis (une requête revérifie toutes leurs annonces) ; les profils ouverts par les membres et un robot serveur complètent.
- **Catalogue** des produits déjà vendus sur Vinted, avec leur source AliExpress / Temu / Shein, ventes 7 j / 30 j et marge estimée.
- **Suivis** : alerte quand le prix Vinted d'un produit bouge de plus de 10 %.
- **Sur Vinted** : bouton « Trouver le fournisseur » (Google Lens, AliExpress, Temu, Shein) sur chaque annonce.
- **Barapics** : un clic envoie le titre et les photos du produit au studio photo, sans réimport.

## Comptes et offres

Même compte que Barapics (Supabase, projet « Ivan Bara »). **Gratuit pour le lancement** : tout est ouvert tant que le réglage `aliedge_free` vaut `true` (table `app_settings`). L'offre Pro (Whop avec la métadonnée `plan: aliedge`, admin Barapics, mois Skool) reste prête pour plus tard.

Page publique : https://ivanbara.com/aliedge · Chrome Web Store : https://chromewebstore.google.com/detail/okkbjdadgkjdmdfepgcfeabholbgfafg

Le serveur (tables, fonctions, robot) vit dans le repo Barapics : migration `0017_aliedge.sql`, route `/api/public/aliedge-robot`.

## Développement

Aucune compilation : charger le dossier dans `chrome://extensions` (mode développeur → « Charger l'extension non empaquetée »).

```sh
node --test tests/*.test.mjs   # calculs, lecture des pages, Vinted
node tests/e2e.mjs             # extension chargée dans Chromium, sites simulés (Playwright)
./tools/pack.sh                # dist/aliedge-<version>.zip pour le Chrome Web Store
```

## Publication automatique sur le Chrome Web Store

Chaque push sur `main` lance `.github/workflows/store.yml` : tests, paquet, puis envoi et soumission
via l'API Chrome Web Store v2 **si** la version de `manifest.json` est plus récente que celle du store.
Après la revue Google, Chrome met à jour l'extension tout seul chez les utilisateurs.

Pour sortir une version : `node tools/release.mjs patch "notes"` → commit → push sur `main`.

Secrets GitHub requis (Settings → Secrets and variables → Actions) : `CWS_CLIENT_ID`,
`CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`. Sans eux, l'étape ne fait rien.
