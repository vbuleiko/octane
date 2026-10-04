'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { bulkVehicles } from '@/app/admin/actions';
import { Icon } from '@/components/Icon';
import type { VehicleStatus } from '@/lib/db/schema';
import { formatDate, formatKm, formatPrice } from '@/lib/format';
import type { VehicleCard } from '@/lib/vehicles';
import { StatusPill } from './ui';

const TABS = ['all', 'available', 'reserved', 'sold', 'draft'] as const;
const SORTS = {
  updated: 'Recently updated',
  'price-desc': 'Price: high to low',
  'price-asc': 'Price: low to high',
  oldest: 'Longest in stock',
} as const;

export function InventoryTable({ rows }: { rows: VehicleCard[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const [sort, setSort] = useState<keyof typeof SORTS>('updated');
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, t === 'all' ? rows.length : rows.filter((r) => r.status === t).length])), [rows]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) => (tab === 'all' || r.status === tab) && (!needle || `${r.year} ${r.make} ${r.model} ${r.variant} ${r.stockCode} ${r.colour}`.toLowerCase().includes(needle)),
    );
    const by: Record<keyof typeof SORTS, (a: VehicleCard, b: VehicleCard) => number> = {
      updated: (a, b) => +b.updatedAt - +a.updatedAt,
      'price-desc': (a, b) => b.price - a.price,
      'price-asc': (a, b) => a.price - b.price,
      oldest: (a, b) => +a.createdAt - +b.createdAt,
    };
    return out.sort(by[sort]);
  }, [rows, q, tab, sort]);

  const allPicked = list.length > 0 && list.every((r) => picked.has(r.id));
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const run = (ids: number[], op: 'feature' | 'unfeature' | VehicleStatus) =>
    start(async () => {
      await bulkVehicles(ids, op);
      setPicked(new Set());
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-[10px] border border-[#1f1f23] bg-[#111113] p-1" role="group" aria-label="Filter by status">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={`h-9 rounded-[7px] px-3.5 text-[13.5px] font-semibold capitalize ${tab === t ? 'bg-[#26262b] text-chalk' : 'text-[#a1a1aa] hover:text-chalk'}`}
            >
              {t} <span className="opacity-60">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e96]" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search make, model, stock no." aria-label="Search stock" className="adm-field w-72 max-w-[70vw] pl-9" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label="Sort" className="adm-field w-auto cursor-pointer">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-octane/40 bg-octane/10 px-3.5 py-2.5 text-sm">
          <strong>{picked.size} selected</strong>
          <span className="flex-1" />
          <button type="button" disabled={pending} onClick={() => run([...picked], 'feature')} className="adm-btn adm-btn-ghost min-h-9 bg-[#111113]">
            Feature on homepage
          </button>
          <button type="button" disabled={pending} onClick={() => run([...picked], 'available')} className="adm-btn adm-btn-ghost min-h-9 bg-[#111113]">
            Mark available
          </button>
          <button type="button" disabled={pending} onClick={() => run([...picked], 'reserved')} className="adm-btn adm-btn-ghost min-h-9 bg-[#111113]">
            Mark reserved
          </button>
          <button type="button" disabled={pending} onClick={() => run([...picked], 'sold')} className="adm-btn adm-btn-ghost min-h-9 bg-[#111113]">
            Mark sold
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="adm-btn min-h-9 text-[#a1a1aa]">
            Clear
          </button>
        </div>
      )}

      <div className="adm-card overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8e96]">
              <th className="w-10 border-b border-[#1f1f23] px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)))}
                  className="size-4.5 cursor-pointer"
                />
              </th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Vehicle</th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Price</th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Mileage</th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Type</th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Updated</th>
              <th className="border-b border-[#1f1f23] px-2 py-3">Status</th>
              <th className="border-b border-[#1f1f23] px-2 py-3 text-center">Featured</th>
              <th className="border-b border-[#1f1f23] px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={`hover:bg-[#141417] ${picked.has(r.id) ? 'bg-octane/5' : ''}`}>
                <td className="border-b border-[#1a1a1d] px-4 py-2.5">
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.year} ${r.make} ${r.model}`} className="size-4.5 cursor-pointer" />
                </td>
                <td className="border-b border-[#1a1a1d] px-2 py-2.5">
                  <Link href={`/admin/inventory/${r.id}`} className="group flex items-center gap-3">
                    {r.cover ? (
                      <Image src={r.cover} alt="" width={72} height={54} className="h-[54px] w-[72px] shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-[54px] w-[72px] shrink-0 items-center justify-center rounded-md bg-[#1c1c1f] text-[#71717a]">
                        <Icon name="upload" size={18} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold group-hover:text-octane">
                        {r.year} {r.make} {r.model}
                      </div>
                      <div className="text-[12.5px] text-[#8e8e96]">
                        {r.stockCode} · {r.variant || '—'} {r.source === 'vmg' && <span className="ml-1 rounded bg-[#1c1c1f] px-1.5 py-px text-[11px]">VMG</span>}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap border-b border-[#1a1a1d] px-2 py-2.5 font-semibold">{formatPrice(r.price)}</td>
                <td className="whitespace-nowrap border-b border-[#1a1a1d] px-2 py-2.5 text-[#d4d4d8]">{formatKm(r.mileage)}</td>
                <td className="whitespace-nowrap border-b border-[#1a1a1d] px-2 py-2.5 text-[#d4d4d8]">
                  {r.bodyType || '—'} · {r.transmission === 'Automatic' ? 'Auto' : r.transmission || '—'}
                </td>
                <td className="whitespace-nowrap border-b border-[#1a1a1d] px-2 py-2.5 text-[13px] text-[#a1a1aa]">{formatDate(r.updatedAt)}</td>
                <td className="border-b border-[#1a1a1d] px-2 py-2.5">
                  <StatusPill status={r.status} />
                </td>
                <td className="border-b border-[#1a1a1d] px-2 py-2.5 text-center">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run([r.id], r.featured ? 'unfeature' : 'feature')}
                    aria-pressed={r.featured}
                    aria-label={`${r.featured ? 'Remove' : 'Feature'} ${r.year} ${r.make} ${r.model} on the homepage`}
                    className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-[#1c1c1f]"
                  >
                    <Icon name="star" size={18} strokeWidth={1.8} fill={r.featured ? 'currentColor' : 'none'} className={r.featured ? 'text-octane' : 'text-[#52525b]'} />
                  </button>
                </td>
                <td className="border-b border-[#1a1a1d] px-4 py-2.5 text-right">
                  <Link href={`/admin/inventory/${r.id}`} className="text-[13.5px] font-semibold text-octane hover:text-octane-hot">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[#8e8e96]">
                  No vehicles match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
