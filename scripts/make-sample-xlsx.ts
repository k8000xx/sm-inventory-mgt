/**
 * Builds a sample vessel report for trying the importer. It is deliberately
 * untidy — a title block above the header row, non-obvious column names, text
 * dates, mixed-case statuses — because that is what real reports look like.
 *
 * Run with: npx tsx scripts/make-sample-xlsx.ts
 */
import { mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const aurora = await prisma.location.findUnique({ where: { code: 'MV-AURORA' } });
  if (!aurora) throw new Error('Run the seed first: npm run db:seed');

  // Existing cards, so the sample shows updates as well as new stock.
  const existing = await prisma.card.findMany({
    where: { locationId: aurora.id, status: 'IN_STOCK' },
    take: 14,
    orderBy: { serial: 'asc' },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Card Report');

  sheet.addRow(['MV AURORA — MONTHLY PREPAID CARD REPORT']);
  sheet.addRow(['Prepared by: Chief Officer', '', 'As at: 30/06/2026']);
  sheet.addRow([]);
  sheet.getRow(1).font = { bold: true, size: 13 };

  const header = ['Card Serial No.', 'Card Product', 'Vessel / Office', 'Card Status', 'Crew Name', 'Date Issued', 'Valid Thru', 'Batch', 'Remarks'];
  sheet.addRow(header).font = { bold: true };

  // Existing cards handed out to crew since the last report.
  const crew = ['A. Santos', 'R. Dela Cruz', 'M. Reyes', 'J. Bautista', 'L. García', 'P. Novak'];
  existing.slice(0, 6).forEach((card, i) => {
    sheet.addRow([
      card.serial,
      'USD Reloadable Card',
      'MV Aurora',
      'Issued',
      crew[i],
      '15/06/2026',
      '31/12/2028',
      card.batchRef ?? 'B-54105',
      'Handed over at crew change',
    ]);
  });

  // Existing cards still sitting in the safe.
  existing.slice(6, 10).forEach((card) => {
    sheet.addRow([card.serial, 'USD Reloadable Card', 'MV Aurora', 'available', '', '', '31/12/2028', card.batchRef ?? 'B-54105', '']);
  });

  // One that went missing — a status the importer normalises to LOST.
  if (existing[10]) {
    sheet.addRow([existing[10].serial, 'USD Reloadable Card', 'MV Aurora', 'MISSING', '', '', '31/12/2028', existing[10].batchRef ?? 'B-54105', 'Not found during safe check']);
  }

  // New stock received on board that HQ has not recorded yet.
  for (let i = 1; i <= 8; i += 1) {
    sheet.addRow([
      `54999${String(700000 + i).padStart(9, '0')}`,
      'USD Reloadable Card',
      'MV Aurora',
      'In Stock',
      '',
      '',
      '30/06/2029',
      'B-54999',
      'Received from Singapore Warehouse',
    ]);
  }

  // A row for a location the system does not know about, to exercise the
  // "create locations found in the file" option and the error path when it is off.
  sheet.addRow(['54999700000099', 'USD Reloadable Card', 'MV Southern Cross', 'In Stock', '', '', '30/06/2029', 'B-54999', 'Transferred to sister vessel']);

  // A row with no serial, which the importer should skip rather than choke on.
  sheet.addRow(['', 'USD Reloadable Card', 'MV Aurora', 'In Stock', '', '', '', '', 'Damaged in transit — serial unreadable']);

  sheet.getColumn(1).numFmt = '@';
  sheet.columns.forEach((c) => { c.width = 22; });

  mkdirSync('sample-data', { recursive: true });
  await wb.xlsx.writeFile('sample-data/vessel-report.xlsx');
  console.log('Wrote sample-data/vessel-report.xlsx');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
