# Spécification Fonctionnelle & Technique — Paris & Votes des sessions Clubs Pro (Vestiaire Bets)

> **Document de cadrage et d'architecture pour Dommage FC Dashboard**
> *Destiné à l'équipe, à Claude Code et à Codex pour implémentation.*
> **Version 2 — 2026-09-22.** Intègre les décisions de l'admin (saucegod.) et l'alignement sur le code existant.

---

## 0. Décisions validées (v2)

| Sujet | Décision |
| :--- | :--- |
| Économie | **Cagnottes individuelles** (chaque joueur a son solde DC) et **cotes fixes**, figées au moment de la mise. |
| Anti-triche | **Interdit de voter pour soi**, sur tous les votes. |
| Fin de match | Le vote Crack / Casserole reste ouvert **jusqu'à ce que l'admin le ferme** à la fin du match. La fermeture règle les paris du match. |
| Fin de session | Un vote unique **« Héros de la session »** s'ouvre quand l'admin termine la session, pendant **10 minutes**, puis se ferme tout seul. |
| Admin | Les comptes listés dans `DISCORD_ADMIN_IDS` (aujourd'hui : saucegod.). |
| Lancement | Tout est construit derrière un **interrupteur à trois positions** (`off` → `admins` → `on`), stocké en base. |

---

## 1. Vision & Contraintes Majeures

### 1.1. La Contrainte Fondamentale : Zéro Liaison Temps Réel avec EA Sports FC
- EA Sports FC Clubs ne propose aucune API de télémétrie en direct ni de webhook de match.
- **Le système repose à 100 % sur des actions asynchrones d'avant-match et de consensus d'après-match.**
- **Temps d'attention du joueur** : 5 à 10 secondes (lobby EA, chargement). Tout se joue en **1 ou 2 taps**.

### 1.2. L'Objectif Vestiaire
Créer une émulation de groupe et du chambrage amical autour de chaque match : paris pré-match rapides, votes de débriefing au coup de sifflet final, et un héros élu à la fin de la soirée.

### 1.3. Le déroulé d'une soirée
```
SESSION OUVERTE (admin)  ── présents cochés ➔ +50 DC chacun
   │
   ├─ MATCH 1 annoncé ➔ paris OUVERTS
   │     coup d'envoi ➔ paris VERROUILLÉS (admin, ou automatique à l'annonce du match suivant)
   │     fin du match ➔ score saisi, vote Crack / Casserole OUVERT
   │     admin ferme le vote ➔ RÈGLEMENT des paris du match
   │
   ├─ MATCH 2 … (même cycle)
   │
SESSION TERMINÉE (admin) ➔ vote « Héros de la session » ⏱ 10 min ➔ fermeture automatique
```

---

## 2. Typologie & Mécanique des Paris

### A. Les Paris d'Avant-Match
*Ouverts dès l'annonce du match. Verrouillés au coup d'envoi. Une mise par joueur et par pari.*

| Pari | Question | Options | Résolution |
| :--- | :--- | :--- | :--- |
| **Le Crack du Match** | *« Qui va rouler sur le match ? »* | Un joueur parmi les **présents de la session**. Cotes calculées sur les stats (§3.3). | **Vote Crack post-match** (seule source). |
| **La Casserole du Match** | *« Qui va tenter la roulette de trop ? »* | Un joueur parmi les présents. Cotes inversées. | **Vote Casserole post-match.** |
| **Le Mur** | *« Clean sheet ce match ? »* | OUI 2.20 / NON 1.35 | Score saisi : `goalsAgainst === 0`. |
| **Le Scénario Offensif** | *« Combien de buts pour Dommage ? »* | 0-1 (2.10) / 2-3 (1.90) / 4+ (3.40) | Score saisi : `goalsFor`. |
| **Le Verdict** | *« Résultat du match ? »* | Victoire 1.70 / Nul 3.60 / Défaite 2.60 | Score saisi. *(Ajouté en v2 : nécessaire au titre « Le Soldat ».)* |
| **Rage-quit adverse** | *« L'adversaire quitte avant la fin ? »* | OUI 2.80 / NON 1.25 | Case cochée par l'admin à la clôture. |
| **Carton rouge** | *« Un joueur du club prend un rouge ? »* | OUI 4.00 / NON 1.15 | Case cochée par l'admin à la clôture. |

Sur mobile, on affiche en priorité **Crack, Casserole et Mur**. Les autres paris sont dans un volet « Plus de paris ».

### B. Les Votes d'Après-Match
1. **Le Crack du Match (Ballon d'Or Dommage)** : chaque présent vote pour le coéquipier le plus décisif.
2. **La Casserole d'Or** : vote bon enfant pour la bévue la plus mémorable.
3. **Règles communes** :
   - **Interdit de voter pour soi.** Le bouton de son propre joueur est désactivé, et le serveur refuse de toute façon.
   - Seuls les comptes Discord **liés à un joueur du club** (demande de profil validée) votent et parient.
   - Un vote par personne et par catégorie. On peut le changer tant que le vote est ouvert.
   - Barres de répartition en direct.
4. **Fermeture** : **l'admin ferme le vote** à la fin du match, en un clic, quand il veut, même si tout le monde n'a pas voté.
5. **Égalité** : l'admin tranche parmi les ex æquo au moment de la fermeture. Aucun tirage au sort.
6. **Aucun vote** : les paris Crack et Casserole du match sont **remboursés**.

### C. Le Héros de la Session
- Quand l'admin termine la session, un vote unique s'ouvre : *« Qui a porté l'équipe ce soir ? »*.
- **10 minutes**, puis fermeture automatique. Pas de tâche planifiée : l'échéance est une date en base, et le premier appel reçu après cette date clôt le vote.
- Même règle anti-vote pour soi. En cas d'égalité, plusieurs héros sont désignés.
- **Aucun pari n'est lié à ce vote** : c'est un titre honorifique, conservé dans l'historique du joueur.

---

## 3. L'Économie des « Dommage Coins » (DC)

> [!IMPORTANT]
> **Aucun argent réel**. Les DC sont une monnaie virtuelle et honorifique propre à l'application. Aucun achat, aucun retrait, aucune conversion possible.

### 3.1. Règles d'Attribution
- **Cagnotte initiale** : `500 DC` quand le compte Discord est lié à un joueur du club (demande de profil validée).
- **Bonus de présence** : `+50 DC` par session où le joueur est coché présent par l'admin.
- **Mises** : `[25]` · `[50]` · `[100]` · `[MAX]`. La mise par défaut est de 50 DC.
- **Gain** : `floor(mise × cote)`. La cote est **figée au moment de la mise**, même si les cotes du pari changent ensuite.
- **Prêt de la Honte** : à 0 DC, le joueur peut demander `+100 DC` une fois par 24 h. Son profil porte le badge **« En Faillite 📉 »** pendant 24 h.

### 3.2. Titres (Hall of Fame)
Recalculés après chaque session, **à partir de 10 paris réglés** pour éviter les titres attribués sur deux paris :
- 🔮 **L'Oracle** : meilleur taux de réussite (> 65 %).
- 🎰 **Le Déglingo** : le plus de paris gagnés à cote > 3.50.
- 🐈‍⬛ **Le Chat Noir** : plus longue série de paris perdus.
- 🛡️ **Le Soldat** : a misé « Victoire » sur chaque match joué de la session.
- 👑 **Le Boss du Vestiaire** : plus gros solde.
- 🦸 **Héros** : compteur des titres « Héros de la session ».

### 3.3. Calcul des cotes Crack / Casserole
Calculées **une fois, à l'annonce du match**, sur les présents :
- Poids d'un joueur : `(note moyenne − 5)²`, avec une note par défaut de 6,5 si elle manque.
- Probabilité = poids / somme des poids ; cote = `1 / (probabilité × 1,10)`. Le 1,10 est une marge qui limite l'inflation de DC.
- Bornée entre **1.20 et 8.00**, arrondie à 0.05.
- Casserole : même calcul avec les poids inversés.

---

## 4. Expérience Utilisateur & Direction Artistique (FIFA 20 FUT Companion)

### 4.1. Principes Graphiques
- **Palette** : Nuit Abysse `#060C1F`, Marine Profond `#0B1A3A`, Bleu Glacier `#6FC8FF`, Bleu Dommage `#1846F5`, **Or / Ambre `#FFB547`** pour les cotes et les pièces, **Rouge `#FF4D5E`** pour la Casserole.
- **Typographie** : `Barlow Condensed` 800 italique pour les titres et les cotes (chiffres tabulaires), `Barlow` pour le texte.
- **Formes** : cartes biseautées (`clip-path`), cotes en jetons ambre cliquables, barres de répartition des votes animées.

### 4.2. Parcours Mobile
1. **Tuile sur `/fc27`** (section « Nom », la première) : *« Vestiaire Bets »*. Grisée et non cliquable tant que l'interrupteur est sur `off`.
2. **Écran `/paris`** :
   - En haut : solde `🪙 500 DC` et adversaire du match en cours.
   - Centre : cartes Crack, Casserole, Mur, puis « Plus de paris ».
   - Tap sur une cote ➔ jeton allumé, mise par défaut appliquée.
   - Barre collante au-dessus de la BottomNav : `VALIDER MES PARIS · GAIN POSSIBLE 140 DC`.
3. **Fin de match** : cartes de vote Crack / Casserole, son propre joueur grisé.
4. **Fin de session** : carte « Héros de la session » avec compte à rebours de 10 min.

---

## 5. Lancement progressif (interrupteur)

| Mode | Tuile sur /fc27 | `/paris` | API `/api/bets/*` |
| :--- | :--- | :--- | :--- |
| `off` (défaut) | Grisée « Bientôt » pour tous | Écran « Pas encore ouvert » | Seul `status` répond, le reste renvoie 404 |
| `admins` | Active pour les admins (« Aperçu capitaines »), grisée pour les autres | Accessible aux admins | Actions réservées aux admins |
| `on` | Active pour tous | Accessible | Ouverte aux comptes liés à un joueur |

- Stocké dans la table `app_settings` (clé `bets_mode`). **Changer de mode ne demande pas de redéploiement.**
- Si la table n'existe pas encore (migration non appliquée), le serveur répond `off`. En cas de doute, la fonctionnalité reste fermée.
- L'admin change le mode depuis la tuile sur `/fc27`.
- **Jour J = passer le mode sur `on`.**

---

## 6. Architecture Technique

### 6.1. Contraintes du projet à respecter
- **Vercel Hobby : 12 fonctions maximum** (`npm run build` le vérifie). Tout le module tient dans **une seule fonction** `api/bets/[action].ts`, routée comme `api/auth/[action].ts`. La place a été libérée en regroupant `api/fc27/lookalike.ts` et `api/fc27/report.ts` dans `api/fc27/[action].ts` (URL inchangées).
- **Pilote Neon HTTP : pas de transaction interactive.** Chaque opération sur l'argent tient en **une seule requête SQL** (CTE `WITH … UPDATE … INSERT`) ou en une fonction PL/pgSQL, sur le modèle de `club_profile_dispatch`.
- **Identifiants** : comptes = `club_accounts.id` (integer), joueurs = `members.id`, colonnes `GENERATED ALWAYS AS IDENTITY`, migrations SQL écrites à la main dans `drizzle/` et ajoutées au `_journal.json`.
- **Un match n'existe dans `matches` qu'une fois joué** (score obligatoire). Les paris portent donc sur une **rencontre prévue** (`bet_fixtures`), reliée au match réel ensuite (`match_id`, facultatif). Tant que la synchro EA n'existe pas, le score est saisi par l'admin à la fin du match.

### 6.2. Schéma (phase 2)
```sql
app_settings        (key PK, value jsonb, updated_at, updated_by → club_accounts)      -- phase 1, déjà écrite
bet_sessions        (id, status 'live'|'hero_vote'|'closed', started_at, ended_at,
                     hero_vote_closes_at, created_by)
bet_session_players (session_id, member_id, PK(session_id, member_id))                 -- les présents
bet_fixtures        (id, session_id, opponent_name, status 'open'|'locked'|'voting'|'settled'|'cancelled',
                     goals_for, goals_against, rage_quit bool, red_card bool, match_id → matches NULL)
bet_markets         (id, fixture_id, kind, options jsonb [{id,label,odds,memberId?}], winning_option_id)
bet_slips           (id, market_id, account_id, option_id, stake, odds numeric(4,2), payout,
                     status 'pending'|'won'|'lost'|'refunded', UNIQUE(market_id, account_id))
bet_votes           (id, fixture_id NULL, session_id NULL, category 'crack'|'flop'|'hero',
                     voter_account_id, target_member_id, UNIQUE(scope, voter, category))
dc_wallets          (account_id PK, balance integer CHECK (balance >= 0), bankrupt_until)
dc_ledger           (id, account_id, amount, reason 'welcome'|'presence'|'stake'|'payout'|'refund'|'bailout',
                     ref_id, created_at)                                                -- journal, jamais modifié
```
- **Mise atomique** : `WITH debit AS (UPDATE dc_wallets SET balance = balance - $stake WHERE account_id = $a AND balance >= $stake RETURNING …) INSERT INTO bet_slips … SELECT … FROM debit` suivi de l'écriture au journal, dans la même requête.
- **Règlement idempotent** : il ne traite que les `bet_slips` en `pending`. Le relancer ne crédite pas deux fois.
- **Anti-vote pour soi** : on retrouve le joueur du votant via `club_player_claims` (statut `approved`), et la requête refuse si `target_member_id` est le sien. C'est vérifié côté serveur, pas seulement dans l'interface.

### 6.3. Routes (`/api/bets/:action`, une seule fonction)
| Action | Méthode | Qui | Rôle |
| :--- | :--- | :--- | :--- |
| `status` | GET | tous | Mode et accès du visiteur (phase 1, déjà en place) |
| `mode` | POST | admin | Change l'interrupteur (phase 1, déjà en place) |
| `state` | GET | lié | Session en cours, paris, votes, solde |
| `place` | POST | lié | Mise |
| `vote` | POST | lié | Vote Crack / Casserole / Héros |
| `admin` | POST | admin | `open-session`, `announce`, `lock`, `result`, `close-vote` (règle les paris), `end-session`, `cancel` |

---

## 7. Plan de Découpage

### Phase 1 : Interrupteur & prototype (✅ en cours)
- `app_settings` + `GET /api/bets/status` + `POST /api/bets/mode`.
- Tuile « Vestiaire Bets » sur `/fc27`, grisée selon le mode, avec le sélecteur de mode pour l'admin.
- Vue `/paris` (`BetsView.tsx`) avec données fictives : paris, mises, barre de validation, votes, héros de la session.
- Règles pures dans `shared/bets.ts` (cotes, gains, anti-vote, dépouillement), testées, et réutilisées en phase 2.

### Phase 2 : Données réelles
- Migration du schéma §6.2, fonctions SQL de mise, de vote et de règlement.
- Écran admin de la soirée (ouvrir la session, cocher les présents, annoncer, verrouiller, saisir le score, fermer le vote, terminer la session).
- Brancher `BetsView` sur `state` à la place des données fictives.

### Phase 3 : Intégrations
- Relier une rencontre au match EA quand la synchro existera (score automatique).
- Résultats postés sur Discord. Coach IA informé des paris (`COACH_SYSTEM`).
