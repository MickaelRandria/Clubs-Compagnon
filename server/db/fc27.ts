import { sql } from 'drizzle-orm';
import { createFC27Service } from '../fc27-service.js';
import { getDb } from './client.js';

// The campaign lock serializes votes and manual closure in one DB transaction.
export const fc27Request = createFC27Service(async (name, payload, campaign) => {
  const rows = await getDb().execute(sql`select fc27_dispatch(${name}, ${payload}::jsonb, ${campaign}::integer) as data`);
  return rows.rows[0].data;
});
