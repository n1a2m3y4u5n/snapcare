/**
 * `SC1*W*` — the lossless schedule form.
 *
 * `protocol.ts` in the web app already encodes `SC1*S*`, which carries tray
 * numbers and times and nothing else. That is enough for the compatibility
 * `/save` URL and not enough for a prescription: a Mon/Wed/Fri course sent as
 * `SC1*S*` dispenses on four days nobody asked for, and a 30-day course runs
 * until the tray is empty.
 *
 * `SC1*W*` adds the two missing fields, in fixed three-digit widths so that
 * 8-bit firmware can read them with pointer arithmetic instead of a tokenizer,
 * and entirely inside the QR alphanumeric set — straying out of it costs 8 bits
 * a character instead of 5.5, which is what stops a code fitting.
 *
 *     SC1*W*1:0800.2000-127-030/3:1900-021-000
 *            └tray └times    └days └course length (0 = ongoing)
 *
 * Mirrors `encode_weekly` / `decode_weekly` in `snapcare_dispenser/sc1.py`, and
 * is cross-checked against it by the golden vectors in the tests.
 */

import { EVERY_DAY, type WeeklySlot } from './types.ts';

const PROTOCOL = 'SC1';
const SEP = '*';
const SLOT_SEP = '/';
const TIME_SEP = '.';
const ATTR_SEP = '-';

/** 1–8. Above that the device refuses the schedule by name. */
export const MAX_TRAYS = 8;
/**
 * Times per tray.
 *
 * **Six, because `sc1.py` in the firmware is six.** This was 8, and the
 * mismatch was silent in the worst way: a seven-times-a-day course passed
 * `normaliseSlots`, encoded, was stored by the relay and returned a revision —
 * and then the device's `decode_weekly` returned null and `apply_payload`
 * refused **the whole schedule**, while the app showed a success. Every other
 * tray in that payload stopped being dispensed too.
 *
 * This file's promise is that a schedule the device will refuse fails here
 * first, where somebody is still looking at the screen that sent it.
 */
export const MAX_TIMES = 6;
/** Course length is three digits, so this is the ceiling. 0 means ongoing. */
export const MAX_DURATION_DAYS = 999;

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

/** `'08:00'`, `'8:00'`, `'0800'` → minutes past midnight. Null if unreadable. */
export function parseHhmm(text: string): number | null {
  const cleaned = text.trim().replace(':', '');
  if (!/^\d{3,4}$/.test(cleaned)) return null;
  const padded = cleaned.padStart(4, '0');
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes past midnight → `'0800'`. */
export function formatHhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  return String(hours).padStart(2, '0') + String(wrapped % 60).padStart(2, '0');
}

/**
 * Validate and canonicalise, the same way the device does.
 *
 * Worth calling before you send: the device applies exactly these rules and
 * refuses the whole schedule if any slot breaks one, so doing it here means
 * the person finds out while they are still looking at the form.
 */
export function normaliseSlots(slots: WeeklySlot[]): Required<WeeklySlot>[] {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new ScheduleError('a schedule needs at least one tray');
  }

  const byTray = new Map<number, Required<WeeklySlot>>();
  for (const slot of slots) {
    const tray = Number(slot.tray);
    if (!Number.isInteger(tray) || tray < 1 || tray > MAX_TRAYS) {
      throw new ScheduleError(`tray ${slot.tray} is not between 1 and ${MAX_TRAYS}`);
    }

    const days = slot.days === undefined ? EVERY_DAY : Number(slot.days);
    if (!Number.isInteger(days) || days < 1 || days > EVERY_DAY) {
      throw new ScheduleError(`tray ${tray}: days must be a bitmask of 1..${EVERY_DAY}`);
    }

    const durationDays = slot.durationDays === undefined ? 0 : Number(slot.durationDays);
    if (!Number.isInteger(durationDays) || durationDays < 0 || durationDays > MAX_DURATION_DAYS) {
      throw new ScheduleError(`tray ${tray}: durationDays must be 0..${MAX_DURATION_DAYS}`);
    }

    if (!Array.isArray(slot.times) || slot.times.length < 1) {
      throw new ScheduleError(`tray ${tray}: give it 1 to ${MAX_TIMES} times`);
    }

    const minutes: number[] = [];
    for (const raw of slot.times) {
      const parsed = parseHhmm(String(raw));
      if (parsed === null) throw new ScheduleError(`tray ${tray}: "${raw}" is not a time`);
      // A duplicate is **collapsed, not refused.** One tray cannot dispense
      // twice at one minute — physically, and because the firmware's high-water
      // mark is (day, minute), so the second would be suppressed on some paths
      // and honoured on others. One dose is the only reading that is true
      // everywhere, so it is the one every implementation of this format
      // settles on: sc1.py, this kit, the app's copy and Sc1.kt.
      //
      // This threw until the firmware stopped refusing them. A client that
      // throws where the device accepts is a client that refuses schedules the
      // machine would have run perfectly well.
      if (!minutes.includes(parsed)) minutes.push(parsed);
    }
    minutes.sort((a, b) => a - b);
    // The cap is on what is left after collapsing, which is what the firmware
    // counts. Checking the raw list instead would refuse seven entries that are
    // six doses — a payload the device takes.
    if (minutes.length > MAX_TIMES) {
      throw new ScheduleError(`tray ${tray}: give it 1 to ${MAX_TIMES} times`);
    }

    // Two entries for one tray are merged rather than refused, matching
    // `_collect` in sc1.py — but their days and duration must agree, because
    // there is one of each per tray on the wire.
    const existing = byTray.get(tray);
    if (existing) {
      if (existing.days !== days || existing.durationDays !== durationDays) {
        throw new ScheduleError(`tray ${tray} appears twice with different days or duration`);
      }
      const merged = [...new Set([...existing.times.map((t) => parseHhmm(t)!), ...minutes])];
      merged.sort((a, b) => a - b);
      if (merged.length > MAX_TIMES) {
        throw new ScheduleError(`tray ${tray}: more than ${MAX_TIMES} times once merged`);
      }
      existing.times = merged.map(formatHhmm);
    } else {
      byTray.set(tray, { tray, times: minutes.map(formatHhmm), days, durationDays });
    }
  }

  return [...byTray.values()].sort((a, b) => a.tray - b.tray);
}

/** `WeeklySlot[]` → `SC1*W*1:0800.2000-127-030/3:1900-021-000`. */
export function encodeWeekly(slots: WeeklySlot[]): string {
  const body = normaliseSlots(slots)
    .map((slot) =>
      [
        `${slot.tray}:${slot.times.join(TIME_SEP)}`,
        String(slot.days).padStart(3, '0'),
        String(Math.min(slot.durationDays, MAX_DURATION_DAYS)).padStart(3, '0'),
      ].join(ATTR_SEP),
    )
    .join(SLOT_SEP);
  return [PROTOCOL, 'W', body].join(SEP);
}

/**
 * The inverse. Null on anything malformed — like every decoder in this family,
 * it refuses rather than guessing.
 */
export function decodeWeekly(payload: string): Required<WeeklySlot>[] | null {
  const parts = payload.trim().toUpperCase().split(SEP);
  if (parts.length !== 3 || parts[0] !== PROTOCOL || parts[1] !== 'W') return null;

  const slots: WeeklySlot[] = [];
  for (const chunk of parts[2].split(SLOT_SEP)) {
    const bits = chunk.split(ATTR_SEP);
    if (bits.length !== 3) return null;

    const [head, daysText, durationText] = bits;
    const colon = head.indexOf(':');
    if (colon === -1) return null;

    const tray = Number(head.slice(0, colon));
    if (!Number.isInteger(tray)) return null;

    const times = head.slice(colon + 1).split(TIME_SEP);
    if (!/^\d{3}$/.test(daysText) || !/^\d{3}$/.test(durationText)) return null;

    const days = Number(daysText);
    if (days < 1 || days > EVERY_DAY) return null;

    slots.push({ tray, times, days, durationDays: Number(durationText) });
  }

  try {
    return normaliseSlots(slots);
  } catch {
    return null;
  }
}

/** Monday-first day names, for building a mask in a UI. */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** `[0, 2, 4]` (Mon, Wed, Fri) → `21`. */
export function daysToMask(dayIndexes: number[]): number {
  let mask = 0;
  for (const index of dayIndexes) {
    if (index < 0 || index > 6) throw new ScheduleError(`day ${index} is not 0..6`);
    mask |= 1 << index;
  }
  if (mask === 0) throw new ScheduleError('a schedule needs at least one day');
  return mask;
}

/** `21` → `[0, 2, 4]`. */
export function maskToDays(mask: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < 7; index += 1) if (mask & (1 << index)) out.push(index);
  return out;
}

/** `21` → `'Mon, Wed, Fri'`. `127` → `'every day'`. */
export function describeDays(mask: number): string {
  if (mask === EVERY_DAY) return 'every day';
  return maskToDays(mask)
    .map((index) => DAY_NAMES[index])
    .join(', ');
}
