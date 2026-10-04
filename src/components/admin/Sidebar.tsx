'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { logout } from '@/app/admin/actions';
import { Icon, type IconName } from '@/components/Icon';
import type { SessionUser } from '@/lib/auth';

type Item = { href: string; label: string; icon: IconName; badge?: number; exact?: boolean };

export function AdminSidebar({ user, stock, newLeads }: { user: SessionUser; stock: number; newLeads: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { href: '/admin', label: 'Dashboard', icon: 'grid', exact: true },
        { href: '/admin/inventory', label: 'Inventory', icon: 'car', badge: stock, exact: true },
        { href: '/admin/inventory/new', label: 'Add vehicle', icon: 'plus' },
      ],
    },
    { title: 'Customers', items: [{ href: '/admin/leads', label: 'Leads', icon: 'inbox', badge: newLeads }] },
    {
      title: 'Website',
      items: [
        { href: '/admin/settings', label: 'Settings', icon: 'sliders' },
        { href: '/', label: 'View website', icon: 'eye', exact: true },
      ],
    },
  ];
  const active = (i: Item) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)) || (i.href === '/admin/inventory' && /^\/admin\/inventory\/\d+/.test(pathname));

  return (
    <aside className="flex min-w-0 max-w-full flex-[1_1_248px] flex-col border-b border-[#1f1f23] bg-[#0e0e10] lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <Link href="/admin" className="flex items-center gap-3">
          <Image src="/brand/logo-circle.png" alt="Octane Auto" width={40} height={40} />
          <div>
            <div className="text-[15px] font-bold">Octane Admin</div>
            <div className="text-xs text-ash">octaneauto.co.za</div>
          </div>
        </Link>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Toggle menu" className="adm-btn adm-btn-ghost size-11 px-0 lg:hidden">
          <Icon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </div>
      <nav aria-label="Admin" className={`flex-1 flex-col gap-1 px-3 pb-4 text-[14.5px] font-medium lg:flex ${open ? 'flex' : 'hidden'}`}>
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {g.title && <div className="mt-4 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#71717a]">{g.title}</div>}
            {g.items.map((i) => {
              const on = active(i);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-lg px-3 transition-colors ${on ? 'bg-octane/12 text-octane' : 'text-[#a1a1aa] hover:bg-[#17171a] hover:text-chalk'}`}
                >
                  <Icon name={i.icon} size={18} strokeWidth={1.8} />
                  {i.label}
                  {!!i.badge && (
                    <span className={`ml-auto rounded-full px-2 text-xs font-semibold ${i.href === '/admin/leads' ? 'bg-octane text-ink' : 'text-ash'}`}>{i.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-3 border-t border-[#1f1f23] px-3 pt-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-octane font-bold text-ink">{user.name.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1 text-[13.5px]">
            <div className="truncate font-semibold">{user.name}</div>
            <div className="truncate text-xs text-ash">{user.email}</div>
          </div>
          <form action={logout}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="adm-btn adm-btn-ghost size-10 px-0">
              <Icon name="logout" size={17} />
            </button>
          </form>
        </div>
      </nav>
    </aside>
  );
}
