'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { NAV } from '@/lib/site';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`racing relative py-2 text-[15px] transition-colors hover:text-octane ${active ? 'text-octane' : 'text-chalk'}`}
          >
            {item.label}
            {active && <span className="skew absolute -bottom-0.5 left-0 right-0 h-[3px] bg-octane" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu({ phone, address }: { phone: string; address: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex size-12 items-center justify-center border-2 border-chalk text-chalk"
      >
        <Icon name="menu" size={22} strokeWidth={2.4} />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col bg-ink">
          <div className="checker h-6 shrink-0 [--checker-size:24px]" aria-hidden="true" />
          <div className="container-pit flex items-center justify-between py-4">
            <span className="eyebrow">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex size-12 items-center justify-center border-2 border-chalk"
            >
              <Icon name="close" size={22} strokeWidth={2.4} />
            </button>
          </div>
          <nav aria-label="Main" className="container-pit flex flex-1 flex-col gap-1 overflow-y-auto py-4">
            <Link href="/" className="display py-2 text-5xl">
              Home
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`display py-2 text-5xl ${isActive(pathname, item.href) ? 'text-octane' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="container-pit flex flex-col gap-3 border-t border-line-soft py-6">
            <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="racing flex min-h-12 items-center justify-center gap-3 bg-octane text-lg text-ink">
              <Icon name="phone" size={18} strokeWidth={2.4} /> Call {phone}
            </a>
            <p className="text-center text-sm text-ash">{address}</p>
          </div>
        </div>
      )}
    </div>
  );
}
