// ============================================================================
// EA SPORTS FC 27 — Clubs : ce qui change par rapport à FC 26.
// Affiché dans le tunnel « Créer ma fiche » pour briefer le joueur avant ses choix.
//
// `confirmed: true`  → publié par EA (Pitch Notes « The Grounds & Clubs Deep Dive »).
// `confirmed: false` → rapporté par la communauté avant la sortie, à revérifier en jeu.
// Ne jamais faire passer une rumeur pour une donnée officielle : le drapeau est affiché.
// ============================================================================

export const CLUBS_SOURCE = {
  official: 'Pitch Notes EA — « The Grounds & Clubs Deep Dive »',
  officialUrl: 'https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-the-grounds-deep-dive',
  checked: '2026-09-19',
  release: '2026-09-25',
  caveat: 'Relevé avant la sortie du 25 septembre 2026 : à revérifier dès les premiers matchs.',
} as const;

export interface ClubsChange {
  id: string;
  title: string;
  /** L'état de la même mécanique en FC 26. */
  before: string;
  /** Ce que ça devient en FC 27. */
  after: string;
  /** Ce que le joueur doit en faire concrètement au moment de préparer son joueur. */
  soWhat: string;
  confirmed: boolean;
}

export const FC27_CHANGES: ClubsChange[] = [
  {
    id: 'unlocked',
    title: 'Les 13 archétypes sont ouverts dès le départ',
    before: 'Il fallait débloquer les archétypes un par un avant de pouvoir les jouer.',
    after: 'Les 13 sont disponibles immédiatement, sans condition.',
    soWhat: 'Tu peux choisir l’archétype qui te plaît vraiment, pas celui que tu as réussi à débloquer.',
    confirmed: true,
  },
  {
    id: 'resets',
    title: 'Les remises à zéro sont gratuites',
    before: 'Un reset coûtait des Coins ou un consommable, et remettait tout le build à plat d’un coup.',
    after: 'Le reset est gratuit, et tu peux réajuster un attribut à la fois au lieu de tout refaire.',
    soWhat: 'Se tromper ne coûte plus rien : ta fiche ici est un point de départ, pas un engagement.',
    confirmed: true,
  },
  {
    id: 'disruptor',
    title: 'Un nouvel archétype : Disruptor',
    before: '12 archétypes, sans vrai milieu destructeur dédié.',
    after: 'Le Disruptor rejoint la liste : sentinelle agressive inspirée de Roy Keane.',
    soWhat: 'C’est le seul archétype que personne n’a encore rodé. Bon pari si tu joues devant la défense.',
    confirmed: true,
  },
  {
    id: 'masteries',
    title: 'Les Maîtrises : des bonus qui restent',
    before: 'Monter un archétype ne servait qu’à cet archétype.',
    after: 'Atteindre le niveau 10 avec un archétype débloque +1 sur ses deux attributs clés, sur tous tes builds, définitivement.',
    soWhat: 'Tu peux monter un archétype que tu ne joues pas, juste pour empocher son bonus.',
    confirmed: true,
  },
  {
    id: 'amps',
    title: 'Les Amps : des boosts temporaires',
    before: 'Aucun équivalent.',
    after: 'Jusqu’à 3 Amps équipés en même temps : bonus d’attributs, PlayStyles, PlayStyles+ ou perks sur l’archétype actif.',
    soWhat: 'Ça se règle en jeu, pas ici. Retiens juste que ton build n’est pas figé une fois posé.',
    confirmed: true,
  },
  {
    id: 'discount',
    title: 'Les attributs clés de ton archétype coûtent moins cher',
    before: 'Tous les attributs coûtaient le même prix, quel que soit le rôle.',
    after: 'Chaque archétype applique une remise sur ses attributs clés, et fixe les plafonds ainsi que la fourchette taille / poids.',
    soWhat: 'Monte d’abord les attributs clés de ton archétype : c’est là que chaque point rapporte le plus.',
    confirmed: true,
  },
  {
    id: 'cap',
    title: 'Plafond de niveau 40 au lancement',
    before: 'Progression étalée jusqu’au niveau 100, budget de points large.',
    after: 'Le cap démarre à 40, avec un budget de points nettement plus serré.',
    soWhat: 'Impossible de tout monter : il faut choisir 3 ou 4 attributs et les assumer.',
    confirmed: false,
  },
];

export const CONFIRMED_CHANGES = FC27_CHANGES.filter((change) => change.confirmed);
