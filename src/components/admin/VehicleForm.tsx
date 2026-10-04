'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { deleteVehicle, saveVehicle, type ActionState } from '@/app/admin/actions';
import { Icon } from '@/components/Icon';
import { VehicleCard } from '@/components/site/VehicleCard';
import type { VehicleStatus } from '@/lib/db/schema';
import { monthlyInstalment } from '@/lib/finance';
import { formatKm, formatPrice, groupDigits, vehicleSlug } from '@/lib/format';
import type { CardData, VehicleFull } from '@/lib/vehicles';
import { BODY_TYPES, COMMON_EXTRAS, CONDITIONS, FUEL_TYPES, TRANSMISSIONS } from './labels';
import { PhotoManager } from './PhotoManager';
import { useSubmitAction } from '../useSubmitAction';

const STATUSES: { value: VehicleStatus; label: string; on: string }[] = [
  { value: 'available', label: 'Available', on: 'bg-ok/15 text-ok' },
  { value: 'reserved', label: 'Reserved', on: 'bg-warn/15 text-warn' },
  { value: 'sold', label: 'Sold', on: 'bg-bad/15 text-bad' },
  { value: 'draft', label: 'Draft', on: 'bg-[#26262b] text-chalk' },
];

const digits = (s: string) => Number(String(s).replace(/\D/g, '')) || 0;

export function VehicleForm({
  vehicle,
  makes,
  finance,
  standardFooter,
  created,
}: {
  vehicle: VehicleFull | null;
  makes: string[];
  finance: { rate: number; term: number };
  standardFooter: string;
  created?: boolean;
}) {
  const [state, onSubmit, pending] = useSubmitAction<ActionState>(saveVehicle, created ? { ok: true, message: 'Vehicle created. Add more photos or details any time.' } : null);
  const errors = state?.errors ?? {};

  const [photos, setPhotos] = useState<string[]>(vehicle?.photos.map((p) => p.url) ?? []);
  const [f, setF] = useState({
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    variant: vehicle?.variant ?? '',
    year: vehicle ? String(vehicle.year) : String(new Date().getFullYear()),
    mileage: vehicle ? groupDigits(vehicle.mileage) : '',
    price: vehicle ? groupDigits(vehicle.price) : '',
    previousPrice: vehicle?.previousPrice ? groupDigits(vehicle.previousPrice) : '',
    colour: vehicle?.colour ?? '',
    bodyType: vehicle?.bodyType ?? 'SUV',
    fuelType: vehicle?.fuelType ?? 'Petrol',
    transmission: vehicle?.transmission ?? 'Automatic',
    status: (vehicle?.status ?? 'available') as VehicleStatus,
    description: vehicle?.description ?? '',
  });
  const [flags, setFlags] = useState({
    featured: vehicle?.featured ?? false,
    financeAvailable: vehicle?.financeAvailable ?? true,
    appendFooter: vehicle?.appendFooter ?? true,
  });
  const [extras, setExtras] = useState<string[]>(vehicle?.extras ?? []);
  const [customExtra, setCustomExtra] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const money = (k: 'price' | 'previousPrice' | 'mileage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = digits(e.target.value);
    setF((s) => ({ ...s, [k]: n ? groupDigits(n) : '' }));
  };

  const extraOptions = useMemo(() => [...new Set([...COMMON_EXTRAS, ...(vehicle?.extras ?? [])])].sort((a, b) => a.localeCompare(b)), [vehicle]);
  const allExtras = [...extraOptions, ...extras.filter((x) => !extraOptions.includes(x))];
  const toggleExtra = (x: string) => setExtras((list) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]));

  const price = digits(f.price);
  const pm = monthlyInstalment({ price, ratePercent: finance.rate, months: finance.term });
  const preview: CardData = {
    id: vehicle?.id ?? 0,
    stockCode: vehicle?.stockCode ?? 'NEW',
    slug: vehicle?.slug ?? vehicleSlug({ year: digits(f.year), make: f.make, model: f.model, stockCode: 'new' }),
    make: f.make || 'Make',
    model: f.model || 'Model',
    variant: f.variant,
    year: digits(f.year),
    mileage: digits(f.mileage),
    price,
    previousPrice: digits(f.previousPrice) || null,
    transmission: f.transmission,
    fuelType: f.fuelType,
    bodyType: f.bodyType,
    status: f.status,
    financeAvailable: flags.financeAvailable,
    cover: photos[0] ?? null,
  };

  function writeFromSpecs() {
    const top = extras.filter((x) => !/^(Automatic|Manual|Power Steering|Central Locking|Electric Windows|Airbags|ABS Brakes|Immobilizer)$/.test(x)).slice(0, 6);
    const text = [
      `This ${f.year} ${f.make} ${f.model}${f.variant ? ` ${f.variant}` : ''} has covered ${formatKm(digits(f.mileage))} and is finished in ${f.colour || 'a great colour'}.`,
      `It comes with ${/^[aeiou]/i.test(f.transmission) ? 'an' : 'a'} ${f.transmission.toLowerCase()} gearbox and ${f.fuelType === 'Electric' ? 'electric drivetrain' : `${f.fuelType.toLowerCase()} engine`}${extras.includes('Full Service History') ? ', backed by a full service history' : ''}.`,
      top.length ? `\nHighlights:\n${top.map((x) => `- ${x}`).join('\n')}` : '',
      `\nCome and see it at our Montague Gardens showroom or book a test drive today.`,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/ \n/g, '\n');
    setF((s) => ({ ...s, description: text }));
  }

  const err = (k: string) => (errors[k] ? <span className="text-xs text-bad">{errors[k]}</span> : null);
  const fieldCls = (k: string) => `adm-field ${errors[k] ? 'border-bad' : ''}`;

  return (
    <>
    <form onSubmit={onSubmit} className="flex flex-col">
      <input type="hidden" name="id" value={vehicle?.id ?? ''} />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />
      <input type="hidden" name="bodyType" value={f.bodyType} />
      <input type="hidden" name="fuelType" value={f.fuelType} />
      <input type="hidden" name="transmission" value={f.transmission} />
      <input type="hidden" name="status" value={f.status} />
      {extras.map((x) => (
        <input key={x} type="hidden" name="extras" value={x} />
      ))}
      {flags.featured && <input type="hidden" name="featured" value="on" />}
      {flags.financeAvailable && <input type="hidden" name="financeAvailable" value="on" />}
      {flags.appendFooter && <input type="hidden" name="appendFooter" value="on" />}

      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#1f1f23] bg-ink/95 px-[clamp(16px,3vw,32px)] py-4 backdrop-blur">
        <div className="min-w-0">
          <div className="mb-1 text-[13px] text-[#8e8e96]">
            <Link href="/admin/inventory" className="hover:text-chalk">
              Inventory
            </Link>{' '}
            / {vehicle ? vehicle.stockCode : 'New vehicle'}
          </div>
          <h1 className="truncate text-[22px] font-bold tracking-tight">{[f.make, f.model, f.variant].filter(Boolean).join(' ') || 'New vehicle'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {state && (
            <span role="status" className={`text-sm ${state.ok ? 'text-ok' : 'text-bad'}`}>
              {state.message}
            </span>
          )}
          {vehicle && (vehicle.status === 'available' || vehicle.status === 'reserved') && (
            <Link href={`/showroom/${vehicle.slug}`} target="_blank" className="adm-btn adm-btn-ghost">
              <Icon name="eye" size={16} /> View on site
            </Link>
          )}
          <button type="submit" disabled={pending} className="adm-btn adm-btn-primary min-w-32">
            {pending ? 'Saving…' : vehicle ? 'Save changes' : 'Create vehicle'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-5 px-[clamp(16px,3vw,32px)] py-6 pb-16">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <section className="adm-card flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Photos</h2>
              <span className="text-[13px] text-[#8e8e96]">Drag to reorder · first photo is the cover · {photos.length} photos</span>
            </div>
            <PhotoManager photos={photos} onChange={setPhotos} />
          </section>

          <section className="adm-card flex flex-col gap-4 p-5">
            <h2 className="text-base font-bold">Vehicle details</h2>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Stock code</span>
                <input name="stockCode" defaultValue={vehicle?.stockCode ?? ''} placeholder="Auto" className={`${fieldCls('stockCode')} uppercase`} />
                {err('stockCode')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Make *</span>
                <input name="make" value={f.make} onChange={set('make')} list="makes" required className={fieldCls('make')} />
                <datalist id="makes">
                  {makes.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                {err('make')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Model *</span>
                <input name="model" value={f.model} onChange={set('model')} required className={fieldCls('model')} />
                {err('model')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Variant</span>
                <input name="variant" value={f.variant} onChange={set('variant')} placeholder="e.g. 2.0 TSI GTI DSG" className="adm-field" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Year *</span>
                <input name="year" value={f.year} onChange={set('year')} inputMode="numeric" className={fieldCls('year')} />
                {err('year')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Mileage (km) *</span>
                <input name="mileage" value={f.mileage} onChange={money('mileage')} inputMode="numeric" className={fieldCls('mileage')} />
                {err('mileage')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Colour</span>
                <input name="colour" value={f.colour} onChange={set('colour')} className="adm-field" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Condition</span>
                <select name="condition" defaultValue={vehicle?.condition ?? 'Excellent'} className="adm-field cursor-pointer">
                  {CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <Segmented label="Body type" options={BODY_TYPES} value={f.bodyType} onChange={(v) => setF((s) => ({ ...s, bodyType: v }))} wrap />
            <div className="flex flex-wrap gap-6">
              <Segmented label="Fuel" options={FUEL_TYPES} value={f.fuelType} onChange={(v) => setF((s) => ({ ...s, fuelType: v }))} />
              <Segmented label="Transmission" options={TRANSMISSIONS} value={f.transmission} onChange={(v) => setF((s) => ({ ...s, transmission: v }))} />
            </div>
          </section>

          <section className="adm-card flex flex-col gap-4 p-5">
            <h2 className="text-base font-bold">Pricing</h2>
            <div className="grid gap-3.5 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Price (R) *</span>
                <input name="price" value={f.price} onChange={money('price')} inputMode="numeric" className={fieldCls('price')} />
                {err('price')}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="adm-label">Previous price — shows “Reduced”</span>
                <input name="previousPrice" value={f.previousPrice} onChange={money('previousPrice')} inputMode="numeric" placeholder="Optional" className="adm-field" />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="adm-label">Monthly estimate</span>
                <div className="adm-field flex items-center bg-[#0e0e10] text-octane">≈ {formatPrice(pm)} pm</div>
              </div>
            </div>
            <p className="text-[12.5px] text-[#8e8e96]">
              Estimate uses the site finance defaults ({finance.rate}% over {finance.term} months) — change them in{' '}
              <Link href="/admin/settings" className="text-octane">
                Settings
              </Link>
              .
            </p>
          </section>

          <section className="adm-card flex flex-col gap-3.5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Features &amp; extras</h2>
              <span className="text-[13px] text-[#8e8e96]">{extras.length} selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allExtras.map((x) => {
                const on = extras.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleExtra(x)}
                    className={`inline-flex min-h-8.5 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                      on ? 'border-octane/50 bg-octane/12 text-chalk' : 'border-[#2e2e33] text-[#8e8e96] hover:border-[#52525b]'
                    }`}
                  >
                    {on ? '✓' : '+'} {x}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                value={customExtra}
                onChange={(e) => setCustomExtra(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customExtra.trim()) setExtras((l) => [...new Set([...l, customExtra.trim()])]);
                    setCustomExtra('');
                  }
                }}
                placeholder="Add another feature, e.g. Harman Kardon sound"
                aria-label="Add a custom feature"
                className="adm-field max-w-md"
              />
              <button
                type="button"
                onClick={() => {
                  if (customExtra.trim()) setExtras((l) => [...new Set([...l, customExtra.trim()])]);
                  setCustomExtra('');
                }}
                className="adm-btn adm-btn-ghost"
              >
                Add
              </button>
            </div>
          </section>

          <section className="adm-card flex flex-col gap-3.5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="desc" className="text-base font-bold">
                Description
              </label>
              <button type="button" onClick={writeFromSpecs} className="adm-btn min-h-9 border border-octane/30 bg-octane/10 text-octane hover:bg-octane/15">
                <Icon name="sparkle" size={15} /> Write from specs
              </button>
            </div>
            <textarea id="desc" name="description" rows={9} value={f.description} onChange={set('description')} className="adm-field resize-y py-3 leading-relaxed" />
            <Switch
              label="Append the standard dealership footer"
              hint={standardFooter.replace(/\n/g, ' · ')}
              checked={flags.appendFooter}
              onChange={(v) => setFlags((s) => ({ ...s, appendFooter: v }))}
              boxed
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-5 xl:sticky xl:top-24">
          <section className="adm-card flex flex-col gap-4 p-5">
            <h2 className="text-base font-bold">Status</h2>
            <div className="grid grid-cols-4 gap-1 rounded-[10px] border border-[#26262b] bg-[#0e0e10] p-1" role="group" aria-label="Listing status">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={f.status === s.value}
                  onClick={() => setF((x) => ({ ...x, status: s.value }))}
                  className={`h-9 rounded-[7px] text-[13px] font-semibold ${f.status === s.value ? s.on : 'text-[#a1a1aa] hover:text-chalk'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="-mt-1 text-[12.5px] text-[#8e8e96]">
              {f.status === 'draft' ? 'Hidden from the website.' : f.status === 'sold' ? 'Removed from the showroom; the page stays up with a “sold” notice.' : 'Visible on the website.'}
            </p>
            <Switch label="Featured on homepage" hint="Shown first in “On the grid”" checked={flags.featured} onChange={(v) => setFlags((s) => ({ ...s, featured: v }))} />
            <Switch label="Finance available" hint="Shows the monthly estimate and calculator" checked={flags.financeAvailable} onChange={(v) => setFlags((s) => ({ ...s, financeAvailable: v }))} />
          </section>

          <section className="adm-card flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Live preview</h2>
              <span className="text-[12.5px] text-[#8e8e96]">as on the website</span>
            </div>
            <div className="pointer-events-none pb-1" aria-hidden="true">
              <VehicleCard v={preview} finance={finance} />
            </div>
          </section>

          {vehicle && (
            <div className="flex flex-col gap-2 text-[12.5px] text-[#71717a]">
              <span>
                Added {vehicle.createdAt.toLocaleDateString('en-ZA')} · updated {vehicle.updatedAt.toLocaleDateString('en-ZA')} · {vehicle.source === 'vmg' ? 'imported from VMG' : 'added in admin'}
              </span>
              <button
                type="submit"
                form="delete-vehicle"
                onClick={(e) => {
                  if (!confirm('Delete this vehicle and its photos? This cannot be undone. Tip: mark it as sold instead to keep the page.')) e.preventDefault();
                }}
                className="adm-btn mt-2 border border-bad/30 text-bad hover:bg-bad/10"
              >
                <Icon name="trash" size={16} /> Delete vehicle
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
    {vehicle && (
      <form id="delete-vehicle" action={deleteVehicle} hidden>
        <input type="hidden" name="id" value={vehicle.id} />
      </form>
    )}
    </>
  );
}

function Segmented({ label, options, value, onChange, wrap }: { label: string; options: string[]; value: string; onChange: (v: string) => void; wrap?: boolean }) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="adm-label">{label}</span>
      <div className={wrap ? 'flex flex-wrap gap-1.5' : 'inline-flex w-fit flex-wrap gap-1 rounded-[10px] border border-[#26262b] bg-[#0e0e10] p-1'}>
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              className={
                wrap
                  ? `min-h-9.5 rounded-lg border px-3.5 text-[14px] font-medium ${on ? 'border-octane bg-octane/14 text-octane' : 'border-[#2e2e33] text-[#a1a1aa] hover:border-[#52525b]'}`
                  : `h-8.5 rounded-[7px] px-3.5 text-[14px] font-medium ${on ? 'bg-[#26262b] text-chalk' : 'text-[#a1a1aa] hover:text-chalk'}`
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Switch({ label, hint, checked, onChange, boxed }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; boxed?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center justify-between gap-3 text-left ${boxed ? 'rounded-[10px] border border-[#26262b] bg-[#0e0e10] p-3.5' : ''}`}
    >
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        {hint && <span className="block text-[12.5px] leading-snug text-[#8e8e96]">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-octane' : 'bg-[#3a3a40]'}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
