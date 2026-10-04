'use server';

import { eq, inArray, like } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { endSession, hashPassword, requireAdmin, startSession, verifyCredentials } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { LEAD_STATUSES, VEHICLE_STATUSES, type LeadStatus, type VehicleStatus } from '@/lib/db/schema';
import { vehicleSlug } from '@/lib/format';
import { DEFAULT_SETTINGS, saveSettings, type Settings } from '@/lib/settings';
import { deleteUpload, saveImage, UploadError } from '@/lib/uploads';
import { importFromVmg } from '@/lib/vmg';
import { applyVmgImport } from '@/lib/vmg-sync';

export type ActionState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

/* ---------- Auth ---------- */

const loginAttempts = new Map<string, { count: number; until: number }>();

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const lock = loginAttempts.get(email);
  if (lock && lock.until > Date.now()) return { ok: false, message: 'Too many attempts. Try again in a few minutes.' };

  const user = await verifyCredentials(email, password);
  if (!user) {
    const count = (lock?.count ?? 0) + 1;
    loginAttempts.set(email, { count, until: count >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { ok: false, message: 'Wrong email or password.' };
  }
  loginAttempts.delete(email);
  await startSession(user);
  redirect('/admin');
}

export async function logout() {
  await endSession();
  redirect('/admin/login');
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  if (next.length < 8) return { ok: false, message: 'The new password must be at least 8 characters.' };
  const user = db.select().from(schema.users).where(eq(schema.users.id, me.id)).get();
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return { ok: false, message: 'Current password is wrong.' };
  db.update(schema.users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(schema.users.id, me.id)).run();
  return { ok: true, message: 'Password changed.' };
}

/* ---------- Vehicles ---------- */

const int = (min: number, max: number, msg: string) =>
  z.preprocess((v) => Number(String(v ?? '').replace(/[^\d]/g, '')), z.number({ message: msg }).int().min(min, msg).max(max, msg));

const vehicleInput = z.object({
  stockCode: z.string().trim().max(20).optional().default(''),
  make: z.string().trim().min(1, 'Make is required').max(60),
  model: z.string().trim().min(1, 'Model is required').max(80),
  variant: z.string().trim().max(120).default(''),
  year: int(1950, new Date().getFullYear() + 1, 'Enter a valid year'),
  price: int(1000, 50_000_000, 'Enter the price in rand'),
  previousPrice: z.preprocess((v) => {
    const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
    return n > 0 ? n : null;
  }, z.number().int().nullable()),
  mileage: int(0, 2_000_000, 'Enter the mileage in km'),
  colour: z.string().trim().max(40).default(''),
  bodyType: z.string().trim().max(40).default(''),
  fuelType: z.string().trim().max(40).default(''),
  transmission: z.string().trim().max(40).default(''),
  condition: z.string().trim().max(40).default('Excellent'),
  description: z.string().trim().max(8000).default(''),
  status: z.enum(VEHICLE_STATUSES),
});

function nextStockCode() {
  const codes = db.select({ c: schema.vehicles.stockCode }).from(schema.vehicles).where(like(schema.vehicles.stockCode, 'OA%')).all();
  const max = codes.reduce((m, { c }) => Math.max(m, Number(c.replace(/\D/g, '')) || 0), 0);
  return `OA${max + 1}`;
}

export async function saveVehicle(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = Number(form.get('id')) || null;
  const parsed = vehicleInput.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: 'Please fix the highlighted fields.', errors };
  }
  const input = parsed.data;
  const extras = [...new Set(form.getAll('extras').map((e) => String(e).trim()).filter(Boolean))];
  let photos: string[] = [];
  try {
    photos = JSON.parse(String(form.get('photos') || '[]'));
  } catch {
    return { ok: false, message: 'Photo list was corrupted, please reload the page.' };
  }
  // Only our own uploads and the VMG photo bucket can be rendered by next/image.
  photos = photos.filter((u) => typeof u === 'string' && (u.startsWith('/media/vehicles/') || u.startsWith('https://s3-eu-west-1.amazonaws.com/vmg.images.production/')));
  const flags = {
    featured: form.get('featured') === 'on',
    appendFooter: form.get('appendFooter') === 'on',
    financeAvailable: form.get('financeAvailable') === 'on',
  };
  const stockCode = (input.stockCode || nextStockCode()).toUpperCase();

  const clash = db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.stockCode, stockCode)).get();
  if (clash && clash.id !== id) return { ok: false, message: 'Another vehicle already uses this stock code.', errors: { stockCode: 'Already in use' } };

  const values = { ...input, stockCode, extras, ...flags, slug: vehicleSlug({ ...input, stockCode }), updatedAt: new Date() };

  let vehicleId = id;
  const removed: string[] = [];
  db.transaction((tx) => {
    if (vehicleId) {
      const before = tx.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).get();
      if (!before) throw new Error('Vehicle not found');
      // Keep previousPrice automatically when the price drops and nobody set it explicitly.
      const previousPrice = values.previousPrice ?? (values.price < before.price ? before.price : null);
      tx.update(schema.vehicles).set({ ...values, previousPrice }).where(eq(schema.vehicles.id, vehicleId)).run();
      const old = tx.select().from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, vehicleId)).all();
      removed.push(...old.map((p) => p.url).filter((u) => !photos.includes(u)));
      tx.delete(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, vehicleId)).run();
    } else {
      vehicleId = tx.insert(schema.vehicles).values({ ...values, source: 'manual' }).returning({ id: schema.vehicles.id }).get().id;
    }
    photos.forEach((url, position) => tx.insert(schema.vehiclePhotos).values({ vehicleId: vehicleId!, url, position }).run());
  });
  await Promise.all(removed.map(deleteUpload));

  revalidatePath('/', 'layout');
  if (!id) redirect(`/admin/inventory/${vehicleId}?created=1`);
  return { ok: true, message: 'Saved. Changes are live on the website.' };
}

export async function uploadVehiclePhotos(form: FormData): Promise<{ urls: string[]; error?: string }> {
  await requireAdmin();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const urls: string[] = [];
  for (const file of files) {
    try {
      urls.push(await saveImage(file, 'vehicles'));
    } catch (err) {
      return { urls, error: err instanceof UploadError ? err.message : `Could not upload ${file.name}` };
    }
  }
  return { urls };
}

export async function deleteVehicle(form: FormData) {
  await requireAdmin();
  const id = Number(form.get('id'));
  const photos = db.select().from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, id)).all();
  db.delete(schema.vehicles).where(eq(schema.vehicles.id, id)).run();
  await Promise.all(photos.map((p) => deleteUpload(p.url)));
  revalidatePath('/', 'layout');
  redirect('/admin/inventory?deleted=1');
}

export async function bulkVehicles(ids: number[], op: 'feature' | 'unfeature' | VehicleStatus) {
  await requireAdmin();
  ids = ids.filter((id) => Number.isInteger(id));
  if (!ids.length) return;
  const set =
    op === 'feature' ? { featured: true } : op === 'unfeature' ? { featured: false } : (VEHICLE_STATUSES as readonly string[]).includes(op) ? { status: op } : null;
  if (!set) return;
  db.update(schema.vehicles)
    .set({ ...set, updatedAt: new Date() })
    .where(inArray(schema.vehicles.id, ids))
    .run();
  revalidatePath('/', 'layout');
}

/* ---------- Leads ---------- */

export async function updateLead(form: FormData) {
  await requireAdmin();
  const id = Number(form.get('id'));
  const status = String(form.get('status') ?? '');
  const notes = form.get('notes');
  db.update(schema.leads)
    .set({
      ...((LEAD_STATUSES as readonly string[]).includes(status) ? { status: status as LeadStatus } : {}),
      ...(notes !== null ? { notes: String(notes).slice(0, 4000) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.leads.id, id))
    .run();
  revalidatePath('/admin', 'layout');
}

export async function deleteLead(form: FormData) {
  await requireAdmin();
  const id = Number(form.get('id'));
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
  if (lead?.data.photos) await Promise.all(lead.data.photos.split('\n').map(deleteUpload));
  db.delete(schema.leads).where(eq(schema.leads.id, id)).run();
  revalidatePath('/admin', 'layout');
}

/* ---------- Settings & sync ---------- */

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const str = (k: keyof Settings) => String(form.get(k) ?? DEFAULT_SETTINGS[k]).trim();
  const rate = Number(form.get('financeRate'));
  const term = Number(form.get('financeTerm'));
  if (!(rate >= 0 && rate <= 40)) return { ok: false, message: 'Interest rate must be between 0 and 40%.' };
  const hours = form
    .getAll('hoursLabel')
    .map((label, i) => ({ label: String(label).trim(), value: String(form.getAll('hoursValue')[i] ?? '').trim() }))
    .filter((h) => h.label);
  saveSettings({
    phone: str('phone'),
    email: str('email'),
    whatsapp: str('whatsapp').replace(/\D/g, ''),
    address: str('address'),
    mapUrl: str('mapUrl'),
    workshopAddress: str('workshopAddress'),
    financeApplyUrl: str('financeApplyUrl'),
    financeRate: rate,
    financeTerm: [12, 24, 36, 48, 54, 60, 72].includes(term) ? term : 72,
    standardFooter: str('standardFooter'),
    heroStockCode: str('heroStockCode'),
    tickerExtra: str('tickerExtra'),
    hours,
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Settings saved.' };
}

export async function runVmgSync(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const list = await importFromVmg();
    if (!list.length) return { ok: false, message: 'The VMG feed returned no vehicles, nothing was changed.' };
    const r = applyVmgImport(list, { markMissingSold: form.get('markSold') === 'on' });
    saveSettings({ lastSync: { at: new Date().toISOString(), ...r } });
    revalidatePath('/', 'layout');
    return { ok: true, message: `Synced ${list.length} vehicles from VMG: ${r.added} added, ${r.updated} updated, ${r.markedSold} marked sold.` };
  } catch (err) {
    return { ok: false, message: `Sync failed: ${err instanceof Error ? err.message : 'unknown error'}` };
  }
}
