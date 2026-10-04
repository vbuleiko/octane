import Image from 'next/image';
import Link from 'next/link';
import { FinanceCalculator } from '@/components/site/FinanceCalculator';
import { HomeGrid } from '@/components/site/HomeGrid';
import { ServicePanels, VisitBlock, WORKSHOP_SERVICES, WorkshopSteps } from '@/components/site/sections';
import { SkewLink } from '@/components/site/SkewLink';
import { formatKm, formatPrice } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { featuredVehicles, getVehicleByStock, stockStats, toCard } from '@/lib/vehicles';

export default function HomePage() {
  const settings = getSettings();
  const stats = stockStats();
  const pool = featuredVehicles(200);
  const fromSettings = settings.heroStockCode ? getVehicleByStock(settings.heroStockCode) : null;
  const hero =
    fromSettings && fromSettings.status !== 'sold' && fromSettings.status !== 'draft'
      ? fromSettings
      : pool[0]
        ? getVehicleByStock(pool[0].stockCode)
        : null;
  const heroPhoto = hero ? (hero.photos[1] ?? hero.photos[0])?.url : null;
  const finance = { rate: settings.financeRate, term: settings.financeTerm };

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="display stroke-text pointer-events-none absolute -left-[2vw] top-2.5 whitespace-nowrap text-[clamp(120px,24vw,360px)] leading-[0.8]">
          OCTANE
        </div>
        <div className="container-pit relative flex flex-wrap items-center gap-10 py-[clamp(40px,6vw,80px)]">
          <div className="min-w-0 flex-[1_1_460px]">
            <div className="mb-6 flex items-center gap-3">
              <span aria-hidden="true" className="checker size-7 [--checker-size:14px]" />
              <span className="eyebrow">Montague Gardens · Cape Town</span>
            </div>
            <h1 className="display mb-6 text-[clamp(56px,9vw,136px)] leading-[0.86]">
              Your drive
              <br />
              is our
              <br />
              <span className="text-octane">passion</span>
            </h1>
            <p className="mb-8 max-w-[460px] text-lg leading-relaxed text-smoke">
              {stats.count} cars on the floor right now. Finance through all major banks, trade-ins welcome, nationwide delivery on request.
            </p>
            <div className="flex flex-wrap gap-4 pl-2">
              <SkewLink href="/showroom" className="min-h-14 px-8 text-lg">
                Enter showroom
              </SkewLink>
              <SkewLink href="/finance" variant="ghost" className="min-h-14 px-8 text-lg">
                Get finance
              </SkewLink>
            </div>
          </div>
          {hero && heroPhoto && (
            <Link href={`/showroom/${hero.slug}`} className="group relative min-w-0 flex-[1_1_560px] pb-6 pl-6">
              <div aria-hidden="true" className="clip-slant absolute bottom-0 left-0 right-7 top-7 bg-octane" />
              <div className="clip-slant relative aspect-[4/3] overflow-hidden">
                <Image
                  src={heroPhoto}
                  alt={`${hero.year} ${hero.make} ${hero.model} ${hero.variant}`}
                  fill
                  priority
                  sizes="(min-width: 1024px) 680px, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
              </div>
              <div className="skew absolute bottom-0 right-0 border-2 border-octane bg-ink px-5 py-3">
                <div className="unskew flex-col items-start gap-0">
                  <span className="label-caps">Car of the week · {hero.stockCode}</span>
                  <span className="racing text-[26px] font-black tracking-normal">{formatPrice(hero.price)}</span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>

      {hero && (
        <div className="border-y border-line-soft bg-panel">
          <div className="container-pit grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Model', `${hero.make} ${hero.model}`],
              ['Year', String(hero.year)],
              ['Odometer', formatKm(hero.mileage)],
              ['Gearbox', hero.transmission],
              ['Fuel', hero.fuelType],
            ].map(([k, v], i) => (
              <div key={k} className={`py-5 pr-4 ${i ? 'border-line sm:border-l sm:pl-4' : ''}`}>
                <div className="label-caps">{k}</div>
                <div className="racing truncate text-xl tracking-normal">{v}</div>
              </div>
            ))}
            <div className="flex items-center py-5 sm:border-l sm:border-line sm:pl-4">
              <Link href={`/showroom/${hero.slug}`} className="racing text-base tracking-[0.08em] text-octane hover:text-octane-hot">
                View car →
              </Link>
            </div>
          </div>
        </div>
      )}

      <section className="container-pit pt-18">
        <div className="grid grid-cols-2 gap-y-8 lg:grid-cols-4">
          {[
            [String(stats.count), 'Cars on the grid', true],
            [String(stats.makes), 'Makes in stock', false],
            ['72', 'Month finance terms', false],
            ['30km', 'Workshop collection', false],
          ].map(([n, label, hot]) => (
            <div key={label as string} className="pr-6">
              <div className={`display text-[clamp(64px,7vw,104px)] font-black [font-stretch:70%] ${hot ? 'text-octane' : ''}`}>{n}</div>
              <div className="text-[15px] font-bold uppercase tracking-[0.14em] text-smoke">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-pit pt-24">
        <HomeGrid pool={pool.map(toCard)} bodies={stats.byBody} total={stats.count} finance={finance} />
      </section>

      <div aria-hidden="true" className="checker mt-28 h-8 [--checker-size:32px]" />

      <section className="bg-pit">
        <div className="container-pit py-24">
          <h2 className="display mb-10 text-[clamp(44px,6vw,84px)]">
            Full <span className="text-octane">service</span> crew
          </h2>
          <ServicePanels />
        </div>
      </section>

      <section className="container-pit pt-28">
        <div className="flex flex-wrap items-stretch gap-10">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col">
            <h2 className="display mb-5 text-[clamp(44px,6vw,84px)]">
              Run the <span className="text-octane">numbers</span>
            </h2>
            <p className="mb-8 max-w-md text-[17px] leading-relaxed text-smoke">
              Set the price, deposit and term. Your instalment updates live. Then apply online and we&apos;ll go to every major bank for you.
            </p>
            <div className="mt-auto flex flex-col gap-2.5">
              <a href={settings.financeApplyUrl} target="_blank" rel="noopener" className="racing flex items-center justify-between bg-panel px-5.5 py-4.5 text-[17px] hover:bg-panel-2">
                Apply online <span className="text-octane">→</span>
              </a>
              <a href="/documents/octane-finance-individual.pdf" className="racing flex items-center justify-between bg-panel px-5.5 py-4.5 text-[17px] hover:bg-panel-2">
                Application form <span className="text-sm text-ash">PDF</span>
              </a>
              <a href="/documents/octane-finance-juristic.pdf" className="racing flex items-center justify-between bg-panel px-5.5 py-4.5 text-[17px] hover:bg-panel-2">
                Company (juristic) form <span className="text-sm text-ash">PDF</span>
              </a>
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_560px]">
            <FinanceCalculator rate={settings.financeRate} term={settings.financeTerm} />
          </div>
        </div>
      </section>

      <section className="container-pit pt-28">
        <div className="flex flex-wrap items-stretch gap-10">
          <div className="relative min-h-90 min-w-0 flex-[1_1_360px]">
            <Image src="/images/studio-front.jpg" alt="A car being prepared in the Octane Auto studio" fill sizes="(min-width: 1024px) 33vw, 100vw" className="clip-slant-right object-cover" />
          </div>
          <div className="min-w-0 flex-[2_1_640px]">
            <div className="eyebrow mb-3.5">Workshop · {settings.workshopAddress.split(',')[0]}</div>
            <h2 className="display mb-8 text-[clamp(44px,6vw,84px)]">
              The pit stop
              <br />
              comes to <span className="text-octane">you</span>
            </h2>
            <WorkshopSteps />
            <div className="racing my-8 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] text-smoke">
              {WORKSHOP_SERVICES.slice(0, -1).map((s, i) => (
                <span key={s} className="contents">
                  {i > 0 && <span className="text-octane">/</span>}
                  <span>{s}</span>
                </span>
              ))}
            </div>
            <div className="pl-2">
              <SkewLink href="/workshop">Request a quote</SkewLink>
            </div>
          </div>
        </div>
      </section>

      <section className="container-pit py-28">
        <VisitBlock settings={settings} />
      </section>
    </>
  );
}
