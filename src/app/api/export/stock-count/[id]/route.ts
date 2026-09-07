import { prisma } from '@/lib/db';
import { csvResponse, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: { location: true, lines: { orderBy: [{ result: 'asc' }, { serial: 'asc' }] } },
  });
  if (!count) return new Response('Stock count not found', { status: 404 });

  const locations = await prisma.location.findMany({ select: { id: true, name: true } });
  const locationName = new Map(locations.map((l) => [l.id, l.name]));

  const csv = toCsv(
    ['Reference', 'Location', 'Count date', 'Counted by', 'Serial', 'Result', 'System status', 'System location', 'Action taken'],
    count.lines.map((l) => [
      count.reference,
      count.location.name,
      formatDate(count.countDate),
      count.countedBy,
      l.serial,
      l.result,
      l.systemStatus,
      l.systemLocationId ? locationName.get(l.systemLocationId) ?? '' : '',
      l.resolution,
    ]),
  );

  return csvResponse(`${count.reference}.csv`, csv);
}
