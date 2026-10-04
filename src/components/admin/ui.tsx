import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions, crumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1f1f23] px-[clamp(16px,3vw,32px)] py-5">
      <div className="min-w-0">
        {crumb && <div className="mb-1 text-[13px] text-[#8e8e96]">{crumb}</div>}
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[13px] text-[#8e8e96]">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 px-[clamp(16px,3vw,32px)] py-6 pb-12">{children}</div>;
}

export function Kpi({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="adm-card px-5 py-4">
      <div className="mb-2 text-[13px] text-[#a1a1aa]">{label}</div>
      <div className={`text-[28px] font-bold tracking-tight ${accent ? 'text-octane' : ''}`}>{value}</div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  available: 'bg-ok/12 text-ok',
  reserved: 'bg-warn/12 text-warn',
  sold: 'bg-bad/12 text-bad',
  draft: 'bg-[#26262b] text-[#a1a1aa]',
  new: 'bg-octane/15 text-octane',
  in_progress: 'bg-warn/12 text-warn',
  closed: 'bg-[#26262b] text-[#a1a1aa]',
};

const STATUS_LABELS: Record<string, string> = { in_progress: 'In progress' };

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold ${STATUS_STYLES[status] ?? ''}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function Section({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`adm-card flex flex-col gap-4 p-5 ${className}`}>
      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {aside && <div className="text-[13px] text-[#8e8e96]">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
