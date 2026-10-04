export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export const NAV = [
  { href: '/showroom', label: 'Showroom' },
  { href: '/finance', label: 'Finance' },
  { href: '/workshop', label: 'Workshop' },
  { href: '/sell', label: 'Sell your car' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;
