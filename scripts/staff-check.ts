/**
 * Vérifie la « Lecture du staff » de bout en bout, avec la vraie clé.
 *
 *   npm run staff:check            → liste les modèles du compte et fait UNE génération réelle
 *   npm run staff:check -- --list  → liste seulement, aucun appel de génération
 *
 * La clé n'est jamais affichée, ni en clair ni dans un message d'erreur.
 */
import { loadLocalEnv } from '../server/env.js';
import { fc27Request } from '../server/db/fc27.js';
import { MODELS_ENDPOINT, generateStaffReport, staffModel } from '../server/staff-mistral.js';
import { squadFingerprint } from '../shared/staff-report.js';

loadLocalEnv();

const key = process.env.MISTRAL_API_KEY?.trim();
const hide = (text: string) => (key && key.length > 6 ? text.split(key).join('[clé masquée]') : text);

if (!key) {
  console.error([
    '[ARRÊT] MISTRAL_API_KEY absente.',
    'Ajoute-la dans .env.local (et enregistre le fichier) :',
    '',
    '  MISTRAL_API_KEY="ta-clé"',
    '',
    'Sans elle, l’app fonctionne : le rapport déterministe s’affiche seul.',
  ].join('\n'));
  process.exit(1);
}
console.log(`Clé détectée (${key.length} caractères, jamais affichée).`);

// ---- Modèles réellement exposés par ce compte ----
const models = await fetch(MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${key}` } });
if (!models.ok) {
  console.error(`[ARRÊT] Mistral a répondu ${models.status} à la liste des modèles.`);
  console.error(hide((await models.text()).slice(0, 400)));
  process.exit(1);
}
const listed = (await models.json() as { data: { id: string; capabilities?: Record<string, unknown> }[] }).data;
const chat = listed
  .filter((m) => !/embed|ocr|moderation|rerank/i.test(m.id))
  .map((m) => m.id)
  .sort();
console.log(`\n${chat.length} modèles de conversation sur ce compte :`);
for (const id of chat) console.log(`  ${id}`);

const wanted = staffModel();
console.log(`\nModèle configuré : ${wanted}`);
if (!chat.includes(wanted)) {
  const near = chat.filter((id) => /minist|mini|small/i.test(id));
  console.error(`[ARRÊT] « ${wanted} » n’est pas exposé par ce compte.`);
  if (near.length > 0) console.error(`Candidats « mini » disponibles : ${near.join(', ')}`);
  console.error('Renseigne MISTRAL_MODEL dans .env.local avec un identifiant de la liste ci-dessus.');
  process.exit(1);
}
console.log('→ disponible.');

if (process.argv.includes('--list')) process.exit(0);

// ---- Une génération réelle sur l'effectif du club ----
const state = await fc27Request('state');
console.log(`\nEffectif : ${state.players.length} fiche(s) · empreinte ${squadFingerprint(state.players)}`);
if (state.players.length < 3) {
  console.log('Moins de 3 fiches : la route ne déclenche aucune analyse. Rien d’autre à vérifier.');
  process.exit(0);
}

console.log('Génération en cours (un appel facturé au palier gratuit)…\n');
const started = Date.now();
try {
  const { report, model } = await generateStaffReport(state.players);
  console.log(`✓ Réponse valide de ${model} en ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
  console.log(`ACCROCHE   ${report.headline}\n`);
  console.log(`LECTURE    ${report.reading}\n`);
  console.log('PRIORITÉS');
  report.priorities.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.need}`);
    console.log(`     ${p.why}`);
    if (p.stopgap) console.log(`     En attendant : ${p.stopgap}`);
  });
  console.log('\nCONSIGNES');
  for (const entry of report.players) console.log(`  ${entry.pseudo} : ${entry.advice}`);
} catch (error) {
  console.error(`[ÉCHEC] ${hide((error as Error).message)}`);
  const detail = (error as { detail?: string }).detail;
  if (detail) console.error(`
--- diagnostic ---
${hide(detail)}`);
  console.error('\nEn production, ce cas est silencieux : la page affiche le rapport déterministe seul.');
  process.exit(1);
}
