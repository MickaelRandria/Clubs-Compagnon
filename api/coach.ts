import { createCoachHandler } from '../server/coach-http.js';

// POST /api/coach — guide et questions sur l'application par Mistral AI
export const POST = createCoachHandler().POST;

