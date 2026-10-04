'use client';

import { useState } from 'react';
import type { CardData as Card } from '@/lib/vehicles';
import { SkewLink } from './SkewLink';
import { VehicleCard, type FinanceDefaults } from './VehicleCard';

export function HomeGrid({
  pool,
  bodies,
  total,
  finance,
}: {
  pool: Card[];
  bodies: { value: string; count: number }[];
  total: number;
  finance: FinanceDefaults;
}) {
  const [body, setBody] = useState<string>('');
  const chips = [{ value: '', label: 'All', count: total }, ...bodies.map((b) => ({ ...b, label: b.value }))];
  const visible = pool.filter((v) => !body || v.bodyType === body).slice(0, 8);
  const active = chips.find((c) => c.value === body)!;

  return (
    <>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <h2 className="display text-[clamp(44px,6vw,84px)]">
          On the <span className="text-octane">grid</span>
        </h2>
        <div className="flex flex-wrap gap-2.5 pl-1.5" role="group" aria-label="Filter by body type">
          {chips.map((c) => {
            const on = c.value === body;
            return (
              <button
                key={c.label}
                type="button"
                aria-pressed={on}
                onClick={() => setBody(c.value)}
                className={`skew racing min-h-11 border-2 px-5 text-base transition-colors ${
                  on ? 'border-octane bg-octane text-ink' : 'border-[#3a3a3e] text-chalk hover:border-chalk'
                }`}
              >
                <span className="unskew">
                  {c.label} · {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((v, i) => (
          <VehicleCard key={v.id} v={v} finance={finance} position={i + 1} priority={i < 4} className={i >= 4 ? 'hidden sm:flex' : 'flex'} />
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pl-2">
        <p className="text-[13px] text-ash">
          Estimate at {finance.rate}% over {finance.term} months, no deposit. Subject to bank approval.
        </p>
        <SkewLink href={body ? `/showroom?body=${encodeURIComponent(body)}` : '/showroom'} variant="ghost">
          {body ? `All ${active.count} ${active.label + 's'}` : `All ${total} cars`} →
        </SkewLink>
      </div>
    </>
  );
}
