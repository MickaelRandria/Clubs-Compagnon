import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { HttpError } from '../http.js';
import * as schema from './schema.js';

let db: NeonHttpDatabase<typeof schema> | undefined;

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new HttpError(503, "DATABASE_URL n'est pas définie. Copie .env.example en .env.local et renseigne la chaîne Neon.");
    db = drizzle({ client: neon(url), schema });
  }
  return db;
}
