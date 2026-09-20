import { fetchClub } from '../server/db/queries.js';
import { handle } from '../server/http.js';

// GET /api/club — club + tendance du skill rating
export function GET() {
  return handle(async () => Response.json(await fetchClub()));
}
