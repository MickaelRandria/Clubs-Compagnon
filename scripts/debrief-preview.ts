// Aperçu d'un débrief de match, sans rien écrire en base : npx tsx scripts/debrief-preview.ts <matchId> [--prompt]
import { loadLocalEnv } from '../server/env.js';
loadLocalEnv();
const { fetchMatchDetail, fetchMembers } = await import('../server/db/queries.js');
const { generateMatchDebrief } = await import('../server/match-debrief-mistral.js');
const { buildMatchDebriefPrompt } = await import('../shared/match-debrief.js');

const id = Number(process.argv[2]);
const [detail, members] = await Promise.all([fetchMatchDetail(id), fetchMembers()]);
if (process.argv.includes('--prompt')) console.log(buildMatchDebriefPrompt(detail, detail.notes), '\n---');
const { debrief, model } = await generateMatchDebrief(detail, members, detail.notes);
console.log(model);
console.log(JSON.stringify(debrief, null, 2));
