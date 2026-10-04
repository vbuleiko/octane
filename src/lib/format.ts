export function groupDigits(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatPrice(n: number) {
  return `R ${groupDigits(n)}`;
}

export function formatKm(n: number) {
  return `${groupDigits(n)} km`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: Date) {
  return d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function vehicleSlug(v: { year: number; make: string; model: string; stockCode: string }) {
  return slugify(`${v.year} ${v.make} ${v.model} ${v.stockCode}`);
}

export function vehicleTitle(v: { make: string; model: string; variant?: string | null }) {
  return [v.make, v.model, v.variant].filter(Boolean).join(' ');
}

/** Short transmission label for cards. */
export function shortTrans(t: string) {
  return /auto/i.test(t) ? 'Auto' : /man/i.test(t) ? 'Manual' : t;
}
