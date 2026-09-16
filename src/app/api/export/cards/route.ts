import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DEFAULT_STALE_DAYS } from '@/lib/constants';
import { csvResponse, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const status = sp.get('status') ?? '';
  const location = sp.get('location') ?? '';
  const type = sp.get('type') ?? '';
  const stale = sp.get('stale') === '1';

  const filters: Prisma.CardWhereInput[] = [];
  if (q) {
    filters.push({
      OR: [
        { serial: { contains: q } },
        { proxy: { contains: q } },
        { issuedTo: { contains: q } },
        { batchRef: { contains: q } },
      ],
    });
  }
  if (status) filters.push({ status });
  if (location === 'none') filters.push({ locationId: null });
  else if (location) filters.push({ locationId: location });
  if (type) filters.push({ cardTypeId: type });
  const client = sp.get('client') ?? '';
  const issuer = sp.get('issuer') ?? '';
  const order = sp.get('order') ?? '';
  const cardholder = sp.get('cardholder') ?? '';
  if (client) filters.push({ clientId: client });
  if (issuer) filters.push({ cardType: { issuerId: issuer } });
  if (cardholder) filters.push({ cardholderId: cardholder });
  if (order) filters.push({ orderLine: { orderId: order } });
  if (stale) {
    filters.push({
      OR: [
        { lastVerifiedAt: null },
        { lastVerifiedAt: { lt: new Date(Date.now() - DEFAULT_STALE_DAYS * 86_400_000) } },
      ],
    });
  }

  const cards = await prisma.card.findMany({
    where: filters.length > 0 ? { AND: filters } : {},
    include: {
      cardType: { include: { issuer: true } },
      location: true,
      client: true,
      cardholder: true,
      orderLine: { include: { order: { select: { reference: true } } } },
    },
    orderBy: [{ location: { name: 'asc' } }, { serial: 'asc' }],
  });

  const csv = toCsv(
    [
      'Serial', 'Proxy', 'Card number (last 4)', 'Card type', 'Issuer', 'BIN', 'Currency',
      'Client', 'Client code', 'Location', 'Location code', 'Status', 'Batch', 'Order',
      'Cardholder', 'Cardholder ref', 'Rank', 'Issued to', 'Issue date', 'Delivered',
      'Registered', 'Expiry date', 'Disposed', 'Disposal reason',
      'Last verified', 'Verified by', 'Notes',
    ],
    cards.map((c) => [
      c.serial,
      c.proxy,
      c.maskedPan,
      c.cardType.name,
      c.cardType.issuer.name,
      c.cardType.bin,
      c.cardType.currency,
      c.client?.name ?? '',
      c.client?.code ?? '',
      c.location?.name ?? 'Unassigned',
      c.location?.code ?? '',
      c.status,
      c.batchRef,
      c.orderLine?.order.reference ?? '',
      c.cardholder ? `${c.cardholder.lastName}, ${c.cardholder.firstName}` : '',
      c.cardholder?.ref ?? '',
      c.cardholder?.rank ?? '',
      c.issuedTo,
      formatDate(c.issuedAt),
      formatDate(c.deliveredAt),
      formatDate(c.registeredAt),
      formatDate(c.expiryDate),
      formatDate(c.disposedAt),
      c.disposalReason,
      formatDate(c.lastVerifiedAt),
      c.lastVerifiedBy,
      c.notes,
    ]),
  );

  return csvResponse(`card-inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
