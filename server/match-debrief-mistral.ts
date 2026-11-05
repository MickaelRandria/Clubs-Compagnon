import type { MatchDetail, MatchNote, Member } from '../shared/types.js';
import {
  MATCH_DEBRIEF_JSON_SCHEMA,
  MATCH_DEBRIEF_SYSTEM,
  buildMatchDebriefPrompt,
  draftedDebriefSchema,
  sanitizeMatchDebrief,
  type MatchDebrief,
} from '../shared/match-debrief.js';
import { StaffUnavailable, mistralJson } from './staff-mistral.js';

export interface DebriefResult {
  debrief: MatchDebrief;
  model: string;
}

/** Un débrief par appel : le cache durable (Neon, par empreinte) est géré par match-debrief-http. */
export async function generateMatchDebrief(
  detail: MatchDetail,
  members: Member[],
  notes: MatchNote[],
  options: { apiKey?: string; fetchImpl?: typeof fetch; model?: string; timeoutMs?: number } = {},
): Promise<DebriefResult> {
  const { parsed, raw, model } = await mistralJson({
    ...options,
    system: MATCH_DEBRIEF_SYSTEM,
    user: buildMatchDebriefPrompt(detail, notes),
    schema: MATCH_DEBRIEF_JSON_SCHEMA,
    schemaName: 'debrief_match',
    maxTokens: 1600,
  });

  const result = draftedDebriefSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`).join(' | ');
    throw new StaffUnavailable('Le modèle n’a pas respecté le format de débrief attendu.', `${issues}\n--- brut ---\n${raw.slice(0, 1500)}`);
  }
  return { debrief: sanitizeMatchDebrief(result.data, detail, notes, members), model };
}
