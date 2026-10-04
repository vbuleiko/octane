'use client';

import { useId, useState } from 'react';
import { financeSummary, RATE_MAX, RATE_MIN, TERMS } from '@/lib/finance';
import { formatPrice } from '@/lib/format';

export function FinanceCalculator({
  price: initialPrice = 299995,
  rate: initialRate = 12,
  term: initialTerm = 72,
  lockPrice = false,
}: {
  price?: number;
  rate?: number;
  term?: number;
  lockPrice?: boolean;
}) {
  const id = useId();
  const [price, setPrice] = useState(initialPrice);
  const [deposit, setDeposit] = useState(Math.round((initialPrice * 0.1) / 5000) * 5000);
  const [rate, setRate] = useState(initialRate);
  const [term, setTerm] = useState<number>(initialTerm);
  const [balloon, setBalloon] = useState(0);

  const safeDeposit = Math.min(deposit, price);
  const s = financeSummary({ price, deposit: safeDeposit, ratePercent: rate, months: term, balloon: (price - safeDeposit) * (balloon / 100) });
  const maxDeposit = Math.max(50000, Math.round((price * 0.5) / 5000) * 5000);

  return (
    <div className="flex flex-col gap-6 border-t-4 border-octane bg-panel p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="label-caps mb-1.5">Monthly instalment</div>
          <output htmlFor={`${id}-price ${id}-dep ${id}-rate`} aria-live="polite" className="display block text-6xl tabular-nums text-octane sm:text-7xl lg:text-[88px]">
            {formatPrice(s.monthly)}
          </output>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm tabular-nums">
          <dt className="text-ash">Loan</dt>
          <dd className="text-right font-bold">{formatPrice(s.loan)}</dd>
          <dt className="text-ash">Interest</dt>
          <dd className="text-right font-bold">{formatPrice(s.interest)}</dd>
          <dt className="text-ash">Total</dt>
          <dd className="text-right font-bold">{formatPrice(s.total)}</dd>
        </dl>
      </div>

      {!lockPrice && (
        <Slider
          id={`${id}-price`}
          label="Vehicle price"
          value={formatPrice(price)}
          input={{ min: 50000, max: 1200000, step: 5000, value: price, onChange: setPrice }}
        />
      )}
      <Slider
        id={`${id}-dep`}
        label="Deposit / trade-in"
        value={formatPrice(safeDeposit)}
        input={{ min: 0, max: maxDeposit, step: 5000, value: safeDeposit, onChange: setDeposit }}
      />
      <Slider
        id={`${id}-rate`}
        label="Interest rate"
        value={`${rate.toFixed(2)}%`}
        input={{ min: RATE_MIN, max: RATE_MAX, step: 0.25, value: rate, onChange: setRate }}
      />
      <Slider
        id={`${id}-balloon`}
        label="Balloon payment"
        value={`${balloon}%`}
        input={{ min: 0, max: 40, step: 5, value: balloon, onChange: setBalloon }}
      />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="label-caps mb-2.5">Term (months)</legend>
        <div className="grid grid-cols-4 gap-2 px-1.5 sm:grid-cols-7">
          {TERMS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={t === term}
              onClick={() => setTerm(t)}
              className={`skew racing min-h-11 border-2 text-lg font-black transition-colors ${
                t === term ? 'border-octane bg-octane text-ink' : 'border-[#3a3a3e] text-chalk hover:border-chalk'
              }`}
            >
              <span className="unskew">{t}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs leading-relaxed text-ash">
        Estimate only. Your final rate depends on the bank&apos;s credit assessment. Initiation and service fees not included.
      </p>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  input,
}: {
  id: string;
  label: string;
  value: string;
  input: { min: number; max: number; step: number; value: number; onChange: (n: number) => void };
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label-caps">
          {label}
        </label>
        <span className="racing text-xl tabular-nums tracking-normal">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={input.min}
        max={input.max}
        step={input.step}
        value={input.value}
        onChange={(e) => input.onChange(Number(e.target.value))}
        className="h-7 w-full cursor-pointer"
      />
    </div>
  );
}
