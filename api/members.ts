import { fetchMembers } from '../server/db/queries.js';
import { handle } from '../server/http.js';

// GET /api/members — joueurs actifs du club
export function GET() {
  return handle(async () => Response.json(await fetchMembers()));
}
