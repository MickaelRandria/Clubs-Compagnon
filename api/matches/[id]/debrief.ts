import { debriefCache } from '../../../server/db/ai-guards.js';
import { createMatchDebriefHandler } from '../../../server/match-debrief-http.js';

// GET /api/matches/:id/debrief — analyse tactique par Mistral AI
export const GET = createMatchDebriefHandler(debriefCache).GET;
