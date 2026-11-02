// AliEdge — version anglaise.
// Le français reste la langue source du code. Quand la langue choisie est l'anglais (réglage « Langue » du
// compte, ou Chrome qui n'est pas en français), ce script traduit à la volée les textes affichés par AliEdge :
// panneau, boutons ajoutés sur les sites, badge de la balade. Rien n'est traduit sur les pages des sites eux-mêmes.
// Script classique (pas un module) : chargé par le panneau, par les scripts de contenu et par la balade.
(function () {
  if (globalThis.AE_I18N) return;

  // Textes exacts (espaces normalisés). Une phrase absente reste en français.
  const EN = {
    // ── En-tête, onglets, barre du bas
    "Analyse": "Analyze", "Catalogue": "Catalog", "Radar": "Radar", "Concurrents": "Competitors", "Suivis": "Tracked", "Compte": "Account",
    "Gratuit": "Free", "Accès complet": "Full access", "Ouvrir en plein écran": "Open full screen", "Sections": "Sections",
    "Photos": "Photos", "Skool": "Skool", "Outils de la méthode": "Method tools",
    "Créer des photos réalistes du produit avec Barapics": "Create realistic product photos with Barapics",
    "La méthode VintedDrop : formation et entrepôt": "The VintedDrop method: training and warehouse",

    // ── Analyse
    "Ouvre un produit AliExpress, Temu ou Shein": "Open an AliExpress, Temu or Shein product",
    "AliEdge lit la fiche et te dit à combien elle se revend sur Vinted.": "AliEdge reads the product page and tells you what it resells for on Vinted.",
    "Recherche par image": "Image search", "Ou cherche directement": "Or search directly",
    "Prix d'achat": "Purchase price", "Prix d'achat (facultatif)": "Purchase price (optional)", "Livraison fournisseur": "Supplier shipping",
    "Recherche Vinted": "Vinted search", "Mots-clés": "Keywords", "Pays": "Country", "État": "Condition",
    "Tous": "All", "Tous états": "Any condition", "Neuf avec étiquette": "New with tags", "Neuf ou très bon": "New or very good", "Neuf ou très bon état": "New or very good condition",
    "Analyser sur Vinted": "Analyze on Vinted", "Relancer l'analyse": "Run the analysis again",
    "Prix non détecté : saisis le prix payé pour calculer la marge.": "Price not detected: enter the price paid to calculate the margin.",
    "Crée ton compte gratuit : 5 analyses par jour, sans carte bancaire.": "Create your free account: 5 analyses a day, no credit card.",
    "Créer mon compte": "Create my account", "Se connecter": "Sign in",
    "Recherche des annonces sur Vinted": "Searching listings on Vinted",
    "Tri des annonces vraiment comparables": "Keeping only truly comparable listings",
    "Calcul du prix conseillé et de la marge": "Calculating the recommended price and margin",
    "Passer à AliEdge Pro": "Upgrade to AliEdge Pro", "Ouvrir Vinted": "Open Vinted",
    "Marge par vente": "Margin per sale", "Prix conseillé": "Recommended price", "Prix de revente conseillé": "Recommended resale price",
    "Excellente affaire": "Excellent deal", "Bonne affaire": "Good deal", "Marge correcte": "Fair margin", "Marge trop faible": "Margin too low", "À perte": "Loss-making",
    "Annonces comparables": "Comparable listings", "Prix médian": "Median price", "Fourchette courante": "Usual range", "Ventes constatées": "Recorded sales",
    "Prix des annonces": "Listing prices", "barre violette : prix conseillé": "purple bar: recommended price",
    "Suivre": "Track", "Annonce": "Listing", "Texte d'annonce prêt à coller": "Listing text ready to paste",
    "Annonces Vinted retenues": "Vinted listings kept", "Décoche celles qui ne correspondent pas": "Untick the ones that don't match",
    "Garder cette annonce dans le calcul": "Keep this listing in the calculation", "Même photo": "Same photo",
    "Rentable à partir de": "Profitable from", "Résultat": "Result",
    "Peu d'annonces identiques : vérifie la liste ci-dessous et décoche celles qui ne correspondent pas.": "Few identical listings: check the list below and untick the ones that don't match.",
    "Aucune annonce comparable trouvée. Essaie des mots-clés plus simples (2 ou 3 mots).": "No comparable listing found. Try simpler keywords (2 or 3 words).",
    "Aucune photo du produit trouvée sur cette page. Ouvre la fiche produit puis relance l'analyse.": "No product photo found on this page. Open the product page and run the analysis again.",
    "Fiche produit pas encore chargée. Patiente une seconde puis réessaie.": "Product page not loaded yet. Wait a second and try again.",
    "Impossible de lire cette page. Recharge-la puis réessaie.": "Can't read this page. Reload it and try again.",
    "Ouvre d'abord une fiche produit.": "Open a product page first.",
    "Ouvre la fiche puis clique sur « Analyser sur Vinted » pour le calcul complet avec ton prix.": "Open the product page, then click “Analyze on Vinted” for the full calculation with your price.",
    "Produit suivi : prix Vinted revérifié toutes les 6 h": "Product tracked: Vinted price rechecked every 6 h",
    "Produit enregistré dans Suivis": "Product saved in Tracked",
    "La note et les chiffres restent valables.": "The score and figures remain valid.", "Voici une version simple :": "Here is a simple version:",

    // ── Acheter malin
    "Acheter malin": "Buy smart", "Historique du prix": "Price history", "Même produit moins cher": "Same product, cheaper",
    "Avis IA sur la fiche": "AI review of the page", "Codes promo": "Promo codes",
    "Prix le plus bas relevé": "Lowest price recorded", "Prix dans la moyenne": "Average price", "En dessous du prix moyen": "Below the average price",
    "Pas encore assez de relevés": "Not enough records yet", "Plus bas": "Lowest", "Moyenne": "Average", "Plus haut": "Highest",
    "Premier relevé de ce produit aujourd'hui. L'historique se construit à chaque visite des membres AliEdge.": "First price record for this product today. The history builds up with every AliEdge member visit.",
    "AliEdge lance une recherche triée par prix et repère sur la page les vendeurs du même article (même photo ou photo identique selon l'IA).": "AliEdge runs a search sorted by price and spots sellers of the same item on the page (same photo, or identical photo according to AI).",
    "Chercher la photo avec Google Lens": "Search the photo with Google Lens",
    "Bon produit à tester": "Good product to test", "À vérifier avant de commander": "Check before ordering", "À éviter": "Avoid",
    "Points forts": "Strengths", "À surveiller": "Watch out", "Payer moins cher": "Pay less", "Revente Vinted": "Vinted resale",
    "Résumé de la fiche, pièges à éviter, comment payer moins cher et l'angle pour le revendre sur Vinted. 25 avis par jour.": "Summary of the page, traps to avoid, how to pay less and the angle to resell it on Vinted. 25 reviews a day.",
    "Demander l'avis IA": "Ask for the AI review", "Lecture de la fiche…": "Reading the page…",
    "Coupons affichés sur la fiche :": "Coupons shown on the page:", "Copier": "Copy", "Copié": "Copied", "Copie impossible": "Can't copy",
    "Au moment de payer, AliEdge propose ces codes directement sur la page et te demande s'ils ont marché.": "At checkout, AliEdge suggests these codes right on the page and asks you whether they worked.",
    "Aucun code partagé pour l'instant. Tu peux en ajouter un au moment de payer : il servira à toute la communauté.": "No code shared yet. You can add one at checkout: it will help the whole community.",
    "pas encore confirmé": "not confirmed yet",

    // ── Photos et annonce (Barapics)
    "Photos à créer": "Photos to create", "Créer 4 photos": "Create 4 photos", "Posé au sol": "On the floor", "À plat": "Flat lay", "De côté": "Side view",
    "Choisis les photos à créer. Chacune est contrôlée (fidélité, réalisme, texture) et refaite si besoin. 1 crédit par photo livrée.": "Choose the photos to create. Each one is checked (accuracy, realism, texture) and redone if needed. 1 credit per delivered photo.",
    "Création en cours (1 à 2 min par photo)…": "Creating (1 to 2 min per photo)…", "Vérification du solde…": "Checking your balance…",
    "Crédits illimités": "Unlimited credits", "Photos enregistrées dans ta galerie Barapics": "Photos saved in your Barapics gallery",
    "Plus de photos disponibles sur ton compte Barapics.": "No photos left on your Barapics account.",
    "Plus de réglages (mannequins, décors, consignes) dans le studio Barapics": "More settings (models, scenes, instructions) in the Barapics studio",
    "Démarrer l'essai gratuit (3 jours, 4 photos)": "Start the free trial (3 days, 4 photos)",
    "Créer des photos réalistes avec Barapics, sans quitter AliEdge": "Create realistic photos with Barapics without leaving AliEdge",
    "Titre de l'annonce": "Listing title", "Description de l'annonce": "Listing description",
    "Titre, description, catégorie et prix conseillé, prêts à copier": "Title, description, category and recommended price, ready to copy",
    "Rédaction à partir des photos et des prix Vinted constatés…": "Writing from the photos and recorded Vinted prices…",
    "Titre": "Title", "Description": "Description", "Catégorie": "Category", "Marque": "Brand", "Taille": "Size", "Couleur": "Color", "Colis": "Parcel",
    "Barapics ne répond pas. Vérifie ta connexion et réessaie.": "Barapics isn't responding. Check your connection and try again.",
    "Création impossible pour le moment.": "Can't create right now.", "Connecte-toi pour créer des photos.": "Sign in to create photos.",

    // ── Catalogue
    "Les produits qui se vendent déjà": "Products that already sell",
    "Connecte-toi pour voir les produits AliExpress, Temu et Shein déjà vendus sur Vinted, avec leur marge.": "Sign in to see AliExpress, Temu and Shein products already sold on Vinted, with their margin.",
    "Rechercher": "Search", "Rechercher un produit…": "Search a product…", "Toutes les plateformes": "All platforms", "Plateforme": "Platform", "Trier": "Sort",
    "Plus vendus": "Best sellers", "Tendance 7 j": "Trending 7 d", "Meilleure marge": "Best margin", "Récents": "Recent",
    "Sélection VintedDrop": "VintedDrop picks", "Membre du Skool": "Skool member", "Nouveau produit sélectionné par Ivan": "New product picked by Ivan",
    "Nouvelle vidéo d'analyse VintedDrop": "New VintedDrop analysis video", "Vidéo d'analyse": "Analysis video", "Produit gagnant": "Winning product",
    "Tendances du marché Vinted": "Vinted market trends", "30 derniers jours": "Last 30 days",
    "Ajouter au catalogue": "Add to the catalog", "Ajouter ces annonces": "Add these listings", "Ajouter les produits de la page ouverte": "Add the products on the open page",
    "Sur une recherche AliExpress, Temu ou Shein : AliEdge ajoute les produits affichés et vérifie leurs ventes Vinted.": "On an AliExpress, Temu or Shein search: AliEdge adds the products shown and checks their Vinted sales.",
    "Liens d'annonces Vinted, un par ligne (20 au plus)": "Vinted listing links, one per line (20 max)", "Liens d'annonces Vinted": "Vinted listing links",
    "Version gratuite : les 3 premiers produits sont visibles.": "Free version: the first 3 products are visible.", "Tout débloquer": "Unlock everything",
    "Le catalogue se remplit": "The catalog is filling up",
    "Ici s'affichent les produits fournisseurs déjà vendus sur Vinted (les ventes sans fournisseur identifié sont listées plus bas). Chaque fiche consultée par les membres est suivie, et apparaît ici dès sa première vente constatée. Pour accélérer, ouvre une page de résultats AliExpress, Temu ou Shein et clique sur « Ajouter les produits de la page ouverte ».": "Supplier products already sold on Vinted show up here (sales without an identified supplier are listed below). Every page viewed by members is tracked and appears here after its first recorded sale. To speed things up, open an AliExpress, Temu or Shein results page and click “Add the products on the open page”.",
    "Achat": "Buy", "Vinted": "Vinted", "Marge": "Margin", "Marge estimée": "Estimated margin",
    "Ventes Vinted constatées": "Recorded Vinted sales", "Dernières ventes constatées": "Latest recorded sales",
    "Ventes Vinted par semaine (12 semaines)": "Vinted sales per week (12 weeks)", "Ventes par semaine": "Sales per week",
    "Vendus 7 j / 30 j": "Sold 7 d / 30 d", "Prix vendu médian": "Median sold price", "Prix : vendus / en ligne": "Price: sold / listed",
    "Voir le produit": "See the product", "Voir plus": "See more", "Voir": "View", "Voir chez": "See on", "Fermer": "Close",
    "Annonces Vinted": "Vinted listings", "Annonce Vinted": "Vinted listing", "En vente": "For sale", "Vendu": "Sold", "Analysé": "Analyzed",
    "Les ventes viennent de la base commune AliEdge : ce sont celles constatées par la communauté, pas toutes les ventes de Vinted.": "Sales come from the shared AliEdge database: they are the ones recorded by the community, not every sale on Vinted.",
    "Les ventes réellement constatées sur Vinted sont incluses avec AliEdge Pro.": "Sales actually recorded on Vinted are included with AliEdge Pro.",
    "Aucun produit lisible sur cette page. Fais défiler la liste pour charger les produits, puis réessaie.": "No readable product on this page. Scroll the list to load the products, then try again.",
    "Ouvre une page de résultats AliExpress, Temu ou Shein (recherche, catégorie ou meilleures ventes), puis réessaie.": "Open an AliExpress, Temu or Shein results page (search, category or best sellers), then try again.",
    "Connecte-toi pour ajouter des produits au catalogue.": "Sign in to add products to the catalog.", "Connecte-toi pour ajouter des annonces.": "Sign in to add listings.",
    "Colle un ou plusieurs liens d'annonces Vinted (https://www.vinted.fr/items/…).": "Paste one or more Vinted listing links (https://www.vinted.fr/items/…).",
    "Trouver le fournisseur": "Find the supplier", "Reposter ailleurs": "Repost elsewhere", "Reposter partout": "Repost everywhere", "Facebook": "Facebook", "Reposter une annonce Vinted sur Facebook Marketplace : AliEdge remplit le formulaire, tu publies. Meta exige une expédition sous 3 jours : seulement pour des articles déjà en stock à la warehouse. AliEdge ne lit aucune autre page Facebook.": "Repost a Vinted listing on Facebook Marketplace: AliEdge fills in the form, you publish. Meta requires shipping within 3 days: only for items already in stock at the warehouse. AliEdge reads no other Facebook page.", "Quand titre, prix, photos, catégorie et état sont remplis, AliEdge clique sur « Publier » après 5 secondes (annulable). Vérifie tes premières annonces : une erreur partirait en ligne.": "When title, price, photos, category and condition are filled in, AliEdge clicks “Publish” after 5 seconds (cancellable). Check your first listings: a mistake would go live.", "Annuler la publication": "Cancel publishing", "Publication automatique annulée : publie quand tu veux.": "Automatic publishing cancelled: publish whenever you want.", "Annonce envoyée : vérifie qu'elle est bien en ligne.": "Listing sent: check that it's live.", "Bouton de publication introuvable : publie l'annonce toi-même.": "Publish button not found: publish the listing yourself.", "Adresse pour reposter": "Address for reposting", "· demandée par certains sites (Beebs…) pour calculer la distance avec les acheteurs. AliEdge la remplit pour toi ; elle reste dans ce navigateur.": "· asked by some sites (Beebs…) to compute the distance to buyers. AliEdge fills it in for you; it stays in this browser.", "Ex : 12 rue de la République, 30000 Nîmes": "E.g. 12 Main Street, 30000 Nîmes", "Vendue sur Vinted": "Sold on Vinted", "Fiche officielle AliExpress": "Official AliExpress listing", "Utiliser ce prix": "Use this price", "Fournisseurs probables": "Probable suppliers", "Relié à cette annonce": "Linked to this listing", "Relié à une vente au titre proche": "Linked to a sale with a similar title", "Titre proche": "Similar title", "Chercher ailleurs": "Search elsewhere", "Parti en": "Sold in", "délai inconnu": "unknown", "Vendu": "Sold", "Département": "Department", "Livraison": "Shipping", "Voir l'annonce sur Vinted": "See the listing on Vinted", "Voir l'annonce sur Leboncoin": "See the listing on Leboncoin", "Tirés du catalogue AliEdge : le produit relié à cette vente, ceux reliés à des ventes au titre proche, puis les titres proches. Vérifie toujours que c'est le même article.": "From the AliEdge catalog: the product linked to this sale, those linked to sales with a similar title, then similar titles. Always check it's the same item.", "Aucun fournisseur trouvé dans la base pour l'instant. Cherche-le avec les liens ci-dessous et relie-le depuis la liste des ventes : il servira à tout le monde.": "No supplier found in the database yet. Search for it with the links below and link it from the sales list: it will help everyone.", "déjà publiée": "already posted", "Leboncoin": "Leboncoin", "Aucune annonce trouvée : ouvre ton profil Vinted (la page de tes annonces), puis reviens ici.": "No listing found: open your Vinted profile (your listings page), then come back here.", "Ouvre ton profil Vinted (la page de tes annonces) une fois : AliEdge les relèvera, puis reviens ici.": "Open your Vinted profile (your listings page) once: AliEdge will record them, then come back here.", "Tout sélectionner (hors déjà sur Leboncoin)": "Select all (except those already on Leboncoin)", "Déjà sur Leboncoin": "Already on Leboncoin", "Sois connecté à Leboncoin. Vérifie chaque annonce avant de la publier (catégorie, état, taille).": "Be signed in to Leboncoin. Check each listing before posting it (category, condition, size).", "Active Leboncoin pour publier tes annonces sur Leboncoin.": "Turn on Leboncoin to post your listings on Leboncoin.", "Leboncoin s'ouvre avec ta première annonce": "Leboncoin is opening with your first listing", "Vérifie, complète la catégorie si besoin, puis publie l'annonce.": "Check, fill in the category if needed, then post the listing.", "Vérifie, complète la catégorie, l'état et la taille si besoin, puis publie l'annonce.": "Check, fill in the category, condition and size if needed, then post the listing.", "Colle ici le lien du produit trouvé": "Paste the link of the product you found here",
    "Lien du produit fournisseur": "Supplier product link",
    "Le produit relié rejoint le catalogue commun : tout le monde voit ensuite le fournisseur de cette vente.": "The linked product joins the shared catalog: everyone then sees the supplier of this sale.",
    "Lien de fiche produit AliExpress, Temu ou Shein attendu.": "An AliExpress, Temu or Shein product link is expected.",
    "Seules les fiches AliExpress, Temu et Shein sont acceptées.": "Only AliExpress, Temu and Shein product pages are accepted.",
    "Colle le lien d'une fiche produit AliExpress, Temu ou Shein.": "Paste the link of an AliExpress, Temu or Shein product page.",
    "Lien du produit illisible.": "Unreadable product link.", "Pas assez de données": "Not enough data", "Le prix Vinted monte": "Vinted price is rising", "Le prix Vinted baisse": "Vinted price is falling",
    "Dropshipping uniquement": "Dropshipping only", "Leboncoin": "Leboncoin", "Plateforme de revente": "Resale platform",

    // ── Radar
    "Radar des nouvelles annonces": "New listings radar", "Type de filtre": "Filter type",
    "Lien de recherche Vinted": "Vinted search link", "Lien de la recherche": "Search link", "Mots-clés à surveiller": "Keywords to watch",
    "Fais ta recherche sur Vinted avec tous tes filtres (marque, catégorie, taille, état, couleur, prix), puis copie l'adresse de la page ici. AliEdge surveille exactement cette recherche.": "Run your search on Vinted with all your filters (brand, category, size, condition, color, price), then copy the page address here. AliEdge watches exactly that search.",
    "Nom du filtre": "Filter name", "Notification à chaque nouvelle annonce": "Notification for every new listing", "Ajouter le filtre": "Add the filter", "Créer le filtre": "Create the filter",
    "Prix max (€)": "Max price (€)", "Prix max.": "Max price", "Prix min.": "Min price", "Prix maximum": "Maximum price",
    "Écarte les grandes marques connues (Nike, Adidas, Zara…)": "Exclude big known brands (Nike, Adidas, Zara…)",
    "Jusqu'à 10 filtres (membre du Skool).": "Up to 10 filters (Skool member).", "Jusqu'à 5 filtres (10 pour les membres du Skool).": "Up to 5 filters (10 for Skool members).",
    "10 filtres au maximum : supprime-en un avant d'en ajouter.": "10 filters maximum: delete one before adding another.",
    "5 filtres au maximum : supprime-en un, ou passe à 10 filtres en rejoignant le Skool VintedDrop.": "5 filters maximum: delete one, or get 10 filters by joining the VintedDrop Skool.",
    "Recevoir les alertes sur mon téléphone": "Get alerts on my phone",
    "Une notification sur ton téléphone avec la photo, le prix et le lien, même quand tu n'es pas devant l'ordinateur.": "A notification on your phone with the photo, price and link, even when you're away from the computer.",
    "Recevoir sur Telegram": "Get them on Telegram", "Envoyer une alerte de test": "Send a test alert", "Alerte de test envoyée": "Test alert sent",
    "Alertes Telegram arrêtées": "Telegram alerts stopped", "Webhook Discord enregistré": "Discord webhook saved", "Webhook Discord retiré": "Discord webhook removed",
    "Colle le lien d'un webhook de ton serveur (Paramètres du salon → Intégrations → Webhooks).": "Paste a webhook link from your server (Channel settings → Integrations → Webhooks).",
    "Partager mes trouvailles dans le salon Radar du Skool VintedDrop": "Share my finds in the Radar channel of the VintedDrop Skool",
    "Tes trouvailles seront partagées dans le salon du Skool": "Your finds will be shared in the Skool channel", "Partage arrêté": "Sharing stopped",
    "Aucun canal n'a répondu : vérifie tes réglages": "No channel responded: check your settings",
    "Dans Telegram, appuie sur « Démarrer » pour connecter ton Radar": "In Telegram, tap “Start” to connect your Radar",
    "Les alertes partent pendant que Chrome est ouvert sur un ordinateur, même s'il n'est pas devant toi.": "Alerts are sent while Chrome is open on a computer, even if you're not in front of it.",
    "En attente de nouvelles annonces": "Waiting for new listings",
    "Dès qu'une annonce correspondant à un filtre est publiée sur Vinted, elle apparaît ici et tu reçois une notification. Garde Chrome ouvert.": "As soon as a listing matching a filter is posted on Vinted, it shows up here and you get a notification. Keep Chrome open.",
    "Filtre enregistré : surveillance lancée": "Filter saved: watching started", "Filtre créé : le Radar te prévient des nouvelles annonces": "Filter created: the Radar will alert you to new listings",
    "Pause": "Pause", "Reprendre": "Resume", "Supprimer": "Delete", "Activé": "On", "Nouvelle annonce": "New listing",
    "Le Radar surveille les nouvelles annonces Vinted et te prévient dès qu'une bonne affaire sort. L'achat se fait toujours toi-même.": "The Radar watches new Vinted listings and alerts you as soon as a good deal comes up. You always make the purchase yourself.",
    "AliEdge regarde les nouvelles annonces Vinted à tour de rôle, toutes les 30 secondes environ, et te prévient. L'achat se fait toujours toi-même, sur Vinted.": "AliEdge checks new Vinted listings in turn, about every 30 seconds, and alerts you. You always make the purchase yourself, on Vinted.",
    "Ce lien n'est pas une recherche Vinted : fais ta recherche sur Vinted avec tes filtres, puis copie l'adresse de la page.": "This link isn't a Vinted search: run your search on Vinted with your filters, then copy the page address.",
    "Colle le lien d'une recherche Vinted.": "Paste a Vinted search link.", "Indique des mots-clés à surveiller.": "Enter keywords to watch.",
    "Indique des mots-clés ou colle un lien de recherche Vinted.": "Enter keywords or paste a Vinted search link.",
    "Connecte-toi pour surveiller les nouvelles annonces Vinted.": "Sign in to watch new Vinted listings.",
    "Protection du compte active :": "Account protection on:", "Protection du compte : pause jusqu'à": "Account protection: paused until",
    "vérifications cette heure, rythme humain, pause automatique au moindre signal de Vinted.": "checks this hour, human pace, automatic pause at the slightest signal from Vinted.",
    "Pause de protection : AliEdge laisse Vinted tranquille un moment.": "Protective pause: AliEdge leaves Vinted alone for a while.",
    "Budget de fond atteint, reprise plus tard.": "Background budget reached, resuming later.",

    // ── Concurrents
    "Colle le lien du profil Vinted d'un concurrent, ou clique sur « + Concurrent » à côté de son pseudo sur Vinted. AliEdge enregistre toutes ses annonces, repère chaque vente et mesure en combien de temps elle est partie.": "Paste a competitor's Vinted profile link, or click “+ Competitor” next to their username on Vinted. AliEdge records all their listings, spots each sale and measures how fast it sold.",
    "Lien du profil Vinted": "Vinted profile link", "Aucun concurrent suivi": "No competitor tracked",
    "Ajoute les vendeurs qui cartonnent dans ta niche : tu verras ce qu'ils vendent, à quel prix et en combien de temps.": "Add the sellers who are crushing it in your niche: you'll see what they sell, at what price and how fast.",
    "Connecte-toi pour suivre les ventes de tes concurrents.": "Sign in to track your competitors' sales.", "Arrêter le suivi": "Stop tracking", "Un concurrent": "A competitor",
    "Tu suis déjà 30 concurrents : retires-en un avant d'en ajouter.": "You already track 30 competitors: remove one before adding another.",
    "Tu suis déjà 30 concurrents Leboncoin : retires-en un avant d'en ajouter.": "You already track 30 Leboncoin competitors: remove one before adding another.",
    "Connecte-toi à AliEdge pour suivre un vendeur.": "Sign in to AliEdge to track a seller.",
    "C'est ton propre compte Vinted : il n'est jamais suivi ni publié dans AliEdge.": "This is your own Vinted account: it's never tracked or published in AliEdge.",
    "Ces annonces sont celles de ton propre compte Vinted : elles ne sont jamais publiées dans AliEdge.": "These listings are from your own Vinted account: they're never published in AliEdge.",
    "Concurrents Leboncoin": "Leboncoin competitors", "Lien du profil Leboncoin": "Leboncoin profile link", "Aucun concurrent Leboncoin suivi.": "No Leboncoin competitor tracked.",
    "Active Leboncoin dans AliEdge": "Turn on Leboncoin in AliEdge",
    "Active Leboncoin pour suivre aussi tes concurrents Leboncoin. AliEdge lit seulement les pages que tu ouvres, sans aucune requête en plus.": "Turn on Leboncoin to track your Leboncoin competitors too. AliEdge only reads the pages you open, with no extra requests.",
    "AliEdge lira les annonces Leboncoin que tu affiches (recherches, annonces) pour repérer celles qui se vendent. Aucune requête en plus vers Leboncoin, rien n'est publié ni envoyé à ta place, et ton compte n'est jamais partagé. Chrome va te demander l'accès à leboncoin.fr.": "AliEdge will read the Leboncoin listings you display (searches, listings) to spot the ones that sell. No extra requests to Leboncoin, nothing is posted or sent on your behalf, and your account is never shared. Chrome will ask you for access to leboncoin.fr.",
    "Dernières ventes de tes concurrents": "Your competitors' latest sales", "Me prévenir à chaque vente": "Notify me of every sale",
    "AliEdge relève les dressings de tes concurrents plusieurs fois par jour. Chaque vente constatée s'affiche ici et déclenche une notification (et une alerte sur ton téléphone si tu l'as réglée dans le Radar).": "AliEdge checks your competitors' wardrobes several times a day. Each recorded sale shows up here and triggers a notification (and a phone alert if you set it up in the Radar).",
    "Les ventes apparaissent au fil des relevés (plusieurs fois par jour).": "Sales appear as the checks come in (several times a day).",
    "Partis le plus vite": "Sold the fastest", "Vente concurrent :": "Competitor sale:", "vient de vendre ·": "just sold ·",
    "Analyser une niche": "Analyze a niche", "Niche à analyser": "Niche to analyze", "ex. sac bandoulière cuir": "e.g. leather crossbody bag", "Analyser": "Analyze",
    "Tape un produit ou une niche : AliEdge regarde les annonces en ligne sur Vinted et les ventes constatées par la communauté, puis te montre les vendeurs à suivre.": "Type a product or a niche: AliEdge looks at the listings on Vinted and the sales recorded by the community, then shows you the sellers to follow.",
    "Indique au moins un mot-clé (3 lettres).": "Enter at least one keyword (3 letters).",
    "Ceux qui vendent le plus (30 j)": "Top sellers (30 d)", "Ceux qui ont le plus d'annonces en ligne": "Most listings online", "+ Suivre": "+ Track",
    "Diagnostic de ton compte": "Your account diagnostic", "Lien de ton profil Vinted": "Your Vinted profile link",
    "Colle le lien de ton profil Vinted : AliEdge lit tes annonces et ton profil, te donne une note sur 100 et les corrections qui comptent le plus, en te comparant à tes concurrents suivis.": "Paste your Vinted profile link: AliEdge reads your listings and profile, gives you a score out of 100 and the fixes that matter most, comparing you with the competitors you track.",
    "Lancer": "Start", "Refaire": "Run again", "À corriger en priorité": "Fix first", "Qualité des annonces": "Listing quality",
    "Colle le lien de TON profil Vinted (…/member/123456-pseudo).": "Paste YOUR Vinted profile link (…/member/123456-username).",
    "Connecte-toi à AliEdge pour lancer le diagnostic.": "Sign in to AliEdge to run the diagnostic.",
    "Suis quelques concurrents pour comparer ton compte au leur.": "Track a few competitors to compare your account with theirs.",
    "Conseils personnalisés indisponibles :": "Personal advice unavailable:",

    // ── Suivis, ventes à expédier
    "Produits suivis": "Tracked products", "Aucun produit suivi": "No product tracked", "Historique": "History", "Effacer": "Clear", "Retirer": "Remove",
    "Après une analyse, clique sur « Suivre » : AliEdge revérifie le prix Vinted toutes les 6 h et te prévient s'il bouge de plus de 10 %.": "After an analysis, click “Track”: AliEdge rechecks the Vinted price every 6 h and lets you know if it moves by more than 10%.",
    "Tes analyses apparaîtront ici.": "Your analyses will appear here.",
    "Ventes à expédier": "Sales to ship", "Voir mes ventes à expédier": "See my sales to ship", "Confier à la warehouse": "Hand over to the warehouse",
    "AliEdge lit tes ventes Vinted pas encore expédiées (compte ouvert dans ce navigateur) et retrouve le produit fournisseur de chacune. Un clic, et la warehouse achète, emballe et expédie à ta place.": "AliEdge reads your Vinted sales not shipped yet (account open in this browser) and finds the supplier product for each one. One click, and the warehouse buys, packs and ships for you.",
    "Aucune vente en attente d'expédition.": "No sale waiting to be shipped.",
    "Sur la page warehouse, il ne reste qu'à vérifier l'article et ajouter le bordereau Vinted.": "On the warehouse page, all that's left is to check the item and add the Vinted shipping label.",
    "Produit fournisseur inconnu ·": "Supplier product unknown ·", "Associer": "Link", "Changer": "Change", "C'est bien lui": "That's the one", "Suggestion :": "Suggestion:",
    "Choisir un produit analysé…": "Choose an analyzed product…", "ou colle le lien AliExpress / Temu / Shein": "or paste the AliExpress / Temu / Shein link",
    "Relier": "Link", "Annuler": "Cancel", "Produit relié à cette vente": "Product linked to this sale", "Choisis un produit ou colle un lien": "Choose a product or paste a link",
    "Article vendu": "Item sold", "Connecte-toi à Vinted dans ce navigateur, puis réessaie.": "Sign in to Vinted in this browser, then try again.",
    "Lien fournisseur invalide (il doit commencer par https://).": "Invalid supplier link (it must start with https://).",

    // ── Balade SHEIN
    "Balade SHEIN": "SHEIN tour", "Balade SHEIN en cours": "SHEIN tour running", "Balade en cours": "Tour running", "Balade lancée": "Tour started",
    "AliEdge parcourt le catalogue à ta place, lentement : défilement, pauses, survol des produits, ouverture de quelques articles. Il note tout ce qu'il voit pour te sortir des pistes de niches.": "AliEdge browses the catalog for you, slowly: scrolling, pauses, hovering products, opening a few items. It notes everything it sees to give you niche leads.",
    "Durée": "Duration", "Rythme": "Pace", "Calme": "Calm", "Normal": "Normal", "Dynamique": "Lively",
    "Ouvrir quelques articles": "Open a few items", "Curseur visible (pour filmer)": "Visible cursor (for filming)", "Compteur sur la page": "Counter on the page",
    "Lancer la balade": "Start the tour", "Lancement…": "Starting…", "Arrêter la balade": "Stop the tour",
    "Garde-fous : 45 min maximum, 20 articles ouverts par heure. La balade ne clique que sur des articles et ne touche jamais aux vérifications de SHEIN.": "Safeguards: 45 min maximum, 20 items opened per hour. The tour only clicks on items and never touches SHEIN's verification checks.",
    "Échap pour arrêter, Espace pour mettre en pause. Si SHEIN demande une vérification, la balade s'arrête et t'attend : fais-la, puis clique « Reprendre » sur la page.": "Esc to stop, Space to pause. If SHEIN asks for a verification, the tour stops and waits for you: complete it, then click “Resume” on the page.",
    "Ouvre une catégorie ou une recherche sur SHEIN dans cet onglet (par exemple « robe crochet »), puis reviens ici pour lancer la balade.": "Open a category or a search on SHEIN in this tab (for example “crochet dress”), then come back here to start the tour.",
    "Ouvrir SHEIN": "Open SHEIN", "En pause.": "Paused.", "← Analyse": "← Analyze",
    "Pistes de niches": "Niche leads", "Ce qui revient le plus": "What comes up most", "Catégories": "Categories",
    "« Analyser » regarde les annonces et les ventes sur Vinted pour ce mot. « Vinted » ouvre la recherche.": "“Analyze” looks at the listings and sales on Vinted for this word. “Vinted” opens the search.",
    "Pas encore assez d'articles pour dégager des mots : laisse la balade tourner un peu plus.": "Not enough items yet to pick out words: let the tour run a bit longer.",
    "Pas encore de pistes": "No leads yet", "Lance une balade : les catégories et les mots qui reviennent apparaîtront ici.": "Start a tour: the categories and words that come up will appear here.",
    "Filtrer": "Filter", "Filtrer les articles": "Filter the items", "Ouverts": "Opened", "Plus vus": "Most seen", "Prix": "Price",
    "Aucun article ne correspond.": "No item matches.", "Exporter (CSV)": "Export (CSV)", "Tout effacer": "Clear everything", "Confirmer l'effacement": "Confirm deletion",
    "Ce sont les articles que SHEIN t'a montrés, pas forcément les meilleures ventes : vérifie toujours la demande sur Vinted avant de choisir une niche.": "These are the items SHEIN showed you, not necessarily the best sellers: always check demand on Vinted before choosing a niche.",
    "Trouve des niches sans rien faire : AliEdge parcourt le catalogue pour toi.": "Find niches without lifting a finger: AliEdge browses the catalog for you.",
    "Voir l'avancement et les pistes": "See progress and leads", "Lancer": "Start",
    "Ouvre d'abord une page SHEIN (une catégorie ou une recherche).": "Open a SHEIN page first (a category or a search).",
    "SHEIN demande une vérification. Fais-la toi-même, puis clique « Reprendre » sur la page.": "SHEIN is asking for a verification. Complete it yourself, then click “Resume” on the page.",
    "Balade SHEIN en pause": "SHEIN tour paused",
    // badge sur la page
    "Balade": "Tour", "En pause": "Paused", "À toi": "Your turn", "Stop": "Stop", "Pause (Espace)": "Pause (Space)", "Arrêter (Échap)": "Stop (Esc)",
    "SHEIN demande une vérification : fais-la, puis clique Reprendre": "SHEIN is asking for a verification: complete it, then click Resume",

    // ── Compte, bienvenue, connexion
    "Ton compte": "Your account", "Bienvenue sur AliEdge": "Welcome to AliEdge", "Ta première analyse": "Your first analysis", "Ton premier filtre Radar": "Your first Radar filter",
    "Avant de commander chez AliExpress, Temu ou Shein, AliEdge te montre ce que le produit vaut vraiment sur Vinted. Trois réglages et c'est parti.": "Before ordering from AliExpress, Temu or Shein, AliEdge shows you what the product is really worth on Vinted. Three settings and you're off.",
    "Sur quel Vinted tu vends ?": "Which Vinted do you sell on?", "Passer et commencer": "Skip and start", "Étape": "Step", "sur 3": "of 3",
    "Sur une fiche produit, le bouton « Analyser sur Vinted » fait tout. Essaie ici avec un exemple : AliEdge cherche les annonces identiques et calcule le prix de revente.": "On a product page, the “Analyze on Vinted” button does everything. Try it here with an example: AliEdge looks for identical listings and calculates the resale price.",
    "Mots-clés de l'exemple": "Example keywords", "Sur une vraie fiche, AliEdge déduit le prix d'achat et te donne ta marge.": "On a real product page, AliEdge deducts the purchase price and gives you your margin.",
    "Pas assez d'annonces pour cet exemple. Essaie d'autres mots-clés.": "Not enough listings for this example. Try other keywords.",
    "Indique des mots-clés à chercher.": "Enter keywords to search.", "Crée ton compte gratuit pour lancer une analyse.": "Create your free account to run an analysis.",
    "Email": "Email", "Mot de passe": "Password", "Connexion": "Sign in", "Inscription": "Sign up", "Continuer avec Google": "Continue with Google",
    "Mot de passe oublié ?": "Forgot your password?", "Se déconnecter": "Sign out", "Déconnexion": "Sign out",
    "Email ou mot de passe incorrect.": "Incorrect email or password.", "Mot de passe trop faible : 8 caractères minimum.": "Password too weak: 8 characters minimum.",
    "Un compte existe déjà avec cet email. Connecte-toi.": "An account already exists with this email. Sign in.",
    "Confirme ton email avec le lien reçu, puis reconnecte-toi.": "Confirm your email with the link you received, then sign in again.",
    "Connexion Google annulée.": "Google sign-in cancelled.", "Connexion Google interrompue. Si une page Barapics s'est ouverte, ton navigateur n'est pas encore pris en charge pour Google : connecte-toi avec ton email et un mot de passe (même compte que Barapics).": "Google sign-in interrupted. If a Barapics page opened, your browser isn't supported for Google yet: sign in with your email and a password (same account as Barapics).", "Connexion Google impossible pour le moment : utilise ton email et un mot de passe.": "Google sign-in unavailable for now: use your email and a password.", "Connexion Google refusée.": "Google sign-in refused.",
    "Session expirée. Reconnecte-toi.": "Session expired. Sign in again.", "Connecte-toi pour utiliser AliEdge.": "Sign in to use AliEdge.",
    "Trop d'emails envoyés. Réessaie dans quelques minutes.": "Too many emails sent. Try again in a few minutes.",
    "Trop de requêtes. Patiente quelques minutes.": "Too many requests. Wait a few minutes.", "Trop de tentatives. Réessaie dans quelques minutes.": "Too many attempts. Try again in a few minutes.",
    "Pas de connexion au serveur AliEdge. Vérifie ta connexion internet.": "No connection to the AliEdge server. Check your internet connection.",
    "Réservé à AliEdge Pro.": "AliEdge Pro only.", "Bientôt disponible": "Coming soon", "Langue": "Language", "Automatique": "Automatic", "Français": "Français", "English": "English",
    "Mettre à jour": "Update", "Installation…": "Installing…", "Fermer les nouveautés": "Close what's new", "Afficher tout": "Show all",
    "Installe-la en un clic, AliEdge redémarre en quelques secondes.": "Install it in one click, AliEdge restarts in a few seconds.",
    "Découvre les nouveautés dans les onglets.": "Discover what's new in the tabs.", "Découvre les nouveautés dans le panneau AliEdge.": "Discover what's new in the AliEdge panel.",
    "L'extension a été mise à jour. Ferme et rouvre ce panneau.": "The extension has been updated. Close and reopen this panel.",
    "Erreur inattendue.": "Unexpected error.",

    // ── Recherche par image, capture
    "Retrouve chez les fournisseurs un produit vu sur Vinted, TikTok, Instagram ou n'importe quel site.": "Find at suppliers a product seen on Vinted, TikTok, Instagram or any website.",
    "Choisir une image": "Choose an image", "Choisis une image (JPG, PNG ou WebP).": "Choose an image (JPG, PNG or WebP).", "Image illisible : essaie une autre image.": "Unreadable image: try another one.",
    "Clic droit sur une photo": "Right-click on a photo", "Vidéo ou capture d'écran": "Video or screenshot", "Capture expirée, recommence.": "Capture expired, start again.",
    "Capturer une zone et trouver le produit (AliEdge)": "Capture an area and find the product (AliEdge)",
    "Trouver ce produit chez les fournisseurs (AliEdge)": "Find this product at suppliers (AliEdge)",
    "Trace un rectangle autour du produit ·": "Draw a rectangle around the product ·", "pour annuler": "to cancel", "Échap": "Esc",

    // ── Vinted et les sites fournisseurs (boutons ajoutés par AliEdge)
    "Analyser ce produit avec AliEdge": "Analyze this product with AliEdge", "Masquer": "Hide",
    "Photos et annonce avec Barapics": "Photos and listing with Barapics", "Créer les photos et l'annonce de ce produit avec Barapics": "Create the photos and listing for this product with Barapics",
    "Chercher ce produit chez les fournisseurs": "Search this product at suppliers", "Concurrent": "Competitor", "Ne plus suivre": "Unfollow",
    "Ouvre AliEdge et connecte-toi": "Open AliEdge and sign in",
    "Codes promo de la communauté": "Community promo codes", "Codes promo partagés par la communauté AliEdge": "Promo codes shared by the AliEdge community",
    "Ajouter": "Add", "Ajouter un code": "Add a code", "Ajouter un code promo": "Add a promo code", "Le code": "The code",
    "Code ajouté. Essaie-le, puis dis s'il marche.": "Code added. Try it, then tell us whether it works.",
    "Code saisi : clique sur « Appliquer » sur la page.": "Code entered: click “Apply” on the page.", "Code saisi et appliqué. Regarde le total de la commande.": "Code entered and applied. Check the order total.",
    "Merci, c'est noté.": "Thanks, noted.", "Merci, le code remonte pour tout le monde.": "Thanks, the code moves up for everyone.",
    "Un code, c'est 3 à 40 lettres ou chiffres.": "A code is 3 to 40 letters or digits.", "a-t-il fait baisser le total ?": "did it lower the total?",
    "copié : colle-le dans le champ « code promo » de la page.": "copied: paste it into the page's “promo code” field.",
    "Même produit": "Same product", "Même produit · même prix": "Same product · same price", "Même produit chez d'autres vendeurs": "Same product from other sellers",
    "AliEdge compare les photos des résultats avec ton produit…": "AliEdge is comparing the result photos with your product…",
    "(Comparaison des photos par l'IA indisponible : seules les photos identiques sont reconnues.)": "(AI photo comparison unavailable: only identical photos are recognized.)",
    "Pas encore d'annonce identique sur cette page. Fais défiler pour charger plus de résultats, puis relis la page.": "No identical listing on this page yet. Scroll to load more results, then reread the page.",
    "Relire la page": "Reread the page", "Ton produit :": "Your product:", "Ventes": "Sales", "Prix + avis": "Price + reviews", "vendus": "sold", "même photo": "same photo", "même article (IA)": "same item (AI)",
    "de moins par article chez un autre vendeur.": "less per item from another seller.", "Jusqu'à": "Up to",

    // ── Divers
    "min": "min", "médian": "median", "prix médian": "median price", "annonces en ligne": "listings online", "ventes constatées": "recorded sales",
    "ventes 7 j": "sales 7 d", "ventes 30 j": "sales 30 d", "ventes 30 j (estim.)": "sales 30 d (est.)", "ventes constatées 30 j": "recorded sales 30 d",
    "nouvelles annonces 7 j": "new listings 7 d", "délai de vente médian": "median time to sell", "âge médian des annonces": "median listing age",
    "favoris par annonce": "favorites per listing", "prix médian en ligne": "median listed price", "prix médian vendu": "median sold price",
    "chiffre constaté": "recorded figure", "constatées": "recorded", "sur 100": "out of 100", "copié": "copied", "· vérifié": "· checked",
    "· premier relevé en cours": "· first check in progress", "Évolution du prix : de": "Price change: from", "Prix fournisseur relevé : de": "Supplier price recorded: from",
    "depuis le": "since", "sur un achat à": "on a purchase at", "Analyse en cours": "Analysis in progress", "Produit": "Product",

    // ── Compléments (relevés sur le panneau affiché)
    "Défi Skool :": "Skool challenge:", "🎬 Vidéo d'analyse": "🎬 Analysis video", "🛍️ Produit gagnant": "🛍️ Winning product",
    "Délai de vente médian": "Median time to sell", "Catégories qui vendent": "Categories that sell",
    "Heures de publication des annonces vendues": "Posting times of sold listings", "Recherche Vinted des produits ajoutés :": "Vinted search of the added products:",
    "Chaque annonce vue vendue par la communauté, même quand le fournisseur n'est pas encore identifié. Trouve le fournisseur et relie-le : il rejoint le catalogue pour tout le monde.": "Every listing the community has seen sell, even when the supplier isn't identified yet. Find the supplier and link it: it joins the catalog for everyone.",
    "Colle le lien du profil Leboncoin d'un concurrent, ou clique sur « + Concurrent » à côté de son nom sur Leboncoin. Ouvre sa page de temps en temps (bouton « Revoir ses annonces ») : les annonces disparues depuis ta dernière visite sont comptées comme ventes probables. AliEdge n'envoie aucune requête à Leboncoin à ta place.": "Paste a competitor's Leboncoin profile link, or click “+ Competitor” next to their name on Leboncoin. Open their page from time to time (“Review their listings” button): listings gone since your last visit count as probable sales. AliEdge never sends any request to Leboncoin on your behalf.",
    "en ligne": "online", "En ligne": "Online", "Réputation": "Reputation", "Régularité": "Consistency", "Attractivité": "Appeal", "mises en ligne 7 j": "posted 7 d",
    "Webhook enregistré · colle un nouveau lien pour le changer": "Webhook saved · paste a new link to change it",
    "en direct": "live", "Modifier": "Edit", "ex. Nike Tech taille M": "e.g. Nike Tech size M", "marque": "brand", "catégorie": "category", "prix": "price",
    "Accès complet offert pendant le lancement": "Full access free during the launch", "Complet": "Full",
    "produits ajoutés au catalogue par toi": "products you added to the catalog", "produits,": "products,", "ventes repérées,": "sales spotted,",
    "analyses aujourd'hui": "analyses today", "Catalogue commun :": "Shared catalog:", "membres contributeurs": "contributing members",
    "Gagner de l'argent avec ton lien": "Earn money with your link", "Mon lien d'affiliation": "My affiliate link",
    "Recommande Barapics et AliEdge : tu touches une commission sur chaque abonnement de tes filleuls.": "Recommend Barapics and AliEdge: you earn a commission on every subscription from people you refer.",
    "Réglages": "Settings", "Pays Vinted": "Vinted country", "Coût par vente": "Cost per sale",
    "Coût par vente : emballage, étiquette, petits frais. Vinted ne prend pas de commission au vendeur.": "Cost per sale: packaging, label, small fees. Vinted doesn't charge sellers a commission.",
    "En utilisant AliEdge, tu alimentes le catalogue commun des ventes constatées sur Vinted. Rien de personnel n'est partagé.": "By using AliEdge, you feed the shared catalog of sales recorded on Vinted. Nothing personal is shared.",
    "En savoir plus": "Learn more", "Partager mes favoris Vinted": "Share my Vinted favorites",
    "Les annonces que tu mets en favori rejoignent la base commune pour repérer leurs ventes. Ton compte n'est jamais associé.": "Listings you favorite join the shared database so their sales can be spotted. Your account is never linked to them.",
    "Bouton sur les fiches produit": "Button on product pages", "Affiche « Analyser sur Vinted » sur AliExpress, Temu et Shein.": "Shows “Analyze on Vinted” on AliExpress, Temu and Shein.",
    "Confidentialité": "Privacy", "Créer un compte": "Create an account",
    "Gratuit et complet pendant le lancement : analyses illimitées et tout le catalogue. Même compte que Barapics.": "Free and complete during the launch: unlimited analyses and the whole catalog. Same account as Barapics.",
    "Utilise le même compte que sur Barapics.": "Use the same account as on Barapics.",
    "AliEdge est installé. Épingle-le dans la barre de Chrome (icône puzzle), puis crée ton compte gratuit. Chaque analyse que tu lances enrichit le catalogue de toute la communauté.": "AliEdge is installed. Pin it to the Chrome toolbar (puzzle icon), then create your free account. Every analysis you run enriches the whole community's catalog.",
    "→ « Trouver ce produit chez les fournisseurs ».": "→ “Find this product at suppliers”.", ": clic droit sur la page → « Capturer une zone », ou": ": right-click on the page → “Capture an area”, or",
    "Ou ici : choisis une image, ou colle-la avec": "Or here: choose an image, or paste it with",
    "Ajouter le vendeur de cette annonce aux concurrents AliEdge": "Add this listing's seller to your AliEdge competitors", "Ce vendeur est suivi par AliEdge": "This seller is tracked by AliEdge",
    "Cliquer pour ne plus suivre ce vendeur": "Click to stop tracking this seller", "Vendeur introuvable sur cette annonce": "Seller not found on this listing",
    "Connecte-toi pour comparer les vendeurs.": "Sign in to compare sellers.", "Connecte-toi pour demander l'avis IA.": "Sign in to ask for the AI review.",
    "La fiche n'a pas pu être lue (vérification anti-robot ?). Ouvre-la dans un onglet, puis réessaie.": "The page couldn't be read (bot check?). Open it in a tab, then try again.",
    "Lecture des détails du produit…": "Reading the product details…", "Aucune annonce enregistrée.": "No listing saved.",
    "Vinted n'a pas répondu : ouvre vinted.fr dans un onglet, connecte-toi, puis relance.": "Vinted didn't respond: open vinted.fr in a tab, sign in, then try again.",
    "Vinted n'accepte pas la recherche pour l'instant : ouvre vinted.fr dans un onglet (connecté à ton compte), puis relance l'analyse.": "Vinted isn't accepting the search right now: open vinted.fr in a tab (signed in to your account), then run the analysis again.",
    "Clique ici pour l'installer maintenant (quelques secondes). Sinon, elle s'installera au prochain redémarrage de Chrome.": "Click here to install it now (a few seconds). Otherwise it will install the next time Chrome restarts.",
    "Arrêter": "Stop", "Médiane": "Median", "Prix affiché": "Price shown", "Porté": "Worn", "Extérieur": "Outdoor", "Vêtements": "Clothing", "Beauté": "Beauty", "désactivées": "off",
    "Prix :": "Price:", "Et": "And",
    "https://www.vinted.fr/member/123456-ton-pseudo": "https://www.vinted.fr/member/123456-your-username",
    "https://www.vinted.fr/member/123456-pseudo": "https://www.vinted.fr/member/123456-username",

    // ── Compte obligatoire, catalogue automatique
    "Crée ton compte gratuit pour utiliser AliEdge.": "Create your free account to use AliEdge.", "C'est 10 secondes, sans carte bancaire. Avec Google, c'est un clic.": "It takes 10 seconds, no credit card. With Google, it's one click.",
    "Ajouter les produits des recherches fournisseurs": "Add products from supplier searches",
    "Les produits affichés par tes recherches AliExpress, Temu et Shein rejoignent le catalogue commun (aucune requête en plus vers ces sites).": "Products shown in your AliExpress, Temu and Shein searches join the shared catalog (no extra requests to these sites).",
    "Réglage enregistré": "Setting saved",
    // ── Beebs
    "Publier sur Beebs": "Post on Beebs", "Choisir mes annonces Vinted": "Choose my Vinted listings", "Déjà sur Beebs": "Already on Beebs", "Préparation…": "Preparing…",
    "Beebs comme canal de vente en plus : choisis tes annonces Vinted, AliEdge les prépare une par une sur Beebs (texte, prix, photos). Tu cliques sur « Mettre en vente » à chaque fois, la suivante s'ouvre toute seule.": "Beebs as an extra sales channel: choose your Vinted listings, AliEdge prepares them one by one on Beebs (text, price, photos). You click “Put on sale” each time, and the next one opens by itself.",
    "Tout sélectionner (hors déjà sur Beebs)": "Select all (except those already on Beebs)", "Aucune annonce en ligne sur ton compte Vinted.": "No live listing on your Vinted account.",
    "Sois connecté à Beebs. Vérifie chaque annonce avant de la mettre en vente (catégorie, état, taille).": "Be signed in to Beebs. Check each listing before putting it on sale (category, condition, size).",
    "Active Beebs pour publier tes annonces sur Beebs.": "Turn on Beebs to post your listings on Beebs.", "Beebs s'ouvre avec ta première annonce": "Beebs is opening with your first listing",
    "Ouvre Vinted connecté à ton compte : AliEdge le reconnaîtra, puis reviens ici.": "Open Vinted signed in to your account: AliEdge will recognize it, then come back here.",
    "Choisis au moins une annonce.": "Choose at least one listing.", "Annonce Vinted introuvable (supprimée ou vendue ?).": "Vinted listing not found (deleted or sold?).",
    "Publiée : annonce suivante": "Posted: next listing", "Passer celle-ci": "Skip this one", "Arrêter": "Stop",
    "Beebs": "Beebs", "Beebs activé": "Beebs turned on", "Activer Beebs": "Turn on Beebs", "Accès à beebs.app refusé : rien n'a changé.": "Access to beebs.app refused: nothing changed.",
    "Publier tes annonces Vinted sur Beebs en un clic, suivre tes concurrents Beebs, trouver le fournisseur d'un article. Aucune requête en plus vers Beebs.": "Post your Vinted listings on Beebs in one click, track your Beebs competitors, find an item's supplier. No extra requests to Beebs.",
    "Active Beebs pour publier ton annonce.": "Turn on Beebs to post your listing.", "Un clic, puis reviens sur ton annonce Vinted et clique à nouveau sur « Publier sur Beebs ».": "One click, then go back to your Vinted listing and click “Post on Beebs” again.",
    "Concurrents Beebs": "Beebs competitors", "Lien du dressing Beebs": "Beebs wardrobe link", "Aucun concurrent Beebs suivi.": "No Beebs competitor tracked.", "Vendeur Beebs": "Beebs seller",
    "Colle le lien du dressing Beebs d'un concurrent, ou clique sur « + Concurrent » sur Beebs (dressing ou article). Ouvre son dressing de temps en temps : les annonces disparues depuis ta dernière visite sont comptées comme ventes probables.": "Paste a competitor's Beebs wardrobe link, or click “+ Competitor” on Beebs (wardrobe or item). Open their wardrobe from time to time: listings gone since your last visit count as probable sales.",
    "Active Beebs pour suivre aussi tes concurrents Beebs et publier tes annonces Vinted sur Beebs en un clic.": "Turn on Beebs to also track your Beebs competitors and post your Vinted listings on Beebs in one click.",
    "Colle le lien d'un dressing Beebs (…/dressing/…).": "Paste a Beebs wardrobe link (…/dressing/…).", "Concurrent ajouté : ouvre son dressing pour relever ses annonces": "Competitor added: open their wardrobe to record their listings",
    "Revoir son dressing": "Review their wardrobe", "dressing jamais ouvert": "wardrobe never opened",
    "Elles apparaissent quand des annonces ont disparu entre deux visites de son dressing.": "They appear when listings have disappeared between two visits to their wardrobe.",
    "Ouvre son dressing avec « Revoir son dressing » pour relever ses annonces.": "Open their wardrobe with “Review their wardrobe” to record their listings.",
    "Tu suis déjà 30 concurrents Beebs : retires-en un avant d'en ajouter.": "You already track 30 Beebs competitors: remove one before adding another.", "Lien de dressing Beebs invalide.": "Invalid Beebs wardrobe link.",
    "Publier sur Beebs": "Post on Beebs", "Annonce AliEdge pour Beebs": "AliEdge listing for Beebs", "Tout remplir": "Fill in everything", "Remplissage…": "Filling in…",
    "Vérifie l'annonce, choisis la catégorie, l'état et la taille si Beebs les demande, puis clique sur « Mettre en vente ».": "Check the listing, choose the category, condition and size if Beebs asks, then click “Put on sale”.",
    "Annonce publiée : effacer de l'aide": "Listing posted: clear it", "Les champs ne sont pas encore affichés sur cette étape : utilise les boutons « Copier ».": "The fields aren't shown yet at this step: use the “Copy” buttons.",
    "Ouvre son dressing de temps en temps : AliEdge repère ce qu'il vend.": "Open their wardrobe from time to time: AliEdge spots what they sell.",
    "Quand publier sur Leboncoin": "When to post on Leboncoin", "Réponses toutes prêtes (messagerie Leboncoin)": "Ready-made replies (Leboncoin messages)",
    "Une réponse par paragraphe (ligne vide entre deux). {prix} est remplacé par la contre-offre conseillée. AliEdge insère le texte, c'est toi qui envoies.": "One reply per paragraph (blank line between two). {prix} is replaced by the suggested counter-offer. AliEdge inserts the text, you send it.",
    "Enregistrer les réponses": "Save replies", "Réponses enregistrées": "Replies saved", "Offre reçue": "Offer received", "Montant de l'offre": "Offer amount",
    "Pas encore assez de ventes Leboncoin repérées pour en tirer une tendance. Elles s'accumulent au fil des pages ouvertes par les membres.": "Not enough Leboncoin sales spotted yet to show a trend. They build up as members open pages.",
    "Relie le produit fournisseur à cette annonce pour voir ta marge.": "Link the supplier product to this listing to see your margin.",
    "Ajouter les photos à l'annonce": "Add the photos to the listing", "Ajout des photos…": "Adding photos…", "Vendre aussi ailleurs": "Sell elsewhere too", "Publier aussi sur Leboncoin": "Also post on Leboncoin",
    "Produit repéré dans le catalogue AliEdge": "Product spotted in the AliEdge catalog", "offre correcte": "fair offer",
    "Active Leboncoin en un clic.": "Turn on Leboncoin in one click.", "Plus tard": "Later", "Leboncoin activé": "Leboncoin turned on",
    "Ventes Leboncoin dans tes analyses, fournisseur et warehouse depuis les annonces, aide au dépôt. AliEdge lit seulement les pages que tu ouvres.": "Leboncoin sales in your analyses, supplier and warehouse from listings, posting help. AliEdge only reads the pages you open.",
    "Accès à leboncoin.fr refusé : rien n'a changé.": "Access to leboncoin.fr refused: nothing changed.",
    "Sur Leboncoin": "On Leboncoin", "Voir sur Leboncoin": "See on Leboncoin", "Pas encore de vente Leboncoin repérée pour cette recherche.": "No Leboncoin sale spotted yet for this search.",
    "Déposer sur Leboncoin": "Post on Leboncoin", "Annonce": "Listing",
    "Sur la page de dépôt, le bouton « Annonce AliEdge » remplit le titre, la description et le prix. Tu relis et tu publies toi-même.": "On the posting page, the “AliEdge listing” button fills in the title, description and price. You review and publish it yourself.",
    "Annonce AliEdge": "AliEdge listing", "Remplir les champs de la page": "Fill in the page fields",
    "Relis tout avant de publier : c'est toi qui publies l'annonce.": "Review everything before publishing: you're the one who publishes the listing.",
    "Champs pas encore affichés sur cette étape : utilise les boutons « Copier ».": "Fields not shown yet at this step: use the “Copy” buttons.",
    "Dans AliEdge, analyse un produit puis clique sur « Annonce » et choisis « Leboncoin » : l'annonce apparaîtra ici, prête à copier.": "In AliEdge, analyze a product, click “Listing” and choose “Leboncoin”: the listing will appear here, ready to copy.",
    "AliEdge": "AliEdge", "Produit relié : il rejoint le catalogue commun.": "Product linked: it joins the shared catalog.",
    "Tu as vendu cet article ? La warehouse l'achète, l'emballe et l'expédie à ta place.": "Sold this item? The warehouse buys, packs and ships it for you.",
    "Republiée": "Reposted", "Vendu (confirmé)": "Sold (confirmed)", "Vente probable": "Probable sale", "à revoir": "to review", "Ventes probables": "Probable sales",
    "Revoir ses annonces": "Review their listings", "Suivre": "Track", "Activer Leboncoin": "Turn on Leboncoin", "Vendeur Leboncoin": "Leboncoin seller", "page jamais ouverte": "page never opened",
    "Outils AliEdge sur Leboncoin (fournisseur, warehouse, aide au dépôt, concurrents) et ventes repérées sur les pages que tu ouvres. Aucune requête en plus vers Leboncoin.": "AliEdge tools on Leboncoin (supplier, warehouse, posting help, competitors) and sales spotted on the pages you open. No extra requests to Leboncoin.",
    "Ouvre leur page pour relever leurs annonces et repérer leurs ventes.": "Open their page to record their listings and spot their sales.",
    "Elles apparaissent quand des annonces ont disparu entre deux visites de sa page.": "They appear when listings have disappeared between two visits to their page.",
    "Ouvre sa page avec « Revoir ses annonces » pour relever ses annonces.": "Open their page with “Review their listings” to record their listings.",
    "Concurrent ajouté : ouvre sa page pour relever ses annonces": "Competitor added: open their page to record their listings", "Concurrent retiré": "Competitor removed",
    "✓ Concurrent suivi": "✓ Competitor tracked", "+ Concurrent": "+ Competitor", "Ajout…": "Adding…", "Retrait…": "Removing…",
    // ── Canaux de vente en plus (Beebs, Opla : les textes Opla passent par la forme « Beebs », voir tr1)
    "Colle le lien de la boutique Beebs d'un concurrent, ou clique sur « + Concurrent » sur Beebs (sa boutique ou un de ses articles). Ouvre sa boutique de temps en temps : les annonces disparues depuis ta dernière visite sont comptées comme ventes probables.": "Paste a competitor's Beebs shop link, or click “+ Competitor” on Beebs (their shop or one of their items). Open their shop from time to time: listings gone since your last visit count as probable sales.",
    "Lien de la boutique Beebs": "Beebs shop link", "Colle le lien d'une boutique Beebs.": "Paste a Beebs shop link.", "Lien de boutique Beebs invalide.": "Invalid Beebs shop link.",
    "Concurrent ajouté : ouvre sa boutique pour relever ses annonces": "Competitor added: open their shop to record their listings", "Revoir sa boutique": "Review their shop", "boutique jamais ouverte": "shop never opened",
    "Elles apparaissent quand des annonces ont disparu entre deux visites de sa boutique.": "They appear when listings have disappeared between two visits to their shop.",
    "Ouvre sa boutique avec « Revoir sa boutique » pour relever ses annonces.": "Open their shop with “Review their shop” to record their listings.",
    "Ouvre sa boutique de temps en temps : AliEdge repère ce qu'il vend.": "Open their shop from time to time: AliEdge spots what they sell.",
    "Un canal de vente en plus : choisis tes annonces Vinted, AliEdge les prépare une par une sur Beebs (texte, prix, photos). Tu publies chacune d'un clic, la suivante s'ouvre toute seule.": "An extra sales channel: choose your Vinted listings, AliEdge prepares them one by one on Beebs (text, price, photos). You post each one in a click, and the next one opens by itself.",
    "Sois connecté à Beebs. Vérifie chaque annonce avant de la publier (catégorie, état, taille).": "Be signed in to Beebs. Check each listing before posting it (category, condition, size).",
    "Reposter sur un autre site": "Repost on another site", "Canal de vente": "Sales channel",
    "Vérifie l'annonce, choisis la catégorie, l'état et la taille si Beebs les demande, puis publie-la.": "Check the listing, choose the category, condition and size if Beebs asks, then post it.",
    "Opla": "Opla", "Accès à opla.co refusé : rien n'a changé.": "Access to opla.co refused: nothing changed.",
    "Envoi possible avec la livraison Leboncoin.": "Envoi possible avec la livraison Leboncoin.",
  };

  // Textes avec des nombres ou des noms : remplacés par motif.
  const DAYS = { lun: "Mon", mar: "Tue", mer: "Wed", jeu: "Thu", ven: "Fri", sam: "Sat", dim: "Sun" };
  const PATTERNS = [
    [/^(\d+) concurrents? Leboncoin à revoir$/, (m, n) => `${n} Leboncoin competitor${n > 1 ? "s" : ""} to review`],
    [/^(\d+) ventes? repérées?(?: \(dont (\d+) confirmées?\))? · prix médian (.+?)(?: · (plus cher|moins cher) que Vinted de (.+))?$/, (m, n, c, p, d, v) => `${n} sale${n > 1 ? "s" : ""} spotted${c ? ` (${c} confirmed)` : ""} · median price ${p}${d ? ` · ${d === "plus cher" ? "higher" : "lower"} than Vinted by ${v}` : ""}`],
    [/^(\d+) champs? remplis?(?:, (\d+) photos? ajoutées?)?\. (.*)$/, (m, n, ph, rest) => `${n} field${n > 1 ? "s" : ""} filled${ph ? `, ${ph} photo${ph > 1 ? "s" : ""} added` : ""}. ${tr1(rest) ?? rest}`],
    [/^Catégorie : (.+)$/, "Category: $1"],
    [/^Estimation d'après (\d+) ventes Leboncoin repérées \(les ventes en moins de 7 jours comptent double\)\.$/, "Estimate based on $1 spotted Leboncoin sales (sales in under 7 days count double)."],
    [/^Meilleur moment pour publier : (lun|mar|mer|jeu|ven|sam|dim)\. entre (\d+) h et (\d+) h \(d'après (\d+) ventes repérées, estimation\)\.$/, (m, d, a, b, n) => `Best time to post: ${DAYS[d]} between ${a}:00 and ${b}:00 (based on ${n} spotted sales, estimate).`],
    [/^(\d+) photos? ajoutées?$/, (m, n) => `${n} photo${n > 1 ? "s" : ""} added`],
    [/^Photos \((\d+)\)$/, "Photos ($1)"],
    [/^dressing vu il y a (\d+) (min|h|j)$/, (m, n, u) => `wardrobe viewed ${n} ${u === "j" ? "d" : u} ago`],
    [/^(\d+) sélectionnées?$/, (m, n) => `${n} selected`],
    [/^boutique vue il y a (\d+) (min|h|j)$/, (m, n, u) => `shop viewed ${n} ${u === "j" ? "d" : u} ago`],
    [/^Publier (\d+) annonces? sur (Beebs|Opla|Leboncoin|Facebook)$/, (m, n, site) => `Post ${n} listing${n > 1 ? "s" : ""} on ${site}`],
    [/^Annonce AliEdge · (\d+) \/ (\d+)$/, "AliEdge listing · $1 / $2"],
    [/^Publier automatiquement sur (Beebs|Opla)$/, "Publish automatically on $1"],
    [/^Publication automatique dans (\d) s… \(Annuler dans l'aide AliEdge\)$/, "Automatic publishing in $1 s… (Cancel in the AliEdge helper)"],
    [/^Publication automatique en pause : complète (.+), puis publie\.$/, "Automatic publishing paused: fill in $1, then publish."],
    [/^(.+) livré en France$/, "$1 delivered to France"], [/^([\d\s  ]+) en stock$/, "$1 in stock"], [/^note ([\d,]+)\/5$/, "rated $1/5"],
    [/^livraison (.+) j$/, "delivery $1 d"], [/^boutique (.+)$/, "store $1"],
    [/^(✓ )?Publier sur (Beebs|Opla|Leboncoin|Facebook)$/, (m, ok, site) => `${ok || ""}Post on ${site}`],
    [/^(✓ )?Reposter sur (Beebs|Opla|Leboncoin|Facebook)$/, (m, ok, site) => `${ok || ""}Repost on ${site}`],
    [/^Annonce AliEdge pour Beebs · (\d+) \/ (\d+)$/, "AliEdge listing for Beebs · $1 / $2"],
    [/^suivi depuis il y a (\d+) (min|h|j)$/, (m, n, u) => `tracked for ${n} ${u === "j" ? "d" : u}`],
    [/^vérifié il y a (\d+) (min|h|j)$/, (m, n, u) => `checked ${n} ${u === "j" ? "d" : u} ago`],
    [/^page vue il y a (\d+) (min|h|j)$/, (m, n, u) => `page viewed ${n} ${u === "j" ? "d" : u} ago`],
    [/^vendu il y a (\d+) (min|h|j)$/, (m, n, u) => `sold ${n} ${u === "j" ? "d" : u} ago`],
    [/^parti en ([\d,]+) j$/, (m, n) => `sold in ${n.replace(",", ".")} d`],
    [/^(\d+) ventes? 30 j$/, (m, n) => `${n} sale${n > 1 ? "s" : ""} 30 d`],
    [/^(\d+) ventes? 7 j$/, (m, n) => `${n} sale${n > 1 ? "s" : ""} 7 d`],
    [/^(lun|mar|mer|jeu|ven|sam|dim)\. (\d+)h-(\d+)h : (\d+) vente\(s\)$/, (m, d, a, b, n) => `${DAYS[d]} ${a}-${b}h: ${n} sale(s)`],
    [/^Meilleur créneau observé : (lun|mar|mer|jeu|ven|sam|dim)\. entre (\d+) h et (\d+) h\.$/, (m, d, a, b) => `Best time slot observed: ${DAYS[d]} between ${a}:00 and ${b}:00.`],
    [/^Repère : tes (\d+) concurrents suivis vendent en médiane (\d+) articles en 30 jours à (.+), avec (\d+) annonces en ligne\.$/, (m, a, b, c, d) => `Benchmark: your ${a} tracked competitors sell a median of ${b} items in 30 days at ${c}, with ${d} listings online.`],
    [/^Protection du compte active : (\d+)\/(\d+) vérifications cette heure, rythme humain, pause automatique au moindre signal de Vinted\.$/, "Account protection on: $1/$2 checks this hour, human pace, automatic pause at the slightest signal from Vinted."],
    [/^(Jusqu'à (?:5|10) filtres .*?\.) (AliEdge regarde .*)$/, (m, a, b) => `${tr1(a) ?? a} ${tr1(b) ?? b}`],
    [/^il y a (\d+) min$/, "$1 min ago"], [/^il y a (\d+) h$/, "$1 h ago"], [/^il y a (\d+) j$/, "$1 d ago"],
    [/^(\d+) vendus? \/ 30 j$/, "$1 sold / 30 d"],
    [/^Encore (\d+:\d\d)\.(.*)$/, (m, t, rest) => `${t} left.${rest.replace(/(\d+) articles? ouverts?\./, (x, n) => `${n} item${n > 1 ? "s" : ""} opened.`)}`],
    [/^(\d+) vus · (\d+) ouverts(?: · prix médian (.+))?$/, (m, a, b, p) => `${a} seen · ${b} opened${p ? ` · median price ${p}` : ""}`],
    [/^(\d+) articles? ouverts?\.$/, (m, n) => `${n} item${n > 1 ? "s" : ""} opened.`],
    [/^Vu ×(\d+) · (.*)$/, "Seen ×$1 · $2"], [/^Ouvert · (.*)$/, "Opened · $1"],
    [/^Articles \((\d+)\)$/, "Items ($1)"],
    [/^score (\d+)\/100$/, "score $1/100"],
    [/^pour (.+)$/, "for $1"],
    [/^Recherche Vinted des produits ajoutés : (.*)$/, "Vinted search of the added products: $1"],
    [/^environ (\d+) min restantes$/, "about $1 min left"],
    [/^(\d+) annonces?$/, (m, n) => `${n} listing${n > 1 ? "s" : ""}`],
    [/^(\d+) ventes?$/, (m, n) => `${n} sale${n > 1 ? "s" : ""}`],
    [/^(\d+) pistes?$/, (m, n) => `${n} lead${n > 1 ? "s" : ""}`],
    [/^Nouvelle version (.+) prête\.$/, "New version $1 ready."],
    [/^AliEdge (.+) est installé\.$/, "AliEdge $1 is installed."],
    [/^Semaine du (.+)$/, "Week of $1"],
    [/^Médiane (.+)$/, "Median $1"],
    [/^Tu as utilisé tes (\d+) analyses gratuites du jour\. Passe à AliEdge Pro pour analyser sans limite\.$/, "You've used your $1 free analyses for today. Upgrade to AliEdge Pro for unlimited analyses."],
  ];

  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  function tr(s) {
    const k = norm(s);
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(EN, k)) return EN[k];
    for (const [re, rep] of PATTERNS) if (re.test(k)) return k.replace(re, rep);
    if (/\bOpla\b/.test(k) && !/\bBeebs\b/.test(k)) { const t = tr(k.replace(/\bOpla\b/g, "Beebs")); if (t != null) return t.replace(/\bBeebs\b/g, "Opla"); }
    // Morceaux séparés par « · » (ex. « il y a 2 min · score 80/100 ») : chacun traduit à part.
    // Plusieurs phrases dans un même texte : chacune traduite à part (toutes doivent l'être).
    const sentences = k.split(/(?<=[.!?]) (?=[A-ZÀ-Ý«])/);
    if (sentences.length > 1) {
      const parts = sentences.map((x) => tr1(x));
      if (parts.every((x) => x != null)) return parts.join(" ");
    }
    if (k.includes(" · ")) {
      let any = false;
      const out = k.split(" · ").map((part) => { const t = tr1(part); if (t != null) { any = true; return t; } return part; }).join(" · ");
      return any ? out : null;
    }
    return null;
  }
  function tr1(k) {
    if (Object.prototype.hasOwnProperty.call(EN, k)) return EN[k];
    for (const [re, rep] of PATTERNS) if (re.test(k)) return k.replace(re, rep);
    // Opla reprend les textes de Beebs (mêmes outils) : on traduit la forme « Beebs » puis on remet Opla.
    if (/\bOpla\b/.test(k) && !/\bBeebs\b/.test(k)) { const t = tr1(k.replace(/\bOpla\b/g, "Beebs")); if (t != null) return t.replace(/\bBeebs\b/g, "Opla"); }
    return null;
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
  const ATTRS = ["placeholder", "title", "aria-label"];
  function trText(node) {
    const v = node.nodeValue;
    if (!v || !/[A-Za-zÀ-ÿ]/.test(v)) return;
    const t = tr(v);
    if (t == null || t === norm(v)) return;
    const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    node.nodeValue = lead + t + trail;
  }
  function trEl(el) {
    if (el.closest?.("[data-no-i18n]")) return;
    for (const a of ATTRS) {
      const v = el.getAttribute?.(a);
      if (v) { const t = tr(v); if (t != null && t !== v) el.setAttribute(a, t); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!SKIP.has(root.parentNode?.nodeName) && !root.parentNode?.closest?.("[data-no-i18n]")) trText(root); return; }
    if (root.nodeType === 1) trEl(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 1) { if (n.nodeName !== "SCRIPT" && n.nodeName !== "STYLE") trEl(n); continue; }
      const p = n.parentNode;
      if (p && !SKIP.has(p.nodeName) && !p.closest?.("[data-no-i18n]")) trText(n);
    }
  }
  function observe(root) {
    walk(root);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") trText(m.target);
        else if (m.type === "attributes") trEl(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  let lang = null;
  async function getLang() {
    let pref = "auto";
    try { pref = (await chrome.storage.local.get("ae_lang")).ae_lang || "auto"; } catch { /* pas d'accès au stockage */ }
    if (pref === "fr" || pref === "en") return pref;
    let ui = "";
    try { ui = chrome.i18n.getUILanguage(); } catch { ui = navigator.language || "fr"; }
    return /^fr\b/i.test(ui) ? "fr" : "en";
  }

  // Sur les sites (scripts de contenu) : on ne traduit que ce qu'AliEdge ajoute, jamais le texte du site.
  // Les shadow roots créés par AliEdge sont repérés dès leur création, avant même de connaître la langue.
  const shadows = [];
  function trackShadows() {
    if (!Element.prototype.attachShadow || Element.prototype.attachShadow.__ae) return;
    const orig = Element.prototype.attachShadow;
    const patched = function (init) {
      const sr = orig.call(this, init);
      if (lang === "en") { try { observe(sr); } catch { /* rien */ } } else if (lang == null) shadows.push(sr);
      return sr;
    };
    patched.__ae = true;
    Element.prototype.attachShadow = patched;
  }
  const OURS = '[class*="aliedge"], [id^="aliedge"], [id^="ae-"]';
  function observeOurs() {
    document.querySelectorAll(OURS).forEach(observe);
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches(OURS)) observe(n);
        n.querySelectorAll?.(OURS).forEach(observe);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /**
   * Lance la traduction. Panneau : start([document.body]). Sites : start([], { page: true }) ne traduit
   * que les éléments et shadow roots d'AliEdge.
   */
  let started = false;
  async function start(roots = [], { page = false } = {}) {
    if (page) { if (started) return lang; started = true; trackShadows(); }
    lang = await getLang();
    if (lang !== "en") { shadows.length = 0; return lang; }
    roots.forEach((r) => r && observe(r));
    if (page) { shadows.splice(0).forEach((sr) => { try { observe(sr); } catch { /* rien */ } }); observeOurs(); }
    return lang;
  }

  globalThis.AE_I18N = { start, tr, walk, getLang, lang: () => lang, t: (s) => (lang === "en" ? tr(s) ?? s : s) };
})();
