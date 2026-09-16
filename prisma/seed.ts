import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

async function main() {
  const existing = await prisma.card.count();
  if (existing > 0) {
    console.log(`Database already holds ${existing} cards — leaving it alone.`);
    console.log('To reseed from scratch: npm run db:reset');
    return;
  }

  // ---- issuers -------------------------------------------------------------
  const [monavate, fab] = await Promise.all([
    prisma.issuer.create({
      data: { code: 'MONAVATE', name: 'Monavate', description: 'Primary programme issuer.', contactName: 'Programme Desk' },
    }),
    prisma.issuer.create({
      data: { code: 'FAB', name: 'First Abu Dhabi Bank', description: 'Middle East issuing partner.', contactName: 'Cards Operations' },
    }),
  ]);

  // ---- card types ----------------------------------------------------------
  const cardTypes = await Promise.all([
    prisma.cardType.create({
      data: { code: 'MON-USD-RLD', name: 'Monavate USD Reloadable', issuerId: monavate.id, bin: '541050', currency: 'USD', description: 'Standard crew payroll card.' },
    }),
    prisma.cardType.create({
      data: { code: 'MON-EUR-RLD', name: 'Monavate EUR Reloadable', issuerId: monavate.id, bin: '541051', currency: 'EUR', description: 'European fleet payroll card.' },
    }),
    prisma.cardType.create({
      data: { code: 'FAB-USD-RLD', name: 'FAB USD Reloadable', issuerId: fab.id, bin: '462201', currency: 'USD', description: 'Middle East crew payroll card.' },
    }),
  ]);
  const [monUsd, monEur, fabUsd] = cardTypes;

  // ---- clients -------------------------------------------------------------
  const [oceanic, nordline] = await Promise.all([
    prisma.client.create({
      data: { code: 'OCEANIC', name: 'Oceanic Shipping Ltd', country: 'Singapore', contactName: 'Crewing Manager', contactEmail: 'crewing@example.com' },
    }),
    prisma.client.create({
      data: { code: 'NORDLINE', name: 'Nordline Tankers AS', country: 'Norway', contactName: 'Fleet Personnel', contactEmail: 'personnel@example.com' },
    }),
  ]);

  // ---- locations -----------------------------------------------------------
  const hq = await prisma.location.create({
    data: { code: 'HQ-MNL', name: 'Manila Head Office', type: 'OFFICE', region: 'Asia Pacific', contactName: 'Crewing Desk', reorderPoint: 200, countIntervalDays: 30 },
  });
  const warehouse = await prisma.location.create({
    data: { code: 'WH-SIN', name: 'Singapore Warehouse', type: 'WAREHOUSE', region: 'Asia Pacific', contactName: 'Logistics', reorderPoint: 500, countIntervalDays: 30 },
  });
  const aurora = await prisma.location.create({
    data: { code: 'MV-AURORA', name: 'MV Aurora', type: 'VESSEL', region: 'Asia Pacific', vesselImo: '9312345', clientId: oceanic.id, contactName: 'Chief Officer', reorderPoint: 20, countIntervalDays: 90 },
  });
  const coral = await prisma.location.create({
    data: { code: 'MV-CORAL', name: 'MV Coral Star', type: 'VESSEL', region: 'Middle East', vesselImo: '9412346', clientId: oceanic.id, contactName: 'Master', reorderPoint: 20, countIntervalDays: 90 },
  });
  const nordic = await prisma.location.create({
    data: { code: 'MV-NORDIC', name: 'MV Nordic Wind', type: 'VESSEL', region: 'North Europe', vesselImo: '9512347', clientId: nordline.id, contactName: 'Chief Officer', reorderPoint: 15, countIntervalDays: 120 },
  });
  await prisma.location.create({
    data: { code: 'AG-DXB', name: 'Dubai Agent', type: 'AGENT', region: 'Middle East', contactName: 'Port Agent', countIntervalDays: 180 },
  });

  // ---- cardholders ---------------------------------------------------------
  const crewSeed = [
    ['CRW-04821', 'Antonio', 'Santos', 'Master', 'Philippines', oceanic.id, aurora.id],
    ['CRW-04822', 'Ramon', 'Dela Cruz', 'Chief Officer', 'Philippines', oceanic.id, aurora.id],
    ['CRW-04823', 'Maria', 'Reyes', 'Second Officer', 'Philippines', oceanic.id, aurora.id],
    ['CRW-04824', 'Jose', 'Bautista', 'Chief Engineer', 'Philippines', oceanic.id, coral.id],
    ['CRW-04825', 'Lucia', 'García', 'Third Officer', 'Spain', oceanic.id, coral.id],
    ['NRD-1001', 'Petr', 'Novak', 'Master', 'Czechia', nordline.id, nordic.id],
    ['NRD-1002', 'Tove', 'Larsen', 'Chief Officer', 'Norway', nordline.id, nordic.id],
    ['NRD-1003', 'Sami', 'Ahmed', 'Bosun', 'Egypt', nordline.id, nordic.id],
  ] as const;

  const cardholders = await Promise.all(
    crewSeed.map(([ref, firstName, lastName, rank, nationality, clientId, locationId]) =>
      prisma.cardholder.create({ data: { ref, firstName, lastName, rank, nationality, clientId, locationId } }),
    ),
  );

  // ---- a received order, which is how the stock below got here -------------
  const order = await prisma.cardOrder.create({
    data: {
      reference: 'ORD-OCEANIC-OPENING',
      clientId: oceanic.id,
      issuerId: monavate.id,
      deliverToLocationId: warehouse.id,
      status: 'RECEIVED',
      orderedAt: ago(210),
      receivedAt: ago(180),
      placedBy: 'HQ',
      notes: 'Opening stock for the demo data set.',
    },
  });

  // ---- an open order, so the incoming pipeline is not empty ----------------
  await prisma.cardOrder.create({
    data: {
      reference: 'ORD-NORDLINE-2026Q4',
      clientId: nordline.id,
      issuerId: fab.id,
      deliverToLocationId: warehouse.id,
      status: 'IN_PRODUCTION',
      orderedAt: ago(20),
      expectedAt: ahead(25),
      placedBy: 'HQ',
      notes: 'Awaiting production. Receive it to inject the cards into inventory.',
      lines: {
        create: [
          { cardTypeId: fabUsd.id, serialStart: '4622010000005001', serialEnd: '4622010000005500', quantity: 500, batchRef: 'B-FAB-Q4', expiryDate: ahead(1460) },
          { cardTypeId: monEur.id, serialStart: '5410510000002001', serialEnd: '5410510000002200', quantity: 200, batchRef: 'B-MON-EUR', expiryDate: ahead(1460) },
        ],
      },
    },
  });

  // ---- opening stock -------------------------------------------------------
  const plan: {
    location: { id: string };
    client: { id: string };
    type: { id: string };
    count: number;
    status: string;
    verifiedDaysAgo: number | null;
    prefix: string;
    holderPool?: typeof cardholders;
  }[] = [
    { location: warehouse, client: oceanic, type: monUsd, count: 420, status: 'IN_STOCK', verifiedDaysAgo: 12, prefix: '54105' },
    { location: warehouse, client: nordline, type: monEur, count: 150, status: 'IN_STOCK', verifiedDaysAgo: 12, prefix: '54106' },
    { location: hq, client: oceanic, type: monUsd, count: 180, status: 'IN_STOCK', verifiedDaysAgo: 8, prefix: '54107' },
    { location: hq, client: nordline, type: monEur, count: 90, status: 'IN_STOCK', verifiedDaysAgo: 8, prefix: '54108' },
    { location: aurora, client: oceanic, type: monUsd, count: 34, status: 'IN_STOCK', verifiedDaysAgo: 40, prefix: '54109' },
    { location: aurora, client: oceanic, type: monUsd, count: 22, status: 'ISSUED', verifiedDaysAgo: 40, prefix: '54110', holderPool: cardholders.slice(0, 3) },
    { location: aurora, client: oceanic, type: monUsd, count: 18, status: 'REGISTERED', verifiedDaysAgo: 40, prefix: '54111', holderPool: cardholders.slice(0, 3) },
    { location: coral, client: oceanic, type: monUsd, count: 11, status: 'IN_STOCK', verifiedDaysAgo: 150, prefix: '54112' },
    { location: coral, client: oceanic, type: monUsd, count: 26, status: 'REGISTERED', verifiedDaysAgo: 150, prefix: '54113', holderPool: cardholders.slice(3, 5) },
    { location: coral, client: oceanic, type: monUsd, count: 3, status: 'LOST', verifiedDaysAgo: null, prefix: '54114' },
    { location: nordic, client: nordline, type: monEur, count: 40, status: 'IN_STOCK', verifiedDaysAgo: null, prefix: '54115' },
    { location: nordic, client: nordline, type: monEur, count: 15, status: 'REGISTERED', verifiedDaysAgo: null, prefix: '54116', holderPool: cardholders.slice(5) },
  ];

  let seq = 1000;
  const cardRows: Record<string, unknown>[] = [];

  for (const entry of plan) {
    for (let i = 0; i < entry.count; i += 1) {
      seq += 1;
      const issued = entry.status === 'ISSUED' || entry.status === 'REGISTERED';
      const holder = entry.holderPool?.[seq % entry.holderPool.length];

      cardRows.push({
        serial: `${entry.prefix}${String(seq).padStart(9, '0')}`,
        cardTypeId: entry.type.id,
        clientId: entry.client.id,
        locationId: entry.location.id,
        cardholderId: issued && holder ? holder.id : null,
        orderLineId: null,
        status: entry.status,
        batchRef: `B-${entry.prefix}`,
        maskedPan: String(1000 + (seq % 9000)),
        expiryDate: ahead(200 + (seq % 900)),
        issuedTo: issued && holder ? `${holder.firstName} ${holder.lastName}` : null,
        issuedAt: issued ? ago(30 + (seq % 120)) : null,
        registeredAt: entry.status === 'REGISTERED' ? ago(20 + (seq % 90)) : null,
        deliveredAt: entry.location.id !== warehouse.id && entry.location.id !== hq.id ? ago(60 + (seq % 60)) : null,
        lastVerifiedAt: entry.verifiedDaysAgo === null ? null : ago(entry.verifiedDaysAgo),
        lastVerifiedBy: entry.verifiedDaysAgo === null ? null : 'Stock count',
      });
    }
  }

  await prisma.card.createMany({ data: cardRows as never });

  const cards = await prisma.card.findMany({ select: { id: true, locationId: true, status: true, lastVerifiedAt: true } });
  await prisma.movement.createMany({
    data: cards.map((c) => ({
      cardId: c.id,
      type: 'ORDER_RECEIPT',
      toLocationId: c.locationId,
      toStatus: c.status,
      actor: 'Seed data',
      reference: order.reference,
      cardOrderId: order.id,
      notes: 'Opening balance loaded with the demo data set.',
      occurredAt: c.lastVerifiedAt ?? ago(180),
    })),
  });

  // A handful nearing expiry, so the dashboard panel is not empty.
  const soon = cards.slice(0, 6).map((c) => c.id);
  await prisma.card.updateMany({ where: { id: { in: soon } }, data: { expiryDate: ahead(45) } });

  console.log(
    `Seeded 2 issuers, ${cardTypes.length} card types, 2 clients, 6 locations, ` +
      `${cardholders.length} cardholders, 2 orders and ${cardRows.length} cards.`,
  );
  console.log('Try: receive order ORD-NORDLINE-2026Q4 to inject 700 more cards into inventory.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
