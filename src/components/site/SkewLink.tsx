import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const VARIANTS = {
  primary: 'bg-octane text-ink hover:bg-octane-hot',
  ghost: 'border-2 border-chalk text-chalk hover:bg-chalk hover:text-ink',
  dark: 'bg-ink text-chalk hover:bg-panel-2',
  'outline-dark': 'border-2 border-ink text-ink hover:bg-ink hover:text-chalk',
} as const;

type Variant = keyof typeof VARIANTS;

const base =
  'skew racing inline-flex items-center justify-center min-h-12 px-7 text-base transition-colors duration-200 select-none';

export function skewClass(variant: Variant = 'primary', extra = '') {
  return `${base} ${VARIANTS[variant]} ${extra}`;
}

export function SkewLink({
  variant = 'primary',
  className = '',
  children,
  ...props
}: { variant?: Variant; children: ReactNode } & ComponentProps<typeof Link>) {
  return (
    <Link className={skewClass(variant, className)} {...props}>
      <span className="unskew">{children}</span>
    </Link>
  );
}

export function SkewButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: { variant?: Variant; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button className={skewClass(variant, `cursor-pointer disabled:opacity-60 disabled:cursor-wait ${className}`)} {...props}>
      <span className="unskew">{children}</span>
    </button>
  );
}

export function SkewA({
  variant = 'primary',
  className = '',
  children,
  ...props
}: { variant?: Variant; children: ReactNode } & ComponentProps<'a'>) {
  return (
    <a className={skewClass(variant, className)} {...props}>
      <span className="unskew">{children}</span>
    </a>
  );
}
