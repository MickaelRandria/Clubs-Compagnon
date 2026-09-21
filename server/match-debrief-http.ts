import type { MatchDebrief } from '../shared/match-debrief.js';
import { fetchMatchDetail, fetchMembers } from './db/queries.js';
import { handle, idAfter } from './http.js';
import { generateMatchDebrief } from './match-debrief-mistral.js';
import { StaffUnavailable } from './staff-mistral.js';

export type MatchDebriefResponse =
  | { available: false; reason: 'not-configured' | 'failed' }
  | { available: true; debrief: MatchDebrief; model: string };

export function createMatchDebriefHandler(options: {
  generate?: typeof generateMatchDebrief;
  hasKey?: () => boolean;
} = {}) {
  const generate = options.generate ?? generateMatchDebrief;
  const hasKey = options.hasKey ?? (() => Boolean(process.env.MISTRAL_API_KEY?.trim()));

  return {
    GET: (request: Request) =>
      handle(async (): Promise<Response> => {
        const matchId = idAfter(request, 'matches');
        const headers = { 'Cache-Control': 'no-store' };
        const reply = (body: MatchDebriefResponse) => Response.json(body, { headers });

        if (!hasKey()) return reply({ available: false, reason: 'not-configured' });

        try {
          const [{ match, notes }, members] = await Promise.all([
            fetchMatchDetail(matchId),
            fetchMembers(),
          ]);

          const { debrief, model } = await generate(match, members, notes);
          return reply({ available: true, debrief, model });
        } catch (error) {
          if (error instanceof StaffUnavailable) {
            console.warn(`[debrief] indisponible pour le match #${matchId} :`, error.message);
            return reply({ available: false, reason: 'failed' });
          }
          throw error;
        }
      }),
  };
}

