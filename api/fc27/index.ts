import { fc27Request } from '../../server/db/fc27.js';
import { createFC27Handlers } from '../../server/fc27-http.js';
const handlers = createFC27Handlers(fc27Request);
export const GET = handlers.GET;
export const POST = handlers.POST;
