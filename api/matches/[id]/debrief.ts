import { createMatchDebriefHandler } from '../../../server/match-debrief-http.js';

// GET /api/matches/:id/debrief — analyse tactique par Mistral AI
export const GET = createMatchDebriefHandler().GET;

