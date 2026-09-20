import type { FC27Action, FC27State } from '../shared/fc27.js';
import { HttpError } from './http.js';

export type FC27Request = (action: FC27Action | 'state', campaignId?: number) => Promise<FC27State>;
export function createFC27Service(execute: (name: string, payload: string, campaign: number | null) => Promise<unknown>): FC27Request {
  return async (action, campaignId) => {
    const name = typeof action === 'string' ? action : action.action;
    const payload = typeof action === 'string' ? {} : action;
    const requestedId = typeof action === 'string' ? campaignId ?? null : action.campaignId;
    const result = await execute(name, JSON.stringify(payload), requestedId) as FC27State | { error: string; status: number };
    if ('error' in result) throw new HttpError(result.status, result.error);
    return result;
  };
}
