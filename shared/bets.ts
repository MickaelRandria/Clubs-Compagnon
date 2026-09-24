import { z } from 'zod';

// Vestiaire Bets — paris et votes des sessions Clubs Pro.
//
// Règles pures, partagées par le serveur et l'écran : le prototype de la phase 1 les
// affiche avec des données fictives, la phase 2 les appliquera aux vraies mises.
// Spécification : SPECS_PARIS_ET_VOTES.md à la racine du dépôt.

/**
 * Interrupteur de lancement.
 * `off` : tout est grisé. `admins` : aperçu réservé aux capitaines. `on` : ouvert à tous.
 */
export const BETS_MODES = ['off', 'admins', 'on'] as const;
export type BetsMode = typeof BETS_MODES[number];

/** Ce que le visiteur a le droit de voir, déduit du mode et de son rôle. */
export type BetsAccess = 'locked' | 'preview' | 'open';

export interface BetsStatus {
  mode: BetsMode;
  access: BetsAccess;
  /** L'admin peut changer le mode depuis la tuile de /fc27. */
  canConfigure: boolean;
}

export function betsAccess(mode: BetsMode, isAdmin: boolean): BetsAccess {
  if (mode === 'on') return 'open';
  if (mode === 'admins' && isAdmin) return 'preview';
  return 'locked';
}

export const isBetsMode = (value: unknown): value is BetsMode =>
  typeof value === 'string' && (BETS_MODES as readonly string[]).includes(value);

export const betsModeSchema = z.object({ mode: z.enum(BETS_MODES) });

// ---------- Économie ----------

export const STARTING_BALANCE = 500;
export const PRESENCE_BONUS = 50;
export const BAILOUT = 100;
export const STAKES = [25, 50, 100] as const;
export const DEFAULT_STAKE = 50;
export const HERO_VOTE_MINUTES = 10;

/** Gain total rendu au joueur (mise comprise). La cote est celle figée au moment de la mise. */
export const payout = (stake: number, odds: number) => Math.floor(stake * odds);

/** Une mise valide : entière, positive, et couverte par le solde. `max` = tapis. */
export function resolveStake(choice: number | 'max', balance: number): number | null {
  const stake = choice === 'max' ? balance : choice;
  return Number.isInteger(stake) && stake > 0 && stake <= balance ? stake : null;
}

// ---------- Cotes Crack / Casserole ----------

const MARGIN = 1.1;
export const MIN_ODDS = 1.2;
export const MAX_ODDS = 8;
const DEFAULT_RATING = 6.5;

const roundOdds = (odds: number) => Math.round(Math.min(MAX_ODDS, Math.max(MIN_ODDS, odds)) * 20) / 20;

export interface OddsPlayer { memberId: number; avgRating: number | null }

/**
 * Cotes figées à l'annonce du match, calculées sur les présents.
 * Crack : un joueur bien noté est favori, donc sa cote est basse. Casserole : l'inverse.
 * La marge de 10 % limite l'inflation de DC dans un groupe de cinq ou six parieurs.
 */
export function playerOdds(players: OddsPlayer[], kind: 'crack' | 'flop'): Map<number, number> {
  const weights = players.map((p) => {
    const w = Math.max(0.25, ((p.avgRating ?? DEFAULT_RATING) - 5) ** 2);
    return kind === 'crack' ? w : 1 / w;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  return new Map(players.map((p, i) => [p.memberId, roundOdds(1 / ((weights[i] / total) * MARGIN))]));
}

// ---------- Votes ----------

/** Règle anti-vote pour soi. `voterMemberId` null : compte non lié à un joueur, il ne vote pas. */
export const canVoteFor = (voterMemberId: number | null, targetMemberId: number) =>
  voterMemberId !== null && voterMemberId !== targetMemberId;

export interface Tally { counts: Map<number, number>; leaders: number[]; total: number }

/** Dépouillement. Plusieurs leaders = égalité : l'admin tranche à la fermeture (héros : tous désignés). */
export function tally(targets: number[]): Tally {
  const counts = new Map<number, number>();
  for (const id of targets) counts.set(id, (counts.get(id) ?? 0) + 1);
  const best = Math.max(0, ...counts.values());
  const leaders = best === 0 ? [] : [...counts].filter(([, n]) => n === best).map(([id]) => id).sort((a, b) => a - b);
  return { counts, leaders, total: targets.length };
}
