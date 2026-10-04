import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import { FinanceCalculator } from '@/components/site/FinanceCalculator';
import { Field, LeadForm, Row, SelectField, TextArea } from '@/components/site/forms';
import { Gallery } from '@/components/site/Gallery';
import { SkewA, SkewLink } from '@/components/site/SkewLink';
import { VehicleCard } from '@/components/site/VehicleCard';
import { monthlyInstalment } from '@/lib/finance';
import { formatKm, formatPrice, vehicleTitle } from '@/lib/format';
import { phoneHref, getSettings } from '@/lib/settings';
import { SITE_URL } from '@/lib/site';
import { getVehicleBySlug, relatedVehicles } from '@/lib/vehicles';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = getVehicleBySlug((await params).slug);
  if (!v) return { title: 'Car not found' };
  const title = `${v.year} ${vehicleTitle(v)} for sale — ${formatPrice(v.price)}`;
  const description = `${v.year} ${v.make} ${v.model} ${v.variant}, ${formatKm(v.mileage)}, ${v.transmission}, ${v.fuelType}, ${v.colour}. ${formatPrice(v.price)} at Octane Auto, Montague Gardens, Cape Town.`;
  return {
    title,
    description,
    alternates: { canonical: `/showroom/${v.slug}` },
    openGraph: { title, description, images: v.photos[0] ? [{ url: v.photos[0].url }] : undefined },
  };
}

export default async function VehiclePage({ params }: Props) {
  const v = getVehicleBySlug((await params).slug);
  if (!v) notFound();
  const settings = getSettings();
  const finance = { rate: settings.financeRate, term: settings.financeTerm };
  const title = `${v.make} ${v.model}`;
  const full = `${v.year} ${vehicleTitle(v)}`;
  const pm = monthlyInstalment({ price: v.price, ratePercent: finance.rate, months: finance.term });
  const related = relatedVehicles(v, 4);
  const sold = v.status === 'sold';
  const description = [v.description, v.appendFooter ? settings.standardFooter : ''].filter(Boolean).join('\n\n');

  const specs: [IconName, string, string][] = [
    ['calendar', 'Year', String(v.year)],
    ['gauge', 'Mileage', formatKm(v.mileage)],
    ['gear', 'Gearbox', v.transmission],
    ['fuel', 'Fuel', v.fuelType],
    ['car', 'Body', v.bodyType],
    ['palette', 'Colour', v.colour],
    ['shield', 'Condition', v.condition],
    ['file', 'Stock no.', v.stockCode],
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: full,
    brand: { '@type': 'Brand', name: v.make },
    model: v.model,
    vehicleModelDate: String(v.year),
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: v.mileage, unitCode: 'KMT' },
    color: v.colour,
    bodyType: v.bodyType,
    fuelType: v.fuelType,
    vehicleTransmission: v.transmission,
    itemCondition: 'https://schema.org/UsedCondition',
    sku: v.stockCode,
    image: v.photos.slice(0, 5).map((p) => (p.url.startsWith('/') ? SITE_URL + p.url : p.url)),
    url: `${SITE_URL}/showroom/${v.slug}`,
    offers: {
      '@type': 'Offer',
      price: v.price,
      priceCurrency: 'ZAR',
      availability: sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', name: 'Octane Auto', telephone: settings.phone, address: settings.address },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="container-pit pt-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ash">
          <Link href="/showroom" className="hover:text-chalk">
            Showroom
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={`/showroom?make=${encodeURIComponent(v.make)}`} className="hover:text-chalk">
            {v.make}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-smoke">
            {v.model} {v.variant}
          </span>
        </nav>
      </div>

      {sold && (
        <div className="container-pit pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-bad bg-panel p-5">
            <p className="racing text-lg tracking-normal">This car has been sold. Similar cars are listed below.</p>
            <SkewLink href={`/showroom?body=${encodeURIComponent(v.bodyType)}`} variant="ghost">
              Browse similar
            </SkewLink>
          </div>
        </div>
      )}

      <section className="container-pit flex flex-wrap items-start gap-8 py-8 lg:gap-12">
        <div className="min-w-0 flex-[1.6_1_560px]">
          <Gallery photos={v.photos.map((p) => p.url)} alt={full} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6 lg:sticky lg:top-28">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="eyebrow">Stock {v.stockCode}</span>
              {v.status === 'reserved' && <span className="racing bg-warn px-2.5 py-0.5 text-xs text-ink">Reserved</span>}
              {sold && <span className="racing bg-bad px-2.5 py-0.5 text-xs text-ink">Sold</span>}
            </div>
            <h1 className="display text-[clamp(44px,5vw,72px)]">
              <span className="text-ash">{v.year}</span> {title}
            </h1>
            <p className="racing mt-2 text-xl tracking-normal text-smoke">{v.variant}</p>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pl-1.5">
            <span className="skew racing bg-octane px-5 py-2 text-[clamp(32px,3.4vw,44px)] font-black text-ink">
              <span className="unskew">{formatPrice(v.price)}</span>
            </span>
            {v.financeAvailable && !sold && (
              <a href="#finance" className="pb-1.5 text-smoke hover:text-chalk">
                ≈ <strong className="text-chalk">{formatPrice(pm)}</strong> pm
              </a>
            )}
          </div>
          {v.previousPrice && v.previousPrice > v.price && (
            <p className="-mt-3 text-sm text-ash">
              Was <s>{formatPrice(v.previousPrice)}</s> — reduced by {formatPrice(v.previousPrice - v.price)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-px bg-line">
            {specs.slice(0, 4).map(([icon, label, value]) => (
              <div key={label} className="flex items-center gap-3 bg-panel p-3.5">
                <Icon name={icon} size={20} className="text-octane" />
                <div>
                  <div className="label-caps text-[10px]">{label}</div>
                  <div className="font-semibold">{value || '—'}</div>
                </div>
              </div>
            ))}
          </div>

          {!sold && (
            <div className="flex flex-wrap gap-3 pl-1.5">
              <SkewA href="#enquire" className="min-h-14 flex-1 text-lg">
                Enquire now
              </SkewA>
              <SkewA href={phoneHref(settings.phone)} variant="ghost" className="min-h-14 flex-1 text-lg">
                <Icon name="phone" size={18} strokeWidth={2.4} /> Call
              </SkewA>
              {settings.whatsapp && (
                <SkewA
                  href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Octane Auto, I'm interested in the ${full} (${v.stockCode}): ${SITE_URL}/showroom/${v.slug}`)}`}
                  target="_blank"
                  rel="noopener"
                  variant="ghost"
                  className="min-h-14 flex-1 text-lg"
                >
                  WhatsApp
                </SkewA>
              )}
            </div>
          )}

          <ul className="grid gap-2.5 text-[15px] text-smoke">
            {(
              [
                ['money', 'Finance through all major banks'],
                ['swap', 'Trade-ins welcome'],
                ['truck', 'Nationwide delivery on request'],
                ['shield', 'Optional 2-year Prestige warranty, unlimited km'],
              ] as [IconName, string][]
            ).map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <Icon name={icon} size={18} className="text-octane" /> {text}
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="container-pit grid gap-10 pb-6 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
        <div className="flex flex-col gap-10">
          <div>
            <h2 className="display mb-5 text-4xl">Specifications</h2>
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              {specs.map(([icon, label, value]) => (
                <div key={label} className="flex flex-col gap-1.5 bg-panel p-4">
                  <dt className="label-caps flex items-center gap-2 text-[10.5px]">
                    <Icon name={icon} size={15} className="text-octane" /> {label}
                  </dt>
                  <dd className="font-semibold">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>

          {v.extras.length > 0 && (
            <div>
              <h2 className="display mb-5 text-4xl">
                Features <span className="text-octane">&amp; extras</span>
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:gap-x-6 xl:grid-cols-3">
                {v.extras.map((x) => (
                  <li key={x} className="flex items-start gap-2 text-[14px] sm:gap-2.5 sm:text-[15px]">
                    <Icon name="check" size={18} strokeWidth={3} className="mt-0.5 shrink-0 text-octane" /> {x}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {description && (
            <div>
              <h2 className="display mb-5 text-4xl">About this car</h2>
              <div className="max-w-3xl whitespace-pre-line text-[16.5px] leading-relaxed text-smoke">{description}</div>
            </div>
          )}
        </div>

        {!sold && (
          <div id="enquire" className="scroll-mt-28">
            <h2 className="display mb-2 text-4xl">
              Make it <span className="text-octane">yours</span>
            </h2>
            <p className="mb-6 text-smoke">Ask a question, book a test drive or start your finance. We reply during trading hours.</p>
            <LeadForm type="enquiry" vehicleId={v.id} submitLabel="Send enquiry">
              <SelectField name="intent" label="I'd like to" options={['Ask about this car', 'Book a test drive', 'Finance this car', 'Trade in my car']} />
              <Field name="name" label="Full name" required autoComplete="name" />
              <Row>
                <Field name="phone" label="Phone" required type="tel" autoComplete="tel" />
                <Field name="email" label="Email" type="email" autoComplete="email" />
              </Row>
              <TextArea name="message" label="Message" defaultValue={`Hi, I'm interested in the ${full} (${v.stockCode}).`} />
            </LeadForm>
          </div>
        )}
      </section>

      {v.financeAvailable && !sold && (
        <section id="finance" className="container-pit scroll-mt-28 pt-16">
          <div className="flex flex-wrap items-start gap-10">
            <div className="min-w-0 flex-[1_1_340px]">
              <h2 className="display mb-4 text-[clamp(40px,5vw,68px)]">
                Finance <span className="text-octane">this car</span>
              </h2>
              <p className="mb-6 max-w-md text-smoke">
                Adjust the deposit, term and rate to see your instalment. We submit your application to all major banks to get the best rate.
              </p>
              <SkewA href={settings.financeApplyUrl} target="_blank" rel="noopener">
                Apply online <Icon name="external" size={16} />
              </SkewA>
            </div>
            <div className="min-w-0 flex-[1_1_520px]">
              <FinanceCalculator price={v.price} rate={finance.rate} term={finance.term} lockPrice />
            </div>
          </div>
        </section>
      )}

      {!sold && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="min-w-0 flex-1">
              <div className="racing truncate text-xl tracking-normal">{formatPrice(v.price)}</div>
              {v.financeAvailable && <div className="text-xs text-ash">≈ {formatPrice(pm)} pm</div>}
            </div>
            <a href={phoneHref(settings.phone)} aria-label="Call Octane Auto" className="flex size-12 items-center justify-center border-2 border-chalk">
              <Icon name="phone" size={20} strokeWidth={2.4} />
            </a>
            <a href="#enquire" className="racing skew flex min-h-12 items-center bg-octane px-5 text-ink">
              <span className="unskew">Enquire</span>
            </a>
          </div>
          <div className="h-20 lg:hidden" aria-hidden="true" />
        </>
      )}

      {related.length > 0 && (
        <section className="container-pit py-24">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
            <h2 className="display text-[clamp(40px,5vw,68px)]">
              You might <span className="text-octane">also like</span>
            </h2>
            <SkewLink href="/showroom" variant="ghost">
              Full showroom →
            </SkewLink>
          </div>
          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
            {related.map((r) => (
              <VehicleCard key={r.id} v={r} finance={finance} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
