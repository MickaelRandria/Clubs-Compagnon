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
- Un seul hôte (probablement vrYmika, à confirmer avec l'utilisateur), qui relie son compte Spotify une fois.
- Le lien de la Jam ne vient pas de l'API Spotify : un admin le colle dans l'app (champ « Lien de la Jam »).

## Contraintes techniques

- **Plus aucune fonction Vercel libre (12/12)** : ne pas créer de fichier dans `api/`. La connexion Spotify
  passe par le routeur de connexion existant (`api/auth/[action].ts` → `server/auth-router.ts`), la lecture
  du titre en cours et le lien de la Jam par le routeur FoodBet (`api/bets/[action].ts` → `server/bets-http.ts`).
- Spotify en **mode développeur** : l'hôte doit être ajouté dans « User Management » de l'app Spotify.
- Portées OAuth : `user-read-currently-playing user-read-playback-state` (titre en cours + file d'attente).
- Aucun secret côté navigateur : le serveur garde le jeton de rafraîchissement et appelle Spotify.
  Petit cache mémoire (~10 s) pour ne pas appeler Spotify à chaque visiteur.
- Variables d'environnement Vercel (posées par l'utilisateur, jamais dans le code ni dans la conversation) :
  `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`. Adresse de retour à déclarer dans l'app Spotify :
  `https://clubs-compagnon.vercel.app/api/auth/spotify-callback` (et `http://localhost:5173/api/auth/spotify-callback` en local).

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
| 7. Démo : `/api/bets/lobby` simulé dans `demo/serve.ts` ; captures 390 px | `demo/` | à faire |
| 8. Tests (`npm run test:fc27`), build (`npm run build`), commit sur la branche | — | à faire |
| 9. Mise en prod : **demander l'accord**, appliquer 0028 en prod (Neon, projet `withered-boat-37348216`, branche `br-patient-rice-b2zco9zo`) puis pousser | — | à faire |

Mettre à jour la colonne « État » à chaque étape terminée.

## Comment appliquer une migration en prod (fait ainsi jusqu'ici)

Avec l'outil Neon `run_sql_transaction` : les instructions du fichier (séparées par `--> statement-breakpoint`),
puis `INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ('<sha256 du fichier en LF>', <when du journal>)`.
Vérifier ensuite par une requête. Ne le faire qu'avec l'accord explicite de l'utilisateur
(il a jusqu'ici répondu « j'autorise la mise en prod »).

## Reste à demander à l'utilisateur

- Créer l'app sur developer.spotify.com (Web API), déclarer l'adresse de retour ci-dessus, ajouter l'hôte
  dans « User Management », poser `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` dans Vercel (Production).
- Confirmer l'hôte de la musique.
- Après déploiement : l'hôte va sur Profil → « Connecter Spotify » ; un admin colle le lien de la Jam.
