import { sql } from 'drizzle-orm';
import { getDb } from '../server/db/client.js';
import { createProfileHandlers, createProfileService } from '../server/profile-http.js';

const service = createProfileService(async (action, accountId, input, admins) => {
  const result = await getDb().execute(sql`select club_profile_dispatch(${action}, ${accountId}::integer,
    ${input}::jsonb, ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(admins)}::jsonb))) as data`);
  return result.rows[0].data;
});
export const { GET, POST } = createProfileHandlers(service);
