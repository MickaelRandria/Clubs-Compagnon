import { sql } from 'drizzle-orm';
import type { StaffCache } from '../staff-http.js';
import { getDb } from './client.js';

/** Cache Neon des analyses, une ligne par (campagne, composition). */
export const staffCache: StaffCache = {
  read: async (campaignId, hash) => {
    const rows = await getDb().execute(sql`
      select payload, model, created_at from fc27_staff_reports
      where campaign_id = ${campaignId} and squad_hash = ${hash} limit 1`);
    return rows.rows[0] as { payload: unknown; model: string; created_at: string } | undefined;
  },
  write: async (campaignId, hash, report, model) => {
    await getDb().execute(sql`
      insert into fc27_staff_reports(campaign_id, squad_hash, payload, model)
      values (${campaignId}, ${hash}, ${JSON.stringify(report)}::jsonb, ${model})
      on conflict (campaign_id, squad_hash) do nothing`);
  },
};
