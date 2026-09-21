import { createHash } from 'node:crypto';
import { matchDebriefSchema, type MatchDebrief } from '../shared/match-debrief.js';
import type { Match, MatchNote, Member } from '../shared/types.js';
import { fetchMatchDetail, fetchMembers } from './db/queries.js';
import { handle, idAfter } from './http.js';
import { generateMatchDebrief } from './match-debrief-mistral.js';
import { readSession } from './session.js';
import { StaffUnavailable } from './staff-mistral.js';

export type MatchDebriefResponse =
  | { available: false; reason: 'not-configured' | 'failed' | 'sign-in' }
  | { available: true; debrief: MatchDebrief; model: string };

/** Débriefs déjà rédigés, un par (match, état des notes). Implémenté sur Neon dans db/ai-guards. */
export interface DebriefCache {
  read(matchId: number, hash: string): Promise<{ payload: unknown; model: string } | undefined>;
  write(matchId: number, hash: string, debrief: MatchDebrief, model: string): Promise<void>;
}

/** À incrémenter quand le format du débrief change : les anciens ne sont plus relus. */
const DEBRIEF_VERSION = 'debrief-v1';

/**
 * Tout ce qui change le débrief, et rien d'autre : les stats du match et ses notes.
 * Une note ajoutée ou corrigée donne une nouvelle empreinte, donc une nouvelle lecture ;
 * un rechargement de la page retombe sur la même, donc sur le cache.
 */
export function debriefInputHash(match: Match, notes: MatchNote[]): string {
  const stats = [match.id, match.type, match.opponent, match.goalsFor, match.goalsAgainst,
    match.result, match.possessionPct, match.shots];
  const lignes = [...notes]
    .sort((a, b) => a.id - b.id)
    .map((n) => [n.id, n.body, [...n.tags].sort().join('+'), n.motm?.id ?? '', n.videoUrl ?? '']);
  return createHash('sha256')
    .update(JSON.stringify([DEBRIEF_VERSION, stats, lignes]))
    .digest('hex')
    .slice(0, 40);
}

type Loaded = { match: Match; notes: MatchNote[]; members: Member[] };

const loadFromDb = async (matchId: number): Promise<Loaded> => {
  const [{ match, notes }, members] = await Promise.all([fetchMatchDetail(matchId), fetchMembers()]);
  return { match, notes, members };
};

export function createMatchDebriefHandler(cache: DebriefCache, options: {
  generate?: typeof generateMatchDebrief;
  hasKey?: () => boolean;
  load?: (matchId: number) => Promise<Loaded>;
  session?: (request: Request) => number | null;
} = {}) {
  const generate = options.generate ?? generateMatchDebrief;
  const hasKey = options.hasKey ?? (() => Boolean(process.env.MISTRAL_API_KEY?.trim()));
  const load = options.load ?? loadFromDb;
  const session = options.session ?? readSession;

  return {
    GET: (request: Request) =>
      handle(async (): Promise<Response> => {
        const matchId = idAfter(request, 'matches');
        const headers = { 'Cache-Control': 'no-store' };
        const reply = (body: MatchDebriefResponse) => Response.json(body, { headers });

        const { match, notes, members } = await load(matchId);
        const hash = debriefInputHash(match, notes);

        // Un débrief déjà rédigé ne coûte plus rien : il reste lisible par tout le monde,
        // connecté ou non. Une ligne illisible (format changé) est simplement ignorée.
        const cached = await cache.read(matchId, hash).catch(() => undefined);
        if (cached) {
          const parsed = matchDebriefSchema.safeParse(cached.payload);
          if (parsed.success) return reply({ available: true, debrief: parsed.data, model: cached.model });
        }

        if (!hasKey()) return reply({ available: false, reason: 'not-configured' });

        // Seul un compte connecté déclenche un appel facturé. Sans cela, un robot passant
        // sur les 800 fiches de match épuiserait le quota Mistral en une visite — et avec
        // lui le rapport du staff, qui partage la même clé.
        if (session(request) === null) return reply({ available: false, reason: 'sign-in' });

        try {
          const { debrief, model } = await generate(match, members, notes);
          // Écriture non bloquante : un cache en panne ne doit pas priver du débrief.
          await cache.write(matchId, hash, debrief, model).catch((error) => {
            console.warn(`[debrief] cache non écrit pour le match #${matchId} :`, error);
          });
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
