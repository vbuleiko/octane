'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import type { LeadType } from '@/lib/db/schema';
import { formatPrice, vehicleTitle } from '@/lib/format';
import { notifyNewLead } from '@/lib/notify';
import { getSettings } from '@/lib/settings';
import { saveImage, UploadError } from '@/lib/uploads';

export type FormState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

const LABELS: Record<LeadType, string> = {
  enquiry: 'Vehicle enquiry',
  finance: 'Finance application',
  workshop: 'Workshop booking',
  tradein: 'Sell / trade-in request',
  contact: 'Contact message',
};

const text = (max = 200) => z.string().trim().max(max).optional().default('');
const phone = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, '').length >= 9, 'Please enter a valid phone number');

const base = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  phone,
  email: z.union([z.literal(''), z.string().trim().email('Please enter a valid email address')]).default(''),
  message: text(4000),
});

const extraFields: Record<LeadType, string[]> = {
  enquiry: ['intent'],
  finance: ['vehicle', 'deposit', 'employment', 'contactTime'],
  workshop: ['make', 'model', 'year', 'mileage', 'preferredDate'],
  tradein: ['make', 'model', 'year', 'mileage', 'condition', 'askingPrice', 'tradeIn'],
  contact: [],
};

// Small in-memory throttle against form spam (per server instance).
const recent = new Map<string, number[]>();
function throttled(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) for (const [k, v] of recent) if (now - v[v.length - 1] > 10 * 60_000) recent.delete(k);
  return hits.length > 6;
}

export async function submitLead(_prev: FormState, form: FormData): Promise<FormState> {
  const type = String(form.get('type')) as LeadType;
  if (!(type in LABELS)) return { ok: false, message: 'Unknown form.' };

  // Honeypot: real people never see or fill this field.
  if (String(form.get('company') ?? '')) return { ok: true, message: 'Thank you! We will be in touch shortly.' };

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (throttled(ip)) return { ok: false, message: 'Too many submissions. Please call us instead or try again later.' };

  const schemaForType = type === 'contact' ? base.extend({ email: z.string().trim().email('Please enter a valid email address') }) : base;
  const parsed = schemaForType.safeParse({
    name: form.get('name') ?? '',
    phone: form.get('phone') ?? '',
    email: form.get('email') ?? '',
    message: form.get('message') ?? '',
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: 'Please check the highlighted fields.', errors };
  }

  const data: Record<string, string> = {};
  for (const key of extraFields[type]) {
    const value = String(form.get(key) ?? '').trim().slice(0, 200);
    if (value) data[key] = value;
  }
  if (type === 'workshop') {
    const services = form.getAll('services').map(String).filter(Boolean).slice(0, 10);
    if (services.length) data.services = services.join(', ');
  }

  if (type === 'tradein') {
    const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 8);
    try {
      const urls = await Promise.all(files.map((f) => saveImage(f, 'leads')));
      if (urls.length) data.photos = urls.join('\n');
    } catch (err) {
      return { ok: false, message: err instanceof UploadError ? err.message : 'Photo upload failed.' };
    }
  }

  const vehicleId = Number(form.get('vehicleId')) || null;
  const vehicle = vehicleId ? db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).get() : undefined;

  db.insert(schema.leads)
    .values({ type, name: parsed.data.name, phone: parsed.data.phone, email: parsed.data.email, message: parsed.data.message, vehicleId: vehicle?.id ?? null, data })
    .run();

  const settings = getSettings();
  const subjectCar = vehicle ? ` — ${vehicle.year} ${vehicleTitle(vehicle)} (${vehicle.stockCode})` : '';
  await notifyNewLead(settings.email, `${LABELS[type]}${subjectCar}`, [
    ['Name', parsed.data.name],
    ['Phone', parsed.data.phone],
    ['Email', parsed.data.email],
    ['Vehicle', vehicle ? `${vehicle.year} ${vehicleTitle(vehicle)} · ${formatPrice(vehicle.price)} · ${vehicle.stockCode}` : ''],
    ...Object.entries(data).filter(([k]) => k !== 'photos'),
    ['Message', parsed.data.message],
  ]);

  const thanks: Record<LeadType, string> = {
    enquiry: 'Thanks! A salesperson will contact you shortly about this car.',
    finance: 'Thanks! Our finance team will call you to get your application going.',
    workshop: 'Thanks! We will send you a quotation and arrange collection.',
    tradein: 'Thanks! We will look at your car and come back to you with an offer.',
    contact: 'Thanks for getting in touch. We will respond as soon as possible.',
  };
  return { ok: true, message: thanks[type] };
}
