'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/cards', label: 'Cards' },
  { href: '/locations', label: 'Locations' },
  { href: '/stock-counts', label: 'Stock counts' },
  { href: '/import', label: 'Import' },
  { href: '/movements', label: 'Movements' },
  { href: '/card-types', label: 'Card types' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white">
            PC
          </span>
          <span className="text-sm font-semibold text-slate-900">Prepaid Card Inventory</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
