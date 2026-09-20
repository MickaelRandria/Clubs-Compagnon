import { handle, HttpError } from './http.js';
import { StaffUnavailable, mistralJson } from './staff-mistral.js';
import {
  LOOKUP_JSON_SCHEMA, LOOKUP_SYSTEM, lookupPrompt, lookupSchema, validateLookup,
} from '../shared/lookalike-lookup.js';
import { searchLookalikes } from '../shared/data/lookalikes.js';
import type { Lookalike } from '../shared/data/lookalikes.js';

// Recherche d'un joueur absent de la liste curée. La liste reste prioritaire :
// on n'interroge le modèle que si elle ne donne rien.

export type LookupResponse =
  | { found: false; reason: 'not-configured' | 'unknown' | 'failed' }
  | { found: true; source: 'curated' | 'model'; entry: Lookalike };

export function createLookalikeHandler(options: {
  call?: typeof mistralJson;
  hasKey?: () => boolean;
} = {}) {
  const call = options.call ?? mistralJson;
  const hasKey = options.hasKey ?? (() => Boolean(process.env.MISTRAL_API_KEY?.trim()));

  return {
    GET: (request: Request) => handle(async (): Promise<Response> => {
      const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
      if (query.length < 2 || query.length > 60) throw new HttpError(400, 'Recherche trop courte ou trop longue.');
      const headers = { 'Cache-Control': 'no-store' };
      const reply = (body: LookupResponse) => Response.json(body, { headers });

      // La liste vérifiée passe toujours avant le modèle.
      const curated = searchLookalikes(query, 1)[0];
      if (curated) return reply({ found: true, source: 'curated', entry: curated });
      if (!hasKey()) return reply({ found: false, reason: 'not-configured' });

      try {
        const { parsed } = await call({
          system: LOOKUP_SYSTEM,
          user: lookupPrompt(query),
          schema: LOOKUP_JSON_SCHEMA,
          schemaName: 'joueur_de_reference',
          maxTokens: 700,
        });
        const shape = lookupSchema.safeParse(parsed);
        if (!shape.success) return reply({ found: false, reason: 'unknown' });
        const entry = validateLookup(shape.data);
        // Incohérent ou déclaré incertain par le modèle : mieux vaut « pas trouvé » qu'une fiche fausse.
        return entry ? reply({ found: true, source: 'model', entry }) : reply({ found: false, reason: 'unknown' });
      } catch (error) {
        if (error instanceof StaffUnavailable) {
          console.warn('[lookalike] recherche indisponible :', error.message);
          return reply({ found: false, reason: 'failed' });
        }
        throw error;
      }
    }),
  };
}
