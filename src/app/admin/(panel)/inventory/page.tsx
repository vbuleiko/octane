import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { InventoryTable } from '@/components/admin/InventoryTable';
import { Body, Kpi, PageHeader } from '@/components/admin/ui';
import { formatPrice } from '@/lib/format';
import { adminVehicles } from '@/lib/vehicles';

export const metadata = { title: 'Inventory' };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const all = adminVehicles();
  const live = all.filter((v) => v.status === 'available' || v.status === 'reserved');
  const { deleted } = await searchParams;
  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={`${all.length} vehicles · ${live.length} on the website`}
        actions={
          <Link href="/admin/inventory/new" className="adm-btn adm-btn-primary">
            <Icon name="plus" size={16} strokeWidth={2.4} /> Add vehicle
          </Link>
        }
      />
      <Body>
        {deleted && <p className="rounded-lg border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm">Vehicle deleted.</p>}
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="On the website" value={live.length} />
          <Kpi label="Stock value" value={formatPrice(live.reduce((s, v) => s + v.price, 0))} />
          <Kpi label="Reserved" value={all.filter((v) => v.status === 'reserved').length} />
          <Kpi label="Featured on homepage" value={all.filter((v) => v.featured && v.status !== 'sold').length} accent />
        </div>
        <InventoryTable rows={all} />
      </Body>
    </>
  );
}
