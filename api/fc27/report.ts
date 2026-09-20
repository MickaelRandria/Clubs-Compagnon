import { fc27Request } from '../../server/db/fc27.js';
import { staffCache } from '../../server/db/staff.js';
import { createStaffHandler } from '../../server/staff-http.js';
const handlers = createStaffHandler(fc27Request, staffCache);
export const GET = handlers.GET;
