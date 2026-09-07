import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

async function main() {
  const existing = await prisma.card.count();
  if (existing > 0) {
    console.log(`Database already holds ${existing} cards — leaving it alone.`);
    console.log('To reseed from scratch, delete prisma/dev.db and run: npm run setup');
    return;
  }

  const cardTypes = await Promise.all(
    [
      { code: 'USD-RELOAD', name: 'USD Reloadable Card', currency: 'USD', description: 'Standard crew payroll card.' },
      { code: 'USD-GIFT', name: 'USD Non-Reloadable Card', currency: 'USD', description: 'Single-load card for shore allowances.' },
      { code: 'EUR-RELOAD', name: 'EUR Reloadable Card', currency: 'EUR', description: 'European fleet payroll card.' },
    ].map((data) => prisma.cardType.create({ data })),
  );

  const locations = await Promise.all(
    [
      { code: 'HQ-MNL', name: 'Manila Head Office', type: 'OFFICE', region: 'Asia Pacific', contactName: 'Crewing Desk', reorderPoint: 200, countIntervalDays: 30 },
      { code: 'WH-SIN', name: 'Singapore Warehouse', type: 'WAREHOUSE', region: 'Asia Pacific', contactName: 'Logistics', reorderPoint: 500, countIntervalDays: 30 },
      { code: 'MV-AURORA', name: 'MV Aurora', type: 'VESSEL', region: 'Asia Pacific', vesselImo: '9312345', contactName: 'Chief Officer', reorderPoint: 20, countIntervalDays: 90 },
      { code: 'MV-CORAL', name: 'MV Coral Star', type: 'VESSEL', region: 'Middle East', vesselImo: '9412346', contactName: 'Master', reorderPoint: 20, countIntervalDays: 90 },
      { code: 'MV-NORDIC', name: 'MV Nordic Wind', type: 'VESSEL', region: 'North Europe', vesselImo: '9512347', contactName: 'Chief Officer', reorderPoint: 15, countIntervalDays: 120 },
      { code: 'AG-DXB', name: 'Dubai Agent', type: 'AGENT', region: 'Middle East', contactName: 'Port Agent', reorderPoint: 0, countIntervalDays: 180 },
    ].map((data) => prisma.location.create({ data })),
  );

  const [hq, warehouse, aurora, coral, nordic, agent] = locations;

  // A spread that gives the dashboard something honest to show: healthy stock
  // at the hub, a vessel below its reorder point, and one that has not been
  // physically counted in a long time.
  const plan: {
    location: (typeof locations)[number];
    type: (typeof cardTypes)[number];
    count: number;
    status: string;
    verifiedDaysAgo: number | null;
    prefix: string;
  }[] = [
    { location: warehouse, type: cardTypes[0], count: 420, status: 'IN_STOCK', verifiedDaysAgo: 12, prefix: '54101' },
    { location: warehouse, type: cardTypes[1], count: 150, status: 'IN_STOCK', verifiedDaysAgo: 12, prefix: '54102' },
    { location: hq, type: cardTypes[0], count: 180, status: 'IN_STOCK', verifiedDaysAgo: 8, prefix: '54103' },
    { location: hq, type: cardTypes[2], count: 90, status: 'IN_STOCK', verifiedDaysAgo: 8, prefix: '54104' },
    { location: aurora, type: cardTypes[0], count: 34, status: 'IN_STOCK', verifiedDaysAgo: 40, prefix: '54105' },
    { location: aurora, type: cardTypes[0], count: 22, status: 'ISSUED', verifiedDaysAgo: 40, prefix: '54106' },
    { location: aurora, type: cardTypes[0], count: 18, status: 'ACTIVATED', verifiedDaysAgo: 40, prefix: '54107' },
    { location: coral, type: cardTypes[0], count: 11, status: 'IN_STOCK', verifiedDaysAgo: 150, prefix: '54108' },
    { location: coral, type: cardTypes[0], count: 26, status: 'ACTIVATED', verifiedDaysAgo: 150, prefix: '54109' },
    { location: coral, type: cardTypes[0], count: 3, status: 'LOST', verifiedDaysAgo: null, prefix: '54110' },
    { location: nordic, type: cardTypes[2], count: 40, status: 'IN_STOCK', verifiedDaysAgo: null, prefix: '54111' },
    { location: nordic, type: cardTypes[2], count: 15, status: 'ISSUED', verifiedDaysAgo: null, prefix: '54112' },
    { location: agent, type: cardTypes[1], count: 25, status: 'IN_TRANSIT', verifiedDaysAgo: null, prefix: '54113' },
  ];

  let serialSeed = 1000;
  const cardRows: {
    serial: string;
    cardTypeId: string;
    locationId: string;
    status: string;
    batchRef: string;
    maskedPan: string;
    expiryDate: Date;
    issuedTo: string | null;
    issuedAt: Date | null;
    activatedAt: Date | null;
    lastVerifiedAt: Date | null;
    lastVerifiedBy: string | null;
  }[] = [];

  const crew = ['A. Santos', 'R. Dela Cruz', 'M. Reyes', 'J. Bautista', 'L. García', 'P. Novak', 'S. Ahmed', 'T. Larsen'];

  for (const entry of plan) {
    for (let i = 0; i < entry.count; i += 1) {
      serialSeed += 1;
      const serial = `${entry.prefix}${String(serialSeed).padStart(9, '0')}`;
      const issued = entry.status === 'ISSUED' || entry.status === 'ACTIVATED';

      cardRows.push({
        serial,
        cardTypeId: entry.type.id,
        locationId: entry.location.id,
        status: entry.status,
        batchRef: `B-${entry.prefix}`,
        maskedPan: String(1000 + (serialSeed % 9000)),
        expiryDate: ahead(200 + (serialSeed % 900)),
        issuedTo: issued ? crew[serialSeed % crew.length] : null,
        issuedAt: issued ? ago(30 + (serialSeed % 120)) : null,
        activatedAt: entry.status === 'ACTIVATED' ? ago(20 + (serialSeed % 90)) : null,
        lastVerifiedAt: entry.verifiedDaysAgo === null ? null : ago(entry.verifiedDaysAgo),
        lastVerifiedBy: entry.verifiedDaysAgo === null ? null : 'Stock count',
      });
    }
  }

  await prisma.card.createMany({ data: cardRows });
  const cards = await prisma.card.findMany({ select: { id: true, locationId: true, status: true, lastVerifiedAt: true } });

  await prisma.movement.createMany({
    data: cards.map((c) => ({
      cardId: c.id,
      type: 'RECEIPT',
      toLocationId: c.locationId,
      toStatus: c.status,
      actor: 'Seed data',
      reference: 'OPENING-BALANCE',
      notes: 'Opening balance loaded with the demo data set.',
      occurredAt: c.lastVerifiedAt ?? ago(200),
    })),
  });

  // A handful of cards nearing expiry, so the dashboard panel is not empty.
  const soon = cards.slice(0, 6).map((c) => c.id);
  await prisma.card.updateMany({ where: { id: { in: soon } }, data: { expiryDate: ahead(45) } });

  console.log(`Seeded ${cardTypes.length} card types, ${locations.length} locations, ${cardRows.length} cards.`);
  console.log('Sample spreadsheet for the importer: sample-data/vessel-report.xlsx');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
