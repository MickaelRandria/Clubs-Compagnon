import { migrate } from 'drizzle-orm/neon-http/migrator';
import { loadLocalEnv } from '../env.js';
import { getDb } from './client.js';

loadLocalEnv();

await migrate(getDb(), { migrationsFolder: 'drizzle' });
console.log('✔ Migrations appliquées.');
