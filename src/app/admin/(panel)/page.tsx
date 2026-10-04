import { desc, eq } from 'drizzle-orm';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Body, Kpi, PageHeader, Section, StatusPill } from '@/components/admin/ui';
import { db, schema } from '@/lib/db';
import { formatDate, formatDateTime, formatPrice, groupDigits } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { publicVehicles } from '@/lib/vehicles';
import { LEAD_TYPE_LABELS } from '@/components/admin/labels';

export default function Dashboard() {
  const stock = publicVehicles();
  const value = stock.reduce((s, v) => s + v.price, 0);
  const leads = db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(6).all();
  const newCount = db.select().from(schema.leads).where(eq(schema.leads.status, 'new')).all().length;
  const recent = [...stock].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);
  const noPhotos = stock.filter((v) => !v.photoCount).length;
  const settings = getSettings();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <Link href="/admin/inventory/new" className="adm-btn adm-btn-primary">
            <Icon name="plus" size={16} strokeWidth={2.4} /> Add vehicle
          </Link>
        }
      />
      <Body>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Cars on the website" value={stock.length} />
          <Kpi label="Stock value" value={formatPrice(value)} />
          <Kpi label="Average price" value={formatPrice(stock.length ? value / stock.length : 0)} />
          <Kpi label="New leads" value={newCount} accent />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Section title="Latest leads" aside={<Link href="/admin/leads" className="text-octane hover:text-octane-hot">All leads →</Link>}>
            {leads.length ? (
              <ul className="flex flex-col divide-y divide-[#1f1f23]">
                {leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/leads?open=${l.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:text-octane">
                      <span className="flex size-9 items-center justify-center rounded-full bg-[#1c1c1f] text-sm font-bold">{l.name.charAt(0).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{l.name}</div>
                        <div className="truncate text-[13px] text-[#8e8e96]">
                          {LEAD_TYPE_LABELS[l.type]} · {l.phone}
                        </div>
                      </div>
                      <span className="text-[13px] text-[#8e8e96]">{formatDateTime(l.createdAt)}</span>
                      <StatusPill status={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-[#8e8e96]">No leads yet. Enquiries, finance requests, workshop bookings and trade-ins from the website will appear here.</p>
            )}
          </Section>

          <Section title="Recently updated" aside={<Link href="/admin/inventory" className="text-octane hover:text-octane-hot">Inventory →</Link>}>
            <ul className="flex flex-col gap-2.5">
              {recent.map((v) => (
                <li key={v.id}>
                  <Link href={`/admin/inventory/${v.id}`} className="flex items-center gap-3 rounded-lg hover:bg-[#17171a]">
                    {v.cover ? (
                      <Image src={v.cover} alt="" width={64} height={48} className="h-12 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="h-12 w-16 shrink-0 rounded-md bg-[#1c1c1f]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">
                        {v.year} {v.make} {v.model}
                      </div>
                      <div className="text-[12.5px] text-[#8e8e96]">
                        {v.stockCode} · {formatPrice(v.price)} · {formatDate(v.updatedAt)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Needs attention">
            <ul className="flex flex-col gap-2 text-[14px]">
              <li className="flex items-center gap-2">
                <Icon name={noPhotos ? 'upload' : 'check'} size={16} className={noPhotos ? 'text-warn' : 'text-ok'} />
                {noPhotos ? `${noPhotos} car(s) on the website without photos` : 'Every car on the website has photos'}
              </li>
              <li className="flex items-center gap-2">
                <Icon name={newCount ? 'inbox' : 'check'} size={16} className={newCount ? 'text-octane' : 'text-ok'} />
                {newCount ? `${newCount} new lead(s) waiting for a reply` : 'No unanswered leads'}
              </li>
              <li className="flex items-center gap-2">
                <Icon name={settings.whatsapp ? 'check' : 'chat'} size={16} className={settings.whatsapp ? 'text-ok' : 'text-warn'} />
                {settings.whatsapp ? 'WhatsApp button is on' : (
                  <span>
                    WhatsApp button is off — <Link href="/admin/settings" className="text-octane">add a number</Link>
                  </span>
                )}
              </li>
            </ul>
          </Section>
          <Section title="VMG stock sync" aside={settings.lastSync ? `Last run ${formatDateTime(new Date(settings.lastSync.at))}` : 'Not run yet'}>
            <p className="text-[14px] text-[#a1a1aa]">
              Pull new cars, prices and photos from the current VMG feed. Vehicles you add here are never overwritten.
              {settings.lastSync && ` Last result: ${groupDigits(settings.lastSync.added)} added, ${settings.lastSync.updated} updated, ${settings.lastSync.markedSold} sold.`}
            </p>
            <Link href="/admin/settings#sync" className="adm-btn adm-btn-ghost w-fit">
              <Icon name="refresh" size={16} /> Open sync
            </Link>
          </Section>
        </div>
      </Body>
    </>
  );
}
