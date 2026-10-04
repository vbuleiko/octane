/**
 * Fills the database with Octane Auto's real stock.
 *   npm run db:seed          – from data/vmg-snapshot.json (works offline)
 *   npm run db:seed -- --live – straight from the live VMG feed
 * Also creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD if none exists.
 */
import './env';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { inArray } from 'drizzle-orm';
import { hashPassword } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';
import { importFromVmg, type ImportedVehicle } from '../src/lib/vmg';
import { applyVmgImport } from '../src/lib/vmg-sync';

const live = process.argv.includes('--live');
const list: ImportedVehicle[] = live
  ? await importFromVmg()
  : JSON.parse(fs.readFileSync('data/vmg-snapshot.json', 'utf8')).vehicles;

const result = applyVmgImport(list);
console.log(`Vehicles: ${result.added} added, ${result.updated} updated (${live ? 'live feed' : 'snapshot'})`);

if (result.added) {
  const featured = ['OA460', 'OA438', 'OA412', 'OA411', 'OA310', 'OA107', 'OA446', 'OA260'];
  db.update(schema.vehicles).set({ featured: true }).where(inArray(schema.vehicles.stockCode, featured)).run();
}

if (!db.select().from(schema.users).get()) {
  const email = (process.env.ADMIN_EMAIL || 'admin@octaneauto.co.za').toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password || password === 'change-me') {
    password = crypto.randomBytes(9).toString('base64url');
    console.log(`Generated admin password (save it): ${password}`);
  }
  db.insert(schema.users).values({ email, name: 'Conrad', passwordHash: await hashPassword(password) }).run();
  console.log(`Admin account: ${email}`);
}
