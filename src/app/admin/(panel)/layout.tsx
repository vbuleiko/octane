import type { Metadata } from 'next';
import { count, eq, inArray } from 'drizzle-orm';
import { AdminSidebar } from '@/components/admin/Sidebar';
import { requireAdmin } from '@/lib/auth';
import { db, schema } from '@/lib/db';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Octane Admin' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const stock = db.select({ n: count() }).from(schema.vehicles).where(inArray(schema.vehicles.status, ['available', 'reserved'])).get()?.n ?? 0;
  const newLeads = db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.status, 'new')).get()?.n ?? 0;
  return (
    <div className="flex min-h-dvh flex-wrap items-stretch bg-ink">
      <AdminSidebar user={user} stock={stock} newLeads={newLeads} />
      <div className="flex min-w-0 flex-[999_1_640px] flex-col">{children}</div>
    </div>
  );
}
