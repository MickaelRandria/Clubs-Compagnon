import { fetchClub } from '../server/db/queries.js';
import { postDivisionStart } from '../server/division.js';
import { handle } from '../server/http.js';

// GET /api/club — club + tendance du skill rating + progression en division
export function GET() {
  return handle(async () => Response.json(await fetchClub()));
}

// POST /api/club { matchId } — un admin pose le début du suivi de la division (même fonction Vercel).
export function POST(request: Request) {
  return handle(() => postDivisionStart(request));
}
