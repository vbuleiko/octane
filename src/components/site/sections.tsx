import Image from 'next/image';
import Link from 'next/link';
import { phoneHref, type Settings } from '@/lib/settings';
import { SkewA, SkewLink } from './SkewLink';

export function PageHero({ eyebrow, title, accent, children }: { eyebrow: string; title: string; accent?: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-line-soft">
      <div aria-hidden="true" className="display stroke-text pointer-events-none absolute -left-[2vw] top-2 whitespace-nowrap text-[clamp(110px,20vw,300px)] leading-[0.8]">
        {title.split(' ')[0]}
      </div>
      <div className="container-pit relative py-[clamp(48px,7vw,96px)]">
        <div className="mb-5 flex items-center gap-3">
          <span aria-hidden="true" className="checker size-7 [--checker-size:14px]" />
          <span className="eyebrow">{eyebrow}</span>
        </div>
        <h1 className="display text-[clamp(52px,8vw,120px)]">
          {title} {accent && <span className="text-octane">{accent}</span>}
        </h1>
        {children && <div className="mt-6 max-w-2xl text-lg leading-relaxed text-smoke">{children}</div>}
      </div>
    </section>
  );
}

export function ServicePanels() {
  const panels = [
    {
      n: '01',
      title: 'Finance & insurance',
      text: 'Apply online or download the individual or company application form. We submit to all major banks.',
      cta: 'Apply now',
      href: '/finance',
    },
    {
      n: '02',
      title: 'Workshop',
      text: 'Services, brakes, shocks, engine overhauls and diagnostics. We collect and deliver within 30 km.',
      cta: 'Book a pit stop',
      href: '/workshop',
    },
    {
      n: '03',
      title: 'Sell or trade in',
      text: 'We buy cars too. Send us the details and photos of yours for an offer or a trade-in value.',
      cta: 'Value my car',
      href: '/sell',
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {panels.map((p) => (
        <Link
          key={p.n}
          href={p.href}
          className="group flex min-h-80 flex-col gap-4 bg-panel-2 px-7 py-8 transition-colors duration-300 hover:bg-octane hover:text-ink"
        >
          <span className="display text-[88px] text-transparent [-webkit-text-stroke:2px_var(--color-octane)] group-hover:[-webkit-text-stroke-color:var(--color-ink)]">
            {p.n}
          </span>
          <h3 className="display text-[32px] font-black">{p.title}</h3>
          <p className="text-base leading-relaxed text-smoke group-hover:text-ink">{p.text}</p>
          <span className="racing mt-auto text-[15px] tracking-[0.1em]">{p.cta} →</span>
        </Link>
      ))}
    </div>
  );
}

export const WORKSHOP_STEPS = [
  'Send your requirements',
  'Get a quotation',
  'We collect (within 30 km)',
  'We do the work',
  'Quality control',
  'Payment processed',
  'Delivered back to you',
];

export const WORKSHOP_SERVICES = ['Minor service', 'Major service', 'Brakes', 'Shocks', 'Engine overhaul', 'Diagnostics', 'Other'];

export function WorkshopSteps() {
  return (
    <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {WORKSHOP_STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-3.5 bg-panel px-4 py-3.5">
          <span className="display min-w-9 text-3xl text-octane">{String(i + 1).padStart(2, '0')}</span>
          <span className="text-[15px] font-semibold">{s}</span>
        </li>
      ))}
      <li className="checker flex items-center px-4 py-3.5 [--checker-size:22px]">
        <span className="racing bg-ink px-2.5 py-1 text-[15px]">Finish</span>
      </li>
    </ol>
  );
}

export function VisitBlock({ settings }: { settings: Settings }) {
  return (
    <div className="flex flex-wrap">
      <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6 bg-octane p-[clamp(24px,4vw,52px)] text-ink">
        <h2 className="display text-[clamp(40px,5vw,68px)]">
          Pull in
          <br />
          to the showroom
        </h2>
        <p className="text-[19px] font-semibold leading-snug">{settings.address}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
          {settings.hours.map((h) => (
            <div key={h.label} className="contents">
              <dt className="font-bold uppercase tracking-wider">{h.label}</dt>
              <dd className="font-semibold">{h.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap gap-3.5 pl-2">
          <SkewA href={settings.mapUrl} target="_blank" rel="noopener" variant="dark">
            Get directions
          </SkewA>
          <SkewA href={phoneHref(settings.phone)} variant="outline-dark">
            {settings.phone}
          </SkewA>
        </div>
      </div>
      <div className="relative min-h-96 min-w-0 flex-[1_1_520px]">
        <Image src="/images/showroom.jpg" alt="Inside the Octane Auto showroom in Montague Gardens" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
    </div>
  );
}

export function CtaStrip({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <section className="container-pit py-20">
      <div className="flex flex-wrap items-center justify-between gap-6 border-l-4 border-octane bg-panel px-6 py-8 sm:px-10">
        <div>
          <h2 className="display text-4xl sm:text-5xl">{title}</h2>
          <p className="mt-2 text-smoke">{text}</p>
        </div>
        <SkewLink href={href}>{cta}</SkewLink>
      </div>
    </section>
  );
}
