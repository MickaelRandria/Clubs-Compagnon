import { fc27Request } from '../../server/db/fc27.js';
import { staffCache } from '../../server/db/staff.js';
import { createLookalikeHandler } from '../../server/lookalike-http.js';
import { createStaffHandler } from '../../server/staff-http.js';

// /api/fc27/lookalike et /api/fc27/report partagent une fonction Vercel : le plan Hobby
// plafonne à 12, et la place libérée sert à /api/bets. Les URL publiques ne changent pas.
const routes = new Map([
  ['lookalike', createLookalikeHandler().GET],
  ['report', createStaffHandler(fc27Request, staffCache).GET],
]);

export function GET(request: Request) {
  const action = /^\/api\/fc27\/([^/]+)\/?$/.exec(new URL(request.url).pathname)?.[1];
  const handler = action ? routes.get(action) : undefined;
  if (!handler) return Response.json({ error: 'Route FC 27 inconnue.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return handler(request);
}
