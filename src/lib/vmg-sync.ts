import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { vehicleSlug } from './format';
import type { ImportedVehicle } from './vmg';

export type SyncResult = { added: number; updated: number; markedSold: number };

/**
 * Applies a VMG import to our database.
 * - New stock codes are added (published, with their photos).
 * - Existing VMG vehicles get price, mileage and photos refreshed; anything edited in our admin
 *   (description, extras, featured, reserved status) is left alone.
 * - VMG vehicles that disappeared from the feed are marked as sold.
 * Vehicles created manually in the admin are never touched.
 */
export function applyVmgImport(list: ImportedVehicle[], opts: { markMissingSold?: boolean } = {}): SyncResult {
  const result: SyncResult = { added: 0, updated: 0, markedSold: 0 };
  const seen = new Set<string>();

  db.transaction((tx) => {
    for (const item of list) {
      seen.add(item.stockCode);
      const existing = tx.select().from(schema.vehicles).where(eq(schema.vehicles.stockCode, item.stockCode)).get();

      if (!existing) {
        const created = tx
          .insert(schema.vehicles)
          .values({
            stockCode: item.stockCode,
            slug: vehicleSlug(item),
            make: item.make,
            model: item.model,
            variant: item.variant,
            year: item.year,
            price: item.price,
            mileage: item.mileage,
            colour: item.colour,
            bodyType: item.bodyType,
            fuelType: item.fuelType,
            transmission: item.transmission,
            condition: item.condition,
            description: item.description,
            appendFooter: item.appendFooter,
            extras: item.extras,
            status: 'available',
            source: 'vmg',
            createdAt: new Date(item.listedAt),
            updatedAt: new Date(item.listedAt),
          })
          .returning({ id: schema.vehicles.id })
          .get();
        item.photos.forEach((url, position) => {
          tx.insert(schema.vehiclePhotos).values({ vehicleId: created.id, url, position }).run();
        });
        result.added++;
        continue;
      }

      if (existing.source !== 'vmg') continue;

      const changed = existing.price !== item.price || existing.mileage !== item.mileage || existing.status === 'sold';
      tx.update(schema.vehicles)
        .set({
          price: item.price,
          previousPrice: item.price < existing.price ? existing.price : existing.previousPrice,
          mileage: item.mileage,
          status: existing.status === 'sold' ? 'available' : existing.status,
          ...(changed ? { updatedAt: new Date() } : {}),
        })
        .where(eq(schema.vehicles.id, existing.id))
        .run();

      // Refresh photos only while the gallery is still the VMG one (no uploads in our admin).
      const photos = tx.select().from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, existing.id)).all();
      const hasUploads = photos.some((p) => p.url.startsWith('/media/'));
      if (!hasUploads && item.photos.length && photos.map((p) => p.url).join() !== item.photos.join()) {
        tx.delete(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, existing.id)).run();
        item.photos.forEach((url, position) => {
          tx.insert(schema.vehiclePhotos).values({ vehicleId: existing.id, url, position }).run();
        });
      }
      if (changed) result.updated++;
    }

    if (opts.markMissingSold) {
      const gone = tx
        .select({ id: schema.vehicles.id, stockCode: schema.vehicles.stockCode })
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.source, 'vmg'), inArray(schema.vehicles.status, ['available', 'reserved'])))
        .all()
        .filter((v) => !seen.has(v.stockCode));
      for (const v of gone) {
        tx.update(schema.vehicles).set({ status: 'sold', updatedAt: new Date() }).where(eq(schema.vehicles.id, v.id)).run();
        result.markedSold++;
      }
    }
  });

  return result;
}
