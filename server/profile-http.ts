import { profileActionSchema, type ClubProfile, type ProfileAction } from '../shared/profile.js';
import { handle, HttpError } from './http.js';
import { readSession } from './session.js';
import { requestOrigin } from './discord.js';
import { adminDiscordIds } from './admin.js';

type Execute = (action: string, accountId: number, input: string, admins: string[]) => Promise<unknown>;
export function createProfileService(execute: Execute) {
  return async (accountId: number, action: ProfileAction | 'state'): Promise<ClubProfile> => {
    const result = await execute(action === 'state' ? 'state' : action.action, accountId,
      JSON.stringify(action === 'state' ? {} : action), adminDiscordIds()) as ClubProfile & { error?: string; status?: number };
    if (result.error) throw new HttpError(result.status ?? 400, result.error);
    return result;
  };
}
export function createProfileHandlers(service: ReturnType<typeof createProfileService>) {
  const respond = async (request: Request, mutate: boolean) => {
    const response = await handle(async () => {
      const accountId = readSession(request);
      if (accountId === null) throw new HttpError(401, 'Connecte-toi avec Discord pour retrouver ton joueur.');
      let action: ProfileAction | 'state' = 'state';
      if (mutate) {
        const origin = request.headers.get('origin');
        if (origin && origin !== requestOrigin(request)) throw new HttpError(403, 'Cette action doit être envoyée depuis le site.');
        const input: unknown = await request.json().catch(() => { throw new HttpError(400, 'JSON invalide.'); });
        const parsed = profileActionSchema.safeParse(input);
        if (!parsed.success) throw new HttpError(400, 'Vérifie les champs de la demande.');
        action = parsed.data;
      }
      return Response.json(await service(accountId, action));
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
  return { GET: (request: Request) => respond(request, false), POST: (request: Request) => respond(request, true) };
}
