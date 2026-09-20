import { fc27ActionSchema } from '../shared/fc27-validation.js';
import type { FC27Request } from './fc27-service.js';
import { handle, HttpError } from './http.js';

const headers = { 'Cache-Control': 'no-store' };
export function createFC27Handlers(service: FC27Request) {
  return {
    GET: (request: Request) => handle(async () => {
      const raw = new URL(request.url).searchParams.get('campaign');
      const id = raw === null ? undefined : Number(raw);
      if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)) throw new HttpError(400, 'Campagne invalide.');
      return Response.json(await service('state', id), { headers });
    }),
    POST: (request: Request) => handle(async () => {
      const payload: unknown = await request.json().catch(() => { throw new HttpError(400, 'JSON invalide.'); });
      const result = fc27ActionSchema.safeParse(payload);
      if (!result.success) throw new HttpError(400, 'Vérifie les champs du formulaire.', result.error.flatten().fieldErrors);
      return Response.json(await service(result.data), { headers });
    }),
  };
}
