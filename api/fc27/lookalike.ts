import { createLookalikeHandler } from '../../server/lookalike-http.js';
const handlers = createLookalikeHandler();
export const GET = handlers.GET;
