import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { CARD_STATUSES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * A blank workbook shaped the way the importer expects, pre-filled with the
 * location and card-type codes this system actually knows about — so a vessel
 * fills it in using vocabulary the import will recognise.
 */
export async function GET() {
  const [locations, cardTypes, clients] = await Promise.all([
    prisma.location.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.cardType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Prepaid Card Inventory';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Cards');
  sheet.columns = [
    { header: 'Card Serial', key: 'serial', width: 24 },
    { header: 'Proxy Number', key: 'proxy', width: 20 },
    { header: 'Card Type', key: 'cardType', width: 24 },
    { header: 'Client', key: 'client', width: 26 },
    { header: 'Location', key: 'location', width: 26 },
    { header: 'Crew Reference', key: 'crewRef', width: 18 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Batch Ref', key: 'batch', width: 18 },
    { header: 'Issued To', key: 'issuedTo', width: 24 },
    { header: 'Issue Date', key: 'issuedAt', width: 14 },
    { header: 'Registration Date', key: 'registeredAt', width: 18 },
    { header: 'Expiry Date', key: 'expiryDate', width: 14 },
    { header: 'Remarks', key: 'notes', width: 32 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Serials must arrive as text: Excel silently rounds long numbers.
  sheet.getColumn('serial').numFmt = '@';
  sheet.getColumn('proxy').numFmt = '@';
  sheet.getColumn('crewRef').numFmt = '@';
  for (const key of ['issuedAt', 'registeredAt', 'expiryDate']) {
    sheet.getColumn(key).numFmt = 'dd/mm/yyyy';
  }

  const reference = wb.addWorksheet('Reference');
  reference.columns = [
    { header: 'Valid statuses', key: 'status', width: 22 },
    { header: 'Client codes', key: 'clientCode', width: 22 },
    { header: 'Client names', key: 'clientName', width: 30 },
    { header: 'Location codes', key: 'locCode', width: 22 },
    { header: 'Location names', key: 'locName', width: 30 },
    { header: 'Card type codes', key: 'typeCode', width: 24 },
    { header: 'Card type names', key: 'typeName', width: 30 },
  ];
  reference.getRow(1).font = { bold: true };

  const maxRows = Math.max(CARD_STATUSES.length, locations.length, cardTypes.length, clients.length);
  for (let i = 0; i < maxRows; i += 1) {
    reference.addRow({
      status: CARD_STATUSES[i] ?? '',
      clientCode: clients[i]?.code ?? '',
      clientName: clients[i]?.name ?? '',
      locCode: locations[i]?.code ?? '',
      locName: locations[i]?.name ?? '',
      typeCode: cardTypes[i]?.code ?? '',
      typeName: cardTypes[i]?.name ?? '',
    });
  }

  const notes = wb.addWorksheet('How to use');
  notes.columns = [{ header: 'Instructions', key: 'text', width: 110 }];
  notes.getRow(1).font = { bold: true };
  for (const line of [
    'One row per physical card. The Card Serial column is required and must be unique.',
    'Format Card Serial and Proxy Number as Text before typing. Excel rounds numbers longer than 15 digits, which corrupts serials.',
    'Location and Card Type are matched against the codes or names on the Reference sheet. Spelling must match.',
    'Status accepts the values on the Reference sheet, and common wording such as "available", "in transit" or "missing".',
    'A Registration Date makes the card registered, which removes it from available stock whatever the Status column says.',
    'Crew Reference links the card to an existing cardholder record for that client.',
    'Dates may be typed as real dates or as text. Tell the importer whether text dates are day-first or month-first.',
    'Leave a cell blank to leave that field unchanged for a card the system already knows.',
    'Never include the full card number. Only the last 4 digits are stored, and the rest is discarded on import.',
    'Extra columns are ignored, so you can keep your own working columns in the sheet.',
  ]) {
    notes.addRow({ text: line });
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="card-inventory-template.xlsx"',
    },
  });
}
