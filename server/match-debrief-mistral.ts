import type { Match, MatchNote, Member } from '../shared/types.js';
import {
  MATCH_DEBRIEF_JSON_SCHEMA,
  MATCH_DEBRIEF_SYSTEM,
  buildMatchDebriefPrompt,
  matchDebriefSchema,
  sanitizeMatchDebrief,
  type MatchDebrief,
} from '../shared/match-debrief.js';
import { StaffUnavailable, mistralJson } from './staff-mistral.js';

export interface DebriefResult {
  debrief: MatchDebrief;
  model: string;
}

// Cache en mémoire pour éviter de re-générer inutilement un débrief d'un match identique
const debriefCache = new Map<number, { debrief: MatchDebrief; model: string; generatedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

export async function generateMatchDebrief(
  match: Match,
  members: Member[],
  notes: MatchNote[],
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    model?: string;
    timeoutMs?: number;
    forceFresh?: boolean;
  } = {},
): Promise<DebriefResult> {
  const cached = debriefCache.get(match.id);
  if (!options.forceFresh && cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return { debrief: cached.debrief, model: cached.model };
  }

  const { parsed, raw: content, model } = await mistralJson({
    ...options,
    system: MATCH_DEBRIEF_SYSTEM,
    user: buildMatchDebriefPrompt(match, members, notes),
    schema: MATCH_DEBRIEF_JSON_SCHEMA,
    schemaName: 'debrief_match',
    maxTokens: 1000,
  });

  const parsedResult = matchDebriefSchema.safeParse(parsed);
  if (!parsedResult.success) {
    const issues = parsedResult.error.issues
      .map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join(' | ');
    throw new StaffUnavailable(
      'Le modèle n’a pas respecté le format de débrief attendu.',
      `${issues}\n--- brut ---\n${content.slice(0, 1500)}`,
    );
  }

  const sanitized = sanitizeMatchDebrief(parsedResult.data, members);
  debriefCache.set(match.id, { debrief: sanitized, model, generatedAt: Date.now() });

  return { debrief: sanitized, model };
}
