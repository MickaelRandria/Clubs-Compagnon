import type { Market, MarketId, MarketOption } from './bets.js';

// Les paris d'une soirée : deux paris d'équipe tirés au sort, le Crack et le Buteur, les mêmes pour tout le monde.
//
// Les cotes viennent de l'historique du club (fréquences sur les 20 derniers matchs) et
// bougent avec la forme : le dernier match pèse le plus lourd. La flèche affichée à côté
// de chaque cote compare avec les cotes calculées sans ce dernier match — c'est l'effet
// du résultat précédent, et la phrase de contexte le dit en clair.

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
}

export interface FormPlayer { memberId: number; gamertag: string; avgRating: number | null }

/** Option de pari : `trend` = écart de cote dû au dernier match (positif = la cote monte). */
export interface DrawnOption extends MarketOption { trend: number }
export interface DrawnMarket { id: MarketId; options: DrawnOption[] }
export interface Opening { markets: DrawnMarket[]; context: { reason: string | null } }

const MARGIN = 1.08;
export const ODDS_MIN = 1.15;
export const ODDS_MAX = 9.5;
const DECAY = 0.85;
const LAST_BOOST = 2;
const DEFAULT_RATING = 6.5;

export const toOdds = (p: number) => Math.round(Math.min(ODDS_MAX, Math.max(ODDS_MIN, 1 / (Math.max(p, 0.001) * MARGIN))) * 20) / 20;

/** Poids de chaque match, du plus récent au plus ancien : le dernier compte double. */
const weights = (n: number) => Array.from({ length: n }, (_, i) => DECAY ** i * (i === 0 ? LAST_BOOST : 1));

/** Probabilités lissées (une observation fictive par issue) à partir des issues pondérées. */
function probabilities<T extends string>(outcomes: T[], history: T[]): Record<T, number> {
  const w = weights(history.length);
  const score = Object.fromEntries(outcomes.map((o) => [o, 1])) as Record<T, number>;
  history.forEach((o, i) => { score[o] += w[i]; });
  const total = outcomes.reduce((sum, o) => sum + score[o], 0);
  return Object.fromEntries(outcomes.map((o) => [o, score[o] / total])) as Record<T, number>;
}

const goalsBucket = (goals: number) => (goals <= 1 ? '0-1' : goals <= 3 ? '2-3' : '4+');

const againstBucket = (goals: number) => (goals === 0 ? '0' : goals <= 2 ? '1-2' : '3+');

type Labeled = { id: string; label: string };
const FIXED: Record<'verdict' | 'goals' | 'against' | 'cleansheet' | 'red' | 'ragequit', Labeled[]> = {
  verdict: [{ id: 'win', label: 'Victoire' }, { id: 'draw', label: 'Nul' }, { id: 'loss', label: 'Défaite' }],
  goals: [{ id: '0-1', label: '0 ou 1' }, { id: '2-3', label: '2 ou 3' }, { id: '4+', label: '4 et plus' }],
  against: [{ id: '0', label: 'Aucun' }, { id: '1-2', label: '1 ou 2' }, { id: '3+', label: '3 et plus' }],
  cleansheet: [{ id: 'oui', label: 'Oui' }, { id: 'non', label: 'Non' }],
  red: [{ id: 'oui', label: 'Oui' }, { id: 'non', label: 'Non' }],
  ragequit: [{ id: 'oui', label: 'Oui' }, { id: 'non', label: 'Non' }],
};

const yesNo = (value: boolean) => (value ? 'oui' : 'non');

function teamOdds(id: keyof typeof FIXED, history: FormMatch[]): Record<string, number> {
  const ids = FIXED[id].map((o) => o.id);
  const seen = id === 'verdict' ? history.map((m) => m.result)
    : id === 'goals' ? history.map((m) => goalsBucket(m.goalsFor))
    : id === 'against' ? history.map((m) => againstBucket(m.goalsAgainst))
    : id === 'cleansheet' ? history.map((m) => yesNo(m.goalsAgainst === 0))
    : id === 'red' ? history.flatMap((m) => (m.redCard === null ? [] : [yesNo(m.redCard)]))
    : history.flatMap((m) => (m.opponentQuit == null ? [] : [yesNo(m.opponentQuit)]));
  const p = probabilities(ids, seen);
  return Object.fromEntries(ids.map((o) => [o, toOdds(p[o])]));
}

/** Crack : forme récente (moyenne saison et dernière note EA). Casserole : l'inverse. */
function playerOddsFrom(kind: 'crack' | 'flop', players: FormPlayer[], last: FormMatch | undefined): Record<string, number> {
  const form = players.map((p) => {
    const season = p.avgRating ?? DEFAULT_RATING;
    const recent = last?.ratings[p.memberId];
    const rating = recent === undefined ? season : season * 0.6 + recent * 0.4;
    const w = Math.max(0.25, (rating - 5) ** 2);
    return kind === 'crack' ? w : 1 / w;
  });
  const total = form.reduce((a, b) => a + b, 0);
  return Object.fromEntries(players.map((p, i) => [String(p.memberId), toOdds(form[i] / total)]));
}

/** Buteur : part pondérée des matchs joués où le joueur a marqué. Plusieurs joueurs peuvent gagner. */
function scorerOdds(players: FormPlayer[], history: FormMatch[]): Record<string, number> {
  const w = weights(history.length);
  return Object.fromEntries(players.map((p) => {
    let played = 0, scored = 0;
    history.forEach((m, i) => {
      if (m.scorers === undefined || m.ratings[p.memberId] === undefined) return;
      played += w[i];
      if (m.scorers.includes(p.memberId)) scored += w[i];
    });
    return [String(p.memberId), toOdds((scored + 0.5) / (played + 1.5))];
  }));
}

const VERDICT_WORD = { win: 'la victoire', draw: 'le nul', loss: 'la défaite' } as const;

/** « Après la victoire 5-2 contre Team March » : ce qui fait bouger les cotes. */
export function formReason(last: FormMatch | undefined) {
  return last ? `Après ${VERDICT_WORD[last.result]} ${last.goalsFor}-${last.goalsAgainst} contre ${last.opponent}` : null;
}

/** Cotes d'un pari, avec l'effet du dernier match (`trend`). `history` : du plus récent au plus ancien. */
export function priceMarket(id: MarketId, history: FormMatch[], players: FormPlayer[]): DrawnMarket {
  const recent = history.slice(0, 20);
  const before = recent.slice(1);
  if (id === 'crack' || id === 'flop' || id === 'scorer') {
    const now = id === 'scorer' ? scorerOdds(players, recent) : playerOddsFrom(id, players, recent[0]);
    const prev = id === 'scorer' ? scorerOdds(players, before) : playerOddsFrom(id, players, undefined);
    const options = players.map((p) => ({ id: String(p.memberId), label: p.gamertag, odds: now[String(p.memberId)],
      trend: Math.round((now[String(p.memberId)] - prev[String(p.memberId)]) * 100) / 100 }));
    return { id, options: options.sort((a, b) => a.odds - b.odds) };
  }
  const now = teamOdds(id, recent);
  const prev = teamOdds(id, before);
  return { id, options: FIXED[id].map((o) => ({ ...o, odds: now[o.id], trend: Math.round((now[o.id] - prev[o.id]) * 100) / 100 })) };
}

/** Paris d'équipe tirés au sort à chaque rencontre. Tirage pondéré, en évitant ceux de la rencontre d'avant. */
const POOL: [MarketId, number][] = [['verdict', 3], ['goals', 3], ['against', 2], ['cleansheet', 2], ['red', 1], ['ragequit', 1]];
/** Paris d'équipe par rencontre, en plus du Crack et du Buteur. */
export const TEAM_BETS = 2;

/** Matchs à l'issue connue qu'il faut avant de coter un abandon : en dessous, la cote serait du hasard. */
export const RAGEQUIT_MIN_KNOWN = 10;

/** `avoid` : à éviter si possible (la rencontre d'avant) ; `excluded` : jamais (déjà tirés, pas cotables). */
export function drawMarket(avoid: MarketId[], random: () => number = Math.random, excluded: MarketId[] = []): MarketId {
  const allowed = POOL.filter(([id]) => !excluded.includes(id));
  const fresh = allowed.filter(([id]) => !avoid.includes(id));
  const pool = fresh.length > 0 ? fresh : allowed;
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [id, w] of pool) { roll -= w; if (roll < 0) return id; }
  return pool[pool.length - 1][0];
}

/**
 * FoodBet : deux paris d'équipe tirés au sort, le Crack du match (tranché par le vote du club)
 * et le Buteur (réglé par la feuille de match). `previous` : les paris d'équipe de la rencontre d'avant.
 */
export function openMatchBet(previous: MarketId[], history: FormMatch[], players: FormPlayer[], random: () => number = Math.random): Opening {
  const known = history.filter((m) => m.opponentQuit != null).length;
  const never: MarketId[] = known >= RAGEQUIT_MIN_KNOWN ? [] : ['ragequit'];
  const team: MarketId[] = [];
  for (let i = 0; i < TEAM_BETS; i++) team.push(drawMarket(previous, random, [...never, ...team]));
  const markets = ([...team, 'crack', 'scorer'] as MarketId[]).map((id) => priceMarket(id, history, players));
  return { markets, context: { reason: formReason(history[0]) } };
}

export type { Market };
