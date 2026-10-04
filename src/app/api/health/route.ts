import { count } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Lightweight endpoint for uptime monitors (keeps the free Render instance awake) and health checks. */
export function GET() {
  const vehicles = db.select({ n: count() }).from(schema.vehicles).get()?.n ?? 0;
  return Response.json({ ok: true, vehicles }, { headers: { 'cache-control': 'no-store' } });
}
