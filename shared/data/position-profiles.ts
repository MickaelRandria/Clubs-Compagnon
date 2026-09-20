import type { ArchetypeLine, AttributeKey } from './archetypes.js';
import { archetypesForPosition } from './archetypes.js';
import type { PositionRole } from '../fc27.js';

// ============================================================================
// EA SPORTS FC 27 — Clubs : profil conseillé par poste.
// Répartition des points de départ, fourchettes de gabarit et PlayStyles prioritaires.
//
// ⚠ AUCUN de ces chiffres n'est publié par EA. Ils proviennent d'un relevé communautaire
// d'avant la sortie, et s'affichent tous avec le badge « Non confirmé ».
// La même source nommait des archétypes inexistants (Sprinter, Guardian, Anchor, Wing-Back)
// ou périmés (Engine, supprimé en FC 27) : ses recommandations d'archétype ont donc été
// refaites ici à partir des 13 archétypes vérifiés de `archetypes.ts`.
// ============================================================================

export const PROFILES_SOURCE = {
  confirmed: false,
  total: 20,
  label: 'Relevé communautaire avant la sortie',
  caveat: 'EA n’a publié ni le budget de départ ni le coût des attributs. À revérifier dès le premier écran de création.',
} as const;

/** Arbres de compétence entre lesquels se répartissent les points de départ. */
export type SkillTree = 'vitesse' | 'tirs' | 'passes' | 'dribbles' | 'defense' | 'physique' | 'plongeon' | 'reflexes' | 'placement';

export const SKILL_TREES: Record<SkillTree, { label: string; line: ArchetypeLine | 'all' }> = {
  vitesse: { label: 'Vitesse', line: 'all' },
  tirs: { label: 'Tirs', line: 'all' },
  passes: { label: 'Passes', line: 'all' },
  dribbles: { label: 'Dribbles', line: 'all' },
  defense: { label: 'Défense', line: 'all' },
  physique: { label: 'Physique', line: 'all' },
  plongeon: { label: 'Plongeon', line: 'G' },
  reflexes: { label: 'Réflexes', line: 'G' },
  placement: { label: 'Positionnement', line: 'G' },
};

export interface Range { min: number; max: number }

export interface BuildOption {
  /** « Vitesse / Finition », « Pivot »… vide quand le poste n'a qu'un gabarit conseillé. */
  label: string | null;
  heightCm: Range;
  weightKg: Range;
  why: string;
}

export interface PositionProfile {
  id: string;
  /** Postes couverts, codes FR de `POSITION_CODES`. */
  positions: PositionRole[];
  title: string;
  intent: string;
  /**
   * Archétypes conseillés, toutes lignes confondues : filtrés par poste à l'affichage
   * (`recommendedFor`), pour ne jamais proposer un archétype indisponible.
   */
  recommended: string[];
  options: BuildOption[];
  /** Répartition conseillée des points de départ. La somme vaut toujours `PROFILES_SOURCE.total`. */
  spend: { tree: SkillTree; points: number; detail: string }[];
  /** PlayStyles à viser en priorité sur ce poste, au-delà de la signature de l'archétype. */
  playStyles: string[];
  /** Mise en garde propre au poste, quand il y en a une. */
  warning: string | null;
}

export const POSITION_PROFILES: PositionProfile[] = [
  {
    id: 'attaque-axe',
    positions: ['BU', 'AT'],
    title: 'Attaquant de pointe',
    intent: 'Deux approches dominent : le renard de surface agile, ou le pivot physique.',
    recommended: ['finisher', 'target'],
    options: [
      { label: 'Vitesse / Finition', heightCm: { min: 172, max: 178 }, weightKg: { min: 54, max: 68 }, why: 'Agilité et accélération maximales.' },
      { label: 'Pivot', heightCm: { min: 185, max: 188 }, weightKg: { min: 75, max: 82 }, why: 'Protection de balle et duels aériens.' },
    ],
    spend: [
      { tree: 'vitesse', points: 8, detail: 'Accélération et vitesse de pointe.' },
      { tree: 'tirs', points: 8, detail: 'Finition et puissance de tir.' },
      { tree: 'dribbles', points: 4, detail: 'Agilité et réactivité — ou Force et détente si tu pars sur le pivot.' },
    ],
    playStyles: ['Tir en finesse', 'Tir puissant', 'Rapide', 'Aérien'],
    warning: null,
  },
  {
    id: 'couloirs',
    positions: ['AG', 'AD', 'MG', 'MD'],
    title: 'Ailiers & milieux latéraux',
    intent: 'Éliminer en un contre un, déborder pour centrer, ou repiquer sur le pied fort.',
    recommended: ['spark', 'magician', 'creator', 'maestro'],
    options: [
      { label: null, heightCm: { min: 168, max: 174 }, weightKg: { min: 50, max: 60 }, why: 'Le plus vif possible : tout se joue sur les premiers mètres.' },
    ],
    spend: [
      { tree: 'vitesse', points: 10, detail: 'L’arbre de vitesse au maximum, pour déborder sans forcer.' },
      { tree: 'dribbles', points: 6, detail: 'Contrôle du ballon et agilité.' },
      { tree: 'passes', points: 4, detail: 'Centres et passes courtes.' },
    ],
    playStyles: ['Passe travaillée', 'Foulée rapide', 'Technique'],
    warning: null,
  },
  {
    id: 'meneur',
    positions: ['MOC'],
    title: 'Milieu offensif central',
    intent: 'Le cœur de la création : orienter le jeu, décaler, frapper de loin.',
    recommended: ['creator', 'maestro'],
    options: [
      { label: null, heightCm: { min: 172, max: 176 }, weightKg: { min: 62, max: 70 }, why: 'Équilibre entre vivacité et tenue sur les appuis.' },
    ],
    spend: [
      { tree: 'passes', points: 8, detail: 'Vista et passes courtes.' },
      { tree: 'dribbles', points: 6, detail: 'Conduite de balle et agilité.' },
      { tree: 'vitesse', points: 4, detail: 'Accélération, pour sortir du marquage.' },
      { tree: 'tirs', points: 2, detail: 'Tirs de loin ou finition.' },
    ],
    playStyles: ['Passe incisive', 'Tiki-taka', 'Tir en finesse'],
    warning: null,
  },
  {
    id: 'milieu-axe',
    positions: ['MC', 'MDC'],
    title: 'Relayeur & milieu défensif',
    intent: 'Réguler le tempo, récupérer, assurer la transition.',
    recommended: ['disruptor', 'recycler', 'maestro'],
    options: [
      { label: 'MDC récupérateur', heightCm: { min: 182, max: 186 }, weightKg: { min: 72, max: 78 }, why: 'Assez dense pour tenir le duel devant la défense.' },
      { label: 'MC box-to-box', heightCm: { min: 176, max: 180 }, weightKg: { min: 68, max: 74 }, why: 'Assez léger pour répéter les courses sur 90 minutes.' },
    ],
    spend: [
      { tree: 'defense', points: 6, detail: 'Tacles debout et interceptions.' },
      { tree: 'physique', points: 6, detail: 'Endurance et agressivité.' },
      { tree: 'passes', points: 5, detail: 'Passes courtes et vista.' },
      { tree: 'vitesse', points: 3, detail: 'Accélération, pour compenser les transitions rapides.' },
    ],
    playStyles: ['Interception', 'Infatigable', 'Passe en profondeur'],
    warning: null,
  },
  {
    id: 'lateraux',
    positions: ['DG', 'DD'],
    title: 'Latéraux & pistons',
    intent: 'Le poste le plus exigeant physiquement : sécuriser le couloir et apporter le surnombre.',
    recommended: ['marauder', 'progressor'],
    options: [
      { label: null, heightCm: { min: 175, max: 180 }, weightKg: { min: 64, max: 72 }, why: 'Assez rapide pour suivre l’ailier, assez solide pour le contact.' },
    ],
    spend: [
      { tree: 'vitesse', points: 8, detail: 'Indispensable pour suivre les ailiers adverses.' },
      { tree: 'defense', points: 6, detail: 'Tacle debout et lucidité défensive.' },
      { tree: 'physique', points: 4, detail: 'Endurance avant tout.' },
      { tree: 'passes', points: 2, detail: 'Centres ou passes courtes.' },
    ],
    playStyles: ['Infatigable', 'Contre', 'Foulée rapide'],
    warning: null,
  },
  {
    id: 'charniere',
    positions: ['DC'],
    title: 'Défenseur central',
    intent: 'Le verrou : imposer son physique, couper les trajectoires, sécuriser la relance.',
    recommended: ['boss', 'progressor'],
    options: [
      { label: null, heightCm: { min: 186, max: 190 }, weightKg: { min: 78, max: 84 }, why: 'Dominant dans le duel sans sacrifier la relance.' },
    ],
    spend: [
      { tree: 'defense', points: 9, detail: 'Tacles debout, tacles glissés et lucidité défensive.' },
      { tree: 'vitesse', points: 6, detail: 'Accélération et vitesse de pointe, face aux ballons en profondeur.' },
      { tree: 'physique', points: 5, detail: 'Force et détente.' },
    ],
    playStyles: ['Anticipation', 'Bloc', 'Aérien', 'Acrobate'],
    warning: 'Ne dépasse pas 192 cm : au-delà, tu perds trop d’accélération pour défendre la profondeur.',
  },
  {
    id: 'gardien',
    positions: ['G'],
    title: 'Gardien de but',
    intent: 'Fermer les angles et sortir l’arrêt décisif.',
    recommended: ['shot-stopper', 'sweeper-keeper'],
    options: [
      { label: null, heightCm: { min: 193, max: 196 }, weightKg: { min: 82, max: 88 }, why: 'De l’envergure pour couvrir les deux poteaux.' },
    ],
    spend: [
      { tree: 'plongeon', points: 7, detail: 'Amplitude vers les poteaux.' },
      { tree: 'reflexes', points: 7, detail: 'Réaction sur les frappes rapprochées.' },
      { tree: 'placement', points: 6, detail: 'Fermer l’angle avant même la frappe.' },
    ],
    playStyles: ['Réflexes rapides', 'Portée du gardien'],
    warning: null,
  },
];

export const profileForPosition = (position: PositionRole) =>
  POSITION_PROFILES.find((profile) => profile.positions.includes(position));

/** Archétypes conseillés réellement sélectionnables à ce poste (une autre ligne n'est jamais proposée). */
export function recommendedFor(position: PositionRole): string[] {
  const profile = profileForPosition(position);
  if (!profile) return [];
  const available = new Set(archetypesForPosition(position).map((a) => a.id));
  return profile.recommended.filter((id) => available.has(id));
}

/** Gabarit conseillé retenu par défaut pour un poste : la première option de son profil. */
export const mainOption = (position: PositionRole) => profileForPosition(position)?.options[0];

/** Attributs de l'arbre, pour relier la répartition aux libellés déjà connus du tunnel. */
export const TREE_ATTRIBUTES: Partial<Record<SkillTree, AttributeKey[]>> = {
  vitesse: ['acceleration', 'vitesse'],
  tirs: ['finition', 'calme'],
  passes: ['passesCourtes', 'passesLongues', 'vista'],
  dribbles: ['dribbles', 'controle'],
  defense: ['interceptions', 'tacleDebout', 'luciditeDefensive'],
  physique: ['force', 'endurance', 'agressivite'],
  plongeon: ['plongeon'],
  reflexes: ['reflexes'],
  placement: ['placementGardien'],
};
