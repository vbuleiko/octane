import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { publicVehicles } from '@/lib/vehicles';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/showroom', '/finance', '/workshop', '/sell', '/about', '/contact', '/popi-policy'].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: p === '/showroom' || p === '' ? ('daily' as const) : ('monthly' as const),
    priority: p === '' ? 1 : p === '/showroom' ? 0.9 : 0.5,
  }));
  const cars = publicVehicles().map((v) => ({
    url: `${SITE_URL}/showroom/${v.slug}`,
    lastModified: v.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));
  return [...pages, ...cars];
}
