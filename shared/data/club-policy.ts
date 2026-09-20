import { LINE_OF_POSITION, type ArchetypeLine } from './archetypes.js';
import { POSITION_CODES, type PositionRole } from '../fc27.js';

// ============================================================================
// Politique du club : quelles lignes le collectif ne pourvoit pas humainement.
//
// Dommage joue au milieu et devant. Le gardien et la défense sont tenus par l'IA,
// et c'est un choix, pas un manque. Le moteur tactique ne doit donc ni les réclamer
// ni pénaliser leur absence — mais il compte normalement un défenseur qui arrive.
//
// Un seul endroit à changer si le club se met à recruter derrière.
// ============================================================================

/** Lignes laissées à l'IA. Vider ce tableau rend au moteur son comportement d'origine. */
export const AI_LINES: ArchetypeLine[] = ['G', 'DEF'];

export const CLUB_POLICY = {
  /** Affiché partout où l'absence de ces postes pourrait passer pour un oubli. */
  label: 'Gardien et défense tenus par l’IA',
  short: 'Tenu par l’IA',
  why: 'Le collectif joue au milieu et devant. Les postes de derrière sont laissés à l’IA, par choix.',
} as const;

/** Une ligne que le club ne pourvoit pas : son absence n'est jamais un manque. */
export const isAiLine = (line: ArchetypeLine) => AI_LINES.includes(line);

/** Un poste tenu par l'IA tant que personne ne l'occupe. */
export const isAiPosition = (position: PositionRole) => isAiLine(LINE_OF_POSITION[position]);

/** Postes que le club cherche réellement à pourvoir. */
export const HUMAN_POSITIONS: PositionRole[] = POSITION_CODES.filter((position) => !isAiPosition(position));

/**
 * Un poste redevient « humain » dès qu'un joueur l'occupe : un défenseur qui crée
 * sa fiche doit être analysé comme les autres, sans quoi on l'ignorerait.
 */
export const coveredByAi = (position: PositionRole, occupants: number) => occupants === 0 && isAiPosition(position);
