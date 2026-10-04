import { desc, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { deleteLead, updateLead } from '@/app/admin/actions';
import { Icon } from '@/components/Icon';
import { LEAD_TYPE_LABELS } from '@/components/admin/labels';
import { Body, PageHeader, StatusPill } from '@/components/admin/ui';
import { db, schema } from '@/lib/db';
import { LEAD_STATUSES, LEAD_TYPES, type LeadStatus, type LeadType } from '@/lib/db/schema';
import { formatDateTime, formatPrice } from '@/lib/format';

export const metadata = { title: 'Leads' };

const DATA_LABELS: Record<string, string> = {
  intent: 'Wants to',
  vehicle: 'Car of interest',
  deposit: 'Deposit',
  employment: 'Employment',
  contactTime: 'Best time to call',
  make: 'Make',
  model: 'Model',
  year: 'Year',
  mileage: 'Mileage',
  condition: 'Condition',
  askingPrice: 'Price in mind',
  tradeIn: 'Wants to',
  services: 'Services',
  preferredDate: 'Preferred date',
};

const STATUS_LABEL: Record<LeadStatus, string> = { new: 'New', in_progress: 'In progress', closed: 'Closed' };

function waLink(phone: string, name: string) {
  let n = phone.replace(/\D/g, '');
  if (n.startsWith('0')) n = '27' + n.slice(1);
  return `https://wa.me/${n}?text=${encodeURIComponent(`Hi ${name.split(' ')[0]}, this is Octane Auto following up on your enquiry.`)}`;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; open?: string }> }) {
  const sp = await searchParams;
  const type = LEAD_TYPES.includes(sp.type as LeadType) ? (sp.type as LeadType) : undefined;
  const status = sp.status === 'all' ? undefined : LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;
  const openId = Number(sp.open) || null;

  const all = db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).all();
  const leads = all.filter((l) => (!type || l.type === type) && (!status || l.status === status));
  const vehicleIds = [...new Set(leads.map((l) => l.vehicleId).filter((x): x is number => !!x))];
  const vehicles = vehicleIds.length ? db.select().from(schema.vehicles).where(inArray(schema.vehicles.id, vehicleIds)).all() : [];
  const vById = new Map(vehicles.map((v) => [v.id, v]));
  const href = (p: { type?: string; status?: string }) => {
    const q = new URLSearchParams();
    const t = 'type' in p ? p.type : type;
    const s = 'status' in p ? p.status : sp.status;
    if (t) q.set('type', t);
    if (s) q.set('status', s);
    return q.size ? `/admin/leads?${q}` : '/admin/leads';
  };
  const newCount = (t?: LeadType) => all.filter((l) => l.status === 'new' && (!t || l.type === t)).length;

  return (
    <>
      <PageHeader title="Leads" subtitle={`${all.length} total · ${newCount()} new`} />
      <Body>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Lead type" className="inline-flex flex-wrap gap-1 rounded-[10px] border border-[#1f1f23] bg-[#111113] p-1">
            {[undefined, ...LEAD_TYPES].map((t) => (
              <Link
                key={t ?? 'all'}
                href={href({ type: t })}
                aria-current={type === t ? 'page' : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-[7px] px-3.5 text-[13.5px] font-semibold ${type === t ? 'bg-[#26262b] text-chalk' : 'text-[#a1a1aa] hover:text-chalk'}`}
              >
                {t ? LEAD_TYPE_LABELS[t] : 'All'}
                {newCount(t) > 0 && <span className="rounded-full bg-octane px-1.5 text-[11px] text-ink">{newCount(t)}</span>}
              </Link>
            ))}
          </nav>
          <nav aria-label="Lead status" className="inline-flex gap-1 rounded-[10px] border border-[#1f1f23] bg-[#111113] p-1">
            {[undefined, ...LEAD_STATUSES].map((s) => (
              <Link
                key={s ?? 'open'}
                href={href({ status: s })}
                aria-current={status === s ? 'page' : undefined}
                className={`flex h-9 items-center rounded-[7px] px-3.5 text-[13.5px] font-semibold ${status === s ? 'bg-[#26262b] text-chalk' : 'text-[#a1a1aa] hover:text-chalk'}`}
              >
                {s ? STATUS_LABEL[s] : 'Any status'}
              </Link>
            ))}
          </nav>
        </div>

        {leads.length === 0 && (
          <div className="adm-card p-10 text-center text-[#8e8e96]">
            No leads here yet. Forms on the website (vehicle enquiries, finance, workshop, sell your car and contact) land in this inbox.
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {leads.map((l) => {
            const v = l.vehicleId ? vById.get(l.vehicleId) : undefined;
            const photos = l.data.photos ? l.data.photos.split('\n') : [];
            return (
              <details key={l.id} open={openId === l.id} className="adm-card group overflow-hidden open:border-[#2e2e33]">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-[#141417] [&::-webkit-details-marker]:hidden">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1c1c1f] font-bold">{l.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {l.name}
                      <span className="rounded-md bg-[#1c1c1f] px-2 py-0.5 text-[12px] font-medium text-[#a1a1aa]">{LEAD_TYPE_LABELS[l.type]}</span>
                    </div>
                    <div className="truncate text-[13px] text-[#8e8e96]">
                      {v ? `${v.year} ${v.make} ${v.model} (${v.stockCode})` : l.message || l.phone}
                    </div>
                  </div>
                  <span className="text-[13px] text-[#8e8e96]">{formatDateTime(l.createdAt)}</span>
                  <StatusPill status={l.status} />
                  <Icon name="chevron-down" size={18} className="text-[#71717a] transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-5 border-t border-[#1f1f23] p-4 lg:grid-cols-[1.3fr_1fr]">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} className="adm-btn adm-btn-ghost">
                        <Icon name="phone" size={16} /> {l.phone}
                      </a>
                      <a href={waLink(l.phone, l.name)} target="_blank" rel="noopener" className="adm-btn adm-btn-ghost">
                        <Icon name="chat" size={16} /> WhatsApp
                      </a>
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="adm-btn adm-btn-ghost">
                          <Icon name="mail" size={16} /> {l.email}
                        </a>
                      )}
                    </div>
                    {v && (
                      <Link href={`/admin/inventory/${v.id}`} className="flex w-fit items-center gap-2 text-[14px] text-octane hover:text-octane-hot">
                        <Icon name="car" size={16} /> {v.year} {v.make} {v.model} {v.variant} · {formatPrice(v.price)} · {v.stockCode}
                      </Link>
                    )}
                    {Object.keys(l.data).filter((k) => k !== 'photos').length > 0 && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
                        {Object.entries(l.data)
                          .filter(([k]) => k !== 'photos')
                          .map(([k, val]) => (
                            <div key={k} className="contents">
                              <dt className="text-[#8e8e96]">{DATA_LABELS[k] ?? k}</dt>
                              <dd>{val}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    {l.message && <p className="whitespace-pre-line rounded-lg bg-[#0e0e10] p-3.5 text-[14.5px] leading-relaxed">{l.message}</p>}
                    {photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {photos.map((p) => (
                          <a key={p} href={p} target="_blank" rel="noopener">
                            {/* Private files (staff-only route), so they bypass the public image optimizer. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p} alt="Customer photo" loading="lazy" className="h-[90px] w-[120px] rounded-md object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {LEAD_STATUSES.map((s) => (
                        <form key={s} action={updateLead}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="status" value={s} />
                          <button type="submit" aria-pressed={l.status === s} className={`adm-btn min-h-9 ${l.status === s ? 'adm-btn-primary' : 'adm-btn-ghost'}`}>
                            {STATUS_LABEL[s]}
                          </button>
                        </form>
                      ))}
                    </div>
                    <form action={updateLead} className="flex flex-col gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <label className="adm-label" htmlFor={`notes-${l.id}`}>
                        Internal notes
                      </label>
                      <textarea id={`notes-${l.id}`} name="notes" defaultValue={l.notes} rows={3} placeholder="e.g. Called Tuesday, coming in Saturday 10:00" className="adm-field resize-y py-2.5" />
                      <div className="flex items-center justify-between gap-2">
                        <button type="submit" className="adm-btn adm-btn-ghost min-h-9">
                          Save notes
                        </button>
                      </div>
                    </form>
                    <form action={deleteLead} className="mt-auto">
                      <input type="hidden" name="id" value={l.id} />
                      <button type="submit" className="text-[13px] text-[#8e8e96] hover:text-bad">
                        Delete lead
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </Body>
    </>
  );
}
