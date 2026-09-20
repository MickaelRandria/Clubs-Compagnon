// Codes de poste EA FC en français. L'ordre suit l'enum PostgreSQL `fc27_position` (migration 0005).
export const POSITION_CODES = ['G', 'DC', 'DG', 'DD', 'MDC', 'MC', 'MOC', 'MG', 'MD', 'AG', 'AD', 'BU', 'AT'] as const;
export type FC27Position = typeof POSITION_CODES[number];
export type PositionRole = FC27Position;
export const POSITION_LABELS: Record<FC27Position, string> = {
  G: 'Gardien', DC: 'Défenseur central', DG: 'Arrière gauche', DD: 'Arrière droit',
  MDC: 'Milieu défensif', MC: 'Milieu central', MOC: 'Milieu offensif',
  MG: 'Milieu gauche', MD: 'Milieu droit', AG: 'Ailier gauche', AD: 'Ailier droit',
  BU: 'Buteur', AT: 'Attaquant de soutien',
};
export const POSITION_LINES: { label: string; positions: FC27Position[] }[] = [
  { label: 'Attaque', positions: ['AG', 'BU', 'AD', 'AT'] },
  { label: 'Milieu', positions: ['MOC', 'MC', 'MDC', 'MG', 'MD'] },
  { label: 'Défense', positions: ['DG', 'DC', 'DD'] },
  { label: 'Gardien', positions: ['G'] },
];

export const FEET = ['Droit', 'Gauche'] as const;
export type Foot = typeof FEET[number];

export type { FC27Action } from './fc27-validation.js';
export interface FC27Proposal { id: number; author_pseudo: string; club_name: string; created_at: string; votes: number }
export interface FC27Election {
  phase: 'proposing' | 'voting' | 'closed' | 'cancelled'; started_at: string | null; closed_at: string | null;
  winner_proposal_id: number | null; tie_break_applied: boolean;
}
/** Ligne brute renvoyée par `fc27_snapshot`. `in_game_name` = nom floqué sur le maillot, `archetype` = id de shared/data/archetypes.ts.
 *  Les champs de la carte sont null pour une fiche créée avant la migration 0005. */
export interface FC27Player {
  id: number; pseudo: string; in_game_name: string | null; primary_position: FC27Position;
  secondary_positions: FC27Position[]; notes: string | null; updated_at: string;
  kit_number: number | null; preferred_foot: Foot | null; height_cm: number | null; weight_kg: number | null;
  archetype: string | null; weak_foot: number | null; skill_moves: number | null;
  /** Ordre de dépense des points, clés de ATTRIBUTES. Vide = pas encore choisi (ordre par défaut calculé à l'affichage).
   *  Absent des fiches renvoyées par une base où la migration 0007 n'est pas encore passée. */
  attribute_priorities?: string[];
}
export interface FC27State {
  campaign: { id: number; status: 'preparation' | 'archived'; created_at: string; archived_at: string | null };
  proposals: FC27Proposal[]; election: FC27Election; players: FC27Player[]; winner: FC27Proposal | null;
  archives: { id: number; archived_at: string }[]; server_time: string;
}
