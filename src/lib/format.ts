export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(value);
}
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
export function tripDifference(loaded: number, delivered: number): number {
  return Number((loaded - delivered).toFixed(2));
}
export function shortageStatus(loaded: number, delivered: number, tolerance: number): "Normal" | "Needs verification" | "Confirmed shortage" {
  const difference = tripDifference(loaded, delivered);
  if (difference <= tolerance) return "Normal";
  if (difference <= tolerance * 2) return "Needs verification";
  return "Confirmed shortage";
}
