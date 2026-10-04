import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

// Resolved at runtime on the server; excluded from build-time file tracing on purpose.
export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_DIR || 'storage');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');

function createDb() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const sqlite = new Database(path.join(STORAGE_DIR, 'octane.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), 'drizzle') });
  return db;
}

type Db = ReturnType<typeof createDb>;

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { octaneDb?: Db };
export const db: Db = globalForDb.octaneDb ?? (globalForDb.octaneDb = createDb());

export { schema };
