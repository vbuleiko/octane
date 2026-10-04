import '@fontsource-variable/saira/wdth.css';
import '@fontsource-variable/saira/wdth-italic.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Octane Auto — Quality pre-owned cars in Cape Town',
    template: '%s | Octane Auto',
  },
  description:
    'Octane Auto, Montague Gardens, Cape Town. Hand-picked pre-owned vehicles, finance through all major banks, trade-ins welcome, workshop services and nationwide delivery.',
  openGraph: {
    type: 'website',
    locale: 'en_ZA',
    siteName: 'Octane Auto',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0b0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-dvh bg-ink text-chalk">{children}</body>
    </html>
  );
}
