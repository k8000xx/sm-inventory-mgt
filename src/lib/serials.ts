/**
 * Card orders carry a serial range rather than a list, so the range has to be
 * expanded into individual serials on receipt.
 *
 * Serials are treated as an optional fixed prefix followed by a numeric tail of
 * fixed width — "54105000001001".."54105000002000", or "FAB-00001".."FAB-01000".
 * Leading zeros are significant and are preserved, and the arithmetic runs on
 * BigInt so a 19-digit serial does not lose its last digits to floating point.
 */

export const MAX_RANGE = 100_000;

export type RangeInfo = { prefix: string; width: number; from: bigint; to: bigint; count: number };

export type RangeResult = { ok: true; info: RangeInfo } | { ok: false; error: string };

export function parseSerialRange(startRaw: string, endRaw: string): RangeResult {
  const start = startRaw.trim();
  const end = endRaw.trim();

  if (!start || !end) return { ok: false, error: 'Both a start and an end serial are required.' };
  if (start.length !== end.length) {
    return {
      ok: false,
      error: `Start and end serials must be the same length ("${start}" is ${start.length}, "${end}" is ${end.length}).`,
    };
  }

  // The prefix is whatever the two share before the digits that actually vary.
  let common = 0;
  while (common < start.length && start[common] === end[common]) common += 1;

  // Walk back so the whole numeric tail is treated as the counter, not just the
  // digits that happen to differ: 1099 -> 1100 shares only "1".
  let split = common;
  while (split > 0 && /\d/.test(start[split - 1])) split -= 1;

  const prefix = start.slice(0, split);
  const startTail = start.slice(split);
  const endTail = end.slice(split);

  if (!startTail || !/^\d+$/.test(startTail) || !/^\d+$/.test(endTail)) {
    return {
      ok: false,
      error: 'Serials must end in digits, with any non-numeric prefix identical on both ends.',
    };
  }

  const from = BigInt(startTail);
  const to = BigInt(endTail);

  if (to < from) return { ok: false, error: 'The end serial is lower than the start serial.' };

  const count = to - from + 1n;
  if (count > BigInt(MAX_RANGE)) {
    return {
      ok: false,
      error: `That range covers ${count.toLocaleString('en-US')} cards; the limit per line is ${MAX_RANGE.toLocaleString('en-US')}. Split it across several lines.`,
    };
  }

  return { ok: true, info: { prefix, width: startTail.length, from, to, count: Number(count) } };
}

/** Render one serial at an offset from the range start. */
export function serialAt(info: RangeInfo, offset: number): string {
  return info.prefix + (info.from + BigInt(offset)).toString().padStart(info.width, '0');
}

/** Expand a parsed range, optionally only part of it. */
export function expandRange(info: RangeInfo, offset = 0, limit?: number): string[] {
  const take = Math.min(limit ?? info.count - offset, info.count - offset);
  const out: string[] = [];
  for (let i = 0; i < take; i += 1) out.push(serialAt(info, offset + i));
  return out;
}

/** Quantity implied by a range, or null when the range does not parse. */
export function rangeCount(start: string, end: string): number | null {
  const parsed = parseSerialRange(start, end);
  return parsed.ok ? parsed.info.count : null;
}
