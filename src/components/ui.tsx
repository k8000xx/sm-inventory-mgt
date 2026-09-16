import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  CARD_STATUS_LABELS,
  LOCATION_TYPE_LABELS,
  MOVEMENT_TYPE_LABELS,
  type CardStatus,
  type LocationType,
  type MovementType,
} from '@/lib/constants';

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-header">
          <h2 className="panel-title">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'warn' | 'danger' | 'good';
  href?: string;
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    danger: 'text-red-700',
  }[tone];

  const body = (
    <div className="panel h-full px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    body
  );
}

const STATUS_TONES: Record<CardStatus, string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  IN_TRANSIT: 'bg-sky-50 text-sky-700 ring-sky-200',
  ISSUED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  REGISTERED: 'bg-violet-50 text-violet-700 ring-violet-200',
  RETURNED: 'bg-teal-50 text-teal-700 ring-teal-200',
  LOST: 'bg-red-50 text-red-700 ring-red-200',
  DAMAGED: 'bg-orange-50 text-orange-700 ring-orange-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
  DISPOSED: 'bg-slate-200 text-slate-700 ring-slate-300',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status as CardStatus] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  const label = CARD_STATUS_LABELS[status as CardStatus] ?? status;
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

export function LocationBadge({ type }: { type: string }) {
  const label = LOCATION_TYPE_LABELS[type as LocationType] ?? type;
  const tone =
    type === 'VESSEL'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : type === 'WAREHOUSE'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

export function MovementBadge({ type }: { type: string }) {
  const label = MOVEMENT_TYPE_LABELS[type as MovementType] ?? type;
  return (
    <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      {label}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'good';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone];
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${tones}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : ''}>{children}</div>
    </div>
  );
}
