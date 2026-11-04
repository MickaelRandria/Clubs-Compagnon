// Progression en division Pro Clubs : EA donne la division du club, pas le seuil de montée ni les chances.
// On rejoue donc nos matchs de ligue depuis l'entrée dans la division avec les règles du jeu
// (données par le club le 04/11/2026) :
// - victoire 3 pts, nul 1, défaite 0 ; la montée tombe dès que les points atteignent le seuil ;
// - 3 chances par division, une défaite en coûte une (au total, pas d'affilée), une victoire n'en rend pas ;
// - à 0 chance, le match suivant est un match de relégation : le perdre, c'est descendre ;
//   le gagner ou faire nul rend les 3 chances (règle encore « pas sûre » côté club).

import type { MatchResult } from './types.js';

export const CHANCES = 3;

/**
 * Points de montée par division (numérotation EA : 2 = Division 1). Valeurs données de mémoire par
 * le club, à confirmer : l'app les remplace par le seuil observé à chaque montée détectée.
 */
export const PROMOTION_POINTS: Partial<Record<number, number>> = { 2: 16 };
export const DEFAULT_PROMOTION_POINTS = 21;

export const POINTS: Record<MatchResult, number> = { win: 3, draw: 1, loss: 0 };

export interface DivisionStep {
  matchId: number;
  result: MatchResult;
  /** Points et chances après ce match. */
  points: number;
  chances: number;
  /** Ce match était un match de relégation. */
  relegationMatch: boolean;
}

export interface DivisionReplay {
  steps: DivisionStep[];
  points: number;
  chances: number;
  /** Le prochain match est un match de relégation. */
  relegationMatchNext: boolean;
  /** Match après lequel le seuil a été atteint (null : pas encore). */
  promotedAfter: number | null;
  /** Match de relégation perdu (null : aucun). */
  relegatedAfter: number | null;
  record: { wins: number; draws: number; losses: number };
}

/** Rejoue une division, matchs du plus ancien au plus récent. Ne s'arrête pas au seuil : EA tranche. */
export function replayDivision(matches: { id: number; result: MatchResult }[], target: number): DivisionReplay {
  let points = 0;
  let chances = CHANCES;
  let promotedAfter: number | null = null;
  let relegatedAfter: number | null = null;
  const record = { wins: 0, draws: 0, losses: 0 };
  const steps: DivisionStep[] = [];
  for (const m of matches) {
    const relegationMatch = chances === 0;
    points += POINTS[m.result];
    record[m.result === 'win' ? 'wins' : m.result === 'draw' ? 'draws' : 'losses']++;
    if (relegationMatch) {
      if (m.result === 'loss') relegatedAfter ??= m.id;
      else chances = CHANCES;
    } else if (m.result === 'loss') {
      chances--;
    }
    if (promotedAfter === null && points >= target) promotedAfter = m.id;
    steps.push({ matchId: m.id, result: m.result, points, chances, relegationMatch });
  }
  return { steps, points, chances, relegationMatchNext: chances === 0, promotedAfter, relegatedAfter, record };
}

/**
 * Seuil de montée d'une division. `observed` : points atteints au match décisif des montées
 * détectées. Le seuil des règles tient s'il colle à ce qu'on a vu (atteint en un match au plus),
 * sinon on prend l'observation la plus récente.
 */
export function promotionTarget(division: number, observed: number[] = []): { points: number; source: 'rules' | 'observed' } {
  const rule = PROMOTION_POINTS[division] ?? DEFAULT_PROMOTION_POINTS;
  const seen = observed.at(-1);
  if (seen === undefined || (rule <= seen && rule > seen - 3)) return { points: rule, source: seen === undefined ? 'rules' : 'observed' };
  return { points: seen, source: 'observed' };
}

export interface PromotionPath {
  results: MatchResult[];
  /** Chances restantes au bout de ce chemin. */
  chancesLeft: number;
}

/** Les chemins vers la montée : le plus court, sans défaite avec des nuls, avec une défaite si on peut se la permettre. */
export function promotionPaths(remaining: number, chances: number): PromotionPath[] {
  if (remaining <= 0) return [];
  const wins = Math.ceil(remaining / 3);
  const paths: PromotionPath[] = [{ results: Array(wins).fill('win'), chancesLeft: chances }];
  const draws = remaining - 3 * (wins - 1);
  if (draws > 1 && draws <= 3) {
    paths.push({ results: [...Array(wins - 1).fill('win'), ...Array(draws).fill('draw')], chancesLeft: chances });
  }
  if (chances > 1) {
    const slip: MatchResult[] = Array(wins).fill('win');
    slip.splice(Math.min(1, wins), 0, 'loss');
    paths.push({ results: slip, chancesLeft: chances - 1 });
  }
  return paths;
}

/** Matchs pour monter au rythme donné (points par match). null : rythme inconnu ou nul. */
export function matchesToPromotion(remaining: number, pointsPerMatch: number | null): number | null {
  if (remaining <= 0) return 0;
  if (!pointsPerMatch || pointsPerMatch <= 0) return null;
  return Math.ceil(remaining / pointsPerMatch);
}
