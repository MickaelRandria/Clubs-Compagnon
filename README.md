# Dommage BJ FC

Stats Pro Clubs du club : Dashboard, joueurs, matchs (avec notes saisies à la main), stats et Playoffs.

Vite + React + TypeScript · react-router · TanStack Query · Neon (Postgres) via Drizzle · fonctions Vercel dans `/api`.

## Lancer en local

Prérequis : Node.js 20.12 ou plus récent, et une base [Neon](https://neon.tech).

```bash
npm install
cp .env.example .env.local        # puis colle ta chaîne Neon dans DATABASE_URL
npm run db:migrate                # crée les tables
npm run db:seed                   # remplit avec les données actuelles
npm run dev                       # http://localhost:5173
```

`npm run dev` sert aussi les routes `/api/*` : pas besoin de Vercel CLI en local.

### Variable d'environnement

| Variable       | Où la trouver                                                                 |
|----------------|-------------------------------------------------------------------------------|
| `DATABASE_URL` | Console Neon → ton projet → **Connect** → chaîne *pooled* (`…-pooler…?sslmode=require`) |

## Scripts

| Commande              | Effet                                                                    |
|-----------------------|--------------------------------------------------------------------------|
| `npm run dev`         | App + API en local                                                       |
| `npm run build`       | Vérification TypeScript puis build de production dans `dist/`            |
| `npm run typecheck`   | Vérification TypeScript seule                                            |
| `npm run db:generate` | Génère une migration SQL dans `drizzle/` après une modif de `server/db/schema.ts` |
| `npm run db:migrate`  | Applique les migrations en attente sur la base de `DATABASE_URL`         |
| `npm run db:seed`     | **Vide toutes les tables** (notes comprises) puis réinsère les données de départ |

Les dates des matchs du seed sont calculées au moment du seed (« il y a 1h »…) : relance `db:seed` pour les rafraîchir.

## API

| Méthode | Route                      | Réponse                                   |
|---------|----------------------------|-------------------------------------------|
| GET     | `/api/club`                | Club + tendance du skill rating sur 30 j  |
| GET     | `/api/members`             | Joueurs actifs                            |
| GET     | `/api/matches?limit=10`    | Derniers matchs (1 à 50)                  |
| GET     | `/api/matches/:id`         | Un match et ses notes                     |
| POST    | `/api/matches/:id/notes`   | Ajoute une note (`authorName`, `body`, `motmMemberId`, `videoUrl`, `tags`) |

## Pages

`/` · `/joueurs?poste=mil&tri=ovr` · `/matchs?resultat=defaites` · `/matchs/:id` (fiche + notes) · `/stats` · `/playoffs`

## Organisation

```
api/            fonctions Vercel (mêmes fichiers en local et en prod)
server/db/      schéma Drizzle, requêtes, migrate, seed
drizzle/        migrations SQL versionnées
shared/         types et validation partagés front ↔ API
src/
  components/   layout · ui · home · players · matches · stats · playoffs
  views/        une vue par route
  api/          appels HTTP + hooks TanStack Query
  lib/          tokens, libellés, formats, hooks
  content/      contenu éditorial statique (Playoffs)
  styles/       CSS du design, importé dans l'ordre par main.tsx (responsive.css en dernier)
```

## Déploiement Vercel (étape ultérieure)

Importer le dépôt dans Vercel (preset Vite détecté), ajouter `DATABASE_URL` dans les variables d'environnement du projet, déployer. `vercel.json` renvoie toutes les URLs hors `/api` vers l'app.

## Préparation FC 27

Onglet temporaire `/fc27` : fiches joueurs et répartition des postes, plus un point d'entrée vers
**l'arène des noms** (`/fc27/nom`), un écran plein écran hors de la mise en page habituelle.
Appliquer les migrations avec `npm run db:migrate` ; la première visite initialise une campagne.

### Choix du nom du club

1. **Les idées** — chaque compte Discord peut proposer trois noms par campagne. L’auteur vient du compte connecté.
2. **Le vote** — ouvert manuellement depuis **Réglages FC 27** (au moins une proposition). Les propositions sont alors figées.
   Chaque **compte Discord** vote une seule fois ; changer de nom affiché ou se reconnecter ne permet pas de revoter.
3. **Le verdict** — clôture manuelle depuis les réglages (au moins un vote). Le nom le plus voté gagne.
   En cas d'égalité en tête, les réglages demandent de choisir le gagnant parmi les ex æquo ; le départage est mentionné dans le résultat.

Aucun tour, minuteur, quorum ni tâche planifiée. Après la clôture, l'arène affiche le gagnant et le classement final :
chaque proposition, son auteur et son nombre de votes définitif.

- La lecture reste libre ; proposer, voter, enregistrer une fiche et utiliser les commandes des réglages exigent une connexion Discord.
- Les commandes de gestion restent accessibles à tous les comptes connectés, sur la confiance ; aucun rôle administrateur n’est ajouté.
- Une fiche joueur par compte et par campagne, modifiable uniquement par son propriétaire. Le pseudo du joueur reste personnalisable à la création.
- Les compteurs de postes utilisent les postes principaux ; les alternatives sont listées séparément.
- Terminer (impossible pendant un vote ouvert) archive la campagne en lecture seule et masque l'onglet. L'arène reste consultable via `/fc27/nom?campagne=ID`.
- Recommencer archive la campagne actuelle et en crée une vide (propositions, votes et fiches).
- Toutes les actions passent par une fonction PostgreSQL verrouillée : un vote arrive avant la clôture et compte, ou après et il est refusé.
- La migration `0004` a remplacé le vote à élimination sans supprimer ses données historiques (tables `fc27_rounds` / `fc27_votes`).
- Les migrations `0009` et `0010` ajoutent les comptes sans effacer les fiches, propositions ou votes existants. Les anciens enregistrements restent sans propriétaire ; aucun compte n’est associé sur la seule base d’un pseudo identique.

### Connexion Discord

Configurer `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et `SESSION_SECRET` (au moins 32 caractères aléatoires) côté serveur, puis appliquer `npm run db:migrate`.
Dans l’application du [portail Discord](https://discord.com/developers/applications), enregistrer les URI de retour exactes :
`http://localhost:5173/api/auth/callback` en local et `https://VOTRE-DOMAINE/api/auth/callback` en production.
Le [flux OAuth2 Discord](https://docs.discord.com/developers/topics/oauth2) utilise le scope `identify`.
Le retour conserve la page FC 27 et la campagne consultées. La session signée dure 30 jours ; le bouton « Se déconnecter » est disponible dans FC 27 et dans l’arène.
Une configuration incomplète laisse la consultation disponible et affiche « Connexion indisponible ».

Vérification : `npm run test:fc27` pour les règles métier et l’authentification. Pour les parcours navigateur,
lancer `npm run test:fc27:serve`, puis exécuter successivement `npm run test:fc27:browser`,
`npm run test:auth:browser`, `npm run test:lookalikes:browser` et `npm run test:player-tour:browser`.
Ces parcours utilisent une base PGlite isolée et une réponse Discord simulée ; ils n’écrivent pas dans la base du club.

### Fiche joueur (tunnel en 2 étapes)

« Créer ma fiche » ouvre un tunnel : **1. Identité** (pseudo unique, nom et numéro de maillot 1–99, alerte immédiate si le numéro est pris),
**2. Ton joueur** (poste principal, archétype obligatoire parmi ceux de sa ligne, signature et ordre de dépense).
Le bloc facultatif **Affiner ma fiche** regroupe poste secondaire, pied fort, gabarit, étoiles et notes.

Le **Guide de création** reprend les bulles et le surlignage du guide général en huit étapes : identité,
maillot, inspiration, poste, archétype, priorités, réglages et validation. Une invitation apparaît à la première
création ; le bouton de relance reste disponible ensuite, y compris lors d’une modification.
La visite change uniquement la page affichée et ouvre les réglages utiles : elle ne modifie aucun choix et
n’enregistre rien. Terminer, passer le guide ou appuyer sur Échap ramène au formulaire de départ avec sa saisie.
Sa mémoire locale (`dommage.player-tour.v1`) est indépendante de celle du guide général. Les deux guides
partagent le même composant, avec navigation clavier, focus contenu dans la bulle et adaptation mobile.

« Tu veux ressembler à quelqu’un ? » recherche dans les 45 références de `shared/data/lookalikes.ts`
(accents et surnoms acceptés). Choisir un nom préremplit poste, archétype, taille, pied et attributs prioritaires ;
les valeurs restent modifiables et sont enregistrées dans la fiche. Le nom de l’inspiration n’est pas un champ persistant.

Si aucun résultat local n’existe, **Rechercher ce joueur** appelle `/api/fc27/lookalike?q=…`.
La recherche étendue utilise `MISTRAL_API_KEY` et éventuellement `MISTRAL_MODEL`, uniquement côté serveur,
comme le rapport du staff. Aucun appel à la frappe ni relance automatique. Les résultats sont conservés en mémoire
côté navigateur pendant 30 minutes ; aucune migration supplémentaire n’est nécessaire.

Les suggestions IA sont signalées comme approximatives. Le schéma valide le poste, l’archétype, le gabarit et
les attributs, sans garantir les faits historiques. Ce catalogue éditorial avec repli modèle n’est pas une base
exhaustive de tous les footballeurs. Sans clé, en cas de panne ou de nom inconnu, la sélection locale et la création
manuelle restent utilisables.

- Codes de poste EA FC en français : G, DC, DG, DD, MDC, MC, MOC, MG, MD, AG, AD, BU, AT. La migration `0005` a renommé les anciens codes sur place (GK → G, ST → BU…).
- Catalogue unique dans `shared/data/archetypes.ts` : 13 archétypes (4 attaquants, 4 milieux, 3 défenseurs, 2 gardiens), signatures, attributs, traits et conseils tactiques. Les postes idéaux sont indicatifs : toute la ligne reste accessible.
- La migration `0006` impose les identifiants stables (`finisher`, `target`…) et leur compatibilité par ligne. Les noms affichés peuvent évoluer sans migration ; ajouter un identifiant ou changer sa ligne nécessite `db:generate` puis `db:migrate`.
- Un changement de ligne efface le choix devenu incompatible ; un changement de poste dans la même ligne le conserve. Le serveur et PostgreSQL vérifient également cette règle.
- Plus de sélection manuelle de PlayStyles. L'ancienne colonne reste conservée pour l'historique, sans être modifiée ni exploitée par le formulaire.
- Le général de départ **65** est une constante d'affichage sur le maillot et dans le vestiaire, sans colonne en base. Les bornes SQL historiques de gabarit restent 160–200 cm et 50–100 kg.
- Les fiches créées avant la migration gardent leurs postes ; « Modifier une fiche » permet de compléter la carte.

### Rapport tactique & synergie

Calculé en direct dans l’onglet FC 27 par `shared/tacticalAdvisor.ts` (règles déterministes, aucun appel externe) :
synergie /100 (structure des lignes 40, complémentarité des profils 35, équilibre et profondeur 25),
formation et style de jeu recommandés, points d’attention et une consigne par joueur.

`shared/data/club-policy.ts` déclare le gardien et la défense tenus par l’IA. Leur absence humaine n’est
ni un manque à recruter ni une pénalité : le score redistribue ces points au milieu et à l’attaque et peut
atteindre 100 sans joueur derrière. Un gardien ou défenseur humain reste pris en compte s’il rejoint le club.
Le terrain distingue les postes tenus par l’IA des postes humains à couvrir. Le prompt du staff et sa clé
de cache intègrent cette politique pour ne pas réafficher les anciens conseils.

### Visuels FC 27

Images générées pour l’immersion « menu FIFA 20 », servies depuis `public/images` en WebP (≈ 1 Mo au total) :
13 portraits d’archétypes (`archetypes/<id>.webp`), 6 badges de familles de PlayStyles (`playstyles/`),
le motif FIFA 20 et le terrain tactique (`ui/`). Les PNG sources 1024 px et leur galerie de prévisualisation sont dans
`design/images` (non publiés). Les chemins sont déclarés dans `shared/data/archetypes.ts` ; `tests/assets.test.ts`
vérifie que chaque archétype a son portrait et son badge, et qu’aucune image ne dépasse 300 Ko.
Pour ajouter un visuel : convertir la source, par exemple
`ffmpeg -i source.png -vf scale=640:-1 -c:v libwebp -quality 78 public/images/archetypes/<id>.webp`.

### Vérifications

- `npm run build` : TypeScript et build de production.
- `npm run test:fc27` : migrations et règles métier sur PostgreSQL embarqué (PGlite), plus le moteur tactique, sans connexion à Neon.
- `npm run test:fc27:serve` : app sur `http://127.0.0.1:5174/fc27`, avec les vrais handlers HTTP et une base isolée en mémoire.
- `npm run test:fc27:browser` : parcours navigateur complet (propositions, tunnel de fiche, rapport tactique, vote, égalité, verdict, mobile, archive) sur ce serveur isolé.
  Utilise Chrome installé ; définir `CHROME_EXECUTABLE` si nécessaire.
- `npm run test:lookalikes:browser` : recherche locale/étendue, erreurs, requête obsolète, enregistrement/relecture du build et mobile 320/390 px.
  Le serveur isolé simule uniquement la réponse du fournisseur IA ; handlers, validation et PostgreSQL sont réels.
  Exécuter les deux parcours navigateur successivement : chacun réinitialise sa campagne de test.
- `npm run test:player-tour:browser` : visite complète, retour au brouillon, Échap, clavier, mémoire indépendante,
  cibles visibles sur mobile 320/390 px et vérification du guide général. Aucune fiche n’est enregistrée par ce test.

La fermeture du serveur de test supprime ses données. Les captures sont écrites dans `artifacts/` (ignoré par Git).

## Assets du configurateur Pro Clubs

Le script `scripts/generate-assets.js` contient les 21 briefs et la direction artistique commune.
Il fonctionne avec Node ≥ 20.12, sans dépendance supplémentaire. La clé est lue dans
`OPENAI_API_KEY` (environnement, puis `.env.local` / `.env` à la racine du projet).
Ne pas utiliser de préfixe `VITE_` : cette clé ne doit jamais être transmise au navigateur.

```sh
npm run assets:generate -- --dry-run  # voir les 21 prompts et chemins, sans appel API
npm run assets:generate              # générer les images manquantes
npm run test:assets                  # tests locaux simulés, sans crédits API
```

À la suite du remplacement validé de DALL·E 3, le modèle par défaut est
`gpt-image-2.5-sunburst`, qualité `max`, 1024 × 1024, PNG. Les 6 badges et
l'overlay demandent un canal alpha transparent ; les portraits et le terrain ont un fond bleu nuit.
La [documentation OpenAI](https://developers.openai.com/api/docs/models/dall-e-3)
indique que DALL·E 3 a été retiré. L'option explicite `--model=dall-e-3` conserve
les anciens paramètres `hd` / `1024x1024` pour référence, sans remplacement automatique
ni prise en charge de la transparence native dans ce mode.

Destinations :

- `public/images/archetypes/` : 13 portraits. Les fichiers gardiens se nomment
  `shot_stopper.png` et `sweeper_keeper.png` (les identifiants métier restent avec des tirets).
- `public/images/playstyles/` : 6 badges `playstyle_*.png`.
- `public/images/ui/` : `tactical_pitch.png` et `fifa20_pattern_overlay.png`.

Le script saute chaque fichier déjà présent. Il attend 7,5 secondes entre les requêtes
de génération, respecte `Retry-After` et applique un délai croissant aux réponses 429
(5 tentatives maximum). Une erreur de clé, modèle ou quota arrête la série ; un timeout
ne relance pas automatiquement une génération qui pourrait déjà avoir été facturée.
Les téléchargements sont réessayés jusqu'à 3 fois, sans relancer la génération.

Les réponses et prompts sont conservés dans `artifacts/image-generation/` (ignoré par Git).
Une interruption de téléchargement peut ainsi reprendre sans nouvel appel facturable.
Si une ancienne URL a expiré, retirer uniquement le fichier JSON correspondant autorise
une nouvelle génération payante. Les PNG sont vérifiés et publiés après écriture complète.
Un verrou empêche deux exécutions simultanées ; après un arrêt brutal, vérifier que le
processus est arrêté avant de retirer `artifacts/image-generation/generate-assets.lock`.

Cette commande produit les fichiers ; elle ne modifie pas les composants du configurateur.
