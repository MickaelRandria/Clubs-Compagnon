import { fetchMatches } from '../../server/db/queries.js';
import { handle } from '../../server/http.js';

// GET /api/matches?limit=10 — derniers matchs, du plus récent au plus ancien
export function GET(request: Request) {
  return handle(async () => {
    const requested = Number(new URL(request.url).searchParams.get('limit') ?? 10);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 10;
    return Response.json(await fetchMatches(limit));
  });
}
