import { sql } from 'drizzle-orm';
import { isBetsMode } from '../../shared/bets.js';
import type { BetsSettings } from '../bets-http.js';
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
  setMode: async (mode, accountId) => {
    await getDb().execute(sql`
      insert into app_settings(key, value, updated_by) values ('bets_mode', ${JSON.stringify(mode)}::jsonb, ${accountId})
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`);
  },
};
