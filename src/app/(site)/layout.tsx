import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';
import { Ticker } from '@/components/site/Ticker';
import { WhatsAppButton } from '@/components/site/WhatsAppButton';
import { getSettings } from '@/lib/settings';
import { publicVehicles } from '@/lib/vehicles';

// Stock and settings change from the admin at any time, so always render fresh.
export const dynamic = 'force-dynamic';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-octane focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <Ticker vehicles={publicVehicles()} extra={settings.tickerExtra} />
      <Header settings={settings} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer settings={settings} />
      {settings.whatsapp && <WhatsAppButton number={settings.whatsapp} />}
    </div>
  );
}
