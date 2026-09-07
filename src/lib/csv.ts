/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    // A leading =, +, - or @ makes Excel treat the cell as a formula.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
}

export function csvResponse(filename: string, body: string): Response {
  // The BOM makes Excel open UTF-8 correctly on Windows.
  return new Response(`﻿${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
