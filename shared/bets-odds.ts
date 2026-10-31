import { BONUS_MARKETS, type Market, type MarketId, type MarketOption } from './bets.js';

// Les paris d'une session : six fixes (Bilan, Attaque, Buteur, Maladroit, Crack, Skill Rating)
// et un bonus tiré au sort, les mêmes pour tout le monde.
//
// On ne sait pas combien de matchs la soirée comptera : les cotes viennent d'une simulation de
// soirées de 4 à 8 matchs, tirés dans les 20 derniers matchs du club (le dernier pèse le plus).
// Le Crack, élu au vote, reste coté sur la forme (notes EA).

export interface FormMatch {
  opponent: string;
  result: 'win' | 'draw' | 'loss';
  goalsFor: number;
  goalsAgainst: number;
  /** null : feuille de match inconnue. */
  redCard: boolean | null;
  /** L'adversaire a quitté le match. Absent ou null : inconnu (synchro antérieure à la migration 0019). */
  opponentQuit?: boolean | null;
  /** Note EA de chaque joueur présent, par id de membre. */
  ratings: Record<number, number>;
  /** Joueurs présents qui ont marqué. Absent : inconnu. */
  scorers?: number[];
  /** Buts et tirs ratés de chaque joueur présent, par id de membre. Absent : feuille de match inconnue. */
  players?: Record<number, { goals: number; missed: number }>;
  /** Homme du match désigné par EA (id de membre), s'il est des nôtres. */
  motm?: number | null;
}

/** `votes` : voix reçues au vote du Crack des soirées passées, pondérées (la dernière soirée pèse le plus) ; `voteCount` : leur nombre brut. */
export interface FormPlayer { memberId: number; gamertag: string; avgRating: number | null; votes?: number; voteCount?: number }

/** Option de pari : `trend` = écart de cote dû au dernier match (0 pour les paris de session). */
export interface DrawnOption extends MarketOption { trend: number }
export interface DrawnMarket { id: MarketId; options: DrawnOption[] }
export interface Opening { markets: DrawnMarket[]; context: { reason: string | null } }

const MARGIN = 1.08;
export const ODDS_MIN = 1.15;
export const ODDS_MAX = 9.5;
const DECAY = 0.85;
const LAST_BOOST = 2;
const DEFAULT_RATING = 6.5;
/** Soirées simulées : de 4 à 8 matchs. */
export const SESSION_MIN = 4;
export const SESSION_MAX = 8;
const RUNS = 3000;
/** Matchs à l'issue connue qu'il faut avant de coter un abandon : en dessous, la cote serait du hasard. */
export const RAGEQUIT_MIN_KNOWN = 10;

export const toOdds = (p: number) => Math.round(Math.min(ODDS_MAX, Math.max(ODDS_MIN, 1 / (Math.max(p, 0.001) * MARGIN))) * 20) / 20;

/** Poids de chaque match, du plus récent au plus ancien : le dernier compte double. */
const weights = (n: number) => Array.from({ length: n }, (_, i) => DECAY ** i * (i === 0 ? LAST_BOOST : 1));

const YES_NO = [{ id: 'oui', label: 'Oui' }, { id: 'non', label: 'Non' }];
const TEAM: Partial<Record<MarketId, { id: string; label: string }[]>> = {
  bilan: [{ id: 'win', label: 'Plus de V' }, { id: 'even', label: 'Autant' }, { id: 'loss', label: 'Plus de D' }],
  attack: [{ id: 'lt2', label: 'Moins de 2' }, { id: '2-3', label: '2 à 3' }, { id: 'gt3', label: 'Plus de 3' }],
  sr: [{ id: 'up', label: 'En hausse' }, { id: 'down', label: 'En baisse' }],
  cleansheet: YES_NO, red: YES_NO, ragequit: YES_NO, streak: YES_NO,
};

/** Réponse d'un pari d'équipe pour une soirée (mêmes règles que bets_end_session, drizzle/0025). */
export function sessionAnswer(id: MarketId, s: { wins: number; losses: number; matches: number; goalsFor: number;
  cleanSheets: number; reds: number; ragequits: number; bestStreak: number }): string | null {
  if (s.matches === 0) return null;
  const average = s.goalsFor / s.matches;
  switch (id) {
    case 'bilan': return s.wins > s.losses ? 'win' : s.wins < s.losses ? 'loss' : 'even';
    case 'attack': return average < 2 ? 'lt2' : average <= 3 ? '2-3' : 'gt3';
    case 'cleansheet': return s.cleanSheets > 0 ? 'oui' : 'non';
    case 'red': return s.reds > 0 ? 'oui' : 'non';
    case 'ragequit': return s.ragequits > 0 ? 'oui' : 'non';
    case 'streak': return s.bestStreak >= 3 ? 'oui' : 'non';
    default: return null;
  }
}

/** Meilleurs d'une soirée (ex æquo compris) ; personne si le meilleur total est 0. */
function leaders(totals: Map<number, number>): number[] {
  const best = Math.max(0, ...totals.values());
  return best === 0 ? [] : [...totals].filter(([, n]) => n === best).map(([id]) => id);
}

/** Fréquence de chaque issue sur des soirées simulées. */
function simulate(history: FormMatch[], players: FormPlayer[], random: () => number) {
  // Sans historique : toutes les issues à égalité.
  if (history.length === 0) return (_key: string, outcomes: number) => 1 / outcomes;
  const counts = new Map<string, number>();
  const add = (key: string, n = 1) => counts.set(key, (counts.get(key) ?? 0) + n);
  const w = weights(history.length);
  const total = w.reduce((a, b) => a + b, 0);
  const pick = () => {
    let roll = random() * total;
    for (let i = 0; i < history.length; i++) { roll -= w[i]; if (roll < 0) return history[i]; }
    return history[history.length - 1];
  };
  for (let run = 0; run < RUNS; run++) {
    const n = SESSION_MIN + Math.floor(random() * (SESSION_MAX - SESSION_MIN + 1));
    const s = { matches: n, wins: 0, losses: 0, goalsFor: 0, cleanSheets: 0, reds: 0, ragequits: 0, bestStreak: 0 };
    const goals = new Map(players.map((p) => [p.memberId, 0]));
    const missed = new Map(players.map((p) => [p.memberId, 0]));
    let streak = 0;
    for (let i = 0; i < n; i++) {
      const m = pick();
      if (m.result === 'win') { s.wins++; streak++; s.bestStreak = Math.max(s.bestStreak, streak); } else streak = 0;
      if (m.result === 'loss') s.losses++;
      s.goalsFor += m.goalsFor;
      if (m.goalsAgainst === 0) s.cleanSheets++;
      if (m.redCard) s.reds++;
      if (m.opponentQuit) s.ragequits++;
      for (const [id, stat] of Object.entries(m.players ?? {})) {
        const key = Number(id);
        if (goals.has(key)) { goals.set(key, goals.get(key)! + stat.goals); missed.set(key, missed.get(key)! + stat.missed); }
      }
    }
    for (const id of ['bilan', 'attack', 'cleansheet', 'red', 'ragequit', 'streak'] as const) add(`${id}:${sessionAnswer(id, s)}`);
    // Le skill rating suit le bilan ; à égalité, une chance sur deux.
    if (s.wins === s.losses) { add('sr:up', 0.5); add('sr:down', 0.5); } else add(`sr:${s.wins > s.losses ? 'up' : 'down'}`);
    for (const id of leaders(goals)) add(`scorer:${id}`);
    for (const id of leaders(missed)) add(`clumsy:${id}`);
  }
  return (key: string, _outcomes: number) => ((counts.get(key) ?? 0) + 0.5) / (RUNS + 1);
}

/**
 * Crack de la soirée : la forme (notes EA), les voix reçues aux votes des soirées passées et les titres
 * d'homme du match EA sur les 20 derniers matchs. Chaque source est une part ; une source sans donnée est ignorée.
 */
function crackOdds(players: FormPlayer[], history: FormMatch[]): Record<string, number> {
  const share = (values: number[], prior: number) => {
    const total = values.reduce((a, b) => a + b, 0);
    return total === 0 ? null : values.map((v) => (v + prior) / (total + prior * values.length));
  };
  const form = players.map((p) => {
    const recent = history[0]?.ratings[p.memberId];
    const rating = recent === undefined ? p.avgRating ?? DEFAULT_RATING : (p.avgRating ?? DEFAULT_RATING) * 0.6 + recent * 0.4;
    return Math.max(0.25, (rating - 5) ** 2);
  });
  const w = weights(history.length);
  const motm = players.map((p) => history.reduce((sum, m, i) => sum + (m.motm === p.memberId ? w[i] : 0), 0));
  const sources = [[share(form, 0), 0.4], [share(players.map((p) => p.votes ?? 0), 0.5), 0.35], [share(motm, 0.3), 0.25]] as const;
  const used = sources.filter(([v]) => v !== null) as [number[], number][];
  const weight = used.reduce((a, [, k]) => a + k, 0);
  return Object.fromEntries(players.map((p, i) => [String(p.memberId), toOdds(used.reduce((a, [v, k]) => a + v[i] * k, 0) / weight)]));
}

const dec = (n: number) => n.toFixed(1).replace('.', ',');

/** Pourquoi cette cote : la donnée qui pèse le plus pour chaque joueur, en une ligne. */
function why(id: 'scorer' | 'clumsy' | 'crack', p: FormPlayer, history: FormMatch[]): string {
  const played = history.filter((m) => m.players?.[p.memberId]);
  if (id === 'crack') {
    const motm = history.filter((m) => m.motm === p.memberId).length;
    return [p.voteCount ? `${p.voteCount} voix` : null, motm ? `${motm}× homme du match` : null,
      p.avgRating ? `note ${dec(p.avgRating)}` : null].filter(Boolean).join(' · ') || 'peu de données';
  }
  if (played.length === 0) return 'pas de match récent';
  const total = played.reduce((a, m) => a + m.players![p.memberId][id === 'scorer' ? 'goals' : 'missed'], 0);
  return `${dec(total / played.length)} ${id === 'scorer' ? 'but' : 'raté'}${total / played.length >= 2 ? 's' : ''} / match`;
}

const VERDICT_WORD = { win: 'la victoire', draw: 'le nul', loss: 'la défaite' } as const;

/** « Après la victoire 5-2 contre Team March » : le dernier match, en contexte. */
export function formReason(last: FormMatch | undefined) {
  return last ? `Après ${VERDICT_WORD[last.result]} ${last.goalsFor}-${last.goalsAgainst} contre ${last.opponent}` : null;
}

/** Bonus : tirage pondéré, en évitant celui de la session d'avant. */
const BONUS_WEIGHT: Partial<Record<MarketId, number>> = { cleansheet: 2, streak: 2, red: 1, ragequit: 1 };

export function drawBonus(avoid: MarketId[], random: () => number = Math.random, excluded: MarketId[] = []): MarketId {
  const allowed = BONUS_MARKETS.filter((id) => !excluded.includes(id));
  const fresh = allowed.filter((id) => !avoid.includes(id));
  const pool = fresh.length > 0 ? fresh : allowed;
  const total = pool.reduce((sum, id) => sum + (BONUS_WEIGHT[id] ?? 1), 0);
  let roll = random() * total;
  for (const id of pool) { roll -= BONUS_WEIGHT[id] ?? 1; if (roll < 0) return id; }
  return pool[pool.length - 1];
}

/**
 * Le ticket de la soirée : Bilan, Attaque, Buteur, Maladroit, Crack, Skill Rating et un bonus.
 * `previous` : les paris de la session d'avant (pour varier le bonus). `history` : du plus récent au plus ancien.
 */
export function openSession(previous: MarketId[], history: FormMatch[], players: FormPlayer[], random: () => number = Math.random): Opening {
  const recent = history.slice(0, 20);
  const known = recent.filter((m) => m.opponentQuit != null).length;
  const bonus = drawBonus(previous, random, known >= RAGEQUIT_MIN_KNOWN ? [] : ['ragequit']);
  const p = simulate(recent, players, random);
  const team = (id: MarketId): DrawnMarket => {
    const options = TEAM[id]!;
    return { id, options: options.map((o) => ({ ...o, odds: toOdds(p(`${id}:${o.id}`, options.length)), trend: 0 })) };
  };
  const byPlayer = (id: 'scorer' | 'clumsy'): DrawnMarket => ({
    id,
    options: players.map((pl) => ({ id: String(pl.memberId), label: pl.gamertag, odds: toOdds(p(`${id}:${pl.memberId}`, players.length)), trend: 0,
      why: why(id, pl, recent) }))
      .sort((a, b) => a.odds - b.odds),
  });
  const crackPrice = crackOdds(players, recent);
  const crack: DrawnMarket = { id: 'crack', options: players.map((pl) => ({ id: String(pl.memberId), label: pl.gamertag,
    odds: crackPrice[String(pl.memberId)], trend: 0, why: why('crack', pl, recent) })).sort((a, b) => a.odds - b.odds) };
  return {
    markets: [team('bilan'), team('attack'), byPlayer('scorer'), byPlayer('clumsy'), crack, team('sr'), team(bonus)],
    context: { reason: formReason(history[0]) },
  };
}

export type { Market };
