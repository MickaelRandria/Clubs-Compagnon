import type { FC27Player } from '../shared/fc27.js';
import {
  STAFF_JSON_SCHEMA, STAFF_SYSTEM, buildStaffPrompt, sanitizeReport, staffReportSchema, type StaffReport,
} from '../shared/staff-report.js';

// Appel au modèle Mistral. `fetchImpl` est injectable pour que tout soit testable sans clé,
// comme scripts/generate-assets.js. Aucune erreur ne remonte à l'utilisateur : le rapport
// déterministe s'affiche seul quand cette couche échoue.

const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
export const MODELS_ENDPOINT = 'https://api.mistral.ai/v1/models';

/**
 * Modèle par défaut : un « mini », les seuls au palier gratuit.
 * 14B retenu après comparaison réelle avec 8B le 2026-09-19 : le 8B rédige une phrase
 * là où on attend une étiquette de poste. Le 14B glisse en revanche plus de formatage
 * et de pseudos déformés — d'où le nettoyage de `sanitizeReport`.
 * Surchargeable par MISTRAL_MODEL sans toucher au code — les identifiants Mistral changent
 * plus vite que ce fichier. `npm run staff:check` liste ceux que le compte expose vraiment.
 */
export const STAFF_MODEL = 'ministral-14b-latest';
export const staffModel = () => process.env.MISTRAL_MODEL?.trim() || STAFF_MODEL;

export interface StaffResult {
  report: StaffReport;
  model: string;
}

/**
  * Indisponibilité de la couche modèle. `detail` sert au diagnostic côté serveur
  * (log, `npm run staff:check`) et n'est jamais affiché dans l'app.
  */
export class StaffUnavailable extends Error {
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.detail = detail;
  }
}

/** Ne jamais laisser une clé fuir dans un log ou un message d'erreur. */
const scrub = (message: string, key: string | undefined) =>
  (key && key.length > 6 ? message.split(key).join('[clé masquée]') : message);

export interface MistralCall {
  system: string;
  user: string;
  schema: unknown;
  schemaName: string;
  maxTokens?: number;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  timeoutMs?: number;
}

/**
 * Un appel Mistral qui renvoie du JSON. Commun au rapport du staff et à la recherche de joueur :
 * même gestion de la clé, du délai, des erreurs HTTP et du JSON illisible.
 * Ne valide pas le contenu — c'est à l'appelant de le faire avec son propre schéma zod.
 */
export async function mistralJson(call: MistralCall): Promise<{ parsed: unknown; raw: string; model: string }> {
  const apiKey = call.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey?.trim()) throw new StaffUnavailable('MISTRAL_API_KEY absente.');
  const model = call.model ?? staffModel();
  const doFetch = call.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: call.maxTokens ?? 2000,
        messages: [{ role: 'system', content: call.system }, { role: 'user', content: call.user }],
        response_format: { type: 'json_schema', json_schema: { name: call.schemaName, strict: true, schema: call.schema } },
      }),
      signal: AbortSignal.timeout(call.timeoutMs ?? 45_000),
    });
  } catch (error) {
    throw new StaffUnavailable(scrub(`Appel Mistral impossible : ${(error as Error).message}`, apiKey));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new StaffUnavailable(scrub(`Mistral a répondu ${response.status}. ${detail.slice(0, 300)}`, apiKey));
  }

  const payload = await response.json().catch(() => null) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new StaffUnavailable('Réponse Mistral sans contenu exploitable.');

  try {
    return { parsed: JSON.parse(content), raw: content, model };
  } catch {
    throw new StaffUnavailable('Le modèle n’a pas renvoyé du JSON.', content.slice(0, 1500));
  }
}

export async function generateStaffReport(players: FC27Player[], options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  timeoutMs?: number;
} = {}): Promise<StaffResult> {
  const apiKey = options.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey?.trim()) throw new StaffUnavailable('MISTRAL_API_KEY absente.');
  if (players.length === 0) throw new StaffUnavailable('Aucune fiche à analyser.');

  const { parsed, raw: content, model } = await mistralJson({
    ...options,
    system: STAFF_SYSTEM,
    user: buildStaffPrompt(players),
    schema: STAFF_JSON_SCHEMA,
    schemaName: 'rapport_staff',
  });

  const result = staffReportSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(racine)'} : ${issue.message}`)
      .join(' | ');
    throw new StaffUnavailable('Le modèle n’a pas respecté le format attendu.', `${issues}
--- brut ---
${content.slice(0, 1500)}`);
  }

  return { report: sanitizeReport(result.data, players), model };
}
