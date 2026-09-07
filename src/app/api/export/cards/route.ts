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
    include: { cardType: true, location: true },
    orderBy: [{ location: { name: 'asc' } }, { serial: 'asc' }],
  });

  const csv = toCsv(
    [
      'Serial', 'Proxy', 'Card number (last 4)', 'Card type', 'Currency', 'Location', 'Location code',
      'Status', 'Batch', 'Issued to', 'Issue date', 'Activation date', 'Expiry date',
      'Last verified', 'Verified by', 'Notes',
    ],
    cards.map((c) => [
      c.serial,
      c.proxy,
      c.maskedPan,
      c.cardType.name,
      c.cardType.currency,
      c.location?.name ?? 'Unassigned',
      c.location?.code ?? '',
      c.status,
      c.batchRef,
      c.issuedTo,
      formatDate(c.issuedAt),
      formatDate(c.activatedAt),
      formatDate(c.expiryDate),
      formatDate(c.lastVerifiedAt),
      c.lastVerifiedBy,
      c.notes,
    ]),
  );

  return csvResponse(`card-inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
