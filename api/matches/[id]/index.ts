import { fetchMatchDetail } from '../../../server/db/queries.js';
import { handle, idAfter } from '../../../server/http.js';

// GET /api/matches/:id — un match et ses notes
export function GET(request: Request) {
  return handle(async () => Response.json(await fetchMatchDetail(idAfter(request, 'matches'))));
}
