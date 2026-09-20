import { LINE_OF_POSITION, type AttributeKey } from './archetypes.js';
import type { Foot, PositionRole } from '../fc27.js';

// ============================================================================
// « Je veux jouer comme… » — liste curée de joueurs de référence, toutes époques.
//
// Chaque entrée relie un joueur réel à UN des 13 archétypes FC 27, à un poste et à un
// ordre de dépense. C'est une passerelle vers le tunnel de création : on choisit un nom
// qu'on connaît, et la fiche se pré-remplit.
//
// Ce qui est factuel : poste, pied, époque, gabarit (approximatif, arrondi).
// Ce qui est éditorial : l'archétype retenu et les conseils. Un joueur complet peut
// correspondre à plusieurs archétypes ; on tranche vers celui qui traduit le mieux
// ce qu'on retient de lui, et `why` explique le choix.
//
// `tests/lookalikes.test.ts` vérifie que chaque archétype appartient bien à la ligne du poste.
// ============================================================================

export interface Lookalike {
  /** Identifiant stable, jamais renommé : il peut être stocké dans une fiche. */
  id: string;
  name: string;
  /** Années de haut niveau, pour situer le joueur. */
  era: string;
  position: PositionRole;
  archetype: string;
  heightCm: number;
  foot: Foot;
  /** Ce qu'on retient de lui, en une phrase. */
  signature: string;
  /** Pourquoi cet archétype-là et pas un autre. */
  why: string;
  /** Ordre de dépense conseillé pour s'en approcher. */
  priorities: AttributeKey[];
  /** Orthographes et surnoms acceptés à la recherche. */
  aka?: string[];
}

export const LOOKALIKES: Lookalike[] = [
  // ---------------------------------------------------------------- Buteurs de surface
  {
    id: 'ronaldo-r9', name: 'Ronaldo (R9)', era: '1994-2006', position: 'BU', archetype: 'finisher',
    heightCm: 183, foot: 'Droit', aka: ['r9', 'ronaldo nazario', 'el fenomeno', 'le phénomène'],
    signature: 'Explosif sur dix mètres, imprenable en un-contre-un face au gardien.',
    why: 'Finisher plutôt que Magician : sa technique servait à se créer un tir, pas à orchestrer.',
    priorities: ['acceleration', 'finition', 'dribbles', 'calme', 'vitesse'],
  },
  {
    id: 'van-basten', name: 'Marco van Basten', era: '1985-1993', position: 'BU', archetype: 'finisher',
    heightCm: 188, foot: 'Droit', aka: ['van basten'],
    signature: 'Frappe pure sous tous les angles, élégance dans la surface.',
    why: 'Grand mais jamais un pivot : il cherchait le tir, pas le duel dos au but.',
    priorities: ['finition', 'calme', 'equilibre', 'effet', 'detente'],
  },
  {
    id: 'inzaghi', name: 'Filippo Inzaghi', era: '1995-2012', position: 'BU', archetype: 'finisher',
    heightCm: 181, foot: 'Droit', aka: ['pippo', 'inzaghi'],
    signature: 'Renard des surfaces : vivait sur le dos du dernier défenseur.',
    why: 'Tout le personnage tient dans le placement et la finition. Rien d’autre à monter.',
    priorities: ['finition', 'calme', 'acceleration', 'reactivite', 'vitesse'],
  },
  {
    id: 'mbappe', name: 'Kylian Mbappé', era: '2016-', position: 'BU', archetype: 'finisher',
    heightCm: 178, foot: 'Droit', aka: ['mbappe', 'kylian'],
    signature: 'Vitesse de pointe irrattrapable, sang-froid devant le but.',
    why: 'C’est la référence officielle de l’archétype Finisher dans FC 27.',
    priorities: ['acceleration', 'vitesse', 'finition', 'calme', 'dribbles'],
  },
  {
    id: 'aguero', name: 'Sergio Agüero', era: '2006-2021', position: 'BU', archetype: 'finisher',
    heightCm: 173, foot: 'Droit', aka: ['aguero', 'kun'],
    signature: 'Centre de gravité très bas, déclenchement immédiat dans un mouchoir de poche.',
    why: 'Petit gabarit assumé : la vivacité prime sur l’impact.',
    priorities: ['acceleration', 'finition', 'equilibre', 'dribbles', 'calme'],
  },

  // ---------------------------------------------------------------- Pivots
  {
    id: 'haaland', name: 'Erling Haaland', era: '2019-', position: 'BU', archetype: 'target',
    heightCm: 195, foot: 'Gauche', aka: ['haaland', 'erling'],
    signature: 'Force brute et attaque du premier poteau, avec une vitesse rare pour sa taille.',
    why: 'Référence officielle de l’archétype Target dans FC 27.',
    priorities: ['force', 'finition', 'detente', 'equilibre', 'acceleration'],
  },
  {
    id: 'ibrahimovic', name: 'Zlatan Ibrahimović', era: '1999-2023', position: 'BU', archetype: 'target',
    heightCm: 195, foot: 'Droit', aka: ['zlatan', 'ibrahimovic', 'ibra'],
    signature: 'Point d’appui inamovible, technique de petit gabarit dans un corps de géant.',
    why: 'Target pour le jeu dos au but et l’impact ; son adresse se retrouve dans les gestes techniques.',
    priorities: ['force', 'equilibre', 'finition', 'controle', 'detente'],
  },
  {
    id: 'drogba', name: 'Didier Drogba', era: '1998-2018', position: 'BU', archetype: 'target',
    heightCm: 188, foot: 'Droit', aka: ['drogba', 'didier'],
    signature: 'Tenait le ballon seul contre deux défenseurs et punissait sur le moindre centre.',
    why: 'Le pivot par excellence : conservation, puis finition.',
    priorities: ['force', 'equilibre', 'finition', 'detente', 'agressivite'],
  },
  {
    id: 'lewandowski', name: 'Robert Lewandowski', era: '2008-', position: 'BU', archetype: 'target',
    heightCm: 185, foot: 'Droit', aka: ['lewandowski', 'lewy'],
    signature: 'Jeu de corps irréprochable, buteur complet des deux pieds et de la tête.',
    why: 'Target pour la remise et l’aérien, même si sa finition vaut celle d’un Finisher.',
    priorities: ['finition', 'equilibre', 'detente', 'force', 'calme'],
  },

  // ---------------------------------------------------------------- Meneurs de front
  {
    id: 'messi', name: 'Lionel Messi', era: '2004-', position: 'AT', archetype: 'magician',
    heightCm: 170, foot: 'Gauche', aka: ['messi', 'leo', 'la pulga'],
    signature: 'Conduite collée au pied, accélération en trois appuis, vision de passeur.',
    why: 'Référence officielle de l’archétype Magician dans FC 27.',
    priorities: ['controle', 'dribbles', 'acceleration', 'vista', 'effet'],
  },
  {
    id: 'maradona', name: 'Diego Maradona', era: '1976-1997', position: 'AT', archetype: 'magician',
    heightCm: 165, foot: 'Gauche', aka: ['maradona', 'diego', 'el pibe'],
    signature: 'Le ballon ne le quittait pas : dribble en zone dense, équilibre insolent sous le contact.',
    why: 'Magician pour l’élimination en petits espaces ; son gabarit compte autant que sa technique.',
    priorities: ['dribbles', 'controle', 'equilibre', 'acceleration', 'effet'],
  },
  {
    id: 'bergkamp', name: 'Dennis Bergkamp', era: '1986-2006', position: 'AT', archetype: 'magician',
    heightCm: 183, foot: 'Droit', aka: ['bergkamp', 'dennis'],
    signature: 'Premier contrôle qui élimine, passe décisive dans le trou d’aiguille.',
    why: 'Magician pour le contrôle d’élite, en attaquant de soutien plutôt qu’en pointe.',
    priorities: ['controle', 'vista', 'calme', 'effet', 'passesCourtes'],
  },
  {
    id: 'ronaldinho', name: 'Ronaldinho', era: '1998-2015', position: 'AT', archetype: 'magician',
    heightCm: 182, foot: 'Droit', aka: ['ronaldinho', 'dinho', 'r10'],
    signature: 'Imprévisible, geste technique en pleine course, passe aveugle.',
    why: 'Magician : tout passait par la technique et la vista, jamais par le physique.',
    priorities: ['dribbles', 'effet', 'vista', 'controle', 'acceleration'],
  },

  // ---------------------------------------------------------------- Ailiers
  {
    id: 'vinicius', name: 'Vinícius Júnior', era: '2018-', position: 'AG', archetype: 'spark',
    heightCm: 176, foot: 'Droit', aka: ['vinicius', 'vini', 'vini jr'],
    signature: 'Débordement pur, changement de rythme sur la ligne.',
    why: 'Référence officielle de l’archétype Spark dans FC 27.',
    priorities: ['acceleration', 'dribbles', 'vitesse', 'centres', 'effet'],
  },
  {
    id: 'cr7', name: 'Cristiano Ronaldo', era: '2002-', position: 'AG', archetype: 'spark',
    heightCm: 187, foot: 'Droit', aka: ['cristiano', 'cr7', 'ronaldo cristiano'],
    signature: 'Ailier explosif devenu buteur : frappe, détente, puissance.',
    why: 'Spark pour la version ailier. Pour le Cristiano de la fin de carrière, prends Finisher en BU.',
    priorities: ['acceleration', 'finition', 'detente', 'dribbles', 'force'],
  },
  {
    id: 'robben', name: 'Arjen Robben', era: '2000-2021', position: 'AD', archetype: 'spark',
    heightCm: 180, foot: 'Gauche', aka: ['robben', 'arjen'],
    signature: 'Rentrait systématiquement sur son pied gauche, et ça marchait quand même.',
    why: 'Spark pour la percussion. Le pied gauche à droite est la moitié du personnage.',
    priorities: ['dribbles', 'acceleration', 'effet', 'finition', 'vitesse'],
  },
  {
    id: 'giggs', name: 'Ryan Giggs', era: '1990-2014', position: 'AG', archetype: 'spark',
    heightCm: 180, foot: 'Gauche', aka: ['giggs', 'ryan'],
    signature: 'Vingt ans de débordements et de centres du gauche.',
    why: 'Spark pour les centres et l’endurance dans le couloir.',
    priorities: ['centres', 'acceleration', 'dribbles', 'endurance', 'effet'],
  },
  {
    id: 'salah', name: 'Mohamed Salah', era: '2012-', position: 'AD', archetype: 'spark',
    heightCm: 175, foot: 'Gauche', aka: ['salah', 'mo salah'],
    signature: 'Repique et frappe enroulée, buteur autant qu’ailier.',
    why: 'Spark pour le profil de couloir rentrant ; monte la finition plus haut que pour un ailier pur.',
    priorities: ['acceleration', 'finition', 'dribbles', 'effet', 'vitesse'],
  },

  // ---------------------------------------------------------------- Meneurs de jeu
  {
    id: 'zidane', name: 'Zinédine Zidane', era: '1989-2006', position: 'MOC', archetype: 'maestro',
    heightCm: 185, foot: 'Droit', aka: ['zidane', 'zizou', 'zz'],
    signature: 'Intouchable balle au pied, changeait le rythme d’un match d’un contrôle.',
    why: 'Maestro plutôt que Creator : il tenait le tempo autant qu’il donnait les passes décisives.',
    priorities: ['controle', 'reactivite', 'vista', 'passesCourtes', 'equilibre'],
  },
  {
    id: 'pirlo', name: 'Andrea Pirlo', era: '1995-2017', position: 'MDC', archetype: 'maestro',
    heightCm: 177, foot: 'Droit', aka: ['pirlo', 'andrea'],
    signature: 'Organisait tout depuis la base, transversales millimétrées.',
    why: 'Référence officielle de l’archétype Maestro dans FC 27.',
    priorities: ['controle', 'passesLongues', 'vista', 'reactivite', 'precisionCoupFranc'],
  },
  {
    id: 'modric', name: 'Luka Modrić', era: '2003-', position: 'MC', archetype: 'maestro',
    heightCm: 172, foot: 'Droit', aka: ['modric', 'luka'],
    signature: 'Se sort de n’importe quelle pression d’un demi-tour, puis trouve la passe.',
    why: 'Référence officielle de l’archétype Maestro, version relayeur plutôt que sentinelle.',
    priorities: ['controle', 'reactivite', 'passesCourtes', 'endurance', 'vista'],
  },
  {
    id: 'xavi', name: 'Xavi Hernández', era: '1998-2019', position: 'MC', archetype: 'maestro',
    heightCm: 170, foot: 'Droit', aka: ['xavi'],
    signature: 'Jamais perdu un ballon, toujours orienté avant de recevoir.',
    why: 'Maestro : le tempo avant la passe spectaculaire.',
    priorities: ['passesCourtes', 'controle', 'reactivite', 'vista', 'equilibre'],
  },
  {
    id: 'iniesta', name: 'Andrés Iniesta', era: '2002-2022', position: 'MC', archetype: 'maestro',
    heightCm: 171, foot: 'Droit', aka: ['iniesta', 'andres'],
    signature: 'Se faufilait entre trois joueurs sans jamais accélérer vraiment.',
    why: 'Maestro pour le contrôle sous pression ; ses dribbles servaient à sortir, pas à éliminer.',
    priorities: ['controle', 'dribbles', 'reactivite', 'passesCourtes', 'equilibre'],
  },

  // ---------------------------------------------------------------- Passeurs décisifs
  {
    id: 'de-bruyne', name: 'Kevin De Bruyne', era: '2008-', position: 'MOC', archetype: 'creator',
    heightCm: 181, foot: 'Droit', aka: ['de bruyne', 'kdb', 'kevin'],
    signature: 'Passe tendue qui casse deux lignes, centre en première intention.',
    why: 'Référence officielle de l’archétype Creator dans FC 27.',
    priorities: ['vista', 'passesLongues', 'precisionCoupFranc', 'passesCourtes', 'effet'],
  },
  {
    id: 'ozil', name: 'Mesut Özil', era: '2006-2023', position: 'MOC', archetype: 'creator',
    heightCm: 180, foot: 'Gauche', aka: ['ozil', 'özil', 'mesut'],
    signature: 'Voyait la passe avant tout le monde, dernier geste toujours juste.',
    why: 'Creator pur : la vista prime sur tout le reste.',
    priorities: ['vista', 'passesCourtes', 'controle', 'effet', 'calme'],
  },
  {
    id: 'platini', name: 'Michel Platini', era: '1972-1987', position: 'MOC', archetype: 'creator',
    heightCm: 179, foot: 'Droit', aka: ['platini', 'michel'],
    signature: 'Milieu buteur, spécialiste des coups francs.',
    why: 'Creator pour la précision sur coup franc, qui est un des deux attributs clés.',
    priorities: ['precisionCoupFranc', 'vista', 'finition', 'passesCourtes', 'calme'],
  },
  {
    id: 'riquelme', name: 'Juan Román Riquelme', era: '1996-2014', position: 'MOC', archetype: 'creator',
    heightCm: 182, foot: 'Droit', aka: ['riquelme', 'roman'],
    signature: 'Ralentissait le jeu jusqu’à ce que la passe apparaisse.',
    why: 'Creator : aucun physique, aucune vitesse, tout dans la lecture.',
    priorities: ['vista', 'passesCourtes', 'precisionCoupFranc', 'controle', 'calme'],
  },

  // ---------------------------------------------------------------- Récupérateurs
  {
    id: 'keane', name: 'Roy Keane', era: '1990-2006', position: 'MDC', archetype: 'disruptor',
    heightCm: 178, foot: 'Droit', aka: ['keane', 'roy'],
    signature: 'Harcelait le porteur pendant quatre-vingt-dix minutes et relançait proprement.',
    why: 'Référence officielle du Disruptor, le nouvel archétype de FC 27.',
    priorities: ['endurance', 'interceptions', 'agressivite', 'tacleDebout', 'passesCourtes'],
  },
  {
    id: 'makelele', name: 'Claude Makélélé', era: '1991-2011', position: 'MDC', archetype: 'recycler',
    heightCm: 174, foot: 'Droit', aka: ['makelele', 'makélélé', 'claude'],
    signature: 'Récupérait et redonnait simple, sans jamais se mettre en avant.',
    why: 'Recycler et non Disruptor : il coupait les lignes de passe au lieu d’aller au duel.',
    priorities: ['luciditeDefensive', 'interceptions', 'passesCourtes', 'endurance', 'tacleDebout'],
  },
  {
    id: 'kante', name: 'N’Golo Kanté', era: '2012-', position: 'MDC', archetype: 'disruptor',
    heightCm: 168, foot: 'Droit', aka: ['kante', 'kanté', 'ngolo'],
    signature: 'Couvrait deux postes à lui seul, volume de course anormal.',
    why: 'Disruptor pour l’endurance et les interceptions, ses deux attributs clés.',
    priorities: ['endurance', 'interceptions', 'luciditeDefensive', 'acceleration', 'tacleDebout'],
  },
  {
    id: 'vieira', name: 'Patrick Vieira', era: '1994-2011', position: 'MDC', archetype: 'disruptor',
    heightCm: 193, foot: 'Droit', aka: ['vieira', 'patrick'],
    signature: 'Envergure et duel gagné, puis relance vers l’avant.',
    why: 'Disruptor version longue : le gabarit change tout dans les duels.',
    priorities: ['interceptions', 'force', 'endurance', 'tacleDebout', 'passesCourtes'],
  },
  {
    id: 'busquets', name: 'Sergio Busquets', era: '2008-', position: 'MDC', archetype: 'recycler',
    heightCm: 189, foot: 'Droit', aka: ['busquets', 'busi'],
    signature: 'Toujours au bon endroit, une touche de balle et le danger disparaît.',
    why: 'Recycler : lucidité défensive et passes courtes, exactement ses deux attributs clés.',
    priorities: ['luciditeDefensive', 'passesCourtes', 'reactivite', 'interceptions', 'controle'],
  },
  {
    id: 'gattuso', name: 'Gennaro Gattuso', era: '1995-2013', position: 'MDC', archetype: 'disruptor',
    heightCm: 177, foot: 'Droit', aka: ['gattuso', 'rino'],
    signature: 'Agressivité permanente, jamais un ballon abandonné.',
    why: 'Disruptor : le harcèlement est tout le personnage.',
    priorities: ['agressivite', 'endurance', 'interceptions', 'tacleDebout', 'force'],
  },

  // ---------------------------------------------------------------- Milieux de couloir
  {
    id: 'beckham', name: 'David Beckham', era: '1992-2013', position: 'MD', archetype: 'creator',
    heightCm: 183, foot: 'Droit', aka: ['beckham', 'becks'],
    signature: 'Le centre et le coup franc les plus purs de sa génération.',
    why: 'Creator depuis le couloir droit : la précision de frappe arrêtée est son attribut clé.',
    priorities: ['precisionCoupFranc', 'centres', 'passesLongues', 'vista', 'endurance'],
  },
  {
    id: 'pogba', name: 'Paul Pogba', era: '2011-', position: 'MC', archetype: 'maestro',
    heightCm: 191, foot: 'Droit', aka: ['pogba', 'paul'],
    signature: 'Gabarit rare associé à une vraie technique et des passes longues.',
    why: 'Maestro : contrôle et réactivité, mais avec un gabarit qui change les duels.',
    priorities: ['controle', 'passesLongues', 'force', 'reactivite', 'vista'],
  },

  // ---------------------------------------------------------------- Défenseurs (l'IA les tient, mais libre à toi)
  {
    id: 'van-dijk', name: 'Virgil van Dijk', era: '2011-', position: 'DC', archetype: 'boss',
    heightCm: 193, foot: 'Droit', aka: ['van dijk', 'virgil', 'vvd'],
    signature: 'Gagne le duel sans courir, place le corps avant le tacle.',
    why: 'Référence officielle de l’archétype Boss dans FC 27.',
    priorities: ['force', 'agressivite', 'luciditeDefensive', 'detente', 'tacleDebout'],
  },
  {
    id: 'maldini', name: 'Paolo Maldini', era: '1984-2009', position: 'DC', archetype: 'progressor',
    heightCm: 186, foot: 'Droit', aka: ['maldini', 'paolo'],
    signature: 'Défendait par anticipation, presque jamais par le tacle.',
    why: 'Progressor plutôt que Boss : le placement et la relance avant l’impact.',
    priorities: ['luciditeDefensive', 'tacleDebout', 'passesLongues', 'controle', 'vitesse'],
  },
  {
    id: 'cannavaro', name: 'Fabio Cannavaro', era: '1992-2011', position: 'DC', archetype: 'boss',
    heightCm: 176, foot: 'Droit', aka: ['cannavaro', 'fabio'],
    signature: 'Petit pour un central, compensait par l’agressivité et la détente.',
    why: 'Boss malgré le gabarit : l’agressivité et la force sont ses attributs clés.',
    priorities: ['agressivite', 'luciditeDefensive', 'detente', 'force', 'vitesse'],
  },
  {
    id: 'cafu', name: 'Cafu', era: '1989-2008', position: 'DD', archetype: 'marauder',
    heightCm: 176, foot: 'Droit', aka: ['cafu'],
    signature: 'Montait et redescendait tout le match, sur tout le couloir.',
    why: 'Marauder : vitesse et tacle glissé, le piston de référence.',
    priorities: ['vitesse', 'endurance', 'tacleGlisse', 'centres', 'acceleration'],
  },
  {
    id: 'roberto-carlos', name: 'Roberto Carlos', era: '1991-2015', position: 'DG', archetype: 'marauder',
    heightCm: 168, foot: 'Gauche', aka: ['roberto carlos', 'carlos'],
    signature: 'Puissance de frappe irréelle et courses de quatre-vingts mètres.',
    why: 'Marauder pour la vitesse pure ; sa frappe se retrouve dans les coups francs.',
    priorities: ['vitesse', 'acceleration', 'precisionCoupFranc', 'endurance', 'centres'],
  },
  {
    id: 'beckenbauer', name: 'Franz Beckenbauer', era: '1964-1983', position: 'DC', archetype: 'progressor',
    heightCm: 181, foot: 'Droit', aka: ['beckenbauer', 'franz', 'der kaiser'],
    signature: 'Sortait de la défense balle au pied et lançait l’attaque.',
    why: 'Progressor : c’est littéralement l’archétype du libéro relanceur.',
    priorities: ['passesLongues', 'controle', 'luciditeDefensive', 'tacleDebout', 'vista'],
  },

  // ---------------------------------------------------------------- Gardiens (idem : l'IA les tient)
  {
    id: 'buffon', name: 'Gianluigi Buffon', era: '1995-2023', position: 'G', archetype: 'shot-stopper',
    heightCm: 192, foot: 'Droit', aka: ['buffon', 'gigi'],
    signature: 'Placement parfait, réflexes intacts pendant vingt-cinq ans.',
    why: 'Shot Stopper : placement et réflexes, ses deux attributs clés.',
    priorities: ['placementGardien', 'reflexes', 'plongeon', 'priseDeBalle', 'reactivite'],
  },
  {
    id: 'neuer', name: 'Manuel Neuer', era: '2006-', position: 'G', archetype: 'sweeper-keeper',
    heightCm: 193, foot: 'Droit', aka: ['neuer', 'manuel'],
    signature: 'A inventé le gardien-libéro moderne : sorties loin de sa surface.',
    why: 'Sweeper Keeper : prise de balle et jeu au pied avant les arrêts spectaculaires.',
    priorities: ['priseDeBalle', 'plongeon', 'placementGardien', 'passesLongues', 'reflexes'],
  },
  {
    id: 'yashin', name: 'Lev Yachine', era: '1950-1971', position: 'G', archetype: 'shot-stopper',
    heightCm: 189, foot: 'Droit', aka: ['yashin', 'yachine', 'lev'],
    signature: 'L’araignée noire : le premier gardien à sortir de sa ligne.',
    why: 'Shot Stopper pour les réflexes, qui ont fait sa légende.',
    priorities: ['reflexes', 'placementGardien', 'plongeon', 'reactivite', 'priseDeBalle'],
  },
];

/** Texte normalisé pour la recherche : sans accents, sans ponctuation, en minuscules. */
const fold = (text: string) => text
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Recherche tolérante : accents, majuscules et surnoms.
 * Un nom de famille seul suffit ; le classement remonte d'abord ce qui commence par la requête.
 */
export function searchLookalikes(query: string, limit = 6): Lookalike[] {
  const needle = fold(query);
  if (needle.length < 2) return [];
  const scored = LOOKALIKES
    .map((entry) => {
      const haystacks = [entry.name, ...(entry.aka ?? [])].map(fold);
      const best = haystacks.reduce((score, text) => {
        if (text === needle) return Math.max(score, 4);
        if (text.startsWith(needle) || text.split(' ').some((word) => word.startsWith(needle))) return Math.max(score, 3);
        if (text.includes(needle)) return Math.max(score, 2);
        return score;
      }, 0);
      return { entry, score: best };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map((row) => row.entry);
}

export const lookalikeById = (id: string) => LOOKALIKES.find((entry) => entry.id === id);

/** Joueurs de référence d'un archétype, pour illustrer une carte sans recherche. */
export const lookalikesForArchetype = (archetype: string) => LOOKALIKES.filter((entry) => entry.archetype === archetype);

/** Vérifie qu'une entrée est cohérente avec le catalogue d'archétypes (utilisé par les tests). */
export const lineOf = (entry: Lookalike) => LINE_OF_POSITION[entry.position];
