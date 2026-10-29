# FoodBall Club — compagnon Pro Clubs (EA FC 27)

PWA mobile-first du club (ex-Dommage BJ FC) : stats synchronisées depuis EA, fiches joueurs et matchs,
paris virtuels (FoodBet), Coach IA. Tout en français : interface, commentaires, messages de commit.

## Stack et commandes

Vite 7 + React 19 + TypeScript, react-router 7, TanStack Query, Neon Postgres via Drizzle, fonctions Vercel dans `api/`.
Node ≥ 20.12. Vite est volontairement en v7.

- `npm run build` : vérifie le budget de fonctions Vercel, `tsc`, puis build. À lancer avant tout push.
- `npm run test:fc27` : toute la suite (PGlite en mémoire, migrations réelles, aucun réseau). Doit rester verte.
- `npm run dev` : app + `/api` sur :5173. Exige `DATABASE_URL` dans `.env.local` (absent en session cloud).
- `npm run demo` : la vraie app sur :5175 avec `demo/fixtures/` (photo de l'API publique de prod), sans base ni
  réseau. `npm run demo -- --connecte` : compte démo, FoodBet ouvert avec de vraies cotes ; étape FoodBet via `/paris?scene=vote` (`&admin` pour la vue admin). Les écritures sont refusées.
- `npm run captures` : captures 390 px des pages principales dans `captures/` (ignoré par git), signale tout
  débordement horizontal. Pages au choix : `npm run captures -- /matchs/211 /club`. Sans Chrome :
  `npx playwright-core install chromium`. `npm run demo:snapshot` rafraîchit les fixtures (demande le réseau).
- Migrations : SQL écrit à la main dans `drizzle/NNNN_nom.sql` + entrée dans `drizzle/meta/_journal.json`.
  Appliquer : `node --env-file=.env.local --import tsx server/db/migrate.ts` (`.env.local` sans BOM ni CRLF).

## Règles de travail

- **Push sur `main` = mise en prod** (Vercel déploie automatiquement clubs-compagnon.vercel.app).
  Ne pousser que si l'utilisateur le demande (« push sur la prod »).
- **Une migration doit être appliquée en prod AVANT de pousser le code qui lit ses colonnes**, sinon l'API plante.
  Demander l'accord de l'utilisateur avant toute écriture sur la base de prod.
- Base Neon (projet `withered-boat-37348216`) : branche `main` = prod, branche `dev` = copie pour développer.
- Limite Vercel Hobby : 12 fonctions (10 utilisées). Regrouper plutôt qu'ajouter un fichier dans `api/`.
- Vérifier visuellement à 390 px de large (aucun débordement horizontal) quand on touche l'interface.

## Données EA

- `server/ea-sync.ts` : synchro au plus toutes les 5 min, déclenchée par les lectures `/api/club|members|matches`.
- EA ne garde que les 10 derniers matchs par type : la réponse brute est stockée dans `ea_raw`
  (clubs : `{ info, overall, season, allTime, playoffs }` ; members : fiche + `career` ; matches : match complet,
  les deux équipes). `server/db/ea-fields.ts` en extrait les champs. Les listes ne relisent jamais `matches.ea_raw`.
- Pièges connus : divisions numérotées depuis l'Élite (`shared/division.ts` : 3 = Division 2) ; EA ne donne pas
  notre rang au classement ; `vproattr` vaut « NH » (pas d'attributs des Pros en FC 27) ; nationalité = simple
  numéro ; l'URL de blason du SDK renvoie un blason générique pour FC 27 ; `winnerByDnf` = abandon adverse.

## Interface (thème FIFA 17, palette Dommage)

- `src/styles/fifa17.css` : la matière du thème (stade flouté, panneaux sombres à bords droits, aplat bleu +
  bande en biais sur l'élément actif, onglets soulignés). Chargé après `responsive.css`.
- `src/styles/club-pages.css` : pages de la réorganisation (Club, fiche joueur, duel, accueil).
- Chiffres et scores : jamais coupés sur deux lignes (`white-space: nowrap`), les noms se resserrent à la place.
- **Vérifier qu'un nom de classe n'existe pas déjà** avant d'en créer un : `.fc-streak` et `.fc-duel` existaient
  et ont cassé des tuiles (grep dans `src/styles`).
- Navigation : Accueil `/`, Matchs `/matchs` (fiche `/matchs/:id`), Effectif `/joueurs` (fiche `/joueurs/:id`),
  Club `/club` (`/stats` y redirige ; `/playoffs` = page de la Nuit Inhouse 1), FoodBet `/paris` (plein écran, 4 phases + salle d’attente).
- Contenu éditorial des nuits Inhouse : `src/content/playoffs.ts` (`NEXT_NIGHT` = Nuit Inhouse 2, 30/10/2026).

## Maquettes et captures (session cloud)

- L'utilisateur suit le travail depuis son téléphone : il juge sur images, pas sur le code.
- Nouvelle interface : proposer d'abord une maquette (page HTML statique, thème FIFA 17, 390 px), la faire valider,
  puis coder. Une donnée que l'API ne renvoie pas encore se maquette dans l'app en l'ajoutant aux fixtures de `demo/`.
- Toute PR qui touche l'interface : lancer `npm run captures`, puis montrer les captures avant / après
  (publication en artifact si l'outil existe, sinon `git add -f captures/` sur la branche de la PR et images
  liées dans la description ; retirer `captures/` avant le merge).
- Travailler sur une branche et ouvrir une PR ; ne jamais pousser sur `main` sans « push sur la prod ».

## Feuille de route

1. **Fiche adversaire** sur `/matchs/:id` : appeler `clubs.get` + `clubs.overallStats` sur `opponentEaClubId`
   (skill rating, division, bilan, série), mis en cache en base pour ne pas rappeler EA à chaque visite.
2. **Historique des confrontations** : nos matchs contre le même `opponent_ea_club_id` (aucun appel EA).
3. Adapter les tests navigateur (`tests/*.browser.ts`) au nouveau guide (`src/lib/tour.ts`, clé `dommage.tour.v3`)
   et à l'archivage de FC 27.
4. Récit, bilan et photos de la Nuit Inhouse 2 après le 30/10.
