import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { CARD_STATUSES, CARD_STATUS_LABELS, DEFAULT_STALE_DAYS } from '@/lib/constants';
import { daysSince, formatDate, formatNumber } from '@/lib/format';
import { EmptyState, PageHeader, Panel } from '@/components/ui';
import { CardsTable, type CardRow } from './table';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default async function CardsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const status = first(sp.status);
  const location = first(sp.location);
  const type = first(sp.type);
  const clientId = first(sp.client);
  const issuerId = first(sp.issuer);
  const orderId = first(sp.order);
  const holderId = first(sp.cardholder);
  const stale = first(sp.stale) === '1';
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const where: Prisma.CardWhereInput = {};
  if (q) {
    where.OR = [
      { serial: { contains: q } },
      { proxy: { contains: q } },
      { issuedTo: { contains: q } },
      { batchRef: { contains: q } },
    ];
  }
  if (status) where.status = status;
  if (location === 'none') where.locationId = null;
  else if (location) where.locationId = location;
  if (type) where.cardTypeId = type;
  if (clientId) where.clientId = clientId;
  if (issuerId) where.cardType = { issuerId };
  if (holderId) where.cardholderId = holderId;
  if (orderId) where.orderLine = { orderId };
  if (stale) {
    where.OR = [
      ...(where.OR ? [{ OR: where.OR }] : []),
      { lastVerifiedAt: null },
      { lastVerifiedAt: { lt: new Date(Date.now() - DEFAULT_STALE_DAYS * 86_400_000) } },
    ];
    if (where.OR && q) {
      // Keep the text search AND the staleness filter, rather than OR-ing them together.
      where.AND = [
        { OR: [{ serial: { contains: q } }, { proxy: { contains: q } }, { issuedTo: { contains: q } }, { batchRef: { contains: q } }] },
        { OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: new Date(Date.now() - DEFAULT_STALE_DAYS * 86_400_000) } }] },
      ];
      delete where.OR;
    }
  }

  const [cards, total, locations, cardTypes, clients, issuers, cardholders] = await Promise.all([
    prisma.card.findMany({
      where,
      include: {
        cardType: { select: { name: true, issuer: { select: { name: true } } } },
        location: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        cardholder: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.card.count({ where }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.cardType.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.issuer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.cardholder.findMany({
      where: { isActive: true, ...(clientId ? { clientId } : {}) },
      orderBy: [{ lastName: 'asc' }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, ref: true },
    }),
  ]);

  const rows: CardRow[] = cards.map((c) => {
    const d = daysSince(c.lastVerifiedAt);
    return {
      id: c.id,
      serial: c.serial,
      maskedPan: c.maskedPan,
      status: c.status,
      batchRef: c.batchRef,
      issuedTo: c.issuedTo,
      cardTypeName: c.cardType.name,
      issuerName: c.cardType.issuer.name,
      clientName: c.client?.name ?? null,
      clientId: c.client?.id ?? null,
      cardholderName: c.cardholder ? `${c.cardholder.lastName}, ${c.cardholder.firstName}` : null,
      cardholderId: c.cardholder?.id ?? null,
      locationName: c.location?.name ?? null,
      locationId: c.location?.id ?? null,
      expiryDate: c.expiryDate ? formatDate(c.expiryDate) : null,
      lastVerifiedAt: c.lastVerifiedAt ? formatDate(c.lastVerifiedAt) : null,
      daysSinceVerified: d,
      stale: d === null || d > DEFAULT_STALE_DAYS,
    };
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries({
    q,
    status,
    location,
    type,
    client: clientId,
    issuer: issuerId,
    order: orderId,
    cardholder: holderId,
    stale: stale ? '1' : '',
  })) {
    if (v) exportParams.set(k, v);
  }

  return (
    <>
      <PageHeader
        title="Cards"
        description={`${formatNumber(total)} card(s) match. Select rows to move stock, issue to a cardholder, or change status in bulk — every change is written to the movement ledger.`}
        action={
          <div className="flex gap-2">
            <Link href={`/api/export/cards?${exportParams.toString()}`} className="btn-secondary">
              Export CSV
            </Link>
            <Link href="/cards/new" className="btn-primary">
              Add card
            </Link>
          </div>
        }
      />

      <Panel className="mb-4">
        <form className="grid gap-2 p-4 md:grid-cols-4 xl:grid-cols-8">
          {orderId && <input type="hidden" name="order" value={orderId} />}
          {holderId && <input type="hidden" name="cardholder" value={holderId} />}
          <input name="q" className="input md:col-span-2" placeholder="Serial, proxy, batch or holder…" defaultValue={q} />
          <select name="client" className="input" defaultValue={clientId}>
            <option value="">Any client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="issuer" className="input" defaultValue={issuerId}>
            <option value="">Any issuer</option>
            {issuers.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <select name="status" className="input" defaultValue={status}>
            <option value="">Any status</option>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>{CARD_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select name="location" className="input" defaultValue={location}>
            <option value="">Any location</option>
            <option value="none">Unassigned</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select name="type" className="input" defaultValue={type}>
            <option value="">Any type</option>
            {cardTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" name="stale" value="1" defaultChecked={stale} className="h-4 w-4" />
              Unverified
            </label>
            <button type="submit" className="btn-primary flex-1">Filter</button>
          </div>
        </form>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title="No cards match these filters"
            hint="Try clearing the filters, or import a spreadsheet to load stock."
            action={<Link href="/import" className="btn-primary">Import spreadsheet</Link>}
          />
        ) : (
          <CardsTable
            rows={rows}
            locations={locations}
            cardholders={cardholders.map((h) => ({ id: h.id, label: `${h.lastName}, ${h.firstName} (${h.ref})` }))}
          />
        )}
      </Panel>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/cards?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page - 1) })}`} className="btn-secondary">
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link href={`/cards?${new URLSearchParams({ ...Object.fromEntries(exportParams), page: String(page + 1) })}`} className="btn-secondary">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
