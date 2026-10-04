import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { phoneHref, type Settings } from '@/lib/settings';
import { DesktopNav, MobileMenu } from './Nav';

export function Header({ settings }: { settings: Settings }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/95 backdrop-blur supports-[backdrop-filter]:bg-ink/85">
      <div className="container-pit flex items-center justify-between gap-6 py-3">
        <Link href="/" aria-label="Octane Auto home" className="shrink-0">
          <Image src="/brand/logo-circle.png" alt="Octane Auto — Your drive is our passion" width={60} height={60} priority />
        </Link>
        <DesktopNav />
        <div className="flex items-center gap-3">
          <a
            href={phoneHref(settings.phone)}
            className="skew racing hidden min-h-12 items-center bg-octane px-6 text-ink transition-colors hover:bg-octane-hot sm:inline-flex"
          >
            <span className="unskew">
              <Icon name="phone" size={16} strokeWidth={2.4} />
              {settings.phone}
            </span>
          </a>
          <MobileMenu phone={settings.phone} address={settings.address} />
        </div>
      </div>
    </header>
  );
}
