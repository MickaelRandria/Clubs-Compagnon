import { sql } from 'drizzle-orm';
import type { CoachQuota } from '../coach-http.js';
import type { DebriefCache } from '../match-debrief-http.js';
import { getDb } from './client.js';

/** Cache Neon des débriefs, une ligne par (match, état des notes). */
export const debriefCache: DebriefCache = {
  read: async (matchId, hash) => {
    const rows = await getDb().execute(sql`
      select payload, model from match_debriefs
      where match_id = ${matchId} and input_hash = ${hash} limit 1`);
    return rows.rows[0] as { payload: unknown; model: string } | undefined;
  },
  write: async (matchId, hash, debrief, model) => {
    await getDb().execute(sql`
      insert into match_debriefs(match_id, input_hash, payload, model)
      values (${matchId}, ${hash}, ${JSON.stringify(debrief)}::jsonb, ${model})
      on conflict (match_id, input_hash) do nothing`);
  },
};

/**
 * Plafond du coach, en une seule requête : l'incrément n'a lieu que sous la limite.
 * Deux onglets qui envoient en même temps ne peuvent donc pas franchir le plafond —
 * au-delà, la ligne n'est pas mise à jour et rien n'est renvoyé.
 */
export const coachQuota: CoachQuota = {
  consume: async (accountId, limit) => {
    const rows = await getDb().execute(sql`
      insert into ai_usage(account_id, day, calls) values (${accountId}, current_date, 1)
      on conflict (account_id, day) do update set calls = ai_usage.calls + 1
        where ai_usage.calls < ${limit}
      returning calls`);
    return rows.rows.length > 0;
  },
};
