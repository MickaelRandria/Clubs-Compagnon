import { fc27ActionSchema } from '../shared/fc27-validation.js';
import type { FC27Request } from './fc27-service.js';
import { handle, HttpError } from './http.js';
import { readSession } from './session.js';
import { requestOrigin } from './discord.js';

const headers = { 'Cache-Control': 'no-store' };
export function createFC27Handlers(service: FC27Request, isAdmin: (accountId: number) => Promise<boolean>) {
  return {
    GET: (request: Request) => handle(async () => {
      const raw = new URL(request.url).searchParams.get('campaign');
      const id = raw === null ? undefined : Number(raw);
      if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)) throw new HttpError(400, 'Campagne invalide.');
      // Le compte (facultatif) sert seulement à renvoyer le bulletin du visiteur.
      return Response.json(await service('state', id, readSession(request)), { headers });
    }),
    POST: (request: Request) => handle(async () => {
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord pour participer.');
      const origin = request.headers.get('origin');
      if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
      const payload: unknown = await request.json().catch(() => { throw new HttpError(400, 'JSON invalide.'); });
      const result = fc27ActionSchema.safeParse(payload);
      if (!result.success) throw new HttpError(400, 'Vérifie les champs du formulaire.', result.error.flatten().fieldErrors);
      if (['start', 'advance', 'close', 'archive', 'reset'].includes(result.data.action) && !await isAdmin(accountId)) {
        throw new HttpError(403, 'Les réglages FC 27 sont réservés à l’administrateur du club.');
      }
      // L'identité vient du cookie signé, pas du corps de la requête.
      return Response.json(await service(result.data, undefined, accountId), { headers });
    }),
  };
}
