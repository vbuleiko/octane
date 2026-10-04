import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db, schema } from './db';
import type { Vehicle } from './db/schema';

export type VehicleCard = Vehicle & { cover: string | null; photoCount: number };
export type VehicleFull = Vehicle & { photos: { id: number; url: string }[] };

/** The few fields a listing card needs — keeps client payloads small. */
export type CardData = Pick<
  Vehicle,
  'id' | 'slug' | 'stockCode' | 'year' | 'make' | 'model' | 'variant' | 'price' | 'previousPrice' | 'mileage' | 'transmission' | 'fuelType' | 'bodyType' | 'status' | 'financeAvailable'
> & { cover: string | null };

export function toCard(v: VehicleCard): CardData {
  const { id, slug, stockCode, year, make, model, variant, price, previousPrice, mileage, transmission, fuelType, bodyType, status, financeAvailable, cover } = v;
  return { id, slug, stockCode, year, make, model, variant, price, previousPrice, mileage, transmission, fuelType, bodyType, status, financeAvailable, cover };
}

const PUBLIC_STATUSES = ['available', 'reserved'] as const;

function photosByVehicle(ids: number[]) {
  const map = new Map<number, { id: number; url: string }[]>();
  if (!ids.length) return map;
  const rows = db
    .select()
    .from(schema.vehiclePhotos)
    .where(inArray(schema.vehiclePhotos.vehicleId, ids))
    .orderBy(asc(schema.vehiclePhotos.vehicleId), asc(schema.vehiclePhotos.position), asc(schema.vehiclePhotos.id))
    .all();
  for (const r of rows) {
    const list = map.get(r.vehicleId) ?? [];
    list.push({ id: r.id, url: r.url });
    map.set(r.vehicleId, list);
  }
  return map;
}

function withCovers(rows: Vehicle[]): VehicleCard[] {
  const photos = photosByVehicle(rows.map((r) => r.id));
  return rows.map((r) => {
    const list = photos.get(r.id) ?? [];
    return { ...r, cover: list[0]?.url ?? null, photoCount: list.length };
  });
}

/** All vehicles visible on the website, newest first. Stock is small, so filtering happens in memory. */
export function publicVehicles(): VehicleCard[] {
  const rows = db
    .select()
    .from(schema.vehicles)
    .where(inArray(schema.vehicles.status, [...PUBLIC_STATUSES]))
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return withCovers(rows);
}

export const SORTS = {
  newest: 'Newest arrivals',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'km-asc': 'Lowest mileage',
  'year-desc': 'Newest year',
} as const;
export type SortKey = keyof typeof SORTS;

export type ShowroomFilters = {
  q?: string;
  make?: string;
  body?: string;
  fuel?: string;
  trans?: string;
  maxPrice?: number;
  minYear?: number;
  maxKm?: number;
  sort?: SortKey;
  page?: number;
};

export const PAGE_SIZE = 12;

export function parseFilters(sp: Record<string, string | string[] | undefined>): ShowroomFilters {
  const str = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const num = (k: string) => {
    const n = Number(str(k));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const sort = str('sort');
  return {
    q: str('q'),
    make: str('make'),
    body: str('body'),
    fuel: str('fuel'),
    trans: str('trans'),
    maxPrice: num('maxPrice'),
    minYear: num('minYear'),
    maxKm: num('maxKm'),
    sort: sort && sort in SORTS ? (sort as SortKey) : 'newest',
    page: num('page') ?? 1,
  };
}

function matches(v: VehicleCard, f: ShowroomFilters, skip?: keyof ShowroomFilters) {
  if (f.q && skip !== 'q') {
    const hay = `${v.year} ${v.make} ${v.model} ${v.variant} ${v.colour} ${v.stockCode}`.toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (f.make && skip !== 'make' && v.make !== f.make) return false;
  if (f.body && skip !== 'body' && v.bodyType !== f.body) return false;
  if (f.fuel && skip !== 'fuel' && v.fuelType !== f.fuel) return false;
  if (f.trans && skip !== 'trans' && v.transmission !== f.trans) return false;
  if (f.maxPrice && v.price > f.maxPrice) return false;
  if (f.minYear && v.year < f.minYear) return false;
  if (f.maxKm && v.mileage > f.maxKm) return false;
  return true;
}

function countBy(list: VehicleCard[], key: (v: VehicleCard) => string) {
  const m = new Map<string, number>();
  for (const v of list) {
    const k = key(v);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }));
}

export function searchShowroom(f: ShowroomFilters) {
  const all = publicVehicles();
  const filtered = all.filter((v) => matches(v, f));
  const sorters: Record<SortKey, (a: VehicleCard, b: VehicleCard) => number> = {
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'km-asc': (a, b) => a.mileage - b.mileage,
    'year-desc': (a, b) => b.year - a.year || b.createdAt.getTime() - a.createdAt.getTime(),
  };
  filtered.sort(sorters[f.sort ?? 'newest']);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page ?? 1), pages);
  return {
    total: all.length,
    count: filtered.length,
    page,
    pages,
    items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    facets: {
      make: countBy(all.filter((v) => matches(v, f, 'make')), (v) => v.make),
      body: countBy(all.filter((v) => matches(v, f, 'body')), (v) => v.bodyType),
      fuel: countBy(all.filter((v) => matches(v, f, 'fuel')), (v) => v.fuelType),
      trans: countBy(all.filter((v) => matches(v, f, 'trans')), (v) => v.transmission),
    },
  };
}

export function stockStats() {
  const all = publicVehicles();
  return {
    count: all.length,
    makes: new Set(all.map((v) => v.make)).size,
    minPrice: all.length ? Math.min(...all.map((v) => v.price)) : 0,
    byBody: countBy(all, (v) => v.bodyType).sort((a, b) => b.count - a.count),
    byMake: countBy(all, (v) => v.make).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
  };
}

export function getVehicleBySlug(slug: string): VehicleFull | null {
  const v = db.select().from(schema.vehicles).where(eq(schema.vehicles.slug, slug)).get();
  if (!v || v.status === 'draft') return null;
  return { ...v, photos: photosByVehicle([v.id]).get(v.id) ?? [] };
}

export function getVehicleById(id: number): VehicleFull | null {
  const v = db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).get();
  if (!v) return null;
  return { ...v, photos: photosByVehicle([v.id]).get(v.id) ?? [] };
}

export function getVehicleByStock(stockCode: string): VehicleFull | null {
  const v = db.select().from(schema.vehicles).where(eq(schema.vehicles.stockCode, stockCode)).get();
  if (!v) return null;
  return { ...v, photos: photosByVehicle([v.id]).get(v.id) ?? [] };
}

export function featuredVehicles(limit = 8) {
  const all = publicVehicles();
  const featured = all.filter((v) => v.featured);
  return [...featured, ...all.filter((v) => !v.featured)].slice(0, limit);
}

export function relatedVehicles(v: Vehicle, limit = 4) {
  const rows = db
    .select()
    .from(schema.vehicles)
    .where(and(inArray(schema.vehicles.status, [...PUBLIC_STATUSES]), ne(schema.vehicles.id, v.id)))
    .all();
  const score = (o: Vehicle) =>
    (o.bodyType === v.bodyType ? 0 : 1) * 1_000_000 + (o.make === v.make ? 0 : 200_000) + Math.abs(o.price - v.price);
  return withCovers(rows.sort((a, b) => score(a) - score(b)).slice(0, limit));
}

/** Every vehicle including sold and drafts, for the admin. */
export function adminVehicles(): VehicleCard[] {
  const rows = db.select().from(schema.vehicles).all().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return withCovers(rows);
}
