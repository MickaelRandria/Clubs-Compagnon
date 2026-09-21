import { createCoachHandler } from '../server/coach-http.js';
import { coachQuota } from '../server/db/ai-guards.js';

// POST /api/coach — guide et questions sur l'application par Mistral AI
export const POST = createCoachHandler(coachQuota).POST;
