import { validateNote } from '../../../shared/notes.js';
import { addMatchNote } from '../../../server/db/queries.js';
import { handle, HttpError, idAfter } from '../../../server/http.js';

// POST /api/matches/:id/notes — ajoute une note à un match existant
export function POST(request: Request) {
  return handle(async () => {
    const matchId = idAfter(request, 'matches');
    const payload: unknown = await request.json().catch(() => {
      throw new HttpError(400, 'Le corps de la requête doit être du JSON.');
    });
    const result = validateNote(payload);
    if (!result.ok) throw new HttpError(400, 'Certains champs sont invalides.', result.errors);
    return Response.json(await addMatchNote(matchId, result.data), { status: 201 });
  });
}
