import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const VEHICLE_STATUSES = ['available', 'reserved', 'sold', 'draft'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const LEAD_TYPES = ['enquiry', 'finance', 'workshop', 'tradein', 'contact'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_STATUSES = ['new', 'in_progress', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
};

export const vehicles = sqliteTable(
  'vehicles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stockCode: text('stock_code').notNull().unique(),
    slug: text('slug').notNull().unique(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    variant: text('variant').notNull().default(''),
    year: integer('year').notNull(),
    price: integer('price').notNull(),
    previousPrice: integer('previous_price'),
    mileage: integer('mileage').notNull().default(0),
    colour: text('colour').notNull().default(''),
    bodyType: text('body_type').notNull().default(''),
    fuelType: text('fuel_type').notNull().default(''),
    transmission: text('transmission').notNull().default(''),
    condition: text('condition').notNull().default('Excellent'),
    description: text('description').notNull().default(''),
    appendFooter: integer('append_footer', { mode: 'boolean' }).notNull().default(true),
    extras: text('extras', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    status: text('status', { enum: VEHICLE_STATUSES }).notNull().default('available'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    financeAvailable: integer('finance_available', { mode: 'boolean' }).notNull().default(true),
    source: text('source', { enum: ['manual', 'vmg'] }).notNull().default('manual'),
    ...timestamps,
  },
  (t) => [index('vehicles_status_idx').on(t.status), index('vehicles_make_idx').on(t.make)],
);

export const vehiclePhotos = sqliteTable(
  'vehicle_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('vehicle_photos_vehicle_idx').on(t.vehicleId, t.position)],
);

export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: LEAD_TYPES }).notNull(),
    status: text('status', { enum: LEAD_STATUSES }).notNull().default('new'),
    name: text('name').notNull(),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    message: text('message').notNull().default(''),
    vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
    data: text('data', { mode: 'json' }).$type<Record<string, string>>().notNull().default(sql`'{}'`),
    notes: text('notes').notNull().default(''),
    ...timestamps,
  },
  (t) => [index('leads_type_status_idx').on(t.type, t.status)],
);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type VehiclePhoto = typeof vehiclePhotos.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type User = typeof users.$inferSelect;
