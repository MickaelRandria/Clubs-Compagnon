import type { FC27Action, FC27State } from '../shared/fc27.js';
import { HttpError } from './http.js';

/**
 * `accountId` vient TOUJOURS de la session lue côté serveur, jamais du corps de la requête :
 * un client qui l'enverrait pourrait écrire la fiche de quelqu'un d'autre. Il est donc
 * absent du schéma zod et injecté ici, après validation.
 */
export type FC27Request = (action: FC27Action | 'state', campaignId?: number, accountId?: number | null) => Promise<FC27State>;
export function createFC27Service(execute: (name: string, payload: string, campaign: number | null) => Promise<unknown>): FC27Request {
  return async (action, campaignId, accountId) => {
    const name = typeof action === 'string' ? action : action.action;
    const payload = typeof action === 'string' ? {} : { ...action, accountId: accountId ?? null };
    const requestedId = typeof action === 'string' ? campaignId ?? null : action.campaignId;
    const result = await execute(name, JSON.stringify(payload), requestedId) as FC27State | { error: string; status: number };
    if ('error' in result) throw new HttpError(result.status, result.error);
    return result;
  };
}
