// Lecture du skill rating EA (SR) : repères par division et comparaison avec un adversaire.

/**
 * Repères relevés le 28/10/2026 dans les classements EA (plateforme gen5) : skill rating médian
 * des clubs de chaque division parmi les 100 clubs de la saison en cours, top 100 de tous les temps.
 * `division` suit la numérotation EA (1 = Élite, voir shared/division.ts). À rafraîchir à la main.
 */
export const SR_DIVISIONS = [
  { division: 6, sr: 1350 },
  { division: 5, sr: 1520 },
  { division: 4, sr: 1550 },
  { division: 3, sr: 1640 },
  { division: 2, sr: 1760 },
  { division: 1, sr: 2200 },
] as const;
export const SR_TOP100 = 2292;
export const SR_WORLD_BEST = 2572;
export const SR_SURVEY_DATE = '28/10/2026';

/** Division EA dont le niveau typique correspond à ce skill rating. null : sous la Division 5. */
export function levelDivision(sr: number): number | null {
  let level: number | null = null;
  for (const d of SR_DIVISIONS) if (sr >= d.sr) level = d.division;
  return level;
}

/** Écart de niveau en deçà duquel deux clubs sont « à niveau ». */
export const SR_EVEN = 50;
/** Une défaite contre un club moins bien noté d'au moins cet écart est une contre-performance. */
export const SR_UPSET = 100;

export type Strength = 'stronger' | 'even' | 'weaker';

/** L'adversaire était-il plus fort, à niveau ou plus faible que nous ? null : niveau inconnu. */
export function opponentStrength(ours: number | null, theirs: number | null): Strength | null {
  if (ours === null || theirs === null) return null;
  if (theirs - ours > SR_EVEN) return 'stronger';
  if (ours - theirs > SR_EVEN) return 'weaker';
  return 'even';
}

export type MatchFeat = 'exploit' | 'upset';

/** Exploit : victoire contre plus fort. Contre-perf : défaite contre un club nettement moins bien noté. */
export function matchFeat(m: { result: 'win' | 'draw' | 'loss'; ourSkillRating: number | null; opponentSkillRating: number | null }): MatchFeat | null {
  if (m.ourSkillRating === null || m.opponentSkillRating === null) return null;
  if (m.result === 'win' && m.opponentSkillRating - m.ourSkillRating > SR_EVEN) return 'exploit';
  if (m.result === 'loss' && m.ourSkillRating - m.opponentSkillRating >= SR_UPSET) return 'upset';
  return null;
}

export const FEAT_LABEL: Record<MatchFeat, string> = { exploit: 'Exploit', upset: 'Contre-perf' };

/** « 1722 », ou « ~1722 » quand la note adverse a été lue après le match. */
export const srText = (sr: number, estimated = false) => `${estimated ? '~' : ''}${sr}`;
