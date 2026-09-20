import type { Member, Position } from '../../../shared/types';
import { frNum } from '../../lib/format';

export type SortKey = 'goals' | 'assists' | 'matchesPlayed' | 'ovr' | 'avgRating';

/** Options de tri, avec leur valeur dans l'URL (?tri=…). */
export const SORTS = [
  { param: 'buts', key: 'goals', label: 'Buts' },
  { param: 'passes', key: 'assists', label: 'Passes D.' },
  { param: 'matchs', key: 'matchesPlayed', label: 'Matchs' },
  { param: 'ovr', key: 'ovr', label: 'OVR' },
  { param: 'note', key: 'avgRating', label: 'Note' },
] as const satisfies ReadonlyArray<{ param: string; key: SortKey; label: string }>;

/** Filtres de poste, avec leur valeur dans l'URL (?poste=…). */
export const POSITIONS = [
  { param: 'tous', position: null, label: 'Tous' },
  { param: 'att', position: 'FW', label: 'Att.' },
  { param: 'mil', position: 'MF', label: 'Mil.' },
  { param: 'def', position: 'DF', label: 'Déf.' },
  { param: 'gk', position: 'GK', label: 'GK' },
] as const satisfies ReadonlyArray<{ param: string; position: Position | null; label: string }>;

export const statValue = (member: Member, key: SortKey) => member[key] ?? 0;

export const formatStat = (member: Member, key: SortKey) => {
  if (key !== 'avgRating') return String(member[key]);
  return member.avgRating === null ? '—' : frNum(member.avgRating, 1);
};
