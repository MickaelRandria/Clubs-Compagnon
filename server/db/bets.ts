import { sql } from 'drizzle-orm';
import { isBetsMode, playerOdds, type BetsState } from '../../shared/bets.js';
import type { BetsGame, BetsSettings } from '../bets-http.js';
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

async function dispatch(action: string, accountId: number, input: object, admin: boolean): Promise<BetsState> {
  const result = await getDb().execute(sql`select bets_dispatch(${action}, ${accountId}::integer, ${JSON.stringify(input)}::jsonb, ${admin}) as data`);
  const data = result.rows[0]?.data as BetsState & { error?: string; status?: number };
  if (data.error) throw new HttpError(data.status ?? 400, data.error);
  return data;
}

/** Cotes Crack / Casserole figées à l'ouverture, sur l'effectif actif (synchro EA). */
async function currentPlayerOdds() {
  const result = await getDb().execute(sql`
    select id, gamertag, avg_rating from members where club_id = (select min(id) from clubs) and is_active order by gamertag`);
  const players = result.rows.map((r) => ({ memberId: Number(r.id), gamertag: String(r.gamertag), avgRating: r.avg_rating === null ? null : Number(r.avg_rating) }));
  const crack = playerOdds(players, 'crack');
  const flop = playerOdds(players, 'flop');
  return players.map((p) => ({ memberId: p.memberId, gamertag: p.gamertag, crack: crack.get(p.memberId), flop: flop.get(p.memberId) }));
}

export const betsGame: BetsGame = {
  // La synchro EA d'abord : c'est elle qui fait arriver le match qui règle les paris.
  state: async (accountId, admin) => { await syncFromEa(); return dispatch('state', accountId, {}, admin); },
  play: (accountId, action) => dispatch(action.action, accountId, action, false),
  admin: async (accountId, action) => dispatch(action.action, accountId,
    action.action === 'open' ? { playerOdds: await currentPlayerOdds() } : action, true),
};
