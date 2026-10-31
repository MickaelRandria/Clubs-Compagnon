import { z } from 'zod';

// FoodBet — paris et votes des sessions Clubs Pro.
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

/** Moment de la soirée, visible de tous pour signaler les paris dans la navigation. */
export type BetsLive = 'open' | 'locked' | 'voting' | null;

export interface BetsStatus {
  mode: BetsMode;
  access: BetsAccess;
  /** L'admin peut changer le mode depuis la tuile de /fc27. */
  canConfigure: boolean;
  /** null tant que l'accès est fermé au visiteur. */
  live: BetsLive;
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
export const STAKES = [50, 100, 250] as const;
export const DEFAULT_STAKE = 100;
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

// ---------- Phase 2 : état réel, renvoyé par bets_dispatch (drizzle/0017_bets.sql) ----------

export const CURRENCY = { name: 'crédits', short: 'CR' } as const;

/** Paris de la session : bilan, attack, scorer, clumsy, crack, sr et un bonus (cleansheet, red, ragequit, streak).
 * verdict, goals, against, flop : anciens paris par match, encore dans l'historique. */
export type MarketId = 'bilan' | 'attack' | 'scorer' | 'clumsy' | 'crack' | 'sr' | 'cleansheet' | 'red' | 'ragequit' | 'streak'
  | 'flop' | 'verdict' | 'goals' | 'against';
export type SlipStatus = 'pending' | 'won' | 'lost' | 'refunded';

/** Textes des paris. Les options et leurs cotes viennent du serveur, seule source des cotes. */
export const MARKET_COPY: Record<MarketId, { title: string; question: string; emoji: string }> = {
  bilan: { title: 'Le Bilan', question: 'Plus de victoires que de défaites ?', emoji: '⚖️' },
  attack: { title: 'L’Attaque', question: 'Buts marqués par match, en moyenne ?', emoji: '⚽' },
  scorer: { title: 'Le Buteur', question: 'Qui marque le plus ce soir ?', emoji: '🎯' },
  clumsy: { title: 'Le Maladroit', question: 'Qui rate le plus devant le but ?', emoji: '🙈' },
  crack: { title: 'Le Crack', question: 'Qui sera élu joueur de la soirée ?', emoji: '🔥' },
  sr: { title: 'Le Skill Rating', question: 'La soirée finit en hausse ?', emoji: '📈' },
  cleansheet: { title: 'Le Mur', question: 'Au moins un match sans encaisser ?', emoji: '🧱' },
  red: { title: 'Carton rouge', question: 'Un des nôtres prend un rouge ce soir ?', emoji: '🟥' },
  ragequit: { title: 'Le Rage-quit', question: 'Un adversaire quitte avant la fin ?', emoji: '🏃' },
  streak: { title: 'La Série', question: '3 victoires d’affilée ce soir ?', emoji: '🔗' },
  verdict: { title: 'Le Verdict', question: 'Le résultat du match ?', emoji: '⚖️' },
  goals: { title: 'Les Buts', question: 'Combien de buts pour FoodBall ?', emoji: '⚽' },
  against: { title: 'Buts encaissés', question: 'Combien de buts encaissés ?', emoji: '🥅' },
  flop: { title: 'La Casserole', question: 'Qui va tenter la roulette de trop ?', emoji: '🍳' },
};
/** Ordre du ticket : les paris d'équipe, les joueurs, puis le bonus. */
export const MARKET_ORDER: MarketId[] = ['bilan', 'attack', 'scorer', 'clumsy', 'crack', 'sr', 'cleansheet', 'red', 'ragequit', 'streak',
  'verdict', 'goals', 'against', 'flop'];
/** Le pari bonus, tiré au sort à chaque session. */
export const BONUS_MARKETS: MarketId[] = ['cleansheet', 'red', 'ragequit', 'streak'];

/** `trend` : effet du dernier match sur la cote (positif = elle monte). `why` : ce qui fait la cote d'un joueur, en clair. */
export interface MarketOption { id: string; label: string; odds: number; trend?: number; why?: string }

/** Mise max par pari : la moitié du solde, jusqu'à 50 quand le solde est petit (même règle que bets_dispatch, drizzle/0026). */
export const maxStake = (balance: number) => Math.max(Math.ceil(balance / 2), Math.min(balance, 50));
/** Crédits offerts une fois par soirée quand tous les paris du ticket sont joués. */
export const TICKET_BONUS = 25;
export interface Market { id: MarketId; options: MarketOption[] }
export interface Slip { id: number; fixtureId: number; market: MarketId; option: string; stake: number; odds: number; status: SlipStatus; payout: number | null }
/** Le prono d'un joueur du club, tel que tout le monde le voit une fois dévoilé. */
export interface BetPick { name: string; market: MarketId; option: string; stake: number; odds: number; status: SlipStatus; payout: number | null; me: boolean }
export interface BetMatch { id: number; opponent: string; goalsFor: number; goalsAgainst: number; result: 'win' | 'draw' | 'loss'; playedAt?: string }
/** La session jusqu'ici (bets_session, drizzle/0025) : tous les matchs depuis le coup d'envoi. */
export interface BetSession {
  startedAt: string | null; endedAt: string | null;
  matches: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number;
  cleanSheets: number; withStats: number; reds: number; ragequits: number; quitKnown: number; bestStreak: number;
  srStart: number | null; srNow: number | null;
  last: BetMatch | null;
  /** Joueurs de la soirée : buts, passes, tirs ratés, note EA moyenne, matchs joués. Meilleur buteur en premier. */
  players: { memberId: number; gamertag: string; goals: number; assists: number; missed: number; rating: number | null; played: number }[];
}

export interface BetsState {
  isAdmin: boolean;
  myMemberId: number | null;
  wallet: { balance: number; canBailout: boolean; bankrupt: boolean };
  /** Session à parier (ouverte) ou en cours (verrouillée, `session` = les matchs déjà joués). */
  fixture: { id: number; status: 'open' | 'locked'; openedAt: string; lockedAt: string | null; context: { reason: string | null } | null;
    session: BetSession | null; markets: Market[]; bettors: number; mySlips: Slip[] } | null;
  /** Sessions finies dont le vote du Crack est ouvert. */
  votes: {
    id: number; openedAt: string; session: BetSession; markets: Market[]; mySlips: Slip[];
    candidates: { memberId: number; gamertag: string }[];
    tally: { crack: Record<string, number>; flop: Record<string, number> };
    myVotes: { crack: number | null; flop: number | null };
    /** Comptes qui ont voté. */
    voters: number;
    /** Les pronos du club, dévoilés une fois mon vote donné (null avant). */
    picks: BetPick[] | null;
  }[];
  /** Les 5 dernières rencontres réglées du club, avec tous les pronos (`results`) pour afficher les gagnants. */
  /** `session` : rencontres au format session ; `match` : anciennes rencontres d'un seul match. */
  history: { id: number; status: 'settled' | 'cancelled'; settledAt: string; match: BetMatch | null; session: BetSession | null;
    crack: string[] | null; flop: string[] | null;
    markets: Market[]; mySlips: Slip[]; results: BetPick[]; myVote: number | null;
    /** Qui a voté pour qui au Crack, dévoilé une fois le vote clos. */
    ballots: { voter: string; me: boolean; memberId: number; gamertag: string }[] }[];
  leaderboard: { accountId: number; name: string; balance: number; me: boolean }[];
  /** Salle d'attente : présents (FoodBet ouvert ces 2 dernières minutes) et engagés dans la soirée, sans leurs choix. */
  room: { name: string; me: boolean; here: boolean; played: boolean; voted: boolean }[];
}

const market = z.enum(['bilan', 'attack', 'scorer', 'clumsy', 'crack', 'sr', 'cleansheet', 'red', 'ragequit', 'streak', 'flop', 'verdict', 'goals', 'against']);
const id = z.number().int().positive();

/** Actions d'un parieur. Les cotes ne sont jamais acceptées du client. */
export const betsPlayActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('place'), fixtureId: id,
    bets: z.array(z.object({ market, option: z.string().min(1).max(20), stake: z.number().int().positive().max(1_000_000) })).min(1).max(6) }),
  z.object({ action: z.literal('unplace'), market }),
  z.object({ action: z.literal('vote'), fixtureId: id, category: z.enum(['crack', 'flop']), memberId: id }),
  z.object({ action: z.literal('bailout') }),
]);
export type BetsPlayAction = z.infer<typeof betsPlayActionSchema>;

export const betsAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open') }),
  z.object({ action: z.literal('lock') }),
  // Fin de session : synchro EA forcée, puis tout est réglé et le vote du Crack s'ouvre.
  z.object({ action: z.literal('end-session') }),
  // Suivre la session : relance la synchro EA (l'écran admin l'appelle toutes les 20 s).
  z.object({ action: z.literal('check') }),
  z.object({ action: z.literal('close-vote'), fixtureId: id }),
  z.object({ action: z.literal('cancel'), fixtureId: id }),
]);
export type BetsAdminAction = z.infer<typeof betsAdminActionSchema>;

/** Option gagnante lisible (« Victoire », « Rina94JJG »…) pour l'historique. */
export const optionLabel = (markets: Market[], slip: Pick<Slip, 'market' | 'option'>) =>
  markets.find((m) => m.id === slip.market)?.options.find((o) => o.id === slip.option)?.label ?? slip.option;
