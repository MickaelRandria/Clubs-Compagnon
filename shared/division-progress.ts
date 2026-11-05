// Progression en division Pro Clubs : EA donne la division du club, pas le seuil de montée ni les chances.
// On rejoue donc nos matchs de ligue depuis l'entrée dans la division avec les règles du jeu
// (données par le club le 04/11/2026) :
// - victoire 3 pts, nul 1, défaite 0 ; la montée tombe dès que les points atteignent le seuil ;
// - 3 chances par division, une défaite en coûte une (au total, pas d'affilée), une victoire n'en rend pas ;
// - à 0 chance, le match suivant est un match de relégation : le perdre, c'est descendre ;
//   le gagner ou faire nul rend les 3 chances (règle encore « pas sûre » côté club).
// Précisé le 05/11/2026 : pour monter en Élite depuis la Division 1, il faut 22 points, PUIS
// gagner 5 matchs d'affilée (série finale). Un nul ou une défaite remet la série à zéro ;
// les défaites continuent de coûter des chances.

import type { MatchResult } from './types.js';

export const CHANCES = 3;

/**
 * Points de montée par division (numérotation EA : 2 = Division 1). Valeurs données de mémoire par
 * le club, à confirmer : l'app les remplace par le seuil observé à chaque montée détectée.
 */
export const PROMOTION_POINTS: Partial<Record<number, number>> = { 2: 22 };
export const DEFAULT_PROMOTION_POINTS = 21;

/** Victoires d'affilée exigées une fois le seuil atteint (série finale). 0 : la montée tombe au seuil. */
export const PROMOTION_STREAK: Partial<Record<number, number>> = { 2: 5 };
export const promotionStreak = (division: number) => PROMOTION_STREAK[division] ?? 0;

export const POINTS: Record<MatchResult, number> = { win: 3, draw: 1, loss: 0 };

export interface DivisionStep {
  matchId: number;
  result: MatchResult;
  /** Points et chances après ce match. */
  points: number;
  chances: number;
  /** Ce match était un match de relégation. */
  relegationMatch: boolean;
  /** Ce match a été joué en série finale (seuil déjà atteint avant lui). */
  series: boolean;
  /** Victoires d'affilée de la série finale après ce match. */
  streak: number;
}

export interface DivisionReplay {
  steps: DivisionStep[];
  points: number;
  chances: number;
  /** Le prochain match est un match de relégation. */
  relegationMatchNext: boolean;
  /** Seuil atteint : les matchs suivants comptent pour la série finale (si la division en exige une). */
  seriesStarted: boolean;
  /** Victoires d'affilée en série finale. */
  streak: number;
  /** Match après lequel le seuil a été atteint (null : pas encore). */
  promotedAfter: number | null;
  /** Match de relégation perdu (null : aucun). */
  relegatedAfter: number | null;
  record: { wins: number; draws: number; losses: number };
}

/**
 * Rejoue une division, matchs du plus ancien au plus récent. Ne s'arrête pas à la montée : EA tranche.
 * `streakNeeded` : victoires d'affilée à enchaîner une fois le seuil atteint (0 : montée au seuil).
 */
export function replayDivision(matches: { id: number; result: MatchResult }[], target: number, streakNeeded = 0): DivisionReplay {
  let points = 0;
  let chances = CHANCES;
  let streak = 0;
  let promotedAfter: number | null = null;
  let relegatedAfter: number | null = null;
  const record = { wins: 0, draws: 0, losses: 0 };
  const steps: DivisionStep[] = [];
  for (const m of matches) {
    const relegationMatch = chances === 0;
    // Le match qui atteint le seuil ne compte pas dans la série : elle commence au suivant.
    const series = streakNeeded > 0 && points >= target;
    if (series) streak = m.result === 'win' ? streak + 1 : 0;
    points += POINTS[m.result];
    record[m.result === 'win' ? 'wins' : m.result === 'draw' ? 'draws' : 'losses']++;
    if (relegationMatch) {
      if (m.result === 'loss') relegatedAfter ??= m.id;
      else chances = CHANCES;
    } else if (m.result === 'loss') {
      chances--;
    }
    const promoted = streakNeeded > 0 ? streak >= streakNeeded : points >= target;
    if (promotedAfter === null && promoted) promotedAfter = m.id;
    steps.push({ matchId: m.id, result: m.result, points, chances, relegationMatch, series, streak });
  }
  return {
    steps, points, chances, relegationMatchNext: chances === 0, promotedAfter, relegatedAfter, record,
    seriesStarted: streakNeeded > 0 && points >= target, streak,
  };
}

/**
 * Seuil de montée d'une division. `observed` : points atteints au match décisif des montées
 * détectées. Le seuil des règles tient s'il colle à ce qu'on a vu (atteint en un match au plus),
 * sinon on prend l'observation la plus récente.
 */
export function promotionTarget(division: number, observed: number[] = []): { points: number; source: 'rules' | 'observed' } {
  const rule = PROMOTION_POINTS[division] ?? DEFAULT_PROMOTION_POINTS;
  // Avec une série finale, les points de la montée dépassent le seuil d'au moins la série : ils ne le recalent pas.
  if (promotionStreak(division) > 0) return { points: rule, source: 'rules' };
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
