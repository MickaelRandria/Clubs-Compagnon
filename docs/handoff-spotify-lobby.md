# Passation : « En ce moment dans le lobby » (Spotify + Jam)

Document pour un agent (Codex ou autre) qui reprend ce chantier en cours. Lire d'abord `CLAUDE.md`
(règles du dépôt : tout en français, push sur `main` = prod, migrations appliquées en prod avant le code,
accord explicite de l'utilisateur avant toute écriture sur la base de prod et avant tout push).

## Objectif (validé par l'utilisateur)

Une carte « En ce moment dans le lobby » qui montre en direct ce que l'**hôte** écoute sur Spotify
(pochette, titre, artiste, barre de progression, titre suivant) et un bouton vert **« Rejoindre la Jam »**.

- Maquette validée : https://claude.ai/artifact/AHBUzer7MMwWEZ6kkqmYWy
- Emplacements : en haut de l'accueil (`src/views/HomeView.tsx`, carte complète) et dans la salle
  d'attente FoodBet (`src/views/FoodBetView.tsx`, `RoomBefore` et `RoomSession`, version compacte).
- La carte n'apparaît que si un titre joue. Pas de compteur de personnes dans la Jam (Spotify ne le donne pas).
- Un seul hôte, choisi en reliant son compte Spotify depuis un profil admin. Aucun pseudo n'est codé en dur.
- Le lien de la Jam ne vient pas de l'API Spotify : un admin le colle dans l'app (champ « Lien de la Jam »).

## Contraintes techniques

- **Plus aucune fonction Vercel libre (12/12)** : ne pas créer de fichier dans `api/`. La connexion Spotify
  passe par le routeur de connexion existant (`api/auth/[action].ts` → `server/auth-router.ts`), la lecture
  du titre en cours et le lien de la Jam par le routeur FoodBet (`api/bets/[action].ts` → `server/bets-http.ts`).
- Spotify en **mode développeur** : le propriétaire de l'app doit avoir **Premium** ; une nouvelle app
  accepte **5 comptes autorisés**. Ajouter l'hôte dans « User Management » s'il ne possède pas l'app.
- Portées OAuth : `user-read-currently-playing user-read-playback-state` (titre en cours + file d'attente).
- Aucun secret côté navigateur : le serveur garde le jeton de rafraîchissement et appelle Spotify.
  Petit cache mémoire (~10 s), partagé entre requêtes simultanées d'une même instance serveur.
  Ce cache n'est pas partagé entre plusieurs instances Vercel. Les réponses 429 respectent `Retry-After`.
- Variables d'environnement Vercel (posées par l'utilisateur, jamais dans le code ni dans la conversation) :
  `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. Adresse de retour à déclarer dans l'app Spotify :
  `https://clubs-compagnon.vercel.app/api/auth/spotify-callback` (et `http://127.0.0.1:5173/api/auth/spotify-callback` en local).
  `localhost` est refusé par Spotify. Ouvrir le site avec la même origine que celle déclarée.

## Plan et avancement

Branche : `lobby-spotify` (partie de `main` après le commit `0c9ba4a`).

| Étape | Fichiers | État |
|---|---|---|
| 1. Migration `drizzle/0028_lobby_music.sql` + entrée `drizzle/meta/_journal.json` : table `lobby_music` (une ligne : compte hôte, jetons Spotify, expiration, lien de la Jam) | `drizzle/` | fait |
| 2. Client Spotify serveur : URL d'autorisation, échange du code, rafraîchissement du jeton, titre en cours + suivant, cache | `server/spotify.ts`, `server/db/lobby.ts`, `shared/lobby.ts` | fait |
| 3. Routes de connexion `GET /api/auth/spotify` (admin connecté → Spotify) et `GET /api/auth/spotify-callback` | `server/auth-router.ts`, `server/spotify-http.ts`, `api/auth/[action].ts` | fait |
| 4. Routes `GET /api/bets/lobby` (titre en cours, public) et `POST /api/bets/jam` (admin : lien de la Jam) | `server/bets-http.ts`, `api/bets/[action].ts` | fait |
| 5. Front : composant `LobbyMusic` (complet / compact), interrogé toutes les 15 s ; accueil + salle d'attente FoodBet | `src/components/home/LobbyMusic.tsx`, `src/styles/lobby.css`, `src/api/bets.ts` | fait |
| 6. Admin : sur la page Profil (admins), « Connecter Spotify » et champ « Lien de la Jam » | `src/views/ProfileView.tsx` (`LobbyAdmin`) | fait |
| 7. Démo : `/api/bets/lobby` simulé dans `demo/serve.ts` ; captures 390 px | `demo/`, `captures/` (ignoré) | fait |
| 8. Tests (`npm run test:fc27`), build (`npm run build`), commit sur la branche | 221 tests verts, 29 ajoutés ; parcours Chrome 390/320 px validés ; build réussi (12/12 fonctions) | fait |
| 9. Mise en prod : appliquer 0028 en prod (Neon, projet `withered-boat-37348216`, branche `br-patient-rice-b2zco9zo`) puis pousser | Migration vérifiée, PR #1 fusionnée sur `main`, Vercel READY et parcours public validé le 31/10/2026 | fait |

Mettre à jour la colonne « État » à chaque étape terminée.

## Comment appliquer une migration en prod (fait ainsi jusqu'ici)

Avec l'outil Neon `run_sql_transaction` : les instructions du fichier (séparées par `--> statement-breakpoint`),
puis `INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ('<sha256 du fichier en LF>', <when du journal>)`.
Vérifier ensuite par une requête. Ne le faire qu'avec l'accord explicite de l'utilisateur
(il a jusqu'ici répondu « j'autorise la mise en prod »).

## Reste à demander à l'utilisateur

- L'app Spotify est créée, Neon est accessible et `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` sont
  présents dans Vercel Production (vérifié sans lire les valeurs).
- Vérifier l'adresse de retour ci-dessus et ajouter l'hôte dans « User Management » si nécessaire.
- Choisir l'hôte en reliant son Spotify depuis un profil admin (son compte Discord doit être admin).
- Après déploiement : l'hôte va sur Profil → « Connecter Spotify » ; un admin colle le lien de la Jam.

## Reprise par Codex — 31 octobre 2026

La partie locale a été complétée sur `lobby-spotify`, puis publiée en production après accord explicite
de l'utilisateur (voir le bilan de déploiement ci-dessous).

- OAuth : cookie Spotify distinct de Discord, lié au compte initiateur ; rôle admin revérifié au retour.
- Jetons : remplacement complet lors d'un changement d'hôte ; rafraîchissement conditionnel qui n'écrase
  pas une reconnexion concurrente ; un seul nouvel essai après 401, suppression d'une connexion révoquée.
- Réseau : délai de 8 s par appel, erreurs sans secret, cache invalidé lors d'une modification, appels
  simultanés regroupés ; pause, podcast et publicité masquent la carte.
- Front : logo officiel et liens des morceaux vers Spotify, progression accessible, suppression de l'ancien
  morceau en cas de panne ou de perte réseau ; aucune persistance disque de la musique en direct.
- Admin : chargement et erreurs explicites, protection de la saisie pendant l'enregistrement et retour
  distinct pour un retrait du lien. Le bouton « Déconnecter Spotify » supprime le compte hôte et les
  jetons stockés ; le lien Jam saisi par un admin reste indépendant et peut être retiré dans le formulaire.
- Démo : pochette locale et fixture `demo/fixtures/lobby.json`, `/profil?admin` avec `--connecte`.
  États sur toute page : `?musique=pause|absente|indisponible|sans-jam`, lecture par défaut.
- Tests ajoutés : `tests/spotify.test.ts`, `tests/lobby.test.ts` (vraies migrations dans PGlite en mémoire),
  `tests/lobby.browser.ts` (Chrome + démo autonome, aucune base distante ni requête Spotify).
- Validation finale : **221/221 tests**, dont 29 nouveaux, build réussi, aucun débordement à 390/320 px
  ni exception JavaScript dans les parcours testés. Le build signale encore des annotations de la dépendance
  Zod et le poids du bundle principal ; ces avertissements n'empêchent pas la compilation.

Commandes de vérification :

```powershell
npm run test:fc27
npm run test:lobby:browser
npm run build
npm run captures -- --connecte / '/paris?scene=rien' '/paris?scene=session' '/profil?admin' '/?musique=pause' '/?musique=sans-jam'
```

Captures dans `captures/` : accueil, FoodBet avant/session, profil admin, pause, sans Jam ; aperçus
recadrés `lobby-accueil.png`, `lobby-foodbet.png`, `lobby-profil.png`. Les tests navigateur vérifient
également 320 px, les noms longs, la progression, les liens, l'enregistrement/retrait/déconnexion simulés,
le refus réel des écritures en démo et la disparition du morceau après perte réseau.

Limite de validation : la connexion à un vrai compte Spotify et une vraie Jam restent à essayer après
configuration et déploiement autorisé. Les échanges OAuth et Spotify sont simulés dans les tests locaux.

Documentation Spotify vérifiée le 31 octobre 2026 :

- [Quotas : Premium du propriétaire et cinq comptes autorisés](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
- [Adresses de retour : HTTPS et exception pour les IP de boucle locale](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
- [Attribution, liens et pochettes](https://developer.spotify.com/documentation/design).
- [Politique : déconnexion et suppression des données, I.2](https://developer.spotify.com/policy).

## Préparation de la mise en production — 31 octobre 2026

L'utilisateur a explicitement autorisé la migration 0028 sur la base de production et le push sur `main`.
Cet accord est acquis : ne pas le redemander pour reprendre le même déploiement.

- Nouveau préflight local sur `991c2a9` : 221/221 tests et build réussis, 12/12 fonctions.
- Avant publication, `origin/main` et la production Vercel étaient sur `0c9ba4a`.
- Le CLI Vercel local est authentifié sur `mickaelrandrias-projects/clubs-compagnon` ; les deux variables
  Spotify sont présentes comme secrets de l'environnement Production. Le connecteur Vercel refuse leur
  énumération (403), mais le CLI permet de vérifier les noms sans accéder aux valeurs.
- **Ne pas utiliser la connexion actuelle de `.env.local` pour cette migration** : malgré sa mention
  `VERCEL_ENV=production`, une requête de lecture identifie la branche Neon `br-green-king-b2dbq2kb`,
  et non `br-patient-rice-b2zco9zo`. Aucune écriture n'y a été effectuée.
- Vercel ne restitue pas les valeurs des secrets de production au CLI. Le plugin Neon a été activé et
  donne désormais accès directement à la bonne branche, sans exporter ses identifiants.
- Transaction préparée dans `captures/deploiement-spotify-0028.sql` (ignoré par git) : contrôle du projet,
  de la branche et de la migration précédente, création de la table et inscription au journal en une
  transaction, puis lecture de vérification. La migration a été exécutée via Neon sur la branche confirmée.
- Empreinte SHA-256 de 0028 en LF : `7dea4cb229366167129ef7aad768de84ff9b64971a10cd631c26bf495ec62ed8` ;
  `created_at` : `1791600000000`. Vérification après transaction : table `lobby_music` présente et vide,
  une seule entrée au journal avec l'empreinte attendue. La publication du code sur `main` a suivi cette étape.

## Déploiement terminé — 31 octobre 2026

- [PR #1](https://github.com/MickaelRandria/Clubs-Compagnon/pull/1) fusionnée sur `main` : commit applicatif
  `3ef0dd94683385fc2814701c7f6771bdf152a7bf`. Les captures avant/après sont liées dans la PR et retirées
  de l'arbre avant fusion.
- Déploiement Vercel `dpl_HrJNcB5No5FS3qHB3A9ajWXEbZhj`, état **READY**, environnement Production,
  alias [clubs-compagnon.vercel.app](https://clubs-compagnon.vercel.app).
- Vérifications publiques : accueil et `/profil` HTTP 200, largeur 390 px sans débordement,
  aucune exception JavaScript ni requête échouée dans Chrome. Logo Spotify HTTP 200.
- `GET /api/bets/lobby` HTTP 200 : `playing`, `next`, `host` et `jamUrl` à `null`, `connected: false`.
  C'est l'état attendu avant la première connexion de l'hôte.
- `GET /api/auth/spotify` HTTP 401 sans compte Discord ; aucune connexion ni écriture de test simulée
  en production. Aucun journal de niveau erreur/fatal trouvé sur ce déploiement dans les dix minutes
  du contrôle.

Activation restante par l'hôte : ouvrir [Mon profil](https://clubs-compagnon.vercel.app/profil) avec son
compte Discord admin, cliquer « Connecter Spotify », autoriser l'app, coller le lien de la Jam puis lancer
un morceau. La carte apparaît sur l'accueil et dans FoodBet quand un titre joue. Cette connexion réelle
et l'ouverture de la Jam nécessitent le compte personnel de l'hôte et restent à effectuer par lui.

## Commandes, visibilité et recherche — reprise du 1er novembre 2026

Branche de travail : `spotify-commandes`, depuis `main` après la publication de 0028.

Demande de l'utilisateur et répartition des droits confirmée :

- **Hôte Spotify uniquement** : masquer/afficher la musique aux autres, pause, reprise, morceau suivant
  et précédent. Un autre admin n'obtient pas ces commandes par son seul rôle admin.
- **Tous les membres connectés avec Discord** : rechercher des morceaux et les ajouter à la file de
  l'hôte, sans relier chacun un compte Spotify.
- Masquer coupe aussi la transmission du morceau, de l'hôte et du lien Jam aux autres par l'API.
  L'hôte conserve son lecteur privé, y compris pendant une pause.

Une page `/musique` est ajoutée, accessible depuis la carte et les profils connectés. La maquette
390 px se trouve dans `captures/spotify-commandes-maquette.html` (ignoré par git). Les scènes de démo
utilisent `--connecte` : `/musique?hote`, `/musique`, `&musique=masquee|pause|reconnexion|absente`.
Les écritures restent refusées en démo ; les succès des mutations sont simulés dans les tests navigateur.

Migration `0029_lobby_controls` appliquée en production le 1er novembre 2026, avec visibilité et portées OAuth réellement accordées.
La portée `user-modify-playback-state` exige que l'hôte **autorise à nouveau Spotify** depuis l'app.
Rafraîchir l'ancien jeton ne suffit pas. Les commandes et ajouts nécessitent un compte hôte Premium
et un lecteur Spotify actif.

**Le 1er novembre 2026, l'utilisateur a explicitement autorisé la migration 0029 en production ; elle
est terminée et cet accord est acquis. Le push du nouveau code reste à autoriser.** Ne pas réappliquer
0029. Ne pas utiliser la connexion actuelle de `.env.local` pour la production (voir le contrôle de
branche ci-dessus).

État de cette reprise : **réalisation locale terminée sur `spotify-commandes`, code non publié ;
migration 0029 déjà appliquée en production**. Commit applicatif : `243b2f6`.

- `/musique` : console privée de l'hôte, interrupteur, précédent/pause/reprise/suivant, recherche explicite
  de 2 à 100 caractères et dix résultats au maximum, ajout confirmé après réponse de Spotify.
- Routes ajoutées au routeur existant `/api/bets/` : `lobby-console`, `lobby-visibility`, `spotify-control`,
  `spotify-search` et `spotify-queue`. Le budget reste de **12/12 fonctions**.
- Droits vérifiés en base : compte Discord existant pour chaque nouvelle route ; identité de l'hôte pour
  les commandes et la visibilité. Les droits ne sont pas déduits du seul rôle admin dans le navigateur.
- La visibilité contourne les caches à chaque lecture et après les appels Spotify. Les mesures privées
  sont partagées dix secondes entre requêtes simultanées ; les anciens morceaux disparaissent sur panne.
- Une panne de Spotify laisse l'hôte accéder au réglage de visibilité. Une commande déjà acceptée
  reste réussie même si la lecture de confirmation échoue. Aucun nouvel essai de mutation après délai
  réseau/5xx ; un seul nouvel essai après un 401 explicite et rotation du jeton.
- Les anciennes autorisations affichent une demande de reconnexion. Les portées ne sont jamais inventées :
  une reconnexion les remplace, une rotation les conserve uniquement si Spotify ne les renvoie pas.
- Console et recherches ne sont pas persistées sur disque. Limites par compte et instance serveur :
  12 recherches, 6 ajouts et 20 commandes/réglages par minute.
- Validation : **243/243 tests**, dont 22 nouveaux ; tests navigateur du lobby et de la console verts,
  aucun débordement à 390/320 px ni exception JavaScript. Build réussi, avec les avertissements Zod
  et poids du bundle principal déjà connus. Les appels Spotify sont simulés ; la connexion et l'écoute
  réelles sur le compte personnel de l'hôte restent à vérifier après déploiement autorisé.

Commandes de vérification :

```powershell
npm run test:fc27
npm run test:lobby:browser
npm run test:music:browser
npm run build
npm run captures -- --connecte '/musique?hote' '/musique' '/musique?hote&musique=masquee' '/musique?musique=masquee' '/profil?admin' '/'
```

Captures locales dans `captures/` : `musique-hote-connecte.png`, `musique-connecte.png`, variantes
masquées, pause et reconnexion ; `musique-avant-carte.png` restitue la carte publiée avec 0028 depuis
le commit `07c12eb`, `lobby-accueil.png` montre la nouvelle entrée vers la recherche. Aucune capture
n'est ajoutée à l'arbre versionné avant l'accord de push et la préparation de la PR de revue.

Transaction de production préparée dans `captures/deploiement-spotify-0029.sql`, puis **exécutée via
Neon et vérifiée après validation de la transaction le 1er novembre 2026** :
contrôle du projet et de la branche, vérification de 0028, ajout des deux colonnes et écriture au journal
en une transaction. Empreinte SHA-256 de 0029 en LF :
`a038569f488194cc5248f8777a540cb2613611f32cd11e1bfbd596cf0a00ea61` ;
`created_at` : `1791700000000`.

Après accord explicite pour **la nouvelle publication** : vérifier que 0029 est toujours présente,
pousser la branche de revue et ouvrir la PR avec les captures,
retirer les captures avant fusion sur `main`, attendre Vercel READY et vérifier le parcours public.
L'hôte ouvre ensuite Profil → « Relier un autre compte Spotify » (ou « Autoriser les commandes Spotify »
sur `/musique`) puis lance un titre sur son appareil avant d'essayer les commandes et l'ajout à la file.

Références Spotify : [commandes et permission de lecture](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback),
[ajout à la file](https://developer.spotify.com/documentation/web-api/reference/add-to-queue),
[recherche](https://developer.spotify.com/documentation/web-api/reference/search).

## Migration 0029 terminée — 1er novembre 2026

- Accord explicite de l'utilisateur : « j'autorise la migration 0029 en production ». Cet accord porte
  sur la base ; il ne constitue pas encore un accord de push sur `main`.
- Contrôle préalable sur `withered-boat-37348216` / `br-patient-rice-b2zco9zo` / `neondb` : 0028 présente
  avec l'empreinte attendue, 0029 absente et aucune des deux nouvelles colonnes.
- Test sur une nouvelle branche issue de la production, `verification-0029-20261101`
  (`br-small-block-b2vg9dur`) : transaction réussie sur les données existantes et valeurs par défaut
  conformes. Expiration automatique configurée au `2026-11-01T14:15:00Z` ; aucun identifiant local modifié.
- Transaction de production exécutée avec projet/branche explicites, contrôle des prérequis,
  `lock_timeout=5s` et `statement_timeout=30s`. Ajout des colonnes et entrée du journal atomiques.
- Lecture indépendante après transaction : **une** entrée de journal pour 0029, empreinte LF
  `a038569f488194cc5248f8777a540cb2613611f32cd11e1bfbd596cf0a00ea61`, `created_at=1791700000000` ;
  `visible boolean NOT NULL DEFAULT true` et `spotify_scope text NULL` conformes. La ligne existante
  conserve `visible=true`, `spotify_scope=NULL`. Aucun jeton n'a été lu dans les résultats de contrôle.
- Le site public répond HTTP 200 après migration. **Aucun push ni nouveau déploiement applicatif**
  n'a été effectué. Le nouveau code reste sur `spotify-commandes` en attendant l'accord de publication.
