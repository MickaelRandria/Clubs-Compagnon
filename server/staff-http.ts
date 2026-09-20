import type { FC27Request } from './fc27-service.js';
import { handle, HttpError } from './http.js';
import { StaffUnavailable, generateStaffReport } from './staff-mistral.js';
import { squadFingerprint, staffReportSchema, type StaffReport } from '../shared/staff-report.js';

// Route « lecture du staff ». Elle ne sert que de complément : quand le modèle n'est pas
// joignable ou pas configuré, elle répond `available: false` et la page affiche le rapport
// déterministe seul. Aucun message d'erreur technique n'atteint le vestiaire.

export interface StaffCache {
  read: (campaignId: number, hash: string) => Promise<{ payload: unknown; model: string; created_at: string } | undefined>;
  write: (campaignId: number, hash: string, report: StaffReport, model: string) => Promise<void>;
}

export type StaffResponse =
  | { available: false; reason: 'not-configured' | 'too-small' | 'failed' }
  | { available: true; cached: boolean; generatedAt: string; model: string; hash: string; report: StaffReport };

/** Nombre de fiches sous lequel une analyse rédigée n'apprendrait rien à personne. */
export const MIN_SQUAD = 3;

export function createStaffHandler(service: FC27Request, cache: StaffCache, options: {
  generate?: typeof generateStaffReport;
  hasKey?: () => boolean;
} = {}) {
  const generate = options.generate ?? generateStaffReport;
  const hasKey = options.hasKey ?? (() => Boolean(process.env.MISTRAL_API_KEY?.trim()));

  return {
    GET: (request: Request) => handle(async (): Promise<Response> => {
      const raw = new URL(request.url).searchParams.get('campaign');
      const id = raw === null ? undefined : Number(raw);
      if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647)) {
        throw new HttpError(400, 'Campagne invalide.');
      }

      const headers = { 'Cache-Control': 'no-store' };
      const reply = (body: StaffResponse) => Response.json(body, { headers });

      const state = await service('state', id);
      const players = state.players;
      if (players.length < MIN_SQUAD) return reply({ available: false, reason: 'too-small' });
      if (!hasKey()) return reply({ available: false, reason: 'not-configured' });

      const hash = squadFingerprint(players);
      const cached = await cache.read(state.campaign.id, hash).catch(() => undefined);
      if (cached) {
        const parsed = staffReportSchema.safeParse(cached.payload);
        // Une analyse en cache devenue illisible (schéma changé) est simplement régénérée.
        if (parsed.success) {
          return reply({
            available: true, cached: true, generatedAt: cached.created_at,
            model: cached.model, hash, report: parsed.data,
          });
        }
      }

      try {
        const { report, model } = await generate(players);
        // L'écriture du cache ne doit jamais faire échouer une analyse déjà produite.
        await cache.write(state.campaign.id, hash, report, model).catch(() => {});
        return reply({
          available: true, cached: false, generatedAt: new Date().toISOString(), model, hash, report,
        });
      } catch (error) {
        if (error instanceof StaffUnavailable) {
          // Tracé côté serveur uniquement : le vestiaire n'a pas à lire un message d'API.
          console.warn('[staff] analyse indisponible :', error.message, error.detail ? `
${error.detail}` : '');
          return reply({ available: false, reason: 'failed' });
        }
        throw error;
      }
    }),
  };
}
