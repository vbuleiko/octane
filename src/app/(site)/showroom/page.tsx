import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Icon } from '@/components/Icon';
import { ShowroomFilters } from '@/components/site/ShowroomFilters';
import { SkewLink } from '@/components/site/SkewLink';
import { VehicleCard } from '@/components/site/VehicleCard';
import { groupDigits } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { parseFilters, searchShowroom, SORTS } from '@/lib/vehicles';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const what = [f.make, f.body].filter(Boolean).join(' ');
  return {
    title: what ? `${what} for sale in Cape Town` : 'Showroom — pre-owned cars for sale in Cape Town',
    description: 'Browse every car in stock at Octane Auto, Montague Gardens. Filter by make, body type, price and mileage. Finance through all major banks.',
    alternates: { canonical: '/showroom' },
  };
}

const FILTER_LABELS: Record<string, (v: string) => string> = {
  q: (v) => `“${v}”`,
  make: (v) => v,
  body: (v) => v,
  fuel: (v) => v,
  trans: (v) => v,
  maxPrice: (v) => `Up to R ${groupDigits(Number(v))}`,
  minYear: (v) => `${v} or newer`,
  maxKm: (v) => `Under ${groupDigits(Number(v))} km`,
};

export default async function ShowroomPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const result = searchShowroom(filters);
  const settings = getSettings();
  const finance = { rate: settings.financeRate, term: settings.financeTerm };

  const current = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) current.set(k, v);
  const without = (key: string) => {
    const next = new URLSearchParams(current);
    next.delete(key);
    next.delete('page');
    return next.size ? `/showroom?${next}` : '/showroom';
  };
  const pageHref = (page: number) => {
    const next = new URLSearchParams(current);
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    return next.size ? `/showroom?${next}` : '/showroom';
  };
  const active = Object.keys(FILTER_LABELS).filter((k) => current.get(k));

  return (
    <>
      <section className="relative overflow-hidden border-b border-line-soft">
        <div aria-hidden="true" className="display stroke-text pointer-events-none absolute -left-[2vw] top-2 whitespace-nowrap text-[clamp(110px,20vw,300px)] leading-[0.8]">
          SHOWROOM
        </div>
        <div className="container-pit relative flex flex-wrap items-end justify-between gap-6 py-[clamp(40px,6vw,80px)]">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span aria-hidden="true" className="checker size-7 [--checker-size:14px]" />
              <span className="eyebrow">Showroom · Montague Gardens</span>
            </div>
            <h1 className="display text-[clamp(52px,8vw,120px)]">
              {result.total} cars <span className="text-octane">on the grid</span>
            </h1>
          </div>
          <p className="max-w-sm text-smoke">Every car is in our showroom in Montague Gardens. Finance through all major banks, trade-ins welcome.</p>
        </div>
      </section>

      <Suspense>
        <ShowroomFilters facets={result.facets} sorts={SORTS} />
      </Suspense>

      <section className="container-pit py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <p className="racing mr-2 text-lg tracking-normal" aria-live="polite">
            {result.count === result.total ? `Showing all ${result.total} cars` : `${result.count} of ${result.total} cars match`}
          </p>
          {active.map((k) => (
            <Link
              key={k}
              href={without(k)}
              className="flex min-h-9 items-center gap-2 border border-line bg-panel px-3 text-sm font-semibold hover:border-octane"
              aria-label={`Remove filter ${FILTER_LABELS[k](current.get(k)!)}`}
            >
              {FILTER_LABELS[k](current.get(k)!)} <Icon name="close" size={14} />
            </Link>
          ))}
          {active.length > 1 && (
            <Link href="/showroom" className="text-sm font-semibold text-octane hover:text-octane-hot">
              Clear all
            </Link>
          )}
        </div>

        {result.items.length ? (
          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((v, i) => (
              <VehicleCard key={v.id} v={v} finance={finance} priority={i < 4} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-5 border-l-4 border-octane bg-panel p-8">
            <h2 className="display text-4xl">Nothing on the grid for that search</h2>
            <p className="max-w-xl text-smoke">
              Our stock changes every week. Tell us what you&apos;re looking for and we&apos;ll call you when the right car comes in, or browse everything we have.
            </p>
            <div className="flex flex-wrap gap-4 pl-2">
              <SkewLink href="/showroom">See all cars</SkewLink>
              <SkewLink href="/contact" variant="ghost">
                Tell us what you need
              </SkewLink>
            </div>
          </div>
        )}

        {result.pages > 1 && (
          <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {result.page > 1 && (
              <Link href={pageHref(result.page - 1)} className="flex size-12 items-center justify-center border-2 border-[#3a3a3e] hover:border-chalk" aria-label="Previous page">
                <Icon name="chevron-left" />
              </Link>
            )}
            {Array.from({ length: result.pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={pageHref(p)}
                aria-current={p === result.page ? 'page' : undefined}
                className={`skew racing flex size-12 items-center justify-center border-2 text-lg ${
                  p === result.page ? 'border-octane bg-octane text-ink' : 'border-[#3a3a3e] hover:border-chalk'
                }`}
              >
                <span className="unskew">{p}</span>
              </Link>
            ))}
            {result.page < result.pages && (
              <Link href={pageHref(result.page + 1)} className="flex size-12 items-center justify-center border-2 border-[#3a3a3e] hover:border-chalk" aria-label="Next page">
                <Icon name="chevron-right" />
              </Link>
            )}
          </nav>
        )}
        <p className="mt-10 text-[13px] text-ash">
          Monthly estimates at {finance.rate}% over {finance.term} months with no deposit. Subject to bank approval.
        </p>
      </section>
    </>
  );
}
