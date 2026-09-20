import type { PositionRole } from '../fc27.js';
import type { Trait } from '../fc27-player.js';

// ============================================================================
// Archétypes EA SPORTS FC 27 — Clubs
// Seul fichier à corriger si de nouvelles infos FC 27 sortent après le lancement.
// Les textes sont affichés tels quels dans le tunnel « Créer ma fiche ».
// ============================================================================

export const ARCHETYPES_SOURCE = {
  game: 'EA SPORTS FC 27 — Clubs',
  release: '2026-09-25',
  status: 'Données de lancement, à revérifier après les premiers patchs',
} as const;

export type ArchetypeLine = 'ATT' | 'MIL' | 'DEF' | 'G';

/** Ligne de chaque poste : décide quels archétypes sont proposés (4 / 4 / 3 / 2). */
export const LINE_OF_POSITION: Record<PositionRole, ArchetypeLine> = {
  AG: 'ATT', AD: 'ATT', BU: 'ATT', AT: 'ATT',
  MDC: 'MIL', MC: 'MIL', MOC: 'MIL', MG: 'MIL', MD: 'MIL',
  DC: 'DEF', DG: 'DEF', DD: 'DEF',
  G: 'G',
};

export const LINE_LABELS: Record<ArchetypeLine, { singular: string; plural: string }> = {
  ATT: { singular: 'attaquant', plural: 'attaquants' },
  MIL: { singular: 'milieu', plural: 'milieux' },
  DEF: { singular: 'défenseur', plural: 'défenseurs' },
  G: { singular: 'gardien', plural: 'gardiens' },
};

export type AttributeKey =
  | 'calme' | 'finition' | 'equilibre' | 'detente' | 'effet' | 'acceleration' | 'centres' | 'dribbles'
  | 'endurance' | 'interceptions' | 'reactivite' | 'controle' | 'precisionCoupFranc' | 'vista'
  | 'luciditeDefensive' | 'passesCourtes' | 'agressivite' | 'force' | 'passesLongues' | 'tacleDebout'
  | 'tacleGlisse' | 'vitesse' | 'placementGardien' | 'reflexes' | 'priseDeBalle' | 'plongeon';

/** Attributs mis en avant, avec une micro-explication quand le terme n'est pas évident. */
export const ATTRIBUTES: Record<AttributeKey, { label: string; hint: string | null }> = {
  calme: { label: 'Calme', hint: 'Garder précision et sang-froid sous pression, notamment face au gardien.' },
  finition: { label: 'Finition', hint: null },
  equilibre: { label: 'Équilibre', hint: 'Rester sur ses appuis dans les contacts sans perdre le ballon.' },
  detente: { label: 'Détente', hint: 'Hauteur de saut, décisive dans les duels aériens.' },
  effet: { label: 'Effet', hint: 'Brosser le ballon pour enrouler frappes, passes et centres.' },
  acceleration: { label: 'Accélération', hint: 'Vitesse prise sur les premiers mètres, avant la pointe de vitesse.' },
  centres: { label: 'Centres', hint: null },
  dribbles: { label: 'Dribbles', hint: null },
  endurance: { label: 'Endurance', hint: 'Tenir l’intensité jusqu’au bout du match sans perdre en efficacité.' },
  interceptions: { label: 'Interceptions', hint: 'Lire et couper les passes adverses.' },
  reactivite: { label: 'Réactivité', hint: 'Vitesse de réaction sur les ballons qui changent de trajectoire (rebonds, déviations).' },
  controle: { label: 'Contrôle du ballon', hint: 'Garder le ballon collé au pied pendant les courses et les feintes.' },
  precisionCoupFranc: { label: 'Précision coup franc', hint: 'Qualité de frappe sur coups francs directs.' },
  vista: { label: 'Vista', hint: 'Repérer les appels et les espaces libres avant tout le monde.' },
  luciditeDefensive: { label: 'Lucidité défensive', hint: 'Bien se placer et anticiper les actions adverses sans ballon.' },
  passesCourtes: { label: 'Passes courtes', hint: null },
  agressivite: { label: 'Agressivité', hint: 'Engagement dans les duels et intensité pour récupérer le ballon.' },
  force: { label: 'Force', hint: 'Puissance physique dans les contacts épaule contre épaule.' },
  passesLongues: { label: 'Passes longues', hint: null },
  tacleDebout: { label: 'Tacle debout', hint: 'Récupérer le ballon en restant sur ses appuis, sans aller au sol.' },
  tacleGlisse: { label: 'Tacle glissé', hint: 'Récupérer le ballon en taclant au sol, au risque de la faute.' },
  vitesse: { label: 'Vitesse', hint: 'Vitesse de pointe une fois lancé.' },
  placementGardien: { label: 'Placement gardien', hint: 'Se placer au bon endroit pour fermer l’angle de frappe.' },
  reflexes: { label: 'Réflexes', hint: 'Vitesse de réaction sur les tirs rapprochés.' },
  priseDeBalle: { label: 'Prise de balle', hint: 'Capter le ballon sans le relâcher après un arrêt.' },
  plongeon: { label: 'Plongeon', hint: 'Amplitude et vitesse des plongeons vers les poteaux.' },
};

/** Toutes les clés d'attribut, pour la validation de l'ordre de dépense. */
export const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTES) as [AttributeKey, ...AttributeKey[]];

// ---------------------------------------------------------------- Visuels

/** Familles de PlayStyles, avec leur badge (public/images/playstyles/<famille>.webp). */
export type PlayStyleFamily = 'scoring' | 'passing' | 'dribbling' | 'defending' | 'physical' | 'goalkeeper';
export const PLAYSTYLE_FAMILIES: Record<PlayStyleFamily, { label: string; badge: string }> = {
  scoring: { label: 'Tir', badge: '/images/playstyles/scoring.webp' },
  passing: { label: 'Passe', badge: '/images/playstyles/passing.webp' },
  dribbling: { label: 'Dribble', badge: '/images/playstyles/dribbling.webp' },
  defending: { label: 'Défense', badge: '/images/playstyles/defending.webp' },
  physical: { label: 'Physique', badge: '/images/playstyles/physical.webp' },
  goalkeeper: { label: 'Gardien', badge: '/images/playstyles/goalkeeper.webp' },
};

/** Portrait d'un archétype : public/images/archetypes/<id>.webp (sources PNG dans design/images). */
export const archetypeImage = (id: string) => `/images/archetypes/${id}.webp`;

export const UI_IMAGES = {
  fifaPattern: '/images/ui/fifa20-pattern.webp',
  tacticalPitch: '/images/ui/tactical-pitch.webp',
  /** Tuile « Ton joueur » : joueur mi-corps sans fond (portrait « finisher » détouré, source design/images/ui/player_cutout.png). */
  playerCutout: '/images/ui/player-cutout.webp',
} as const;

/**
 * Maîtrises : atteindre le palier avec un archétype débloque un bonus permanent
 * sur ses DEUX attributs clés à la fois, acquis sur tous les builds suivants.
 * Seul le palier niveau 10 est publié par EA (exemple officiel : Finisher → +1 Finition et +1 Calme).
 * D'autres paliers existent, EA n'en a pas publié les valeurs : ne rien afficher de chiffré pour eux.
 */
export const MASTERY = {
  firstLevel: 10,
  gain: '+1',
  note: 'Atteins le niveau 10 avec un archétype et ses deux attributs clés montent de +1 — sur tous tes builds, définitivement.',
  tip: 'Tu peux donc monter un archétype que tu ne joues pas, juste pour empocher son bonus.',
  later: 'EA annonce d’autres paliers au-delà du niveau 10, sans en publier les valeurs.',
  source: 'Pitch Notes EA « The Grounds & Clubs Deep Dive ».',
} as const;

export interface MasteryBonus { attribute: AttributeKey; gain: string }

/** Étoiles du mauvais pied et des gestes techniques, de 1 à 5. */
type StarValue = 1 | 2 | 3 | 4 | 5;
export interface ArchetypeDefaults { heightCm: number; weightKg: number; weakFootStars: StarValue; skillMovesStars: StarValue }

export interface Archetype {
  /** Valeur stockée en base : ne jamais renommer un id existant. */
  id: string;
  /** Nom EA, affiché tel quel. */
  name: string;
  line: ArchetypeLine;
  inspiredBy: string | null;
  isNew?: true;
  specialty: string;
  signature: {
    /** Famille du PlayStyle signature : choisit le badge affiché (public/images/playstyles). */
    family: PlayStyleFamily;
    playStyles: { fr: string; en: string }[];
    /** « Bruiser ou Tacle glissé » : l'un ou l'autre, et non les deux à la fois. */
    alternative?: true;
    inMatch: string;
  };
/**
   * Les deux attributs clés de l'archétype. Ils servent deux fois :
   * ils coûtent moins cher à monter (remise FC 27), et ce sont eux que la Maîtrise niveau 10 augmente.
   */
  keyAttributes: [AttributeKey, AttributeKey];
  /** Valeurs de départ du bloc « Affiner ma fiche » quand on choisit cet archétype. Le joueur reste libre de les changer. */
  defaults: ArchetypeDefaults;
  /**
   * Attributs à financer après les deux attributs clés, du plus utile au moins utile.
   * Conseil éditorial tiré de la spécialité de l'archétype : aucun coût ni plafond du jeu n'est connu avant la sortie.
   */
  spendNext: AttributeKey[];
  /** Aide à la lecture : postes où l'archétype s'exprime le mieux. Ne restreint rien. */
  idealPositions: PositionRole[];
  /** Lu par le moteur tactique (synergie, manques, conseils). */
  tacticalTraits: Trait[];
  tacticalAdvice: string;
}

export const ARCHETYPES: Archetype[] = [
  // ---------------------------------------------------------------- Attaquants
  {
    id: 'finisher', name: 'Finisher', line: 'ATT', inspiredBy: 'Mbappé',
    specialty: 'Instinct de tueur dans la surface, duel face au gardien.',
    signature: {
      family: 'scoring',
      playStyles: [{ fr: 'Tir à ras de terre', en: 'Low Driven Shot' }],
      inMatch: 'Tes frappes rasantes partent vite et fort : parfait pour tromper le gardien au sol quand tu te présentes face à lui.',
    },
    keyAttributes: ['calme', 'finition'],
    defaults: { heightCm: 175, weightKg: 61, weakFootStars: 4, skillMovesStars: 4 },
    spendNext: ['acceleration', 'vitesse', 'dribbles'],
    idealPositions: ['BU', 'AT'],
    tacticalTraits: ['finisher', 'pace', 'runner'],
    tacticalAdvice: 'Attaque la profondeur au bon moment et prépare ton contrôle pour finir face au gardien.',
  },
  {
    id: 'target', name: 'Target', line: 'ATT', inspiredBy: 'Haaland',
    specialty: 'Jeu dos au but, conservation du ballon, impact aérien.',
    signature: {
      family: 'scoring',
      playStyles: [{ fr: 'Tête puissante', en: 'Precision Header' }],
      inMatch: 'Tes têtes sont plus précises et plus appuyées : chaque centre dans la surface devient une vraie occasion.',
    },
    keyAttributes: ['equilibre', 'detente'],
    defaults: { heightCm: 186, weightKg: 78, weakFootStars: 3, skillMovesStars: 3 },
    spendNext: ['force', 'finition', 'agressivite'],
    idealPositions: ['BU'],
    tacticalTraits: ['aerial', 'holdUp', 'finisher'],
    tacticalAdvice: 'Sers de point d’appui, garde le ballon dos au but et remise pour les milieux.',
  },
  {
    id: 'magician', name: 'Magician', line: 'ATT', inspiredBy: 'Messi',
    specialty: 'Contrôle d’élite, élimination en petits espaces, vista.',
    signature: {
      family: 'dribbling',
      playStyles: [{ fr: 'Technique', en: 'First Touch / Technical' }],
      inMatch: 'Ton premier contrôle et tes dribbles serrés restent collés au pied : tu élimines dans les petits espaces sans perdre le ballon.',
    },
    keyAttributes: ['effet', 'acceleration'],
    defaults: { heightCm: 171, weightKg: 55, weakFootStars: 4, skillMovesStars: 5 },
    spendNext: ['controle', 'dribbles', 'vista'],
    idealPositions: ['AT', 'AD', 'AG'],
    tacticalTraits: ['dribble', 'creator'],
    tacticalAdvice: 'Décroche entre les lignes, attire un défenseur puis combine dans les petits espaces.',
  },
  {
    id: 'spark', name: 'Spark', line: 'ATT', inspiredBy: 'Vinícius Jr.',
    specialty: 'Accélérations explosives, percussion sur la ligne, centres en retrait.',
    signature: {
      family: 'dribbling',
      playStyles: [{ fr: 'Technicien', en: 'Trickster' }],
      inMatch: 'Tes gestes techniques sont plus vifs et plus imprévisibles : idéal pour déborder ton défenseur et centrer en retrait.',
    },
    keyAttributes: ['centres', 'dribbles'],
    defaults: { heightCm: 171, weightKg: 55, weakFootStars: 3, skillMovesStars: 5 },
    spendNext: ['acceleration', 'vitesse', 'effet'],
    idealPositions: ['AG', 'AD'],
    tacticalTraits: ['pace', 'dribble', 'width', 'crossing'],
    tacticalAdvice: 'Provoque en un-contre-un, déborde et cherche un partenaire en retrait.',
  },

  // ---------------------------------------------------------------- Milieux
  {
    id: 'disruptor', name: 'Disruptor', line: 'MIL', inspiredBy: 'Roy Keane', isNew: true,
    specialty: 'Sentinelle agressive, harcèlement du porteur, coupure des contre-attaques.',
    signature: {
      family: 'defending',
      playStyles: [{ fr: 'Interception', en: 'Intercept' }, { fr: 'Contenir', en: 'Jockey' }],
      inMatch: 'Tu lis les passes adverses et tu temporises sans te faire éliminer : les contre-attaques s’arrêtent sur toi.',
    },
    keyAttributes: ['endurance', 'interceptions'],
    defaults: { heightCm: 184, weightKg: 75, weakFootStars: 3, skillMovesStars: 2 },
    spendNext: ['luciditeDefensive', 'tacleDebout', 'agressivite'],
    idealPositions: ['MDC', 'MC'],
    tacticalTraits: ['ballWinner', 'pressing', 'anchor', 'defensive'],
    tacticalAdvice: 'Protège l’axe et coupe les contre-attaques sans abandonner la couverture des défenseurs.',
  },
  {
    id: 'maestro', name: 'Maestro', line: 'MIL', inspiredBy: 'Pirlo / Modrić',
    specialty: 'Régulateur du tempo bas, distribution longue et courte.',
    signature: {
      family: 'passing',
      playStyles: [{ fr: 'Passe appuyée', en: 'Pinged Pass' }],
      inMatch: 'Tes passes tendues filent plus vite et plus droit : tu changes le rythme et trouves tes partenaires loin devant.',
    },
    keyAttributes: ['reactivite', 'controle'],
    defaults: { heightCm: 178, weightKg: 71, weakFootStars: 4, skillMovesStars: 3 },
    spendNext: ['passesCourtes', 'passesLongues', 'vista'],
    idealPositions: ['MDC', 'MC'],
    tacticalTraits: ['buildUp', 'longPass', 'creator'],
    tacticalAdvice: 'Donne le tempo, propose une solution à la relance et trouve les appels en profondeur.',
  },
  {
    id: 'creator', name: 'Creator', line: 'MIL', inspiredBy: 'De Bruyne',
    specialty: 'Passes chirurgicales cassant les lignes défensives.',
    signature: {
      family: 'passing',
      playStyles: [{ fr: 'Passe incisive', en: 'Incisive Pass / Whipped Pass' }],
      inMatch: 'Tes passes en profondeur et tes centres travaillés sont plus précis : tu mets tes attaquants seuls face au but.',
    },
    keyAttributes: ['precisionCoupFranc', 'vista'],
    defaults: { heightCm: 174, weightKg: 66, weakFootStars: 4, skillMovesStars: 3 },
    spendNext: ['passesCourtes', 'controle', 'finition'],
    idealPositions: ['MOC', 'MC'],
    tacticalTraits: ['creator'],
    tacticalAdvice: 'Reçois entre les lignes et libère vite le ballon vers les attaquants qui se démarquent.',
  },
  {
    id: 'recycler', name: 'Recycler', line: 'MIL', inspiredBy: null,
    specialty: 'Récupération sobre, relance immédiate sans prise de risque.',
    signature: {
      family: 'defending',
      playStyles: [{ fr: 'Anticipation / Interception', en: 'Intercept' }],
      inMatch: 'Tu coupes les trajectoires avant l’adversaire et tu relances aussitôt proprement : l’équipe récupère sans se désorganiser.',
    },
    keyAttributes: ['luciditeDefensive', 'passesCourtes'],
    defaults: { heightCm: 178, weightKg: 71, weakFootStars: 3, skillMovesStars: 2 },
    spendNext: ['interceptions', 'endurance', 'tacleDebout'],
    idealPositions: ['MDC', 'MC'],
    tacticalTraits: ['ballWinner', 'buildUp', 'defensive'],
    tacticalAdvice: 'Ferme les lignes de passe puis relance simplement pour conserver le ballon récupéré.',
  },

  // ---------------------------------------------------------------- Défenseurs
  {
    id: 'boss', name: 'Boss', line: 'DEF', inspiredBy: 'Van Dijk',
    specialty: 'Domination physique dans le duel, présence axiale.',
    signature: {
      family: 'physical',
      playStyles: [{ fr: 'Bruiser (Impact physique)', en: 'Bruiser' }, { fr: 'Tacle glissé', en: 'Slide Tackle' }],
      alternative: true,
      inMatch: 'Tu gagnes les duels épaule contre épaule et tes interventions récupèrent le ballon proprement : l’axe t’appartient.',
    },
    keyAttributes: ['agressivite', 'force'],
    defaults: { heightCm: 188, weightKg: 81, weakFootStars: 2, skillMovesStars: 2 },
    spendNext: ['luciditeDefensive', 'tacleDebout', 'detente'],
    idealPositions: ['DC'],
    tacticalTraits: ['aerial', 'ballWinner', 'defensive'],
    tacticalAdvice: 'Tiens l’axe, impose-toi dans les duels et coordonne la couverture avec ton partenaire.',
  },
  {
    id: 'progressor', name: 'Progressor', line: 'DEF', inspiredBy: null,
    specialty: 'Central qui monte balle au pied, amorce le jeu par transversales.',
    signature: {
      family: 'passing',
      playStyles: [{ fr: 'Longue passe', en: 'Long Ball Pass' }],
      inMatch: 'Tes transversales et tes longs ballons sont plus précis : tu lances l’attaque directement depuis la défense.',
    },
    keyAttributes: ['passesLongues', 'tacleDebout'],
    defaults: { heightCm: 188, weightKg: 81, weakFootStars: 4, skillMovesStars: 2 },
    spendNext: ['luciditeDefensive', 'controle', 'force'],
    idealPositions: ['DC'],
    tacticalTraits: ['buildUp', 'longPass', 'defensive'],
    tacticalAdvice: 'Amorce la relance et cherche une transversale quand le couloir opposé se libère.',
  },
  {
    id: 'marauder', name: 'Marauder', line: 'DEF', inspiredBy: null,
    specialty: 'Latéral/piston ultra-rapide, monte et redescend en couverture.',
    signature: {
      family: 'physical',
      playStyles: [{ fr: 'Foulée rapide', en: 'Quick Step' }],
      inMatch: 'Tu démarres plus vite sur tes premiers mètres : tu montes dans le couloir et tu reviens à temps pour couvrir.',
    },
    keyAttributes: ['tacleGlisse', 'vitesse'],
    defaults: { heightCm: 177, weightKg: 68, weakFootStars: 3, skillMovesStars: 3 },
    spendNext: ['acceleration', 'endurance', 'centres'],
    idealPositions: ['DG', 'DD'],
    tacticalTraits: ['pace', 'width', 'runner', 'defensive'],
    tacticalAdvice: 'Accompagne les attaques dans le couloir puis replie-toi dès la perte du ballon.',
  },

  // ---------------------------------------------------------------- Gardiens
  {
    id: 'shot-stopper', name: 'Shot Stopper', line: 'G', inspiredBy: null,
    specialty: 'Réflexes purs, arrêts décisifs sur frappes rapprochées.',
    signature: {
      family: 'goalkeeper',
      playStyles: [{ fr: 'Envergure', en: 'Far Reach' }],
      inMatch: 'Tes plongeons couvrent plus de surface : tu sors des frappes près des poteaux qu’un gardien classique laisserait passer.',
    },
    keyAttributes: ['placementGardien', 'reflexes'],
    defaults: { heightCm: 194, weightKg: 85, weakFootStars: 3, skillMovesStars: 1 },
    spendNext: ['plongeon', 'priseDeBalle'],
    idealPositions: ['G'],
    tacticalTraits: ['shotStopper'],
    tacticalAdvice: 'Ferme les angles, reste sur tes appuis et commande ta défense sur les centres.',
  },
  {
    id: 'sweeper-keeper', name: 'Sweeper Keeper', line: 'G', inspiredBy: null,
    specialty: 'Jeu au pied, sorties hors surface pour couvrir la profondeur.',
    signature: {
      family: 'goalkeeper',
      playStyles: [{ fr: 'Jeu au pied', en: 'Footwork' }],
      inMatch: 'Tu sors de ta surface balle au pied avec aisance et tu relances proprement : ta défense peut jouer plus haut.',
    },
    keyAttributes: ['priseDeBalle', 'plongeon'],
    defaults: { heightCm: 194, weightKg: 85, weakFootStars: 4, skillMovesStars: 2 },
    spendNext: ['placementGardien', 'reflexes'],
    idealPositions: ['G'],
    tacticalTraits: ['sweeper', 'buildUp'],
    tacticalAdvice: 'Joue haut derrière ta défense et sers de premier relanceur.',
  },
];

export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id) as [string, ...string[]];

export const archetypeById = (id: string | null | undefined) => ARCHETYPES.find((a) => a.id === id);

export const archetypesForPosition = (position: PositionRole) =>
  ARCHETYPES.filter((a) => a.line === LINE_OF_POSITION[position]);

/** Attributs propres au poste de gardien : jamais proposés à un joueur de champ, et inversement. */
export const GK_ATTRIBUTES: AttributeKey[] = ['placementGardien', 'reflexes', 'priseDeBalle', 'plongeon'];

/** Attributs proposables dans l'ordre de dépense, selon la ligne du poste. */
export function attributesForLine(line: ArchetypeLine): AttributeKey[] {
  const isGk = (key: AttributeKey) => GK_ATTRIBUTES.includes(key);
  if (line !== 'G') return ATTRIBUTE_KEYS.filter((key) => !isGk(key));
  const alsoUseful: AttributeKey[] = ['reactivite', 'detente', 'passesLongues', 'passesCourtes', 'calme', 'force'];
  return ATTRIBUTE_KEYS.filter((key) => isGk(key) || alsoUseful.includes(key));
}

/** Nombre maximum d'attributs retenus dans l'ordre de dépense (contrainte SQL 0007). */
export const MAX_PRIORITIES = 5;

/**
 * Ordre de dépense conseillé : les deux attributs clés d'abord — ils coûtent moins cher
 * et c'est eux que la Maîtrise récompense — puis la suite propre à l'archétype.
 */
export function defaultPriorities(archetype: Archetype): AttributeKey[] {
  return [...archetype.keyAttributes, ...archetype.spendNext].slice(0, MAX_PRIORITIES);
}

/** Ordre stocké en base, nettoyé des clés inconnues, complété par le conseil si la fiche est incomplète. */
export function resolvePriorities(archetype: Archetype | undefined, stored: readonly string[] | null | undefined): AttributeKey[] {
  if (!archetype) return [];
  const known = (stored ?? []).filter((key): key is AttributeKey => key in ATTRIBUTES);
  const unique = [...new Set(known)].slice(0, MAX_PRIORITIES);
  if (unique.length > 0) return unique;
  return defaultPriorities(archetype);
}

/** Les deux bonus permanents débloqués ensemble au palier `MASTERY.firstLevel`. */
export function masteryBonuses(archetype: Archetype): MasteryBonus[] {
  return archetype.keyAttributes.map((attribute) => ({ attribute, gain: MASTERY.gain }));
}

/** « Tir à ras de terre (Low Driven Shot) », « Interception / Contenir (Intercept / Jockey) »… */
export function formatSignature(archetype: Archetype) {
  const { playStyles, alternative } = archetype.signature;
  const joiner = alternative ? ' ou ' : ' / ';
  return {
    fr: playStyles.map((p) => p.fr).join(joiner),
    en: playStyles.map((p) => p.en).join(joiner),
  };
}

// ---------------------------------------------------------------- Morphologie

/** Bornes génériques (pas de fourchettes officielles par archétype) et tendance purement qualitative. */
export const MORPHOLOGY = {
  heightCm: { min: 165, max: 200 },
  weightKg: { min: 50, max: 100 },
  tendencies: {
    vive: 'Tendance vive : meilleure accélération et agilité, moins dominant physiquement.',
    equilibre: 'Profil équilibré entre vivacité et impact physique.',
    physique: 'Tendance physique : plus fort dans les duels et dans les airs, moins vif dans les changements de direction.',
  },
  note: 'Tendances indicatives de gabarit, sans bonus chiffré. Le comportement exact et les profils AcceleRATE seront à confirmer en jeu.',
} as const;

/** Tiers bas de la fourchette : vive ; tiers haut : physique ; entre les deux : équilibré. */
export function morphologyTendency(value: number, range: { min: number; max: number }) {
  const position = (value - range.min) / (range.max - range.min);
  if (position <= 1 / 3) return MORPHOLOGY.tendencies.vive;
  if (position >= 2 / 3) return MORPHOLOGY.tendencies.physique;
  return MORPHOLOGY.tendencies.equilibre;
}

// ---------------------------------------------------------------- Général

/** Général de départ affiché sur la fiche. Ne dépend ni du gabarit ni de l'archétype. */
export const BASE_OVR = 65;
