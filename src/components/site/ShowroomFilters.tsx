'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/Icon';
import { groupDigits } from '@/lib/format';

type Facet = { value: string; count: number }[];

const PRICE_STEPS = [100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000];
const YEAR_STEPS = [2010, 2014, 2016, 2018, 2020, 2022, 2024];
const KM_STEPS = [30000, 60000, 100000, 150000];

export function ShowroomFilters({
  facets,
  sorts,
}: {
  facets: { make: Facet; body: Facet; fuel: Facet; trans: Facet };
  sorts: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false }));
  }

  const select = (key: string, label: string, options: { value: string; label: string }[], any: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`f-${key}`} className="label-caps">
        {label}
      </label>
      <select id={`f-${key}`} value={params.get(key) ?? ''} onChange={(e) => update(key, e.target.value)} className="field cursor-pointer">
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  const facetOptions = (f: Facet) => f.map((o) => ({ value: o.value, label: `${o.value} (${o.count})` }));

  return (
    <div className="border-b border-line-soft bg-pit">
      <div className="container-pit py-5">
        <div className="flex flex-wrap items-end gap-3">
          <form
            role="search"
            className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              update('q', q.trim());
            }}
          >
            <label htmlFor="f-q" className="label-caps">
              Search
            </label>
            <div className="relative">
              <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ash" />
              <input
                id="f-q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => q.trim() !== (params.get('q') ?? '') && update('q', q.trim())}
                placeholder="Make, model or stock code"
                className="field pl-11"
              />
            </div>
          </form>
          <div className="flex min-w-0 flex-[0_1_220px] flex-col gap-1.5">
            <label htmlFor="f-sort" className="label-caps">
              Sort by
            </label>
            <select id="f-sort" value={params.get('sort') ?? 'newest'} onChange={(e) => update('sort', e.target.value === 'newest' ? '' : e.target.value)} className="field cursor-pointer">
              {Object.entries(sorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="more-filters"
            className="racing flex min-h-12 items-center gap-2 border-2 border-[#3a3a3e] px-5 text-[15px] hover:border-chalk lg:hidden"
          >
            <Icon name="sliders" size={18} /> Filters
          </button>
        </div>
        <div id="more-filters" className={`mt-4 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid lg:grid-cols-7 ${open ? 'grid' : 'hidden'}`}>
          {select('make', 'Make', facetOptions(facets.make), 'All makes')}
          {select('body', 'Body type', facetOptions(facets.body), 'Any body')}
          {select('fuel', 'Fuel', facetOptions(facets.fuel), 'Any fuel')}
          {select('trans', 'Gearbox', facetOptions(facets.trans), 'Any')}
          {select('maxPrice', 'Max price', PRICE_STEPS.map((p) => ({ value: String(p), label: `R ${groupDigits(p)}` })), 'Any price')}
          {select('minYear', 'Year from', YEAR_STEPS.map((y) => ({ value: String(y), label: String(y) })), 'Any year')}
          {select('maxKm', 'Max mileage', KM_STEPS.map((k) => ({ value: String(k), label: `${groupDigits(k)} km` })), 'Any km')}
        </div>
      </div>
      <div className={`h-0.5 bg-octane transition-opacity ${pending ? 'animate-pulse opacity-100' : 'opacity-0'}`} aria-hidden="true" />
    </div>
  );
}
