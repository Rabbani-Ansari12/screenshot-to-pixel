/** Deterministic helpers so the mock data is identical on server and client renders. */

export const TODAY = "2026-11-10";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number) {
  const next = mulberry32(seed);
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number, digits = 2) => round(next() * (max - min) + min, digits),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p: number) => next() < p,
  };
}

export function round(value: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function pad(value: number, size: number) {
  return String(value).padStart(size, "0");
}

/** Add days to a yyyy-MM-dd date and return yyyy-MM-dd. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Build an IST date-time string. */
export function at(date: string, hour: number, minute: number) {
  return `${date.slice(0, 10)}T${pad(hour, 2)}:${pad(minute, 2)}:00+05:30`;
}

export function byId<T extends { id: string }>(items: readonly T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Mock data missing: ${label}`);
  return value;
}
