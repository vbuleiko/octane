/** Saves the current VMG stock (with photos, extras and descriptions) to data/vmg-snapshot.json for offline seeding. */
import fs from 'node:fs';
import { importFromVmg, VMG_FEED_URL } from '../src/lib/vmg';

const vehicles = await importFromVmg();
fs.writeFileSync(
  'data/vmg-snapshot.json',
  JSON.stringify({ source: VMG_FEED_URL, fetchedAt: new Date().toISOString(), count: vehicles.length, vehicles }, null, 2) + '\n',
);
console.log(`Saved ${vehicles.length} vehicles to data/vmg-snapshot.json`);
