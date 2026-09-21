import {
  COACH_JSON_SCHEMA,
  COACH_SYSTEM,
  buildCoachPrompt,
  coachResponseSchema,
  getDeterministicCoachFallback,
  type CoachResponse,
} from '../shared/coach-assistant.js';
import type { Club, Member } from '../shared/types.js';
import { fetchClub, fetchMembers } from './db/queries.js';
import { HttpError, handle } from './http.js';
import { StaffUnavailable, mistralJson } from './staff-mistral.js';

export interface CoachHttpResult {
  response: CoachResponse;
  source: 'model' | 'fallback';
  model?: string;
}

export function createCoachHandler(options: {
  call?: typeof mistralJson;
  hasKey?: () => boolean;
} = {}) {
  const call = options.call ?? mistralJson;
  const hasKey = options.hasKey ?? (() => Boolean(process.env.MISTRAL_API_KEY?.trim()));

  return {
    POST: (request: Request) =>
      handle(async (): Promise<Response> => {
        const body: unknown = await request.json().catch(() => {
          throw new HttpError(400, 'Le corps de la requête doit être du JSON.');
        });

        if (typeof body !== 'object' || body === null || !('question' in body)) {
          throw new HttpError(400, 'Paramètre "question" obligatoire.');
        }

        const question = String((body as { question: unknown }).question).trim();
        if (question.length < 2 || question.length > 500) {
          throw new HttpError(400, 'La question doit faire entre 2 et 500 caractères.');
        }

        const rawHistory = typeof body === 'object' && body !== null && 'history' in body
          ? (body as Record<string, unknown>).history
          : undefined;
        const history = Array.isArray(rawHistory)
          ? (rawHistory as { role?: unknown; content?: unknown }[])
              .filter(
                (h): h is { role: 'user' | 'assistant'; content: string } =>
                  h !== null &&
                  typeof h === 'object' &&
                  (h.role === 'user' || h.role === 'assistant') &&
                  typeof h.content === 'string',
              )
              .slice(-6)
          : undefined;

        let club: Club | null = null;
        let members: Member[] = [];
        try {
          [club, members] = await Promise.all([fetchClub(), fetchMembers()]);
        } catch {
          // Erreur DB non bloquante : le coach reste capable de guider sur l'application
        }

        const headers = { 'Cache-Control': 'no-store' };
        const reply = (res: CoachHttpResult) => Response.json(res, { headers });

        if (!hasKey()) {
          return reply({
            response: getDeterministicCoachFallback(question, club, members),
            source: 'fallback',
          });
        }

        try {
          const { parsed, model } = await call({
            system: COACH_SYSTEM,
            user: buildCoachPrompt(question, club, members, history),
            schema: COACH_JSON_SCHEMA,
            schemaName: 'coach_response',
            maxTokens: 800,
          });

          const validated = coachResponseSchema.safeParse(parsed);
          if (!validated.success) {
            console.warn('[coach] format invalide renvoyé par le modèle, bascule sur le fallback');
            return reply({
              response: getDeterministicCoachFallback(question, club, members),
              source: 'fallback',
            });
          }

          return reply({
            response: validated.data,
            source: 'model',
            model,
          });
        } catch (error) {
          if (error instanceof StaffUnavailable) {
            console.warn('[coach] modèle indisponible :', error.message);
            return reply({
              response: getDeterministicCoachFallback(question, club, members),
              source: 'fallback',
            });
          }
          throw error;
        }
      }),
  };
}
