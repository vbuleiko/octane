import { formatPrice } from '@/lib/format';
import type { VehicleCard } from '@/lib/vehicles';

export function Ticker({ vehicles, extra }: { vehicles: VehicleCard[]; extra: string }) {
  const items = [
    ...vehicles.slice(0, 7).map((v, i) => `${i === 0 ? 'New in // ' : ''}${v.year} ${v.make} ${v.model} · ${formatPrice(v.price)}`),
    ...(extra ? [extra] : []),
  ];
  if (!items.length) return null;
  const run = (hidden: boolean) => (
    <div className="flex shrink-0 gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden whitespace-nowrap bg-octane text-ink">
      <div className="racing flex w-max animate-ticker py-2 text-sm hover:[animation-play-state:paused]">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}
