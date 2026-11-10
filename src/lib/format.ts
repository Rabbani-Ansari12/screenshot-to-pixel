const TZ = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inr2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹12,34,567 (Indian digit grouping). */
export function formatINR(value: number, opts: { paise?: boolean } = {}): string {
  return (opts.paise ? inr2 : inr).format(Math.round(value * 100) / 100);
}

/** ₹12.4 L / ₹1.24 Cr / ₹48,200 — for KPI tiles and chart axes. */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** 28.40 MT · 6.5 Brass · 4 Trips */
export function formatQty(value: number, unit: string, digits?: number): string {
  const d = digits ?? (unit === "Trips" || unit === "Nos" || unit === "Bags" ? 0 : 2);
  return `${formatNumber(value, d)} ${unit}`;
}

export function formatSigned(value: number, unit = "", digits = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${formatNumber(Math.abs(value), digits)}${unit ? ` ${unit}` : ""}`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

function toDate(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value);
}

/** 09 Nov 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(toDate(value));
}

/** 09 Nov 2026, 10:42 am */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** 10:42 am */
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  }).format(toDate(value));
}

/** Nov 2026 */
export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: TZ }).format(
    toDate(value.length === 7 ? `${value}-01` : value),
  );
}

/** "5 min ago", "yesterday", or a date. Relative to the demo's fixed "now". */
export function formatRelative(value: string, now = DEMO_NOW): string {
  const diff = (Date.parse(now) - Date.parse(value)) / 60_000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)} h ago`;
  if (diff < 60 * 48) return "yesterday";
  if (diff < 60 * 24 * 7) return `${Math.round(diff / 1440)} days ago`;
  return formatDate(value);
}

/** The mock data is anchored to this moment (IST). */
export const DEMO_NOW = "2026-11-10T12:30:00+05:30";
export const DEMO_TODAY = "2026-11-10";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  return `${TENS[Math.floor(n / 10)] ?? ""}${n % 10 ? ` ${ONES[n % 10] ?? ""}` : ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h] ?? ""} Hundred` : "", rest ? twoDigits(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Only" (Indian numbering). */
export function rupeesInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Rupees Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `Rupees ${parts.join(" ")} Only`;
}
