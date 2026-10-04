import Image from 'next/image';
import Link from 'next/link';
import { monthlyInstalment } from '@/lib/finance';
import { formatKm, formatPrice, shortTrans } from '@/lib/format';
import type { CardData as Card } from '@/lib/vehicles';

export type FinanceDefaults = { rate: number; term: number };

export function VehicleCard({
  v,
  finance,
  position,
  priority,
  className = '',
}: {
  v: Card;
  finance: FinanceDefaults;
  position?: number;
  priority?: boolean;
  className?: string;
}) {
  const pm = monthlyInstalment({ price: v.price, ratePercent: finance.rate, months: finance.term });
  const reduced = v.previousPrice && v.previousPrice > v.price;
  return (
    <Link
      href={`/showroom/${v.slug}`}
      className={`group flex-col bg-panel transition-transform duration-300 hover:-translate-y-1.5 focus-visible:-translate-y-1.5 ${className || 'flex'}`}
    >
      <div className="relative">
        <div className="relative aspect-[4/3] overflow-hidden bg-panel-2">
          {v.cover ? (
            <Image
              src={v.cover}
              alt={`${v.year} ${v.make} ${v.model} ${v.variant}`}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 320px, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ash">Photos coming soon</div>
          )}
        </div>
        {position !== undefined && (
          <span className="racing absolute left-0 top-0 bg-ink px-3 py-1 text-lg font-black">P{position}</span>
        )}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          {v.status === 'reserved' && <span className="racing bg-warn px-2.5 py-0.5 text-xs text-ink">Reserved</span>}
          {reduced && <span className="racing bg-chalk px-2.5 py-0.5 text-xs text-ink">Reduced</span>}
        </div>
        <span className="skew racing absolute -bottom-4 left-3.5 bg-octane px-4 py-1.5 text-[22px] font-black text-ink transition-colors group-hover:bg-chalk">
          <span className="unskew">{formatPrice(v.price)}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-4.5 pb-4.5 pt-8">
        <h3 className="racing text-[19px] leading-tight tracking-normal">
          {v.make} {v.model} <span className="text-smoke">{v.variant}</span>
        </h3>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[13.5px] font-semibold uppercase tracking-wider text-ash">
          <span>{v.year}</span>
          <span className="text-octane">/</span>
          <span>{formatKm(v.mileage)}</span>
          <span className="text-octane">/</span>
          <span>{shortTrans(v.transmission)}</span>
          {v.fuelType && (
            <>
              <span className="text-octane">/</span>
              <span>{v.fuelType}</span>
            </>
          )}
        </div>
        <div className="mt-auto flex justify-between border-t border-line pt-3 text-[13.5px] text-ash">
          <span>{v.stockCode}</span>
          {v.financeAvailable && (
            <span>
              ≈ <strong className="text-chalk">{formatPrice(pm)}</strong> pm
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
