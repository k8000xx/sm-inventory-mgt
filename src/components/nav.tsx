'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Grouped so the day-to-day card lifecycle sits together and the reference data
 * everything else depends on sits apart from it.
 */
const GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: 'Lifecycle',
    links: [
      { href: '/orders', label: 'Orders' },
      { href: '/deliveries', label: 'Deliveries' },
      { href: '/registrations', label: 'Registrations' },
      { href: '/disposals', label: 'Disposals' },
    ],
  },
  {
    label: 'Inventory',
    links: [
      { href: '/cards', label: 'Cards' },
      { href: '/stock-counts', label: 'Stock counts' },
      { href: '/movements', label: 'Movements' },
      { href: '/import', label: 'Import' },
    ],
  },
  {
    label: 'Records',
    links: [
      { href: '/clients', label: 'Clients' },
      { href: '/cardholders', label: 'Cardholders' },
      { href: '/locations', label: 'Locations' },
      { href: '/card-types', label: 'Card types' },
      { href: '/issuers', label: 'Issuers' },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white">
            PC
          </span>
          <span className="text-sm font-semibold text-slate-900">Prepaid Card Admin</span>
        </Link>

        <Link
          href="/"
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            isActive('/') ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Dashboard
        </Link>

        {GROUPS.map((group) => (
          <div key={group.label} className="flex items-center gap-1 border-l border-slate-200 pl-4">
            <span className="mr-1 hidden text-[10px] font-semibold uppercase tracking-wider text-slate-400 lg:inline">
              {group.label}
            </span>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </header>
  );
}
