import { sql } from 'drizzle-orm';
import { isBetsMode, type BetSession, type BetsState, type Market, type MarketId } from '../../shared/bets.js';
import { openSession, openWindow, type FormMatch, type FormPlayer, type LiveState } from '../../shared/bets-odds.js';
import type { BetsGame, BetsSettings, PhotoStore } from '../bets-http.js';
import { syncFromEa } from '../ea-sync.js';
import { HttpError } from '../http.js';
import { getDb } from './client.js';

/** Table absente : la migration 0013 n'est pas encore appliquée sur cette base. */
function missingTable(err: unknown): boolean {
  for (let e: unknown = err; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '42P01') return true;
  }
  return false;
}

export const betsSettings: BetsSettings = {
  // En cas de doute, la fonctionnalité reste fermée : une base sans la table répond `off`.
  mode: async () => {
    try {
      const result = await getDb().execute(sql`select value from app_settings where key = 'bets_mode' limit 1`);
      const value = result.rows[0]?.value;
      return isBetsMode(value) ? value : 'off';
    } catch (err) {
      if (missingTable(err)) return 'off';
      throw err;
    }
  },
  live: async () => {
    try {
      const result = await getDb().execute(sql`
        select status from bet_fixtures where status in ('open', 'locked', 'voting')
        order by case status when 'open' then 0 when 'locked' then 1 else 2 end limit 1`);
      const status = result.rows[0]?.status;
      return status === 'open' || status === 'locked' || status === 'voting' ? status : null;
    } catch (err) {
      if (missingTable(err)) return null;
      throw err;
    }
  },
  setMode: async (mode, accountId) => {
    await getDb().execute(sql`
      insert into app_settings(key, value, updated_by) values ('bets_mode', ${JSON.stringify(mode)}::jsonb, ${accountId})
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`);
  },
};

async function dispatch(action: string, accountId: number, input: object, admin: boolean, present = true): Promise<BetsState> {
  // Présence dans la salle d'attente : l'écran relit l'état toutes les 15 s tant qu'il est ouvert.
  if (present) await getDb().execute(sql`update credit_wallets set seen_at = now() where account_id = ${accountId}`);
  const result = await getDb().execute(sql`select bets_dispatch(${action}, ${accountId}::integer, ${JSON.stringify(input)}::jsonb, ${admin}) as data`);
  const data = result.rows[0]?.data as BetsState & { error?: string; status?: number };
  if (data.error) throw new HttpError(data.status ?? 400, data.error);
  return data;
}

interface StatsRow { gamertag?: string; rating?: number; goals?: number; shots?: number; redCards?: number; motm?: boolean }

/** Une soirée de vote pèse 0,7 fois la suivante : la dernière compte le plus. */
const VOTE_DECAY = 0.7;
/** Présents dans le salon FoodBet : écran ouvert ces 10 dernières minutes. */
const LOBBY = '10 minutes';

/**
 * Les paris de la session (six fixes et un bonus tiré au sort) et leurs cotes, simulées sur les
 * 20 derniers matchs EA. Les joueurs proposés sont ceux présents dans le salon à l'ouverture (au
 * moins deux) ; à défaut, ceux vus sur les 10 derniers matchs, sinon tout l'effectif actif.
 */
/** La forme du club : les 20 derniers matchs, l'effectif, les présents du salon, les voix des votes passés. */
async function loadForm() {
  const db = getDb();
  const [matchRows, memberRows, previousRows, lobbyRows, voteRows] = await Promise.all([
    db.execute(sql`select opponent_name, result, goals_for, goals_against, player_stats, opponent_quit from matches
      where club_id = (select min(id) from clubs) order by played_at desc limit 20`),
    db.execute(sql`select id, gamertag, avg_rating from members where club_id = (select min(id) from clubs) and is_active order by gamertag`),
    db.execute(sql`select coalesce((select jsonb_agg(m->>'id') from jsonb_array_elements(markets) m), '[]'::jsonb) as markets
      from bet_fixtures where markets is not null order by id desc limit 1`),
    db.execute(sql.raw(`select distinct c.member_id from credit_wallets w
      join club_player_claims c on c.account_id = w.account_id and c.status = 'approved'
      where w.seen_at > now() - interval '${LOBBY}'`)),
    // Les voix du Crack des 10 dernières soirées réglées, la plus récente d'abord.
    db.execute(sql`select v.member_id, dense_rank() over (order by f.id desc) as rank from bet_votes v
      join bet_fixtures f on f.id = v.fixture_id
      where v.category = 'crack' and f.status = 'settled' and f.id in (select id from bet_fixtures where status = 'settled' order by id desc limit 10)`),
  ]);
  const byTag = new Map(memberRows.rows.map((r) => [String(r.gamertag), Number(r.id)]));
  const history: FormMatch[] = matchRows.rows.map((r) => {
    const stats = (r.player_stats ?? null) as StatsRow[] | null;
    const ratings: Record<number, number> = {};
    const scorers: number[] = [];
    const byPlayer: Record<number, { goals: number; missed: number }> = {};
    for (const p of stats ?? []) {
      const id = byTag.get(String(p.gamertag));
      if (id === undefined) continue;
      if (p.rating) ratings[id] = Number(p.rating);
      const goals = Number(p.goals) || 0;
      if (goals > 0) scorers.push(id);
      byPlayer[id] = { goals, missed: Math.max(0, (Number(p.shots) || 0) - goals) };
    }
    const motm = (stats ?? []).find((p) => p.motm);
    return { opponent: String(r.opponent_name), result: r.result as FormMatch['result'], goalsFor: Number(r.goals_for),
      goalsAgainst: Number(r.goals_against), redCard: stats && stats.length ? stats.some((p) => Number(p.redCards) > 0) : null,
      opponentQuit: r.opponent_quit === null ? null : Boolean(r.opponent_quit), ratings,
      motm: motm ? byTag.get(String(motm.gamertag)) ?? null : null, ...(stats && stats.length ? { scorers, players: byPlayer } : {}) };
  });
  const votes = new Map<number, number>();
  const voteCount = new Map<number, number>();
  for (const r of voteRows.rows) {
    const id = Number(r.member_id);
    votes.set(id, (votes.get(id) ?? 0) + VOTE_DECAY ** (Number(r.rank) - 1));
    voteCount.set(id, (voteCount.get(id) ?? 0) + 1);
  }
  const lobby = new Set(lobbyRows.rows.map((r) => Number(r.member_id)));
  const recent = new Set(history.slice(0, 10).flatMap((m) => Object.keys(m.ratings).map(Number)));
  const roster = memberRows.rows.map((r) => ({ memberId: Number(r.id), gamertag: String(r.gamertag),
    avgRating: r.avg_rating === null ? null : Number(r.avg_rating), votes: votes.get(Number(r.id)) ?? 0, voteCount: voteCount.get(Number(r.id)) ?? 0 }));
  const present = roster.filter((p) => lobby.has(p.memberId));
  const players: FormPlayer[] = present.length >= 2 ? present
    : roster.filter((p, _, all) => recent.size === 0 || recent.has(p.memberId) || all.every((q) => !recent.has(q.memberId)));
  return { history, roster, lobby, players, previous: (previousRows.rows[0]?.markets ?? []) as MarketId[] };
}

export async function buildOpening() {
  const form = await loadForm();
  return openSession(form.previous, form.history, form.players);
}

const PLAYER_MARKETS = new Set(['crack', 'flop', 'scorer', 'clumsy']);

/**
 * Le guichet : les paris de la session recotés sur la soirée en cours. Les joueurs proposés : ceux
 * du ticket, ceux qui ont joué ce soir et les retardataires présents dans le salon.
 */
export async function buildWindow() {
  const db = getDb();
  const [form, fixtureRows] = await Promise.all([loadForm(),
    db.execute(sql`select id, markets, locked_at, bets_session(id) as s from bet_fixtures where status = 'locked' order by id desc limit 1`)]);
  const row = fixtureRows.rows[0];
  if (!row) return {};
  const s = row.s as BetSession;
  const markets = (row.markets ?? []) as Market[];
  const results = await db.execute(sql`select result from matches where club_id = (select min(id) from clubs)
    and played_at > ${row.locked_at} order by played_at desc`);
  let run = 0;
  for (const r of results.rows) { if (r.result !== 'win') break; run++; }
  const ids = new Set([...markets.filter((m) => PLAYER_MARKETS.has(m.id)).flatMap((m) => m.options.map((o) => Number(o.id))),
    ...form.lobby, ...s.players.map((p) => p.memberId)]);
  // La note EA de la soirée prime sur la moyenne de la saison pour coter le Crack.
  const players: FormPlayer[] = form.roster.filter((p) => ids.has(p.memberId))
    .map((p) => ({ ...p, avgRating: s.players.find((x) => x.memberId === p.memberId)?.rating ?? p.avgRating }));
  const live: LiveState = {
    matches: s.matches, wins: s.wins, losses: s.losses, goalsFor: s.goalsFor, cleanSheets: s.cleanSheets, reds: s.reds,
    ragequits: s.ragequits, bestStreak: s.bestStreak, run,
    srDelta: s.srStart !== null && s.srNow !== null ? s.srNow - s.srStart : null,
    goals: Object.fromEntries(s.players.map((p) => [p.memberId, p.goals])), missed: Object.fromEntries(s.players.map((p) => [p.memberId, p.missed])),
  };
  return { markets: openWindow(markets, live, form.history, players) };
}

export const betsGame: BetsGame = {
  // La synchro EA d'abord : c'est elle qui fait arriver le match qui règle les paris.
  state: async (accountId, admin, peek = false) => { await syncFromEa(); return dispatch('state', accountId, {}, admin, !peek); },
  play: (accountId, action) => dispatch(action.action, accountId, action, false),
  admin: async (accountId, action) => {
    // Fin de session ou suivi : on va chercher les derniers matchs chez EA tout de suite, sans
    // attendre les 5 minutes. `check` ne fait que ça, puis relit l'état.
    if (action.action === 'end-session' || action.action === 'check' || action.action === 'window') await syncFromEa({ force: true });
    if (action.action === 'check') return dispatch('state', accountId, {}, true);
    if (action.action === 'window') return dispatch('window', accountId, await buildWindow(), true);
    return dispatch(action.action, accountId, action.action === 'open' ? await buildOpening() : action, true);
  },
};

/** Photos des joueurs (player_photos, drizzle/0027) : une data URL WebP par joueur, envoyée depuis l'app. */
export const photoStore: PhotoStore = {
  list: async () => {
    const rows = await getDb().execute(sql`select m.gamertag, p.member_id, floor(extract(epoch from p.updated_at))::bigint as v
      from player_photos p join members m on m.id = p.member_id`);
    return Object.fromEntries(rows.rows.map((r) => [String(r.gamertag), `/api/bets/photo?m=${r.member_id}&v=${r.v}`]));
  },
  get: async (memberId) => {
    const rows = await getDb().execute(sql`select image from player_photos where member_id = ${memberId}`);
    return rows.rows[0] ? String(rows.rows[0].image) : null;
  },
  save: async (accountId, image) => {
    const claim = await getDb().execute(sql`select member_id from club_player_claims where account_id = ${accountId} and status = 'approved' limit 1`);
    const memberId = claim.rows[0]?.member_id;
    if (memberId === undefined) throw new HttpError(403, 'Relie d’abord ton compte à ton joueur (page Profil).');
    await getDb().execute(sql`insert into player_photos(member_id, image, account_id) values (${memberId}, ${image}, ${accountId})
      on conflict (member_id) do update set image = excluded.image, account_id = excluded.account_id, updated_at = now()`);
  },
};
