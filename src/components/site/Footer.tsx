import Image from 'next/image';
import Link from 'next/link';
import { phoneHref, type Settings } from '@/lib/settings';
import { NAV } from '@/lib/site';

export function Footer({ settings }: { settings: Settings }) {
  return (
    <footer className="mt-auto bg-black">
      <div className="checker h-6 [--checker-size:24px]" aria-hidden="true" />
      <div className="container-pit grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-4">
          <Image src="/brand/logo-circle.png" alt="Octane Auto" width={84} height={84} />
          <p className="max-w-60 text-[15px] leading-relaxed text-ash">
            Buying, selling, finance and workshop. Your one-stop automotive destination in Montague Gardens, Cape Town.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 text-[15px] font-semibold">
          <h2 className="racing mb-1 text-sm tracking-[0.14em] text-octane">Navigate</h2>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="w-fit hover:text-octane">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 text-[15px] text-smoke">
          <h2 className="racing mb-1 text-sm tracking-[0.14em] text-octane">Trading hours</h2>
          {settings.hours.map((h) => (
            <span key={h.label}>
              {h.label}: {h.value}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 text-[15px] text-smoke">
          <h2 className="racing mb-1 text-sm tracking-[0.14em] text-octane">Contact</h2>
          <a href={phoneHref(settings.phone)} className="w-fit font-semibold text-chalk hover:text-octane">
            {settings.phone}
          </a>
          <a href={`mailto:${settings.email}`} className="w-fit hover:text-octane">
            {settings.email}
          </a>
          <a href={settings.mapUrl} target="_blank" rel="noopener" className="w-fit hover:text-octane">
            {settings.address}
          </a>
        </div>
      </div>
      <div className="border-t border-line-soft">
        <div className="container-pit flex flex-wrap justify-between gap-3 py-5 text-[13px] text-ash">
          <span>© {new Date().getFullYear()} Octane Auto. All rights reserved.</span>
          <Link href="/popi-policy" className="hover:text-chalk">
            POPI Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
